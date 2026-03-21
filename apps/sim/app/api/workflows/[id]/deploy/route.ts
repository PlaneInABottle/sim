import { db, workflow, workflowDeploymentVersion } from '@sim/db'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getAuditActorMetadata } from '@/lib/audit/actor-metadata'
import { AuditAction, AuditResourceType, recordAudit } from '@/lib/audit/log'
import { generateRequestId } from '@/lib/core/utils/request'
import { removeMcpToolsForWorkflow, syncMcpToolsForWorkflow } from '@/lib/mcp/workflow-mcp-sync'
import {
  cleanupWebhooksForWorkflow,
  restorePreviousVersionWebhooks,
  saveTriggerWebhooksForDeploy,
} from '@/lib/webhooks/deploy'
import {
  activateWorkflowVersionById,
  deleteDeploymentVersionById,
  deployWorkflow,
  loadWorkflowFromNormalizedTables,
  reactivateWorkflowVersionForRollback,
  undeployWorkflow,
} from '@/lib/workflows/persistence/utils'
import {
  cleanupDeploymentVersion,
  createSchedulesForDeploy,
  validateWorkflowSchedules,
} from '@/lib/workflows/schedules'
import { validateWorkflowAccess } from '@/app/api/workflows/middleware'
import {
  checkNeedsRedeployment,
  createErrorResponse,
  createSuccessResponse,
} from '@/app/api/workflows/utils'

