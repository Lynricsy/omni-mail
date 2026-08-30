import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

import { linuxDoMailSearchCommand } from './linux-do-mail-imap'

describe('Linux DO Mail IMAP search', () => {
  it('lists all messages when the query is blank', () => {
    expect(linuxDoMailSearchCommand('  ')).toBe('UID SEARCH ALL')
  })

  it('quotes ASCII text searches', () => {
    expect(linuxDoMailSearchCommand('release "notes"')).toBe(
      'UID SEARCH TEXT "release \\"notes\\""',
    )
  })

  it('uses the UTF-8 charset for non-ASCII searches', () => {
    expect(linuxDoMailSearchCommand('求职')).toBe(
      'UID SEARCH CHARSET UTF-8 TEXT "求职"',
    )
  })
})
