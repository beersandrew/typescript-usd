// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/mesh.cpp,
//  pxr/imaging/hdSt/mesh.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/mesh.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences (each also noted at its site):
// - HdDirtyBits* parameters are HdDirtyBitsRef boxes; bool* out-parameters
//   are `{ value }` boxes.
// - SdfPath ids are path strings; the empty path is ''.
// - The shared data upstream reaches as `_sharedData` is HdRprim's
//   `_rprimSharedData` (hd/rprim.ts header).
// - HdTopology::ID values are bigints. Hashes upstream computes with
//   ArchHash64 over the bytes of a value (a bool, a usage hint, int arrays,
//   token text) hash the same little-endian bytes here.
// - The bitfield members are plain booleans.
// - _FvarTopologyTracker is the module class HdStMesh_FvarTopologyTracker.
// - Sync accepts the HdRprim union signature (hd/rprim.ts) and uses the
//   scene-delegate form.
// - The points fastpath (mesh.cpp:1575-1711) reads the authored points
//   value through the scene delegate (the same terminal scene index prim's
//   primvar value, as a VtValue).
// - OpenSubdiv refinement (HdSt_Subdivision) and material networks are
//   stubbed in their own files (meshTopology.ts, material.ts); the branches
//   that reach them are ported unchanged here.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION / TRACE_SCOPE are not ported.

import {
  Debug as TfDebug,
  TfEnvSetting,
  TfGetEnvSetting,
  type Token as TfToken,
} from 'typescript-usd/tf'
import { ArchHash64 } from 'typescript-usd/arch'
import { Value as VtValue } from 'typescript-usd/vt'
import { OpenSubdivTokens as PxOsdOpenSubdivTokens } from 'typescript-usd/pxOsd'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  ChangeTracker as HdChangeTracker,
  CullStyle as HdCullStyle,
  DebugCodes as HdDebugCodes,
  DrawingCoord as HdDrawingCoord,
  ExtComputationPrimvarDescriptorFromSchema as HdExtComputationPrimvarDescriptorFromSchema,
  ExtComputationPrimvarsSchema as HdExtComputationPrimvarsSchema,
  Interpolation as HdInterpolation,
  HdMeshRprim as HdMesh,
  MeshGeomStyle as HdMeshGeomStyle,
  MeshReprDescTokens as HdMeshReprDescTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarDescriptorFromSchema as HdPrimvarDescriptorFromSchema,
  PrimvarsSchema as HdPrimvarsSchema,
  Repr as HdRepr,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferArrayUsageHint as HdBufferArrayUsageHint,
  type BufferSource as HdBufferSource,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type ExtComputationPrimvarDescriptor as HdExtComputationPrimvarDescriptor,
  type GeomSubset as HdGeomSubset,
  type MeshReprDesc as HdMeshReprDesc,
  type MeshTopology as HdMeshTopology,
  type PrimvarDescriptor as HdPrimvarDescriptor,
  type RenderIndex as HdRenderIndex,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { HdStComputation } from './computation.ts'
import { HdStDrawItem } from './drawItem.ts'
import { HdSt_FlatNormalsComputationGPU } from './flatNormals.ts'
import {
  HdSt_GeometricShader,
  HdSt_GeometricShaderFvarPatchType,
  HdSt_GeometricShaderPrimitiveType,
} from './geometricShader.ts'
import { HdSt_GetExtComputationPrimvarsComputations } from './extCompGpuComputation.ts'
import type { HdStMaterial } from './material.ts'
import { HdSt_MeshShaderKey, HdSt_MeshShaderKeyNormalSource } from './meshShaderKey.ts'
import {
  HdSt_MeshTopology,
  HdSt_MeshTopologyRefineMode,
  type HdSt_MeshTopologyInterpolation,
} from './meshTopology.ts'
import {
  HdStCanSkipBARAllocationOrUpdate,
  HdStComputeSharedPrimvarId,
  HdStGetBufferSpecsFromCompuations,
  HdStGetMaterialNetworkShader,
  HdStGetPrimvarDescriptors,
  HdStGetRemovedPrimvarBufferSpecs,
  HdStIsEnabledSharedVertexPrimvar,
  HdStIsPrimvarValidForDrawItem,
  HdStIsValidBAR,
  HdStMarkDrawBatchesDirty,
  HdStMarkGarbageCollectionNeeded,
  HdStMarkGeomSubsetDrawItemsDirty,
  HdStPopulateConstantPrimvars,
  HdStProcessTopologyVisibility,
  HdStSetMaterialId,
  HdStSetMaterialTag,
  HdStShouldPopulateConstantPrimvars,
  HdStUpdateDrawItemBAR,
  HdStUpdateInstancerData,
  HdStUpdateRenderTag,
} from './primUtils.ts'
import type { HdStRenderParam } from './renderParam.ts'
import {
  HdStComputeQueue,
  type HdStComputationComputeQueuePairVector,
  type HdStResourceRegistry,
} from './resourceRegistry.ts'
import { HdSt_SmoothNormalsComputationGPU } from './smoothNormals.ts'
import { HdStTokens } from './tokens.ts'
import { HdSt_VertexAdjacencyBufferSource, HdSt_VertexAdjacencyBuilder } from './vertexAdjacency.ts'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** The SdfPath HdSt_MeshTopology's computations take for an rprim id
 *  string (hd's ids are path strings; see the header). */
function _Path(id: string): SdfPath {
  return id === '' ? SdfPath.emptyPath : SdfPath.fromString(id)
}

/** HF_VALIDATION_WARN (hf/diagnostic.h:23-26). */
function HF_VALIDATION_WARN(id: string, message: string): void {
  TF_WARN(`Invalid Hydra prim '${id}': ${message}`)
}

/** mesh.cpp:63-65. For debugging. */
const HD_ENABLE_FORCE_QUADRANGULATE = new TfEnvSetting<number>(
  'HD_ENABLE_FORCE_QUADRANGULATE', 0,
  'Apply quadrangulation for all meshes for debug')

/** mesh.cpp:67-69. Default to use packed normals. */
const HD_ENABLE_PACKED_NORMALS = new TfEnvSetting<number>(
  'HD_ENABLE_PACKED_NORMALS', 1,
  'Use packed normals')

// mesh.cpp:71-77. Use more recognizable names for each compute queue the
// mesh computations use.
const _CopyExtCompQueue = HdStComputeQueue.HdStComputeQueueZero
const _RefinePrimvarCompQueue = HdStComputeQueue.HdStComputeQueueOne
const _NormalsCompQueue = HdStComputeQueue.HdStComputeQueueTwo
const _RefineNormalsCompQueue = HdStComputeQueue.HdStComputeQueueThree
void _CopyExtCompQueue

/** rprimSharedData.h:22-23 TopologyToPrimvarVector. */
export type HdStMeshTopologyToPrimvarVector = Array<[number[], TfToken[]]>

// ---------------------------------------------------------------------------
// Byte views for the ArchHash64 salts (see the header).

function _BoolBytes(value: boolean): Uint8Array {
  return new Uint8Array([value ? 1 : 0])
}

function _Uint32Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true)
  return bytes
}

function _IntArrayBytes(values: readonly number[]): Uint8Array {
  const ints = Int32Array.from(values)
  return new Uint8Array(ints.buffer, ints.byteOffset, ints.byteLength)
}

const _textEncoder = new TextEncoder()
function _TokenBytes(token: string): Uint8Array {
  return _textEncoder.encode(token)
}

/** VtIntArray operator== */
function _IntArraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** TopologyToPrimvarVector operator== */
function _TopologyToPrimvarVectorsEqual(
  a: HdStMeshTopologyToPrimvarVector, b: HdStMeshTopologyToPrimvarVector): boolean {
  return a.length === b.length && a.every(([topo, pvs], i) =>
    _IntArraysEqual(topo, b[i]![0]) && _IntArraysEqual(
      pvs as unknown as number[], b[i]![1] as unknown as number[]))
}

/** HdGeomSubsets operator== (hd/geomSubset.h:40-46 per element). */
function _GeomSubsetsEqual(a: readonly HdGeomSubset[], b: readonly HdGeomSubset[]): boolean {
  return a.length === b.length && a.every((s, i) => {
    const t = b[i]!
    return s.type === t.type && s.id === t.id && s.materialId === t.materialId &&
      _IntArraysEqual(s.indices, t.indices)
  })
}

/**
 * mesh.h:225-310 HdStMesh::_FvarTopologyTracker. Helper class for meshes to
 * keep track of the topologies of their face-varying primvars. The
 * face-varying topologies are later passed to the OSD refiner in an order
 * that will correspond to their face-varying channel number. We keep a
 * vector of only the topologies in use, paired with their associated primvar
 * names.
 */
export class HdStMesh_FvarTopologyTracker {
  private _topologies: HdStMeshTopologyToPrimvarVector = []

  /** mesh.h:228-230 */
  getTopologyToPrimvarVector(): HdStMeshTopologyToPrimvarVector {
    return this._topologies
  }

  /** mesh.h:232-254. Add a primvar and its corresponding toplogy to the
   *  tracker */
  addOrUpdateTopology(primvar: TfToken, topology: readonly number[]): void {
    for (let i = 0; i < this._topologies.length; ++i) {
      // Found existing topology
      if (_IntArraysEqual(this._topologies[i]![0], topology)) {
        if (!this._topologies[i]![1].includes(primvar)) {
          // Topology does not have that primvar assigned
          this.removePrimvar(primvar)
          this._topologies[i]![1].push(primvar)
        }
        return
      }
    }

    // Found new topology
    this.removePrimvar(primvar)
    this._topologies.push([[...topology], [primvar]])
  }

  /** mesh.h:256-265. Remove a primvar from the tracker. */
  removePrimvar(primvar: TfToken): void {
    for (let i = 0; i < this._topologies.length; ++i) {
      // vector::erase(find(...), end()) erases from the first match on.
      const pvs = this._topologies[i]![1]
      const at = pvs.indexOf(primvar)
      if (at >= 0) {
        pvs.splice(at)
      }
    }
  }

  /** mesh.h:267-273. Remove unused topologies (topologies with no associated
   *  primvars), as we do not want to build stencil tables for them. */
  removeUnusedTopologies(): void {
    this._topologies = this._topologies.filter(
      (topology) => !HdStMesh_FvarTopologyTracker._noPrimvars(topology))
  }

  /** mesh.h:275-288. Get the face-varying channel given a primvar name. If
   *  the primvar is not in the tracker, returns -1. */
  getChannelFromPrimvar(primvar: TfToken): number {
    for (let i = 0; i < this._topologies.length; ++i) {
      if (this._topologies[i]![1].includes(primvar)) {
        return i
      }
    }
    return -1
  }

  /** mesh.h:290-297. Return a vector of all the face-varying topologies. */
  getFvarTopologies(): number[][] {
    const fvarTopologies: number[][] = []
    for (const it of this._topologies) {
      fvarTopologies.push(it[0])
    }
    return fvarTopologies
  }

  /** mesh.h:299-301 */
  getNumTopologies(): number {
    return this._topologies.length
  }

  /** mesh.h:304-309. Helper function that returns true if a <topology,
   *  primvar vector> has no primvars. */
  private static _noPrimvars(topology: [number[], TfToken[]]): boolean {
    return topology[1].length === 0
  }
}

/** mesh.cpp:241-246 */
function _IsEnabledForceQuadrangulate(): boolean {
  return TfGetEnvSetting(HD_ENABLE_FORCE_QUADRANGULATE) === 1
}

/** renderIndex.GetResourceRegistry() as the HdStResourceRegistry it is. */
function _GetResourceRegistry(renderIndex: HdRenderIndex): HdStResourceRegistry {
  return renderIndex.getResourceRegistry() as HdStResourceRegistry
}

/** HdSprim lookup of an HdStMaterial (static_cast upstream). */
function _GetMaterial(renderIndex: HdRenderIndex, materialId: string): HdStMaterial | null {
  return (renderIndex.getSprim(HdPrimTypeTokens.material, materialId) ?? null) as
    unknown as HdStMaterial | null
}

/** HdBufferArrayRangeSharedPtr as the HdStBufferArrayRange-free base. */
type _BAR = HdBufferArrayRange | null

/** mesh.h:47-342 */
export class HdStMesh extends HdMesh {
  // mesh.h:313-319 enum DrawingCoord.
  static readonly HullTopology = HdDrawingCoord.CustomSlotsBegin
  static readonly PointsTopology = HdDrawingCoord.CustomSlotsBegin + 1
  // If the mesh topology has geom subsets, we might place them here as geom
  // subsets are processed before instance primvars. The instance primvars
  // will follow after. If there are no geom subsets, instance primvars start
  // here.
  static readonly FreeSlot = HdDrawingCoord.CustomSlotsBegin + 2

  // mesh.h:321-327 enum DirtyBits.
  static readonly DirtySmoothNormals = HdChangeTracker.CustomBitsBegin
  static readonly DirtyFlatNormals = HdStMesh.DirtySmoothNormals << 1
  static readonly DirtyIndices = HdStMesh.DirtyFlatNormals << 1
  static readonly DirtyHullIndices = HdStMesh.DirtyIndices << 1
  static readonly DirtyPointsIndices = HdStMesh.DirtyHullIndices << 1

  private _topology: HdSt_MeshTopology | null = null
  private _vertexAdjacencyBuilder: HdSt_VertexAdjacencyBuilder | null = null

  private _topologyId = 0n
  private _vertexPrimvarId = 0n
  private _customDirtyBitsInUse: HdDirtyBits = 0

  private _pointsDataType: HdType = HdType.HdTypeInvalid
  private _sceneNormalsInterpolation: HdInterpolation = HdInterpolation.HdInterpolationConstant
  private _cullStyle: HdCullStyle = HdCullStyle.HdCullStyleDontCare
  private _hasMirroredTransform = false
  private _doubleSided = false
  private _flatShadingEnabled = false
  private _displacementEnabled = true
  private _limitNormals = false
  private _sceneNormalsFromPrimvars = false
  private _sceneNormalsFromInstancer = false
  // The prim's topology has changed since the prim was created
  private _hasVaryingTopology = false
  private _displayOpacityFromPrimvars = false
  private _displayOpacityFromInstancer = false
  private _displayInOverlay = false
  private _occludedSelectionShowsThrough = false
  private _pointsShadingEnabled = false

  private _fvarTopologyTracker = new HdStMesh_FvarTopologyTracker()

  /** mesh.cpp:79-105 */
  constructor(id: string) {
    super(id)
  }

  /** mesh.cpp:109-114 */
  override updateRenderTag(delegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined): void {
    HdStUpdateRenderTag(delegate, renderParam, this,
      (d, r) => super.updateRenderTag(d, r))
  }

