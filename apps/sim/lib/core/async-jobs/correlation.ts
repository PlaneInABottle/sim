import type { AsyncJobCorrelationEvidence, AsyncJobCorrelationTarget } from './types'

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getNonEmptyExecutionId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function resolveAsyncJobCorrelation(
  target: AsyncJobCorrelationTarget
): AsyncJobCorrelationEvidence {
  const metadata = toJsonRecord(target.metadata)
  const payload = toJsonRecord(target.payload)
  const output = toJsonRecord(target.output)
  const correlation = toJsonRecord(metadata.correlation)

  const correlatedExecutionId = getNonEmptyExecutionId(correlation.executionId)
  if (correlatedExecutionId) {
    return {
      available: true,
      executionId: correlatedExecutionId,
      source: 'metadata.correlation',
      fields: ['metadata.correlation.executionId'],
    }
  }

  const metadataExecutionId = getNonEmptyExecutionId(metadata.executionId)
  if (metadataExecutionId) {
    return {
      available: true,
      executionId: metadataExecutionId,
      source: 'metadata',
      fields: ['metadata.executionId'],
    }
  }

  const payloadExecutionId = getNonEmptyExecutionId(payload.executionId)
  if (payloadExecutionId) {
    return {
      available: true,
      executionId: payloadExecutionId,
      source: 'payload',
      fields: ['payload.executionId'],
    }
  }

  const outputExecutionId = getNonEmptyExecutionId(output.executionId)
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
