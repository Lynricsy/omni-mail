import type { GmailImapClient } from './gmail-imap'
import { gmailSyncErrorCode } from './gmail-sync'
import type { GmailAccount } from './gmail-types'
import type { Env } from '../../app/types'

async function gmailClient(email: string, password: string): Promise<GmailImapClient> {
  const { GmailImapClient } = await import('./gmail-imap')
  return new GmailImapClient(email, password)
}

export async function markRemoteMessageRead(
  env: Env,
  account: GmailAccount,
  messageId: string,
  uid: number,
): Promise<boolean> {
  let client: GmailImapClient | null = null
  try {
    client = await gmailClient(account.email, account.appPassword)
    await client.open()
    await client.markSeen(uid)
    try {
      await env.DB.prepare(
        'UPDATE gmail_imap_messages SET is_read = 1, updated_at = ? WHERE id = ? AND account_id = ?',
      ).bind(Math.floor(Date.now() / 1000), messageId, account.id).run()
    } catch (error) {
      console.error('Unable to persist Gmail read state', {
        accountId: account.id,
        messageId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }
    return true
  } catch (error) {
    console.error('Unable to mark Gmail message as seen', {
      accountId: account.id,
      messageId,
      code: gmailSyncErrorCode(error),
      type: error instanceof Error ? error.name : typeof error,
    })
    return false
  } finally {
    try { await client?.close() } catch { /* read-state cleanup must not affect the body */ }
  }
}
