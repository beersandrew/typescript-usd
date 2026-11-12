// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureObject.cpp,
//  pxr/imaging/hdSt/textureObject.h,
//  pxr/imaging/hdSt/textureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureObject.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also noted at its site):
// - Lifetime. Upstream texture objects are std::shared_ptr's: the registry
//   holds one and frees the object in GarbageCollect when it holds the only
//   one (HdInstanceRegistry, use_count() == 1). JavaScript cannot observe
//   use counts, so holders say so explicitly: _Retain() for every holder
//   besides the registry (a texture handle, or a client of
//   AllocateTextureObject) and Release() when that holder lets go. `_expired`
//   (the HdInstanceRegistry convention, hd/src/instanceRegistry.ts) is true
//   when no such holder is left. The destructors run as _Destroy(), called
//   by the registry when it drops the object.
// - _Load returns a promise where reading is asynchronous: upstream loads
//   on worker threads (textureObjectRegistry.cpp:229-244); asset reads and
//   image decoding are asynchronous in the browser, so
//   HdSt_TextureObjectRegistry.LoadAsync awaits them before Commit (see
//   textureObjectRegistry.ts).
// - HdStFieldTextureObject::_Load reads the field asynchronously
//   (HioFieldTextureData::Read, hio/src/fieldTextureData.ts); the read
//   happens in the load phase like the image reads above.
// - TRACE_FUNCTION scopes are not ported.

