// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/shaderFunctionDesc.cpp,
//  pxr/imaging/hgi/shaderFunctionDesc.h, pxr/imaging/hgi/shaderGenerator.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/shaderFunctionDesc.{h,cpp} (OpenUSD 26.11.1).
//
// `const char *shaderCodeDeclarations/shaderCode` are `string | null`;
// `std::string *generatedShaderCodeOut` is an optional `{ value: string }`
// box the generator writes into (shaderGenerator.cpp:31-36).

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  HgiBindingType,
  HgiInterpolationType,
  HgiSamplingType,
  HgiShaderTextureType,
  HgiStorageType,
  type HgiShaderStage,
} from './enums.ts'
import { HgiFormat } from './types.ts'

function _vectorEquals<T extends { equals(o: T): boolean }>(
  lhs: readonly T[], rhs: readonly T[]): boolean {
  return lhs.length === rhs.length && lhs.every((v, i) => v.equals(rhs[i]!))
}

/** shaderFunctionDesc.h:48-60 */
export class HgiShaderFunctionTextureDesc {
  nameInShader = ''
  dimensions = 2
  format: HgiFormat = HgiFormat.HgiFormatInvalid
  textureType: HgiShaderTextureType = HgiShaderTextureType.HgiShaderTextureTypeTexture
  bindIndex = 0
  arraySize = 0
  writable = false

  /** operator== (shaderFunctionDesc.cpp:73-83); bindIndex is not compared
   *  upstream. */
  equals(rhs: HgiShaderFunctionTextureDesc): boolean {
    return this.nameInShader === rhs.nameInShader &&
      this.dimensions === rhs.dimensions &&
      this.format === rhs.format &&
      this.textureType === rhs.textureType &&
      this.arraySize === rhs.arraySize &&
      this.writable === rhs.writable
  }
}
export type HgiShaderFunctionTextureDescVector = HgiShaderFunctionTextureDesc[]

/** shaderFunctionDesc.h:94-105 */
export class HgiShaderFunctionBufferDesc {
  nameInShader = ''
  type = ''
  bindIndex = 0
  arraySize = 0
  binding: HgiBindingType = HgiBindingType.HgiBindingTypeValue
  writable = false

  /** operator== (shaderFunctionDesc.cpp:135-145) */
  equals(rhs: HgiShaderFunctionBufferDesc): boolean {
    return this.nameInShader === rhs.nameInShader &&
      this.type === rhs.type &&
      this.bindIndex === rhs.bindIndex &&
      this.arraySize === rhs.arraySize &&
      this.binding === rhs.binding &&
      this.writable === rhs.writable
  }
}
export type HgiShaderFunctionBufferDescVector = HgiShaderFunctionBufferDesc[]

/** shaderFunctionDesc.h:146-160 */
export class HgiShaderFunctionParamDesc {
  nameInShader = ''
  type = ''
  location = -1
  interstageSlot = -1
  interpolation: HgiInterpolationType = HgiInterpolationType.HgiInterpolationDefault
  sampling: HgiSamplingType = HgiSamplingType.HgiSamplingDefault
  storage: HgiStorageType = HgiStorageType.HgiStorageDefault
  role = ''
  arraySize = ''

  /** operator== (shaderFunctionDesc.cpp:154-167) */
  equals(rhs: HgiShaderFunctionParamDesc): boolean {
    return this.nameInShader === rhs.nameInShader &&
      this.type === rhs.type &&
      this.location === rhs.location &&
      this.interstageSlot === rhs.interstageSlot &&
      this.interpolation === rhs.interpolation &&
      this.sampling === rhs.sampling &&
      this.storage === rhs.storage &&
      this.role === rhs.role &&
      this.arraySize === rhs.arraySize
  }
}
export type HgiShaderFunctionParamDescVector = HgiShaderFunctionParamDesc[]

/** HgiShaderFunctionParamBlockDesc::Member (shaderFunctionDesc.h:198-203) */
export class HgiShaderFunctionParamBlockDescMember {
  name = ''
  type = ''
  interpolation: HgiInterpolationType = HgiInterpolationType.HgiInterpolationDefault
  sampling: HgiSamplingType = HgiSamplingType.HgiSamplingDefault

  /** operator== (shaderFunctionDesc.cpp:194-200); interpolation and
   *  sampling are not compared upstream. */
  equals(rhs: HgiShaderFunctionParamBlockDescMember): boolean {
    return this.name === rhs.name &&
      this.type === rhs.type
  }
}

/** shaderFunctionDesc.h:193-211 */
export class HgiShaderFunctionParamBlockDesc {
  static readonly Member = HgiShaderFunctionParamBlockDescMember

