import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { getJobQueue, JOB_STATUS } from '@/lib/core/async-jobs'
import type { AsyncExecutionCorrelation, Job } from '@/lib/core/async-jobs/types'
import { generateRequestId } from '@/lib/core/utils/request'
import { buildExecutionDiagnostics } from '@/lib/logs/execution/diagnostics'
import { createErrorResponse } from '@/app/api/workflows/utils'

const logger = createLogger('TaskStatusAPI')

function getCorrelationEvidence(job: Job): {
  available: boolean
  executionId?: string
  source: 'metadata.correlation' | 'metadata' | 'output' | 'none'
  fields: string[]
} {
  const metadata = job.metadata ?? {}
  const output = job.output && typeof job.output === 'object' ? job.output : undefined
  const typedCorrelation = metadata.correlation as AsyncExecutionCorrelation | undefined

  if (typedCorrelation?.executionId) {
    return {
      available: true,
      executionId: typedCorrelation.executionId,
      source: 'metadata.correlation',
      fields: ['metadata.correlation.executionId'],
    }
  }

  const metadataExecutionId =
    typeof metadata.executionId === 'string' && metadata.executionId.length > 0
      ? metadata.executionId
      : undefined
  if (metadataExecutionId) {
    return {
      available: true,
      executionId: metadataExecutionId,
      source: 'metadata',
      fields: ['metadata.executionId'],
    }
  }

  const outputExecutionId =
    output && 'executionId' in output && typeof output.executionId === 'string'
      ? output.executionId
      : undefined
  if (outputExecutionId) {
    return {
      available: true,
      executionId: outputExecutionId,
      source: 'output',
      fields: ['output.executionId'],
    }
  }

  return {
    available: false,
    source: 'none',
    fields: [],
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: taskId } = await params
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized task status request`)
      return createErrorResponse(authResult.error || 'Authentication required', 401)
    }

    const authenticatedUserId = authResult.userId

    const jobQueue = await getJobQueue()
    const job = await jobQueue.getJob(taskId)

    if (!job) {
      return createErrorResponse('Task not found', 404)
    }

    if (job.metadata?.workflowId) {
      const { verifyWorkflowAccess } = await import('@/socket/middleware/permissions')
      const accessCheck = await verifyWorkflowAccess(
        authenticatedUserId,
        job.metadata.workflowId as string
      )
      if (!accessCheck.hasAccess) {
        logger.warn(`[${requestId}] Access denied to workflow ${job.metadata.workflowId}`)
        return createErrorResponse('Access denied', 403)
      }

      if (authResult.apiKeyType === 'workspace' && authResult.workspaceId) {
        const { getWorkflowById } = await import('@/lib/workflows/utils')
        const workflow = await getWorkflowById(job.metadata.workflowId as string)
        if (!workflow?.workspaceId || workflow.workspaceId !== authResult.workspaceId) {
          return createErrorResponse('API key is not authorized for this workspace', 403)
        }
      }
    } else if (job.metadata?.userId && job.metadata.userId !== authenticatedUserId) {
      logger.warn(`[${requestId}] Access denied to user ${job.metadata.userId}`)
      return createErrorResponse('Access denied', 403)
    } else if (!job.metadata?.userId && !job.metadata?.workflowId) {
      logger.warn(`[${requestId}] Access denied to job ${taskId}`)
      return createErrorResponse('Access denied', 403)
    }

    const mappedStatus = job.status === JOB_STATUS.PENDING ? 'queued' : job.status
    const correlation = getCorrelationEvidence(job)

    const response: any = {
      success: true,
      taskId,
      status: mappedStatus,
      metadata: {
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      },
      correlation,
    }

    if (job.status === JOB_STATUS.COMPLETED) {
      response.output = job.output
      response.metadata.completedAt = job.completedAt
      if (job.startedAt && job.completedAt) {
        response.metadata.duration = job.completedAt.getTime() - job.startedAt.getTime()
      }
    }

    if (job.status === JOB_STATUS.FAILED) {
      response.error = job.error
      response.metadata.completedAt = job.completedAt
      if (job.startedAt && job.completedAt) {
        response.metadata.duration = job.completedAt.getTime() - job.startedAt.getTime()
      }
    }

    if (job.status === JOB_STATUS.PROCESSING || job.status === JOB_STATUS.PENDING) {
      response.estimatedDuration = 300000
    }

    if (correlation.available && correlation.executionId) {
      const [executionLog] = await db
        .select({
          executionId: workflowExecutionLogs.executionId,
          status: workflowExecutionLogs.status,
          level: workflowExecutionLogs.level,
          startedAt: workflowExecutionLogs.startedAt,
          endedAt: workflowExecutionLogs.endedAt,
          executionData: workflowExecutionLogs.executionData,
        })
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.executionId, correlation.executionId))
        .limit(1)

      if (executionLog) {
        const diagnostics = buildExecutionDiagnostics({
          status: executionLog.status,
          level: executionLog.level,
          startedAt: executionLog.startedAt.toISOString(),
          endedAt: executionLog.endedAt?.toISOString(),
          executionData: executionLog.executionData as Record<string, unknown>,
        })

        response.executionDiagnostics = {
          executionId: executionLog.executionId,
          status: diagnostics.status,
          ...(diagnostics.finalizationPath
            ? { finalizationPath: diagnostics.finalizationPath }
            : {}),
          lastStartedBlock: diagnostics.lastStartedBlock,
          lastCompletedBlock: diagnostics.lastCompletedBlock,
          hasTraceSpans: diagnostics.hasTraceSpans,
          traceSpanCount: diagnostics.traceSpanCount,
        }
      }
    }

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching task status:`, error)

    if (error.message?.includes('not found') || error.status === 404) {
      return createErrorResponse('Task not found', 404)
    }

    return createErrorResponse('Failed to fetch task status', 500)
  }
}
