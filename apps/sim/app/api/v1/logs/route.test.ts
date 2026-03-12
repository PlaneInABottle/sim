/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectResultsQueue: unknown[][] = []
  const builders: Array<Record<string, ReturnType<typeof vi.fn>>> = []

  return {
    selectResultsQueue,
    builders,
    eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings,
      values,
    })),
    checkRateLimit: vi.fn(),
    createRateLimitResponse: vi.fn(),
    createApiResponse: vi.fn(),
    getUserLimits: vi.fn(),
  }
})

function shiftSelectResult() {
  return mocks.selectResultsQueue.shift() ?? []
}

function queueSelectResults(...results: unknown[][]) {
  mocks.selectResultsQueue.length = 0
  mocks.selectResultsQueue.push(...results)
}

function createSelectBuilder() {
  const builder = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(shiftSelectResult()),
  }

  mocks.builders.push(builder)
  return builder
}

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => createSelectBuilder()),
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
  },
  workflowExecutionLogs: {
    id: 'workflowExecutionLogs.id',
    workflowId: 'workflowExecutionLogs.workflowId',
    executionId: 'workflowExecutionLogs.executionId',
    deploymentVersionId: 'workflowExecutionLogs.deploymentVersionId',
    level: 'workflowExecutionLogs.level',
    trigger: 'workflowExecutionLogs.trigger',
    startedAt: 'workflowExecutionLogs.startedAt',
    endedAt: 'workflowExecutionLogs.endedAt',
    totalDurationMs: 'workflowExecutionLogs.totalDurationMs',
    cost: 'workflowExecutionLogs.cost',
    files: 'workflowExecutionLogs.files',
    executionData: 'workflowExecutionLogs.executionData',
    workspaceId: 'workflowExecutionLogs.workspaceId',
  },
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  desc: mocks.desc,
  eq: mocks.eq,
  sql: mocks.sql,
}))

vi.mock('@/app/api/v1/logs/filters', () => ({
  buildLogFilters: vi.fn(() => ({ type: 'filters' })),
  getOrderBy: vi.fn(() => ({ type: 'order' })),
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

describe('GET /api/v1/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResultsQueue.length = 0
    mocks.builders.length = 0
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

  it('keeps orphaned log rows visible while authorizing via log workspace id', async () => {
    queueSelectResults([
      {
        id: 'log-1',
        workflowId: 'wf-missing',
        executionId: 'ex-1',
        deploymentVersionId: null,
        level: 'info',
        trigger: 'api',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: null,
        totalDurationMs: null,
        cost: null,
        files: null,
        executionData: null,
        workflowName: null,
        workflowDescription: null,
      },
    ])

    const response = await GET(new NextRequest('http://localhost/api/v1/logs?workspaceId=ws-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.builders[0]?.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ field: 'workflowExecutionLogs.workflowId', value: 'workflow.id' })
    )
    expect(mocks.builders[0]?.innerJoin).toHaveBeenCalledWith(
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
    expect(body.data).toEqual([
      expect.objectContaining({
        id: 'log-1',
        workflowId: 'wf-missing',
      }),
    ])
  })
})
