import type { NaverMailImapClient } from './naver-mail-imap'
import { naverMailSyncErrorCode } from './naver-mail-sync'
import type { NaverMailAccount } from './naver-mail-types'
import type { Env } from '../../app/types'

async function naverMailClient(email: string, appPassword: string): Promise<NaverMailImapClient> {
  const { NaverMailImapClient } = await import('./naver-mail-imap')
  return new NaverMailImapClient(email, appPassword)
}

export async function markRemoteNaverMailMessageRead(
  env: Env,
  account: NaverMailAccount,
  messageId: string,
  uid: number,
): Promise<boolean> {
  let client: NaverMailImapClient | null = null
  try {
    client = await naverMailClient(account.email, account.appPassword)
    await client.open()
    await client.markSeen(uid)
    try {
      await env.DB.prepare(
        'UPDATE naver_mail_messages SET is_read = 1, updated_at = ? WHERE id = ? AND account_id = ?',
      ).bind(Math.floor(Date.now() / 1000), messageId, account.id).run()
    } catch (error) {
      console.error('Unable to persist NAVER Mail read state', {
        accountId: account.id,
        messageId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }
    return true
  } catch (error) {
    console.error('Unable to mark NAVER Mail message as seen', {
      accountId: account.id,
      messageId,
      code: naverMailSyncErrorCode(error),
      type: error instanceof Error ? error.name : typeof error,
    })
    return false
  } finally {
    try { await client?.close() } catch { /* cleanup must not affect the body */ }
  }
}
