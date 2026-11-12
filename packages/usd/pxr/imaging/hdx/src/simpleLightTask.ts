// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/simpleLightTask.cpp,
//  pxr/imaging/hdx/simpleLightTask.h, pxr/imaging/hd/task.h,
//  pxr/imaging/hdx/shadowMatrixComputation.h, pxr/imaging/hdx/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/simpleLightTask.{h,cpp} (OpenUSD 26.11.1),
// with HdxShadowParams (simpleLightTask.h:144-159), HdxSimpleLightTaskParams
// (simpleLightTask.h:120-142), HdxSimpleLightTaskTokens (hdx/tokens.h:126-153)
// and HdxShadowMatrixComputation (hdx/shadowMatrixComputation.h).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index
//   (hd/src/renderIndex.ts SyncTasks); `*dirtyBits = Clean` is that.
// - HdTask::_GetTaskParams (hd/task.h:245-262) is delegate.Get(id, params)
//   read here.
// - The lighting shader and context are placed in the task context under
//   HdxTokens' names (hdx/tokens.h:27-28).
// - HdStRenderSettingsTokens maxLights / domeLightCubemapTargetMemory are
//   read with HdRenderDelegate.GetRenderSetting(key, default).
// - operator<< / operator== of the params are not ported.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  ChangeTracker as HdChangeTracker,
  LightTokens as HdLightTokens,
  PrimGather as HdPrimGather,
  PrimTypeTokens as HdPrimTypeTokens,
  Task as HdTask,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSpec as HdBufferSpec,
  type Camera as HdCamera,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  Framing as CameraUtilFraming,
  ConformWindowPolicy as CameraUtilConformWindowPolicy,
} from 'typescript-usd/cameraUtil'
import {
  SimpleLight as GlfSimpleLight,
  SimpleMaterial as GlfSimpleMaterial,
} from 'typescript-usd/glf'
import {
  Binding as HdStBinding,
  BindingRequest as HdStBindingRequest,
  RenderSettingsTokens as HdStRenderSettingsTokens,
  SimpleLightingShader as HdStSimpleLightingShader,
  type Light as HdStLight,
  type ResourceRegistry as HdStResourceRegistry,
} from 'typescript-usd/hdSt'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** hdx/tokens.h:27-28 (HdxTokens, the members used here). */
export const HdxLightingTokens = {
  lightingContext: TfToken('lightingContext'),
  lightingShader: TfToken('lightingShader'),
} as const

/** hdx/tokens.h:126-153 (HDX_SIMPLELIGHTTASK_TOKENS) */
export const HdxSimpleLightTaskTokens = {
  lighting: TfToken('lighting'),
  lightingContext: TfToken('lightingContext'),
  useLighting: TfToken('useLighting'),
  useColorMaterialDiffuse: TfToken('useColorMaterialDiffuse'),
  lightCount: TfToken('lightCount'),
  lightSource: TfToken('lightSource'),
  position: TfToken('position'),
  ambient: TfToken('ambient'),
  diffuse: TfToken('diffuse'),
  specular: TfToken('specular'),
  spotDirection: TfToken('spotDirection'),
  spotCutoff: TfToken('spotCutoff'),
  spotFalloff: TfToken('spotFalloff'),
  attenuation: TfToken('attenuation'),
  worldToLightTransform: TfToken('worldToLightTransform'),
  shadowIndexStart: TfToken('shadowIndexStart'),
  shadowIndexEnd: TfToken('shadowIndexEnd'),
  hasShadow: TfToken('hasShadow'),
  isIndirectLight: TfToken('isIndirectLight'),
  shadow: TfToken('shadow'),
  worldToShadowMatrix: TfToken('worldToShadowMatrix'),
  shadowToWorldMatrix: TfToken('shadowToWorldMatrix'),
  blur: TfToken('blur'),
  bias: TfToken('bias'),
  material: TfToken('material'),
  emission: TfToken('emission'),
  sceneColor: TfToken('sceneColor'),
  shininess: TfToken('shininess'),
} as const

/** hdx/shadowMatrixComputation.h:22-38 */
export abstract class HdxShadowMatrixComputation {
  abstract compute(viewportOrFraming: GfVec4f | CameraUtilFraming,
    policy: CameraUtilConformWindowPolicy): GfMatrix4d[]
}

