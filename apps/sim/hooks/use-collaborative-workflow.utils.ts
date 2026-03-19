import type { Position } from '@/stores/workflows/workflow/types'

export function resolveRemoteParentUpdatePosition(
  payloadPosition: Position | undefined,
  currentPosition: Position
): Position {
  return payloadPosition ?? currentPosition
}
