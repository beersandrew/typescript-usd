// Ported from OpenUSD 26.11.1: pxr/imaging/hd/legacyGeomSubsetSceneIndex.cpp,
//  pxr/imaging/hd/legacyGeomSubsetSceneIndex.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/legacyGeomSubsetSceneIndex.{h,cpp} (OpenUSD
// 26.11.1): turns the geom subsets and invisible components a legacy scene
// delegate reports in its mesh / basis curves topology into geomSubset child
// prims (HdGeomSubsetSchema), downstream of the emulation scene index.
//
// Divergences: SdfPath is a path string; the parent map is a Map keyed by
// path (std::map's ordered lower_bound walk in _PrimsRemoved becomes a prefix
// scan).

import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import {
  HdContainerDataSource,
  HdTypedSampledDataSource,
  HdRetainedTypedSampledDataSource,
  type HdDataSourceBase,
} from './dataSource.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdDataSourceLegacyPrim, HdSceneIndexEmulationTokens } from './dataSourceLegacyPrim.ts'
import { HdGeomSubsetSchema, HdGeomSubsetSchemaTokens } from './geomSubsetSchema.ts'
import { HdVisibilitySchema } from './visibilitySchema.ts'
import { HdMaterialBindingsSchema, HdMaterialBindingsSchemaTokens } from './materialBindingsSchema.ts'
import { HdMaterialBindingSchema } from './materialBindingSchema.ts'
import { HdPrimvarsSchema } from './primvarsSchema.ts'
import { HdBasisCurvesTopologySchema } from './basisCurvesTopologySchema.ts'
import { HdMeshTopologySchema } from './meshTopologySchema.ts'
import { HdPrimTypeSupportsGeomSubsets, HdPrimTypeTokens } from './tokens.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { Token as TfToken } from 'typescript-usd/tf'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexPrim,
  RemovedPrimEntry,
} from './sceneIndex.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** legacyGeomSubsetSceneIndex.cpp:41-45 */
const _tokens = {
  invisiblePoints: '__invisiblePoints',
  invisibleCurves: '__invisibleCurves',
  invisibleFaces: '__invisibleFaces',
} as const

