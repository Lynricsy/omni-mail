import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

import {
  LinuxDoMailSmtpClient,
  LinuxDoMailSmtpError,
  serializeLinuxDoMailMessage,
} from './linux-do-mail-smtp'

function scriptedSocket(replies: string, closeAfterReplies = false) {
  const writes: Uint8Array[] = []
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(replies))
      if (closeAfterReplies) controller.close()
    },
  })
  const writable = new WritableStream<Uint8Array>({
    write(value) { writes.push(value.slice()) },
  })
  const socket = {
    opened: Promise.resolve({ localAddress: null, remoteAddress: null }),
    closed: Promise.resolve(),
    readable,
    writable,
    close: async () => undefined,
    startTls: () => { throw new Error('not used') },
  } as unknown as Socket
  return {
    socket,
    output: () => new TextDecoder().decode(
      writes.reduce((all, value) => {
        const combined = new Uint8Array(all.length + value.length)
        combined.set(all); combined.set(value, all.length)
        return combined
      }, new Uint8Array()),
    ),
  }
}

describe('Linux DO Mail SMTP', () => {
  it('serializes UTF-8 text and fixes the envelope sender', async () => {
    const scripted = scriptedSocket([
      '220 smtp ready',
      '250-mail.linux.do',
      '250 AUTH PLAIN LOGIN',
      '235 authenticated',
      '250 sender accepted',
      '250 recipient accepted',
      '354 send data',
      '250 queued',
      '221 bye',
      '',
    ].join('\r\n'))
    const client = new LinuxDoMailSmtpClient(
      'member@linux.do',
      'revocable-token',
      (() => scripted.socket) as never,
    )

    await client.open()
    await expect(client.send({
      to: 'recipient@example.com',
      subject: '测试邮件',
      text: '.第一行\n第二行',
      html: '<p>.第一行<br>第二行</p>',
    })).resolves.toMatch(/^smtp:.+@linux\.do$/)
    await client.close()

    const output = scripted.output()
    expect(output).toContain('MAIL FROM:<member@linux.do>\r\n')
    expect(output).toContain('RCPT TO:<recipient@example.com>\r\n')
    expect(output).toContain('From: <member@linux.do>\r\n')
    expect(output).toContain('Subject: =?UTF-8?B?')
    expect(output).toContain('\r\n.\r\n')
    expect(output).not.toContain('revocable-token')
  })

  it('marks a connection loss after DATA as delivery-uncertain', async () => {
    const scripted = scriptedSocket([
      '220 smtp ready',
      '250 hello',
      '235 authenticated',
      '250 sender accepted',
      '250 recipient accepted',
      '354 send data',
      '',
    ].join('\r\n'), true)
    const client = new LinuxDoMailSmtpClient(
      'member@linux.do',
      'revocable-token',
      (() => scripted.socket) as never,
    )

    await client.open()
    await expect(client.send({
      to: 'recipient@example.com', subject: 'Subject', text: 'Body', html: '<p>Body</p>',
    })).rejects.toMatchObject<Partial<LinuxDoMailSmtpError>>({
      retryable: false,
      deliveryUncertain: true,
    })
  })

  it('rejects header injection before writing SMTP data', () => {
    expect(() => serializeLinuxDoMailMessage({
      from: 'member@linux.do',
      to: 'recipient@example.com',
      subject: 'Hello\r\nBcc: attacker@example.com',
      text: 'Body',
      html: '<p>Body</p>',
    })).toThrow('邮件头包含无效字符')
  })
})
