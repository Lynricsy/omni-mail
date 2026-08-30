import { describe, expect, it, vi } from 'vitest'
import { copyStoredAttachments } from './mail-archive'

describe('sent attachment archive', () => {
  it('copies a missing attachment with recovery metadata', async () => {
    const source = {
      get: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    }
    const backup = {
      head: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    }

    await copyStoredAttachments(
      source as unknown as R2Bucket,
      backup as unknown as R2Bucket,
      '0123456789abcdef0123456789abcdef',
      'message-1',
      [{
        id: 'attachment-1',
        r2Key: 'drafts/user-1/attachment-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
      }],
      Date.parse('2026-07-29T00:00:00Z') / 1000,
    )

    expect(backup.put).toHaveBeenCalledWith(
      'instances/0123456789abcdef0123456789abcdef/mail/sent/2026-07/message-1/attachments/attachment-1',
      expect.any(ReadableStream),
      expect.objectContaining({
        customMetadata: expect.objectContaining({ filename: 'report.pdf' }),
      }),
    )
  })
})
