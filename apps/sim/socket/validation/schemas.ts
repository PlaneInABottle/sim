import { z } from 'zod'
import { getAllBlockTypes, isValidBlockType } from '@/blocks/registry'
import {
  BLOCK_OPERATIONS,
  BLOCKS_OPERATIONS,
  EDGE_OPERATIONS,
  EDGES_OPERATIONS,
  OPERATION_TARGETS,
  SUBBLOCK_OPERATIONS,
  SUBFLOW_OPERATIONS,
  VARIABLE_OPERATIONS,
  WORKFLOW_OPERATIONS,
} from '@/socket/constants'

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

/**
 * Special subflow block types that are not in the registry
 * but are valid for batch-add-blocks operations.
 */
const SPECIAL_BLOCK_TYPES = ['loop', 'parallel'] as const

/**
 * Check if a block type is valid (either registered or a special subflow type).
 */
export function isValidBlockTypeOrSubflow(type: string): boolean {
  return isValidBlockType(type) || SPECIAL_BLOCK_TYPES.includes(type as any)
}

/**
 * Get all valid block types (registered + special subflow types).
 */
export function getAllValidBlockTypes(): string[] {
  return [...getAllBlockTypes(), ...SPECIAL_BLOCK_TYPES]
}

/**
 * Schema for a block in batch-add-blocks operations.
 * Validates that the block type is a registered block or a special subflow type.
 */
const BlockSchema = z.object({
  id: z.string({
    required_error: 'Block id is required',
    invalid_type_error: 'Block id must be a string',
  }),
  type: z
    .string({
      required_error: 'Block type is required',
      invalid_type_error: 'Block type must be a string',
    })
    .refine(
      (type) => isValidBlockTypeOrSubflow(type),
      (type) => {
        const validTypes = getAllValidBlockTypes()
        // Show first 15 most common types as examples
        const exampleTypes = [
          'agent',
          'api',
          'function',
          'condition',
          'router',
          'slack',
          'gmail',
          'google_sheets',
          'webhook',
          'api_trigger',
          'schedule',
          'loop',
          'parallel',
          'starter',
          'response',
        ]
          .filter((t) => validTypes.includes(t))
          .join(', ')
        return {
          message:
            `Invalid block type: "${type}". ` +
            `Valid types include: ${exampleTypes}, and ${validTypes.length - 15} more. ` +
            `Use underscores (e.g., "api_trigger", "google_sheets") not hyphens.`,
        }
      }
    ),
  name: z.string({
    required_error: 'Block name is required',
    invalid_type_error: 'Block name must be a string',
  }),
  position: PositionSchema,
  // Optional fields with defaults
  enabled: z.boolean().optional(),
  horizontalHandles: z.boolean().optional(),
  advancedMode: z.boolean().optional(),
  triggerMode: z.boolean().optional(),
  height: z.number().optional(),
  data: z.record(z.any()).optional(),
  subBlocks: z.record(z.any()).optional(),
  outputs: z.record(z.any()).optional(),
})

// Schema for auto-connect edge data
const AutoConnectEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
})

