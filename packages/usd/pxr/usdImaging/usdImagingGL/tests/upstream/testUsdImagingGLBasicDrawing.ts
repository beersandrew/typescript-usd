// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLBasicDrawing.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLBasicDrawing.cpp
// (OpenUSD 26.11.1): the program 436 of the registered usdImagingGL tests run
// (pxr/usdImaging/usdImagingGL/CMakeLists.txt), with different stages and
// flags. It runs in a browser (WebGPU); the Safari runner is
// tests/browser/usdimaging-gl-image/run.mjs.
//
// Divergences:
// - InitTest/DrawTest are asynchronous (UsdStage::Open is), and the engine is
//   given the driver's Hgi (unitTestGLDrawing.ts header).
// - HdPerfLog counters (itemsDrawn, totalItemCount) are not ported; their
//   stdout lines are not printed.
// - glFinish has no counterpart; WriteToFile reads the AOV back after the
//   GPU work completes.
// - Storm's texture loading is asynchronous here
//   (hdSt/src/textureObjectRegistry.ts): the engine is not converged while
//   textures wait for their load (hdSt/src/renderPass.ts), so the
//   render-to-convergence loop awaits the pending texture loads before it
//   renders again; the image has the loaded textures, as upstream's
//   synchronous commit does.
// - Stdout lines are collected with the `log` callback.
// - The render-to-convergence loop yields to the event loop between
//   iterations, so that GPU readbacks a task waits for (HdxVisualizeAovTask's
//   depth range, visualizeAovTask.ts) complete; upstream's readbacks block.

import { Frustum as GfFrustum, Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec4d as GfVec4d, Vec2i as GfVec2i, makeRotation as GfMakeRotation } from 'typescript-usd/gf'
import { Framing as CameraUtilFraming } from 'typescript-usd/cameraUtil'
import { SimpleLight as GlfSimpleLight, SimpleLightingContext as GlfSimpleLightingContext, SimpleMaterial as GlfSimpleMaterial } from 'typescript-usd/glf'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { BBoxCache as UsdGeomBBoxCache, getStageUpAxis as UsdGeomGetStageUpAxis } from 'typescript-usd/usdGeom'
import { TfErrorMark } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { HgiTokens, type Hgi } from 'typescript-usd/hgi'
import { UsdImagingGLEngine } from '../../src/engine.ts'
import { UsdImagingGLRenderParams } from '../../src/renderParams.ts'
import { UsdImagingGL_UnitTestGLDrawing } from '../../src/unitTestGLDrawing.ts'


/** The UsdGeomTokens the test uses. */
const UsdGeomTokens = { default_: 'default', guide: 'guide', proxy: 'proxy', render: 'render', z: 'Z' }

/** std::setw(3) << std::setfill('0') << frame (an int-valued double prints
 *  without decimals). */
function _FrameSuffix(frame: number): string {
  const s = String(frame)
  return s.length >= 3 ? s : '0'.repeat(3 - s.length) + s
}

/** testUsdImagingGLBasicDrawing.cpp:41-75 */
export class My_TestGLDrawing extends UsdImagingGL_UnitTestGLDrawing {
  private _stage: UsdStage | undefined
  private _engine: UsdImagingGLEngine | null = null
  private _lightingContext: GlfSimpleLightingContext | null = null
  private _rotate: [number, number] = [0, 0]
  private _translateXyz: [number, number, number] = [0, 0, 0]
  private _mousePos: [number, number] = [0, 0]
  private _mouseButton: [boolean, boolean, boolean] = [false, false, false]

  constructor(hgi: Hgi, private readonly _log: (line: string) => void = () => {}) {
    super(hgi)
  }

  /** The engine, for runners that report on the render index. */
  getEngine(): UsdImagingGLEngine | null { return this._engine }

