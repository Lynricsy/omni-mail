import { connect } from 'cloudflare:sockets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import packageMetadata from '../../../../package.json'
import { GmailImapClient } from './gmail-imap'

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

function scriptedSocket(replies: Uint8Array | string) {
  const writes: Uint8Array[] = []
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(typeof replies === 'string' ? new TextEncoder().encode(replies) : replies)
    },
  })
  const writable = new WritableStream<Uint8Array>({
    write(value) { writes.push(value.slice()) },
  })
  return {
    socket: {
      readable,
      writable,
      opened: Promise.resolve({ remoteAddress: null, localAddress: null }),
      closed: new Promise<void>(() => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as Socket,
    commands: () => new TextDecoder().decode(Uint8Array.from(
      writes.flatMap((value) => [...value]),
    )),
  }
}

function responseWithMessage(raw: string): Uint8Array {
  const encoder = new TextEncoder()
  const prefix = encoder.encode([
    '* OK Gmail ready',
    '* CAPABILITY IMAP4rev1 ID X-GM-EXT-1',
    'A0001 OK CAPABILITY',
    'A0002 OK LOGIN',
    '* CAPABILITY IMAP4rev1 ID X-GM-EXT-1',
    'A0003 OK CAPABILITY',
    '* ID ("name" "GImap")',
    'A0004 OK ID',
    '* 1 EXISTS',
    '* OK [UIDVALIDITY 123] UIDs valid',
    'A0005 OK EXAMINE',
    `* 1 FETCH (BODY[] {${encoder.encode(raw).byteLength}}`,
    '',
  ].join('\r\n'))
  const suffix = encoder.encode([
    ' UID 42)',
    'A0006 OK FETCH',
    '* 1 EXISTS',
    '* OK [READ-WRITE] Mailbox selected',
    'A0007 OK SELECT',
    'A0008 OK STORE',
    '* BYE',
    'A0009 OK LOGOUT',
    '',
  ].join('\r\n'))
  const bytes = new Uint8Array(prefix.byteLength + encoder.encode(raw).byteLength + suffix.byteLength)
  bytes.set(prefix)
  bytes.set(encoder.encode(raw), prefix.byteLength)
  bytes.set(suffix, prefix.byteLength + encoder.encode(raw).byteLength)
  return bytes
}

describe('Gmail IMAP controlled command boundary', () => {
  beforeEach(() => vi.mocked(connect).mockReset())

  it('reads with BODY.PEEK and permits only the controlled Seen update', async () => {
    const raw = [
      'From: Sender <sender@example.com>',
      'To: user@gmail.com',
      'Subject: Read only',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Body',
    ].join('\r\n')
    const fixture = scriptedSocket(responseWithMessage(raw))
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new GmailImapClient('user@gmail.com', 'abcdefghijklmnop')

    await client.open()
    await expect(client.getMessage(42)).resolves.toMatchObject({
      message: { subject: 'Read only', body: 'Body' },
    })
    await client.markSeen(42)
    await client.close()

    const commands = fixture.commands()
    expect(commands).toContain(`ID ("name" "OmniMail" "version" "${packageMetadata.version}"`)
    expect(commands).toContain('EXAMINE INBOX')
    expect(commands).toContain('UID FETCH 42 (UID BODY.PEEK[])')
    expect(commands).toContain('SELECT INBOX')
    expect(commands).toContain('UID STORE 42 +FLAGS.SILENT (\\Seen)')
    expect(commands).not.toMatch(/\bMOVE\b|\bCOPY\b|\bEXPUNGE\b|\bAPPEND\b/)
  })

  it('uses bounded UID search and parses UIDNEXT for incremental sync', async () => {
    const fixture = scriptedSocket([
      '* OK Gmail ready',
      '* CAPABILITY IMAP4rev1 X-GM-EXT-1',
      'A0001 OK CAPABILITY',
      'A0002 OK LOGIN',
      '* CAPABILITY IMAP4rev1 X-GM-EXT-1',
      'A0003 OK CAPABILITY',
      '* ID NIL',
      'A0004 OK ID',
      '* 2 EXISTS',
      '* OK [UIDVALIDITY 123] UIDs valid',
      '* OK [UIDNEXT 9001] Predicted next UID',
      'A0005 OK EXAMINE',
      '* SEARCH 8998 9000',
      'A0006 OK SEARCH',
      '* SEARCH 8998 9000',
      'A0007 OK SEARCH',
      '* BYE',
      'A0008 OK LOGOUT',
      '',
    ].join('\r\n'))
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new GmailImapClient('user@gmail.com', 'app-password')

    await client.open()
    const mailbox = await client.examineInbox()
    expect(mailbox.uidNext).toBe(9001)
    await expect(client.searchLatestUids(mailbox.uidNext, 2)).resolves.toEqual([8998, 9000])
    await expect(client.searchAfter(8990, mailbox.uidNext, 20)).resolves.toEqual({
      uids: [8998, 9000], scannedThrough: 9000,
    })
    await client.close()

    const commands = fixture.commands()
    expect(commands).toContain('UID SEARCH UID 8501:9000')
    expect(commands).toContain('UID SEARCH UID 8991:9000')
    expect(commands).not.toContain('UID SEARCH ALL')
  })
})
