/**
 * @vitest-environment node
 */

import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const {
  mockVerifyCronAuth,
  mockSelectQueue,
  mockUpdateSets,
  mockUpdateWheres,
  mockUpdateResultsQueue,
  mockDeleteReturning,
  mockGetMaxExecutionTimeout,
  mockGetAsyncBackendType,
} = vi.hoisted(() => {
  const mockSelectQueue: unknown[][] = []
  const mockUpdateSets: unknown[] = []
  const mockUpdateWheres: Array<{ table: unknown; where: unknown }> = []
  const mockUpdateResultsQueue: Array<unknown[] | Error> = []
  const mockDeleteReturning = vi.fn().mockResolvedValue([])

  return {
    mockVerifyCronAuth: vi.fn().mockReturnValue(null),
    mockSelectQueue,
    mockUpdateSets,
    mockUpdateWheres,
    mockUpdateResultsQueue,
    mockDeleteReturning,
    mockGetMaxExecutionTimeout: vi.fn().mockReturnValue(10 * 60 * 1000),
    mockGetAsyncBackendType: vi.fn().mockReturnValue('database'),
  }
})

function shiftSelectResult() {
  return mockSelectQueue.shift() ?? []
}

function shiftUpdateResult() {
  const nextResult = mockUpdateResultsQueue.shift()
  if (nextResult instanceof Error) {
    throw nextResult
  }

  return nextResult ?? [{ id: 'updated-1' }]
}

vi.mock('@/lib/auth/internal', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}))

vi.mock('@/lib/core/execution-limits', () => ({
  getMaxExecutionTimeout: mockGetMaxExecutionTimeout,
}))

vi.mock('@/lib/core/async-jobs', async () => {
  const actual = await vi.importActual('@/lib/core/async-jobs')

  return {
    ...actual,
    getAsyncBackendType: mockGetAsyncBackendType,
  }
})

vi.mock('@sim/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ type: 'inArray', field, values })),
  isNull: vi.fn((field: unknown) => ({ type: 'isNull', field })),
  lt: vi.fn((field: unknown, value: unknown) => ({ type: 'lt', field, value })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  sql: vi.fn((strings: unknown, ...values: unknown[]) => ({ type: 'sql', strings, values })),
}))

vi.mock('@sim/db/schema', () => ({
  workflowExecutionLogs: {
    id: 'workflowExecutionLogs.id',
    executionId: 'workflowExecutionLogs.executionId',
    workflowId: 'workflowExecutionLogs.workflowId',
    startedAt: 'workflowExecutionLogs.startedAt',
    endedAt: 'workflowExecutionLogs.endedAt',
    executionData: 'workflowExecutionLogs.executionData',
    status: 'workflowExecutionLogs.status',
  },
  pausedExecutions: {
    id: 'pausedExecutions.id',
    executionId: 'pausedExecutions.executionId',
    status: 'pausedExecutions.status',
    resumedCount: 'pausedExecutions.resumedCount',
    totalPauseCount: 'pausedExecutions.totalPauseCount',
    pausePoints: 'pausedExecutions.pausePoints',
  },
  resumeQueue: {
    id: 'resumeQueue.id',
    parentExecutionId: 'resumeQueue.parentExecutionId',
    status: 'resumeQueue.status',
    contextId: 'resumeQueue.contextId',
  },
}))

vi.mock('@sim/db', () => {
  const createSelectBuilder = () => {
    const builder = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => shiftSelectResult()),
      then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve(shiftSelectResult()).then(resolve, reject),
    }

    return builder
  }

  const update = vi.fn((table: unknown) => {
    const updateReturning = vi.fn(async () => shiftUpdateResult())

    const updateWhere = vi.fn((where: unknown) => {
      mockUpdateWheres.push({ table, where })
      return { returning: updateReturning }
    })

    const updateSet = vi.fn((payload: unknown) => {
      mockUpdateSets.push(payload)
      return { where: updateWhere }
    })

    return { set: updateSet }
  })

  const deleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }))
  const deleteFn = vi.fn(() => ({ where: deleteWhere }))

  return {
    asyncJobs: {
      id: 'asyncJobs.id',
      status: 'asyncJobs.status',
      type: 'asyncJobs.type',
      createdAt: 'asyncJobs.createdAt',
      startedAt: 'asyncJobs.startedAt',
      completedAt: 'asyncJobs.completedAt',
      attempts: 'asyncJobs.attempts',
      error: 'asyncJobs.error',
      metadata: 'asyncJobs.metadata',
      payload: 'asyncJobs.payload',
      output: 'asyncJobs.output',
      updatedAt: 'asyncJobs.updatedAt',
    },
    db: {
      select: vi.fn(() => createSelectBuilder()),
      update,
      delete: deleteFn,
    },
  }
})

