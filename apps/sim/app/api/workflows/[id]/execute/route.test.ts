/**
 * @vitest-environment node
 */

import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCheckHybridAuth,
  mockAuthorizeWorkflowByWorkspacePermission,
  mockPreprocessExecution,
  mockLoadWorkflowFromNormalizedTables,
  mockLoadDeployedWorkflowState,
  mockExecuteWorkflowCore,
  mockGetExecutionStateForWorkflow,
  mockGetLatestExecutionState,
  mockDbSelect,
  mockGetUserPermissionConfig,
} = vi.hoisted(() => ({
  mockCheckHybridAuth: vi.fn(),
  mockAuthorizeWorkflowByWorkspacePermission: vi.fn(),
  mockPreprocessExecution: vi.fn(),
  mockLoadWorkflowFromNormalizedTables: vi.fn(),
  mockLoadDeployedWorkflowState: vi.fn(),
  mockExecuteWorkflowCore: vi.fn(),
  mockGetExecutionStateForWorkflow: vi.fn(),
  mockGetLatestExecutionState: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGetUserPermissionConfig: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkHybridAuth: mockCheckHybridAuth,
  AuthType: {
    SESSION: 'session',
    API_KEY: 'api_key',
    INTERNAL_JWT: 'internal_jwt',
  },
}))

vi.mock('@/lib/workflows/utils', () => ({
  authorizeWorkflowByWorkspacePermission: mockAuthorizeWorkflowByWorkspacePermission,
  createHttpResponseFromBlock: vi.fn(),
  workflowHasResponseBlock: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/execution/preprocessing', () => ({
  preprocessExecution: mockPreprocessExecution,
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: mockLoadWorkflowFromNormalizedTables,
  loadDeployedWorkflowState: mockLoadDeployedWorkflowState,
}))

vi.mock('@/lib/workflows/executor/execution-core', () => ({
  executeWorkflowCore: mockExecuteWorkflowCore,
}))

vi.mock('@/lib/workflows/executor/execution-state', () => ({
  getExecutionStateForWorkflow: mockGetExecutionStateForWorkflow,
  getLatestExecutionState: mockGetLatestExecutionState,
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: vi.fn().mockReturnValue('req-12345678'),
}))

vi.mock('@/lib/execution/call-chain', () => ({
  SIM_VIA_HEADER: 'x-sim-via',
  parseCallChain: vi.fn().mockReturnValue([]),
  validateCallChain: vi.fn().mockReturnValue(null),
  buildNextCallChain: vi.fn().mockReturnValue(['workflow-1']),
}))

vi.mock('@/lib/logs/execution/logging-session', () => ({
  LoggingSession: vi.fn().mockImplementation(() => ({
    safeStart: vi.fn(),
    safeCompleteWithError: vi.fn(),
    markAsFailed: vi.fn(),
  })),
}))

vi.mock('@/lib/execution/files', () => ({
  processInputFileFields: vi.fn().mockImplementation(async (input) => input),
}))

vi.mock('@/lib/uploads/utils/user-file-base64.server', () => ({
  cleanupExecutionBase64Cache: vi.fn().mockResolvedValue(undefined),
  hydrateUserFilesWithBase64: vi.fn().mockImplementation(async (output) => output),
}))

vi.mock('@/serializer', () => ({
  Serializer: vi.fn().mockImplementation(() => ({
    serializeWorkflow: vi.fn().mockReturnValue({
      blocks: {},
      edges: [],
      loops: {},
      parallels: {},
    }),
  })),
}))

vi.mock('@/lib/core/async-jobs', () => ({
  getJobQueue: vi.fn(),
  shouldExecuteInline: vi.fn().mockReturnValue(false),
}))

vi.mock('@/background/workflow-execution', () => ({
  executeWorkflowJob: vi.fn(),
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  isPublicApiDisabled: false,
}))

vi.mock('@/ee/access-control/utils/permission-check', () => ({
  getUserPermissionConfig: mockGetUserPermissionConfig,
}))

vi.mock('@sim/db', () => ({
  db: {
    select: mockDbSelect,
  },
  workflow: {},
}))

vi.mock('@sim/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('uuid', () => ({
  validate: vi.fn().mockReturnValue(true),
  v4: vi.fn().mockReturnValue('execution-123'),
}))

import { POST } from './route'

function createPublicWorkflowSelectMock() {
  const limit = vi.fn().mockResolvedValue([
    {
      isPublicApi: true,
      isDeployed: true,
      userId: 'owner-1',
    },
  ])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })

  mockDbSelect.mockReturnValue({ from })
}

function createWorkflowData() {
  return {
    blocks: {},
    edges: [],
    loops: {},
    parallels: {},
    variables: {},
    deploymentVersionId: 'deployment-version-1',
  }
}

