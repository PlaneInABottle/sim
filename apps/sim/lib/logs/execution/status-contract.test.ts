import { describe, expect, test } from 'vitest'
import type { ExecutionFinalizationPath, RawExecutionStatus } from '../types'
import { getExecutionStatusContract } from './status-contract'

describe('getExecutionStatusContract', () => {
  test.each<{
    rawStatus: RawExecutionStatus
    finalizationPath?: ExecutionFinalizationPath
    expectedStatus: ReturnType<typeof getExecutionStatusContract>['status']
  }>([
    { rawStatus: 'running', expectedStatus: 'running' },
    { rawStatus: 'pending', expectedStatus: 'pending' },
    { rawStatus: 'pending', finalizationPath: 'paused', expectedStatus: 'paused' },
    { rawStatus: 'completed', finalizationPath: 'paused', expectedStatus: 'paused' },
    { rawStatus: 'completed', finalizationPath: 'completed', expectedStatus: 'completed' },
    {
      rawStatus: 'completed',
      finalizationPath: 'fallback_completed',
      expectedStatus: 'completed',
    },
    { rawStatus: 'failed', finalizationPath: 'force_failed', expectedStatus: 'failed' },
    { rawStatus: 'failed', expectedStatus: 'failed' },
    { rawStatus: 'cancelled', finalizationPath: 'cancelled', expectedStatus: 'cancelled' },
  ])('returns $expectedStatus for raw=$rawStatus finalization=$finalizationPath', (row) => {
    expect(
      getExecutionStatusContract({
        rawStatus: row.rawStatus,
        finalizationPath: row.finalizationPath,
      })
    ).toEqual({
      status: row.expectedStatus,
      rawStatus: row.rawStatus,
    })
  })
})
