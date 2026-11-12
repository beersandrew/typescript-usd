// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/light.cpp,
//  pxr/imaging/hdSt/light.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/light.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - VtValue::IsHolding<T> for class-valued types (GlfSimpleLight,
//   SdfAssetPath, HdRprimCollection) is an instanceof test of the held value.
// - Light filter dependencies (light.cpp:401-424): HdChangeTracker's
//   Add/RemoveSprimSprimDependency are not ported in this repository's hd;
//   FAITHFULNESS-DEBT(hd-sprim-sprim-dependency): the filter paths are read
//   but no dependency is registered.
// - float arithmetic is rounded with Math.fround where the C++ computes in
//   float; the area computation keeps upstream's double intermediates
//   (M_PI, cos) before the float multiply.
// - TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import {
  Matrix4d as GfMatrix4d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
  GfClamp,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Type as TfType, type Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Light as HdLight,
  LightTokens as HdLightTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
} from 'typescript-usd/hd'
import { SimpleLight as GlfSimpleLight, SimpleLightType as GlfSimpleLightType } from 'typescript-usd/glf'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

const f = Math.fround

/** The TfType of a VtValue holding an HdRprimCollection. */
const _HdRprimCollectionType = TfType.declare('HdRprimCollection')

//  Lookup table from:
//  Colour Rendering of Spectra
//  by John Walker
//  https://www.fourmilab.ch/documents/specrend/specrend.c
//
//  Covers range from 1000k to 10000k in 500k steps
//  assuming Rec709 / sRGB colorspace chromaticity.
//
// NOTE: 6500K doesn't give a pure white because the D65
//       illuminant used by Rec. 709 doesn't lie on the
//       Planckian Locus. We would need to compute the
//       Correlated Colour Temperature (CCT) using Ohno's
//       method to get pure white. Maybe one day.
//
// Note that the beginning and ending knots are repeated to simplify
// boundary behavior.  The last 4 knots represent the segment starting
// at 1.0.
//
// (light.cpp:19-62)
const _blackbodyRGB: readonly [number, number, number][] = [
  [1.000000, 0.027490, 0.000000], //  1000 K (Approximation)
  [1.000000, 0.027490, 0.000000], //  1000 K (Approximation)
  [1.000000, 0.149664, 0.000000], //  1500 K (Approximation)
  [1.000000, 0.256644, 0.008095], //  2000 K
  [1.000000, 0.372033, 0.067450], //  2500 K
  [1.000000, 0.476725, 0.153601], //  3000 K
  [1.000000, 0.570376, 0.259196], //  3500 K
  [1.000000, 0.653480, 0.377155], //  4000 K
  [1.000000, 0.726878, 0.501606], //  4500 K
  [1.000000, 0.791543, 0.628050], //  5000 K
  [1.000000, 0.848462, 0.753228], //  5500 K
  [1.000000, 0.898581, 0.874905], //  6000 K
  [1.000000, 0.942771, 0.991642], //  6500 K
  [0.906947, 0.890456, 1.000000], //  7000 K
  [0.828247, 0.841838, 1.000000], //  7500 K
  [0.765791, 0.801896, 1.000000], //  8000 K
  [0.715255, 0.768579, 1.000000], //  8500 K
  [0.673683, 0.740423, 1.000000], //  9000 K
  [0.638992, 0.716359, 1.000000], //  9500 K
  [0.609681, 0.695588, 1.000000], // 10000 K
  [0.609681, 0.695588, 1.000000], // 10000 K
  [0.609681, 0.695588, 1.000000], // 10000 K
].map(([r, g, b]) => [f(r!), f(g!), f(b!)] as [number, number, number])

// Catmull-Rom basis (light.cpp:64-70)
const _basis = [
  [-0.5, 1.5, -1.5, 0.5],
  [1.0, -2.5, 2.0, -0.5],
  [-0.5, 0.0, 0.5, 0.0],
  [0.0, 1.0, 0.0, 0.0],
]

