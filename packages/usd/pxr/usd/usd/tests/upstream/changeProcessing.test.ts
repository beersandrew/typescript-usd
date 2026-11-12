// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdChangeProcessing.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdChangeProcessing.py
// (registered as testUsdChangeProcessing). Upstream runs each function in
// one working directory; here each case runs in its own scratch directory so
// the files Usd.Stage.CreateNew writes do not collide between cases.
//
// API mapping:
// - Usd.Stage.CreateInMemory is Stage.createNew().
// - Usd.Stage.CreateNew(path): typescript-usd has no UsdStage::CreateNew /
//   SdfLayer::CreateNew; an empty layer is exported to the path, opened
//   with Layer.findOrOpen and Stage.open(layer).
// - layer.subLayerPaths.append(p) is Layer.insertSubLayerPath(p).
// - Change processing completes before `await stage.flushChanges()`
//   returns; upstream processes changes synchronously within the edit.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { ErrorType as PcpErrorType } from 'typescript-usd/pcp'
import { ColorSpaceAPI, EditContext, Stage, StagePopulationMask } from 'typescript-usd/usd'

// Usd.Stage.CreateNew(path).
async function createNewStage(identifier: string): Promise<Stage> {
  const empty = Layer.createAnonymous()
  empty.importFromString('#usda 1.0\n')
  await empty.export(identifier)
  const layer = (await Layer.findOrOpen(identifier))!
  return Stage.openMasked(layer, StagePopulationMask.all())
}

async function testStageErrors(stageAndErrorCounts: Array<[Stage, number]>): Promise<void> {
  for (const [stage, errorCount] of stageAndErrorCounts) {
    await stage.flushChanges()
    const errors = stage.getCompositionErrors()
    expect(errors.length).toBe(errorCount)

    for (let i = 0; i < errorCount; i++) {
      expect(errors[i]!.errorType).toBe(PcpErrorType.SublayerCycle)
    }
  }
}

describe('testUsdChangeProcessing', () => {
  let cwd: string
  let scratch: string
  beforeEach(() => {
    cwd = process.cwd()
    scratch = mkdtempSync(path.join(tmpdir(), 'testUsdChangeProcessing-'))
    process.chdir(scratch)
  })
  afterEach(() => {
    process.chdir(cwd)
    rmSync(scratch, { recursive: true, force: true })
  })

  it('RenamingSpec', async () => {
    // Test renaming a SdfPrimSpec.
    const stage = Stage.createNew()
    const layer = stage.getRootLayer()

    const parent = stage.definePrim('/parent')
    stage.definePrim('/parent/child')

    expect(stage.getPrim('/parent')).toBeDefined()
    expect(stage.getPrim('/parent/child')).toBeDefined()
    layer.getPrimAtPath(parent.path)!.setName('parent_renamed')
    await stage.flushChanges()
    expect(stage.getPrim('/parent_renamed')).toBeDefined()
    expect(stage.getPrim('/parent_renamed/child')).toBeDefined()
  })

  it('ChangeInsignificantSublayer', async () => {
    // Test making changes after adding an insignificant sublayer.
    const stage = Stage.createNew()
    const layer = stage.getRootLayer()

    const insignificantSublayer = Layer.createAnonymous('.usda')
    expect(insignificantSublayer.isEmpty()).toBe(true)

    layer.insertSubLayerPath(insignificantSublayer.identifier)
    await stage.flushChanges()
    expect(stage.getUsedLayers()).toContain(insignificantSublayer)

    const ctx = new EditContext(stage, insignificantSublayer)
    try {
      const prim = stage.definePrim('/Foo')
      expect(prim !== undefined && prim.isValid()).toBe(true)
    } finally {
      ctx.close()
    }
  })

  it('AddSublayerWithCycle', async () => {
    // Tests that adding a sublayer resulting in a cycle produces warnings
    const root = await createNewStage('root.usda')
    const a = await createNewStage('a.usda')
    const b = await createNewStage('b.usda')

    root.getRootLayer().insertSubLayerPath('b.usda')
    b.getRootLayer().insertSubLayerPath('a.usda')

    // Initial sanity test, there should be no errors on any stage
    await testStageErrors([[root, 0], [a, 0], [b, 0]])

    // Add the sublayer which creates a cycle in all stages
    a.getRootLayer().insertSubLayerPath('b.usda')
    await testStageErrors([[root, 1], [a, 1], [b, 1]])
  })

  it('UnmuteWithCycle', async () => {
    // Tests that unmuting a sublayer resulting in a cycle produces warnings
    const root = await createNewStage('root.usda')
    const a = await createNewStage('a.usda')
    const b = await createNewStage('b.usda')

    // Mute layer b on the root stage, this will prevent a cycle from being
    // created while the sublayers are assembled
    await root.muteLayer(b.getRootLayer().identifier)

    root.getRootLayer().insertSubLayerPath('b.usda')
    b.getRootLayer().insertSubLayerPath('a.usda')
    a.getRootLayer().insertSubLayerPath('b.usda')

    // Initial sanity test, there should be no errors on root
    await testStageErrors([[root, 0]])

    // Unmute layer b creating a cycle on root
    await root.unmuteLayer(b.getRootLayer().identifier)
    await testStageErrors([[root, 1]])

    // Mute the layer ensuring that the cycle has been removed
    await root.muteLayer(b.getRootLayer().identifier)
    await testStageErrors([[root, 0]])
  })

  it('SublayerOperationProcessingApiSchema', async () => {
    // Tests that sublayer operation processing correctly updates changes to
    // a prim's api schema
    const entry = await createNewStage('entry.usda')
    const foo = entry.definePrim('/foo')
    expect(foo.hasAPI(ColorSpaceAPI.typeName)).toBe(false)

    const model = await createNewStage('model.usda')
    const prim = model.overridePrim('/foo')
    ColorSpaceAPI.apply(prim)
    expect(prim.hasAPI(ColorSpaceAPI.typeName)).toBe(true)

    entry.getRootLayer().insertSubLayerPath('model.usda')
    await entry.flushChanges()

    expect(foo.hasAPI(ColorSpaceAPI.typeName)).toBe(true)
  })

  it('SublayerOperationProcessingActive', async () => {
    const entry = await createNewStage('entry.usda')
    const foo = entry.definePrim('/foo')

    const model = await createNewStage('model.usda')
    const prim = model.overridePrim('/foo')
    await prim.setActive(false)

    expect(foo.isActive).toBe(true)
    entry.getRootLayer().insertSubLayerPath('model.usda')
    await entry.flushChanges()
    expect(foo.isActive).toBe(false)
  })
})
