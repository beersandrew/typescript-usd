// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/niInstanceAggregationSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/niInstanceAggregationSceneIndex.h,
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingInstanceProxyTraversal.cpp
// Copyright 2022, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/niInstanceAggregationSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - SdfPath is a string ('' is the empty path). SdfPathSet / std::map<SdfPath,
//   ...> orderings are reproduced with an element-wise SdfPath operator<
//   (_ComparePaths), since instance ids depend on that order.
// - HdEncapsulatingSceneIndexBase is not ported in hd; GetEncapsulatedScenes()
//   is a plain method of the class.
// - Lifetime: upstream the scene index's destructor destroys the
//   _InstanceObserver (whose observer handle on the input scene is weak) and
//   the retained-scene-index observer. JavaScript has no destructors and
//   observer storage is strong, so UsdImaging_NiInstanceAggregationSceneIndex
//   .destroy() stands for the destructor: it removes the _InstanceObserver
//   from the input scene and the retained-scene-index observer.
// - The C++ weak pointer the lazy instance data source holds on the
//   _InstanceObserver (cpp:1953-1969) is a plain reference: JavaScript
//   garbage collection collects the cycle.
// - HdTypedSampledDataSource<SdfPath>::Cast (and VtArray<SdfPath>) cannot test
//   the value type at run time; see _CreateTranslatingDataSource.
// - HdGetMergedContributingSampleTimesForInterval and
//   HdSceneIndexObserver::ConvertPrimsRenamedToRemovedAndAdded are not in the
//   hd port; private ports of them live at the bottom of this file
//   (_HdGetMergedContributingSampleTimesForInterval,
//   _ConvertPrimsRenamedToRemovedAndAdded).
//
// The binding hash (cpp:738-795) uses TfHash of
// std::map<std::string,std::string> and HdDataSourceHash of the instance data
// sources, both bit-identical here, so the "Primvars<hex>_<name><hex>" binding
// scope names are the native build's (testUsdImagingInstanceProxyTraversal
// baselines).

import {
  DataSourceHash as HdDataSourceHash,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  FilteringSceneIndexBase as HdFilteringSceneIndexBase,
  InstancedBySchema as HdInstancedBySchema,
  InstancedBySchemaTokens as HdInstancedBySchemaTokens,
  InstancerTokens as HdInstancerTokens,
  InstancerTopologySchema as HdInstancerTopologySchema,
  InstancerTopologySchemaTokens as HdInstancerTopologySchemaTokens,
  InstanceSchema as HdInstanceSchema,
  LazyContainerDataSource as HdLazyContainerDataSource,
  MakeStaticCopy as HdMakeStaticCopy,
  PathArrayDataSource as HdPathArrayDataSource,
  PathDataSource as HdPathDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VectorDataSource as HdVectorDataSource,
  VisibilitySchema as HdVisibilitySchema,
  XformSchema as HdXformSchema,
  ContainerDataSource as HdContainerDataSource,
  type AddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry,
  type PrimvarSchema as HdPrimvarSchema,
  type RemovedPrimEntry,
  type RenamedPrimEntry,
  type RetainedAddedPrimEntry as HdRetainedAddedPrimEntry,
  type RetainedDirtiedPrimEntry as HdRetainedDirtiedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { HashCombine as TfHashCombine, type Type as TfType } from 'typescript-usd/tf'
import {
  Array as VtArray, GetKnownValueTypeIndex as VtGetKnownValueTypeIndex,
  Value as VtValue, ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import {
  UsdImaging_NiPrototypeSceneIndex, UsdImaging_NiPrototypeSceneIndexTokens,
} from './niPrototypeSceneIndex.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import { UsdImagingTokens } from './tokens.ts'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

// ---------------------------------------------------------------------------
// SdfPath helpers (string paths).

const _AbsoluteRootPath = '/'
const _AppendChild = (path: string, name: string): string =>
  path === '/' ? `/${name}` : `${path}/${name}`
const _GetParentPath = (path: string): string => {
  if (path === '' || path === '/') return ''
  const dot = path.indexOf('.')
  if (dot >= 0) return path.slice(0, dot)
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}
const _GetNameToken = (path: string): string => {
  const dot = path.indexOf('.')
  if (dot >= 0) return path.slice(dot + 1)
  return path === '/' ? '' : path.slice(path.lastIndexOf('/') + 1)
}
/** SdfPath::HasPrefix for prim and prim property paths. */
const _HasPrefix = (path: string, prefix: string): boolean => {
  if (path === '' || prefix === '') return false
  if (prefix === '/') return path.startsWith('/')
  return path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '.')
}
/** SdfPath::ReplacePrefix (no target paths here). */
const _ReplacePrefix = (path: string, oldPrefix: string, newPrefix: string): string => {
  if (!_HasPrefix(path, oldPrefix)) return path
  const rest = oldPrefix === '/' ? path.slice(1) : path.slice(oldPrefix.length)
  if (rest === '') return newPrefix
  if (newPrefix === '/') return rest.startsWith('/') || rest.startsWith('.') ? `/${rest.slice(1)}` : `/${rest}`
  return oldPrefix === '/' ? `${newPrefix}/${rest}` : `${newPrefix}${rest}`
}
/** SdfPath::GetPathElementCount. */
const _GetPathElementCount = (path: string): number => {
  if (path === '' || path === '/') return 0
  const dot = path.indexOf('.')
  const prim = dot < 0 ? path : path.slice(0, dot)
  return prim.split('/').filter(e => e !== '').length + (dot < 0 ? 0 : 1)
}
/** SdfPath operator< (element-wise from the root; a prefix sorts first). */
function _ComparePaths(a: string, b: string): number {
  // Scans the non-empty elements between '/' and '.' in place (it is sorted
  // with): the same order as comparing a.split(/[/.]/) without empty
  // elements, element by element.
  if (a === b) return 0
  const sep = (c: number) => c === 47 /* / */ || c === 46 /* . */
  let i = 0, j = 0
  for (;;) {
    while (i < a.length && sep(a.charCodeAt(i))) i++
    while (j < b.length && sep(b.charCodeAt(j))) j++
    const aEnd = i >= a.length, bEnd = j >= b.length
    if (aEnd || bEnd) return aEnd === bEnd ? 0 : aEnd ? -1 : 1
    let ei = i, ej = j
    while (ei < a.length && !sep(a.charCodeAt(ei))) ei++
    while (ej < b.length && !sep(b.charCodeAt(ej))) ej++
    const n = Math.min(ei - i, ej - j)
    for (let k = 0; k < n; k++) {
      const d = a.charCodeAt(i + k) - b.charCodeAt(j + k)
      if (d !== 0) return d < 0 ? -1 : 1
    }
    if (ei - i !== ej - j) return ei - i < ej - j ? -1 : 1
    i = ei; j = ej
  }
}

/** An SdfPathSet: a set of paths iterated in SdfPath order. */
class _SdfPathSet {
  private readonly _set = new Set<string>()
  private _sorted: string[] | undefined = []

  get size(): number { return this._set.size }
  empty(): boolean { return this._set.size === 0 }
  insert(path: string): void {
    if (this._set.has(path)) return
    this._set.add(path)
    this._sorted = undefined
  }
  erase(path: string): void {
    if (this._set.delete(path)) this._sorted = undefined
  }
  /** The paths in SdfPath order. */
  Sorted(): readonly string[] {
    return this._sorted ??= [...this._set].sort(_ComparePaths)
  }
  begin(): string | undefined { return this.Sorted()[0] }
}

/** Keys of a Map<SdfPath, ...> in std::map<SdfPath, ...> order. */
const _SortedKeys = <V>(map: Map<string, V>): string[] => [...map.keys()].sort(_ComparePaths)
/** std::lower_bound over paths in SdfPath order: the first not less than
 *  `path`. */
function _LowerBound(sorted: readonly string[], path: string): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (_ComparePaths(sorted[mid]!, path) < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ---------------------------------------------------------------------------

/** niInstanceAggregationSceneIndex.cpp:40-52. Gets primvars from prim at given
 *  path in scene index. */
function _GetPrimvarsSchema(sceneIndex: HdSceneIndexBase | undefined, primPath: string): HdPrimvarsSchema {
  if (!sceneIndex) {
    return new HdPrimvarsSchema(undefined)
  }
  return HdPrimvarsSchema.getFromParent(sceneIndex.getPrim(primPath).dataSource)
}

/** niInstanceAggregationSceneIndex.cpp:54-64. Gets primvar from prim at given
 *  path with given name in scene index. */
function _GetPrimvarSchema(sceneIndex: HdSceneIndexBase | undefined, primPath: string,
  primvarName: string): HdPrimvarSchema {
  return _GetPrimvarsSchema(sceneIndex, primPath).getPrimvar(primvarName)
}

/** niInstanceAggregationSceneIndex.cpp:66-81. Checks whether there is a primvar
 *  of the given name on the given prim in the scene index and its
 *  interpolation is constant. */
function _IsConstantPrimvar(sceneIndex: HdSceneIndexBase, primPath: string, primvarName: string): boolean {
  const interpolationSrc = _GetPrimvarSchema(sceneIndex, primPath, primvarName).getInterpolation()
  if (!interpolationSrc) {
    return false
  }
  const interpolation = interpolationSrc.getTypedValue(0.0)
  return interpolation === HdPrimvarSchemaTokens.constant
}

/** niInstanceAggregationSceneIndex.cpp:83-104. Gets names of all constant
 *  prims on prim at given path in given scene index. */
function _GetConstantPrimvarNames(sceneIndex: HdSceneIndexBase, primPath: string): string[] {
  const result: string[] = []

  const primvarsSchema = _GetPrimvarsSchema(sceneIndex, primPath)
  for (const name of primvarsSchema.getPrimvarNames()) {
    const primvarSchema = primvarsSchema.getPrimvar(name)
    const interpolationSrc = primvarSchema.getInterpolation()
    if (interpolationSrc) {
      const interpolation = interpolationSrc.getTypedValue(0.0)
      if (interpolation === HdPrimvarSchemaTokens.constant) {
        result.push(name)
      }
    }
  }

  return result
}

/** niInstanceAggregationSceneIndex.cpp:106-120. Gets value of primvar with
 *  given name of prim at given path in scene index.
 *
 *  Divergence: a typed sampled data source returns its typed value rather
 *  than a VtValue in this port; such a value is returned as is. */
function _GetPrimvarValue(sceneIndex: HdSceneIndexBase, primPath: string, primvarName: string): unknown {
  const ds = _GetPrimvarSchema(sceneIndex, primPath, primvarName).getPrimvarValue()
  if (!ds) {
    return VtValue.getEmpty()
  }
  return ds.GetValue(0.0)
}

/** The element type T of a primvar value holding T or VtArray<T>, for the
 *  dispatch upstream does with VtVisitValue (cpp:201-273). */
function _GetValueElementType(value: unknown): TfType | undefined {
  if (value instanceof VtValue) {
    if (value.IsEmpty()) return undefined
    return value.isArrayValued() ? value.getElementType() : value.getType()
  }
  if (value instanceof VtArray) {
    return value.getElementType()
  }
  return undefined
}

/** niInstanceAggregationSceneIndex.cpp:122-144. Returns the first of the
 *  values that the primvar with given name of prim at given path in scene
 *  index has if the type matches the given type. */
function _GetTypedPrimvarValue(sceneIndex: HdSceneIndexBase, primPath: string, primvarName: string,
  type: TfType): unknown {
  const value = _GetPrimvarValue(sceneIndex, primPath, primvarName)
  if (value instanceof VtValue) {
    if (value.IsHolding(type)) {
      return value.UncheckedGet()
    }
    if (value.isArrayValued() && value.getElementType() === type) {
      const array = value.UncheckedGet<VtArray<unknown>>()
      if (array.size === 0) {
        return VtArray._valueInitializedElement(type)
      }
      return array.get(0)
    }
    return VtArray._valueInitializedElement(type)
  }
  if (value instanceof VtArray) {
    if (value.getElementType() !== type || value.size === 0) {
      return VtArray._valueInitializedElement(type)
    }
    return value.get(0)
  }
  return VtArray._valueInitializedElement(type)
}

/** niInstanceAggregationSceneIndex.cpp:146-199. Data source for locator
 *  primvars:NAME:primvarValue for an instancer.
 *
 *  Extracts the values of the primvar of given name authored on the native
 *  instances realized by the instancer.
 *
 *  The template parameter T is the run-time element type _type. */
class _PrimvarValueDataSource extends HdTypedSampledDataSource<VtArray<unknown>> {
  static new(inputSceneIndex: HdSceneIndexBase, instances: _SdfPathSet, primvarName: string,
    type: TfType): _PrimvarValueDataSource {
    return new _PrimvarValueDataSource(inputSceneIndex, instances, primvarName, type)
  }

  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _instances: _SdfPathSet,
    private readonly _primvarName: string,
    private readonly _type: TfType,
  ) { super() }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.createArray(this.getTypedValue(shutterOffset))
  }

  GetContributingSampleTimesForInterval(_startTime: number, _endTime: number,
    _outSampleTimes: number[]): boolean {
    // TODO: Support motion blur
    return false
  }

  getTypedValue(_shutterOffset: number): VtArray<unknown> {
    const result = VtArray.ofSize<unknown>(this._instances.size, this._type,
      VtArray._valueInitializedElement(this._type))

    let i = 0
    for (const instance of this._instances.Sorted()) {
      result.set(i, _GetTypedPrimvarValue(
        this._inputSceneIndex, instance, this._primvarName, this._type))
      i++
    }
    return result
  }
}

