// Ported from OpenUSD 26.11.1: pxr/imaging/hd/instancerTopologySchema.cpp,
//  pxr/imaging/hd/instancerTopologySchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instancerTopologySchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the InstancerTopology entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream instancerTopologySchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdBoolArrayDataSource, HdPathArrayDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdIntArrayVectorSchema } from './schemaTypeDefs.ts'

// --(BEGIN CUSTOM CODE: Declares)--
// VtArray values may arrive as plain arrays or VtArray (toArray()).
function _toArray(v: unknown): readonly unknown[] {
  if (Array.isArray(v)) return v
  const a = v as { toArray?: () => unknown[] } | undefined
  return a?.toArray ? a.toArray() : []
}

// SdfPath::HasPrefix on path strings.
function _hasPrefix(path: string, prefix: string): boolean {
  if (prefix === '/') return path.startsWith('/')
  if (!path.startsWith(prefix)) return false
  const c = path.charAt(prefix.length)
  return c === '' || c === '/' || c === '.' || c === '{'
}
// --(END CUSTOM CODE: Declares)--

/** instancerTopologySchema.h TF_DECLARE_PUBLIC_TOKENS(HdInstancerTopologySchemaTokens) */
export const HdInstancerTopologySchemaTokens = TfMakeTokens({
  instancerTopology: 'instancerTopology',
  prototypes: 'prototypes',
  instanceIndices: 'instanceIndices',
  mask: 'mask',
  instanceLocations: 'instanceLocations',
})

/**
 * Since the instancing schema is complicated:
 *
 * An instancer is a prim at a certain scenegraph location that causes other
 * prims to be duplicated. The instancer can also hold instance-varying data
 * like constant primvars or material relationships.
 *
 * The important things an instancer has is:
 *
 * 1.) Instancer topology, describing how exactly the prims are duplicated;
 *
 * 2.) Instance-rate data, meaning data that varies per instance, such as
 * primvars or material bindings.
 *
 * If an instancer causes prims "/A" and "/B" to be duplicated, we encode that
 * by setting prototypes = ["/A", "/B"]. Note that "/A" and "/B" can be
 * subtrees, not direct gprims. instanceIndices encodes both multiplicity and
 * position in arrays of instance-rate data, per prototype path; if
 * instanceIndices = { [0,2], [1] }, then we draw /A twice (with instance
 * primvar indices 0 and 2); and /B once (with instance primvar index 1). Mask
 * is an auxiliary parameter that can be used to deactivate certain instances;
 * mask = [true, true, false] would disable the second copy of "/A". An empty
 * mask array is the same as all-true.
 *
 * Scenes generally specify instancing in one of two ways:
 *
 * 1.) Explicit instancing: prim /Instancer wants to draw its subtree at an
 * array of locations. This is a data expansion form.
 *
 * 2.) Implicit instancing: prims /X and /Y are marked as being identical, and
 * scene load replaces them with a single prim and an instancer. This is a
 * data coalescing form.
 *
 * For implicit instancing, we want to know the original paths of /X and /Y,
 * for doing things like resolving inheritance. This is encoded in the
 * "instanceLocations" path, while the prototype prims (e.g. /_Prototype/Cube,
 * the deduplicated version of /X/Cube and /Y/Cube) is encoded in the
 * "prototypes" path.
 *
 * For explicit instancing, the "instanceLocations" attribute is meaningless
 * and should be left null.
 */
