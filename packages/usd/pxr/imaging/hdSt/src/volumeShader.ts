// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/volumeShader.cpp,
//  pxr/imaging/hdSt/volumeShader.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/volumeShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Out-parameter vectors are arrays the functions append to.
// - shared_from_this() is `this`.
// - TRACE_FUNCTION scopes are not ported.

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes, Array as VtArray } from 'typescript-usd/vt'
import {
  BBox3d as GfBBox3d,
  Matrix4d as GfMatrix4d,
  Matrix4f as GfMatrix4f,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  type Range3d as GfRange3d,
} from 'typescript-usd/gf'
import {
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  SamplerParameters as HdSamplerParameters,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  Wrap as HdWrap,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type SceneDelegate as HdSceneDelegate,
  type VolumeFieldDescriptor as HdVolumeFieldDescriptor,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HdStField } from './field.ts'
import { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import { HdSt_MaterialParam, HdSt_MaterialParamParamType } from './materialParam.ts'
import { HdSt_ResourceBindingSuffixTokens } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import type {
  HdStShaderCodeNamedTextureHandle,
  HdStShaderCodeResourceContext,
} from './shaderCode.ts'
import { HdSt_TextureBinder } from './textureBinder.ts'
import { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStFieldTextureObject } from './textureObject.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** volumeShader.cpp:24-31 */
const _tokens = Object.freeze({
  sampleDistance: 'sampleDistance',
  volumeBBoxInverseTransform: 'volumeBBoxInverseTransform',
  volumeBBoxLocalMin: 'volumeBBoxLocalMin',
  volumeBBoxLocalMax: 'volumeBBoxLocalMax',
})

/** volumeShader.cpp:73-80 */
function _ConcatFallback(token: string): TfToken {
  return TfToken(token + HdSt_ResourceBindingSuffixTokens.fallback)
}

/** volumeShader.cpp:231-236. Square of length of a 3-vector (a row of the
 *  matrix). */
function _SqrLengthThreeVector(m: readonly number[], row: number): number {
  const v0 = m[row * 4]!, v1 = m[row * 4 + 1]!, v2 = m[row * 4 + 2]!
  return v0 * v0 + v1 * v1 + v2 * v2
}

/** volumeShader.cpp:238-256. Assuming the bounding box comes from a grid
 *  (range is the bounding box of active voxels and matrix the grid
 *  transform), compute the distance between samples. */
function _ComputeSampleDistance(bbox: GfBBox3d): number {
  const m = bbox.getMatrix().GetArray()

  // Take minimum of lengths of images of the x-, y-, and z-vector.
  // _SqrLengthThreeVector returns float upstream; sqrt of a float.
  return Math.fround(Math.sqrt(
    Math.min(Math.fround(_SqrLengthThreeVector(m, 0)),
      Math.fround(_SqrLengthThreeVector(m, 1)),
      Math.fround(_SqrLengthThreeVector(m, 2)))))
}

/** volumeShader.cpp:258-293. Compute the bounding box and sample distance
 *  from all the fields in this volume. */
function _ComputeBBoxAndSampleDistance(
  textures: readonly HdStShaderCodeNamedTextureHandle[],
): [GfBBox3d, number] {
  // Computed by combining all bounding boxes.
  let bbox = new GfBBox3d()
  // Computes as minimum of all sampling distances.
  // (Initialized to large value rather than IEEE754-infinity which might
  // not be converted to correctly to GLSL: if there is
  // no texture, the ray marcher simply obtains a point outside the
  // bounding box after one step and stops).
  let sampleDistance = 1000000.0

  for (const texture of textures) {
    if (texture.handles.length > 1) {
      TF_CODING_ERROR(
        "Don't support array of textures for field textures")
    }
    const textureObject = texture.handles[0]!.getTextureObject()

    if (textureObject instanceof HdStFieldTextureObject) {
      const fieldBbox = textureObject.getBoundingBox()
      bbox =
        GfBBox3d.combine(bbox, fieldBbox)
      sampleDistance =
        Math.min(sampleDistance, _ComputeSampleDistance(fieldBbox))
    }
  }

  return [bbox, sampleDistance]
}

/** volumeShader.cpp:295-322. Compute 8 vertices of a bounding box. */
function _ComputePoints(bbox: GfBBox3d): VtValue {
  const points: GfVec3f[] = []

  const transform = bbox.getMatrix()
  const range = bbox.getRange()

  // Use vertices of a cube shrunk to point for empty bounding box
  // (to avoid min and max being large floating point numbers).
  const min = HdSt_VolumeShader.getSafeMin(range)
  const max = HdSt_VolumeShader.getSafeMax(range)

  for (const x of [min.get(0), max.get(0)]) {
    for (const y of [min.get(1), max.get(1)]) {
      for (const z of [min.get(2), max.get(2)]) {
        const p = transform.Transform(new GfVec3d(x, y, z)) as GfVec3d
        points.push(new GfVec3f(p.get(0), p.get(1), p.get(2)))
      }
    }
  }

  return VtValue.createArray(new VtArray<GfVec3f>(points, VtValueTypes.GfVec3f))
}

/** volumeShader.h:23-121. Adds the following behaviors to
 *  HdSt_MaterialNetworkShader:
 *  - walk through field descriptors to allocate textures and update the
 *    NamedTextureHandle's.
 *  - compute volume bounding box, adds it to the shader bar and computes
 *    points for the points bar (if requested)
 *  - bind raymarching step sizes (querried from render delegate) to uniforms
 *    in the shader */
export class HdSt_VolumeShader extends HdSt_MaterialNetworkShader {
  private _pointsBar: HdBufferArrayRange | null = null
  private _fillsPointsBar = false
  private _fieldDescriptors: HdVolumeFieldDescriptor[] = []

  /** volumeShader.cpp:34-37 */
  constructor() {
    super()
  }

  // AddBindings, BindResources and UnbindResources (volumeShader.cpp:41-59)
  // only call the base class's.

  /** volumeShader.cpp:61-65. Let HdSt_VolumeShader know about the points bar
   *  so that it can fill it with the vertices of the volume bounding box. */
  setPointsBar(pointsBar: HdBufferArrayRange | null): void {
    // The member's shared_ptr assignment (FAITHFULNESS-DEBT(
    // hd-bar-shared-ptr), hd/src/bufferArrayRange.ts).
    if (this._pointsBar === pointsBar) return
    pointsBar?._retain()
    this._pointsBar?.release()
    this._pointsBar = pointsBar
  }

  /** The destructor: drops _pointsBar with the base's members. */
  protected override _destroy(): void {
    this.setPointsBar(null)
    super._destroy()
  }

  /** volumeShader.cpp:67-71. Set whether this shader is responsible for
   *  filling the points bar. */
  setFillsPointsBar(fillsPointsBar: boolean): void {
    this._fillsPointsBar = fillsPointsBar
  }

  /** volumeShader.h:74. Check whether this shader is responsible for filling
   *  the points bar. */
  getFillsPointsBar(): boolean { return this._fillsPointsBar }

  /** volumeShader.cpp:82-155. Add params and specs to communicate volume
   *  bounding box and sample distance to shader. */
  static getParamsAndBufferSpecsForBBoxAndSampleDistance(
    params: HdSt_MaterialParam[],
    specs: HdBufferSpec[],
    doublesSupported: boolean,
  ): void {
    let mat4Fallback: VtValue
    let vec3Fallback: VtValue
    let mat4Type: HdType
    let vec3Type: HdType
    if (doublesSupported) {
      mat4Fallback = VtValue.create(new GfMatrix4d(), VtValueTypes.GfMatrix4d)
      vec3Fallback = VtValue.create(new GfVec3d(), VtValueTypes.GfVec3d)
      mat4Type = HdType.HdTypeDoubleMat4
      vec3Type = HdType.HdTypeDoubleVec3
    } else {
      mat4Fallback = VtValue.create(new GfMatrix4f(), TfType.declare('GfMatrix4f'))
      vec3Fallback = VtValue.create(new GfVec3f(), VtValueTypes.GfVec3f)
      mat4Type = HdType.HdTypeFloatMat4
      vec3Type = HdType.HdTypeFloatVec3
    }

    {
      params.push(new HdSt_MaterialParam(
        HdSt_MaterialParamParamType.ParamTypeFallback,
        TfToken(_tokens.volumeBBoxInverseTransform),
        mat4Fallback))

      specs.push({
        name: _ConcatFallback(_tokens.volumeBBoxInverseTransform),
        tupleType: { type: mat4Type, count: 1 },
      })
    }

    {
      params.push(new HdSt_MaterialParam(
        HdSt_MaterialParamParamType.ParamTypeFallback,
        TfToken(_tokens.volumeBBoxLocalMin),
        vec3Fallback))

      specs.push({
        name: _ConcatFallback(_tokens.volumeBBoxLocalMin),
        tupleType: { type: vec3Type, count: 1 },
      })
    }

    {
      params.push(new HdSt_MaterialParam(
        HdSt_MaterialParamParamType.ParamTypeFallback,
        TfToken(_tokens.volumeBBoxLocalMax),
        vec3Fallback))

      specs.push({
        name: _ConcatFallback(_tokens.volumeBBoxLocalMax),
        tupleType: { type: vec3Type, count: 1 },
      })
    }

    {
      params.push(new HdSt_MaterialParam(
        HdSt_MaterialParamParamType.ParamTypeFallback,
        TfToken(_tokens.sampleDistance),
        VtValue.create(100000.0, VtValueTypes.float)))

      specs.push({
        name: _ConcatFallback(_tokens.sampleDistance),
        tupleType: { type: HdType.HdTypeFloat, count: 1 },
      })
    }
  }

  /** volumeShader.cpp:157-209. Add buffer sources to communicate volume
   *  bounding box and sample distance to shader. */
  static getBufferSourcesForBBoxAndSampleDistance(
    bboxAndSampleDistance: [GfBBox3d, number],
    sources: HdBufferSource[],
    doublesSupported: boolean,
  ): void {
    const bbox = bboxAndSampleDistance[0]
    const range = bbox.getRange()

    {
      const sourceName = _ConcatFallback(_tokens.volumeBBoxInverseTransform)
      sources.push(
        new HdVtBufferSource(
          sourceName,
          VtValue.create(bbox.getInverseMatrix(), VtValueTypes.GfMatrix4d),
          1,
          doublesSupported))
    }

    {
      const sourceName = _ConcatFallback(_tokens.volumeBBoxLocalMin)
      sources.push(
        new HdVtBufferSource(
          sourceName,
          VtValue.create(HdSt_VolumeShader.getSafeMin(range), VtValueTypes.GfVec3d),
          1,
          doublesSupported))
    }

    {
      const sourceName = _ConcatFallback(_tokens.volumeBBoxLocalMax)
      sources.push(
        new HdVtBufferSource(
          sourceName,
          VtValue.create(HdSt_VolumeShader.getSafeMax(range), VtValueTypes.GfVec3d),
          1,
          doublesSupported))
    }

    {
      const sampleDistance = bboxAndSampleDistance[1]

      const sourceName = _ConcatFallback(_tokens.sampleDistance)
      sources.push(
        new HdVtBufferSource(
          sourceName,
          VtValue.create(Math.fround(sampleDistance), VtValueTypes.float)))
    }
  }

  /** volumeShader.cpp:211-218. GfRange3d encodes empty range by (infinity,
   *  -infinity). Avoid those insane values by returning (0,0). */
  static getSafeMin(range: GfRange3d): GfVec3d {
    if (range.IsEmpty()) {
      return new GfVec3d(0.0, 0.0, 0.0)
    }
    return range.getMin() as GfVec3d
  }

  /** volumeShader.cpp:220-227 */
  static getSafeMax(range: GfRange3d): GfVec3d {
    if (range.IsEmpty()) {
      return new GfVec3d(0.0, 0.0, 0.0)
    }
    return range.getMax() as GfVec3d
  }

  /** volumeShader.cpp:326-361. Adds buffer sources to the shader bar (for
   *  volume bounding box) and points bar if requested (besides calling
   *  HdSt_TextureBinder::ComputeBufferSources). */
  override addResourcesFromTextures(ctx: HdStShaderCodeResourceContext): void {
    const shaderBarSources: HdBufferSource[] = []

    const doublesSupported = ctx.getResourceRegistry().getHgi()
      .getCapabilities()!.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

    // Fills in sampling transforms for textures.
    HdSt_TextureBinder.computeBufferSources(
      this.getNamedTextureHandles(), shaderBarSources, doublesSupported)

    if (this._fillsPointsBar) {
      // Compute volume bounding box from field bounding boxes
      const bboxAndSampleDistance =
        _ComputeBBoxAndSampleDistance(this.getNamedTextureHandles())

      const bbox = bboxAndSampleDistance[0]

      // Use as points
      ctx.addSource(
        this._pointsBar!,
        new HdVtBufferSource(
          HdTokens.points,
          _ComputePoints(bbox)))

      // And let the shader know for raymarching bounds.
      HdSt_VolumeShader.getBufferSourcesForBBoxAndSampleDistance(
        bboxAndSampleDistance, shaderBarSources, doublesSupported)
    }

    if (shaderBarSources.length !== 0) {
      ctx.addSources(this.getShaderData()!, shaderBarSources)
    }
  }

  /** volumeShader.cpp:363-368. Set information to identify the field prims
   *  specifying what textures to load. Must line up with the
   *  NamedTextureHandle's passed to SetNamedTextureHandles. */
  setFieldDescriptors(fieldDescs: readonly HdVolumeFieldDescriptor[]): void {
    this._fieldDescriptors = [...fieldDescs]
  }

  /** volumeShader.cpp:370-437. Using the above field descriptors,
   *  (re-)allocate texture handles for the associated textures to update
   *  the NamedTextureHandle's. */
  updateTextureHandles(sceneDelegate: HdSceneDelegate): void {
    const resourceRegistry =
      sceneDelegate.getRenderIndex().getResourceRegistry() as HdStResourceRegistry

    const textureHandles = this.getNamedTextureHandles().map(
      t => ({ ...t, handles: [...t.handles] }))

    if (!TF_VERIFY(textureHandles.length === this._fieldDescriptors.length)) {
      return
    }

    // Walk through the vector of named texture handles and field descriptors
    // simultaneously.
    for (let i = 0; i < textureHandles.length; i++) {
      // To allocate the texture and update it in the vector ...
      if (textureHandles[i]!.handles.length > 1) {
        TF_CODING_ERROR(
          "Don't support array of textures for field textures")
      }

      // use field descriptor to find field prim, ...
      const fieldDesc = this._fieldDescriptors[i]!

      const bprim = sceneDelegate.getRenderIndex().getBprim(
        fieldDesc.fieldPrimType, fieldDesc.fieldId)
      const fieldPrim = bprim instanceof HdStField ? bprim : null

      // ask field prim for texture information, ...
      const textureId =
        TF_VERIFY(fieldPrim) ?
          fieldPrim!.GetTextureIdentifier() : new HdStTextureIdentifier()
      const textureType = textureHandles[i]!.type
      const textureMemory =
        TF_VERIFY(fieldPrim) ?
          fieldPrim!.getTextureMemory() : 0
      const samplerParams = _samplerParams

      // allocate texture handle and assign it.
      const handle = resourceRegistry.allocateTextureHandle(
        textureId,
        textureType,
        samplerParams,
        textureMemory,
        this)!
      if (textureHandles[i]!.handles.length === 0) {
        textureHandles[i]!.handles.push(handle)
      } else {
        textureHandles[i]!.handles[0] = handle
      }
    }

    // And update!
    this.setNamedTextureHandles(textureHandles)
  }
}

/** volumeShader.cpp:411-413 */
const _samplerParams = new HdSamplerParameters(
  HdWrap.HdWrapBlack, HdWrap.HdWrapBlack, HdWrap.HdWrapBlack,
  HdMinFilter.HdMinFilterLinear, HdMagFilter.HdMagFilterLinear)

export type HdSt_VolumeShaderSharedPtr = HdSt_VolumeShader
