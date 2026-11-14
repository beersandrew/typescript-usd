// Ported from OpenUSD 26.11.1: pxr/usd/usd/instanceCache.cpp,
//  pxr/usd/usd/instanceCache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdInstanceCache mirrors OpenUSD pxr/usd/usd/instanceCache.{h,cpp}: instance
// prim indexes are registered/unregistered into pending queues, then an
// explicit processChanges pass updates retained prototype correspondence.

import type { LogicalTraceContext } from 'typescript-usd/trace/_internal'
import { _traceScopeData } from 'typescript-usd/trace/_internal'
import { _withOptionalTraceScopeSync, type UsdTraceContext } from './traceContext.ts'

interface InstanceTraceContextHolder {
  current: LogicalTraceContext | undefined
  base?: LogicalTraceContext
  installations: Array<{ token: object; context: LogicalTraceContext | undefined }>
}

const traceContexts = new WeakMap<UsdInstanceCache, InstanceTraceContextHolder>()

const getTraceContext = (cache: UsdInstanceCache): LogicalTraceContext | undefined =>
  traceContexts.get(cache)?.current

const PROTOTYPE_ROOT_RE = /^\/__Prototype_\d+$/

export function isPrototypePath(path: string): boolean {
  return PROTOTYPE_ROOT_RE.test(path)
}

export function isPathInPrototype(path: string): boolean {
  return /^\/__Prototype_\d+([/.]|$)/.test(path)
}

export interface InstancingInfo {
  instanceToProto: Map<string, string>
  protoToSource: Map<string, string>
}

export const NO_INSTANCING: InstancingInfo = {
  instanceToProto: new Map(),
  protoToSource: new Map(),
}

export interface UsdInstanceChanges {
  readonly newPrototypePrims: string[]
  readonly newPrototypePrimIndexes: string[]
  readonly changedPrototypePrims: string[]
  readonly changedPrototypePrimIndexes: string[]
  readonly deadPrototypePrims: string[]
}

const atOrBelow = (path: string, root: string): boolean =>
  path === root || root === '/' || path.startsWith(`${root}/`)

const parentPath = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

const replacePrefix = (path: string, prefix: string, replacement: string): string =>
  path === prefix || path.startsWith(`${prefix}/`)
    ? replacement + path.slice(prefix.length)
    : path

/** @internal Upstream-corresponding Usd_InstanceCache. */
export class UsdInstanceCache {
  private readonly instanceKeyToPrototype = new Map<string, string>()
  private readonly prototypeToInstanceKey = new Map<string, string>()
  private readonly prototypeToSource = new Map<string, string>()
  private readonly prototypeToPrimIndexes = new Map<string, string[]>()
  private readonly primIndexToPrototype = new Map<string, string>()
  private readonly pendingAddedPrimIndexes = new Map<string, Set<string>>()
  private readonly pendingRemovedPrimIndexes = new Map<string, Set<string>>()
  private lastPrototypeIndex = 0

  registerInstancePrimIndex(path: string, key: string): boolean {
    let pending = this.pendingAddedPrimIndexes.get(key)
    if (!pending) { pending = new Set(); this.pendingAddedPrimIndexes.set(key, pending) }
    pending.add(path)
    const prototype = this.instanceKeyToPrototype.get(key)
    if (prototype === undefined) return pending.size === 1
    return this.prototypeToSource.get(prototype) === path
  }

  unregisterInstancePrimIndexesUnder(root: string): void {
    for (const [path, prototype] of this.primIndexToPrototype) {
      if (!atOrBelow(path, root)) continue
      const key = this.prototypeToInstanceKey.get(prototype)
      if (key === undefined) continue
      let pending = this.pendingRemovedPrimIndexes.get(key)
      if (!pending) { pending = new Set(); this.pendingRemovedPrimIndexes.set(key, pending) }
      pending.add(path)
    }
  }

  processChanges(): UsdInstanceChanges {
    return _withOptionalTraceScopeSync(
      getTraceContext(this),
      'typescript-usd:UsdInstanceCache.processChanges',
      (scopeContext) => {
        if (scopeContext) {
          _traceScopeData(scopeContext, 'pendingAddedKeys', this.pendingAddedPrimIndexes.size)
          _traceScopeData(scopeContext, 'pendingRemovedKeys', this.pendingRemovedPrimIndexes.size)
        }
        return this._processChanges()
      },
    )
  }

