package com.omnimail.android.data.network

import com.omnimail.android.data.model.ErrorResponse
import com.omnimail.android.data.model.CreateICloudAccountRequest
import com.omnimail.android.data.model.CreateICloudAliasRequest
import com.omnimail.android.data.model.DeleteICloudAliasRequest
import com.omnimail.android.data.model.DownloadedFile
import com.omnimail.android.data.model.DraftAttachmentResponse
import com.omnimail.android.data.model.DraftInput
import com.omnimail.android.data.model.DraftResponse
import com.omnimail.android.data.model.DraftsResponse
import com.omnimail.android.data.model.DraftSendRequest
import com.omnimail.android.data.model.ICloudAccountResponse
import com.omnimail.android.data.model.ICloudAccountsResponse
import com.omnimail.android.data.model.ICloudAliasPreview
import com.omnimail.android.data.model.ICloudAliasPreviewRequest
import com.omnimail.android.data.model.ICloudAliasResponse
import com.omnimail.android.data.model.ICloudAliasesResponse
import com.omnimail.android.data.model.ICloudInboxResponse
import com.omnimail.android.data.model.ICloudMessageResponse
import com.omnimail.android.data.model.UpdateICloudAccountRequest
import com.omnimail.android.data.model.UpdateICloudAliasRequest
import com.omnimail.android.data.model.UpdateICloudAppPasswordRequest
import com.omnimail.android.data.model.UpdateICloudCookiesRequest
import com.omnimail.android.data.model.UploadFile
import com.omnimail.android.data.model.BulkMessageRequest
import com.omnimail.android.data.model.AccountUpdateRequest
import com.omnimail.android.data.model.AccountUpdateResponse
import com.omnimail.android.data.model.InstanceConfig
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxesResponse
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MessageDetailResponse
import com.omnimail.android.data.model.MessagesResponse
import com.omnimail.android.data.model.OkResponse
import com.omnimail.android.data.model.OutboundMessageResponse
import com.omnimail.android.data.model.RefreshTokenRequest
import com.omnimail.android.data.model.ReplyRequest
import com.omnimail.android.data.model.SendMessageRequest
import com.omnimail.android.data.model.TokenRequest
import com.omnimail.android.data.model.TokenResponse
import com.omnimail.android.data.model.UpdateMessageRequest
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.CacheControl
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

enum class ApiErrorKind { ServerMessage, RequestFailed, IncompatibleResponse }

class ApiException(
    val status: Int,
    override val message: String,
    val kind: ApiErrorKind = ApiErrorKind.ServerMessage,
) : Exception(message)

