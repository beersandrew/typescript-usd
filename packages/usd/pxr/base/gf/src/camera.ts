// Ported from OpenUSD 26.11.1: pxr/base/gf/camera.cpp, pxr/base/gf/camera.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfCamera value type (object-based camera).
//
// Mirrors OpenUSD pxr/base/gf/camera.{h,cpp}. A GfCamera is a thin wrapper on
// the camera data model (transform, projection, projector aperture + offsets,
// focal length, clipping range/planes, fStop, focus distance) with a small
// number of computations — most importantly GetFrustum(), which derives the
// world-space GfFrustum (always that of a Y-up, -Z-looking camera).
//
// The aperture<->FOV<->frustum-window math is unit-sensitive: aperture and
// focal length are stored in tenths of a world unit (mm if the world unit is
// cm), and APERTURE_UNIT / FOCAL_LENGTH_UNIT (both 0.1) convert to world units.
// The algorithm is ported VERBATIM (same operation order) so results match the
// Pixar oracle (validated in tests/upstream/camera.test.ts against goldens
// captured from the OpenUSD 26.11.1 build).
//
// Precision note (faithful, not FAITHFULNESS-DEBT): upstream stores aperture,
// offsets, focalLength, fStop and focusDistance as C++ `float`, so every setter
// here rounds through Math.fround to reproduce float32 storage exactly; the
// frustum math then runs in double, matching the C++ float->double promotions.
// clippingRange is a GfRange1f (float) and clippingPlanes are GfVec4f, both of
// which already round to float. The transform is a GfMatrix4d (double).

import { GfMatrix4d } from './matrixData.ts'
import { GfVec2d, GfVec3d, GfVec4f } from './vec.ts'
import { GfRange1d, GfRange1f, GfRange2d } from './range.ts'
import { GfFrustum, GfFrustumProjectionType } from './frustum.ts'
import { GfDegreesToRadians, GfRadiansToDegrees } from './math.ts'

const f32 = Math.fround

// Re-export the value types camera.h pulls in, so `typescript-usd/gf/camera` consumers
// can grab them alongside GfCamera (matches camera.h's includes).
export { GfMatrix4d } from './matrixData.ts'
export { GfVec4f } from './vec.ts'
export { GfRange1f } from './range.ts'
export { GfFrustum } from './frustum.ts'

/** GfCamera::Projection. */
export enum GfCameraProjection {
  Perspective = 0,
  Orthographic = 1,
}

/** GfCamera::FOVDirection. */
export enum GfCameraFOVDirection {
  FOVHorizontal = 0,
  FOVVertical = 1,
}

export class GfCamera {
  // Mirror the enums onto the class so `GfCamera.Perspective` /
  // `GfCamera.FOVHorizontal` read like the C++/Python `Gf.Camera.Perspective`.
  static readonly Perspective = GfCameraProjection.Perspective
  static readonly Orthographic = GfCameraProjection.Orthographic
  static readonly FOVHorizontal = GfCameraFOVDirection.FOVHorizontal
  static readonly FOVVertical = GfCameraFOVDirection.FOVVertical

  /** The unit for horizontal and vertical aperture (one tenth of a world unit). */
  static readonly APERTURE_UNIT = 0.1
  /** The unit for focal length. Similar to APERTURE_UNIT. */
  static readonly FOCAL_LENGTH_UNIT = 0.1

  // Default filmback size: 35mm spherical projector aperture (0.825 x 0.602
  // inches, converted to mm). See camera.cpp.
  static readonly DEFAULT_HORIZONTAL_APERTURE =
    (0.825 * 2.54) / GfCamera.APERTURE_UNIT
  static readonly DEFAULT_VERTICAL_APERTURE =
    (0.602 * 2.54) / GfCamera.APERTURE_UNIT

  // frustum
  private _transform: GfMatrix4d
  private _projection: GfCameraProjection
  private _horizontalAperture: number
  private _verticalAperture: number
  private _horizontalApertureOffset: number
  private _verticalApertureOffset: number
  private _focalLength: number
  private _clippingRange: GfRange1f
  private _clippingPlanes: GfVec4f[]

