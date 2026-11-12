// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/hgi.cpp
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Hgi's backend-independent checks (hgi.cpp:39-176) through a recording
// backend: the validation diagnostics are the upstream message literals, and
// the "[PluginLoad]" path reports a backend that has not registered.
import { afterEach, describe, expect, it } from 'vitest'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  Hgi,
  HgiBindResourceType,
  HgiBufferBindDesc,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiCmds,
  HgiFormat,
  HgiHandle,
  HgiResourceBindingsDesc,
  HgiSampleCount,
  HgiSubmitWaitType,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureViewDesc,
  HgiTokens,
} from '../src/index.ts'

class RecordingHgi extends Hgi {
  created: string[] = []
  constructor() { super() }
  IsBackendSupported() { return true }
  createGraphicsCmds(): never { throw new Error('unused') }
  createBlitCmds(): never { throw new Error('unused') }
  createComputeCmds(): never { throw new Error('unused') }
  destroyTexture() {}
  destroyTextureView() {}
  createSampler(): never { throw new Error('unused') }
  destroySampler() {}
  destroyBuffer() {}
  CreateShaderFunction(): never { throw new Error('unused') }
  destroyShaderFunction() {}
  createShaderProgram(): never { throw new Error('unused') }
  destroyShaderProgram() {}
  destroyResourceBindings() {}
  CreateGraphicsPipeline(): never { throw new Error('unused') }
  destroyGraphicsPipeline() {}
  CreateComputePipeline(): never { throw new Error('unused') }
  destroyComputePipeline() {}
  getAPIName() { return HgiTokens.OpenGL }
  getCapabilities() { return null }
  getIndirectCommandEncoder() { return null }
  startFrame() {}
  endFrame() {}
  garbageCollect() {}
  _destroy() {}
  protected _CreateTexture(): never { this.created.push('texture'); return new HgiHandle() as never }
  protected _createTextureView(): never { this.created.push('view'); return new HgiHandle() as never }
  protected _createBuffer(): never { this.created.push('buffer'); return new HgiHandle() as never }
  protected _createResourceBindings(): never { this.created.push('bindings'); return new HgiHandle() as never }
}

class RecordingCmds extends HgiCmds {
  submits = 0
  constructor() { super() }
  override _submit(): boolean { this.submits++; return true }
}

let mark: TfErrorMark | null = null
function errorsOf(action: () => void): string[] {
  mark = new TfErrorMark()
  mark.setMark()
  action()
  const messages = mark.getErrors().map(e => e.getCommentary())
  mark.clear()
  return messages
}
afterEach(() => { mark?.clear(); mark = null })

describe('Hgi::Create* validation (hgi.cpp:39-165)', () => {
  it('CreateTexture reports zero size, missing usage, multisampled non-2d and unblocked compression', () => {
    const hgi = new RecordingHgi()
    const desc = new HgiTextureDesc()
    desc.debugName = 'tex'
    desc.format = HgiFormat.HgiFormatBC7UNorm8Vec4
    desc.dimensions = new GfVec3i(0, 6, 1)
    desc.sampleCount = HgiSampleCount.HgiSampleCount4
    desc.type = HgiTextureType.HgiTextureType3D
    expect(errorsOf(() => hgi.createTexture(desc))).toEqual([
      'tex: x dimension must be non-zero',
      'tex: x dimension must be non-zero',
      'tex: Usage must be defined',
      'tex: multisampled textures must be 2d',
      'tex: compressed textures must be block sized',
    ])
    expect(hgi.created).toEqual(['texture'])
  })

  it('CreateTextureView reports an unset source texture, unnamed as UNNAMED', () => {
    const hgi = new RecordingHgi()
    expect(errorsOf(() => hgi.createTextureView(new HgiTextureViewDesc())))
      .toEqual(['UNNAMED: source texture invalid'])
  })

  it('CreateBuffer reports zero size and a vertex buffer without stride', () => {
    const hgi = new RecordingHgi()
    const desc = new HgiBufferDesc()
    desc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    expect(errorsOf(() => hgi.createBuffer(desc))).toEqual([
      'UNNAMED: buffers must be non-zero sized',
      'UNNAMED: vertex buffers must provide stride!',
    ])
  })

  it('CreateResourceBindings reports count mismatches and unknown types', () => {
    const hgi = new RecordingHgi()
    const desc = new HgiResourceBindingsDesc()
    desc.debugName = 'rb'
    const b = new HgiBufferBindDesc()
    b.buffers = [new HgiHandle()]
    b.offsets = [4, 8]
    b.sizes = [0]
    b.resourceType = HgiBindResourceType.HgiBindResourceTypeSampler
    desc.buffers.push(b)
    expect(errorsOf(() => hgi.createResourceBindings(desc))).toEqual([
      'rb.buffers[0]: Buffer count (1) != Offset count (2)',
      'rb.buffers[0]: Unknown buffer type to bind',
      'rb.buffers[0]: Invalid size (0) for buffer with offset (4)',
      'rb.buffers[0].buffers[0] invalid',
    ])
    expect(errorsOf(() => hgi.createResourceBindings(new HgiResourceBindingsDesc())))
      .toEqual(['UNNAMED: buffers and textures vectors cannot be empty'])
  })
})

describe('Hgi::SubmitCmds (hgi.cpp:167-176)', () => {
  it('submits once and flags the cmds as submitted', async () => {
    const hgi = new RecordingHgi()
    const cmds = new RecordingCmds()
    await hgi.submitCmds(cmds, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
    expect([cmds.submits, cmds.isSubmitted()]).toEqual([1, true])
    const errors = errorsOf(() => { void hgi.submitCmds(cmds) })
    expect(cmds.submits).toBe(1)
    expect(errors.length).toBe(1)
  })

  it('GetUniqueId counts from 1 (hgi.cpp:32-35, 375-379)', () => {
    const hgi = new RecordingHgi()
    expect([hgi.getUniqueId(), hgi.getUniqueId()]).toEqual([1, 2])
  })
})

describe('Hgi factories (hgi.cpp:178-329)', () => {
  it('CreateNamedHgi reports a build without the requested backend', async () => {
    mark = new TfErrorMark()
    mark.setMark()
    expect(await Hgi.createNamedHgi(HgiTokens.Metal)).toBeNull()
    expect(mark.getErrors().map(e => e.getCommentary()))
      .toEqual(['Build does not support proposed Hgi type  on this platform.'])
  })
})
