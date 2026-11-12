// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxCameraAndLight.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxCameraAndLight.cpp (OpenUSD
// 26.11.1). It writes no images; the reference build exits 0 (hdx/tests/
// fixtures/testenvImages/testHdxCameraAndLight/capture.json).
//
// Divergences: the GL debug window is not created; Hgi is given (creating a
// WebGPU Hgi is asynchronous). Returns the exit status and stdout instead of
// exiting.

import { TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import { Matrix4d as GfMatrix4d, Vec2i as GfVec2i, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  Camera as HdCamera,
  Engine as HdEngine,
  LightTokens as HdLightTokens,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  RenderIndex as HdRenderIndex,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { SimpleLight as GlfSimpleLight } from 'typescript-usd/glf'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')
// light.h:47-55 HdLight::DirtyCollection
const HdLight_DirtyCollection = 1 << 3

/** testHdxCameraAndLight.cpp:30-35 (VERIFY_PERF_COUNT) */
function VERIFY_PERF_COUNT(perfLog: HdPerfLog, token: string, count: number): void {
  TF_VERIFY(perfLog.getCounter(token) === count,
    `expected ${count} found ${perfLog.getCounter(token).toFixed(0)}`)
}

/** testHdxCameraAndLight.cpp:39-138 */
async function CameraAndLightTest(hgi: Hgi): Promise<void> {
  // Hgi and HdDriver should be constructed before HdEngine to ensure they
  // are destructed last. Hgi may be used during engine/delegate destruction.
  const driver = { name: HgiTokens.renderDriver, driver: hgi }

  const renderDelegate = new HdStRenderDelegate()
  const index = HdRenderIndex.new(renderDelegate, [driver])!
  TF_VERIFY(index)
  const delegate = new Hdx_UnitTestDelegate(index)

  const tracker = index.getChangeTracker()
  const perfLog = HdPerfLog.GetInstance()
  perfLog.enable()
  const collection = new HdRprimCollection(HdTokens.geometry,
    new HdReprSelector(HdReprTokens.hull))
  const engine = new HdEngine()

  // --------------------------------------------------------------------

  // prep tasks
  const renderSetupTask = '/renderSetupTask'
  const renderTask = '/renderTask'
  delegate.addRenderSetupTask(renderSetupTask)
  delegate.addRenderTask(renderTask)
  const tasks: HdTask[] = []
  tasks.push(index.getTask(renderSetupTask)!)
  tasks.push(index.getTask(renderTask)!)

  // Setup AOVs
  const aovBindings = delegate.addAovBindings(new GfVec2i(512, 512))

  // Set render task param
  delegate.setTaskParam(
    renderTask, HdTokens.collection, VtValue.create(collection, _HdRprimCollectionType))

  // Set render setup param
  const vParam = delegate.getTaskParam(renderSetupTask, HdTokens.params)
  const param = vParam.Get<HdxRenderTaskParams>().Clone()
  param.enableLighting = true
  param.aovBindings = aovBindings
  delegate.setTaskParam(renderSetupTask, HdTokens.params,
    VtValue.create(param, HdxRenderTaskParamsType))

  // Set up scene
  const tx = new GfMatrix4d(1.0)
  tx.setRow(3, new GfVec4f(5, 0, 5, 1.0))
  const cube = '/geometry'
  delegate.addCube(cube, tx)

  const camera = '/camera_test'
  const light = '/light'

  delegate.addCamera(camera)
  delegate.addLight(light, new GlfSimpleLight())
  delegate.setLight(light, HdLightTokens.shadowCollection,
    VtValue.create(new HdRprimCollection(HdTokens.geometry,
      new HdReprSelector(HdReprTokens.hull)), _HdRprimCollectionType))

  // Draw
  engine.Execute(index, tasks)

  VERIFY_PERF_COUNT(perfLog, HdPerfTokens.rebuildBatches, 1)

  // Update camera matrix
  delegate.setCamera(camera, new GfMatrix4d(2), new GfMatrix4d(2))
  tracker.markSprimDirty(camera, HdCamera.DirtyTransform)
  tracker.markSprimDirty(camera, HdCamera.DirtyParams)

  engine.Execute(index, tasks)

  // batch should not be rebuilt
  VERIFY_PERF_COUNT(perfLog, HdPerfTokens.rebuildBatches, 1)

  // Update shadow collection
  delegate.setLight(light, HdLightTokens.shadowCollection,
    VtValue.create(new HdRprimCollection(HdTokens.geometry,
      new HdReprSelector(HdReprTokens.refined)), _HdRprimCollectionType))
  tracker.markSprimDirty(light, HdLight_DirtyCollection)

  engine.Execute(index, tasks)

  // batch rebuilt
  VERIFY_PERF_COUNT(perfLog, HdPerfTokens.rebuildBatches, 2)

  // Update shadow collection again with the same data
  delegate.setLight(light, HdLightTokens.shadowCollection,
    VtValue.create(new HdRprimCollection(HdTokens.geometry,
      new HdReprSelector(HdReprTokens.refined)), _HdRprimCollectionType))
  tracker.markSprimDirty(light, HdLight_DirtyCollection)

  engine.Execute(index, tasks)

  // batch should not be rebuilt
  VERIFY_PERF_COUNT(perfLog, HdPerfTokens.rebuildBatches, 2)
}

/** testHdxCameraAndLight.cpp:140-158 */
export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()

  await CameraAndLightTest(hgi)

  TF_VERIFY(mark.isClean())

  if (mark.isClean()) {
    return { status: 0, stdout: 'OK\n' }
  } else {
    return { status: 1, stdout: 'FAILED\n' }
  }
}
