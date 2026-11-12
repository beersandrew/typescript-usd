// Ported from OpenUSD 26.11.1: pxr/base/gf/frustum.cpp, pxr/base/gf/frustum.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfFrustum value type (view frustum).
//
// Mirrors OpenUSD pxr/base/gf/frustum.{h,cpp}. A GfFrustum represents a viewing
// frustum in 3D eye space — either a parallel (orthographic) or perspective
// projection, thought of as 6 boundary planes. It is specified by:
//   - the viewpoint position,
//   - the rotation applied to the default view frame (looking down -z, +y up),
//   - the 2D window on the reference plane (left/right/top/bottom),
//   - the near/far interval,
//   - the projection type,
//   - the view distance.
//
// The projection- and view-matrix math and the plane/segment intersection +
// narrowing logic are ported VERBATIM (same operation order) so results match
// the Pixar oracle (validated in tests/upstream/frustum.test.ts against goldens
// captured from the OpenUSD 26.11.1 build). Row-vector convention throughout (v' = v·M);
// the view matrix carries the camera basis in COLUMNS (see typescript-usd memory
// row-vector-lookat). No FAITHFULNESS-DEBT.
//
// Rotation is stored as the functional GfRotation surface ({axis, angle}) from
// rotation.ts (the gf rotation representation); direction rotations go through a
// GfMatrix4d built with SetRotate, exactly as GfRotation::TransformDir does.

import { GfVec2d, GfVec3d, GfVec4d, GfCompMult, GfCross } from './vec.ts'
import { GfMatrix4d } from './matrixData.ts'
import { GfRange1d, GfRange2d, GfRange3d } from './range.ts'
import { GfBBox3d } from './bbox3d.ts'
import { GfRay } from './ray.ts'
import { GfPlane } from './plane.ts'
import {
  type Rotation,
  identityRotation,
  rotationInverse,
  rotationEqual,
  rotationRepr,
} from './rotation.ts'
import { GfDegreesToRadians, GfRadiansToDegrees, GfSqr } from './math.ts'

// Re-export the value types frustum.h pulls in, so `typescript-usd/gf/frustum` consumers
// can grab them alongside GfFrustum (matches frustum.h's includes).
export { GfRange1d, GfRange2d, GfRange3d } from './range.ts'
export { GfBBox3d } from './bbox3d.ts'
export { GfRay } from './ray.ts'
export { GfVec2d, GfVec3d, GfVec4d } from './vec.ts'
export { GfMatrix4d } from './matrixData.ts'

/** GfFrustum::ProjectionType (frustum.h). */
export enum GfFrustumProjectionType {
  Orthographic = 0,
  Perspective = 1,
}

/** Scratch for IntersectsViewVolume's bbox-times-view-projection matrix. */
const _intersectsViewVolumeMatrix = new Float64Array(16)

export class GfFrustum {
  // Mirror the enum onto the class so `GfFrustum.Orthographic` /
  // `GfFrustum.Perspective` read like the C++/Python `Gf.Frustum.Perspective`.
  static readonly Orthographic = GfFrustumProjectionType.Orthographic
  static readonly Perspective = GfFrustumProjectionType.Perspective

  private _position: GfVec3d
  private _rotation: Rotation
  private _window: GfRange2d
  private _nearFar: GfRange1d
  private _viewDistance: number
  private _projectionType: GfFrustumProjectionType
  // Cached frustum planes (null = not yet calculated / dirtied).
  private _planes: GfPlane[] | null = null

  // --- constructors --------------------------------------------------------
  // Mirrors the four GfFrustum ctors (default, copy, full-params, fromMatrix).
  constructor()
  constructor(other: GfFrustum)
  constructor(
    position: GfVec3d,
    rotation: Rotation,
    window: GfRange2d,
    nearFar: GfRange1d,
    projectionType: GfFrustumProjectionType,
    viewDistance?: number,
  )
  constructor(
    camToWorldXf: GfMatrix4d,
    window: GfRange2d,
    nearFar: GfRange1d,
    projectionType: GfFrustumProjectionType,
    viewDistance?: number,
  )
  constructor(
    a?: GfFrustum | GfVec3d | GfMatrix4d,
    b?: Rotation | GfRange2d,
    c?: GfRange2d | GfRange1d,
    d?: GfRange1d | GfFrustumProjectionType,
    e?: GfFrustumProjectionType | number,
    viewDistance = 5.0,
  ) {
    if (a === undefined) {
      // Default viewing parameters (frustum.cpp default ctor).
      this._position = new GfVec3d(0, 0, 0)
      this._rotation = identityRotation()
      this._window = new GfRange2d(new GfVec2d(-1.0, -1.0), new GfVec2d(1.0, 1.0))
      this._nearFar = new GfRange1d(1.0, 10.0)
      this._viewDistance = 5.0
      this._projectionType = GfFrustum.Perspective
      return
    }
    if (a instanceof GfFrustum) {
      // Copy constructor.
      this._position = new GfVec3d(a._position)
      this._rotation = { axis: [...a._rotation.axis], angle: a._rotation.angle }
      this._window = new GfRange2d(a._window)
      this._nearFar = new GfRange1d(a._nearFar)
      this._viewDistance = a._viewDistance
      this._projectionType = a._projectionType
      // _planes is left dirty (recomputed lazily); upstream copies the cache,
      // but it is purely derived state, so recomputation is equivalent.
      return
    }
    if (a instanceof GfMatrix4d) {
      // camToWorldXf ctor: window/nearFar/projType/viewDistance + matrix.
      this._window = new GfRange2d(b as GfRange2d)
      this._nearFar = new GfRange1d(c as GfRange1d)
      this._projectionType = d as GfFrustumProjectionType
      this._viewDistance = (e as number | undefined) ?? 5.0
      // Set below; initialize defaults to satisfy definite-assignment.
      this._position = new GfVec3d(0, 0, 0)
      this._rotation = identityRotation()
      this.setPositionAndRotationFromMatrix(a)
      return
    }
    // Full-params ctor (position, rotation, window, nearFar, projType, viewDist).
    this._position = new GfVec3d(a)
    this._rotation = { axis: [...(b as Rotation).axis], angle: (b as Rotation).angle }
    this._window = new GfRange2d(c as GfRange2d)
    this._nearFar = new GfRange1d(d as GfRange1d)
    this._projectionType = e as GfFrustumProjectionType
    this._viewDistance = viewDistance
  }

