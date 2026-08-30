import { writeAudit } from '../../shared/audit/audit'
import { yandexMailImapEnabled } from './yandex-mail-credentials'
import {
  claimYandexMailValidationAttempt,
  enqueueYandexMailSync,
  maskedYandexMailEmail,
  privateYandexMailJson,
  yandexMailAppPasswordField,
  yandexMailEmailField,
  yandexMailJsonBody,
  yandexMailNameField,
  yandexMailResponseError,
  recordYandexMailRemoteFailure,
  requireYandexMailEnabled,
  validateYandexMailCredentials,
} from './yandex-mail-api-shared'
import { YandexMailAccountStore, YandexMailStoreError, publicYandexMailAccount } from './yandex-mail-store'
import type { YandexMailAccount } from './yandex-mail-types'
import type { Env, SessionUser } from '../../app/types'

const MANUAL_SYNC_INTERVAL_SECONDS = 60

export async function listYandexMailAccounts(env: Env, user: SessionUser): Promise<Response> {
  try {
    const enabled = yandexMailImapEnabled(env)
    const accounts = enabled ? await new YandexMailAccountStore(env, user.id).list() : []
    return privateYandexMailJson({ enabled, accounts })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function createYandexMailAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const body = await yandexMailJsonBody(request)
    const name = yandexMailNameField(body.name)
    const email = yandexMailEmailField(body.email)
    const appPassword = yandexMailAppPasswordField(body.appPassword)
    const store = new YandexMailAccountStore(env, user.id)
    const existing = await store.list()
    if (existing.some((account) => account.email === email)) {
      throw new YandexMailStoreError(409, '这个 Yandex 邮箱账号已经连接。')
    }
    await claimYandexMailValidationAttempt(env, user.id, ip)
    await validateYandexMailCredentials(email, appPassword)
    const now = Math.floor(Date.now() / 1000)
    const account: YandexMailAccount = {
      id: `yandex_mail_${crypto.randomUUID().replaceAll('-', '')}`,
      userId: user.id,
      name,
      email,
      yandexLogin: email.slice(0, -'@yandex.com'.length),
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
    await writeAudit(env, user.id, 'yandex_mail.account.connect', account.id, ip, {
      email: maskedYandexMailEmail(email),
    })
    try { await enqueueYandexMailSync(env, account.id, 'connect') } catch { /* cron will retry */ }
    return privateYandexMailJson({ account: publicYandexMailAccount(account) }, 201)
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function renameYandexMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const store = new YandexMailAccountStore(env, user.id)
    const account = await store.rename(
      accountId,
      yandexMailNameField((await yandexMailJsonBody(request)).name),
      Math.floor(Date.now() / 1000),
    )
    await writeAudit(env, user.id, 'yandex_mail.account.rename', accountId, ip)
    return privateYandexMailJson({ account })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function updateYandexMailAppPassword(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const code = yandexMailAppPasswordField(
      (await yandexMailJsonBody(request)).appPassword,
    )
    const store = new YandexMailAccountStore(env, user.id)
    const account = await store.get(accountId)
    await claimYandexMailValidationAttempt(env, user.id, ip)
    await validateYandexMailCredentials(account.email, code)
    const now = Math.floor(Date.now() / 1000)
    await store.replaceAppPassword(accountId, code, now)
    await writeAudit(env, user.id, 'yandex_mail.account.credential_update', accountId, ip, {
      email: maskedYandexMailEmail(account.email),
    })
    try { await enqueueYandexMailSync(env, accountId, 'manual') } catch { /* cron will retry */ }
    return privateYandexMailJson({ account: {
      ...publicYandexMailAccount(account),
      status: 'active',
      lastErrorCode: '',
      lastErrorAt: null,
      nextSyncAt: 0,
    } })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function verifyYandexMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const account = await new YandexMailAccountStore(env, user.id).get(accountId)
    await claimYandexMailValidationAttempt(env, user.id, ip)
    try {
      await validateYandexMailCredentials(account.email, account.appPassword)
    } catch (error) {
      await recordYandexMailRemoteFailure(env, accountId, error)
      throw error
    }
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `UPDATE yandex_mail_accounts SET status = 'active', last_error_code = '',
              last_error_at = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(now, accountId, user.id).run()
    await writeAudit(env, user.id, 'yandex_mail.account.verify', accountId, ip, {
      email: maskedYandexMailEmail(account.email),
    })
    return privateYandexMailJson({ ok: true, validatedAt: now })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function deleteYandexMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new YandexMailAccountStore(env, user.id).remove(accountId)
    await writeAudit(env, user.id, 'yandex_mail.account.disconnect', accountId, ip, {
      email: maskedYandexMailEmail(account.email),
    })
    return privateYandexMailJson({ ok: true, remoteRevocationRequired: true })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function requestYandexMailSync(
  env: Env,
  user: SessionUser,
  accountId: string,
  defer: (task: Promise<unknown>) => void,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const store = new YandexMailAccountStore(env, user.id)
    const account = await store.publicAccount(accountId)
    if (!account) throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
    if (account.status === 'credential_error') {
      throw new YandexMailStoreError(409, '请先更新失效的 Yandex 邮箱应用专用密码。')
    }
    const now = Math.floor(Date.now() / 1000)
    const result = await env.DB.prepare(
      `UPDATE yandex_mail_accounts SET last_manual_sync_at = ?, next_sync_at = 0,
              updated_at = ?
        WHERE id = ? AND user_id = ?
          AND (last_manual_sync_at IS NULL OR last_manual_sync_at <= ?)`,
    ).bind(now, now, accountId, user.id, now - MANUAL_SYNC_INTERVAL_SECONDS).run()
    if (!result.meta.changes) {
      throw new YandexMailStoreError(429, '手动同步过于频繁，请稍后重试。')
    }
    defer(enqueueYandexMailSync(env, accountId, 'manual').catch((error) => {
      console.error('Unable to enqueue manual Yandex Mail synchronization', {
        accountId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }))
    return privateYandexMailJson({ queued: true }, 202)
  } catch (error) {
    return yandexMailResponseError(error)
  }
}
