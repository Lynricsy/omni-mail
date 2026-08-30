package com.omnimail.android.ui

import com.omnimail.android.data.network.ApiException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginFlowTest {
    @Test
    fun `missing mfa code opens verification step`() {
        val error = ApiException(401, "需要有效的二次验证码或恢复码。")

        assertTrue(requiresMfaChallenge(error, submittedCode = ""))
    }

    @Test
    fun `ordinary unauthorized response stays on account step`() {
        val error = ApiException(401, "邮箱或密码不正确。")

        assertFalse(requiresMfaChallenge(error, submittedCode = ""))
    }

    @Test
    fun `failed submitted code stays on verification step`() {
        val error = ApiException(401, "需要有效的二次验证码或恢复码。")

        assertFalse(requiresMfaChallenge(error, submittedCode = "123456"))
    }
}
