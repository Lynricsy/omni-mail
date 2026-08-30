import { normalizeEmail, validEmail } from '../../shared/http/api-helpers'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  normalizeAttachmentFilename,
} from '../../shared/mail/attachment-policy'
import {
  configuredDraftLimits,
  draftLimitForRole,
  type DraftLimits,
} from './draft-policy'
import { textPreview } from '../../app/handlers/mail'
import { deleteStagedObjects, reserveStorage } from '../messages/message-storage'
import {
  requeueFailedOutbound,
  scopedIdempotencyKey,
  sendOutboundMessage,
  type OutboundAttachment,
} from '../outbound/outbound-message'
import {
  hasOutboundProviderConfig,
  outboundProviderConfigError,
  outboundProviderForAddress,
} from '../outbound/outbound-provider-config'
import { resendConfigForAddress } from '../outbound/resend-config'
import {
  MAX_RECIPIENT_TEXT_LENGTH,
  validateNewMessage,
} from '../messages/send-message'
import type { Env, SessionUser } from '../../app/types'

type DraftInput = {
  mailboxAddress?: string
  to?: string
  subject?: string
  text?: string
}

type ValidDraft = {
  mailboxAddress: string
  to: string
  subject: string
  text: string
}

type DraftRow = {
  id: string
  user_id: string
  mailbox_address: string
  recipient_address: string
  subject: string
  body_text: string
  created_at: number
  updated_at: number
}

type DraftAttachmentRow = {
  id: string
  draft_id: string
  filename: string
  content_type: string
  size: number
  r2_key: string
  created_at: number
}

type DraftSummaryRow = DraftRow & {
  attachment_count: number
  attachment_bytes: number
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function canCompose(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin' || user.canReply
}

export function validateDraftInput(
  input: DraftInput,
): { value: ValidDraft; error?: never } | { error: string; value?: never } {
  const mailboxAddress = normalizeEmail(input.mailboxAddress || '')
  const to = normalizeEmail(input.to || '')
  const subject = input.subject?.trim() || ''
  const text = input.text?.trim() || ''
  if (!validEmail(mailboxAddress)) return { error: '发件邮箱格式无效。' }
  if (to.length > MAX_RECIPIENT_TEXT_LENGTH || /[\r\n]/.test(input.to || '')) {
    return { error: '草稿收件人内容过长或包含换行。' }
  }
  if (subject.length > 500 || /[\r\n]/.test(subject)) {
    return { error: '草稿主题不能超过 500 个字符。' }
  }
  if (text.length > 50_000) return { error: '草稿正文不能超过 50,000 个字符。' }
  return { value: { mailboxAddress, to, subject, text } }
}

function attachmentJson(row: DraftAttachmentRow) {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
  }
}

function summaryJson(row: DraftSummaryRow) {
  return {
    id: row.id,
    mailboxAddress: row.mailbox_address,
    to: row.recipient_address,
    subject: row.subject,
    preview: textPreview(row.body_text),
    updatedAt: row.updated_at,
    attachmentCount: Number(row.attachment_count || 0),
    attachmentBytes: Number(row.attachment_bytes || 0),
  }
}

async function draftAttachments(
  env: Env,
  userId: string,
  draftId: string,
): Promise<DraftAttachmentRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.draft_id, a.filename, a.content_type, a.size, a.r2_key, a.created_at
       FROM mail_draft_attachments a
       JOIN mail_drafts d ON d.id = a.draft_id
      WHERE d.user_id = ? AND d.id = ?
      ORDER BY a.created_at, a.id`,
  ).bind(userId, draftId).all<DraftAttachmentRow>()
  return results
}

async function ownedDraft(env: Env, userId: string, draftId: string): Promise<DraftRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, mailbox_address, recipient_address, subject, body_text,
            created_at, updated_at
       FROM mail_drafts WHERE id = ? AND user_id = ?`,
  ).bind(draftId, userId).first<DraftRow>()
}

