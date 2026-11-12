// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/meshTopology.cpp,
//  pxr/imaging/hdSt/meshTopology.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/meshTopology.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - The nested enums RefineMode / QuadsMode / Interpolation are exported
//   enums (HdSt_MeshTopologyRefineMode, ...) whose members are also static
//   members of HdSt_MeshTopology, so HdSt_MeshTopology.QuadsTriangulated
//   reads like HdSt_MeshTopology::QuadsTriangulated.
// - operator== is Equals().
// - std::weak_ptr members (_quadInfoBuilder, _osdTopologyBuilder,
//   _osdBaseFaceToRefinedFacesMap) are held strongly and treated as expired
//   once the computation has resolved: upstream's resource registry releases
//   a source after committing it, so the weak pointer expires after the
//   source resolved, and a resolved computation gates nothing.
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - VtIntArray parameters are number[] (as in hd/meshTopology.ts).
// - Adaptive refinement (RefineModePatches / HD_ENABLE_OPENSUBDIV3_ADAPTIVE)
//   is a FAITHFULNESS-DEBT(hdst-osd-adaptive) in subdivision.ts.
// - HD_TRACE_FUNCTION / TRACE_FUNCTION are not ported.

import {
  Array as VtArray,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import {
  MeshTopology as HdMeshTopology,
  ComputedBufferSource as HdComputedBufferSource,
  VtBufferSource as HdVtBufferSource,
  Tokens as HdTokens,
  Type as HdType,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  type QuadInfo as HdQuadInfo,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type BufferArrayRange as HdBufferArrayRange,
  type GeomSubset as HdGeomSubset,
} from 'typescript-usd/hd'
import type { HdStComputation } from './computation.ts'
import {
  HdSt_QuadInfoBuilderComputation,
  HdSt_QuadIndexBuilderComputation,
  HdSt_QuadrangulateTableComputation,
  HdSt_QuadrangulateComputation,
  HdSt_QuadrangulateComputationGPU,
  HdSt_QuadrangulateFaceVaryingComputation,
} from './quadrangulate.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdSt_TriangleIndexBuilderComputation,
  HdSt_TriangulateFaceVaryingComputation,
} from './triangulate.ts'
import { HdStTokens } from './tokens.ts'
import { HdSt_Subdivision } from './subdivision.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** meshTopology.h:55-59. Specifies how subdivision mesh topology is
 *  refined. */
export enum HdSt_MeshTopologyRefineMode {
  RefineModeUniform = 0,
  RefineModePatches,
}

/** meshTopology.h:61-65. Specifies whether quads are triangulated or
 *  untriangulated. */
export enum HdSt_MeshTopologyQuadsMode {
  QuadsTriangulated = 0,
  QuadsUntriangulated,
}

/** meshTopology.h:67-72. Specifies type of interpolation to use in
 *  refinement. */
export enum HdSt_MeshTopologyInterpolation {
  INTERPOLATE_VERTEX,
  INTERPOLATE_VARYING,
  INTERPOLATE_FACEVARYING,
}

/** A weak_ptr<T>::lock() stand-in: see the header note. */
function _Lock<T extends HdBufferSource>(source: T | null): T | null {
  return source !== null && !source.isResolved() ? source : null
}

/** `reinterpret_cast<const int32_t*>(source->GetData())` */
function _AsInt32(data: ArrayBufferView): Int32Array {
  if (data instanceof Int32Array) return data
  return new Int32Array(data.buffer as ArrayBuffer, data.byteOffset, Math.floor(data.byteLength / 4))
}

/** A VtValue holding a VtArray over freshly filled int storage. */
function _IntArrayValue(
  vtTypeName: 'int' | 'GfVec2i' | 'GfVec3i' | 'GfVec4i', buffer: Int32Array,
): VtValue {
  return VtValue.createArray(VtArray._adopt(VtValueTypes[vtTypeName], buffer))
}

/** meshTopology.h:49-337. Storm implementation for mesh topology. */
export class HdSt_MeshTopology extends HdMeshTopology {
  static readonly RefineModeUniform = HdSt_MeshTopologyRefineMode.RefineModeUniform
  static readonly RefineModePatches = HdSt_MeshTopologyRefineMode.RefineModePatches
  static readonly QuadsTriangulated = HdSt_MeshTopologyQuadsMode.QuadsTriangulated
  static readonly QuadsUntriangulated = HdSt_MeshTopologyQuadsMode.QuadsUntriangulated
  static readonly INTERPOLATE_VERTEX = HdSt_MeshTopologyInterpolation.INTERPOLATE_VERTEX
  static readonly INTERPOLATE_VARYING = HdSt_MeshTopologyInterpolation.INTERPOLATE_VARYING
  static readonly INTERPOLATE_FACEVARYING = HdSt_MeshTopologyInterpolation.INTERPOLATE_FACEVARYING