  /** mesh.cpp:116-182 */
  override sync(
    delegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBitsOrRepr: HdDirtyBitsRef | string,
    reprTokenArg?: string,
  ): void {
    const delegate = delegateOrPrim as HdSceneDelegate
    const renderParam = renderParamOrBits as HdRenderParam | null | undefined
    const dirtyBits = dirtyBitsOrRepr as HdDirtyBitsRef
    const reprToken = reprTokenArg!

    this._updateVisibility(delegate, dirtyBits)

    let updateMaterialTags = false
    if (dirtyBits.value & HdChangeTracker.DirtyMaterialId) {
      HdStSetMaterialId(delegate, renderParam, this)
      updateMaterialTags = true
    }
    if (dirtyBits.value & (HdChangeTracker.DirtyDisplayStyle |
      HdChangeTracker.NewRepr)) {
      updateMaterialTags = true
    }

    // Check if either the material or geometric shaders need updating for
    // draw items of all the reprs.
    let updateMaterialNetworkShader = false
    if (dirtyBits.value & (HdChangeTracker.DirtyMaterialId |
      HdChangeTracker.NewRepr)) {
      updateMaterialNetworkShader = true
    }

    let updateGeometricShader = false
    if (dirtyBits.value & (HdChangeTracker.DirtyDisplayStyle |
      HdChangeTracker.DirtyCullStyle |
      HdChangeTracker.DirtyDoubleSided |
      HdChangeTracker.DirtyMaterialId |
      HdChangeTracker.DirtyTopology | // topological visibility
      HdChangeTracker.DirtyInstancer |
      HdChangeTracker.NewRepr)) {
      updateGeometricShader = true
    }

    const displayOpacity =
      (this._displayOpacityFromPrimvars || this._displayOpacityFromInstancer)
    const hasMirroredTransform = this._hasMirroredTransform
    this._updateRepr(delegate, renderParam, reprToken, dirtyBits)

    if (hasMirroredTransform !== this._hasMirroredTransform) {
      updateGeometricShader = true
    }

    if (updateMaterialTags ||
      (this.getMaterialId() === '' &&
        displayOpacity !== (this._displayOpacityFromPrimvars ||
          this._displayOpacityFromInstancer))) {
      this._updateMaterialTagsForAllReprs(delegate, renderParam)
    }

    if (updateMaterialNetworkShader || updateGeometricShader) {
      this._updateShadersForAllReprs(delegate,
        renderParam,
        updateMaterialNetworkShader,
        updateGeometricShader)
    }

    // This clears all the non-custom dirty bits. This ensures that the rprim
    // doesn't have pending dirty bits that add it to the dirty list every
    // frame.
    // XXX: GetInitialDirtyBitsMask sets certain dirty bits that aren't
    // reset (e.g. DirtyExtent, DirtyPrimID) that make this necessary.
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits
  }

  /** The members' shared_ptr assignments (FAITHFULNESS-DEBT(
   *  hd-instance-use-count), hd/src/instanceRegistry.ts). */
  private _setTopology(topology: HdSt_MeshTopology | null): void {
    if (this._topology === topology) return
    topology?._retain()
    this._topology?.release()
    this._topology = topology
  }

  private _setVertexAdjacencyBuilder(builder: HdSt_VertexAdjacencyBuilder | null): void {
    if (this._vertexAdjacencyBuilder === builder) return
    builder?._retain()
    this._vertexAdjacencyBuilder?.release()
    this._vertexAdjacencyBuilder = builder
  }

  /** The destructor (mesh.cpp:107 ~HdStMesh): drops _topology and
   *  _vertexAdjacencyBuilder, then HdRprim's members. */
  override destroy(): void {
    this._setTopology(null)
    this._setVertexAdjacencyBuilder(null)
    super.destroy()
  }

