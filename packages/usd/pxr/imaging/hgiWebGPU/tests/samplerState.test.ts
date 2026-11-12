// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/conversions.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The sampler state of HgiWebGPU's clamp-to-border emulation
// (src/samplerState.ts): which axes clamp to the border, the border colours
// of MTLSamplerBorderColor (hgiMetal/conversions.mm:384-392) and the filters.
// The sampling itself is checked in Safari against the reference build's
// renders (apps/usdview/scripts/asset-acceptance, the vehicle asset).
import { describe, expect, it } from 'vitest'
import {
  HgiBorderColor,
  HgiComponentMapping,
  HgiComponentSwizzle,
  HgiSamplerAddressMode,
  HgiSamplerDesc,
  HgiSamplerFilter,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUAcquireBorderFootprint,
  HgiWebGPUSamplerStateData,
  HgiWebGPUSamplerUsesBorder,
} from '../src/samplerState.ts'

describe('HgiWebGPUSamplerStateData', () => {
  it('packs border colour, border axes and linear filters', () => {
    const desc = new HgiSamplerDesc()
    desc.addressModeU = HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor
    desc.addressModeV = HgiSamplerAddressMode.HgiSamplerAddressModeRepeat
    desc.addressModeW = HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor
    desc.borderColor = HgiBorderColor.HgiBorderColorOpaqueWhite
    desc.minFilter = HgiSamplerFilter.HgiSamplerFilterNearest
    desc.magFilter = HgiSamplerFilter.HgiSamplerFilterLinear
    expect(Array.from(HgiWebGPUSamplerStateData(desc))).toEqual([1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0])
    expect(HgiWebGPUSamplerUsesBorder(desc)).toBe(true)
  })
  it('transparent black is the default border (hgi/sampler.h:70)', () => {
    const desc = new HgiSamplerDesc()
    expect(Array.from(HgiWebGPUSamplerStateData(desc)).slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(HgiWebGPUSamplerUsesBorder(desc)).toBe(false)
    desc.borderColor = HgiBorderColor.HgiBorderColorOpaqueBlack
    expect(Array.from(HgiWebGPUSamplerStateData(desc)).slice(0, 4)).toEqual([0, 0, 0, 1])
  })
  it('maps the border colour through the texture swizzle, as Metal swizzles border texels', () => {
    // A grey UV texture (hdSt/assetUvTextureCpuData.cpp:146-153) keeps alpha 1
    // at the border: the reference build's render of the ASWF
    // TextureFileFormatTests jpeg_grayscale_8-bit card is opaque along its
    // edges where transparent black would let the background through.
    const desc = new HgiSamplerDesc()
    desc.addressModeU = HgiSamplerAddressMode.HgiSamplerAddressModeClampToBorderColor
    const grey = new HgiComponentMapping()
    grey.r = grey.g = grey.b = HgiComponentSwizzle.HgiComponentSwizzleR
    grey.a = HgiComponentSwizzle.HgiComponentSwizzleOne
    expect(Array.from(HgiWebGPUSamplerStateData(desc, grey)).slice(0, 4)).toEqual([0, 0, 0, 1])
    desc.borderColor = HgiBorderColor.HgiBorderColorOpaqueWhite
    expect(Array.from(HgiWebGPUSamplerStateData(desc, grey)).slice(0, 4)).toEqual([1, 1, 1, 1])
    expect(Array.from(HgiWebGPUSamplerStateData(desc, new HgiComponentMapping())).slice(0, 4)).toEqual([1, 1, 1, 1])
  })
})

describe('HgiWebGPUAcquireBorderFootprint', () => {
  // A recording stand-in for the device: the footprint is plain data.
  function fakeDevice() {
    const created: GPUTextureDescriptor[] = []
    const textures: { destroyed: boolean }[] = []
    const writes: { level: number, data: Uint8Array, width: number, height: number }[] = []
    const device = {
      createTexture: (d: GPUTextureDescriptor) => {
        created.push(d)
        const texture = { destroyed: false, createView: () => ({ texture: created.length }), destroy() { texture.destroyed = true } }
        textures.push(texture)
        return texture
      },
      queue: {
        writeTexture: (dst: { mipLevel: number }, data: Uint8Array, _layout: unknown,
          size: { width: number, height: number }) => {
          writes.push({ level: dst.mipLevel, data, width: size.width, height: size.height })
        },
      },
    } as unknown as GPUDevice
    return { device, created, textures, writes }
  }
  it('has the texture\'s size and levels; each level marks the quarter a tap beyond each edge wraps to', () => {
    const { device, created, writes } = fakeDevice()
    HgiWebGPUAcquireBorderFootprint(device, 8, 4, 3)
    expect(created).toHaveLength(1)
    expect(created[0]!.size).toEqual({ width: 8, height: 4 })
    expect(created[0]!.mipLevelCount).toBe(3)
    expect(writes.map(w => [w.level, w.width, w.height])).toEqual([[0, 8, 4], [1, 4, 2], [2, 2, 1]])
    const texel = (w: typeof writes[number], i: number, j: number) =>
      Array.from(w.data.slice((j * w.width + i) * 4, (j * w.width + i) * 4 + 4))
    // Level 0 (8 x 4): columns 6-7 (R, taps left of u = 0 wrap there),
    // columns 0-1 (G), row 3 (B, taps below v = 0) and row 0 (A).
    expect(texel(writes[0]!, 7, 1)).toEqual([255, 0, 0, 0])
    expect(texel(writes[0]!, 1, 2)).toEqual([0, 255, 0, 0])
    expect(texel(writes[0]!, 3, 3)).toEqual([0, 0, 255, 0])
    expect(texel(writes[0]!, 4, 0)).toEqual([0, 0, 0, 255])
    expect(texel(writes[0]!, 3, 1)).toEqual([0, 0, 0, 0])
    // Level 2 (2 x 1): one column each for R and G; its one row is marked
    // for B and A (limitation (3) in samplerState.ts).
    expect(texel(writes[2]!, 0, 0)).toEqual([0, 255, 255, 255])
    expect(texel(writes[2]!, 1, 0)).toEqual([255, 0, 255, 255])
  })
  it('is shared by every texture of the same size and levels', () => {
    const { device, created } = fakeDevice()
    const a = HgiWebGPUAcquireBorderFootprint(device, 16, 16, 5)
    expect(HgiWebGPUAcquireBorderFootprint(device, 16, 16, 5).view).toBe(a.view)
    HgiWebGPUAcquireBorderFootprint(device, 16, 16, 1)
    expect(created).toHaveLength(2)
  })
  it('is destroyed with its last reference', () => {
    const { device, created, textures } = fakeDevice()
    const a = HgiWebGPUAcquireBorderFootprint(device, 16, 16, 5)
    const b = HgiWebGPUAcquireBorderFootprint(device, 16, 16, 5)
    a.release()
    a.release()
    expect(textures[0]!.destroyed).toBe(false)
    b.release()
    expect(textures[0]!.destroyed).toBe(true)
    HgiWebGPUAcquireBorderFootprint(device, 16, 16, 5)
    expect(created).toHaveLength(2)
    // The one-texel footprint of samplers without border addressing stays.
    HgiWebGPUAcquireBorderFootprint(device, 1, 1, 1, true).release()
    expect(textures[2]!.destroyed).toBe(false)
  })
})
