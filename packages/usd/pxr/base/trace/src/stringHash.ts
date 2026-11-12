// Ported from OpenUSD 26.11.1: pxr/base/trace/stringHash.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/stringHash.h:24-47.
export class TraceStringHash {
  static Hash(value: string): number {
    let hash = 5381
    for (let i = 0; i < value.length; i++) {
      hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0
    }
    return hash
  }
}
