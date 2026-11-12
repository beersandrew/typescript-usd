// Ported from OpenUSD 26.11.1: pxr/base/arch/threads.h,
//  pxr/base/tf/scopeDescription.cpp, pxr/base/tf/stacked.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Logical lanes: the JavaScript stand-in for the threads behind upstream's
// thread_local storage (OpenUSD v26.08 pxr/base/tf/scopeDescription.cpp:183-197)
// and tbb::enumerable_thread_specific (pxr/base/tf/stacked.h:63-68), with the
// main lane playing ArchGetMainThreadId() (pxr/base/arch/threads.h:34).
//
// A lane is carried across awaits by the host's AsyncContext.Variable, or by
// Node's AsyncLocalStorage, which supplies the same carrier without entering
// the browser bundle. A host with neither still gets lanes for synchronous
// work; an asynchronous lane body there is refused rather than silently
// sharing the main lane's stacks.
//
// Not in the package barrel: upstream has no caller-managed thread API in tf.

interface LaneCarrier {
  get(): Tf_LogicalLane | undefined
  run<R>(lane: Tf_LogicalLane, fn: () => R): R
}

export class Tf_LogicalLane {
  readonly id: number
  readonly #locals = new Map<object, unknown>()
  readonly #exitCallbacks: Array<() => void> = []
  #exited = false

  /** @internal */
  constructor(id: number) { this.id = id }

  isMain(): boolean { return this === mainLane }
  hasExited(): boolean { return this.#exited }

  /** Runs `callback` when the lane's body completes, as thread_local destructors run at thread exit. */
  onExit(callback: () => void): void {
    if (this.#exited) callback()
    else this.#exitCallbacks.push(callback)
  }

  /** @internal */
  _getLocal<T>(key: object, create: () => T): T {
    if (this.#locals.has(key)) return this.#locals.get(key) as T
    const value = create()
    this.#locals.set(key, value)
    return value
  }

  /** @internal */
  _exit(): void {
    if (this.#exited) return
    this.#exited = true
    for (const callback of this.#exitCallbacks.splice(0).reverse()) callback()
  }
}

const mainLane = new Tf_LogicalLane(0)
let nextLaneId = 1
const synchronousLanes: Tf_LogicalLane[] = []
let carrier: LaneCarrier | undefined

const asyncContext = (globalThis as unknown as {
  AsyncContext?: {
    Variable?: new (options?: { name?: string }) => {
      get(): Tf_LogicalLane | undefined
      run<R>(value: Tf_LogicalLane, fn: () => R): R
    }
  }
}).AsyncContext

if (asyncContext?.Variable) {
  const variable = new asyncContext.Variable({ name: 'Tf logical lane' })
  carrier = { get: () => variable.get(), run: (lane, fn) => variable.run(lane, fn) }
} else if (typeof process !== 'undefined' && process.versions?.node) {
  const specifier = ['node', 'async_hooks'].join(':')
  const hooks = await import(/* @vite-ignore */ specifier) as unknown as {
    AsyncLocalStorage: new <T>() => {
      getStore(): T | undefined
      run<R>(store: T, fn: () => R): R
    }
  }
  const local = new hooks.AsyncLocalStorage<Tf_LogicalLane>()
  carrier = { get: () => local.getStore(), run: (lane, fn) => local.run(lane, fn) }
}

/** The lane standing in for ArchGetMainThreadId(). */
export function Tf_GetMainLane(): Tf_LogicalLane { return mainLane }

/** The lane standing in for std::this_thread::get_id(). */
export function Tf_GetCurrentLane(): Tf_LogicalLane {
  return carrier?.get() ?? synchronousLanes.at(-1) ?? mainLane
}

/** True when lanes follow asynchronous continuations on this host. */
export function Tf_LogicalLanesFollowAsync(): boolean { return carrier !== undefined }

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
}

/**
 * Runs `fn` on a fresh lane, as a new std::thread runs its body: lane-local
 * storage starts empty and is released (OnExit) when the body returns or its
 * promise settles.
 */
export function Tf_RunInNewLane<R>(fn: (lane: Tf_LogicalLane) => R): R {
  const lane = new Tf_LogicalLane(nextLaneId++)
  if (carrier) {
    let result: R
    try {
      result = carrier.run(lane, () => fn(lane))
    } catch (error) {
      lane._exit()
      throw error
    }
    if (isPromiseLike(result)) {
      return Promise.resolve(result).finally(() => lane._exit()) as unknown as R
    }
    lane._exit()
    return result
  }
  synchronousLanes.push(lane)
  let result: R
  try {
    result = fn(lane)
  } finally {
    synchronousLanes.pop()
    lane._exit()
  }
  if (isPromiseLike(result)) {
    void Promise.resolve(result).catch(() => undefined)
    throw new Error('Asynchronous Tf lanes require host AsyncContext support')
  }
  return result
}

/** Per-lane storage: thread_local / enumerable_thread_specific for one value. */
export class Tf_LaneLocal<T> {
  readonly #create: (lane: Tf_LogicalLane) => T
  constructor(create: (lane: Tf_LogicalLane) => T) { this.#create = create }
  Get(lane: Tf_LogicalLane = Tf_GetCurrentLane()): T {
    return lane._getLocal(this, () => this.#create(lane))
  }
}
