// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/volume.cpp,
//  pxr/imaging/hdSt/volume.h, pxr/imaging/hdSt/shaders/volume.glslfx
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/volume.{h,cpp} (OpenUSD 26.11.1): a volume,
// drawn as the triangles of its bounding box raymarched by the volume
// shader (volume.glslfx).
//
// Deliberate divergences:
// - HdDirtyBits* parameters are HdDirtyBitsRef boxes. SdfPath ids are path
//   strings.
// - The shared data upstream reaches as `_sharedData` is HdRprim's
//   `_rprimSharedData` (hd/rprim.ts header).
// - Sync accepts the HdRprim union signature (hd/rprim.ts) and uses the
//   scene-delegate form.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, Hash as TfHash, Token as TfToken } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { BBox3d as GfBBox3d, Vec3f as GfVec3f, Vec3i as GfVec3i, Vec4f as GfVec4f, type Range3d as GfRange3d } from 'typescript-usd/gf'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  ChangeTracker as HdChangeTracker,
  DebugCodes as HdDebugCodes,
  DrawingCoord as HdDrawingCoord,
  HdVolumeRprim as HdVolume,
  MeshGeomStyle as HdMeshGeomStyle,
  PrimTypeTokens as HdPrimTypeTokens,
  Repr as HdRepr,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferSource as HdBufferSource,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexPrim as HdSceneIndexPrim,
  type VolumeFieldDescriptor as HdVolumeFieldDescriptor,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdStDrawItem } from './drawItem.ts'
