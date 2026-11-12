// Ported from OpenUSD 26.11.1: pxr/imaging/hd/splitDiopterSchema.cpp,
//  pxr/imaging/hd/splitDiopterSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/splitDiopterSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the SplitDiopter entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream splitDiopterSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdCameraSchema } from './cameraSchema.ts'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdFloatDataSource, HdIntDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** splitDiopterSchema.h TF_DECLARE_PUBLIC_TOKENS(HdSplitDiopterSchemaTokens) */
export const HdSplitDiopterSchemaTokens = TfMakeTokens({
  splitDiopter: 'splitDiopter',
  count: 'count',
  angle: 'angle',
  offset1: 'offset1',
  width1: 'width1',
  focusDistance1: 'focusDistance1',
  offset2: 'offset2',
  width2: 'width2',
  focusDistance2: 'focusDistance2',
})

export class HdSplitDiopterSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** splitDiopterSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdSplitDiopterSchema {
    const ds = fromParentContainer?.Get(HdSplitDiopterSchemaTokens.splitDiopter)
    return new HdSplitDiopterSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getCount(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdSplitDiopterSchemaTokens.count)
  }

  getAngle(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.angle)
  }

  getOffset1(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.offset1)
  }

  getWidth1(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.width1)
  }

  getFocusDistance1(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.focusDistance1)
  }

  getOffset2(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.offset2)
  }

  getWidth2(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.width2)
  }

  getFocusDistance2(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdSplitDiopterSchemaTokens.focusDistance2)
  }

  static getSchemaToken(): TfToken {
    return HdSplitDiopterSchemaTokens.splitDiopter
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdSplitDiopterSchema._defaultLocator ??= HdCameraSchema.getDefaultLocator().append(HdSplitDiopterSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    count?: HdIntDataSource | undefined,
    angle?: HdFloatDataSource | undefined,
    offset1?: HdFloatDataSource | undefined,
    width1?: HdFloatDataSource | undefined,
    focusDistance1?: HdFloatDataSource | undefined,
    offset2?: HdFloatDataSource | undefined,
    width2?: HdFloatDataSource | undefined,
    focusDistance2?: HdFloatDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdSplitDiopterSchemaTokens.count]: count,
      [HdSplitDiopterSchemaTokens.angle]: angle,
      [HdSplitDiopterSchemaTokens.offset1]: offset1,
      [HdSplitDiopterSchemaTokens.width1]: width1,
      [HdSplitDiopterSchemaTokens.focusDistance1]: focusDistance1,
      [HdSplitDiopterSchemaTokens.offset2]: offset2,
      [HdSplitDiopterSchemaTokens.width2]: width2,
      [HdSplitDiopterSchemaTokens.focusDistance2]: focusDistance2,
    })
  }
}

export namespace HdSplitDiopterSchema {
  /** HdSplitDiopterSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _count: HdIntDataSource | undefined
    private _angle: HdFloatDataSource | undefined
    private _offset1: HdFloatDataSource | undefined
    private _width1: HdFloatDataSource | undefined
    private _focusDistance1: HdFloatDataSource | undefined
    private _offset2: HdFloatDataSource | undefined
    private _width2: HdFloatDataSource | undefined
    private _focusDistance2: HdFloatDataSource | undefined
    setCount(count: HdIntDataSource | undefined): this {
      this._count = count
      return this
    }
    setAngle(angle: HdFloatDataSource | undefined): this {
      this._angle = angle
      return this
    }
    setOffset1(offset1: HdFloatDataSource | undefined): this {
      this._offset1 = offset1
      return this
    }
    setWidth1(width1: HdFloatDataSource | undefined): this {
      this._width1 = width1
      return this
    }
    setFocusDistance1(focusDistance1: HdFloatDataSource | undefined): this {
      this._focusDistance1 = focusDistance1
      return this
    }
    setOffset2(offset2: HdFloatDataSource | undefined): this {
      this._offset2 = offset2
      return this
    }
    setWidth2(width2: HdFloatDataSource | undefined): this {
      this._width2 = width2
      return this
    }
    setFocusDistance2(focusDistance2: HdFloatDataSource | undefined): this {
      this._focusDistance2 = focusDistance2
      return this
    }
    build(): HdContainerDataSource {
      return HdSplitDiopterSchema.buildRetained(
        this._count,
        this._angle,
        this._offset1,
        this._width1,
        this._focusDistance1,
        this._offset2,
        this._width2,
        this._focusDistance2,
      )
    }
  }
}
