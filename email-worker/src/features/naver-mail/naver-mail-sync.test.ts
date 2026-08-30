import { describe, expect, it, vi } from 'vitest'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  enqueueDueNaverMailSyncs,
  missingNaverMailUids,
  naverMailSyncErrorCode,
  selectNaverMailFetchUids,
} from './naver-mail-sync'
import type { NaverMailMessageMetadata } from './naver-mail-types'
import type { Env, MailQueueJob } from '../../app/types'

describe('NAVER Mail synchronization policy', () => {
  it('identifies indexed UIDs that disappeared from INBOX', () => {
    expect(missingNaverMailUids(
      [10, 11, 12],
      [{ imapUid: 10 }, { imapUid: 12 }] as NaverMailMessageMetadata[],
    )).toEqual([11])
  })

  it('classifies authentication, timeout, and oversized responses without server text', () => {
    expect(naverMailSyncErrorCode(new ImapConnectionError(400, 'secret remote response')))
      .toBe('authentication_failed')
    expect(naverMailSyncErrorCode(new ImapConnectionError(504, 'timeout'))).toBe('timeout')
    expect(naverMailSyncErrorCode(new ImapConnectionError(502, '响应超过读取上限')))
      .toBe('response_too_large')
  })

  it('fetches at most 20 recent and 20 newly discovered messages per run', () => {
    const recent = Array.from({ length: 30 }, (_, index) => 30 - index)
    const discovered = Array.from({ length: 30 }, (_, index) => 101 + index)

    expect(selectNaverMailFetchUids(recent, discovered)).toEqual([
      ...Array.from({ length: 20 }, (_, index) => 11 + index),
      ...Array.from({ length: 20 }, (_, index) => 101 + index),
    ])
  })

  it('schedules due accounts at a 15-minute interval', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const jobs: MailQueueJob[] = []
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: (...bindings: unknown[]) => {
          statements.push({ sql, bindings })
          return {
            all: async () => ({ results: [{ id: 'naver-account-1' }] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      })),
    } as unknown as D1Database
    const env = {
      DB: db,
      MAIL_QUEUE: { send: async (job: MailQueueJob) => { jobs.push(job) } },
      NAVER_MAIL_CREDENTIALS_KEY: 'naver-mail-test-key-that-is-longer-than-thirty-two-bytes',
      NAVER_MAIL_IMAP_ENABLED: 'true',
    } as unknown as Env

    await expect(enqueueDueNaverMailSyncs(env, 1_000)).resolves.toBe(1)
    expect(jobs).toEqual([{
      kind: 'naver-mail-sync', accountId: 'naver-account-1', reason: 'scheduled',
    }])
    expect(statements[0].sql).toContain("OR status = 'syncing'")
    expect(statements[1].sql).toContain("THEN 'stale_lease'")
    expect(statements.some(({ sql, bindings }) => (
      sql.includes('UPDATE naver_mail_accounts')
      && bindings[0] === 1_900
    ))).toBe(true)
  })

  it('does not query D1 while the emergency switch is off', async () => {
    const prepare = vi.fn()
    const env = {
      DB: { prepare },
      NAVER_MAIL_CREDENTIALS_KEY: 'naver-mail-test-key-that-is-longer-than-thirty-two-bytes',
      NAVER_MAIL_IMAP_ENABLED: 'false',
    } as unknown as Env

    await expect(enqueueDueNaverMailSyncs(env)).resolves.toBe(0)
    expect(prepare).not.toHaveBeenCalled()
  })
})