  // --- equality / hash / debug --------------------------------------------

  /** operator== — true iff all parts match (frustum.h). */
  equals(f: GfFrustum): boolean {
    if (!this._position.equals(f._position)) return false
    if (!rotationEqual(this._rotation, f._rotation)) return false
    if (!this._window.equals(f._window)) return false
    if (!this._nearFar.equals(f._nearFar)) return false
    if (this._viewDistance !== f._viewDistance) return false
    if (this._projectionType !== f._projectionType) return false
    return true
  }

  /** Deterministic structural hash; equal frustums (and copies) hash equal. */
  hash(): string {
    return [
      this._position.hash(),
      this._rotation.axis.join(',') + ';' + this._rotation.angle,
      this._window.hash(),
      this._nearFar.hash(),
      this._viewDistance,
      this._projectionType,
    ].join('|')
  }

  /** operator<< : "[(position) (rotation) [window] [nearFar] viewDistance type]". */
  toString(): string {
    const type = this._projectionType === GfFrustum.Perspective
      ? 'perspective' : 'orthographic'
    return `[${this._position.toString()} ${rotationRepr(this._rotation)} ` +
      `${this._window.toString()} ${this._nearFar.toString()} ` +
      `${this._viewDistance} ${type}]`
  }

  repr(): string {
    return `Gf.Frustum(${this._position.repr()}, ${rotationRepr(this._rotation)}, ` +
      `${this._window.repr()}, ${this._nearFar.repr()}, ` +
      `Gf.Frustum.${this._projectionType === GfFrustum.Perspective ? 'Perspective' : 'Orthographic'}, ` +
      `${this._viewDistance})`
  }

  // --- value setting and access -------------------------------------------

  setPosition(position: GfVec3d): void {
    this._position = new GfVec3d(position)
    this._dirtyFrustumPlanes()
  }
  getPosition(): GfVec3d { return this._position }
  get position(): GfVec3d { return this._position }
  set position(p: GfVec3d) { this.setPosition(p) }

  setRotation(rotation: Rotation): void {
    this._rotation = { axis: [...rotation.axis], angle: rotation.angle }
    this._dirtyFrustumPlanes()
  }
  getRotation(): Rotation { return this._rotation }
  get rotation(): Rotation { return this._rotation }
  set rotation(r: Rotation) { this.setRotation(r) }

  /**
   * Sets the position and rotation from a camera matrix (always y-Up). The
   * resulting transform is conformed to a right-handed orthonormal frame
   * (scale/shear/projection removed). (frustum.cpp.)
   */
  setPositionAndRotationFromMatrix(camToWorldXf: GfMatrix4d): void {
    // First conform matrix to be...
    let conformedXf = new GfMatrix4d(camToWorldXf)
    // ... right handed
    if (!conformedXf.isRightHanded()) {
      const flip = new GfMatrix4d(new GfVec4d(-1.0, 1.0, 1.0, 1.0))
      conformedXf = flip.getMultiply(conformedXf)
    }
    // ... and orthonormal
    conformedXf.orthonormalize()

    this.setRotation(conformedXf.extractRotation())
    this.setPosition(conformedXf.extractTranslation() as GfVec3d)
  }

  setWindow(window: GfRange2d): void {
    this._window = new GfRange2d(window)
    this._dirtyFrustumPlanes()
  }
  getWindow(): GfRange2d { return this._window }
  get window(): GfRange2d { return this._window }
  set window(w: GfRange2d) { this.setWindow(w) }

  /** Returns the depth of the reference plane (always 1.0). */
  static getReferencePlaneDepth(): number { return 1.0 }

  setNearFar(nearFar: GfRange1d): void {
    this._nearFar = new GfRange1d(nearFar)
    this._dirtyFrustumPlanes()
  }
  getNearFar(): GfRange1d { return this._nearFar }
  get nearFar(): GfRange1d { return this._nearFar }
  set nearFar(nf: GfRange1d) { this.setNearFar(nf) }

  setViewDistance(viewDistance: number): void { this._viewDistance = viewDistance }
  getViewDistance(): number { return this._viewDistance }
  get viewDistance(): number { return this._viewDistance }
  set viewDistance(v: number) { this._viewDistance = v }

  setProjectionType(projectionType: GfFrustumProjectionType): void {
    this._projectionType = projectionType
    this._dirtyFrustumPlanes()
  }
  getProjectionType(): GfFrustumProjectionType { return this._projectionType }
  get projectionType(): GfFrustumProjectionType { return this._projectionType }
  set projectionType(t: GfFrustumProjectionType) { this.setProjectionType(t) }

  // --- convenience: perspective / orthographic ----------------------------

  /**
   * SetPerspective. Two forms (frustum.cpp):
   *   SetPerspective(fovHeight, aspect, near, far)          (vertical fov)
   *   SetPerspective(fov, isFovVertical, aspect, near, far)
   */
  setPerspective(
    fieldOfViewHeight: number,
    aspectRatio: number,
    nearDistance: number,
    farDistance: number,
  ): void
  setPerspective(
    fieldOfView: number,
    isFovVertical: boolean,
    aspectRatio: number,
    nearDistance: number,
    farDistance: number,
  ): void
  setPerspective(
    fieldOfView: number,
    a: number | boolean,
    b: number,
    c: number,
    d?: number,
  ): void {
    if (typeof a === 'boolean') {
      this._setPerspective(fieldOfView, a, b, c, d as number)
    } else {
      // (fovHeight, aspect, near, far) -> vertical.
      this._setPerspective(fieldOfView, true, a, b, c)
    }
  }

