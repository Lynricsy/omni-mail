import PostalMime from 'postal-mime'
import {
  imapMailboxes,
  imapMailboxText,
  parseImapMessage,
} from '../../shared/mail/imap-message-parser'
import type { QqMailMessageDetail, QqMailMessageMetadata } from './qq-mail-types'

function listValues(value: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  let escaped = false
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
    } else if (quoted && character === '\\') {
      escaped = true
    } else if (character === '"') {
      quoted = !quoted
    } else if (!quoted && /\s/.test(character)) {
      if (current) values.push(current)
      current = ''
    } else {
      current += character
    }
  }
  if (current) values.push(current)
  return values
}

function attributeList(line: string, name: string): string[] {
  const marker = line.search(new RegExp(`\\b${name} \\(`, 'i'))
  if (marker < 0) return []
  const start = line.indexOf('(', marker) + 1
  let quoted = false
  let escaped = false
  for (let index = start; index < line.length; index += 1) {
    const character = line[index]
    if (escaped) escaped = false
    else if (quoted && character === '\\') escaped = true
    else if (character === '"') quoted = !quoted
    else if (!quoted && character === ')') return listValues(line.slice(start, index))
  }
  return []
}

function numericAttribute(line: string, name: string): string {
  return line.match(new RegExp(`\\b${name}\\s+(\\d+)\\b`, 'i'))?.[1] || ''
}

function internalDate(line: string, headerDate = ''): number {
  const value = line.match(/\bINTERNALDATE "([^"]+)"/i)?.[1] || headerDate
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.floor(date / 1000) : 0
}

export async function parseQqMailMetadata(
  fetchLine: string,
  headers: Uint8Array,
  expectedUid?: number,
): Promise<QqMailMessageMetadata> {
  const responseUid = Number(numericAttribute(fetchLine, 'UID'))
  const uid = Number.isSafeInteger(responseUid) && responseUid > 0
    ? responseUid
    : expectedUid
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 1) {
    throw new Error('QQ 邮箱 FETCH 响应缺少有效 UID，且无法从请求中安全关联。')
  }
  if (expectedUid !== undefined && uid !== expectedUid) {
    throw new Error('QQ 邮箱 FETCH 响应 UID 与请求不一致。')
  }
  const parsed = await PostalMime.parse(headers, { maxHeadersSize: 128 * 1024 })
  const sender = imapMailboxes(parsed.from)[0]
  const recipients = imapMailboxes(parsed.to)
  const cc = imapMailboxes(parsed.cc)
  const flags = attributeList(fetchLine, 'FLAGS')
  const contentType = parsed.headers.find(({ key }) => key === 'content-type')?.value || ''
  return {
    imapUid: uid,
    messageIdHeader: parsed.messageId || '',
    senderName: sender?.name || '',
    senderAddress: sender?.address || '',
    recipients: recipients.map(imapMailboxText),
    cc: cc.map(imapMailboxText),
    subject: (parsed.subject || '').trim().slice(0, 998),
    preview: '',
    internalDate: internalDate(fetchLine, parsed.date),
    sizeBytes: Number(numericAttribute(fetchLine, 'RFC822.SIZE')) || 0,
    flags,
    isRead: flags.some((flag) => flag.toLowerCase() === '\\seen'),
    isStarred: flags.some((flag) => flag.toLowerCase() === '\\flagged'),
    hasAttachments: /multipart\/mixed/i.test(contentType) || /"ATTACHMENT"/i.test(fetchLine),
  }
}

export async function parseQqMailMessage(
  data: Uint8Array,
  uid: string,
): Promise<{ message: QqMailMessageDetail; parsedAttachments: Awaited<ReturnType<typeof parseImapMessage>>['parsedAttachments'] }> {
  const parsed = await parseImapMessage(data, uid)
  return { ...parsed, message: parsed.message }
}
