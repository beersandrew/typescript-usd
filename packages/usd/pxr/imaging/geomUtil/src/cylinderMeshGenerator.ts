// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/cylinderMeshGenerator.cpp,
//  pxr/imaging/geomUtil/cylinderMeshGenerator.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/cylinderMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// The overloads of GeneratePoints/GenerateNormals (cylinderMeshGenerator.h:88-218)
// are one method each, told apart by the number of scalar arguments; an
// optional trailing GfMatrix4d is the framePtr. See meshGeneratorBase.ts for
// the iterator and ScalarType divergences.

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology } from 'typescript-usd/pxOsd'
import {
  GeomUtil_CapStyle, GeomUtil_PointWriter, GeomUtil_ScalarArgs, GeomUtilMeshGeneratorBase,
  type GeomUtilPointIter,
} from './meshGeneratorBase.ts'
import { GeomUtilInterpolationTokens } from './tokens.ts'

/**
 * cylinderMeshGenerator.h:20-58: generates topology and point positions on a
 * cylinder (the bottom and top radii may differ) of a given height, centered
 * at the origin with its spine on the Z axis. An optional transform positions
 * and orients it.
 */
export class GeomUtilCylinderMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  static readonly minNumRadial = 3

  /** cylinderMeshGenerator.cpp:23-39 */
  static computeNumPoints(numRadial: number, closedSweep = true): number {
    if (numRadial < this.minNumRadial) {
      return 0
    }

    return GeomUtilMeshGeneratorBase._computeNumCappedQuadTopologyPoints(
      numRadial,
      /* numQuadStrips =  */ 1,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      closedSweep)
  }

  /** cylinderMeshGenerator.h:69-76 */
  static computeNumNormals(numRadial: number, closedSweep = true): number {
    // Normals are per point.
    return this.computeNumPoints(numRadial, closedSweep)
  }

  /** cylinderMeshGenerator.h:78-82 */
  static getNormalsInterpolation(): string {
    // Normals are per point.
    return GeomUtilInterpolationTokens.vertex
  }

  /** cylinderMeshGenerator.cpp:41-57 */
  static generateTopology(numRadial: number, closedSweep = true): PxOsdMeshTopology {
    if (numRadial < this.minNumRadial) {
      return new PxOsdMeshTopology()
    }

    return GeomUtilMeshGeneratorBase._generateCappedQuadTopology(
      numRadial,
      /* numQuadStrips =  */ 1,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      closedSweep)
  }

  /** cylinderMeshGenerator.h:88-148 */
  static generatePoints(iter: GeomUtilPointIter, numRadial: number,
    radius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number,
    bottomRadius: number, topRadius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number,
    bottomRadius: number, topRadius: number, height: number, sweepDegrees: number,
    framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number,
    ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [bottomRadius, topRadius, height, sweepDegrees, framePtr] = _Args(rest)
    this._generatePointsImpl(numRadial, bottomRadius, topRadius, height, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** cylinderMeshGenerator.h:153-210 */
  static generateNormals(iter: GeomUtilPointIter, numRadial: number,
    radius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number,
    bottomRadius: number, topRadius: number, height: number, framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number,
    bottomRadius: number, topRadius: number, height: number, sweepDegrees: number,
    framePtr?: GfMatrix4d | null): void
  static generateNormals(iter: GeomUtilPointIter, numRadial: number,
    ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [bottomRadius, topRadius, height, sweepDegrees, framePtr] = _Args(rest)
    this._generateNormalsImpl(numRadial, bottomRadius, topRadius, height, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** cylinderMeshGenerator.cpp:59-98 */
  private static _generatePointsImpl(
    numRadial: number,
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
    // cylinder quads (for normals reasons the bottom "edge" is not shared):
    ptWriter.writeArc(bottomRadius, ringXY, zMin)
    ptWriter.writeArc(bottomRadius, ringXY, zMin)

    // And another two rings, for the top edge.
    ptWriter.writeArc(topRadius, ringXY, zMax)
    ptWriter.writeArc(topRadius, ringXY, zMax)

    // Top point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, zMax))
  }

  /** cylinderMeshGenerator.cpp:112-173 */
  private static _generateNormalsImpl(
    numRadial: number,
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

    if (numRadial < this.minNumRadial) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // Determine the radius scalar and latitude for the normals
    // that are perpendicular to the sides of the cylinder.
    let radScale: number, latitude: number
    if (height !== 0) {
      // Calculate the following directly, without using trig functions:
      // radScale = cos(atan(slope)) =   1.0 / sqrt(1.0 + slope^2)
      // latitude = sin(atan(slope)) = slope / sqrt(1.0 + slope^2)
      const slope = S(S(bottomRadius - topRadius) / height)
      // GfSqr returns double (math.h:171-174); GfSqrt(double).
      radScale = S(1.0 / Math.sqrt(1.0 + S(slope * slope)))
      latitude = S(slope * radScale)
    } else {
      // Degenerate cylinder, just use something sensible.
      radScale = 0.0
      latitude = (bottomRadius >= topRadius ? 1.0 : -1.0)
    }

    const baseNormal = ptWriter.Point(0.0, 0.0, -1.0)
    const topNormal = ptWriter.Point(0.0, 0.0, 1.0)

    // Bottom point:
    ptWriter.writeDir(baseNormal)

    // First bottom ring which is part of the base, so use the base normal.
    for (let i = 0; i < ringXY.length; ++i) {
      ptWriter.writeDir(baseNormal)
    }

    // Second bottom ring and first top ring are the normals at the sides
    // of the cylinder and are the same normals.
    ptWriter.writeArcDir(radScale, ringXY, latitude)
    ptWriter.writeArcDir(radScale, ringXY, latitude)

    // Second top ring which is part of the top, so use the top normal.
    for (let i = 0; i < ringXY.length; ++i) {
      ptWriter.writeDir(topNormal)
    }

    // Top point:
    ptWriter.writeDir(topNormal)
  }
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
