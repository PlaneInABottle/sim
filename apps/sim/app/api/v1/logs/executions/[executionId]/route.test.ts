/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const dbSelect = vi.fn()
  const eq = vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value }))
  const and = vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions }))

  const rowBuilder = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  }

  const snapshotBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  }

  return {
    dbSelect,
    eq,
    and,
    rowBuilder,
    snapshotBuilder,
    checkRateLimit: vi.fn(),
    createRateLimitResponse: vi.fn(),
    createApiResponse: vi.fn(),
    getUserLimits: vi.fn(),
  }
})

vi.mock('@sim/db', () => ({
  db: {
    select: mocks.dbSelect,
  },
}))

vi.mock('@sim/db/schema', () => ({
  permissions: {
    entityType: 'permissions.entityType',
    entityId: 'permissions.entityId',
    userId: 'permissions.userId',
  },
  workflow: {
    id: 'workflow.id',
    workspaceId: 'workflow.workspaceId',
  },
  workflowExecutionLogs: {
    workflowId: 'workflowExecutionLogs.workflowId',
    executionId: 'workflowExecutionLogs.executionId',
    stateSnapshotId: 'workflowExecutionLogs.stateSnapshotId',
    trigger: 'workflowExecutionLogs.trigger',
    startedAt: 'workflowExecutionLogs.startedAt',
    endedAt: 'workflowExecutionLogs.endedAt',
    totalDurationMs: 'workflowExecutionLogs.totalDurationMs',
    cost: 'workflowExecutionLogs.cost',
    workspaceId: 'workflowExecutionLogs.workspaceId',
  },
  workflowExecutionSnapshots: {
    id: 'workflowExecutionSnapshots.id',
  },
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
}))

vi.mock('@/app/api/v1/logs/meta', () => ({
  createApiResponse: mocks.createApiResponse,
  getUserLimits: mocks.getUserLimits,
}))

vi.mock('@/app/api/v1/middleware', () => ({
  checkRateLimit: mocks.checkRateLimit,
  createRateLimitResponse: mocks.createRateLimitResponse,
}))

import { GET } from './route'

describe('GET /api/v1/logs/executions/[executionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dbSelect.mockReturnValueOnce(mocks.rowBuilder).mockReturnValueOnce(mocks.snapshotBuilder)
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      userId: 'user-1',
      limit: 100,
      remaining: 99,
      resetAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    mocks.getUserLimits.mockResolvedValue({ usage: {}, workflowExecutionRateLimit: {} })
    mocks.createApiResponse.mockImplementation((body: unknown) => ({ body, headers: {} }))
  })

  it('returns orphaned execution rows when workflow is missing', async () => {
    mocks.rowBuilder.limit.mockResolvedValueOnce([
      {
        log: {
          workflowId: 'wf-missing',
          stateSnapshotId: 'snap-1',
          trigger: 'api',
          startedAt: new Date('2025-01-01T00:00:00.000Z'),
          endedAt: null,
          totalDurationMs: null,
          cost: null,
        },
      },
    ])
    mocks.snapshotBuilder.limit.mockResolvedValueOnce([{ id: 'snap-1', stateData: { blocks: {} } }])

    const response = await GET(new NextRequest('http://localhost/api/v1/logs/executions/ex-1'), {
      params: Promise.resolve({ executionId: 'ex-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rowBuilder.leftJoin).not.toHaveBeenCalled()
    expect(mocks.rowBuilder.innerJoin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            field: 'permissions.entityId',
            value: 'workflowExecutionLogs.workspaceId',
          }),
        ]),
      })
    )
    expect(body.workflowId).toBe('wf-missing')
  })
})
