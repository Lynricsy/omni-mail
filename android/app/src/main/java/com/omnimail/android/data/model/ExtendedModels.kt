package com.omnimail.android.data.model

import kotlinx.serialization.Serializable

@Serializable
data class DraftSummary(
    val id: String,
    val mailboxAddress: String = "",
    val to: String = "",
    val subject: String = "",
    val preview: String = "",
    val updatedAt: Long = 0,
    val attachmentCount: Int = 0,
    val attachmentBytes: Long = 0,
)

@Serializable
data class DraftDetail(
    val id: String,
    val mailboxAddress: String = "",
    val to: String = "",
    val subject: String = "",
    val text: String = "",
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val attachments: List<Attachment> = emptyList(),
)

@Serializable
data class DraftsResponse(
    val drafts: List<DraftSummary> = emptyList(),
    val limit: Int = 0,
)

@Serializable
data class DraftResponse(val draft: DraftDetail)

@Serializable
data class DraftInput(
    val mailboxAddress: String,
    val to: String,
    val subject: String,
    val text: String,
)

@Serializable
data class DraftAttachmentResponse(val attachment: Attachment)

@Serializable
data class DraftSendRequest(val idempotencyKey: String)

data class UploadFile(
    val filename: String,
    val contentType: String,
    val bytes: ByteArray,
)

data class DownloadedFile(
    val filename: String,
    val contentType: String,
    val bytes: ByteArray,
)

@Serializable
data class ICloudAccount(
    val id: String,
    val name: String,
    val realEmail: String = "",
    val icloudEmail: String = "",
    val host: String = "icloud.com",
    val status: String = "active",
    val aliasTotal: Int = 0,
    val aliasActive: Int = 0,
    val lastValidated: String = "",
    val lastError: String = "",
    val createdAt: String = "",
    val hasCookies: Boolean = false,
    val hasAppPassword: Boolean = false,
)

@Serializable
data class ICloudAlias(
    val email: String,
    val anonymousId: String = "",
    val label: String = "",
    val active: Boolean = true,
    val createdAt: String? = null,
)

@Serializable
data class ICloudMessage(
    val id: String,
    val from: String = "",
    val to: String = "",
    val subject: String = "",
    val date: String = "",
    val preview: String = "",
    val body: String = "",
    val html: String = "",
)

@Serializable
data class ICloudAccountsResponse(val accounts: List<ICloudAccount> = emptyList())

@Serializable
data class ICloudAccountResponse(val account: ICloudAccount)

@Serializable
data class ICloudAliasesResponse(val aliases: List<ICloudAlias> = emptyList())

@Serializable
data class ICloudAliasResponse(val alias: ICloudAlias)

@Serializable
data class ICloudInboxResponse(
    val messages: List<ICloudMessage> = emptyList(),
    val method: String = "web",
)

@Serializable
data class ICloudMessageResponse(val message: ICloudMessage)

@Serializable
data class ICloudAliasPreview(val email: String, val previewId: String)

@Serializable
data class CreateICloudAccountRequest(
    val name: String,
    val host: String,
    val cookies: String,
)

@Serializable
data class UpdateICloudAccountRequest(val name: String)

@Serializable
data class UpdateICloudCookiesRequest(val cookies: String)

@Serializable
data class UpdateICloudAppPasswordRequest(
    val icloudEmail: String,
    val appPassword: String,
)

@Serializable
data class ICloudAliasPreviewRequest(val accountId: String)

@Serializable
data class CreateICloudAliasRequest(
    val accountId: String,
    val label: String,
    val email: String,
    val previewId: String,
)

@Serializable
data class UpdateICloudAliasRequest(val accountId: String, val action: String)

@Serializable
data class DeleteICloudAliasRequest(val accountId: String)
