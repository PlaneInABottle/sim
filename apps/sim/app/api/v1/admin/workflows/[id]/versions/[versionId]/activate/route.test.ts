/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockActivateWorkflowVersion,
  mockCleanupDeploymentVersion,
  mockCreateSchedulesForDeploy,
  mockDbFrom,
  mockDbLimit,
  mockDbSelect,
  mockDbWhere,
  mockGetActiveWorkflowRecord,
  mockRestorePreviousVersionWebhooks,
  mockSaveTriggerWebhooksForDeploy,
  mockSyncMcpToolsForWorkflow,
  mockValidateWorkflowSchedules,
} = vi.hoisted(() => ({
  mockActivateWorkflowVersion: vi.fn(),
  mockCleanupDeploymentVersion: vi.fn(),
  mockCreateSchedulesForDeploy: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbWhere: vi.fn(),
  mockGetActiveWorkflowRecord: vi.fn(),
  mockRestorePreviousVersionWebhooks: vi.fn(),
  mockSaveTriggerWebhooksForDeploy: vi.fn(),
  mockSyncMcpToolsForWorkflow: vi.fn(),
  mockValidateWorkflowSchedules: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}))

vi.mock('@sim/db', () => ({
  db: { select: mockDbSelect },
  workflowDeploymentVersion: {
    id: 'id',
    state: 'state',
    workflowId: 'workflowId',
    isActive: 'isActive',
    version: 'version',
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

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@/lib/mcp/workflow-mcp-sync', () => ({
  syncMcpToolsForWorkflow: (...args: unknown[]) => mockSyncMcpToolsForWorkflow(...args),
}))

vi.mock('@/lib/webhooks/deploy', () => ({
  restorePreviousVersionWebhooks: (...args: unknown[]) => mockRestorePreviousVersionWebhooks(...args),
  saveTriggerWebhooksForDeploy: (...args: unknown[]) => mockSaveTriggerWebhooksForDeploy(...args),
}))

vi.mock('@/lib/workflows/active-context', () => ({
  getActiveWorkflowRecord: (...args: unknown[]) => mockGetActiveWorkflowRecord(...args),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  activateWorkflowVersion: (...args: unknown[]) => mockActivateWorkflowVersion(...args),
}))

vi.mock('@/lib/workflows/schedules', () => ({
  cleanupDeploymentVersion: (...args: unknown[]) => mockCleanupDeploymentVersion(...args),
  createSchedulesForDeploy: (...args: unknown[]) => mockCreateSchedulesForDeploy(...args),
  validateWorkflowSchedules: (...args: unknown[]) => mockValidateWorkflowSchedules(...args),
}))

vi.mock('@/app/api/v1/admin/middleware', () => ({
  withAdminAuthParams: <TParams,>(
    handler: (
      request: NextRequest,
      context: { params: Promise<TParams> }
    ) => Promise<Response>
  ) => handler,
}))

import { POST } from '@/app/api/v1/admin/workflows/[id]/versions/[versionId]/activate/route'

describe('Admin workflow activate version route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit })
    mockGetActiveWorkflowRecord.mockResolvedValue({
      id: 'wf-1',
      name: 'Test Workflow',
      userId: 'user-1',
    })
    mockValidateWorkflowSchedules.mockReturnValue({ isValid: true })
    mockSaveTriggerWebhooksForDeploy.mockResolvedValue({ success: true, warnings: ['warn-1'] })
    mockCreateSchedulesForDeploy.mockResolvedValue({ success: true })
    mockActivateWorkflowVersion.mockResolvedValue({
      success: true,
      deployedAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    mockCleanupDeploymentVersion.mockResolvedValue(undefined)
    mockRestorePreviousVersionWebhooks.mockResolvedValue(undefined)
    mockSyncMcpToolsForWorkflow.mockResolvedValue(undefined)
  })

  it('returns 200 with warnings for a successful activation', async () => {
    const versionState = {
      blocks: { start: { id: 'start', type: 'start_trigger', name: 'Start' } },
    }
    mockDbLimit
      .mockResolvedValueOnce([{ id: 'dep-3', state: versionState }])
      .mockResolvedValueOnce([{ id: 'dep-2' }])

    const req = new NextRequest(
      'http://localhost:3000/api/v1/admin/workflows/wf-1/versions/3/activate',
      { method: 'POST' }
    )
    const response = await POST(req, {
      params: Promise.resolve({ id: 'wf-1', versionId: '3' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        success: true,
        version: 3,
        deployedAt: '2024-01-01T00:00:00.000Z',
        warnings: ['warn-1'],
      },
    })
    expect(mockActivateWorkflowVersion).toHaveBeenCalledWith({ workflowId: 'wf-1', version: 3 })
    expect(mockSyncMcpToolsForWorkflow).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      requestId: 'req-123',
      state: versionState,
      context: 'activate',
    })
  })

  it('returns success when MCP sync throws after activation succeeds', async () => {
    const versionState = {
      blocks: { start: { id: 'start', type: 'start_trigger', name: 'Start' } },
    }
    mockDbLimit
      .mockResolvedValueOnce([{ id: 'dep-3', state: versionState }])
      .mockResolvedValueOnce([{ id: 'dep-2' }])
    mockSyncMcpToolsForWorkflow.mockRejectedValue(new Error('MCP sync failed'))

    const req = new NextRequest(
      'http://localhost:3000/api/v1/admin/workflows/wf-1/versions/3/activate',
      { method: 'POST' }
    )
    const response = await POST(req, {
      params: Promise.resolve({ id: 'wf-1', versionId: '3' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        success: true,
        version: 3,
        deployedAt: '2024-01-01T00:00:00.000Z',
        warnings: ['warn-1'],
      },
    })
    expect(mockActivateWorkflowVersion).toHaveBeenCalledWith({ workflowId: 'wf-1', version: 3 })
    expect(mockSyncMcpToolsForWorkflow).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      requestId: 'req-123',
      state: versionState,
      context: 'activate',
    })
    expect(mockActivateWorkflowVersion.mock.invocationCallOrder[0]).toBeLessThan(
      mockSyncMcpToolsForWorkflow.mock.invocationCallOrder[0]
    )
  })

  it('returns 400 for invalid version numbers before loading deployment rows', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/admin/workflows/wf-1/versions/not-a-number/activate',
      { method: 'POST' }
    )
    const response = await POST(req, {
      params: Promise.resolve({ id: 'wf-1', versionId: 'not-a-number' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid version number',
      },
    })
    expect(mockDbSelect).not.toHaveBeenCalled()
  })
})