import { HdStTextureType } from './enums.ts'
import { HdStField } from './field.ts'
import { HdSt_GeometricShader } from './geometricShader.ts'
import type { HdStMaterial, HdStMaterialVolumeMaterialData } from './material.ts'
import { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import { HdSt_MaterialParam, HdSt_MaterialParamParamType } from './materialParam.ts'
import { HdStPackageFallbackVolumeShader } from './package.ts'
import {
  HdStIsValidBAR,
  HdStMarkGarbageCollectionNeeded,
  HdStPopulateConstantPrimvars,
  HdStSetMaterialId,
  HdStSetMaterialTag,
  HdStShouldPopulateConstantPrimvars,
  HdStUpdateInstancerData,
  HdStUpdateRenderTag,
} from './primUtils.ts'
import type { HdStRenderParam } from './renderParam.ts'
import { HdSt_ResourceBindingSuffixTokens } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type { HdStShaderCodeNamedTextureHandle } from './shaderCode.ts'
import { HdSt_TextureBinder } from './textureBinder.ts'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'
import { HdStMaterialTagTokens } from './tokens.ts'
import { HdSt_VolumeShader } from './volumeShader.ts'
import { HdSt_VolumeShaderKey } from './volumeShaderKey.ts'

/** volume.cpp:35-40 */
const _fallbackShaderTokens = Object.freeze({
  density: 'density',
  emission: 'emission',
})

/** HF_VALIDATION_WARN (hf/diagnostic.h:23-26). */
function HF_VALIDATION_WARN(id: string, message: string): void {
  TF_WARN(`Invalid Hydra prim '${id}': ${message}`)
}

/** volume.cpp:53-67. Dirty bits requiring recomputing the material shader
 *  and the bounding box. */
const _shaderAndBBoxComputationDirtyBitsMask =
  HdChangeTracker.Clean
  | HdChangeTracker.DirtyExtent
  | HdChangeTracker.DirtyMaterialId
  | HdChangeTracker.DirtyRepr
  | HdChangeTracker.DirtyVolumeField

const _initialDirtyBitsMask =
  _shaderAndBBoxComputationDirtyBitsMask
  | HdChangeTracker.DirtyPrimID
  | HdChangeTracker.DirtyPrimvar
  | HdChangeTracker.DirtyTransform
  | HdChangeTracker.DirtyVisibility
  | HdChangeTracker.DirtyInstancer

/** volume.cpp:186-208. Fallback volume data created from
 *  shaders/fallbackVolume.glslfx. */
function _MakeFallbackVolumeMaterialData(): HdStMaterialVolumeMaterialData {
  const glslfx = new HioGlslfx(HdStPackageFallbackVolumeShader())

  return {
    source: glslfx.getVolumeSource(),
    params: [
      new HdSt_MaterialParam(
        HdSt_MaterialParamParamType.ParamTypeFieldRedirect,
        TfToken(_fallbackShaderTokens.density),
        VtValue.create(0.0, VtValueTypes.float),
        [TfToken(_fallbackShaderTokens.density)]),
      new HdSt_MaterialParam(
        HdSt_MaterialParamParamType.ParamTypeFieldRedirect,
        TfToken(_fallbackShaderTokens.emission),
        VtValue.create(new GfVec3f(0.0, 0.0, 0.0), VtValueTypes.GfVec3f),
        [TfToken(_fallbackShaderTokens.emission)]),
    ],
  }
}

// volume.cpp:226-232: instantiate fallback volume shader only once.
let _fallbackData: HdStMaterialVolumeMaterialData | null = null

/** volume.cpp:210-233 */
function _ComputeVolumeMaterialData(
  material: HdStMaterial | null,
): HdStMaterialVolumeMaterialData {
  // Try to use volume material data from material.
  if (material) {
    const data = material.getVolumeMaterialData()
    if (data.source !== '') {
      return data
    }
  }

  // Instantiate fallback volume shader only once
  //
  // Note that the default HdStMaterial provides a fallback surface
  // shader and we need a volume shader, so we create the shader here
  // ourselves.
  return _fallbackData ??= _MakeFallbackVolumeMaterialData()
}

/** volume.cpp:235-290. A map from name to HdVolumeFieldDescriptor
 *  (identifying a field prim).
 *
 *  Initialized from a volume prim identified by its path. In the usd world,
 *  this map is created by following the field:NAME relationships on the
 *  volume prim to the targeted field prims. The information identifiying the
 *  field prim is inserted under the key NAME. */
class _NameToFieldDescriptor {
  private readonly _descriptors: HdVolumeFieldDescriptor[]
  private readonly _nameToDescriptor = new Map<string, HdVolumeFieldDescriptor>()

  /** volume.cpp:249-271. Get information from scene delegate and create
   *  map. Issue validation error if relationship did not target a field
   *  prim. */
  constructor(sceneDelegate: HdSceneDelegate, id: string) {
    this._descriptors = sceneDelegate.getVolumeFieldDescriptors(id)
    for (const desc of this._descriptors) {
      if (sceneDelegate.getRenderIndex().getBprim(
        desc.fieldPrimType, desc.fieldId) instanceof HdStField) {

        // std::unordered_map::insert keeps the first entry of a name.
        if (!this._nameToDescriptor.has(desc.fieldName)) {
          this._nameToDescriptor.set(desc.fieldName, desc)
        }

      } else {
        HF_VALIDATION_WARN(
          id,
          `Volume has field relationship to non-field prim ${desc.fieldId}.`)
      }
    }
  }

  /** volume.cpp:273-285. Get information identifiying field prim associated
   *  to given name. Returns null if no such field prim. */
  getDescriptor(name: string): HdVolumeFieldDescriptor | null {
    return this._nameToDescriptor.get(name) ?? null
  }
}

/** volume.cpp:292-442. Add GLSL code such as "HdGet_density(vec3 p)" for
 *  sampling the fields to the volume shader code and add necessary 3d
 *  textures and other parameters and buffer sources to the resulting
 *  HdSt_VolumeShader. HdMaterialParam's are consulted to figure out the
 *  names of the fields to sample and the names of the associated sampling
 *  functions to generate.
 *
 *  The resulting shader can also fill the points bar of the volume computed
 *  from the bounding box of the volume. */
function _ComputeMaterialNetworkShader(
  sceneDelegate: HdSceneDelegate,
  id: string,
  volumeMaterialData: HdStMaterialVolumeMaterialData,
  authoredExtents: GfRange3d,
): HdSt_VolumeShader {
  const resourceRegistry =
    sceneDelegate.getRenderIndex().getResourceRegistry() as HdStResourceRegistry

  // Generate new shader from volume shader
  const result = new HdSt_VolumeShader()

  // Buffer specs and source for the shader BAR
  const bufferSpecs: HdBufferSpec[] = []
  const bufferSources: HdBufferSource[] = []

  // The names of the fields read by field readers (a std::set: sorted).
  const fieldNameSet = new Set<string>()

  for (const param of volumeMaterialData.params) {
    // Scan original parameters...
    if (param.isFieldRedirect() ||
        param.isPrimvarRedirect() ||
        param.isFallback()) {
      // Add fallback values for parameters
      HdSt_MaterialNetworkShader.addFallbackValueToSpecsAndSources(
        param, bufferSpecs, bufferSources)

      if (param.isFieldRedirect()) {
        // Determine the name of the field the field reader requests.
        const names = param.samplerCoords
        if (names.length !== 0) {
          fieldNameSet.add(names[0]!)
        }
      }
    }
    // Ignoring 2D texture parameters for volumes.
  }
  const fieldNames = [...fieldNameSet].sort(_TfTokenLess)

  // Make a copy of the original params
  const params: HdSt_MaterialParam[] = [...volumeMaterialData.params]

  // Note that it is a requirement of HdSt_VolumeShader that
  // namedTextureHandles and fieldDescs line up.
  let namedTextureHandles: HdStShaderCodeNamedTextureHandle[] = []
  const fieldDescs: HdVolumeFieldDescriptor[] = []

  const nameToFieldDescriptor = new _NameToFieldDescriptor(sceneDelegate, id)

  // For each requested field name, record the information needed to
  // allocate the necessary texture later:
  // - a texture HdSt_MaterialParam
  // - an HdVolumeFieldDescriptor identifying the HdStField prim holding
  //   the path to the texture
  // - a HdStShader::NamedTextureHandle initialized with a null-handle.
  //
  for (const fieldName of fieldNames) {
    // See whether we have the the field in the volume field
    // descriptors given to us by the scene delegate.
    const desc = nameToFieldDescriptor.getDescriptor(fieldName)
    if (!desc) {
      // Invalid field prim, skip.
      continue
    }

    // Record field descriptor
    fieldDescs.push(desc)

    const textureName = TfToken(
      fieldName +
      HdSt_ResourceBindingSuffixTokens.texture)
    const textureType = HdStTextureType.Field

    // Produce HdGet_FIELDNAME_texture(vec3 p) to sample
    // the texture.
    const param = new HdSt_MaterialParam(
      HdSt_MaterialParamParamType.ParamTypeTexture,
      textureName,
      VtValue.create(new GfVec4f(0, 0, 0, 0), VtValueTypes.GfVec4f),
      [],
      textureType)

    HdSt_MaterialNetworkShader.addFallbackValueToSpecsAndSources(
      param, bufferSpecs, bufferSources)

    params.push(param)

    namedTextureHandles.push(
      { name: textureName, type: textureType, handles: [], hash: TfHash(desc.fieldId) })
  }

  result.setNamedTextureHandles(namedTextureHandles)
  result.setFieldDescriptors(fieldDescs)
  result.updateTextureHandles(sceneDelegate)
  // Get now allocated texture handles
  namedTextureHandles = [...result.getNamedTextureHandles()]

  const doublesSupported = resourceRegistry.getHgi()
    .getCapabilities()!.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

  // Get buffer specs for textures (i.e., for
  // field sampling transforms and bindless texture handles).
  HdSt_TextureBinder.getBufferSpecs(namedTextureHandles, bufferSpecs,
    doublesSupported)

  // Create params (so that HdGet_... are created) and buffer specs,
  // to communicate volume bounding box and sample distance to shader.
  HdSt_VolumeShader.getParamsAndBufferSpecsForBBoxAndSampleDistance(
    params, bufferSpecs, doublesSupported)

  const hasField = namedTextureHandles.length !== 0

  // If there is a field, we postpone giving buffer sources for
  // the volume bounding box until after the textures have been
  // committed.
  if (!hasField) {
    HdSt_VolumeShader.getBufferSourcesForBBoxAndSampleDistance(
      [new GfBBox3d(authoredExtents), 1.0],
      bufferSources,
      doublesSupported)
  }

  // Make volume shader responsible if we have fields with bounding
  // boxes.
  result.setFillsPointsBar(hasField)
  result.setParams(params)
  result.setBufferSources(
    bufferSpecs, bufferSources, resourceRegistry)

  // Append the volume shader (calling into the GLSL functions
  // generated above)
  result.setFragmentSource(volumeMaterialData.source)

  return result
}

/** TfToken's operator< (the std::set<TfToken> order): by string. */
function _TfTokenLess(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** volume.cpp:444-464 */
function _ComputeBBoxVertices(range: GfRange3d): VtValue {
  const result: GfVec3f[] = []

  const min = HdSt_VolumeShader.getSafeMin(range)
  const max = HdSt_VolumeShader.getSafeMax(range)

  for (const x of [min.get(0), max.get(0)]) {
    for (const y of [min.get(1), max.get(1)]) {
      for (const z of [min.get(2), max.get(2)]) {
        result.push(new GfVec3f(x, y, z))
      }
    }
  }

  return VtValue.createArray(new VtArray<GfVec3f>(result, VtValueTypes.GfVec3f))
}

/** volume.cpp:466-490 */
function _GetCubeTriangleIndices(): VtValue {
  return _cubeTriangleIndices ??= VtValue.createArray(new VtArray<GfVec3i>([
    new GfVec3i(1, 3, 2),
    new GfVec3i(0, 1, 2),

    new GfVec3i(7, 5, 4),
    new GfVec3i(6, 7, 4),

    new GfVec3i(5, 1, 0),
    new GfVec3i(4, 5, 0),

    new GfVec3i(3, 7, 6),
    new GfVec3i(2, 3, 6),

    new GfVec3i(2, 6, 4),
    new GfVec3i(0, 2, 4),

    new GfVec3i(7, 3, 1),
    new GfVec3i(5, 7, 1)], VtValueTypes.GfVec3i))
}
let _cubeTriangleIndices: VtValue | null = null

/** volume.h:21-79 */
export class HdStVolume extends HdVolume {
  // volume.h:74-76 enum DrawingCoord
  static readonly InstancePrimvar = HdDrawingCoord.CustomSlotsBegin

  /** volume.cpp:42-44. Default step size used for raymarching. */
  static readonly defaultStepSize = 1.0
  /** Default step size used for raymarching for lighting computation. */
  static readonly defaultStepSizeLighting = 10.0
  /** Default memory limit for a field texture (in Mb) if not overridden by
   *  field prim with textureMemory. */
  static readonly defaultMaxTextureMemoryPerField = 128.0

  private _volumeRepr: HdRepr | null = null

  /** volume.cpp:46-49 */
  constructor(id: string) {
    super(id)
  }

  /** volume.cpp:70-75 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    const mask = _initialDirtyBitsMask
    return mask
  }

  /** volume.cpp:77-81 */
  protected override _propagateDirtyBits(bits: HdDirtyBits): HdDirtyBits {
    return bits
  }

  /** volume.cpp:83-110 */
  protected override _initRepr(reprToken: string, dirtyBits: HdDirtyBitsRef): void {
    // All representations point to _volumeRepr.
    if (!this._volumeRepr) {
      this._volumeRepr = new HdRepr()
      const drawItem = new HdStDrawItem(this._rprimSharedData)
      // Make sure we never replace this material by the default material
      // network (_GetFallbackMaterialNetworkShader in drawBatch.cpp) which
      // simply does not work with the volume render pass shader.
      drawItem.setMaterialIsFinal(true)
      const drawingCoord = drawItem.getDrawingCoord()
      // Set up drawing coord instance primvars.
      drawingCoord.setInstancePrimvarBaseIndex(
        HdStVolume.InstancePrimvar)
      this._volumeRepr.addDrawItem(drawItem)
      dirtyBits.value |= HdChangeTracker.NewRepr
    }

    const it = this._reprs.find((r) => r[0] === reprToken)
    const isNew = it === undefined
    if (isNew) {
      // add new repr
      this._reprs.push([reprToken, this._volumeRepr])
    }
  }

  /** volume.cpp:112-117 */
  override updateRenderTag(delegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined): void {
    HdStUpdateRenderTag(delegate, renderParam, this,
      (d, r) => super.updateRenderTag(d, r))
  }

  /** volume.cpp:119-144 */
  override sync(
    delegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBitsOrRepr: HdDirtyBitsRef | string,
    reprTokenArg?: string,
  ): void {
    const delegate = delegateOrPrim as HdSceneDelegate
    const renderParam = renderParamOrBits as HdRenderParam | null | undefined
    const dirtyBits = dirtyBitsOrRepr as HdDirtyBitsRef
    const reprToken = reprTokenArg!

    this._updateVisibility(delegate, dirtyBits)

    if (dirtyBits.value & HdChangeTracker.DirtyMaterialId) {
      HdStSetMaterialId(delegate, renderParam, this)

      const drawItem = this._volumeRepr!.getDrawItem(0) as HdStDrawItem
      HdStSetMaterialTag(renderParam, drawItem,
        HdStMaterialTagTokens.volume as TfToken)
    }

    this._updateRepr(delegate, renderParam, reprToken, dirtyBits)

    // This clears all the non-custom dirty bits. This ensures that the rprim
    // doesn't have pending dirty bits that add it to the dirty list every
    // frame.
    // XXX: GetInitialDirtyBitsMask sets certain dirty bits that aren't
    // reset (e.g. DirtyExtent, DirtyPrimID) that make this necessary.
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits
  }

  /** volume.cpp:146-157 */
  override finalize(renderParam: HdRenderParam | null | undefined): void {
    HdStMarkGarbageCollectionNeeded(renderParam)

    const stRenderParam = renderParam as unknown as HdStRenderParam

    // Decrement material tag count for volume material tag
    stRenderParam.decreaseMaterialTagCount(HdStMaterialTagTokens.volume as TfToken)
    stRenderParam.decreaseRenderTagCount(this.getRenderTag())
  }

  /** volume.cpp:159-182 */
  protected _updateRepr(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    reprToken: string,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const curRepr = this._volumeRepr!

    if (TfDebug.isEnabled(HdDebugCodes.HD_RPRIM_UPDATED)) {
      // HdChangeTracker::DumpDirtyBits(*dirtyBits) is not ported; the bits
      // are printed in hex.
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `HdStVolume::_UpdateRepr for ${this.getId()} : Repr = ${reprToken}\n` +
        `DirtyBits: 0x${(dirtyBits.value >>> 0).toString(16)}\n`)
    }

    const drawItem = curRepr.getDrawItem(0) as HdStDrawItem

    if (HdChangeTracker.isDirty(dirtyBits.value)) {
      this._updateDrawItem(sceneDelegate, renderParam, drawItem, dirtyBits)
    }

    dirtyBits.value &= ~HdChangeTracker.NewRepr
  }

  /** volume.cpp:494-653 */
  private _updateDrawItem(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    /* INSTANCE PRIMVARS */
    this._updateInstancer(sceneDelegate, dirtyBits)
    HdStUpdateInstancerData(sceneDelegate.getRenderIndex(),
      renderParam,
      this,
      drawItem,
      this._rprimSharedData,
      dirtyBits.value,
      null,
      null)

    if (HdStShouldPopulateConstantPrimvars(dirtyBits, this.getId())) {
      /* CONSTANT PRIMVARS, TRANSFORM AND EXTENT */

      HdStPopulateConstantPrimvars(this,
        this._rprimSharedData,
        sceneDelegate,
        renderParam,
        drawItem,
        dirtyBits,
        null, HdMeshGeomStyle.HdMeshGeomStyleInvalid, 0, 0,
        null, null, null)
    }

    let updatedTextureHandles = false
    if (dirtyBits.value & HdChangeTracker.DirtyMaterialId) {
      /* MATERIAL SHADER (may affect subsequent primvar population) */

      // Note that the creation of the HdSt_VolumeShader and the
      // allocation of the necessary textures is driven by two
      // different dirtyBits (HdChangeTracker::DirtyMaterialId and
      // HdChangeTracker::DirtyVolumeField).
      //
      // This way, we do not need to re-create the shader on every frame
      // when the fields of a volume are animated.
      //
      const material = (sceneDelegate.getRenderIndex().getSprim(
        HdPrimTypeTokens.material, this.getMaterialId()) ?? null) as HdStMaterial | null

      // Compute the material shader by adding GLSL code such as
      // "HdGet_density(vec3 p)" for sampling the fields needed by the volume
      // shader.
      // The material shader will eventually be concatenated with
      // the geometry shader which does the raymarching and is calling into
      // GLSL functions such as "float scattering(vec3)" in the volume shader
      // to evaluate physical properties of a volume at the point p.

      drawItem.setMaterialNetworkShader(
        _ComputeMaterialNetworkShader(
          sceneDelegate,
          this.getId(),
          _ComputeVolumeMaterialData(material),
          this._rprimSharedData.bounds.getRange()))
      updatedTextureHandles = true
    }

    const resourceRegistry =
      sceneDelegate.getRenderIndex().getResourceRegistry() as HdStResourceRegistry

    const materialNetworkShader = drawItem.getMaterialNetworkShader()

    if (!(materialNetworkShader instanceof HdSt_VolumeShader)) {
      TF_CODING_ERROR('Expected valid volume shader for draw item.')
      return
    }

    // We do not need to call UpdateTextureHandles() on the
    // materialNetworkShader if DirtyMaterialId, as it was already called
    // during _ComputeMaterialNetworkShader().
    if ((dirtyBits.value & HdChangeTracker.DirtyVolumeField) &&
        !updatedTextureHandles) {
      /* FIELD TEXTURES */

      // (Re-)Allocate the textures associated with the field prims.
      materialNetworkShader.updateTextureHandles(sceneDelegate)
    }

    /* VERTICES */
    if (dirtyBits.value & _shaderAndBBoxComputationDirtyBitsMask) {
      // Any change to the bounding box requires us to recompute
      // the vertices
      //
      if (!HdStIsValidBAR(drawItem.getVertexPrimvarRange())) {
        const bufferSpecs: HdBufferSpec[] = [
          { name: HdTokens.points, tupleType: { type: HdType.HdTypeFloatVec3, count: 1 } },
        ]

        const range =
          resourceRegistry.allocateNonUniformBufferArrayRange(
            HdTokens.primvar, bufferSpecs,
            HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex)
        this._rprimSharedData.barContainer.Set(
          drawItem.getDrawingCoord().getVertexPrimvarIndex(), range)
      }

      // Let HdSt_VolumeShader know about the points bar so that it
      // can fill it with the vertices of the volume bounding box.
      materialNetworkShader.setPointsBar(drawItem.getVertexPrimvarRange())

      // If HdSt_VolumeShader is not in charge of filling the points bar
      // from the volume bounding box computed from the fields, ...
      if (!materialNetworkShader.getFillsPointsBar()) {
        // ... fill the points from the authored extents.
        resourceRegistry.addSource(
          drawItem.getVertexPrimvarRange()!,
          new HdVtBufferSource(
            HdTokens.points,
            _ComputeBBoxVertices(
              this._rprimSharedData.bounds.getRange())))
      }
    }

    if (dirtyBits.value & HdChangeTracker.NewRepr) {
      // Bounding box topology and geometric shader key only need to
      // be initialized the first time we make the draw item.

      const shaderKey = new HdSt_VolumeShaderKey()
      drawItem.setGeometricShader(
        HdSt_GeometricShader.create(shaderKey, resourceRegistry))

      /* TRIANGLE INDICES */
      {
        // XXX:
        // Always the same triangle indices, should they be allocated only
        // once and shared across all volumes?
        const source =
          new HdVtBufferSource(
            HdTokens.indices, _GetCubeTriangleIndices())

        const sources: HdBufferSource[] = [source]

        if (!HdStIsValidBAR(drawItem.getTopologyRange())) {
          const bufferSpecs: HdBufferSpec[] = []
          HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

          const range =
            resourceRegistry.allocateNonUniformBufferArrayRange(
              HdTokens.primvar, bufferSpecs,
              HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex)
          this._rprimSharedData.barContainer.Set(
            drawItem.getDrawingCoord().getTopologyIndex(), range)
        }

        resourceRegistry.addSources(drawItem.getTopologyRange()!,
          sources)
      }
    }
  }
}
