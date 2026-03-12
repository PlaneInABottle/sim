/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    checkRateLimit: vi.fn(),
    createRateLimitResponse: vi.fn(),
    createApiResponse: vi.fn(),
    getUserLimits: vi.fn(),
    selectResult: vi.fn(),
    builder: {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    },
  }
})

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => mocks.builder),
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
    name: 'workflow.name',
    description: 'workflow.description',
    color: 'workflow.color',
    folderId: 'workflow.folderId',
    userId: 'workflow.userId',
    workspaceId: 'workflow.workspaceId',
    createdAt: 'workflow.createdAt',
    updatedAt: 'workflow.updatedAt',
  },
  workflowExecutionLogs: {
    id: 'workflowExecutionLogs.id',
    workflowId: 'workflowExecutionLogs.workflowId',
    executionId: 'workflowExecutionLogs.executionId',
    stateSnapshotId: 'workflowExecutionLogs.stateSnapshotId',
    level: 'workflowExecutionLogs.level',
    trigger: 'workflowExecutionLogs.trigger',
    startedAt: 'workflowExecutionLogs.startedAt',
    endedAt: 'workflowExecutionLogs.endedAt',
    totalDurationMs: 'workflowExecutionLogs.totalDurationMs',
    executionData: 'workflowExecutionLogs.executionData',
    cost: 'workflowExecutionLogs.cost',
    files: 'workflowExecutionLogs.files',
    createdAt: 'workflowExecutionLogs.createdAt',
    workspaceId: 'workflowExecutionLogs.workspaceId',
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

describe('GET /api/v1/logs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.builder.limit.mockImplementation(async () => mocks.selectResult())
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

  it('returns orphaned log detail rows with deleted workflow tombstone data', async () => {
    mocks.selectResult.mockResolvedValue([
      {
        id: 'log-1',
        workflowId: 'wf-missing',
        executionId: 'ex-1',
        stateSnapshotId: 'snap-1',
        level: 'info',
        trigger: 'api',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: null,
        totalDurationMs: null,
        executionData: {},
        cost: null,
        files: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        workflowName: null,
        workflowDescription: null,
        workflowColor: null,
        workflowFolderId: null,
        workflowUserId: null,
        workflowWorkspaceId: null,
        workflowCreatedAt: null,
        workflowUpdatedAt: null,
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/v1/logs/log-1'), {
      params: Promise.resolve({ id: 'log-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.builder.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ field: 'workflowExecutionLogs.workflowId', value: 'workflow.id' })
    )
    expect(mocks.builder.innerJoin).toHaveBeenCalledWith(
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
    expect(body.data.workflow).toEqual(
      expect.objectContaining({
        id: 'wf-missing',
        name: 'Deleted Workflow',
        deleted: true,
      })
    )
  })
})
