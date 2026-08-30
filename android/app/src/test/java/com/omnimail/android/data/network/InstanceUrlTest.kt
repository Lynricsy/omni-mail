package com.omnimail.android.data.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class InstanceUrlTest {
    @Test
    fun `adds https and removes a root slash`() {
        assertEquals(
            "https://mail.example.com",
            normalizeInstanceUrl("mail.example.com/", allowLocalHttp = false),
        )
    }

    @Test
    fun `rejects production http`() {
        assertThrows(IllegalArgumentException::class.java) {
            normalizeInstanceUrl("http://mail.example.com", allowLocalHttp = false)
        }
    }

    @Test
    fun `allows emulator loopback only in debug mode`() {
        assertEquals(
            "http://10.0.2.2:8787",
            normalizeInstanceUrl("http://10.0.2.2:8787", allowLocalHttp = true),
        )
        assertThrows(IllegalArgumentException::class.java) {
            normalizeInstanceUrl("http://192.168.1.10:8787", allowLocalHttp = true)
        }
    }

    @Test
    fun `rejects non-root paths and credentials`() {
        assertThrows(IllegalArgumentException::class.java) {
            normalizeInstanceUrl("https://mail.example.com/api", allowLocalHttp = false)
        }
        assertThrows(IllegalArgumentException::class.java) {
            normalizeInstanceUrl("https://user:password@mail.example.com", allowLocalHttp = false)
        }
    }
}
