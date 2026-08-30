package com.omnimail.android.ui

import com.omnimail.android.data.model.MailCounts
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MessageDetail
import com.omnimail.android.data.model.MessageSummary
import com.omnimail.android.data.preferences.AppLanguage
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MailPresentationTest {
    @Test
    fun `timestamp supports API milliseconds and legacy seconds`() {
        val expected = Instant.parse("2026-08-11T05:05:00Z")

        assertEquals(expected, timestampInstant(expected.toEpochMilli()))
        assertEquals(expected, timestampInstant(expected.epochSecond))
    }

    @Test
    fun `full message date includes the local GMT offset`() {
        val timestamp = Instant.parse("2026-08-11T05:05:00Z").toEpochMilli()

        val result = formatFullDate(timestamp, Locale.SIMPLIFIED_CHINESE, ZoneId.of("Asia/Singapore"))

        assertTrue(result.contains("2026"))
        assertTrue(result.endsWith("GMT+08:00"))
        assertTrue(formatFullDate(timestamp, Locale.US, ZoneId.of("UTC")).endsWith("GMT+00:00"))
    }

    @Test
    fun `message text hides tracking URLs and decodes entities`() {
        val result = readableMessageText(
            "Hello&amp;#8202; [https://tracker.example/r?id=1] &#x1F680; &amp; welcome",
        )

        assertEquals("Hello\u200A [link] 🚀 & welcome", result)
        assertFalse(result.contains("tracker.example"))
        assertEquals("link", readableMessageText("[https://tracker.example/open"))
    }

    @Test
    fun `detects dark email backgrounds for gesture contrast`() {
        assertTrue(emailUsesDarkBackground("<body style='background:#121212'>"))
        assertTrue(emailUsesDarkBackground("<table bgcolor=\"#000\">"))
        assertFalse(emailUsesDarkBackground("<body style='background-color:#f8f8f8'>"))
    }

    @Test
    fun `escapes app generated message metadata`() {
        assertEquals("&lt;script&gt;&amp;&quot;&#39;", htmlEscape("<script>&\"'"))
    }

    @Test
    fun `forward composer quotes the original message in the selected language`() {
        val detail = MessageDetail(
            id = "message-1",
            senderName = "Alice",
            senderAddress = "alice@example.com",
            recipients = listOf("me@example.com"),
            subject = "Status",
            text = "Original message",
        )

        val forwarded = forwardedMessageText(detail, AppLanguage.SimplifiedChinese)

        assertEquals("Fwd: Status", forwardSubject("Status"))
        assertEquals("Fwd: Status", forwardSubject("Fwd: Status"))
        assertTrue(forwarded.contains("转发的邮件"))
        assertTrue(forwarded.contains("发件人: Alice <alice@example.com>"))
        assertTrue(forwarded.endsWith("Original message"))
    }

    @Test
    fun `folder counts and summary use server totals`() {
        val state = AppUiState(
            folder = MailFolder.Inbox,
            counts = MailCounts(unread = 4, starred = 2, sent = 21, trash = 11),
            messages = listOf(MessageSummary(id = "one"), MessageSummary(id = "two")),
        )

        assertEquals(4, state.folderCount(MailFolder.Inbox))
        assertEquals(21, state.folderCount(MailFolder.Sent))
        assertEquals(
            "2 messages loaded · 4 unread",
            state.folderSummary("2 messages loaded", "4 unread"),
        )
    }

    @Test
    fun `mark all read batches API requests at fifty unique messages`() {
        val ids = List(105) { "message-$it" } + "message-0"

        val batches = messageIdBatches(ids)

        assertEquals(listOf(50, 50, 5), batches.map { it.size })
        assertEquals(105, batches.flatten().distinct().size)
    }
}
