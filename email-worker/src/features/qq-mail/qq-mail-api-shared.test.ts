import { describe, expect, it } from 'vitest'
import {
  qqMailAuthorizationCodeField,
  qqMailEmailField,
  qqMailIdentityEmailField,
  maskedQqMailEmail,
  qqMailNameField,
} from './qq-mail-api-shared'

describe('QQ Mail input validation', () => {
  it('accepts only personal qq.com addresses', () => {
    expect(qqMailEmailField(' 123456789@QQ.COM ')).toBe('123456789@qq.com')
    expect(() => qqMailEmailField('user@foxmail.com')).toThrow('@qq.com')
    expect(() => qqMailEmailField('user@exmail.qq.com')).toThrow('@qq.com')
    expect(() => qqMailEmailField('qq-user')).toThrow('@qq.com')
  })

  it('accepts only supported QQ Mail sender identities', () => {
    expect(qqMailIdentityEmailField(' Alias@QQ.COM ')).toBe('alias@qq.com')
    expect(qqMailIdentityEmailField('work@foxmail.com')).toBe('work@foxmail.com')
    expect(qqMailIdentityEmailField('member@vip.qq.com')).toBe('member@vip.qq.com')
    expect(() => qqMailIdentityEmailField('user@exmail.qq.com')).toThrow('发信身份')
    expect(() => qqMailIdentityEmailField('user@example.com')).toThrow('发信身份')
  })

  it('keeps the authorization code opaque while rejecting control characters and oversized input', () => {
    expect(qqMailAuthorizationCodeField(' authorization-code ')).toBe('authorization-code')
    expect(() => qqMailAuthorizationCodeField('code\r\nLOGIN')).toThrow('授权码')
    expect(() => qqMailAuthorizationCodeField('\0code')).toThrow('授权码')
    expect(() => qqMailAuthorizationCodeField('x'.repeat(129))).toThrow('授权码')
  })

  it('validates account labels', () => {
    expect(qqMailNameField(' Personal QQ ')).toBe('Personal QQ')
    expect(() => qqMailNameField('')).toThrow('1–60')
  })

  it('masks each address in a recipient list', () => {
    expect(maskedQqMailEmail('first@example.com, second@example.net'))
      .toBe('fi***@example.com, se***@example.net')
  })
})
