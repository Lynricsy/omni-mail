import { ICloudRemoteError } from './icloud-apple'
import { ImapConnection } from '../../platform/imap/imap-connection'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  examineIndexedInbox,
  fetchIndexedMetadata,
  searchIndexedUidsAfter,
  searchLatestIndexedUids,
} from '../../platform/imap/imap-index'
import {
  iCloudImapMessageIsRead,
  iCloudImapReadUpdate,
  iCloudImapSearchCriteria,
  quoteICloudImapValue,
} from './icloud-imap-flags'
import { parseICloudMessage } from './icloud-message-parser'
import type { ICloudMessage } from './icloud-types'

export { quoteICloudImapValue } from './icloud-imap-flags'

const IMAP_HOST = 'imap.mail.me.com'
const IMAP_PORT = 993
const LIST_MESSAGE_BYTES = 65_536
const DETAIL_MESSAGE_BYTES = 524_288

function sinceDate(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${date.getUTCDate()}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`
}

export class ICloudImapClient {
  private readonly connection = new ImapConnection(
    IMAP_HOST,
    IMAP_PORT,
    'iCloud IMAP',
    ' iCloud 邮箱和应用专用密码',
    DETAIL_MESSAGE_BYTES,
  )

  constructor(
    private readonly email: string,
    private readonly appPassword: string,
  ) {}

  async open(): Promise<void> {
    try {
      await this.connection.open(this.email, this.appPassword)
    } catch (error) {
      if (error instanceof ImapConnectionError) {
        throw new ICloudRemoteError(error.status, error.message, error.definitive)
      }
      throw error
    }
  }

  async close(): Promise<void> {
    await this.connection.close()
  }

  private async command(
    command: string,
    failureStatus = 502,
  ) {
    try {
      return await this.connection.command(command, failureStatus)
    } catch (error) {
      if (error instanceof ImapConnectionError) {
        throw new ICloudRemoteError(error.status, error.message, error.definitive)
      }
      throw error
    }
  }

  async test(): Promise<void> {
    await this.command('EXAMINE INBOX')
  }

  async examineInbox() {
    return examineIndexedInbox(this.connection, 'iCloud')
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

  private async search(criteria: string, utf8 = false): Promise<number[]> {
    await this.command('EXAMINE INBOX')
    const result = await this.command(`UID SEARCH${utf8 ? ' CHARSET UTF-8' : ''} ${criteria}`)
    const line = result.lines.find((item) => item.startsWith('* SEARCH'))
    return line
      ? line.slice(8).trim().split(/\s+/).filter(Boolean).map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0)
      : []
  }

  private async fetch(uids: number[], limit: number): Promise<ICloudMessage[]> {
    const selected = uids.slice(-limit)
    if (!selected.length) return []
    const result = await this.command(
      `UID FETCH ${selected.join(',')} (UID FLAGS BODY.PEEK[]<0.${LIST_MESSAGE_BYTES}>)`,
    )
    const messages = await Promise.all(result.literals.map(({ line, data }) => (
      parseICloudMessage(
        data,
        line.match(/\bUID (\d+)\b/i)?.[1] || '',
        false,
        iCloudImapMessageIsRead(line),
      )
    )))
    return messages.sort((left, right) => Number(right.id) - Number(left.id))
  }

  async listInbox(limit: number, days: number): Promise<ICloudMessage[]> {
    return this.fetch(await this.search(days ? `SINCE ${sinceDate(days)}` : 'ALL'), limit)
  }

  async findByRecipient(recipient: string, limit: number, days: number): Promise<ICloudMessage[]> {
    const date = days ? `SINCE ${sinceDate(days)} ` : ''
    const uids = await this.search(`${date}HEADER To ${quoteICloudImapValue(recipient)}`)
    if (uids.length) return this.fetch(uids, limit)
    const recent = await this.listInbox(Math.min(50, limit * 3), days)
    const needle = recipient.toLowerCase()
    return recent.filter((message) => message.to.toLowerCase().includes(needle)).slice(0, limit)
  }

  async searchInbox(
    query: string,
    recipient: string,
    limit: number,
    days: number,
  ): Promise<ICloudMessage[]> {
    const date = days ? `SINCE ${sinceDate(days)} ` : ''
    const criteria = iCloudImapSearchCriteria(query, recipient)
    const utf8 = /[^\x00-\x7f]/.test(query)
    const uids = await this.search(`${date}${criteria}`, utf8)
    if (uids.length || !recipient) return this.fetch(uids, limit)
    const fallback = await this.fetch(
      await this.search(`${date}${iCloudImapSearchCriteria(query)}`, utf8),
      Math.min(50, limit * 3),
    )
    const needle = recipient.toLowerCase()
    return fallback.filter((message) => message.to.toLowerCase().includes(needle)).slice(0, limit)
  }

  async getMessage(uid: string): Promise<ICloudMessage> {
    if (!/^\d+$/.test(uid) || Number(uid) < 1) throw new ICloudRemoteError(400, '邮件 UID 无效。')
    await this.command('SELECT INBOX')
    const result = await this.command(
      `UID FETCH ${uid} (UID FLAGS BODY.PEEK[]<0.${DETAIL_MESSAGE_BYTES}>)`,
    )
    const literal = result.literals.find(({ line }) => new RegExp(`\\bUID ${uid}\\b`, 'i').test(line))
    if (!literal) throw new ICloudRemoteError(404, '邮件不存在或已被移动。')
    const readUpdate = iCloudImapReadUpdate(literal.line, uid)
    const message = await parseICloudMessage(literal.data, uid, true, readUpdate.isRead)
    if (readUpdate.markSeenCommand) {
      await this.command(readUpdate.markSeenCommand)
      message.isRead = true
    }
    return message
  }
}
