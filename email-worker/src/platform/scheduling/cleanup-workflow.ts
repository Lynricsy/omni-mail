import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import {
  CLEANUP_BATCH_SIZE,
  completeRetentionCleanup,
  purgeDeletedAccountBatch,
  purgeMailboxMessagesBatch,
  purgeMessagesBatch,
  releaseRetentionClaim,
} from './cleanup'
import { purgeMailboxDrafts } from '../../features/drafts/draft-api'
import { BACKUP_RETENTION_RULES, purgeBackupObjectsPage } from '../../features/backups/backup-retention'
import { backupIdentity, scopedBackupKey } from '../../features/backups/backup-scope'
import { ensureSchema } from '../d1/schema'
import { retentionValues } from '../../features/admin/settings/storage-policy'
import type { CleanupWorkflowParams, Env } from '../../app/types'

const MAX_BATCHES_PER_PHASE = 100
const MAX_BACKUP_PAGES_PER_RULE = 100

export class OmniMailCleanupWorkflow extends WorkflowEntrypoint<Env, CleanupWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<CleanupWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const now = event.payload?.startedAt || Math.floor(Date.now() / 1000)
    if (event.payload?.mailboxDeletion) {
      return this.purgeMailbox(step, now, event.payload.mailboxDeletion)
    }
    try {
      await step.do('Ensure schema', () => ensureSchema(this.env.DB))
      const policy = await step.do('Read retention policy', () => retentionValues(this.env.DB))
      let pending = await this.purgeMessagePhase(step, 'expired', now)
      pending = await this.purgeMessagePhase(
        step,
        'failed',
        now - policy.failedMessageRetentionDays * 24 * 60 * 60,
      ) || pending
      pending = await this.purgeAccountPhase(
        step,
        now - policy.temporaryDataRetentionDays * 24 * 60 * 60,
      ) || pending
      pending = await this.purgeBackupPhase(step, now) || pending
      await step.do('Purge expired metadata', async () => {
        await this.env.DB.batch([
          this.env.DB.prepare(
            `DELETE FROM audit_logs WHERE id IN (
              SELECT id FROM audit_logs WHERE created_at < ? ORDER BY id LIMIT 500
            )`,
          ).bind(now - policy.auditRetentionDays * 24 * 60 * 60),
          this.env.DB.prepare(
            `DELETE FROM resend_webhook_events WHERE event_id IN (
              SELECT event_id FROM resend_webhook_events WHERE created_at < ? LIMIT 500
            )`,
          ).bind(now - 90 * 24 * 60 * 60),
          this.env.DB.prepare(
            `DELETE FROM backup_runs WHERE id IN (
              SELECT id FROM backup_runs WHERE started_at < ? LIMIT 100
            )`,
          ).bind(now - 400 * 24 * 60 * 60),
        ])
      })
      if (pending) {
        await step.do('Schedule cleanup continuation', () => releaseRetentionClaim(this.env.DB, now))
      } else {
        await step.do('Record cleanup success', () => completeRetentionCleanup(this.env.DB, now))
      }
      return { pending, batchSize: CLEANUP_BATCH_SIZE }
    } catch (error) {
      await step.do('Release failed cleanup claim', () => releaseRetentionClaim(this.env.DB, now))
      throw error
    }
  }

  private async purgeMailbox(
    step: WorkflowStep,
    startedAt: number,
    mailbox: NonNullable<CleanupWorkflowParams['mailboxDeletion']>,
  ): Promise<unknown> {
    for (let index = 0; index < MAX_BATCHES_PER_PHASE; index += 1) {
      const count = await step.do(
        `Purge mailbox messages ${index + 1}`,
        () => purgeMailboxMessagesBatch(this.env, mailbox.userId, mailbox.address),
      )
      if (count < CLEANUP_BATCH_SIZE) {
        await step.do(
          'Purge mailbox drafts',
          () => purgeMailboxDrafts(this.env, mailbox.userId, mailbox.address),
        )
        await step.do('Delete mailbox record', async () => {
          await this.env.DB.batch([
            this.env.DB.prepare(
              `DELETE FROM mailboxes
                WHERE address = ? AND user_id = ? AND is_primary = 0 AND is_hidden = 1`,
            ).bind(mailbox.address, mailbox.userId),
            this.env.DB.prepare(
              `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
               VALUES ((SELECT id FROM users WHERE id = ?),
                       'mailbox.delete', ?, 'workflow', '{"scheduledCleanup":true}')`,
            ).bind(mailbox.requestedBy, mailbox.address),
          ])
        })
        return { pending: false, mailbox: mailbox.address }
      }
    }

    await step.do('Schedule mailbox cleanup continuation', async () => {
      if (!this.env.CLEANUP_WORKFLOW) throw new Error('CLEANUP_WORKFLOW is not configured')
      await this.env.CLEANUP_WORKFLOW.create({
        id: `mailbox-delete-${crypto.randomUUID()}`,
        params: { startedAt, mailboxDeletion: mailbox },
        retention: { successRetention: '3 days', errorRetention: '7 days' },
      })
    })
    return { pending: true, mailbox: mailbox.address }
  }

  private async purgeMessagePhase(
    step: WorkflowStep,
    kind: 'expired' | 'failed',
    cutoff: number,
  ): Promise<boolean> {
    for (let index = 0; index < MAX_BATCHES_PER_PHASE; index += 1) {
      const count = await step.do(
        `Purge ${kind} messages ${index + 1}`,
        () => purgeMessagesBatch(this.env, kind, cutoff),
      )
      if (count < CLEANUP_BATCH_SIZE) return false
    }
    return true
  }

  private async purgeAccountPhase(step: WorkflowStep, cutoff: number): Promise<boolean> {
    for (let index = 0; index < MAX_BATCHES_PER_PHASE; index += 1) {
      const processed = await step.do(
        `Purge deleted account data ${index + 1}`,
        () => purgeDeletedAccountBatch(this.env, cutoff),
      )
      if (!processed) return false
    }
    return true
  }

  private async purgeBackupPhase(step: WorkflowStep, now: number): Promise<boolean> {
    if (!this.env.BACKUP_BUCKET) return false
    const identity = await step.do('Read backup cleanup identity', () => (
      backupIdentity(this.env.DB)
    ))
    let pending = false
    for (const rule of BACKUP_RETENTION_RULES) {
      let cursor: string | undefined
      for (let index = 0; index < MAX_BACKUP_PAGES_PER_RULE; index += 1) {
        const result = await step.do(
          `Purge backup ${rule.prefix} ${index + 1}`,
          () => purgeBackupObjectsPage(
            this.env.BACKUP_BUCKET!,
            scopedBackupKey(identity, rule.prefix),
            (now - rule.days * 24 * 60 * 60) * 1000,
            cursor,
          ),
        )
        cursor = result.nextCursor || undefined
        if (!cursor) break
      }
      pending = pending || Boolean(cursor)
    }
    return pending
  }
}
