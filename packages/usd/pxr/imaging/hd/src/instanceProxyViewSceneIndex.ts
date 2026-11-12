// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instanceProxyViewSceneIndex.cpp,
//  pxr/imaging/hd/instanceProxyViewSceneIndex.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instanceProxyViewSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// The TF_DEBUG(HD_INSTANCE_PROXY_VIEW_SCENE_INDEX) messages are not emitted.
// SdfPathSet ordering (std::lower_bound in _IsDescendantOfOuterInstance and
// _IsDescendantOfInstancer) is SdfPath::operator<, SdfPath.compare here.

import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  type HdContainerDataSource,
  type HdDataSourceBase,
  HdRetainedContainerDataSource,
  HdRetainedSmallVectorDataSource,
  HdRetainedTypedSampledDataSource,
  type HdVectorDataSource,
} from './dataSource.ts'
import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import { HdInstanceProxySchema } from './instanceProxySchema.ts'
import { HdInstancerTopologySchema } from './instancerTopologySchema.ts'
import { HdInstanceSchema } from './instanceSchema.ts'
import { HdOverlayContainerDataSource } from './overlayContainerDataSource.ts'
import {
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  type HdSceneIndexBase,
  type HdSceneIndexPrim,
  HdSceneIndexPrimView,
  type RemovedPrimEntry,
} from './sceneIndex.ts'
import { HdPrimTypeTokens } from './tokens.ts'

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

function TF_VERIFY(cond: boolean, message: string): boolean {
  if (!cond) TF_CODING_ERROR(`Failed verification: ${message}`)
  return cond
}

/** instanceProxyViewSceneIndex.cpp:28-31 */
const _tokens = {
  UsdNiPropagatedPrototypes: 'UsdNiPropagatedPrototypes',
} as const

/** instanceProxyViewSceneIndex.cpp:36-42: maps to HdInstanceSchema with the
 *  addition of the prototype (root) path. */
interface _InstanceInfo {
  instancerPath: string
  prototypeRootPath: string
  prototypeIndex: number
  instanceIndex: number
}

/** instanceProxyViewSceneIndex.cpp:44 */
type _InstancingContext = _InstanceInfo[]

/** instanceProxyViewSceneIndex.cpp:46-53 */
interface _InstanceProxyContext {
  // `primInPrototype` refers to the prim under the (propagated) prototype
  // root that the instance proxy prim corresponds to.
  pathToPrimInPrototype: string
  primInPrototype: HdSceneIndexPrim
  instancingCtx: _InstancingContext // Ordered from outermost to innermost.
}

function _ToArray(v: unknown): readonly string[] {
  if (Array.isArray(v)) return v as string[]
  const a = v as { toArray?: () => string[] } | undefined
  return a?.toArray ? a.toArray() : v ? [...(v as Iterable<string>)] : []
}

/** An SdfPathSet: path strings kept sorted by SdfPath::operator<. */
class _SdfPathSet {
  private _paths: SdfPath[] = []
  private _strings = new Set<string>()

  has(path: string): boolean { return this._strings.has(path) }

  /** std::lower_bound(begin, end, path) */
  private _lowerBound(path: SdfPath): number {
    let lo = 0
    let hi = this._paths.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (SdfPath.compare(this._paths[mid]!, path) < 0) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  insert(path: string): void {
    if (this._strings.has(path)) return
    const p = SdfPath.fromString(path)
    this._paths.splice(this._lowerBound(p), 0, p)
    this._strings.add(path)
  }

  erase(path: string): void {
    if (!this._strings.delete(path)) return
    const p = SdfPath.fromString(path)
    this._paths.splice(this._lowerBound(p), 1)
  }

  /** The element before std::lower_bound(path), or undefined when the lower
   *  bound is begin(). */
  predecessorOf(path: SdfPath): SdfPath | undefined {
    const i = this._lowerBound(path)
    return i === 0 ? undefined : this._paths[i - 1]
  }

  values(): string[] { return this._paths.map(p => p.toString()) }
}

/** instanceProxyViewSceneIndex.cpp:62-412 HdInstanceProxyViewSceneIndex::_Impl */
class _Impl {
  // Map from any Hydra instance prim (i.e. prim with `instance` data source)
  // to its instancer, prototype and instance index.
  // Note that this includes nested instance prims that are descendants of
  // instancer prim(s).
  private readonly _instanceInfoMap = new Map<string, _InstanceInfo>()

