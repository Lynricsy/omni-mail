import { connect } from 'cloudflare:sockets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NaverMailImapClient } from './naver-mail-imap'

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

function scriptedSocket(replies: string) {
  const writes: Uint8Array[] = []
  const readable = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(replies)) },
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

describe('NAVER Mail controlled IMAP boundary', () => {
  beforeEach(() => vi.mocked(connect).mockReset())

  it('uses only the fixed TLS endpoint, bounded UID search, and exact Seen update', async () => {
    const fixture = scriptedSocket([
      '* OK NAVER Mail ready',
      '* CAPABILITY IMAP4rev1 ID',
      'A0001 OK CAPABILITY',
      'A0002 OK LOGIN',
      '* CAPABILITY IMAP4rev1 ID',
      'A0003 OK CAPABILITY',
      '* ID NIL',
      'A0004 OK ID',
      '* 2 EXISTS',
      '* OK [UIDVALIDITY 0] UIDs valid',
      '* OK [UIDNEXT 9001] Predicted next UID',
      'A0005 OK EXAMINE',
      '* SEARCH 8998 9000',
      'A0006 OK SEARCH',
      '* 2 EXISTS',
      '* OK [READ-WRITE] Mailbox selected',
      'A0007 OK SELECT',
      'A0008 OK STORE',
      '* BYE',
      'A0009 OK LOGOUT',
      '',
    ].join('\r\n'))
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new NaverMailImapClient('123456789@naver.com', 'app-password')

    await client.open()
    const mailbox = await client.examineInbox()
    expect(mailbox.uidValidity).toBe(2 ** 32)
    await expect(client.searchLatestUids(mailbox.uidNext, 2)).resolves.toEqual([8998, 9000])
    await client.markSeen(9000)
    await client.close()

    expect(connect).toHaveBeenCalledWith(
      { hostname: 'imap.naver.com', port: 993 },
      { secureTransport: 'on', allowHalfOpen: false },
    )
    const commands = fixture.commands()
    expect(commands).toContain('LOGIN "123456789" "app-password"')
    expect(commands).not.toContain('123456789@naver.com')
    expect(commands).toContain('ID ("name" "OmniMail"')
    expect(commands).toContain('UID SEARCH UID 8501:9000')
    expect(commands).toContain('UID STORE 9000 +FLAGS.SILENT (\\Seen)')
    expect(commands).not.toMatch(/X-GM-|\bMOVE\b|\bCOPY\b|\bEXPUNGE\b|\bAPPEND\b/)
  })

  it('does not advance the incremental cursor past UIDs omitted by the batch limit', async () => {
    const fixture = scriptedSocket([
      '* OK NAVER Mail ready',
      '* CAPABILITY IMAP4rev1',
      'A0001 OK CAPABILITY',
      'A0002 OK LOGIN',
      '* CAPABILITY IMAP4rev1',
      'A0003 OK CAPABILITY',
      `* SEARCH ${Array.from({ length: 100 }, (_, index) => index + 1).join(' ')}`,
      'A0004 OK SEARCH',
      '* BYE',
      'A0005 OK LOGOUT',
      '',
    ].join('\r\n'))
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new NaverMailImapClient('123456789@naver.com', 'app-password')

    await client.open()
    const result = await client.searchAfter(0, 1001)
    await client.close()

    expect(result.uids).toHaveLength(20)
    expect(result.uids.at(-1)).toBe(20)
    expect(result.scannedThrough).toBe(20)
  })
})
