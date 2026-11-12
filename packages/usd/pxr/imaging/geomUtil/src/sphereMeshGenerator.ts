// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/sphereMeshGenerator.cpp,
//  pxr/imaging/geomUtil/sphereMeshGenerator.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/sphereMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// The overloads of GeneratePoints/GenerateNormals (sphereMeshGenerator.h:96-170)
// are one method each; an optional trailing GfMatrix4d is the framePtr. See
// meshGeneratorBase.ts for the iterator and ScalarType divergences.

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology } from 'typescript-usd/pxOsd'
import {
  GeomUtil_CapStyle, GeomUtil_PointWriter, GeomUtil_SweepAndFrame, GeomUtilMeshGeneratorBase,
  type GeomUtilPointIter,
} from './meshGeneratorBase.ts'
import { GeomUtilInterpolationTokens } from './tokens.ts'

/**
 * sphereMeshGenerator.h:20-56: generates topology and point positions on a
 * sphere with a given radius, as a latitude/longitude grid closed by
 * triangle fans at the poles, centered at the origin with the poles on the
 * Z axis. An optional transform positions and orients it.
 */
export class GeomUtilSphereMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  static readonly minNumRadial = 3
  static readonly minNumAxial = 2

  /** sphereMeshGenerator.cpp:23-40 */
  static computeNumPoints(numRadial: number, numAxial: number, closedSweep = true): number {
    if ((numRadial < this.minNumRadial) || (numAxial < this.minNumAxial)) {
      return 0
    }

    return GeomUtilMeshGeneratorBase._computeNumCappedQuadTopologyPoints(
      numRadial,
      /* numQuadStrips =  */ numAxial - 2,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSharedEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSharedEdge,
      closedSweep)
  }

  /** sphereMeshGenerator.h:70-77 */
  static computeNumNormals(numRadial: number, numAxial: number, closedSweep = true): number {
    // Normals are per point.
    return this.computeNumPoints(numRadial, numAxial, closedSweep)
  }

  /** sphereMeshGenerator.h:79-83 */
  static getNormalsInterpolation(): string {
    // Normals are per point.
    return GeomUtilInterpolationTokens.vertex
  }

  /** sphereMeshGenerator.cpp:42-59 */
  static generateTopology(numRadial: number, numAxial: number, closedSweep = true): PxOsdMeshTopology {
    if ((numRadial < this.minNumRadial) || (numAxial < this.minNumAxial)) {
      return new PxOsdMeshTopology()
    }

    return GeomUtilMeshGeneratorBase._generateCappedQuadTopology(
      numRadial,
      /* numQuadStrips =  */ numAxial - 2,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSharedEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSharedEdge,
      closedSweep)
  }

  /** sphereMeshGenerator.h:96-129:
   *  GeneratePoints(iter, numRadial, numAxial, radius[, sweepDegrees][, framePtr]) */
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numAxial: number,
    radius: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numAxial: number,
    radius: number, sweepDegrees: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, numAxial: number,
    radius: number, ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [sweepDegrees, framePtr] = GeomUtil_SweepAndFrame(rest)
    this._generatePointsImpl(numRadial, numAxial, radius, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** sphereMeshGenerator.h:133-166:
   *  GenerateNormals(iter, numRadial, numAxial[, sweepDegrees][, framePtr]) */
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numAxial: number,
    framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numAxial: number,
    sweepDegrees: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, numAxial: number,
    ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [sweepDegrees, framePtr] = GeomUtil_SweepAndFrame(rest)
    this._generateNormalsImpl(numRadial, numAxial, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** sphereMeshGenerator.cpp:61-98 */
  private static _generatePointsImpl(
    numRadial: number,
    numAxial: number,
    radiusIn: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar
    const radius = S(radiusIn)

    if ((numRadial < this.minNumRadial) || (numAxial < this.minNumAxial)) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // Bottom point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, -radius))

    // Latitude rings:
    for (let axIdx = 1; axIdx < numAxial; ++axIdx) {
      // Latitude range: (-0.5pi, 0.5pi)
      const latAngle = S((S(S(axIdx) / S(numAxial)) - 0.5) * Math.PI)

      const radScale = S(radius * S(Math.cos(latAngle)))
      const latitude = S(radius * S(Math.sin(latAngle)))

      ptWriter.writeArc(radScale, ringXY, latitude)
    }

    // Top point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, radius))
  }

  /** sphereMeshGenerator.cpp:112-151 */
  private static _generateNormalsImpl(
    numRadial: number,
    numAxial: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    // The normals are the same as the points when the radius is 1,
    // just need to write out the points using WriteDir.

    const S = ptWriter.scalar

    if ((numRadial < this.minNumRadial) || (numAxial < this.minNumAxial)) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // Bottom point:
    ptWriter.writeDir(ptWriter.Point(0.0, 0.0, -1))

    // Latitude rings:
    for (let axIdx = 1; axIdx < numAxial; ++axIdx) {
      // Latitude range: (-0.5pi, 0.5pi)
      const latAngle = S((S(S(axIdx) / S(numAxial)) - 0.5) * Math.PI)

      const radScale = S(Math.cos(latAngle))
      const latitude = S(Math.sin(latAngle))

      ptWriter.writeArcDir(radScale, ringXY, latitude)
    }

    // Top point:
    ptWriter.writeDir(ptWriter.Point(0.0, 0.0, 1))
  }
}
