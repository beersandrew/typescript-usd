// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/conversions.h,
//  pxr/imaging/hgiMetal/conversions.mm, pxr/imaging/hgiVulkan/conversions.cpp,
//  pxr/imaging/hgiVulkan/conversions.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUConversions: Hgi enums to WebGPU descriptor values. Modelled on
// pxr/imaging/hgiMetal/conversions.{h,mm} (tables indexed by the Hgi enum,
// one Get* function per table) and pxr/imaging/hgiVulkan/conversions.{h,cpp}.
//
// The GPU*Usage / GPUShaderStage flag values are spelled out (WebGPU spec
// values) so the tables load where navigator.gpu is absent.

import {
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiBlendFactor,
  HgiBlendOp,
  HgiBufferUsageBits,
  HgiColorMaskBits,
  HgiCompareFunction,
  HgiCullMode,
  HgiFormat,
  HgiMipFilter,
  HgiPrimitiveType,
  HgiSamplerAddressMode,
  HgiSamplerFilter,
  HgiShaderStageBits,
  HgiStencilOp,
  HgiTextureType,
  HgiTextureUsageBits,
  HgiVertexBufferStepFunction,
  HgiWinding,
  type HgiBufferUsage,
  type HgiColorMask,
  type HgiShaderStage,
  type HgiTextureUsage,
} from 'typescript-usd/hgi'

/** GPUBufferUsage (WebGPU spec, "GPUBufferUsage"). */
export const GPUBufferUsageFlags = {
  MAP_READ: 0x0001, MAP_WRITE: 0x0002, COPY_SRC: 0x0004, COPY_DST: 0x0008,
  INDEX: 0x0010, VERTEX: 0x0020, UNIFORM: 0x0040, STORAGE: 0x0080,
  INDIRECT: 0x0100, QUERY_RESOLVE: 0x0200,
} as const
/** GPUTextureUsage (WebGPU spec, "GPUTextureUsage"). */
export const GPUTextureUsageFlags = {
  COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
} as const
/** GPUShaderStage (WebGPU spec, "GPUShaderStage"). */
export const GPUShaderStageFlags = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const
/** GPUColorWrite (WebGPU spec, "GPUColorWrite"). */
export const GPUColorWriteFlags = { RED: 0x1, GREEN: 0x2, BLUE: 0x4, ALPHA: 0x8 } as const
/** GPUMapMode (WebGPU spec, "GPUMapMode"). */
export const GPUMapModeFlags = { READ: 0x1, WRITE: 0x2 } as const

type TextureFormatOrInvalid = GPUTextureFormat | null

/** Pixel formats, indexed by HgiFormat. Follows _PIXEL_FORMAT_DESC
 *  (hgiMetal/conversions.mm:18-78); the formats Metal leaves invalid
 *  (three-component Float16/Float32/Int16/UInt16/Int32 and
 *  PackedInt1010102) have no WebGPU texture format either. */
