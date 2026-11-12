// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/effectsShader.cpp,
//  pxr/imaging/hdx/effectsShader.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/effectsShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Hgi Destroy* take the handle by value (hgi/src/hgi.ts); the member
//   handle is reset to an empty HgiHandle afterwards, as the C++ calls do
//   through the pointer.
// - Copies of the Hgi state structs (C++ value semantics) are explicit
//   (Object.assign / clone()) where upstream copies by assignment.
// - The destructor is Destroy(); callers drop the shader through it.
// - PrintCompileErrors writes to the console (std::cout upstream).
// - _CreateAndSubmitGraphicsCmds submits without waiting
//   (HgiSubmitWaitTypeNoWait, the default upstream too); Hgi.SubmitCmds
//   returns a promise here that is not awaited.

import { Vec4i as GfVec4i } from 'typescript-usd/gf'
import {
  HgiAttachmentDesc,
  HgiFormat,
  HgiGraphicsCmdsDesc,
  HgiGraphicsPipelineDesc,
  HgiHandle,
  HgiMultiSampleState,
  HgiResourceBindingsDesc,
  HgiSampleCount,
  HgiVertexBufferBinding,
  type Hgi,
  type HgiAttachmentDescVector,
  type HgiBufferBindDescVector,
  type HgiBufferHandle,
  type HgiDepthStencilState,
  type HgiGraphicsCmds,
  type HgiGraphicsPipelineHandle,
  type HgiPrimitiveType,
  type HgiRasterizationState,
  type HgiResourceBindingsHandle,
  type HgiShaderFunctionHandle,
  type HgiShaderProgramHandle,
  type HgiShaderStage,
  type HgiTextureBindDescVector,
  type HgiTextureHandle,
  type HgiTextureHandleVector,
  type HgiVertexBufferDescVector,
} from 'typescript-usd/hgi'

/** effectsShader.cpp:72-83. Create a copy that ignores those fields in the
 *  HgiAttachmentDesc that will come from the associated texture. */
function _PartialAttachmentCopy(inDesc: HgiAttachmentDesc): HgiAttachmentDesc {
  const outDesc = inDesc.clone()
  outDesc.format = HgiFormat.HgiFormatInvalid
  outDesc.usage = 0
  return outDesc
}

/** effectsShader.cpp:85-95 */
function _MatchesAttachment(oldDesc: HgiAttachmentDesc, newDesc: HgiAttachmentDesc): boolean {
  const oldDescCopy = _PartialAttachmentCopy(oldDesc)
  const newDescCopy = _PartialAttachmentCopy(newDesc)

  return oldDescCopy.equals(newDescCopy)
}

/** effectsShader.cpp:97-114 */
function _MatchesAttachments(oldDescs: HgiAttachmentDescVector,
  newDescs: HgiAttachmentDescVector): boolean {
  if (oldDescs.length !== newDescs.length) {
    return false
  }

  for (let i = 0; i < oldDescs.length; ++i) {
    if (!_MatchesAttachment(oldDescs[i]!, newDescs[i]!)) {
      return false
    }
  }

  return true
}

/** effectsShader.cpp:189-200. Create a copy that ignores those fields in the
 *  HgiMultiSampleState that will come from the color and/or depth texture. */
function _PartialMultiSampleStateCopy(inState: HgiMultiSampleState): HgiMultiSampleState {
  const outState = Object.assign(new HgiMultiSampleState(), inState)
  outState.multiSampleEnable = false
  outState.sampleCount = HgiSampleCount.HgiSampleCount1
  return outState
}

