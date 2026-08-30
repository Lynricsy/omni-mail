package com.omnimail.android.data.sync

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.omnimail.android.MainActivity
import com.omnimail.android.R
import com.omnimail.android.data.cache.MailCacheDatabase
import com.omnimail.android.data.cache.RoomMailCache
import com.omnimail.android.data.model.MailFolder
import com.omnimail.android.data.network.OmniMailApi
import com.omnimail.android.data.preferences.SharedAppPreferences
import com.omnimail.android.data.repository.MailRepository
import com.omnimail.android.data.security.SecureSessionStore
import java.util.concurrent.TimeUnit

class MailSyncWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val preferences = SharedAppPreferences(applicationContext).readerPreferences.value
        if (!preferences.backgroundSync) return Result.success()
        val cache = RoomMailCache(MailCacheDatabase.get(applicationContext))
        val repository = MailRepository(
            service = OmniMailApi(),
            sessionStore = SecureSessionStore(applicationContext),
            cache = cache,
            allowLocalHttp = false,
        )
        val session = repository.restoreSession() ?: return Result.success()
        val cacheKey = "${session.baseUrl}|${session.user.id}"
        val knownIds = cache.ids(cacheKey)
        return runCatching { repository.messages(MailFolder.Inbox) }
            .fold(
                onSuccess = { response ->
                    if (response.fromCache) return@fold Result.retry()
                    val newMessages = response.messages.filter { it.id !in knownIds }
                    if (
                        knownIds.isNotEmpty() &&
                        newMessages.isNotEmpty() &&
                        preferences.notificationsEnabled
                    ) {
                        notifyNewMail(applicationContext, newMessages.first(), newMessages.size)
                    }
                    Result.success()
                },
                onFailure = { Result.retry() },
            )
    }
}

object MailSyncScheduler {
    private const val WORK_NAME = "omnimail-mail-sync"

    fun update(context: Context, enabled: Boolean) {
        val manager = WorkManager.getInstance(context)
        if (!enabled) {
            manager.cancelUniqueWork(WORK_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<MailSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
}

fun createMailNotificationChannel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(
        MAIL_CHANNEL_ID,
        context.getString(R.string.notification_channel_mail),
        NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
        description = context.getString(R.string.notification_channel_mail_detail)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
    })
}

private fun notifyNewMail(
    context: Context,
    message: com.omnimail.android.data.model.MessageSummary,
    count: Int,
) {
    if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) return
    createMailNotificationChannel(context)
    val uri = Uri.Builder().scheme("omnimail").authority("message").appendPath(message.id).build()
    val intent = Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = uri
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pendingIntent = PendingIntent.getActivity(
        context,
        message.id.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val sender = message.senderName.ifBlank { message.senderAddress }
        .ifBlank { context.getString(R.string.unknown_sender) }
    val title = if (count == 1) {
        context.getString(R.string.notification_new_mail)
    } else {
        context.resources.getQuantityString(R.plurals.notification_new_mail_count, count, count)
    }
    val notification = NotificationCompat.Builder(context, MAIL_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_inbox)
        .setContentTitle(title)
        .setContentText(sender)
        .setCategory(NotificationCompat.CATEGORY_EMAIL)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .build()
    NotificationManagerCompat.from(context).notify(message.id.hashCode(), notification)
}

private const val MAIL_CHANNEL_ID = "new-mail"
