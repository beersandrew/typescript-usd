// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdUnitTestDelegate and the render index's legacy scene-delegate rprim sync,
// against a native capture (fixtures/unitTestDelegate). Upstream
// has no testenv for HdUnitTestDelegate. Mock/controller test (Node only):
// the render delegate and mesh below mirror the capture's CaptureRenderDelegate
// and CaptureMesh, which record what HdMesh::Sync is handed.
//
// Note: the native HdRenderIndex::New always routes legacy prims through the
// emulation scene index (renderIndex.cpp:193-243), so natively the Sync calls
// receive an HdSceneIndexAdapterSceneDelegate; this repo's render index hands
// the HdUnitTestDelegate itself (FAITHFULNESS-DEBT(hd-render-index-legacy-sync)).
import { describe, expect, it } from 'vitest'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f, Vec3d as GfVec3d, Vec3f as GfVec3f, makeRotation } from 'typescript-usd/gf'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import { HdUnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { HdRenderIndex } from '../../src/renderIndex.ts'
import { HdRenderDelegate } from '../../src/renderDelegate.ts'
import { HdMesh } from '../../src/mesh.ts'
import { HdRepr } from '../../src/repr.ts'
import { HdTask, type HdTaskContext } from '../../src/task.ts'
import { HdRprimCollection } from '../../src/rprimCollection.ts'
import { HdReprSelector, HdCullStyle } from '../../src/displayStyle.ts'
import { HdChangeTracker, type HdDirtyBits } from '../../src/changeTracker.ts'
import { HdInterpolation } from '../../src/enums.ts'
import { HdTokens, HdReprTokens } from '../../src/tokens.ts'
import type { HdSceneDelegate } from '../../src/sceneDelegate.ts'
import type { HdDirtyBitsRef } from '../../src/dirtyBitsTranslator.ts'
import type { HdRprim } from '../../src/rprim.ts'
import type { HdSprim } from '../../src/sprim.ts'
import type { HdBprim } from '../../src/bprim.ts'

const expected = readOracleFixture(new URL('./fixtures/unitTestDelegate/expected.json', import.meta.url))

// The capture's Val(): {type, value}.
function val(v: VtValue): unknown {
  if (v.IsEmpty()) return { type: 'empty' }
  const flat = (x: unknown): unknown => {
    if (typeof x === 'number') return Math.fround(x)
    const d = (x as { data?: readonly number[] }).data
    return d ? d.map(c => Math.fround(c)) : x
  }
  if (v.isArrayValued()) {
    const arr = v.Get<{ toArray(): unknown[] }>().toArray()
    return { type: `VtArray<${v.getElementType().getTypeName()}>`, value: arr.map(flat) }
  }
  return { type: v.getTypeName(), value: flat(v.Get<unknown>()) }
}
const fround = (x: unknown): unknown => {
  if (typeof x === 'number') return Math.fround(x)
  if (Array.isArray(x)) return x.map(fround)
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fround(v)]))
  return x
}

const interpNames = ['constant', 'uniform', 'varying', 'vertex', 'faceVarying', 'instance']

