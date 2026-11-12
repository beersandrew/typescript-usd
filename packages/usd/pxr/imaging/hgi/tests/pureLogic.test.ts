// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/testenv/testHgiCommand.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The pure-logic parts of pxr/imaging/hgi against values captured from the
// OpenUSD 26.11.1 build (fixtures/pureLogic). Upstream registers
// no hgi test that runs without a GPU (pxr/imaging/hgi/CMakeLists.txt:50-70
// builds testHgiCommand only, skipped on macOS); the GPU half of
// testHgiCommand runs in Safari through hgiWebGPU.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Vec2f as GfVec2f, Vec3i as GfVec3i, Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  HgiAttachmentDesc,
  HgiAttachmentLoadOp,
  HgiBindingType,
  HgiBlendFactor,
  HgiBorderColor,
  HgiBufferBindDesc,
  HgiBufferDesc,
  HgiCmds,
  HgiColorMaskBits,
  HgiCompareFunction,
  HgiComponentSwizzle,
  HgiComputeCmdsDesc,
  HgiDepthStencilState,
  HgiDeviceCapabilitiesBits,
  HgiFormat,
  HgiGetComponentBaseFormat,
  HgiGetComponentCount,
  HgiGetDataSize,
  HgiGetDataSizeOfFormat,
  HgiGetMipInfos,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiGraphicsShaderConstantsDesc,
  HgiInterpolationType,
  HgiIsCompressed,
  HgiIsFloatFormat,
  HgiMultiSampleState,
  HgiRasterizationState,
  HgiSampleCount,
  HgiSamplerDesc,
  HgiShaderFunctionAddArrayOfTextures,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddGlobalVariable,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionAddWritableBuffer,
  HgiShaderFunctionAddWritableTexture,
  HgiShaderFunctionBufferDesc,
  HgiShaderFunctionDesc,
  HgiShaderFunctionGeometryDesc,
  HgiShaderFunctionParamBlockDesc,
  HgiShaderFunctionParamBlockDescMember,
  HgiShaderFunctionParamDesc,
  HgiShaderFunctionTessellationDesc,
  HgiShaderFunctionTextureDesc,
  HgiShaderGenerator,
  HgiShaderKeywordTokens,
  HgiShaderSection,
  HgiShaderStageBits,
  HgiShaderTextureType,
  HgiStencilState,
  HgiStringStream,
  HgiTessellationState,
  HgiTexture,
  HgiTextureBindDesc,
  HgiTextureDesc,
  HgiTextureUsageBits,
  HgiTextureViewDesc,
  HgiTokens,
  HgiVertexAttributeDesc,
  HgiVertexBufferDesc,
  type HgiTextureUsage,
} from '../src/index.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const native = JSON.parse(readFileSync(path.join(here, 'fixtures/pureLogic/expected.json'), 'utf8')).payload

describe('types.cpp format tables', () => {
  it('HgiFormat enumerates the upstream formats in order', () => {
    expect(HgiFormat.HgiFormatCount).toBe(native.formatCount)
    for (const f of native.formats) expect([f.name, HgiFormat[f.name as keyof typeof HgiFormat]]).toEqual([f.name, f.value])
  })

  for (const f of native.formats) {
    it(`${f.name}: component count, size, block, compression, base format`, () => {
      const block = { blockWidth: 0, blockHeight: 0 }
      expect({
        componentCount: HgiGetComponentCount(f.value),
        dataSize: HgiGetDataSizeOfFormat(f.value, block),
        blockWidth: block.blockWidth,
        blockHeight: block.blockHeight,
        isCompressed: HgiIsCompressed(f.value),
        baseFormat: HgiGetComponentBaseFormat(f.value),
        isFloat: HgiIsFloatFormat(f.value),
      }).toEqual({
        componentCount: f.componentCount, dataSize: f.dataSize, blockWidth: f.blockWidth,
        blockHeight: f.blockHeight, isCompressed: f.isCompressed, baseFormat: f.baseFormat,
        isFloat: f.isFloat,
      })
    })
  }

  class TestTexture extends HgiTexture {
    static byteSize(desc: HgiTextureDesc): number { return HgiTexture._getByteSizeOfResource(desc) }
    getByteSizeOfResource(): number { return 0 }
    getRawResource(): unknown { return null }
    submitLayoutChange(u: HgiTextureUsage): HgiTextureUsage { return u }
  }

  for (const c of native.sizes) {
    it(`${HgiFormat[c.format]} ${c.dimensions.join('x')} x${c.layerCount}: data size, mips, texture byte size`, () => {
      const dims = new GfVec3i(c.dimensions[0], c.dimensions[1], c.dimensions[2])
      expect(HgiGetDataSize(c.format, dims)).toBe(c.dataSize)
      const mips = HgiGetMipInfos(c.format, dims, c.layerCount).map(m => ({
        byteOffset: m.byteOffset, dimensions: [...m.dimensions.data], byteSizePerLayer: m.byteSizePerLayer,
      }))
      expect(mips).toEqual(c.mips)
      expect(HgiGetMipInfos(c.format, dims, c.layerCount, 1).length).toBe(c.truncatedMipCount)
      const td = new HgiTextureDesc()
      td.format = c.format
      td.dimensions = dims
      td.layerCount = c.layerCount
      td.mipLevels = c.mipLevels
      expect(TestTexture.byteSize(td)).toBe(c.textureByteSize)
    })
  }
})

