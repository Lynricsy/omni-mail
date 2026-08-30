import PostalMime from 'postal-mime'
import type { ICloudMessage } from './icloud-types'

function mailboxText(address: { name: string; address?: string } | undefined): string {
  if (!address) return ''
  return address.name && address.address
    ? `${address.name} <${address.address}>`
    : address.address || address.name
}

function mailboxList(addresses: Array<{ name: string; address?: string }> | undefined): string {
  return (addresses || []).map(mailboxText).filter(Boolean).join(', ')
}

function cleanBody(value: string): string {
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

export async function parseICloudMessage(
  data: Uint8Array,
  uid: string,
  includeHtml = false,
  isRead?: boolean,
): Promise<ICloudMessage> {
  const parsed = await PostalMime.parse(data)
  const body = cleanBody(parsed.text?.trim() || parsed.html || '')
  const preview = body.replace(/\s+/g, ' ').trim()
  const date = parsed.date ? new Date(parsed.date) : undefined
  return {
    id: uid,
    from: mailboxText(parsed.from as { name: string; address?: string } | undefined),
    to: mailboxList(parsed.to as Array<{ name: string; address?: string }> | undefined),
    subject: parsed.subject?.trim() || '',
    date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : parsed.date || '',
    preview: preview.length > 400 ? `${preview.slice(0, 400)}…` : preview,
    body: body.length > 12_000 ? `${body.slice(0, 12_000)}…` : body,
    html: includeHtml && parsed.html ? parsed.html : '',
    ...(typeof isRead === 'boolean' ? { isRead } : {}),
  }
}