  /** mesh.cpp:184-233 */
  override finalize(renderParam: HdRenderParam | null | undefined): void {
    HdStMarkGarbageCollectionNeeded(renderParam)

    const stRenderParam = renderParam as unknown as HdStRenderParam

    // Decrement material tag counts for each draw item material tag
    for (const reprPair of this._reprs) {
      const reprToken = reprPair[0]
      const descs = HdStMesh._getReprDesc(reprToken)
      const repr = reprPair[1]
      let drawItemIndex = 0
      let geomSubsetDescIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
          continue
        }

        {
          const drawItem = repr.getDrawItem(drawItemIndex++) as HdStDrawItem
          stRenderParam.decreaseMaterialTagCount(
            drawItem.getMaterialTag() as TfToken)
        }

        if (descs[descIdx]!.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
          continue
        }

        const geomSubsets = this._topology!.getGeomSubsets()
        const numGeomSubsets = geomSubsets.length
        for (let i = 0; i < numGeomSubsets; ++i) {
          const drawItem = repr.getDrawItemForGeomSubset(
            geomSubsetDescIndex, numGeomSubsets, i) as HdStDrawItem | null
          if (!TF_VERIFY(drawItem)) {
            continue
          }
          stRenderParam.decreaseMaterialTagCount(
            drawItem!.getMaterialTag() as TfToken)
        }
        geomSubsetDescIndex++
      }
    }

    stRenderParam.decreaseRenderTagCount(this.getRenderTag())
  }

  /** mesh.cpp:235-239. Topology (member) getter */
  override GetTopology(): HdMeshTopology | null {
    return this._topology
  }

  /** mesh.cpp:248-254. Returns whether packed (10_10_10 bits) normals to be
   *  used */
  static isEnabledPackedNormals(): boolean {
    return TfGetEnvSetting(HD_ENABLE_PACKED_NORMALS) === 1
  }

  /** mesh.cpp:256-266 */
  protected _getRefineLevelForDesc(desc: HdMeshReprDesc): number {
    if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHull ||
      desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnly ||
      desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnSurf) {
      return 0
    }
    if (!TF_VERIFY(this._topology)) return 0
    return this._topology!.getRefineLevel()
  }

  /** mesh.cpp:268-345 */
  protected _gatherFaceVaryingTopologies(
    sceneDelegate: HdSceneDelegate,
    repr: HdRepr,
    desc: HdMeshReprDesc,
    drawItem: HdStDrawItem,
    geomSubsetDescIndex: number,
    dirtyBits: HdDirtyBitsRef,
    id: string,
    topology: HdSt_MeshTopology,
  ): void {
    const primvars =
      HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationFaceVarying, repr, desc.geomStyle,
        geomSubsetDescIndex, topology.getGeomSubsets().length)

    if (primvars.length !== 0) {
      for (const primvar of primvars) {
        if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name)) {
          continue
        }
        const numFaceVaryings = topology.getNumFaceVaryings()

        let value: VtValue
        let indices: number[] = []
        if (primvar.indexed) {
          const outIndices = { value: [] as number[] }
          value = this.getIndexedPrimvar(
            sceneDelegate, primvar.name, outIndices)
          indices = outIndices.value

          if (indices.length === 0) {
            HF_VALIDATION_WARN(id,
              'Found empty indices for indexed face-varying primvar ' +
              `${primvar.name}. Skipping indices update.`)
            continue
          } else if (indices.length < numFaceVaryings) {
            HF_VALIDATION_WARN(id,
              `Indices for face-varying primvar ${primvar.name} has only ` +
              `${indices.length} elements, while its topology expects at least ` +
              `${numFaceVaryings} elements. Skipping indices update.`)
            continue
          }
        } else {
          value = this.getPrimvar(sceneDelegate, primvar.name)
          if (!HdStIsPrimvarValidForDrawItem(
            drawItem, primvar.name, value)) {
            continue
          }
          for (let i = 0; i < numFaceVaryings; ++i) {
            indices.push(i)
          }
        }

        this._fvarTopologyTracker.addOrUpdateTopology(primvar.name, indices)
      }
    }

    // Also check for removed primvars
    let removedSpecs: HdBufferSpec[] = []
    if (dirtyBits.value & HdChangeTracker.DirtyPrimvar) {
      const bar = drawItem.getFaceVaryingPrimvarRange()
      const internallyGeneratedPrimvars: TfToken[] = [] // empty
      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, primvars,
        internallyGeneratedPrimvars, id)
    }

    for (let i = 0; i < removedSpecs.length; ++i) {
      const removedName = removedSpecs[i]!.name as TfToken
      this._fvarTopologyTracker.removePrimvar(removedName)
    }

    this._fvarTopologyTracker.removeUnusedTopologies()
  }

  /** mesh.cpp:347-518 */
  protected _updateDrawItemsForGeomSubsets(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    reprToken: TfToken | string,
    repr: HdRepr,
    geomSubsets: readonly HdGeomSubset[],
    oldNumGeomSubsets: number,
  ): void {
    const changeTracker =
      sceneDelegate.getRenderIndex().getChangeTracker()

    const numGeomSubsets = geomSubsets.length
    const newInstancePvIndex = HdStMesh.FreeSlot + 2 * numGeomSubsets

    if (numGeomSubsets !== oldNumGeomSubsets) {
      // Shift the instance primvars if necessary
      if (drawItem.hasInstancer()) {
        const numInstanceLevels =
          drawItem.getInstancePrimvarNumLevels()
        if (numGeomSubsets < oldNumGeomSubsets) {
          // less geom susbets than before
          // move instance primvar levels toward start
          for (let i = 0; i < numInstanceLevels; ++i) {
            const instancePvRange =
              drawItem.getInstancePrimvarRange(i)
            HdStUpdateDrawItemBAR(
              instancePvRange,
              newInstancePvIndex + i,
              this._rprimSharedData,
              renderParam,
              changeTracker)
          }
        } else {
          // more geom subsets than before
          // move instance primvar levels toward end
          for (let i = numInstanceLevels - 1; i >= 0; --i) {
            const instancePvRange =
              drawItem.getInstancePrimvarRange(i)
            HdStUpdateDrawItemBAR(
              instancePvRange,
              newInstancePvIndex + i,
              this._rprimSharedData,
              renderParam,
              changeTracker)
          }
        }
      }

      // (Re)create geom subset draw items
      for (const reprPair of this._reprs) {
        const descs = HdStMesh._getReprDesc(reprPair[0])
        const currRepr = reprPair[1]

        // Clear all previous geom subset draw items.
        currRepr.clearGeomSubsetDrawItems()

        if (oldNumGeomSubsets !== 0) {
          // Adjust material tag count for removed geom subset draw items.
          const stRenderParam = renderParam as unknown as HdStRenderParam
          let geomSubsetDescIndex = 0
          for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
            const desc = descs[descIdx]!
            if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid ||
              desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
              continue
            }

            for (let i = 0; i < oldNumGeomSubsets; ++i) {
              const subsetDrawItem = currRepr.getDrawItemForGeomSubset(
                geomSubsetDescIndex, oldNumGeomSubsets, i) as HdStDrawItem | null
              if (!TF_VERIFY(subsetDrawItem)) {
                continue
              }
              stRenderParam.decreaseMaterialTagCount(
                subsetDrawItem!.getMaterialTag() as TfToken)
            }
            geomSubsetDescIndex++
          }
          // Clear all previous geom subset draw items.
          currRepr.clearGeomSubsetDrawItems()
        }

        let mainDrawItemIndex = 0
        for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
          const desc = descs[descIdx]!
          if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
            continue
          }

          // Update main draw item's instance primvar drawing coord
          const mainDrawItem = currRepr.getDrawItem(mainDrawItemIndex++) as HdStDrawItem
          mainDrawItem.getDrawingCoord().setInstancePrimvarBaseIndex(
            newInstancePvIndex)

          // Don't create geom subset draw items for points geom styles
          if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
            continue
          }

          for (let i = 0; i < numGeomSubsets; ++i) {
            const geomSubset = geomSubsets[i]!

            const subsetDrawItem = new HdStDrawItem(this._rprimSharedData)
            subsetDrawItem.setMaterialNetworkShader(
              HdStGetMaterialNetworkShader(
                this, sceneDelegate, geomSubset.materialId))

            // Each of the geom subset draw items need to have a unique
            // topology drawing coord
            const drawingCoord = subsetDrawItem.getDrawingCoord()
            switch (desc.geomStyle) {
              case HdMeshGeomStyle.HdMeshGeomStyleHull:
              case HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnly:
              case HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnSurf:
              {
                drawingCoord.setTopologyIndex(
                  HdStMesh.FreeSlot + 2 * i + 1)
                break
              }
              default:
              {
                drawingCoord.setTopologyIndex(
                  HdStMesh.FreeSlot + 2 * i)
                break
              }
            }
            drawingCoord.setInstancePrimvarBaseIndex(
              newInstancePvIndex)
            currRepr.addGeomSubsetDrawItem(subsetDrawItem)
          }
        }
      }

      // When geom subsets are added or removed, the rprim index version
      // number will be incremented via another mechanism. The below dirtying
      // is relevant when the number of geom subsets requiring draw items
      // changes due to another reason e.g. a geom subset had its material id
      // removed or its indices removed. We expect such cases to be rare.
      HdStMarkGeomSubsetDrawItemsDirty(renderParam)
    } else {
      // If number of geom subsets requiring draw items is the same, but geom
      // subsets have changed, we might need to update their material shaders.
      const descs = HdStMesh._getReprDesc(reprToken)
      let geomSubsetDescIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        const desc = descs[descIdx]!
        if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid ||
          desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
          continue
        }

        for (let i = 0; i < numGeomSubsets; ++i) {
          const geomSubset = geomSubsets[i]!
          const subsetDrawItem = repr.getDrawItemForGeomSubset(
            geomSubsetDescIndex, numGeomSubsets, i) as HdStDrawItem | null
          if (!TF_VERIFY(subsetDrawItem)) {
            continue
          }
          subsetDrawItem!.setMaterialNetworkShader(
            HdStGetMaterialNetworkShader(
              this, sceneDelegate, geomSubset.materialId))
        }
        geomSubsetDescIndex++
      }
    }
  }

  /** mesh.cpp:520-980 */
  protected _populateTopology(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
    reprToken: TfToken | string,
    repr: HdRepr,
    desc: HdMeshReprDesc,
    geomSubsetDescIndex: number,
  ): void {
    const id = this.getId()
    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())
    const changeTracker =
      sceneDelegate.getRenderIndex().getChangeTracker()

    // note: there's a potential optimization if _topology is already registered
    // and it's not shared across prims, it can be updated without inserting new
    // entry into the topology registry. But in mose case topology varying prim
    // requires range resizing (reallocation), so for code simplicity we always
    // register as a new topology (it still can be shared if possible) and
    // allocate a new range for varying topology (= dirty topology)
    // for the time being. In other words, each range of index buffer is
    // immutable.
    //
    const dirtyTopology = HdChangeTracker.isTopologyDirty(dirtyBits.value, id)

    // A copy: the tracker mutates its vector in place.
    const oldFvarTopologies: HdStMeshTopologyToPrimvarVector =
      this._fvarTopologyTracker.getTopologyToPrimvarVector().map(
        ([topo, pvs]) => [topo, [...pvs]])

    if (dirtyTopology ||
      HdChangeTracker.isDisplayStyleDirty(dirtyBits.value, id) ||
      HdChangeTracker.isSubdivTagsDirty(dirtyBits.value, id) ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      // make a shallow copy and the same time expand the topology to a
      // stream extended representation
      // note: if we add topologyId computation in delegate,
      // we can move this copy into topologyInstance.IsFirstInstance() block
      const displayStyle = this.getDisplayStyle(sceneDelegate)

      let refineLevel = displayStyle.refineLevel
      let refineMode = HdSt_MeshTopologyRefineMode.RefineModeUniform
      this._limitNormals = false

      this._flatShadingEnabled = displayStyle.flatShadingEnabled
      this._displacementEnabled = displayStyle.displacementEnabled
      this._displayInOverlay = displayStyle.displayInOverlay
      this._occludedSelectionShowsThrough =
        displayStyle.occludedSelectionShowsThrough
      this._pointsShadingEnabled = displayStyle.pointsShadingEnabled

      const meshTopology = this.getMeshTopology(sceneDelegate)

      // Topological visibility (of points, faces) comes in as DirtyTopology.
      // We encode this information in a separate BAR.
      if (dirtyTopology) {
        HdStProcessTopologyVisibility(
          meshTopology.getInvisibleFaces(),
          meshTopology.getNumFaces(),
          meshTopology.getInvisiblePoints(),
          meshTopology.getNumPoints(),
          this._rprimSharedData,
          drawItem,
          renderParam,
          changeTracker,
          resourceRegistry,
          id)
      }

      // If flat shading is enabled for this prim, make sure we're computing
      // flat normals. It's ok to set the dirty bit here because it's a
      // custom (non-scene) dirty bit, and DirtyTopology will propagate to
      // DirtyPoints if we're computing CPU normals (since flat normals
      // computation requires points data).
      if (this._flatShadingEnabled) {
        if (!(this._customDirtyBitsInUse & HdStMesh.DirtyFlatNormals)) {
          this._customDirtyBitsInUse |= HdStMesh.DirtyFlatNormals
          dirtyBits.value |= HdStMesh.DirtyFlatNormals
        }
      }

      // If the topology requires none subdivision scheme then force
      // refinement level to be 0 since we do not want subdivision.
      if (meshTopology.getScheme() === PxOsdOpenSubdivTokens.none) {
        refineLevel = 0
      }

      // If the topology is loop, and subdivision has been requested, validate
      // that all the faces are triangular. If not, force the refinement level
      // back to 0 (since asking PxOsd to loop-subdivide a non-triangular mesh
      // is unsupported and may crash).
      if (meshTopology.getScheme() === PxOsdOpenSubdivTokens.loop &&
        refineLevel > 0) {
        if (meshTopology.getFaceVertexCounts().some((x) => x !== 3)) {
          HF_VALIDATION_WARN(id, 'Cannot apply loop subdivision due to ' +
            'non-triangular faces')
          refineLevel = 0
        }
      }

      // If the topology supports adaptive refinement and that's what this
      // prim wants, note that and also that our normals will be generated
      // in the shader.
      if (meshTopology.getScheme() !== PxOsdOpenSubdivTokens.bilinear &&
        meshTopology.getScheme() !== PxOsdOpenSubdivTokens.none &&
        refineLevel > 0 &&
        this._useLimitRefinement(sceneDelegate.getRenderIndex(), meshTopology)) {
        refineMode = HdSt_MeshTopologyRefineMode.RefineModePatches
        this._limitNormals = true
      }

      const capabilities = resourceRegistry.getHgi().getCapabilities()!
      const hasBuiltinBarycentrics = capabilities.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics)

      const hasMetalTessellation = capabilities.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation)

      const topology =
        HdSt_MeshTopology.new(meshTopology, refineLevel, refineMode,
          (hasBuiltinBarycentrics || hasMetalTessellation)
            ? HdSt_MeshTopology.QuadsTriangulated
            : HdSt_MeshTopology.QuadsUntriangulated)

      // Gather and sanitize geom subsets
      const oldGeomSubsets = this._topology ?
        this._topology.getGeomSubsets() : []
      const geomSubsets = topology.getGeomSubsets()
      // This will handle draw item creation/update for all existing reprs.
      if (!_GeomSubsetsEqual(geomSubsets, oldGeomSubsets)) {
        this._updateDrawItemsForGeomSubsets(sceneDelegate, renderParam, drawItem,
          reprToken, repr, geomSubsets, oldGeomSubsets.length)
      }

      if (refineLevel > 0) {
        // add subdiv tags before compute hash
        topology.setSubdivTags(this.getSubdivTags(sceneDelegate))
      }

      const fvarLinearInterpRule =
        topology.getSubdivTags().getFaceVaryingInterpolationRule()

      if ((refineLevel > 0) &&
        (fvarLinearInterpRule !== PxOsdOpenSubdivTokens.all) &&
        ((dirtyBits.value & HdChangeTracker.DirtyWidths) ||
          (dirtyBits.value & HdChangeTracker.DirtyNormals) ||
          (dirtyBits.value & HdChangeTracker.DirtyPrimvar))) {
        this._gatherFaceVaryingTopologies(
          sceneDelegate, repr, desc, drawItem, geomSubsetDescIndex,
          dirtyBits, id, topology)
        topology.setFvarTopologies(
          this._fvarTopologyTracker.getFvarTopologies())
        this._rprimSharedData.fvarTopologyToPrimvarVector =
          this._fvarTopologyTracker.getTopologyToPrimvarVector()
      }

      // Compute id here. In the future delegate can provide id directly
      // without hashing.
      this._topologyId = BigInt(topology.computeHash())

      // Salt the hash with face-varying topologies
      for (const it of this._fvarTopologyTracker.getTopologyToPrimvarVector()) {
        const topoBytes = _IntArrayBytes(it[0])
        this._topologyId = ArchHash64(topoBytes, topoBytes.length,
          this._topologyId)
        for (const it2 of it[1]) {
          const tokenBytes = _TokenBytes(it2)
          this._topologyId = ArchHash64(tokenBytes, tokenBytes.length,
            this._topologyId)
        }
      }

      // Salt the hash with refinement level and useQuadIndices.
      // (refinement level is moved into HdMeshTopology)
      //
      // Specifically for quad indices, we could do better here because all we
      // really need is the ability to compute quad indices late, however
      // splitting the topology shouldn't be a huge cost either.
      const useQuadIndices = this._useQuadIndices(sceneDelegate.getRenderIndex(), topology)
      this._topologyId = ArchHash64(_BoolBytes(useQuadIndices), 1, this._topologyId)

      {
        // ask registry if there's a sharable mesh topology
        const topologyInstance =
          resourceRegistry.registerMeshTopology(this._topologyId)

        if (topologyInstance.isFirstInstance()) {
          // if this is the first instance, set this topology to registry.
          topologyInstance.setValue(topology)

          // if refined, we submit a subdivision preprocessing
          // no matter what desc says
          // (see the lengthy comment in PopulateVertexPrimvar)
          if (refineLevel > 0) {
            // OpenSubdiv preprocessing
            const topologySource = topology.getOsdTopologyComputation(_Path(id))
            resourceRegistry.addSource(topologySource)
          }

          // we also need quadinfo if requested.
          // Note that this is needed even if refineLevel > 0, in case
          // HdMeshGeomStyleHull is going to be used.
          if (useQuadIndices) {
            // Quadrangulate preprocessing
            const quadInfoBuilder =
              topology.getQuadInfoBuilderComputation(
                /*GPU*/ true, _Path(id), resourceRegistry)
            resourceRegistry.addSource(quadInfoBuilder)
          }
        }
        this._setTopology(topologyInstance.GetValue() as HdSt_MeshTopology | null)
      }
      TF_VERIFY(this._topology)

      // hash collision check
      if (TfDebug.isEnabled(HdDebugCodes.HD_SAFE_MODE)) {
        TF_VERIFY(topology.Equals(this._topology!))
      }

      this._setVertexAdjacencyBuilder(null)
    }

    // here, we have _topology up-to-date.
    const topology = this._topology!

    const refineLevelForDesc = this._getRefineLevelForDesc(desc)
    let indexToken: TfToken  // bar-instance identifier

    // It's possible for topology to not be dirty but a face-varying topology is
    const canSkipFvarTopologyComp = (refineLevelForDesc === 0) ||
      (topology.getSubdivTags().getFaceVaryingInterpolationRule() ===
        PxOsdOpenSubdivTokens.all) ||
      (!HdChangeTracker.isDisplayStyleDirty(dirtyBits.value, id) &&
        _TopologyToPrimvarVectorsEqual(oldFvarTopologies,
          this._fvarTopologyTracker.getTopologyToPrimvarVector()))

    // bail out if the index bar is already synced
    if (drawItem.getDrawingCoord().getTopologyIndex() ===
      HdStMesh.HullTopology) {
      if ((dirtyBits.value & HdStMesh.DirtyHullIndices) === 0 && canSkipFvarTopologyComp) {
        return
      }
      dirtyBits.value &= ~HdStMesh.DirtyHullIndices
      indexToken = HdTokens.hullIndices as TfToken
    } else if (drawItem.getDrawingCoord().getTopologyIndex() ===
      HdStMesh.PointsTopology) {
      if ((dirtyBits.value & HdStMesh.DirtyPointsIndices) === 0 && canSkipFvarTopologyComp) {
        return
      }
      dirtyBits.value &= ~HdStMesh.DirtyPointsIndices
      indexToken = HdTokens.pointsIndices as TfToken
    } else {
      if ((dirtyBits.value & HdStMesh.DirtyIndices) === 0 && canSkipFvarTopologyComp) {
        return
      }
      dirtyBits.value &= ~HdStMesh.DirtyIndices
      indexToken = HdTokens.indices as TfToken
    }

    // note: don't early out even if the topology has no faces,
    // otherwise codegen takes inconsistent configuration and
    // fails to compile ( or even segfaults: filed as nvidia-bug 1719609 )

    {
      const geomSubsets = topology.getGeomSubsets()

      // Normal case
      if (geomSubsets.length === 0 || desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
        // Set up the usage hints to mark topology as varying if
        // there is a previously set range
        let usageHint: HdBufferArrayUsageHint =
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex |
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
        if (drawItem.getTopologyRange()) {
          usageHint |= HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsSizeVarying
        }

        // ask again registry if there's a shareable buffer range for the topology
        let rangeId = this._topologyId
        rangeId = ArchHash64(_Uint32Bytes(usageHint), 4, rangeId)
        const rangeInstance =
          resourceRegistry.registerMeshIndexRange(rangeId, indexToken)

        if (rangeInstance.isFirstInstance()) {
          // if not exists, update actual topology buffer to range.
          // Allocate new one if necessary.
          const sources: HdBufferSource[] = []
          let source: HdBufferSource | null

          if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
            // create coarse points indices
            source = topology.getPointsIndexBuilderComputation()
            sources.push(source)
          } else if (refineLevelForDesc > 0) {
            // create refined indices, primitiveParam and edgeIndices
            source = topology.getOsdIndexBuilderComputation()
            _PushSource(sources, source)

            // Add face-varying indices and patch params to topology BAR if
            // necessary
            if (topology.getSubdivTags().getFaceVaryingInterpolationRule() !==
              PxOsdOpenSubdivTokens.all) {
              for (let i = 0;
                i < this._fvarTopologyTracker.getNumTopologies();
                ++i) {
                const fvarIndicesSource =
                  topology.getOsdFvarIndexBuilderComputation(i)
                _PushSource(sources, fvarIndicesSource)
              }
            }
          } else if (this._useQuadIndices(sceneDelegate.getRenderIndex(), topology)) {
            // not refined = quadrangulate
            // create quad indices, primitiveParam and edgeIndices
            source = topology.getQuadIndexBuilderComputation(_Path(this.getId()))
            sources.push(source)
          } else {
            // create triangle indices, primitiveParam and edgeIndices
            source = topology.getTriangleIndexBuilderComputation(_Path(this.getId()))
            sources.push(source)
          }

          // initialize buffer array
          //   * indices
          //   * primitiveParam
          //   * fvarIndices (optional)
          //   * fvarPatchParam (optional)
          const bufferSpecs: HdBufferSpec[] = []
          HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

          // allocate new range
          const range =
            resourceRegistry.allocateNonUniformBufferArrayRange(
              HdTokens.topology, bufferSpecs, usageHint)

          // add sources to update queue
          resourceRegistry.addSources(range, sources)

          // save new range to registry
          rangeInstance.setValue(range!)
        }

        // If we are updating an existing topology, notify downstream
        // systems of the change
        const orgRange = drawItem.getTopologyRange()
        const newRange = rangeInstance.GetValue()

        if (HdStIsValidBAR(orgRange) && (newRange !== orgRange)) {
          TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, `${id} has varying topology` +
            ` (topology index = ${drawItem.getDrawingCoord().getTopologyIndex()}).\n`)

          // Setup a flag to say this mesh's topology is varying
          this._hasVaryingTopology = true
        }

        HdStUpdateDrawItemBAR(
          newRange,
          drawItem.getDrawingCoord().getTopologyIndex(),
          this._rprimSharedData,
          renderParam,
          changeTracker)
      } else {
        // Geom subsets case
        let indicesSource: HdBufferSource | null = null
        let fvarIndicesSource: HdBufferSource | null = null

        let refined = false
        let quadrangulated = false
        if (refineLevelForDesc > 0) {
          // create refined indices, primitiveParam and edgeIndices
          indicesSource = topology.getOsdIndexBuilderComputation()
          resourceRegistry.addSource(indicesSource)
          // Add face-varying indices and patch params to topology BAR if
          // necessary
          if (topology.getSubdivTags().getFaceVaryingInterpolationRule() !==
            PxOsdOpenSubdivTokens.all) {
            for (let i = 0;
              i < this._fvarTopologyTracker.getNumTopologies();
              ++i) {
              fvarIndicesSource =
                topology.getOsdFvarIndexBuilderComputation(i)
              resourceRegistry.addSource(fvarIndicesSource)
            }
          }

          refined = true
          if (topology.getScheme() === PxOsdOpenSubdivTokens.catmullClark ||
            topology.getScheme() === PxOsdOpenSubdivTokens.bilinear) {
            quadrangulated = true
          }
        } else if (this._useQuadIndices(sceneDelegate.getRenderIndex(), topology)) {
          // not refined = quadrangulate
          // create quad indices, primitiveParam and edgeIndices
          indicesSource = topology.getQuadIndexBuilderComputation(_Path(this.getId()))
          resourceRegistry.addSource(indicesSource)
          quadrangulated = true
        } else {
          // create triangle indices, primitiveParam and edgeIndices
          indicesSource = topology.getTriangleIndexBuilderComputation(_Path(this.getId()))
          resourceRegistry.addSource(indicesSource)
        }

        // If the mesh has been triangulated, quadrangulated, or refined (as
        // refined indices are first triangulated or quadrangulated), we
        // need to transform the subset's authored face indices, which are
        // given in reference to the base faces of the mesh, to the indices
        // of the triangulated/quadrangulated faces. These buffer source
        // computations help us do that.
        const geomSubsetFaceIndicesHelperSource =
          topology.getGeomSubsetFaceIndexHelperComputation(
            refined, quadrangulated)
        resourceRegistry.addSource(geomSubsetFaceIndicesHelperSource)

        if (refined) {
          topology.getOsdBaseFaceToRefinedFacesMapComputation(
            resourceRegistry)
        }

        // For original draw item
        const nonSubsetFaces = topology.getNonSubsetFaces()
        this._createTopologyRangeForGeomSubset(resourceRegistry, changeTracker,
          renderParam, drawItem, indexToken, indicesSource,
          fvarIndicesSource, geomSubsetFaceIndicesHelperSource,
          [...(nonSubsetFaces ?? [])],
          refined)

        // For geom subsets draw items
        const numGeomSubsets = geomSubsets.length
        for (let i = 0; i < geomSubsets.length; ++i) {
          const geomSubset = geomSubsets[i]!
          const subsetDrawItem = repr.getDrawItemForGeomSubset(
            geomSubsetDescIndex, numGeomSubsets, i) as HdStDrawItem
          this._createTopologyRangeForGeomSubset(resourceRegistry,
            changeTracker, renderParam, subsetDrawItem, indexToken,
            indicesSource, fvarIndicesSource,
            geomSubsetFaceIndicesHelperSource, geomSubset.indices,
            refined)
        }
      }
    } // Release regLock
  }

  /** mesh.cpp:982-1087 */
  protected _createTopologyRangeForGeomSubset(
    resourceRegistry: HdStResourceRegistry,
    changeTracker: ReturnType<HdRenderIndex['getChangeTracker']>,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    indexToken: TfToken,
    indicesSource: HdBufferSource | null,
    fvarIndicesSource: HdBufferSource | null,
    geomSubsetFaceIndicesHelperSource: HdBufferSource | null,
    faceIndices: readonly number[],
    refined: boolean,
  ): void {
    const faceIndexBytes = _IntArrayBytes(faceIndices)
    const subsetTopologyId = ArchHash64(
      faceIndexBytes, faceIndexBytes.length, this._topologyId)

    // Set up the usage hints to mark topology as varying if there is a
    // previously set range
    let usageHint: HdBufferArrayUsageHint =
      HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex |
      HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
    if (drawItem.getTopologyRange()) {
      usageHint |= HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsSizeVarying
    }

    // ask registry if there's a shareable buffer range for the topology
    let rangeId = subsetTopologyId
    rangeId = ArchHash64(_Uint32Bytes(usageHint), 4, rangeId)
    const rangeInstance =
      resourceRegistry.registerMeshIndexRange(rangeId, indexToken)

    if (rangeInstance.isFirstInstance()) {
      // if not exists, update actual topology buffer to range.
      // Allocate new one if necessary.
      const sources: HdBufferSource[] = []
      const topology = this._topology!

      const geomSubsetFaceIndicesSource =
        topology.getGeomSubsetFaceIndexBuilderComputation(
          geomSubsetFaceIndicesHelperSource!, [...faceIndices])

      if (refined) {
        resourceRegistry.addSource(geomSubsetFaceIndicesSource)

        const subsetSource =
          topology.getRefinedIndexSubsetComputation(
            indicesSource!, geomSubsetFaceIndicesSource)
        _PushSource(sources, subsetSource)

        if (fvarIndicesSource) {
          const fvarSubsetSource =
            topology.getRefinedIndexSubsetComputation(
              fvarIndicesSource, geomSubsetFaceIndicesSource)
          _PushSource(sources, fvarSubsetSource)
        }
      } else {
        const subsetSource =
          topology.getIndexSubsetComputation(
            indicesSource!, geomSubsetFaceIndicesSource)
        _PushSource(sources, subsetSource)

        // This source also becomes the face index for coarse
        // triangles/quads (instead of gl_PrimitiveId).
        sources.push(geomSubsetFaceIndicesSource)
      }

      // initialize buffer array
      //   * indices
      //   * primitiveParam
      //   * fvarIndices (optional)
      //   * fvarPatchParam (optional)
      const bufferSpecs: HdBufferSpec[] = []
      HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

      // allocate new range
      const range =
        resourceRegistry.allocateNonUniformBufferArrayRange(
          HdTokens.topology, bufferSpecs, usageHint)

      // add sources to update queue
      resourceRegistry.addSources(range, sources)

      // save new range to registry
      rangeInstance.setValue(range!)
    }

    // If we are updating an existing topology, notify downstream systems of the
    // change
    const orgRange = drawItem.getTopologyRange()
    const newRange = rangeInstance.GetValue()

    if (HdStIsValidBAR(orgRange) && (newRange !== orgRange)) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, `${this.getId()} has varying topology` +
        ` (topology index = ${drawItem.getDrawingCoord().getTopologyIndex()}).\n`)

      // Setup a flag to say this mesh's topology is varying
      this._hasVaryingTopology = true
    }

    HdStUpdateDrawItemBAR(
      newRange,
      drawItem.getDrawingCoord().getTopologyIndex(),
      this._rprimSharedData,
      renderParam,
      changeTracker)
  }

  /** mesh.cpp:1089-1136 */
  protected _populateAdjacency(resourceRegistry: HdStResourceRegistry): void {
    // The topology may be null in the event that it has zero faces.
    if (!this._topology) return

    // ask registry if there's a sharable vertex adjacency
    const vertexAdjacencyBuilderInstance =
      resourceRegistry.registerVertexAdjacencyBuilder(this._topologyId)

    if (vertexAdjacencyBuilderInstance.isFirstInstance()) {
      const vertexAdjacencyBuilder = new HdSt_VertexAdjacencyBuilder()

      // create adjacency table for smooth normals
      const vertexAdjacencyComputation =
        vertexAdjacencyBuilder.getSharedVertexAdjacencyBuilderComputation(this._topology)

      resourceRegistry.addSource(vertexAdjacencyComputation)

      // also send adjacency table to gpu
      const vertexAdjacencyBufferSource =
        new HdSt_VertexAdjacencyBufferSource(
          vertexAdjacencyBuilder.getVertexAdjacency(),
          vertexAdjacencyComputation!)

      const bufferSpecs = vertexAdjacencyBufferSource.getBufferSpecs()

      const vertexAdjacencyRange =
        resourceRegistry.allocateNonUniformBufferArrayRange(
          HdTokens.topology, bufferSpecs,
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

      vertexAdjacencyBuilder.setVertexAdjacencyRange(vertexAdjacencyRange)
      resourceRegistry.addSource(vertexAdjacencyRange,
        vertexAdjacencyBufferSource)

      vertexAdjacencyBuilderInstance.setValue(vertexAdjacencyBuilder)
    }
    this._setVertexAdjacencyBuilder(vertexAdjacencyBuilderInstance.GetValue())
  }

  /** mesh.cpp:1279-1994 */
  protected _populateVertexPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    repr: HdRepr,
    desc: HdMeshReprDesc,
    drawItem: HdStDrawItem,
    geomSubsetDescIndex: number,
    dirtyBits: HdDirtyBitsRef,
    requireSmoothNormals: boolean,
  ): void {
    const id = this.getId()
    const renderIndex = sceneDelegate.getRenderIndex()

    const resourceRegistry = _GetResourceRegistry(renderIndex)

    let sources: HdBufferSource[] = []
    const reserveOnlySources: HdBufferSource[] = []
    const separateComputationSources: HdBufferSource[] = []
    let computations: HdStComputationComputeQueuePairVector = []
    const numPoints = this._topology ? this._topology.getNumPoints() : 0

    // Don't call _GetRefineLevelForDesc(desc) instead of GetRefineLevel(). Why?
    //
    // We share the vertex BAR from both refined and hull topologies so that
    // the change tracker doesn't have to keep track the refined primvars.
    //
    // The hull topology refers coarse vertices that are placed on the beginning
    // of the vertex bar (this is a nature of OpenSubdiv adaptive/uniform
    // refinement). The refined topology refers entire vertex bar.
    //
    // If we only update the coarse vertices for the hull repr, and if we also
    // have a refined repr which stucks in an old state, DirtyPoints gets
    // cleared/ just updating coarse vertices and we lost a chance of updating
    // refined primvars. This state discrepancy could happen over frame, so
    // somebody has to maintain the versioning of each buffers.
    //
    // For topology, _indicesValid and _hullIndicesValid are used for that
    // purpose and it's possible because mesh topology is cached and shared in
    // the instance registry. We don't need to ask sceneDelegate, thus
    // individual (hull and refined) change trackings aren't needed.
    //
    // For vertex primvars, here we simply force to update all vertices at the
    // prim's authored refine level. Then both hull and refined topology can
    // safely access all valid data without having separate change tracking.
    //
    // This could be a performance concern, where a prim has higher refine level
    // and a Storm client keeps drawing only hull repr for some reason.
    // Currently we assume it's not likely a use-case, but we may revisit later
    // and optimize if necessary.
    //
    const refineLevel = this._topology ? this._topology.getRefineLevel() : 0

    const doRefine = (refineLevel > 0)
    const doQuadrangulate = this._useQuadIndices(renderIndex, this._topology!)

    // If any primvars use doubles, we need to know if the Hgi backend
    // supports these, or if they need to be converted to floats.
    const doublesSupported = _GetDoubleSupport(resourceRegistry)

    // Full primvar update. Note that we only trigger this loop on
    // dirty primvar desc (e.g. non-points changed), though it may update
    // points as well.  If we skip this loop and points is dirty, we handle that
    // below in a special fastpath.
    let primvars: HdPrimvarDescriptor[] = []
    const compPrimvars: HdExtComputationPrimvarDescriptor[] = []
    if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      primvars = HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationVertex, repr, desc.geomStyle,
        geomSubsetDescIndex, this._topology!.getGeomSubsets().length)

      // Track the last vertex index to distinguish between vertex and varying
      // while processing.
      const vertexPartitionIndex = primvars.length - 1

      // Add varying primvars so we can process them all together, below.
      const varyingPvs =
        HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
          HdInterpolation.HdInterpolationVarying, repr, desc.geomStyle,
          geomSubsetDescIndex, this._topology!.getGeomSubsets().length)
      primvars.push(...varyingPvs)

      let isPointsComputedPrimvar = false
      let isNormalsComputedPrimvar = false
      for (const interpolation of
        [HdInterpolation.HdInterpolationVertex, HdInterpolation.HdInterpolationVarying]) {
        const localSources: HdBufferSource[] = []
        const localReserveOnlySources: HdBufferSource[] = []
        const localSeparateComputationSources: HdBufferSource[] = []
        const localComputations: HdStComputationComputeQueuePairVector = []

        const localCompPrimvars =
          sceneDelegate.getExtComputationPrimvarDescriptors(
            id,
            interpolation)

        // Process computed primvars...
        HdSt_GetExtComputationPrimvarsComputations(
          id,
          sceneDelegate,
          localCompPrimvars,
          dirtyBits.value,
          localSources,
          localReserveOnlySources,
          localSeparateComputationSources,
          localComputations)

        // Update tracked state for points and normals that are computed.
        if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
          (dirtyBits.value & HdChangeTracker.DirtyPoints)) {
          for (const computedSources of
            [localReserveOnlySources, localSources]) {
            for (const source of computedSources) {
              if (source.getName() === HdTokens.points) {
                isPointsComputedPrimvar = true
                this._pointsDataType = source.getTupleType().type
              }
              if (source.getName() === HdTokens.normals) {
                isNormalsComputedPrimvar = true
                this._sceneNormalsInterpolation = interpolation
                this._sceneNormalsFromPrimvars = true
              }
            }
          }
        }

        // Schedule quadrangulation/refinement for computed primvars if
        // needed.
        const hdStInterpolation =
          interpolation === HdInterpolation.HdInterpolationVertex ?
            HdSt_MeshTopology.INTERPOLATE_VERTEX :
            HdSt_MeshTopology.INTERPOLATE_VARYING
        for (const source of localReserveOnlySources) {
          _RefineOrQuadrangulateVertexAndVaryingPrimvar(
            source, this._topology!, id, doRefine, doQuadrangulate,
            resourceRegistry,
            localComputations, hdStInterpolation)
        }

        for (const source of localSources) {
          _RefineOrQuadrangulateVertexAndVaryingPrimvar(
            source, this._topology!, id, doRefine, doQuadrangulate,
            resourceRegistry,
            localComputations, hdStInterpolation)
        }

        sources.push(...localSources)
        reserveOnlySources.push(...localReserveOnlySources)
        separateComputationSources.push(...localSeparateComputationSources)
        computations.push(...localComputations)
        compPrimvars.push(...localCompPrimvars)
      }

      // Track primvars that are skipped because they have zero elements
      const zeroElementPrimvars: HdPrimvarDescriptor[] = []

      // Track index to identify varying primvars.
      let i = 0
      for (const primvar of primvars) {
        if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name)) {
          continue
        }

        // Everything after "vertexPartitionIndex" is varying.
        const isVarying = i++ > vertexPartitionIndex

        // TODO: We don't need to pull primvar metadata every time a
        // value changes, but we need support from the delegate.

        const value = this.getPrimvar(sceneDelegate, primvar.name)
        if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name, value)) {
          zeroElementPrimvars.push(primvar)
          continue
        }

        const source = new HdVtBufferSource(primvar.name, value, 1,
          doublesSupported)

        if (source.getNumElements() === 0 &&
          primvar.name !== HdTokens.points) {
          // zero elements for primvars other than points will be treated
          // as if the primvar doesn't exist, so no warning is necessary
          zeroElementPrimvars.push(primvar)
          continue
        }

        // verify primvar length -- it is alright to have more data than we
        // index into; the inverse is when we issue a warning and skip
        // update.
        if (source.getNumElements() < numPoints) {
          if (primvar.name === HdTokens.points) {
            // If points is too short, it pretty much invalidates the
            // whole prim. Drop the bar, to invalidate the prim and
            // stop further processing.
            HF_VALIDATION_WARN(id,
              `Vertex primvar points has only ${source.getNumElements()} elements, while` +
              ` its topology expects at least ${numPoints} elements. Skipping ` +
              ' prim due to insufficent data.')

            this._rprimSharedData.barContainer.Set(
              drawItem.getDrawingCoord().getVertexPrimvarIndex(),
              null)
            return
          } else {
            HF_VALIDATION_WARN(id,
              `Vertex primvar ${primvar.name} has only ${source.getNumElements()} elements, while` +
              ` its topology expects at least ${numPoints} elements. Skipping ` +
              ' primvar update.')
            continue
          }
        } else if (source.getNumElements() > numPoints) {
          // HYD-3510
          // we need to support tensor valued vertex primvars properly
          // (with elementSize > 1)
          HF_VALIDATION_WARN(id,
            `Vertex primvar ${primvar.name} has ${source.getNumElements()} elements, while` +
            ` its topology references only up to element index ${numPoints}.`)

          // If the primvar has more data than needed, we issue a warning,
          // but don't skip the primvar update. Truncate the buffer to
          // the expected length.
          source.truncate(numPoints)
        }

        if (primvar.name === HdTokens.normals) {
          if (isNormalsComputedPrimvar) {
            HF_VALIDATION_WARN(id,
              "'normals' specified as both computed and authored " +
              'primvar. Skipping authored value.')
            continue
          }
          this._sceneNormalsInterpolation =
            isVarying ? HdInterpolation.HdInterpolationVarying : HdInterpolation.HdInterpolationVertex
          this._sceneNormalsFromPrimvars = true
        } else if (primvar.name === HdTokens.displayOpacity) {
          this._displayOpacityFromPrimvars = true
        } else if (primvar.name === HdTokens.points) {
          if (isPointsComputedPrimvar) {
            HF_VALIDATION_WARN(id,
              "'points' specified as both computed and authored " +
              'primvar. Skipping authored value.')
            continue
          }
          this._pointsDataType = source.getTupleType().type
        }

        _RefineOrQuadrangulateVertexAndVaryingPrimvar(
          source, this._topology!, id, doRefine, doQuadrangulate,
          resourceRegistry,
          computations, isVarying ?
            HdSt_MeshTopology.INTERPOLATE_VARYING :
            HdSt_MeshTopology.INTERPOLATE_VERTEX)

        sources.push(source)
      }

      // remove the primvars with zero elements from further processing
      for (const primvar of zeroElementPrimvars) {
        const pos = primvars.findIndex((p) => p.Equals(primvar))
        if (pos >= 0) {
          primvars.splice(pos, 1)
        }
      }
    }

    // Points fastpath; it's possible points was updated above, but if
    // points is dirty and we skipped the above loops let's handle it here.
    if ((dirtyBits.value & HdChangeTracker.DirtyPoints) &&
      !((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
        (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
        (dirtyBits.value & HdChangeTracker.DirtyPrimvar))) {
      // We can't use the scene delegate to check whether points is
      // provided/computed/has the correct interpolation without pulling the
      // full primvar descriptor list, so we need to cheat and go straight to
      // the Hydra 2 scene representation.  Preview of the future!
      // (mesh.cpp:1581-1711)
      const si = renderIndex.getTerminalSceneIndex()
      const prim = si ? si.getPrim(id) : { primType: '', dataSource: undefined }

      // Check computed primvars
      const ecPrimvarsSchema =
        HdExtComputationPrimvarsSchema.getFromParent(prim.dataSource)
      const ecPointsSchema =
        ecPrimvarsSchema.getExtComputationPrimvar(HdTokens.points)
      let isPointsComputedPrimvar = false
      if (ecPointsSchema.isDefined()) {
        const ecpd =
          HdExtComputationPrimvarDescriptorFromSchema(
            HdTokens.points as TfToken, ecPointsSchema)
        compPrimvars.push(ecpd)

        // XXX: this is a pretty heavy-handed way to do this @_@.
        HdSt_GetExtComputationPrimvarsComputations(
          id,
          sceneDelegate,
          compPrimvars,
          dirtyBits.value,
          sources,
          reserveOnlySources,
          separateComputationSources,
          computations)

        for (const computedSources of [reserveOnlySources, sources]) {
          for (const source of computedSources) {
            if (source.getName() === HdTokens.points) {
              isPointsComputedPrimvar = true
              this._pointsDataType = source.getTupleType().type
            }
          }
        }
        // Schedule quadrangulation/refinement for computed points if needed.
        for (const source of reserveOnlySources) {
          _RefineOrQuadrangulateVertexAndVaryingPrimvar(
            source, this._topology!, id, doRefine, doQuadrangulate,
            resourceRegistry,
            computations, HdSt_MeshTopology.INTERPOLATE_VERTEX)
        }

        for (const source of sources) {
          _RefineOrQuadrangulateVertexAndVaryingPrimvar(
            source, this._topology!, id, doRefine, doQuadrangulate,
            resourceRegistry,
            computations, HdSt_MeshTopology.INTERPOLATE_VERTEX)
        }
      }

      // Check primvars
      const primvarsSchema =
        HdPrimvarsSchema.getFromParent(prim.dataSource)
      const pointsSchema =
        primvarsSchema.getPrimvar(HdTokens.points)
      if (pointsSchema.isDefined() && isPointsComputedPrimvar) {
        HF_VALIDATION_WARN(id,
          "'points' specified as both computed and authored " +
          'primvar. Skipping authored value.')
      } else if (pointsSchema.isDefined()) {
        const pd =
          HdPrimvarDescriptorFromSchema(
            HdTokens.points as TfToken, pointsSchema)
        primvars.push(pd)
        // Upstream reads pointsSchema.GetPrimvarValue()->GetValue(0.0f); the
        // scene delegate's Get of the same terminal scene index prim returns
        // that value as the VtValue HdVtBufferSource takes.
        const value: VtValue = pointsSchema.getPrimvarValue()
          ? this.getPrimvar(sceneDelegate, HdTokens.points)
          : VtValue.getEmpty()
        let source: HdVtBufferSource | null = null
        if (HdStIsPrimvarValidForDrawItem(
          drawItem, HdTokens.points as TfToken, value)) {
          source = new HdVtBufferSource(HdTokens.points,
            value, 1, doublesSupported)
        }

        if (source === null) {
          // If points isn't valid, it pretty much invalidates the
          // whole prim. Drop the bar, to invalidate the prim and stop
          // further processing.
          HF_VALIDATION_WARN(id,
            'Vertex primvar points is not valid. Skipping ' +
            ' prim due to insufficent data.')

          this._rprimSharedData.barContainer.Set(
            drawItem.getDrawingCoord().getVertexPrimvarIndex(),
            null)
          return
        } else if (source.getNumElements() < numPoints) {
          // If points is too short, it pretty much invalidates the
          // whole prim. Drop the bar, to invalidate the prim and stop
          // further processing.
          HF_VALIDATION_WARN(id,
            `Vertex primvar points has only ${source.getNumElements()} elements, while` +
            ` its topology expects at least ${numPoints} elements. Skipping ` +
            ' prim due to insufficent data.')

          this._rprimSharedData.barContainer.Set(
            drawItem.getDrawingCoord().getVertexPrimvarIndex(),
            null)
          return
        } else if (source.getNumElements() > numPoints) {
          // If the primvar has more data than needed, we issue a warning,
          // but don't skip the primvar update. Truncate the buffer to
          // the expected length.
          HF_VALIDATION_WARN(id,
            `Vertex primvar points has ${source.getNumElements()} elements, while` +
            ` its topology references only up to element index ${numPoints}.`)

          source.truncate(numPoints)
        }
        this._pointsDataType = source.getTupleType().type

        _RefineOrQuadrangulateVertexAndVaryingPrimvar(
          source, this._topology!, id, doRefine, doQuadrangulate,
          resourceRegistry,
          computations, HdSt_MeshTopology.INTERPOLATE_VERTEX)

        sources.push(source)
      }
    }

    let generatedNormalsName = ''
    if (requireSmoothNormals && (dirtyBits.value & HdStMesh.DirtySmoothNormals)) {
      // note: normals gets dirty when points are marked as dirty,
      // at changetracker.

      // clear DirtySmoothNormals (this is not a scene dirtybit)
      dirtyBits.value &= ~HdStMesh.DirtySmoothNormals

      TF_VERIFY(this._vertexAdjacencyBuilder)

      // we can't use packed normals for refined/quad,
      // let's migrate the buffer to full precision
      const usePackedSmoothNormals =
        HdStMesh.isEnabledPackedNormals() && !(doRefine || doQuadrangulate)

      generatedNormalsName = usePackedSmoothNormals ?
        HdStTokens.packedSmoothNormals : HdStTokens.smoothNormals

      if (this._pointsDataType !== HdType.HdTypeInvalid) {
        // Smooth normals will compute normals as the same datatype
        // as points, unless we ask for packed normals.
        // This is unfortunate; can we force them to be float?
        const smoothNormalsComputation: HdStComputation =
          new HdSt_SmoothNormalsComputationGPU(
            this._vertexAdjacencyBuilder,
            HdTokens.points,
            generatedNormalsName,
            this._pointsDataType,
            usePackedSmoothNormals)
        computations.push([smoothNormalsComputation, _NormalsCompQueue])

        // note: we haven't had explicit dependency for GPU
        // computations just yet. Currently they are executed
        // sequentially, so the dependency is expressed by
        // registering order.
        //
        // note: we can use "pointsDataType" as the normals data type
        // because, if we decided to refine/quadrangulate, we will have
        // forced unpacked normals.
        if (doRefine) {
          const computation =
            this._topology!.getOsdRefineComputationGPU(
              HdStTokens.smoothNormals, this._pointsDataType,
              resourceRegistry,
              HdSt_MeshTopology.INTERPOLATE_VERTEX)

          // computation can be null for empty mesh
          if (computation) {
            computations.push([computation, _RefineNormalsCompQueue])
          }
        } else if (doQuadrangulate) {
          const computation =
            this._topology!.getQuadrangulateComputationGPU(
              HdStTokens.smoothNormals,
              this._pointsDataType, _Path(this.getId()))

          // computation can be null for all-quad mesh
          if (computation) {
            computations.push([computation, _RefineNormalsCompQueue])
          }
        }
      }
    }

    const bar = drawItem.getVertexPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(
      sources, computations, bar, dirtyBits.value)) {
      return
    }

    // XXX: This should be based off the DirtyPrimvarDesc bit.
    const hasDirtyPrimvarDesc =
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar) !== 0 ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) !== 0 ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) !== 0

    let removedSpecs: HdBufferSpec[] = []
    if (hasDirtyPrimvarDesc) {
      // If we've just generated normals then make sure those
      // are preserved, otherwise allow either previously existing
      // packed or non-packed normals to remain.
      let internallyGeneratedPrimvars: TfToken[]
      if (generatedNormalsName !== '') {
        internallyGeneratedPrimvars = [generatedNormalsName as TfToken]
      } else {
        internallyGeneratedPrimvars =
          [HdStTokens.packedSmoothNormals, HdStTokens.smoothNormals]
      }

      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, primvars,
        compPrimvars, internallyGeneratedPrimvars, id)
    }

    const bufferSpecs: HdBufferSpec[] = []
    HdBufferSpec.getBufferSpecs(sources, bufferSpecs)
    HdBufferSpec.getBufferSpecs(reserveOnlySources, bufferSpecs)
    HdStGetBufferSpecsFromCompuations(computations, bufferSpecs)

    const allSources: HdBufferSource[] = [...sources]
    for (const src of reserveOnlySources) {
      allSources.push(src)
    }

    let range: _BAR

    if (HdStIsEnabledSharedVertexPrimvar()) {
      // When primvar sharing is enabled, we have the following scenarios:
      // (a) BAR hasn't been allocated,
      //    - See if an existing immutable BAR may be shared.
      //    - If one cannot be found, allocate an immutable BAR and register
      //      it, so other prims may benefit from sharing it.
      //
      // (b) BAR has been allocated and is immutable
      //    (b1) If the topology is varying OR data in the existing buffers is
      //      changing (e.g. points are being updated) OR if primvar(s) were
      //      removed, it is expensive to recompute a hash over the contents
      //      to check if an existing immutable BAR may be shared.
      //          - Transition to a mutable BAR by migrating existing contents
      //
      //    (b2) Else if we have new sources (e.g smoothNormals), follow
      //      the same steps as in (a) to use/allocate an immutable BAR.
      //          - This is done to avoid transitioning to a mutable BAR (and
      //            thus prevent sharing) when changing reprs. This also
      //            handles authored primvars that were added, which may not
      //            be something we want.
      //
      //    (b3) No new sources: Use the existing BAR.
      //
      // (c) BAR has been allocated and is mutable
      //    - This means we transitioned to a mutable BAR (b1) earlier, and
      //      can handle it as though primvar sharing wasn't enabled.

      // (a)
      if (!HdStIsValidBAR(bar)) {
        // see if we can share an immutable primvar range
        // include topology and other topological computations
        // in the sharing id so that we can take into account
        // sharing of computed primvar data.
        this._vertexPrimvarId = HdStComputeSharedPrimvarId(
          this._topologyId, allSources, computations)

        const isFirstInstance = { value: true }
        range = this._getSharedPrimvarRange(this._vertexPrimvarId,
          /*updatedOrAddedSpecs*/bufferSpecs,
          /*removedSpecs*/removedSpecs,
          /*curRange*/bar,
          isFirstInstance,
          resourceRegistry)
        if (!isFirstInstance.value) {
          TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
            `${id}: Found an immutable BAR for sharing.\n`)

          // this is not the first instance, skip redundant
          // sources and computations.
          sources = []
          computations = []
        } else {
          TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
            `${id}: Allocated an immutable BAR.\n`)
        }
      } else {
        if (bar!.isImmutable()) {
          const barSpecs = bar!.getBufferSpecs()

          const updatingExistingBuffers =
            bufferSpecs.length !== 0 &&
            HdBufferSpec.isSubset(bufferSpecs, /*superSet*/barSpecs)
          const notNewRepr = !(dirtyBits.value & HdChangeTracker.NewRepr)

          const transitionToMutableBAR =
            this._hasVaryingTopology ||
            (updatingExistingBuffers && notNewRepr) ||
            removedSpecs.length !== 0

          if (transitionToMutableBAR) {
            // (b1)
            let newUsageHint = bar!.getUsageHint()
            newUsageHint &= ~HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsImmutable
            this._vertexPrimvarId = 0n

            range = resourceRegistry.updateNonUniformBufferArrayRange(
              HdTokens.primvar, bar, bufferSpecs, removedSpecs,
              newUsageHint)

            TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
              'Transitioning from immutable to mutable BAR\n')
          } else if (bufferSpecs.length !== 0) {
            // (b2) Continue to use an immutable BAR (even if it means
            // allocating a new one)

            // See if we can share an immutable buffer primvar range
            // include our existing sharing id so that we can take
            // into account previously committed sources along
            // with our new sources and computations.
            this._vertexPrimvarId = HdStComputeSharedPrimvarId(
              this._vertexPrimvarId, allSources, computations)

            const isFirstInstance = { value: true }
            range = this._getSharedPrimvarRange(this._vertexPrimvarId,
              /*updatedOrAddedSpecs*/bufferSpecs,
              /*removedSpecs*/removedSpecs,
              /*curRange*/bar,
              isFirstInstance,
              resourceRegistry)

            if (!isFirstInstance.value) {
              sources = []
              computations = []
            }

            TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
              'Migrating from immutable to another immutable BAR\n')
          } else {
            // No changes are being made to the existing immutable BAR.
            range = bar
          }
        } else {
          // (c) Exiting BAR is a mutable one.
          const usageHint =
            HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
            HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
          range = resourceRegistry.updateNonUniformBufferArrayRange(
            HdTokens.primvar, bar, bufferSpecs, removedSpecs,
            usageHint)
        }
      }
    } else {
      // When primvar sharing is disabled, a mutable BAR is allocated/updated/
      // migrated as necessary.
      const usageHint =
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage

      range = resourceRegistry.updateNonUniformBufferArrayRange(
        HdTokens.primvar, bar, bufferSpecs, removedSpecs,
        usageHint)
    }

    HdStUpdateDrawItemBAR(
      range,
      drawItem.getDrawingCoord().getVertexPrimvarIndex(),
      this._rprimSharedData,
      renderParam,
      renderIndex.getChangeTracker())

    if (sources.length !== 0 || computations.length !== 0) {
      // If sources or computations are to be queued against the resulting
      // BAR, we expect it to be valid.
      if (!TF_VERIFY(drawItem.getVertexPrimvarRange()!.isValid())) {
        return
      }
    }

    // schedule buffer sources
    if (sources.length !== 0) {
      // add sources to update queue
      resourceRegistry.addSources(drawItem.getVertexPrimvarRange(),
        sources)
    }
    // add gpu computations to queue.
    for (const compQueuePair of computations) {
      const comp = compQueuePair[0]
      const queue = compQueuePair[1]
      resourceRegistry.addComputation(
        drawItem.getVertexPrimvarRange(), comp, queue)
    }
    if (separateComputationSources.length !== 0) {
      for (const src of separateComputationSources) {
        resourceRegistry.addSource(src)
      }
    }
  }

  /** mesh.cpp:1996-2233 */
  protected _populateFaceVaryingPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    repr: HdRepr,
    desc: HdMeshReprDesc,
    drawItem: HdStDrawItem,
    geomSubsetDescIndex: number,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const id = this.getId()
    const primvars =
      HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationFaceVarying, repr, desc.geomStyle,
        geomSubsetDescIndex, this._topology!.getGeomSubsets().length)

    const compPrimvars =
      sceneDelegate.getExtComputationPrimvarDescriptors(id,
        HdInterpolation.HdInterpolationFaceVarying)

    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())

    const sources: HdBufferSource[] = []
    const computations: HdStComputationComputeQueuePairVector = []

    const refineLevel = this._getRefineLevelForDesc(desc)
    const numFaceVaryings = this._topology ? this._topology.getNumFaceVaryings() : 0

    const fvarLinearInterpRule =
      this._topology!.getSubdivTags().getFaceVaryingInterpolationRule()

    // Fvar primvars only need to be refined when the fvar linear interpolation
    // rule is not "linear all"
    const doRefine = (refineLevel > 0 &&
      fvarLinearInterpRule !== PxOsdOpenSubdivTokens.all)
    // At higher levels of refinement that do not require full OSD primvar
    // refinement, we might want to quadrangulate instead
    const doQuadrangulate =
      this._useQuadIndices(sceneDelegate.getRenderIndex(), this._topology!) ||
      (refineLevel > 0 && !this._topology!.refinesToTriangles())

    // Track primvars that are skipped because they have zero elements
    const zeroElementPrimvars: HdPrimvarDescriptor[] = []

    // If any primvars use doubles, we need to know if the Hgi backend supports
    // these, or if they need to be converted to floats.
    const doublesSupported = _GetDoubleSupport(resourceRegistry)

    const reserveOnlySources: HdBufferSource[] = []
    const separateComputationSources: HdBufferSource[] = []
    let isNormalsComputedPrimvar = false

    if (this._topology!.getScheme() === PxOsdOpenSubdivTokens.none) {
      // Only need to check for normal computations if they could be used,
      // i.e., no subdivision is happening and there are authored normals
      // that could be deformed.
      HdSt_GetExtComputationPrimvarsComputations(
        id,
        sceneDelegate,
        compPrimvars,
        dirtyBits.value,
        sources,
        reserveOnlySources,
        separateComputationSources,
        computations)

      // Update tracked state for normals that are computed.
      for (const computedSources of [reserveOnlySources, sources]) {
        for (const source of computedSources) {
          if (source.getName() === HdTokens.normals) {
            isNormalsComputedPrimvar = true
            this._sceneNormalsInterpolation = HdInterpolation.HdInterpolationFaceVarying
            this._sceneNormalsFromPrimvars = true
          }
        }
      }
    }

    for (const primvar of primvars) {
      if (primvar.name === HdTokens.points) {
        HF_VALIDATION_WARN(id, 'facevarying-interpolation points!')
        continue
      }

      if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name)) {
        continue
      }

      let value: VtValue
      // If refining and primvar is indexed, get unflattened primvar
      const useUnflattendPrimvar = doRefine && primvar.indexed
      if (useUnflattendPrimvar) {
        const indices = { value: [] as number[] }
        value = this.getIndexedPrimvar(sceneDelegate, primvar.name, indices)
      } else {
        value = this.getPrimvar(sceneDelegate, primvar.name)
      }
      if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name, value)) {
        zeroElementPrimvars.push(primvar)
        continue
      }

      let source: HdBufferSource | null =
        new HdVtBufferSource(primvar.name, value, 1,
          doublesSupported)

      if (!useUnflattendPrimvar && source.getNumElements() === 0) {
        // zero elements for primvars will be treated as if the primvar
        // doesn't exist, so no warning is necessary
        zeroElementPrimvars.push(primvar)
        continue
      }

      // verify primvar length
      if (source.getNumElements() !== numFaceVaryings &&
        !useUnflattendPrimvar) {
        HF_VALIDATION_WARN(id,
          `# of facevaryings mismatch (${source.getNumElements()} != ${numFaceVaryings})` +
          ` for primvar ${primvar.name}`)
        continue
      }

      if (source.getName() === HdTokens.normals) {
        if (!TF_VERIFY(!isNormalsComputedPrimvar)) {
          HF_VALIDATION_WARN(id,
            "'normals' specified as both computed and authored " +
            'primvar. Skipping authored value.')
          continue
        }
        this._sceneNormalsInterpolation = HdInterpolation.HdInterpolationFaceVarying
        this._sceneNormalsFromPrimvars = true
      } else if (source.getName() === HdTokens.displayOpacity) {
        this._displayOpacityFromPrimvars = true
      }

      let channel = 0
      if (doRefine) {
        channel =
          this._fvarTopologyTracker.getChannelFromPrimvar(primvar.name)

        // Invalid fvar topologies may have been skipped when
        // processed by _GatherFaceVaryingTopologies() in which
        // case a validation warning will have been posted already
        // and we should skip further refinement here.
        if (channel < 0) {
          continue
        }
      }

      source = _RefineOrQuadrangulateOrTriangulateFaceVaryingPrimvar(
        source, this._topology!, id, doRefine, doQuadrangulate,
        resourceRegistry, computations, channel)

      _PushSource(sources, source)
    }

    // remove the primvars with zero elements from further processing
    const remaining = [...primvars]
    for (const primvar of zeroElementPrimvars) {
      const pos = remaining.findIndex((p) => p.Equals(primvar))
      if (pos >= 0) {
        remaining.splice(pos, 1)
      }
    }

    const bar = drawItem.getFaceVaryingPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(sources, computations, bar, dirtyBits.value)) {
      return
    }

    // XXX: This should be based off the DirtyPrimvarDesc bit.
    const hasDirtyPrimvarDesc =
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar) !== 0 ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) !== 0 ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) !== 0

    let removedSpecs: HdBufferSpec[] = []
    if (hasDirtyPrimvarDesc) {
      // no internally generated facevarying primvars
      const internallyGeneratedPrimvars: TfToken[] = [] // empty
      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, remaining,
        internallyGeneratedPrimvars, id)
    }

    const bufferSpecs: HdBufferSpec[] = []
    HdBufferSpec.getBufferSpecs(sources, bufferSpecs)
    HdBufferSpec.getBufferSpecs(reserveOnlySources, bufferSpecs)
    HdStGetBufferSpecsFromCompuations(computations, bufferSpecs)

    const range =
      resourceRegistry.updateNonUniformBufferArrayRange(
        HdTokens.primvar, bar, bufferSpecs, removedSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

    HdStUpdateDrawItemBAR(
      range,
      drawItem.getDrawingCoord().getFaceVaryingPrimvarIndex(),
      this._rprimSharedData,
      renderParam,
      sceneDelegate.getRenderIndex().getChangeTracker())

    if (sources.length !== 0 || computations.length !== 0) {
      // If sources or computations are to be queued against the resulting
      // BAR, we expect it to be valid.
      if (!TF_VERIFY(drawItem.getFaceVaryingPrimvarRange()!.isValid())) {
        return
      }
    }

    if (sources.length !== 0) {
      resourceRegistry.addSources(
        drawItem.getFaceVaryingPrimvarRange(), sources)
    }

    // add gpu computations to queue.
    for (const compQueuePair of computations) {
      const comp = compQueuePair[0]
      const queue = compQueuePair[1]
      resourceRegistry.addComputation(
        drawItem.getFaceVaryingPrimvarRange(), comp, queue)
    }

    if (separateComputationSources.length !== 0) {
      for (const src of separateComputationSources) {
        resourceRegistry.addSource(src)
      }
    }
  }

  /** mesh.cpp:2235-2421 */
  protected _populateElementPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    repr: HdRepr,
    desc: HdMeshReprDesc,
    drawItem: HdStDrawItem,
    geomSubsetDescIndex: number,
    dirtyBits: HdDirtyBitsRef,
    requireFlatNormals: boolean,
  ): void {
    const id = this.getId()
    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())

    const sources: HdBufferSource[] = []
    const computations: HdStComputationComputeQueuePairVector = []
    const numFaces = this._topology ? this._topology.getNumFaces() : 0

    // Full primvar update
    let primvars: HdPrimvarDescriptor[] = []
    if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      primvars = HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationUniform, repr, desc.geomStyle,
        geomSubsetDescIndex, this._topology!.getGeomSubsets().length)

      // Track primvars that are skipped because they have zero elements
      const zeroElementPrimvars: HdPrimvarDescriptor[] = []

      // If any primvars use doubles, we need to know if the Hgi backend
      // supports these, or if they need to be converted to floats.
      const doublesSupported = _GetDoubleSupport(resourceRegistry)

      for (const primvar of primvars) {
        if (primvar.name === HdTokens.points) {
          HF_VALIDATION_WARN(id, 'uniform-interpolation points!')
          continue
        }

        if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name))
          continue

        const value = this.getPrimvar(sceneDelegate, primvar.name)
        if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name, value)) {
          zeroElementPrimvars.push(primvar)
          continue
        }

        const source =
          new HdVtBufferSource(primvar.name, value, 1,
            doublesSupported)

        if (source.getNumElements() === 0) {
          // zero elements for primvars other will be treated as if the
          // primvar doesn't exist, so no warning is necessary
          zeroElementPrimvars.push(primvar)
          continue
        }

        // verify primvar length
        if (source.getNumElements() !== numFaces) {
          HF_VALIDATION_WARN(id,
            `# of faces mismatch (${source.getNumElements()} != ${numFaces}) ` +
            `for uniform primvar ${primvar.name}`)
          continue
        }

        if (source.getName() === HdTokens.normals) {
          this._sceneNormalsInterpolation = HdInterpolation.HdInterpolationUniform
          this._sceneNormalsFromPrimvars = true
        } else if (source.getName() === HdTokens.displayOpacity) {
          this._displayOpacityFromPrimvars = true
        }
        sources.push(source)
      }

      // remove the primvars with zero elements from further processing
      for (const primvar of zeroElementPrimvars) {
        const pos = primvars.findIndex((p) => p.Equals(primvar))
        if (pos >= 0) {
          primvars.splice(pos, 1)
        }
      }
    }

    let generatedNormalsName = ''

    // Flat normals fastpath
    if (requireFlatNormals && (dirtyBits.value & HdStMesh.DirtyFlatNormals)) {
      dirtyBits.value &= ~HdStMesh.DirtyFlatNormals
      TF_VERIFY(this._topology)

      const usePackedNormals = HdStMesh.isEnabledPackedNormals()
      generatedNormalsName = usePackedNormals ?
        HdStTokens.packedFlatNormals : HdStTokens.flatNormals

      if (this._pointsDataType !== HdType.HdTypeInvalid) {
        // Flat normals will compute normals as the same datatype
        // as points, unless we ask for packed normals.
        // This is unfortunate; can we force them to be float?
        const flatNormalsComputation: HdStComputation =
          new HdSt_FlatNormalsComputationGPU(
            drawItem.getTopologyRange(),
            drawItem.getVertexPrimvarRange(),
            numFaces,
            HdTokens.points,
            generatedNormalsName,
            this._pointsDataType,
            usePackedNormals)
        computations.push([flatNormalsComputation, _NormalsCompQueue])
      }
    }

    const bar = drawItem.getElementPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(sources, computations, bar,
      dirtyBits.value)) {
      return
    }

    // XXX: This should be based off the DirtyPrimvarDesc bit.
    const hasDirtyPrimvarDesc =
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar) !== 0 ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) !== 0 ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) !== 0

    let removedSpecs: HdBufferSpec[] = []
    if (hasDirtyPrimvarDesc) {
      // If we've just generated normals then make sure those
      // are preserved, otherwise allow either previously existing
      // packed or non-packed normals to remain.
      let internallyGeneratedPrimvars: TfToken[]
      if (generatedNormalsName !== '') {
        internallyGeneratedPrimvars = [generatedNormalsName as TfToken]
      } else {
        internallyGeneratedPrimvars =
          [HdStTokens.packedFlatNormals, HdStTokens.flatNormals]
      }

      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, primvars,
        internallyGeneratedPrimvars, id)
    }

    const bufferSpecs: HdBufferSpec[] = []
    HdBufferSpec.getBufferSpecs(sources, bufferSpecs)
    HdStGetBufferSpecsFromCompuations(computations, bufferSpecs)

    const range =
      resourceRegistry.updateNonUniformBufferArrayRange(
        HdTokens.primvar, bar, bufferSpecs, removedSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

    HdStUpdateDrawItemBAR(
      range,
      drawItem.getDrawingCoord().getElementPrimvarIndex(),
      this._rprimSharedData,
      renderParam,
      sceneDelegate.getRenderIndex().getChangeTracker())

    if (sources.length !== 0 || computations.length !== 0) {
      // If sources or computations are to be queued against the resulting
      // BAR, we expect it to be valid.
      if (!TF_VERIFY(drawItem.getElementPrimvarRange()!.isValid())) {
        return
      }
    }

    if (sources.length !== 0) {
      resourceRegistry.addSources(
        drawItem.getElementPrimvarRange(), sources)
    }
    // add gpu computations to queue.
    for (const compQueuePair of computations) {
      const comp = compQueuePair[0]
      const queue = compQueuePair[1]
      resourceRegistry.addComputation(
        drawItem.getElementPrimvarRange(), comp, queue)
    }
  }

  /** mesh.cpp:2423-2432 */
  protected _materialHasPtex(renderIndex: HdRenderIndex, materialId: string): boolean {
    const material = _GetMaterial(renderIndex, materialId)

    return !!material && material.hasPtex()
  }

  /** mesh.cpp:2434-2460 */
  protected _useQuadIndices(renderIndex: HdRenderIndex, topology: HdSt_MeshTopology): boolean {
    // We should never quadrangulate for subdivision schemes
    // which refine to triangles (like Loop)
    if (topology.refinesToTriangles()) {
      return false
    }

    // Return true if any bound materials use ptex
    let materialHasPtex = false

    materialHasPtex = materialHasPtex ||
      this._materialHasPtex(renderIndex, this.getMaterialId())

    const geomSubsets = topology.getGeomSubsets()
    for (const geomSubset of geomSubsets) {
      materialHasPtex = materialHasPtex ||
        this._materialHasPtex(renderIndex, geomSubset.materialId)
    }

    // Fallback to the environment variable, which allows forcing of
    // quadrangulation for debugging/testing.
    return materialHasPtex || _IsEnabledForceQuadrangulate()
  }

  /** mesh.cpp:2462-2471 */
  protected _materialHasLimitSurface(renderIndex: HdRenderIndex, materialId: string): boolean {
    const material = _GetMaterial(renderIndex, materialId)

    return !!material && material.hasLimitSurfaceEvaluation()
  }

  /** mesh.cpp:2473-2491 */
  protected _useLimitRefinement(renderIndex: HdRenderIndex, topology: HdMeshTopology): boolean {
    // Return true if any bound materials have a limit surface evaluation
    let materialHasLimitSurface = false

    materialHasLimitSurface = materialHasLimitSurface ||
      this._materialHasLimitSurface(renderIndex, this.getMaterialId())

    const geomSubsets = topology.getGeomSubsets()
    for (const geomSubset of geomSubsets) {
      materialHasLimitSurface = materialHasLimitSurface ||
        this._materialHasLimitSurface(renderIndex, geomSubset.materialId)
    }

    return materialHasLimitSurface
  }

  /** mesh.cpp:2493-2502 */
  protected _useSmoothNormals(topology: HdSt_MeshTopology | null): boolean {
    if (this._flatShadingEnabled || this._limitNormals ||
      topology!.getScheme() === PxOsdOpenSubdivTokens.none ||
      topology!.getScheme() === PxOsdOpenSubdivTokens.bilinear) {
      return false
    }
    return true
  }

  /** mesh.cpp:2504-2512 */
  protected _useFlatNormals(desc: HdMeshReprDesc): boolean {
    if (this._getRefineLevelForDesc(desc) > 0 ||
      desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
      return false
    }
    return true
  }

  /** mesh.cpp:2523-2557 */
  protected _getSharedPrimvarRange(
    primvarId: bigint,
    updatedOrAddedSpecs: readonly HdBufferSpec[],
    removedSpecs: readonly HdBufferSpec[],
    curRange: _BAR,
    isFirstInstance: { value: boolean } | null,
    resourceRegistry: HdStResourceRegistry,
  ): _BAR {
    const barInstance =
      resourceRegistry.registerPrimvarRange(primvarId)

    let range: _BAR

    if (barInstance.isFirstInstance()) {
      const usageHint =
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex |
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage

      range = resourceRegistry.updateNonUniformImmutableBufferArrayRange(
        HdTokens.primvar,
        curRange,
        updatedOrAddedSpecs,
        removedSpecs,
        usageHint)

      barInstance.setValue(range!)
    } else {
      range = barInstance.GetValue()
    }

    if (isFirstInstance) {
      isFirstInstance.value = barInstance.isFirstInstance()
    }
    return range
  }

  /** mesh.cpp:2559-2780 */
  protected _updateDrawItem(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
    reprToken: TfToken | string,
    repr: HdRepr,
    desc: HdMeshReprDesc,
    requireSmoothNormals: boolean,
    requireFlatNormals: boolean,
    geomSubsetDescIndex: number,
  ): void {
    const id = this.getId()

    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())

    /* MATERIAL SHADER (may affect subsequent primvar population) */
    // Note: we check DirtyPrimvar here because Normals/Widths/Points
    // should always flow through...
    if ((dirtyBits.value & HdChangeTracker.NewRepr) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      drawItem.setMaterialNetworkShader(HdStGetMaterialNetworkShader(this, sceneDelegate))

      if (desc.geomStyle !== HdMeshGeomStyle.HdMeshGeomStylePoints) {
        const geomSubsets = this._topology ?
          this._topology.getGeomSubsets() : []
        const numGeomSubsets = geomSubsets.length
        for (let i = 0; i < numGeomSubsets; ++i) {
          const subsetDrawItem = repr.getDrawItemForGeomSubset(geomSubsetDescIndex,
            numGeomSubsets, i) as HdStDrawItem | null
          if (!TF_VERIFY(subsetDrawItem)) {
            continue
          }
          subsetDrawItem!.setMaterialNetworkShader(
            HdStGetMaterialNetworkShader(
              this, sceneDelegate, geomSubsets[i]!.materialId))
        }
      }
    }

    /* TOPOLOGY */
    // XXX: _PopulateTopology should be split into two phase
    //      for scene dirtybits and for repr dirtybits.
    // XXX: Triggering this on normals/widths is pretty rough,
    //      but necessary (potentially) for proper fvar handling.
    // We don't process points updates here because having
    // non-vertex point interpolation is unsupported.
    if (dirtyBits.value & (HdChangeTracker.DirtyTopology |
      HdChangeTracker.DirtyDisplayStyle |
      HdChangeTracker.DirtySubdivTags |
      HdChangeTracker.DirtyNormals |
      HdChangeTracker.DirtyWidths |
      HdChangeTracker.DirtyPrimvar |
      HdStMesh.DirtyIndices |
      HdStMesh.DirtyHullIndices |
      HdStMesh.DirtyPointsIndices)) {
      this._populateTopology(sceneDelegate,
        renderParam,
        drawItem,
        dirtyBits,
        reprToken,
        repr,
        desc,
        geomSubsetDescIndex)
    }

    if (dirtyBits.value & HdChangeTracker.DirtyDoubleSided) {
      this._doubleSided = this.isDoubleSided(sceneDelegate)
    }
    if (dirtyBits.value & HdChangeTracker.DirtyCullStyle) {
      this._cullStyle = this.getCullStyle(sceneDelegate)
    }

    // If it's impossible for this mesh to use smooth normals, we can clear
    // the dirty bit without computing them.  This is ok because the
    // conditions that are checked (topology, display style) will forward their
    // invalidation to smooth normals in PropagateDirtyBits.
    if (!this._useSmoothNormals(this._topology)) {
      requireSmoothNormals = false
      dirtyBits.value &= ~HdStMesh.DirtySmoothNormals
    }

    // If the subdivision scheme can use triangle normals,
    // disable flat normal generation.
    if (_CanUseTriangulatedFlatNormals(this._topology!)) {
      requireFlatNormals = false
      dirtyBits.value &= ~HdStMesh.DirtyFlatNormals
    }
    // Flat shading is based on whether the repr wants flat shading (captured
    // in the passed-in requireFlatNormals), whether the prim wants flat
    // shading, and whether the repr desc allows it.
    requireFlatNormals ||= this._flatShadingEnabled
    if (!this._useFlatNormals(desc)) {
      requireFlatNormals = false
    }

    if (requireSmoothNormals && !this._vertexAdjacencyBuilder) {
      this._populateAdjacency(resourceRegistry)
    }

    // Reset value of _displayOpacity and _sceneNormals if dirty
    if (HdChangeTracker.isPrimvarDirty(dirtyBits.value, id,
      HdTokens.displayOpacity)) {
      this._displayOpacityFromPrimvars = false
    }
    if (HdChangeTracker.isPrimvarDirty(dirtyBits.value, id,
      HdTokens.normals)) {
      this._sceneNormalsFromPrimvars = false
    }

    /* INSTANCE PRIMVARS */
    this._updateInstancer(sceneDelegate, dirtyBits)
    {
      // The data members are part of a bitfield, so we can't pass pointers
      // to them directly. HdStUpdateInstancerData doesn't write to output
      // params if DirtyInstancer is not set, so we initialize the locals
      // to current member values to preserve existing state in that case.
      const displayOpacityFromInstancer = { value: this._displayOpacityFromInstancer }
      const sceneNormalsFromInstancer = { value: this._sceneNormalsFromInstancer }
      HdStUpdateInstancerData(sceneDelegate.getRenderIndex(),
        renderParam,
        this,
        drawItem,
        this._rprimSharedData,
        dirtyBits.value,
        displayOpacityFromInstancer,
        sceneNormalsFromInstancer)
      this._displayOpacityFromInstancer = displayOpacityFromInstancer.value
      this._sceneNormalsFromInstancer = sceneNormalsFromInstancer.value
    }

    /* CONSTANT PRIMVARS, TRANSFORM, EXTENT AND PRIMID */
    if (HdStShouldPopulateConstantPrimvars(dirtyBits, id)) {
      const hasMirroredTransform = { value: this._hasMirroredTransform }
      const hasDisplayOpacity = { value: false }
      const hasNormals = { value: false }

      HdStPopulateConstantPrimvars(this,
        this._rprimSharedData,
        sceneDelegate,
        renderParam,
        drawItem,
        dirtyBits,
        repr,
        desc.geomStyle,
        geomSubsetDescIndex,
        this._topology!.getGeomSubsets().length,
        hasMirroredTransform,
        hasDisplayOpacity,
        hasNormals)

      this._hasMirroredTransform = hasMirroredTransform.value

      // Check if normals are provided as a constant primvar
      if (hasNormals.value) {
        this._sceneNormalsInterpolation = HdInterpolation.HdInterpolationConstant
        this._sceneNormalsFromPrimvars = true
      }
      if (hasDisplayOpacity.value) {
        this._displayOpacityFromPrimvars = true
      }
    }

    /* VERTEX PRIMVARS */
    if ((requireSmoothNormals && (dirtyBits.value & HdStMesh.DirtySmoothNormals)) ||
      HdChangeTracker.isAnyPrimvarDirty(dirtyBits.value, id)) {
      this._populateVertexPrimvars(sceneDelegate,
        renderParam,
        repr,
        desc,
        drawItem,
        geomSubsetDescIndex,
        dirtyBits,
        requireSmoothNormals)
    }

    /* FACEVARYING PRIMVARS */
    if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      this._populateFaceVaryingPrimvars(sceneDelegate,
        renderParam,
        repr,
        desc,
        drawItem,
        geomSubsetDescIndex,
        dirtyBits)
    }

    /* ELEMENT PRIMVARS */
    if ((requireFlatNormals && (dirtyBits.value & HdStMesh.DirtyFlatNormals)) ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      this._populateElementPrimvars(sceneDelegate,
        renderParam,
        repr,
        desc,
        drawItem,
        geomSubsetDescIndex,
        dirtyBits,
        requireFlatNormals)
    }

    // When we have multiple drawitems for the same mesh we need to clean the
    // bits for all the data fields touched in this function, otherwise it
    // will try to extract topology (for instance) twice, and this won't
    // work with delegates that don't keep information around once extracted.
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits

    TF_VERIFY(drawItem.getConstantPrimvarRange())
    // Topology and VertexPrimvar may be null, if the mesh has zero faces.
    // Element primvar, Facevarying primvar and Instance primvar are optional
  }

  /** mesh.cpp:2782-2998 */
  protected _updateDrawItemGeometricShader(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    desc: HdMeshReprDesc,
    materialId: string,
  ): void {
    const renderIndex = sceneDelegate.getRenderIndex()
    const topology = this._topology!

    const hasFaceVaryingPrimvars =
      !!drawItem.getFaceVaryingPrimvarRange()

    const refineLevel = this._getRefineLevelForDesc(desc)

    const PrimitiveType = HdSt_GeometricShaderPrimitiveType
    let primType = PrimitiveType.PRIM_MESH_COARSE_TRIANGLES

    if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
      primType = PrimitiveType.PRIM_POINTS
    } else if (refineLevel > 0) {
      if (topology.refinesToBSplinePatches()) {
        primType = PrimitiveType.PRIM_MESH_BSPLINE
      } else if (topology.refinesToBoxSplineTrianglePatches()) {
        primType = PrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE
      } else if (topology.refinesToTriangles()) {
        // uniform loop subdivision generates triangles.
        primType = PrimitiveType.PRIM_MESH_REFINED_TRIANGLES
      } else {
        // uniform catmark/bilinear subdivision generates quads.
        if (topology.triangulateQuads()) {
          primType = PrimitiveType.PRIM_MESH_REFINED_TRIQUADS
        } else {
          primType = PrimitiveType.PRIM_MESH_REFINED_QUADS
        }
      }
    } else if (this._useQuadIndices(renderIndex, topology)) {
      // quadrangulate coarse mesh (e.g. for ptex)
      if (topology.triangulateQuads()) {
        primType = PrimitiveType.PRIM_MESH_COARSE_TRIQUADS
      } else {
        primType = PrimitiveType.PRIM_MESH_COARSE_QUADS
      }
    }

    // Determine fvar patch type based on refinement level, uniform/adaptive
    // subdivision, and fvar linear interpolation rule
    const FvarPatchType = HdSt_GeometricShaderFvarPatchType
    let fvarPatchType = FvarPatchType.PATCH_COARSE_TRIANGLES
    const fvarLinearInterpRule =
      topology.getSubdivTags().getFaceVaryingInterpolationRule()

    if (refineLevel > 0 && fvarLinearInterpRule !== PxOsdOpenSubdivTokens.all) {
      if (topology.refinesToBSplinePatches()) {
        fvarPatchType = FvarPatchType.PATCH_BSPLINE
      } else if (topology.refinesToBoxSplineTrianglePatches()) {
        fvarPatchType = FvarPatchType.PATCH_BOXSPLINETRIANGLE
      } else if (topology.refinesToTriangles()) {
        fvarPatchType = FvarPatchType.PATCH_REFINED_TRIANGLES
      } else {
        fvarPatchType = FvarPatchType.PATCH_REFINED_QUADS
      }
    } else if (((refineLevel === 0) &&
      ((primType === PrimitiveType.PRIM_MESH_COARSE_QUADS) ||
        (primType === PrimitiveType.PRIM_MESH_COARSE_TRIQUADS))) ||
      ((refineLevel > 0) && (!topology.refinesToTriangles()))) {
      fvarPatchType = FvarPatchType.PATCH_COARSE_QUADS
    }

    // resolve geom style, cull style
    let cullStyle = desc.cullStyle
    const geomStyle = desc.geomStyle

    // Should the geometric shader expect computed smooth normals for this mesh?
    const hasGeneratedSmoothNormals = !this._limitNormals &&
      topology.getScheme() !== PxOsdOpenSubdivTokens.none &&
      topology.getScheme() !== PxOsdOpenSubdivTokens.bilinear

    // Should the geometric shader expect computed flat normals for this mesh?
    const hasGeneratedFlatNormals = this._useFlatNormals(desc) &&
      !_CanUseTriangulatedFlatNormals(topology)

    // Has the draw style been forced to flat-shading?
    const forceFlatShading =
      this._flatShadingEnabled || desc.flatShadingEnabled

    // Resolve normals interpolation.
    let normalsInterpolation = HdInterpolation.HdInterpolationVertex
    if (this._sceneNormalsFromPrimvars) {
      normalsInterpolation = this._sceneNormalsInterpolation
    } else if (this._sceneNormalsFromInstancer) {
      normalsInterpolation = HdInterpolation.HdInterpolationInstance
    }

    // Resolve normals source.
    let normalsSource: HdSt_MeshShaderKeyNormalSource
    if (forceFlatShading) {
      if (hasGeneratedFlatNormals) {
        normalsSource = HdSt_MeshShaderKey.NormalSourceFlat
      } else if (_CanUseTriangulatedFlatNormals(topology)) {
        normalsSource = HdSt_MeshShaderKey.NormalSourceFlatScreenSpace
      } else {
        normalsSource = HdSt_MeshShaderKey.NormalSourceFlatGeometric
      }
    } else if (this._limitNormals) {
      normalsSource = HdSt_MeshShaderKey.NormalSourceLimit
    } else if (hasGeneratedSmoothNormals) {
      normalsSource = HdSt_MeshShaderKey.NormalSourceSmooth
    } else if (this._sceneNormalsFromPrimvars || this._sceneNormalsFromInstancer) {
      normalsSource = HdSt_MeshShaderKey.NormalSourceScene
    } else {
      normalsSource = HdSt_MeshShaderKey.NormalSourceFlatGeometric
    }

    // if the repr doesn't have an opinion about cullstyle, use the
    // prim's default (it could also be DontCare, then renderPass's
    // cullStyle is going to be used).
    //
    // i.e.
    //   Repr CullStyle > Rprim CullStyle > RenderPass CullStyle
    //
    if (cullStyle === HdCullStyle.HdCullStyleDontCare) {
      cullStyle = this._cullStyle
    }

    const blendWireframeColor = desc.blendWireframeColor

    // Check if the shader bound to this mesh has a custom displacement
    // terminal, or uses ptex, so that we know whether to include the geometry
    // shader.
    const material = _GetMaterial(renderIndex, materialId)

    const hasCustomDisplacementTerminal =
      !!material && material.hasDisplacement()
    const hasPtex = !!material && material.hasPtex()

    // FaceVarying primvars or ptex requires per-face interpolation.
    const hasPerFaceInterpolation = hasFaceVaryingPrimvars || hasPtex

    const hasTopologicalVisibility =
      !!drawItem.getTopologyVisibilityRange()

    // Enable displacement shading only if the repr enables it, and the
    // entrypoint exists.
    const hasCustomDisplacement = hasCustomDisplacementTerminal &&
      desc.useCustomDisplacement && this._displacementEnabled

    const hasInstancer = this.getInstancerId() !== ''

    // Process shadingTerminal (including shadingStyle)
    let shadingTerminal = desc.shadingTerminal as TfToken
    if (shadingTerminal === HdMeshReprDescTokens.surfaceShader) {
      const shadingStyle =
        this.getShadingStyle(sceneDelegate).getWithDefault<TfToken>('' as TfToken)
      if (shadingStyle === HdStTokens.constantLighting) {
        shadingTerminal = HdMeshReprDescTokens.surfaceShaderUnlit as TfToken
      }
    }

    const resourceRegistry = _GetResourceRegistry(renderIndex)

    const capabilities = resourceRegistry.getHgi().getCapabilities()!
    const hasBuiltinBarycentrics = capabilities.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics)

    const hasMetalTessellation = capabilities.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation)

    const nativeRoundPoints = capabilities.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints)

    // create a shaderKey and set to the geometric shader.
    const shaderKey = new HdSt_MeshShaderKey(primType,
      shadingTerminal,
      normalsSource,
      normalsInterpolation,
      cullStyle,
      geomStyle,
      fvarPatchType,
      desc.lineWidth,
      this._doubleSided || desc.doubleSided,
      hasBuiltinBarycentrics,
      hasMetalTessellation,
      hasCustomDisplacement,
      hasPerFaceInterpolation,
      hasTopologicalVisibility,
      blendWireframeColor,
      this._hasMirroredTransform,
      hasInstancer,
      desc.enableScalarOverride,
      this._pointsShadingEnabled,
      desc.forceOpaqueEdges,
      desc.surfaceEdgeIds,
      nativeRoundPoints)

    const geomShader =
      HdSt_GeometricShader.create(shaderKey, resourceRegistry)

    TF_VERIFY(geomShader)

    if (geomShader !== drawItem.getGeometricShader()) {
      drawItem.setGeometricShader(geomShader)

      // If the geometric shader changes, we need to do a deep validation of
      // batches, so they can be rebuilt if necessary.
      HdStMarkDrawBatchesDirty(renderParam)

      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `${this.getId()}: Marking all batches dirty to trigger deep validation because` +
        ' the geometric shader was updated.\n')
    }
  }

  /** mesh.cpp:3000-3046 */
  protected override _propagateDirtyBits(bits: HdDirtyBits): HdDirtyBits {
    // If subdiv tags are dirty, topology needs to be recomputed.
    // The latter implies we'll need to recompute all primvar data.
    // Any data fetched by the scene delegate should be marked dirty here.
    if (bits & HdChangeTracker.DirtySubdivTags) {
      bits |= (HdChangeTracker.DirtyPoints |
        HdChangeTracker.DirtyNormals |
        HdChangeTracker.DirtyPrimvar |
        HdChangeTracker.DirtyTopology |
        HdChangeTracker.DirtyDisplayStyle)
    } else if (bits & HdChangeTracker.DirtyTopology) {
      // Unlike basis curves, we always request refineLevel when topology is
      // dirty
      bits |= HdChangeTracker.DirtySubdivTags |
        HdChangeTracker.DirtyDisplayStyle
    }

    // A change of material means that the Quadrangulate state may have
    // changed.
    if (bits & HdChangeTracker.DirtyMaterialId) {
      bits |= (HdChangeTracker.DirtyPoints |
        HdChangeTracker.DirtyNormals |
        HdChangeTracker.DirtyPrimvar |
        HdChangeTracker.DirtyTopology)
    }

    // If points, display style, or topology changed, recompute normals.
    if (bits & (HdChangeTracker.DirtyPoints |
      HdChangeTracker.DirtyDisplayStyle |
      HdChangeTracker.DirtyTopology)) {
      bits |= this._customDirtyBitsInUse &
        (HdStMesh.DirtySmoothNormals | HdStMesh.DirtyFlatNormals)
    }

    // If the topology is dirty, recompute custom indices resources.
    if (bits & HdChangeTracker.DirtyTopology) {
      bits |= this._customDirtyBitsInUse &
        (HdStMesh.DirtyIndices |
          HdStMesh.DirtyHullIndices |
          HdStMesh.DirtyPointsIndices)
    }

    return bits
  }

  /** mesh.cpp:3048-3153 */
  protected override _initRepr(reprToken: string, dirtyBits: HdDirtyBitsRef): void {
    const it = this._reprs.find((r) => r[0] === reprToken)
    const isNew = it === undefined
    if (isNew) {
      // add new repr
      const repr = new HdRepr()
      this._reprs.push([reprToken, repr])

      // set dirty bit to say we need to sync a new repr (buffer array
      // ranges may change)
      dirtyBits.value |= HdChangeTracker.NewRepr

      const descs = HdStMesh._getReprDesc(reprToken)

      // allocate all draw items
      const numGeomSubsets = this._topology ?
        this._topology.getGeomSubsets().length : 0

      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        const desc = descs[descIdx]!

        if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
          continue
        }

        let geomSubsetTopologyIndexOffset = 0
        {
          const drawItem = new HdStDrawItem(this._rprimSharedData)
          const drawingCoord = drawItem.getDrawingCoord()
          repr.addDrawItem(drawItem)

          switch (desc.geomStyle) {
            case HdMeshGeomStyle.HdMeshGeomStyleHull:
            case HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnly:
            case HdMeshGeomStyle.HdMeshGeomStyleHullEdgeOnSurf:
            {
              geomSubsetTopologyIndexOffset = 1
              drawingCoord.setTopologyIndex(HdStMesh.HullTopology)
              if (!(this._customDirtyBitsInUse & HdStMesh.DirtyHullIndices)) {
                this._customDirtyBitsInUse |= HdStMesh.DirtyHullIndices
                dirtyBits.value |= HdStMesh.DirtyHullIndices
              }
              break
            }

            case HdMeshGeomStyle.HdMeshGeomStylePoints:
            {
              // in the current implementation, we use topology
              // for points too, to draw a subset of vertex primvars
              // (note that the points may be followed by the refined
              // vertices)
              drawingCoord.setTopologyIndex(HdStMesh.PointsTopology)
              if (!(this._customDirtyBitsInUse & HdStMesh.DirtyPointsIndices)) {
                this._customDirtyBitsInUse |= HdStMesh.DirtyPointsIndices
                dirtyBits.value |= HdStMesh.DirtyPointsIndices
              }
              break
            }

            default:
            {
              if (!(this._customDirtyBitsInUse & HdStMesh.DirtyIndices)) {
                this._customDirtyBitsInUse |= HdStMesh.DirtyIndices
                dirtyBits.value |= HdStMesh.DirtyIndices
              }
            }
          }

          // Set up drawing coord instance primvars.
          drawingCoord.setInstancePrimvarBaseIndex(
            HdStMesh.FreeSlot + 2 * numGeomSubsets)
        }

        // Allocate geom subset draw items
        if (desc.geomStyle !== HdMeshGeomStyle.HdMeshGeomStylePoints) {
          for (let i = 0; i < numGeomSubsets; ++i) {
            const drawItem = new HdStDrawItem(this._rprimSharedData)
            const drawingCoord = drawItem.getDrawingCoord()
            repr.addGeomSubsetDrawItem(drawItem)
            drawingCoord.setTopologyIndex(
              HdStMesh.FreeSlot + 2 * i +
                geomSubsetTopologyIndexOffset)
            drawingCoord.setInstancePrimvarBaseIndex(
              HdStMesh.FreeSlot + 2 * numGeomSubsets)
          }
        }

        if (desc.flatShadingEnabled) {
          if (!(this._customDirtyBitsInUse & HdStMesh.DirtyFlatNormals)) {
            this._customDirtyBitsInUse |= HdStMesh.DirtyFlatNormals
            dirtyBits.value |= HdStMesh.DirtyFlatNormals
          }
        } else {
          if (!(this._customDirtyBitsInUse & HdStMesh.DirtySmoothNormals)) {
            this._customDirtyBitsInUse |= HdStMesh.DirtySmoothNormals
            dirtyBits.value |= HdStMesh.DirtySmoothNormals
          }
        }
      } // for each repr desc for the repr
    } // if new repr
  }

  /** mesh.cpp:3155-3226 */
  protected _updateRepr(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    reprToken: TfToken | string,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const curRepr = this._getRepr(reprToken)
    if (!curRepr) {
      return
    }

    if (TfDebug.isEnabled(HdDebugCodes.HD_RPRIM_UPDATED)) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `HdStMesh::_UpdateRepr for ${this.getId()} : Repr = ${reprToken}\n`)
      // HdChangeTracker::DumpDirtyBits(*dirtyBits) is not ported; the bits
      // are printed in hex.
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `DirtyBits: 0x${(dirtyBits.value >>> 0).toString(16)}\n`)
    }

    const reprDescs = HdStMesh._getReprDesc(reprToken)

    // Iterate through all reprdescs for the current repr to figure out if any
    // of them requires smooth normals or flat normals. If either (or both)
    // are required, we will calculate them once and clean the bits.
    let requireSmoothNormals = false
    let requireFlatNormals = false
    for (let descIdx = 0; descIdx < reprDescs.length; ++descIdx) {
      const desc = reprDescs[descIdx]!
      if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
        continue
      }
      if (desc.flatShadingEnabled) {
        requireFlatNormals = true
      } else {
        requireSmoothNormals = true
      }
    }

    // For each relevant draw item, update dirty buffer sources.
    let drawItemIndex = 0
    let geomSubsetDescIndex = 0
    for (let descIdx = 0; descIdx < reprDescs.length; ++descIdx) {
      const desc = reprDescs[descIdx]!
      if (desc.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
        continue
      }

      const drawItem = curRepr.getDrawItem(drawItemIndex++) as HdStDrawItem

      if (HdChangeTracker.isDirty(dirtyBits.value)) {
        this._updateDrawItem(sceneDelegate,
          renderParam,
          drawItem,
          dirtyBits,
          reprToken,
          curRepr,
          desc,
          requireSmoothNormals,
          requireFlatNormals,
          geomSubsetDescIndex)
      }

      if (desc.geomStyle !== HdMeshGeomStyle.HdMeshGeomStylePoints) {
        geomSubsetDescIndex++
      }
    }

    dirtyBits.value &= ~HdChangeTracker.NewRepr
  }

  /** mesh.cpp:3228-3316 */
  protected _updateShadersForAllReprs(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    updateMaterialNetworkShader: boolean,
    updateGeometricShader: boolean,
  ): void {
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `(${this.getId()}) - Updating geometric and material shaders for draw ` +
      'items of all reprs.\n')

    const materialIsFinal = this.getDisplayStyle(sceneDelegate).materialIsFinal
    let materialIsFinalChanged = false

    for (const reprPair of this._reprs) {
      const reprToken = reprPair[0]
      const descs = HdStMesh._getReprDesc(reprToken)
      const repr = reprPair[1]

      let drawItemIndex = 0
      let geomSubsetDescIndex = 0
      // For each desc
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
          continue
        }

        // Update original draw item
        {
          const drawItem = repr.getDrawItem(drawItemIndex++) as HdStDrawItem

          if (materialIsFinal !== drawItem.getMaterialIsFinal()) {
            materialIsFinalChanged = true
          }
          drawItem.setMaterialIsFinal(materialIsFinal)

          if (updateMaterialNetworkShader) {
            const materialNetworkShader =
              HdStGetMaterialNetworkShader(this, sceneDelegate)
            drawItem.setMaterialNetworkShader(materialNetworkShader)
          }
          if (updateGeometricShader) {
            this._updateDrawItemGeometricShader(sceneDelegate, renderParam,
              drawItem, descs[descIdx]!, this.getMaterialId())
          }
        }

        // Update geom subset draw items if they exist
        if (descs[descIdx]!.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
          continue
        }

        const geomSubsets = this._topology!.getGeomSubsets()
        const numGeomSubsets = geomSubsets.length
        for (let i = 0; i < numGeomSubsets; ++i) {
          const materialId = geomSubsets[i]!.materialId

          const drawItem = repr.getDrawItemForGeomSubset(
            geomSubsetDescIndex, numGeomSubsets, i) as HdStDrawItem | null
          if (!TF_VERIFY(drawItem)) {
            continue
          }

          drawItem!.setMaterialIsFinal(materialIsFinal)

          if (updateMaterialNetworkShader) {
            const materialNetworkShader = HdStGetMaterialNetworkShader(
              this, sceneDelegate, materialId)
            drawItem!.setMaterialNetworkShader(materialNetworkShader)
          }
          if (updateGeometricShader) {
            this._updateDrawItemGeometricShader(sceneDelegate, renderParam,
              drawItem!, descs[descIdx]!, materialId)
          }
        }
        geomSubsetDescIndex++
      }
    }

    if (materialIsFinalChanged) {
      HdStMarkDrawBatchesDirty(renderParam)
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `${this.getId()}: Marking all batches dirty to trigger deep validation because ` +
        'the materialIsFinal was updated.\n')
    }
  }

  /** mesh.cpp:3318-3373 */
  protected _updateMaterialTagsForAllReprs(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
  ): void {
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `(${this.getId()}) - Updating material tags for draw items of all reprs.\n`)

    for (const reprPair of this._reprs) {
      const reprToken = reprPair[0]
      const descs = HdStMesh._getReprDesc(reprToken)
      const repr = reprPair[1]

      let drawItemIndex = 0
      let geomSubsetDescIndex = 0
      // For each desc
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid) {
          continue
        }

        // Update original draw item
        {
          const drawItem = repr.getDrawItem(drawItemIndex++) as HdStDrawItem
          HdStSetMaterialTag(sceneDelegate, renderParam, drawItem,
            this.getMaterialId(),
            (this._displayOpacityFromPrimvars || this._displayOpacityFromInstancer),
            this._displayInOverlay, this._occludedSelectionShowsThrough)
        }

        // Update geom subset draw items if they exist
        if (descs[descIdx]!.geomStyle === HdMeshGeomStyle.HdMeshGeomStylePoints) {
          continue
        }

        const geomSubsets = this._topology!.getGeomSubsets()
        const numGeomSubsets = geomSubsets.length
        for (let i = 0; i < numGeomSubsets; ++i) {
          const materialId = geomSubsets[i]!.materialId

          const drawItem = repr.getDrawItemForGeomSubset(
            geomSubsetDescIndex, numGeomSubsets, i) as HdStDrawItem | null
          if (!TF_VERIFY(drawItem)) {
            continue
          }
          HdStSetMaterialTag(sceneDelegate, renderParam, drawItem!,
            materialId,
            (this._displayOpacityFromPrimvars || this._displayOpacityFromInstancer),
            this._displayInOverlay, this._occludedSelectionShowsThrough)
        }
        geomSubsetDescIndex++
      }
    }
  }

  /** mesh.cpp:3375-3397 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    const mask = HdChangeTracker.Clean |
      HdChangeTracker.InitRepr |
      HdChangeTracker.DirtyCullStyle |
      HdChangeTracker.DirtyDoubleSided |
      HdChangeTracker.DirtyExtent |
      HdChangeTracker.DirtyNormals |
      HdChangeTracker.DirtyPoints |
      HdChangeTracker.DirtyPrimID |
      HdChangeTracker.DirtyPrimvar |
      HdChangeTracker.DirtyDisplayStyle |
      HdChangeTracker.DirtyRepr |
      HdChangeTracker.DirtyMaterialId |
      HdChangeTracker.DirtyTopology |
      HdChangeTracker.DirtyTransform |
      HdChangeTracker.DirtyVisibility |
      HdChangeTracker.DirtyInstancer

    return mask
  }
}

/** sources.push_back(source) for computations typed as possibly null here
 *  (HdSt_MeshTopology's Osd getters return null on their TF_VERIFY failure
 *  paths, where upstream returns an empty shared_ptr); upstream pushes the
 *  shared_ptr unconditionally. */
