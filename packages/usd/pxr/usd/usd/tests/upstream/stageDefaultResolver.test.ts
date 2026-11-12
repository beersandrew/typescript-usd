// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdStageDefaultResolver.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdStageDefaultResolver.py
// (26.11.1), registered as testUsdStageDefaultResolver.
//
// TypeScript encoding: Usd.Stage.CreateNew(path) + Save becomes an in-memory
// stage whose root layer is exported to that path (no Stage.CreateNew(identifier) here), run in a
// scratch working directory as upstream runs in its test directory.
// Ar.SetPreferredResolver('ArDefaultResolver') is the default here: no other
// primary resolver is registered.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DefaultResolver as ArDefaultResolver } from 'typescript-usd/ar'
import { Stage } from 'typescript-usd/usd'

describe('testUsdStageDefaultResolver', () => {
  let scratch = ''
  const cwd = process.cwd()
  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'testUsdStageDefaultResolver-'))
    process.chdir(scratch)
  })
  afterEach(() => {
    ArDefaultResolver.setDefaultSearchPath([])
    process.chdir(cwd)
    rmSync(scratch, { recursive: true, force: true })
  })

  // testUsdStageDefaultResolver.py:51-56
  const checkPrimAttrValue = (stage: Stage, primPath: string, attr: string, val: unknown) => {
    const prim = stage.getPrim(primPath)
    expect(prim?.isValid()).toBe(true)
    const a = prim!.getAttr(attr)
    expect(a?.isValid()).toBe(true)
    expect(a!.get()).toBe(val)
  }

  // testUsdStageDefaultResolver.py:19-48 test_StageReload
  it('test_StageReload', async () => {
    const createTestRef = async (stagePath: string, strVal: string) => {
      const stage = Stage.createNew()
      const prim = stage.definePrim('/test')
      stage.setDefaultPrim(prim)
      const attr = prim.createAttribute('testStr', 'string')
      attr.set(strVal)
      expect(await stage.getRootLayer().export(stagePath)).toBe(true)
    }

    ArDefaultResolver.setDefaultSearchPath(['dirA'])

    await createTestRef('dirA/layer.usda', 'A')
    await createTestRef('dirB/layer.usda', 'B')

    const authoring = Stage.createNew()
    const world = authoring.definePrim('/world')
    authoring.setDefaultPrim(world)
    world.getReferences().addReference('layer.usda')
    expect(await authoring.getRootLayer().export('reload.usda')).toBe(true)
    const stage = (await Stage.open('reload.usda'))!

    checkPrimAttrValue(stage, '/world', 'testStr', 'A')

    // Updating the default search path triggers the stage to process the
    // resolver changed notice and update.
    ArDefaultResolver.setDefaultSearchPath(['dirB'])
    await stage.flushChanges()
    checkPrimAttrValue(stage, '/world', 'testStr', 'B')
  })
})
