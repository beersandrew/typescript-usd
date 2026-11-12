// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/material.cpp,
//  pxr/imaging/hdSt/material.h, pxr/imaging/hd/material.cpp,
//  pxr/imaging/hd/material.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/material.{h,cpp} (OpenUSD 26.11.1), the parts
// HdStMesh and the fallback material need.
//
// Deliberate divergences (each also noted at its site):
// - The base class is HdSprim: hd/material.{h,cpp} (HdMaterial, its
//   DirtyBits enum) is not a class of this repository's hd yet; the
//   HdMaterial dirty bits used here (DirtyParams, DirtyResource, AllDirty)
//   are spelled locally from hd/material.h:31-38.
// - The static HioGlslfx *_fallbackGlslfx is a module variable.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, HashCombine as TfHashCombine, type Token as TfToken } from 'typescript-usd/tf'
import type { Dictionary as VtDictionary } from 'typescript-usd/vt'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import {
  MaterialNetworkMap as HdMaterialNetworkMap,
  PrimTypeTokens as HdPrimTypeTokens,
  ShaderTokens as HdShaderTokens,
  Sprim as HdSprim,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
} from 'typescript-usd/hd'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdStDebugCodes } from './debugCodes.ts'
import { HdStTextureType } from './enums.ts'
import type { HdSt_MaterialParam } from './materialParam.ts'
import { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import { HdStPackageFallbackMaterialNetworkShader } from './package.ts'
import { HdStMarkDrawBatchesDirty, HdStMarkGarbageCollectionNeeded } from './primUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type { HdStShaderCodeNamedTextureHandle } from './shaderCode.ts'
import { HdStMaterialTagTokens } from './tokens.ts'
import { HdStMaterialNetwork, type HdStMaterialNetworkTextureDescriptor } from './materialNetwork.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import { HdSt_TextureBinder } from './textureBinder.ts'
import type { HdStTextureHandle } from './textureHandle.ts'
import { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStRenderBuffer } from './renderBuffer.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** hd/material.h:31-38 HdMaterial::DirtyBits (see the header). */
const HdMaterialDirtyBits = {
  Clean: 0,
  DirtyParams: 1 << 2,
  DirtyResource: 1 << 3,
  AllDirty: (1 << 2) | (1 << 3),
} as const

/** material.cpp:27-31 */
const _tokens = {
  limitSurfaceEvaluation: 'limitSurfaceEvaluation',
  opacity: 'opacity',
} as const

/** material.cpp:62-89. Check whether the texture node points to a render
 *  buffer and use information from it to get the texture identifier (see
 *  the header). */
function _GetTextureIdentifier(
  desc: HdStMaterialNetworkTextureDescriptor,
  sceneDelegate: HdSceneDelegate,
): HdStTextureIdentifier {
  if (!desc.useTexturePrimToFindTexture) {
    return desc.textureId
  }

  // Get render buffer texture node is pointing to.
  const renderBuffer = sceneDelegate.getRenderIndex().getBprim(
    HdPrimTypeTokens.renderBuffer, desc.texturePrim)
  if (renderBuffer instanceof HdStRenderBuffer) {
    if (desc.type === HdStTextureType.Uv) {
      return renderBuffer.GetTextureIdentifier(
        /* multiSampled = */ false)
    }

    TF_CODING_ERROR(
      'Non-UV texture type in descriptor using render buffer.')
  }

  return new HdStTextureIdentifier()
}

/** material.cpp:91-109 */
function _GetTextureHandleHash(textureHandle: HdStTextureHandle): bigint {
  const samplerParams = textureHandle.GetSamplerParameters()

  return TfHashCombine(
    textureHandle.getTextureObject().GetTextureIdentifier(),
    BigInt(samplerParams.wrapS),
    BigInt(samplerParams.wrapT),
    BigInt(samplerParams.wrapR),
    BigInt(samplerParams.minFilter),
    BigInt(samplerParams.magFilter),
    BigInt(samplerParams.borderColor),
    samplerParams.enableCompare,
    BigInt(samplerParams.compareFunction),
    BigInt(samplerParams.maxAnisotropy))
}

/** material.cpp:33 static HioGlslfx *HdStMaterial::_fallbackGlslfx. */
let _fallbackGlslfx: HioGlslfx | null = null

/** material.h:43-55 VolumeMaterialData. */
export interface HdStMaterialVolumeMaterialData {
  /** glslfx source code for volume */
  source: string
  params: HdSt_MaterialParam[]
}

/** material.h:29-131 */
export class HdStMaterial extends HdSprim {
  private _materialNetworkShader: HdSt_MaterialNetworkShader =
    new HdSt_MaterialNetworkShader()
  private readonly _networkProcessor = new HdStMaterialNetwork()
  private _volumeMaterialData: HdStMaterialVolumeMaterialData = { source: '', params: [] }

  private _isInitialized = false
  private _hasPtex = false
  private _hasLimitSurfaceEvaluation = false
  private _hasDisplacement = false
  private _isUsingFallbackShader = false

  private _materialTag: TfToken = HdStMaterialTagTokens.defaultMaterialTag
  private _textureHash = 0n

  /** material.cpp:42-55 */
  constructor(id: string) {
    super(id)
    // The material holds its shader (materialNetworkShader.ts, Lifetime).
    this._materialNetworkShader._retain()
    TfDebug.msg(HdStDebugCodes.HDST_MATERIAL_ADDED, `HdStMaterial Created: ${id}\n`)
  }

  /** The destructor (material.cpp:57-60, ~HdStMaterial): drops the
   *  material network shader's shared_ptr. */
  destroy(): void {
    this._materialNetworkShader.release()
  }

  /** material.cpp:173-344. Synchronizes state from the delegate to this
   *  object. */
  override sync(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const resourceRegistry =
      sceneDelegate.getRenderIndex().getResourceRegistry() as HdStResourceRegistry

    const bits = dirtyBits.value

    if (!(bits & HdMaterialDirtyBits.DirtyResource) &&
      !(bits & HdMaterialDirtyBits.DirtyParams)) {
      dirtyBits.value = HdMaterialDirtyBits.Clean
      return
    }

    let markBatchesDirty = false

    let fragmentSource = ''
    let displacementSource = ''
    let volumeSource = ''
    let materialMetadata: VtDictionary | null = null
    let materialTag = this._materialTag
    let params: HdSt_MaterialParam[] = []

    let textureDescriptors: readonly HdStMaterialNetworkTextureDescriptor[] = []

    const vtMat = sceneDelegate.getMaterialResource(this.getId())
    const hdNetworkMap = vtMat.IsEmpty() ? null : vtMat.Get<unknown>()
    if (hdNetworkMap instanceof HdMaterialNetworkMap) {
      if (hdNetworkMap.terminals.length !== 0 && hdNetworkMap.map.size !== 0) {
        this._networkProcessor.processMaterialNetwork(this.getId(), hdNetworkMap,
          resourceRegistry)
        fragmentSource = this._networkProcessor.getFragmentCode()
        volumeSource = this._networkProcessor.getVolumeCode()
        displacementSource = this._networkProcessor.getDisplacementCode()
        materialMetadata = this._networkProcessor.getMetadata()
        materialTag = this._networkProcessor.getMaterialTag()
        params = [...this._networkProcessor.getMaterialParams()]
        textureDescriptors = this._networkProcessor.getTextureDescriptors()
      }
    }

    // Use fallback shader when there is no source for
    // fragment and displacement shader.
    if (fragmentSource === '' &&
      displacementSource === '') {
      this._initFallbackShader()
      fragmentSource = _fallbackGlslfx!.getSurfaceSource()
      materialMetadata = _fallbackGlslfx!.getMetadata()

      this._isUsingFallbackShader = true
    } else {
      this._isUsingFallbackShader = false
    }

    // Update volume material data.
    if (this._volumeMaterialData.source !== volumeSource) {
      // If we're updating the volume source, we need to rebatch anything that
      // uses this material.
      markBatchesDirty = true
      this._volumeMaterialData.source = volumeSource

      if (this._volumeMaterialData.source === '') {
        // Material does not provide a volume shader.
        // In this case, we leave it to _ComputeVolumeMaterialData in
        // volume.cpp to use the fallback volume data.
        // The params of this material are also irrelevant for volumes in
        // this case.
        this._volumeMaterialData.params = []
      } else {
        this._volumeMaterialData.params = params
      }
    }

    // If we're updating the fragment or displacement source, we need to
    // rebatch anything that uses this material.
    const oldFragmentSource =
      this._materialNetworkShader.getSource(HdShaderTokens.fragmentShader)
    const oldDisplacementSource =
      this._materialNetworkShader.getSource(HdShaderTokens.displacementShader)

    markBatchesDirty ||= (oldFragmentSource !== fragmentSource) ||
      (oldDisplacementSource !== displacementSource)

    this._materialNetworkShader.setFragmentSource(fragmentSource)
    this._materialNetworkShader.setDisplacementSource(displacementSource)

    this._hasDisplacement = displacementSource !== ''

    this._hasLimitSurfaceEvaluation =
      this._getHasLimitSurfaceEvaluation(materialMetadata)

    if (this._materialTag !== materialTag) {
      this._materialTag = materialTag
      this._materialNetworkShader.setMaterialTag(this._materialTag)

      // If the material tag changes, we'll need to rebatch.
      markBatchesDirty = true
    }

    this._materialNetworkShader.setEnabledPrimvarFiltering(true)

    //
    // Update material parameters
    //
    this._materialNetworkShader.setParams(params)

    const specs: HdBufferSpec[] = []
    const sources: HdBufferSource[] = []

    this._hasPtex = false
    for (const param of params) {
      if (param.isPrimvarRedirect() || param.isFallback() ||
        param.isTransform2d()) {
        HdSt_MaterialNetworkShader.addFallbackValueToSpecsAndSources(
          param, specs, sources)
      } else if (param.isTexture()) {
        HdSt_MaterialNetworkShader.addFallbackValueToSpecsAndSources(
          param, specs, sources)
        if (param.textureType === HdStTextureType.Ptex) {
          this._hasPtex = true
        }
      }
    }

    // Textures created using Storm texture system.
    const textures: HdStShaderCodeNamedTextureHandle[] = []

    this._processTextureDescriptors(
      sceneDelegate,
      resourceRegistry,
      this._materialNetworkShader,
      textureDescriptors,
      textures,
      specs,
      sources)

    // Check if the texture hash has changed; if so, we need to ask for a
    // re-batch.  We only look at NamedTextureHandles because the legacy system
    // hashes based on scene graph path, meaning each textured gprim gets its
    // own batch.
    let textureHash = 0n
    for (const tex of textures) {
      textureHash = TfHashCombine(textureHash, tex.hash)
    }

    if (this._textureHash !== textureHash) {
      this._textureHash = textureHash
      markBatchesDirty = true
    }

    this._materialNetworkShader.setNamedTextureHandles(textures)
    this._materialNetworkShader.setBufferSources(
      specs, sources, resourceRegistry)

    if (markBatchesDirty && this._isInitialized) {
      // Only invalidate batches if this isn't our first round through sync.
      // If this is the initial sync, we haven't formed batches yet.
      HdStMarkDrawBatchesDirty(renderParam)
    }

    this._isInitialized = true
    dirtyBits.value = HdMaterialDirtyBits.Clean
  }

  /** material.cpp:115-169 */
  private _processTextureDescriptors(
    sceneDelegate: HdSceneDelegate,
    resourceRegistry: HdStResourceRegistry,
    shaderCode: HdStShaderCode,
    descs: readonly HdStMaterialNetworkTextureDescriptor[],
    texturesFromStorm: HdStShaderCodeNamedTextureHandle[],
    specs: HdBufferSpec[],
    _sources: HdBufferSource[],
  ): void {
    for (const desc of descs) {
      const textureHandle = resourceRegistry.allocateTextureHandle(
        _GetTextureIdentifier(desc, sceneDelegate),
        desc.type,
        desc.samplerParameters,
        desc.memoryRequest,
        shaderCode)
      if (!textureHandle) continue

      // Note about batching hashes:
      // If this is our first sync, try to hash using the asset path.
      // If we're on our 2nd+ sync, just use the texture prim name + material
      // id. (We include the material id to avoid collisions on texture prims
      // with the same name.)
      //
      // This will aggressively batch textured prims together as long as
      // they are 100% static; if they are dynamic, we assume that the
      // textures are dynamic, and we split the batches of textured prims.
      texturesFromStorm.push({
        name: desc.name,
        type: desc.type,
        handles: [textureHandle],
        hash: this._isInitialized
          ? TfHashCombine(this.getId(), desc.texturePrim)
          : _GetTextureHandleHash(textureHandle),
      })
    }

    const doublesSupported = resourceRegistry.getHgi().getCapabilities()!.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)
    HdSt_TextureBinder.getBufferSpecs(texturesFromStorm, specs, doublesSupported)
  }

  /** material.cpp:346-351 */
  finalize(renderParam: HdRenderParam | null | undefined): void {
    // Flag GC to reclaim resources owned by the surface shader.
    HdStMarkGarbageCollectionNeeded(renderParam)
  }

  /** material.cpp:353-360 */
  private _getHasLimitSurfaceEvaluation(metadata: VtDictionary | null): boolean {
    const value = metadata?.get(_tokens.limitSurfaceEvaluation)
    return !!value && value.getTypeName() === 'bool' && value.Get<boolean>()
  }

  /** material.cpp:362-367 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    return HdMaterialDirtyBits.AllDirty
  }

  /** material.cpp:369-373. Obtains the GLSLFX code together with supporting
   *  information such as material params and textures to render surfaces. */
  getMaterialNetworkShader(): HdSt_MaterialNetworkShader {
    return this._materialNetworkShader
  }

  /** material.h:69, 157-161 */
  getVolumeMaterialData(): HdStMaterialVolumeMaterialData {
    return this._volumeMaterialData
  }

  /** material.h:75, 132-135. Summary flag. Returns true if the material is
   *  bound to one or more textures and any of those textures is a ptex
   *  texture. */
  hasPtex(): boolean {
    return this._hasPtex
  }

  /** material.h:78, 137-140. Returns true if the material specifies limit
   *  surface evaluation. */
  hasLimitSurfaceEvaluation(): boolean {
    return this._hasLimitSurfaceEvaluation
  }

  /** material.h:81, 142-145. Returns true if the material has a
   *  displacement terminal. */
  hasDisplacement(): boolean {
    return this._hasDisplacement
  }

  /** material.h:83, 152-155 */
  isUsingFallbackShader(): boolean {
    return this._isUsingFallbackShader
  }

  /** material.h:86, 147-150. Returns the material's render pass tag. */
  getMaterialTag(): TfToken {
    return this._materialTag
  }

  /** material.cpp:375-380. Replaces the shader code object with an
   *  externally created one. Used to set the fallback shader for prim. */
  setMaterialNetworkShader(materialNetworkShader: HdSt_MaterialNetworkShader): void {
    if (this._materialNetworkShader === materialNetworkShader) return
    materialNetworkShader._retain()
    this._materialNetworkShader.release()
    this._materialNetworkShader = materialNetworkShader
  }

  /** material.cpp:382-397 */
  private _initFallbackShader(): void {
    if (_fallbackGlslfx !== null) {
      return
    }

    const filePath = HdStPackageFallbackMaterialNetworkShader()

    _fallbackGlslfx = new HioGlslfx(filePath)

    // Check fallback shader loaded, if not continue with the invalid shader
    // this would mean the shader compilation fails and the prim would not
    // be drawn.
    TF_VERIFY(_fallbackGlslfx.isValid(),
      'Failed to load fallback surface shader!')
  }
}
