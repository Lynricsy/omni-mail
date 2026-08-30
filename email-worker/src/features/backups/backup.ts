import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import {
  copyStoredAttachments,
  copyStoredMail,
  type StoredAttachment,
  type StoredMail,
} from '../messages/mail-archive'
import { d1ExportFile, d1ExportPayload, type D1ExportResult } from '../../platform/d1/d1-export'
import { validateBackupTarget } from './backup-target'
import { backupIdentity, scopedBackupKey } from './backup-scope'
import { backupEnabled } from '../admin/settings/storage-policy'
import type { BackupWorkflowParams, Env } from '../../app/types'

type ExportResult = D1ExportResult & {
  at_bookmark?: string
  status?: 'complete' | 'error'
  error?: string
}

type ExportResponse = {
  success?: boolean
  result?: ExportResult
  errors?: Array<{ message?: string }>
}

function exportError(response: ExportResponse, fallback: string): Error {
  return new Error(response.errors?.map((item) => item.message).filter(Boolean).join('; ') || fallback)
}

function backupDate(timestamp: Date | number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export class OmniMailBackupWorkflow extends WorkflowEntrypoint<
  Env,
  BackupWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<BackupWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const enabled = await step.do('Check backup setting', () => backupEnabled(this.env.DB))
    if (!enabled) return { skipped: true, reason: 'disabled' }

    const trigger = event.payload?.trigger || (event.schedule ? 'scheduled' : 'manual')
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID?.trim()
    const databaseId = this.env.D1_DATABASE_ID?.trim()
    const token = this.env.D1_REST_API_TOKEN?.trim()
    if (!this.env.BACKUP_BUCKET || !accountId || !databaseId || !token) {
      throw new NonRetryableError('备份所需的 R2、D1 标识或 API Token 未配置。')
    }

    await step.do('Record backup start', async () => {
      await this.env.DB.prepare(
        `INSERT INTO backup_runs (id, trigger, status, started_at)
         VALUES (?, ?, 'running', unixepoch())
         ON CONFLICT(id) DO NOTHING`,
      ).bind(event.instanceId, trigger).run()
    })

    try {
      await step.do('Validate D1 backup target', async () => {
        try {
          await validateBackupTarget(this.env)
        } catch (error) {
          throw new NonRetryableError(
            error instanceof Error ? error.message : '无法验证备份目标数据库。',
          )
        }
      })
      const identity = await step.do('Read backup identity', () => backupIdentity(this.env.DB))
      if (event.payload?.includeMail) {
        await this.backfillMail(step, identity)
      }
      const bookmark = await step.do(
        'Start D1 export',
        { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } },
        async () => {
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/export`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(d1ExportPayload()),
            },
          )
          const data = await response.json<ExportResponse>()
          if (!response.ok || !data.success || !data.result?.at_bookmark) {
            throw exportError(data, `D1 导出启动失败（${response.status}）`)
          }
          return data.result.at_bookmark
        },
      )
      const exported = await step.do(
        'Store D1 export in R2',
        { retries: { limit: 30, delay: '10 seconds', backoff: 'constant' } },
        async () => {
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/export`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(d1ExportPayload(bookmark)),
            },
          )
          const data = await response.json<ExportResponse>()
          if (!response.ok || !data.success) {
            throw exportError(data, `D1 导出查询失败（${response.status}）`)
          }
          if (data.result?.status === 'error') {
            throw new NonRetryableError(data.result.error || 'D1 导出失败。')
          }
          if (data.result?.error) throw new NonRetryableError(data.result.error)
          const exportFile = d1ExportFile(data.result)
          if (!exportFile) throw new Error('D1 导出文件尚未准备完成。')

          const date = backupDate(event.timestamp)
          const targets = [scopedBackupKey(identity, `d1/daily/${date}/${event.instanceId}.sql`)]
          const utcDate = new Date(event.timestamp)
          if (utcDate.getUTCDay() === 0) {
            targets.push(scopedBackupKey(identity, `d1/weekly/${date}/${event.instanceId}.sql`))
          }
          if (utcDate.getUTCDate() === 1) {
            targets.push(scopedBackupKey(identity, `d1/monthly/${date}/${event.instanceId}.sql`))
          }
          let size = 0
          for (const key of targets) {
            const dump = await fetch(exportFile.signedUrl)
            if (!dump.ok || !dump.body) {
              throw new Error(`无法下载 D1 导出文件（${dump.status}）`)
            }
            size = Number(dump.headers.get('Content-Length')) || size
            const stored = await this.env.BACKUP_BUCKET!.put(key, dump.body, {
              httpMetadata: { contentType: 'application/sql; charset=utf-8' },
              customMetadata: {
                databaseId,
                bookmark,
                workflowInstance: event.instanceId,
              },
            })
            size = stored?.size ?? size
          }
          return { primaryKey: targets[0], size }
        },
      )
      await step.do('Record backup success', async () => {
        await this.env.DB.prepare(
          `UPDATE backup_runs
              SET status = 'succeeded', object_key = ?, size = ?,
                  error = NULL, completed_at = unixepoch()
            WHERE id = ?`,
        ).bind(exported.primaryKey, exported.size, event.instanceId).run()
      })
      return { ok: true, objectKey: exported.primaryKey }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '备份失败'
      await step.do('Record backup failure', async () => {
        await this.env.DB.prepare(
          `UPDATE backup_runs
              SET status = 'failed', error = ?, completed_at = unixepoch()
            WHERE id = ?`,
        ).bind(detail.slice(0, 500), event.instanceId).run()
      })
      throw error
    }
  }

  private async backfillMail(step: WorkflowStep, identity: string): Promise<void> {
    let cursor = ''
    let page = 0
    while (true) {
      const messages = await step.do(`List mail archive batch ${page}`, async () => {
        const { results } = await this.env.DB.prepare(
          `SELECT id, direction, raw_key, body_key,
                  COALESCE(received_at, sent_at, created_at) AS stored_at
             FROM messages
            WHERE id > ? AND (
              (direction = 'incoming' AND raw_key IS NOT NULL) OR
              (direction = 'outgoing' AND body_key IS NOT NULL)
            )
            ORDER BY id
            LIMIT 50`,
        ).bind(cursor).all<StoredMail>()
        return results
      })
      if (!messages.length) return
      await step.do(
        `Archive mail batch ${page}`,
        { retries: { limit: 5, delay: '5 seconds', backoff: 'exponential' } },
        async () => {
          for (const message of messages) {
            await copyStoredMail(
              this.env.MAIL_BUCKET,
              this.env.BACKUP_BUCKET!,
              identity,
              message,
            )
            if (message.direction === 'outgoing') {
              const { results } = await this.env.DB.prepare(
                `SELECT id, r2_key AS "r2Key", filename, content_type AS "contentType"
                   FROM attachments WHERE message_id = ? ORDER BY id`,
              ).bind(message.id).all<StoredAttachment>()
              await copyStoredAttachments(
                this.env.MAIL_BUCKET,
                this.env.BACKUP_BUCKET!,
                identity,
                message.id,
                results,
                message.stored_at,
              )
            }
          }
        },
      )
      cursor = messages.at(-1)!.id
      page += 1
    }
  }
}
