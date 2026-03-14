/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateWorkflowAccess } from './middleware'

const { mockAuthenticateApiKeyFromHeader, mockUpdateApiKeyLastUsed, mockCheckHybridAuth } =
  vi.hoisted(() => ({
    mockAuthenticateApiKeyFromHeader: vi.fn(),
    mockUpdateApiKeyLastUsed: vi.fn(),
    mockCheckHybridAuth: vi.fn(),
  }))

const { mockAuthorizeWorkflowByWorkspacePermission, mockGetWorkflowById, mockLoggerError } =
  vi.hoisted(() => ({
    mockAuthorizeWorkflowByWorkspacePermission: vi.fn(),
    mockGetWorkflowById: vi.fn(),
    mockLoggerError: vi.fn(),
  }))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: mockLoggerError }),
}))

vi.mock('@/lib/api-key/service', () => ({
  authenticateApiKeyFromHeader: (...args: unknown[]) => mockAuthenticateApiKeyFromHeader(...args),
  updateApiKeyLastUsed: (...args: unknown[]) => mockUpdateApiKeyLastUsed(...args),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkHybridAuth: (...args: unknown[]) => mockCheckHybridAuth(...args),
}))

vi.mock('@/lib/core/config/env', () => ({
  env: {},
}))

vi.mock('@/lib/workflows/utils', () => ({
  authorizeWorkflowByWorkspacePermission: (...args: unknown[]) =>
    mockAuthorizeWorkflowByWorkspacePermission(...args),
  getWorkflowById: (...args: unknown[]) => mockGetWorkflowById(...args),
}))

const WORKFLOW_ID = 'wf-1'
const WORKSPACE_ID = 'ws-1'

function createRequest() {
  return new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`)
}

function createWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    workspaceId: WORKSPACE_ID,
    isDeployed: false,
    ...overrides,
  }
}

describe('validateWorkflowAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckHybridAuth.mockResolvedValue({ success: true, userId: 'user-1', authType: 'session' })
    mockGetWorkflowById.mockResolvedValue(createWorkflow())
    mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: true,
      status: 200,
      workflow: createWorkflow(),
      workspacePermission: 'admin',
    })
  })

  it('returns 401 before workflow lookup when unauthenticated', async () => {
    const request = createRequest()

    mockCheckHybridAuth.mockResolvedValue({ success: false, error: 'Unauthorized' })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      error: {
        message: 'Unauthorized',
        status: 401,
      },
    })
    expect(mockCheckHybridAuth).toHaveBeenCalledWith(request, { requireWorkflowId: false })
    expect(mockGetWorkflowById).not.toHaveBeenCalled()
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('returns 404 for authenticated missing workflow', async () => {
    mockGetWorkflowById.mockResolvedValue(null)

    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      error: {
        message: 'Workflow not found',
        status: 404,
      },
    })
    expect(mockGetWorkflowById).toHaveBeenCalledWith(WORKFLOW_ID)
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('returns 403 for authenticated workflow without workspace', async () => {
    mockGetWorkflowById.mockResolvedValue(createWorkflow({ workspaceId: null }))

    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      error: {
        message:
          'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
        status: 403,
      },
    })
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('returns authorization denial status and message', async () => {
    mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Unauthorized: Access denied to admin this workflow',
      workflow: createWorkflow(),
      workspacePermission: 'write',
    })

    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: false,
      action: 'admin',
    })

    expect(result).toEqual({
      error: {
        message: 'Unauthorized: Access denied to admin this workflow',
        status: 403,
      },
    })
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      userId: 'user-1',
      action: 'admin',
    })
  })

  it('returns workflow and auth on success', async () => {
    const workflow = createWorkflow({ name: 'Test Workflow' })
    const auth = { success: true, userId: 'user-1', authType: 'session' as const }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockGetWorkflowById.mockResolvedValue(workflow)

    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({ workflow, auth })
  })
})
