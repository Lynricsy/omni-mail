import type { Folder } from '../../../shared/api'

export function shouldQuietRefreshFolder(current: Folder, next: Folder, query: string) {
  return current === next && query.trim() === ''
}