  // Track leaf prims with an instance data source that aren't under an
  // instancer prim to aid query processing.
  private readonly _outerInstancePrimPaths = new _SdfPathSet()

  // Track all prims of type `instancer` to aid notice processing.
  private readonly _instancerPrimPaths = new _SdfPathSet()

  /** instanceProxyViewSceneIndex.cpp:64-76 */
  constructor(private readonly _inputSi: HdSceneIndexBase) {
    // Update tracking by traversing the input scene to find all instancer
    // prims.
    for (const primPath of new HdSceneIndexPrimView(_inputSi, '/')) {
      const prim = _inputSi.getPrim(primPath)
      if (prim.primType === HdPrimTypeTokens.instancer) {
        this.updateTracking(primPath)
      }
    }
  }

  /** instanceProxyViewSceneIndex.cpp:153-185 */
  isInstanceProxy(primPath: string, instanceProxyCtx?: { value?: _InstanceProxyContext }): boolean {
    const outer = this._isDescendantOfOuterInstance(primPath)
    if (outer === undefined) {
      return false
    }

    const [pathToPrimInPrototype, instancingContext] =
      this._computeMappedPrimPathAndInstancingContext(primPath, outer)

    const primInPrototype = this._inputSi.getPrim(pathToPrimInPrototype)
    // HdSceneIndexPrim::operator bool: a prim with a data source.
    if (!primInPrototype.dataSource) {
      return false
    }

    if (instanceProxyCtx) {
      instanceProxyCtx.value = { pathToPrimInPrototype, primInPrototype, instancingCtx: instancingContext }
    }
    return true
  }

  /** instanceProxyViewSceneIndex.cpp:187-212 */
  isOutermostInstance(primPath: string, prototypeRootPath?: { value: string }): boolean {
    if (!this._outerInstancePrimPaths.has(primPath)) {
      return false
    }

    if (prototypeRootPath) {
      const it = this._instanceInfoMap.get(primPath)
      if (it === undefined) {
        TF_CODING_ERROR(
          `Outer instance prim path <${primPath}> is missing from instance info ` +
          'map. This indicates a bug in tracking logic.')
        prototypeRootPath.value = ''
      } else {
        prototypeRootPath.value = it.prototypeRootPath
      }
    }
    return true
  }

  /** instanceProxyViewSceneIndex.cpp:214-230 */
  isInstance(primPath: string, prototypeRootPath?: { value: string }): boolean {
    const it = this._instanceInfoMap.get(primPath)
    if (it === undefined) {
      return false
    }
    if (prototypeRootPath) {
      prototypeRootPath.value = it.prototypeRootPath
    }
    return true
  }

  /** instanceProxyViewSceneIndex.cpp:232-236 */
  isInstancer(primPath: string): boolean {
    return this._instancerPrimPaths.has(primPath)
  }

  /** instanceProxyViewSceneIndex.cpp:238-260 */
  computeRemappedChildPrimPaths(sourcePath: string, prefixToReplaceWith: string): string[] {
    const childPaths = this._inputSi.getChildPrimPaths(sourcePath)
    const prefix = SdfPath.fromString(prefixToReplaceWith)

    const remappedChildPaths: string[] = []
    for (const childPath of childPaths) {
      const name = SdfPath.fromString(childPath).name
      // XXX Is there a better way to exclude these prims?
      if (name === _tokens.UsdNiPropagatedPrototypes) {
        continue
      }

      // Remap the prototype child path to the instance proxy child path by
      // replacing the prototype path prefix with the instance proxy path.
      remappedChildPaths.push(prefix.appendChild(name).toString())
    }
    return remappedChildPaths
  }

