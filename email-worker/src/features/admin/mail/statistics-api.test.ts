import { describe, expect, it } from 'vitest'
import { normalizeStatisticsDays, platformUsageEstimate } from './statistics-api'

describe('mail statistics range', () => {
  it('accepts supported ranges', () => {
    expect(normalizeStatisticsDays('7')).toBe(7)
    expect(normalizeStatisticsDays('30')).toBe(30)
    expect(normalizeStatisticsDays('90')).toBe(90)
  })

  it('defaults unsupported values to 30 days', () => {
    expect(normalizeStatisticsDays(null)).toBe(30)
    expect(normalizeStatisticsDays('14')).toBe(30)
    expect(normalizeStatisticsDays('invalid')).toBe(30)
  })
})

describe('free plan usage estimate', () => {
  it('estimates polling, D1, Queue, and primary R2 pressure', () => {
    const usage = platformUsageEstimate({
      refreshInterval: 30,
      messageCount: 1000,
      userCount: 10,
      todayReceived: 20,
      failedAttemptsToday: 2,
      usedBytes: 1024,
    })
    expect(usage.workerRequests.estimatedPerVisibleTab).toBe(2880)
    expect(usage.d1RowsRead.estimatedPerVisibleTab).toBe(374400)
    expect(usage.queueOperations.estimatedToday).toBe(62)
    expect(usage.r2Storage.estimatedPrimaryBytes).toBe(1024)
  })

  it('reports no polling pressure when automatic refresh is disabled', () => {
    const usage = platformUsageEstimate({
      refreshInterval: 0,
      messageCount: 0,
      userCount: 0,
      todayReceived: 0,
      failedAttemptsToday: 0,
      usedBytes: 0,
    })
    expect(usage.workerRequests.estimatedPerVisibleTab).toBe(0)
    expect(usage.d1RowsRead.estimatedPerVisibleTab).toBe(0)
  })
})
