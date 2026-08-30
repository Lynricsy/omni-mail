# GitHub Android releases

Android releases use their own tags and version sequence:

- Website: `v0.2.5`
- OmniMail Float: `float-v0.3.0`
- Android: `android-v0.1.0`

Only an `android-vMAJOR.MINOR.PATCH` tag runs the Android release workflow. Android
releases are not marked as the repository's latest release, so they do not replace
the website release returned by `/releases/latest`.

## One-time signing setup

Generate one long-lived release key and keep an offline backup. Every future APK
must use this exact key or Android will reject it as an update.

```powershell
keytool -genkeypair -v `
  -keystore omnimail-android-release.jks `
  -alias omnimail-android `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000
```

Convert the keystore to Base64 without committing it:

```powershell
$keystoreBase64 = [Convert]::ToBase64String(
  [IO.File]::ReadAllBytes((Resolve-Path .\omnimail-android-release.jks))
)
$keystoreBase64 | Set-Clipboard
```

Create these repository secrets under **Settings → Secrets and variables →
Actions**:

| Secret | Value |
| --- | --- |
| `OMNIMAIL_ANDROID_KEYSTORE_BASE64` | Base64 text copied above |
| `OMNIMAIL_ANDROID_SIGNING_STORE_PASSWORD` | Keystore password |
| `OMNIMAIL_ANDROID_SIGNING_KEY_ALIAS` | `omnimail-android` |
| `OMNIMAIL_ANDROID_SIGNING_KEY_PASSWORD` | Key password |

Do not delete the local/offline keystore backup after adding the secrets. GitHub
Secrets are not a recoverable backup.

## Publish an Android version

Create the Android-specific release notes first:

```powershell
Copy-Item `
  docs\releases\android\TEMPLATE.md `
  docs\releases\android\android-v0.1.0.md
```

Edit that file, then create a unique Android tag from `main` and push it:

```powershell
git switch main
git pull --ff-only
git tag -a android-v0.1.0 -m "OmniMail Android 0.1.0"
git push origin android-v0.1.0
```

The workflow runs unit tests and release lint, builds the signed APK, verifies its
certificate, publishes `omnimail-android-0.1.0.apk` plus its SHA-256 checksum, and
uses `docs/releases/android/android-v0.1.0.md` as the Release Notes. Missing or
empty Android notes stop the release. The website's latest release remains
unchanged.

Running **Android Release** manually from the Actions page accepts a version such
as `0.1.0` and creates a signed workflow artifact only. It does not create or edit
a GitHub Release.

For the next Android update, use a higher Android version such as
`android-v0.1.1`. The workflow derives `versionName` and a monotonically increasing
`versionCode` from that tag.

The currently installed debug APK uses Android's debug certificate. It must be
uninstalled once before installing the first release-signed APK. After that, all
signed GitHub releases can update it in place as long as the release keystore is
unchanged.