describe('enums.h values defined by expressions', () => {
  it('match the native build', () => {
    expect({
      HgiShaderStageAllGraphics: HgiShaderStageBits.HgiShaderStageAllGraphics,
      HgiShaderStageAll: HgiShaderStageBits.HgiShaderStageAll,
      HgiSampleCountEnd: HgiSampleCount.HgiSampleCountEnd,
      HgiBlendFactorCount: HgiBlendFactor.HgiBlendFactorCount,
      HgiDeviceCapabilitiesForceEarlyFragmentTest:
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesForceEarlyFragmentTest,
    }).toEqual(native.enums)
  })
})

describe('descriptor defaults', () => {
  const d = native.defaults
  const b = (v: boolean) => v
  it('HgiAttachmentDesc streams as upstream (attachmentDesc.cpp:40-61)', () => {
    expect(new HgiAttachmentDesc().toString()).toBe(d.attachment)
  })
  it('HgiBufferDesc', () => {
    const v = new HgiBufferDesc()
    expect({ usage: v.usage, byteSize: v.byteSize, vertexStride: v.vertexStride }).toEqual(d.buffer)
  })
  it('HgiTextureDesc', () => {
    const v = new HgiTextureDesc()
    const m = v.componentMapping
    expect({
      usage: v.usage, format: v.format, swizzle: [m.r, m.g, m.b, m.a], type: v.type,
      dimensions: [...v.dimensions.data], layerCount: v.layerCount, mipLevels: v.mipLevels,
      sampleCount: v.sampleCount, pixelsByteSize: v.pixelsByteSize,
    }).toEqual(d.texture)
  })
  it('HgiTextureViewDesc', () => {
    const v = new HgiTextureViewDesc()
    expect({
      format: v.format, layerCount: v.layerCount, mipLevels: v.mipLevels,
      sourceFirstLayer: v.sourceFirstLayer, sourceFirstMip: v.sourceFirstMip,
    }).toEqual(d.textureView)
  })
  it('HgiSamplerDesc', () => {
    const v = new HgiSamplerDesc()
    expect({
      magFilter: v.magFilter, minFilter: v.minFilter, mipFilter: v.mipFilter,
      addressModeU: v.addressModeU, addressModeV: v.addressModeV, addressModeW: v.addressModeW,
      borderColor: v.borderColor, enableCompare: b(v.enableCompare),
      compareFunction: v.compareFunction, maxAnisotropy: v.maxAnisotropy,
    }).toEqual(d.sampler)
  })
  it('HgiBufferBindDesc and HgiTextureBindDesc', () => {
    const bb = new HgiBufferBindDesc()
    const tb = new HgiTextureBindDesc()
    expect({ bindingIndex: bb.bindingIndex, stageUsage: bb.stageUsage, writable: bb.writable })
      .toEqual(d.bufferBind)
    expect({
      resourceType: tb.resourceType, bindingIndex: tb.bindingIndex,
      stageUsage: tb.stageUsage, writable: tb.writable,
    }).toEqual(d.textureBind)
  })
  it('graphics pipeline sub-descriptors', () => {
    const va = new HgiVertexAttributeDesc()
    const vb = new HgiVertexBufferDesc()
    const ms = new HgiMultiSampleState()
    const rs = new HgiRasterizationState()
    const st = new HgiStencilState()
    const ds = new HgiDepthStencilState()
    const gc = new HgiGraphicsShaderConstantsDesc()
    const ts = new HgiTessellationState()
    const gp = new HgiGraphicsPipelineDesc()
    expect({ format: va.format, offset: va.offset, shaderBindLocation: va.shaderBindLocation })
      .toEqual(d.vertexAttribute)
    expect({
      bindingIndex: vb.bindingIndex, vertexStepFunction: vb.vertexStepFunction,
      vertexStride: vb.vertexStride,
    }).toEqual(d.vertexBuffer)
    expect({
      multiSampleEnable: ms.multiSampleEnable, alphaToCoverageEnable: ms.alphaToCoverageEnable,
      alphaToOneEnable: ms.alphaToOneEnable, sampleCount: ms.sampleCount,
    }).toEqual(d.multiSample)
    expect({
      polygonMode: rs.polygonMode, lineWidth: rs.lineWidth, cullMode: rs.cullMode,
      winding: rs.winding, rasterizerEnabled: rs.rasterizerEnabled,
      depthClampEnabled: rs.depthClampEnabled, depthRange: rs.depthRange.toString(),
      conservativeRaster: rs.conservativeRaster, numClipDistances: rs.numClipDistances,
    }).toEqual(d.rasterization)
    expect({
      compareFn: st.compareFn, referenceValue: st.referenceValue, stencilFailOp: st.stencilFailOp,
      depthFailOp: st.depthFailOp, depthStencilPassOp: st.depthStencilPassOp,
      readMask: st.readMask, writeMask: st.writeMask,
    }).toEqual(d.stencil)
    expect({
      depthTestEnabled: ds.depthTestEnabled, depthWriteEnabled: ds.depthWriteEnabled,
      depthCompareFn: ds.depthCompareFn, depthBiasEnabled: ds.depthBiasEnabled,
      depthBiasConstantFactor: ds.depthBiasConstantFactor,
      depthBiasSlopeFactor: ds.depthBiasSlopeFactor, stencilTestEnabled: ds.stencilTestEnabled,
    }).toEqual(d.depthStencil)
    expect({ byteSize: gc.byteSize, stageUsage: gc.stageUsage }).toEqual(d.graphicsShaderConstants)
    expect({
      patchType: ts.patchType, primitiveIndexSize: ts.primitiveIndexSize,
      tessFactorMode: ts.tessFactorMode,
    }).toEqual(d.tessellationState)
    expect({ primitiveType: gp.primitiveType, resolveAttachments: gp.resolveAttachments })
      .toEqual(d.graphicsPipeline)
    expect({ dispatchMethod: new HgiComputeCmdsDesc().dispatchMethod }).toEqual(d.computeCmds)
  })
  it('shader function descriptors', () => {
    const ft = new HgiShaderFunctionTextureDesc()
    const fb = new HgiShaderFunctionBufferDesc()
    const fp = new HgiShaderFunctionParamDesc()
    const fpb = new HgiShaderFunctionParamBlockDesc()
    const ftd = new HgiShaderFunctionTessellationDesc()
    const fg = new HgiShaderFunctionGeometryDesc()
    const fd = new HgiShaderFunctionDesc()
    expect({
      dimensions: ft.dimensions, format: ft.format, textureType: ft.textureType,
      bindIndex: ft.bindIndex, arraySize: ft.arraySize, writable: ft.writable,
    }).toEqual(d.shaderTexture)
    expect({ bindIndex: fb.bindIndex, arraySize: fb.arraySize, binding: fb.binding, writable: fb.writable })
      .toEqual(d.shaderBuffer)
    expect({
      location: fp.location, interstageSlot: fp.interstageSlot, interpolation: fp.interpolation,
      sampling: fp.sampling, storage: fp.storage,
    }).toEqual(d.shaderParam)
    expect({ interstageSlot: fpb.interstageSlot }).toEqual(d.shaderParamBlock)
    expect({
      patchType: ftd.patchType, spacing: ftd.spacing, ordering: ftd.ordering,
      numVertsPerPatchIn: ftd.numVertsPerPatchIn, numVertsPerPatchOut: ftd.numVertsPerPatchOut,
    }).toEqual(d.shaderTessellation)
    expect({
      inPrimitiveType: fg.inPrimitiveType, outPrimitiveType: fg.outPrimitiveType,
      outMaxVertices: fg.outMaxVertices,
    }).toEqual(d.shaderGeometry)
    expect({
      shaderStage: fd.shaderStage, computeLocalSize: [...fd.computeDescriptor.localSize.data],
      earlyFragmentTests: fd.fragmentDescriptor.earlyFragmentTests,
    }).toEqual(d.shaderFunction)
  })
})

