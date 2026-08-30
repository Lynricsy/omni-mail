import { describe, expect, it } from 'vitest'
import { messageEnterDelay } from './MessageList'

describe('message list entrance motion', () => {
  it('uses a short stagger capped after the first six messages', () => {
    expect(messageEnterDelay(-1)).toBe('0ms')
    expect(messageEnterDelay(0)).toBe('0ms')
    expect(messageEnterDelay(3)).toBe('66ms')
    expect(messageEnterDelay(5)).toBe('110ms')
    expect(messageEnterDelay(20)).toBe('110ms')
  })
})
