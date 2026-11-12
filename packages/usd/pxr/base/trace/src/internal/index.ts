export {
  _createLogicalTraceContext,
  _traceCounter,
  _traceMarker,
  _traceScopeData,
  _withTraceScope,
  _withTraceScopeSync,
} from './logicalContext.ts'
export type { LogicalTraceContext } from './logicalContext.ts'
export { _markReachable, _setReachabilitySink } from './reachability.ts'
