import type {
  ExecutionFinalizationPath,
  NormalizedExecutionStatus,
  RawExecutionStatus,
} from '@/lib/logs/types'

export interface ExecutionStatusContract {
  /** Normalized read-surface truth for API consumers. */
  status: NormalizedExecutionStatus
  /** Raw persisted truth from workflow_execution_logs.status. */
  rawStatus: RawExecutionStatus
}

export function getExecutionStatusContract(params: {
  rawStatus: RawExecutionStatus
  finalizationPath?: ExecutionFinalizationPath
}): ExecutionStatusContract {
  return {
    status: params.finalizationPath === 'paused' ? 'paused' : params.rawStatus,
    rawStatus: params.rawStatus,
  }
}
