// Ported from OpenUSD 26.11.1: pxr/usd/usdLod/distanceHeuristicQuery.cpp,
//  pxr/usd/usdLod/distanceHeuristicQuery.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdLod/distanceHeuristicQuery.{h,cpp}.
import { Matrix4d, Range3d, Vec3d, Vec3f } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import { HeuristicQuery } from './heuristicQuery.ts'

type FloatArrayLike = readonly number[] | VtArray<number>

/** VtFloatArray storage: every element rounds to a 32-bit float. */
function toFloatArray(values: FloatArrayLike | undefined): number[] {
  if (values === undefined) return []
  const arr = values instanceof VtArray ? values.toArray() : values
  return arr.map((v) => Math.fround(v))
}

/** std::upper_bound over an ascending range (distanceHeuristicQuery.cpp:77-80). */
function upperBound(values: readonly number[], value: number): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (value < values[mid]!) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** std::clamp(v, lo, hi). */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : hi < v ? hi : v
}

/**
 * A detached copy of a UsdLodDistanceHeuristic's values that can compute
 * distances and LOD indices without referring back to USD
 * (distanceHeuristicQuery.h:27-231).
 */
export class DistanceHeuristicQuery extends HeuristicQuery {
  /**
   * The center point of the LOD root in local coordinates. If `extent` is
   * empty then this center point is used to compute the distance; otherwise
   * `center` is ignored (distanceHeuristicQuery.h:44-47).
   */
  center: Vec3f = new Vec3f(0.0, 0.0, 0.0)

  /**
   * The bounding box of the geometry. If not empty it is used to compute the
   * distance, otherwise `center` is. Empty by default
   * (distanceHeuristicQuery.h:49-52).
   */
  extent: Range3d = new Range3d()

  /** Distance thresholds in ascending order (distanceHeuristicQuery.h:54-63; VtFloatArray). */
  thresholds: number[] = []

  /** Blend thresholds in ascending order (distanceHeuristicQuery.h:65-90; VtFloatArray). */
  blendThresholds: number[] = []

  /**
   * Default construction, copy construction, or construction from explicit
   * values (distanceHeuristicQuery.h:93-109).
   */
  constructor(
    domainIn?: string | DistanceHeuristicQuery,
    centerIn: Vec3f | readonly number[] = new Vec3f(0.0, 0.0, 0.0),
    extentIn: Range3d = new Range3d(),
    thresholdsIn: FloatArrayLike = [],
    blendThresholdsIn: FloatArrayLike = [],
  ) {
    if (domainIn instanceof DistanceHeuristicQuery) {
      super(domainIn.lodDomain)
      this.center = new Vec3f(domainIn.center)
      this.extent = new Range3d(domainIn.extent.getMin(), domainIn.extent.getMax())
      this.thresholds = [...domainIn.thresholds]
      this.blendThresholds = [...domainIn.blendThresholds]
      return
    }
    super(domainIn)
    if (domainIn === undefined) return
    this.center = new Vec3f(centerIn)
    this.extent = extentIn
    this.thresholds = toFloatArray(thresholdsIn)
    this.blendThresholds = toFloatArray(blendThresholdsIn)
  }

  /**
   * Compute a distance given a `viewpoint` and a `transform` from the root's
   * local space to the viewpoint's space (distanceHeuristicQuery.cpp:24-58).
   *
   * With `prevDistance` and `hysteresis`, apply hysteresis to the result
   * (distanceHeuristicQuery.h:145-163).
   */
  computeDistance(viewpoint: Vec3d, transform: Matrix4d): number
  computeDistance(viewpoint: Vec3d, transform: Matrix4d, prevDistance: number, hysteresis: number): number
  computeDistance(
    viewpoint: Vec3d, transform: Matrix4d, prevDistance?: number, hysteresis?: number,
  ): number {
    if (prevDistance !== undefined && hysteresis !== undefined) {
      // distanceHeuristicQuery.h:145-163
      const distance = this.computeDistance(viewpoint, transform)

      if (prevDistance < distance - hysteresis) {
        // distance is increasing
        prevDistance = distance - hysteresis
      } else if (prevDistance > distance + hysteresis) {
        // distance is decreasing
        prevDistance = distance + hysteresis
      } else {
        // prevSize is still within the hysteresis window. No change.
      }

      return prevDistance
    }

    // distanceHeuristicQuery.cpp:24-58
    let target = new Vec3d(this.center)

    // If we have a valid extent and transform, use them. Apologies for
    // the hard-coded epsilon.
    const epsilon = 1.0e-10
    if (!this.extent.IsEmpty() &&
        Math.abs(transform.getDeterminant()) > epsilon) {
      const invTransform = transform.getInverse()
      const invViewpoint = invTransform.Transform(viewpoint) as Vec3d

      if (this.extent.contains(invViewpoint)) {
        // The viewpoint is inside the extent. Distance is 0.0
        return 0.0
      }

      // set target to the closest point on the extent.
      const extentMin = this.extent.getMin()
      const extentMax = this.extent.getMax()

      target = new Vec3d(
        clamp(invViewpoint.get(0), extentMin.get(0), extentMax.get(0)),
        clamp(invViewpoint.get(1), extentMin.get(1), extentMax.get(1)),
        clamp(invViewpoint.get(2), extentMin.get(2), extentMax.get(2)))
    }

    target = transform.Transform(target) as Vec3d
    const distance = target.subtract(viewpoint).GetLength()

    return distance
  }

