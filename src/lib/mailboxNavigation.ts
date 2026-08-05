import type { Folder } from './api'

export function shouldQuietRefreshFolder(current: Folder, next: Folder, query: string) {
  return current === next && query.trim() === ''
}