function createMockRequest(): NextRequest {
  return {
    headers: {
      get: () => 'Bearer test-cron-secret',
    },
    url: 'http://localhost:3000/api/cron/cleanup-stale-executions',
  } as unknown as NextRequest
}

function queueSelectResults(...results: unknown[][]) {
  mockSelectQueue.length = 0
  mockSelectQueue.push(...results)
}

function queueUpdateResults(...results: Array<unknown[] | Error>) {
  mockUpdateResultsQueue.length = 0
  mockUpdateResultsQueue.push(...results)
}

const NOW = new Date('2026-03-12T00:00:00.000Z')
const STALE_STARTED_AT = new Date('2026-03-11T23:40:00.000Z')

function createExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    executionId: 'execution-1',
    workflowId: 'workflow-1',
    startedAt: STALE_STARTED_AT,
    endedAt: null,
    executionData: {},
    ...overrides,
  }
}

function createPausedExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'paused-1',
    executionId: 'execution-1',
    status: 'paused',
    resumedCount: 0,
    totalPauseCount: 1,
    pausePoints: {},
    ...overrides,
  }
}

function createResumeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resume-1',
    parentExecutionId: 'execution-1',
    status: 'pending',
    contextId: 'ctx-1',
    ...overrides,
  }
}

function createAsyncJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    status: 'processing',
    type: 'workflow-execution',
    createdAt: STALE_STARTED_AT,
    startedAt: STALE_STARTED_AT,
    completedAt: null,
    attempts: 1,
    error: null,
    metadata: {},
    payload: {},
    output: null,
    ...overrides,
  }
}

function getExecutionUpdates() {
  return mockUpdateSets.filter(
    (payload): payload is Record<string, unknown> =>
      typeof payload === 'object' && payload !== null && 'totalDurationMs' in payload
  )
}

function getAsyncJobUpdates() {
  return mockUpdateSets.filter(
    (payload): payload is Record<string, unknown> =>
      typeof payload === 'object' &&
      payload !== null &&
      'metadata' in payload &&
      !('totalDurationMs' in payload)
  )
}

function getExecutionWhereClauses() {
  return mockUpdateWheres.filter(
    ({ table }) => typeof table === 'object' && table !== null && 'executionData' in table
  )
}

function getAsyncJobWhereClauses() {
  return mockUpdateWheres.filter(
    ({ table }) => typeof table === 'object' && table !== null && 'metadata' in table
  )
}