describe('operator== notices exactly the upstream fields', () => {
  const data = new Int32Array([1, 2])
  const cases: Record<string, () => boolean> = {
    'buffer.initialData': () => { const a = new HgiBufferDesc(), b = new HgiBufferDesc(); b.initialData = data; return a.equals(b) },
    'buffer.vertexStride': () => { const a = new HgiBufferDesc(), b = new HgiBufferDesc(); b.vertexStride = 12; return a.equals(b) },
    'buffer.byteSize': () => { const a = new HgiBufferDesc(), b = new HgiBufferDesc(); b.byteSize = 4; return a.equals(b) },
    'texture.layerCount': () => { const a = new HgiTextureDesc(), b = new HgiTextureDesc(); b.layerCount = 3; return a.equals(b) },
    'texture.mipLevels': () => { const a = new HgiTextureDesc(), b = new HgiTextureDesc(); b.mipLevels = 3; return a.equals(b) },
    'texture.initialData': () => { const a = new HgiTextureDesc(), b = new HgiTextureDesc(); b.initialData = data; return a.equals(b) },
    'texture.componentMapping': () => {
      const a = new HgiTextureDesc(), b = a.clone()
      b.componentMapping.a = HgiComponentSwizzle.HgiComponentSwizzleOne
      return a.equals(b)
    },
    'sampler.borderColor': () => { const a = new HgiSamplerDesc(), b = new HgiSamplerDesc(); b.borderColor = HgiBorderColor.HgiBorderColorOpaqueWhite; return a.equals(b) },
    'sampler.enableCompare': () => { const a = new HgiSamplerDesc(), b = new HgiSamplerDesc(); b.enableCompare = true; return a.equals(b) },
    'sampler.compareFunction': () => { const a = new HgiSamplerDesc(), b = new HgiSamplerDesc(); b.compareFunction = HgiCompareFunction.HgiCompareFunctionLess; return a.equals(b) },
    'sampler.maxAnisotropy': () => { const a = new HgiSamplerDesc(), b = new HgiSamplerDesc(); b.maxAnisotropy = 4; return a.equals(b) },
    'shaderTexture.bindIndex': () => { const a = new HgiShaderFunctionTextureDesc(), b = new HgiShaderFunctionTextureDesc(); b.bindIndex = 3; return a.equals(b) },
    'paramBlockMember.interpolation': () => {
      const a = new HgiShaderFunctionParamBlockDescMember(), b = new HgiShaderFunctionParamBlockDescMember()
      b.interpolation = HgiInterpolationType.HgiInterpolationFlat
      return a.equals(b)
    },
    'shaderFunction.shaderCode': () => { const a = new HgiShaderFunctionDesc(), b = a.clone(); b.shaderCode = 'x'; return a.equals(b) },
    'shaderFunction.buffers': () => {
      const a = new HgiShaderFunctionDesc(), b = a.clone()
      HgiShaderFunctionAddBuffer(b, 'b', 'float', 0, HgiBindingType.HgiBindingTypeValue)
      return a.equals(b)
    },
    'shaderFunction.stageGlobalMembers': () => {
      const a = new HgiShaderFunctionDesc(), b = a.clone()
      HgiShaderFunctionAddGlobalVariable(b, 'g', 'float', '')
      return a.equals(b)
    },
    'shaderFunction.stageInputBlocks': () => {
      const a = new HgiShaderFunctionDesc(), b = a.clone()
      b.stageInputBlocks.push(new HgiShaderFunctionParamBlockDesc())
      return a.equals(b)
    },
    'shaderFunction.stageInputs': () => {
      const a = new HgiShaderFunctionDesc(), b = a.clone()
      HgiShaderFunctionAddStageInput(b, 'i', 'float')
      return a.equals(b)
    },
    'graphicsPipeline.tessellationState': () => {
      const a = new HgiGraphicsPipelineDesc(), b = new HgiGraphicsPipelineDesc()
      b.tessellationState.primitiveIndexSize = 4
      return a.equals(b)
    },
    'graphicsPipeline.depthRange': () => {
      const a = new HgiGraphicsPipelineDesc(), b = new HgiGraphicsPipelineDesc()
      b.rasterizationState.depthRange = new GfVec2f(0.5, 1)
      return a.equals(b)
    },
    'graphicsPipeline.stencilBack': () => {
      const a = new HgiGraphicsPipelineDesc(), b = new HgiGraphicsPipelineDesc()
      b.depthState.stencilBack.readMask = 1
      return a.equals(b)
    },
    'attachment.clearValue': () => {
      const a = new HgiAttachmentDesc(), b = new HgiAttachmentDesc()
      b.clearValue = new GfVec4f(1, 0, 0, 1)
      return a.equals(b)
    },
    'bufferBind.sizes': () => { const a = new HgiBufferBindDesc(), b = new HgiBufferBindDesc(); b.sizes.push(16); return a.equals(b) },
  }
  it('covers every captured case', () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(native.equality).sort())
  })
  for (const [name, expected] of Object.entries(native.equality)) {
    it(name, () => { expect(cases[name]!()).toBe(expected) })
  }
})