async function activeOwnedMailbox(
  env: Env,
  userId: string,
  address: string,
): Promise<boolean> {
  const domain = address.slice(address.lastIndexOf('@') + 1)
  const row = await env.DB.prepare(
    `SELECT 1 AS available FROM mailboxes
      WHERE address = ? AND user_id = ? AND is_active = 1 AND is_hidden = 0
        AND EXISTS (
          SELECT 1 FROM domains d WHERE d.name = ? AND d.is_active = 1
        )`,
  ).bind(address, userId, domain).first<{ available: number }>()
  return Boolean(row)
}

async function purgeDraftIds(env: Env, draftIds: string[]): Promise<void> {
  if (!draftIds.length) return
  for (let offset = 0; offset < draftIds.length; offset += 100) {
    await purgeDraftIdBatch(env, draftIds.slice(offset, offset + 100))
  }
}

async function purgeDraftIdBatch(env: Env, draftIds: string[]): Promise<void> {
  const marks = draftIds.map(() => '?').join(', ')
  const { results: attachments } = await env.DB.prepare(
    `SELECT a.r2_key, a.size, d.user_id
       FROM mail_draft_attachments a
       JOIN mail_drafts d ON d.id = a.draft_id
      WHERE a.draft_id IN (${marks})`,
  ).bind(...draftIds).all<{ r2_key: string; size: number; user_id: string }>()
  const objectKeys = attachments.map((attachment) => attachment.r2_key)
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - COALESCE((
          SELECT SUM(a.size) FROM mail_draft_attachments a
          JOIN mail_drafts d ON d.id = a.draft_id
          WHERE d.id IN (${marks}) AND d.user_id = users.id
        ), 0)), updated_at = unixepoch()
        WHERE id IN (SELECT user_id FROM mail_drafts WHERE id IN (${marks}))`,
    ).bind(...draftIds, ...draftIds),
    env.DB.prepare(
      `INSERT OR IGNORE INTO pending_object_deletions (object_key)
       SELECT a.r2_key FROM mail_draft_attachments a
       WHERE a.draft_id IN (${marks})`,
    ).bind(...draftIds),
    env.DB.prepare(`DELETE FROM mail_drafts WHERE id IN (${marks})`).bind(...draftIds),
  ])
  await deleteStagedObjects(env, objectKeys)
}

async function pruneUserDrafts(env: Env, userId: string, limit: number): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM mail_drafts WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?`,
  ).bind(userId, limit).all<{ id: string }>()
  await purgeDraftIds(env, results.map((draft) => draft.id))
}

export async function pruneDraftsForLimits(env: Env, limits: DraftLimits): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM (
       SELECT d.id, u.role,
              ROW_NUMBER() OVER (
                PARTITION BY d.user_id ORDER BY d.updated_at DESC, d.id DESC
              ) AS draft_position
         FROM mail_drafts d
         JOIN users u ON u.id = d.user_id
     ) ranked
     WHERE draft_position > CASE role
       WHEN 'super_admin' THEN ?
       WHEN 'admin' THEN ?
       WHEN 'temporary' THEN ?
       ELSE ? END`,
  ).bind(
    limits.superAdmin,
    limits.admin,
    limits.temporary,
    limits.user,
  ).all<{ id: string }>()
  await purgeDraftIds(env, results.map((draft) => draft.id))
}

export async function listDrafts(env: Env, user: SessionUser): Promise<Response> {
  if (!canCompose(user)) return json({ error: '当前账户没有发信权限。' }, 403)
  const limits = await configuredDraftLimits(env.DB)
  const limit = draftLimitForRole(limits, user.role)
  await pruneUserDrafts(env, user.id, limit)
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.user_id, d.mailbox_address, d.recipient_address, d.subject,
            d.body_text, d.created_at, d.updated_at,
            COUNT(a.id) AS attachment_count,
            COALESCE(SUM(a.size), 0) AS attachment_bytes
       FROM mail_drafts d
       LEFT JOIN mail_draft_attachments a ON a.draft_id = d.id
      WHERE d.user_id = ?
      GROUP BY d.id
      ORDER BY d.updated_at DESC, d.id DESC`,
  ).bind(user.id).all<DraftSummaryRow>()
  return json({ drafts: results.map(summaryJson), limit })
}

