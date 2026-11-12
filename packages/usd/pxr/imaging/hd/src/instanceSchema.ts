// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instanceSchema.cpp,
//  pxr/imaging/hd/instanceSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instanceSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Instance entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream instanceSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdIntDataSource, HdPathDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** instanceSchema.h TF_DECLARE_PUBLIC_TOKENS(HdInstanceSchemaTokens) */
export const HdInstanceSchemaTokens = TfMakeTokens({
  instance: 'instance',
  instancer: 'instancer',
  prototypeIndex: 'prototypeIndex',
  instanceIndex: 'instanceIndex',
})

/**
 * This schema can be considered the opposite of instancerTopology's
 * "instanceLocations". When the scene coalesces scene prims into multiple
 * instances of a single prototype, it inserts "instance" prims at the site of
 * de-duplication. The instancer prim added to manage the prototype uses
 * "instanceLocations" to point back to all of these instance prims.
 *
 * The instance prims aren't directly useful for rendering but can be useful
 * for scene processing and data aggregation.
 */
export class HdInstanceSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** instanceSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdInstanceSchema {
    const ds = fromParentContainer?.Get(HdInstanceSchemaTokens.instance)
    return new HdInstanceSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  /**
   * Path to instancer for which a (sub-)entry was added to its
   * instancerTopology's instanceIndices during instance aggregation to
   * account for this instance. Note that instanceIndices is nested, that is a
   * vector data source containing integer arrays, one for each prototype the
   * instancer is instancing. Thus, we need two indices to identify the entry:
   * prototypeIndex is the outer index and instanceIndex the inner index.
   */
  getInstancer(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(HdInstanceSchemaTokens.instancer)
  }

  /**
   * Index into vector data source at instancer's instancerTopology's
   * instanceIndices to find entry corresponding to this instance.
   */
  getPrototypeIndex(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdInstanceSchemaTokens.prototypeIndex)
  }

  /**
   * Index into int array within the vector data source at instancer's
   * instancerTopology's instanceIndices to find entry corresponding to this
   * instance.
   */
  getInstanceIndex(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdInstanceSchemaTokens.instanceIndex)
  }

  static getSchemaToken(): TfToken {
    return HdInstanceSchemaTokens.instance
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdInstanceSchema._defaultLocator ??= new HdDataSourceLocator(HdInstanceSchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    instancer?: HdPathDataSource | undefined,
    prototypeIndex?: HdIntDataSource | undefined,
    instanceIndex?: HdIntDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdInstanceSchemaTokens.instancer]: instancer,
      [HdInstanceSchemaTokens.prototypeIndex]: prototypeIndex,
      [HdInstanceSchemaTokens.instanceIndex]: instanceIndex,
    })
  }
}

export namespace HdInstanceSchema {
  /** HdInstanceSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _instancer: HdPathDataSource | undefined
    private _prototypeIndex: HdIntDataSource | undefined
    private _instanceIndex: HdIntDataSource | undefined
    setInstancer(instancer: HdPathDataSource | undefined): this {
      this._instancer = instancer
      return this
    }
    setPrototypeIndex(prototypeIndex: HdIntDataSource | undefined): this {
      this._prototypeIndex = prototypeIndex
      return this
    }
    setInstanceIndex(instanceIndex: HdIntDataSource | undefined): this {
      this._instanceIndex = instanceIndex
      return this
    }
    build(): HdContainerDataSource {
      return HdInstanceSchema.buildRetained(
        this._instancer,
        this._prototypeIndex,
        this._instanceIndex,
      )
    }
  }
}