import { Debug as TfDebug } from 'typescript-usd/tf'
import { StreamOut as VtStreamOut, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  BBox3d as GfBBox3d,
  Matrix4d as GfMatrix4d,
  Range3d as GfRange3d,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec3i as GfVec3i,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { GetValueData as HdGetValueData, Wrap as HdWrap } from 'typescript-usd/hd'
import {
  HgiFormat,
  HgiGetDataSize,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
  type Hgi,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { FieldTextureData as HioFieldTextureData, HioImageOriginLocation, HioImageSourceColorSpace } from 'typescript-usd/hio'
import { HdStAssetUvTextureCpuData } from './assetUvTextureCpuData.ts'
import { HdStDebugCodes } from './debugCodes.ts'
import { HdSt_FieldTextureCpuData } from './fieldTextureCpuData.ts'
import { HdStTextureType } from './enums.ts'
import {
  HdStField3DAssetSubtextureIdentifier,
  HdStOpenVDBAssetSubtextureIdentifier,
} from './fieldSubtextureIdentifier.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStAssetUvSubtextureIdentifier,
  HdStDynamicCubemapSubtextureIdentifier,
  HdStPtexSubtextureIdentifier,
  HdStUdimSubtextureIdentifier,
  type HdStSubtextureIdentifier,
} from './subtextureIdentifier.ts'
import type { HdStTextureCpuData } from './textureCpuData.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import type { HdSt_TextureObjectRegistry } from './textureObjectRegistry.ts'
import { HdStTextureUtils } from './textureUtils.ts'
import { HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

///////////////////////////////////////////////////////////////////////////////
// Generic Helpers

/** VtValue::CanCast<T> + Get<T> for the fallback types
 *  GetDefaultForFallbackTexture tries, in its order. */
function _CastFallback(value: VtValue, type: Parameters<VtValue['canCast']>[0]): VtValue | null {
  if (value.IsEmpty() || !value.canCast(type)) return null
  return value.castToType(type)
}

/** textureObject.cpp:34-83. Read from textureId to create a fallback value
 *  for fallback texture creation. */
export function GetDefaultForFallbackTexture(
  textureId: HdStTextureIdentifier,
): [HgiFormat, VtValue] {
  let fallbackString = `Loading ${textureId.getFilePath()} failed!`

  let fallback = textureId.getFallback()
  let fallbackFormat: HgiFormat
  let cast: VtValue | null
  if ((cast = _CastFallback(fallback, VtValueTypes.GfVec4f))) {
    fallback = cast
    fallbackFormat = HgiFormat.HgiFormatFloat32Vec4
  } else if ((cast = _CastFallback(fallback, VtValueTypes.GfVec3f))) {
    // 3 component formats have low support, expand to 4 component.
    const fallbackRGB = cast.Get<GfVec3f>()
    fallback = VtValue.create(new GfVec4f(
      fallbackRGB.data[0]!, fallbackRGB.data[1]!, fallbackRGB.data[2]!, 1.0), VtValueTypes.GfVec4f)
    fallbackFormat = HgiFormat.HgiFormatFloat32Vec4
    fallbackString += ' Padding default to vec4 for compatibility!'
  } else if ((cast = _CastFallback(fallback, VtValueTypes.GfVec2f))) {
    fallback = cast
    fallbackFormat = HgiFormat.HgiFormatFloat32Vec2
  } else if ((cast = _CastFallback(fallback, VtValueTypes.float))) {
    fallback = cast
    fallbackFormat = HgiFormat.HgiFormatFloat32
  } else {
    if (fallback.IsEmpty()) {
      fallbackString += ' No fallback value available, using default!'
    } else {
      fallbackString += ` Fallback value invalid: ${VtStreamOut(fallback)}, using default!`
    }
    fallback = VtValue.create(new GfVec4f(0.0, 0.0, 0.0, 1.0), VtValueTypes.GfVec4f)
    fallbackFormat = HgiFormat.HgiFormatFloat32Vec4
  }
  // `<< fallback`: VtValue's operator<< streams the held value
  // (vt/value.h:1364-1366, value.cpp:530), e.g. GfVec4f as "(0, 0, 0, 1)".
  fallbackString += ` Using fallback value: ${VtStreamOut(fallback)}`
  if (!textureId.shouldDefaultToFallback()) {
    TF_WARN(fallbackString)
  } else {
    TfDebug.msg(HdStDebugCodes.HDST_LOG_TEXTURE_FALLBACKS, fallbackString)
  }
  return [fallbackFormat, fallback]
}

///////////////////////////////////////////////////////////////////////////////
// HdStTextureObject

/** textureObject.h:37-127. Base class for a texture object. The actual GPU
 *  resources will be allocated during the commit phase. */
export abstract class HdStTextureObject {
  private readonly _textureObjectRegistry: HdSt_TextureObjectRegistry
  private readonly _textureId: HdStTextureIdentifier
  private _targetMemory = 0

  /** Holders besides the registry (see the header). */
  private _holders = 0

  /** Set when the registry has dropped (destroyed) the object: weak
   *  pointers to it no longer lock (see the header). */
  _dead = false

  /** textureObject.cpp:88-95 */
  protected constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    this._textureObjectRegistry = textureObjectRegistry
    this._textureId = textureId
  }

  /** shared_ptr copy by a holder besides the registry (see the header). */
  _retain(): this {
    this._holders++
    return this
  }

  /** shared_ptr destruction by a holder besides the registry (see the
   *  header). */
  release(): void {
    if (TF_VERIFY(this._holders > 0, 'HdStTextureObject released too often')) {
      this._holders--
    }
  }

  /** True when only the registry holds this object (use_count() == 1,
   *  hd/src/instanceRegistry.ts). */
  get _expired(): boolean {
    return this._holders === 0
  }

  /** textureObject.h:43-45. Get texture identifier. */
  GetTextureIdentifier(): HdStTextureIdentifier { return this._textureId }

  /** textureObject.h:49-50. Get the target memory for the texture. */
  getTargetMemory(): number { return this._targetMemory }

  /** textureObject.cpp:97-105. Set the target memory (in bytes). When
   *  uploading the texture to the GPU, it will be downsampled to meet this
   *  target memory. */
  setTargetMemory(targetMemory: number): void {
    if (this._targetMemory === targetMemory) {
      return
    }
    this._targetMemory = targetMemory
    this._textureObjectRegistry.markTextureObjectDirty(this)
  }

  /** textureObject.h:61-62. Returns the actual amount of memory committed
   *  to the GPU. */
  abstract getCommittedSize(): number

  /** textureObject.h:64-70. Is texture valid? Only correct after commit
   *  phase. */
  abstract isValid(): boolean

  /** textureObject.h:72-75. Get texture type. */
  abstract getTextureType(): HdStTextureType

  /** The C++ destructor (see the header). Called by the registry when it
   *  drops the object. */
  _destroy(): void {
  }

  /** textureObject.cpp:107-120 */
  protected _getResourceRegistry(): HdStResourceRegistry | null {
    if (!TF_VERIFY(this._textureObjectRegistry)) {
      return null
    }

    const registry = this._textureObjectRegistry.getResourceRegistry()
    TF_VERIFY(registry)

    return registry
  }

  /** textureObject.cpp:122-135 */
  protected _getHgi(): Hgi | null {
    const registry = this._getResourceRegistry()
    if (!TF_VERIFY(registry)) {
      return null
    }

    const hgi = registry!.getHgi()
    TF_VERIFY(hgi)

    return hgi
  }

  /** textureObject.cpp:172-226 */
  protected _getDebugName(textureId: HdStTextureIdentifier): string {
    const filePath = textureId.getFilePath() as string
    const subId = textureId.getSubtextureIdentifier()

    if (!subId) {
      return filePath
    }

    if (subId instanceof HdStOpenVDBAssetSubtextureIdentifier) {
      return filePath + ' - ' + subId.getFieldName()
    }

    if (subId instanceof HdStField3DAssetSubtextureIdentifier) {
      return filePath + ' - ' +
        subId.getFieldName() + ' ' +
        String(subId.getFieldIndex()) + ' ' +
        subId.getFieldPurpose()
    }

    if (subId instanceof HdStAssetUvSubtextureIdentifier) {
      return filePath +
        ' - flipVertically=' + String(Number(subId.getFlipVertically())) +
        ' - premultiplyAlpha=' + String(Number(subId.getPremultiplyAlpha())) +
        ' - sourceColorSpace=' + subId.getSourceColorSpace()
    }

    if (subId instanceof HdStPtexSubtextureIdentifier) {
      return filePath +
        ' - premultiplyAlpha=' + String(Number(subId.getPremultiplyAlpha()))
    }

    if (subId instanceof HdStUdimSubtextureIdentifier) {
      return filePath +
        ' - premultiplyAlpha=' + String(Number(subId.getPremultiplyAlpha())) +
        ' - sourceColorSpace=' + subId.getSourceColorSpace()
    }

    return filePath + ' - unknown subtexture identifier'
  }

  /** textureObject.cpp:228-256. Read from the HdStSubtextureIdentifier
   *  whether we need to pre-multiply the texture by alpha. */
  protected _getPremultiplyAlpha(subId: HdStSubtextureIdentifier | null): boolean {
    switch (this.getTextureType()) {
      case HdStTextureType.Uv:
        if (subId instanceof HdStAssetUvSubtextureIdentifier) {
          return subId.getPremultiplyAlpha()
        }
        return false
      case HdStTextureType.Ptex:
        if (subId instanceof HdStPtexSubtextureIdentifier) {
          return subId.getPremultiplyAlpha()
        }
        return false
      case HdStTextureType.Udim:
        if (subId instanceof HdStUdimSubtextureIdentifier) {
          return subId.getPremultiplyAlpha()
        }
        return false
      default:
        return false
    }
  }

  /** textureObject.cpp:258-289. Read from the HdStSubtextureIdentifier its
   *  source color space. */
  protected _getSourceColorSpace(subId: HdStSubtextureIdentifier | null): HioImageSourceColorSpace {
    let sourceColorSpace = ''
    switch (this.getTextureType()) {
      case HdStTextureType.Uv:
        if (subId instanceof HdStAssetUvSubtextureIdentifier) {
          sourceColorSpace = subId.getSourceColorSpace()
        }
        break
      case HdStTextureType.Udim:
        if (subId instanceof HdStUdimSubtextureIdentifier) {
          sourceColorSpace = subId.getSourceColorSpace()
        }
        break
      default:
        break
    }

    if (sourceColorSpace === HdStTokens.sRGB) {
      return HioImageSourceColorSpace.SRGB
    }
    if (sourceColorSpace === HdStTokens.raw) {
      return HioImageSourceColorSpace.Raw
    }
    return HioImageSourceColorSpace.Auto
  }

  /** textureObject.h:100-102. Load texture to CPU (see the header on
   *  promises). */
  abstract _load(): void | Promise<void>

  /** textureObject.h:104-106. Commit texture to GPU. */
  abstract _commit(): void

  /** textureObject.cpp:137-144. Add signed number to total texture memory
   *  amount maintained by registry. */
  protected _adjustTotalTextureMemory(memDiff: number): void {
    if (TF_VERIFY(this._textureObjectRegistry)) {
      this._textureObjectRegistry.adjustTotalTextureMemory(memDiff)
    }
  }

  /** textureObject.cpp:146-155. Compute memory of texture and add to total
   *  texture memory amount maintained by registry. */
  protected _addToTotalTextureMemory(texture: HgiTextureHandle): void {
    const t = texture.Get()
    if (t) {
      this._adjustTotalTextureMemory(t.getByteSizeOfResource())
    }
  }

  /** textureObject.cpp:157-166. Compute memory of texture and subtract to
   *  total texture memory amount maintained by registry. */
  protected _subtractFromTotalTextureMemory(texture: HgiTextureHandle): void {
    const t = texture.Get()
    if (t) {
      this._adjustTotalTextureMemory(-t.getByteSizeOfResource())
    }
  }
}
export type HdStTextureObjectSharedPtr = HdStTextureObject

///////////////////////////////////////////////////////////////////////////////
// Uv texture

/** textureObject.h:134-191. A base class for uv textures (including
 *  cubemaps). */
export abstract class HdStUvTextureObject extends HdStTextureObject {
  private _wrapParameters: [HdWrap, HdWrap] = [HdWrap.HdWrapNoOpinion, HdWrap.HdWrapNoOpinion]
  private _cpuData: HdStTextureCpuData | null = null
  private _gpuTexture: HgiTextureHandle
  private readonly _textureType: HdStTextureType

  /** textureObject.cpp:294-307 */
  protected constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    super(textureId, textureObjectRegistry)
    this._gpuTexture = HdStTextureUtils._emptyTextureHandle()
    const subId = textureId.getSubtextureIdentifier()
    if (subId instanceof HdStDynamicCubemapSubtextureIdentifier) {
      this._textureType = HdStTextureType.Cubemap
    } else {
      this._textureType = HdStTextureType.Uv
    }
  }

  /** textureObject.h:141-149. Get the handle to the actual GPU resource.
   *  Only valid after commit phase. */
  getTexture(): HgiTextureHandle {
    return this._gpuTexture
  }

  /** textureObject.h:151-156. Opinion about wrapS and wrapT parameters from
   *  the texture file. Only valid after commit phase. Can be
   *  HdWrapNoOpinion. */
  getWrapParameters(): readonly [HdWrap, HdWrap] {
    return this._wrapParameters
  }

  /** textureObject.cpp:310-314 */
  getTextureType(): HdStTextureType {
    return this._textureType
  }

  /** textureObject.cpp:316-323 */
  getCommittedSize(): number {
    if (!this._cpuData) {
      return 0
    }
    return this._cpuData.getTextureDesc().pixelsByteSize
  }

  /** textureObject.cpp:325-328 (destructor). */
  override _destroy(): void {
    this._destroyTexture()
  }

  /** textureObject.cpp:330-335 */
  protected _setWrapParameters(wrapParameters: readonly [HdWrap, HdWrap]): void {
    this._wrapParameters = [wrapParameters[0], wrapParameters[1]]
  }

  /** textureObject.cpp:337-342 */
  protected _setCpuData(cpuData: HdStTextureCpuData | null): void {
    this._cpuData = cpuData
  }

  /** textureObject.cpp:344-348 */
  protected _getCpuData(): HdStTextureCpuData | null {
    return this._cpuData
  }

  /** textureObject.cpp:350-362 */
  protected _CreateTexture(desc: HgiTextureDesc): void {
    const hgi = this._getHgi()
    if (!TF_VERIFY(hgi)) {
      return
    }

    this._destroyTexture()

    this._gpuTexture = hgi!.createTexture(desc)
    this._addToTotalTextureMemory(this._gpuTexture)
  }

  /** textureObject.cpp:364-378 */
  protected _GenerateMipmaps(): void {
    const registry = this._getResourceRegistry()
    if (!TF_VERIFY(registry)) {
      return
    }

    if (!this._gpuTexture.isSet()) {
      return
    }

    const blitCmds = registry!.getGlobalBlitCmds()
    blitCmds.generateMipMaps(this._gpuTexture)
  }

  /** textureObject.cpp:380-387 */
  protected _destroyTexture(): void {
    const hgi = this._getHgi()
    if (hgi) {
      this._subtractFromTotalTextureMemory(this._gpuTexture)
      if (this._gpuTexture.isSet()) {
        hgi.destroyTexture(this._gpuTexture)
      }
    }
  }
}