  private _processChanges(): UsdInstanceChanges {
    const changes: UsdInstanceChanges = {
      newPrototypePrims: [], newPrototypePrimIndexes: [],
      changedPrototypePrims: [], changedPrototypePrimIndexes: [],
      deadPrototypePrims: [],
    }
    const changed = new Set<string>()

    for (const [key, removals] of this.pendingRemovedPrimIndexes) {
      const additions = this.pendingAddedPrimIndexes.get(key) ?? new Set<string>()
      const actual = [...removals].filter(path => !additions.has(path))
      const prototype = this.instanceKeyToPrototype.get(key)
      if (prototype === undefined) continue
      const instances = this.prototypeToPrimIndexes.get(prototype) ?? []
      const oldSource = this.prototypeToSource.get(prototype)
      for (const path of actual) {
        const at = instances.indexOf(path)
        if (at >= 0) instances.splice(at, 1)
        this.primIndexToPrototype.delete(path)
        this._ancestorMemo.clear()
      }
      if (oldSource !== undefined && actual.includes(oldSource)) {
        this.prototypeToSource.delete(prototype)
        if (instances.length > 0) {
          instances.sort()
          this.prototypeToSource.set(prototype, instances[0]!)
          changed.add(prototype)
        }
      }
      this.prototypeToPrimIndexes.set(prototype, instances)
    }

    const additionsByFirstPath = [...this.pendingAddedPrimIndexes.entries()]
      .sort((a, b) => {
        const left = [...a[1]][0] ?? ''
        const right = [...b[1]][0] ?? ''
        const depth = right.split('/').length - left.split('/').length
        return depth || left.localeCompare(right)
      })
    for (const [key, additions] of additionsByFirstPath) {
      // registerInstancePrimIndex reports the first inserted path as the
      // prototype source so namespace discovery composes that subtree. Keep
      // the same source here; sorting before selection can choose an
      // uncomposed equivalent nested instance (OpenUSD v26.05
      // pxr/usd/usd/instanceCache.cpp:187-239).
      const sourcePath = [...additions][0]!
      const paths = [...additions].sort()
      let prototype = this.instanceKeyToPrototype.get(key)
      if (prototype === undefined) {
        prototype = `/__Prototype_${++this.lastPrototypeIndex}`
        this.instanceKeyToPrototype.set(key, prototype)
        this.prototypeToInstanceKey.set(prototype, key)
        this.prototypeToSource.set(prototype, sourcePath)
        this.prototypeToPrimIndexes.set(prototype, [])
        changes.newPrototypePrims.push(prototype)
        changes.newPrototypePrimIndexes.push(sourcePath)
      } else if (!this.prototypeToSource.has(prototype)) {
        this.prototypeToSource.set(prototype, sourcePath)
        changed.add(prototype)
      }
      const instances = this.prototypeToPrimIndexes.get(prototype) ?? []
      for (const path of paths) {
        this.primIndexToPrototype.set(path, prototype)
        this._ancestorMemo.clear()
        if (!instances.includes(path)) instances.push(path)
      }
      instances.sort()
      this.prototypeToPrimIndexes.set(prototype, instances)
    }

    for (const prototype of changed) {
      const source = this.prototypeToSource.get(prototype)
      if (source === undefined) continue
      changes.changedPrototypePrims.push(prototype)
      changes.changedPrototypePrimIndexes.push(source)
    }

    for (const key of this.pendingRemovedPrimIndexes.keys()) {
      const prototype = this.instanceKeyToPrototype.get(key)
      if (prototype === undefined) continue
      if ((this.prototypeToPrimIndexes.get(prototype) ?? []).length > 0) continue
      changes.deadPrototypePrims.push(prototype)
      this.instanceKeyToPrototype.delete(key)
      this.prototypeToInstanceKey.delete(prototype)
      this.prototypeToSource.delete(prototype)
      this.prototypeToPrimIndexes.delete(prototype)
    }

    this.pendingAddedPrimIndexes.clear()
    this.pendingRemovedPrimIndexes.clear()
    return changes
  }