interface OmniMailService {
    suspend fun config(baseUrl: String): InstanceConfig
    suspend fun issueToken(baseUrl: String, request: TokenRequest): TokenResponse
    suspend fun refreshToken(baseUrl: String, refreshToken: String): TokenResponse
    suspend fun revokeToken(baseUrl: String, refreshToken: String): OkResponse
    suspend fun mailboxes(baseUrl: String, accessToken: String): MailboxesResponse
    suspend fun messages(
        baseUrl: String,
        accessToken: String,
        folder: MailFolder,
        query: String,
        scope: MailboxScope,
        cursor: String?,
    ): MessagesResponse
    suspend fun message(baseUrl: String, accessToken: String, id: String): MessageDetailResponse
    suspend fun updateMessage(
        baseUrl: String,
        accessToken: String,
        id: String,
        update: UpdateMessageRequest,
    ): OkResponse
    suspend fun updateMessages(
        baseUrl: String,
        accessToken: String,
        update: BulkMessageRequest,
    ): OkResponse
    suspend fun updateAccount(
        baseUrl: String,
        accessToken: String,
        update: AccountUpdateRequest,
    ): AccountUpdateResponse
    suspend fun sendMessage(
        baseUrl: String,
        accessToken: String,
        message: SendMessageRequest,
    ): OutboundMessageResponse
    suspend fun reply(
        baseUrl: String,
        accessToken: String,
        id: String,
        reply: ReplyRequest,
    ): OutboundMessageResponse
    suspend fun replyWithAttachments(
        baseUrl: String,
        accessToken: String,
        id: String,
        reply: ReplyRequest,
        attachments: List<UploadFile>,
    ): OutboundMessageResponse = unsupportedServiceMethod()
    suspend fun downloadAttachment(
        baseUrl: String,
        accessToken: String,
        messageId: String,
        attachmentId: String,
        fallbackFilename: String,
    ): DownloadedFile = unsupportedServiceMethod()
    suspend fun drafts(baseUrl: String, accessToken: String): DraftsResponse =
        unsupportedServiceMethod()
    suspend fun createDraft(
        baseUrl: String,
        accessToken: String,
        input: DraftInput,
    ): DraftResponse = unsupportedServiceMethod()
    suspend fun draft(baseUrl: String, accessToken: String, id: String): DraftResponse =
        unsupportedServiceMethod()
    suspend fun saveDraft(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: DraftInput,
    ): DraftResponse = unsupportedServiceMethod()
    suspend fun deleteDraft(baseUrl: String, accessToken: String, id: String): OkResponse =
        unsupportedServiceMethod()
    suspend fun uploadDraftAttachment(
        baseUrl: String,
        accessToken: String,
        id: String,
        file: UploadFile,
    ): DraftAttachmentResponse = unsupportedServiceMethod()
    suspend fun deleteDraftAttachment(
        baseUrl: String,
        accessToken: String,
        id: String,
        attachmentId: String,
    ): OkResponse = unsupportedServiceMethod()
    suspend fun sendDraft(
        baseUrl: String,
        accessToken: String,
        id: String,
        idempotencyKey: String,
    ): OutboundMessageResponse = unsupportedServiceMethod()
    suspend fun iCloudAccounts(baseUrl: String, accessToken: String): ICloudAccountsResponse =
        unsupportedServiceMethod()
    suspend fun createICloudAccount(
        baseUrl: String,
        accessToken: String,
        input: CreateICloudAccountRequest,
    ): ICloudAccountResponse = unsupportedServiceMethod()
    suspend fun updateICloudAccount(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: UpdateICloudAccountRequest,
    ): OkResponse = unsupportedServiceMethod()
    suspend fun deleteICloudAccount(baseUrl: String, accessToken: String, id: String): OkResponse =
        unsupportedServiceMethod()
    suspend fun updateICloudCookies(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: UpdateICloudCookiesRequest,
    ): ICloudAccountResponse = unsupportedServiceMethod()
    suspend fun updateICloudAppPassword(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: UpdateICloudAppPasswordRequest,
    ): OkResponse = unsupportedServiceMethod()
    suspend fun iCloudAliases(
        baseUrl: String,
        accessToken: String,
        accountId: String,
    ): ICloudAliasesResponse = unsupportedServiceMethod()
    suspend fun previewICloudAlias(
        baseUrl: String,
        accessToken: String,
        accountId: String,
    ): ICloudAliasPreview = unsupportedServiceMethod()
    suspend fun createICloudAlias(
        baseUrl: String,
        accessToken: String,
        input: CreateICloudAliasRequest,
    ): ICloudAliasResponse = unsupportedServiceMethod()
    suspend fun updateICloudAlias(
        baseUrl: String,
        accessToken: String,
        anonymousId: String,
        input: UpdateICloudAliasRequest,
    ): OkResponse = unsupportedServiceMethod()
    suspend fun deleteICloudAlias(
        baseUrl: String,
        accessToken: String,
        anonymousId: String,
        accountId: String,
    ): OkResponse = unsupportedServiceMethod()
    suspend fun iCloudInbox(
        baseUrl: String,
        accessToken: String,
        accountId: String,
        alias: String,
    ): ICloudInboxResponse = unsupportedServiceMethod()
    suspend fun iCloudMessage(
        baseUrl: String,
        accessToken: String,
        accountId: String,
        uid: String,
    ): ICloudMessageResponse = unsupportedServiceMethod()
}

private fun unsupportedServiceMethod(): Nothing =
    throw UnsupportedOperationException("Service method is not implemented by this test double")

