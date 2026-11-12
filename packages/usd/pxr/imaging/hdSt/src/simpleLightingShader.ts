// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/simpleLightingShader.cpp,
//  pxr/imaging/hdSt/simpleLightingShader.h,
//  pxr/imaging/hdx/simpleLightTask.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/simpleLightingShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - ID is a bigint (TfHash); a cache key only. The hash combines the same
//   values in the same order as upstream (simpleLightingShader.cpp:70-100).
// - _maxLights is uninitialized by the upstream constructor (set by
//   HdxSimpleLightTask::Sync through SetMaxLights); here it starts at 16,
//   HdxSimpleLightTask's default (hdx/simpleLightTask.cpp:44).
// - shared_from_this(): `this`.
// - Texture handle lifetime: upstream holds HdStTextureHandleSharedPtr's;
//   here the shader Release()s a handle when it drops its last reference to
//   it (textureHandle.ts header), in _ReleaseHandles below.
// - Pooled render buffer lifetime: the unique_ptr assignment that drops a
//   shadow buffer upstream is an explicit Destroy() of the dropped one
//   (renderBufferPool.ts header).

import { Token as TfToken, HashCombine as TfHashCombine, Hash as TfHash } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec4f as GfVec4f, type Matrix4d as GfMatrix4d, type Vec2i as GfVec2i } from 'typescript-usd/gf'
import {
  AovDescriptor as HdAovDescriptor,
  AovTokens as HdAovTokens,
  BorderColor as HdBorderColor,
  CompareFunction as HdCompareFunction,
  Format as HdFormat,
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  RenderPassAovBinding as HdRenderPassAovBinding,
  SamplerParameters as HdSamplerParameters,
  Wrap as HdWrap,
  type RenderIndex as HdRenderIndex,
  type RenderParam as HdRenderParam,
} from 'typescript-usd/hd'
import type { Hgi, HgiTextureDesc } from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import { SimpleLightingContext as GlfSimpleLightingContext, type SimpleLight as GlfSimpleLight } from 'typescript-usd/glf'
import type { HdStBindingRequest } from './binding.ts'
import { HdStTextureType } from './enums.ts'
import { HdStLightingShader } from './lightingShader.ts'
import { HdSt_MaterialParam } from './materialParam.ts'
import { HdStPackageSimpleLightingShader } from './package.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  type HdStShaderCodeID,
  type HdStShaderCodeNamedTextureHandle,
  type HdStShaderCodeResourceContext,
} from './shaderCode.ts'
import {
  HdStAssetUvSubtextureIdentifier,
  HdStDynamicCubemapSubtextureIdentifier,
  HdStDynamicUvSubtextureIdentifier,
} from './subtextureIdentifier.ts'
import type { HdStTextureHandle } from './textureHandle.ts'
import { HdSt_TextureBinder } from './textureBinder.ts'
import { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStAssetUvTextureObject } from './textureObject.ts'
import { HdStComputeQueue } from './resourceRegistry.ts'
import { HdStTokens } from './tokens.ts'
import type { HdStPooledRenderBufferUniquePtr } from './renderBufferPool.ts'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'
import {
  HdSt_ComputeDomeLightCubemapWidth,
  HdSt_DomeLightComputationGPU,
  HdSt_DomeLightMipmapComputationGPU,
} from './domeLightComputations.ts'

/** simpleLightingShader.cpp:36-42 */
const _tokens = {
  domeLightCubemap: TfToken('domeLightCubemap'),
  domeLightIrradiance: TfToken('domeLightIrradiance'),
  domeLightPrefilter: TfToken('domeLightPrefilter'),
  domeLightBRDF: TfToken('domeLightBRDF'),
}

type _PooledRenderBuffer = HdStPooledRenderBufferUniquePtr

/** Drops the shader's references to texture handles (the shared_ptr
 *  destructors upstream): handles no longer referenced by `kept` are
 *  Release()d. */
function _ReleaseHandles(dropped: readonly (HdStTextureHandle | null | undefined)[],
  kept: readonly (HdStTextureHandle | null | undefined)[] = []): void {
  const keep = new Set(kept)
  for (const handle of new Set(dropped)) {
    if (handle && !keep.has(handle)) handle.release()
  }
}

