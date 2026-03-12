import { beforeEach, describe, expect, it, vi } from 'vitest'

const { completeWorkflowExecutionMock } = vi.hoisted(() => ({
  completeWorkflowExecutionMock: vi.fn(),
}))

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
    completeWorkflowExecution: completeWorkflowExecutionMock,
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps completion best-effort when full completion and fallback both fail', async () => {
    const session = new LoggingSession('workflow-1', 'execution-1', 'api', 'req-1')

    completeWorkflowExecutionMock
      .mockRejectedValueOnce(new Error('success finalize failed'))
      .mockRejectedValueOnce(new Error('cost only failed'))

    await expect(session.safeComplete({ finalOutput: { ok: true } })).resolves.toBeUndefined()

    await expect(
      session.safeCompleteWithError({
        error: { message: 'fallback error finalize' },
      })
    ).resolves.toBeUndefined()

    expect(completeWorkflowExecutionMock).toHaveBeenCalledTimes(2)
  })

  it('reuses the settled completion promise for repeated completion attempts', async () => {
    const session = new LoggingSession('workflow-1', 'execution-1', 'api', 'req-1')

    completeWorkflowExecutionMock
      .mockRejectedValueOnce(new Error('success finalize failed'))
      .mockRejectedValueOnce(new Error('cost only failed'))

    await expect(session.safeComplete({ finalOutput: { ok: true } })).resolves.toBeUndefined()

    await expect(session.safeComplete({ finalOutput: { ok: true } })).resolves.toBeUndefined()

    expect(completeWorkflowExecutionMock).toHaveBeenCalledTimes(2)
  })
})
