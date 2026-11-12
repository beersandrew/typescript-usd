// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfDefaultInitAllocator.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfDefaultInitAllocator.cpp
//
// Out of scope: the upstream test checks C++ allocator mechanics with no TS
// counterpart. It resizes a std::vector<int> down and back up and asserts
// that std::allocator value-initializes the regrown elements to 0, while
// Vdf_DefaultInitAllocator leaves the previous contents of the reused memory
// in place (testVdfDefaultInitAllocator.cpp:16-51). A JS array keeps no
// memory beyond its length, so neither outcome can be observed. The TS port
// of Vdf_DefaultInitAllocator (pxr/exec/vdf/src/defaultInitAllocator.ts) keeps
// only what is observable: which element its construct() yields. The checks
// below exercise that, against defaultInitAllocator.ts's documented contract;
// they do not derive from upstream assertions.

import { describe, expect, it } from 'vitest'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vdf_DefaultInitAllocator } from '../../src/defaultInitAllocator.ts'

describe('testVdfDefaultInitAllocator', () => {
  it('construct with arguments forwards them; without, default-initializes', () => {
    const allocator = new Vdf_DefaultInitAllocator<number>(VtValueTypes.int)
    expect(allocator.construct(7)).toBe(7)
    expect(allocator.construct()).toBe(0)
    expect(new Vdf_DefaultInitAllocator<string>(VtValueTypes.string).construct()).toBe('')
  })
})
