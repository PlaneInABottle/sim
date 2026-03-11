import { describe, expect, it, vi } from 'vitest'

vi.mock('@sim/db', () => ({
  db: {},
}))

vi.mock('@sim/db/schema', () => ({
  workflowExecutionLogs: {},
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/logs/execution/logger', () => ({
  executionLogger: {
    startWorkflowExecution: vi.fn(),
    completeWorkflowExecution: vi.fn(),
  },
}))

vi.mock('@/lib/logs/execution/logging-factory', () => ({
  calculateCostSummary: vi.fn().mockReturnValue({
    totalCost: 0,
    totalInputCost: 0,
    totalOutputCost: 0,
    totalTokens: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    baseExecutionCharge: 0,
    modelCost: 0,
    models: {},
  }),
  createEnvironmentObject: vi.fn(),
  createTriggerObject: vi.fn(),
  loadDeployedWorkflowStateForLogging: vi.fn(),
  loadWorkflowStateForExecution: vi.fn(),
}))

import { LoggingSession } from './logging-session'

describe('LoggingSession completion retries', () => {
  it('clears failed completion promise so error finalization can retry', async () => {
    const session = new LoggingSession('workflow-1', 'execution-1', 'api', 'req-1') as any

    const successFinalizeError = new Error('success finalize failed')
    session.complete = vi.fn().mockRejectedValue(successFinalizeError)
    session.completeWithCostOnlyLog = vi.fn().mockRejectedValue(successFinalizeError)
    session.completeWithError = vi.fn().mockResolvedValue(undefined)

    await expect(session.safeComplete({ finalOutput: { ok: true } })).rejects.toThrow(
      'success finalize failed'
    )

    await expect(
      session.safeCompleteWithError({
        error: { message: 'fallback error finalize' },
      })
    ).resolves.toBeUndefined()

    expect(session.complete).toHaveBeenCalledTimes(1)
    expect(session.completeWithCostOnlyLog).toHaveBeenCalledTimes(1)
    expect(session.completeWithError).toHaveBeenCalledTimes(1)
  })
})