  private readonly _quadsMode: HdSt_MeshTopologyQuadsMode

  // quadrangulation info on CPU
  private _quadInfo: HdQuadInfo | null = null

  // quadrangulation info on GPU
  private _quadrangulateTableRange: HdBufferArrayRange | null = null

  private _quadInfoBuilder: HdSt_QuadInfoBuilderComputation | null = null

  // OpenSubdiv
  private readonly _refineMode: HdSt_MeshTopologyRefineMode
  private _subdivision: HdSt_Subdivision | null = null
  private _osdTopologyBuilder: HdBufferSource | null = null
  private _osdBaseFaceToRefinedFacesMap: HdBufferSource | null = null

  private _fvarTopologies: number[][] = []

  // When using geom subsets, the indices of faces that are not contained
  // within the geom subsets. Populated by SanitizeGeomSubsets().
  private _nonSubsetFaces: number[] | null = null

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
    if (!TF_VERIFY(this._holders > 0, 'HdSt_MeshTopology released too often')) return
    if (--this._holders === 0) this._destroy()
  }

  /** shared_ptr::use_count() of the counted holders. */
  _useCount(): number { return this._holders }

  /** The destructor: drops _quadrangulateTableRange. */
  private _destroy(): void {
    this.clearQuadrangulateTableRange()
  }

  /** meshTopology.cpp:104-114 */
  static new(
    src: HdMeshTopology,
    refineLevel: number,
    refineMode: HdSt_MeshTopologyRefineMode = HdSt_MeshTopologyRefineMode.RefineModeUniform,
    quadsMode: HdSt_MeshTopologyQuadsMode = HdSt_MeshTopologyQuadsMode.QuadsUntriangulated,
  ): HdSt_MeshTopology {
    return new HdSt_MeshTopology(src, refineLevel, refineMode, quadsMode)
  }

  /** meshTopology.cpp:116-134. Must be created through factory. */
  private constructor(
    src: HdMeshTopology,
    refineLevel: number,
    refineMode: HdSt_MeshTopologyRefineMode,
    quadsMode: HdSt_MeshTopologyQuadsMode,
  ) {
    super(src, refineLevel)
    this._quadsMode = quadsMode
    this._refineMode = refineMode
    this.sanitizeGeomSubsets()
  }

  /** meshTopology.cpp:138-145. Equality check between two mesh
   *  topologies. */
  override Equals(other: HdMeshTopology): boolean {
    // no need to compare _adajency and _quadInfo
    return super.Equals(other)
  }

  // ------------------------------------------------------------------------
  // Triangulation

  /** meshTopology.cpp:165-169. Returns the triangle indices (for drawing)
   *  buffer source computation. */
  getTriangleIndexBuilderComputation(id: SdfPath): HdBufferSource {
    return new HdSt_TriangleIndexBuilderComputation(this, id)
  }

  /** meshTopology.cpp:256-262. Returns the CPU face-varying triangulate
   *  computation. */
  getTriangulateFaceVaryingComputation(source: HdBufferSource, id: SdfPath): HdBufferSource {
    return new HdSt_TriangulateFaceVaryingComputation(this, source, id)
  }

  // ------------------------------------------------------------------------
  // Quadrangulation

  /** meshTopology.h:108-111. Returns the quads mode (triangulated or
   *  untriangulated). */
  getQuadsMode(): HdSt_MeshTopologyQuadsMode {
    return this._quadsMode
  }

  /** meshTopology.h:113-116. Helper function returns whether quads are
   *  triangulated. */
  triangulateQuads(): boolean {
    return this._quadsMode === HdSt_MeshTopologyQuadsMode.QuadsTriangulated
  }

  /** meshTopology.cpp:171-204. Returns the quadinfo computation for the use
   *  of primvar quadrangulation. If gpu is true, the quadrangulate table
   *  will be transferred to GPU via the resource registry. */
  getQuadInfoBuilderComputation(
    gpu: boolean, id: SdfPath,
    resourceRegistry: HdStResourceRegistry | null = null,
  ): HdSt_QuadInfoBuilderComputation {
    const builder = new HdSt_QuadInfoBuilderComputation(this, id)

    // store as a weak ptr.
    this._quadInfoBuilder = builder

    if (gpu) {
      if (!TF_VERIFY(resourceRegistry)) {
        TF_CODING_ERROR('resource registry must be non-null ' +
                        'if gpu quadinfo is requested.')
        return builder
      }

      const quadrangulateTable =
        new HdSt_QuadrangulateTableComputation(this, builder)

      // allocate quadrangulation table on GPU
      const bufferSpecs = quadrangulateTable.getBufferSpecs()

      // The member's shared_ptr assignment (FAITHFULNESS-DEBT(
      // hd-bar-shared-ptr), hd/src/bufferArrayRange.ts).
      const range =
        resourceRegistry!.allocateNonUniformBufferArrayRange(
          HdTokens.topology, bufferSpecs,
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
      range?._retain()
      this._quadrangulateTableRange?.release()
      this._quadrangulateTableRange = range

      resourceRegistry!.addSource(this._quadrangulateTableRange, quadrangulateTable)
    }
    return builder
  }

  /** meshTopology.cpp:206-211. Returns the quad indices (for drawing)
   *  buffer source computation. */
  getQuadIndexBuilderComputation(id: SdfPath): HdBufferSource {
    return new HdSt_QuadIndexBuilderComputation(
      this, _Lock(this._quadInfoBuilder), id)
  }

  /** meshTopology.cpp:213-233. Returns the CPU quadrangulated buffer
   *  source, or null when the mesh is known to be all quads. */
  getQuadrangulateComputation(source: HdBufferSource, id: SdfPath): HdBufferSource | null {
    // check if the quad table is already computed as all-quads.
    if (this._quadInfo && this._quadInfo.isAllQuads()) {
      // no need of quadrangulation.
      return null
    }

    // Make a dependency to quad info, in case if the topology
    // is chaging and the quad info hasn't been populated.
    //
    // It can be null for the second or later primvar animation.
    // Don't call GetQuadInfoBuilderComputation instead. It may result
    // unregisterd computation.
    const quadInfo = _Lock(this._quadInfoBuilder)

    return new HdSt_QuadrangulateComputation(
      this, source, quadInfo, id)
  }

  /** meshTopology.cpp:235-246. Returns the GPU quadrangulate computation,
   *  or null when the mesh is known to be all quads. */
  getQuadrangulateComputationGPU(name: string, dataType: HdType, id: SdfPath): HdStComputation | null {
    // check if the quad table is already computed as all-quads.
    if (this._quadInfo && this._quadInfo.isAllQuads()) {
      // no need of quadrangulation.
      return null
    }
    return new HdSt_QuadrangulateComputationGPU(
      this, name, dataType, id)
  }

  /** meshTopology.cpp:248-254. Returns the CPU face-varying quadrangulate
   *  computation. */
  getQuadrangulateFaceVaryingComputation(source: HdBufferSource, id: SdfPath): HdBufferSource {
    return new HdSt_QuadrangulateFaceVaryingComputation(
      this, source, id)
  }

  /** meshTopology.h:146-149. Returns the quadrangulation table range on
   *  GPU. */
  getQuadrangulateTableRange(): HdBufferArrayRange | null {
    return this._quadrangulateTableRange
  }

  /** meshTopology.h:151-154. Clears the quadrangulation table range. */
  clearQuadrangulateTableRange(): void {
    const range = this._quadrangulateTableRange
    this._quadrangulateTableRange = null
    range?.release()
  }

  /** meshTopology.cpp:147-151. Sets the quadrangulation struct;
   *  HdMeshTopology takes ownership of quadInfo. */
  setQuadInfo(quadInfo: HdQuadInfo | null): void {
    this._quadInfo = quadInfo
  }

  /** meshTopology.h:161-164. Returns the quadrangulation struct. */
  getQuadInfo(): HdQuadInfo | null {
    return this._quadInfo
  }

  // ------------------------------------------------------------------------
  // Points

  /** meshTopology.cpp:153-163. Returns the point indices buffer source
   *  computation. */
  getPointsIndexBuilderComputation(): HdBufferSource {
    // this is simple enough to return the result right away.
    const numPoints = this.getNumPoints()
    const indices = new Int32Array(Math.max(numPoints, 0))
    for (let i = 0; i < numPoints; ++i) indices[i] = i

    return new HdVtBufferSource(
      HdTokens.indices, _IntArrayValue('int', indices))
  }

  // ------------------------------------------------------------------------
  // Subdivision

  /** meshTopology.h:183-191. Returns the subdivision struct. */
  getSubdivision(): HdSt_Subdivision | null {
    return this._subdivision
  }

  /** meshTopology.cpp:264-268. Returns true if the subdivision on this mesh
   *  produces triangles (otherwise quads). */
  refinesToTriangles(): boolean {
    return HdSt_Subdivision.refinesToTriangles(this._topology.getScheme())
  }

  /** meshTopology.cpp:270-275. Returns true if the subdivision of this mesh
   *  produces bspline patches. */
  refinesToBSplinePatches(): boolean {
    return (HdMeshTopology.isEnabledAdaptive() ||
            this._refineMode === HdSt_MeshTopologyRefineMode.RefineModePatches) &&
      HdSt_Subdivision.refinesToBSplinePatches(this._topology.getScheme())
  }

  /** meshTopology.cpp:277-282. Returns true if the subdivision of this mesh
   *  produces box spline triangle patches. */
  refinesToBoxSplineTrianglePatches(): boolean {
    return (HdMeshTopology.isEnabledAdaptive() ||
            this._refineMode === HdSt_MeshTopologyRefineMode.RefineModePatches) &&
      HdSt_Subdivision.refinesToBoxSplineTrianglePatches(this._topology.getScheme())
  }

  /** meshTopology.cpp:284-307. Returns the subdivision topology
   *  computation. */
  getOsdTopologyComputation(debugId: SdfPath): HdBufferSource | null {
    const builder = _Lock(this._osdTopologyBuilder)
    if (builder) {
      return builder
    }

    // this has to be the first instance.
    if (!TF_VERIFY(!this._subdivision)) return null

    const adaptive = this.refinesToBSplinePatches() ||
                     this.refinesToBoxSplineTrianglePatches()

    // create HdSt_Subdivision
    this._subdivision = new HdSt_Subdivision(adaptive, this._refineLevel)

    if (!TF_VERIFY(this._subdivision)) return null

    // create a topology computation for HdSt_Subdivision
    const newBuilder =
      this._subdivision.createTopologyComputation(this, debugId)
    this._osdTopologyBuilder = newBuilder // retain weak ptr
    return newBuilder
  }

  /** meshTopology.cpp:433-438. Returns the refined indices builder
   *  computation. */
  getOsdIndexBuilderComputation(): HdBufferSource | null {
    const topologyBuilder = _Lock(this._osdTopologyBuilder)
    return this._subdivision!.createIndexComputation(this, topologyBuilder)
  }

  /** meshTopology.cpp:440-446. Returns the refined face-varying indices
   *  builder computation. */
  getOsdFvarIndexBuilderComputation(channel: number): HdBufferSource | null {
    const topologyBuilder = _Lock(this._osdTopologyBuilder)
    return this._subdivision!.createFvarIndexComputation(
      this, topologyBuilder, channel)
  }

  /** meshTopology.cpp:448-475. Returns the subdivision primvar refine
   *  computation on CPU. */
  getOsdRefineComputation(
    source: HdBufferSource,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): HdBufferSource {
    // Make a dependency to osd topology builder computation.
    // (see comment on GetQuadrangulateComputation)
    //
    // It can be null for the second or later primvar animation.
    // Don't call GetOsdTopologyComputation instead. It may result
    // unregisterd computation.

    // for empty topology, we don't need to refine anything.
    // source will be scheduled at the caller
    if (this._topology.getFaceVertexCounts().length === 0) return source

    if (!TF_VERIFY(this._subdivision)) {
      TF_CODING_ERROR('GetOsdTopologyComputation should be called before ' +
                      'GetOsdRefineComputation.')
      return source
    }
    const topologyBuilder = _Lock(this._osdTopologyBuilder)

    // meshTopology.cpp:472-474 passes no fvarChannel (it defaults to 0).
    void fvarChannel
    return this._subdivision!.createRefineComputationCPU(this, source,
      topologyBuilder,
      interpolation)
  }

  /** meshTopology.cpp:477-503. Returns the subdivision primvar refine
   *  computation on GPU. */
  getOsdRefineComputationGPU(
    name: string,
    dataType: HdType,
    resourceRegistry: HdStResourceRegistry | null,
    interpolation: HdSt_MeshTopologyInterpolation,
    fvarChannel = 0,
  ): HdStComputation | null {
    // Make a dependency to osd topology builder computation.
    // (see comment on GetOsdRefineComputation)

    // for empty topology, we don't need to refine anything.
    if (this._topology.getFaceVertexCounts().length === 0) return null

    if (!TF_VERIFY(this._subdivision)) {
      TF_CODING_ERROR('GetOsdTopologyComputation should be called before ' +
                      'GetOsdRefineComputationGPU.')
      return null
    }
    const topologyBuilder = _Lock(this._osdTopologyBuilder)

    return this._subdivision!.createRefineComputationGPU(this, topologyBuilder,
      name, dataType,
      resourceRegistry!,
      interpolation, fvarChannel)
  }

  /** meshTopology.cpp:372-393. Returns the mapping from base face to refined
   *  face indices. */
  getOsdBaseFaceToRefinedFacesMapComputation(
    resourceRegistry: HdStResourceRegistry | null,
  ): HdBufferSource | null {
    const map = _Lock(this._osdBaseFaceToRefinedFacesMap)
    if (map) {
      return map
    }

    if (!TF_VERIFY(this._subdivision)) {
      return null
    }
    const topologyBuilder = _Lock(this._osdTopologyBuilder)
    const newMap =
      this._subdivision!.createBaseFaceToRefinedFacesMapComputation(
        topologyBuilder)
    // Add to resource registry when created
    resourceRegistry!.addSource(newMap)

    this._osdBaseFaceToRefinedFacesMap = newMap // retain weak ptr
    return newMap
  }

  // ------------------------------------------------------------------------
  // Geom Subsets

  /** meshTopology.cpp:309-370. Processes geom subsets to remove those with
   *  empty indices or empty material id. Will initialize _nonSubsetFaces if
   *  there are geom subsets. */
  sanitizeGeomSubsets(): void {
    const geomSubsets = this.getGeomSubsets()
    if (geomSubsets.length === 0) {
      return
    }
    const numFaces = this.getNumFaces()

    // Keep track of faces that are used within the geom subsets
    const unusedFaces = new Array<boolean>(numFaces).fill(true)
    let numUnusedFaces = numFaces

    const sanitizedGeomSubsets: HdGeomSubset[] = []
    for (const geomSubset of geomSubsets) {
      const sanitizedGeomSubset: HdGeomSubset = { ...geomSubset }

      // We only care about subsets that will with non-empty indices and
      // material id
      const faceIndices = geomSubset.indices
      if (faceIndices.length !== 0 && geomSubset.materialId !== '') {
        const sanitizedFaceIndices: number[] = []
        for (let i = 0; i < faceIndices.length; ++i) {
          const index = faceIndices[i]!
          // Skip out-of-bound face indices.
          if (index >= numFaces) {
            TF_WARN(`Geom subset index ${index} is larger than number of ` +
              `faces (${numFaces}), removing.`)
            continue
          }
          sanitizedFaceIndices.push(index)
          if (unusedFaces[index]) {
            unusedFaces[index] = false
            numUnusedFaces--
          } else {
            // Warn about duplicated face indices.
            TF_WARN(`Face index ${index} is repeated between geom subsets ` +
              `(in subset <${geomSubset.id}>)`)
          }
        }
        sanitizedGeomSubset.indices = sanitizedFaceIndices
        sanitizedGeomSubsets.push(sanitizedGeomSubset)
      }
    }

    this._nonSubsetFaces = new Array<number>(numUnusedFaces).fill(0)

    if (numUnusedFaces) {
      let count = 0
      for (let i = 0; i < unusedFaces.length && count < numUnusedFaces; ++i) {
        if (unusedFaces[i]) {
          this._nonSubsetFaces[count] = i
          count++
        }
      }
    }

    this.setGeomSubsets(sanitizedGeomSubsets)
  }

  /** meshTopology.cpp:395-402. Returns the indices subset computation for
   *  unrefined indices. */
  getIndexSubsetComputation(
    indexBuilderSource: HdBufferSource,
    faceIndicesSource: HdBufferSource | null,
  ): HdBufferSource {
    return new HdSt_IndexSubsetComputation(
      indexBuilderSource, faceIndicesSource)
  }

  /** meshTopology.cpp:404-414. Returns the indices subset computation for
   *  refined indices. */
  getRefinedIndexSubsetComputation(
    indexBuilderSource: HdBufferSource,
    faceIndicesSource: HdBufferSource | null,
  ): HdBufferSource {
    const baseFaceToRefinedFacesMapSource =
      _Lock(this._osdBaseFaceToRefinedFacesMap)

    return new HdSt_IndexSubsetComputation(
      indexBuilderSource, faceIndicesSource, baseFaceToRefinedFacesMapSource)
  }

  /** meshTopology.cpp:424-431. Returns the triangulated/quadrangulated face
   *  indices computation. */
  getGeomSubsetFaceIndexBuilderComputation(
    geomSubsetFaceIndexHelperSource: HdBufferSource | null,
    faceIndices: readonly number[],
  ): HdBufferSource {
    return new HdSt_GeomSubsetFaceIndexBuilderComputation(
      geomSubsetFaceIndexHelperSource, faceIndices)
  }

  /** meshTopology.cpp:416-422. Returns computation creating buffer sources
   *  used in mapping authored face indices to triangulated/quadrangulated
   *  face indices. */
  getGeomSubsetFaceIndexHelperComputation(refined: boolean, quadrangulated: boolean): HdBufferSource {
    return new HdSt_GeomSubsetFaceIndexHelperComputation(
      this, refined, quadrangulated)
  }

  // ------------------------------------------------------------------------
  // Face-varying Topologies

  /** meshTopology.h:286-289. Returns the face indices of faces not used in
   *  any geom subsets. */
  getNonSubsetFaces(): readonly number[] | null {
    return this._nonSubsetFaces
  }

  /** meshTopology.h:291-294. Sets the face-varying topologies. */
  setFvarTopologies(fvarTopologies: number[][]): void {
    this._fvarTopologies = fvarTopologies
  }

  /** meshTopology.h:296-299. Returns the face-varying topologies. */
  getFvarTopologies(): number[][] {
    return this._fvarTopologies
  }
}

