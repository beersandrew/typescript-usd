// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/pickFromRenderBufferTask.cpp,
//  pxr/imaging/hdx/pickFromRenderBufferTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/pickFromRenderBufferTask.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergences:
// - Map() of a Storm render buffer reads the texture back, which is
//   asynchronous with WebGPU (hdSt/src/renderBuffer.ts MapAsync). Execute
//   starts the maps and resolves into contextParams.outHits when they
//   complete; callers await GetPendingResolve() (as for HdxPickTask,
//   pickTask.ts header). Render buffers without MapAsync are mapped with
//   Map() as upstream.
// - Task dirty bits are passed by value and cleared by the render index.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported; operator<<
//   is not ported.

import { Type as TfType } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec4d as GfVec4d,
  Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  ChangeTracker as HdChangeTracker,
  PrimTypeTokens as HdPrimTypeTokens,
  type Camera as HdCamera,
  type DirtyBits as HdDirtyBits,
  type RenderBuffer as HdRenderBuffer,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  ConformedWindow as CameraUtilConformedWindow,
  Framing as CameraUtilFraming,
  type ConformWindowPolicy as CameraUtilConformWindowPolicy,
} from 'typescript-usd/cameraUtil'
import { HdxPickResult, HdxPickTaskContextParams, HdxPickTokens } from './pickTask.ts'
import { HdxTask } from './task.ts'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'

/** pickFromRenderBufferTask.h:20-54. Pick task params. */
export class HdxPickFromRenderBufferTaskParams {
  primIdBufferPath = ''
  instanceIdBufferPath = ''
  elementIdBufferPath = ''
  normalBufferPath = ''
  depthBufferPath = ''

  // The id of the camera used to generate the id buffers.
  cameraId = ''

  // The framing specifying how the camera frustum in mapped into the
  // render buffers.
  framing = new CameraUtilFraming()
  // Is application overriding the window policy of the camera.
  overrideWindowPolicy: CameraUtilConformWindowPolicy | undefined = undefined

  // The viewport of the camera used to generate the id buffers.
  // Only used if framing is invalid - for legacy clients.
  viewport = new GfVec4d(0, 0, 0, 0)

  /** The struct's copy. */
  Clone(): HdxPickFromRenderBufferTaskParams {
    return Object.assign(new HdxPickFromRenderBufferTaskParams(), this)
  }

  /** pickFromRenderBufferTask.cpp:302-312 (operator==) */
  Equals(rhs: HdxPickFromRenderBufferTaskParams): boolean {
    return this.primIdBufferPath === rhs.primIdBufferPath &&
      this.instanceIdBufferPath === rhs.instanceIdBufferPath &&
      this.elementIdBufferPath === rhs.elementIdBufferPath &&
      this.normalBufferPath === rhs.normalBufferPath &&
      this.depthBufferPath === rhs.depthBufferPath &&
      this.cameraId === rhs.cameraId
  }
}
export const HdxPickFromRenderBufferTaskParamsType =
  TfType.declare('HdxPickFromRenderBufferTaskParams')

/** Map (or MapAsync) of a render buffer (see the header). */
async function _Map(buffer: HdRenderBuffer | null): Promise<Uint8Array | null> {
  if (!buffer) return null
  const b = buffer as HdRenderBuffer & { MapAsync?: () => Promise<Uint8Array | null> }
  const data = b.MapAsync ? await b.MapAsync() : b.Map() as Uint8Array | null
  return data
}

/** pickFromRenderBufferTask.h:56-119. A task for running picking queries
 *  against pre-existing id buffers. */
export class HdxPickFromRenderBufferTask extends HdxTask {
  private _params = new HdxPickFromRenderBufferTaskParams()
  private _contextParams = new HdxPickTaskContextParams()
  // We need to cache a pointer to the render index so Execute() can
  // map prim ID to paths.
  private _index: HdRenderIndex | null = null

  private _primId: HdRenderBuffer | null = null
  private _instanceId: HdRenderBuffer | null = null
  private _elementId: HdRenderBuffer | null = null
  private _normal: HdRenderBuffer | null = null
  private _depth: HdRenderBuffer | null = null
  private _camera: HdCamera | null = null

  private _converged = false
  private _pendingResolve: Promise<void> = Promise.resolve()

  /** pickFromRenderBufferTask.cpp:11-23 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** The maps and resolve of the last Execute (see the header). */
  getPendingResolve(): Promise<void> {
    return this._pendingResolve
  }

  /** pickFromRenderBufferTask.cpp:27-31 */
  override isConverged(): boolean {
    return this._converged
  }

