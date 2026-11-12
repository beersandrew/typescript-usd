// Ported from OpenUSD 26.11.1: pxr/usd/usd/primData.cpp,
//  pxr/usd/usd/primDataHandle.h, pxr/usd/usd/testenv/testUsdErrors.py,
//  pxr/usd/usd/wrapPrim.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdErrors.py (registered as
// testUsdErrors, run with TF_FATAL_THROW=0).
//
// Upstream asks for the stage of a default-constructed (null) Usd.Prim
// through Usd._UnsafeGetStageForTesting (wrapPrim.cpp:170-174), which
// dereferences the prim data handle; the handle raises
// UsdExpiredPrimAccessError (primDataHandle.h:69-79, primData.cpp:272-278),
// surfaced in Python as Tf.CppException. typescript-usd has no
// default-constructed prim handle, so the null handle is replaced by the
// other case the same check covers: a handle whose prim data has expired.

import { describe, expect, it } from 'vitest'
import { Error as TfError } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'

describe('testUsdErrors', () => {
  it('test_Errors', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/X')
    expect(prim.getStage()).toBe(stage)
    expect(stage.removePrim('/X')).toBe(true)
    expect(prim.isValid()).toBe(false)
    expect(() => prim.getStage()).toThrow(TfError)
  })
})
