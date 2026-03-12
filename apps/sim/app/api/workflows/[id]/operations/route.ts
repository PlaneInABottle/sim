/**
 * POST /api/workflows/[id]/operations
 *
 * Execute workflow operations via REST API.
 * Wraps the WebSocket operation layer for programmatic workflow editing.
 *
 * AuthZ: Owner or workspace write/admin permission required.
 * Supports both session auth and API-key auth (x-api-key header).
 *
 * Request Body:
 * {
 *   operation: string,     // e.g., "update-name", "batch-add-blocks"
 *   target: string,        // e.g., "block", "blocks", "edge"
 *   payload: any,          // Operation-specific data
 *   timestamp?: number,    // Optional: Unix timestamp (defaults to Date.now())
 *   broadcast?: boolean    // Optional: Notify WebSocket clients (defaults to true)
 * }
 *
 * Response: { success: boolean, operationId: string, timestamp: number, broadcastSent: boolean }
 */

import { createLogger } from '@sim/logger'
import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateApiKeyFromHeader, updateApiKeyLastUsed } from '@/lib/api-key/service'
import { getSession } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { generateRequestId } from '@/lib/core/utils/request'
import { authorizeWorkflowByWorkspacePermission, getWorkflowById } from '@/lib/workflows/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'
import {
  enrichBatchAddBlocksPayload,
  persistWorkflowOperation,
  type OperationResult,
} from '@/socket/database/operations'
import { BLOCKS_OPERATIONS, EDGES_OPERATIONS, OPERATION_TARGETS } from '@/socket/constants'
import { getAllValidBlockTypes, WorkflowOperationSchema } from '@/socket/validation/schemas'

const logger = createLogger('WorkflowOperationsAPI')

type PostgresLikeError = {
  code?: string
  detail?: string
  cause?: {
    code?: string
    detail?: string
  }
}

function getPostgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const err = error as PostgresLikeError
  return err.code || err.cause?.code
}

function extractConflictingBlockIds(error: unknown): string[] {
  if (!error || typeof error !== 'object') return []

  const err = error as PostgresLikeError & { message?: string }
  const candidates = [err.detail, err.cause?.detail, err.message].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )

  for (const candidate of candidates) {
    const match = candidate.match(/Key \(id\)=\(([^)]+)\) already exists/i)
    if (!match?.[1]) continue

    return match[1]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return []
}

function createDuplicateBlockIdConflictMessage(error: unknown): string {
  const conflictingIds = extractConflictingBlockIds(error)
  const conflictingIdsSuffix =
    conflictingIds.length > 0
      ? ` Conflicting block ID${conflictingIds.length === 1 ? '' : 's'}: ${conflictingIds
          .map((id) => `"${id}"`)
          .join(', ')}.`
      : ''

  return (
    'Unable to add blocks: one or more supplied block IDs are already in use. ' +
    'Block IDs are globally unique across workflows. Choose unique IDs before retrying, ' +
    'or omit explicit id values if your caller supports auto-generated IDs.' +
    conflictingIdsSuffix
  )
}

/**
 * Extended operation request schema.
 * Preprocesses request to inject default timestamp before validating against WorkflowOperationSchema.
 * Adds optional broadcast field for WebSocket notification.
 */
const OperationRequestSchema = z
  .preprocess(
    (data: any) => ({
      ...data,
      timestamp: data?.timestamp ?? Date.now(),
      operationId: data?.operationId ?? crypto.randomUUID(),
    }),
    WorkflowOperationSchema
  )
  .and(
    z.object({
      broadcast: z.boolean().default(true),
    })
  )

/**
 * Authenticate user via session or API key
 * Returns userId if authenticated, null otherwise
 */