  /** pickFromRenderBufferTask.cpp:33-47 */
  protected _sync(delegate: HdSceneDelegate, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    let contextParams = ctx.get(HdxPickTokens.pickParams)
    if (contextParams instanceof VtValue) {
      contextParams = contextParams.IsEmpty() ? undefined : contextParams.UncheckedGet()
    }
    if (contextParams instanceof HdxPickTaskContextParams) {
      this._contextParams = contextParams
    }
    this._index = delegate.getRenderIndex()

    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxPickFromRenderBufferTaskParams)
      if (params) this._params = params.Clone()
    }
  }

  /** pickFromRenderBufferTask.cpp:49-75 */
  Prepare(_ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    const bprim = (path: string) => (renderIndex.getBprim(
      HdPrimTypeTokens.renderBuffer, path) ?? null) as HdRenderBuffer | null
    this._primId = bprim(this._params.primIdBufferPath)
    this._instanceId = bprim(this._params.instanceIdBufferPath)
    this._elementId = bprim(this._params.elementIdBufferPath)
    this._normal = bprim(this._params.normalBufferPath)
    this._depth = bprim(this._params.depthBufferPath)

    this._camera = (renderIndex.getSprim(HdPrimTypeTokens.camera,
      this._params.cameraId) ?? null) as HdCamera | null
  }

  /** pickFromRenderBufferTask.cpp:77-100 */
  private _computeProjectionMatrix(): GfMatrix4d {
    // Same logic as in HdRenderPassState::GetProjectionMatrix().
    const camera = this._camera!
    if (this._params.framing.isValid()) {
      const policy = this._params.overrideWindowPolicy !== undefined
        ? this._params.overrideWindowPolicy
        : camera.getWindowPolicy()
      return this._params.framing.applyToProjectionMatrix(
        camera.computeProjectionMatrix(), policy)
    } else {
      const v = this._params.viewport
      const aspect = v.get(3) !== 0.0 ? v.get(2) / v.get(3) : 1.0
      return CameraUtilConformedWindow(
        camera.computeProjectionMatrix(),
        camera.getWindowPolicy(),
        aspect) as GfMatrix4d
    }
  }

  /** pickFromRenderBufferTask.cpp:102-287 (see the header). */
  Execute(_ctx: HdTaskContext): void {
    const primId = this._primId, depth = this._depth, normal = this._normal
    const elementId = this._elementId, instanceId = this._instanceId

    // We need primId, depth, and a source camera to do anything. The other
    // inputs are optional...
    if (!primId || !depth || !this._camera) {
      this._converged = true
      return
    }

    // Resolve the render buffers.
    primId.resolve()
    this._converged = primId.isConverged()

    depth.resolve()
    this._converged = this._converged && depth.isConverged()
    if (depth.getWidth() !== primId.getWidth() ||
      depth.getHeight() !== primId.getHeight()) {
      TF_WARN(`Depth buffer ${this._params.depthBufferPath} has different dimensions ` +
        `than Prim Id buffer ${this._params.primIdBufferPath}`)
      return
    }

    if (normal) {
      normal.resolve()
      this._converged = this._converged && normal.isConverged()
      if (normal.getWidth() !== primId.getWidth() ||
        normal.getHeight() !== primId.getHeight()) {
        TF_WARN(`Normal buffer ${this._params.normalBufferPath} has different dimensions ` +
          `than Prim Id buffer ${this._params.primIdBufferPath}`)
        return
      }
    }
    if (elementId) {
      elementId.resolve()
      this._converged = this._converged && elementId.isConverged()
      if (elementId.getWidth() !== primId.getWidth() ||
        elementId.getHeight() !== primId.getHeight()) {
        TF_WARN(`Element Id buffer ${this._params.elementIdBufferPath} has different dimensions ` +
          `than Prim Id buffer ${this._params.primIdBufferPath}`)
        return
      }
    }
    if (instanceId) {
      instanceId.resolve()
      this._converged = this._converged && instanceId.isConverged()
      if (instanceId.getWidth() !== primId.getWidth() ||
        instanceId.getHeight() !== primId.getHeight()) {
        TF_WARN(`Instance Id buffer ${this._params.instanceIdBufferPath} has different dimensions ` +
          `than Prim Id buffer ${this._params.primIdBufferPath}`)
        return
      }
    }

    const renderBufferSize = new GfVec2i(primId.getWidth(), primId.getHeight())

    // A bit of trickiness: instead of being given an (x,y,radius) tuple,
    // we're given a pick frustum with which to generate an id render.
    // Since we're re-using the id buffers from the main render, we need to
    // project the pick frustum near plane onto the main-render window
    // coordinate space, so that we can determine the subregion of the ID
    // buffer to look at.

    // Get the view, projection used to generate the ID buffers.
    const renderView = this._camera.getTransform().getInverse()
    const renderProj = this._computeProjectionMatrix()

    // ndcToRenderBufferXf transforms renderbuffer NDC to integer
    // renderbuffer indices, assuming (-1,-1) maps to 0,0 and (1,1) maps to
    // w,h.
    const ndcToRenderBufferXf = new GfMatrix4d(1)
    if (this._params.framing.isValid()) {
      // Framing policy may adjust displayWindow, such as due to masking.
      // Use the framing displayWindow when mapping NDC to account for this.
      const windowSize = this._params.framing.displayWindow.getSize()
      const windowMidp = this._params.framing.displayWindow.getMidpoint()
      ndcToRenderBufferXf.setScale(
        new GfVec3d(0.5 * windowSize.get(0), 0.5 * windowSize.get(1), 1))
      ndcToRenderBufferXf.setTranslateOnly(
        new GfVec3d(windowMidp.get(0), windowMidp.get(1), 0))
    } else {
      // If no framing policy is provided, assume NDC covers renderbuffer.
      ndcToRenderBufferXf.setScale(new GfVec3d(
        0.5 * renderBufferSize.get(0), 0.5 * renderBufferSize.get(1), 1))
      ndcToRenderBufferXf.setTranslateOnly(new GfVec3d(
        0.5 * renderBufferSize.get(0), 0.5 * renderBufferSize.get(1), 0))
    }

    // Transform the corners of the pick frustum near plane from picking
    // NDC space to main render NDC space to render buffer indices.
    const pickNdcToRenderBuffer =
      this._contextParams.viewMatrix.getMultiply(this._contextParams.projectionMatrix).getInverse()
        .getMultiply(renderView).getMultiply(renderProj).getMultiply(ndcToRenderBufferXf)

    // Calculate the ID buffer area of interest: the indices of the pick
    // frustum near plane.

    // Take the min and max corners in NDC space as representatives.
    const corner0 = pickNdcToRenderBuffer.Transform(new GfVec3d(-1, -1, -1))
    const corner1 = pickNdcToRenderBuffer.Transform(new GfVec3d(1, 1, -1))
    // Once transformed, find the minimum and maximum bounds of these points.
    let pickMin = [Math.min(corner0.get(0), corner1.get(0)), Math.min(corner0.get(1), corner1.get(1))]
    let pickMax = [Math.max(corner0.get(0), corner1.get(0)), Math.max(corner0.get(1), corner1.get(1))]
    // Since we're turning these into integer indices, round away from the
    // center; otherwise, we'll miss relevant pixels.
    pickMin = [Math.floor(pickMin[0]!), Math.floor(pickMin[1]!)]
    pickMax = [Math.ceil(pickMax[0]!), Math.ceil(pickMax[1]!)]
    const subRect = new GfVec4i(
      Math.trunc(pickMin[0]!), Math.trunc(pickMin[1]!),
      Math.trunc(pickMax[0]! - pickMin[0]!), Math.trunc(pickMax[1]! - pickMin[1]!))

    // Depth range of the "depth" AOV is (0,1)
    const depthRange = new GfVec2f(0, 1)

    const contextParams = this._contextParams
    const index = this._index!
    const ints = (b: Uint8Array | null) =>
      b && b.byteLength > 0 ? new Int32Array(b.buffer, b.byteOffset, b.byteLength >> 2) : null

    this._pendingResolve = (async () => {
      const [primIdPtr, depthPtr, normalPtr, elementIdPtr, instanceIdPtr] = await Promise.all([
        _Map(primId), _Map(depth), _Map(normal), _Map(elementId), _Map(instanceId)])

      // For un-projection in HdxPickResult, we need to provide "viewMatrix"
      // and "projectionMatrix", to be combined into ndcToWorld.
      // Since the id buffers were generated by the main render pass,
      // specify the transform in terms of the main render pass.
      const result = new HdxPickResult(
        ints(primIdPtr),
        ints(instanceIdPtr),
        ints(elementIdPtr),
        null,
        null,
        ints(normalPtr),
        depthPtr && depthPtr.byteLength > 0
          ? new Float32Array(depthPtr.buffer, depthPtr.byteOffset, depthPtr.byteLength >> 2) : null,
        index, contextParams.pickTarget,
        renderView, renderProj, depthRange,
        renderBufferSize, subRect)

      // Resolve!
      if (contextParams.resolveMode === HdxPickTokens.resolveNearestToCenter) {
        result.resolveNearestToCenter(contextParams.outHits)
      } else if (contextParams.resolveMode === HdxPickTokens.resolveNearestToCamera) {
        result.resolveNearestToCamera(contextParams.outHits)
      } else if (contextParams.resolveMode === HdxPickTokens.resolveUnique) {
        result.resolveUnique(contextParams.outHits)
      } else if (contextParams.resolveMode === HdxPickTokens.resolveAll) {
        result.resolveAll(contextParams.outHits)
      } else {
        TF_CODING_ERROR(`Unrecognized interesection mode '${contextParams.resolveMode}'`)
      }

      if (primIdPtr) primId.unmap()
      if (normalPtr) normal!.unmap()
      if (elementIdPtr) elementId!.unmap()
      if (instanceIdPtr) instanceId!.unmap()
      if (depthPtr) depth.unmap()
    })()
  }
}
