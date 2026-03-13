/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbFrom,
  mockDbLimit,
  mockDbOrderBy,
  mockDbSelect,
  mockDbWhere,
  mockHasWorkflowChanged,
  mockLoadWorkflowFromNormalizedTables,
  mockValidateWorkflowAccess,
} = vi.hoisted(() => ({
  mockDbFrom: vi.fn(),
  mockDbLimit: vi.fn(),
  mockDbOrderBy: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbWhere: vi.fn(),
  mockHasWorkflowChanged: vi.fn(),
  mockLoadWorkflowFromNormalizedTables: vi.fn(),
  mockValidateWorkflowAccess: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: (...args: unknown[]) => mockLoadWorkflowFromNormalizedTables(...args),
}))

vi.mock('@/lib/workflows/comparison', () => ({
  hasWorkflowChanged: (...args: unknown[]) => mockHasWorkflowChanged(...args),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@sim/db', () => ({
  db: {
    select: mockDbSelect,
  },
  workflow: { variables: 'variables', id: 'id' },
  workflowDeploymentVersion: { state: 'state', workflowId: 'workflowId', isActive: 'isActive', createdAt: 'createdAt' },
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

import { GET } from '@/app/api/workflows/[id]/status/route'

describe('Workflow status route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ limit: mockDbLimit, orderBy: mockDbOrderBy })
    mockDbOrderBy.mockReturnValue({ limit: mockDbLimit })
  })

  it('uses hybrid workflow access for read auth', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({
      workflow: { id: 'wf-1', isDeployed: false, deployedAt: null, isPublished: false },
    })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/status', {
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await GET(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'wf-1', {
      requireDeployment: false,
      action: 'read',
    })
  })
})
