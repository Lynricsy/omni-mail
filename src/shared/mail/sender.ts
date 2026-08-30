export type ICloudSender = {
  name: string
  address: string
  isHideMyEmailRelay: boolean
}

const EMAIL = /^[^<>\s@]+@[^<>\s@]+$/
const HIDE_MY_EMAIL_RELAY = /_at_.+_[a-z0-9]{8,}_[a-z0-9]{6,}@icloud\.com$/i

function displayName(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed
}

export function parseICloudSender(value: string): ICloudSender {
  const text = value.trim()
  const mailbox = text.match(/^(.*?)\s*<\s*([^<>\s]+)\s*>$/)
  const name = mailbox ? displayName(mailbox[1]) : ''
  const address = mailbox?.[2] && EMAIL.test(mailbox[2])
    ? mailbox[2].toLowerCase()
    : EMAIL.test(text) ? text.toLowerCase() : ''
  return {
    name: name || (address ? '' : displayName(text)),
    address,
    isHideMyEmailRelay: HIDE_MY_EMAIL_RELAY.test(address),
  }
}
