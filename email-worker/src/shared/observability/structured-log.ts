const MAX_LOG_TEXT = 500

export function safeLogText(value: unknown, maximum = MAX_LOG_TEXT): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b(authorization|password|token|secret|code)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .trim()
    .slice(0, maximum)
}

export function errorLogFields(error: unknown): Record<string, unknown> {
  const candidate = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : null
  return {
    error_type: error instanceof Error ? error.name : typeof error,
    error_message: safeLogText(error instanceof Error ? error.message : error),
    error_status: typeof candidate?.status === 'number' ? candidate.status : undefined,
    error_definitive: typeof candidate?.definitive === 'boolean'
      ? candidate.definitive
      : undefined,
  }
}

export function logWorkerError(
  event: string,
  fields: Record<string, unknown>,
  error: unknown,
): void {
  console.error({
    level: 'error',
    event,
    ...fields,
    ...errorLogFields(error),
  })
}

export function logWorkerInfo(event: string, fields: Record<string, unknown>): void {
  console.info({ level: 'info', event, ...fields })
}