function _PushSource(sources: HdBufferSource[], source: HdBufferSource | null): void {
  if (source) {
    sources.push(source)
  }
}

/** mesh.cpp:1139-1158. Enqueues a quadrangulation computation to
 *  'computations' for the primvar data in 'source', */
function _QuadrangulatePrimvar(
  source: HdBufferSource,
  topology: HdSt_MeshTopology,
  id: string,
  computations: HdStComputationComputeQueuePairVector,
): void {
  if (!TF_VERIFY(computations)) {
    return
  }
  // GPU quadrangulation computation needs original vertices to be transfered
  const computation =
    topology.getQuadrangulateComputationGPU(
      source.getName(), source.getTupleType().type, _Path(id))
  // computation can be null for all quad mesh.
  if (computation) {
    computations.push([computation, _RefinePrimvarCompQueue])
  }
}

/** mesh.cpp:1160-1178 */
function _QuadrangulateFaceVaryingPrimvar(
  source: HdBufferSource,
  topology: HdSt_MeshTopology,
  id: string,
  resourceRegistry: HdStResourceRegistry,
): HdBufferSource {
  // note: currently we don't support GPU facevarying quadrangulation.

  // set quadrangulation as source instead of original source.
  const quadSource =
    topology.getQuadrangulateFaceVaryingComputation(source, _Path(id))

  // don't transfer source to gpu, it needs to be quadrangulated.
  // but it still has to be resolved, so add it to registry.
  resourceRegistry.addSource(source)

  return quadSource
}

