// Ported from OpenUSD 26.11.1: pxr/imaging/hd/legacyDisplayStyleSchema.cpp,
//  pxr/imaging/hd/legacyDisplayStyleSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/legacyDisplayStyleSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the LegacyDisplayStyle entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream legacyDisplayStyleSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdIntDataSource, HdTokenArrayDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** legacyDisplayStyleSchema.h TF_DECLARE_PUBLIC_TOKENS(HdLegacyDisplayStyleSchemaTokens) */
export const HdLegacyDisplayStyleSchemaTokens = TfMakeTokens({
  displayStyle: 'displayStyle',
  refineLevel: 'refineLevel',
  flatShadingEnabled: 'flatShadingEnabled',
  displacementEnabled: 'displacementEnabled',
  displayInOverlay: 'displayInOverlay',
  occludedSelectionShowsThrough: 'occludedSelectionShowsThrough',
  pointsShadingEnabled: 'pointsShadingEnabled',
  materialIsFinal: 'materialIsFinal',
  shadingStyle: 'shadingStyle',
  reprSelector: 'reprSelector',
  cullStyle: 'cullStyle',
})

export class HdLegacyDisplayStyleSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** legacyDisplayStyleSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdLegacyDisplayStyleSchema {
    const ds = fromParentContainer?.Get(HdLegacyDisplayStyleSchemaTokens.displayStyle)
    return new HdLegacyDisplayStyleSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getRefineLevel(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdLegacyDisplayStyleSchemaTokens.refineLevel)
  }

  getFlatShadingEnabled(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdLegacyDisplayStyleSchemaTokens.flatShadingEnabled)
  }

  getDisplacementEnabled(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdLegacyDisplayStyleSchemaTokens.displacementEnabled)
  }

  getDisplayInOverlay(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdLegacyDisplayStyleSchemaTokens.displayInOverlay)
  }

  getOccludedSelectionShowsThrough(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdLegacyDisplayStyleSchemaTokens.occludedSelectionShowsThrough)
  }

  getPointsShadingEnabled(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdLegacyDisplayStyleSchemaTokens.pointsShadingEnabled)
  }

  getMaterialIsFinal(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdLegacyDisplayStyleSchemaTokens.materialIsFinal)
  }

  getShadingStyle(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdLegacyDisplayStyleSchemaTokens.shadingStyle)
  }

  getReprSelector(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(HdLegacyDisplayStyleSchemaTokens.reprSelector)
  }

  getCullStyle(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdLegacyDisplayStyleSchemaTokens.cullStyle)
  }

  static getSchemaToken(): TfToken {
    return HdLegacyDisplayStyleSchemaTokens.displayStyle
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._defaultLocator ??= new HdDataSourceLocator(HdLegacyDisplayStyleSchema.getSchemaToken())
  }

  private static _refineLevelLocator: HdDataSourceLocator | undefined
  static getRefineLevelLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._refineLevelLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.refineLevel)
  }

  private static _flatShadingEnabledLocator: HdDataSourceLocator | undefined
  static getFlatShadingEnabledLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._flatShadingEnabledLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.flatShadingEnabled)
  }

  private static _displacementEnabledLocator: HdDataSourceLocator | undefined
  static getDisplacementEnabledLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._displacementEnabledLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.displacementEnabled)
  }

  private static _displayInOverlayLocator: HdDataSourceLocator | undefined
  static getDisplayInOverlayLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._displayInOverlayLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.displayInOverlay)
  }

  private static _occludedSelectionShowsThroughLocator: HdDataSourceLocator | undefined
  static getOccludedSelectionShowsThroughLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._occludedSelectionShowsThroughLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.occludedSelectionShowsThrough)
  }

  private static _pointsShadingEnabledLocator: HdDataSourceLocator | undefined
  static getPointsShadingEnabledLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._pointsShadingEnabledLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.pointsShadingEnabled)
  }

  private static _materialIsFinalLocator: HdDataSourceLocator | undefined
  static getMaterialIsFinalLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._materialIsFinalLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.materialIsFinal)
  }

  private static _shadingStyleLocator: HdDataSourceLocator | undefined
  static getShadingStyleLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._shadingStyleLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.shadingStyle)
  }

  private static _reprSelectorLocator: HdDataSourceLocator | undefined
  static getReprSelectorLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._reprSelectorLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.reprSelector)
  }

  private static _cullStyleLocator: HdDataSourceLocator | undefined
  static getCullStyleLocator(): HdDataSourceLocator {
    return HdLegacyDisplayStyleSchema._cullStyleLocator ??= HdLegacyDisplayStyleSchema.getDefaultLocator().append(HdLegacyDisplayStyleSchemaTokens.cullStyle)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    refineLevel?: HdIntDataSource | undefined,
    flatShadingEnabled?: HdBoolDataSource | undefined,
    displacementEnabled?: HdBoolDataSource | undefined,
    displayInOverlay?: HdBoolDataSource | undefined,
    occludedSelectionShowsThrough?: HdBoolDataSource | undefined,
    pointsShadingEnabled?: HdBoolDataSource | undefined,
    materialIsFinal?: HdBoolDataSource | undefined,
    shadingStyle?: HdTokenDataSource | undefined,
    reprSelector?: HdTokenArrayDataSource | undefined,
    cullStyle?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdLegacyDisplayStyleSchemaTokens.refineLevel]: refineLevel,
      [HdLegacyDisplayStyleSchemaTokens.flatShadingEnabled]: flatShadingEnabled,
      [HdLegacyDisplayStyleSchemaTokens.displacementEnabled]: displacementEnabled,
      [HdLegacyDisplayStyleSchemaTokens.displayInOverlay]: displayInOverlay,
      [HdLegacyDisplayStyleSchemaTokens.occludedSelectionShowsThrough]: occludedSelectionShowsThrough,
      [HdLegacyDisplayStyleSchemaTokens.pointsShadingEnabled]: pointsShadingEnabled,
      [HdLegacyDisplayStyleSchemaTokens.materialIsFinal]: materialIsFinal,
      [HdLegacyDisplayStyleSchemaTokens.shadingStyle]: shadingStyle,
      [HdLegacyDisplayStyleSchemaTokens.reprSelector]: reprSelector,
      [HdLegacyDisplayStyleSchemaTokens.cullStyle]: cullStyle,
    })
  }
}

