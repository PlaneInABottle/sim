/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockActivateWorkflowVersion,
  mockAuthorizeWorkflowByWorkspacePermission,
  mockCreateSchedulesForDeploy,
  mockDbFrom,
  mockDbLimit,
  mockDbReturning,
  mockDbSelect,
  mockDbSet,
  mockDbUpdate,
  mockDbWhere,
  mockDbWhereUpdate,
  mockRecordAudit,
  mockSaveTriggerWebhooksForDeploy,
  mockSyncMcpToolsForWorkflow,
  mockValidateWorkflowAccess,
} = vi.hoisted(() => ({
  mockActivateWorkflowVersion: vi.fn(),
  mockAuthorizeWorkflowByWorkspacePermission: vi.fn(),
  mockCreateSchedulesForDeploy: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbReturning: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbSet: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbWhereUpdate: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockSaveTriggerWebhooksForDeploy: vi.fn(),
  mockSyncMcpToolsForWorkflow: vi.fn(),
  mockValidateWorkflowAccess: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@sim/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  workflowDeploymentVersion: {
    id: 'id',
    state: 'state',
    workflowId: 'workflowId',
    version: 'version',
    isActive: 'isActive',
    name: 'name',
    description: 'description',
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    and: vi.fn(),
    eq: vi.fn(),
  }
})

vi.mock('@/lib/webhooks/deploy', () => ({
  restorePreviousVersionWebhooks: vi.fn(),
  saveTriggerWebhooksForDeploy: (...args: unknown[]) => mockSaveTriggerWebhooksForDeploy(...args),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  activateWorkflowVersion: (...args: unknown[]) => mockActivateWorkflowVersion(...args),
}))

vi.mock('@/lib/workflows/schedules', () => ({
  cleanupDeploymentVersion: vi.fn(),
  createSchedulesForDeploy: (...args: unknown[]) => mockCreateSchedulesForDeploy(...args),
  validateWorkflowSchedules: vi.fn(() => ({ isValid: true })),
}))

vi.mock('@/lib/mcp/workflow-mcp-sync', () => ({
  syncMcpToolsForWorkflow: (...args: unknown[]) => mockSyncMcpToolsForWorkflow(...args),
}))

vi.mock('@/lib/workflows/utils', () => ({
  authorizeWorkflowByWorkspacePermission: (...args: unknown[]) =>
    mockAuthorizeWorkflowByWorkspacePermission(...args),
}))

vi.mock('@/lib/audit/log', () => ({
  AuditAction: { WORKFLOW_DEPLOYMENT_ACTIVATED: 'WORKFLOW_DEPLOYMENT_ACTIVATED' },
  AuditResourceType: { WORKFLOW: 'WORKFLOW' },
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
}))

import { PATCH } from '@/app/api/workflows/[id]/deployments/[version]/route'

describe('Workflow deployment version route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit })
    mockDbLimit
      .mockResolvedValueOnce([
        {
          id: 'dep-3',
          state: {
            blocks: { 'block-1': { id: 'block-1', type: 'start_trigger', name: 'Start' } },
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'dep-2' }])
    mockDbUpdate.mockReturnValue({ set: mockDbSet })
    mockDbSet.mockReturnValue({ where: mockDbWhereUpdate })
    mockDbWhereUpdate.mockReturnValue({ returning: mockDbReturning })
    mockDbReturning.mockResolvedValue([])
    mockSaveTriggerWebhooksForDeploy.mockResolvedValue({ success: true, warnings: [] })
    mockCreateSchedulesForDeploy.mockResolvedValue({ success: true })
    mockActivateWorkflowVersion.mockResolvedValue({
      success: true,
      deployedAt: '2024-01-17T12:00:00.000Z',
    })
    mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({ allowed: true, status: 200 })
  })

  it('uses write permission for metadata-only patch updates', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'user-1', authType: 'session' },
    })
    mockDbReturning.mockResolvedValue([{ id: 'dep-3', name: 'Renamed', description: 'Updated' }])

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', description: 'Updated' }),
    })
    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(200)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledTimes(1)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'wf-1', {
      requireDeployment: false,
      action: 'write',
    })
    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
    expect(mockActivateWorkflowVersion).not.toHaveBeenCalled()
  })

  it('allows API-key auth for activation using hybrid auth userId', async () => {
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

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ isActive: true }),
    })
    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(200)
    expect(mockValidateWorkflowAccess).toHaveBeenNthCalledWith(1, req, 'wf-1', {
      requireDeployment: false,
      action: 'write',
    })
    expect(mockValidateWorkflowAccess).toHaveBeenCalledTimes(1)
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      userId: 'api-user',
      action: 'admin',
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
    })
    expect(mockSaveTriggerWebhooksForDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'api-user' })
    )
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'api-user',
        actorName: 'API Key Actor',
        actorEmail: 'api@example.com',
      })
    )
  })

  it('returns write auth failure before parsing or updating metadata', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      error: { message: 'Write permission required', status: 403 },
    })

    const jsonSpy = vi.fn().mockResolvedValue({ name: 'Renamed' })
    const req = {
      json: jsonSpy,
    } as unknown as NextRequest

    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(403)
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockActivateWorkflowVersion).not.toHaveBeenCalled()
  })

  it('returns admin auth failure before activation side effects', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'user-1', authType: 'session' },
    })
    mockAuthorizeWorkflowByWorkspacePermission.mockResolvedValue({
      allowed: false,
      status: 403,
      message: 'Admin permission required',
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(403)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledTimes(1)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'wf-1', {
      requireDeployment: false,
      action: 'write',
    })
    expect(mockAuthorizeWorkflowByWorkspacePermission).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      userId: 'user-1',
      action: 'admin',
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
    })
    expect(mockDbSelect).not.toHaveBeenCalled()
    expect(mockSaveTriggerWebhooksForDeploy).not.toHaveBeenCalled()
    expect(mockCreateSchedulesForDeploy).not.toHaveBeenCalled()
    expect(mockActivateWorkflowVersion).not.toHaveBeenCalled()
  })
})