  /** instanceProxyViewSceneIndex.cpp:262-339 */
  updateTracking(instancerPath: string): void {
    const instancerPrim = this._inputSi.getPrim(instancerPath)
    const topologySchema = HdInstancerTopologySchema.getFromParent(instancerPrim.dataSource)
    const instanceLocationsDs = topologySchema.getInstanceLocations()

    if (!instanceLocationsDs) {
      this.removeTracking(instancerPath)
      return
    }

    this._instancerPrimPaths.insert(instancerPath)

    const instanceLocations = _ToArray(instanceLocationsDs.getTypedValue(0.0))

    for (const instancePath of instanceLocations) {
      const instancePrim = this._inputSi.getPrim(instancePath)
      const instanceSchema = HdInstanceSchema.getFromParent(instancePrim.dataSource)
      const prototypeIndexDs = instanceSchema.getPrototypeIndex()
      const instanceIndexDs = instanceSchema.getInstanceIndex()

      if (!prototypeIndexDs || !instanceIndexDs) {
        this._instanceInfoMap.delete(instancePath)
        this._outerInstancePrimPaths.erase(instancePath)
        continue
      }

      const prototypeIndex = prototypeIndexDs.getTypedValue(0) as number
      const instanceIndex = instanceIndexDs.getTypedValue(0) as number
      const prototypePathsDs = topologySchema.getPrototypes()
      const prototypePaths = prototypeIndexDs && prototypePathsDs
        ? _ToArray(prototypePathsDs.getTypedValue(0.0))
        : []
      const prototypePath =
        (prototypeIndex >= 0 && prototypeIndex < prototypePaths.length)
          ? prototypePaths[prototypeIndex]!
          : ''

      this._instanceInfoMap.set(instancePath,
        { instancerPath, prototypeRootPath: prototypePath, prototypeIndex, instanceIndex })

      if (!this._isDescendantOfInstancer(instancePath)) {
        // This is an outer instance.
        this._outerInstancePrimPaths.insert(instancePath)
      }

      // XXX instancedBy doesn't seem to be a reliable way to determine if
      // a hydra instance prim is "outside" an instancer. In the nested
      // instancing case, the prototype prim for the outer instancer is
      // itself an instance prim, but it doesn't have the instancedBy schema.
      // Unclear why. For now, using the "not descendant of any instancer"
      // heuristic to determine if an instance prim is an outer instance.
    }
  }

  /** instanceProxyViewSceneIndex.cpp:341-359 */
  removeTracking(instancerPath: string): void {
    // Nuke any existing tracking for instances tied to this instancer...
    for (const [path, info] of [...this._instanceInfoMap]) {
      if (info.instancerPath === instancerPath) {
        this._outerInstancePrimPaths.erase(path)
        this._instanceInfoMap.delete(path)
      }
    }

    // ...and then remove the instancer from the tracked set.
    this._instancerPrimPaths.erase(instancerPath)
  }

  getOutermostInstancePrimPaths(): string[] {
    return this._outerInstancePrimPaths.values()
  }

  /** instanceProxyViewSceneIndex.cpp:361-391. Returns the outer instance
   *  path, or undefined. */
  private _isDescendantOfOuterInstance(primPath: string): string | undefined {
    // Since we track the outer instance prim paths, if the path is a
    // descendant of any of those, then it is an instance proxy prim.
    // Lower bound gives us the first path that is >= primPath.
    // The element before that is the largest path that is < primPath.
    const path = SdfPath.fromString(primPath)
    const it = this._outerInstancePrimPaths.predecessorOf(path)
    if (it === undefined) {
      return undefined
    }
    if (path.hasPrefix(it)) {
      return it.toString()
    }
    return undefined
  }

  /** instanceProxyViewSceneIndex.cpp:393-412 */
  private _isDescendantOfInstancer(primPath: string): boolean {
    const path = SdfPath.fromString(primPath)
    const it = this._instancerPrimPaths.predecessorOf(path)
    if (it === undefined) {
      return false
    }
    return path.hasPrefix(it)
  }

