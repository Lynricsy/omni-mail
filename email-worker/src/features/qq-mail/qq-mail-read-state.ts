import type { QqMailImapClient } from './qq-mail-imap'
import { qqMailSyncErrorCode } from './qq-mail-sync'
import type { QqMailAccount } from './qq-mail-types'
import type { Env } from '../../app/types'

async function qqMailClient(email: string, authorizationCode: string): Promise<QqMailImapClient> {
  const { QqMailImapClient } = await import('./qq-mail-imap')
  return new QqMailImapClient(email, authorizationCode)
}

export async function markRemoteQqMailMessageRead(
  env: Env,
  account: QqMailAccount,
  messageId: string,
  uid: number,
): Promise<boolean> {
  let client: QqMailImapClient | null = null
  try {
    client = await qqMailClient(account.email, account.authorizationCode)
    await client.open()
    await client.markSeen(uid)
    try {
      await env.DB.prepare(
        'UPDATE qq_mail_messages SET is_read = 1, updated_at = ? WHERE id = ? AND account_id = ?',
      ).bind(Math.floor(Date.now() / 1000), messageId, account.id).run()
    } catch (error) {
      console.error('Unable to persist QQ Mail read state', {
        accountId: account.id,
        messageId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }
    return true
  } catch (error) {
    console.error('Unable to mark QQ Mail message as seen', {
      accountId: account.id,
      messageId,
      code: qqMailSyncErrorCode(error),
      type: error instanceof Error ? error.name : typeof error,
    })
    return false
  } finally {
    try { await client?.close() } catch { /* cleanup must not affect the body */ }
  }
}
