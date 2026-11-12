// Ported from OpenUSD 26.11.1: pxr/base/tf/stacked.cpp, pxr/base/tf/stacked.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfStacked, ported from OpenUSD v26.08 pxr/base/tf/stacked.h:23-233.
// A subclass keeps a stack of its live instances: pushed by the constructor,
// popped by Dispose() (also [Symbol.dispose] for `using`), since JavaScript
// has no destructors. Each subclass owns its storage; with PerThread (the
// default, stacked.h:105-106) each logical lane (logicalLane.ts) gets its own
// stack, as each thread does upstream. TF_DEFINE_STACKED(Derived, false, ...)
// is a subclass that sets `static readonly PerThread = false`.

import { TfDiagnosticType, TfError } from './diagnostic.ts'
import { Tf_LaneLocal } from './logicalLane.ts'

/** The class side of a TfStacked subclass. */
export type TfStackedClass<T extends TfStacked> = (abstract new (...args: never[]) => T) & {
  readonly PerThread: boolean
  _initializeStack(): void
}

// stacked.h:46-61 (_StackHolder): InitializeStack runs once per stack instance.
class _StackHolder {
  readonly #stack: TfStacked[] = []
  #initialized = false
  constructor(readonly derived: TfStackedClass<TfStacked>) {}
  Get(): TfStacked[] {
    if (!this.#initialized) {
      this.#initialized = true
      TfStackedAccess.initializeStack(this.derived)
    }
    return this.#stack
  }
}

// stacked.h:63-82: per-thread or global storage, chosen by PerThread.
interface _StorageType { Get(): TfStacked[] }

// stacked.h:93-97 and :195-208: storage made on first use, one per class.
const _storage = new WeakMap<object, _StorageType>()

function _GetStack(derived: TfStackedClass<TfStacked>): TfStacked[] {
  let storage = _storage.get(derived)
  if (!storage) {
    if (derived.PerThread) {
      const local = new Tf_LaneLocal(() => new _StackHolder(derived))
      storage = { Get: () => local.Get().Get() }
    } else {
      const holder = new _StackHolder(derived)
      storage = { Get: () => holder.Get() }
    }
    _storage.set(derived, storage)
  }
  return storage.Get()
}

// stacked.h:23-35
export class TfStackedAccess {
  static initializeStack<T extends TfStacked>(derived: TfStackedClass<T>): void {
    derived._initializeStack()
  }
}

// stacked.h:100-217
export abstract class TfStacked {
  static readonly PerThread: boolean = true

  readonly #derived: TfStackedClass<TfStacked>
  #popped = false

  // stacked.h:128-131: pushes this object onto its class's stack.
  constructor() {
    this.#derived = new.target as unknown as TfStackedClass<TfStacked>
    _GetStack(this.#derived).push(this)
  }

  // stacked.h:133-136 and :182-193: pops this object; out of order is fatal.
  dispose(): void {
    if (this.#popped) return
    const stack = _GetStack(this.#derived)
    if (stack.at(-1) !== this) {
      throw new TfError(`Destroyed ${this.#derived.name} out of stack order.`, TfDiagnosticType.FatalError)
    }
    this.#popped = true
    stack.pop()
  }

  [Symbol.dispose](): void { this.dispose() }

  // stacked.h:137-146
  static getStackTop<T extends TfStacked>(this: TfStackedClass<T>): T | undefined {
    return (_GetStack(this) as T[]).at(-1)
  }

  // stacked.h:148-157
  static getStackPrevious<T extends TfStacked>(this: TfStackedClass<T>): T | undefined {
    const stack = _GetStack(this) as T[]
    return stack.length <= 1 ? undefined : stack[stack.length - 2]
  }

  // stacked.h:159-162
  static getStack<T extends TfStacked>(this: TfStackedClass<T>): readonly T[] {
    return _GetStack(this) as T[]
  }

  // stacked.h:164-167
  static isStackTop<T extends TfStacked>(this: TfStackedClass<T>, p: T): boolean {
    return (_GetStack(this) as T[]).at(-1) === p
  }

  // stacked.h:171-175: subclasses may hide this to pre-populate each stack.
  static _initializeStack(): void {}
}
