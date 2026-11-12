// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/testenv/testUsdUIBackdrop.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdUI/testenv/testUsdUIBackdrop.py
//
// testUsdUIBackdrop.py is in usdUI's testenv but is not registered in
// pxr/usd/usdUI/CMakeLists.txt (neither pxr_test_scripts nor
// pxr_register_test); it is ported here anyway. Its testenv ships the
// expected file as baseline/backdrop.usda (copied verbatim to
// fixtures/testUsdUIBackdrop/baseline/), compared in place of Save().
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Backdrop } from 'typescript-usd/usdUI'

const BASELINE = join(dirname(fileURLToPath(import.meta.url)),
  'fixtures', 'testUsdUIBackdrop', 'baseline', 'backdrop.usda')

describe('TestUsdUIBackdrop', () => {
  it('test_Basic', () => {
    const stage = Stage.createNew()

    const rootPrim = stage.definePrim('/ModelShading')
    const materialsPath = `${rootPrim.path}/Materials`
    const parentMaterialPath = `${materialsPath}/ParentMaterial`

    // Test Backdrop
    const backdrop = Backdrop.define(stage, `${parentMaterialPath}/Backdrop_1`)

    expect(backdrop.isValid()).toBe(true)

    // Test Description
    const descAttr = backdrop.getDescriptionAttr()
    expect(descAttr.isValid()).toBe(true)
    expect(descAttr.typeName).toBe('token')
    descAttr.set('Backdrop test description')

    // stage.GetRootLayer().Save()
    expect(stage.getRootLayer().exportToString()).toBe(readFileSync(BASELINE, 'utf8'))
  })
})
