// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/renderSettingDescriptorSchema.cpp,
//  pxr/imaging/hd/renderSettingDescriptorSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderSettingDescriptorSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the RenderSettingDescriptor entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream renderSettingDescriptorSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdStringDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** renderSettingDescriptorSchema.h TF_DECLARE_PUBLIC_TOKENS(HdRenderSettingDescriptorSchemaTokens) */
export const HdRenderSettingDescriptorSchemaTokens = TfMakeTokens({
  renderSettingDescriptor: 'renderSettingDescriptor',
  name: 'name',
  defaultValue: 'defaultValue',
})

/**
 * Describes render setting advertised by a renderer through
 * HdRendererPlugin::GetSceneIndexCreateArgs, see
 * HdSceneIndexCreateArgsSchema::GetRenderSettings.
 */
export class HdRenderSettingDescriptorSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** renderSettingDescriptorSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdRenderSettingDescriptorSchema {
    const ds = fromParentContainer?.Get(HdRenderSettingDescriptorSchemaTokens.renderSettingDescriptor)
    return new HdRenderSettingDescriptorSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /**
   * Human-readable name of the render setting, suitable for display in a UI.
   */
  getName(): HdStringDataSource | undefined {
    return this._getTypedDataSource<HdStringDataSource>(HdRenderSettingDescriptorSchemaTokens.name)
  }

  getDefaultValue(): HdSampledDataSource | undefined {
    return this._getTypedDataSource<HdSampledDataSource>(HdRenderSettingDescriptorSchemaTokens.defaultValue)
  }

  static getSchemaToken(): TfToken {
    return HdRenderSettingDescriptorSchemaTokens.renderSettingDescriptor
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    name?: HdStringDataSource | undefined,
    defaultValue?: HdSampledDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdRenderSettingDescriptorSchemaTokens.name]: name,
      [HdRenderSettingDescriptorSchemaTokens.defaultValue]: defaultValue,
    })
  }
}

export namespace HdRenderSettingDescriptorSchema {
  /** HdRenderSettingDescriptorSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _name: HdStringDataSource | undefined
    private _defaultValue: HdSampledDataSource | undefined
    setName(name: HdStringDataSource | undefined): this {
      this._name = name
      return this
    }
    setDefaultValue(defaultValue: HdSampledDataSource | undefined): this {
      this._defaultValue = defaultValue
      return this
    }
    build(): HdContainerDataSource {
      return HdRenderSettingDescriptorSchema.buildRetained(
        this._name,
        this._defaultValue,
      )
    }
  }
}
