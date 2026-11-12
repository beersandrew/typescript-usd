// Ported from OpenUSD 26.11.1: pxr/imaging/hd/meshTopology.cpp,
//  pxr/imaging/hd/meshTopology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/meshTopology.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - The C++ constructor overloads are one overloaded constructor. The first
//   argument selects the form: an HdMeshTopology (copy with refine level), a
//   PxOsdMeshTopology, an HdMeshSchema, or the scheme token. With a scheme,
//   the fifth argument is either the hole indices array or the refine level.
//   The (scheme, orientation, counts, indices, holeIndices) form keeps every
//   existing caller of this class working.
// - VtIntArray is a plain number array; ID is a bigint (see topology.ts).
// - HdGeomSubset ids/material ids are path strings; ComputeHash hashes their
//   text (meshTopology.cpp:218-228 hashes the SdfPath object bytes, which is
//   not reproducible). The hash is only an instancing key.
// - HD_PERF_COUNTER_INCR/DECR(meshTopology) (meshTopology.cpp:26, 151) are not
//   counted: JS has no destructor to pair the decrement with.
// - operator== is Equals(); operator= is Assign().

import { TfGetEnvSetting, TfEnvSetting, type Token as TfToken } from 'typescript-usd/tf'
import {
  MeshTopology as PxOsdMeshTopology,
  OpenSubdivTokens as PxOsdOpenSubdivTokens,
  type SubdivTags as PxOsdSubdivTags,
} from 'typescript-usd/pxOsd'
import { ArchHash64 } from 'typescript-usd/arch'
import type { HdGeomSubset } from './geomSubset.ts'
import { HdTopology } from './topology.ts'
import type { HdMeshSchema } from './meshSchema.ts'

// meshTopology.cpp:20-21
const HD_ENABLE_OPENSUBDIV3_ADAPTIVE = new TfEnvSetting<number>(
  'HD_ENABLE_OPENSUBDIV3_ADAPTIVE', 0, 'Enables OpenSubdiv 3 Adaptive Tessellation')

const _encoder = new TextEncoder()

function _HashInts(values: readonly number[], seed: bigint): bigint {
  const bytes = new Uint8Array(Int32Array.from(values).buffer)
  return ArchHash64(bytes, bytes.length, seed)
}

function _HashString(value: string, seed: bigint): bigint {
  const bytes = _encoder.encode(value)
  return ArchHash64(bytes, bytes.length, seed)
}

function _ArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false
  return true
}

/** hd/geomSubset.cpp operator== : type, id, materialId and indices. */
export function HdGeomSubsetEquals(lhs: HdGeomSubset, rhs: HdGeomSubset): boolean {
  return lhs.type === rhs.type && lhs.id === rhs.id
    && lhs.materialId === rhs.materialId && _ArraysEqual(lhs.indices, rhs.indices)
}

function _IsMeshSchema(value: unknown): value is HdMeshSchema {
  return typeof value === 'object' && value !== null
    && typeof (value as { GetTopology?: unknown }).GetTopology === 'function'
}

/** meshTopology.h:34-213 */
export class HdMeshTopology extends HdTopology {
  protected _topology: PxOsdMeshTopology
  protected _geomSubsets: HdGeomSubset[] = []
  protected _invisiblePoints: number[] = []
  protected _invisibleFaces: number[] = []
  protected _refineLevel = 0
  protected _numPoints = 0

  /** meshTopology.cpp:23-31 */
  constructor()
  /** meshTopology.cpp:33-45 */
  constructor(src: HdMeshTopology, refineLevel?: number)
  /** meshTopology.cpp:47-59 */
  constructor(topo: PxOsdMeshTopology, refineLevel?: number)
  /** meshTopology.cpp:142-149 */
  constructor(schema: HdMeshSchema)
  /** meshTopology.cpp:61-80 */
  constructor(scheme: string, orientation: string,
    faceVertexCounts: readonly number[], faceVertexIndices: readonly number[],
    refineLevel?: number)
  /** meshTopology.cpp:82-102 */
  constructor(scheme: string, orientation: string,
    faceVertexCounts: readonly number[], faceVertexIndices: readonly number[],
    holeIndices: readonly number[], refineLevel?: number)
  constructor(
    first?: string | HdMeshTopology | PxOsdMeshTopology | HdMeshSchema,
    second?: string | number,
    faceVertexCounts?: readonly number[],
    faceVertexIndices?: readonly number[],
    holeIndicesOrRefineLevel?: readonly number[] | number,
    refineLevel?: number,
  ) {
    super()
    if (first === undefined) {
      this._topology = new PxOsdMeshTopology()
      return
    }
    if (first instanceof HdMeshTopology) {
      this._topology = first.getPxOsdMeshTopology()
      this._geomSubsets = first._geomSubsets
      this._invisiblePoints = first._invisiblePoints
      this._invisibleFaces = first._invisibleFaces
      this._refineLevel = typeof second === 'number' ? second : 0
      this._numPoints = first._numPoints
      return
    }
    if (first instanceof PxOsdMeshTopology) {
      this._topology = first
      this._refineLevel = typeof second === 'number' ? second : 0
      this._numPoints = HdMeshTopology.computeNumPoints(this._topology.getFaceVertexIndices())
      return
    }
    if (_IsMeshSchema(first)) {
      // meshTopology.cpp:116-138: the scheme from the mesh schema, the rest
      // from its topology schema, with the upstream fallbacks.
      const topologySchema = first.GetTopology()
      this._topology = new PxOsdMeshTopology(
        (first.getSubdivisionScheme()?.getTypedValue(0) as string | undefined) ?? PxOsdOpenSubdivTokens.none,
        (topologySchema.getOrientation()?.getTypedValue(0) as string | undefined) ?? PxOsdOpenSubdivTokens.rightHanded,
        (topologySchema.getFaceVertexCounts()?.getTypedValue(0) as number[] | undefined) ?? [],
        (topologySchema.getFaceVertexIndices()?.getTypedValue(0) as number[] | undefined) ?? [],
        (topologySchema.getHoleIndices()?.getTypedValue(0) as number[] | undefined) ?? [])
      this._numPoints = HdMeshTopology.computeNumPoints(this._topology.getFaceVertexIndices())
      return
    }
    const scheme = first as string
    const orientation = typeof second === 'string' ? second : PxOsdOpenSubdivTokens.rightHanded
    if (Array.isArray(holeIndicesOrRefineLevel)) {
      this._topology = new PxOsdMeshTopology(scheme, orientation,
        faceVertexCounts ?? [], faceVertexIndices ?? [], holeIndicesOrRefineLevel)
      this._refineLevel = refineLevel ?? 0
    } else {
      this._topology = new PxOsdMeshTopology(scheme, orientation,
        faceVertexCounts ?? [], faceVertexIndices ?? [])
      this._refineLevel = typeof holeIndicesOrRefineLevel === 'number' ? holeIndicesOrRefineLevel : 0
    }
    this._numPoints = HdMeshTopology.computeNumPoints(this._topology.getFaceVertexIndices())
  }