export async function getDraft(
  env: Env,
  user: SessionUser,
  draftId: string,
): Promise<Response> {
  if (!canCompose(user)) return json({ error: '当前账户没有发信权限。' }, 403)
  const draft = await ownedDraft(env, user.id, draftId)
  if (!draft) return json({ error: '草稿不存在。' }, 404)
  return json({
    draft: {
      id: draft.id,
      mailboxAddress: draft.mailbox_address,
      to: draft.recipient_address,
      subject: draft.subject,
      text: draft.body_text,
      createdAt: draft.created_at,
      updatedAt: draft.updated_at,
      attachments: (await draftAttachments(env, user.id, draft.id)).map(attachmentJson),
    },
  })
}

export async function createDraft(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!canCompose(user)) return json({ error: '当前账户没有发信权限。' }, 403)
  const input = await request.json<DraftInput>().catch(() => ({} as DraftInput))
  const validated = validateDraftInput(input)
  if ('error' in validated) return json({ error: validated.error }, 400)
  const draft = validated.value
  if (!await activeOwnedMailbox(env, user.id, draft.mailboxAddress)) {
    return json({ error: '发件邮箱不存在或已停用。' }, 404)
  }
  const id = crypto.randomUUID()
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO mail_drafts (
       id, user_id, mailbox_address, recipient_address, subject, body_text,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    user.id,
    draft.mailboxAddress,
    draft.to,
    draft.subject,
    draft.text,
    now,
    now,
  ).run()
  const limits = await configuredDraftLimits(env.DB)
  await pruneUserDrafts(env, user.id, draftLimitForRole(limits, user.role))
  return getDraft(env, user, id)
}

