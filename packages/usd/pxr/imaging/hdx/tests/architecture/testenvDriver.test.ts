// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdx/testenv/testHdxRenderTask.cpp,
//  pxr/imaging/hdx/testenv/testHdxCameraAndLight.cpp,
//  pxr/imaging/hdx/testenv/testHdxLightAndShadow.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The ported hdx testenv programs (tests/upstream/testHdx*.ts) run end to
// end on a GPU-less Hgi that reports the reference device's capabilities
// (hdSt/tests/pipelineDrawBatchTestHgi.ts): Hdx_UnitTestDelegate ->
// HdRenderIndex (scene index emulation) -> the hdx tasks -> HdSt_RenderPass
// -> HdSt_CodeGen. Controller (Node) tests: no GPU, no browser, no pixels.
// They check that each program runs to its end with the exit status and
// stdout the reference build gives (fixtures/testenvImages/<test>/
// capture.json) and writes the images it writes there. The pixels are
// compared in Safari (tests/browser/hdx-image/run.mjs).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HgiTexture, HgiHandle, HgiSampler, type HgiSamplerDesc, type HgiSamplerHandle, type HgiBlitCmds, type HgiBufferHandle, type HgiCmds, type HgiSubmitWaitType, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { PerfLog as HdPerfLog } from 'typescript-usd/hd'
import { Hdx_RegisterShaderResources } from '../../src/shaderResources.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { PipelineDrawBatchTestHgi } from '../../../hdSt/tests/pipelineDrawBatchTestHgi.ts'
import '../../../hdSt/src/index.ts'

/** Render buffer textures: the descriptor only (no texel storage needed). */
class _Texture extends HgiTexture {
  constructor(desc: HgiTextureDesc) { super(desc) }
  getByteSizeOfResource(): number { return 0 }
  getRawResource(): unknown { return null }
  submitLayoutChange(newLayout: number): number { return newLayout }
}

class _Sampler extends HgiSampler {
  constructor(desc: HgiSamplerDesc) { super(desc) }
  getRawResource(): unknown { return null }
}

class _DriverHgi extends PipelineDrawBatchTestHgi {
  protected override _CreateTexture(desc: HgiTextureDesc): HgiTextureHandle {
    return new HgiHandle<HgiTexture>(new _Texture(desc), this.getUniqueId())
  }
  // Destruction is deferred past the next submission, as the GPU backends'
  // garbage collectors defer it (hgiMetal/garbageCollector.mm,
  // hgiWebGPU/src/garbageCollector.ts): recorded blits may still read a
  // buffer destroyed after they were recorded.
  private _pendingDestroy: HgiBufferHandle[] = []
  override destroyBuffer(h: HgiBufferHandle): void {
    this._pendingDestroy.push(h)
  }
  protected override _SubmitCmds(cmds: HgiCmds, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    const result = super._SubmitCmds(cmds, wait)
    const pending = this._pendingDestroy
    this._pendingDestroy = []
    for (const h of pending) super.destroyBuffer(h)
    return result
  }
  // Samplers (shadow map texture handles): the descriptor only.
  // (The base declares CreateSampler(): never; Hgi's signature takes the
  // descriptor.)
  override createSampler(...args: unknown[]): never {
    const desc = args[0] as HgiSamplerDesc
    const handle: HgiSamplerHandle = new HgiHandle<HgiSampler>(new _Sampler(desc), this.getUniqueId())
    return handle as never
  }
  // Render buffer readback: no texels (zeros) on a GPU-less Hgi.
  override createBlitCmds(): HgiBlitCmds {
    const cmds = super.createBlitCmds()
    cmds.copyTextureGpuToCpu = () => {}
    return cmds
  }
}

function capture(test: string): { returnCode: number, images: { name: string, written: boolean }[] } {
  return JSON.parse(readFileSync(new URL(`../fixtures/testenvImages/${test}/capture.json`, import.meta.url), 'utf8')).payload
}

