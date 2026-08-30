package com.omnimail.android.ui

import com.omnimail.android.R
import com.omnimail.android.data.network.ApiErrorKind
import com.omnimail.android.data.network.ApiException
import com.omnimail.android.data.security.SessionStorageException
import java.io.IOException

internal fun userMessage(error: Throwable): UserMessage = when (error) {
    is IOException -> UserMessage.Resource(R.string.error_network)
    is IllegalArgumentException -> UserMessage.Resource(R.string.error_invalid_input)
    is ApiException -> when (error.kind) {
        ApiErrorKind.ServerMessage -> error.message
            .takeIf(String::isNotBlank)
            ?.let(UserMessage::Text)
            ?: UserMessage.Resource(R.string.error_request_failed, listOf(error.status))
        ApiErrorKind.RequestFailed -> UserMessage.Resource(
            R.string.error_request_failed,
            listOf(error.status),
        )
        ApiErrorKind.IncompatibleResponse -> UserMessage.Resource(
            R.string.error_incompatible_response,
        )
    }
    is SessionStorageException -> UserMessage.Resource(R.string.error_session_storage)
    else -> error.message?.takeIf(String::isNotBlank)?.let(UserMessage::Text)
        ?: UserMessage.Resource(R.string.error_unknown)
}

internal fun requiresMfaChallenge(error: Throwable, submittedCode: String): Boolean {
    if (submittedCode.isNotBlank() || error !is ApiException || error.status != 401) return false
    val message = error.message.lowercase()
    return "二次验证码或恢复码" in message ||
        "two-factor or recovery code" in message ||
        ("mfa" in message && "required" in message)
}
