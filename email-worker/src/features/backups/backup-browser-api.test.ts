import { describe, expect, it, vi } from 'vitest'
import { inspectBackupSample, listBackupObjects, validBackupPrefix } from './backup-browser-api'
import type { Env, SessionUser } from '../../app/types'

describe('backup browser safety', () => {
  it('allows only managed backup namespaces', () => {
    expect(validBackupPrefix('d1/daily/')).toBe(true)
    expect(validBackupPrefix('mail/raw/')).toBe(true)
    expect(validBackupPrefix('private/')).toBe(false)
  })

  it('recognizes a D1 SQL export without applying it', () => {
    const result = inspectBackupSample(
      'd1/daily/2026-07-29/backup.sql',
      'PRAGMA foreign_keys=OFF;\nCREATE TABLE users (id TEXT);',
      1024,
    )
    expect(result.every(({ passed }) => passed)).toBe(true)
  })

  it('rejects malformed raw-mail samples', () => {
    const result = inspectBackupSample(
      'mail/raw/2026-07/message.eml',
      'not an email',
      12,
    )
    expect(result.some(({ passed }) => !passed)).toBe(true)
  })

  it('does not expose backup objects to ordinary administrators', async () => {
    const response = await listBackupObjects(
      {} as Env,
      { role: 'admin' } as SessionUser,
      new Request('https://mail.example.com/api/admin/backups/objects'),
    )

    expect(response.status).toBe(403)
  })

  it('lists only the current database backup namespace', async () => {
    const list = vi.fn(async () => ({
      objects: [{
        key: 'instances/0123456789abcdef0123456789abcdef/d1/daily/backup.sql',
        size: 10,
        uploaded: new Date(0),
        etag: 'etag',
      }],
      truncated: false,
    }))
    const response = await listBackupObjects(
      {
        DB: { prepare: () => ({
          bind() { return this },
          first: async () => ({ value: '0123456789abcdef0123456789abcdef' }),
        }) },
        BACKUP_BUCKET: { list },
      } as unknown as Env,
      { role: 'super_admin' } as SessionUser,
      new Request('https://mail.example.com/api/admin/backups/objects?prefix=d1/daily/'),
    )

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'instances/0123456789abcdef0123456789abcdef/d1/daily/',
    }))
    await expect(response.json()).resolves.toMatchObject({
      objects: [{ key: 'd1/daily/backup.sql' }],
    })
  })
})
