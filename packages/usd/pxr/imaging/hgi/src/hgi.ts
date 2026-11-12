// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/hgi.cpp, pxr/imaging/hgi/hgi.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/hgi.{h,cpp} (OpenUSD 26.11.1).
//
// WebGPU adaptations (each also noted at its site):
// - Backend creation is asynchronous: a WebGPU device is obtained with
//   navigator.gpu.requestAdapter()/requestDevice(), which return promises. So
//   HgiFactoryBase.New, CreatePlatformDefaultHgi, CreateNamedHgi and
//   IsSupported return promises where upstream returns synchronously.
// - SubmitCmds returns a promise. Upstream blocks the calling thread for
//   HgiSubmitWaitTypeWaitUntilCompleted; a browser cannot, so the promise
//   settles when the GPU work (and any GPU-to-CPU copies it recorded) has
//   completed. The commands themselves are committed synchronously, so
//   submission order is call order, as upstream.
// - Plugin loading: upstream finds the backend's TfType through PlugRegistry
//   and loads its plugin (hgi.cpp:187-222). Here a backend module registers
//   its TfType and HgiFactory when imported (e.g. typescript-usd/hgiWebGPU),
//   which plays the part of PlugPlugin::Load.

import { Token as TfToken, Type as TfType, TfEnvSetting, TfGetEnvSetting, Debug as TfDebug } from 'typescript-usd/tf'
import type { TypeFactoryBase as TfTypeFactoryBase } from 'typescript-usd/tf'
import { HgiDebugCodes } from './debugCodes.ts'
import {
  HgiBindResourceType,
  HgiBufferUsageBits,
  HgiSampleCount,
  HgiSubmitWaitType,
  HgiTextureType,
} from './enums.ts'
import { HgiTokens } from './tokens.ts'
import { HgiIsCompressed } from './types.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'
import type { HgiBlitCmdsUniquePtr } from './blitCmds.ts'
import type { HgiBufferDesc, HgiBufferHandle } from './buffer.ts'
import type { HgiCapabilities } from './capabilities.ts'
import type { HgiCmds } from './cmds.ts'
import type { HgiComputeCmdsDesc } from './computeCmdsDesc.ts'
import type { HgiComputeCmdsUniquePtr } from './computeCmds.ts'
import type { HgiComputePipelineDesc, HgiComputePipelineHandle } from './computePipeline.ts'
import type { HgiGraphicsCmdsDesc } from './graphicsCmdsDesc.ts'
import type { HgiGraphicsCmdsUniquePtr } from './graphicsCmds.ts'
import type { HgiGraphicsPipelineDesc, HgiGraphicsPipelineHandle } from './graphicsPipeline.ts'
import type { HgiIndirectCommandEncoder } from './indirectCommandEncoder.ts'
import type { HgiResourceBindingsDesc, HgiResourceBindingsHandle } from './resourceBindings.ts'
import type { HgiSamplerDesc, HgiSamplerHandle } from './sampler.ts'
import type { HgiShaderFunctionDesc } from './shaderFunctionDesc.ts'
import type { HgiShaderFunctionHandle } from './shaderFunction.ts'
import type { HgiShaderProgramDesc, HgiShaderProgramHandle } from './shaderProgram.ts'
import type {
  HgiTextureDesc,
  HgiTextureHandle,
  HgiTextureViewDesc,
  HgiTextureViewHandle,
} from './texture.ts'

/** hgi.cpp:19 */
function NOT_EMPTY_NAME(s: string): string {
  return s.length === 0 ? 'UNNAMED' : s
}

/** hgi.cpp:21-22 */
function HGI_TEST_CODING_ERROR(cond: unknown, message: string): void {
  if (!cond) { TF_CODING_ERROR(message) }
}

/** hgi.cpp:24-25 */
export const HGI_ENABLE_VULKAN = new TfEnvSetting<number>('HGI_ENABLE_VULKAN', 0,
  'Enable Vulkan as platform default Hgi backend (WIP)')

/** hgi.h:38 */
export type HgiUniquePtr = Hgi

/** hgi.h:94-368. Hydra Graphics Interface: the abstract graphics API a
 *  backend (hgiMetal, hgiVulkan, hgiGL; here hgiWebGPU) implements. */
export abstract class Hgi {
  private _uniqueIdCounter = 1

  /** hgi.cpp:32-35 */
  protected constructor() {}

