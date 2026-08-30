package com.omnimail.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InstanceConfig(
    val appName: String = "OmniMail",
    val setupComplete: Boolean = false,
    val replyEnabled: Boolean = false,
)

@Serializable
data class SessionUser(
    val id: String,
    val email: String,
    val displayName: String = "",
    val role: String = "user",
    val canReply: Boolean = false,
)

@Serializable
data class TokenResponse(
    val tokenType: String,
    val accessToken: String,
    val expiresIn: Long,
    val refreshToken: String,
    val refreshExpiresIn: Long,
    val user: SessionUser,
)

@Serializable
data class TokenRequest(
    val email: String,
    val password: String,
    val deviceName: String,
    val client: String,
    val mfaCode: String? = null,
)

@Serializable
data class RefreshTokenRequest(val refreshToken: String, val client: String)

@Serializable
data class MailboxAddress(
    val address: String,
    val domain: String,
    val isPrimary: Boolean,
    val isActive: Boolean,
)

@Serializable
data class MailboxesResponse(val mailboxes: List<MailboxAddress> = emptyList())

sealed interface MailboxScope {
    data object All : MailboxScope
    data class Domain(val value: String) : MailboxScope
    data class Mailbox(val value: String) : MailboxScope
}

enum class MailFolder(val apiValue: String) {
    Inbox("inbox"),
    Starred("starred"),
    Sent("sent"),
    Trash("trash"),
}

@Serializable
data class MailCounts(
    val unread: Int = 0,
    val starred: Int = 0,
    val drafts: Int = 0,
    val sent: Int = 0,
    val trash: Int = 0,
)

@Serializable
data class PageInfo(
    val hasMore: Boolean = false,
    val nextCursor: String? = null,
    val limit: Int = 30,
)

@Serializable
data class MessageSummary(
    val id: String,
    val mailboxAddress: String = "",
    val direction: String = "incoming",
    val status: String = "ready",
    val folder: String = "inbox",
    val senderName: String = "",
    val senderAddress: String = "",
    val recipients: List<String> = emptyList(),
    val subject: String = "",
    val preview: String = "",
    val date: Long = 0,
    val attachmentCount: Int = 0,
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
    val processingError: String? = null,
    val deliveryStatus: String? = null,
    val purgeAfter: Long? = null,
)

@Serializable
data class MessagesResponse(
    val unchanged: Boolean = false,
    val version: Long = 0,
    val messages: List<MessageSummary> = emptyList(),
    val counts: MailCounts = MailCounts(),
    val page: PageInfo = PageInfo(),
    val fromCache: Boolean = false,
)

@Serializable
data class Attachment(
    val id: String,
    val filename: String,
    val contentType: String = "application/octet-stream",
    val size: Long = 0,
    val contentId: String? = null,
    val disposition: String = "attachment",
)

@Serializable
data class MessageDetail(
    val id: String,
    val mailboxAddress: String = "",
    val direction: String = "incoming",
    val status: String = "ready",
    val folder: String = "inbox",
    val senderName: String = "",
    val senderAddress: String = "",
    val recipients: List<String> = emptyList(),
    val subject: String = "",
    val preview: String = "",
    val date: Long = 0,
    val attachmentCount: Int = 0,
    val isRead: Boolean = false,
    val isStarred: Boolean = false,
    val processingError: String? = null,
    val deliveryStatus: String? = null,
    val purgeAfter: Long? = null,
    val messageId: String? = null,
    val inReplyTo: String? = null,
    val references: String? = null,
    val cc: List<String> = emptyList(),
    val text: String = "",
    val html: String = "",
    val attachments: List<Attachment> = emptyList(),
)

@Serializable
data class MessageDetailResponse(
    val message: MessageDetail,
    val thread: List<MessageSummary> = emptyList(),
    val fromCache: Boolean = false,
)

@Serializable
data class UpdateMessageRequest(
    val isRead: Boolean? = null,
    val isStarred: Boolean? = null,
    val folder: String? = null,
)

enum class BulkMessageAction(val apiValue: String) {
    Read("read"),
    Unread("unread"),
    Star("star"),
    Unstar("unstar"),
    Trash("trash"),
    Restore("restore"),
    Delete("delete"),
}

@Serializable
data class BulkMessageRequest(
    val ids: List<String>,
    val action: String,
)

@Serializable
data class SendMessageRequest(
    val mailboxAddress: String,
    val to: String,
    val subject: String,
    val text: String,
    val idempotencyKey: String,
)

@Serializable
data class ReplyRequest(
    val text: String,
    val idempotencyKey: String,
)

@Serializable
data class OutboundMessage(
    val id: String,
    val status: String,
    val providerId: String? = null,
)

@Serializable
data class OutboundMessageResponse(val message: OutboundMessage)

@Serializable
data class AccountUpdateRequest(val displayName: String)

@Serializable
data class AccountUpdateResponse(val user: SessionUser)

@Serializable
data class OkResponse(val ok: Boolean = true)

@Serializable
data class ErrorResponse(val error: String? = null)
