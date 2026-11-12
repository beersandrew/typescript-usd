// Ported from OpenUSD 26.11.1: pxr/imaging/hd/purposeSchema.cpp,
//  pxr/imaging/hd/purposeSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/purposeSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Purpose entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream purposeSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdRenderTagTokens } from './tokens.ts'

/** purposeSchema.h TF_DECLARE_PUBLIC_TOKENS(HdPurposeSchemaTokens) */
export const HdPurposeSchemaTokens = TfMakeTokens({
  purpose: 'purpose',
  inheritable: 'inheritable',
  fallback: 'fallback',
})

export class HdPurposeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** purposeSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdPurposeSchema {
    const ds = fromParentContainer?.Get(HdPurposeSchemaTokens.purpose)
    return new HdPurposeSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** purposeSchema.cpp: Resolve purpose to a TfToken value. This applies the
   * fallback value as needed, and ultimately uses "geometry" if no other
   * value is provided. */
  resolvePurposeValue(): TfToken {
    if (this.isDefined()) {
      const purposeDs = this.getPurpose()
      if (purposeDs) return purposeDs.getTypedValue(0) as TfToken
      const fallbackDs = this.getFallback()
      if (fallbackDs) return fallbackDs.getTypedValue(0) as TfToken
    }
    // Hydra's default purpose.
    return HdRenderTagTokens.geometry as TfToken
  }
  // --(END CUSTOM CODE: Schema Methods)--

  getPurpose(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdPurposeSchemaTokens.purpose)
  }

  /**
   * The "inheritable" flag indicates if this purpose schema should be
   * inherited by the HdFlattenedPurposeDataSourceProvider.
   */
  getInheritable(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdPurposeSchemaTokens.inheritable)
  }

  /**
   * The "purpose" concept in Hydra is modelled after the UsdGeomImageable
   * concept, which allows prim types to define a purpose fallback value to be
   * used when no purpose value is found on a prim or its ancestors. The Hydra
   * schema transports this fallback, if present, to apply it during
   * flattening.
   */
  getFallback(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdPurposeSchemaTokens.fallback)
  }

  static getSchemaToken(): TfToken {
    return HdPurposeSchemaTokens.purpose
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdPurposeSchema._defaultLocator ??= new HdDataSourceLocator(HdPurposeSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    purpose?: HdTokenDataSource | undefined,
    inheritable?: HdBoolDataSource | undefined,
    fallback?: HdTokenDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdPurposeSchemaTokens.purpose]: purpose,
      [HdPurposeSchemaTokens.inheritable]: inheritable,
      [HdPurposeSchemaTokens.fallback]: fallback,
    })
  }
}

export namespace HdPurposeSchema {
  /** HdPurposeSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _purpose: HdTokenDataSource | undefined
    private _inheritable: HdBoolDataSource | undefined
    private _fallback: HdTokenDataSource | undefined
    setPurpose(purpose: HdTokenDataSource | undefined): this {
      this._purpose = purpose
      return this
    }
    setInheritable(inheritable: HdBoolDataSource | undefined): this {
      this._inheritable = inheritable
      return this
    }
    setFallback(fallback: HdTokenDataSource | undefined): this {
      this._fallback = fallback
      return this
    }
    build(): HdContainerDataSource {
      return HdPurposeSchema.buildRetained(
        this._purpose,
        this._inheritable,
        this._fallback,
      )
    }
  }
}
