// Benchmarks for the browser viewer's load path after Stage.open: UsdImaging
// stage scene index population, the per-prim data sources a viewer reads,
// and UsdGeomBBoxCache framing bounds.
// The scene is generated here with the shape of a referenced production set:
// a USDA root referencing component assets, each payloading a USDC geometry
// layer of polygon meshes with face-varying normals, indexed texture
// coordinates, display colors and pivoted transforms, each mesh about the
// size of a production set's average (a 12 x 12 quad patch). Run with `pnpm bench`;
// `node bench/record.mjs <label> --bench bench/imaging.bench.ts` records
// results under bench/results/.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bench, describe } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { BBoxCache } from 'typescript-usd/usdGeom'
import { UsdImagingStageSceneIndex as StageSceneIndex, UsdImagingMaterialBindingsSchema as MaterialBindingsSchema } from 'typescript-usd/usdImaging'
import { serializeUsdc } from '../pxr/usd/sdf/src/crateFile.ts'

const ASSETS = 30, PLACEMENTS = 2, MESHES = 25, GRID = 12

const dir = mkdtempSync(path.join(tmpdir(), 'typescript-usd-imaging-bench-'))
const write = (name: string, data: string | Uint8Array) => {
  const file = path.join(dir, name)
  writeFileSync(file, data)
  return file
}

// A GRID x GRID quad patch with face-varying normals and indexed st.
function gridMesh(name: string, seed: number): string {
  const points: string[] = [], counts: number[] = [], indices: number[] = [], st: string[] = []
  for (let y = 0; y <= GRID; y++) for (let x = 0; x <= GRID; x++) {
    points.push(`(${x}, ${y}, ${((x * 7 + y * 3 + seed) % 5) * 0.1})`)
    st.push(`(${x / GRID}, ${y / GRID})`)
  }
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const i = y * (GRID + 1) + x
    counts.push(4)
    indices.push(i, i + 1, i + GRID + 2, i + GRID + 1)
  }
  const normals = indices.map(() => '(0, 0, 1)')
  return `    def Mesh "${name}"
    {
        float3[] extent = [(0, 0, 0), (${GRID}, ${GRID}, 0.4)]
        int[] faceVertexCounts = [${counts.join(', ')}]
        int[] faceVertexIndices = [${indices.join(', ')}]
        point3f[] points = [${points.join(', ')}]
        normal3f[] normals = [${normals.join(', ')}] (
            interpolation = "faceVarying"
        )
        texCoord2f[] primvars:st = [${st.join(', ')}] (
            interpolation = "faceVarying"
        )
        int[] primvars:st:indices = [${indices.join(', ')}]
        color3f[] primvars:displayColor = [(${(seed % 10) / 10}, 0.5, 0.25)]
        uniform token subdivisionScheme = "none"
        double3 xformOp:translate = (${seed % 7}, ${seed % 5}, 0)
        float3 xformOp:rotateXYZ = (0, 0, ${seed * 15 % 360})
        double3 xformOp:translate:pivot = (2, 2, 0)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:translate:pivot", "xformOp:rotateXYZ", "!invert!xformOp:translate:pivot"]
    }
`
}

for (let a = 0; a < ASSETS; a++) {
  const meshes = Array.from({ length: MESHES }, (_, m) => gridMesh(`pCube${m}`, a * MESHES + m)).join('')
  const geom = Layer.createInMemory(`asset${a}.geom.usda`, `#usda 1.0
(
    defaultPrim = "Asset${a}"
)

def Xform "Asset${a}"
{
    def Scope "Geom"
    {
${meshes}    }
}
`)
  write(`asset${a}.geom.usd`, serializeUsdc(geom))
  write(`asset${a}.usda`, `#usda 1.0
(
    defaultPrim = "Asset${a}"
)

def Xform "Asset${a}" (
    kind = "component"
    payload = @./asset${a}.geom.usd@
)
{
}
`)
}
const placements: string[] = []
for (let a = 0; a < ASSETS; a++) for (let p = 0; p < PLACEMENTS; p++) {
  placements.push(`        def "Asset${a}_${p}" (
            references = @./asset${a}.usda@
        )
        {
            double3 xformOp:translate = (${a * 6}, ${p * 6}, 0)
            uniform token[] xformOpOrder = ["xformOp:translate"]
        }
`)
}
const rootPath = write('set.usda', `#usda 1.0
(
    defaultPrim = "Set"
    upAxis = "Z"
)

def Xform "Set" (
    kind = "assembly"
)
{
    def Xform "Props"
    {
${placements.join('')}    }
}
`)

describe(`imaging load (${ASSETS * PLACEMENTS} referenced assets, ${ASSETS * PLACEMENTS * MESHES} meshes)`, () => {
  let stage: Stage | undefined
  const ready = async (): Promise<Stage> => stage ??= (await Stage.open(rootPath))!
  const options = { iterations: 10, time: 0 }
  bench('Stage.open', async () => { await Stage.open(rootPath) }, options)
  bench('UsdImagingStageSceneIndex.SetStage (population)', async () => {
    StageSceneIndex.new().SetStage(await ready())
  }, options)
  bench('prim data sources: material binding of every prim', async () => {
    const opened = await ready()
    const sceneIndex = StageSceneIndex.new()
    sceneIndex.SetStage(opened)
    sceneIndex.SetTime(0)
    for (const primPath of opened.traverse()) {
      MaterialBindingsSchema.getFromParent(sceneIndex.getPrim(primPath).dataSource).getMaterialBindings()
    }
  }, options)
  bench('UsdGeomBBoxCache.ComputeWorldBound of the set', async () => {
    const opened = await ready()
    new BBoxCache(0, ['default', 'render']).computeWorldBound(opened.getPrim('/Set')!)
  }, options)
})