/** meshTopology.cpp:29-55. Given an index builder buffer source and a face
 *  indices buffer source (containing face indices after
 *  triangulation/quadrangulation), this will return a subset of the mesh
 *  indices that corresponds to those faces. */
export class HdSt_IndexSubsetComputation extends HdComputedBufferSource {
  protected _chainedBuffers: HdBufferSource[] = []
  protected readonly _indexBuilderSource: HdBufferSource
  protected readonly _faceIndicesSource: HdBufferSource | null
  protected readonly _baseFaceToRefinedFacesMapSource: HdBufferSource | null

  /** meshTopology.cpp:505-513 */
  constructor(
    indexBuilderSource: HdBufferSource,
    faceIndicesSource: HdBufferSource | null,
    baseFaceToRefinedFacesMapSource: HdBufferSource | null = null,
  ) {
    super()
    this._indexBuilderSource = indexBuilderSource
    this._faceIndicesSource = faceIndicesSource
    this._baseFaceToRefinedFacesMapSource = baseFaceToRefinedFacesMapSource
  }

  /** meshTopology.cpp:515-519 */
  override getBufferSpecs(): HdBufferSpec[] {
    return this._indexBuilderSource.getBufferSpecs()
  }

  /** meshTopology.cpp:521-574 */
  override resolve(): boolean {
    if (this._indexBuilderSource && !this._indexBuilderSource.isResolved()) return false
    if (this._faceIndicesSource && !this._faceIndicesSource.isResolved()) return false
    if (this._baseFaceToRefinedFacesMapSource &&
        !this._baseFaceToRefinedFacesMapSource.isResolved()) {
      return false
    }

    if (!this._tryLock()) return false

    let faceIndices: number[] = []
    if (this._faceIndicesSource) {
      const processedFaceIndices = _AsInt32(this._faceIndicesSource.getData())
      const numElements = this._faceIndicesSource.getNumElements()
      faceIndices = Array.from(processedFaceIndices.subarray(0, numElements))
    }

    // Refined indices need extra step to map the quadrangulated/triangulated
    // face indices to the refined face indices.
    if (this._baseFaceToRefinedFacesMapSource) {
      const baseFaceToRefinedFacesMap =
        _AsInt32(this._baseFaceToRefinedFacesMapSource.getData())
      const refinedFaceCounts =
        _AsInt32(this._baseFaceToRefinedFacesMapSource.getChainedBuffers()[0]!.getData())

      const refinedFaceIndices: number[] = []
      for (let i = 0; i < faceIndices.length; ++i) {
        const start = faceIndices[i] === 0
          ? 0 : refinedFaceCounts[faceIndices[i]! - 1]!
        const end = refinedFaceCounts[faceIndices[i]!]!

        for (let j = start; j < end; ++j) {
          refinedFaceIndices.push(baseFaceToRefinedFacesMap[j]!)
        }
      }
      faceIndices = refinedFaceIndices
    }

    this._resolveIndices(faceIndices)
    this._populateChainedBuffers(faceIndices)

    this._setResolved()
    return true
  }

