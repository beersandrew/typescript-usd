// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderProductSchema.cpp,
//  pxr/imaging/hd/renderProductSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderProductSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the RenderProduct entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream renderProductSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdFloatDataSource, HdPathDataSource, HdTokenDataSource, HdVec2fDataSource, HdVec2iDataSource, HdVec4fDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdRenderVarVectorSchema } from './schemaTypeDefs.ts'

/** renderProductSchema.h TF_DECLARE_PUBLIC_TOKENS(HdRenderProductSchemaTokens) */
export const HdRenderProductSchemaTokens = TfMakeTokens({
  renderProduct: 'renderProduct',
  path: 'path',
  type: 'type',
  name: 'name',
  resolution: 'resolution',
  renderVars: 'renderVars',
  cameraPrim: 'cameraPrim',
  pixelAspectRatio: 'pixelAspectRatio',
  aspectRatioConformPolicy: 'aspectRatioConformPolicy',
  apertureSize: 'apertureSize',
  dataWindowNDC: 'dataWindowNDC',
  disableMotionBlur: 'disableMotionBlur',
  disableDepthOfField: 'disableDepthOfField',
  namespacedSettings: 'namespacedSettings',
})

export class HdRenderProductSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** renderProductSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdRenderProductSchema {
    const ds = fromParentContainer?.Get(HdRenderProductSchemaTokens.renderProduct)
    return new HdRenderProductSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getPath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdRenderProductSchemaTokens.path)
  }

  getType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderProductSchemaTokens.type)
  }

  getName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderProductSchemaTokens.name)
  }

  getResolution(): HdVec2iDataSource | undefined {
    return this._getTypedDataSource<HdVec2iDataSource>(HdRenderProductSchemaTokens.resolution)
  }

  getRenderVars(): HdRenderVarVectorSchema {
    return new HdRenderVarVectorSchema(this._getVectorDataSource(HdRenderProductSchemaTokens.renderVars))
  }

  getCameraPrim(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdRenderProductSchemaTokens.cameraPrim)
  }

  getPixelAspectRatio(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdRenderProductSchemaTokens.pixelAspectRatio)
  }

  getAspectRatioConformPolicy(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdRenderProductSchemaTokens.aspectRatioConformPolicy)
  }

  getApertureSize(): HdVec2fDataSource | undefined {
    return this._getTypedDataSource<HdVec2fDataSource>(HdRenderProductSchemaTokens.apertureSize)
  }

  getDataWindowNDC(): HdVec4fDataSource | undefined {
    return this._getTypedDataSource<HdVec4fDataSource>(HdRenderProductSchemaTokens.dataWindowNDC)
  }

  getDisableMotionBlur(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderProductSchemaTokens.disableMotionBlur)
  }

  getDisableDepthOfField(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderProductSchemaTokens.disableDepthOfField)
  }

  getNamespacedSettings(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(HdRenderProductSchemaTokens.namespacedSettings)
  }

  static getSchemaToken(): TfToken {
    return HdRenderProductSchemaTokens.renderProduct
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdRenderProductSchema._defaultLocator ??= new HdDataSourceLocator(HdRenderProductSchema.getSchemaToken())
  }

  private static _resolutionLocator: HdDataSourceLocator | undefined
  static getResolutionLocator(): HdDataSourceLocator {
    return HdRenderProductSchema._resolutionLocator ??= HdRenderProductSchema.getDefaultLocator().append(HdRenderProductSchemaTokens.resolution)
  }

  private static _renderVarsLocator: HdDataSourceLocator | undefined
  static getRenderVarsLocator(): HdDataSourceLocator {
    return HdRenderProductSchema._renderVarsLocator ??= HdRenderProductSchema.getDefaultLocator().append(HdRenderProductSchemaTokens.renderVars)
  }

  private static _namespacedSettingsLocator: HdDataSourceLocator | undefined
  static getNamespacedSettingsLocator(): HdDataSourceLocator {
    return HdRenderProductSchema._namespacedSettingsLocator ??= HdRenderProductSchema.getDefaultLocator().append(HdRenderProductSchemaTokens.namespacedSettings)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    path?: HdPathDataSource | undefined,
    type?: HdTokenDataSource | undefined,
    name?: HdTokenDataSource | undefined,
    resolution?: HdVec2iDataSource | undefined,
    renderVars?: HdVectorDataSource | undefined,
    cameraPrim?: HdPathDataSource | undefined,
    pixelAspectRatio?: HdFloatDataSource | undefined,
    aspectRatioConformPolicy?: HdTokenDataSource | undefined,
    apertureSize?: HdVec2fDataSource | undefined,
    dataWindowNDC?: HdVec4fDataSource | undefined,
    disableMotionBlur?: HdBoolDataSource | undefined,
    disableDepthOfField?: HdBoolDataSource | undefined,
    namespacedSettings?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdRenderProductSchemaTokens.path]: path,
      [HdRenderProductSchemaTokens.type]: type,
      [HdRenderProductSchemaTokens.name]: name,
      [HdRenderProductSchemaTokens.resolution]: resolution,
      [HdRenderProductSchemaTokens.renderVars]: renderVars,
      [HdRenderProductSchemaTokens.cameraPrim]: cameraPrim,
      [HdRenderProductSchemaTokens.pixelAspectRatio]: pixelAspectRatio,
      [HdRenderProductSchemaTokens.aspectRatioConformPolicy]: aspectRatioConformPolicy,
      [HdRenderProductSchemaTokens.apertureSize]: apertureSize,
      [HdRenderProductSchemaTokens.dataWindowNDC]: dataWindowNDC,
      [HdRenderProductSchemaTokens.disableMotionBlur]: disableMotionBlur,
      [HdRenderProductSchemaTokens.disableDepthOfField]: disableDepthOfField,
      [HdRenderProductSchemaTokens.namespacedSettings]: namespacedSettings,
    })
  }
}

