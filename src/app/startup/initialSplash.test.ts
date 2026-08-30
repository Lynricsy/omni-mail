import { afterEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_SPLASH_DURATION, openingSplashDelay } from './initialSplash'

afterEach(() => vi.useRealTimers())

describe('initial opening splash timing', () => {
  it('keeps the first opening visible for the designed duration', async () => {
    vi.useFakeTimers()
    let finished = false
    const delay = openingSplashDelay(false, false).then(() => { finished = true })
    await vi.advanceTimersByTimeAsync(INITIAL_SPLASH_DURATION - 1)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await delay
    expect(finished).toBe(true)
  })

  it('does not delay retries or reduced-motion users', async () => {
    await expect(openingSplashDelay(true, false)).resolves.toBeUndefined()
    await expect(openingSplashDelay(false, true)).resolves.toBeUndefined()
  })
})
