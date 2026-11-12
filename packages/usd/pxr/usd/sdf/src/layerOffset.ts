// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layerOffset.cpp,
//  pxr/usd/sdf/layerOffset.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfLayerOffset — an affine time remap (scale + offset) carried along a
// composition arc. Faithful port of sdf/layerOffset.h/.cpp semantics.
// PcpMapFunction (typescript-usd/pcp) carries one of these.
//
// Applying to a time: t -> t * scale + offset.
// Composition (a * b) means "apply b, then a":
//   (a * b).apply(t) == a.apply(b.apply(t))
//   => offset = a.offset + a.scale * b.offset,  scale = a.scale * b.scale
// This matches sdf/layerOffset.cpp operator*.

import { Duration as GfDuration, TimeCode as GfTimeCode } from 'typescript-usd/gf'

export interface SdfLayerOffset {
  readonly offset: number
  readonly scale: number
}

export const SDF_LAYER_OFFSET_IDENTITY: SdfLayerOffset = { offset: 0, scale: 1 }

// SdfLayerOffset::operator* (layerOffset.cpp:59-76): a double or a
// GfTimeCode maps through scale and offset; a GfDuration is a relative time
// and only scales.
export function sdfLayerOffsetApply(offset: SdfLayerOffset, time: number): number
export function sdfLayerOffsetApply(offset: SdfLayerOffset, time: GfTimeCode): GfTimeCode
export function sdfLayerOffsetApply(offset: SdfLayerOffset, time: GfDuration): GfDuration
export function sdfLayerOffsetApply(
  offset: SdfLayerOffset, time: number | GfTimeCode | GfDuration,
): number | GfTimeCode | GfDuration {
  if (time instanceof GfDuration) return new GfDuration(time.GetValue() * offset.scale)
  if (time instanceof GfTimeCode) return new GfTimeCode(time.GetValue() * offset.scale + offset.offset)
  return time * offset.scale + offset.offset
}

// Compose two offsets: result.apply(t) == a.apply(b.apply(t)).
export function sdfLayerOffsetCompose(a: SdfLayerOffset, b: SdfLayerOffset): SdfLayerOffset {
  return { offset: a.offset + a.scale * b.offset, scale: a.scale * b.scale }
}

// The inverse remap, or null when scale is 0 (non-invertible), mirroring
// SdfLayerOffset::GetInverse returning an invalid offset.
export function sdfLayerOffsetInverse(o: SdfLayerOffset): SdfLayerOffset | null {
  if (o.scale === 0) return null
  // layerOffset.cpp:37-49 multiplies by the reciprocal; dividing the offset
  // directly changes rounding and can move exact authored sample times.
  const scale = 1 / o.scale
  return { offset: -o.offset * scale, scale }
}

export function sdfLayerOffsetIsIdentity(o: SdfLayerOffset): boolean {
  return o.offset === 0 && o.scale === 1
}

export function sdfLayerOffsetEquals(a: SdfLayerOffset, b: SdfLayerOffset): boolean {
  return a.offset === b.offset && a.scale === b.scale
}

// SdfLayerOffset::IsValid (layerOffset.cpp:32-36).
export function sdfLayerOffsetIsValid(o: SdfLayerOffset): boolean {
  return Number.isFinite(o.offset) && Number.isFinite(o.scale)
}

// SdfLayerOffset::operator< (layerOffset.cpp:86-106), with GfIsClose at
// EPSILON (layerOffset.cpp:23).
export function sdfLayerOffsetLessThan(lhs: SdfLayerOffset, rhs: SdfLayerOffset): boolean {
  const EPSILON = 1e-6
  const isClose = (a: number, b: number): boolean => Math.abs(a - b) < EPSILON
  if (!sdfLayerOffsetIsValid(lhs)) return false
  if (!sdfLayerOffsetIsValid(rhs)) return true
  if (isClose(lhs.scale, rhs.scale)) {
    if (isClose(lhs.offset, rhs.offset)) return false
    return lhs.offset < rhs.offset
  }
  return lhs.scale < rhs.scale
}
