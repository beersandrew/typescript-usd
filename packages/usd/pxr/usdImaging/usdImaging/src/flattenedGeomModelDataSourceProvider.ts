// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/flattenedGeomModelDataSourceProvider.cpp,
//  pxr/usdImaging/usdImaging/flattenedGeomModelDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/flattenedGeomModelDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: HdFlattenedDataSourceProvider::ComputeDirtyLocatorsForDescendants
// returns the resulting set in this port instead of assigning through a
// pointer (see pxr/imaging/hd/src/flattenedDataSourceProvider.ts).

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  FlattenedDataSourceProvider as HdFlattenedDataSourceProvider,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { UsdImagingGeomModelSchema, UsdImagingGeomModelSchemaTokens } from './geomModelSchema.ts'

/** UsdGeomTokens->inherited (pxr/usd/usdGeom/tokens.h). */
const UsdGeomTokens_inherited = 'inherited'

/** flattenedGeomModelDataSourceProvider.cpp:19-24 */
function _ContainsDrawMode(vec: string[]): boolean {
  return vec.includes(UsdImagingGeomModelSchemaTokens.drawMode)
}

/** flattenedGeomModelDataSourceProvider.cpp:26-31 */
function _ContainsCardVisibility(vec: string[]): boolean {
  return vec.includes(UsdImagingGeomModelSchemaTokens.cardVisibility)
}

/** flattenedGeomModelDataSourceProvider.cpp:33-118 */
class _ModelDataSource extends HdContainerDataSource {
  private constructor(
    private readonly _primModel: HdContainerDataSource,
    private readonly _parentModel: HdContainerDataSource,
  ) { super() }

  static new(primModel: HdContainerDataSource, parentModel: HdContainerDataSource): _ModelDataSource {
    return new _ModelDataSource(primModel, parentModel)
  }

  getNames(): string[] {
    const result = [...this._primModel.getNames()]
    if (!_ContainsDrawMode(result) &&
         _ContainsDrawMode(this._parentModel.getNames())) {
      result.push(UsdImagingGeomModelSchemaTokens.drawMode)
    }
    if (!_ContainsCardVisibility(result) &&
         _ContainsCardVisibility(this._parentModel.getNames())) {
      result.push(UsdImagingGeomModelSchemaTokens.cardVisibility)
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingGeomModelSchemaTokens.drawMode) {
      return this._getDrawMode()
    }
    if (name === UsdImagingGeomModelSchemaTokens.cardVisibility) {
      return this._getCardVisibility()
    }
    return this._primModel.Get(name)
  }

  static useOrCreateNew(
    primModel: HdContainerDataSource | undefined,
    parentModel: HdContainerDataSource | undefined,
  ): HdContainerDataSource | undefined {
    if (!primModel) {
      return parentModel
    }
    if (!parentModel) {
      return primModel
    }
    return _ModelDataSource.new(primModel, parentModel)
  }

  private _getDrawMode(): HdDataSourceBase | undefined {
    const ds = new UsdImagingGeomModelSchema(this._primModel).getDrawMode()
    if (ds) {
      const drawMode = ds.getTypedValue(0)
      if (drawMode && drawMode !== UsdGeomTokens_inherited) {
        return ds
      }
    }
    return new UsdImagingGeomModelSchema(this._parentModel).getDrawMode()
  }

  private _getCardVisibility(): HdDataSourceBase | undefined {
    const ds = new UsdImagingGeomModelSchema(this._primModel).getCardVisibility()
    if (ds) {
      const drawMode = ds.getTypedValue(0)
      if (drawMode && drawMode !== UsdGeomTokens_inherited) {
        return ds
      }
    }
    return new UsdImagingGeomModelSchema(this._parentModel).getCardVisibility()
  }
}

/** flattenedGeomModelDataSourceProvider.h:17-32 */
export class UsdImagingFlattenedGeomModelDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedGeomModelDataSourceProvider.cpp:124-132 */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context): HdContainerDataSource | undefined {
    return _ModelDataSource.useOrCreateNew(
      ctx.getInputDataSource(),
      ctx.getFlattenedDataSourceFromParentPrim())
  }

  /** flattenedGeomModelDataSourceProvider.cpp:134-154 */
  computeDirtyLocatorsForDescendants(locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    const drawModeLocator = new HdDataSourceLocator(UsdImagingGeomModelSchemaTokens.drawMode)
    const cardModeComplexityLocator = new HdDataSourceLocator(UsdImagingGeomModelSchemaTokens.cardVisibility)

    const drawMode = locators.intersects(drawModeLocator)
    const cardInvis = locators.intersects(cardModeComplexityLocator)
    if (drawMode && cardInvis) {
      return new HdDataSourceLocatorSet([drawModeLocator, cardModeComplexityLocator])
    } else if (drawMode) {
      return new HdDataSourceLocatorSet([drawModeLocator])
    } else if (cardInvis) {
      return new HdDataSourceLocatorSet([cardModeComplexityLocator])
    } else {
      return new HdDataSourceLocatorSet()
    }
  }
}
