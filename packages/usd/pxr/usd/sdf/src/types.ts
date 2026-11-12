// Ported from OpenUSD 26.11.1: pxr/usd/sdf/types.cpp, pxr/usd/sdf/types.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Special authored value types from pxr/usd/sdf/types.h.

/** An authored opinion that explicitly represents having no value. */
export class SdfValueBlock {
  equals(other: unknown): boolean { return other instanceof SdfValueBlock }
  toString(): string { return 'Sdf.ValueBlock()' }
}

/** A default opinion that suppresses weaker animation but not defaults. */
export class SdfAnimationBlock {
  equals(other: unknown): boolean { return other instanceof SdfAnimationBlock }
  toString(): string { return 'Sdf.AnimationBlock()' }
}

// OpenUSD v26.08 SdfUnregisteredValue retains the text representation of a
// field unknown to SdfSchema (pxr/usd/sdf/types.h:486-527). JavaScript needs
// the parsed value as well as its lexical type so consumers do not have to
// recover a type from the runtime value shape.
export class SdfUnregisteredValue {
  constructor(readonly value: unknown, readonly typeName: string) {}
}
