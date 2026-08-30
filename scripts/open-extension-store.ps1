param(
  [int]$DebugPort = 9222
)

$chrome = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
if (-not (Test-Path -LiteralPath $chrome)) {
  $chrome = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
}
if (-not (Test-Path -LiteralPath $chrome)) {
  throw 'Google Chrome is not installed.'
}

$profile = Join-Path $env:LOCALAPPDATA 'OmniMail\ChromeWebStoreProfile'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
Start-Process -FilePath $chrome -ArgumentList @(
  "--user-data-dir=$profile"
  "--remote-debugging-address=127.0.0.1"
  "--remote-debugging-port=$DebugPort"
  "--remote-allow-origins=http://127.0.0.1:$DebugPort"
  '--no-first-run'
  '--no-default-browser-check'
  'https://chrome.google.com/webstore/devconsole'
)
