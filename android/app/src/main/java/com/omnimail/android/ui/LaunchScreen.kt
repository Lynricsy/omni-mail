package com.omnimail.android.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.omnimail.android.ui.components.OmniMailLogo

@Composable
internal fun LaunchScreen(modifier: Modifier = Modifier) {
    var started by remember { mutableStateOf(false) }
    val progress by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = tween(durationMillis = 480, easing = FastOutSlowInEasing),
        label = "launch-logo-progress",
    )
    LaunchedEffect(Unit) { started = true }

    Box(
        modifier
            .fillMaxSize()
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            OmniMailLogo(
                modifier = Modifier
                    .size(112.dp)
                    .graphicsLayer {
                        alpha = progress.coerceAtLeast(.15f)
                        val scale = .9f + progress * .1f
                        scaleX = scale
                        scaleY = scale
                    },
                flapProgress = progress,
            )
            Spacer(Modifier.height(20.dp))
            Text(
                "OmniMail",
                modifier = Modifier.alpha(((progress - .3f) / .7f).coerceIn(0f, 1f)),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
    }
}