  // focus
  private _fStop: number
  private _focusDistance: number

  constructor(other: GfCamera)
  constructor(
    transform?: GfMatrix4d,
    projection?: GfCameraProjection,
    horizontalAperture?: number,
    verticalAperture?: number,
    horizontalApertureOffset?: number,
    verticalApertureOffset?: number,
    focalLength?: number,
    clippingRange?: GfRange1f,
    clippingPlanes?: ReadonlyArray<GfVec4f>,
    fStop?: number,
    focusDistance?: number,
  )
  constructor(
    a?: GfCamera | GfMatrix4d,
    projection: GfCameraProjection = GfCamera.Perspective,
    horizontalAperture: number = GfCamera.DEFAULT_HORIZONTAL_APERTURE,
    verticalAperture: number = GfCamera.DEFAULT_VERTICAL_APERTURE,
    horizontalApertureOffset = 0.0,
    verticalApertureOffset = 0.0,
    focalLength = 50.0,
    clippingRange: GfRange1f = new GfRange1f(1, 1000000),
    clippingPlanes: ReadonlyArray<GfVec4f> = [],
    fStop = 0.0,
    focusDistance = 0.0,
  ) {
    if (a instanceof GfCamera) {
      // Copy constructor.
      this._transform = new GfMatrix4d(a._transform)
      this._projection = a._projection
      this._horizontalAperture = a._horizontalAperture
      this._verticalAperture = a._verticalAperture
      this._horizontalApertureOffset = a._horizontalApertureOffset
      this._verticalApertureOffset = a._verticalApertureOffset
      this._focalLength = a._focalLength
      this._clippingRange = new GfRange1f(a._clippingRange)
      this._clippingPlanes = a._clippingPlanes.map((v) => new GfVec4f(v))
      this._fStop = a._fStop
      this._focusDistance = a._focusDistance
      return
    }

    this._transform = a !== undefined ? new GfMatrix4d(a) : new GfMatrix4d(1.0)
    this._projection = projection
    this._horizontalAperture = f32(horizontalAperture)
    this._verticalAperture = f32(verticalAperture)
    this._horizontalApertureOffset = f32(horizontalApertureOffset)
    this._verticalApertureOffset = f32(verticalApertureOffset)
    this._focalLength = f32(focalLength)
    this._clippingRange = new GfRange1f(clippingRange)
    this._clippingPlanes = clippingPlanes.map((v) => new GfVec4f(v))
    this._fStop = f32(fStop)
    this._focusDistance = f32(focusDistance)
  }

  // --- setters (camera.cpp Set*) -------------------------------------------

  setTransform(val: GfMatrix4d): void {
    this._transform = new GfMatrix4d(val)
  }
  setProjection(val: GfCameraProjection): void {
    this._projection = val
  }
  setFocalLength(val: number): void {
    this._focalLength = f32(val)
  }
  setHorizontalAperture(val: number): void {
    this._horizontalAperture = f32(val)
  }
  setVerticalAperture(val: number): void {
    this._verticalAperture = f32(val)
  }
  setHorizontalApertureOffset(val: number): void {
    this._horizontalApertureOffset = f32(val)
  }
  setVerticalApertureOffset(val: number): void {
    this._verticalApertureOffset = f32(val)
  }
  setClippingRange(val: GfRange1f): void {
    this._clippingRange = new GfRange1f(val)
  }
  setClippingPlanes(val: ReadonlyArray<GfVec4f>): void {
    this._clippingPlanes = val.map((v) => new GfVec4f(v))
  }
  setFStop(val: number): void {
    this._fStop = f32(val)
  }
  setFocusDistance(val: number): void {
    this._focusDistance = f32(val)
  }

  // --- frustum geometry setup ----------------------------------------------

