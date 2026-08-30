import type {
  ICloudAccountInfo,
  ICloudAlias,
  ICloudHost,
  ICloudMessage,
} from './icloud-types'

const ICLOUD_BUILD_NUMBER = '2630Build35'
const REQUEST_TIMEOUT_MS = 15_000
export const ICLOUD_CREDENTIAL_ERROR_STATUS = 422
export const ICLOUD_CREDENTIAL_ERROR_MESSAGE = 'iCloud Cookie 已失效，或账号未开通 iCloud+、没有 Hide My Email 权限。'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

export class ICloudRemoteError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly definitive = false,
  ) {
    super(message)
  }
}

interface ValidateResponse {
  webservices?: {
    premiummailsettings?: { url?: string }
    mccgateway?: { url?: string }
  }
  dsInfo?: Record<string, unknown>
}

function nonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

export function generatedAliasAddress(value: unknown): string {
  if (typeof value === 'string') {
    const email = value.trim().toLowerCase()
    return email.includes('@') ? email : ''
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const item = value as Record<string, unknown>
  const direct = nonEmpty(item.hme, item.email, item.alias, item.address)
    .trim().toLowerCase()
  if (direct.includes('@')) return direct
  return generatedAliasAddress(item.hme)
}

function ensureAppleUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ICloudRemoteError(502, 'iCloud 返回了无效的服务地址。')
  }
  const hostname = url.hostname.toLowerCase()
  if (
    url.protocol !== 'https:'
    || !(
      hostname === 'icloud.com'
      || hostname.endsWith('.icloud.com')
      || hostname === 'icloud.com.cn'
      || hostname.endsWith('.icloud.com.cn')
    )
  ) throw new ICloudRemoteError(502, 'iCloud 返回的服务地址不在允许域名内。')
  url.port = ''
  return url
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value.startsWith('"') ? value : `"${value}"`}`)
    .join('; ')
}

function setCookieValues(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] }
  const values = extended.getSetCookie?.()
  if (values?.length) return values
  const fallback = headers.get('set-cookie')
  return fallback ? fallback.split(/,(?=\s*[^;,=]+=[^;,]*)/) : []
}

function mergeSetCookies(cookies: Record<string, string>, headers: Headers): void {
  for (const setCookie of setCookieValues(headers)) {
    const pair = setCookie.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator).trim()
    let value = pair.slice(separator + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (name && value) cookies[name] = value
  }
}

function nestedObjectArray(value: unknown): Record<string, unknown>[] | undefined {
  if (
    Array.isArray(value)
    && value.length > 0
    && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))
  ) return value as Record<string, unknown>[]
  if (!value || typeof value !== 'object') return undefined
  for (const child of Object.values(value)) {
    const found = nestedObjectArray(child)
    if (found) return found
  }
  return undefined
}

export function parseICloudAliases(value: unknown): ICloudAlias[] {
  const root = value as { result?: { hmeEmails?: unknown } }
  const source = Array.isArray(root?.result?.hmeEmails)
    ? root.result.hmeEmails as Record<string, unknown>[]
    : nestedObjectArray(value) || []
  const aliases = source.flatMap((item): ICloudAlias[] => {
    const metadata = item.metaData && typeof item.metaData === 'object'
      ? item.metaData as Record<string, unknown>
      : {}
    const email = nonEmpty(item.hme, item.email, item.alias, item.address, metadata.hme)
      .trim().toLowerCase()
    if (!email.includes('@')) return []
    const state = nonEmpty(item.state, item.status).toLowerCase()
    let active = state !== 'inactive' && state !== 'deleted'
    if (typeof item.active === 'boolean') active = item.active && active
    if (typeof item.isActive === 'boolean') active = item.isActive && active
    return [{
      email,
      anonymousId: nonEmpty(item.anonymousId, item.id),
      label: nonEmpty(item.label, metadata.label),
      active,
      createdAt: nonEmpty(item.createTimestamp, item.createdAt) || undefined,
    }]
  })
  return aliases.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1
    return left.email.localeCompare(right.email)
  })
}

function stripHtml(value: string): string {
  return value
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<\s*(?:br\s*\/?|\/p|\/div|\/tr|li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export class ICloudClient {
  readonly cookies: Record<string, string>
  readonly clientId: string
  private dsid = ''
  private serviceUrl = ''
  private mccGatewayUrl = ''

  constructor(
    cookies: Record<string, string>,
    private readonly host: ICloudHost,
    clientId = crypto.randomUUID(),
  ) {
    this.cookies = { ...cookies }
    this.clientId = clientId
  }

  private origin(): string {
    return `https://www.${this.host}`
  }

  private buildUrl(rawUrl: string): string {
    const url = ensureAppleUrl(rawUrl)
    url.searchParams.set('clientBuildNumber', ICLOUD_BUILD_NUMBER)
    url.searchParams.set('clientMasteringNumber', ICLOUD_BUILD_NUMBER)
    url.searchParams.set('clientId', this.clientId)
    if (this.dsid) url.searchParams.set('dsid', this.dsid)
    return url.toString()
  }

  private async request<T>(
    method: string,
    rawUrl: string,
    body?: unknown,
    retryable = method === 'GET',
  ): Promise<T> {
    const fullUrl = this.buildUrl(rawUrl)
    const hostname = new URL(fullUrl).hostname
    let lastError: unknown
    const attempts = retryable ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const headers = new Headers({
        Accept: hostname.includes('maildomainws') ? '*/*' : 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Content-Type': hostname.includes('maildomainws') ? 'text/plain' : 'application/json',
        Cookie: cookieHeader(this.cookies),
        Origin: this.origin(),
        Referer: `${this.origin()}/`,
        'User-Agent': USER_AGENT,
      })
      try {
        const response = await fetch(fullUrl, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        mergeSetCookies(this.cookies, response.headers)
        const text = await response.text()
        if (!response.ok) {
          const error = new ICloudRemoteError(
            response.status === 401 || response.status === 403 ? ICLOUD_CREDENTIAL_ERROR_STATUS : 502,
            response.status === 401 || response.status === 403
              ? ICLOUD_CREDENTIAL_ERROR_MESSAGE
              : `iCloud 请求失败（HTTP ${response.status}）。`,
            response.status < 500 && response.status !== 429,
          )
          if (error.status === ICLOUD_CREDENTIAL_ERROR_STATUS) throw error
          if (!retryable || error.definitive) throw error
          lastError = error
          continue
        }
        try {
          return JSON.parse(text) as T
        } catch {
          throw new ICloudRemoteError(502, 'iCloud 返回了无法解析的 JSON。')
        }
      } catch (error) {
        if (error instanceof ICloudRemoteError
          && error.status === ICLOUD_CREDENTIAL_ERROR_STATUS) throw error
        if (error instanceof ICloudRemoteError && error.definitive) throw error
        lastError = error instanceof DOMException
          && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? new ICloudRemoteError(504, '连接 iCloud 超时。')
          : error
      }
    }
    if (lastError instanceof ICloudRemoteError) throw lastError
    throw new ICloudRemoteError(
      502,
      '连接 iCloud 失败。',
    )
  }

  async validate(): Promise<ICloudAccountInfo> {
    const data = await this.request<ValidateResponse>(
      'POST',
      `https://setup.${this.host}/setup/ws/1/validate`,
      undefined,
      true,
    )
    const serviceUrl = data.webservices?.premiummailsettings?.url
    if (!serviceUrl) throw new ICloudRemoteError(ICLOUD_CREDENTIAL_ERROR_STATUS, ICLOUD_CREDENTIAL_ERROR_MESSAGE)
    this.serviceUrl = ensureAppleUrl(serviceUrl).toString().replace(/\/$/, '')
    const mccUrl = data.webservices?.mccgateway?.url
    if (mccUrl) {
      const normalized = mccUrl.startsWith('https://') ? mccUrl : `https://${mccUrl}`
      this.mccGatewayUrl = ensureAppleUrl(normalized).toString().replace(/\/$/, '')
    }
    const info = data.dsInfo || {}
    this.dsid = nonEmpty(info.dsid)
    return {
      dsid: this.dsid,
      appleId: nonEmpty(info.appleId, info.primaryEmail, info.appleIdEmail),
      primaryEmail: nonEmpty(info.primaryEmail, info.appleId),
    }
  }

  private async ensureService(): Promise<void> {
    if (!this.serviceUrl) await this.validate()
  }

  async listAliases(): Promise<ICloudAlias[]> {
    await this.ensureService()
    return parseICloudAliases(await this.request<unknown>('GET', `${this.serviceUrl}/v2/hme/list`))
  }

  async generateAlias(): Promise<string> {
    await this.ensureService()
    const generated = await this.request<Record<string, any>>(
      'POST',
      `${this.serviceUrl}/v1/hme/generate`,
      { langCode: 'en-us' },
    )
    if (!generated.success) throw new ICloudRemoteError(502, 'iCloud 无法生成隐藏邮箱。')
    const email = generatedAliasAddress(generated.result)
    if (!email) throw new ICloudRemoteError(502, 'iCloud 响应中没有隐藏邮箱地址。')
    return email
  }

  async reserveAlias(
    email: string,
    label: string,
  ): Promise<{ email: string; label: string; createdAt: string }> {
    const normalizedEmail = generatedAliasAddress(email)
    if (!/^[^@\s]{1,64}@icloud\.com$/.test(normalizedEmail)) {
      throw new ICloudRemoteError(400, '隐藏邮箱地址无效。', true)
    }
    await this.ensureService()
    const finalLabel = label || `OmniMail ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
    const reserved = await this.request<Record<string, any>>(
      'POST',
      `${this.serviceUrl}/v1/hme/reserve`,
      { hme: normalizedEmail, label: finalLabel, note: 'Created by OmniMail' },
    )
    if (!reserved.success) throw new ICloudRemoteError(502, 'iCloud 无法保留隐藏邮箱。')
    return {
      email: generatedAliasAddress(reserved.result) || normalizedEmail,
      label: finalLabel,
      createdAt: new Date().toISOString(),
    }
  }

  async createAlias(label: string): Promise<{ email: string; label: string; createdAt: string }> {
    return this.reserveAlias(await this.generateAlias(), label)
  }

  private async aliasAction(action: string, anonymousId: string): Promise<void> {
    await this.ensureService()
    const data = await this.request<Record<string, any>>(
      'POST',
      `${this.serviceUrl}/v1/hme/${action}`,
      { anonymousId },
    )
    if (!data.success) throw new ICloudRemoteError(502, `iCloud ${action} 操作失败。`, true)
  }

  deactivate(anonymousId: string): Promise<void> {
    return this.aliasAction('deactivate', anonymousId)
  }

  reactivate(anonymousId: string): Promise<void> {
    return this.aliasAction('reactivate', anonymousId)
  }

  async delete(anonymousId: string): Promise<void> {
    try {
      await this.aliasAction('delete', anonymousId)
    } catch (firstError) {
      if (!(firstError instanceof ICloudRemoteError) || !firstError.definitive) {
        throw firstError
      }
      await this.aliasAction('deactivate', anonymousId).catch(() => undefined)
      try {
        await this.aliasAction('delete', anonymousId)
      } catch {
        throw firstError
      }
    }
  }

  async listWebInbox(limit: number): Promise<ICloudMessage[]> {
    if (!this.mccGatewayUrl) await this.validate()
    if (!this.mccGatewayUrl) throw new ICloudRemoteError(502, 'iCloud 响应中没有邮件服务地址。')
    const data = await this.request<Record<string, any>>(
      'POST',
      `${this.mccGatewayUrl}/mailws2/v1/thread/search`,
      {
        responseType: 'THREAD_DIGEST',
        includeFolderStatus: true,
        maxResults: limit,
        sessionHeaders: {
          folder: 'INBOX', modseq: null, threadmodseq: null,
          condstore: 1, qresync: 1, threadmode: 1,
        },
      },
      true,
    )
    if (data.success === false) throw new ICloudRemoteError(502, 'iCloud Web 邮件接口返回失败。')
    return (Array.isArray(data.threadList) ? data.threadList : [])
      .slice(0, limit)
      .map((thread: Record<string, any>) => {
        const body = stripHtml(nonEmpty(thread.preview))
        return {
          id: nonEmpty(thread.threadId),
          from: Array.isArray(thread.senders) ? nonEmpty(thread.senders[0]) : '',
          to: '',
          subject: nonEmpty(thread.subject),
          preview: body.length > 400 ? `${body.slice(0, 400)}…` : body,
          body: body.length > 12_000 ? `${body.slice(0, 12_000)}…` : body,
          html: '',
          date: Number(thread.timestamp) > 0
            ? new Date(Number(thread.timestamp)).toISOString()
            : '',
        }
      })
  }
}
