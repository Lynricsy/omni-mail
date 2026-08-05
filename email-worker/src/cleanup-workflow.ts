import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'
import {
  CLEANUP_BATCH_SIZE,
  completeRetentionCleanup,
  purgeDeletedAccountBatch,
  purgeMessagesBatch,
  releaseRetentionClaim,
} from './cleanup'
import { BACKUP_RETENTION_RULES, purgeBackupObjectsPage } from './backup-retention'
import { ensureSchema } from './schema'
import { retentionValues } from './storage-policy'
import type { CleanupWorkflowParams, Env } from './types'

const MAX_BATCHES_PER_PHASE = 100
const MAX_BACKUP_PAGES_PER_RULE = 100

export class OmniMailCleanupWorkflow extends WorkflowEntrypoint<Env, CleanupWorkflowParams> {
  async run(
    event: Readonly<WorkflowEvent<CleanupWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const now = event.payload?.startedAt || Math.floor(Date.now() / 1000)
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
    let pending = false
    for (const rule of BACKUP_RETENTION_RULES) {
      let cursor: string | undefined
      for (let index = 0; index < MAX_BACKUP_PAGES_PER_RULE; index += 1) {
        const result = await step.do(
          `Purge backup ${rule.prefix} ${index + 1}`,
          () => purgeBackupObjectsPage(
            this.env.BACKUP_BUCKET!,
            rule.prefix,
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
