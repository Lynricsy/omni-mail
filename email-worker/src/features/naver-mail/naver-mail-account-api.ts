import { writeAudit } from '../../shared/audit/audit'
import { naverMailImapEnabled } from './naver-mail-credentials'
import {
  claimNaverMailValidationAttempt,
  enqueueNaverMailSync,
  maskedNaverMailEmail,
  privateNaverMailJson,
  naverMailAppPasswordField,
  naverMailEmailField,
  naverMailJsonBody,
  naverMailNameField,
  naverMailResponseError,
  recordNaverMailRemoteFailure,
  requireNaverMailEnabled,
  validateNaverMailCredentials,
} from './naver-mail-api-shared'
import { NaverMailAccountStore, NaverMailStoreError, publicNaverMailAccount } from './naver-mail-store'
import type { NaverMailAccount } from './naver-mail-types'
import type { Env, SessionUser } from '../../app/types'

const MANUAL_SYNC_INTERVAL_SECONDS = 60

export async function listNaverMailAccounts(env: Env, user: SessionUser): Promise<Response> {
  try {
    const enabled = naverMailImapEnabled(env)
    const accounts = enabled ? await new NaverMailAccountStore(env, user.id).list() : []
    return privateNaverMailJson({ enabled, accounts })
  } catch (error) {
    return naverMailResponseError(error)
  }
}

export async function createNaverMailAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    requireNaverMailEnabled(env)
    const body = await naverMailJsonBody(request)
    const name = naverMailNameField(body.name)
    const email = naverMailEmailField(body.email)
    const appPassword = naverMailAppPasswordField(body.appPassword)
    const store = new NaverMailAccountStore(env, user.id)
    const existing = await store.list()
    if (existing.some((account) => account.email === email)) {
      throw new NaverMailStoreError(409, '这个 NAVER 邮箱账号已经连接。')
    }
    await claimNaverMailValidationAttempt(env, user.id, ip)
    await validateNaverMailCredentials(email, appPassword)
    const now = Math.floor(Date.now() / 1000)
    const account: NaverMailAccount = {
      id: `naver_mail_${crypto.randomUUID().replaceAll('-', '')}`,
      userId: user.id,
      name,
      email,
      naverId: email.slice(0, -'@naver.com'.length),
      appPassword,
      status: 'active',
      uidValidity: null,
      uidNext: null,
      lastSeenUid: 0,
      lastSyncedAt: null,
      nextSyncAt: 0,
      lastErrorCode: '',
      lastErrorAt: null,
      syncLeaseId: null,
      syncLeaseUntil: null,
      lastManualSyncAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await store.insert(account)
    await writeAudit(env, user.id, 'naver_mail.account.connect', account.id, ip, {
      email: maskedNaverMailEmail(email),
    })
    try { await enqueueNaverMailSync(env, account.id, 'connect') } catch { /* cron will retry */ }
    return privateNaverMailJson({ account: publicNaverMailAccount(account) }, 201)
  } catch (error) {
    return naverMailResponseError(error)
  }
}

export async function renameNaverMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const store = new NaverMailAccountStore(env, user.id)
    const account = await store.rename(
      accountId,
      naverMailNameField((await naverMailJsonBody(request)).name),
      Math.floor(Date.now() / 1000),
    )
    await writeAudit(env, user.id, 'naver_mail.account.rename', accountId, ip)
    return privateNaverMailJson({ account })
  } catch (error) {
    return naverMailResponseError(error)
  }
}

export async function updateNaverMailAppPassword(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    requireNaverMailEnabled(env)
    const code = naverMailAppPasswordField(
      (await naverMailJsonBody(request)).appPassword,
    )
    const store = new NaverMailAccountStore(env, user.id)
    const account = await store.get(accountId)
    await claimNaverMailValidationAttempt(env, user.id, ip)
    await validateNaverMailCredentials(account.email, code)
    const now = Math.floor(Date.now() / 1000)
    await store.replaceAppPassword(accountId, code, now)
    await writeAudit(env, user.id, 'naver_mail.account.credential_update', accountId, ip, {
      email: maskedNaverMailEmail(account.email),
    })
    try { await enqueueNaverMailSync(env, accountId, 'manual') } catch { /* cron will retry */ }
    return privateNaverMailJson({ account: {
      ...publicNaverMailAccount(account),
      status: 'active',
      lastErrorCode: '',
      lastErrorAt: null,
      nextSyncAt: 0,
    } })
  } catch (error) {
    return naverMailResponseError(error)
  }
}

export async function verifyNaverMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    requireNaverMailEnabled(env)
    const account = await new NaverMailAccountStore(env, user.id).get(accountId)
    await claimNaverMailValidationAttempt(env, user.id, ip)
    try {
      await validateNaverMailCredentials(account.email, account.appPassword)
    } catch (error) {
      await recordNaverMailRemoteFailure(env, accountId, error)
      throw error
    }
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `UPDATE naver_mail_accounts SET status = 'active', last_error_code = '',
              last_error_at = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(now, accountId, user.id).run()
    await writeAudit(env, user.id, 'naver_mail.account.verify', accountId, ip, {
      email: maskedNaverMailEmail(account.email),
    })
    return privateNaverMailJson({ ok: true, validatedAt: now })
  } catch (error) {
    return naverMailResponseError(error)
  }
}

export async function deleteNaverMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new NaverMailAccountStore(env, user.id).remove(accountId)
    await writeAudit(env, user.id, 'naver_mail.account.disconnect', accountId, ip, {
      email: maskedNaverMailEmail(account.email),
    })
    return privateNaverMailJson({ ok: true, remoteRevocationRequired: true })
  } catch (error) {
    return naverMailResponseError(error)
  }
}

export async function requestNaverMailSync(
  env: Env,
  user: SessionUser,
  accountId: string,
  defer: (task: Promise<unknown>) => void,
): Promise<Response> {
  try {
    requireNaverMailEnabled(env)
    const store = new NaverMailAccountStore(env, user.id)
    const account = await store.publicAccount(accountId)
    if (!account) throw new NaverMailStoreError(404, 'NAVER 邮箱账号不存在。')
    if (account.status === 'credential_error') {
      throw new NaverMailStoreError(409, '请先更新失效的 NAVER 邮箱应用专用密码。')
    }
    const now = Math.floor(Date.now() / 1000)
    const result = await env.DB.prepare(
      `UPDATE naver_mail_accounts SET last_manual_sync_at = ?, next_sync_at = 0,
              updated_at = ?
        WHERE id = ? AND user_id = ?
          AND (last_manual_sync_at IS NULL OR last_manual_sync_at <= ?)`,
    ).bind(now, now, accountId, user.id, now - MANUAL_SYNC_INTERVAL_SECONDS).run()
    if (!result.meta.changes) {
      throw new NaverMailStoreError(429, '手动同步过于频繁，请稍后重试。')
    }
    defer(enqueueNaverMailSync(env, accountId, 'manual').catch((error) => {
      console.error('Unable to enqueue manual NAVER Mail synchronization', {
        accountId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }))
    return privateNaverMailJson({ queued: true }, 202)
  } catch (error) {
    return naverMailResponseError(error)
  }
}
