// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instanceIndicesSchema.cpp,
//  pxr/imaging/hd/instanceIndicesSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instanceIndicesSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the InstanceIndices entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream instanceIndicesSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdIntArrayDataSource, HdIntDataSource, HdPathDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** instanceIndicesSchema.h TF_DECLARE_PUBLIC_TOKENS(HdInstanceIndicesSchemaTokens) */
export const HdInstanceIndicesSchemaTokens = TfMakeTokens({
  instancer: 'instancer',
  prototypeIndex: 'prototypeIndex',
  instanceIndices: 'instanceIndices',
})

export class HdInstanceIndicesSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  getInstancer(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdInstanceIndicesSchemaTokens.instancer)
  }

  getPrototypeIndex(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdInstanceIndicesSchemaTokens.prototypeIndex)
  }

  getInstanceIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdInstanceIndicesSchemaTokens.instanceIndices)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    instancer?: HdPathDataSource | undefined,
    prototypeIndex?: HdIntDataSource | undefined,
    instanceIndices?: HdIntArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdInstanceIndicesSchemaTokens.instancer]: instancer,
      [HdInstanceIndicesSchemaTokens.prototypeIndex]: prototypeIndex,
      [HdInstanceIndicesSchemaTokens.instanceIndices]: instanceIndices,
    })
  }
}

export namespace HdInstanceIndicesSchema {
  /** HdInstanceIndicesSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _instancer: HdPathDataSource | undefined
    private _prototypeIndex: HdIntDataSource | undefined
    private _instanceIndices: HdIntArrayDataSource | undefined
    setInstancer(instancer: HdPathDataSource | undefined): this {
      this._instancer = instancer
      return this
    }
    setPrototypeIndex(prototypeIndex: HdIntDataSource | undefined): this {
      this._prototypeIndex = prototypeIndex
      return this
    }
    setInstanceIndices(instanceIndices: HdIntArrayDataSource | undefined): this {
      this._instanceIndices = instanceIndices
      return this
    }
    build(): HdContainerDataSource {
      return HdInstanceIndicesSchema.buildRetained(
        this._instancer,
        this._prototypeIndex,
        this._instanceIndices,
      )
    }
  }
}