export namespace HdLegacyDisplayStyleSchema {
  /** HdLegacyDisplayStyleSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _refineLevel: HdIntDataSource | undefined
    private _flatShadingEnabled: HdBoolDataSource | undefined
    private _displacementEnabled: HdBoolDataSource | undefined
    private _displayInOverlay: HdBoolDataSource | undefined
    private _occludedSelectionShowsThrough: HdBoolDataSource | undefined
    private _pointsShadingEnabled: HdBoolDataSource | undefined
    private _materialIsFinal: HdBoolDataSource | undefined
    private _shadingStyle: HdTokenDataSource | undefined
    private _reprSelector: HdTokenArrayDataSource | undefined
    private _cullStyle: HdTokenDataSource | undefined
    setRefineLevel(refineLevel: HdIntDataSource | undefined): this {
      this._refineLevel = refineLevel
      return this
    }
    setFlatShadingEnabled(flatShadingEnabled: HdBoolDataSource | undefined): this {
      this._flatShadingEnabled = flatShadingEnabled
      return this
    }
    setDisplacementEnabled(displacementEnabled: HdBoolDataSource | undefined): this {
      this._displacementEnabled = displacementEnabled
      return this
    }
    setDisplayInOverlay(displayInOverlay: HdBoolDataSource | undefined): this {
      this._displayInOverlay = displayInOverlay
      return this
    }
    setOccludedSelectionShowsThrough(occludedSelectionShowsThrough: HdBoolDataSource | undefined): this {
      this._occludedSelectionShowsThrough = occludedSelectionShowsThrough
      return this
    }
    setPointsShadingEnabled(pointsShadingEnabled: HdBoolDataSource | undefined): this {
      this._pointsShadingEnabled = pointsShadingEnabled
      return this
    }
    setMaterialIsFinal(materialIsFinal: HdBoolDataSource | undefined): this {
      this._materialIsFinal = materialIsFinal
      return this
    }
    setShadingStyle(shadingStyle: HdTokenDataSource | undefined): this {
      this._shadingStyle = shadingStyle
      return this
    }
    setReprSelector(reprSelector: HdTokenArrayDataSource | undefined): this {
      this._reprSelector = reprSelector
      return this
    }
    setCullStyle(cullStyle: HdTokenDataSource | undefined): this {
      this._cullStyle = cullStyle
      return this
    }
    build(): HdContainerDataSource {
      return HdLegacyDisplayStyleSchema.buildRetained(
        this._refineLevel,
        this._flatShadingEnabled,
        this._displacementEnabled,
        this._displayInOverlay,
        this._occludedSelectionShowsThrough,
        this._pointsShadingEnabled,
        this._materialIsFinal,
        this._shadingStyle,
        this._reprSelector,
        this._cullStyle,
      )
    }
  }
}
