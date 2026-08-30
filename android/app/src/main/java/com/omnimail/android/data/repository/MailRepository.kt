package com.omnimail.android.data.repository

import com.omnimail.android.BuildConfig
import com.omnimail.android.data.cache.RoomMailCache
import com.omnimail.android.data.cache.CachedSessionSnapshot
import com.omnimail.android.data.model.Attachment
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.AccountUpdateRequest
import com.omnimail.android.data.model.BulkMessageAction
import com.omnimail.android.data.model.BulkMessageRequest
import com.omnimail.android.data.model.MailboxAddress
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MailCounts
import com.omnimail.android.data.model.CreateICloudAccountRequest
import com.omnimail.android.data.model.CreateICloudAliasRequest
import com.omnimail.android.data.model.DownloadedFile
import com.omnimail.android.data.model.DraftDetail
import com.omnimail.android.data.model.DraftInput
import com.omnimail.android.data.model.DraftSummary
import com.omnimail.android.data.model.ICloudAccount
import com.omnimail.android.data.model.ICloudAlias
import com.omnimail.android.data.model.ICloudAliasPreview
import com.omnimail.android.data.model.ICloudInboxResponse
import com.omnimail.android.data.model.ICloudMessage
import com.omnimail.android.data.model.MessageDetailResponse
import com.omnimail.android.data.model.MessagesResponse
import com.omnimail.android.data.model.OutboundMessageResponse
import com.omnimail.android.data.model.ReplyRequest
import com.omnimail.android.data.model.SendMessageRequest
import com.omnimail.android.data.model.SessionUser
import com.omnimail.android.data.model.TokenRequest
import com.omnimail.android.data.model.UpdateMessageRequest
import com.omnimail.android.data.model.UpdateICloudAccountRequest
import com.omnimail.android.data.model.UpdateICloudAliasRequest
import com.omnimail.android.data.model.UpdateICloudAppPasswordRequest
import com.omnimail.android.data.model.UpdateICloudCookiesRequest
import com.omnimail.android.data.model.UploadFile
import com.omnimail.android.data.network.ApiException
import com.omnimail.android.data.network.OmniMailService
import com.omnimail.android.data.network.normalizeInstanceUrl
import com.omnimail.android.data.security.SessionStore
import java.io.IOException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ActiveSession(
    val baseUrl: String,
    val user: SessionUser,
    val appName: String = "OmniMail",
    val replyEnabled: Boolean = false,
)

class SessionExpiredException : Exception("Session expired")