///////////////////////////////////////////////////////////////////////////////
// Uv asset texture

/** textureObject.cpp:398-410. Read from the HdStAssetUvSubtextureIdentifier
 *  whether we need to flip the image. This is to support the legacy
 *  HwUvTexture_1 shader node which has the vertical orientation opposite to
 *  UsdUvTexture. */
function _GetImageOriginLocation(subId: HdStSubtextureIdentifier | null): HioImageOriginLocation {
  if (subId instanceof HdStAssetUvSubtextureIdentifier) {
    if (subId.getFlipVertically()) {
      return HioImageOriginLocation.OriginUpperLeft
    }
  }
  return HioImageOriginLocation.OriginLowerLeft
}

/** textureObject.h:198-222. A uv texture loading the asset identified by
 *  the texture identifier. */
export class HdStAssetUvTextureObject extends HdStUvTextureObject {
  private _valid = false

  /** textureObject.cpp:412-418 */
  constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    super(textureId, textureObjectRegistry)
  }

  /** textureObject.cpp:422-442. The image files are opened asynchronously
   *  (see the header); the rest of the load is
   *  HdStAssetUvTextureCpuData's constructor. */
  async _load(): Promise<void> {
    if (this.GetTextureIdentifier().shouldDefaultToFallback()) {
      return
    }

    const subId = this.GetTextureIdentifier().getSubtextureIdentifier()
    const sourceColorSpace = this._getSourceColorSpace(subId)
    const filePath = this.GetTextureIdentifier().getFilePath() as string
    // HdStAssetUvTextureCpuData's constructor opens all mips for the image
    // (assetUvTextureCpuData.cpp:47-49).
    const mips = await HdStTextureUtils.GetAllMipImagesAsync(filePath, sourceColorSpace)

    const cpuData = new HdStAssetUvTextureCpuData(
      filePath,
      mips,
      this.getTargetMemory(),
      this._getPremultiplyAlpha(subId),
      _GetImageOriginLocation(subId),
      sourceColorSpace)
    this._setWrapParameters(cpuData.getWrapInfo())
    this._setCpuData(cpuData)
  }

  /** textureObject.cpp:444-482 */
  _commit(): void {
    this._destroyTexture()
    this._valid = false

    const cpuData = this._getCpuData()
    if (cpuData) {
      if (cpuData.isValid()) {
        // Upload to GPU
        this._CreateTexture(cpuData.getTextureDesc())
        this._valid = true
        if (cpuData.getGenerateMipmaps()) {
          this._GenerateMipmaps()
        }
      }
    }

    if (!this._valid) {
      const [fallbackFormat, fallbackValue] =
        GetDefaultForFallbackTexture(this.GetTextureIdentifier())
      // Create 1x1 fallback texture.
      const textureDesc = new HgiTextureDesc()
      textureDesc.debugName = this.GetTextureIdentifier().getFilePath() + '_FALLBACK'
      textureDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      textureDesc.type = HgiTextureType.HgiTextureType2D
      textureDesc.dimensions = new GfVec3i(1, 1, 1)
      textureDesc.format = fallbackFormat
      textureDesc.mipLevels = 1
      textureDesc.layerCount = 1
      textureDesc.initialData = HdGetValueData(fallbackValue)
      textureDesc.pixelsByteSize = HgiGetDataSize(fallbackFormat, textureDesc.dimensions)
      this._CreateTexture(textureDesc)
    }

    // Free CPU memory after transfer to GPU
    this._setCpuData(null)
  }

  /** textureObject.cpp:484-488 */
  isValid(): boolean {
    return this._valid
  }
}

