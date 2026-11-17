// Native instancing inside a prototype: whether the propagated prototype's
// UsdNiInstancer has the flattened xform and visibility depends on the
// notices that reached that prototype's HdFlatteningSceneIndex, in OpenUSD
// 26.11.1 as here. The prim has no input data source (it is an ancestor of
// the rerooted prototype, rerootingSceneIndex.cpp:31-44), and
// HdFlatteningSceneIndex::GetPrim (flatteningSceneIndex.cpp:363-370) wraps
// such a prim only when _prims has an entry for it, which a descendant
// queried earlier puts there only when the next notice consolidates the
// recent prims (_ConsolidateRecentPrims, flatteningSceneIndex.cpp:403, 449,
// 551). The expected values below are those a C++ program against the
// 26.11.1 build printed for the same scenes and steps.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  FlatteningSceneIndex as HdFlatteningSceneIndex,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingFlattenedDataSourceProviders } from '../src/flattenedDataSourceProviders.ts'
import { UsdImagingRerootingSceneIndex } from '../src/rerootingSceneIndex.ts'
import { UsdImagingCreateSceneIndices } from '../src/sceneIndices.ts'

function flattened(si: HdSceneIndexBase, p: string): { dataSource: boolean, xform: boolean, visibility: boolean } {
  const ds = si.getPrim(p).dataSource
  return { dataSource: !!ds, xform: !!ds?.Get('xform'), visibility: !!ds?.Get('visibility') }
}

// The UsdNiInstancer prims of the final scene index, the propagated
// prototype hashes dropped, with whether each has xform and visibility.
function instancers(si: HdSceneIndexBase): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of new HdSceneIndexPrimView(si, '/')) {
    if (!p.endsWith('/UsdNiInstancer')) continue
    const f = flattened(si, p)
    out[p.replace(/\/UsdNiPropagatedPrototypes\/[^/]+\//g, 'P/').replace(/ForInstancer[0-9a-f]+/g, 'ForInstancer')] =
      `xform=${f.xform} visibility=${f.visibility}`
  }
  return out
}

describe('HdFlatteningSceneIndex: a prim without an input data source', () => {
  it('is flattened only after a notice follows the query of its descendant, as upstream', () => {
    const leaf = HdRetainedContainerDataSource.new(['foo'], [HdRetainedTypedSampledDataSource.new(1)])
    const retained = HdRetainedSceneIndex.new()
    retained.addPrims([{ primPath: '/Src', primType: 'mesh', dataSource: leaf }])
    // Rerooted to /A/B: /A has no data source.
    const rerooted = UsdImagingRerootingSceneIndex.new(retained, '/Src', '/A/B')
    expect(rerooted.getPrim('/A').dataSource).toBeUndefined()
    const flattening = HdFlatteningSceneIndex.new(rerooted, UsdImagingFlattenedDataSourceProviders())
    flattening.getPrim('/A/B')
    expect(flattened(flattening, '/A')).toEqual({ dataSource: false, xform: false, visibility: false })
    retained.addPrims([{ primPath: '/Src/C', primType: 'mesh', dataSource: leaf }])
    expect(flattened(flattening, '/A')).toEqual({ dataSource: true, xform: true, visibility: true })
  })
})

const dir = mkdtempSync(path.join(tmpdir(), 'nested-instancer-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const write = (name: string, text: string) => writeFileSync(path.join(dir, name), text)

// pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLResync (world.usda,
// instancer.usda, var.usda; OpenUSD 26.11.1, Pixar, Tomorrow Open Source
// Technology License 1.0).
write('world.usda', `#usda 1.0
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
write('instancer.usda', `#usda 1.0
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
write('var.usda', `#usda 1.0
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

// An instance whose prototype holds an instance.
write('nested.usda', `#usda 1.0
def Scope "World"
{
    def Xform "A" (
        instanceable = true
        payload = @outer.usda@</Root>
    ) {}
}
`)
write('outer.usda', `#usda 1.0
def Xform "Root"
{
    def Xform "Inner" (
        instanceable = true
        references = @leaf.usda@</Root>
    ) {}
    def Xform "Child"
    {
        double3 xformOp:translate = (0, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
`)
write('leaf.usda', `#usda 1.0
def Xform "Root"
{
    def Cube "Cube1"
    {
        double size = 1
    }
}
`)

async function scene(file: string, loadPayloads: boolean) {
  const stage = (await UsdStage.open(path.join(dir, file), { loadPayloads }))!
  const indices = UsdImagingCreateSceneIndices({ stage })
  indices.stageSceneIndex.SetTime(1)
  indices.stageSceneIndex.ApplyPendingUpdates()
  return { stage, indices }
}

describe('the propagated prototype UsdNiInstancer of nested native instancing', () => {
  const has = 'xform=true visibility=true', lacks = 'xform=false visibility=false'

  it('testUsdImagingGLResync: has xform and visibility after a payload load, at once or in steps, as upstream', async () => {
    const expected = {
      'P/__Prototype_2/UsdNiInstancer': has,
      'P/__Prototype_2/UsdNiInstancer/UsdNiPrototype/PI/prototypes/proto1/ForInstancerP/__Prototype_1/UsdNiInstancer': lacks,
    }
    for (const loadAll of [true, false]) {
      const { stage, indices } = await scene('world.usda', loadAll)
      if (!loadAll) {
        await stage.loadAndUnload(stage.findLoadable('/'), [])
        indices.stageSceneIndex.ApplyPendingUpdates()
      }
      expect(instancers(indices.finalSceneIndex), `loadAll ${loadAll}`).toEqual(expected)
    }
    // The outer payload, then the nested one.
    const { stage, indices } = await scene('world.usda', false)
    await stage.load('/World/Model', 'withoutDescendants')
    indices.stageSceneIndex.ApplyPendingUpdates()
    await stage.loadAndUnload(stage.findLoadable('/'), [])
    indices.stageSceneIndex.ApplyPendingUpdates()
    expect(Object.values(instancers(indices.finalSceneIndex))).toEqual([has, lacks])
  })

  it('an instance in a prototype: lacks them after one notice, has them after an edit inside the prototype, as upstream', async () => {
    for (const loadAll of [true, false]) {
      const { stage, indices } = await scene('nested.usda', loadAll)
      if (!loadAll) {
        await stage.loadAndUnload(stage.findLoadable('/'), [])
        indices.stageSceneIndex.ApplyPendingUpdates()
      }
      expect(instancers(indices.finalSceneIndex), `loadAll ${loadAll}`).toEqual({
        'P/__Prototype_2/UsdNiInstancer': lacks,
        'P/__Prototype_2/UsdNiInstancer/UsdNiPrototypeP/__Prototype_1/UsdNiInstancer': lacks,
      })
      const translate = SdfLayer.find(path.join(dir, 'outer.usda'))!.getAttributeAtPath('/Root/Child.xformOp:translate')!
      translate.setDefaultValue([1, 0, 0])
      indices.stageSceneIndex.ApplyPendingUpdates()
      expect(instancers(indices.finalSceneIndex), `loadAll ${loadAll}, edited`).toEqual({
        'P/__Prototype_2/UsdNiInstancer': has,
        'P/__Prototype_2/UsdNiInstancer/UsdNiPrototypeP/__Prototype_1/UsdNiInstancer': lacks,
      })
      translate.setDefaultValue([0, 0, 0])
    }
  })
})