/** effectsShader.cpp:391-404 and :406-425 */
function _MatchesFormatAndSampleCount(
  texture: HgiTextureHandle | HgiTextureHandleVector,
  attachment: HgiAttachmentDesc | HgiAttachmentDescVector,
  sampleCount: HgiSampleCount,
): boolean {
  if (Array.isArray(texture)) {
    const attachments = attachment as HgiAttachmentDescVector
    if (texture.length !== attachments.length) {
      return false
    }
    for (let i = 0; i < texture.length; ++i) {
      if (!_MatchesFormatAndSampleCount(texture[i]!, attachments[i]!, sampleCount)) {
        return false
      }
    }
    return true
  }
  const desc = attachment as HgiAttachmentDesc
  if (texture && texture.isSet()) {
    const textureDesc = texture.Get()!.getDescriptor()
    return desc.format === textureDesc.format &&
      sampleCount === textureDesc.sampleCount
  } else {
    return desc.format === HgiFormat.HgiFormatInvalid
  }
}

/** effectsShader.cpp:427-453 */
function _UpdateFormatAndUsage(texture: HgiTextureHandle | null | undefined,
  desc: HgiAttachmentDesc): void {
  if (texture && texture.isSet()) {
    const texDesc = texture.Get()!.getDescriptor()
    desc.format = texDesc.format
    desc.usage = texDesc.usage
  } else {
    desc.format = HgiFormat.HgiFormatInvalid
  }
}

/** effectsShader.cpp:455-469 */
function _UpdateSampleCount(colorTextures: HgiTextureHandleVector,
  depthTexture: HgiTextureHandle | null | undefined, desc: HgiGraphicsPipelineDesc): void {
  let sampleCount = HgiSampleCount.HgiSampleCount1
  if (colorTextures.length !== 0) {
    sampleCount = colorTextures[0]!.Get()!.getDescriptor().sampleCount
  } else if (depthTexture && depthTexture.isSet()) {
    sampleCount = depthTexture.Get()!.getDescriptor().sampleCount
  }
  desc.multiSampleState.sampleCount = sampleCount
  desc.multiSampleState.multiSampleEnable = sampleCount !== HgiSampleCount.HgiSampleCount1
}

/** effectsShader.h:30-180. This class provides functionality to create and
 *  manage a single HgiGraphicsPipeline instance and to issue draw calls to
 *  that instance.
 *
 *  Sub-classes should define the actual interface for issuing the draw call
 *  leveraging the common functionality this class provides to facilitate
 *  that. */
export abstract class HdxEffectsShader {
  private readonly _hgi: Hgi | null
  private readonly _debugName: string
  private _pipelineDesc = new HgiGraphicsPipelineDesc()
  private _pipeline: HgiGraphicsPipelineHandle = new HgiHandle()
  private _constantsData = new Uint8Array(0)
  private _resourceBindingsDesc = new HgiResourceBindingsDesc()
  private _resourceBindings: HgiResourceBindingsHandle = new HgiHandle()
  private _gfxCmds: HgiGraphicsCmds | null = null

  /** effectsShader.cpp:30-38 */
  protected constructor(hgi: Hgi | null, debugName: string) {
    this._hgi = hgi
    this._debugName = debugName.length === 0 ? 'HdxEffectsShader' : debugName
    this._pipelineDesc.debugName = this._debugName
    this._resourceBindingsDesc.debugName = this._debugName
  }

  /** effectsShader.cpp:40-48 (the destructor). */
  destroy(): void {
    if (!this._hgi) {
      return
    }

    this._destroyResourceBindings()
    this._destroyPipeline()
  }

  /** effectsShader.cpp:50-70. Print shader compile errors for the shader
   *  function, or for the shader program and any functions it references. */
  static printCompileErrors(shader: HgiShaderFunctionHandle | HgiShaderProgramHandle): void {
    const obj = shader.Get() as { isValid(): boolean, getCompileErrors(): string,
      getShaderFunctions?(): HgiShaderFunctionHandle[] } | null
    if (!obj) return
    if (obj.getShaderFunctions) {
      for (const fn of obj.getShaderFunctions()) {
        HdxEffectsShader.printCompileErrors(fn)
      }
    }
    if (!obj.isValid()) {
      console.log(obj.getCompileErrors())
    }
  }

