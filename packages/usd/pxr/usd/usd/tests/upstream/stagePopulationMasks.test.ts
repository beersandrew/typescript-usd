// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.h,
//  pxr/usd/usd/stagePopulationMask.h,
//  pxr/usd/usd/testenv/testUsdStagePopulationMasks.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdStagePopulationMasks.py
// (registered as testUsdStagePopulationMasks; no testenv directory).
//
// API mapping:
//   - UsdStagePopulationMask::Add returns the mask for chaining; the TS add()
//     returns void, so chained Adds are written as successive calls.
//   - Includes(mask) is includesMask(mask); Includes(path) is includes(path).
//   - The static Union/Intersection free functions are the instance
//     getUnion/getIntersection (stagePopulationMask.h: Union(l, r) ==
//     l.GetUnion(r)).
//   - GetIncludedChildNames(path) returns (bool, names) upstream, where the
//     bool is "any child is included" (stagePopulationMask.h); the TS result
//     is { all, names }, so the bool is all || names.length > 0.
//   - Python's Tf.ErrorException on a coding error is a thrown Error.
//   - UsdStage::CreateInMemory is Stage.createNew().
//   - Missing API: UsdStage::ExpandPopulationMask (stage.h) has no TS
//     counterpart; the assertions after each expansion are omitted, marked
//     at their sites.
import { describe, expect, it } from 'vitest'
import { ValueTypeNames } from 'typescript-usd/sdf'
import { Stage, StagePopulationMask } from 'typescript-usd/usd'

const mask = (paths: string[] = []): StagePopulationMask => new StagePopulationMask(paths)
const chained = (...paths: string[]): StagePopulationMask => {
  const result = new StagePopulationMask()
  for (const path of paths) result.add(path)
  return result
}
const includedChildNames = (pm: StagePopulationMask, path: string): [boolean, string[]] => {
  const { all, names } = pm.getIncludedChildNames(path)
  return [all || names.length > 0, [...names]]
}
const eq = (a: StagePopulationMask, b: StagePopulationMask): boolean => a.equals(b)

