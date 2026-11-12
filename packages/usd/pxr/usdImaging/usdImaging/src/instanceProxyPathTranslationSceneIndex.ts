// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/instanceProxyPathTranslationSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/instanceProxyPathTranslationSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/instanceProxyPathTranslationSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - SdfPath is a string.
// - HdPathDataSource::Cast / HdPathArrayDataSource::Cast are dynamic casts on
//   the C++ value type. A TS typed sampled data source does not carry its
//   value type at run time, so _TranslateDataSource treats a sampled data
//   source as path-valued when it is an HdPathDataSource /
//   HdPathArrayDataSource subclass, or when its value is an absolute path
//   string (or a non-empty array of them). Token and string values never
//   start with '/' in the data sources this scene index translates; a
//   VtValue is path-valued when it holds the SdfPath TfType (or an array of
//   it), as UsdImagingDataSourceRelationship's does.
// - The input scene index is held strongly (HdSceneIndexBasePtr is a weak
//   pointer upstream; _PrimDs::Get returns null once it expired).

import {
  ContainerDataSource as HdContainerDataSource,
  InstanceSchema as HdInstanceSchema,
  InstancerTopologySchema as HdInstancerTopologySchema,
  PathArrayDataSource as HdPathArrayDataSource,
  PathDataSource as HdPathDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VectorDataSource as HdVectorDataSource,
  type AddedPrimEntry, type DataSourceBase as HdDataSourceBase, type DirtiedPrimEntry,
  type RemovedPrimEntry, type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { TfEnvSetting, TfGetEnvSetting, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import { TF_RUNTIME_ERROR } from './tfDiagnostic.ts'

/** instanceProxyPathTranslationSceneIndex.cpp:21-23 */
const USDIMAGING_CORRECT_PROXY_PATH_TRANSLATION = new TfEnvSetting<boolean>(
  'USDIMAGING_CORRECT_PROXY_PATH_TRANSLATION', true,
  'Translates certain proxy paths in Usd Imaging correctly ' +
  'which is, however, expensive.')

// ---------------------------------------------------------------------------
// SdfPath helpers (string paths).

/** SdfPath::HasPrefix */
function _HasPrefix(path: string, prefix: string): boolean {
  if (prefix === '/') return path.startsWith('/')
  if (!path.startsWith(prefix)) return false
  const c = path.charAt(prefix.length)
  return c === '' || c === '/' || c === '.' || c === '{' || c === '['
}

/** SdfPath::ReplacePrefix (prim paths) */
function _ReplacePrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (!_HasPrefix(path, oldPrefix)) return path
  if (path === oldPrefix) return newPrefix
  if (oldPrefix === '/') return newPrefix === '/' ? path : newPrefix + path
  return (newPrefix === '/' && path.charAt(oldPrefix.length) === '/')
    ? path.slice(oldPrefix.length)
    : newPrefix + path.slice(oldPrefix.length)
}

/** SdfPath::GetParentPath for prim and property paths. */
function _GetParentPath(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot > path.lastIndexOf('/')) return path.slice(0, dot)
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

/** SdfPath::GetAncestorsRange: the path, then each ancestor, stopping
 *  before the absolute root. */
function _GetAncestorsRange(path: string): string[] {
  const result: string[] = []
  for (let p = path; p !== '/' && p !== ''; p = _GetParentPath(p)) {
    result.push(p)
  }
  return result
}

/** SdfPath::GetPrefixes: the prim-path prefixes from the root prim down to
 *  the path (excluding the absolute root). */
function _GetPrefixes(path: string): string[] {
  return _GetAncestorsRange(path).reverse()
}

/** SdfPath::GetNameToken */
function _GetNameToken(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot > path.lastIndexOf('/')) return path.slice(dot + 1)
  return path.slice(path.lastIndexOf('/') + 1)
}

/** SdfPath::AppendChild */
function _AppendChild(path: string, name: string): string {
  return path === '/' ? `/${name}` : `${path}/${name}`
}

/** HdSceneIndexPrim::IsDefined (sceneIndex.h) */
function _IsDefined(prim: HdSceneIndexPrim): boolean {
  return prim.dataSource !== undefined && prim.dataSource !== null
}

// ---------------------------------------------------------------------------

/** instanceProxyPathTranslationSceneIndex.cpp:25-47 */
class _Data {
  /** Prim-level data source names under which to apply instance proxy path
   *  translation. */
  private readonly _proxyPathDataSourceNames: readonly string[]

