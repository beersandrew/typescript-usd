// Ported from OpenUSD 26.11.1: pxr/base/tf/scopeDescription.cpp,
//  pxr/base/tf/scopeDescription.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfScopeDescription, ported from OpenUSD v26.08 pxr/base/tf/scopeDescription.h:24-135
// and scopeDescription.cpp:35-428. Each logical lane (logicalLane.ts) owns a
// description stack, as each thread does upstream; the main lane is
// ArchGetMainThreadId()'s. JavaScript has no destructors, so a description
// ends with Dispose() (also [Symbol.dispose] for `using`).

import type { TfCallContext } from './diagnostic.ts'
import { TfDiagnosticType, TfError } from './diagnostic.ts'
import { Tf_GetCurrentLane, Tf_GetMainLane, Tf_LaneLocal, type Tf_LogicalLane } from './logicalLane.ts'

// scopeDescription.cpp:165-177
interface _Stack {
  head: TfScopeDescription | undefined
}

// scopeDescription.cpp:69-163: the registry of live stacks, one per lane.
const _registry: Array<{ lane: Tf_LogicalLane, stack: _Stack }> = []

// scopeDescription.cpp:183-197 (_LocalStack): created on first use in a lane,
// registered, and removed from the registry when the lane exits.
const _localStack = new Tf_LaneLocal<_Stack>((lane) => {
  const stack: _Stack = { head: undefined }
  const entry = { lane, stack }
  _registry.push(entry)
  lane.onExit(() => {
    const i = _registry.indexOf(entry)
    if (i >= 0) _registry.splice(i, 1)
  })
  return stack
})

export class TfScopeDescription {
  #description: string
  readonly #context: TfCallContext
  readonly #localStack: _Stack
  readonly #prev: TfScopeDescription | undefined
  #popped = false

  // scopeDescription.cpp:336-360
  constructor(description: string, context: TfCallContext = {}) {
    this.#description = description
    this.#context = context
    // scopeDescription.cpp:314-324 (_Push)
    const stack = _localStack.Get()
    this.#prev = stack.head
    this.#localStack = stack
    stack.head = this
  }

  get description(): string { return this.#description }

  // scopeDescription.cpp:367-396
  setDescription(description: string): void { this.#description = description }

  // scopeDescription.cpp:326-334 (_Pop), run by the destructor (:361-365).
  dispose(): void {
    if (this.#popped) return
    if (this.#localStack.head !== this) {
      throw new TfError('Failed axiom: \' stack.head == this \'', TfDiagnosticType.FatalError)
    }
    this.#popped = true
    this.#localStack.head = this.#prev
  }

  [Symbol.dispose](): void { this.dispose() }

  /** @internal Tf_GetPreviousScopeDescription (scopeDescription.h:95-98). */
  _getPrevious(): TfScopeDescription | undefined { return this.#prev }
  /** @internal Tf_GetScopeDescriptionContext (scopeDescription.h:103-106). */
  _getContext(): TfCallContext { return this.#context }
}

// scopeDescription.cpp:398-416: most recent last.
function _GetScopeDescriptionStack(lane: Tf_LogicalLane): string[] {
  const result: string[] = []
  const entry = _registry.find(e => e.lane === lane)
  for (let cur = entry?.stack.head; cur; cur = cur._getPrevious()) result.push(cur.description)
  return result.reverse()
}

/** scopeDescription.cpp:418-422: the main thread's stack. */
export function TfGetCurrentScopeDescriptionStack(): string[] {
  return _GetScopeDescriptionStack(Tf_GetMainLane())
}

/** scopeDescription.cpp:424-428: the calling lane's stack. */
export function TfGetThisThreadScopeDescriptionStack(): string[] {
  return _GetScopeDescriptionStack(Tf_GetCurrentLane())
}

/** Former spelling of TfGetCurrentScopeDescriptionStack. */
export const GetCurrentScopeDescriptionStack = TfGetCurrentScopeDescriptionStack