  /** hgi.cpp:167-176. Submit one HgiCmds objects. Once the cmds object is
   *  submitted it cannot be re-used to record cmds. A call to SubmitCmds
   *  would usually result in the hgi backend submitting the cmd buffers of
   *  the cmds object(s) to the device queue. Derived classes can override
   *  _SubmitCmds to customize submission.
   *
   *  WebGPU adaptation: returns a promise; see the file comment. */
  submitCmds(
    cmds: HgiCmds | null,
    wait: HgiSubmitWaitType = HgiSubmitWaitType.HgiSubmitWaitTypeNoWait,
  ): Promise<void> {
    if (cmds && TF_VERIFY(!cmds.isSubmitted(), '!cmds->IsSubmitted()')) {
      const result = this._SubmitCmds(cmds, wait)
      cmds._setSubmitted()
      return Promise.resolve(result).then(() => undefined)
    }
    return Promise.resolve()
  }

  /** hgi.cpp:331-338. Deprecated upstream in favor of
   *  CreatePlatformDefaultHgi. */
  static getPlatformDefaultHgi(): Promise<Hgi | null> {
    TF_WARN('GetPlatformDefaultHgi is deprecated. ' +
      'Please use CreatePlatformDefaultHgi')

    return _MakeNewPlatformDefaultHgi()
  }

  /** hgi.cpp:340-344. Helper function to return a Hgi object for the
   *  current platform. */
  static createPlatformDefaultHgi(): Promise<HgiUniquePtr | null> {
    return _MakeNewPlatformDefaultHgi()
  }

  /** hgi.cpp:346-350. Helper function to return a Hgi object of choice
   *  supported by current platform and build configuration. */
  static createNamedHgi(hgiToken: TfToken): Promise<HgiUniquePtr | null> {
    return _MakeNamedHgi(hgiToken)
  }

  /** hgi.h:147. Determine if Hgi instance can run on current hardware. */
  abstract IsBackendSupported(): boolean

  /** hgi.cpp:352-373. Constructs a temporary Hgi object that calls the
   *  instance's IsBackendSupported() function. */
  static async isSupported(hgiToken: TfToken = TfToken()): Promise<boolean> {
    // TODO: By current design, a Hgi instance is created and initialized as a
    // method of confirming support on a platform. Once this is done, the
    // instance is destroyed along with the created API contexts. This is not
    // the best way to check for support on a platform and we'd like to change
    // this approach in the future.

    let instance: HgiUniquePtr | null = null
    if (TfToken.IsEmpty(hgiToken)) {
      instance = await Hgi.createPlatformDefaultHgi()
    } else {
      instance = await Hgi.createNamedHgi(hgiToken)
    }

    if (instance) {
      const supported = instance.IsBackendSupported()
      instance._destroy()
      return supported
    }

    return false
  }

  /** hgi.h:168-169 */
  abstract createGraphicsCmds(desc: HgiGraphicsCmdsDesc): HgiGraphicsCmdsUniquePtr

  /** hgi.h:178 */
  abstract createBlitCmds(): HgiBlitCmdsUniquePtr

  /** hgi.h:187-188 */
  abstract createComputeCmds(desc: HgiComputeCmdsDesc): HgiComputeCmdsUniquePtr

  /** hgi.cpp:39-76. Create a texture in rendering backend. */
  createTexture(desc: HgiTextureDesc): HgiTextureHandle {
    const d = desc.dimensions.data
    HGI_TEST_CODING_ERROR(d[0] !== 0,
      `${NOT_EMPTY_NAME(desc.debugName)}: x dimension must be non-zero`)
    HGI_TEST_CODING_ERROR(d[0] !== 0,
      `${NOT_EMPTY_NAME(desc.debugName)}: x dimension must be non-zero`)
    HGI_TEST_CODING_ERROR(desc.usage !== 0,
      `${NOT_EMPTY_NAME(desc.debugName)}: Usage must be defined`)
    HGI_TEST_CODING_ERROR(desc.sampleCount === HgiSampleCount.HgiSampleCount1 ||
        desc.type === HgiTextureType.HgiTextureType2D,
      `${NOT_EMPTY_NAME(desc.debugName)}: multisampled textures must be 2d`)
    if (HgiIsCompressed(desc.format)) {
      if (desc.type === HgiTextureType.HgiTextureType2D) {
        HGI_TEST_CODING_ERROR(
          d[0]! % 4 === 0 && d[1]! % 4 === 0,
          `${NOT_EMPTY_NAME(desc.debugName)}: compressed textures must be block sized`)
      } else if (desc.type === HgiTextureType.HgiTextureType3D) {
        HGI_TEST_CODING_ERROR(d[0]! % 4 === 0 &&
            d[1]! % 4 === 0 &&
            d[2]! % 4 === 0,
          `${NOT_EMPTY_NAME(desc.debugName)}: compressed textures must be block sized`)
      } else {
        TF_CODING_ERROR(
          `${NOT_EMPTY_NAME(desc.debugName)}: Compressed texture must be of type ` +
          'HgiTextureType2D or HgiTextureType3D')
      }
    }
    return this._CreateTexture(desc)
  }

