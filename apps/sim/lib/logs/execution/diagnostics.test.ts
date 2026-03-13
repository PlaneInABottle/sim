import { describe, expect, it } from 'vitest'
import { buildExecutionDiagnostics } from '@/lib/logs/execution/diagnostics'

describe('buildExecutionDiagnostics', () => {
  it('derives trace span counts and preserves finalization details', () => {
    const diagnostics = buildExecutionDiagnostics({
      status: 'failed',
      level: 'error',
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '2025-01-01T00:00:05.000Z',
      executionData: {
        traceSpans: [
          {
            id: 'span-1',
            children: [{ id: 'span-1-child' }],
          },
          { id: 'span-2' },
        ],
        lastStartedBlock: { blockId: 'block-1' },
        lastCompletedBlock: { blockId: 'block-2' },
        finalizationPath: 'force_failed',
        completionFailure: 'fallback store failed',
        executionState: { blockStates: {} },
      },
    })

    expect(diagnostics.traceSpanCount).toBe(3)
    expect(diagnostics.hasTraceSpans).toBe(true)
    expect(diagnostics.lastStartedBlock).toEqual({ blockId: 'block-1' })
    expect(diagnostics.lastCompletedBlock).toEqual({ blockId: 'block-2' })
    expect(diagnostics.finalizationPath).toBe('force_failed')
    expect(diagnostics.completionFailure).toBe('fallback store failed')
    expect(diagnostics.errorMessage).toBe('fallback store failed')
    expect(diagnostics.hasExecutionState).toBe(true)
  })

  it('uses explicit trace flags and falls back to final output errors', () => {
    const diagnostics = buildExecutionDiagnostics({
      status: 'completed',
      startedAt: '2025-01-01T00:00:00.000Z',
      executionData: {
        hasTraceSpans: false,
        traceSpanCount: 7,
        finalOutput: { error: 'stored error' },
        finalizationPath: 'not-valid',
      },
    })

    expect(diagnostics.hasTraceSpans).toBe(false)
    expect(diagnostics.traceSpanCount).toBe(7)
    expect(diagnostics.errorMessage).toBe('stored error')
    expect(diagnostics.finalizationPath).toBeUndefined()
    expect(diagnostics.hasExecutionState).toBe(false)
  })
})
