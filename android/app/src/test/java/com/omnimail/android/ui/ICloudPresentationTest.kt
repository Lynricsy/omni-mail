package com.omnimail.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ICloudPresentationTest {
    @Test
    fun recognizesHideMyEmailRelayWithoutGuessingOriginalAddress() {
        val sender = parseICloudSender(
            "GitHub <noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com>",
        )
        assertEquals("GitHub", sender.name)
        assertTrue(sender.isRelay)
        assertEquals(
            "noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com",
            sender.address,
        )
    }

    @Test
    fun keepsOrdinarySenderAddress() {
        val sender = parseICloudSender("Alice <alice@example.com>")
        assertEquals("Alice", sender.name)
        assertEquals("alice@example.com", sender.address)
        assertFalse(sender.isRelay)
    }

    @Test
    fun compactsIsoDateForListPresentation() {
        assertEquals("2026-08-21 09:30", compactICloudDate("2026-08-21T09:30:00.000Z"))
    }
}
