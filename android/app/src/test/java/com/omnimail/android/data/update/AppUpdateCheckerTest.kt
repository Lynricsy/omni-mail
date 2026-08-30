package com.omnimail.android.data.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateCheckerTest {
    @Test
    fun `selects the highest stable release containing the Android APK`() {
        val release = latestAndroidRelease(
            listOf(
                githubRelease("v0.3.0", "omnimail-android-0.3.0.apk"),
                githubRelease("android-v0.2.9", "omnimail-android-0.2.9.apk"),
                githubRelease("android-v0.2.10", "omnimail-android-0.2.10.apk"),
            ),
        )

        assertEquals("0.2.10", release?.version)
        assertEquals(
            "https://github.com/mibgb65-cloud/OmniMail/releases/tag/android-v0.2.10",
            release?.releaseUrl,
        )
    }

    @Test
    fun `ignores draft prerelease and malformed Android releases`() {
        assertNull(
            latestAndroidRelease(
                listOf(
                    githubRelease("android-v1.0.0", "omnimail-android.apk", draft = true),
                    githubRelease("android-v1.0.1", "omnimail-android.apk", prerelease = true),
                    githubRelease("v1.0.2", "omnimail-android.apk"),
                    githubRelease("android-v1.0.3", "app-debug.apk"),
                ),
            ),
        )
    }

    @Test
    fun `compares semantic version components numerically`() {
        assertTrue(isNewerVersion("0.10.0", "0.9.9"))
        assertTrue(isNewerVersion("1.0.0", "0.99.99"))
        assertFalse(isNewerVersion("1.0.0", "1.0.0"))
        assertFalse(isNewerVersion("0.9.9", "1.0.0"))
    }

    private fun githubRelease(
        tag: String,
        assetName: String,
        draft: Boolean = false,
        prerelease: Boolean = false,
    ) = GitHubRelease(
        tagName = tag,
        htmlUrl = "https://github.com/mibgb65-cloud/OmniMail/releases/tag/$tag",
        draft = draft,
        prerelease = prerelease,
        assets = listOf(
            GitHubReleaseAsset(
                name = assetName,
                state = "uploaded",
                downloadUrl = "https://github.com/mibgb65-cloud/OmniMail/releases/download/$tag/$assetName",
            ),
        ),
    )
}