  /**
   * Sets the frustum to be projective with the given aspectRatio and
   * horizontal/vertical field of view (camera.cpp). Achieved by setting the
   * apertures (to get the aspect ratio) and the focal length (to get the FOV).
   */
  setPerspectiveFromAspectRatioAndFieldOfView(
    aspectRatio: number,
    fieldOfView: number,
    direction: GfCameraFOVDirection,
    horizontalAperture: number = GfCamera.DEFAULT_HORIZONTAL_APERTURE,
  ): void {
    this._projection = GfCamera.Perspective

    // Set the vertical and horizontal aperture to achieve the aspect ratio.
    this._horizontalAperture = f32(horizontalAperture)
    this._verticalAperture = f32(
      horizontalAperture / (aspectRatio !== 0.0 ? aspectRatio : 1.0),
    )

    // Pick the right dimension based on the direction parameter.
    const aperture =
      direction === GfCamera.FOVHorizontal
        ? this._horizontalAperture
        : this._verticalAperture
    // Compute tangent for field of view. C++ stores this as a `float`, so it is
    // rounded to float32 before being used in the focal-length math.
    const tanValue = f32(Math.tan(0.5 * GfDegreesToRadians(fieldOfView)))

    if (tanValue === 0) {
      // To avoid division by zero, just set default value.
      this._focalLength = 50.0
      return
    }

    // Do the math for the focal length.
    this._focalLength = f32(
      ((aperture * GfCamera.APERTURE_UNIT) / (2 * tanValue)) /
        GfCamera.FOCAL_LENGTH_UNIT,
    )
  }

  /**
   * Sets the frustum to be orthographic such that it has the given aspectRatio
   * and orthographic width/height equal to orthographicSize (camera.cpp).
   */
  setOrthographicFromAspectRatioAndSize(
    aspectRatio: number,
    orthographicSize: number,
    direction: GfCameraFOVDirection,
  ): void {
    this._projection = GfCamera.Orthographic

    // Not used for orthographic cameras, but set to sane values nonetheless.
    this._focalLength = 50.0

    if (direction === GfCamera.FOVHorizontal) {
      // We are given the width, determine height by dividing by aspect ratio.
      this._horizontalAperture = f32(orthographicSize / GfCamera.APERTURE_UNIT)
      if (aspectRatio > 0.0) {
        this._verticalAperture = f32(this._horizontalAperture / aspectRatio)
      } else {
        this._verticalAperture = this._horizontalAperture
      }
    } else {
      // We are given the height, determine the width by multiplying.
      this._verticalAperture = f32(orthographicSize / GfCamera.APERTURE_UNIT)
      this._horizontalAperture = f32(this._verticalAperture * aspectRatio)
    }
  }

  /**
   * Sets the camera from a view and projection matrix (camera.cpp). The
   * projection matrix only determines the ratio of aperture to focal length, so
   * focalLength defaults to 50 (tenths of a world unit).
   */
  setFromViewAndProjectionMatrix(
    viewMatrix: GfMatrix4d,
    projMatrix: GfMatrix4d,
    focalLength = 50.0,
  ): void {
    this._transform = viewMatrix.getInverse()

    this._focalLength = f32(focalLength)

    const e = (i: number, j: number): number => projMatrix.getElement(i, j)

    if (e(2, 3) < -0.5) {
      this._projection = GfCamera.Perspective

      const apertureBase = f32(
        2.0 *
          focalLength *
          (GfCamera.FOCAL_LENGTH_UNIT / GfCamera.APERTURE_UNIT),
      )

      this._horizontalAperture = f32(apertureBase / e(0, 0))
      this._verticalAperture = f32(apertureBase / e(1, 1))
      this._horizontalApertureOffset = f32(
        0.5 * this._horizontalAperture * e(2, 0),
      )
      this._verticalApertureOffset = f32(
        0.5 * this._verticalAperture * e(2, 1),
      )
      this._clippingRange = new GfRange1f(
        e(3, 2) / (e(2, 2) - 1.0),
        e(3, 2) / (e(2, 2) + 1.0),
      )
    } else {
      this._projection = GfCamera.Orthographic
      this._horizontalAperture = f32((2.0 / GfCamera.APERTURE_UNIT) / e(0, 0))
      this._verticalAperture = f32((2.0 / GfCamera.APERTURE_UNIT) / e(1, 1))
      this._horizontalApertureOffset = f32(
        -0.5 * this._horizontalAperture * e(3, 0),
      )
      this._verticalApertureOffset = f32(
        -0.5 * this._verticalAperture * e(3, 1),
      )
      const nearMinusFarHalf = 1.0 / e(2, 2)
      const nearPlusFarHalf = nearMinusFarHalf * e(3, 2)
      this._clippingRange = new GfRange1f(
        nearPlusFarHalf + nearMinusFarHalf,
        nearPlusFarHalf - nearMinusFarHalf,
      )
    }
  }

