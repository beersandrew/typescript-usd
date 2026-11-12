// Ported from OpenUSD 26.11.1: pxr/usd/usdLod/screenSizeHeuristicQuery.cpp,
//  pxr/usd/usdLod/screenSizeHeuristicQuery.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdLod/screenSizeHeuristicQuery.{h,cpp}.
import {
  BBox3d, Frustum, GfProject, Matrix4d, Range3d, Vec2d, Vec3d, Vec4d,
} from 'typescript-usd/gf'
import {
  Error as TfError, TfDiagnosticMgr, TfDiagnosticType,
} from 'typescript-usd/tf'
import { Array as VtArray } from 'typescript-usd/vt'
import { HeuristicQuery } from './heuristicQuery.ts'
import { UsdLodTokens } from './tokens.ts'

type FloatArrayLike = readonly number[] | VtArray<number>

/** VtFloatArray storage: every element rounds to a 32-bit float. */
function toFloatArray(values: FloatArrayLike | undefined): number[] {
  if (values === undefined) return []
  const arr = values instanceof VtArray ? values.toArray() : values
  return arr.map((v) => Math.fround(v))
}

/**
 * std::upper_bound(..., size, std::greater<float>()) over a descending range
 * (screenSizeHeuristicQuery.cpp:334-338). std::greater<float> converts the
 * searched double to float before comparing.
 */
function upperBoundGreater(values: readonly number[], value: number): number {
  const v = Math.fround(value)
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (v > values[mid]!) hi = mid
    else lo = mid + 1
  }
  return lo
}

// --- anonymous namespace (screenSizeHeuristicQuery.cpp:18-274) ---

// Indexes of the edges of the extent box (screenSizeHeuristicQuery.cpp:21-28)
const boxEdges: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7], // parallel to x-axis
  [0, 2], [1, 3], [4, 6], [5, 7], // parallel to y-axis
  [0, 4], [1, 5], [2, 6], [3, 7], // parallel to z-axis
]

// screenSizeHeuristicQuery.cpp:30-34
function _To4d(v: Vec3d, w: number): Vec4d {
  return new Vec4d(v.get(0), v.get(1), v.get(2), w)
}

// GfLerp(alpha, a, b) for GfVec4d: (1-alpha)*a + alpha*b (gf/math.h GfLerp).
function _Lerp4d(alpha: number, a: Vec4d, b: Vec4d): Vec4d {
  return a.getScaled(1 - alpha).add(b.getScaled(alpha))
}

// screenSizeHeuristicQuery.cpp:36-93
function _ComputeProjectedSphereSize(
  frustum: Frustum, transform: Matrix4d, extent: Range3d,
): number {
  // Instead of dividing by 0, just return a "really big" multiple of the
  // screen size.
  const REALLY_BIG = Number.MAX_VALUE

  // Transform the extent to world space (really, whatever space the frustum
  // is defined in).
  const worldMin = transform.Transform(extent.getMin()) as Vec3d
  const worldMax = transform.Transform(extent.getMax()) as Vec3d

  // Note that this is strictly only the correct radius and center when
  // the transform does have shear. A shearing transform could make two
  // corners other than worldMin and worldMax have the longest diagonal.
  // But it's close enough for level of detail work.
  const worldRadius = worldMax.subtract(worldMin).GetLength() / 2.0
  const worldCenter = transform.Transform(extent.getMidpoint()) as Vec3d

  const frustumPlanes = frustum.computePlanes()

  // See if the sphere is completely clipped by any of the frustum planes.
  for (const plane of frustumPlanes) {
    if (plane.getDistance(worldCenter) < -worldRadius) {
      // The entire sphere is behind the plane. Nothing is visible.
      return 0.0
    }
  }

  // At least some part of the sphere was visible. Now approximate its
  // size in the frustum window.
  let radius: number
  if (frustum.getProjectionType() === Frustum.Perspective) {
    const distance = frustum.getPosition().subtract(worldCenter).GetLength()
    if (distance === 0.0) {
      // The sphere is huge. Just return a large number.
      return REALLY_BIG
    }

    radius = worldRadius * Frustum.getReferencePlaneDepth() / distance
  } else {
    // Orthographic projection
    radius = worldRadius
  }

  const extentArea = Math.PI * radius * radius
  const windowDiagonal = frustum.getWindow().getSize() as Vec2d
  const windowArea = windowDiagonal.get(0) * windowDiagonal.get(1)

  // This should never happen, but just to be safe.
  if (windowArea === 0.0) {
    return REALLY_BIG
  }

  return extentArea / windowArea
}

