export interface PageCursor {
  values: Array<string | number>
}

export interface PageRequest {
  limit: number
  cursor: PageCursor | null
}

export interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
  limit: number
}

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
}

export function encodeCursor(values: Array<string | number>): string {
  return base64Url(JSON.stringify(values))
}

export function parsePageRequest(
  request: Request,
  expectedCursorValues: number,
  defaultLimit = 30,
  maxLimit = 100,
): PageRequest | null {
  const params = new URL(request.url).searchParams
  const rawLimit = params.get('limit')
  const limit = rawLimit === null ? defaultLimit : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) return null

  const rawCursor = params.get('cursor')
  if (!rawCursor) return { limit, cursor: null }
  if (rawCursor.length > 512) return null
  try {
    const values: unknown = JSON.parse(fromBase64Url(rawCursor))
    if (
      !Array.isArray(values)
      || values.length !== expectedCursorValues
      || values.some((value) => typeof value !== 'string' && typeof value !== 'number')
    ) return null
    return { limit, cursor: { values: values as Array<string | number> } }
  } catch {
    return null
  }
}

export function pageResult<T>(
  rows: T[],
  limit: number,
  cursorValues: (row: T) => Array<string | number>,
): { items: T[]; page: PageInfo } {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  return {
    items,
    page: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(cursorValues(last)) : null,
      limit,
    },
  }
}