  private _setPerspective(
    fieldOfView: number,
    isFovVertical: boolean,
    aspectRatio: number,
    nearDistance: number,
    farDistance: number,
  ): void {
    this._projectionType = GfFrustum.Perspective

    let yDist = 1.0
    let xDist = 1.0

    let aspect = aspectRatio
    // Check for 0, use 1 in that case.
    if (aspect === 0.0) aspect = 1.0

    if (isFovVertical) {
      // vertical is taken from the given field of view
      yDist = Math.tan(GfDegreesToRadians(fieldOfView / 2.0)) *
        GfFrustum.getReferencePlaneDepth()
      // horizontal is determined by aspect ratio
      xDist = yDist * aspect
    } else {
      // horizontal is taken from the given field of view
      xDist = Math.tan(GfDegreesToRadians(fieldOfView / 2.0)) *
        GfFrustum.getReferencePlaneDepth()
      // vertical is determined by aspect ratio
      yDist = xDist / aspect
    }

    this._window.setMin(new GfVec2d(-xDist, -yDist))
    this._window.setMax(new GfVec2d(xDist, yDist))
    this._nearFar.setMin(nearDistance)
    this._nearFar.setMax(farDistance)

    this._dirtyFrustumPlanes()
  }

  /**
   * GetPerspective(isFovVertical) -> [fov, aspect, near, far] or null if the
   * frustum is not a perspective projection. (frustum.cpp.)
   */
  getPerspective(
    isFovVertical: boolean,
  ): [number, number, number, number] | null {
    if (this._projectionType !== GfFrustum.Perspective) return null

    const winSize = this._window.getSize().data

    let fieldOfView: number
    if (isFovVertical) {
      fieldOfView = 2.0 * GfRadiansToDegrees(
        Math.atan(winSize[1]! / (2.0 * GfFrustum.getReferencePlaneDepth())))
    } else {
      fieldOfView = 2.0 * GfRadiansToDegrees(
        Math.atan(winSize[0]! / (2.0 * GfFrustum.getReferencePlaneDepth())))
    }
    const aspectRatio = winSize[0]! / winSize[1]!
    const nearDistance = this._nearFar.getMin()
    const farDistance = this._nearFar.getMax()

    return [fieldOfView, aspectRatio, nearDistance, farDistance]
  }

  /**
   * GetFOV — horizontal or vertical field of view (0.0 if not perspective).
   * Default isFovVertical=false (matches GfFrustum::GetFOV). (frustum.cpp.)
   */
  getFOV(isFovVertical = false): number {
    let result = 0.0
    if (this.getProjectionType() === GfFrustum.Perspective) {
      const p = this.getPerspective(isFovVertical)
      if (p) result = p[0]
    }
    return result
  }

  /** SetOrthographic (frustum.cpp). */
  setOrthographic(
    left: number, right: number,
    bottom: number, top: number,
    nearPlane: number, farPlane: number,
  ): void {
    this._projectionType = GfFrustum.Orthographic
    this._window.setMin(new GfVec2d(left, bottom))
    this._window.setMax(new GfVec2d(right, top))
    this._nearFar.setMin(nearPlane)
    this._nearFar.setMax(farPlane)
    this._dirtyFrustumPlanes()
  }

  /**
   * GetOrthographic -> [left, right, bottom, top, near, far] or null if the
   * frustum is not an orthographic projection. (frustum.cpp.)
   */
  getOrthographic(): [number, number, number, number, number, number] | null {
    if (this._projectionType !== GfFrustum.Orthographic) return null
    const min = this._window.getMin().data
    const max = this._window.getMax().data
    return [
      min[0]!, max[0]!, min[1]!, max[1]!,
      this._nearFar.getMin(), this._nearFar.getMax(),
    ]
  }

  // --- fit / transform -----------------------------------------------------

  /**
   * Modifies the frustum to tightly enclose a sphere of the given center and
   * radius, using the current view direction. (frustum.cpp FitToSphere.)
   */
  fitToSphere(center: GfVec3d, radius: number, slack = 0.0): void {
    if (this._projectionType === GfFrustum.Orthographic) {
      // Set the distance so the viewpoint is outside the sphere.
      this._viewDistance = radius + slack
      // Set the camera window to enclose the sphere.
      this._window = new GfRange2d(
        new GfVec2d(-radius, -radius), new GfVec2d(radius, radius))
    } else {
      // Find the plane coordinate to use to compute the view.
      const whichDim = this.computeAspectRatio() > 1.0 ? 1 : 0

      const min = this._window.getMin().data[whichDim]!
      const max = this._window.getMax().data[whichDim]!
      let halfSize: number
      if (min > 0.0) {
        halfSize = max
      } else if (max < 0.0) {
        halfSize = min
      } else if (-min > max) {
        halfSize = min
      } else {
        halfSize = max
      }

      if (halfSize < 0.0) {
        halfSize = -halfSize
      } else if (halfSize === 0.0) {
        halfSize = 1.0 // Why not?
      }

      // Similar triangles: viewpoint/half-size triangle is similar to the
      // viewpoint/radius triangle at the point of tangency.
      this._viewDistance =
        radius * (1.0 / halfSize) *
        Math.sqrt(GfSqr(halfSize) + GfSqr(this._nearFar.getMin()))
    }

    // Adjust the camera so the near plane touches the sphere and the far plane
    // encloses the sphere.
    this._nearFar.setMin(this._viewDistance - (radius + slack))
    this._nearFar.setMax(this._nearFar.getMin() + 2.0 * (radius + slack))

    // Set the camera to use the new position. The view direction should not
    // have changed.
    this._position = center.subtract(
      this.computeViewDirection().getScaled(this._viewDistance)) as GfVec3d

    this._dirtyFrustumPlanes()
  }

