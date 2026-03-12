/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectResultsQueue: unknown[][] = []
  const selectBuilders: Array<{ where: ReturnType<typeof vi.fn> }> = []
  const getSession = vi.fn()
  const generateRequestId = vi.fn().mockReturnValue('req-logs-1')

  return {
    selectResultsQueue,
    selectBuilders,
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

function getWhereArgument(index = 0) {
  return mocks.selectBuilders[index]?.where.mock.calls[0]?.[0]
}

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => {
      const limitResult = {
        offset: vi.fn(() => Promise.resolve(shiftSelectResult())),
        then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(shiftSelectResult()).then(resolve, reject),
      }

      const builder = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn(() => limitResult),
        offset: vi.fn(() => Promise.resolve(shiftSelectResult())),
        then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(shiftSelectResult()).then(resolve, reject),
      }

      mocks.selectBuilders.push(builder)

      return builder
    }),
  },
}))

vi.mock('@sim/db/schema', () => ({
  jobExecutionLogs: {
    id: 'jobExecutionLogs.id',
    executionId: 'jobExecutionLogs.executionId',
    workspaceId: 'jobExecutionLogs.workspaceId',
    level: 'jobExecutionLogs.level',
    status: 'jobExecutionLogs.status',
    trigger: 'jobExecutionLogs.trigger',
    startedAt: 'jobExecutionLogs.startedAt',
    endedAt: 'jobExecutionLogs.endedAt',
    totalDurationMs: 'jobExecutionLogs.totalDurationMs',
    executionData: 'jobExecutionLogs.executionData',
    cost: 'jobExecutionLogs.cost',
    createdAt: 'jobExecutionLogs.createdAt',
  },
  pausedExecutions: {
    executionId: 'pausedExecutions.executionId',
    status: 'pausedExecutions.status',
    totalPauseCount: 'pausedExecutions.totalPauseCount',
    resumedCount: 'pausedExecutions.resumedCount',
  },
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
  workflowDeploymentVersion: {
    id: 'workflowDeploymentVersion.id',
    version: 'workflowDeploymentVersion.version',
    name: 'workflowDeploymentVersion.name',
  },
  workflowExecutionLogs: {
    id: 'workflowExecutionLogs.id',
    workflowId: 'workflowExecutionLogs.workflowId',
    executionId: 'workflowExecutionLogs.executionId',
    stateSnapshotId: 'workflowExecutionLogs.stateSnapshotId',
    deploymentVersionId: 'workflowExecutionLogs.deploymentVersionId',
    level: 'workflowExecutionLogs.level',
    status: 'workflowExecutionLogs.status',
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
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  desc: vi.fn((value: unknown) => ({ type: 'desc', value })),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
  gt: vi.fn((field: unknown, value: unknown) => ({ type: 'gt', field, value })),
  gte: vi.fn((field: unknown, value: unknown) => ({ type: 'gte', field, value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ type: 'inArray', field, values })),
  isNotNull: vi.fn((field: unknown) => ({ type: 'isNotNull', field })),
  isNull: vi.fn((field: unknown) => ({ type: 'isNull', field })),
  lt: vi.fn((field: unknown, value: unknown) => ({ type: 'lt', field, value })),
  lte: vi.fn((field: unknown, value: unknown) => ({ type: 'lte', field, value })),
  ne: vi.fn((field: unknown, value: unknown) => ({ type: 'ne', field, value })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
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
        details: value.details ?? 'basic',
        limit: Number(value.limit ?? 100),
        offset: Number(value.offset ?? 0),
      }),
    }),
  },
  buildFilterConditions: vi.fn(() => undefined),
  buildLogsLevelCondition: vi.fn((level: string) => {
    if (level === 'paused') {
      return {
        type: 'sql',
        strings: ['', "->>'finalizationPath' = 'paused'"],
        values: ['workflowExecutionLogs.executionData'],
      }
    }

    if (level === 'cancelled') {
      return {
        type: 'eq',
        field: 'workflowExecutionLogs.status',
        value: 'cancelled',
      }
    }

    if (level === 'running') {
      return {
        type: 'eq',
        field: 'workflowExecutionLogs.status',
        value: 'running',
      }
    }

    if (level === 'pending') {
      return {
        type: 'and',
        conditions: [
          {
            type: 'eq',
            field: 'workflowExecutionLogs.status',
            value: 'pending',
          },
          {
            type: 'sql',
            strings: ['coalesce(', "->>'finalizationPath', '') != 'paused'"],
            values: ['workflowExecutionLogs.executionData'],
          },
        ],
      }
    }

    if (level === 'error') {
      return {
        type: 'eq',
        field: 'workflowExecutionLogs.level',
        value: 'error',
      }
    }

    if (level === 'info') {
      return {
        type: 'and',
        conditions: [
          {
            type: 'eq',
            field: 'workflowExecutionLogs.level',
            value: 'info',
          },
          {
            type: 'isNotNull',
            field: 'workflowExecutionLogs.endedAt',
          },
        ],
      }
    }

    return undefined
  }),
}))

