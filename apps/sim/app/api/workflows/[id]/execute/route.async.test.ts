/**
 * @vitest-environment node
 */

import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCheckHybridAuth,
  mockAuthorizeWorkflowByWorkspacePermission,
  mockPreprocessExecution,
  mockGetJobQueue,
  mockShouldExecuteInline,
  mockEnqueue,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
  mockLoggerDebug,
} = vi.hoisted(() => ({
  mockCheckHybridAuth: vi.fn(),
  mockAuthorizeWorkflowByWorkspacePermission: vi.fn(),
  mockPreprocessExecution: vi.fn(),
  mockGetJobQueue: vi.fn(),
  mockShouldExecuteInline: vi.fn(),
  mockEnqueue: vi.fn().mockResolvedValue('job-123'),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  AuthType: {
    SESSION: 'session',
    API_KEY: 'api_key',
    INTERNAL_JWT: 'internal_jwt',
  },
  checkHybridAuth: mockCheckHybridAuth,
}))

vi.mock('@/lib/workflows/utils', () => ({
  authorizeWorkflowByWorkspacePermission: mockAuthorizeWorkflowByWorkspacePermission,
  createHttpResponseFromBlock: vi.fn(),
  workflowHasResponseBlock: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/execution/preprocessing', () => ({
  preprocessExecution: mockPreprocessExecution,
}))

vi.mock('@/lib/core/async-jobs', () => ({
  getJobQueue: mockGetJobQueue,
  shouldExecuteInline: mockShouldExecuteInline,
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: vi.fn().mockReturnValue('req-12345678'),
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}))

vi.mock('@/lib/execution/call-chain', () => ({
  SIM_VIA_HEADER: 'x-sim-via',
  parseCallChain: vi.fn().mockReturnValue([]),
  validateCallChain: vi.fn().mockReturnValue(null),
  buildNextCallChain: vi.fn().mockReturnValue(['workflow-1']),
}))

vi.mock('@/lib/logs/execution/logging-session', () => ({
  LoggingSession: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/background/workflow-execution', () => ({
  executeWorkflowJob: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  }),
}))

vi.mock('uuid', () => ({
  validate: vi.fn().mockReturnValue(true),
  v4: vi.fn().mockReturnValue('execution-123'),
}))

import { POST } from './route'

async function readJsonBody(response: Response) {
  const text = await response.text()

  return {
    text,
    json: text ? JSON.parse(text) : null,
  }
}

function expectCheckpointOrder(checkpoints: string[], expected: string[]) {
  expect(checkpoints).toEqual(expected)
}

describe('workflow execute async route', () => {
  const asyncCheckpoints: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()

    asyncCheckpoints.length = 0

    mockCheckHybridAuth.mockReset()
    mockAuthorizeWorkflowByWorkspacePermission.mockReset()
    mockPreprocessExecution.mockReset()
    mockGetJobQueue.mockReset()
    mockShouldExecuteInline.mockReset()
    mockEnqueue.mockReset()

    mockEnqueue.mockResolvedValue('job-123')
    mockGetJobQueue.mockResolvedValue({
      enqueue: mockEnqueue,
      startJob: vi.fn(),
      completeJob: vi.fn(),
      markJobFailed: vi.fn(),
    })
    mockShouldExecuteInline.mockImplementation(() => {
      asyncCheckpoints.push('shouldExecuteInline')
      return false
    })

    mockCheckHybridAuth.mockImplementation(async () => {
      asyncCheckpoints.push('authorization')
      return {
        success: true,
        userId: 'session-user-1',
        authType: 'session',
      }
    })

    mockAuthorizeWorkflowByWorkspacePermission.mockImplementation(async () => {
      asyncCheckpoints.push('authorizeWorkflowByWorkspacePermission')
      return {
        allowed: true,
        workflow: {
          id: 'workflow-1',
          userId: 'owner-1',
          workspaceId: 'workspace-1',
        },
      }
    })

    mockPreprocessExecution.mockImplementation(async () => {
      asyncCheckpoints.push('preprocessing')
      return {
        success: true,
        actorUserId: 'actor-1',
        workflowRecord: {
          id: 'workflow-1',
          userId: 'owner-1',
          workspaceId: 'workspace-1',
        },
      }
    })

    mockGetJobQueue.mockImplementation(async () => {
      asyncCheckpoints.push('getJobQueue')
      return {
        enqueue: mockEnqueue,
        startJob: vi.fn(),
        completeJob: vi.fn(),
        markJobFailed: vi.fn(),
      }
    })

    mockEnqueue.mockImplementation(async () => {
      asyncCheckpoints.push('enqueue')
      return 'job-123'
    })
  })

  it('queues async execution with matching correlation metadata', async () => {
    const req = createMockRequest(
      'POST',
      { input: { hello: 'world' } },
      {
        'Content-Type': 'application/json',
        'X-Execution-Mode': 'async',
      }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })
    const { json: body, text: bodyText } = await readJsonBody(response)

    expect(
      response.status,
      `Expected async execute route to return 202, got ${response.status} with body: ${bodyText}`
    ).toBe(202)
    expectCheckpointOrder(asyncCheckpoints, [
      'authorization',
      'authorizeWorkflowByWorkspacePermission',
      'preprocessing',
      'getJobQueue',
      'enqueue',
      'shouldExecuteInline',
    ])
    expect(body.executionId).toBe('execution-123')
    expect(body.jobId).toBe('job-123')
    expect(mockLoggerError).not.toHaveBeenCalled()
    expect(mockEnqueue).toHaveBeenCalledWith(
      'workflow-execution',
      expect.objectContaining({
        workflowId: 'workflow-1',
        userId: 'actor-1',
        executionId: 'execution-123',
        requestId: 'req-12345678',
        correlation: {
          executionId: 'execution-123',
          requestId: 'req-12345678',
          source: 'workflow',
          workflowId: 'workflow-1',
          triggerType: 'manual',
        },
      }),
      {
        metadata: {
          workflowId: 'workflow-1',
          userId: 'actor-1',
          correlation: {
            executionId: 'execution-123',
            requestId: 'req-12345678',
            source: 'workflow',
            workflowId: 'workflow-1',
            triggerType: 'manual',
          },
        },
      }
    )
  })

  it('returns queue failure payload with checkpoint trail and logs the queue error', async () => {
    const queueError = new Error('queue unavailable')
    mockEnqueue.mockImplementationOnce(async () => {
      asyncCheckpoints.push('enqueue')
      throw queueError
    })

    const req = createMockRequest(
      'POST',
      { input: { hello: 'world' } },
      {
        'Content-Type': 'application/json',
        'X-Execution-Mode': 'async',
      }
    )

    const response = await POST(req as any, { params: Promise.resolve({ id: 'workflow-1' }) })
    const { json: body, text: bodyText } = await readJsonBody(response)

    expectCheckpointOrder(asyncCheckpoints, [
      'authorization',
      'authorizeWorkflowByWorkspacePermission',
      'preprocessing',
      'getJobQueue',
      'enqueue',
    ])
    expect(
      response.status,
      `Expected async execute route to return 500, got ${response.status} with body: ${bodyText}`
    ).toBe(500)
    expect(body).toEqual({ error: 'Failed to queue async execution: queue unavailable' })
    expect(mockShouldExecuteInline).not.toHaveBeenCalled()
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[req-12345678] Failed to queue async execution',
      queueError
    )
  })
})