describe('cleanup stale executions cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectQueue.length = 0
    mockUpdateResultsQueue.length = 0
    mockUpdateSets.length = 0
    mockUpdateWheres.length = 0
    mockDeleteReturning.mockResolvedValue([])
    mockGetAsyncBackendType.mockReturnValue('database')
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks abandoned running executions as failed with cleanup metadata', async () => {
    queueUpdateResults([{ id: 'log-1' }])
    queueSelectResults([createExecution()], [], [], [])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(1)
    expect(data.executions.classified).toBe(1)
    expect(data.executions.mutated).toBe(1)
    expect(data.executions.skipped).toBe(0)
    expect(data.executions.noOp).toBe(0)
    expect(data.executions.buckets['abandoned-running-execution']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(1)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        level: 'error',
        status: 'failed',
        endedAt: NOW,
        totalDurationMs: NOW.getTime() - STALE_STARTED_AT.getTime(),
      })
    )
    expect(getExecutionUpdates()[0].executionData).toEqual(
      expect.objectContaining({
        error: 'Execution terminated: abandoned running execution after 20 minutes',
        staleCleanup: {
          bucket: 'abandoned-running-execution',
          cleanedAt: NOW.toISOString(),
          staleThresholdMinutes: 15,
          staleDurationMinutes: 20,
          message: 'Execution terminated: abandoned running execution after 20 minutes',
        },
      })
    )
    expect(getExecutionWhereClauses()).toHaveLength(1)
    expect(getExecutionWhereClauses()[0].where).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'eq',
            field: 'workflowExecutionLogs.id',
            value: 'log-1',
          }),
          expect.objectContaining({
            type: 'eq',
            field: 'workflowExecutionLogs.status',
            value: 'running',
          }),
          expect.objectContaining({ type: 'lt', field: 'workflowExecutionLogs.startedAt' }),
          expect.objectContaining({ type: 'isNull', field: 'workflowExecutionLogs.endedAt' }),
        ]),
      })
    )
  })

  it('reports paused awaiting resume executions without mutating them', async () => {
    queueSelectResults(
      [createExecution()],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 2 })],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(0)
    expect(data.executions.classified).toBe(1)
    expect(data.executions.mutated).toBe(0)
    expect(data.executions.skipped).toBe(1)
    expect(data.executions.noOp).toBe(0)
    expect(data.executions.buckets['paused-awaiting-resume']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(0)
  })

  it('reports resume in flight executions without destructive mutation', async () => {
    queueSelectResults([createExecution()], [], [createResumeEntry({ status: 'claimed' })], [])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(0)
    expect(data.executions.classified).toBe(1)
    expect(data.executions.mutated).toBe(0)
    expect(data.executions.skipped).toBe(1)
    expect(data.executions.noOp).toBe(0)
    expect(data.executions.buckets['resume-in-flight']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(0)
  })

  it('prioritizes partial finalization over pause and resume evidence', async () => {
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalOutput: {}, traceSpans: [{ id: 'span-1' }] },
        }),
      ],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 2 })],
      [createResumeEntry({ status: 'claimed' })],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.buckets['partially-finalized-execution']).toBe(1)
    expect(data.executions.buckets['resume-in-flight']).toBe(0)
    expect(data.executions.buckets['paused-awaiting-resume']).toBe(0)
    expect(getExecutionUpdates()).toHaveLength(1)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        endedAt: new Date('2026-03-11T23:55:00.000Z'),
      })
    )
  })

  it('prioritizes resume in flight over paused awaiting resume', async () => {
    queueSelectResults(
      [createExecution()],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 2 })],
      [createResumeEntry({ status: 'pending' })],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.buckets['resume-in-flight']).toBe(1)
    expect(data.executions.buckets['paused-awaiting-resume']).toBe(0)
    expect(getExecutionUpdates()).toHaveLength(0)
  })

  it('normalizes partially finalized executions with completed evidence', async () => {
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalOutput: {} },
        }),
      ],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(1)
    expect(data.executions.buckets['partially-finalized-execution']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(1)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        endedAt: new Date('2026-03-11T23:55:00.000Z'),
      })
    )
  })

  it('normalizes partially finalized executions to completed from finalization path', async () => {
    queueUpdateResults([{ id: 'log-1' }])
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'completed', finalOutput: {} },
        }),
      ],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(1)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        level: 'info',
        status: 'completed',
        endedAt: new Date('2026-03-11T23:55:00.000Z'),
      })
    )
    expect(getExecutionUpdates()[0].executionData).toEqual(
      expect.objectContaining({
        finalizationPath: 'completed',
        finalOutput: {},
        staleCleanup: {
          bucket: 'partially-finalized-execution',
          cleanedAt: NOW.toISOString(),
          staleThresholdMinutes: 15,
          staleDurationMinutes: 20,
          message: 'Execution classified as partially-finalized-execution',
        },
      })
    )
    expect(getExecutionUpdates()[0].executionData).not.toHaveProperty('error')
  })

  it('normalizes partially finalized executions to cancelled from finalization path', async () => {
    queueUpdateResults([{ id: 'log-1' }])
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'cancelled', finalOutput: { cancelled: true } },
        }),
      ],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    await response.json()

    expect(response.status).toBe(200)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        level: 'info',
        status: 'cancelled',
        endedAt: new Date('2026-03-11T23:55:00.000Z'),
      })
    )
    expect(getExecutionUpdates()[0].executionData).toEqual(
      expect.objectContaining({
        finalizationPath: 'cancelled',
        finalOutput: { cancelled: true },
        staleCleanup: {
          bucket: 'partially-finalized-execution',
          cleanedAt: NOW.toISOString(),
          staleThresholdMinutes: 15,
          staleDurationMinutes: 20,
          message: 'Execution classified as partially-finalized-execution',
        },
      })
    )
    expect(getExecutionUpdates()[0].executionData).not.toHaveProperty('error')
  })

  it('falls back to failed for unclassifiable partially finalized executions', async () => {
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { traceSpans: [{ id: 'span-1' }] },
        }),
      ],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    await response.json()

    expect(response.status).toBe(200)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        endedAt: new Date('2026-03-11T23:55:00.000Z'),
      })
    )
  })

  it('preserves paused partial finalization instead of forcing failed', async () => {
    queueUpdateResults([{ id: 'log-1' }])
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'paused', finalOutput: { paused: true } },
        }),
      ],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 1 })],
      [],
      []
    )

    const response = await GET(createMockRequest())
    await response.json()

    expect(response.status).toBe(200)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        level: 'info',
        status: 'completed',
        endedAt: new Date('2026-03-11T23:55:00.000Z'),
      })
    )
  })

  it('classifies stale-cleaned paused rows as paused parent truth without changing persisted write mapping', async () => {
    queueUpdateResults([{ id: 'job-1' }])
    queueSelectResults(
      [],
      [createAsyncJob({ metadata: { correlation: { executionId: 'execution-1' } } })],
      [
        createExecution({
          executionId: 'execution-1',
          status: 'completed',
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'paused', finalOutput: { paused: true } },
        }),
      ],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 1 })],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.buckets['paused-handoff-processing-job']).toBe(1)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(0)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('derives partial-finalization duration from observed endedAt', async () => {
    queueUpdateResults([{ id: 'log-1' }])
    queueSelectResults(
      [
        createExecution({
          startedAt: new Date('2026-03-11T23:40:00.000Z'),
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'completed', finalOutput: {} },
        }),
      ],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    await response.json()

    expect(response.status).toBe(200)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        totalDurationMs: 15 * 60 * 1000,
      })
    )
  })

  it('recognizes payload-only execution correlation before classifying async jobs', async () => {
    queueSelectResults(
      [],
      [createAsyncJob({ payload: { executionId: 'execution-1' } })],
      [createExecution({ executionId: 'execution-1', status: 'failed', endedAt: NOW })],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.classified).toBe(1)
    expect(data.asyncJobs.mutated).toBe(1)
    expect(data.asyncJobs.mutatedToFailed).toBe(1)
    expect(data.asyncJobs.skipped).toBe(0)
    expect(data.asyncJobs.noOp).toBe(0)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
    expect(getAsyncJobUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        completedAt: NOW,
        updatedAt: NOW,
        metadata: {
          staleCleanup: {
            bucket: 'orphaned-processing-job',
            cleanedAt: NOW.toISOString(),
            staleThresholdMinutes: 15,
            correlationSource: 'payload',
            correlationFields: ['payload.executionId'],
            executionId: 'execution-1',
          },
        },
        error: 'Job terminated: stale processing job had no correlated live execution evidence',
      })
    )
    expect(getAsyncJobWhereClauses()).toHaveLength(1)
    expect(getAsyncJobWhereClauses()[0].where).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ type: 'eq', field: 'asyncJobs.id', value: 'job-1' }),
          expect.objectContaining({
            type: 'eq',
            field: 'asyncJobs.status',
            value: 'processing',
          }),
          expect.objectContaining({ type: 'isNull', field: 'asyncJobs.completedAt' }),
          expect.objectContaining({ type: 'lt', field: 'asyncJobs.startedAt' }),
        ]),
      })
    )
  })

  it('uses shared strict empty-string handling before falling back to output correlation', async () => {
    queueSelectResults(
      [],
      [
        createAsyncJob({
          metadata: { executionId: '', correlation: { executionId: '' } },
          payload: { executionId: '' },
          output: { executionId: 'execution-1' },
        }),
      ],
      [createExecution({ executionId: 'execution-1', status: 'failed', endedAt: NOW })],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('skips processing jobs with no correlation evidence without mutation', async () => {
    queueSelectResults(
      [],
      [createAsyncJob({ metadata: {}, payload: {}, output: null })],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.classified).toBe(0)
    expect(data.asyncJobs.mutated).toBe(0)
    expect(data.asyncJobs.mutatedToFailed).toBe(0)
    expect(data.asyncJobs.skipped).toBe(1)
    expect(data.asyncJobs.noOp).toBe(0)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(0)
    expect(getAsyncJobUpdates()).toHaveLength(0)
  })

  it('skips processing jobs when correlation exists but execution row is unresolved', async () => {
    queueSelectResults(
      [],
      [createAsyncJob({ metadata: { correlation: { executionId: 'execution-404' } } })],
      [],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.classified).toBe(0)
    expect(data.asyncJobs.mutated).toBe(0)
    expect(data.asyncJobs.mutatedToFailed).toBe(0)
    expect(data.asyncJobs.skipped).toBe(1)
    expect(data.asyncJobs.noOp).toBe(0)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(0)
    expect(getAsyncJobUpdates()).toHaveLength(0)
  })

  it('fails pending never started jobs', async () => {
    queueSelectResults([], [createAsyncJob({ status: 'pending', startedAt: null })])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.classified).toBe(1)
    expect(data.asyncJobs.mutated).toBe(1)
    expect(data.asyncJobs.mutatedToFailed).toBe(1)
    expect(data.asyncJobs.skipped).toBe(0)
    expect(data.asyncJobs.noOp).toBe(0)
    expect(data.asyncJobs.buckets['pending-never-started-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('classifies paused handoff processing jobs when linked execution is paused', async () => {
    queueUpdateResults([{ id: 'job-1' }])
    queueSelectResults(
      [],
      [createAsyncJob({ metadata: { correlation: { executionId: 'execution-1' } } })],
      [createExecution({ status: 'running' })],
      [createPausedExecution({ status: 'partially_resumed', resumedCount: 0, totalPauseCount: 1 })],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.classified).toBe(1)
    expect(data.asyncJobs.mutated).toBe(1)
    expect(data.asyncJobs.mutatedToFailed).toBe(1)
    expect(data.asyncJobs.skipped).toBe(0)
    expect(data.asyncJobs.noOp).toBe(0)
    expect(data.asyncJobs.buckets['paused-handoff-processing-job']).toBe(1)
    expect(data.executions.cleaned).toBe(0)
    expect(getExecutionUpdates()).toHaveLength(0)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('classifies same-run paused normalization jobs as paused handoff before orphaning', async () => {
    queueUpdateResults([{ id: 'log-1' }], [{ id: 'job-1' }])
    queueSelectResults(
      [
        createExecution({
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'paused', finalOutput: { paused: true } },
        }),
      ],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 1 })],
      [],
      [createAsyncJob({ metadata: { correlation: { executionId: 'execution-1' } } })],
      [
        createExecution({
          status: 'completed',
          endedAt: new Date('2026-03-11T23:55:00.000Z'),
          executionData: { finalizationPath: 'paused', finalOutput: { paused: true } },
        }),
      ],
      [createPausedExecution({ status: 'paused', resumedCount: 0, totalPauseCount: 1 })],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(1)
    expect(data.executions.buckets['partially-finalized-execution']).toBe(1)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'completed',
      })
    )
    expect(data.asyncJobs.classified).toBe(1)
    expect(data.asyncJobs.mutated).toBe(1)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.buckets['paused-handoff-processing-job']).toBe(1)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(0)
  })

  it('does not count cleaned executions when guarded update mutates no rows', async () => {
    queueUpdateResults([])
    queueSelectResults([createExecution()], [], [], [])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(0)
    expect(data.executions.classified).toBe(1)
    expect(data.executions.mutated).toBe(0)
    expect(data.executions.skipped).toBe(0)
    expect(data.executions.noOp).toBe(1)
    expect(data.executions.buckets['abandoned-running-execution']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(1)
  })

  it('does not count failed async jobs when guarded update mutates no rows', async () => {
    queueUpdateResults([])
    queueSelectResults(
      [],
      [createAsyncJob({ payload: { executionId: 'execution-1' } })],
      [createExecution({ executionId: 'execution-1', status: 'failed', endedAt: NOW })],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(0)
    expect(data.asyncJobs.cleanupErrors).toBe(0)
    expect(data.asyncJobs.classified).toBe(1)
    expect(data.asyncJobs.mutated).toBe(0)
    expect(data.asyncJobs.mutatedToFailed).toBe(0)
    expect(data.asyncJobs.skipped).toBe(0)
    expect(data.asyncJobs.noOp).toBe(1)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('counts async cleanup operation errors separately from failed-status mutations', async () => {
    queueUpdateResults(new Error('async cleanup update failed'))
    queueSelectResults(
      [],
      [createAsyncJob({ payload: { executionId: 'execution-1' } })],
      [createExecution({ executionId: 'execution-1', status: 'failed', endedAt: NOW })],
      [],
      []
    )

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.classified).toBe(1)
    expect(data.asyncJobs.mutated).toBe(0)
    expect(data.asyncJobs.mutatedToFailed).toBe(0)
    expect(data.asyncJobs.failed).toBe(1)
    expect(data.asyncJobs.cleanupErrors).toBe(1)
    expect(data.asyncJobs.noOp).toBe(0)
    expect(data.asyncJobs.skipped).toBe(0)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('declares db-only async cleanup support and skips async job mutation for non-database backends', async () => {
    mockGetAsyncBackendType.mockReturnValue('redis')
    queueSelectResults([createExecution()], [], [])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(1)
    expect(data.asyncJobs).toEqual(
      expect.objectContaining({
        classified: 0,
        mutated: 0,
        mutatedToFailed: 0,
        failed: 0,
        cleanupErrors: 0,
        skipped: 0,
        noOp: 0,
        oldDeleted: 0,
        support: {
          backendType: 'redis',
          staleAsyncJobCleanup: 'db-only',
          supported: false,
          reason: 'stale async job cleanup only mutates async_jobs for the database backend',
        },
      })
    )
    expect(getAsyncJobUpdates()).toHaveLength(0)
  })
})
