// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/extentResolvingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/extentResolvingSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/extentResolvingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import { Range3d as GfRange3d, type Vec3d as GfVec3d } from 'typescript-usd/gf'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ExtentSchema as HdExtentSchema,
  RenderTagTokens as HdRenderTagTokens,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  VectorDataSource as HdVectorDataSource,
  VectorOfTypedSampledDataSourcesSchema as HdVectorOfTypedSampledDataSourcesSchema,
  type AddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry,
  type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
  type TokenDataSource as HdTokenDataSource,
} from 'typescript-usd/hd'
import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { UsdImagingExtentsHintSchema } from './extentsHintSchema.ts'

/** extentResolvingSceneIndex.h:20-25
 *  USDIMAGINGEXTENTRESOLVINGSCENEINDEX_TOKENS */
export const UsdImagingExtentResolvingSceneIndexTokens = TfMakeTokens({
  purposes: 'purposes',
})

/** extentResolvingSceneIndex.cpp:24-49 */
function _GetPurposes(inputArgs: HdContainerDataSource | undefined): Set<string> {
  const defaultSet = new Set<string>([HdRenderTagTokens.geometry])

  if (!inputArgs) {
    return defaultSet
  }

  const vecDs = inputArgs.Get(UsdImagingExtentResolvingSceneIndexTokens.purposes)
  const vecSchema = new HdVectorOfTypedSampledDataSourcesSchema<HdTokenDataSource>(
    vecDs instanceof HdVectorDataSource ? vecDs : undefined)
  if (!vecSchema.isDefined()) {
    return defaultSet
  }

  const result = new Set<string>()

  const n = vecSchema.getNumElements()
  for (let i = 0; i < n; i++) {
    const ds = vecSchema.getElement(i)
    if (ds) {
      result.add(ds.getTypedValue(0.0))
    }
  }
  return result
}

/** extentResolvingSceneIndex.cpp:51-61 */
class _Info {
  /** When computing the bounding box, we only consider geometry with
   *  purposes being in this set. */
  readonly purposes: Set<string>

  constructor(inputArgs: HdContainerDataSource | undefined) {
    this.purposes = _GetPurposes(inputArgs)
  }
}

/** extentResolvingSceneIndex.cpp:63-117 _TransformedEntries: replaces the
 *  entries matching the predicate by their transform, reusing the given
 *  entries when none match. */
function _TransformedEntries(
  entries: DirtiedPrimEntry[],
  predicate: (entry: DirtiedPrimEntry) => boolean,
  transform: (entry: DirtiedPrimEntry) => DirtiedPrimEntry,
): DirtiedPrimEntry[] {
  let i = 0
  for (; i < entries.length; ++i) {
    if (predicate(entries[i]!)) {
      break
    }
  }

  if (i === entries.length) {
    return entries
  }

  const newEntries: DirtiedPrimEntry[] = entries.slice(0, i)

  newEntries.push(transform(entries[i]!))
  ++i

  for (; i < entries.length; ++i) {
    if (predicate(entries[i]!)) {
      newEntries.push(transform(entries[i]!))
    } else {
      newEntries.push(entries[i]!)
    }
  }
  return newEntries
}

/** extentResolvingSceneIndex.cpp:119-126 */
function _ContainsExtentsHintWithoutExtent(entry: DirtiedPrimEntry): boolean {
  return entry.dirtyLocators.intersects(
    UsdImagingExtentsHintSchema.getDefaultLocator()) &&
    !entry.dirtyLocators.contains(HdExtentSchema.getDefaultLocator())
}

/** extentResolvingSceneIndex.cpp:128-135 */
function _ExtentAdded(entry: DirtiedPrimEntry): DirtiedPrimEntry {
  const locators = new HdDataSourceLocatorSet(entry.dirtyLocators)
  locators.insert(HdExtentSchema.getDefaultLocator())
  return { primPath: entry.primPath, dirtyLocators: locators }
}