const _PIXEL_FORMAT_DESC: readonly TextureFormatOrInvalid[] = [
  'r8unorm',             // HgiFormatUNorm8
  'rg8unorm',            // HgiFormatUNorm8Vec2
  'rgba8unorm',          // HgiFormatUNorm8Vec4
  'r8snorm',             // HgiFormatSNorm8
  'rg8snorm',            // HgiFormatSNorm8Vec2
  'rgba8snorm',          // HgiFormatSNorm8Vec4
  'r16float',            // HgiFormatFloat16
  'rg16float',           // HgiFormatFloat16Vec2
  null,                  // HgiFormatFloat16Vec3: unsupported by WebGPU
  'rgba16float',         // HgiFormatFloat16Vec4
  'r32float',            // HgiFormatFloat32
  'rg32float',           // HgiFormatFloat32Vec2
  null,                  // HgiFormatFloat32Vec3: unsupported by WebGPU
  'rgba32float',         // HgiFormatFloat32Vec4
  'r16sint',             // HgiFormatInt16
  'rg16sint',            // HgiFormatInt16Vec2
  null,                  // HgiFormatInt16Vec3: unsupported by WebGPU
  'rgba16sint',          // HgiFormatInt16Vec4
  'r16uint',             // HgiFormatUInt16
  'rg16uint',            // HgiFormatUInt16Vec2
  null,                  // HgiFormatUInt16Vec3: unsupported by WebGPU
  'rgba16uint',          // HgiFormatUInt16Vec4
  'r32sint',             // HgiFormatInt32
  'rg32sint',            // HgiFormatInt32Vec2
  null,                  // HgiFormatInt32Vec3: unsupported by WebGPU
  'rgba32sint',          // HgiFormatInt32Vec4
  'rgba8unorm-srgb',     // HgiFormatUNorm8Vec4srgb
  'bc6h-rgb-float',      // HgiFormatBC6FloatVec3
  'bc6h-rgb-ufloat',     // HgiFormatBC6UFloatVec3
  'bc7-rgba-unorm',      // HgiFormatBC7UNorm8Vec4
  'bc7-rgba-unorm-srgb', // HgiFormatBC7UNorm8Vec4srgb
  'bc1-rgba-unorm',      // HgiFormatBC1UNorm8Vec4
  'bc3-rgba-unorm',      // HgiFormatBC3UNorm8Vec4
  'depth32float-stencil8', // HgiFormatFloat32UInt8
  null,                  // HgiFormatPackedInt1010102: unsupported by WebGPU
]

/** Vertex formats, indexed by HgiFormat. Follows _VERTEX_FORMAT_DESC
 *  (hgiMetal/conversions.mm:99-149). WebGPU has no three-component 8- or
 *  16-bit vertex formats; those stay invalid. */
const _VERTEX_FORMAT_DESC: readonly (GPUVertexFormat | null)[] = [
  'unorm8',     // HgiFormatUNorm8 (requires WebGPU's single-component formats)
  'unorm8x2',   // HgiFormatUNorm8Vec2
  'unorm8x4',   // HgiFormatUNorm8Vec4
  'snorm8',     // HgiFormatSNorm8
  'snorm8x2',   // HgiFormatSNorm8Vec2
  'snorm8x4',   // HgiFormatSNorm8Vec4
  'float16',    // HgiFormatFloat16
  'float16x2',  // HgiFormatFloat16Vec2
  null,         // HgiFormatFloat16Vec3
  'float16x4',  // HgiFormatFloat16Vec4
  'float32',    // HgiFormatFloat32
  'float32x2',  // HgiFormatFloat32Vec2
  'float32x3',  // HgiFormatFloat32Vec3
  'float32x4',  // HgiFormatFloat32Vec4
  'sint16',     // HgiFormatInt16
  'sint16x2',   // HgiFormatInt16Vec2
  null,         // HgiFormatInt16Vec3
  'sint16x4',   // HgiFormatInt16Vec4
  'uint16',     // HgiFormatUInt16
  'uint16x2',   // HgiFormatUInt16Vec2
  null,         // HgiFormatUInt16Vec3
  'uint16x4',   // HgiFormatUInt16Vec4
  'sint32',     // HgiFormatInt32
  'sint32x2',   // HgiFormatInt32Vec2
  'sint32x3',   // HgiFormatInt32Vec3
  'sint32x4',   // HgiFormatInt32Vec4
  'unorm8x4',   // HgiFormatUNorm8Vec4srgb (as Metal's UChar4Normalized)
  null, null, null, null, null, null, // BC formats
  null,         // HgiFormatFloat32UInt8
  // HgiFormatPackedInt1010102: Metal uses Int1010102Normalized; WebGPU only
  // has the unsigned unorm10-10-10-2.
  null,
]

export class HgiWebGPUConversions {
  /** GetPixelFormat (hgiMetal/conversions.mm:439-467): a depth target's
   *  Float32 is depth32float, and Float32UInt8 is depth32float-stencil8. */
  static getPixelFormat(inFormat: HgiFormat, inUsage: HgiTextureUsage): GPUTextureFormat | null {
    if (inFormat === HgiFormat.HgiFormatInvalid) {
      return null
    }

    if (inUsage & HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget) {
      if (inFormat === HgiFormat.HgiFormatFloat32UInt8) {
        return 'depth32float-stencil8'
      }
      return 'depth32float'
    }

    return _PIXEL_FORMAT_DESC[inFormat] ?? null
  }

