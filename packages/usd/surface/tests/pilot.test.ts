// The pilot scenario of the style guide's "Order of work" step 1, end to end
// through the surface only: open a stage, traverse, find a mesh, read and
// author its points and other attributes, change the edit target inside a
// change block, export and save. The stage is OpenUSD's own
// testUsdGeomPointInstancer/CubeModel.usda (pinned copy in usdGeom's
// upstream fixtures); every expected value is that file's authored value.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Mesh, Stage, UsdError, type ObjectsChangedEvent } from 'typescript-usd'

const CUBE_MODEL = new URL(
  '../../pxr/usd/usdGeom/tests/upstream/fixtures/testUsdGeomPointInstancer/CubeModel.usda', import.meta.url)

// CubeModel.usda: /CubeModel/Geom/Cube's authored values.
const POINTS = [
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
  -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
]
const FACE_VERTEX_COUNTS = [4, 4, 4, 4, 4, 4]
const FACE_VERTEX_INDICES = [0, 1, 3, 2, 2, 3, 5, 4, 4, 5, 7, 6, 6, 7, 1, 0, 1, 7, 5, 3, 6, 0, 2, 4]

let dir: string | undefined
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

it('opens CubeModel.usda, finds the mesh, reads and authors its points, exports and saves', async () => {
  const stage = await Stage.open(CUBE_MODEL)
  expect(stage.defaultPrim?.path).toBe('/CubeModel')

  // Traverse and find the mesh.
  expect([...stage.traverse()].map(prim => prim.path)).toEqual(['/CubeModel', '/CubeModel/Geom', '/CubeModel/Geom/Cube'])
  const prim = [...stage.traverse()].find(candidate => candidate.isA('Mesh'))
  expect(prim?.path).toBe('/CubeModel/Geom/Cube')
  const mesh = new Mesh(prim!)

  // Read: numeric arrays are typed arrays.
  const points = mesh.points.get()
  expect(points).toBeInstanceOf(Float32Array)
  expect(Array.from(points!)).toEqual(POINTS)
  expect(Array.from(mesh.faceVertexCounts.get()!)).toEqual(FACE_VERTEX_COUNTS)
  expect(Array.from(mesh.faceVertexIndices.get()!)).toEqual(FACE_VERTEX_INDICES)
  expect(Array.from(mesh.extent.get()!)).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5])
  const displayColor = prim!.attribute('primvars:displayColor')
  expect(displayColor?.typeName).toBe('color3f[]')
  expect(Array.from(displayColor!.get() as Float32Array, v => Math.round(v * 10) / 10)).toEqual([0.2, 0.2, 0.2])
  expect(prim!.attribute('noSuchAttribute')).toBeUndefined()

  // Author in the session layer, batched: one change notice for the block.
  const changed: ObjectsChangedEvent[] = []
  const controller = new AbortController()
  stage.addEventListener('objectschanged', event => changed.push(event), { signal: controller.signal })
  const doubled = POINTS.map(v => v * 2)
  stage.withEditTarget(stage.sessionLayer, () => stage.changeBlock(() => {
    mesh.points.set(new Float32Array(doubled))
    mesh.points.set([[0, 0, 0], [1, 1, 1]], 1)
  }))
  controller.abort()
  expect(changed).toHaveLength(1)
  expect(stage.editTarget).toBe(stage.rootLayer)
  expect(Array.from(mesh.points.get()!)).toEqual(doubled)
  expect(Array.from(mesh.points.get(1)!)).toEqual([0, 0, 0, 1, 1, 1])
  expect(mesh.points.timeSamples).toEqual([1])
  expect(stage.rootLayer.exportToString()).not.toContain('timeSamples')
  expect(stage.sessionLayer.exportToString()).toContain('point3f[] points.timeSamples')

  // A value of the wrong type is a UsdError, not a posted diagnostic.
  expect(() => mesh.faceVertexCounts.set('four' as never)).toThrow(UsdError)

  // Export the composed stage and reopen it.
  dir = mkdtempSync(path.join(tmpdir(), 'surface-pilot-'))
  const exported = path.join(dir, 'exported.usda')
  await stage.export(exported, { addSourceFileComment: false })
  const reopened = await Stage.open(exported)
  const reopenedMesh = new Mesh(reopened.prim('/CubeModel/Geom/Cube')!)
  expect(Array.from(reopenedMesh.points.get()!)).toEqual(doubled)
  expect(Array.from(reopenedMesh.points.get(1)!)).toEqual([0, 0, 0, 1, 1, 1])

  // Author on the reopened file's root layer and save it in place.
  using block = reopened.changeBlock()
  reopenedMesh.extent.set([[-1, -1, -1], [1, 1, 1]])
  block.close()
  await reopened.save()
  const saved = await Stage.open(exported)
  expect(Array.from(new Mesh(saved.prim('/CubeModel/Geom/Cube')!).extent.get()!)).toEqual([-1, -1, -1, 1, 1, 1])
  expect(saved.exportToString({ addSourceFileComment: false })).toBe(reopened.exportToString({ addSourceFileComment: false }))
  for (const s of [stage, reopened, saved]) s.close()
})
