import { messageSummary } from './message-list-api'
import type { Env, MessageRow, SessionUser } from '../../app/types'

export function messageReferenceIds(
  ...values: Array<string | null | undefined>
): string[] {
  const ids = values.flatMap((value) => value?.match(/<[^<>\s]+>|[^\s]+/g) ?? [])
    .filter((value) => value.length <= 998)
  return [...new Set(ids)].slice(0, 20)
}

export async function listMessageThread(
  env: Env,
  user: SessionUser,
  selected: MessageRow,
) {
  const references = messageReferenceIds(
    selected.message_id,
    selected.in_reply_to,
    selected.references_header,
  )
  const conditions = ['m.id = ?']
  const bindings: string[] = [selected.id]
  for (const reference of references) {
    conditions.push(
      'm.message_id = ?',
      'm.in_reply_to = ?',
      `instr(
        ' ' || COALESCE(m.references_header, '') || ' ',
        ' ' || ? || ' '
      ) > 0`,
    )
    bindings.push(reference, reference, reference)
  }
  const { results } = await env.DB.prepare(
    `SELECT m.*
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE mb.user_id = ? AND m.mailbox_address = ?
        AND (${conditions.join(' OR ')})
      ORDER BY COALESCE(m.received_at, m.sent_at, m.created_at), m.id
      LIMIT 50`,
  ).bind(user.id, selected.mailbox_address, ...bindings).all<MessageRow>()
  return results.map(messageSummary)
}
