import { connect } from 'cloudflare:sockets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QqMailSmtpClient } from './qq-mail-smtp'

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
      readable, writable,
      opened: Promise.resolve({ remoteAddress: null, localAddress: null }),
      closed: new Promise<void>(() => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as Socket,
    commands: () => new TextDecoder().decode(Uint8Array.from(
      writes.flatMap((value) => [...value]),
    )),
  }
}

describe('QQ Mail controlled SMTP boundary', () => {
  beforeEach(() => vi.mocked(connect).mockReset())

  it('uses the fixed TLS endpoint, AUTH LOGIN, fixed sender, and one recipient', async () => {
    const fixture = scriptedSocket([
      '220 smtp.qq.com ready',
      '250-smtp.qq.com',
      '250 AUTH LOGIN',
      '334 VXNlcm5hbWU6',
      '334 UGFzc3dvcmQ6',
      '235 Authentication successful',
      '250 Sender accepted',
      '250 Recipient accepted',
      '354 End data with <CR><LF>.<CR><LF>',
      '250 Message accepted',
      '221 Bye',
      '',
    ].join('\r\n'))
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const client = new QqMailSmtpClient('123456789@qq.com', 'authorization-code')

    await client.open()
    await expect(client.send({
      to: 'recipient@example.com', subject: '中文主题', text: '正文', html: '<p>正文</p>',
    })).resolves.toMatch(/^smtp:.+@qq\.com$/)
    await client.close()

    expect(connect).toHaveBeenCalledWith(
      { hostname: 'smtp.qq.com', port: 465 },
      { secureTransport: 'on', allowHalfOpen: false },
    )
    const commands = fixture.commands()
    expect(commands).toContain('AUTH LOGIN\r\n')
    expect(commands).toContain(`${btoa('123456789@qq.com')}\r\n`)
    expect(commands).toContain(`${btoa('authorization-code')}\r\n`)
    expect(commands).toContain('MAIL FROM:<123456789@qq.com>\r\n')
    expect(commands).toContain('RCPT TO:<recipient@example.com>\r\n')
    expect(commands).not.toMatch(/\bBCC:|\bCC:/i)
  })

  it('rejects header injection before writing SMTP envelope commands', async () => {
    const client = new QqMailSmtpClient('123456789@qq.com', 'authorization-code', vi.fn())
    await expect(client.send({
      to: 'recipient@example.com', subject: 'Hello\r\nBcc: attacker@example.com',
      text: 'Body', html: '<p>Body</p>',
    })).rejects.toThrow('邮件头')
  })
})
