// Ported from OpenUSD 26.11.1: pxr/base/vt/streamOut.cpp,
//  pxr/base/vt/streamOut.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.08 pxr/base/vt/streamOut.h:22-73.
import { VtArray, Vt_ShapeData } from './array.ts'
import { VtValue } from './value.ts'

const format = (value: unknown): string => {
  if (value instanceof VtValue) return value.IsEmpty() ? '' : format(value.Get())
  if (value instanceof VtArray) return VtStreamOutArray(value)
  if (Array.isArray(value)) return `[${value.map(format).join(', ')}]`
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export const Vt_StreamOutGeneric = (value: unknown): string =>
  `<${typeof value} @ ${String(value)}>`
export const Vt_StreamOutImpl = (value: unknown): string => format(value)
export const VtStreamOut = (value: unknown): string => format(value)
export function VtStreamOutArray<T>(
  value: VtArray<T> | readonly T[],
  shape?: Vt_ShapeData,
): string {
  const data = value instanceof VtArray ? value.toArray() : [...value]
  if (!shape || shape.getRank() === 1) return `[${data.map(format).join(', ')}]`
  return `[${data.map(format).join(', ')}]`
}
