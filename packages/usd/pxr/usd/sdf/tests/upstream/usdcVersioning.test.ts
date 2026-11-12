// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfUsdcVersioning.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfUsdcVersioning.cpp (OpenUSD 26.11.1),
// registered with PXR_USDC_EMIT_DEPRECATION_WARNINGS=1
// (pxr/usd/sdf/CMakeLists.txt:818-826). Input:
// fixtures/testSdfUsdcVersioning/deprecated_0_7_0.usd, copied byte-for-byte
// unmodified from pxr/usd/sdf/testenv/testSdfUsdcVersioning/ (Pixar, licensed
// under the terms in OpenUSD's LICENSE.txt, https://openusd.org/license); the
// test works on a copy in a temporary directory, as upstream works in its
// testenv copy.
//
// Upstream releases each layer by dropping its last SdfLayerRefPtr and checks
// SdfLayer::Find no longer finds it. The layer registry holds weak references
// (layerRegistry.ts), so a dropped layer is released by collecting it here.
// SdfLayer::CreateNew("current.usdc") + Save is an anonymous usdc layer
// exported to that path.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
// Importing typescript-usd/usd registers the crate (.usdc) file format.
import 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'
import { TfDiagnosticTrap } from 'typescript-usd/tf'

setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc') as () => void
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
async function collect(ref: WeakRef<object>): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    await tick()
    gc()
    await tick()
    if (ref.deref() === undefined) return true
  }
  return false
}

let dir = ''
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'testSdfUsdcVersioning-'))
  copyFileSync(
    new URL('./fixtures/testSdfUsdcVersioning/deprecated_0_7_0.usd', import.meta.url),
    path.join(dir, 'deprecated_0_7_0.usd'))
})
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })
afterEach(() => { vi.unstubAllEnvs() })

const deprecatedWarnings = (trap: TfDiagnosticTrap) =>
  trap.getWarnings().filter(w => w.getCommentary().includes('deprecated version')).length

describe('testSdfUsdcVersioning', () => {
  it('warns on deprecated versions until the file is exported, and never on current ones', async () => {
    vi.stubEnv('PXR_USDC_EMIT_DEPRECATION_WARNINGS', '1')
    const deprecated = path.join(dir, 'deprecated_0_7_0.usd')
    {
      // A deprecation warning when opening a crate file with a deprecated
      // version (older than 0.8.0).
      const trap = new TfDiagnosticTrap()
      let layer = await Layer.findOrOpen(deprecated)
      expect(layer).toBeTruthy()
      expect(deprecatedWarnings(trap)).toBe(1)
      trap.clear()
      const ref = new WeakRef<object>(layer!)
      layer = undefined
      expect(await collect(ref)).toBe(true)
    }
    {
      // Export()ing to the layer's resolved path upgrades the file version.
      expect(Layer.find(deprecated)).toBeUndefined()
      const trap = new TfDiagnosticTrap()
      let layer = await Layer.findOrOpen(deprecated)
      expect(layer).toBeTruthy()
      expect(await layer!.export(layer!.resolvedPath)).toBe(true)
      trap.clear()
      const ref = new WeakRef<object>(layer!)
      layer = undefined
      expect(await collect(ref)).toBe(true)
    }
    {
      // Now that we Export()ed to upgrade, we should see no warnings.
      expect(Layer.find(deprecated)).toBeUndefined()
      const trap = new TfDiagnosticTrap()
      const layer = await Layer.findOrOpen(deprecated)
      expect(layer).toBeTruthy()
      expect(deprecatedWarnings(trap)).toBe(0)
      trap.clear()
    }

    // No warnings reading a current version.
    const current = path.join(dir, 'current.usdc')
    {
      let newLayer: Layer | undefined = Layer.createAnonymous('.usdc')
      expect(await newLayer.export(current)).toBe(true)
      newLayer = undefined
    }
    expect(Layer.find(current)).toBeUndefined()
    const trap = new TfDiagnosticTrap()
    const layer = await Layer.findOrOpen(current)
    expect(layer).toBeTruthy()
    expect(trap.hasWarnings()).toBe(false)
    trap.clear()
  })
})
