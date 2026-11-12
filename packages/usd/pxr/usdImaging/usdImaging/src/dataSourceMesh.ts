// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceMesh.cpp,
//  pxr/usdImaging/usdImaging/dataSourceMesh.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceMesh.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MeshSchema as HdMeshSchema,
  MeshSchemaTokens as HdMeshSchemaTokens,
  MeshTopologySchema as HdMeshTopologySchema,
  MeshTopologySchemaTokens as HdMeshTopologySchemaTokens,
  SubdivisionTagsSchemaTokens as HdSubdivisionTagsSchemaTokens,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocator as HdDataSourceLocator,
} from 'typescript-usd/hd'
import { Mesh as UsdGeomMesh } from 'typescript-usd/usdGeom'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceAttribute } from './dataSourceAttribute.ts'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** dataSourceMesh.h:19-39: a container data source representing
 *  subdivision tags. */
export class UsdImagingDataSourceSubdivisionTags extends HdContainerDataSource {
  /** dataSourceMesh.cpp:14-20 */
  private constructor(
    private readonly _usdMesh: UsdGeomMesh,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    usdMesh: UsdGeomMesh, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceSubdivisionTags {
    return new UsdImagingDataSourceSubdivisionTags(usdMesh, stageGlobals)
  }

  /** dataSourceMesh.cpp:22-35 */
  getNames(): string[] {
    return [
      HdSubdivisionTagsSchemaTokens.faceVaryingLinearInterpolation,
      HdSubdivisionTagsSchemaTokens.interpolateBoundary,
      HdSubdivisionTagsSchemaTokens.triangleSubdivisionRule,
      HdSubdivisionTagsSchemaTokens.cornerIndices,
      HdSubdivisionTagsSchemaTokens.cornerSharpnesses,
      HdSubdivisionTagsSchemaTokens.creaseIndices,
      HdSubdivisionTagsSchemaTokens.creaseLengths,
      HdSubdivisionTagsSchemaTokens.creaseSharpnesses,
    ]
  }

  /** dataSourceMesh.cpp:37-67 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdSubdivisionTagsSchemaTokens.faceVaryingLinearInterpolation) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdMesh.getFaceVaryingLinearInterpolationAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.interpolateBoundary) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdMesh.getInterpolateBoundaryAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.triangleSubdivisionRule) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdMesh.getTriangleSubdivisionRuleAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.cornerIndices) {
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getCornerIndicesAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.cornerSharpnesses) {
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getCornerSharpnessesAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.creaseIndices) {
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getCreaseIndicesAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.creaseLengths) {
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getCreaseLengthsAttr(), this._stageGlobals)
    } else if (name === HdSubdivisionTagsSchemaTokens.creaseSharpnesses) {
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getCreaseSharpnessesAttr(), this._stageGlobals)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceMesh.h:45-67: a container data source representing mesh
 *  topology. */
export class UsdImagingDataSourceMeshTopology extends HdContainerDataSource {
  private static _faceVertexCountsLocator: HdDataSourceLocator | undefined
  private static _faceVertexIndicesLocator: HdDataSourceLocator | undefined
  private static _holeIndicesLocator: HdDataSourceLocator | undefined

  /** dataSourceMesh.cpp:71-79 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdMesh: UsdGeomMesh,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdMesh: UsdGeomMesh, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceMeshTopology {
    return new UsdImagingDataSourceMeshTopology(sceneIndexPath, usdMesh, stageGlobals)
  }

  /** dataSourceMesh.cpp:81-90 */
  getNames(): string[] {
    return [
      HdMeshTopologySchemaTokens.faceVertexCounts,
      HdMeshTopologySchemaTokens.faceVertexIndices,
      HdMeshTopologySchemaTokens.holeIndices,
      HdMeshTopologySchemaTokens.orientation,
    ]
  }

  /** dataSourceMesh.cpp:92-118 */
  Get(name: string): HdDataSourceBase | undefined {
    const T = UsdImagingDataSourceMeshTopology
    if (name === HdMeshTopologySchemaTokens.faceVertexCounts) {
      const locator = T._faceVertexCountsLocator ??=
        HdMeshTopologySchema.getDefaultLocator().append(name)
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getFaceVertexCountsAttr(), this._stageGlobals,
        this._sceneIndexPath, locator)
    } else if (name === HdMeshTopologySchemaTokens.faceVertexIndices) {
      const locator = T._faceVertexIndicesLocator ??=
        HdMeshTopologySchema.getDefaultLocator().append(name)
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getFaceVertexIndicesAttr(), this._stageGlobals,
        this._sceneIndexPath, locator)
    } else if (name === HdMeshTopologySchemaTokens.holeIndices) {
      const locator = T._holeIndicesLocator ??=
        HdMeshTopologySchema.getDefaultLocator().append(name)
      return UsdImagingDataSourceAttribute.new(
        this._usdMesh.getHoleIndicesAttr(), this._stageGlobals,
        this._sceneIndexPath, locator)
    } else if (name === HdMeshTopologySchemaTokens.orientation) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdMesh.getOrientationAttr(), this._stageGlobals)
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceMesh.h:74-96: a container data source representing data
 *  unique to meshes. */
export class UsdImagingDataSourceMesh extends HdContainerDataSource {
  /** dataSourceMesh.cpp:122-130 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdMesh: UsdGeomMesh,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdMesh: UsdGeomMesh, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceMesh {
    return new UsdImagingDataSourceMesh(sceneIndexPath, usdMesh, stageGlobals)
  }

  /** dataSourceMesh.cpp:132-141 */
  getNames(): string[] {
    return [
      HdMeshSchemaTokens.topology,
      HdMeshSchemaTokens.subdivisionScheme,
      HdMeshSchemaTokens.doubleSided,
      HdMeshSchemaTokens.subdivisionTags,
    ]
  }

