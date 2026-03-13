/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCleanupWebhooksForWorkflow,
  mockRecordAudit,
  mockDbLimit,
  mockDbOrderBy,
  mockDbFrom,
  mockDbSelect,
  mockDbSet,
  mockDbUpdate,
  mockDbWhere,
  mockCreateSchedulesForDeploy,
  mockDeployWorkflow,
  mockLoadWorkflowFromNormalizedTables,
  mockRemoveMcpToolsForWorkflow,
  mockSaveTriggerWebhooksForDeploy,
  mockSyncMcpToolsForWorkflow,
  mockUndeployWorkflow,
  mockValidatePublicApiAllowed,
  mockValidateWorkflowAccess,
  mockValidateWorkflowPermissions,
} = vi.hoisted(() => ({
  mockCleanupWebhooksForWorkflow: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbOrderBy: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbSet: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbWhere: vi.fn(),
  mockCreateSchedulesForDeploy: vi.fn(),
  mockDeployWorkflow: vi.fn(),
  mockLoadWorkflowFromNormalizedTables: vi.fn(),
  mockRemoveMcpToolsForWorkflow: vi.fn(),
  mockSaveTriggerWebhooksForDeploy: vi.fn(),
  mockSyncMcpToolsForWorkflow: vi.fn(),
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
  workflow: { variables: 'variables', id: 'id' },
  workflowDeploymentVersion: { state: 'state', workflowId: 'workflowId', isActive: 'isActive', createdAt: 'createdAt', id: 'id' },
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
  loadWorkflowFromNormalizedTables: (...args: unknown[]) => mockLoadWorkflowFromNormalizedTables(...args),
  deployWorkflow: (...args: unknown[]) => mockDeployWorkflow(...args),
  undeployWorkflow: (...args: unknown[]) => mockUndeployWorkflow(...args),
}))

vi.mock('@/lib/workflows/comparison', () => ({
  hasWorkflowChanged: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/workflows/schedules', () => ({
  cleanupDeploymentVersion: vi.fn(),
  createSchedulesForDeploy: (...args: unknown[]) => mockCreateSchedulesForDeploy(...args),
  validateWorkflowSchedules: vi.fn().mockReturnValue({ isValid: true }),
}))

vi.mock('@/lib/webhooks/deploy', () => ({
  cleanupWebhooksForWorkflow: (...args: unknown[]) => mockCleanupWebhooksForWorkflow(...args),
  restorePreviousVersionWebhooks: vi.fn(),
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
    mockDbFrom.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit, orderBy: mockDbOrderBy })
    mockDbOrderBy.mockReturnValue({ limit: mockDbLimit })
    mockDbLimit.mockResolvedValue([])
    mockDbUpdate.mockReturnValue({ set: mockDbSet })
    mockDbSet.mockReturnValue({ where: mockDbWhere })
    mockCleanupWebhooksForWorkflow.mockResolvedValue(undefined)
    mockCreateSchedulesForDeploy.mockResolvedValue({ success: true })
    mockLoadWorkflowFromNormalizedTables.mockResolvedValue({
      blocks: { 'block-1': { id: 'block-1', type: 'start_trigger', name: 'Start' } },
      edges: [],
      loops: {},
      parallels: {},
    })
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
        actorName: undefined,
        actorEmail: undefined,
      })
    )
  })

  it('allows API-key auth for undeploy using hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: {
        success: true,
        userId: 'api-user',
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
        actorName: undefined,
        actorEmail: undefined,
      })
    )
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
})
