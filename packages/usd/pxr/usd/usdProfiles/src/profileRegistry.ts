// Ported from OpenUSD 26.11.1: pxr/usd/usdProfiles/profileRegistry.cpp,
//  pxr/usd/usdProfiles/profileRegistry.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/usd/usdProfiles/profileRegistry.{h,cpp}.
//
// The capability DAG: nodes declared by plugins' Info.Profiles.Capabilities
// (plugInfo.json), edges to their predecessors, optionally deprecated.

import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { Type as TfType, TfDiagnosticTrap, RaiseWarning as TfRaiseWarning } from 'typescript-usd/tf'

/** UsdProfileRegistry::QueryStatus (profileRegistry.h:47-64). */
export const QueryStatus = Object.freeze({
  /** No path exists from the capability to the candidate. */
  NoPath: 'NoPath',
  /** A non-deprecated path exists. */
  ValidPath: 'ValidPath',
  /** All paths to the candidate pass through at least one deprecated edge. */
  Deprecated: 'Deprecated',
  /** Both deprecated and non-deprecated paths exist. */
  DeprecationConflict: 'DeprecationConflict',
  /** Reachable, but excluded by the caller through CoversCapabilities' excepted set. */
  Excepted: 'Excepted',
  /** A cycle was detected in the graph (malformed data). */
  CycleFound: 'CycleFound',
} as const)
export type QueryStatus = typeof QueryStatus[keyof typeof QueryStatus]

/** UsdProfileRegistry::CapabilityResult (profileRegistry.h:84-91). */
export interface CapabilityResult {
  readonly capability: string
  readonly status: QueryStatus
}

// TfToken's operator< orders by string; std::set<TfToken> and
// std::set<CapabilityResult> iterate in that order.
const compareTokens = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

function sortedResults(results: Map<string, QueryStatus>): CapabilityResult[] {
  return [...results].sort(([a], [b]) => compareTokens(a, b))
    .map(([capability, status]) => ({ capability, status }))
}

/** A capability node (profileRegistry.cpp:51-102). */
interface Capability {
  readonly id: string
  readonly name: string
  readonly docstring: string
  readonly isProfile: boolean
  readonly style: string
  readonly subgraph: string
}

interface Edge { readonly name: string, readonly deprecated: boolean }

// UsdProfileRegistry::_CapabilityGraph (profileRegistry.cpp:106-499).
class CapabilityGraph {
  // Each node and its incoming edges (its predecessors), in insertion order.
  readonly incomingEdgeMap = new Map<string, Edge[]>()
  readonly metadata = new Map<string, Capability>()

  clear(): void {
    this.incomingEdgeMap.clear()
    this.metadata.clear()
  }

  // profileRegistry.cpp:173-185.
  addCapability(capId: string, incomingEdges: Edge[], cap: Capability): boolean {
    if (this.incomingEdgeMap.has(capId)) {
      TfRaiseWarning(`Duplicate capability '${capId}' - ignoring`)
      return false
    }
    this.incomingEdgeMap.set(capId, incomingEdges)
    this.metadata.set(capId, cap)
    return true
  }

  // Kahn's algorithm (profileRegistry.cpp:190-258).
  validateAcyclic(errors?: string[]): boolean {
    const incomingDegree = new Map<string, number>()
    const dependents = new Map<string, string[]>()
    for (const [id, edges] of this.incomingEdgeMap) {
      incomingDegree.set(id, edges.length)
      for (const edge of edges) {
        const list = dependents.get(edge.name) ?? []
        list.push(id)
        dependents.set(edge.name, list)
        if (!incomingDegree.has(edge.name)) incomingDegree.set(edge.name, 0)
      }
    }
    const queue = [...incomingDegree].filter(([, degree]) => degree === 0).map(([id]) => id)
    let processedCount = 0
    while (queue.length > 0) {
      const current = queue.pop()!
      processedCount++
      for (const dep of dependents.get(current) ?? []) {
        const degree = incomingDegree.get(dep)! - 1
        incomingDegree.set(dep, degree)
        if (degree === 0) queue.push(dep)
      }
    }
    if (processedCount !== incomingDegree.size) {
      // Upstream lists the implicated nodes in unordered_map order, which is
      // unspecified; they are sorted here.
      const cycleNodes = [...incomingDegree].filter(([, degree]) => degree > 0).map(([id]) => id).sort(compareTokens)
      errors?.push(`Graph contains a cycle involving nodes: ${cycleNodes.join(', ')}`)
      return false
    }
    return true
  }

