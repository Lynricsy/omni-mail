import { describe, expect, it } from 'vitest'
import { resolveTooltipPosition } from './TooltipLayer'

const anchor = {
  top: 100,
  right: 140,
  bottom: 140,
  left: 100,
  width: 40,
  height: 40,
}

describe('tooltip positioning', () => {
  it('prefers the space above the control', () => {
    expect(resolveTooltipPosition(
      anchor,
      { width: 120, height: 36 },
      { width: 800, height: 600 },
    ).side).toBe('top')
  })

  it('moves below a control near the top edge', () => {
    const result = resolveTooltipPosition(
      { ...anchor, top: 4, bottom: 44 },
      { width: 120, height: 36 },
      { width: 800, height: 600 },
    )
    expect(result.side).toBe('bottom')
    expect(result.top).toBe(53)
  })

  it('keeps the tooltip inside the horizontal viewport', () => {
    const result = resolveTooltipPosition(
      { ...anchor, left: 2, right: 42 },
      { width: 160, height: 36 },
      { width: 320, height: 600 },
    )
    expect(result.left).toBe(10)
    expect(result.arrowLeft).toBeGreaterThanOrEqual(11)
  })
})
