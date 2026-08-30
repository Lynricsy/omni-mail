import { describe, expect, it, vi } from 'vitest'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  enqueueDueQqMailSyncs,
  qqMailSyncAuditErrorFields,
  qqMailSyncErrorCode,
  selectQqMailFetchUids,
} from './qq-mail-sync'
import type { Env, MailQueueJob } from '../../app/types'

describe('QQ Mail synchronization policy', () => {
  it('fetches at most 20 recent and 20 newly discovered messages per run', () => {
    const recent = Array.from({ length: 30 }, (_, index) => 30 - index)
    const discovered = Array.from({ length: 30 }, (_, index) => 101 + index)

    const selected = selectQqMailFetchUids(recent, discovered)

    expect(selected).toHaveLength(40)
    expect(selected).toEqual([
      ...Array.from({ length: 20 }, (_, index) => 11 + index),
      ...Array.from({ length: 20 }, (_, index) => 101 + index),
    ])
  })

  it('classifies failures without exposing the remote response', () => {
    expect(qqMailSyncErrorCode(new ImapConnectionError(400, 'secret remote response')))
      .toBe('authentication_failed')
    expect(qqMailSyncErrorCode(new ImapConnectionError(504, 'timeout'))).toBe('timeout')
    expect(qqMailSyncErrorCode(new ImapConnectionError(502, '响应超过读取上限')))
      .toBe('response_too_large')
  })

  it('keeps a safe, actionable error summary for the audit detail dialog', () => {
    expect(qqMailSyncAuditErrorFields(new ImapConnectionError(
      502,
      'QQ 邮箱 FETCH 响应缺少有效 UID，authorization=1234567890abcdef。',
    ))).toEqual({
      errorType: 'ImapConnectionError',
      errorMessage: 'QQ 邮箱 FETCH 响应缺少有效 UID，authorization=[redacted]',
      errorStatus: 502,
    })
  })

  it('requeues expired syncing accounts without racing an active lease', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const jobs: MailQueueJob[] = []
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...bindings: unknown[]) => {
          statements.push({ sql, bindings })
          return {
            all: async () => ({ results: [{ id: 'qq-account-1' }] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      })),
    } as unknown as D1Database
    const env = {
      DB: db,
      MAIL_QUEUE: { send: async (job: MailQueueJob) => { jobs.push(job) } },
      QQ_MAIL_CREDENTIALS_KEY: 'qq-mail-test-key-that-is-longer-than-thirty-two-bytes',
    } as unknown as Env

    await expect(enqueueDueQqMailSyncs(env, 1_000)).resolves.toBe(1)

    expect(jobs).toEqual([{
      kind: 'qq-mail-sync', accountId: 'qq-account-1', reason: 'scheduled',
    }])
    expect(statements[0].sql).toContain("OR status = 'syncing'")
    expect(statements[0].sql).toContain('sync_lease_until <= ?')
    expect(statements[1].sql).toContain("THEN 'stale_lease'")
    expect(statements[1].sql).toContain('sync_lease_until <= ?')
    expect(statements[1].bindings).toEqual([
      1_300, 1_000, 1_000, 'qq-account-1', 1_000, 1_000,
    ])
  })
})
