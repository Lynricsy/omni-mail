package com.omnimail.android.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.omnimail.android.R

enum class AppIcon {
    Menu,
    Search,
    Close,
    Expand,
    Globe,
    Check,
    Inbox,
    Star,
    Send,
    Edit,
    Reply,
    Forward,
    Trash,
    Refresh,
    Back,
    Logout,
    Attachment,
    Profile,
    Settings,
    Shield,
    Link,
}

@Composable
fun LineIcon(
    icon: AppIcon,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    color: Color = LocalContentColor.current,
    filled: Boolean = false,
) {
    Icon(
        painter = painterResource(icon.drawable(filled)),
        contentDescription = contentDescription,
        modifier = modifier.size(24.dp),
        tint = color,
    )
}

@DrawableRes
private fun AppIcon.drawable(filled: Boolean): Int = when (this) {
    AppIcon.Menu -> R.drawable.ic_menu
    AppIcon.Search -> R.drawable.ic_search
    AppIcon.Close -> R.drawable.ic_close
    AppIcon.Expand -> R.drawable.ic_expand_more
    AppIcon.Globe -> R.drawable.ic_globe
    AppIcon.Check -> R.drawable.ic_check
    AppIcon.Inbox -> R.drawable.ic_inbox
    AppIcon.Star -> if (filled) R.drawable.ic_star_filled else R.drawable.ic_star
    AppIcon.Send -> R.drawable.ic_send
    AppIcon.Edit -> R.drawable.ic_edit
    AppIcon.Reply -> R.drawable.ic_reply
    AppIcon.Forward -> R.drawable.ic_forward
    AppIcon.Trash -> R.drawable.ic_delete
    AppIcon.Refresh -> R.drawable.ic_refresh
    AppIcon.Back -> R.drawable.ic_arrow_back
    AppIcon.Logout -> R.drawable.ic_logout
    AppIcon.Attachment -> R.drawable.ic_attachment
    AppIcon.Profile -> R.drawable.ic_profile
    AppIcon.Settings -> R.drawable.ic_settings
    AppIcon.Shield -> R.drawable.ic_shield
    AppIcon.Link -> R.drawable.ic_link
}

@Composable
fun OmniMailLogo(
    modifier: Modifier = Modifier,
    flapProgress: Float = 1f,
) {
    Canvas(modifier.size(56.dp)) {
        val unit = size.minDimension
        val stroke = unit * 24f / 512f
        val style = Stroke(stroke, cap = StrokeCap.Round, join = StrokeJoin.Round)
        drawRoundRect(
            color = Color(0xFF0F172A),
            cornerRadius = CornerRadius(unit * 115f / 512f),
        )
        drawRoundRect(
            color = Color.White,
            topLeft = Offset(size.width * 96f / 512f, size.height * 146f / 512f),
            size = Size(size.width * 320f / 512f, size.height * 220f / 512f),
            cornerRadius = CornerRadius(unit * 32f / 512f),
            style = style,
        )
        val flap = Path().apply {
            moveTo(size.width * 108f / 512f, size.height * 160f / 512f)
            lineTo(size.width * 242f / 512f, size.height * 268f / 512f)
            cubicTo(
                size.width * 250f / 512f,
                size.height * 274.5f / 512f,
                size.width * 262f / 512f,
                size.height * 274.5f / 512f,
                size.width * 270f / 512f,
                size.height * 268f / 512f,
            )
            lineTo(size.width * 404f / 512f, size.height * 160f / 512f)
        }
        val progress = flapProgress.coerceIn(0f, 1f)
        if (progress >= 1f) {
            drawPath(flap, Color.White, style = style)
        } else if (progress > 0f) {
            val measure = PathMeasure().apply { setPath(flap, false) }
            val visibleFlap = Path()
            measure.getSegment(0f, measure.length * progress, visibleFlap, true)
            drawPath(visibleFlap, Color.White, style = style)
        }
    }
}
