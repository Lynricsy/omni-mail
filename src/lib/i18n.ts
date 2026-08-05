import { useSyncExternalStore } from 'react'
import { enCore } from './i18n-en-core'
import { enAdmin } from './i18n-en-admin'
import { enAdminMail } from './i18n-en-admin-mail'
import { enInvites } from './i18n-en-invites'
import { enMailFeatures } from './i18n-en-mail-features'
import { enRateLimit } from './i18n-en-rate-limit'
import { enVersion } from './i18n-en-version'
import { enErrors } from './i18n-en-errors'
import { enOauth } from './i18n-en-oauth'
import { enSecurity } from './i18n-en-security'

export type Locale = 'zh-CN' | 'en-US'
export type TranslationValues = Record<string, string | number>

const STORAGE_KEY = 'omnimail-locale'
const listeners = new Set<() => void>()

export function detectLocale(
  stored?: string | null,
  languages: readonly string[] = [],
): Locale {
  if (stored === 'zh-CN' || stored === 'en-US') return stored
  return languages.some((language) => language.toLowerCase().startsWith('zh'))
    ? 'zh-CN'
    : 'en-US'
}

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN'
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }
  return detectLocale(stored, navigator.languages || [navigator.language])
}

let currentLocale = initialLocale()
const english = {
  ...enCore,
  ...enAdmin,
  ...enAdminMail,
  ...enInvites,
  ...enErrors,
  ...enOauth,
  ...enSecurity,
  ...enMailFeatures,
  ...enRateLimit,
  ...enVersion,
}
const englishPlurals: Record<string, [string, string]> = {
  '{count} 个邮箱地址': ['{count} mailbox', '{count} mailboxes'],
  '{count} 个启用地址': ['{count} enabled address', '{count} enabled addresses'],
  '{count} 个已有邮箱会保留': [
    '{count} existing mailbox will remain',
    '{count} existing mailboxes will remain',
  ],
  '{count} 封': ['{count} message', '{count} messages'],
  '{date}：{count} 封': ['{date}: {count} message', '{date}: {count} messages'],
  '{count} 条': ['{count} entry', '{count} entries'],
  '{count} 个邮箱': ['{count} mailbox', '{count} mailboxes'],
  '最多 {count} 个邮箱': ['Up to {count} mailbox', 'Up to {count} mailboxes'],
  '已使用 {count} 个邮箱': ['{count} mailbox used', '{count} mailboxes used'],
  '{count} 天': ['{count} day', '{count} days'],
  '{count} 小时': ['{count} hour', '{count} hours'],
}

function syncDocument(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (description) {
    description.content = locale === 'zh-CN'
      ? 'OmniMail — 简洁、私有的 Cloudflare 域名邮箱。'
      : 'OmniMail — a focused, private domain mailbox on Cloudflare.'
  }
}

syncDocument(currentLocale)

export function getLocale(): Locale {
  return currentLocale
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return
  currentLocale = locale
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // The active page can still switch language without persistence.
  }
  syncDocument(locale)
  listeners.forEach((listener) => listener())
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale)
}

export function translate(
  source: string,
  values: TranslationValues = {},
  locale = currentLocale,
): string {
  if (locale === 'en-US') {
    const count = Number(values.count)
    const plural = englishPlurals[source]
    if (plural && Number.isFinite(count)) {
      const template = count === 1 ? plural[0] : plural[1]
      return template.replace(/\{(\w+)\}/g, (match, key: string) => (
        Object.hasOwn(values, key) ? String(values[key]) : match
      ))
    }
    const domainCount = source.match(/^OmniMail 中已管理 (\d+) 个收件域名。$/)
    if (domainCount) {
      return `OmniMail manages ${domainCount[1]} receiving domain${domainCount[1] === '1' ? '' : 's'}.`
    }
    const mailboxCount = source.match(/^当前已创建 (\d+) 个邮箱地址。$/)
    if (mailboxCount) {
      return `${mailboxCount[1]} mailbox address${mailboxCount[1] === '1' ? '' : 'es'} ha${mailboxCount[1] === '1' ? 's' : 've'} been created.`
    }
  }
  const template = locale === 'en-US' ? english[source] || source : source
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.hasOwn(values, key) ? String(values[key]) : match
  ))
}

export const t = translate
