/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDbFrom,
  mockDbLeftJoin,
  mockDbOrderBy,
  mockDbSelect,
  mockDbWhere,
  mockValidateWorkflowAccess,
} = vi.hoisted(() => ({
  mockDbFrom: vi.fn(),
  mockDbLeftJoin: vi.fn(),
  mockDbOrderBy: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbWhere: vi.fn(),
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
  db: { select: mockDbSelect },
  user: { name: 'name', id: 'id' },
  workflowDeploymentVersion: {
    id: 'id',
    version: 'version',
    name: 'name',
    description: 'description',
    isActive: 'isActive',
    createdAt: 'createdAt',
    createdBy: 'createdBy',
    workflowId: 'workflowId',
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    desc: vi.fn(),
    eq: vi.fn(),
  }
})

import { GET } from '@/app/api/workflows/[id]/deployments/route'

describe('Workflow deployments list route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbSelect.mockReturnValue({ from: mockDbFrom })
    mockDbFrom.mockReturnValue({ leftJoin: mockDbLeftJoin })
    mockDbLeftJoin.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockReturnValue({ orderBy: mockDbOrderBy })
    mockDbOrderBy.mockResolvedValue([
      {
        id: 'dep-1',
        version: 3,
        name: 'Current active deployment',
        description: 'Latest deployed state',
        isActive: true,
        createdAt: '2024-01-16T12:00:00.000Z',
        createdBy: 'admin-api',
        deployedBy: null,
      },
    ])
  })

  it('uses hybrid workflow access for read auth', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({ workflow: { id: 'wf-1' } })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployments', {
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
