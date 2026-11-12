// Ported from OpenUSD 26.11.1: pxr/usd/usd/interpolators.cpp,
//  pxr/usd/usd/interpolators.h, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/interpolators.h (Usd_HeldInterpolator /
// Usd_LinearInterpolator) + the bracketing-sample walk of stage.cpp's
// _GetValueFromResolveInfoImpl, over sorted [time, value][] samples.

import {
  _usdInterpolationIsHeld, _usdTypeSupportsLinearInterpolation,
  type UsdInterpolation,
} from './interpolation.ts'

import {
  ValueBlock as SdfValueBlock, sdfLayerOffsetApply, sdfLayerOffsetInverse,
  LayerOffset as SdfLayerOffset,
} from 'typescript-usd/sdf'
import { _sdfIsGfValue } from 'typescript-usd/sdf/_internal'
import { Array as VtArray } from 'typescript-usd/vt'
import { Duration as GfDuration, _halfBitsToFloat, _floatToHalfBits } from 'typescript-usd/gf'
import { Spline as TsSpline, Ts_SplineOffsetAccess } from 'typescript-usd/ts'

// UsdStage_ResolveInfoAccess::_GetSplineValue maps a stage query into the
// source layer before evaluation, then maps time-valued results back through
// the same layer offset (pxr/usd/usd/stage.cpp:7432-7459).
export function usdEvaluateSpline(
  spline: TsSpline | undefined,
  stageTime: number,
  isPreTime: boolean,
  layerToStageOffset: SdfLayerOffset = { offset: 0, scale: 1 },
): number | GfDuration | undefined {
  if (!spline) return undefined
  const stageToLayer = sdfLayerOffsetInverse(layerToStageOffset)
  if (!stageToLayer) return undefined
  const localTime = sdfLayerOffsetApply(stageToLayer, stageTime)
  const value = usdSplineResultOfValueType(
    spline, isPreTime ? spline.evalPreValue(localTime) : spline.eval(localTime))
  // stage.cpp:691-708: durations are relative, time codes are absolute.
  if (value !== undefined && spline.GetValueTypeName() === 'duration') return new GfDuration(value * layerToStageOffset.scale)
  return value !== undefined && spline.isTimeValued()
    ? sdfLayerOffsetApply(layerToStageOffset, value) : value
}

/**
 * A spline evaluation as the spline's value type holds it: Usd_QuerySpline
 * evaluates through TsSpline::Eval<S> for the spline's value type S
 * (valueUtils.cpp:20-96), so float and half splines yield float and half
 * values.
 */
export function usdSplineResultOfValueType(
  spline: TsSpline, value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined
  const typeName = spline.GetValueTypeName()
  if (typeName === 'float') return Math.fround(value)
  if (typeName === 'half') return roundHalf(value)
  return value
}

// Sdf's registered TsSpline layer-offset transform delegates to
// Ts_SplineOffsetAccess::ApplyOffsetAndScale (pxr/base/ts/splineData.h:599-690).
// Keep this private to Usd query consumers: the native access class is private.
export function usdTransformSpline(
  source: TsSpline | undefined,
  layerToStageOffset: SdfLayerOffset = { offset: 0, scale: 1 },
): TsSpline | undefined {
  if (!source) return undefined
  // stage.cpp:667-680 delegates the full transform to the Ts access class.
  // Keep knot slopes, loop boundaries and intrinsic Duration typing together.
  const result = source.clone()
  if (layerToStageOffset.offset !== 0 || layerToStageOffset.scale !== 1) {
    Ts_SplineOffsetAccess.applyOffsetAndScale(result, layerToStageOffset.offset, layerToStageOffset.scale)
  }
  return result
}

