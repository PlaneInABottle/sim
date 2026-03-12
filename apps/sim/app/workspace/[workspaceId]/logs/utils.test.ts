import { describe, expect, it } from 'vitest'
import { getDisplayStatus, STATUS_CONFIG } from './utils'

describe('logs utils paused status', () => {
  it('maps paused to a dedicated display status', () => {
    expect(getDisplayStatus('paused')).toBe('paused')
  })

  it('exposes paused status config for badges and filters', () => {
    expect(STATUS_CONFIG.paused).toEqual({
      variant: 'blue',
      label: 'Paused',
      color: '#3b82f6',
    })
  })

  it('keeps unknown statuses on the info fallback', () => {
    expect(getDisplayStatus('unexpected-status')).toBe('info')
  })
})
