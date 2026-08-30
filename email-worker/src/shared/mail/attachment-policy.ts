export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024

export function normalizeAttachmentFilename(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 255) || 'attachment'
}

export function attachmentFilesError(files: readonly { size: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return '一封邮件最多添加 5 个附件。'
  if (files.some((file) => file.size <= 0)) return '请选择要上传的附件。'
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
    return '单个附件不能超过 5 MiB。'
  }
  const total = files.reduce((bytes, file) => bytes + file.size, 0)
  return total > MAX_ATTACHMENT_TOTAL_BYTES ? '附件总大小不能超过 10 MiB。' : null
}
