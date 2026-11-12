// Ported from OpenUSD 26.11.1: pxr/imaging/hd/tetMeshTopologySchema.cpp,
//  pxr/imaging/hd/tetMeshTopologySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/tetMeshTopologySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the TetMeshTopology entry of pxr/imaging/hd/hdSchemaDefs.py:137-154 with the
// codegenTemplates/schemaClass.{h,cpp} templates.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource, HdVec3iArrayDataSource, HdVec4iArrayDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdTetMeshSchema } from './tetMeshSchema.ts'

/** tetMeshTopologySchema.h TF_DECLARE_PUBLIC_TOKENS(HdTetMeshTopologySchemaTokens) */
export const HdTetMeshTopologySchemaTokens = TfMakeTokens({
  topology: 'topology',
  tetVertexIndices: 'tetVertexIndices',
  surfaceFaceVertexIndices: 'surfaceFaceVertexIndices',
  orientation: 'orientation',
  leftHanded: 'leftHanded',
  rightHanded: 'rightHanded',
})

export class HdTetMeshTopologySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** tetMeshTopologySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdTetMeshTopologySchema {
    const ds = fromParentContainer?.Get(HdTetMeshTopologySchemaTokens.topology)
    return new HdTetMeshTopologySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getTetVertexIndices(): HdVec4iArrayDataSource | undefined {
    return this._getTypedDataSource<HdVec4iArrayDataSource>(HdTetMeshTopologySchemaTokens.tetVertexIndices)
  }

  getSurfaceFaceVertexIndices(): HdVec3iArrayDataSource | undefined {
    return this._getTypedDataSource<HdVec3iArrayDataSource>(HdTetMeshTopologySchemaTokens.surfaceFaceVertexIndices)
  }

  getOrientation(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdTetMeshTopologySchemaTokens.orientation)
  }

  static getSchemaToken(): TfToken {
    return HdTetMeshTopologySchemaTokens.topology
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdTetMeshTopologySchema._defaultLocator ??= HdTetMeshSchema.getDefaultLocator().append(HdTetMeshTopologySchema.getSchemaToken())
  }

  private static _tetVertexIndicesLocator: HdDataSourceLocator | undefined
  static getTetVertexIndicesLocator(): HdDataSourceLocator {
    return HdTetMeshTopologySchema._tetVertexIndicesLocator ??= HdTetMeshTopologySchema.getDefaultLocator().append(HdTetMeshTopologySchemaTokens.tetVertexIndices)
  }

  private static _surfaceFaceVertexIndicesLocator: HdDataSourceLocator | undefined
  static getSurfaceFaceVertexIndicesLocator(): HdDataSourceLocator {
    return HdTetMeshTopologySchema._surfaceFaceVertexIndicesLocator ??= HdTetMeshTopologySchema.getDefaultLocator().append(HdTetMeshTopologySchemaTokens.surfaceFaceVertexIndices)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    tetVertexIndices?: HdVec4iArrayDataSource | undefined,
    surfaceFaceVertexIndices?: HdVec3iArrayDataSource | undefined,
    orientation?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdTetMeshTopologySchemaTokens.tetVertexIndices]: tetVertexIndices,
      [HdTetMeshTopologySchemaTokens.surfaceFaceVertexIndices]: surfaceFaceVertexIndices,
      [HdTetMeshTopologySchemaTokens.orientation]: orientation,
    })
  }

  private static _orientationDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as orientation value; the values
   * leftHanded, rightHanded are stored statically and reused. */
  static buildOrientationDataSource(orientation: string): HdTokenDataSource {
    const known: readonly string[] = [HdTetMeshTopologySchemaTokens.leftHanded, HdTetMeshTopologySchemaTokens.rightHanded]
    if (known.includes(orientation)) {
      const cache = HdTetMeshTopologySchema._orientationDataSources ??= new Map()
      let ds = cache.get(orientation)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(orientation)
        cache.set(orientation, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(orientation)
  }
}

export namespace HdTetMeshTopologySchema {
  /** HdTetMeshTopologySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _tetVertexIndices: HdVec4iArrayDataSource | undefined
    private _surfaceFaceVertexIndices: HdVec3iArrayDataSource | undefined
    private _orientation: HdTokenDataSource | undefined
    setTetVertexIndices(tetVertexIndices: HdVec4iArrayDataSource | undefined): this {
      this._tetVertexIndices = tetVertexIndices
      return this
    }
    setSurfaceFaceVertexIndices(surfaceFaceVertexIndices: HdVec3iArrayDataSource | undefined): this {
      this._surfaceFaceVertexIndices = surfaceFaceVertexIndices
      return this
    }
    setOrientation(orientation: HdTokenDataSource | undefined): this {
      this._orientation = orientation
      return this
    }
    build(): HdContainerDataSource {
      return HdTetMeshTopologySchema.buildRetained(
        this._tetVertexIndices,
        this._surfaceFaceVertexIndices,
        this._orientation,
      )
    }
  }
}
