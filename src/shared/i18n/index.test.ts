import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  detectLocale,
  ensureEnglishTranslations,
  hasEnglishTranslation,
  translate,
} from './index'

beforeAll(() => ensureEnglishTranslations())

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    if (entry.name.startsWith('i18n-en-')) return []
    return [path]
  })
}

function staticTranslationKeys(source: string): string[] {
  const singleQuoted = [...source.matchAll(/\bt\(\s*'((?:\\.|[^'\\])*)'/g)]
  const doubleQuoted = [...source.matchAll(/\bt\(\s*"((?:\\.|[^"\\])*)"/g)]
  return [...singleQuoted, ...doubleQuoted].map((match) => (
    match[1].replace(/\\(['"\\])/g, '$1')
  ))
}

describe('locale detection', () => {
  it('prefers a saved language', () => {
    expect(detectLocale('en-US', ['zh-CN'])).toBe('en-US')
  })

  it('uses Chinese for Chinese browser languages', () => {
    expect(detectLocale(null, ['zh-Hans-CN', 'en-US'])).toBe('zh-CN')
  })

  it('uses English for other browser languages', () => {
    expect(detectLocale(null, ['fr-FR'])).toBe('en-US')
  })
})

describe('translation', () => {
  it('translates known strings and interpolates values', () => {
    expect(translate('已复制：{address}', { address: 'hello@example.com' }, 'en-US'))
      .toBe('Copied: hello@example.com')
    expect(translate('切换为 {language}', { language: 'English' }, 'en-US'))
      .toBe('Switch to English')
    expect(translate('邮件详情', {}, 'en-US')).toBe('Message details')
    expect(translate('复制邮箱地址：{address}', { address: 'a@b.com' }, 'en-US'))
      .toBe('Copy mailbox address: a@b.com')
    expect(translate('API 使用', {}, 'en-US')).toBe('API guide')
  })

  it('keeps unknown strings as a safe fallback', () => {
    expect(translate('OmniMail', {}, 'en-US')).toBe('OmniMail')
  })

  it('has an English translation for every direct Chinese UI string', () => {
    const missing = [...new Set(sourceFiles('src')
      .flatMap((filename) => staticTranslationKeys(readFileSync(filename, 'utf8'))
        .filter((key) => !hasEnglishTranslation(key))
        .map((key) => `${filename}: ${key}`)))]
      .sort()

    expect(missing).toEqual([])
  })
})