// The capture's MeshQuery().
function meshQuery(d: HdSceneDelegate, id: string): Record<string, unknown> {
  const t = d.getMeshTopology(id)
  const ext = d.getExtent(id)
  const idx = { value: [] as number[] }
  const colorIndexed = d.getIndexedPrimvar(id, HdTokens.displayColor, idx)
  const m = d.getTransform(id)
  const rs = d.getReprSelector(id)
  return {
    topology: {
      scheme: t.getScheme(), orientation: t.getOrientation(), counts: t.getFaceVertexCounts(),
      indices: t.getFaceVertexIndices(), holes: t.getHoleIndices(), refineLevel: t.getRefineLevel(),
      numPoints: t.getNumPoints(), numFaces: t.getNumFaces(), numFaceVaryings: t.getNumFaceVaryings(),
    },
    subdivTags: d.getSubdivTags(id).ToString(),
    points: val(d.Get(id, HdTokens.points)),
    displayColor: val(d.Get(id, HdTokens.displayColor)),
    displayOpacity: val(d.Get(id, HdTokens.displayOpacity)),
    displayColorIndexed: val(colorIndexed),
    displayColorIndices: idx.value,
    primvars: Object.fromEntries(interpNames.map((name, i) => [name,
      d.getPrimvarDescriptors(id, i as HdInterpolation).map(p => ({ name: p.name, role: p.role, indexed: p.indexed }))])),
    transform: Array.from({ length: 16 }, (_, k) => Math.fround(m.getElement(Math.floor(k / 4), k % 4))),
    extent: ext.IsEmpty() ? null : [ext.getMin().data.map(Math.fround), ext.getMax().data.map(Math.fround)],
    visible: d.getVisible(id),
    doubleSided: d.getDoubleSided(id),
    cullStyle: d.getCullStyle(id),
    refineLevel: d.getDisplayStyle(id).refineLevel,
    renderTag: d.getRenderTag(id),
    materialId: d.getMaterialId(id),
    instancerId: d.getInstancerId(id),
    reprSelector: [rs.at(0), rs.at(1), rs.at(2)],
  }
}

// Native float output is %.9g of floats/doubles; compare after fround.
function expectQuery(actual: Record<string, unknown>, native: Record<string, unknown>): void {
  const { transform: at, ...a } = actual
  const { transform: nt, ...n } = native
  expect(fround(a)).toEqual(fround(n))
  ;(at as number[]).forEach((x, i) => expect(x).toBeCloseTo((nt as number[])[i]!, 5))
}

let syncLog: Array<Record<string, unknown>> = []

// The capture's CaptureMesh.
class CaptureMesh extends HdMesh {
  constructor(id: string) { super(id) }
  getInitialDirtyBitsMask(): HdDirtyBits {
    const C = HdChangeTracker
    return C.Clean | C.InitRepr | C.DirtyCullStyle | C.DirtyDoubleSided | C.DirtyExtent | C.DirtyNormals
      | C.DirtyPoints | C.DirtyPrimID | C.DirtyPrimvar | C.DirtyDisplayStyle | C.DirtyRepr
      | C.DirtyMaterialId | C.DirtyTopology | C.DirtyTransform | C.DirtyVisibility | C.DirtyInstancer
  }
  sync(delegate: HdSceneDelegate, _renderParam: unknown, dirtyBits: HdDirtyBitsRef, repr: string): void {
    const rs = this.getReprSelector()
    const entry: Record<string, unknown> = {
      id: this.getId(), repr, dirtyBits: dirtyBits.value >>> 0, reprSelector: [rs.at(0), rs.at(1), rs.at(2)],
    }
    if (dirtyBits.value & HdChangeTracker.DirtyTopology) entry.query = meshQuery(delegate, this.getId())
    syncLog.push(entry)
    this._updateVisibility(delegate, dirtyBits)
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits
  }
  protected override _initRepr(reprToken: string, dirtyBits: HdDirtyBitsRef): void {
    if (!this._reprs.some(([token]) => token === reprToken)) {
      this._reprs.push([reprToken, new HdRepr()])
      dirtyBits.value |= HdChangeTracker.NewRepr
    }
  }
}

class CaptureRenderDelegate extends HdRenderDelegate {
  getSupportedRprimTypes(): string[] { return ['mesh'] }
  getSupportedSprimTypes(): string[] { return [] }
  getSupportedBprimTypes(): string[] { return [] }
  createRprim(_typeId: string, id: string): HdRprim { return new CaptureMesh(id) }
  destroyRprim(_rprim: HdRprim): void {}
  createSprim(): HdSprim { throw new Error('no sprims') }
  destroySprim(_sprim: HdSprim): void {}
  createBprim(): HdBprim { throw new Error('no bprims') }
  destroyBprim(_bprim: HdBprim): void {}
  CommitResources(): void {}
}

