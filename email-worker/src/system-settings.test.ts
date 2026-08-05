import { describe, expect, it } from 'vitest'
import {
  parseMailRefreshInterval,
  parseRemoteImagesEnabled,
  parseUnassignedMailEnabled,
} from './system-settings'

describe('mail refresh settings', () => {
  it('accepts only the supported refresh intervals', () => {
    expect(parseMailRefreshInterval(0)).toBe(0)
    expect(parseMailRefreshInterval(5)).toBe(5)
    expect(parseMailRefreshInterval(30)).toBe(30)
    expect(parseMailRefreshInterval(120)).toBe(120)
  })

  it('rejects unsupported or incorrectly typed intervals', () => {
    expect(parseMailRefreshInterval(15)).toBeNull()
    expect(parseMailRefreshInterval(-1)).toBeNull()
    expect(parseMailRefreshInterval('30')).toBeNull()
    expect(parseMailRefreshInterval(undefined)).toBeNull()
  })
})

describe('remote image settings', () => {
  it('accepts only boolean values from the administrator request', () => {
    expect(parseRemoteImagesEnabled(true)).toBe(true)
    expect(parseRemoteImagesEnabled(false)).toBe(false)
  })

  it('rejects string and missing values', () => {
    expect(parseRemoteImagesEnabled('true')).toBeNull()
    expect(parseRemoteImagesEnabled(1)).toBeNull()
    expect(parseRemoteImagesEnabled(undefined)).toBeNull()
  })
})

describe('unassigned mail settings', () => {
  it('accepts only boolean values from the administrator request', () => {
    expect(parseUnassignedMailEnabled(true)).toBe(true)
    expect(parseUnassignedMailEnabled(false)).toBe(false)
    expect(parseUnassignedMailEnabled('true')).toBeNull()
    expect(parseUnassignedMailEnabled(undefined)).toBeNull()
  })
})
