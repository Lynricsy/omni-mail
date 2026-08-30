import { describe, expect, it } from 'vitest'
import { parseICloudCookies, publicICloudAccount } from './icloud-store'
import type { ICloudAccount } from './icloud-types'

describe('iCloud account storage boundary', () => {
  it('accepts Cookie header and JSON object formats', () => {
    expect(parseICloudCookies('a=1; b=two=three')).toEqual({ a: '1', b: 'two=three' })
    expect(parseICloudCookies('quoted="value"')).toEqual({ quoted: 'value' })
    expect(parseICloudCookies('{"session":"secret"}')).toEqual({ session: 'secret' })
  })

  it('rejects empty or invalid Cookie input', () => {
    expect(() => parseICloudCookies('')).toThrow('请填写')
    expect(() => parseICloudCookies('{}')).toThrow('没有可用值')
    expect(() => parseICloudCookies('not-a-cookie')).toThrow('无法解析')
  })

  it('rejects oversized or header-injecting Cookie input', () => {
    expect(() => parseICloudCookies({ session: 'ok\r\nX-Test: injected' }))
      .toThrow('无效名称或值')
    expect(() => parseICloudCookies({ session: 'x'.repeat(8 * 1024 + 1) }))
      .toThrow('无效名称或值')
    expect(() => parseICloudCookies(Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`cookie-${index}`, 'value']),
    ))).toThrow('不能超过 64 个')
  })

  it('never exposes credentials or user ownership in public accounts', () => {
    const account: ICloudAccount = {
      id: 'icloud-1', userId: 'user-1', name: 'Personal', realEmail: '',
      icloudEmail: '', cookies: { session: 'secret' }, host: 'icloud.com',
      appPassword: 'app-secret', status: 'active', aliasTotal: 2, aliasActive: 1,
      lastValidated: '', lastError: '', createdAt: '2026-08-13T00:00:00.000Z',
    }
    const result = publicICloudAccount(account)

    expect(result).toMatchObject({ hasCookies: true, hasAppPassword: true })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(result).not.toHaveProperty('userId')
  })
})