  // profileRegistry.cpp:261-278.
  validateEdges(errors?: string[]): boolean {
    let valid = true
    for (const [id, edges] of this.incomingEdgeMap) {
      for (const edge of edges) {
        if (!this.incomingEdgeMap.has(edge.name)) {
          errors?.push(`Capability '${id}' has unknown predecessor '${edge.name}'`)
          valid = false
        }
      }
    }
    return valid
  }

  // Exactly one root, named "usd"; an empty graph is valid
  // (profileRegistry.cpp:283-325).
  validateRoot(errors?: string[]): boolean {
    if (this.incomingEdgeMap.size === 0) return true
    const roots = [...this.incomingEdgeMap].filter(([, edges]) => edges.length === 0).map(([id]) => id)
    if (roots.length !== 1) {
      errors?.push(`Graph must have exactly one root node named 'usd', but found ${roots.length} root(s): ` +
        (roots.length === 0 ? '(none)' : roots.join(', ')))
      return false
    }
    if (roots[0] !== 'usd') {
      errors?.push(`Graph root must be named 'usd', but found '${roots[0]}'`)
      return false
    }
    return true
  }

  allCapabilities(): string[] {
    return [...this.incomingEdgeMap.keys()].sort(compareTokens)
  }

  allProfiles(): string[] {
    return [...this.metadata.values()].filter(cap => cap.isProfile).map(cap => cap.id).sort(compareTokens)
  }

  // The recursion of profileRegistry.cpp:361-403; `visited` holds the
  // current path, for cycle rejection.
  depthFirstSearch(current: string, target: string, visited: Set<string>): QueryStatus {
    if (current === target) return QueryStatus.ValidPath
    if (visited.has(current)) return QueryStatus.CycleFound
    visited.add(current)
    let result: QueryStatus = QueryStatus.NoPath
    const edges = this.incomingEdgeMap.get(current)
    if (!edges) {
      visited.delete(current)
      return QueryStatus.NoPath
    }
    for (const edge of edges) {
      let subGraphStatus = this.depthFirstSearch(edge.name, target, visited)
      if (subGraphStatus === QueryStatus.NoPath) continue
      if (edge.deprecated) subGraphStatus = QueryStatus.Deprecated
      if (result === QueryStatus.NoPath) result = subGraphStatus
      else if (result !== subGraphStatus) result = QueryStatus.DeprecationConflict
    }
    visited.delete(current)
    return result
  }

  // profileRegistry.cpp:405-418.
  predecessors(cap: string): CapabilityResult[] {
    const result = new Map<string, QueryStatus>()
    for (const edge of this.incomingEdgeMap.get(cap) ?? []) {
      // std::set keeps the first entry for a repeated predecessor.
      if (!result.has(edge.name)) {
        result.set(edge.name, edge.deprecated ? QueryStatus.Deprecated : QueryStatus.ValidPath)
      }
    }
    return sortedResults(result)
  }

  // Single-pass transitive closure (profileRegistry.cpp:425-485).
  transitivePredecessors(cap: string): CapabilityResult[] {
    const status = new Map<string, QueryStatus>()
    const inPath = new Set<string>()
    const visit = (node: string, pathDeprecated: boolean): void => {
      if (inPath.has(node)) return
      inPath.add(node)
      const incoming = pathDeprecated ? QueryStatus.Deprecated : QueryStatus.ValidPath
      const prior = status.get(node)
      let propagate = prior === undefined
      if (prior === undefined) status.set(node, incoming)
      else if (prior !== QueryStatus.DeprecationConflict && prior !== incoming) {
        status.set(node, QueryStatus.DeprecationConflict)
        propagate = true
      }
      if (propagate) {
        for (const edge of this.incomingEdgeMap.get(node) ?? []) {
          visit(edge.name, pathDeprecated || edge.deprecated)
        }
      }
      inPath.delete(node)
    }
    for (const edge of this.incomingEdgeMap.get(cap) ?? []) visit(edge.name, edge.deprecated)
    return sortedResults(status)
  }

  // profileRegistry.cpp:490-499.
  hasPredecessor(capability: string, target: string): QueryStatus {
    if (capability === target) return QueryStatus.NoPath
    return this.depthFirstSearch(capability, target, new Set())
  }
}

