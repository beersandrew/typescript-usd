// Ported from OpenUSD 26.11.1: pxr/imaging/hd/prefixingSceneIndex.cpp,
//  pxr/imaging/hd/prefixingSceneIndex.h, pxr/imaging/hd/systemSchema.cpp
// Copyright 2021, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/prefixingSceneIndex.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - PLATFORM-DIVERGENCE(hd-typed-path-data-source): upstream wraps data sources
//   by their C++ type (HdTypedSampledDataSource<SdfPath>,
//   <VtArray<SdfPath>>, HdPathExpressionDataSource). In this port SdfPath and
//   TfToken values are both strings, so a sampled data source is treated as
//   a path (array) data source when its value at time 0 is an absolute path
//   string (or an array/VtArray of them) and it is not typed as a token or
//   string (HdRetainedTypedSampledDataSource.valueType). Path expressions are
//   recognized by instanceof SdfPathExpression.
// - HdSystemSchema::ComposeAsPrimDataSource (systemSchema.cpp:66-117) is not
//   in systemSchema.ts; it is ported locally below.
// Not ported: TRACE_FUNCTION.

import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import { Array as VtArray } from 'typescript-usd/vt'
import {
  HdContainerDataSource,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
  HdSampledDataSource,
  HdTypedSampledDataSource,
  HdVectorDataSource,
  type HdDataSourceBase,
} from './dataSource.ts'
import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import { HdOverlayContainerDataSource } from './overlayContainerDataSource.ts'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexPrim,
  RemovedPrimEntry,
} from './sceneIndex.ts'
import { HdSystemSchema, HdSystemSchemaTokens } from './systemSchema.ts'

type _Paths = string[] | VtArray<string>

function _IsAbsPathString(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('/')
}

/** Type tag of a retained typed data source, if any. */
function _TypeName(ds: HdSampledDataSource): string | undefined {
  if (ds instanceof HdRetainedTypedSampledDataSource) {
    const t = ds.valueType as { getTypeName?: () => string } | undefined
    return t && typeof t.getTypeName === 'function' ? t.getTypeName() : undefined
  }
  return undefined
}

/** Hd_PrefixingSceneIndexPathDataSource, prefixingSceneIndex.cpp:21-67 */
class Hd_PrefixingSceneIndexPathDataSource extends HdTypedSampledDataSource<string> {
  constructor(
    private readonly _si: HdPrefixingSceneIndex,
    private readonly _inputDataSource: HdSampledDataSource | undefined,
  ) { super() }

  static new(si: HdPrefixingSceneIndex, inputDataSource: HdSampledDataSource) {
    return new Hd_PrefixingSceneIndexPathDataSource(si, inputDataSource)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    if (this._inputDataSource) {
      return this._inputDataSource.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }
    return false
  }

  getTypedValue(shutterOffset: number): string {
    if (!this._inputDataSource) {
      return ''
    }
    const result = this._inputDataSource.GetValue(shutterOffset)
    if (typeof result !== 'string' || result === '') return ''
    return this._si.addPrefix(result)
  }
}

/** Hd_PrefixingSceneIndexPathArrayDataSource, prefixingSceneIndex.cpp:69-121 */
class Hd_PrefixingSceneIndexPathArrayDataSource extends HdTypedSampledDataSource<_Paths> {
  constructor(
    private readonly _si: HdPrefixingSceneIndex,
    private readonly _inputDataSource: HdSampledDataSource | undefined,
  ) { super() }

  static new(si: HdPrefixingSceneIndex, inputDataSource: HdSampledDataSource) {
    return new Hd_PrefixingSceneIndexPathArrayDataSource(si, inputDataSource)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    if (this._inputDataSource) {
      return this._inputDataSource.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }
    return false
  }

  getTypedValue(shutterOffset: number): _Paths {
    if (!this._inputDataSource) {
      return []
    }
    const result = this._inputDataSource.GetValue(shutterOffset)
    // cases in which this will not require altering the result are less
    // common so we acknowledge that this will trigger copy-on-write.
    const prefix = (p: string): string => p === '' ? p : this._si.addPrefix(p)
    if (result instanceof VtArray) {
      return new VtArray<string>((result as VtArray<string>).toArray().map(prefix),
        result.getElementType())
    }
    if (Array.isArray(result)) {
      return (result as string[]).map(prefix)
    }
    return []
  }
}

