// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The surface's value boundary (packages/usd/docs/style-guide.md rule 10):
// the only place values change shape between the core and the surface.
//
// Reads: a VtArray is handed out as its read-only storage (VtArray::cdata(),
// pxr/base/vt/array.h), zero-copy: a typed array for numeric and Gf element
// types, else a frozen element array. Other values are the core's (numbers,
// strings, booleans, Gf values, SdfAssetPath).
// Writes: a non-array Iterable is spread into an array; the core's setters
// convert plain shapes by the attribute's declared type.
import { Array as VtArray } from 'typescript-usd/vt'
import type { _ReadonlyTyped as ReadonlyTyped, _TypedBuffer as TypedBuffer } from 'typescript-usd/vt'

/**
 * The typed arrays numeric array values are read as.
 *
 * @upstream VtArray
 */
export type TypedArray = TypedBuffer

/**
 * A value as reads hand it out: typed arrays are read-only views of the
 * core's storage.
 *
 * @upstream VtArray::cdata
 */
export type ReadonlyValue<T> = T extends TypedBuffer ? ReadonlyTyped<T> : T extends readonly (infer E)[] ? readonly E[] : T

/**
 * What a setter accepts for a value of type `T`: the value itself, or for
 * array types any Iterable of the elements (tuples for vector elements).
 *
 * @upstream VtArray::assign
 */
export type ValueInput<T> = T | (T extends TypedBuffer | readonly unknown[] ? Iterable<unknown> : never)

/** @internal */
export function fromCoreValue<T>(value: unknown): ReadonlyValue<T> | undefined {
  if (value instanceof VtArray) return value.cdata() as ReadonlyValue<T>
  return value as ReadonlyValue<T> | undefined
}

/** @internal */
export function toCoreValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value)) return value
  if (Symbol.iterator in value) return Array.from(value as Iterable<unknown>)
  return value
}

/** @internal Rule 12: a file argument as the resolver identifier the core
 * takes. A `file:` URL becomes its path (the core's default resolver, like
 * ArDefaultResolver, takes filesystem paths); any other URL its href. */
export function identifierOf(file: URL | string): string {
  if (typeof file === 'string') return file
  return file.protocol === 'file:' ? decodeURIComponent(file.pathname) : file.href
}
