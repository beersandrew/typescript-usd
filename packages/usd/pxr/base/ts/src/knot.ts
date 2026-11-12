// Ported from OpenUSD 26.11.1: pxr/base/ts/knot.cpp, pxr/base/ts/knot.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Type as TfType } from 'typescript-usd/tf'
import { GfHalf } from 'typescript-usd/gf'
import { _CopyHeldValue } from 'typescript-usd/vt'
import { TsCurveType, TsInterpMode, TsTangentAlgorithm, Ts_StringifyNumber } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/knot.{h,cpp} and knotData.cpp.
export interface TsKnotOptions {
  typeName?: string
  curveType?: TsCurveType
  time?: number
  nextInterp?: TsInterpMode
  value?: number
  preValue?: number
  customData?: Record<string, unknown>
  preTanWidth?: number
  preTanSlope?: number
  postTanWidth?: number
  postTanSlope?: number
  preTanAlgorithm?: TsTangentAlgorithm
  postTanAlgorithm?: TsTangentAlgorithm
}

export class TsKnot {
  #time = 0
  #nextInterpolation = TsInterpMode.Held
  #curveType = TsCurveType.Bezier
  #dualValued = false
  #value = 0
  #preValue = 0
  #preTanWidth = 0
  #postTanWidth = 0
  #preTanSlope = 0
  #postTanSlope = 0
  #preTanAlgorithm = TsTangentAlgorithm.None
  #postTanAlgorithm = TsTangentAlgorithm.None
  #customData: Record<string, unknown> = {}
  readonly valueType: TfType

  constructor(valueTypeOrOptions: TfType | TsKnotOptions = TfType.declare('double')) {
    if (valueTypeOrOptions instanceof TfType) {
      this.valueType = valueTypeOrOptions
      return
    }
    const o = valueTypeOrOptions
    this.valueType = TfType.declare(o.typeName ?? 'double')
    if (o.curveType !== undefined) this.#curveType = o.curveType
    if (o.time !== undefined) this.#time = o.time
    if (o.nextInterp !== undefined) this.#nextInterpolation = o.nextInterp
    if (o.value !== undefined) this.#value = this.#store(o.value)
    if (o.preValue !== undefined) { this.#dualValued = true; this.#preValue = this.#store(o.preValue) }
    if (o.customData !== undefined) this.#customData = _CopyHeldValue(o.customData) as Record<string, unknown>
    if (o.preTanWidth !== undefined) this.#preTanWidth = o.preTanWidth
    if (o.preTanSlope !== undefined) this.#preTanSlope = this.#store(o.preTanSlope)
    if (o.postTanWidth !== undefined) this.#postTanWidth = o.postTanWidth
    if (o.postTanSlope !== undefined) this.#postTanSlope = this.#store(o.postTanSlope)
    if (o.preTanAlgorithm !== undefined) this.#preTanAlgorithm = o.preTanAlgorithm
    if (o.postTanAlgorithm !== undefined) this.#postTanAlgorithm = o.postTanAlgorithm
  }

  clone(): TsKnot {
    const k = new TsKnot(this.valueType)
    k.#time = this.#time
    k.#nextInterpolation = this.#nextInterpolation
    k.#curveType = this.#curveType
    k.#dualValued = this.#dualValued
    k.#value = this.#value
    k.#preValue = this.#preValue
    k.#preTanWidth = this.#preTanWidth
    k.#postTanWidth = this.#postTanWidth
    k.#preTanSlope = this.#preTanSlope
    k.#postTanSlope = this.#postTanSlope
    k.#preTanAlgorithm = this.#preTanAlgorithm
    k.#postTanAlgorithm = this.#postTanAlgorithm
    k.#customData = _CopyHeldValue(this.#customData) as Record<string, unknown>
    return k
  }

  equals(other: TsKnot): boolean {
    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON())
  }

