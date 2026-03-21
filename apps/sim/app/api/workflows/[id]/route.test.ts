/**
 * Integration tests for workflow by ID API route
 * Tests the new centralized permissions system
 *
 * @vitest-environment node
 */

import {
  auditMock,
  envMock,
  loggerMock,
  requestUtilsMock,
  setupGlobalFetchMock,
  telemetryMock,
} from '@sim/testing'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCheckHybridAuth = vi.fn()
const mockCheckSessionOrInternalAuth = vi.fn()
const mockLoadWorkflowFromNormalizedTables = vi.fn()
const mockGetActiveWorkflowContext = vi.fn()
const mockGetWorkflowById = vi.fn()
const mockAuthorizeWorkflowByWorkspacePermission = vi.fn()
const mockArchiveWorkflow = vi.fn()
const mockDbUpdate = vi.fn()
const mockDbSelect = vi.fn()
const mockValidateWorkflowAccess = vi.fn()

const READ_VALIDATION = {
  requireDeployment: false,
  action: 'read',
} as const

/**
 * Helper to set mock auth state consistently across getSession and hybrid auth.
 */
function mockGetSession(session: { user: { id: string } } | null) {
  if (session) {
    mockCheckHybridAuth.mockResolvedValue({ success: true, userId: session.user.id })
    mockCheckSessionOrInternalAuth.mockResolvedValue({ success: true, userId: session.user.id })
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'workflow-123', workspaceId: 'workspace-456' },
      auth: { success: true, userId: session.user.id, authType: 'session' },
    })
  } else {
    mockCheckHybridAuth.mockResolvedValue({ success: false })
    mockCheckSessionOrInternalAuth.mockResolvedValue({ success: false })

    mockValidateWorkflowAccess.mockResolvedValue({
      error: { message: 'Unauthorized', status: 401 },
    })
  }
}

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  AuthType: { SESSION: 'session', API_KEY: 'api_key', INTERNAL_JWT: 'internal_jwt' },
  checkHybridAuth: (...args: unknown[]) => mockCheckHybridAuth(...args),
  checkSessionOrInternalAuth: (...args: unknown[]) => mockCheckSessionOrInternalAuth(...args),
}))

vi.mock('@/lib/core/config/env', () => envMock)

vi.mock('@/lib/core/telemetry', () => telemetryMock)

vi.mock('@/lib/core/utils/request', () => requestUtilsMock)

vi.mock('@sim/logger', () => loggerMock)

vi.mock('@/lib/audit/log', () => auditMock)

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: (workflowId: string) =>
    mockLoadWorkflowFromNormalizedTables(workflowId),
}))

vi.mock('@/lib/workflows/active-context', () => ({
  getActiveWorkflowContext: (workflowId: string) => mockGetActiveWorkflowContext(workflowId),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/workflows/utils', () => ({
  getWorkflowById: (workflowId: string) => mockGetWorkflowById(workflowId),
  authorizeWorkflowByWorkspacePermission: (params: {
    workflowId: string
    userId: string
    action?: 'read' | 'write' | 'admin'
  }) => mockAuthorizeWorkflowByWorkspacePermission(params),
}))

vi.mock('@/lib/workflows/lifecycle', () => ({
  archiveWorkflow: (...args: unknown[]) => mockArchiveWorkflow(...args),
}))

vi.mock('@sim/db', () => ({
  db: {
    update: () => mockDbUpdate(),
    select: () => mockDbSelect(),
  },
  workflow: {},
}))

import { DELETE, GET, PUT } from './route'

