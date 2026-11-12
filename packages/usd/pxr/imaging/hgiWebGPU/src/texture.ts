// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/texture.h,
//  pxr/imaging/hgiMetal/texture.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUTexture. Modelled on pxr/imaging/hgiMetal/texture.{h,mm}: a
// texture created from an HgiTextureDesc owns its GPUTexture; one created
// from an HgiTextureViewDesc is a view of another texture's GPUTexture
// (hgiMetal/texture.mm:235-259).

import {
  HgiComponentSwizzle,
  HgiFormat,
  HgiGetDataSizeOfFormat,
  HgiGetMipInfos,
  HgiTexture,
  HgiTextureType,
  type HgiTextureDesc,
  type HgiTextureUsage,
  type HgiTextureViewDesc,
} from 'typescript-usd/hgi'
import { HgiWebGPUBytes } from './buffer.ts'
import { GPUTextureUsageFlags, HgiWebGPUConversions } from './conversions.ts'
import { HgiWebGPUDepthSamplingFormat, HgiWebGPU_EncodeDepthSampling } from './depthSampling.ts'
import { TF_CODING_ERROR, TF_WARN } from './diagnostic.ts'
import { HgiWebGPUAcquireBorderFootprint } from './samplerState.ts'

const _srgbPairs: Partial<Record<GPUTextureFormat, GPUTextureFormat>> = {
  'rgba8unorm': 'rgba8unorm-srgb',
  'rgba8unorm-srgb': 'rgba8unorm',
  'bc7-rgba-unorm': 'bc7-rgba-unorm-srgb',
  'bc7-rgba-unorm-srgb': 'bc7-rgba-unorm',
}

/** WebGPU has no texture swizzle (hgiMetal/texture.mm:57-70 sets
 *  MTLTextureSwizzleChannels from the component mapping). A texture whose
 *  component mapping is not the identity is allocated with the four-channel
 *  format of the same component type, and its initial data are expanded
 *  through the mapping as they are uploaded. The descriptor keeps the
 *  requested format, so resource sizes are those of upstream. Formats with
 *  an entry here can be swizzled. */
const _swizzleExpandedFormat: Partial<Record<GPUTextureFormat, { format: GPUTextureFormat, channels: number, bytes: number, one: number[] }>> = {
  'r8unorm': { format: 'rgba8unorm', channels: 1, bytes: 1, one: [255] },
  'rg8unorm': { format: 'rgba8unorm', channels: 2, bytes: 1, one: [255] },
  'rgba8unorm': { format: 'rgba8unorm', channels: 4, bytes: 1, one: [255] },
  'r8snorm': { format: 'rgba8snorm', channels: 1, bytes: 1, one: [127] },
  'r16float': { format: 'rgba16float', channels: 1, bytes: 2, one: [0x00, 0x3c] },
  'r32float': { format: 'rgba32float', channels: 1, bytes: 4, one: [0x00, 0x00, 0x80, 0x3f] },
}

/** Color-renderable, filterable formats GenerateMipMaps can render. */
const _mipmapRenderable = new Set<GPUTextureFormat>([
  'r8unorm', 'rg8unorm', 'rgba8unorm', 'rgba8unorm-srgb',
  'r16float', 'rg16float', 'rgba16float', 'r32float', 'rg32float', 'rgba32float',
])

export class HgiWebGPUTexture extends HgiTexture {
  private _textureId: GPUTexture | null = null
  private _textureView: GPUTextureView | null = null
  /** The descriptor of _textureView, for views of other dimensions. */
  private _viewDesc: GPUTextureViewDescriptor = {}
  private _storageView: GPUTextureView | null = null
  /** The float texture a depth texture is sampled through
   *  (depthSampling.ts). */
  private _depthSampling: GPUTexture | null = null
  private _depthSamplingView: GPUTextureView | null = null
  private readonly _ownsTexture: boolean
  private readonly _gpuFormat: GPUTextureFormat | null
  /** The component mapping applied at upload (see _swizzleExpandedFormat). */
  private _borderFootprint: { view: GPUTextureView, release(): void } | null = null
  private _swizzle: { channels: number, bytes: number, one: number[], mapping: HgiComponentSwizzle[] } | null = null

