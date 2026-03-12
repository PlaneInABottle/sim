/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectResultsQueue: unknown[][] = []
  const selectCalls: unknown[] = []
  const getSession = vi.fn()
  const generateRequestId = vi.fn().mockReturnValue('req-stats-1')

  return {
    selectResultsQueue,
    selectCalls,
    getSession,
    generateRequestId,
  }
})

function shiftSelectResult() {
  return mocks.selectResultsQueue.shift() ?? []
}

function queueSelectResults(...results: unknown[][]) {
  mocks.selectResultsQueue.length = 0
  mocks.selectResultsQueue.push(...results)
}

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn((selection: unknown) => {
      mocks.selectCalls.push(selection)

      const builder = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn(() => Promise.resolve(shiftSelectResult())),
        then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(shiftSelectResult()).then(resolve, reject),
      }

      return builder
    }),
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
  },
  workflowExecutionLogs: {
    workspaceId: 'workflowExecutionLogs.workspaceId',
    workflowId: 'workflowExecutionLogs.workflowId',
    status: 'workflowExecutionLogs.status',
    startedAt: 'workflowExecutionLogs.startedAt',
    totalDurationMs: 'workflowExecutionLogs.totalDurationMs',
    executionData: 'workflowExecutionLogs.executionData',
  },
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: Array.from(strings),
    values,
    as(alias: string) {
      return {
        type: 'sql',
        strings: Array.from(strings),
        values,
        alias,
      }
    },
  })),
}))

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: mocks.generateRequestId,
}))

vi.mock('@/lib/logs/filters', () => ({
  LogFilterParamsSchema: {
    extend: () => ({
      parse: (value: Record<string, string>) => ({
        workspaceId: value.workspaceId,
        level: value.level,
        segmentCount: Number(value.segmentCount ?? 72),
      }),
    }),
  },
  buildFilterConditions: vi.fn(() => undefined),
  buildLogsLevelCondition: vi.fn(() => undefined),
}))

import { GET } from './route'

describe('GET /api/logs/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResultsQueue.length = 0
    mocks.selectCalls.length = 0
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('counts only completed non-paused executions as successful', async () => {
    queueSelectResults(
      [
        {
          minTime: '2025-01-01T00:00:00.000Z',
          maxTime: '2025-01-01T00:00:00.000Z',
        },
      ],
      [
        {
          workflowId: 'wf-1',
          workflowName: 'Workflow 1',
          segmentIndex: 0,
          totalExecutions: 6,
          successfulExecutions: 1,
          avgDurationMs: 120,
        },
      ]
    )

    const response = await GET(
      new NextRequest('http://localhost/api/logs/stats?workspaceId=workspace-1&segmentCount=1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.workflows).toEqual([
      expect.objectContaining({
        workflowId: 'wf-1',
        totalExecutions: 6,
        totalSuccessful: 1,
        overallSuccessRate: expect.closeTo(100 / 6, 5),
        segments: [
          expect.objectContaining({
            totalExecutions: 6,
            successfulExecutions: 1,
          }),
        ],
      }),
    ])
    expect(body.totalRuns).toBe(6)
    expect(body.totalErrors).toBe(5)
    expect(body.aggregateSegments).toEqual([
      expect.objectContaining({
        totalExecutions: 6,
        successfulExecutions: 1,
      }),
    ])

    expect(mocks.selectCalls[1]).toEqual(
      expect.objectContaining({
        successfulExecutions: expect.objectContaining({
          type: 'sql',
          strings: [
            'COUNT(*) FILTER (WHERE ',
            " = 'completed' AND coalesce(",
            "->>'finalizationPath', '') != 'paused')",
          ],
          values: ['workflowExecutionLogs.status', 'workflowExecutionLogs.executionData'],
          alias: 'successful_executions',
        }),
      })
    )
  })
})
