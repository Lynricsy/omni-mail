function normalizedOrigin(value: string): string {
  try {
    return new URL(value).origin
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
): boolean {
  if (!requestOrigin) return true
  const origin = normalizedOrigin(requestOrigin)
  if (!origin) return false
  return origin === normalizedOrigin(requestUrl)
    || configuredOrigins(configured).includes(origin)
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