describe('test_Basic', () => {
  it('All() and the empty mask', () => {
    let pm = StagePopulationMask.all()
    expect(pm.isEmpty()).toBe(false)
    expect(pm.includes('/any/path')).toBe(true)
    expect(includedChildNames(pm, '/')).toEqual([true, []])

    pm = mask()
    expect(pm.isEmpty()).toBe(true)
    expect(pm.includes('/any/path')).toBe(false)
    expect(includedChildNames(pm, '/')).toEqual([false, []])
  })

  it('union with the empty mask and included child names', () => {
    const pm = mask()
    const pm2 = chained('/foo', '/bar')
    expect(pm.includesMask(pm2)).toBe(false)
    expect(pm2.includesMask(pm)).toBe(true)
    expect(eq(pm.getUnion(pm2), pm2)).toBe(true)
    expect(eq(pm.getUnion(pm2), pm2)).toBe(true) // Usd.StagePopulationMask.Union(pm, pm2)

    expect(includedChildNames(pm2, '/')).toEqual([true, ['bar', 'foo']])
    expect(includedChildNames(pm2, '/foo')).toEqual([true, []])
    expect(includedChildNames(pm2, '/bar')).toEqual([true, []])
    expect(includedChildNames(pm2, '/baz')).toEqual([false, []])
  })

  it('Add keeps paths sorted and minimal; equality and union', () => {
    const pm = mask()
    pm.add('/World/anim/chars/CharGroup')
    expect(pm.getPaths()).toEqual(['/World/anim/chars/CharGroup'])
    expect(pm.isEmpty()).toBe(false)
    pm.add('/World/anim/chars/CharGroup/child')
    expect(pm.getPaths()).toEqual(['/World/anim/chars/CharGroup'])
    pm.add('/World/anim/chars/OtherCharGroup')
    expect(pm.getPaths()).toEqual(['/World/anim/chars/CharGroup',
      '/World/anim/chars/OtherCharGroup'])
    pm.add('/World/sets/arch/Building')
    expect(pm.getPaths()).toEqual(['/World/anim/chars/CharGroup',
      '/World/anim/chars/OtherCharGroup',
      '/World/sets/arch/Building'])

    let pm2 = mask()
    expect(eq(pm2, pm)).toBe(false)
    pm2.add('/World/anim/chars/CharGroup')
    expect(eq(pm2, pm)).toBe(false)
    pm2.add('/World/sets/arch/Building')
    pm2.add('/World/anim/chars/OtherCharGroup')
    pm2.add('/World/anim/chars/CharGroup/child')
    expect(eq(pm2, pm)).toBe(true)

    expect(eq(pm2.getUnion(pm), pm)).toBe(true)
    expect(eq(pm2.getUnion(pm), pm2)).toBe(true)

    pm2 = mask()
    expect(eq(pm.getUnion(pm2), pm)).toBe(true)
    expect(eq(pm.getUnion(pm2), pm2)).toBe(false)

    expect(pm.includes('/World')).toBe(true)
    expect(pm.includesSubtree('/World')).toBe(false)
    expect(pm.includes('/World/anim')).toBe(true)
    expect(pm.includesSubtree('/World/anim')).toBe(false)
    expect(pm.includes('/World/anim/chars/CharGroup')).toBe(true)
    expect(pm.includesSubtree('/World/anim/chars/CharGroup')).toBe(true)
    expect(pm.includes('/World/anim/chars/CharGroup/child')).toBe(true)
    expect(pm.includesSubtree('/World/anim/chars/CharGroup/child')).toBe(true)
  })

  it('GetUnion with a path, Union and Intersection', () => {
    let pm = chained('/world/anim')
    let pm2 = pm.getUnion('/world')
    expect(pm2.getPaths()).toEqual(['/world'])

    pm = mask(['/A', '/AA', '/B/C', '/U'])
    pm2 = mask(['/A/X', '/B', '/Q'])
    expect(eq(pm.getUnion(pm2), mask(['/A', '/AA', '/B', '/Q', '/U']))).toBe(true)
    expect(eq(pm.getIntersection(pm2), mask(['/A/X', '/B/C']))).toBe(true)
  })

  it('GetIncludedChildNames for nested mask paths', () => {
    const pm = mask(['/A/B', '/A/C', '/A/D/E', '/A/D/F', '/B'])
    expect(includedChildNames(pm, '/')).toEqual([true, ['A', 'B']])
    expect(includedChildNames(pm, '/A')).toEqual([true, ['B', 'C', 'D']])
    expect(includedChildNames(pm, '/A/B')).toEqual([true, []])
    expect(includedChildNames(pm, '/A/C')).toEqual([true, []])
    expect(includedChildNames(pm, '/A/D')).toEqual([true, ['E', 'F']])
    expect(includedChildNames(pm, '/A/D/E')).toEqual([true, []])
    expect(includedChildNames(pm, '/A/D/F')).toEqual([true, []])
    expect(includedChildNames(pm, '/B')).toEqual([true, []])
    expect(includedChildNames(pm, '/C')).toEqual([false, []])
  })

  it('errors: relative paths are rejected', () => {
    expect(() => mask(['relativePath/is/no/good'])).toThrow()
    expect(() => mask().add('relativePath/is/no/good')).toThrow()
  })

  it('errors: property paths are rejected', () => {
    expect(() => mask(['/property/path/is/no.good'])).toThrow()
    expect(() => mask().add('/property/path/is/no.good')).toThrow()
  })

  it('errors: variant selection paths are rejected', () => {
    expect(() => mask(['/variant/selection/path/is{no=good}'])).toThrow()
    expect(() => mask().add('/variant/selection/path/is{no=good}')).toThrow()
  })
})

