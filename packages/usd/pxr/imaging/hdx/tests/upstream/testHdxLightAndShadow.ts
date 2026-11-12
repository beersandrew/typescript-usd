// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/testenv/testHdxLightAndShadow.cpp,
//  pxr/imaging/hgiMetal/resourceBindings.mm
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxLightAndShadow.cpp (OpenUSD
// 26.11.1). Browser test program (tests/browser/hdx-image/run.mjs); the native
// captures of its images are hdx/tests/fixtures/testenvImages/
// testHdxLightAndShadow/color{1,2,3,4}.png. The reference build (hgiMetal)
// exits 1: HgiMetalResourceBindings::BindResources posts a failed
// verification (hgiMetal/resourceBindings.mm:40, `texDesc.textures.size() ==
// 1`) for the shadow texture array Storm binds, so the error mark is not
// clean; the images are written anyway.
//
// Divergences: the GL debug window is not created (offscreen AOVs only); Hgi
// is given (creating a WebGPU Hgi is asynchronous); WriteRenderBufferToFile
// is asynchronous (Hdx_UnitTestDelegate header). Returns the exit status and
// stdout instead of exiting.

import { TfErrorMark, Type as TfType } from 'typescript-usd/tf'
import {
  Frustum as GfFrustum,
  Matrix4d as GfMatrix4d,
  Range1d as GfRange1d,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec4f as GfVec4f,
  makeRotation as GfMakeRotation,
} from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  Engine as HdEngine,
  LightTokens as HdLightTokens,
  PerfLog as HdPerfLog,
  RenderIndex as HdRenderIndex,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  Tokens as HdTokens,
  type Task as HdTask,
} from 'typescript-usd/hd'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { SimpleLight as GlfSimpleLight, SimpleLightType as GlfSimpleLightType } from 'typescript-usd/glf'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'
import { TF_VERIFY } from '../../src/tfDiagnostic.ts'

const _HdRprimCollectionType = TfType.declare('HdRprimCollection')

/** testHdxLightAndShadow.cpp:30-161 */
export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {
  const mark = new TfErrorMark()

  const perfLog = HdPerfLog.GetInstance()
  perfLog.enable()

  // Hgi and HdDriver should be constructed before HdEngine to ensure they
  // are destructed last. Hgi may be used during engine/delegate destruction.
  const driver = { name: HgiTokens.renderDriver, driver: hgi }

  const renderDelegate = new HdStRenderDelegate()
  const index = HdRenderIndex.new(renderDelegate, [driver])!
  TF_VERIFY(index)
  const delegate = new Hdx_UnitTestDelegate(index)
  const engine = new HdEngine()

  // --------------------------------------------------------------------

  // prep render task and shadow task
  const simpleLightTask = '/simpleLightTask'
  const shadowTask = '/shadowTask'
  const renderSetupTask = '/renderSetupTask'
  const renderTask = '/renderTask'
  delegate.addSimpleLightTask(simpleLightTask)
  delegate.addShadowTask(shadowTask)
  delegate.addRenderSetupTask(renderSetupTask)
  delegate.addRenderTask(renderTask)
  const tasks: HdTask[] = []
  tasks.push(index.getTask(simpleLightTask)!)
  tasks.push(index.getTask(shadowTask)!)
  tasks.push(index.getTask(renderSetupTask)!)
  tasks.push(index.getTask(renderTask)!)

  // setup AOVs
  const aovBindings = delegate.addAovBindings(new GfVec2i(512, 512))
  const colorAovId = aovBindings[0]!.renderBufferId

  // prep lights
  const light1 = new GlfSimpleLight()
  light1.setDiffuse(new GfVec4f(0.5, 0.5, 0.5, 1.0))
  light1.setPosition(new GfVec4f(1, 0.5, 1, 0))
  light1.setHasShadow(true)
  delegate.addLight('/light1', light1)

  // prep scene
  delegate.addGrid('/grid',
    new GfMatrix4d(10, 0, 0, 0, 0, 10, 0, 0, 0, 0, 10, 0, 0, 0, 0, 1))
  delegate.addCube('/cube',
    new GfMatrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -3, 0, 5, 1))
  delegate.addTet('/tet',
    new GfMatrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 5, 1))
  delegate.setRefineLevel('/cube', 4)
  delegate.setRefineLevel('/tet', 3)

  // camera
  const frustum = new GfFrustum()
  frustum.setNearFar(new GfRange1d(0.1, 1000.0))
  frustum.setPosition(new GfVec3d(0, -5, 10))
  frustum.setRotation(GfMakeRotation([1, 0, 0], 45))
  delegate.setCamera(frustum.computeViewMatrix(),
    frustum.computeProjectionMatrix())

  // set renderTask
  delegate.setTaskParam(
    renderTask, HdTokens.collection,
    VtValue.create(new HdRprimCollection(HdTokens.geometry,
      new HdReprSelector(HdReprTokens.refined)), _HdRprimCollectionType))

  // set render setup param
  const vParam = delegate.getTaskParam(renderSetupTask, HdTokens.params)
  const param = vParam.Get<HdxRenderTaskParams>().Clone()
  param.enableLighting = true
  param.aovBindings = aovBindings
  delegate.setTaskParam(renderSetupTask, HdTokens.params,
    VtValue.create(param, HdxRenderTaskParamsType))

  // --------------------------------------------------------------------
  // draw.
  engine.Execute(index, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color1.png')

  // --------------------------------------------------------------------
  // add light
  const light2 = new GlfSimpleLight()
  light2.setDiffuse(new GfVec4f(0.7, 0.5, 0.3, 1.0))
  light2.setPosition(new GfVec4f(0.3, -0.2, 1, 0))
  light2.setHasShadow(true)
  delegate.addLight('/light2', light2)

  // --------------------------------------------------------------------
  // draw.
  engine.Execute(index, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color2.png')

  // --------------------------------------------------------------------
  // move light
  light2.setPosition(new GfVec4f(-0.3, -0.2, 1, 0))
  delegate.setLight('/light2', HdLightTokens.params,
    VtValue.create(light2, GlfSimpleLightType))

  // --------------------------------------------------------------------
  // draw.
  engine.Execute(index, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color3.png')

  // --------------------------------------------------------------------
  // remove first light
  delegate.removeLight('/light1')

  // --------------------------------------------------------------------
  // draw.
  engine.Execute(index, tasks)
  await delegate.writeRenderBufferToFile(colorAovId, 'color4.png')

  // --------------------------------------------------------------------

  if (mark.isClean()) {
    return { status: 0, stdout: 'OK\n' }
  } else {
    return { status: 1, stdout: 'FAILED\n' }
  }
}