type Point2 = readonly [number, number]

// screenSizeHeuristicQuery.cpp:95-272
function _ComputeProjectedExtentSize(
  _frustum: Frustum, clipTransform: Matrix4d, extent: Range3d,
): number {
  // Note that the caller already checked for a completely clipped extent. So
  // we know the extent intersects the frustum.

  // Get the corners of the extent, transformed into clip coordinates
  // (homogeneous NDC space without a perspective divide).
  const extentCorners: Vec4d[] = []
  for (let i = 0; i < 8; ++i) {
    extentCorners.push(
      clipTransform.multVecMatrix(_To4d(extent.getCorner(i) as Vec3d, 1.0)) as Vec4d)
  }

  // There are 12 edges so we need space for 24 vertices after clipping. The
  // output points will be projected to 2d screen space in NDC coordinates
  // since that's all we need to compute the area.
  let outputPoints: Point2[] = []

  // We don't want the screen size (for LOD purposes) of an object that is
  // sliding through the side of the frustum to change. We want it to retain
  // pretty much the same screen size metric as it moves sideways through the
  // frustum. So we're only going to clip against the near plane.
  for (const [first, second] of boxEdges) {
    const p0 = extentCorners[first]!
    const p1 = extentCorners[second]!

    let tMin = 0.0
    let tMax = 1.0

    // The equation for the near plane in clip space is
    //     GfVec4d(0, 0, 1, 1) * point = 0
    // which simplifies to the signed distance point.z + point.w.
    const d0 = p0.get(2) + p0.get(3) // signed distance of p0 from nearPlane
    const d1 = p1.get(2) + p1.get(3) // signed distance of p1 from nearPlane

    if (d0 < 0 && d1 < 0) {
      // The edge entirely clipped
      continue
    } else if (d0 < 0 || d1 < 0) {
      // The edge is partially clipped
      const t = d0 / (d0 - d1)

      if (d0 < 0) {
        // The beginning of the edge is clipped
        tMin = Math.max(tMin, t)
      } else {
        // The end of the edge is clipped
        tMax = Math.min(tMax, t)
      }
      // Interpolate segment end points, project them from homogeneous
      // to NDC space, then discard the z coordinate.
      const ndc0 = GfProject(_Lerp4d(tMin, p0, p1))
      const ndc1 = GfProject(_Lerp4d(tMax, p0, p1))

      outputPoints.push([ndc0.get(0), ndc0.get(1)])
      outputPoints.push([ndc1.get(0), ndc1.get(1)])
    } else {
      // Not clipped at all, project to NDC space without interpolating
      const ndc0 = GfProject(p0)
      const ndc1 = GfProject(p1)

      outputPoints.push([ndc0.get(0), ndc0.get(1)])
      outputPoints.push([ndc1.get(0), ndc1.get(1)])
    }
  }

  // Comparator for points to order them by x and then y.
  const _PointLess = (a: Point2, b: Point2): boolean =>
    (a[0] < b[0]) || (a[0] === b[0] && a[1] < b[1])

  // Compare points for "equality" (GfIsClose with 1e-6 on each coordinate).
  const _PointEq = (a: Point2, b: Point2): boolean =>
    Math.abs(a[0] - b[0]) < 1.0e-6 && Math.abs(a[1] - b[1]) < 1.0e-6

  // Compute a 2D cross product of (b - a) with (c - a).
  const _Cross2d = (a: Point2, b: Point2, c: Point2): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

  // Order the points left to right.
  outputPoints.sort((a, b) => (_PointLess(a, b) ? -1 : _PointLess(b, a) ? 1 : 0))

  // Remove duplicates (std::unique compares against the last kept point).
  const unique: Point2[] = []
  for (const p of outputPoints) {
    if (unique.length === 0 || !_PointEq(unique[unique.length - 1]!, p)) unique.push(p)
  }
  outputPoints = unique
  const outputSize = outputPoints.length

  // Now construct the convex hull. Build a counter-clockwise polygon by
  // starting at the leftmost point and keeping only points that do not create
  // right turns. The last point is a duplicate of the first.
  const hull: Point2[] = []
  let hullSize = 0

  // Build the lower hull.
  for (let i = 0; i < outputSize; ++i) {
    const point = outputPoints[i]!

    // If we made a right turn, eliminate the last point in the hull
    while (hullSize >= 2 &&
           _Cross2d(hull[hullSize - 2]!, hull[hullSize - 1]!, point) <= 0.0) {
      --hullSize
    }

    hull[hullSize++] = point
  }

  // Build the upper hull. We don't want to pop points off the lower hull so
  // set a lower size limit. The first point of the upper hull is always the
  // last point of the lower hull and it's already in hull.
  const lowerLimit = hullSize + 1

  // Skip the end point (already added at the end of the lower hull).
  for (let j = outputSize - 2; j >= 0; --j) {
    const point = outputPoints[j]!
    // If we made a right turn, eliminate the last point in the upper hull
    while (hullSize >= lowerLimit &&
           _Cross2d(hull[hullSize - 2]!, hull[hullSize - 1]!, point) <= 0.0) {
      --hullSize
    }

    hull[hullSize++] = point
  }

  // The initial point in hull is duplicated as the last point, so the
  // Shoelace Formula needs no wrap-around.
  let area2 = 0
  for (let i = 0; i < hullSize - 1; ++i) {
    area2 += hull[i]![0] * hull[i + 1]![1] - hull[i]![1] * hull[i + 1]![0]
  }

  // The sum is twice the area so divide by 2 to get the area and by 4 (the
  // area of the NDC view plane) to get a fraction of the view plane.
  const screenSize = area2 / 8.0

  return screenSize
}

