// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/sceneIndexCreateArgsSchema.cpp,
//  pxr/usdImaging/usdImaging/sceneIndexCreateArgsSchema.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/sceneIndexCreateArgsSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the SceneIndexCreateArgs entry of pxr/usdImaging/usdImaging/usdImagingSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates.
// The stage member holds a UsdStage (UsdStageRefPtrDataSource upstream).

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, type BoolDataSource as HdBoolDataSource, type TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import type { Stage as UsdStage } from 'typescript-usd/usd'

/** sceneIndexCreateArgsSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingSceneIndexCreateArgsSchemaTokens) */
export const UsdImagingSceneIndexCreateArgsSchemaTokens = TfMakeTokens({
  usdImagingSceneIndexCreateArgs: 'usdImagingSceneIndexCreateArgs',
  stage: 'stage',
  includeUnloadedPrims: 'includeUnloadedPrims',
  displayUnloadedPrimsWithBounds: 'displayUnloadedPrimsWithBounds',
  addDrawModeSceneIndex: 'addDrawModeSceneIndex',
})

export class UsdImagingSceneIndexCreateArgsSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** sceneIndexCreateArgsSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingSceneIndexCreateArgsSchema {
    const ds = fromParentContainer?.Get(UsdImagingSceneIndexCreateArgsSchemaTokens.usdImagingSceneIndexCreateArgs)
    return new UsdImagingSceneIndexCreateArgsSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getStage(): HdTypedSampledDataSource<UsdStage> | undefined {
    return this._getTypedDataSource<HdTypedSampledDataSource<UsdStage>>(UsdImagingSceneIndexCreateArgsSchemaTokens.stage)
  }

  getIncludeUnloadedPrims(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingSceneIndexCreateArgsSchemaTokens.includeUnloadedPrims)
  }

  getDisplayUnloadedPrimsWithBounds(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingSceneIndexCreateArgsSchemaTokens.displayUnloadedPrimsWithBounds)
  }

  getAddDrawModeSceneIndex(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingSceneIndexCreateArgsSchemaTokens.addDrawModeSceneIndex)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingSceneIndexCreateArgsSchemaTokens.usdImagingSceneIndexCreateArgs
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingSceneIndexCreateArgsSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingSceneIndexCreateArgsSchema.getSchemaToken())
  }

  private static _stageLocator: HdDataSourceLocator | undefined
  static getStageLocator(): HdDataSourceLocator {
    return UsdImagingSceneIndexCreateArgsSchema._stageLocator ??= UsdImagingSceneIndexCreateArgsSchema.getDefaultLocator().append(UsdImagingSceneIndexCreateArgsSchemaTokens.stage)
  }

  private static _includeUnloadedPrimsLocator: HdDataSourceLocator | undefined
  static getIncludeUnloadedPrimsLocator(): HdDataSourceLocator {
    return UsdImagingSceneIndexCreateArgsSchema._includeUnloadedPrimsLocator ??= UsdImagingSceneIndexCreateArgsSchema.getDefaultLocator().append(UsdImagingSceneIndexCreateArgsSchemaTokens.includeUnloadedPrims)
  }

  private static _displayUnloadedPrimsWithBoundsLocator: HdDataSourceLocator | undefined
  static getDisplayUnloadedPrimsWithBoundsLocator(): HdDataSourceLocator {
    return UsdImagingSceneIndexCreateArgsSchema._displayUnloadedPrimsWithBoundsLocator ??= UsdImagingSceneIndexCreateArgsSchema.getDefaultLocator().append(UsdImagingSceneIndexCreateArgsSchemaTokens.displayUnloadedPrimsWithBounds)
  }

  private static _addDrawModeSceneIndexLocator: HdDataSourceLocator | undefined
  static getAddDrawModeSceneIndexLocator(): HdDataSourceLocator {
    return UsdImagingSceneIndexCreateArgsSchema._addDrawModeSceneIndexLocator ??= UsdImagingSceneIndexCreateArgsSchema.getDefaultLocator().append(UsdImagingSceneIndexCreateArgsSchemaTokens.addDrawModeSceneIndex)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    stage?: HdTypedSampledDataSource<UsdStage> | undefined,
    includeUnloadedPrims?: HdBoolDataSource | undefined,
    displayUnloadedPrimsWithBounds?: HdBoolDataSource | undefined,
    addDrawModeSceneIndex?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingSceneIndexCreateArgsSchemaTokens.stage]: stage,
      [UsdImagingSceneIndexCreateArgsSchemaTokens.includeUnloadedPrims]: includeUnloadedPrims,
      [UsdImagingSceneIndexCreateArgsSchemaTokens.displayUnloadedPrimsWithBounds]: displayUnloadedPrimsWithBounds,
      [UsdImagingSceneIndexCreateArgsSchemaTokens.addDrawModeSceneIndex]: addDrawModeSceneIndex,
    })
  }
}

export namespace UsdImagingSceneIndexCreateArgsSchema {
  /** UsdImagingSceneIndexCreateArgsSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _stage: HdTypedSampledDataSource<UsdStage> | undefined
    private _includeUnloadedPrims: HdBoolDataSource | undefined
    private _displayUnloadedPrimsWithBounds: HdBoolDataSource | undefined
    private _addDrawModeSceneIndex: HdBoolDataSource | undefined
    SetStage(stage: HdTypedSampledDataSource<UsdStage> | undefined): this {
      this._stage = stage
      return this
    }
    setIncludeUnloadedPrims(includeUnloadedPrims: HdBoolDataSource | undefined): this {
      this._includeUnloadedPrims = includeUnloadedPrims
      return this
    }
    setDisplayUnloadedPrimsWithBounds(displayUnloadedPrimsWithBounds: HdBoolDataSource | undefined): this {
      this._displayUnloadedPrimsWithBounds = displayUnloadedPrimsWithBounds
      return this
    }
    setAddDrawModeSceneIndex(addDrawModeSceneIndex: HdBoolDataSource | undefined): this {
      this._addDrawModeSceneIndex = addDrawModeSceneIndex
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingSceneIndexCreateArgsSchema.buildRetained(
        this._stage,
        this._includeUnloadedPrims,
        this._displayUnloadedPrimsWithBounds,
        this._addDrawModeSceneIndex,
      )
    }
  }
}
