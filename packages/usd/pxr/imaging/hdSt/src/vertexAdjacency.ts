// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/vertexAdjacency.cpp,
//  pxr/imaging/hdSt/vertexAdjacency.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/vertexAdjacency.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - std::weak_ptr<HdSt_VertexAdjacencyBuilderComputation>: the builder
//   computation is held strongly and treated as expired once resolved. In
//   upstream the resource registry releases a source after committing it, so
//   the weak pointer expires after the source has resolved; a resolved
//   builder gates nothing, so callers see the same dependencies.
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import {
  Array as VtArray,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import { TF_VERIFY } from './tfDiagnostic.ts'
import {
  NullBufferSource as HdNullBufferSource,
  ComputedBufferSource as HdComputedBufferSource,
  VtBufferSource as HdVtBufferSource,
  _VertexAdjacency as Hd_VertexAdjacency,
  Tokens as HdTokens,
  Type as HdType,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type BufferArrayRange as HdBufferArrayRange,
  type MeshTopology as HdMeshTopology,
} from 'typescript-usd/hd'

/** vertexAdjacency.h:33-74 */
export class HdSt_VertexAdjacencyBuilder {
  private readonly _vertexAdjacency = new Hd_VertexAdjacency()

  // adjacency buffer range
  private _vertexAdjacencyRange: HdBufferArrayRange | null = null

  // weak ptr of adjacency builder used for dependent computations
  private _sharedVertexAdjacencyBuilder: HdSt_VertexAdjacencyBuilderComputation | null = null

  // PLATFORM-DIVERGENCE(hd-instance-use-count), hd/src/instanceRegistry.ts:
  // the shared_ptr holders (the HdInstanceRegistry entry and the rprims
  // that share it) are counted; the last release runs the destructor.
  private _holders = 0

  /** A holder copies the shared_ptr. */
  _retain(): this {
    ++this._holders
    return this
  }

  /** A holder drops its shared_ptr. */
  release(): void {
    if (!TF_VERIFY(this._holders > 0, 'HdSt_VertexAdjacencyBuilder released too often')) return
    if (--this._holders === 0) this._destroy()
  }

  /** shared_ptr::use_count() of the counted holders. */
  _useCount(): number { return this._holders }

  /** The destructor: drops _vertexAdjacencyRange. */
  private _destroy(): void {
    this.setVertexAdjacencyRange(null)
  }

  /** vertexAdjacency.h:44-46 */
  getVertexAdjacency(): Hd_VertexAdjacency {
    return this._vertexAdjacency
  }

  /** vertexAdjacency.cpp:28-54. Returns a shared adjacency builder
   *  computation which will call BuildAdjacencyTable. The shared
   *  computation is useful if multiple meshes share a topology and adjacency
   *  table, and only want to build the adjacency table once. */
  getSharedVertexAdjacencyBuilderComputation(topology: HdMeshTopology): HdBufferSource | null {
    // if there's a already requested (and unresolved) adjacency computation,
    // just returns it to make a dependency.
    const existing = this._sharedVertexAdjacencyBuilder
    if (existing !== null && !existing.isResolved()) {
      return existing
    }

    // if cpu adjacency table exists, no need to compute again
    if (this._vertexAdjacency.getAdjacencyTable().length !== 0) {
      return null
    }

    const builder = new HdSt_VertexAdjacencyBuilderComputation(this._vertexAdjacency, topology)

    // store the computation as weak ptr so that it can be referenced
    // by another computation.
    this._sharedVertexAdjacencyBuilder = builder

    return builder
  }

  /** vertexAdjacency.h:57-59. Sets the buffer range used for adjacency
   *  table storage. */
  setVertexAdjacencyRange(range: HdBufferArrayRange | null): void {
    // The member's shared_ptr assignment (FAITHFULNESS-DEBT(
    // hd-bar-shared-ptr), hd/src/bufferArrayRange.ts).
    if (this._vertexAdjacencyRange === range) return
    range?._retain()
    this._vertexAdjacencyRange?.release()
    this._vertexAdjacencyRange = range
  }

  /** vertexAdjacency.h:62-64. Returns the buffer range used for adjacency
   *  table storage. */
  getVertexAdjacencyRange(): HdBufferArrayRange | null {
    return this._vertexAdjacencyRange
  }
}

/** vertexAdjacency.h:76-99. A null buffer source to compute the adjacency
 *  table. Since this is a null buffer source, it won't actually produce
 *  buffer output; but other computations can depend on this to ensure
 *  BuildAdjacencyTable is called. */
export class HdSt_VertexAdjacencyBuilderComputation extends HdNullBufferSource {
  private readonly _vertexAdjacency: Hd_VertexAdjacency
  private readonly _topology: HdMeshTopology

  /** vertexAdjacency.cpp:58-64 */
  constructor(vertexAdjacency: Hd_VertexAdjacency, topology: HdMeshTopology) {
    super()
    this._vertexAdjacency = vertexAdjacency
    this._topology = topology
  }

  /** vertexAdjacency.cpp:66-79 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    this._vertexAdjacency.buildAdjacencyTable(this._topology)

    // call base class to mark as resolved.
    this._setResolved()
    return true
  }

  /** vertexAdjacency.cpp:81-85 */
  protected override _checkValid(): boolean {
    return true
  }
}

/** vertexAdjacency.h:101-128. A buffer source that puts an already computed
 *  adjacency table into a resource registry buffer. This computation should
 *  be dependent on an HdSt_VertexAdjacencyBuilderComputation. */
export class HdSt_VertexAdjacencyBufferSource extends HdComputedBufferSource {
  private readonly _vertexAdjacency: Hd_VertexAdjacency
  private readonly _vertexAdjacencyBuilder: HdBufferSource

  /** vertexAdjacency.cpp:89-95 */
  constructor(vertexAdjacency: Hd_VertexAdjacency, vertexAdjacencyBuilder: HdBufferSource) {
    super()
    this._vertexAdjacency = vertexAdjacency
    this._vertexAdjacencyBuilder = vertexAdjacencyBuilder
  }

  /** vertexAdjacency.cpp:97-112 */
  override resolve(): boolean {
    if (!this._vertexAdjacencyBuilder.isResolved()) return false
    if (!this._tryLock()) return false

    // prepare buffer source to be transferred.
    const vertexAdjacency = this._vertexAdjacency.getAdjacencyTable()
    this._setResult(new HdVtBufferSource(
      HdTokens.adjacency,
      VtValue.createArray(VtArray.fromBuffer<number>(VtValueTypes.int, vertexAdjacency))))
    this._setResolved()
    return true
  }

  /** vertexAdjacency.cpp:114-119 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [{ name: HdTokens.adjacency, tupleType: { type: HdType.HdTypeInt32, count: 1 } }]
  }

  /** vertexAdjacency.cpp:121-125 */
  protected override _checkValid(): boolean {
    return true
  }
}
