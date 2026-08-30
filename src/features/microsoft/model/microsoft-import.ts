import type { MicrosoftImportAccount } from '../../../shared/api'

export type MicrosoftImportMode = 'oauth2' | 'oauth2_combination'
export type MicrosoftImportPreview = {
  line: number
  email: string
  mode: MicrosoftImportMode | null
  clientIdMasked: string
  status: 'ready' | 'duplicate' | 'error'
  error: string
}

export type ParsedMicrosoftImport = {
  preview: MicrosoftImportPreview
  input: MicrosoftImportAccount
}

export const MICROSOFT_IMPORT_FORMATS = [
  'email----password----refresh_token----client_id',
  'email--------refresh_token----client_id',
] as const
export const MICROSOFT_IMPORT_ALTERNATE_FORMAT =
  'email----password----client_id----refresh_token'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function maskedClientId(value: string): string {
  return value ? `${value.slice(0, 4)}••••${value.slice(-4)}` : ''
}

function invalid(line: number, email: string, error: string): ParsedMicrosoftImport {
  return {
    preview: {
      line,
      email,
      mode: null,
      clientIdMasked: '',
      status: 'error',
      error,
    },
    input: { email, authMode: 'oauth2', refreshToken: '', clientId: '' },
  }
}

export function parseMicrosoftImportText(value: string): ParsedMicrosoftImport[] {
  const rows: ParsedMicrosoftImport[] = []
  const seen = new Set<string>()
  for (const [offset, raw] of value.split(/\r?\n/).entries()) {
    const line = offset + 1
    const normalizedLine = raw.replace(/^\uFEFF/, '').trim()
    if (!normalizedLine) continue
    const fields = normalizedLine.split('----')
    const email = (fields[0] || '').trim().toLowerCase()
    if (fields.length === 2) {
      rows.push(invalid(line, email,
        '仅邮箱密码登录已停用；请提供 refresh token 与 Client ID。'))
      continue
    }
    if (fields.length !== 4) {
      rows.push(invalid(line, email, '字段数量无效；若密码包含 ----，请改用分字段输入。'))
      continue
    }
    if (!EMAIL.test(email)) {
      rows.push(invalid(line, email, '邮箱地址格式无效。'))
      continue
    }
    const password = fields[1]
    const oauthFields = fields.slice(2)
    const clientIdMatches = oauthFields.map((field) => UUID.test(field.trim()))
    if (clientIdMatches.filter(Boolean).length !== 1) {
      rows.push(invalid(line, email,
        '最后两段必须且只能有一个合法 Client ID UUID；两段顺序均可。'))
      continue
    }
    const clientIdIndex = clientIdMatches[0] ? 0 : 1
    const clientId = oauthFields[clientIdIndex].trim().toLowerCase()
    const refreshToken = oauthFields[1 - clientIdIndex]
    if (!refreshToken) {
      rows.push(invalid(line, email, 'OAuth2 格式需要 refresh token。'))
      continue
    }
    const duplicate = seen.has(email)
    seen.add(email)
    rows.push({
      preview: {
        line,
        email,
        mode: password ? 'oauth2_combination' : 'oauth2',
        clientIdMasked: maskedClientId(clientId),
        status: duplicate ? 'duplicate' : 'ready',
        error: '',
      },
      input: {
        email,
        authMode: 'oauth2',
        refreshToken,
        clientId,
        authority: 'common',
        password: password || undefined,
        persistPasswordConfirmed: undefined,
      },
    })
  }
  return rows
}
