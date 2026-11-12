// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomBBoxCache.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdGeom/testenv/testUsdGeomBBoxCache.py (OpenUSD v26.08).
// The stages are the testenv's testUsdGeomBBoxCache/ files; the bounds the
// Python test prints (its baseline output) are captured from OpenUSD into
// fixtures/testUsdGeomBBoxCache/oracle.json (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'
import { BBox3d as GfBBox3d, Matrix4d as GfMatrix4d, Range3d as GfRange3d, Vec3d as GfVec3d,
  type Vec3f as GfVec3f } from 'typescript-usd/gf'
import { BBoxCache, Boundable, Imageable, Sphere, evaluateXformOps } from 'typescript-usd/usdGeom'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

const fixture = (name: string): string => fileURLToPath(new URL(
  `./fixtures/testUsdGeomBBoxCache/${name}`, import.meta.url))

type Vec3 = [number, number, number]
type RangeJson = [Vec3, Vec3] | null
interface BoxJson { range: RangeJson; matrix: number[]; aligned: RangeJson }
interface AtCurTimeJson {
  untransformed: BoxJson; local: BoxJson; world: BoxJson; invisible: BoxJson
  guide: BoxJson; render: BoxJson; proxy: BoxJson; multi: BoxJson
  rotated: BoxJson; rotatedTwice: BoxJson
}
interface OracleJson {
  Main: {
    useExtentsHint1: boolean; default1: AtCurTimeJson; time1: AtCurTimeJson
    useExtentsHint2: boolean; default2: AtCurTimeJson; time2: AtCurTimeJson
  }
  WithInstancing: Record<'default' | 'time1' | 'hintDefault' | 'hintTime1', Record<string, BoxJson>>
  ExtentCalculation: Record<string, RangeJson>
  Bug113044_isEmpty: boolean[]
  Usd4957: BoxJson
  PurposeWithInstancing: Record<string, { prototypes: number; default: BoxJson; render: BoxJson }>
  MeshBounds: Record<string, [Vec3, Vec3] | null>
}
const oracle = readOracleFixture(fixture('oracle.json')) as OracleJson

function expectRangeClose(range: GfRange3d, expected: RangeJson, msg: string): void {
  if (expected === null) {
    expect(range.IsEmpty(), msg).toBe(true)
    return
  }
  expect(range.IsEmpty(), msg).toBe(false)
  const min = range.getMin(), max = range.getMax()
  for (let i = 0; i < 3; i++) {
    expect(min.data[i]!, msg).toBeCloseTo(expected[0][i]!, 5)
    expect(max.data[i]!, msg).toBeCloseTo(expected[1][i]!, 5)
  }
}

// The bbox the Python test prints: its range, matrix and aligned range.
function expectOracleBox(box: GfBBox3d, expected: BoxJson, msg: string): void {
  expectRangeClose(box.getRange(), expected.range, `${msg} range`)
  const m = box.getMatrix()
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      expect(m.getElement(i, j), `${msg} matrix[${i}][${j}]`).toBeCloseTo(expected.matrix[i * 4 + j]!, 5)
    }
  }
  expectRangeClose(box.ComputeAlignedRange(), expected.aligned, `${msg} aligned`)
}

function AssertBBoxesClose(cachedBox: GfBBox3d, directBox: GfBBox3d, msg: string): void {
  const cachedRange = cachedBox.ComputeAlignedRange()
  const directRange = directBox.ComputeAlignedRange()
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(cachedRange.getMin().data[i]! - directRange.getMin().data[i]!), msg).toBeLessThanOrEqual(1e-5)
    expect(Math.abs(cachedRange.getMax().data[i]! - directRange.getMax().data[i]!), msg).toBeLessThanOrEqual(1e-5)
  }
}

function imageable(prim: Prim): Imageable {
  return new Imageable(prim, prim.getStage())
}