  /**
   * Compute an LOD index given a distance (distanceHeuristicQuery.cpp:60-124),
   * given a `viewpoint` and `transform` (distanceHeuristicQuery.h:198-202), or
   * given those plus `prevDistance` and `hysteresis`
   * (distanceHeuristicQuery.h:217-227). The last form returns
   * `[lodIndex, distance]`: C++ stores the distance through the `distanceOut`
   * pointer, and the Python binding returns this same pair
   * (wrapDistanceHeuristicQuery.cpp _WrapComputeLOD3).
   */
  computeLOD(distance: number): number
  computeLOD(viewpoint: Vec3d, transform: Matrix4d): number
  computeLOD(viewpoint: Vec3d, transform: Matrix4d, prevDistance: number, hysteresis: number): [number, number]
  computeLOD(
    arg: number | Vec3d, transform?: Matrix4d, prevDistance?: number, hysteresis?: number,
  ): number | [number, number] {
    if (typeof arg !== 'number') {
      if (prevDistance !== undefined && hysteresis !== undefined) {
        const distanceOut = this.computeDistance(arg, transform!, prevDistance, hysteresis)
        return [this.computeLOD(distanceOut), distanceOut]
      }
      return this.computeLOD(this.computeDistance(arg, transform!))
    }
    const distance = arg
    const thresholds = this.thresholds
    const blendThresholds = this.blendThresholds

    // Assume that the data has been validated but try to not fail too badly
    // if it is invalid (distanceHeuristicQuery.cpp:63-76).
    const lodIndex = upperBound(thresholds, distance)

    // If there are no blendThresholds values then there's no blending
    if (blendThresholds.length === 0) {
      return Math.fround(lodIndex)
    }

    // We may have blending, find the blendIndex from blendThresholds.
    let blendIndex = upperBound(blendThresholds, distance)
    blendIndex = Math.max(lodIndex - 1, Math.min(lodIndex, blendIndex))

    // If lodIndex == blendIndex, then we found the same corresponding
    // threshold index in both vectors. This implies we're below the
    // thresholds value and are not blending. Similarly, if we're off the end
    // of blendThresholds we are not blending.
    if (blendIndex === lodIndex || blendIndex >= blendThresholds.length) {
      return Math.fround(lodIndex)
    }

    // Blend. blendIndex == lodIndex - 1 and is the index into both thresholds
    // and blendThresholds of values that bracket distance.
    const a = thresholds[blendIndex]!
    let b = blendThresholds[blendIndex]!

    // Ensure that b is clamped to the next value from thresholds (just
    // in case the blendThresholds value was huge).
    if (lodIndex < thresholds.length) {
      b = Math.min(b, thresholds[lodIndex]!)
    }

    // Validate that the data is well-behaved enough to compute the blend
    // value.
    if (a <= distance && distance < b) {
      // `float fraction = ...; return blendIndex + fraction;` (float math)
      const fraction = Math.fround((distance - a) / (b - a))
      return Math.fround(blendIndex + fraction)
    }

    return Math.fround(lodIndex)
  }

  /** operator<< (distanceHeuristicQuery.cpp:126-143). */
  toString(): string {
    const extent = this.extent.IsEmpty() ? '[--empty--]' : this.extent.toString()
    return `UsdLodDistanceHeuristicQuery{"${this.lodDomain}", ${this.center.toString()}, ` +
      `${extent}, [${this.thresholds.join(', ')}], [${this.blendThresholds.join(', ')}]}`
  }
}