// --- end anonymous namespace ---

/**
 * A detached copy of a UsdLodScreenSizeHeuristic's values that can compute
 * screen sizes and LOD indices without referring back to USD
 * (screenSizeHeuristicQuery.h:39-264).
 */
export class ScreenSizeHeuristicQuery extends HeuristicQuery {
  /** The bounding box of the LOD root's geometry (screenSizeHeuristicQuery.h:45-48). */
  extent: Range3d = new Range3d()

  /**
   * How the extent is projected to compute the screen size
   * (screenSizeHeuristicQuery.h:50-87).
   */
  projectionMethod: string = UsdLodTokens.projectedSphere

  /** Screen-size thresholds in descending order (screenSizeHeuristicQuery.h:89-99; VtFloatArray). */
  thresholds: number[] = []

  /** Blend thresholds in descending order (screenSizeHeuristicQuery.h:101-125; VtFloatArray). */
  blendThresholds: number[] = []

  /**
   * Default construction, copy construction, or construction from explicit
   * values (screenSizeHeuristicQuery.h:128-143).
   */
  constructor(
    domainIn?: string | ScreenSizeHeuristicQuery,
    extentIn: Range3d = new Range3d(),
    projectionMethodIn: string = UsdLodTokens.projectedSphere,
    thresholdsIn: FloatArrayLike = [],
    blendThresholdsIn: FloatArrayLike = [],
  ) {
    if (domainIn instanceof ScreenSizeHeuristicQuery) {
      super(domainIn.lodDomain)
      this.extent = new Range3d(domainIn.extent.getMin(), domainIn.extent.getMax())
      this.projectionMethod = domainIn.projectionMethod
      this.thresholds = [...domainIn.thresholds]
      this.blendThresholds = [...domainIn.blendThresholds]
      return
    }
    super(domainIn)
    if (domainIn === undefined) return
    this.extent = extentIn
    this.projectionMethod = projectionMethodIn
    this.thresholds = toFloatArray(thresholdsIn)
    this.blendThresholds = toFloatArray(blendThresholdsIn)
  }