function TestAtCurTime(stage: Stage, bboxCache: BBoxCache, expected: AtCurTimeJson): void {
  let p = stage.getPrim('/parent/primWithLocalXform')!
  expect(bboxCache.computeWorldBound(p).equals(bboxCache.computeWorldBound(p))).toBe(true)
  bboxCache.setIncludedPurposes(['default'])
  expectOracleBox(bboxCache.computeUntransformedBound(p), expected.untransformed, 'Untransformed bound')
  let db = imageable(p).computeUntransformedBound(bboxCache.getTime(), 'default')
  AssertBBoxesClose(bboxCache.computeUntransformedBound(p), db, 'Untransformed')

  expectOracleBox(bboxCache.computeLocalBound(p), expected.local, 'Local bound')
  db = imageable(p).computeLocalBound(bboxCache.getTime(), 'default')
  AssertBBoxesClose(bboxCache.computeLocalBound(p), db, 'Local')

  expectOracleBox(bboxCache.computeWorldBound(p), expected.world, 'World bound')
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'default')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'World')

  const pp = stage.getPrim(`${p.path}/InvisibleChild`)!
  expectOracleBox(bboxCache.computeWorldBound(pp), expected.invisible, 'Invisible Bound')
  db = imageable(pp).computeWorldBound(bboxCache.getTime(), 'default')
  AssertBBoxesClose(bboxCache.computeWorldBound(pp), db, 'Invis World')

  bboxCache.setIncludedPurposes(['guide'])
  expect(bboxCache.getIncludedPurposes()).toEqual(['guide'])
  expectOracleBox(bboxCache.computeWorldBound(p), expected.guide, 'Visit Guides')
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'guide')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'World Guide')

  bboxCache.setIncludedPurposes(['render'])
  expect(bboxCache.getIncludedPurposes()).toEqual(['render'])
  expectOracleBox(bboxCache.computeWorldBound(p), expected.render, 'Visit Render')
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'render')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'World Render')

  bboxCache.setIncludedPurposes(['proxy'])
  expect(bboxCache.getIncludedPurposes()).toEqual(['proxy'])
  expectOracleBox(bboxCache.computeWorldBound(p), expected.proxy, 'Visit Proxy')
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'proxy')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'World Proxy')

  // Test multi-purpose
  bboxCache.setIncludedPurposes(['default', 'proxy', 'render'])
  expect(bboxCache.getIncludedPurposes()).toEqual(['default', 'proxy', 'render'])
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'default', 'proxy', 'render')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'Multi-purpose')
  expectOracleBox(bboxCache.computeWorldBound(p), expected.multi, 'Multi-purpose')

  p = stage.getPrim('/Rotated')!
  bboxCache.setIncludedPurposes(['default'])
  expect(bboxCache.getIncludedPurposes()).toEqual(['default'])
  expectOracleBox(bboxCache.computeWorldBound(p), expected.rotated, 'Visit Rotated')
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'default')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'Rotated')

  p = stage.getPrim('/Rotated/Rotate135AndTranslate/Rot45')!
  bboxCache.setIncludedPurposes(['default'])
  expect(bboxCache.getIncludedPurposes()).toEqual(['default'])
  expectOracleBox(bboxCache.computeWorldBound(p), expected.rotatedTwice, 'Visit Rotated twice')
  db = imageable(p).computeWorldBound(bboxCache.getTime(), 'default')
  AssertBBoxesClose(bboxCache.computeWorldBound(p), db, 'Rotated Twice')

  // Usd.Prim(): an invalid prim raises (TF_CODING_ERROR -> RuntimeError).
  const invalid = undefined as unknown as Prim
  expect(() => bboxCache.computeWorldBound(invalid)).toThrow()
  expect(() => bboxCache.computeLocalBound(invalid)).toThrow()
  expect(() => bboxCache.computeUntransformedBound(invalid)).toThrow()
}

