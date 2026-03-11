/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockValidateWorkflowAccess = vi.fn()
const mockDbSelect = vi.fn()
const mockDbFrom = vi.fn()
const mockDbWhere = vi.fn()
const mockDbLimit = vi.fn()
const mockDbOrderBy = vi.fn()
const mockDeployWorkflow = vi.fn()
const mockUndeployWorkflow = vi.fn()
const mockCleanupWebhooksForWorkflow = vi.fn()
const mockRemoveMcpToolsForWorkflow = vi.fn()

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/workflows/utils', () => ({
  validateWorkflowPermissions: vi.fn(),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@sim/db', () => ({
  db: { select: mockDbSelect },
  workflow: { variables: 'variables', id: 'id' },
  workflowDeploymentVersion: { state: 'state', workflowId: 'workflowId', isActive: 'isActive', createdAt: 'createdAt', id: 'id' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: vi.fn().mockResolvedValue(null),
  deployWorkflow: (...args: unknown[]) => mockDeployWorkflow(...args),
  undeployWorkflow: (...args: unknown[]) => mockUndeployWorkflow(...args),
}))

vi.mock('@/lib/workflows/comparison', () => ({
  hasWorkflowChanged: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/workflows/schedules', () => ({
  cleanupDeploymentVersion: vi.fn(),
  createSchedulesForDeploy: vi.fn(),
  validateWorkflowSchedules: vi.fn().mockReturnValue({ isValid: true }),
}))

vi.mock('@/lib/webhooks/deploy', () => ({
  cleanupWebhooksForWorkflow: (...args: unknown[]) => mockCleanupWebhooksForWorkflow(...args),
  restorePreviousVersionWebhooks: vi.fn(),
  saveTriggerWebhooksForDeploy: vi.fn(),
}))

vi.mock('@/lib/mcp/workflow-mcp-sync', () => ({
  removeMcpToolsForWorkflow: (...args: unknown[]) => mockRemoveMcpToolsForWorkflow(...args),
  syncMcpToolsForWorkflow: vi.fn(),
}))

vi.mock('@/lib/audit/log', () => ({
  AuditAction: {},
  AuditResourceType: {},
  recordAudit: vi.fn(),
}))

import { POST, DELETE } from '@/app/api/workflows/[id]/deploy/route'

describe('Workflow deploy route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit, orderBy: mockDbOrderBy })
    mockDbOrderBy.mockReturnValue({ limit: mockDbLimit })
    mockDbLimit.mockResolvedValue([])
    mockCleanupWebhooksForWorkflow.mockResolvedValue(undefined)
    mockRemoveMcpToolsForWorkflow.mockResolvedValue(undefined)
  })

  it('allows API-key auth for deploy using hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'api-user', authType: 'api_key' },
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
  })

  it('allows API-key auth for undeploy using hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'api-user', authType: 'api_key' },
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
  })
})
