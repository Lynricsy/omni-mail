package com.omnimail.android.ui

import android.provider.Settings
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
internal fun mailMotionEnabled(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) != 0f
    }
}

internal fun androidx.compose.animation.AnimatedContentTransitionScope<Boolean>.compactReaderTransform(
    motionEnabled: Boolean,
): ContentTransform {
    if (!motionEnabled) return fadeIn(tween(0)) togetherWith fadeOut(tween(0))
    val enteringReader = targetState
    val offset: (Int) -> Int = { width -> if (enteringReader) width / 8 else -width / 8 }
    val enter = fadeIn(tween(160, delayMillis = 40)) +
        slideInHorizontally(tween(220, easing = FastOutSlowInEasing), offset)
    val exit = fadeOut(tween(120)) +
        slideOutHorizontally(tween(180, easing = FastOutSlowInEasing)) { width ->
            if (enteringReader) -width / 12 else width / 12
        }
    return (enter togetherWith exit).using(SizeTransform(clip = true))
}

internal fun androidx.compose.animation.AnimatedContentTransitionScope<AppPage>.appPageTransform(
    motionEnabled: Boolean,
): ContentTransform {
    if (!motionEnabled) return fadeIn(tween(0)) togetherWith fadeOut(tween(0))
    val initialDepth = if (initialState == AppPage.Mail) 0 else 1
    val targetDepth = if (targetState == AppPage.Mail) 0 else 1
    if (initialDepth == targetDepth) {
        return fadeIn(tween(200)) togetherWith fadeOut(tween(140))
    }
    val movingForward = targetDepth > initialDepth
    val enter = fadeIn(tween(180, delayMillis = 40)) +
        slideInHorizontally(tween(240, easing = FastOutSlowInEasing)) { width ->
            if (movingForward) width / 8 else -width / 8
        }
    val exit = fadeOut(tween(120)) +
        slideOutHorizontally(tween(160, easing = FastOutSlowInEasing)) { width ->
            if (movingForward) -width / 12 else width / 12
        }
    return (enter togetherWith exit).using(SizeTransform(clip = true))
}