  /** GetVertexFormat (hgiMetal/conversions.mm:469-485) */
  static getVertexFormat(inFormat: HgiFormat): GPUVertexFormat | null {
    if (inFormat === HgiFormat.HgiFormatInvalid) {
      return null
    }
    return _VERTEX_FORMAT_DESC[inFormat] ?? null
  }

  /** _CullModeTable (hgiMetal/conversions.mm:167-176): front-and-back is
   *  unsupported, as in Metal, and culls nothing. */
  static getCullMode(cm: HgiCullMode): GPUCullMode {
    switch (cm) {
      case HgiCullMode.HgiCullModeFront: return 'front'
      case HgiCullMode.HgiCullModeBack: return 'back'
      default: return 'none'
    }
  }

  /** _blendEquationTable (hgiMetal/conversions.mm:200-210) */
  static getBlendEquation(bo: HgiBlendOp): GPUBlendOperation {
    return ([
      'add', 'subtract', 'reverse-subtract', 'min', 'max',
    ] as const)[bo as number] ?? 'add'
  }

  /** _blendFactorTable (hgiMetal/conversions.mm:218-242). WebGPU supports
   *  the constant factors Metal lacks; the dual-source factors require the
   *  dual-source-blending feature. */
  static getBlendFactor(bf: HgiBlendFactor): GPUBlendFactor {
    return ([
      'zero', 'one', 'src', 'one-minus-src', 'dst', 'one-minus-dst',
      'src-alpha', 'one-minus-src-alpha', 'dst-alpha', 'one-minus-dst-alpha',
      'constant', 'one-minus-constant', 'constant', 'one-minus-constant',
      'src-alpha-saturated', 'src1', 'one-minus-src1', 'src1-alpha',
      'one-minus-src1-alpha',
    ] as const)[bf as number] ?? 'zero'
  }

  /** _windingTable (hgiMetal/conversions.mm:250-260). Winding order is
   *  inverted because the generated vertex stage flips clip-space y (see
   *  HgiWebGPUShaderGenerator); together they emulate the OpenGL coordinate
   *  space as Metal's inverted viewport does. */
  static getWinding(winding: HgiWinding): GPUFrontFace {
    return winding === HgiWinding.HgiWindingClockwise ? 'ccw' : 'cw'
  }

  /** _attachmentLoadOpTable (hgiMetal/conversions.mm:268-276). WebGPU has
   *  no "don't care" load; clearing is the load that never reads memory. */
  static getAttachmentLoadOp(loadOp: HgiAttachmentLoadOp): GPULoadOp {
    return loadOp === HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad ? 'load' : 'clear'
  }

  /** _attachmentStoreOpTable (hgiMetal/conversions.mm:284-291) */
  static getAttachmentStoreOp(storeOp: HgiAttachmentStoreOp): GPUStoreOp {
    return storeOp === HgiAttachmentStoreOp.HgiAttachmentStoreOpStore ? 'store' : 'discard'
  }

  /** _compareFnTable (hgiMetal/conversions.mm:299-312) */
  static getCompareFunction(cf: HgiCompareFunction): GPUCompareFunction {
    return ([
      'never', 'less', 'equal', 'less-equal', 'greater', 'not-equal',
      'greater-equal', 'always',
    ] as const)[cf as number] ?? 'always'
  }

  /** _stencilOpTable (hgiMetal/conversions.mm:320-333) */
  static getStencilOp(op: HgiStencilOp): GPUStencilOperation {
    return ([
      'keep', 'zero', 'replace', 'increment-clamp', 'decrement-clamp',
      'invert', 'increment-wrap', 'decrement-wrap',
    ] as const)[op as number] ?? 'keep'
  }

  /** _textureTypeTable (hgiMetal/conversions.mm:338-348) as a
   *  GPUTextureDimension; cubemaps and arrays are 2d textures with layers. */
  static getTextureDimension(textureType: HgiTextureType): GPUTextureDimension {
    switch (textureType) {
      case HgiTextureType.HgiTextureType1D:
      case HgiTextureType.HgiTextureType1DArray:
        return '1d'
      case HgiTextureType.HgiTextureType3D:
        return '3d'
      default:
        return '2d'
    }
  }

