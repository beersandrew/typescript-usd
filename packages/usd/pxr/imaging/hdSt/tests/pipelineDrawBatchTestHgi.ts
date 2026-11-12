// Portions ported from OpenUSD 26.11.1, including: pxr/imaging/hgiMetal/hgi.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A recording Hgi for Node tests of HdSt_PipelineDrawBatch (no GPU). It
// reports the hgiMetal Apple M4 Pro capabilities of the reference device
// (tests/codegenTestHgi.ts) unless a test clears bits, keeps buffers on the
// CPU with the blit commands of tests/bufferTestHgi.ts, accepts every shader,
// and records each call Storm makes on Hgi, its graphics / compute commands
// and its indirect command encoder into one ordered call log.

import { Token as TfToken } from 'typescript-usd/tf'
import {
  Hgi,
  HgiBlitCmds,
  HgiComputeCmds,
  HgiComputePipeline,
  HgiGraphicsCmds,
  HgiGraphicsPipeline,
  HgiHandle,
  HgiIndirectCommandEncoder,
  HgiIndirectCommands,
  HgiResourceBindings,
  HgiShaderFunction,
  HgiShaderProgram,
  HgiTokens,
  type HgiBufferDesc,
  type HgiBufferHandle,
  type HgiCmds,
  type HgiComputeCmdsDesc,
  type HgiComputeDispatch,
  type HgiComputePipelineDesc,
  type HgiComputePipelineHandle,
  type HgiCpuData,
  type HgiGraphicsPipelineDesc,
  type HgiGraphicsPipelineHandle,
  type HgiResourceBindingsDesc,
  type HgiResourceBindingsHandle,
  type HgiShaderFunctionDesc,
  type HgiShaderFunctionHandle,
  type HgiShaderProgramDesc,
  type HgiShaderProgramHandle,
  type HgiSubmitWaitType,
  type HgiVertexBufferBindingVector,
} from 'typescript-usd/hgi'
import type { HgiTextureDesc, HgiTextureHandle } from 'typescript-usd/hgi'
import { BufferTestBlitCmds, BufferTestBuffer } from './bufferTestHgi.ts'
import { HgiCodegenTestMetalM4ProCapabilities } from './codegenTestHgi.ts'

/** The reference device's capabilities, with bits a test may change. */
export class PipelineDrawBatchTestCapabilities extends HgiCodegenTestMetalM4ProCapabilities {
  setFlag(mask: number, value: boolean): void { this._setFlag(mask, value) }
}

class _ShaderFunction extends HgiShaderFunction {
  constructor(desc: HgiShaderFunctionDesc) { super(desc) }
  isValid(): boolean { return true }
  getCompileErrors(): string { return '' }
  getByteSizeOfResource(): number { return 0 }
  getRawResource(): unknown { return null }
}

class _ShaderProgram extends HgiShaderProgram {
  constructor(desc: HgiShaderProgramDesc) { super(desc) }
  isValid(): boolean { return true }
  getCompileErrors(): string { return '' }
  getShaderFunctions() { return this._descriptor.shaderFunctions }
  getByteSizeOfResource(): number { return 0 }
  getRawResource(): unknown { return null }
}

export class PipelineDrawBatchTestGraphicsPipeline extends HgiGraphicsPipeline {
  constructor(desc: HgiGraphicsPipelineDesc) { super(desc) }
}

export class PipelineDrawBatchTestComputePipeline extends HgiComputePipeline {
  constructor(desc: HgiComputePipelineDesc) { super(desc) }
}

export class PipelineDrawBatchTestResourceBindings extends HgiResourceBindings {
  constructor(desc: HgiResourceBindingsDesc) { super(desc) }
}

/** The bytes of HgiCpuData. */
function _bytes(data: HgiCpuData, byteSize: number): Uint8Array {
  return data instanceof ArrayBuffer ? new Uint8Array(data, 0, byteSize).slice()
    : new Uint8Array(data.buffer, data.byteOffset, byteSize).slice()
}

/** One recorded call: its name, arguments and (for SetConstantValues) a
 *  copy of the bytes. */