describe('workflow execute route policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCheckHybridAuth.mockResolvedValue({
      success: true,
      userId: 'session-user-1',
      authType: 'session',
    })

    mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: true,
      workflow: {
        id: 'workflow-1',
        userId: 'owner-1',
        workspaceId: 'workspace-1',
        variables: {},
        isDeployed: true,
      },
    })

    mockPreprocessExecution.mockResolvedValue({
      success: true,
      actorUserId: 'actor-1',
      workflowRecord: {
        id: 'workflow-1',
        userId: 'owner-1',
        workspaceId: 'workspace-1',
        variables: {},
        isDeployed: true,
      },
    })

    mockLoadWorkflowFromNormalizedTables.mockResolvedValue(createWorkflowData())
    mockLoadDeployedWorkflowState.mockResolvedValue(createWorkflowData())
    mockExecuteWorkflowCore.mockResolvedValue({
      success: true,
      output: { ok: true },
      metadata: {
        duration: 1,
        startTime: '2026-01-01T00:00:00.000Z',
        endTime: '2026-01-01T00:00:01.000Z',
      },
      status: 'completed',
    })
    mockGetExecutionStateForWorkflow.mockResolvedValue({
      blockStates: {},
      executedBlocks: [],
      blockLogs: [],
      decisions: { router: {}, condition: {} },
      completedLoops: [],
      activeExecutionPath: [],
    })
    mockGetLatestExecutionState.mockResolvedValue({
      blockStates: {},
      executedBlocks: [],
      blockLogs: [],
      decisions: { router: {}, condition: {} },
      completedLoops: [],
      activeExecutionPath: [],
    })
    mockGetUserPermissionConfig.mockResolvedValue(null)
  })

  it('defaults API-key direct execution to draft and requests write authorization', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: true,
      userId: 'api-user-1',
      authType: 'api_key',
      apiKeyType: 'workspace',
      workspaceId: 'workspace-1',
    })

    const req = createMockRequest(
      'POST',
      { hello: 'world' },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })

    expect(response.status).toBe(200)
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        userId: 'api-user-1',
        action: 'write',
      })
    )
    expect(mockPreprocessExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        useDraftState: true,
        checkDeployment: false,
      })
    )
    expect(mockLoadWorkflowFromNormalizedTables).toHaveBeenCalledWith('workflow-1')
    expect(mockLoadDeployedWorkflowState).not.toHaveBeenCalled()
  })

  it('preserves deployed execution for API-key requests with useDraftState false', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: true,
      userId: 'api-user-1',
      authType: 'api_key',
      apiKeyType: 'workspace',
      workspaceId: 'workspace-1',
    })

    const req = createMockRequest(
      'POST',
      { useDraftState: false, hello: 'world' },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })

    expect(response.status).toBe(200)
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        userId: 'api-user-1',
        action: 'read',
      })
    )
    expect(mockPreprocessExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        useDraftState: false,
        checkDeployment: true,
      })
    )
    expect(mockLoadDeployedWorkflowState).toHaveBeenCalledWith('workflow-1', 'workspace-1')
  })

  it('defaults session-auth execution to draft and requests write authorization', async () => {
    const req = createMockRequest(
      'POST',
      { input: { hello: 'world' } },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })

    expect(response.status).toBe(200)
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        userId: 'session-user-1',
        action: 'write',
      })
    )
    expect(mockPreprocessExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        useDraftState: true,
        checkDeployment: false,
      })
    )
  })

  it('keeps workflowStateOverride blocked for API-key callers', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: true,
      userId: 'api-user-1',
      authType: 'api_key',
      apiKeyType: 'workspace',
      workspaceId: 'workspace-1',
    })

    const req = createMockRequest(
      'POST',
      {
        workflowStateOverride: { blocks: {}, edges: [] },
      },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('API key callers cannot provide workflowStateOverride')
  })

  it('keeps caller-supplied runFromBlock.sourceSnapshot blocked for API-key callers', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: true,
      userId: 'api-user-1',
      authType: 'api_key',
      apiKeyType: 'workspace',
      workspaceId: 'workspace-1',
    })

    const req = createMockRequest(
      'POST',
      {
        runFromBlock: {
          startBlockId: 'block-1',
          sourceSnapshot: {
            blockStates: {},
            executedBlocks: [],
            blockLogs: [],
            decisions: { router: {}, condition: {} },
            completedLoops: [],
            activeExecutionPath: [],
          },
        },
      },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('API key callers cannot provide runFromBlock.sourceSnapshot')
  })

  it('allows API-key runFromBlock executionId resume via stored snapshots', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: true,
      userId: 'api-user-1',
      authType: 'api_key',
      apiKeyType: 'workspace',
      workspaceId: 'workspace-1',
    })

    const req = createMockRequest(
      'POST',
      {
        runFromBlock: {
          startBlockId: 'block-1',
          executionId: 'exec-1',
        },
      },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })

    expect(response.status).toBe(200)
    expect(mockGetExecutionStateForWorkflow).toHaveBeenCalledWith('exec-1', 'workflow-1')
    expect(mockExecuteWorkflowCore).toHaveBeenCalledWith(
      expect.objectContaining({
        runFromBlock: {
          startBlockId: 'block-1',
          sourceSnapshot: expect.any(Object),
        },
      })
    )
  })

  it('keeps public API stored-snapshot resume blocked', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
    })
    createPublicWorkflowSelectMock()

    const req = createMockRequest(
      'POST',
      {
        runFromBlock: {
          startBlockId: 'block-1',
          executionId: 'exec-1',
        },
      },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Public API callers cannot resume from stored execution snapshots')
  })

  it('keeps public API execution deployed-only', async () => {
    mockCheckHybridAuth.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
    })
    createPublicWorkflowSelectMock()

    const req = createMockRequest(
      'POST',
      { hello: 'world' },
      { 'Content-Type': 'application/json' }
    )
    const params = Promise.resolve({ id: 'workflow-1' })

    const response = await POST(req as any, { params })

    expect(response.status).toBe(200)
    expect(mockPreprocessExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'workflow-1',
        useDraftState: false,
        checkDeployment: true,
      })
    )
    expect(mockLoadDeployedWorkflowState).toHaveBeenCalledWith('workflow-1', 'workspace-1')
    expect(mockLoadWorkflowFromNormalizedTables).not.toHaveBeenCalled()
  })
})
