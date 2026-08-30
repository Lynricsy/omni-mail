import PostalMime, { type Address, type Attachment } from 'postal-mime'
import { normalizeAttachmentFilename } from './attachment-policy'

const MAX_BODY_CHARS = 200_000
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024

export interface ParsedImapAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface ParsedImapMessage {
  id: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  body: string
  html: string
  attachments: ParsedImapAttachment[]
}

export function imapMailboxes(
  addresses: Address[] | Address | undefined,
): Array<{ name: string; address: string }> {
  const list = addresses ? (Array.isArray(addresses) ? addresses : [addresses]) : []
  const result: Array<{ name: string; address: string }> = []
  for (const address of list) {
    if (address.group) result.push(...address.group)
    else if (address.address) result.push({ name: address.name, address: address.address })
  }
  return result
}

export function imapMailboxText(address: { name: string; address: string } | undefined): string {
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

function attachmentBytes(attachment: Attachment): Uint8Array {
  if (typeof attachment.content === 'string') return new TextEncoder().encode(attachment.content)
  return attachment.content instanceof Uint8Array
    ? attachment.content
    : new Uint8Array(attachment.content)
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

function publicAttachment(attachment: Attachment, index: number): ParsedImapAttachment {
  const data = attachmentBytes(attachment)
  return {
    partId: String(index),
    filename: normalizeAttachmentFilename(attachment.filename || `attachment-${index + 1}`),
    contentType: attachment.mimeType || 'application/octet-stream',
    size: data.byteLength,
    contentId: attachment.contentId?.replace(/^<|>$/g, '') || null,
    disposition: attachment.disposition || 'attachment',
  }
}

export async function parseImapMessage(
  data: Uint8Array,
  uid: string,
): Promise<{ message: ParsedImapMessage; parsedAttachments: Attachment[] }> {
  const parsed = await PostalMime.parse(data, {
    attachmentEncoding: 'arraybuffer',
    maxHeadersSize: 256 * 1024,
    maxNestingDepth: 20,
  })
  const sender = imapMailboxes(parsed.from)[0]
  const recipients = imapMailboxes(parsed.to).map(imapMailboxText)
  const cc = imapMailboxes(parsed.cc).map(imapMailboxText)
  const plain = cleanText(parsed.text?.trim() || parsed.html || '').slice(0, MAX_BODY_CHARS)
  return {
    message: {
      id: uid,
      from: imapMailboxText(sender),
      to: recipients.join(', '),
      cc: cc.join(', '),
      subject: (parsed.subject || '').trim(),
      date: parsed.date || '',
      body: plain,
      html: parsed.html ? inlineImages(parsed.html, parsed.attachments) : '',
      attachments: parsed.attachments.map(publicAttachment),
    },
    parsedAttachments: parsed.attachments,
  }
}

export function imapAttachmentContent(
  attachments: Attachment[],
  partId: string,
): { metadata: ParsedImapAttachment; data: Uint8Array } | null {
  if (!/^\d+$/.test(partId)) return null
  const index = Number(partId)
  const attachment = attachments[index]
  if (!attachment) return null
  return { metadata: publicAttachment(attachment, index), data: attachmentBytes(attachment) }
}