  /** instanceProxyViewSceneIndex.cpp:414-489 */
  private _computeMappedPrimPathAndInstancingContext(
    instanceProxyPath: string, outerInstancePath: string,
  ): [string, _InstancingContext] {
    const proxyPath = SdfPath.fromString(instanceProxyPath)
    const outerPath = SdfPath.fromString(outerInstancePath)
    if (!proxyPath.hasPrefix(outerPath)) {
      TF_CODING_ERROR(
        `Instance proxy path <${instanceProxyPath}> is not a descendant of ` +
        `outer instance path <${outerInstancePath}>`)
      return ['', []]
    }

    // Build the instancing context starting from the first prefix path after
    // the outermost instance prim (i.e. an instance proxy child prim of the
    // outer instance prim) up to the instance proxy path itself.
    // Start with the mapped path being the outer instance prim path.
    // Iterate through each prefix path, replacing the current mapped path
    // if it is an instance prim with the corresponding prototype root path,
    // and then appending the name token of the current prefix path to the
    // mapped path.
    const numPrefixes = proxyPath.pathElementCount - outerPath.pathElementCount
    const prefixPaths = proxyPath.getPrefixes(numPrefixes)

    let mappedPrimPath = outerPath
    const instancingCtx: _InstancingContext = []

    for (const prefixPath of prefixPaths) {
      const it = this._instanceInfoMap.get(mappedPrimPath.toString())
      if (it !== undefined) {
        mappedPrimPath = SdfPath.fromString(it.prototypeRootPath)
        instancingCtx.push(it)
      }
      mappedPrimPath = mappedPrimPath.appendChild(prefixPath.name)
    }

    return [mappedPrimPath.toString(), instancingCtx]
  }
}

/** instanceProxyViewSceneIndex.cpp:497-519 */
function _BuildInstancingContextVectorDataSource(instancingCtx: _InstancingContext): HdVectorDataSource {
  const dataSources: HdDataSourceBase[] = []
  for (const instanceInfo of instancingCtx) {
    dataSources.push(
      new HdInstanceSchema.Builder()
        .setInstancer(HdRetainedTypedSampledDataSource.new(instanceInfo.instancerPath))
        .setPrototypeIndex(HdRetainedTypedSampledDataSource.new(instanceInfo.prototypeIndex))
        .setInstanceIndex(HdRetainedTypedSampledDataSource.new(instanceInfo.instanceIndex))
        .build())
  }
  return HdRetainedSmallVectorDataSource.new(dataSources)
}

/** instanceProxyViewSceneIndex.cpp:521-535 */
function _BuildInstanceProxyDataSource(instanceProxyCtx: _InstanceProxyContext): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdInstanceProxySchema.getSchemaToken()],
    [new HdInstanceProxySchema.Builder()
      .setPathToPrimInPrototype(HdRetainedTypedSampledDataSource.new(instanceProxyCtx.pathToPrimInPrototype))
      .setInstancingContext(_BuildInstancingContextVectorDataSource(instanceProxyCtx.instancingCtx))
      .build()])
}

/** instanceProxyViewSceneIndex.h:26-117: a scene index that provides a
 *  topological view of the scene as though instancing were not being used.
 *
 *  Specifically, this scene index "unrolls" leaf instance prims (i.e. prims
 *  with an `instance` data source that aren't under an instancer prim) by
 *  providing "instance proxy" prims as descendants. These instance proxy
 *  prims mirror the structure of the corresponding instance prim's prototype
 *  subtree. Each instance proxy prim mirrors the corresponding prototype's
 *  prim type and prim container with the addition of an `instanceProxy` data
 *  source that provides the path to the mirrored prototype prim.
 *
 *  This scene index does not currently send *any* notices for instance proxy
 *  prims. It is not intended for use in a scene index pipeline chain. It
 *  unrolls implicit instancing (e.g. USD native instancing), not explicit
 *  instancing (e.g. point instancers). */