/** extentResolvingSceneIndex.cpp:143-232 */
class _PrimSource extends HdContainerDataSource {
  static new(primSource: HdContainerDataSource, info: _Info): _PrimSource {
    return new _PrimSource(primSource, info)
  }

  private constructor(
    private readonly _primSource: HdContainerDataSource,
    private readonly _info: _Info,
  ) {
    super()
  }

  getNames(): string[] {
    const result = this._primSource.getNames()
    if (this._getExtentsHints().isDefined()) {
      if (!result.includes(HdExtentSchema.getSchemaToken())) {
        result.push(HdExtentSchema.getSchemaToken())
      }
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    const result = this._primSource.Get(name)
    if (result) {
      return result
    }

    // Use extentsHint if extent is not given.
    if (name === HdExtentSchema.getSchemaToken()) {
      return this._getExtentFromExtentsHint()
    }

    return undefined
  }

  private _getExtentsHints(): UsdImagingExtentsHintSchema {
    return UsdImagingExtentsHintSchema.getFromParent(this._primSource)
  }

  private _getExtentFromExtentsHint(): HdDataSourceBase | undefined {
    if (this._info.purposes.size === 0) {
      return undefined
    }

    const extentsHintSchema = this._getExtentsHints()
    if (!extentsHintSchema.isDefined()) {
      return undefined
    }

    if (this._info.purposes.size === 1) {
      const [purpose] = this._info.purposes
      return extentsHintSchema.getExtent(purpose!).getContainer()
    }

    const bbox = new GfRange3d()
    for (const purpose of this._info.purposes) {
      const extentSchema: HdExtentSchema = extentsHintSchema.getExtent(purpose)
      const minDs = extentSchema.getMin()
      const maxDs = extentSchema.getMax()
      if (minDs && maxDs) {
        bbox.unionWith(
          new GfRange3d(
            minDs.getTypedValue(0.0),
            maxDs.getTypedValue(0.0)))
      }
    }

    return new HdExtentSchema.Builder()
      .setMin(HdRetainedTypedSampledDataSource.new<GfVec3d>(bbox.getMin()))
      .setMax(HdRetainedTypedSampledDataSource.new<GfVec3d>(bbox.getMax()))
      .build()
  }
}

/** extentResolvingSceneIndex.h:29-77: a scene index that uses
 *  UsdGeomModelAPI's extentsHint if UsdGeomBoundable's extent has not been
 *  authored.
 *
 *  TODO: The UsdStageSceneIndex should consult the
 *  UsdGeomComputeExtentFunction and this scene index should use it. */
export class UsdImagingExtentResolvingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _info: _Info

  /** extentResolvingSceneIndex.cpp:238-247. Datasource purposes at inputArgs
   *  is supposed to be a vector data source of token data sources. These
   *  tokens are hydra purposes (in particular, use
   *  HdRenderTagTokens->geometry rather than the corresponding
   *  UsdGeomTokens->default_). */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): UsdImagingExtentResolvingSceneIndex {
    return new UsdImagingExtentResolvingSceneIndex(inputSceneIndex, inputArgs)
  }

  /** extentResolvingSceneIndex.cpp:249-255 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
    this._info = new _Info(inputArgs)
  }

  /** extentResolvingSceneIndex.cpp:260-271 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (prim.dataSource) {
      return { primType: prim.primType, dataSource: _PrimSource.new(prim.dataSource, this._info) }
    }

    return prim
  }

  /** extentResolvingSceneIndex.cpp:273-278 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** extentResolvingSceneIndex.cpp:280-286 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** extentResolvingSceneIndex.cpp:288-302 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    const newEntries = _TransformedEntries(
      entries,
      /* Predicate = */ _ContainsExtentsHintWithoutExtent,
      /* Transform = */ _ExtentAdded)

    this._sendPrimsDirtied(newEntries)
  }

  /** extentResolvingSceneIndex.cpp:304-310 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }
}
