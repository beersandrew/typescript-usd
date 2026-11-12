// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/shadowTask.cpp,
//  pxr/imaging/hdx/shadowTask.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/shadowTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index
//   (hd/src/renderIndex.ts); `*dirtyBits = Clean` is that.
// - HdxShadowTaskParams is a class held in VtValue under
//   HdxShadowTaskParamsType; operator== is Equals(), operator<< is not
//   ported.
// - GlfSimpleShadowArray::SetTextures (shadowTask.cpp:388): the GL texture
//   names of the shadow maps are handed to the shadow array for Presto only;
//   this repository's GlfSimpleShadowArray has no GL textures
//   (glf/src/simpleShadowArray.ts, PLATFORM-DIVERGENCE(glf-shadow-gl)), so the
//   call is not made. The layout transitions around it are made.
// - HDX_DEBUG_DUMP_SHADOW_TEXTURES (shadowTask.cpp:436-482) writes the
//   shadow maps through HioImage; this repository's hio has no image
//   writers, so the debug dump posts a status message only.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { Vec2f as GfVec2f, Vec4d as GfVec4d, Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  ChangeTracker as HdChangeTracker,
  CompareFunction as HdCompareFunction,
  CullStyle as HdCullStyle,
  InvertCullStyle as HdInvertCullStyle,
  LightTokens as HdLightTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderPassAovBinding as HdRenderPassAovBinding,
  RprimCollection as HdRprimCollection,
  Task as HdTask,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type RenderPass as HdRenderPass,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { HgiTextureUsageBits, type HgiTextureHandle } from 'typescript-usd/hgi'
import type { SimpleLightingContext as GlfSimpleLightingContext } from 'typescript-usd/glf'
import {
  Light as HdStLight,
  MaterialTagTokens as HdStMaterialTagTokens,
  RenderPassShader as HdStRenderPassShader,
  RenderPassState as HdStRenderPassState,
  SimpleLightingShader as HdStSimpleLightingShader,
  _RenderPass as HdSt_RenderPass,
} from 'typescript-usd/hdSt'
import { HdxDebugCodes } from './debugCodes.ts'
import { HdxPackageRenderPassShadowShader } from './package.ts'
import { HdxTokens } from './tokens.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** shadowTask.h:42-68 */
export class HdxShadowTaskParams {
  // RenderPassState
  overrideColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  wireframeColor = new GfVec4f(0.0, 0.0, 0.0, 0.0)
  enableLighting = false
  alphaThreshold = 0.0
  depthBiasEnable = false
  depthBiasConstantFactor = 0.0
  depthBiasSlopeFactor = 1.0
  depthFunc: HdCompareFunction = HdCompareFunction.HdCmpFuncLEqual
  cullStyle: HdCullStyle = HdCullStyle.HdCullStyleBackUnlessDoubleSided

  /** The struct's copy. */
  Clone(): HdxShadowTaskParams {
    return Object.assign(new HdxShadowTaskParams(), this)
  }

  /** shadowTask.cpp:524-537 (operator==) */
  Equals(rhs: HdxShadowTaskParams): boolean {
    return this.overrideColor.equals(rhs.overrideColor) &&
      this.wireframeColor.equals(rhs.wireframeColor) &&
      this.enableLighting === rhs.enableLighting &&
      this.alphaThreshold === rhs.alphaThreshold &&
      this.depthBiasEnable === rhs.depthBiasEnable &&
      this.depthBiasConstantFactor === rhs.depthBiasConstantFactor &&
      this.depthBiasSlopeFactor === rhs.depthBiasSlopeFactor &&
      this.depthFunc === rhs.depthFunc &&
      this.cullStyle === rhs.cullStyle
  }
}
export const HdxShadowTaskParamsType = TfType.declare('HdxShadowTaskParams')

/** shadowTask.cpp:36-42 */
function _HasDrawItems(pass: HdRenderPass | null, renderTags: readonly string[]): boolean {
  return pass instanceof HdSt_RenderPass && pass.hasDrawItems(renderTags)
}

