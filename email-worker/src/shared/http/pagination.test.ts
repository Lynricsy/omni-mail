import { describe, expect, it } from 'vitest'
import { encodeCursor, pageResult, parsePageRequest } from './pagination'

describe('cursor pagination', () => {
  it('parses a bounded limit and opaque cursor', () => {
    const cursor = encodeCursor([123, 'message-1'])
    const request = new Request(`https://mail.test/api/messages?limit=25&cursor=${cursor}`)
    expect(parsePageRequest(request, 2)).toEqual({
      limit: 25,
      cursor: { values: [123, 'message-1'] },
    })
  })

  it('rejects malformed cursors and limits', () => {
    expect(parsePageRequest(
      new Request('https://mail.test/api/messages?limit=101'),
      2,
    )).toBeNull()
    expect(parsePageRequest(
      new Request('https://mail.test/api/messages?cursor=invalid'),
      2,
    )).toBeNull()
  })

  it('uses one look-ahead row to build the next cursor', () => {
    const result = pageResult(
      [{ date: 3, id: 'c' }, { date: 2, id: 'b' }, { date: 1, id: 'a' }],
      2,
      (row) => [row.date, row.id],
    )
    expect(result.items.map((row) => row.id)).toEqual(['c', 'b'])
    expect(result.page).toMatchObject({ hasMore: true, limit: 2 })
    expect(result.page.nextCursor).toBe(encodeCursor([2, 'b']))
  })
})
