// Value readers shared by the usdSkel schema classes' static convenience
// readers (Skeleton.getJoints, Animation.getTranslations, ...): the composed
// value of an attribute as a plain JS array.
import type { Prim } from 'typescript-usd/usd'
import type { Matrix4 } from 'typescript-usd/gf'
import { attrVal as rawAttrVal } from 'typescript-usd/usdGeom'
import { _sdfPlainValue } from 'typescript-usd/sdf/_internal'

export function attrVal(prim: Prim, name: string, time?: number): unknown {
  return _sdfPlainValue(rawAttrVal(prim, name, time))
}

export function tokenArray(prim: Prim, name: string, time?: number): string[] {
  const v = attrVal(prim, name, time)
  return Array.isArray(v) ? (v as string[]).filter(s => typeof s === 'string') : []
}

export function numberArray(prim: Prim, name: string, time?: number): number[] {
  const v = attrVal(prim, name, time)
  return Array.isArray(v) ? (v as number[]).map(Number) : []
}

export function vecArray(prim: Prim, name: string, time?: number): number[][] {
  const v = attrVal(prim, name, time)
  return Array.isArray(v) ? (v as number[][]) : []
}

// matrix4d[] values: rows-nested number[4][4] per element → flat Matrix4
export function matrixArray(prim: Prim, name: string, time?: number): Matrix4[] {
  const v = attrVal(prim, name, time)
  if (!Array.isArray(v)) return []
  return (v as (number[] | number[][])[]).map(m =>
    (Array.isArray(m[0]) ? (m as number[][]).flat() : (m as number[])) as Matrix4)
}