// Lerp numeric arrays, recursing one level for vec arrays (number[][]).
// Returns null when the contents aren't interpolatable.
export function usdLerpArrays(a: unknown[], b: unknown[], alpha: number): unknown[] | null {
  const out = new Array(a.length)
  for (let i = 0; i < a.length; i++) {
    const av = a[i], bv = b[i]
    if (typeof av === 'number' && typeof bv === 'number') {
      out[i] = av + (bv - av) * alpha
    } else if (av instanceof GfDuration && bv instanceof GfDuration) {
      out[i] = new GfDuration(av.GetValue() + (bv.GetValue() - av.GetValue()) * alpha)
    } else if (Array.isArray(av) && Array.isArray(bv) && av.length === bv.length) {
      const inner = usdLerpArrays(av, bv, alpha)
      if (inner === null) return null
      out[i] = inner
    } else {
      return null
    }
  }
  return out
}

function roundHalf(value: number): number {
  const view = new DataView(new ArrayBuffer(4))
  view.setFloat32(0, Math.fround(value))
  const bits = view.getUint32(0)
  const sign = (bits >>> 16) & 0x8000
  const exponent = (bits >>> 23) & 0xff
  const mantissa = bits & 0x7fffff
  let half: number
  if (exponent === 0xff) {
    half = sign | 0x7c00 | (mantissa ? 0x200 : 0)
  } else {
    const e = exponent - 127 + 15
    if (e >= 0x1f) half = sign | 0x7c00
    else if (e <= 0) {
      if (e < -10) half = sign
      else {
        const m = mantissa | 0x800000
        const shift = 14 - e
        let rounded = m >>> shift
        const remainder = m & ((1 << shift) - 1)
        const halfway = 1 << (shift - 1)
        if (remainder > halfway || remainder === halfway && (rounded & 1)) rounded++
        half = sign | rounded
      }
    } else {
      let rounded = (e << 10) | (mantissa >>> 13)
      const remainder = mantissa & 0x1fff
      if (remainder > 0x1000 || remainder === 0x1000 && (rounded & 1)) rounded++
      half = sign | rounded
    }
  }
  const hExponent = (half >>> 10) & 0x1f
  const hMantissa = half & 0x3ff
  const hSign = half & 0x8000 ? -1 : 1
  if (hExponent === 0) return hSign * 2 ** -14 * (hMantissa / 1024)
  if (hExponent === 0x1f) return hMantissa ? NaN : hSign * Infinity
  return hSign * 2 ** (hExponent - 15) * (1 + hMantissa / 1024)
}

function roundValueForType(value: unknown, typeName: string | undefined): unknown {
  if (!typeName) return value
  const scalar = typeName.replace(/\[\]$/, '')
  const precision = scalar === 'half' || scalar === 'quath' ||
    /^(?:color|point|normal|vector|texCoord)[234]h$/.test(scalar)
    ? roundHalf
    : scalar === 'float' || scalar === 'quatf' ||
      /^(?:color|point|normal|vector|texCoord)[234]f$/.test(scalar)
      ? Math.fround : undefined
  if (!precision) return value
  if (typeof value === 'number') return precision(value)
  if (Array.isArray(value)) return value.map(item => roundValueForType(item, typeName))
  return value
}

// pxr/base/gf/quat*.cpp GfSlerp, including the storage precision of the
// registered GfQuat{d,f,h} value type.
function slerpQuaternion(
  lower: unknown, upper: unknown, alpha: number, typeName: string,
): unknown[] | null {
  if (!Array.isArray(lower) || !Array.isArray(upper) ||
      lower.length !== 4 || upper.length !== 4 ||
      !lower.every(value => typeof value === 'number') ||
      !upper.every(value => typeof value === 'number')) return null
  const out: number[] = [0, 0, 0, 0]
  slerpComponents(lower as number[], upper as number[], alpha, typeName, out)
  return out
}