  /** hgi.h:198. Destroy a texture in rendering backend. */
  abstract destroyTexture(texHandle: HgiTextureHandle): void

  /** hgi.cpp:78-84. Create a texture view in rendering backend. */
  createTextureView(desc: HgiTextureViewDesc): HgiTextureViewHandle {
    HGI_TEST_CODING_ERROR(desc.sourceTexture.isSet(),
      `${NOT_EMPTY_NAME(desc.debugName)}: source texture invalid`)
    return this._createTextureView(desc)
  }

  /** hgi.h:214 */
  abstract destroyTextureView(viewHandle: HgiTextureViewHandle): void

  /** hgi.h:219 */
  abstract createSampler(desc: HgiSamplerDesc): HgiSamplerHandle

  /** hgi.h:224 */
  abstract destroySampler(smpHandle: HgiSamplerHandle): void

  /** hgi.cpp:86-97. Create a buffer in rendering backend. */
  createBuffer(desc: HgiBufferDesc): HgiBufferHandle {
    HGI_TEST_CODING_ERROR(desc.byteSize !== 0,
      `${NOT_EMPTY_NAME(desc.debugName)}: buffers must be non-zero sized`)
    HGI_TEST_CODING_ERROR(
      (desc.usage & HgiBufferUsageBits.HgiBufferUsageVertex) === 0 || desc.vertexStride !== 0,
      `${NOT_EMPTY_NAME(desc.debugName)}: vertex buffers must provide stride!`)
    return this._createBuffer(desc)
  }

  /** hgi.h:234 */
  abstract destroyBuffer(bufHandle: HgiBufferHandle): void

  /** hgi.h:239-240 */
  abstract CreateShaderFunction(desc: HgiShaderFunctionDesc): HgiShaderFunctionHandle

  /** hgi.h:245-246 */
  abstract destroyShaderFunction(shaderFunctionHandle: HgiShaderFunctionHandle): void

  /** hgi.h:251-252 */
  abstract createShaderProgram(desc: HgiShaderProgramDesc): HgiShaderProgramHandle

  /** hgi.h:259-260 */
  abstract destroyShaderProgram(shaderProgramHandle: HgiShaderProgramHandle): void

  /** hgi.cpp:99-165. Create a new resource binding object. */
  createResourceBindings(desc: HgiResourceBindingsDesc): HgiResourceBindingsHandle {
    const name = NOT_EMPTY_NAME(desc.debugName)
    HGI_TEST_CODING_ERROR(desc.buffers.length > 0 || desc.textures.length > 0,
      `${name}: buffers and textures vectors cannot be empty`)
    for (let i = 0; i < desc.buffers.length; i++) {
      const bufDesc = desc.buffers[i]!
      HGI_TEST_CODING_ERROR(bufDesc.buffers.length === bufDesc.offsets.length,
        `${name}.buffers[${i}]: Buffer count (${bufDesc.buffers.length}) != ` +
        `Offset count (${bufDesc.offsets.length})`)

      if (bufDesc.sizes.length > 0) {
        HGI_TEST_CODING_ERROR(
          bufDesc.buffers.length === bufDesc.sizes.length,
          `${name}.buffers[${i}]: Buffer count (${bufDesc.buffers.length}) != ` +
          `Sizes count (${bufDesc.sizes.length})`)
      }

      HGI_TEST_CODING_ERROR(
        bufDesc.resourceType === HgiBindResourceType.HgiBindResourceTypeUniformBuffer ||
        bufDesc.resourceType === HgiBindResourceType.HgiBindResourceTypeStorageBuffer ||
        bufDesc.resourceType === HgiBindResourceType.HgiBindResourceTypeTessFactors,
        `${name}.buffers[${i}]: Unknown buffer type to bind`)

      // `offsets.front()` on an empty vector is undefined behavior upstream;
      // it reads as 0 here.
      const offset = bufDesc.offsets[0] ?? 0
      const size = bufDesc.sizes.length === 0 ? 0 : bufDesc.sizes[0]!
      HGI_TEST_CODING_ERROR(size !== 0 || offset === 0,
        `${name}.buffers[${i}]: Invalid size (${size}) for buffer with offset (${offset})`)

      for (let j = 0; j < bufDesc.buffers.length; j++) {
        HGI_TEST_CODING_ERROR(bufDesc.buffers[j]!.isSet(),
          `${name}.buffers[${i}].buffers[${j}] invalid`)
      }
    }

    for (let i = 0; i < desc.textures.length; i++) {
      const texDesc = desc.textures[i]!

      HGI_TEST_CODING_ERROR(
        texDesc.resourceType === HgiBindResourceType.HgiBindResourceTypeSampledImage ||
        texDesc.resourceType === HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage ||
        texDesc.resourceType === HgiBindResourceType.HgiBindResourceTypeStorageImage,
        `${name}.textures[${i}]: Unknown texture type to bind`)

      for (let j = 0; j < texDesc.textures.length; j++) {
        HGI_TEST_CODING_ERROR(texDesc.textures[j]!.isSet(),
          `${name}.textures[${i}].textures[${j}] invalid`)
      }
      for (let j = 0; j < texDesc.samplers.length; j++) {
        // Don't need a sampler for StorageImage type
        if (texDesc.resourceType !== HgiBindResourceType.HgiBindResourceTypeStorageImage) {
          HGI_TEST_CODING_ERROR(texDesc.samplers[j]!.isSet(),
            `${name}.textures[${i}].samplers[${j}] invalid`)
        }
      }
    }
    return this._createResourceBindings(desc)
  }

