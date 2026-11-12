// Ported from OpenUSD 26.11.1: pxr/base/vt/arrayEdit.cpp,
//  pxr/base/vt/arrayEdit.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { VtArray } from './array.ts'
// VtArrayEdit — port of OpenUSD v26.08 pxr/base/vt/arrayEdit.h. An edit is a composable sequence of array operations;
// composing over a dense array applies the weaker edit first, then the stronger.

export type ArrayEditOp<T> =
  | { kind: 'write'; value: T; index: number }
  | { kind: 'writeRef'; source: number; destination: number }
  | { kind: 'insert'; value: T; index: number | 'end' }
  | { kind: 'insertRef'; source: number; destination: number | 'end' }
  | { kind: 'erase'; index: number }
  | { kind: 'minSize'; size: number; fill: T | undefined }
  | { kind: 'setSize'; size: number; fill: T | undefined }
  | { kind: 'maxSize'; size: number }

const refIndex = (index: number, size: number): number | undefined => {
  const normalized = index < 0 ? index + size : index
  return normalized >= 0 && normalized < size ? normalized : undefined
}

const insertIndex = (index: number | 'end', size: number): number | undefined => {
  if (index === 'end') return size
  const normalized = index < 0 ? index + size : index
  return normalized >= 0 && normalized <= size ? normalized : undefined
}

// The element `resize` appends without a fill literal: upstream value-
// initializes it (arrayEdit.h:293-311, VtArray::resize). Editing a VtArray
// passes its element type's value-initialized element; a plain list carries
// no element type, so its first element stands in.
const valueInitialized = <T>(values: readonly T[], fill: T | undefined, typed?: { zero: T }): T => {
  if (fill !== undefined) return fill
  if (typed) return typed.zero
  const exemplar = values[0]
  if (typeof exemplar === 'string') return '' as T
  if (typeof exemplar === 'boolean') return false as T
  return 0 as T
}

// Literal element equality (the element type's operator==): value objects
// compare with their equals method.
const literalsEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const equals = (a as { equals?: (other: unknown) => boolean }).equals
  return typeof equals === 'function' && equals.call(a, b)
}

export class VtArrayEdit<T> {
  readonly #ops: readonly ArrayEditOp<T>[]

  constructor(ops: readonly ArrayEditOp<T>[] = []) { this.#ops = [...ops] }

  isIdentity(): boolean { return this.#ops.length === 0 }

  getLiterals(): readonly T[] {
    return this.#ops.flatMap(op => 'value' in op ? [op.value] : [])
  }

  getMutableLiterals(): T[] { return [...this.getLiterals()] }

  streamCustom(streamElem: (value: T) => string = String): string {
    return this.#ops.map(op => {
      const fields = Object.entries(op)
        .filter(([key]) => key !== 'kind')
        .map(([key, value]) => `${key}=${key === 'value' ? streamElem(value as T) : String(value)}`)
      return `${op.kind}(${fields.join(', ')})`
    }).join('; ')
  }

  _serialization(): readonly ArrayEditOp<T>[] { return this.#ops }

  _transformLiterals(transform: (value: T) => unknown): VtArrayEdit<unknown> {
    return new VtArrayEdit(this.#ops.map(op => {
      if ('value' in op) return { ...op, value: transform(op.value) }
      if ('fill' in op && op.fill !== undefined) {
        return { ...op, fill: transform(op.fill) }
      }
      return op
    }))
  }

  equals(other: VtArrayEdit<T>): boolean {
    if (this.#ops.length !== other.#ops.length) return false
    return this.#ops.every((op, index) => {
      const rhs = other.#ops[index]
      if (!rhs || op.kind !== rhs.kind) return false
      const leftRecord = op as unknown as Record<string, unknown>
      const rightRecord = rhs as unknown as Record<string, unknown>
      const keys = Object.keys(leftRecord)
      return keys.length === Object.keys(rightRecord).length &&
        keys.every(key => literalsEqual(leftRecord[key], rightRecord[key]))
    })
  }

  composeOver(weaker: VtArrayEdit<T>): VtArrayEdit<T>
  composeOver(weaker: VtArray<T>): VtArray<T>
  composeOver(weaker: readonly T[]): T[]
  composeOver(weaker: VtArrayEdit<T> | VtArray<T> | readonly T[]): VtArrayEdit<T> | VtArray<T> | T[] {
    if (weaker instanceof VtArrayEdit) {
      return new VtArrayEdit([...weaker.#ops, ...this.#ops])
    }
    // Editing a VtArray yields a VtArray of the same element type.
    if (weaker instanceof VtArray) {
      const elementType = weaker.getElementType()
      return new VtArray(this.#apply(weaker.toArray(), {
        zero: VtArray._valueInitializedElement<T>(elementType),
      }), elementType)
    }
    return this.#apply(weaker)
  }

  #apply(weaker: readonly T[], typed?: { zero: T }): T[] {
    const result = [...weaker]
    for (const op of this.#ops) {
      switch (op.kind) {
        case 'write': {
          const index = refIndex(op.index, result.length)
          if (index !== undefined) result[index] = op.value
          break
        }
        case 'writeRef': {
          const source = refIndex(op.source, result.length)
          const destination = refIndex(op.destination, result.length)
          if (source !== undefined && destination !== undefined) {
            result[destination] = result[source]!
          }
          break
        }
        case 'insert': {
          const index = insertIndex(op.index, result.length)
          if (index !== undefined) result.splice(index, 0, op.value)
          break
        }
        case 'insertRef': {
          const source = refIndex(op.source, result.length)
          const destination = insertIndex(op.destination, result.length)
          if (source !== undefined && destination !== undefined) {
            result.splice(destination, 0, result[source]!)
          }
          break
        }
        case 'erase': {
          const index = refIndex(op.index, result.length)
          if (index !== undefined) result.splice(index, 1)
          break
        }
        case 'minSize': {
          if (op.size < 0 || result.length >= op.size) break
          const fill = valueInitialized(result, op.fill, typed)
          while (result.length < op.size) result.push(fill)
          break
        }
        case 'setSize': {
          if (op.size < 0) break
          if (result.length > op.size) result.length = op.size
          else {
            const fill = valueInitialized(result, op.fill, typed)
            while (result.length < op.size) result.push(fill)
          }
          break
        }
        case 'maxSize':
          if (op.size >= 0 && result.length > op.size) result.length = op.size
          break
      }
    }
    return result
  }
}

/** OpenUSD v26.08 pxr/base/vt/arrayEdit.h:231-236 hash access shim. */
export class Vt_ArrayEditHashAccess {
  static append<T>(edit: VtArrayEdit<T>): string {
    return JSON.stringify(edit._serialization())
  }
}

export function Vt_ArrayEditStreamImpl<T>(edit: VtArrayEdit<T>): string {
  return edit.streamCustom()
}
