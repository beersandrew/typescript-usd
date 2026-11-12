// Ported from OpenUSD 26.11.1: pxr/base/vt/valueTransform.cpp,
//  pxr/base/vt/valueTransform.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Value-transform registry from OpenUSD v26.08
// pxr/base/vt/valueTransform.h:22-216.
import { Type as TfType } from 'typescript-usd/tf'
import { VtArray } from './array.ts'
import { VtArrayEdit } from './arrayEdit.ts'
import { VtValue } from './value.ts'

type Transform = (value: unknown, transform: unknown) => unknown
type ErasedTransform = (
  value: unknown,
  transformNested: (value: VtValue) => VtValue | undefined,
) => unknown | undefined
type Entry = { transform: Transform; arrays: boolean }

const typed = new Map<TfType, Map<TfType, Entry>>()
const erased = new Map<TfType, ErasedTransform>()

function registerTyped(
  objectType: TfType,
  transformType: TfType,
  transform: Transform,
  arrays: boolean,
): void {
  const byTransform = typed.get(objectType) ?? new Map<TfType, Entry>()
  byTransform.set(transformType, { transform, arrays })
  typed.set(objectType, byTransform)
}

function entryFor(value: VtValue, transformType: TfType): Entry | undefined {
  if (value.isArrayValued()) {
    const entry = typed.get(value.getElementType())?.get(transformType)
    return entry?.arrays ? entry : undefined
  }
  if (value.isArrayEditValued()) {
    const entry = typed.get(value.getElementType())?.get(transformType)
    return entry?.arrays ? entry : undefined
  }
  return typed.get(value.getType())?.get(transformType)
}

export class Vt_TransformImpl {
  static can(value: VtValue, transformType: TfType): boolean {
    return entryFor(value, transformType) !== undefined || erased.has(value.getType())
  }

  static try(
    value: VtValue,
    transformType: TfType,
    transformObject: unknown,
  ): VtValue | undefined {
    return VtValueTryTransform(value, transformType, transformObject)
  }
}

/** Low-level exact-type registration; array families are registered separately. */
export function Vt_RegisterTypedTransform(
  objectType: TfType, transformType: TfType, transform: Transform,
): void {
  registerTyped(objectType, transformType, transform, false)
}

export function Vt_RegisterTransformImpl(
  registerForArrays: boolean,
  objectType: TfType,
  transformType: TfType,
  transform: Transform,
): void {
  registerTyped(objectType, transformType, transform, registerForArrays)
}

export function VtRegisterTransformNoArrays(
  objectType: TfType, transformType: TfType, transform: Transform,
): void {
  Vt_RegisterTransformImpl(false, objectType, transformType, transform)
}

export function VtRegisterTransform(
  objectType: TfType, transformType: TfType, transform: Transform,
): void {
  Vt_RegisterTransformImpl(true, objectType, transformType, transform)
}

export function Vt_RegisterErasedTransform(
  objectType: TfType, transform: ErasedTransform,
): void {
  erased.set(objectType, transform)
}

export function VtRegisterErasedTransform(
  objectType: TfType, transform: ErasedTransform,
): void {
  Vt_RegisterErasedTransform(objectType, transform)
}

export const VtValueCanTransform = (
  value: VtValue, transformType: TfType,
): boolean => !value.IsEmpty() && Vt_TransformImpl.can(value, transformType)

export function _VtValueTypeCanTransform(type: TfType): boolean {
  if ((typed.get(type)?.size ?? 0) > 0 || erased.has(type)) return true
  const name = type.getTypeName()
  if (!name.endsWith('[]')) return false
  const elementName = name.slice(0, -2)
  for (const [objectType, transforms] of typed) {
    if (objectType.getTypeName() === elementName &&
        [...transforms.values()].some(entry => entry.arrays)) return true
  }
  return false
}

export function VtValueTryTransform(
  value: VtValue,
  transformType: TfType,
  transformObject?: unknown,
): VtValue | undefined {
  if (value.IsEmpty()) return undefined
  const entry = entryFor(value, transformType)
  if (entry) {
    if (value.isArrayValued()) {
      const source = value.Get<VtArray<unknown>>()
      return VtValue.createArray(new VtArray(
        source.toArray().map(item => entry.transform(item, transformObject)),
        source.getElementType(),
      ))
    }
    if (value.isArrayEditValued()) {
      const source = value.Get<VtArrayEdit<unknown>>()
      return VtValue.createArrayEdit(
        source._transformLiterals(item => entry.transform(item, transformObject)),
        value.getElementType(),
      )
    }
    return VtValue.create(
      entry.transform(value.Get<unknown>(), transformObject),
      value.getType(),
    )
  }

  const erasedTransform = erased.get(value.getType())
  if (!erasedTransform) return undefined
  const result = erasedTransform(value.Get<unknown>(), nested =>
    VtValueTryTransform(nested, transformType, transformObject))
  return result === undefined ? undefined : VtValue.create(result, value.getType())
}
