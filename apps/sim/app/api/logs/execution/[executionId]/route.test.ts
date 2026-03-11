/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectLimit = vi.fn()
  const selectWhere = vi.fn()
  const selectInnerJoin = vi.fn()
  const selectLeftJoin = vi.fn()
  const selectFrom = vi.fn()
  const select = vi.fn()

  select.mockReturnValue({ from: selectFrom })
  selectFrom.mockReturnValue({ leftJoin: selectLeftJoin, where: selectWhere })
  selectLeftJoin.mockReturnValue({ innerJoin: selectInnerJoin })
  selectInnerJoin.mockReturnValue({ where: selectWhere })
  selectWhere.mockReturnValue({ limit: selectLimit })

  return {
    select,
    selectLimit,
    checkSessionOrInternalAuth: vi.fn(),
    generateRequestId: vi.fn().mockReturnValue('req-1'),
  }
})

vi.mock('@sim/db', () => ({
  db: {
    select: mocks.select,
  },
}))

vi.mock('@sim/db/schema', () => ({
  permissions: {},
  workflow: {},
  workflowExecutionLogs: {},
  workflowExecutionSnapshots: {},
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkSessionOrInternalAuth: mocks.checkSessionOrInternalAuth,
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: mocks.generateRequestId,
}))

import { GET } from './route'

describe('GET /api/logs/execution/[executionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkSessionOrInternalAuth.mockResolvedValue({ success: true, userId: 'user-1' })
  })

  it('returns diagnostics for running execution without trace spans', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([
        {
          workflowId: 'wf-1',
          stateSnapshotId: 'snap-1',
          status: 'running',
          level: 'info',
          trigger: 'api',
          startedAt: new Date('2025-01-01T00:00:00.000Z'),
          endedAt: null,
          totalDurationMs: null,
          cost: null,
          executionData: {
            lastStartedBlock: {
              blockId: 'b1',
              blockName: 'Start',
              blockType: 'agent',
              startedAt: '2025-01-01T00:00:00.000Z',
            },
            traceSpans: [],
          },
        },
      ])
      .mockResolvedValueOnce([{ id: 'snap-1', stateData: { blocks: {} } }])

    const response = await GET(new NextRequest('http://localhost/api/logs/execution/ex-1'), {
      params: Promise.resolve({ executionId: 'ex-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.diagnostics).toEqual(
      expect.objectContaining({
        status: 'running',
        level: 'info',
        hasTraceSpans: false,
        traceSpanCount: 0,
        lastStartedBlock: expect.objectContaining({ blockId: 'b1' }),
      })
    )
    expect(body.diagnostics.finalizationPath).toBeUndefined()
  })

  it('returns 401 for unauthorized requests', async () => {
    mocks.checkSessionOrInternalAuth.mockResolvedValue({ success: false, error: 'nope' })

    const response = await GET(new NextRequest('http://localhost/api/logs/execution/ex-1'), {
      params: Promise.resolve({ executionId: 'ex-1' }),
    })

    expect(response.status).toBe(401)
  })
})
