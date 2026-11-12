// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.08 pxr/usd/usd/prim.cpp:1158-1210 — property construction
// uses UsdStage::_GetDefiningSpecType, including Sdf relationship specs whose
// type is not represented by a typeName field in crate data.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from '../../src/index.ts'

const variantFixture = fileURLToPath(new URL(
  '../../../pcp/tests/upstream/fixtures/compositionResults/testPcpMuseum_BasicVariantWithConnections.testenv/BasicVariantWithConnections/root.usda',
  import.meta.url,
))
const crateFixture = fileURLToPath(new URL(
  'fixtures/oracle/relationship-spec.usdc', import.meta.url,
))

describe('Usd property defining spec type', () => {
  it('recognizes a relationship spec read from crate data', async () => {
    const stage = (await Stage.open(crateFixture))!
    const property = stage.get('/root.foo')

    expect(property?.isRelationship).toBe(true)
    expect(property?.getTargets()).toEqual(['/eggs', '/spam'])
  })

  it('recognizes a relationship spec inside a selected variant', async () => {
    const stage = (await Stage.open(variantFixture))!
    const property = stage.get('/main_cam/Rig.controls')

    expect(property?.isRelationship).toBe(true)
    expect(property?.getTargets()).toEqual([
      '/main_cam/Lens.focus', '/main_cam/Lens.focalLength',
    ])
  })
})