/** light.cpp:72-75 */
function _Rec709RgbToLuma(rgb: [number, number, number]): number {
  return f(f(f(rgb[0] * f(0.2126)) + f(rgb[1] * f(0.7152))) + f(rgb[2] * f(0.0722)))
}

/** light.cpp:77-110 */
export function _BlackbodyTemperatureAsRgb(temp: number): GfVec3f {
  // Catmull-Rom interpolation of _blackbodyRGB
  const numKnots = _blackbodyRGB.length
  // Parametric distance along spline
  const u_spline = f(GfClamp(f(f(temp - 1000.0) / 9000.0), 0.0, 1.0))
  // Last 4 knots represent a trailing segment starting at u_spline==1.0,
  // to simplify boundary behavior
  const numSegs = (numKnots - 4)
  const x = f(u_spline * numSegs)
  const seg = Math.floor(x)
  const u_seg = f(x - seg) // Parameter within segment
  // Knot values for this segment
  const k = [0, 1, 2, 3].map(i => _blackbodyRGB[seg + i]!)
  // Compute cubic coefficients.  Could fold constants (zero, one) here
  // if speed is a concern.
  const coeff = (row: number[]): [number, number, number] => {
    const out: [number, number, number] = [0, 0, 0]
    for (let c = 0; c < 3; c++) {
      // GfVec3f a = b0*k0 + b1*k1 + b2*k2 + b3*k3, each product and sum in float
      let acc = f(f(row[0]!) * k[0]![c]!)
      for (let i = 1; i < 4; i++) acc = f(acc + f(f(row[i]!) * k[i]![c]!))
      out[c] = acc
    }
    return out
  }
  const a = coeff(_basis[0]!)
  const b = coeff(_basis[1]!)
  const c = coeff(_basis[2]!)
  const d = coeff(_basis[3]!)
  // Eval cubic polynomial.
  const rgb: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    rgb[i] = f(f(f(f(f(f(a[i]! * u_seg) + b[i]!) * u_seg) + c[i]!) * u_seg) + d[i]!)
  }
  // Normalize to the same luminance as (1,1,1)
  const luma = _Rec709RgbToLuma(rgb)
  for (let i = 0; i < 3; i++) rgb[i] = f(rgb[i]! / luma)
  // Clamp at zero, since the spline can produce small negative values,
  // e.g. in the blue component at 1300k.
  rgb[0] = Math.max(rgb[0], 0)
  rgb[1] = Math.max(rgb[1], 0)
  rgb[2] = Math.max(rgb[2], 0)
  return new GfVec3f(rgb[0], rgb[1], rgb[2])
}

function _scale4(s: number, c: GfVec4f): GfVec4f {
  return new GfVec4f(f(s * c.get(0)), f(s * c.get(1)), f(s * c.get(2)), f(s * c.get(3)))
}

function _float(v: VtValue): number {
  return v.Get<number>()
}

function _floatOr(v: VtValue, def: number): number {
  return v.IsHolding(VtValueTypes.float) ? v.UncheckedGet<number>() : def
}

function _boolOr(v: VtValue, def: boolean): boolean {
  return v.IsHolding(VtValueTypes.bool) ? v.UncheckedGet<boolean>() : def
}

/** light.cpp:328-334 */
function _ScaleColor(color: GfVec4f): GfVec4f {
  return new GfVec4f(f(Math.PI * color.get(0)), f(Math.PI * color.get(1)),
    f(Math.PI * color.get(2)), 1.0)
}

/** light.h:24-79. A light model for use in Storm. */
export class HdStLight extends HdLight {
  // Stores the internal light type of this light.
  private readonly _lightType: TfToken

  // Cached states.
  private readonly _params = new Map<string, VtValue>()

  /** light.cpp:112-116 */
  constructor(id: string, lightType: TfToken) {
    super(id)
    this._lightType = lightType
  }

