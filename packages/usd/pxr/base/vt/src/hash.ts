// Ported from OpenUSD 26.11.1: pxr/base/vt/hash.cpp, pxr/base/vt/hash.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/base/vt/hash.h:22-68: VtHashValue(val) is TfHash()(val).
import { Hash as TfHash } from 'typescript-usd/tf'
import { VtValue } from './value.ts'

export const VtHashValue = (value: unknown): bigint => {
  // FAITHFULNESS-DEBT(vt-hash-value-vtvalue): upstream VtHashValue(VtValue)
  // is TfHash()(value): the TfHash code of hash_value(value) == GetHash()
  // (value.h:1310-1312), not GetHash() itself. Here a VtValue argument returns
  // its GetHash(), as callers treat VtHashValue(VtValue) as hashing the held
  // value. The end-state is this function always returning TfHash(value).
  if (value instanceof VtValue) return value.getHash()
  return TfHash(value)
}
