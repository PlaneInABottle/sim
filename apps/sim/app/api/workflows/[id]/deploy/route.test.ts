/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockActivateWorkflowVersionById,
  mockCleanupWebhooksForWorkflow,
  mockCleanupDeploymentVersion,
  mockRecordAudit,
  mockDbLimit,
  mockDbOrderBy,
  mockDbFrom,
  mockDbInnerJoin,
  mockDbSelect,
  mockDbSet,
  mockDbUpdate,
  mockDbWhere,
  mockCreateSchedulesForDeploy,
  mockDeployWorkflow,
  mockLoadWorkflowFromNormalizedTables,
  mockRemoveMcpToolsForWorkflow,
  mockReactivateWorkflowVersionForRollback,
  mockRestorePreviousVersionWebhooks,
  mockSaveTriggerWebhooksForDeploy,
  mockSyncMcpToolsForWorkflow,
  mockDeleteDeploymentVersionById,
  mockUndeployWorkflow,
  mockValidatePublicApiAllowed,
  mockValidateWorkflowAccess,
  mockValidateWorkflowPermissions,
} = vi.hoisted(() => ({
  mockActivateWorkflowVersionById: vi.fn(),
  mockCleanupWebhooksForWorkflow: vi.fn(),
  mockCleanupDeploymentVersion: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbOrderBy: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbInnerJoin: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbSet: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbWhere: vi.fn(),
  mockCreateSchedulesForDeploy: vi.fn(),
  mockDeployWorkflow: vi.fn(),
  mockLoadWorkflowFromNormalizedTables: vi.fn(),
  mockRemoveMcpToolsForWorkflow: vi.fn(),
  mockReactivateWorkflowVersionForRollback: vi.fn(),
  mockRestorePreviousVersionWebhooks: vi.fn(),
  mockSaveTriggerWebhooksForDeploy: vi.fn(),
  mockSyncMcpToolsForWorkflow: vi.fn(),
  mockDeleteDeploymentVersionById: vi.fn(),
  mockUndeployWorkflow: vi.fn(),
  mockValidatePublicApiAllowed: vi.fn(),
  mockValidateWorkflowAccess: vi.fn(),
  mockValidateWorkflowPermissions: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/workflows/utils', () => ({
  validateWorkflowPermissions: (...args: unknown[]) => mockValidateWorkflowPermissions(...args),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@sim/db', () => ({
  db: { select: mockDbSelect, update: mockDbUpdate },
  workflow: { variables: 'variables', id: 'id', deployedAt: 'deployedAt' },
  workflowDeploymentVersion: {
    state: 'state',
    workflowId: 'workflowId',
    isActive: 'isActive',
    createdAt: 'createdAt',
    id: 'id',
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    and: vi.fn(),
    desc: vi.fn(),
    eq: vi.fn(),
  }
})

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: (...args: unknown[]) =>
    mockLoadWorkflowFromNormalizedTables(...args),
  deleteDeploymentVersionById: (...args: unknown[]) => mockDeleteDeploymentVersionById(...args),
  deployWorkflow: (...args: unknown[]) => mockDeployWorkflow(...args),
  reactivateWorkflowVersionForRollback: (...args: unknown[]) =>
    mockReactivateWorkflowVersionForRollback(...args),
  undeployWorkflow: (...args: unknown[]) => mockUndeployWorkflow(...args),
  activateWorkflowVersionById: (...args: unknown[]) => mockActivateWorkflowVersionById(...args),
}))

vi.mock('@/lib/workflows/comparison', () => ({
  hasWorkflowChanged: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/workflows/schedules', () => ({
  cleanupDeploymentVersion: (...args: unknown[]) => mockCleanupDeploymentVersion(...args),
  createSchedulesForDeploy: (...args: unknown[]) => mockCreateSchedulesForDeploy(...args),
  validateWorkflowSchedules: vi.fn().mockReturnValue({ isValid: true }),
}))