/** shadowTask.cpp:103-106 */
const _shadowMaterialTags = [
  HdStMaterialTagTokens.defaultMaterialTag,
  HdStMaterialTagTokens.masked,
  HdStMaterialTagTokens.translucentToSelection,
] as const

/** The shadow AOV bindings of the simple lighting shader in the task
 *  context (shadowTask.cpp:264-275, 359-370). */
function _GetShadowAovBindings(ctx: HdTaskContext): readonly HdRenderPassAovBinding[] {
  const lightingShader = ctx.get(HdxTokens.lightingShader)
  if (lightingShader instanceof HdStSimpleLightingShader) {
    return lightingShader.getShadowAovBindings()
  }
  return []
}

/** shadowTask.h:70-112 */
export class HdxShadowTask extends HdTask {
  private _passes: (HdRenderPass | null)[] = []
  private _renderPassStates: HdStRenderPassState[] = []
  private _params = new HdxShadowTaskParams()
  private _renderTags: string[] = []

  /** shadowTask.cpp:44-51 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** shadowTask.cpp:55-308 */
  sync(delegateArg: unknown, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const delegate = delegateArg as HdSceneDelegate
    const renderIndex = delegate.getRenderIndex()
    if (!renderIndex.isSprimTypeSupported(HdPrimTypeTokens.simpleLight)) {
      // Clean to prevent repeated calling.
      return
    }

    // Extract the lighting context information from the task context
    const lightingContext = HdTask._getTaskContextData<GlfSimpleLightingContext>(
      ctx, HdxTokens.lightingContext)
    if (!lightingContext) {
      return
    }

    // Extract the new shadow task params from scene delegate
    const dirtyParams = (dirtyBits & HdChangeTracker.DirtyParams) !== 0
    if (dirtyParams) {
      const params = this._getTaskParams(delegate, HdxShadowTaskParams)
      if (!params) {
        return
      }
      this._params = params.Clone()
    }

    // Update render tags from scene delegate
    if (dirtyBits & HdChangeTracker.DirtyRenderTags) {
      this._renderTags = this._getTaskRenderTags(delegate)
    }

    const glfLights = lightingContext.getLights()
    const shadows = lightingContext.getShadows()
    const numShadowMaps = shadows.getNumShadowMapPasses()

    if (numShadowMaps > 0) {
      // Make sure we have the right number of shadow render passes.
      // We would like to render only prims with the "defaultMaterialTag"
      // (i.e. opaque) or "masked" material tag. Prims with
      // "occludedSelectionShowsThrough" are grouped in a special material
      // tag "translucentToSelection", but otherwise behave the same as
      // opaque/masked.
      // Therefore, we need to make three collections and render passes for
      // what would be the same shadow map pass. This means we must make a
      // distinction between the number of render passes and the number of
      // shadow maps indicated by the shadow array.
      const passCount = _shadowMaterialTags.length * numShadowMaps
      while (this._passes.length < passCount) this._passes.push(null)
      this._passes.length = passCount
      const maskedPassOffset = numShadowMaps
      const ttsPassOffset = numShadowMaps * 2

      // Mostly we can populate the renderpasses from shadow info, but the
      // lights contain the shadow collection; so we need to loop through the
      // lights assigning collections to their shadows.
      for (let lightId = 0; lightId < glfLights.length; ++lightId) {
        const glfLight = glfLights[lightId]!
        if (!glfLight.hasShadow()) {
          continue
        }

        // Shadows are supported on for SimpleLights and DistantLights
        let light = renderIndex.getSprim(
          HdPrimTypeTokens.simpleLight, glfLight.getID()) as HdStLight | undefined
        if (!light) {
          light = renderIndex.getSprim(
            HdPrimTypeTokens.distantLight, glfLight.getID()) as HdStLight | undefined
        }

        TF_VERIFY(light)

        // Extract the collection from the HD light
        const vtShadowCollection = light
          ? light.Get(HdLightTokens.shadowCollection) : VtValue.getEmpty()
        const held = vtShadowCollection.IsEmpty() ? undefined : vtShadowCollection.Get<unknown>()
        const col = held instanceof HdRprimCollection ? held : new HdRprimCollection()

        // Only want opaque or masked prims to appear in shadow pass, so
        // make copies of the shadow collection with appropriate
        // material tags
        const newColDefault = col.Clone()
        newColDefault.setMaterialTag(_shadowMaterialTags[0])
        const newColMasked = col.Clone()
        newColMasked.setMaterialTag(_shadowMaterialTags[1])
        const newColTranslucentToSelection = col.Clone()
        newColTranslucentToSelection.setMaterialTag(_shadowMaterialTags[2])

        const shadowStart = glfLight.getShadowIndexStart()
        const shadowEnd = glfLight.getShadowIndexEnd()

        // Note here that we may want to sort the passes by collection
        // to invalidate fewer passes if the collections match already.
        // SetRprimCollection checks for identity changes on the collection
        // and no-ops in that case.
        for (let shadowId = shadowStart; shadowId <= shadowEnd; ++shadowId) {
          // Remember, we have three render passes (one for each
          // collection) per shadow map.
          // First the "defaultMaterialTag" passes.
          this._setOrCreatePass(renderIndex, shadowId, newColDefault)

          // Then the "masked" materialTag passes
          this._setOrCreatePass(renderIndex, shadowId + maskedPassOffset, newColMasked)

          // Then the "translucentToSelection" materialTag passes
          this._setOrCreatePass(renderIndex, shadowId + ttsPassOffset,
            newColTranslucentToSelection)
        }
      }

      // Shrink down to fit to conserve resources
      if (this._renderPassStates.length > this._passes.length) {
        this._renderPassStates.length = this._passes.length
      }

      // Ensure all passes have the right params set.
      if (dirtyParams) {
        for (const state of this._renderPassStates) {
          this._updateDirtyParams(state, this._params)
        }
      }

      // Add new states if the number of passes has grown
      if (this._renderPassStates.length < this._passes.length) {
        for (let passId = this._renderPassStates.length;
          passId < this._passes.length; passId++) {
          const renderPassShadowShader =
            new HdStRenderPassShader(HdxPackageRenderPassShadowShader())
          const renderPassState = new HdStRenderPassState(renderPassShadowShader)

          //
          // The pipeline state below merits explanation.
          // Hardcoded state:
          // 1. Depth clamping is enabled, which disables clipping for the
          //    clip-space Z coordinate. So, objects between the shadow
          //    camera and the near plane, and those behind the far plane
          //    may not be clipped.
          // 2, The depth range is set to [0.0, 0.99999] and not [0,1].
          //    This is done to clamps the depth of objects behind the far
          //    plane of the shadow frustum to 1. Note that the hardware
          //    always clamps depth values to [0,1], even when using float
          //    depth buffer formats. See ARB_depth_buffer_float.
          //
          // Configurable state:
          // a. Depth function: This goes hand-in-hand with the shadow
          //    sampler's compare function, the depth range and the clear
          //    value used. All of these are currently hardcoded!
          //    XXX The simple lighting shader hardcodes the compare to
          //        LEQUAL and the clear value to 1.0.
          //        See HdStSimpleLightingShader::AllocateTextureHandles.
          //
          // b. Slope-scale bias:
          //    This offsets the fragment's interpolated depth using the
          //    slope and constant factors.
          //    XXX Do positive values push away or towards the eye?
          //
          renderPassState.setDepthFunc(this._params.depthFunc)
          renderPassState.setDepthBiasUseDefault(!this._params.depthBiasEnable)
          renderPassState.setDepthBiasEnabled(this._params.depthBiasEnable)
          renderPassState.setDepthBias(this._params.depthBiasConstantFactor,
            this._params.depthBiasSlopeFactor)
          renderPassState.setEnableDepthClamp(true)
          renderPassState.setDepthRange(new GfVec2f(0, 0.99999))

          // This state is invariant of parameter changes so set it
          // once.
          renderPassState.setLightingEnabled(false)
          // XXX : This can be removed when Hydra has support for
          //       transparent objects.
          //       We use an epsilon offset from 1.0 to allow for
          //       calculation during primvar interpolation which
          //       doesn't fully saturate back to 1.0.
          const TRANSPARENT_ALPHA_THRESHOLD = Math.fround(1.0 - 1e-6)
          renderPassState.setAlphaThreshold(TRANSPARENT_ALPHA_THRESHOLD)
          // A new state is treated as dirty and needs the params set.
          this._updateDirtyParams(renderPassState, this._params)

          this._renderPassStates.push(renderPassState)
        }
      }

      // Get AOV bindings created by simple lighting shader.
      const shadowAovBindings = _GetShadowAovBindings(ctx)

      for (let passId = 0; passId < this._passes.length; passId++) {
        // Make sure each pass got created. Light shadow indices are
        // supposed to be compact (see simpleLightTask.cpp).
        const pass = this._passes[passId]
        if (!TF_VERIFY(pass)) {
          continue
        }

        // Because we create three render passes for each shadow map,
        // we must convert the index.
        const shadowMapId = passId % numShadowMaps

        const shadowMapRes = shadows.getShadowMapSize(shadowMapId)

        // Set camera framing based on the shadow map's, which is computed
        // in HdxSimpleLightTask.
        this._renderPassStates[passId]!.setCameraFramingState(
          shadows.getViewMatrix(shadowMapId),
          shadows.getProjectionMatrix(shadowMapId),
          new GfVec4d(0, 0, shadowMapRes.get(0), shadowMapRes.get(1)),
          [])

        // Set AOV bindings.
        if (shadowMapId < shadowAovBindings.length) {
          if (passId === shadowMapId) {
            this._renderPassStates[passId]!.setAovBindings(
              [shadowAovBindings[shadowMapId]!])
          } else {
            // Don't want "masked"/"translucentToSelection"
            // render passes to clear.
            const src = shadowAovBindings[shadowMapId]!
            const aovBindingCopy = new HdRenderPassAovBinding()
            aovBindingCopy.aovName = src.aovName
            aovBindingCopy.renderBuffer = src.renderBuffer
            aovBindingCopy.renderBufferId = src.renderBufferId
            aovBindingCopy.aovSettings = new Map(src.aovSettings)
            aovBindingCopy.clearValue = undefined
            this._renderPassStates[passId]!.setAovBindings([aovBindingCopy])
          }
        }

        pass!.sync()
      }
    }
  }

