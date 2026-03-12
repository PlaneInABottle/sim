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

vi.mock('@/lib/core/async-jobs', async () => {
  const actual = await vi.importActual('@/lib/core/async-jobs')

  return {
    ...actual,
    getJobQueue: mocks.getJobQueue,
    JOB_STATUS: {
      PENDING: 'pending',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed',
    },
  }
})

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

  it('returns correlated execution diagnostics when only payload executionId resolves', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      payload: { executionId: 'ex-payload' },
      output: { ok: true },
      metadata: { workflowId: 'wf-1' },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-payload',
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
      executionId: 'ex-payload',
      source: 'payload',
      fields: ['payload.executionId'],
    })
    expect(body.executionDiagnostics).toEqual(
      expect.objectContaining({
        executionId: 'ex-payload',
        status: 'completed',
        finalizationPath: 'completed',
        traceSpanCount: 0,
      })
    )
  })

  it('ignores empty-string correlation fields and falls back to output executionId', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      payload: { executionId: '' },
      output: { executionId: 'ex-output', ok: true },
      metadata: { workflowId: 'wf-1', executionId: '' },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-output',
        status: 'completed',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: { finalizationPath: 'completed', hasTraceSpans: false, traceSpanCount: 0 },
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/jobs/job-1'), {
      params: Promise.resolve({ jobId: 'job-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.correlation).toEqual({
      available: true,
      executionId: 'ex-output',
      source: 'output',
      fields: ['output.executionId'],
    })
  })

  it('normalizes completed job status when linked execution is failed', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-failed' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-failed',
        status: 'failed',
        level: 'error',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: {
          finalizationPath: 'force_failed',
          error: 'boom',
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
    expect(body.status).toBe('failed')
    expect(body.output).toBeUndefined()
    expect(body.error).toBe('boom')
    expect(body.executionDiagnostics).toEqual(
      expect.objectContaining({
        executionId: 'ex-failed',
        status: 'failed',
        rawStatus: 'failed',
        finalizationPath: 'force_failed',
        errorMessage: 'boom',
      })
    )
  })

  it('normalizes completed job status when linked execution is cancelled', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-cancelled' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-cancelled',
        status: 'cancelled',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: {
          finalizationPath: 'cancelled',
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
    expect(body.status).toBe('cancelled')
    expect(body.output).toBeUndefined()
  })

  it('uses correlated completed execution truth when queue row is failed', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'failed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      error: 'stale queue failure',
      output: { ok: true, source: 'queue' },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-completed' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-completed',
        status: 'completed',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:03.000Z'),
        endedAt: new Date('2025-01-01T00:00:05.000Z'),
        executionData: {
          finalizationPath: 'completed',
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
    expect(body.status).toBe('completed')
    expect(body.output).toEqual({ ok: true, source: 'queue' })
    expect(body.error).toBeUndefined()
    expect(body.metadata.completedAt).toBe('2025-01-01T00:00:05.000Z')
    expect(body.metadata.duration).toBe(2000)
  })

  it('prefers correlated execution finalOutput for completed payloads', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true, source: 'queue-stale' },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-completed-output' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-completed-output',
        status: 'completed',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:03.000Z'),
        endedAt: new Date('2025-01-01T00:00:05.000Z'),
        executionData: {
          finalizationPath: 'completed',
          finalOutput: { ok: true, source: 'execution-truth' },
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
    expect(body.status).toBe('completed')
    expect(body.output).toEqual({ ok: true, source: 'execution-truth' })
  })

  it('keeps final payload coherent when queue row completed but execution is failed', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-failed-shape' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-failed-shape',
        status: 'failed',
        level: 'error',
        startedAt: new Date('2025-01-01T00:00:03.000Z'),
        endedAt: new Date('2025-01-01T00:00:07.000Z'),
        executionData: {
          finalizationPath: 'force_failed',
          error: 'execution truth failure',
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
    expect(body.status).toBe('failed')
    expect(body.output).toBeUndefined()
    expect(body.error).toBe('execution truth failure')
    expect(body.metadata.completedAt).toBe('2025-01-01T00:00:07.000Z')
    expect(body.metadata.duration).toBe(4000)
  })

  it('keeps final payload coherent when queue row completed but execution is cancelled', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-cancelled-shape' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-cancelled-shape',
        status: 'cancelled',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:03.000Z'),
        endedAt: new Date('2025-01-01T00:00:08.000Z'),
        executionData: {
          finalizationPath: 'cancelled',
          error: 'cancelled upstream',
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
    expect(body.status).toBe('cancelled')
    expect(body.output).toBeUndefined()
    expect(body.error).toBe('cancelled upstream')
    expect(body.metadata.completedAt).toBe('2025-01-01T00:00:08.000Z')
    expect(body.metadata.duration).toBe(5000)
  })

  it('passes through stale cleanup metadata when present', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      attempts: 1,
      maxAttempts: 3,
      metadata: {
        workflowId: 'wf-1',
        staleCleanup: { bucket: 'orphaned-processing-job', cleanedAt: '2025-01-01T00:05:00.000Z' },
      },
    })

    const response = await GET(new NextRequest('http://localhost/api/jobs/job-1'), {
      params: Promise.resolve({ jobId: 'job-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.metadata.staleCleanup).toEqual({
      bucket: 'orphaned-processing-job',
      cleanedAt: '2025-01-01T00:05:00.000Z',
    })
  })

  it('surfaces execution stale cleanup in diagnostics when present', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-stale-cleanup' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-stale-cleanup',
        status: 'completed',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: {
          finalizationPath: 'completed',
          staleCleanup: {
            bucket: 'partially-finalized-execution',
            cleanedAt: '2025-01-01T00:05:00.000Z',
            staleThresholdMinutes: 15,
            staleDurationMinutes: 20,
            message: 'cleanup intervened',
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
    expect(body.executionDiagnostics.staleCleanup).toEqual({
      bucket: 'partially-finalized-execution',
      cleanedAt: '2025-01-01T00:05:00.000Z',
      staleThresholdMinutes: 15,
      staleDurationMinutes: 20,
      message: 'cleanup intervened',
    })
  })

  it('normalizes processing job status when linked execution is failed', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      attempts: 1,
      maxAttempts: 3,
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-processing-failed' } },
      output: { ok: true },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-processing-failed',
        status: 'failed',
        level: 'error',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: {
          finalizationPath: 'force_failed',
          error: 'processing boom',
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
    expect(body.status).toBe('failed')
    expect(body.output).toBeUndefined()
    expect(body.error).toBe('processing boom')
    expect(body.estimatedDuration).toBeUndefined()
    expect(body.executionDiagnostics).toEqual(
      expect.objectContaining({
        executionId: 'ex-processing-failed',
        status: 'failed',
        errorMessage: 'processing boom',
      })
    )
  })

  it('normalizes processing job status when linked execution is cancelled', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      attempts: 1,
      maxAttempts: 3,
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-processing-cancelled' } },
      output: { ok: true },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-processing-cancelled',
        status: 'cancelled',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:02.000Z'),
        executionData: {
          finalizationPath: 'cancelled',
          error: 'cancelled by user',
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
    expect(body.status).toBe('cancelled')
    expect(body.output).toBeUndefined()
    expect(body.error).toBe('cancelled by user')
    expect(body.estimatedDuration).toBeUndefined()
  })

  it('normalizes active queue status to paused when execution finalization path is paused', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'processing',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-paused-processing' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-paused-processing',
        status: 'pending',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:03.000Z'),
        endedAt: new Date('2025-01-01T00:00:05.000Z'),
        executionData: {
          finalizationPath: 'paused',
          finalOutput: { paused: true },
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
    expect(body.status).toBe('paused')
    expect(body.output).toBeUndefined()
    expect(body.error).toBeUndefined()
    expect(body.estimatedDuration).toBeUndefined()
    expect(body.metadata.completedAt).toBeUndefined()
    expect(body.metadata.duration).toBeUndefined()
    expect(body.executionDiagnostics).toEqual(
      expect.objectContaining({
        executionId: 'ex-paused-processing',
        status: 'paused',
        rawStatus: 'pending',
        finalizationPath: 'paused',
      })
    )
  })

  it('keeps paused payload non-terminal when queue row is completed but execution truth is paused', async () => {
    mocks.getJob.mockResolvedValue({
      id: 'job-1',
      status: 'completed',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-01T00:00:01.000Z'),
      completedAt: new Date('2025-01-01T00:00:02.000Z'),
      attempts: 1,
      maxAttempts: 3,
      output: { ok: true, source: 'queue-stale' },
      metadata: { workflowId: 'wf-1', correlation: { executionId: 'ex-paused-completed' } },
    })
    mocks.selectLimit.mockResolvedValue([
      {
        executionId: 'ex-paused-completed',
        status: 'pending',
        level: 'info',
        startedAt: new Date('2025-01-01T00:00:03.000Z'),
        endedAt: new Date('2025-01-01T00:00:05.000Z'),
        executionData: {
          finalizationPath: 'paused',
          finalOutput: { paused: true },
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
    expect(body.status).toBe('paused')
    expect(body.output).toBeUndefined()
    expect(body.error).toBeUndefined()
    expect(body.estimatedDuration).toBeUndefined()
    expect(body.metadata.completedAt).toBeUndefined()
    expect(body.metadata.duration).toBeUndefined()
    expect(body.executionDiagnostics).toEqual(
      expect.objectContaining({
        executionId: 'ex-paused-completed',
        status: 'paused',
        rawStatus: 'pending',
        finalizationPath: 'paused',
      })
    )
  })
})
