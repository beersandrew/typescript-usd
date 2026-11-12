// Ported from OpenUSD 26.11.1: pxr/base/ts/binary.cpp, pxr/base/ts/binary.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { GfHalf } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { TsKnot } from './knot.ts'
import { TsSpline } from './spline.ts'
import {
  TsCurveType,
  TsExtrapMode,
  TsExtrapolation,
  TsInterpMode,
  TsLoopParams,
  TsTangentAlgorithm,
} from './types.ts'

export type TsSplineCustomData = Map<number, Record<string, unknown>>

class Reader {
  #position = 0
  readonly #view: DataView

  constructor(data: Uint8Array) {
    this.#view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  get remaining(): number { return this.#view.byteLength - this.#position }
  u8(): number { return this.#view.getUint8(this.#position++) }
  u16(): number { const v = this.#view.getUint16(this.#position, true); this.#position += 2; return v }
  u32(): number { const v = this.#view.getUint32(this.#position, true); this.#position += 4; return v }
  i32(): number { const v = this.#view.getInt32(this.#position, true); this.#position += 4; return v }
  f32(): number { const v = this.#view.getFloat32(this.#position, true); this.#position += 4; return v }
  f64(): number { const v = this.#view.getFloat64(this.#position, true); this.#position += 8; return v }
}

function halfToFloat(value: number): number {
  const sign = (value & 0x8000) << 16
  let exponent = (value >> 10) & 0x1f
  let mantissa = value & 0x3ff
  let bits: number
  if (exponent === 0) {
    if (mantissa === 0) bits = sign
    else {
      exponent = 1
      while ((mantissa & 0x400) === 0) { mantissa <<= 1; exponent-- }
      mantissa &= 0x3ff
      bits = sign | ((exponent + 112) << 23) | (mantissa << 13)
    }
  } else if (exponent === 31) {
    bits = sign | 0x7f800000 | (mantissa << 13)
  } else {
    bits = sign | ((exponent + 112) << 23) | (mantissa << 13)
  }
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setUint32(0, bits, true)
  return view.getFloat32(0, true)
}

class Writer {
  #bytes = new Uint8Array(64)
  #view = new DataView(this.#bytes.buffer)
  #length = 0

  #reserve(n: number): number {
    const at = this.#length
    if (at + n > this.#bytes.length) {
      const grown = new Uint8Array(Math.max(this.#bytes.length * 2, at + n))
      grown.set(this.#bytes.subarray(0, at))
      this.#bytes = grown
      this.#view = new DataView(grown.buffer)
    }
    this.#length = at + n
    return at
  }
  u8(v: number): void { const at = this.#reserve(1); this.#view.setUint8(at, v) }
  u16(v: number): void { const at = this.#reserve(2); this.#view.setUint16(at, v, true) }
  u32(v: number): void { const at = this.#reserve(4); this.#view.setUint32(at, v, true) }
  i32(v: number): void { const at = this.#reserve(4); this.#view.setInt32(at, v, true) }
  f32(v: number): void { const at = this.#reserve(4); this.#view.setFloat32(at, v, true) }
  f64(v: number): void { const at = this.#reserve(8); this.#view.setFloat64(at, v, true) }
  toUint8Array(): Uint8Array { return this.#bytes.slice(0, this.#length) }
}

// OpenUSD pxr/base/ts/binary.cpp:262-475.
export class Ts_BinaryDataAccess {
  // Ts_BinaryDataAccess::GetBinaryFormatVersion (binary.cpp:139-176):
  // 1 for the initial format, 2 when a knot uses a tangent algorithm, 3 for
  // a looping extrapolation's boundary time or a time-valued spline.
  static getBinaryFormatVersion(spline: TsSpline): 1 | 2 | 3 | 4 {
    let version: 1 | 2 | 3 | 4 = 1
    if (spline.getKnots().some(knot =>
      knot.getPreTanAlgorithm() !== TsTangentAlgorithm.None ||
      knot.getPostTanAlgorithm() !== TsTangentAlgorithm.None)) version = 2
    const pre = spline.getPreExtrapolation(), post = spline.getPostExtrapolation()
    if ((pre.isLooping() && pre.loopBoundaryTime !== undefined) ||
        (post.isLooping() && post.loopBoundaryTime !== undefined)) version = 3
    if (spline.isTimeValued()) version = 3
    if (spline.GetValueTypeName()==='duration') version = 4
    return version
  }

  // Ts_BinaryDataAccess::GetBinaryData (binary.cpp:179-306): the spline as a
  // byte blob, with knot custom data returned separately for the caller to
  // serialize as dictionaries.
  static getBinaryData(spline: TsSpline): { data: Uint8Array, customData: TsSplineCustomData } {
    const knots = spline.getKnots().slice().sort((a, b) => a.getTime() - b.getTime())
    const customData: TsSplineCustomData = new Map()
    for (const knot of knots) {
      const data = knot.getCustomData()
      if (Object.keys(data).length > 0) customData.set(knot.getTime(), data)
    }
    const w = new Writer()
    const version = Ts_BinaryDataAccess.getBinaryFormatVersion(spline)
    const typeName = spline.GetValueTypeName()
    const typeDescriptor = typeName==='duration' ? 5 : spline.isTimeValued() ? 4
      : typeName === 'float' ? 2 : typeName === 'GfHalf' ? 3 : 1
    const curveType = spline.getCurveType()
    w.u8(version | (typeDescriptor << 4) | (curveType << 7))

    const pre = spline.getPreExtrapolation(), post = spline.getPostExtrapolation()
    const loops = spline.getInnerLoopParams()
    const hasLoops = loops.protoStart !== 0 || loops.protoEnd !== 0 ||
      loops.numPreLoops !== 0 || loops.numPostLoops !== 0 || loops.valueOffset !== 0
    w.u8(pre.mode | (post.mode << 3) | (hasLoops ? 0x40 : 0))
    if (version > 2) {
      const preBoundary = pre.isLooping() && pre.loopBoundaryTime !== undefined
      const postBoundary = post.isLooping() && post.loopBoundaryTime !== undefined
      w.u8((preBoundary ? 0x01 : 0) | (postBoundary ? 0x02 : 0))
      if (preBoundary) w.f64(pre.loopBoundaryTime!)
      if (postBoundary) w.f64(post.loopBoundaryTime!)
    }
    if (pre.mode === TsExtrapMode.Sloped) w.f64(pre.slope)
    if (post.mode === TsExtrapMode.Sloped) w.f64(post.slope)
    if (hasLoops) {
      w.f64(loops.protoStart)
      w.f64(loops.protoEnd)
      w.i32(loops.numPreLoops)
      w.i32(loops.numPostLoops)
      w.f64(loops.valueOffset)
    }

    const writeValue = (value: number): void => {
      if (typeDescriptor === 2) w.f32(value)
      else if (typeDescriptor === 3) w.u16(new GfHalf(value).bits())
      else w.f64(value)
    }
    const isHermite = curveType === TsCurveType.Hermite
    w.u32(knots.length)
    for (const knot of knots) {
      w.u8((knot.isDualValued() ? 0x01 : 0) | (knot.getNextInterpolation() << 1) |
        (knot.getCurveType() << 3))
      w.f64(knot.getTime())
      writeValue(knot.GetValue())
      if (knot.isDualValued()) writeValue(knot.getPreValue())
      if (!isHermite) {
        w.f64(knot.getPreTanWidth())
        w.f64(knot.getPostTanWidth())
      }
      writeValue(knot.getPreTanSlope())
      writeValue(knot.getPostTanSlope())
      if (version > 1) w.u8(knot.getPreTanAlgorithm() | (knot.getPostTanAlgorithm() << 4))
    }
    return { data: w.toUint8Array(), customData }
  }

  static createSplineFromBinaryData(data: Uint8Array, customData: TsSplineCustomData): TsSpline {
    if (data.byteLength === 0) return new TsSpline()

    const reader = new Reader(data)
    const firstHeader = reader.u8()
    const version = firstHeader & 0x0f
    if (version < 1 || version > 4) throw new Error(`Unknown spline data version ${version}`)

    // Version 3 widens the type descriptor to three bits and adds descriptor
    // 4, GfTimeCode, replacing the legacy time-valued bit (binary.cpp:421-438).
    const typeDescriptor = version > 2 ? (firstHeader & 0x70) >> 4 : (firstHeader & 0x30) >> 4
    // OpenUSD maps descriptor 0 to double backing data while retaining an
    // internal isTyped=false flag (pxr/base/ts/binary.cpp:344-361).
    // Descriptor 4 is GfTimeCode, and a version <= 2 legacy time-valued bit
    // upgrades the spline to GfTimeCode (binary.cpp:415-441).
    const typeNames = ['double', 'double', 'float', 'GfHalf', 'GfTimeCode', 'GfDuration'] as const
    let typeName: string | undefined = typeNames[typeDescriptor]
    if (typeName === undefined) throw new Error('Bad spline type descriptor')
    if (version <= 2 && (firstHeader & 0x40)) typeName = 'GfTimeCode'
    const valueType = TfType.declare(typeName)
    const spline = new TsSpline(valueType)
    const curveType = (firstHeader & 0x80) >> 7
    spline.setCurveType(curveType as TsCurveType)

    const secondHeader = reader.u8()
    const preMode = (secondHeader & 0x07) as TsExtrapMode
    const postMode = ((secondHeader & 0x38) >> 3) as TsExtrapMode
    let preBoundary: number | undefined
    let postBoundary: number | undefined
    if (version > 2) {
      const thirdHeader = reader.u8()
      if (thirdHeader & 0x01) preBoundary = reader.f64()
      if (thirdHeader & 0x02) postBoundary = reader.f64()
    }
    spline.setPreExtrapolation(new TsExtrapolation(
      preMode, preMode === TsExtrapMode.Sloped ? reader.f64() : 0, preBoundary))
    spline.setPostExtrapolation(new TsExtrapolation(
      postMode, postMode === TsExtrapMode.Sloped ? reader.f64() : 0, postBoundary))

    if (secondHeader & 0x40) {
      spline._setInnerLoopParamsUnchecked(new TsLoopParams(reader.f64(), reader.f64(), reader.i32(), reader.i32(), reader.f64()))
    }

    const readValue = (): number => {
      if (typeDescriptor === 1 || typeDescriptor === 4 || typeDescriptor === 5) return reader.f64()
      if (typeDescriptor === 2) return reader.f32()
      if (typeDescriptor === 3) return halfToFloat(reader.u16())
      throw new Error('Cannot read knots for an untyped spline')
    }

    const knots: TsKnot[] = []
    {
      let knotCount = reader.u32()
      while (knotCount-- > 0) {
        const flags = reader.u8()
        const knot = new TsKnot(valueType)
        knot.setNextInterpolation(((flags & 0x06) >> 1) as TsInterpMode)
        knot.setCurveType(((flags & 0x08) >> 3) as TsCurveType)
        knot.SetTime(reader.f64())
        knot.setValue(readValue())
        if (flags & 0x01) knot.setPreValue(readValue())
        if (curveType !== TsCurveType.Hermite) {
          knot.setPreTanWidth(reader.f64())
          knot.setPostTanWidth(reader.f64())
        }
        knot.setPreTanSlope(readValue())
        knot.setPostTanSlope(readValue())
        if (version > 1) {
          const algorithms = reader.u8()
          knot.setPreTanAlgorithm((algorithms & 0x0f) as TsTangentAlgorithm)
          knot.setPostTanAlgorithm((algorithms >> 4) as TsTangentAlgorithm)
        }
        knot.setCustomData(customData.get(knot.getTime()) ?? {})
        knots.push(knot)
      }
    }
    if (reader.remaining !== 0) throw new Error(`Unread spline data: ${reader.remaining} bytes`)
    spline.setKnots(knots)
    return spline
  }
}