  /** The view dimension of a texture's default view. */
  static getTextureViewDimension(textureType: HgiTextureType): GPUTextureViewDimension {
    switch (textureType) {
      case HgiTextureType.HgiTextureType1D: return '1d'
      case HgiTextureType.HgiTextureType3D: return '3d'
      case HgiTextureType.HgiTextureTypeCubemap: return 'cube'
      case HgiTextureType.HgiTextureType2DArray: return '2d-array'
      // WebGPU has no 1d-array view dimension.
      case HgiTextureType.HgiTextureType1DArray: return '2d-array'
      default: return '2d'
    }
  }

  /** _samplerAddressModeTable (hgiMetal/conversions.mm:353-363). WebGPU has
   *  neither mirror-clamp-to-edge nor clamp-to-border-color; both clamp to
   *  the edge, and the texture accessors blend the border colour in for
   *  clamp-to-border-color (samplerState.ts). */
  static getSamplerAddressMode(a: HgiSamplerAddressMode): GPUAddressMode {
    switch (a) {
      case HgiSamplerAddressMode.HgiSamplerAddressModeRepeat: return 'repeat'
      case HgiSamplerAddressMode.HgiSamplerAddressModeMirrorRepeat: return 'mirror-repeat'
      default: return 'clamp-to-edge'
    }
  }

  /** _samplerFilterTable (hgiMetal/conversions.mm:365-372) */
  static getMinMagFilter(mf: HgiSamplerFilter): GPUFilterMode {
    return mf === HgiSamplerFilter.HgiSamplerFilterLinear ? 'linear' : 'nearest'
  }

  /** _mipFilterTable (hgiMetal/conversions.mm:374-382). NotMipmapped is
   *  'nearest' plus lodMaxClamp 0 (HgiWebGPUSampler). */
  static getMipFilter(mf: HgiMipFilter): GPUMipmapFilterMode {
    return mf === HgiMipFilter.HgiMipFilterLinear ? 'linear' : 'nearest'
  }

  /** _primitiveTypeTable (hgiMetal/conversions.mm:424-436). Patches and
   *  lines-with-adjacency have no WebGPU topology. */
  static getPrimitiveTopology(pt: HgiPrimitiveType): GPUPrimitiveTopology | null {
    switch (pt) {
      case HgiPrimitiveType.HgiPrimitiveTypePointList: return 'point-list'
      case HgiPrimitiveType.HgiPrimitiveTypeLineList: return 'line-list'
      case HgiPrimitiveType.HgiPrimitiveTypeLineStrip: return 'line-strip'
      case HgiPrimitiveType.HgiPrimitiveTypeTriangleList: return 'triangle-list'
      default: return null
    }
  }

  /** The vertex step functions of hgiMetal/stepFunctions.mm. A constant
   *  attribute is a per-instance attribute with zero stride. */
  static getVertexStepMode(sf: HgiVertexBufferStepFunction): GPUVertexStepMode {
    return sf === HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionPerInstance ||
      sf === HgiVertexBufferStepFunction.HgiVertexBufferStepFunctionConstant
      ? 'instance' : 'vertex'
  }

  /** GetColorWriteMask (hgiMetal/conversions.mm:592-604). */
  static getColorWriteMask(mask: HgiColorMask): GPUColorWriteFlags {
    let flags = 0
    if (mask & HgiColorMaskBits.HgiColorMaskRed) flags |= GPUColorWriteFlags.RED
    if (mask & HgiColorMaskBits.HgiColorMaskGreen) flags |= GPUColorWriteFlags.GREEN
    if (mask & HgiColorMaskBits.HgiColorMaskBlue) flags |= GPUColorWriteFlags.BLUE
    if (mask & HgiColorMaskBits.HgiColorMaskAlpha) flags |= GPUColorWriteFlags.ALPHA
    return flags
  }

