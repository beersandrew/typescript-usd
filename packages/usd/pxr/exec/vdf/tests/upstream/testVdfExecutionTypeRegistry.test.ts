// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfExecutionTypeRegistry.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfExecutionTypeRegistry.cpp
//
// The TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry) body runs when the
// registry singleton is first constructed, as upstream; main()'s TF_AXIOMs
// are expect() calls. The test's C++ types are TS classes named with TfType:
// A defines operator== (Equals), B does not. The container types are JS
// arrays and Maps named by their C++ spelling.

import { describe, expect, it } from 'vitest'
import { TfErrorMark, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { VdfExecutionTypeRegistry } from '../../src/executionTypeRegistry.ts'
import { VdfIndexedData } from '../../src/indexedData.ts'

// assumption: copy-ctor ok (also assumed elsewhere)
class A {
  _m: number
  constructor(a = 0, b = 0) { this._m = a + b }
  Equals(rhs: A): boolean { return this._m === rhs._m }
}

class B {
  _m: number
  constructor(m = 0) { this._m = m }
}

const AType = TfType.define('A')
const BType = TfType.define('B')

const registrationResults: boolean[] = []

TfRegistryManager.add('VdfExecutionTypeRegistry', () => {
  const mark = new TfErrorMark()

  // Register a fallback for type A.
  VdfExecutionTypeRegistry.define(AType, new A(4700, 11))
  registrationResults.push(mark.isClean())

  // Register a fallback for type B.
  VdfExecutionTypeRegistry.define(BType, new B(Math.fround(0.815)))
  registrationResults.push(mark.isClean())

  // Register a different fallback value for type A. This fails a verify,
  // since A is equality comparable.
  VdfExecutionTypeRegistry.define(AType, new A(4700, 12))
  registrationResults.push(!mark.isClean())
  mark.clear()

  VdfExecutionTypeRegistry.define(VtValueTypes.int, 28)
  registrationResults.push(mark.isClean())

  // Register a different fallback value for type B. B is not equality
  // comparable, so the mismatch is not detected.
  VdfExecutionTypeRegistry.define(BType, new B())
  registrationResults.push(mark.isClean())

  // Register container types for A, which is equality comparable.
  VdfExecutionTypeRegistry.define(TfType.define('VdfIndexedData<A>'), new VdfIndexedData<A>())
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::pair<A, A>'), [new A(), new A()])
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::vector<A>'), [] as A[])
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::map<int, A>'), new Map<number, A>())
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::unordered_map<int, A>'), new Map<number, A>())
  registrationResults.push(mark.isClean())

  // Register container types for B, which is not equality comparable.
  VdfExecutionTypeRegistry.define(TfType.define('VdfIndexedData<B>'), new VdfIndexedData<B>())
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::pair<B, B>'), [new B(), new B()])
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::vector<B>'), [] as B[])
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::map<int, B>'), new Map<number, B>())
  registrationResults.push(mark.isClean())
  VdfExecutionTypeRegistry.define(TfType.define('std::unordered_map<int, B>'), new Map<number, B>())
  registrationResults.push(mark.isClean())
})

describe('testVdfExecutionTypeRegistry', () => {
  it('main', () => {
    const r = VdfExecutionTypeRegistry.GetInstance()

    // The TF_AXIOMs of the registry function.
    expect(registrationResults).toEqual(new Array(15).fill(true))

    const i = r.getFallback<number>(VtValueTypes.int)
    expect(i === 28).toBe(true)

    const a = r.getFallback<A>(AType)
    expect(a._m === 4711).toBe(true)

    const b = r.getFallback<B>(BType)
    expect(b._m === Math.fround(0.815)).toBe(true)
  })
})
