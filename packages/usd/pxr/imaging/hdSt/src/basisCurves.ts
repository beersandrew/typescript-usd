// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/basisCurves.cpp,
//  pxr/imaging/hdSt/basisCurves.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/basisCurves.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences (each also noted at its site):
// - HdDirtyBits* parameters are HdDirtyBitsRef boxes; bool* out-parameters
//   are `{ value }` boxes. SdfPath ids are path strings.
// - The shared data upstream reaches as `_sharedData` is HdRprim's
//   `_rprimSharedData` (hd/rprim.ts header).
// - HdTopology::ID values are bigints; the ArchHash64 of the `refined` bool
//   and of the usage hint hash the same little-endian bytes here.
// - The bitfield members are plain booleans.
// - Sync accepts the HdRprim union signature (hd/rprim.ts) and uses the
//   scene-delegate form.
// - FAITHFULNESS-DEBT(hdst-mesh-points-fastpath): the points fastpath
//   (basisCurves.cpp:931-1001) reads points and computed points from the
//   terminal scene index through HdExtComputationPrimvarsSchema /
//   HdPrimvarsSchema; as in mesh.ts, the authored points are read through
//   the scene delegate's vertex primvar descriptors, and computed points
//   are not considered.
// - ProcessVertexOrVaryingPrimvar's VtValue::IsHolding chain dispatches on
//   the array's element type name.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, type Token as TfToken } from 'typescript-usd/tf'
import { ArchHash64 } from 'typescript-usd/arch'
import {
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import type { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import {
  BasisCurvesGeomStyle as HdBasisCurvesGeomStyle,
  BasisCurvesReprDescTokens as HdBasisCurvesReprDescTokens,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  ChangeTracker as HdChangeTracker,
  DebugCodes as HdDebugCodes,
  DrawingCoord as HdDrawingCoord,
  GetValueTupleType as HdGetValueTupleType,
  HdBasisCurvesRprim as HdBasisCurves,
  Interpolation as HdInterpolation,
  MeshGeomStyle as HdMeshGeomStyle,
  Repr as HdRepr,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BasisCurvesReprDesc as HdBasisCurvesReprDesc,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type ExtComputationPrimvarDescriptor as HdExtComputationPrimvarDescriptor,
  type PrimvarDescriptor as HdPrimvarDescriptor,
  type RenderIndex as HdRenderIndex,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HdSt_BasisCurvesPrimvarInterpolaterComputation } from './basisCurvesComputations.ts'
import {
  HdSt_BasisCurvesShaderKey,
  HdSt_BasisCurvesShaderKeyDrawStyle,
  HdSt_BasisCurvesShaderKeyNormalStyle,
} from './basisCurvesShaderKey.ts'
import { HdSt_BasisCurvesTopology } from './basisCurvesTopology.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdStDrawItem } from './drawItem.ts'
import { HdSt_GetExtComputationPrimvarsComputations } from './extCompGpuComputation.ts'
import { HdSt_GeometricShader, HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import {
  HdStCanSkipBARAllocationOrUpdate,
  HdStGetBufferSpecsFromCompuations,
  HdStGetMaterialNetworkShader,
  HdStGetPrimvarDescriptors,
  HdStGetRemovedPrimvarBufferSpecs,
  HdStIsPrimvarValidForDrawItem,
  HdStMarkDrawBatchesDirty,
  HdStMarkGarbageCollectionNeeded,
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
import type { HdStComputationComputeQueuePairVector, HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

function _GetResourceRegistry(renderIndex: HdRenderIndex): HdStResourceRegistry {
  return renderIndex.getResourceRegistry() as HdStResourceRegistry
}

/** HF_VALIDATION_WARN (hf/diagnostic.h:23-26). */
function HF_VALIDATION_WARN(id: string, message: string): void {
  TF_WARN(`Invalid Hydra prim '${id}': ${message}`)
}

/** ArchHash64 of a value's little-endian bytes (see the header). */
function _HashBytes(bytes: Uint8Array, seed: bigint): bigint {
  return ArchHash64(bytes, bytes.length, seed)
}

/** basisCurves.cpp:246-264 */
function HdSt_PrimTypeToString(type: HdSt_GeometricShaderPrimitiveType): string {
  switch (type) {
    case HdSt_GeometricShaderPrimitiveType.PRIM_POINTS:
      return 'points'
    case HdSt_GeometricShaderPrimitiveType.PRIM_BASIS_CURVES_LINES:
      return 'lines'
    case HdSt_GeometricShaderPrimitiveType.PRIM_BASIS_CURVES_LINEAR_PATCHES:
      return 'patches[linear]'
    case HdSt_GeometricShaderPrimitiveType.PRIM_BASIS_CURVES_CUBIC_PATCHES:
      return 'patches[cubic]'
    default:
      TF_WARN('Unknown type')
      return 'unknown'
  }
}

/** The fallback value AddVertexOrVaryingPrimvarSource is given per element
 *  type (basisCurves.cpp:793-854), keyed by the VtArray element type name. */
const _fallbacks: Record<string, () => unknown> = {
  half: () => 1,
  float: () => 1,
  GfVec2f: () => new GfVec2f(1, 0),
  GfVec3f: () => new GfVec3f(1, 0, 0),
  GfVec4f: () => new GfVec4f(1, 0, 0, 1),
  double: () => 1,
  GfVec2d: () => new GfVec2d(1, 0),
  GfVec3d: () => new GfVec3d(1, 0, 0),
  GfVec4d: () => new GfVec4d(1, 0, 0, 1),
  int: () => 1,
  GfVec2i: () => new GfVec2i(1, 0),
  GfVec3i: () => new GfVec3i(1, 0, 0),
  GfVec4i: () => new GfVec4i(1, 0, 0, 1),
  short: () => 1,
  uint: () => 1,
  ushort: () => 1,
}

/** basisCurves.cpp:768-781 */
function AddVertexOrVaryingPrimvarSource<T>(id: string, name: string,
  interpolation: HdInterpolation, value: VtValue,
  topology: HdSt_BasisCurvesTopology,
  sources: HdBufferSource[], fallbackValue: T): void {
  const array = value.Get<VtArray<T>>()
  // Empty primvar arrays are ignored, except for points
  if (array.length !== 0 || name === HdTokens.points) {
    sources.push(
      new HdSt_BasisCurvesPrimvarInterpolaterComputation<T>(
        topology, array, id, name, interpolation, fallbackValue,
        HdGetValueTupleType(value).type))
  }
}

/** basisCurves.cpp:783-858 */
function ProcessVertexOrVaryingPrimvar(
  id: string, name: string, interpolation: HdInterpolation,
  value: VtValue, topology: HdSt_BasisCurvesTopology,
  sources: HdBufferSource[]): void {
  const elementType = value.isArrayValued() ? value.getElementType().getTypeName() : ''
  const fallback = _fallbacks[elementType]
  if (fallback) {
    AddVertexOrVaryingPrimvarSource(
      id, name, interpolation, value, topology, sources, fallback())
  } else {
    TF_WARN(`HdStBasisCurves(${id}) - Type of vertex or varying primvar ${name}` +
      ' not yet fully supported')
    sources.push(new HdVtBufferSource(name, value))
  }
}

/** basisCurves.h:43-171 */
export class HdStBasisCurves extends HdBasisCurves {
  // basisCurves.h:128-133 enum DrawingCoord
  static readonly HullTopology = HdDrawingCoord.CustomSlotsBegin
  static readonly PointsTopology = HdDrawingCoord.CustomSlotsBegin + 1
  static readonly InstancePrimvar = HdDrawingCoord.CustomSlotsBegin + 2 // has to be at the very end

  // basisCurves.h:135-139 enum DirtyBits
  static readonly DirtyIndices = HdChangeTracker.CustomBitsBegin
  static readonly DirtyHullIndices = HdStBasisCurves.DirtyIndices << 1
  static readonly DirtyPointsIndices = HdStBasisCurves.DirtyHullIndices << 1

  private _basisWidthInterpolation = false
  private _basisNormalInterpolation = false

  private _topology: HdSt_BasisCurvesTopology | null = null
  private _topologyId = 0n
  private _customDirtyBitsInUse: HdDirtyBits = 0
  private _refineLevel = 0  // XXX: could be moved into HdBasisCurveTopology.
  private _displayOpacityFromInstancer = false
  private _displayOpacityFromPrimvars = false
  private _displayInOverlay = false
  private _occludedSelectionShowsThrough = false
  private _pointsShadingEnabled = false

  /** basisCurves.cpp:46-59 */
  constructor(id: string) {
    super(id)
  }

  /** basisCurves.cpp:64-69 */
  override updateRenderTag(delegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined): void {
    HdStUpdateRenderTag(delegate, renderParam, this,
      (d, r) => super.updateRenderTag(d, r))
  }

  /** basisCurves.cpp:72-129 */
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
      HdChangeTracker.DirtyMaterialId |
      HdChangeTracker.DirtyTopology | // topological visibility
      HdChangeTracker.NewRepr)) {
      updateGeometricShader = true
    }

    const displayOpacity =
      this._displayOpacityFromInstancer || this._displayOpacityFromPrimvars
    this._updateRepr(delegate, renderParam, reprToken, dirtyBits)

    if (updateMaterialTags ||
      (this.getMaterialId() === '' &&
        displayOpacity !==
        (this._displayOpacityFromPrimvars || this._displayOpacityFromInstancer))) {
      this._updateMaterialTagsForAllReprs(delegate, renderParam)
    }

    if (updateMaterialNetworkShader || updateGeometricShader) {
      this._updateShadersForAllReprs(delegate, renderParam,
        updateMaterialNetworkShader, updateGeometricShader)
    }

    // This clears all the non-custom dirty bits. This ensures that the rprim
    // doesn't have pending dirty bits that add it to the dirty list every
    // frame.
    // XXX: GetInitialDirtyBitsMask sets certain dirty bits that aren't
    // reset (e.g. DirtyExtent, DirtyPrimID) that make this necessary.
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits
  }

  /** basisCurves.cpp:131-157 */
  /** The destructor (basisCurves.cpp:63 ~HdStBasisCurves): drops _topology, then HdRprim's
   *  members. */
  override destroy(): void {
    const topology = this._topology
    this._topology = null
    topology?.release()
    super.destroy()
  }

  override finalize(renderParam: HdRenderParam | null | undefined): void {
    HdStMarkGarbageCollectionNeeded(renderParam)

    const stRenderParam = renderParam as unknown as HdStRenderParam

    // Decrement material tag counts for each draw item material tag
    for (const reprPair of this._reprs) {
      const reprToken = reprPair[0]
      const descs = HdStBasisCurves._getReprDesc(reprToken)
      const repr = reprPair[1]
      let drawItemIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid) {
          continue
        }
        const drawItem = repr.getDrawItem(drawItemIndex++) as HdStDrawItem
        stRenderParam.decreaseMaterialTagCount(drawItem.getMaterialTag() as TfToken)
      }
    }
    stRenderParam.decreaseRenderTagCount(this.getRenderTag())
  }

  /** basisCurves.cpp:159-244 */
  protected _updateDrawItem(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
    desc: HdBasisCurvesReprDesc,
  ): void {
    const id = this.getId()

    /* MATERIAL SHADER (may affect subsequent primvar population) */
    if ((dirtyBits.value & HdChangeTracker.NewRepr) ||
      HdChangeTracker.isAnyPrimvarDirty(dirtyBits.value, id)) {
      drawItem.setMaterialNetworkShader(
        HdStGetMaterialNetworkShader(this, sceneDelegate))
    }

    // Reset value of _displayOpacity
    if (dirtyBits.value & HdChangeTracker.DirtyPrimvar) {
      this._displayOpacityFromPrimvars = false
    }

    /* INSTANCE PRIMVARS */
    this._updateInstancer(sceneDelegate, dirtyBits)
    {
      // HdStUpdateInstancerData doesn't write to output params if
      // DirtyInstancer is not set, so we initialize the locals to current
      // member values to preserve existing state in that case.
      const displayOpacityFromInstancer = { value: this._displayOpacityFromInstancer }
      HdStUpdateInstancerData(sceneDelegate.getRenderIndex(),
        renderParam,
        this,
        drawItem,
        this._rprimSharedData,
        dirtyBits.value,
        displayOpacityFromInstancer,
        null)
      this._displayOpacityFromInstancer = displayOpacityFromInstancer.value
    }

    /* CONSTANT PRIMVARS, TRANSFORM, EXTENT AND PRIMID */
    if (HdStShouldPopulateConstantPrimvars(dirtyBits, id)) {
      const hasDisplayOpacity = { value: false }
      HdStPopulateConstantPrimvars(this,
        this._rprimSharedData,
        sceneDelegate,
        renderParam,
        drawItem,
        dirtyBits,
        null, HdMeshGeomStyle.HdMeshGeomStyleInvalid, 0, 0,
        null, // hasMirroredTransform
        hasDisplayOpacity,
        null)

      if (hasDisplayOpacity.value) {
        this._displayOpacityFromPrimvars = true
      }
    }

    /* TOPOLOGY */
    // XXX: _PopulateTopology should be split into two phase
    //      for scene dirtybits and for repr dirtybits.
    if (dirtyBits.value & (HdChangeTracker.DirtyTopology |
      HdChangeTracker.DirtyDisplayStyle |
      HdStBasisCurves.DirtyIndices |
      HdStBasisCurves.DirtyHullIndices |
      HdStBasisCurves.DirtyPointsIndices)) {
      this._populateTopology(
        sceneDelegate, renderParam, drawItem, dirtyBits, desc)
    }

    /* PRIMVAR */
    if (HdChangeTracker.isAnyPrimvarDirty(dirtyBits.value, id)) {
      this._populateVertexPrimvars(
        sceneDelegate, renderParam, drawItem, dirtyBits)
    }
    if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      this._populateVaryingPrimvars(
        sceneDelegate, renderParam, drawItem, dirtyBits)
      this._populateElementPrimvars(
        sceneDelegate, renderParam, drawItem, dirtyBits)
    }

    // When we have multiple drawitems for the same prim we need to clean the
    // bits for all the data fields touched in this function, otherwise it
    // will try to extract topology (for instance) twice, and this won't
    // work with delegates that don't keep information around once extracted.
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits

    // Topology and VertexPrimvar may be null, if the curve has zero line
    // segments.
    TF_VERIFY(drawItem.getConstantPrimvarRange())
  }

  /** basisCurves.cpp:266-415 */
  protected _updateDrawItemGeometricShader(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    desc: HdBasisCurvesReprDesc,
  ): void {
    if (!TF_VERIFY(this._topology)) return
    const topology = this._topology!

    const renderIndex = sceneDelegate.getRenderIndex()

    const resourceRegistry = _GetResourceRegistry(renderIndex)

    let curveType: string = topology.getCurveType()
    let curveBasis: string = topology.getCurveBasis()
    const supportsRefinement = this._supportsRefinement(this._refineLevel)
    if (!supportsRefinement) {
      // XXX: Rendering non-linear (i.e., cubic) curves as linear segments
      // when unrefined can be confusing. Should we continue to do this?
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `HdStBasisCurves(${this.getId()}) - Downcasting curve type to linear because` +
        ' refinement is disabled.\n')
      curveType = HdTokens.linear
      curveBasis = ''
    }

    const DS = HdSt_BasisCurvesShaderKeyDrawStyle
    const NS = HdSt_BasisCurvesShaderKeyNormalStyle
    let drawStyle = DS.WIRE
    let normalStyle = NS.HAIR
    switch (desc.geomStyle) {
      case HdBasisCurvesGeomStyle.HdBasisCurvesGeomStylePoints:
      {
        drawStyle = DS.POINTS
        normalStyle = NS.HAIR
        break
      }
      case HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleWire:
      {
        drawStyle = DS.WIRE
        normalStyle = NS.HAIR
        break
      }
      case HdBasisCurvesGeomStyle.HdBasisCurvesGeomStylePatch:
      {
        if (this._supportsRefinement(this._refineLevel) &&
          this._supportsUserWidths(drawItem)) {
          if (this._supportsUserNormals(drawItem)) {
            drawStyle = DS.RIBBON
            normalStyle = NS.ORIENTED
          } else {
            if (this._refineLevel > 2) {
              normalStyle = NS.ROUND
              drawStyle = DS.HALFTUBE
            } else if (this._refineLevel > 1) {
              normalStyle = NS.ROUND
              drawStyle = DS.RIBBON
            } else {
              drawStyle = DS.RIBBON
              normalStyle = NS.HAIR
            }
          }
        }
        break
      }
      default:
      {
        TF_CODING_ERROR(`Invalid geomstyle in basis curve ${this.getId()} repr desc.`)
      }
    }

    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `HdStBasisCurves(${this.getId()}) - Building shader with keys: ${curveType}, ` +
      `${curveBasis}, ${DS[drawStyle]}, ${NS[normalStyle]}, ` +
      `${this._basisWidthInterpolation ? 'basis widths' : 'linear widths'}, ` +
      `${this._basisNormalInterpolation ? 'basis normals' : 'linear normals'}\n`)

    const hasAuthoredTopologicalVisiblity =
      !!drawItem.getTopologyVisibilityRange()

    // Process shadingTerminal (including shadingStyle)
    let shadingTerminal: TfToken = desc.shadingTerminal
    if (shadingTerminal === HdBasisCurvesReprDescTokens.surfaceShader) {
      const shadingStyleValue = sceneDelegate.getShadingStyle(this.getId())
      const shadingStyle = shadingStyleValue && !shadingStyleValue.IsEmpty() ?
        shadingStyleValue.Get<TfToken>() : ''
      if (shadingStyle === HdStTokens.constantLighting) {
        shadingTerminal = HdBasisCurvesReprDescTokens.surfaceShaderUnlit
      }
    }

    const hasMetalTessellation =
      resourceRegistry.getHgi().getCapabilities()!.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation)

    const nativeRoundPoints =
      resourceRegistry.getHgi().getCapabilities()!.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints)

    const shaderKey = new HdSt_BasisCurvesShaderKey(curveType,
      curveBasis,
      drawStyle,
      normalStyle,
      this._basisWidthInterpolation,
      this._basisNormalInterpolation,
      shadingTerminal,
      hasAuthoredTopologicalVisiblity,
      this._pointsShadingEnabled,
      hasMetalTessellation,
      nativeRoundPoints)

    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `HdStBasisCurves(${this.getId()}) - Shader Key PrimType: ` +
      `${HdSt_PrimTypeToString(shaderKey.primType)}\n `)

    const geomShader =
      HdSt_GeometricShader.create(shaderKey, resourceRegistry)

    TF_VERIFY(geomShader)

    if (geomShader !== drawItem.getGeometricShader()) {
      drawItem.setGeometricShader(geomShader)

      // If the gometric shader changes, we need to do a deep validation of
      // batches, so they can be rebuilt if necessary.
      HdStMarkDrawBatchesDirty(renderParam)

      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `${this.getId()}: Marking all batches dirty to trigger deep validation because` +
        ' the geometric shader was updated.\n')
    }
  }

  /** basisCurves.cpp:417-428 */
  protected override _propagateDirtyBits(bits: HdDirtyBits): HdDirtyBits {
    // propagate scene-based dirtyBits into rprim-custom dirtyBits
    if (bits & HdChangeTracker.DirtyTopology) {
      bits |= this._customDirtyBitsInUse &
        (HdStBasisCurves.DirtyIndices | HdStBasisCurves.DirtyHullIndices |
          HdStBasisCurves.DirtyPointsIndices | HdChangeTracker.DirtyPrimvar)
    }

    return bits
  }

  /** basisCurves.cpp:430-481 */
  protected override _initRepr(reprToken: string, dirtyBits: HdDirtyBitsRef): void {
    const it = this._reprs.find((r) => r[0] === reprToken)
    const isNew = it === undefined
    if (isNew) {
      const descs = HdStBasisCurves._getReprDesc(reprToken)

      // add new repr
      const repr = new HdRepr()
      this._reprs.push([reprToken, repr])

      dirtyBits.value |= HdChangeTracker.NewRepr

      // allocate all draw items
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        const desc = descs[descIdx]!

        if (desc.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid) {
          continue
        }

        const drawItem = new HdStDrawItem(this._rprimSharedData)
        const drawingCoord = drawItem.getDrawingCoord()
        repr.addDrawItem(drawItem)
        if (desc.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleWire) {
          // Why does geom style require this change?
          drawingCoord.setTopologyIndex(HdStBasisCurves.HullTopology)
          if (!(this._customDirtyBitsInUse & HdStBasisCurves.DirtyHullIndices)) {
            this._customDirtyBitsInUse |= HdStBasisCurves.DirtyHullIndices
            dirtyBits.value |= HdStBasisCurves.DirtyHullIndices
          }
        } else if (desc.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStylePoints) {
          drawingCoord.setTopologyIndex(HdStBasisCurves.PointsTopology)
          if (!(this._customDirtyBitsInUse & HdStBasisCurves.DirtyPointsIndices)) {
            this._customDirtyBitsInUse |= HdStBasisCurves.DirtyPointsIndices
            dirtyBits.value |= HdStBasisCurves.DirtyPointsIndices
          }
        } else {
          if (!(this._customDirtyBitsInUse & HdStBasisCurves.DirtyIndices)) {
            this._customDirtyBitsInUse |= HdStBasisCurves.DirtyIndices
            dirtyBits.value |= HdStBasisCurves.DirtyIndices
          }
        }

        // Set up drawing coord instance primvars.
        drawingCoord.setInstancePrimvarBaseIndex(
          HdStBasisCurves.InstancePrimvar)
      }
    }
  }

  /** basisCurves.cpp:483-525 */
  protected _updateRepr(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    reprToken: string,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const curRepr = this._getRepr(reprToken)
    if (!curRepr) {
      return
    }

    // Filter custom dirty bits to only those in use.
    dirtyBits.value &= (this._customDirtyBitsInUse |
      HdChangeTracker.AllSceneDirtyBits |
      HdChangeTracker.NewRepr)

    if (TfDebug.isEnabled(HdDebugCodes.HD_RPRIM_UPDATED)) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `HdStBasisCurves::_UpdateRepr for ${this.getId()} : Repr = ${reprToken}\n`)
      // HdChangeTracker::DumpDirtyBits(*dirtyBits) is not ported; the bits
      // are printed in hex.
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `DirtyBits: 0x${(dirtyBits.value >>> 0).toString(16)}\n`)
    }

    const reprDescs = HdStBasisCurves._getReprDesc(reprToken)

    let drawItemIndex = 0
    for (let descIdx = 0; descIdx < reprDescs.length; ++descIdx) {
      // curves don't have multiple draw items (for now)
      const desc = reprDescs[descIdx]!

      if (desc.geomStyle !== HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid) {
        const drawItem = curRepr.getDrawItem(drawItemIndex++) as HdStDrawItem

        if (HdChangeTracker.isDirty(dirtyBits.value)) {
          this._updateDrawItem(sceneDelegate, renderParam,
            drawItem, dirtyBits, desc)
        }
      }
    }

    dirtyBits.value &= ~HdChangeTracker.NewRepr
  }

  /** basisCurves.cpp:527-582 */
  protected _updateShadersForAllReprs(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    updateMaterialNetworkShader: boolean,
    updateGeometricShader: boolean,
  ): void {
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `(${this.getId()}) - Updating geometric and material shaders for draw ` +
      'items of all reprs.\n')

    let materialNetworkShader = null
    if (updateMaterialNetworkShader) {
      materialNetworkShader =
        HdStGetMaterialNetworkShader(this, sceneDelegate)
    }

    const materialIsFinal = this.getDisplayStyle(sceneDelegate).materialIsFinal
    let materialIsFinalChanged = false
    for (const reprPair of this._reprs) {
      const reprToken = reprPair[0]
      const descs = HdStBasisCurves._getReprDesc(reprToken)
      const repr = reprPair[1]
      let drawItemIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid) {
          continue
        }

        const drawItem = repr.getDrawItem(drawItemIndex++) as HdStDrawItem
        if (materialIsFinal !== drawItem.getMaterialIsFinal()) {
          materialIsFinalChanged = true
        }
        drawItem.setMaterialIsFinal(materialIsFinal)

        if (updateMaterialNetworkShader) {
          drawItem.setMaterialNetworkShader(materialNetworkShader)
        }
        if (updateGeometricShader) {
          this._updateDrawItemGeometricShader(
            sceneDelegate, renderParam, drawItem, descs[descIdx]!)
        }
      }
    }

    if (materialIsFinalChanged) {
      HdStMarkDrawBatchesDirty(renderParam)
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `${this.getId()}: Marking all batches dirty to trigger deep validation because ` +
        'the materialIsFinal was updated.\n')
    }
  }

  /** basisCurves.cpp:584-613 */
  protected _updateMaterialTagsForAllReprs(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
  ): void {
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `(${this.getId()}) - Updating material tags for draw items of all reprs.\n`)

    for (const reprPair of this._reprs) {
      const reprToken = reprPair[0]
      const descs = HdStBasisCurves._getReprDesc(reprToken)
      const repr = reprPair[1]
      let drawItemIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid) {
          continue
        }
        const drawItem = repr.getDrawItem(drawItemIndex++) as HdStDrawItem

        HdStSetMaterialTag(sceneDelegate, renderParam, drawItem,
          this.getMaterialId(),
          this._displayOpacityFromPrimvars || this._displayOpacityFromInstancer,
          this._displayInOverlay, this._occludedSelectionShowsThrough)
      }
    }
  }

  /** basisCurves.cpp:615-765 */
  protected _populateTopology(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
    desc: HdBasisCurvesReprDesc,
  ): void {
    const id = this.getId()
    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())
    const changeTracker =
      sceneDelegate.getRenderIndex().getChangeTracker()

    if (dirtyBits.value & HdChangeTracker.DirtyDisplayStyle) {
      const ds = this.getDisplayStyle(sceneDelegate)
      this._refineLevel = ds.refineLevel
      this._displayInOverlay = ds.displayInOverlay
      this._occludedSelectionShowsThrough = ds.occludedSelectionShowsThrough
      this._pointsShadingEnabled = ds.pointsShadingEnabled
    }

    // XXX: is it safe to get topology even if it's not dirty?
    const dirtyTopology = HdChangeTracker.isTopologyDirty(dirtyBits.value, id)

    if (dirtyTopology || HdChangeTracker.isDisplayStyleDirty(dirtyBits.value, id)) {
      const srcTopology = this.getBasisCurvesTopology(sceneDelegate)

      // Topological visibility (of points, curves) comes in as DirtyTopology.
      // We encode this information in a separate BAR.
      if (dirtyTopology) {
        // The points primvar is permitted to be larger than the number of
        // CVs implied by the topology.  So here we allow for
        // invisiblePoints being larger as well.
        const minInvisiblePointsCapacity = srcTopology.getNumPoints()

        HdStProcessTopologyVisibility(
          srcTopology.getInvisibleCurves(),
          srcTopology.getNumCurves(),
          srcTopology.getInvisiblePoints(),
          minInvisiblePointsCapacity,
          this._rprimSharedData,
          drawItem,
          renderParam,
          changeTracker,
          resourceRegistry,
          id)
      }

      // compute id.
      this._topologyId = srcTopology.computeHash()
      const refined = (this._refineLevel > 0)
      this._topologyId = _HashBytes(Uint8Array.of(refined ? 1 : 0),
        this._topologyId)

      // ask the registry if there is a sharable basisCurves topology
      const topologyInstance =
        resourceRegistry.registerBasisCurvesTopology(this._topologyId)

      if (topologyInstance.isFirstInstance()) {
        // if this is the first instance, create a new stream topology
        // representation and use that.
        const topology = HdSt_BasisCurvesTopology.new(srcTopology)

        topologyInstance.setValue(topology)
      }

      // The member's shared_ptr assignment (FAITHFULNESS-DEBT(
      // hd-instance-use-count), hd/src/instanceRegistry.ts).
      const topology = topologyInstance.GetValue() as HdSt_BasisCurvesTopology
      if (this._topology !== topology) {
        topology?._retain()
        this._topology?.release()
        this._topology = topology
      }
      TF_VERIFY(this._topology)

      // hash collision check
      if (TfDebug.isEnabled(HdDebugCodes.HD_SAFE_MODE)) {
        TF_VERIFY(srcTopology.Equals(this._topology))
      }
    }

    // bail out if the index bar is already synced
    let indexToken: TfToken
    if (drawItem.getDrawingCoord().getTopologyIndex() ===
      HdStBasisCurves.HullTopology) {
      if ((dirtyBits.value & HdStBasisCurves.DirtyHullIndices) === 0) return
      dirtyBits.value &= ~HdStBasisCurves.DirtyHullIndices
      indexToken = HdTokens.hullIndices as TfToken
    } else if (drawItem.getDrawingCoord().getTopologyIndex() ===
      HdStBasisCurves.PointsTopology) {
      if ((dirtyBits.value & HdStBasisCurves.DirtyPointsIndices) === 0) return
      dirtyBits.value &= ~HdStBasisCurves.DirtyPointsIndices
      indexToken = HdTokens.pointsIndices as TfToken
    } else {
      if ((dirtyBits.value & HdStBasisCurves.DirtyIndices) === 0) return
      dirtyBits.value &= ~HdStBasisCurves.DirtyIndices
      indexToken = HdTokens.indices as TfToken
    }

    {
      let usageHint =
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex |
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
      // Set up the usage hints to mark topology as varying if
      // there is a previously set range.
      if (drawItem.getTopologyRange()) {
        usageHint |= HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsSizeVarying
      }

      let rangeId = this._topologyId
      rangeId = _HashBytes(new Uint8Array(Uint32Array.of(usageHint).buffer),
        rangeId)

      const rangeInstance =
        resourceRegistry.registerBasisCurvesIndexRange(
          rangeId, indexToken)

      if (rangeInstance.isFirstInstance()) {
        const sources: HdBufferSource[] = []
        const bufferSpecs: HdBufferSpec[] = []

        if (desc.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStylePoints) {
          sources.push(
            this._topology!.getPointsIndexBuilderComputation())
        } else {
          sources.push(this._topology!.getIndexBuilderComputation(
            !this._supportsRefinement(this._refineLevel)))
        }

        HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

        // allocate new range
        const range = resourceRegistry.allocateNonUniformBufferArrayRange(
          HdTokens.topology, bufferSpecs, usageHint)

        // add sources to update queue
        resourceRegistry.addSources(range!, sources)
        rangeInstance.setValue(range!)
      }

      const newRange = rangeInstance.GetValue()

      HdStUpdateDrawItemBAR(
        newRange,
        drawItem.getDrawingCoord().getTopologyIndex(),
        this._rprimSharedData,
        renderParam,
        changeTracker)
    }
  }

  /** basisCurves.cpp:860-1108 */
  protected _populateVertexPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const id = this.getId()
    const renderIndex = sceneDelegate.getRenderIndex()
    const resourceRegistry = _GetResourceRegistry(renderIndex)

    let primvars: HdPrimvarDescriptor[] = []
    let compPrimvars: HdExtComputationPrimvarDescriptor[] = []

    const sources: HdBufferSource[] = []
    const reserveOnlySources: HdBufferSource[] = []
    const separateComputationSources: HdBufferSource[] = []
    const computations: HdStComputationComputeQueuePairVector = []

    if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
      // The "points" attribute is expected to be in these lists.
      primvars = HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationVertex)
      compPrimvars = sceneDelegate.getExtComputationPrimvarDescriptors(id,
        HdInterpolation.HdInterpolationVertex)

      // Process computed primvars...
      HdSt_GetExtComputationPrimvarsComputations(
        id,
        sceneDelegate,
        compPrimvars,
        dirtyBits.value,
        sources,
        reserveOnlySources,
        separateComputationSources,
        computations)

      for (const primvar of primvars) {
        if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name))
          continue

        // TODO: We don't need to pull primvar metadata every time a value
        // changes, but we need support from the delegate.

        // Having a null topology is possible, but shouldn't happen when
        // there are points
        if (!this._topology) {
          if (primvar.name === HdTokens.points) {
            TF_CODING_ERROR(`No topology set for BasisCurve ${id.slice(id.lastIndexOf('/') + 1)}`)
            break
          }
          continue
        }

        //assert name not in range.bufferArray.GetResources()
        const value = this.getPrimvar(sceneDelegate, primvar.name)
        if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name as TfToken, value)) {
          continue
        }
        ProcessVertexOrVaryingPrimvar(id, primvar.name,
          HdInterpolation.HdInterpolationVertex, value, this._topology, sources)

        if (primvar.name === HdTokens.displayOpacity) {
          this._displayOpacityFromPrimvars = true
        }
      }
    }

    // Points fastpath; it's possible points was updated above, but if
    // points is dirty and we skipped the above loops let's handle it here.
    if ((dirtyBits.value & HdChangeTracker.DirtyPoints) &&
      !((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
        (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
        (dirtyBits.value & HdChangeTracker.DirtyPrimvar))) {
      if (!this._topology) {
        TF_CODING_ERROR(`No topology set for BasisCurve ${id.slice(id.lastIndexOf('/') + 1)}`)
      }

      // FAITHFULNESS-DEBT(hdst-mesh-points-fastpath): upstream reads the
      // prim from renderIndex.GetTerminalSceneIndex() and checks
      // HdExtComputationPrimvarsSchema (computed points,
      // basisCurves.cpp:946-971) and HdPrimvarsSchema (authored points,
      // basisCurves.cpp:973-1000); as in mesh.ts the authored points
      // primvar is found through the scene delegate's vertex primvar
      // descriptors instead.
      const pointsDescs = sceneDelegate.getPrimvarDescriptors(id,
        HdInterpolation.HdInterpolationVertex).filter((pd) => pd.name === HdTokens.points)
      if (pointsDescs.length !== 0 && this._topology) {
        const pd = pointsDescs[0]!
        primvars.push(pd)
        const value = this.getPrimvar(sceneDelegate, HdTokens.points)
        if (HdStIsPrimvarValidForDrawItem(
          drawItem, HdTokens.points as TfToken, value)) {
          ProcessVertexOrVaryingPrimvar(id, pd.name,
            HdInterpolation.HdInterpolationVertex, value, this._topology, sources)
        }
      }
    }

    const bar = drawItem.getVertexPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(sources, computations, bar,
      dirtyBits.value)) {
      return
    }

    // XXX: This should be based off the DirtyPrimvarDesc bit.
    const hasDirtyPrimvarDesc =
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar) ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths)

    let removedSpecs: HdBufferSpec[] = []
    if (hasDirtyPrimvarDesc) {
      const internallyGeneratedPrimvars: TfToken[] = [] // none
      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, primvars,
        compPrimvars, internallyGeneratedPrimvars, id)
    }

    const bufferSpecs: HdBufferSpec[] = []
    HdBufferSpec.getBufferSpecs(sources, bufferSpecs)
    HdBufferSpec.getBufferSpecs(reserveOnlySources, bufferSpecs)
    HdStGetBufferSpecsFromCompuations(computations, bufferSpecs)

    const range =
      resourceRegistry.updateNonUniformBufferArrayRange(
        HdTokens.primvar, bar, bufferSpecs, removedSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex)

    HdStUpdateDrawItemBAR(
      range,
      drawItem.getDrawingCoord().getVertexPrimvarIndex(),
      this._rprimSharedData,
      renderParam,
      sceneDelegate.getRenderIndex().getChangeTracker())

    if (sources.length !== 0 || computations.length !== 0) {
      // If sources or computations are to be queued against the resulting
      // BAR, we expect it to be valid.
      if (!TF_VERIFY(drawItem.getVertexPrimvarRange()!.isValid())) {
        return
      }
    }

    // add sources to update queue
    if (sources.length !== 0) {
      resourceRegistry.addSources(drawItem.getVertexPrimvarRange()!, sources)
    }
    // add gpu computations to queue.
    for (const [comp, queue] of computations) {
      resourceRegistry.addComputation(
        drawItem.getVertexPrimvarRange()!, comp, queue)
    }
    for (const src of separateComputationSources) {
      resourceRegistry.addSource(src)
    }
  }

  /** basisCurves.cpp:1110-1196 */
  protected _populateVaryingPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const id = this.getId()
    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())

    // Gather varying primvars
    const primvars =
      HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationVarying)

    this._basisWidthInterpolation = true
    // If we don't find varying normals, then we are assuming
    // implicit normals or prescribed basis normals. (For implicit
    // normals, varying might be the right fallback behavior, but
    // leaving as basis for now to preserve the current behavior
    // until we get can do a better pass on curve normals.)
    this._basisNormalInterpolation = true

    const sources: HdBufferSource[] = []

    for (const primvar of primvars) {
      if (primvar.name === HdTokens.widths) {
        this._basisWidthInterpolation = false
      } else if (primvar.name === HdTokens.normals) {
        this._basisNormalInterpolation = false
      } else if (primvar.name === HdTokens.points) {
        HF_VALIDATION_WARN(id, 'varying-interpolation points!')
        continue
      }

      if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name)) {
        continue
      }

      // TODO: We don't need to pull primvar metadata every time a value
      // changes, but we need support from the delegate.

      //assert name not in range.bufferArray.GetResources()
      const value = this.getPrimvar(sceneDelegate, primvar.name)
      if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name as TfToken, value)) {
        continue
      }
      ProcessVertexOrVaryingPrimvar(id, primvar.name,
        HdInterpolation.HdInterpolationVarying, value, this._topology!, sources)

      if (primvar.name === HdTokens.displayOpacity) {
        this._displayOpacityFromPrimvars = true
      }
    }

    const bar = drawItem.getVaryingPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(sources, bar, dirtyBits.value)) {
      return
    }

    // XXX: This should be based off the DirtyPrimvarDesc bit.
    const hasDirtyPrimvarDesc =
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar) ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths)

    let removedSpecs: HdBufferSpec[] = []
    if (hasDirtyPrimvarDesc) {
      const internallyGeneratedPrimvars: TfToken[] = [] // none
      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, primvars,
        internallyGeneratedPrimvars, id)
    }

    const bufferSpecs: HdBufferSpec[] = []
    HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

    const range =
      resourceRegistry.updateNonUniformBufferArrayRange(
        HdTokens.primvar, bar, bufferSpecs, removedSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

    HdStUpdateDrawItemBAR(
      range,
      drawItem.getDrawingCoord().getVaryingPrimvarIndex(),
      this._rprimSharedData,
      renderParam,
      sceneDelegate.getRenderIndex().getChangeTracker())

    // add sources to update queue
    if (sources.length !== 0) {
      if (!TF_VERIFY(drawItem.getVaryingPrimvarRange()!.isValid())) {
        return
      }
      resourceRegistry.addSources(drawItem.getVaryingPrimvarRange()!, sources)
    }
  }

  /** basisCurves.cpp:1198-1282 */
  protected _populateElementPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const id = this.getId()
    const renderIndex = sceneDelegate.getRenderIndex()
    const resourceRegistry = _GetResourceRegistry(renderIndex)

    const uniformPrimvars =
      HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
        HdInterpolation.HdInterpolationUniform)

    const sources: HdBufferSource[] = []

    const numCurves = this._topology ? this._topology.getNumCurves() : 0

    for (const primvar of uniformPrimvars) {
      if (primvar.name === HdTokens.points) {
        HF_VALIDATION_WARN(id, 'uniform-interpolation points!')
        continue
      }
      if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name))
        continue

      const value = this.getPrimvar(sceneDelegate, primvar.name)
      if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name as TfToken, value)) {
        continue
      }
      const source = new HdVtBufferSource(primvar.name, value)

      // verify primvar length
      if (source.getNumElements() !== numCurves) {
        HF_VALIDATION_WARN(id,
          `# of curves mismatch (${source.getNumElements()} != ${numCurves}) for uniform primvar ` +
          `${primvar.name}`)
        continue
      }

      sources.push(source)

      if (primvar.name === HdTokens.displayOpacity) {
        this._displayOpacityFromPrimvars = true
      }
    }

    const bar = drawItem.getElementPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(sources, bar, dirtyBits.value)) {
      return
    }

    // XXX: This should be based off the DirtyPrimvarDesc bit.
    const hasDirtyPrimvarDesc =
      (dirtyBits.value & HdChangeTracker.DirtyPrimvar) ||
      (dirtyBits.value & HdChangeTracker.DirtyNormals) ||
      (dirtyBits.value & HdChangeTracker.DirtyWidths)

    let removedSpecs: HdBufferSpec[] = []
    if (hasDirtyPrimvarDesc) {
      const internallyGeneratedPrimvars: TfToken[] = [] // none
      removedSpecs = HdStGetRemovedPrimvarBufferSpecs(bar, uniformPrimvars,
        internallyGeneratedPrimvars, id)
    }

    const bufferSpecs: HdBufferSpec[] = []
    HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

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

    if (sources.length !== 0) {
      // If sources are to be queued against the resulting BAR, we expect it
      // to be valid.
      if (!TF_VERIFY(drawItem.getElementPrimvarRange()!.isValid())) {
        return
      }
      resourceRegistry.addSources(drawItem.getElementPrimvarRange()!, sources)
    }
  }

  /** basisCurves.cpp:1314-1324 */
  protected _supportsRefinement(refineLevel: number): boolean {
    if (!this._topology) {
      TF_CODING_ERROR('Calling _SupportsRefinement before topology is set')
      return false
    }

    return refineLevel > 0 || HdBasisCurves.isEnabledForceRefinedCurves()
  }

  /** basisCurves.cpp:1326-1329 */
  protected _supportsUserWidths(drawItem: HdStDrawItem): boolean {
    return HdSt_HasResource(drawItem, HdTokens.widths as TfToken)
  }

  /** basisCurves.cpp:1330-1333 */
  protected _supportsUserNormals(drawItem: HdStDrawItem): boolean {
    return HdSt_HasResource(drawItem, HdTokens.normals as TfToken)
  }

  /** basisCurves.cpp:1335-1357 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    const mask = HdChangeTracker.Clean
      | HdChangeTracker.InitRepr
      | HdChangeTracker.DirtyExtent
      | HdChangeTracker.DirtyNormals
      | HdChangeTracker.DirtyPoints
      | HdChangeTracker.DirtyPrimID
      | HdChangeTracker.DirtyPrimvar
      | HdChangeTracker.DirtyDisplayStyle
      | HdChangeTracker.DirtyRepr
      | HdChangeTracker.DirtyMaterialId
      | HdChangeTracker.DirtyTopology
      | HdChangeTracker.DirtyTransform
      | HdChangeTracker.DirtyVisibility
      | HdChangeTracker.DirtyWidths
      | HdChangeTracker.DirtyComputationPrimvarDesc
      | HdChangeTracker.DirtyInstancer

    return mask
  }

  /** basisCurves.cpp:1359-1391 */
  override getBuiltinPrimvarNames(): readonly TfToken[] {
    // screenSpaceWidths toggles the interpretation of widths to be in
    // screen-space pixels.  We expect this to be useful for implementing guides
    // or other UI elements drawn with BasisCurves.  The pointsSizeScale primvar
    // similarly is intended to give clients a way to emphasize or supress
    // certain  points by scaling their default size.

    // minScreenSpaceWidth gives a minimum screen space width in pixels for
    // BasisCurves when rendered as tubes or camera-facing ribbons. We expect
    // this to be useful for preventing thin curves such as hair from
    // undesirably aliasing when their screen space width would otherwise dip
    // below one pixel.

    // pointSizeScale, screenSpaceWidths, and minScreenSpaceWidths are
    // explicitly claimed here as "builtin" primvar names because they are
    // consumed in the low-level baisCurves.glslfx rather than declared as
    // inputs in any material shader's metadata.  Mentioning them here means
    // they will always survive primvar filtering.
    return HdStBasisCurves._primvarNamesSt ??= [
      ...super.getBuiltinPrimvarNames(),
      HdStTokens.pointSizeScale,
      HdStTokens.screenSpaceWidths,
      HdStTokens.minScreenSpaceWidths,
    ]
  }
  private static _primvarNamesSt: readonly TfToken[] | null = null
}

/** basisCurves.cpp:1284-1312 */
function HdSt_HasResource(drawItem: HdStDrawItem, resourceToken: TfToken): boolean {
  // Check for authored resource, we could leverage dirtyBits here as an
  // optimization, however the BAR is the ground truth, so until there is a
  // known performance issue, we just check them explicitly.
  let hasAuthoredResouce = false

  const has = (bar: HdBufferArrayRange | null | undefined): boolean =>
    !!bar && !!(bar as HdStBufferArrayRange).getResource(resourceToken)

  hasAuthoredResouce ||= has(drawItem.getConstantPrimvarRange())
  hasAuthoredResouce ||= has(drawItem.getVertexPrimvarRange())
  hasAuthoredResouce ||= has(drawItem.getVaryingPrimvarRange())
  hasAuthoredResouce ||= has(drawItem.getElementPrimvarRange())
  const instanceNumLevels = drawItem.getInstancePrimvarNumLevels()
  for (let i = 0; i < instanceNumLevels; ++i) {
    hasAuthoredResouce ||= has(drawItem.getInstancePrimvarRange(i))
  }
  return hasAuthoredResouce
}
