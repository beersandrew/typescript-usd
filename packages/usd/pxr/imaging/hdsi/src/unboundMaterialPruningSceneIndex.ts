// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/unboundMaterialPruningSceneIndex.cpp,
//  pxr/imaging/hdsi/unboundMaterialPruningSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/unboundMaterialPruningSceneIndex.{h,cpp}.
//
// The WorkParallelForN loop of _PrimsAdded (unboundMaterialPruningSceneIndex.cpp:
// 146-183) runs serially here; the tbb::concurrent_vector results it fills are
// plain arrays. TRACE_FUNCTION scopes are not ported.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  PrimTypeTokens as HdPrimTypeTokens,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  ContainerDataSource as HdContainerDataSource,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** unboundMaterialPruningSceneIndex.h:22-26 */
export const HdsiUnboundMaterialPruningSceneIndexTokens = TfMakeTokens({
  materialBindingPurposes: 'materialBindingPurposes',
})

/** unboundMaterialPruningSceneIndex.cpp:30-45 */
function _GetMaterialBindingPurposes(
  inputArgs: HdContainerDataSource | undefined,
): string[] {
  // Divergence: upstream dereferences inputArgs unconditionally.
  const ds =
    inputArgs?.Get(
      HdsiUnboundMaterialPruningSceneIndexTokens
        .materialBindingPurposes)

  // HdTokenArrayDataSource::Cast
  if (ds instanceof HdTypedSampledDataSource) {
    const value = ds.getTypedValue(0)
    if (Array.isArray(value) || (value && typeof value === 'object' && Symbol.iterator in value)) {
      return [...(value as Iterable<string>)]
    }
  }

  return []
}

/** unboundMaterialPruningSceneIndex.cpp:47-53 */
function _Contains(paths: ReadonlySet<string>, primPath: string): boolean {
  return paths.has(primPath)
}

/** unboundMaterialPruningSceneIndex.cpp:56-82 */
function _GetBoundMaterialPaths(
  primContainer: HdContainerDataSource | undefined,
  bindingPurposes: readonly string[],
): string[] {
  const bindingsSchema =
    HdMaterialBindingsSchema.getFromParent(primContainer)

  if (!bindingsSchema.isDefined()) {
    return []
  }

  const materialBindingPaths: string[] = []

  for (const purpose of bindingPurposes) {
    const bindingSchema =
      bindingsSchema.getMaterialBinding(purpose)

    const ds = bindingSchema.getPath()
    if (!ds) {
      continue
    }

    materialBindingPaths.push(ds.getTypedValue(0))
  }

  return materialBindingPaths
}

/** unboundMaterialPruningSceneIndex.cpp:85-95 */
function _ComputeBindingLocators(
  bindingPurposes: readonly string[],
): HdDataSourceLocatorSet {
  const locators = new HdDataSourceLocatorSet()
  for (const purpose of bindingPurposes) {
    locators.insert(
      HdMaterialBindingsSchema.getDefaultLocator()
        .append(purpose))
  }
  return locators
}

/**
 * A scene index that prunes material prims that are not bound.
 *
 * The material binding purposes can be specified via a HdTokenArrayDataSource
 * for the `materialBindingPurposes` token in the input args.
 * If no binding purposes are specified, the scene index will leave unbound
 * materials as is.
 *
 * Note: This scene index clears the prim type and data source for materials
 *       that are not bound. It does not remove the prim altogether.
 *
 * (unboundMaterialPruningSceneIndex.h:28-89)
 */
export class HdsiUnboundMaterialPruningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _bindingPurposes: string[]
  private readonly _bindingLocators: HdDataSourceLocatorSet
  private readonly _boundMaterialPaths = new Set<string>()
  private readonly _addedMaterialPaths = new Set<string>()

  /** unboundMaterialPruningSceneIndex.cpp:99-107 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ): HdsiUnboundMaterialPruningSceneIndex {
    return new HdsiUnboundMaterialPruningSceneIndex(
      inputSceneIndex, inputArgs)
  }

  /** unboundMaterialPruningSceneIndex.cpp:288-297 */
  private constructor(
    inputSceneIndex: HdSceneIndexBase,
    inputArgs: HdContainerDataSource | undefined,
  ) {
    super(inputSceneIndex)
    this._bindingPurposes = _GetMaterialBindingPurposes(inputArgs)
    this._bindingLocators = _ComputeBindingLocators(this._bindingPurposes)
    this._populateFromInputSceneIndex()
  }

  /** unboundMaterialPruningSceneIndex.cpp:109-124 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (prim.primType === HdPrimTypeTokens.material &&
        !this._isBoundMaterial(primPath)) {
      // Clear both prim type and container. We don't need to be lazy here
      // because we re-add the material when it is bound.
      return { primType: '', dataSource: undefined }
    }

    return prim
  }

  /** unboundMaterialPruningSceneIndex.cpp:126-133 */
  getChildPrimPaths(primPath: string): string[] {
    // This scene index does not remove unbound material prims from the scene
    // topology. It only overrides their prim type and container.
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** unboundMaterialPruningSceneIndex.cpp:135-232 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const addedMaterialIndices: number[] = []
    const boundMaterialPaths: string[] = []

    // Querying each prim to get the material bindings can be expensive, so we
    // amortize this cost.
    {
      for (let i = 0; i < entries.length; ++i) {
        const entry = entries[i]!

        if (entry.primType === '') {
          // Ignore bindings on intermediate prims (like scopes
          // and xforms) for whom material bindings are not
          // relevant but present from flattening.
          continue
        }
        if (entry.primType === HdPrimTypeTokens.material) {
          // Track the index for processing below.
          addedMaterialIndices.push(i)
          continue
        }

        const prim =
          this._getInputSceneIndex().getPrim(entry.primPath)

        const materialPaths =
          _GetBoundMaterialPaths(
            prim.dataSource, this._bindingPurposes)

        for (const materialPath of materialPaths) {
          boundMaterialPaths.push(materialPath)
        }
      }
    }

    if (addedMaterialIndices.length === 0 && boundMaterialPaths.length === 0) {
      // No materials nor prims with bound materials were added.
      this._sendPrimsAdded(entries)
      return
    }

    // Track bound materials that were previously added, but never bound ...
    const newlyBoundMaterials: string[] = []
    for (const boundMatPath of boundMaterialPaths) {
      if (this._wasAdded(boundMatPath) && !this._isBoundMaterial(boundMatPath)) {
        newlyBoundMaterials.push(boundMatPath)
      }
    }

    // ... and update our tracking set of bound materials.
    for (const p of boundMaterialPaths) this._boundMaterialPaths.add(p)

    // Track added materials that aren't bound ...
    const addedUnboundMaterialIndices: number[] = []
    for (const i of addedMaterialIndices) {
      const matPath = entries[i]!.primPath
      if (!this._isBoundMaterial(matPath)) {
        addedUnboundMaterialIndices.push(i)
      }
      // ... and update our tracking set of added materials.
      this._addedMaterialPaths.add(matPath)
    }

    // Avoid copying the notice entries.
    if (newlyBoundMaterials.length === 0 && addedUnboundMaterialIndices.length === 0) {
      this._sendPrimsAdded(entries)
      return
    }

    // Clear the prim type on added-but-still-unbound material notices ...
    const editedEntries: AddedPrimEntry[] = entries.map((e) => ({ ...e }))
    for (const i of addedUnboundMaterialIndices) {
      editedEntries[i]!.primType = ''
    }
    // ... and re-add previously-added-but-now-bound materials.
    for (const materialPath of newlyBoundMaterials) {
      editedEntries.push(
        { primPath: materialPath, primType: HdPrimTypeTokens.material })
    }

    this._sendPrimsAdded(editedEntries)
  }

  /** unboundMaterialPruningSceneIndex.cpp:234-244 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    for (const entry of entries) {
      this._addedMaterialPaths.delete(entry.primPath)
      this._boundMaterialPaths.delete(entry.primPath)
    }
    this._sendPrimsRemoved(entries)
  }

  /** unboundMaterialPruningSceneIndex.cpp:246-286 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // Below, we check if the material binding locators have changed and update
    // our tracking set of bound materials and re-add newly bound materials
    // we've seen before similar to the logic in _PrimsAdded.
    //
    const newlyBoundEntries: AddedPrimEntry[] = []

    for (const entry of entries) {
      if (entry.dirtyLocators.intersects(this._bindingLocators)) {

        const prim =
          this._getInputSceneIndex().getPrim(entry.primPath)

        if (prim.primType === '') {
          // Ignore bindings on intermediate prims, like in _PrimsAdded.
          continue
        }

        const boundMaterialPaths =
          _GetBoundMaterialPaths(prim.dataSource, this._bindingPurposes)

        for (const materialPath of boundMaterialPaths) {
          if (!this._isBoundMaterial(materialPath)) {
            if (this._wasAdded(materialPath)) {
              newlyBoundEntries.push(
                { primPath: materialPath, primType: HdPrimTypeTokens.material })
            }
            this._boundMaterialPaths.add(materialPath)
          }
        }
      }
    }

    this._sendPrimsAdded(newlyBoundEntries)
    this._sendPrimsDirtied(entries)
  }

  /** Traverse input scene to update internal tracking and
   * discover and invalidate unbound materials.
   * (unboundMaterialPruningSceneIndex.cpp:302-357) */
  private _populateFromInputSceneIndex(): void {
    // Track all material prim paths to find unbound materials.
    // Having sorted paths (SdfPathSet) lets us use set_difference below.
    //
    // Note: upstream never inserts into allMaterialPaths, so the
    // set_difference below is always empty and no added notices are sent;
    // ported as is.
    const allMaterialPaths: string[] = []

    for (const primPath of
      new HdSceneIndexPrimView(this._getInputSceneIndex())) {

      const prim = this._getInputSceneIndex().getPrim(primPath)

      if (prim.primType === '') {
        // Ignore bindings on non-geometry prims. This captures most of
        // the intermediate prims (like scopes and xforms) for whom material
        // bindings are not relevant but present from flattening.
        continue
      }

      if (prim.primType === HdPrimTypeTokens.material) {
        this._addedMaterialPaths.add(primPath)
        continue
      }

      // Check if this prim has bound materials.
      const boundMaterialPaths =
        _GetBoundMaterialPaths(prim.dataSource, this._bindingPurposes)

      if (boundMaterialPaths.length === 0) {
        continue
      }

      // Add the bound material paths to our tracking set.
      for (const p of boundMaterialPaths) this._boundMaterialPaths.add(p)
    }

    // Prune unbound materials by sending an added notice with an empty prim
    // type. Note that we *don't* remove the unbound materials.
    const unboundMaterialPaths =
      allMaterialPaths.filter((p) => !this._boundMaterialPaths.has(p))

    if (unboundMaterialPaths.length > 0) {
      const addedEntries: AddedPrimEntry[] = []
      for (const primPath of unboundMaterialPaths) {
        addedEntries.push({ primPath, primType: '' })
      }
      this._sendPrimsAdded(addedEntries)
    }
  }

  /** unboundMaterialPruningSceneIndex.cpp:359-364 */
  private _isBoundMaterial(primPath: string): boolean {
    return _Contains(this._boundMaterialPaths, primPath)
  }

  /** unboundMaterialPruningSceneIndex.cpp:366-371 */
  private _wasAdded(primPath: string): boolean {
    return _Contains(this._addedMaterialPaths, primPath)
  }
}
