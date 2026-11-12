// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/diskMeshGenerator.cpp,
//  pxr/imaging/geomUtil/diskMeshGenerator.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/diskMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// The overloads of GeneratePoints (diskMeshGenerator.h:79-112) are one
// method; an optional trailing GfMatrix4d is the framePtr. See
// meshGeneratorBase.ts for the iterator and ScalarType divergences.

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology } from 'typescript-usd/pxOsd'
import {
  GeomUtil_CapStyle, GeomUtil_PointWriter, GeomUtil_SweepAndFrame, GeomUtilMeshGeneratorBase,
  type GeomUtilPointIter,
} from './meshGeneratorBase.ts'
import { GeomUtilInterpolationTokens } from './tokens.ts'

/**
 * diskMeshGenerator.h:20-52: generates topology, point positions and surface
 * normals on a circular disk of a given radius with numRadial segments,
 * centered at the origin. An optional transform orients it.
 */
export class GeomUtilDiskMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  static readonly minNumRadial = 3

  /** diskMeshGenerator.cpp:23-39 */
  static computeNumPoints(numRadial: number, closedSweep = true): number {
    if (numRadial < this.minNumRadial) {
      return 0
    }

    return GeomUtilMeshGeneratorBase._computeNumCappedQuadTopologyPoints(
      numRadial,
      /* numQuadStrips =  */ 0,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleNone,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      closedSweep)
  }

  /** diskMeshGenerator.h:61-66 */
  static computeNumNormals(): number {
    // A single normal for all points.
    return 1
  }

  /** diskMeshGenerator.h:68-72 */
  static getNormalsInterpolation(): string {
    // A single normal for all points.
    return GeomUtilInterpolationTokens.constant
  }

  /** diskMeshGenerator.cpp:41-57 */
  static generateTopology(numRadial: number, closedSweep = true): PxOsdMeshTopology {
    if (numRadial < this.minNumRadial) {
      return new PxOsdMeshTopology()
    }

    return GeomUtilMeshGeneratorBase._generateCappedQuadTopology(
      numRadial,
      /* numQuadStrips =  */ 0,
      /* bottomCapStyle = */ GeomUtil_CapStyle.CapStyleNone,
      /* topCapStyle =    */ GeomUtil_CapStyle.CapStyleSeparateEdge,
      closedSweep)
  }

  /** diskMeshGenerator.h:79-112:
   *  GeneratePoints(iter, numRadial, radius[, sweepDegrees][, framePtr]) */
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, radius: number,
    framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, radius: number,
    sweepDegrees: number, framePtr?: GfMatrix4d | null): void
  static generatePoints(iter: GeomUtilPointIter, numRadial: number, radius: number,
    ...rest: (number | GfMatrix4d | null | undefined)[]): void {
    const [sweepDegrees, framePtr] = GeomUtil_SweepAndFrame(rest)
    this._generatePointsImpl(numRadial, radius, sweepDegrees,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** diskMeshGenerator.h:116-129 */
  static generateNormals(iter: GeomUtilPointIter, framePtr: GfMatrix4d | null = null): void {
    this._generateNormalsImpl(new GeomUtil_PointWriter(iter, framePtr))
  }

  /** diskMeshGenerator.cpp:59-83 */
  private static _generatePointsImpl(
    numRadial: number,
    radiusIn: number,
    sweepDegrees: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar
    const radius = S(radiusIn)

    if (numRadial < this.minNumRadial) {
      return
    }

    // Construct a circular arc of unit radius in the XY plane.
    const ringXY = GeomUtilMeshGeneratorBase._generateUnitArcXY(S, numRadial, S(sweepDegrees))

    // A ring for the outer edge.
    ptWriter.writeArc(radius, ringXY, 0.0)

    // Center point:
    ptWriter.write(ptWriter.Point(0.0, 0.0, 0.0))
  }

  /** diskMeshGenerator.cpp:97-104 */
  private static _generateNormalsImpl(ptWriter: GeomUtil_PointWriter): void {
    ptWriter.writeDir(ptWriter.Point(0.0, 0.0, 1.0))
  }
}