// The GfSlerp body over real-first components, written into `out`.
function slerpComponents(
  q0: ArrayLike<number>, q1: ArrayLike<number>, alpha: number, typeName: string, out: number[],
): void {
  let cosTheta = 0
  for (let index = 0; index < 4; index++) cosTheta += q0[index]! * q1[index]!
  let flipUpper = false
  if (cosTheta < 0) {
    cosTheta = -cosTheta
    flipUpper = true
  }
  const precision = typeName === 'quath' ? roundHalf :
    typeName === 'quatf' ? Math.fround : (value: number): number => value
  let scale0: number, scale1: number
  if (1 - cosTheta > 0.00001) {
    const theta = typeName === 'quath' ? roundHalf(Math.acos(cosTheta)) : Math.acos(cosTheta)
    const sinTheta = typeName === 'quath' ? roundHalf(Math.sin(theta)) : Math.sin(theta)
    scale0 = Math.sin((1 - alpha) * theta) / sinTheta
    scale1 = Math.sin(alpha * theta) / sinTheta
  } else {
    scale0 = 1 - alpha
    scale1 = alpha
  }
  if (flipUpper) scale1 = -scale1
  for (let index = 0; index < 4; index++) {
    out[index] = precision(precision(q0[index]! * scale0) + precision(q1[index]! * scale1))
  }
}

// GfSlerp per element of two quaternion arrays of one element type, over
// their storage (imaginary then real per element, VtArray's GfQuat layout),
// as upstream's array interpolation loops over the arrays' data
// (interpolators.cpp:76-104). The elements are those slerpQuat computes from
// the elements read as GfQuat values, already at the type's precision, so
// storing them is exact.
function slerpQuatArray(
  lower: VtArray<unknown>, upper: VtArray<unknown>, alpha: number, scalarType: string,
): VtArray<unknown> | null {
  if (lower.getElementType() !== upper.getElementType()) return null
  const a = lower.cdata(), b = upper.cdata()
  if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor) return null
  const half = a instanceof Uint16Array
  const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>
  const out = new (a.constructor as new (n: number) => Float32Array)(a.length)
  const dec = (v: number): number => half ? _halfBitsToFloat(v) : v
  const q0 = [0, 0, 0, 0], q1 = [0, 0, 0, 0], result = [0, 0, 0, 0]
  for (let o = 0; o < out.length; o += 4) {
    q0[0] = dec(x[o + 3]!); q0[1] = dec(x[o]!); q0[2] = dec(x[o + 1]!); q0[3] = dec(x[o + 2]!)
    q1[0] = dec(y[o + 3]!); q1[1] = dec(y[o]!); q1[2] = dec(y[o + 1]!); q1[3] = dec(y[o + 2]!)
    slerpComponents(q0, q1, alpha, scalarType, result)
    if (half) {
      out[o] = _floatToHalfBits(result[1]!); out[o + 1] = _floatToHalfBits(result[2]!)
      out[o + 2] = _floatToHalfBits(result[3]!); out[o + 3] = _floatToHalfBits(result[0]!)
    } else {
      out[o] = result[1]!; out[o + 1] = result[2]!; out[o + 2] = result[3]!; out[o + 3] = result[0]!
    }
  }
  return VtArray._adopt(lower.getElementType(), out as never)
}

type GfQuatValue = { GetReal(): number, GetImaginary(): { readonly data: readonly number[] } }
const quatComponents = (q: unknown): unknown =>
  _sdfIsGfValue(q) && 'GetReal' in q
    ? [(q as GfQuatValue).GetReal(), ...(q as GfQuatValue).GetImaginary().data] : q

// GfSlerp of two GfQuat values (or real-first component lists), as a value
// of the lower value's type.
function slerpQuat(lower: unknown, upper: unknown, alpha: number, scalarType: string): unknown {
  const slerped = slerpQuaternion(quatComponents(lower), quatComponents(upper), alpha, scalarType)
  if (slerped === null) return null
  if (!_sdfIsGfValue(lower)) return slerped
  const Ctor = lower.constructor as new (...c: number[]) => unknown
  return new Ctor(...(slerped as number[]))
}

