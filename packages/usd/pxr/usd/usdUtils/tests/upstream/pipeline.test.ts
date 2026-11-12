// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsPipeline.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsPipeline.py
// (registered as testUsdUtilsPipeline). The testenv directory
// testenv/testUsdUtilsPipeline (BottleMedicalDefaultPrim.usd,
// BottleMedicalRootPrim.usd, BottleMedicalSameName.usd) is copied unmodified
// into fixtures/testUsdUtilsPipeline (Copyright Pixar, TOST 1.0
// license, https://openusd.org/license). Upstream runs in a copy of
// that directory, so each test copies the fixtures into a temporary
// directory first.
//
// API mapping: Sdf.Layer.FindOrOpen is the asynchronous Layer.findOrOpen;
// UsdUtils.GetModelNameFromRootLayer is UsdUtilsGetModelNameFromRootLayer.

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { UsdUtilsGetModelNameFromRootLayer } from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsPipeline')

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsPipeline'))
  cpSync(TESTENV, dir, { recursive: true })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
const file = (name: string): string => path.join(dir, name)

describe('TestUsdUtilsPipeline', () => {
  it('test_Basic', async () => {
    const lyr1 = await Layer.findOrOpen(file('BottleMedicalDefaultPrim.usd'))
    expect(lyr1).toBeTruthy()
    expect(UsdUtilsGetModelNameFromRootLayer(lyr1!)).toBe('BottleMedical')

    const lyr2 = await Layer.findOrOpen(file('BottleMedicalSameName.usd'))
    expect(lyr2).toBeTruthy()
    expect(UsdUtilsGetModelNameFromRootLayer(lyr2!)).toBe('BottleMedicalSameName')

    const lyr3 = await Layer.findOrOpen(file('BottleMedicalRootPrim.usd'))
    expect(lyr3).toBeTruthy()
    expect(UsdUtilsGetModelNameFromRootLayer(lyr3!)).toBe('BottleMedical')
  })
})
