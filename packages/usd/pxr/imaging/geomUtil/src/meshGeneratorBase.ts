// Ported from OpenUSD 26.11.1: pxr/imaging/geomUtil/meshGeneratorBase.cpp,
//  pxr/imaging/geomUtil/meshGeneratorBase.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/geomUtil/meshGeneratorBase.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - The C++ output iterator (any iterator dereferencing to GfVec3f or
//   GfVec3d, chosen at compile time by SFINAE) is GeomUtilPointIter: an output
//   array, a start index and the point type. Like the C++ iterator, which the
//   public GeneratePoints/GenerateNormals take by value, the caller's
//   GeomUtilPointIter is not advanced.
// - The ScalarType template parameter (float for GfVec3f, double for GfVec3d)
//   is a rounding function: Math.fround for GfVec3f, identity for GfVec3d.
//   Generators apply it wherever the C++ code stores into a ScalarType or
//   performs float arithmetic, so the generated values match the float
//   instantiation bit for bit. Calls to cos/sin/atan with a float argument
//   (the float overloads, cosf etc.) are evaluated in double and rounded.
// - The "fallback" GeneratePoints/GenerateNormals templates
//   (meshGeneratorBase.h:301-334) only produce a compile-time assertion for
//   unsupported iterator types; TypeScript's types play that part.