  /** testUsdImagingGLBasicDrawing.cpp:77-194 */
  override async initTest(): Promise<void> {
    this._log('My_TestGLDrawing::InitTest()')
    this._stage = await UsdStage.open(this.getStageFilePath(),
      { loadPayloads: !this.isEnabledUnloadedAsBounds() })
    if (!this._stage) {
      throw new Error(`could not open ${this.getStageFilePath()}`)
    }

    this._engine = new UsdImagingGLEngine({
      rendererPluginId: this._getRenderer(),
      rootPath: '/',
      displayUnloadedPrimsWithBounds: this.isEnabledUnloadedAsBounds(),
      driver: { name: HgiTokens.renderDriver, driver: this.getHgi() },
    })
    if (this._getRenderer() !== '') {
      if (!this._engine.setRendererPlugin(this._getRenderer())) {
        throw new Error(`Couldn't set renderer plugin: ${this._getRenderer()}`)
      } else {
        this._log(`Renderer plugin: ${this._getRenderer()}`)
      }
    }

    for (const [key, setting] of this.getRenderSettings()) {
      this._engine.setRendererSetting(key, VtValue.create(setting.value,
        setting.type === 'float' ? VtValueTypes.float : VtValueTypes.bool))
    }

    if (this._ShouldFrameAll()) {
      const purposes: string[] = [UsdGeomTokens.default_]
      if (this.isShowGuides()) {
        purposes.push(UsdGeomTokens.guide)
      }
      if (this.isShowProxy()) {
        purposes.push(UsdGeomTokens.proxy)
      }
      if (this.isShowRender()) {
        purposes.push(UsdGeomTokens.render)
      }

      // Extent hints are sometimes authored as an optimization to avoid
      // computing bounds, they are particularly useful for some tests where
      // there is no bound on the first frame.
      const useExtentHints = true
      const bboxCache = new UsdGeomBBoxCache(UsdTimeCode.Default(), purposes, useExtentHints)

      const bbox = bboxCache.computeWorldBound(this._stage.getPrim('/')!)
      const world = bbox.ComputeAlignedRange()

      const worldCenter = world.getMin().add(world.getMax()).getDivided(2.0)
      const worldSize = world.getSize().GetLength()

      this._log(`worldCenter: ${worldCenter}`)
      this._log(`worldSize: ${worldSize}`)
      // The C++ _translate is float[3].
      const f = Math.fround
      if (UsdGeomGetStageUpAxis(this._stage) === UsdGeomTokens.z) {
        // transpose y and z centering translation
        this._translateXyz[0] = f(-worldCenter.get(0))
        this._translateXyz[1] = f(-worldCenter.get(2))
        this._translateXyz[2] = f(-worldCenter.get(1) - worldSize)
      } else {
        this._translateXyz[0] = f(-worldCenter.get(0))
        this._translateXyz[1] = f(-worldCenter.get(1))
        this._translateXyz[2] = f(-worldCenter.get(2) - worldSize)
      }
    } else {
      this._translateXyz[0] = this.getTranslate().get(0)
      this._translateXyz[1] = this.getTranslate().get(1)
      this._translateXyz[2] = this.getTranslate().get(2)
    }

    if (this.isEnabledTestLighting()) {
      this._lightingContext = GlfSimpleLightingContext.new()
      // set same parameter as GlfSimpleLightingContext::SetStateFromOpenGL
      // OpenGL defaults
      if (!this.isEnabledSceneLights()) {
        const light = new GlfSimpleLight()
        if (this.isEnabledCameraLight()) {
          light.setPosition(new GfVec4f(this._translateXyz[0], this._translateXyz[2], this._translateXyz[1], 0))
        } else {
          light.setPosition(new GfVec4f(0, -0.5, 0.5, 0))
        }
        light.setDiffuse(new GfVec4f(1, 1, 1, 1))
        light.setAmbient(new GfVec4f(0, 0, 0, 1))
        light.setSpecular(new GfVec4f(1, 1, 1, 1))
        this._lightingContext.setLights([light])
      }

      const material = new GlfSimpleMaterial()
      material.setAmbient(new GfVec4f(0.2, 0.2, 0.2, 1.0))
      material.setDiffuse(new GfVec4f(0.8, 0.8, 0.8, 1.0))
      material.setSpecular(new GfVec4f(0, 0, 0, 1))
      material.setShininess(Math.fround(0.0001))
      this._lightingContext.setMaterial(material)
      this._lightingContext.setSceneAmbient(new GfVec4f(0.2, 0.2, 0.2, 1.0))
    }
  }

