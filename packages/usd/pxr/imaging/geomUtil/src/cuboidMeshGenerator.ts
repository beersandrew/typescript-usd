// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/cuboidMeshGenerator.cpp,
//  pxr/imaging/geomUtil/cuboidMeshGenerator.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/cuboidMeshGenerator.{h,cpp} (OpenUSD 26.11.1).
//
// An optional trailing GfMatrix4d of GeneratePoints/GenerateNormals is the
// framePtr. See meshGeneratorBase.ts for the iterator and ScalarType
// divergences.

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology, OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import { GeomUtil_PointWriter, GeomUtilMeshGeneratorBase, type GeomUtilPointIter } from './meshGeneratorBase.ts'
import { GeomUtilInterpolationTokens } from './tokens.ts'

// cuboidMeshGenerator.cpp:28-35: these never vary, we might as well share a
// single copy.
const _countsArray: readonly number[] = [4, 4, 4, 4, 4, 4]
const _indicesArray: readonly number[] = [
  0, 1, 2, 3,
  4, 5, 6, 7,
  0, 6, 5, 1,
  4, 7, 3, 2,
  0, 3, 7, 6,
  4, 2, 1, 5]

/**
 * cuboidMeshGenerator.h:20-50: generates topology, point positions and
 * surface normals on a rectangular cuboid given its dimensions along the X,
 * Y and Z axes, centered at the origin. An optional transform orients it.
 */
export class GeomUtilCuboidMeshGenerator extends GeomUtilMeshGeneratorBase {
  private constructor() { super() }

  /** cuboidMeshGenerator.cpp:17-22 */
  static computeNumPoints(): number {
    return 8
  }

  /** cuboidMeshGenerator.h:56-61 */
  static computeNumNormals(): number {
    // Normals are per face.
    return 6
  }

  /** cuboidMeshGenerator.h:63-67 */
  static getNormalsInterpolation(): string {
    // Normals are per face.
    return GeomUtilInterpolationTokens.uniform
  }

  /** cuboidMeshGenerator.cpp:24-40 */
  static generateTopology(): PxOsdMeshTopology {
    return new PxOsdMeshTopology(
      PxOsdOpenSubdivTokens.bilinear,
      PxOsdOpenSubdivTokens.rightHanded,
      _countsArray, _indicesArray)
  }

  /** cuboidMeshGenerator.h:72-90 */
  static generatePoints(iter: GeomUtilPointIter, xLength: number, yLength: number,
    zLength: number, framePtr: GfMatrix4d | null = null): void {
    this._generatePointsImpl(xLength, yLength, zLength,
      new GeomUtil_PointWriter(iter, framePtr))
  }

  /** cuboidMeshGenerator.h:94-107 */
  static generateNormals(iter: GeomUtilPointIter, framePtr: GfMatrix4d | null = null): void {
    this._generateNormalsImpl(new GeomUtil_PointWriter(iter, framePtr))
  }

  /** cuboidMeshGenerator.cpp:42-65 */
  private static _generatePointsImpl(
    xLength: number,
    yLength: number,
    zLength: number,
    ptWriter: GeomUtil_PointWriter,
  ): void {
    const S = ptWriter.scalar

    const x = S(0.5 * S(xLength))
    const y = S(0.5 * S(yLength))
    const z = S(0.5 * S(zLength))

    ptWriter.write(ptWriter.Point( x,  y,  z))
    ptWriter.write(ptWriter.Point(-x,  y,  z))
    ptWriter.write(ptWriter.Point(-x, -y,  z))
    ptWriter.write(ptWriter.Point( x, -y,  z))
    ptWriter.write(ptWriter.Point(-x, -y, -z))
    ptWriter.write(ptWriter.Point(-x,  y, -z))
    ptWriter.write(ptWriter.Point( x,  y, -z))
    ptWriter.write(ptWriter.Point( x, -y, -z))
  }

  /** cuboidMeshGenerator.cpp:79-91 */
  private static _generateNormalsImpl(ptWriter: GeomUtil_PointWriter): void {
    ptWriter.writeDir(ptWriter.Point( 0.0,  0.0,  1.0))
    ptWriter.writeDir(ptWriter.Point( 0.0,  0.0, -1.0))
    ptWriter.writeDir(ptWriter.Point( 0.0,  1.0,  0.0))
    ptWriter.writeDir(ptWriter.Point( 0.0, -1.0,  0.0))
    ptWriter.writeDir(ptWriter.Point( 1.0,  0.0,  0.0))
    ptWriter.writeDir(ptWriter.Point(-1.0,  0.0,  0.0))
  }
}
