// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderSettings.cpp,
//  pxr/imaging/hd/renderSettings.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/imaging/hd/renderSettings.{h,cpp}:
// HdRenderSettings, the Hydra render settings bprim, and its
// RenderProduct / RenderVar value types.
//
// - The nested C++ types HdRenderSettings::RenderProduct and
//   HdRenderSettings::RenderProduct::RenderVar are the classes
//   HdRenderSettingsRenderProduct and HdRenderSettingsRenderVar.
// - VtValue holds values by TfType here: a VtValue holding
//   HdRenderSettings::RenderProducts carries HdRenderSettingsRenderProductsType
//   and holds an array of HdRenderSettingsRenderProduct.
// - SdfPath members are path strings; TfToken members are tokens.
// - pixelAspectRatio, disableMotionBlur and disableDepthOfField are left
//   uninitialized by renderSettings.h:107-118; they start as 1, false and
//   false here, and aspectRatioConformPolicy as expandAperture (the UsdRender
//   fallbacks the scene index adapter reads).

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Range2f as GfRange2f, Vec2f as GfVec2f, Vec2i as GfVec2i } from 'typescript-usd/gf'
import { HdBprim } from './bprim.ts'
import { HdChangeTracker, type HdDirtyBits } from './changeTracker.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdRenderSettingsPrimTokens } from './tokens.ts'

/** renderSettings.h:69-75 HdRenderSettings::RenderProduct::RenderVar */
export class HdRenderSettingsRenderVar {
  varPath = ''
  dataType = '' as TfToken
  sourceName = ''
  sourceType = '' as TfToken
  namespacedSettings = new VtDictionary()

  /** The copy constructor. */
  Clone(): HdRenderSettingsRenderVar {
    const copy = new HdRenderSettingsRenderVar()
    copy.varPath = this.varPath
    copy.dataType = this.dataType
    copy.sourceName = this.sourceName
    copy.sourceType = this.sourceType
    copy.namespacedSettings = new VtDictionary(this.namespacedSettings)
    return copy
  }

  /** operator== (renderSettings.cpp:363-373). */
  equals(rhs: HdRenderSettingsRenderVar): boolean {
    return this.varPath === rhs.varPath
      && this.dataType === rhs.dataType
      && this.sourceName === rhs.sourceName
      && this.sourceType === rhs.sourceType
      && this.namespacedSettings.equals(rhs.namespacedSettings)
  }

  /** operator<< (renderSettings.cpp:353-361). */
  toString(): string {
    return `RenderVar \n    varPath : ${this.varPath}    namespacedSettings${String(this.namespacedSettings)}`
  }
}

/** renderSettings.h:67-119 HdRenderSettings::RenderProduct */
export class HdRenderSettingsRenderProduct {
  // Path to product prim in scene description.
  productPath = ''
  // The type of product, ex: "raster".
  type = '' as TfToken
  // The name of the product, which uniquely identifies it.
  name = '' as TfToken
  // The pixel resolution of the product.
  resolution = new GfVec2i(0)
  // The render vars that the product is comprised of.
  renderVars: HdRenderSettingsRenderVar[] = []
  // Path to the camera to use for this product.
  cameraPath = ''
  // The pixel aspect ratio as adjusted by aspectRatioConformPolicy.
  pixelAspectRatio = 1.0
  // The policy that was applied to conform aspect ratio mismatches between
  // the aperture and image.
  aspectRatioConformPolicy = 'expandAperture' as TfToken
  // The camera aperture size as adjusted by aspectRatioConformPolicy.
  apertureSize = new GfVec2f(0)
  // The data window, in NDC terms relative to the aperture.
  dataWindowNDC = new GfRange2f()
  disableMotionBlur = false
  disableDepthOfField = false
  namespacedSettings = new VtDictionary()

  /** The copy constructor. */
  Clone(): HdRenderSettingsRenderProduct {
    const copy = new HdRenderSettingsRenderProduct()
    copy.productPath = this.productPath
    copy.type = this.type
    copy.name = this.name
    copy.resolution = new GfVec2i(this.resolution)
    copy.renderVars = this.renderVars.map(v => v.Clone())
    copy.cameraPath = this.cameraPath
    copy.pixelAspectRatio = this.pixelAspectRatio
    copy.aspectRatioConformPolicy = this.aspectRatioConformPolicy
    copy.apertureSize = new GfVec2f(this.apertureSize)
    copy.dataWindowNDC = new GfRange2f(this.dataWindowNDC.getMin(), this.dataWindowNDC.getMax())
    copy.disableMotionBlur = this.disableMotionBlur
    copy.disableDepthOfField = this.disableDepthOfField
    copy.namespacedSettings = new VtDictionary(this.namespacedSettings)
    return copy
  }

