// Ported from OpenUSD 26.11.1: pxr/imaging/hd/lensDistortionSchema.cpp,
//  pxr/imaging/hd/lensDistortionSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/lensDistortionSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the LensDistortion entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream lensDistortionSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdCameraSchema } from './cameraSchema.ts'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdFloatDataSource, HdTokenDataSource, HdVec2fDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** lensDistortionSchema.h TF_DECLARE_PUBLIC_TOKENS(HdLensDistortionSchemaTokens) */
export const HdLensDistortionSchemaTokens = TfMakeTokens({
  lensDistortion: 'lensDistortion',
  type: 'type',
  k1: 'k1',
  k2: 'k2',
  center: 'center',
  anaSq: 'anaSq',
  asym: 'asym',
  scale: 'scale',
  ior: 'ior',
  standard: 'standard',
  fisheye: 'fisheye',
})

export class HdLensDistortionSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** lensDistortionSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdLensDistortionSchema {
    const ds = fromParentContainer?.Get(HdLensDistortionSchemaTokens.lensDistortion)
    return new HdLensDistortionSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getType(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdLensDistortionSchemaTokens.type)
  }

  getK1(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdLensDistortionSchemaTokens.k1)
  }

  getK2(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdLensDistortionSchemaTokens.k2)
  }

  getCenter(): HdVec2fDataSource | undefined {
    return this._getTypedDataSource<HdVec2fDataSource>(HdLensDistortionSchemaTokens.center)
  }

  getAnaSq(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdLensDistortionSchemaTokens.anaSq)
  }

  getAsym(): HdVec2fDataSource | undefined {
    return this._getTypedDataSource<HdVec2fDataSource>(HdLensDistortionSchemaTokens.asym)
  }

  getScale(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdLensDistortionSchemaTokens.scale)
  }

  getIor(): HdFloatDataSource | undefined {
    return this._getTypedDataSource<HdFloatDataSource>(HdLensDistortionSchemaTokens.ior)
  }

  static getSchemaToken(): TfToken {
    return HdLensDistortionSchemaTokens.lensDistortion
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdLensDistortionSchema._defaultLocator ??= HdCameraSchema.getDefaultLocator().append(HdLensDistortionSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    type?: HdTokenDataSource | undefined,
    k1?: HdFloatDataSource | undefined,
    k2?: HdFloatDataSource | undefined,
    center?: HdVec2fDataSource | undefined,
    anaSq?: HdFloatDataSource | undefined,
    asym?: HdVec2fDataSource | undefined,
    scale?: HdFloatDataSource | undefined,
    ior?: HdFloatDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdLensDistortionSchemaTokens.type]: type,
      [HdLensDistortionSchemaTokens.k1]: k1,
      [HdLensDistortionSchemaTokens.k2]: k2,
      [HdLensDistortionSchemaTokens.center]: center,
      [HdLensDistortionSchemaTokens.anaSq]: anaSq,
      [HdLensDistortionSchemaTokens.asym]: asym,
      [HdLensDistortionSchemaTokens.scale]: scale,
      [HdLensDistortionSchemaTokens.ior]: ior,
    })
  }

  private static _typeDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as type value; the values
   * standard, fisheye are stored statically and reused. */
  static buildTypeDataSource(type: string): HdTokenDataSource {
    const known: readonly string[] = [HdLensDistortionSchemaTokens.standard, HdLensDistortionSchemaTokens.fisheye]
    if (known.includes(type)) {
      const cache = HdLensDistortionSchema._typeDataSources ??= new Map()
      let ds = cache.get(type)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(type)
        cache.set(type, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(type)
  }
}

export namespace HdLensDistortionSchema {
  /** HdLensDistortionSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _type: HdTokenDataSource | undefined
    private _k1: HdFloatDataSource | undefined
    private _k2: HdFloatDataSource | undefined
    private _center: HdVec2fDataSource | undefined
    private _anaSq: HdFloatDataSource | undefined
    private _asym: HdVec2fDataSource | undefined
    private _scale: HdFloatDataSource | undefined
    private _ior: HdFloatDataSource | undefined
    setType(type: HdTokenDataSource | undefined): this {
      this._type = type
      return this
    }
    setK1(k1: HdFloatDataSource | undefined): this {
      this._k1 = k1
      return this
    }
    setK2(k2: HdFloatDataSource | undefined): this {
      this._k2 = k2
      return this
    }
    setCenter(center: HdVec2fDataSource | undefined): this {
      this._center = center
      return this
    }
    setAnaSq(anaSq: HdFloatDataSource | undefined): this {
      this._anaSq = anaSq
      return this
    }
    setAsym(asym: HdVec2fDataSource | undefined): this {
      this._asym = asym
      return this
    }
    setScale(scale: HdFloatDataSource | undefined): this {
      this._scale = scale
      return this
    }
    setIor(ior: HdFloatDataSource | undefined): this {
      this._ior = ior
      return this
    }
    build(): HdContainerDataSource {
      return HdLensDistortionSchema.buildRetained(
        this._type,
        this._k1,
        this._k2,
        this._center,
        this._anaSq,
        this._asym,
        this._scale,
        this._ior,
      )
    }
  }
}