class MailRepository(
    private val service: OmniMailService,
    private val sessionStore: SessionStore,
    private val cache: RoomMailCache? = null,
    private val allowLocalHttp: Boolean = BuildConfig.DEBUG,
) {
    private val refreshMutex = Mutex()
    @Volatile private var accessToken: String? = null
    @Volatile private var activeSession: ActiveSession? = null

    fun lastInstanceUrl(): String = sessionStore.lastInstanceUrl()

    suspend fun login(
        instanceUrl: String,
        email: String,
        password: String,
        mfaCode: String,
        deviceName: String,
    ): ActiveSession {
        val baseUrl = normalizeInstanceUrl(instanceUrl, allowLocalHttp)
        val config = service.config(baseUrl)
        require(config.setupComplete) { "The OmniMail instance has not completed setup." }
        val response = service.issueToken(
            baseUrl,
            TokenRequest(
                email = email.trim(),
                password = password,
                deviceName = deviceName,
                client = "android",
                mfaCode = mfaCode.trim().ifEmpty { null },
            ),
        )
        sessionStore.save(baseUrl, response.refreshToken)
        accessToken = response.accessToken
        return ActiveSession(baseUrl, response.user, config.appName, config.replyEnabled).also {
            activeSession = it
            cache?.storeSession(it.toCachedSession())
        }
    }

    suspend fun restoreSession(): ActiveSession? {
        val stored = sessionStore.load() ?: return null
        val response = try {
            service.refreshToken(stored.baseUrl, stored.refreshToken)
        } catch (error: Exception) {
            if (error is ApiException && error.status == 401) {
                sessionStore.clear()
                cache?.clearSession(stored.baseUrl)
                return null
            }
            return cache?.session(stored.baseUrl)?.toActiveSession()?.also {
                activeSession = it
                accessToken = null
            }
        }
        return try {
            sessionStore.save(stored.baseUrl, response.refreshToken)
            accessToken = response.accessToken
            val config = runCatching { service.config(stored.baseUrl) }.getOrNull()
            ActiveSession(
                stored.baseUrl,
                response.user,
                config?.appName ?: "OmniMail",
                config?.replyEnabled ?: false,
            )
                .also {
                    activeSession = it
                    cache?.storeSession(it.toCachedSession())
                }
        } catch (_: Exception) {
            accessToken = null
            activeSession = null
            sessionStore.clear()
            null
        }
    }

    suspend fun logout() {
        val stored = sessionStore.load()
        val cacheKey = activeSession?.let(::sessionCacheKey)
        try {
            if (stored != null) service.revokeToken(stored.baseUrl, stored.refreshToken)
        } finally {
            if (cacheKey != null) cache?.clear(cacheKey)
            if (stored != null) cache?.clearSession(stored.baseUrl)
            accessToken = null
            activeSession = null
            sessionStore.clear()
        }
    }

    suspend fun mailboxes(): List<MailboxAddress> = authorized { baseUrl, token ->
        service.mailboxes(baseUrl, token).mailboxes
    }

    suspend fun messages(
        folder: MailFolder,
        query: String = "",
        scope: MailboxScope = MailboxScope.All,
        cursor: String? = null,
    ): MessagesResponse {
        val cacheKey = activeSession?.let(::sessionCacheKey)
        return try {
            authorized { baseUrl, token ->
                service.messages(baseUrl, token, folder, query, scope, cursor)
            }.also { response ->
                if (cacheKey != null) cache?.storeMessages(cacheKey, response.messages)
            }
        } catch (error: IOException) {
            if (cursor != null || cacheKey == null || cache == null) throw error
            val snapshot = cache.snapshot(cacheKey, folder, query, scope)
            if (snapshot.allMessages.isEmpty()) throw error
            val all = snapshot.allMessages
            MessagesResponse(
                messages = snapshot.messages,
                counts = MailCounts(
                    unread = all.count { it.folder == "inbox" && !it.isRead },
                    starred = all.count { it.isStarred },
                    sent = all.count { it.folder == "sent" },
                    trash = all.count { it.folder == "trash" },
                ),
                fromCache = true,
            )
        }
    }

    suspend fun message(id: String): MessageDetailResponse {
        val cacheKey = activeSession?.let(::sessionCacheKey)
        return try {
            authorized { baseUrl, token -> service.message(baseUrl, token, id) }
                .also { response ->
                    if (cacheKey != null) cache?.storeDetail(cacheKey, response.message)
                }
        } catch (error: IOException) {
            val cached = cacheKey?.let { cache?.detail(it, id) } ?: throw error
            MessageDetailResponse(cached, fromCache = true)
        }
    }

    suspend fun updateMessage(id: String, update: UpdateMessageRequest) {
        authorized { baseUrl, token -> service.updateMessage(baseUrl, token, id, update) }
        activeSession?.let(::sessionCacheKey)?.let { cache?.update(it, id, update) }
    }

    suspend fun updateMessages(ids: List<String>, action: BulkMessageAction) {
        require(ids.isNotEmpty() && ids.size <= 50)
        authorized { baseUrl, token ->
            service.updateMessages(baseUrl, token, BulkMessageRequest(ids, action.apiValue))
        }
        val update = when (action) {
            BulkMessageAction.Read -> UpdateMessageRequest(isRead = true)
            BulkMessageAction.Unread -> UpdateMessageRequest(isRead = false)
            BulkMessageAction.Star -> UpdateMessageRequest(isStarred = true)
            BulkMessageAction.Unstar -> UpdateMessageRequest(isStarred = false)
            BulkMessageAction.Trash -> UpdateMessageRequest(folder = "trash")
            BulkMessageAction.Restore -> UpdateMessageRequest(folder = "inbox")
            BulkMessageAction.Delete -> null
        }
        activeSession?.let(::sessionCacheKey)?.let { key ->
            ids.forEach { id ->
                if (update == null) cache?.remove(key, id) else cache?.update(key, id, update)
            }
        }
    }

    suspend fun sendMessage(message: SendMessageRequest): OutboundMessageResponse =
        authorized { baseUrl, token -> service.sendMessage(baseUrl, token, message) }

    suspend fun reply(id: String, reply: ReplyRequest): OutboundMessageResponse =
        authorized { baseUrl, token -> service.reply(baseUrl, token, id, reply) }

    suspend fun replyWithAttachments(
        id: String,
        reply: ReplyRequest,
        attachments: List<UploadFile>,
    ): OutboundMessageResponse = authorized { baseUrl, token ->
        service.replyWithAttachments(baseUrl, token, id, reply, attachments)
    }

    suspend fun downloadAttachment(
        messageId: String,
        attachment: Attachment,
    ): DownloadedFile = authorized { baseUrl, token ->
        service.downloadAttachment(baseUrl, token, messageId, attachment.id, attachment.filename)
    }

    suspend fun drafts(): List<DraftSummary> = authorized { baseUrl, token ->
        service.drafts(baseUrl, token).drafts
    }

    suspend fun createDraft(input: DraftInput): DraftDetail = authorized { baseUrl, token ->
        service.createDraft(baseUrl, token, input).draft
    }

    suspend fun draft(id: String): DraftDetail = authorized { baseUrl, token ->
        service.draft(baseUrl, token, id).draft
    }

    suspend fun saveDraft(id: String, input: DraftInput): DraftDetail = authorized { baseUrl, token ->
        service.saveDraft(baseUrl, token, id, input).draft
    }

    suspend fun deleteDraft(id: String) {
        authorized { baseUrl, token -> service.deleteDraft(baseUrl, token, id) }
    }

    suspend fun uploadDraftAttachment(id: String, file: UploadFile): Attachment =
        authorized { baseUrl, token ->
            service.uploadDraftAttachment(baseUrl, token, id, file).attachment
        }

    suspend fun deleteDraftAttachment(id: String, attachmentId: String) {
        authorized { baseUrl, token ->
            service.deleteDraftAttachment(baseUrl, token, id, attachmentId)
        }
    }

    suspend fun sendDraft(id: String, idempotencyKey: String): OutboundMessageResponse =
        authorized { baseUrl, token -> service.sendDraft(baseUrl, token, id, idempotencyKey) }

    suspend fun iCloudAccounts(): List<ICloudAccount> = authorized { baseUrl, token ->
        service.iCloudAccounts(baseUrl, token).accounts
    }

    suspend fun createICloudAccount(name: String, host: String, cookies: String): ICloudAccount =
        authorized { baseUrl, token ->
            service.createICloudAccount(
                baseUrl,
                token,
                CreateICloudAccountRequest(name, host, cookies),
            ).account
        }

    suspend fun updateICloudAccount(id: String, name: String) {
        authorized { baseUrl, token ->
            service.updateICloudAccount(baseUrl, token, id, UpdateICloudAccountRequest(name))
        }
    }

    suspend fun deleteICloudAccount(id: String) {
        authorized { baseUrl, token -> service.deleteICloudAccount(baseUrl, token, id) }
    }

    suspend fun updateICloudCookies(id: String, cookies: String): ICloudAccount =
        authorized { baseUrl, token ->
            service.updateICloudCookies(baseUrl, token, id, UpdateICloudCookiesRequest(cookies)).account
        }

    suspend fun updateICloudAppPassword(id: String, email: String, password: String) {
        authorized { baseUrl, token ->
            service.updateICloudAppPassword(
                baseUrl,
                token,
                id,
                UpdateICloudAppPasswordRequest(email, password),
            )
        }
    }

    suspend fun iCloudAliases(accountId: String): List<ICloudAlias> = authorized { baseUrl, token ->
        service.iCloudAliases(baseUrl, token, accountId).aliases
    }

    suspend fun previewICloudAlias(accountId: String): ICloudAliasPreview =
        authorized { baseUrl, token -> service.previewICloudAlias(baseUrl, token, accountId) }

    suspend fun createICloudAlias(
        accountId: String,
        label: String,
        email: String,
        previewId: String,
    ): ICloudAlias = authorized { baseUrl, token ->
        service.createICloudAlias(
            baseUrl,
            token,
            CreateICloudAliasRequest(accountId, label, email, previewId),
        ).alias
    }

    suspend fun updateICloudAlias(anonymousId: String, accountId: String, action: String) {
        authorized { baseUrl, token ->
            service.updateICloudAlias(
                baseUrl,
                token,
                anonymousId,
                UpdateICloudAliasRequest(accountId, action),
            )
        }
    }

    suspend fun deleteICloudAlias(anonymousId: String, accountId: String) {
        authorized { baseUrl, token ->
            service.deleteICloudAlias(baseUrl, token, anonymousId, accountId)
        }
    }

    suspend fun iCloudInbox(accountId: String, alias: String): ICloudInboxResponse =
        authorized { baseUrl, token -> service.iCloudInbox(baseUrl, token, accountId, alias) }

    suspend fun iCloudMessage(accountId: String, uid: String): ICloudMessage =
        authorized { baseUrl, token -> service.iCloudMessage(baseUrl, token, accountId, uid).message }

    suspend fun updateDisplayName(displayName: String): SessionUser = authorized { baseUrl, token ->
        service.updateAccount(baseUrl, token, AccountUpdateRequest(displayName)).user
    }.also { user ->
        activeSession = activeSession?.copy(user = user)
    }

    private suspend fun <T> authorized(block: suspend (String, String) -> T): T {
        val session = activeSession ?: throw SessionExpiredException()
        val originalToken = accessToken ?: throw IOException("Offline session")
        return try {
            block(session.baseUrl, originalToken)
        } catch (error: ApiException) {
            if (error.status != 401) throw error
            val refreshedToken = refreshAccessToken(originalToken)
            try {
                block(session.baseUrl, refreshedToken)
            } catch (retryError: ApiException) {
                if (retryError.status != 401) throw retryError
                accessToken = null
                activeSession = null
                sessionStore.clear()
                throw SessionExpiredException()
            }
        }
    }

    private suspend fun refreshAccessToken(failedToken: String): String = refreshMutex.withLock {
        accessToken?.takeIf { it != failedToken }?.let { return@withLock it }
        val stored = sessionStore.load() ?: throw SessionExpiredException()
        val response = try {
            service.refreshToken(stored.baseUrl, stored.refreshToken)
        } catch (error: Exception) {
            if (error !is ApiException || error.status != 401) throw error
            accessToken = null
            activeSession = null
            sessionStore.clear()
            throw SessionExpiredException()
        }
        try {
            sessionStore.save(stored.baseUrl, response.refreshToken)
            accessToken = response.accessToken
            activeSession = activeSession?.copy(user = response.user)
            response.accessToken
        } catch (_: Exception) {
            accessToken = null
            activeSession = null
            sessionStore.clear()
            throw SessionExpiredException()
        }
    }

    private fun sessionCacheKey(session: ActiveSession): String =
        "${session.baseUrl}|${session.user.id}"

    private fun ActiveSession.toCachedSession() = CachedSessionSnapshot(
        baseUrl = baseUrl,
        user = user,
        appName = appName,
        replyEnabled = replyEnabled,
    )

    private fun CachedSessionSnapshot.toActiveSession() = ActiveSession(
        baseUrl = baseUrl,
        user = user,
        appName = appName,
        replyEnabled = replyEnabled,
    )
}
