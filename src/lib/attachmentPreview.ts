export type AttachmentPreviewKind = 'image' | 'pdf'

const PREVIEWABLE_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export function attachmentPreviewKind(contentType: string): AttachmentPreviewKind | null {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase()
  if (normalized === 'application/pdf') return 'pdf'
  return PREVIEWABLE_IMAGE_TYPES.has(normalized) ? 'image' : null
}