/** simpleLightingShader.cpp:145-155 */
function _HasDomeLight(ctx: GlfSimpleLightingContext): boolean {
  for (const light of ctx.getLights()) {
    if (light.isDomeLight()) {
      return true
    }
  }
  return false
}

/** simpleLightingShader.cpp:269-302 */
function _GetResolvedDomeLightEnvironmentFilePath(ctx: GlfSimpleLightingContext | null): string {
  const empty = ''

  if (!ctx) {
    return empty
  }

  const lights: readonly GlfSimpleLight[] = ctx.getLights()
  for (let i = lights.length - 1; i >= 0; --i) {
    const it = lights[i]!
    if (it.isDomeLight()) {
      const path = it.getDomeLightTextureFile()
      const assetPath = path.getAssetPath()
      if (assetPath === '') {
        TF_WARN('Dome light has no texture asset path.')
        return empty
      }

      const resolvedPath = path.getResolvedPath()
      if (resolvedPath === '') {
        TF_WARN(`Texture asset path '${assetPath}' for dome light could not be resolved.`)
      }
      return resolvedPath
    }
  }

  return empty
}

/** simpleLightingShader.cpp:334-371 (_MakeNamedTextureHandle<textureType>) */
function _MakeNamedTextureHandle(
  textureType: HdStTextureType,
  name: TfToken,
  texturePath: string,
  wrapModeS: HdWrap,
  wrapModeT: HdWrap,
  wrapModeR: HdWrap,
  minFilter: HdMinFilter,
  resourceRegistry: HdStResourceRegistry,
  shader: HdStSimpleLightingShader,
): HdStShaderCodeNamedTextureHandle {
  const textureId = new HdStTextureIdentifier(
    TfToken(texturePath + '[' + name + ']'),
    textureType === HdStTextureType.Cubemap
      ? new HdStDynamicCubemapSubtextureIdentifier()
      : new HdStDynamicUvSubtextureIdentifier())

  const samplerParameters = new HdSamplerParameters(
    wrapModeS, wrapModeT, wrapModeR,
    minFilter, HdMagFilter.HdMagFilterLinear,
    HdBorderColor.HdBorderColorTransparentBlack,
    /*enableCompare*/false, HdCompareFunction.HdCmpFuncNever,
    /*maxAnisotropy*/1)

  const textureHandle = resourceRegistry.allocateTextureHandle(
    textureId,
    textureType,
    samplerParameters,
    /* memoryRequest = */ 0,
    shader)

  return {
    name,
    type: textureType,
    handles: textureHandle ? [textureHandle] : [],
    hash: TfHash(name),
  }
}

/** simpleLightingShader.h:44-182. A shader that supports simple lighting
 *  functionality. */
export class HdStSimpleLightingShader extends HdStLightingShader {
  private readonly _lightingContext: GlfSimpleLightingContext
  private readonly _glslfx: HioGlslfx

  // Lexicographic ordering for stable output between runs.
  private readonly _customBuffers = new Map<string, HdStBindingRequest>()

  // The environment map used as source for the dome light textures.
  //
  // Handle is allocated in AllocateTextureHandles. Actual loading
  // happens during commit.
  private _domeLightEnvironmentTextureHandle: HdStTextureHandle | null = null

  // Other dome light textures.
  private _namedTextureHandles: HdStShaderCodeNamedTextureHandle[] = []

  private _domeLightTextureHandles: HdStShaderCodeNamedTextureHandle[] = []

  // Maximum target memory of computed dome light cubemap texture (in MB)
  private _domeLightCubemapTargetMemoryMB: number

  private readonly _shadowTextureHandle: HdStShaderCodeNamedTextureHandle

  private _lightTextureParams: HdSt_MaterialParam[] = []

  private _renderParam: HdRenderParam | null

  private _shadowAovBindings: HdRenderPassAovBinding[] = []

  private _shadowBuffers: (_PooledRenderBuffer | null)[] = []

  private _shadowBufferFallback: _PooledRenderBuffer | null = null

  private _maxLights: number
  private readonly _maxShadows: number

