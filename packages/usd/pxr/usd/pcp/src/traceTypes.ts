import type { LogicalTraceContext } from 'typescript-usd/trace/_internal'

/** @internal Mutable per-operation context shared by a retained cache/indexer. */
export interface PcpTraceContextHolder {
  current: LogicalTraceContext | undefined
  base?: LogicalTraceContext
  installations?: Array<{
    token: object
    context: LogicalTraceContext | undefined
  }>
}