  private toJSON(): unknown[] {
    return [this.#time, this.#nextInterpolation, this.#dualValued, this.#value,
      this.getPreValue(), this.#preTanWidth, this.#postTanWidth,
      this.#preTanSlope, this.#postTanSlope, this.#preTanAlgorithm,
      this.#postTanAlgorithm, this.#customData]
  }

  GetValueType(): TfType { return this.valueType }
  GetValueTypeName(): string { return this.valueType.getTypeName()==='GfDuration'?'duration':this.valueType.getTypeName() }
  getTime(): number { return this.#time }
  getNextInterpolation(): TsInterpMode { return this.#nextInterpolation }
  getCurveType(): TsCurveType { return this.#curveType }
  isDualValued(): boolean { return this.#dualValued }
  GetValue(): number { return this.#value }
  getPreValue(): number { return this.#dualValued ? this.#preValue : this.#value }
  getPreTanWidth(): number { return this.#preTanWidth }
  getPostTanWidth(): number { return this.#postTanWidth }
  getPreTanSlope(): number { return this.#preTanSlope }
  getPostTanSlope(): number { return this.#postTanSlope }
  getPreTanAlgorithm(): TsTangentAlgorithm { return this.#preTanAlgorithm }
  getPostTanAlgorithm(): TsTangentAlgorithm { return this.#postTanAlgorithm }
  getCustomData(): Record<string, unknown> { return _CopyHeldValue(this.#customData) as Record<string, unknown> }

  SetTime(value: number): boolean { if (!Number.isFinite(value)) return false; this.#time = value; return true }
  setNextInterpolation(value: TsInterpMode): boolean { this.#nextInterpolation = value; return true }
  setCurveType(value: TsCurveType): boolean { this.#curveType = value; return true }
  // Ts_TypedKnotData<T> stores value, preValue and the tangent slopes as T
  // (knotData.h:179-191), so float and GfHalf knots hold their values at that
  // precision; times and widths are double.
  #store(value: number): number {
    const typeName = this.valueType.getTypeName()
    return typeName === 'float' ? Math.fround(value)
      : typeName === 'GfHalf' ? new GfHalf(value).GetValue() : value
  }

  setValue(value: number): boolean { if (!Number.isFinite(value)) return false; this.#value = this.#store(value); return true }
  setPreValue(value: number): boolean { if (!Number.isFinite(value)) return false; this.#dualValued = true; this.#preValue = this.#store(value); return true }
  clearPreValue(): void { this.#dualValued = false }
  setPreTanWidth(value: number): boolean { if (value < 0 || !Number.isFinite(value)) return false; this.#preTanWidth = value; return true }
  setPostTanWidth(value: number): boolean { if (value < 0 || !Number.isFinite(value)) return false; this.#postTanWidth = value; return true }
  setPreTanSlope(value: number): boolean { if (!Number.isFinite(value)) return false; this.#preTanSlope = this.#store(value); return true }
  setPostTanSlope(value: number): boolean { if (!Number.isFinite(value)) return false; this.#postTanSlope = this.#store(value); return true }
  setPreTanAlgorithm(value: TsTangentAlgorithm): boolean { this.#preTanAlgorithm = value; return true }
  setPostTanAlgorithm(value: TsTangentAlgorithm): boolean { this.#postTanAlgorithm = value; return true }
  setCustomData(value: Record<string, unknown>): boolean { this.#customData = _CopyHeldValue(value) as Record<string, unknown>; return true }
  setCustomDataByKey(key: string, value: unknown): boolean { this.#customData[key] = _CopyHeldValue(value); return true }
  getCustomDataByKey(key: string): unknown { return _CopyHeldValue(this.#customData[key]) }

  // knot.cpp:527-567 (operator<<).
  toString(): string {
    const typeName = this.valueType.getTypeName()
    const n = (v: number): string => Ts_StringifyNumber(v)
    const tv = (v: number): string => Ts_StringifyNumber(v, typeName)
    const interpNames = ['ValueBlock', 'Held', 'Linear', 'Curve']
    const algNames = ['None', 'Custom', 'AutoEase']
    let out = 'Knot:\n' +
      `  value type ${typeName}\n` +
      `  time ${n(this.#time)}\n` +
      `  value ${tv(this.#value)}\n` +
      `  next interp ${interpNames[this.#nextInterpolation] ?? ''}\n`
    if (this.#dualValued) {
      out += `  preValue ${tv(this.#preValue)}\n`
    }
    out += `  pre-tan width ${n(this.#preTanWidth)}\n` +
      `  pre-tan slope ${tv(this.#preTanSlope)}\n`
    if (this.#preTanAlgorithm !== TsTangentAlgorithm.None) {
      out += `  pre-tan algorithm ${algNames[this.#preTanAlgorithm] ?? ''}\n`
    }
    out += `  post-tan width ${n(this.#postTanWidth)}\n` +
      `  post-tan slope ${tv(this.#postTanSlope)}\n`
    if (this.#postTanAlgorithm !== TsTangentAlgorithm.None) {
      out += `  post-tan algorithm ${algNames[this.#postTanAlgorithm] ?? ''}\n`
    }
    if (Object.keys(this.#customData).length > 0) {
      out += `  custom data ${JSON.stringify(this.#customData)}\n`
    }
    return out
  }

  updateTangents(prev: TsKnot | undefined, next: TsKnot | undefined, curveType = TsCurveType.Bezier): boolean {
    const update = (pre: boolean): boolean => {
      const algorithm = pre ? this.#preTanAlgorithm : this.#postTanAlgorithm
      const adjacent = pre ? prev : next
      if (!adjacent) return algorithm !== TsTangentAlgorithm.AutoEase
      if (algorithm !== TsTangentAlgorithm.AutoEase) {
        if (curveType === TsCurveType.Hermite) {
          const width = Math.abs(adjacent.getTime() - this.#time) / 3
          if (pre) this.#preTanWidth = width
          else this.#postTanWidth = width
        }
        return true
      }
      const discontinuous = !prev || !next || this.#dualValued ||
        this.#nextInterpolation === TsInterpMode.ValueBlock ||
        prev.getNextInterpolation() === TsInterpMode.ValueBlock
      let slope = 0
      if (!discontinuous) {
        const prevSlope = (this.#value - prev.GetValue()) / (this.#time - prev.getTime())
        const nextSlope = (next.getPreValue() - this.#value) / (next.getTime() - this.#time)
        if (prevSlope * nextSlope > 0) {
          const f = (this.#time - prev.getTime()) / (next.getTime() - prev.getTime())
          const u = f - 0.5
          const g = 0.5 + u * (0.5 + 2 * u * u)
          slope = (1 - g) * prevSlope + g * nextSlope
          slope = nextSlope > 0
            ? Math.min(slope, 3 * nextSlope, 3 * prevSlope)
            : Math.max(slope, 3 * nextSlope, 3 * prevSlope)
        }
      }
      const width = Math.abs(adjacent.getTime() - this.#time) / 3
      if (pre) { this.#preTanSlope = slope; this.#preTanWidth = width }
      else { this.#postTanSlope = slope; this.#postTanWidth = width }
      return true
    }
    const preUpdated = update(true)
    const postUpdated = update(false)
    return preUpdated || postUpdated
  }
}

export class TsTypedKnot extends TsKnot {}
export class TsDoubleKnot extends TsTypedKnot {}
export class TsFloatKnot extends TsTypedKnot {}
export class TsHalfKnot extends TsTypedKnot {}
export class TsTimeCodeKnot extends TsTypedKnot {}

/** Sorted knot container, array-compatible for existing typescript-usd consumers. */
export class TsKnotMap extends Array<TsKnot> {
  static get [Symbol.species](): ArrayConstructor { return Array }
  // Knots stay sorted by time, so lookups binary search (upstream TsKnotMap is
  // a sorted vector with lower_bound lookups).
  lowerBound(time: number): number {
    let lo = 0, hi = this.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this[mid]!.getTime() < time) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  indexOfTime(time: number): number {
    const at = this.lowerBound(time)
    return at < this.length && this[at]!.getTime() === time ? at : -1
  }
  has(time: number): boolean { return this.indexOfTime(time) >= 0 }
  get(time: number): TsKnot | undefined {
    const at = this.indexOfTime(time)
    return at >= 0 ? this[at] : undefined
  }
  set(time: number, knot: TsKnot): this {
    knot.SetTime(time)
    const at = this.lowerBound(time)
    if (at < this.length && this[at]!.getTime() === time) this[at] = knot
    else this.splice(at, 0, knot)
    return this
  }
}

export const KnotMap = TsKnotMap
