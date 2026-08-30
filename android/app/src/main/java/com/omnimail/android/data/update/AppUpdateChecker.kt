package com.omnimail.android.data.update

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

data class AppUpdateResult(
    val latestVersion: String?,
    val releaseUrl: String?,
    val updateAvailable: Boolean,
)

interface AppUpdateChecker {
    suspend fun check(currentVersion: String): AppUpdateResult
}

class GitHubAppUpdateChecker(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build(),
) : AppUpdateChecker {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun check(currentVersion: String): AppUpdateResult = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(RELEASES_API)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "OmniMail-Android/$currentVersion")
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .build()
        val releases = client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("GitHub release request failed: ${response.code}")
            }
            json.decodeFromString<List<GitHubRelease>>(response.body.string())
        }
        val latest = latestAndroidRelease(releases)
        AppUpdateResult(
            latestVersion = latest?.version,
            releaseUrl = latest?.releaseUrl,
            updateAvailable = latest?.let { isNewerVersion(it.version, currentVersion) } == true,
        )
    }

    private companion object {
        const val RELEASES_API =
            "https://api.github.com/repos/mibgb65-cloud/OmniMail/releases?per_page=30"
        const val GITHUB_API_VERSION = "2026-03-10"
    }
}

@Serializable
internal data class GitHubRelease(
    @SerialName("tag_name") val tagName: String = "",
    @SerialName("html_url") val htmlUrl: String = "",
    val draft: Boolean = false,
    val prerelease: Boolean = false,
    val assets: List<GitHubReleaseAsset> = emptyList(),
)

@Serializable
internal data class GitHubReleaseAsset(
    val name: String = "",
    val state: String = "",
    @SerialName("browser_download_url") val downloadUrl: String = "",
)

internal data class AndroidRelease(
    val version: String,
    val releaseUrl: String,
)

internal fun latestAndroidRelease(releases: List<GitHubRelease>): AndroidRelease? = releases
    .asSequence()
    .filterNot { it.draft || it.prerelease }
    .mapNotNull { release ->
        val version = androidReleaseVersion(release.tagName) ?: return@mapNotNull null
        val hasAndroidApk = release.assets.any {
            it.state == "uploaded" && ANDROID_APK_PATTERN.matches(it.name) && it.downloadUrl.isNotBlank()
        }
        if (!hasAndroidApk) return@mapNotNull null
        release.htmlUrl.takeIf(String::isNotBlank)?.let {
            AndroidRelease(version.value, it)
        }
    }
    .maxWithOrNull { left, right -> compareVersions(left.version, right.version) }

internal fun isNewerVersion(candidate: String, current: String): Boolean =
    compareVersions(candidate, current) > 0

private data class StableVersion(val value: String, val parts: List<Int>)

private fun androidReleaseVersion(value: String): StableVersion? {
    val match = ANDROID_RELEASE_TAG_PATTERN.matchEntire(value.trim()) ?: return null
    val parts = match.groupValues.drop(1).map(String::toInt)
    return StableVersion(parts.joinToString("."), parts)
}

private fun stableVersion(value: String): StableVersion? {
    val match = STABLE_VERSION_PATTERN.matchEntire(value.trim()) ?: return null
    val parts = match.groupValues.drop(1).map(String::toInt)
    return StableVersion(parts.joinToString("."), parts)
}

private fun compareVersions(left: String, right: String): Int {
    val leftVersion = stableVersion(left) ?: return -1
    val rightVersion = stableVersion(right) ?: return 1
    return leftVersion.parts.zip(rightVersion.parts)
        .firstOrNull { (leftPart, rightPart) -> leftPart != rightPart }
        ?.let { (leftPart, rightPart) -> leftPart.compareTo(rightPart) }
        ?: 0
}

private val STABLE_VERSION_PATTERN = Regex("""^v?(\d+)\.(\d+)\.(\d+)$""")
private val ANDROID_RELEASE_TAG_PATTERN = Regex("""^android-v(\d+)\.(\d+)\.(\d+)$""")
private val ANDROID_APK_PATTERN = Regex(
    """^omnimail-android(?:-\d+\.\d+\.\d+)?\.apk$""",
    RegexOption.IGNORE_CASE,
)
