/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getJob = vi.fn()
  const verifyWorkflowAccess = vi.fn()
  const createErrorResponse = vi.fn((error: string, status: number) =>
    Response.json({ error }, { status })
  )
  const selectLimit = vi.fn()
  const selectWhere = vi.fn()
  const selectFrom = vi.fn()
  const select = vi.fn()

  select.mockReturnValue({ from: selectFrom })
  selectFrom.mockReturnValue({ where: selectWhere })
  selectWhere.mockReturnValue({ limit: selectLimit })

  return {
    checkHybridAuth: vi.fn(),
    getJobQueue: vi.fn().mockResolvedValue({ getJob }),
    getJob,
    verifyWorkflowAccess,
    createErrorResponse,
    generateRequestId: vi.fn().mockReturnValue('req-1'),
    select,
    selectLimit,
  }
})

vi.mock('@sim/db', () => ({
  db: { select: mocks.select },
}))

vi.mock('@sim/db/schema', () => ({
  workflowExecutionLogs: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkHybridAuth: mocks.checkHybridAuth,
}))

vi.mock('@/lib/core/async-jobs', () => ({
  getJobQueue: mocks.getJobQueue,
  JOB_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: mocks.generateRequestId,
}))

vi.mock('@/socket/middleware/permissions', () => ({
  verifyWorkflowAccess: mocks.verifyWorkflowAccess,
}))

vi.mock('@/app/api/workflows/utils', () => ({
  createErrorResponse: mocks.createErrorResponse,
}))

import { GET } from './route'

describe('GET /api/jobs/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkHybridAuth.mockResolvedValue({ success: true, userId: 'user-1' })
    mocks.verifyWorkflowAccess.mockResolvedValue({ hasAccess: true })
  })

  it('returns queue metadata without execution diagnostics when correlation is absent', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      attempts: 1,
      maxAttempts: 3,
      metadata: { workflowId: 'wf-1' },
    })

    const response = await GET(new NextRequest('http://localhost/api/jobs/job-1'), {
      params: Promise.resolve({ jobId: 'job-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.metadata.attempts).toBe(1)
    expect(body.correlation).toEqual({ available: false, source: 'none', fields: [] })
    expect(body.executionDiagnostics).toBeUndefined()
  })

  it('returns correlated execution diagnostics when metadata correlation resolves', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: {
        workflowId: 'wf-1',
        correlation: {
          executionId: 'ex-1',
          requestId: 'req-1',
          source: 'workflow',
          workflowId: 'wf-1',
        },
      },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-1',
        status: 'completed',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: {
          finalizationPath: 'completed',
          lastStartedBlock: {
            blockId: 'b1',
            blockName: 'Start',
            blockType: 'agent',
            startedAt: '2025-01-01T00:00:00.000Z',
          },
          lastCompletedBlock: {
            blockId: 'b2',
            blockName: 'End',
            blockType: 'api',
            endedAt: '2025-01-01T00:00:02.000Z',
            success: true,
          },
          hasTraceSpans: false,
          traceSpanCount: 0,
        },
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/jobs/job-1'), {
      params: Promise.resolve({ jobId: 'job-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.correlation).toEqual({
      available: true,
      executionId: 'ex-1',
      source: 'metadata.correlation',
      fields: ['metadata.correlation.executionId'],
    })
    expect(body.executionDiagnostics).toEqual(
      expect.objectContaining({
        executionId: 'ex-1',
        status: 'completed',
        finalizationPath: 'completed',
        traceSpanCount: 0,
      })
    )
  })
})
