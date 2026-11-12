// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/niPrototypeSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/niPrototypeSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/niPrototypeSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  InstancedBySchema as HdInstancedBySchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  XformSchema as HdXformSchema,
  type AddedPrimEntry, type ContainerDataSource as HdContainerDataSource,
  type DataSourceBase as HdDataSourceBase, type DirtiedPrimEntry, type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { UsdImaging_PrototypeSceneIndexUtils } from './prototypeSceneIndexUtils.ts'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

const { isRenderablePrimType: IsRenderablePrimType } = UsdImaging_PrototypeSceneIndexUtils

/** niPrototypeSceneIndex.h:20-26 USDIMAGING_NI_PROTOTYPE_SCENE_INDEX_TOKENS */
export const UsdImaging_NiPrototypeSceneIndexTokens = TfMakeTokens({
  instancer: 'UsdNiInstancer',
  prototype: 'UsdNiPrototype',
})

const _HasPrefix = (path: string, prefix: string): boolean =>
  prefix === '/' ? path.startsWith('/') : path === prefix || path.startsWith(prefix + '/')
const _GetPathElementCount = (path: string): number => path === '/' ? 0 : path.split('/').length - 1

/** niPrototypeSceneIndex.cpp:25-37 */
function _IsUsdInstance(primSource: HdContainerDataSource | undefined): boolean {
  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(primSource)
  const pathDs = schema.getNiPrototypePath()
  if (!pathDs) {
    return false
  }
  const usdPrototypePath = pathDs.getTypedValue(0)
  return !!usdPrototypePath
}

/** niPrototypeSceneIndex.cpp:39-51 */
function _ResetXformToIdentityDataSource(): HdDataSourceBase {
  return new HdXformSchema.Builder()
    .setMatrix(HdRetainedTypedSampledDataSource.new(new GfMatrix4d(1.0)))
    .setResetXformStack(HdRetainedTypedSampledDataSource.new(true))
    .build()
}

let _underlaySource: HdContainerDataSource | undefined
/** niPrototypeSceneIndex.cpp:53-61 */
function _UnderlaySource(): HdContainerDataSource {
  _underlaySource ??= HdRetainedContainerDataSource.new(
    [HdInstancedBySchema.getSchemaToken()],
    [UsdImaging_NiPrototypeSceneIndex.getInstancedByDataSource()])
  return _underlaySource
}

let _prototypeRootOverlayDs: HdContainerDataSource | undefined
/** niPrototypeSceneIndex.cpp:63-76 */
function _PrototypeRootOverlaySource(ds: HdContainerDataSource | undefined): HdContainerDataSource | undefined {
  _prototypeRootOverlayDs ??= HdRetainedContainerDataSource.new(
    [HdInstancedBySchema.getSchemaToken(), HdXformSchema.getSchemaToken()],
    [
      UsdImaging_NiPrototypeSceneIndex.getInstancedByDataSource(),
      // The prototypes should always be defined at the origin.
      _ResetXformToIdentityDataSource(),
    ])
  // HdCreateOverlayContainerDataSource
  return HdOverlayContainerDataSource.overlayedContainerDataSources(_prototypeRootOverlayDs, ds)
}

let _instancerPath: string | undefined
let _prototypePath: string | undefined
let _instancedByDataSource: HdDataSourceBase | undefined

/**
 * niPrototypeSceneIndex.h:28-112.
 *
 * A scene index that prepares the prims under /UsdNiInstancer/UsdPrototype
 * to be instanced by the instancer /UsdNiInstancer created
 * by the UsdImaging_InstanceAggregationSceneIndex.
 * Note that /UsdNiInstancer/UsdPrototype corresponds to a USD prototype.
 * That is, the isolating scene index in the prototype propagating scene index
 * is taking a USD prototype at, e.g., /__Prototype_1 and moves it underneath
 * /UsdNiInstancer/UsdPrototype.
 *
 * It forces an empty type on all prims that are instances
 * (that is prims with non-trivial usdPrototypePath).
 * The reason is: an instance in usd can have a type such as
 * sphere, yet we do not want to see this sphere in the render.
 *
 * It also adds an instanced by data source with
 * instancedBy:paths being /UsdNiInstancer and instancedBy:prototypeRoot being
 * /UsdNiInstancer/UsdNiPrototype. These are only added if they are not
 * already present. That way, point instancers and prototypes within
 * native prototypes are handled correctly.
 */