type JsObject = Record<string, unknown>
const isObject = (value: unknown): value is JsObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * UsdProfileRegistry: the singleton capability DAG collected from plugins'
 * plugInfo.json "Profiles" data, with its queries. Every query is static, as
 * upstream's is.
 */
export class UsdProfileRegistry {
  static #instance: UsdProfileRegistry | undefined
  readonly #graph = new CapabilityGraph()
  // Styles declared by plugins (std::map: ordered by key).
  readonly #capabilityStyles = new Map<string, string>()

  private constructor() {
    const registry = PlugRegistry.GetInstance()
    this.#registerFromPlugins(registry.getAllPlugins(), true)
    // Upstream discovers every plugin before the registry is built
    // (profileRegistry.cpp:984-1031). Plugins here may register later, from
    // plugInfo URLs or lazily imported modules, so a later registration
    // contributes its Profiles data and the graph is validated again.
    registry.addDidRegisterPluginsListener(plugins => this.#registerFromPlugins(plugins, false))
  }

  static #get(): UsdProfileRegistry {
    return (this.#instance ??= new UsdProfileRegistry())
  }

  // profileRegistry.cpp:984-1031.
  #registerFromPlugins(plugins: readonly PlugPlugin[], initial: boolean): void {
    let loaded = false
    for (const plug of plugins) {
      const profileData = plug.getMetadata()['Profiles']
      if (!isObject(profileData)) continue
      loaded = true
      const trap = new TfDiagnosticTrap()
      try {
        this._loadCapabilitiesFromProfileData(profileData)
      } finally {
        trap.dismiss()
      }
      if (!trap.isClean()) {
        const msgs: string[] = []
        trap.forEach(d => msgs.push(d.getCommentary()))
        trap.clear()
        TfRaiseWarning(`Problems loading Profiles data from plugin '${plug.getName()}' ` +
          `(${plug.getPath()}): ${msgs.join('; ')}`)
      }
    }
    if (!loaded && !initial) return
    const errors: string[] = []
    this.#graph.validateEdges(errors)
    this.#graph.validateAcyclic(errors)
    this.#graph.validateRoot(errors)
    for (const error of errors) TfRaiseWarning(error)
  }

