package com.omnimail.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@Composable
fun ProfileScreen(state: AppUiState, viewModel: AppViewModel, contentPadding: PaddingValues) {
    BackHandler(onBack = viewModel::openMail)
    val savedName = state.user?.displayName?.trim().orEmpty()
    var displayName by remember(state.user?.id) { mutableStateOf(savedName) }

    AccountPage(
        title = stringResource(R.string.profile),
        onBack = viewModel::openMail,
        contentPadding = contentPadding,
    ) {
        ProfileHero(state)
        Spacer(Modifier.height(24.dp))
        SettingsSection(stringResource(R.string.public_profile)) {
            Column(Modifier.padding(16.dp)) {
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { if (it.length <= 60) displayName = it },
                    label = { Text(stringResource(R.string.display_name)) },
                    supportingText = { Text(stringResource(R.string.display_name_supporting)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    Button(
                        onClick = { viewModel.updateDisplayName(displayName) },
                        enabled = !state.isProfileSaving &&
                            displayName.trim().isNotEmpty() && displayName.trim() != savedName,
                        modifier = Modifier.height(48.dp),
                    ) {
                        if (state.isProfileSaving) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Text(
                                stringResource(
                                    if (state.profileSaved) R.string.saved else R.string.save_display_name,
                                ),
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(22.dp))
        SettingsSection(stringResource(R.string.account_information)) {
            InfoRow(stringResource(R.string.login_email), state.user?.email.orEmpty())
            SettingDivider(20)
            InfoRow(stringResource(R.string.account_role), roleLabel(state.user?.role))
            SettingDivider(20)
            InfoRow(
                stringResource(R.string.primary_mailbox),
                state.mailboxes.firstOrNull { it.isPrimary }?.address
                    ?: stringResource(R.string.not_configured),
            )
            SettingDivider(20)
            InfoRow(stringResource(R.string.instance_url), state.instanceUrl)
        }
        Spacer(Modifier.height(22.dp))
        SettingsSection(stringResource(R.string.login_and_security)) {
            Column(Modifier.padding(20.dp)) {
                Text(
                    stringResource(R.string.logout_security_note),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedButton(
                    onClick = viewModel::logout,
                    enabled = !state.isWorking,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                    modifier = Modifier.height(48.dp),
                ) {
                    LineIcon(AppIcon.Logout, null)
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.logout_current_device))
                }
            }
        }
    }
}

@Composable
private fun ProfileHero(state: AppUiState) {
    val displayName = state.user?.displayName?.trim().orEmpty()
    val avatar = displayName.ifBlank { state.user?.email.orEmpty() }
        .firstOrNull()?.uppercase() ?: "?"
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
    ) {
        Row(
            Modifier.padding(horizontal = 20.dp, vertical = 22.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    avatar,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    displayName.ifBlank { stringResource(R.string.omnimail_user) },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
                Text(
                    state.user?.email.orEmpty(),
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun roleLabel(role: String?): String = when (role) {
    "super_admin" -> stringResource(R.string.role_super_admin)
    "admin" -> stringResource(R.string.role_admin)
    "temporary" -> stringResource(R.string.role_temporary)
    else -> stringResource(R.string.role_user)
}
