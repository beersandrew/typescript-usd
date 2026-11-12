// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderDelegate.cpp,
//  pxr/imaging/hdSt/renderDelegate.h, pxr/usdImaging/usdImagingGL/engine.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderDelegate.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Prim types whose Storm classes are not ported in this module
//   (implicit surfaces, drawTarget, image shader) are still listed as
//   supported, as upstream lists them, but creating one reports a coding
//   error. FAITHFULNESS-DEBT(hdst-prim-types): port HdStSphere,
//   HdStConicalFrustum, HdStCapsule, HdStDrawTarget and HdImageShader
//   (renderDelegate.cpp:429-553) and create them here.
// - The Hgi-to-resource-registry map (renderDelegate.cpp:120-199) keeps one
//   registry per Hgi; JavaScript has no weak shared_ptr owners, so entries
//   live as long as the Hgi object (a WeakMap keyed by it).
// - HD_PERF_ADD_RESOURCE_REGISTRY and GetRenderStats' VtDictionary are
//   omitted; GetRenderStats returns the resource registry's allocation map.
// - IsSupported: Hgi::IsSupported() (the platform-default Hgi check used
//   when the create args carry no Hgi, renderDelegate.cpp:643-650) is
//   asynchronous for WebGPU (hgi/src/hgi.ts header) and IsSupported is not.
//   The synchronous stand-in is whether the WebGPU API is present
//   (navigator.gpu); an adapter may still be unavailable. Clients such as
//   UsdImagingGLEngine (usdImagingGL/engine.cpp:1515-1524) pass their Hgi in
//   the create args, which takes the faithful Hgi::IsBackendSupported path.

