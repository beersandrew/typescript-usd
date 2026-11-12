// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdVolImaging/dataSourceFieldAsset.cpp,
//  pxr/usdImaging/usdVolImaging/dataSourceFieldAsset.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdVolImaging/dataSourceFieldAsset.{h,cpp}
// (OpenUSD 26.11.1): a field asset prim's volumeField container, one data
// source per attribute of its VolumeFieldAsset subclass, and the prim data
// source adding it.

import {
  ContainerDataSource as HdContainerDataSource,
  VolumeFieldSchema as HdVolumeFieldSchema,
  VolumeFieldSchemaTokens as HdVolumeFieldSchemaTokens,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { Field3DAsset as UsdVolField3DAsset, OpenVDBAsset as UsdVolOpenVDBAsset, VolumeFieldAsset as UsdVolVolumeFieldAsset } from 'typescript-usd/usdVol'
import {
  UsdImagingDataSourceAttributeNew,
  UsdImagingDataSourcePrim,
  type UsdImagingDataSourceStageGlobals,
  type UsdImagingPropertyInvalidationType,
} from 'typescript-usd/usdImaging'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** dataSourceFieldAsset.cpp:28-37 */
function _ConcatenateAttributeNames(left: readonly string[], right: readonly string[]): string[] {
  return [...left, ...right]
}

const _staticNames = new Map<string, readonly string[]>()

/** dataSourceFieldAsset.cpp:39-56. Get names from the subclass of
 *  UsdVolVolumeFieldAsset and names inherited from VolumeFieldAsset schema
 *  but stop there and do not pick up, e.g., the xform attributes which are
 *  handled elsewhere and under a different data source locator. */
function _GetStaticUsdAttributeNames(
  fieldSubclass: typeof UsdVolOpenVDBAsset | typeof UsdVolField3DAsset,
): readonly string[] {
  let result = _staticNames.get(fieldSubclass.typeName)
  if (!result) {
    result = _ConcatenateAttributeNames(
      UsdVolVolumeFieldAsset.getSchemaAttributeNames(
        /* includeInherited = */ false),
      fieldSubclass.getSchemaAttributeNames(
        /* includeInherited = */ false))
    _staticNames.set(fieldSubclass.typeName, result)
  }
  return result
}

const _empty: readonly string[] = []

/** dataSourceFieldAsset.cpp:58-74 */
function _GetUsdAttributeNames(usdPrim: UsdPrim): readonly string[] {
  if (usdPrim.isA(UsdVolOpenVDBAsset.typeName)) {
    return _GetStaticUsdAttributeNames(UsdVolOpenVDBAsset)
  }
  if (usdPrim.isA(UsdVolField3DAsset.typeName)) {
    return _GetStaticUsdAttributeNames(UsdVolField3DAsset)
  }
  TF_CODING_ERROR('Unsupported field type.')
  return _empty
}

/** dataSourceFieldAsset.h:22-50. A container data source representing data
 *  unique to volume fields. */
export class UsdImagingDataSourceFieldAsset extends HdContainerDataSource {
  /** dataSourceFieldAsset.cpp:16-24 */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdPrim: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceFieldAsset {
    return new UsdImagingDataSourceFieldAsset(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceFieldAsset.cpp:76-80 */
  getNames(): string[] {
    return [..._GetUsdAttributeNames(this._usdPrim)]
  }

  /** dataSourceFieldAsset.cpp:82-94 */
  Get(name: string): HdDataSourceBase | undefined {
    const attr = this._usdPrim.getAttr(name)
    if (attr && attr.isValid()) {
      return UsdImagingDataSourceAttributeNew(
        attr,
        this._stageGlobals,
        this._sceneIndexPath,
        HdVolumeFieldSchema.getDefaultLocator().append(name))
    } else {
      return undefined
    }
  }
}

/** dataSourceFieldAsset.h:52-81. A prim data source representing a
 *  UsdVolVolumeFieldAsset prim. */
export class UsdImagingDataSourceFieldAssetPrim extends UsdImagingDataSourcePrim {
  /** dataSourceFieldAsset.cpp:98-104 */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceFieldAssetPrim {
    return new UsdImagingDataSourceFieldAssetPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceFieldAsset.cpp:106-112 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdVolumeFieldSchemaTokens.volumeField)
    return result
  }

  /** dataSourceFieldAsset.cpp:114-125 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdVolumeFieldSchemaTokens.volumeField) {
      return UsdImagingDataSourceFieldAsset.new(
        this._getSceneIndexPath(),
        this._getUsdPrim(),
        this._getStageGlobals())
    }
    return super.Get(name)
  }

  /** dataSourceFieldAsset.cpp:127-159 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators =
      UsdImagingDataSourcePrim.invalidate(
        prim, subprim, properties, invalidationType)

    let fieldNames: readonly string[]
    if (prim.isA(UsdVolOpenVDBAsset.typeName)) {
      fieldNames =
        _GetStaticUsdAttributeNames(UsdVolOpenVDBAsset)
    } else if (prim.isA(UsdVolField3DAsset.typeName)) {
      fieldNames =
        _GetStaticUsdAttributeNames(UsdVolField3DAsset)
    } else {
      TF_CODING_ERROR('Unsupported field type.')
      return locators
    }

    for (const propertyName of properties) {
      if (fieldNames.includes(propertyName)) {
        locators.insert(HdVolumeFieldSchema.getDefaultLocator())
        break
      }
    }

    return locators
  }
}
