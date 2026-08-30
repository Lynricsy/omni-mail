package com.omnimail.android.data.cache

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import com.omnimail.android.data.model.Attachment
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MessageDetail
import com.omnimail.android.data.model.MessageSummary
import com.omnimail.android.data.model.SessionUser
import com.omnimail.android.data.model.UpdateMessageRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Entity(
    tableName = "cached_messages",
    primaryKeys = ["accountKey", "id"],
    indices = [Index(value = ["accountKey", "date"])],
)
data class CachedMessageEntity(
    val accountKey: String,
    val id: String,
    val mailboxAddress: String,
    val direction: String,
    val status: String,
    val folder: String,
    val senderName: String,
    val senderAddress: String,
    val recipientsJson: String,
    val subject: String,
    val preview: String,
    val date: Long,
    val attachmentCount: Int,
    val isRead: Boolean,
    val isStarred: Boolean,
    val processingError: String?,
    val deliveryStatus: String?,
    val purgeAfter: Long?,
    val detailLoaded: Boolean = false,
    val messageId: String? = null,
    val inReplyTo: String? = null,
    val references: String? = null,
    val ccJson: String = "[]",
    val text: String = "",
    val html: String = "",
    val attachmentsJson: String = "[]",
)

@Entity(tableName = "cached_sessions")
data class CachedSessionEntity(
    @androidx.room.PrimaryKey val baseUrl: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val role: String,
    val canReply: Boolean,
    val appName: String,
    val replyEnabled: Boolean,
)

data class CachedSessionSnapshot(
    val baseUrl: String,
    val user: SessionUser,
    val appName: String,
    val replyEnabled: Boolean,
)

@Dao
interface CachedMessageDao {
    @Query("SELECT * FROM cached_messages WHERE accountKey = :accountKey ORDER BY date DESC")
    suspend fun messages(accountKey: String): List<CachedMessageEntity>

    @Query("SELECT * FROM cached_messages WHERE accountKey = :accountKey AND id = :id LIMIT 1")
    suspend fun message(accountKey: String, id: String): CachedMessageEntity?

    @Query("SELECT id FROM cached_messages WHERE accountKey = :accountKey")
    suspend fun ids(accountKey: String): List<String>

    @Upsert
    suspend fun upsert(message: CachedMessageEntity)

    @Query(
        "DELETE FROM cached_messages WHERE accountKey = :accountKey AND id NOT IN " +
            "(SELECT id FROM cached_messages WHERE accountKey = :accountKey ORDER BY date DESC LIMIT 200)",
    )
    suspend fun prune(accountKey: String)

    @Query("DELETE FROM cached_messages WHERE accountKey = :accountKey")
    suspend fun clear(accountKey: String)

    @Upsert
    suspend fun upsertSession(session: CachedSessionEntity)

    @Query("SELECT * FROM cached_sessions WHERE baseUrl = :baseUrl LIMIT 1")
    suspend fun session(baseUrl: String): CachedSessionEntity?

    @Query("DELETE FROM cached_sessions WHERE baseUrl = :baseUrl")
    suspend fun clearSession(baseUrl: String)
}

@Database(
    entities = [CachedMessageEntity::class, CachedSessionEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class MailCacheDatabase : RoomDatabase() {
    abstract fun messages(): CachedMessageDao

    companion object {
        @Volatile private var instance: MailCacheDatabase? = null

        fun get(context: Context): MailCacheDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                MailCacheDatabase::class.java,
                "omnimail-cache.db",
            ).build().also { instance = it }
        }
    }
}

data class CachedMailboxSnapshot(
    val messages: List<MessageSummary>,
    val allMessages: List<MessageSummary>,
)

class RoomMailCache(private val database: MailCacheDatabase) {
    private val dao = database.messages()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun storeMessages(accountKey: String, messages: List<MessageSummary>) {
        messages.forEach { summary ->
            val existing = dao.message(accountKey, summary.id)
            dao.upsert(summary.toEntity(accountKey, existing))
        }
        dao.prune(accountKey)
    }

    suspend fun storeDetail(accountKey: String, detail: MessageDetail) {
        dao.upsert(detail.toEntity(accountKey))
        dao.prune(accountKey)
    }

    suspend fun snapshot(
        accountKey: String,
        folder: MailFolder,
        query: String,
        scope: MailboxScope,
    ): CachedMailboxSnapshot {
        val all = dao.messages(accountKey).map { it.toSummary() }
        val filtered = filterCachedMessages(all, folder, query, scope)
        return CachedMailboxSnapshot(filtered, all)
    }

    suspend fun detail(accountKey: String, id: String): MessageDetail? =
        dao.message(accountKey, id)?.takeIf { it.detailLoaded }?.toDetail()

    suspend fun ids(accountKey: String): Set<String> = dao.ids(accountKey).toSet()

    suspend fun update(accountKey: String, id: String, update: UpdateMessageRequest) {
        val entity = dao.message(accountKey, id) ?: return
        dao.upsert(entity.copy(
            isRead = update.isRead ?: entity.isRead,
            isStarred = update.isStarred ?: entity.isStarred,
            folder = update.folder ?: entity.folder,
        ))
    }

    suspend fun remove(accountKey: String, id: String) {
        val entity = dao.message(accountKey, id) ?: return
        dao.upsert(entity.copy(folder = "deleted"))
    }

    suspend fun clear(accountKey: String) = dao.clear(accountKey)

