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
  mockDeleteReturning,
  mockGetMaxExecutionTimeout,
} = vi.hoisted(() => {
  const mockSelectQueue: unknown[][] = []
  const mockUpdateSets: unknown[] = []
  const mockDeleteReturning = vi.fn().mockResolvedValue([])

  return {
    mockVerifyCronAuth: vi.fn().mockReturnValue(null),
    mockSelectQueue,
    mockUpdateSets,
    mockDeleteReturning,
    mockGetMaxExecutionTimeout: vi.fn().mockReturnValue(10 * 60 * 1000),
  }
})

function shiftSelectResult() {
  return mockSelectQueue.shift() ?? []
}

vi.mock('@/lib/auth/internal', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}))

vi.mock('@/lib/core/execution-limits', () => ({
  getMaxExecutionTimeout: mockGetMaxExecutionTimeout,
}))

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
  lt: vi.fn((field: unknown, value: unknown) => ({ type: 'lt', field, value })),
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

  const updateWhere = vi.fn(async () => [])
  const updateSet = vi.fn((payload: unknown) => {
    mockUpdateSets.push(payload)
    return { where: updateWhere }
  })
  const update = vi.fn(() => ({ set: updateSet }))

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

describe('cleanup stale executions cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectQueue.length = 0
    mockUpdateSets.length = 0
    mockDeleteReturning.mockResolvedValue([])
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks abandoned running executions as failed with cleanup metadata', async () => {
    queueSelectResults([createExecution()], [], [], [])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(1)
    expect(data.executions.buckets['abandoned-running-execution']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(1)
    expect(getExecutionUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        endedAt: NOW,
        totalDurationMs: NOW.getTime() - STALE_STARTED_AT.getTime(),
      })
    )
    expect(getExecutionUpdates()[0].executionData).toEqual(expect.objectContaining({ type: 'sql' }))
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
    expect(data.executions.buckets['paused-awaiting-resume']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(0)
  })

  it('reports resume in flight executions without destructive mutation', async () => {
    queueSelectResults([createExecution()], [], [createResumeEntry({ status: 'claimed' })], [])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.executions.cleaned).toBe(0)
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
    expect(getExecutionUpdates()).toHaveLength(0)
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

  it('preserves partially finalized executions by classifying and skipping them', async () => {
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
    expect(data.executions.cleaned).toBe(0)
    expect(data.executions.buckets['partially-finalized-execution']).toBe(1)
    expect(getExecutionUpdates()).toHaveLength(0)
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
    expect(data.asyncJobs.failed).toBe(1)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
    expect(getAsyncJobUpdates()[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        completedAt: NOW,
        updatedAt: NOW,
        metadata: expect.objectContaining({ type: 'sql' }),
        error: expect.objectContaining({ type: 'sql' }),
      })
    )
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
    expect(data.asyncJobs.skipped).toBe(1)
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
    expect(data.asyncJobs.skipped).toBe(1)
    expect(data.asyncJobs.buckets['orphaned-processing-job']).toBe(0)
    expect(getAsyncJobUpdates()).toHaveLength(0)
  })

  it('fails pending never started jobs', async () => {
    queueSelectResults([], [createAsyncJob({ status: 'pending', startedAt: null })])

    const response = await GET(createMockRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.asyncJobs.failed).toBe(1)
    expect(data.asyncJobs.buckets['pending-never-started-job']).toBe(1)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })

  it('classifies paused handoff processing jobs when linked execution is paused', async () => {
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
    expect(data.asyncJobs.failed).toBe(1)
    expect(data.asyncJobs.buckets['paused-handoff-processing-job']).toBe(1)
    expect(data.executions.cleaned).toBe(0)
    expect(getExecutionUpdates()).toHaveLength(0)
    expect(getAsyncJobUpdates()).toHaveLength(1)
  })
})