function _ParentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}
function _NameToken(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
function _AppendChild(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`
}
function _HasPrefix(path: string, prefix: string): boolean {
  return prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
}

/** legacyGeomSubsetSceneIndex.cpp:49-59 */
function _GetSceneDelegate(primSource: HdContainerDataSource | undefined): HdSceneDelegate | null {
  if (primSource) {
    const ds = primSource.Get(HdSceneIndexEmulationTokens.sceneDelegate)
    if (ds instanceof HdTypedSampledDataSource) {
      return (ds.getTypedValue(0) as HdSceneDelegate | null) ?? null
    }
  }
  return null
}

/** legacyGeomSubsetSceneIndex.cpp:61-86 (set_differences) over sorted
 *  arrays. */
function _SetDifferences(before: string[], after: string[],
  added: string[], removed: string[], unchanged: string[]): void {
  let b = 0, a = 0
  while (b < before.length && a < after.length) {
    if (before[b]! < after[a]!) {
      removed.push(before[b++]!)
    } else if (after[a]! < before[b]!) {
      added.push(after[a++]!)
    } else {
      unchanged.push(before[b++]!)
      ++a
    }
  }
  while (b < before.length) removed.push(before[b++]!)
  while (a < after.length) added.push(after[a++]!)
}

interface _Subset {
  type: string
  indices: number[]
  visibility: boolean
  materialBinding: string
}

/** legacyGeomSubsetSceneIndex.cpp:88-255 */
class _HdDataSourceLegacyGeomSubset extends HdDataSourceLegacyPrim {
  private readonly _parentId: string
  private readonly _parentType: string

  /** legacyGeomSubsetSceneIndex.cpp:124-132 */
  private constructor(id: string, parentId: string, parentType: string, delegate: HdSceneDelegate) {
    super(id, HdPrimTypeTokens.geomSubset, delegate)
    this._parentId = parentId
    this._parentType = parentType
    TF_VERIFY(HdPrimTypeSupportsGeomSubsets(this._parentType))
  }

  static newSubset(id: string, parentId: string, parentType: string,
    delegate: HdSceneDelegate): _HdDataSourceLegacyGeomSubset {
    return new _HdDataSourceLegacyGeomSubset(id, parentId, parentType, delegate)
  }

  /** legacyGeomSubsetSceneIndex.cpp:134-144 */
  override getNames(): TfToken[] {
    return [
      HdGeomSubsetSchema.getSchemaToken(),
      HdVisibilitySchema.getSchemaToken(),
      HdMaterialBindingsSchema.getSchemaToken(),
      HdPrimvarsSchema.getSchemaToken(),
      HdSceneIndexEmulationTokens.sceneDelegate,
    ]
  }

  /** legacyGeomSubsetSceneIndex.cpp:146-206 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdGeomSubsetSchema.getSchemaToken()) {
      const subset = this._findSubset()
      if (subset) {
        return new HdGeomSubsetSchema.Builder()
          .setType(HdRetainedTypedSampledDataSource.new(subset.type))
          .setIndices(HdRetainedTypedSampledDataSource.new(subset.indices))
          .build()
      }
    }

    // We must intercept visibility and materialBindings because the
    // base class does not know how to compute these for geom subsets.
    if (name === HdVisibilitySchema.getSchemaToken()) {
      const subset = this._findSubset()
      if (subset) {
        return new HdVisibilitySchema.Builder()
          .setVisibility(HdRetainedTypedSampledDataSource.new(subset.visibility))
          .build()
      }
    }
    if (name === HdMaterialBindingsSchema.getSchemaToken()) {
      const subset = this._findSubset()
      if (subset && subset.materialBinding !== '') {
        const names = [HdMaterialBindingsSchemaTokens.allPurpose]
        const sources = [new HdMaterialBindingSchema.Builder()
          .setPath(HdRetainedTypedSampledDataSource.new(subset.materialBinding))
          .build()]
        return HdMaterialBindingsSchema.buildRetained(names, sources)
      }
    }

    // We must intercept primvars, otherwise the base class will try to look
    // them up via the scene delegate. We return empty primvars instead of
    // just a nullptr because a lot of stuff downstream expects everything
    // to have primvars.
    if (name === HdPrimvarsSchema.getSchemaToken()) {
      return _emptyPrimvarsDs ??= HdPrimvarsSchema.buildRetained([], [])
    }

    // To block everything else, and so prevent calling something on the
    // sceneDelegate for a geom subset path about which it knows nothing, we
    // only defer to base class for sceneDelegate.
    if (name === HdSceneIndexEmulationTokens.sceneDelegate) {
      return super.Get(name)
    }

    return undefined
  }

  /** legacyGeomSubsetSceneIndex.cpp:208-251. Returns null where upstream
   *  returns a default _Subset (whose operator bool is false). */
  private _findSubset(): _Subset | null {
    const name = _NameToken(this._id)
    const make = (type: string, indices: readonly number[] | undefined,
      visibility = false, materialBinding = ''): _Subset | null =>
      // _Subset::operator bool: a type and a non-empty index list.
      type !== '' && indices && indices.length > 0
        ? { type, indices: [...indices], visibility, materialBinding } : null
    if (this._parentType === HdPrimTypeTokens.basisCurves) {
      const topo = this._sceneDelegate.getBasisCurvesTopology(this._parentId)
      if (name === _tokens.invisibleCurves) {
        return make(HdGeomSubsetSchemaTokens.typeCurveSet, topo.getInvisibleCurves())
      }
      if (name === _tokens.invisiblePoints) {
        return make(HdGeomSubsetSchemaTokens.typePointSet, topo.getInvisiblePoints())
      }
    } else if (this._parentType === HdPrimTypeTokens.mesh) {
      const topo = this._sceneDelegate.getMeshTopology(this._parentId)
      if (name === _tokens.invisibleFaces) {
        return make(HdGeomSubsetSchemaTokens.typeFaceSet, topo.getInvisibleFaces())
      }
      if (name === _tokens.invisiblePoints) {
        return make(HdGeomSubsetSchemaTokens.typePointSet, topo.getInvisiblePoints())
      }
      for (const subset of topo.getGeomSubsets()) {
        if (_NameToken(subset.id) === name) {
          return make(HdGeomSubsetSchemaTokens.typeFaceSet, subset.indices, true, subset.materialId)
        }
      }
    } else {
      // XXX: At construction, we checked _parentType with
      // HdPrimTypeSupportsGeomSubsets(), so this should not happen.
      TF_CODING_ERROR(`Unsupported geomSubset parent type: \`${this._parentType}\``)
    }
    return null
  }
}

