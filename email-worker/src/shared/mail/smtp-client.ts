import { connect } from 'cloudflare:sockets'

const CONNECT_TIMEOUT_MS = 10_000
const COMMAND_TIMEOUT_MS = 20_000
const CLOSE_TIMEOUT_MS = 2_000
const MAX_REPLY_BYTES = 65_536
const encoder = new TextEncoder()

export type SmtpAttachment = { filename: string; contentType: string; content: string }
export type SmtpMessage = {
  from: string
  to: string
  subject: string
  text: string
  html: string
  attachments?: SmtpAttachment[]
  inReplyTo?: string
  references?: string
}
export type SmtpEndpoint = {
  host: string
  port: number
  serviceLabel: string
  credentialLabel: string
  messageIdDomain: string
  auth: 'plain' | 'login'
}

export class ControlledSmtpError extends Error {
  constructor(message: string, readonly retryable: boolean,
    readonly deliveryUncertain = false, readonly credentialFailure = false) {
    super(message)
    this.name = 'ControlledSmtpError'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function utf8Base64(value: string): string {
  return bytesToBase64(encoder.encode(value))
}

function wrapBase64(value: string): string {
  return value.replace(/\s+/g, '').match(/.{1,76}/g)?.join('\r\n') || ''
}

function encodedHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  const segments: string[] = []
  let current = ''
  for (const character of value) {
    if (encoder.encode(current + character).length > 30 && current) {
      segments.push(current)
      current = character
    } else current += character
  }
  if (current) segments.push(current)
  return segments.map((segment) => `=?UTF-8?B?${utf8Base64(segment)}?=`).join('\r\n ')
}

function safeContentType(value: string): string {
  return /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(value)
    ? value : 'application/octet-stream'
}

function attachmentPart(attachment: SmtpAttachment): string {
  const filename = encodeURIComponent(attachment.filename.replace(/[\r\n]/g, '') || 'attachment')
  return [
    `Content-Type: ${safeContentType(attachment.contentType)}; name*=UTF-8''${filename}`,
    `Content-Disposition: attachment; filename*=UTF-8''${filename}`,
    'Content-Transfer-Encoding: base64', '', wrapBase64(attachment.content),
  ].join('\r\n')
}

function optionalHeader(name: string, value: string | undefined): string[] {
  if (!value) return []
  if (/[\r\n\0]/.test(value)) throw new ControlledSmtpError(`${name} 包含无效字符。`, false)
  return [`${name}: ${value}`]
}

export function serializeSmtpMessage(message: SmtpMessage,
  options: { date?: Date; messageId?: string; messageIdDomain: string }) {
  if (/[\r\n\0]/.test(message.subject) || /[<>\r\n\0]/.test(message.from)
    || /[<>\r\n\0]/.test(message.to) || !/^[a-z0-9.-]+$/i.test(options.messageIdDomain)) {
    throw new ControlledSmtpError('邮件头包含无效字符。', false)
  }
  const messageId = options.messageId || `${crypto.randomUUID()}@${options.messageIdDomain}`
  const alternativeBoundary = `omnimail_alt_${crypto.randomUUID().replaceAll('-', '')}`
  const alternative = [
    `--${alternativeBoundary}`, 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', wrapBase64(utf8Base64(message.text)),
    `--${alternativeBoundary}`, 'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', wrapBase64(utf8Base64(message.html)),
    `--${alternativeBoundary}--`,
  ].join('\r\n')
  const attachments = message.attachments ?? []
  const contentHeaders: string[] = []
  let content = alternative
  if (attachments.length) {
    const mixedBoundary = `omnimail_mix_${crypto.randomUUID().replaceAll('-', '')}`
    contentHeaders.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
    content = [
      `--${mixedBoundary}`, `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      '', alternative,
      ...attachments.flatMap((attachment) => [`--${mixedBoundary}`, attachmentPart(attachment)]),
      `--${mixedBoundary}--`,
    ].join('\r\n')
  } else contentHeaders.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`)
  const headers = [
    `From: <${message.from}>`, `To: <${message.to}>`,
    `Subject: ${encodedHeader(message.subject)}`,
    `Date: ${(options.date || new Date()).toUTCString()}`, `Message-ID: <${messageId}>`,
    ...optionalHeader('In-Reply-To', message.inReplyTo),
    ...optionalHeader('References', message.references), 'MIME-Version: 1.0', ...contentHeaders,
  ]
  return { raw: `${headers.join('\r\n')}\r\n\r\n${content}\r\n`, messageId }
}

function smtpData(raw: string): Uint8Array {
  const normalized = raw.replace(/\r?\n/g, '\r\n').replace(/\r(?!\n)/g, '\r\n')
  const terminated = normalized.endsWith('\r\n') ? normalized : `${normalized}\r\n`
  return encoder.encode(`${terminated.replace(/(^|\r\n)\./g, '$1..')}.\r\n`)
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number,
  onTimeout: () => void, message: string, uncertain = false): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(new ControlledSmtpError(message, !uncertain, uncertain))
    }, timeoutMs)
  })
  try { return await Promise.race([operation, timeout]) } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