async function authenticateUser(
  request: NextRequest,
  workflowId: string,
  requestId: string
): Promise<{ userId: string | null; error: NextResponse | null }> {
  // Try session auth first
  const session = await getSession()
  if (session?.user?.id) {
    return { userId: session.user.id, error: null }
  }

  const workflow = await getWorkflowById(workflowId)
  if (!workflow) {
    return { userId: null, error: createErrorResponse('Workflow not found', 404) }
  }

  // Try API key auth (scoped to workflow/workspace policy)
  const apiKeyHeader = request.headers.get('x-api-key')
  if (apiKeyHeader) {
    const authResult = workflow.workspaceId
      ? await authenticateApiKeyFromHeader(apiKeyHeader, {
          workspaceId: workflow.workspaceId,
          keyTypes: ['workspace', 'personal'],
        })
      : await authenticateApiKeyFromHeader(apiKeyHeader, {
          userId: workflow.userId,
          keyTypes: ['personal'],
        })

    if (authResult.success && authResult.userId) {
      if (authResult.keyId) {
        await updateApiKeyLastUsed(authResult.keyId).catch((err) => {
          logger.warn(`[${requestId}] Failed to update API key last used timestamp:`, {
            keyId: authResult.keyId,
            error: err,
          })
        })
      }
      return { userId: authResult.userId, error: null }
    }
  }

  return { userId: null, error: createErrorResponse('Unauthorized', 401) }
}

/**
 * Validate user has write permission on the workflow
 */