  blockName = ''
  instanceName = ''
  members: HgiShaderFunctionParamBlockDescMember[] = []
  arraySize = ''
  interstageSlot = -1

  /** operator== (shaderFunctionDesc.cpp:176-185) */
  equals(rhs: HgiShaderFunctionParamBlockDesc): boolean {
    return this.blockName === rhs.blockName &&
      this.instanceName === rhs.instanceName &&
      _vectorEquals(this.members, rhs.members) &&
      this.arraySize === rhs.arraySize &&
      this.interstageSlot === rhs.interstageSlot
  }
}
export type HgiShaderFunctionParamBlockDescVector = HgiShaderFunctionParamBlockDesc[]

/** shaderFunctionDesc.h:252-258 */
export class HgiShaderFunctionComputeDesc {
  localSize: GfVec3i = new GfVec3i(0, 0, 0)

  /** operator== (shaderFunctionDesc.cpp:209-214) */
  equals(rhs: HgiShaderFunctionComputeDesc): boolean {
    return this.localSize.equals(rhs.localSize)
  }
}

/** shaderFunctionDesc.h:289 */
export enum HgiShaderFunctionTessellationDescPatchType { Triangles, Quads, Isolines }
/** shaderFunctionDesc.h:290 */
export enum HgiShaderFunctionTessellationDescSpacing { Equal, FractionalEven, FractionalOdd }
/** shaderFunctionDesc.h:291 */
export enum HgiShaderFunctionTessellationDescOrdering { CW, CCW }

/** shaderFunctionDesc.h:287-300 */
export class HgiShaderFunctionTessellationDesc {
  static readonly PatchType = HgiShaderFunctionTessellationDescPatchType
  static readonly Spacing = HgiShaderFunctionTessellationDescSpacing
  static readonly Ordering = HgiShaderFunctionTessellationDescOrdering

  patchType = HgiShaderFunctionTessellationDescPatchType.Triangles
  spacing = HgiShaderFunctionTessellationDescSpacing.Equal
  ordering = HgiShaderFunctionTessellationDescOrdering.CCW
  numVertsPerPatchIn = '3'
  numVertsPerPatchOut = '3'

  /** operator== (shaderFunctionDesc.cpp:223-232) */
  equals(rhs: HgiShaderFunctionTessellationDesc): boolean {
    return this.patchType === rhs.patchType &&
      this.spacing === rhs.spacing &&
      this.ordering === rhs.ordering &&
      this.numVertsPerPatchIn === rhs.numVertsPerPatchIn &&
      this.numVertsPerPatchOut === rhs.numVertsPerPatchOut
  }
}

/** shaderFunctionDesc.h:328-329 */
export enum HgiShaderFunctionGeometryDescInPrimitiveType {
  Points, Lines, LinesAdjacency, Triangles, TrianglesAdjacency,
}
/** shaderFunctionDesc.h:330-331 */
export enum HgiShaderFunctionGeometryDescOutPrimitiveType {
  Points, LineStrip, TriangleStrip,
}

/** shaderFunctionDesc.h:326-339 */
export class HgiShaderFunctionGeometryDesc {
  static readonly InPrimitiveType = HgiShaderFunctionGeometryDescInPrimitiveType
  static readonly OutPrimitiveType = HgiShaderFunctionGeometryDescOutPrimitiveType

  inPrimitiveType = HgiShaderFunctionGeometryDescInPrimitiveType.Triangles
  outPrimitiveType = HgiShaderFunctionGeometryDescOutPrimitiveType.TriangleStrip
  outMaxVertices = '3'

  /** operator== (shaderFunctionDesc.cpp:99-106) */
  equals(rhs: HgiShaderFunctionGeometryDesc): boolean {
    return this.inPrimitiveType === rhs.inPrimitiveType &&
      this.outPrimitiveType === rhs.outPrimitiveType &&
      this.outMaxVertices === rhs.outMaxVertices
  }
}

/** shaderFunctionDesc.h:360-367 */
export class HgiShaderFunctionFragmentDesc {
  earlyFragmentTests = false

  /** operator== (shaderFunctionDesc.cpp:120-125) */
  equals(rhs: HgiShaderFunctionFragmentDesc): boolean {
    return this.earlyFragmentTests === rhs.earlyFragmentTests
  }
}

/** Holder for the `std::string *generatedShaderCodeOut` output pointer. */
export interface HgiShaderCodeOut {
  value: string
}