  /**
   * Transforms the frustum by the given matrix. (frustum.cpp Transform.) The
   * position and direction are transformed, the direction's new length rescales
   * near/far/viewDistance, and the reference-plane corners are re-derived so the
   * frustum is neither sheared nor perspective-projected.
   */
  Transform(matrix: GfMatrix4d): this {
    // Work on a fresh frustum, then replace our contents with it.
    const frustum = new GfFrustum()

    // Copy the projection type.
    frustum._projectionType = this._projectionType

    // Transform the position of the frustum.
    frustum._position = matrix.Transform(this._position) as GfVec3d

    // --- transform the rotation via an orthonormal frame ---
    const viewDir = this.computeViewDirection()
    const upVec = this.computeUpVector()

    const viewDirPrime = matrix.transformDir(viewDir) as GfVec3d
    const upVecPrime = matrix.transformDir(upVec) as GfVec3d

    // Normalize; save the direction's length to rescale near/far.
    const scale = viewDirPrime.Normalize()
    upVecPrime.Normalize()

    const viewRightPrime = GfCross(viewDirPrime, upVecPrime)
    viewRightPrime.Normalize()

    // Construct a rotation matrix from the axes (rows = right, up, -viewDir).
    const rotMatrix = new GfMatrix4d()
    rotMatrix.setIdentity()
    rotMatrix.setRow3(0, viewRightPrime)
    rotMatrix.setRow3(1, upVecPrime)
    rotMatrix.setRow3(2, viewDirPrime.getNegated())

    frustum._rotation = rotMatrix.extractRotation()

    // The direction length scales near/far and the view distance.
    frustum._nearFar = this._nearFar.getMultiplied(scale)
    frustum._viewDistance = this._viewDistance * scale

    // --- transform the reference plane ---
    const min = this._window.getMin().data
    const max = this._window.getMax().data

    // Corner points on the reference plane (z = -1), in world space.
    let leftBottom = this._position.add(
      this._rotateDir(this._rotation, new GfVec3d(min[0]!, min[1]!, -1.0))) as GfVec3d
    let rightTop = this._position.add(
      this._rotateDir(this._rotation, new GfVec3d(max[0]!, max[1]!, -1.0))) as GfVec3d

    // Transform by the given matrix.
    leftBottom = matrix.Transform(leftBottom) as GfVec3d
    rightTop = matrix.Transform(rightTop) as GfVec3d

    // Bring into the new frustum's local frame.
    leftBottom = leftBottom.subtract(frustum._position) as GfVec3d
    rightTop = rightTop.subtract(frustum._position) as GfVec3d
    leftBottom = this._rotateDir(rotationInverse(frustum._rotation), leftBottom)
    rightTop = this._rotateDir(rotationInverse(frustum._rotation), rightTop)

    // Similar-triangles rescale back to one unit away (perspective only).
    if (this._projectionType === GfFrustum.Perspective) {
      leftBottom = leftBottom.getScaled(1.0 / scale) as GfVec3d
      rightTop = rightTop.getScaled(1.0 / scale) as GfVec3d
    }

    const lb = leftBottom.data
    const rt = rightTop.data
    frustum._window.setMin(new GfVec2d(lb[0]!, lb[1]!))
    frustum._window.setMax(new GfVec2d(rt[0]!, rt[1]!))

    // Negative scales can flip the window; fix if necessary.
    const wMin = frustum._window.getMin().data.slice()
    const wMax = frustum._window.getMax().data.slice()
    if (wMin[0]! > wMax[0]!) { const t = wMin[0]!; wMin[0] = wMax[0]!; wMax[0] = t }
    if (wMin[1]! > wMax[1]!) { const t = wMin[1]!; wMin[1] = wMax[1]!; wMax[1] = t }
    frustum._window.setMin(new GfVec2d(wMin[0]!, wMin[1]!))
    frustum._window.setMax(new GfVec2d(wMax[0]!, wMax[1]!))

    // Replace our contents with the transformed frustum.
    this._copyFrom(frustum)
    return this
  }

  // --- view frame / matrices ----------------------------------------------

  /** Normalized world-space view direction (rotate -z by the rotation). */
  computeViewDirection(): GfVec3d {
    return this._rotateDir(this._rotation, new GfVec3d(0, 0, -1))
  }

  /** Normalized world-space up vector (rotate +y by the rotation). */
  computeUpVector(): GfVec3d {
    return this._rotateDir(this._rotation, new GfVec3d(0, 1, 0))
  }

  /** Computes the view frame [side, up, view]. (frustum.cpp.) */
  computeViewFrame(): { side: GfVec3d; up: GfVec3d; view: GfVec3d } {
    const up = this.computeUpVector()
    const view = this.computeViewDirection()
    const side = GfCross(view, up)
    return { side, up, view }
  }

  /** World-space look-at point: position + viewDistance * viewDirection. */
  computeLookAtPoint(): GfVec3d {
    return this._position.add(
      this.computeViewDirection().getScaled(this._viewDistance)) as GfVec3d
  }

  /**
   * Returns the view matrix (world -> eye space). (frustum.cpp ComputeViewMatrix
   * via GfMatrix4d::SetLookAt(position, rotation) = Translate(-pos) *
   * Rotate(rotation.GetInverse()).)
   */
  computeViewMatrix(): GfMatrix4d {
    const m1 = new GfMatrix4d().setTranslate(this._position.getNegated())
    const m2 = new GfMatrix4d().setRotate(rotationInverse(this._rotation))
    return m1.getMultiply(m2)
  }

  /** Returns the inverse view matrix (eye -> world space). */
  computeViewInverse(): GfMatrix4d {
    return this.computeViewMatrix().getInverse()
  }

  /** GL-style projection matrix for the frustum. (frustum.cpp.) */
  computeProjectionMatrix(): GfMatrix4d {
    const matrix = new GfMatrix4d()
    matrix.setIdentity()

    const l = this._window.getMin().data[0]!
    const r = this._window.getMax().data[0]!
    const b = this._window.getMin().data[1]!
    const t = this._window.getMax().data[1]!
    const n = this._nearFar.getMin()
    const f = this._nearFar.getMax()

    const rl = r - l
    const tb = t - b
    const fn = f - n

    if (this._projectionType === GfFrustum.Orthographic) {
      matrix.SetElement(0, 0, 2.0 / rl)
      matrix.SetElement(1, 1, 2.0 / tb)
      matrix.SetElement(2, 2, -2.0 / fn)
      matrix.SetElement(3, 0, -(r + l) / rl)
      matrix.SetElement(3, 1, -(t + b) / tb)
      matrix.SetElement(3, 2, -(f + n) / fn)
    } else {
      // Perspective (window specified w.r.t. the reference plane, near == 1).
      matrix.SetElement(0, 0, 2.0 / rl)
      matrix.SetElement(1, 1, 2.0 / tb)
      matrix.SetElement(2, 2, -(f + n) / fn)
      matrix.SetElement(2, 0, (r + l) / rl)
      matrix.SetElement(2, 1, (t + b) / tb)
      matrix.SetElement(3, 2, -2.0 * n * f / fn)
      matrix.SetElement(2, 3, -1.0)
      matrix.SetElement(3, 3, 0.0)
    }

    return matrix
  }

