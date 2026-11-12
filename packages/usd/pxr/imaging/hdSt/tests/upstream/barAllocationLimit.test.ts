// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStBarAllocationLimit.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// pxr/imaging/hdSt/testenv/testHdStBarAllocationLimit.cpp (OpenUSD 26.11.1):
// draws one basis curve whose points exceed the VBO size limit
// (HD_MAX_VBO_SIZE=2^28, TF_DEBUG=HD_SAFE_MODE; CMakeLists.txt:643-655) and
// compares the image with testenv/testHdStBarAllocationLimit/baseline/
// testHdStBarAllocationLimit.png, with a clean error mark. It needs
// HdSt_UnitTestGLDrawing / HdSt_TestDriver, HdUnitTestDelegate::
// AddBasisCurves and a rendering Hgi, none of which this Node test has.

import { describe, expect, it } from 'vitest'

describe('testHdStBarAllocationLimit', () => {
  it('renders a curve larger than the VBO limit (testHdStBarAllocationLimit.cpp:91-196)', () => {
    expect('HdSt_TestDriver with basis curves and an image compare').toBe('available')
  })
})
