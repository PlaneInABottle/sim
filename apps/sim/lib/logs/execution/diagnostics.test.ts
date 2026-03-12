import { describe, expect, it } from 'vitest'
import { buildExecutionDiagnostics } from './diagnostics'

describe('buildExecutionDiagnostics', () => {
  it('includes compact stale cleanup details when present', () => {
    const diagnostics = buildExecutionDiagnostics({
      status: 'completed',
      level: 'info',
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '2025-01-01T00:00:05.000Z',
      executionData: {
        finalizationPath: 'completed',
        staleCleanup: {
          bucket: 'partially-finalized-execution',
          cleanedAt: '2025-01-01T00:10:00.000Z',
          staleThresholdMinutes: 15,
          staleDurationMinutes: 20,
          message: 'cleanup intervened',
          ignoredField: true,
        },
      },
    })

    expect(diagnostics.staleCleanup).toEqual({
      bucket: 'partially-finalized-execution',
      cleanedAt: '2025-01-01T00:10:00.000Z',
      staleThresholdMinutes: 15,
      staleDurationMinutes: 20,
      message: 'cleanup intervened',
    })
  })
})
