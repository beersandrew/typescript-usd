// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdx/aovInputTask.cpp, pxr/imaging/hdx/colorCorrectionTask.cpp,
//  pxr/imaging/hdx/presentTask.cpp
// Copyright 2018, 2019, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The hdx post-process tasks (aovInputTask, colorCorrectionTask,
// presentTask) and their tables on a GPU-less Hgi that records its calls
// (hdSt/tests/pipelineDrawBatchTestHgi.ts). Controller (Node) tests: no GPU,
// no pixels. The expectations restate upstream behaviour cited at each it();
// the pixels are checked in Safari (tests/browser/hdxPostProcessChain.ts,
// tests/upstream/testHdxPresentTask.ts).

import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Vec2i as GfVec2i, Vec4d as GfVec4d } from 'typescript-usd/gf'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  AovTokens as HdAovTokens,
  Engine as HdEngine,
  Format as HdFormat,
  RenderIndex as HdRenderIndex,
  Tokens as HdTokens,
  type Task as HdTask,
} from 'typescript-usd/hd'
import {
  HgiFormat,
  HgiHandle,
  HgiSampler,
  HgiTexture,
  HgiTokens,
  type HgiBlitCmds,
  type HgiSamplerDesc,
  type HgiSamplerHandle,
  type HgiTextureDesc,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { PipelineDrawBatchTestHgi } from '../../../hdSt/tests/pipelineDrawBatchTestHgi.ts'
import { HdxAovInputTask, HdxAovInputTaskParams, HdxAovInputTaskParamsType } from '../../src/aovInputTask.ts'
import {
  HdxColorCorrectionTask,
  HdxColorCorrectionTaskParams,
  HdxColorCorrectionTaskParamsType,
} from '../../src/colorCorrectionTask.ts'
import { HdxHgiConversions } from '../../src/hgiConversions.ts'
import { HdxPresentTask, HdxPresentTaskParams, HdxPresentTaskParamsType } from '../../src/presentTask.ts'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { Hdx_RegisterShaderResources } from '../../src/shaderResources.ts'
import { HdxAovTokens, HdxColorCorrectionTokens } from '../../src/tokens.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'

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
  frames: string[] = []
  protected override _CreateTexture(desc: HgiTextureDesc): HgiTextureHandle {
    return new HgiHandle<HgiTexture>(new _Texture(desc), this.getUniqueId())
  }
  constructor() {
    super()
    // The base Hgi has no samplers; the post-process tasks create some.
    ;(this as unknown as { createSampler(desc: HgiSamplerDesc): HgiSamplerHandle }).createSampler =
      (desc: HgiSamplerDesc) => new HgiHandle<HgiSampler>(new _Sampler(desc), this.getUniqueId())
  }
  override createBlitCmds(): HgiBlitCmds {
    const cmds = super.createBlitCmds()
    cmds.copyTextureGpuToCpu = () => {}
    return cmds
  }
  override startFrame(): void { this.frames.push('start') }
  override endFrame(): void { this.frames.push('end') }
}

function withDiagnostics<T>(f: () => T): { result: T, errors: string[], warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const delegate = {
    issueError(e: { getCommentary?: () => string }) { errors.push(e.getCommentary?.() ?? String(e)) },
    issueWarning(w: { getCommentary?: () => string }) { warnings.push(w.getCommentary?.() ?? String(w)) },
    issueStatus() {},
  }
  TfDiagnosticMgr.GetInstance().addDelegate(delegate as never)
  try {
    return { result: f(), errors, warnings }
  } finally {
    TfDiagnosticMgr.GetInstance().removeDelegate(delegate as never)
  }
}

function setUp(colorCorrectionMode = HdxColorCorrectionTokens.sRGB) {
  Hdx_RegisterShaderResources()
  const hgi = new _DriverHgi()
  const index = HdRenderIndex.new(new HdStRenderDelegate(), [{ name: HgiTokens.renderDriver, driver: hgi }])!
  const delegate = new Hdx_UnitTestDelegate(index)
  const engine = new HdEngine()
  delegate.addRenderSetupTask('/renderSetupTask')
  delegate.addRenderTask('/renderTask')
  index.insertTask(delegate, '/aovInputTask', HdxAovInputTask)
  index.insertTask(delegate, '/colorCorrectionTask', HdxColorCorrectionTask)
  index.insertTask(delegate, '/presentTask', HdxPresentTask)
  const aovBindings = delegate.addAovBindings(new GfVec2i(64, 32))
  const rp = delegate.getTaskParam('/renderSetupTask', HdTokens.params).Get<HdxRenderTaskParams>().Clone()
  rp.viewport = new GfVec4d(0, 0, 64, 32)
  rp.aovBindings = aovBindings
  delegate.setTaskParam('/renderSetupTask', HdTokens.params, VtValue.create(rp, HdxRenderTaskParamsType))
  const ap = new HdxAovInputTaskParams()
  ap.aovBufferPath = aovBindings[0]!.renderBufferId
  ap.depthBufferPath = aovBindings[1]!.renderBufferId
  delegate.setTaskParam('/aovInputTask', HdTokens.params, VtValue.create(ap, HdxAovInputTaskParamsType))
  const cp = new HdxColorCorrectionTaskParams()
  cp.colorCorrectionMode = colorCorrectionMode
  cp.aovName = HdAovTokens.color
  delegate.setTaskParam('/colorCorrectionTask', HdTokens.params,
    VtValue.create(cp, HdxColorCorrectionTaskParamsType))
  delegate.setTaskParam('/presentTask', HdTokens.params,
    VtValue.create(new HdxPresentTaskParams(), HdxPresentTaskParamsType))
  delegate.addGrid('/grid', new GfMatrix4d(1))
  const tasks: HdTask[] = ['/renderSetupTask', '/renderTask', '/aovInputTask',
    '/colorCorrectionTask', '/presentTask'].map(id => index.getTask(id)!)
  return { hgi, index, delegate, engine, tasks, aovBindings }
}

