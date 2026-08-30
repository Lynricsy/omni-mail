import { describe, expect, it } from 'vitest'
import { attachmentPreviewKind } from './attachmentPreview'

describe('attachment preview types', () => {
  it('previews PDFs and common raster image types', () => {
    expect(attachmentPreviewKind('application/pdf')).toBe('pdf')
    expect(attachmentPreviewKind('IMAGE/PNG; charset=binary')).toBe('image')
    expect(attachmentPreviewKind('image/jpeg')).toBe('image')
    expect(attachmentPreviewKind('image/gif')).toBe('image')
    expect(attachmentPreviewKind('image/webp')).toBe('image')
    expect(attachmentPreviewKind('image/avif')).toBe('image')
  })

  it('does not preview active or unsupported document types', () => {
    expect(attachmentPreviewKind('image/svg+xml')).toBeNull()
    expect(attachmentPreviewKind('text/html')).toBeNull()
    expect(attachmentPreviewKind('application/zip')).toBeNull()
    expect(attachmentPreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .toBeNull()
  })
})
