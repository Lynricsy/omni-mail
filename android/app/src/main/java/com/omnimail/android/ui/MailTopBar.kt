package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@Composable
internal fun MailTopBar(
    state: AppUiState,
    viewModel: AppViewModel,
    onOpenNavigation: (() -> Unit)? = null,
    showProfile: Boolean = true,
) {
    var searchActive by rememberSaveable { mutableStateOf(state.searchQuery.isNotBlank()) }
    val focusRequester = androidx.compose.runtime.remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val closeSearch = {
        searchActive = false
        focusManager.clearFocus()
        keyboard?.hide()
        if (state.searchQuery.isNotEmpty()) viewModel.updateSearchQuery("")
    }
    BackHandler(enabled = searchActive, onBack = closeSearch)
    LaunchedEffect(searchActive) {
        if (searchActive) focusRequester.requestFocus()
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .heightIn(min = 64.dp),
        shape = RoundedCornerShape(32.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 0.dp,
    ) {
        if (searchActive) {
            SearchContent(state, viewModel, closeSearch, focusRequester)
        } else {
            DefaultTopBarContent(state, viewModel, onOpenNavigation, showProfile) {
                searchActive = true
            }
        }
    }
}

@Composable
private fun SearchContent(
    state: AppUiState,
    viewModel: AppViewModel,
    closeSearch: () -> Unit,
    focusRequester: FocusRequester,
) {
    val keyboard = LocalSoftwareKeyboardController.current
    Row(
        Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = closeSearch) {
            LineIcon(AppIcon.Back, stringResource(R.string.close_search))
        }
        TextField(
            value = state.searchQuery,
            onValueChange = viewModel::updateSearchQuery,
            placeholder = {
                Text(
                    stringResource(R.string.search_mail_hint),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            },
            trailingIcon = {
                when {
                    state.isRefreshing -> CircularProgressIndicator(
                        Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                    )
                    state.searchQuery.isNotEmpty() -> IconButton(
                        onClick = { viewModel.updateSearchQuery("") },
                    ) {
                        LineIcon(AppIcon.Close, stringResource(R.string.clear_search))
                    }
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                viewModel.refresh()
                keyboard?.hide()
            }),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.weight(1f).focusRequester(focusRequester),
        )
    }
}

@Composable
private fun DefaultTopBarContent(
    state: AppUiState,
    viewModel: AppViewModel,
    onOpenNavigation: (() -> Unit)?,
    showProfile: Boolean,
    onSearch: () -> Unit,
) {
    val summary = if (state.isOffline) {
        stringResource(R.string.offline_cached_mail)
    } else {
        state.folderSummary(
            loaded = stringResource(R.string.messages_loaded, state.messages.size),
            unread = stringResource(R.string.messages_unread, state.counts.unread),
        )
    }
    Row(
        Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onOpenNavigation != null) {
            IconButton(onClick = onOpenNavigation) {
                LineIcon(AppIcon.Menu, stringResource(R.string.open_navigation))
            }
        } else {
            Spacer(Modifier.width(8.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
            Text(
                state.folder.label(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (summary.isNotBlank()) {
                Text(
                    summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = onSearch) {
            LineIcon(AppIcon.Search, stringResource(R.string.search_mail))
        }
        IconButton(onClick = viewModel::refresh, enabled = !state.isRefreshing) {
            LineIcon(AppIcon.Refresh, stringResource(R.string.refresh_mail))
        }
        if (showProfile) AccountAvatarButton(state, viewModel::openProfile)
    }
}

@Composable
private fun AccountAvatarButton(state: AppUiState, onClick: () -> Unit) {
    val profileLabel = stringResource(R.string.profile)
    val initial = state.user?.displayName.orEmpty()
        .ifBlank { state.user?.email.orEmpty() }
        .firstOrNull()?.uppercase() ?: "?"
    IconButton(
        onClick = onClick,
        modifier = Modifier.semantics { contentDescription = profileLabel },
    ) {
        Surface(
            modifier = Modifier.size(34.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primary,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    initial,
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