describe('Workflow By ID API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('mock-request-id-12345678'),
    })

    mockLoadWorkflowFromNormalizedTables.mockResolvedValue(null)
    mockGetActiveWorkflowContext.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  describe('GET /api/workflows/[id]', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetSession(null)

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })

    it('should return 404 when workflow does not exist', async () => {
      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockResolvedValue({
        error: { message: 'Workflow not found', status: 404 },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/nonexistent')
      const params = Promise.resolve({ id: 'nonexistent' })

      const response = await GET(req, { params })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Workflow not found')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'nonexistent', READ_VALIDATION)
    })

    it('should return 404 for workspace api key targeting a workflow in another workspace', async () => {
      mockCheckHybridAuth.mockResolvedValue({
        success: true,
        userId: 'api-user',
        authType: 'api_key',
        apiKeyType: 'workspace',
        workspaceId: 'workspace-a',
      })
      mockValidateWorkflowAccess.mockResolvedValue({
        error: { message: 'Workflow not found', status: 404 },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        headers: { 'x-api-key': 'test-key' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Workflow not found')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
      expect(mockGetWorkflowById).not.toHaveBeenCalled()
      expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
    })

    it('should allow verified internal jwt without userId through the narrow precheck', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Internal Workflow',
        workspaceId: 'workspace-456',
        isDeployed: false,
        deployedAt: null,
        variables: {},
      }
      const mockNormalizedData = {
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        isFromNormalizedTables: true,
      }

      mockCheckHybridAuth.mockResolvedValue({
        success: true,
        authType: 'internal_jwt',
      })
      mockGetActiveWorkflowContext.mockResolvedValue({
        workflow: mockWorkflow,
        workspaceId: 'workspace-456',
      })
      mockLoadWorkflowFromNormalizedTables.mockResolvedValue(mockNormalizedData)

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        headers: { authorization: 'Bearer internal-token' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data.id).toBe('workflow-123')
      expect(data.data.state.blocks).toEqual(mockNormalizedData.blocks)
      expect(data.data.variables).toEqual({})
      expect(mockValidateWorkflowAccess).not.toHaveBeenCalled()
      expect(mockGetActiveWorkflowContext).toHaveBeenCalledWith('workflow-123')
      expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
    })

    it('should deny internal compatibility reads for deprecated personal workflows', async () => {
      mockCheckHybridAuth.mockResolvedValue({
        success: true,
        authType: 'internal_jwt',
      })
      mockGetActiveWorkflowContext.mockResolvedValue(null)
      mockGetWorkflowById.mockResolvedValue({
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Personal Workflow',
        workspaceId: null,
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        headers: { authorization: 'Bearer internal-token' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({
        error:
          'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
      })
      expect(mockValidateWorkflowAccess).not.toHaveBeenCalled()
    })

    it('should deny personal api key reads when middleware rejects workspace policy', async () => {
      mockCheckHybridAuth.mockResolvedValue({
        success: true,
        userId: 'api-user',
        authType: 'api_key',
        apiKeyType: 'personal',
      })
      mockValidateWorkflowAccess.mockResolvedValue({
        error: { message: 'Unauthorized: Invalid API key', status: 401 },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        headers: { 'x-api-key': 'personal-key' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized: Invalid API key' })
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })

    it('should allow personal api key reads when middleware returns scoped success', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Scoped Personal Workflow',
        workspaceId: 'workspace-456',
        isDeployed: false,
        deployedAt: null,
        variables: { secret: 'ok' },
      }
      const mockNormalizedData = {
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        isFromNormalizedTables: true,
      }

      mockCheckHybridAuth.mockResolvedValue({
        success: true,
        userId: 'api-user',
        authType: 'api_key',
        apiKeyType: 'personal',
      })
      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: {
          success: true,
          userId: 'api-user',
          authType: 'api_key',
          apiKeyType: 'personal',
          workspaceId: 'workspace-456',
        },
      })
      mockLoadWorkflowFromNormalizedTables.mockResolvedValue(mockNormalizedData)

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        headers: { 'x-api-key': 'personal-key' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data.id).toBe('workflow-123')
      expect(data.data.variables).toEqual({ secret: 'ok' })
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
      expect(mockGetWorkflowById).not.toHaveBeenCalled()
    })

    it('should allow access when user has admin workspace permission', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      const mockNormalizedData = {
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        isFromNormalizedTables: true,
      }

      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'user-123', authType: 'session' },
      })

      mockLoadWorkflowFromNormalizedTables.mockResolvedValue(mockNormalizedData)

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data.id).toBe('workflow-123')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })

    it('should allow access when user has workspace permissions', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      const mockNormalizedData = {
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        isFromNormalizedTables: true,
      }

      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'user-123', authType: 'session' },
      })

      mockLoadWorkflowFromNormalizedTables.mockResolvedValue(mockNormalizedData)

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data.id).toBe('workflow-123')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })

    it('should keep session access semantics unchanged for readable workflows', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'user-123', authType: 'session' },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data.id).toBe('workflow-123')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })

    it('should not use the internal precheck for user-backed internal callers', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Internal User Workflow',
        workspaceId: 'workspace-456',
        isDeployed: false,
        deployedAt: null,
        variables: {},
      }

      mockCheckHybridAuth.mockResolvedValue({
        success: true,
        userId: 'internal-user',
        authType: 'internal_jwt',
      })
      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'internal-user', authType: 'internal_jwt' },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        headers: { authorization: 'Bearer internal-token' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
      expect(mockGetWorkflowById).not.toHaveBeenCalled()
    })

    it('should deny access when user has no workspace permissions', async () => {
      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockResolvedValue({
        error: {
          message: 'Unauthorized: Access denied to read this workflow',
          status: 403,
        },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized: Access denied to read this workflow')
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })

    it('should use normalized tables when available', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      const mockNormalizedData = {
        blocks: { 'block-1': { id: 'block-1', type: 'starter' } },
        edges: [{ id: 'edge-1', source: 'block-1', target: 'block-2' }],
        loops: {},
        parallels: {},
        isFromNormalizedTables: true,
      }

      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'user-123', authType: 'session' },
      })

      mockLoadWorkflowFromNormalizedTables.mockResolvedValue(mockNormalizedData)

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.data.state.blocks).toEqual(mockNormalizedData.blocks)
      expect(data.data.state.edges).toEqual(mockNormalizedData.edges)
      expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'workflow-123', READ_VALIDATION)
    })
  })

  describe('DELETE /api/workflows/[id]', () => {
    it('should allow admin to delete workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })

      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'admin',
      })

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'workflow-123' }, { id: 'workflow-456' }]),
        }),
      })

      mockArchiveWorkflow.mockResolvedValue({
        archived: true,
        workflow: mockWorkflow,
      })

      setupGlobalFetchMock({ ok: true })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'DELETE',
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await DELETE(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should allow admin to delete workspace workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })

      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'admin',
      })

      // Mock db.select() to return multiple workflows so deletion is allowed
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'workflow-123' }, { id: 'workflow-456' }]),
        }),
      })

      mockArchiveWorkflow.mockResolvedValue({
        archived: true,
        workflow: mockWorkflow,
      })

      setupGlobalFetchMock({ ok: true })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'DELETE',
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await DELETE(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should allow API-key-backed deletion when workflow access is validated', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: {
          success: true,
          userId: 'api-user-1',
          authType: 'api_key',
          userName: 'API Key Actor',
          userEmail: null,
        },
      })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'admin',
      })
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'workflow-123' }, { id: 'workflow-456' }]),
        }),
      })
      setupGlobalFetchMock({ ok: true })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'DELETE',
        headers: { 'x-api-key': 'test-key' },
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await DELETE(req, { params })

      expect(response.status).toBe(200)
      expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
      expect(auditMock.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'api-user-1',
          actorName: 'API Key Actor',
          actorEmail: undefined,
        })
      )
    })

    it('should prevent deletion of the last workflow in workspace', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })

      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'admin',
      })

      // Mock db.select() to return only 1 workflow (the one being deleted)
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'workflow-123' }]),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'DELETE',
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await DELETE(req, { params })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Cannot delete the only workflow in the workspace')
    })

    it('should deny deletion for non-admin users', async () => {
      mockValidateWorkflowAccess.mockResolvedValue({
        error: {
          message: 'Unauthorized: Access denied to admin this workflow',
          status: 403,
        },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'DELETE',
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await DELETE(req, { params })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized: Access denied to admin this workflow')
    })
  })

  describe('PUT /api/workflows/[id]', () => {
    function mockDuplicateCheck(results: Array<{ id: string }> = []) {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(results),
          }),
        }),
      })
    }

    it('should allow user with write permission to update workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      const updateData = { name: 'Updated Workflow' }
      const updatedWorkflow = { ...mockWorkflow, ...updateData, updatedAt: new Date() }

      mockGetSession({ user: { id: 'user-123' } })

      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      mockDuplicateCheck([])

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedWorkflow]),
          }),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.workflow.name).toBe('Updated Workflow')
      expect(mockAuthorizeWorkflowByWorkspacePermission).not.toHaveBeenCalled()
    })

    it('should allow users with write permission to update workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'other-user',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      const updateData = { name: 'Updated Workflow' }
      const updatedWorkflow = { ...mockWorkflow, ...updateData, updatedAt: new Date() }

      mockGetSession({ user: { id: 'user-123' } })

      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      mockDuplicateCheck([])

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedWorkflow]),
          }),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.workflow.name).toBe('Updated Workflow')
    })

    it('should deny update for users with only read permission', async () => {
      const updateData = { name: 'Updated Workflow' }

      mockValidateWorkflowAccess.mockResolvedValue({
        error: {
          message: 'Unauthorized: Access denied to write this workflow',
          status: 403,
        },
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized: Access denied to write this workflow')
    })

    it('should validate request data', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })

      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      const invalidData = { name: '' }

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify(invalidData),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid request data')
    })

    it('should reject rename when duplicate name exists in same folder', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Original Name',
        folderId: 'folder-1',
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      mockDuplicateCheck([{ id: 'workflow-other' }])

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Duplicate Name' }),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toBe('A workflow named "Duplicate Name" already exists in this folder')
    })

    it('should reject rename when duplicate name exists at root level', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Original Name',
        folderId: null,
        workspaceId: 'workspace-456',
      }

      mockGetSession({ user: { id: 'user-123' } })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      mockDuplicateCheck([{ id: 'workflow-other' }])

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Duplicate Name' }),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toBe('A workflow named "Duplicate Name" already exists in this folder')
    })

    it('should allow rename when no duplicate exists in same folder', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Original Name',
        folderId: 'folder-1',
        workspaceId: 'workspace-456',
      }

      const updatedWorkflow = { ...mockWorkflow, name: 'Unique Name', updatedAt: new Date() }

      mockGetSession({ user: { id: 'user-123' } })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      mockDuplicateCheck([])

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedWorkflow]),
          }),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Unique Name' }),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.workflow.name).toBe('Unique Name')
    })

    it('should allow same name in different folders', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'My Workflow',
        folderId: 'folder-1',
        workspaceId: 'workspace-456',
      }

      const updatedWorkflow = { ...mockWorkflow, folderId: 'folder-2', updatedAt: new Date() }

      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'user-123', authType: 'session' },
      })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      // No duplicate in target folder
      mockDuplicateCheck([])

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedWorkflow]),
          }),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify({ folderId: 'folder-2' }),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.workflow.folderId).toBe('folder-2')
    })

    it('should reject moving to a folder where same name already exists', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'My Workflow',
        folderId: 'folder-1',
        workspaceId: 'workspace-456',
      }

      mockValidateWorkflowAccess.mockResolvedValue({
        workflow: mockWorkflow,
        auth: { success: true, userId: 'user-123', authType: 'session' },
      })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      // Duplicate exists in target folder
      mockDuplicateCheck([{ id: 'workflow-other' }])

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify({ folderId: 'folder-2' }),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toBe('A workflow named "My Workflow" already exists in this folder')
    })

    it('should skip duplicate check when only updating non-name/non-folder fields', async () => {
      const mockWorkflow = {
        id: 'workflow-123',
        userId: 'user-123',
        name: 'Test Workflow',
        workspaceId: 'workspace-456',
      }

      const updatedWorkflow = { ...mockWorkflow, color: '#FF0000', updatedAt: new Date() }

      mockGetSession({ user: { id: 'user-123' } })
      mockGetWorkflowById.mockResolvedValue(mockWorkflow)
      mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
        allowed: true,
        status: 200,
        workflow: mockWorkflow,
        workspacePermission: 'write',
      })

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedWorkflow]),
          }),
        }),
      })

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123', {
        method: 'PUT',
        body: JSON.stringify({ color: '#FF0000' }),
      })
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await PUT(req, { params })

      expect(response.status).toBe(200)
      // db.select should NOT have been called since no name/folder change
      expect(mockDbSelect).not.toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockGetSession({ user: { id: 'user-123' } })
      mockValidateWorkflowAccess.mockRejectedValue(new Error('Database connection timeout'))

      const req = new NextRequest('http://localhost:3000/api/workflows/workflow-123')
      const params = Promise.resolve({ id: 'workflow-123' })

      const response = await GET(req, { params })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Internal server error')
    })
  })
})
