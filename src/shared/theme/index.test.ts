import { describe, expect, it } from 'vitest'
import { normalizeThemePreference, resolveTheme } from './index'

describe('theme preference', () => {
  it('keeps explicit choices and defaults unknown values to system', () => {
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('system')).toBe('system')
    expect(normalizeThemePreference('unknown')).toBe('system')
  })

  it('resolves system preference while preserving explicit choices', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
