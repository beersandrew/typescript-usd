// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/triangulate.cpp,
//  pxr/imaging/hdSt/triangulate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/triangulate.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - HD_TRACE_FUNCTION is not ported.

import { Value as VtValue, type Array as VtArray } from 'typescript-usd/vt'
import type { Vec3i as GfVec3i } from 'typescript-usd/gf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import {
  ComputedBufferSource as HdComputedBufferSource,
  VtBufferSource as HdVtBufferSource,
  MeshUtil as HdMeshUtil,
  MeshComputationResult as HdMeshComputationResult,
  Tokens as HdTokens,
  PerfTokens as HdPerfTokens,
  PerfLog as HdPerfLog,
  Type as HdType,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import type { HdSt_MeshTopology } from './meshTopology.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** triangulate.h:21-56. Triangle indices computation CPU.
 *
 *  Index triangulation generates a mapping from triangle ID to authored face
 *  index domain, called primitiveParams. The primitive params are stored
 *  alongside topology index buffers, so that the same aggregation locators
 *  can be used for such an additional buffer as well:
 *  ----+--------+--------+------
 *  ... |i0 i1 i2|i3 i4 i5| ...   index buffer (for triangles)
 *  ----+--------+--------+------
 *  ... |   m0   |   m1   | ...   primitive param buffer (coarse face index)
 *  ----+--------+--------+------
 */
export class HdSt_TriangleIndexBuilderComputation extends HdComputedBufferSource {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology
  private _primitiveParam: HdBufferSource | null = null
  private _trianglesEdgeIndices: HdBufferSource | null = null

  /** triangulate.cpp:22-26 */
  constructor(topology: HdSt_MeshTopology, id: SdfPath) {
    super()
    this._id = id
    this._topology = topology
  }

  /** triangulate.cpp:28-39 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [
      { name: HdTokens.indices, tupleType: { type: HdType.HdTypeInt32Vec3, count: 1 } },
      // triangles don't support ptex indexing (at least for now).
      { name: HdTokens.primitiveParam, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      // 1 edge index per triangle
      { name: HdTokens.edgeIndices, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
    ]
  }

  /** triangulate.cpp:41-72 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    const trianglesFaceVertexIndices = { value: null as unknown as VtArray<GfVec3i> }
    const primitiveParam = { value: null as unknown as VtArray<number> }
    const trianglesEdgeIndices = { value: null as unknown as VtArray<number> }

    const meshUtil = new HdMeshUtil(this._topology, this._id)
    meshUtil.computeTriangleIndices(
      trianglesFaceVertexIndices,
      primitiveParam,
      trianglesEdgeIndices)

    this._setResult(new HdVtBufferSource(
      HdTokens.indices,
      VtValue.createArray(trianglesFaceVertexIndices.value)))

    this._primitiveParam = new HdVtBufferSource(
      HdTokens.primitiveParam,
      VtValue.createArray(primitiveParam.value))

    this._trianglesEdgeIndices = new HdVtBufferSource(
      HdTokens.edgeIndices,
      VtValue.createArray(trianglesEdgeIndices.value))

    this._setResolved()
    return true
  }

  /** triangulate.cpp:74-78 */
  override hasChainedBuffer(): boolean {
    return true
  }

  /** triangulate.cpp:80-84 */
  override getChainedBuffers(): HdBufferSource[] {
    return [this._primitiveParam!, this._trianglesEdgeIndices!]
  }

  /** triangulate.cpp:86-90 */
  protected override _checkValid(): boolean {
    return true
  }
}

/** triangulate.h:59-80. CPU face-varying triangulation. */
export class HdSt_TriangulateFaceVaryingComputation extends HdComputedBufferSource {
  private readonly _id: SdfPath
  private readonly _topology: HdSt_MeshTopology
  private readonly _source: HdBufferSource

  /** triangulate.cpp:94-100 */
  constructor(topology: HdSt_MeshTopology, source: HdBufferSource, id: SdfPath) {
    super()
    this._id = id
    this._topology = topology
    this._source = source
  }

  /** triangulate.cpp:102-137 */
  override resolve(): boolean {
    if (!TF_VERIFY(this._source)) return false
    if (!this._source.isResolved()) return false

    if (!this._tryLock()) return false

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.triangulateFaceVarying)

    const result: { value: VtValue | null } = { value: null }
    const meshUtil = new HdMeshUtil(this._topology, this._id)
    const status = meshUtil.computeTriangulatedFaceVaryingPrimvar(
      this._source.getData(),
      this._source.getNumElements(),
      this._source.getTupleType().type,
      result as { value: VtValue })
    switch (status) {
      case HdMeshComputationResult.Error:
        TF_CODING_ERROR(`[${this._source.getName()}] Could not triangulate face-varying data.`)
        break
      case HdMeshComputationResult.Success:
        this._setResult(new HdVtBufferSource(this._source.getName(), result.value!))
        break
      case HdMeshComputationResult.Unchanged:
        this._setResult(this._source)
        break
    }

    this._setResolved()
    return true
  }

  /** triangulate.cpp:139-144 */
  override getBufferSpecs(): HdBufferSpec[] {
    // produces same spec buffer as source
    return this._source.getBufferSpecs()
  }

  /** triangulate.cpp:146-150 */
  protected override _checkValid(): boolean {
    return this._source.isValid()
  }
}