///////////////////////////////////////////////////////////////////////////////
// Field texture

/** textureObject.cpp:498-513. Compute transform mapping GfRange3d to unit
 *  box [0,1]^3. */
function _ComputeSamplingTransformOfRange(range: GfRange3d): GfMatrix4d {
  const size = range.getSize()

  const scale = new GfVec3d(1.0 / size.data[0]!, 1.0 / size.data[1]!, 1.0 / size.data[2]!)

  const min = range.getMin()
  return new GfMatrix4d(1.0).setTranslateOnly(
    new GfVec3d(-min.data[0]!, -min.data[1]!, -min.data[2]!))
    // Then scale to unit box
    .getMultiply(new GfMatrix4d(1.0).setScale(scale))
}

/** textureObject.cpp:515-525. Compute transform mapping bounding box to
 *  unit box [0,1]^3. */
export function _ComputeSamplingTransform(bbox: GfBBox3d): GfMatrix4d {
  return bbox.getInverseMatrix().getMultiply(
    _ComputeSamplingTransformOfRange(bbox.getRange()))
}

/** textureObject.cpp:527-567 */
function _ComputeFieldTexData(
  textureId: HdStTextureIdentifier,
  targetMemory: number,
): HioFieldTextureData | null {
  const filePath = textureId.getFilePath() as string
  const subId = textureId.getSubtextureIdentifier()

  if (subId instanceof HdStOpenVDBAssetSubtextureIdentifier) {
    if (subId.getFieldIndex() !== 0) {
      TF_WARN('Support of field index when reading OpenVDB file not yet ' +
        `implemented (file: ${filePath}, field name: ${subId.getFieldName()}, ` +
        `field index: ${subId.getFieldIndex()}`)
    }
    return HioFieldTextureData.new(
      filePath,
      subId.getFieldName(),
      0,
      '',
      targetMemory)
  }

  if (subId instanceof HdStField3DAssetSubtextureIdentifier) {
    return HioFieldTextureData.new(
      filePath,
      subId.getFieldName(),
      subId.getFieldIndex(),
      subId.getFieldPurpose(),
      targetMemory)
  }

  TF_CODING_ERROR('Unsupported field subtexture identifier')

  return null
}

