// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/sceneMaterialPruningSceneIndex.cpp,
//  pxr/imaging/hdsi/sceneMaterialPruningSceneIndex.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/sceneMaterialPruningSceneIndex.{h,cpp}.
//
// The copied notice vectors of _PrimsAdded/_PrimsDirtied are copies of the
// entry objects (and, for dirtied entries, of their locator sets) so that the
// edits below do not mutate the sender's entries. TRACE_FUNCTION scopes are
// not ported.

import {
  BuiltinMaterialSchema as HdBuiltinMaterialSchema,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  LegacyDisplayStyleSchema as HdLegacyDisplayStyleSchema,
  LegacyDisplayStyleSchemaTokens as HdLegacyDisplayStyleSchemaTokens,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  PrimTypeTokens as HdPrimTypeTokens,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'

/** HdsiSceneMaterialPruningSceneIndex_Impl::_Info
 *  (sceneMaterialPruningSceneIndex.cpp:21-27) */
class _Info {
  enabled = false
}

/** sceneMaterialPruningSceneIndex.cpp:29-36 */
function _MaterialIsFinal(primSource: HdContainerDataSource | undefined): boolean {
  const schema =
    HdLegacyDisplayStyleSchema.getFromParent(primSource)
  const ds = schema.getMaterialIsFinal()
  return !!ds && ds.getTypedValue(0.0)
}

/** sceneMaterialPruningSceneIndex.cpp:38-51 */
function _PruneMaterialBinding(primSource: HdContainerDataSource | undefined): boolean {
  // Prune the Material only if there is material binding, and the material
  // is not marked as final.
  const materialBindingSchema =
    HdMaterialBindingsSchema.getFromParent(primSource)

  if (!materialBindingSchema.isDefined()) {
    return false
  }

  return !_MaterialIsFinal(primSource)
}

/** sceneMaterialPruningSceneIndex.cpp:53-62 */
function _PruneMaterial(primSource: HdContainerDataSource | undefined): boolean {
  const schema =
    HdBuiltinMaterialSchema.getFromParent(primSource)
  const ds = schema.getBuiltinMaterial()
  const isBuiltinMaterial = !!ds && ds.getTypedValue(0.0)

  return !isBuiltinMaterial
}

/** This _PrimDataSource filters out bindings at binding token
 *  (sceneMaterialPruningSceneIndex.cpp:64-95) */
class _PrimDataSource extends HdContainerDataSource {
  static new(input: HdContainerDataSource, info: _Info): _PrimDataSource {
    return new _PrimDataSource(input, info)
  }

  private constructor(
    private readonly _input: HdContainerDataSource,
    private readonly _info: _Info,
  ) {
    super()
  }

  getNames(): string[] {
    return this._input.getNames()
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMaterialBindingsSchema.getSchemaToken() &&
        this._info.enabled && !_MaterialIsFinal(this._input)) {
      return undefined
    }
    return this._input.Get(name)
  }
}

/**
 * A scene index that prunes materials and material bindings.
 *
 * The scene index can be disabled.
 *
 * If enabled, prims of type material are pruned unless the bool data
 * source at a specified locator return true. The locator can be specified
 * by giving a builtinMaterialLocator to the inputArgs when constructing
 * the scene index.
 *
 * Furthermore, for a prim that is not a material, the materialBindings are
 * pruned unless the bool data source for materialIsFinal of the
 * HdLegacyDisplayStyleSchema returns true.
 *
 * Note that an alternative implementation could prune a material if the
 * all materialBindings targeting the material have been pruned.
 * However, we chose here to go for a simpler implementation and require
 * clients to tag materials as builtin.
 *
 * (sceneMaterialPruningSceneIndex.h:24-92)
 */
export class HdsiSceneMaterialPruningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _info: _Info

  /** sceneMaterialPruningSceneIndex.cpp:101-108 */
  static new(inputSceneIndex: HdSceneIndexBase): HdsiSceneMaterialPruningSceneIndex {
    return new HdsiSceneMaterialPruningSceneIndex(inputSceneIndex)
  }

  /** sceneMaterialPruningSceneIndex.cpp:341-346 */
  private constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this._info = new _Info()
  }

  /** Is scene index actually pruning?
   *  (sceneMaterialPruningSceneIndex.cpp:110-114) */
  getEnabled(): boolean {
    return this._info.enabled
  }

  /** Enable scene index to prune.
   *  (sceneMaterialPruningSceneIndex.cpp:116-160) */
  setEnabled(enabled: boolean): void {
    if (this._info.enabled === enabled) {
      return
    }

    this._info.enabled = enabled

    if (!this._isObserved()) {
      return
    }

    const addedEntries: AddedPrimEntry[] = []
    const dirtiedEntries: DirtiedPrimEntry[] = []

    for (const primPath of new HdSceneIndexPrimView(this._getInputSceneIndex())) {
      const prim = this._getInputSceneIndex().getPrim(primPath)

      if (prim.primType === HdPrimTypeTokens.material) {
        if (_PruneMaterial(prim.dataSource)) {
          if (this._info.enabled) {
            addedEntries.push({ primPath, primType: '' })
          } else {
            addedEntries.push({ primPath, primType: prim.primType })
          }
        }
      } else {
        if (_PruneMaterialBinding(prim.dataSource)) {
          const locators = new HdDataSourceLocatorSet(
            HdMaterialBindingsSchema.getDefaultLocator())
          dirtiedEntries.push({ primPath, dirtyLocators: locators })
        }
      }
    }

    if (addedEntries.length !== 0) {
      this._sendPrimsAdded(addedEntries)
    }
    if (dirtiedEntries.length !== 0) {
      this._sendPrimsDirtied(dirtiedEntries)
    }
  }

  /** sceneMaterialPruningSceneIndex.cpp:162-181 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (!prim.dataSource) {
      return prim
    }

    if (prim.primType === HdPrimTypeTokens.material) {
      if (this._info.enabled && _PruneMaterial(prim.dataSource)) {
        return { primType: '', dataSource: prim.dataSource }
      }
    } else {
      if (prim.dataSource) {
        return {
          primType: prim.primType,
          dataSource: _PrimDataSource.new(prim.dataSource, this._info),
        }
      }
    }
    return prim
  }

  /** sceneMaterialPruningSceneIndex.cpp:183-188 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** sceneMaterialPruningSceneIndex.cpp:190-244 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    if (!this._info.enabled) {
      this._sendPrimsAdded(entries)
      return
    }

    let i = 0

    while (i < entries.length) {
      const entry = entries[i]!
      if (entry.primType === HdPrimTypeTokens.material) {
        if (_PruneMaterial(
          this._getInputSceneIndex().getPrim(entry.primPath).dataSource)) {
          break
        }
      }
      i++
    }

    if (i === entries.length) {
      this._sendPrimsAdded(entries)
      return
    }

    const newEntries: AddedPrimEntry[] = entries.map((e) => ({ ...e }))

    {
      const entry = newEntries[i]!
      entry.primType = ''
    }
    i++

    while (i < entries.length) {
      const entry = newEntries[i]!
      if (entry.primType === HdPrimTypeTokens.material) {
        if (_PruneMaterial(
          this._getInputSceneIndex().getPrim(entry.primPath).dataSource)) {
          entry.primType = ''
        }
      }
      i++
    }

    this._sendPrimsAdded(newEntries)
  }

  /** sceneMaterialPruningSceneIndex.cpp:246-252 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** sceneMaterialPruningSceneIndex.cpp:254-274 */
  private _processDirtiedEntryHelper(
    entry: DirtiedPrimEntry,
    addedEntries: AddedPrimEntry[],
  ): void {
    // Add/Prune the material if it changed whether it is builtin or not
    if (!entry.dirtyLocators.contains(
      HdBuiltinMaterialSchema.getBuiltinMaterialLocator())) {
      return
    }

    const prim = this._getInputSceneIndex().getPrim(entry.primPath)
    if (prim.primType !== HdPrimTypeTokens.material) {
      return
    }
    if (_PruneMaterial(prim.dataSource)) {
      addedEntries.push({ primPath: entry.primPath, primType: '' })
    } else {
      addedEntries.push({ primPath: entry.primPath, primType: prim.primType })
    }
  }

  /** sceneMaterialPruningSceneIndex.cpp:277-339 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    if (!this._info.enabled) {
      this._sendPrimsDirtied(entries)
      return
    }

    const materialIsFinalLocator =
      HdLegacyDisplayStyleSchema.getDefaultLocator()
        .append(HdLegacyDisplayStyleSchemaTokens.materialIsFinal)

    const addedEntries: AddedPrimEntry[] = []

    let i = 0

    while (i < entries.length) {
      const entry = entries[i]!
      this._processDirtiedEntryHelper(entry, addedEntries)
      if (entry.dirtyLocators.intersects(materialIsFinalLocator)) {
        break
      }
      i++
    }
    if (i === entries.length) {
      if (addedEntries.length !== 0) {
        this._sendPrimsAdded(addedEntries)
      }
      this._sendPrimsDirtied(entries)
      return
    }

    const newEntries: DirtiedPrimEntry[] = entries.map((e) => ({
      primPath: e.primPath,
      dirtyLocators: new HdDataSourceLocatorSet(e.dirtyLocators),
    }))
    {
      const entry = newEntries[i]!
      entry.dirtyLocators.insert(
        HdMaterialBindingsSchema.getDefaultLocator())
    }
    i++

    while (i < entries.length) {
      const entry = newEntries[i]!
      this._processDirtiedEntryHelper(entry, addedEntries)
      if (entry.dirtyLocators.intersects(materialIsFinalLocator)) {
        entry.dirtyLocators.insert(
          HdMaterialBindingsSchema.getDefaultLocator())
      }
      i++
    }

    if (addedEntries.length !== 0) {
      this._sendPrimsAdded(addedEntries)
    }
    this._sendPrimsDirtied(newEntries)
  }
}
