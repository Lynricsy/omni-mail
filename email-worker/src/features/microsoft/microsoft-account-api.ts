import type { Env, MicrosoftSyncJob, SessionUser } from '../../app/types'
import { writeAudit } from '../../shared/audit/audit'
import { sha256 } from '../auth/session/auth'
import { microsoftMailEnabled } from './microsoft-credentials'
import { microsoftImportAccount, MicrosoftInputError } from './microsoft-fields'
import type { MicrosoftImapClient } from './microsoft-imap'
import {
  maskedMicrosoftEmail,
  microsoftJsonBody,
  microsoftName,
  microsoftPrivateJson,
  microsoftResponseError,
} from './microsoft-api-shared'
import { openMicrosoftClient } from './microsoft-session'
import {
  MicrosoftAccountStore,
  MicrosoftStoreError,
  publicMicrosoftAccount,
  saveMicrosoftFolders,
} from './microsoft-store'
import { refreshMicrosoftFolders } from './microsoft-sync'
import { refreshMicrosoftToken } from './microsoft-token'
import type {
  MicrosoftAccount,
  MicrosoftFolder,
  ValidMicrosoftImport,
} from './microsoft-types'

const VALIDATION_WINDOW_SECONDS = 10 * 60
const MANUAL_SYNC_INTERVAL_SECONDS = 60
const MAX_IMPORT_ACCOUNTS = 25
export const MICROSOFT_VALIDATION_ATTEMPTS = MAX_IMPORT_ACCOUNTS * 2

async function microsoftClient(
  email: string,
  authMode: ValidMicrosoftImport['authMode'],
  credential: string,
): Promise<MicrosoftImapClient> {
  const { MicrosoftImapClient } = await import('./microsoft-imap')
  return new MicrosoftImapClient(email, authMode, credential)
}

export async function claimMicrosoftValidationAttempt(
  env: Env,
  userId: string,
  ip: string,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const identity = await sha256(`${userId}:${ip}`)
  const windowStartedAt = Math.floor(now / VALIDATION_WINDOW_SECONDS) * VALIDATION_WINDOW_SECONDS
  const result = await env.DB.prepare(
    `INSERT INTO microsoft_imap_validation_limits (
       identity_hash, window_started_at, attempt_count, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(identity_hash) DO UPDATE SET
       window_started_at = excluded.window_started_at,
       attempt_count = CASE
         WHEN microsoft_imap_validation_limits.window_started_at = excluded.window_started_at
           THEN microsoft_imap_validation_limits.attempt_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE microsoft_imap_validation_limits.window_started_at != excluded.window_started_at
        OR microsoft_imap_validation_limits.attempt_count < ?`,
  ).bind(identity, windowStartedAt, now, MICROSOFT_VALIDATION_ATTEMPTS).run()
  if (!result.meta.changes) {
    throw new MicrosoftStoreError(
      429,
      'validation_rate_limited',
      'Microsoft 凭据验证过于频繁，请稍后重试。',
    )
  }
}

async function validateImport(input: ValidMicrosoftImport): Promise<{
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: number | null
  folders: MicrosoftFolder[]
}> {
  let refreshToken = input.refreshToken || ''
  let accessToken = ''
  let accessTokenExpiresAt: number | null = null
  if (input.authMode === 'oauth2') {
    const token = await refreshMicrosoftToken({
      authority: input.authority,
      clientId: input.clientId,
      refreshToken,
    })
    refreshToken = token.refreshToken
    accessToken = token.accessToken
    accessTokenExpiresAt = Math.floor(Date.now() / 1000) + token.expiresIn
  }
  const client = await microsoftClient(
    input.email,
    input.authMode,
    input.authMode === 'oauth2' ? accessToken : input.password || '',
  )
  try {
    await client.open()
    const folders = await client.listFolders()
    const inbox = folders.find(({ path }) => path.toUpperCase() === 'INBOX')
    if (!inbox) throw new MicrosoftStoreError(502, 'inbox_unavailable', 'Microsoft INBOX 不可用。')
    await client.examineFolder(inbox.path)
    return { refreshToken, accessToken, accessTokenExpiresAt, folders }
  } finally {
    await client.close()
  }
}

async function enqueueSync(
  env: Env,
  accountId: string,
  reason: MicrosoftSyncJob['reason'],
): Promise<void> {
  await env.MAIL_QUEUE.send({ kind: 'microsoft-sync', accountId, reason })
}

export async function listMicrosoftAccounts(env: Env, user: SessionUser): Promise<Response> {
  try {
    const enabled = microsoftMailEnabled(env)
    const accounts = enabled ? await new MicrosoftAccountStore(env, user.id).list() : []
    return microsoftPrivateJson({ enabled, accounts })
  } catch (error) {
    return microsoftResponseError(error)
  }
}

