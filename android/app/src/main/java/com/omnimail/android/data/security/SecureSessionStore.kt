package com.omnimail.android.data.security

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class StoredSession(val baseUrl: String, val refreshToken: String)

class SessionStorageException : Exception("Unable to securely save the login session")

interface SessionStore {
    fun load(): StoredSession?
    fun save(baseUrl: String, refreshToken: String)
    fun clear()
    fun lastInstanceUrl(): String
}

class SecureSessionStore(context: Context) : SessionStore {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun load(): StoredSession? {
        val encodedIv = preferences.getString(KEY_IV, null) ?: return null
        val encodedCiphertext = preferences.getString(KEY_CIPHERTEXT, null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val iv = Base64.decode(encodedIv, Base64.NO_WRAP)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
            cipher.updateAAD(AAD)
            val plaintext = cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP))
                .toString(StandardCharsets.UTF_8)
            val separator = plaintext.indexOf('\u0000')
            require(separator > 0 && separator < plaintext.lastIndex)
            StoredSession(plaintext.substring(0, separator), plaintext.substring(separator + 1))
        }.getOrElse {
            clear()
            null
        }
    }

    @SuppressLint("ApplySharedPref", "UseKtx")
    override fun save(baseUrl: String, refreshToken: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        cipher.updateAAD(AAD)
        val plaintext = "$baseUrl\u0000$refreshToken".toByteArray(StandardCharsets.UTF_8)
        val ciphertext = cipher.doFinal(plaintext)
        val saved = preferences.edit()
                .putString(KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString(KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(KEY_LAST_INSTANCE, baseUrl)
                .commit()
        if (!saved) throw SessionStorageException()
    }

    override fun clear() {
        preferences.edit {
            remove(KEY_IV)
            remove(KEY_CIPHERTEXT)
        }
    }

    override fun lastInstanceUrl(): String =
        preferences.getString(KEY_LAST_INSTANCE, "") ?: ""

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val PREFERENCES_NAME = "omnimail_secure_session"
        const val KEY_ALIAS = "omnimail_refresh_token_key"
        const val KEY_IV = "session_iv"
        const val KEY_CIPHERTEXT = "session_ciphertext"
        const val KEY_LAST_INSTANCE = "last_instance"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        val AAD: ByteArray = "OmniMail Android session v1".toByteArray(StandardCharsets.UTF_8)
    }
}
