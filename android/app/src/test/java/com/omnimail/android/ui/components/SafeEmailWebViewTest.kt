package com.omnimail.android.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SafeEmailWebViewTest {
    @Test
    fun `sanitizes active content and blocks remote images by default`() {
        val document = buildSafeEmailDocument(
            "<script>alert(1)</script><img src=\"https://tracker.example/pixel\"><a href=\"https://example.com/a\" onclick=\"x()\">Open</a><a href=\"omnimail://show-remote-images\">Internal</a>",
            loadRemoteImages = false,
        )

        assertFalse(document.contains("<script", ignoreCase = true))
        assertFalse(document.contains("onclick", ignoreCase = true))
        assertFalse(document.contains("tracker.example"))
        assertTrue(document.contains("https://example.com/a"))
        assertFalse(document.contains("omnimail://", ignoreCase = true))
    }

    @Test
    fun `allows remote images only when enabled`() {
        val document = buildSafeEmailDocument("<img src='https://images.example/banner.png'>", true)
        assertTrue(document.contains("https://images.example/banner.png"))
    }

    @Test
    fun `accepts only browser http links`() {
        assertEquals("https://example.com/path", safeExternalUrl("https://example.com/path"))
        assertNull(safeExternalUrl("javascript:alert(1)"))
        assertNull(safeExternalUrl("file:///etc/passwd"))
    }

    @Test
    fun `places trusted message chrome inside the same scroll document`() {
        val document = buildSafeEmailDocument(
            html = "<html><body><main>Message body</main></body></html>",
            loadRemoteImages = false,
            trustedHeaderHtml = "<header>Subject</header>",
            trustedFooterHtml = "<footer>Attachment</footer>",
        )

        assertTrue(document.indexOf("<header>Subject</header>") < document.indexOf("Message body"))
        assertTrue(document.indexOf("Message body") < document.indexOf("<footer>Attachment</footer>"))
    }

    @Test
    fun `uses dark document colors when the app theme is dark`() {
        val document = buildSafeEmailDocument(
            html = "<meta name='color-scheme' content='light only'><p style='color-scheme: light'>Message body</p>",
            loadRemoteImages = false,
            darkTheme = true,
        )

        assertTrue(document.contains("--omnimail-bg:#0f1513"))
        assertTrue(document.contains("--omnimail-text:#dfe4e1"))
        assertFalse(document.contains("light only"))
        assertFalse(document.contains("color-scheme: light"))
        assertFalse(document.contains("color-scheme:dark"))
        assertFalse(document.contains("color-scheme:light"))
    }
}