  constructor(proxyPathDataSourceNames: readonly string[]) {
    this._proxyPathDataSourceNames = [...proxyPathDataSourceNames]
  }

  shouldTranslatePathsForDataSourceName(name: string): boolean {
    return this._proxyPathDataSourceNames.includes(name)
  }
}

/** instanceProxyPathTranslationSceneIndex.cpp:59-90 */
function _GetPrototypePath(
  instanceSchema: HdInstanceSchema,
  sceneIndex: HdSceneIndexBase,
): string | undefined {
  const instancerPathDs = instanceSchema.getInstancer()
  if (!instancerPathDs) {
    return undefined
  }
  const prototypeIdxDs = instanceSchema.getPrototypeIndex()
  if (!prototypeIdxDs) {
    return undefined
  }

  const instancerPath = String(instancerPathDs.getTypedValue(0.0))
  const protoIdx = Number(prototypeIdxDs.getTypedValue(0.0))

  const instancerPrim = sceneIndex.getPrim(instancerPath)
  const instancerTopologySchema =
    HdInstancerTopologySchema.getFromParent(instancerPrim.dataSource)

  const protoPathsDs = instancerTopologySchema.getPrototypes()
  if (protoPathsDs) {
    const protoPaths = _ToPathArray(protoPathsDs.getTypedValue(0.0))
    if (protoPaths && protoIdx >= 0 && protoIdx < protoPaths.length) {
      return protoPaths[protoIdx]
    }
  }

  return undefined
}

/** instanceProxyPathTranslationSceneIndex.cpp:92-96 */
function _IsValid(prim: HdSceneIndexPrim): boolean {
  return prim.primType !== '' || !!prim.dataSource
}

/** instanceProxyPathTranslationSceneIndex.cpp:98-141
 *  Suffers from USD-12141, USD-12143, HYD-3681 */
function _OldTranslatePath(path: string, sceneIndex: HdSceneIndexBase): string {
  // Don't translate a path to a valid scene index prim.
  // We do this for two reasons:
  // 1. Avoid querying the scene index at each path prefix for the general
  //    case where the prim is not a descendant of an instance prim.
  // 2. To not incorrectly translate an instance prim path to its
  //    prototype path. We want to do this only for *descendant* paths of
  //    instance prims that don't have a corresponding prim in the scene
  //    index.
  //
  const prim = sceneIndex.getPrim(path)
  if (_IsValid(prim)) {
    return path
  }

  // Iterate over the prefixes, adding the terminal path element of each
  // prefix and checking if the prim at the resulting path is an instance.
  // If it is, replace the result with the prototype path of the instance and
  // continue iterating over the prefixes.
  //
  let result = '/'

  for (const p of _GetPrefixes(path)) {
    result = _AppendChild(result, _GetNameToken(p))

    const instanceSchema = HdInstanceSchema.getFromParent(
      sceneIndex.getPrim(result).dataSource)

    const prototypePath = _GetPrototypePath(instanceSchema, sceneIndex)
    if (prototypePath !== undefined) {
      result = prototypePath
    }
  }

  return result
}

/** instanceProxyPathTranslationSceneIndex.cpp:143-213
 *  Correct implementation, but performance problem reported in HYD-3687. */