function slerpQuaternionValue(
  lower: unknown, upper: unknown, alpha: number, typeName: string,
): unknown {
  const scalarType = typeName.endsWith('[]') ? typeName.slice(0, -2) : typeName
  if (!scalarType.startsWith('quat')) return null
  if (!typeName.endsWith('[]')) return slerpQuat(lower, upper, alpha, scalarType)
  if (lower instanceof VtArray && upper instanceof VtArray) {
    if (lower.size !== upper.size) return null
    const typed = slerpQuatArray(lower, upper, alpha, scalarType)
    if (typed !== null) return typed
    const result = new VtArray<unknown>([], lower.getElementType())
    for (let i = 0; i < lower.size; i++) {
      const value = slerpQuat(lower.get(i), upper.get(i), alpha, scalarType)
      if (value === null) return null
      result.push_back(value)
    }
    return result
  }
  if (!Array.isArray(lower) || !Array.isArray(upper) || lower.length !== upper.length) return null
  const result: unknown[] = []
  for (let i = 0; i < lower.length; i++) {
    const value = slerpQuaternion(lower[i], upper[i], alpha, scalarType)
    if (value === null) return null
    result.push(value)
  }
  return result
}

// Usd_LinearInterpolator for Gf vectors and matrices (component-wise lerp,
// stored at the value type's precision) and numeric VtArrays of equal size
// (element-wise; arrays of different sizes hold, interpolators.h:139-150).
function lerpTyped(v0: unknown, v1: unknown, alpha: number): unknown {
  // interpolation.h:40-61 registers Duration and VtArray<Duration>.
  if (v0 instanceof GfDuration && v1 instanceof GfDuration) return new GfDuration(v0.GetValue() + (v1.GetValue() - v0.GetValue()) * alpha)
  if (v0 instanceof VtArray && v1 instanceof VtArray) {
    if (v0.size !== v1.size || v0.getElementType() !== v1.getElementType()) return null
    const a = v0.cdata(), b = v1.cdata()
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) {
      // Numeric elements held in plain storage (SdfTimeCode).
      const lo = a as readonly unknown[], hi = b as readonly unknown[]
      const values = usdLerpArrays([...lo], [...hi], alpha)
      return values === null ? null : new VtArray(values, v0.getElementType())
    }
    const half = a instanceof Uint16Array
    const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>
    const out = new (a.constructor as new (n: number) => Float32Array)(a.length)
    for (let i = 0; i < out.length; i++) {
      if (half) {
        const lo = _halfBitsToFloat(x[i]!), hi = _halfBitsToFloat(y[i]!)
        out[i] = _floatToHalfBits(lo + (hi - lo) * alpha)
      } else {
        out[i] = x[i]! + (y[i]! - x[i]!) * alpha
      }
    }
    return VtArray.fromBuffer(v0.getElementType(), out as never)
  }
  if (_sdfIsGfValue(v0) && _sdfIsGfValue(v1) && v0.constructor === v1.constructor && !('GetReal' in v0)) {
    const comps = (v: unknown) => 'GetArray' in (v as object)
      ? (v as { GetArray(): readonly number[] }).GetArray() : (v as { data: readonly number[] }).data
    const a = comps(v0), b = comps(v1)
    const Ctor = v0.constructor as new (...c: number[]) => unknown
    return new Ctor(...a.map((value, i) => value + (b[i]! - value) * alpha))
  }
  return null
}

// Sorted samples read by index: the authored samples of one attribute in
// increasing time order. valueAt may produce the value on demand (a stage-side
// conversion of the layer's value); it is called at most once per index for
// one interpolation.
export interface UsdSampleAccess {
  readonly length: number
  timeAt(i: number): number
  valueAt(i: number): unknown
}

// Interpolate a time query against authored samples: clamp outside the
// sample range, bracket by binary search, then hold or lerp. Non-numeric,
// non-array values hold (Usd_HeldInterpolator is the fallback for types
// linear interpolation doesn't support).
// A held or exact result is the authored sample itself, which the samples
// may share with layer storage; it is returned as a copy, as upstream fetches
// interpolating samples by value through QueryTimeSample
// (interpolators.cpp:160-188, sdf/data.cpp:446-459).
export function usdInterpolateSamples(
  samples: readonly [number, unknown][],
  time: number,
  interpolation?: UsdInterpolation,
  isPreTime = false,
  typeName?: string,
): unknown {
  // No samples to bracket: the layer query fails and no value results, as
  // when an AttributeQuery's retained time-sample source has been removed
  // (stage.cpp _GetValueFromResolveInfoImpl, Usd_QueryTimeSample).
  if (samples.length === 0) return undefined
  const sorted = [...samples].sort(([a], [b]) => a - b)
  const value = interpolateSamples({
    length: sorted.length,
    timeAt: i => sorted[i]![0],
    valueAt: i => sorted[i]![1],
  }, time, interpolation, isPreTime, typeName)
  // A held or exact result may be an authored sample itself: stored values
  // are read-only and shared (sdf immutableValue.ts), so it is returned as is.
  return value
}