    suspend fun storeSession(snapshot: CachedSessionSnapshot) {
        dao.upsertSession(CachedSessionEntity(
            baseUrl = snapshot.baseUrl,
            userId = snapshot.user.id,
            email = snapshot.user.email,
            displayName = snapshot.user.displayName,
            role = snapshot.user.role,
            canReply = snapshot.user.canReply,
            appName = snapshot.appName,
            replyEnabled = snapshot.replyEnabled,
        ))
    }

    suspend fun session(baseUrl: String): CachedSessionSnapshot? = dao.session(baseUrl)?.let {
        CachedSessionSnapshot(
            baseUrl = it.baseUrl,
            user = SessionUser(
                id = it.userId,
                email = it.email,
                displayName = it.displayName,
                role = it.role,
                canReply = it.canReply,
            ),
            appName = it.appName,
            replyEnabled = it.replyEnabled,
        )
    }

    suspend fun clearSession(baseUrl: String) = dao.clearSession(baseUrl)

    private fun MessageSummary.toEntity(
        accountKey: String,
        existing: CachedMessageEntity?,
    ) = CachedMessageEntity(
        accountKey = accountKey,
        id = id,
        mailboxAddress = mailboxAddress,
        direction = direction,
        status = status,
        folder = folder,
        senderName = senderName,
        senderAddress = senderAddress,
        recipientsJson = json.encodeToString(recipients),
        subject = subject,
        preview = preview,
        date = date,
        attachmentCount = attachmentCount,
        isRead = isRead,
        isStarred = isStarred,
        processingError = processingError,
        deliveryStatus = deliveryStatus,
        purgeAfter = purgeAfter,
        detailLoaded = existing?.detailLoaded ?: false,
        messageId = existing?.messageId,
        inReplyTo = existing?.inReplyTo,
        references = existing?.references,
        ccJson = existing?.ccJson ?: "[]",
        text = existing?.text.orEmpty(),
        html = existing?.html.orEmpty(),
        attachmentsJson = existing?.attachmentsJson ?: "[]",
    )

    private fun MessageDetail.toEntity(accountKey: String) = CachedMessageEntity(
        accountKey = accountKey,
        id = id,
        mailboxAddress = mailboxAddress,
        direction = direction,
        status = status,
        folder = folder,
        senderName = senderName,
        senderAddress = senderAddress,
        recipientsJson = json.encodeToString(recipients),
        subject = subject,
        preview = preview,
        date = date,
        attachmentCount = attachmentCount,
        isRead = isRead,
        isStarred = isStarred,
        processingError = processingError,
        deliveryStatus = deliveryStatus,
        purgeAfter = purgeAfter,
        detailLoaded = true,
        messageId = messageId,
        inReplyTo = inReplyTo,
        references = references,
        ccJson = json.encodeToString(cc),
        text = text,
        html = html,
        attachmentsJson = json.encodeToString(attachments),
    )

    private fun CachedMessageEntity.toSummary() = MessageSummary(
        id = id,
        mailboxAddress = mailboxAddress,
        direction = direction,
        status = status,
        folder = folder,
        senderName = senderName,
        senderAddress = senderAddress,
        recipients = decodeList(recipientsJson),
        subject = subject,
        preview = preview,
        date = date,
        attachmentCount = attachmentCount,
        isRead = isRead,
        isStarred = isStarred,
        processingError = processingError,
        deliveryStatus = deliveryStatus,
        purgeAfter = purgeAfter,
    )

    private fun CachedMessageEntity.toDetail() = MessageDetail(
        id = id,
        mailboxAddress = mailboxAddress,
        direction = direction,
        status = status,
        folder = folder,
        senderName = senderName,
        senderAddress = senderAddress,
        recipients = decodeList(recipientsJson),
        subject = subject,
        preview = preview,
        date = date,
        attachmentCount = attachmentCount,
        isRead = isRead,
        isStarred = isStarred,
        processingError = processingError,
        deliveryStatus = deliveryStatus,
        purgeAfter = purgeAfter,
        messageId = messageId,
        inReplyTo = inReplyTo,
        references = references,
        cc = decodeList(ccJson),
        text = text,
        html = html,
        attachments = runCatching { json.decodeFromString<List<Attachment>>(attachmentsJson) }
            .getOrDefault(emptyList()),
    )

    private fun decodeList(value: String): List<String> =
        runCatching { json.decodeFromString<List<String>>(value) }.getOrDefault(emptyList())
}

internal fun filterCachedMessages(
    messages: List<MessageSummary>,
    folder: MailFolder,
    query: String,
    scope: MailboxScope,
): List<MessageSummary> {
    val normalizedQuery = query.trim().lowercase()
    return messages.filter { message ->
        val folderMatches = when (folder) {
            MailFolder.Inbox -> message.folder == "inbox"
            MailFolder.Starred -> message.isStarred
            MailFolder.Sent -> message.folder == "sent"
            MailFolder.Trash -> message.folder == "trash"
        }
        val scopeMatches = when (scope) {
            MailboxScope.All -> true
            is MailboxScope.Domain -> message.mailboxAddress.substringAfterLast('@') == scope.value
            is MailboxScope.Mailbox -> message.mailboxAddress == scope.value
        }
        val queryMatches = normalizedQuery.isEmpty() || listOf(
            message.senderName,
            message.senderAddress,
            message.subject,
            message.preview,
        ).any { normalizedQuery in it.lowercase() }
        folderMatches && scopeMatches && queryMatches
    }
}
