import { ICloudRemoteError } from './icloud-apple'

export function quoteICloudImapValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new ICloudRemoteError(400, 'IMAP 登录信息包含非法换行。')
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function iCloudImapSearchCriteria(query: string, recipient = ''): string {
  const to = recipient ? `HEADER To ${quoteICloudImapValue(recipient)} ` : ''
  return `${to}TEXT ${quoteICloudImapValue(query)}`
}

export function iCloudImapMessageIsRead(line: string): boolean {
  const flags = line.match(/\bFLAGS\s+\(([^)]*)\)/i)?.[1] || ''
  return flags.split(/\s+/).some((flag) => flag.toLowerCase() === '\\seen')
}

export function iCloudImapReadUpdate(
  line: string,
  uid: string,
): { isRead: boolean; markSeenCommand?: string } {
  const isRead = iCloudImapMessageIsRead(line)
  return isRead
    ? { isRead }
    : { isRead, markSeenCommand: `UID STORE ${uid} +FLAGS.SILENT (\\Seen)` }
}