import { GET as getLogDetail } from './[id]/route'
import { GET as getLogs } from './route'

describe('logs status surfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResultsQueue.length = 0
    mocks.selectBuilders.length = 0
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('normalizes /api/logs basic mode paused rows and preserves rawStatus', async () => {
    queueSelectResults(
      [
        {
          id: 'log-pending-paused',
          workflowId: 'wf-1',
          executionId: 'ex-pending-paused',
          stateSnapshotId: 'snap-1',
          deploymentVersionId: 'dep-1',
          deploymentVersion: 1,
          deploymentVersionName: null,
          level: 'info',
          status: 'pending',
          finalizationPath: 'paused',
          trigger: 'api',
          startedAt: new Date('2025-01-01T00:00:00.000Z'),
          endedAt: new Date('2025-01-01T00:00:05.000Z'),
          totalDurationMs: 5000,
          executionData: null,
          cost: { total: 0 },
          files: null,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          workflowName: 'WF',
          workflowDescription: null,
          workflowColor: '#000000',
          workflowFolderId: null,
          workflowUserId: 'user-1',
          workflowWorkspaceId: 'workspace-1',
          workflowCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
          workflowUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
          pausedStatus: 'paused',
          pausedTotalPauseCount: 1,
          pausedResumedCount: 0,
        },
        {
          id: 'log-completed-paused',
          workflowId: 'wf-1',
          executionId: 'ex-completed-paused',
          stateSnapshotId: 'snap-2',
          deploymentVersionId: 'dep-1',
          deploymentVersion: 1,
          deploymentVersionName: null,
          level: 'info',
          status: 'completed',
          finalizationPath: 'paused',
          trigger: 'api',
          startedAt: new Date('2025-01-01T00:01:00.000Z'),
          endedAt: new Date('2025-01-01T00:01:05.000Z'),
          totalDurationMs: 5000,
          executionData: null,
          cost: { total: 0 },
          files: null,
          createdAt: new Date('2025-01-01T00:01:00.000Z'),
          workflowName: 'WF',
          workflowDescription: null,
          workflowColor: '#000000',
          workflowFolderId: null,
          workflowUserId: 'user-1',
          workflowWorkspaceId: 'workspace-1',
          workflowCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
          workflowUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
          pausedStatus: 'paused',
          pausedTotalPauseCount: 1,
          pausedResumedCount: 0,
        },
        {
          id: 'log-completed-completed',
          workflowId: 'wf-1',
          executionId: 'ex-completed-completed',
          stateSnapshotId: 'snap-3',
          deploymentVersionId: 'dep-1',
          deploymentVersion: 1,
          deploymentVersionName: null,
          level: 'info',
          status: 'completed',
          finalizationPath: 'completed',
          trigger: 'api',
          startedAt: new Date('2025-01-01T00:02:00.000Z'),
          endedAt: new Date('2025-01-01T00:02:05.000Z'),
          totalDurationMs: 5000,
          executionData: null,
          cost: { total: 0 },
          files: null,
          createdAt: new Date('2025-01-01T00:02:00.000Z'),
          workflowName: 'WF',
          workflowDescription: null,
          workflowColor: '#000000',
          workflowFolderId: null,
          workflowUserId: 'user-1',
          workflowWorkspaceId: 'workspace-1',
          workflowCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
          workflowUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
          pausedStatus: null,
          pausedTotalPauseCount: 0,
          pausedResumedCount: 0,
        },
      ],
      [],
      [{ count: 0 }],
      [{ count: 3 }]
    )

    const response = await getLogs(
      new NextRequest('http://localhost/api/logs?workspaceId=workspace-1&details=basic')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          executionId: 'ex-pending-paused',
          status: 'paused',
          rawStatus: 'pending',
          hasPendingPause: true,
        }),
        expect.objectContaining({
          executionId: 'ex-completed-paused',
          status: 'paused',
          rawStatus: 'completed',
          hasPendingPause: true,
        }),
        expect.objectContaining({
          executionId: 'ex-completed-completed',
          status: 'completed',
          rawStatus: 'completed',
          hasPendingPause: null,
        }),
      ])
    )
  })

  it('filters /api/logs level=paused using finalizationPath paused semantics', async () => {
    queueSelectResults([], [], [{ count: 0 }], [{ count: 0 }])

    const response = await getLogs(
      new NextRequest(
        'http://localhost/api/logs?workspaceId=workspace-1&details=basic&level=paused'
      )
    )

    expect(response.status).toBe(200)
    expect(getWhereArgument()).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'and',
            conditions: expect.arrayContaining([
              expect.objectContaining({
                type: 'sql',
                strings: ['', "->>'finalizationPath' = 'paused'"],
                values: ['workflowExecutionLogs.executionData'],
              }),
            ]),
          }),
        ]),
      })
    )
  })

  it('filters /api/logs level=cancelled using raw persisted status', async () => {
    queueSelectResults([], [], [{ count: 0 }], [{ count: 0 }])

    const response = await getLogs(
      new NextRequest(
        'http://localhost/api/logs?workspaceId=workspace-1&details=basic&level=cancelled'
      )
    )

    expect(response.status).toBe(200)
    expect(getWhereArgument()).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'and',
            conditions: expect.arrayContaining([
              expect.objectContaining({
                type: 'eq',
                field: 'workflowExecutionLogs.status',
                value: 'cancelled',
              }),
            ]),
          }),
        ]),
      })
    )
  })

  it('filters /api/logs level=running using raw persisted status', async () => {
    queueSelectResults([], [], [{ count: 0 }], [{ count: 0 }])

    const response = await getLogs(
      new NextRequest(
        'http://localhost/api/logs?workspaceId=workspace-1&details=basic&level=running'
      )
    )

    expect(response.status).toBe(200)
    expect(getWhereArgument()).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'and',
            conditions: expect.arrayContaining([
              expect.objectContaining({
                type: 'eq',
                field: 'workflowExecutionLogs.status',
                value: 'running',
              }),
            ]),
          }),
        ]),
      })
    )
  })

  it('filters /api/logs level=pending using raw pending status while excluding paused rows', async () => {
    queueSelectResults([], [], [{ count: 0 }], [{ count: 0 }])

    const response = await getLogs(
      new NextRequest(
        'http://localhost/api/logs?workspaceId=workspace-1&details=basic&level=pending'
      )
    )

    expect(response.status).toBe(200)
    expect(getWhereArgument()).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'and',
            conditions: expect.arrayContaining([
              expect.objectContaining({
                type: 'and',
                conditions: [
                  {
                    type: 'eq',
                    field: 'workflowExecutionLogs.status',
                    value: 'pending',
                  },
                  {
                    type: 'sql',
                    strings: ['coalesce(', "->>'finalizationPath', '') != 'paused'"],
                    values: ['workflowExecutionLogs.executionData'],
                  },
                ],
              }),
            ]),
          }),
        ]),
      })
    )
  })

  it('normalizes /api/logs/[id] detail mode and always returns rawStatus', async () => {
    queueSelectResults([
      {
        id: 'log-1',
        workflowId: 'wf-1',
        executionId: 'ex-1',
        stateSnapshotId: 'snap-1',
        deploymentVersionId: 'dep-1',
        deploymentVersion: 1,
        deploymentVersionName: 'v1',
        level: 'info',
        status: 'completed',
        trigger: 'api',
        startedAt: new Date('2025-01-01T00:00:00.000Z'),
        endedAt: new Date('2025-01-01T00:00:05.000Z'),
        totalDurationMs: 5000,
        executionData: { finalizationPath: 'paused', finalOutput: { paused: true } },
        cost: { total: 0 },
        files: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        workflowName: 'WF',
        workflowDescription: null,
        workflowColor: '#000000',
        workflowFolderId: null,
        workflowUserId: 'user-1',
        workflowWorkspaceId: 'workspace-1',
        workflowCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
        workflowUpdatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ])
    expect(mocks.selectResultsQueue).toHaveLength(1)

    const response = await getLogDetail(new NextRequest('http://localhost/api/logs/log-1'), {
      params: Promise.resolve({ id: 'log-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toEqual(
      expect.objectContaining({
        executionId: 'ex-1',
        status: 'paused',
        rawStatus: 'completed',
        executionData: expect.objectContaining({ finalizationPath: 'paused' }),
      })
    )
  })
})
