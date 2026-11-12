// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/tetMeshConversionSceneIndex.cpp,
//  pxr/imaging/hdsi/tetMeshConversionSceneIndex.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/tetMeshConversionSceneIndex.{h,cpp}.
//
// Divergences:
// - The function-local static subdivisionScheme data source is a
//   module-level lazily initialized value.

import type { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MeshSchema as HdMeshSchema,
  MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchema as HdMeshTopologySchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TetMeshSchema as HdTetMeshSchema,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
  TokenDataSource as HdTokenDataSource,
} from 'typescript-usd/hd'

// VtIntArray (HdRetainedTypedSampledDataSource<VtIntArray>,
// tetMeshConversionSceneIndex.cpp:59-64).
const _VtIntArrayType = TfType.declare('int[]')

/** tetMeshConversionSceneIndex.cpp:26-67 */
function _ComputeMeshTopologyDataSource(
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  const meshTopoSchema =
    HdTetMeshSchema.getFromParent(primDataSource).GetTopology()
  // Get the TetVertexIndices
  const surfaceFaceIndicesDS =
    meshTopoSchema.getSurfaceFaceVertexIndices()

  if (!surfaceFaceIndicesDS) {
    return new HdMeshTopologySchema.Builder()
      .setOrientation(meshTopoSchema.getOrientation())
      .build()
  }

  // Compute the FaceVertexIndices and FaceVertexIndicesCounts
  const surfaceFaceIndices = surfaceFaceIndicesDS.getTypedValue(0.0)

  const n = surfaceFaceIndices.length
  const faceVertexCounts = new Array<number>(n).fill(3)

  const faceVertexIndices: number[] = []
  for (const faceIndices of surfaceFaceIndices as Iterable<GfVec3i>) {
    faceVertexIndices.push(faceIndices.get(0))
    faceVertexIndices.push(faceIndices.get(1))
    faceVertexIndices.push(faceIndices.get(2))
  }

  return new HdMeshTopologySchema.Builder()
    .setFaceVertexCounts(
      new HdRetainedTypedSampledDataSource<number[]>(
        faceVertexCounts, _VtIntArrayType))
    .setFaceVertexIndices(
      new HdRetainedTypedSampledDataSource<number[]>(
        faceVertexIndices, _VtIntArrayType))
    .setOrientation(meshTopoSchema.getOrientation())
    .build()
}

let _subdivisionSchemeDataSource: HdTokenDataSource | undefined

/** tetMeshConversionSceneIndex.cpp:69-109 */
class _MeshDataSource extends HdContainerDataSource {
  static new(primDataSource: HdContainerDataSource | undefined): _MeshDataSource {
    return new _MeshDataSource(primDataSource)
  }

  /** tetMeshConversionSceneIndex.cpp:103-106 */
  private constructor(private readonly _primDataSource: HdContainerDataSource | undefined) {
    super()
  }

  /** tetMeshConversionSceneIndex.cpp:75-82 */
  getNames(): string[] {
    return [
      HdMeshSchemaTokens.topology,
      HdMeshSchemaTokens.subdivisionScheme,
      HdMeshSchemaTokens.doubleSided,
    ]
  }

  /** tetMeshConversionSceneIndex.cpp:84-100 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMeshSchemaTokens.topology) {
      return _ComputeMeshTopologyDataSource(this._primDataSource)
    }
    if (name === HdMeshSchemaTokens.subdivisionScheme) {
      return _subdivisionSchemeDataSource ??=
        HdRetainedTypedSampledDataSource.new<string>(
          PxOsdOpenSubdivTokens.catmullClark)
    }
    if (name === HdMeshSchemaTokens.doubleSided) {
      return HdTetMeshSchema.getFromParent(this._primDataSource)
        .getDoubleSided()
    }
    return undefined
  }
}

/** tetMeshConversionSceneIndex.cpp:111-121 */
function _ComputePrimDataSource(
  _primPath: string,
  primDataSource: HdContainerDataSource | undefined,
): HdContainerDataSource {
  return HdOverlayContainerDataSource.new(
    HdRetainedContainerDataSource.new(
      [HdMeshSchemaTokens.mesh],
      [_MeshDataSource.new(primDataSource)]),
    primDataSource)
}

/** tetMeshConversionSceneIndex.h:21-61
 *
 *  A scene index converting TetMeshes into standard triangle based Meshes. */
export class HdsiTetMeshConversionSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** tetMeshConversionSceneIndex.cpp:125-131 */
  static new(inputSceneIndex: HdSceneIndexBase): HdsiTetMeshConversionSceneIndex {
    return new HdsiTetMeshConversionSceneIndex(inputSceneIndex)
  }

  /** tetMeshConversionSceneIndex.cpp:133-137 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** tetMeshConversionSceneIndex.cpp:139-149 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (prim.primType === HdPrimTypeTokens.tetMesh) {
      return {
        primType: HdPrimTypeTokens.mesh,
        dataSource: _ComputePrimDataSource(primPath, prim.dataSource) }
    }
    return prim
  }

  /** tetMeshConversionSceneIndex.cpp:151-156 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** tetMeshConversionSceneIndex.cpp:159-188 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    // Gather prims added indices for Tet Mesh prims
    const tetMeshIndices: number[] = []
    for (let i = 0; i < entries.length; ++i) {
      if (entries[i]!.primType === HdPrimTypeTokens.tetMesh) {
        tetMeshIndices.push(i)
      }
    }

    if (tetMeshIndices.length === 0) {
      this._sendPrimsAdded(entries)
      return
    }

    // Change the prim types for Tet Meshes to Mesh
    const entriesToAdd: AddedPrimEntry[] = entries.map((e) => ({ ...e }))
    for (const i of tetMeshIndices) {
      entriesToAdd[i]!.primType = HdPrimTypeTokens.mesh
    }

    this._sendPrimsAdded(entriesToAdd)
  }

  /** tetMeshConversionSceneIndex.cpp:190-200 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    this._sendPrimsRemoved(entries)
  }

  /** tetMeshConversionSceneIndex.cpp:202-247 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (!this._isObserved()) {
      return
    }

    // Gather indices for Tet Mesh locators that need to be updated.
    const tetMeshIndices: number[] = []
    for (let i = 0; i < entries.length; ++i) {
      const dirtyLocators = entries[i]!.dirtyLocators
      if (dirtyLocators.contains(HdDataSourceLocator.EmptyLocator)) {
        // If the locator set contains the empty locator, it means it will
        // intersect everything.  It does not need to be updated.
        continue
      }
      if (dirtyLocators.intersects(HdTetMeshSchema.getDefaultLocator())) {
        tetMeshIndices.push(i)
      }
    }

    if (tetMeshIndices.length === 0) {
      this._sendPrimsDirtied(entries)
      return
    }

    // Convert TetMesh Locators to Mesh Locators
    const newEntries: DirtiedPrimEntry[] = entries.map((e) => ({ ...e }))
    for (const i of tetMeshIndices) {
      const entry = newEntries[i]!
      const dirtyLocators = new HdDataSourceLocatorSet(entry.dirtyLocators)
      entry.dirtyLocators = dirtyLocators
      // The code that populated tetMeshIndices skips anything that
      // contains the empty locator.

      if (dirtyLocators.intersects(HdTetMeshSchema.getDoubleSidedLocator())) {
        dirtyLocators.append(HdMeshSchema.getDoubleSidedLocator())
      }
      if (dirtyLocators.intersects(HdTetMeshSchema.getTopologyLocator())) {
        dirtyLocators.append(HdMeshSchema.getTopologyLocator())
      }
    }

    this._sendPrimsDirtied(newEntries)
  }
}
