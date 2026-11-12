// Portions ported from OpenUSD 26.11.1, including:
//  pxr/base/gf/matrix4.template.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Shared attribute-value coercion helpers for UsdGeom schema classes.
// Attribute values are Gf values and VtArrays; these read them as the flat
// numbers and plain lists the schema math works on.

import type { Prim } from 'typescript-usd/usd'
import { _sdfIsGfValue, _sdfPlainValue } from 'typescript-usd/sdf/_internal'
import { Array as VtArray } from 'typescript-usd/vt'

// A Gf value or VtArray as plain nested numbers and lists ([x, y, z],
// real-first quaternions, matrix rows); other values are returned as is.
export function plain(v: unknown): unknown {
  return v instanceof VtArray || _sdfIsGfValue(v) ? _sdfPlainValue(v) : v
}

export function attrVal(prim: Prim, name: string, time?: number): unknown {
  const attr = prim.getAttr(name)
  if (!attr) return undefined
  return time !== undefined ? attr.getValueAtTime(time) : attr.getValue()
}

// AUTHORED opinions only — schema fallbacks are excluded (the
// UsdAttribute::HasAuthoredValue-guarded read upstream uses where fallbacks
// must not participate, e.g. extent resolution and purpose inheritance).
export function authoredAttrVal(prim: Prim, name: string, time?: number): unknown {
  const attr = prim.getAttr(name)
  if (!attr || !attr.hasAuthoredValue()) return undefined
  return time !== undefined ? attr.getValueAtTime(time) : attr.getValue()
}

// Vec3f[]/Vec2f[] from USDC is number[][]. Flatten to Float32Array.
export function toFloat32(v: unknown): Float32Array | null {
  if (v == null) return null
  if (v instanceof Float32Array) return v
  if (v instanceof VtArray) {
    // Numeric storage converts in one pass; half storage decodes per element.
    const data = v.cdata()
    if (data instanceof Float32Array || data instanceof Float64Array || data instanceof Int32Array) {
      return v.size > 0 ? new Float32Array(data) : null
    }
    v = plain(v)
  }
  if (Array.isArray(v) && v.length > 0) {
    if (Array.isArray(v[0])) {
      // number[][]
      const flat: number[] = []
      for (const el of v) for (const n of el as number[]) flat.push(n)
      return new Float32Array(flat)
    }
    // flat number[]
    return new Float32Array(v.map(Number))
  }
  return null
}

export function toInt32(v: unknown): Int32Array | null {
  if (v == null) return null
  if (v instanceof Int32Array) return v
  if (v instanceof VtArray) {
    const data = v.cdata()
    if (data instanceof Int32Array) return data.slice()
    v = plain(v)
  }
  if (Array.isArray(v)) return new Int32Array(v.map(Number))
  return null
}

export function toExtent(v: unknown): [[number, number, number], [number, number, number]] | null {
  v = plain(v)
  if (!Array.isArray(v) || v.length < 2) return null
  const min = Array.isArray(v[0]) ? v[0] as number[] : [Number(v[0]), 0, 0]
  const max = Array.isArray(v[1]) ? v[1] as number[] : [Number(v[1]), 0, 0]
  return [
    [Math.fround(Number(min[0] ?? 0)), Math.fround(Number(min[1] ?? 0)), Math.fround(Number(min[2] ?? 0))],
    [Math.fround(Number(max[0] ?? 0)), Math.fround(Number(max[1] ?? 0)), Math.fround(Number(max[2] ?? 0))],
  ]
}

export function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

// A token[] value as a list of tokens.
export function asTokens(v: unknown): string[] {
  if (v instanceof VtArray) return v.toArray().filter((t): t is string => typeof t === 'string')
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
}

export function asToken(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

export function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export function asVec3(v: unknown): [number, number, number] {
  v = plain(v)
  if (Array.isArray(v) && v.length >= 3) return [Number(v[0]), Number(v[1]), Number(v[2])]
  return [0, 0, 0]
}

export function asScalar(v: unknown): number {
  if (typeof v === 'number') return v
  v = plain(v)
  if (Array.isArray(v) && typeof v[0] === 'number') return v[0]
  return 0
}

export function asQuat(v: unknown): [number, number, number, number] {
  // USD stores quaternion as [w, x, y, z]. Preserve the authored magnitude:
  // OpenUSD v26.08 GfMatrix4d::_SetRotateFromQuat
  // (pxr/base/gf/matrix4.template.cpp:292-304) consumes the quaternion
  // components directly, without normalization.
  v = plain(v)
  if (Array.isArray(v) && v.length >= 4) {
    const w = Number(v[0]), x = Number(v[1]), y = Number(v[2]), z = Number(v[3])
    return [w, x, y, z]
  }
  return [1, 0, 0, 0]
}

export function asMatrix4Flat(v: unknown): number[] | null {
  v = plain(v)
  // parseMathematical returns number[][] for Matrix4d
  if (Array.isArray(v) && v.length === 4 && Array.isArray(v[0])) {
    const flat: number[] = []
    for (const row of v) for (const el of row as number[]) flat.push(Number(el))
    return flat
  }
  if (Array.isArray(v) && v.length === 16) return v.map(Number)
  return null
}