/** niInstanceAggregationSceneIndex.cpp:201-273 (_PrimvarValueDataSourceFactory
 *  and _MakePrimvarValueDataSource). Examines type of primvar authored on the
 *  first instance to dispatch by type to create the correct primvar value data
 *  source for an instancer realizing the instances.
 *
 *  The VtVisitValue visitor makes a data source for every known value type
 *  T or VtArray<T> and, for other types, only for SdfAssetPath and SdfPath
 *  ("we make an exception for SdfPath primvars for skel:animationSource").
 *
 *  PLATFORM-DIVERGENCE(ni-primvar-value-type): a primvar value data source that
 *  returns a plain JS value (not a VtValue or VtArray) carries no type; no
 *  data source is made for it. */
function _MakePrimvarValueDataSource(inputSceneIndex: HdSceneIndexBase, instances: _SdfPathSet,
  primvarName: string): HdDataSourceBase | undefined {
  if (instances.empty()) {
    return undefined
  }
  const primPath = instances.begin()!
  const value = _GetPrimvarValue(inputSceneIndex, primPath, primvarName)

  const type = _GetValueElementType(value)
  if (!type) {
    return undefined
  }
  const typeName = type.getTypeName()
  if (VtGetKnownValueTypeIndex(type) < 0 && typeName !== 'SdfAssetPath' && typeName !== 'SdfPath') {
    return undefined
  }
  return _PrimvarValueDataSource.new(inputSceneIndex, instances, primvarName, type)
}

const _instanceInterpolationDs =
  HdRetainedTypedSampledDataSource.new<string>(HdPrimvarSchemaTokens.instance)

/** niInstanceAggregationSceneIndex.cpp:275-334. Container data source for
 *  locator primvars:NAME for an instancer.
 *
 *  primvarValue: obtained by taking the values of the primvar of given
 *  name authored on the native instances realized by this instancer
 *  to provide the primvar value.
 *  role: obtained by taking the role of the primvar authored on the
 *  first instance.
 *  interpolation: constant. */
class _PrimvarDataSource extends HdContainerDataSource {
  static new(inputSceneIndex: HdSceneIndexBase, instances: _SdfPathSet,
    primvarName: string): _PrimvarDataSource {
    return new _PrimvarDataSource(inputSceneIndex, instances, primvarName)
  }

  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _instances: _SdfPathSet,
    private readonly _primvarName: string,
  ) { super() }

  getNames(): string[] {
    return [HdPrimvarSchemaTokens.primvarValue,
      HdPrimvarSchemaTokens.interpolation,
      HdPrimvarSchemaTokens.role]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarSchemaTokens.primvarValue) {
      return _MakePrimvarValueDataSource(
        this._inputSceneIndex, this._instances, this._primvarName)
    }
    if (name === HdPrimvarSchemaTokens.interpolation) {
      return _instanceInterpolationDs
    }
    if (name === HdPrimvarSchemaTokens.role) {
      if (this._instances.empty()) {
        return undefined
      }
      const primPath = this._instances.begin()!
      return _GetPrimvarSchema(this._inputSceneIndex, primPath, this._primvarName).getRole()
    }
    return undefined
  }
}

/** niInstanceAggregationSceneIndex.cpp:336-360 */
function _Extract(sources: readonly (HdSampledDataSource | undefined)[],
  shutterOffset: number): VtArray<GfMatrix4d> {
  const result: GfMatrix4d[] = []
  for (const source of sources) {
    // Divergence: dynamic_cast<HdMatrixDataSource*> cannot check the value
    // type at run time; a GfMatrix4d value is accepted, anything else gives
    // the identity as upstream does for a failed cast.
    const value = source?.GetValue(shutterOffset)
    const matrix = value instanceof VtValue && !value.IsEmpty() ? value.UncheckedGet() : value
    result.push(matrix instanceof GfMatrix4d ? new GfMatrix4d(matrix) : new GfMatrix4d(1.0))
  }
  return new VtArray<GfMatrix4d>(result, VtValueTypes.GfMatrix4d)
}

/** niInstanceAggregationSceneIndex.cpp:362-414. Data source for locator
 *  primvars:hydra:instanceTransforms:primvarValue for an instancer.
 *
 *  Extracts the transforms of the native instances realized by the
 *  instancer. */
class _InstanceTransformPrimvarValueDataSource extends HdTypedSampledDataSource<VtArray<GfMatrix4d>> {
  static new(xformSources: (HdSampledDataSource | undefined)[]): _InstanceTransformPrimvarValueDataSource {
    return new _InstanceTransformPrimvarValueDataSource(xformSources)
  }

  private constructor(private readonly _xformSources: (HdSampledDataSource | undefined)[]) { super() }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.createArray(this.getTypedValue(shutterOffset))
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    return _HdGetMergedContributingSampleTimesForInterval(
      this._xformSources, startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: number): VtArray<GfMatrix4d> {
    // If this is for a native instance within a Usd point instancer's
    // prototype, this transform will include the prototype's
    // root transform.
    //
    // The instancer for this native instance has no transform and thus
    // does not include the prototype's root transform.
    //
    // Thus, prototype's root transform will be applied exactly once.
    return _Extract(this._xformSources, shutterOffset)
  }
}

/** niInstanceAggregationSceneIndex.cpp:416-470. Data source for locator
 *  primvars:hydra:instanceTransforms for an instancer.
 *
 *  primvarValue: transforms of native instances realized by the instancer.
 *  interpolation: instance.
 *  role: null. */
class _InstanceTransformPrimvarDataSource extends HdContainerDataSource {
  static new(inputSceneIndex: HdSceneIndexBase, instances: _SdfPathSet): _InstanceTransformPrimvarDataSource {
    return new _InstanceTransformPrimvarDataSource(inputSceneIndex, instances)
  }

  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _instances: _SdfPathSet,
  ) { super() }

  getNames(): string[] {
    return [HdPrimvarSchemaTokens.primvarValue,
      HdPrimvarSchemaTokens.interpolation,
      HdPrimvarSchemaTokens.role]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarSchemaTokens.interpolation) {
      return _instanceInterpolationDs
    }
    if (name === HdPrimvarSchemaTokens.primvarValue) {
      const xformSources: (HdSampledDataSource | undefined)[] = []
      for (const instance of this._instances.Sorted()) {
        const primSource = this._inputSceneIndex.getPrim(instance).dataSource
        xformSources.push(HdXformSchema.getFromParent(primSource).getMatrix())
      }

      return _InstanceTransformPrimvarValueDataSource.new(xformSources)
    }
    // Does the instanceTransform have a role?
    return undefined
  }
}

