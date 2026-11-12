// Ported from OpenUSD 26.11.1: pxr/imaging/hd/basisCurvesSchema.cpp,
//  pxr/imaging/hd/basisCurvesSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/basisCurvesSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the BasisCurves entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream basisCurvesSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdBasisCurvesTopologySchema } from './basisCurvesTopologySchema.ts'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** basisCurvesSchema.h TF_DECLARE_PUBLIC_TOKENS(HdBasisCurvesSchemaTokens) */
export const HdBasisCurvesSchemaTokens = TfMakeTokens({
  basisCurves: 'basisCurves',
  topology: 'topology',
})

export class HdBasisCurvesSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** basisCurvesSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdBasisCurvesSchema {
    const ds = fromParentContainer?.Get(HdBasisCurvesSchemaTokens.basisCurves)
    return new HdBasisCurvesSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  GetTopology(): HdBasisCurvesTopologySchema {
    return new HdBasisCurvesTopologySchema(this._getContainerDataSource(HdBasisCurvesSchemaTokens.topology))
  }

  static getSchemaToken(): TfToken {
    return HdBasisCurvesSchemaTokens.basisCurves
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdBasisCurvesSchema._defaultLocator ??= new HdDataSourceLocator(HdBasisCurvesSchema.getSchemaToken())
  }

  private static _topologyLocator: HdDataSourceLocator | undefined
  static getTopologyLocator(): HdDataSourceLocator {
    return HdBasisCurvesSchema._topologyLocator ??= HdBasisCurvesSchema.getDefaultLocator().append(HdBasisCurvesSchemaTokens.topology)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    topology?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdBasisCurvesSchemaTokens.topology]: topology,
    })
  }
}

export namespace HdBasisCurvesSchema {
  /** HdBasisCurvesSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _topology: HdContainerDataSource | undefined
    setTopology(topology: HdContainerDataSource | undefined): this {
      this._topology = topology
      return this
    }
    build(): HdContainerDataSource {
      return HdBasisCurvesSchema.buildRetained(
        this._topology,
      )
    }
  }
}
