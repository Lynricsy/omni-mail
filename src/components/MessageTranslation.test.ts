import { describe, expect, it } from 'vitest'
import { translationTarget } from './MessageTranslation'

describe('message translation target', () => {
  it('uses the active interface language', () => {
    expect(translationTarget('zh-CN')).toBe('zh')
    expect(translationTarget('en-US')).toBe('en')
  })
})