describe('operator<<', () => {
  const a = new HgiAttachmentDesc()
  a.format = HgiFormat.HgiFormatFloat32Vec4
  a.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
  a.loadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpClear
  a.clearValue = new GfVec4f(0.25, 0.5, 1.0, 0.0)
  a.blendEnabled = true
  a.srcColorBlendFactor = HgiBlendFactor.HgiBlendFactorSrcAlpha
  a.dstColorBlendFactor = HgiBlendFactor.HgiBlendFactorOneMinusSrcAlpha
  a.colorMask = HgiColorMaskBits.HgiColorMaskRed | HgiColorMaskBits.HgiColorMaskAlpha
  it('HgiAttachmentDesc', () => { expect(a.toString()).toBe(native.streams.attachment) })
  it('HgiGraphicsCmdsDesc', () => {
    const g = new HgiGraphicsCmdsDesc()
    const g2 = new HgiGraphicsCmdsDesc()
    g2.colorAttachmentDescs.push(a)
    expect(g.toString()).toBe(native.streams.graphicsCmdsEmpty)
    expect(g2.toString()).toBe(native.streams.graphicsCmdsOneAttachment)
    expect([g.hasAttachments(), g2.hasAttachments()]).toEqual(native.streams.graphicsCmdsHasAttachments)
  })
})

