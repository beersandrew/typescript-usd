// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/resourceBinder.cpp,
//  pxr/imaging/hdSt/resourceBinder.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/resourceBinder.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also commented at its site):
// - std::map<HdStBinding, T> is HdStBindingMap<T>, which iterates in
//   ascending HdStBinding order as std::map does (the order is visible in
//   generated shader text). std::map::insert keeps an existing entry.
// - The NameAndLevel binding map is a Map keyed by (level, name); it is only
//   looked up, never iterated.
// - MetaData::ComputeHash is a TfHash-based bigint, a cache key only.
// - HdStBufferArrayRange::GetResources() pairs are [name, resource] tuples.
// - PLATFORM-DIVERGENCE(hdst-gl-binding): the GL Bind*/Unbind* entry points
//   keep upstream's control flow; their OpenGL calls are no-ops (no HgiGL).
// - PLATFORM-DIVERGENCE(hdst-bindless-handles): bindless handles are 0.
// - FAITHFULNESS-DEBT(hd-instancer-builtin-names): HdInstancer's builtin
//   primvar names are inlined until hd/instancer is ported.

import {
  Token as TfToken,
  MakeTokens as TfMakeTokens,
  HashCombine as TfHashCombine,
} from 'typescript-usd/tf'
import {
  Type as HdType,
  Tokens as HdTokens,
  InstancerTokens as HdInstancerTokens,
  GetComponentCount as HdGetComponentCount,
  GetComponentType as HdGetComponentType,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSpec as HdBufferSpec,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import {
  HgiBindResourceType,
  HgiBufferBindDesc,
  HgiDeviceCapabilitiesBits,
  HgiShaderStageBits,
  HgiTextureBindDesc,
  type HgiCapabilities,
  type HgiResourceBindingsDesc,
  type HgiSamplerHandle,
  type HgiShaderStage,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdStBinding, type HdStBindingRequest, type HdStBindingType } from './binding.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import type { HdStBufferResource } from './bufferResource.ts'
import type { HdStDrawItem } from './drawItem.ts'
import { HdStTextureType } from './enums.ts'
import { HdStGLConversions } from './glConversions.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import { HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** HDST_RESOURCE_BINDING_SUFFIX_TOKENS (resourceBinder.h:42-47) */
export const HdSt_ResourceBindingSuffixTokens = TfMakeTokens({
  fallback: '_fallback',
  samplingTransform: '_samplingTransform',
  layout: '_layout',
  texture: '_texture',
  valid: '_valid',
})

/** std::map<HdStBinding, T>: keyed and iterated by HdStBinding's
 *  operator< (binding.h:99-101). */
export class HdStBindingMap<T> {
  private _map = new Map<number, [HdStBinding, T]>()

  get size(): number { return this._map.size }

  has(binding: HdStBinding): boolean {
    return this._map.has(binding.GetValue())
  }

  get(binding: HdStBinding): T | undefined {
    return this._map.get(binding.GetValue())?.[1]
  }

  /** operator[] assignment / insert-or-assign. */
  set(binding: HdStBinding, value: T): this {
    this._map.set(binding.GetValue(), [binding, value])
    return this
  }

  /** operator[]: default-constructs a missing entry. */
  getOrInsert(binding: HdStBinding, make: () => T): T {
    let e = this._map.get(binding.GetValue())
    if (!e) {
      e = [binding, make()]
      this._map.set(binding.GetValue(), e)
    }
    return e[1]
  }

  delete(binding: HdStBinding): boolean {
    return this._map.delete(binding.GetValue())
  }

  /** Entries in ascending binding order. */
  entries(): Array<[HdStBinding, T]> {
    return [...this._map.values()].sort((a, b) => a[0].GetValue() - b[0].GetValue())
  }

  [Symbol.iterator](): Iterator<[HdStBinding, T]> {
    return this.entries()[Symbol.iterator]()
  }
}

/** MetaData::StructEntry (resourceBinder.h:96-117). For a primvar in an
 *  interleaved buffer array (Constant, ShaderData). */
export class HdSt_ResourceBinderMetaDataStructEntry {
  name: TfToken
  dataType: TfToken
  offset: number
  arraySize: number
  concatenateNames: boolean

  constructor(name: TfToken, dataType: TfToken, offset: number,
    arraySize: number, concatenateNames = false) {
    this.name = name
    this.dataType = dataType
    this.offset = offset
    this.arraySize = arraySize
    this.concatenateNames = concatenateNames
  }

  /** operator< (resourceBinder.h:113-115) */
  lessThan(other: HdSt_ResourceBinderMetaDataStructEntry): boolean {
    return this.offset < other.offset
  }
}

/** MetaData::StructBlock (resourceBinder.h:118-127) */
export class HdSt_ResourceBinderMetaDataStructBlock {
  blockName: TfToken
  entries: HdSt_ResourceBinderMetaDataStructEntry[] = []
  arraySize: number
  // Uninitialized upstream; every producer assigns them.
  isWritable = false
  stageVisibility: HgiShaderStage = HgiShaderStageBits.HgiShaderStageAll as number

  constructor(name: TfToken, arraySize = 1) {
    this.blockName = name
    this.arraySize = arraySize
  }
}

/** MetaData::Primvar (resourceBinder.h:131-138) */
export class HdSt_ResourceBinderMetaDataPrimvar {
  name: TfToken
  dataType: TfToken
  constructor(name: TfToken = TfToken(), dataType: TfToken = TfToken()) {
    this.name = name
    this.dataType = dataType
  }
}

/** MetaData::FvarPrimvar (resourceBinder.h:142-149) */
export class HdSt_ResourceBinderMetaDataFvarPrimvar extends HdSt_ResourceBinderMetaDataPrimvar {
  channel: number
  constructor(name: TfToken = TfToken(), dataType: TfToken = TfToken(), channel = 0) {
    super(name, dataType)
    this.channel = channel
  }
}

/** MetaData::NestedPrimvar (resourceBinder.h:153-162) */
export class HdSt_ResourceBinderMetaDataNestedPrimvar {
  name: TfToken
  dataType: TfToken
  level: number
  constructor(name: TfToken = TfToken(), dataType: TfToken = TfToken(), level = 0) {
    this.name = name
    this.dataType = dataType
    this.level = level
  }
}

/** MetaData::ShaderParameterAccessor (resourceBinder.h:166-198) */
export class HdSt_ResourceBinderMetaDataShaderParameterAccessor {
  name: TfToken        // e.g. Kd
  dataType: TfToken    // e.g. vec4
  swizzle: string      // e.g. xyzw
  inPrimvars: TfToken[] // for primvar renaming and texture coordinates,
  isPremultiplied: boolean // indicates if texture parameter has been
                           // pre-multiplied by alpha on the CPU
  processTextureFallbackValue: boolean // use NAME_fallback from shader
                                       // bar if texture is not valid
                                       // (determineed from bool
                                       // NAME_valid or bindless
                                       // handle), only supported for
                                       // material shader and for uv
                                       // and field textures.
  arrayOfTexturesSize: number // If the shaderParameterAccessor is
                              // associated with an HdStBinding of type
                              // ARRAY_OF_TEXTURE_2D or
                              // BINDLESS_ARRAY_OF_TEXTURE_2D, this will
                              // indicate the size of the array.

  constructor(name: TfToken = TfToken(), dataType: TfToken = TfToken(),
    swizzle = '', inPrimvars: TfToken[] = [], isPremultiplied = false,
    processTextureFallbackValue = false, arrayOfTexturesSize = 0) {
    this.name = name
    this.dataType = dataType
    this.swizzle = swizzle
    this.inPrimvars = inPrimvars
    this.isPremultiplied = isPremultiplied
    this.processTextureFallbackValue = processTextureFallbackValue
    this.arrayOfTexturesSize = arrayOfTexturesSize
  }
}

/** MetaData::BindingDeclaration (resourceBinder.h:202-221). The default
 *  constructor leaves `binding` invalid. */
export class HdSt_ResourceBinderMetaDataBindingDeclaration {
  name: TfToken
  dataType: TfToken
  binding: HdStBinding
  isWritable: boolean
  stageVisibility: HgiShaderStage

  constructor(name: TfToken = TfToken(), dataType: TfToken = TfToken(),
    binding: HdStBinding = new HdStBinding(), isWritable = false,
    stageVisibility: HgiShaderStage = HgiShaderStageBits.HgiShaderStageAll as number) {
    this.name = name
    this.dataType = dataType
    this.binding = binding
    this.isWritable = isWritable
    this.stageVisibility = stageVisibility
  }
}

/** MetaData::DrawingCoordBufferBinding (resourceBinder.h:225-240) */
export class HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding {
  bufferName: TfToken
  offset: number
  stride: number
  constructor(bufferName: TfToken = TfToken(), offset = 0, stride = 0) {
    this.bufferName = bufferName
    this.offset = offset
    this.stride = stride
  }
}

/** HdSt_ResourceBinder::MetaData (resourceBinder.h:82-273). Binding
 *  metadata for codegen. */
export class HdSt_ResourceBinderMetaData {
  static readonly StructEntry = HdSt_ResourceBinderMetaDataStructEntry
  static readonly StructBlock = HdSt_ResourceBinderMetaDataStructBlock
  static readonly Primvar = HdSt_ResourceBinderMetaDataPrimvar
  static readonly FvarPrimvar = HdSt_ResourceBinderMetaDataFvarPrimvar
  static readonly NestedPrimvar = HdSt_ResourceBinderMetaDataNestedPrimvar
  static readonly ShaderParameterAccessor = HdSt_ResourceBinderMetaDataShaderParameterAccessor
  static readonly BindingDeclaration = HdSt_ResourceBinderMetaDataBindingDeclaration
  static readonly DrawingCoordBufferBinding = HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding

  drawingCoordBufferBinding = new HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding()

  constantData = new HdStBindingMap<HdSt_ResourceBinderMetaDataStructBlock>()
  shaderData = new HdStBindingMap<HdSt_ResourceBinderMetaDataStructBlock>()
  topologyVisibilityData = new HdStBindingMap<HdSt_ResourceBinderMetaDataStructBlock>()
  elementData = new HdStBindingMap<HdSt_ResourceBinderMetaDataPrimvar>()
  vertexData = new HdStBindingMap<HdSt_ResourceBinderMetaDataPrimvar>()
  varyingData = new HdStBindingMap<HdSt_ResourceBinderMetaDataPrimvar>()
  fvarData = new HdStBindingMap<HdSt_ResourceBinderMetaDataFvarPrimvar>()
  computeReadWriteData = new HdStBindingMap<HdSt_ResourceBinderMetaDataPrimvar>()
  computeReadOnlyData = new HdStBindingMap<HdSt_ResourceBinderMetaDataPrimvar>()
  instanceData = new HdStBindingMap<HdSt_ResourceBinderMetaDataNestedPrimvar>()
  instancerNumLevels = 0
  shaderParameterBinding = new HdStBindingMap<HdSt_ResourceBinderMetaDataShaderParameterAccessor>()
  drawingCoord0Binding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  drawingCoord1Binding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  drawingCoord2Binding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  drawingCoordIBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  instanceIndexArrayBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  culledInstanceIndexArrayBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  instanceIndexBaseBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  primitiveParamBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  tessFactorsBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  edgeIndexBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  coarseFaceIndexBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  indexBufferBinding = new HdSt_ResourceBinderMetaDataBindingDeclaration()
  fvarPatchParamBindings: HdSt_ResourceBinderMetaDataBindingDeclaration[] = []
  fvarIndicesBindings: HdSt_ResourceBinderMetaDataBindingDeclaration[] = []

  customInterleavedBindings = new HdStBindingMap<HdSt_ResourceBinderMetaDataStructBlock>()
  customBindings: HdSt_ResourceBinderMetaDataBindingDeclaration[] = []

  /** resourceBinder.cpp:1712-1886. Returns the hash value of this metadata.
   *  A cache key only (TfHash). */
  computeHash(): bigint {
    let hash = 0n
    hash = TfHashCombine(
      hash,
      this.drawingCoordBufferBinding.offset,
      this.drawingCoordBufferBinding.stride,
      this.drawingCoord0Binding.binding.GetValue(),
      this.drawingCoord0Binding.dataType,
      this.drawingCoord1Binding.binding.GetValue(),
      this.drawingCoord1Binding.dataType,
      this.drawingCoord2Binding.binding.GetValue(),
      this.drawingCoord2Binding.dataType,
      this.drawingCoordIBinding.binding.GetValue(),
      this.drawingCoordIBinding.dataType,
      this.instanceIndexArrayBinding.binding.GetValue(),
      this.instanceIndexArrayBinding.dataType,
      this.instanceIndexBaseBinding.binding.GetValue(),
      this.instanceIndexBaseBinding.dataType,
      this.primitiveParamBinding.binding.GetValue(),
      this.primitiveParamBinding.dataType,
      this.tessFactorsBinding.binding.GetValue(),
      this.edgeIndexBinding.binding.GetValue(),
      this.edgeIndexBinding.dataType,
      this.coarseFaceIndexBinding.binding.GetValue(),
      this.coarseFaceIndexBinding.dataType,
    )

    for (const binDecl of this.fvarIndicesBindings) {
      hash = TfHashCombine(hash, binDecl.binding.GetValue(), binDecl.dataType)
    }
    for (const binDecl of this.fvarPatchParamBindings) {
      hash = TfHashCombine(hash, binDecl.binding.GetValue(), binDecl.dataType)
    }

    // separators are inserted to distinguish primvars have a same layout
    // but different interpolation.
    hash = TfHashCombine(hash, 0) // separator
    for (const binDecl of this.customBindings) {
      hash = TfHashCombine(
        hash,
        binDecl.name,
        binDecl.dataType,
        binDecl.binding.getType(),
        binDecl.binding.getLocation(),
      )
    }

    const hashBlocks = (blocks: HdStBindingMap<HdSt_ResourceBinderMetaDataStructBlock>): void => {
      for (const [binding, block] of blocks) {
        hash = TfHashCombine(hash, binding.getType()) // binding
        for (const entry of block.entries) {
          hash = TfHashCombine(
            hash,
            entry.name,
            entry.dataType,
            entry.offset,
            entry.arraySize,
          )
        }
      }
    }

    hash = TfHashCombine(hash, 0) // separator
    hashBlocks(this.customInterleavedBindings)

    hash = TfHashCombine(hash, 0) // separator
    hashBlocks(this.constantData)

    hash = TfHashCombine(hash, 0) // separator
    hashBlocks(this.topologyVisibilityData)

    hash = TfHashCombine(hash, 0) // separator
    for (const [binding, primvar] of this.instanceData) {
      hash = TfHashCombine(hash, binding.getType()) // binding
      hash = TfHashCombine(
        hash,
        primvar.name,
        primvar.dataType,
        primvar.level,
      )
    }

    const hashPrimvars = (pvs: HdStBindingMap<HdSt_ResourceBinderMetaDataPrimvar>): void => {
      for (const [binding, primvar] of pvs) {
        hash = TfHashCombine(hash, binding.getType()) // binding
        hash = TfHashCombine(
          hash,
          primvar.name,
          primvar.dataType,
        )
      }
    }

    hash = TfHashCombine(hash, 0) // separator
    hashPrimvars(this.vertexData)

    hash = TfHashCombine(hash, 0) // separator
    hashPrimvars(this.varyingData)

    hash = TfHashCombine(hash, 0) // separator
    hashPrimvars(this.elementData)

    hash = TfHashCombine(hash, 0) // separator
    for (const [binding, primvar] of this.fvarData) {
      hash = TfHashCombine(hash, binding.getType()) // binding
      hash = TfHashCombine(
        hash,
        primvar.name,
        primvar.dataType,
        primvar.channel,
      )
    }

    hash = TfHashCombine(hash, 0) // separator
    hashBlocks(this.shaderData)

    hash = TfHashCombine(hash, 0) // separator
    for (const [binding, entry] of this.shaderParameterBinding) {
      hash = TfHashCombine(hash, binding.getType()) // binding
      hash = TfHashCombine(
        hash,
        entry.name,
        entry.dataType,
        entry.swizzle,
      )
    }

    return hash
  }
}

// ---------------------------------------------------------------------------
// HdSt_ResourceBinder (resourceBinder.h:276-575, resourceBinder.cpp)
// ---------------------------------------------------------------------------

/** TF_DEFINE_PRIVATE_TOKENS (resourceBinder.cpp:41-58) */
const _tokens = TfMakeTokens({
  _double: 'double',
  _float: 'float',
  _int: 'int',
  vec2: 'vec2',
  vec3: 'vec3',
  vec4: 'vec4',
  dvec2: 'dvec2',
  dvec3: 'dvec3',
  dvec4: 'dvec4',
  ivec2: 'ivec2',
  ivec3: 'ivec3',
  ivec4: 'ivec4',
  constantPrimvars: 'constantPrimvars',
  primitiveParam: 'primitiveParam',
  topologyVisibility: 'topologyVisibility',
})

/** BindingLocator (resourceBinder.cpp:61-104) */
class BindingLocator {
  uniformLocation = 0
  bufferLocation = 0
  attribLocation = 0
  textureUnit = 0

  getBinding(type: HdStBindingType, debugName: TfToken): HdStBinding {
    switch (type) {
      case HdStBinding.UNIFORM:
        return new HdStBinding(HdStBinding.UNIFORM, this.uniformLocation++)
      case HdStBinding.UBO:
        return new HdStBinding(HdStBinding.UBO, this.bufferLocation++)
      case HdStBinding.SSBO:
        return new HdStBinding(HdStBinding.SSBO, this.bufferLocation++)
      case HdStBinding.BINDLESS_SSBO_RANGE:
        return new HdStBinding(HdStBinding.BINDLESS_SSBO_RANGE, this.uniformLocation++)
      case HdStBinding.BINDLESS_UNIFORM:
        return new HdStBinding(HdStBinding.BINDLESS_UNIFORM, this.uniformLocation++)
      case HdStBinding.VERTEX_ATTR:
        return new HdStBinding(HdStBinding.VERTEX_ATTR, this.attribLocation++)
      case HdStBinding.DRAW_INDEX:
        return new HdStBinding(HdStBinding.DRAW_INDEX, this.attribLocation++)
      case HdStBinding.DRAW_INDEX_INSTANCE:
        return new HdStBinding(HdStBinding.DRAW_INDEX_INSTANCE, this.attribLocation++)
      default:
        TF_CODING_ERROR(`Unknown binding type ${type} for ${debugName}`)
        return new HdStBinding()
    }
  }
}

/** resourceBinder.cpp:106-109 */
function _ShouldBeNormalized(type: HdType): boolean {
  return type === HdType.HdTypeInt32_2_10_10_10_REV
}

/** resourceBinder.cpp:111-119. GL has special handling for the "number of
 *  components" for packed vectors. Handle that here. */
function _GetNumComponents(type: HdType): number {
  if (type === HdType.HdTypeInt32_2_10_10_10_REV) {
    return 4
  } else {
    return HdGetComponentCount(type)
  }
}

/** resourceBinder.cpp:121-135. Modify datatype if swizzle is specified */
function _AdjustHdType(type: HdType, swizzle: string): HdType {
  const numChannels = swizzle.length
  if (numChannels === 4) {
    return HdType.HdTypeFloatVec4
  } else if (numChannels === 3) {
    return HdType.HdTypeFloatVec3
  } else if (numChannels === 2) {
    return HdType.HdTypeFloatVec2
  } else if (numChannels === 1) {
    return HdType.HdTypeFloat
  }

  return type
}

/** resourceBinder.cpp:142-149 */
function _ConcatLayout(token: TfToken): TfToken {
  return TfToken(token + HdSt_ResourceBindingSuffixTokens.layout)
}

// FAITHFULNESS-DEBT(hd-instancer-builtin-names): HdInstancer
// (pxr/imaging/hd/instancer.{h,cpp}) is not ported; this is
// HdInstancer::GetBuiltinPrimvarNames (hd/instancer.cpp:47-57) verbatim.
// Replace with HdInstancer.GetBuiltinPrimvarNames() when hd/instancer is
// ported.
function _HdInstancerGetBuiltinPrimvarNames(): TfToken[] {
  return [
    HdInstancerTokens.instanceTransforms,
    HdInstancerTokens.instanceRotations,
    HdInstancerTokens.instanceScales,
    HdInstancerTokens.instanceTranslations,
  ]
}

/** resourceBinder.cpp:151-165 */
function _GetInstancerFilterNames(drawItem: HdStDrawItem): TfToken[] {
  const filterNames = _HdInstancerGetBuiltinPrimvarNames()

  const materialNetworkShader = drawItem.getMaterialNetworkShader()
  if (materialNetworkShader) {
    const names = materialNetworkShader.getPrimvarNames()
    filterNames.push(...names)
  }

  return filterNames
}

/** resourceBinder.cpp:167-172 */
function _TokenContainsString(token: TfToken, string: string): boolean {
  return token.includes(string)
}

/** static_pointer_cast<HdStBufferArrayRange> */
function _AsStBar(bar: HdBufferArrayRange | null): HdStBufferArrayRange | null {
  return bar as unknown as HdStBufferArrayRange | null
}

/** HdStBufferArrayRange::GetResources() with the names as TfTokens
 *  (bufferResource.h: HdStBufferResourceNamedList). */
function _GetResources(bar: HdStBufferArrayRange): Array<[TfToken, HdStBufferResource]> {
  return bar.getResources().map(([name, res]) => [TfToken(name), res])
}

/** sort by StructEntry::operator< (resourceBinder.h:113-115) */
function _SortEntries(entries: HdSt_ResourceBinderMetaDataStructEntry[]): void {
  entries.sort((a, b) => a.offset - b.offset)
}

/** resourceBinder.cpp:1926-1942 */
function _IsBindless(binding: HdStBinding): boolean {
  switch (binding.getType()) {
    case HdStBinding.BINDLESS_TEXTURE_2D:
    case HdStBinding.BINDLESS_ARRAY_OF_TEXTURE_2D:
    case HdStBinding.BINDLESS_TEXTURE_FIELD:
    case HdStBinding.BINDLESS_TEXTURE_UDIM_ARRAY:
    case HdStBinding.BINDLESS_TEXTURE_UDIM_LAYOUT:
    case HdStBinding.BINDLESS_TEXTURE_PTEX_TEXEL:
    case HdStBinding.BINDLESS_TEXTURE_PTEX_LAYOUT:
      return true
    default:
      return false
  }
}

/** resourceBinder.cpp:1944-1953.
 *  PLATFORM-DIVERGENCE(hdst-gl-binding): glBindTextureUnit/glBindSampler have
 *  no counterpart without HgiGL; a no-op. */
function _BindGLTextureAndSampler(_textureUnit: number, _textureId: number,
  _samplerId: number): void {
}

/** NameAndLevel (resourceBinder.h:556-569) as a Map key. The map is only
 *  looked up, never iterated, so its std::map ordering is not observable. */
function _NameAndLevelKey(name: TfToken, level = -1): string {
  return `${level}\u0000${name}`
}

/** resourceBinder.h:276-575. Assigns binding locations to the buffers and
 *  shader resources of a draw item and produces the metadata codegen
 *  consumes. */
export class HdSt_ResourceBinder {
  static readonly MetaData = HdSt_ResourceBinderMetaData

  private _bindingMap = new Map<string, HdStBinding>()

  /** resourceBinder.cpp:138-140 */
  constructor() {
  }

  private _setBinding(name: TfToken, binding: HdStBinding, level = -1): void {
    this._bindingMap.set(_NameAndLevelKey(name, level), binding)
  }

  /** resourceBinder.cpp:174-990. Assign all binding points used in drawitem
   *  and custom bindings. Returns metadata to be used for codegen. */
  resolveBindings(
    drawItem: HdStDrawItem,
    shaders: readonly HdStShaderCode[],
    metaDataOut: HdSt_ResourceBinderMetaData,
    dcBinding: HdSt_ResourceBinderMetaDataDrawingCoordBufferBinding,
    instanceDraw: boolean,
    customBindings: readonly HdStBindingRequest[],
    capabilities: HgiCapabilities | null,
  ): void {
    if (!TF_VERIFY(metaDataOut)) return

    const bindlessBuffersEnabled =
      capabilities!.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessBuffers)
    const bindlessTexturesEnabled =
      capabilities!.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessTextures)
    const isMetal =
      capabilities!.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation)

    let arrayBufferBindingType: HdStBindingType = HdStBinding.SSBO
    if (bindlessBuffersEnabled) {
      arrayBufferBindingType = HdStBinding.BINDLESS_UNIFORM
    }

    let structBufferBindingType: HdStBindingType = HdStBinding.UBO
    if (bindlessBuffersEnabled) {
      structBufferBindingType = HdStBinding.BINDLESS_UNIFORM
    } else {
      structBufferBindingType = HdStBinding.SSBO
    }

    metaDataOut.drawingCoordBufferBinding = dcBinding

    const drawingCoordBindingType: HdStBindingType =
      instanceDraw
        ? HdStBinding.DRAW_INDEX_INSTANCE
        : HdStBinding.DRAW_INDEX

    // binding assignments
    const locator = new BindingLocator()

    let bindlessTextureLocation = 0
    // Note that these locations are used for hash keys only and
    // are never used for actual resource binding.
    let shaderFallbackLocation = 0
    let shaderPrimvarRedirectLocation = 0
    let shaderFieldRedirectLocation = 0
    let shaderTransform2dLocation = 0

    // clear all
    this._bindingMap.clear()

    // constant primvar (per-object)
    const constantPrimvarBinding =
      locator.getBinding(structBufferBindingType,
        _tokens.constantPrimvars)

    const constantBar = _AsStBar(drawItem.getConstantPrimvarRange())
    if (constantBar) {
      const sblock = new HdSt_ResourceBinderMetaDataStructBlock(_tokens.constantPrimvars)
      for (const it of _GetResources(constantBar)) {
        const valueType = it[1].getTupleType()
        const glType = HdStGLConversions.getGLSLTypename(valueType.type)
        const glName = HdStGLConversions.getGLSLIdentifier(it[0])
        sblock.entries.push(new HdSt_ResourceBinderMetaDataStructEntry(
          /*name=*/glName,
          /*type=*/glType,
          /*offset=*/it[1].getOffset(),
          /*arraySize=*/valueType.count))
      }
      // sort by offset
      // XXX: not robust enough, should consider padding and layouting rules
      // to match with the logic in HdInterleavedMemoryManager if we
      // want to use a layouting policy other than default padding.
      _SortEntries(sblock.entries)

      // std::map::insert does not overwrite an existing key.
      if (!metaDataOut.constantData.has(constantPrimvarBinding)) {
        metaDataOut.constantData.set(constantPrimvarBinding, sblock)
      }
    }

    // constant primvars are interleaved into single struct.
    this._setBinding(_tokens.constantPrimvars, constantPrimvarBinding)

    const filterNames = _GetInstancerFilterNames(drawItem)

    // instance primvar (per-instance)
    const instancerNumLevels = drawItem.getInstancePrimvarNumLevels()
    metaDataOut.instancerNumLevels = instancerNumLevels
    for (let i = 0; i < instancerNumLevels; ++i) {
      const instanceBar = _AsStBar(drawItem.getInstancePrimvarRange(i))
      if (instanceBar) {
        for (const it of _GetResources(instanceBar)) {
          const name = it[0]
          // skip instance primvars that are not used in this batch.
          if (!filterNames.includes(name)) {
            continue
          }

          const glName = HdStGLConversions.getGLSLIdentifier(name)
          // non-interleaved, always create new binding.
          const instancePrimvarBinding =
            locator.getBinding(arrayBufferBindingType, name)
          this._setBinding(name, instancePrimvarBinding, i)

          const valueType = it[1].getTupleType()
          const glType =
            HdStGLConversions.getGLSLTypename(valueType.type)
          metaDataOut.instanceData.set(instancePrimvarBinding,
            new HdSt_ResourceBinderMetaDataNestedPrimvar(
              /*name=*/glName,
              /*type=*/glType,
              /*level=*/i))
        }
      }
    }

    // vertex primvar (per-vertex)
    // always assigned to VertexAttribute.
    const vertexBar = _AsStBar(drawItem.getVertexPrimvarRange())
    if (vertexBar) {
      for (const it of _GetResources(vertexBar)) {
        const name = it[0]
        const glName = HdStGLConversions.getGLSLIdentifier(name)
        const vertexPrimvarBinding =
          locator.getBinding(HdStBinding.VERTEX_ATTR, name)
        this._setBinding(name, vertexPrimvarBinding)

        const valueType = { ...it[1].getTupleType() }
        // Special case: VBOs have intrinsic support for packed types,
        // so expand them out to their target type for the shader binding.
        if (valueType.type === HdType.HdTypeInt32_2_10_10_10_REV) {
          valueType.type = HdType.HdTypeFloatVec4
        } else if (valueType.type === HdType.HdTypeHalfFloatVec2) {
          valueType.type = HdType.HdTypeFloatVec2
        } else if (valueType.type === HdType.HdTypeHalfFloatVec4) {
          valueType.type = HdType.HdTypeFloatVec4
        }
        const glType = HdStGLConversions.getGLSLTypename(valueType.type)
        metaDataOut.vertexData.set(vertexPrimvarBinding,
          new HdSt_ResourceBinderMetaDataPrimvar(/*name=*/glName,
            /*type=*/glType))
      }
    }

    // varying primvar
    const varyingBar = _AsStBar(drawItem.getVaryingPrimvarRange())
    if (varyingBar) {
      for (const resource of _GetResources(varyingBar)) {
        const name = resource[0]
        const glName = HdStGLConversions.getGLSLIdentifier(name)
        const varyingPrimvarBinding =
          locator.getBinding(arrayBufferBindingType, name)
        this._setBinding(name, varyingPrimvarBinding)

        const valueType = resource[1].getTupleType()
        const glType = HdStGLConversions.getGLSLTypename(valueType.type)
        metaDataOut.varyingData.set(varyingPrimvarBinding,
          new HdSt_ResourceBinderMetaDataPrimvar(/*name=*/glName,
            /*type=*/glType))
      }
    }

    // index buffer
    const topologyBar = _AsStBar(drawItem.getTopologyRange())
    if (topologyBar) {
      for (const it of _GetResources(topologyBar)) {
        // Don't need to sanitize the name, since topology resources are
        // created internally.
        const name = it[0]
        const resource = it[1]

        if (name === HdTokens.indices) {
          if (isMetal && drawItem.getVaryingPrimvarRange()) {
            // Bind index buffer as an SSBO so that we can
            // access varying data by index.
            const binding =
              locator.getBinding(HdStBinding.SSBO, name)
            this._setBinding(name, binding)

            const componentType =
              HdGetComponentType(resource.getTupleType().type)
            const glType =
              HdStGLConversions.getGLSLTypename(componentType)

            const bindingDecl = new HdSt_ResourceBinderMetaDataBindingDeclaration(
              /*name=*/name,
              /*type=*/glType,
              /*binding=*/binding)
            metaDataOut.indexBufferBinding = bindingDecl
          } else {
            // Bind index buffer as IBO, no need for codeGen.
            this._setBinding(name, new HdStBinding(HdStBinding.INDEX_ATTR, 0))
          }
        } else {
          // We expect the following additional topology based info:
          // - primitive parameter (for all tris, quads and patches)
          // - edge indices (for all tris, quads and patches)
          // - fvar indices (for refined tris, quads, and patches with
          //   face-varying primvars)
          // - fvar patch params (for refined tris, quads, and patches
          //   with face-varying primvars)

          const binding =
            locator.getBinding(arrayBufferBindingType, name)
          this._setBinding(name, binding)

          const valueType = resource.getTupleType()
          const glType =
            HdStGLConversions.getGLSLTypename(valueType.type)

          const bindingDecl = new HdSt_ResourceBinderMetaDataBindingDeclaration(
            /*name=*/name,
            /*type=*/glType,
            /*binding=*/binding)

          if (name === HdTokens.primitiveParam) {
            metaDataOut.primitiveParamBinding = bindingDecl
          } else if (name === HdTokens.edgeIndices) {
            metaDataOut.edgeIndexBinding = bindingDecl
          } else if (name === HdStTokens.coarseFaceIndex) {
            metaDataOut.coarseFaceIndexBinding = bindingDecl
          } else if (_TokenContainsString(name,
            HdStTokens.fvarIndices)) {
            metaDataOut.fvarIndicesBindings.push(bindingDecl)
          } else if (_TokenContainsString(name,
            HdStTokens.fvarPatchParam)) {
            metaDataOut.fvarPatchParamBindings.push(bindingDecl)
          } else {
            TF_WARN(`Unexpected topological resource '${name}'\n`)
          }
        }
      }
    }

    // tessFactors buffer for Metal tessellation
    if (isMetal) {
      const name = HdTokens.tessFactors
      const binding =
        locator.getBinding(arrayBufferBindingType, name)
      this._setBinding(name, binding)

      const valueType: HdTupleType = { type: HdType.HdTypeFloat, count: 1 }
      const glType =
        HdStGLConversions.getGLSLTypename(valueType.type)

      const bindingDecl = new HdSt_ResourceBinderMetaDataBindingDeclaration(
        /*name=*/name,
        /*type=*/glType,
        /*binding=*/binding)
      metaDataOut.tessFactorsBinding = bindingDecl
    }

    const topVisBar = _AsStBar(drawItem.getTopologyVisibilityRange())
    if (topVisBar) {
      // topology visibility
      const topologyVisibilityBinding =
        locator.getBinding(structBufferBindingType,
          /*debugName*/_tokens.topologyVisibility)

      // topology visibility is interleaved into single struct.
      this._setBinding(_tokens.topologyVisibility, topologyVisibilityBinding)

      const sblock = new HdSt_ResourceBinderMetaDataStructBlock(_tokens.topologyVisibility)
      for (const it of _GetResources(topVisBar)) {
        const valueType = it[1].getTupleType()
        const glType = HdStGLConversions.getGLSLTypename(valueType.type)
        sblock.entries.push(new HdSt_ResourceBinderMetaDataStructEntry(
          /*name=*/it[0],
          /*type=*/glType,
          /*offset=*/it[1].getOffset(),
          /*arraySize=*/valueType.count))
      }

      _SortEntries(sblock.entries)

      if (!metaDataOut.topologyVisibilityData.has(topologyVisibilityBinding)) {
        metaDataOut.topologyVisibilityData.set(topologyVisibilityBinding, sblock)
      }
    }

    // element primvar (per-face, per-line)
    const elementBar = _AsStBar(drawItem.getElementPrimvarRange())
    if (elementBar) {
      for (const it of _GetResources(elementBar)) {
        const name = it[0]
        const glName = HdStGLConversions.getGLSLIdentifier(name)
        const elementPrimvarBinding =
          locator.getBinding(arrayBufferBindingType, name)
        this._setBinding(name, elementPrimvarBinding)
        const valueType = it[1].getTupleType()
        const glType =
          HdStGLConversions.getGLSLTypename(valueType.type)
        metaDataOut.elementData.set(elementPrimvarBinding,
          new HdSt_ResourceBinderMetaDataPrimvar(/*name=*/glName,
            /*type=*/glType))
      }
    }

    // facevarying primvar (per-face-vertex)
    const fvarBar = _AsStBar(drawItem.getFaceVaryingPrimvarRange())
    if (fvarBar) {
      const fvarTopoToPvMap = drawItem.getFvarTopologyToPrimvarVector()

      for (const it of _GetResources(fvarBar)) {
        const name = it[0]
        const glName = HdStGLConversions.getGLSLIdentifier(name)

        const fvarPrimvarBinding =
          locator.getBinding(arrayBufferBindingType, name)
        this._setBinding(name, fvarPrimvarBinding)
        const valueType = it[1].getTupleType()
        const glType = HdStGLConversions.getGLSLTypename(valueType.type)

        // Fine if no channel is found, might be unrefined primvar
        let fvarChannel = 0
        for (let i = 0; i < fvarTopoToPvMap.length; ++i) {
          if (fvarTopoToPvMap[i]![1].includes(name)) {
            fvarChannel = i
          }
        }

        metaDataOut.fvarData.set(fvarPrimvarBinding,
          new HdSt_ResourceBinderMetaDataFvarPrimvar(/*name=*/glName,
            /*type=*/glType,
            /*channel=*/fvarChannel))
      }
    }

    // draw parameter
    // assigned to draw index (vertex attributeI w/divisor) (indirect)
    // assigned to uniform          (immediate)
    //
    // note that instanceDraw may be true even for non-instance drawing,
    // because there's only instanced version of glMultiDrawElementsIndirect.
    const drawingCoord0Binding = locator.getBinding(
      drawingCoordBindingType, HdTokens.drawingCoord0)
    this._setBinding(HdTokens.drawingCoord0, drawingCoord0Binding)
    metaDataOut.drawingCoord0Binding =
      new HdSt_ResourceBinderMetaDataBindingDeclaration(/*name=*/HdTokens.drawingCoord0,
        /*type=*/_tokens.ivec4,
        /*binding=*/drawingCoord0Binding)

    const drawingCoord1Binding = locator.getBinding(
      drawingCoordBindingType, HdTokens.drawingCoord1)
    this._setBinding(HdTokens.drawingCoord1, drawingCoord1Binding)
    metaDataOut.drawingCoord1Binding =
      new HdSt_ResourceBinderMetaDataBindingDeclaration(/*name=*/HdTokens.drawingCoord1,
        /*type=*/_tokens.ivec4,
        /*binding=*/drawingCoord1Binding)

    const drawingCoord2Binding = locator.getBinding(
      drawingCoordBindingType, HdTokens.drawingCoord2)
    this._setBinding(HdTokens.drawingCoord2, drawingCoord2Binding)
    metaDataOut.drawingCoord2Binding =
      new HdSt_ResourceBinderMetaDataBindingDeclaration(/*name=*/HdTokens.drawingCoord2,
        /*type=*/_tokens.ivec2,
        /*binding=*/drawingCoord2Binding)

    if (instancerNumLevels > 0) {
      const drawingCoordIBinding =
        new HdStBinding(HdStBinding.DRAW_INDEX_INSTANCE_ARRAY,
          locator.attribLocation)

      // each vertex attribute takes 1 location
      locator.attribLocation += instancerNumLevels

      this._setBinding(HdTokens.drawingCoordI, drawingCoordIBinding)
      metaDataOut.drawingCoordIBinding =
        new HdSt_ResourceBinderMetaDataBindingDeclaration(/*name=*/HdTokens.drawingCoordI,
          /*type=*/_tokens._int,
          /*binding=*/drawingCoordIBinding)
    }

    // instance index indirection buffer
    const instanceIndexBar = _AsStBar(drawItem.getInstanceIndexRange())
    if (instanceIndexBar) {
      const instanceIndices
        = instanceIndexBar.getResource(
          HdInstancerTokens.instanceIndices)
      const culledInstanceIndices
        = instanceIndexBar.getResource(
          HdInstancerTokens.culledInstanceIndices)

      const instanceInputStages: HgiShaderStage =
        HgiShaderStageBits.HgiShaderStageVertex |
        HgiShaderStageBits.HgiShaderStageCompute |
        HgiShaderStageBits.HgiShaderStagePostTessellationControl |
        HgiShaderStageBits.HgiShaderStagePostTessellationVertex

      if (instanceIndices) {
        const instanceIndexArrayBinding =
          locator.getBinding(arrayBufferBindingType,
            HdInstancerTokens.instanceIndices)
        this._setBinding(HdInstancerTokens.instanceIndices,
          instanceIndexArrayBinding)
        const valueType = instanceIndices.getTupleType()
        const glType =
          HdStGLConversions.getGLSLTypename(valueType.type)
        metaDataOut.instanceIndexArrayBinding =
          new HdSt_ResourceBinderMetaDataBindingDeclaration(
            /*name=*/HdInstancerTokens.instanceIndices,
            /*type=*/glType,
            /*binding=*/instanceIndexArrayBinding,
            /*isWritable=*/false,
            /*stageVisibility=*/instanceInputStages)
      }
      if (culledInstanceIndices) {
        const culledInstanceIndexArrayBinding =
          locator.getBinding(arrayBufferBindingType,
            HdInstancerTokens.culledInstanceIndices)
        this._setBinding(HdInstancerTokens.culledInstanceIndices,
          culledInstanceIndexArrayBinding)
        // Upstream reads the type from instanceIndices here
        // (resourceBinder.cpp:618), not culledInstanceIndices.
        const valueType = instanceIndices!.getTupleType()
        const glType =
          HdStGLConversions.getGLSLTypename(valueType.type)
        metaDataOut.culledInstanceIndexArrayBinding =
          new HdSt_ResourceBinderMetaDataBindingDeclaration(
            /*name=*/HdInstancerTokens.culledInstanceIndices,
            /*type=*/glType,
            /*binding=*/culledInstanceIndexArrayBinding,
            /*isWritable=*/true,
            /*stageVisibility=*/instanceInputStages)
      }
    }

    const dispatchBinding = new HdStBinding(
      HdStBinding.DISPATCH, /*location=(not used)*/0)
    this._setBinding(HdTokens.drawDispatch, dispatchBinding)

    // shader parameter bindings
    for (const shader of shaders) {

      // uniform block
      const shaderBar = _AsStBar(shader.getShaderData())
      if (shaderBar) {
        const shaderParamBinding =
          locator.getBinding(structBufferBindingType,
            HdTokens.materialParams)

        // for fallback values and bindless textures
        // XXX: name of sblock must be unique for each shaders.
        const sblock = new HdSt_ResourceBinderMetaDataStructBlock(HdTokens.materialParams)
        for (const it of _GetResources(shaderBar)) {
          const name = it[0]
          const glName = HdStGLConversions.getGLSLIdentifier(name)
          const valueType = it[1].getTupleType()
          const glType =
            HdStGLConversions.getGLSLTypename(valueType.type)
          sblock.entries.push(new HdSt_ResourceBinderMetaDataStructEntry(
            /*name=*/glName,
            /*type=*/glType,
            /*offset=*/it[1].getOffset(),
            /*arraySize=*/valueType.count))
        }
        // sort by offset
        _SortEntries(sblock.entries)
        if (!metaDataOut.shaderData.has(shaderParamBinding)) {
          metaDataOut.shaderData.set(shaderParamBinding, sblock)
        }

        //XXX:hack  we want to generalize materialParams to other shaders.
        if (shader === drawItem.getMaterialNetworkShader()) {
          // shader parameters are interleaved into single struct.
          this._setBinding(HdTokens.materialParams, shaderParamBinding)
        }
      }

      const params = shader.getParams()
      // for primvar and texture accessors
      for (const param of params) {
        const isMaterialShader =
          (shader === drawItem.getMaterialNetworkShader())

        // renderpass texture should be bindfull (for now)
        const bindless = bindlessTexturesEnabled && isMaterialShader
        const glSwizzle = param.swizzle
        const valueType = param.getTupleType()
        const glType =
          HdStGLConversions.getGLSLTypename(_AdjustHdType(valueType.type,
            glSwizzle))
        const name = param.name
        const glName = HdStGLConversions.getGLSLIdentifier(name)

        if (param.isFallback()) {
          metaDataOut.shaderParameterBinding.set(
            new HdStBinding(HdStBinding.FALLBACK,
              shaderFallbackLocation++),
            new HdSt_ResourceBinderMetaDataShaderParameterAccessor(glName,
              /*type=*/glType))
        } else if (param.isTexture()) {
          if (param.textureType === HdStTextureType.Ptex) {
            // ptex texture
            const texelBinding = bindless
              ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_PTEX_TEXEL,
                bindlessTextureLocation++)
              : new HdStBinding(HdStBinding.TEXTURE_PTEX_TEXEL,
                locator.uniformLocation++,
                locator.textureUnit++)

            metaDataOut.shaderParameterBinding.set(texelBinding,
              new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                /*name=*/glName,
                /*type=*/glType,
                /*swizzle=*/glSwizzle,
                /*inPrimvars=*/param.samplerCoords,
                /*isPremultiplied=*/param.isPremultiplied,
                /*processTextureFallbackValue=*/isMaterialShader))
            this._setBinding(name, texelBinding) // used for non-bindless

            const layoutBinding = bindless
              ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_PTEX_LAYOUT,
                bindlessTextureLocation++)
              : new HdStBinding(HdStBinding.TEXTURE_PTEX_LAYOUT,
                locator.uniformLocation++,
                locator.textureUnit++)

            const glLayoutName = _ConcatLayout(glName)
            metaDataOut.shaderParameterBinding.set(layoutBinding,
              new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                /*name=*/glLayoutName,
                /*type=*/HdStGLConversions.getGLSLTypename(
                  HdType.HdTypeInt32)))

            // Layout for Ptex
            const layoutName = _ConcatLayout(name)
            // used for non-bindless
            this._setBinding(layoutName, layoutBinding)
          } else if (param.textureType === HdStTextureType.Udim) {
            // Texture Array for UDIM
            const textureBinding = bindless
              ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_UDIM_ARRAY,
                bindlessTextureLocation++)
              : new HdStBinding(HdStBinding.TEXTURE_UDIM_ARRAY,
                locator.uniformLocation++,
                locator.textureUnit++)

            metaDataOut.shaderParameterBinding.set(textureBinding,
              new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                /*name=*/param.name,
                /*type=*/glType,
                /*swizzle=*/glSwizzle,
                /*inPrimvars=*/param.samplerCoords,
                /*isPremultiplied=*/param.isPremultiplied,
                /*processTextureFallbackValue=*/isMaterialShader))
            // used for non-bindless
            this._setBinding(param.name, textureBinding)

            // Layout for UDIM
            const layoutName = _ConcatLayout(param.name)

            const layoutBinding = bindless
              ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_UDIM_LAYOUT,
                bindlessTextureLocation++)
              : new HdStBinding(HdStBinding.TEXTURE_UDIM_LAYOUT,
                locator.uniformLocation++,
                locator.textureUnit++)

            metaDataOut.shaderParameterBinding.set(layoutBinding,
              new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                /*name=*/layoutName,
                /*type=*/HdStGLConversions.getGLSLTypename(
                  HdType.HdTypeFloat)))

            // used for non-bindless
            this._setBinding(layoutName, layoutBinding)
          } else if (param.textureType === HdStTextureType.Uv) {
            if (param.isArrayOfTextures()) {
              const numTextures = param.arrayOfTexturesSize
              // Create one binding for all textures in an array of
              // textures.
              const textureBinding = bindless
                ? new HdStBinding(
                  HdStBinding.BINDLESS_ARRAY_OF_TEXTURE_2D,
                  bindlessTextureLocation++)
                : new HdStBinding(
                  HdStBinding.ARRAY_OF_TEXTURE_2D,
                  locator.uniformLocation++,
                  locator.textureUnit++)
              // used for non-bindless
              this._setBinding(name, textureBinding)

              // For APIs (like OpenGL) in which each texture in an
              // array of textures takes up a slot, increment the
              // used texture units by the number of textures.
              if (!bindless && !capabilities!.isSet(
                HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsSingleSlotResourceArrays)) {
                locator.textureUnit += numTextures - 1
              }

              // Only fill metadata for the first binding.
              metaDataOut.shaderParameterBinding.set(textureBinding,
                new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                  /*name=*/glName,
                  /*type=*/glType,
                  /*swizzle=*/glSwizzle,
                  /*inPrimvars=*/param.samplerCoords,
                  /*isPremultiplied=*/param.isPremultiplied,
                  /*processTextureFallbackValue=*/isMaterialShader,
                  /*arrayOfTexturesSize*/numTextures))
            } else {
              // 2d texture
              const textureBinding = bindless
                ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_2D,
                  bindlessTextureLocation++)
                : new HdStBinding(HdStBinding.TEXTURE_2D,
                  locator.uniformLocation++,
                  locator.textureUnit++)

              metaDataOut.shaderParameterBinding.set(textureBinding,
                new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                  /*name=*/glName,
                  /*type=*/glType,
                  /*swizzle=*/glSwizzle,
                  /*inPrimvars=*/param.samplerCoords,
                  /*isPremultiplied=*/param.isPremultiplied,
                  /*processTextureFallbackValue=*/isMaterialShader))
              // used for non-bindless
              this._setBinding(name, textureBinding)
            }
          } else if (param.textureType === HdStTextureType.Field) {
            // 3d texture
            const textureBinding = bindless
              ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_FIELD,
                bindlessTextureLocation++)
              : new HdStBinding(HdStBinding.TEXTURE_FIELD,
                locator.uniformLocation++,
                locator.textureUnit++)

            metaDataOut.shaderParameterBinding.set(textureBinding,
              new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                /*name=*/glName,
                /*type=*/glType,
                /*swizzle=*/glSwizzle,
                /*inPrimvars=*/param.samplerCoords,
                /*isPremultiplied=*/param.isPremultiplied,
                /*processTextureFallbackValue=*/isMaterialShader))
            this._setBinding(name, textureBinding) // used for non-bindless
          } else if (param.textureType === HdStTextureType.Cubemap) {
            // Cubemap texture
            const textureBinding = bindless
              ? new HdStBinding(HdStBinding.BINDLESS_TEXTURE_CUBEMAP,
                bindlessTextureLocation++)
              : new HdStBinding(HdStBinding.TEXTURE_CUBEMAP,
                locator.uniformLocation++,
                locator.textureUnit++)

            metaDataOut.shaderParameterBinding.set(textureBinding,
              new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
                /*name=*/glName,
                /*type=*/glType,
                /*swizzle=*/glSwizzle,
                /*inPrimvars=*/param.samplerCoords,
                /*isPremultiplied=*/param.isPremultiplied,
                /*processTextureFallbackValue=*/isMaterialShader))
            // used for non-bindless
            this._setBinding(name, textureBinding)
          }
        } else if (param.isPrimvarRedirect() || param.isFieldRedirect()) {
          const samplePrimvars = param.samplerCoords
          const glNames: TfToken[] = []
          for (const pv of samplePrimvars) {
            glNames.push(HdStGLConversions.getGLSLIdentifier(pv))
          }

          const binding = param.isPrimvarRedirect()
            ? new HdStBinding(HdStBinding.PRIMVAR_REDIRECT,
              shaderPrimvarRedirectLocation++)
            : new HdStBinding(HdStBinding.FIELD_REDIRECT,
              shaderFieldRedirectLocation++)

          metaDataOut.shaderParameterBinding.set(binding,
            new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
              /*name=*/glName,
              /*type=*/glType,
              /*swizzle=*/glSwizzle,
              /*inPrimvars=*/glNames))
        } else if (param.isTransform2d()) {
          const binding = new HdStBinding(HdStBinding.TRANSFORM_2D,
            shaderTransform2dLocation++)
          metaDataOut.shaderParameterBinding.set(binding,
            new HdSt_ResourceBinderMetaDataShaderParameterAccessor(
              /*name=*/glName,
              /*type=*/glType,
              /*swizzle=*/glSwizzle,
              /*inPrimvars=*/param.samplerCoords))
        } else if (param.isAdditionalPrimvar()) {
          // Additional primvars is used so certain primvars survive
          // primvar filtering. We can ignore them here, because primvars
          // found on the drawItem are already processed further above.
        } else {
          TF_CODING_ERROR(`Can't resolve ${param.name}`)
        }
      }
    }

    // Add custom bindings.
    // Don't need to sanitize the name used, since these are internally
    // generated.
    for (const it of customBindings) {
      if (it.isInterleavedBufferArray()) {
        // Interleaved resource, only need a single binding point
        const binding = locator.getBinding(it.getBindingType(),
          it.getName())
        const concatenateNames = it.concatenateNames()

        const sblock = new HdSt_ResourceBinderMetaDataStructBlock(
          it.getName(), it.getArraySize())

        const bar = _AsStBar(it.getBar())!

        for (const nameRes of _GetResources(bar)) {
          const valueType = nameRes[1].getTupleType()
          const glType =
            HdStGLConversions.getGLSLTypename(valueType.type)
          sblock.entries.push(new HdSt_ResourceBinderMetaDataStructEntry(
            nameRes[0],
            glType,
            nameRes[1].getOffset(),
            valueType.count,
            concatenateNames))
        }
        sblock.isWritable = it.isWritable()
        sblock.arraySize = it.getArraySize()
        sblock.stageVisibility = it.getStageVisibility()
        if (!metaDataOut.customInterleavedBindings.has(binding)) {
          metaDataOut.customInterleavedBindings.set(binding, sblock)
        }
        this._setBinding(it.getName(), binding)
      } else {
        // Non interleaved resource
        if (it.isBufferArray()) {
          // The BAR was provided, so we will record the name, dataType,
          // binding type and binding location.

          const bar = _AsStBar(it.getBar())!

          for (const nameRes of _GetResources(bar)) {
            const binding = locator.getBinding(
              it.getBindingType(), nameRes[0])
            const b = new HdSt_ResourceBinderMetaDataBindingDeclaration(nameRes[0],
              HdStGLConversions.getGLSLTypename(
                nameRes[1].getTupleType().type),
              binding,
              it.isWritable(),
              it.getStageVisibility())
            metaDataOut.customBindings.push(b)
            this._setBinding(nameRes[0], binding)
          }
        } else {
          const binding = locator.getBinding(
            it.getBindingType(), it.getName())
          const b = new HdSt_ResourceBinderMetaDataBindingDeclaration(it.getName(),
            HdStGLConversions.getGLSLTypename(
              it.getDataType()),
            binding,
            it.isWritable())

          // note that GetDataType() may return HdTypeInvalid,
          // in case it's a typeless binding. CodeGen generates
          // declarations and accessors only for BindingDeclaration
          // with a valid type.
          metaDataOut.customBindings.push(b)
          this._setBinding(it.getName(), binding)
        }
      }
    }
  }

  /** resourceBinder.cpp:992-1036. Assign all binding points used in
   *  computation. Returns metadata to be used for codegen. */
  resolveComputeBindings(
    readWriteBufferSpecs: readonly HdBufferSpec[],
    readOnlyBufferSpecs: readonly HdBufferSpec[],
    _shaders: readonly HdStShaderCode[],
    metaDataOut: HdSt_ResourceBinderMetaData,
    capabilities: HgiCapabilities | null,
  ): void {
    if (!TF_VERIFY(metaDataOut)) {
      return
    }

    // GL context caps
    const bindingType: HdStBindingType =
      capabilities!.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessBuffers)
        ? HdStBinding.BINDLESS_SSBO_RANGE : HdStBinding.SSBO

    // binding assignments
    const locator = new BindingLocator()

    // clear all
    this._bindingMap.clear()

    // read-write per prim data
    for (const spec of readWriteBufferSpecs) {
      const binding = locator.getBinding(bindingType, spec.name as TfToken)
      this._setBinding(spec.name as TfToken, binding)
      metaDataOut.computeReadWriteData.set(binding,
        new HdSt_ResourceBinderMetaDataPrimvar(spec.name as TfToken,
          HdStGLConversions.getGLSLTypename(
            spec.tupleType.type)))
    }

    // read-only per prim data
    for (const spec of readOnlyBufferSpecs) {
      const binding = locator.getBinding(bindingType, spec.name as TfToken)
      this._setBinding(spec.name as TfToken, binding)
      metaDataOut.computeReadOnlyData.set(binding,
        new HdSt_ResourceBinderMetaDataPrimvar(spec.name as TfToken,
          HdStGLConversions.getGLSLTypename(
            spec.tupleType.type)))
    }
  }

  ////////////////////////////////////////////////////////////
  // Hgi Binding
  ////////////////////////////////////////////////////////////

  /** resourceBinder.cpp:1043-1093 */
  getBufferBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    name: TfToken,
    resource: HdStBufferResource | null,
    offset: number,
    level = -1,
    numElements = 1,
  ): void {
    if (!resource || !resource.getHandle().Get()) return

    const binding = this.getBinding(name, level)

    const stageUsage: HgiShaderStage =
      HgiShaderStageBits.HgiShaderStageVertex |
      HgiShaderStageBits.HgiShaderStagePostTessellationControl |
      HgiShaderStageBits.HgiShaderStagePostTessellationVertex |
      HgiShaderStageBits.HgiShaderStageTessellationControl |
      HgiShaderStageBits.HgiShaderStageTessellationEval |
      HgiShaderStageBits.HgiShaderStageGeometry |
      HgiShaderStageBits.HgiShaderStageFragment
    const desc = new HgiBufferBindDesc()
    desc.writable = true

    switch (binding.getType()) {
      case HdStBinding.SSBO:
        // Bind the entire buffer at offset zero.
        desc.buffers = [resource.getHandle()]
        desc.offsets = [0]
        desc.sizes = [0]
        desc.bindingIndex = binding.getLocation()
        desc.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
        desc.stageUsage = stageUsage
        desc.writable = false
        bindingsDesc.buffers.push(desc)
        break
      case HdStBinding.UBO:
        // Bind numElements slices of the buffer at the specified offset.
        desc.buffers = [resource.getHandle()]
        desc.offsets = [offset >>> 0]
        desc.sizes =
          [(numElements * resource.getStride()) >>> 0]
        desc.bindingIndex = binding.getLocation()
        desc.resourceType = HgiBindResourceType.HgiBindResourceTypeUniformBuffer
        desc.stageUsage = stageUsage
        desc.writable = false
        bindingsDesc.buffers.push(desc)
        break
      default:
        // Do nothing here for other binding types.
        break
    }
  }

  /** resourceBinder.cpp:1095-1107 */
  getBufferArrayBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    bar: HdStBufferArrayRange | null,
  ): void {
    if (!bar) return

    for (const it of _GetResources(bar)) {
      this.getBufferBindingDesc(bindingsDesc,
        it[0],
        it[1], it[1].getOffset())
    }
  }

  /** resourceBinder.cpp:1109-1121 */
  getInterleavedBufferArrayBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    bar: HdStBufferArrayRange | null,
    name: TfToken,
  ): void {
    if (!bar) return

    this.getBufferBindingDesc(bindingsDesc,
      name,
      bar.getResource(),
      bar.getResource()!.getOffset())
  }

  /** resourceBinder.cpp:1123-1138 */
  getInstanceBufferArrayBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    bar: HdStBufferArrayRange | null,
    level: number,
  ): void {
    if (!bar) return

    for (const it of _GetResources(bar)) {
      if (this.hasBinding(it[0], level)) {
        this.getBufferBindingDesc(
          bindingsDesc,
          it[0], it[1], it[1].getOffset(), level)
      }
    }
  }

  /** resourceBinder.cpp:1140-1171 */
  getBindingRequestBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    req: HdStBindingRequest,
  ): void {
    if (req.isTypeless()) {
      return
    } else if (req.isResource()) {
      const resource = req.getResource()

      this.getBufferBindingDesc(bindingsDesc,
        req.getName(),
        resource,
        req.getByteOffset())
    } else if (req.isInterleavedBufferArray()) {
      // note: interleaved buffer needs only 1 binding
      const bar = _AsStBar(req.getBar())!

      this.getBufferBindingDesc(bindingsDesc,
        req.getName(),
        bar.getResource(),
        req.getByteOffset())
    } else if (req.isBufferArray()) {
      const bar = _AsStBar(req.getBar())

      this.getBufferArrayBindingDesc(bindingsDesc, bar)
    }
  }

  /** resourceBinder.cpp:1173-1196 */
  getTextureBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    name: TfToken,
    texelSampler: HgiSamplerHandle,
    texelTexture: HgiTextureHandle,
  ): void {
    if (!texelSampler.Get() || !texelTexture.Get()) {
      return
    }

    const binding = this.getBinding(name)

    const texelDesc = new HgiTextureBindDesc()
    texelDesc.stageUsage =
      HgiShaderStageBits.HgiShaderStageGeometry |
      HgiShaderStageBits.HgiShaderStageFragment |
      HgiShaderStageBits.HgiShaderStagePostTessellationVertex
    texelDesc.textures = [texelTexture]
    texelDesc.samplers = [texelSampler]
    texelDesc.resourceType = HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage
    texelDesc.bindingIndex = binding.getTextureUnit()
    texelDesc.writable = false
    bindingsDesc.textures.push(texelDesc)
  }

  /** resourceBinder.cpp:1198-1222 */
  getTextureBindingDescs(
    bindingsDesc: HgiResourceBindingsDesc,
    name: TfToken,
    texelSamplers: readonly HgiSamplerHandle[],
    texelTextures: readonly HgiTextureHandle[],
  ): void {
    for (let i = 0; i < texelSamplers.length; i++) {
      if (!texelSamplers[i]!.Get() || !texelTextures[i]!.Get()) {
        return
      }
    }
    const binding = this.getBinding(name)

    const texelDesc = new HgiTextureBindDesc()
    texelDesc.stageUsage =
      HgiShaderStageBits.HgiShaderStageGeometry |
      HgiShaderStageBits.HgiShaderStageFragment |
      HgiShaderStageBits.HgiShaderStagePostTessellationVertex
    texelDesc.textures = [...texelTextures]
    texelDesc.samplers = [...texelSamplers]
    texelDesc.resourceType = HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage
    texelDesc.bindingIndex = binding.getTextureUnit()
    texelDesc.writable = false
    bindingsDesc.textures.push(texelDesc)
  }

  /** resourceBinder.cpp:1225-1250 */
  getTextureWithLayoutBindingDesc(
    bindingsDesc: HgiResourceBindingsDesc,
    name: TfToken,
    texelSampler: HgiSamplerHandle,
    texelTexture: HgiTextureHandle,
    layoutSampler: HgiSamplerHandle,
    layoutTexture: HgiTextureHandle,
  ): void {
    if (!texelSampler.Get() || !texelTexture.Get() || !layoutSampler.Get() ||
      !layoutTexture.Get()) {
      return
    }

    this.getTextureBindingDesc(bindingsDesc, name, texelSampler, texelTexture)

    const layoutBinding = this.getBinding(_ConcatLayout(name))
    const layoutDesc = new HgiTextureBindDesc()
    layoutDesc.stageUsage =
      HgiShaderStageBits.HgiShaderStageGeometry |
      HgiShaderStageBits.HgiShaderStageFragment
    layoutDesc.textures = [layoutTexture]
    layoutDesc.samplers = [layoutSampler]
    layoutDesc.resourceType = HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage
    layoutDesc.bindingIndex = layoutBinding.getTextureUnit()
    layoutDesc.writable = false
    bindingsDesc.textures.push(layoutDesc)
  }

  /** resourceBinder.cpp:1252-1280 */
  getTextureWithLayoutBindingDescs(
    bindingsDesc: HgiResourceBindingsDesc,
    name: TfToken,
    texelSamplers: readonly HgiSamplerHandle[],
    texelTextures: readonly HgiTextureHandle[],
    layoutSamplers: readonly HgiSamplerHandle[],
    layoutTextures: readonly HgiTextureHandle[],
  ): void {
    for (let i = 0; i < texelSamplers.length; i++) {
      if (!texelSamplers[i]!.Get() || !texelTextures[i]!.Get() ||
        !layoutSamplers[i]!.Get() || !layoutTextures[i]!.Get()) {
        return
      }
    }
    this.getTextureBindingDescs(bindingsDesc, name, texelSamplers, texelTextures)

    const layoutBinding = this.getBinding(_ConcatLayout(name))
    const layoutDesc = new HgiTextureBindDesc()
    layoutDesc.stageUsage =
      HgiShaderStageBits.HgiShaderStageGeometry |
      HgiShaderStageBits.HgiShaderStageFragment
    layoutDesc.textures = [...layoutTextures]
    layoutDesc.samplers = [...layoutSamplers]
    layoutDesc.resourceType = HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage
    layoutDesc.bindingIndex = layoutBinding.getTextureUnit()
    layoutDesc.writable = false
    bindingsDesc.textures.push(layoutDesc)
  }

  ////////////////////////////////////////////////////////////
  // GL Binding
  //
  // PLATFORM-DIVERGENCE(hdst-gl-binding): the GL binding entry points below
  // issue OpenGL calls upstream (glBindBuffer, glVertexAttribPointer,
  // glBindBufferBase, glUniform*, ...). HgiGL is not ported, so they keep
  // upstream's control flow and diagnostics and the GL calls are no-ops.
  // Replace with the GL calls if an HgiGL backend is ported; Storm on
  // Hgi-generated resources (Metal, Vulkan, WebGPU) never calls them.
  ////////////////////////////////////////////////////////////

  /** Both BindBuffer overloads: (name, buffer) at resourceBinder.cpp:1284-1289
   *  and (name, buffer, offset, level = -1, numElements = 1) at
   *  resourceBinder.cpp:1291-1421. */
  bindBuffer(name: TfToken, buffer: HdStBufferResource, offset?: number,
    level = -1, _numElements = 1): void {
    if (offset === undefined) {
      this.bindBuffer(name, buffer, buffer.getOffset(), /*level=*/-1)
      return
    }

    // it is possible that the buffer has not been initialized when
    // the instanceIndex is empty (e.g. FX points. see bug 120354)
    if (!buffer.getHandle().Get()) return

    const binding = this.getBinding(name, level)
    const type = binding.getType()

    const tupleType = buffer.getTupleType()
    void _GetNumComponents(tupleType.type)
    void _ShouldBeNormalized(tupleType.type)
    void HdStGLConversions.getGLAttribType(tupleType.type)

    switch (type) {
      case HdStBinding.VERTEX_ATTR:
      case HdStBinding.DRAW_INDEX:
      case HdStBinding.DRAW_INDEX_INSTANCE:
      case HdStBinding.DRAW_INDEX_INSTANCE_ARRAY:
      case HdStBinding.INDEX_ATTR:
      case HdStBinding.BINDLESS_UNIFORM:
      case HdStBinding.SSBO:
      case HdStBinding.BINDLESS_SSBO_RANGE:
      case HdStBinding.DISPATCH:
      case HdStBinding.UBO:
      case HdStBinding.UNIFORM:
        // GL calls (resourceBinder.cpp:1316-1409): see FAITHFULNESS-DEBT
        // above.
        break
      case HdStBinding.TEXTURE_2D:
      case HdStBinding.TEXTURE_FIELD:
        // nothing
        break
      default:
        TF_CODING_ERROR(`binding type ${type} not found for ${name}`)
        break
    }
  }

  /** resourceBinder.cpp:1423-1491 */
  unbindBuffer(name: TfToken, buffer: HdStBufferResource, level = -1): void {
    // it is possible that the buffer has not been initialized when
    // the instanceIndex is empty (e.g. FX points)
    if (!buffer.getHandle().Get()) return

    const binding = this.getBinding(name, level)
    const type = binding.getType()

    switch (type) {
      case HdStBinding.VERTEX_ATTR:
      case HdStBinding.DRAW_INDEX:
      case HdStBinding.DRAW_INDEX_INSTANCE:
      case HdStBinding.DRAW_INDEX_INSTANCE_ARRAY:
      case HdStBinding.INDEX_ATTR:
      case HdStBinding.BINDLESS_UNIFORM:
      case HdStBinding.SSBO:
      case HdStBinding.BINDLESS_SSBO_RANGE:
      case HdStBinding.DISPATCH:
      case HdStBinding.UBO:
      case HdStBinding.UNIFORM:
        // GL calls (resourceBinder.cpp:1438-1481): see FAITHFULNESS-DEBT
        // above.
        break
      case HdStBinding.TEXTURE_2D:
      case HdStBinding.TEXTURE_FIELD:
        // nothing
        break
      default:
        TF_CODING_ERROR(`binding type ${type} not found for ${name}`)
        break
    }
  }

  /** resourceBinder.cpp:1493-1500. bind/unbind interleaved constant
   *  buffer */
  bindConstantBuffer(constantBar: HdStBufferArrayRange | null): void {
    if (!constantBar) return

    // constant buffer is interleaved. we just need to bind a buffer.
    this.bindBuffer(_tokens.constantPrimvars, constantBar.getResource()!)
  }

  /** resourceBinder.cpp:1502-1509 */
  unbindConstantBuffer(constantBar: HdStBufferArrayRange | null): void {
    if (!constantBar) return

    this.unbindBuffer(_tokens.constantPrimvars, constantBar.getResource()!)
  }

  /** resourceBinder.cpp:1511-1519. bind/unbind interleaved buffer */
  bindInterleavedBuffer(interleavedBar: HdStBufferArrayRange | null,
    name: TfToken): void {
    if (!interleavedBar) return

    this.bindBuffer(name, interleavedBar.getResource()!)
  }

  /** resourceBinder.cpp:1521-1529 */
  unbindInterleavedBuffer(interleavedBar: HdStBufferArrayRange | null,
    name: TfToken): void {
    if (!interleavedBar) return

    this.unbindBuffer(name, interleavedBar.getResource()!)
  }

  /** resourceBinder.cpp:1531-1542. bind/unbind nested instance
   *  BufferArray */
  bindInstanceBufferArray(bar: HdStBufferArrayRange | null, level: number): void {
    if (!bar) return

    for (const it of _GetResources(bar)) {
      if (this.hasBinding(it[0], level)) {
        this.bindBuffer(it[0], it[1], it[1].getOffset(), level)
      }
    }
  }

  /** resourceBinder.cpp:1544-1555 */
  unbindInstanceBufferArray(bar: HdStBufferArrayRange | null, level: number): void {
    if (!bar) return

    for (const it of _GetResources(bar)) {
      if (this.hasBinding(it[0], level)) {
        this.unbindBuffer(it[0], it[1], level)
      }
    }
  }

  /** resourceBinder.cpp:1557-1565. bind/unbind BufferArray */
  bindBufferArray(bar: HdStBufferArrayRange | null): void {
    if (!bar) return

    for (const it of _GetResources(bar)) {
      this.bindBuffer(it[0], it[1])
    }
  }

  /** resourceBinder.cpp:1567-1589 */
  bind(req: HdStBindingRequest): void {
    if (req.isTypeless()) {
      return
    } else if (req.isResource()) {
      const res = req.getResource()!
      this.bindBuffer(req.getName(), res, req.getByteOffset())
    } else if (req.isInterleavedBufferArray()) {
      // note: interleaved buffer needs only 1 binding
      const bar = _AsStBar(req.getBar())!
      this.bindBuffer(req.getName(), bar.getResource()!, req.getByteOffset(),
        /*level*/-1, bar.getNumElements())
    } else if (req.isBufferArray()) {
      const bar = _AsStBar(req.getBar())
      this.bindBufferArray(bar)
    }
  }

  /** resourceBinder.cpp:1591-1614 */
  unbind(req: HdStBindingRequest): void {
    if (req.isTypeless()) {
      return
    } else if (req.isResource()) {
      const res = req.getResource()!
      this.unbindBuffer(req.getName(), res)
    } else if (req.isInterleavedBufferArray()) {
      // note: interleaved buffer needs only 1 binding
      const bar = _AsStBar(req.getBar())!
      this.unbindBuffer(req.getName(), bar.getResource()!)
    } else if (req.isBufferArray()) {
      const bar = _AsStBar(req.getBar())
      this.unbindBufferArray(bar)
    }
  }

  /** resourceBinder.cpp:1616-1625 */
  unbindBufferArray(bar: HdStBufferArrayRange | null): void {
    if (!bar) return

    for (const it of _GetResources(bar)) {
      this.unbindBuffer(it[0], it[1])
    }
  }

  /** resourceBinder.cpp:1627-1648. bind a standalone uniform (signed int,
   *  ivec2, ivec3, ivec4) */
  bindUniformi(name: TfToken, count: number, _value: ArrayLike<number>): void {
    const uniformLocation = this.getBinding(name)
    if (uniformLocation.getLocation() === HdStBinding.NOT_EXIST) return

    TF_VERIFY(uniformLocation.isValid())
    TF_VERIFY(uniformLocation.getType() === HdStBinding.UNIFORM)

    if (count >= 1 && count <= 4) {
      // glUniform{1,2,3,4}iv: see PLATFORM-DIVERGENCE(hdst-gl-binding).
    } else {
      TF_CODING_ERROR(`Invalid count ${count}.\n`)
    }
  }

  /** resourceBinder.cpp:1650-1661. bind a standalone uniform array (int[N]) */
  bindUniformArrayi(name: TfToken, _count: number, _value: ArrayLike<number>): void {
    const uniformLocation = this.getBinding(name)
    if (uniformLocation.getLocation() === HdStBinding.NOT_EXIST) return

    TF_VERIFY(uniformLocation.isValid())
    TF_VERIFY(uniformLocation.getType() === HdStBinding.UNIFORM_ARRAY)

    // glUniform1iv: see PLATFORM-DIVERGENCE(hdst-gl-binding).
  }

  /** resourceBinder.cpp:1663-1684. bind(update) a standalone uniform
   *  (unsigned int) */
  bindUniformui(name: TfToken, count: number, _value: ArrayLike<number>): void {
    const uniformLocation = this.getBinding(name)
    if (uniformLocation.getLocation() === HdStBinding.NOT_EXIST) return

    TF_VERIFY(uniformLocation.isValid())
    TF_VERIFY(uniformLocation.getType() === HdStBinding.UNIFORM)

    if (count >= 1 && count <= 4) {
      // glUniform{1,2,3,4}uiv: see PLATFORM-DIVERGENCE(hdst-gl-binding).
    } else {
      TF_CODING_ERROR(`Invalid count ${count}.`)
    }
  }

  /** resourceBinder.cpp:1686-1710. bind a standalone uniform (float, vec2,
   *  vec3, vec4, mat4) */
  bindUniformf(name: TfToken, count: number, _value: ArrayLike<number>): void {
    const uniformLocation = this.getBinding(name)
    if (uniformLocation.getLocation() === HdStBinding.NOT_EXIST) return

    if (!TF_VERIFY(uniformLocation.isValid())) return
    if (!TF_VERIFY(uniformLocation.getType() === HdStBinding.UNIFORM)) return

    if ((count >= 1 && count <= 4) || count === 16) {
      // glUniform{1,2,3,4}fv / glUniformMatrix4fv: see
      // PLATFORM-DIVERGENCE(hdst-gl-binding).
    } else {
      TF_CODING_ERROR(`Invalid count ${count}.`)
    }
  }

  ////////////////////////////////////////////////////////////
  // Binding Queries
  ////////////////////////////////////////////////////////////

  /** resourceBinder.h:483-485. Returns whether a binding exists. */
  hasBinding(name: TfToken, level = -1): boolean {
    return this._bindingMap.has(_NameAndLevelKey(name, level))
  }

  /** resourceBinder.h:488-492. Returns binding point. */
  getBinding(name: TfToken, level = -1): HdStBinding {
    return this._bindingMap.get(_NameAndLevelKey(name, level)) ?? new HdStBinding()
  }

  /** resourceBinder.cpp:1889-1907.
   *  PLATFORM-DIVERGENCE(hdst-bindless-handles): bindless handles exist only
   *  for HgiGL samplers/textures (HgiGLSampler::GetBindlessHandle); without
   *  HgiGL the dynamic_casts fail and upstream returns 0, as here. */
  static getSamplerBindlessHandle(
    _samplerHandle: HgiSamplerHandle,
    _textureHandle: HgiTextureHandle,
  ): bigint {
    return 0n
  }

  /** resourceBinder.cpp:1909-1922. See
   *  PLATFORM-DIVERGENCE(hdst-bindless-handles) above. */
  static getTextureBindlessHandle(_textureHandle: HgiTextureHandle): bigint {
    return 0n
  }

  /** resourceBinder.cpp:1955-1971. Binds the sampler and texture for `name`.
   *  Does nothing if the named resource is a bindless resource. */
  bindTexture(
    name: TfToken,
    samplerHandle: HgiSamplerHandle,
    textureHandle: HgiTextureHandle,
    bind: boolean,
  ): void {
    const binding = this.getBinding(name)
    if (_IsBindless(binding)) {
      return
    }

    _BindGLTextureAndSampler(
      binding.getTextureUnit(),
      (bind && textureHandle.Get()) ? textureHandle.getId() : 0,
      (bind && samplerHandle.Get()) ? samplerHandle.getId() : 0)
  }

  /** resourceBinder.cpp:1973-1992 */
  bindTextures(
    name: TfToken,
    samplerHandles: readonly HgiSamplerHandle[],
    textureHandles: readonly HgiTextureHandle[],
    bind: boolean,
  ): void {
    const binding = this.getBinding(name)
    if (_IsBindless(binding)) {
      return
    }

    let textureUnit = binding.getTextureUnit()
    for (let i = 0; i < textureHandles.length; i++) {
      _BindGLTextureAndSampler(
        textureUnit++,
        (bind && textureHandles[i]!.Get()) ? textureHandles[i]!.getId() : 0,
        (bind && samplerHandles[i]!.Get()) ? samplerHandles[i]!.getId() : 0)
    }
  }

  /** resourceBinder.cpp:1994-2019. Binds the sampler and texture for `name`
   *  along with an additional layout texture as needed for Ptex or UDIM
   *  textures. Does nothing if the named resource is a bindless resource. */
  bindTextureWithLayout(
    name: TfToken,
    texelSampler: HgiSamplerHandle,
    texelTexture: HgiTextureHandle,
    layoutSampler: HgiSamplerHandle,
    layoutTexture: HgiTextureHandle,
    bind: boolean,
  ): void {
    const texelBinding = this.getBinding(name)
    if (_IsBindless(texelBinding)) {
      return
    }

    _BindGLTextureAndSampler(
      texelBinding.getTextureUnit(),
      (bind && texelTexture.Get()) ? texelTexture.getId() : 0,
      (bind && texelSampler.Get()) ? texelSampler.getId() : 0)

    const layoutBinding = this.getBinding(_ConcatLayout(name))
    _BindGLTextureAndSampler(
      layoutBinding.getTextureUnit(),
      (bind && layoutTexture.Get()) ? layoutTexture.getId() : 0,
      (bind && layoutSampler.Get()) ? layoutSampler.getId() : 0)
  }

  /** resourceBinder.cpp:2021-2050 */
  bindTexturesWithLayout(
    name: TfToken,
    texelSamplers: readonly HgiSamplerHandle[],
    texelTextures: readonly HgiTextureHandle[],
    layoutSamplers: readonly HgiSamplerHandle[],
    layoutTextures: readonly HgiTextureHandle[],
    bind: boolean,
  ): void {
    const texelBinding = this.getBinding(name)
    if (_IsBindless(texelBinding)) {
      return
    }

    let textureUnit = texelBinding.getTextureUnit()
    for (let i = 0; i < texelTextures.length; i++) {
      _BindGLTextureAndSampler(
        textureUnit++,
        (bind && texelTextures[i]!.Get()) ? texelTextures[i]!.getId() : 0,
        (bind && texelSamplers[i]!.Get()) ? texelSamplers[i]!.getId() : 0)
    }

    const layoutBinding = this.getBinding(_ConcatLayout(name))
    textureUnit = layoutBinding.getTextureUnit()
    for (let i = 0; i < layoutTextures.length; i++) {
      _BindGLTextureAndSampler(
        textureUnit++,
        (bind && layoutTextures[i]!.Get()) ? layoutTextures[i]!.getId() : 0,
        (bind && layoutSamplers[i]!.Get()) ? layoutSamplers[i]!.getId() : 0)
    }
  }
}
