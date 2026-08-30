package com.omnimail.android.ui

import androidx.annotation.StringRes
import com.omnimail.android.data.model.MailCounts
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxAddress
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.MessageDetail
import com.omnimail.android.data.model.MessageSummary
import com.omnimail.android.data.model.PageInfo
import com.omnimail.android.data.model.SessionUser
import com.omnimail.android.data.model.ICloudAccount
import com.omnimail.android.data.model.ICloudAlias
import com.omnimail.android.data.model.ICloudMessage
import com.omnimail.android.data.model.Attachment
import com.omnimail.android.data.model.DraftSummary
import com.omnimail.android.data.preferences.ReaderPreferences

enum class AppStage { Restoring, Login, Mail }
enum class AppPage { Mail, Compose, ICloud, Drafts, Profile, Settings }

data class ICloudUiState(
    val accounts: List<ICloudAccount> = emptyList(),
    val selectedAccountId: String = "",
    val aliases: List<ICloudAlias> = emptyList(),
    val selectedAlias: String = "",
    val messages: List<ICloudMessage> = emptyList(),
    val selectedMessageId: String? = null,
    val messageDetail: ICloudMessage? = null,
    val method: String = "",
    val isLoadingAccounts: Boolean = false,
    val isLoadingAliases: Boolean = false,
    val isLoadingMessages: Boolean = false,
    val isDetailLoading: Boolean = false,
    val isWorking: Boolean = false,
    val batchCompleted: Int = 0,
    val batchTotal: Int = 0,
)

data class ICloudAliasCandidate(
    val label: String,
    val email: String,
    val previewId: String,
)

data class ComposerState(
    val replyMessageId: String? = null,
    val isForward: Boolean = false,
    val mailboxAddress: String = "",
    val to: String = "",
    val subject: String = "",
    val text: String = "",
    val idempotencyKey: String = "",
    val draftId: String? = null,
    val returnPage: AppPage = AppPage.Mail,
    val attachments: List<ComposerAttachment> = emptyList(),
    val isDraftSaving: Boolean = false,
    val isUploadingAttachment: Boolean = false,
)

data class ComposerAttachment(
    val id: String,
    val filename: String,
    val contentType: String,
    val size: Long,
    val remote: Boolean,
    val bytes: ByteArray? = null,
)

data class DraftsUiState(
    val drafts: List<DraftSummary> = emptyList(),
    val isLoading: Boolean = false,
    val isWorking: Boolean = false,
)

sealed interface VersionCheckState {
    data object NotChecked : VersionCheckState
    data object Checking : VersionCheckState
    data object NoRelease : VersionCheckState
    data object Failed : VersionCheckState
    data class UpToDate(val latestVersion: String) : VersionCheckState
    data class UpdateAvailable(val latestVersion: String, val releaseUrl: String) : VersionCheckState
}

data class AppUiState(
    val stage: AppStage = AppStage.Restoring,
    val page: AppPage = AppPage.Mail,
    val instanceUrl: String = "",
    val email: String = "",
    val password: String = "",
    val mfaCode: String = "",
    val mfaRequired: Boolean = false,
    val appName: String = "OmniMail",
    val appVersion: String = "",
    val user: SessionUser? = null,
    val canSendMail: Boolean = false,
    val folder: MailFolder = MailFolder.Inbox,
    val mailboxes: List<MailboxAddress> = emptyList(),
    val mailboxScope: MailboxScope = MailboxScope.All,
    val counts: MailCounts = MailCounts(),
    val messages: List<MessageSummary> = emptyList(),
    val messagePage: PageInfo = PageInfo(),
    val searchQuery: String = "",
    val selectedMessageId: String? = null,
    val messageDetail: MessageDetail? = null,
    val isWorking: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isMarkingAllRead: Boolean = false,
    val isDetailLoading: Boolean = false,
    val isDownloadingAttachment: Boolean = false,
    val isOffline: Boolean = false,
    val composer: ComposerState? = null,
    val isSending: Boolean = false,
    val isProfileSaving: Boolean = false,
    val profileSaved: Boolean = false,
    val readerPreferences: ReaderPreferences = ReaderPreferences(),
    val iCloud: ICloudUiState = ICloudUiState(),
    val drafts: DraftsUiState = DraftsUiState(),
    val versionCheck: VersionCheckState = VersionCheckState.NotChecked,
    val error: UserMessage? = null,
)

sealed interface UserMessage {
    data class Resource(
        @param:StringRes val id: Int,
        val args: List<Any> = emptyList(),
    ) : UserMessage

    data class Text(val value: String) : UserMessage
}
