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

const {
  mockAuthorizeWorkflowByWorkspacePermission,
  mockGetActiveWorkflowRecord,
  mockGetWorkflowById,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockAuthorizeWorkflowByWorkspacePermission: vi.fn(),
  mockGetActiveWorkflowRecord: vi.fn(),
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
  AuthType: {
    SESSION: 'session',
    API_KEY: 'api_key',
    INTERNAL_JWT: 'internal_jwt',
  },
  checkHybridAuth: (...args: unknown[]) => mockCheckHybridAuth(...args),
}))

vi.mock('@/lib/core/config/env', () => ({
  env: { INTERNAL_API_SECRET: 'internal-secret' },
  getEnv: vi.fn(),
}))

vi.mock('@/lib/workflows/active-context', () => ({
  getActiveWorkflowRecord: (...args: unknown[]) => mockGetActiveWorkflowRecord(...args),
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
    mockGetActiveWorkflowRecord.mockResolvedValue(createWorkflow())
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
    expect(mockGetActiveWorkflowRecord).not.toHaveBeenCalled()
    expect(mockGetWorkflowById).not.toHaveBeenCalled()
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('returns 404 for authenticated missing workflow', async () => {
    mockGetActiveWorkflowRecord.mockResolvedValue(null)
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
    mockGetActiveWorkflowRecord.mockResolvedValue(null)
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

  it('returns 403 when active workflow record lacks workspaceId and skips api key auth', async () => {
    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'personal-key' },
    })
    mockGetActiveWorkflowRecord.mockResolvedValue(createWorkflow({ workspaceId: null }))

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
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
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
    expect(mockUpdateApiKeyLastUsed).not.toHaveBeenCalled()
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('returns 404 for authenticated workflow in an archived workspace', async () => {
    mockGetActiveWorkflowRecord.mockResolvedValue(null)
    mockGetWorkflowById.mockResolvedValue(createWorkflow())

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
      workflow: createWorkflow(),
    })
  })

  it('returns 401 for workspace api keys rejected by scoped revalidation', async () => {
    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'workspace-key' },
    })
    const auth = {
      success: true,
      userId: 'user-1',
      workspaceId: 'ws-2',
      authType: 'api_key' as const,
      apiKeyType: 'workspace' as const,
    }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: false,
      error: 'Invalid API key',
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      error: {
        message: 'Unauthorized: Invalid API key',
        status: 401,
      },
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('workspace-key', {
      workspaceId: WORKSPACE_ID,
      keyTypes: ['workspace', 'personal'],
    })
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('denies personal api keys when the workflow workspace disallows them', async () => {
    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'personal-key' },
    })
    const auth = {
      success: true,
      userId: 'user-1',
      authType: 'api_key' as const,
      apiKeyType: 'personal' as const,
    }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: false,
      error: 'Invalid API key',
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      error: {
        message: 'Unauthorized: Invalid API key',
        status: 401,
      },
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('personal-key', {
      workspaceId: WORKSPACE_ID,
      keyTypes: ['workspace', 'personal'],
    })
    expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
  })

  it('allows personal api keys when the workflow workspace permits them', async () => {
    const workflow = createWorkflow({ name: 'Personal Key Workflow' })
    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'personal-key' },
    })
    const auth = {
      success: true,
      userId: 'user-1',
      authType: 'api_key' as const,
      apiKeyType: 'personal' as const,
    }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockGetActiveWorkflowRecord.mockResolvedValue(workflow)
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: true,
      userId: 'user-1',
      userName: 'Personal Key User',
      userEmail: 'personal@example.com',
      keyId: 'key-1',
      keyType: 'personal',
      workspaceId: WORKSPACE_ID,
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      workflow,
      auth: {
        success: true,
        userId: 'user-1',
        workspaceId: WORKSPACE_ID,
        userName: 'Personal Key User',
        userEmail: 'personal@example.com',
        authType: 'api_key',
        apiKeyType: 'personal',
      },
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('personal-key', {
      workspaceId: WORKSPACE_ID,
      keyTypes: ['workspace', 'personal'],
    })
    expect(mockCheckHybridAuth).not.toHaveBeenCalled()
    expect(mockUpdateApiKeyLastUsed).toHaveBeenCalledTimes(1)
    expect(mockUpdateApiKeyLastUsed).toHaveBeenCalledWith('key-1')
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      userId: 'user-1',
      action: 'read',
      workflow,
    })
  })

  it('preserves session auth semantics for accessible workflows', async () => {
    const workflow = createWorkflow({ name: 'Session Workflow' })
    const auth = { success: true, userId: 'user-1', authType: 'session' as const }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockGetActiveWorkflowRecord.mockResolvedValue(workflow)

    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({ workflow, auth })
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      userId: 'user-1',
      action: 'read',
      workflow,
    })
  })

  it('allows workspace api keys scoped to the same workspace', async () => {
    const workflow = createWorkflow({ name: 'Scoped Workflow' })
    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'workspace-key' },
    })
    const auth = {
      success: true,
      userId: 'user-1',
      workspaceId: WORKSPACE_ID,
      authType: 'api_key' as const,
      apiKeyType: 'workspace' as const,
    }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockGetActiveWorkflowRecord.mockResolvedValue(workflow)
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: true,
      userId: 'user-1',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: WORKSPACE_ID,
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({
      workflow,
      auth: {
        success: true,
        userId: 'user-1',
        workspaceId: WORKSPACE_ID,
        authType: 'api_key',
        apiKeyType: 'workspace',
      },
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('workspace-key', {
      workspaceId: WORKSPACE_ID,
      keyTypes: ['workspace', 'personal'],
    })
    expect(mockCheckHybridAuth).not.toHaveBeenCalled()
    expect(mockUpdateApiKeyLastUsed).toHaveBeenCalledTimes(1)
    expect(mockUpdateApiKeyLastUsed).toHaveBeenCalledWith('key-1')
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      userId: 'user-1',
      action: 'read',
      workflow,
    })
  })

  it('returns workflow and auth on success', async () => {
    const workflow = createWorkflow({ name: 'Test Workflow' })
    const auth = { success: true, userId: 'user-1', authType: 'session' as const }

    mockCheckHybridAuth.mockResolvedValue(auth)
    mockGetActiveWorkflowRecord.mockResolvedValue(workflow)

    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: false,
      action: 'read',
    })

    expect(result).toEqual({ workflow, auth })
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      userId: 'user-1',
      action: 'read',
      workflow,
    })
  })

  it('returns 404 for deployed access when workflow is missing', async () => {
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: true,
      userId: 'user-1',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: WORKSPACE_ID,
    })
    mockGetActiveWorkflowRecord.mockResolvedValue(null)
    mockGetWorkflowById.mockResolvedValue(null)

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
    })

    expect(result).toEqual({
      error: {
        message: 'Workflow not found',
        status: 404,
      },
    })
    expect(mockCheckHybridAuth).not.toHaveBeenCalled()
    expect(mockGetActiveWorkflowRecord).toHaveBeenCalledWith(WORKFLOW_ID)
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
  })

  it('returns 401 before deployed workflow lookup when api key is missing', async () => {
    const result = await validateWorkflowAccess(createRequest(), WORKFLOW_ID, {
      requireDeployment: true,
    })

    expect(result).toEqual({
      error: {
        message: 'Unauthorized: API key required',
        status: 401,
      },
    })
    expect(mockGetActiveWorkflowRecord).not.toHaveBeenCalled()
    expect(mockGetWorkflowById).not.toHaveBeenCalled()
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
  })

  it('returns 401 before deployed workflow lookup when api key is invalid', async () => {
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: false,
      error: 'Invalid API key',
    })

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'invalid-key' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
    })

    expect(result).toEqual({
      error: {
        message: 'Unauthorized: Invalid API key',
        status: 401,
      },
    })
    expect(mockGetActiveWorkflowRecord).toHaveBeenCalledWith(WORKFLOW_ID)
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('invalid-key', {
      workspaceId: WORKSPACE_ID,
      keyTypes: ['workspace', 'personal'],
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledTimes(1)
  })

  it('returns 403 for deployed access when authenticated workflow has no workspace', async () => {
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: true,
      userId: 'user-1',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: WORKSPACE_ID,
    })
    mockGetActiveWorkflowRecord.mockResolvedValue(null)
    mockGetWorkflowById.mockResolvedValue(createWorkflow({ workspaceId: null, isDeployed: true }))

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
    })

    expect(result).toEqual({
      error: {
        message:
          'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
        status: 403,
      },
    })
    expect(mockCheckHybridAuth).not.toHaveBeenCalled()
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
  })

  it('returns 404 for deployed access when authenticated workflow workspace is archived', async () => {
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: true,
      userId: 'user-1',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: WORKSPACE_ID,
    })
    mockGetActiveWorkflowRecord.mockResolvedValue(null)
    mockGetWorkflowById.mockResolvedValue(createWorkflow({ isDeployed: true }))

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
    })

    expect(result).toEqual({
      error: {
        message: 'Workflow not found',
        status: 404,
      },
    })
    expect(mockGetWorkflowById).toHaveBeenCalledWith(WORKFLOW_ID)
    expect(mockCheckHybridAuth).not.toHaveBeenCalled()
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
  })

  it('returns 403 for deployed access when authenticated workflow is not deployed', async () => {
    mockAuthenticateApiKeyFromHeader.mockResolvedValue({
      success: true,
      userId: 'user-1',
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: WORKSPACE_ID,
    })
    mockGetActiveWorkflowRecord.mockResolvedValue(createWorkflow({ isDeployed: false }))

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
    })

    expect(result).toEqual({
      error: {
        message: 'Workflow is not deployed',
        status: 403,
      },
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledWith('valid-key', {
      workspaceId: WORKSPACE_ID,
      keyTypes: ['workspace', 'personal'],
    })
    expect(mockAuthenticateApiKeyFromHeader).toHaveBeenCalledTimes(1)
    expect(mockUpdateApiKeyLastUsed).not.toHaveBeenCalled()
  })

  it('allows internal secret without requiring api key when workflow is deployed', async () => {
    mockGetActiveWorkflowRecord.mockResolvedValue(createWorkflow({ isDeployed: true }))

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-internal-secret': 'internal-secret' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
      allowInternalSecret: true,
    })

    expect(result).toEqual({ workflow: createWorkflow({ isDeployed: true }) })
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
    expect(mockUpdateApiKeyLastUsed).not.toHaveBeenCalled()
  })

  it('still returns undeployed error before internal secret success when workflow is not deployed', async () => {
    mockGetActiveWorkflowRecord.mockResolvedValue(createWorkflow({ isDeployed: false }))

    const request = new NextRequest(`http://localhost:3000/api/workflows/${WORKFLOW_ID}/status`, {
      headers: { 'x-internal-secret': 'internal-secret' },
    })

    const result = await validateWorkflowAccess(request, WORKFLOW_ID, {
      requireDeployment: true,
      allowInternalSecret: true,
    })

    expect(result).toEqual({
      error: {
        message: 'Workflow is not deployed',
        status: 403,
      },
    })
    expect(mockAuthenticateApiKeyFromHeader).not.toHaveBeenCalled()
  })
})