const logger = createLogger('WorkflowDeployAPI')

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id } = await params

  try {
    const access = await validateWorkflowAccess(request, id, {
      requireDeployment: false,
      action: 'read',
    })
    if (access.error) {
      return createErrorResponse(access.error.message, access.error.status)
    }

    const workflowData = access.workflow

    if (!workflowData.isDeployed) {
      logger.info(`[${requestId}] Workflow is not deployed: ${id}`)
      return createSuccessResponse({
        isDeployed: false,
        deployedAt: null,
        apiKey: null,
        needsRedeployment: false,
        isPublicApi: workflowData.isPublicApi ?? false,
      })
    }

    const needsRedeployment = await checkNeedsRedeployment(id)

    logger.info(`[${requestId}] Successfully retrieved deployment info: ${id}`)

    const responseApiKeyInfo = workflowData.workspaceId ? 'Workspace API keys' : 'Personal API keys'

    return createSuccessResponse({
      apiKey: responseApiKeyInfo,
      isDeployed: workflowData.isDeployed,
      deployedAt: workflowData.deployedAt,
      needsRedeployment,
      isPublicApi: workflowData.isPublicApi ?? false,
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching deployment info: ${id}`, error)
    return createErrorResponse(error.message || 'Failed to fetch deployment information', 500)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id } = await params

  try {
    const access = await validateWorkflowAccess(request, id, {
      requireDeployment: false,
      action: 'admin',
    })
    if (access.error) {
      return createErrorResponse(access.error.message, access.error.status)
    }

    const auth = access.auth
    const workflowData = access.workflow

    const actorUserId: string | null = auth?.userId ?? null
    if (!actorUserId) {
      logger.warn(`[${requestId}] Unable to resolve actor user for workflow deployment: ${id}`)
      return createErrorResponse('Unable to determine deploying user', 400)
    }

    const normalizedData = await loadWorkflowFromNormalizedTables(id)
    if (!normalizedData) {
      return createErrorResponse('Failed to load workflow state', 500)
    }

    const scheduleValidation = validateWorkflowSchedules(normalizedData.blocks)
    if (!scheduleValidation.isValid) {
      logger.warn(
        `[${requestId}] Schedule validation failed for workflow ${id}: ${scheduleValidation.error}`
      )
      return createErrorResponse(`Invalid schedule configuration: ${scheduleValidation.error}`, 400)
    }

    const [currentActiveVersion] = await db
      .select({ id: workflowDeploymentVersion.id, deployedAt: workflow.deployedAt })
      .from(workflowDeploymentVersion)
      .innerJoin(workflow, eq(workflowDeploymentVersion.workflowId, workflow.id))
      .where(
        and(
          eq(workflowDeploymentVersion.workflowId, id),
          eq(workflowDeploymentVersion.isActive, true)
        )
      )
      .limit(1)
    const previousVersionId = currentActiveVersion?.id
    const previousDeployedAt = currentActiveVersion?.deployedAt ?? null

    const rollbackDeployment = async (failedDeploymentVersionId?: string) => {
      const ensureFailedDeploymentVersionDeleted = async () => {
        if (!failedDeploymentVersionId) {
          return
        }

        const deleteResult = await deleteDeploymentVersionById({
          workflowId: id,
          deploymentVersionId: failedDeploymentVersionId,
        })

        if (!deleteResult.success) {
          throw new Error(deleteResult.error || 'Failed to delete failed deployment version')
        }
      }

      if (previousVersionId) {
        await restorePreviousVersionWebhooks({
          request,
          workflow: workflowData as Record<string, unknown>,
          userId: actorUserId,
          previousVersionId,
          requestId,
        })
        const reactivateResult = previousDeployedAt
          ? await reactivateWorkflowVersionForRollback({
              workflowId: id,
              deploymentVersionId: previousVersionId,
              deployedAt: previousDeployedAt,
            })
          : await activateWorkflowVersionById({
              workflowId: id,
              deploymentVersionId: previousVersionId,
            })
        if (reactivateResult.success) {
          await ensureFailedDeploymentVersionDeleted()
          return
        }
      }

      const undeployResult = await undeployWorkflow({ workflowId: id })
      if (!undeployResult.success) {
        return createErrorResponse(
          undeployResult.error || 'Failed to undeploy workflow',
          500,
          'UNDEPLOY_FAILED'
        )
      }

      await ensureFailedDeploymentVersionDeleted()
    }

    const deployResult = await deployWorkflow({
      workflowId: id,
      deployedBy: actorUserId,
      workflowName: workflowData!.name,
    })

    if (!deployResult.success) {
      return createErrorResponse(deployResult.error || 'Failed to deploy workflow', 500)
    }

    const deployedAt = deployResult.deployedAt!
    const deploymentVersionId = deployResult.deploymentVersionId

    if (!deploymentVersionId) {
      const undeployResult = await undeployWorkflow({ workflowId: id })
      if (!undeployResult.success) {
        return createErrorResponse(
          undeployResult.error || 'Failed to undeploy workflow',
          500,
          'UNDEPLOY_FAILED'
        )
      }

      return createErrorResponse('Failed to resolve deployment version', 500)
    }

    const triggerSaveResult = await saveTriggerWebhooksForDeploy({
      request,
      workflowId: id,
      workflow: workflowData,
      userId: actorUserId,
      blocks: normalizedData.blocks,
      requestId,
      deploymentVersionId,
      previousVersionId,
    })

    if (!triggerSaveResult.success) {
      await cleanupDeploymentVersion({
        workflowId: id,
        workflow: workflowData as Record<string, unknown>,
        requestId,
        deploymentVersionId,
      })
      const rollbackResponse = await rollbackDeployment(deploymentVersionId)
      if (rollbackResponse) {
        return rollbackResponse
      }
      return createErrorResponse(
        triggerSaveResult.error?.message || 'Failed to save trigger configuration',
        triggerSaveResult.error?.status || 500
      )
    }

    let scheduleInfo: { scheduleId?: string; cronExpression?: string; nextRunAt?: Date } = {}
    const scheduleResult = await createSchedulesForDeploy(
      id,
      normalizedData.blocks,
      db,
      deploymentVersionId
    )
    if (!scheduleResult.success) {
      logger.error(
        `[${requestId}] Failed to create schedule for workflow ${id}: ${scheduleResult.error}`
      )
      await cleanupDeploymentVersion({
        workflowId: id,
        workflow: workflowData as Record<string, unknown>,
        requestId,
        deploymentVersionId,
      })
      const rollbackResponse = await rollbackDeployment(deploymentVersionId)
      if (rollbackResponse) {
        return rollbackResponse
      }
      return createErrorResponse(scheduleResult.error || 'Failed to create schedule', 500)
    }
    if (scheduleResult.scheduleId) {
      scheduleInfo = {
        scheduleId: scheduleResult.scheduleId,
        cronExpression: scheduleResult.cronExpression,
        nextRunAt: scheduleResult.nextRunAt,
      }
      logger.info(
        `[${requestId}] Schedule created for workflow ${id}: ${scheduleResult.scheduleId}`
      )
    }

    if (previousVersionId && previousVersionId !== deploymentVersionId) {
      try {
        logger.info(`[${requestId}] Cleaning up previous version ${previousVersionId} DB records`)
        await cleanupDeploymentVersion({
          workflowId: id,
          workflow: workflowData as Record<string, unknown>,
          requestId,
          deploymentVersionId: previousVersionId,
          skipExternalCleanup: true,
        })
      } catch (cleanupError) {
        logger.error(
          `[${requestId}] Failed to clean up previous version ${previousVersionId}`,
          cleanupError
        )
        // Non-fatal - continue with success response
      }
    }

    logger.info(`[${requestId}] Workflow deployed successfully: ${id}`)

    try {
      await syncMcpToolsForWorkflow({ workflowId: id, requestId, context: 'deploy' })
    } catch (syncError) {
      logger.error(`[${requestId}] Failed to sync MCP tools after deploy for workflow ${id}`, {
        error: syncError,
      })
    }

    const { actorName, actorEmail } = getAuditActorMetadata(auth)

    recordAudit({
      workspaceId: workflowData?.workspaceId || null,
      actorId: actorUserId,
      actorName,
      actorEmail,
      action: AuditAction.WORKFLOW_DEPLOYED,
      resourceType: AuditResourceType.WORKFLOW,
      resourceId: id,
      resourceName: workflowData?.name,
      description: `Deployed workflow "${workflowData?.name || id}"`,
      metadata: { version: deploymentVersionId },
      request,
    })

    const responseApiKeyInfo = workflowData!.workspaceId
      ? 'Workspace API keys'
      : 'Personal API keys'

    return createSuccessResponse({
      apiKey: responseApiKeyInfo,
      isDeployed: true,
      deployedAt,
      schedule: scheduleInfo.scheduleId
        ? {
            id: scheduleInfo.scheduleId,
            cronExpression: scheduleInfo.cronExpression,
            nextRunAt: scheduleInfo.nextRunAt,
          }
        : undefined,
      warnings: triggerSaveResult.warnings,
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Error deploying workflow: ${id}`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
      fullError: error,
    })
    return createErrorResponse(error.message || 'Failed to deploy workflow', 500)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id } = await params

  try {
    const access = await validateWorkflowAccess(request, id, {
      requireDeployment: false,
      action: 'admin',
    })
    if (access.error) {
      return createErrorResponse(access.error.message, access.error.status)
    }

    const auth = access.auth

    let body: { isPublicApi?: unknown }
    try {
      body = await request.json()
    } catch {
      return createErrorResponse('Invalid JSON body', 400)
    }

    const { isPublicApi } = body

    if (typeof isPublicApi !== 'boolean') {
      return createErrorResponse('Invalid request body: isPublicApi must be a boolean', 400)
    }

    if (isPublicApi) {
      const { validatePublicApiAllowed, PublicApiNotAllowedError } = await import(
        '@/ee/access-control/utils/permission-check'
      )
      const actorUserId = auth?.userId
      try {
        await validatePublicApiAllowed(actorUserId)
      } catch (err) {
        if (err instanceof PublicApiNotAllowedError) {
          return createErrorResponse('Public API access is disabled', 403)
        }
        throw err
      }
    }

    await db.update(workflow).set({ isPublicApi }).where(eq(workflow.id, id))

    logger.info(`[${requestId}] Updated isPublicApi for workflow ${id} to ${isPublicApi}`)

    return createSuccessResponse({ isPublicApi })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update deployment settings'
    logger.error(`[${requestId}] Error updating deployment settings: ${id}`, { error })
    return createErrorResponse(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const { id } = await params

  try {
    const access = await validateWorkflowAccess(request, id, {
      requireDeployment: false,
      action: 'admin',
    })
    if (access.error) {
      return createErrorResponse(access.error.message, access.error.status)
    }

    const auth = access.auth
    const workflowData = access.workflow

    const actorUserId = auth?.userId ?? null
    if (!actorUserId) {
      return createErrorResponse('Unable to determine undeploying user', 400)
    }

    const result = await undeployWorkflow({ workflowId: id })
    if (!result.success) {
      return createErrorResponse(result.error || 'Failed to undeploy workflow', 500)
    }

    try {
      await cleanupWebhooksForWorkflow(id, workflowData as Record<string, unknown>, requestId)
    } catch (cleanupError) {
      logger.error(`[${requestId}] Failed to cleanup webhooks after undeploy for workflow ${id}`, {
        error: cleanupError,
      })
    }

    try {
      await removeMcpToolsForWorkflow(id, requestId)
    } catch (cleanupError) {
      logger.error(`[${requestId}] Failed to cleanup MCP tools after undeploy for workflow ${id}`, {
        error: cleanupError,
      })
    }

    logger.info(`[${requestId}] Workflow undeployed successfully: ${id}`)

    try {
      const { PlatformEvents } = await import('@/lib/core/telemetry')
      PlatformEvents.workflowUndeployed({ workflowId: id })
    } catch (_e) {
      // Silently fail
    }

    const { actorName, actorEmail } = getAuditActorMetadata(auth)

    recordAudit({
      workspaceId: workflowData?.workspaceId || null,
      actorId: actorUserId,
      actorName,
      actorEmail,
      action: AuditAction.WORKFLOW_UNDEPLOYED,
      resourceType: AuditResourceType.WORKFLOW,
      resourceId: id,
      resourceName: workflowData?.name,
      description: `Undeployed workflow "${workflowData?.name || id}"`,
      request,
    })

    return createSuccessResponse({
      isDeployed: false,
      deployedAt: null,
      apiKey: null,
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Error undeploying workflow: ${id}`, error)
    return createErrorResponse(error.message || 'Failed to undeploy workflow', 500)
  }
}