/** simpleLightTask.h:144-159 */
export class HdxShadowParams {
  shadowMatrix: HdxShadowMatrixComputation | null = null
  bias = 0.0
  blur = 0.0
  resolution = 0
  enabled = false

  /** A copy (a value type upstream; VtValue copies what it holds). */
  Clone(): HdxShadowParams {
    return Object.assign(new HdxShadowParams(), this)
  }
}
export const HdxShadowParamsType = TfType.declare('HdxShadowParams')

/** simpleLightTask.h:120-142 */
export class HdxSimpleLightTaskParams {
  cameraPath = ''
  lightIncludePaths: string[] = ['/']
  lightExcludePaths: string[] = []
  enableShadows = false
  viewport = new GfVec4f(0, 0, 0, 0)
  framing = new CameraUtilFraming()
  overrideWindowPolicy: [boolean, CameraUtilConformWindowPolicy] =
    [false, CameraUtilConformWindowPolicy.CameraUtilFit]

  // XXX: compatibility hack for passing some unit tests until we have
  //      more formal material plumbing.
  material = new GlfSimpleMaterial()
  sceneAmbient = new GfVec4f(0, 0, 0, 0)

  /** A copy (a value type upstream; VtValue copies what it holds). */
  Clone(): HdxSimpleLightTaskParams {
    const p = Object.assign(new HdxSimpleLightTaskParams(), this)
    p.lightIncludePaths = [...this.lightIncludePaths]
    p.lightExcludePaths = [...this.lightExcludePaths]
    p.overrideWindowPolicy = [...this.overrideWindowPolicy]
    p.material = this.material.Clone()
    return p
  }

  /** simpleLightTask.cpp:816-826 (operator==) */
  Equals(rhs: HdxSimpleLightTaskParams): boolean {
    const eq = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((x, i) => x === b[i])
    return this.cameraPath === rhs.cameraPath &&
      eq(this.lightIncludePaths, rhs.lightIncludePaths) &&
      eq(this.lightExcludePaths, rhs.lightExcludePaths) &&
      this.material.Equals(rhs.material) &&
      this.sceneAmbient.equals(rhs.sceneAmbient) &&
      this.enableShadows === rhs.enableShadows
  }
}
export const HdxSimpleLightTaskParamsType = TfType.declare('HdxSimpleLightTaskParams')

/** simpleLightTask.cpp (static lightTypes, :137-144) */
const _lightTypes: readonly string[] = [
  HdPrimTypeTokens.domeLight,
  HdPrimTypeTokens.simpleLight,
  HdPrimTypeTokens.sphereLight,
  HdPrimTypeTokens.rectLight,
  HdPrimTypeTokens.diskLight,
  HdPrimTypeTokens.cylinderLight,
  HdPrimTypeTokens.distantLight,
]

function _array<T>(values: T[], type: TfType): VtValue {
  return VtValue.createArray(new VtArray<T>(values, type))
}

/** simpleLightTask.h:33-117 */
export class HdxSimpleLightTask extends HdTask {
  private _cameraId = ''
  private _lightIds = new Map<string, string[]>()
  private _lightIncludePaths: string[] = []
  private _lightExcludePaths: string[] = []
  private _numLightIds = 0
  private _maxLights = 16
  private _sprimIndexVersion = 0
  private _settingsVersion = 0

  // Should be weak ptrs
  private readonly _lightingShader: HdStSimpleLightingShader
  private _enableShadows = false
  private _viewport = new GfVec4f(0, 0, 0, 0)
  private _framing = new CameraUtilFraming()
  private _overrideWindowPolicy: [boolean, CameraUtilConformWindowPolicy] =
    [false, CameraUtilConformWindowPolicy.CameraUtilFit]

  // XXX: compatibility hack for passing some unit tests until we have
  //      more formal material plumbing.
  private _material = new GlfSimpleMaterial()
  private _sceneAmbient = new GfVec4f(0, 0, 0, 0)

  // For now these are only valid for the lifetime of a single pass of
  // the render graph.  Maybe long-term these could be change-tracked.
  private _glfSimpleLights: GlfSimpleLight[] = []