import { DegreesToRadians as GfDegreesToRadians, GfAbs, GfClamp, Vec3d as GfVec3d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { MeshTopology as PxOsdMeshTopology, OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'

/** A point type a generator writes: GfVec3f or GfVec3d. */
export type GeomUtilPoint = GfVec3f | GfVec3d
/** The constructor of a point type (the iterator's value_type). */
export type GeomUtilPointType<P extends GeomUtilPoint = GeomUtilPoint> =
  new (x: number, y: number, z: number) => P

/** The output iterator a generator's GeneratePoints/GenerateNormals write
 *  through (the C++ PointIterType): consecutive elements of `array` starting
 *  at `index`, each a `pointType`. */
export class GeomUtilPointIter<P extends GeomUtilPoint = GeomUtilPoint> {
  constructor(
    readonly pointType: GeomUtilPointType<P>,
    readonly array: P[],
    readonly index: number = 0,
  ) {}

  /** The begin() iterator of a VtVec3fArray-like array. */
  static Vec3f(array: GfVec3f[], index = 0): GeomUtilPointIter<GfVec3f> {
    return new GeomUtilPointIter(GfVec3f, array, index)
  }

  /** The begin() iterator of a VtVec3dArray-like array. */
  static Vec3d(array: GfVec3d[], index = 0): GeomUtilPointIter<GfVec3d> {
    return new GeomUtilPointIter(GfVec3d, array, index)
  }
}

/** The ScalarType of a point type: rounds a double to it. */
export type GeomUtil_Scalar = (value: number) => number

const _identity: GeomUtil_Scalar = (value) => value

/** PointType::ScalarType as a rounding function (see the header comment). */
export function GeomUtil_ScalarOf(pointType: GeomUtilPointType): GeomUtil_Scalar {
  return (pointType as unknown) === GfVec3f ? Math.fround : _identity
}

/** One [x, y] entry of a unit arc (std::array<ScalarType, 2>). */
export type GeomUtil_ArcXY = readonly [number, number]

/**
 * meshGeneratorBase.h:103-202 _PointWriter<PointType>: writes points (and
 * directions) through the type-erased iterator, applying an optional frame
 * transform. A fresh writer starts at the iterator's position and advances
 * its own cursor.
 */
export class GeomUtil_PointWriter {
  readonly PointType: GeomUtilPointType
  readonly scalar: GeomUtil_Scalar
  private readonly _array: GeomUtilPoint[]
  private _index: number
  private readonly _framePtr: GfMatrix4d | null

  /** meshGeneratorBase.h:105-125 */
  constructor(iter: GeomUtilPointIter, framePtr: GfMatrix4d | null = null) {
    this.PointType = iter.pointType
    this.scalar = GeomUtil_ScalarOf(iter.pointType)
    this._array = iter.array as GeomUtilPoint[]
    this._index = iter.index
    this._framePtr = framePtr
  }

  /** PointType(x, y, z). */
  Point(x: number, y: number, z: number): GeomUtilPoint {
    return new this.PointType(x, y, z)
  }

  /** meshGeneratorBase.h:127-131 */
  write(pt: GeomUtilPoint): void {
    if (this._framePtr) {
      this._transformAndWritePoint(pt)
    } else {
      this._writePoint(pt)
    }
  }

  /** meshGeneratorBase.h:133-142 */
  writeArc(scaleXY: number, arcXY: readonly GeomUtil_ArcXY[], arcZ: number): void {
    const S = this.scalar
    for (const xy of arcXY) {
      this.write(this.Point(S(scaleXY * xy[0]), S(scaleXY * xy[1]), arcZ))
    }
  }

  /** meshGeneratorBase.h:144-148 */
  writeDir(dir: GeomUtilPoint): void {
    if (this._framePtr) {
      this._transformAndWriteDir(dir)
    } else {
      this._writeDir(dir)
    }
  }

  /** meshGeneratorBase.h:150-159 */
  writeArcDir(scaleXY: number, arcXY: readonly GeomUtil_ArcXY[], arcZ: number): void {
    const S = this.scalar
    for (const xy of arcXY) {
      this.writeDir(this.Point(S(scaleXY * xy[0]), S(scaleXY * xy[1]), arcZ))
    }
  }

  /** meshGeneratorBase.h:162-169 */
  private _writePoint(pt: GeomUtilPoint): void {
    this._array[this._index++] = pt
  }

  /** meshGeneratorBase.h:171-179: the GfVec3d transform, cast to the
   *  iterator's point type. */
  private _transformAndWritePoint(pt: GeomUtilPoint): void {
    const out = this._framePtr!.Transform(new GfVec3d(pt.data[0]!, pt.data[1]!, pt.data[2]!))
    this._array[this._index++] = this.Point(out.data[0]!, out.data[1]!, out.data[2]!)
  }

  /** meshGeneratorBase.h:181-188 */
  private _writeDir(pt: GeomUtilPoint): void {
    this._array[this._index++] = pt
  }

  /** meshGeneratorBase.h:190-198 */
  private _transformAndWriteDir(dir: GeomUtilPoint): void {
    const out = this._framePtr!.transformDir(new GfVec3d(dir.data[0]!, dir.data[1]!, dir.data[2]!))
    this._array[this._index++] = this.Point(out.data[0]!, out.data[1]!, out.data[2]!)
  }
}

/** Splits the trailing arguments of a generator's GeneratePoints /
 *  GenerateNormals overload set into its scalar arguments and the optional
 *  framePtr (the last argument when it is not a number). */
export function GeomUtil_ScalarArgs(
  rest: readonly (number | GfMatrix4d | null | undefined)[],
): [scalars: number[], framePtr: GfMatrix4d | null] {
  const scalars: number[] = []
  let framePtr: GfMatrix4d | null = null
  for (const arg of rest) {
    if (typeof arg === 'number') scalars.push(arg)
    else if (arg) framePtr = arg
  }
  return [scalars, framePtr]
}

/** The `[sweepDegrees][, framePtr]` tail of an overload set; the sweep
 *  defaults to 360 (the overloads' `constexpr ScalarType sweep = 360`). */
export function GeomUtil_SweepAndFrame(
  rest: readonly (number | GfMatrix4d | null | undefined)[],
): [sweepDegrees: number, framePtr: GfMatrix4d | null] {
  const [scalars, framePtr] = GeomUtil_ScalarArgs(rest)
  return [scalars[0] ?? 360, framePtr]
}

/** meshGeneratorBase.h:230-234 */
export enum GeomUtil_CapStyle {
  CapStyleNone,
  CapStyleSharedEdge,
  CapStyleSeparateEdge,
}

/**
 * meshGeneratorBase.h:52-337: common implementation of the GeomUtil mesh
 * generators. Like the C++ class it is a grouping of static helpers, never
 * instantiated.
 */
export abstract class GeomUtilMeshGeneratorBase {
  protected constructor() {}

  /** meshGeneratorBase.cpp:18-92 */
  protected static _generateCappedQuadTopology(
    numRadial: number,
    numQuadStrips: number,
    bottomCapStyle: GeomUtil_CapStyle,
    topCapStyle: GeomUtil_CapStyle,
    closedSweep: boolean,
  ): PxOsdMeshTopology {
    const numTriStrips =
      Number(bottomCapStyle !== GeomUtil_CapStyle.CapStyleNone) +
      Number(topCapStyle !== GeomUtil_CapStyle.CapStyleNone)
    const numTris = numTriStrips * numRadial
    const numQuads = numQuadStrips * numRadial

    const countsArray = new Array<number>(numQuads + numTris)
    const indicesArray = new Array<number>((4 * numQuads) + (3 * numTris))

    // NOTE: When the surface is closed (sweep of 360 degrees), we ensure that
    //       the start and end points of each circular ring point are the same
    //       topologically.  This in turn means that the number of points on a
    //       (closed) ring is one less than an (open) arc.
    const numRadialPts = GeomUtilMeshGeneratorBase._computeNumRadialPoints(numRadial, closedSweep)
    let ptIdx = 0
    let countsIt = 0
    let indicesIt = 0

    // Bottom triangle fan, if requested:
    if (bottomCapStyle !== GeomUtil_CapStyle.CapStyleNone) {
      const bottomPtIdx = ptIdx++
      for (let radIdx = 0; radIdx < numRadial; ++radIdx) {
        countsArray[countsIt++] = 3
        indicesArray[indicesIt++] = ptIdx + ((radIdx + 1) % numRadialPts)
        indicesArray[indicesIt++] = ptIdx + radIdx
        indicesArray[indicesIt++] = bottomPtIdx
      }
      // Adjust the point index cursor if the edge isn't to be shared with the
      // following quad strip.
      if (bottomCapStyle === GeomUtil_CapStyle.CapStyleSeparateEdge) {
        ptIdx += numRadialPts
      }
    }

    // Middle quads:
    for (let stripIdx = 0; stripIdx < numQuadStrips; ++stripIdx) {
      for (let radIdx = 0; radIdx < numRadial; ++radIdx) {
        countsArray[countsIt++] = 4
        indicesArray[indicesIt++] = ptIdx + radIdx
        indicesArray[indicesIt++] = ptIdx + ((radIdx + 1) % numRadialPts)
        indicesArray[indicesIt++] = ptIdx + ((radIdx + 1) % numRadialPts) + numRadialPts
        indicesArray[indicesIt++] = ptIdx + radIdx + numRadialPts
      }
      ptIdx += numRadialPts
    }

    // Top triangle fan, if requested:
    if (topCapStyle !== GeomUtil_CapStyle.CapStyleNone) {
      // Adjust the point index cursor if the edge isn't to be shared with the
      // preceeding quad strip.
      if (numQuadStrips > 0 && topCapStyle === GeomUtil_CapStyle.CapStyleSeparateEdge) {
        ptIdx += numRadialPts
      }
      const topPtIdx = ptIdx + numRadialPts
      for (let radIdx = 0; radIdx < numRadial; ++radIdx) {
        countsArray[countsIt++] = 3
        indicesArray[indicesIt++] = ptIdx + radIdx
        indicesArray[indicesIt++] = ptIdx + ((radIdx + 1) % numRadialPts)
        indicesArray[indicesIt++] = topPtIdx
      }
    }

    return new PxOsdMeshTopology(
      PxOsdOpenSubdivTokens.catmullClark,
      PxOsdOpenSubdivTokens.rightHanded,
      countsArray, indicesArray)
  }

  /** meshGeneratorBase.cpp:94-103 */
  protected static _computeNumRadialPoints(numRadial: number, closedSweep: boolean): number {
    // For a ring, the first and last points are the same. For topological
    // correctness, do not regenerate the same point.
    return closedSweep ? numRadial : numRadial + 1
  }

  /** meshGeneratorBase.cpp:105-137 */
  protected static _computeNumCappedQuadTopologyPoints(
    numRadial: number,
    numQuadStrips: number,
    bottomCapStyle: GeomUtil_CapStyle,
    topCapStyle: GeomUtil_CapStyle,
    closedSweep: boolean,
  ): number {
    const numRadialPts = GeomUtilMeshGeneratorBase._computeNumRadialPoints(numRadial, closedSweep)

    let result = numRadialPts * (numQuadStrips + 1)

    if (bottomCapStyle !== GeomUtil_CapStyle.CapStyleNone) {
      // Add pole point.
      ++result
      if (bottomCapStyle === GeomUtil_CapStyle.CapStyleSeparateEdge) {
        // Add an extra set of radial points.
        result += numRadialPts
      }
    }

    if (topCapStyle !== GeomUtil_CapStyle.CapStyleNone) {
      // Add pole point.
      ++result
      if (numQuadStrips > 0 && topCapStyle === GeomUtil_CapStyle.CapStyleSeparateEdge) {
        // Add an extra set of radial points.
        result += numRadialPts
      }
    }

    return result
  }

  /** meshGeneratorBase.h:273-295: a unit circular arc in the XY plane, in
   *  the precision of `S` (the ScalarType). */
  protected static _generateUnitArcXY(
    S: GeomUtil_Scalar,
    numRadial: number,
    sweepDegrees: number,
  ): GeomUtil_ArcXY[] {
    const twoPi = S(2.0 * Math.PI)
    const sweepRadians = S(GfDegreesToRadians(sweepDegrees))
    // GfClamp(float, float, float) / GfClamp(double, double, double).
    const sweep = S(GfClamp(sweepRadians, -twoPi, twoPi))
    // GfIsClose(double, double, double) of GfAbs(ScalarType).
    const closedSweep = Math.abs(S(GfAbs(sweep)) - twoPi) < 1e-6
    const numPts = GeomUtilMeshGeneratorBase._computeNumRadialPoints(numRadial, closedSweep)

    // Construct a circular arc of unit radius in the XY plane.
    const result: GeomUtil_ArcXY[] = []
    for (let radIdx = 0; radIdx < numPts; ++radIdx) {
      // Longitude range: [0, sweep]
      const longAngle = S(S(S(radIdx) / S(numRadial)) * sweep)
      result.push([S(Math.cos(longAngle)), S(Math.sin(longAngle))])
    }
    return result
  }
}