  /** testUsdImagingGLBasicDrawing.cpp:196-351 */
  override async drawTest(_offscreen: boolean): Promise<void> {
    this._log('My_TestGLDrawing::DrawTest()')
    const engine = this._engine!
    const stage = this._stage!

    const width = this.getWidth()
    const height = this.getHeight()

    if (this.getCameraPath() === '') {
      let viewMatrix = new GfMatrix4d(1.0)
      viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([0, 1, 0], this._rotate[0])))
      viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setRotate(GfMakeRotation([1, 0, 0], this._rotate[1])))
      viewMatrix = viewMatrix.getMultiply(new GfMatrix4d().setTranslate(
        new GfVec3d(this._translateXyz[0], this._translateXyz[1], this._translateXyz[2])))

      let modelViewMatrix = viewMatrix
      if (UsdGeomGetStageUpAxis(stage) === UsdGeomTokens.z) {
        // rotate from z-up to y-up
        modelViewMatrix = new GfMatrix4d().setRotate(GfMakeRotation([1.0, 0.0, 0.0], -90.0)).getMultiply(modelViewMatrix)
      }

      const aspectRatio = width / height
      const frustum = new GfFrustum()
      frustum.setPerspective(60.0, aspectRatio, 1, 100000.0)
      const projMatrix = frustum.computeProjectionMatrix()

      engine.setCameraState(modelViewMatrix, projMatrix)
    } else {
      engine.setCameraPath(this.getCameraPath())
    }

    engine.setOverrideWindowPolicy(this.getWindowPolicy())

    const framing = new CameraUtilFraming(this.getDisplayWindow(), this.getDataWindow(), this.getPixelAspectRatio())
    if (framing.isValid()) {
      engine.setRenderBufferSize(new GfVec2i(width, height))
      engine.setFraming(framing)
    } else {
      const viewport = new GfVec4d(0, 0, width, height)
      engine.setRenderViewport(viewport)
    }

    const params = new UsdImagingGLRenderParams()
    params.drawMode = this.getDrawMode()
    params.enableLighting = this.isEnabledTestLighting()
    params.enableSceneMaterials = this.isEnabledSceneMaterials()
    params.complexity = Math.fround(this._getComplexity())
    params.cullStyle = this.getCullStyle()
    params.showGuides = this.isShowGuides()
    params.showRender = this.isShowRender()
    params.showProxy = this.isShowProxy()
    params.clearColor = this.getClearColor()

    engine.setRendererAov(this.getRendererAov())

    if (this.isEnabledTestLighting()) {
      engine.setLightingState(this._lightingContext)
    }

    // Divergence: there is no GL window whose framebuffer the present task
    // composites into (UsdImagingGL_UnitTestWindow, unitTestGLDrawing.cpp);
    // the images are read from the AOVs either way (WriteToFile), so the
    // present task is disabled as with -presentDisabled.
    if (this.presentDisabled() || true) {
      engine.setEnablePresentation(false)
    }

    params.clipPlanes = [...this.getClipPlanes()]

    const root = stage.getPrim('/')!
    for (const t of this.getTimes()) {
      let time = new UsdTimeCode(t)
      if (t === -999) {
        time = UsdTimeCode.Default()
      }

      params.frame = time

      // Make sure we render to convergence.
      const registry = (engine._getRenderIndexForTesting() as { getResourceRegistry?(): unknown } | null)
        ?.getResourceRegistry?.() as { loadTexturesAsync?(): Promise<void> } | undefined
      let convergenceIterations = 0
      let converged: boolean
      do {
        convergenceIterations++
        engine.Render(root, params)
        converged = engine.isConverged()
        if (!converged) {
          // Asynchronous texture loading and GPU readbacks (see the header).
          if (registry?.loadTexturesAsync) await registry.loadTexturesAsync()
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      } while (!converged)

      this._log(`Iterations to convergence: ${convergenceIterations}`)

      let imageFilePath = this.getOutputFilePath()
      if (imageFilePath !== '') {
        if (!time.isDefault()) {
          const suffix = `_${_FrameSuffix(params.frame.GetValue())}.png`
          imageFilePath = imageFilePath.split('.png').join(suffix)
        }
        this._log(imageFilePath)
        await this.writeToFile(engine, 'color', imageFilePath)
      }
    }

    // GetPerfStatsFile(): not written (unitTestGLDrawing.ts header).
  }

  /** testUsdImagingGLBasicDrawing.cpp:353-357 */
  override shutdownTest(): void {
    this._log('My_TestGLDrawing::ShutdownTest()')
  }

  /** testUsdImagingGLBasicDrawing.cpp:359-397 */
  override mousePress(button: number, x: number, y: number, _modKeys: number): void {
    this._mouseButton[button] = true
    this._mousePos[0] = x
    this._mousePos[1] = y
  }

  override mouseRelease(button: number, _x: number, _y: number, _modKeys: number): void {
    this._mouseButton[button] = false
  }

  override mouseMove(x: number, y: number, _modKeys: number): void {
    const dx = x - this._mousePos[0]
    const dy = y - this._mousePos[1]

    if (this._mouseButton[0]) {
      this._rotate[0] += dx
      this._rotate[1] += dy
    } else if (this._mouseButton[1]) {
      this._translateXyz[0] += dx
      this._translateXyz[1] -= dy
    } else if (this._mouseButton[2]) {
      this._translateXyz[2] += dx
    }

    this._mousePos[0] = x
    this._mousePos[1] = y
  }
}

/** testUsdImagingGLBasicDrawing.cpp:399-423: runs the test and returns the
 *  exit code (EXIT_SUCCESS 0 or EXIT_FAILURE 1) and the number of errors. */
export async function BasicTest(argv: readonly string[], driver: My_TestGLDrawing,
  log: (line: string) => void = () => {}): Promise<{ exitCode: number, numErrors: number }> {
  const mark = new TfErrorMark()
  await driver.runTest(argv)

  if (mark.isClean()) {
    log('OK')
    return { exitCode: 0, numErrors: 0 }
  } else {
    const numErrors = _CountErrors(mark)
    if (numErrors <= driver.getNumErrorsAllowed()) {
      log('OK')
      return { exitCode: 0, numErrors }
    }
    log('FAILED')
    return { exitCode: 1, numErrors }
  }
}

/** mark.GetBegin(&numErrors) */
function _CountErrors(mark: TfErrorMark): number {
  const m = mark as unknown as { getBegin(): number, getEnd?(): number }
  const end = m.getEnd?.()
  return end !== undefined ? Math.max(0, end - m.getBegin()) : 1
}