export interface PipelineDrawBatchTestCall {
  call: string
  args: unknown[]
}

export class PipelineDrawBatchTestComputeCmds extends HgiComputeCmds {
  constructor(private readonly _hgi: PipelineDrawBatchTestHgi,
    private readonly _dispatch: HgiComputeDispatch) { super() }
  private _rec(call: string, ...args: unknown[]): void {
    this._hgi.calls.push({ call: `compute.${call}`, args })
  }
  pushDebugGroup(label: string): void { this._rec('PushDebugGroup', label) }
  popDebugGroup(): void { this._rec('PopDebugGroup') }
  insertDebugMarker(label: string): void { this._rec('InsertDebugMarker', label) }
  bindPipeline(pipeline: HgiComputePipelineHandle): void { this._rec('BindPipeline', pipeline) }
  bindResources(resources: HgiResourceBindingsHandle): void { this._rec('BindResources', resources) }
  setConstantValues(pipeline: HgiComputePipelineHandle, bindIndex: number,
    byteSize: number, data: HgiCpuData): void {
    this._rec('SetConstantValues', pipeline, bindIndex, byteSize, _bytes(data, byteSize))
  }
  Dispatch(dimX: number, dimY: number): void { this._rec('Dispatch', dimX, dimY) }
  insertMemoryBarrier(barrier: number): void { this._rec('InsertMemoryBarrier', barrier) }
  getDispatchMethod(): HgiComputeDispatch { return this._dispatch }
  override _submit(): boolean { return true }
}

export class PipelineDrawBatchTestGraphicsCmds extends HgiGraphicsCmds {
  constructor(private readonly _hgi: PipelineDrawBatchTestHgi) { super() }
  private _rec(call: string, ...args: unknown[]): void {
    this._hgi.calls.push({ call: `gfx.${call}`, args })
  }
  pushDebugGroup(label: string): void { this._rec('PushDebugGroup', label) }
  popDebugGroup(): void { this._rec('PopDebugGroup') }
  insertDebugMarker(label: string): void { this._rec('InsertDebugMarker', label) }
  setViewport(vp: unknown): void { this._rec('SetViewport', vp) }
  setScissor(sc: unknown): void { this._rec('SetScissor', sc) }
  bindPipeline(pipeline: HgiGraphicsPipelineHandle): void { this._rec('BindPipeline', pipeline) }
  bindResources(resources: HgiResourceBindingsHandle): void { this._rec('BindResources', resources) }
  setConstantValues(pipeline: HgiGraphicsPipelineHandle, stages: number, bindIndex: number,
    byteSize: number, data: HgiCpuData): void {
    this._rec('SetConstantValues', pipeline, stages, bindIndex, byteSize, _bytes(data, byteSize))
  }
  bindVertexBuffers(bindings: HgiVertexBufferBindingVector): void {
    this._rec('BindVertexBuffers', [...bindings])
  }
  draw(vertexCount: number, baseVertex: number, instanceCount: number, baseInstance: number): void {
    this._rec('Draw', vertexCount, baseVertex, instanceCount, baseInstance)
  }
  drawIndirect(drawParameterBuffer: HgiBufferHandle, drawBufferByteOffset: number,
    drawCount: number, stride: number): void {
    this._rec('DrawIndirect', drawParameterBuffer, drawBufferByteOffset, drawCount, stride)
  }
  drawIndexed(indexBuffer: HgiBufferHandle, indexCount: number, indexBufferByteOffset: number,
    baseVertex: number, instanceCount: number, baseInstance: number): void {
    this._rec('DrawIndexed', indexBuffer, indexCount, indexBufferByteOffset, baseVertex,
      instanceCount, baseInstance)
  }
  drawIndexedIndirect(indexBuffer: HgiBufferHandle, drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number, drawCount: number, stride: number,
    drawParameterBufferUInt32: readonly number[], patchBaseVertexByteOffset: number): void {
    this._rec('DrawIndexedIndirect', indexBuffer, drawParameterBuffer, drawBufferByteOffset,
      drawCount, stride, [...drawParameterBufferUInt32], patchBaseVertexByteOffset)
  }
  insertMemoryBarrier(barrier: number): void { this._rec('InsertMemoryBarrier', barrier) }
  override _submit(): boolean { return true }
}