/** shaderFunctionDesc.h:422-443 */
export class HgiShaderFunctionDesc {
  debugName = ''
  shaderStage: HgiShaderStage = 0
  shaderCodeDeclarations: string | null = null
  shaderCode: string | null = null
  generatedShaderCodeOut: HgiShaderCodeOut | null = null
  textures: HgiShaderFunctionTextureDesc[] = []
  buffers: HgiShaderFunctionBufferDesc[] = []
  constantParams: HgiShaderFunctionParamDesc[] = []
  stageGlobalMembers: HgiShaderFunctionParamDesc[] = []
  stageInputs: HgiShaderFunctionParamDesc[] = []
  stageOutputs: HgiShaderFunctionParamDesc[] = []
  stageInputBlocks: HgiShaderFunctionParamBlockDesc[] = []
  stageOutputBlocks: HgiShaderFunctionParamBlockDesc[] = []
  computeDescriptor = new HgiShaderFunctionComputeDesc()
  tessellationDescriptor = new HgiShaderFunctionTessellationDesc()
  geometryDescriptor = new HgiShaderFunctionGeometryDesc()
  fragmentDescriptor = new HgiShaderFunctionFragmentDesc()

  /** Copy (C++ copy construction). Vectors are copied; their elements are
   *  shared, which is safe as the backends never mutate them. */
  clone(): HgiShaderFunctionDesc {
    const c = Object.assign(new HgiShaderFunctionDesc(), this)
    c.textures = [...this.textures]
    c.buffers = [...this.buffers]
    c.constantParams = [...this.constantParams]
    c.stageGlobalMembers = [...this.stageGlobalMembers]
    c.stageInputs = [...this.stageInputs]
    c.stageOutputs = [...this.stageOutputs]
    c.stageInputBlocks = [...this.stageInputBlocks]
    c.stageOutputBlocks = [...this.stageOutputBlocks]
    return c
  }

  /** operator== (shaderFunctionDesc.cpp:241-259). The code pointers, buffers,
   *  stageGlobalMembers and the param blocks are not compared upstream. */
  equals(rhs: HgiShaderFunctionDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.shaderStage === rhs.shaderStage &&
      // Omitted. Only used tmp during shader compile
      // lhs.shaderCodeDeclarations == rhs.shaderCodeDeclarations
      // lhs.shaderCode == rhs.shaderCode
      // lhs.generatedShaderCodeOut == rhs.generatedShaderCodeOut
      _vectorEquals(this.textures, rhs.textures) &&
      _vectorEquals(this.constantParams, rhs.constantParams) &&
      _vectorEquals(this.stageInputs, rhs.stageInputs) &&
      _vectorEquals(this.stageOutputs, rhs.stageOutputs) &&
      this.computeDescriptor.equals(rhs.computeDescriptor) &&
      this.tessellationDescriptor.equals(rhs.tessellationDescriptor) &&
      this.geometryDescriptor.equals(rhs.geometryDescriptor) &&
      this.fragmentDescriptor.equals(rhs.fragmentDescriptor)
  }
}
export type HgiShaderFunctionDescVector = HgiShaderFunctionDesc[]

/** shaderFunctionDesc.cpp:268-287 (defaults: shaderFunctionDesc.h:460-467) */
export function HgiShaderFunctionAddTexture(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  bindIndex = 0,
  dimensions = 2,
  format: HgiFormat = HgiFormat.HgiFormatFloat32Vec4,
  textureType: HgiShaderTextureType = HgiShaderTextureType.HgiShaderTextureTypeTexture,
): void {
  const texDesc = new HgiShaderFunctionTextureDesc()
  texDesc.nameInShader = nameInShader
  texDesc.bindIndex = bindIndex
  texDesc.dimensions = dimensions
  texDesc.format = format
  texDesc.textureType = textureType
  texDesc.arraySize = 0
  texDesc.writable = false

  desc.textures.push(texDesc)
}

/** shaderFunctionDesc.cpp:289-309 (defaults: shaderFunctionDesc.h:471-479) */
export function HgiShaderFunctionAddArrayOfTextures(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  arraySize: number,
  bindIndex = 0,
  dimensions = 2,
  format: HgiFormat = HgiFormat.HgiFormatFloat32Vec4,
  textureType: HgiShaderTextureType = HgiShaderTextureType.HgiShaderTextureTypeTexture,
): void {
  const texDesc = new HgiShaderFunctionTextureDesc()
  texDesc.nameInShader = nameInShader
  texDesc.bindIndex = bindIndex
  texDesc.dimensions = dimensions
  texDesc.format = format
  texDesc.textureType = textureType
  texDesc.arraySize = arraySize
  texDesc.writable = false

  desc.textures.push(texDesc)
}

