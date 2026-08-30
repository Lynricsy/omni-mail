package com.omnimail.android.data.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidTokenRequestTest {
    @Test
    fun explicitlyRequestsAndroidLeastPrivilegeScopes() {
        val body = Json.encodeToString(TokenRequest(
            email = "owner@example.com",
            password = "secret",
            deviceName = "OmniMail Android",
            client = "android",
        ))
        assertTrue(body.contains("\"client\":\"android\""))
        val refreshBody = Json.encodeToString(RefreshTokenRequest("om_rt_example", "android"))
        assertTrue(refreshBody.contains("\"client\":\"android\""))
    }
}
