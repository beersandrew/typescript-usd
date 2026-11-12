// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImagingGL/engine.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdxTaskControllerSceneIndex (src/taskControllerSceneIndex.ts) inserted into
// a Storm render index as UsdImagingGLEngine inserts it
// (usdImagingGL/engine.cpp), with a scene from Hdx_UnitTestDelegate, run
// through HdEngine on a GPU-less Hgi reporting the reference device's
// capabilities. Controller (Node) test, no pixels: it checks that every task
// path the controller returns is a task of the render index (the legacy task
// prims become HdTasks through scene index emulation) and that a frame runs
// without coding errors.

import { describe, expect, it } from 'vitest'
import { HgiTexture, HgiHandle, HgiSampler, HgiTokens, type HgiSamplerDesc, type HgiBlitCmds, type HgiTextureDesc, type HgiTextureHandle } from 'typescript-usd/hgi'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { Frustum as GfFrustum, Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec4d as GfVec4d } from 'typescript-usd/gf'
import { AovTokens as HdAovTokens, Engine as HdEngine, RenderIndex as HdRenderIndex, type Task as HdTask } from 'typescript-usd/hd'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { Hdx_RegisterShaderResources } from '../../src/shaderResources.ts'
import { HdxTaskControllerSceneIndex } from '../../src/taskControllerSceneIndex.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { PipelineDrawBatchTestHgi } from '../../../hdSt/tests/pipelineDrawBatchTestHgi.ts'
import '../../../hdSt/src/index.ts'

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
  override createSampler(...args: unknown[]): never {
    return new HgiHandle<HgiSampler>(new _Sampler(args[0] as HgiSamplerDesc), this.getUniqueId()) as never
  }
  override createBlitCmds(): HgiBlitCmds {
    const cmds = super.createBlitCmds()
    cmds.copyTextureGpuToCpu = () => {}
    return cmds
  }
}

describe('HdxTaskControllerSceneIndex in a Storm render index (GPU-less Hgi)', () => {
  it('returns task paths that are render index tasks and runs a frame without coding errors', () => {
    Hdx_RegisterShaderResources()
    const errors: string[] = []
    const diag = {
      issueError(e: { getCommentary?: () => string }) { errors.push(e.getCommentary?.() ?? String(e)) },
      issueWarning() {}, issueStatus() {},
    }
    TfDiagnosticMgr.GetInstance().addDelegate(diag as never)
    try {
      const hgi = new _DriverHgi()
      const renderDelegate = new HdStRenderDelegate()
      const index = HdRenderIndex.new(renderDelegate, [{ name: HgiTokens.renderDriver, driver: hgi }])!
      const scene = new Hdx_UnitTestDelegate(index, '/scene')
      scene.addGrid('/scene/grid', new GfMatrix4d(1))

      const tc = HdxTaskControllerSceneIndex.new({
        prefix: '/__taskController',
        aovDescriptorCallback: name => renderDelegate.getDefaultAovDescriptor(name),
        isForStorm: true,
        gpuEnabled: true,
      })
      index.insertSceneIndex(tc, '/', false)
      // Offscreen, as usdrecord (usdAppUtils/frameRecorder.cpp:70) disables
      // presentation through the engine.
      tc.setEnablePresentation(false)
      tc.setRenderOutputs([HdAovTokens.color])
      tc.setRenderViewport(new GfVec4d(0, 0, 64, 64))
      const frustum = new GfFrustum()
      frustum.setPosition(new GfVec3d(0, 0, 3))
      tc.setFreeCameraMatrices(frustum.computeViewMatrix(), frustum.computeProjectionMatrix())

      const paths = tc.getRenderingTaskPaths()
      const tasks = paths.map(p => index.getTask(p))
      expect(paths.filter((_, i) => !tasks[i])).toEqual([])
      expect(tc.getPickingTaskPaths().every(p => index.getTask(p))).toBe(true)

      new HdEngine().Execute(index, tasks as HdTask[])
      expect(errors).toEqual([])
    } finally {
      TfDiagnosticMgr.GetInstance().removeDelegate(diag as never)
    }
  })
})
