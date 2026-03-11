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
    ...(completionFailure ? { completionFailure } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  }
}