  /** light.cpp:120-255 */
  private _approximateAreaLight(id: string, sceneDelegate: HdSceneDelegate): GlfSimpleLight {
    if (!sceneDelegate.getVisible(id)) {
      const l = new GlfSimpleLight()
      l.setAmbient(new GfVec4f(0.0, 0.0, 0.0, 0.0))
      l.setDiffuse(new GfVec4f(0.0, 0.0, 0.0, 0.0))
      l.setSpecular(new GfVec4f(0.0, 0.0, 0.0, 0.0))
      l.setHasIntensity(false)
      return l
    }

    // Get the color of the light
    let hdc = sceneDelegate.getLightParamValue(id, HdLightTokens.color).Get<GfVec3f>()

    // Color temperature
    const enableColorTemperatureVal = sceneDelegate.getLightParamValue(id,
      HdLightTokens.enableColorTemperature)
    if (_boolOr(enableColorTemperatureVal, false)) {
      const colorTemperatureVal = sceneDelegate.getLightParamValue(id,
        HdLightTokens.colorTemperature)
      if (colorTemperatureVal.IsHolding(VtValueTypes.float)) {
        const colorTemperature = colorTemperatureVal.Get<number>()
        const bb = _BlackbodyTemperatureAsRgb(colorTemperature)
        hdc = new GfVec3f(f(hdc.get(0) * bb.get(0)), f(hdc.get(1) * bb.get(1)), f(hdc.get(2) * bb.get(2)))
      }
    }

    // Intensity
    let intensity = _float(sceneDelegate.getLightParamValue(id, HdLightTokens.intensity))

    // Exposure
    const exposure = _float(sceneDelegate.getLightParamValue(id, HdLightTokens.exposure))
    intensity = f(intensity * f(Math.pow(2.0, GfClamp(exposure, -50.0, 50.0))))

    // Dimensions
    // (If we are normalizing for area, there's nothing to do here, since
    // we are already approximating the light as an area-less point source)
    const normalizeVal = sceneDelegate.getLightParamValue(id, HdLightTokens.normalize)
    if (!_boolOr(normalizeVal, false)) {
      // Compute area of the maximum possible facing profile.
      let area = 1.0
      if (this._lightType === HdPrimTypeTokens.diskLight ||
        this._lightType === HdPrimTypeTokens.sphereLight) {
        const radiusVal = sceneDelegate.getLightParamValue(id, HdLightTokens.radius)
        if (radiusVal.IsHolding(VtValueTypes.float)) {
          const radius = radiusVal.Get<number>()
          area = f(f(radius * radius) * Math.PI)
        }
      } else if (this._lightType === HdPrimTypeTokens.rectLight) {
        const widthVal = sceneDelegate.getLightParamValue(id, HdLightTokens.width)
        if (widthVal.IsHolding(VtValueTypes.float)) {
          area = f(area * widthVal.Get<number>())
        }
        const heightVal = sceneDelegate.getLightParamValue(id, HdLightTokens.height)
        if (heightVal.IsHolding(VtValueTypes.float)) {
          area = f(area * heightVal.Get<number>())
        }
      } else if (this._lightType === HdPrimTypeTokens.cylinderLight) {
        const lengthVal = sceneDelegate.getLightParamValue(id, HdLightTokens.length)
        if (lengthVal.IsHolding(VtValueTypes.float)) {
          area = f(area * lengthVal.Get<number>())
        }
        const radiusVal = sceneDelegate.getLightParamValue(id, HdLightTokens.radius)
        if (radiusVal.IsHolding(VtValueTypes.float)) {
          const radius = radiusVal.Get<number>()
          area = f(area * radius)
        }
      } else if (this._lightType === HdPrimTypeTokens.distantLight) {
        const angleDegVal = sceneDelegate.getLightParamValue(id, HdLightTokens.angle)
        if (angleDegVal.IsHolding(VtValueTypes.float)) {
          // Convert from cone apex angle to solid angle
          const angleRadians = f(angleDegVal.Get<number>() / 180.0 * Math.PI)
          const solidAngleSteradians = f(2 * Math.PI * (1.0 - Math.cos(angleRadians / 2.0)))
          area = solidAngleSteradians
        }
      }
      intensity = f(intensity * area)
    }

    // Calculate the final color of the light
    const c = new GfVec4f(f(hdc.get(0) * intensity), f(hdc.get(1) * intensity),
      f(hdc.get(2) * intensity), 1.0)

    // Ambient, Diffuse & Specular multipliers
    const ambientMultiplier =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.ambient), 0.0)
    const diffuseMultiplier =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.diffuse), 1.0)
    const specularMultiplier =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.specular), 1.0)

    // Directional emission shaping
    const shapingConeAngle =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.shapingConeAngle), 90.0)
    const shapingFocus =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.shapingFocus), 0.0)

    // Create the Glf Simple Light object that will be used by the rest
    // of the pipeline.
    const l = new GlfSimpleLight()
    l.setHasIntensity(intensity !== 0.0)
    l.setAmbient(_scale4(ambientMultiplier, c))
    l.setDiffuse(_scale4(diffuseMultiplier, c))
    l.setSpecular(_scale4(specularMultiplier, c))
    l.setHasShadow(
      _boolOr(sceneDelegate.getLightParamValue(id, HdLightTokens.hasShadow), false))

    if (this._lightType === HdPrimTypeTokens.rectLight ||
      this._lightType === HdPrimTypeTokens.diskLight) {
      l.setSpotCutoff(shapingConeAngle)
      l.setSpotFalloff(Math.max(0.0, shapingFocus))
    }

    // See glf/shaders/simpleLighting.glslfx for attenuation math
    if (this._lightType === HdPrimTypeTokens.distantLight) {
      l.setAttenuation(new GfVec3f(0.0, 0.0, 0.0)) // none
    } else {
      l.setAttenuation(new GfVec3f(0.0, 0.0, 1.0)) // distance^-2
    }

    return l
  }

  /** light.cpp:257-326 */
  private _prepareDomeLight(id: string, sceneDelegate: HdSceneDelegate): GlfSimpleLight {
    // Create the Glf Simple Light object that will be used by the rest
    // of the pipeline. No support for shadows for dome light.
    const l = new GlfSimpleLight()
    l.setHasShadow(false)
    l.setIsDomeLight(true)
    l.setAttenuation(new GfVec3f(0.0, 0.0, 0.0))

    // The intensity value is set to 0 if light is not visible
    if (!sceneDelegate.getVisible(id) ||
      (_float(sceneDelegate.getLightParamValue(id, HdLightTokens.intensity)) === 0.0)) {
      l.setHasIntensity(false)
      return l
    }

    // Get the color of the light
    let hdc = sceneDelegate.getLightParamValue(id, HdLightTokens.color).Get<GfVec3f>()

    // Color temperature
    const enableColorTemperatureVal =
      sceneDelegate.getLightParamValue(id, HdLightTokens.enableColorTemperature)
    if (_boolOr(enableColorTemperatureVal, false)) {
      const colorTemperatureVal =
        sceneDelegate.getLightParamValue(id, HdLightTokens.colorTemperature)
      if (colorTemperatureVal.IsHolding(VtValueTypes.float)) {
        const colorTemperature = colorTemperatureVal.Get<number>()
        const bb = _BlackbodyTemperatureAsRgb(colorTemperature)
        hdc = new GfVec3f(f(hdc.get(0) * bb.get(0)), f(hdc.get(1) * bb.get(1)), f(hdc.get(2) * bb.get(2)))
      }
    }

    // Intensity
    let intensity = _float(sceneDelegate.getLightParamValue(id, HdLightTokens.intensity))

    // Exposure
    const exposure = _float(sceneDelegate.getLightParamValue(id, HdLightTokens.exposure))
    intensity = f(intensity * f(Math.pow(2.0, GfClamp(exposure, -50.0, 50.0))))

    // Calculate the final color of the light
    const c = new GfVec4f(f(hdc.get(0) * intensity), f(hdc.get(1) * intensity),
      f(hdc.get(2) * intensity), 1.0)

    // Diffuse & Specular multiplier
    const diffuseMultiplier =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.diffuse), 1.0)
    const specularMultiplier =
      _floatOr(sceneDelegate.getLightParamValue(id, HdLightTokens.specular), 1.0)

    l.setHasIntensity(intensity !== 0.0)
    l.setDiffuse(_scale4(diffuseMultiplier, c))
    l.setSpecular(_scale4(specularMultiplier, c))

    // Dome light texture
    {
      const v = sceneDelegate.getLightParamValue(id, HdLightTokens.textureFile)
      if (!v.IsEmpty()) {
        const held = v.Get<unknown>()
        if (held instanceof SdfAssetPath) {
          l.setDomeLightTextureFile(held)
        } else {
          TF_CODING_ERROR('Dome light texture file not an asset path.')
        }
      }
    }
    return l
  }

  /** light.cpp:336-355 */
  private _prepareSimpleLight(id: string, sceneDelegate: HdSceneDelegate): GlfSimpleLight {
    const v = sceneDelegate.Get(id, HdLightTokens.params)
    const held = v.IsEmpty() ? undefined : v.Get<unknown>()
    if (!TF_VERIFY(held instanceof GlfSimpleLight)) {
      return new GlfSimpleLight()
    }

    // We assume that the color specified for these "simple" lights means that
    // it is the expected color a white Lambertian surface would have if one of
    // these colored "simple" lights was pointed directly at it.  To achieve
    // this, the light color needs to be scaled appropriately.
    const l = (held as GlfSimpleLight).Clone()
    l.setDiffuse(_ScaleColor(l.getDiffuse()))
    l.setSpecular(_ScaleColor(l.getSpecular()))

    return l
  }

  private _getLight(): GlfSimpleLight {
    const v = this.Get(HdLightTokens.params)
    const held = v.IsEmpty() ? undefined : v.Get<unknown>()
    return held instanceof GlfSimpleLight ? held.Clone() : new GlfSimpleLight()
  }

  private _setLight(light: GlfSimpleLight): void {
    this._params.set(HdLightTokens.params, VtValue.create(light, GlfSimpleLightType))
  }

  /** light.cpp:357-482. Synchronizes state from the delegate to this
   *  object. */
  override sync(
    sceneDelegateOrPrim: unknown,
    _renderParam: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void {
    const sceneDelegate = sceneDelegateOrPrim as HdSceneDelegate
    if (!TF_VERIFY(sceneDelegate !== null && dirtyBits !== undefined)) {
      return
    }

    const id = this.getId()

    // HdStLight communicates to the scene graph and caches all interesting
    // values within this class. Later on Get() is called from
    // TaskState (RenderPass) to perform aggregation/pre-computation,
    // in order to make the shader execution efficient.

    // Change tracking
    const bits = dirtyBits!.value

    // Transform
    if (bits & HdLight.DirtyTransform) {
      this._params.set(HdTokens.transform,
        VtValue.create(sceneDelegate.getTransform(id), VtValueTypes.GfMatrix4d))
    }

    // Lighting Params
    if (bits & HdLight.DirtyParams) {
      // Remove old dependencies: FAITHFULNESS-DEBT(hd-sprim-sprim-dependency).

      if (this._lightType === HdPrimTypeTokens.simpleLight) {
        this._setLight(this._prepareSimpleLight(id, sceneDelegate))
      } else if (this._lightType === HdPrimTypeTokens.domeLight) {
        this._setLight(this._prepareDomeLight(id, sceneDelegate))
      } else {
        // If it is an area light we will extract the parameters and convert
        // them to a GlfSimpleLight that approximates the light source.
        this._setLight(this._approximateAreaLight(id, sceneDelegate))
      }

      // Add new dependencies: FAITHFULNESS-DEBT(hd-sprim-sprim-dependency).
    }

    if (bits & (HdLight.DirtyTransform | HdLight.DirtyParams)) {
      const tv = this.Get(HdTokens.transform)
      let transform = tv.IsHolding(VtValueTypes.GfMatrix4d)
        ? tv.UncheckedGet<GfMatrix4d>() : new GfMatrix4d(1)
      // Update cached light objects.  Note that simpleLight ignores
      // scene-delegate transform, in favor of the transform passed in by
      // params...
      if (this._lightType === HdPrimTypeTokens.domeLight) {
        // Apply domeOffset if present
        const domeOffset = sceneDelegate.getLightParamValue(id, HdLightTokens.domeOffset)
        if (domeOffset.IsHolding(VtValueTypes.GfMatrix4d)) {
          transform = domeOffset.UncheckedGet<GfMatrix4d>().getMultiply(transform)
        }
        const light = this._getLight()
        light.setTransform(transform)
        this._setLight(light)
      } else if (this._lightType !== HdPrimTypeTokens.simpleLight) {
        // e.g. area light
        const light = this._getLight()
        const p = transform.extractTranslation()
        let pos = new GfVec4f(p.get(0), p.get(1), p.get(2), 1.0)
        // Convention is to emit light along -Z
        const zDir = transform.getRow(2)
        if (this._lightType === HdPrimTypeTokens.rectLight ||
          this._lightType === HdPrimTypeTokens.diskLight) {
          light.setSpotDirection(new GfVec3f(-zDir.get(0), -zDir.get(1), -zDir.get(2)))
        } else if (this._lightType === HdPrimTypeTokens.distantLight) {
          // For a distant light, translate to +Z homogeneous limit
          // See simpleLighting.glslfx : integrateLightsDefault.
          pos = new GfVec4f(zDir.get(0), zDir.get(1), zDir.get(2), 0.0)
        }
        light.setPosition(pos)
        this._setLight(light)
      }
    }

    // Shadow Params
    if (bits & HdLight.DirtyShadowParams) {
      this._params.set(HdLightTokens.shadowParams,
        sceneDelegate.getLightParamValue(id, HdLightTokens.shadowParams))
    }

    // Shadow Collection
    if (bits & HdLight.DirtyCollection) {
      const vtShadowCollection =
        sceneDelegate.getLightParamValue(id, HdLightTokens.shadowCollection)

      // Optional
      const held = vtShadowCollection.IsEmpty() ? undefined : vtShadowCollection.Get<unknown>()
      if (held instanceof HdRprimCollection) {
        const newCollection = held
        const old = this.Get(HdLightTokens.shadowCollection)
        const oldCollection = old.IsEmpty() ? undefined : old.Get<unknown>()

        if (!(oldCollection instanceof HdRprimCollection) || !oldCollection.Equals(newCollection)) {
          this._params.set(HdLightTokens.shadowCollection, vtShadowCollection)

          const changeTracker = sceneDelegate.getRenderIndex().getChangeTracker()

          changeTracker.markCollectionDirty(newCollection.getName())
        }
      } else {
        this._params.set(HdLightTokens.shadowCollection,
          VtValue.create(new HdRprimCollection(), _HdRprimCollectionType))
      }
    }

    dirtyBits!.value = HdLight.Clean
  }

  /** light.cpp:484-490. HdStLight doesn't own resources directly, so we
   *  don't need to flag garbage collection. */
  finalize(_renderParam: HdRenderParam | null): void {}

  /** light.cpp:492-498. Accessor for tasks to get the parameters cached in
   *  this object. */
  Get(token: TfToken | string): VtValue {
    return this._params.get(token) ?? VtValue.getEmpty()
  }

  /** light.cpp:500-514 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    // In the case of simple and distant lights we want to sync all dirty bits,
    // but for area lights coming from the scenegraph we just want to extract
    // the Transform and Params for now.
    if (this._lightType === HdPrimTypeTokens.simpleLight ||
      this._lightType === HdPrimTypeTokens.distantLight) {
      return HdLight.AllDirty
    } else {
      return (HdLight.DirtyParams | HdLight.DirtyTransform)
    }
  }
}

