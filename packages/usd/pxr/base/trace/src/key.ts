// Ported from OpenUSD 26.11.1: pxr/base/trace/key.cpp, pxr/base/trace/key.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/key.h:26-81.
export class TraceKey {
  constructor(readonly value: string) {}
  GetString(): string { return this.value }
  toString(): string { return this.value }
}
