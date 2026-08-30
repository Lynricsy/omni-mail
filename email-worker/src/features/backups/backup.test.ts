import { describe, expect, it } from 'vitest'
import { d1ExportFile, d1ExportPayload } from '../../platform/d1/d1-export'

describe('D1 export payload', () => {
  it('keeps polling mode when checking an existing export', () => {
    expect(d1ExportPayload('bookmark-1')).toEqual({
      output_format: 'polling',
      current_bookmark: 'bookmark-1',
    })
  })

  it('reads the current nested completion response', () => {
    expect(d1ExportFile({
      result: { filename: 'backup.sql', signed_url: 'https://backup.example' },
    })).toEqual({
      filename: 'backup.sql',
      signedUrl: 'https://backup.example',
    })
  })

  it('accepts the legacy flat completion response', () => {
    expect(d1ExportFile({ signed_url: 'https://legacy.example' })).toEqual({
      filename: undefined,
      signedUrl: 'https://legacy.example',
    })
  })
})
