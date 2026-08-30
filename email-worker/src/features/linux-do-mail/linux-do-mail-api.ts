import { writeAudit } from '../../shared/audit/audit'
import { safeJsonArray } from '../../shared/http/api-helpers'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { linuxDoMailCredentialsReady } from './linux-do-mail-credentials'
import type { LinuxDoMailImapClient } from './linux-do-mail-imap'
import { searchLikePattern } from '../../shared/mail/message-search'
import { sendOutboundMessage } from '../outbound/outbound-message'
import { validateNewMessage } from '../messages/send-message'
import {
  LinuxDoMailAccountStore,
  LinuxDoMailStoreError,
  publicLinuxDoMailAccount,
} from './linux-do-mail-store'
import type { LinuxDoMailAccount } from './linux-do-mail-types'
import type { Env, MessageRow, SessionUser, StoredBody } from '../../app/types'

function responseError(error: unknown): Response {
  if (error instanceof LinuxDoMailStoreError || error instanceof ImapConnectionError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('Linux DO Mail request failed', {
    message: error instanceof Error ? error.message : String(error),
  })
  return Response.json({ error: 'Linux DO Mail 暂时无法处理这个请求。' }, { status: 500 })
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json<unknown>()
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new LinuxDoMailStoreError(400, '请求体必须是 JSON 对象。')
  }
}

function usernameField(value: unknown): string {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[^@\s]{1,64}@linux\.do$/.test(username) || username.length > 254) {
    throw new LinuxDoMailStoreError(400, '请填写完整的 @linux.do 邮箱地址。')
  }
  return username
}

function passwordField(value: unknown): string {
  const password = typeof value === 'string' ? value : ''
  if (!password || password.length > 512 || /[\r\n\0]/.test(password)) {
    throw new LinuxDoMailStoreError(400, '请填写有效的密码或认证令牌。')
  }
  return password
}

function searchQuery(request?: Request): string {
  if (!request) return ''
  const query = (new URL(request.url).searchParams.get('q') || '').trim()
  if (query.length > 120 || /[\r\n\0]/.test(query)) {
    throw new LinuxDoMailStoreError(400, '搜索关键词无效或超过 120 个字符。')
  }
  return query
}

async function validateCredentials(username: string, password: string): Promise<void> {
  const client = await imapClient(username, password)
  try {
    await client.open()
    await client.test()
  } finally {
    await client.close()
  }
}

async function imapClient(username: string, password: string): Promise<LinuxDoMailImapClient> {
  const { LinuxDoMailImapClient } = await import('./linux-do-mail-imap')
  return new LinuxDoMailImapClient(username, password)
}

async function recordFailure(
  store: LinuxDoMailAccountStore,
  accountId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'IMAP 读取失败。'
  try { await store.recordValidation(accountId, message) } catch { /* preserve remote error */ }
}

export async function getLinuxDoMailAccount(env: Env, user: SessionUser): Promise<Response> {
  try {
    const enabled = linuxDoMailCredentialsReady(env)
    const account = enabled
      ? await new LinuxDoMailAccountStore(env, user.id).publicAccount()
      : null
    return privateJson({ enabled, account })
  } catch (error) {
    return responseError(error)
  }
}

