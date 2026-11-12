// Browser-compatible logical execution contexts for future instrumentation.
// This is intentionally absent from the package barrel and available only at
// typescript-usd/trace/_internal: OpenUSD has no caller-managed logical-lane API.

import { Collector } from '../collector.ts'

export interface LogicalTraceContext {
  readonly laneId: string
  readonly spanId?: number | undefined
}

let nextLaneId = 1

export function _createLogicalTraceContext(laneId = `lane-${nextLaneId++}`): LogicalTraceContext {
  return { laneId }
}

export async function _withTraceScope<T>(
  context: LogicalTraceContext,
  key: string,
  fn: (context: LogicalTraceContext) => T | PromiseLike<T>,
  collector = Collector.GetInstance(),
): Promise<T> {
  if (!collector.enabled) return await fn(context)

  const span = collector._beginTimespan(key, context.laneId, context.spanId)
  const childContext: LogicalTraceContext = { laneId: context.laneId, spanId: span.eventId }
  try {
    return await fn(childContext)
  } finally {
    collector._endTimespan(span)
  }
}

export function _withTraceScopeSync<T>(
  context: LogicalTraceContext,
  key: string,
  fn: (context: LogicalTraceContext) => T,
  collector = Collector.GetInstance(),
): T {
  if (!collector.enabled) return fn(context)

  const span = collector._beginTimespan(key, context.laneId, context.spanId)
  const childContext: LogicalTraceContext = { laneId: context.laneId, spanId: span.eventId }
  try {
    return fn(childContext)
  } finally {
    collector._endTimespan(span)
  }
}

export function _traceMarker(context: LogicalTraceContext, key: string): number {
  return Collector.GetInstance()._markerEvent(key, context.laneId)
}

export function _traceCounter(
  context: LogicalTraceContext,
  key: string,
  value: number,
  isDelta: boolean,
): void {
  Collector.GetInstance()._recordCounter(key, value, isDelta, context.laneId)
}

export function _traceScopeData(context: LogicalTraceContext, key: string, data: string | boolean | number | bigint): void {
  if (context.spanId === undefined) return
  Collector.GetInstance()._storeData({ laneId: context.laneId, eventId: context.spanId }, key, data)
}
