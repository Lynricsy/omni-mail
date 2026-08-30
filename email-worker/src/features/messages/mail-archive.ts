import { backupEnabled } from '../admin/settings/storage-policy'
import { backupIdentity, scopedBackupKey } from '../backups/backup-scope'
import type { Env } from '../../app/types'

export type StoredMail = {
  id: string
  direction: 'incoming' | 'outgoing'
  raw_key: string | null
  body_key: string | null
  stored_at: number
}

export type StoredAttachment = {
  id: string
  r2Key: string
  filename: string
  contentType: string
}

function backupMonth(timestamp: Date | number): string {
  return new Date(timestamp).toISOString().slice(0, 7)
}

function archiveKey(message: StoredMail, identity: string): string | null {
  const month = backupMonth(message.stored_at * 1000)
  if (message.direction === 'incoming' && message.raw_key) {
    return scopedBackupKey(identity, `mail/raw/${month}/${message.id}.eml`)
  }
  if (message.direction === 'outgoing' && message.body_key) {
    return scopedBackupKey(identity, `mail/sent/${month}/${message.id}.json`)
  }
  return null
}

export async function copyStoredMail(
  sourceBucket: R2Bucket,
  backupBucket: R2Bucket,
  identity: string,
  message: StoredMail,
): Promise<void> {
  const destination = archiveKey(message, identity)
  const source = message.direction === 'incoming' ? message.raw_key : message.body_key
  if (!destination || !source || await backupBucket.head(destination)) return
  const object = await sourceBucket.get(source)
  if (!object) throw new Error(`邮件备份源文件不存在：${source}`)
  await backupBucket.put(destination, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: {
      messageId: message.id,
      direction: message.direction,
      sourceKey: source,
    },
  })
}

export async function archiveIncomingMessage(
  env: Env,
  messageId: string,
  raw: ArrayBuffer,
  receivedAt: number,
): Promise<void> {
  if (!env.BACKUP_BUCKET || !await backupEnabled(env.DB)) return
  const destination = scopedBackupKey(
    await backupIdentity(env.DB),
    `mail/raw/${backupMonth(receivedAt * 1000)}/${messageId}.eml`,
  )
  if (await env.BACKUP_BUCKET.head(destination)) return
  await env.BACKUP_BUCKET.put(destination, raw, {
    httpMetadata: { contentType: 'message/rfc822' },
    customMetadata: { messageId, direction: 'incoming' },
  })
}

export async function archiveSentMessage(
  env: Env,
  messageId: string,
  body: string,
  sentAt: number,
): Promise<void> {
  if (!env.BACKUP_BUCKET || !await backupEnabled(env.DB)) return
  const destination = scopedBackupKey(
    await backupIdentity(env.DB),
    `mail/sent/${backupMonth(sentAt * 1000)}/${messageId}.json`,
  )
  if (await env.BACKUP_BUCKET.head(destination)) return
  await env.BACKUP_BUCKET.put(destination, body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { messageId, direction: 'outgoing' },
  })
}

export async function archiveSentAttachments(
  env: Env,
  messageId: string,
  attachments: StoredAttachment[],
  sentAt: number,
): Promise<void> {
  if (!attachments.length || !env.BACKUP_BUCKET || !await backupEnabled(env.DB)) return
  await copyStoredAttachments(
    env.MAIL_BUCKET,
    env.BACKUP_BUCKET,
    await backupIdentity(env.DB),
    messageId,
    attachments,
    sentAt,
  )
}

export async function copyStoredAttachments(
  sourceBucket: R2Bucket,
  backupBucket: R2Bucket,
  identity: string,
  messageId: string,
  attachments: StoredAttachment[],
  storedAt: number,
): Promise<void> {
  const prefix = scopedBackupKey(
    identity,
    `mail/sent/${backupMonth(storedAt * 1000)}/${messageId}/attachments`,
  )
  for (const attachment of attachments) {
    const destination = `${prefix}/${attachment.id}`
    if (await backupBucket.head(destination)) continue
    const object = await sourceBucket.get(attachment.r2Key)
    if (!object) throw new Error(`发件附件备份源文件不存在：${attachment.r2Key}`)
    await backupBucket.put(destination, object.body, {
      httpMetadata: { contentType: attachment.contentType },
      customMetadata: {
        messageId,
        attachmentId: attachment.id,
        filename: attachment.filename,
        direction: 'outgoing',
      },
    })
  }
}