  /** effectsShader.cpp:116-127 */
  protected _setColorAttachments(colorAttachmentDescs: HgiAttachmentDescVector): void {
    if (_MatchesAttachments(this._pipelineDesc.colorAttachmentDescs, colorAttachmentDescs)) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.colorAttachmentDescs = colorAttachmentDescs.map(d => d.clone())
  }

  /** effectsShader.cpp:129-140 */
  protected _setDepthAttachment(depthAttachmentDesc: HgiAttachmentDesc): void {
    if (_MatchesAttachment(this._pipelineDesc.depthAttachmentDesc, depthAttachmentDesc)) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.depthAttachmentDesc = depthAttachmentDesc.clone()
  }

  /** effectsShader.cpp:143-154 */
  protected _setPrimitiveType(primitiveType: HgiPrimitiveType): void {
    if (this._pipelineDesc.primitiveType === primitiveType) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.primitiveType = primitiveType
  }

  /** effectsShader.cpp:156-167 */
  protected _setShaderProgram(shaderProgram: HgiShaderProgramHandle): void {
    if (this._pipelineDesc.shaderProgram.equals(shaderProgram)) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.shaderProgram = shaderProgram
  }

  /** effectsShader.cpp:170-181 */
  protected _setVertexBufferDescs(vertexBufferDescs: HgiVertexBufferDescVector): void {
    const cur = this._pipelineDesc.vertexBuffers
    if (cur.length === vertexBufferDescs.length &&
      cur.every((v, i) => v.equals(vertexBufferDescs[i]!))) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.vertexBuffers = vertexBufferDescs
  }

  /** effectsShader.cpp:183-194 */
  protected _setDepthStencilState(depthStencilState: HgiDepthStencilState): void {
    if (this._pipelineDesc.depthState.equals(depthStencilState)) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.depthState = Object.assign(
      Object.create(Object.getPrototypeOf(depthStencilState)), depthStencilState)
  }

  /** effectsShader.cpp:209-225 */
  protected _setMultiSampleState(multiSampleState: HgiMultiSampleState): void {
    const pipelineMultiSampleStateCopy =
      _PartialMultiSampleStateCopy(this._pipelineDesc.multiSampleState)
    const multiSampleStateCopy = _PartialMultiSampleStateCopy(multiSampleState)
    if (pipelineMultiSampleStateCopy.equals(multiSampleStateCopy)) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.multiSampleState =
      Object.assign(new HgiMultiSampleState(), multiSampleState)
  }

  /** effectsShader.cpp:227-238 */
  protected _setRasterizationState(rasterizationState: HgiRasterizationState): void {
    if (this._pipelineDesc.rasterizationState.equals(rasterizationState)) {
      return
    }

    this._destroyPipeline()

    this._pipelineDesc.rasterizationState = Object.assign(
      Object.create(Object.getPrototypeOf(rasterizationState)), rasterizationState)
  }