class SocketReader {
  private buffer = new Uint8Array(0)
  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  private async fill(): Promise<void> {
    const { value, done } = await this.reader.read()
    if (done || !value) throw new Error('SMTP connection closed')
    if (this.buffer.length + value.length > MAX_REPLY_BYTES) throw new Error('SMTP reply exceeded limit')
    const combined = new Uint8Array(this.buffer.length + value.length)
    combined.set(this.buffer)
    combined.set(value, this.buffer.length)
    this.buffer = combined
  }

  async line(): Promise<string> {
    for (;;) {
      for (let index = 0; index < this.buffer.length - 1; index += 1) {
        if (this.buffer[index] === 13 && this.buffer[index + 1] === 10) {
          const line = new TextDecoder().decode(this.buffer.slice(0, index))
          this.buffer = this.buffer.slice(index + 2)
          return line
        }
      }
      await this.fill()
    }
  }
}

type SmtpReply = { code: number; lines: string[] }
export type SmtpSocketFactory = typeof connect

export class ControlledSmtpClient {
  private socket?: Socket
  private reader?: SocketReader
  private writer?: WritableStreamDefaultWriter<Uint8Array>
  constructor(private readonly username: string, private readonly password: string,
    private readonly endpoint: SmtpEndpoint,
    private readonly socketFactory: SmtpSocketFactory = connect) {}

  private abort(): void {
    const socket = this.socket
    this.socket = undefined
    this.reader = undefined
    this.writer = undefined
    if (socket) void socket.close().catch(() => undefined)
  }

  private async readReply(): Promise<SmtpReply> {
    if (!this.reader) throw new Error('SMTP reader is not ready')
    const first = await this.reader.line()
    const match = first.match(/^(\d{3})([- ])(.*)$/)
    if (!match) throw new Error('Invalid SMTP response')
    const code = Number(match[1])
    const lines = [first]
    if (match[2] === '-') {
      for (let count = 0; count < 50; count += 1) {
        const line = await this.reader.line()
        lines.push(line)
        if (line.startsWith(`${code} `)) return { code, lines }
      }
      throw new Error('SMTP multiline response exceeded limit')
    }
    return { code, lines }
  }

  private async reply(accepted: number[], failureMessage: string,
    uncertain = false, timeoutMs = COMMAND_TIMEOUT_MS): Promise<SmtpReply> {
    let result: SmtpReply
    try {
      result = await withTimeout(this.readReply(), timeoutMs, () => this.abort(),
        uncertain ? 'SMTP 投递结果不确定。' : `${this.endpoint.serviceLabel} SMTP 请求超时。`, uncertain)
    } catch (error) {
      if (error instanceof ControlledSmtpError) throw error
      this.abort()
      throw new ControlledSmtpError(
        uncertain ? 'SMTP 投递结果不确定。' : `${this.endpoint.serviceLabel} SMTP 连接意外关闭。`,
        !uncertain, uncertain)
    }
    if (accepted.includes(result.code)) return result
    const credentialFailure = [534, 535].includes(result.code)
    throw new ControlledSmtpError(
      credentialFailure ? `SMTP 登录失败，请检查${this.endpoint.credentialLabel}。` : failureMessage,
      result.code >= 400 && result.code < 500, false, credentialFailure)
  }