  private _lightingBar: HdBufferArrayRange | null = null
  private _lightSourcesBar: HdBufferArrayRange | null = null
  private _shadowsBar: HdBufferArrayRange | null = null
  private _materialBar: HdBufferArrayRange | null = null

  // Build all buffer sources the first time.
  private _rebuildLightingBufferSources = true
  private _rebuildLightAndShadowBufferSources = true
  private _rebuildMaterialBufferSources = true

  /** simpleLightTask.cpp:35-71 */
  constructor(delegate: HdSceneDelegate, id: string) {
    super(id)
    const registry = delegate.getRenderIndex().getResourceRegistry() as
      HdStResourceRegistry | null
    if (registry && typeof registry.getHgi === 'function') {
      this._lightingShader = new HdStSimpleLightingShader(registry.getHgi())
    } else {
      this._lightingShader = new HdStSimpleLightingShader(null)
    }
  }

  /** simpleLightTask.cpp:75-95 */
  private _computeShadowMatrices(camera: HdCamera,
    computation: HdxShadowMatrixComputation | null): GfMatrix4d[] {
    if (!TF_VERIFY(computation)) {
      return []
    }

    const camPolicy = camera.getWindowPolicy()

    if (this._framing.isValid()) {
      const policy =
        this._overrideWindowPolicy[0]
          ? this._overrideWindowPolicy[1]
          : camPolicy
      return computation!.compute(this._framing, policy)
    } else {
      return computation!.compute(this._viewport, camPolicy)
    }
  }

  /** simpleLightTask.cpp:97-402 */
  override sync(delegateArg: unknown, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const delegate = delegateArg as HdSceneDelegate

    // Store the lighting context in the task context
    // so later on other tasks can use this information
    // draw shadows or other purposes
    ctx.set(HdxLightingTokens.lightingShader, this._lightingShader)

    const renderIndex = delegate.getRenderIndex()
    const tracker = renderIndex.getChangeTracker()
    const renderDelegate = renderIndex.getRenderDelegate()

    // Update params if needed.
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const v = delegate.Get(this.getId(), HdTokens.params)
      const held = v.IsEmpty() ? undefined : v.Get<unknown>()
      if (!(held instanceof HdxSimpleLightTaskParams)) {
        return
      }
      const params = held

      this._lightIncludePaths = params.lightIncludePaths
      this._lightExcludePaths = params.lightExcludePaths
      this._cameraId = params.cameraPath
      this._enableShadows = params.enableShadows
      this._viewport = params.viewport
      this._framing = params.framing
      this._overrideWindowPolicy = params.overrideWindowPolicy
      // XXX: compatibility hack for passing some unit tests until we have
      //      more formal material plumbing.
      this._material = params.material
      this._sceneAmbient = params.sceneAmbient

      this._rebuildMaterialBufferSources = true
    }

    let verifyNumLights = false

    // Update _lightIds if the params or the set of render index sprims changed.
    if ((dirtyBits & HdChangeTracker.DirtyParams) ||
      (tracker.getSprimIndexVersion() !== this._sprimIndexVersion)) {

      // Extract all light paths for each type of light
      this._lightIds = new Map()
      this._numLightIds = this._appendLightsOfType(renderIndex, _lightTypes,
        this._lightIncludePaths,
        this._lightExcludePaths,
        this._lightIds)

      this._sprimIndexVersion = tracker.getSprimIndexVersion()
      verifyNumLights = true
    }

    // Update _maxLights if necessary.
    let maxLightsUpdated = false
    if (renderDelegate.getRenderSettingsVersion() !== this._settingsVersion) {
      const previousMaxLights = this._maxLights
      this._maxLights = Number(renderDelegate.getRenderSetting(
        HdStRenderSettingsTokens.maxLights, 16))
      this._lightingShader.setMaxLights(this._maxLights)
      maxLightsUpdated = this._maxLights !== previousMaxLights

      // Update dome light textures max resolution.
      this._lightingShader.setDomeLightCubemapTargetMemory(
        Number(renderDelegate.getRenderSetting(
          HdStRenderSettingsTokens.domeLightCubemapTargetMemory, 0)) >>> 0)

      this._settingsVersion = renderDelegate.getRenderSettingsVersion()
      verifyNumLights = true
    }