  /** operator== (renderSettings.cpp:322-339). */
  equals(rhs: HdRenderSettingsRenderProduct): boolean {
    return this.productPath === rhs.productPath
      && this.type === rhs.type
      && this.name === rhs.name
      && this.resolution.equals(rhs.resolution)
      && this.renderVars.length === rhs.renderVars.length
      && this.renderVars.every((v, i) => v.equals(rhs.renderVars[i]!))
      && this.cameraPath === rhs.cameraPath
      && this.pixelAspectRatio === rhs.pixelAspectRatio
      && this.aspectRatioConformPolicy === rhs.aspectRatioConformPolicy
      && this.apertureSize.equals(rhs.apertureSize)
      && this.dataWindowNDC.equals(rhs.dataWindowNDC)
      && this.disableMotionBlur === rhs.disableMotionBlur
      && this.disableDepthOfField === rhs.disableDepthOfField
      && this.namespacedSettings.equals(rhs.namespacedSettings)
  }

  /** operator<< (renderSettings.cpp:303-320). */
  toString(): string {
    let out = 'RenderProduct: \n' +
      `    productPath : ${this.productPath}` +
      `    resolution : ${String(this.resolution)}` +
      `    namespacedSettings: ${String(this.namespacedSettings)}` +
      '    renderVars: \n'
    this.renderVars.forEach((rv, rvId) => { out += `        [${rvId}] ${rv.toString()}` })
    // XXX Fill other state as need be.
    return out
  }
}

/** renderSettings.h:120 HdRenderSettings::RenderProducts */
export type HdRenderSettingsRenderProducts = HdRenderSettingsRenderProduct[]

/** The TfType of a VtValue holding HdRenderSettings::RenderProducts. */
export const HdRenderSettingsRenderProductsType = TfType.define('HdRenderSettings::RenderProducts')

/** VtValue::IsHolding<HdRenderSettings::RenderProducts>. */
export function HdRenderSettingsIsHoldingRenderProducts(value: VtValue): boolean {
  if (!(value instanceof VtValue) || value.getType() !== HdRenderSettingsRenderProductsType) return false
  const held = value.UncheckedGet<unknown>()
  return Array.isArray(held) && held.every(p => p instanceof HdRenderSettingsRenderProduct)
}

/** renderSettings.h:38-62 HdRenderSettings::DirtyBits */
export const HdRenderSettingsDirtyBits = {
  Clean: 0,
  DirtyActive: 1 << 1,
  DirtyNamespacedSettings: 1 << 2,
  DirtyRenderProducts: 1 << 3,
  DirtyIncludedPurposes: 1 << 4,
  DirtyMaterialBindingPurposes: 1 << 5,
  DirtyRenderingColorSpace: 1 << 6,
  DirtyUnionedSamplingInterval: 1 << 7,
  DirtyFrameNumber: 1 << 8,
  DirtyCamera: 1 << 9,
  DirtyDisableDepthOfField: 1 << 10,
  DirtyDisableMotionBlur: 1 << 11,
  AllDirty: (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) |
    (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11),
} as const

// VtValue::IsHolding<VtArray<TfToken>>.
const _isTokenArray = (v: VtValue): boolean =>
  v.isArrayValued() && v.getElementType() === VtValueTypes.token

/** renderSettings.h:31-260 HdRenderSettings */
export class HdRenderSettings extends HdBprim {
  private _active = false
  private _dirtyProducts = false
  private _namespacedSettings = new VtDictionary()
  private _products: HdRenderSettingsRenderProducts = []
  private _includedPurposes = new VtArray<TfToken>([], VtValueTypes.token)
  private _materialBindingPurposes = new VtArray<TfToken>([], VtValueTypes.token)
  private _renderingColorSpace = '' as TfToken
  private _vUnionedSamplingInterval = VtValue.getEmpty()
  private _vCamera = VtValue.getEmpty()
  private _disableDepthOfField = false
  private _disableMotionBlur = false

  /** renderSettings.cpp:103-110 */
  constructor(id: string) {
    super(id)
  }

  /** renderSettings.cpp:62-101 */
  static stringifyDirtyBits(dirtyBits: HdDirtyBits): string {
    const B = HdRenderSettingsDirtyBits
    if (dirtyBits === B.Clean) return 'Clean'
    let ss = ''
    if (dirtyBits & B.DirtyActive) ss += 'Active '
    if (dirtyBits & B.DirtyNamespacedSettings) ss += 'DirtyNamespacedSettings '
    if (dirtyBits & B.DirtyRenderProducts) ss += 'DirtyRenderProducts '
    if (dirtyBits & B.DirtyIncludedPurposes) ss += 'DirtyIncludedPurposes '
    if (dirtyBits & B.DirtyMaterialBindingPurposes) ss += 'DirtyMaterialBindingPurposes '
    if (dirtyBits & B.DirtyRenderingColorSpace) ss += 'DirtyRenderingColorSpace '
    if (dirtyBits & B.DirtyUnionedSamplingInterval) ss += 'DirtyUnionedSamplingInterval '
    if (dirtyBits & B.DirtyFrameNumber) ss += 'DirtyFrameNumber '
    if (dirtyBits & B.DirtyCamera) ss += 'DirtyCamera '
    if (dirtyBits & B.DirtyDisableDepthOfField) ss += 'DirtyDisableDepthOfField '
    if (dirtyBits & B.DirtyDisableMotionBlur) ss += 'DirtyDisableMotionBlur '
    return ss + `(0x${(dirtyBits >>> 0).toString(16)})`
  }

