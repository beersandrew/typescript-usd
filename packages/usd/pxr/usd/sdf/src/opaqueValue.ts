// Ported from OpenUSD 26.11.1: pxr/usd/sdf/opaqueValue.cpp,
//  pxr/usd/sdf/opaqueValue.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/opaqueValue.{h,cpp}: the value type of opaque and
// group typed attributes, which carry no authored value.

export class SdfOpaqueValue {
  // operator== (opaqueValue.h): all opaque values are equal.
  equals(other: unknown): boolean { return other instanceof SdfOpaqueValue }
  // operator<< (opaqueValue.cpp:27-31).
  toString(): string { return 'OpaqueValue' }
}