/** Records encoding as hgiMetal's encoder is called (the encoded commands
 *  themselves are not executed). */
export class PipelineDrawBatchTestIndirectCommandEncoder extends HgiIndirectCommandEncoder {
  constructor(private readonly _hgi: PipelineDrawBatchTestHgi) { super() }
  private _rec(call: string, ...args: unknown[]): void {
    this._hgi.calls.push({ call: `encoder.${call}`, args })
  }
  encodeDraw(_computeCmds: HgiComputeCmds, pipeline: HgiGraphicsPipelineHandle,
    resourceBindings: HgiResourceBindingsHandle, vertexBindings: HgiVertexBufferBindingVector,
    drawParameterBuffer: HgiBufferHandle, drawBufferByteOffset: number, drawCount: number,
    stride: number): HgiIndirectCommands {
    this._rec('EncodeDraw', pipeline, resourceBindings, [...vertexBindings],
      drawParameterBuffer, drawBufferByteOffset, drawCount, stride)
    return new HgiIndirectCommands(drawCount, pipeline, resourceBindings)
  }
  encodeDrawIndexed(_computeCmds: HgiComputeCmds, pipeline: HgiGraphicsPipelineHandle,
    resourceBindings: HgiResourceBindingsHandle, vertexBindings: HgiVertexBufferBindingVector,
    indexBuffer: HgiBufferHandle, drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number, drawCount: number, stride: number,
    patchBaseVertexByteOffset: number): HgiIndirectCommands {
    this._rec('EncodeDrawIndexed', pipeline, resourceBindings, [...vertexBindings], indexBuffer,
      drawParameterBuffer, drawBufferByteOffset, drawCount, stride, patchBaseVertexByteOffset)
    return new HgiIndirectCommands(drawCount, pipeline, resourceBindings)
  }
  executeDraw(_gfxCmds: HgiGraphicsCmds, commands: HgiIndirectCommands): void {
    this._rec('ExecuteDraw', commands)
  }
}

export class PipelineDrawBatchTestHgi extends Hgi {
  readonly capabilities = new PipelineDrawBatchTestCapabilities()
  readonly calls: PipelineDrawBatchTestCall[] = []
  readonly buffers: BufferTestBuffer[] = []
  /** Every shader function descriptor, in creation order. */
  readonly shaderFunctionDescs: HgiShaderFunctionDesc[] = []
  /** Null when the test removes the encoder (as Hgis without ICBs have). */
  indirectCommandEncoder: PipelineDrawBatchTestIndirectCommandEncoder | null =
    new PipelineDrawBatchTestIndirectCommandEncoder(this)

  constructor() { super() }

  private _rec(call: string, ...args: unknown[]): void {
    this.calls.push({ call: `hgi.${call}`, args })
  }

  /** The recorded call names, in order. */
  callNames(): string[] { return this.calls.map((c) => c.call) }

  IsBackendSupported(): boolean { return true }
  getAPIName(): TfToken { return HgiTokens.Metal }
  getCapabilities(): PipelineDrawBatchTestCapabilities { return this.capabilities }
  getIndirectCommandEncoder(): HgiIndirectCommandEncoder | null {
    return this.indirectCommandEncoder
  }

  createGraphicsCmds(): PipelineDrawBatchTestGraphicsCmds {
    this._rec('CreateGraphicsCmds')
    return this._recording(new PipelineDrawBatchTestGraphicsCmds(this))
  }
  createBlitCmds(): HgiBlitCmds {
    this._rec('CreateBlitCmds')
    return this._recording(new BufferTestBlitCmds())
  }
  createComputeCmds(desc: HgiComputeCmdsDesc): HgiComputeCmds {
    this._rec('CreateComputeCmds', desc.dispatchMethod)
    return this._recording(new PipelineDrawBatchTestComputeCmds(this, desc.dispatchMethod))
  }
  protected override _SubmitCmds(cmds: HgiCmds, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    this._rec('SubmitCmds', cmds.constructor.name, wait)
    const result = cmds._submit(this, wait)
    // Destroyed buffers the submitted cmds may have used go now.
    this._recordingCmds.delete(cmds)
    this._trash = this._trash.filter((t) => {
      t.waitFor.delete(cmds)
      if (t.waitFor.size > 0) return true
      t.buffer.destroyed = true
      return false
    })
    return result
  }