  /** hgiMetal/texture.mm:19-233 (from an HgiTextureDesc) and
   *  hgiMetal/texture.mm:235-259 (from an HgiTextureViewDesc). */
  constructor(device: GPUDevice, desc: HgiTextureDesc | HgiTextureViewDesc, external?: GPUTexture) {
    if (external) {
      // A texture the application owns (e.g. a canvas's current texture),
      // wrapped for HgiInterop presentation (HgiWebGPU.WrapExternalTexture).
      super(desc as HgiTextureDesc)
      this._ownsTexture = false
      this._gpuFormat = external.format
      this._textureId = external
      this._textureView = external.createView({ label: desc.debugName })
      return
    }
    if ('sourceTexture' in desc) {
      const src = desc.sourceTexture.Get() as HgiWebGPUTexture
      super(src.getDescriptor())
      this._ownsTexture = false
      const srcFormat = src.getGpuFormat()
      // A view may reinterpret an sRGB/linear pair; other formats keep the
      // source format, as WebGPU views cannot change it.
      const wanted = HgiWebGPUConversions.getPixelFormat(desc.format, src.getDescriptor().usage)
      const format = wanted && srcFormat && (wanted === srcFormat || _srgbPairs[srcFormat] === wanted)
        ? wanted : srcFormat
      this._gpuFormat = format
      this._textureId = src.getTextureId()
      if (this._textureId && format) {
        // Metal's view slices are the source's layers, the six faces of a
        // cubemap included (hgiMetal/texture.mm:243-252).
        this._viewDesc = {
          label: desc.debugName,
          format,
          dimension: HgiWebGPUConversions.getTextureViewDimension(src.getDescriptor().type),
          baseMipLevel: desc.sourceFirstMip,
          mipLevelCount: desc.mipLevels,
          baseArrayLayer: desc.sourceFirstLayer,
          arrayLayerCount: desc.layerCount,
        }
        this._textureView = this._textureId.createView(this._viewDesc)
      }

      // Update the texture descriptor to reflect the above
      this._descriptor.debugName = desc.debugName
      this._descriptor.format = desc.format
      this._descriptor.layerCount = desc.layerCount
      this._descriptor.mipLevels = desc.mipLevels
      return
    }

    super(desc)
    this._ownsTexture = true
    let format = HgiWebGPUConversions.getPixelFormat(desc.format, desc.usage)
    if (!format) {
      this._gpuFormat = null
      TF_CODING_ERROR(`HgiWebGPU: ${HgiFormat[desc.format]} has no WebGPU texture format ` +
        `(${desc.debugName || 'UNNAMED'})`)
      return
    }

    const m = desc.componentMapping
    if (m.r !== HgiComponentSwizzle.HgiComponentSwizzleR || m.g !== HgiComponentSwizzle.HgiComponentSwizzleG ||
        m.b !== HgiComponentSwizzle.HgiComponentSwizzleB || m.a !== HgiComponentSwizzle.HgiComponentSwizzleA) {
      // hgiMetal/texture.mm:57-70 applies the component mapping as a texture
      // swizzle; WebGPU has none, so the texels are expanded (see
      // _swizzleExpandedFormat).
      const expanded = _swizzleExpandedFormat[format]
      if (expanded) {
        this._swizzle = { ...expanded, mapping: [m.r, m.g, m.b, m.a] }
        format = expanded.format
      } else {
        TF_WARN(`HgiWebGPU: texture component swizzle of ${format} is not supported; ` +
          `'${desc.debugName || 'UNNAMED'}' samples unswizzled`)
      }
    }
    this._gpuFormat = format

    const [width, height, depth] = desc.dimensions.data as [number, number, number]
    // A Metal cubemap has six slices and an array length of 1
    // (hgiMetal/texture.mm:81-83); Storm's cubemaps give layerCount 6
    // (hdSt/domeLightComputations.cpp:115-123).
    const layers = desc.type === HgiTextureType.HgiTextureTypeCubemap
      ? 6
      : desc.type === HgiTextureType.HgiTextureType3D ? Math.max(depth, 1) : Math.max(desc.layerCount, 1)
    const pair = _srgbPairs[format]

    this._textureId = device.createTexture({
      label: desc.debugName,
      size: { width: Math.max(width, 1), height: Math.max(height, 1), depthOrArrayLayers: layers },
      format,
      dimension: HgiWebGPUConversions.getTextureDimension(desc.type),
      mipLevelCount: Math.max(desc.mipLevels, 1),
      // hgiMetal/texture.mm:86-89
      sampleCount: desc.sampleCount > 1 ? desc.sampleCount : 1,
      usage: this._getUsage(desc, format),
      ...(pair ? { viewFormats: [pair] } : {}),
    })
    this._textureView = this._textureId.createView({
      label: desc.debugName,
      dimension: HgiWebGPUConversions.getTextureViewDimension(desc.type),
    })

    if (desc.initialData && desc.pixelsByteSize > 0) {
      this._uploadInitialData(device, desc, layers)
    }

    this._descriptor.initialData = null
  }