/** shaderFunctionDesc.cpp:311-330 (defaults: shaderFunctionDesc.h:483-490) */
export function HgiShaderFunctionAddWritableTexture(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  bindIndex = 0,
  dimensions = 2,
  format: HgiFormat = HgiFormat.HgiFormatFloat32Vec4,
  textureType: HgiShaderTextureType = HgiShaderTextureType.HgiShaderTextureTypeTexture,
): void {
  const texDesc = new HgiShaderFunctionTextureDesc()
  texDesc.nameInShader = nameInShader
  texDesc.bindIndex = bindIndex
  texDesc.dimensions = dimensions
  texDesc.format = format
  texDesc.textureType = textureType
  texDesc.arraySize = 0
  texDesc.writable = true

  desc.textures.push(texDesc)
}

/** shaderFunctionDesc.cpp:332-350 (defaults: shaderFunctionDesc.h:494-501) */
export function HgiShaderFunctionAddBuffer(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  type: string,
  bindIndex: number,
  binding: HgiBindingType,
  arraySize = 0,
): void {
  const bufDesc = new HgiShaderFunctionBufferDesc()
  bufDesc.nameInShader = nameInShader
  bufDesc.type = type
  bufDesc.binding = binding
  bufDesc.arraySize = arraySize
  bufDesc.bindIndex = bindIndex
  bufDesc.writable = false

  desc.buffers.push(bufDesc)
}

/** shaderFunctionDesc.cpp:352-367 */
export function HgiShaderFunctionAddWritableBuffer(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  type: string,
  bindIndex: number,
): void {
  const bufDesc = new HgiShaderFunctionBufferDesc()
  bufDesc.nameInShader = nameInShader
  bufDesc.type = type
  bufDesc.bindIndex = bindIndex
  bufDesc.binding = HgiBindingType.HgiBindingTypePointer
  bufDesc.writable = true

  desc.buffers.push(bufDesc)
}

/** shaderFunctionDesc.cpp:369-382 (defaults: shaderFunctionDesc.h:515-520) */
export function HgiShaderFunctionAddConstantParam(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  type: string,
  role = '',
): void {
  const paramDesc = new HgiShaderFunctionParamDesc()
  paramDesc.nameInShader = nameInShader
  paramDesc.type = type
  paramDesc.role = role

  desc.constantParams.push(paramDesc)
}

/** Both HgiShaderFunctionAddStageInput overloads:
 *  (desc, nameInShader, type, role = "") at shaderFunctionDesc.cpp:384-397 and
 *  (desc, paramDesc) at shaderFunctionDesc.cpp:399-405. */
export function HgiShaderFunctionAddStageInput(
  desc: HgiShaderFunctionDesc,
  nameInShaderOrParamDesc: string | HgiShaderFunctionParamDesc,
  type = '',
  role = '',
): void {
  if (typeof nameInShaderOrParamDesc !== 'string') {
    desc.stageInputs.push(nameInShaderOrParamDesc)
    return
  }
  const paramDesc = new HgiShaderFunctionParamDesc()
  paramDesc.nameInShader = nameInShaderOrParamDesc
  paramDesc.type = type
  paramDesc.role = role

  desc.stageInputs.push(paramDesc)
}

/** shaderFunctionDesc.cpp:407-419 */
export function HgiShaderFunctionAddGlobalVariable(
  desc: HgiShaderFunctionDesc,
  nameInShader: string,
  type: string,
  arraySize: string,
): void {
  const paramDesc = new HgiShaderFunctionParamDesc()
  paramDesc.nameInShader = nameInShader
  paramDesc.type = type
  paramDesc.arraySize = arraySize
  desc.stageGlobalMembers.push(paramDesc)
}

/** The three HgiShaderFunctionAddStageOutput overloads:
 *  (desc, name, type, role = "", arraySize = "") at
 *  shaderFunctionDesc.cpp:421-436; (desc, name, type, uint32_t location) at
 *  :438-451; (desc, paramDesc) at :453-459. A number in the fourth position
 *  selects the location overload, as C++ overload resolution does. */
export function HgiShaderFunctionAddStageOutput(
  desc: HgiShaderFunctionDesc,
  nameInShaderOrParamDesc: string | HgiShaderFunctionParamDesc,
  type = '',
  roleOrLocation: string | number = '',
  arraySize = '',
): void {
  if (typeof nameInShaderOrParamDesc !== 'string') {
    desc.stageOutputs.push(nameInShaderOrParamDesc)
    return
  }
  const paramDesc = new HgiShaderFunctionParamDesc()
  paramDesc.nameInShader = nameInShaderOrParamDesc
  paramDesc.type = type
  if (typeof roleOrLocation === 'number') {
    paramDesc.location = roleOrLocation
  } else {
    paramDesc.role = roleOrLocation
    paramDesc.arraySize = arraySize
  }

  desc.stageOutputs.push(paramDesc)
}