export class UsdImaging_NiPrototypeSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _prototypeRootOverlaySource: HdContainerDataSource | undefined

  /**
   * niPrototypeSceneIndex.h:61-83, .cpp:80-89.
   *
   * forNativePrototype = false indicates that this scene index is
   * instantiated for the USD stage with all USD prototypes filtered out.
   * forNativePrototype = true indicates that it is instantiated for a USD
   * prototype and it needs to populate the instancedBy data source.
   *
   * The given data source is overlayed over the prototype root prim's
   * data source.
   *
   * If instances with a particular opinion about, say, purpose, are
   * aggregated together, this opinion needs to be applied to the respective
   * prototype. This can be done by passing it as prototypeRootOverlayDs
   * here. A later flattening scene index can then apply the opinion to the
   * descendants of the prototype root that do not have a stronger opinion.
   *
   * Note that the flattening scene index is not flattening
   * model:applyDrawMode - but it still has an effect on the prototype root.
   */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    forNativePrototype: boolean,
    prototypeRootOverlayDs: HdContainerDataSource | undefined,
  ): UsdImaging_NiPrototypeSceneIndex {
    return new UsdImaging_NiPrototypeSceneIndex(inputSceneIndex, forNativePrototype, prototypeRootOverlayDs)
  }

  /** niPrototypeSceneIndex.cpp:91-101 */
  private constructor(
    inputSceneIndex: HdSceneIndexBase,
    private readonly _forNativePrototype: boolean,
    prototypeRootOverlayDs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
    this._prototypeRootOverlaySource = _PrototypeRootOverlaySource(prototypeRootOverlayDs)
  }

  /** niPrototypeSceneIndex.cpp:103-112.
   *  Get path of the instancer that the instance aggregation scene index
   *  will add. This path is used by this scene index as well. */
  static getInstancerPath(): string {
    _instancerPath ??= `/${UsdImaging_NiPrototypeSceneIndexTokens.instancer}`
    return _instancerPath
  }

  /** niPrototypeSceneIndex.cpp:114-123.
   *  Get path of the copy of the USD prototype that is a child of the
   *  instancer. */
  static getPrototypePath(): string {
    _prototypePath ??= `${UsdImaging_NiPrototypeSceneIndex.getInstancerPath()}/${UsdImaging_NiPrototypeSceneIndexTokens.prototype}`
    return _prototypePath
  }

  /** niPrototypeSceneIndex.cpp:125-141.
   *  Get's data source for instancedBy schema for prims within this
   *  prototype. */
  static getInstancedByDataSource(): HdDataSourceBase {
    _instancedByDataSource ??= new HdInstancedBySchema.Builder()
      .setPaths(HdRetainedTypedSampledDataSource.new([UsdImaging_NiPrototypeSceneIndex.getInstancerPath()]))
      .setPrototypeRoots(HdRetainedTypedSampledDataSource.new([UsdImaging_NiPrototypeSceneIndex.getPrototypePath()]))
      .build()
    return _instancedByDataSource
  }

  /** niPrototypeSceneIndex.cpp:143-182 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = { ...this._getInputSceneIndex().getPrim(primPath) }

    if (!prim.dataSource) {
      return prim
    }

    if (_IsUsdInstance(prim.dataSource)) {
      if (IsRenderablePrimType(prim.primType)) {
        prim.primType = ''
      }
      return prim
    }

    if (!this._forNativePrototype) {
      return prim
    }

    if (!_HasPrefix(primPath, UsdImaging_NiPrototypeSceneIndex.getPrototypePath())) {
      return prim
    }

    const n = _GetPathElementCount(UsdImaging_NiPrototypeSceneIndex.getPrototypePath())

    if (_GetPathElementCount(primPath) === n) {
      // primPath is /UsdNiInstancer/UsdNiPrototype
      prim.dataSource = HdOverlayContainerDataSource.new(this._prototypeRootOverlaySource, prim.dataSource)
    } else {
      // primPath is an ancestor of /UsdNiInstancer/UsdNiPrototype
      prim.dataSource = HdOverlayContainerDataSource.new(prim.dataSource, _UnderlaySource())
    }

    return prim
  }

  /** niPrototypeSceneIndex.cpp:184-189 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** niPrototypeSceneIndex.cpp:191-226 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    const indicesToErasePrimType: number[] = []
    {
      for (let i = 0; i < entries.length; ++i) {
        const entry = entries[i]!
        if (IsRenderablePrimType(entry.primType) &&
            _IsUsdInstance(this._getInputSceneIndex().getPrim(entry.primPath).dataSource)) {
          indicesToErasePrimType.push(i)
        }
      }
    }

    if (indicesToErasePrimType.length === 0) {
      this._sendPrimsAdded(entries)
    } else {
      const newEntries = entries.map(entry => ({ ...entry }))
      for (const index of indicesToErasePrimType) {
        newEntries[index]!.primType = ''
      }
      this._sendPrimsAdded(newEntries)
    }
  }

  /** niPrototypeSceneIndex.cpp:228-234 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  /** niPrototypeSceneIndex.cpp:236-242 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }
}