export class HdInstanceProxyViewSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _impl: _Impl

  /** instanceProxyViewSceneIndex.cpp:545-555 */
  static new(inputSceneIndex: HdSceneIndexBase): HdInstanceProxyViewSceneIndex {
    const sceneIndex = new HdInstanceProxyViewSceneIndex(inputSceneIndex)
    sceneIndex.setDisplayName('Instance Proxy View Scene Index')
    return sceneIndex
  }

  /** instanceProxyViewSceneIndex.cpp:557-562 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this._impl = new _Impl(inputSceneIndex)
  }

  /** instanceProxyViewSceneIndex.cpp:564-568: returns true if the given prim
   *  path is a leaf instance prim path that isn't under an instancer prim. */
  isOutermostInstance(primPath: string): boolean {
    return this._impl.isOutermostInstance(primPath)
  }

  /** instanceProxyViewSceneIndex.cpp:570-574: the set of all tracked
   *  outermost instance prim paths (in SdfPath order). */
  getAllOutermostInstancePrimPaths(): string[] {
    return this._impl.getOutermostInstancePrimPaths()
  }

  /** instanceProxyViewSceneIndex.cpp:576-580: returns true if the given prim
   *  path is an instance proxy prim path matching the USD definition of an
   *  instance proxy prim. */
  isInstanceProxy(primPath: string): boolean {
    return this._impl.isInstanceProxy(primPath)
  }

  /** instanceProxyViewSceneIndex.cpp:582-614 */
  getPrim(primPath: string): HdSceneIndexPrim {
    // Two scenarios to handle for `primPath` here:
    // 1. Instance proxy prim path: Manufacture a prim that mirrors the
    //    corresponding prototype prim with the instance proxy schema overlaid.
    //
    // 2. Any other prim path. Simply pass through to the input scene index.
    //    This includes invalid prim paths that may be a descendant of an
    //    outer instance prim but aren't valid instance proxy paths.
    {
      const optCtx: { value?: _InstanceProxyContext } = {}
      if (this._impl.isInstanceProxy(primPath, optCtx)) {
        const primInPrototype = optCtx.value!.primInPrototype
        return {
          primType: primInPrototype.primType,
          dataSource: HdOverlayContainerDataSource.overlayedContainerDataSources(
            primInPrototype.dataSource,
            _BuildInstanceProxyDataSource(optCtx.value!)),
        }
      }
    }

    return this._getInputSceneIndex().getPrim(primPath)
  }

  /** instanceProxyViewSceneIndex.cpp:616-689 */
  getChildPrimPaths(primPath: string): string[] {
    // Three possibilities for `primPath` here:
    // 1. Outer instance prim (a leaf hydra prim that isn't under an
    //    instancer) in the input scene index:
    //    Return the remapped child prim paths of the prototype prim.
    //
    // 2. Instance proxy prim that this scene index provides.
    //    Here, we need to account for the possibility that the mapped prim
    //    corresponding to the instance proxy prim is an instance, in which
    //    case we need to obtain its prototype path.
    //    Return the remapped child prim paths of the prim at the resolved
    //    path.
    //
    // 3. Any other prim path. Simply pass through to the input scene index.
    {
      const prototypeRootPath = { value: '' }
      if (this._impl.isOutermostInstance(primPath, prototypeRootPath)) {
        const childPaths = this._getInputSceneIndex().getChildPrimPaths(primPath)

        if (!TF_VERIFY(childPaths.length === 0,
          `Outer instance path <${primPath}> should not have any child prim ` +
          'paths in the input scene index')) {
          return childPaths
        }

        return this._impl.computeRemappedChildPrimPaths(prototypeRootPath.value, primPath)
      }
    }

    {
      const optCtx: { value?: _InstanceProxyContext } = {}
      if (this._impl.isInstanceProxy(primPath, optCtx)) {
        const ctx = optCtx.value!
        const childPaths = this._getInputSceneIndex().getChildPrimPaths(primPath)

        if (!TF_VERIFY(childPaths.length === 0,
          `Instance proxy path <${primPath}> should not have any child prim ` +
          `paths in the input scene index. Found ${childPaths.length} child paths.`)) {
          return childPaths
        }

        // XXX This bit feels unfortunate. Is there a better way to
        // express this?
        const resolvedPrimPath = { value: ctx.pathToPrimInPrototype }
        this._impl.isInstance(ctx.pathToPrimInPrototype, resolvedPrimPath)

        return this._impl.computeRemappedChildPrimPaths(resolvedPrimPath.value, primPath)
      }
    }

    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** instanceProxyViewSceneIndex.cpp:691-710 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    for (const entry of entries) {
      if (entry.primType === HdPrimTypeTokens.instancer) {
        this._impl.updateTracking(entry.primPath)
      } else if (this._impl.isInstancer(entry.primPath)) {
        // Handle resync of a tracked instancer prim that is no longer one.
        this._impl.removeTracking(entry.primPath)
      }
    }

    // XXX This scene index does not currently send notices for instance
    //     proxy prims currently.
    this._sendPrimsAdded(entries)
  }

  /** instanceProxyViewSceneIndex.cpp:712-726 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    for (const entry of entries) {
      if (this._impl.isInstancer(entry.primPath)) {
        this._impl.removeTracking(entry.primPath)
      }
    }
    this._sendPrimsRemoved(entries)
  }

  /** instanceProxyViewSceneIndex.cpp:728-742 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    for (const entry of entries) {
      if (this._impl.isInstancer(entry.primPath)) {
        this._impl.updateTracking(entry.primPath)
      }
    }
    this._sendPrimsDirtied(entries)
  }
}
