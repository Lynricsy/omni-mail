export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiGroupId =
  | 'system'
  | 'auth'
  | 'mailboxes'
  | 'messages'
  | 'drafts'
  | 'icloud'
  | 'gmail'
  | 'microsoft'
  | 'qqMail'
  | 'naverMail'
  | 'yandexMail'
  | 'linuxdoMail'
  | 'adminOperations'
  | 'adminAccess'
  | 'adminSettings'

export type ApiAuth =
  | 'public'
  | 'optional'
  | 'authenticated'
  | 'cookie'
  | 'admin'
  | 'superAdmin'
  | 'webhook'

export type LocalizedText = {
  zh: string
  en: string
}

export type ApiEndpoint = {
  method: ApiMethod
  path: string
  group: ApiGroupId
  auth: ApiAuth
  title: LocalizedText
  description: LocalizedText
  request: string
  response: string
  examplePath?: string
  exampleBody?: unknown
  formFields?: Record<string, string>
  extraHeaders?: Record<string, string>
  outputFile?: string
  notes?: LocalizedText[]
}

export function localized(zh: string, en: string): LocalizedText {
  return { zh, en }
}
