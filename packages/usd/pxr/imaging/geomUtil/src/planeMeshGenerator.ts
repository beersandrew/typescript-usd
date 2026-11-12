// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/planeMeshGenerator.cpp,
//  pxr/imaging/geomUtil/planeMeshGenerator.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/planeMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// An optional trailing GfMatrix4d of GeneratePoints/GenerateNormals is the
// framePtr. See meshGeneratorBase.ts for the iterator and ScalarType
// divergences.

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology, OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { GeomUtil_PointWriter, GeomUtilMeshGeneratorBase, type GeomUtilPointIter } from './meshGeneratorBase.ts'
import { GeomUtilInterpolationTokens } from './tokens.ts'

// planeMeshGenerator.cpp:28-30: these never vary, we might as well share a
// single copy.
const _countsArray: readonly number[] = [4]
const _indicesArray: readonly number[] = [0, 1, 2, 3]

/**
 * planeMeshGenerator.h:20-50: generates topology, point positions and
 * surface normals on a rectangular plane given its dimensions along the X
 * and Y axes, centered at the origin. An optional transform orients it.
 */
export class GeomUtilPlaneMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  /** planeMeshGenerator.cpp:17-22 */
  static computeNumPoints(): number {
    return 4
  }

  /** planeMeshGenerator.h:56-61 */
  static computeNumNormals(): number {
    // A single normal for all points.
    return 1
  }

  /** planeMeshGenerator.h:63-67 */
  static getNormalsInterpolation(): string {
    // A single normal for all points.
    return GeomUtilInterpolationTokens.constant
  }

  /** planeMeshGenerator.cpp:24-35 */
  static generateTopology(): PxOsdMeshTopology {
    return new PxOsdMeshTopology(
      PxOsdOpenSubdivTokens.bilinear,
      PxOsdOpenSubdivTokens.rightHanded,
      _countsArray, _indicesArray)
  }

  /** planeMeshGenerator.h:72-89 */
  static generatePoints(iter: GeomUtilPointIter, xLength: number, yLength: number,
    framePtr: GfMatrix4d | null = null): void {
    this._generatePointsImpl(xLength, yLength, new GeomUtil_PointWriter(iter, framePtr))
  }

  /** planeMeshGenerator.h:93-106 */
  static generateNormals(iter: GeomUtilPointIter, framePtr: GfMatrix4d | null = null): void {
    this._generateNormalsImpl(new GeomUtil_PointWriter(iter, framePtr))
  }

  /** planeMeshGenerator.cpp:37-54 */
  private static _generatePointsImpl(
    xLength: number,
    yLength: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar

    const x = S(0.5 * S(xLength))
    const y = S(0.5 * S(yLength))

    ptWriter.write(ptWriter.Point( x,  y,  0))
    ptWriter.write(ptWriter.Point(-x,  y,  0))
    ptWriter.write(ptWriter.Point(-x, -y,  0))
    ptWriter.write(ptWriter.Point( x, -y,  0))
  }

  /** planeMeshGenerator.cpp:68-75 */
  private static _generateNormalsImpl(ptWriter: GeomUtil_PointWriter): void {
    ptWriter.writeDir(ptWriter.Point(0.0, 0.0, 1.0))
  }
}
