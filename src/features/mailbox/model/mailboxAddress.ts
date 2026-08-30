export function validMailboxLocalPart(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(value)
}

export function randomMailboxLocalPart(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const random = Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${prefix}${random}`
}
