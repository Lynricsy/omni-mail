package com.omnimail.android.ui.components

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.view.ContextThemeWrapper
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import java.net.URI

@Composable
fun SafeEmailWebView(
    html: String,
    loadRemoteImages: Boolean,
    modifier: Modifier = Modifier,
    trustedHeaderHtml: String = "",
    trustedFooterHtml: String = "",
    darkTheme: Boolean = false,
    onShowRemoteImages: () -> Unit = {},
    onScrolledChange: (Boolean) -> Unit = {},
    onExternalLink: (String) -> Unit,
) {
    val document = remember(html, loadRemoteImages, trustedHeaderHtml, trustedFooterHtml, darkTheme) {
        buildSafeEmailDocument(
            html,
            loadRemoteImages,
            trustedHeaderHtml,
            trustedFooterHtml,
            darkTheme,
        )
    }
    val currentShowRemoteImages = rememberUpdatedState(onShowRemoteImages)
    val currentScrolledChange = rememberUpdatedState(onScrolledChange)
    val currentExternalLink = rememberUpdatedState(onExternalLink)
    key(darkTheme) {
        AndroidView(
            modifier = modifier.fillMaxSize(),
            factory = { context ->
                val webViewContext = ContextThemeWrapper(
                    context,
                    if (darkTheme) {
                        android.R.style.Theme_Material_NoActionBar
                    } else {
                        android.R.style.Theme_Material_Light_NoActionBar
                    },
                )
                WebView(webViewContext).apply {
                    setBackgroundColor(
                        if (darkTheme) Color.rgb(15, 21, 19) else Color.TRANSPARENT,
                    )
                    var wasScrolled = false
                    setOnScrollChangeListener { _, _, scrollY, _, _ ->
                        val isScrolled = scrollY > 24
                        if (isScrolled != wasScrolled) {
                            wasScrolled = isScrolled
                            currentScrolledChange.value(isScrolled)
                        }
                    }
                    settings.apply {
                        javaScriptEnabled = false
                        domStorageEnabled = false
                        allowFileAccess = false
                        allowContentAccess = false
                        cacheMode = WebSettings.LOAD_NO_CACHE
                        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        builtInZoomControls = true
                        displayZoomControls = false
                    }
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                        WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, darkTheme)
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean = handleEmailUrl(
                            request.url.toString(),
                            currentShowRemoteImages.value,
                            currentExternalLink.value,
                        )

                        @Deprecated("Deprecated in WebViewClient")
                        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                            return handleEmailUrl(
                                url,
                                currentShowRemoteImages.value,
                                currentExternalLink.value,
                            )
                        }
                    }
                }
            },
            update = { webView ->
                if (webView.tag != document) {
                    webView.tag = document
                    webView.loadDataWithBaseURL(null, document, "text/html", "UTF-8", null)
                }
            },
            onRelease = { webView ->
                webView.stopLoading()
                webView.loadUrl("about:blank")
                webView.clearHistory()
                webView.removeAllViews()
                webView.destroy()
            },
        )
    }
}

private fun handleEmailUrl(
    url: String,
    onShowRemoteImages: () -> Unit,
    onExternalLink: (String) -> Unit,
): Boolean {
    if (url.equals(SHOW_REMOTE_IMAGES_URL, ignoreCase = true)) {
        onShowRemoteImages()
        return true
    }
    safeExternalUrl(url)?.also(onExternalLink)
    return true
}

