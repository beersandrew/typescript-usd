// Ported from OpenUSD 26.11.1: pxr/base/ts/types.cpp, pxr/base/ts/types.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/types.h.
import { Interval as GfInterval } from 'typescript-usd/gf'

export type TsTime = number

export enum TsInterpMode {
  ValueBlock = 0,
  Held = 1,
  Linear = 2,
  Curve = 3,
}

export const TsInterpValueBlock = TsInterpMode.ValueBlock
export const TsInterpHeld = TsInterpMode.Held
export const TsInterpLinear = TsInterpMode.Linear
export const TsInterpCurve = TsInterpMode.Curve

export enum TsCurveType {
  Bezier = 0,
  Hermite = 1,
}

export const TsCurveTypeBezier = TsCurveType.Bezier
export const TsCurveTypeHermite = TsCurveType.Hermite

export enum TsExtrapMode {
  ValueBlock = 0,
  Held = 1,
  Linear = 2,
  Sloped = 3,
  LoopRepeat = 4,
  LoopReset = 5,
  LoopOscillate = 6,
}

export const TsExtrapValueBlock = TsExtrapMode.ValueBlock
export const TsExtrapHeld = TsExtrapMode.Held
export const TsExtrapLinear = TsExtrapMode.Linear
export const TsExtrapSloped = TsExtrapMode.Sloped
export const TsExtrapLoopRepeat = TsExtrapMode.LoopRepeat
export const TsExtrapLoopReset = TsExtrapMode.LoopReset
export const TsExtrapLoopOscillate = TsExtrapMode.LoopOscillate

export enum TsSplineSampleSource {
  PreExtrap = 0,
  PreExtrapLoop = 1,
  InnerLoopPreEcho = 2,
  InnerLoopProto = 3,
  InnerLoopPostEcho = 4,
  KnotInterp = 5,
  PostExtrap = 6,
  PostExtrapLoop = 7,
}

export const TsSourcePreExtrap = TsSplineSampleSource.PreExtrap
export const TsSourcePreExtrapLoop = TsSplineSampleSource.PreExtrapLoop
export const TsSourceInnerLoopPreEcho = TsSplineSampleSource.InnerLoopPreEcho
export const TsSourceInnerLoopProto = TsSplineSampleSource.InnerLoopProto
export const TsSourceInnerLoopPostEcho = TsSplineSampleSource.InnerLoopPostEcho
export const TsSourceKnotInterp = TsSplineSampleSource.KnotInterp
export const TsSourcePostExtrap = TsSplineSampleSource.PostExtrap
export const TsSourcePostExtrapLoop = TsSplineSampleSource.PostExtrapLoop

export enum TsTangentAlgorithm {
  None = 0,
  Custom = 1,
  AutoEase = 2,
}

export const TsTangentAlgorithmNone = TsTangentAlgorithm.None
export const TsTangentAlgorithmCustom = TsTangentAlgorithm.Custom
export const TsTangentAlgorithmAutoEase = TsTangentAlgorithm.AutoEase

export enum TsAntiRegressionMode {
  None = 0,
  Contain = 1,
  KeepRatio = 2,
  KeepStart = 3,
}

export const TsAntiRegressionNone = TsAntiRegressionMode.None
export const TsAntiRegressionContain = TsAntiRegressionMode.Contain
export const TsAntiRegressionKeepRatio = TsAntiRegressionMode.KeepRatio
export const TsAntiRegressionKeepStart = TsAntiRegressionMode.KeepStart

// Ts_LoopParams stores its loop counts as int32_t (types.h:226-227). The
// usda parser assigns a parsed double to them (textFileFormatParser.cpp:
// 2675-2676), which C++ leaves undefined out of range; we deliberately
// saturate, as the arm64 OpenUSD build does, and truncate toward zero (NaN
// becomes 0).
export function tsLoopCountToInt32(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value >= 2147483647) return 2147483647
  if (value <= -2147483648) return -2147483648
  return Math.trunc(value)
}

