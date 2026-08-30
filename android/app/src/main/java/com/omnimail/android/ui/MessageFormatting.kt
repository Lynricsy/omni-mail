package com.omnimail.android.ui

import android.text.format.DateFormat
import com.omnimail.android.data.model.MessageDetail
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

internal data class EmailChromeStrings(
    val noSubject: String,
    val unknownSender: String,
    val remoteImagesBlocked: String,
    val showImages: String,
    val sentToFormat: String,
)

internal fun formatMessageDate(timestamp: Long, locale: Locale): String {
    if (timestamp <= 0) return ""
    val dateTime = timestampInstant(timestamp).atZone(ZoneId.systemDefault())
    return if (dateTime.toLocalDate() == LocalDate.now()) {
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(dateTime)
    } else {
        DateTimeFormatter.ofPattern(
            DateFormat.getBestDateTimePattern(locale, "MMMd"),
            locale,
        ).format(dateTime)
    }
}

internal fun formatFullDate(
    timestamp: Long,
    locale: Locale,
    zoneId: ZoneId = ZoneId.systemDefault(),
): String = if (timestamp <= 0) {
    ""
} else {
    val dateTime = timestampInstant(timestamp).atZone(zoneId)
    val localDateTime = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
        .withLocale(locale)
        .format(dateTime)
    val zoneOffset = "GMT${dateTime.offset.id.replace("Z", "+00:00")}"
    "$localDateTime $zoneOffset"
}

internal fun timestampInstant(timestamp: Long): Instant = if (timestamp >= 100_000_000_000L) {
    Instant.ofEpochMilli(timestamp)
} else {
    Instant.ofEpochSecond(timestamp)
}

internal fun containsRemoteContent(html: String): Boolean = remoteContent.containsMatchIn(html)

internal fun emailUsesDarkBackground(html: String): Boolean {
    val value = emailBackgroundColor.find(html)?.groupValues?.getOrNull(1)?.trim()?.lowercase()
        ?: return false
    val rgb = when {
        value == "black" -> 0x000000
        value.startsWith("#") && value.length == 4 -> {
            val digits = value.drop(1)
            "${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}".toIntOrNull(16)
        }
        value.startsWith("#") -> value.drop(1).take(6).toIntOrNull(16)
        else -> null
    } ?: return false
    val red = rgb shr 16 and 0xff
    val green = rgb shr 8 and 0xff
    val blue = rgb and 0xff
    return red * 299 + green * 587 + blue * 114 < 128_000
}

internal fun messageHeaderHtml(
    detail: MessageDetail,
    showRemoteImagesBanner: Boolean,
    strings: EmailChromeStrings,
    locale: Locale,
): String {
    val subject = htmlEscape(detail.subject.ifBlank { strings.noSubject })
    val sender = htmlEscape(
        detail.senderName.ifBlank { detail.senderAddress.ifBlank { strings.unknownSender } },
    )
    val avatar = htmlEscape(
        detail.senderName.ifBlank { detail.senderAddress.ifBlank { "?" } }
            .firstOrNull()?.uppercase() ?: "?",
    )
    val address = if (detail.senderName.isNotBlank() && detail.senderAddress.isNotBlank()) {
        "<div class=\"omnimail-meta\">${htmlEscape(detail.senderAddress)}</div>"
    } else {
        ""
    }
    val recipients = detail.recipients.joinToString().ifBlank { detail.mailboxAddress }
    val banner = if (showRemoteImagesBanner) {
        """
        <div class="omnimail-remote-banner">
          <span class="omnimail-shield" aria-hidden="true"></span>
          <span class="omnimail-banner-label">${htmlEscape(strings.remoteImagesBlocked)}</span>
          <a href="omnimail://show-remote-images">${htmlEscape(strings.showImages)}</a>
        </div>
        """.trimIndent()
    } else {
        ""
    }
    return """
        <section class="omnimail-message-header">
          <h1>$subject</h1>
          <div class="omnimail-person">
            <div class="omnimail-avatar">$avatar</div>
            <div class="omnimail-person-copy">
              <div class="omnimail-sender">$sender</div>
              $address
              <div class="omnimail-meta">${htmlEscape(String.format(locale, strings.sentToFormat, recipients))}</div>
              <div class="omnimail-meta">${htmlEscape(formatFullDate(detail.date, locale))}</div>
            </div>
          </div>
          <div class="omnimail-header-divider"></div>
        </section>
        $banner
    """.trimIndent()
}

internal fun htmlEscape(value: String): String = value
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace("\"", "&quot;")
    .replace("'", "&#39;")

internal fun readableMessageText(text: String, linkLabel: String = "link"): String = text
    .replace("&amp;#", "&#")
    .replace(numericEntity) { match ->
        val token = match.groupValues[1]
        val codePoint = if (token.startsWith("x", ignoreCase = true)) {
            token.drop(1).toIntOrNull(16)
        } else {
            token.toIntOrNull()
        }
        codePoint
            ?.takeIf(Character::isValidCodePoint)
            ?.let { String(Character.toChars(it)) }
            ?: match.value
    }
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&#39;", "'")
    .replace(bracketedUrl, "[$linkLabel]")
    .replace(bareUrl, linkLabel)
    .replace(Regex("\\[${Regex.escape(linkLabel)}(?!])"), linkLabel)
    .replace(Regex("[ \\t]+\\n"), "\n")
    .replace(Regex("\\n{3,}"), "\n\n")
    .trim()

internal fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "%.1f KiB".format(bytes / 1024.0)
    else -> "%.1f MiB".format(bytes / (1024.0 * 1024.0))
}

private val bracketedUrl = Regex("\\[https?://[^]\\s]+]", RegexOption.IGNORE_CASE)
private val bareUrl = Regex("https?://\\S+", RegexOption.IGNORE_CASE)
private val numericEntity = Regex("&#(x[0-9a-f]+|[0-9]+);", RegexOption.IGNORE_CASE)
private val remoteContent = Regex(
    "(?:src|background|url\\()\\s*=?\\s*['\"]?https?://",
    RegexOption.IGNORE_CASE,
)
private val emailBackgroundColor = Regex(
    "(?:background(?:-color)?\\s*:\\s*|bgcolor\\s*=\\s*['\"]?)(#[0-9a-f]{3,8}|black)\\b",
    RegexOption.IGNORE_CASE,
)
