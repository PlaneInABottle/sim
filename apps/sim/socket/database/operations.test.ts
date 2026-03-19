/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  filterBatchAddBlocksByProtection,
  getBatchUpdateParentCoMovingKey,
  persistWorkflowOperation,
} from '@/socket/database/operations'

const {
  mockTransaction,
  mockGetActiveWorkflowContext,
  mockMergeSubBlockValues,
  mockGetBlock,
  mockWorkflowTable,
  mockWorkflowBlocksTable,
  mockWorkflowEdgesTable,
  mockWorkflowSubflowsTable,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockGetActiveWorkflowContext: vi.fn(),
  mockMergeSubBlockValues: vi.fn(),
  mockGetBlock: vi.fn(),
  mockWorkflowTable: {},
  mockWorkflowBlocksTable: {},
  mockWorkflowEdgesTable: {},
  mockWorkflowSubflowsTable: {},
}))

vi.mock('@sim/db', () => ({
  webhook: {},
  workflow: mockWorkflowTable,
  workflowBlocks: mockWorkflowBlocksTable,
  workflowEdges: mockWorkflowEdgesTable,
  workflowSubflows: mockWorkflowSubflowsTable,
}))

vi.mock('@sim/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({ transaction: mockTransaction })),
}))

vi.mock('postgres', () => ({
  default: vi.fn(() => ({})),
}))

vi.mock('@/lib/audit/log', () => ({
  AuditAction: {},
  AuditResourceType: {},
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/core/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  },
}))

vi.mock('@/lib/webhooks/provider-subscriptions', () => ({
  cleanupExternalWebhook: vi.fn(),
}))

vi.mock('@/lib/workflows/active-context', () => ({
  getActiveWorkflowContext: mockGetActiveWorkflowContext,
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: vi.fn(),
}))

vi.mock('@/lib/workflows/subblocks', () => ({
  mergeSubBlockValues: mockMergeSubBlockValues,
}))

vi.mock('@/blocks/registry', () => ({
  getBlock: mockGetBlock,
}))

