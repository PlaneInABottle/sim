/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@sim/db/schema', () => ({
  workflow: {
    id: 'workflow.id',
    folderId: 'workflow.folderId',
    name: 'workflow.name',
  },
  workflowExecutionLogs: {
    level: 'workflowExecutionLogs.level',
    status: 'workflowExecutionLogs.status',
    endedAt: 'workflowExecutionLogs.endedAt',
    executionData: 'workflowExecutionLogs.executionData',
    trigger: 'workflowExecutionLogs.trigger',
    startedAt: 'workflowExecutionLogs.startedAt',
    executionId: 'workflowExecutionLogs.executionId',
    cost: 'workflowExecutionLogs.cost',
    totalDurationMs: 'workflowExecutionLogs.totalDurationMs',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
  gt: vi.fn((field: unknown, value: unknown) => ({ type: 'gt', field, value })),
  gte: vi.fn((field: unknown, value: unknown) => ({ type: 'gte', field, value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ type: 'inArray', field, values })),
  isNotNull: vi.fn((field: unknown) => ({ type: 'isNotNull', field })),
  lt: vi.fn((field: unknown, value: unknown) => ({ type: 'lt', field, value })),
  lte: vi.fn((field: unknown, value: unknown) => ({ type: 'lte', field, value })),
  ne: vi.fn((field: unknown, value: unknown) => ({ type: 'ne', field, value })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: Array.from(strings),
    values,
  })),
}))

import { buildLogsLevelCondition } from './filters'

describe('buildLogsLevelCondition', () => {
  it('builds paused filter from finalizationPath', () => {
    expect(buildLogsLevelCondition('paused')).toEqual({
      type: 'sql',
      strings: ['', "->>'finalizationPath' = 'paused'"],
      values: ['workflowExecutionLogs.executionData'],
    })
  })

  it('builds cancelled filter from raw status', () => {
    expect(buildLogsLevelCondition('cancelled')).toEqual({
      type: 'eq',
      field: 'workflowExecutionLogs.status',
      value: 'cancelled',
    })
  })

  it('builds running filter from raw status', () => {
    expect(buildLogsLevelCondition('running')).toEqual({
      type: 'eq',
      field: 'workflowExecutionLogs.status',
      value: 'running',
    })
  })

  it('builds pending filter from raw status while excluding paused finalization', () => {
    expect(buildLogsLevelCondition('pending')).toEqual({
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
    })
  })

  it('keeps error and info behavior unchanged', () => {
    expect(buildLogsLevelCondition('error')).toEqual({
      type: 'eq',
      field: 'workflowExecutionLogs.level',
      value: 'error',
    })

    expect(buildLogsLevelCondition('info')).toEqual({
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
    })
  })
})