    // Only emit the warning if the comparands changed.
    if (verifyNumLights && (this._numLightIds > this._maxLights)) {
      TF_WARN(`Hydra Storm supports up to ${this._maxLights} lights, truncating the ` +
        `${this._numLightIds} found lights to this max.`)
    }

    const camera = renderIndex.getSprim(HdPrimTypeTokens.camera, this._cameraId) as
      HdCamera | undefined
    if (!TF_VERIFY(camera)) {
      return
    }

    // The lighting shader owns the lighting context, which in turn owns the
    // shadow array.
    const lightingContext = this._lightingShader.getLightingContext()
    if (!TF_VERIFY(lightingContext)) {
      return
    }
    const shadows = lightingContext.getShadows()
    if (!TF_VERIFY(shadows)) {
      return
    }

    // Place lighting context in task context
    ctx.set(HdxLightingTokens.lightingContext, lightingContext)

    const viewMatrix = camera!.getTransform().getInverse()
    const viewInverseMatrix = camera!.getTransform()
    const projectionMatrix = camera!.computeProjectionMatrix()
    // XXX: Extract the camera window policy to adjust the frustum correctly for
    // lights that have shadows.

    // Unique identifier for lights with shadows
    let shadowIndex = -1

    const previousLightCount = this._glfSimpleLights.length
    this._glfSimpleLights = []

    const shadowMapResolutions: GfVec2i[] = []

    // Loop over the lightTypes vector so we always add the built-in light
    // types (dome and simple lights) first. This way if the scene has more
    // lights than is supported, the built-in lights should still be included.
    for (const lightType of _lightTypes) {
      const lightPaths = this._lightIds.get(lightType)
      if (lightPaths === undefined) {
        continue
      }
      for (const lightPath of lightPaths) {

        // Stop adding lights if we're at the light limit.
        if (this._glfSimpleLights.length >= this._maxLights) {
          break
        }

        const light = renderIndex.getSprim(lightType, lightPath) as HdStLight | undefined
        if (!TF_VERIFY(light)) {
          continue
        }

        // Take a copy of the simple light into our temporary array and
        // update it with viewer-dependant values.
        const vtLightParams = light!.Get(HdLightTokens.params)
        const heldLight = vtLightParams.IsEmpty() ? undefined : vtLightParams.Get<unknown>()
        const glfl = heldLight instanceof GlfSimpleLight ? heldLight.Clone() : new GlfSimpleLight()

        // Skip lights with zero intensity
        if (!glfl.hasIntensity()) {
          continue
        }

        // XXX: Pass id of light to Glf simple light, so that
        // glim can get access back to the light prim.
        glfl.setID(light!.getId())

        // If the light is in camera space we need to transform
        // the position and spot direction to world space for
        // HdStSimpleLightingShader.
        if (glfl.isCameraSpaceLight()) {
          const lightPos = glfl.getPosition()
          // GfVec4f(lightPos * viewInverseMatrix): row vector times matrix.
          const m = viewInverseMatrix
          glfl.setPosition(new GfVec4f(...[0, 1, 2, 3].map(j =>
            lightPos.get(0) * m.getElement(0, j) + lightPos.get(1) * m.getElement(1, j) +
            lightPos.get(2) * m.getElement(2, j) + lightPos.get(3) * m.getElement(3, j))))
          const lightDir = glfl.getSpotDirection()
          glfl.setSpotDirection(
            new GfVec3f(viewInverseMatrix.transformDir(lightDir)))

          // Since the light position has been transformed to world space,
          // record that it's no longer a camera-space light for any
          // downstream consumers of the lighting context.
          glfl.setIsCameraSpaceLight(false)
        }

        const vLightShadowParams = light!.Get(HdLightTokens.shadowParams)
        const heldShadow = vLightShadowParams.IsEmpty() ? undefined : vLightShadowParams.Get<unknown>()
        const lightShadowParams = heldShadow instanceof HdxShadowParams
          ? heldShadow : new HdxShadowParams()

        // If shadows are disabled from the rendergraph then
        // we treat this light as if it had the shadow disabled
        // doing so we guarantee that shadowIndex will be -1
        // which will not create memory for the shadow maps
        if (!this._enableShadows || !lightShadowParams.enabled) {
          glfl.setHasShadow(false)
        }

        // Setup the rest of the light parameters necessary
        // to calculate shadows.
        if (glfl.hasShadow()) {
          const shadowMatrices =
            this._computeShadowMatrices(
              camera!, lightShadowParams.shadowMatrix)

          if (shadowMatrices.length === 0) {
            glfl.setHasShadow(false)
          } else {
            glfl.setShadowIndexStart(shadowIndex + 1)
            glfl.setShadowIndexEnd(shadowIndex + shadowMatrices.length)
            shadowIndex += shadowMatrices.length

            glfl.setShadowMatrices(shadowMatrices)
            glfl.setShadowBias(lightShadowParams.bias)
            glfl.setShadowBlur(lightShadowParams.blur)
            glfl.setShadowResolution(lightShadowParams.resolution)
          }

          for (let i = 0; i < shadowMatrices.length; ++i) {
            shadowMapResolutions.push(
              new GfVec2i(lightShadowParams.resolution, lightShadowParams.resolution))
          }
        }
        this._glfSimpleLights.push(glfl)
      }
      // Stop adding lights if we're at the light limit.
      if (this._glfSimpleLights.length >= this._maxLights) {
        break
      }
    }

