import { writeAudit } from '../../shared/audit/audit'
import {
  claimQqMailValidationAttempt,
  maskedQqMailEmail,
  privateQqMailJson,
  qqMailIdentityEmailField,
  qqMailJsonBody,
  qqMailNameField,
  qqMailResponseError,
  validateQqMailSenderIdentity,
} from './qq-mail-api-shared'
import { QqMailAccountStore, QqMailStoreError } from './qq-mail-store'
import type { PublicQqMailIdentity } from './qq-mail-types'
import type { Env, SessionUser } from '../../app/types'

export async function createQqMailIdentity(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await qqMailJsonBody(request)
    const name = qqMailNameField(body.name)
    const email = qqMailIdentityEmailField(body.email)
    const store = new QqMailAccountStore(env, user.id)
    const account = await store.get(accountId)
    if (account.status === 'credential_error') {
      throw new QqMailStoreError(409, '请先更新失效的 QQ 邮箱授权码。')
    }
    if (account.identities.some((identity) => identity.email === email)) {
      throw new QqMailStoreError(409, '这个 QQ 邮箱发信身份已经添加。')
    }
    await claimQqMailValidationAttempt(env, user.id, ip)
    await validateQqMailSenderIdentity(email, account.authorizationCode)
    const now = Math.floor(Date.now() / 1000)
    const identity: PublicQqMailIdentity = {
      id: crypto.randomUUID(),
      accountId,
      name,
      email,
      isPrimary: false,
      createdAt: now,
      updatedAt: now,
    }
    const updated = await store.insertIdentity(accountId, identity)
    await writeAudit(env, user.id, 'qq_mail.identity.create', identity.id, ip, {
      accountId,
      accountName: account.name,
      identityName: identity.name,
      email: maskedQqMailEmail(email),
    })
    return privateQqMailJson({ account: updated }, 201)
  } catch (error) {
    return qqMailResponseError(error)
  }
}

export async function deleteQqMailIdentity(
  env: Env,
  user: SessionUser,
  accountId: string,
  identityId: string,
  ip: string,
): Promise<Response> {
  try {
    const store = new QqMailAccountStore(env, user.id)
    const account = await store.get(accountId)
    const identity = account.identities.find(({ id }) => id === identityId)
    if (!identity) throw new QqMailStoreError(404, 'QQ 邮箱发信身份不存在。')
    if (identity.isPrimary) throw new QqMailStoreError(409, '主发信身份不能删除。')
    const updated = await store.removeIdentity(accountId, identityId)
    await writeAudit(env, user.id, 'qq_mail.identity.delete', identityId, ip, {
      accountId,
      accountName: account.name,
      identityName: identity.name,
      email: maskedQqMailEmail(identity.email),
    })
    return privateQqMailJson({ account: updated })
  } catch (error) {
    return qqMailResponseError(error)
  }
}