export async function createLinuxDoMailAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const username = usernameField(body.username)
    const password = passwordField(body.password)
    const store = new LinuxDoMailAccountStore(env, user.id)
    if (await store.publicAccount()) {
      throw new LinuxDoMailStoreError(409, '每个用户只能连接一个 Linux DO Mail 账号。')
    }
    await validateCredentials(username, password)
    const now = new Date().toISOString()
    const account: LinuxDoMailAccount = {
      id: `linuxdo_mail_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
      userId: user.id,
      username,
      password,
      status: 'active',
      lastValidated: now,
      lastError: '',
      createdAt: now,
    }
    await store.insert(account)
    await writeAudit(env, user.id, 'linuxdo_mail.account.connect', account.id, ip, { username })
    return privateJson({ account: publicLinuxDoMailAccount(account) }, 201)
  } catch (error) {
    return responseError(error)
  }
}

export async function deleteLinuxDoMailAccount(
  env: Env,
  user: SessionUser,
  ip: string,
): Promise<Response> {
  try {
    const store = new LinuxDoMailAccountStore(env, user.id)
    const account = await store.remove()
    await writeAudit(env, user.id, 'linuxdo_mail.account.disconnect', account.id, ip, {
      username: account.username,
    })
    return privateJson({ ok: true })
  } catch (error) {
    return responseError(error)
  }
}

export async function verifyLinuxDoMailAccount(
  env: Env,
  user: SessionUser,
  ip: string,
): Promise<Response> {
  try {
    const store = new LinuxDoMailAccountStore(env, user.id)
    const account = await store.get()
    try {
      await validateCredentials(account.username, account.password)
      await store.recordValidation(account.id)
    } catch (error) {
      await recordFailure(store, account.id, error)
      throw error
    }
    await writeAudit(env, user.id, 'linuxdo_mail.account.verify', account.id, ip, {
      username: account.username,
    })
    return privateJson({ ok: true, validatedAt: new Date().toISOString() })
  } catch (error) {
    return responseError(error)
  }
}

export async function updateLinuxDoMailCredential(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const password = passwordField((await jsonBody(request)).password)
    const store = new LinuxDoMailAccountStore(env, user.id)
    const account = await store.publicAccount()
    if (!account) throw new LinuxDoMailStoreError(404, '尚未连接 Linux DO Mail 账号。')
    await validateCredentials(account.username, password)
    const validatedAt = new Date().toISOString()
    await store.replacePassword(account.id, password, validatedAt)
    await writeAudit(env, user.id, 'linuxdo_mail.account.credential_update', account.id, ip, {
      username: account.username,
    })
    return privateJson({
      account: {
        ...account,
        status: 'active',
        lastValidated: validatedAt,
        lastError: '',
      },
    })
  } catch (error) {
    return responseError(error)
  }
}

export async function listLinuxDoMailInbox(
  env: Env,
  user: SessionUser,
  request?: Request,
): Promise<Response> {
  let client: LinuxDoMailImapClient | undefined
  try {
    const store = new LinuxDoMailAccountStore(env, user.id)
    const account = await store.get()
    const query = searchQuery(request)
    client = await imapClient(account.username, account.password)
    try {
      await client.open()
      const messages = await client.listInbox(20, query)
      await store.recordValidation(account.id)
      return privateJson({ messages })
    } catch (error) {
      await recordFailure(store, account.id, error)
      throw error
    }
  } catch (error) {
    return responseError(error)
  } finally {
    await client?.close()
  }
}

export async function getLinuxDoMailMessage(
  env: Env,
  user: SessionUser,
  uid: string,
): Promise<Response> {
  let client: LinuxDoMailImapClient | undefined
  try {
    if (!/^\d+$/.test(uid) || Number(uid) < 1) {
      throw new LinuxDoMailStoreError(400, '邮件 UID 无效。')
    }
    const store = new LinuxDoMailAccountStore(env, user.id)
    const account = await store.get()
    client = await imapClient(account.username, account.password)
    try {
      await client.open()
      return privateJson({ message: await client.getMessage(uid) })
    } catch (error) {
      await recordFailure(store, account.id, error)
      throw error
    }
  } catch (error) {
    return responseError(error)
  } finally {
    await client?.close()
  }
}

type LinuxDoSentRow = Pick<
  MessageRow,
  | 'id'
  | 'status'
  | 'sender_address'
  | 'recipients_json'
  | 'subject'
  | 'preview'
  | 'sent_at'
  | 'created_at'
  | 'body_key'
  | 'delivery_status'
  | 'processing_error'
>

function sentMessage(row: LinuxDoSentRow, body?: StoredBody) {
  return {
    id: row.id,
    from: row.sender_address,
    to: safeJsonArray(row.recipients_json).join(', '),
    subject: row.subject,
    date: new Date((row.sent_at ?? row.created_at) * 1000).toISOString(),
    preview: row.preview,
    body: body?.text || '',
    html: body?.html || '',
    isRead: true,
    direction: 'outgoing' as const,
    status: row.status,
    deliveryStatus: row.delivery_status,
    processingError: row.processing_error || '',
  }
}

async function linuxDoMailboxAddress(env: Env, userId: string): Promise<string> {
  const account = await new LinuxDoMailAccountStore(env, userId).publicAccount()
  if (!account) throw new LinuxDoMailStoreError(404, '尚未连接 Linux DO Mail 账号。')
  return account.username
}

export async function listLinuxDoMailSent(
  env: Env,
  user: SessionUser,
  request?: Request,
): Promise<Response> {
  try {
    const mailboxAddress = await linuxDoMailboxAddress(env, user.id)
    const query = searchQuery(request)
    const pattern = query ? searchLikePattern(query) : ''
    const searchCondition = query ? `AND (
      EXISTS (
        SELECT 1 FROM message_search ms
         WHERE ms.message_id = m.id AND ms.content LIKE ? ESCAPE '\\'
      ) OR m.subject LIKE ? ESCAPE '\\'
        OR m.recipients_json LIKE ? ESCAPE '\\'
    )` : ''
    const bindings = query
      ? [mailboxAddress, user.id, pattern, pattern, pattern]
      : [mailboxAddress, user.id]
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.status, m.sender_address, m.recipients_json, m.subject,
              m.preview, m.sent_at, m.created_at, m.body_key,
              m.delivery_status, m.processing_error
         FROM messages m
         JOIN mailboxes mb ON mb.address = m.mailbox_address
        WHERE m.mailbox_address = ? AND mb.user_id = ? AND mb.is_hidden = 1
          AND m.direction = 'outgoing' AND m.folder = 'sent'
          ${searchCondition}
        ORDER BY m.sent_at DESC, m.id DESC
        LIMIT 20`,
    ).bind(...bindings).all<LinuxDoSentRow>()
    return privateJson({ messages: results.map((row) => sentMessage(row)) })
  } catch (error) {
    return responseError(error)
  }
}

