import type { ExecutionLastCompletedBlock, ExecutionLastStartedBlock } from '@/lib/logs/types'
import { isExecutionFinalizationPath } from '@/lib/logs/types'

type ExecutionData = {
  error?: string
  traceSpans?: unknown[]
  executionState?: unknown
  finalOutput?: { error?: unknown }
  lastStartedBlock?: ExecutionLastStartedBlock
  lastCompletedBlock?: ExecutionLastCompletedBlock
  hasTraceSpans?: boolean
  traceSpanCount?: number
  completionFailure?: string
  finalizationPath?: unknown
  staleCleanup?: unknown
}

function toCompactStaleCleanup(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const staleCleanup = {
    ...(typeof record.bucket === 'string' ? { bucket: record.bucket } : {}),
    ...(typeof record.cleanedAt === 'string' ? { cleanedAt: record.cleanedAt } : {}),
    ...(typeof record.staleThresholdMinutes === 'number'
      ? { staleThresholdMinutes: record.staleThresholdMinutes }
      : {}),
    ...(typeof record.staleDurationMinutes === 'number'
      ? { staleDurationMinutes: record.staleDurationMinutes }
      : {}),
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
  }

  return Object.keys(staleCleanup).length > 0 ? staleCleanup : undefined
}

function countTraceSpans(traceSpans: unknown[] | undefined): number {
  if (!Array.isArray(traceSpans) || traceSpans.length === 0) {
    return 0
  }

  return traceSpans.reduce<number>((count, span) => {
    const children =
      span && typeof span === 'object' && 'children' in span && Array.isArray(span.children)
        ? (span.children as unknown[])
        : undefined

    return count + 1 + countTraceSpans(children)
  }, 0)
}

export function buildExecutionDiagnostics(params: {
  status: string
  level?: string | null
  startedAt: string
  endedAt?: string | null
  executionData?: ExecutionData | null
}) {
  const executionData = params.executionData ?? {}
  const derivedTraceSpanCount = countTraceSpans(executionData.traceSpans)
  const traceSpanCount =
    typeof executionData.traceSpanCount === 'number'
      ? executionData.traceSpanCount
      : derivedTraceSpanCount
  const hasTraceSpans =
    typeof executionData.hasTraceSpans === 'boolean'
      ? executionData.hasTraceSpans
      : traceSpanCount > 0
  const completionFailure =
    typeof executionData.completionFailure === 'string'
      ? executionData.completionFailure
      : undefined
  const errorMessage =
    completionFailure ||
    (typeof executionData.error === 'string' ? executionData.error : undefined) ||
    (typeof executionData.finalOutput?.error === 'string'
      ? executionData.finalOutput.error
      : undefined)
  const finalizationPath = isExecutionFinalizationPath(executionData.finalizationPath)
    ? executionData.finalizationPath
    : undefined
  const staleCleanup = toCompactStaleCleanup(executionData.staleCleanup)

  return {
    status: params.status,
    level: params.level ?? undefined,
    startedAt: params.startedAt,
    endedAt: params.endedAt ?? undefined,
    lastStartedBlock: executionData.lastStartedBlock,
    lastCompletedBlock: executionData.lastCompletedBlock,
    hasTraceSpans,
    traceSpanCount,
    hasExecutionState: executionData.executionState !== undefined,
    ...(finalizationPath ? { finalizationPath } : {}),
    ...(staleCleanup ? { staleCleanup } : {}),
    ...(completionFailure ? { completionFailure } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  }
}