  private async write(value: string | Uint8Array, uncertain = false): Promise<void> {
    if (!this.writer) throw new ControlledSmtpError('SMTP 尚未连接。', false)
    try {
      await withTimeout(this.writer.write(typeof value === 'string' ? encoder.encode(value) : value),
        COMMAND_TIMEOUT_MS, () => this.abort(),
        uncertain ? 'SMTP 投递结果不确定。' : `${this.endpoint.serviceLabel} SMTP 写入超时。`, uncertain)
    } catch (error) {
      if (error instanceof ControlledSmtpError) throw error
      this.abort()
      throw new ControlledSmtpError(
        uncertain ? 'SMTP 投递结果不确定。' : `${this.endpoint.serviceLabel} SMTP 写入失败。`,
        !uncertain, uncertain)
    }
  }

  private async command(command: string, accepted: number[], failureMessage: string) {
    if (/[\r\n\0]/.test(command)) throw new ControlledSmtpError('SMTP 命令包含无效字符。', false)
    await this.write(`${command}\r\n`)
    return this.reply(accepted, failureMessage)
  }

  private async authenticate(): Promise<void> {
    const failure = `SMTP 登录失败，请检查${this.endpoint.credentialLabel}。`
    if (this.endpoint.auth === 'login') {
      await this.command('AUTH LOGIN', [334], failure)
      await this.command(utf8Base64(this.username), [334], failure)
      await this.command(utf8Base64(this.password), [235], failure)
      return
    }
    const auth = utf8Base64(`\0${this.username}\0${this.password}`)
    const response = await this.command(`AUTH PLAIN ${auth}`, [235, 334], failure)
    if (response.code === 334) await this.command(auth, [235], failure)
  }

  async open(): Promise<void> {
    try {
      this.socket = this.socketFactory(
        { hostname: this.endpoint.host, port: this.endpoint.port },
        { secureTransport: 'on', allowHalfOpen: false })
      await withTimeout(this.socket.opened, CONNECT_TIMEOUT_MS, () => this.abort(),
        `${this.endpoint.serviceLabel} SMTP 连接超时。`)
      this.reader = new SocketReader(this.socket.readable.getReader())
      this.writer = this.socket.writable.getWriter()
      await this.reply([220], `${this.endpoint.serviceLabel} SMTP 服务未就绪。`)
      await this.command('EHLO omnimail.invalid', [250], `${this.endpoint.serviceLabel} SMTP 握手失败。`)
      await this.authenticate()
    } catch (error) {
      this.abort()
      if (error instanceof ControlledSmtpError) throw error
      throw new ControlledSmtpError(`连接${this.endpoint.serviceLabel} SMTP 失败。`, true)
    }
  }

  async send(message: Omit<SmtpMessage, 'from'>): Promise<string> {
    if (/[<>\r\n\0]/.test(this.username) || /[<>\r\n\0]/.test(message.to)) {
      throw new ControlledSmtpError('发件或收件地址包含无效字符。', false)
    }
    const serialized = serializeSmtpMessage({ ...message, from: this.username },
      { messageIdDomain: this.endpoint.messageIdDomain })
    await this.command(`MAIL FROM:<${this.username}>`, [250], 'SMTP 服务拒绝了发件地址。')
    await this.command(`RCPT TO:<${message.to}>`, [250, 251], 'SMTP 服务拒绝了收件地址。')
    await this.command('DATA', [354], 'SMTP 服务拒绝接收邮件内容。')
    await this.write(smtpData(serialized.raw), true)
    await this.reply([250], 'SMTP 服务拒绝了邮件内容。', true)
    return `smtp:${serialized.messageId}`
  }

  async close(): Promise<void> {
    const socket = this.socket
    if (!socket) return
    try {
      await this.write('QUIT\r\n')
      await this.reply([221], 'SMTP 退出失败。', false, CLOSE_TIMEOUT_MS)
    } catch { /* close below */ }
    this.socket = undefined
    this.reader = undefined
    this.writer = undefined
    await socket.close().catch(() => undefined)
  }
}