internal fun buildSafeEmailDocument(
    html: String,
    loadRemoteImages: Boolean,
    trustedHeaderHtml: String = "",
    trustedFooterHtml: String = "",
    darkTheme: Boolean = false,
): String {
    var safe = html
        .replace(DANGEROUS_BLOCKS, "")
        .replace(META_HTTP_EQUIV, "")
        .replace(META_COLOR_SCHEME, "")
        .replace(CSS_COLOR_SCHEME, "")
        .replace(EVENT_ATTRIBUTES, "")
        .replace(DANGEROUS_ATTRIBUTES, "")
        .replace(DANGEROUS_SCHEMES, "$1#")
    if (!loadRemoteImages) {
        safe = safe
            .replace(REMOTE_IMAGE_SOURCES, "$1")
            .replace(CSS_REMOTE_URLS, "none")
    }
    val imageSources = if (loadRemoteImages) "https: http: data: cid:" else "data: cid:"
    val themeVariables = if (darkTheme) {
        """
          :root { --omnimail-bg:#0f1513; --omnimail-text:#dfe4e1; --omnimail-muted:#bec9c5; --omnimail-surface:#26302d; --omnimail-outline:#3f4946; --omnimail-link:#99d5ca; --omnimail-shield:#89938f; }
        """.trimIndent()
    } else {
        """
          :root { color-scheme:light; --omnimail-bg:#fff; --omnimail-text:#222; --omnimail-muted:#666; --omnimail-surface:#eeeef1; --omnimail-outline:#d5d5d9; --omnimail-link:#174ea6; --omnimail-shield:#626268; }
        """.trimIndent()
    }
    val head = """
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="referrer" content="no-referrer">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src $imageSources; style-src 'unsafe-inline'; font-src data:; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
        <style>
          $themeVariables
          html, body { width:100% !important; max-width:100% !important; overflow-x:hidden !important; }
          body { box-sizing:border-box; min-width:0 !important; margin:0 !important; padding:18px !important; padding-bottom:max(24px, env(safe-area-inset-bottom)) !important; color:var(--omnimail-text) !important; background:var(--omnimail-bg) !important; font:15px/1.6 sans-serif; overflow-wrap:anywhere; }
          *, *::before, *::after { box-sizing:border-box; }
          table, tbody, tr, td, div { min-width:0 !important; max-width:100% !important; }
          img, video { max-width:100% !important; height:auto !important; }
          pre, code { max-width:100% !important; white-space:pre-wrap !important; overflow-wrap:anywhere; }
          a { color:var(--omnimail-link); text-decoration:underline; }
          .omnimail-message-header { all:initial !important; display:block !important; margin:-18px -18px 0 !important; padding:26px 24px 22px !important; color:var(--omnimail-text) !important; background:var(--omnimail-bg) !important; font-family:sans-serif !important; }
          .omnimail-message-header h1 { all:initial !important; display:block !important; margin:0 0 20px !important; color:var(--omnimail-text) !important; font:600 24px/1.28 sans-serif !important; overflow-wrap:anywhere !important; }
          .omnimail-person { all:initial !important; display:flex !important; align-items:flex-start !important; gap:12px !important; }
          .omnimail-avatar { all:initial !important; display:flex !important; flex:0 0 40px !important; width:40px !important; height:40px !important; align-items:center !important; justify-content:center !important; border-radius:50% !important; color:var(--omnimail-text) !important; background:var(--omnimail-surface) !important; font:600 16px/1 sans-serif !important; }
          .omnimail-person-copy { all:initial !important; display:block !important; min-width:0 !important; flex:1 !important; }
          .omnimail-message-header .omnimail-sender { all:initial !important; display:block !important; color:var(--omnimail-text) !important; font:600 16px/1.4 sans-serif !important; }
          .omnimail-message-header .omnimail-meta { all:initial !important; display:block !important; color:var(--omnimail-muted) !important; font:13px/1.45 sans-serif !important; overflow-wrap:anywhere !important; }
          .omnimail-header-divider { display:block !important; height:1px !important; margin-top:22px !important; background:var(--omnimail-outline) !important; }
          .omnimail-remote-banner { all:initial !important; display:flex !important; align-items:center !important; gap:10px !important; margin:0 -18px 18px !important; padding:12px 20px !important; color:var(--omnimail-text) !important; background:var(--omnimail-surface) !important; font:13px/1.4 sans-serif !important; }
          .omnimail-shield { display:inline-block !important; flex:0 0 18px !important; width:18px !important; height:21px !important; background:var(--omnimail-shield) !important; clip-path:polygon(50% 0, 100% 18%, 88% 70%, 50% 100%, 12% 70%, 0 18%) !important; }
          .omnimail-remote-banner .omnimail-banner-label { flex:1 !important; }
          .omnimail-remote-banner a { color:var(--omnimail-text) !important; font-weight:600 !important; text-decoration:none !important; padding:8px 4px !important; }
          .omnimail-plain-text { white-space:pre-wrap !important; color:var(--omnimail-text) !important; background:var(--omnimail-bg) !important; font:16px/1.65 sans-serif !important; }
          .omnimail-attachments { all:initial !important; display:block !important; margin:24px -18px -18px !important; padding:24px !important; color:var(--omnimail-text) !important; background:var(--omnimail-bg) !important; font-family:sans-serif !important; }
          .omnimail-attachments h2 { all:initial !important; display:block !important; margin-bottom:12px !important; color:var(--omnimail-text) !important; font:600 18px/1.4 sans-serif !important; }
          .omnimail-attachment { display:flex !important; flex-direction:column !important; gap:3px !important; margin-bottom:8px !important; padding:12px 14px !important; border-radius:12px !important; background:var(--omnimail-surface) !important; }
          .omnimail-attachment strong { font:500 15px/1.4 sans-serif !important; overflow-wrap:anywhere !important; }
          .omnimail-attachment span, .omnimail-attachments p { color:var(--omnimail-muted) !important; font:13px/1.45 sans-serif !important; }
        </style>
    """.trimIndent()
    val headTag = Regex("<head[^>]*>", RegexOption.IGNORE_CASE)
    val htmlTag = Regex("<html[^>]*>", RegexOption.IGNORE_CASE)
    val document = if (safe.contains("<html", ignoreCase = true)) {
        if (headTag.containsMatchIn(safe)) {
            val match = headTag.find(safe)!!
            safe.replaceRange(match.range, "${match.value}$head")
        } else {
            val match = htmlTag.find(safe)!!
            safe.replaceRange(match.range, "${match.value}<head>$head</head>")
        }
    } else {
        "<!doctype html><html><head>$head</head><body>$safe</body></html>"
    }
    val bodyMatch = BODY_OPEN_TAG.find(document)
    val withHeader = if (bodyMatch != null) {
        document.replaceRange(bodyMatch.range, "${bodyMatch.value}$trustedHeaderHtml")
    } else {
        document
    }
    return if (BODY_CLOSE_TAG.containsMatchIn(withHeader)) {
        withHeader.replaceFirst(BODY_CLOSE_TAG, "$trustedFooterHtml</body>")
    } else {
        "$withHeader$trustedFooterHtml"
    }
}

