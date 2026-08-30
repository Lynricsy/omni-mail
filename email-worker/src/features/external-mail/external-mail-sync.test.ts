import { describe, expect, it, vi } from 'vitest'
import {
  enqueueDueICloudSyncs,
  enqueueDueLinuxDoMailSyncs,
} from './external-mail-sync'
import type { Env, MailQueueJob } from '../../app/types'

function fixture() {
  const sql: string[] = []
  const jobs: MailQueueJob[] = []
  const db = {
    prepare: vi.fn((statement: string) => {
      sql.push(statement)
      return {
        bind() {
          return {
            all: async () => ({ results: [{ id: 'account-1' }] }),
            run: async () => ({ meta: { changes: 1 } }),
          }
        },
      }
    }),
  } as unknown as D1Database
  const env = {
    DB: db,
    MAIL_QUEUE: { send: async (job: MailQueueJob) => { jobs.push(job) } },
    ICLOUD_CREDENTIALS_KEY: 'icloud-test-key-that-is-longer-than-thirty-two-bytes',
    LINUX_DO_MAIL_CREDENTIALS_KEY: 'linuxdo-test-key-that-is-longer-than-thirty-two-bytes',
  } as unknown as Env
  return { env, jobs, sql }
}

describe('external mail index scheduling', () => {
  it('queues only iCloud accounts with an app-specific password', async () => {
    const { env, jobs, sql } = fixture()

    await expect(enqueueDueICloudSyncs(env, 1_000)).resolves.toBe(1)

    expect(sql[0]).toContain("app_password_cipher <> ''")
    expect(jobs).toEqual([{
      kind: 'icloud-sync', accountId: 'account-1', reason: 'scheduled',
    }])
  })

  it('queues connected Linux DO Mail accounts on the shared mail queue', async () => {
    const { env, jobs } = fixture()

    await expect(enqueueDueLinuxDoMailSyncs(env, 1_000)).resolves.toBe(1)

    expect(jobs).toEqual([{
      kind: 'linuxdo-mail-sync', accountId: 'account-1', reason: 'scheduled',
    }])
  })
})