  /** simpleLightingShader.cpp:45-62 */
  constructor(hgi: Hgi | null) {
    super()
    this._lightingContext = GlfSimpleLightingContext.new()
    this._glslfx = new HioGlslfx(HdStPackageSimpleLightingShader())
    this._domeLightCubemapTargetMemoryMB = 0
    this._shadowTextureHandle = {
      name: HdStTokens.shadowCompareTextures as TfToken,
      type: HdStTextureType.Uv,
      handles: [],
      hash: TfHash(HdStTokens.shadowCompareTextures),
    }
    this._renderParam = null
    this._maxLights = 16
    this._maxShadows = hgi
      ? Math.min(32, Math.floor(hgi.getCapabilities()!.getMaxSamplersPerShaderStage() / 2))
      : 16
  }

  /** simpleLightingShader.cpp:69-100 */
  override computeHash(): HdStShaderCodeID {
    const glslfxFile = HdStPackageSimpleLightingShader()
    const useShadows = this._lightingContext.getUseShadows()
    const useLighting = this._lightingContext.getUseLighting()

    let hash = TfHash(glslfxFile)
    hash = TfHashCombine(
      hash,
      useLighting,
      this._maxLights,
      useShadows,
      this._lightingContext.computeShaderSourceHash(),
    )

    for (const namedHandle of this._namedTextureHandles) {
      // Use name and hash only - not the texture itself as this
      // does not affect the generated shader source.
      hash = TfHashCombine(
        hash,
        namedHandle.name,
        namedHandle.hash,
      )
    }

    return hash
  }

  /** simpleLightingShader.cpp:102-132 */
  override getSource(shaderStageKey: TfToken): string {
    const source = this._glslfx.getSource(shaderStageKey)

    if (source === '') return source

    let defineStream = ''
    const maxLights =
      this._lightingContext.getUseLighting() ? this._maxLights : 0
    const useShadows = this._lightingContext.getUseShadows()
    const numShadows =
      useShadows ? this.getMaxShadows() : 0
    defineStream += '#define NUM_LIGHTS ' + maxLights + '\n'
    defineStream += '#define USE_SHADOWS ' + (useShadows ? 1 : 0) + '\n'
    defineStream += '#define NUM_SHADOWS ' + numShadows + '\n'

    const postSurfaceShader =
      this._lightingContext.computeShaderSource(shaderStageKey)

    if (postSurfaceShader !== '') {
      defineStream += '#define HD_HAS_postSurfaceShader\n'
    }

    return defineStream + postSurfaceShader + source
  }

  /** simpleLightingShader.cpp:134-141 */
  override setCamera(worldToViewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d): void {
    this._lightingContext.setCamera(worldToViewMatrix, projectionMatrix)
  }

  /** simpleLightingShader.cpp:157-167 */
  override bindResources(_program: number, binder: HdSt_ResourceBinder): void {
    for (const buffer of this._sortedCustomBuffers()) {
      binder.bind(buffer)
    }

    HdSt_TextureBinder.bindResources(binder, this._namedTextureHandles)
  }

  /** simpleLightingShader.cpp:169-179 */
  override unbindResources(_program: number, binder: HdSt_ResourceBinder): void {
    for (const buffer of this._sortedCustomBuffers()) {
      binder.unbind(buffer)
    }

    HdSt_TextureBinder.unbindResources(binder, this._namedTextureHandles)
  }