describe('test_Stages', () => {
  async function unmaskedStage() {
    const unmasked = Stage.createNew()
    unmasked.definePrim('/World/anim/chars/DoryGroup/Dory')
    unmasked.definePrim('/World/anim/chars/NemoGroup/Nemo')
    unmasked.definePrim('/World/sets/Reef/Coral/CoralGroup1')
    unmasked.definePrim('/World/sets/Reef/Rocks/RockGroup1')
    await unmasked.flushChanges()
    return unmasked
  }
  const doryMask = () => chained('/World/anim/chars/DoryGroup')
  const doryAndNemoMask = () => chained('/World/anim/chars/DoryGroup', '/World/anim/chars/NemoGroup')

  it('OpenMasked populates only the mask paths and their ancestors', async () => {
    const unmasked = await unmaskedStage()
    const doryStage = await Stage.openMasked(unmasked.getRootLayer(), doryMask())
    expect(eq(doryStage.getPopulationMask(), doryMask())).toBe(true)

    expect(doryStage.getPrim('/World')).toBeDefined()
    expect(doryStage.getPrim('/World/anim')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/DoryGroup')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/DoryGroup/Dory')).toBeDefined()

    expect(doryStage.getPrim('/World/sets')).toBeUndefined()
    expect(doryStage.getPrim('/World/anim/chars/NemoGroup')).toBeUndefined()

    expect(doryStage._getPcpCache()!.findPrimIndex('/World/sets')).toBeUndefined()
    expect(doryStage._getPcpCache()!.findPrimIndex('/World/anim/chars/NemoGroup')).toBeUndefined()
  })

  it('SetPopulationMask widens and narrows an existing mask', async () => {
    const unmasked = await unmaskedStage()
    const doryStage = await Stage.openMasked(unmasked.getRootLayer(), doryMask())

    // Test modifying an existing mask.
    await doryStage.setPopulationMask(doryAndNemoMask())

    expect(doryStage.getPrim('/World')).toBeDefined()
    expect(doryStage.getPrim('/World/anim')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/DoryGroup')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/DoryGroup/Dory')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/NemoGroup')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/NemoGroup/Nemo')).toBeDefined()

    expect(doryStage._getPcpCache()!.findPrimIndex('/World/anim/chars/NemoGroup')).toBeDefined()

    await doryStage.setPopulationMask(doryMask())

    expect(doryStage.getPrim('/World')).toBeDefined()
    expect(doryStage.getPrim('/World/anim')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/DoryGroup')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/DoryGroup/Dory')).toBeDefined()
    expect(doryStage.getPrim('/World/anim/chars/NemoGroup')).toBeUndefined()
    expect(doryStage.getPrim('/World/anim/chars/NemoGroup/Nemo')).toBeUndefined()

    expect(doryStage._getPcpCache()!.findPrimIndex('/World/anim/chars/NemoGroup')).toBeUndefined()
  })

  it('OpenMasked with a two-path mask', async () => {
    const unmasked = await unmaskedStage()
    const doryAndNemoStage = await Stage.openMasked(unmasked.getRootLayer(), doryAndNemoMask())
    expect(eq(doryAndNemoStage.getPopulationMask(), doryAndNemoMask())).toBe(true)

    expect(doryAndNemoStage.getPrim('/World')).toBeDefined()
    expect(doryAndNemoStage.getPrim('/World/anim')).toBeDefined()
    expect(doryAndNemoStage.getPrim('/World/anim/chars')).toBeDefined()
    expect(doryAndNemoStage.getPrim('/World/anim/chars/DoryGroup')).toBeDefined()
    expect(doryAndNemoStage.getPrim('/World/anim/chars/DoryGroup/Dory')).toBeDefined()
    expect(doryAndNemoStage.getPrim('/World/anim/chars/NemoGroup')).toBeDefined()
    expect(doryAndNemoStage.getPrim('/World/anim/chars/NemoGroup/Nemo')).toBeDefined()

    expect(doryAndNemoStage.getPrim('/World/sets')).toBeUndefined()
  })
})

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const WORLD = {
  A: '/World/A', B: '/World/B', C: '/World/C', D: '/World/D',
  E: '/World/E', F: '/World/F', G: '/World/F/G', H: '/World/H',
} as const

