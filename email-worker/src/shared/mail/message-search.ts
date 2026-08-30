import { safeJsonArray } from '../http/api-helpers'
import type { Env, StoredBody } from '../../app/types'

const MAX_SEARCH_CONTENT_CHARS = 200_000

export type SearchContentInput = {
  subject: string
  sender: string
  recipients: string[]
  body: string
}

export function searchContent(input: SearchContentInput): string {
  return [
    input.subject,
    input.sender,
    input.recipients.join(' '),
    input.body,
  ].join(' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_SEARCH_CONTENT_CHARS)
}

export function searchLikePattern(query: string): string {
  const escaped = query.trim().toLowerCase()
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
  return `%${escaped}%`
}

export function messageSearchStatement(
  db: D1Database,
  messageId: string,
  input: SearchContentInput,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO message_search (message_id, content, indexed_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(message_id) DO UPDATE SET
       content = excluded.content, indexed_at = excluded.indexed_at`,
  ).bind(messageId, searchContent(input))
}

export async function indexStoredMessage(env: Env, messageId: string): Promise<void> {
  const message = await env.DB.prepare(
    `SELECT id, subject, sender_address, recipients_json, cc_json, body_key
       FROM messages WHERE id = ?`,
  ).bind(messageId).first<{
    id: string
    subject: string
    sender_address: string
    recipients_json: string
    cc_json: string
    body_key: string | null
  }>()
  if (!message?.body_key) return
  const object = await env.MAIL_BUCKET.get(message.body_key)
  if (!object) throw new Error('Search index message body is missing')
  const body = await object.json<StoredBody>()
  await messageSearchStatement(env.DB, message.id, {
    subject: message.subject,
    sender: message.sender_address,
    recipients: [
      ...safeJsonArray(message.recipients_json),
      ...safeJsonArray(message.cc_json),
    ],
    body: body.text || '',
  }).run()
}

export async function enqueueMissingMessageSearch(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT m.id
       FROM messages m
       LEFT JOIN message_search s ON s.message_id = m.id
      WHERE s.message_id IS NULL AND m.body_key IS NOT NULL
      ORDER BY m.updated_at DESC
      LIMIT 20`,
  ).all<{ id: string }>()
  for (const message of results) {
    await env.MAIL_QUEUE.send({ kind: 'index', messageId: message.id })
  }
}
