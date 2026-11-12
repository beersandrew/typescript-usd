// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h, pxr/base/vt/value.h,
//  pxr/usd/sdf/data.cpp, pxr/usd/sdf/data.h, pxr/usd/sdf/path.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Immutable scene-description values: what SdfData stores and what reads hand
// out.
//
// Upstream stores one VtValue per field (pxr/usd/sdf/data.h:157-170) and
// SdfData::Get returns it by value (data.cpp:204-210). A VtValue copy shares
// its held object, and the first mutable access of a shared object copies it
// (_GetMutableObj, pxr/base/vt/value.h:758-762); VtArray detaches its shared
// buffer before a write (pxr/base/vt/array.h:403). Reads are therefore cheap,
// and nothing a caller does to its copy reaches the stored value.
//
// JavaScript objects have no copy-on-write, so stored values are made
// immutable instead and handed out without a copy:
// - a value is copied once when it is stored (as a VtValue is constructed
//   from the value given to SdfData::Set); a value that is already frozen is
//   shared as it is. A stored value is deep-frozen the first time a read
//   hands it out (freezing every value as it is parsed would cost the open a
//   pass over values that may never be read); internal readers of the
//   unfrozen store (the _getView paths) do not edit it, which the checking
//   mode verifies;
// - plain arrays, plain objects (dictionaries, list ops), Gf values and other
//   value objects are frozen (Object.freeze), so a write to a value a read
//   handed out throws a TypeError in strict-mode code;
// - a VtArray is frozen, which makes it read-only: its mutating methods throw,
//   Clone() gives a writable copy sharing the storage (array.ts);
// - SdfPath is immutable already (path.h) and keeps its lazily built text;
// - Map and Set cannot be frozen; reads hand out a copy of a stored Map or
//   Set, as before. Typed arrays cannot be frozen either; a VtArray's typed
//   storage is typed read-only (cdata()), and the test-only checking mode
//   (checkReturnedValues.ts) compares it after each test.
//
// Callers that want to edit a value they read copy it first (VtArray Clone()
// or slice(), `[...list]`, `{ ...dict }`, `new GfVec3f(v)`), as C++ code
// copies a `const VtValue&` to change it.

import { Array as VtArray, _GetTypeKind as vtTypeKind } from 'typescript-usd/vt'
import { SdfPath } from './path.ts'
import { sdfCloneValue } from './abstractData.ts'

function freezeElements(items: readonly unknown[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item !== null && typeof item === 'object') sdfFreezeValue(item)
  }
}

/** Deep-freeze `value` in place and return it. A frozen object is taken to
 * be frozen throughout and returned at once. Primitives, SdfPath, Map, Set
 * and typed arrays are returned unchanged. */
export function sdfFreezeValue<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  if (value instanceof SdfPath || value instanceof Map || value instanceof Set ||
      ArrayBuffer.isView(value)) return value
  switch (vtTypeKind(value)) {
    case 'array': {
      const array = value as unknown as VtArray<unknown>
      Object.freeze(array)
      // Element storage (strings, dictionaries, ...) is frozen with its
      // elements; typed storage holds numbers.
      const storage = array.cdata()
      if (!ArrayBuffer.isView(storage)) freezeElements(storage as readonly unknown[])
      return value
    }
    case 'list':
      Object.freeze(value)
      freezeElements(value as unknown as readonly unknown[])
      return value
    case 'dictionary':
      // A VtDictionary's entries are VtValues, copy-on-write already.
      Object.freeze(value)
      return value
  }
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) {
    const item = (value as Record<PropertyKey, unknown>)[key]
    if (item !== null && typeof item === 'object') sdfFreezeValue(item)
  }
  return value
}

/** The value to store for `value`: `value` itself when it is frozen (and
 * so shared), else a copy (sdfCloneValue) that the store owns. */
export function sdfStoredValue<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  return sdfCloneValue(value) as T
}

/** A stored value as a read hands it out, before it is frozen: the value
 * itself, or a copy of a Map or Set, which cannot be frozen. */
export function sdfHandOutValue<T>(value: T): T {
  if (value instanceof Map || value instanceof Set) return sdfCloneValue(value) as T
  return value
}
