// Ported from OpenUSD 26.11.1: pxr/imaging/hd/meshSchema.cpp,
//  pxr/imaging/hd/meshSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/meshSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Mesh entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream meshSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { HdMeshTopologySchema } from './meshTopologySchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdSubdivisionTagsSchema } from './subdivisionTagsSchema.ts'

/** meshSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMeshSchemaTokens) */
export const HdMeshSchemaTokens = TfMakeTokens({
  mesh: 'mesh',
  topology: 'topology',
  subdivisionScheme: 'subdivisionScheme',
  subdivisionTags: 'subdivisionTags',
  doubleSided: 'doubleSided',
})

export class HdMeshSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** meshSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdMeshSchema {
    const ds = fromParentContainer?.Get(HdMeshSchemaTokens.mesh)
    return new HdMeshSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  GetTopology(): HdMeshTopologySchema {
    return new HdMeshTopologySchema(this._getContainerDataSource(HdMeshSchemaTokens.topology))
  }

  getSubdivisionScheme(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMeshSchemaTokens.subdivisionScheme)
  }

  getSubdivisionTags(): HdSubdivisionTagsSchema {
    return new HdSubdivisionTagsSchema(this._getContainerDataSource(HdMeshSchemaTokens.subdivisionTags))
  }

  getDoubleSided(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdMeshSchemaTokens.doubleSided)
  }

  static getSchemaToken(): TfToken {
    return HdMeshSchemaTokens.mesh
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdMeshSchema._defaultLocator ??= new HdDataSourceLocator(HdMeshSchema.getSchemaToken())
  }

  private static _topologyLocator: HdDataSourceLocator | undefined
  static getTopologyLocator(): HdDataSourceLocator {
    return HdMeshSchema._topologyLocator ??= HdMeshSchema.getDefaultLocator().append(HdMeshSchemaTokens.topology)
  }

  private static _subdivisionSchemeLocator: HdDataSourceLocator | undefined
  static getSubdivisionSchemeLocator(): HdDataSourceLocator {
    return HdMeshSchema._subdivisionSchemeLocator ??= HdMeshSchema.getDefaultLocator().append(HdMeshSchemaTokens.subdivisionScheme)
  }

  private static _subdivisionTagsLocator: HdDataSourceLocator | undefined
  static getSubdivisionTagsLocator(): HdDataSourceLocator {
    return HdMeshSchema._subdivisionTagsLocator ??= HdMeshSchema.getDefaultLocator().append(HdMeshSchemaTokens.subdivisionTags)
  }

  private static _doubleSidedLocator: HdDataSourceLocator | undefined
  static getDoubleSidedLocator(): HdDataSourceLocator {
    return HdMeshSchema._doubleSidedLocator ??= HdMeshSchema.getDefaultLocator().append(HdMeshSchemaTokens.doubleSided)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    topology?: HdContainerDataSource | undefined,
    subdivisionScheme?: HdTokenDataSource | undefined,
    subdivisionTags?: HdContainerDataSource | undefined,
    doubleSided?: HdBoolDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMeshSchemaTokens.topology]: topology,
      [HdMeshSchemaTokens.subdivisionScheme]: subdivisionScheme,
      [HdMeshSchemaTokens.subdivisionTags]: subdivisionTags,
      [HdMeshSchemaTokens.doubleSided]: doubleSided,
    })
  }
}

export namespace HdMeshSchema {
  /** HdMeshSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _topology: HdContainerDataSource | undefined
    private _subdivisionScheme: HdTokenDataSource | undefined
    private _subdivisionTags: HdContainerDataSource | undefined
    private _doubleSided: HdBoolDataSource | undefined
    setTopology(topology: HdContainerDataSource | undefined): this {
      this._topology = topology
      return this
    }
    setSubdivisionScheme(subdivisionScheme: HdTokenDataSource | undefined): this {
      this._subdivisionScheme = subdivisionScheme
      return this
    }
    setSubdivisionTags(subdivisionTags: HdContainerDataSource | undefined): this {
      this._subdivisionTags = subdivisionTags
      return this
    }
    setDoubleSided(doubleSided: HdBoolDataSource | undefined): this {
      this._doubleSided = doubleSided
      return this
    }
    build(): HdContainerDataSource {
      return HdMeshSchema.buildRetained(
        this._topology,
        this._subdivisionScheme,
        this._subdivisionTags,
        this._doubleSided,
      )
    }
  }
}