  /** GetShaderStages (hgiVulkan/conversions.cpp:106-116, 487-499): the WebGPU stages of an
   *  HgiShaderStage mask. */
  static getShaderStages(ss: HgiShaderStage): GPUShaderStageFlags {
    let flags = 0
    if (ss & HgiShaderStageBits.HgiShaderStageVertex) flags |= GPUShaderStageFlags.VERTEX
    // The post-tessellation vertex function is the pipeline's vertex
    // function, as in hgiMetal (graphicsPipeline.mm:178-206).
    if (ss & HgiShaderStageBits.HgiShaderStagePostTessellationVertex) flags |= GPUShaderStageFlags.VERTEX
    if (ss & HgiShaderStageBits.HgiShaderStageFragment) flags |= GPUShaderStageFlags.FRAGMENT
    if (ss & HgiShaderStageBits.HgiShaderStageCompute) flags |= GPUShaderStageFlags.COMPUTE
    // The post-tessellation control function runs as a compute dispatch
    // (HgiWebGPUShaderGenerator).
    if (ss & HgiShaderStageBits.HgiShaderStagePostTessellationControl) flags |= GPUShaderStageFlags.COMPUTE
    return flags
  }

  /** GetBufferUsage (hgiVulkan/conversions.cpp:140-150, 501-513). Every buffer may be copied
   *  to and from, as hgiVulkan/buffer.cpp adds TRANSFER_SRC/DST. */
  static getBufferUsage(bu: HgiBufferUsage): GPUBufferUsageFlags {
    let flags = GPUBufferUsageFlags.COPY_SRC | GPUBufferUsageFlags.COPY_DST
    // Uniform buffers are also storage buffers: Storm allocates the
    // tessellation factors with uniform usage (hdSt/pipelineDrawBatch.cpp:
    // 590-596) and the post-tessellation control stage writes them as a
    // buffer (HgiWebGPUShaderGenerator, 'control').
    if (bu & HgiBufferUsageBits.HgiBufferUsageUniform) flags |= GPUBufferUsageFlags.UNIFORM | GPUBufferUsageFlags.STORAGE
    // Index and vertex buffers are also storage buffers: the emulated
    // post-tessellation vertex stage reads control-point indices and
    // attributes from them (HgiWebGPUPostTessVertexShaderSection).
    if (bu & HgiBufferUsageBits.HgiBufferUsageIndex32) flags |= GPUBufferUsageFlags.INDEX | GPUBufferUsageFlags.STORAGE
    if (bu & HgiBufferUsageBits.HgiBufferUsageVertex) flags |= GPUBufferUsageFlags.VERTEX | GPUBufferUsageFlags.STORAGE
    if (bu & HgiBufferUsageBits.HgiBufferUsageStorage) flags |= GPUBufferUsageFlags.STORAGE
    if (bu & HgiBufferUsageBits.HgiBufferUsageIndirect) flags |= GPUBufferUsageFlags.INDIRECT
    return flags
  }

  /** GetTextureUsage (hgiVulkan/conversions.cpp:118-127, 430-448). Every texture may be
   *  sampled and copied (hgiMetal/texture.mm:24-33 makes every texture
   *  shader-readable). */
  static getTextureUsage(tu: HgiTextureUsage): GPUTextureUsageFlags {
    let flags = GPUTextureUsageFlags.COPY_SRC | GPUTextureUsageFlags.COPY_DST |
      GPUTextureUsageFlags.TEXTURE_BINDING
    if (tu & (HgiTextureUsageBits.HgiTextureUsageBitsColorTarget |
        HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget |
        HgiTextureUsageBits.HgiTextureUsageBitsStencilTarget)) {
      flags |= GPUTextureUsageFlags.RENDER_ATTACHMENT
    }
    if (tu & HgiTextureUsageBits.HgiTextureUsageBitsShaderWrite) {
      flags |= GPUTextureUsageFlags.STORAGE_BINDING
    }
    return flags
  }

  /** Whether a texture format carries a stencil aspect. */
  static hasStencil(format: GPUTextureFormat): boolean {
    return format === 'depth32float-stencil8' || format === 'depth24plus-stencil8' ||
      format === 'stencil8'
  }

  /** Whether a texture format is a depth (or depth-stencil) format. */
  static isDepthFormat(format: GPUTextureFormat): boolean {
    return format.startsWith('depth') || format === 'stencil8'
  }
}