  /** meshTopology.cpp:576-580 */
  override hasChainedBuffer(): boolean {
    return this._chainedBuffers.length !== 0
  }

  /** meshTopology.cpp:582-586 */
  override getChainedBuffers(): HdBufferSource[] {
    return this._chainedBuffers
  }

  /** meshTopology.cpp:588-592 */
  protected override _checkValid(): boolean {
    return true
  }

  /** meshTopology.cpp:594-650 */
  protected _resolveIndices(faceIndices: readonly number[]): void {
    const numFaces = faceIndices.length
    const indices = _AsInt32(this._indexBuilderSource.getData())
    const tupleType = this._indexBuilderSource.getTupleType()
    const arraySize = tupleType.count

    // We assume indices of type HdTypeInt32 can come in arrays, while the
    // other types do not.
    let subsetIndices = VtValue.getEmpty()
    switch (tupleType.type) {
      case HdType.HdTypeInt32: {
        const typedSubsetIndices = new Int32Array(arraySize * numFaces)
        let o = 0
        for (let i = 0; i < numFaces; ++i) {
          const index = arraySize * faceIndices[i]!
          for (let j = 0; j < arraySize; ++j) {
            typedSubsetIndices[o++] = indices[index + j]!
          }
        }
        subsetIndices = _IntArrayValue('int', typedSubsetIndices)
        break
      }
      case HdType.HdTypeInt32Vec3: {
        const typedSubsetIndices = new Int32Array(3 * numFaces)
        for (let i = 0; i < numFaces; ++i) {
          const index = 3 * faceIndices[i]!
          typedSubsetIndices[3 * i] = indices[index]!
          typedSubsetIndices[3 * i + 1] = indices[index + 1]!
          typedSubsetIndices[3 * i + 2] = indices[index + 2]!
        }
        subsetIndices = _IntArrayValue('GfVec3i', typedSubsetIndices)
        break
      }
      case HdType.HdTypeInt32Vec4: {
        const typedSubsetIndices = new Int32Array(4 * numFaces)
        for (let i = 0; i < numFaces; ++i) {
          const index = 4 * faceIndices[i]!
          typedSubsetIndices[4 * i] = indices[index]!
          typedSubsetIndices[4 * i + 1] = indices[index + 1]!
          typedSubsetIndices[4 * i + 2] = indices[index + 2]!
          typedSubsetIndices[4 * i + 3] = indices[index + 3]!
        }
        subsetIndices = _IntArrayValue('GfVec4i', typedSubsetIndices)
        break
      }
      default:
        TF_WARN(`${this._indexBuilderSource.getName()} indices type not supported`)
    }

    this._setResult(new HdVtBufferSource(
      this._indexBuilderSource.getName(), subsetIndices, arraySize))
  }