vi.mock('@/lib/webhooks/deploy', () => ({
  cleanupWebhooksForWorkflow: (...args: unknown[]) => mockCleanupWebhooksForWorkflow(...args),
  restorePreviousVersionWebhooks: (...args: unknown[]) =>
    mockRestorePreviousVersionWebhooks(...args),
  saveTriggerWebhooksForDeploy: (...args: unknown[]) => mockSaveTriggerWebhooksForDeploy(...args),
}))

vi.mock('@/lib/mcp/workflow-mcp-sync', () => ({
  removeMcpToolsForWorkflow: (...args: unknown[]) => mockRemoveMcpToolsForWorkflow(...args),
  syncMcpToolsForWorkflow: (...args: unknown[]) => mockSyncMcpToolsForWorkflow(...args),
}))

vi.mock('@/lib/audit/log', () => ({
  AuditAction: {},
  AuditResourceType: {},
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
}))

vi.mock('@/ee/access-control/utils/permission-check', () => ({
  PublicApiNotAllowedError: class PublicApiNotAllowedError extends Error {},
  validatePublicApiAllowed: (...args: unknown[]) => mockValidatePublicApiAllowed(...args),
}))

import { DELETE, PATCH, POST } from '@/app/api/workflows/[id]/deploy/route'

describe('Workflow deploy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin })
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit, orderBy: mockDbOrderBy })
    mockDbOrderBy.mockReturnValue({ limit: mockDbLimit })
    mockDbLimit.mockResolvedValue([])
    mockDbUpdate.mockReturnValue({ set: mockDbSet })
    mockDbSet.mockReturnValue({ where: mockDbWhere })
    mockCleanupWebhooksForWorkflow.mockResolvedValue(undefined)
    mockCreateSchedulesForDeploy.mockResolvedValue({ success: true })
    mockCleanupDeploymentVersion.mockResolvedValue(undefined)
    mockDeleteDeploymentVersionById.mockResolvedValue({ success: true })
    mockLoadWorkflowFromNormalizedTables.mockResolvedValue({
      blocks: { 'block-1': { id: 'block-1', type: 'start_trigger', name: 'Start' } },
      edges: [],
      loops: {},
      parallels: {},
    })
    mockActivateWorkflowVersionById.mockResolvedValue({ success: true })
    mockReactivateWorkflowVersionForRollback.mockResolvedValue({ success: true })
    mockRestorePreviousVersionWebhooks.mockResolvedValue(undefined)
    mockSaveTriggerWebhooksForDeploy.mockResolvedValue({ success: true, warnings: [] })
    mockRemoveMcpToolsForWorkflow.mockResolvedValue(undefined)
    mockSyncMcpToolsForWorkflow.mockResolvedValue(undefined)
    mockValidatePublicApiAllowed.mockResolvedValue(undefined)
  })

  it('allows API-key auth for deploy using hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: 'api_key',
      },
    })
    mockDeployWorkflow.mockResolvedValue({
      success: true,
      deployedAt: '2024-01-01T00:00:00Z',
      deploymentVersionId: 'dep-1',
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await POST(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.isDeployed).toBe(true)
    expect(mockDeployWorkflow).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      deployedBy: 'api-user',
      workflowName: 'Test Workflow',
    })
    expect(mockValidateWorkflowPermissions).not.toHaveBeenCalled()
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'api-user',
        actorName: 'API Key Actor',
        actorEmail: 'api@example.com',
      })
    )
  })

  it('returns success when MCP sync throws after deploy succeeds', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: 'api_key',
      },
    })
    mockDeployWorkflow.mockResolvedValue({
      success: true,
      deployedAt: '2024-01-01T00:00:00Z',
      deploymentVersionId: 'dep-1',
    })
    mockSyncMcpToolsForWorkflow.mockRejectedValue(new Error('MCP sync failed'))

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await POST(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.isDeployed).toBe(true)
    expect(mockRecordAudit).toHaveBeenCalled()
  })

  it('preserves prior deployedAt when failed redeploy rolls back', async () => {
    mockDbLimit.mockResolvedValue([
      { id: 'prev-1', deployedAt: new Date('2024-01-01T00:00:00.000Z') },
    ])
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: 'api_key',
      },
    })
    mockDeployWorkflow.mockResolvedValue({
      success: true,
      deployedAt: '2024-02-01T00:00:00Z',
      deploymentVersionId: 'dep-failed',
    })
    mockSaveTriggerWebhooksForDeploy.mockResolvedValue({
      success: false,
      error: { message: 'Failed to save trigger configuration', status: 500 },
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await POST(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(500)
    expect(mockReactivateWorkflowVersionForRollback).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      deploymentVersionId: 'prev-1',
      deployedAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    expect(mockActivateWorkflowVersionById).not.toHaveBeenCalled()
    expect(mockRestorePreviousVersionWebhooks).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
        previousVersionId: 'prev-1',
        requestId: 'req-123',
        userId: 'api-user',
      })
    )
    expect(mockDeleteDeploymentVersionById).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      deploymentVersionId: 'dep-failed',
    })
  })

  it('deletes failed created deployment version when first deploy rollback runs', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: 'api_key',
      },
    })
    mockDeployWorkflow.mockResolvedValue({
      success: true,
      deployedAt: '2024-02-01T00:00:00Z',
      deploymentVersionId: 'dep-failed',
    })
    mockSaveTriggerWebhooksForDeploy.mockResolvedValue({
      success: false,
      error: { message: 'Failed to save trigger configuration', status: 500 },
    })
    mockDbLimit.mockResolvedValue([])
    mockUndeployWorkflow.mockResolvedValue({ success: true })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await POST(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(500)
    expect(mockDeleteDeploymentVersionById).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      deploymentVersionId: 'dep-failed',
    })
    expect(mockUndeployWorkflow).toHaveBeenCalledWith({ workflowId: 'wf-1' })
  })

  it('allows API-key auth for undeploy using hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: 'api_key',
      },
    })
    mockUndeployWorkflow.mockResolvedValue({ success: true })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'DELETE',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await DELETE(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.isDeployed).toBe(false)
    expect(mockUndeployWorkflow).toHaveBeenCalledWith({ workflowId: 'wf-1' })
    expect(mockValidateWorkflowPermissions).not.toHaveBeenCalled()
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'api-user',
        actorName: 'API Key Actor',
        actorEmail: 'api@example.com',
      })
    )
  })

  it('returns success when webhook cleanup throws after undeploy succeeds', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: 'api_key',
      },
    })
    mockUndeployWorkflow.mockResolvedValue({ success: true })
    mockCleanupWebhooksForWorkflow.mockRejectedValue(new Error('cleanup failed'))

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'DELETE',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await DELETE(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.isDeployed).toBe(false)
    expect(mockRemoveMcpToolsForWorkflow).toHaveBeenCalledWith('wf-1', 'req-123')
    expect(mockRecordAudit).toHaveBeenCalled()
  })

  it('checks public API restrictions against hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'api-user', authType: 'api_key' },
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ isPublicApi: true }),
    })
    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    expect(mockValidatePublicApiAllowed).toHaveBeenCalledWith('api-user')
  })

  it('returns 400 for malformed JSON bodies without permission checks or updates', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'api-user', authType: 'api_key' },
    })

    const req = {
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as NextRequest

    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Invalid JSON body',
      code: 'INVALID_JSON_BODY',
    })
    expect(mockValidatePublicApiAllowed).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when isPublicApi is not a boolean', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'api-user', authType: 'api_key' },
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deploy', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ isPublicApi: 'yes' }),
    })
    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(400)
    expect(mockValidatePublicApiAllowed).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})
