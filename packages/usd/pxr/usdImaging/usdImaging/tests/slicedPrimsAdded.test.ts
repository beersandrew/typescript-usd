// PLATFORM-DIVERGENCE(usdimaging-sliced-prims-added) (src/stageSceneIndex.ts,
// setAddedPrimsPerUpdate): with a count set, a resync's added prims reach the
// scene index's observers that many per ApplyPendingUpdates: native-instancing
// prototypes, then materials, then the rest, then instances inside
// prototypes, every prim behind its parent; queued
// prims are not in the scene index until sent; a resync drops queued prims
// under its paths; no count sends what is left at once. Without a count the
// notices are upstream's.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { DebugPrintDataSource as HdDebugPrintDataSource, SceneIndexPrimView as HdSceneIndexPrimView, type SceneIndexBase as HdSceneIndexBase, type SceneIndexObserver as HdSceneIndexObserver } from 'typescript-usd/hd'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices } from '../src/sceneIndices.ts'
import { UsdImagingStageSceneIndex } from '../src/stageSceneIndex.ts'

const dir = mkdtempSync(path.join(tmpdir(), 'sliced-prims-added-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
writeFileSync(path.join(dir, 'root.usda'), `#usda 1.0
def Xform "World"
{
    def Xform "Exhibit" (
        prepend payload = @./exhibit.usda@</Exhibit>
    )
    {
    }
}
`)
writeFileSync(path.join(dir, 'exhibit.usda'), `#usda 1.0
def Xform "Exhibit"
{
    def Xform "Stand"
    {
        def Mesh "Top" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {
            int[] faceVertexCounts = [3]
            int[] faceVertexIndices = [0, 1, 2]
            point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
            rel material:binding = </Exhibit/Looks/Wood>
        }
        def Mesh "Leg"
        {
            int[] faceVertexCounts = [3]
            int[] faceVertexIndices = [0, 1, 2]
            point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        }
    }
    def Xform "Copy" (
        instanceable = true
        prepend references = </Exhibit/Stand>
    )
    {
    }
    def Scope "Looks"
    {
        def Material "Wood"
        {
        }
    }
}
`)

class Recorder implements HdSceneIndexObserver {
  added: string[][] = []
  removed: string[][] = []
  types = new Map<string, string>()
  primsAdded(_s: HdSceneIndexBase, entries: readonly { primPath: string, primType: string }[]): void {
    this.added.push(entries.map(e => e.primPath))
    for (const e of entries) this.types.set(e.primPath, e.primType)
  }
  primsRemoved(_s: HdSceneIndexBase, entries: readonly { primPath: string }[]): void {
    this.removed.push(entries.map(e => e.primPath))
  }
  primsDirtied(): void {}
  primsRenamed(): void {}
}

async function open(count: number | undefined) {
  const stage = (await UsdStage.open(path.join(dir, 'root.usda'), { loadPayloads: false }))!
  const si = UsdImagingStageSceneIndex.new()
  si.SetStage(stage)
  si.SetTime(0)
  const rec = new Recorder()
  si.addObserver(rec)
  si.setAddedPrimsPerUpdate(count)
  return { stage, si, rec }
}

describe('sliced PrimsAdded', () => {
  it('sends a payload load at once without a count, as upstream', async () => {
    const { stage, si, rec } = await open(undefined)
    await stage.loadAndUnload(['/World/Exhibit'], [])
    si.ApplyPendingUpdates()
    expect(rec.added).toHaveLength(1)
    expect(rec.added[0]).toContain('/World/Exhibit/Stand/Top')
    expect(si.queuedAddedPrimCount()).toBe(0)
  })

  it('sends a share per update: prototypes, then materials, then the rest, parents before children, the same prims in the end', async () => {
    const all = await open(undefined)
    await all.stage.loadAndUnload(['/World/Exhibit'], [])
    all.si.ApplyPendingUpdates()
    const everything = all.rec.added.flat()

    const { stage, si, rec } = await open(2)
    await stage.loadAndUnload(['/World/Exhibit'], [])
    si.ApplyPendingUpdates()
    expect(rec.added).toHaveLength(1)
    expect(rec.added[0]).toHaveLength(2)
    // Queued prims are not in the scene index yet.
    const queued = everything.filter(p => !rec.added.flat().includes(p))
    expect(si.queuedAddedPrimCount()).toBe(queued.length)
    expect(si.getPrim('/World/Exhibit/Stand/Leg').dataSource).toBeUndefined()
    for (let i = 0; i < 20 && si.queuedAddedPrimCount(); i++) si.ApplyPendingUpdates()
    const order = rec.added.flat()
    expect([...order].sort()).toEqual([...everything].sort())
    expect(rec.added.every(batch => batch.length <= 2)).toBe(true)
    // Parents before children.
    for (const [i, p] of order.entries()) {
      const parent = p.slice(0, p.lastIndexOf('/'))
      if (order.includes(parent)) expect(order.indexOf(parent)).toBeLessThan(i)
    }
    // Every prototype prim, then the material, before the first other mesh.
    expect(order.some(p => p.startsWith('/__Prototype_'))).toBe(true)
    const firstMesh = order.findIndex(p => rec.types.get(p) === 'mesh' && !p.startsWith('/__Prototype_'))
    const material = order.indexOf('/World/Exhibit/Looks/Wood')
    expect(rec.types.get('/World/Exhibit/Looks/Wood')).toBe('material')
    expect(firstMesh).toBeGreaterThan(material)
    for (const [i, p] of order.entries()) if (p.startsWith('/__Prototype_')) expect(i).toBeLessThan(material)
    expect(si.getPrim('/World/Exhibit/Stand/Leg').primType).toBe('mesh')
    expect(si.getChildPrimPaths('/World/Exhibit/Stand').sort()).toEqual(['/World/Exhibit/Stand/Leg', '/World/Exhibit/Stand/Top'])
  })

  it('hides queued children from getChildPrimPaths', async () => {
    const { stage, si } = await open(1)
    await stage.loadAndUnload(['/World/Exhibit'], [])
    si.ApplyPendingUpdates()
    expect(si.getChildPrimPaths('/World/Exhibit/Stand')).toEqual([])
  })

  it('drops the queued prims of a payload unloaded mid-slice', async () => {
    const { stage, si, rec } = await open(1)
    await stage.loadAndUnload(['/World/Exhibit'], [])
    si.ApplyPendingUpdates()
    si.ApplyPendingUpdates()
    expect(si.queuedAddedPrimCount()).toBeGreaterThan(0)
    await stage.loadAndUnload([], ['/World/Exhibit'])
    rec.added = []
    for (let i = 0; i < 20; i++) si.ApplyPendingUpdates()
    expect(si.queuedAddedPrimCount()).toBe(0)
    // Only the unloaded payload prim itself comes back; nothing below it.
    expect(rec.added.flat().filter(p => p.startsWith('/World/Exhibit/'))).toEqual([])
    expect(si.getChildPrimPaths('/World/Exhibit')).toEqual([])
  })

  it('sends what is left at once when the count is cleared', async () => {
    const { stage, si, rec } = await open(1)
    await stage.loadAndUnload(['/World/Exhibit'], [])
    si.ApplyPendingUpdates()
    si.setAddedPrimsPerUpdate(undefined)
    si.ApplyPendingUpdates()
    expect(si.queuedAddedPrimCount()).toBe(0)
    expect(rec.added).toHaveLength(2)
  })
})

// Nested native instancing through point instancer prototypes:
// pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLResync (world.usda,
// instancer.usda, var.usda; OpenUSD 26.11.1, Pixar, Tomorrow Open Source
// Technology License 1.0). The whole scene index chain's prims and data after
// a payload load must not depend on the count: sent a prim at a time, the
// nested instance inside __Prototype_2 reached the prototype propagating
// scene indices before the instance that brings __Prototype_2 in, and the
// nested instancer lost its flattened xform and visibility.
const resync = mkdtempSync(path.join(tmpdir(), 'sliced-resync-'))
afterAll(() => rmSync(resync, { recursive: true, force: true }))
writeFileSync(path.join(resync, 'world.usda'), `#usda 1.0
(
    upAxis = "Z"
)
def Scope "World"
{
   def "Model" (
       instanceable=true
       payload = @instancer.usda@</Root>
   ) {}
}
`)
writeFileSync(path.join(resync, 'instancer.usda'), `#usda 1.0
(
    upAxis = "Z"
)

def Xform "Root"
{
    def PointInstancer "PI" ()
    {
        float3[] extent = [(-1, -1, -1), (13, 1, 4)]
        int[] protoIndices = [0, 0, 0, 0]
        point3f[] positions = [(0, 0, 0), (4, 0, 0), (8, 0, 0), (12, 0, 0)]
        rel prototypes = [<prototypes/proto1>]

        def "prototypes" (
            kind = "group"
        )
        {
            def "proto1" (
                instanceable = true
                payload = @var.usda@</Root>
            )
            {
            }
        }
    }
}
`)
writeFileSync(path.join(resync, 'var.usda'), `#usda 1.0
(
    defaultPrim = "Root"
)

def Xform "Root"
{
    def PointInstancer "ChildPI"
    {
        float3[] extent = [(-1, -1, -1), (1, 1, 4)]
        point3f[] positions = [(0, 0, 0), (0, 0, 3)]
        int[] protoIndices = [0, 0]
        rel prototypes = </Root/ChildPI/prototypes/Cube1>

        def "prototypes"
        {
            def Cube "Cube1"
            {
            }
        }
    }
}
`)

async function chainAfterLoad(count: number | undefined): Promise<Map<string, string>> {
  const stage = (await UsdStage.open(path.join(resync, 'world.usda'), { loadPayloads: false }))!
  const indices = UsdImagingCreateSceneIndices({ stage })
  indices.stageSceneIndex.SetTime(1)
  indices.stageSceneIndex.setAddedPrimsPerUpdate(count)
  await stage.loadAndUnload(stage.findLoadable('/'), [])
  for (let i = 0; i < 50; i++) indices.stageSceneIndex.ApplyPendingUpdates()
  const out = new Map<string, string>()
  const final = indices.finalSceneIndex
  for (const p of new HdSceneIndexPrimView(final, '/')) {
    const prim = final.getPrim(p)
    out.set(p, `${prim.primType}\n${HdDebugPrintDataSource(prim.dataSource, 1)}`)
  }
  return out
}

describe('sliced PrimsAdded through the scene index chain', () => {
  it('ends with the same prims and data for every count (nested native instancing)', async () => {
    const all = await chainAfterLoad(undefined)
    expect(all.size).toBeGreaterThan(10)
    for (const count of [1, 2, 3, 4, 8]) {
      const sliced = await chainAfterLoad(count)
      expect([...sliced.keys()].sort()).toEqual([...all.keys()].sort())
      for (const [p, text] of all) expect(sliced.get(p), `${p} (count ${count})`).toBe(text)
    }
  })
})
