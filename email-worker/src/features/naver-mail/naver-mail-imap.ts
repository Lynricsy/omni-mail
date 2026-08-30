import { ImapConnection } from '../../platform/imap/imap-connection'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import packageMetadata from '../../../../package.json'
import { parseNaverMailMessage, parseNaverMailMetadata } from './naver-mail-message-parser'
import type { NaverMailMessageMetadata } from './naver-mail-types'

const IMAP_HOST = 'imap.naver.com'
const IMAP_PORT = 993
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024
const METADATA_BATCH_SIZE = 20
const SEARCH_RANGE_SIZE = 500
const INITIAL_SEARCH_ROUNDS = 20
const INCREMENTAL_SEARCH_ROUNDS = 10
const INCREMENTAL_MESSAGE_LIMIT = 20
// NAVER can return 0; map it outside the RFC 32-bit range to preserve reset detection.
const ZERO_UID_VALIDITY_SENTINEL = 2 ** 32

export { ImapConnectionError as NaverMailRemoteError }

function uidsFromSearch(lines: string[]): number[] {
  const line = lines.find((item) => item.startsWith('* SEARCH'))
  if (!line) return []
  return line.slice(8).trim().split(/\s+/).filter(Boolean).map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0)
}

function validUids(values: number[]): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .sort((left, right) => left - right)
}

export class NaverMailImapClient {
  private readonly connection = new ImapConnection(
    IMAP_HOST,
    IMAP_PORT,
    'NAVER Mail IMAP',
    ' NAVER 邮箱地址和应用专用密码',
    MAX_MESSAGE_BYTES,
  )

  constructor(
    private readonly email: string,
    private readonly appPassword: string,
  ) {}

  async open(): Promise<void> {
    const naverId = this.email.slice(0, -'@naver.com'.length)
    await this.connection.open(naverId, this.appPassword)
    const capability = await this.connection.command('CAPABILITY')
    if (capability.lines.some((line) => /(?:^|\s)ID(?:\s|$)/i.test(line))) {
      await this.connection.command(
        `ID ("name" "OmniMail" "version" "${packageMetadata.version}" "vendor" "OmniMail")`,
      )
    }
  }

  async close(): Promise<void> {
    await this.connection.close()
  }

  async examineInbox(): Promise<{ uidValidity: number; uidNext: number; exists: number }> {
    const result = await this.connection.command('EXAMINE INBOX')
    const remoteUidValidity = Number(result.lines
      .map((line) => line.match(/\[UIDVALIDITY (\d+)\]/i)?.[1])
      .find(Boolean))
    const uidNext = Number(result.lines
      .map((line) => line.match(/\[UIDNEXT (\d+)\]/i)?.[1])
      .find(Boolean))
    const exists = Number(result.lines
      .map((line) => line.match(/^\* (\d+) EXISTS$/i)?.[1])
      .find(Boolean) || 0)
    if (!Number.isSafeInteger(remoteUidValidity)
      || remoteUidValidity < 0
      || remoteUidValidity >= ZERO_UID_VALIDITY_SENTINEL) {
      throw new ImapConnectionError(502, 'NAVER 邮箱未返回有效的 UIDVALIDITY。', true)
    }
    if (!Number.isSafeInteger(uidNext) || uidNext < 1) {
      throw new ImapConnectionError(502, 'NAVER 邮箱未返回有效的 UIDNEXT。', true)
    }
    return {
      uidValidity: remoteUidValidity || ZERO_UID_VALIDITY_SENTINEL,
      uidNext,
      exists,
    }
  }

  async searchLatestUids(uidNext: number, limit = 100): Promise<number[]> {
    if (!Number.isSafeInteger(uidNext) || uidNext < 1 || !Number.isInteger(limit) || limit < 1) {
      throw new ImapConnectionError(400, 'NAVER 邮箱同步边界无效。', true)
    }
    const found: number[] = []
    let upper = uidNext - 1
    for (let round = 0; round < INITIAL_SEARCH_ROUNDS && upper > 0; round += 1) {
      const lower = Math.max(1, upper - SEARCH_RANGE_SIZE + 1)
      found.push(...uidsFromSearch((await this.connection.command(
        `UID SEARCH UID ${lower}:${upper}`,
      )).lines))
      if (validUids(found).length >= limit) break
      upper = lower - 1
    }
    return validUids(found).slice(-limit)
  }

  async searchAfter(uid: number, uidNext: number): Promise<{ uids: number[]; scannedThrough: number }> {
    if (!Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(uidNext) || uidNext < 1) {
      throw new ImapConnectionError(400, 'NAVER 邮箱同步游标无效。', true)
    }
    const target = uidNext - 1
    const found: number[] = []
    let lower = uid + 1
    let scannedThrough = uid
    for (let round = 0; round < INCREMENTAL_SEARCH_ROUNDS && lower <= target; round += 1) {
      const upper = Math.min(target, lower + SEARCH_RANGE_SIZE - 1)
      found.push(...uidsFromSearch((await this.connection.command(
        `UID SEARCH UID ${lower}:${upper}`,
      )).lines))
      scannedThrough = upper
      if (validUids(found).length >= INCREMENTAL_MESSAGE_LIMIT) break
      lower = upper + 1
    }
    const uids = validUids(found).slice(0, INCREMENTAL_MESSAGE_LIMIT)
    return {
      uids,
      scannedThrough: uids.length === INCREMENTAL_MESSAGE_LIMIT
        ? uids[uids.length - 1]
        : scannedThrough,
    }
  }

  async fetchMetadata(
    uids: number[],
    deadline = Date.now() + 150_000,
  ): Promise<NaverMailMessageMetadata[]> {
    const selected = validUids(uids)
    const messages: NaverMailMessageMetadata[] = []
    for (let offset = 0; offset < selected.length; offset += METADATA_BATCH_SIZE) {
      if (Date.now() >= deadline) {
        throw new ImapConnectionError(504, 'NAVER 邮箱同步超过总执行时间上限。')
      }
      const batch = selected.slice(offset, offset + METADATA_BATCH_SIZE)
      const result = await this.connection.command(
        `UID FETCH ${batch.join(',')} (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID CONTENT-TYPE)])`,
      )
      for (const literal of result.literals) {
        messages.push(await parseNaverMailMetadata(literal.line, literal.data))
      }
    }
    return messages
  }

  async getMessage(uid: number) {
    if (!Number.isSafeInteger(uid) || uid < 1) {
      throw new ImapConnectionError(400, 'NAVER 邮箱邮件 UID 无效。', true)
    }
    await this.connection.command('EXAMINE INBOX')
    const result = await this.connection.command(`UID FETCH ${uid} (UID BODY.PEEK[])`)
    const literal = result.literals.find(({ line }) => new RegExp(`\\bUID ${uid}\\b`, 'i').test(line))
    if (!literal) throw new ImapConnectionError(404, '邮件不存在或已移出收件箱。', true)
    return parseNaverMailMessage(literal.data, String(uid))
  }

  async markSeen(uid: number): Promise<void> {
    if (!Number.isSafeInteger(uid) || uid < 1) {
      throw new ImapConnectionError(400, 'NAVER 邮箱邮件 UID 无效。', true)
    }
    await this.connection.command('SELECT INBOX')
    await this.connection.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`)
  }
}
