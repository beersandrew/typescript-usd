// Ported from OpenUSD 26.11.1: pxr/base/trace/dynamicKey.cpp,
//  pxr/base/trace/dynamicKey.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/dynamicKey.h:25-75.
import { TraceStaticKeyData } from './staticKeyData.ts'
import { TraceStringHash } from './stringHash.ts'

export class TraceDynamicKey {
  readonly #data: TraceStaticKeyData
  constructor(readonly name: string) { this.#data = new TraceStaticKeyData(name) }
  Hash(): number { return TraceStringHash.Hash(this.name) }
  getData(): TraceStaticKeyData { return this.#data }
  Equals(other: TraceDynamicKey): boolean { return this.name === other.name }
}