  /** hgiMetal/texture.mm:24-35. A multisampled texture cannot be a storage
   *  texture; a mipmapped texture of a renderable format may be rendered to
   *  so HgiWebGPUBlitCmds::GenerateMipMaps can fill its levels. */
  private _getUsage(desc: HgiTextureDesc, format: GPUTextureFormat): GPUTextureUsageFlags {
    let usage = HgiWebGPUConversions.getTextureUsage(desc.usage)
    if (desc.sampleCount > 1) usage &= ~GPUTextureUsageFlags.STORAGE_BINDING
    if (desc.mipLevels > 1 && _mipmapRenderable.has(format)) {
      usage |= GPUTextureUsageFlags.RENDER_ATTACHMENT
    }
    return usage
  }

  /** hgiMetal/texture.mm:93-226: upload each available mip of the initial
   *  data. WebGPU writes through the queue rather than a staging texture. */
  private _uploadInitialData(device: GPUDevice, desc: HgiTextureDesc, layers: number): void {
    const block = { blockWidth: 1, blockHeight: 1 }
    const bytesPerBlock = HgiGetDataSizeOfFormat(desc.format, block)
    const mipInfos = HgiGetMipInfos(desc.format, desc.dimensions, desc.layerCount, desc.pixelsByteSize)
    const mipLevels = Math.min(mipInfos.length, desc.mipLevels)
    const data = HgiWebGPUBytes(desc.initialData!)
    const is3D = desc.type === HgiTextureType.HgiTextureType3D

    for (let mip = 0; mip < mipLevels; mip++) {
      const mipInfo = mipInfos[mip]!
      const [w, h, d] = mipInfo.dimensions.data as [number, number, number]
      const blocksWide = Math.ceil(w / block.blockWidth)
      const blocksHigh = Math.ceil(h / block.blockHeight)
      const bytesPerRow = blocksWide * bytesPerBlock
      const mipLayers = is3D ? Math.max(d, 1) : layers
      const byteSize = Math.min(mipInfo.byteSizePerLayer * (is3D ? 1 : layers),
        data.byteLength - mipInfo.byteOffset)
      if (byteSize <= 0) break
      let texels = data.subarray(mipInfo.byteOffset, mipInfo.byteOffset + byteSize) as Uint8Array<ArrayBuffer>
      let rowBytes = bytesPerRow
      if (this._swizzle) {
        texels = this._Swizzle(texels)
        rowBytes = blocksWide * 4 * this._swizzle.bytes
      }
      device.queue.writeTexture(
        { texture: this._textureId!, mipLevel: mip },
        texels,
        { offset: 0, bytesPerRow: rowBytes, rowsPerImage: blocksHigh },
        {
          width: blocksWide * block.blockWidth,
          height: blocksHigh * block.blockHeight,
          depthOrArrayLayers: mipLayers,
        })
    }
  }

  /** Expands texels of `_swizzle.channels` components to four through the
   *  component mapping (see _swizzleExpandedFormat). */
  private _Swizzle(src: Uint8Array): Uint8Array<ArrayBuffer> {
    const { channels, bytes, one, mapping } = this._swizzle!
    const texelBytes = channels * bytes
    const count = Math.floor(src.byteLength / texelBytes)
    const dst = new Uint8Array(count * 4 * bytes)
    // One pass per destination component: its source component's byte
    // offset in the texel, or a constant (the zero of a fresh array is
    // left as is).
    for (let c = 0; c < 4; c++) {
      const sw = mapping[c]!
      let constant: number[] | null = null
      let offset = -1
      if (sw === HgiComponentSwizzle.HgiComponentSwizzleZero) continue
      if (sw === HgiComponentSwizzle.HgiComponentSwizzleOne) {
        constant = one
      } else {
        const component = sw - HgiComponentSwizzle.HgiComponentSwizzleR
        if (component >= channels) {
          // A missing component reads as 0 (G, B) or 1 (A) when sampled.
          if (component !== 3) continue
          constant = one
        } else {
          offset = component * bytes
        }
      }
      const step = 4 * bytes
      if (constant) {
        for (let b = 0; b < bytes; b++) {
          const v = constant[b] ?? 0
          if (v === 0) continue
          for (let d = c * bytes + b; d < dst.length; d += step) dst[d] = v
        }
        continue
      }
      for (let b = 0; b < bytes; b++) {
        for (let i = 0, si = offset + b, d = c * bytes + b; i < count; i++, si += texelBytes, d += step) dst[d] = src[si]!
      }
    }
    return dst
  }

  /** hgiMetal/texture.mm:261-267 */
  _destroy(): void {
    this._borderFootprint?.release()
    this._borderFootprint = null
    if (this._ownsTexture) this._textureId?.destroy()
    this._depthSampling?.destroy()
    this._depthSampling = null
    this._depthSamplingView = null
    this._textureId = null
    this._textureView = null
    this._storageView = null
  }

  /** hgiMetal/texture.mm:269-273 */
  getByteSizeOfResource(): number {
    return HgiTexture._getByteSizeOfResource(this._descriptor)
  }