  /** meshTopology.cpp:652-733 */
  protected _populateChainedBuffers(faceIndices: readonly number[]): void {
    if (this._indexBuilderSource.hasChainedBuffer()) {
      const numFaces = faceIndices.length

      const chainedBuffers = this._indexBuilderSource.getChainedBuffers()

      for (const chainedBuffer of chainedBuffers) {
        const chainedBufferData = _AsInt32(chainedBuffer.getData())
        const tupleType = chainedBuffer.getTupleType()

        // We assume the chained buffers of the index builder comps all
        // have an array size of 1.
        let subsetChainedBuffer = VtValue.getEmpty()
        const gather = (width: number, vtTypeName: 'int' | 'GfVec2i' | 'GfVec3i' | 'GfVec4i'): VtValue => {
          const typed = new Int32Array(width * numFaces)
          for (let i = 0; i < numFaces; ++i) {
            const index = width * faceIndices[i]!
            for (let c = 0; c < width; ++c) {
              typed[width * i + c] = chainedBufferData[index + c]!
            }
          }
          return _IntArrayValue(vtTypeName, typed)
        }
        switch (tupleType.type) {
          case HdType.HdTypeInt32:
            subsetChainedBuffer = gather(1, 'int')
            break
          case HdType.HdTypeInt32Vec2:
            subsetChainedBuffer = gather(2, 'GfVec2i')
            break
          case HdType.HdTypeInt32Vec3:
            subsetChainedBuffer = gather(3, 'GfVec3i')
            break
          case HdType.HdTypeInt32Vec4:
            subsetChainedBuffer = gather(4, 'GfVec4i')
            break
          default:
            TF_WARN(`Chained buffer ${chainedBuffer.getName()} type not supported`)
        }

        const subsetChainedBufferSource =
          new HdVtBufferSource(
            chainedBuffer.getName(),
            subsetChainedBuffer)

        this._chainedBuffers.push(subsetChainedBufferSource)
      }
    }
  }
}

