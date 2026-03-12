import { db } from '@sim/db'
import { workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { getJobQueue, JOB_STATUS, resolveAsyncJobCorrelation } from '@/lib/core/async-jobs'
import { generateRequestId } from '@/lib/core/utils/request'
import { buildExecutionDiagnostics } from '@/lib/logs/execution/diagnostics'
import { getExecutionStatusContract } from '@/lib/logs/execution/status-contract'
import type { RawExecutionStatus } from '@/lib/logs/types'
import { createErrorResponse } from '@/app/api/workflows/utils'

const logger = createLogger('TaskStatusAPI')

const PAUSED_STATUS = 'paused'
const ACTIVE_TASK_STATUSES = new Set(['queued', 'processing'])
const TERMINAL_EXECUTION_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const ERROR_TASK_STATUSES = new Set(['failed', 'cancelled'])

function normalizeTaskStatus(mappedStatus: string, executionStatus?: string): string {
  if (executionStatus === PAUSED_STATUS) {
    return PAUSED_STATUS
  }

  if (!executionStatus || !TERMINAL_EXECUTION_STATUSES.has(executionStatus)) {
    return mappedStatus
  }

  return mappedStatus === executionStatus ? mappedStatus : executionStatus
}

function buildJobMetadata(job: {
  createdAt: Date
  startedAt?: Date
  attempts: number
  maxAttempts: number
  metadata?: Record<string, unknown>
}) {
  return {
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    ...(job.metadata?.staleCleanup ? { staleCleanup: job.metadata.staleCleanup } : {}),
  }
}

function getCompletedOutput(args: {
  jobOutput?: unknown
  executionFinalOutput?: unknown
  preferExecutionOutput?: boolean
}) {
  const { jobOutput, executionFinalOutput, preferExecutionOutput } = args

  if (preferExecutionOutput && executionFinalOutput !== undefined) {
    return executionFinalOutput
  }

  return jobOutput
}

function applyTerminalStateToResponse(args: {
  response: Record<string, unknown>
  status: string
  job: {
    output?: unknown
    error?: string
  }
  startedAt?: Date
  completedAt?: Date
  diagnostics?: {
    errorMessage?: string
    staleCleanup?: unknown
    finalOutput?: unknown
  }
}) {
  const { response, status, job, startedAt, completedAt, diagnostics } = args
  const metadata = response.metadata as Record<string, unknown>

  if (TERMINAL_EXECUTION_STATUSES.has(status)) {
    response.estimatedDuration = undefined
    metadata.completedAt = completedAt

    if (startedAt && completedAt) {
      metadata.duration = completedAt.getTime() - startedAt.getTime()
    } else {
      metadata.duration = undefined
    }
  }

  if (status === JOB_STATUS.COMPLETED) {
    response.output = getCompletedOutput({
      jobOutput: job.output,
      executionFinalOutput: diagnostics?.finalOutput,
      preferExecutionOutput: diagnostics?.finalOutput !== undefined,
    })
    response.error = undefined
    return
  }

  response.output = undefined

  if (ERROR_TASK_STATUSES.has(status)) {
    response.error = diagnostics?.errorMessage ?? job.error
    return
  }

  response.error = undefined
}

function stripNonApplicableResponseFields(response: Record<string, unknown>, status: string) {
  if (!ACTIVE_TASK_STATUSES.has(status)) {
    response.estimatedDuration = undefined
  }

  if (status === PAUSED_STATUS) {
    const metadata = response.metadata as Record<string, unknown>
    metadata.completedAt = undefined
    metadata.duration = undefined
  }
}

function buildInitialObservabilityFields() {
  return {
    executionLogAvailable: false,
    statusSource: 'job' as const,
  }
}

function getStatusSource(mappedStatus: string, finalStatus: string) {
  return mappedStatus === finalStatus ? 'job' : 'execution-log'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized task status request`)
      return createErrorResponse(authResult.error || 'Authentication required', 401)
    }

    const authenticatedUserId = authResult.userId

    const jobQueue = await getJobQueue()
    const job = await jobQueue.getJob(jobId)

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
      logger.warn(`[${requestId}] Access denied to job ${jobId}`)
      return createErrorResponse('Access denied', 403)
    }

    const mappedStatus = job.status === JOB_STATUS.PENDING ? 'queued' : job.status
    const correlation = resolveAsyncJobCorrelation(job)

    const response: Record<string, unknown> = {
      success: true,
      jobId,
      taskId: jobId,
      status: mappedStatus,
      metadata: buildJobMetadata(job),
      correlation,
      ...buildInitialObservabilityFields(),
    }

    if (job.status === JOB_STATUS.PROCESSING || job.status === JOB_STATUS.PENDING) {
      response.estimatedDuration = 300000
    }

    applyTerminalStateToResponse({
      response,
      status: mappedStatus,
      job,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    })

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
        response.executionLogAvailable = true
        const diagnostics = buildExecutionDiagnostics({
          status: executionLog.status,
          level: executionLog.level,
          startedAt: executionLog.startedAt.toISOString(),
          endedAt: executionLog.endedAt?.toISOString(),
          executionData: executionLog.executionData as Record<string, unknown>,
        })
        const executionStatusContract = getExecutionStatusContract({
          rawStatus: diagnostics.status as RawExecutionStatus,
          finalizationPath: diagnostics.finalizationPath,
        })

        response.executionDiagnostics = {
          executionId: executionLog.executionId,
          ...executionStatusContract,
          ...(diagnostics.finalizationPath
            ? { finalizationPath: diagnostics.finalizationPath }
            : {}),
          ...(diagnostics.staleCleanup ? { staleCleanup: diagnostics.staleCleanup } : {}),
          ...(diagnostics.errorMessage ? { errorMessage: diagnostics.errorMessage } : {}),
          ...(diagnostics.completionFailure
            ? { completionFailure: diagnostics.completionFailure }
            : {}),
          lastStartedBlock: diagnostics.lastStartedBlock,
          lastCompletedBlock: diagnostics.lastCompletedBlock,
          hasTraceSpans: diagnostics.hasTraceSpans,
          traceSpanCount: diagnostics.traceSpanCount,
        }
        const finalStatus = normalizeTaskStatus(mappedStatus, executionStatusContract.status)
        response.status = finalStatus
        response.statusSource = getStatusSource(mappedStatus, finalStatus)
        applyTerminalStateToResponse({
          response,
          status: finalStatus,
          job,
          startedAt: executionLog.startedAt,
          completedAt: executionLog.endedAt ?? undefined,
          diagnostics: {
            errorMessage: diagnostics.errorMessage,
            staleCleanup: diagnostics.staleCleanup,
            finalOutput: (executionLog.executionData as Record<string, unknown> | null | undefined)
              ?.finalOutput,
          },
        })
        stripNonApplicableResponseFields(response, finalStatus)
      }
    }

    const finalStatus = response.status as string

    stripNonApplicableResponseFields(response, finalStatus)

    const responseWithoutEstimatedDuration = !ACTIVE_TASK_STATUSES.has(finalStatus)
      ? (({ estimatedDuration, ...rest }: typeof response) => rest)(response)
      : response

    const finalResponse = ERROR_TASK_STATUSES.has(finalStatus)
      ? (({ output, ...rest }: typeof responseWithoutEstimatedDuration) => rest)(
          responseWithoutEstimatedDuration
        )
      : responseWithoutEstimatedDuration

    return NextResponse.json(finalResponse)
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching task status:`, error)

    if (error.message?.includes('not found') || error.status === 404) {
      return createErrorResponse('Task not found', 404)
    }

    return createErrorResponse('Failed to fetch task status', 500)
  }
}
