package com.omnimail.android.data.repository

import com.omnimail.android.data.model.InstanceConfig
import com.omnimail.android.data.model.AccountUpdateRequest
import com.omnimail.android.data.model.AccountUpdateResponse
import com.omnimail.android.data.model.BulkMessageAction
import com.omnimail.android.data.model.BulkMessageRequest
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxesResponse
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MessageDetail
import com.omnimail.android.data.model.MessageDetailResponse
import com.omnimail.android.data.model.MessagesResponse
import com.omnimail.android.data.model.OkResponse
import com.omnimail.android.data.model.OutboundMessage
import com.omnimail.android.data.model.OutboundMessageResponse
import com.omnimail.android.data.model.ReplyRequest
import com.omnimail.android.data.model.SendMessageRequest
import com.omnimail.android.data.model.SessionUser
import com.omnimail.android.data.model.TokenRequest
import com.omnimail.android.data.model.TokenResponse
import com.omnimail.android.data.model.UpdateMessageRequest
import com.omnimail.android.data.network.ApiException
import com.omnimail.android.data.network.OmniMailService
import com.omnimail.android.data.security.SessionStore
import com.omnimail.android.data.security.StoredSession
import java.util.concurrent.atomic.AtomicInteger
import java.io.IOException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertNull
import org.junit.Test

class MailRepositoryTest {
    @Test
    fun `rotates refresh token and retries an unauthorized request once`() = runBlocking {
        val service = RefreshingService()
        val store = MemorySessionStore()
        val repository = loggedInRepository(service, store)

        repository.mailboxes()

        assertEquals(1, service.refreshCalls.get())
        assertEquals(listOf("old-access", "new-access"), service.mailboxTokens)
        assertEquals("new-refresh", store.load()?.refreshToken)
    }

    @Test
    fun `concurrent unauthorized requests share one refresh`() = runBlocking {
        val service = RefreshingService(delayRefresh = true)
        val store = MemorySessionStore()
        val repository = loggedInRepository(service, store)

        listOf(
            async { repository.mailboxes() },
            async { repository.mailboxes() },
        ).awaitAll()

        assertEquals(1, service.refreshCalls.get())
        assertEquals(2, service.mailboxTokens.count { it == "old-access" })
        assertEquals(2, service.mailboxTokens.count { it == "new-access" })
    }

    @Test
    fun `does not refresh repeatedly when retry is unauthorized`() = runBlocking {
        val service = RefreshingService(rejectNewAccess = true)
        val store = MemorySessionStore()
        val repository = loggedInRepository(service, store)

        assertThrows(SessionExpiredException::class.java) {
            runBlocking { repository.mailboxes() }
        }

        assertEquals(1, service.refreshCalls.get())
        assertEquals(2, service.mailboxTokens.size)
        assertNull(store.load())
    }

    @Test
    fun `keeps refresh token when session restore fails offline`() = runBlocking {
        val store = MemorySessionStore().apply {
            save("https://mail.example.com", "still-valid-refresh")
        }
        val service = RefreshingService(refreshFailure = IOException("offline"))
        val repository = MailRepository(service, store, allowLocalHttp = false)

        assertEquals(null, repository.restoreSession())
        assertEquals("still-valid-refresh", store.load()?.refreshToken)
    }

    @Test
    fun `forwards the server search query without caching results`() = runBlocking {
        val service = RefreshingService()
        val repository = loggedInRepository(service, MemorySessionStore())

        repository.messages(MailFolder.Inbox, "invoice")
        repository.messages(MailFolder.Inbox, "invoice")

        assertEquals(listOf("invoice", "invoice"), service.messageQueries)
    }

    @Test
    fun `forwards mailbox scope and pagination cursor`() = runBlocking {
        val service = RefreshingService()
        val repository = loggedInRepository(service, MemorySessionStore())

        repository.messages(
            MailFolder.Inbox,
            scope = MailboxScope.Domain("example.com"),
            cursor = "opaque-next-page",
        )

        assertEquals(listOf(MailboxScope.Domain("example.com")), service.messageScopes)
        assertEquals(listOf("opaque-next-page"), service.messageCursors)
    }

    @Test
    fun `forwards new messages and replies to the authenticated service`() = runBlocking {
        val service = RefreshingService()
        val repository = loggedInRepository(service, MemorySessionStore())
        val message = SendMessageRequest(
            "sender@example.com",
            "friend@example.net",
            "Hello",
            "Message body",
            "send-request",
        )
        val reply = ReplyRequest("Reply body", "reply-request")

        repository.sendMessage(message)
        repository.reply("message-1", reply)

        assertEquals(listOf(message), service.sentMessages)
        assertEquals(listOf("message-1" to reply), service.sentReplies)
    }