// The capture's CaptureTask: render tags {geometry}.
class CaptureTask extends HdTask {
  constructor() { super('') }
  override getRenderTags(): readonly string[] { return ['geometry'] }
  sync(): void {}
  Prepare(): void {}
  Execute(): void {}
}

function syncRound(index: HdRenderIndex, collections: HdRprimCollection[]): unknown[] {
  syncLog = []
  for (const c of collections) index.enqueueCollectionToSync(c)
  const ctx: HdTaskContext = new Map()
  index.syncTasks([new CaptureTask()], ctx)
  index.SyncAll(undefined, false)
  return syncLog
}

function expectRound(actual: unknown[], native: Array<Record<string, unknown>>): void {
  // Native rprims sync bucketed by scene delegate in dirty-list (path) order.
  expect(actual.map(e => { const { query, ...r } = e as Record<string, unknown>; void query; return r }))
    .toEqual(native.map(({ query, ...r }) => { void query; return r }))
  actual.forEach((e, i) => {
    const q = (e as { query?: Record<string, unknown> }).query
    const nq = native[i]!.query as Record<string, unknown> | undefined
    expect(q === undefined).toBe(nq === undefined)
    if (q && nq) expectQuery(q, nq)
  })
}

// testHdStDepthBias.cpp:108-125
function depthBiasScene(): { index: HdRenderIndex; delegate: HdUnitTestDelegate } {
  const index = HdRenderIndex.new(new CaptureRenderDelegate())
  const delegate = new HdUnitTestDelegate(index, '/')
  const cubeTransform = new GfMatrix4f(1.0).setScale(4.0)
    .getMultiply(new GfMatrix4f(1.0).setRotate(makeRotation([0, 0, 1], 45)))
  delegate.addCube('/white/cube', cubeTransform, false, '', PxOsdOpenSubdivTokens.none)
  delegate.updatePrimvarValue('/white/cube', HdTokens.displayColor, VtValue.create(new GfVec3f(1), VtValueTypes.GfVec3f))
  delegate.addCube('/black/cube', cubeTransform, false, '', PxOsdOpenSubdivTokens.none)
  delegate.updatePrimvarValue('/black/cube', HdTokens.displayColor, VtValue.create(new GfVec3f(0), VtValueTypes.GfVec3f))
  return { index, delegate }
}

const smoothHull = (root: string): HdRprimCollection => {
  const c = new HdRprimCollection(HdTokens.geometry, new HdReprSelector(HdReprTokens.smoothHull))
  c.setRootPath(root)
  return c
}

describe('HdUnitTestDelegate: testHdStDepthBias scene', () => {
  const db = expected.depthBias

  it('answers the scene delegate queries of the white and black cubes', () => {
    const { delegate } = depthBiasScene()
    expectQuery(meshQuery(delegate, '/white/cube'), db.direct.white)
    expectQuery(meshQuery(delegate, '/black/cube'), db.direct.black)
  })

  // Each step replays the scene and the earlier steps, then compares one
  // SyncAll round. Native bits carry the emulation scene index's round trip
  // (renderIndex.cpp:193-243): e.g. the pre-sync DirtyPrimvar from
  // UpdatePrimvarValue comes back as DirtyPrimvar|DirtyPoints|DirtyNormals|
  // DirtyWidths through HdDirtyBitsTranslator and also sets Varying.
  const steps: Array<[string, (d: HdUnitTestDelegate) => void]> = [
    ['sync1', () => {}],
    ['sync2', () => {}],
    ['syncAfterPrimvar', d => d.updatePrimvarValue('/white/cube', HdTokens.displayColor,
      VtValue.create(new GfVec3f(0.5), VtValueTypes.GfVec3f))],
    ['syncAfterTransform', d => d.updateTransform('/black/cube', new GfMatrix4f(1.0))],
    ['syncAfterRepr', d => d.setReprSelector('/black/cube', new HdReprSelector(HdReprTokens.hull))],
  ]
  steps.forEach(([name], n) => {
    it(`syncs both cubes through the legacy render index path as OpenUSD does: ${name}`, () => {
      const { index, delegate } = depthBiasScene()
      const cols = [smoothHull('/white'), smoothHull('/black')]
      let round: unknown[] = []
      for (let k = 0; k <= n; ++k) {
        steps[k]![1](delegate)
        round = syncRound(index, cols)
      }
      expectRound(round, db[name])
    })
  })
})

