package com.omnimail.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.omnimail.android.R
import com.omnimail.android.ui.components.AppIcon
import com.omnimail.android.ui.components.LineIcon

@Composable
internal fun LoginStepContent(
    step: LoginStep,
    state: AppUiState,
    viewModel: AppViewModel,
    instanceHasError: Boolean,
    onInstanceChange: (String) -> Unit,
    onContinue: () -> Unit,
    onBack: () -> Unit,
) {
    when (step) {
        LoginStep.Instance -> {
            OutlinedTextField(
                value = state.instanceUrl,
                onValueChange = onInstanceChange,
                label = { Text(stringResource(R.string.instance_url)) },
                placeholder = { Text("https://mail.example.com") },
                supportingText = {
                    Text(
                        stringResource(
                            if (instanceHasError) {
                                R.string.error_instance_url
                            } else {
                                R.string.instance_url_supporting
                            },
                        ),
                    )
                },
                isError = instanceHasError,
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { onContinue() }),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(18.dp))
            Button(
                onClick = onContinue,
                enabled = state.instanceUrl.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(stringResource(R.string.continue_action))
            }
        }

        LoginStep.Account -> {
            InstanceSummary(state.instanceUrl, onBack)
            Spacer(Modifier.height(20.dp))
            val focusManager = LocalFocusManager.current
            OutlinedTextField(
                value = state.email,
                onValueChange = viewModel::updateEmail,
                label = { Text(stringResource(R.string.login_email)) },
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) },
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::updatePassword,
                label = { Text(stringResource(R.string.password)) },
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = {
                    viewModel.updateMfaCode("")
                    viewModel.login()
                }),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(20.dp))
            LoginButton(
                label = stringResource(R.string.login_action),
                working = state.isWorking,
                enabled = state.email.isNotBlank() && state.password.isNotBlank(),
            ) {
                viewModel.updateMfaCode("")
                viewModel.login()
            }
            Row(
                Modifier.fillMaxWidth().padding(top = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                LineIcon(
                    AppIcon.Shield,
                    contentDescription = null,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    stringResource(R.string.login_security_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        LoginStep.Verification -> {
            OutlinedTextField(
                value = state.mfaCode,
                onValueChange = viewModel::updateMfaCode,
                label = { Text(stringResource(R.string.mfa_code)) },
                placeholder = { Text(stringResource(R.string.mfa_code_hint)) },
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Ascii,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { viewModel.login() }),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(20.dp))
            LoginButton(
                label = stringResource(R.string.verify_and_login),
                working = state.isWorking,
                enabled = state.mfaCode.isNotBlank(),
                onClick = viewModel::login,
            )
        }
    }
}

@Composable
private fun InstanceSummary(instanceUrl: String, onChange: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            Modifier.padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LineIcon(
                AppIcon.Link,
                contentDescription = null,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.width(10.dp))
            Text(
                instanceUrl,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
            )
            TextButton(
                onClick = onChange,
                modifier = Modifier.heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 10.dp),
            ) {
                Text(stringResource(R.string.change_instance))
            }
        }
    }
}

@Composable
private fun LoginButton(
    label: String,
    working: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !working,
        modifier = Modifier.fillMaxWidth().height(52.dp),
        shape = MaterialTheme.shapes.medium,
    ) {
        if (working) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Text(label)
        }
    }
}
