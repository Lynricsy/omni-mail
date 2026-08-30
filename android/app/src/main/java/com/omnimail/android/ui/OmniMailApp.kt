package com.omnimail.android.ui

import android.animation.ValueAnimator
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalContext
import com.omnimail.android.data.sync.MailSyncScheduler
import kotlinx.coroutines.delay

@Composable
fun OmniMailApp(viewModel: AppViewModel) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val animationsEnabled = remember { ValueAnimator.areAnimatorsEnabled() }
    val motionEnabled = mailMotionEnabled()
    var minimumLaunchElapsed by rememberSaveable { mutableStateOf(!animationsEnabled) }
    var launchDismissed by rememberSaveable { mutableStateOf(false) }
    val launchDestinationReady = state.stage != AppStage.Restoring

    LaunchedEffect(animationsEnabled) {
        if (animationsEnabled) {
            delay(620)
            minimumLaunchElapsed = true
        }
    }
    LaunchedEffect(minimumLaunchElapsed, launchDestinationReady) {
        if (minimumLaunchElapsed && launchDestinationReady) {
            launchDismissed = true
        }
    }

    val errorMessage = when (val error = state.error) {
        is UserMessage.Resource -> stringResource(error.id, *error.args.toTypedArray())
        is UserMessage.Text -> error.value
        null -> null
    }

    LaunchedEffect(errorMessage) {
        errorMessage?.let {
            snackbarHostState.showSnackbar(errorMessage)
            viewModel.dismissError()
        }
    }
    LaunchedEffect(state.readerPreferences.backgroundSync) {
        MailSyncScheduler.update(context, state.readerPreferences.backgroundSync)
    }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
            snackbarHost = { SnackbarHost(snackbarHostState) },
            contentWindowInsets = WindowInsets.safeDrawing.only(
                WindowInsetsSides.Top + WindowInsetsSides.Horizontal,
            ),
        ) { contentPadding ->
            when (state.stage) {
                AppStage.Restoring -> Box(Modifier.fillMaxSize())
                AppStage.Login -> LoginScreen(state, viewModel)
                AppStage.Mail -> AnimatedContent(
                    targetState = state.page,
                    transitionSpec = { appPageTransform(motionEnabled) },
                    modifier = Modifier.fillMaxSize(),
                    label = "app-page",
                ) { page ->
                    when (page) {
                        AppPage.Mail -> MailScreen(state, viewModel, contentPadding)
                        AppPage.Compose -> ComposeScreen(state, viewModel, contentPadding)
                        AppPage.ICloud -> ICloudScreen(state, viewModel, contentPadding)
                        AppPage.Drafts -> DraftsScreen(state, viewModel, contentPadding)
                        AppPage.Profile -> ProfileScreen(state, viewModel, contentPadding)
                        AppPage.Settings -> SettingsScreen(state, viewModel, contentPadding)
                    }
                }
            }
        }
        AnimatedVisibility(
            visible = !launchDismissed,
            enter = EnterTransition.None,
            exit = fadeOut(tween(160)),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(androidx.compose.material3.MaterialTheme.colorScheme.background),
            ) {
                LaunchScreen()
            }
        }
    }
}