/** Hd_PrefixingSceneIndexPathExpressionDataSource, prefixingSceneIndex.cpp:123-171 */
class Hd_PrefixingSceneIndexPathExpressionDataSource
  extends HdTypedSampledDataSource<SdfPathExpression> {
  constructor(
    private readonly _si: HdPrefixingSceneIndex,
    private readonly _inputDataSource: HdSampledDataSource | undefined,
  ) { super() }

  static new(si: HdPrefixingSceneIndex, inputDataSource: HdSampledDataSource) {
    return new Hd_PrefixingSceneIndexPathExpressionDataSource(si, inputDataSource)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    if (this._inputDataSource) {
      return this._inputDataSource.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }
    return false
  }

  getTypedValue(shutterOffset: number): SdfPathExpression {
    if (!this._inputDataSource) {
      return new SdfPathExpression()
    }
    const result = this._inputDataSource.GetValue(shutterOffset)
    if (!(result instanceof SdfPathExpression)) {
      return new SdfPathExpression()
    }
    return result.replacePrefix(
      SdfPath.absoluteRootPath,
      SdfPath.fromString(this._si.addPrefix('/')))
  }
}

/** Hd_PrefixingSceneIndexVectorDataSource, prefixingSceneIndex.cpp:178-206 */
class Hd_PrefixingSceneIndexVectorDataSource extends HdVectorDataSource {
  private constructor(
    private readonly _si: HdPrefixingSceneIndex,
    private readonly _inputDataSource: HdVectorDataSource,
  ) { super() }

  static new(si: HdPrefixingSceneIndex, inputDataSource: HdVectorDataSource) {
    return new Hd_PrefixingSceneIndexVectorDataSource(si, inputDataSource)
  }

  getNumElements(): number {
    return this._inputDataSource.getNumElements()
  }

  getElement(element: number): HdDataSourceBase | undefined {
    return Hd_PrefixingSceneIndexCreateDataSource(
      this._si,
      this._inputDataSource.getElement(element))
  }
}

/** Hd_PrefixingSceneIndexContainerDataSource, prefixingSceneIndex.cpp:208-247 */
class Hd_PrefixingSceneIndexContainerDataSource extends HdContainerDataSource {
  protected constructor(
    private readonly _si: HdPrefixingSceneIndex,
    private readonly _inputDataSource: HdContainerDataSource | undefined,
  ) { super() }

  static new(si: HdPrefixingSceneIndex, inputDataSource: HdContainerDataSource) {
    return new Hd_PrefixingSceneIndexContainerDataSource(si, inputDataSource)
  }

  getNames(): string[] {
    if (this._inputDataSource) {
      return this._inputDataSource.getNames()
    }
    return []
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (!this._inputDataSource) {
      return undefined
    }
    // wrap child containers so that we can wrap their children
    return Hd_PrefixingSceneIndexCreateDataSource(
      this._si,
      this._inputDataSource.Get(name))
  }
}

/** Hd_PrefixingSceneIndexCreateDataSource, prefixingSceneIndex.cpp:249-284 */
function Hd_PrefixingSceneIndexCreateDataSource(
  si: HdPrefixingSceneIndex,
  inputDataSource: HdDataSourceBase | undefined,
): HdDataSourceBase | undefined {
  if (!inputDataSource) {
    return undefined
  }

  if (inputDataSource instanceof HdContainerDataSource) {
    return Hd_PrefixingSceneIndexContainerDataSource.new(si, inputDataSource)
  }

  if (inputDataSource instanceof HdVectorDataSource) {
    return Hd_PrefixingSceneIndexVectorDataSource.new(si, inputDataSource)
  }

  if (inputDataSource instanceof HdSampledDataSource) {
    // See PLATFORM-DIVERGENCE(hd-typed-path-data-source) in the file header.
    const typeName = _TypeName(inputDataSource)
    if (typeName !== 'token' && typeName !== 'string') {
      const value = inputDataSource.GetValue(0)
      if (_IsAbsPathString(value)) {
        return Hd_PrefixingSceneIndexPathDataSource.new(si, inputDataSource)
      }
      const elems = value instanceof VtArray ? value.toArray()
        : Array.isArray(value) ? value : undefined
      if (elems && elems.length > 0 && elems.every(_IsAbsPathString)) {
        return Hd_PrefixingSceneIndexPathArrayDataSource.new(si, inputDataSource)
      }
      if (value instanceof SdfPathExpression) {
        return Hd_PrefixingSceneIndexPathExpressionDataSource.new(si, inputDataSource)
      }
    }
  }

  return inputDataSource
}