function TestInstancedStage(stage: Stage, bboxCache: BBoxCache, expected: Record<string, BoxJson>): void {
  const instancedPrim = stage.getPrim('/instanced_parent')!
  const uninstancedPrim = stage.getPrim('/uninstanced_parent')!
  const instancedRotated = stage.getPrim('/instanced_Rotated')!
  const uninstancedRotated = stage.getPrim('/uninstanced_Rotated')!

  expectOracleBox(bboxCache.computeWorldBound(instancedPrim), expected['/instanced_parent']!,
    'Bound for instance prim /instanced_parent')
  expectOracleBox(bboxCache.computeWorldBound(uninstancedPrim), expected['/uninstanced_parent']!,
    'Bound for prim /uninstanced_parent')
  AssertBBoxesClose(bboxCache.computeWorldBound(instancedPrim),
    bboxCache.computeWorldBound(uninstancedPrim), 'Instanced')

  expectOracleBox(bboxCache.computeWorldBound(instancedRotated), expected['/instanced_Rotated']!,
    'Bound for instance prim /instanced_Rotated')
  expectOracleBox(bboxCache.computeWorldBound(uninstancedRotated), expected['/uninstanced_Rotated']!,
    'Bound for prim /uninstanced_Rotated')
  AssertBBoxesClose(bboxCache.computeWorldBound(instancedRotated),
    bboxCache.computeWorldBound(uninstancedRotated), 'Instanced')
}