/** mesh.cpp:1180-1194 */
function _TriangulateFaceVaryingPrimvar(
  source: HdBufferSource,
  topology: HdSt_MeshTopology,
  id: string,
  resourceRegistry: HdStResourceRegistry,
): HdBufferSource {
  const triSource =
    topology.getTriangulateFaceVaryingComputation(source, _Path(id))

  // don't transfer source to gpu, it needs to be triangulated.
  // but it still has to be resolved, so add it to registry.
  resourceRegistry.addSource(source)

  return triSource
}

/** mesh.cpp:1196-1221. Enqueues a refinement computation to 'computations'
 *  for the primvar data in 'source', */
function _RefinePrimvar(
  source: HdBufferSource,
  topology: HdSt_MeshTopology,
  resourceRegistry: HdStResourceRegistry,
  computations: HdStComputationComputeQueuePairVector,
  interpolation: HdSt_MeshTopologyInterpolation,
  channel = 0,
): void {
  if (!TF_VERIFY(computations)) {
    return
  }
  // GPU subdivision
  const computation =
    topology.getOsdRefineComputationGPU(
      source.getName(),
      source.getTupleType().type,
      resourceRegistry,
      interpolation,
      channel)
  // computation can be null for empty mesh
  if (computation) {
    computations.push([computation, _RefinePrimvarCompQueue])
  }
}