/** meshTopology.cpp:57-74. Will map a geom subset's authored face indices
 *  to the appropriate triangulated/quadrangulated face indices. This buffer
 *  source is also used in drawing as the unrefined fvar indices. */
export class HdSt_GeomSubsetFaceIndexBuilderComputation extends HdComputedBufferSource {
  protected readonly _geomSubsetFaceIndexHelperSource: HdBufferSource | null
  protected readonly _faceIndices: readonly number[]

  /** meshTopology.cpp:735-742 */
  constructor(
    geomSubsetFaceIndexHelperSource: HdBufferSource | null,
    faceIndices: readonly number[],
  ) {
    super()
    this._geomSubsetFaceIndexHelperSource = geomSubsetFaceIndexHelperSource
    this._faceIndices = faceIndices
  }

  /** meshTopology.cpp:744-753 */
  override getBufferSpecs(): HdBufferSpec[] {
    // Though this computation is used as the face indices input into the
    // subset indices computations, it is also used in drawing as the coarse
    // face index (in place of gl_PrimitiveID)
    return [{ name: HdStTokens.coarseFaceIndex, tupleType: { type: HdType.HdTypeInt32, count: 1 } }]
  }

  /** meshTopology.cpp:755-791 */
  override resolve(): boolean {
    if (this._geomSubsetFaceIndexHelperSource &&
        !this._geomSubsetFaceIndexHelperSource.isResolved()) {
      return false
    }

    if (!this._tryLock()) return false

    const faceIndices: number[] = []
    if (this._geomSubsetFaceIndexHelperSource) {
      const processedFaceCounts =
        _AsInt32(this._geomSubsetFaceIndexHelperSource.getData())
      const processedFaceIndices =
        _AsInt32(this._geomSubsetFaceIndexHelperSource.getChainedBuffers()[0]!.getData())

      for (let i = 0; i < this._faceIndices.length; ++i) {
        const baseFaceIndex = this._faceIndices[i]!
        for (let j = 0; j < processedFaceCounts[baseFaceIndex]!; ++j) {
          faceIndices.push(processedFaceIndices[baseFaceIndex]! + j)
        }
      }
    }

    this._setResult(new HdVtBufferSource(
      HdStTokens.coarseFaceIndex, _IntArrayValue('int', Int32Array.from(faceIndices))))

    this._setResolved()

    return true
  }