    TF_VERIFY(this._glfSimpleLights.length <= this._maxLights)

    const useLighting = this._glfSimpleLights.length !== 0
    const lightCountChanged = this._glfSimpleLights.length !== previousLightCount
    if (useLighting !== lightingContext.getUseLighting()
      || lightCountChanged) {
      this._rebuildLightingBufferSources = true
    }

    const oldLights = lightingContext.getLights()
    const lightsDiffer = oldLights.length !== this._glfSimpleLights.length ||
      this._glfSimpleLights.some((l, i) => !l.Equals(oldLights[i]!))
    if (lightsDiffer || maxLightsUpdated) {
      this._rebuildLightAndShadowBufferSources = true
    }

    lightingContext.setUseLighting(useLighting)
    lightingContext.setLights(this._glfSimpleLights)
    lightingContext.setCamera(viewMatrix, projectionMatrix)
    // XXX: compatibility hack for passing some unit tests until we have
    //      more formal material plumbing.
    lightingContext.setMaterial(this._material)
    lightingContext.setSceneAmbient(this._sceneAmbient)

    // If there are shadows then we need to create and setup
    // the shadow array needed in the lighting context in
    // order to receive shadows
    // This will re-allocate internal buffers if they change.
    if (lightingContext.getUseShadows()) {
      shadows.setShadowMapResolutions(shadowMapResolutions)

      if (shadowIndex > -1) {
        for (const light of this._glfSimpleLights) {
          if (!light.hasShadow()) {
            continue
          }
          // Complete the shadow setup for this light
          const shadowStart = light.getShadowIndexStart()
          const shadowEnd = light.getShadowIndexEnd()
          const shadowMatrices = light.getShadowMatrices()

          for (let shadowId = shadowStart; shadowId <= shadowEnd; ++shadowId) {
            shadows.setViewMatrix(shadowId, light.getTransform().getInverse())
            shadows.setProjectionMatrix(shadowId,
              shadowMatrices[shadowId - shadowStart]!)
          }
        }
      }
    } else {
      shadows.setShadowMapResolutions([])
    }

    const id = this.getId()
    const graphPath = id.slice(0, Math.max(id.lastIndexOf('/'), 1))

    this._lightingShader.allocateTextureHandles(renderIndex, graphPath)

