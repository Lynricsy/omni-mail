import { writeAudit } from '../../shared/audit/audit'
import {
  ICloudClient,
  ICLOUD_CREDENTIAL_ERROR_STATUS,
  ICloudRemoteError,
} from './icloud-apple'
import {
  ICloudAccountStore,
  ICloudStoreError,
  parseICloudCookies,
  publicICloudAccount,
} from './icloud-store'
import type { ICloudAccount, ICloudAlias } from './icloud-types'
import type { Env, SessionUser } from '../../app/types'

function responseError(error: unknown): Response {
  if (error instanceof ICloudStoreError || error instanceof ICloudRemoteError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('iCloud request failed', error)
  return Response.json({ error: 'iCloud 暂时无法处理这个请求。' }, { status: 500 })
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json<unknown>()
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new ICloudStoreError(400, '请求体必须是 JSON 对象。')
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function validICloudEmail(value: string): boolean {
  return ['icloud.com', 'me.com', 'mac.com'].includes(value.toLowerCase().split('@')[1] || '')
}

function deriveICloudEmail(info: { appleId: string; primaryEmail: string }): string {
  if (validICloudEmail(info.primaryEmail)) return info.primaryEmail
  if (validICloudEmail(info.appleId)) return info.appleId
  const local = info.appleId.split('@')[0]
  return local ? `${local}@icloud.com` : ''
}

async function imapClient(email: string, appPassword: string) {
  const { ICloudImapClient } = await import('./icloud-imap')
  return new ICloudImapClient(email, appPassword)
}

function privateJson(body: unknown): Response {
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
}

async function validateAppPassword(email: string, password: string): Promise<void> {
  const client = await imapClient(email, password)
  try {
    await client.open()
    await client.test()
  } finally {
    await client.close()
  }
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isSafeInteger(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback
}

function iCloudAuditDetail(
  account: Pick<ICloudAccount, 'name'>,
  detail: Record<string, unknown> = {},
): Record<string, unknown> {
  return { accountName: account.name, ...detail }
}

async function aliasForAudit(
  client: ICloudClient,
  accountId: string,
  anonymousId: string,
): Promise<ICloudAlias | undefined> {
  try {
    return (await client.listAliases()).find((alias) => alias.anonymousId === anonymousId)
  } catch (error) {
    console.warn('iCloud alias audit lookup failed', {
      accountId,
      message: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

async function validateAccount(account: ICloudAccount): Promise<unknown> {
  const client = new ICloudClient(account.cookies, account.host)
  try {
    const info = await client.validate()
    const aliases = await client.listAliases()
    account.cookies = client.cookies
    account.realEmail = info.appleId || info.primaryEmail
    if (!account.icloudEmail) account.icloudEmail = deriveICloudEmail(info)
    account.status = 'active'
    account.aliasTotal = aliases.length
    account.aliasActive = aliases.filter((alias) => alias.active).length
    account.lastValidated = new Date().toISOString()
    account.lastError = ''
    return null
  } catch (error) {
    account.cookies = client.cookies
    account.status = 'error'
    account.lastError = error instanceof Error ? error.message.slice(0, 300) : 'iCloud 验证失败。'
    return error
  }
}

async function refreshAliasSummary(
  store: ICloudAccountStore,
  account: ICloudAccount,
  client: ICloudClient,
): Promise<void> {
  account.cookies = client.cookies
  account.status = 'active'
  account.lastError = ''
  try {
    const aliases = await client.listAliases()
    account.cookies = client.cookies
    account.aliasTotal = aliases.length
    account.aliasActive = aliases.filter((alias) => alias.active).length
    account.lastValidated = new Date().toISOString()
  } catch (error) {
    account.lastError = '隐藏邮箱操作已完成，但账号状态同步失败。'
    if (error instanceof ICloudRemoteError && error.status === ICLOUD_CREDENTIAL_ERROR_STATUS) account.status = 'error'
    console.warn('iCloud alias statistics refresh failed', {
      accountId: account.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
  await store.saveCookies(account)
}

export async function listICloudAccounts(env: Env, user: SessionUser): Promise<Response> {
  try {
    return Response.json({ accounts: await new ICloudAccountStore(env, user.id).list() })
  } catch (error) {
    return responseError(error)
  }
}

export async function createICloudAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const name = stringField(body.name)
    if (!name || name.length > 80) {
      throw new ICloudStoreError(400, '账号名称需要在 1–80 个字符之间。')
    }
    const icloudEmail = stringField(body.icloudEmail).toLowerCase()
    const appPassword = stringField(body.appPassword)
    const hasAppPassword = Boolean(icloudEmail || appPassword)
    if (hasAppPassword && (!validICloudEmail(icloudEmail) || !appPassword || appPassword.length > 128)) {
      throw new ICloudStoreError(400, '请填写有效的 iCloud 邮箱和应用专用密码。')
    }
    const cookies = body.cookies ? parseICloudCookies(body.cookies) : {}
    const hasCookies = Object.keys(cookies).length > 0
    if (!hasCookies && !hasAppPassword) {
      throw new ICloudStoreError(400, '请至少配置 iCloud Cookie，或填写主邮箱和应用专用密码。')
    }
    const store = new ICloudAccountStore(env, user.id)
    const now = new Date().toISOString()
    const account: ICloudAccount = {
      id: `icloud_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
      userId: user.id,
      name,
      realEmail: hasAppPassword ? icloudEmail : '',
      icloudEmail,
      cookies,
      host: body.host === 'icloud.com.cn' ? 'icloud.com.cn' : 'icloud.com',
      appPassword,
      status: 'pending',
      aliasTotal: 0,
      aliasActive: 0,
      lastValidated: '',
      lastError: '',
      createdAt: now,
    }
    if (hasCookies) {
      const validationError = await validateAccount(account)
      if (validationError) throw validationError
    }
    if (hasAppPassword) await validateAppPassword(icloudEmail, appPassword)
    if (!hasCookies) {
      account.status = 'active'
      account.lastValidated = now
    }
    await store.insert(account)
    await writeAudit(env, user.id, 'icloud.account.create', account.id, ip, iCloudAuditDetail(account, {
      host: account.host,
      iCloudEmail: account.icloudEmail,
    }))
    return Response.json({ account: publicICloudAccount(account) }, { status: 201 })
  } catch (error) {
    return responseError(error)
  }
}

export async function deleteICloudAccount(
  env: Env,
  user: SessionUser,
  id: string,
  ip: string,
): Promise<Response> {
  try {
    const store = new ICloudAccountStore(env, user.id)
    const account = { name: await store.getName(id) }
    if (!await store.remove(id)) throw new ICloudStoreError(404, 'iCloud 账号不存在。')
    await writeAudit(env, user.id, 'icloud.account.delete', id, ip, iCloudAuditDetail(account))
    return Response.json({ ok: true })
  } catch (error) {
    return responseError(error)
  }
}

export async function updateICloudAccountName(
  env: Env,
  user: SessionUser,
  id: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const name = stringField(body.name)
    if (!name || name.length > 80) {
      throw new ICloudStoreError(400, '账号名称需要在 1–80 个字符之间。')
    }
    const store = new ICloudAccountStore(env, user.id)
    const account = { name: await store.getName(id) }
    await store.saveName(id, name)
    await writeAudit(env, user.id, 'icloud.account.rename', id, ip, iCloudAuditDetail(account, {
      accountName: name,
      previousName: account.name,
    }))
    return Response.json({ ok: true, name })
  } catch (error) {
    return responseError(error)
  }
}

export async function updateICloudCookies(
  env: Env,
  user: SessionUser,
  id: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(id)
    account.cookies = parseICloudCookies(body.cookies)
    await validateAccount(account)
    await store.saveCookies(account)
    await writeAudit(env, user.id, 'icloud.credentials.cookies', id, ip, iCloudAuditDetail(account))
    return Response.json({ account: publicICloudAccount(account) })
  } catch (error) {
    return responseError(error)
  }
}

export async function updateICloudAppPassword(
  env: Env,
  user: SessionUser,
  id: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const email = stringField(body.icloudEmail).toLowerCase()
    const password = stringField(body.appPassword)
    if (!validICloudEmail(email) || !password || password.length > 128) {
      throw new ICloudStoreError(400, '请填写有效的 iCloud 邮箱和应用专用密码。')
    }
    const store = new ICloudAccountStore(env, user.id)
    const account = { name: await store.getName(id) }
    await validateAppPassword(email, password)
    await store.saveAppPassword(id, email, password)
    await writeAudit(env, user.id, 'icloud.credentials.app_password', id, ip, iCloudAuditDetail(account, {
      iCloudEmail: email,
    }))
    return Response.json({ ok: true, icloudEmail: email })
  } catch (error) {
    return responseError(error)
  }
}

export async function listICloudAliases(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  try {
    const accountId = new URL(request.url).searchParams.get('accountId') || ''
    if (!accountId) throw new ICloudStoreError(400, '缺少 accountId。')
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(accountId)
    if (!Object.keys(account.cookies).length) {
      throw new ICloudStoreError(400, '该账号尚未配置 Cookie。')
    }
    const client = new ICloudClient(account.cookies, account.host)
    try {
      const aliases = await client.listAliases()
      account.cookies = client.cookies
      account.status = 'active'
      account.aliasTotal = aliases.length
      account.aliasActive = aliases.filter((alias) => alias.active).length
      account.lastValidated = new Date().toISOString()
      account.lastError = ''
      await store.saveCookies(account)
      return Response.json({ aliases })
    } catch (error) {
      account.cookies = client.cookies
      account.lastError = error instanceof Error ? error.message.slice(0, 300) : '同步失败。'
      if (error instanceof ICloudRemoteError && error.status === ICLOUD_CREDENTIAL_ERROR_STATUS) account.status = 'error'
      await store.saveCookies(account)
      throw error
    }
  } catch (error) {
    return responseError(error)
  }
}

export async function createICloudAlias(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const accountId = stringField(body.accountId)
    const label = stringField(body.label)
    const email = stringField(body.email).toLowerCase()
    const previewId = stringField(body.previewId).toLowerCase()
    if (!accountId || label.length > 80
      || Boolean(email) !== Boolean(previewId)
      || (email && !/^[^@\s]{1,64}@icloud\.com$/.test(email))
      || (previewId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(previewId))) {
      throw new ICloudStoreError(400, '隐藏邮箱参数无效。')
    }
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(accountId)
    if (!Object.keys(account.cookies).length) {
      throw new ICloudStoreError(400, '该账号尚未配置 Cookie。')
    }
    const client = new ICloudClient(account.cookies, account.host, previewId || undefined)
    const alias = email
      ? await client.reserveAlias(email, label)
      : await client.createAlias(label)
    await refreshAliasSummary(store, account, client)
    await writeAudit(env, user.id, 'icloud.alias.create', accountId, ip, iCloudAuditDetail(account, {
      alias: alias.email,
      label: alias.label,
    }))
    return Response.json({ alias }, { status: 201 })
  } catch (error) {
    return responseError(error)
  }
}

export async function previewICloudAlias(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const accountId = stringField(body.accountId)
    if (!accountId) throw new ICloudStoreError(400, '隐藏邮箱参数无效。')
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(accountId)
    if (!Object.keys(account.cookies).length) {
      throw new ICloudStoreError(400, '该账号尚未配置 Cookie。')
    }
    const client = new ICloudClient(account.cookies, account.host)
    const email = await client.generateAlias()
    account.cookies = client.cookies
    await store.saveCookies(account)
    return Response.json({ email, previewId: client.clientId })
  } catch (error) {
    return responseError(error)
  }
}

export async function updateICloudAlias(
  env: Env,
  user: SessionUser,
  anonymousId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const accountId = stringField(body.accountId)
    const action = body.action === 'deactivate' || body.action === 'reactivate'
      ? body.action
      : ''
    if (!accountId || !anonymousId || !action) {
      throw new ICloudStoreError(400, '隐藏邮箱操作参数无效。')
    }
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(accountId)
    if (!Object.keys(account.cookies).length) {
      throw new ICloudStoreError(400, '该账号尚未配置 Cookie。')
    }
    const client = new ICloudClient(account.cookies, account.host)
    const auditAlias = await aliasForAudit(client, accountId, anonymousId)
    if (action === 'deactivate') await client.deactivate(anonymousId)
    else await client.reactivate(anonymousId)
    await refreshAliasSummary(store, account, client)
    await writeAudit(env, user.id, `icloud.alias.${action}`, accountId, ip, iCloudAuditDetail(account, {
      anonymousId,
      alias: auditAlias?.email,
      label: auditAlias?.label,
    }))
    return Response.json({ ok: true, action })
  } catch (error) {
    return responseError(error)
  }
}

export async function deleteICloudAlias(
  env: Env,
  user: SessionUser,
  anonymousId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const accountId = stringField(body.accountId)
    if (!accountId || !anonymousId) throw new ICloudStoreError(400, '隐藏邮箱参数无效。')
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(accountId)
    if (!Object.keys(account.cookies).length) {
      throw new ICloudStoreError(400, '该账号尚未配置 Cookie。')
    }
    const client = new ICloudClient(account.cookies, account.host)
    const auditAlias = await aliasForAudit(client, accountId, anonymousId)
    await client.delete(anonymousId)
    await refreshAliasSummary(store, account, client)
    await writeAudit(env, user.id, 'icloud.alias.delete', accountId, ip, iCloudAuditDetail(account, {
      anonymousId,
      alias: auditAlias?.email,
      label: auditAlias?.label,
    }))
    return Response.json({ ok: true })
  } catch (error) {
    return responseError(error)
  }
}

export async function listICloudInbox(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const accountId = url.searchParams.get('accountId') || ''
    const alias = (url.searchParams.get('alias') || '').trim().toLowerCase()
    const query = (url.searchParams.get('q') || '').trim().slice(0, 120)
    const limit = boundedInteger(url.searchParams.get('limit'), 20, 1, 50)
    const days = boundedInteger(url.searchParams.get('days'), 7, 0, 365)
    if (!accountId) throw new ICloudStoreError(400, '缺少 accountId。')
    const store = new ICloudAccountStore(env, user.id)
    const account = await store.get(accountId)
    let imapFailure = ''
    if (account.icloudEmail && account.appPassword) {
      let client: Awaited<ReturnType<typeof imapClient>> | undefined
      try {
        client = await imapClient(account.icloudEmail, account.appPassword)
        await client.open()
        const messages = query
          ? await client.searchInbox(query, alias, limit, days)
          : alias
            ? await client.findByRecipient(alias, limit, days)
            : await client.listInbox(limit, days)
        return privateJson({ messages, method: 'imap' })
      } catch (error) {
        imapFailure = error instanceof Error ? error.message : String(error)
        console.warn('iCloud IMAP failed; using Web fallback', { accountId, message: imapFailure })
      } finally {
        await client?.close()
      }
    }
    if (alias) {
      throw new ICloudStoreError(
        400,
        imapFailure || '按隐藏邮箱筛选需要先配置应用专用密码。',
      )
    }
    if (!Object.keys(account.cookies).length) {
      throw new ICloudStoreError(400, imapFailure || '需要先配置 Cookie 或应用专用密码。')
    }
    const client = new ICloudClient(account.cookies, account.host)
    const summaries = await client.listWebInbox(limit)
    const needle = query.toLocaleLowerCase()
    const messages = needle
      ? summaries.filter((message) => (
          `${message.from}\n${message.to}\n${message.subject}\n${message.preview}`
            .toLocaleLowerCase()
            .includes(needle)
        ))
      : summaries
    account.cookies = client.cookies
    await store.saveCookies(account)
    return privateJson({ messages, method: 'web' })
  } catch (error) {
    return responseError(error)
  }
}

export async function getICloudMessage(
  env: Env,
  user: SessionUser,
  uid: string,
  request: Request,
): Promise<Response> {
  try {
    const accountId = new URL(request.url).searchParams.get('accountId') || ''
    if (!accountId) throw new ICloudStoreError(400, '缺少 accountId。')
    const account = await new ICloudAccountStore(env, user.id).get(accountId)
    if (!account.icloudEmail || !account.appPassword) {
      throw new ICloudStoreError(400, '读取完整邮件需要先配置应用专用密码。')
    }
    let client: Awaited<ReturnType<typeof imapClient>> | undefined
    try {
      client = await imapClient(account.icloudEmail, account.appPassword)
      await client.open()
      return privateJson({ message: await client.getMessage(uid) })
    } finally {
      await client?.close()
    }
  } catch (error) {
    return responseError(error)
  }
}
