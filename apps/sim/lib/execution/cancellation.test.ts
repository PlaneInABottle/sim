import { loggerMock } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRedisClient = vi.fn()
const mockRedisSet = vi.fn()

vi.mock('@sim/logger', () => loggerMock)

vi.mock('@/lib/core/config/redis', () => ({
  getRedisClient: mockGetRedisClient,
}))

import { markExecutionCancelled } from './cancellation'

describe('markExecutionCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns redis_unavailable when no Redis client exists', async () => {
    mockGetRedisClient.mockReturnValue(null)

    await expect(markExecutionCancelled('execution-1')).resolves.toEqual({
      durablyRecorded: false,
      reason: 'redis_unavailable',
    })
  })

  it('returns recorded when Redis write succeeds', async () => {
    mockRedisSet.mockResolvedValue('OK')
    mockGetRedisClient.mockReturnValue({ set: mockRedisSet })

    await expect(markExecutionCancelled('execution-1')).resolves.toEqual({
      durablyRecorded: true,
      reason: 'recorded',
    })
  })

  it('returns redis_write_failed when Redis write throws', async () => {
    mockRedisSet.mockRejectedValue(new Error('set failed'))
    mockGetRedisClient.mockReturnValue({ set: mockRedisSet })

    await expect(markExecutionCancelled('execution-1')).resolves.toEqual({
      durablyRecorded: false,
      reason: 'redis_write_failed',
    })
  })
})