export class HdInstancerTopologySchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** instancerTopologySchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdInstancerTopologySchema {
    const ds = fromParentContainer?.Get(HdInstancerTopologySchemaTokens.instancerTopology)
    return new HdInstancerTopologySchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** instancerTopologySchema.cpp ComputeInstanceIndicesForProto */
  computeInstanceIndicesForProto(path: string): number[] {
    let result: number[] = []
    const matchingPrototypes: number[] = []

    // If we can't get the instance indices datasource, not much point...
    const indicesSchema = this.getInstanceIndices()
    if (!indicesSchema.isDefined()) return result

    // Map from path -> matchingPrototypes.
    let prototypes: readonly string[] = []
    const protoDs = this.getPrototypes()
    if (protoDs) prototypes = _toArray(protoDs.getTypedValue(0)) as string[]

    for (let i = 0; i < prototypes.length; ++i) {
      if (_hasPrefix(path, prototypes[i]!)) matchingPrototypes.push(i)
    }

    let mask: readonly boolean[] = []
    const maskDs = this.GetMask()
    if (maskDs) mask = _toArray(maskDs.getTypedValue(0)) as boolean[]

    // Map from matchingPrototypes -> instanceIndices, taking mask into account.
    for (const protoIndex of matchingPrototypes) {
      let instanceIndices: readonly number[] = []
      const indicesDs = indicesSchema.getElement(protoIndex)
      if (indicesDs) instanceIndices = _toArray(indicesDs.getTypedValue(0)) as number[]

      // If mask is empty, we can just copy or append the array...
      if (mask.length === 0 && result.length === 0) {
        result = [...instanceIndices]
      } else if (mask.length === 0) {
        result.push(...instanceIndices)
      } else {
        for (const instanceIndex of instanceIndices) {
          if (instanceIndex >= mask.length || mask[instanceIndex]) {
            result.push(instanceIndex)
          }
        }
      }
    }
    return result
  }
  // --(END CUSTOM CODE: Schema Methods)--

  getPrototypes(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(HdInstancerTopologySchemaTokens.prototypes)
  }

  getInstanceIndices(): HdIntArrayVectorSchema {
    return new HdIntArrayVectorSchema(this._getVectorDataSource(HdInstancerTopologySchemaTokens.instanceIndices))
  }

  GetMask(): HdBoolArrayDataSource | undefined {
    return this._getTypedDataSource<HdBoolArrayDataSource>(HdInstancerTopologySchemaTokens.mask)
  }

  getInstanceLocations(): HdPathArrayDataSource | undefined {
    return this._getTypedDataSource<HdPathArrayDataSource>(HdInstancerTopologySchemaTokens.instanceLocations)
  }

  static getSchemaToken(): TfToken {
    return HdInstancerTopologySchemaTokens.instancerTopology
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdInstancerTopologySchema._defaultLocator ??= new HdDataSourceLocator(HdInstancerTopologySchema.getSchemaToken())
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    prototypes?: HdPathArrayDataSource | undefined,
    instanceIndices?: HdVectorDataSource | undefined,
    mask?: HdBoolArrayDataSource | undefined,
    instanceLocations?: HdPathArrayDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdInstancerTopologySchemaTokens.prototypes]: prototypes,
      [HdInstancerTopologySchemaTokens.instanceIndices]: instanceIndices,
      [HdInstancerTopologySchemaTokens.mask]: mask,
      [HdInstancerTopologySchemaTokens.instanceLocations]: instanceLocations,
    })
  }
}

export namespace HdInstancerTopologySchema {
  /** HdInstancerTopologySchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _prototypes: HdPathArrayDataSource | undefined
    private _instanceIndices: HdVectorDataSource | undefined
    private _mask: HdBoolArrayDataSource | undefined
    private _instanceLocations: HdPathArrayDataSource | undefined
    setPrototypes(prototypes: HdPathArrayDataSource | undefined): this {
      this._prototypes = prototypes
      return this
    }
    setInstanceIndices(instanceIndices: HdVectorDataSource | undefined): this {
      this._instanceIndices = instanceIndices
      return this
    }
    setMask(mask: HdBoolArrayDataSource | undefined): this {
      this._mask = mask
      return this
    }
    setInstanceLocations(instanceLocations: HdPathArrayDataSource | undefined): this {
      this._instanceLocations = instanceLocations
      return this
    }
    build(): HdContainerDataSource {
      return HdInstancerTopologySchema.buildRetained(
        this._prototypes,
        this._instanceIndices,
        this._mask,
        this._instanceLocations,
      )
    }
  }
}
