import { describe, expect, it } from 'vitest'
import type { ICloudAlias } from '../../../shared/api'
import { sortICloudAliases } from './ICloudScopeSwitcher'

function alias(email: string, label: string, createdAt?: string, active = true): ICloudAlias {
  return { email, label, createdAt, active, anonymousId: email }
}

describe('iCloud alias sorting', () => {
  const aliases = [
    alias('third@icloud.com', 'GITHUB11', '2026-08-20T00:00:00Z'),
    alias('first@icloud.com', 'GITHUB3', '2026-08-22T00:00:00Z'),
    alias('second@icloud.com', 'GITHUB9', '2026-08-21T00:00:00Z'),
  ]

  it('sorts labels using natural number order', () => {
    expect(sortICloudAliases(aliases, 'label').map((item) => item.label))
      .toEqual(['GITHUB3', 'GITHUB9', 'GITHUB11'])
  })

  it('sorts newest aliases first', () => {
    expect(sortICloudAliases(aliases, 'newest').map((item) => item.email))
      .toEqual(['first@icloud.com', 'second@icloud.com', 'third@icloud.com'])
  })

  it('keeps inactive aliases after active aliases', () => {
    const inactive = alias('aaa@icloud.com', 'A', '2026-08-23T00:00:00Z', false)
    expect(sortICloudAliases([inactive, ...aliases], 'email').at(-1)).toBe(inactive)
  })
})