class OmniMailApi(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
) : OmniMailService {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    override suspend fun config(baseUrl: String): InstanceConfig =
        request(baseUrl, "/api/config")

    override suspend fun issueToken(baseUrl: String, request: TokenRequest): TokenResponse =
        request(baseUrl, "/api/auth/token", "POST", body = json.encodeToString(request))

    override suspend fun refreshToken(baseUrl: String, refreshToken: String): TokenResponse =
        request(
            baseUrl,
            "/api/auth/token/refresh",
            "POST",
            body = json.encodeToString(RefreshTokenRequest(refreshToken, "android")),
        )

    override suspend fun revokeToken(baseUrl: String, refreshToken: String): OkResponse =
        request(
            baseUrl,
            "/api/auth/token/revoke",
            "POST",
            body = json.encodeToString(RefreshTokenRequest(refreshToken, "android")),
        )

    override suspend fun mailboxes(baseUrl: String, accessToken: String): MailboxesResponse =
        request(baseUrl, "/api/mailboxes", accessToken = accessToken)

    override suspend fun messages(
        baseUrl: String,
        accessToken: String,
        folder: MailFolder,
        query: String,
        scope: MailboxScope,
        cursor: String?,
    ): MessagesResponse = request(
        baseUrl,
        buildString {
            append("/api/messages?folder=${folder.apiValue}&limit=30")
            query.trim().take(120).takeIf(String::isNotEmpty)?.let {
                append("&q=")
                append(encodePathSegment(it))
            }
            when (scope) {
                MailboxScope.All -> Unit
                is MailboxScope.Domain -> append("&domain=${encodePathSegment(scope.value)}")
                is MailboxScope.Mailbox -> append("&mailbox=${encodePathSegment(scope.value)}")
            }
            cursor?.takeIf(String::isNotBlank)?.let {
                append("&cursor=")
                append(encodePathSegment(it))
            }
        },
        accessToken = accessToken,
    )

    override suspend fun message(
        baseUrl: String,
        accessToken: String,
        id: String,
    ): MessageDetailResponse = request(
        baseUrl,
        "/api/messages/${encodePathSegment(id)}",
        accessToken = accessToken,
    )

    override suspend fun updateMessage(
        baseUrl: String,
        accessToken: String,
        id: String,
        update: UpdateMessageRequest,
    ): OkResponse = request(
        baseUrl,
        "/api/messages/${encodePathSegment(id)}",
        method = "PATCH",
        accessToken = accessToken,
        body = json.encodeToString(update),
    )

    override suspend fun updateMessages(
        baseUrl: String,
        accessToken: String,
        update: BulkMessageRequest,
    ): OkResponse = request(
        baseUrl,
        "/api/messages/bulk",
        method = "PATCH",
        accessToken = accessToken,
        body = json.encodeToString(update),
    )

    override suspend fun updateAccount(
        baseUrl: String,
        accessToken: String,
        update: AccountUpdateRequest,
    ): AccountUpdateResponse = request(
        baseUrl,
        "/api/account",
        method = "PATCH",
        accessToken = accessToken,
        body = json.encodeToString(update),
    )

    override suspend fun sendMessage(
        baseUrl: String,
        accessToken: String,
        message: SendMessageRequest,
    ): OutboundMessageResponse = request(
        baseUrl,
        "/api/messages",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(message),
    )

    override suspend fun reply(
        baseUrl: String,
        accessToken: String,
        id: String,
        reply: ReplyRequest,
    ): OutboundMessageResponse = request(
        baseUrl,
        "/api/messages/${encodePathSegment(id)}/reply",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(reply),
    )

    override suspend fun replyWithAttachments(
        baseUrl: String,
        accessToken: String,
        id: String,
        reply: ReplyRequest,
        attachments: List<UploadFile>,
    ): OutboundMessageResponse = requestBody(
        baseUrl,
        "/api/messages/${encodePathSegment(id)}/reply",
        method = "POST",
        accessToken = accessToken,
        body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
            addFormDataPart("text", reply.text)
            addFormDataPart("idempotencyKey", reply.idempotencyKey)
            attachments.forEach { file ->
                addFormDataPart(
                    "attachments",
                    file.filename,
                    file.bytes.toRequestBody(file.contentType.toMediaTypeOrNull()),
                )
            }
        }.build(),
    )

    override suspend fun downloadAttachment(
        baseUrl: String,
        accessToken: String,
        messageId: String,
        attachmentId: String,
        fallbackFilename: String,
    ): DownloadedFile = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(
                "$baseUrl/api/messages/${encodePathSegment(messageId)}/attachments/" +
                    encodePathSegment(attachmentId),
            )
            .header("Accept", "*/*")
            .header("Authorization", "Bearer $accessToken")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw responseException(response.code, response.body.string())
            DownloadedFile(
                filename = fallbackFilename,
                contentType = response.header("Content-Type") ?: "application/octet-stream",
                bytes = response.body.bytes(),
            )
        }
    }

    override suspend fun drafts(baseUrl: String, accessToken: String): DraftsResponse =
        request(baseUrl, "/api/drafts", accessToken = accessToken)

    override suspend fun createDraft(
        baseUrl: String,
        accessToken: String,
        input: DraftInput,
    ): DraftResponse = request(
        baseUrl,
        "/api/drafts",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun draft(baseUrl: String, accessToken: String, id: String): DraftResponse =
        request(baseUrl, "/api/drafts/${encodePathSegment(id)}", accessToken = accessToken)

    override suspend fun saveDraft(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: DraftInput,
    ): DraftResponse = request(
        baseUrl,
        "/api/drafts/${encodePathSegment(id)}",
        method = "PUT",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun deleteDraft(
        baseUrl: String,
        accessToken: String,
        id: String,
    ): OkResponse = request(
        baseUrl,
        "/api/drafts/${encodePathSegment(id)}",
        method = "DELETE",
        accessToken = accessToken,
    )

    override suspend fun uploadDraftAttachment(
        baseUrl: String,
        accessToken: String,
        id: String,
        file: UploadFile,
    ): DraftAttachmentResponse = requestBody(
        baseUrl,
        "/api/drafts/${encodePathSegment(id)}/attachments",
        method = "POST",
        accessToken = accessToken,
        body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                file.filename,
                file.bytes.toRequestBody(file.contentType.toMediaTypeOrNull()),
            )
            .build(),
    )

    override suspend fun deleteDraftAttachment(
        baseUrl: String,
        accessToken: String,
        id: String,
        attachmentId: String,
    ): OkResponse = request(
        baseUrl,
        "/api/drafts/${encodePathSegment(id)}/attachments/${encodePathSegment(attachmentId)}",
        method = "DELETE",
        accessToken = accessToken,
    )

    override suspend fun sendDraft(
        baseUrl: String,
        accessToken: String,
        id: String,
        idempotencyKey: String,
    ): OutboundMessageResponse = request(
        baseUrl,
        "/api/drafts/${encodePathSegment(id)}/send",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(DraftSendRequest(idempotencyKey)),
    )

    override suspend fun iCloudAccounts(
        baseUrl: String,
        accessToken: String,
    ): ICloudAccountsResponse = request(baseUrl, "/api/icloud/accounts", accessToken = accessToken)

    override suspend fun createICloudAccount(
        baseUrl: String,
        accessToken: String,
        input: CreateICloudAccountRequest,
    ): ICloudAccountResponse = request(
        baseUrl,
        "/api/icloud/accounts",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun updateICloudAccount(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: UpdateICloudAccountRequest,
    ): OkResponse = request(
        baseUrl,
        "/api/icloud/accounts/${encodePathSegment(id)}",
        method = "PATCH",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun deleteICloudAccount(
        baseUrl: String,
        accessToken: String,
        id: String,
    ): OkResponse = request(
        baseUrl,
        "/api/icloud/accounts/${encodePathSegment(id)}",
        method = "DELETE",
        accessToken = accessToken,
    )

    override suspend fun updateICloudCookies(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: UpdateICloudCookiesRequest,
    ): ICloudAccountResponse = request(
        baseUrl,
        "/api/icloud/accounts/${encodePathSegment(id)}/cookies",
        method = "PUT",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun updateICloudAppPassword(
        baseUrl: String,
        accessToken: String,
        id: String,
        input: UpdateICloudAppPasswordRequest,
    ): OkResponse = request(
        baseUrl,
        "/api/icloud/accounts/${encodePathSegment(id)}/app-password",
        method = "PUT",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun iCloudAliases(
        baseUrl: String,
        accessToken: String,
        accountId: String,
    ): ICloudAliasesResponse = request(
        baseUrl,
        "/api/icloud/aliases?accountId=${encodePathSegment(accountId)}",
        accessToken = accessToken,
    )

    override suspend fun previewICloudAlias(
        baseUrl: String,
        accessToken: String,
        accountId: String,
    ): ICloudAliasPreview = request(
        baseUrl,
        "/api/icloud/aliases/preview",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(ICloudAliasPreviewRequest(accountId)),
    )

    override suspend fun createICloudAlias(
        baseUrl: String,
        accessToken: String,
        input: CreateICloudAliasRequest,
    ): ICloudAliasResponse = request(
        baseUrl,
        "/api/icloud/aliases",
        method = "POST",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun updateICloudAlias(
        baseUrl: String,
        accessToken: String,
        anonymousId: String,
        input: UpdateICloudAliasRequest,
    ): OkResponse = request(
        baseUrl,
        "/api/icloud/aliases/${encodePathSegment(anonymousId)}",
        method = "PATCH",
        accessToken = accessToken,
        body = json.encodeToString(input),
    )

    override suspend fun deleteICloudAlias(
        baseUrl: String,
        accessToken: String,
        anonymousId: String,
        accountId: String,
    ): OkResponse = request(
        baseUrl,
        "/api/icloud/aliases/${encodePathSegment(anonymousId)}",
        method = "DELETE",
        accessToken = accessToken,
        body = json.encodeToString(DeleteICloudAliasRequest(accountId)),
    )

    override suspend fun iCloudInbox(
        baseUrl: String,
        accessToken: String,
        accountId: String,
        alias: String,
    ): ICloudInboxResponse = request(
        baseUrl,
        buildString {
            append("/api/icloud/inbox?accountId=${encodePathSegment(accountId)}&limit=20&days=7")
            alias.takeIf(String::isNotBlank)?.let {
                append("&alias=${encodePathSegment(it)}")
            }
        },
        accessToken = accessToken,
    )

    override suspend fun iCloudMessage(
        baseUrl: String,
        accessToken: String,
        accountId: String,
        uid: String,
    ): ICloudMessageResponse = request(
        baseUrl,
        "/api/icloud/inbox/${encodePathSegment(uid)}?accountId=${encodePathSegment(accountId)}",
        accessToken = accessToken,
    )

    private suspend inline fun <reified T> request(
        baseUrl: String,
        path: String,
        method: String = "GET",
        accessToken: String? = null,
        body: String? = null,
    ): T = requestBody(
        baseUrl,
        path,
        method,
        accessToken,
        body?.toRequestBody(jsonMediaType),
    )

    private suspend inline fun <reified T> requestBody(
        baseUrl: String,
        path: String,
        method: String = "GET",
        accessToken: String? = null,
        body: RequestBody? = null,
    ): T = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url("$baseUrl$path")
            .method(method, body)
            .header("Accept", "application/json")
        if (method == "GET") builder.cacheControl(CacheControl.FORCE_NETWORK)
        if (accessToken != null) builder.header("Authorization", "Bearer $accessToken")

        client.newCall(builder.build()).execute().use { response ->
            val responseBody = response.body.string()
            if (!response.isSuccessful) {
                throw responseException(response.code, responseBody)
            }
            runCatching { json.decodeFromString<T>(responseBody) }
                .getOrElse {
                    throw ApiException(
                        response.code,
                        "Incompatible server response",
                        ApiErrorKind.IncompatibleResponse,
                    )
                }
        }
    }

    private fun responseException(status: Int, responseBody: String): ApiException {
        val apiMessage = runCatching {
            json.decodeFromString<ErrorResponse>(responseBody).error
        }.getOrNull()
        return ApiException(
            status,
            apiMessage.orEmpty(),
            if (apiMessage.isNullOrBlank()) ApiErrorKind.RequestFailed else ApiErrorKind.ServerMessage,
        )
    }

    private fun encodePathSegment(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")
}