/** niInstanceAggregationSceneIndex.cpp:472-518. Data source for locator
 *  primvars for an instancer.
 *
 *  Uses above data sources for hydra:instanceTransforms and for constant
 *  primvars authored on the native instances realized by the instancer. */
class _PrimvarsDataSource extends HdContainerDataSource {
  static new(inputSceneIndex: HdSceneIndexBase, instances: _SdfPathSet): _PrimvarsDataSource {
    return new _PrimvarsDataSource(inputSceneIndex, instances)
  }

  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _instances: _SdfPathSet,
  ) { super() }

  getNames(): string[] {
    let result: string[] = []
    if (!this._instances.empty()) {
      result = _GetConstantPrimvarNames(this._inputSceneIndex, this._instances.begin()!)
    }
    result.push(HdInstancerTokens.instanceTransforms)
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdInstancerTokens.instanceTransforms) {
      return _InstanceTransformPrimvarDataSource.new(this._inputSceneIndex, this._instances)
    }
    if (!this._instances.empty()) {
      if (_IsConstantPrimvar(this._inputSceneIndex, this._instances.begin()!, name)) {
        return _PrimvarDataSource.new(this._inputSceneIndex, this._instances, name)
      }
    }
    return undefined
  }
}

/** niInstanceAggregationSceneIndex.cpp:520-529. [0, 1, ..., n-1]
 *  (VtArray<int> is a plain number[] in this port.) */
function _Range(n: number): number[] {
  const result: number[] = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    result[i] = i
  }
  return result
}

/** niInstanceAggregationSceneIndex.cpp:531-555 */
class _InstanceIndicesDataSource extends HdVectorDataSource {
  static new(instances: _SdfPathSet): _InstanceIndicesDataSource {
    return new _InstanceIndicesDataSource(instances)
  }

  private constructor(private readonly _instances: _SdfPathSet) { super() }

  getNumElements(): number {
    return 1
  }

  getElement(_index: number): HdDataSourceBase | undefined {
    const n = this._instances.size
    return new HdRetainedTypedSampledDataSource<number[]>(_Range(n), VtValueTypes.int)
  }
}

/** niInstanceAggregationSceneIndex.cpp:557-586 */
class _InstanceLocationsDataSource extends HdPathArrayDataSource {
  static new(instances: _SdfPathSet): _InstanceLocationsDataSource {
    return new _InstanceLocationsDataSource(instances)
  }

  private constructor(private readonly _instances: _SdfPathSet) { super() }

  GetContributingSampleTimesForInterval(_startTime: number, _endTime: number,
    _outSampleTimes: number[]): boolean {
    return false
  }

  getTypedValue(_shutterOffset: number): string[] {
    return [...this._instances.Sorted()]
  }
}

/** niInstanceAggregationSceneIndex.cpp:588-604 */
function _GetVisibility(sceneIndex: HdSceneIndexBase | undefined, primPath: string): boolean {
  if (!sceneIndex) {
    return true
  }

  const primDs = sceneIndex.getPrim(primPath).dataSource
  const ds = HdVisibilitySchema.getFromParent(primDs).getVisibility()
  if (!ds) {
    return true
  }
  return ds.getTypedValue(0.0)
}

/** niInstanceAggregationSceneIndex.cpp:606-618 (VtBoolArray is a plain
 *  boolean[] in this port). */
function _ComputeMask(sceneIndex: HdSceneIndexBase, instances: _SdfPathSet): boolean[] {
  const result: boolean[] = []
  for (const instance of instances.Sorted()) {
    result.push(_GetVisibility(sceneIndex, instance))
  }
  return result
}

/** niInstanceAggregationSceneIndex.cpp:620-664 */
class _InstancerTopologyDataSource extends HdContainerDataSource {
  static new(inputSceneIndex: HdSceneIndexBase, prototypePath: string,
    instances: _SdfPathSet): _InstancerTopologyDataSource {
    return new _InstancerTopologyDataSource(inputSceneIndex, prototypePath, instances)
  }

  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _prototypePath: string,
    private readonly _instances: _SdfPathSet,
  ) { super() }

  getNames(): string[] {
    return [HdInstancerTopologySchemaTokens.instanceIndices,
      HdInstancerTopologySchemaTokens.prototypes,
      HdInstancerTopologySchemaTokens.instanceLocations,
      HdInstancerTopologySchemaTokens.mask]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdInstancerTopologySchemaTokens.instanceIndices) {
      return _InstanceIndicesDataSource.new(this._instances)
    }
    if (name === HdInstancerTopologySchemaTokens.prototypes) {
      return HdRetainedTypedSampledDataSource.new<string[]>([this._prototypePath])
    }
    if (name === HdInstancerTopologySchemaTokens.instanceLocations) {
      return _InstanceLocationsDataSource.new(this._instances)
    }
    if (name === HdInstancerTopologySchemaTokens.mask) {
      return HdRetainedTypedSampledDataSource.new<boolean[]>(
        _ComputeMask(this._inputSceneIndex, this._instances))
    }
    return undefined
  }
}

/** niInstanceAggregationSceneIndex.cpp:666-728 */
class _InstancerPrimSource extends HdContainerDataSource {
  static new(inputSceneIndex: HdSceneIndexBase, enclosingPrototypeRoot: string,
    prototypePath: string, instances: _SdfPathSet, forNativePrototype: boolean): _InstancerPrimSource {
    return new _InstancerPrimSource(
      inputSceneIndex, enclosingPrototypeRoot, prototypePath, instances, forNativePrototype)
  }

  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _enclosingPrototypeRoot: string,
    private readonly _prototypePath: string,
    private readonly _instances: _SdfPathSet,
    private readonly _forNativePrototype: boolean,
  ) { super() }

  getNames(): string[] {
    return [HdInstancedBySchema.getSchemaToken(),
      HdInstancerTopologySchema.getSchemaToken(),
      HdPrimvarsSchema.getSchemaToken()]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdInstancedBySchema.getSchemaToken()) {
      // If this instancer is inside a point instanced prototype, use
      // the instancedBy schema from the prototype root so that this
      // instancer will be instanced by the the point instancer.
      const schema = HdInstancedBySchema.getFromParent(
        this._inputSceneIndex.getPrim(this._enclosingPrototypeRoot).dataSource)
      if (schema.isDefined()) {
        return schema.getContainer()
      }
      if (this._forNativePrototype) {
        // This instancer is itself within a native prototype which
        // in turn is instanced by an instancer. Use respective
        // instancedBy data source.
        return UsdImaging_NiPrototypeSceneIndex.getInstancedByDataSource()
      }
      return undefined
    }
    if (name === HdInstancerTopologySchema.getSchemaToken()) {
      return _InstancerTopologyDataSource.new(
        this._inputSceneIndex, this._prototypePath, this._instances)
    }
    if (name === HdPrimvarsSchema.getSchemaToken()) {
      return _PrimvarsDataSource.new(this._inputSceneIndex, this._instances)
    }
    return undefined
  }
}

/** niInstanceAggregationSceneIndex.cpp:730-764.
 *
 *  We can only group together native instances to be realized by the same
 *  instancer if each has the same set of constant primvars authored.
 *
 *  We thus include the set of constant primvars (and their roles) in the
 *  hash used to group the native instances.
 *
 *  This function is computing a hash based on the set of the names of the
 *  constant primvars and their roles. */
function _ComputeConstantPrimvarsRoleHash(primvarsSchema: HdPrimvarsSchema): string {
  // std::map<std::string, std::string>: TfHash visits a Map with string keys
  // in std::map order.
  const nameToRole = new Map<string, string>()

  for (const name of primvarsSchema.getPrimvarNames()) {
    const primvarSchema = primvarsSchema.getPrimvar(name)
    const interpolationSrc = primvarSchema.getInterpolation()
    if (interpolationSrc) {
      if (interpolationSrc.getTypedValue(0.0) === HdPrimvarSchemaTokens.constant) {
        let role = ''
        const roleSrc = primvarSchema.getRole()
        if (roleSrc) {
          role = roleSrc.getTypedValue(0.0)
        }
        nameToRole.set(name, role)
      }
    }
  }

  if (nameToRole.size === 0) {
    return 'NoPrimvars'
  }

  return `Primvars${TfHashCombine(nameToRole).toString(16)}`
}

/** niInstanceAggregationSceneIndex.cpp:766-795.
 *
 *  We can only group together native instances if the same set of constant
 *  primvars is authored and if the data sources at the given names have the
 *  same data. We construct a key accordingly.
 *
 *  instanceDataSourceNames typically includes material binding, purpose and
 *  model.
 *
 *  Note that instanceDataSourceNames should not include the primvars, xform or
 *  visibility as these turn into instance interpolated primvars or
 *  the instancer topology's mask. */
function _ComputeBindingHash(primSource: HdContainerDataSource,
  instanceDataSourceNames: readonly string[]): string {
  let result = _ComputeConstantPrimvarsRoleHash(HdPrimvarsSchema.getFromParent(primSource))

  for (const name of instanceDataSourceNames) {
    const ds = primSource.Get(name)
    if (ds) {
      result += `_${name}${BigInt.asUintN(64, BigInt(HdDataSourceHash(ds, 0.0, 0.0))).toString(16)}`
    }
  }

  return result
}

/** niInstanceAggregationSceneIndex.cpp:797-808. Gives niPrototypePath from
 *  UsdImagingUsdPrimInfoSchema. */
