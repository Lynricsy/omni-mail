package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.omnimail.android.BuildConfig
import com.omnimail.android.R
import com.omnimail.android.data.network.normalizeInstanceUrl
import com.omnimail.android.data.preferences.AppLanguage
import com.omnimail.android.data.preferences.applyAppLanguage
import com.omnimail.android.ui.components.OmniMailLogo

internal enum class LoginStep { Instance, Account, Verification }

@Composable
fun LoginScreen(state: AppUiState, viewModel: AppViewModel) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val displayedLanguage = when (state.readerPreferences.language) {
        AppLanguage.System -> if (LocalConfiguration.current.locales[0].language == "zh") {
            AppLanguage.SimplifiedChinese
        } else {
            AppLanguage.English
        }
        else -> state.readerPreferences.language
    }
    var stepName by rememberSaveable { mutableStateOf(LoginStep.Instance.name) }
    var instanceHasError by rememberSaveable { mutableStateOf(false) }
    val step = LoginStep.valueOf(stepName)
    val goBack = {
        when (step) {
            LoginStep.Instance -> Unit
            LoginStep.Account -> {
                focusManager.clearFocus()
                stepName = LoginStep.Instance.name
            }
            LoginStep.Verification -> {
                focusManager.clearFocus()
                viewModel.dismissMfaChallenge()
                stepName = LoginStep.Account.name
            }
        }
    }
    val continueFromInstance = {
        val normalized = runCatching {
            normalizeInstanceUrl(state.instanceUrl, allowLocalHttp = BuildConfig.DEBUG)
        }.getOrNull()
        if (normalized == null) {
            instanceHasError = true
        } else {
            focusManager.clearFocus()
            viewModel.updateInstanceUrl(normalized)
            instanceHasError = false
            stepName = LoginStep.Account.name
        }
    }

    LaunchedEffect(state.mfaRequired) {
        if (state.mfaRequired) {
            focusManager.clearFocus()
            stepName = LoginStep.Verification.name
        }
    }
    BackHandler(enabled = step != LoginStep.Instance, onBack = goBack)

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .safeDrawingPadding(),
        ) {
            LoginHeader(displayedLanguage) {
                val next = if (displayedLanguage == AppLanguage.English) {
                    AppLanguage.SimplifiedChinese
                } else {
                    AppLanguage.English
                }
                viewModel.setLanguage(next)
                applyAppLanguage(context, next)
            }
            Box(
                Modifier.weight(1f).fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    Modifier
                        .widthIn(max = 420.dp)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 28.dp, vertical = 24.dp),
                ) {
                    if (step != LoginStep.Instance) {
                        TextButton(
                            onClick = goBack,
                            modifier = Modifier.heightIn(min = 48.dp),
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            com.omnimail.android.ui.components.LineIcon(
                                com.omnimail.android.ui.components.AppIcon.Back,
                                contentDescription = null,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(stringResource(R.string.previous_step))
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    LoginHeading(step)
                    Spacer(Modifier.height(if (step == LoginStep.Account) 20.dp else 28.dp))
                    key(step) {
                        LoginStepContent(
                            step = step,
                            state = state,
                            viewModel = viewModel,
                            instanceHasError = instanceHasError,
                            onInstanceChange = {
                                instanceHasError = false
                                viewModel.updateInstanceUrl(it)
                            },
                            onContinue = continueFromInstance,
                            onBack = goBack,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LoginHeader(
    displayedLanguage: AppLanguage,
    onSwitchLanguage: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OmniMailLogo(Modifier.size(40.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            stringResource(R.string.app_name),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.weight(1f))
        TextButton(
            onClick = onSwitchLanguage,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 12.dp),
        ) {
            Text(if (displayedLanguage == AppLanguage.English) "中文" else "EN")
        }
    }
}

@Composable
private fun LoginHeading(step: LoginStep) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(2) { index ->
            Surface(
                modifier = Modifier.size(width = 28.dp, height = 4.dp),
                shape = MaterialTheme.shapes.extraSmall,
                color = if (index == 0 || step != LoginStep.Instance) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
            ) {}
        }
    }
    Spacer(Modifier.height(14.dp))
    val copy = when (step) {
        LoginStep.Instance -> Triple(
            R.string.login_step_instance,
            R.string.login_title,
            R.string.login_subtitle,
        )
        LoginStep.Account -> Triple(
            R.string.login_step_account,
            R.string.account_login_title,
            R.string.account_login_subtitle,
        )
        LoginStep.Verification -> Triple(
            R.string.login_step_verification,
            R.string.verification_title,
            R.string.verification_subtitle,
        )
    }
    Text(
        stringResource(copy.first),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
    )
    Spacer(Modifier.height(8.dp))
    Text(
        stringResource(copy.second),
        style = MaterialTheme.typography.headlineMedium,
        color = MaterialTheme.colorScheme.onBackground,
    )
    Spacer(Modifier.height(8.dp))
    Text(
        stringResource(copy.third),
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
