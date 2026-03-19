/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockBatchAddBlocks,
  mockBatchRemoveBlocks,
  mockBatchRemoveEdges,
  mockBatchUpdateBlocksWithParent,
  mockWorkflowStoreGetState,
} = vi.hoisted(() => ({
  mockBatchAddBlocks: vi.fn(),
  mockBatchRemoveBlocks: vi.fn(),
  mockBatchRemoveEdges: vi.fn(),
  mockBatchUpdateBlocksWithParent: vi.fn(),
  mockWorkflowStoreGetState: vi.fn(),
}))

vi.mock('@sim/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('@/stores/workflows/workflow/store', () => ({
  useWorkflowStore: {
    getState: mockWorkflowStoreGetState,
  },
}))

import { useOperationQueueStore } from './store'

describe('useOperationQueueStore confirmOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockWorkflowStoreGetState.mockReturnValue({
      batchAddBlocks: mockBatchAddBlocks,
      batchRemoveBlocks: mockBatchRemoveBlocks,
      batchRemoveEdges: mockBatchRemoveEdges,
      batchUpdateBlocksWithParent: mockBatchUpdateBlocksWithParent,
    })

    useOperationQueueStore.setState({
      operations: [],
      isProcessing: false,
      hasOperationError: false,
    })
  })

  it('reconciles authoritative applied payload for batch add blocks', () => {
    useOperationQueueStore.setState({
      operations: [
        {
          id: 'op-add',
          operation: {
            operation: 'batch-add-blocks',
            target: 'blocks',
            payload: {
              blocks: [{ id: 'block-1' }, { id: 'block-2' }],
              edges: [{ id: 'edge-1' }, { id: 'edge-2' }],
            },
          },
          workflowId: 'workflow-1',
          timestamp: Date.now(),
          retryCount: 0,
          status: 'processing',
          userId: 'user-1',
        },
      ],
    })

    useOperationQueueStore.getState().confirmOperation('op-add', {
      blocks: [{ id: 'block-1', type: 'agent', name: 'Block 1' }],
      edges: [{ id: 'edge-1', source: 'a', target: 'block-1' }],
      subBlockValues: { 'block-1': { prompt: 'hi' } },
    })

    expect(mockBatchAddBlocks).toHaveBeenCalledWith(
      [{ id: 'block-1', type: 'agent', name: 'Block 1' }],
      [{ id: 'edge-1', source: 'a', target: 'block-1' }],
      { 'block-1': { prompt: 'hi' } },
      { skipEdgeValidation: true }
    )
    expect(mockBatchRemoveBlocks).toHaveBeenCalledWith(['block-2'])
    expect(mockBatchRemoveEdges).toHaveBeenCalledWith(['edge-2'])
    expect(useOperationQueueStore.getState().operations).toEqual([])
  })

  it('reconciles authoritative applied payload for batch update parent', () => {
    useOperationQueueStore.setState({
      operations: [
        {
          id: 'op-parent',
          operation: {
            operation: 'batch-update-parent',
            target: 'blocks',
            payload: {
              updates: [
                { id: 'block-1', parentId: 'loop-1', position: { x: 10, y: 20 } },
                { id: 'block-2', parentId: 'loop-1', position: { x: 30, y: 40 } },
              ],
              revertUpdates: [
                { id: 'block-1', parentId: '', position: { x: 1, y: 2 } },
                { id: 'block-2', parentId: '', position: { x: 3, y: 4 } },
              ],
            },
          },
          workflowId: 'workflow-1',
          timestamp: Date.now(),
          retryCount: 0,
          status: 'processing',
          userId: 'user-1',
        },
      ],
    })

    useOperationQueueStore.getState().confirmOperation('op-parent', {
      updates: [{ id: 'block-1', parentId: 'loop-1', position: { x: 100, y: 200 } }],
    })

    expect(mockBatchUpdateBlocksWithParent).toHaveBeenNthCalledWith(1, [
      { id: 'block-1', parentId: 'loop-1', position: { x: 100, y: 200 } },
    ])
    expect(mockBatchUpdateBlocksWithParent).toHaveBeenNthCalledWith(2, [
      { id: 'block-2', parentId: undefined, position: { x: 3, y: 4 } },
    ])
    expect(useOperationQueueStore.getState().operations).toEqual([])
  })
})