function _NewTranslatePath(path: string, sceneIndex: HdSceneIndexBase): string {
  // Translate paths identifying instance proxy prims to identify
  // the corresponding descendant of the prototype:
  //
  // - Walk up path ancestors, stopping if we see a defined prim
  // - For each non-defined prim ancestor, check for an HdInstanceSchema
  //   indicating that this is an instance proxy prim
  // - If an instance proxy is found, consult the instance schema's
  //   prototype path, and prefix-replace the instance root with the
  //   prototype root
  //
  // If the provided path refers to a valid scene index prim, no
  // further translation is required:
  // - In the case where the path is not a descendant of an instance
  //   prim, this saves doing extra work.
  // - In the case where the path identifies an instance, rather than
  //   descendant of an instance, we want to leave the path unchanged.

  let result = path

  // Limit iterations just in case.
  let i = 0
  const maxIters = 1000
  for (; i < maxIters && !_IsDefined(sceneIndex.getPrim(result)); ++i) {
    // Work back-to-front, until we find an ancestor prim that exists
    let loopAgain = false
    for (const ancestorPath of _GetAncestorsRange(result)) {
      const ancestor = sceneIndex.getPrim(ancestorPath)
      if (_IsDefined(ancestor)) {
        const instanceSchema = HdInstanceSchema.getFromParent(ancestor.dataSource)
        // If the ancestor has an instanceSchema that provides a new
        // prototype path, replace the prefix of our working path and
        // start the loop again with this new path.
        const prototypePath = _GetPrototypePath(instanceSchema, sceneIndex)
        if (prototypePath !== undefined) {
          // Guard against scenarios where the prototype is
          // a descendant of the instance.  This scenario
          // has been observed when point instancers use
          // native-instanced prototypes; see PRES-102132.
          if (!_HasPrefix(prototypePath, ancestorPath)) {
            result = _ReplacePrefix(result, ancestorPath, prototypePath)
            loopAgain = true
            break
          }
        }
      }
    }
    // If we've checked all the ancestors and not found any prototype paths
    // then we're done.
    if (!loopAgain) {
      break
    }
  }
  if (i >= maxIters) {
    TF_RUNTIME_ERROR(
      'UsdImaging_InstanceProxyPathTranslationSceneIndex hit max ' +
      `iterations translating path <${path}>\n`)
  }

  return result
}

/** instanceProxyPathTranslationSceneIndex.cpp:215-227 */
function _TranslatePath(path: string, sceneIndex: HdSceneIndexBase): string {
  const r = TfGetEnvSetting(USDIMAGING_CORRECT_PROXY_PATH_TRANSLATION)
  if (r) {
    return _NewTranslatePath(path, sceneIndex)
  } else {
    return _OldTranslatePath(path, sceneIndex)
  }
}

/** instanceProxyPathTranslationSceneIndex.cpp:229-254
 *  Data source that recursively wraps data sources to apply path
 *  translation, given a HdVectorDataSource. */
class _VectorDs extends HdVectorDataSource {
  private constructor(
    private readonly _sceneIndex: HdSceneIndexBase,
    private readonly _underlyingDs: HdVectorDataSource,
  ) { super() }

  static new(sceneIndex: HdSceneIndexBase, underlyingDs: HdVectorDataSource): _VectorDs {
    return new _VectorDs(sceneIndex, underlyingDs)
  }

  getNumElements(): number {
    return this._underlyingDs.getNumElements()
  }
  getElement(i: number): HdDataSourceBase | undefined {
    return _TranslateDataSource(this._underlyingDs.getElement(i), this._sceneIndex)
  }
}

/** instanceProxyPathTranslationSceneIndex.cpp:256-281
 *  Data source that recursively wraps data sources to apply path
 *  translation, given a HdContainerDataSource. */
class _ContainerDs extends HdContainerDataSource {
  protected constructor(
    protected readonly _sceneIndex: HdSceneIndexBase,
    protected readonly _underlyingDs: HdContainerDataSource,
  ) { super() }

  static new(sceneIndex: HdSceneIndexBase, underlyingDs: HdContainerDataSource): _ContainerDs {
    return new _ContainerDs(sceneIndex, underlyingDs)
  }

  getNames(): string[] {
    return this._underlyingDs.getNames()
  }
  Get(name: string): HdDataSourceBase | undefined {
    return _TranslateDataSource(this._underlyingDs.Get(name), this._sceneIndex)
  }
}

/** instanceProxyPathTranslationSceneIndex.cpp:283-319
 *  Data source that recursively wraps data sources to apply path
 *  translation, given a prim-level container data source. */
class _PrimDs extends HdContainerDataSource {
  private constructor(
    private readonly _sceneIndex: HdSceneIndexBase,
    private readonly _underlyingDs: HdContainerDataSource,
    private readonly _data: _Data,
  ) { super() }

  static new(
    inputSceneIndex: HdSceneIndexBase, underlyingDs: HdContainerDataSource, data: _Data,
  ): _PrimDs {
    return new _PrimDs(inputSceneIndex, underlyingDs, data)
  }

  getNames(): string[] {
    return this._underlyingDs.getNames()
  }
  Get(name: string): HdDataSourceBase | undefined {
    return this._data.shouldTranslatePathsForDataSourceName(name)
      ? _TranslateDataSource(this._underlyingDs.Get(name), this._sceneIndex)
      : this._underlyingDs.Get(name)
  }
}

const _SdfPathType = TfType.declare('SdfPath')