  /** Aspect ratio = |width / height| (0 if height is 0). (frustum.cpp.) */
  computeAspectRatio(): number {
    const winSize = this._window.getSize().data
    let aspectRatio = 0.0
    if (winSize[1]! !== 0.0) {
      // Negative winsize is used for envcubes, believe it or not.
      aspectRatio = Math.abs(winSize[0]! / winSize[1]!)
    }
    return aspectRatio
  }

  /**
   * World-space corners of the frustum (8 points), ordered:
   * LBN, RBN, LTN, RTN, LBF, RBF, LTF, RTF. (frustum.cpp ComputeCorners.)
   */
  computeCorners(): GfVec3d[] {
    const winMin = this._window.getMin().data
    const winMax = this._window.getMax().data
    const near = this._nearFar.getMin()
    const far = this._nearFar.getMax()

    const corners: GfVec3d[] = []
    if (this._projectionType === GfFrustum.Perspective) {
      // Eye-space near/far rectangles via similar triangles.
      corners.push(new GfVec3d(near * winMin[0]!, near * winMin[1]!, -near))
      corners.push(new GfVec3d(near * winMax[0]!, near * winMin[1]!, -near))
      corners.push(new GfVec3d(near * winMin[0]!, near * winMax[1]!, -near))
      corners.push(new GfVec3d(near * winMax[0]!, near * winMax[1]!, -near))
      corners.push(new GfVec3d(far * winMin[0]!, far * winMin[1]!, -far))
      corners.push(new GfVec3d(far * winMax[0]!, far * winMin[1]!, -far))
      corners.push(new GfVec3d(far * winMin[0]!, far * winMax[1]!, -far))
      corners.push(new GfVec3d(far * winMax[0]!, far * winMax[1]!, -far))
    } else {
      corners.push(new GfVec3d(winMin[0]!, winMin[1]!, -near))
      corners.push(new GfVec3d(winMax[0]!, winMin[1]!, -near))
      corners.push(new GfVec3d(winMin[0]!, winMax[1]!, -near))
      corners.push(new GfVec3d(winMax[0]!, winMax[1]!, -near))
      corners.push(new GfVec3d(winMin[0]!, winMin[1]!, -far))
      corners.push(new GfVec3d(winMax[0]!, winMin[1]!, -far))
      corners.push(new GfVec3d(winMin[0]!, winMax[1]!, -far))
      corners.push(new GfVec3d(winMax[0]!, winMax[1]!, -far))
    }

    // Transform into world space by the inverse view matrix.
    const m = this.computeViewInverse()
    for (let i = 0; i < 8; i++) corners[i] = m.Transform(corners[i]!) as GfVec3d
    return corners
  }

  /**
   * World-space corners of the frustum cross-section at distance d from the
   * apex, ordered LB, RB, LT, RT. (frustum.cpp ComputeCornersAtDistance.)
   */
  computeCornersAtDistance(d: number): GfVec3d[] {
    const winMin = this._window.getMin().data
    const winMax = this._window.getMax().data

    const corners: GfVec3d[] = []
    if (this._projectionType === GfFrustum.Perspective) {
      corners.push(new GfVec3d(d * winMin[0]!, d * winMin[1]!, -d))
      corners.push(new GfVec3d(d * winMax[0]!, d * winMin[1]!, -d))
      corners.push(new GfVec3d(d * winMin[0]!, d * winMax[1]!, -d))
      corners.push(new GfVec3d(d * winMax[0]!, d * winMax[1]!, -d))
    } else {
      corners.push(new GfVec3d(winMin[0]!, winMin[1]!, -d))
      corners.push(new GfVec3d(winMax[0]!, winMin[1]!, -d))
      corners.push(new GfVec3d(winMin[0]!, winMax[1]!, -d))
      corners.push(new GfVec3d(winMax[0]!, winMax[1]!, -d))
    }

    const m = this.computeViewInverse()
    for (let i = 0; i < 4; i++) corners[i] = m.Transform(corners[i]!) as GfVec3d
    return corners
  }

  // --- narrowed frustum ----------------------------------------------------

  /**
   * Returns a narrowed-down version of this frustum centered on the given
   * window position (normalized -1..+1) or world point, scaled by `size`.
   * (frustum.cpp ComputeNarrowedFrustum.)
   */
  computeNarrowedFrustum(windowPos: GfVec2d, size: GfVec2d): GfFrustum
  computeNarrowedFrustum(worldPoint: GfVec3d, size: GfVec2d): GfFrustum
  computeNarrowedFrustum(pos: GfVec2d | GfVec3d, size: GfVec2d): GfFrustum {
    if (pos instanceof GfVec3d) {
      // Map the world point onto the frustum's window.
      const camSpacePoint = this.computeViewMatrix().Transform(pos) as GfVec3d
      const cs = camSpacePoint.data
      if (cs[2]! >= 0) {
        // Given worldPoint is behind or at the eye — return this frustum.
        return new GfFrustum(this)
      }
      let windowPoint = new GfVec2d(cs[0]!, cs[1]!)
      if (this._projectionType === GfFrustum.Perspective) {
        // Project the camera-space point to the reference plane (-1 to 1).
        windowPoint = windowPoint.getScaled(1.0 / -cs[2]!) as GfVec2d
      }
      return this._computeNarrowedFrustumSub(windowPoint, size)
    }
    const windowPoint = _WindowNormalizedToPoint(pos, this._window)
    return this._computeNarrowedFrustumSub(windowPoint, size)
  }