  // --- getters (camera.cpp Get*) -------------------------------------------

  getTransform(): GfMatrix4d {
    return new GfMatrix4d(this._transform)
  }
  GetProjection(): GfCameraProjection {
    return this._projection
  }
  GetHorizontalAperture(): number {
    return this._horizontalAperture
  }
  getVerticalAperture(): number {
    return this._verticalAperture
  }
  getHorizontalApertureOffset(): number {
    return this._horizontalApertureOffset
  }
  getVerticalApertureOffset(): number {
    return this._verticalApertureOffset
  }
  getAspectRatio(): number {
    // C++ returns float.
    return this._verticalAperture === 0.0
      ? 0.0
      : f32(this._horizontalAperture / this._verticalAperture)
  }
  getFocalLength(): number {
    return this._focalLength
  }

  /** Returns the horizontal or vertical field of view in degrees (camera.cpp). */
  getFieldOfView(direction: GfCameraFOVDirection): number {
    // Pick the right aperture based on direction.
    const aperture =
      direction === GfCamera.FOVHorizontal
        ? this._horizontalAperture
        : this._verticalAperture

    // Do the math.
    const fovRAD =
      2 *
      Math.atan(
        (aperture * GfCamera.APERTURE_UNIT) /
          (2 * this._focalLength * GfCamera.FOCAL_LENGTH_UNIT),
      )

    // C++ returns float.
    return f32(GfRadiansToDegrees(fovRAD))
  }

  getClippingRange(): GfRange1f {
    return new GfRange1f(this._clippingRange)
  }
  getClippingPlanes(): GfVec4f[] {
    return this._clippingPlanes.map((v) => new GfVec4f(v))
  }
  getFStop(): number {
    return this._fStop
  }
  getFocusDistance(): number {
    return this._focusDistance
  }

  /**
   * Returns the computed, world-space camera frustum (camera.cpp). The frustum
   * is always that of a Y-up, -Z-looking camera.
   */
  getFrustum(): GfFrustum {
    const halfH = this._horizontalAperture / 2
    const halfV = this._verticalAperture / 2
    // GfRange2d window(-max, max).
    const window = new GfRange2d(
      new GfVec2d(-halfH, -halfV),
      new GfVec2d(halfH, halfV),
    )

    // Apply the aperture offset.
    const offsetVec = new GfVec2d(
      this._horizontalApertureOffset,
      this._verticalApertureOffset,
    )
    window.addInPlace(new GfRange2d(offsetVec, offsetVec))

    // Up to now, all computations were done in mm, convert to cm.
    window.multiplyInPlace(GfCamera.APERTURE_UNIT)

    if (this._projection !== GfCamera.Orthographic && this._focalLength !== 0) {
      window.divideInPlace(this._focalLength * GfCamera.FOCAL_LENGTH_UNIT)
    }

    const clippingRange = new GfRange1d(
      this._clippingRange.getMin(),
      this._clippingRange.getMax(),
    )

    const projection: GfFrustumProjectionType =
      this._projection === GfCamera.Orthographic
        ? GfFrustum.Orthographic
        : GfFrustum.Perspective

    return new GfFrustum(this._transform, window, clippingRange, projection)
  }

  // --- equality (camera.cpp operator== / operator!=) -----------------------

