/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

const { mockPersistWorkflowOperation, mockCheckRolePermission, mockWorkflowOperationParse } =
  vi.hoisted(() => ({
    mockPersistWorkflowOperation: vi.fn(),
    mockCheckRolePermission: vi.fn(),
    mockWorkflowOperationParse: vi.fn((data) => data),
  }))

vi.mock('@/socket/database/operations', () => ({
  enrichBatchAddBlocksPayload: vi.fn(),
  persistWorkflowOperation: mockPersistWorkflowOperation,
}))

vi.mock('@/socket/middleware/permissions', () => ({
  checkRolePermission: mockCheckRolePermission,
}))

vi.mock('@/socket/validation/schemas', () => ({
  WorkflowOperationSchema: {
    parse: mockWorkflowOperationParse,
  },
}))

import {
  BLOCK_OPERATIONS,
  BLOCKS_OPERATIONS,
  EDGES_OPERATIONS,
  OPERATION_TARGETS,
} from '@/socket/constants'
import { setupOperationsHandlers } from '@/socket/handlers/operations'

describe('setupOperationsHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckRolePermission.mockReturnValue({ allowed: true })
  })

  it('broadcasts only applied batch parent updates', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      appliedPayload: {
        updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
      },
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-partial-parent',
      operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        updates: [
          { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
          { id: 'block-2', parentId: 'locked-parent', position: { x: 30, y: 40 } },
        ],
      },
      timestamp: 123,
    })

    expect(socketRoomEmit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
        payload: {
          updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
        },
      })
    )
  })

  it('skips batch parent broadcast when no updates were applied', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      appliedPayload: {
        updates: [],
      },
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-empty-parent',
      operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        updates: [{ id: 'blocked', parentId: 'locked-parent', position: { x: 1, y: 2 } }],
      },
      timestamp: 123,
    })

    expect(socketRoomEmit).not.toHaveBeenCalled()
    expect(emitToWorkflow).not.toHaveBeenCalled()
    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({
        operationId: 'op-empty-parent',
        serverTimestamp: expect.any(Number),
      })
    )
  })

  it('broadcasts only applied batch add blocks payload', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      appliedPayload: {
        blocks: [{ id: 'block-1', type: 'agent', name: 'Block 1' }],
        edges: [{ id: 'edge-1', source: 'existing-parent', target: 'block-1' }],
        loops: {},
        parallels: {},
        subBlockValues: {},
      },
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow: vi.fn(),
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-partial-add',
      operation: BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        blocks: [
          { id: 'block-1', type: 'agent', name: 'Block 1' },
          { id: 'block-2', type: 'agent', name: 'Block 2' },
        ],
        edges: [
          { id: 'edge-1', source: 'existing-parent', target: 'block-1' },
          { id: 'edge-2', source: 'existing-parent', target: 'block-2' },
        ],
        loops: {},
        parallels: {},
        subBlockValues: {},
      },
      timestamp: 123,
    })

    expect(socketRoomEmit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        operation: BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS,
        payload: expect.objectContaining({
          blocks: [{ id: 'block-1', type: 'agent', name: 'Block 1' }],
          edges: [{ id: 'edge-1', source: 'existing-parent', target: 'block-1' }],
        }),
      })
    )
  })

  it('skips batch add broadcast when no blocks were applied', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      appliedPayload: {
        blocks: [],
        edges: [],
        loops: {},
        parallels: {},
        subBlockValues: {},
      },
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow: vi.fn(),
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-empty-add',
      operation: BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        blocks: [{ id: 'blocked', type: 'agent', name: 'Blocked' }],
        edges: [],
        loops: {},
        parallels: {},
        subBlockValues: {},
      },
      timestamp: 123,
    })

    expect(socketRoomEmit).not.toHaveBeenCalled()
    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({ operationId: 'op-empty-add', serverTimestamp: expect.any(Number) })
    )
  })

  it('still broadcasts side-effect edges when applied batch parent subset is non-empty', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      appliedPayload: {
        updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
      },
      removedEdgeIds: ['edge-removed'],
      addedEdges: [
        {
          id: 'edge-added',
          source: 'loop-1',
          target: 'block-1',
          sourceHandle: 'loop-start-source',
          targetHandle: 'target',
          type: 'workflowEdge',
        },
      ],
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-partial-parent-with-edges',
      operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        updates: [
          { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
          { id: 'block-2', parentId: 'locked-parent', position: { x: 30, y: 40 } },
        ],
      },
      timestamp: 123,
    })

    expect(socketRoomEmit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        payload: {
          updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
        },
      })
    )
    expect(emitToWorkflow).toHaveBeenNthCalledWith(
      1,
      'workflow-1',
      'workflow-operation',
      expect.objectContaining({
        operation: EDGES_OPERATIONS.BATCH_REMOVE_EDGES,
        payload: { ids: ['edge-removed'] },
      })
    )
    expect(emitToWorkflow).toHaveBeenNthCalledWith(
      2,
      'workflow-1',
      'workflow-operation',
      expect.objectContaining({
        operation: EDGES_OPERATIONS.BATCH_ADD_EDGES,
        payload: {
          edges: [
            expect.objectContaining({
              id: 'edge-added',
              source: 'loop-1',
              target: 'block-1',
            }),
          ],
        },
      })
    )
  })

  it('broadcasts batch parent auto-connect edges to the whole workflow', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      removedEdgeIds: ['edge-removed'],
      addedEdges: [
        {
          id: 'edge-added',
          source: 'loop-1',
          target: 'block-1',
          sourceHandle: 'loop-start-source',
          targetHandle: 'target',
          type: 'workflowEdge',
        },
      ],
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    expect(workflowOperationHandler).toBeDefined()

    await workflowOperationHandler?.({
      operationId: 'op-1',
      operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
      },
      timestamp: 123,
    })

    expect(mockPersistWorkflowOperation).toHaveBeenCalledWith('workflow-1', {
      operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
      },
      timestamp: expect.any(Number),
      userId: 'user-1',
    })
    expect(emitToWorkflow).toHaveBeenNthCalledWith(
      1,
      'workflow-1',
      'workflow-operation',
      expect.objectContaining({
        operation: EDGES_OPERATIONS.BATCH_REMOVE_EDGES,
        target: OPERATION_TARGETS.EDGES,
        payload: { ids: ['edge-removed'] },
      })
    )
    expect(emitToWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      'workflow-operation',
      expect.objectContaining({
        operation: EDGES_OPERATIONS.BATCH_ADD_EDGES,
        target: OPERATION_TARGETS.EDGES,
        payload: {
          edges: [
            expect.objectContaining({
              id: 'edge-added',
              source: 'loop-1',
              target: 'block-1',
            }),
          ],
        },
      })
    )
    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({ operationId: 'op-1', serverTimestamp: expect.any(Number) })
    )
  })

  it('returns the authoritative batch parent payload to the initiator', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      appliedPayload: {
        updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
      },
    })

    const socketEmit = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: vi.fn(),
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow: vi.fn(),
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-parent-authoritative',
      operation: BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        updates: [
          { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
          { id: 'block-2', parentId: 'locked-parent', position: { x: 30, y: 40 } },
        ],
      },
      timestamp: 123,
    })

    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({
        operationId: 'op-parent-authoritative',
        appliedPayload: {
          updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } }],
        },
      })
    )
  })

  it('broadcasts single block parent side-effect edges to the whole workflow', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      removedEdgeIds: ['edge-removed'],
      addedEdges: [
        {
          id: 'edge-added',
          source: 'loop-1',
          target: 'block-1',
          sourceHandle: 'loop-start-source',
          targetHandle: 'target',
          type: 'workflowEdge',
        },
      ],
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-single-parent',
      operation: BLOCK_OPERATIONS.UPDATE_PARENT,
      target: OPERATION_TARGETS.BLOCK,
      payload: { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
      timestamp: 123,
    })

    expect(socketRoomEmit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        operation: BLOCK_OPERATIONS.UPDATE_PARENT,
        target: OPERATION_TARGETS.BLOCK,
        payload: { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
      })
    )
    expect(emitToWorkflow).toHaveBeenNthCalledWith(
      1,
      'workflow-1',
      'workflow-operation',
      expect.objectContaining({
        operation: EDGES_OPERATIONS.BATCH_REMOVE_EDGES,
        target: OPERATION_TARGETS.EDGES,
        payload: { ids: ['edge-removed'] },
      })
    )
    expect(emitToWorkflow).toHaveBeenNthCalledWith(
      2,
      'workflow-1',
      'workflow-operation',
      expect.objectContaining({
        operation: EDGES_OPERATIONS.BATCH_ADD_EDGES,
        target: OPERATION_TARGETS.EDGES,
        payload: {
          edges: [
            expect.objectContaining({
              id: 'edge-added',
              source: 'loop-1',
              target: 'block-1',
            }),
          ],
        },
      })
    )
    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({
        operationId: 'op-single-parent',
        serverTimestamp: expect.any(Number),
      })
    )
  })

  it('includes operationId when a zod error happens after parsing', async () => {
    const socketEmit = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: vi.fn(),
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn().mockRejectedValue(
        new ZodError([
          {
            code: 'custom',
            path: ['payload'],
            message: 'Invalid payload',
          },
        ])
      ),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow: vi.fn(),
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-zod-after-parse',
      operation: BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS,
      target: OPERATION_TARGETS.BLOCKS,
      payload: { blocks: [], edges: [], loops: {}, parallels: {}, subBlockValues: {} },
      timestamp: 123,
    })

    expect(socketEmit).toHaveBeenCalledWith(
      'operation-failed',
      expect.objectContaining({
        operationId: 'op-zod-after-parse',
        error: 'Invalid operation format',
      })
    )
  })

  it('does not emit edge side-effect syncs when the operation has no handler support', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({
      removedEdgeIds: ['edge-removed'],
      addedEdges: [
        {
          id: 'edge-added',
          source: 'container-1',
          target: 'block-1',
          sourceHandle: 'loop-start-source',
          targetHandle: 'target',
          type: 'workflowEdge',
        },
      ],
    })

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    expect(workflowOperationHandler).toBeDefined()

    await workflowOperationHandler?.({
      operationId: 'op-2',
      operation: BLOCKS_OPERATIONS.BATCH_TOGGLE_LOCKED,
      target: OPERATION_TARGETS.BLOCKS,
      payload: {
        ids: ['block-1'],
        locked: true,
      },
      timestamp: 456,
    })

    expect(socketRoomEmit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        operation: BLOCKS_OPERATIONS.BATCH_TOGGLE_LOCKED,
        target: OPERATION_TARGETS.BLOCKS,
        payload: { ids: ['block-1'], locked: true },
      })
    )
    expect(emitToWorkflow).not.toHaveBeenCalled()
    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({ operationId: 'op-2', serverTimestamp: expect.any(Number) })
    )
  })

  it('broadcasts valid block toggle operations through the default handler', async () => {
    mockPersistWorkflowOperation.mockResolvedValue({})

    const socketEmit = vi.fn()
    const socketRoomEmit = vi.fn()
    const emitToWorkflow = vi.fn()
    const socketHandlers = new Map<string, (data: unknown) => Promise<void>>()

    const socket = {
      id: 'socket-1',
      on: vi.fn((event: string, handler: (data: unknown) => Promise<void>) => {
        socketHandlers.set(event, handler)
      }),
      emit: socketEmit,
      to: vi.fn(() => ({
        emit: socketRoomEmit,
      })),
    }

    const roomManager = {
      io: {} as never,
      initialize: vi.fn(),
      isReady: vi.fn(() => true),
      shutdown: vi.fn(),
      addUserToRoom: vi.fn(),
      removeUserFromRoom: vi.fn(),
      getWorkflowIdForSocket: vi.fn().mockResolvedValue('workflow-1'),
      getUserSession: vi.fn().mockResolvedValue({ userId: 'user-1', userName: 'Test User' }),
      getWorkflowUsers: vi.fn().mockResolvedValue([
        {
          socketId: 'socket-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          userName: 'Test User',
          joinedAt: Date.now(),
          lastActivity: Date.now(),
          role: 'admin',
        },
      ]),
      hasWorkflowRoom: vi.fn().mockResolvedValue(true),
      updateUserActivity: vi.fn(),
      updateRoomLastModified: vi.fn(),
      broadcastPresenceUpdate: vi.fn(),
      emitToWorkflow,
      getUniqueUserCount: vi.fn(),
      getTotalActiveConnections: vi.fn(),
      handleWorkflowDeletion: vi.fn(),
      handleWorkflowRevert: vi.fn(),
      handleWorkflowUpdate: vi.fn(),
    }

    setupOperationsHandlers(socket as never, roomManager)

    const workflowOperationHandler = socketHandlers.get('workflow-operation')

    await workflowOperationHandler?.({
      operationId: 'op-toggle-enabled',
      operation: BLOCK_OPERATIONS.TOGGLE_ENABLED,
      target: OPERATION_TARGETS.BLOCK,
      payload: {
        id: 'block-1',
        enabled: false,
      },
      timestamp: 789,
    })

    expect(mockPersistWorkflowOperation).toHaveBeenCalledWith(
      'workflow-1',
      expect.objectContaining({
        operation: BLOCK_OPERATIONS.TOGGLE_ENABLED,
        target: OPERATION_TARGETS.BLOCK,
        payload: { id: 'block-1', enabled: false },
        userId: 'user-1',
      })
    )
    expect(socketRoomEmit).toHaveBeenCalledWith(
      'workflow-operation',
      expect.objectContaining({
        operation: BLOCK_OPERATIONS.TOGGLE_ENABLED,
        target: OPERATION_TARGETS.BLOCK,
        payload: { id: 'block-1', enabled: false },
      })
    )
    expect(emitToWorkflow).not.toHaveBeenCalled()
    expect(socketEmit).toHaveBeenCalledWith(
      'operation-confirmed',
      expect.objectContaining({
        operationId: 'op-toggle-enabled',
        serverTimestamp: expect.any(Number),
      })
    )
  })
})
