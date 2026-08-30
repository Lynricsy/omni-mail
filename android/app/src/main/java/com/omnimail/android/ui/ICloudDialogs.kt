package com.omnimail.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.omnimail.android.R
import com.omnimail.android.data.model.ICloudAccount
import com.omnimail.android.data.model.ICloudAlias
import com.omnimail.android.data.model.ICloudAliasPreview
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@Composable
internal fun ICloudAccountDialog(
    account: ICloudAccount?,
    working: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, String, (Boolean) -> Unit) -> Unit,
    onDelete: (((Boolean) -> Unit) -> Unit)?,
) {
    var name by rememberSaveable(account?.id) { mutableStateOf(account?.name.orEmpty()) }
    var host by rememberSaveable(account?.id) { mutableStateOf(account?.host ?: "icloud.com") }
    var cookies by rememberSaveable(account?.id) { mutableStateOf("") }
    var email by rememberSaveable(account?.id) { mutableStateOf(account?.icloudEmail.orEmpty()) }
    var password by rememberSaveable(account?.id) { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val busy = working || saving
    val valid = name.trim().isNotEmpty() && (account != null || cookies.trim().isNotEmpty())

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = {
            Text(stringResource(if (account == null) R.string.icloud_add_account else R.string.icloud_account_settings))
        },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    stringResource(R.string.icloud_account_requirement),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(80) },
                    label = { Text(stringResource(R.string.icloud_account_name)) },
                    singleLine = true,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (account == null) {
                    Text(stringResource(R.string.icloud_region), fontWeight = FontWeight.Medium)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("icloud.com", "icloud.com.cn").forEach { option ->
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .heightIn(min = 48.dp)
                                    .selectable(
                                        selected = host == option,
                                        enabled = !busy,
                                        role = Role.RadioButton,
                                    ) { host = option },
                                shape = RoundedCornerShape(16.dp),
                                color = if (host == option) {
                                    MaterialTheme.colorScheme.secondaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                            ) {
                                Text(option, Modifier.padding(14.dp))
                            }
                        }
                    }
                }
                OutlinedTextField(
                    value = cookies,
                    onValueChange = { cookies = it },
                    label = { Text("iCloud Cookie") },
                    supportingText = {
                        Text(stringResource(if (account == null) R.string.icloud_cookie_required else R.string.icloud_cookie_optional))
                    },
                    minLines = 3,
                    maxLines = 6,
                    enabled = !busy,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (account != null) {
                    HorizontalDivider()
                    Text(stringResource(R.string.icloud_imap_credentials), fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it.take(254) },
                        label = { Text(stringResource(R.string.icloud_email)) },
                        singleLine = true,
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it.take(64) },
                        label = { Text(stringResource(R.string.icloud_app_password)) },
                        supportingText = { Text(stringResource(R.string.icloud_password_optional)) },
                        singleLine = true,
                        enabled = !busy,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (onDelete != null) {
                        HorizontalDivider()
                        OutlinedButton(
                            onClick = { confirmDelete = true },
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        ) {
                            LineIcon(AppIcon.Trash, null, color = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(8.dp))
                            Text(stringResource(R.string.icloud_delete_account), color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    saving = true
                    onSave(name, host, cookies, email, password) { saving = false }
                },
                enabled = valid && !busy,
            ) {
                if (busy) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(stringResource(R.string.save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text(stringResource(R.string.cancel))
            }
        },
    )
    if (confirmDelete && onDelete != null) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirmDelete = false },
            title = { Text(stringResource(R.string.icloud_delete_account_title)) },
            text = { Text(stringResource(R.string.icloud_delete_account_detail)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        saving = true
                        onDelete { saving = false }
                    },
                    enabled = !busy,
                ) { Text(stringResource(R.string.icloud_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }, enabled = !busy) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
internal fun ICloudAliasDialog(
    alias: ICloudAlias,
    working: Boolean,
    onDismiss: () -> Unit,
    onToggle: ((Boolean) -> Unit) -> Unit,
    onDelete: ((Boolean) -> Unit) -> Unit,
) {
    val context = LocalContext.current
    var saving by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val busy = working || saving
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(stringResource(R.string.icloud_alias_settings)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(alias.email, style = MaterialTheme.typography.titleMedium)
                Text(
                    alias.label.ifBlank { stringResource(R.string.icloud_no_label) },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedButton(
                    onClick = { copyText(context, alias.email) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    LineIcon(AppIcon.Link, null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.icloud_copy_alias))
                }
                OutlinedButton(
                    onClick = {
                        saving = true
                        onToggle { saving = false }
                    },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    Text(stringResource(if (alias.active) R.string.icloud_deactivate_alias else R.string.icloud_reactivate_alias))
                }
                TextButton(
                    onClick = { confirmDelete = true },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.icloud_delete_alias), color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text(stringResource(R.string.cancel)) }
        },
    )
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirmDelete = false },
            title = { Text(stringResource(R.string.icloud_delete_alias_title)) },
            text = { Text(stringResource(R.string.icloud_delete_alias_detail, alias.email)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        saving = true
                        onDelete { saving = false }
                    },
                    enabled = !busy,
                ) { Text(stringResource(R.string.icloud_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }, enabled = !busy) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

private data class AliasDraftUi(
    val key: Long,
    val label: String = "",
    val email: String = "",
    val previewId: String = "",
    val loading: Boolean = false,
    val error: String = "",
)

@Composable
internal fun ICloudAliasBatchDialog(
    cloud: ICloudUiState,
    onDismiss: () -> Unit,
    onPreview: ((ICloudAliasPreview?, String?) -> Unit) -> Unit,
    onCreate: (List<ICloudAliasCandidate>, (Int, String?) -> Unit) -> Unit,
) {
    var nextKey by remember { mutableLongStateOf(2L) }
    var drafts by remember { mutableStateOf(listOf(AliasDraftUi(1))) }
    var activeKey by remember { mutableLongStateOf(1L) }
    var submitError by remember { mutableStateOf("") }
    val presets = listOf(
        stringResource(R.string.icloud_label_shopping),
        stringResource(R.string.icloud_label_social),
        stringResource(R.string.icloud_label_subscription),
        stringResource(R.string.icloud_label_work),
        stringResource(R.string.icloud_label_temporary),
    )

    fun preview(key: Long) {
        drafts = drafts.map { if (it.key == key) it.copy(loading = true, error = "") else it }
        onPreview { result, error ->
            drafts = drafts.map {
                if (it.key == key) it.copy(
                    email = result?.email.orEmpty(),
                    previewId = result?.previewId.orEmpty(),
                    loading = false,
                    error = error.orEmpty(),
                ) else it
            }
        }
    }

    LaunchedEffect(Unit) { preview(1) }
    Dialog(
        onDismissRequest = { if (!cloud.isWorking) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            Modifier.fillMaxWidth().padding(16.dp).widthIn(max = 720.dp).heightIn(max = 680.dp),
            shape = RoundedCornerShape(28.dp),
            tonalElevation = 6.dp,
        ) {
            Column(Modifier.padding(20.dp).navigationBarsPadding()) {
                Text(stringResource(R.string.icloud_create_alias), style = MaterialTheme.typography.headlineSmall)
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.icloud_batch_detail),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (cloud.isWorking) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        stringResource(R.string.icloud_batch_progress, cloud.batchCompleted, cloud.batchTotal),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Spacer(Modifier.height(6.dp))
                    LinearProgressIndicator(
                        progress = { if (cloud.batchTotal == 0) 0f else cloud.batchCompleted.toFloat() / cloud.batchTotal },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Column(
                    Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    drafts.forEachIndexed { index, draft ->
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Column(Modifier.padding(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        stringResource(R.string.icloud_alias_number, index + 1),
                                        Modifier.weight(1f),
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    IconButton(
                                        onClick = { preview(draft.key) },
                                        enabled = drafts.none { it.loading } && !cloud.isWorking,
                                    ) {
                                        if (draft.loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                                        else LineIcon(AppIcon.Refresh, stringResource(R.string.icloud_change_candidate))
                                    }
                                    if (drafts.size > 1) {
                                        IconButton(
                                            onClick = { drafts = drafts.filterNot { it.key == draft.key } },
                                            enabled = drafts.none { it.loading } && !cloud.isWorking,
                                        ) {
                                            LineIcon(
                                                AppIcon.Trash,
                                                stringResource(R.string.icloud_remove_candidate),
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        }
                                    }
                                }
                                Text(
                                    draft.email.ifBlank { stringResource(R.string.icloud_generating_candidate) },
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                                OutlinedTextField(
                                    value = draft.label,
                                    onValueChange = { value ->
                                        activeKey = draft.key
                                        drafts = drafts.map {
                                            if (it.key == draft.key) it.copy(label = value.take(80)) else it
                                        }
                                    },
                                    label = { Text(stringResource(R.string.icloud_label_optional)) },
                                    singleLine = true,
                                    enabled = !cloud.isWorking,
                                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                )
                                if (draft.error.isNotBlank()) {
                                    Text(
                                        draft.error,
                                        Modifier.padding(top = 6.dp),
                                        color = MaterialTheme.colorScheme.error,
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        AssistChip(
                            onClick = {
                                drafts = drafts.map { if (it.key == activeKey) it.copy(label = "") else it }
                            },
                            label = { Text(stringResource(R.string.icloud_label_auto)) },
                            enabled = !cloud.isWorking,
                        )
                    }
                    items(presets) { preset ->
                        AssistChip(
                            onClick = {
                                drafts = drafts.map {
                                    if (it.key == activeKey) it.copy(label = preset) else it
                                }
                            },
                            label = { Text(preset) },
                            enabled = !cloud.isWorking,
                        )
                    }
                }
                if (submitError.isNotBlank()) {
                    Text(
                        submitError,
                        Modifier.padding(top = 6.dp),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    OutlinedButton(
                        onClick = {
                            val key = nextKey++
                            drafts = drafts + AliasDraftUi(key)
                            activeKey = key
                            preview(key)
                        },
                        enabled = drafts.size < 5 && drafts.none { it.loading } && !cloud.isWorking,
                    ) { Text(stringResource(R.string.icloud_add_one)) }
                    TextButton(onClick = onDismiss, enabled = !cloud.isWorking) {
                        Text(stringResource(R.string.cancel))
                    }
                    Button(
                        onClick = {
                            submitError = ""
                            val candidates = drafts.map {
                                ICloudAliasCandidate(it.label, it.email, it.previewId)
                            }
                            onCreate(candidates) { completed, error ->
                                if (error == null) onDismiss() else {
                                    drafts = drafts.drop(completed).ifEmpty { drafts }
                                    activeKey = drafts.firstOrNull()?.key ?: activeKey
                                    submitError = error
                                }
                            }
                        },
                        enabled = drafts.all { it.email.isNotBlank() && it.previewId.isNotBlank() && !it.loading } && !cloud.isWorking,
                    ) { Text(stringResource(R.string.icloud_create_count, drafts.size)) }
                }
            }
        }
    }
}

private fun copyText(context: Context, value: String) {
    context.getSystemService(ClipboardManager::class.java)
        .setPrimaryClip(ClipData.newPlainText("iCloud Hide My Email", value))
}
