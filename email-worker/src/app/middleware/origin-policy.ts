export const OFFICIAL_CHROME_EXTENSION_ID = 'fpeecjailboemocpmpcbjaghpkpcaihf'
export const OFFICIAL_CHROME_EXTENSION_ORIGIN = (
  `chrome-extension://${OFFICIAL_CHROME_EXTENSION_ID}`
)

function normalizedOrigin(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol === 'chrome-extension:') {
      return /^[a-p]{32}$/.test(url.hostname)
        ? `chrome-extension://${url.hostname}`
        : ''
    }
    return url.origin === 'null' ? '' : url.origin
  } catch {
    return ''
  }
}

export function configuredOrigins(value: string | undefined): string[] {
  return (value || 'http://localhost:5173')
    .split(',')
    .map((origin) => normalizedOrigin(origin.trim()))
    .filter(Boolean)
}

export function isAllowedOrigin(
  requestOrigin: string | undefined,
  requestUrl: string,
  configured: string | undefined,
  officialExtensionEnabled = false,
): boolean {
  if (!requestOrigin) return true
  const origin = normalizedOrigin(requestOrigin)
  if (!origin) return false
  if (origin === normalizedOrigin(requestUrl)) return true
  if (origin === OFFICIAL_CHROME_EXTENSION_ORIGIN) return officialExtensionEnabled
  return configuredOrigins(configured).includes(origin)
}

export function isOfficialChromeExtensionOrigin(value: string | undefined): boolean {
  return normalizedOrigin(value || '') === OFFICIAL_CHROME_EXTENSION_ORIGIN
}

export function isAllowedExtensionClient(
  clientId: string,
  configured: string | undefined,
  officialExtensionEnabled = false,
): boolean {
  const origin = `chrome-extension://${clientId}`
  return origin === OFFICIAL_CHROME_EXTENSION_ORIGIN
    ? officialExtensionEnabled
    : configuredOrigins(configured).includes(origin)
}

export function allowedTurnstileHostnames(
  configured: string | undefined,
  requestOrigin?: string,
): Set<string> {
  const origins = requestOrigin
    ? [requestOrigin, ...configuredOrigins(configured)]
    : configuredOrigins(configured)
  return new Set(origins.flatMap((origin) => {
    try {
      return [new URL(origin).hostname.toLowerCase()]
    } catch {
      return []
    }
  }))
}
