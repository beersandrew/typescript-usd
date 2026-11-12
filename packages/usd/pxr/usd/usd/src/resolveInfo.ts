// Ported from OpenUSD 26.11.1: pxr/usd/usd/resolveInfo.cpp,
//  pxr/usd/usd/resolveInfo.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public UsdResolveInfo counterpart (pxr/usd/usd/resolveInfo.{h,cpp}).

import type { Node as PcpNode } from 'typescript-usd/pcp'
import type { UsdAttributeResolveResult } from './resolver.ts'

export enum UsdResolveInfoSource {
  None,
  Fallback,
  Default,
  TimeSamples,
  ValueClips,
  Spline,
}

const sourceMap = {
  none: UsdResolveInfoSource.None,
  fallback: UsdResolveInfoSource.Fallback,
  default: UsdResolveInfoSource.Default,
  timeSamples: UsdResolveInfoSource.TimeSamples,
  valueClips: UsdResolveInfoSource.ValueClips,
  spline: UsdResolveInfoSource.Spline,
} as const

const emptyResult = (): UsdAttributeResolveResult => ({
  source: 'none', valueIsBlocked: false,
})
const resultOf = (info: UsdResolveInfo): UsdAttributeResolveResult => info._result

export class UsdResolveInfo {
  // The canonical resolver's facts this resolve info presents, held on the
  // object (a field rather than a side table: one is made per attribute
  // query).
  /** @internal */ _result: UsdAttributeResolveResult = emptyResult()

  getSource(): UsdResolveInfoSource { return sourceMap[resultOf(this).source] }

  hasAuthoredValueOpinion(): boolean {
    return this.hasAuthoredValue() || this.valueIsBlocked()
  }

  hasAuthoredValue(): boolean {
    const result = resultOf(this)
    return result.source === 'default' ||
      result.source === 'timeSamples' ||
      result.source === 'valueClips' ||
      result.source === 'spline'
  }

  getNode(): PcpNode | undefined { return resultOf(this).node }

  valueIsBlocked(): boolean { return resultOf(this).valueIsBlocked }

  valueSourceMightBeTimeVarying(): boolean {
    const result = resultOf(this)
    return result.source === 'timeSamples' ||
      result.source === 'valueClips' ||
      result.source === 'spline' ||
      this.getNextWeakerInfo()?.valueSourceMightBeTimeVarying() === true
  }

  hasNextWeakerInfo(): boolean { return resultOf(this).nextWeaker !== undefined }

  getNextWeakerInfo(): UsdResolveInfo | undefined {
    const weaker = resultOf(this).nextWeaker
    return weaker ? _makeUsdResolveInfo(weaker) : undefined
  }
}

/** @internal Cached source facts consumed by UsdAttributeQuery. */
export function _getUsdResolveInfoResult(info: UsdResolveInfo): UsdAttributeResolveResult {
  return resultOf(info)
}

/** @internal Constructs resolve info from the canonical resolver's facts. */
export function _makeUsdResolveInfo(result: UsdAttributeResolveResult): UsdResolveInfo {
  const info = new UsdResolveInfo()
  info._result = result
  return info
}
