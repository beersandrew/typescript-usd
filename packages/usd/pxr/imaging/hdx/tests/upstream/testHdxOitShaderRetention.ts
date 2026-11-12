// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxOitShaderRetention.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxOitShaderRetention.cpp
// (OpenUSD 26.11.1): regression test for shader recompilation after garbage
// collection in OIT. It writes no images; the reference build exits 0
// (hdx/tests/fixtures/testenvImages/testHdxOitShaderRetention/capture.json).
//
// Divergences: the GL debug window is not created; Hgi is given (creating a
// WebGPU Hgi is asynchronous). Returns the exit status and stdout instead of
// exiting.

import { TfErrorMark } from 'typescript-usd/tf'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  Engine as HdEngine,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  RenderIndex as HdRenderIndex,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { RenderDelegate as HdStRenderDelegate, type ResourceRegistry as HdStResourceRegistry } from 'typescript-usd/hdSt'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

/** testHdxOitShaderRetention.cpp:36-96 */
export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()

  const perfLog = HdPerfLog.GetInstance()
  perfLog.enable()

  const driver = { name: HgiTokens.renderDriver, driver: hgi }

  const renderDelegate = new HdStRenderDelegate()
  const index = HdRenderIndex.new(renderDelegate, [driver])
  TF_VERIFY(index !== null)

  const delegate = new Hdx_UnitTestDelegate(index!)
  const engine = new HdEngine()

  const oitRenderTaskId = '/OitRenderTask'
  const oitResolveTaskId = '/OitResolveTask'
  delegate.addOitRenderTask(oitRenderTaskId)
  delegate.addOitResolveTask(oitResolveTaskId)
  delegate.addGrid('/Grid', new GfMatrix4d(1.))

  const tasks: HdTask[] = [
    index!.getTask(oitRenderTaskId)!,
    index!.getTask(oitResolveTaskId)!]

  // Render once to compile all OIT GLSL programs.
  engine.Execute(index!, tasks)

  // Trigger garbage collection. With the fix, each pass holds its own render
  // pass state, so both compiled programs stay referenced and survive.
  // Without the fix, the shared state swaps shaders, dropping the opaque
  // program's refcount to 1 and letting garbage collection free it.
  const resourceRegistry = renderDelegate.getResourceRegistry() as HdStResourceRegistry
  TF_VERIFY(resourceRegistry)
  resourceRegistry.garbageCollect()

  // Garbage collection resets instGlslProgram to the surviving count.
  // Zero it so any increment on the next render means a freed program
  // was recompiled.
  perfLog.setCounter(HdPerfTokens.instGlslProgram, 0.)

  engine.Execute(index!, tasks)

  const compilesAfterGC = perfLog.getCounter(HdPerfTokens.instGlslProgram)

  TF_VERIFY(compilesAfterGC === 0., 'OIT Shaders were freed by garbage ' +
    `collection, ${compilesAfterGC} GLSL program(s) recompiled`)
  if (mark.isClean()) {
    return { status: 0, stdout: 'OK\n' }
  }
  return { status: 1, stdout: 'FAILED\n' }
}
