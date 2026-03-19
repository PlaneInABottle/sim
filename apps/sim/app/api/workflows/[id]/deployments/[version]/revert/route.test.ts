/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbFrom,
  mockDbLimit,
  mockDbSelect,
  mockDbSet,
  mockDbUpdate,
  mockDbWhere,
  mockDbWhereUpdate,
  mockRecordAudit,
  mockSaveWorkflowToNormalizedTables,
  mockSyncMcpToolsForWorkflow,
  mockValidateWorkflowAccess,
} = vi.hoisted(() => ({
  mockDbFrom: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbSet: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbWhereUpdate: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockSaveWorkflowToNormalizedTables: vi.fn(),
  mockSyncMcpToolsForWorkflow: vi.fn(),
  mockValidateWorkflowAccess: vi.fn(),
}))
const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@/lib/core/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/core/config/env')>()

  return {
    ...actual,
    env: {
      ...actual.env,
      INTERNAL_API_SECRET: 'internal-secret',
      SOCKET_SERVER_URL: 'http://localhost:3002',
    },
  }
})

vi.mock('@sim/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  workflow: { id: 'id' },
  workflowDeploymentVersion: {
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

vi.mock('@/lib/workflows/persistence/utils', () => ({
  saveWorkflowToNormalizedTables: (...args: unknown[]) =>
    mockSaveWorkflowToNormalizedTables(...args),
}))

vi.mock('@/lib/mcp/workflow-mcp-sync', () => ({
  syncMcpToolsForWorkflow: (...args: unknown[]) => mockSyncMcpToolsForWorkflow(...args),
}))

vi.mock('@/lib/audit/log', () => ({
  AuditAction: { WORKFLOW_DEPLOYMENT_REVERTED: 'WORKFLOW_DEPLOYMENT_REVERTED' },
  AuditResourceType: { WORKFLOW: 'WORKFLOW' },
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
}))

import { POST } from '@/app/api/workflows/[id]/deployments/[version]/revert/route'

describe('Workflow deployment version revert route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit })
    mockDbLimit.mockResolvedValue([
      {
        state: {
          blocks: { 'block-1': { id: 'block-1', type: 'start_trigger', name: 'Start' } },
          edges: [],
          loops: {},
          parallels: {},
        },
      },
    ])
    mockDbUpdate.mockReturnValue({ set: mockDbSet })
    mockDbSet.mockReturnValue({ where: mockDbWhereUpdate })
    mockDbWhereUpdate.mockResolvedValue(undefined)
    mockSaveWorkflowToNormalizedTables.mockResolvedValue({ success: true })
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('allows API-key auth for revert using hybrid auth userId', async () => {
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

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3/revert', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await POST(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(200)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'wf-1', {
      requireDeployment: false,
      action: 'admin',
    })
    expect(mockSaveWorkflowToNormalizedTables).toHaveBeenCalled()
    expect(mockSyncMcpToolsForWorkflow).toHaveBeenCalled()
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'api-user',
        actorName: 'API Key Actor',
        actorEmail: 'api@example.com',
      })
    )
  })
})
