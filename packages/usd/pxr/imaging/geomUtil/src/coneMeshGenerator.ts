// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/coneMeshGenerator.cpp,
//  pxr/imaging/geomUtil/coneMeshGenerator.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/coneMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// The overloads of GeneratePoints/GenerateNormals (coneMeshGenerator.h:88-160)
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
 * coneMeshGenerator.h:20-58: generates topology and point positions on a
 * cone of a given radius and height, its base centered at -0.5 * height and
 * its apex at +0.5 * height on the Z axis. An optional transform positions
 * and orients it.
 */
export class GeomUtilConeMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  static readonly minNumRadial = 3

  /** coneMeshGenerator.cpp:23-39 */
  static computeNumPoints(numRadial: number, closedSweep = true): number {
    if (numRadial < this.minNumRadial) {
      return 0
    }

    return GeomUtilMeshGeneratorBase._computeNumCappedQuadTopologyPoints(
      numRadial,
      /* numQuadStrips =  */ 1,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleNone,
      closedSweep)
  }

  /** coneMeshGenerator.h:69-76 */
  static computeNumNormals(numRadial: number, closedSweep = true): number {
    // Normals are per point.
    return this.computeNumPoints(numRadial, closedSweep)
  }

  /** coneMeshGenerator.h:78-82 */
  static getNormalsInterpolation(): string {
    // Normals are per point.
    return GeomUtilInterpolationTokens.vertex
  }

  /** coneMeshGenerator.cpp:41-57 */
  static generateTopology(numRadial: number, closedSweep = true): PxOsdMeshTopology {
    if (numRadial < this.minNumRadial) {
      return new PxOsdMeshTopology()
    }

    return GeomUtilMeshGeneratorBase._generateCappedQuadTopology(
      numRadial,
      /* numQuadStrips =  */ 1,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleNone,
      closedSweep)
  }

  /** coneMeshGenerator.h:88-123:
   *  GeneratePoints(iter, numRadial, radius, height[, sweepDegrees][, framePtr]) */
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, radius: number,
    height: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, radius: number,
    height: number, sweepDegrees: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, radius: number,
    height: number, ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [sweepDegrees, framePtr] = GeomUtil_SweepAndFrame(rest)
    this._generatePointsImpl(numRadial, radius, height, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** coneMeshGenerator.h:125-160:
   *  GenerateNormals(iter, numRadial, radius, height[, sweepDegrees][, framePtr]) */
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, radius: number,
    height: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, radius: number,
    height: number, sweepDegrees: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number, radius: number,
    height: number, ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [sweepDegrees, framePtr] = GeomUtil_SweepAndFrame(rest)
    this._generateNormalsImpl(numRadial, radius, height, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** coneMeshGenerator.cpp:59-99 */
  private static _generatePointsImpl(
    numRadial: number,
    radiusIn: number,
    heightIn: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar
    const radius = S(radiusIn)
    const height = S(heightIn)

    if (numRadial < this.minNumRadial) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    const zMax = S(0.5 * height)
    const zMin = -zMax

    // Bottom point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, zMin))

    // Bottom rings; two consecutive rings at the same point locations, the
    // first for the bottom triangle fan and the second for the main
    // cone quads (for normals reasons the bottom "edge" is not shared):
    ptWriter.writeArc(radius, ringXY, zMin)
    ptWriter.writeArc(radius, ringXY, zMin)

    // Top "ring" (all points coincident); the cone consists of degenerate
    // quads, so edges between left/right faces generate smooth normals but
    // there's no continuity over the top "point" as would happen with a
    // triangle fan.
    const topPoint = ptWriter.Point(0.0, 0.0, zMax)
    for (let radIdx = 0; radIdx < ringXY.length; ++radIdx) {
      ptWriter.write(topPoint)
    }
  }

  /** coneMeshGenerator.cpp:113-164 */
  private static _generateNormalsImpl(
    numRadial: number,
    radiusIn: number,
    heightIn: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar
    const radius = S(radiusIn)
    const height = S(heightIn)

    if (numRadial < this.minNumRadial) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // Determine the radius scalar and latitude for the normals
    // that are perpendicular to the sides of the cone.
    let radScale: number, latitude: number
    if (height !== 0) {
      // Calculate the following directly, without using trig functions:
      // radScale = cos(atan(slope)) =   1.0 / sqrt(1.0 + slope^2)
      // latitude = sin(atan(slope)) = slope / sqrt(1.0 + slope^2)
      const slope = S(radius / height)
      // GfSqr returns double (math.h:171-174); GfSqrt(double).
      radScale = S(1.0 / Math.sqrt(1.0 + S(slope * slope)))
      latitude = S(slope * radScale)
    } else {
      // Degenerate cone, just use something sensible.
      radScale = 0.0
      latitude = 1.0
    }

    const baseNormal = ptWriter.Point(0.0, 0.0, -1.0)

    // Bottom point:
    ptWriter.writeDir(baseNormal)

    // First bottom ring which is part of the base, so use the base normal.
    for (let i = 0; i < ringXY.length; ++i) {
      ptWriter.writeDir(baseNormal)
    }

    // Second bottom ring and top "ring" are the normals at the sides
    // of the cone and are the same normals.
    ptWriter.writeArcDir(radScale, ringXY, latitude)
    ptWriter.writeArcDir(radScale, ringXY, latitude)
  }
}
