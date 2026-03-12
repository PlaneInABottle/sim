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
const mockSaveTriggerWebhooksForDeploy = vi.fn()
const mockCreateSchedulesForDeploy = vi.fn()
const mockActivateWorkflowVersion = vi.fn()
const mockSyncMcpToolsForWorkflow = vi.fn()

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
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) }),
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

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}))

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

vi.mock('@/lib/audit/log', () => ({
  AuditAction: { WORKFLOW_DEPLOYMENT_ACTIVATED: 'WORKFLOW_DEPLOYMENT_ACTIVATED' },
  AuditResourceType: { WORKFLOW: 'WORKFLOW' },
  recordAudit: vi.fn(),
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
    mockSaveTriggerWebhooksForDeploy.mockResolvedValue({ success: true, warnings: [] })
    mockCreateSchedulesForDeploy.mockResolvedValue({ success: true })
    mockActivateWorkflowVersion.mockResolvedValue({
      success: true,
      deployedAt: '2024-01-17T12:00:00.000Z',
    })
  })

  it('allows API-key auth for activation using hybrid auth userId', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', name: 'Test Workflow', workspaceId: 'ws-1' },
      auth: { success: true, userId: 'api-user', authType: 'api_key' },
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ isActive: true }),
    })
    const response = await PATCH(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(200)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'wf-1', {
      requireDeployment: false,
      action: 'admin',
    })
    expect(mockSaveTriggerWebhooksForDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'api-user' })
    )
  })
})
