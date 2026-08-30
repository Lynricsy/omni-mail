package com.omnimail.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.omnimail.android.R
import com.omnimail.android.data.model.DraftSummary
import com.omnimail.android.data.model.ICloudAccount
import com.omnimail.android.data.model.ICloudMessage
import com.omnimail.android.data.network.OmniMailApi
import com.omnimail.android.data.preferences.AppLanguage
import com.omnimail.android.data.preferences.AppPreferences
import com.omnimail.android.data.preferences.ReaderPreferences
import com.omnimail.android.data.preferences.ThemePreference
import com.omnimail.android.data.repository.MailRepository
import com.omnimail.android.data.security.SessionStore
import com.omnimail.android.data.security.StoredSession
import com.omnimail.android.data.update.AppUpdateChecker
import com.omnimail.android.data.update.AppUpdateResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Rule
import org.junit.Test

class AdaptiveMailUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun phoneShowsSelectedICloudMessageAsSinglePane() {
        val message = sampleMessage()
        compose.setContent {
            MaterialTheme {
                Box(Modifier.width(360.dp).height(780.dp)) {
                    ICloudScreen(
                        state = sampleState().copy(iCloud = sampleCloud().copy(
                            selectedMessageId = message.id,
                            messageDetail = message,
                        )),
                        viewModel = testViewModel(),
                        contentPadding = PaddingValues(),
                    )
                }
            }
        }
        compose.onNodeWithText("Alice").assertIsDisplayed()
        compose.onNodeWithText("Quarterly report").assertIsDisplayed()
    }

    @Test
    fun tabletShowsICloudListAndReaderSideBySide() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f, 1f)) {
                MaterialTheme {
                    Box(Modifier.width(840.dp).height(900.dp)) {
                        ICloudScreen(
                            state = sampleState().copy(iCloud = sampleCloud()),
                            viewModel = testViewModel(),
                            contentPadding = PaddingValues(),
                        )
                    }
                }
            }
        }
        compose.onNodeWithText("Quarterly report").assertIsDisplayed()
        compose.onNodeWithText(
            InstrumentationRegistry.getInstrumentation().targetContext.getString(
                R.string.icloud_select_message,
            ),
        ).assertIsDisplayed()
    }

    @Test
    fun phoneKeepsPrimaryICloudControlsVisibleAtLargeFontScale() {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f, 1.6f)) {
                MaterialTheme {
                    Box(Modifier.width(360.dp).height(780.dp)) {
                        ICloudScreen(
                            state = sampleState().copy(iCloud = sampleCloud()),
                            viewModel = testViewModel(),
                            contentPadding = PaddingValues(),
                        )
                    }
                }
            }
        }
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        compose.onNodeWithText(context.getString(R.string.icloud_create_alias)).assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.icloud_all_mail)).assertIsDisplayed()
    }

    @Test
    fun draftListExposesSubjectRecipientAndAttachmentCount() {
        compose.setContent {
            MaterialTheme {
                Box(Modifier.width(360.dp).height(780.dp)) {
                    DraftsScreen(
                        state = sampleState().copy(drafts = DraftsUiState(drafts = listOf(
                            DraftSummary(
                                id = "draft-1",
                                to = "friend@example.net",
                                subject = "Trip details",
                                updatedAt = 1_787_286_600_000,
                                attachmentCount = 1,
                            ),
                        ))),
                        viewModel = testViewModel(),
                        contentPadding = PaddingValues(),
                    )
                }
            }
        }
        compose.onNodeWithText("Trip details").assertIsDisplayed()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        compose.onNodeWithText(context.getString(R.string.draft_to, "friend@example.net"))
            .assertIsDisplayed()
        compose.onNodeWithText(
            context.resources.getQuantityString(R.plurals.draft_attachments_count, 1, 1),
        )
            .assertIsDisplayed()
    }

    private fun sampleState() = AppUiState(stage = AppStage.Mail, page = AppPage.ICloud)

    private fun sampleCloud() = ICloudUiState(
        accounts = listOf(ICloudAccount(id = "icloud-1", name = "Personal")),
        selectedAccountId = "icloud-1",
        messages = listOf(sampleMessage()),
        method = "imap",
    )

    private fun sampleMessage() = ICloudMessage(
        id = "42",
        from = "Alice <alice@example.net>",
        to = "alias@icloud.com",
        subject = "Quarterly report",
        date = "2026-08-21T09:30:00.000Z",
        preview = "The report is ready.",
        body = "The report is ready.",
    )

    private fun testViewModel() = AppViewModel(
        repository = MailRepository(OmniMailApi(), EmptySessionStore),
        appPreferences = TestPreferences(),
        deviceName = "UI test",
        updateChecker = object : AppUpdateChecker {
            override suspend fun check(currentVersion: String) =
                AppUpdateResult(null, null, false)
        },
        appVersion = "test",
    )
}

private object EmptySessionStore : SessionStore {
    override fun load(): StoredSession? = null
    override fun save(baseUrl: String, refreshToken: String) = Unit
    override fun clear() = Unit
    override fun lastInstanceUrl(): String = ""
}

private class TestPreferences : AppPreferences {
    private val values = MutableStateFlow(ReaderPreferences())
    override val readerPreferences: StateFlow<ReaderPreferences> = values
    override fun setLoadRemoteImages(enabled: Boolean) {
        values.value = values.value.copy(loadRemoteImages = enabled)
    }
    override fun setConfirmExternalLinks(enabled: Boolean) {
        values.value = values.value.copy(confirmExternalLinks = enabled)
    }
    override fun setTheme(theme: ThemePreference) {
        values.value = values.value.copy(theme = theme)
    }
    override fun setLanguage(language: AppLanguage) {
        values.value = values.value.copy(language = language)
    }
    override fun setBackgroundSync(enabled: Boolean) {
        values.value = values.value.copy(backgroundSync = enabled)
    }
    override fun setNotificationsEnabled(enabled: Boolean) {
        values.value = values.value.copy(notificationsEnabled = enabled)
    }
}
