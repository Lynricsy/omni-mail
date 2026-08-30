package com.omnimail.android.ui

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.omnimail.android.R
import com.omnimail.android.data.preferences.AppPreferences
import com.omnimail.android.data.preferences.AppLanguage
import com.omnimail.android.data.preferences.ThemePreference
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.data.model.PageInfo
import com.omnimail.android.data.model.BulkMessageAction
import com.omnimail.android.data.model.UpdateMessageRequest
import com.omnimail.android.data.model.ICloudAliasPreview
import com.omnimail.android.data.model.Attachment
import com.omnimail.android.data.model.UploadFile
import com.omnimail.android.data.repository.ActiveSession
import com.omnimail.android.data.repository.MailRepository
import com.omnimail.android.data.repository.SessionExpiredException
import com.omnimail.android.data.update.AppUpdateChecker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

class AppViewModel(
    private val repository: MailRepository,
    private val appPreferences: AppPreferences,
    private val deviceName: String,
    private val updateChecker: AppUpdateChecker,
    private val appVersion: String,
) : ViewModel() {
    private var pendingDeepLinkMessageId: String? = null
    private val _uiState = MutableStateFlow(
        AppUiState(instanceUrl = repository.lastInstanceUrl(), appVersion = appVersion),
    )
    val uiState: StateFlow<AppUiState> = _uiState.asStateFlow()
    private var messageLoadJob: Job? = null
    private var detailLoadJob: Job? = null
    private var searchDebounceJob: Job? = null
    private var iCloudScopeJob: Job? = null
    private var iCloudDetailJob: Job? = null
    private var draftSaveJob: Job? = null
    private val mailComposer = MailComposer(repository)

    init {
        viewModelScope.launch {
            appPreferences.readerPreferences.collect { preferences ->
                _uiState.update { it.copy(readerPreferences = preferences) }
            }
        }
        viewModelScope.launch {
            val session = repository.restoreSession()
            if (session == null) {
                _uiState.update { it.copy(stage = AppStage.Login) }
            } else {
                openSession(session)
            }
        }
    }

    fun updateInstanceUrl(value: String) = _uiState.update {
        it.copy(instanceUrl = value, mfaRequired = false)
    }
    fun updateEmail(value: String) = _uiState.update { it.copy(email = value, mfaRequired = false) }
    fun updatePassword(value: String) = _uiState.update { it.copy(password = value, mfaRequired = false) }
    fun updateMfaCode(value: String) = _uiState.update { it.copy(mfaCode = value) }
    fun dismissMfaChallenge() = _uiState.update { it.copy(mfaCode = "", mfaRequired = false) }
    fun dismissError() = _uiState.update { it.copy(error = null) }
    fun openMessageFromDeepLink(id: String) {
        val normalized = id.trim().take(160)
        if (normalized.isEmpty()) return
        if (_uiState.value.stage != AppStage.Mail) {
            pendingDeepLinkMessageId = normalized
            return
        }
        _uiState.update { it.copy(page = AppPage.Mail) }
        selectMessage(normalized)
    }
    fun openMail() {
        val returningToMail = _uiState.value.page != AppPage.Mail
        _uiState.update { it.copy(page = AppPage.Mail, profileSaved = false) }
        if (returningToMail) loadMessages()
    }
    fun openProfile() = _uiState.update { it.copy(page = AppPage.Profile, profileSaved = false) }
    fun openSettings() {
        val shouldCheckVersion = _uiState.value.versionCheck is VersionCheckState.NotChecked
        _uiState.update { it.copy(page = AppPage.Settings, profileSaved = false) }
        if (shouldCheckVersion) checkForUpdate()
    }
    fun openICloud() {
        _uiState.update { it.copy(page = AppPage.ICloud, profileSaved = false) }
        val state = _uiState.value.iCloud
        if (state.accounts.isEmpty() && !state.isLoadingAccounts) loadICloudAccounts()
    }
    fun openDrafts() {
        if (!_uiState.value.canSendMail) return
        _uiState.update { it.copy(page = AppPage.Drafts, profileSaved = false) }
        loadDrafts()
    }

    fun refreshICloud() {
        val accountId = _uiState.value.iCloud.selectedAccountId
        if (accountId.isBlank()) loadICloudAccounts() else loadICloudScope(accountId)
    }

    fun selectICloudAccount(accountId: String) {
        if (accountId == _uiState.value.iCloud.selectedAccountId) return
        iCloudScopeJob?.cancel()
        iCloudDetailJob?.cancel()
        _uiState.update {
            it.copy(iCloud = it.iCloud.copy(
                selectedAccountId = accountId,
                aliases = emptyList(),
                selectedAlias = "",
                messages = emptyList(),
                selectedMessageId = null,
                messageDetail = null,
                method = "",
            ))
        }
        loadICloudScope(accountId)
    }

    fun selectICloudAlias(email: String) {
        val state = _uiState.value.iCloud
        if (email == state.selectedAlias) return
        iCloudDetailJob?.cancel()
        _uiState.update {
            it.copy(iCloud = it.iCloud.copy(
                selectedAlias = email,
                messages = emptyList(),
                selectedMessageId = null,
                messageDetail = null,
            ))
        }
        loadICloudInbox(state.selectedAccountId, email)
    }

    fun selectICloudMessage(id: String) {
        val state = _uiState.value.iCloud
        val summary = state.messages.firstOrNull { it.id == id } ?: return
        iCloudDetailJob?.cancel()
        if (state.method == "web") {
            _uiState.update {
                it.copy(iCloud = it.iCloud.copy(selectedMessageId = id, messageDetail = summary))
            }
            return
        }
        _uiState.update {
            it.copy(iCloud = it.iCloud.copy(
                selectedMessageId = id,
                messageDetail = null,
                isDetailLoading = true,
            ))
        }
        iCloudDetailJob = viewModelScope.launch {
            runCatching { repository.iCloudMessage(state.selectedAccountId, id) }
                .onSuccess { message ->
                    if (_uiState.value.iCloud.selectedMessageId == id) {
                        _uiState.update {
                            it.copy(iCloud = it.iCloud.copy(
                                messageDetail = message,
                                isDetailLoading = false,
                            ))
                        }
                    }
                }
                .onFailure(::handleICloudFailure)
        }
    }

    fun closeICloudMessage() {
        iCloudDetailJob?.cancel()
        _uiState.update {
            it.copy(iCloud = it.iCloud.copy(
                selectedMessageId = null,
                messageDetail = null,
                isDetailLoading = false,
            ))
        }
    }

    fun addICloudAccount(
        name: String,
        host: String,
        cookies: String,
        onComplete: (Boolean) -> Unit,
    ) = runICloudMutation(onComplete) {
        val account = repository.createICloudAccount(name.trim(), host, cookies.trim())
        loadICloudAccounts(account.id)
    }

    fun updateICloudAccount(
        id: String,
        name: String,
        cookies: String?,
        icloudEmail: String?,
        appPassword: String?,
        onComplete: (Boolean) -> Unit,
    ) = runICloudMutation(onComplete) {
        repository.updateICloudAccount(id, name.trim())
        if (!cookies.isNullOrBlank()) repository.updateICloudCookies(id, cookies.trim())
        if (!icloudEmail.isNullOrBlank() && !appPassword.isNullOrBlank()) {
            repository.updateICloudAppPassword(id, icloudEmail.trim(), appPassword.trim())
        }
        loadICloudAccounts(id)
    }

    fun deleteICloudAccount(id: String, onComplete: (Boolean) -> Unit) =
        runICloudMutation(onComplete) {
            repository.deleteICloudAccount(id)
            loadICloudAccounts()
        }

    fun updateICloudAlias(
        anonymousId: String,
        action: String,
        onComplete: (Boolean) -> Unit,
    ) = runICloudMutation(onComplete) {
        val accountId = _uiState.value.iCloud.selectedAccountId
        repository.updateICloudAlias(anonymousId, accountId, action)
        loadICloudScope(accountId)
    }

    fun deleteICloudAlias(anonymousId: String, onComplete: (Boolean) -> Unit) =
        runICloudMutation(onComplete) {
            val accountId = _uiState.value.iCloud.selectedAccountId
            repository.deleteICloudAlias(anonymousId, accountId)
            loadICloudScope(accountId)
        }

    fun previewICloudAlias(onComplete: (ICloudAliasPreview?, String?) -> Unit) {
        val accountId = _uiState.value.iCloud.selectedAccountId
        if (accountId.isBlank()) return onComplete(null, "No iCloud account selected")
        viewModelScope.launch {
            runCatching { repository.previewICloudAlias(accountId) }
                .onSuccess { onComplete(it, null) }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    onComplete(null, error.message)
                    if (error is SessionExpiredException) handleOperationFailure(error)
                }
        }
    }

    fun createICloudAliases(
        candidates: List<ICloudAliasCandidate>,
        onComplete: (Int, String?) -> Unit,
    ) {
        val accountId = _uiState.value.iCloud.selectedAccountId
        if (accountId.isBlank() || candidates.isEmpty() || candidates.size > 5) return
        viewModelScope.launch {
            _uiState.update {
                it.copy(iCloud = it.iCloud.copy(
                    isWorking = true,
                    batchCompleted = 0,
                    batchTotal = candidates.size,
                ))
            }
            var completed = 0
            var failure: Throwable? = null
            for (candidate in candidates) {
                try {
                    repository.createICloudAlias(
                        accountId,
                        candidate.label.trim(),
                        candidate.email,
                        candidate.previewId,
                    )
                    completed += 1
                    _uiState.update {
                        it.copy(iCloud = it.iCloud.copy(batchCompleted = completed))
                    }
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    failure = error
                    break
                }
            }
            _uiState.update {
                it.copy(iCloud = it.iCloud.copy(
                    isWorking = false,
                    batchCompleted = 0,
                    batchTotal = 0,
                ))
            }
            loadICloudScope(accountId, candidates.getOrNull(completed - 1)?.email.orEmpty())
            if (failure is SessionExpiredException) handleOperationFailure(failure)
            onComplete(completed, failure?.message)
        }
    }
    fun openComposer() {
        if (!_uiState.value.canComposeNew()) return
        val composer = mailComposer.newMessage(_uiState.value).copy(isDraftSaving = true)
        _uiState.update { it.copy(page = AppPage.Compose, composer = composer) }
        createComposerDraft(composer.idempotencyKey)
    }
    fun openReply() {
        val state = _uiState.value
        val detail = state.messageDetail ?: return
        if (!state.canSendMail || detail.direction != "incoming" || detail.status != "ready") return
        _uiState.update { it.copy(page = AppPage.Compose, composer = mailComposer.replyTo(detail)) }
    }
    fun openForward() {
        val state = _uiState.value
        val detail = state.messageDetail ?: return
        if (!state.canComposeNew() || detail.status != "ready") return
        val composer = mailComposer.forwardTo(detail, state).copy(isDraftSaving = true)
        _uiState.update { it.copy(page = AppPage.Compose, composer = composer) }
        createComposerDraft(composer.idempotencyKey)
    }
    fun closeComposer() {
        val composer = _uiState.value.composer ?: return
        draftSaveJob?.cancel()
        if (composer.replyMessageId != null || composer.draftId == null) {
            _uiState.update {
                it.copy(page = composer.returnPage, composer = null, isSending = false)
            }
            return
        }
        viewModelScope.launch {
            _uiState.update {
                it.copy(composer = it.composer?.copy(isDraftSaving = true), error = null)
            }
            runCatching { repository.saveDraft(composer.draftId, mailComposer.draftInput(composer)) }
                .onSuccess {
                    _uiState.update {
                        it.copy(page = composer.returnPage, composer = null, isSending = false)
                    }
                    if (composer.returnPage == AppPage.Drafts) loadDrafts()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(composer = it.composer?.copy(isDraftSaving = false)) }
                    handleOperationFailure(error)
                }
        }
    }
    fun updateComposerMailbox(value: String) = updateComposer { it.copy(mailboxAddress = value) }
    fun updateComposerTo(value: String) = updateComposer { it.copy(to = value.take(254)) }
    fun updateComposerSubject(value: String) = updateComposer { it.copy(subject = value.take(500)) }
    fun updateComposerText(value: String) = updateComposer { it.copy(text = value.take(50_000)) }
    fun sendComposer() {
        val composer = _uiState.value.composer ?: return
        if (!composer.isReadyToSend() || _uiState.value.isSending) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSending = true, error = null) }
            runCatching {
                val ready = if (composer.replyMessageId == null && composer.draftId == null) {
                    val draft = repository.createDraft(mailComposer.draftInput(composer))
                    composer.copy(draftId = draft.id)
                } else composer
                mailComposer.send(ready)
            }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            page = AppPage.Mail,
                            composer = null,
                            isSending = false,
                            error = UserMessage.Resource(R.string.message_queued),
                        )
                    }
                    loadMessages()
                    loadDrafts()
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update { it.copy(isSending = false, error = userMessage(error)) }
                }
        }
    }

    fun openDraft(id: String) {
        if (_uiState.value.drafts.isWorking) return
        viewModelScope.launch {
            _uiState.update { it.copy(drafts = it.drafts.copy(isWorking = true), error = null) }
            runCatching { repository.draft(id) }
                .onSuccess { draft ->
                    _uiState.update {
                        it.copy(
                            page = AppPage.Compose,
                            composer = mailComposer.fromDraft(draft),
                            drafts = it.drafts.copy(isWorking = false),
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(drafts = it.drafts.copy(isWorking = false)) }
                    handleOperationFailure(error)
                }
        }
    }

    fun deleteDraft(id: String) {
        if (_uiState.value.drafts.isWorking) return
        viewModelScope.launch {
            _uiState.update { it.copy(drafts = it.drafts.copy(isWorking = true), error = null) }
            runCatching { repository.deleteDraft(id) }
                .onSuccess { loadDrafts() }
                .onFailure { error ->
                    _uiState.update { it.copy(drafts = it.drafts.copy(isWorking = false)) }
                    handleOperationFailure(error)
                }
        }
    }

    fun discardComposer() {
        val composer = _uiState.value.composer ?: return
        draftSaveJob?.cancel()
        val draftId = composer.draftId
        if (draftId == null) {
            _uiState.update { it.copy(page = composer.returnPage, composer = null) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSending = true, error = null) }
            runCatching { repository.deleteDraft(draftId) }
                .onSuccess {
                    _uiState.update {
                        it.copy(page = composer.returnPage, composer = null, isSending = false)
                    }
                    loadDrafts()
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isSending = false) }
                    handleOperationFailure(error)
                }
        }
    }

    fun addComposerAttachments(files: List<UploadFile>) {
        val composer = _uiState.value.composer ?: return
        if (files.isEmpty() || composer.isUploadingAttachment) return
        val accepted = files.filter { it.bytes.isNotEmpty() && it.bytes.size <= 5 * 1024 * 1024 }
        if (accepted.size + composer.attachments.size > 5 ||
            accepted.sumOf { it.bytes.size.toLong() } + composer.attachments.sumOf { it.size } > 10 * 1024 * 1024
        ) {
            _uiState.update { it.copy(error = UserMessage.Resource(R.string.error_attachment_limits)) }
            return
        }
        if (composer.replyMessageId != null) {
            val local = accepted.map {
                ComposerAttachment(
                    id = UUID.randomUUID().toString(),
                    filename = it.filename,
                    contentType = it.contentType,
                    size = it.bytes.size.toLong(),
                    remote = false,
                    bytes = it.bytes,
                )
            }
            _uiState.update { it.copy(composer = it.composer?.copy(attachments = it.composer.attachments + local)) }
            return
        }
        viewModelScope.launch {
            var active = _uiState.value.composer ?: return@launch
            var draftId = active.draftId
            _uiState.update { it.copy(composer = it.composer?.copy(isUploadingAttachment = true), error = null) }
            try {
                if (draftId == null) {
                    draftId = repository.createDraft(mailComposer.draftInput(active)).id
                    _uiState.update { it.copy(composer = it.composer?.copy(draftId = draftId)) }
                }
                accepted.forEach { file ->
                    val attachment = repository.uploadDraftAttachment(draftId, file)
                    updateComposer {
                        it.copy(attachments = it.attachments + ComposerAttachment(
                            id = attachment.id,
                            filename = attachment.filename,
                            contentType = attachment.contentType,
                            size = attachment.size,
                            remote = true,
                        ))
                    }
                }
                _uiState.update { it.copy(composer = it.composer?.copy(isUploadingAttachment = false)) }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                _uiState.update { it.copy(composer = it.composer?.copy(isUploadingAttachment = false)) }
                handleOperationFailure(error)
            }
        }
    }

    fun addComposerUris(uris: List<Uri>, resolver: ContentResolver) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val files = withContext(Dispatchers.IO) {
                uris.take(5).mapNotNull { uri ->
                    val metadata = resolver.query(
                        uri,
                        arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
                        null,
                        null,
                        null,
                    )?.use { cursor ->
                        if (!cursor.moveToFirst()) null else {
                            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                            val name = if (nameIndex >= 0) cursor.getString(nameIndex) else "attachment"
                            val size = if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                                cursor.getLong(sizeIndex)
                            } else null
                            name to size
                        }
                    } ?: ("attachment" to null)
                    if (metadata.second != null && metadata.second!! > 5 * 1024 * 1024) {
                        return@mapNotNull null
                    }
                    val bytes = resolver.openInputStream(uri)?.use { input ->
                        input.readBytes().takeIf { it.size <= 5 * 1024 * 1024 }
                    } ?: return@mapNotNull null
                    UploadFile(
                        filename = metadata.first.take(200),
                        contentType = resolver.getType(uri) ?: "application/octet-stream",
                        bytes = bytes,
                    )
                }
            }
            if (files.isEmpty()) {
                _uiState.update { it.copy(error = UserMessage.Resource(R.string.error_attachment_limits)) }
            } else {
                addComposerAttachments(files)
            }
        }
    }

    fun removeComposerAttachment(id: String) {
        val composer = _uiState.value.composer ?: return
        val attachment = composer.attachments.firstOrNull { it.id == id } ?: return
        if (!attachment.remote || composer.draftId == null) {
            updateComposer { it.copy(attachments = it.attachments.filterNot { item -> item.id == id }) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(composer = it.composer?.copy(isUploadingAttachment = true)) }
            runCatching { repository.deleteDraftAttachment(composer.draftId, id) }
                .onSuccess {
                    updateComposer {
                        it.copy(
                            attachments = it.attachments.filterNot { item -> item.id == id },
                            isUploadingAttachment = false,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(composer = it.composer?.copy(isUploadingAttachment = false)) }
                    handleOperationFailure(error)
                }
        }
    }

    fun downloadAttachment(
        messageId: String,
        attachment: Attachment,
        uri: Uri,
        resolver: ContentResolver,
    ) {
        if (_uiState.value.isDownloadingAttachment) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDownloadingAttachment = true, error = null) }
            runCatching {
                val file = repository.downloadAttachment(messageId, attachment)
                withContext(Dispatchers.IO) {
                    resolver.openOutputStream(uri, "w")?.use { it.write(file.bytes) }
                        ?: error("Could not open the selected file")
                }
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        isDownloadingAttachment = false,
                        error = UserMessage.Resource(R.string.attachment_saved),
                    )
                }
            }.onFailure { error ->
                _uiState.update { it.copy(isDownloadingAttachment = false) }
                handleOperationFailure(error)
            }
        }
    }
    fun setLoadRemoteImages(enabled: Boolean) = appPreferences.setLoadRemoteImages(enabled)
    fun setConfirmExternalLinks(enabled: Boolean) = appPreferences.setConfirmExternalLinks(enabled)
    fun setTheme(theme: ThemePreference) = appPreferences.setTheme(theme)
    fun setLanguage(language: AppLanguage) = appPreferences.setLanguage(language)
    fun setBackgroundSync(enabled: Boolean) = appPreferences.setBackgroundSync(enabled)
    fun setNotificationsEnabled(enabled: Boolean) = appPreferences.setNotificationsEnabled(enabled)

    fun checkForUpdate() {
        if (_uiState.value.versionCheck is VersionCheckState.Checking) return
        viewModelScope.launch {
            _uiState.update { it.copy(versionCheck = VersionCheckState.Checking) }
            runCatching { updateChecker.check(appVersion) }
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            versionCheck = when {
                                result.latestVersion == null -> VersionCheckState.NoRelease
                                result.updateAvailable -> VersionCheckState.UpdateAvailable(
                                    result.latestVersion,
                                    result.releaseUrl.orEmpty(),
                                )
                                else -> VersionCheckState.UpToDate(result.latestVersion)
                            },
                        )
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update { it.copy(versionCheck = VersionCheckState.Failed) }
                }
        }
    }

    fun login() {
        val state = _uiState.value
        if (state.instanceUrl.isBlank() || state.email.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(error = UserMessage.Resource(R.string.error_login_required)) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isWorking = true, error = null) }
            runCatching {
                repository.login(
                    instanceUrl = state.instanceUrl,
                    email = state.email,
                    password = state.password,
                    mfaCode = state.mfaCode,
                    deviceName = deviceName,
                )
            }.onSuccess { session ->
                openSession(session)
            }.onFailure { error ->
                if (error is CancellationException) throw error
                val mfaRequired = requiresMfaChallenge(error, state.mfaCode)
                _uiState.update {
                    it.copy(
                        isWorking = false,
                        mfaRequired = mfaRequired || it.mfaRequired,
                        error = if (mfaRequired) null else userMessage(error),
                    )
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            _uiState.update { it.copy(isWorking = true, error = null) }
            runCatching { repository.logout() }
            _uiState.update {
                AppUiState(
                    stage = AppStage.Login,
                    instanceUrl = it.instanceUrl,
                    email = it.email,
                    appVersion = appVersion,
                )
            }
        }
    }

    fun selectFolder(folder: MailFolder) {
        searchDebounceJob?.cancel()
        if (_uiState.value.folder == folder) {
            loadMessages()
            return
        }
        _uiState.update {
            it.copy(
                folder = folder,
                messages = emptyList(),
                messagePage = PageInfo(),
                selectedMessageId = null,
                messageDetail = null,
                isRefreshing = false,
                isLoadingMore = false,
            )
        }
        loadMessages()
    }

    fun selectMailboxScope(scope: MailboxScope) {
        searchDebounceJob?.cancel()
        if (_uiState.value.mailboxScope == scope) {
            loadMessages()
            return
        }
        messageLoadJob?.cancel()
        detailLoadJob?.cancel()
        _uiState.update {
            it.copy(
                mailboxScope = scope,
                messages = emptyList(),
                messagePage = PageInfo(),
                selectedMessageId = null,
                messageDetail = null,
                isRefreshing = false,
                isLoadingMore = false,
                isDetailLoading = false,
            )
        }
        loadMessages()
    }

    fun refresh() {
        if (_uiState.value.isRefreshing) return
        searchDebounceJob?.cancel()
        loadMessages()
    }

    fun loadMoreMessages() {
        val state = _uiState.value
        val cursor = state.messagePage.nextCursor ?: return
        if (!state.messagePage.hasMore || state.isLoadingMore || state.isRefreshing) return
        loadMessages(cursor)
    }

    fun updateSearchQuery(value: String) {
        val query = value.take(120)
        if (_uiState.value.searchQuery == query) return
        searchDebounceJob?.cancel()
        messageLoadJob?.cancel()
        detailLoadJob?.cancel()
        _uiState.update {
            it.copy(
                searchQuery = query,
                messages = emptyList(),
                messagePage = PageInfo(),
                selectedMessageId = null,
                messageDetail = null,
                isRefreshing = false,
                isLoadingMore = false,
                isDetailLoading = false,
            )
        }
        if (query.isBlank()) {
            loadMessages()
        } else {
            searchDebounceJob = viewModelScope.launch {
                delay(350)
                loadMessages()
            }
        }
    }

    fun selectMessage(id: String) {
        if (_uiState.value.selectedMessageId == id && _uiState.value.messageDetail != null) return
        detailLoadJob?.cancel()
        _uiState.update {
            it.copy(selectedMessageId = id, messageDetail = null, isDetailLoading = true, error = null)
        }
        detailLoadJob = viewModelScope.launch {
            runCatching { repository.message(id) }
                .onSuccess { response ->
                    val detail = response.message
                    _uiState.update {
                        it.copy(
                            messageDetail = detail,
                            isDetailLoading = false,
                            isOffline = response.fromCache || it.isOffline,
                            counts = if (!detail.isRead) {
                                it.counts.copy(unread = (it.counts.unread - 1).coerceAtLeast(0))
                            } else {
                                it.counts
                            },
                            messages = it.messages.map { summary ->
                                if (summary.id == id) summary.copy(isRead = true) else summary
                            },
                        )
                    }
                    if (!detail.isRead) {
                        runCatching {
                            repository.updateMessage(id, UpdateMessageRequest(isRead = true))
                        }
                    }
                }
                .onFailure(::handleOperationFailure)
        }
    }

    fun closeMessage() {
        detailLoadJob?.cancel()
        _uiState.update {
            it.copy(selectedMessageId = null, messageDetail = null, isDetailLoading = false)
        }
    }

    fun toggleStar() {
        val id = _uiState.value.selectedMessageId ?: return
        toggleMessageStar(id)
    }

    internal fun performMessageAction(id: String, action: MessageAction) {
        when (action) {
            MessageAction.ToggleRead -> toggleMessageRead(id)
            MessageAction.ToggleStar -> toggleMessageStar(id)
            MessageAction.Trash -> moveMessage(id, BulkMessageAction.Trash)
            MessageAction.Restore -> moveMessage(id, BulkMessageAction.Restore)
            MessageAction.Delete -> moveMessage(id, BulkMessageAction.Delete)
        }
    }

    fun markLoadedMessagesRead() {
        val state = _uiState.value
        if (state.isMarkingAllRead) return
        val unreadIds = state.messages.filterNot { it.isRead }.map { it.id }
        if (unreadIds.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isMarkingAllRead = true, error = null) }
            runCatching {
                messageIdBatches(unreadIds).forEach { ids ->
                    repository.updateMessages(ids, BulkMessageAction.Read)
                }
            }.onSuccess {
                updateReadLocally(unreadIds.toSet(), true)
                _uiState.update { it.copy(isMarkingAllRead = false) }
            }.onFailure { error ->
                _uiState.update { it.copy(isMarkingAllRead = false) }
                handleOperationFailure(error)
            }
        }
    }

    private fun toggleMessageStar(id: String) {
        val state = _uiState.value
        val current = state.messageDetail?.takeIf { it.id == id }?.isStarred
            ?: state.messages.firstOrNull { it.id == id }?.isStarred
            ?: return
        val target = !current
        updateStarLocally(id, target)
        viewModelScope.launch {
            runCatching {
                repository.updateMessage(id, UpdateMessageRequest(isStarred = target))
            }.onSuccess {
                if (state.folder == MailFolder.Starred && !target) loadMessages()
            }.onFailure { error ->
                updateStarLocally(id, current)
                handleOperationFailure(error)
            }
        }
    }

    private fun toggleMessageRead(id: String) {
        val state = _uiState.value
        val current = state.messageDetail?.takeIf { it.id == id }?.isRead
            ?: state.messages.firstOrNull { it.id == id }?.isRead
            ?: return
        val target = !current
        updateReadLocally(setOf(id), target)
        viewModelScope.launch {
            runCatching {
                repository.updateMessage(id, UpdateMessageRequest(isRead = target))
            }.onFailure { error ->
                updateReadLocally(setOf(id), current)
                handleOperationFailure(error)
            }
        }
    }

    private fun moveMessage(id: String, action: BulkMessageAction) {
        val state = _uiState.value
        val message = state.messages.firstOrNull { it.id == id } ?: return
        val index = state.messages.indexOf(message)
        val folder = state.folder
        val query = state.searchQuery
        val mailboxScope = state.mailboxScope
        _uiState.update {
            it.copy(
                messages = it.messages.filterNot { summary -> summary.id == id },
                selectedMessageId = it.selectedMessageId.takeUnless { selected -> selected == id },
                messageDetail = if (it.messageDetail?.id == id) null else it.messageDetail,
                isDetailLoading = if (it.selectedMessageId == id) false else it.isDetailLoading,
                error = null,
            )
        }
        viewModelScope.launch {
            runCatching { repository.updateMessages(listOf(id), action) }
                .onSuccess {
                    if (listContextMatches(folder, query, mailboxScope)) loadMessages()
                }
                .onFailure { error ->
                    if (listContextMatches(folder, query, mailboxScope)) {
                        _uiState.update { current ->
                            if (current.messages.any { it.id == id }) current else current.copy(
                                messages = current.messages.toMutableList().apply {
                                    add(index.coerceAtMost(size), message)
                                },
                            )
                        }
                    }
                    handleOperationFailure(error)
                }
        }
    }

    private fun listContextMatches(
        folder: MailFolder,
        query: String,
        mailboxScope: MailboxScope,
    ): Boolean = _uiState.value.let {
        it.folder == folder && it.searchQuery == query && it.mailboxScope == mailboxScope
    }

    fun updateDisplayName(displayName: String) {
        val normalized = displayName.trim()
        if (normalized.isEmpty() || normalized.length > 60) {
            _uiState.update { it.copy(error = UserMessage.Resource(R.string.error_display_name_length)) }
            return
        }
        if (_uiState.value.user?.displayName == normalized) return
        viewModelScope.launch {
            _uiState.update { it.copy(isProfileSaving = true, profileSaved = false, error = null) }
            runCatching { repository.updateDisplayName(normalized) }
                .onSuccess { user ->
                    _uiState.update {
                        it.copy(user = user, isProfileSaving = false, profileSaved = true)
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update {
                        it.copy(
                            isProfileSaving = false,
                            profileSaved = false,
                            error = userMessage(error),
                        )
                    }
                }
        }
    }

    private suspend fun openSession(session: ActiveSession) {
        _uiState.update {
            it.copy(
                stage = AppStage.Mail,
                page = AppPage.Mail,
                appName = session.appName,
                user = session.user,
                canSendMail = session.replyEnabled && (
                    session.user.role == "super_admin" || session.user.canReply
                ),
                isRefreshing = true,
                password = "",
                mfaCode = "",
                isWorking = false,
                error = null,
            )
        }
        loadMessages()
        runCatching { repository.mailboxes() }
            .onSuccess { mailboxes -> _uiState.update { it.copy(mailboxes = mailboxes) } }
            .onFailure(::handleOperationFailure)
        pendingDeepLinkMessageId?.let {
            pendingDeepLinkMessageId = null
            openMessageFromDeepLink(it)
        }
    }

    private fun loadMessages(cursor: String? = null) {
        messageLoadJob?.cancel()
        val folder = _uiState.value.folder
        val query = _uiState.value.searchQuery
        val mailboxScope = _uiState.value.mailboxScope
        messageLoadJob = viewModelScope.launch {
            _uiState.update {
                if (cursor == null) {
                    it.copy(isRefreshing = true, isLoadingMore = false, error = null)
                } else {
                    it.copy(isLoadingMore = true, error = null)
                }
            }
            runCatching { repository.messages(folder, query.trim(), mailboxScope, cursor) }
                .onSuccess { response ->
                    _uiState.update { current ->
                        if (
                            current.folder != folder ||
                            current.searchQuery != query ||
                            current.mailboxScope != mailboxScope
                        ) {
                            current
                        } else {
                            current.copy(
                                messages = if (cursor == null) {
                                    response.messages
                                } else {
                                    (current.messages + response.messages).distinctBy { it.id }
                                },
                                counts = response.counts,
                                messagePage = response.page,
                                isOffline = response.fromCache,
                                isRefreshing = false,
                                isLoadingMore = false,
                            )
                        }
                    }
                }
                .onFailure(::handleOperationFailure)
        }
    }

    private fun createComposerDraft(idempotencyKey: String) {
        viewModelScope.launch {
            val composer = _uiState.value.composer
                ?.takeIf { it.idempotencyKey == idempotencyKey }
                ?: return@launch
            runCatching { repository.createDraft(mailComposer.draftInput(composer)) }
                .onSuccess { draft ->
                    _uiState.update {
                        val current = it.composer
                        if (current?.idempotencyKey != idempotencyKey) it else it.copy(
                            composer = current.copy(draftId = draft.id, isDraftSaving = false),
                        )
                    }
                    scheduleDraftSave()
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update { it.copy(composer = it.composer?.copy(isDraftSaving = false)) }
                    handleOperationFailure(error)
                }
        }
    }

    private fun loadDrafts() {
        if (!_uiState.value.canSendMail) return
        viewModelScope.launch {
            _uiState.update { it.copy(drafts = it.drafts.copy(isLoading = true), error = null) }
            runCatching { repository.drafts() }
                .onSuccess { drafts ->
                    _uiState.update {
                        it.copy(drafts = DraftsUiState(drafts = drafts))
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(drafts = it.drafts.copy(isLoading = false, isWorking = false)) }
                    handleOperationFailure(error)
                }
        }
    }

    private fun loadICloudAccounts(preferredAccountId: String = "") {
        viewModelScope.launch {
            _uiState.update {
                it.copy(iCloud = it.iCloud.copy(isLoadingAccounts = true), error = null)
            }
            runCatching { repository.iCloudAccounts() }
                .onSuccess { accounts ->
                    val current = _uiState.value.iCloud.selectedAccountId
                    val selected = when {
                        accounts.any { it.id == preferredAccountId } -> preferredAccountId
                        accounts.any { it.id == current } -> current
                        else -> accounts.firstOrNull()?.id.orEmpty()
                    }
                    _uiState.update {
                        it.copy(iCloud = it.iCloud.copy(
                            accounts = accounts,
                            selectedAccountId = selected,
                            aliases = if (selected.isEmpty()) emptyList() else it.iCloud.aliases,
                            messages = if (selected.isEmpty()) emptyList() else it.iCloud.messages,
                            isLoadingAccounts = false,
                        ))
                    }
                    if (selected.isNotEmpty()) loadICloudScope(selected)
                }
                .onFailure(::handleICloudFailure)
        }
    }

    private fun loadICloudScope(accountId: String, preferredAlias: String = "") {
        if (accountId.isBlank()) return
        iCloudScopeJob?.cancel()
        iCloudDetailJob?.cancel()
        iCloudScopeJob = viewModelScope.launch {
            _uiState.update {
                it.copy(iCloud = it.iCloud.copy(
                    isLoadingAliases = true,
                    isLoadingMessages = true,
                    selectedMessageId = null,
                    messageDetail = null,
                ), error = null)
            }
            runCatching {
                val aliases = repository.iCloudAliases(accountId)
                val currentAlias = _uiState.value.iCloud.selectedAlias
                val selectedAlias = when {
                    aliases.any { it.email == preferredAlias } -> preferredAlias
                    aliases.any { it.email == currentAlias } -> currentAlias
                    else -> ""
                }
                Triple(aliases, selectedAlias, repository.iCloudInbox(accountId, selectedAlias))
            }.onSuccess { (aliases, selectedAlias, inbox) ->
                if (_uiState.value.iCloud.selectedAccountId == accountId) {
                    _uiState.update {
                        it.copy(iCloud = it.iCloud.copy(
                            aliases = aliases,
                            selectedAlias = selectedAlias,
                            messages = inbox.messages,
                            method = inbox.method,
                            isLoadingAliases = false,
                            isLoadingMessages = false,
                        ))
                    }
                }
            }.onFailure(::handleICloudFailure)
        }
    }

    private fun loadICloudInbox(accountId: String, alias: String) {
        if (accountId.isBlank()) return
        iCloudScopeJob?.cancel()
        iCloudScopeJob = viewModelScope.launch {
            _uiState.update {
                it.copy(iCloud = it.iCloud.copy(isLoadingMessages = true), error = null)
            }
            runCatching { repository.iCloudInbox(accountId, alias) }
                .onSuccess { inbox ->
                    val current = _uiState.value.iCloud
                    if (current.selectedAccountId == accountId && current.selectedAlias == alias) {
                        _uiState.update {
                            it.copy(iCloud = it.iCloud.copy(
                                messages = inbox.messages,
                                method = inbox.method,
                                isLoadingMessages = false,
                            ))
                        }
                    }
                }
                .onFailure(::handleICloudFailure)
        }
    }

    private fun runICloudMutation(
        onComplete: (Boolean) -> Unit,
        block: suspend () -> Unit,
    ) {
        if (_uiState.value.iCloud.isWorking) return
        viewModelScope.launch {
            _uiState.update { it.copy(iCloud = it.iCloud.copy(isWorking = true), error = null) }
            runCatching { block() }
                .onSuccess {
                    _uiState.update { it.copy(iCloud = it.iCloud.copy(isWorking = false)) }
                    onComplete(true)
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update { it.copy(iCloud = it.iCloud.copy(isWorking = false)) }
                    handleICloudFailure(error)
                    onComplete(false)
                }
        }
    }

    private fun handleICloudFailure(error: Throwable) {
        _uiState.update {
            it.copy(iCloud = it.iCloud.copy(
                isLoadingAccounts = false,
                isLoadingAliases = false,
                isLoadingMessages = false,
                isDetailLoading = false,
                isWorking = false,
            ))
        }
        handleOperationFailure(error)
    }

    private fun updateStarLocally(id: String, isStarred: Boolean) {
        _uiState.update {
            it.copy(
                messages = it.messages.map { summary ->
                    if (summary.id == id) summary.copy(isStarred = isStarred) else summary
                },
                messageDetail = it.messageDetail?.let { detail ->
                    if (detail.id == id) detail.copy(isStarred = isStarred) else detail
                },
            )
        }
    }

    private fun updateReadLocally(ids: Set<String>, isRead: Boolean) {
        _uiState.update {
            val changedCount = it.messages.count { summary ->
                summary.id in ids && summary.isRead != isRead
            }
            it.copy(
                messages = it.messages.map { summary ->
                    if (summary.id in ids) summary.copy(isRead = isRead) else summary
                },
                messageDetail = it.messageDetail?.let { detail ->
                    if (detail.id in ids) detail.copy(isRead = isRead) else detail
                },
                counts = it.counts.copy(
                    unread = (
                        it.counts.unread + if (isRead) -changedCount else changedCount
                    ).coerceAtLeast(0),
                ),
            )
        }
    }

    private fun updateComposer(update: (ComposerState) -> ComposerState) {
        _uiState.update { it.copy(composer = it.composer?.let(update)) }
        scheduleDraftSave()
    }

    private fun scheduleDraftSave() {
        val composer = _uiState.value.composer ?: return
        val draftId = composer.draftId ?: return
        if (composer.replyMessageId != null || composer.isUploadingAttachment) return
        draftSaveJob?.cancel()
        draftSaveJob = viewModelScope.launch {
            delay(900)
            val current = _uiState.value.composer
                ?.takeIf { it.draftId == draftId }
                ?: return@launch
            _uiState.update { it.copy(composer = it.composer?.copy(isDraftSaving = true)) }
            runCatching { repository.saveDraft(draftId, mailComposer.draftInput(current)) }
                .onSuccess {
                    if (_uiState.value.composer?.draftId == draftId) {
                        _uiState.update { it.copy(composer = it.composer?.copy(isDraftSaving = false)) }
                    }
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update { it.copy(composer = it.composer?.copy(isDraftSaving = false)) }
                    handleOperationFailure(error)
                }
        }
    }

    private fun handleOperationFailure(error: Throwable) {
        if (error is CancellationException) return
        if (error is SessionExpiredException) {
            _uiState.update {
                AppUiState(
                    stage = AppStage.Login,
                    instanceUrl = it.instanceUrl,
                    email = it.email,
                    appVersion = appVersion,
                    error = UserMessage.Resource(R.string.error_session_expired),
                )
            }
        } else {
            _uiState.update {
                it.copy(
                    isRefreshing = false,
                    isLoadingMore = false,
                    isDetailLoading = false,
                    error = userMessage(error),
                )
            }
        }
    }

}

internal fun messageIdBatches(ids: List<String>): List<List<String>> =
    ids.distinct().chunked(50)