  /** hgiMetal/texture.mm:275-279 */
  getRawResource(): GPUTexture | null {
    return this._textureId
  }

  /** hgiMetal/texture.mm:281-285 */
  getTextureId(): GPUTexture | null {
    return this._textureId
  }

  /** The view bound for sampling and rendering (Metal binds the texture
   *  object itself). */
  getTextureView(): GPUTextureView | null {
    return this._textureView
  }

  /** Level 0's width and height and the level count of the sampled view
   *  (GetTextureView), for the clamp-to-border emulation's footprint texture
   *  (samplerState.ts). */
  getSampledViewExtent(): { width: number, height: number, levels: number } | null {
    const t = this._textureId
    if (!t) return null
    const base = this._viewDesc?.baseMipLevel ?? 0
    const levels = this._viewDesc?.mipLevelCount ?? t.mipLevelCount - base
    return { width: Math.max(t.width >> base, 1), height: Math.max(t.height >> base, 1),
      levels: Math.max(Math.min(levels, t.mipLevelCount - base), 1) }
  }

  /** The footprint texture of this texture's sampled view, for the
   *  clamp-to-border emulation (samplerState.ts): acquired on first use and
   *  released when the texture is destroyed. */
  getBorderFootprintView(device: GPUDevice): GPUTextureView | null {
    if (!this._borderFootprint) {
      const extent = this.getSampledViewExtent()
      if (!extent) return null
      this._borderFootprint = HgiWebGPUAcquireBorderFootprint(device, extent.width, extent.height, extent.levels)
    }
    return this._borderFootprint.view
  }

  /** The view bound as a storage texture. WGSL has no cube storage
   *  textures (storage textures are 1d, 2d, 2d_array and 3d), so a cubemap
   *  is written through a 2d-array view of its faces, the face being the
   *  layer, which the generator's HgiSet_ accessor writes
   *  (HgiWebGPUShaderGenerator). Other textures use their view. */
  getStorageTextureView(): GPUTextureView | null {
    if (!this._textureId || this._descriptor.type !== HgiTextureType.HgiTextureTypeCubemap) {
      return this._textureView
    }
    this._storageView ??= this._textureId.createView({ ...this._viewDesc, dimension: '2d-array' })
    return this._storageView
  }

  /** Whether a binding that does not declare a depth texture samples this
   *  texture through GetShaderReadView's float copy (depthSampling.ts). */
  isSampledThroughDepthCopy(): boolean {
    return !!this._gpuFormat && HgiWebGPUConversions.isDepthFormat(this._gpuFormat) &&
      this._gpuFormat !== 'stencil8'
  }

  /** The view a texture binding that does not declare a depth texture
   *  samples: the float copy of a depth texture's depth (depthSampling.ts),
   *  which EncodeShaderRead fills, else GetTextureView. */
  getShaderReadView(device: GPUDevice): GPUTextureView | null {
    if (!this.isSampledThroughDepthCopy() || !this._textureId) return this._textureView
    if (!this._depthSamplingView) {
      const t = this._textureId
      if (t.dimension !== '2d' || t.sampleCount !== 1) {
        TF_CODING_ERROR(`HgiWebGPU: depth texture '${this._descriptor.debugName || 'UNNAMED'}' ` +
          'is sampled as a float texture; only single-sampled 2d depth textures can be')
        return null
      }
      this._depthSampling = this._createDepthSamplingTexture(device, t)
      this._depthSamplingView = this._depthSampling.createView({ label: this._descriptor.debugName })
    }
    return this._depthSamplingView
  }

  /** Records the copy of the depth into the GetShaderReadView texture on
   *  `encoder` (outside any pass). */
  encodeShaderRead(device: GPUDevice, encoder: GPUCommandEncoder): void {
    if (!this._textureId || !this._depthSampling) return
    HgiWebGPU_EncodeDepthSampling(device, encoder, this._textureId, this._depthSampling)
  }

  private _createDepthSamplingTexture(device: GPUDevice, t: GPUTexture): GPUTexture {
    return device.createTexture({
      label: `${this._descriptor.debugName} (depth sampling)`,
      size: { width: t.width, height: t.height, depthOrArrayLayers: 1 },
      format: HgiWebGPUDepthSamplingFormat,
      usage: GPUTextureUsageFlags.TEXTURE_BINDING | GPUTextureUsageFlags.STORAGE_BINDING |
        GPUTextureUsageFlags.COPY_SRC,
    })
  }

  getGpuFormat(): GPUTextureFormat | null {
    return this._gpuFormat
  }

  /** hgiMetal/texture.mm:287-291: WebGPU tracks layouts itself. */
  submitLayoutChange(_newLayout: HgiTextureUsage): HgiTextureUsage {
    return 0
  }
}
