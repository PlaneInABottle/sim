/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbFrom,
  mockDbLimit,
  mockDbSelect,
  mockDbWhere,
  mockRecordAudit,
  mockRestoreWorkflowDraftState,
  mockSyncMcpToolsForWorkflow,
  mockValidateWorkflowAccess,
} = vi.hoisted(() => ({
  mockDbFrom: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbWhere: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockRestoreWorkflowDraftState: vi.fn(),
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
  },
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
  restoreWorkflowDraftState: (...args: unknown[]) => mockRestoreWorkflowDraftState(...args),
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
    mockRestoreWorkflowDraftState.mockResolvedValue({ success: true })
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
    expect(mockRestoreWorkflowDraftState).toHaveBeenCalled()
    expect(mockSyncMcpToolsForWorkflow).toHaveBeenCalled()
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'api-user',
        actorName: 'API Key Actor',
        actorEmail: 'api@example.com',
      })
    )
  })

  it('restores variables from the deployment snapshot', async () => {
    mockDbLimit.mockResolvedValue([
      {
        state: {
          blocks: { 'block-1': { id: 'block-1', type: 'start_trigger', name: 'Start' } },
          edges: [],
          loops: {},
          parallels: {},
          variables: {
            var1: { id: 'var1', name: 'API Token', type: 'string', value: 'secret' },
          },
        },
      },
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

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3/revert', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })

    await POST(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(mockRestoreWorkflowDraftState).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        variables: {
          var1: { id: 'var1', name: 'API Token', type: 'string', value: 'secret' },
        },
      })
    )
  })

  it('defaults variables safely when missing from the deployment snapshot', async () => {
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

    await POST(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(mockRestoreWorkflowDraftState).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        variables: {},
      })
    )
  })

  it('returns success when MCP sync throws after revert succeeds', async () => {
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
    mockSyncMcpToolsForWorkflow.mockRejectedValue(new Error('MCP sync failed'))

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments/3/revert', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await POST(req, { params: Promise.resolve({ id: 'wf-1', version: '3' }) })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.message).toBe('Reverted to deployment version')
    expect(mockRecordAudit).toHaveBeenCalled()
  })
})
