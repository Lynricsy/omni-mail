import { connect } from 'cloudflare:sockets'
import { ImapConnectionError } from './imap-errors'
import { encodeXOAuth2, quoteImapValue } from './imap-values'

export { ImapConnectionError } from './imap-errors'
export { encodeXOAuth2, quoteImapValue } from './imap-values'

const CONNECT_TIMEOUT_MS = 10_000
const COMMAND_TIMEOUT_MS = 20_000
const CLOSE_TIMEOUT_MS = 2_000
const MAX_LINE_BYTES = 1_048_576
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024
const encoder = new TextEncoder()

export interface ImapCommandResult {
  lines: string[]
  literals: Array<{ line: string; data: Uint8Array }>
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(new ImapConnectionError(504, message))
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

class SocketReader {
  private buffer = new Uint8Array(0)

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  private async fill(): Promise<void> {
    const { value, done } = await this.reader.read()
    if (done || !value) throw new ImapConnectionError(502, 'IMAP 连接意外关闭。')
    const combined = new Uint8Array(this.buffer.length + value.length)
    combined.set(this.buffer)
    combined.set(value, this.buffer.length)
    this.buffer = combined
  }

  async exactly(length: number): Promise<Uint8Array> {
    while (this.buffer.length < length) await this.fill()
    const output = this.buffer.slice(0, length)
    this.buffer = this.buffer.slice(length)
    return output
  }

  async line(): Promise<string> {
    for (;;) {
      for (let index = 0; index < this.buffer.length - 1; index += 1) {
        if (this.buffer[index] === 13 && this.buffer[index + 1] === 10) {
          if (index > MAX_LINE_BYTES) {
            throw new ImapConnectionError(502, 'IMAP 响应行超过读取上限。')
          }
          const line = new TextDecoder().decode(this.buffer.slice(0, index))
          this.buffer = this.buffer.slice(index + 2)
          return line
        }
      }
      if (this.buffer.length > MAX_LINE_BYTES) {
        throw new ImapConnectionError(502, 'IMAP 响应行超过读取上限。')
      }
      await this.fill()
    }
  }
}

export class ImapConnection {
  private socket?: Socket
  private reader?: SocketReader
  private writer?: WritableStreamDefaultWriter<Uint8Array>
  private tagNumber = 0

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly serviceLabel: string,
    private readonly credentialHint: string,
    private readonly maximumLiteralBytes: number,
  ) {}

  private abort(): void {
    const socket = this.socket
    this.socket = undefined
    this.reader = undefined
    this.writer = undefined
    if (socket) void socket.close().catch(() => undefined)
  }

  private async connectAndGreet(): Promise<void> {
    this.socket = connect(
      { hostname: this.host, port: this.port },
      { secureTransport: 'on', allowHalfOpen: false },
    )
    await withTimeout(
      this.socket.opened,
      CONNECT_TIMEOUT_MS,
      () => this.abort(),
      `${this.serviceLabel} 连接超时。`,
    )
    this.reader = new SocketReader(this.socket.readable.getReader())
    this.writer = this.socket.writable.getWriter()
    const greeting = await withTimeout(
      this.reader.line(),
      CONNECT_TIMEOUT_MS,
      () => this.abort(),
      `${this.serviceLabel} 连接超时。`,
    )
    if (!greeting.startsWith('* OK')) {
      throw new ImapConnectionError(502, `${this.serviceLabel} 服务未就绪。`, true)
    }
  }

  async open(username: string, password: string): Promise<void> {
    try {
      await this.connectAndGreet()
      await this.command('CAPABILITY')
      let loginCommand = ''
      try {
        loginCommand = `LOGIN ${quoteImapValue(username)} ${quoteImapValue(password)}`
      } catch (error) {
        throw new ImapConnectionError(
          400,
          error instanceof Error ? error.message : 'IMAP 登录信息包含无效字符。',
          true,
        )
      }
      await this.command(loginCommand, 401)
    } catch (error) {
      this.abort()
      if (error instanceof ImapConnectionError && error.status === 401) {
        throw new ImapConnectionError(400, `IMAP 登录失败，请检查${this.credentialHint}。`, true)
      }
      if (error instanceof ImapConnectionError) throw error
      throw new ImapConnectionError(502, `连接${this.serviceLabel}失败。`)
    }
  }

