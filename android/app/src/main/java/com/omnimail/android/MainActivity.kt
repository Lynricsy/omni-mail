package com.omnimail.android

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.omnimail.android.data.network.OmniMailApi
import com.omnimail.android.data.cache.MailCacheDatabase
import com.omnimail.android.data.cache.RoomMailCache
import com.omnimail.android.data.preferences.SharedAppPreferences
import com.omnimail.android.data.preferences.localizedContext
import com.omnimail.android.data.repository.MailRepository
import com.omnimail.android.data.security.SecureSessionStore
import com.omnimail.android.data.update.AppUpdateChecker
import com.omnimail.android.data.update.GitHubAppUpdateChecker
import com.omnimail.android.data.sync.createMailNotificationChannel
import com.omnimail.android.ui.AppViewModel
import com.omnimail.android.ui.OmniMailApp
import com.omnimail.android.ui.theme.OmniMailTheme

class MainActivity : ComponentActivity() {
    private lateinit var appViewModel: AppViewModel

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(localizedContext(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
            navigationBarStyle = SystemBarStyle.auto(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }

        val repository = MailRepository(
            service = OmniMailApi(),
            sessionStore = SecureSessionStore(applicationContext),
            cache = RoomMailCache(MailCacheDatabase.get(applicationContext)),
        )
        val appPreferences = SharedAppPreferences(applicationContext)
        val deviceName = "OmniMail Android / ${Build.MANUFACTURER} ${Build.MODEL}".take(80)
        val factory = AppViewModelFactory(
            repository,
            appPreferences,
            deviceName,
            GitHubAppUpdateChecker(),
            BuildConfig.VERSION_NAME,
        )
        appViewModel = ViewModelProvider(this, factory)[AppViewModel::class.java]
        createMailNotificationChannel(applicationContext)

        setContent {
            OmniMailTheme(appPreferences.readerPreferences) {
                OmniMailApp(appViewModel)
            }
        }
        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "omnimail" && uri.host == "message") {
            uri.pathSegments.firstOrNull()?.let(appViewModel::openMessageFromDeepLink)
        }
    }
}

private class AppViewModelFactory(
    private val repository: MailRepository,
    private val appPreferences: com.omnimail.android.data.preferences.AppPreferences,
    private val deviceName: String,
    private val updateChecker: AppUpdateChecker,
    private val appVersion: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AppViewModel(repository, appPreferences, deviceName, updateChecker, appVersion) as T
}
