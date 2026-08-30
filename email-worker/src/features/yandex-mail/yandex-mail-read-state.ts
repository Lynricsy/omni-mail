import type { YandexMailImapClient } from './yandex-mail-imap'
import { yandexMailSyncErrorCode } from './yandex-mail-sync'
import type { YandexMailAccount } from './yandex-mail-types'
import type { Env } from '../../app/types'

async function yandexMailClient(email: string, appPassword: string): Promise<YandexMailImapClient> {
  const { YandexMailImapClient } = await import('./yandex-mail-imap')
  return new YandexMailImapClient(email, appPassword)
}

export async function markRemoteYandexMailMessageRead(
  env: Env,
  account: YandexMailAccount,
  messageId: string,
  uid: number,
): Promise<boolean> {
  let client: YandexMailImapClient | null = null
  try {
    client = await yandexMailClient(account.email, account.appPassword)
    await client.open()
    await client.markSeen(uid)
    try {
      await env.DB.prepare(
        'UPDATE yandex_mail_messages SET is_read = 1, updated_at = ? WHERE id = ? AND account_id = ?',
      ).bind(Math.floor(Date.now() / 1000), messageId, account.id).run()
    } catch (error) {
      console.error('Unable to persist Yandex Mail read state', {
        accountId: account.id,
        messageId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }
    return true
  } catch (error) {
    console.error('Unable to mark Yandex Mail message as seen', {
      accountId: account.id,
      messageId,
      code: yandexMailSyncErrorCode(error),
      type: error instanceof Error ? error.name : typeof error,
    })
    return false
  } finally {
    try { await client?.close() } catch { /* cleanup must not affect the body */ }
  }
}