  /** hgi.h:271-272 */
  abstract destroyResourceBindings(resHandle: HgiResourceBindingsHandle): void

  /** hgi.h:277-278 */
  abstract CreateGraphicsPipeline(pipeDesc: HgiGraphicsPipelineDesc): HgiGraphicsPipelineHandle

  /** hgi.h:283-284 */
  abstract destroyGraphicsPipeline(pipeHandle: HgiGraphicsPipelineHandle): void

  /** hgi.h:289-290 */
  abstract CreateComputePipeline(pipeDesc: HgiComputePipelineDesc): HgiComputePipelineHandle

  /** hgi.h:295 */
  abstract destroyComputePipeline(pipeHandle: HgiComputePipelineHandle): void

  /** hgi.h:300 */
  abstract getAPIName(): TfToken

  /** hgi.h:305 */
  abstract getCapabilities(): HgiCapabilities | null

  /** hgi.h:311 */
  abstract getIndirectCommandEncoder(): HgiIndirectCommandEncoder | null

  /** hgi.h:320 */
  abstract startFrame(): void

  /** hgi.h:326 */
  abstract endFrame(): void

  /** hgi.h:334 */
  abstract garbageCollect(): void

  /** Release the backend's API objects (`delete instance` /
   *  `~Hgi()` upstream; e.g. hgiMetal/hgi.mm:131-149). */
  abstract _destroy(): void

  /** hgi.cpp:375-379. Returns a unique id for handle creation. */
  getUniqueId(): number {
    return this._uniqueIdCounter++
  }

  /** hgi.cpp:381-385. Calls Submit on provided Cmds. Derived classes can
   *  override this function if they need customize the command submission.
   *  The default implementation calls cmds->_Submit(). */
  protected _SubmitCmds(cmds: HgiCmds, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    return cmds._submit(this, wait)
  }

  /** hgi.h:350 */
  protected abstract _CreateTexture(desc: HgiTextureDesc): HgiTextureHandle

  /** hgi.h:353-354 */
  protected abstract _createTextureView(desc: HgiTextureViewDesc): HgiTextureViewHandle

  /** hgi.h:357 */
  protected abstract _createBuffer(desc: HgiBufferDesc): HgiBufferHandle

  /** hgi.h:360-361 */
  protected abstract _createResourceBindings(desc: HgiResourceBindingsDesc): HgiResourceBindingsHandle
}

/** hgi.h:374-377. WebGPU adaptation: New() is asynchronous (see the file
 *  comment). */
export interface HgiFactoryBase extends TfTypeFactoryBase {
  'new'(): Promise<Hgi | null>
}

/** hgi.h:379-385 */
export class HgiFactory<T extends Hgi> implements HgiFactoryBase {
  constructor(private readonly _create: () => Promise<T | null>) {}

  new(): Promise<Hgi | null> {
    return this._create()
  }
}

// hgi.cpp:27-30
const _hgiType = TfType.define('Hgi')

/** The TfType of Hgi, for backends to derive from (TfType::Define<HgiMetal,
 *  TfType::Bases<Hgi>>, hgiMetal/hgi.mm:34-38). */
export function HgiGetTfType(): TfType {
  return _hgiType
}