  /**
   * Calculate the screen size given a `frustum` and a `transform`
   * (screenSizeHeuristicQuery.cpp:285-314); with `prevSize` and `hysteresis`,
   * apply hysteresis to the result (screenSizeHeuristicQuery.h:181-199).
   */
  computeScreenSize(frustum: Frustum, transform: Matrix4d): number
  computeScreenSize(frustum: Frustum, transform: Matrix4d, prevSize: number, hysteresis: number): number
  computeScreenSize(
    frustum: Frustum, transform: Matrix4d, prevSize?: number, hysteresis?: number,
  ): number {
    if (prevSize !== undefined && hysteresis !== undefined) {
      // screenSizeHeuristicQuery.h:181-199
      const screenSize = this.computeScreenSize(frustum, transform)

      if (prevSize < screenSize - hysteresis) {
        // screenSize is increasing
        prevSize = screenSize - hysteresis
      } else if (prevSize > screenSize + hysteresis) {
        // screenSize is decreasing
        prevSize = screenSize + hysteresis
      } else {
        // prevSize is still within the hysteresis window. No change.
      }

      return prevSize
    }

    // screenSizeHeuristicQuery.cpp:285-314
    if (this.extent.IsEmpty()) {
      return 0.0
    }

    if (this.projectionMethod === UsdLodTokens.projectedSphere) {
      return _ComputeProjectedSphereSize(frustum, transform, this.extent)
    } else if (this.projectionMethod !== UsdLodTokens.projectedExtent) {
      // Complain if the projection method is invalid but use projectedExtent
      // anyway.
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Invalid value for projectionMethod ('${this.projectionMethod}').`,
        TfDiagnosticType.CodingError))
    }

    const bbox = new BBox3d(this.extent, transform)
    if (!frustum.intersects(bbox)) {
      return 0.0
    }

    const viewTransform = transform.getMultiply(frustum.computeViewMatrix())
    const clipTransform = viewTransform.getMultiply(frustum.computeProjectionMatrix())

    return _ComputeProjectedExtentSize(frustum, clipTransform, this.extent)
  }

  /**
   * Calculate an LOD index given a screen size
   * (screenSizeHeuristicQuery.cpp:316-383), given a `frustum` and `transform`
   * (screenSizeHeuristicQuery.h:235-239), or given those plus `prevSize` and
   * `hysteresis` (screenSizeHeuristicQuery.h:254-263). The last form returns
   * `[lodIndex, screenSize]`: C++ stores the size through the `sizeOut`
   * pointer, and the Python binding returns this same pair
   * (wrapScreenSizeHeuristicQuery.cpp _WrapComputeLOD3).
   */
  computeLOD(size: number): number
  computeLOD(frustum: Frustum, transform: Matrix4d): number
  computeLOD(frustum: Frustum, transform: Matrix4d, prevSize: number, hysteresis: number): [number, number]
  computeLOD(
    arg: number | Frustum, transform?: Matrix4d, prevSize?: number, hysteresis?: number,
  ): number | [number, number] {
    if (typeof arg !== 'number') {
      if (prevSize !== undefined && hysteresis !== undefined) {
        const sizeOut = this.computeScreenSize(arg, transform!, prevSize, hysteresis)
        return [this.computeLOD(sizeOut), sizeOut]
      }
      return this.computeLOD(this.computeScreenSize(arg, transform!))
    }
    const size = arg
    const thresholds = this.thresholds
    const blendThresholds = this.blendThresholds

    // Assume that the data has been validated but try to not fail too badly
    // if it is invalid (screenSizeHeuristicQuery.cpp:320-333).
    const lodIndex = upperBoundGreater(thresholds, size)

    // If there are no blendThresholds values then there's no blending
    if (blendThresholds.length === 0) {
      return Math.fround(lodIndex)
    }

    // We may have a blending, find the blendIndex from blendThresholds.
    let blendIndex = upperBoundGreater(blendThresholds, size)
    blendIndex = Math.max(lodIndex - 1, Math.min(lodIndex, blendIndex))

    // If lodIndex == blendIndex, we're not blending. Similarly, if we're off
    // the end of blendThresholds we are not blending.
    if (blendIndex === lodIndex || blendIndex >= blendThresholds.length) {
      return Math.fround(lodIndex)
    }

    // Blend. blendIndex == lodIndex - 1 and is the index into both thresholds
    // and blendThresholds of values that bracket screenSize.
    const a = thresholds[blendIndex]!
    let b = blendThresholds[blendIndex]!

    // Ensure that b is clamped to the next value from thresholds (just
    // in case the blendThresholds was even smaller).
    if (lodIndex < thresholds.length) {
      b = Math.max(b, thresholds[lodIndex]!)
    }

    // Validate that the data is well-behaved enough to compute the blend
    // value.
    if (a >= size && size > b) {
      // `float fraction = ...; return blendIndex + fraction;` (float math)
      const fraction = Math.fround((size - a) / (b - a))
      return Math.fround(blendIndex + fraction)
    }

    return Math.fround(lodIndex)
  }

  /** operator<< (screenSizeHeuristicQuery.cpp:385-402). */
  toString(): string {
    const extent = this.extent.IsEmpty() ? '[--empty--]' : this.extent.toString()
    return `UsdLodScreenSizeHeuristicQuery{"${this.lodDomain}", ${extent}, ` +
      `"${this.projectionMethod}", [${this.thresholds.join(', ')}], ` +
      `[${this.blendThresholds.join(', ')}]}`
  }
}