  getInstancingInfo(): InstancingInfo {
    return {
      instanceToProto: new Map(this.primIndexToPrototype),
      protoToSource: new Map(this.prototypeToSource),
    }
  }

  getPrototypeForInstanceablePrimIndexPath(path: string): string | undefined {
    return this.primIndexToPrototype.get(path)
  }

  // Usd_InstanceCache::_PrototypeUsesPrimIndexPath
  // (instanceCache.cpp:559-637). The source-index check is what makes this
  // correct for nested instances: only the selected source index contributes
  // the corresponding descendant to a prototype.
  getPrimsInPrototypesUsingPrimIndexPath(primIndexPath: string): string[] {
    const prototypePaths: string[] = []
    let current = primIndexPath
    while (current !== '/') {
      const entry = this._findInstanceAtOrAbove(current)
      if (!entry) break
      const [instancePath, prototypePath] = entry
      const sourcePath = this.prototypeToSource.get(prototypePath)
      if (sourcePath === undefined) break
      if (current === sourcePath || current.startsWith(`${sourcePath}/`)) {
        prototypePaths.push(replacePrefix(primIndexPath, sourcePath, prototypePath))
      }
      if (instancePath !== current) break
      current = parentPath(instancePath)
    }
    return [...new Set(prototypePaths)]
  }

  // Usd_InstanceCache::PrototypeUsesPrimIndexPath (instanceCache.cpp:551-557).
  prototypeUsesPrimIndexPath(primIndexPath: string): boolean {
    return this.getPrimsInPrototypesUsingPrimIndexPath(primIndexPath).length > 0
  }

  // Usd_InstanceCache::GetPrototypesUsingPrimIndexPathOrDescendents
  // (instanceCache.cpp:639-660): [prototype, source index] pairs for the
  // prototypes whose source prim index is at or below `primIndexPath`.
  getPrototypesUsingPrimIndexPathOrDescendents(primIndexPath: string): [string, string][] {
    const result: [string, string][] = []
    for (const [prototype, source] of this.prototypeToSource) {
      if (primIndexPath === '/' || source === primIndexPath ||
          source.startsWith(`${primIndexPath}/`)) result.push([prototype, source])
    }
    return result
  }

  // Usd_InstanceCache::GetAllPrototypes.
  getAllPrototypes(): string[] { return [...this.prototypeToSource.keys()] }

  // Usd_InstanceCache::GetInstancePrimIndexesForPrototype.
  getInstancePrimIndexesForPrototype(prototypePath: string): string[] {
    return [...(this.prototypeToPrimIndexes.get(prototypePath) ?? [])]
  }

  // The source prim index path of a prototype.
  getSourcePrimIndexPathForPrototype(prototypePath: string): string | undefined {
    return this.prototypeToSource.get(prototypePath)
  }

  // Usd_InstanceCache::IsPathDescendantToAnInstance
  // (instanceCache.cpp:640-647): the instance path itself is deliberately
  // excluded because prototype roots carry no properties or metadata.
  /** Whether any prim index is an instance; when not, no path is a
   * descendant of one. */
  hasInstancePrimIndexes(): boolean { return this.primIndexToPrototype.size > 0 }

  isPathDescendantToAnInstance(path: string): boolean {
    if (this.primIndexToPrototype.size === 0) return false
    return this._findStrictInstanceAncestor(path) !== undefined
  }

  // Usd_InstanceCache::GetPathInPrototypeForInstancePath
  // (instanceCache.cpp:678-785), including the source-index rebasing loop for
  // descendants of nested instances whose prim indexes were never computed.
  getPathInPrototypeForInstancePath(path: string): string | undefined {
    let primIndexPath: string | undefined = path
    if (isPathInPrototype(path)) {
      let prototype: string | undefined
      for (const candidate of selfAndAncestors(path)) {
        if (this.prototypeToSource.has(candidate)) { prototype = candidate; break }
      }
      if (prototype === undefined) return undefined
      primIndexPath = replacePrefix(path, prototype, this.prototypeToSource.get(prototype)!)
    }
    let current = primIndexPath
    while (current !== undefined) {
      const entry = this._findStrictInstanceAncestor(current)
      if (!entry) break
      const [instancePath, prototypePath] = entry
      const sourcePath = this.prototypeToSource.get(prototypePath)
      if (sourcePath === undefined) break
      if (instancePath === sourcePath) {
        return replacePrefix(current, instancePath, prototypePath)
      }
      current = replacePrefix(current, instancePath, sourcePath)
    }
    return undefined
  }