/** mesh.cpp:1223-1240 */
function _RefineOrQuadrangulateVertexAndVaryingPrimvar(
  source: HdBufferSource,
  topology: HdSt_MeshTopology,
  id: string,
  doRefine: boolean,
  doQuadrangulate: boolean,
  resourceRegistry: HdStResourceRegistry,
  computations: HdStComputationComputeQueuePairVector,
  interpolation: HdSt_MeshTopologyInterpolation,
): void {
  if (doRefine) {
    _RefinePrimvar(source, topology,
      resourceRegistry, computations, interpolation)
  } else if (doQuadrangulate) {
    _QuadrangulatePrimvar(source, topology, id, computations)
  }
}

/** mesh.cpp:1242-1268 */
function _RefineOrQuadrangulateOrTriangulateFaceVaryingPrimvar(
  source: HdBufferSource,
  topology: HdSt_MeshTopology,
  id: string,
  doRefine: boolean,
  doQuadrangulate: boolean,
  resourceRegistry: HdStResourceRegistry,
  computations: HdStComputationComputeQueuePairVector,
  channel: number,
): HdBufferSource {
  //
  // XXX: there is a bug of quad and tris confusion. see bug 121414
  //
  if (doRefine) {
    _RefinePrimvar(source, topology, resourceRegistry, computations,
      HdSt_MeshTopology.INTERPOLATE_FACEVARYING, channel)
  } else if (doQuadrangulate) {
    source = _QuadrangulateFaceVaryingPrimvar(source, topology, id,
      resourceRegistry)
  } else {
    source = _TriangulateFaceVaryingPrimvar(source, topology, id,
      resourceRegistry)
  }

  return source
}

/** mesh.cpp:1270-1277 */
function _GetDoubleSupport(resourceRegistry: HdStResourceRegistry): boolean {
  const capabilities = resourceRegistry.getHgi().getCapabilities()!
  return capabilities.isSet(
    HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)
}

/** mesh.cpp:2514-2521 */
function _CanUseTriangulatedFlatNormals(topology: HdSt_MeshTopology): boolean {
  // For triangle subdivison or subdivision scheme "none" we
  // can use triangulated flat normals.
  return topology.refinesToTriangles() ||
    topology.getScheme() === PxOsdOpenSubdivTokens.none
}
