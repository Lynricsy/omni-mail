import { ImapConnection, quoteImapValue } from '../../platform/imap/imap-connection'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  examineIndexedInbox,
  fetchIndexedMetadata,
  searchIndexedUidsAfter,
  searchLatestIndexedUids,
} from '../../platform/imap/imap-index'
import { iCloudImapMessageIsRead } from '../icloud/icloud-imap-flags'
import { parseICloudMessage } from '../icloud/icloud-message-parser'
import type { LinuxDoMailMessage } from './linux-do-mail-types'

const IMAP_HOST = 'mail.linux.do'
const IMAP_PORT = 993
const LIST_MESSAGE_BYTES = 65_536
const DETAIL_MESSAGE_BYTES = 524_288

export { ImapConnectionError as LinuxDoMailRemoteError }

function linuxDoMailSearchCriteria(query: string): string {
  const value = query.trim()
  return value ? `TEXT ${quoteImapValue(value)}` : 'ALL'
}

export function linuxDoMailSearchCommand(query: string): string {
  return `UID SEARCH${/[^\x00-\x7f]/.test(query) ? ' CHARSET UTF-8' : ''} ${
    linuxDoMailSearchCriteria(query)
  }`
}

export class LinuxDoMailImapClient {
  private readonly connection = new ImapConnection(
    IMAP_HOST,
    IMAP_PORT,
    'Linux DO Mail IMAP',
    '完整邮箱地址和密码或认证令牌',
    DETAIL_MESSAGE_BYTES,
  )

  constructor(
    private readonly username: string,
    private readonly password: string,
  ) {}

  async open(): Promise<void> {
    await this.connection.open(this.username, this.password)
  }

  async close(): Promise<void> {
    await this.connection.close()
  }

  async test(): Promise<void> {
    await this.connection.command('EXAMINE INBOX')
  }

  async examineInbox() {
    return examineIndexedInbox(this.connection, 'Linux DO Mail')
  }

  async searchLatestUids(uidNext: number, limit = 50) {
    return searchLatestIndexedUids(this.connection, uidNext, limit)
  }

  async searchAfter(uid: number, uidNext: number, limit = 50) {
    return searchIndexedUidsAfter(this.connection, uid, uidNext, limit)
  }

  async fetchMetadata(uids: number[]) {
    return fetchIndexedMetadata(this.connection, uids)
  }

  async listInbox(limit = 20, query = ''): Promise<LinuxDoMailMessage[]> {
    await this.connection.command('EXAMINE INBOX')
    const search = await this.connection.command(linuxDoMailSearchCommand(query))
    const line = search.lines.find((item) => item.startsWith('* SEARCH'))
    const uids = line
      ? line.slice(8).trim().split(/\s+/).filter(Boolean).map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0)
      : []
    const selected = uids.slice(-Math.max(1, Math.min(20, limit)))
    if (!selected.length) return []
    const result = await this.connection.command(
      `UID FETCH ${selected.join(',')} (UID FLAGS BODY.PEEK[]<0.${LIST_MESSAGE_BYTES}>)`,
    )
    const messages = await Promise.all(result.literals.map(({ line: fetchLine, data }) => (
      parseICloudMessage(
        data,
        fetchLine.match(/\bUID (\d+)\b/i)?.[1] || '',
        false,
        iCloudImapMessageIsRead(fetchLine),
      )
    )))
    return messages.sort((left, right) => Number(right.id) - Number(left.id))
  }

  async getMessage(uid: string): Promise<LinuxDoMailMessage> {
    if (!/^\d+$/.test(uid) || Number(uid) < 1) {
      throw new ImapConnectionError(400, '邮件 UID 无效。', true)
    }
    await this.connection.command('EXAMINE INBOX')
    const result = await this.connection.command(
      `UID FETCH ${uid} (UID FLAGS BODY.PEEK[]<0.${DETAIL_MESSAGE_BYTES}>)`,
    )
    const literal = result.literals.find(({ line }) => (
      new RegExp(`\\bUID ${uid}\\b`, 'i').test(line)
    ))
    if (!literal) throw new ImapConnectionError(404, '邮件不存在或已被移动。', true)
    return parseICloudMessage(
      literal.data,
      uid,
      true,
      iCloudImapMessageIsRead(literal.line),
    )
  }
}
