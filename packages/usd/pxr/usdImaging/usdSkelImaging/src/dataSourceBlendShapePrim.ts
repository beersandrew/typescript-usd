// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourceBlendShapePrim.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourceBlendShapePrim.h,
//  pxr/usd/usdSkel/blendShape.cpp, pxr/usd/usdSkel/inbetweenShape.cpp
// Copyright 2016, 2018, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourceBlendShapePrim.{h,cpp}
// (OpenUSD 26.11.1).
//
// UsdSkelBlendShape::GetAuthoredInbetweens / GetInbetween and
// UsdSkelInbetweenShape::GetWeight / GetNormalOffsetsAttr are spelled out
// here from pxr/usd/usdSkel/{blendShape,inbetweenShape}.cpp because the
// typescript-usd/usdSkel InbetweenShape does not expose them in that form.

import {
  ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'
import {
  UsdImagingDataSourceAttribute, UsdImagingDataSourceGprim, UsdImagingDataSourceMapped,
  UsdImagingDataSourcePrim,
  type UsdImagingDataSourceStageGlobals, type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import {
  UsdSkelImagingBlendShapeSchema, UsdSkelImagingBlendShapeSchemaTokens,
} from './blendShapeSchema.ts'
import { UsdSkelImagingInbetweenShapeSchemaTokens } from './inbetweenShapeSchema.ts'

/** dataSourceBlendShapePrim.cpp:23-27 _usdSkelPrefixTokens */
const _usdSkelPrefixTokens = { inbetweens: 'inbetweens' }

// pxr/usd/usdSkel/inbetweenShape.cpp _tokens.
const _inbetweensPrefix = 'inbetweens:'
const _normalOffsetsSuffix = ':normalOffsets'

/** UsdSkelInbetweenShape::_IsValidInbetweenName (inbetweenShape.cpp:51-61). */
function _IsValidInbetweenName(name: string): boolean {
  return name.startsWith(_inbetweensPrefix) && !name.endsWith(_normalOffsetsSuffix)
}

/** UsdSkelInbetweenShape: a handle to the inbetween attribute
 *  (pxr/usd/usdSkel/inbetweenShape.{h,cpp}). */
class _UsdSkelInbetweenShape {
  constructor(private readonly _attr: UsdAttribute) {}

  /** inbetweenShape.cpp:139-144 */
  getWeight(): number | undefined {
    const weight = this._attr.getMetadata('weight')
    return typeof weight === 'number' ? weight : undefined
  }

  getAttr(): UsdAttribute { return this._attr }

  /** inbetweenShape.cpp:104-125 (_GetNormalOffsetsAttr(create = false)) */
  getNormalOffsetsAttr(): UsdAttribute | undefined {
    const prim = this._attr.getStage().getPrim(this._attr.primPath)
    const attr = prim?.getAttr(this._attr.name + _normalOffsetsSuffix)
    return attr && !attr.isRelationship && attr.isValid() ? attr : undefined
  }
}

/** UsdSkelBlendShape::GetInbetween (blendShape.cpp:192-197) with
 *  UsdSkelInbetweenShape::_MakeNamespaced (inbetweenShape.cpp:72-92); an
 *  invalid inbetween is undefined. */
function _GetInbetween(prim: UsdPrim, name: string): _UsdSkelInbetweenShape | undefined {
  let attrName = name.startsWith(_inbetweensPrefix) ? name : _inbetweensPrefix + name
  if (!_IsValidInbetweenName(attrName)) {
    attrName = ''
  }
  if (attrName === '') {
    return undefined
  }
  const attr = prim.getAttr(attrName)
  if (!attr || attr.isRelationship || !attr.isValid()) {
    return undefined
  }
  return new _UsdSkelInbetweenShape(attr)
}

/** UsdSkelBlendShape::GetAuthoredInbetweens (blendShape.cpp:211-246). */
function _GetAuthoredInbetweens(prim: UsdPrim): _UsdSkelInbetweenShape[] {
  const shapes: _UsdSkelInbetweenShape[] = []
  for (const name of prim.getAuthoredPropertyNames(n => n.startsWith(_inbetweensPrefix))) {
    const attr = prim.getAttr(name)
    // UsdSkelInbetweenShape::IsInbetween (inbetweenShape.cpp:43-48)
    if (attr && !attr.isRelationship && attr.isValid() && _IsValidInbetweenName(name)) {
      shapes.push(new _UsdSkelInbetweenShape(attr))
    }
  }
  return shapes
}

/** UsdSkelBlendShape::GetSchemaAttributeNames(false)
 *  (pxr/usd/usdSkel/blendShape.cpp:154-162). */
const _UsdSkelBlendShapeLocalSchemaAttributeNames: readonly string[] = [
  'offsets',
  'normalOffsets',
  'pointIndices',
]

/** dataSourceBlendShapePrim.cpp:29-44 */
function _GetPropertyMappings(): UsdImagingDataSourceMapped.PropertyMapping[] {
  const result: UsdImagingDataSourceMapped.PropertyMapping[] = []

  for (const usdName of _UsdSkelBlendShapeLocalSchemaAttributeNames) {
    result.push(
      new UsdImagingDataSourceMapped.AttributeMapping(
        usdName, new HdDataSourceLocator(usdName)))
  }

  return result
}

let _mappings: UsdImagingDataSourceMapped.PropertyMappings | undefined

/** dataSourceBlendShapePrim.cpp:46-52 */
function _GetMappings(): UsdImagingDataSourceMapped.PropertyMappings {
  return _mappings ??= new UsdImagingDataSourceMapped.PropertyMappings(
    _GetPropertyMappings(),
    UsdSkelImagingBlendShapeSchema.getDefaultLocator())
}

/** dataSourceBlendShapePrim.cpp:54-106. Data source for
 *  UsdSkelImagingInbetweenShapeSchema at data source locator
 *  skelBlendShape:inbetweenShapes:NAME.
 *
 *  Takes data from USD attributes of BlendShape prefixed by
 *  inbetweens:NAME. */
class _InbetweenShapeSchemaDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _inbetweenShape: _UsdSkelInbetweenShape,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    inbetweenShape: _UsdSkelInbetweenShape, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _InbetweenShapeSchemaDataSource {
    return new _InbetweenShapeSchemaDataSource(inbetweenShape, stageGlobals)
  }

  /** dataSourceBlendShapePrim.cpp:65-67 */
  getNames(): string[] {
    return [...UsdSkelImagingInbetweenShapeSchemaTokens.allTokens]
  }

  /** dataSourceBlendShapePrim.cpp:69-94 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingInbetweenShapeSchemaTokens.weight) {
      const result = this._inbetweenShape.getWeight()
      if (result === undefined) {
        return undefined
      }
      return HdRetainedTypedSampledDataSource.new<number>(result)
    }

    if (name === UsdSkelImagingInbetweenShapeSchemaTokens.offsets) {
      return UsdImagingDataSourceAttribute.new(
        this._inbetweenShape.getAttr(),
        this._stageGlobals)
    }

    if (name === UsdSkelImagingInbetweenShapeSchemaTokens.normalOffsets) {
      // Upstream constructs the attribute data source from the (possibly
      // invalid) UsdAttribute; an invalid attribute yields no value.
      const attr = this._inbetweenShape.getNormalOffsetsAttr()
      if (!attr) {
        return undefined
      }
      return UsdImagingDataSourceAttribute.new(
        attr,
        this._stageGlobals)
    }

    return undefined
  }
}

/** dataSourceBlendShapePrim.cpp:108-175. Data source for
 *  UsdSkelImagingInbetweenShapeSchema at skelBlendShape. */
class _InbetweenShapeContainerSchemaDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _blendShape: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    blendShape: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _InbetweenShapeContainerSchemaDataSource {
    return new _InbetweenShapeContainerSchemaDataSource(blendShape, stageGlobals)
  }

  /** dataSourceBlendShapePrim.cpp:116-126 */
  getNames(): string[] {
    const result: string[] = []
    for (const shape of _GetAuthoredInbetweens(this._blendShape)) {
      const name = _InbetweenShapeContainerSchemaDataSource._getInbetweenName(
        shape.getAttr().name)
      if (name !== undefined) {
        result.push(name)
      }
    }
    return result
  }

  /** dataSourceBlendShapePrim.cpp:128-136 */
  Get(name: string): HdDataSourceBase | undefined {
    const inbetween = _GetInbetween(this._blendShape, name)
    if (!inbetween) {
      return undefined
    }

    return _InbetweenShapeSchemaDataSource.new(inbetween, this._stageGlobals)
  }

  /** dataSourceBlendShapePrim.cpp:138-150 */
  static invalidate(properties: readonly string[]): HdDataSourceLocatorSet {
    const result = new HdDataSourceLocatorSet()

    for (const property of properties) {
      const name = _InbetweenShapeContainerSchemaDataSource._getInbetweenName(property)
      if (name !== undefined) {
        result.insert(
          UsdSkelImagingBlendShapeSchema.getInbetweenShapesLocator()
            .append(name))
      }
    }

    return result
  }

  /** dataSourceBlendShapePrim.cpp:160-171 */
  private static _getInbetweenName(usdAttrName: string): string | undefined {
    const [strippedName, stripped] = SdfPath.stripPrefixNamespace(
      usdAttrName, _usdSkelPrefixTokens.inbetweens)
    if (!stripped) {
      return undefined
    }
    return strippedName
  }
}

/** dataSourceBlendShapePrim.h:17-47. A prim data source for UsdSkel's
 *  BlendShape. */
export class UsdSkelImagingDataSourceBlendShapePrim extends UsdImagingDataSourcePrim {
  /** dataSourceBlendShapePrim.cpp:181-188 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdSkelImagingDataSourceBlendShapePrim {
    return new UsdSkelImagingDataSourceBlendShapePrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceBlendShapePrim.cpp:190-196 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(UsdSkelImagingBlendShapeSchema.getSchemaToken())
    return result
  }

  /** dataSourceBlendShapePrim.cpp:198-217 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdSkelImagingBlendShapeSchema.getSchemaToken()) {
      return HdOverlayContainerDataSource.new(
        HdRetainedContainerDataSource.new(
          [UsdSkelImagingBlendShapeSchemaTokens.inbetweenShapes],
          [_InbetweenShapeContainerSchemaDataSource.new(
            this._getUsdPrim(),
            this._getStageGlobals())]),
        UsdImagingDataSourceMapped.new(
          this._getUsdPrim(),
          this._getSceneIndexPath(),
          _GetMappings(),
          this._getStageGlobals()))
    }

    return super.Get(name)
  }

  /** dataSourceBlendShapePrim.cpp:219-241 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = UsdImagingDataSourceGprim.invalidate(
      prim, subprim, properties, invalidationType)

    locators.insert(
      UsdImagingDataSourceMapped.invalidate(
        properties, _GetMappings()))

    locators.insert(
      _InbetweenShapeContainerSchemaDataSource.invalidate(
        properties))

    return locators
  }
}
