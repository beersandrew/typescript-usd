// Storm's compile-ahead (PLATFORM-DIVERGENCE(hdst-compile-ahead),
// packages/usd/pxr/imaging/hdSt/src/commandBuffer.ts) creates the draw
// pipeline of a batch that has not drawn yet, in the background
// (createRenderPipelineAsync, PLATFORM-DIVERGENCE(hgiwebgpu-pipeline-ahead)),
// so the frame its geometry comes into view creates no render pipeline: in
// WebKit that creation compiles the pipeline's Metal shaders, hundreds of
// milliseconds the first time (performance-viewer.md, November 11). Through
// the viewer's engine (src/stage-view-engine.ts) on the stub GPU device of the
// Node perf driver (scripts/viewer-perf/null-gpu.ts). Controller check, not
// GPU acceptance: nothing is drawn.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Frustum as GfFrustum, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { installGpuGlobals, createNullDevice } from '../scripts/viewer-perf/null-gpu'
import { StageViewEngine, prepareStorm, createHgi } from '../src/stage-view-engine'
import { defaultDisplaySettings, mergeDisplaySettings } from '../src/display-settings'

// A mesh in front of the camera and curves behind it: the curves' batch has
// its own program and does not draw until the camera turns to it.
const scene = `#usda 1.0
def Mesh "Front"
{
    int[] faceVertexCounts = [4]
    int[] faceVertexIndices = [0, 1, 2, 3]
    point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
    float3[] extent = [(-1, -1, 0), (1, 1, 0)]
}
def BasisCurves "Behind"
{
    uniform token type = "linear"
    int[] curveVertexCounts = [2]
    point3f[] points = [(0, 0, 10), (1, 1, 10)]
    float[] widths = [0.1] (interpolation = "constant")
    float3[] extent = [(-0.05, -0.05, 9.95), (1.05, 1.05, 10.05)]
}
`
const macrotask = () => new Promise(resolve => setTimeout(resolve, 0))

it('creates the draw pipeline of a batch out of view ahead, so coming into view creates none', async () => {
  installGpuGlobals()
  await prepareStorm()
  const dir = mkdtempSync(path.join(tmpdir(), 'pipeline-ahead-'))
  writeFileSync(path.join(dir, 'scene.usda'), scene)
  const stage = (await Stage.open(path.join(dir, 'scene.usda')))!
  const settings = mergeDisplaySettings(defaultDisplaySettings(), { showBBoxes: false })
  const { device } = createNullDevice()
  const engine = new StageViewEngine(createHgi(device), stage, 1, settings, 64, 64)
  engine.applySettings(settings, false)
  const look = (z: number) => {
    const frustum = new GfFrustum()
    frustum.setPosition(new GfVec3d(0, 0, z))
    return { view: frustum.computeViewMatrix(), projection: frustum.computeProjectionMatrix(), eye: [0, 0, z] as const, scenePath: null }
  }
  const sync = vi.spyOn(device, 'createRenderPipeline')
  const ahead = vi.spyOn(device, 'createRenderPipelineAsync')
  try {
    // Facing the mesh: the frame that builds the batches, then frames that
    // compile ahead (not on the building frame).
    const front = look(5)
    for (let i = 0; i < 4; i++) { engine.Render(front, 64, 64); await macrotask() }
    expect(ahead).toHaveBeenCalled()
    // Turning to the curves draws their batch: its pipeline exists.
    const before = sync.mock.calls.length
    const behind = look(20)
    engine.Render(behind, 64, 64)
    expect(sync.mock.calls.length - before).toBe(0)
  } finally {
    engine.destroy()
    stage.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})
