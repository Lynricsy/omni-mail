import PostalMime from 'postal-mime'
import { imapMailboxes, imapMailboxText } from '../../shared/mail/imap-message-parser'
import { ImapConnection, type ImapCommandResult } from './imap-connection'
import { ImapConnectionError } from './imap-errors'

const SEARCH_RANGE_SIZE = 500
const INITIAL_SEARCH_ROUNDS = 20
const INCREMENTAL_SEARCH_ROUNDS = 10

export interface IndexedImapMetadata {
  imapUid: number
  messageIdHeader: string
  senderName: string
  senderAddress: string
  recipients: string[]
  subject: string
  internalDate: number
  sizeBytes: number
  flags: string[]
  isRead: boolean
  hasAttachments: boolean
}

function numericAttribute(line: string, name: string): string {
  return line.match(new RegExp(`\\b${name}\\s+(\\d+)\\b`, 'i'))?.[1] || ''
}

function attributeList(line: string, name: string): string[] {
  const value = line.match(new RegExp(`\\b${name} \\(([^)]*)\\)`, 'i'))?.[1] || ''
  return value.match(/"(?:\\.|[^"])*"|[^\s]+/g)?.map((item) => (
    item.startsWith('"') ? item.slice(1, -1).replace(/\\([\\"])/g, '$1') : item
  )) ?? []
}

function validUids(values: number[]): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .sort((left, right) => left - right)
}

function uidsFromSearch(result: ImapCommandResult): number[] {
  const line = result.lines.find((item) => item.startsWith('* SEARCH'))
  return line ? validUids(line.slice(8).trim().split(/\s+/).filter(Boolean).map(Number)) : []
}

export async function examineIndexedInbox(
  connection: ImapConnection,
  service: string,
): Promise<{ uidValidity: number; uidNext: number }> {
  const result = await connection.command('EXAMINE INBOX')
  const uidValidity = Number(result.lines
    .map((line) => line.match(/\[UIDVALIDITY (\d+)\]/i)?.[1]).find(Boolean))
  const uidNext = Number(result.lines
    .map((line) => line.match(/\[UIDNEXT (\d+)\]/i)?.[1]).find(Boolean))
  if (!Number.isSafeInteger(uidValidity) || uidValidity < 1) {
    throw new ImapConnectionError(502, `${service} 未返回有效的 UIDVALIDITY。`, true)
  }
  if (!Number.isSafeInteger(uidNext) || uidNext < 1) {
    throw new ImapConnectionError(502, `${service} 未返回有效的 UIDNEXT。`, true)
  }
  return { uidValidity, uidNext }
}

export async function searchLatestIndexedUids(
  connection: ImapConnection,
  uidNext: number,
  limit = 50,
): Promise<number[]> {
  const found: number[] = []
  let upper = uidNext - 1
  for (let round = 0; round < INITIAL_SEARCH_ROUNDS && upper > 0; round += 1) {
    const lower = Math.max(1, upper - SEARCH_RANGE_SIZE + 1)
    found.push(...uidsFromSearch(await connection.command(`UID SEARCH UID ${lower}:${upper}`)))
    if (validUids(found).length >= limit) break
    upper = lower - 1
  }
  return validUids(found).slice(-limit)
}

export async function searchIndexedUidsAfter(
  connection: ImapConnection,
  uid: number,
  uidNext: number,
  limit = 50,
): Promise<{ uids: number[]; scannedThrough: number }> {
  const target = uidNext - 1
  const found: number[] = []
  let lower = uid + 1
  let scannedThrough = uid
  for (let round = 0; round < INCREMENTAL_SEARCH_ROUNDS && lower <= target; round += 1) {
    const upper = Math.min(target, lower + SEARCH_RANGE_SIZE - 1)
    found.push(...uidsFromSearch(await connection.command(`UID SEARCH UID ${lower}:${upper}`)))
    scannedThrough = upper
    if (validUids(found).length >= limit) break
    lower = upper + 1
  }
  const uids = validUids(found).slice(0, limit)
  return { uids, scannedThrough: uids.length === limit ? uids.at(-1)! : scannedThrough }
}

async function parseMetadata(
  line: string,
  headers: Uint8Array,
  expectedUid: number,
): Promise<IndexedImapMetadata> {
  const imapUid = Number(numericAttribute(line, 'UID'))
  if (imapUid !== expectedUid) throw new Error('IMAP FETCH 响应 UID 与请求不一致。')
  const parsed = await PostalMime.parse(headers, { maxHeadersSize: 128 * 1024 })
  const sender = imapMailboxes(parsed.from)[0]
  const flags = attributeList(line, 'FLAGS')
  const rawDate = line.match(/\bINTERNALDATE "([^"]+)"/i)?.[1] || parsed.date
  const date = rawDate ? Date.parse(rawDate) : NaN
  const contentType = parsed.headers.find(({ key }) => key === 'content-type')?.value || ''
  return {
    imapUid,
    messageIdHeader: parsed.messageId || '',
    senderName: sender?.name || '',
    senderAddress: sender?.address || '',
    recipients: imapMailboxes(parsed.to).map(imapMailboxText),
    subject: (parsed.subject || '').trim().slice(0, 998),
    internalDate: Number.isFinite(date) ? Math.floor(date / 1000) : 0,
    sizeBytes: Number(numericAttribute(line, 'RFC822.SIZE')) || 0,
    flags,
    isRead: flags.some((flag) => flag.toLowerCase() === '\\seen'),
    hasAttachments: /multipart\/mixed/i.test(contentType) || /"ATTACHMENT"/i.test(line),
  }
}

export async function fetchIndexedMetadata(
  connection: ImapConnection,
  uids: number[],
  deadline = Date.now() + 150_000,
): Promise<IndexedImapMetadata[]> {
  const messages: IndexedImapMetadata[] = []
  for (const uid of validUids(uids)) {
    if (Date.now() >= deadline) throw new ImapConnectionError(504, '邮箱索引同步超时。')
    const result = await connection.command(
      `UID FETCH ${uid} (UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE `
      + 'BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID CONTENT-TYPE)])',
    )
    const literal = result.literals.find(({ line }) => new RegExp(`\\bUID ${uid}\\b`, 'i').test(line))
    if (!literal) throw new Error('IMAP FETCH 响应缺少邮件头。')
    messages.push(await parseMetadata(literal.line, literal.data, uid))
  }
  return messages
}
