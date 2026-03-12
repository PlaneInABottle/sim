/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectResultsQueue: unknown[][] = []
  const selectCalls: unknown[] = []
  const whereCalls: unknown[] = []
  const getSession = vi.fn()

  return {
    selectResultsQueue,
    selectCalls,
    whereCalls,
    getSession,
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

      const offsetResult = vi.fn(() => Promise.resolve(shiftSelectResult()))
      const builder = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn((value: unknown) => {
          mocks.whereCalls.push(value)
          return builder
        }),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn(() => ({
          offset: offsetResult,
        })),
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
    id: 'workflowExecutionLogs.id',
    workflowId: 'workflowExecutionLogs.workflowId',
    executionId: 'workflowExecutionLogs.executionId',
    workspaceId: 'workflowExecutionLogs.workspaceId',
    level: 'workflowExecutionLogs.level',
    status: 'workflowExecutionLogs.status',
    trigger: 'workflowExecutionLogs.trigger',
    startedAt: 'workflowExecutionLogs.startedAt',
    endedAt: 'workflowExecutionLogs.endedAt',
    totalDurationMs: 'workflowExecutionLogs.totalDurationMs',
    cost: 'workflowExecutionLogs.cost',
    executionData: 'workflowExecutionLogs.executionData',
  },
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: Array.from(strings),
    values,
  })),
}))

vi.mock('@/lib/auth', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/logs/filters', () => ({
  LogFilterParamsSchema: {
    parse: (value: Record<string, string>) => ({
      workspaceId: value.workspaceId,
      level: value.level,
    }),
  },
  buildFilterConditions: vi.fn(() => ({ type: 'filterCondition' })),
  buildLogsLevelCondition: vi.fn((level: string | undefined) =>
    level ? { type: 'levelCondition', level } : undefined
  ),
}))

import { GET } from './route'

describe('GET /api/logs/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResultsQueue.length = 0
    mocks.selectCalls.length = 0
    mocks.whereCalls.length = 0
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('streams csv with normalized and raw status fields', async () => {
    queueSelectResults(
      [
        {
          startedAt: new Date('2025-01-01T00:00:00.000Z'),
          level: 'info',
          status: 'completed',
          finalizationPath: 'paused',
          workflowName: 'Workflow 1',
          trigger: 'api',
          totalDurationMs: 5000,
          cost: { total: 12.5 },
          workflowId: 'wf-1',
          executionId: 'ex-1',
          executionData: {
            finalOutput: 'Paused message',
            traceSpans: [{ id: 'trace-1' }],
          },
        },
        {
          startedAt: new Date('2025-01-01T00:01:00.000Z'),
          level: 'error',
          status: 'failed',
          finalizationPath: 'force_failed',
          workflowName: 'Workflow 2',
          trigger: 'manual',
          totalDurationMs: 2500,
          cost: { value: { total: 2 } },
          workflowId: 'wf-2',
          executionId: 'ex-2',
          executionData: {
            message: 'Failure reason',
          },
        },
      ],
      []
    )

    const response = await GET(
      new NextRequest('http://localhost/api/logs/export?workspaceId=workspace-1&level=paused')
    )
    const csv = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; filename="logs-/)
    expect(csv).toContain(
      'startedAt,level,status,rawStatus,finalizationPath,workflow,trigger,durationMs,costTotal,workflowId,executionId,message,traceSpans'
    )
    expect(csv).toContain(
      '2025-01-01T00:00:00.000Z,info,paused,completed,paused,Workflow 1,api,5000,12.5,wf-1,ex-1,Paused message,"[{""id"":""trace-1""}]"'
    )
    expect(csv).toContain(
      '2025-01-01T00:01:00.000Z,error,failed,failed,force_failed,Workflow 2,manual,2500,2,wf-2,ex-2,Failure reason,'
    )

    expect(mocks.selectCalls[0]).toEqual(
      expect.objectContaining({
        status: 'workflowExecutionLogs.status',
        finalizationPath: expect.objectContaining({
          type: 'sql',
          strings: ['', "->>'finalizationPath'"],
          values: ['workflowExecutionLogs.executionData'],
        }),
        level: 'workflowExecutionLogs.level',
      })
    )
    expect(mocks.whereCalls[0]).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'eq',
            field: 'workflowExecutionLogs.workspaceId',
            value: 'workspace-1',
          }),
          expect.objectContaining({ type: 'levelCondition', level: 'paused' }),
          expect.objectContaining({ type: 'filterCondition' }),
        ]),
      })
    )
  })
})