describe('HdUnitTestDelegate: test geometry', () => {
  // The capture's "direct" block.
  const index = HdRenderIndex.new(new CaptureRenderDelegate())
  const d = new HdUnitTestDelegate(index, '/')
  const dmat = new GfMatrix4d(1)
  dmat.setTranslate(new GfVec3d(1.0, -3.0, 0.0))
  const m = new GfMatrix4f(dmat)
  d.addCube('/cubeLoop', m, false, '', PxOsdOpenSubdivTokens.loop)
  d.addGrid('/grid', 2, 3, m, /*rightHanded=*/false, /*doubleSided=*/true)
  d.addGridWithFaceColor('/gridFace', 2, 2, m)
  d.addGridWithVertexColor('/gridVertex', 2, 2, m)
  d.addGridWithFaceVaryingColor('/gridFv', 1, 2, m)
  d.addPolygons('/polyU', m, HdInterpolation.HdInterpolationUniform)
  d.addPolygons('/polyV', m, HdInterpolation.HdInterpolationVertex)
  d.addPolygons('/polyF', m, HdInterpolation.HdInterpolationFaceVarying)
  d.addFaceVaryingPolygons('/fvPoly', m)
  d.addSubdiv('/subdiv', m)
  d.setRefineLevel('/subdiv', 2)
  d.setVisibility('/grid', false)
  d.setMeshCullStyle('/grid', HdCullStyle.HdCullStyleBack)
  d.hideRprim('/gridFace')
  d.setReprSelector('/cubeLoop', new HdReprSelector(HdReprTokens.refined))

  for (const id of Object.keys(expected.direct)) {
    it(`answers the queries for ${id}`, () => {
      expectQuery(meshQuery(d, id), expected.direct[id])
    })
  }
})

describe('HdRenderIndex legacy scene-delegate path', () => {
  it('returns the draw items of the resolved reprs (renderIndex.cpp:2329-2400)', async () => {
    const { HdDrawItem } = await import('../../src/drawItem.ts')
    class DrawMesh extends CaptureMesh {
      protected override _initRepr(reprToken: string, dirtyBits: HdDirtyBitsRef): void {
        if (!this._reprs.some(([token]) => token === reprToken)) {
          const repr = new HdRepr()
          repr.addDrawItem(new HdDrawItem(this.getSharedData()))
          this._reprs.push([reprToken, repr])
          dirtyBits.value |= HdChangeTracker.NewRepr
        }
      }
    }
    class DrawDelegate extends CaptureRenderDelegate {
      override createRprim(_typeId: string, id: string): HdRprim { return new DrawMesh(id) }
    }
    const index = HdRenderIndex.new(new DrawDelegate())
    const delegate = new HdUnitTestDelegate(index, '/')
    delegate.addCube('/a', new GfMatrix4f(1))
    delegate.addCube('/b', new GfMatrix4f(1))
    delegate.setReprSelector('/b', new HdReprSelector(HdReprTokens.hull))
    const col = smoothHull('/')
    syncRound(index, [col])
    const items = index.getDrawItems(col, ['geometry'])
    expect(items.map(i => i.getRprimID())).toEqual(['/a', '/b'])
    expect(index.getRprim('/b')!.getDrawItems(HdReprTokens.hull)).toHaveLength(1)
    // A hidden rprim's render tag filters it out once its tag is resynced.
    delegate.hideRprim('/a')
    syncRound(index, [col])
    expect(index.getDrawItems(col, ['geometry']).map(i => i.getRprimID())).toEqual(['/b'])
  })
})