  /** std::map<TfToken, ...> iteration order (lexicographic). */
  private _sortedCustomBuffers(): HdStBindingRequest[] {
    return [...this._customBuffers.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
      .map(k => this._customBuffers.get(k)!)
  }

  /** Add a custom binding request for use when this shader executes.
   *  simpleLightingShader.cpp:181-185 */
  addBufferBinding(req: HdStBindingRequest): void {
    this._customBuffers.set(req.getName(), req)
  }

  /** Remove \p name from custom binding. simpleLightingShader.cpp:187-191 */
  removeBufferBinding(name: TfToken | string): void {
    this._customBuffers.delete(name)
  }

  /** Clear all custom bindings associated with this shader.
   *  simpleLightingShader.cpp:193-197 */
  clearBufferBindings(): void {
    this._customBuffers.clear()
  }

  /** simpleLightingShader.cpp:199-260 */
  override addBindings(customBindings: HdStBindingRequest[]): void {
    for (const it of this._sortedCustomBuffers()) {
      customBindings.push(it)
    }

    this._lightTextureParams = []

    // For now we assume that the only simple light with a texture is
    // a domeLight (ignoring RectLights, and multiple domeLights)
    if (_HasDomeLight(this._lightingContext) && this._domeLightEnvironmentTextureHandle) {
      const zero = () => VtValue.create(new GfVec4f(0.0, 0.0, 0.0, 0.0), VtValueTypes.GfVec4f)
      // cubemap generated from texture
      this._lightTextureParams.push(new HdSt_MaterialParam(
        HdSt_MaterialParam.ParamTypeTexture,
        _tokens.domeLightCubemap,
        zero(),
        [],
        HdStTextureType.Cubemap))
      // irradiance map
      this._lightTextureParams.push(new HdSt_MaterialParam(
        HdSt_MaterialParam.ParamTypeTexture,
        _tokens.domeLightIrradiance,
        zero(),
        [],
        HdStTextureType.Cubemap))
      // prefilter map
      this._lightTextureParams.push(new HdSt_MaterialParam(
        HdSt_MaterialParam.ParamTypeTexture,
        _tokens.domeLightPrefilter,
        zero(),
        [],
        HdStTextureType.Cubemap))
      // BRDF texture
      this._lightTextureParams.push(new HdSt_MaterialParam(
        HdSt_MaterialParam.ParamTypeTexture,
        _tokens.domeLightBRDF,
        zero(),
        [],
        HdStTextureType.Uv))
    }

    if (this._lightingContext.getUseShadows()) {
      // Create one param for all shadow passes as shadow compare textures
      // will be bound to shader as an array of samplers.
      this._lightTextureParams.push(new HdSt_MaterialParam(
        HdSt_MaterialParam.ParamTypeTexture,
        HdStTokens.shadowCompareTextures as TfToken,
        VtValue.create(new GfVec4f(0.0, 0.0, 0.0, 0.0), VtValueTypes.GfVec4f),
        [],
        HdStTextureType.Uv,
        /*swizzle*/'',
        /*isPremultiplied*/false,
        /*arrayOfTexturesSize*/this.getMaxShadows()))
    }
  }

  /** simpleLightingShader.cpp:262-266 */
  override getParams(): readonly HdSt_MaterialParam[] {
    return this._lightTextureParams
  }

  /** simpleLightingShader.h:118-120 */
  getLightingContext(): GlfSimpleLightingContext {
    return this._lightingContext
  }

  /** Get one of the textures that need to be computed from the dome light
   *  environment map. simpleLightingShader.cpp:304-317 */
  getTextureHandle(name: TfToken | string): HdStTextureHandle | null {
    // This is used specfically for dome lights, so ok to just return first
    // handle.
    for (const namedTextureHandle of this._namedTextureHandles) {
      if (namedTextureHandle.name === name) {
        return namedTextureHandle.handles[0] ?? null
      }
    }

    return null
  }

  /** The dome light environment map used as source for the other dome
   *  light textures. simpleLightingShader.h:131-134 */
  getDomeLightEnvironmentTextureHandle(): HdStTextureHandle | null {
    return this._domeLightEnvironmentTextureHandle
  }

  /** The dome light environment cubemap texture generated from the
   *  latlong dome light texture. simpleLightingShader.cpp:319-323 */
  getDomeLightEnvironmentCubemapTextureHandle(): HdStTextureHandle | null {
    return this.getTextureHandle(_tokens.domeLightCubemap)
  }

  /** simpleLightingShader.h:155-157 */
  getShadowAovBindings(): readonly HdRenderPassAovBinding[] {
    return this._shadowAovBindings
  }

  /** Limit set based to half the max samplers allowed by selected Hgi
   *  backend. simpleLightingShader.h:165-168 */
  getMaxShadows(): number {
    return this._maxShadows
  }

  /** simpleLightingShader.cpp:375-380 */
  private _cleanupAovBindings(): void {
    this._shadowAovBindings = []
    _ReleaseHandles(this._shadowTextureHandle.handles)
    this._shadowTextureHandle.handles = []
  }

  /** Allocates texture handles (texture loading happens later during
   *  commit) needed for lights.
   *
   *  Call after lighting context has been set or updated in Sync-phase.
   *  simpleLightingShader.cpp:382-497 */
  allocateTextureHandles(renderIndex: HdRenderIndex, graphPath: string): void {
    const resolvedPath =
      _GetResolvedDomeLightEnvironmentFilePath(this._lightingContext)
    const useShadows = this._lightingContext.getUseShadows()
    if (resolvedPath === '') {
      _ReleaseHandles([this._domeLightEnvironmentTextureHandle,
        ...this._domeLightTextureHandles.flatMap(n => n.handles)])
      this._domeLightEnvironmentTextureHandle = null
      this._domeLightTextureHandles = []
    }

    if (!useShadows) {
      this._cleanupAovBindings()
    }

    if (resolvedPath === '' && !useShadows) {
      this._namedTextureHandles = []
      return
    }

    let recomputeDomeLightTextures = resolvedPath !== ''
    if (this._domeLightEnvironmentTextureHandle) {
      const textureObject =
        this._domeLightEnvironmentTextureHandle!.getTextureObject()
      const textureId = textureObject!.GetTextureIdentifier()
      if (textureId.getFilePath() === resolvedPath) {
        // Same environment map, no need to recompute
        // dome light textures.
        recomputeDomeLightTextures = false
      }
    }

    // Store render index for render buffer destruction.
    this._renderParam = renderIndex.getRenderDelegate().getRenderParam() ?? null

    const resourceRegistry =
      renderIndex.getResourceRegistry() as unknown as HdStResourceRegistry | null
    if (!TF_VERIFY(resourceRegistry)) {
      return
    }

    // Allocate texture handles for dome light textures.
    if (recomputeDomeLightTextures) {
      // The handles dropped here are released once their replacements
      // are allocated (shared_ptr assignment order).
      const droppedHandles = [this._domeLightEnvironmentTextureHandle,
        ...this._domeLightTextureHandles.flatMap(n => n.handles)]
      this._domeLightTextureHandles = []

      const textureId = new HdStTextureIdentifier(
        TfToken(resolvedPath),
        new HdStAssetUvSubtextureIdentifier(
          /* flipVertically = */ true,
          /* premultiplyAlpha = */ false,
          /* sourceColorSpace = */ HdStTokens.colorSpaceAuto as TfToken))

      const envSamplerParameters = new HdSamplerParameters(
        HdWrap.HdWrapRepeat, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
        HdMinFilter.HdMinFilterLinearMipmapLinear, HdMagFilter.HdMagFilterLinear,
        HdBorderColor.HdBorderColorTransparentBlack,
        /*enableCompare*/false, HdCompareFunction.HdCmpFuncNever,
        /*maxAnisotropy*/1)

      this._domeLightEnvironmentTextureHandle =
        resourceRegistry!.allocateTextureHandle(
          textureId,
          HdStTextureType.Uv,
          envSamplerParameters,
          /* targetMemory = */ 0,
          this)

      this._domeLightTextureHandles = [
        _MakeNamedTextureHandle(HdStTextureType.Cubemap,
          _tokens.domeLightCubemap,
          resolvedPath,
          // Wrap modes irrelevant for seamless cubemaps
          HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinearMipmapLinear,
          resourceRegistry!,
          this),

        _MakeNamedTextureHandle(HdStTextureType.Cubemap,
          _tokens.domeLightIrradiance,
          resolvedPath,
          // Wrap modes irrelevant for seamless cubemaps
          HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinear,
          resourceRegistry!,
          this),

        _MakeNamedTextureHandle(HdStTextureType.Cubemap,
          _tokens.domeLightPrefilter,
          resolvedPath,
          // Wrap modes irrelevant for seamless cubemaps
          HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinearMipmapLinear,
          resourceRegistry!,
          this),

        _MakeNamedTextureHandle(HdStTextureType.Uv,
          _tokens.domeLightBRDF,
          resolvedPath,
          HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
          HdMinFilter.HdMinFilterLinear,
          resourceRegistry!,
          this),
      ]
      _ReleaseHandles(droppedHandles)
    }
    this._namedTextureHandles = [...this._domeLightTextureHandles]

    // Allocate texture handles for shadow map textures.
    if (useShadows) {
      this._allocateShadowTextures(resourceRegistry!, graphPath)
      this._namedTextureHandles.push(this._shadowTextureHandle)
    }
  }

  /** simpleLightingShader.cpp:499-582 */
  private _allocateShadowTextures(resourceRegistry: HdStResourceRegistry, graphPath: string): void {
    const shadows = this._lightingContext.getShadows()
    const numShadowPasses = shadows.getNumShadowMapPasses()
    this._shadowAovBindings.length = numShadowPasses
    for (let i = 0; i < numShadowPasses; i++) {
      this._shadowAovBindings[i] ??= new HdRenderPassAovBinding()
    }
    this._shadowTextureHandle.handles.length = this.getMaxShadows()
    for (const dropped of this._shadowBuffers.slice(numShadowPasses)) dropped?.destroy()
    this._shadowBuffers.length = numShadowPasses

    for (let i = 0; i < numShadowPasses; i++) {
      const dimensions: GfVec2i = shadows.getShadowMapSize(i)
      // Skip allocation if buffer already exists and is correct size
      const existing = this._shadowAovBindings[i]!.renderBuffer as
        { getWidth(): number, getHeight(): number } | null | undefined
      if (existing) {
        if (existing.getWidth() === dimensions.get(0) &&
          existing.getHeight() === dimensions.get(1)) {
          continue
        }
      }

      const oldBuffer = this._shadowBuffers[i]
      this._shadowBuffers[i] =
        resourceRegistry.allocateTempRenderBuffer(
          graphPath,
          HdFormat.HdFormatFloat32,
          dimensions,
          /*multiSampled=*/false,
          /*depth=*/true)
      oldBuffer?.destroy()

      const aovDesc = new HdAovDescriptor(HdFormat.HdFormatFloat32,
        /*multiSampled*/false,
        /*c=*/VtValue.create(Math.fround(1), VtValueTypes.float))

      const binding = this._shadowAovBindings[i]!
      binding.aovName = HdAovTokens.depth
      binding.aovSettings = aovDesc.aovSettings
      binding.renderBufferId = this._shadowBuffers[i]!.getBuffer().getId()
      binding.clearValue = aovDesc.clearValue
      binding.renderBuffer = this._shadowBuffers[i]!.getBuffer() as never

      const shadowSamplerParameters = new HdSamplerParameters(
        HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
        HdMinFilter.HdMinFilterLinear, HdMagFilter.HdMagFilterLinear,
        HdBorderColor.HdBorderColorOpaqueWhite, /*enableCompare*/true,
        HdCompareFunction.HdCmpFuncLEqual, /*maxAnisotropy*/16)

      const oldHandle = this._shadowTextureHandle.handles[i]
      this._shadowTextureHandle.handles[i] =
        resourceRegistry.allocateTextureHandle(
          this._shadowBuffers[i]!.getBuffer().GetTextureIdentifier(false),
          HdStTextureType.Uv,
          shadowSamplerParameters,
          /* memoryRequest = */ 0,
          this)!
      _ReleaseHandles([oldHandle])
    }
    if (!this._shadowBufferFallback) {
      this._shadowBufferFallback = resourceRegistry.allocateTempRenderBuffer(
        graphPath,
        HdFormat.HdFormatFloat32,
        [1, 1],
        /*multiSampled=*/false,
        /*depth=*/true)
    }
    const fallbackParams = new HdSamplerParameters(
      HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
      HdMinFilter.HdMinFilterLinear, HdMagFilter.HdMagFilterLinear,
      HdBorderColor.HdBorderColorOpaqueWhite, /*enableCompare*/true,
      HdCompareFunction.HdCmpFuncLEqual, /*maxAnisotropy*/16)
    const fallbackId = this._shadowBufferFallback!.getBuffer().GetTextureIdentifier(false)
    for (let i = numShadowPasses; i < this.getMaxShadows(); i++) {
      const old = this._shadowTextureHandle.handles[i]
      const oldTexture = old ? old.getTextureObject() : null
      if (oldTexture &&
        oldTexture.GetTextureIdentifier().getFilePath() === fallbackId.getFilePath()) {
        continue
      }
      this._shadowTextureHandle.handles[i] =
        resourceRegistry.allocateTextureHandle(
          fallbackId,
          HdStTextureType.Uv,
          fallbackParams,
          /* memoryRequest = */ 0,
          this)!
      _ReleaseHandles([old])
    }
  }

  /** Adds computations to create the dome light textures that are
   *  pre-calculated from the environment map texture.
   *  simpleLightingShader.cpp:584-686 */
  override addResourcesFromTextures(ctx: HdStShaderCodeResourceContext): void {
    if (!this._domeLightEnvironmentTextureHandle) {
      // No dome lights, bail.
      return
    }

    // Calculate the number of mips for the cubemap texture.
    const textureObject =
      this._domeLightEnvironmentTextureHandle!.getTextureObject()
    const srcTextureObject =
      textureObject instanceof HdStAssetUvTextureObject ? textureObject : null
    if (!TF_VERIFY(srcTextureObject)) {
      return
    }
    const srcTexture = srcTextureObject!.getTexture()
    if (!srcTexture) {
      TF_WARN(
        `Invalid texture for dome light environment map at ${srcTextureObject!.GetTextureIdentifier().getFilePath()}`)
      return
    }

    const cubemapDim =
      HdSt_ComputeDomeLightCubemapWidth(
        srcTextureObject!.GetTextureIdentifier().getFilePath(),
        srcTexture.Get()!.getDescriptor() as HgiTextureDesc,
        this._domeLightCubemapTargetMemoryMB)
    const numCubemapLevels = (Math.log2(cubemapDim) + 1) >>> 0

    // Cubemap generation from latlong texture.
    ctx.addComputation(
      null,
      new HdSt_DomeLightComputationGPU(
        _tokens.domeLightCubemap,
        /*useCubemapAsSourceTexture =*/false,
        this,
        cubemapDim,
        numCubemapLevels),
      HdStComputeQueue.HdStComputeQueueZero,
    )

    // BRDF computation.
    ctx.addComputation(
      null,
      new HdSt_DomeLightComputationGPU(
        _tokens.domeLightBRDF,
        /*useCubemapAsSourceTexture =*/false,
        this,
        cubemapDim),
      HdStComputeQueue.HdStComputeQueueZero,
    )

    // Generate mipmaps the for the generated cubemap.
    ctx.addComputation(
      null,
      new HdSt_DomeLightMipmapComputationGPU(this),
      HdStComputeQueue.HdStComputeQueueOne,
    )

    // Irradiance map computation.
    ctx.addComputation(
      null,
      new HdSt_DomeLightComputationGPU(
        _tokens.domeLightIrradiance,
        /*useCubemapAsSourceTexture =*/true,
        this,
        cubemapDim),
      HdStComputeQueue.HdStComputeQueueTwo,
    )

    // Note that since the prefilter texture is downsized, it has one less
    // mip level than the cubemap.
    const numPrefilterLevels = Math.max(numCubemapLevels - 1, 1)

    // Prefilter map computations. mipLevel = 0 allocates texture.
    for (let mipLevel = 0; mipLevel < numPrefilterLevels; ++mipLevel) {
      const roughness = (numPrefilterLevels === 1) ? 0.0
        : Math.fround(mipLevel / (numPrefilterLevels - 1))

      ctx.addComputation(
        null,
        new HdSt_DomeLightComputationGPU(
          _tokens.domeLightPrefilter,
          /*useCubemapAsSourceTexture =*/true,
          this,
          cubemapDim,
          numPrefilterLevels,
          mipLevel,
          roughness),
        HdStComputeQueue.HdStComputeQueueTwo,
      )
    }
  }

  /** The textures computed from the dome light environment map that the
   *  shader needs to bind for the dome light shading.
   *  simpleLightingShader.cpp:688-692 */
  override getNamedTextureHandles(): readonly HdStShaderCodeNamedTextureHandle[] {
    return this._namedTextureHandles
  }

  /** simpleLightingShader.cpp:694-703 */
  setDomeLightCubemapTargetMemory(targetMemoryMB: number): void {
    if (this._domeLightCubemapTargetMemoryMB !== targetMemoryMB) {
      this._domeLightCubemapTargetMemoryMB = targetMemoryMB
      this._domeLightEnvironmentTextureHandle = null
      this._domeLightTextureHandles = []
    }
  }

  /** simpleLightingShader.cpp:705-710 */
  setMaxLights(maxLights: number): void {
    this._maxLights = maxLights
  }

  /** The render param stored by AllocateTextureHandles (for render buffer
   *  destruction, simpleLightingShader.cpp:421-422). */
  protected _getRenderParam(): HdRenderParam | null { return this._renderParam }
}
export type HdStSimpleLightingShaderSharedPtr = HdStSimpleLightingShader
