import { describe, expect, it } from 'vitest'
import {
  hasProcessingMail,
  nextRefreshDelay,
  processingMessageReady,
} from './useAutoRefresh'

describe('adaptive mail refresh', () => {
  it('backs off unchanged polls up to two minutes', () => {
    expect(nextRefreshDelay(30, 30, false)).toBe(60)
    expect(nextRefreshDelay(60, 30, false)).toBe(120)
    expect(nextRefreshDelay(120, 30, false)).toBe(120)
  })

  it('returns to the configured interval after a change', () => {
    expect(nextRefreshDelay(120, 30, true)).toBe(30)
    expect(nextRefreshDelay(120, 30)).toBe(30)
  })

  it('uses fast refresh only while mail is processing', () => {
    expect(hasProcessingMail([{ id: 'message-1', status: 'processing' }])).toBe(true)
    expect(hasProcessingMail([{ id: 'message-1', status: 'ready' }])).toBe(false)
  })

  it('reloads an open processing message when its list status changes', () => {
    const ready = { id: 'message-1', status: 'ready' }
    expect(processingMessageReady('processing', ready)).toBe(true)
    expect(processingMessageReady('ready', ready)).toBe(false)
    expect(processingMessageReady('processing', undefined)).toBe(false)
  })
})