async function expansionStage(kind: 'relationships' | 'connections') {
  const stage = Stage.createNew()
  const a = stage.definePrim(WORLD.A)
  const b = stage.definePrim(WORLD.B)
  const c = stage.definePrim(WORLD.C)
  const d = stage.definePrim(WORLD.D)
  const e = stage.definePrim(WORLD.E)
  const f = stage.overridePrim(WORLD.F)
  const g = stage.overridePrim(WORLD.G)
  const h = stage.overridePrim(WORLD.H)
  const floatType = ValueTypeNames.Float.toString()

  if (kind === 'relationships') {
    const cAttr = c.createAttribute('attr', floatType)

    a.createRelationship('r').addTarget(b.path)
    b.createRelationship('r').addTarget(cAttr.getPath())
    c.createRelationship('r').addTarget(d.path)
    d.createRelationship('r').addTarget(f.path)
    g.createRelationship('r').addTarget(h.path)

    a.createRelationship('pred').addTarget(e.path)
  } else {
    const bAttr = b.createAttribute('attr', floatType)
    const cAttr = c.createAttribute('attr', floatType)
    const dAttr = d.createAttribute('attr', floatType)
    const eAttr = e.createAttribute('attr', floatType)
    const fAttr = f.createAttribute('attr', floatType)
    g.createAttribute('attr', floatType)
    const hAttr = h.createAttribute('attr', floatType)

    a.createAttribute('a', floatType).addConnection(bAttr.getPath())
    b.createAttribute('a', floatType).addConnection(cAttr.getPath())
    c.createAttribute('a', floatType).addConnection(dAttr.getPath())
    d.createAttribute('a', floatType).addConnection(fAttr.getPath())
    g.createAttribute('a', floatType).addConnection(hAttr.getPath())

    a.createAttribute('pred', floatType).addConnection(eAttr.getPath())
  }
  await stage.flushChanges()
  return stage
}

function expectPopulated(stage: Stage, present: readonly (typeof LETTERS[number])[]) {
  for (const letter of LETTERS) {
    const prim = stage.getPrim(WORLD[letter])
    if (present.includes(letter)) expect(prim, WORLD[letter]).toBeDefined()
    else expect(prim, WORLD[letter]).toBeUndefined()
  }
}

describe.each(['relationships', 'connections'] as const)('test_Expansion (%s)', (kind) => {
  // test_ExpansionRelationships / test_ExpansionConnections.
  it('a mask of just /World/A populates only /World/A', async () => {
    const stage = await expansionStage(kind)
    const masked = await Stage.openMasked(stage.getRootLayer(), chained(WORLD.A))
    expectPopulated(masked, ['A'])

    // Missing API: UsdStage::ExpandPopulationMask. Upstream next expands
    // with default traversal (A-F and G populated, H not), resets the mask
    // to just A (asserted below), expands with a relationship/attribute
    // predicate matching only 'pred' (A and E populated), then resets and
    // expands with Usd.PrimAllPrimsPredicate (A-H populated).

    // Reset to just a.
    await masked.setPopulationMask(chained(WORLD.A))
    expectPopulated(masked, ['A'])
  })
})

describe('test_Bug143308', () => {
  it('masked stages still build prototypes for instances in the mask', async () => {
    // We didn't correctly mask calls to parallel prim indexing, leading to
    // errors with instancing.
    const stage = Stage.createNew()
    const foo = stage.definePrim('/foo')
    stage.definePrim('/bar')
    const i1 = stage.definePrim('/i1')
    const i2 = stage.definePrim('/i2')
    foo.setInstanceable(true)
    for (const p of [i1, i2]) await p.getReferences().addReference('', foo.path)
    expect(stage.getPrototypes().length).toBeGreaterThan(0)
    const stage2 = await Stage.openMasked(stage.getRootLayer(), mask(['/i1']))
    expect(stage2.getPrototypes().length).toBeGreaterThan(0)
  })
})

