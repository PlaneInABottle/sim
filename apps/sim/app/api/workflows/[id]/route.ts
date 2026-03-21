import { db } from '@sim/db'
import { templates, workflow } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuditActorMetadata } from '@/lib/audit/actor-metadata'
import { AuditAction, AuditResourceType, recordAudit } from '@/lib/audit/log'
import { AuthType, checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { getActiveWorkflowContext } from '@/lib/workflows/active-context'
import { archiveWorkflow } from '@/lib/workflows/lifecycle'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/persistence/utils'
import { getWorkflowById } from '@/lib/workflows/utils'
import { validateWorkflowAccess } from '@/app/api/workflows/middleware'

const logger = createLogger('WorkflowByIdAPI')

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  folderId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

async function getVisibleWorkflowForInternalCompatibility(workflowId: string) {
  const context = await getActiveWorkflowContext(workflowId)
  if (context) {
    return { workflow: context.workflow }
  }

  const workflow = await getWorkflowById(workflowId, { includeArchived: true })
  if (!workflow) {
    return {
      error: {
        message: 'Workflow not found',
        status: 404,
      },
    }
  }

  if (!workflow.workspaceId) {
    return {
      error: {
        message:
          'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
        status: 403,
      },
    }
  }

  return {
    error: {
      message: 'Workflow not found',
      status: 404,
    },
  }
}

/**
 * GET /api/workflows/[id]
 * Fetch a single workflow by ID
 * Uses hybrid approach: try normalized tables first, fallback to JSON blob
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  const { id: workflowId } = await params

  try {
    const hasBearerAuth = request.headers.get('authorization')?.startsWith('Bearer ') ?? false
    const hasApiKey = Boolean(request.headers.get('x-api-key'))

    let workflowData

    if (hasBearerAuth && !hasApiKey) {
      const auth = await checkHybridAuth(request, { requireWorkflowId: false })
      const internalNoUserPrecheck =
        auth.success && auth.authType === AuthType.INTERNAL_JWT && !auth.userId

      if (!internalNoUserPrecheck) {
        const validation = await validateWorkflowAccess(request, workflowId, {
          requireDeployment: false,
          action: 'read',
        })
        if (validation.error) {
          logger.warn(`[${requestId}] Unauthorized access attempt for workflow ${workflowId}`)
          return NextResponse.json(
            { error: validation.error.message },
            { status: validation.error.status }
          )
        }

        workflowData = validation.workflow
        if (!workflowData) {
          logger.warn(`[${requestId}] Workflow ${workflowId} not found`)
          return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
        }
      } else {
        const workflowResult = await getVisibleWorkflowForInternalCompatibility(workflowId)
        if (workflowResult.error || !workflowResult.workflow) {
          logger.warn(
            `[${requestId}] Workflow ${workflowId} not available for internal compatibility read`
          )
          return NextResponse.json(
            { error: workflowResult.error?.message || 'Workflow not found' },
            { status: workflowResult.error?.status || 404 }
          )
        }

        workflowData = workflowResult.workflow
        logger.info(`[${requestId}] Internal bearer compatibility read for workflow ${workflowId}`)
      }
    } else {
      const validation = await validateWorkflowAccess(request, workflowId, {
        requireDeployment: false,
        action: 'read',
      })
      if (validation.error) {
        logger.warn(`[${requestId}] Unauthorized access attempt for workflow ${workflowId}`)
        return NextResponse.json(
          { error: validation.error.message },
          { status: validation.error.status }
        )
      }

      workflowData = validation.workflow
      if (!workflowData) {
        logger.warn(`[${requestId}] Workflow ${workflowId} not found`)
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
      }
    }

    const normalizedData = await loadWorkflowFromNormalizedTables(workflowId)

    if (normalizedData) {
      const finalWorkflowData = {
        ...workflowData,
        state: {
          deploymentStatuses: {},
          blocks: normalizedData.blocks,
          edges: normalizedData.edges,
          loops: normalizedData.loops,
          parallels: normalizedData.parallels,
          lastSaved: Date.now(),
          isDeployed: workflowData.isDeployed || false,
          deployedAt: workflowData.deployedAt,
          metadata: {
            name: workflowData.name,
            description: workflowData.description,
          },
        },
        variables: workflowData.variables || {},
      }

      logger.info(`[${requestId}] Loaded workflow ${workflowId} from normalized tables`)
      const elapsed = Date.now() - startTime
      logger.info(`[${requestId}] Successfully fetched workflow ${workflowId} in ${elapsed}ms`)

      return NextResponse.json({ data: finalWorkflowData }, { status: 200 })
    }

    const emptyWorkflowData = {
      ...workflowData,
      state: {
        deploymentStatuses: {},
        blocks: {},
        edges: [],
        loops: {},
        parallels: {},
        lastSaved: Date.now(),
        isDeployed: workflowData.isDeployed || false,
        deployedAt: workflowData.deployedAt,
        metadata: {
          name: workflowData.name,
          description: workflowData.description,
        },
      },
      variables: workflowData.variables || {},
    }

    return NextResponse.json({ data: emptyWorkflowData }, { status: 200 })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    logger.error(`[${requestId}] Error fetching workflow ${workflowId} after ${elapsed}ms`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/workflows/[id]
 * Delete a workflow by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  const { id: workflowId } = await params

  try {
    const validation = await validateWorkflowAccess(request, workflowId, {
      requireDeployment: false,
      action: 'admin',
    })
    if (validation.error) {
      logger.warn(`[${requestId}] Unauthorized deletion attempt for workflow ${workflowId}`)
      return NextResponse.json(
        { error: validation.error.message },
        { status: validation.error.status }
      )
    }

    const auth = validation.auth
    const userId = auth?.userId
    const workflowData = validation.workflow

    if (!userId) {
      logger.warn(`[${requestId}] Missing user identity for workflow deletion ${workflowId}`)
      return NextResponse.json(
        { error: 'Workflow deletion requires a user-backed session or API key identity' },
        { status: 400 }
      )
    }

    if (!workflowData) {
      logger.warn(`[${requestId}] Workflow ${workflowId} not found for deletion`)
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    // Check if this is the last workflow in the workspace
    if (workflowData.workspaceId) {
      const totalWorkflowsInWorkspace = await db
        .select({ id: workflow.id })
        .from(workflow)
        .where(and(eq(workflow.workspaceId, workflowData.workspaceId), isNull(workflow.archivedAt)))

      if (totalWorkflowsInWorkspace.length <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the only workflow in the workspace' },
          { status: 400 }
        )
      }
    }

    // Check if workflow has published templates before deletion
    const { searchParams } = new URL(request.url)
    const checkTemplates = searchParams.get('check-templates') === 'true'
    const deleteTemplatesParam = searchParams.get('deleteTemplates')

    if (checkTemplates) {
      // Return template information for frontend to handle
      const publishedTemplates = await db
        .select({
          id: templates.id,
          name: templates.name,
          views: templates.views,
          stars: templates.stars,
          status: templates.status,
        })
        .from(templates)
        .where(eq(templates.workflowId, workflowId))

      return NextResponse.json({
        hasPublishedTemplates: publishedTemplates.length > 0,
        count: publishedTemplates.length,
        publishedTemplates: publishedTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          views: t.views,
          stars: t.stars,
        })),
      })
    }

    // Handle template deletion based on user choice
    if (deleteTemplatesParam !== null) {
      const deleteTemplates = deleteTemplatesParam === 'delete'

      if (deleteTemplates) {
        // Delete all templates associated with this workflow
        await db.delete(templates).where(eq(templates.workflowId, workflowId))
        logger.info(`[${requestId}] Deleted templates for workflow ${workflowId}`)
      } else {
        // Orphan the templates (set workflowId to null)
        await db
          .update(templates)
          .set({ workflowId: null })
          .where(eq(templates.workflowId, workflowId))
        logger.info(`[${requestId}] Orphaned templates for workflow ${workflowId}`)
      }
    }

    const archiveResult = await archiveWorkflow(workflowId, { requestId })
    if (!archiveResult.workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const elapsed = Date.now() - startTime
    logger.info(`[${requestId}] Successfully archived workflow ${workflowId} in ${elapsed}ms`)

    const { actorName, actorEmail } = getAuditActorMetadata(auth)

    recordAudit({
      workspaceId: workflowData.workspaceId || null,
      actorId: userId,
      actorName,
      actorEmail,
      action: AuditAction.WORKFLOW_DELETED,
      resourceType: AuditResourceType.WORKFLOW,
      resourceId: workflowId,
      resourceName: workflowData.name,
      description: `Archived workflow "${workflowData.name}"`,
      metadata: {
        archived: archiveResult.archived,
        deleteTemplates: deleteTemplatesParam === 'delete',
      },
      request,
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    logger.error(`[${requestId}] Error deleting workflow ${workflowId} after ${elapsed}ms`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/workflows/[id]
 * Update workflow metadata (name, description, color, folderId)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const startTime = Date.now()
  const { id: workflowId } = await params

  try {
    const validation = await validateWorkflowAccess(request, workflowId, {
      requireDeployment: false,
      action: 'write',
    })
    if (validation.error) {
      logger.warn(`[${requestId}] Unauthorized update attempt for workflow ${workflowId}`)
      return NextResponse.json(
        { error: validation.error.message },
        { status: validation.error.status }
      )
    }

    const userId = validation.auth?.userId
    const workflowData = validation.workflow
    if (!userId) {
      logger.warn(`[${requestId}] Missing user identity for workflow update ${workflowId}`)
      return NextResponse.json(
        { error: 'Workflow update requires a user-backed session or API key identity' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const updates = UpdateWorkflowSchema.parse(body)

    if (!workflowData) {
      logger.warn(`[${requestId}] Workflow ${workflowId} not found for update`)
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.color !== undefined) updateData.color = updates.color
    if (updates.folderId !== undefined) updateData.folderId = updates.folderId
    if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder

    if (updates.name !== undefined || updates.folderId !== undefined) {
      const targetName = updates.name ?? workflowData.name
      const targetFolderId =
        updates.folderId !== undefined ? updates.folderId : workflowData.folderId

      if (!workflowData.workspaceId) {
        logger.error(`[${requestId}] Workflow ${workflowId} has no workspaceId`)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      const conditions = [
        eq(workflow.workspaceId, workflowData.workspaceId),
        isNull(workflow.archivedAt),
        eq(workflow.name, targetName),
        ne(workflow.id, workflowId),
      ]

      if (targetFolderId) {
        conditions.push(eq(workflow.folderId, targetFolderId))
      } else {
        conditions.push(isNull(workflow.folderId))
      }

      const [duplicate] = await db
        .select({ id: workflow.id })
        .from(workflow)
        .where(and(...conditions))
        .limit(1)

      if (duplicate) {
        logger.warn(
          `[${requestId}] Duplicate workflow name "${targetName}" in folder ${targetFolderId ?? 'root'}`
        )
        return NextResponse.json(
          { error: `A workflow named "${targetName}" already exists in this folder` },
          { status: 409 }
        )
      }
    }

    // Update the workflow
    const [updatedWorkflow] = await db
      .update(workflow)
      .set(updateData)
      .where(eq(workflow.id, workflowId))
      .returning()

    const elapsed = Date.now() - startTime
    logger.info(`[${requestId}] Successfully updated workflow ${workflowId} in ${elapsed}ms`, {
      updates: updateData,
    })

    return NextResponse.json({ workflow: updatedWorkflow }, { status: 200 })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid workflow update data for ${workflowId}`, {
        errors: error.errors,
      })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error updating workflow ${workflowId} after ${elapsed}ms`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
