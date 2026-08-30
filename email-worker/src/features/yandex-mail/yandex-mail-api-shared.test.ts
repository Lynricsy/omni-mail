import { describe, expect, it } from 'vitest'
import {
  yandexMailAppPasswordField,
  yandexMailEmailField,
  yandexMailNameField,
} from './yandex-mail-api-shared'

describe('Yandex Mail input validation', () => {
  it('accepts only personal yandex.com addresses', () => {
    expect(yandexMailEmailField(' Owner@Yandex.COM ')).toBe('owner@yandex.com')
    expect(() => yandexMailEmailField('user@foxmail.com')).toThrow('@yandex.com')
    expect(() => yandexMailEmailField('user@exmail.yandex.com')).toThrow('@yandex.com')
    expect(() => yandexMailEmailField('yandex-user')).toThrow('@yandex.com')
  })

  it('keeps the app password opaque while rejecting control characters and oversized input', () => {
    expect(yandexMailAppPasswordField(' app-password ')).toBe('app-password')
    expect(() => yandexMailAppPasswordField('code\r\nLOGIN')).toThrow('应用专用密码')
    expect(() => yandexMailAppPasswordField('\0code')).toThrow('应用专用密码')
    expect(() => yandexMailAppPasswordField('x'.repeat(129))).toThrow('应用专用密码')
  })

  it('validates account labels', () => {
    expect(yandexMailNameField(' Personal Yandex ')).toBe('Personal Yandex')
    expect(() => yandexMailNameField('')).toThrow('1–60')
  })
})
