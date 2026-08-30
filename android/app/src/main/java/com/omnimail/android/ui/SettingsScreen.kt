package com.omnimail.android.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.data.preferences.AppLanguage
import com.omnimail.android.data.preferences.ThemePreference
import com.omnimail.android.data.preferences.applyAppLanguage
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.openExternalUrl

@Composable
fun SettingsScreen(state: AppUiState, viewModel: AppViewModel, contentPadding: PaddingValues) {
    BackHandler(onBack = viewModel::openMail)
    val context = LocalContext.current
    val notificationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> viewModel.setNotificationsEnabled(granted) }
    AccountPage(
        title = stringResource(R.string.settings),
        onBack = viewModel::openMail,
        contentPadding = contentPadding,
    ) {
        SettingsSection(stringResource(R.string.mail_content)) {
            SettingSwitch(
                icon = AppIcon.Shield,
                title = stringResource(R.string.load_remote_images),
                detail = if (state.readerPreferences.loadRemoteImages) {
                    stringResource(R.string.remote_images_enabled_detail)
                } else {
                    stringResource(R.string.remote_images_disabled_detail)
                },
                checked = state.readerPreferences.loadRemoteImages,
                onCheckedChange = viewModel::setLoadRemoteImages,
            )
            SettingDivider()
            SettingSwitch(
                icon = AppIcon.Link,
                title = stringResource(R.string.confirm_external_links),
                detail = stringResource(R.string.confirm_external_links_detail),
                checked = state.readerPreferences.confirmExternalLinks,
                onCheckedChange = viewModel::setConfirmExternalLinks,
            )
        }
        Spacer(Modifier.height(22.dp))
        SettingsSection(stringResource(R.string.sync_and_notifications)) {
            SettingSwitch(
                icon = AppIcon.Refresh,
                title = stringResource(R.string.background_sync),
                detail = stringResource(R.string.background_sync_detail),
                checked = state.readerPreferences.backgroundSync,
                onCheckedChange = { enabled ->
                    viewModel.setBackgroundSync(enabled)
                    if (!enabled) viewModel.setNotificationsEnabled(false)
                },
            )
            SettingDivider()
            SettingSwitch(
                icon = AppIcon.Inbox,
                title = stringResource(R.string.new_mail_notifications),
                detail = stringResource(R.string.new_mail_notifications_detail),
                checked = state.readerPreferences.notificationsEnabled,
                onCheckedChange = { enabled ->
                    if (!enabled) {
                        viewModel.setNotificationsEnabled(false)
                    } else {
                        viewModel.setBackgroundSync(true)
                        if (
                            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                            ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.POST_NOTIFICATIONS,
                            ) == PackageManager.PERMISSION_GRANTED
                        ) {
                            viewModel.setNotificationsEnabled(true)
                        } else {
                            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                },
            )
        }
        Spacer(Modifier.height(22.dp))
        SettingsSection(stringResource(R.string.appearance)) {
            Column(Modifier.padding(16.dp)) {
                Text(stringResource(R.string.theme), fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(10.dp))
                SegmentedChoices(
                    options = ThemePreference.entries,
                    selectedOption = state.readerPreferences.theme,
                    onOption = viewModel::setTheme,
                    optionLabel = { it.label() },
                )
                Spacer(Modifier.height(22.dp))
                Text(stringResource(R.string.language), fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(10.dp))
                SegmentedChoices(
                    options = AppLanguage.entries,
                    selectedOption = state.readerPreferences.language,
                    onOption = { language ->
                        viewModel.setLanguage(language)
                        applyAppLanguage(context, language)
                    },
                    optionLabel = { it.label() },
                )
            }
        }
        Spacer(Modifier.height(22.dp))
        SettingsSection(stringResource(R.string.app_version_and_updates)) {
            Column(Modifier.padding(20.dp)) {
                Text(
                    stringResource(R.string.current_version, state.appVersion),
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    versionStatus(state.versionCheck),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = viewModel::checkForUpdate,
                        enabled = state.versionCheck !is VersionCheckState.Checking,
                        modifier = Modifier.height(48.dp),
                    ) {
                        if (state.versionCheck is VersionCheckState.Checking) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(stringResource(R.string.check_for_updates))
                    }
                    val update = state.versionCheck as? VersionCheckState.UpdateAvailable
                    if (update != null) {
                        Button(
                            onClick = { openExternalUrl(context, update.releaseUrl) },
                            modifier = Modifier.height(48.dp),
                        ) {
                            Text(stringResource(R.string.open_release_page))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(22.dp))
        SettingsSection(stringResource(R.string.security_information)) {
            Text(
                stringResource(R.string.security_information_detail),
                modifier = Modifier.padding(20.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun <T> SegmentedChoices(
    options: List<T>,
    selectedOption: T,
    onOption: (T) -> Unit,
    optionLabel: @Composable (T) -> String,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(Modifier.padding(4.dp)) {
            options.forEach { option ->
                val selected = selectedOption == option
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .selectable(selected = selected, role = Role.RadioButton) {
                            onOption(option)
                        },
                    shape = RoundedCornerShape(22.dp),
                    color = if (selected) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        Color.Transparent
                    },
                ) {
                    androidx.compose.foundation.layout.Box(contentAlignment = Alignment.Center) {
                        Text(
                            optionLabel(option),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (selected) {
                                MaterialTheme.colorScheme.onPrimaryContainer
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun versionStatus(check: VersionCheckState): String = when (check) {
    VersionCheckState.NotChecked -> stringResource(R.string.version_source_detail)
    VersionCheckState.Checking -> stringResource(R.string.checking_for_updates)
    VersionCheckState.NoRelease -> stringResource(R.string.no_android_release)
    VersionCheckState.Failed -> stringResource(R.string.update_check_failed)
    is VersionCheckState.UpToDate -> stringResource(R.string.app_up_to_date, check.latestVersion)
    is VersionCheckState.UpdateAvailable -> stringResource(
        R.string.app_update_available,
        check.latestVersion,
    )
}

@Composable
private fun ThemePreference.label(): String = when (this) {
    ThemePreference.System -> stringResource(R.string.theme_system)
    ThemePreference.Light -> stringResource(R.string.theme_light)
    ThemePreference.Dark -> stringResource(R.string.theme_dark)
}

@Composable
private fun AppLanguage.label(): String = when (this) {
    AppLanguage.System -> stringResource(R.string.language_system)
    AppLanguage.SimplifiedChinese -> stringResource(R.string.language_simplified_chinese)
    AppLanguage.English -> stringResource(R.string.language_english)
}