export async function saveDraft(
  env: Env,
  user: SessionUser,
  draftId: string,
  request: Request,
): Promise<Response> {
  if (!canCompose(user)) return json({ error: '当前账户没有发信权限。' }, 403)
  const input = await request.json<DraftInput>().catch(() => ({} as DraftInput))
  const validated = validateDraftInput(input)
  if ('error' in validated) return json({ error: validated.error }, 400)
  const draft = validated.value
  if (!await ownedDraft(env, user.id, draftId)) return json({ error: '草稿不存在。' }, 404)
  if (!await activeOwnedMailbox(env, user.id, draft.mailboxAddress)) {
    return json({ error: '发件邮箱不存在或已停用。' }, 404)
  }
  await env.DB.prepare(
    `UPDATE mail_drafts SET mailbox_address = ?, recipient_address = ?,
        subject = ?, body_text = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).bind(
    draft.mailboxAddress,
    draft.to,
    draft.subject,
    draft.text,
    Date.now(),
    draftId,
    user.id,
  ).run()
  return getDraft(env, user, draftId)
}

export async function uploadDraftAttachment(
  env: Env,
  user: SessionUser,
  draftId: string,
  request: Request,
): Promise<Response> {
  if (!canCompose(user)) return json({ error: '当前账户没有发信权限。' }, 403)
  if (!await ownedDraft(env, user.id, draftId)) return json({ error: '草稿不存在。' }, 404)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size <= 0) {
    return json({ error: '请选择要上传的附件。' }, 400)
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return json({ error: '单个附件不能超过 5 MiB。' }, 413)
  }
  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes
       FROM mail_draft_attachments WHERE draft_id = ?`,
  ).bind(draftId).first<{ count: number; bytes: number }>()
  if ((total?.count || 0) >= MAX_ATTACHMENTS) {
    return json({ error: '一封邮件最多添加 5 个附件。' }, 409)
  }
  if ((total?.bytes || 0) + file.size > MAX_ATTACHMENT_TOTAL_BYTES) {
    return json({ error: '附件总大小不能超过 10 MiB。' }, 413)
  }
  if (!await reserveStorage(env.DB, user.id, file.size)) {
    return json({ error: '邮箱存储空间已满，请清理邮件后重试。' }, 409)
  }
  const id = crypto.randomUUID()
  const key = `drafts/${user.id}/${draftId}/${id}`
  const filename = normalizeAttachmentFilename(file.name)
  const contentType = file.type && file.type.length <= 100 && !/[\r\n]/.test(file.type)
    ? file.type
    : 'application/octet-stream'
  try {
    await env.MAIL_BUCKET.put(key, file, {
      httpMetadata: { contentType },
      customMetadata: { filename, userId: user.id, draftId },
    })
    const stored = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_draft_attachments (
           id, draft_id, filename, content_type, size, r2_key, created_at
         ) SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM mail_draft_attachments WHERE draft_id = ?) < ?
            AND (SELECT COALESCE(SUM(size), 0) FROM mail_draft_attachments
                  WHERE draft_id = ?) + ? <= ?`,
      ).bind(
        id, draftId, filename, contentType, file.size, key, Date.now(),
        draftId, MAX_ATTACHMENTS, draftId, file.size, MAX_ATTACHMENT_TOTAL_BYTES,
      ),
      env.DB.prepare(
        `UPDATE mail_drafts SET updated_at = ? WHERE id = ? AND user_id = ?
          AND EXISTS (SELECT 1 FROM mail_draft_attachments WHERE id = ?)`,
      ).bind(Date.now(), draftId, user.id, id),
    ])
    if (!stored[0]?.meta.changes) {
      await env.MAIL_BUCKET.delete(key).catch(() => undefined)
      await env.DB.prepare(
        `UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - ?)
          WHERE id = ?`,
      ).bind(file.size, user.id).run()
      return json({ error: '附件数量或总大小已经达到上限。' }, 409)
    }
  } catch (error) {
    await env.MAIL_BUCKET.delete(key).catch(() => undefined)
    await env.DB.prepare(
      `UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - ?)
        WHERE id = ?`,
    ).bind(file.size, user.id).run()
    throw error
  }
  return json({ attachment: attachmentJson({
    id,
    draft_id: draftId,
    filename,
    content_type: contentType,
    size: file.size,
    r2_key: key,
    created_at: Date.now(),
  }) }, 201)
}

export async function deleteDraftAttachment(
  env: Env,
  user: SessionUser,
  draftId: string,
  attachmentId: string,
): Promise<Response> {
  const attachment = await env.DB.prepare(
    `SELECT a.id, a.draft_id, a.filename, a.content_type, a.size, a.r2_key, a.created_at
       FROM mail_draft_attachments a
       JOIN mail_drafts d ON d.id = a.draft_id
      WHERE a.id = ? AND a.draft_id = ? AND d.user_id = ?`,
  ).bind(attachmentId, draftId, user.id).first<DraftAttachmentRow>()
  if (!attachment) return json({ error: '草稿附件不存在。' }, 404)
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - ?),
        updated_at = unixepoch() WHERE id = ? AND EXISTS (
          SELECT 1 FROM mail_draft_attachments a
          JOIN mail_drafts d ON d.id = a.draft_id
          WHERE a.id = ? AND a.draft_id = ? AND d.user_id = ?
        )`,
    ).bind(attachment.size, user.id, attachment.id, draftId, user.id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO pending_object_deletions (object_key)
       SELECT a.r2_key FROM mail_draft_attachments a
       JOIN mail_drafts d ON d.id = a.draft_id
       WHERE a.id = ? AND a.draft_id = ? AND d.user_id = ?`,
    ).bind(attachment.id, draftId, user.id),
    env.DB.prepare(
      `DELETE FROM mail_draft_attachments WHERE id = ? AND draft_id IN (
        SELECT id FROM mail_drafts WHERE id = ? AND user_id = ?
      )`,
    ).bind(attachment.id, draftId, user.id),
    env.DB.prepare(
      'UPDATE mail_drafts SET updated_at = ? WHERE id = ? AND user_id = ?',
    ).bind(Date.now(), draftId, user.id),
  ])
  if (!results[2]?.meta.changes) return json({ error: '草稿附件不存在。' }, 404)
  await deleteStagedObjects(env, [attachment.r2_key])
  return json({ ok: true })
}

export async function discardDraft(
  env: Env,
  user: SessionUser,
  draftId: string,
): Promise<Response> {
  if (!await ownedDraft(env, user.id, draftId)) return json({ error: '草稿不存在。' }, 404)
  await purgeDraftIds(env, [draftId])
  return json({ ok: true })
}

export async function purgeUserDraft(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM mail_drafts WHERE user_id = ?',
  ).bind(userId).all<{ id: string }>()
  await purgeDraftIds(env, results.map((draft) => draft.id))
}

export async function purgeMailboxDrafts(
  env: Env,
  userId: string,
  mailboxAddress: string,
): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM mail_drafts WHERE user_id = ? AND mailbox_address = ?',
  ).bind(userId, mailboxAddress).all<{ id: string }>()
  await purgeDraftIds(env, results.map((draft) => draft.id))
}

export async function sendDraft(
  env: Env,
  user: SessionUser,
  draftId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!canCompose(user)) return json({ error: '当前账户没有发信权限。' }, 403)
  const configError = outboundProviderConfigError(env)
  if (configError) return json({ error: configError }, 503)
  if (!hasOutboundProviderConfig(env)) return json({ error: '管理员尚未配置发信服务。' }, 503)
  const body = await request.json<{ idempotencyKey?: string }>()
    .catch(() => ({} as { idempotencyKey?: string }))
  const idempotencyKey = body.idempotencyKey?.trim() || ''
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return json({ error: '无效的请求标识。' }, 400)
  }
  const storedIdempotencyKey = scopedIdempotencyKey(user.id, idempotencyKey)
  const existing = await env.DB.prepare(
    `SELECT m.id, m.status, m.provider_id, m.body_key, m.mailbox_address
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE m.client_request_id IN (?, ?) AND mb.user_id = ?`,
  ).bind(storedIdempotencyKey, idempotencyKey, user.id).first<{
    id: string
    status: string
    provider_id: string | null
    body_key: string | null
    mailbox_address: string
  }>()
  if (existing) {
    if (existing.status === 'failed' && existing.body_key) {
      if (!outboundProviderForAddress(env, existing.mailbox_address)) {
        return json({ error: '该发件域名尚未配置发信服务。' }, 503)
      }
      return requeueFailedOutbound(
        env,
        existing.id,
        user.id,
        ip,
        'message.send',
        { retried: true },
      )
    }
    return json({ message: {
      id: existing.id,
      status: existing.status,
      providerId: existing.provider_id || undefined,
    } }, existing.status === 'sent' ? 200 : 202)
  }
  const draft = await ownedDraft(env, user.id, draftId)
  if (!draft) return json({ error: '草稿不存在。' }, 404)
  const validated = validateNewMessage({
    mailboxAddress: draft.mailbox_address,
    to: draft.recipient_address,
    subject: draft.subject,
    text: draft.body_text,
    idempotencyKey,
  })
  if ('error' in validated) return json({ error: validated.error }, 400)
  if (!await activeOwnedMailbox(env, user.id, draft.mailbox_address)) {
    return json({ error: '发件邮箱不存在或已停用。' }, 404)
  }
  const provider = outboundProviderForAddress(env, draft.mailbox_address)
  if (!provider) {
    return json({ error: '该发件域名尚未配置发信服务。' }, 503)
  }
  const attachments: OutboundAttachment[] = (await draftAttachments(env, user.id, draftId))
    .map((item) => ({
      id: item.id,
      filename: item.filename,
      contentType: item.content_type,
      size: item.size,
      r2Key: item.r2_key,
    }))
  if (attachments.length && provider.provider === 'sendflare'
    && !resendConfigForAddress(env, draft.mailbox_address)) {
    return json({ error: 'SendFlare 暂不支持附件，请为该域名配置 Resend 后重试。' }, 503)
  }
  const message = validated.value
  return sendOutboundMessage(env, user, {
    mailboxAddress: message.mailboxAddress,
    recipients: message.recipients,
    subject: message.subject,
    text: message.text,
    idempotencyKey: message.idempotencyKey,
    attachments,
    draftId,
    auditAction: 'message.send',
    auditDetail: { recipients: message.recipients, attachmentCount: attachments.length },
  }, ip)
}
