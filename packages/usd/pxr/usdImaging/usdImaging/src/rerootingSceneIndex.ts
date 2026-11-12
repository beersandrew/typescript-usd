// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/rerootingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/rerootingSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/rerootingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: SdfPathTable<std::monostate> _targetRootPathsTable is a set of
// path strings; SdfPathTable implicitly contains every ancestor of an
// inserted path, which _ChildrenFromTable reproduces.

import {
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry, type DirtiedPrimEntry, type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { MapFunction as PcpMapFunction } from 'typescript-usd/pcp'
import {
  UsdImagingRerootingContainerDataSource, UsdImaging_MapSourceToTarget, UsdImaging_MapTargetToSource,
} from './rerootingContainerDataSource.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

const _GetNameToken = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const _AppendChild = (path: string, name: string): string => path === '/' ? `/${name}` : `${path}/${name}`
const _HasStrictPrefix = (path: string, prefix: string): boolean =>
  path !== prefix && (prefix === '/' ? path.startsWith('/') : path.startsWith(prefix + '/'))

/**
 * rerootingSceneIndex.h:19-90.
 *
 * Applies a bijective namespace mapping, as represented by a PcpMapFunction,
 * to the input namespace.
 *
 * Data sources containing paths will be updated accordingly. That is,
 * the namespace mapping function will be applied to path-valued data.
 *
 * Note that this can be used as prefixing scene index by mapping a
 * path to the root path.  It can also use to isolate part of the namespace
 * by using a namespace mapping that maps a specific path to itself but
 * does not include a root identity mapping.  See PcpMapFunction for more.
 * The SdfLayerOffset component of the path mapping is not applied.
 */
export class UsdImagingRerootingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _mapFn: PcpMapFunction
  private readonly _targetRootPathsTable = new Set<string>()

  /** rerootingSceneIndex.h:35-56 (both overloads). */
  static new(inputScene: HdSceneIndexBase, mapFn: PcpMapFunction): UsdImagingRerootingSceneIndex
  static new(inputScene: HdSceneIndexBase, srcPrefix: string, dstPrefix: string): UsdImagingRerootingSceneIndex
  static new(
    inputScene: HdSceneIndexBase, mapFnOrSrcPrefix: PcpMapFunction | string, dstPrefix?: string,
  ): UsdImagingRerootingSceneIndex {
    const mapFn = mapFnOrSrcPrefix instanceof PcpMapFunction
      ? mapFnOrSrcPrefix
      : PcpMapFunction.create([[mapFnOrSrcPrefix, dstPrefix ?? '']])
    return new UsdImagingRerootingSceneIndex(inputScene, mapFn)
  }

  /** rerootingSceneIndex.cpp:16-27 */
  protected constructor(inputScene: HdSceneIndexBase, mapFn: PcpMapFunction) {
    super(inputScene)
    this._mapFn = mapFn
    // Populate _targetRootPathsTable with all mapped paths.
    for (const [, target] of mapFn.getSourceToTargetMap()) {
      this._targetRootPathsTable.add(target)
    }
  }

  /** rerootingSceneIndex.cpp:31-45 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const inputScenePath = UsdImaging_MapTargetToSource(this._mapFn, primPath)
    if (inputScenePath === '') {
      return { primType: '', dataSource: undefined }
    }
    const prim = this._getInputSceneIndex().getPrim(inputScenePath)
    if (prim.dataSource) {
      return {
        primType: prim.primType,
        dataSource: UsdImagingRerootingContainerDataSource.new(prim.dataSource, this._mapFn),
      }
    }
    return prim
  }

  /** rerootingSceneIndex.cpp:47-75 */
  getChildPrimPaths(primPath: string): string[] {
    const childPaths: string[] = []
    const inputScenePath = UsdImaging_MapTargetToSource(this._mapFn, primPath)
    if (inputScenePath !== '') {
      for (const childSourcePath of this._getInputSceneIndex().getChildPrimPaths(inputScenePath)) {
        // Return child paths in the rerooted namespace.
        childPaths.push(_AppendChild(primPath, _GetNameToken(childSourcePath)))
      }
    }
    // Append childPaths implied by mapping entries below primPath.
    // (SdfPathTable::FindSubtreeRange over the implied children of primPath.)
    const seen = new Set<string>()
    for (const target of this._targetRootPathsTable) {
      if (!_HasStrictPrefix(target, primPath)) continue
      const rest = target.slice(primPath === '/' ? 1 : primPath.length + 1)
      const slash = rest.indexOf('/')
      const child = _AppendChild(primPath, slash < 0 ? rest : rest.slice(0, slash))
      if (seen.has(child)) continue
      seen.add(child)
      if (TF_VERIFY(child.slice(0, child.lastIndexOf('/')) === (primPath === '/' ? '' : primPath))) {
        childPaths.push(child)
      }
    }
    return childPaths
  }

  /** rerootingSceneIndex.cpp:77-95 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const adjustedEntries: AddedPrimEntry[] = []
    for (const entry of entries) {
      const entryPath = UsdImaging_MapSourceToTarget(this._mapFn, entry.primPath)
      if (entryPath !== '') {
        adjustedEntries.push({ primPath: entryPath, primType: entry.primType })
      }
    }
    this._sendPrimsAdded(adjustedEntries)
  }

  /** rerootingSceneIndex.cpp:97-115 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    const adjustedEntries: RemovedPrimEntry[] = []
    for (const entry of entries) {
      const entryPath = UsdImaging_MapSourceToTarget(this._mapFn, entry.primPath)
      if (entryPath !== '') {
        adjustedEntries.push({ primPath: entryPath })
      }
    }
    this._sendPrimsRemoved(adjustedEntries)
  }

  /** rerootingSceneIndex.cpp:117-135 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    const adjustedEntries: DirtiedPrimEntry[] = []
    for (const entry of entries) {
      const entryPath = UsdImaging_MapSourceToTarget(this._mapFn, entry.primPath)
      if (entryPath !== '') {
        adjustedEntries.push({ primPath: entryPath, dirtyLocators: entry.dirtyLocators })
      }
    }
    this._sendPrimsDirtied(adjustedEntries)
  }
}
