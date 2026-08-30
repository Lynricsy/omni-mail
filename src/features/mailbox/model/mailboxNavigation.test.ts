import { describe, expect, it } from 'vitest'
import { shouldQuietRefreshFolder } from './mailboxNavigation'

describe('folder selection', () => {
  it('quietly refreshes when the active folder is selected again', () => {
    expect(shouldQuietRefreshFolder('inbox', 'inbox', '')).toBe(true)
  })

  it('uses navigation when the folder or search query changes', () => {
    expect(shouldQuietRefreshFolder('inbox', 'sent', '')).toBe(false)
    expect(shouldQuietRefreshFolder('inbox', 'inbox', 'Claude')).toBe(false)
  })
})