    @Test
    fun `forwards bulk message actions to the authenticated service`() = runBlocking {
        val service = RefreshingService()
        val repository = loggedInRepository(service, MemorySessionStore())

        repository.updateMessages(listOf("message-1", "message-2"), BulkMessageAction.Read)

        assertEquals(
            listOf(BulkMessageRequest(listOf("message-1", "message-2"), "read")),
            service.bulkUpdates,
        )
    }

    private suspend fun loggedInRepository(
        service: RefreshingService,
        store: MemorySessionStore,
    ): MailRepository = MailRepository(service, store, allowLocalHttp = false).also {
        it.login(
            instanceUrl = "https://mail.example.com",
            email = "user@example.com",
            password = "secret",
            mfaCode = "",
            deviceName = "Test device",
        )
    }
}

private class MemorySessionStore : SessionStore {
    @Volatile private var session: StoredSession? = null

    override fun load(): StoredSession? = session
    override fun save(baseUrl: String, refreshToken: String) {
        session = StoredSession(baseUrl, refreshToken)
    }
    override fun clear() {
        session = null
    }
    override fun lastInstanceUrl(): String = session?.baseUrl.orEmpty()
}

private class RefreshingService(
    private val delayRefresh: Boolean = false,
    private val rejectNewAccess: Boolean = false,
    private val refreshFailure: Exception? = null,
) : OmniMailService {
    val refreshCalls = AtomicInteger(0)
    val mailboxTokens = java.util.Collections.synchronizedList(mutableListOf<String>())
    val messageQueries = mutableListOf<String>()
    val messageScopes = mutableListOf<MailboxScope>()
    val messageCursors = mutableListOf<String?>()
    val sentMessages = mutableListOf<SendMessageRequest>()
    val sentReplies = mutableListOf<Pair<String, ReplyRequest>>()
    val bulkUpdates = mutableListOf<BulkMessageRequest>()
    private val user = SessionUser("user-id", "user@example.com")

    override suspend fun config(baseUrl: String) = InstanceConfig(setupComplete = true)

    override suspend fun issueToken(baseUrl: String, request: TokenRequest) = TokenResponse(
        tokenType = "Bearer",
        accessToken = "old-access",
        expiresIn = 900,
        refreshToken = "old-refresh",
        refreshExpiresIn = 2592000,
        user = user,
    )

    override suspend fun refreshToken(baseUrl: String, refreshToken: String): TokenResponse {
        refreshCalls.incrementAndGet()
        refreshFailure?.let { throw it }
        if (delayRefresh) delay(80)
        return TokenResponse(
            tokenType = "Bearer",
            accessToken = "new-access",
            expiresIn = 900,
            refreshToken = "new-refresh",
            refreshExpiresIn = 2592000,
            user = user,
        )
    }

    override suspend fun revokeToken(baseUrl: String, refreshToken: String) = OkResponse()

    override suspend fun mailboxes(baseUrl: String, accessToken: String): MailboxesResponse {
        mailboxTokens += accessToken
        if (accessToken == "old-access") {
            delay(20)
            throw ApiException(401, "expired")
        }
        if (rejectNewAccess) throw ApiException(401, "revoked")
        return MailboxesResponse()
    }

    override suspend fun messages(
        baseUrl: String,
        accessToken: String,
        folder: MailFolder,
        query: String,
        scope: MailboxScope,
        cursor: String?,
    ): MessagesResponse {
        messageQueries += query
        messageScopes += scope
        messageCursors += cursor
        return MessagesResponse()
    }

    override suspend fun message(
        baseUrl: String,
        accessToken: String,
        id: String,
    ) = MessageDetailResponse(MessageDetail(id))

    override suspend fun updateMessage(
        baseUrl: String,
        accessToken: String,
        id: String,
        update: UpdateMessageRequest,
    ) = OkResponse()

    override suspend fun updateMessages(
        baseUrl: String,
        accessToken: String,
        update: BulkMessageRequest,
    ): OkResponse {
        bulkUpdates += update
        return OkResponse()
    }

    override suspend fun updateAccount(
        baseUrl: String,
        accessToken: String,
        update: AccountUpdateRequest,
    ) = AccountUpdateResponse(user.copy(displayName = update.displayName))

    override suspend fun sendMessage(
        baseUrl: String,
        accessToken: String,
        message: SendMessageRequest,
    ): OutboundMessageResponse {
        sentMessages += message
        return OutboundMessageResponse(OutboundMessage("sent-1", "processing"))
    }

    override suspend fun reply(
        baseUrl: String,
        accessToken: String,
        id: String,
        reply: ReplyRequest,
    ): OutboundMessageResponse {
        sentReplies += id to reply
        return OutboundMessageResponse(OutboundMessage("reply-1", "processing"))
    }
}