  /** dataSourceMesh.cpp:143-167 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMeshSchemaTokens.topology) {
      return UsdImagingDataSourceMeshTopology.new(
        this._sceneIndexPath, this._usdMesh, this._stageGlobals)
    }

    if (name === HdMeshSchemaTokens.subdivisionScheme) {
      return UsdImagingDataSourceAttribute.new<string>(
        this._usdMesh.getSubdivisionSchemeAttr(), this._stageGlobals)
    }

    if (name === HdMeshSchemaTokens.doubleSided) {
      return UsdImagingDataSourceAttribute.new<boolean>(
        this._usdMesh.getDoubleSidedAttr(), this._stageGlobals)
    }

    if (name === HdMeshSchemaTokens.subdivisionTags) {
      return UsdImagingDataSourceSubdivisionTags.new(
        this._usdMesh, this._stageGlobals)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceMesh.h:102-126: a prim data source representing UsdGeomMesh. */
export class UsdImagingDataSourceMeshPrim extends UsdImagingDataSourceGprim {
  /** dataSourceMesh.cpp:172-179 */
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
  ): UsdImagingDataSourceMeshPrim {
    return new UsdImagingDataSourceMeshPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceMesh.cpp:181-188 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdMeshSchemaTokens.mesh)

    return result
  }

  /** dataSourceMesh.cpp:190-201 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMeshSchemaTokens.mesh) {
      return UsdImagingDataSourceMesh.new(
        this._getSceneIndexPath(),
        new UsdGeomMesh(this._getUsdPrim(), this._getUsdPrim().getStage()),
        this._getStageGlobals())
    } else {
      return super.Get(name)
    }
  }

  /** dataSourceMesh.cpp:203-247 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = new HdDataSourceLocatorSet()

    // Property names are UsdGeomTokens.
    for (const propertyName of properties) {
      if (propertyName === 'subdivisionScheme') {
        locators.insert(HdMeshSchema.getSubdivisionSchemeLocator())
      }

      if (propertyName === 'faceVertexCounts' ||
          propertyName === 'faceVertexIndices' ||
          propertyName === 'holeIndices' ||
          propertyName === 'orientation') {
        locators.insert(HdMeshSchema.getTopologyLocator())
      }

      if (propertyName === 'interpolateBoundary' ||
          propertyName === 'faceVaryingLinearInterpolation' ||
          propertyName === 'triangleSubdivisionRule' ||
          propertyName === 'creaseIndices' ||
          propertyName === 'creaseLengths' ||
          propertyName === 'creaseSharpnesses' ||
          propertyName === 'cornerIndices' ||
          propertyName === 'cornerSharpnesses') {
        // XXX UsdGeomTokens->creaseMethod, when we add support for that.
        locators.insert(HdMeshSchema.getSubdivisionTagsLocator())
      }

      if (propertyName === 'doubleSided') {
        locators.insert(HdMeshSchema.getDoubleSidedLocator())
      }
    }

    // Give base classes a chance to invalidate.
    locators.insert(
      UsdImagingDataSourceGprim.invalidate(
        prim, subprim, properties, invalidationType))
    return locators
  }
}