function _GetUsdPrototypePath(primSource: HdContainerDataSource | undefined): string {
  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(primSource)
  const pathDs = schema.getNiPrototypePath()
  if (!pathDs) {
    return ''
  }
  return pathDs.getTypedValue(0.0)
}

/** niInstanceAggregationSceneIndex.cpp:810-819. Gives the name of
 *  niPrototypePath from UsdImagingUsdPrimInfoSchema. */
function _GetUsdPrototypeName(primSource: HdContainerDataSource | undefined): string {
  const prototypePath = _GetUsdPrototypePath(primSource)
  if (prototypePath === '') {
    return ''
  }
  return _GetNameToken(prototypePath)
}

/** niInstanceAggregationSceneIndex.cpp:821-835 */
function _GetPrototypeRoot(primSource: HdContainerDataSource | undefined): string {
  const schema = HdInstancedBySchema.getFromParent(primSource)
  const ds = schema.getPrototypeRoots()
  if (!ds) {
    return ''
  }
  const result = _ToPathArray(ds.getTypedValue(0.0))
  if (result.length === 0) {
    return ''
  }
  return result[0]!
}

/** niInstanceAggregationSceneIndex.cpp:837-859. Make a partial copy of the
 *  prim data source of a native instance using instanceDataSourceNames. */
function _MakeBindingCopy(primSource: HdContainerDataSource | undefined,
  instanceDataSourceNames: readonly string[]): HdContainerDataSource {
  const names: string[] = []
  const dataSources: HdDataSourceBase[] = []

  for (const name of instanceDataSourceNames) {
    const ds = primSource?.Get(name)
    if (ds) {
      names.push(name)
      dataSources.push(HdMakeStaticCopy(ds)!)
    }
  }

  return HdRetainedContainerDataSource.new(names, dataSources)
}

/** niInstanceAggregationSceneIndex.cpp:861-909 */
class _InstanceInfo {
  // The root of the prototype that the instance is in.
  enclosingPrototypeRoot = ''
  // The hash of the relevant bindings of an instance (e.g. material
  // bindings).
  bindingHash = ''
  // The name of the Usd prototype this instance is instancing.
  prototypeName = ''

  isInstance(): boolean { return this.prototypeName !== '' }

  // A path like /MyPiPrototype/UsdNiPropagtedPrototypes/Binding312...436
  // that serves for all instancers of instances with the same, e.g.,
  // material binding.
  getBindingPrimPath(): string {
    return _AppendChild(
      _AppendChild(this.enclosingPrototypeRoot, UsdImagingTokens.niPropagatedPrototypesScope),
      this.bindingHash)
  }

  // A path like /MyPiPrototype/UsdNiPropagtedPrototypes/Binding312...436/__Prototype_1
  // that is the parent prim for the instancer for a particular USD
  // prototype.
  getPropagatedPrototypeBase(): string {
    return _AppendChild(this.getBindingPrimPath(), this.prototypeName)
  }

  // A path like /MyPiPrototype/UsdNiPropagtedPrototypes/Binding312...436/__Prototype_1/UsdNiInstancer
  // that is where the instancer actually is.
  getInstancerPath(): string {
    return _AppendChild(this.getPropagatedPrototypeBase(),
      UsdImaging_NiPrototypeSceneIndexTokens.instancer)
  }

  // A path like /MyPiPrototype/UsdNiPropagtedPrototypes/Binding312...436/__Prototype_1/UsdNiInstancer/UsdNiPrototype
  // the path where the propagating scene index needs to insert a copy
  // of the USD prototype.
  getPrototypePath(): string {
    return _AppendChild(this.getInstancerPath(),
      UsdImaging_NiPrototypeSceneIndexTokens.prototype)
  }
}

type _Operation =
  | { kind: 'dirty'; dirtyLocators: HdDataSourceLocatorSet }
  | { kind: 'add'; prim: HdSceneIndexPrim }
  | { kind: 'remove' }

/** niInstanceAggregationSceneIndex.cpp:911-1017. A helper to batch
 *  operations to the HdRetainedSceneIndex.
 *
 *  Divergence: upstream is RAII (the batched operations are sent in the
 *  destructor); here callers call Flush() where the C++ object goes out of
 *  scope. */
class _RetainedSceneIndexOperations {
  // std::map<SdfPath, _Operation>
  private readonly _operations = new Map<string, _Operation>()

  constructor(private readonly _retainedSceneIndex: HdRetainedSceneIndex) {}

  /** niInstanceAggregationSceneIndex.cpp:922-969 (the destructor). */
  flush(): void {
    // Convert batched operations to HdRetainedSceneIndex calls.
    const addedEntries: HdRetainedAddedPrimEntry[] = []
    const removedEntries: RemovedPrimEntry[] = []
    const dirtiedEntries: HdRetainedDirtiedPrimEntry[] = []

    for (const path of _SortedKeys(this._operations)) {
      const operation = this._operations.get(path)!
      switch (operation.kind) {
        case 'dirty':
          dirtiedEntries.push({ primPath: path, dirtyLocators: operation.dirtyLocators })
          break
        case 'add':
          addedEntries.push({
            primPath: path, primType: operation.prim.primType,
            dataSource: operation.prim.dataSource,
          })
          break
        case 'remove':
          removedEntries.push({ primPath: path })
          break
        default:
          TF_CODING_ERROR('Uncaught type')
      }
    }
    this._operations.clear()

    if (addedEntries.length > 0) {
      this._retainedSceneIndex.addPrims(addedEntries)
    }

    if (removedEntries.length > 0) {
      this._retainedSceneIndex.removePrims(removedEntries)
    }

    if (dirtiedEntries.length > 0) {
      this._retainedSceneIndex.dirtyPrims(dirtiedEntries)
    }
  }

  addPrim(primPath: string, prim: HdSceneIndexPrim): void {
    // Force!
    this._operations.set(primPath, { kind: 'add', prim })
  }

  /// Note that - unlike the retained scene index - this does not remove
  /// the ancestors of primPath. You need to explicitly delete the
  /// ancestor paths as well for correct operation!
  removePrim(primPath: string): void {
    // Force!
    this._operations.set(primPath, { kind: 'remove' })
  }

  dirtyPrim(primPath: string, dirtyLocators: HdDataSourceLocatorSet): void {
    // Ensure that default c'tor gives _DirtyPrim (std::variant default).
    let operation = this._operations.get(primPath)
    if (!operation) {
      operation = { kind: 'dirty', dirtyLocators: new HdDataSourceLocatorSet() }
      this._operations.set(primPath, operation)
    }
    // Do not force since add and remove is stronger than dirty!
    if (operation.kind === 'dirty') {
      operation.dirtyLocators.insert(dirtyLocators)
    }
  }
}

/** niInstanceAggregationSceneIndex.cpp:1088-1094 */
const enum _RemovalLevel {
  None = 0,
  Instance = 1,
  Instancer = 2,
  BindingScope = 3,
  EnclosingPrototypeRoot = 4,
}

/** niInstanceAggregationSceneIndex.cpp:1167-1184. Compute which dirtied data
 *  source locators force us re-aggregating the native instance. */
function _ComputeResyncLocators(instanceDataSourceNames: readonly string[]): HdDataSourceLocatorSet {
  const result = new HdDataSourceLocatorSet()
  // The enclosing scope of the native instance might have changed.
  result.insert(
    HdInstancedBySchema.getDefaultLocator().append(HdInstancedBySchemaTokens.prototypeRoots))
  // A data source used to determine which instances can be
  // aggregated has changed.
  for (const name of instanceDataSourceNames) {
    result.insert(new HdDataSourceLocator(name))
  }
  return result
}

/** niInstanceAggregationSceneIndex.cpp:1214-1236. Given a set of data source
 *  locators, examine the ones relating to primvars. If only the values of the
 *  primvars change, record the corresponding data source locators. If more
 *  than the values change, set the needsResync flag to indicate that
 *  structural changes need to happen, that is the native instances need to be
 *  grouped differently. Returns needsResync. */
function _GetPrimvarValueLocatorsAndNeedsResyncFlag(locators: HdDataSourceLocatorSet,
  primvarValueLocators: HdDataSourceLocatorSet): boolean {
  for (const locator of locators.intersection(HdPrimvarsSchema.getDefaultLocator())) {
    if (locator.getElementCount() >= 3 &&
        locator.getElement(2) === HdPrimvarSchemaTokens.primvarValue) {
      primvarValueLocators.insert(locator)
    } else {
      return true
    }
  }
  return false
}

/** niInstanceAggregationSceneIndex.cpp:1353-1434. USD-12324
 *  Lazily normalizes SdfPath values in a native instance's binding data
 *  sources so that structurally-equivalent instances produce the same
 *  binding hash. This does on-the-fly what a prebuilt PcpMapFunction would
 *  do, but folded into the single HdDataSourceHash traversal (avoiding a
 *  separate pass that recurses the whole subtree to collect paths and
 *  build a map function, which is the alternative of using
 *  UsdImagingRerootingContainerDataSource). */
class _BindingHashPathTranslator {
  // Cache of prototype name per ancestor path to avoid redundant
  // GetPrim() calls when multiple paths share ancestor segments (e.g.
  // /A/Rig/skeleton and /A/Rig/anim both walk through /A/Rig). An empty
  // token means "checked, not a native instance". Shared across all path
  // data sources in one prim's hash walk, which is single-threaded and
  // transient, so no lock is needed.
  readonly ancestorCache = new Map<string, string>()

  constructor(
    readonly primPath: string,
    readonly prototypeName: string,
    readonly inputScene: HdSceneIndexBase,
  ) {}