  /** meshTopology.cpp:154-168 operator= */
  assign(copy: HdMeshTopology): this {
    this._topology = copy.getPxOsdMeshTopology()
    this._geomSubsets = copy._geomSubsets
    this._refineLevel = copy._refineLevel
    this._numPoints = copy._numPoints
    this._invisiblePoints = copy._invisiblePoints
    this._invisibleFaces = copy._invisibleFaces
    return this
  }

  /** meshTopology.cpp:170-174 */
  static isEnabledAdaptive(): boolean {
    return TfGetEnvSetting(HD_ENABLE_OPENSUBDIV3_ADAPTIVE) === 1
  }

  getPxOsdMeshTopology(): PxOsdMeshTopology { return this._topology }

  /** meshTopology.cpp:188-192 */
  getNumFaces(): number { return this._topology.getFaceVertexCounts().length }

  /** meshTopology.cpp:194-198 */
  getNumFaceVaryings(): number { return this._topology.getFaceVertexIndices().length }

  /** meshTopology.cpp:200-204 */
  getNumPoints(): number { return this._numPoints }

  /** meshTopology.cpp:206-221: max vertex index + 1. */
  static computeNumPoints(verts: ArrayLike<number>): number {
    let numPoints = -1
    for (let i = 0; i < verts.length; ++i) {
      numPoints = Math.max(numPoints, verts[i]!)
    }
    return numPoints + 1
  }

  getScheme(): TfToken { return this._topology.getScheme() }
  getRefineLevel(): number { return this._refineLevel }
  getFaceVertexCounts(): number[] { return this._topology.getFaceVertexCounts() }
  getFaceVertexIndices(): number[] { return this._topology.getFaceVertexIndices() }
  getOrientation(): TfToken { return this._topology.getOrientation() }

  /** meshTopology.cpp:223-245 */
  override computeHash(): bigint {
    let hash = this._topology.computeHash()
    hash = _HashInts([this._refineLevel], hash)
    for (const subset of this._geomSubsets) {
      hash = _HashInts([subset.type], hash)
      hash = _HashString(subset.id, hash)
      hash = _HashString(subset.materialId, hash)
      hash = _HashInts(subset.indices, hash)
    }
    // Topological visibility and _numPoints are not hashed
    // (meshTopology.cpp:239-243).
    return hash
  }

  /** meshTopology.cpp:176-186 operator== */
  Equals(other: HdMeshTopology): boolean {
    return this._topology.Equals(other._topology)
      && this._geomSubsets.length === other._geomSubsets.length
      && this._geomSubsets.every((s, i) => HdGeomSubsetEquals(s, other._geomSubsets[i]!))
      && _ArraysEqual(this._invisiblePoints, other._invisiblePoints)
      && _ArraysEqual(this._invisibleFaces, other._invisibleFaces)
      && this._refineLevel === other._refineLevel
  }

  /** meshTopology.h:141-143 */
  setHoleIndices(holeIndices: readonly number[]): void {
    this._topology = this._topology.withHoleIndices(holeIndices)
  }
  getHoleIndices(): number[] { return this._topology.getHoleIndices() }

  /** meshTopology.h:157-159 */
  setSubdivTags(subdivTags: PxOsdSubdivTags): void {
    this._topology = this._topology.withSubdivTags(subdivTags)
  }
  getSubdivTags(): PxOsdSubdivTags { return this._topology.getSubdivTags() }

  setGeomSubsets(geomSubsets: HdGeomSubset[]): void { this._geomSubsets = geomSubsets }
  getGeomSubsets(): HdGeomSubset[] { return this._geomSubsets }

  setInvisiblePoints(invisiblePoints: readonly number[]): void { this._invisiblePoints = [...invisiblePoints] }
  getInvisiblePoints(): number[] { return this._invisiblePoints }
  setInvisibleFaces(invisibleFaces: readonly number[]): void { this._invisibleFaces = [...invisibleFaces] }
  getInvisibleFaces(): number[] { return this._invisibleFaces }
}
