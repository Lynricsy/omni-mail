export function d1ExportPayload(currentBookmark?: string) {
  return currentBookmark
    ? { output_format: 'polling', current_bookmark: currentBookmark }
    : { output_format: 'polling' }
}

export type D1ExportResult = {
  signed_url?: string
  filename?: string
  result?: { signed_url?: string; filename?: string }
}

export function d1ExportFile(result?: D1ExportResult) {
  const signedUrl = result?.result?.signed_url || result?.signed_url
  if (!signedUrl) return null
  return {
    signedUrl,
    filename: result?.result?.filename || result?.filename,
  }
}
