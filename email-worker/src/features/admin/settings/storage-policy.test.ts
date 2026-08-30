import { describe, expect, it } from 'vitest'
import { backupMissingConfiguration } from './storage-policy'
import type { Env } from '../../../app/types'

describe('backupMissingConfiguration', () => {
  it('reports every runtime resource required by a real backup', () => {
    expect(backupMissingConfiguration({} as Env)).toEqual([
      'BACKUP_BUCKET',
      'BACKUP_WORKFLOW',
      'CLOUDFLARE_ACCOUNT_ID',
      'D1_DATABASE_ID',
      'D1_REST_API_TOKEN',
    ])
  })

  it('accepts a fully configured backup environment', () => {
    const env = {
      BACKUP_BUCKET: {},
      BACKUP_WORKFLOW: {},
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: 'database',
      D1_REST_API_TOKEN: 'token',
    } as unknown as Env
    expect(backupMissingConfiguration(env)).toEqual([])
  })
})
