// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceBindingAPI.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceBindingAPI.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceBindingAPI.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase, type DataSourceLocatorSet as HdDataSourceLocatorSet,
  type SampledDataSource as HdSampledDataSource,
} from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import { AttributeQuery as UsdAttributeQuery, type Attribute as UsdAttribute, type Prim as UsdPrim, type Rel as UsdRelationship } from 'typescript-usd/usd'
import {
  UsdImagingDataSourceAttributeNew, UsdImagingDataSourceMapped,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { Tokens as UsdSkelTokens } from 'typescript-usd/usdSkel'
import { UsdSkelImagingBindingSchema, UsdSkelImagingBindingSchemaTokens } from './bindingSchema.ts'

const _SdfPathType = TfType.declare('SdfPath')

// UsdSkelTokens->skelJoints / skelBlendShapes (pxr/usd/usdSkel/tokens.h);
// not among the Tokens of typescript-usd/usdSkel.
const _UsdSkelTokensSkelJoints = 'skel:joints'
const _UsdSkelTokensSkelBlendShapes = 'skel:blendShapes'

/** dataSourceBindingAPI.cpp:21-35 */
function _AuthoredAttributeDataSourceFactory(
  usdAttr: UsdAttribute,
  stageGlobals: UsdImagingDataSourceStageGlobals,
  sceneIndexPath: string,
  timeVaryingFlagLocator: HdDataSourceLocator,
): HdSampledDataSource | undefined {
  const query = new UsdAttributeQuery(usdAttr)
  if (!query.hasAuthoredValue()) {
    return undefined
  }

  return UsdImagingDataSourceAttributeNew(
    query, stageGlobals, sceneIndexPath, timeVaryingFlagLocator)
}

/** UsdRelationship::HasAuthoredTargets (pxr/usd/usd/relationship.cpp:287-291):
 *  HasAuthoredMetadata(SdfFieldKeys->TargetPaths). Same helper as
 *  usdImaging/src/dataSourceRenderPrims.ts. */
function _HasAuthoredTargets(rel: UsdRelationship): boolean {
  return rel.getMetadata('targetPaths') !== undefined
}

/** dataSourceBindingAPI.cpp:37-57 */
function _PathFromRelationshipDataSourceFactory(
  rel: UsdRelationship,
  _stageGlobals: UsdImagingDataSourceStageGlobals,
  _sceneIndexPath: string,
  _locator: HdDataSourceLocator,
): HdDataSourceBase | undefined {
  if (!_HasAuthoredTargets(rel)) {
    return undefined
  }

  const result = rel.getForwardedTargets()

  if (result.length === 0) {
    return new HdRetainedTypedSampledDataSource<string>('', _SdfPathType)
  }
  return new HdRetainedTypedSampledDataSource<string>(result[0]!, _SdfPathType)
}

/** dataSourceBindingAPI.cpp:59-113 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  return [
    new UsdImagingDataSourceMapped.RelationshipMapping(
      UsdSkelTokens.skelAnimationSource,
      new HdDataSourceLocator(UsdSkelImagingBindingSchemaTokens.animationSource),
      // Inherited.
      //
      // If not authored, this returns a nullptr and thus
      // the flattening scene index (through
      // HdFlattenedOverlayDataSourceProvider) picks it up from an
      // ancestor.
      //
      _PathFromRelationshipDataSourceFactory),

    new UsdImagingDataSourceMapped.RelationshipMapping(
      UsdSkelTokens.skelSkeleton,
      new HdDataSourceLocator(UsdSkelImagingBindingSchemaTokens.skeleton),
      // Inherited.
      //
      // Same as for skelAnimationSource applied.
      _PathFromRelationshipDataSourceFactory),

    new UsdImagingDataSourceMapped.AttributeMapping(
      _UsdSkelTokensSkelJoints,
      new HdDataSourceLocator(UsdSkelImagingBindingSchemaTokens.joints),
      // Inherited.
      //
      // If not authored, this returns a nullptr and thus the
      // flattening scene index picks it up from an ancestor.
      _AuthoredAttributeDataSourceFactory),

    new UsdImagingDataSourceMapped.AttributeMapping(
      _UsdSkelTokensSkelBlendShapes,
      new HdDataSourceLocator(UsdSkelImagingBindingSchemaTokens.blendShapes),
      // Not inherited
      //
      // The default factory always produces a data source.
    ),

    new UsdImagingDataSourceMapped.RelationshipMapping(
      UsdSkelTokens.skelBlendShapeTargets,
      new HdDataSourceLocator(UsdSkelImagingBindingSchemaTokens.blendShapeTargets),
      // Not inherited.
      //
      // The factory always produces a data source.
      UsdImagingDataSourceMapped.getPathArrayFromRelationshipDataSourceFactory()),
  ]
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** dataSourceBindingAPI.cpp:115-121 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(),
    UsdSkelImagingBindingSchema.getDefaultLocator())
}

/** dataSourceBindingAPI.h:21-55. A prim data source for UsdSkel's
 *  SkelBindingAPI. */
export class UsdSkelImagingDataSourceBindingAPI extends HdContainerDataSource {
  /** dataSourceBindingAPI.cpp:127-136 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdPrim: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdSkelImagingDataSourceBindingAPI {
    return new UsdSkelImagingDataSourceBindingAPI(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceBindingAPI.cpp:138-144 */
  getNames(): string[] {
    return [UsdSkelImagingBindingSchema.getSchemaToken()]
  }

  /** dataSourceBindingAPI.cpp:146-159 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingBindingSchema.getSchemaToken()) {
      return UsdImagingDataSourceMapped.new(
        this._usdPrim,
        this._sceneIndexPath,
        _GetMappings(),
        this._stageGlobals)
    }

    return undefined
  }

  /** dataSourceBindingAPI.cpp:161-175 */
  static invalidate(
    _prim: UsdPrim,
    _subprim: string,
    properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = UsdImagingDataSourceMapped.invalidate(
      properties, _GetMappings())

    return locators
  }
}