  /** niInstanceAggregationSceneIndex.cpp:1380-1434 */
  Translate(src: string): string {
    if (src === '') {
      return src
    }

    // Descendant of primPath (including primPath itself): reroot to the
    // prototype. Only the part relative to primPath is important; the
    // prototype name distinguishes the same relative binding across
    // different prototypes.
    if (_HasPrefix(src, this.primPath)) {
      return _ReplacePrefix(src, this.primPath, _AppendChild(_AbsoluteRootPath, this.prototypeName))
    }

    // Non-descendant path: walk ancestors to find the nearest native
    // instance root and reroot it to its prototype root. Keying on the
    // native instance root (not the original path) means prefix rerooting
    // handles all sub-paths automatically (e.g. rerooting /A/Rig also
    // covers /A/Rig/skeleton).
    for (let ancestor = src; ancestor !== '/' && ancestor !== ''; ancestor = _GetParentPath(ancestor)) {
      let nativeProto = ''
      const cached = this.ancestorCache.get(ancestor)
      if (cached !== undefined) {
        nativeProto = cached
      } else {
        const prim = this.inputScene.getPrim(ancestor)
        if (prim.dataSource) {
          nativeProto = _GetUsdPrototypeName(prim.dataSource)
        }
        this.ancestorCache.set(ancestor, nativeProto)
      }
      if (nativeProto !== '') {
        return _ReplacePrefix(src, ancestor, _AppendChild(_AbsoluteRootPath, nativeProto))
      }
    }

    // We ignore the case of having a namespace ancestor of primPath that is not
    // a native instance (e.g. /A/Rig's ModelAPI.modelPath points to its parent
    // /A in UsdModelAPI because Rig itself is not a model). Otherwise it would
    // be handled here by an "if (primPath.HasPrefix(src))" case.
    // Instead we follow the deferred skinning pattern by relocating it to the
    // model:modelPath primvar in UsdImaging_NiPrototypePropagatingSceneIndex.
    // See the comment there for more details.

    // Truly absolute cross-scene reference that must match exactly: leave
    // unchanged.
    return src
  }
}

/** niInstanceAggregationSceneIndex.cpp:1441-1483 */
class _TranslatingPathDataSource extends HdPathDataSource {
  static new(inputDataSource: HdSampledDataSource, translator: _BindingHashPathTranslator): _TranslatingPathDataSource {
    return new _TranslatingPathDataSource(inputDataSource, translator)
  }

  private constructor(
    private readonly _inputDataSource: HdSampledDataSource,
    private readonly _translator: _BindingHashPathTranslator,
  ) { super() }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    return this._inputDataSource.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: number): string {
    return this._translator.Translate(_ToPath(this._inputDataSource.GetValue(shutterOffset)))
  }
}

/** niInstanceAggregationSceneIndex.cpp:1485-1531 */
class _TranslatingPathArrayDataSource extends HdPathArrayDataSource {
  static new(inputDataSource: HdSampledDataSource,
    translator: _BindingHashPathTranslator): _TranslatingPathArrayDataSource {
    return new _TranslatingPathArrayDataSource(inputDataSource, translator)
  }

  private constructor(
    private readonly _inputDataSource: HdSampledDataSource,
    private readonly _translator: _BindingHashPathTranslator,
  ) { super() }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    return this._inputDataSource.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: number): string[] {
    const result = [..._ToPathArray(this._inputDataSource.GetValue(shutterOffset))]
    for (let i = 0; i < result.length; i++) {
      result[i] = this._translator.Translate(result[i]!)
    }
    return result
  }
}

/** niInstanceAggregationSceneIndex.cpp:1533-1558 */
class _TranslatingVectorDataSource extends HdVectorDataSource {
  static new(inputDataSource: HdVectorDataSource, translator: _BindingHashPathTranslator): _TranslatingVectorDataSource {
    return new _TranslatingVectorDataSource(inputDataSource, translator)
  }

  private constructor(
    private readonly _inputDataSource: HdVectorDataSource,
    private readonly _translator: _BindingHashPathTranslator,
  ) { super() }

  getNumElements(): number {
    return this._inputDataSource.getNumElements()
  }

  getElement(element: number): HdDataSourceBase | undefined {
    return _CreateTranslatingDataSource(this._inputDataSource.getElement(element), this._translator)
  }
}

/** niInstanceAggregationSceneIndex.cpp:1560-1593 */
class _TranslatingContainerDataSource extends HdContainerDataSource {
  static new(inputDataSource: HdContainerDataSource | undefined,
    translator: _BindingHashPathTranslator): _TranslatingContainerDataSource {
    return new _TranslatingContainerDataSource(inputDataSource, translator)
  }

  private constructor(
    private readonly _inputDataSource: HdContainerDataSource | undefined,
    private readonly _translator: _BindingHashPathTranslator,
  ) { super() }

  getNames(): string[] {
    if (!this._inputDataSource) {
      return []
    }
    return this._inputDataSource.getNames()
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (!this._inputDataSource) {
      return undefined
    }
    return _CreateTranslatingDataSource(this._inputDataSource.Get(name), this._translator)
  }
}

/** An SdfPath value as a string ('' when the value is not a path). */
function _ToPath(value: unknown): string {
  const v = value instanceof VtValue ? (value.IsEmpty() ? undefined : value.UncheckedGet()) : value
  if (typeof v === 'string') return v
  return v !== undefined && v !== null ? String(v) : ''
}

/** A VtArray<SdfPath> value as a string[]. */
function _ToPathArray(value: unknown): readonly string[] {
  const v = value instanceof VtValue ? (value.IsEmpty() ? undefined : value.UncheckedGet()) : value
  if (Array.isArray(v)) return v.map(p => String(p))
  if (v instanceof VtArray) return v.toArray().map(p => String(p))
  return []
}

const _IsPathString = (v: unknown): boolean => typeof v === 'string' && v.startsWith('/')

/** Whether a sampled data source holds an SdfPath (1) or VtArray<SdfPath>
 *  (2), or neither (0).
 *
 *  PLATFORM-DIVERGENCE(hd-typed-cast): upstream casts to
 *  HdTypedSampledDataSource<SdfPath> / <VtArray<SdfPath>>. Element types do
 *  not exist at run time here: subclasses of HdPathDataSource /
 *  HdPathArrayDataSource are recognized, a VtValue by its type name, and
 *  otherwise a value is taken to be a path if it is a string that starts
 *  with '/' (tokens and identifiers never do). */
function _PathKind(ds: HdSampledDataSource): 0 | 1 | 2 {
  if (ds instanceof HdPathDataSource) return 1
  if (ds instanceof HdPathArrayDataSource) return 2
  const value = ds.GetValue(0.0)
  if (value instanceof VtValue) {
    const name = value.getTypeName()
    if (name === 'SdfPath') return 1
    if (value.isArrayValued() && value.getElementType().getTypeName() === 'SdfPath') return 2
    return 0
  }
  if (_IsPathString(value)) return 1
  if (Array.isArray(value) && value.length > 0 && value.every(_IsPathString)) return 2
  return 0
}

/** niInstanceAggregationSceneIndex.cpp:1595-1628 */
function _CreateTranslatingDataSource(inputDataSource: HdDataSourceBase | undefined,
  translator: _BindingHashPathTranslator): HdDataSourceBase | undefined {
  if (!inputDataSource) {
    return undefined
  }

  if (inputDataSource instanceof HdContainerDataSource) {
    return _TranslatingContainerDataSource.new(inputDataSource, translator)
  }

  if (inputDataSource instanceof HdVectorDataSource) {
    return _TranslatingVectorDataSource.new(inputDataSource, translator)
  }

  if (inputDataSource instanceof HdSampledDataSource) {
    const kind = _PathKind(inputDataSource)
    if (kind === 1) {
      return _TranslatingPathDataSource.new(inputDataSource, translator)
    }
    if (kind === 2) {
      return _TranslatingPathArrayDataSource.new(inputDataSource, translator)
    }
  }

  return inputDataSource
}

/** niInstanceAggregationSceneIndex.cpp:1019-1165, 1186-2086 */
class _InstanceObserver implements HdSceneIndexObserver {
  private readonly _retainedSceneIndex: HdRetainedSceneIndex
  // If dirtied, we need to re-aggregate the native instance.
  private readonly _resyncLocators: HdDataSourceLocatorSet
  // _Map2 = std::map<SdfPath, std::map<TfToken, std::map<TfToken, SdfPathSet>>>
  private readonly _infoToInstance = new Map<string, Map<string, Map<string, _SdfPathSet>>>()
  private readonly _instanceToInfo = new Map<string, _InstanceInfo>()

  // _instancerToInstanceToIndex is populated lazily (per
  // instancer). That is, it has an entry for each instancer,
  // but the entry might be a nullptr until a client
  // has queried an instance for its instance data source.
  // We also only send out dirty entries for instances if
  // the entry was populated.
  //
  // This laziness avoids an N^2 invalidation behavior during
  // population. That is: if we added the N-th instance, we
  // potentially need to send out a dirty notice for every
  // previous instance since its id might have been affected.
  private readonly _instancerToInstanceToIndex = new Map<string, Map<string, number> | undefined>()

  /** niInstanceAggregationSceneIndex.cpp:1186-1198 */
  constructor(
    private readonly _inputScene: HdSceneIndexBase,
    private readonly _forNativePrototype: boolean,
    private readonly _instanceDataSourceNames: readonly string[],
  ) {
    this._retainedSceneIndex = HdRetainedSceneIndex.new()
    this._resyncLocators = _ComputeResyncLocators(_instanceDataSourceNames)
    this._populate()
    this._inputScene.addObserver(this)
  }

  getRetainedSceneIndex(): HdRetainedSceneIndex {
    return this._retainedSceneIndex
  }

  getInputScene(): HdSceneIndexBase {
    return this._inputScene
  }

  /** Stands for the destructor: stop observing the input scene. */
  _destroy(): void {
    this._inputScene.removeObserver(this)
  }

  /** niInstanceAggregationSceneIndex.cpp:1200-1212 */
  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const retainedSceneIndexOperations = new _RetainedSceneIndexOperations(this._retainedSceneIndex)

