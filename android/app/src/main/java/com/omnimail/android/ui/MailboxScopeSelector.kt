package com.omnimail.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MailboxScopeSelector(
    state: AppUiState,
    onSelect: (MailboxScope) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val activeMailboxes = state.mailboxes.filter { it.isActive }
    val groups = activeMailboxes.groupBy { it.domain }.toSortedMap()

    Surface(
        onClick = { open = true },
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LineIcon(AppIcon.Inbox, null, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.current_mailbox_scope),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    state.mailboxScope.label(),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            LineIcon(AppIcon.Expand, null, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 16.dp),
            ) {
                Text(
                    stringResource(R.string.choose_mailbox_scope),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                ScopeOption(
                    icon = AppIcon.Inbox,
                    label = stringResource(R.string.all_mailboxes),
                    detail = stringResource(R.string.active_mailboxes_count, activeMailboxes.size),
                    selected = state.mailboxScope == MailboxScope.All,
                ) {
                    open = false
                    onSelect(MailboxScope.All)
                }
                groups.forEach { (domain, mailboxes) ->
                    ScopeOption(
                        icon = AppIcon.Globe,
                        label = domain,
                        detail = stringResource(R.string.domain_mailboxes_count, mailboxes.size),
                        selected = state.mailboxScope == MailboxScope.Domain(domain),
                    ) {
                        open = false
                        onSelect(MailboxScope.Domain(domain))
                    }
                    mailboxes.sortedBy { it.address }.forEach { mailbox ->
                        ScopeOption(
                            icon = AppIcon.Inbox,
                            label = mailbox.address,
                            detail = if (mailbox.isPrimary) {
                                stringResource(R.string.primary_mailbox)
                            } else {
                                null
                            },
                            selected = state.mailboxScope == MailboxScope.Mailbox(mailbox.address),
                            indented = true,
                        ) {
                            open = false
                            onSelect(MailboxScope.Mailbox(mailbox.address))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScopeOption(
    icon: AppIcon,
    label: String,
    detail: String?,
    selected: Boolean,
    indented: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent,
            )
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(
                start = if (indented) 32.dp else 16.dp,
                end = 16.dp,
                top = 8.dp,
                bottom = 8.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LineIcon(icon, null, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            detail?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (selected) {
            LineIcon(
                AppIcon.Check,
                null,
                Modifier.size(20.dp),
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
internal fun MailboxScope.label(): String = when (this) {
    MailboxScope.All -> stringResource(R.string.all_mailboxes)
    is MailboxScope.Domain -> value
    is MailboxScope.Mailbox -> value
}
