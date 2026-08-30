import PostalMime, { type Address, type Attachment } from 'postal-mime'
import { normalizeAttachmentFilename } from '../../shared/mail/attachment-policy'
import type {
  MicrosoftAttachment,
  MicrosoftMessageDetail,
  MicrosoftMessageMetadata,
} from './microsoft-types'

const MAX_BODY_CHARS = 200_000
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024

function mailboxes(addresses: Address[] | Address | undefined): Array<{ name: string; address: string }> {
  const list = addresses ? (Array.isArray(addresses) ? addresses : [addresses]) : []
  const result: Array<{ name: string; address: string }> = []
  for (const address of list) {
    if (address.group) result.push(...address.group)
    else if (address.address) result.push({ name: address.name, address: address.address })
  }
  return result
}

function mailboxText(address: { name: string; address: string } | undefined): string {
  if (!address) return ''
  return address.name ? `${address.name} <${address.address}>` : address.address
}

function cleanText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n(?:[^\S\n]*\n)+/g, '\n\n')
    .trim()
}

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
  return line.match(new RegExp(`\\b${name} (\\d+)\\b`, 'i'))?.[1] || ''
}

function timestamp(value: string | undefined): number | null {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}

export async function parseMicrosoftMetadata(
  fetchLine: string,
  headers: Uint8Array,
): Promise<MicrosoftMessageMetadata> {
  const uid = Number(numericAttribute(fetchLine, 'UID'))
  if (!Number.isSafeInteger(uid) || uid < 1) {
    throw new Error('Microsoft FETCH 响应缺少有效 UID。')
  }
  const parsed = await PostalMime.parse(headers, { maxHeadersSize: 128 * 1024 })
  const sender = mailboxes(parsed.from)[0]
  const recipients = mailboxes(parsed.to)
  const cc = mailboxes(parsed.cc)
  const flags = attributeList(fetchLine, 'FLAGS')
  const internal = fetchLine.match(/\bINTERNALDATE "([^"]+)"/i)?.[1]
  const receivedAt = timestamp(internal) ?? timestamp(parsed.date) ?? 0
  const sentAt = timestamp(parsed.date)
  const contentType = parsed.headers.find(({ key }) => key === 'content-type')?.value || ''
  return {
    uid,
    internetMessageId: parsed.messageId || '',
    senderName: sender?.name || '',
    senderAddress: sender?.address || '',
    recipients: recipients.map(mailboxText),
    cc: cc.map(mailboxText),
    subject: (parsed.subject || '').trim().slice(0, 998),
    preview: '',
    receivedAt,
    sentAt,
    sizeBytes: Number(numericAttribute(fetchLine, 'RFC822.SIZE')) || 0,
    flags,
    isRead: flags.some((flag) => flag.toLowerCase() === '\\seen'),
    isStarred: flags.some((flag) => flag.toLowerCase() === '\\flagged'),
    hasAttachments: /multipart\/mixed/i.test(contentType) || /"ATTACHMENT"/i.test(fetchLine),
  }
}

function attachmentBytes(attachment: Attachment): Uint8Array {
  if (typeof attachment.content === 'string') return new TextEncoder().encode(attachment.content)
  return attachment.content instanceof Uint8Array
    ? attachment.content : new Uint8Array(attachment.content)
}

function base64(bytes: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 16_384))
  }
  return btoa(result)
}

function inlineImages(html: string, attachments: Attachment[]): string {
  let total = 0
  let result = html
  for (const attachment of attachments) {
    const contentId = attachment.contentId?.replace(/^<|>$/g, '')
    if (!contentId || !/^image\/(?:png|jpeg|gif|webp)$/i.test(attachment.mimeType)) continue
    const bytes = attachmentBytes(attachment)
    total += bytes.byteLength
    if (total > MAX_INLINE_IMAGE_BYTES) break
    const escaped = contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`cid:${escaped}`, 'gi'),
      `data:${attachment.mimeType};base64,${base64(bytes)}`,
    )
  }
  return result
}

export async function parseMicrosoftMessage(
  data: Uint8Array,
  uid: string,
): Promise<{ message: MicrosoftMessageDetail; parsedAttachments: Attachment[] }> {
  const parsed = await PostalMime.parse(data, {
    attachmentEncoding: 'arraybuffer',
    maxHeadersSize: 256 * 1024,
    maxNestingDepth: 20,
  })
  const sender = mailboxes(parsed.from)[0]
  const recipients = mailboxes(parsed.to).map(mailboxText)
  const cc = mailboxes(parsed.cc).map(mailboxText)
  const plain = cleanText(parsed.text?.trim() || parsed.html || '').slice(0, MAX_BODY_CHARS)
  const attachments: MicrosoftAttachment[] = parsed.attachments.map((attachment, index) => ({
    partId: String(index),
    filename: normalizeAttachmentFilename(attachment.filename || `attachment-${index + 1}`),
    contentType: attachment.mimeType || 'application/octet-stream',
    size: attachmentBytes(attachment).byteLength,
    contentId: attachment.contentId?.replace(/^<|>$/g, '') || null,
    disposition: attachment.disposition || 'attachment',
  }))
  return {
    message: {
      id: uid,
      from: mailboxText(sender),
      to: recipients.join(', '),
      cc: cc.join(', '),
      subject: (parsed.subject || '').trim(),
      date: parsed.date || '',
      body: plain,
      html: parsed.html ? inlineImages(parsed.html, parsed.attachments) : '',
      attachments,
    },
    parsedAttachments: parsed.attachments,
  }
}

export function microsoftAttachmentContent(
  attachments: Attachment[],
  partId: string,
): { metadata: MicrosoftAttachment; data: Uint8Array } | null {
  if (!/^\d+$/.test(partId)) return null
  const index = Number(partId)
  const attachment = attachments[index]
  if (!attachment) return null
  const data = attachmentBytes(attachment)
  return {
    metadata: {
      partId,
      filename: normalizeAttachmentFilename(attachment.filename || `attachment-${index + 1}`),
      contentType: attachment.mimeType || 'application/octet-stream',
      size: data.byteLength,
      contentId: attachment.contentId?.replace(/^<|>$/g, '') || null,
      disposition: attachment.disposition || 'attachment',
    },
    data,
  }
}