describe('hdx post-process tasks on a GPU-less Hgi', () => {
  it('aovInputTask publishes the color AOV texture and colorCorrectionTask ping-pongs it ' +
    '(aovInputTask.cpp:149-171, colorCorrectionTask.cpp:1178-1182, task.cpp:64-75)', () => {
    const { hgi, index, engine, tasks, aovBindings } = setUp()
    const { errors } = withDiagnostics(() => engine.Execute(index, tasks))
    // HgiInterop's unsupported destination (the default dstApi OpenGL) is
    // the only error: hgiInterop.cpp:57-61.
    expect(errors).toEqual(['Unsupported destination Hgi backend: OpenGL'])

    const colorBuffer = index.getBprim('renderBuffer', aovBindings[0]!.renderBufferId) as
      unknown as { getResource(ms: boolean): HgiTextureHandle }
    const aovTexture = colorBuffer.getResource(false)
    const color = engine.getTaskContextData(HdAovTokens.color) as HgiTextureHandle
    const intermediate = engine.getTaskContextData(HdxAovTokens.colorIntermediate) as HgiTextureHandle
    // After the toggle, 'color' is the color-corrected intermediate and
    // 'colorIntermediate' the render buffer's texture.
    expect(intermediate.equals(aovTexture)).toBe(true)
    expect(color.equals(aovTexture)).toBe(false)
    expect(color.Get()!.getDescriptor().format).toBe(HgiFormat.HgiFormatFloat16Vec4)
    expect(color.Get()!.getDescriptor().debugName).toBe('AovInput Intermediate Texture')

    // colorCorrectionTask.cpp:1046-1076: screenSize constants and a
    // 3-index draw of the fullscreen triangle.
    const cc = hgi.calls.findIndex(c => c.call === 'gfx.PushDebugGroup' && c.args[0] === 'ColorCorrection')
    expect(cc).toBeGreaterThanOrEqual(0)
    const constants = hgi.calls.slice(cc).find(c => c.call === 'gfx.SetConstantValues' &&
      (c.args[3] as number) === 8)
    expect(constants).toBeDefined()
    expect(Array.from(new Float32Array((constants!.args[4] as Uint8Array).slice().buffer))).toEqual([64, 32])
    expect(hgi.calls.slice(cc).some(c => c.call === 'gfx.DrawIndexed' && c.args[1] === 3)).toBe(true)

    // aovInputTask.cpp:76-79 / presentTask.cpp:114-117: one frame.
    expect(hgi.frames).toEqual(['start', 'end'])
  })

  it('colorCorrectionTask diagnoses the openColorIO mode it cannot honor ' +
    '(FAITHFULNESS-DEBT(hdx-ocio))', () => {
    const { index, engine, tasks } = setUp(HdxColorCorrectionTokens.openColorIO)
    const { warnings } = withDiagnostics(() => engine.Execute(index, tasks))
    expect(warnings.some(w => w.includes('OpenColorIO is not available'))).toBe(true)
  })

  it('HdxPresentTask::IsFormatSupported rejects integer and compressed formats ' +
    '(presentTask.cpp:17-37)', () => {
    expect(HdxPresentTask.isFormatSupported(HgiFormat.HgiFormatFloat16Vec4)).toBe(true)
    expect(HdxPresentTask.isFormatSupported(HgiFormat.HgiFormatUNorm8Vec4)).toBe(true)
    expect(HdxPresentTask.isFormatSupported(HgiFormat.HgiFormatInt32)).toBe(false)
    expect(HdxPresentTask.isFormatSupported(HgiFormat.HgiFormatUInt16Vec4)).toBe(false)
    expect(HdxPresentTask.isFormatSupported(HgiFormat.HgiFormatBC7UNorm8Vec4)).toBe(false)
  })

  it('HdxHgiConversions follows hgiConversions.cpp:17-57', () => {
    expect(HdxHgiConversions.getHgiFormat(HdFormat.HdFormatUNorm8Vec3)).toBe(HgiFormat.HgiFormatInvalid)
    expect(HdxHgiConversions.getHgiFormat(HdFormat.HdFormatFloat16Vec4)).toBe(HgiFormat.HgiFormatFloat16Vec4)
    expect(HdxHgiConversions.getHgiFormat(HdFormat.HdFormatFloat32UInt8)).toBe(HgiFormat.HgiFormatFloat32UInt8)
    expect(HdxHgiConversions.getHdFormat(HgiFormat.HgiFormatInt32Vec4)).toBe(HdFormat.HdFormatInt32Vec4)
  })
})
