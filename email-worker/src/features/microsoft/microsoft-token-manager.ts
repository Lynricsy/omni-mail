import type { Env } from '../../app/types'
import {
  encryptMicrosoftCredential,
  microsoftCredentialContext,
} from './microsoft-credentials'
import { MicrosoftStoreError, microsoftAccountForSync } from './microsoft-store'
import { refreshMicrosoftToken } from './microsoft-token'
import type { MicrosoftAccount } from './microsoft-types'

const TOKEN_LEASE_SECONDS = 60
const TOKEN_EXPIRY_SKEW_SECONDS = 60

function cached(account: MicrosoftAccount, now: number): string | null {
  return account.accessToken
    && account.accessTokenExpiresAt
    && account.accessTokenExpiresAt > now + TOKEN_EXPIRY_SKEW_SECONDS
    ? account.accessToken : null
}

export async function microsoftAccessToken(
  env: Env,
  account: MicrosoftAccount,
  options: { force?: boolean; now?: number; fetcher?: typeof fetch } = {},
): Promise<string> {
  if (account.authMode !== 'oauth2') {
    throw new MicrosoftStoreError(400, 'invalid_auth_mode', 'Microsoft 账号不是 OAuth2 模式。')
  }
  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (!options.force) {
    const available = cached(account, now)
    if (available) return available
  }

  const leaseId = crypto.randomUUID()
  const claim = await env.DB.prepare(
    `UPDATE microsoft_imap_accounts
        SET token_lease_id = ?, token_lease_until = ?, updated_at = ?
      WHERE id = ? AND auth_mode = 'oauth2'
        AND (token_lease_until IS NULL OR token_lease_until <= ?)`,
  ).bind(leaseId, now + TOKEN_LEASE_SECONDS, now, account.id, now).run()
  if (!claim.meta.changes) {
    const latest = await microsoftAccountForSync(env, account.id)
    const available = latest && !options.force ? cached(latest, now) : null
    if (available) return available
    throw new MicrosoftStoreError(409, 'token_refresh_busy', 'Microsoft token 正在刷新，请稍后重试。')
  }

  try {
    const result = await refreshMicrosoftToken({
      authority: account.authority,
      clientId: account.clientId,
      refreshToken: account.refreshToken,
      fetcher: options.fetcher,
    })
    const refreshCipher = await encryptMicrosoftCredential(
      env,
      result.refreshToken,
      microsoftCredentialContext(account.userId, account.id, 'refresh-token'),
    )
    const accessCipher = await encryptMicrosoftCredential(
      env,
      result.accessToken,
      microsoftCredentialContext(account.userId, account.id, 'access-token'),
    )
    const expiresAt = now + result.expiresIn
    const saved = await env.DB.prepare(
      `UPDATE microsoft_imap_accounts
          SET refresh_token_cipher = ?, access_token_cipher = ?,
              access_token_expires_at = ?, token_lease_id = NULL,
              token_lease_until = NULL, updated_at = ?
        WHERE id = ? AND token_lease_id = ?`,
    ).bind(refreshCipher, accessCipher, expiresAt, now, account.id, leaseId).run()
    if (!saved.meta.changes) {
      throw new MicrosoftStoreError(409, 'token_refresh_lost', 'Microsoft token 刷新租约已失效。')
    }
    account.refreshToken = result.refreshToken
    account.accessToken = result.accessToken
    account.accessTokenExpiresAt = expiresAt
    return result.accessToken
  } catch (error) {
    try {
      await env.DB.prepare(
        `UPDATE microsoft_imap_accounts
            SET token_lease_id = NULL, token_lease_until = NULL
          WHERE id = ? AND token_lease_id = ?`,
      ).bind(account.id, leaseId).run()
    } catch { /* preserve token error */ }
    throw error
  }
}