  /** meshTopology.cpp:793-797 */
  protected override _checkValid(): boolean {
    return true
  }
}

/** meshTopology.cpp:76-102. Creates two buffer sources to be used as input
 *  into HdSt_GeomSubsetFaceIndexBuilderComputation. The first contains the
 *  number of triangulated/quadrangulated faces created per base face; the
 *  second (chained) contains the starting face index of the
 *  triangulated/quadrangulated faces for each base face. */
export class HdSt_GeomSubsetFaceIndexHelperComputation extends HdComputedBufferSource {
  protected readonly _topology: HdSt_MeshTopology
  protected readonly _refined: boolean
  protected readonly _quadrangulated: boolean
  protected _processedFaceIndicesBuffer: HdBufferSource | null = null

  /** meshTopology.cpp:799-808 */
  constructor(topology: HdSt_MeshTopology, refined: boolean, quadrangulated: boolean) {
    super()
    this._topology = topology
    this._refined = refined
    this._quadrangulated = quadrangulated
  }

  /** meshTopology.cpp:810-818 */
  override getBufferSpecs(): HdBufferSpec[] {
    return [
      { name: HdStTokens.processedFaceCounts, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
      { name: HdStTokens.processedFaceIndices, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
    ]
  }

  /** meshTopology.cpp:820-892 */
  override resolve(): boolean {
    if (!this._tryLock()) return false

    const faceVertexCounts = this._topology.getFaceVertexCounts()
    const numFaces = this._topology.getNumFaces()
    const processedFaceCounts = new Int32Array(numFaces)

    // Based on whether the mesh underwent a triangulation or quadrangulation
    // step, determine how many faces each base face becomes.
    if (this._quadrangulated) {
      const holeIndices = this._topology.getHoleIndices()
      let holeIndex = 0
      for (let i = 0; i < numFaces; ++i) {
        if (holeIndex < holeIndices.length && holeIndices[holeIndex] === i) {
          processedFaceCounts[i] = 0
          holeIndex++
        } else if (faceVertexCounts[i] === 4) {
          // Quad faces do not get quadrangulated
          processedFaceCounts[i] = 1
        } else {
          processedFaceCounts[i] = faceVertexCounts[i]!
        }
      }
    } else {
      const holeIndices = this._topology.getHoleIndices()
      let holeIndex = 0
      for (let i = 0; i < numFaces; ++i) {
        if (holeIndex < holeIndices.length && holeIndices[holeIndex] === i) {
          processedFaceCounts[i] = 0
          holeIndex++
        } else {
          processedFaceCounts[i] = faceVertexCounts[i]! - 2
        }
      }
    }

    this._setResult(new HdVtBufferSource(
      HdStTokens.processedFaceCounts, _IntArrayValue('int', processedFaceCounts)))

    // Using the number of processed faces per base face, determine the new
    // face index that each base face index maps to.
    // Each base face can potentially map to multiple processed faces, but
    // this value gives us the new starting index for those processed faces.
    const processedFaceIndices = new Int32Array(numFaces)
    let processedFaceIndex = 0
    for (let i = 0; i < numFaces; ++i) {
      processedFaceIndices[i] = processedFaceIndex

      // If current face is hole
      if (this._refined && processedFaceCounts[i] === 0) {
        if (this._quadrangulated) {
          if (faceVertexCounts[i] === 4) {
            processedFaceIndex += 1
          } else {
            processedFaceIndex += faceVertexCounts[i]!
          }
        } else {
          processedFaceIndex += faceVertexCounts[i]! - 2
        }
      } else {
        processedFaceIndex += processedFaceCounts[i]!
      }
    }

    this._processedFaceIndicesBuffer = new HdVtBufferSource(
      HdStTokens.processedFaceIndices, _IntArrayValue('int', processedFaceIndices))

    this._setResolved()
    return true
  }

  /** meshTopology.cpp:894-898 */
  override hasChainedBuffer(): boolean {
    return true
  }

  /** meshTopology.cpp:900-904 */
  override getChainedBuffers(): HdBufferSource[] {
    return [this._processedFaceIndicesBuffer!]
  }

  /** meshTopology.cpp:906-910 */
  protected override _checkValid(): boolean {
    return true
  }
}