export const BlockOperationSchema = z.object({
  operation: z.enum([
    BLOCK_OPERATIONS.UPDATE_POSITION,
    BLOCK_OPERATIONS.UPDATE_NAME,
    BLOCK_OPERATIONS.TOGGLE_ENABLED,
    BLOCK_OPERATIONS.UPDATE_PARENT,
    BLOCK_OPERATIONS.UPDATE_ADVANCED_MODE,
    BLOCK_OPERATIONS.UPDATE_CANONICAL_MODE,
    BLOCK_OPERATIONS.TOGGLE_HANDLES,
  ]),
  target: z.literal(OPERATION_TARGETS.BLOCK),
  payload: z.object({
    id: z.string(),
    type: z.string().optional(),
    name: z.string().optional(),
    position: PositionSchema.optional(),
    commit: z.boolean().optional(),
    data: z.record(z.any()).optional(),
    subBlocks: z.record(z.any()).optional(),
    outputs: z.record(z.any()).optional(),
    parentId: z.string().nullable().optional(),
    extent: z.enum(['parent']).nullable().optional(),
    enabled: z.boolean().optional(),
    advancedMode: z.boolean().optional(),
    horizontalHandles: z.boolean().optional(),
    canonicalId: z.string().optional(),
    canonicalMode: z.enum(['basic', 'advanced']).optional(),
    triggerMode: z.boolean().optional(),
    height: z.number().optional(),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchPositionUpdateSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_UPDATE_POSITIONS),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    updates: z.array(
      z.object({
        id: z.string(),
        position: PositionSchema,
      })
    ),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const EdgeOperationSchema = z.object({
  operation: z.enum([EDGE_OPERATIONS.ADD, EDGE_OPERATIONS.REMOVE]),
  target: z.literal(OPERATION_TARGETS.EDGE),
  payload: z.object({
    id: z.string(),
    source: z.string().optional(),
    target: z.string().optional(),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const SubflowOperationSchema = z.object({
  operation: z.literal(SUBFLOW_OPERATIONS.UPDATE),
  target: z.literal(OPERATION_TARGETS.SUBFLOW),
  payload: z.object({
    id: z.string(),
    type: z.enum(['loop', 'parallel']).optional(),
    config: z.record(z.any()),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const VariableOperationSchema = z.union([
  z.object({
    operation: z.literal(VARIABLE_OPERATIONS.ADD),
    target: z.literal(OPERATION_TARGETS.VARIABLE),
    payload: z.object({
      id: z.string(),
      name: z.string(),
      type: z.any(),
      value: z.any(),
      workflowId: z.string(),
    }),
    timestamp: z.number(),
    operationId: z.string().optional(),
  }),
  z.object({
    operation: z.literal(VARIABLE_OPERATIONS.REMOVE),
    target: z.literal(OPERATION_TARGETS.VARIABLE),
    payload: z.object({
      variableId: z.string(),
    }),
    timestamp: z.number(),
    operationId: z.string().optional(),
  }),
])

export const WorkflowStateOperationSchema = z.object({
  operation: z.literal(WORKFLOW_OPERATIONS.REPLACE_STATE),
  target: z.literal(OPERATION_TARGETS.WORKFLOW),
  payload: z.object({
    state: z.any(),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const SubblockUpdateSchema = z.object({
  operation: z.literal(SUBBLOCK_OPERATIONS.UPDATE),
  target: z.literal(OPERATION_TARGETS.SUBBLOCK),
  payload: z.object({
    blockId: z.string(),
    subblockId: z.string(),
    value: z.any(),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchAddBlocksSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    blocks: z.array(BlockSchema),
    edges: z.array(AutoConnectEdgeSchema).optional(),
    loops: z.record(z.any()).optional(),
    parallels: z.record(z.any()).optional(),
    subBlockValues: z.record(z.record(z.any())).optional(),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchRemoveBlocksSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_REMOVE_BLOCKS),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    ids: z.array(z.string()),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchRemoveEdgesSchema = z.object({
  operation: z.literal(EDGES_OPERATIONS.BATCH_REMOVE_EDGES),
  target: z.literal(OPERATION_TARGETS.EDGES),
  payload: z.object({
    ids: z.array(z.string()),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchAddEdgesSchema = z.object({
  operation: z.literal(EDGES_OPERATIONS.BATCH_ADD_EDGES),
  target: z.literal(OPERATION_TARGETS.EDGES),
  payload: z.object({
    edges: z.array(
      z.object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
        sourceHandle: z.string().nullable().optional(),
        targetHandle: z.string().nullable().optional(),
      })
    ),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchToggleEnabledSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_TOGGLE_ENABLED),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    blockIds: z.array(z.string()),
    previousStates: z.record(z.boolean()),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchToggleHandlesSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_TOGGLE_HANDLES),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    blockIds: z.array(z.string()),
    previousStates: z.record(z.boolean()),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchToggleLockedSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_TOGGLE_LOCKED),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    blockIds: z.array(z.string()),
    previousStates: z.record(z.boolean()),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const BatchUpdateParentSchema = z.object({
  operation: z.literal(BLOCKS_OPERATIONS.BATCH_UPDATE_PARENT),
  target: z.literal(OPERATION_TARGETS.BLOCKS),
  payload: z.object({
    updates: z.array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable().optional(),
        position: PositionSchema,
      })
    ),
  }),
  timestamp: z.number(),
  operationId: z.string().optional(),
})

export const WorkflowOperationSchema = z.union([
  BlockOperationSchema,
  BatchPositionUpdateSchema,
  BatchAddBlocksSchema,
  BatchRemoveBlocksSchema,
  BatchToggleEnabledSchema,
  BatchToggleHandlesSchema,
  BatchToggleLockedSchema,
  BatchUpdateParentSchema,
  EdgeOperationSchema,
  BatchAddEdgesSchema,
  BatchRemoveEdgesSchema,
  SubflowOperationSchema,
  VariableOperationSchema,
  WorkflowStateOperationSchema,
  SubblockUpdateSchema,
])

export { PositionSchema, AutoConnectEdgeSchema, BlockSchema }
