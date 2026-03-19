/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest'
import {
  filterBatchAddBlocksByProtection,
  getBatchUpdateParentCoMovingKey,
} from '@/socket/database/operations'

vi.mock('@sim/db', () => ({
  webhook: {},
  workflow: {},
  workflowBlocks: {},
  workflowEdges: {},
  workflowSubflows: {},
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
  drizzle: vi.fn(() => ({ transaction: vi.fn() })),
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
  getActiveWorkflowContext: vi.fn(),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadWorkflowFromNormalizedTables: vi.fn(),
}))

vi.mock('@/lib/workflows/subblocks', () => ({
  mergeSubBlockValues: vi.fn(),
}))

vi.mock('@/blocks/registry', () => ({
  getBlock: vi.fn(),
}))

vi.mock('@/triggers', () => ({
  getTrigger: vi.fn(),
  isTriggerValid: vi.fn(() => false),
}))

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
