import { describe, expect, it } from 'vitest'
import {
  naverMailAppPasswordField,
  naverMailEmailField,
  naverMailNameField,
} from './naver-mail-api-shared'

describe('NAVER Mail input validation', () => {
  it('accepts only personal naver.com addresses', () => {
    expect(naverMailEmailField(' Owner@NAVER.COM ')).toBe('owner@naver.com')
    expect(() => naverMailEmailField('user@foxmail.com')).toThrow('@naver.com')
    expect(() => naverMailEmailField('user@exmail.naver.com')).toThrow('@naver.com')
    expect(() => naverMailEmailField('naver-user')).toThrow('@naver.com')
  })

  it('keeps the app password opaque while rejecting control characters and oversized input', () => {
    expect(naverMailAppPasswordField(' app-password ')).toBe('app-password')
    expect(() => naverMailAppPasswordField('code\r\nLOGIN')).toThrow('应用专用密码')
    expect(() => naverMailAppPasswordField('\0code')).toThrow('应用专用密码')
    expect(() => naverMailAppPasswordField('x'.repeat(129))).toThrow('应用专用密码')
  })

  it('validates account labels', () => {
    expect(naverMailNameField(' Personal NAVER ')).toBe('Personal NAVER')
    expect(() => naverMailNameField('')).toThrow('1–60')
  })
})
