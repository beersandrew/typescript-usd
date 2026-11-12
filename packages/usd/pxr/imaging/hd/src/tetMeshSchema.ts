// Ported from OpenUSD 26.11.1: pxr/imaging/hd/tetMeshSchema.cpp,
//  pxr/imaging/hd/tetMeshSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/tetMeshSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the TetMesh entry of pxr/imaging/hd/hdSchemaDefs.py:120-136 with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdTetMeshTopologySchema } from './tetMeshTopologySchema.ts'

/** tetMeshSchema.h TF_DECLARE_PUBLIC_TOKENS(HdTetMeshSchemaTokens) */
export const HdTetMeshSchemaTokens = TfMakeTokens({
  tetMesh: 'tetMesh',
  topology: 'topology',
  doubleSided: 'doubleSided',
})

export class HdTetMeshSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** tetMeshSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdTetMeshSchema {
    const ds = fromParentContainer?.Get(HdTetMeshSchemaTokens.tetMesh)
    return new HdTetMeshSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  GetTopology(): HdTetMeshTopologySchema {
    return new HdTetMeshTopologySchema(this._getContainerDataSource(HdTetMeshSchemaTokens.topology))
  }

  getDoubleSided(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdTetMeshSchemaTokens.doubleSided)
  }

  static getSchemaToken(): TfToken {
    return HdTetMeshSchemaTokens.tetMesh
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdTetMeshSchema._defaultLocator ??= new HdDataSourceLocator(HdTetMeshSchema.getSchemaToken())
  }

  private static _topologyLocator: HdDataSourceLocator | undefined
  static getTopologyLocator(): HdDataSourceLocator {
    return HdTetMeshSchema._topologyLocator ??= HdTetMeshSchema.getDefaultLocator().append(HdTetMeshSchemaTokens.topology)
  }

  private static _doubleSidedLocator: HdDataSourceLocator | undefined
  static getDoubleSidedLocator(): HdDataSourceLocator {
    return HdTetMeshSchema._doubleSidedLocator ??= HdTetMeshSchema.getDefaultLocator().append(HdTetMeshSchemaTokens.doubleSided)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    topology?: HdContainerDataSource | undefined,
    doubleSided?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdTetMeshSchemaTokens.topology]: topology,
      [HdTetMeshSchemaTokens.doubleSided]: doubleSided,
    })
  }
}

export namespace HdTetMeshSchema {
  /** HdTetMeshSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _topology: HdContainerDataSource | undefined
    private _doubleSided: HdBoolDataSource | undefined
    setTopology(topology: HdContainerDataSource | undefined): this {
      this._topology = topology
      return this
    }
    setDoubleSided(doubleSided: HdBoolDataSource | undefined): this {
      this._doubleSided = doubleSided
      return this
    }
    build(): HdContainerDataSource {
      return HdTetMeshSchema.buildRetained(
        this._topology,
        this._doubleSided,
      )
    }
  }
}
