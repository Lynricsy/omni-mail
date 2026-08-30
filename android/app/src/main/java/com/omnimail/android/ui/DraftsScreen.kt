package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.data.model.DraftSummary
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@Composable
fun DraftsScreen(state: AppUiState, viewModel: AppViewModel, contentPadding: PaddingValues) {
    BackHandler(onBack = viewModel::openMail)
    var deleting by remember { mutableStateOf<DraftSummary?>(null) }
    Column(Modifier.fillMaxSize().padding(contentPadding).navigationBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = viewModel::openMail) {
                LineIcon(AppIcon.Back, stringResource(R.string.back_to_mail))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.folder_drafts),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    pluralStringResource(
                        R.plurals.drafts_count,
                        state.drafts.drafts.size,
                        state.drafts.drafts.size,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = viewModel::openDrafts, enabled = !state.drafts.isLoading) {
                if (state.drafts.isLoading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    LineIcon(AppIcon.Refresh, stringResource(R.string.refresh_mail))
                }
            }
            IconButton(onClick = viewModel::openComposer, enabled = state.canComposeNew()) {
                LineIcon(AppIcon.Edit, stringResource(R.string.compose_mail))
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        when {
            state.drafts.isLoading && state.drafts.drafts.isEmpty() -> Box(
                Modifier.fillMaxSize(), contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }
            state.drafts.drafts.isEmpty() -> Box(
                Modifier.fillMaxSize(), contentAlignment = Alignment.Center,
            ) {
                Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(R.string.drafts_empty), style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.drafts_empty_detail),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = viewModel::openComposer,
                        enabled = state.canComposeNew(),
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text(stringResource(R.string.compose_mail)) }
                }
            }
            else -> LazyColumn(
                Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                items(state.drafts.drafts, key = { it.id }) { draft ->
                    DraftRow(
                        draft = draft,
                        onOpen = { viewModel.openDraft(draft.id) },
                        onDelete = { deleting = draft },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
    deleting?.let { draft ->
        AlertDialog(
            onDismissRequest = { if (!state.drafts.isWorking) deleting = null },
            title = { Text(stringResource(R.string.discard_draft_title)) },
            text = {
                Text(stringResource(R.string.discard_draft_detail, draft.subject.ifBlank {
                    stringResource(R.string.no_subject)
                }))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        deleting = null
                        viewModel.deleteDraft(draft.id)
                    },
                    enabled = !state.drafts.isWorking,
                ) { Text(stringResource(R.string.discard), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { deleting = null }, enabled = !state.drafts.isWorking) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun DraftRow(draft: DraftSummary, onOpen: () -> Unit, onDelete: () -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    draft.subject.ifBlank { stringResource(R.string.no_subject) },
                    Modifier.weight(1f),
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    formatFullDate(draft.updatedAt, locale),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(3.dp))
            Text(
                stringResource(
                    R.string.draft_to,
                    draft.to.ifBlank { stringResource(R.string.draft_no_recipient) },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (draft.preview.isNotBlank()) {
                Text(
                    draft.preview,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (draft.attachmentCount > 0) {
                Text(
                    pluralStringResource(
                        R.plurals.draft_attachments_count,
                        draft.attachmentCount,
                        draft.attachmentCount,
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
        IconButton(onClick = onDelete) {
            LineIcon(
                AppIcon.Trash,
                stringResource(R.string.discard),
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