describe('test_Bug145873', () => {
  it('the payload inclusion predicate is consulted for ancestors of masked paths', async () => {
    // The payload inclusion predicate wasn't being invoked on ancestors of
    // requested index paths in pcp.
    const payload = Stage.createNew()
    for (const n of ['One', 'Two', 'Three']) payload.definePrim(`/CubesModel/Geom/Cube${n}`)
    await payload.flushChanges()

    const root = Stage.createNew()
    const cubes = root.definePrim('/Cubes')
    await cubes.getPayloads().addReference(payload.getRootLayer().identifier, '/CubesModel')

    const testStage = await Stage.openMasked(
      root.getRootLayer(), mask(['/Cubes/Geom/CubeTwo']))

    // Only /Cubes/Geom/CubeTwo (and ancestors) should be present.
    expect(testStage.getPrim('/Cubes')).toBeDefined()
    expect(testStage.getPrim('/Cubes/Geom')).toBeDefined()
    expect(testStage.getPrim('/Cubes/Geom/CubeOne')).toBeUndefined()
    expect(testStage.getPrim('/Cubes/Geom/CubeTwo')).toBeDefined()
    expect(testStage.getPrim('/Cubes/Geom/CubeThree')).toBeUndefined()
  })
})

describe('test_Bug152904', () => {
  async function instancedStage() {
    // Prototype prims weren't being generated on stages where the population
    // mask included paths of prims beneath instances.
    const stage = Stage.createNew()
    stage.definePrim('/Ref/geom')
    stage.definePrim('/Ref/shading')

    for (const path of ['/Instance_1', '/Instance_2']) {
      const prim = stage.definePrim(path)
      await prim.getReferences().addReference('', '/Ref')
      prim.setInstanceable(true)
    }
    await stage.flushChanges()
    return stage
  }

  it('instances masked to the same descendant share a prototype', async () => {
    const stage = await instancedStage()
    // Open the stage with a mask that includes the 'geom' prim beneath the
    // instances.
    const maskedStage = await Stage.openMasked(
      stage.getRootLayer(), mask(['/Instance_1/geom', '/Instance_2/geom']))

    // Both instances should share the same prototype prim.
    const instance1 = maskedStage.getPrim('/Instance_1')!
    expect(instance1.isInstance()).toBe(true)
    expect(instance1.getPrototype()).toBeDefined()

    const instance2 = maskedStage.getPrim('/Instance_2')!
    expect(instance2.isInstance()).toBe(true)
    expect(instance2.getPrototype()).toBeDefined()

    // Only the 'geom' prim in the prototype will be composed, since it's the
    // only one in the population mask.
    expect(instance1.getPrototype()!.path).toBe(instance2.getPrototype()!.path)
    const prototype = instance1.getPrototype()!

    expect(maskedStage.getPrim(`${prototype.path}/geom`)).toBeDefined()
    expect(maskedStage.getPrim(`${prototype.path}/shading`)).toBeUndefined()
  })

  it('instances under different relative masks get different prototypes', async () => {
    const stage = await instancedStage()
    // Open the stage with a mask that includes the 'geom' prim beneath
    // /Instance_1 and all children beneath /Instance_2.
    const maskedStage = await Stage.openMasked(
      stage.getRootLayer(), mask(['/Instance_1/geom', '/Instance_2']))

    // Both instances should *not* share the same prototype, since they are
    // affected by different population masks.
    const instance1 = maskedStage.getPrim('/Instance_1')!
    expect(instance1.isInstance()).toBe(true)
    expect(instance1.getPrototype()).toBeDefined()

    const instance2 = maskedStage.getPrim('/Instance_2')!
    expect(instance2.isInstance()).toBe(true)
    expect(instance2.getPrototype()).toBeDefined()

    // Only the 'geom' prim will be composed in the prototype for the
    // /Instance_1, but both 'geom' and 'shading' will be composed for
    // /Instance_2.
    expect(instance1.getPrototype()!.path).not.toBe(instance2.getPrototype()!.path)
    let prototype = instance1.getPrototype()!

    expect(maskedStage.getPrim(`${prototype.path}/geom`)).toBeDefined()
    expect(maskedStage.getPrim(`${prototype.path}/shading`)).toBeUndefined()

    prototype = instance2.getPrototype()!

    expect(maskedStage.getPrim(`${prototype.path}/geom`)).toBeDefined()
    expect(maskedStage.getPrim(`${prototype.path}/shading`)).toBeDefined()
  })
})
