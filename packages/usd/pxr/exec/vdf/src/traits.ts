// Ported from OpenUSD 26.11.1: pxr/exec/vdf/traits.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/traits.h.
//
// VdfIsEqualityComparable<T> (traits.h:20-72) asks at compile time whether
// `T == T` is valid. TS has no such check on types, so it asks the value:
// primitives compare with ===; objects are comparable if they define Equals
// (the TS spelling of operator==, openexec-x1.md 4.1 "Operators") or equals
// (the Gf classes); arrays (std::vector, std::pair) are comparable if their
// elements are; Maps (std::map, std::unordered_map) if their keys and values
// are. An empty container has no element to ask; it is reported comparable.
// VdfByValueOrConstRef<T> (traits.h:74-104) is a parameter passing
// heuristic; every TS value is passed the same way, so it is `T`.

/** VdfIsEqualityComparable for the type of `value`. */
export function VdfIsEqualityComparable(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(VdfIsEqualityComparable)
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      if (!VdfIsEqualityComparable(k) || !VdfIsEqualityComparable(v)) {
        return false
      }
    }
    return true
  }
  const obj = value as { Equals?: unknown, equals?: unknown }
  return typeof obj.Equals === 'function' || typeof obj.equals === 'function'
}

/** `lhs == rhs` for values of an equality comparable type. */
export function Vdf_Equals(lhs: unknown, rhs: unknown): boolean {
  if (lhs === rhs) {
    return true
  }
  if (lhs === null || typeof lhs !== 'object' || rhs === null || typeof rhs !== 'object') {
    // NaN compares unequal, as it does in C++.
    return false
  }
  if (Array.isArray(lhs)) {
    return Array.isArray(rhs) && lhs.length === rhs.length &&
      lhs.every((x, i) => Vdf_Equals(x, rhs[i]))
  }
  if (lhs instanceof Map) {
    if (!(rhs instanceof Map) || lhs.size !== rhs.size) {
      return false
    }
    for (const [k, v] of lhs) {
      if (!rhs.has(k) || !Vdf_Equals(v, rhs.get(k))) {
        return false
      }
    }
    return true
  }
  const obj = lhs as { Equals?: (r: unknown) => boolean, equals?: (r: unknown) => boolean }
  if (typeof obj.Equals === 'function') {
    return obj.Equals(rhs)
  }
  if (typeof obj.equals === 'function') {
    return obj.equals(rhs)
  }
  return false
}

/** VdfByValueOrConstRef<T> (traits.h:96-104). */
export type VdfByValueOrConstRef<T> = T
