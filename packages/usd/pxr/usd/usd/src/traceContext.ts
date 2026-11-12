import { Collector } from 'typescript-usd/trace'
import {
  _createLogicalTraceContext,
  _traceScopeData,
  _withTraceScope,
  _withTraceScopeSync,
  type LogicalTraceContext,
} from 'typescript-usd/trace/_internal'

export type UsdTraceContext = LogicalTraceContext | undefined

export async function _withStageOpenTrace<T>(
  filePath: string,
  fn: (context: UsdTraceContext) => Promise<T>,
): Promise<T> {
  if (!Collector.isEnabled()) return fn(undefined)
  const root = _createLogicalTraceContext()
  return _withTraceScope(root, 'typescript-usd:Stage.open', context => {
    _traceScopeData(context, 'filePath', filePath)
    return fn(context)
  })
}

export async function _withOptionalTraceScope<T>(
  context: UsdTraceContext,
  name: string,
  fn: (context: UsdTraceContext) => T | PromiseLike<T>,
): Promise<T> {
  if (!context) return await fn(undefined)
  return _withTraceScope(context, name, fn)
}

export function _withOptionalTraceScopeSync<T>(
  context: UsdTraceContext,
  name: string,
  fn: (context: UsdTraceContext) => T,
): T {
  if (!context) return fn(undefined)
  return _withTraceScopeSync(context, name, fn)
}

export function _withStageTraceSync<T>(
  name: string,
  fn: (context: UsdTraceContext) => T,
): T {
  if (!Collector.isEnabled()) return fn(undefined)
  return _withTraceScopeSync(_createLogicalTraceContext(), name, fn)
}

export async function _withStageTrace<T>(
  name: string,
  fn: (context: UsdTraceContext) => T | PromiseLike<T>,
): Promise<T> {
  if (!Collector.isEnabled()) return await fn(undefined)
  return _withTraceScope(_createLogicalTraceContext(), name, fn)
}
