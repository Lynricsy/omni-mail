package com.omnimail.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.model.MailboxScope
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon
import com.omnimail.android.ui.components.OmniMailLogo

@Composable
internal fun MailNavigationPane(
    state: AppUiState,
    onFolder: (MailFolder) -> Unit,
    onMailboxScope: (MailboxScope) -> Unit,
    onCompose: () -> Unit,
    onICloud: () -> Unit,
    onDrafts: () -> Unit,
    onProfile: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxHeight()
            .background(MaterialTheme.colorScheme.surface)
            .navigationBarsPadding()
            .padding(horizontal = 12.dp, vertical = 16.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OmniMailLogo(Modifier.size(44.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    state.appName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    state.user?.email.orEmpty(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        if (state.canComposeNew()) {
            ExtendedFloatingActionButton(
                onClick = onCompose,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                icon = { LineIcon(AppIcon.Edit, null) },
                text = {
                    Text(
                        stringResource(R.string.write_mail),
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(12.dp))
        }
        MailboxScopeSelector(
            state = state,
            onSelect = onMailboxScope,
            modifier = Modifier.padding(horizontal = 4.dp),
        )
        Spacer(Modifier.height(18.dp))
        MailFolder.entries.forEach { folder ->
            MailNavigationRow(
                icon = folder.icon(),
                label = folder.label(),
                selected = state.folder == folder,
                count = state.folderCount(folder),
                onClick = { onFolder(folder) },
            )
            Spacer(Modifier.height(2.dp))
        }
        MailNavigationRow(
            AppIcon.Globe,
            stringResource(R.string.icloud_hide_my_email),
            onClick = onICloud,
        )
        Spacer(Modifier.height(2.dp))
        if (state.canSendMail) {
            MailNavigationRow(
                AppIcon.Edit,
                stringResource(R.string.folder_drafts),
                count = state.counts.drafts,
                onClick = onDrafts,
            )
        }
        HorizontalDivider(Modifier.padding(horizontal = 12.dp, vertical = 12.dp))
        MailNavigationRow(AppIcon.Profile, stringResource(R.string.profile), onClick = onProfile)
        Spacer(Modifier.height(2.dp))
        MailNavigationRow(AppIcon.Settings, stringResource(R.string.settings), onClick = onSettings)
        Spacer(Modifier.weight(1f))
        MailNavigationRow(
            icon = AppIcon.Logout,
            label = stringResource(R.string.log_out),
            contentColor = MaterialTheme.colorScheme.error,
            onClick = onLogout,
        )
    }
}

@Composable
private fun MailNavigationRow(
    icon: AppIcon,
    label: String,
    selected: Boolean = false,
    count: Int = 0,
    contentColor: Color? = null,
    onClick: () -> Unit,
) {
    val foreground = contentColor ?: if (selected) {
        MaterialTheme.colorScheme.onSecondaryContainer
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        Modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(RoundedCornerShape(26.dp))
            .background(
                if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent,
            )
            .clickable(
                role = if (contentColor == null) Role.Tab else Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LineIcon(icon, null, color = foreground)
        Spacer(Modifier.width(18.dp))
        Text(
            label,
            modifier = Modifier.weight(1f),
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = foreground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (count > 0) {
            Surface(
                shape = CircleShape,
                color = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
            ) {
                Text(
                    count.coerceAtMost(999).toString(),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (selected) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

internal fun MailFolder.icon(): AppIcon = when (this) {
    MailFolder.Inbox -> AppIcon.Inbox
    MailFolder.Starred -> AppIcon.Star
    MailFolder.Sent -> AppIcon.Send
    MailFolder.Trash -> AppIcon.Trash
}

@Composable
internal fun MailFolder.label(): String = when (this) {
    MailFolder.Inbox -> stringResource(R.string.folder_inbox)
    MailFolder.Starred -> stringResource(R.string.folder_starred)
    MailFolder.Sent -> stringResource(R.string.folder_sent)
    MailFolder.Trash -> stringResource(R.string.folder_trash)
}

internal fun AppUiState.folderCount(folder: MailFolder): Int = when (folder) {
    MailFolder.Inbox -> counts.unread
    MailFolder.Starred -> counts.starred
    MailFolder.Sent -> counts.sent
    MailFolder.Trash -> counts.trash
}

internal fun AppUiState.folderSummary(loaded: String, unread: String): String {
    if (messages.isEmpty()) return ""
    return if (folder == MailFolder.Inbox && counts.unread > 0) "$loaded · $unread" else loaded
}