  private _computeNarrowedFrustumSub(windowPoint: GfVec2d, size: GfVec2d): GfFrustum {
    // Start with this frustum.
    const narrowedFrustum = new GfFrustum(this)

    // Convert the sizes to the reference plane.
    const halfSizeOnRefPlane =
      GfCompMult(size, this._window.getSize() as GfVec2d).getScaled(0.5) as GfVec2d

    // Shrink the narrowed frustum's window to surround the point.
    const min = (windowPoint.subtract(halfSizeOnRefPlane) as GfVec2d).data.slice()
    const max = (windowPoint.add(halfSizeOnRefPlane) as GfVec2d).data.slice()

    const wMin = this._window.getMin().data
    const wMax = this._window.getMax().data
    // Make sure the new bounds are within the old window.
    if (min[0]! < wMin[0]!) min[0] = wMin[0]!
    if (min[1]! < wMin[1]!) min[1] = wMin[1]!
    if (max[0]! > wMax[0]!) max[0] = wMax[0]!
    if (max[1]! > wMax[1]!) max[1] = wMax[1]!

    narrowedFrustum.setWindow(
      new GfRange2d(new GfVec2d(min[0]!, min[1]!), new GfVec2d(max[0]!, max[1]!)))
    return narrowedFrustum
  }

  // --- rays ----------------------------------------------------------------

  /**
   * Ray from the viewpoint through the given normalized window position
   * (-1..+1). (frustum.cpp ComputeRay(windowPos).)
   */
  computeRay(windowPos: GfVec2d): GfRay
  /** Ray connecting the viewpoint to the given world-space point. */
  computeRay(worldSpacePos: GfVec3d): GfRay
  computeRay(arg: GfVec2d | GfVec3d): GfRay {
    if (arg instanceof GfVec3d) {
      const camSpaceToPos = this.computeViewMatrix().Transform(arg) as GfVec3d
      let pos: GfVec3d
      let dir: GfVec3d
      if (this._projectionType === GfFrustum.Perspective) {
        pos = new GfVec3d(0, 0, 0)
        dir = camSpaceToPos.GetNormalized()
      } else {
        const c = camSpaceToPos.data
        pos = new GfVec3d(c[0]!, c[1]!, 0.0)
        dir = new GfVec3d(0, 0, -1)
      }
      const viewInverse = this.computeViewInverse()
      const rayFrom = viewInverse.Transform(pos) as GfVec3d
      const rayDir = viewInverse.transformDir(dir) as GfVec3d
      return new GfRay(rayFrom, rayDir)
    }
    const ray = _ComputeUntransformedRay(
      this._projectionType, this._window, arg, this._nearFar.getMin())
    const viewInverse = this.computeViewInverse()
    const rayFrom = viewInverse.Transform(ray.getStartPoint()) as GfVec3d
    const rayDir = viewInverse.transformDir(ray.getDirection()) as GfVec3d
    return new GfRay(rayFrom, rayDir)
  }

  /**
   * Picking ray (origin offset to the near plane) for the given normalized
   * window position or world-space point. (frustum.cpp ComputePickRay.)
   */
  computePickRay(windowPos: GfVec2d): GfRay
  computePickRay(worldSpacePos: GfVec3d): GfRay
  computePickRay(arg: GfVec2d | GfVec3d): GfRay {
    if (arg instanceof GfVec3d) {
      const camSpaceToPos = this.computeViewMatrix().Transform(arg) as GfVec3d
      let pos: GfVec3d
      let dir: GfVec3d
      if (this._projectionType === GfFrustum.Perspective) {
        pos = new GfVec3d(0, 0, 0)
        dir = camSpaceToPos.GetNormalized()
      } else {
        const c = camSpaceToPos.data
        pos = new GfVec3d(c[0]!, c[1]!, 0.0)
        dir = new GfVec3d(0, 0, -1)
      }
      return this._computePickRayOffsetToNearPlane(pos, dir)
    }
    const ray = _ComputeUntransformedRay(
      this._projectionType, this._window, arg, this._nearFar.getMin())
    return this._computePickRayOffsetToNearPlane(
      ray.getStartPoint(), ray.getDirection())
  }

  private _computePickRayOffsetToNearPlane(
    camSpaceFrom: GfVec3d, camSpaceDir: GfVec3d,
  ): GfRay {
    // Move the start to the near plane so clipped-out geometry isn't picked.
    const rayFrom = camSpaceFrom.add(
      camSpaceDir.getScaled(this._nearFar.getMin())) as GfVec3d

    const viewInverse = this.computeViewInverse()
    const worldFrom = viewInverse.Transform(rayFrom) as GfVec3d
    const rayDir = viewInverse.transformDir(camSpaceDir) as GfVec3d
    return new GfRay(worldFrom, rayDir)
  }

  // --- intersection --------------------------------------------------------

  /** Intersection test against a bbox / point / segment / triangle. */
  intersects(bbox: GfBBox3d): boolean
  intersects(point: GfVec3d): boolean
  intersects(p0: GfVec3d, p1: GfVec3d): boolean
  intersects(p0: GfVec3d, p1: GfVec3d, p2: GfVec3d): boolean
  intersects(
    a: GfBBox3d | GfVec3d, b?: GfVec3d, c?: GfVec3d,
  ): boolean {
    if (a instanceof GfBBox3d) return this._intersectsBBox(a)
    if (b === undefined) return this._intersectsPoint(a)
    if (c === undefined) return this._intersectsSegment(a, b)
    return this._intersectsTriangle(a, b, c)
  }

  /** OpenUSD v26.08 pxr/base/gf/frustum.cpp:676-682. */
  computePlanes(): GfPlane[] {
    this._calculateFrustumPlanes()
    return this._planes!.map(plane => new GfPlane(
      plane.getNormal(), plane.getDistanceFromOrigin()))
  }

  private _intersectsBBox(bbox: GfBBox3d): boolean {
    if (bbox.getBox().IsEmpty()) return false

    this._calculateFrustumPlanes()

    const localBBox = bbox.getRange()
    const worldToLocal = bbox.getInverseMatrix()

    for (const plane of this._planes!) {
      const localPlane = new GfPlane(
        plane.getNormal(), plane.getDistanceFromOrigin())
      localPlane.Transform(worldToLocal)
      if (!localPlane.intersectsPositiveHalfSpace(localBBox)) {
        return false
      }
    }
    return true
  }

  private _intersectsPoint(point: GfVec3d): boolean {
    this._calculateFrustumPlanes()
    for (const plane of this._planes!) {
      if (!plane.intersectsPositiveHalfSpace(point)) return false
    }
    return true
  }

