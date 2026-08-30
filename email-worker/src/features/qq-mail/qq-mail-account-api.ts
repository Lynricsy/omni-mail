import { writeAudit } from '../../shared/audit/audit'
import { requestedMailSyncLimit } from '../../platform/imap/sync-limit'
import { qqMailImapEnabled } from './qq-mail-credentials'
import {
  claimQqMailValidationAttempt,
  enqueueQqMailSync,
  maskedQqMailEmail,
  privateQqMailJson,
  qqMailAuthorizationCodeField,
  qqMailEmailField,
  qqMailJsonBody,
  qqMailNameField,
  qqMailResponseError,
  recordQqMailRemoteFailure,
  validateQqMailCredentials,
} from './qq-mail-api-shared'
import { QqMailAccountStore, QqMailStoreError, publicQqMailAccount } from './qq-mail-store'
import type { QqMailAccount } from './qq-mail-types'
import type { Env, SessionUser } from '../../app/types'

const MANUAL_SYNC_INTERVAL_SECONDS = 60

export async function listQqMailAccounts(env: Env, user: SessionUser): Promise<Response> {
  try {
    const enabled = qqMailImapEnabled(env)
    const accounts = enabled ? await new QqMailAccountStore(env, user.id).list() : []
    return privateQqMailJson({ enabled, accounts })
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function createQqMailAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await qqMailJsonBody(request)
    const name = qqMailNameField(body.name)
    const email = qqMailEmailField(body.email)
    const authorizationCode = qqMailAuthorizationCodeField(body.authorizationCode)
    const store = new QqMailAccountStore(env, user.id)
    const existing = await store.list()
    if (existing.some((account) => account.email === email)) {
      throw new QqMailStoreError(409, '这个 QQ 邮箱账号已经连接。')
    }
    await claimQqMailValidationAttempt(env, user.id, ip)
    await validateQqMailCredentials(email, authorizationCode)
    const now = Math.floor(Date.now() / 1000)
    const account: QqMailAccount = {
      id: `qq_mail_${crypto.randomUUID().replaceAll('-', '')}`,
      userId: user.id,
      name,
      email,
      authorizationCode,
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
      identities: [{
        id: crypto.randomUUID(),
        accountId: '',
        name,
        email,
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
      }],
    }
    account.identities[0].accountId = account.id
    await store.insert(account)
    await writeAudit(env, user.id, 'qq_mail.account.connect', account.id, ip, {
      accountName: name,
      email: maskedQqMailEmail(email),
    })
    try { await enqueueQqMailSync(env, account.id, 'connect') } catch { /* cron will retry */ }
    return privateQqMailJson({ account: publicQqMailAccount(account) }, 201)
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function renameQqMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const store = new QqMailAccountStore(env, user.id)
    const previous = await store.publicAccount(accountId)
    const account = await store.rename(
      accountId,
      qqMailNameField((await qqMailJsonBody(request)).name),
      Math.floor(Date.now() / 1000),
    )
    await writeAudit(env, user.id, 'qq_mail.account.rename', accountId, ip, {
      accountName: account.name,
      previousName: previous?.name,
      email: maskedQqMailEmail(account.email),
    })
    return privateQqMailJson({ account })
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function updateQqMailAuthorizationCode(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const code = qqMailAuthorizationCodeField(
      (await qqMailJsonBody(request)).authorizationCode,
    )
    const store = new QqMailAccountStore(env, user.id)
    const account = await store.get(accountId)
    await claimQqMailValidationAttempt(env, user.id, ip)
    await validateQqMailCredentials(account.email, code)
    const now = Math.floor(Date.now() / 1000)
    await store.replaceAuthorizationCode(accountId, code, now)
    await writeAudit(env, user.id, 'qq_mail.account.credential_update', accountId, ip, {
      accountName: account.name,
      email: maskedQqMailEmail(account.email),
    })
    try { await enqueueQqMailSync(env, accountId, 'manual') } catch { /* cron will retry */ }
    return privateQqMailJson({ account: {
      ...publicQqMailAccount(account),
      status: 'active',
      lastErrorCode: '',
      lastErrorAt: null,
      nextSyncAt: 0,
    } })
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function verifyQqMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new QqMailAccountStore(env, user.id).get(accountId)
    await claimQqMailValidationAttempt(env, user.id, ip)
    try {
      await validateQqMailCredentials(account.email, account.authorizationCode)
    } catch (error) {
      await recordQqMailRemoteFailure(env, accountId, error)
      throw error
    }
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `UPDATE qq_mail_accounts SET status = 'active', last_error_code = '',
              last_error_at = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(now, accountId, user.id).run()
    await writeAudit(env, user.id, 'qq_mail.account.verify', accountId, ip, {
      accountName: account.name,
      email: maskedQqMailEmail(account.email),
    })
    return privateQqMailJson({ ok: true, validatedAt: now })
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function deleteQqMailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new QqMailAccountStore(env, user.id).remove(accountId)
    await writeAudit(env, user.id, 'qq_mail.account.disconnect', accountId, ip, {
      accountName: account.name,
      email: maskedQqMailEmail(account.email),
    })
    return privateQqMailJson({ ok: true, remoteRevocationRequired: true })
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function requestQqMailSync(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
  defer: (task: Promise<unknown>) => void,
): Promise<Response> {
  try {
    const limit = await requestedMailSyncLimit(request).catch(() => {
      throw new QqMailStoreError(400, '同步数量必须是 10、20 或 50 封邮件。')
    })
    const store = new QqMailAccountStore(env, user.id)
    const account = await store.publicAccount(accountId)
    if (!account) throw new QqMailStoreError(404, 'QQ 邮箱账号不存在。')
    if (account.status === 'credential_error') {
      throw new QqMailStoreError(409, '请先更新失效的 QQ 邮箱授权码。')
    }
    const now = Math.floor(Date.now() / 1000)
    const result = await env.DB.prepare(
      `UPDATE qq_mail_accounts SET last_manual_sync_at = ?, next_sync_at = 0,
              updated_at = ?
        WHERE id = ? AND user_id = ?
          AND (last_manual_sync_at IS NULL OR last_manual_sync_at <= ?)`,
    ).bind(now, now, accountId, user.id, now - MANUAL_SYNC_INTERVAL_SECONDS).run()
    if (!result.meta.changes) {
      throw new QqMailStoreError(429, '手动同步过于频繁，请稍后重试。')
    }
    await writeAudit(env, user.id, 'qq_mail.sync.request', accountId, ip, {
      accountName: account.name,
      email: maskedQqMailEmail(account.email),
      reason: 'manual',
      limit,
    })
    defer(enqueueQqMailSync(env, accountId, 'manual', limit).catch((error) => {
      console.error('Unable to enqueue manual QQ Mail synchronization', {
        accountId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }))
    return privateQqMailJson({ queued: true, limit }, 202)
  } catch (error) {
    return qqMailResponseError(error)
  }
}
