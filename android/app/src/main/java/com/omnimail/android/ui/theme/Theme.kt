package com.omnimail.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.core.view.WindowCompat
import com.omnimail.android.data.preferences.ReaderPreferences
import com.omnimail.android.data.preferences.ThemePreference

private val LightColors = lightColorScheme(
    primary = Color(0xFF006B5F),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFB4F1E5),
    onPrimaryContainer = Color(0xFF00201C),
    secondary = Color(0xFF48645E),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFCBE9E1),
    onSecondaryContainer = Color(0xFF05201B),
    tertiary = Color(0xFF765B00),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFE16B),
    onTertiaryContainer = Color(0xFF241A00),
    background = Color(0xFFF4F7F6),
    onBackground = Color(0xFF171D1B),
    surface = Color.White,
    onSurface = Color(0xFF171D1B),
    surfaceVariant = Color(0xFFDAE5E2),
    onSurfaceVariant = Color(0xFF3F4946),
    outline = Color(0xFF6F7976),
    outlineVariant = Color(0xFFBEC9C5),
    error = Color(0xFFBA1A1A),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF99D5CA),
    onPrimary = Color(0xFF00372F),
    primaryContainer = Color(0xFF005047),
    onPrimaryContainer = Color(0xFFB4F1E5),
    secondary = Color(0xFFAFCFC7),
    onSecondary = Color(0xFF1A352F),
    secondaryContainer = Color(0xFF314B46),
    onSecondaryContainer = Color(0xFFCBE9E1),
    tertiary = Color(0xFFE9C349),
    onTertiary = Color(0xFF3D2F00),
    tertiaryContainer = Color(0xFF594400),
    onTertiaryContainer = Color(0xFFFFE16B),
    background = Color(0xFF0F1513),
    onBackground = Color(0xFFDFE4E1),
    surface = Color(0xFF171D1B),
    onSurface = Color(0xFFDFE4E1),
    surfaceVariant = Color(0xFF3F4946),
    onSurfaceVariant = Color(0xFFBEC9C5),
    outline = Color(0xFF89938F),
    outlineVariant = Color(0xFF3F4946),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
)

private val OmniMailTypography = Typography(
    headlineMedium = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        letterSpacing = (-0.3).sp,
    ),
    headlineSmall = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.2).sp,
    ),
    titleLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.sp,
    ),
    bodyLarge = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.1.sp,
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    bodySmall = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 17.sp,
        letterSpacing = 0.2.sp,
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
)

private val OmniMailShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun OmniMailTheme(
    preferences: kotlinx.coroutines.flow.StateFlow<ReaderPreferences>,
    content: @Composable () -> Unit,
) {
    val current = preferences.collectAsState().value
    val darkTheme = when (current.theme) {
        ThemePreference.System -> isSystemInDarkTheme()
        ThemePreference.Light -> false
        ThemePreference.Dark -> true
    }
    val view = LocalView.current
    DisposableEffect(view, darkTheme) {
        val window = (view.context as? Activity)?.window
        if (window != null) {
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
        onDispose { }
    }
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = OmniMailTypography,
        shapes = OmniMailShapes,
        content = content,
    )
}

@Composable
fun EmailNavigationBarAppearance(darkBackground: Boolean) {
    val view = LocalView.current
    val themeDark = MaterialTheme.colorScheme.background == DarkColors.background
    DisposableEffect(view, darkBackground, themeDark) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.isAppearanceLightNavigationBars = !darkBackground
        onDispose {
            controller?.isAppearanceLightNavigationBars = !themeDark
        }
    }
}
