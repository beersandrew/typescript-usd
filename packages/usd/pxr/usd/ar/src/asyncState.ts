import type { ArResolver } from './resolver.ts'
import type { ArResolverContext } from './resolverContext.ts'

interface ContextBinding {
  readonly resolver: ArResolver
  readonly context: ArResolverContext
}

interface CacheBinding {
  readonly resolver: ArResolver
  readonly data: unknown
}

interface ArAsyncState {
  readonly contexts: readonly ContextBinding[]
  readonly caches: readonly CacheBinding[]
}

interface AsyncStateStorage {
  getStore(): ArAsyncState | undefined
  run<T>(state: ArAsyncState, fn: () => T): T
}

interface AsyncContextVariable {
  get(): ArAsyncState | undefined
  run<T>(state: ArAsyncState, fn: () => T): T
}

const emptyState: ArAsyncState = { contexts: [], caches: [] }
const synchronousStates: ArAsyncState[] = []
let storage: AsyncStateStorage | undefined

// AsyncContext is the browser/runtime async-lane primitive. Node's
// AsyncLocalStorage supplies the same private carrier without entering the
// browser bundle; unsupported hosts fail async binding instead of sharing a
// process-global stack.
const asyncContext = (globalThis as unknown as {
  AsyncContext?: {
    Variable?: new (options?: { name?: string }) => AsyncContextVariable
  }
}).AsyncContext

if (asyncContext?.Variable) {
  const variable = new asyncContext.Variable({ name: 'Ar resolver state' })
  storage = {
    getStore: () => variable.get(),
    run: (state, fn) => variable.run(state, fn),
  }
} else if (typeof process !== 'undefined' && process.versions?.node) {
  const specifier = ['node', 'async_hooks'].join(':')
  const hooks = await import(/* @vite-ignore */ specifier) as unknown as {
    AsyncLocalStorage: new <T>() => {
      getStore(): T | undefined
      run<R>(state: T, fn: () => R): R
    }
  }
  const local = new hooks.AsyncLocalStorage<ArAsyncState>()
  storage = local
}

function currentState(): ArAsyncState {
  return storage?.getStore() ?? synchronousStates.at(-1) ?? emptyState
}

function runWithState<T>(state: ArAsyncState, fn: () => T): T {
  if (storage) return storage.run(state, fn)
  synchronousStates.push(state)
  try {
    const result = fn()
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(result).catch(() => undefined)
      throw new Error('Asynchronous Ar scopes require host AsyncContext support')
    }
    return result
  } finally {
    synchronousStates.pop()
  }
}

export function _getResolverContext(resolver: ArResolver): ArResolverContext | undefined {
  const contexts = currentState().contexts
  for (let i = contexts.length - 1; i >= 0; i--) {
    if (contexts[i]!.resolver === resolver) return contexts[i]!.context
  }
  return undefined
}

export function _withResolverContext<T>(
  resolver: ArResolver,
  context: ArResolverContext,
  fn: () => T,
): T {
  const current = currentState()
  return runWithState({
    contexts: [...current.contexts, { resolver, context }],
    caches: current.caches,
  }, fn)
}

export function _getResolverCacheData(resolver: ArResolver): unknown {
  const caches = currentState().caches
  for (let i = caches.length - 1; i >= 0; i--) {
    if (caches[i]!.resolver === resolver) return caches[i]!.data
  }
  return undefined
}

export function _withResolverCache<T>(
  resolver: ArResolver,
  data: unknown,
  fn: () => T,
): T {
  const current = currentState()
  return runWithState({
    contexts: current.contexts,
    caches: [...current.caches, { resolver, data }],
  }, fn)
}
