package com.omnimail.android.data.network

import java.net.URI

private val localHosts = setOf("localhost", "127.0.0.1", "10.0.2.2", "::1")

fun normalizeInstanceUrl(input: String, allowLocalHttp: Boolean): String {
    val candidate = input.trim().let {
        if (it.contains("://")) it else "https://$it"
    }
    val uri = runCatching { URI(candidate) }
        .getOrElse { throw IllegalArgumentException("Invalid instance URL") }
    val scheme = uri.scheme?.lowercase()
    val host = uri.host?.lowercase()

    require(!host.isNullOrBlank()) { "Instance URL must contain a valid host" }
    require(scheme == "https" || (allowLocalHttp && scheme == "http" && host in localHosts)) {
        "Instance URL must use HTTPS"
    }
    require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null) {
        "Instance URL cannot contain credentials, a query, or a fragment"
    }
    require(uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") {
        "Enter the OmniMail instance root URL without a path"
    }

    return URI(scheme, null, host, uri.port, null, null, null).toString()
}