  async openOAuth2(username: string, accessToken: string): Promise<void> {
    try {
      await this.connectAndGreet()
      const capability = await this.command('CAPABILITY')
      if (!capability.lines.some((line) => /\bAUTH=XOAUTH2\b/i.test(line))) {
        throw new ImapConnectionError(502, 'IMAP 服务未提供 XOAUTH2 认证。', true)
      }
      let response = ''
      try {
        response = encodeXOAuth2(username, accessToken)
      } catch (error) {
        throw new ImapConnectionError(
          400,
          error instanceof Error ? error.message : 'IMAP OAuth2 登录信息包含无效字符。',
          true,
        )
      }
      await this.command(`AUTHENTICATE XOAUTH2 ${response}`, 401, COMMAND_TIMEOUT_MS, '')
    } catch (error) {
      this.abort()
      if (error instanceof ImapConnectionError && error.status === 401) {
        throw new ImapConnectionError(400, 'IMAP OAuth2 认证失败。', true)
      }
      if (error instanceof ImapConnectionError) throw error
      throw new ImapConnectionError(502, `连接${this.serviceLabel}失败。`)
    }
  }

  async close(): Promise<void> {
    const socket = this.socket
    if (!socket) return
    try { await this.command('LOGOUT', 502, CLOSE_TIMEOUT_MS) } catch { /* close below */ }
    this.socket = undefined
    this.reader = undefined
    this.writer = undefined
    try {
      await withTimeout(socket.close(), CLOSE_TIMEOUT_MS, () => undefined, '关闭 IMAP 连接超时。')
    } catch { /* socket may already be closed */ }
  }

  async command(
    command: string,
    failureStatus = 502,
    timeoutMs = COMMAND_TIMEOUT_MS,
    continuationResponse?: string,
  ): Promise<ImapCommandResult> {
    if (!this.reader || !this.writer) {
      throw new ImapConnectionError(500, 'IMAP 尚未连接。', true)
    }
    const operation = (async () => {
      const tag = `A${String(++this.tagNumber).padStart(4, '0')}`
      await this.writer!.write(encoder.encode(`${tag} ${command}\r\n`))
      const result: ImapCommandResult = { lines: [], literals: [] }
      let responseBytes = 0
      let pendingLiteral: number | null = null
      let continuationSent = false
      for (;;) {
        const line = await this.reader!.line()
        responseBytes += encoder.encode(line).byteLength + 2
        if (responseBytes > MAX_RESPONSE_BYTES) {
          throw new ImapConnectionError(502, 'IMAP 响应超过读取上限。')
        }
        if (pendingLiteral !== null) {
          if (line && !line.startsWith('* ') && !line.startsWith(`${tag} `)) {
            result.literals[pendingLiteral].line += ` ${line}`
          }
          if (line) pendingLiteral = null
        }
        result.lines.push(line)
        if (line.startsWith('+')) {
          if (continuationResponse === undefined || continuationSent) {
            throw new ImapConnectionError(502, 'IMAP 服务返回了意外的继续响应。')
          }
          continuationSent = true
          await this.writer!.write(encoder.encode(`${continuationResponse}\r\n`))
          continue
        }
        const literal = line.match(/\{(\d+)\}$/)
        if (literal) {
          const length = Number(literal[1])
          if (!Number.isSafeInteger(length) || length > this.maximumLiteralBytes) {
            throw new ImapConnectionError(502, '邮件内容超过单封读取上限。')
          }
          responseBytes += length
          if (responseBytes > MAX_RESPONSE_BYTES) {
            throw new ImapConnectionError(502, 'IMAP 响应超过读取上限。')
          }
          result.literals.push({ line, data: await this.reader!.exactly(length) })
          pendingLiteral = result.literals.length - 1
        }
        if (line.startsWith(`${tag} `)) {
          if (!line.startsWith(`${tag} OK`)) {
            throw new ImapConnectionError(
              failureStatus,
              failureStatus === 401 ? 'IMAP 服务拒绝了登录凭据。' : 'IMAP 命令失败。',
              true,
            )
          }
          return result
        }
      }
    })()
    try {
      return await withTimeout(
        operation,
        timeoutMs,
        () => this.abort(),
        `${this.serviceLabel} 请求超时。`,
      )
    } catch (error) {
      if (error instanceof ImapConnectionError) {
        if (!error.definitive) this.abort()
        throw error
      }
      this.abort()
      throw new ImapConnectionError(502, `${this.serviceLabel} 连接失败。`)
    }
  }
}
