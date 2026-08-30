export const MAX_RECIPIENTS = 50

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidRecipient(value: string): boolean {
  const normalized = normalizeRecipient(value)
  return EMAIL.test(normalized) && normalized.length <= 254
}

export function recipientList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map(normalizeRecipient)
    .filter(Boolean)
}

export function recipientValueIsValid(value: string): boolean {
  const recipients = recipientList(value)
  return recipients.length > 0
    && recipients.length <= MAX_RECIPIENTS
    && recipients.every(isValidRecipient)
}