async function validateWritePermission(
  workflowId: string,
  userId: string,
  requestId: string
): Promise<{ error: NextResponse | null }> {
  const authorization = await authorizeWorkflowByWorkspacePermission({
    workflowId,
    userId,
    action: 'write',
  })

  if (!authorization.allowed) {
    if (authorization.status === 404) {
      logger.warn(`[${requestId}] Workflow ${workflowId} not found`)
    } else {
      logger.warn(`[${requestId}] User ${userId} unauthorized to write workflow ${workflowId}`)
    }
    return {
      error: createErrorResponse(
        authorization.message ?? 'Unauthorized: Access denied to write this workflow',
        authorization.status
      ),
    }
  }

  return { error: null }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id: workflowId } = await params

  try {
    // 1. Authenticate user (session or API key)
    const { userId, error: authError } = await authenticateUser(request, workflowId, requestId)
    if (authError || !userId) {
      logger.warn(`[${requestId}] Unauthorized access attempt for workflow ${workflowId}`)
      return authError ?? createErrorResponse('Unauthorized', 401)
    }

    // 2. Validate write permission on workflow
    const { error: permError } = await validateWritePermission(workflowId, userId, requestId)
    if (permError) {
      return permError
    }

    // 3. Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      logger.warn(`[${requestId}] Invalid JSON in request body`, { workflowId })
      return createErrorResponse('Invalid JSON in request body', 400)
    }

    // 4. Validate request body with Zod schema
    let validatedOperation: z.infer<typeof OperationRequestSchema>
    try {
      validatedOperation = OperationRequestSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Check if this is a block type validation error
        const blockTypeErrors = error.issues.filter((issue) => {
          const path = issue.path.join('.')
          return path.includes('type') && issue.message.includes('Invalid block type')
        })

        if (blockTypeErrors.length > 0) {
          // Provide detailed error message with valid block types
          const validTypes = getAllValidBlockTypes()
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
          ].filter((t) => validTypes.includes(t))
          const invalidTypes = blockTypeErrors
            .map((e) => e.message.match(/Invalid block type: "([^"]+)"/)?.[1] || 'unknown')
            .filter(Boolean)

          const errorMessage =
            `Invalid block type(s): ${invalidTypes.join(', ')}. ` +
            `Valid block types include: ${exampleTypes.join(', ')}, and ${validTypes.length - exampleTypes.length} more. ` +
            `Total ${validTypes.length} block types available. ` +
            `Use underscores (e.g., "api_trigger", "google_sheets") not hyphens.`

          logger.warn(`[${requestId}] Invalid block type in request`, {
            workflowId,
            invalidTypes,
            zodErrors: error.errors,
          })
          return createErrorResponse(errorMessage, 400)
        }

        // Format union validation errors more helpfully
        const errorMessages = error.issues.map((issue) => {
          if (issue.code === 'invalid_union') {
            // For union errors, extract details from sub-errors
            const subErrors = issue.unionErrors
              ?.flatMap((e) =>
                e.issues.map(
                  (i) => `${i.path.length > 0 ? `${i.path.join('.')}: ` : ''}${i.message}`
                )
              )
              .filter(Boolean)
            return subErrors?.length ? subErrors.join('; ') : 'Invalid operation format'
          }
          return `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`
        })
        const errorMessage = errorMessages.join(', ')
        logger.warn(`[${requestId}] Invalid operation request`, {
          workflowId,
          zodErrors: error.errors,
        })
        return createErrorResponse(`Invalid operation request: ${errorMessage}`, 400)
      }
      throw error
    }

    const operationId = validatedOperation.operationId
    const timestamp = validatedOperation.timestamp

    // 5. Enrich BATCH_ADD_BLOCKS payloads with registry defaults (subBlocks, outputs, triggerMode)
    //    This matches the WebSocket handler behaviour so REST and WS paths produce identical data.
    const enrichedPayload =
      validatedOperation.target === OPERATION_TARGETS.BLOCKS &&
      validatedOperation.operation === BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS
        ? enrichBatchAddBlocksPayload(validatedOperation.payload as Record<string, unknown>)
        : validatedOperation.payload

    // 6. Persist operation to database
    let operationResult: OperationResult = {}
    try {
      operationResult = await persistWorkflowOperation(workflowId, {
        operation: validatedOperation.operation,
        target: validatedOperation.target,
        payload: enrichedPayload,
        timestamp,
        operationId,
        userId,
      })
    } catch (dbError) {
      const isDuplicateBlockIdConflict =
        validatedOperation.target === OPERATION_TARGETS.BLOCKS &&
        validatedOperation.operation === BLOCKS_OPERATIONS.BATCH_ADD_BLOCKS &&
        getPostgresErrorCode(dbError) === '23505'

      if (isDuplicateBlockIdConflict) {
        const errorMessage = createDuplicateBlockIdConflictMessage(dbError)

        logger.warn(`[${requestId}] Duplicate block ID conflict`, {
          error: dbError,
          workflowId,
          operationId,
          operation: validatedOperation.operation,
          target: validatedOperation.target,
          conflictingBlockIds: extractConflictingBlockIds(dbError),
        })

        return createErrorResponse(errorMessage, 409, 'DUPLICATE_BLOCK_ID')
      }

      const errMsg = dbError instanceof Error 
        ? dbError.message 
        : 'Failed to persist operation to database'
      logger.error(`[${requestId}] ${errMsg}`, {
        error: dbError,
        workflowId,
        operationId,
        operation: validatedOperation.operation,
        target: validatedOperation.target,
      })
      return createErrorResponse(errMsg, 500)
    }

    logger.info(`[${requestId}] Persisted operation ${operationId}`, {
      workflowId,
      operation: validatedOperation.operation,
      target: validatedOperation.target,
    })

    // 7. Optional: Broadcast to WebSocket clients
    //    Send the enriched payload so socket server receives consistent data
    //    (the socket http.ts handler also enriches, but sending pre-enriched
    //    avoids double-enrichment overhead and keeps the paths consistent).
    let broadcastSent = false
    if (validatedOperation.broadcast) {
      try {
        const socketUrl = env.SOCKET_SERVER_URL || 'http://localhost:3002'

        const notifyResponse = await fetch(`${socketUrl}/api/workflow-operation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.INTERNAL_API_SECRET,
          },
          body: JSON.stringify({
            workflowId,
            operation: validatedOperation.operation,
            target: validatedOperation.target,
            payload: enrichedPayload,
            operationId,
            timestamp,
          }),
          signal: AbortSignal.timeout(5000), // 5 second timeout
        })

        if (notifyResponse.ok) {
          broadcastSent = true
          logger.info(`[${requestId}] Broadcast sent for operation ${operationId}`, {
            workflowId,
            operation: validatedOperation.operation,
            target: validatedOperation.target,
          })
        } else {
          logger.warn(`[${requestId}] Failed to broadcast operation ${operationId}`, {
            workflowId,
            status: notifyResponse.status,
            statusText: notifyResponse.statusText,
          })
        }

        // Broadcast edge removals as a separate operation so connected clients
        // remove the now-invalid edges from their local state.
        if (
          operationResult.removedEdgeIds &&
          operationResult.removedEdgeIds.length > 0
        ) {
          const edgeRemovalResponse = await fetch(`${socketUrl}/api/workflow-operation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': env.INTERNAL_API_SECRET,
            },
            body: JSON.stringify({
              workflowId,
              operation: EDGES_OPERATIONS.BATCH_REMOVE_EDGES,
              target: OPERATION_TARGETS.EDGES,
              payload: { ids: operationResult.removedEdgeIds },
              operationId: crypto.randomUUID(),
              timestamp,
            }),
            signal: AbortSignal.timeout(5000),
          })

          if (edgeRemovalResponse.ok) {
            logger.info(
              `[${requestId}] Broadcast edge removal for ${operationResult.removedEdgeIds.length} edge(s)`,
              { workflowId }
            )
          }
        }

        // Broadcast auto-connected edges so connected clients add the new edges
        // to their local state (mirrors the UI's tryCreateAutoConnectEdge behavior).
        if (
          operationResult.addedEdges &&
          operationResult.addedEdges.length > 0
        ) {
          const edgeAddResponse = await fetch(`${socketUrl}/api/workflow-operation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': env.INTERNAL_API_SECRET,
            },
            body: JSON.stringify({
              workflowId,
              operation: EDGES_OPERATIONS.BATCH_ADD_EDGES,
              target: OPERATION_TARGETS.EDGES,
              payload: { edges: operationResult.addedEdges },
              operationId: crypto.randomUUID(),
              timestamp,
            }),
            signal: AbortSignal.timeout(5000),
          })

          if (edgeAddResponse.ok) {
            logger.info(
              `[${requestId}] Broadcast auto-connect edge addition for ${operationResult.addedEdges.length} edge(s)`,
              { workflowId }
            )
          }
        }
      } catch (broadcastError) {
        // Don't fail the operation if broadcast fails
        // Reset broadcastSent since the broadcast did not complete fully
        broadcastSent = false
        logger.error(`[${requestId}] BROADCAST FAILED - UI will not sync`, {
          error: broadcastError instanceof Error ? broadcastError.message : String(broadcastError),
          workflowId,
          socketUrl: env.SOCKET_SERVER_URL || 'http://localhost:3002',
          operation: validatedOperation.operation,
          target: validatedOperation.target,
        })
      }
    } else {
      logger.debug(`[${requestId}] Broadcast skipped for operation ${operationId}`, {
        workflowId,
        broadcast: validatedOperation.broadcast,
      })
    }

    // 8. Return success response
    return createSuccessResponse({
      success: true,
      operationId,
      timestamp,
      broadcastSent,
      ...(operationResult.removedEdgeIds?.length && {
        removedEdgeIds: operationResult.removedEdgeIds,
      }),
      ...(operationResult.addedEdgeIds?.length && {
        addedEdgeIds: operationResult.addedEdgeIds,
      }),
      ...(operationResult.blocksRemoved !== undefined && {
        blocksRemoved: operationResult.blocksRemoved,
      }),
      ...(operationResult.warnings?.length && {
        warnings: operationResult.warnings,
      }),
    })
  } catch (error) {
    const errMsg = error instanceof Error 
      ? error.message 
      : 'Failed to process operation'
    logger.error(`[${requestId}] ${errMsg}`, { error, workflowId })
    return createErrorResponse(errMsg, 500)
  }
}