function importError(error: unknown, authMode?: ValidMicrosoftImport['authMode']) {
  const response = microsoftResponseError(error, authMode)
  return response.json().then((body) => ({
    status: response.status === 409 ? 'duplicate' as const : 'error' as const,
    ...(body as Record<string, unknown>),
  }))
}

export async function importMicrosoftAccounts(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await microsoftJsonBody(request)
    const values = Array.isArray(body.accounts) ? body.accounts : []
    if (!values.length || values.length > MAX_IMPORT_ACCOUNTS) {
      throw new MicrosoftInputError(
        'invalid_batch',
        `每批需要提交 1–${MAX_IMPORT_ACCOUNTS} 个 Microsoft 账号。`,
      )
    }
    const store = new MicrosoftAccountStore(env, user.id)
    const existing = new Set((await store.list()).map(({ email }) => email))
    const seen = new Set<string>()
    const results: Array<Record<string, unknown>> = []
    for (let index = 0; index < values.length; index += 1) {
      let input: ValidMicrosoftImport | undefined
      try {
        if (!values[index] || Array.isArray(values[index]) || typeof values[index] !== 'object') {
          throw new MicrosoftInputError('invalid_account', '账号条目必须是 JSON 对象。')
        }
        input = microsoftImportAccount(values[index] as Record<string, unknown>)
        if (existing.has(input.email) || seen.has(input.email)) {
          results.push({ index, status: 'duplicate', code: 'duplicate' })
          continue
        }
        seen.add(input.email)
        await claimMicrosoftValidationAttempt(env, user.id, ip)
        const validated = await validateImport(input)
        const now = Math.floor(Date.now() / 1000)
        const account: MicrosoftAccount = {
          id: `microsoft_${crypto.randomUUID().replaceAll('-', '')}`,
          userId: user.id,
          name: input.name,
          providedEmail: input.email,
          normalizedEmail: input.email,
          authMode: input.authMode,
          clientId: input.clientId,
          authority: input.authority,
          refreshToken: validated.refreshToken,
          accessToken: validated.accessToken,
          accessTokenExpiresAt: validated.accessTokenExpiresAt,
          password: '',
          status: 'active',
          lastSyncedAt: null,
          nextSyncAt: 0,
          lastErrorCode: '',
          lastErrorAt: null,
          syncLeaseId: null,
          syncLeaseUntil: null,
          tokenLeaseId: null,
          tokenLeaseUntil: null,
          lastManualSyncAt: null,
          createdAt: now,
          updatedAt: now,
        }
        await store.insert(account, input.password || '')
        await saveMicrosoftFolders(env, account.id, validated.folders, now)
        await writeAudit(env, user.id, 'microsoft.account.connect', account.id, ip, {
          email: maskedMicrosoftEmail(account.normalizedEmail),
          authMode: account.authMode,
        })
        try { await enqueueSync(env, account.id, 'connect') } catch { /* cron will retry */ }
        existing.add(input.email)
        results.push({ index, status: 'accepted', account: publicMicrosoftAccount(account) })
      } catch (error) {
        results.push({ index, ...await importError(error, input?.authMode) })
      }
    }
    const allAccepted = results.every(({ status }) => status === 'accepted')
    return microsoftPrivateJson({ results }, allAccepted ? 201 : 207)
  } catch (error) {
    return microsoftResponseError(error)
  }
}

export async function renameMicrosoftAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const account = await new MicrosoftAccountStore(env, user.id).rename(
      accountId,
      microsoftName((await microsoftJsonBody(request)).name),
      Math.floor(Date.now() / 1000),
    )
    await writeAudit(env, user.id, 'microsoft.account.rename', accountId, ip)
    return microsoftPrivateJson({ account })
  } catch (error) {
    return microsoftResponseError(error)
  }
}

export async function updateMicrosoftCredential(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  let authMode: MicrosoftAccount['authMode'] | undefined
  try {
    const store = new MicrosoftAccountStore(env, user.id)
    const account = await store.get(accountId)
    authMode = account.authMode
    const input = microsoftImportAccount({
      ...await microsoftJsonBody(request),
      name: account.name,
      email: account.normalizedEmail,
      authMode,
    })
    await claimMicrosoftValidationAttempt(env, user.id, ip)
    const validated = await validateImport(input)
    const now = Math.floor(Date.now() / 1000)
    if (authMode === 'oauth2') {
      await store.replaceOAuthCredential({
        ...account,
        clientId: input.clientId,
        authority: input.authority,
        refreshToken: validated.refreshToken,
        accessToken: validated.accessToken,
        accessTokenExpiresAt: validated.accessTokenExpiresAt,
      }, now)
    } else {
      await store.replacePassword(accountId, input.password || '', now)
    }
    await saveMicrosoftFolders(env, accountId, validated.folders, now)
    await writeAudit(env, user.id, 'microsoft.account.credential_update', accountId, ip, {
      email: maskedMicrosoftEmail(account.normalizedEmail),
      authMode,
    })
    try { await enqueueSync(env, accountId, 'manual') } catch { /* cron will retry */ }
    return microsoftPrivateJson({ ok: true })
  } catch (error) {
    return microsoftResponseError(error, authMode)
  }
}

