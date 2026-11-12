import { Collector } from 'typescript-usd/trace'
import {
  _createLogicalTraceContext,
  _withTraceScope,
  _withTraceScopeSync,
  type LogicalTraceContext,
} from 'typescript-usd/trace/_internal'

export type SdfTraceContext = LogicalTraceContext | undefined

export async function _withSdfTrace<T>(
  context: SdfTraceContext,
  name: string,
  fn: (context: SdfTraceContext) => T | PromiseLike<T>,
): Promise<T> {
  if (context) return _withTraceScope(context, name, fn)
  if (!Collector.isEnabled()) return await fn(undefined)
  return _withTraceScope(_createLogicalTraceContext(), name, fn)
}

export function _withSdfTraceSync<T>(
  context: SdfTraceContext,
  name: string,
  fn: (context: SdfTraceContext) => T,
): T {
  if (context) return _withTraceScopeSync(context, name, fn)
  if (!Collector.isEnabled()) return fn(undefined)
  return _withTraceScopeSync(_createLogicalTraceContext(), name, fn)
}