describe('HgiShaderFunctionAdd* (shaderFunctionDesc.cpp:268-459)', () => {
  const d = new HgiShaderFunctionDesc()
  HgiShaderFunctionAddTexture(d, 't0')
  HgiShaderFunctionAddArrayOfTextures(d, 't1', 4, 2, 3, HgiFormat.HgiFormatInt32,
    HgiShaderTextureType.HgiShaderTextureTypeArrayTexture)
  HgiShaderFunctionAddWritableTexture(d, 't2', 1)
  HgiShaderFunctionAddBuffer(d, 'b0', 'vec4', 3, HgiBindingType.HgiBindingTypeUniformArray, 8)
  HgiShaderFunctionAddWritableBuffer(d, 'b1', 'int', 5)
  HgiShaderFunctionAddConstantParam(d, 'c0', 'mat4', 'role')
  HgiShaderFunctionAddStageInput(d, 'i0', 'vec3', 'hdPosition')
  HgiShaderFunctionAddGlobalVariable(d, 'g0', 'float', '4')
  HgiShaderFunctionAddStageOutput(d, 'o0', 'vec4', 'color', '2')
  HgiShaderFunctionAddStageOutput(d, 'o1', 'vec2', 7)
  const params = (v: HgiShaderFunctionParamDesc[]) =>
    v.map(p => [p.nameInShader, p.type, p.location, p.role, p.arraySize])
  it('fill the descriptor as upstream', () => {
    expect({
      textures: d.textures.map(t => [t.nameInShader, t.bindIndex, t.dimensions, t.format,
        t.textureType, t.arraySize, t.writable]),
      buffers: d.buffers.map(b => [b.nameInShader, b.type, b.bindIndex, b.arraySize, b.binding, b.writable]),
      constantParams: params(d.constantParams),
      stageInputs: params(d.stageInputs),
      stageGlobalMembers: params(d.stageGlobalMembers),
      stageOutputs: params(d.stageOutputs),
    }).toEqual(native.addHelpers)
  })
})

