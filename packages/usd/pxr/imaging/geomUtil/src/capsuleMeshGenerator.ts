// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/capsuleMeshGenerator.cpp,
//  pxr/imaging/geomUtil/capsuleMeshGenerator.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/capsuleMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// The overloads of GeneratePoints/GenerateNormals (capsuleMeshGenerator.h:96-244)
// are one method each, told apart by the number of scalar arguments; an
// optional trailing GfMatrix4d is the framePtr. See meshGeneratorBase.ts for
// the iterator and ScalarType divergences.

import { GfRound } from 'typescript-usd/gf'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology } from 'typescript-usd/pxOsd'
import {
  GeomUtil_CapStyle, GeomUtil_PointWriter, GeomUtil_ScalarArgs, GeomUtilMeshGeneratorBase,
  type GeomUtil_Scalar, type GeomUtilPointIter,
} from './meshGeneratorBase.ts'
import { GeomUtilInterpolationTokens } from './tokens.ts'

/**
 * capsuleMeshGenerator.h:22-61: generates topology and point positions on a
 * capsule: a cylinder (bottom and top radii may differ) capped by two
 * spherical caps, centered at the origin with its spine on the Z axis. An
 * optional transform positions and orients it.
 */
export class GeomUtilCapsuleMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  static readonly minNumRadial = 3
  static readonly minNumCapAxial = 1

  /** capsuleMeshGenerator.cpp:22-39 */
  static computeNumPoints(numRadial: number, numCapAxial: number, closedSweep = true): number {
    if ((numRadial < this.minNumRadial) || (numCapAxial < this.minNumCapAxial)) {
      return 0
    }

    return GeomUtilMeshGeneratorBase._computeNumCappedQuadTopologyPoints(
      numRadial,
      /* numQuadStrips =  */ (2 * (numCapAxial - 1)) + 1,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSharedEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSharedEdge,
      closedSweep)
  }

  /** capsuleMeshGenerator.h:73-80 */
  static computeNumNormals(numRadial: number, numCapAxial: number, closedSweep = true): number {
    // Normals are per point.
    return this.computeNumPoints(numRadial, numCapAxial, closedSweep)
  }

  /** capsuleMeshGenerator.h:82-86 */
  static getNormalsInterpolation(): string {
    // Normals are per point.
    return GeomUtilInterpolationTokens.vertex
  }

  /** capsuleMeshGenerator.cpp:41-58 */
  static generateTopology(numRadial: number, numCapAxial: number, closedSweep = true): PxOsdMeshTopology {
    if ((numRadial < this.minNumRadial) || (numCapAxial < this.minNumCapAxial)) {
      return new PxOsdMeshTopology()
    }

    return GeomUtilMeshGeneratorBase._generateCappedQuadTopology(
      numRadial,
      /* numQuadStrips =  */ (2 * (numCapAxial - 1)) + 1,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSharedEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSharedEdge,
      closedSweep)
  }

  /** capsuleMeshGenerator.h:96-159 */
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    radius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    bottomRadius: number, topRadius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    bottomRadius: number, topRadius: number, height: number, sweepDegrees: number,
    framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [bottomRadius, topRadius, height, sweepDegrees, framePtr] = _Args(rest)
    this._generatePointsImpl(numRadial, numCapAxial, bottomRadius, topRadius,
      height, sweepDegrees, new GeomUtil_PointWriter(iter, framePtr))
  }

  /** capsuleMeshGenerator.h:164-227 */
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    radius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    bottomRadius: number, topRadius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    bottomRadius: number, topRadius: number, height: number, sweepDegrees: number,
    framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numCapAxial: number,
    ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [bottomRadius, topRadius, height, sweepDegrees, framePtr] = _Args(rest)
    this._generateNormalsImpl(numRadial, numCapAxial, bottomRadius, topRadius,
      height, sweepDegrees, new GeomUtil_PointWriter(iter, framePtr))
  }

  /** capsuleMeshGenerator.cpp:60-76 */
  private static _computeNumBottomCapAxial(
    S: GeomUtil_Scalar,
    numCapAxial: number,
    latitudeRange: number,
  ): number {
    // Calculate the number of rings for the bottom cap porportional to the
    // portion of a sphere that the bottom cap uses.
    const result =
      S(GfRound(2 * numCapAxial * (0.5 * Math.PI + latitudeRange) / Math.PI))

    // Convert to size_t and clamp so that there will be enough rings left over
    // for the top to have at least minNumCapAxial rings.
    const maxNumCapAxial = (2 * numCapAxial) - this.minNumCapAxial
    return Math.min(Math.max(Math.max(0, Math.trunc(result)), this.minNumCapAxial), maxNumCapAxial)
  }

  /** capsuleMeshGenerator.cpp:78-85 */
  private static _computeNumTopCapAxial(numCapAxial: number, numBottomCapAxial: number): number {
    return (2 * numCapAxial) - numBottomCapAxial
  }

  /** capsuleMeshGenerator.cpp:87-217 */
  private static _generatePointsImpl(
    numRadial: number,
    numCapAxial: number,
    bottomRadiusIn: number,
    topRadiusIn: number,
    heightIn: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar
    const bottomRadius = S(bottomRadiusIn)
    const topRadius = S(topRadiusIn)
    const height = S(heightIn)

    if ((numRadial < this.minNumRadial) || (numCapAxial < this.minNumCapAxial)) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // Initialize the center offset of the bottom (offset0) and top (offset1)
    // spherical caps to 0.  These will be adjusted below by half of the height
    // after first adjusting for the case when the radii are different.
    let offset0 = 0
    let offset1 = 0

    // Initialize the radii of the bottom (radius0) and top (radius1) spherical
    // caps to the given bottom and top radius of the cylindrical portion of the
    // capsule.
    let radius0 = bottomRadius
    let radius1 = topRadius

    // This angle represents the latitude where the bottom spherical cap will
    // transition to the cylindrical portion of the capsule, as well as the
    // angle where the top spherical cap begins after transitioning from the
    // cylindrical portion.
    let latitudeRange = 0.0

    if (bottomRadius !== topRadius && height !== 0) {
      // We need to calculate the angle where the transition should occur
      // between the cylindrical and spherical caps of the capsule, as well
      // as adjust the radii and center offsets of the spherical caps.
      // Imagine the capsule aligned with the X-axis and in cross section in
      // order to use trigonometry to determine these values.  For clarity,
      // the spherical caps are omitted from this drawing.
      //
      //          A /---------
      //           / |        --------
      //          /  |                --------
      //         /   |                        --------
      //        /    | B                               -------- C
      //       /     | - - - - - - - - - - - - - - - - - - - -/|
      //      /      |                                       / |
      //     /_______|______________________________________/__|
      //   D         E                                     F    G
      //
      // |AE| bottomRadius   |CG| topRadius   |BC| height
      //  D center of the bottom spherical cap
      //  F center of the top spherical cap
      //
      // Triangles ADE, ABC, and CFG are all right triangles and are also
      // similar because the tangents of the spherical caps must be tangent
      // to the cylindrical portion of the capsule.  We need to calcuate
      // |DE| and |FG| to determine the spherical cap center offsets, as well
      // as |AD| and |CF| to determine the spherical cap radii.

      // Calculate the slope of segment AC, using |AB| / |BC|.
      const slope = S(S(bottomRadius - topRadius) / height)

      // Use the slope and the law of similar triangles to calculate the
      // spherical cap center offsets.  For the bottom cap that is:
      //   |DE| / |AE| = |AB| / |BC|
      //   |DE| / |AE| = slope
      //   |DE|        = slope * |AE|
      offset0 = -S(slope * bottomRadius)
      offset1 = -S(slope * topRadius)

      // Use the Pythagoream theorem to calculate the spherical cap radii.
      //   |AD| = sqrt(|AE|^2 + |DE|^2)
      //   |CF| = sqrt(|CG|^2 + |FG|^2)
      // GfSqr returns double (math.h:171-174) of the ScalarType product.
      radius0 = S(Math.sqrt(S(bottomRadius * bottomRadius) + S(offset0 * offset0)))
      radius1 = S(Math.sqrt(S(topRadius * topRadius) + S(offset1 * offset1)))

      // Use the slope to determine the angle at A of triangle ADE to
      // calculate the latitude for transitioning between the spherical caps
      // and the cylindrical portion of the capsule.
      latitudeRange = S(Math.atan(slope))
    }

    // Adjust the sphere offsets to include the height.
    offset0 = S(offset0 - 0.5 * height)
    offset1 = S(offset1 + 0.5 * height)

    // Calculate the number of axial points of the sphere caps.
    const numCapAxial0 = this._computeNumBottomCapAxial(S, numCapAxial, latitudeRange)
    const numCapAxial1 = this._computeNumTopCapAxial(numCapAxial, numCapAxial0)

    // Bottom point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, S(offset0 - radius0)))

    // Bottom hemisphere latitude rings:
    for (let axIdx = 1; axIdx < (numCapAxial0 + 1); ++axIdx) {
      // Latitude range: (-0.5pi, latitudeRange]
      const latAngle = _Lerp(S, axIdx / numCapAxial0, S(-0.5 * Math.PI), latitudeRange)

      const radScale = S(radius0 * S(Math.cos(latAngle)))
      const latitude = S(offset0 + S(radius0 * S(Math.sin(latAngle))))

      ptWriter.writeArc(radScale, ringXY, latitude)
    }

    // Top hemisphere latitude rings:
    for (let axIdx = 0; axIdx < numCapAxial1; ++axIdx) {
      // Latitude range: [latitudeRange, 0.5pi)
      const latAngle = _Lerp(S, axIdx / numCapAxial1, latitudeRange, S(0.5 * Math.PI))

      const radScale = S(radius1 * S(Math.cos(latAngle)))
      const latitude = S(offset1 + S(radius1 * S(Math.sin(latAngle))))

      ptWriter.writeArc(radScale, ringXY, latitude)
    }

    // Top point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, S(offset1 + radius1)))
  }

  /** capsuleMeshGenerator.cpp:230-307 */
  private static _generateNormalsImpl(
    numRadial: number,
    numCapAxial: number,
    bottomRadiusIn: number,
    topRadiusIn: number,
    heightIn: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar
    const bottomRadius = S(bottomRadiusIn)
    const topRadius = S(topRadiusIn)
    const height = S(heightIn)

    if ((numRadial < this.minNumRadial) || (numCapAxial < this.minNumCapAxial)) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // This angle represents the latitude where the bottom spherical cap will
    // transition to the cylindrical portion of the capsule, as well as the
    // angle where the top spherical cap begins after transitioning from the
    // cylindrical portion.
    let latitudeRange = 0.0

    if (bottomRadius !== topRadius && height !== 0) {
      // See comments above in _GeneratePointsImpl for and explanation of the
      // calculations in this section.

      // Calculate the slope of segment AC, using |AB| / |BC|.
      const slope = S(S(bottomRadius - topRadius) / height)

      // Use the slope to determine the angle at A of triangle ADE to
      // calculate the latitude for transitioning between the spherical caps
      // and the cylindrical portion of the capsule.
      latitudeRange = S(Math.atan(slope))
    }

    // Calculate the number of axial points of the sphere caps.
    const numCapAxial0 = this._computeNumBottomCapAxial(S, numCapAxial, latitudeRange)
    const numCapAxial1 = this._computeNumTopCapAxial(numCapAxial, numCapAxial0)

    // Bottom point:
    ptWriter.writeDir(ptWriter.Point(0.0, 0.0, -1.0))

    // Bottom hemisphere latitude rings:
    for (let axIdx = 1; axIdx < (numCapAxial0 + 1); ++axIdx) {
      // Latitude range: (-0.5pi, latitudeRange]
      const latAngle = _Lerp(S, axIdx / numCapAxial0, S(-0.5 * Math.PI), latitudeRange)

      const radScale = S(Math.cos(latAngle))
      const latitude = S(Math.sin(latAngle))

      ptWriter.writeArcDir(radScale, ringXY, latitude)
    }

    // Top hemisphere latitude rings:
    for (let axIdx = 0; axIdx < numCapAxial1; ++axIdx) {
      // Latitude range: [latitudeRange, 0.5pi)
      const latAngle = _Lerp(S, axIdx / numCapAxial1, latitudeRange, S(0.5 * Math.PI))

      const radScale = S(Math.cos(latAngle))
      const latitude = S(Math.sin(latAngle))

      ptWriter.writeArcDir(radScale, ringXY, latitude)
    }

    // Top point:
    ptWriter.writeDir(ptWriter.Point(0.0, 0.0, 1.0))
  }
}

/** GfLerp<ScalarType>(double alpha, a, b) (gf/math.h:301-305): computed in
 *  double, returned as the ScalarType. */
function _Lerp(S: GeomUtil_Scalar, alpha: number, a: number, b: number): number {
  return S((1 - alpha) * a + alpha * b)
}

/** The (radius, height) / (bottomRadius, topRadius, height[, sweepDegrees])
 *  overloads with an optional trailing framePtr. */
function _Args(rest: readonly (number | GfMatrix4d | null | undefined)[]):
  [number, number, number, number, GfMatrix4d | null] {
  const [scalars, framePtr] = GeomUtil_ScalarArgs(rest)
  if (scalars.length === 2) {
    // radius, height
    return [scalars[0]!, scalars[0]!, scalars[1]!, 360, framePtr]
  }
  return [scalars[0]!, scalars[1]!, scalars[2]!, scalars[3] ?? 360, framePtr]
}