  private _intersectsSegment(p0: GfVec3d, p1: GfVec3d): boolean {
    this._calculateFrustumPlanes()
    const planes = this._planes!
    return this._segmentIntersects(
      p0, _calcIntersectionBitMask(planes, p0),
      p1, _calcIntersectionBitMask(planes, p1))
  }

  private _intersectsTriangle(p0: GfVec3d, p1: GfVec3d, p2: GfVec3d): boolean {
    this._calculateFrustumPlanes()
    const planes = this._planes!

    const p0Mask = _calcIntersectionBitMask(planes, p0)
    const p1Mask = _calcIntersectionBitMask(planes, p1)
    const p2Mask = _calcIntersectionBitMask(planes, p2)

    // All points on the bad side of some plane => no intersection.
    if (((p0Mask | p1Mask | p2Mask) & 0x3f) !== 0x3f) return false

    // Any point fully inside => intersection.
    if (p0Mask === 0x3f || p1Mask === 0x3f || p2Mask === 0x3f) return true

    // (1) Any edge intersects the frustum.
    if (this._segmentIntersects(p0, p0Mask, p1, p1Mask) ||
        this._segmentIntersects(p1, p1Mask, p2, p2Mask) ||
        this._segmentIntersects(p2, p2Mask, p0, p0Mask)) {
      return true
    }

    // (2) The triangle encloses the frustum: cast rays from the viewpoint to
    // the far corners and test ray-triangle intersection.
    let numCornersToCheck = 4
    const nearBit = (1 << 4)
    const farBit = (1 << 5)
    if ((p0Mask & nearBit) && (p1Mask & nearBit) && (p2Mask & nearBit) &&
        (p0Mask & farBit) && (p1Mask & farBit) && (p2Mask & farBit)) {
      numCornersToCheck = 1
    }

    for (let i = 0; i < numCornersToCheck; i++) {
      const pickPoint = i === 0 ? new GfVec2d(-1.0, -1.0)
        : i === 1 ? new GfVec2d(-1.0, 1.0)
        : i === 2 ? new GfVec2d(1.0, 1.0)
        : new GfVec2d(1.0, -1.0)
      const pickRay = this.computePickRay(pickPoint)
      const hit = pickRay.intersect(p0, p1, p2)
      if (hit.hit) return true
    }

    // (3) No intersection.
    return false
  }

  // NOTE: caller must ensure _CalculateFrustumPlanes() has been called.
  private _segmentIntersects(
    p0: GfVec3d, p0Mask: number, p1: GfVec3d, p1Mask: number,
  ): boolean {
    // If any plane bit is 0 in both masks, both points are outside it.
    if (((p0Mask | p1Mask) & 0x3f) !== 0x3f) return false

    // Either point fully inside => intersection.
    if (p0Mask === 0x3f || p1Mask === 0x3f) return true

    // Both points outside, but not both outside any single plane. Clip the
    // segment against each straddled plane using parametric coords.
    let t0 = 0.0
    let t1 = 1.0
    const v = p1.subtract(p0) as GfVec3d

    const planes = this._planes!
    for (let i = 0; i < planes.length; i++) {
      const plane = planes[i]!
      const planeBit = 1 << i

      const p0Bit = p0Mask & planeBit
      const p1Bit = p1Mask & planeBit
      if (p0Bit === p1Bit) continue

      // t = -(distance of p0) / (n . v)
      const t = -plane.getDistance(p0) / plane.getNormal().dot(v)

      if (p0Bit) {
        if (t < t1) t1 = t
      } else {
        if (t > t0) t0 = t
      }

      if (t0 > t1) return false
    }
    return true
  }