describe('HgiShaderSection and HgiShaderGenerator', () => {
  class TestSection extends HgiShaderSection {
    constructor(id: string, arraySize: string, blockInstance: string) {
      super(id, [{ identifier: 'location', index: '2' }], '', arraySize, blockInstance)
    }
    override writeType(ss: HgiStringStream): void { ss.write('vec3') }
  }
  it('HgiShaderSection writers (shaderSection.cpp:28-69)', () => {
    const plain = new TestSection('member', '', '')
    const arr = new TestSection('member', 'N', 'inst')
    const w = (f: (ss: HgiStringStream) => void) => { const ss = new HgiStringStream(); f(ss); return ss.str() }
    const attr = arr.getAttributes()[0]!
    expect({
      declaration: w(ss => plain.writeDeclaration(ss)),
      arrayDeclaration: w(ss => arr.writeDeclaration(ss)),
      parameter: w(ss => arr.writeParameter(ss)),
      blockInstance: w(ss => arr.writeBlockInstanceIdentifier(ss)),
      emptyArraySize: w(ss => plain.writeArraySize(ss)),
      hasBlockInstance: [plain.hasBlockInstanceIdentifier(), arr.hasBlockInstanceIdentifier()],
      attributes: `${attr.identifier}=${attr.index}`,
    }).toEqual(native.shaderSection)
  })

  class TestGenerator extends HgiShaderGenerator {
    constructor(d: HgiShaderFunctionDesc) { super(d) }
    protected _execute(ss: HgiStringStream): void {
      ss.write('[', this._getShaderStage(), ']', this._getShaderCodeDeclarations(), '|', this._getShaderCode())
    }
  }
  it('HgiShaderGenerator::Execute writes locally or into generatedShaderCodeOut', () => {
    const d = new HgiShaderFunctionDesc()
    d.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    d.shaderCodeDeclarations = 'decl;'
    d.shaderCode = 'code;'
    const local = new TestGenerator(d)
    local.Execute()
    const d2 = d.clone()
    d2.shaderCodeDeclarations = null
    const out = { value: '' }
    d2.generatedShaderCodeOut = out
    const boxed = new TestGenerator(d2)
    boxed.Execute()
    expect({ local: local.getGeneratedShaderCode(), boxed: out.value, boxedReturn: boxed.getGeneratedShaderCode() })
      .toEqual(native.generator)
  })
})

describe('cmds.h debug colors and tokens.h', () => {
  it('HgiCmds debug colors (float components)', () => {
    const colors = [HgiCmds.s_computeDebugColor, HgiCmds.s_graphicsDebugColor,
      HgiCmds.s_blitDebugColor, HgiCmds.s_markerDebugColor]
    const parsed = (native.debugColors as string[]).map(s =>
      s.slice(1, -1).split(', ').map(v => Math.fround(Number(v))))
    expect(colors.map(c => [...c.data])).toEqual(parsed)
  })
  it('HgiTokens and HgiShaderKeywordTokens', () => {
    expect([...HgiTokens.allTokens]).toEqual(native.tokens)
    expect([...HgiShaderKeywordTokens.allTokens]).toEqual(native.shaderKeywordTokens)
  })
})
