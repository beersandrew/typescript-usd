// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceTetMesh.cpp,
//  pxr/usdImaging/usdImaging/dataSourceTetMesh.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceTetMesh.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  TetMeshSchema as HdTetMeshSchema,
  TetMeshSchemaTokens as HdTetMeshSchemaTokens,
  TetMeshTopologySchema as HdTetMeshTopologySchema,
  TetMeshTopologySchemaTokens as HdTetMeshTopologySchemaTokens,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { TetMesh as UsdGeomTetMesh } from 'typescript-usd/usdGeom'
import { UsdImagingDataSourceAttribute } from './dataSourceAttribute.ts'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** dataSourceTetMesh.h:21-43: a container data source representing tet mesh
 *  topology information. */
export class UsdImagingDataSourceTetMeshTopology extends HdContainerDataSource {
  /** dataSourceTetMesh.cpp:17-25 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdTetMesh: UsdGeomTetMesh,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdTetMesh: UsdGeomTetMesh,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceTetMeshTopology {
    return new UsdImagingDataSourceTetMeshTopology(sceneIndexPath, usdTetMesh, stageGlobals)
  }

  /** dataSourceTetMesh.cpp:27-35 */
  getNames(): string[] {
    return [
      HdTetMeshTopologySchemaTokens.orientation,
      HdTetMeshTopologySchemaTokens.tetVertexIndices,
      HdTetMeshTopologySchemaTokens.surfaceFaceVertexIndices,
    ]
  }

  /** dataSourceTetMesh.cpp:38-56 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdTetMeshTopologySchemaTokens.tetVertexIndices) {
      return UsdImagingDataSourceAttribute.new(
        this._usdTetMesh.getTetVertexIndicesAttr(),
        this._stageGlobals, this._sceneIndexPath,
        HdTetMeshTopologySchema.getTetVertexIndicesLocator())
    } else if (name === HdTetMeshTopologySchemaTokens.surfaceFaceVertexIndices) {
      return UsdImagingDataSourceAttribute.new(
        this._usdTetMesh.getSurfaceFaceVertexIndicesAttr(),
        this._stageGlobals, this._sceneIndexPath,
        HdTetMeshTopologySchema.getSurfaceFaceVertexIndicesLocator())
    } else if (name === HdTetMeshTopologySchemaTokens.orientation) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdTetMesh.getOrientationAttr(), this._stageGlobals)
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceTetMesh.h:49-71: a container data source representing data
 *  unique to tet meshes. */
export class UsdImagingDataSourceTetMesh extends HdContainerDataSource {
  /** dataSourceTetMesh.cpp:60-68 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdTetMesh: UsdGeomTetMesh,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdTetMesh: UsdGeomTetMesh,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceTetMesh {
    return new UsdImagingDataSourceTetMesh(sceneIndexPath, usdTetMesh, stageGlobals)
  }

  /** dataSourceTetMesh.cpp:70-77 */
  getNames(): string[] {
    return [
      HdTetMeshSchemaTokens.topology,
      HdTetMeshSchemaTokens.doubleSided,
    ]
  }

  /** dataSourceTetMesh.cpp:79-91 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdTetMeshSchemaTokens.topology) {
      return UsdImagingDataSourceTetMeshTopology.new(
        this._sceneIndexPath, this._usdTetMesh, this._stageGlobals)
    }
    if (name === HdTetMeshSchemaTokens.doubleSided) {
      return UsdImagingDataSourceAttribute.new<boolean>(
        this._usdTetMesh.getDoubleSidedAttr(), this._stageGlobals)
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceTetMesh.h:77-101: a prim data source representing
 *  UsdGeomTetMesh. */
export class UsdImagingDataSourceTetMeshPrim extends UsdImagingDataSourceGprim {
  /** dataSourceTetMesh.cpp:95-102 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
    // Note: DataSourceGprim handles the special PointBased primvars for us.
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceTetMeshPrim {
    return new UsdImagingDataSourceTetMeshPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceTetMesh.cpp:104-111 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdTetMeshSchemaTokens.tetMesh)

    return result
  }

  /** dataSourceTetMesh.cpp:113-125 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdTetMeshSchemaTokens.tetMesh) {
      return UsdImagingDataSourceTetMesh.new(
        this._getSceneIndexPath(),
        new UsdGeomTetMesh(this._getUsdPrim()),
        this._getStageGlobals())
    } else {
      return super.Get(name)
    }
  }

  /** dataSourceTetMesh.cpp:127-152 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = new HdDataSourceLocatorSet()

    // Property names are UsdGeomTokens.
    for (const propertyName of properties) {
      if (propertyName === 'tetVertexIndices' ||
          propertyName === 'surfaceFaceVertexIndices' ||
          propertyName === 'orientation') {
        locators.insert(HdTetMeshSchema.getTopologyLocator())
      }
      if (propertyName === 'doubleSided') {
        locators.insert(HdTetMeshSchema.getDoubleSidedLocator())
      }
    }

    // Give base classes a chance to invalidate.
    locators.insert(
      UsdImagingDataSourceGprim.invalidate(
        prim, subprim, properties, invalidationType))
    return locators
  }
}