function _debugMsg(message: string): void {
  if (TfDebug.isEnabled(HgiDebugCodes.HGI_DEBUG_INSTANCE_CREATION)) {
    TfDebug.msg(HgiDebugCodes.HGI_DEBUG_INSTANCE_CREATION, message)
  }
}

/** The "[PluginLoad]" half shared by _MakeNewPlatformDefaultHgi
 *  (hgi.cpp:214-236) and _MakeNamedHgi (hgi.cpp:292-316). */
async function _ManufactureHgi(hgiType: string): Promise<Hgi | null> {
  const plugType = _hgiType.findDerivedByName(hgiType)

  // PlugPlugin::Load (hgi.cpp:216-222): a backend is "loaded" once its module
  // has registered the type.
  if (plugType.isUnknown()) {
    TF_CODING_ERROR(
      `[PluginLoad] PlugPlugin could not be loaded for TfType '${plugType.getTypeName()}'\n`)
    return null
  }

  const factory = plugType.getFactory<HgiFactoryBase>()
  if (!factory) {
    TF_CODING_ERROR(`[PluginLoad] Cannot manufacture type '${plugType.getTypeName()}' \n`)
    return null
  }

  const instance = await factory.new()
  if (!instance) {
    TF_CODING_ERROR(
      `[PluginLoad] Cannot construct instance of type '${plugType.getTypeName()}'\n`)
    return null
  }
  return instance
}

/** hgi.cpp:178-253 */
async function _MakeNewPlatformDefaultHgi(): Promise<Hgi | null> {
  _debugMsg('Attempting to create platform default Hgi\n')

  // We use the plugin system to construct derived Hgi classes to avoid any
  // linker complications.

  // WebGPU adaptation: the platform switch of hgi.cpp:189-200 (HgiGL on
  // Linux/Windows, HgiMetal on macOS) becomes the browser platform, whose
  // backend is HgiWebGPU.
  let hgiType = 'HgiWebGPU'

  if (TfGetEnvSetting(HGI_ENABLE_VULKAN)) {
    // PXR_VULKAN_SUPPORT_ENABLED is never defined for this build.
    TF_CODING_ERROR(
      'Build requires PXR_VULKAN_SUPPORT_ENABLED=true to use Vulkan')
    hgiType = 'HgiWebGPU'
  }

  _debugMsg(`Platform default Hgi: ${hgiType}\n`)

  const instance = await _ManufactureHgi(hgiType)
  if (!instance) {
    return null
  }

  if (!instance.IsBackendSupported()) {
    _debugMsg(`Hgi ${hgiType} is not supported\n`)
    // XXX Currently, returning nullptr (rather than a non-supported hgi
    // instance) causes a crash in one of our studio tests. We disable the
    // desired behavior until we can fix the test.
    return instance
  }

  _debugMsg(`Successfully created platform default Hgi ${hgiType}\n`)

  return instance
}

/** hgi.cpp:255-329 */
async function _MakeNamedHgi(hgiToken: TfToken): Promise<Hgi | null> {
  _debugMsg(`Attempting to create named Hgi ${hgiToken}\n`)

  let hgiType = ''

  if (hgiToken === HgiTokens.OpenGL) {
    // PXR_GL_SUPPORT_ENABLED is never defined for this build.
  } else if (hgiToken === HgiTokens.Vulkan) {
    // PXR_VULKAN_SUPPORT_ENABLED is never defined for this build.
  } else if (hgiToken === HgiTokens.Metal) {
    // PXR_METAL_SUPPORT_ENABLED is never defined for this build.
  } else if (hgiToken === 'WebGPU') {
    // WebGPU adaptation: the backend this build provides. Its API name token
    // is HgiWebGPU::GetAPIName (pxr/imaging/hgiWebGPU/src/hgi.ts).
    hgiType = 'HgiWebGPU'
  } else if (TfToken.IsEmpty(hgiToken)) {
    return _MakeNewPlatformDefaultHgi()
  } else {
    // If an invalid token is provided, return nullptr.
    TF_CODING_ERROR(`Unsupported token ${hgiToken} was provided.`)
    return null
  }

  // If a valid, non-empty token was provided but that Hgi type is
  // unsupported by the build, return nullptr.
  if (hgiType.length === 0) {
    TF_CODING_ERROR(`Build does not support proposed Hgi type ${hgiType} on ` +
      'this platform.')
    return null
  }

  const instance = await _ManufactureHgi(hgiType)
  if (!instance) {
    return null
  }

  if (!instance.IsBackendSupported()) {
    _debugMsg(`Hgi ${hgiType} is not supported\n`)
    instance._destroy()
    return null
  }

  _debugMsg(`Successfully created named Hgi ${hgiType}\n`)

  return instance
}