  getMostAncestralInstancePath(path: string): string | undefined {
    let found: string | undefined
    for (const ancestor of strictAncestors(path)) {
      if (this.primIndexToPrototype.has(ancestor)) found = ancestor
    }
    return found
  }

  // The nearest instance at or above `path`, found by walking its ancestors
  // (O(depth)) as upstream's SdfPathTable lookups do, rather than scanning
  // every instance.
  private _findInstanceAtOrAbove(path: string): [string, string] | undefined {
    for (const candidate of selfAndAncestors(path)) {
      const prototype = this.primIndexToPrototype.get(candidate)
      if (prototype !== undefined) return [candidate, prototype]
    }
    return undefined
  }

  private _findStrictInstanceAncestor(path: string): [string, string] | undefined {
    // strictAncestors, unrolled: this runs for every stage lookup of a path
    // that has no prim (stage.getPrim's instance proxy fallback), many of
    // them the same paths again (Hydra's scene indices look up the paths
    // they make up). The answers are kept until the instances change
    // (_ancestorMemo is cleared with every primIndexToPrototype edit).
    if (this.primIndexToPrototype.size === 0) return undefined
    const memo = this._ancestorMemo.get(path)
    if (memo !== undefined) return memo ?? undefined
    let found: [string, string] | null = null
    for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) {
      const candidate = path.slice(0, i)
      const prototype = this.primIndexToPrototype.get(candidate)
      if (prototype !== undefined) { found = [candidate, prototype]; break }
    }
    if (this._ancestorMemo.size > 200000) this._ancestorMemo.clear()
    this._ancestorMemo.set(path, found)
    return found ?? undefined
  }
  private readonly _ancestorMemo = new Map<string, [string, string] | null>()
}

// The '/'-separated prefixes of `path`, nearest first, excluding the path
// itself and the absolute root.
function* strictAncestors(path: string): Generator<string> {
  for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) {
    yield path.slice(0, i)
  }
}

function* selfAndAncestors(path: string): Generator<string> {
  yield path
  yield* strictAncestors(path)
}

/** @internal Stage-population trace propagation; not exported from the Usd barrel. */
export function _setUsdInstanceCacheTraceContext(
  cache: UsdInstanceCache,
  context: UsdTraceContext,
): void {
  const holder = traceContexts.get(cache)
  if (holder) holder.current = context
  else traceContexts.set(cache, { current: context, installations: [] })
}

function installTraceContext(
  cache: UsdInstanceCache,
  context: UsdTraceContext,
): { holder: InstanceTraceContextHolder; token: object } {
  let holder = traceContexts.get(cache)
  if (!holder) {
    holder = { current: undefined, installations: [] }
    traceContexts.set(cache, holder)
  }
  const token = {}
  if (holder.installations.length === 0) {
    if (holder.current) holder.base = holder.current
    else delete holder.base
  }
  holder.installations.push({ token, context })
  holder.current = context
  return { holder, token }
}

function removeTraceContext(holder: InstanceTraceContextHolder, token: object): void {
  const index = holder.installations.findIndex(entry => entry.token === token)
  if (index >= 0) holder.installations.splice(index, 1)
  holder.current = holder.installations.at(-1)?.context ?? holder.base
  if (holder.installations.length === 0) delete holder.base
}

/** @internal Installs a retained-cache context for one synchronous operation. */
export function _withUsdInstanceCacheTraceContext<T>(
  cache: UsdInstanceCache,
  context: UsdTraceContext,
  fn: () => T,
): T {
  const { holder, token } = installTraceContext(cache, context)
  try {
    return fn()
  } finally {
    removeTraceContext(holder, token)
  }
}

/** @internal Async operation-scoped variant for Stage change processing. */
export async function _withUsdInstanceCacheTraceContextAsync<T>(
  cache: UsdInstanceCache,
  context: UsdTraceContext,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const { holder, token } = installTraceContext(cache, context)
  try {
    return await fn()
  } finally {
    removeTraceContext(holder, token)
  }
}