async function recordRemoteFailure(
  env: Env,
  account: MicrosoftAccount,
  error: unknown,
): Promise<void> {
  const response = microsoftResponseError(error, account.authMode)
  const body: { code?: string } = await response.clone().json<{ code?: string }>()
    .catch(() => ({}))
  const code = body.code || 'connection_failed'
  const status = [
    'invalid_grant', 'invalid_client', 'basic_auth_rejected',
  ].includes(code) ? 'credential_error'
    : ['imap_scope_missing', 'imap_access_rejected', 'xoauth2_unavailable'].includes(code)
      ? 'permission_error' : 'error'
  const now = Math.floor(Date.now() / 1000)
  try {
    await env.DB.prepare(
      `UPDATE microsoft_imap_accounts SET status = ?, last_error_code = ?,
              last_error_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(status, code, now, now, account.id).run()
  } catch { /* preserve remote error */ }
}

export async function verifyMicrosoftAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  let account: MicrosoftAccount | undefined
  let client: MicrosoftImapClient | undefined
  try {
    account = await new MicrosoftAccountStore(env, user.id).get(accountId)
    await claimMicrosoftValidationAttempt(env, user.id, ip)
    client = await openMicrosoftClient(env, account)
    const folders = await client.listFolders()
    const inbox = folders.find(({ path }) => path.toUpperCase() === 'INBOX')
    if (!inbox) throw new MicrosoftStoreError(502, 'inbox_unavailable', 'Microsoft INBOX 不可用。')
    await client.examineFolder(inbox.path)
    const now = Math.floor(Date.now() / 1000)
    await saveMicrosoftFolders(env, accountId, folders, now)
    await env.DB.prepare(
      `UPDATE microsoft_imap_accounts SET status = 'active', last_error_code = '',
              last_error_at = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(now, accountId, user.id).run()
    await writeAudit(env, user.id, 'microsoft.account.verify', accountId, ip, {
      email: maskedMicrosoftEmail(account.normalizedEmail),
    })
    return microsoftPrivateJson({ ok: true, validatedAt: now })
  } catch (error) {
    if (account) await recordRemoteFailure(env, account, error)
    return microsoftResponseError(error, account?.authMode)
  } finally {
    await client?.close()
  }
}

export async function deleteMicrosoftAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new MicrosoftAccountStore(env, user.id).remove(accountId)
    await writeAudit(env, user.id, 'microsoft.account.disconnect', accountId, ip, {
      email: maskedMicrosoftEmail(account.email),
    })
    return microsoftPrivateJson({ ok: true, remoteRevocationRequired: account.authMode === 'oauth2' })
  } catch (error) {
    return microsoftResponseError(error)
  }
}

export async function requestMicrosoftSync(
  env: Env,
  user: SessionUser,
  accountId: string,
  defer: (task: Promise<unknown>) => void,
): Promise<Response> {
  try {
    const account = await new MicrosoftAccountStore(env, user.id).publicAccount(accountId)
    if (!account) throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    if (account.status === 'credential_error' || account.status === 'permission_error') {
      throw new MicrosoftStoreError(409, 'account_requires_attention', '请先修复 Microsoft 凭据或权限。')
    }
    const now = Math.floor(Date.now() / 1000)
    const result = await env.DB.prepare(
      `UPDATE microsoft_imap_accounts SET last_manual_sync_at = ?, next_sync_at = 0,
              updated_at = ?
        WHERE id = ? AND user_id = ?
          AND (last_manual_sync_at IS NULL OR last_manual_sync_at <= ?)`,
    ).bind(now, now, accountId, user.id, now - MANUAL_SYNC_INTERVAL_SECONDS).run()
    if (!result.meta.changes) {
      throw new MicrosoftStoreError(429, 'manual_sync_rate_limited', '手动同步过于频繁，请稍后重试。')
    }
    defer(enqueueSync(env, accountId, 'manual').catch((error) => {
      console.error('Unable to enqueue Microsoft synchronization', {
        accountId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }))
    return microsoftPrivateJson({ queued: true }, 202)
  } catch (error) {
    return microsoftResponseError(error)
  }
}

export async function listMicrosoftFolders(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  let account: MicrosoftAccount | undefined
  try {
    const store = new MicrosoftAccountStore(env, user.id)
    account = await store.get(accountId)
    if (new URL(request.url).searchParams.get('refresh') === '1') {
      await claimMicrosoftValidationAttempt(env, user.id, ip)
      await refreshMicrosoftFolders(env, account)
    }
    return microsoftPrivateJson({ folders: await store.folders(accountId) })
  } catch (error) {
    if (account) await recordRemoteFailure(env, account, error)
    return microsoftResponseError(error, account?.authMode)
  }
}