  // UsdProfileRegistry::_LoadCapabilitiesFromProfileData
  // (profileRegistry.cpp:883-982).
  /** @internal */
  _loadCapabilitiesFromProfileData(profileData: JsObject): boolean {
    const styles = profileData['CapabilityStyles']
    if (isObject(styles)) {
      for (const [style, value] of Object.entries(styles)) this.#capabilityStyles.set(style, String(value))
    }
    const capsData = profileData['Capabilities']
    if (!isObject(capsData)) return true
    for (const [capId, capObj] of Object.entries(capsData)) {
      if (!isObject(capObj)) {
        TfRaiseWarning(`Expected object for capability '${capId}'`)
        continue
      }
      const incomingEdges: Edge[] = []
      const predecessors = capObj['predecessors']
      if (Array.isArray(predecessors)) {
        for (const pred of predecessors) {
          if (typeof pred === 'string') incomingEdges.push({ name: pred, deprecated: false })
          else if (isObject(pred)) {
            if (typeof pred['name'] !== 'string') {
              TfRaiseWarning(`Predecessor object missing 'name' for capability '${capId}'`)
              continue
            }
            incomingEdges.push({ name: pred['name'], deprecated: typeof pred['deprecated'] === 'boolean' && pred['deprecated'] })
          } else {
            TfRaiseWarning(`Invalid predecessor format for capability '${capId}'`)
          }
        }
      }
      const string = (key: string, fallback = ''): string =>
        typeof capObj[key] === 'string' ? capObj[key] as string : fallback
      this.#graph.addCapability(capId, incomingEdges, {
        id: capId,
        name: string('name', capId),
        docstring: string('docstring'),
        style: string('style'),
        subgraph: string('subgraph'),
        isProfile: typeof capObj['isProfile'] === 'boolean' && capObj['isProfile'],
      })
    }
    return true
  }

  /** Whether `capability` is known to the registry. */
  static hasCapability(capability: string): boolean {
    return this.#get().#graph.incomingEdgeMap.has(capability)
  }

  /** Whether `capability` is declared with "isProfile": true. */
  static isProfile(capability: string): boolean {
    return this.#get().#graph.metadata.get(capability)?.isProfile ?? false
  }

  /** name, docstring, style, subgraph and isProfile; empty when unknown
   *  (profileRegistry.cpp:616-629). */
  static getCapabilityMetadata(capability: string): Record<string, string | boolean> {
    const c = this.#get().#graph.metadata.get(capability)
    if (!c) return {}
    return { docstring: c.docstring, isProfile: c.isProfile, name: c.name, style: c.style, subgraph: c.subgraph }
  }

  /** Direct predecessors, each ValidPath or Deprecated by its edge. */
  static getPredecessors(capability: string): CapabilityResult[] {
    return this.#get().#graph.predecessors(capability)
  }

  /** Every ancestor of `capability`, with the best status of any path to it. */
  static getTransitivePredecessors(capability: string): CapabilityResult[] {
    return this.#get().#graph.transitivePredecessors(capability)
  }

  /** Splits a `_vN` suffix: usd.physics_v2 -> [usd.physics, 2]
   *  (profileRegistry.cpp:646-685). */
  static parseCapabilityVersion(capability: string): [string, number] {
    let pos = -1
    let searchFrom = capability.length
    while (searchFrom > 1) {
      const found = capability.lastIndexOf('_v', searchFrom - 1)
      if (found < 0) break
      const digits = capability.slice(found + 2)
      if (digits.length > 0 && /^[0-9]+$/.test(digits)) {
        pos = found
        break
      }
      searchFrom = found
    }
    if (pos < 0) return [capability, 0]
    return [capability.slice(0, pos), Number.parseInt(capability.slice(pos + 2), 10)]
  }

  /** The registered capability preferred for `capability`: a versioned form
   *  over the unversioned name, the highest version first; '' when none is
   *  registered (profileRegistry.cpp:688-722). */
  static resolveCapability(capability: string): string {
    const [inputBase] = this.parseCapabilityVersion(capability)
    let best = ''
    let bestVersion = -1
    for (const cap of this.#get().#graph.allCapabilities()) {
      const [base, ver] = this.parseCapabilityVersion(cap)
      if (base !== inputBase) continue
      if (bestVersion < 0 || ver > bestVersion) {
        best = cap
        bestVersion = ver
      }
    }
    return bestVersion < 0 ? '' : best
  }

  /** Whether `capabilityA` has `capabilityB` in its predecessor DAG, both
   *  resolved first (profileRegistry.cpp:725-735). */
  static hasPredecessor(capabilityA: string, capabilityB: string): QueryStatus {
    const resolvedA = this.resolveCapability(capabilityA)
    const resolvedB = this.resolveCapability(capabilityB)
    if (!resolvedA || !resolvedB) return QueryStatus.NoPath
    return this.#get().#graph.hasPredecessor(resolvedA, resolvedB)
  }

  /**
   * Whether `perspective` reaches every capability in `required`
   * (profileRegistry.cpp:524-605). Aggregate precedence: NoPath >
   * DeprecationConflict > Excepted > Deprecated > ValidPath; CycleFound and
   * Excepted count as NoPath. `results`, when given, is replaced with one
   * entry per required capability, ordered by its resolved token.
   */
  static coversCapabilities(perspective: string, required: Iterable<string>,
    excepted: Iterable<string> = [], results?: CapabilityResult[]): QueryStatus {
    results?.splice(0)
    const requiredSet = [...new Set(required)]
    if (requiredSet.length === 0) return QueryStatus.NoPath
    const resolvedPerspective = this.resolveCapability(perspective)
    if (!resolvedPerspective) return QueryStatus.NoPath
    const resolvedExcepted = new Set<string>()
    for (const e of excepted) resolvedExcepted.add(this.resolveCapability(e) || e)
    const graph = this.#get().#graph
    let aggregate: QueryStatus = QueryStatus.ValidPath
    let anyNoPath = false
    const perCapability = new Map<string, QueryStatus>()
    for (const cap of requiredSet) {
      const resolvedCap = this.resolveCapability(cap)
      const reportToken = resolvedCap || cap
      let s: QueryStatus
      if (resolvedCap && resolvedExcepted.has(resolvedCap)) s = QueryStatus.Excepted
      else if (!resolvedCap) s = QueryStatus.NoPath
      else s = graph.hasPredecessor(resolvedPerspective, resolvedCap)
      // std::set insert keeps the first entry for a token.
      if (!perCapability.has(reportToken)) perCapability.set(reportToken, s)
      if (s === QueryStatus.NoPath || s === QueryStatus.CycleFound || s === QueryStatus.Excepted) {
        anyNoPath = true
        continue
      }
      if (s === QueryStatus.DeprecationConflict) aggregate = QueryStatus.DeprecationConflict
      else if (s === QueryStatus.Deprecated && aggregate !== QueryStatus.DeprecationConflict) {
        aggregate = QueryStatus.Deprecated
      }
    }
    results?.push(...sortedResults(perCapability))
    return anyNoPath ? QueryStatus.NoPath : aggregate
  }

  /** The union of impliesCapabilities on `schemaType` and its ancestors. */
  static getSchemaImpliedCapabilities(schemaType: TfType): string[] {
    return typeImpliedCapabilities(schemaType)
  }

  /** The union of impliesCapabilities on a file format type and its ancestors. */
  static getFileFormatImpliedCapabilities(formatType: TfType): string[] {
    return typeImpliedCapabilities(formatType)
  }

  static getAllCapabilities(): string[] {
    return this.#get().#graph.allCapabilities()
  }

  static getAllProfiles(): string[] {
    return this.#get().#graph.allProfiles()
  }

  static getStyleForCapability(capability: string): string {
    return this.#get().#graph.metadata.get(capability)?.style ?? ''
  }

  static getSubgraphForCapability(capability: string): string {
    return this.#get().#graph.metadata.get(capability)?.subgraph ?? ''
  }

  static getDocString(capability: string): string {
    return this.#get().#graph.metadata.get(capability)?.docstring ?? ''
  }

  static getDisplayName(capability: string): string {
    return this.#get().#graph.metadata.get(capability)?.name ?? ''
  }

  /** Style token -> style string, ordered by token. */
  static getCapabilityStyles(): Map<string, string> {
    return new Map([...this.#get().#capabilityStyles].sort(([a], [b]) => compareTokens(a, b)))
  }

  // Usd_ProfilesRegistryTestAccess (profileRegistry.cpp:1033-1138).
  /** @internal */
  static _testClear(): void {
    const instance = this.#get()
    instance.#graph.clear()
    instance.#capabilityStyles.clear()
  }

  /** @internal `text` is the file's contents, undefined when it cannot be read. */
  static _testLoad(filePath: string, text: string | undefined, errors?: string[]): boolean {
    if (text === undefined) {
      errors?.push(`Failed to open file: ${filePath}`)
      return false
    }
    let root: unknown
    try { root = JSON.parse(text) } catch (error) {
      errors?.push(`JSON parse error in '${filePath}': ${String(error)}`)
      return false
    }
    if (!isObject(root)) {
      errors?.push(`Expected JSON object at root of '${filePath}'`)
      return false
    }
    this._testClear()
    const instance = this.#get()
    const plugins = root['Plugins']
    if (!Array.isArray(plugins)) {
      errors?.push(`Expected 'Plugins' array at root of '${filePath}'`)
      return false
    }
    for (const plugin of plugins) {
      if (!isObject(plugin) || !isObject(plugin['Info'])) continue
      const profileData = plugin['Info']['Profiles']
      if (isObject(profileData)) instance._loadCapabilitiesFromProfileData(profileData)
    }
    const validationErrors: string[] = []
    let valid = instance.#graph.validateEdges(validationErrors)
    valid = instance.#graph.validateAcyclic(validationErrors) && valid
    valid = instance.#graph.validateRoot(validationErrors) && valid
    errors?.push(...validationErrors)
    return valid
  }
}

// _GetTypeImpliedCapabilities (profileRegistry.cpp:743-788): the plugInfo
// impliesCapabilities string arrays of the type and all its ancestors,
// cached per type.
const impliedCache = new Map<TfType, string[]>()
function typeImpliedCapabilities(type: TfType): string[] {
  if (type.isUnknown()) return []
  const cached = impliedCache.get(type)
  if (cached) return [...cached]
  const registry = PlugRegistry.GetInstance()
  const result = new Set<string>()
  for (const t of type.getAllAncestorTypes()) {
    const implies = registry.getMetadataForType(t)['impliesCapabilities']
    if (!Array.isArray(implies)) continue
    for (const cap of implies) if (typeof cap === 'string') result.add(cap)
  }
  const sorted = [...result].sort(compareTokens)
  impliedCache.set(type, sorted)
  return [...sorted]
}
