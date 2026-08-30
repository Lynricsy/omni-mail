package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.omnimail.android.R
import com.omnimail.android.data.model.MailboxAddress
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@Composable
internal fun ComposeScreen(
    state: AppUiState,
    viewModel: AppViewModel,
    contentPadding: PaddingValues,
) {
    val composer = state.composer ?: return
    val context = LocalContext.current
    val attachmentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris -> viewModel.addComposerUris(uris, context.contentResolver) }
    val isReply = composer.replyMessageId != null
    val isForward = composer.isForward
    var confirmDiscard by rememberSaveable(composer.idempotencyKey) { mutableStateOf(false) }
    val hasEdits = composer.attachments.isNotEmpty() || composer.text.isNotBlank() || (!isReply && (
        composer.to.isNotBlank() || composer.subject.isNotBlank()
    ))
    val requestClose = {
        if ((isReply || composer.draftId == null) && hasEdits) {
            confirmDiscard = true
        } else {
            viewModel.closeComposer()
        }
    }
    BackHandler(
        enabled = !state.isSending && !composer.isUploadingAttachment,
        onBack = requestClose,
    )

    Column(
        Modifier
            .fillMaxSize()
            .padding(contentPadding)
            .navigationBarsPadding()
            .imePadding(),
    ) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = requestClose, enabled = !state.isSending) {
                LineIcon(AppIcon.Back, stringResource(R.string.close_composer))
            }
            Text(
                stringResource(
                    when {
                        isReply -> R.string.reply_mail
                        isForward -> R.string.forward_mail
                        else -> R.string.compose_mail
                    },
                ),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            if (!isReply) {
                Text(
                    stringResource(
                        if (composer.isDraftSaving) R.string.draft_saving else R.string.draft_saved,
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                IconButton(
                    onClick = { confirmDiscard = true },
                    enabled = !state.isSending && !composer.isUploadingAttachment,
                ) {
                    LineIcon(
                        AppIcon.Trash,
                        stringResource(R.string.discard),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            Button(
                onClick = viewModel::sendComposer,
                enabled = composer.isReadyToSend() && !state.isSending &&
                    !composer.isDraftSaving && !composer.isUploadingAttachment,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
            ) {
                if (state.isSending) {
                    CircularProgressIndicator(
                        Modifier.size(18.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                } else {
                    LineIcon(AppIcon.Send, null, Modifier.size(18.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(
                        when {
                            isReply -> R.string.send_reply
                            else -> R.string.send_mail
                        },
                    ),
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            if (isReply) {
                ReadOnlyComposerField(
                    label = stringResource(R.string.from_mailbox),
                    value = composer.mailboxAddress,
                )
            } else {
                ComposeMailboxSelector(
                    mailboxes = state.mailboxes.filter { it.isActive },
                    value = composer.mailboxAddress,
                    enabled = !state.isSending,
                    onSelect = viewModel::updateComposerMailbox,
                )
            }
            ComposerLineField(
                label = stringResource(R.string.to_recipient),
                value = composer.to,
                onValueChange = viewModel::updateComposerTo,
                enabled = !state.isSending,
                readOnly = isReply,
                placeholder = "name@example.com",
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
            )
            ComposerLineField(
                label = stringResource(R.string.mail_subject),
                value = composer.subject,
                onValueChange = viewModel::updateComposerSubject,
                enabled = !state.isSending,
                readOnly = isReply,
                placeholder = stringResource(R.string.mail_subject_hint),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Next,
                ),
            )
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = { attachmentPicker.launch(arrayOf("*/*")) },
                    enabled = !state.isSending && !composer.isUploadingAttachment &&
                        composer.attachments.size < 5,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    if (composer.isUploadingAttachment) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        LineIcon(AppIcon.Attachment, null, Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        stringResource(
                            if (composer.isUploadingAttachment) {
                                R.string.attachments_uploading
                            } else {
                                R.string.add_attachments
                            },
                        ),
                    )
                }
            }
            if (composer.attachments.isNotEmpty()) {
                LazyRow(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp),
                ) {
                    items(composer.attachments, key = { it.id }) { attachment ->
                        Surface(
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                            color = MaterialTheme.colorScheme.secondaryContainer,
                            modifier = Modifier.padding(end = 8.dp),
                        ) {
                            Row(
                                Modifier.heightIn(min = 48.dp).padding(start = 12.dp, end = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    attachment.filename,
                                    modifier = Modifier.widthIn(max = 180.dp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                IconButton(
                                    onClick = { viewModel.removeComposerAttachment(attachment.id) },
                                    enabled = !composer.isUploadingAttachment && !state.isSending,
                                ) {
                                    LineIcon(AppIcon.Close, stringResource(R.string.remove_attachment))
                                }
                            }
                        }
                    }
                }
            }
            BasicTextField(
                value = composer.text,
                onValueChange = viewModel::updateComposerText,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 240.dp)
                    .padding(horizontal = 8.dp, vertical = 20.dp),
                enabled = !state.isSending,
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                ),
                decorationBox = { innerTextField ->
                    Box {
                        if (composer.text.isEmpty()) {
                            Text(
                                stringResource(
                                    if (isReply) R.string.reply_hint else R.string.mail_body_hint,
                                ),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        innerTextField()
                    }
                },
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                LineIcon(
                    AppIcon.Shield,
                    null,
                    Modifier.size(18.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(R.string.secure_send_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text(stringResource(R.string.discard_mail_title)) },
            text = { Text(stringResource(R.string.discard_mail_detail)) },
            confirmButton = {
                TextButton(onClick = viewModel::discardComposer) {
                    Text(stringResource(R.string.discard))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDiscard = false }) {
                    Text(stringResource(R.string.keep_editing))
                }
            },
        )
    }
}

@Composable
private fun ReadOnlyComposerField(label: String, value: String) {
    ComposerLine(
        label = label,
        value = value,
        trailing = null,
        onClick = null,
    )
}

@Composable
private fun ComposerLineField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    readOnly: Boolean,
    placeholder: String,
    keyboardOptions: KeyboardOptions,
) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            modifier = Modifier.width(72.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            enabled = enabled,
            readOnly = readOnly,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(
                color = MaterialTheme.colorScheme.onSurface,
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = keyboardOptions,
            decorationBox = { innerTextField ->
                Box {
                    if (value.isEmpty()) {
                        Text(
                            placeholder,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    innerTextField()
                }
            },
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun ComposerLine(
    label: String,
    value: String,
    trailing: AppIcon?,
    onClick: (() -> Unit)?,
) {
    Surface(
        onClick = onClick ?: {},
        modifier = Modifier.fillMaxWidth(),
        enabled = onClick != null,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            Modifier.heightIn(min = 56.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                modifier = Modifier.width(72.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(value, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (trailing != null) {
                LineIcon(trailing, null, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ComposeMailboxSelector(
    mailboxes: List<MailboxAddress>,
    value: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    ComposerLine(
        label = stringResource(R.string.from_mailbox),
        value = value,
        trailing = AppIcon.Expand,
        onClick = if (enabled) ({ open = true }) else null,
    )
    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }) {
            Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    stringResource(R.string.choose_sender),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                mailboxes.forEach { mailbox ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .selectable(
                                selected = mailbox.address == value,
                                role = Role.RadioButton,
                            ) {
                                open = false
                                onSelect(mailbox.address)
                            }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(mailbox.address, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (mailbox.isPrimary) {
                                Text(
                                    stringResource(R.string.primary_mailbox),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        if (mailbox.address == value) {
                            LineIcon(AppIcon.Check, null, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                Spacer(Modifier.size(8.dp))
            }
        }
    }
}