  /** operator== — true iff all parts match. */
  equals(other: GfCamera): boolean {
    return (
      this._transform.equals(other._transform) &&
      this._projection === other._projection &&
      this._horizontalAperture === other._horizontalAperture &&
      this._verticalAperture === other._verticalAperture &&
      this._horizontalApertureOffset === other._horizontalApertureOffset &&
      this._verticalApertureOffset === other._verticalApertureOffset &&
      this._focalLength === other._focalLength &&
      this._clippingRange.equals(other._clippingRange) &&
      this._clippingPlanesEqual(other._clippingPlanes) &&
      this._fStop === other._fStop &&
      this._focusDistance === other._focusDistance
    )
  }

  private _clippingPlanesEqual(other: ReadonlyArray<GfVec4f>): boolean {
    if (this._clippingPlanes.length !== other.length) return false
    for (let i = 0; i < other.length; i++) {
      if (!this._clippingPlanes[i]!.equals(other[i]!)) return false
    }
    return true
  }

  /**
   * Python repr — emits a valid JS GfCamera(...) constructor call (positional,
   * mirroring camera.h's ctor order). Used to mirror upstream's
   * `eval(repr(cam)) == cam` self-evaluation check.
   */
  repr(): string {
    const m = (this._transform.GetArray() as readonly number[]).join(', ')
    const proj =
      this._projection === GfCamera.Perspective
        ? 'Gf.Camera.Perspective'
        : 'Gf.Camera.Orthographic'
    const planes =
      '[' +
      this._clippingPlanes
        .map((v) => `new Gf.Vec4f(${v.data.join(', ')})`)
        .join(', ') +
      ']'
    // JS classes require `new`; this is the eval(repr())-equivalent round trip.
    return (
      `new Gf.Camera(new Gf.Matrix4d(${m}), ${proj}, ` +
      `${this._horizontalAperture}, ${this._verticalAperture}, ` +
      `${this._horizontalApertureOffset}, ${this._verticalApertureOffset}, ` +
      `${this._focalLength}, ` +
      `new Gf.Range1f(${this._clippingRange.getMin()}, ${this._clippingRange.getMax()}), ` +
      `${planes}, ${this._fStop}, ${this._focusDistance})`
    )
  }

  // --- property accessors (mirror the Python wrapCamera property surface) ---

  get transform(): GfMatrix4d {
    return this._transform
  }
  set transform(val: GfMatrix4d) {
    this.setTransform(val)
  }
  get projection(): GfCameraProjection {
    return this._projection
  }
  set projection(val: GfCameraProjection) {
    this.setProjection(val)
  }
  get horizontalAperture(): number {
    return this._horizontalAperture
  }
  set horizontalAperture(val: number) {
    this.setHorizontalAperture(val)
  }
  get verticalAperture(): number {
    return this._verticalAperture
  }
  set verticalAperture(val: number) {
    this.setVerticalAperture(val)
  }
  get horizontalApertureOffset(): number {
    return this._horizontalApertureOffset
  }
  set horizontalApertureOffset(val: number) {
    this.setHorizontalApertureOffset(val)
  }
  get verticalApertureOffset(): number {
    return this._verticalApertureOffset
  }
  set verticalApertureOffset(val: number) {
    this.setVerticalApertureOffset(val)
  }
  get focalLength(): number {
    return this._focalLength
  }
  set focalLength(val: number) {
    this.setFocalLength(val)
  }
  get clippingRange(): GfRange1f {
    return this._clippingRange
  }
  set clippingRange(val: GfRange1f) {
    this.setClippingRange(val)
  }
  get clippingPlanes(): GfVec4f[] {
    return this._clippingPlanes
  }
  set clippingPlanes(val: ReadonlyArray<GfVec4f>) {
    this.setClippingPlanes(val)
  }
  get fStop(): number {
    return this._fStop
  }
  set fStop(val: number) {
    this.setFStop(val)
  }
  get focusDistance(): number {
    return this._focusDistance
  }
  set focusDistance(val: number) {
    this.setFocusDistance(val)
  }
  get aspectRatio(): number {
    return this.getAspectRatio()
  }
  get horizontalFieldOfView(): number {
    return this.getFieldOfView(GfCamera.FOVHorizontal)
  }
  get verticalFieldOfView(): number {
    return this.getFieldOfView(GfCamera.FOVVertical)
  }
  get frustum(): GfFrustum {
    return this.getFrustum()
  }
}