export namespace HdRenderProductSchema {
  /** HdRenderProductSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _path: HdPathDataSource | undefined
    private _type: HdTokenDataSource | undefined
    private _name: HdTokenDataSource | undefined
    private _resolution: HdVec2iDataSource | undefined
    private _renderVars: HdVectorDataSource | undefined
    private _cameraPrim: HdPathDataSource | undefined
    private _pixelAspectRatio: HdFloatDataSource | undefined
    private _aspectRatioConformPolicy: HdTokenDataSource | undefined
    private _apertureSize: HdVec2fDataSource | undefined
    private _dataWindowNDC: HdVec4fDataSource | undefined
    private _disableMotionBlur: HdBoolDataSource | undefined
    private _disableDepthOfField: HdBoolDataSource | undefined
    private _namespacedSettings: HdContainerDataSource | undefined
    setPath(path: HdPathDataSource | undefined): this {
      this._path = path
      return this
    }
    setType(type: HdTokenDataSource | undefined): this {
      this._type = type
      return this
    }
    setName(name: HdTokenDataSource | undefined): this {
      this._name = name
      return this
    }
    setResolution(resolution: HdVec2iDataSource | undefined): this {
      this._resolution = resolution
      return this
    }
    setRenderVars(renderVars: HdVectorDataSource | undefined): this {
      this._renderVars = renderVars
      return this
    }
    setCameraPrim(cameraPrim: HdPathDataSource | undefined): this {
      this._cameraPrim = cameraPrim
      return this
    }
    setPixelAspectRatio(pixelAspectRatio: HdFloatDataSource | undefined): this {
      this._pixelAspectRatio = pixelAspectRatio
      return this
    }
    setAspectRatioConformPolicy(aspectRatioConformPolicy: HdTokenDataSource | undefined): this {
      this._aspectRatioConformPolicy = aspectRatioConformPolicy
      return this
    }
    setApertureSize(apertureSize: HdVec2fDataSource | undefined): this {
      this._apertureSize = apertureSize
      return this
    }
    setDataWindowNDC(dataWindowNDC: HdVec4fDataSource | undefined): this {
      this._dataWindowNDC = dataWindowNDC
      return this
    }
    setDisableMotionBlur(disableMotionBlur: HdBoolDataSource | undefined): this {
      this._disableMotionBlur = disableMotionBlur
      return this
    }
    setDisableDepthOfField(disableDepthOfField: HdBoolDataSource | undefined): this {
      this._disableDepthOfField = disableDepthOfField
      return this
    }
    setNamespacedSettings(namespacedSettings: HdContainerDataSource | undefined): this {
      this._namespacedSettings = namespacedSettings
      return this
    }
    build(): HdContainerDataSource {
      return HdRenderProductSchema.buildRetained(
        this._path,
        this._type,
        this._name,
        this._resolution,
        this._renderVars,
        this._cameraPrim,
        this._pixelAspectRatio,
        this._aspectRatioConformPolicy,
        this._apertureSize,
        this._dataWindowNDC,
        this._disableMotionBlur,
        this._disableDepthOfField,
        this._namespacedSettings,
      )
    }
  }
}