  /** effectsShader.cpp:240-259 */
  protected _setShaderConstants(byteSize: number, data: ArrayBufferView | ArrayBuffer,
    stageUsage: HgiShaderStage): void {
    // Check if this constant data requires us to re-create the pipeline.
    if (byteSize !== this._constantsData.length ||
      stageUsage !== this._pipelineDesc.shaderConstantsDesc.stageUsage) {
      this._destroyPipeline()

      this._pipelineDesc.shaderConstantsDesc.byteSize = byteSize
      this._pipelineDesc.shaderConstantsDesc.stageUsage = stageUsage
    }

    // But we always want to grab the new data, even if we didn't have
    // to re-create the pipeline.
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data, 0, byteSize)
      : new Uint8Array(data.buffer, data.byteOffset, byteSize)
    this._constantsData = Uint8Array.from(bytes)
  }

  /** effectsShader.cpp:261-272 */
  protected _setTextureBindings(textures: HgiTextureBindDescVector): void {
    const cur = this._resourceBindingsDesc.textures
    if (cur.length === textures.length && cur.every((t, i) => t.equals(textures[i]!))) {
      return
    }

    this._destroyResourceBindings()

    this._resourceBindingsDesc.textures = textures
  }

  /** effectsShader.cpp:274-285 */
  protected _setBufferBindings(buffers: HgiBufferBindDescVector): void {
    const cur = this._resourceBindingsDesc.buffers
    if (cur.length === buffers.length && cur.every((b, i) => b.equals(buffers[i]!))) {
      return
    }

    this._destroyResourceBindings()

    this._resourceBindingsDesc.buffers = buffers
  }

  /** effectsShader.cpp:287-329. Creates a graphics commands object, records
   *  draw commands to it via the overridden _RecordDrawCmds, and then
   *  submits them. */
  protected _createAndSubmitGraphicsCmds(
    colorTextures: HgiTextureHandleVector,
    colorResolveTextures: HgiTextureHandleVector,
    depthTexture: HgiTextureHandle,
    depthResolveTexture: HgiTextureHandle,
    viewport: GfVec4i,
  ): void {
    const hgi = this._hgi!
    // Ensure the pipeline is ready to be used and the attachment descriptors
    // are correct.
    this._createPipeline(colorTextures, colorResolveTextures, depthTexture,
      depthResolveTexture)

    // Ensure the resource bindings are ready to be used.
    this._createResourceBindings()

    // Now we can create the HgiGraphicsCmds
    const gfxDesc = new HgiGraphicsCmdsDesc()
    gfxDesc.colorAttachmentDescs = this._pipelineDesc.colorAttachmentDescs
    gfxDesc.depthAttachmentDesc = this._pipelineDesc.depthAttachmentDesc
    gfxDesc.colorTextures = colorTextures
    gfxDesc.colorResolveTextures = colorResolveTextures
    gfxDesc.depthTexture = depthTexture
    gfxDesc.depthResolveTexture = depthResolveTexture

    this._gfxCmds = hgi.createGraphicsCmds(gfxDesc)

    this._gfxCmds.pushDebugGroup(this._debugName)
    this._gfxCmds.bindPipeline(this._pipeline)
    this._gfxCmds.setViewport(viewport)
    this._gfxCmds.bindResources(this._resourceBindings)
    if (this._constantsData.length !== 0) {
      this._gfxCmds.setConstantValues(
        this._pipeline, this._pipelineDesc.shaderConstantsDesc.stageUsage, 0,
        this._constantsData.length, this._constantsData)
    }

    // Invoke the sub-class override
    this._recordDrawCmds()

    this._gfxCmds.popDebugGroup()

    void hgi.submitCmds(this._gfxCmds)

    this._gfxCmds = null
  }

  /** effectsShader.h:111-114. Sub-classes should override and invoke one or
   *  more calls to _DrawNonIndexed or _DrawIndexed. */
  protected abstract _recordDrawCmds(): void

  /** effectsShader.cpp:331-342. Sets the vertex buffer and invokes
   *  HgiGraphicsCmds::Draw. */
  protected _drawNonIndexed(vertexBuffer: HgiBufferHandle, vertexCount: number,
    baseVertex: number, instanceCount: number, baseInstance: number): void {
    this._gfxCmds!.bindVertexBuffers([new HgiVertexBufferBinding(vertexBuffer, 0, 0)])

    this._gfxCmds!.draw(vertexCount, baseVertex, instanceCount, baseInstance)
  }

  /** effectsShader.cpp:344-358. Sets the vertex buffer and invokes
   *  HgiGraphicsCmds::DrawIndexed with the provided index buffer. */
  protected _drawIndexed(vertexBuffer: HgiBufferHandle, indexBuffer: HgiBufferHandle,
    indexCount: number, indexBufferByteOffset: number, baseVertex: number,
    instanceCount: number, baseInstance: number): void {
    this._gfxCmds!.bindVertexBuffers([new HgiVertexBufferBinding(vertexBuffer, 0, 0)])

    this._gfxCmds!.drawIndexed(indexBuffer, indexCount, indexBufferByteOffset,
      baseVertex, instanceCount, baseInstance)
  }

  /** effectsShader.cpp:360-364 */
  protected _getHgi(): Hgi | null {
    return this._hgi
  }

  /** effectsShader.cpp:366-377. Returns the empty handle for the caller to
   *  store. */
  protected _destroyShaderProgram(shaderProgram: HgiShaderProgramHandle): HgiShaderProgramHandle {
    if (!shaderProgram || !shaderProgram.isSet()) {
      return new HgiHandle()
    }

    for (const fn of shaderProgram.Get()!.getShaderFunctions()) {
      this._hgi!.destroyShaderFunction(fn)
    }
    this._hgi!.destroyShaderProgram(shaderProgram)
    return new HgiHandle()
  }

  /** effectsShader.cpp:379-383 */
  protected _getDebugName(): string {
    return this._debugName
  }

  /** effectsShader.cpp:471-505 */
  private _createPipeline(
    colorTextures: HgiTextureHandleVector,
    colorResolveTextures: HgiTextureHandleVector,
    depthTexture: HgiTextureHandle,
    depthResolveTexture: HgiTextureHandle,
  ): void {
    if (this._pipeline.isSet()) {
      const sampleCount = this._pipelineDesc.multiSampleState.sampleCount
      if (_MatchesFormatAndSampleCount(colorTextures,
        this._pipelineDesc.colorAttachmentDescs, sampleCount) &&
        _MatchesFormatAndSampleCount(colorResolveTextures,
          this._pipelineDesc.colorAttachmentDescs, HgiSampleCount.HgiSampleCount1) &&
        _MatchesFormatAndSampleCount(depthTexture,
          this._pipelineDesc.depthAttachmentDesc, sampleCount) &&
        _MatchesFormatAndSampleCount(depthResolveTexture,
          this._pipelineDesc.depthAttachmentDesc, HgiSampleCount.HgiSampleCount1)) {
        return
      }

      this._destroyPipeline()
    }

    _UpdateSampleCount(colorTextures, depthTexture, this._pipelineDesc)

    for (let i = 0; i < colorTextures.length; ++i) {
      _UpdateFormatAndUsage(colorTextures[i], this._pipelineDesc.colorAttachmentDescs[i]!)
    }
    _UpdateFormatAndUsage(depthTexture, this._pipelineDesc.depthAttachmentDesc)

    if ((colorResolveTextures.length !== 0 && colorResolveTextures[0]!.isSet()) ||
      (depthResolveTexture && depthResolveTexture.isSet())) {
      this._pipelineDesc.resolveAttachments = true
    }

    this._pipeline = this._hgi!.CreateGraphicsPipeline(this._pipelineDesc)
  }

  /** effectsShader.cpp:507-513 */
  private _destroyPipeline(): void {
    if (this._pipeline.isSet()) {
      this._hgi!.destroyGraphicsPipeline(this._pipeline)
      this._pipeline = new HgiHandle()
    }
  }

  /** effectsShader.cpp:515-526 */
  private _createResourceBindings(): void {
    if (this._resourceBindings.isSet()) {
      return
    }

    if (this._resourceBindingsDesc.buffers.length !== 0 ||
      this._resourceBindingsDesc.textures.length !== 0) {
      this._resourceBindings = this._hgi!.createResourceBindings(this._resourceBindingsDesc)
    }
  }

  /** effectsShader.cpp:528-534 */
  private _destroyResourceBindings(): void {
    if (this._resourceBindings.isSet()) {
      this._hgi!.destroyResourceBindings(this._resourceBindings)
      this._resourceBindings = new HgiHandle()
    }
  }
}