    // *dirtyBits = HdChangeTracker::Clean: see the header.
  }

  /** simpleLightTask.cpp:403-762 */
  override Prepare(_ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    const T = HdxSimpleLightTaskTokens
    const lightingContext = this._lightingShader.getLightingContext()
    if (!TF_VERIFY(lightingContext)) {
      return
    }

    const hdStResourceRegistry =
      renderIndex.getResourceRegistry() as HdStResourceRegistry | null

    if (!hdStResourceRegistry || typeof hdStResourceRegistry.allocateUniformBufferArrayRange !== 'function') {
      return
    }

    const spec = (specs: HdBufferSpec[], name: TfToken, type: HdType): void => {
      specs.push({ name, tupleType: { type, count: 1 } })
    }
    const uniformHint = HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform

    // Allocate lighting BAR
    if (!this._lightingBar) {
      const bufferSpecs: HdBufferSpec[] = []

      spec(bufferSpecs, T.useLighting, HdType.HdTypeBool)
      spec(bufferSpecs, T.lightCount, HdType.HdTypeUInt32)
      spec(bufferSpecs, T.useColorMaterialDiffuse, HdType.HdTypeBool)

      this._lightingBar = hdStResourceRegistry.allocateUniformBufferArrayRange(
        T.lighting,
        bufferSpecs,
        uniformHint)

      this._lightingShader.addBufferBinding(
        new HdStBindingRequest(HdStBinding.UBO,
          T.lightingContext,
          this._lightingBar!, /*interleaved=*/true))
    }

    // Add lighting buffer sources
    if (this._rebuildLightingBufferSources) {
      const sources = [
        new HdVtBufferSource(T.useLighting,
          VtValue.create(lightingContext.getUseLighting(), VtValueTypes.bool)),
        new HdVtBufferSource(T.lightCount,
          VtValue.create(lightingContext.getNumLightsUsed() >>> 0, VtValueTypes.uint)),
        new HdVtBufferSource(T.useColorMaterialDiffuse,
          VtValue.create(lightingContext.getUseColorMaterialDiffuse(), VtValueTypes.bool)),
      ]

      hdStResourceRegistry.addSources(this._lightingBar!, sources)
    }

    const numLights = lightingContext.getNumLightsUsed()
    const numShadows = lightingContext.computeNumShadowsUsed()

    // Allocate light sources BAR
    if (!this._lightSourcesBar) {
      const bufferSpecs: HdBufferSpec[] = []

      spec(bufferSpecs, T.position, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.ambient, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.diffuse, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.specular, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.spotDirection, HdType.HdTypeFloatVec3)
      spec(bufferSpecs, T.spotCutoff, HdType.HdTypeFloat)
      spec(bufferSpecs, T.spotFalloff, HdType.HdTypeFloat)
      spec(bufferSpecs, T.attenuation, HdType.HdTypeFloatVec3)
      spec(bufferSpecs, T.worldToLightTransform, HdType.HdTypeFloatMat4)
      spec(bufferSpecs, T.shadowIndexStart, HdType.HdTypeInt32)
      spec(bufferSpecs, T.shadowIndexEnd, HdType.HdTypeInt32)
      spec(bufferSpecs, T.hasShadow, HdType.HdTypeBool)
      spec(bufferSpecs, T.isIndirectLight, HdType.HdTypeBool)

      this._lightSourcesBar = hdStResourceRegistry.allocateUniformBufferArrayRange(
        T.lighting,
        bufferSpecs,
        uniformHint)
    }

    this._lightingShader.removeBufferBinding(T.lightSource)

    if (lightingContext.getUseLighting()) {
      this._lightingShader.addBufferBinding(
        new HdStBindingRequest(HdStBinding.UBO,
          T.lightSource,
          this._lightSourcesBar!, /*interleaved=*/true,
          /*writable*/false, numLights,
          /*concatenateNames*/true))
    }

    // Allocate shadows BAR if needed
    const useShadows = lightingContext.getUseShadows()
    if (!this._shadowsBar && useShadows) {
      const bufferSpecs: HdBufferSpec[] = []

      spec(bufferSpecs, T.worldToShadowMatrix, HdType.HdTypeFloatMat4)
      spec(bufferSpecs, T.shadowToWorldMatrix, HdType.HdTypeFloatMat4)
      spec(bufferSpecs, T.blur, HdType.HdTypeFloat)
      spec(bufferSpecs, T.bias, HdType.HdTypeFloat)

      this._shadowsBar =
        hdStResourceRegistry.allocateUniformBufferArrayRange(
          T.lighting, bufferSpecs,
          uniformHint)
    }

    this._lightingShader.removeBufferBinding(T.shadow)

    if (lightingContext.getUseShadows()) {
      this._lightingShader.addBufferBinding(
        new HdStBindingRequest(HdStBinding.UBO, T.shadow,
          this._shadowsBar!, /*interleaved=*/true,
          /*writable*/false, numShadows,
          /*concatenateNames*/true))
    }

    // Add light and shadow buffer sources
    if (this._rebuildLightAndShadowBufferSources) {
      const maxLights = this._maxLights
      const fill = <V>(n: number, v: () => V): V[] => Array.from({ length: n }, v)
      // Light sources
      const position = fill(maxLights, () => new GfVec4f(0, 0, 0, 1))
      const ambient = fill(maxLights, () => new GfVec4f(0, 0, 0, 0))
      const diffuse = fill(maxLights, () => new GfVec4f(0, 0, 0, 0))
      const specular = fill(maxLights, () => new GfVec4f(0, 0, 0, 0))
      const spotDirection = fill(maxLights, () => new GfVec3f(0, 0, 1))
      const spotCutoff = fill(maxLights, () => 0.0)
      const spotFalloff = fill(maxLights, () => 0.0)
      const attenuation = fill(maxLights, () => new GfVec3f(0, 0, 0))
      const worldToLightTransform = fill(maxLights, () => new GfMatrix4f(1))
      const shadowIndexStart = fill(maxLights, () => 0)
      const shadowIndexEnd = fill(maxLights, () => 0)
      const hasShadow = fill(maxLights, () => false)
      const isIndirectLight = fill(maxLights, () => false)

      // Shadows (GfMatrix4f() is uninitialized upstream; zero here)
      const maxShadows = this._lightingShader.getMaxShadows()
      const worldToShadowMatrix = fill(maxShadows, () => new GfMatrix4f(0))
      const shadowToWorldMatrix = fill(maxShadows, () => new GfMatrix4f(0))
      const blur = fill(maxShadows, () => 0.0)
      const bias = fill(maxShadows, () => 0.0)

      const lights = lightingContext.getLights()
      const shadows = lightingContext.getShadows()

      for (let i = 0; i < numLights; ++i) {
        const l = lights[i]!
        position[i] = l.getPosition()
        ambient[i] = l.getAmbient()
        diffuse[i] = l.getDiffuse()
        specular[i] = l.getSpecular()
        spotDirection[i] = l.getSpotDirection()
        spotCutoff[i] = l.getSpotCutoff()
        spotFalloff[i] = l.getSpotFalloff()
        attenuation[i] = l.getAttenuation()
        worldToLightTransform[i] =
          new GfMatrix4f(l.getTransform().getInverse())
        shadowIndexStart[i] = l.getShadowIndexStart()
        shadowIndexEnd[i] = l.getShadowIndexEnd()
        hasShadow[i] = l.hasShadow()
        isIndirectLight[i] = l.isDomeLight()
        // Shadows
        if (hasShadow[i]) {
          for (let j = shadowIndexStart[i]!; j <= shadowIndexEnd[i]!; ++j) {
            worldToShadowMatrix[j] = new GfMatrix4f(
              shadows.getWorldToShadowMatrix(j))
            shadowToWorldMatrix[j] = new GfMatrix4f(
              worldToShadowMatrix[j]!.getInverse())
            blur[j] = l.getShadowBlur()
            bias[j] = l.getShadowBias()
          }
        }
      }

      const M4f = TfType.declare('GfMatrix4f')
      const sources = [
        new HdVtBufferSource(T.position, _array(position, VtValueTypes.GfVec4f)),
        new HdVtBufferSource(T.ambient, _array(ambient, VtValueTypes.GfVec4f)),
        new HdVtBufferSource(T.diffuse, _array(diffuse, VtValueTypes.GfVec4f)),
        new HdVtBufferSource(T.specular, _array(specular, VtValueTypes.GfVec4f)),
        new HdVtBufferSource(T.spotDirection, _array(spotDirection, VtValueTypes.GfVec3f)),
        new HdVtBufferSource(T.spotCutoff, _array(spotCutoff, VtValueTypes.float)),
        new HdVtBufferSource(T.spotFalloff, _array(spotFalloff, VtValueTypes.float)),
        new HdVtBufferSource(T.attenuation, _array(attenuation, VtValueTypes.GfVec3f)),
        new HdVtBufferSource(T.worldToLightTransform, _array(worldToLightTransform, M4f)),
        new HdVtBufferSource(T.shadowIndexStart, _array(shadowIndexStart, VtValueTypes.int)),
        new HdVtBufferSource(T.shadowIndexEnd, _array(shadowIndexEnd, VtValueTypes.int)),
        new HdVtBufferSource(T.hasShadow, _array(hasShadow, VtValueTypes.bool)),
        new HdVtBufferSource(T.isIndirectLight, _array(isIndirectLight, VtValueTypes.bool)),
      ]

      hdStResourceRegistry.addSources(this._lightSourcesBar!, sources)

      if (useShadows) {
        const shadowSources = [
          new HdVtBufferSource(T.worldToShadowMatrix, _array(worldToShadowMatrix, M4f)),
          new HdVtBufferSource(T.shadowToWorldMatrix, _array(shadowToWorldMatrix, M4f)),
          new HdVtBufferSource(T.blur, _array(blur, VtValueTypes.float)),
          new HdVtBufferSource(T.bias, _array(bias, VtValueTypes.float)),
        ]

        hdStResourceRegistry.addSources(this._shadowsBar!, shadowSources)
      }
    }

    // Allocate material BAR
    if (!this._materialBar) {
      const bufferSpecs: HdBufferSpec[] = []

      spec(bufferSpecs, T.ambient, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.diffuse, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.specular, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.emission, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.sceneColor, HdType.HdTypeFloatVec4)
      spec(bufferSpecs, T.shininess, HdType.HdTypeFloat)

      // Allocate interleaved buffer
      this._materialBar = hdStResourceRegistry.allocateUniformBufferArrayRange(
        T.lighting,
        bufferSpecs,
        uniformHint)

      // Add buffer binding request
      this._lightingShader.addBufferBinding(
        new HdStBindingRequest(HdStBinding.UBO, TfToken('material'),
          this._materialBar!, /*interleaved=*/true,
          /*writable*/false, /*arraySize*/0,
          /*concatenateNames*/true))
    }

    // Add material buffer sources
    if (this._rebuildMaterialBufferSources) {
      const material = lightingContext.getMaterial()
      const v4 = (v: GfVec4f) => VtValue.create(v, VtValueTypes.GfVec4f)

      const sources = [
        new HdVtBufferSource(T.ambient, v4(material.getAmbient())),
        new HdVtBufferSource(T.diffuse, v4(material.getDiffuse())),
        new HdVtBufferSource(T.specular, v4(material.getSpecular())),
        new HdVtBufferSource(T.emission, v4(material.getEmission())),
        new HdVtBufferSource(T.sceneColor, v4(lightingContext.getSceneAmbient())),
        new HdVtBufferSource(T.shininess,
          VtValue.create(Math.fround(material.getShininess()), VtValueTypes.float)),
      ]

      hdStResourceRegistry.addSources(this._materialBar!, sources)
    }

    this._rebuildLightingBufferSources = false
    this._rebuildLightAndShadowBufferSources = false
    this._rebuildMaterialBufferSources = false
  }

  /** simpleLightTask.cpp:764-769 */
  override Execute(_ctx: HdTaskContext): void {
  }

  /** simpleLightTask.cpp:771-801 */
  private _appendLightsOfType(renderIndex: HdRenderIndex,
    lightTypes: readonly string[],
    lightIncludePaths: string[],
    lightExcludePaths: string[],
    lights: Map<string, string[]>): number {
    let count = 0
    const supported = renderIndex.getRenderDelegate().getSupportedSprimTypes()
    for (const it of lightTypes) {
      if (supported.includes(it)) {
        // XXX: This is inefficient, need to be optimized
        const sprimPaths = renderIndex.getSprimSubtree(it, '/')

        const gather = new HdPrimGather()
        const P = (p: string) => SdfPath.fromString(p)
        const lightsLocal = gather.filter(sprimPaths.map(P),
          lightIncludePaths.map(P), lightExcludePaths.map(P)).map(p => p.pathString)
        const numLocalLights = lightsLocal.length
        if (numLocalLights > 0) {
          lights.set(it, lightsLocal)
          count += numLocalLights
        }
      }
    }
    return count
  }

  /** The lighting shader (for tests; upstream reads it from the task
   *  context, simpleLightTask.cpp:106-107). */
  getLightingShader(): HdStSimpleLightingShader {
    return this._lightingShader
  }
}
