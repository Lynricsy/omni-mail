import { describe, expect, it } from 'vitest'
import { detectLocale, translate } from './i18n'

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
  })

  it('keeps unknown strings as a safe fallback', () => {
    expect(translate('OmniMail', {}, 'en-US')).toBe('OmniMail')
  })
})
