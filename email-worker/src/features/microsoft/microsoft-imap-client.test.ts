import { connect } from 'cloudflare:sockets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MicrosoftImapClient } from './microsoft-imap'

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

function scriptedSocket(lines: string[]) {
  const writes: Uint8Array[] = []
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`${lines.join('\r\n')}\r\n`))
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

describe('Microsoft IMAP authentication boundary', () => {
  beforeEach(() => vi.mocked(connect).mockReset())

  it('uses only the fixed TLS host and XOAUTH2 without LOGIN fallback', async () => {
    const fixture = scriptedSocket([
      '* OK Microsoft ready',
      '* CAPABILITY IMAP4rev1 AUTH=XOAUTH2',
      'A0001 OK CAPABILITY',
      'A0002 OK AUTHENTICATE completed',
      '* BYE',
      'A0003 OK LOGOUT',
    ])
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new MicrosoftImapClient('user@outlook.com', 'oauth2', 'access-token')
    await client.open()
    await client.close()
    expect(connect).toHaveBeenCalledWith(
      { hostname: 'outlook.office365.com', port: 993 },
      { secureTransport: 'on', allowHalfOpen: false },
    )
    const commands = fixture.commands()
    expect(commands).toContain('AUTHENTICATE XOAUTH2 ')
    expect(commands).not.toContain('access-token')
    expect(commands).not.toMatch(/\bLOGIN\b/)
  })

  it('terminates an OAuth error continuation and still never tries password LOGIN', async () => {
    const fixture = scriptedSocket([
      '* OK Microsoft ready',
      '* CAPABILITY IMAP4rev1 AUTH=XOAUTH2',
      'A0001 OK CAPABILITY',
      '+ eyJzdGF0dXMiOiI0MDEifQ==',
      'A0002 NO AUTHENTICATE failed',
    ])
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new MicrosoftImapClient('user@outlook.com', 'oauth2', 'access-token')
    await expect(client.open()).rejects.toMatchObject({ status: 400 })
    const commands = fixture.commands()
    expect(commands).toMatch(/AUTHENTICATE XOAUTH2 [A-Za-z0-9+/=]+\r\n\r\n$/)
    expect(commands).not.toMatch(/\bLOGIN\b/)
  })

  it('allows only the exact Seen flag write in a selected folder', async () => {
    const fixture = scriptedSocket([
      '* OK Microsoft ready',
      '* CAPABILITY IMAP4rev1 AUTH=XOAUTH2',
      'A0001 OK CAPABILITY',
      'A0002 OK AUTHENTICATE completed',
      '* 1 EXISTS',
      '* OK [UIDVALIDITY 42] UIDs valid',
      'A0003 OK SELECT completed',
      'A0004 OK STORE completed',
      '* BYE',
      'A0005 OK LOGOUT',
    ])
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new MicrosoftImapClient('user@outlook.com', 'oauth2', 'access-token')
    await client.open()
    await client.markSeen('Archive "2026"', 7, 42)
    await client.close()

    const commands = fixture.commands()
    expect(commands).toContain('SELECT "Archive \\"2026\\""')
    expect(commands).toContain('UID STORE 7 +FLAGS.SILENT (\\Seen)')
    expect(commands).not.toMatch(/-FLAGS|\\Deleted|\\Flagged/i)
  })

  it('does not write Seen after the folder identity changes', async () => {
    const fixture = scriptedSocket([
      '* OK Microsoft ready',
      '* CAPABILITY IMAP4rev1 AUTH=XOAUTH2',
      'A0001 OK CAPABILITY',
      'A0002 OK AUTHENTICATE completed',
      '* OK [UIDVALIDITY 43] UIDs valid',
      'A0003 OK SELECT completed',
      '* BYE',
      'A0004 OK LOGOUT',
    ])
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new MicrosoftImapClient('user@outlook.com', 'oauth2', 'access-token')
    await client.open()
    await expect(client.markSeen('INBOX', 7, 42)).rejects.toMatchObject({ status: 404 })
    await client.close()

    expect(fixture.commands()).not.toContain('UID STORE')
  })
})