  isActive(): boolean { return this._active }

  /** renderSettings.cpp:120-126: valid with at least one product whose
   *  camera path is set. */
  isValid(): boolean {
    return this._products.length > 0 && this._products[0]!.cameraPath !== ''
  }

  getNamespacedSettings(): VtDictionary { return this._namespacedSettings }
  getRenderProducts(): HdRenderSettingsRenderProducts { return this._products }
  getIncludedPurposes(): VtArray<TfToken> { return this._includedPurposes }
  getMaterialBindingPurposes(): VtArray<TfToken> { return this._materialBindingPurposes }
  getRenderingColorSpace(): TfToken { return this._renderingColorSpace }
  // XXX: Using VtValue in a std::optional (C++17) sense.
  getUnionedSamplingInterval(): VtValue { return this._vUnionedSamplingInterval }
  // XXX: Using VtValue in a std::optional (C++17) sense.
  getCamera(): VtValue { return this._vCamera }
  getDisableDepthOfField(): boolean { return this._disableDepthOfField }
  getDisableMotionBlur(): boolean { return this._disableMotionBlur }

  /** renderSettings.cpp:187-193 */
  getAndResetHasDirtyProducts(): boolean {
    const res = this._dirtyProducts
    this._dirtyProducts = false
    return res
  }

  /** renderSettings.cpp:195-288 */
  override sync(sceneDelegate: HdSceneDelegate, renderParam: HdRenderParam | null | undefined,
    dirtyBits: HdDirtyBitsRef): void
  override sync(...args: unknown[]): void {
    const sceneDelegate = args[0] as HdSceneDelegate
    const renderParam = args[1] as HdRenderParam | null | undefined
    const dirtyBits = args[2] as HdDirtyBitsRef
    const B = HdRenderSettingsDirtyBits
    const id = this.getId()
    const bits = dirtyBits.value

    if (bits & B.DirtyActive) {
      const val = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.active)
      if (val.IsHolding(VtValueTypes.bool)) {
        this._active = val.UncheckedGet<boolean>()
      }
    }

    if (bits & B.DirtyNamespacedSettings) {
      const vSettings = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.namespacedSettings)
      const held = vSettings.IsEmpty() ? undefined : vSettings.UncheckedGet<unknown>()
      if (held instanceof VtDictionary) {
        this._namespacedSettings = held
      }
    }

    if (bits & B.DirtyRenderProducts) {
      this._dirtyProducts = true
      const vProducts = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.renderProducts)
      if (HdRenderSettingsIsHoldingRenderProducts(vProducts)) {
        this._products = vProducts.UncheckedGet<HdRenderSettingsRenderProducts>()
      }
    }

    if (bits & B.DirtyIncludedPurposes) {
      const vPurposes = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.includedPurposes)
      if (_isTokenArray(vPurposes)) {
        this._includedPurposes = vPurposes.UncheckedGet<VtArray<TfToken>>()
      }
    }

    if (bits & B.DirtyMaterialBindingPurposes) {
      const vPurposes = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.materialBindingPurposes)
      if (_isTokenArray(vPurposes)) {
        this._materialBindingPurposes = vPurposes.UncheckedGet<VtArray<TfToken>>()
      }
    }

    if (bits & B.DirtyRenderingColorSpace) {
      const vColorSpace = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.renderingColorSpace)
      if (vColorSpace.IsHolding(VtValueTypes.token)) {
        this._renderingColorSpace = vColorSpace.UncheckedGet<TfToken>()
      }
    }

    if (bits & B.DirtyUnionedSamplingInterval) {
      this._vUnionedSamplingInterval = sceneDelegate.Get(
        id, HdRenderSettingsPrimTokens.unionedSamplingInterval)
    }

    if (bits & B.DirtyCamera) {
      this._vCamera = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.camera)
    }

    if (bits & B.DirtyDisableDepthOfField) {
      const v = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.disableDepthOfField)
      this._disableDepthOfField = v.IsHolding(VtValueTypes.bool) ? v.UncheckedGet<boolean>() : false
    }

    if (bits & B.DirtyDisableMotionBlur) {
      const v = sceneDelegate.Get(id, HdRenderSettingsPrimTokens.disableMotionBlur)
      this._disableMotionBlur = v.IsHolding(VtValueTypes.bool) ? v.UncheckedGet<boolean>() : false
    }

    // Allow subclasses to do any additional processing if necessary.
    this._sync(sceneDelegate, renderParam, dirtyBits)

    dirtyBits.value = HdChangeTracker.Clean
  }

  /** renderSettings.cpp:290-294 */
  getInitialDirtyBitsMask(): HdDirtyBits {
    return HdRenderSettingsDirtyBits.AllDirty
  }

  /** renderSettings.cpp:296-303: called during Sync after dirty processing
   *  and before clearing the dirty bits; a no-op here. */
  protected _sync(_sceneDelegate: HdSceneDelegate, _renderParam: HdRenderParam | null | undefined,
    _dirtyBits: HdDirtyBitsRef): void {
    // no-op
  }
}
