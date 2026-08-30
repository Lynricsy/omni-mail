import type { Env } from '../../app/types'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import type { MicrosoftImapClient } from './microsoft-imap'
import { microsoftAccessToken } from './microsoft-token-manager'
import { MicrosoftStoreError } from './microsoft-store'
import type { MicrosoftAccount } from './microsoft-types'

async function client(
  account: MicrosoftAccount,
  credential: string,
): Promise<MicrosoftImapClient> {
  const { MicrosoftImapClient } = await import('./microsoft-imap')
  return new MicrosoftImapClient(account.normalizedEmail, account.authMode, credential)
}

export async function openMicrosoftClient(
  env: Env,
  account: MicrosoftAccount,
): Promise<MicrosoftImapClient> {
  if (account.authMode !== 'oauth2') {
    throw new MicrosoftStoreError(
      409, 'password_auth_removed', 'Microsoft 密码 LOGIN 已停用，请断开后使用 OAuth2 重新连接。',
    )
  }
  const credential = account.authMode === 'oauth2'
    ? await microsoftAccessToken(env, account)
    : account.password
  let remote = await client(account, credential)
  try {
    await remote.open()
    return remote
  } catch (error) {
    await remote.close()
    if (account.authMode !== 'oauth2'
      || !(error instanceof ImapConnectionError)
      || (error.status !== 400 && error.status !== 401)) {
      throw error
    }
    const refreshed = await microsoftAccessToken(env, account, { force: true })
    remote = await client(account, refreshed)
    try {
      await remote.open()
      return remote
    } catch (retryError) {
      await remote.close()
      throw retryError
    }
  }
}