/** Hd_PrefixingSceneIndexAbsoluteRootPrimContainerDataSource,
 *  prefixingSceneIndex.cpp:286-318 */
class Hd_PrefixingSceneIndexAbsoluteRootPrimContainerDataSource
  extends Hd_PrefixingSceneIndexContainerDataSource {
  static new(si: HdPrefixingSceneIndex, inputDataSource: HdContainerDataSource) {
    return new Hd_PrefixingSceneIndexAbsoluteRootPrimContainerDataSource(si, inputDataSource)
  }

  getNames(): string[] {
    return super.getNames().filter(n => n !== HdSystemSchemaTokens.system)
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdSystemSchemaTokens.system) {
      return undefined
    }
    return super.Get(name)
  }
}

/** HdSystemSchema::Compose / ComposeAsPrimDataSource, systemSchema.cpp:66-117. */
function _HdSystemSchemaComposeAsPrimDataSource(
  inputScene: HdSceneIndexBase, fromPath: string,
): HdContainerDataSource | undefined {
  const systemContainers: HdContainerDataSource[] = []
  for (let currPath = SdfPath.fromString(fromPath); !currPath.isEmpty();
    currPath = currPath.getParentPath()) {
    const currPrim = inputScene.getPrim(currPath.pathString)
    const systemContainer = HdSystemSchema.getFromParent(currPrim.dataSource).getContainer()
    if (systemContainer) {
      systemContainers.push(systemContainer)
    }
  }
  if (systemContainers.length === 0) {
    return undefined
  }
  return HdRetainedContainerDataSource.new(
    [HdSystemSchemaTokens.system],
    [HdOverlayContainerDataSource.new(...systemContainers)])
}

let _empty: HdContainerDataSource | undefined

/**
 * prefixingSceneIndex.h:22-75, prefixingSceneIndex.cpp:322-516.
 *
 * A prefixing scene index is one in which the input scene contains
 * data sources whose paths are all prefixed with a given prefix.
 */
