import { describe, expect, it, vi } from 'vitest'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  enqueueDueGmailSyncs,
  gmailSyncErrorCode,
  selectGmailFetchUids,
} from './gmail-sync'
import type { Env, MailQueueJob } from '../../app/types'

describe('Gmail synchronization policy', () => {
  it('fetches recent state plus only the requested number of new messages', () => {
    const recent = Array.from({ length: 30 }, (_, index) => 30 - index)
    const discovered = Array.from({ length: 30 }, (_, index) => 101 + index)

    expect(selectGmailFetchUids(recent, discovered, 20)).toEqual([
      ...Array.from({ length: 20 }, (_, index) => 11 + index),
      ...Array.from({ length: 20 }, (_, index) => 101 + index),
    ])
  })

  it('classifies failures without exposing the remote response', () => {
    expect(gmailSyncErrorCode(new ImapConnectionError(400, 'secret remote response')))
      .toBe('authentication_failed')
    expect(gmailSyncErrorCode(new ImapConnectionError(504, 'timeout'))).toBe('timeout')
  })

  it('requeues expired syncing accounts', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const jobs: MailQueueJob[] = []
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...bindings: unknown[]) => {
          statements.push({ sql, bindings })
          return {
            all: async () => ({ results: [{ id: 'gmail-account-1' }] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      })),
    } as unknown as D1Database
    const env = {
      DB: db,
      MAIL_QUEUE: { send: async (job: MailQueueJob) => { jobs.push(job) } },
      GMAIL_CREDENTIALS_KEY: 'gmail-test-key-that-is-longer-than-thirty-two-bytes',
    } as unknown as Env

    await expect(enqueueDueGmailSyncs(env, 1_000)).resolves.toBe(1)

    expect(jobs).toEqual([{
      kind: 'gmail-sync', accountId: 'gmail-account-1', reason: 'scheduled',
    }])
    expect(statements[0].sql).toContain("OR status = 'syncing'")
    expect(statements[1].sql).toContain("THEN 'stale_lease'")
    expect(statements[1].bindings).toEqual([
      1_300, 1_000, 1_000, 'gmail-account-1', 1_000, 1_000,
    ])
  })
})
