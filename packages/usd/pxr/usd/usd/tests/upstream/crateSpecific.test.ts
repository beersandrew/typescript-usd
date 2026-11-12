// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdCrateSpecific.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdCrateSpecific.py
// (registered as testUsdCrateSpecific).
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Layer, sdfCopySpec } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'

describe('testUsdCrateSpecific', () => {
  // Tests overwriting relationship target from source to target in crate
  // layers. This test checks that Sdf.CopySpec() works correctly with the
  // "procedural" dynamic creation of relationship children fields that the
  // crate data implementation does.
  it('test_SdfCopySpecWithRelationshipTargets', () => {
    const layerContent = `#usda 1.0

def "target" {}

def "source" {
    rel myrel
}

def "dest" {
    rel myrel = </target>
}
`
    const layer = Layer.createAnonymous('.usdc')
    layer.importFromString(layerContent)
    expect(layer.getRelationshipAtPath('/dest.myrel')!.getTargetPathList()
      .getAppliedItems().map(String)).toEqual(['/target'])
    expect(sdfCopySpec(layer, '/source', layer, '/dest')).toBe(true)
    expect(layer.getRelationshipAtPath('/dest.myrel')!.getTargetPathList()
      .getAppliedItems().map(String)).toEqual([])
  })

  // There was a bug (USD-10028) where a hash table in the crate file writer
  // used 'double' as a key and the default hash function, which on
  // clang/libc++ just returns the floating point bit pattern as an integer,
  // and the hash table just masks bits to produce an index.  This led to
  // essentially 100% collisions, and a hang on export of more than about
  // 30k samples.  This test just ensures we can write 100k samples.
  it('test_SamplesExportScalability', async () => {
    const stage = await Stage.open(Layer.createAnonymous())
    stage.definePrim('/test')
    const attr = stage.getPrim('/test')!.createAttribute('foo', 'float')
    const numSamples = 100_000
    for (let i = 0; i < numSamples; i++) attr.setTimeSample(i, i)
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'testUsdCrateSpecific'))
    try {
      const usdc = path.join(tmpDir, 'foo.usdc')
      expect(await stage.export(usdc)).toBe(true)
      expect(statSync(usdc).size).toBeGreaterThan(0)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 120_000)
})
