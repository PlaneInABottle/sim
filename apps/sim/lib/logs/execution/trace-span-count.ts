export function countTraceSpans(traceSpans?: unknown[]): number {
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
