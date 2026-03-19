/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import { resolveRemoteParentUpdatePosition } from '@/hooks/use-collaborative-workflow.utils'

describe('resolveRemoteParentUpdatePosition', () => {
  it('prefers the remote payload position when provided', () => {
    expect(resolveRemoteParentUpdatePosition({ x: 100, y: 200 }, { x: 10, y: 20 })).toEqual({
      x: 100,
      y: 200,
    })
  })

  it('falls back to the current local position when payload position is missing', () => {
    expect(resolveRemoteParentUpdatePosition(undefined, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 })
  })
})