describe('testUsdGeomBBoxCache', () => {
  it('Main', async () => {
    const stage = (await Stage.open(fixture('cubeSbdv.usda')))!

    const bboxCache = new BBoxCache(undefined, ['default'])
    expect(bboxCache.getUseExtentsHint()).toBe(oracle.Main.useExtentsHint1)
    TestAtCurTime(stage, bboxCache, oracle.Main.default1)
    bboxCache.setTime(1.0)
    TestAtCurTime(stage, bboxCache, oracle.Main.time1)

    // Test the use of cached extents hint.
    const bboxCache2 = new BBoxCache(undefined, ['default'], true)
    expect(bboxCache2.getUseExtentsHint()).toBe(oracle.Main.useExtentsHint2)
    TestAtCurTime(stage, bboxCache2, oracle.Main.default2)
    bboxCache2.setTime(1.0)
    TestAtCurTime(stage, bboxCache2, oracle.Main.time2)
  })

  it('TestWithInstancing', async () => {
    const stage = (await Stage.open(fixture('cubeSbdv_instanced.usda')))!
    const bboxCache = new BBoxCache(undefined, ['default'])
    TestInstancedStage(stage, bboxCache, oracle.WithInstancing.default)
    bboxCache.setTime(1.0)
    TestInstancedStage(stage, bboxCache, oracle.WithInstancing.time1)

    // Test the use of cached extents hint.
    const bboxCache2 = new BBoxCache(undefined, ['default'], true)
    TestInstancedStage(stage, bboxCache2, oracle.WithInstancing.hintDefault)
    // The Python test advances the first cache here, leaving bboxCache2 at
    // Default.
    bboxCache.setTime(1.0)
    TestInstancedStage(stage, bboxCache2, oracle.WithInstancing.hintTime1)
  })

  it('TestExtentCalculation', async () => {
    const stage = (await Stage.open(fixture('pointsAndCurves.usda')))!
    const bboxCache = new BBoxCache(0.0, ['default'])
    const visited: string[] = []
    for (const group of ['/ValidPrims', '/WarningPrims', '/ErrorPrims']) {
      for (const prim of stage.getPrim(group)!.getChildren()) {
        visited.push(prim.path)
        expectRangeClose(bboxCache.computeWorldBound(prim).getRange(),
          oracle.ExtentCalculation[prim.path] ?? null, prim.path)
        // The bbox has cached the result.
        expectRangeClose(bboxCache.computeWorldBound(prim).getRange(),
          oracle.ExtentCalculation[prim.path] ?? null, prim.path)
      }
    }
    expect(visited).toEqual(Object.keys(oracle.ExtentCalculation))
  })

  it('TestUnloadedExtentsHints', async () => {
    const stage = (await Stage.open(fixture('unloadedCubeModel.usda'), { loadPayloads: false }))!
    const bboxCacheNo = new BBoxCache(0.0, ['default'], false)
    const bboxCacheYes = new BBoxCache(0.0, ['default'], true)

    const prim = stage.getPrim('/')!
    const bboxNo = bboxCacheNo.computeWorldBound(prim)
    const bboxYes = bboxCacheYes.computeWorldBound(prim)

    expect(bboxNo.getRange().IsEmpty()).toBe(true)
    expect(bboxYes.getRange().IsEmpty()).toBe(false)
  })

  it('TestIgnoredPrims', async () => {
    const stage = (await Stage.open(fixture('cubeSbdv.usda')))!
    const bboxCache = new BBoxCache(undefined, ['default'])

    const undefinedPrim = stage.getPrim('/undefinedCube1')!
    expect(bboxCache.computeWorldBound(undefinedPrim).getRange().IsEmpty()).toBe(true)

    const inactivePrim = stage.getPrim('/inactiveCube1')!
    expect(bboxCache.computeWorldBound(inactivePrim).getRange().IsEmpty()).toBe(true)

    const abstractPrim = stage.getPrim('/_class_UnitCube')!
    expect(bboxCache.computeWorldBound(abstractPrim).getRange().IsEmpty()).toBe(true)
  })

  it('TestIgnoreVisibility', async () => {
    const stage = (await Stage.open(fixture('animVis.usda')))!
    const bboxCache = new BBoxCache(0.0, ['default'], true, true)
    const pseudoRoot = stage.getPrim('/')!
    expect(bboxCache.computeWorldBound(pseudoRoot).getRange().IsEmpty()).toBe(false)
  })

  it('TestPurposeWithInstancing', async () => {
    // Every stage produces the same default and render purpose bounds even
    // though they permute which prims are instanced.
    const defaultBBox = new GfBBox3d(new GfRange3d(
      new GfVec3d(-1.5, -1.5, -1.5), new GfVec3d(1.5, 1.5, 10.5)))
    const renderBBox = new GfBBox3d(new GfRange3d(
      new GfVec3d(-11.0, -1.5, -16.5), new GfVec3d(1.5, 1.5, 10.5)))
    const defaultCache = new BBoxCache(undefined, ['default'])
    const renderCache = new BBoxCache(undefined, ['default', 'render'])

    const cases: [string, number][] = [
      ['disableAllInstancing.usda', 0],
      ['disableInnerInstancing.usda', 1],
      ['disableOuterInstancing.usda', 1],
      ['nestedInstanceTest.usda', 2],
    ]
    for (const [file, numPrototypes] of cases) {
      const stage = (await Stage.open(fixture(file)))!
      expect(stage.getPrototypes().length, file).toBe(numPrototypes)
      const root = stage.getPrim('/Root')!
      expect(defaultCache.computeWorldBound(root).equals(defaultBBox), file).toBe(true)
      expect(renderCache.computeWorldBound(root).equals(renderBBox), file).toBe(true)
    }
  })

  it('TestBug113044', async () => {
    const stage = (await Stage.open(fixture('animVis.usda')))!
    const bboxCache = new BBoxCache(0.0, ['default'])
    const pseudoRoot = stage.getPrim('/')!
    expect(bboxCache.computeWorldBound(pseudoRoot).getRange().IsEmpty()).toBe(true)

    // The cube is visible at frame 1. This should invalidate the bounds at
    // '/' and cause the bbox to be non-empty.
    bboxCache.setTime(1.0)
    expect(bboxCache.computeWorldBound(pseudoRoot).getRange().IsEmpty()).toBe(false)

    bboxCache.setTime(2.0)
    expect(bboxCache.computeWorldBound(pseudoRoot).getRange().IsEmpty()).toBe(true)

    bboxCache.setTime(3.0)
    expect(bboxCache.computeWorldBound(pseudoRoot).getRange().IsEmpty()).toBe(false)
    expect(oracle.Bug113044_isEmpty).toEqual([true, false, true, false])
  })

  it('TestBug125048', async () => {
    const stage = (await Stage.open(fixture('testBug125048.usda')))!
    const bboxCache = new BBoxCache(undefined, ['default'], true)
    const modelPrim = stage.getPrim('/Model')!
    const geomPrim = stage.getPrim('/Model/Geom/cube')!
    bboxCache.computeUntransformedBound(modelPrim)
    // The following computation used to trip a verify.
    bboxCache.computeUntransformedBound(geomPrim)
  })

  it('TestBug127801', () => {
    // Typeless defs are included in the traversal when computing bounds.
    const stage = Stage.createNew()
    const world = stage.definePrim('/World')
    const char = stage.definePrim('/World/anim/char')
    Sphere.define(stage, `${char.path}/sphere`)

    const bboxCache = new BBoxCache(undefined, ['default'], true)
    const bbox = bboxCache.computeUntransformedBound(world)
    expect(bbox.getRange().IsEmpty()).toBe(false)
  })

  it('TestUsd4957', async () => {
    // A prim with an xform directly on it, bounded relative to an ancestor
    // with ComputeRelativeBound().
    const s = (await Stage.open(fixture('testUSD4957.usda')))!
    const b = s.getPrim('/A/B')!
    const c = s.getPrim('/A/B/C')!
    const bc = new BBoxCache(undefined, ['default', 'render'])

    const relativeBbox = bc.computeRelativeBound(c, b)

    // Compare the result with the bbox of C in its local space.
    const cExtent = [...new Boundable(c, s).getExtentAttr().get() as Iterable<GfVec3f>]
    const cRange = new GfRange3d(new GfVec3d(cExtent[0]!), new GfVec3d(cExtent[1]!))
    const cLocalXform = new GfMatrix4d(...evaluateXformOps(c).matrix)
    const cBbox = new GfBBox3d(cRange, cLocalXform)

    AssertBBoxesClose(relativeBbox, cBbox, 'ComputeRelativeBound produced a wrong bbox.')
    expectOracleBox(relativeBbox, oracle.Usd4957, 'ComputeRelativeBound')
  })

  it('TestMeshBounds', async () => {
    // Mesh bounds edge cases: missing points, extent not authored, and
    // combinations of the above.
    const stage = (await Stage.open(fixture('meshBounds.usda')))!
    const noExtentButPoints = stage.getPrim('/NoExtentButPoints')!
    expect(noExtentButPoints.isA('Boundable')).toBe(true)
    expect(Boundable.computeExtent(noExtentButPoints)).toEqual(
      [[-2.0, -2.0, -2.0], [2.0, -2.0, 2.0]])
    expect(Boundable.computeExtent(noExtentButPoints)).toEqual(oracle.MeshBounds['/NoExtentButPoints'])

    const noExtentNoPoints = stage.getPrim('/NoExtentNoPoints')!
    expect(noExtentNoPoints.isA('Boundable')).toBe(true)
    expect(Boundable.computeExtent(noExtentNoPoints)).toBeNull()
    expect(oracle.MeshBounds['/NoExtentNoPoints']).toBeNull()

    const noExtentEmptyPoints = stage.getPrim('/NoExtentEmptyPoints')!
    expect(noExtentEmptyPoints.isA('Boundable')).toBe(true)
    // The empty extent is (FLT_MAX, -FLT_MAX): an empty range, max < min.
    const floatMax = new GfRange3d().getMin().data[0]!
    const floatMin = new GfRange3d().getMax().data[0]!
    expect(Boundable.computeExtent(noExtentEmptyPoints)).toEqual(
      [[floatMax, floatMax, floatMax], [floatMin, floatMin, floatMin]])
    expect(Boundable.computeExtent(noExtentEmptyPoints)).toEqual(oracle.MeshBounds['/NoExtentEmptyPoints'])
  })
})
