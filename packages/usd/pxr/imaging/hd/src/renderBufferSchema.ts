// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderBufferSchema.cpp,
//  pxr/imaging/hd/renderBufferSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderBufferSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the RenderBuffer entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream renderBufferSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdFormatDataSource, HdVec3iDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** renderBufferSchema.h TF_DECLARE_PUBLIC_TOKENS(HdRenderBufferSchemaTokens) */
export const HdRenderBufferSchemaTokens = TfMakeTokens({
  renderBuffer: 'renderBuffer',
  dimensions: 'dimensions',
  format: 'format',
  multiSampled: 'multiSampled',
})

export class HdRenderBufferSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** renderBufferSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdRenderBufferSchema {
    const ds = fromParentContainer?.Get(HdRenderBufferSchemaTokens.renderBuffer)
    return new HdRenderBufferSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getDimensions(): HdVec3iDataSource | undefined {
    return this._getTypedDataSource<HdVec3iDataSource>(HdRenderBufferSchemaTokens.dimensions)
  }

  GetFormat(): HdFormatDataSource | undefined {
    return this._getTypedDataSource<HdFormatDataSource>(HdRenderBufferSchemaTokens.format)
  }

  getMultiSampled(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdRenderBufferSchemaTokens.multiSampled)
  }

  static getSchemaToken(): TfToken {
    return HdRenderBufferSchemaTokens.renderBuffer
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdRenderBufferSchema._defaultLocator ??= new HdDataSourceLocator(HdRenderBufferSchema.getSchemaToken())
  }

  private static _dimensionsLocator: HdDataSourceLocator | undefined
  static getDimensionsLocator(): HdDataSourceLocator {
    return HdRenderBufferSchema._dimensionsLocator ??= HdRenderBufferSchema.getDefaultLocator().append(HdRenderBufferSchemaTokens.dimensions)
  }

  private static _formatLocator: HdDataSourceLocator | undefined
  static getFormatLocator(): HdDataSourceLocator {
    return HdRenderBufferSchema._formatLocator ??= HdRenderBufferSchema.getDefaultLocator().append(HdRenderBufferSchemaTokens.format)
  }

  private static _multiSampledLocator: HdDataSourceLocator | undefined
  static getMultiSampledLocator(): HdDataSourceLocator {
    return HdRenderBufferSchema._multiSampledLocator ??= HdRenderBufferSchema.getDefaultLocator().append(HdRenderBufferSchemaTokens.multiSampled)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    dimensions?: HdVec3iDataSource | undefined,
    format?: HdFormatDataSource | undefined,
    multiSampled?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdRenderBufferSchemaTokens.dimensions]: dimensions,
      [HdRenderBufferSchemaTokens.format]: format,
      [HdRenderBufferSchemaTokens.multiSampled]: multiSampled,
    })
  }
}

export namespace HdRenderBufferSchema {
  /** HdRenderBufferSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _dimensions: HdVec3iDataSource | undefined
    private _format: HdFormatDataSource | undefined
    private _multiSampled: HdBoolDataSource | undefined
    setDimensions(dimensions: HdVec3iDataSource | undefined): this {
      this._dimensions = dimensions
      return this
    }
    setFormat(format: HdFormatDataSource | undefined): this {
      this._format = format
      return this
    }
    setMultiSampled(multiSampled: HdBoolDataSource | undefined): this {
      this._multiSampled = multiSampled
      return this
    }
    build(): HdContainerDataSource {
      return HdRenderBufferSchema.buildRetained(
        this._dimensions,
        this._format,
        this._multiSampled,
      )
    }
  }
}