async function run(test: string, argv?: readonly string[]) {
  Hdx_RegisterShaderResources()
  // Each upstream program is its own process: start from fresh perf
  // counters (HdPerfLog is a singleton).
  HdPerfLog.GetInstance().resetCounters()
  const written: string[] = []
  Hdx_UnitTestDelegate.setImageWriter((filePath) => { written.push(filePath); return true })
  const errors: string[] = []
  const delegate = {
    issueError(e: { getCommentary?: () => string }) { errors.push(e.getCommentary?.() ?? String(e)) },
    issueWarning() {}, issueStatus() {},
  }
  TfDiagnosticMgr.GetInstance().addDelegate(delegate as never)
  try {
    const program = await import(`../upstream/${test}.ts`) as { main(hgi: unknown, argv?: readonly string[]): Promise<{ status: number, stdout: string }> }
    const mgr = TfDiagnosticMgr.GetInstance()
    const errorStart = mgr.getErrorEnd()
    const result = argv ? await program.main(new _DriverHgi(), argv) : await program.main(new _DriverHgi())
    // Errors posted while the program's TfErrorMark is active stay in the
    // error list instead of reaching the delegates.
    for (let i = errorStart; i < mgr.getErrorEnd(); i++) {
      errors.push(mgr.getError(i)?.getCommentary() ?? '')
    }
    return { ...result, written, errors }
  } finally {
    TfDiagnosticMgr.GetInstance().removeDelegate(delegate as never)
    Hdx_UnitTestDelegate.setImageWriter(null)
  }
}

describe('hdx testenv programs on a GPU-less Hgi', () => {
  it('testHdxRenderTask runs to OK and writes its images', async () => {
    const r = await run('testHdxRenderTask')
    expect(r.errors).toEqual([])
    expect(r.stdout).toBe('OK\n')
    expect(r.status).toBe(capture('testHdxRenderTask').returnCode)
    expect(r.written).toEqual(capture('testHdxRenderTask').images.map(i => i.name))
  })

  it('testHdxCameraAndLight runs to OK (batch rebuild counts)', async () => {
    const r = await run('testHdxCameraAndLight')
    expect(r.errors).toEqual([])
    expect(r.stdout).toBe('OK\n')
    expect(r.status).toBe(capture('testHdxCameraAndLight').returnCode)
  })

  // The reference build exits 1 here only because hgiMetal rejects the
  // shadow texture array binding (hgiMetal/resourceBindings.mm:40); the
  // registered expectation is 0 (hdx/CMakeLists.txt:288).
  // Known gap: the cube and tet are drawn with the refined repr at refine
  // levels 4 and 3, which needs HdSt_Subdivision (OpenSubdiv); without it
  // Storm posts "HdSt_Subdivision is not available" coding errors.
  it('testHdxLightAndShadow runs to OK and writes its images', async () => {
    const r = await run('testHdxLightAndShadow')
    expect(r.errors).toEqual([])
    expect(r.stdout).toBe('OK\n')
    expect(r.status).toBe(0)
    expect(r.written).toEqual(capture('testHdxLightAndShadow').images.map(i => i.name))
  })

  // Picking reads ID and depth AOVs back; on a GPU-less Hgi they read zeros,
  // so every pixel is "prim 0 at depth 0" and the programs' pick
  // TF_VERIFYs fail. These runs check only that the id render and pick
  // passes sync, generate their shaders and execute, and that the only
  // errors are those verifications. The ids and hit counts are checked in
  // Safari (tests/browser/hdx-image/run.mjs).
  const onlyVerifications = (errors: string[]) =>
    errors.filter(e => !e.startsWith('Failed verification'))

  for (const [name, argv] of [
    ['testHdxIdRender', ['--offscreen']],
    ['testHdxIdRender_Refined', ['--offscreen', '--repr', 'refined', '--refineLevel', '2']],
  ] as const) {
    it(`${name} runs its id renders and picks`, async () => {
      const r = await run('testHdxIdRender', argv)
      // Known gap (refined variant): refine level 2 needs HdSt_Subdivision
      // (OpenSubdiv), which posts "not available" coding errors.
      expect(onlyVerifications(r.errors)).toEqual([])
    })
  }

  // Known gap: /protoBottom is refined at level 2, which needs
  // HdSt_Subdivision (OpenSubdiv).
  it('testHdxPickResolveMode runs its pick task passes', async () => {
    const r = await run('testHdxPickResolveMode')
    expect(onlyVerifications(r.errors)).toEqual([])
    expect(r.stdout).toContain('allHits: ')
    expect(r.status).toBe(1)
  })

  it('testHdxOitShaderRetention runs to OK (no OIT program recompiled after GC)', async () => {
    const r = await run('testHdxOitShaderRetention')
    expect(r.errors).toEqual([])
    expect(r.stdout).toBe('OK\n')
    expect(r.status).toBe(capture('testHdxOitShaderRetention').returnCode)
  })
})
