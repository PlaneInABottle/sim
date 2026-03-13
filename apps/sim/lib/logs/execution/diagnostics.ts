import { countTraceSpans } from '@/lib/logs/execution/trace-span-count'
import type { ExecutionFinalizationPath } from '@/lib/logs/types'
import { isExecutionFinalizationPath } from '@/lib/logs/types'

type ExecutionData = {
  error?: string
  traceSpans?: unknown[]
  executionState?: unknown
  finalOutput?: { error?: unknown }
  lastStartedBlock?: unknown
  lastCompletedBlock?: unknown
  hasTraceSpans?: boolean
  traceSpanCount?: number
  completionFailure?: string
  finalizationPath?: unknown
}

export function buildExecutionDiagnostics(params: {
  status: string
  level?: string | null
  startedAt: string
  endedAt?: string | null
  executionData?: ExecutionData | null
}): {
  status: string
  level?: string
  startedAt: string
  endedAt?: string
  lastStartedBlock?: unknown
  lastCompletedBlock?: unknown
  hasTraceSpans: boolean
  traceSpanCount: number
  hasExecutionState: boolean
  finalizationPath?: ExecutionFinalizationPath
  completionFailure?: string
  errorMessage?: string
} {
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