    for (const entry of entries) {
      const path = entry.primPath
      this._resyncPrim(path, retainedSceneIndexOperations)
    }
    retainedSceneIndexOperations.flush()
  }

  /** niInstanceAggregationSceneIndex.cpp:1238-1308 */
  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (this._instanceToInfo.size === 0) {
      return
    }

    const retainedSceneIndexOperations = new _RetainedSceneIndexOperations(this._retainedSceneIndex)

    for (const entry of entries) {
      const path = entry.primPath
      const locators = entry.dirtyLocators

      if (locators.intersects(this._resyncLocators)) {
        this._resyncPrim(path, retainedSceneIndexOperations)
        continue
      }

      {
        if (locators.intersects(_xformLocators())) {
          this._dirtyInstancerForInstance(
            path, _instanceTransformLocators(), retainedSceneIndexOperations)
        }
      }

      {
        const primvarValueLocators = new HdDataSourceLocatorSet()
        const needsResync = _GetPrimvarValueLocatorsAndNeedsResyncFlag(locators, primvarValueLocators)
        if (needsResync) {
          // The set of constant primvars might have changed
          // (e.g., because the interpolation of a primvar has
          // changed). We potentially need to put this instance
          // into a different group.
          this._resyncPrim(path, retainedSceneIndexOperations)
        } else if (!primvarValueLocators.IsEmpty()) {
          // Only the primvar values have changed. Update instancer.
          this._dirtyInstancerForInstance(path, primvarValueLocators, retainedSceneIndexOperations)
        }
      }

      {
        if (locators.intersects(HdVisibilitySchema.getDefaultLocator())) {
          this._dirtyInstancerForInstance(path, _maskLocators(), retainedSceneIndexOperations)
        }
      }
    }
    retainedSceneIndexOperations.flush()
  }

  /** niInstanceAggregationSceneIndex.cpp:1310-1331 */
  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const retainedSceneIndexOperations = new _RetainedSceneIndexOperations(this._retainedSceneIndex)

    if (this._instanceToInfo.size === 0) {
      retainedSceneIndexOperations.flush()
      return
    }

    // _instanceToInfo in its (std::map) SdfPath order, once: removing
    // instances only erases entries.
    const instancePaths = _SortedKeys(this._instanceToInfo)
    for (const entry of entries) {
      const path = entry.primPath
      // _instanceToInfo.lower_bound(path) and the following entries
      // having path as prefix.
      for (let i = _LowerBound(instancePaths, path);
        i < instancePaths.length && _HasPrefix(instancePaths[i]!, path); i++) {
        const instancePath = instancePaths[i]!
        if (this._instanceToInfo.has(instancePath)) {
          this._removeInstance(instancePath, retainedSceneIndexOperations)
        }
      }
    }
    retainedSceneIndexOperations.flush()
  }

  /** niInstanceAggregationSceneIndex.cpp:1333-1338 */
  primsRenamed(sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void {
    _ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this)
  }

  /** niInstanceAggregationSceneIndex.cpp:1340-1351 */
  private _populate(): void {
    const retainedSceneIndexOperations = new _RetainedSceneIndexOperations(this._retainedSceneIndex)

    for (const primPath of new HdSceneIndexPrimView(this._inputScene, _AbsoluteRootPath)) {
      this._addPrim(primPath, retainedSceneIndexOperations)
    }
    retainedSceneIndexOperations.flush()
  }

  /** niInstanceAggregationSceneIndex.cpp:1630-1687 */
  private _getInfo(primPath: string, primSource?: HdContainerDataSource): _InstanceInfo {
    if (arguments.length < 2) {
      primSource = this._inputScene.getPrim(primPath).dataSource
    }

    const result = new _InstanceInfo()

    result.prototypeName = _GetUsdPrototypeName(primSource)
    if (result.prototypeName === '') {
      return result
    }

    result.enclosingPrototypeRoot = _GetPrototypeRoot(primSource)
    if (result.enclosingPrototypeRoot === '') {
      if (this._forNativePrototype) {
        result.enclosingPrototypeRoot = UsdImaging_NiPrototypeSceneIndex.getPrototypePath()
      } else {
        result.enclosingPrototypeRoot = _AbsoluteRootPath
      }
    }
    result.bindingHash = _ComputeBindingHash(
      // If this instance at primPath, say </MyInstance>, has a binding that
      // is one of its namespace descendents, say </MyInstance/MyMaterial>,
      // then the binding is really pointing to <MyMaterial> in the prototype.
      //
      // In other words, only the part relative to primPath is important for
      // the binding in such a case.
      //
      // However, we do need to regard their bindings as distinct if both
      // </MyInstance> and </MyInstance2> bind the same relative material
      // <MyMaterial> but in two different prototypes.
      //
      // Thus, we do include the prototype name in the path translation.
      //
      // Beyond descendant paths, the translator also covers non-descendant
      // paths (siblings, ancestors) that are themselves native instances,
      // mapping them to their prototype roots.  This ensures
      // structurally-equivalent instances whose bindings reference
      // out-of-prototype-tree prims (e.g. a sibling skeleton scope) produce
      // the same binding hash and can be aggregated. The translation is
      // applied lazily during the hash walk, avoiding a separate pass to
      // recurse the subtree and build a PcpMapFunction.
      _TranslatingContainerDataSource.new(
        primSource,
        new _BindingHashPathTranslator(primPath, result.prototypeName, this._inputScene)),
      this._instanceDataSourceNames)

    return result
  }

  /** niInstanceAggregationSceneIndex.cpp:1689-1769 */
  private _addInstance(primPath: string, info: _InstanceInfo,
    retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    let bindingHashToPrototypeNameToInstances = this._infoToInstance.get(info.enclosingPrototypeRoot)
    if (!bindingHashToPrototypeNameToInstances) {
      bindingHashToPrototypeNameToInstances = new Map()
      this._infoToInstance.set(info.enclosingPrototypeRoot, bindingHashToPrototypeNameToInstances)
    }

    let prototypeNameToInstances = bindingHashToPrototypeNameToInstances.get(info.bindingHash)
    if (!prototypeNameToInstances) {
      prototypeNameToInstances = new Map()
      bindingHashToPrototypeNameToInstances.set(info.bindingHash, prototypeNameToInstances)
    }

    if (prototypeNameToInstances.size === 0) {
      retainedSceneIndexOperations.addPrim(
        info.getBindingPrimPath(),
        {
          primType: '',
          // No need to translate or reroot dataSource here.
          // The downstream instanceProxyPathTranslationSceneIndex
          // will handle it.
          dataSource: _MakeBindingCopy(this._inputScene.getPrim(primPath).dataSource,
            this._instanceDataSourceNames),
        })
    }

    const instancerPath = info.getInstancerPath()

    // Update this map prior to sending notification below.
    this._instanceToInfo.set(primPath, info)

    let instances = prototypeNameToInstances.get(info.prototypeName)
    if (instances) {
      // Update instances list prior to sending notification.
      instances.insert(primPath)

      retainedSceneIndexOperations.dirtyPrim(instancerPath, _instanceIndicesAndPrimvarsLocators())
    } else {
      instances = new _SdfPathSet()
      prototypeNameToInstances.set(info.prototypeName, instances)

      // Update instances list prior to sending notification.
      instances.insert(primPath)

      // Add propagated prototype base prim
      retainedSceneIndexOperations.addPrim(
        info.getPropagatedPrototypeBase(),
        { primType: '', dataSource: HdRetainedContainerDataSource.new([], []) })

      // instancer which is child of base prim.
      retainedSceneIndexOperations.addPrim(
        instancerPath,
        {
          primType: HdPrimTypeTokens.instancer,
          dataSource: _InstancerPrimSource.new(
            this._inputScene,
            info.enclosingPrototypeRoot,
            info.getPrototypePath(),
            instances,
            this._forNativePrototype),
        })
    }

    // Add (lazy) instance data source to instance.
    retainedSceneIndexOperations.addPrim(
      primPath,
      { primType: '', dataSource: this._getDataSourceForInstance(primPath) })

    // Create entry for instancer if not already present.
    //
    // Dirty instances (if previous non-null entry existed)
    // since the indices of potentially every other instance realized
    // by this instancer might have changed.
    if (!this._instancerToInstanceToIndex.has(instancerPath)) {
      this._instancerToInstanceToIndex.set(instancerPath, undefined)
    }
    this._dirtyInstancesAndResetPointer(instancerPath, retainedSceneIndexOperations)
  }

  /** niInstanceAggregationSceneIndex.cpp:1771-1780 */
  private _addPrim(primPath: string, retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    const info = this._getInfo(primPath)
    if (info.isInstance()) {
      this._addInstance(primPath, info, retainedSceneIndexOperations)
    }
  }

  /** niInstanceAggregationSceneIndex.cpp:1782-1791 */
  private _removePrim(primPath: string, retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    if (this._instanceToInfo.has(primPath)) {
      this._removeInstance(primPath, retainedSceneIndexOperations)
    }
  }

  /** niInstanceAggregationSceneIndex.cpp:1793-1800 */
  private _resyncPrim(primPath: string, retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    this._removePrim(primPath, retainedSceneIndexOperations)
    this._addPrim(primPath, retainedSceneIndexOperations)
  }

  /** niInstanceAggregationSceneIndex.cpp:1802-1862. Takes the instance path
   *  instead of an iterator into _instanceToInfo. */
  private _removeInstance(instancePath: string,
    retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    const info = this._instanceToInfo.get(instancePath)!
    const instancerPath = info.getInstancerPath()

    const level = this._removeInstanceFromInfoToInstance(instancePath, info)

    if (level > _RemovalLevel.None) {
      // Remove instance data source we added in _AddInstance.
      retainedSceneIndexOperations.removePrim(instancePath)
    }

    if (level === _RemovalLevel.Instance) {
      // Instancer's data have changed because we removed
      // one of its instances.
      retainedSceneIndexOperations.dirtyPrim(instancerPath, _instanceIndicesAndPrimvarsLocators())

      // The indices of potentially every other instance realized
      // by this instancer might have changed.
      if (this._instancerToInstanceToIndex.has(instancerPath)) {
        this._dirtyInstancesAndResetPointer(instancerPath, retainedSceneIndexOperations)
      }
    }

    if (level >= _RemovalLevel.Instancer) {
      // Last instance for this instancer disappeared.
      // Remove instancer.
      retainedSceneIndexOperations.removePrim(instancerPath)
      // And its parent.
      retainedSceneIndexOperations.removePrim(info.getPropagatedPrototypeBase())
      // And corresponding entry from map caching
      // instance indices.
      this._instancerToInstanceToIndex.delete(instancerPath)
    }

    if (level >= _RemovalLevel.BindingScope) {
      // The last instancer under the prim grouping instancers
      // by material binding, ... has disappeared.
      // Remove grouping prim.
      retainedSceneIndexOperations.removePrim(info.getBindingPrimPath())
    }

    this._instanceToInfo.delete(instancePath)
  }

  /** niInstanceAggregationSceneIndex.cpp:1864-1909.
   *
   *  Given path of an instance and its info,
   *  removes corresponding entry from _infoToInstance map.
   *  The map is nested several levels deep and the function
   *  will erase entries that have become empty. The return
   *  value describes how deep this erasure was. */
  private _removeInstanceFromInfoToInstance(primPath: string, info: _InstanceInfo): _RemovalLevel {
    const it0 = this._infoToInstance.get(info.enclosingPrototypeRoot)
    if (!it0) {
      return _RemovalLevel.None
    }

    {
      const it1 = it0.get(info.bindingHash)
      if (!it1) {
        return _RemovalLevel.None
      }

      {
        const it2 = it1.get(info.prototypeName)
        if (!it2) {
          return _RemovalLevel.None
        }

        it2.erase(primPath)

        if (!it2.empty()) {
          return _RemovalLevel.Instance
        }

        it1.delete(info.prototypeName)
      }

      if (it1.size > 0) {
        return _RemovalLevel.Instancer
      }

      it0.delete(info.bindingHash)
    }

    if (it0.size > 0) {
      return _RemovalLevel.BindingScope
    }

    this._infoToInstance.delete(info.enclosingPrototypeRoot)

    return _RemovalLevel.EnclosingPrototypeRoot
  }

  /** niInstanceAggregationSceneIndex.cpp:1911-1931. Takes the instancer path
   *  whose _instancerToInstanceToIndex entry is the pointer.
   *
   *  Reset given pointer to nullptr. But before that, send
   *  prim dirtied for all instances. The data source locator
   *  of the prim dirtied message will be instance.
   *
   *  This is called when instances have been added or removed
   *  to instancers to account for the fact that the id
   *  of potentially every instance might have changed. */
  private _dirtyInstancesAndResetPointer(instancerPath: string,
    retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    const original = this._instancerToInstanceToIndex.get(instancerPath)
    if (!original) {
      return
    }

    // Invalidate pointer before sending clients a prim dirty so
    // that a prim dirty handler wouldn't pick up the stale data.
    this._instancerToInstanceToIndex.set(instancerPath, undefined)

    for (const instance of _SortedKeys(original)) {
      retainedSceneIndexOperations.dirtyPrim(instance, _instanceLocators())
    }
  }

  /** niInstanceAggregationSceneIndex.cpp:1933-1947 */
  private _dirtyInstancerForInstance(instance: string, locators: HdDataSourceLocatorSet,
    retainedSceneIndexOperations: _RetainedSceneIndexOperations): void {
    const info = this._instanceToInfo.get(instance)
    if (!info) {
      return
    }

    const instancer = info.getInstancerPath()

    retainedSceneIndexOperations.dirtyPrim(instancer, locators)
  }

  /** niInstanceAggregationSceneIndex.cpp:1949-1982. Get prim data source for
   *  the named USD instance. */
  private _getDataSourceForInstance(primPath: string): HdContainerDataSource {
    // Upstream holds a weak pointer to the observer here to avoid a
    // reference cycle (cpp:1953-1968); JavaScript collects the cycle.

    // PrimSource for instance
    return HdRetainedContainerDataSource.new(
      [HdInstanceSchema.getSchemaToken()],
      [HdLazyContainerDataSource.new(() => this._getInstanceSchemaDataSource(primPath))])
  }

  /** niInstanceAggregationSceneIndex.cpp:1984-2010. Get data source for
   *  instance data source locator for an instance. */
  private _getInstanceSchemaDataSource(primPath: string): HdContainerDataSource | undefined {
    const info = this._instanceToInfo.get(primPath)
    if (!info) {
      return undefined
    }

    // The instance aggregation scene index never generates an
    // instancer with more than one prototype.
    return new HdInstanceSchema.Builder()
      .setInstancer(HdRetainedTypedSampledDataSource.new<string>(info.getInstancerPath()) as HdPathDataSource)
      .setPrototypeIndex(_prototypeIndexDs())
      .setInstanceIndex(new HdRetainedTypedSampledDataSource<number>(
        this._getInstanceIndex(info, primPath), VtValueTypes.int))
      .build()
  }

  /** niInstanceAggregationSceneIndex.cpp:2012-2030. Given path of an
   *  instance and its info, get its index. */
  private _getInstanceIndex(info: _InstanceInfo, instancePath: string): number {
    const instanceToIndex = this._getInstanceToIndex(info)
    if (!instanceToIndex) {
      return -1
    }

    const index = instanceToIndex.get(instancePath)
    if (index === undefined) {
      return -1
    }

    return index
  }

  /** niInstanceAggregationSceneIndex.cpp:2032-2053. Given instance info
   *  identifying an instancer, get the instance to instance id map. That is,
   *  compute it if necessary. */
  private _getInstanceToIndex(info: _InstanceInfo): Map<string, number> | undefined {
    const instancerPath = info.getInstancerPath()
    if (!this._instancerToInstanceToIndex.has(instancerPath)) {
      // Entry (albeit nullptr) should for instancer should
      // have been added by _AddInstance.
      return undefined
    }

    // Check whether we have cached the result already.
    let result = this._instancerToInstanceToIndex.get(instancerPath)
    if (!result) {
      // Compute if necessary.
      result = this._computeInstanceToIndex(info)
      this._instancerToInstanceToIndex.set(instancerPath, result)
    }
    return result
  }

  /** niInstanceAggregationSceneIndex.cpp:2055-2086. Given instance info
   *  identifying an instancer, compute the instance to instance id map. */
  private _computeInstanceToIndex(info: _InstanceInfo): Map<string, number> {
    const result = new Map<string, number>()

    const it0 = this._infoToInstance.get(info.enclosingPrototypeRoot)
    if (!it0) {
      return result
    }

    const it1 = it0.get(info.bindingHash)
    if (!it1) {
      return result
    }

    const it2 = it1.get(info.prototypeName)
    if (!it2) {
      return result
    }

    // Compute the indices.
    let i = 0
    for (const instancePath of it2.Sorted()) {
      result.set(instancePath, i)
      i++
    }

    return result
  }
}

