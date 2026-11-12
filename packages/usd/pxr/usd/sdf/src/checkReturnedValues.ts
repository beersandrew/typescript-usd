// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h, pxr/base/vt/value.h,
//  pxr/usd/sdf/data.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Read-only values handed out by scene-description reads, and a test-only
// check for the storage freezing cannot protect.
//
// Upstream returns field and attribute values by value: SdfData::Get copies
// the field's VtValue (pxr/usd/sdf/data.cpp:204-210), and a VtValue copy
// shares its held object until the first mutable access copies it
// (_GetMutableObj, pxr/base/vt/value.h:758-762; VtArray detaches in data(),
// pxr/base/vt/array.h:403). Here values are stored immutable and handed out
// shared (immutableValue.ts): SdfData.get/queryTimeSample, Layer.getField
// and the Usd attribute, attribute-query and metadata reads hand out
// deep-frozen values (_sdfHandOut), so a strict-mode write to one throws a
// TypeError at the write.
//
// With USD_CHECK_RETURNED_VALUES=1 in the environment (read once, when this
// module loads; off by default and in browsers), storage that freezing cannot
// protect (typed arrays, a VtArray's typed element storage, Map, Set) is
// copied when handed out and compared after each test
// (pxr/testing/checkReturnedValues.ts), reporting what changed with the
// stack of the read that handed it out.

import { Array as VtArray } from 'typescript-usd/vt'
import { SdfPath } from './path.ts'
import { sdfFreezeValue } from './immutableValue.ts'

const env = typeof process !== 'undefined' && process.env ? process.env : undefined

/** @internal Whether the checking mode is on (USD_CHECK_RETURNED_VALUES=1). */
export const _sdfCheckReturnedValues: boolean = env?.['USD_CHECK_RETURNED_VALUES'] === '1'

interface Snapshot {
  readonly changed: () => boolean
  readonly what: string
  readonly stack: string
}

const snapshots = new Map<object, Snapshot>()

function register(target: object, what: string, changed: () => boolean): void {
  if (snapshots.has(target)) return
  snapshots.set(target, { changed, what, stack: new Error('handed out here').stack ?? '' })
}

function bytesOf(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

// Keyed by the underlying buffer: cdata() hands out a fresh view of the same
// storage on each call.
function registerTyped(view: ArrayBufferView, what: string): void {
  if (snapshots.has(view.buffer)) return
  const copy = bytesOf(view).slice()
  register(view.buffer, what, () => {
    const now = bytesOf(view)
    if (now.length !== copy.length) return true
    for (let i = 0; i < copy.length; i++) if (now[i] !== copy[i]) return true
    return false
  })
}

// Frozen objects under which nothing needs recording: a later hand-out of
// the same value costs one lookup.
const nothingUnprotected = new WeakSet<object>()

// Records what freezing cannot protect in `value` (already frozen); returns
// whether there was nothing to record.
function registerUnprotected(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value !== 'object' || nothingUnprotected.has(value)) return true
  if (seen.has(value)) return false
  seen.add(value)
  if (value instanceof SdfPath) return true
  if (ArrayBuffer.isView(value)) { registerTyped(value, value.constructor.name); return false }
  if (value instanceof VtArray) {
    const storage = value.cdata()
    const what = `VtArray<${value.getElementType().getTypeName()}> storage`
    if (ArrayBuffer.isView(storage)) {
      registerTyped(storage as unknown as ArrayBufferView, what)
      return false
    }
    let pure = true
    for (const item of storage as readonly unknown[]) if (!registerUnprotected(item, seen)) pure = false
    if (pure) nothingUnprotected.add(value)
    return pure
  }
  if (value instanceof Map) {
    const copy = [...value]
    register(value, 'Map', () => value.size !== copy.length ||
      copy.some(([key, item]) => !value.has(key) || !Object.is(value.get(key), item)))
    for (const item of value.values()) registerUnprotected(item, seen)
    return false
  }
  if (value instanceof Set) {
    const copy = [...value]
    register(value, 'Set', () => value.size !== copy.length || copy.some(item => !value.has(item)))
    for (const item of value) registerUnprotected(item, seen)
    return false
  }
  let pure = Object.isFrozen(value)
  for (const key of Reflect.ownKeys(value)) {
    if (!registerUnprotected((value as Record<PropertyKey, unknown>)[key], seen)) pure = false
  }
  if (pure) nothingUnprotected.add(value)
  return pure
}

/** @internal The read-only form of a value a read hands out: deep-frozen
 * (immutableValue.ts). In checking mode, also record the storage freezing
 * cannot protect. Returns `value`. */
export function _sdfHandOut<T>(value: T): T {
  sdfFreezeValue(value)
  if (_sdfCheckReturnedValues) registerUnprotected(value, new Set())
  return value
}

/** @internal Test hook: the handed-out values changed since they were handed
 * out, then forget them all. */
export function _sdfCheckTakeMutations(): Array<{ what: string; stack: string }> {
  const changed: Array<{ what: string; stack: string }> = []
  for (const snapshot of snapshots.values()) {
    if (snapshot.changed()) changed.push({ what: snapshot.what, stack: snapshot.stack })
  }
  snapshots.clear()
  return changed
}