export class HdPrefixingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _prefix: SdfPath
  private readonly _addPrefixMap = new Map<string, string>()
  private readonly _removePrefixMap = new Map<string, string>()

  /** Creates a new prefixing scene index. */
  static new(inputScene: HdSceneIndexBase, prefix: string): HdPrefixingSceneIndex {
    return new HdPrefixingSceneIndex(inputScene, prefix)
  }

  /** prefixingSceneIndex.cpp:322-327 */
  protected constructor(inputScene: HdSceneIndexBase, prefix: string) {
    super(inputScene)
    this._prefix = SdfPath.fromString(prefix)
  }

  /** prefixingSceneIndex.cpp:329-384 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const sdfPrimPath = SdfPath.fromString(primPath)
    if (!sdfPrimPath.hasPrefix(this._prefix)) {
      if (this._prefix.hasPrefix(sdfPrimPath)) {
        return { primType: '', dataSource: _empty ??= HdRetainedContainerDataSource.new([], []) }
      } else {
        return { primType: '', dataSource: undefined }
      }
    }

    const inputScenePath = this.removePrefix(primPath)
    const prim = this._getInputSceneIndex().getPrim(inputScenePath)

    // We'll need to take care of the HdSystemSchema.
    //
    // Suppose our input scene index looks like:
    // /
    //   ChildA
    //   ChildB
    //
    // Where the absolute root (/) has the "system" container data.  Suppose
    // we're prefixing with /X, meaning the resulting sceneIndex will look like:
    // /
    //   X
    //     ChildA
    //     ChildB
    //
    // We handle these cases:
    // 1.  We need to make sure /X does *not* have the system container.  If it
    //     did, then /X/other would errantly get the
    //     system data applied to it.
    // 2.  /X/ChildA and /X/ChildB need to get the system container.
    if (prim.dataSource) {
      const isInputSceneAbsoluteRoot = inputScenePath === '/'
      if (isInputSceneAbsoluteRoot) {
        // This takes care of the HdSystemSchema case 1.
        return {
          primType: prim.primType,
          dataSource: Hd_PrefixingSceneIndexAbsoluteRootPrimContainerDataSource.new(
            this, prim.dataSource),
        }
      } else {
        // Create a container data source to handle prefixing SdfPath values
        let dataSource: HdContainerDataSource =
          Hd_PrefixingSceneIndexContainerDataSource.new(this, prim.dataSource)

        const isRootPrimPath = SdfPath.fromString(inputScenePath).isRootPrimPath()
        if (isRootPrimPath) {
          // This takes care of the HdSystemSchema case 2.
          dataSource = HdOverlayContainerDataSource.new(
            _HdSystemSchemaComposeAsPrimDataSource(
              this._getInputSceneIndex(), inputScenePath),
            dataSource)
        }
        return { primType: prim.primType, dataSource }
      }
    }

    return prim
  }

  /** prefixingSceneIndex.cpp:386-409 */
  getChildPrimPaths(primPath: string): string[] {
    if (primPath === '') return []
    const sdfPrimPath = SdfPath.fromString(primPath)
    // In the case that primPath has our prefix, we just strip out that
    // prefix and let the input scene index handle it.
    if (sdfPrimPath.hasPrefix(this._prefix)) {
      return this._getInputSceneIndex().getChildPrimPaths(
        this.removePrefix(primPath)).map(path => this.addPrefix(path))
    }

    // Okay now since primPath does not share our prefix, then we check to
    // see if primPath is contained within _prefix so that we return the next
    // element that matches. For example if our prefix is "/A/B/C/D" and
    // primPath is "/A/B", we'd like to return "C".
    if (this._prefix.hasPrefix(sdfPrimPath)) {
      return [this._prefix.getPrefixes()[sdfPrimPath.pathElementCount]!.pathString]
    }

    return []
  }

  /** prefixingSceneIndex.cpp:411-433 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const prefixedEntries: AddedPrimEntry[] = []
    for (const entry of entries) {
      // We take PrimsAdded as an opportunity to populate our
      // ReplacePrefix cache.
      const path = entry.primPath
      const prefixed = SdfPath.fromString(path).replacePrefix(
        SdfPath.absoluteRootPath, this._prefix, /* fixTargetPaths = */ false).pathString
      this._addPrefixMap.set(path, prefixed)
      this._removePrefixMap.set(prefixed, path)
      prefixedEntries.push({ primPath: prefixed, primType: entry.primType })
    }
    this._sendPrimsAdded(prefixedEntries)
  }

  /** prefixingSceneIndex.cpp:435-449 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries.map(entry => ({ primPath: this.addPrefix(entry.primPath) })))
  }

  /** prefixingSceneIndex.cpp:451-467 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries.map(entry => ({
      primPath: this.addPrefix(entry.primPath), dirtyLocators: entry.dirtyLocators,
    })))
  }

  /** prefixingSceneIndex.cpp:469-481 */
  addPrefix(primPath: string): string {
    // Hopefully we hit the cached version of this!
    const cached = this._addPrefixMap.get(primPath)
    if (cached !== undefined) {
      return cached
    }
    // If not, for some reason, just do the prefix replacement.
    return SdfPath.fromString(primPath).replacePrefix(
      SdfPath.absoluteRootPath, this._prefix, /* fixTargetPaths = */ false).pathString
  }

  /** prefixingSceneIndex.cpp:483-494 */
  removePrefix(primPath: string): string {
    // See above.
    const cached = this._removePrefixMap.get(primPath)
    if (cached !== undefined) {
      return cached
    }
    return SdfPath.fromString(primPath).replacePrefix(
      this._prefix, SdfPath.absoluteRootPath, /* fixTargetPaths = */ false).pathString
  }
}

