// Ported from OpenUSD 26.11.1: pxr/base/vt/value.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Per-type operations for held values — the counterpart of VtValue's
// _TypeInfo (pxr/base/vt/value.h:150, _TypeInfoImpl value.h:537, the _info
// member value.h:1521). Upstream reaches copy, equality and array queries
// through one pointer per held type, with no type tests on the hot path.
//
// JavaScript values carry no such pointer, so the record is found from the
// value itself: value classes put theirs on their prototype under
// Vt_TypeInfoKey (VtArray, VtArrayEdit, VtDictionary and the Gf vector,
// matrix and quaternion bases), and everything else is classified once by
// typeof / Array.isArray / prototype, in that order. A VtValue looks its
// record up when it is given a value and keeps it.

import type { Type as TfType } from 'typescript-usd/tf'

/** What a held value is, for code outside VtValue that dispatches on it
 * (Sdf's value copy and equality). */
export type Vt_TypeKind =
  | 'primitive' // null, undefined, boolean, number, bigint, string, symbol, function
  | 'array' // VtArray
  | 'arrayEdit' // VtArrayEdit
  | 'dictionary' // VtDictionary
  | 'gf' // Gf vector, matrix or quaternion
  | 'list' // a plain JavaScript array
  | 'record' // a plain object (prototype Object.prototype)
  | 'object' // any other object

export interface Vt_TypeInfo {
  readonly kind: Vt_TypeKind
  /** The copy VtValue's copy constructor makes of a held value. */
  readonly copy: (value: unknown) => unknown
  /** Held-value equality, given VtValues of the same type. */
  readonly equal: (left: unknown, right: unknown) => boolean
  /** VtValue::IsArrayValued. */
  readonly isArray: boolean
  /** VtValue::GetArraySize for an array-valued value. */
  readonly arraySize: (value: unknown) => number
  /** VtValue::GetElementType for an array-valued value. */
  readonly elementType: (value: unknown) => TfType | undefined
}

export const Vt_TypeInfoKey: unique symbol = Symbol('Vt_TypeInfo')

/** Install `info` as the record of every value whose prototype chain
 * includes `prototype`. */
export function Vt_SetTypeInfo(prototype: object, info: Vt_TypeInfo): void {
  Object.defineProperty(prototype, Vt_TypeInfoKey, { value: info })
}

// Filled in by value.ts, which owns the generic copies (they recurse through
// VtValue).
const generic: { primitive?: Vt_TypeInfo; list?: Vt_TypeInfo; record?: Vt_TypeInfo; object?: Vt_TypeInfo } = {}

/** @internal Set by value.ts at load. */
export function Vt_SetGenericTypeInfos(infos: Required<typeof generic>): void {
  Object.assign(generic, infos)
}

/** Records of types that are not arrays share these. */
export const Vt_NotArray = { isArray: false, arraySize: (): number => 0, elementType: (): undefined => undefined } as const

/** Equality of objects with their own (Gf values, VtArray, ...); others by
 * identity. */
export function Vt_ObjectEqual(left: unknown, right: unknown): boolean {
  return right !== null && typeof right === 'object' &&
    typeof (left as { equals?: unknown }).equals === 'function'
    ? (left as { equals(other: unknown): boolean }).equals(right)
    : left === right
}

/** The type-info record for a held value. */
export function Vt_GetTypeInfo(value: unknown): Vt_TypeInfo {
  if (value === null || typeof value !== 'object') return generic.primitive!
  const info = (value as { [Vt_TypeInfoKey]?: Vt_TypeInfo })[Vt_TypeInfoKey]
  if (info !== undefined) return info
  if (Array.isArray(value)) return generic.list!
  if (Object.getPrototypeOf(value) === Object.prototype) return generic.record!
  return generic.object!
}

/** The kind of a held value; see Vt_TypeKind. */
export function Vt_GetTypeKind(value: unknown): Vt_TypeKind {
  return Vt_GetTypeInfo(value).kind
}
