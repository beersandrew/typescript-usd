import {
  _traceScopeData,
  _withTraceScope,
  _withTraceScopeSync,
  type LogicalTraceContext,
} from 'typescript-usd/trace/_internal'
import type { PcpTraceContextHolder } from './traceTypes.ts'

export async function _withPcpTraceScope<T>(
  holder: PcpTraceContextHolder,
  name: string,
  fn: (context: LogicalTraceContext | undefined) => T | PromiseLike<T>,
  parentContext = holder.current,
): Promise<T> {
  if (!parentContext) return await fn(undefined)
  return _withTraceScope(parentContext, name, fn)
}

export function _withPcpTraceScopeSync<T>(
  holder: PcpTraceContextHolder,
  name: string,
  fn: (context: LogicalTraceContext | undefined) => T,
  parentContext = holder.current,
): T {
  if (!parentContext) return fn(undefined)
  return _withTraceScopeSync(parentContext, name, fn)
}

export function _storePcpTraceData(
  context: LogicalTraceContext | undefined,
  key: string,
  value: string | boolean | number | bigint,
): void {
  if (context) _traceScopeData(context, key, value)
}
