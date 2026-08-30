package com.omnimail.android.data.cache

import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MessageSummary
import org.junit.Assert.assertEquals
import org.junit.Test

class MailCacheFilterTest {
    private val messages = listOf(
        MessageSummary(
            id = "inbox",
            mailboxAddress = "hello@example.com",
            folder = "inbox",
            senderName = "Alice",
            subject = "Quarterly report",
            isStarred = true,
        ),
        MessageSummary(
            id = "sent",
            mailboxAddress = "hello@other.test",
            folder = "sent",
            senderName = "Me",
            subject = "Follow up",
        ),
        MessageSummary(
            id = "trash",
            mailboxAddress = "hello@example.com",
            folder = "trash",
            senderAddress = "billing@example.net",
        ),
    )

    @Test
    fun filtersFoldersAndStarredMessages() {
        assertEquals(
            listOf("inbox"),
            filterCachedMessages(messages, MailFolder.Starred, "", MailboxScope.All).map { it.id },
        )
        assertEquals(
            listOf("sent"),
            filterCachedMessages(messages, MailFolder.Sent, "", MailboxScope.All).map { it.id },
        )
    }

    @Test
    fun appliesMailboxScopeAndCaseInsensitiveSearch() {
        assertEquals(
            listOf("inbox"),
            filterCachedMessages(
                messages,
                MailFolder.Inbox,
                "QUARTERLY",
                MailboxScope.Domain("example.com"),
            ).map { it.id },
        )
    }
}
