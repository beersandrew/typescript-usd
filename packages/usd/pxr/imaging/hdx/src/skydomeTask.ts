// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/skydomeTask.cpp,
//  pxr/imaging/hdx/skydomeTask.h, pxr/imaging/hdSt/dynamicUvTextureObject.cpp
// Copyright 2020, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/skydomeTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index.
// - The destructor is Destroy() (releases the fullscreen shader).
// - The dynamic_casts are instanceof checks.
// - _ParameterBuffer (skydomeTask.h:83-88, three GfMatrix4f) is written as
//   its 192 bytes of row-major floats.
// - Texture loads are asynchronous in Storm (hdSt/src/textureObjectRegistry.ts
//   and renderPass.ts headers). While textures wait for their load, the dome
//   light cubemap may not be computed yet (its dynamic texture object is
//   valid without a GPU texture, dynamicUvTextureObject.cpp:60-66), so the
//   skydome is not drawn then, as HdSt_RenderPass draws nothing: only the
//   clear of the early out below runs. Upstream's commit loads the dome
//   texture and computes the cubemap before any task executes.

import { Token as TfToken } from 'typescript-usd/tf'
import { Matrix4f as GfMatrix4f, Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  ChangeTracker as HdChangeTracker,
  RenderSettingsTokens as HdRenderSettingsTokens,
  Tokens as HdTokens,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type RenderPassState as HdRenderPassState,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  HgiAttachmentLoadOp,
  HgiFormat,
  HgiHandle,
  HgiIsFloatFormat,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderKeywordTokens,
  HgiShaderStageBits,
  HgiShaderTextureType,
  type HgiSamplerHandle,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import type { SimpleLightingContext as GlfSimpleLightingContext } from 'typescript-usd/glf'
import {
  RenderPassState as HdStRenderPassState,
  SimpleLightingShader as HdStSimpleLightingShader,
  UvSamplerObject as HdStUvSamplerObject,
  UvTextureObject as HdStUvTextureObject,
} from 'typescript-usd/hdSt'
import { HdxFullscreenShader } from './fullscreenShader.ts'
import { HdxPackageSkydomeShader } from './package.ts'
import { HdxRenderSetupTask, HdxRenderTaskParams } from './renderSetupTask.ts'
import { HdxTask } from './task.ts'
import { HdxTokens } from './tokens.ts'

/** skydomeTask.cpp:28-33 */
const _tokens = {
  skydomeFrag: TfToken('SkydomeFragment'),
  skydomeTexture: TfToken('skydomeTexture'),
}

/** skydomeTask.h:29-99. If we have a domelight present in the lighting
 *  context the SkydomeTask will render the associated environment map as a
 *  Skydome. Otherwise, it will simply clear the AOVs.
 *
 *  Note that this task is intended to be the first "Render Task" in the
 *  HdxTaskController so that the AOV's are properly cleared, however it does
 *  not spawn a HdRenderPass. */
export class HdxSkydomeTask extends HdxTask {
  private _renderIndex: HdRenderIndex | null = null
  private _skydomeTexture: HgiTextureHandle = new HgiHandle()
  private _skydomeSampler: HgiSamplerHandle = new HgiHandle()

  // Optional internal render setup task, for params unpacking.
  // This is used for aov bindings, camera matrices and framing
  private _setupTask: HdxRenderSetupTask | null = null
  private _settingsVersion = 0
  private _skydomeVisibility = true

  private _compositor: HdxFullscreenShader | null = null
  private _parameterData = {
    invProjMatrix: new GfMatrix4f(1.0),
    viewToWorldMatrix: new GfMatrix4f(1.0),
    lightTransform: new GfMatrix4f(1.0),
  }

  /** skydomeTask.cpp:35-42 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** skydomeTask.cpp:44 (the destructor). */
  destroy(): void {
    this._compositor?.destroy()
    this._compositor = null
  }

  /** skydomeTask.cpp:46-77 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (!this._compositor) {
      this._compositor = new HdxFullscreenShader(this._getHgi(), 'Skydome')
    }

    if (dirtyBits & HdChangeTracker.DirtyParams) {
      // Following the pattern used in HdxRenderTask, where the params
      // (HdxRenderTaskParams) is optional. If present, use an internal setup
      // task to unpack it. Otherwise rely on the renderPassState from the
      // task context during Execute.
      const valueVt = delegate.Get(this.getId(), HdTokens.params)
      const held = valueVt.IsEmpty() ? undefined : valueVt.UncheckedGet<unknown>()
      if (held instanceof HdxRenderTaskParams) {
        const params = held
        if (!this._setupTask) {
          this._setupTask = new HdxRenderSetupTask(delegate, this.getId())
        }
        this._setupTask.syncParams(delegate, params)
      }
    }
  }

  /** skydomeTask.cpp:79-99 */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    if (this._setupTask) {
      this._setupTask.Prepare(ctx, renderIndex)
    }

    const renderDelegate = renderIndex.getRenderDelegate()
    const currentSettingsVersion = renderDelegate.getRenderSettingsVersion()
    if (this._settingsVersion !== currentSettingsVersion) {
      this._settingsVersion = currentSettingsVersion
      this._skydomeVisibility = renderDelegate.getRenderSetting(
        HdRenderSettingsTokens.domeLightCameraVisibility, true) as boolean
    }

    this._renderIndex = renderIndex
  }

  /** skydomeTask.cpp:101-216 */
  Execute(ctx: HdTaskContext): void {
    // Get the gfxCmdsDesc from the RenderPassState
    const renderPassState = this._getRenderPassState(ctx)
    if (!(renderPassState instanceof HdStRenderPassState)) {
      return
    }
    const hdStRenderPassState = renderPassState
    const gfxCmdsDesc = hdStRenderPassState.makeGraphicsCmdsDesc(
      this._renderIndex as Parameters<HdStRenderPassState['makeGraphicsCmdsDesc']>[0])

    // If the skydome is visible by the camera, get the Domelight's
    // transformation matrix from the lighting Context
    let haveDomeLight = false
    let lightTransform = new GfMatrix4f(1)
    if (this._skydomeVisibility) {
      const lightingContext = HdxTask._getTaskContextData<GlfSimpleLightingContext>(
        ctx, HdxTokens.lightingContext)
      if (lightingContext) {
        const lights = lightingContext.getLights()
        for (let i = 0; i < lightingContext.getNumLightsUsed(); ++i) {
          const light = lights[i]!
          if (light.isDomeLight()) {
            lightTransform = new GfMatrix4f(light.getTransform().getInverse())
            haveDomeLight = true
            break
          }
        }
      }
    }

    const haveColorAOV = gfxCmdsDesc.colorTextures.length !== 0

    // Don't try to render the skydome in an incompatible AOV, for example
    // when doing primId visualization.
    const colorAovIsNonFloatFormat =
      haveColorAOV &&
      gfxCmdsDesc.colorAttachmentDescs.length !== 0 &&
      !HgiIsFloatFormat(gfxCmdsDesc.colorAttachmentDescs[0]!.format)

    const needClear =
      (gfxCmdsDesc.depthAttachmentDesc.loadOp === HgiAttachmentLoadOp.HgiAttachmentLoadOpClear) ||
      (gfxCmdsDesc.colorAttachmentDescs.length !== 0 &&
        (gfxCmdsDesc.colorAttachmentDescs[0]!.loadOp === HgiAttachmentLoadOp.HgiAttachmentLoadOpClear))

    // If the skydome is not camera visible in a colorAOV or there is no
    // domelight/skydomeTexture, we can bail.
    if (!this._skydomeVisibility || !haveColorAOV || colorAovIsNonFloatFormat ||
      !haveDomeLight || this._texturesLoading() || !this._getSkydomeTexture(ctx)) {
      if (needClear) {
        // If we need to clear, do so before the early out.
        void this._getHgi().submitCmds(
          this._getHgi().createGraphicsCmds(gfxCmdsDesc))
      }
      return
    }

    // Otherwise, set the fragment shader for the fullscreenShader
    this._setFragmentShader()

    // Get the Inverse Projection and View To World Matrices
    const invProjMatrix = new GfMatrix4f(
      hdStRenderPassState.getProjectionMatrix().getInverse())
    const viewToWorldMatrix = new GfMatrix4f(
      hdStRenderPassState.getWorldToViewMatrix().getInverse())

    // Update the Parameter Buffer if needed
    if (this._updateParameterBuffer(invProjMatrix, viewToWorldMatrix, lightTransform)) {
      const data = new Float32Array(48)
      const put = (m: GfMatrix4f, at: number) => {
        for (let r = 0; r < 4; ++r) for (let c = 0; c < 4; ++c) data[at + r * 4 + c] = m.getElement(r, c)
      }
      put(this._parameterData.invProjMatrix, 0)
      put(this._parameterData.viewToWorldMatrix, 16)
      put(this._parameterData.lightTransform, 32)
      this._compositor!.setShaderConstants(data.byteLength, data)
    }

    // Bind the skydome texture
    this._compositor!.bindTextures([this._skydomeTexture], [this._skydomeSampler])

    // Get the viewport size
    const viewport = hdStRenderPassState.computeViewport()

    // Get the Color/Depth and Color/Depth Resolve Textures from the gfxCmdsDesc
    // so that the fullscreenShader can use them to create the appropriate
    // HgiGraphicsPipeline, HgiGraphicsCmdsDesc, and HgiGraphicsCmds
    const colorDst = gfxCmdsDesc.colorTextures.length === 0
      ? new HgiHandle() as HgiTextureHandle
      : gfxCmdsDesc.colorTextures[0]!
    const colorResolveDst = gfxCmdsDesc.colorResolveTextures.length === 0
      ? new HgiHandle() as HgiTextureHandle
      : gfxCmdsDesc.colorResolveTextures[0]!
    const depthDst = gfxCmdsDesc.depthTexture
    const depthResolveDst = gfxCmdsDesc.depthResolveTexture

    // Pass in clear info.
    if (needClear) {
      const clearColor = gfxCmdsDesc.colorAttachmentDescs.length === 0
        ? new GfVec4f(0, 0, 0, 0)
        : gfxCmdsDesc.colorAttachmentDescs[0]!.clearValue
      const clearDepth = gfxCmdsDesc.depthAttachmentDesc.clearValue
      this._compositor!.setClearState(clearColor, clearDepth)
    }

    // Draw the Skydome
    this._compositor!.draw(colorDst, colorResolveDst,
      depthDst, depthResolveDst, viewport)
  }

  /** skydomeTask.cpp:218-234 */
  private _getRenderPassState(ctx: HdTaskContext): HdRenderPassState | null {
    if (this._setupTask) {
      // If HdxRenderTaskParams is set on this task, we will have created an
      // internal HdxRenderSetupTask in _Sync, to sync and unpack the params,
      // and we should use the resulting resources.
      return this._setupTask.getRenderPassState()
    } else {
      // Otherwise, we expect an application-created HdxRenderSetupTask to
      // have run and put the renderpass resources in the task context.
      // See HdxRenderSetupTask::_Execute.
      return HdxTask._getTaskContextData<HdRenderPassState>(ctx, HdxTokens.renderPassState) ?? null
    }
  }

  /** Storm textures still waiting for their load (see the header). */
  private _texturesLoading(): boolean {
    const registry = this._renderIndex?.getResourceRegistry() as
      { _getTextureHandleRegistry?(): { getTextureObjectRegistry(): { hasUncommittedTextures(): boolean } } } | null | undefined
    return registry?._getTextureHandleRegistry?.().getTextureObjectRegistry().hasUncommittedTextures() ?? false
  }

  /** skydomeTask.cpp:236-276 */
  private _getSkydomeTexture(ctx: HdTaskContext): boolean {
    // Get the texture from the Lighting Shader
    const lightingShader = HdxTask._getTaskContextData<unknown>(ctx, HdxTokens.lightingShader)
    if (lightingShader === undefined) {
      return false
    }
    if (!(lightingShader instanceof HdStSimpleLightingShader)) {
      return false
    }
    const domeLightCubemapHandle =
      lightingShader.getDomeLightEnvironmentCubemapTextureHandle()
    if (!domeLightCubemapHandle) {
      return false
    }
    const domeLightTextureObject = domeLightCubemapHandle.getTextureObject()
    if (!(domeLightTextureObject instanceof HdStUvTextureObject) ||
      !domeLightTextureObject.isValid()) {
      return false
    }
    const domeLightSamplerObject = domeLightCubemapHandle.getSamplerObject()
    if (!(domeLightSamplerObject instanceof HdStUvSamplerObject)) {
      return false
    }
    this._skydomeTexture = domeLightTextureObject.getTexture()
    this._skydomeSampler = domeLightSamplerObject.getSampler()

    return true
  }

  /** skydomeTask.cpp:278-303 */
  private _setFragmentShader(): void {
    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.debugName = _tokens.skydomeFrag
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment

    HgiShaderFunctionAddStageInput(fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddTexture(fragDesc,
      'skydomeTexture',
      /* bindIndex = */0,
      /* dimensions = */2,
      HgiFormat.HgiFormatFloat16Vec4,
      HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture)
    HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')
    HgiShaderFunctionAddStageOutput(
      fragDesc, 'gl_FragDepth', 'float', HgiShaderKeywordTokens.hdDepthAny)

    // The order of the constant parameters has to match the order in the
    // _ParameterBuffer struct
    HgiShaderFunctionAddConstantParam(fragDesc, 'invProjMatrix', 'mat4')
    HgiShaderFunctionAddConstantParam(fragDesc, 'viewToWorld', 'mat4')
    HgiShaderFunctionAddConstantParam(fragDesc, 'lightTransform', 'mat4')
    // XXX: add farPlane in case we mess with depth range?

    this._compositor!.setProgram(
      HdxPackageSkydomeShader(), _tokens.skydomeFrag, fragDesc)
  }

  /** skydomeTask.cpp:305-320. Returns true if the values were updated.
   *  False if unchanged. */
  private _updateParameterBuffer(invProjMatrix: GfMatrix4f, viewToWorldMatrix: GfMatrix4f,
    lightTransform: GfMatrix4f): boolean {
    // All data is still the same, no need to update the storage buffer
    if (invProjMatrix.equals(this._parameterData.invProjMatrix) &&
      viewToWorldMatrix.equals(this._parameterData.viewToWorldMatrix) &&
      lightTransform.equals(this._parameterData.lightTransform)) {
      return false
    }

    this._parameterData.invProjMatrix = invProjMatrix
    this._parameterData.viewToWorldMatrix = viewToWorldMatrix
    this._parameterData.lightTransform = lightTransform
    return true
  }
}