// Function-local statics of niInstanceAggregationSceneIndex.cpp, created on
// first use (cpp:1261-1268, 1298-1300, 1721-1724, 1926-1927, 1997-1998).
let _xformLocatorsValue: HdDataSourceLocatorSet | undefined
const _xformLocators = (): HdDataSourceLocatorSet =>
  _xformLocatorsValue ??= new HdDataSourceLocatorSet([HdXformSchema.getDefaultLocator()])
let _instanceTransformLocatorsValue: HdDataSourceLocatorSet | undefined
const _instanceTransformLocators = (): HdDataSourceLocatorSet =>
  _instanceTransformLocatorsValue ??= new HdDataSourceLocatorSet([
    HdPrimvarsSchema.getDefaultLocator()
      .append(HdInstancerTokens.instanceTransforms)
      .append(HdPrimvarSchemaTokens.primvarValue)])
let _maskLocatorsValue: HdDataSourceLocatorSet | undefined
const _maskLocators = (): HdDataSourceLocatorSet =>
  _maskLocatorsValue ??= new HdDataSourceLocatorSet([
    HdInstancerTopologySchema.getDefaultLocator().append(HdInstancerTopologySchemaTokens.mask)])
let _instanceIndicesAndPrimvarsLocatorsValue: HdDataSourceLocatorSet | undefined
const _instanceIndicesAndPrimvarsLocators = (): HdDataSourceLocatorSet =>
  _instanceIndicesAndPrimvarsLocatorsValue ??= new HdDataSourceLocatorSet([
    HdInstancerTopologySchema.getDefaultLocator().append(HdInstancerTopologySchemaTokens.instanceIndices),
    HdPrimvarsSchema.getDefaultLocator()])
let _instanceLocatorsValue: HdDataSourceLocatorSet | undefined
const _instanceLocators = (): HdDataSourceLocatorSet =>
  _instanceLocatorsValue ??= new HdDataSourceLocatorSet([HdInstanceSchema.getDefaultLocator()])
let _prototypeIndexDsValue: HdRetainedTypedSampledDataSource<number> | undefined
const _prototypeIndexDs = (): HdRetainedTypedSampledDataSource<number> =>
  _prototypeIndexDsValue ??= new HdRetainedTypedSampledDataSource<number>(0, VtValueTypes.int)

