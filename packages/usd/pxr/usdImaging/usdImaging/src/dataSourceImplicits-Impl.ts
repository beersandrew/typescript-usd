// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceImplicits-Impl.h,
//  pxr/usdImaging/usdImaging/cubeAdapter.cpp
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceImplicits-Impl.h
// (OpenUSD 26.11.1).
//
// Divergence: upstream UsdImagingDataSourceImplicitsPrim is a class template
// over the USD schema type (for UsdSchemaType::GetSchemaAttributeNames) and
// the Hydra schema type (for its schema token and default locator); each
// adapter instantiates it once (e.g. cubeAdapter.cpp:28-30). Here
// UsdImagingDataSourceImplicitsPrim.Instantiate(usdSchemaTypeName,
// HdSchemaType) returns that instantiation: an object with the class's
// static New and Invalidate.
//
// The TypeScript UsdGeom schema classes have no GetSchemaAttributeNames, so
// the schema-local attribute names (includeInherited = false) of the
// implicit-surface schemas are listed below from the generated
// pxr/usd/usdGeom/<schema>.cpp.

import {
  DataSourceLocator as HdDataSourceLocator,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceGprim } from './dataSourceGprim.ts'
import { UsdImagingDataSourceMapped } from './dataSourceMapped.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** UsdGeom<Schema>::GetSchemaAttributeNames(false) for the implicit-surface
 *  schemas (the localNames of usdGeom/cube.cpp:137-152,
 *  sphere.cpp:137-152, cylinder.cpp:171-188, cylinder_1.cpp:188-206,
 *  cone.cpp:171-188, capsule.cpp:171-188, capsule_1.cpp:188-206,
 *  plane.cpp:188-206). */
const _schemaAttributeNames: Record<string, readonly string[]> = {
  Cube: ['size', 'extent'],
  Sphere: ['radius', 'extent'],
  Cylinder: ['height', 'radius', 'axis', 'extent'],
  Cylinder_1: ['height', 'radiusTop', 'radiusBottom', 'axis', 'extent'],
  Cone: ['height', 'radius', 'axis', 'extent'],
  Capsule: ['height', 'radius', 'axis', 'extent'],
  Capsule_1: ['height', 'radiusTop', 'radiusBottom', 'axis', 'extent'],
  Plane: ['doubleSided', 'width', 'length', 'axis', 'extent'],
}

/** The HdSchemaType template parameter: a generated Hydra schema class. */
export interface UsdImagingDataSourceImplicitsHdSchemaType {
  getSchemaToken(): string
  getDefaultLocator(): HdDataSourceLocator
}

/** One instantiation UsdImagingDataSourceImplicitsPrim<UsdSchemaType,
 *  HdSchemaType>: its static members (see the header). */
export interface UsdImagingDataSourceImplicitsPrimType {
  'new'(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceImplicitsPrim
  invalidate(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet
}

/** dataSourceImplicits-Impl.h:17-104: a prim data source for a cube, ... */
export class UsdImagingDataSourceImplicitsPrim extends UsdImagingDataSourceGprim {
  /** dataSourceImplicits-Impl.h:96-103. Private constructor, use static
   *  New() instead. */
  private constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _hdSchemaType: UsdImagingDataSourceImplicitsHdSchemaType,
    private readonly _mappings: UsdImagingDataSourceMapped.PropertyMappings,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** The template instantiation for UsdSchemaType = the UsdGeom schema
   *  named `usdSchemaTypeName` and HdSchemaType = `hdSchemaType`. */
  static instantiate(
    usdSchemaTypeName: string,
    hdSchemaType: UsdImagingDataSourceImplicitsHdSchemaType,
  ): UsdImagingDataSourceImplicitsPrimType {
    const usdSchemaAttributeNames = _schemaAttributeNames[usdSchemaTypeName]
    if (!usdSchemaAttributeNames) {
      TF_CODING_ERROR(`UsdImagingDataSourceImplicitsPrim: unsupported schema '${usdSchemaTypeName}'`)
    }

    /** dataSourceImplicits-Impl.h:67-86 */
    const _GetPropertyMappings = (): UsdImagingDataSourceMapped.PropertyMapping[] => {
      const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

      for (const usdName of usdSchemaAttributeNames ?? []) {
        // UsdGeomTokens->extent
        if (usdName === 'extent') {
          // Skip extent since this is already dealt with
          // in UsdImagingDataSourcePrim::Get.
          continue
        }
        result.push(
          new UsdImagingDataSourceMapped.AttributeMapping(
            usdName, new HdDataSourceLocator(usdName)))
      }
      return result
    }

    /** dataSourceImplicits-Impl.h:88-94 */
    let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined
    const _GetMappings = (): UsdImagingDataSourceMapped.PropertyMappings =>
      _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
        _GetPropertyMappings(), hdSchemaType.getDefaultLocator())

    return {
      new(sceneIndexPath, usdPrim, stageGlobals) {
        return new UsdImagingDataSourceImplicitsPrim(
          sceneIndexPath, usdPrim, stageGlobals, hdSchemaType, _GetMappings())
      },

      /** dataSourceImplicits-Impl.h:49-64 */
      invalidate(prim, subprim, properties, invalidationType) {
        const locators =
          UsdImagingDataSourceMapped.invalidate(
            properties, _GetMappings())

        locators.insert(
          UsdImagingDataSourceGprim.invalidate(
            prim, subprim, properties, invalidationType))

        return locators
      },
    }
  }

  /** dataSourceImplicits-Impl.h:30-35 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(this._hdSchemaType.getSchemaToken())
    return result
  }

  /** dataSourceImplicits-Impl.h:36-47 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === this._hdSchemaType.getSchemaToken()) {
      return UsdImagingDataSourceMapped.new(
        this._getUsdPrim(),
        this._getSceneIndexPath(),
        this._mappings,
        this._getStageGlobals())
    }

    return super.Get(name)
  }
}
