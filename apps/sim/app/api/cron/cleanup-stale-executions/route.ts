import { asyncJobs, db } from '@sim/db'
import { pausedExecutions, resumeQueue, workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import type { AsyncJobCorrelationEvidence } from '@/lib/core/async-jobs'
import {
  getAsyncBackendType,
  JOB_RETENTION_HOURS,
  JOB_STATUS,
  resolveAsyncJobCorrelation,
} from '@/lib/core/async-jobs'
import { getMaxExecutionTimeout } from '@/lib/core/execution-limits'
import { buildExecutionDiagnostics } from '@/lib/logs/execution/diagnostics'

const logger = createLogger('CleanupStaleExecutions')

const STALE_THRESHOLD_MS = getMaxExecutionTimeout() + 5 * 60 * 1000
const STALE_THRESHOLD_MINUTES = Math.ceil(STALE_THRESHOLD_MS / 60000)
const MAX_INT32 = 2_147_483_647

type JsonRecord = Record<string, unknown>

type ExecutionCleanupBucket =
  | 'partially-finalized-execution'
  | 'resume-in-flight'
  | 'paused-awaiting-resume'
  | 'abandoned-running-execution'

type AsyncJobCleanupBucket =
  | 'paused-handoff-processing-job'
  | 'orphaned-processing-job'
  | 'pending-never-started-job'

type AsyncJobCleanupSupport = {
  backendType: 'trigger-dev' | 'redis' | 'database'
  staleAsyncJobCleanup: 'supported' | 'db-only'
  supported: boolean
  reason?: string
}

type StaleExecutionRow = {
  id: string
  executionId: string
  workflowId: string | null
  startedAt: Date
  endedAt: Date | null
  executionData: unknown
}

type PausedExecutionRow = {
  id: string
  executionId: string
  status: string
  resumedCount: number
  totalPauseCount: number
  pausePoints: unknown
}

type ResumeQueueRow = {
  id: string
  parentExecutionId: string
  status: string
  contextId: string
}

type AsyncJobRow = {
  id: string
  status: string
  type: string
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  attempts: number
  error: string | null
  metadata: unknown
  payload: unknown
  output: unknown
}

type CorrelatedExecutionRow = StaleExecutionRow & {
  status: string
}

function createExecutionBucketCounts(): Record<ExecutionCleanupBucket, number> {
  return {
    'partially-finalized-execution': 0,
    'resume-in-flight': 0,
    'paused-awaiting-resume': 0,
    'abandoned-running-execution': 0,
  }
}

function createAsyncJobBucketCounts(): Record<AsyncJobCleanupBucket, number> {
  return {
    'paused-handoff-processing-job': 0,
    'orphaned-processing-job': 0,
    'pending-never-started-job': 0,
  }
}

function getAsyncJobCleanupSupport(): AsyncJobCleanupSupport {
  const backendType = getAsyncBackendType()

  if (backendType === 'database') {
    return {
      backendType,
      staleAsyncJobCleanup: 'supported',
      supported: true,
    }
  }

  return {
    backendType,
    staleAsyncJobCleanup: 'db-only',
    supported: false,
    reason: 'stale async job cleanup only mutates async_jobs for the database backend',
  }
}

function createAsyncJobCleanupSummary(args: {
  support: AsyncJobCleanupSupport
  classified?: number
  mutated?: number
  failed?: number
  skipped?: number
  noOp?: number
  buckets?: Record<AsyncJobCleanupBucket, number>
  oldDeleted?: number
}) {
  return {
    support: args.support,
    classified: args.classified ?? 0,
    mutated: args.mutated ?? 0,
    mutatedToFailed: args.mutated ?? 0,
    failed: args.failed ?? 0,
    cleanupErrors: args.failed ?? 0,
    skipped: args.skipped ?? 0,
    noOp: args.noOp ?? 0,
    buckets: args.buckets ?? createAsyncJobBucketCounts(),
    oldDeleted: args.oldDeleted ?? 0,
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
    retentionHours: JOB_RETENTION_HOURS,
  }
}

function toJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function hasOwn(obj: JsonRecord, key: string): boolean {
  return Object.hasOwn(obj, key)
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function hasPartialFinalizationEvidence(execution: StaleExecutionRow): boolean {
  const executionData = toJsonRecord(execution.executionData)
  const hasTraceSpans =
    Array.isArray(executionData.traceSpans) && executionData.traceSpans.length > 0
  const hasFinalOutput = hasOwn(executionData, 'finalOutput')
  const hasError = hasNonEmptyString(executionData.error)

  return Boolean(execution.endedAt || hasTraceSpans || hasFinalOutput || hasError)
}

function hasResumeInFlightEvidence(
  resumeEntries: ResumeQueueRow[],
  pausedExecution?: PausedExecutionRow
): boolean {
  if (resumeEntries.some((entry) => entry.status === 'pending' || entry.status === 'claimed')) {
    return true
  }

  if (!pausedExecution) {
    return false
  }

  const pausePoints = toJsonRecord(pausedExecution.pausePoints)
  return Object.values(pausePoints).some((value) => {
    const pausePoint = toJsonRecord(value)
    return pausePoint.resumeStatus === 'queued' || pausePoint.resumeStatus === 'resuming'
  })
}

function hasPausedAwaitingResumeEvidence(pausedExecution?: PausedExecutionRow): boolean {
  if (!pausedExecution) {
    return false
  }

  return (
    pausedExecution.resumedCount < pausedExecution.totalPauseCount ||
    pausedExecution.status !== 'fully_resumed'
  )
}

function classifyExecution(args: {
  execution: StaleExecutionRow
  pausedExecution?: PausedExecutionRow
  resumeEntries: ResumeQueueRow[]
}): ExecutionCleanupBucket {
  const { execution, pausedExecution, resumeEntries } = args

  if (hasPartialFinalizationEvidence(execution)) {
    return 'partially-finalized-execution'
  }

  if (hasResumeInFlightEvidence(resumeEntries, pausedExecution)) {
    return 'resume-in-flight'
  }

  if (hasPausedAwaitingResumeEvidence(pausedExecution)) {
    return 'paused-awaiting-resume'
  }

  return 'abandoned-running-execution'
}

function getAsyncJobCorrelationEvidence(job: AsyncJobRow): AsyncJobCorrelationEvidence {
  return resolveAsyncJobCorrelation(job)
}

function buildExecutionCleanupMessage(
  bucket: ExecutionCleanupBucket,
  staleDurationMinutes: number
): string {
  if (bucket === 'abandoned-running-execution') {
    return `Execution terminated: abandoned running execution after ${staleDurationMinutes} minutes`
  }

  return `Execution classified as ${bucket}`
}

function hasPausedPartialFinalizationEvidence(execution: StaleExecutionRow): boolean {
  const diagnostics = buildExecutionDiagnostics({
    status: 'running',
    startedAt: execution.startedAt.toISOString(),
    endedAt: execution.endedAt?.toISOString(),
    executionData: toJsonRecord(execution.executionData),
  })

  return diagnostics.finalizationPath === 'paused'
}

function normalizePartialFinalizationStatus(
  execution: StaleExecutionRow
): 'completed' | 'cancelled' | 'failed' {
  const diagnostics = buildExecutionDiagnostics({
    status: 'running',
    startedAt: execution.startedAt.toISOString(),
    endedAt: execution.endedAt?.toISOString(),
    executionData: toJsonRecord(execution.executionData),
  })

  if (
    diagnostics.finalizationPath === 'completed' ||
    diagnostics.finalizationPath === 'fallback_completed'
  ) {
    return 'completed'
  }

  if (diagnostics.finalizationPath === 'cancelled') {
    return 'cancelled'
  }

  if (diagnostics.finalizationPath === 'paused') {
    return 'completed'
  }

  return 'failed'
}

function getExecutionCleanupLevel(normalizedStatus: 'completed' | 'cancelled' | 'failed') {
  return normalizedStatus === 'failed' ? 'error' : 'info'
}

function buildAsyncJobCleanupMessage(bucket: AsyncJobCleanupBucket): string {
  switch (bucket) {
    case 'paused-handoff-processing-job':
      return 'Job terminated: stale paused handoff remained in processing while parent execution awaited resume'
    case 'pending-never-started-job':
      return 'Job terminated: stale pending job never started before cleanup threshold'
    default:
      return 'Job terminated: stale processing job had no correlated live execution evidence'
  }
}

function buildAsyncJobError(existingError: string | null, message: string) {
  return hasNonEmptyString(existingError) ? existingError : message
}

function buildExecutionCleanupData(args: {
  executionData: unknown
  bucket: ExecutionCleanupBucket
  message: string
  cleanedAt: Date
  staleDurationMinutes: number
  normalizedStatus: 'completed' | 'cancelled' | 'failed'
}) {
  const { executionData, bucket, message, cleanedAt, staleDurationMinutes, normalizedStatus } = args
  const nextExecutionData = { ...toJsonRecord(executionData) }

  if (normalizedStatus === 'failed' && !hasNonEmptyString(nextExecutionData.error)) {
    nextExecutionData.error = message
  }

  nextExecutionData.staleCleanup = {
    bucket,
    cleanedAt: cleanedAt.toISOString(),
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
    staleDurationMinutes,
    message,
  }

  return nextExecutionData
}

function buildAsyncJobMetadata(args: {
  metadata: unknown
  bucket: AsyncJobCleanupBucket
  cleanedAt: Date
  correlation: AsyncJobCorrelationEvidence
}) {
  const { metadata, bucket, cleanedAt, correlation } = args
  const nextMetadata = { ...toJsonRecord(metadata) }

  nextMetadata.staleCleanup = {
    bucket,
    cleanedAt: cleanedAt.toISOString(),
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
    correlationSource: correlation.source,
    correlationFields: correlation.fields,
    executionId: correlation.executionId ?? null,
  }

  return nextMetadata
}

function buildExecutionCleanupWhere(args: { execution: StaleExecutionRow; staleThreshold: Date }) {
  const { execution, staleThreshold } = args

  return and(
    eq(workflowExecutionLogs.id, execution.id),
    eq(workflowExecutionLogs.status, 'running'),
    lt(workflowExecutionLogs.startedAt, staleThreshold),
    execution.endedAt === null
      ? isNull(workflowExecutionLogs.endedAt)
      : eq(workflowExecutionLogs.endedAt, execution.endedAt)
  )
}

function getObservedExecutionEndTime(execution: StaleExecutionRow, fallback: Date) {
  return execution.endedAt ?? fallback
}

function buildAsyncJobCleanupWhere(args: { job: AsyncJobRow; staleThreshold: Date }) {
  const { job, staleThreshold } = args

  return and(
    eq(asyncJobs.id, job.id),
    eq(asyncJobs.status, job.status),
    job.completedAt === null
      ? isNull(asyncJobs.completedAt)
      : eq(asyncJobs.completedAt, job.completedAt),
    job.status === JOB_STATUS.PROCESSING
      ? lt(asyncJobs.startedAt, staleThreshold)
      : and(isNull(asyncJobs.startedAt), lt(asyncJobs.createdAt, staleThreshold))
  )
}

function hasLiveCorrelatedExecution(args: {
  execution?: CorrelatedExecutionRow
  pausedExecution?: PausedExecutionRow
  resumeEntries: ResumeQueueRow[]
}): boolean {
  const { execution, pausedExecution, resumeEntries } = args

  if (!execution) {
    return false
  }

  if (hasResumeInFlightEvidence(resumeEntries, pausedExecution)) {
    return true
  }

  if (hasPausedAwaitingResumeEvidence(pausedExecution)) {
    return true
  }

  return (
    (execution.status === 'running' || execution.status === 'pending') &&
    execution.endedAt === null &&
    !hasPartialFinalizationEvidence(execution)
  )
}

function hasPositiveAbandonmentEvidence(args: {
  execution?: CorrelatedExecutionRow
  pausedExecution?: PausedExecutionRow
  resumeEntries: ResumeQueueRow[]
}): boolean {
  const { execution, pausedExecution, resumeEntries } = args

  if (!execution) {
    return false
  }

  if (hasLiveCorrelatedExecution({ execution, pausedExecution, resumeEntries })) {
    return false
  }

  return (
    execution.status === 'failed' ||
    execution.status === 'completed' ||
    execution.status === 'cancelled' ||
    execution.endedAt !== null ||
    hasPartialFinalizationEvidence(execution)
  )
}

function hasPausedParentTruth(args: {
  execution?: CorrelatedExecutionRow
  pausedExecution?: PausedExecutionRow
}): boolean {
  const { execution, pausedExecution } = args

  if (!execution) {
    return false
  }

  if (execution.status === 'paused') {
    return true
  }

  if (!pausedExecution || !hasPartialFinalizationEvidence(execution)) {
    return false
  }

  return (
    hasPausedPartialFinalizationEvidence(execution) &&
    hasPausedAwaitingResumeEvidence(pausedExecution)
  )
}

function classifyAsyncJob(args: {
  job: AsyncJobRow
  correlation: AsyncJobCorrelationEvidence
  correlatedExecution?: CorrelatedExecutionRow
  correlatedPausedExecution?: PausedExecutionRow
  correlatedResumeEntries: ResumeQueueRow[]
}): AsyncJobCleanupBucket | 'skip' {
  const {
    job,
    correlation,
    correlatedExecution,
    correlatedPausedExecution,
    correlatedResumeEntries,
  } = args

  if (job.status === JOB_STATUS.PENDING && job.startedAt === null) {
    return 'pending-never-started-job'
  }

  if (job.status !== JOB_STATUS.PROCESSING) {
    return 'skip'
  }

  if (!correlation.executionId || !correlatedExecution) {
    return 'skip'
  }

  const correlatedBucket = classifyExecution({
    execution: correlatedExecution,
    pausedExecution: correlatedPausedExecution,
    resumeEntries: correlatedResumeEntries,
  })

  if (correlatedBucket === 'resume-in-flight') {
    return 'skip'
  }

  if (
    hasPausedParentTruth({
      execution: correlatedExecution,
      pausedExecution: correlatedPausedExecution,
    })
  ) {
    return 'paused-handoff-processing-job'
  }

  if (correlatedBucket === 'paused-awaiting-resume') {
    return 'paused-handoff-processing-job'
  }

  return hasPositiveAbandonmentEvidence({
    execution: correlatedExecution,
    pausedExecution: correlatedPausedExecution,
    resumeEntries: correlatedResumeEntries,
  })
    ? 'orphaned-processing-job'
    : 'skip'
}

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request, 'Stale execution cleanup')
    if (authError) {
      return authError
    }

    logger.info('Starting stale execution cleanup job')

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000)

    const staleExecutions = await db
      .select({
        id: workflowExecutionLogs.id,
        executionId: workflowExecutionLogs.executionId,
        workflowId: workflowExecutionLogs.workflowId,
        startedAt: workflowExecutionLogs.startedAt,
        endedAt: workflowExecutionLogs.endedAt,
        executionData: workflowExecutionLogs.executionData,
      })
      .from(workflowExecutionLogs)
      .where(
        and(
          eq(workflowExecutionLogs.status, 'running'),
          lt(workflowExecutionLogs.startedAt, staleThreshold)
        )
      )
      .limit(100)

    logger.info(`Found ${staleExecutions.length} stale executions to clean up`)

    const staleExecutionIds = staleExecutions.map((execution) => execution.executionId)
    const [pausedExecutionRows, resumeQueueRows] = staleExecutionIds.length
      ? await Promise.all([
          db
            .select({
              id: pausedExecutions.id,
              executionId: pausedExecutions.executionId,
              status: pausedExecutions.status,
              resumedCount: pausedExecutions.resumedCount,
              totalPauseCount: pausedExecutions.totalPauseCount,
              pausePoints: pausedExecutions.pausePoints,
            })
            .from(pausedExecutions)
            .where(inArray(pausedExecutions.executionId, staleExecutionIds)),
          db
            .select({
              id: resumeQueue.id,
              parentExecutionId: resumeQueue.parentExecutionId,
              status: resumeQueue.status,
              contextId: resumeQueue.contextId,
            })
            .from(resumeQueue)
            .where(inArray(resumeQueue.parentExecutionId, staleExecutionIds)),
        ])
      : [[], []]

    const pausedExecutionById = new Map(
      pausedExecutionRows.map((row) => [row.executionId, row as PausedExecutionRow])
    )
    const resumeQueueByExecutionId = new Map<string, ResumeQueueRow[]>()
    for (const row of resumeQueueRows) {
      const existing = resumeQueueByExecutionId.get(row.parentExecutionId)
      if (existing) {
        existing.push(row as ResumeQueueRow)
      } else {
        resumeQueueByExecutionId.set(row.parentExecutionId, [row as ResumeQueueRow])
      }
    }

    let cleaned = 0
    let failed = 0
    let executionsClassified = 0
    let executionsSkipped = 0
    let executionsNoOp = 0
    const executionBuckets = createExecutionBucketCounts()

    for (const execution of staleExecutions) {
      try {
        const staleDurationMs = Date.now() - new Date(execution.startedAt).getTime()
        const staleDurationMinutes = Math.round(staleDurationMs / 60000)
        const bucket = classifyExecution({
          execution: execution as StaleExecutionRow,
          pausedExecution: pausedExecutionById.get(execution.executionId),
          resumeEntries: resumeQueueByExecutionId.get(execution.executionId) ?? [],
        })

        executionsClassified += 1
        executionBuckets[bucket] += 1

        if (bucket === 'resume-in-flight' || bucket === 'paused-awaiting-resume') {
          executionsSkipped += 1
          logger.info(`Skipped stale execution ${execution.executionId}`, {
            workflowId: execution.workflowId,
            classification: bucket,
            staleDurationMinutes,
          })
          continue
        }

        const now = new Date()
        const observedEndTime = getObservedExecutionEndTime(execution as StaleExecutionRow, now)
        const cleanupMessage = buildExecutionCleanupMessage(bucket, staleDurationMinutes)
        const normalizedStatus =
          bucket === 'partially-finalized-execution'
            ? normalizePartialFinalizationStatus(execution as StaleExecutionRow)
            : 'failed'
        const normalizedTotalDurationMs = Math.min(
          observedEndTime.getTime() - new Date(execution.startedAt).getTime(),
          MAX_INT32
        )

        const updatedExecutions = await db
          .update(workflowExecutionLogs)
          .set({
            level: getExecutionCleanupLevel(normalizedStatus),
            status: normalizedStatus,
            endedAt: observedEndTime,
            totalDurationMs: normalizedTotalDurationMs,
            executionData: buildExecutionCleanupData({
              executionData: execution.executionData,
              bucket,
              message: cleanupMessage,
              cleanedAt: now,
              staleDurationMinutes,
              normalizedStatus,
            }),
          })
          .where(
            buildExecutionCleanupWhere({
              execution: execution as StaleExecutionRow,
              staleThreshold,
            })
          )
          .returning({ id: workflowExecutionLogs.id })

        if (updatedExecutions.length === 0) {
          executionsNoOp += 1
          logger.info(
            `Skipped stale execution ${execution.executionId} because row was unchanged`,
            {
              workflowId: execution.workflowId,
              classification: bucket,
              staleDurationMinutes,
            }
          )
          continue
        }

        logger.info(`Cleaned up stale execution ${execution.executionId}`, {
          workflowId: execution.workflowId,
          classification: bucket,
          staleDurationMinutes,
        })

        cleaned++
      } catch (error) {
        logger.error(`Failed to clean up execution ${execution.executionId}:`, {
          error: error instanceof Error ? error.message : String(error),
        })
        failed++
      }
    }

    logger.info(`Stale execution cleanup completed. Cleaned: ${cleaned}, Failed: ${failed}`)

    const asyncJobCleanupSupport = getAsyncJobCleanupSupport()

    if (!asyncJobCleanupSupport.supported) {
      return NextResponse.json({
        success: true,
        executions: {
          found: staleExecutions.length,
          classified: executionsClassified,
          mutated: cleaned,
          skipped: executionsSkipped,
          noOp: executionsNoOp,
          cleaned,
          failed,
          buckets: executionBuckets,
          thresholdMinutes: STALE_THRESHOLD_MINUTES,
        },
        asyncJobs: createAsyncJobCleanupSummary({
          support: asyncJobCleanupSupport,
          skipped: 0,
        }),
      })
    }

    const staleAsyncJobRows = await db
      .select({
        id: asyncJobs.id,
        status: asyncJobs.status,
        type: asyncJobs.type,
        createdAt: asyncJobs.createdAt,
        startedAt: asyncJobs.startedAt,
        completedAt: asyncJobs.completedAt,
        attempts: asyncJobs.attempts,
        error: asyncJobs.error,
        metadata: asyncJobs.metadata,
        payload: asyncJobs.payload,
        output: asyncJobs.output,
      })
      .from(asyncJobs)
      .where(
        and(
          inArray(asyncJobs.status, [JOB_STATUS.PROCESSING, JOB_STATUS.PENDING]),
          or(
            and(
              eq(asyncJobs.status, JOB_STATUS.PROCESSING),
              lt(asyncJobs.startedAt, staleThreshold)
            ),
            and(eq(asyncJobs.status, JOB_STATUS.PENDING), lt(asyncJobs.createdAt, staleThreshold))
          )
        )
      )

    const asyncJobBuckets = createAsyncJobBucketCounts()
    let asyncJobsMutatedToFailed = 0
    let asyncJobsCleanupErrors = 0
    let asyncJobsSkipped = 0
    let asyncJobsClassified = 0
    let asyncJobsNoOp = 0

    const correlatedExecutionIds = Array.from(
      new Set(
        staleAsyncJobRows
          .map((job) => getAsyncJobCorrelationEvidence(job as AsyncJobRow).executionId)
          .filter((executionId): executionId is string => typeof executionId === 'string')
      )
    )

    const [correlatedExecutions, correlatedPausedExecutions, correlatedResumeRows] =
      correlatedExecutionIds.length
        ? await Promise.all([
            db
              .select({
                id: workflowExecutionLogs.id,
                executionId: workflowExecutionLogs.executionId,
                workflowId: workflowExecutionLogs.workflowId,
                startedAt: workflowExecutionLogs.startedAt,
                endedAt: workflowExecutionLogs.endedAt,
                executionData: workflowExecutionLogs.executionData,
                status: workflowExecutionLogs.status,
              })
              .from(workflowExecutionLogs)
              .where(inArray(workflowExecutionLogs.executionId, correlatedExecutionIds)),
            db
              .select({
                id: pausedExecutions.id,
                executionId: pausedExecutions.executionId,
                status: pausedExecutions.status,
                resumedCount: pausedExecutions.resumedCount,
                totalPauseCount: pausedExecutions.totalPauseCount,
                pausePoints: pausedExecutions.pausePoints,
              })
              .from(pausedExecutions)
              .where(inArray(pausedExecutions.executionId, correlatedExecutionIds)),
            db
              .select({
                id: resumeQueue.id,
                parentExecutionId: resumeQueue.parentExecutionId,
                status: resumeQueue.status,
                contextId: resumeQueue.contextId,
              })
              .from(resumeQueue)
              .where(inArray(resumeQueue.parentExecutionId, correlatedExecutionIds)),
          ])
        : [[], [], []]

    const correlatedExecutionById = new Map(
      correlatedExecutions.map((row) => [row.executionId, row as CorrelatedExecutionRow])
    )
    const correlatedPausedById = new Map(
      correlatedPausedExecutions.map((row) => [row.executionId, row as PausedExecutionRow])
    )
    const correlatedResumeById = new Map<string, ResumeQueueRow[]>()
    for (const row of correlatedResumeRows) {
      const existing = correlatedResumeById.get(row.parentExecutionId)
      if (existing) {
        existing.push(row as ResumeQueueRow)
      } else {
        correlatedResumeById.set(row.parentExecutionId, [row as ResumeQueueRow])
      }
    }

    for (const job of staleAsyncJobRows) {
      try {
        const typedJob = job as AsyncJobRow
        const correlation = getAsyncJobCorrelationEvidence(typedJob)
        const bucket = classifyAsyncJob({
          job: typedJob,
          correlation,
          correlatedExecution: correlation.executionId
            ? correlatedExecutionById.get(correlation.executionId)
            : undefined,
          correlatedPausedExecution: correlation.executionId
            ? correlatedPausedById.get(correlation.executionId)
            : undefined,
          correlatedResumeEntries: correlation.executionId
            ? (correlatedResumeById.get(correlation.executionId) ?? [])
            : [],
        })

        if (bucket === 'skip') {
          asyncJobsSkipped += 1
          continue
        }

        asyncJobsClassified += 1
        asyncJobBuckets[bucket] += 1
        const now = new Date()
        const cleanupMessage = buildAsyncJobCleanupMessage(bucket)

        const updatedAsyncJobs = await db
          .update(asyncJobs)
          .set({
            status: JOB_STATUS.FAILED,
            completedAt: now,
            updatedAt: now,
            error: buildAsyncJobError(typedJob.error, cleanupMessage),
            metadata: buildAsyncJobMetadata({
              metadata: typedJob.metadata,
              bucket,
              cleanedAt: now,
              correlation,
            }),
          })
          .where(buildAsyncJobCleanupWhere({ job: typedJob, staleThreshold }))
          .returning({ id: asyncJobs.id })

        if (updatedAsyncJobs.length === 0) {
          asyncJobsNoOp += 1
          continue
        }

        asyncJobsMutatedToFailed += 1
      } catch (error) {
        logger.error(`Failed to clean up async job ${job.id}:`, {
          error: error instanceof Error ? error.message : String(error),
        })
        asyncJobsCleanupErrors += 1
      }
    }

    // Delete completed/failed jobs older than retention period
    const retentionThreshold = new Date(Date.now() - JOB_RETENTION_HOURS * 60 * 60 * 1000)
    let asyncJobsDeleted = 0

    try {
      const deletedJobs = await db
        .delete(asyncJobs)
        .where(
          and(
            inArray(asyncJobs.status, [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]),
            lt(asyncJobs.completedAt, retentionThreshold)
          )
        )
        .returning({ id: asyncJobs.id })

      asyncJobsDeleted = deletedJobs.length
      if (asyncJobsDeleted > 0) {
        logger.info(
          `Deleted ${asyncJobsDeleted} old async jobs (retention: ${JOB_RETENTION_HOURS}h)`
        )
      }
    } catch (error) {
      logger.error('Failed to delete old async jobs:', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return NextResponse.json({
      success: true,
      executions: {
        found: staleExecutions.length,
        classified: executionsClassified,
        mutated: cleaned,
        skipped: executionsSkipped,
        noOp: executionsNoOp,
        cleaned,
        failed,
        buckets: executionBuckets,
        thresholdMinutes: STALE_THRESHOLD_MINUTES,
      },
      asyncJobs: {
        ...createAsyncJobCleanupSummary({
          support: asyncJobCleanupSupport,
          classified: asyncJobsClassified,
          mutated: asyncJobsMutatedToFailed,
          failed: asyncJobsCleanupErrors,
          skipped: asyncJobsSkipped,
          noOp: asyncJobsNoOp,
          buckets: asyncJobBuckets,
          oldDeleted: asyncJobsDeleted,
        }),
      },
    })
  } catch (error) {
    logger.error('Error in stale execution cleanup job:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