/**
 * niInstanceAggregationSceneIndex.h:20-318, niInstanceAggregationSceneIndex.cpp:2090-2208.
 *
 * Looks for instances (prims with usdPrototypePath) in the input scene
 * index. Computes which instances can be aggregated together.
 * It returns an instancer for each set of aggregated instances. That instancer
 * instances the corresponding (native) prototype. It also returns prims
 * (of empty type) that group the instancers and that provide bindings
 * (such as material bindings).
 *
 * Instances can be aggregated together if they have the same:
 * 1. "enclosing prototype root", i.e., the path from the data source
 * at instancedBy:prototypeRoot. It is populated by the point instancing
 * scene delegates. In other words, we can only aggregate instances
 * that are instanced by the same point instancer. If not instanced by
 * a point instancer, the enclosing prototype root is simply /.
 * 2. Same bindings. That is, data source on native instances identified
 * by instanceDataSurceNames.
 * 3. The same prototype (path from the data source at usdPrototypePath).
 *
 * The corresponding instancer will be inserted under the enclosing
 * prototype root with the relative path indicating what the bindings and
 * the prototype are. The instancer's primvars:instanceTransforms will be
 * populated from the instances' xform:matrix values. The instancer's
 * instancedBy data source is taking from the "enclosing prototype root"
 * (for compatibility with point instancing) and falls back to value
 * determined by the given prototype root.
 *
 * E.g., when there are no bindings and the prototype is
 * __Prototype_1, the instancer path will be
 * /UsdNiPropagesPrototyped/NoBindings/__Prototype_1/UsdNiInstancer.
 * If there are bindings, a hash will be computed, e.g.,
 * /UsdNiPropagatedPrototypes/Bindings32f...723/__Prototype_1/UsdNiInstancer.
 * In that case, /UsdNiPropagatedPrototypes/Bindings32f...723 will be a prim with a
 * copy of the bindings from one of the instances with that binding hash.
 *
 * For nested instancing, the UsdImaging_NiInstanceAggregationSceneIndex can
 * be called with the path of a native USD prototype. It will then aggregate
 * native instances within that USD prototype.
 *
 * This scene index is implemented by a retained scene index. The
 * (non-recursive) _InstanceObserver observers the input scene index to
 * add, modify or remove binding scopes and instances.
 *
 * (See niInstanceAggregationSceneIndex.h:58-217 for worked examples.)
 */
export class UsdImaging_NiInstanceAggregationSceneIndex extends HdFilteringSceneIndexBase {
  protected readonly _instanceDataSourceNames: readonly string[]
  private readonly _instanceObserver: _InstanceObserver
  private readonly _retainedSceneIndexObserver: HdSceneIndexObserver

  // forNativePrototype = false indicates that this scene index is
  // instantiated for the USD stage with all USD prototypes filtered out.
  // forNativePrototype = true indicates that it is instantiated for a USD
  // prototype and the instancers it adds for the instancers within this
  // prototype need to have the instancedBy data source populated in turn.
  //
  // instanceDataSourceNames are the names of the data sources of a native
  // instance prim that need to have the same values for the instances to
  // be aggregated. A copy of these data sources is bundled into the
  // prim data source for the binding scope.
  //
  /** niInstanceAggregationSceneIndex.h:236-245 */
  static new(inputScene: HdSceneIndexBase, forNativePrototype: boolean,
    instanceDataSourceNames: readonly string[]): UsdImaging_NiInstanceAggregationSceneIndex {
    return new UsdImaging_NiInstanceAggregationSceneIndex(
      inputScene, forNativePrototype, instanceDataSourceNames)
  }

  /** niInstanceAggregationSceneIndex.cpp:2092-2104 */
  protected constructor(inputScene: HdSceneIndexBase, forNativePrototype: boolean,
    instanceDataSourceNames: readonly string[]) {
    super()
    this._instanceDataSourceNames = instanceDataSourceNames
    this._instanceObserver = new _InstanceObserver(inputScene, forNativePrototype, instanceDataSourceNames)
    // niInstanceAggregationSceneIndex.cpp:2167-2208 (_RetainedSceneIndexObserver)
    this._retainedSceneIndexObserver = {
      primsAdded: (_sender, entries) => this._sendPrimsAdded(entries),
      primsDirtied: (_sender, entries) => this._sendPrimsDirtied(entries),
      primsRemoved: (_sender, entries) => this._sendPrimsRemoved(entries),
      primsRenamed: (sender, entries) =>
        _ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this._retainedSceneIndexObserver),
    }
    this._instanceObserver.getRetainedSceneIndex().addObserver(this._retainedSceneIndexObserver)
  }

  private _destroyed = false

  /** Stands for ~UsdImaging_NiInstanceAggregationSceneIndex
   *  (niInstanceAggregationSceneIndex.cpp:2106-2107); see the file header.
   *  Idempotent. */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._instanceObserver.getRetainedSceneIndex().removeObserver(this._retainedSceneIndexObserver)
    this._instanceObserver._destroy()
  }

  /** niInstanceAggregationSceneIndex.cpp:2109-2113 */
  getInputScenes(): HdSceneIndexBase[] {
    return [this._instanceObserver.getInputScene()]
  }

  /** niInstanceAggregationSceneIndex.cpp:2115-2119 */
  getEncapsulatedScenes(): HdSceneIndexBase[] {
    return [this._instanceObserver.getRetainedSceneIndex()]
  }

  /** niInstanceAggregationSceneIndex.cpp:2121-2127 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return this._instanceObserver.getRetainedSceneIndex().getPrim(primPath)
  }

  /** niInstanceAggregationSceneIndex.cpp:2129-2135 */
  getChildPrimPaths(primPath: string): string[] {
    return this._instanceObserver.getRetainedSceneIndex().getChildPrimPaths(primPath)
  }

  /** niInstanceAggregationSceneIndex.cpp:2137-2157.
   *
   *  If the given path is for an instancer in this scene index, returns the
   *  name of the prototype that this instancer is meant to instance.
   *  Otherwise, return empty token. */
  static getPrototypeNameFromInstancerPath(primPath: string): string {
    // Use the convention that the prototype base will be at a path such as
    // that instancers will have paths such as
    // /Foo/UsdNiPropatedPrototypes/Binding435..f52/__Prototype_1/UsdNiInstancer
    // find them.
    if (_GetPathElementCount(primPath) < 4) {
      return ''
    }

    if (_GetNameToken(primPath) !== UsdImaging_NiPrototypeSceneIndexTokens.instancer) {
      return ''
    }

    // Get second last element, e.g., __Prototype_1
    return _GetNameToken(_GetParentPath(primPath))
  }

  /** niInstanceAggregationSceneIndex.cpp:2159-2165.
   *
   *  If the given path is for an instancer in this scene index, returns
   *  the path of the scope containing the bindings that need to be
   *  applied to the prototype. Otherwise, return empty token.
   *
   *  That is the data source of that scope needs to be used when resolving
   *  the opinions on the prototype that this instancer is meant to instance. */
  static getBindingScopeFromInstancerPath(primPath: string): string {
    return _GetParentPath(_GetParentPath(primPath))
  }
}

// ---------------------------------------------------------------------------
// Ports of hd functions this file uses that the hd port does not have.

/** pxr/imaging/hd/sceneIndexObserver.cpp:15-75
 *  (HdSceneIndexObserver::ConvertPrimsRenamedToRemovedAndAdded). */
function _ConvertPrimsRenamedToRemovedAndAdded(sender: HdSceneIndexBase,
  renamedEntries: readonly RenamedPrimEntry[], observer: HdSceneIndexObserver): void {
  const removed: RemovedPrimEntry[] = []
  const added: AddedPrimEntry[] = []
  const workQueue: string[] = []

  for (const renamedEntry of renamedEntries) {
    if (renamedEntry.oldPrimPath !== renamedEntry.newPrimPath) {
      // remove existing
      removed.push({ primPath: renamedEntry.oldPrimPath })

      workQueue.push(renamedEntry.newPrimPath)

      // add back based on traversal on input from new path
      while (workQueue.length > 0) {
        const path = workQueue.pop()!

        const p = sender.getPrim(path)
        added.push({ primPath: path, primType: p.primType })

        const childPaths = sender.getChildPrimPaths(path)
        // insert backwards as we are pulling off the end.
        for (let i = childPaths.length - 1; i >= 0; i--) workQueue.push(childPaths[i]!)
      }
    }
  }

  observer.primsRemoved(sender, removed)
  observer.primsAdded(sender, added)
}

/** pxr/imaging/hd/dataSource.cpp:63-119
 *  (HdGetMergedContributingSampleTimesForInterval). */
function _HdGetMergedContributingSampleTimesForInterval(
  inputDataSources: readonly (HdSampledDataSource | undefined)[],
  startTime: number, endTime: number, outSampleTimes: number[] | undefined): boolean {
  let result = false

  let sampleTimes: number[] = []

  for (const ds of inputDataSources) {
    if (!ds) {
      continue
    }
    const times: number[] = []
    if (!ds.GetContributingSampleTimesForInterval(startTime, endTime, times)) {
      continue
    }
    result = true
    if (!outSampleTimes) {
      continue
    }
    if (sampleTimes.length === 0) {
      sampleTimes = times
    } else {
      // std::set_union of two sorted vectors.
      sampleTimes = [...new Set([...sampleTimes, ...times])].sort((a, b) => a - b)
    }
  }

  if (!result) {
    return false
  }

  if (outSampleTimes) {
    // HdGetContributingSampleTimesForInterval (dataSource.cpp:15-61) over the
    // merged times.
    const out: number[] = []
    let numOutSamples = 0
    for (let i = 0; i < sampleTimes.length; ++i) {
      const t = sampleTimes[i]!
      if (numOutSamples === 0) {
        if (t > startTime && i > 0) {
          numOutSamples++
          out.push(sampleTimes[i - 1]!)
        }
        if (t >= startTime) {
          numOutSamples++
          out.push(t)
        }
      } else {
        numOutSamples++
        out.push(t)
      }
      if (t >= endTime) {
        break
      }
    }
    if (numOutSamples === 0 && sampleTimes.length > 0) {
      out.push(sampleTimes[0]!)
    }
    outSampleTimes.splice(0, outSampleTimes.length, ...out)
    return numOutSamples > 1
  }
  return true
}