vi.mock('@/triggers', () => ({
  getTrigger: vi.fn(),
  isTriggerValid: vi.fn(() => false),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetActiveWorkflowContext.mockResolvedValue({ id: 'workflow-1' })
  mockMergeSubBlockValues.mockImplementation((subBlocks, values) => ({
    ...((subBlocks as Record<string, unknown>) ?? {}),
    ...((values as Record<string, unknown>) ?? {}),
  }))
  mockGetBlock.mockReturnValue(undefined)
})

describe('getBatchUpdateParentCoMovingKey', () => {
  it('groups blocks entering the same destination container together', () => {
    expect(getBatchUpdateParentCoMovingKey('old-parent-a', 'loop-1')).toBe(
      JSON.stringify(['destination', 'loop-1'])
    )
    expect(getBatchUpdateParentCoMovingKey('old-parent-b', 'loop-1')).toBe(
      JSON.stringify(['destination', 'loop-1'])
    )
  })

  it('keeps removal transitions scoped by old parent when leaving containers', () => {
    expect(getBatchUpdateParentCoMovingKey('loop-1', null)).toBe(JSON.stringify(['loop-1', null]))
    expect(getBatchUpdateParentCoMovingKey('loop-2', null)).toBe(JSON.stringify(['loop-2', null]))
  })
})

describe('filterBatchAddBlocksByProtection', () => {
  it('filters blocks added under locked ancestor containers', () => {
    const allowedBlocks = filterBatchAddBlocksByProtection(
      [
        {
          id: 'child-under-locked-descendant',
          data: { parentId: 'inner-container' },
        },
        {
          id: 'child-under-unlocked-parent',
          data: { parentId: 'free-container' },
        },
      ],
      [
        {
          id: 'locked-root',
          locked: true,
          data: {},
        },
        {
          id: 'inner-container',
          locked: false,
          data: { parentId: 'locked-root' },
        },
        {
          id: 'free-container',
          locked: false,
          data: {},
        },
      ]
    )

    expect(allowedBlocks).toEqual([
      {
        id: 'child-under-unlocked-parent',
        data: { parentId: 'free-container' },
      },
    ])
  })

  it('allows co-added container subtrees when no ancestor is locked', () => {
    const allowedBlocks = filterBatchAddBlocksByProtection(
      [
        {
          id: 'new-container',
          locked: false,
          data: { parentId: 'free-root' },
        },
        {
          id: 'new-child',
          data: { parentId: 'new-container' },
        },
      ],
      [
        {
          id: 'free-root',
          locked: false,
          data: {},
        },
      ]
    )

    expect(allowedBlocks).toHaveLength(2)
    expect(allowedBlocks.map((block) => block.id)).toEqual(['new-container', 'new-child'])
  })
})

describe('persistWorkflowOperation', () => {
  it('defensively enriches batch-added blocks before persistence and broadcast payloads', async () => {
    const insertedBlockValues: Array<Record<string, unknown>> = []

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
      insert: vi.fn((table) => {
        if (table === mockWorkflowBlocksTable) {
          return {
            values: vi.fn((values) => {
              insertedBlockValues.push(...(values as Array<Record<string, unknown>>))
              return {
                onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
              }
            }),
          }
        }

        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          })),
        }
      }),
    }

    mockTransaction.mockImplementation(async (callback) => callback(tx))
    mockGetBlock.mockReturnValue({
      subBlocks: [
        { id: 'prompt', type: 'short-input', defaultValue: 'registry-default' },
        { id: 'temperature', type: 'slider', defaultValue: 0.7 },
      ],
      outputs: {
        result: { type: 'string' },
      },
    })

    const result = await persistWorkflowOperation('workflow-1', {
      operation: 'batch-add-blocks',
      target: 'blocks',
      payload: {
        blocks: [
          {
            id: 'block-1',
            type: 'agent',
            name: 'Agent',
            position: { x: 10, y: 20 },
            data: {},
          },
        ],
        edges: [],
        loops: {},
        parallels: {},
        subBlockValues: {
          'block-1': {
            prompt: { value: 'user value' },
          },
        },
      },
      timestamp: Date.now(),
      userId: 'user-1',
    })

    expect(insertedBlockValues).toHaveLength(1)
    expect(insertedBlockValues[0]).toMatchObject({
      id: 'block-1',
      subBlocks: {
        prompt: { value: 'user value' },
        temperature: { id: 'temperature', type: 'slider', value: 0.7 },
      },
      outputs: {
        result: { type: 'string' },
      },
    })
    expect(result.appliedPayload).toMatchObject({
      blocks: [
        {
          id: 'block-1',
          subBlocks: {
            prompt: { value: 'user value' },
            temperature: { id: 'temperature', type: 'slider', value: 0.7 },
          },
          outputs: {
            result: { type: 'string' },
          },
        },
      ],
      subBlockValues: {
        'block-1': {
          prompt: { value: 'user value' },
        },
      },
    })
  })

  it('returns only applied batch parent updates when protected targets are skipped', async () => {
    const updatedBlocks = new Map<string, Record<string, unknown>>([
      ['block-1', { id: 'block-1', data: {}, positionX: 0, positionY: 0 }],
      ['block-2', { id: 'block-2', data: {}, positionX: 5, positionY: 5 }],
      ['loop-1', { id: 'loop-1', data: {}, positionX: 0, positionY: 0 }],
      ['locked-parent', { id: 'locked-parent', locked: true, data: {} }],
    ])

    const tx = {
      update: vi.fn((table) => {
        if (table === mockWorkflowTable) {
          return {
            set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
          }
        }

        return {
          set: vi.fn((values) => ({
            where: vi.fn().mockImplementation(() => {
              if ('data' in values) {
                const blockId = (values.data as Record<string, unknown>).parentId
                  ? 'block-1'
                  : 'block-2'
                updatedBlocks.set(blockId, {
                  ...updatedBlocks.get(blockId),
                  ...values,
                })
              }
              return Promise.resolve(undefined)
            }),
            returning: vi.fn().mockResolvedValue([{ id: 'block-1' }]),
          })),
        }
      }),
      select: vi.fn((selection) => ({
        from: vi.fn((table) => ({
          where: vi.fn(() => {
            if (table === mockWorkflowBlocksTable) {
              if ('positionX' in selection) {
                return {
                  limit: vi.fn().mockResolvedValue([
                    updatedBlocks.get('block-1') ?? {
                      id: 'block-1',
                      data: {},
                      positionX: 0,
                      positionY: 0,
                    },
                  ]),
                }
              }

              return Promise.resolve([
                { id: 'block-1', locked: false, data: {} },
                { id: 'block-2', locked: false, data: {} },
                { id: 'loop-1', locked: false, data: {} },
                { id: 'locked-parent', locked: true, data: {} },
              ])
            }

            if (table === mockWorkflowEdgesTable) {
              return Promise.resolve([])
            }

            return Promise.resolve([])
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }

    mockTransaction.mockImplementation(async (callback) => callback(tx))

    const result = await persistWorkflowOperation('workflow-1', {
      operation: 'batch-update-parent',
      target: 'blocks',
      payload: {
        updates: [
          { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
          { id: 'block-2', parentId: 'locked-parent', position: { x: 30, y: 40 } },
        ],
        autoConnect: false,
      },
      timestamp: Date.now(),
      userId: 'user-1',
    })

    expect(result.appliedPayload).toEqual({
      updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
      autoConnect: false,
    })
    expect(result.addedEdges).toEqual([])
  })
})
