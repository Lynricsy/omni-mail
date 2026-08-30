package com.omnimail.android.ui

import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MessageDetail
import com.omnimail.android.data.model.ReplyRequest
import com.omnimail.android.data.model.DraftDetail
import com.omnimail.android.data.model.DraftInput
import com.omnimail.android.data.model.UploadFile
import com.omnimail.android.data.preferences.AppLanguage
import com.omnimail.android.data.repository.MailRepository
import java.util.Locale
import java.util.UUID

internal class MailComposer(private val repository: MailRepository) {
    fun newMessage(state: AppUiState): ComposerState {
        val activeMailboxes = state.mailboxes.filter { it.isActive }
        val selectedAddress = (state.mailboxScope as? MailboxScope.Mailbox)?.value
        val mailbox = activeMailboxes.firstOrNull { it.address == selectedAddress }
            ?: activeMailboxes.firstOrNull { it.isPrimary }
            ?: activeMailboxes.firstOrNull()
        return ComposerState(
            mailboxAddress = mailbox?.address.orEmpty(),
            idempotencyKey = requestId(),
        )
    }

    fun replyTo(detail: MessageDetail): ComposerState = ComposerState(
        replyMessageId = detail.id,
        mailboxAddress = detail.mailboxAddress,
        to = detail.senderAddress,
        subject = replySubject(detail.subject),
        idempotencyKey = requestId(),
    )

    fun forwardTo(detail: MessageDetail, state: AppUiState): ComposerState = newMessage(state).copy(
        isForward = true,
        subject = forwardSubject(detail.subject),
        text = forwardedMessageText(detail, state.readerPreferences.language).take(50_000),
    )

    fun fromDraft(draft: DraftDetail): ComposerState = ComposerState(
        mailboxAddress = draft.mailboxAddress,
        to = draft.to,
        subject = draft.subject,
        text = draft.text,
        idempotencyKey = requestId(),
        draftId = draft.id,
        returnPage = AppPage.Drafts,
        attachments = draft.attachments.map {
            ComposerAttachment(
                id = it.id,
                filename = it.filename,
                contentType = it.contentType,
                size = it.size,
                remote = true,
            )
        },
    )

    fun draftInput(composer: ComposerState) = DraftInput(
        mailboxAddress = composer.mailboxAddress,
        to = composer.to.trim(),
        subject = composer.subject.trim(),
        text = composer.text.trim(),
    )

    suspend fun send(composer: ComposerState) {
        val replyMessageId = composer.replyMessageId
        if (replyMessageId != null) {
            val files = composer.attachments.mapNotNull { attachment ->
                attachment.bytes?.let {
                    UploadFile(attachment.filename, attachment.contentType, it)
                }
            }
            if (files.isEmpty()) {
                repository.reply(
                    replyMessageId,
                    ReplyRequest(composer.text.trim(), composer.idempotencyKey),
                )
            } else {
                repository.replyWithAttachments(
                    replyMessageId,
                    ReplyRequest(composer.text.trim(), composer.idempotencyKey),
                    files,
                )
            }
        } else {
            val draftId = requireNotNull(composer.draftId)
            repository.saveDraft(draftId, draftInput(composer))
            repository.sendDraft(draftId, composer.idempotencyKey)
        }
    }

    private fun requestId(): String = UUID.randomUUID().toString().replace("-", "")

    private fun replySubject(subject: String): String {
        val normalized = subject.trim()
        return if (normalized.startsWith("Re:", ignoreCase = true)) normalized else "Re: $normalized"
    }
}

internal fun forwardSubject(subject: String): String {
    val normalized = subject.trim()
    return if (normalized.startsWith("Fwd:", ignoreCase = true)) normalized else "Fwd: $normalized"
}

internal fun forwardedMessageText(detail: MessageDetail, language: AppLanguage): String {
    val chinese = when (language) {
        AppLanguage.SimplifiedChinese -> true
        AppLanguage.English -> false
        AppLanguage.System -> Locale.getDefault().language == "zh"
    }
    val locale = if (chinese) Locale.SIMPLIFIED_CHINESE else Locale.ENGLISH
    val sender = detail.senderName.ifBlank { detail.senderAddress }.let { name ->
        if (detail.senderName.isNotBlank() && detail.senderAddress.isNotBlank()) {
            "$name <${detail.senderAddress}>"
        } else {
            name
        }
    }
    val originalText = readableMessageText(
        detail.text.ifBlank { detail.preview },
        if (chinese) "链接" else "link",
    )
    val separator = if (chinese) "---------- 转发的邮件 ----------" else {
        "---------- Forwarded message ----------"
    }
    val fromLabel = if (chinese) "发件人" else "From"
    val dateLabel = if (chinese) "日期" else "Date"
    val subjectLabel = if (chinese) "主题" else "Subject"
    val toLabel = if (chinese) "收件人" else "To"

    return buildString {
        append("\n\n").append(separator).append('\n')
        if (sender.isNotBlank()) append(fromLabel).append(": ").append(sender).append('\n')
        if (detail.date > 0) {
            append(dateLabel).append(": ").append(formatFullDate(detail.date, locale)).append('\n')
        }
        if (detail.subject.isNotBlank()) {
            append(subjectLabel).append(": ").append(detail.subject.trim()).append('\n')
        }
        if (detail.recipients.isNotEmpty()) {
            append(toLabel).append(": ").append(detail.recipients.joinToString()).append('\n')
        }
        if (originalText.isNotBlank()) append('\n').append(originalText)
    }
}

internal fun ComposerState.isReadyToSend(): Boolean = text.isNotBlank() && (
    replyMessageId != null ||
        (mailboxAddress.isNotBlank() && to.isNotBlank() && subject.isNotBlank())
)

internal fun AppUiState.canComposeNew(): Boolean = canSendMail && mailboxes.any { it.isActive }
