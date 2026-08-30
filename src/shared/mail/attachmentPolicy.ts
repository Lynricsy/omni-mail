export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024

export function attachmentSelectionError(
  files: readonly { size: number }[],
  existing: readonly { size: number }[],
): string | null {
  if (files.length + existing.length > MAX_ATTACHMENTS) {
    return '一封邮件最多添加 5 个附件。'
  }
  if (files.some((file) => file.size <= 0)) return '请选择要上传的附件。'
  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
    return '单个附件不能超过 5 MiB。'
  }
  const total = [...existing, ...files].reduce((bytes, file) => bytes + file.size, 0)
  return total > MAX_ATTACHMENT_TOTAL_BYTES
    ? '附件总大小不能超过 10 MiB。'
    : null
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
