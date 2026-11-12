// Ported from OpenUSD 26.11.1: pxr/imaging/hd/meshTopologySchema.cpp,
//  pxr/imaging/hd/meshTopologySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/meshTopologySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MeshTopology entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream meshTopologySchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdIntArrayDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { HdMeshSchema } from './meshSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** meshTopologySchema.h TF_DECLARE_PUBLIC_TOKENS(HdMeshTopologySchemaTokens) */
export const HdMeshTopologySchemaTokens = TfMakeTokens({
  topology: 'topology',
  faceVertexCounts: 'faceVertexCounts',
  faceVertexIndices: 'faceVertexIndices',
  holeIndices: 'holeIndices',
  orientation: 'orientation',
  leftHanded: 'leftHanded',
  rightHanded: 'rightHanded',
})

export class HdMeshTopologySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** meshTopologySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdMeshTopologySchema {
    const ds = fromParentContainer?.Get(HdMeshTopologySchemaTokens.topology)
    return new HdMeshTopologySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getFaceVertexCounts(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdMeshTopologySchemaTokens.faceVertexCounts)
  }

  getFaceVertexIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdMeshTopologySchemaTokens.faceVertexIndices)
  }

  getHoleIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdMeshTopologySchemaTokens.holeIndices)
  }

  getOrientation(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMeshTopologySchemaTokens.orientation)
  }

  static getSchemaToken(): TfToken {
    return HdMeshTopologySchemaTokens.topology
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdMeshTopologySchema._defaultLocator ??= HdMeshSchema.getDefaultLocator().append(HdMeshTopologySchema.getSchemaToken())
  }

  private static _faceVertexCountsLocator: HdDataSourceLocator | undefined
  static getFaceVertexCountsLocator(): HdDataSourceLocator {
    return HdMeshTopologySchema._faceVertexCountsLocator ??= HdMeshTopologySchema.getDefaultLocator().append(HdMeshTopologySchemaTokens.faceVertexCounts)
  }

  private static _faceVertexIndicesLocator: HdDataSourceLocator | undefined
  static getFaceVertexIndicesLocator(): HdDataSourceLocator {
    return HdMeshTopologySchema._faceVertexIndicesLocator ??= HdMeshTopologySchema.getDefaultLocator().append(HdMeshTopologySchemaTokens.faceVertexIndices)
  }

  private static _holeIndicesLocator: HdDataSourceLocator | undefined
  static getHoleIndicesLocator(): HdDataSourceLocator {
    return HdMeshTopologySchema._holeIndicesLocator ??= HdMeshTopologySchema.getDefaultLocator().append(HdMeshTopologySchemaTokens.holeIndices)
  }

  private static _orientationLocator: HdDataSourceLocator | undefined
  static getOrientationLocator(): HdDataSourceLocator {
    return HdMeshTopologySchema._orientationLocator ??= HdMeshTopologySchema.getDefaultLocator().append(HdMeshTopologySchemaTokens.orientation)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    faceVertexCounts?: HdIntArrayDataSource | undefined,
    faceVertexIndices?: HdIntArrayDataSource | undefined,
    holeIndices?: HdIntArrayDataSource | undefined,
    orientation?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMeshTopologySchemaTokens.faceVertexCounts]: faceVertexCounts,
      [HdMeshTopologySchemaTokens.faceVertexIndices]: faceVertexIndices,
      [HdMeshTopologySchemaTokens.holeIndices]: holeIndices,
      [HdMeshTopologySchemaTokens.orientation]: orientation,
    })
  }

  private static _orientationDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as orientation value; the values
   * leftHanded, rightHanded are stored statically and reused. */
  static buildOrientationDataSource(orientation: string): HdTokenDataSource {
    const known: readonly string[] = [HdMeshTopologySchemaTokens.leftHanded, HdMeshTopologySchemaTokens.rightHanded]
    if (known.includes(orientation)) {
      const cache = HdMeshTopologySchema._orientationDataSources ??= new Map()
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

export namespace HdMeshTopologySchema {
  /** HdMeshTopologySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _faceVertexCounts: HdIntArrayDataSource | undefined
    private _faceVertexIndices: HdIntArrayDataSource | undefined
    private _holeIndices: HdIntArrayDataSource | undefined
    private _orientation: HdTokenDataSource | undefined
    setFaceVertexCounts(faceVertexCounts: HdIntArrayDataSource | undefined): this {
      this._faceVertexCounts = faceVertexCounts
      return this
    }
    setFaceVertexIndices(faceVertexIndices: HdIntArrayDataSource | undefined): this {
      this._faceVertexIndices = faceVertexIndices
      return this
    }
    setHoleIndices(holeIndices: HdIntArrayDataSource | undefined): this {
      this._holeIndices = holeIndices
      return this
    }
    setOrientation(orientation: HdTokenDataSource | undefined): this {
      this._orientation = orientation
      return this
    }
    build(): HdContainerDataSource {
      return HdMeshTopologySchema.buildRetained(
        this._faceVertexCounts,
        this._faceVertexIndices,
        this._holeIndices,
        this._orientation,
      )
    }
  }
}
