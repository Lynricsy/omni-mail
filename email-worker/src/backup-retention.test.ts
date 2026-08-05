import { describe, expect, it, vi } from 'vitest'
import { purgeBackupObjectsPage } from './backup-retention'

describe('backup object retention', () => {
  it('deletes only objects older than the retention cutoff', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const bucket = {
      list: vi.fn().mockResolvedValue({
        objects: [
          { key: 'd1/daily/old.sql', uploaded: new Date('2026-01-01T00:00:00Z') },
          { key: 'd1/daily/new.sql', uploaded: new Date('2026-07-20T00:00:00Z') },
        ],
        truncated: false,
      }),
      delete: remove,
    }

    const result = await purgeBackupObjectsPage(
      bucket as unknown as R2Bucket,
      'd1/daily/',
      Date.parse('2026-06-29T00:00:00Z'),
    )

    expect(remove).toHaveBeenCalledWith(['d1/daily/old.sql'])
    expect(result).toEqual({ deleted: 1, hasMore: false, nextCursor: null })
  })

  it('does not issue an empty delete operation', async () => {
    const remove = vi.fn()
    const bucket = {
      list: vi.fn().mockResolvedValue({
        objects: [
          { key: 'mail/raw/new.eml', uploaded: new Date('2026-07-20T00:00:00Z') },
        ],
        truncated: false,
      }),
      delete: remove,
    }

    await purgeBackupObjectsPage(
      bucket as unknown as R2Bucket,
      'mail/raw/',
      Date.parse('2026-04-30T00:00:00Z'),
    )

    expect(remove).not.toHaveBeenCalled()
  })

  it('continues when a full page of expired objects was removed', async () => {
    const objects = Array.from({ length: 1000 }, (_, index) => ({
      key: `mail/raw/old-${index}.eml`,
      uploaded: new Date('2026-01-01T00:00:00Z'),
    }))
    const bucket = {
      list: vi.fn().mockResolvedValue({
        objects,
        truncated: true,
        cursor: 'cursor-1',
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    await expect(purgeBackupObjectsPage(
      bucket as unknown as R2Bucket,
      'mail/raw/',
      Date.parse('2026-04-30T00:00:00Z'),
    )).resolves.toEqual({
      deleted: 1000,
      hasMore: true,
      nextCursor: 'cursor-1',
    })
  })

  it('continues past a mixed page using the R2 cursor', async () => {
    const list = vi.fn().mockResolvedValue({
      objects: [
        { key: 'mail/raw/new.eml', uploaded: new Date('2026-07-20T00:00:00Z') },
      ],
      truncated: true,
      cursor: 'cursor-2',
    })
    const bucket = { list, delete: vi.fn() }

    await expect(purgeBackupObjectsPage(
      bucket as unknown as R2Bucket,
      'mail/raw/',
      Date.parse('2026-04-30T00:00:00Z'),
      'cursor-1',
    )).resolves.toEqual({
      deleted: 0,
      hasMore: true,
      nextCursor: 'cursor-2',
    })
    expect(list).toHaveBeenCalledWith({
      prefix: 'mail/raw/',
      limit: 1000,
      cursor: 'cursor-1',
    })
  })
})
