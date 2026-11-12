// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/testenv/testHdxRenderTask.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxRenderTask.cpp (OpenUSD
// 26.11.1). Browser test program (tests/browser/hdx-image/run.mjs); the native
// captures of its images are hdx/tests/fixtures/testenvImages/
// testHdxRenderTask/color{1,2,3}.png.
//
// Divergences: the GL debug window is not created (offscreen AOVs only); Hgi
// is given (creating a WebGPU Hgi is asynchronous); WriteRenderBufferToFile
// is asynchronous (Hdx_UnitTestDelegate header). Returns the exit status and
// stdout instead of exiting.

import { Token as TfToken, TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import { Matrix4d as GfMatrix4d, Vec2i as GfVec2i, Vec4d as GfVec4d, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  Engine as HdEngine,
  PerfLog as HdPerfLog,
  RenderIndex as HdRenderIndex,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')

/** testHdxRenderTask.cpp:25-28 */
const _tokens = {
  testCollection: TfToken('testCollection'),
}

/** testHdxRenderTask.cpp:30-113 */
export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()
  let stdout = ''

  const perfLog = HdPerfLog.GetInstance()
  perfLog.enable()

  // Hgi and HdDriver should be constructed before HdEngine to ensure they
  // are destructed last. Hgi may be used during engine/delegate destruction.
  const driver = { name: HgiTokens.renderDriver, driver: hgi }

  const renderDelegate = new HdStRenderDelegate()
  const index = HdRenderIndex.new(renderDelegate, [driver])
  TF_VERIFY(index !== null)
  const delegate = new Hdx_UnitTestDelegate(index!)
  const engine = new HdEngine()

  // prep render task
  const renderSetupTask1 = '/renderSetupTask1'
  const renderTask1 = '/renderTask1'
  delegate.addRenderSetupTask(renderSetupTask1)
  delegate.addRenderTask(renderTask1)

  // setup AOVs
  const aovBindings = delegate.addAovBindings(new GfVec2i(512, 512))
  const colorAovId = aovBindings[0]!.renderBufferId

  // update viewport param (defaults to (0,0,512,512) otherwise)
  {
    const vParam = delegate.getTaskParam(renderSetupTask1, HdTokens.params)
    const param = vParam.Get<HdxRenderTaskParams>().Clone()
    param.viewport = new GfVec4d(0, 0, 256, 256)
    param.aovBindings = aovBindings
    delegate.setTaskParam(renderSetupTask1, HdTokens.params,
      VtValue.create(param, HdxRenderTaskParamsType))
  }

  const tasks: HdTask[] = []
  tasks.push(index!.getTask(renderSetupTask1)!)
  tasks.push(index!.getTask(renderTask1)!)

  // prep scene
  delegate.addGrid('/grid', new GfMatrix4d(1))

  // draw #1
  engine.Execute(index!, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color1.png')

  // update render param
  const vParam = delegate.getTaskParam(renderSetupTask1, HdTokens.params)
  const param = vParam.Get<HdxRenderTaskParams>().Clone()
  param.overrideColor = new GfVec4f(1, 0, 0, 1)
  delegate.setTaskParam(renderSetupTask1, HdTokens.params,
    VtValue.create(param, HdxRenderTaskParamsType))

  // draw #2
  engine.Execute(index!, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color2.png')

  // update collection
  index!.getChangeTracker().addCollection(_tokens.testCollection)
  const collection = new HdRprimCollection(_tokens.testCollection,
    new HdReprSelector(HdReprTokens.wire))
  delegate.setTaskParam(renderTask1, HdTokens.collection,
    VtValue.create(collection, _HdRprimCollectionType))

  // draw #3
  engine.Execute(index!, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color3.png')

  if (mark.isClean()) {
    stdout += 'OK\n'
    return { status: 0, stdout }
  } else {
    stdout += 'FAILED\n'
    return { status: 1, stdout }
  }
}
