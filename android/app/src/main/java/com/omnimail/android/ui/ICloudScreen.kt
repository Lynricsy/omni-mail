package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.data.model.ICloudAccount
import com.omnimail.android.data.model.ICloudAlias
import com.omnimail.android.data.model.ICloudMessage
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon
import com.omnimail.android.ui.components.SafeEmailWebView
import com.omnimail.android.ui.components.openExternalUrl

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ICloudScreen(state: AppUiState, viewModel: AppViewModel, contentPadding: PaddingValues) {
    val cloud = state.iCloud
    var showAccounts by remember { mutableStateOf(false) }
    var showAliases by remember { mutableStateOf(false) }
    var showAddAccount by remember { mutableStateOf(false) }
    var showAccountSettings by remember { mutableStateOf(false) }
    var showAliasSettings by remember { mutableStateOf(false) }
    var showCreateAliases by remember { mutableStateOf(false) }
    val selectedAccount = cloud.accounts.firstOrNull { it.id == cloud.selectedAccountId }
    val selectedAlias = cloud.aliases.firstOrNull { it.email == cloud.selectedAlias }

    BoxWithConstraints(
        Modifier.fillMaxSize().padding(contentPadding).navigationBarsPadding(),
    ) {
        val wide = maxWidth >= 760.dp
        BackHandler {
            if (!wide && cloud.selectedMessageId != null) viewModel.closeICloudMessage()
            else viewModel.openMail()
        }
        Column(Modifier.fillMaxSize()) {
            ICloudTopBar(
                loading = cloud.isLoadingAccounts || cloud.isLoadingAliases || cloud.isLoadingMessages,
                onBack = viewModel::openMail,
                onRefresh = viewModel::refreshICloud,
                onAddAccount = { showAddAccount = true },
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            when {
                cloud.isLoadingAccounts && cloud.accounts.isEmpty() -> LoadingPane(
                    stringResource(R.string.icloud_loading_accounts),
                    Modifier.fillMaxSize(),
                )
                cloud.accounts.isEmpty() -> ICloudEmptyAccounts { showAddAccount = true }
                else -> {
                    ICloudContextBar(
                        account = selectedAccount,
                        alias = selectedAlias,
                        method = cloud.method,
                        isBusy = cloud.isWorking,
                        onAccounts = { showAccounts = true },
                        onAliases = { showAliases = true },
                        onAccountSettings = { showAccountSettings = true },
                        onAliasSettings = { showAliasSettings = true },
                        onCreate = { showCreateAliases = true },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    if (wide) {
                        Row(Modifier.fillMaxSize()) {
                            ICloudMessageList(
                                cloud = cloud,
                                onSelect = viewModel::selectICloudMessage,
                                modifier = Modifier.weight(0.42f).fillMaxHeight(),
                            )
                            VerticalDivider(
                                Modifier.fillMaxHeight().width(1.dp),
                                color = MaterialTheme.colorScheme.outlineVariant,
                            )
                            ICloudReader(
                                state = state,
                                onBack = null,
                                modifier = Modifier.weight(0.58f).fillMaxHeight(),
                            )
                        }
                    } else if (cloud.selectedMessageId != null) {
                        ICloudReader(
                            state = state,
                            onBack = viewModel::closeICloudMessage,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        ICloudMessageList(
                            cloud = cloud,
                            onSelect = viewModel::selectICloudMessage,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        }
    }

    if (showAccounts) {
        SelectionSheet(
            title = stringResource(R.string.icloud_choose_account),
            onDismiss = { showAccounts = false },
        ) {
            cloud.accounts.forEach { account ->
                SelectionRow(
                    title = account.name,
                    detail = account.realEmail.ifBlank { account.host },
                    selected = account.id == cloud.selectedAccountId,
                ) {
                    showAccounts = false
                    viewModel.selectICloudAccount(account.id)
                }
            }
        }
    }
    if (showAliases) {
        SelectionSheet(
            title = stringResource(R.string.icloud_choose_alias),
            onDismiss = { showAliases = false },
        ) {
            SelectionRow(
                title = stringResource(R.string.icloud_all_mail),
                detail = stringResource(R.string.icloud_all_mail_detail),
                selected = cloud.selectedAlias.isEmpty(),
            ) {
                showAliases = false
                viewModel.selectICloudAlias("")
            }
            cloud.aliases.forEach { alias ->
                SelectionRow(
                    title = alias.email,
                    detail = buildString {
                        append(alias.label.ifBlank { stringResource(R.string.icloud_no_label) })
                        if (!alias.active) append(" · ").append(stringResource(R.string.icloud_inactive))
                    },
                    selected = alias.email == cloud.selectedAlias,
                ) {
                    showAliases = false
                    viewModel.selectICloudAlias(alias.email)
                }
            }
        }
    }
    if (showAddAccount) {
        ICloudAccountDialog(
            account = null,
            working = cloud.isWorking,
            onDismiss = { showAddAccount = false },
            onSave = { name, host, cookies, _, _, done ->
                viewModel.addICloudAccount(name, host, cookies) {
                    if (it) showAddAccount = false
                    done(it)
                }
            },
            onDelete = null,
        )
    }
    if (showAccountSettings && selectedAccount != null) {
        ICloudAccountDialog(
            account = selectedAccount,
            working = cloud.isWorking,
            onDismiss = { showAccountSettings = false },
            onSave = { name, _, cookies, email, password, done ->
                viewModel.updateICloudAccount(
                    selectedAccount.id,
                    name,
                    cookies.takeIf(String::isNotBlank),
                    email.takeIf(String::isNotBlank),
                    password.takeIf(String::isNotBlank),
                ) {
                    if (it) showAccountSettings = false
                    done(it)
                }
            },
            onDelete = { done ->
                viewModel.deleteICloudAccount(selectedAccount.id) {
                    if (it) showAccountSettings = false
                    done(it)
                }
            },
        )
    }
    if (showAliasSettings && selectedAlias != null) {
        ICloudAliasDialog(
            alias = selectedAlias,
            working = cloud.isWorking,
            onDismiss = { showAliasSettings = false },
            onToggle = { done ->
                viewModel.updateICloudAlias(
                    selectedAlias.anonymousId,
                    if (selectedAlias.active) "deactivate" else "reactivate",
                ) {
                    if (it) showAliasSettings = false
                    done(it)
                }
            },
            onDelete = { done ->
                viewModel.deleteICloudAlias(selectedAlias.anonymousId) {
                    if (it) showAliasSettings = false
                    done(it)
                }
            },
        )
    }
    if (showCreateAliases) {
        ICloudAliasBatchDialog(
            cloud = cloud,
            onDismiss = { showCreateAliases = false },
            onPreview = viewModel::previewICloudAlias,
            onCreate = viewModel::createICloudAliases,
        )
    }
}

@Composable
private fun ICloudTopBar(
    loading: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onAddAccount: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            LineIcon(AppIcon.Back, stringResource(R.string.back_to_mail))
        }
        Column(Modifier.weight(1f)) {
            Text("iCloud", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                stringResource(R.string.icloud_hide_my_email),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        IconButton(onClick = onRefresh, enabled = !loading) {
            if (loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            else LineIcon(AppIcon.Refresh, stringResource(R.string.icloud_refresh))
        }
        IconButton(onClick = onAddAccount) {
            LineIcon(AppIcon.Edit, stringResource(R.string.icloud_add_account))
        }
    }
}

@Composable
private fun ICloudContextBar(
    account: ICloudAccount?,
    alias: ICloudAlias?,
    method: String,
    isBusy: Boolean,
    onAccounts: () -> Unit,
    onAliases: () -> Unit,
    onAccountSettings: () -> Unit,
    onAliasSettings: () -> Unit,
    onCreate: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onAccounts, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text(account?.name ?: "iCloud", maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.width(6.dp))
                LineIcon(AppIcon.Expand, null, Modifier.size(18.dp))
            }
            IconButton(onClick = onAccountSettings, enabled = account != null) {
                LineIcon(AppIcon.Settings, stringResource(R.string.icloud_account_settings))
            }
            FilledTonalButton(onClick = onCreate, enabled = account != null && !isBusy) {
                Text(stringResource(R.string.icloud_create_alias))
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onAliases, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) {
                Text(
                    alias?.email ?: stringResource(R.string.icloud_all_mail),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.width(6.dp))
                LineIcon(AppIcon.Expand, null, Modifier.size(18.dp))
            }
            IconButton(onClick = onAliasSettings, enabled = alias != null) {
                LineIcon(AppIcon.Settings, stringResource(R.string.icloud_alias_settings))
            }
            if (method.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Text(
                        if (method == "imap") "IMAP" else "WEB",
                        Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                }
            }
        }
    }
}

@Composable
private fun ICloudMessageList(
    cloud: ICloudUiState,
    onSelect: (String) -> Unit,
    modifier: Modifier,
) {
    when {
        cloud.isLoadingMessages && cloud.messages.isEmpty() -> LoadingPane(
            stringResource(R.string.icloud_loading_messages), modifier,
        )
        cloud.messages.isEmpty() -> EmptyPane(
            title = stringResource(R.string.icloud_empty_mail),
            detail = stringResource(R.string.icloud_empty_mail_detail),
            modifier = modifier,
        )
        else -> LazyColumn(modifier, contentPadding = PaddingValues(vertical = 8.dp)) {
            items(cloud.messages, key = { it.id }) { message ->
                val sender = parseICloudSender(message.from)
                Surface(
                    color = if (message.id == cloud.selectedMessageId) {
                        MaterialTheme.colorScheme.secondaryContainer
                    } else {
                        MaterialTheme.colorScheme.surface
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = { onSelect(message.id) }),
                ) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                sender.name.ifBlank { sender.address.ifBlank {
                                    stringResource(R.string.unknown_sender)
                                } },
                                Modifier.weight(1f),
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                compactICloudDate(message.date),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            message.subject.ifBlank { stringResource(R.string.no_subject) },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (message.preview.isNotBlank()) {
                            Spacer(Modifier.height(3.dp))
                            Text(
                                message.preview,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

@Composable
private fun ICloudReader(state: AppUiState, onBack: (() -> Unit)?, modifier: Modifier) {
    val cloud = state.iCloud
    val message = cloud.messageDetail
    when {
        cloud.selectedMessageId == null -> EmptyPane(
            stringResource(R.string.icloud_select_message),
            stringResource(R.string.icloud_select_message_detail),
            modifier,
        )
        cloud.isDetailLoading || message == null -> LoadingPane(
            stringResource(R.string.icloud_loading_message), modifier,
        )
        else -> ICloudMessageContent(state, message, onBack, modifier)
    }
}

@Composable
private fun ICloudMessageContent(
    state: AppUiState,
    message: ICloudMessage,
    onBack: (() -> Unit)?,
    modifier: Modifier,
) {
    val context = LocalContext.current
    var pendingLink by remember { mutableStateOf<String?>(null) }
    val sender = remember(message.from) { parseICloudSender(message.from) }
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    Column(modifier) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onBack != null) {
                    IconButton(onClick = onBack) {
                        LineIcon(AppIcon.Back, stringResource(R.string.back_to_message_list))
                    }
                }
                Text(
                    message.subject.ifBlank { stringResource(R.string.no_subject) },
                    Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                sender.name.ifBlank { sender.address },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            if (sender.isRelay) {
                Text(
                    stringResource(R.string.icloud_relay_sender),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (sender.name.isNotBlank() && sender.address.isNotBlank()) {
                Text(
                    sender.address,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SafeEmailWebView(
            html = message.html.ifBlank {
                "<div class=\"omnimail-plain-text\">${htmlEscape(message.body.ifBlank { message.preview })}</div>"
            },
            loadRemoteImages = state.readerPreferences.loadRemoteImages,
            darkTheme = dark,
            modifier = Modifier.weight(1f),
            onExternalLink = { link ->
                if (state.readerPreferences.confirmExternalLinks) pendingLink = link
                else openExternalUrl(context, link)
            },
        )
    }
    pendingLink?.let { link ->
        AlertDialog(
            onDismissRequest = { pendingLink = null },
            title = { Text(stringResource(R.string.open_external_link_title)) },
            text = { Text(link) },
            confirmButton = {
                TextButton(onClick = {
                    pendingLink = null
                    openExternalUrl(context, link)
                }) { Text(stringResource(R.string.open_in_browser)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingLink = null }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun ICloudEmptyAccounts(onAdd: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 420.dp).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            LineIcon(AppIcon.Globe, null, Modifier.size(48.dp), MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            Text(stringResource(R.string.icloud_no_accounts), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.icloud_no_accounts_detail),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onAdd, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.icloud_add_first_account))
            }
        }
    }
}

@Composable
private fun LoadingPane(label: String, modifier: Modifier = Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(Modifier.height(12.dp))
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectionSheet(title: String, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            content()
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun SelectionRow(title: String, detail: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface,
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    detail,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (selected) LineIcon(AppIcon.Check, null, color = MaterialTheme.colorScheme.primary)
        }
    }
    Spacer(Modifier.height(4.dp))
}

internal data class ICloudSender(val name: String, val address: String, val isRelay: Boolean)

internal fun parseICloudSender(value: String): ICloudSender {
    val matched = Regex("^(.*?)\\s*<([^>]+)>$").find(value.trim())
    val name = matched?.groupValues?.get(1)?.trim()?.trim('"').orEmpty()
    val address = (matched?.groupValues?.get(2) ?: value.trim()).lowercase()
    val relay = Regex("_at_.+_[a-z0-9]{8,}_[a-z0-9]{6,}@icloud\\.com$", RegexOption.IGNORE_CASE)
        .containsMatchIn(address)
    return ICloudSender(name, address, relay)
}

internal fun compactICloudDate(value: String): String = value
    .replace('T', ' ')
    .removeSuffix("Z")
    .take(16)