/** A path value (string) of a path-valued data source, see the file header. */
function _IsPathString(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/')
}

/** The paths of a VtArray<SdfPath> value (VtArray or plain array). */
function _ToPathArray(value: unknown): string[] | undefined {
  let items: unknown[] | undefined
  if (value instanceof VtValue) {
    if (!value.isArrayValued() || value.getElementType() !== _SdfPathType) return undefined
    return _ToPathArray(value.Get<unknown>())
  }
  if (Array.isArray(value)) {
    items = value
  } else if (value && typeof (value as { toArray?: unknown }).toArray === 'function' &&
    !(value instanceof VtValue)) {
    items = (value as { toArray: () => unknown[] }).toArray()
  }
  if (!items) return undefined
  return items.every(_IsPathString) ? items as string[] : undefined
}

/** instanceProxyPathTranslationSceneIndex.cpp:321-355
 *  Apply instance path-translation and recursive wrapping to the data
 *  source. */
function _TranslateDataSource(
  ds: HdDataSourceBase | undefined,
  si: HdSceneIndexBase,
): HdDataSourceBase | undefined {
  if (ds instanceof HdSampledDataSource) {
    // HdPathDataSource::Cast / HdPathArrayDataSource::Cast; see the file
    // header for how path-valued data sources are recognized.
    let value: unknown = ds instanceof HdTypedSampledDataSource
      ? ds.getTypedValue(0.0) : ds.GetValue(0.0)
    if (value instanceof VtValue && !value.isArrayValued() && value.IsHolding(_SdfPathType)) {
      value = value.Get<unknown>()
    }
    const isPathDs = ds instanceof HdPathDataSource
    const isPathArrayDs = ds instanceof HdPathArrayDataSource

    // Translate SdfPath-valued data sources.
    if (isPathDs || (!isPathArrayDs && _IsPathString(value))) {
      const path = String(value)
      return HdRetainedTypedSampledDataSource.new<string>(_TranslatePath(path, si))
    }

    // Translate VtArray<SdfPath>-valued data sources.
    const pathArray = _ToPathArray(value)
    if (pathArray && (isPathArrayDs || pathArray.length > 0)) {
      const translated = pathArray.map(path => _TranslatePath(path, si))
      return HdRetainedTypedSampledDataSource.new<VtArray<string>>(
        new VtArray<string>(translated, _SdfPathType))
    }
  }

  // Recursively wrap container data sources.
  if (ds instanceof HdContainerDataSource) {
    return _ContainerDs.new(si, ds)
  }

  // Recursively wrap vector data sources.
  if (ds instanceof HdVectorDataSource) {
    return _VectorDs.new(si, ds)
  }

  return ds
}

// ---------------------------------------------------------------------------

/** instanceProxyPathTranslationSceneIndex.h:32-71
 *
 * A scene index that translates SdfPath-valued data sources pointing
 * under instances to point to the corresponding prototype paths.
 * This scene index is stateless and relies on querying the input
 * scene index to perform the translation. */
export class UsdImaging_InstanceProxyPathTranslationSceneIndex
  extends HdSingleInputFilteringSceneIndexBase {
  private readonly _data: _Data

  /** instanceProxyPathTranslationSceneIndex.cpp:361-369 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    proxyPathTranslationDataSourceNames: readonly string[],
  ): UsdImaging_InstanceProxyPathTranslationSceneIndex {
    return new UsdImaging_InstanceProxyPathTranslationSceneIndex(
      inputSceneIndex, proxyPathTranslationDataSourceNames)
  }

  /** instanceProxyPathTranslationSceneIndex.cpp:371-381 */
  private constructor(
    inputSceneIndex: HdSceneIndexBase,
    proxyPathTranslationDataSourceNames: readonly string[],
  ) {
    super(inputSceneIndex)
    this._data = new _Data(proxyPathTranslationDataSourceNames)
  }

  /** instanceProxyPathTranslationSceneIndex.cpp:383-393 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.dataSource) {
      return {
        primType: prim.primType,
        dataSource: _PrimDs.new(this._getInputSceneIndex(), prim.dataSource, this._data),
      }
    }
    return prim
  }

  /** instanceProxyPathTranslationSceneIndex.cpp:395-400 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** instanceProxyPathTranslationSceneIndex.cpp:402-408 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** instanceProxyPathTranslationSceneIndex.cpp:410-416 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** instanceProxyPathTranslationSceneIndex.cpp:418-424 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }
}
