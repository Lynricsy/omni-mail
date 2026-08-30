import { describe, expect, it, vi } from 'vitest'
import type { ImapConnection } from './imap-connection'
import {
  fetchIndexedMetadata,
  searchIndexedUidsAfter,
  searchLatestIndexedUids,
} from './imap-index'

function connection(command: (value: string) => Promise<unknown>): ImapConnection {
  return { command: vi.fn(command) } as unknown as ImapConnection
}

describe('lightweight IMAP metadata index', () => {
  it('discovers latest and incremental UIDs in bounded ranges', async () => {
    const latest = connection(async (command) => ({
      lines: command.endsWith('501:1000') ? ['* SEARCH 990 995 999'] : ['* SEARCH'],
      literals: [],
    }))
    await expect(searchLatestIndexedUids(latest, 1001, 2)).resolves.toEqual([995, 999])

    const incremental = connection(async () => ({
      lines: ['* SEARCH 102 105 110'], literals: [],
    }))
    await expect(searchIndexedUidsAfter(incremental, 100, 120, 2)).resolves.toEqual({
      uids: [102, 105], scannedThrough: 105,
    })
  })

  it('fetches headers and metadata without requesting a message body', async () => {
    const commands: string[] = []
    const client = connection(async (command) => {
      commands.push(command)
      const headers = new TextEncoder().encode([
        'From: Sender Name <sender@example.net>',
        'To: Owner <owner@example.com>',
        'Subject: Verification code',
        'Date: Sun, 30 Aug 2026 09:00:00 +0000',
        'Message-ID: <message-42@example.net>',
        'Content-Type: multipart/mixed; boundary="mail"',
        '',
        '',
      ].join('\r\n'))
      return {
        lines: [],
        literals: [{
          line: '* 1 FETCH (UID 42 FLAGS (\\Seen) INTERNALDATE "30-Aug-2026 09:00:00 +0000" RFC822.SIZE 123 BODYSTRUCTURE ("TEXT" "PLAIN" NIL NIL NIL "7BIT" 0 0) {256}',
          data: headers,
        }],
      }
    })

    await expect(fetchIndexedMetadata(client, [42])).resolves.toEqual([expect.objectContaining({
      imapUid: 42,
      senderName: 'Sender Name',
      senderAddress: 'sender@example.net',
      recipients: ['Owner <owner@example.com>'],
      subject: 'Verification code',
      sizeBytes: 123,
      isRead: true,
      hasAttachments: true,
    })])
    expect(commands[0]).toContain('BODY.PEEK[HEADER.FIELDS')
    expect(commands[0]).not.toMatch(/BODY\.PEEK\[\]/)
  })
})