  // shadowTask.cpp:163-196 (one of the three if/else blocks)
  private _setOrCreatePass(renderIndex: HdRenderIndex, passId: number,
    collection: HdRprimCollection): void {
    const pass = this._passes[passId]
    if (pass) {
      pass.setRprimCollection(collection)
    } else {
      this._passes[passId] = new HdSt_RenderPass(renderIndex, collection)
    }
  }

  /** shadowTask.cpp:310-334 */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    const lightingContext = HdTask._getTaskContextData<GlfSimpleLightingContext>(
      ctx, HdxTokens.lightingContext)
    if (!lightingContext) {
      return
    }

    const shadows = lightingContext.getShadows()
    if (shadows.getNumShadowMapPasses() === 0) {
      // Bail if we are not generating shadow maps. We don't want to call
      // Prepare on outdated AOV bindings.
      return
    }

    const resourceRegistry = renderIndex.getResourceRegistry()

    for (let passId = 0; passId < this._passes.length; passId++) {
      this._renderPassStates[passId]!.Prepare(resourceRegistry as never)
    }
  }

  /** shadowTask.cpp:336-489 */
  Execute(ctx: HdTaskContext): void {
    // Extract the lighting context information from the task context
    const lightingContext = HdTask._getTaskContextData<GlfSimpleLightingContext>(
      ctx, HdxTokens.lightingContext)
    if (!lightingContext) {
      return
    }

    // Generate the actual shadow maps
    const shadows = lightingContext.getShadows()
    const numShadowMaps = shadows.getNumShadowMapPasses()
    const maskedPassOffset = numShadowMaps
    const ttsPassOffset = numShadowMaps * 2

    // Get AOV bindings.
    const shadowAovBindings = _GetShadowAovBindings(ctx)

    // Though we no longer use GlfSimpleShadowArray's raw GL code to capture
    // shadows in Hdx, Presto expects the textures in GlfSimpleShadowArray to
    // contain the shadows captured here (see the header on SetTextures).
    const textureHandles: HgiTextureHandle[] = []
    for (let shadowId = 0; shadowId < numShadowMaps; shadowId++) {
      if (shadowId < shadowAovBindings.length) {
        const renderBuffer = shadowAovBindings[shadowId]!.renderBuffer as
          { getResource(multiSampled: boolean): unknown } | null | undefined
        const aov = renderBuffer?.getResource(false) as HgiTextureHandle | undefined
        if (aov && aov.isSet()) {
          // While we're here, transition layout of texture to depth
          // target. Store textures in vector so we can transition
          // back after shadow render passes complete.
          aov.Get()!.submitLayoutChange(HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget)
          textureHandles.push(aov)
        }
      }
    }

    for (let shadowId = 0; shadowId < numShadowMaps; shadowId++) {
      // Make sure each pass got created. Light shadow indices are supposed
      // to be compact (see simpleLightTask.cpp).
      if (!TF_VERIFY(this._passes[shadowId]) ||
        !TF_VERIFY(this._passes[shadowId + maskedPassOffset]) ||
        !TF_VERIFY(this._passes[shadowId + ttsPassOffset])) {
        continue
      }

      // Render the actual geometry in the "defaultMaterialTag" collection.
      // Always execute this render pass because it clears the AOVs.
      this._passes[shadowId]!.Execute(
        this._renderPassStates[shadowId]!,
        this.getRenderTags())

      if (_HasDrawItems(this._passes[shadowId + maskedPassOffset]!,
        this.getRenderTags())) {
        // Render the actual geometry in the "masked" materialTag collection
        this._passes[shadowId + maskedPassOffset]!.Execute(
          this._renderPassStates[shadowId + maskedPassOffset]!,
          this.getRenderTags())
      }

      if (_HasDrawItems(this._passes[shadowId + ttsPassOffset]!,
        this.getRenderTags())) {
        // Render the actual geometry in the "translucentToSelection"
        // materialTag collection
        this._passes[shadowId + ttsPassOffset]!.Execute(
          this._renderPassStates[shadowId + ttsPassOffset]!,
          this.getRenderTags())
      }
    }

    if (TfDebug.isEnabled(HdxDebugCodes.HDX_DEBUG_DUMP_SHADOW_TEXTURES)) {
      // See the header: no HioImage writers here.
      console.info('HdxShadowTask: HDX_DEBUG_DUMP_SHADOW_TEXTURES has no ' +
        'image writer in this build')
    }

    // Transition layout of shadows maps to shader read for next render tasks.
    for (const texture of textureHandles) {
      texture.Get()!.submitLayoutChange(HgiTextureUsageBits.HgiTextureUsageBitsShaderRead)
    }
  }

  /** shadowTask.cpp:491-495 */
  override getRenderTags(): readonly string[] {
    return this._renderTags
  }

  /** shadowTask.cpp:497-504 */
  private _updateDirtyParams(renderPassState: HdStRenderPassState,
    params: HdxShadowTaskParams): void {
    renderPassState.setOverrideColor(params.overrideColor)
    renderPassState.setWireframeColor(params.wireframeColor)
    renderPassState.setCullStyle(HdInvertCullStyle(params.cullStyle))
  }
}
