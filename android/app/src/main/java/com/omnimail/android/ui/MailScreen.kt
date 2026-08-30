package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon
import kotlinx.coroutines.launch

@Composable
fun MailScreen(state: AppUiState, viewModel: AppViewModel, contentPadding: PaddingValues) {
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .padding(contentPadding),
    ) {
        when {
            maxWidth < 600.dp -> CompactMailLayout(state, viewModel)
            maxWidth < 840.dp -> MediumMailLayout(state, viewModel)
            else -> ExpandedMailLayout(state, viewModel)
        }
    }
}

@Composable
private fun CompactMailLayout(state: AppUiState, viewModel: AppViewModel) {
    val showingReader = state.selectedMessageId != null
    val motionEnabled = mailMotionEnabled()
    BackHandler(enabled = showingReader, onBack = viewModel::closeMessage)
    AnimatedContent(
        targetState = showingReader,
        transitionSpec = { compactReaderTransform(motionEnabled) },
        label = stringResource(R.string.mail_list_and_detail),
    ) { readerVisible ->
        if (readerVisible) {
            MessageReader(
                state = state,
                onBack = viewModel::closeMessage,
                onToggleStar = viewModel::toggleStar,
                onReply = viewModel::openReply,
                onForward = viewModel::openForward,
                onDownloadAttachment = viewModel::downloadAttachment,
            )
        } else {
            MailDrawerLayout(state, viewModel) { openDrawer ->
                Box(Modifier.fillMaxSize()) {
                    Column(Modifier.fillMaxSize()) {
                        MailTopBar(state, viewModel, onOpenNavigation = openDrawer)
                        MessageList(
                            state = state,
                            onSelect = viewModel::selectMessage,
                            onRefresh = viewModel::refresh,
                            onLoadMore = viewModel::loadMoreMessages,
                            onMarkAllRead = viewModel::markLoadedMessagesRead,
                            onAction = viewModel::performMessageAction,
                            modifier = Modifier.weight(1f),
                            bottomContentPadding = if (state.canComposeNew()) 96.dp else 8.dp,
                        )
                    }
                    if (state.canComposeNew()) {
                        ComposeMailButton(
                            onClick = viewModel::openComposer,
                            modifier = Modifier.align(Alignment.BottomEnd),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MediumMailLayout(state: AppUiState, viewModel: AppViewModel) {
    MailDrawerLayout(state, viewModel) { openDrawer ->
        Column(Modifier.fillMaxSize()) {
            MailTopBar(state, viewModel, onOpenNavigation = openDrawer)
            Row(Modifier.fillMaxSize()) {
                Box(Modifier.weight(.43f).fillMaxSize()) {
                    MessageList(
                        state = state,
                        onSelect = viewModel::selectMessage,
                        onRefresh = viewModel::refresh,
                        onLoadMore = viewModel::loadMoreMessages,
                        onMarkAllRead = viewModel::markLoadedMessagesRead,
                        onAction = viewModel::performMessageAction,
                        modifier = Modifier.fillMaxSize(),
                        bottomContentPadding = if (state.canComposeNew()) 96.dp else 8.dp,
                    )
                    if (state.canComposeNew()) {
                        ComposeMailButton(
                            onClick = viewModel::openComposer,
                            modifier = Modifier.align(Alignment.BottomEnd),
                        )
                    }
                }
                VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                MessageReader(
                    state = state,
                    onToggleStar = viewModel::toggleStar,
                    onReply = viewModel::openReply,
                    onForward = viewModel::openForward,
                    onDownloadAttachment = viewModel::downloadAttachment,
                    modifier = Modifier.weight(.57f),
                )
            }
        }
    }
}

@Composable
private fun ExpandedMailLayout(state: AppUiState, viewModel: AppViewModel) {
    Row(Modifier.fillMaxSize()) {
        MailNavigationPane(
            state = state,
            onFolder = viewModel::selectFolder,
            onMailboxScope = viewModel::selectMailboxScope,
            onCompose = viewModel::openComposer,
            onICloud = viewModel::openICloud,
            onDrafts = viewModel::openDrafts,
            onProfile = viewModel::openProfile,
            onSettings = viewModel::openSettings,
            onLogout = viewModel::logout,
            modifier = Modifier.width(264.dp),
        )
        VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(Modifier.widthIn(min = 320.dp, max = 440.dp).weight(.4f)) {
            MailTopBar(state, viewModel, showProfile = false)
            MessageList(
                state = state,
                onSelect = viewModel::selectMessage,
                onRefresh = viewModel::refresh,
                onLoadMore = viewModel::loadMoreMessages,
                onMarkAllRead = viewModel::markLoadedMessagesRead,
                onAction = viewModel::performMessageAction,
                modifier = Modifier.weight(1f),
            )
        }
        VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        MessageReader(
            state = state,
            onToggleStar = viewModel::toggleStar,
            onReply = viewModel::openReply,
            onForward = viewModel::openForward,
            onDownloadAttachment = viewModel::downloadAttachment,
            modifier = Modifier.weight(.6f),
        )
    }
}

@Composable
private fun MailDrawerLayout(
    state: AppUiState,
    viewModel: AppViewModel,
    content: @Composable (openDrawer: () -> Unit) -> Unit,
) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    fun closeDrawer() {
        scope.launch { drawerState.close() }
    }
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.widthIn(max = 320.dp),
                drawerContainerColor = MaterialTheme.colorScheme.surface,
            ) {
                MailNavigationPane(
                    state = state,
                    onFolder = {
                        viewModel.selectFolder(it)
                        closeDrawer()
                    },
                    onMailboxScope = {
                        viewModel.selectMailboxScope(it)
                        closeDrawer()
                    },
                    onCompose = {
                        closeDrawer()
                        viewModel.openComposer()
                    },
                    onICloud = viewModel::openICloud,
                    onDrafts = viewModel::openDrafts,
                    onProfile = viewModel::openProfile,
                    onSettings = viewModel::openSettings,
                    onLogout = viewModel::logout,
                )
            }
        },
    ) {
        content { scope.launch { drawerState.open() } }
    }
}

@Composable
private fun ComposeMailButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    ExtendedFloatingActionButton(
        onClick = onClick,
        modifier = modifier.navigationBarsPadding().padding(16.dp),
        icon = { LineIcon(AppIcon.Edit, null) },
        text = { Text(stringResource(R.string.write_mail), fontWeight = FontWeight.SemiBold) },
        containerColor = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
    )
}