  /**
   * IntersectsViewVolume — true if the bbox intersects the view volume given by
   * the view-projection matrix, erring toward false positives. (frustum.cpp.)
   */
  static intersectsViewVolume(bbox: GfBBox3d, vpMat: GfMatrix4d): boolean {
    // frustum.cpp:1265-1330. The same arithmetic without allocation: the
    // bbox's range and matrix are read in place (upstream's GetRange and
    // GetMatrix return const references), bbox.GetMatrix() * viewProjMat is
    // formed in a scratch array with GfMatrix4d's summation order
    // (matrixData.ts GetMultiply), and each corner (x, y, z, 1) times that
    // matrix follows MultVecMatrix's order.
    const range = bbox._getRangeConstRef()
    const localMin = range.getMin().data
    const localMax = range.getMax().data
    const a = bbox._getMatrixConstRef().GetArray()
    const b = vpMat.GetArray()
    const m = _intersectsViewVolumeMatrix
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0
        for (let k = 0; k < 4; k++) s += a[i * 4 + k]! * b[k * 4 + j]!
        m[i * 4 + j] = s
      }
    }

    // clipFlags is a 6-bit field with one bit per +/- per x,y,z, or one per
    // frustum plane. Corner i takes max on x if bit 2, y if bit 1, z if bit 0
    // (points[0..7] of frustum.cpp:1284-1291).
    let clipFlags = 0
    for (let i = 0; i < 8; i++) {
      const x = (i & 4 ? localMax : localMin)[0]!
      const y = (i & 2 ? localMax : localMin)[1]!
      const z = (i & 1 ? localMax : localMin)[2]!
      let s0 = 0; s0 += x * m[0]!; s0 += y * m[4]!; s0 += z * m[8]!; s0 += 1 * m[12]!
      let s1 = 0; s1 += x * m[1]!; s1 += y * m[5]!; s1 += z * m[9]!; s1 += 1 * m[13]!
      let s2 = 0; s2 += x * m[2]!; s2 += y * m[6]!; s2 += z * m[10]!; s2 += 1 * m[14]!
      let s3 = 0; s3 += x * m[3]!; s3 += y * m[7]!; s3 += z * m[11]!; s3 += 1 * m[15]!
      let flag = 0
      flag = (flag << 1) | (s0 < s3 ? 1 : 0)
      flag = (flag << 1) | (s0 > -s3 ? 1 : 0)
      flag = (flag << 1) | (s1 < s3 ? 1 : 0)
      flag = (flag << 1) | (s1 > -s3 ? 1 : 0)
      flag = (flag << 1) | (s2 < s3 ? 1 : 0)
      flag = (flag << 1) | (s2 > -s3 ? 1 : 0)
      clipFlags |= flag
    }
    return clipFlags === 0x3f
  }

  // --- private helpers -----------------------------------------------------

  private _dirtyFrustumPlanes(): void {
    this._planes = null
  }

  private _copyFrom(o: GfFrustum): void {
    this._position = o._position
    this._rotation = o._rotation
    this._window = o._window
    this._nearFar = o._nearFar
    this._viewDistance = o._viewDistance
    this._projectionType = o._projectionType
    this._planes = null
  }

  /** Rotate a direction by a GfRotation (matches GfRotation::TransformDir). */
  private _rotateDir(r: Rotation, v: GfVec3d): GfVec3d {
    return new GfMatrix4d().setRotate(r).transformDir(v) as GfVec3d
  }

  /** Calculates the cached frustum planes used for intersection tests. */
  private _calculateFrustumPlanes(): void {
    if (this._planes) return

    const newPlanes: GfPlane[] = new Array<GfPlane>(6)

    const winMin = this._window.getMin().data
    const winMax = this._window.getMax().data
    const near = this._nearFar.getMin()
    const far = this._nearFar.getMax()
    const m = this.computeViewInverse()

    if (this._projectionType === GfFrustum.Perspective) {
      let vp = new GfVec3d(0.0, 0.0, 0.0)
      let lb = new GfVec3d(near * winMin[0]!, near * winMin[1]!, -near)
      let rb = new GfVec3d(near * winMax[0]!, near * winMin[1]!, -near)
      let lt = new GfVec3d(near * winMin[0]!, near * winMax[1]!, -near)
      let rt = new GfVec3d(near * winMax[0]!, near * winMax[1]!, -near)

      vp = m.Transform(vp) as GfVec3d
      lb = m.Transform(lb) as GfVec3d
      rb = m.Transform(rb) as GfVec3d
      lt = m.Transform(lt) as GfVec3d
      rt = m.Transform(rt) as GfVec3d

      // CCW on the inside of the frustum (right-hand rule).
      newPlanes[0] = new GfPlane(vp, lb, lt) // Left
      newPlanes[1] = new GfPlane(vp, rt, rb) // Right
      newPlanes[2] = new GfPlane(vp, rb, lb) // Bottom
      newPlanes[3] = new GfPlane(vp, lt, rt) // Top
      newPlanes[4] = new GfPlane(rb, lb, lt) // Near (Far below)
    } else {
      let lb = new GfVec3d(winMin[0]!, winMin[1]!, -near)
      let rb = new GfVec3d(winMax[0]!, winMin[1]!, -near)
      let lt = new GfVec3d(winMin[0]!, winMax[1]!, -near)
      let rt = new GfVec3d(winMax[0]!, winMax[1]!, -near)

      lb = m.Transform(lb) as GfVec3d
      rb = m.Transform(rb) as GfVec3d
      lt = m.Transform(lt) as GfVec3d
      rt = m.Transform(rt) as GfVec3d

      const dir = m.transformDir(new GfVec3d(0, 0, -1)) as GfVec3d

      newPlanes[0] = new GfPlane(lt.add(dir) as GfVec3d, lt, lb) // Left
      newPlanes[1] = new GfPlane(rb.add(dir) as GfVec3d, rb, rt) // Right
      newPlanes[2] = new GfPlane(lb.add(dir) as GfVec3d, lb, rb) // Bottom
      newPlanes[3] = new GfPlane(rt.add(dir) as GfVec3d, rt, lt) // Top
      newPlanes[4] = new GfPlane(rb, lb, lt) // Near (Far below)
    }

    // The far plane is opposite the near plane.
    // fdistance = -(ndistance + (far - near)).
    newPlanes[5] = new GfPlane(
      newPlanes[4]!.getNormal().getNegated(),
      -(newPlanes[4]!.getDistanceFromOrigin() + (far - near)))

    this._planes = newPlanes
  }
}

// --- module-private helpers (frustum.cpp file-scope statics) ---------------

/** Maps a normalized window coord (-1..1) onto the window rectangle. */
function _WindowNormalizedToPoint(
  windowPos: GfVec2d, windowRect: GfRange2d,
): GfVec2d {
  // scaledPos = 0.5 * ((1,1) + windowPos); min + scaledPos * size.
  const scaledPos = new GfVec2d(1.0, 1.0).add(windowPos).getScaled(0.5) as GfVec2d
  return windowRect.getMin().add(
    GfCompMult(scaledPos, windowRect.getSize() as GfVec2d)) as GfVec2d
}

/** Builds the camera-space (untransformed) ray for a window position. */
function _ComputeUntransformedRay(
  projectionType: GfFrustumProjectionType,
  window: GfRange2d,
  windowPos: GfVec2d,
  nearDist: number,
): GfRay {
  const windowPoint = _WindowNormalizedToPoint(windowPos, window).data

  let pos: GfVec3d
  let dir: GfVec3d
  if (projectionType === GfFrustum.Perspective) {
    // Ray starts at the origin (not the near plane).
    pos = new GfVec3d(0, 0, 0)
    dir = new GfVec3d(windowPoint[0]!, windowPoint[1]!, -1.0).GetNormalized()
  } else {
    pos = new GfVec3d(windowPoint[0]!, windowPoint[1]!, -nearDist)
    dir = new GfVec3d(0, 0, -1)
  }
  return new GfRay(pos, dir)
}

/** Per-point 6-bit mask of which frustum planes the point is inside. */
function _calcIntersectionBitMask(planes: GfPlane[], p: GfVec3d): number {
  return (
    ((planes[0]!.intersectsPositiveHalfSpace(p) ? 1 : 0) << 0) |
    ((planes[1]!.intersectsPositiveHalfSpace(p) ? 1 : 0) << 1) |
    ((planes[2]!.intersectsPositiveHalfSpace(p) ? 1 : 0) << 2) |
    ((planes[3]!.intersectsPositiveHalfSpace(p) ? 1 : 0) << 3) |
    ((planes[4]!.intersectsPositiveHalfSpace(p) ? 1 : 0) << 4) |
    ((planes[5]!.intersectsPositiveHalfSpace(p) ? 1 : 0) << 5)
  )
}