// usdInterpolateSamples over samples already in increasing time order, read
// by index, so a caller holding the layer's sample storage brackets it in
// place and converts only the values it interpolates (upstream brackets the
// layer's sample map and fetches the two bracketing values,
// interpolators.cpp:160-188). Same result as usdInterpolateSamples over the
// same samples.
export function usdInterpolateSampleAccess(
  samples: UsdSampleAccess,
  time: number,
  interpolation?: UsdInterpolation,
  isPreTime = false,
  typeName?: string,
): unknown {
  if (samples.length === 0) return undefined
  // Each index's value is produced (converted to stage time) once.
  const produced: unknown[] = []
  const indices: number[] = []
  const value = interpolateSamples({
    length: samples.length,
    timeAt: i => samples.timeAt(i),
    valueAt: i => {
      const at = indices.indexOf(i)
      if (at >= 0) return produced[at]
      const v = samples.valueAt(i)
      indices.push(i)
      produced.push(v)
      return v
    },
  }, time, interpolation, isPreTime, typeName)
  return value
}

function interpolateSamples(
  sorted: UsdSampleAccess,
  time: number,
  interpolation: UsdInterpolation | undefined,
  isPreTime: boolean,
  typeName: string | undefined,
): unknown {
  const last = sorted.length - 1
  if (time <= sorted.timeAt(0)) return sorted.valueAt(0)
  if (time > sorted.timeAt(last)) return sorted.valueAt(last)

  if (!isPreTime) {
    for (let i = 0; i <= last; i++) {
      if (sorted.timeAt(i) === time) return sorted.valueAt(i)
    }
  }

  // Find surrounding bracket
  let lo = 0
  let hi = last
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    const midTime = sorted.timeAt(mid)
    if (midTime < time || midTime === time && !isPreTime) lo = mid
    else hi = mid
  }

  const t0 = sorted.timeAt(lo), v0 = sorted.valueAt(lo)
  const t1 = sorted.timeAt(hi), v1 = sorted.valueAt(hi)

  // interpolators.cpp _GetInterpolatingSamplesImpl: a lower block blocks the
  // interval; an upper block makes interpolation held at the lower value.
  if (v0 instanceof SdfValueBlock) return undefined
  if (v1 instanceof SdfValueBlock) return v0

  if (_usdInterpolationIsHeld(interpolation) ||
      typeName !== undefined && !_usdTypeSupportsLinearInterpolation(typeName)) return v0

  const alpha = (time - t0) / (t1 - t0)

  if (typeName?.startsWith('quat')) {
    const slerped = slerpQuaternionValue(v0, v1, alpha, typeName)
    if (slerped !== null) return slerped
    return v0
  }

  if (typeof v0 === 'number' && typeof v1 === 'number') {
    return roundValueForType(v0 + (v1 - v0) * alpha, typeName)
  }

  const typed = lerpTyped(v0, v1, alpha)
  if (typed !== null) return typed
  if (v0 instanceof VtArray || _sdfIsGfValue(v0)) return v0

  // Component-wise lerp for numeric arrays (vectors, quats, point arrays)
  if (Array.isArray(v0) && Array.isArray(v1) && v0.length === v1.length) {
    const lerped = usdLerpArrays(v0, v1, alpha)
    if (lerped !== null) return roundValueForType(lerped, typeName)
  }

  return v0   // held for non-interpolatable types
}