/** textureObject.h:229-283. A uvw texture with a bounding box describing
 *  how to transform it. */
export class HdStFieldTextureObject extends HdStTextureObject {
  private _bbox = new GfBBox3d()
  private _samplingTransform = new GfMatrix4d(1.0)
  private _cpuData: HdSt_FieldTextureCpuData | null = null
  private _gpuTexture: HgiTextureHandle = HdStTextureUtils._emptyTextureHandle()
  private _valid = false

  /** textureObject.cpp:569-576 */
  constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    super(textureId, textureObjectRegistry)
  }

  /** textureObject.cpp:578-585 (destructor). */
  override _destroy(): void {
    const hgi = this._getHgi()
    if (hgi) {
      this._subtractFromTotalTextureMemory(this._gpuTexture)
      if (this._gpuTexture.isSet()) hgi.destroyTexture(this._gpuTexture)
    }
    this._valid = false
  }

  /** textureObject.h:244-250. Only valid after commit phase. */
  getTexture(): HgiTextureHandle { return this._gpuTexture }

  /** textureObject.h:252-257. The box the texture fills out. */
  getBoundingBox(): GfBBox3d { return this._bbox }

  /** textureObject.h:259-266. The sampling transform. */
  getSamplingTransform(): GfMatrix4d { return this._samplingTransform }

  /** textureObject.cpp:587-622 (reading the field is asynchronous, see
   *  the header). */
  async _load(): Promise<void> {
    if (this.GetTextureIdentifier().shouldDefaultToFallback()) {
      return
    }

    const texData = _ComputeFieldTexData(
      this.GetTextureIdentifier(),
      this.getTargetMemory())

    if (!texData) {
      return
    }

    await texData.Read()

    this._cpuData = new HdSt_FieldTextureCpuData(
      texData,
      this._getDebugName(this.GetTextureIdentifier()))

    if (this._cpuData.isValid()) {
      if (this._cpuData.getTextureDesc().type !== HgiTextureType.HgiTextureType3D) {
        TF_CODING_ERROR('Wrong texture type for field')
      }

      this._bbox = texData.getBoundingBox()
      this._samplingTransform = _ComputeSamplingTransform(this._bbox)
    } else {
      this._bbox = new GfBBox3d()
      this._samplingTransform = new GfMatrix4d(1.0)
    }
  }

  /** textureObject.cpp:624-666 */
  _commit(): void {
    const hgi = this._getHgi()
    if (!hgi) {
      return
    }

    // Free previously allocated texture
    this._subtractFromTotalTextureMemory(this._gpuTexture)
    if (this._gpuTexture.isSet()) hgi.destroyTexture(this._gpuTexture)
    this._valid = false

    // Upload to GPU only if we have valid CPU data
    if (this._cpuData && this._cpuData.isValid()) {
      this._gpuTexture = hgi.createTexture(this._cpuData.getTextureDesc())
      this._valid = true
    } else {
      const [fallbackFormat, fallbackValue] =
        GetDefaultForFallbackTexture(this.GetTextureIdentifier())
      // Create 1x1x1 black fallback texture.
      const textureDesc = new HgiTextureDesc()
      textureDesc.debugName = this.GetTextureIdentifier().getFilePath() + '_FALLBACK'
      textureDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      textureDesc.format = fallbackFormat
      textureDesc.type = HgiTextureType.HgiTextureType3D
      textureDesc.dimensions = new GfVec3i(1, 1, 1)
      textureDesc.layerCount = 1
      textureDesc.mipLevels = 1
      textureDesc.initialData = HdGetValueData(fallbackValue)
      textureDesc.pixelsByteSize = HgiGetDataSize(fallbackFormat, textureDesc.dimensions)
      this._gpuTexture = hgi.createTexture(textureDesc)
    }

    this._addToTotalTextureMemory(this._gpuTexture)

    // Free CPU memory after transfer to GPU
    this._cpuData = null
  }

  /** textureObject.cpp:668-672 */
  isValid(): boolean {
    return this._valid
  }

  /** textureObject.cpp:674-678 */
  getTextureType(): HdStTextureType {
    return HdStTextureType.Field
  }

  /** textureObject.cpp:680-687 */
  getCommittedSize(): number {
    if (this._cpuData) {
      return this._cpuData.getTextureDesc().pixelsByteSize
    }
    return 0
  }
}