import { HdStExtComputation } from './extComputation.ts'
import { Debug as TfDebug, TfEnvSetting, TfGetEnvSetting, Type as TfType, type Token as TfToken } from 'typescript-usd/tf'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  AovDescriptor as HdAovDescriptor,
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
  AovTokens as HdAovTokens,
  Camera as HdCamera,
  Format as HdFormat,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderDelegate as HdRenderDelegate,
  RenderSettingsTokens as HdRenderSettingsTokens,
  Tokens as HdTokens,
  type Bprim as HdBprim,
  type RenderIndex as HdRenderIndex,
  type RenderSettingDescriptor as HdRenderSettingDescriptor,
  type Rprim as HdRprim,
  type RprimCollection as HdRprimCollection,
  type Sprim as HdSprim,
  type Instancer as HdInstancer,
  type SceneDelegate as HdSceneDelegate,
  DebugCodes as HdDebugCodes,
  RendererCreateArgsSchemaTokens as HdRendererCreateArgsSchemaTokens,
  type Driver as HdDriver,
  type RenderDelegateInfo as HdRenderDelegateInfo,
  type RendererCreateArgsSchema as HdRendererCreateArgsSchema,
} from 'typescript-usd/hd'
import { Hgi, HgiTokens } from 'typescript-usd/hgi'
import { HioGlslfx, HioGlslfxTokens } from 'typescript-usd/hio'
import { HdSt_GetMaterialXSupport } from './materialXSupport.ts'
import { HdSt_DrawItemsCache } from './drawItemsCache.ts'
import { HdStGLSLFXShader } from './glslfxShader.ts'
import { HdStLight } from './light.ts'
import { HdStMaterial } from './material.ts'
import { HdStMesh } from './mesh.ts'
import { HdStBasisCurves } from './basisCurves.ts'
import { HdStPoints } from './points.ts'
import { HdStField } from './field.ts'
import { HdStVolume } from './volume.ts'
import { HdStTextureType } from './enums.ts'
import { HdStInstancer } from './instancer.ts'
import { HdStPackageFallbackMaterialNetworkShader } from './package.ts'
import { HdStRenderBuffer } from './renderBuffer.ts'
import { HdStRenderParam } from './renderParam.ts'
import { HDST_COMPILE_AHEAD_MS, HdSt_RenderPass } from './renderPass.ts'
import { HdStRenderPassState } from './renderPassState.ts'
import { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStDefaultTransparencyModeTokens, HdStRenderSettingsTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** renderDelegate.cpp:55-56 */
export const HD_ENABLE_GPU_TINY_PRIM_CULLING = new TfEnvSetting<boolean>(
  'HD_ENABLE_GPU_TINY_PRIM_CULLING', false, 'Enable tiny prim culling')

/** renderDelegate.cpp:58-59 */
export const HDST_MAX_LIGHTS = new TfEnvSetting<number>(
  'HDST_MAX_LIGHTS', 16, 'Maximum number of lights to render with')

/** renderDelegate.cpp:61-63 */
export const HDST_DOME_LIGHT_CUBEMAP_TARGET_MEMORY_MB = new TfEnvSetting<number>(
  'HDST_DOME_LIGHT_CUBEMAP_TARGET_MEMORY_MB', 0,
  'Maximum memory target in MB for the cubemap computed ' +
  'from the latlong texture for the dome light.')

/** renderDelegate.cpp:65-68 */
export const HDST_ENABLE_NATIVE_IMPLICITS = new TfEnvSetting<boolean>(
  'HDST_ENABLE_NATIVE_IMPLICITS', false,
  'Enable native rendering of all implicit surface primitives supported ' +
  'by Storm (e.g., spheres, cones) instead of converting them to meshes ' +
  'via the implicit surface scene index.')


// hd/driver.h and hd/renderDelegateInfo.h, re-exported for typescript-usd/hdSt.
export type { HdDriver, HdRenderDelegateInfo }

/** renderDelegate.cpp:120-199 (see the header note). */
const _hgiToResourceRegistryMap = new WeakMap<Hgi, HdStResourceRegistry>()
function _GetOrCreateRegistry(hgi: Hgi): HdStResourceRegistry {
  let registry = _hgiToResourceRegistryMap.get(hgi)
  if (!registry) {
    registry = new HdStResourceRegistry(hgi)
    _hgiToResourceRegistryMap.set(hgi, registry)
  }
  return registry
}

/** renderDelegate.cpp:70-89 */
function _SupportedRprimTypes(): TfToken[] {
  const supportedTypes = [
    HdPrimTypeTokens.mesh,
    HdPrimTypeTokens.basisCurves,
    HdPrimTypeTokens.points,
    HdPrimTypeTokens.volume,
  ] as TfToken[]

  if (HdStRenderDelegate.isEnabledNativeImplicitsRenderingSupport()) {
    supportedTypes.push(HdPrimTypeTokens.sphere as TfToken)
    supportedTypes.push(HdPrimTypeTokens.cone as TfToken)
    supportedTypes.push(HdPrimTypeTokens.cylinder as TfToken)
    supportedTypes.push(HdPrimTypeTokens.capsule as TfToken)
  }

  return supportedTypes
}

/** renderDelegate.cpp:366-375 */
function _AovHasIdSemantic(name: string): boolean {
  return name === HdAovTokens.primId ||
    name === HdAovTokens.instanceId ||
    name === HdAovTokens.elementId ||
    name === HdAovTokens.edgeId ||
    name === HdAovTokens.pointId
}

/** renderDelegate.cpp:608-616 */
function _GetGpuEnabled(args: HdRendererCreateArgsSchema): boolean {
  const ds = args.getGpuEnabled()
  if (!ds) {
    return true
  }
  return ds.getTypedValue(0.0)
}

/** renderDelegate.cpp:618-628. HdTypedSampledDataSource<Hgi*>::Cast: a
 *  sampled data source whose value is an Hgi. */
function _GetHgi(args: HdRendererCreateArgsSchema): Hgi | null {
  const ds = args.getDrivers().Get(HdRendererCreateArgsSchemaTokens.hgi)
  if (!ds) {
    return null
  }
  const hgi = ds.GetValue(0.0)
  return hgi instanceof Hgi ? hgi : null
}

/** renderDelegate.cpp:630-652 (see the header note on the platform-default
 *  Hgi check). */
function _NullOrReasonWhyNotSupported(
  rendererCreateArgs: HdRendererCreateArgsSchema,
): string | null {
  if (!_GetGpuEnabled(rendererCreateArgs)) {
    return 'GPU not enabled'
  }
  const hgi = _GetHgi(rendererCreateArgs)
  if (hgi) {
    if (hgi.IsBackendSupported()) {
      return null
    } else {
      return 'Given Hgi backend not supported'
    }
  } else {
    // If invalid Hgi instance is provided, check support for platform default
    // Hgi.
    if (_IsPlatformDefaultHgiApiPresent()) {
      return null
    } else {
      return 'Platform default Hgi not supported'
    }
  }
}

/** Synchronous stand-in for Hgi::IsSupported() (hgi.cpp:352-373) for the
 *  platform default HgiWebGPU: whether the WebGPU API is present. */
function _IsPlatformDefaultHgiApiPresent(): boolean {
  const nav = (globalThis as { navigator?: { gpu?: unknown } }).navigator
  return nav?.gpu !== undefined && nav.gpu !== null
}

/** renderDelegate.cpp:715-734 */
function _RenderDelegateInfo(): HdRenderDelegateInfo {
  const materialRenderContexts = [HioGlslfxTokens.glslfx as TfToken]
  // renderDelegate.cpp:724-726 (PXR_MATERIALX_SUPPORT_ENABLED: the
  // materialx.ts entry is loaded; materialXSupport.ts).
  if (HdSt_GetMaterialXSupport()) {
    materialRenderContexts.push('mtlx' as TfToken)
  }
  return {
    materialBindingPurpose: HdTokens.preview as TfToken,
    materialRenderContexts,
    // Left default-constructed (empty) upstream.
    renderSettingsNamespaces: [],
    isPrimvarFilteringNeeded: true,
    shaderSourceTypes: materialRenderContexts,
    isCoordSysSupported: false,
  }
}

/** renderDelegate.h:25-175. Storm's render delegate. */
/** The light sprim types HdStLight handles (renderDelegate.cpp:473-480). */
function _IsLightType(typeId: string): boolean {
  return typeId === HdPrimTypeTokens.domeLight ||
    typeId === HdPrimTypeTokens.simpleLight ||
    typeId === HdPrimTypeTokens.sphereLight ||
    typeId === HdPrimTypeTokens.diskLight ||
    typeId === HdPrimTypeTokens.distantLight ||
    typeId === HdPrimTypeTokens.cylinderLight ||
    typeId === HdPrimTypeTokens.rectLight
}

export class HdStRenderDelegate extends HdRenderDelegate {
  /** renderDelegate.cpp:91-109 */
  static get SUPPORTED_RPRIM_TYPES(): TfToken[] { return _SupportedRprimTypes() }
  static readonly SUPPORTED_SPRIM_TYPES: readonly TfToken[] = [
    HdPrimTypeTokens.camera,
    HdPrimTypeTokens.drawTarget,
    HdPrimTypeTokens.extComputation,
    HdPrimTypeTokens.material,
    HdPrimTypeTokens.domeLight,
    HdPrimTypeTokens.cylinderLight,
    HdPrimTypeTokens.diskLight,
    HdPrimTypeTokens.distantLight,
    HdPrimTypeTokens.rectLight,
    HdPrimTypeTokens.simpleLight,
    HdPrimTypeTokens.sphereLight,
    HdPrimTypeTokens.imageShader,
  ] as TfToken[]

  private _hgi: Hgi | null = null
  private _resourceRegistry: HdStResourceRegistry | null = null
  private _renderParam = new HdStRenderParam()
  private _drawItemsCache = new HdSt_DrawItemsCache()

  /** renderDelegate.cpp:201-215 */
  constructor(settingsMap?: ReadonlyMap<string, unknown>) {
    super()
    for (const [key, value] of settingsMap ?? []) {
      this._settingsMap.set(key, value)
    }
    // Initialize the settings.
    this._populateDefaultSettings(HdStRenderDelegate.getRenderSettingDescriptorsForPlugin())
  }

  /** renderDelegate.cpp:217-262 */
  static getRenderSettingDescriptorsForPlugin(): HdRenderSettingDescriptor[] {
    return [
      {
        name: 'Default transparency mode for displayOpacity',
        key: HdStRenderSettingsTokens.defaultTransparencyMode,
        defaultValue: HdStDefaultTransparencyModeTokens.screenDoor,
      },
      {
        name: 'Enable Tiny Prim Culling',
        key: HdStRenderSettingsTokens.enableTinyPrimCulling,
        defaultValue: Boolean(TfGetEnvSetting(HD_ENABLE_GPU_TINY_PRIM_CULLING)),
      },
      {
        name: 'Step size when raymarching volume',
        key: HdStRenderSettingsTokens.volumeRaymarchingStepSize,
        defaultValue: HdStVolume.defaultStepSize,
      },
      {
        name: 'Step size when raymarching volume for lighting computation',
        key: HdStRenderSettingsTokens.volumeRaymarchingStepSizeLighting,
        defaultValue: HdStVolume.defaultStepSizeLighting,
      },
      {
        name: 'Maximum memory for a volume field texture in Mb ' +
          '(unless overridden by field prim)',
        key: HdStRenderSettingsTokens.volumeMaxTextureMemoryPerField,
        defaultValue: HdStVolume.defaultMaxTextureMemoryPerField,
      },
      {
        name: 'Maximum number of lights',
        key: HdStRenderSettingsTokens.maxLights,
        defaultValue: Math.trunc(TfGetEnvSetting(HDST_MAX_LIGHTS)),
      },
      {
        name: 'Dome light camera visibility',
        key: HdRenderSettingsTokens.domeLightCameraVisibility,
        defaultValue: true,
      },
      {
        name: 'Maximum memory target, in MB, of calculated cubemap texture for ' +
          'dome light',
        key: HdStRenderSettingsTokens.domeLightCubemapTargetMemory,
        defaultValue: TfGetEnvSetting(HDST_DOME_LIGHT_CUBEMAP_TARGET_MEMORY_MB) >>> 0,
      },
      {
        name: 'Enable exposure compensation',
        key: HdRenderSettingsTokens.enableExposureCompensation,
        defaultValue: true,
      },
    ]
  }

  /** renderDelegate.cpp:264-268 */
  override getRenderSettingDescriptors(): HdRenderSettingDescriptor[] {
    return HdStRenderDelegate.getRenderSettingDescriptorsForPlugin()
  }

  /** renderDelegate.cpp:270-288 */
  override getRenderStats(): Readonly<Record<string, unknown>> {
    const registry = this._resourceRegistry as unknown as { getResourceAllocation?: () => unknown }
    const ra = registry?.getResourceAllocation?.()
    return (ra ?? {}) as Readonly<Record<string, unknown>>
  }

  /** renderDelegate.cpp:290-294 */
  requiresStormTasks(): boolean {
    return true
  }

  /** renderDelegate.cpp:298-319 */
  setDrivers(drivers: readonly HdDriver[]): void {
    if (this._resourceRegistry) {
      TF_CODING_ERROR('Cannot set HdDriver twice for a render delegate.')
      return
    }

    // For Storm we want to use the Hgi driver, so extract it.
    for (const hdDriver of drivers) {
      if (hdDriver.name === HgiTokens.renderDriver && hdDriver.driver) {
        this._hgi = hdDriver.driver as Hgi
        break
      }
    }

    TF_VERIFY(this._hgi, 'HdSt requires Hgi HdDriver')

    this._resourceRegistry = _GetOrCreateRegistry(this._hgi!)
  }

  /** renderDelegate.cpp:321-325: SUPPORTED_RPRIM_TYPES, which upstream
   *  computes once (renderDelegate.cpp:92); here once per delegate, as the
   *  environment stands when it is first asked (the render index asks for
   *  every dirtied prim). */
  getSupportedRprimTypes(): string[] {
    return this._supportedRprimTypes ??= HdStRenderDelegate.SUPPORTED_RPRIM_TYPES
  }
  private _supportedRprimTypes: string[] | undefined

  /** renderDelegate.cpp:327-331 */
  getSupportedSprimTypes(): string[] {
    return [...HdStRenderDelegate.SUPPORTED_SPRIM_TYPES]
  }

  /** renderDelegate.cpp:333-352 */
  getSupportedBprimTypes(): string[] {
    const result: string[] = []
    result.push(HdPrimTypeTokens.renderBuffer)

    for (const primType of HdStField.getSupportedBprimTypes()) {
      result.push(primType)
    }

    return result
  }

  /** renderDelegate.cpp:354-358 */
  override getRenderParam(): HdStRenderParam {
    return this._renderParam
  }

  /** renderDelegate.cpp:360-364 */
  override getResourceRegistry(): HdStResourceRegistry {
    return this._resourceRegistry!
  }

  /** renderDelegate.cpp:377-401 */
  override getDefaultAovDescriptor(name: string): HdAovDescriptor {
    const colorDepthMSAA = true // GL requires color/depth to be matching.

    if (name === HdAovTokens.color) {
      return new HdAovDescriptor(HdFormat.HdFormatFloat16Vec4, colorDepthMSAA,
        VtValue.create(new GfVec4f(0, 0, 0, 0), VtValueTypes.GfVec4f))
    } else if (HdAovHasDepthStencilSemantic(name)) {
      return new HdAovDescriptor(HdFormat.HdFormatFloat32UInt8, colorDepthMSAA,
        VtValue.create([1.0, 0], _DepthStencilType()))
    } else if (HdAovHasDepthSemantic(name)) {
      return new HdAovDescriptor(HdFormat.HdFormatFloat32, colorDepthMSAA,
        VtValue.create(1.0, VtValueTypes.float))
    } else if (_AovHasIdSemantic(name)) {
      return new HdAovDescriptor(HdFormat.HdFormatInt32, colorDepthMSAA,
        VtValue.create(-1, VtValueTypes.int))
    } else if (name === HdAovTokens.Neye) {
      return new HdAovDescriptor(HdFormat.HdFormatUNorm8Vec4, colorDepthMSAA,
        VtValue.create(new GfVec4f(0, 0, 0, 0), VtValueTypes.GfVec4f))
    }

    return new HdAovDescriptor()
  }

  /** renderDelegate.cpp:403-408 */
  override createRenderPass(index: unknown, collection: HdRprimCollection): HdSt_RenderPass {
    return new HdSt_RenderPass(index as HdRenderIndex, collection)
  }

  /** renderDelegate.cpp:410-414 */
  createRenderPassState(): HdStRenderPassState {
    return new HdStRenderPassState()
  }

  /** renderDelegate.cpp:416-421 */
  override createInstancer(delegate: HdSceneDelegate, id: string): HdInstancer {
    return new HdStInstancer(delegate, id)
  }

  /** renderDelegate.cpp:423-427. `delete instancer`: destroy() is the
   *  destructor (drops its shared_ptr members). */
  override destroyInstancer(instancer: HdInstancer): void {
    (instancer as unknown as { destroy?(): void }).destroy?.()
  }

  /** renderDelegate.cpp:429-454 */
  createRprim(typeId: string, rprimId: string): HdRprim {
    if (typeId === HdPrimTypeTokens.mesh) {
      return new HdStMesh(rprimId) as unknown as HdRprim
    } else if (typeId === HdPrimTypeTokens.basisCurves) {
      return new HdStBasisCurves(rprimId) as unknown as HdRprim
    } else if (typeId === HdPrimTypeTokens.points) {
      return new HdStPoints(rprimId) as unknown as HdRprim
    } else if (typeId === HdPrimTypeTokens.volume) {
      return new HdStVolume(rprimId) as unknown as HdRprim
    }
    TF_CODING_ERROR(`Unknown Rprim Type ${typeId}`)
    return null as unknown as HdRprim
  }

  /** renderDelegate.cpp:456-460. `delete rPrim`: destroy() is the
   *  destructor (hd/src/rprim.ts). */
  destroyRprim(rPrim: HdRprim): void {
    rPrim.destroy()
  }

  /** renderDelegate.cpp:462-489 */
  createSprim(typeId: string, sprimId: string): HdSprim {
    if (typeId === HdPrimTypeTokens.camera) {
      return new HdCamera(sprimId)
    } else if (typeId === HdPrimTypeTokens.material) {
      return new HdStMaterial(sprimId) as unknown as HdSprim
    } else if (_IsLightType(typeId)) {
      return new HdStLight(sprimId, typeId as TfToken)
    } else if (typeId === HdPrimTypeTokens.extComputation) {
      // renderDelegate.cpp:470-471
      return new HdStExtComputation(sprimId)
    }
    TF_CODING_ERROR(`Unknown Sprim Type ${typeId}`)
    return null as unknown as HdSprim
  }

  /** renderDelegate.cpp:491-517 */
  createFallbackSprim(typeId: string): HdSprim | null {
    if (typeId === HdPrimTypeTokens.camera) {
      return new HdCamera('')
    } else if (typeId === HdPrimTypeTokens.material) {
      return this._createFallbackMaterialPrim()
    } else if (_IsLightType(typeId)) {
      return new HdStLight('', typeId as TfToken)
    } else if (typeId === HdPrimTypeTokens.extComputation) {
      // renderDelegate.cpp:498-499
      return new HdStExtComputation('')
    }
    TF_CODING_ERROR(`Unknown Sprim Type ${typeId}`)
    return null
  }

  /** renderDelegate.cpp:519-523. `delete sPrim`: destroy() is the
   *  destructor of the Storm sprims that hold shared resources. */
  destroySprim(sPrim: HdSprim): void {
    (sPrim as unknown as { destroy?(): void }).destroy?.()
  }

  /** renderDelegate.cpp:525-538 */
  createBprim(typeId: string, bprimId: string): HdBprim {
    if (HdStField.isSupportedBprimType(typeId)) {
      return new HdStField(bprimId, typeId as TfToken) as unknown as HdBprim
    } else if (typeId === HdPrimTypeTokens.renderBuffer) {
      return new HdStRenderBuffer(this._resourceRegistry!, bprimId) as unknown as HdBprim
    }
    TF_CODING_ERROR(`Unknown Bprim Type ${typeId}`)
    return null as unknown as HdBprim
  }

  /** renderDelegate.cpp:540-553 */
  createFallbackBprim(typeId: string): HdBprim | null {
    if (HdStField.isSupportedBprimType(typeId)) {
      return new HdStField('', typeId as TfToken) as unknown as HdBprim
    } else if (typeId === HdPrimTypeTokens.renderBuffer) {
      return new HdStRenderBuffer(this._resourceRegistry!, '') as unknown as HdBprim
    }
    TF_CODING_ERROR(`Unknown Bprim Type ${typeId}`)
    return null
  }

  /** renderDelegate.cpp:555-559. `delete bPrim`: destroy() is the
   *  destructor of the Storm bprims that hold shared resources (the render
   *  index finalizes the bprim first, primTypeIndex.cpp:588-597). */
  destroyBprim(bPrim: HdBprim): void {
    (bPrim as unknown as { destroy?(): void }).destroy?.()
  }

  /** renderDelegate.cpp:561-574 */
  private _createFallbackMaterialPrim(): HdSprim {
    const glslfx = new HioGlslfx(HdStPackageFallbackMaterialNetworkShader())

    const fallbackShaderCode = new HdStGLSLFXShader(glslfx)

    const material = new HdStMaterial('')
    material.setMaterialNetworkShader(fallbackShaderCode)

    return material as unknown as HdSprim
  }

  /** renderDelegate.cpp:576-606 */
  CommitResources(_tracker?: unknown): void {
    this._applyTextureSettings()

    // --------------------------------------------------------------------- //
    // RESOLVE, COMPUTE & COMMIT PHASE
    // --------------------------------------------------------------------- //
    // All the required input data is now resident in memory, next we must:
    //
    //     1) Execute compute as needed for normals, tessellation, etc.
    //     2) Commit resources to the GPU.
    //     3) Update any scene-level acceleration structures.

    // Commit all pending source data.
    this._resourceRegistry!.commit()

    const stRenderParam = this._renderParam
    if (stRenderParam.isGarbageCollectionNeeded()) {
      this._resourceRegistry!.garbageCollect()
      stRenderParam.clearGarbageCollectionNeeded()
    }

    // see bug126621. currently dispatch buffers need to be released
    //                more frequently than we expect.
    this._resourceRegistry!.garbageCollectDispatchBuffers()

    this._drawItemsCache.garbageCollect()

    // PLATFORM-DIVERGENCE(hdst-compile-ahead): this frame's budget for the
    // passes' compiling ahead (HdStCommandBuffer.compileDrawingProgramsAhead).
    stRenderParam.compileAheadBudgetMs = TfGetEnvSetting(HDST_COMPILE_AHEAD_MS)
  }

  /** renderDelegate.cpp:654-670. Returns whether HdStRenderDelegate can run
   *  on the given hardware. reasonWhyNot is std::string* upstream. */
  static isSupported(
    rendererCreateArgs: HdRendererCreateArgsSchema,
    reasonWhyNot?: { value?: string },
  ): boolean {
    const result = _NullOrReasonWhyNotSupported(rendererCreateArgs)
    if (result !== null) {
      TfDebug.msg(HdDebugCodes.HD_RENDERER_PLUGIN,
        `Storm renderer not supported: ${result}.\n`)
      if (reasonWhyNot) {
        reasonWhyNot.value = result
      }
      return false
    } else {
      return true
    }
  }

  /** renderDelegate.cpp:672-676 */
  getShaderSourceTypes(): TfToken[] {
    return HdStRenderDelegate.getRenderDelegateInfo().shaderSourceTypes
  }

  /** renderDelegate.cpp:678-682 */
  getMaterialRenderContexts(): TfToken[] {
    return HdStRenderDelegate.getRenderDelegateInfo().materialRenderContexts
  }

  /** renderDelegate.cpp:684-688 */
  isPrimvarFilteringNeeded(): boolean {
    return HdStRenderDelegate.getRenderDelegateInfo().isPrimvarFilteringNeeded
  }

  /** renderDelegate.cpp:690-694 */
  getDrawItemsCache(): HdSt_DrawItemsCache {
    return this._drawItemsCache
  }

  /** renderDelegate.cpp:696-700 */
  getHgi(): Hgi {
    return this._hgi!
  }

  /** renderDelegate.cpp:702-713 */
  private _applyTextureSettings(): void {
    const memInMb = Math.fround(Math.max(0.0, Number(this.getRenderSetting(
      HdStRenderSettingsTokens.volumeMaxTextureMemoryPerField,
      HdStVolume.defaultMaxTextureMemoryPerField))))

    // size_t(1048576 * float): the product is a float, truncated.
    this._resourceRegistry!.setMemoryRequestForTextureType(
      HdStTextureType.Field, Math.trunc(Math.fround(1048576 * memInMb)))
  }

  /** renderDelegate.cpp:736-741 */
  static getRenderDelegateInfo(): HdRenderDelegateInfo {
    return _RenderDelegateInfo()
  }

  /** renderDelegate.cpp:743-747 */
  static isEnabledNativeImplicitsRenderingSupport(): boolean {
    return TfGetEnvSetting(HDST_ENABLE_NATIVE_IMPLICITS)
  }
}

/** HdDepthStencilType (hd/types.h: std::pair<float, uint32_t>), held in a
 *  VtValue as a [depth, stencil] pair under this TfType. */
let _dsType: TfType | null = null
function _DepthStencilType(): TfType {
  return _dsType ??= TfType.declare('HdDepthStencilType')
}