export async function getLinuxDoMailSentMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
): Promise<Response> {
  try {
    if (!messageId || messageId.length > 100) {
      throw new LinuxDoMailStoreError(400, '邮件 ID 无效。')
    }
    const mailboxAddress = await linuxDoMailboxAddress(env, user.id)
    const row = await env.DB.prepare(
      `SELECT m.id, m.status, m.sender_address, m.recipients_json, m.subject,
              m.preview, m.sent_at, m.created_at, m.body_key,
              m.delivery_status, m.processing_error
         FROM messages m
         JOIN mailboxes mb ON mb.address = m.mailbox_address
        WHERE m.id = ? AND m.mailbox_address = ? AND mb.user_id = ?
          AND mb.is_hidden = 1 AND m.direction = 'outgoing' AND m.folder = 'sent'`,
    ).bind(messageId, mailboxAddress, user.id).first<LinuxDoSentRow>()
    if (!row) throw new LinuxDoMailStoreError(404, '已发送邮件不存在。')
    let body: StoredBody = { text: '', html: '' }
    if (row.body_key) {
      const object = await env.MAIL_BUCKET.get(row.body_key)
      if (object) body = await object.json<StoredBody>()
    }
    return privateJson({ message: sentMessage(row, body) })
  } catch (error) {
    return responseError(error)
  }
}

export async function sendLinuxDoMailMessage(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    if (user.role !== 'super_admin' && !user.canReply) {
      throw new LinuxDoMailStoreError(403, '当前账户没有发信权限。')
    }
    const body = await jsonBody(request)
    const store = new LinuxDoMailAccountStore(env, user.id)
    const account = await store.get()
    const validated = validateNewMessage({
      mailboxAddress: account.username,
      to: typeof body.to === 'string' ? body.to : '',
      subject: typeof body.subject === 'string' ? body.subject : '',
      text: typeof body.text === 'string' ? body.text : '',
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    })
    if ('error' in validated) {
      throw new LinuxDoMailStoreError(400, validated.error || '邮件内容无效。')
    }
    const mailbox = await env.DB.prepare(
      `SELECT 1 AS found FROM mailboxes
        WHERE address = ? AND user_id = ? AND is_active = 1 AND is_hidden = 1`,
    ).bind(account.username, user.id).first<{ found: number }>()
    if (!mailbox) {
      throw new LinuxDoMailStoreError(409, 'Linux DO Mail 发件通道尚未完成初始化。')
    }
    return sendOutboundMessage(env, user, {
      mailboxAddress: account.username,
      recipients: [validated.value.to],
      subject: validated.value.subject,
      text: validated.value.text,
      idempotencyKey: validated.value.idempotencyKey,
      auditAction: 'linuxdo_mail.message.send',
      auditDetail: { recipient: validated.value.to },
      rateLimitMaximums: { dayLimit: 50 },
    }, ip)
  } catch (error) {
    return responseError(error)
  }
}