  // hgiMetal/hgi.h:208-212: Metal command buffers retain the resources they
  // use, so a buffer destroyed while cmds that may use it are still being
  // recorded stays valid until they are submitted.
  private readonly _recordingCmds = new Set<HgiCmds>()
  private _trash: { buffer: BufferTestBuffer, waitFor: Set<HgiCmds> }[] = []
  private _recording<T extends HgiCmds>(cmds: T): T {
    this._recordingCmds.add(cmds)
    return cmds
  }

  CreateShaderFunction(desc: HgiShaderFunctionDesc): HgiShaderFunctionHandle {
    this.shaderFunctionDescs.push(desc.clone())
    this._rec('CreateShaderFunction', desc.shaderStage)
    return new HgiHandle<HgiShaderFunction>(new _ShaderFunction(desc), this.getUniqueId())
  }
  destroyShaderFunction(h: HgiShaderFunctionHandle): void { h._reset() }
  createShaderProgram(desc: HgiShaderProgramDesc): HgiShaderProgramHandle {
    this._rec('CreateShaderProgram', desc.debugName)
    return new HgiHandle<HgiShaderProgram>(new _ShaderProgram(desc), this.getUniqueId())
  }
  destroyShaderProgram(h: HgiShaderProgramHandle): void { h._reset() }

  CreateGraphicsPipeline(desc: HgiGraphicsPipelineDesc): HgiGraphicsPipelineHandle {
    this._rec('CreateGraphicsPipeline', desc)
    return new HgiHandle<HgiGraphicsPipeline>(
      new PipelineDrawBatchTestGraphicsPipeline(desc), this.getUniqueId())
  }
  destroyGraphicsPipeline(h: HgiGraphicsPipelineHandle): void { h._reset() }
  CreateComputePipeline(desc: HgiComputePipelineDesc): HgiComputePipelineHandle {
    this._rec('CreateComputePipeline', desc)
    return new HgiHandle<HgiComputePipeline>(
      new PipelineDrawBatchTestComputePipeline(desc), this.getUniqueId())
  }
  destroyComputePipeline(h: HgiComputePipelineHandle): void { h._reset() }
  protected _createResourceBindings(desc: HgiResourceBindingsDesc): HgiResourceBindingsHandle {
    this._rec('CreateResourceBindings', desc)
    return new HgiHandle<HgiResourceBindings>(
      new PipelineDrawBatchTestResourceBindings(desc), this.getUniqueId())
  }
  destroyResourceBindings(h: HgiResourceBindingsHandle): void {
    this._rec('DestroyResourceBindings', h)
  }

  protected _createBuffer(desc: HgiBufferDesc): HgiBufferHandle {
    const b = new BufferTestBuffer(desc)
    this.buffers.push(b)
    this._rec('CreateBuffer', desc.debugName, desc.byteSize)
    return new HgiHandle(b, this.getUniqueId()) as HgiBufferHandle
  }
  destroyBuffer(h: HgiBufferHandle): void {
    const b = h.Get() as BufferTestBuffer | null
    if (b && this._recordingCmds.size > 0) {
      this._trash.push({ buffer: b, waitFor: new Set(this._recordingCmds) })
    } else if (b) {
      b.destroyed = true
    }
    this._rec('DestroyBuffer')
    h._reset()
  }

  destroyTexture(): void {}
  destroyTextureView(): void {}
  createSampler(): never { throw new Error('unused') }
  destroySampler(): void {}
  startFrame(): void {}
  endFrame(): void {}
  garbageCollect(): void {}
  _destroy(): void {}
  protected _CreateTexture(_desc: HgiTextureDesc): HgiTextureHandle { throw new Error('unused') }
  protected _createTextureView(): never { throw new Error('unused') }
}
