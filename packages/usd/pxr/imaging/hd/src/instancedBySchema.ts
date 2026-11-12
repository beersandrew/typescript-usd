// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instancedBySchema.cpp,
//  pxr/imaging/hd/instancedBySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instancedBySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the InstancedBy entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream instancedBySchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathArrayDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

/** instancedBySchema.h TF_DECLARE_PUBLIC_TOKENS(HdInstancedBySchemaTokens) */
export const HdInstancedBySchemaTokens = TfMakeTokens({
  instancedBy: 'instancedBy',
  paths: 'paths',
  prototypeRoots: 'prototypeRoots',
})

/**
 * A schema marking a prim as instanced by another prim.
 *
 * Many renderers need to know not what prototypes an instancer has, but
 * rather what instancers a prototype has; this is encoded in "instancedBy". A
 * prim is "instancedBy" /Instancer if /Instancer has a prototype path that's
 * a parent of the prim. A complicating exception is if /A instances /A/B,
 * which instances /A/B/C, we don't consider /A to be instancing /A/B/C
 * directly; this is to support nested explicit instancing of things like
 * leaves/trees/forests.
 *
 * This value is computed based on the instancer topology of instancer prims
 * in the scene.
 *
 * Note: if multiple instancers reference a prototype, it's possible for
 * instancedBy to contain multiple entries. Some renderers may be able to read
 * this directly, but some may need to duplicate prims with an op so that each
 * prim has a single instancer, depending on how the renderer exposes
 * instancing.
 */
export class HdInstancedBySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** instancedBySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdInstancedBySchema {
    const ds = fromParentContainer?.Get(HdInstancedBySchemaTokens.instancedBy)
    return new HdInstancedBySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getPaths(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(HdInstancedBySchemaTokens.paths)
  }

  getPrototypeRoots(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(HdInstancedBySchemaTokens.prototypeRoots)
  }

  static getSchemaToken(): TfToken {
    return HdInstancedBySchemaTokens.instancedBy
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdInstancedBySchema._defaultLocator ??= new HdDataSourceLocator(HdInstancedBySchema.getSchemaToken())
  }

  private static _pathsLocator: HdDataSourceLocator | undefined
  static getPathsLocator(): HdDataSourceLocator {
    return HdInstancedBySchema._pathsLocator ??= HdInstancedBySchema.getDefaultLocator().append(HdInstancedBySchemaTokens.paths)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    paths?: HdPathArrayDataSource | undefined,
    prototypeRoots?: HdPathArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdInstancedBySchemaTokens.paths]: paths,
      [HdInstancedBySchemaTokens.prototypeRoots]: prototypeRoots,
    })
  }
}

export namespace HdInstancedBySchema {
  /** HdInstancedBySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _paths: HdPathArrayDataSource | undefined
    private _prototypeRoots: HdPathArrayDataSource | undefined
    setPaths(paths: HdPathArrayDataSource | undefined): this {
      this._paths = paths
      return this
    }
    setPrototypeRoots(prototypeRoots: HdPathArrayDataSource | undefined): this {
      this._prototypeRoots = prototypeRoots
      return this
    }
    build(): HdContainerDataSource {
      return HdInstancedBySchema.buildRetained(
        this._paths,
        this._prototypeRoots,
      )
    }
  }
}