let _emptyPrimvarsDs: HdContainerDataSource | undefined

/** legacyGeomSubsetSceneIndex.h */
export class HdLegacyGeomSubsetSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // Parent prim path -> the subset paths listed for it (only prims with
  // subsets, legacyGeomSubsetSceneIndex.cpp:325-327).
  private _parentPrims = new Map<string, string[]>()

  /** legacyGeomSubsetSceneIndex.cpp:259-265 */
  static new(inputSceneIndex: HdSceneIndexBase): HdLegacyGeomSubsetSceneIndex {
    return new HdLegacyGeomSubsetSceneIndex(inputSceneIndex)
  }

  /** legacyGeomSubsetSceneIndex.cpp:267-270 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** legacyGeomSubsetSceneIndex.cpp:274-295 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    // If primPath is for a legacy subset, the input scene index will
    // not know anything about it. We can bail early if dataSorce is null.
    if (!prim.dataSource) {
      const parentPath = _ParentPath(primPath)
      if (this._parentPrims.has(parentPath)) {
        const parent = this._getInputSceneIndex().getPrim(parentPath)
        const delegate = _GetSceneDelegate(parent.dataSource)
        if (delegate) {
          return {
            primType: HdPrimTypeTokens.geomSubset,
            dataSource: _HdDataSourceLegacyGeomSubset.newSubset(
              primPath, parentPath, parent.primType, delegate),
          }
        }
      }
    }
    return prim
  }

  /** legacyGeomSubsetSceneIndex.cpp:297-310 */
  getChildPrimPaths(primPath: string): string[] {
    const paths = this._getInputSceneIndex().getChildPrimPaths(primPath)
    const subsets = this._parentPrims.get(primPath)
    return subsets ? [...paths, ...subsets] : paths
  }

  /** legacyGeomSubsetSceneIndex.cpp:312-340 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const newEntries: AddedPrimEntry[] = []
    for (const entry of entries) {
      if (!HdPrimTypeSupportsGeomSubsets(entry.primType)) continue
      const prim = this._getInputSceneIndex().getPrim(entry.primPath)
      const paths = this._listDelegateSubsets(entry.primPath, prim)
      if (paths.length === 0) continue
      // Only add prims with subsets to _parentPrims to save on memory.
      // (std::map::insert does not replace an existing entry.)
      if (!this._parentPrims.has(entry.primPath)) this._parentPrims.set(entry.primPath, paths)
      for (const path of paths) {
        newEntries.push({ primPath: path, primType: HdPrimTypeTokens.geomSubset })
      }
    }
    if (newEntries.length > 0) {
      this._sendPrimsAdded([...entries, ...newEntries])
      return
    }
    this._sendPrimsAdded(entries)
  }

  /** legacyGeomSubsetSceneIndex.cpp:342-355 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    for (const entry of entries) {
      for (const path of [...this._parentPrims.keys()]) {
        if (_HasPrefix(path, entry.primPath)) this._parentPrims.delete(path)
      }
    }
    this._sendPrimsRemoved(entries)
  }

  /** legacyGeomSubsetSceneIndex.cpp:357-445 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // XXX: We cache each parent prim's subset paths so we can tell when
    // dirty topology means one or more subsets were added or removed.
    const topologyLocators = new HdDataSourceLocatorSet([
      HdBasisCurvesTopologySchema.getDefaultLocator(),
      HdMeshTopologySchema.getDefaultLocator(),
    ])
    const emptyLocatorSet = new HdDataSourceLocatorSet([new HdDataSourceLocator()])

    const addedEntries: AddedPrimEntry[] = []
    const removedEntries: RemovedPrimEntry[] = []
    const dirtiedEntries: DirtiedPrimEntry[] = []

    for (const entry of entries) {
      if (!entry.dirtyLocators.intersects(topologyLocators)) {
        // If the change didn't affect topology, we can continue. This is
        // either not a mesh/basisCurves or the subsets didn't change.
        continue
      }
      const prim = this._getInputSceneIndex().getPrim(entry.primPath)
      // Immediately fetch the new list of subsets
      const after = this._listDelegateSubsets(entry.primPath, prim)
      let cached = this._parentPrims.get(entry.primPath)
      if (cached === undefined) {
        // This mesh/basisCurves did not previously have subsets
        // but some may have been added. If none have been added,
        // we can continue.
        if (after.length === 0) continue
        cached = []
      }
      const before = [...cached] // a copy!
      const added: string[] = [], removed: string[] = [], dirtied: string[] = []
      // update cached child paths
      this._parentPrims.set(entry.primPath, [...after])
      if (before.length === 0) {
        added.push(...after)
      } else if (after.length === 0) {
        removed.push(...before)
      } else {
        // set_differences requires before and after to be sorted
        _SetDifferences([...before].sort(), [...after].sort(), added, removed, dirtied)
      }
      for (const path of added) addedEntries.push({ primPath: path, primType: HdPrimTypeTokens.geomSubset })
      for (const path of removed) removedEntries.push({ primPath: path })
      for (const path of dirtied) dirtiedEntries.push({ primPath: path, dirtyLocators: emptyLocatorSet })
    }
    if (removedEntries.length > 0) {
      this._sendPrimsRemoved(removedEntries)
    }
    if (dirtiedEntries.length > 0) {
      this._sendPrimsDirtied([...entries, ...dirtiedEntries])
    } else {
      this._sendPrimsDirtied(entries)
    }
    if (addedEntries.length > 0) {
      this._sendPrimsAdded(addedEntries)
    }
  }

  /** legacyGeomSubsetSceneIndex.cpp:447-491 */
  private _listDelegateSubsets(parentPath: string, parentPrim: HdSceneIndexPrim): string[] {
    const paths: string[] = []
    if (!parentPrim.dataSource || !HdPrimTypeSupportsGeomSubsets(parentPrim.primType)) {
      return paths
    }
    const delegate = _GetSceneDelegate(parentPrim.dataSource)
    if (delegate) {
      if (parentPrim.primType === HdPrimTypeTokens.basisCurves) {
        const topo = delegate.getBasisCurvesTopology(parentPath)
        if (topo.getInvisibleCurves().length > 0) {
          paths.push(_AppendChild(parentPath, _tokens.invisibleCurves))
        }
        if (topo.getInvisiblePoints().length > 0) {
          paths.push(_AppendChild(parentPath, _tokens.invisiblePoints))
        }
      } else if (parentPrim.primType === HdPrimTypeTokens.mesh) {
        const topo = delegate.getMeshTopology(parentPath)
        for (const subset of topo.getGeomSubsets()) {
          paths.push(_AppendChild(parentPath, _NameToken(subset.id)))
        }
        if (topo.getInvisibleFaces().length > 0) {
          paths.push(_AppendChild(parentPath, _tokens.invisibleFaces))
        }
        if (topo.getInvisiblePoints().length > 0) {
          paths.push(_AppendChild(parentPath, _tokens.invisiblePoints))
        }
      }
    }
    return paths
  }
}