internal fun safeExternalUrl(value: String): String? = runCatching {
    val uri = URI(value.trim())
    if ((uri.scheme.equals("https", true) || uri.scheme.equals("http", true)) && !uri.host.isNullOrBlank()) {
        uri.toASCIIString()
    } else {
        null
    }
}.getOrNull()

fun openExternalUrl(context: android.content.Context, url: String): Boolean {
    val safe = safeExternalUrl(url) ?: return false
    return try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safe)))
        true
    } catch (_: ActivityNotFoundException) {
        false
    }
}

private val DANGEROUS_BLOCKS = Regex(
    "<(script|iframe|object|embed|form|base|video|audio|svg|math)\\b[^>]*>[\\s\\S]*?</\\1\\s*>|<(script|iframe|object|embed|form|base|video|audio|svg|math)\\b[^>]*/?>",
    setOf(RegexOption.IGNORE_CASE),
)
private val META_HTTP_EQUIV = Regex("<meta\\b[^>]*http-equiv\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)[^>]*>", RegexOption.IGNORE_CASE)
private val META_COLOR_SCHEME = Regex(
    "<meta\\b[^>]*name\\s*=\\s*(?:\"(?:supported-)?color-scheme\"|'(?:supported-)?color-scheme'|(?:supported-)?color-scheme)[^>]*>",
    RegexOption.IGNORE_CASE,
)
private val CSS_COLOR_SCHEME = Regex(
    "(?:supported-)?color-scheme\\s*:\\s*[^;}'\"]+;?",
    RegexOption.IGNORE_CASE,
)
private val EVENT_ATTRIBUTES = Regex("\\s+on[a-z]+\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)", RegexOption.IGNORE_CASE)
private val DANGEROUS_ATTRIBUTES = Regex("\\s+(srcdoc|formaction)\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)", RegexOption.IGNORE_CASE)
private val DANGEROUS_SCHEMES = Regex("((?:href|src)\\s*=\\s*['\"]?)\\s*(?:javascript|file|content|intent|omnimail):[^'\"]*", RegexOption.IGNORE_CASE)
private val REMOTE_IMAGE_SOURCES = Regex("(<(?:img|source)\\b[^>]*?)\\s+(?:src|srcset)\\s*=\\s*(?:\"https?://[^\"]*\"|'https?://[^']*'|https?://[^\\s>]+)", RegexOption.IGNORE_CASE)
private val CSS_REMOTE_URLS = Regex("url\\(\\s*(['\"]?)https?://[^)]*\\1\\s*\\)", RegexOption.IGNORE_CASE)
private val BODY_OPEN_TAG = Regex("<body(?:\\s[^>]*)?>", RegexOption.IGNORE_CASE)
private val BODY_CLOSE_TAG = Regex("</body\\s*>", RegexOption.IGNORE_CASE)
internal const val SHOW_REMOTE_IMAGES_URL = "omnimail://show-remote-images"