export class TsLoopParams {
  constructor(
    public protoStart = 0,
    public protoEnd = 0,
    public numPreLoops = 0,
    public numPostLoops = 0,
    public valueOffset = 0,
  ) {}

  // types.cpp:70-81: half-open [protoStart, protoEnd), or empty when the
  // parameters describe no inner loop.
  getPrototypeInterval(): GfInterval {
    if (this.protoEnd > this.protoStart && (this.numPreLoops > 0 || this.numPostLoops > 0)) {
      return new GfInterval(this.protoStart, this.protoEnd, true, false)
    }
    return new GfInterval()
  }

  // types.cpp:83-95: closed looped interval, or empty.
  getLoopedInterval(): GfInterval {
    if (this.protoEnd > this.protoStart && (this.numPreLoops > 0 || this.numPostLoops > 0)) {
      const protoSpan = this.protoEnd - this.protoStart
      return new GfInterval(
        this.protoStart - this.numPreLoops * protoSpan,
        this.protoEnd + this.numPostLoops * protoSpan)
    }
    return new GfInterval()
  }

  // types.cpp:55-63.
  equals(other: TsLoopParams): boolean {
    return this.protoStart === other.protoStart &&
      this.protoEnd === other.protoEnd &&
      this.numPreLoops === other.numPreLoops &&
      this.numPostLoops === other.numPostLoops &&
      this.valueOffset === other.valueOffset
  }
}

export class TsExtrapolation {
  public loopBoundaryTime: number | undefined

  constructor(
    public mode: TsExtrapMode = TsExtrapMode.Held,
    public slope = 0,
    loopBoundaryTime?: number,
  ) {
    this.loopBoundaryTime = loopBoundaryTime
  }

  isLooping(): boolean {
    return this.mode >= TsExtrapMode.LoopRepeat
  }

  // types.cpp:111-116: slope matters only for Sloped mode.
  equals(other: TsExtrapolation): boolean {
    return this.mode === other.mode &&
      (this.mode !== TsExtrapMode.Sloped || this.slope === other.slope)
  }
}

export class TsSplineSamples<Vertex = readonly [number, number]> {
  polylines: Vertex[][] = []
}

export class TsSplineSamplesWithSources<Vertex = readonly [number, number]>
  extends TsSplineSamples<Vertex> {
  sources: TsSplineSampleSource[] = []
}

export function Ts_IsFinite(value: number): boolean {
  return Number.isFinite(value)
}

/** Runtime analog of the C++ value-type dispatch templates. */
export function TsDispatchToValueTypeTemplate<T>(
  _type: unknown,
  fn: (...args: unknown[]) => T,
  ...args: unknown[]
): T {
  return fn(...args)
}

export const TsDispatchToStorageValueTypeTemplate = TsDispatchToValueTypeTemplate

/**
 * TfStringify for the doubles and floats Ts prints (tf/stringUtils.cpp:917-950):
 * shortest round-trip digits, decimal notation for magnitudes in [1e-6, 1e15)
 * and 'e' notation without a '+' otherwise. Float values print the shortest
 * single-precision form (ToShortestSingle).
 */
export function Ts_StringifyNumber(value: number, typeName = 'double'): string {
  if (Number.isNaN(value)) return 'nan'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  if (value === 0) return Object.is(value, -0) ? '-0' : '0'
  let digits: string | undefined
  if (typeName === 'float' || typeName === 'GfHalf') {
    for (let p = 1; p <= 9; p++) {
      const candidate = value.toPrecision(p)
      if (Math.fround(Number(candidate)) === Math.fround(value)) {
        digits = Number(candidate).toExponential()
        break
      }
    }
  }
  const exp = digits ?? value.toExponential()
  const [mantissa, e] = exp.split('e') as [string, string]
  const exponent = Number(e)
  if (exponent >= -6 && exponent < 15) {
    return String(Number(exp))
  }
  return `${mantissa}e${exponent}`
}
