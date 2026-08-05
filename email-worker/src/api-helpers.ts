export function clientIp(headers: Headers): string {
  return headers.get('CF-Connecting-IP')
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

export function safeJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function fileDisposition(type: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export function attachmentDisposition(filename: string): string {
  return fileDisposition('attachment', filename)
}

export function inlineDisposition(filename: string): string {
  return fileDisposition('inline', filename)
}
