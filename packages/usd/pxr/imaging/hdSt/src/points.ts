// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/points.cpp,
//  pxr/imaging/hdSt/points.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/points.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - HdDirtyBits* parameters are HdDirtyBitsRef boxes; bool* out-parameters
//   are `{ value }` boxes. SdfPath ids are path strings.
// - The shared data upstream reaches as `_sharedData` is HdRprim's
//   `_rprimSharedData` (hd/rprim.ts header).
// - The bitfield members are plain booleans.
// - Sync accepts the HdRprim union signature (hd/rprim.ts) and uses the
//   scene-delegate form.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, type Token as TfToken } from 'typescript-usd/tf'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  ChangeTracker as HdChangeTracker,
  DebugCodes as HdDebugCodes,
  DrawingCoord as HdDrawingCoord,
  HdPointsRprim as HdPoints,
  Interpolation as HdInterpolation,
  MeshGeomStyle as HdMeshGeomStyle,
  PointsGeomStyle as HdPointsGeomStyle,
  Repr as HdRepr,
  ReprTokens as HdReprTokens,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BufferSource as HdBufferSource,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type RenderIndex as HdRenderIndex,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HdStDrawItem } from './drawItem.ts'
import { HdSt_GetExtComputationPrimvarsComputations } from './extCompGpuComputation.ts'
import { HdSt_GeometricShader } from './geometricShader.ts'
import { HdSt_PointsShaderKey } from './pointsShaderKey.ts'
import {
  HdStCanSkipBARAllocationOrUpdate,
  HdStGetBufferSpecsFromCompuations,
  HdStGetMaterialNetworkShader,
  HdStGetPrimvarDescriptors,
  HdStGetRemovedPrimvarBufferSpecs,
  HdStIsPrimvarValidForDrawItem,
  HdStMarkGarbageCollectionNeeded,
  HdStPopulateConstantPrimvars,
  HdStSetMaterialId,
  HdStSetMaterialTag,
  HdStShouldPopulateConstantPrimvars,
  HdStUpdateDrawItemBAR,
  HdStUpdateInstancerData,
  HdStUpdateRenderTag,
} from './primUtils.ts'
import type { HdStRenderParam } from './renderParam.ts'
import type { HdStComputationComputeQueuePairVector, HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

function _GetResourceRegistry(renderIndex: HdRenderIndex): HdStResourceRegistry {
  return renderIndex.getResourceRegistry() as HdStResourceRegistry
}

/** points.h:30-92 */
export class HdStPoints extends HdPoints {
  // points.h:78-80 enum DrawingCoord
  static readonly InstancePrimvar = HdDrawingCoord.CustomSlotsBegin

  private _smoothHullRepr: HdRepr | null = null

  private _displayOpacityFromInstancer = false
  private _displayOpacityFromPrimvars = false
  private _displayInOverlay = false

  /** points.cpp:30-37 */
  constructor(id: string) {
    super(id)
  }

  /** points.cpp:41-46 */
  override updateRenderTag(delegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined): void {
    HdStUpdateRenderTag(delegate, renderParam, this,
      (d, r) => super.updateRenderTag(d, r))
  }

  /** points.cpp:49-83 */
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

    const displayOpacity =
      (this._displayOpacityFromInstancer || this._displayOpacityFromPrimvars)
    this._updateRepr(delegate, renderParam, reprToken, dirtyBits)

    if (updateMaterialTags ||
      (this.getMaterialId() === '' &&
        (displayOpacity !==
          (this._displayOpacityFromInstancer || this._displayOpacityFromPrimvars)))) {
      this._updateMaterialTagsForAllReprs(delegate, renderParam)
    }

    // This clears all the non-custom dirty bits. This ensures that the rprim
    // doesn't have pending dirty bits that add it to the dirty list every
    // frame.
    // XXX: GetInitialDirtyBitsMask sets certain dirty bits that aren't
    // reset (e.g. DirtyExtent, DirtyPrimID) that make this necessary.
    dirtyBits.value &= ~HdChangeTracker.AllSceneDirtyBits
  }

  /** points.cpp:85-110 */
  override finalize(renderParam: HdRenderParam | null | undefined): void {
    HdStMarkGarbageCollectionNeeded(renderParam)

    const stRenderParam = renderParam as unknown as HdStRenderParam

    // Decrement material tag counts for each draw item material tag
    if (this._reprs.length !== 0) {
      const reprToken = this._reprs[0]![0]
      const descs = HdStPoints._getReprDesc(reprToken)
      let drawItemIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdPointsGeomStyle.HdPointsGeomStyleInvalid) {
          continue
        }
        const drawItem = this._smoothHullRepr!.getDrawItem(drawItemIndex++) as HdStDrawItem
        stRenderParam.decreaseMaterialTagCount(drawItem.getMaterialTag() as TfToken)
      }
    }

    stRenderParam.decreaseRenderTagCount(this.getRenderTag())
  }

  /** points.cpp:112-193 */
  protected _updateDrawItem(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const id = this.getId()

    /* MATERIAL SHADER (may affect subsequent primvar population) */
    drawItem.setMaterialNetworkShader(
      HdStGetMaterialNetworkShader(this, sceneDelegate))

    if (dirtyBits.value & HdChangeTracker.DirtyDisplayStyle) {
      const ds = this.getDisplayStyle(sceneDelegate)
      this._displayInOverlay = ds.displayInOverlay
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

    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())

    const nativeRoundPoints =
      resourceRegistry.getHgi().getCapabilities()!.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints)

    const shaderKey = new HdSt_PointsShaderKey(nativeRoundPoints)
    drawItem.setGeometricShader(
      HdSt_GeometricShader.create(shaderKey, resourceRegistry))

    /* PRIMVAR */
    if (HdChangeTracker.isAnyPrimvarDirty(dirtyBits.value, id)) {
      this._populateVertexPrimvars(
        sceneDelegate, renderParam, drawItem, dirtyBits)
    }

    // VertexPrimvar may be null, if there are no points in the prim.

    TF_VERIFY(drawItem.getConstantPrimvarRange())
  }

  /** points.cpp:195-230 */
  protected _updateRepr(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    reprToken: string,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    // XXX: We only support smoothHull for now
    const descs = HdStPoints._getReprDesc(HdReprTokens.smoothHull)
    const curRepr = this._smoothHullRepr!

    if (TfDebug.isEnabled(HdDebugCodes.HD_RPRIM_UPDATED)) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `HdStPoints::_UpdateRepr for ${this.getId()} : Repr = ${reprToken}\n`)
      // HdChangeTracker::DumpDirtyBits(*dirtyBits) is not ported; the bits
      // are printed in hex.
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `DirtyBits: 0x${(dirtyBits.value >>> 0).toString(16)}\n`)
    }

    let drawItemIndex = 0
    for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
      const desc = descs[descIdx]!

      if (desc.geomStyle !== HdPointsGeomStyle.HdPointsGeomStyleInvalid) {
        const drawItem = curRepr.getDrawItem(drawItemIndex++) as HdStDrawItem
        if (HdChangeTracker.isDirty(dirtyBits.value)) {
          this._updateDrawItem(
            sceneDelegate, renderParam, drawItem, dirtyBits)
        }
      }
    }

    dirtyBits.value &= ~HdChangeTracker.NewRepr
  }

  /** points.cpp:232-357 */
  protected _populateVertexPrimvars(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
    drawItem: HdStDrawItem,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const id = this.getId()
    const resourceRegistry =
      _GetResourceRegistry(sceneDelegate.getRenderIndex())

    // Gather vertex and varying primvars
    let primvars = HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
      HdInterpolation.HdInterpolationVertex)
    {
      const varyingPvs =
        HdStGetPrimvarDescriptors(this, drawItem, sceneDelegate,
          HdInterpolation.HdInterpolationVarying)
      primvars = [...primvars, ...varyingPvs]
    }

    // Get computed vertex primvars
    const compPrimvars =
      sceneDelegate.getExtComputationPrimvarDescriptors(id,
        HdInterpolation.HdInterpolationVertex)

    const sources: HdBufferSource[] = []
    const reserveOnlySources: HdBufferSource[] = []
    const separateComputationSources: HdBufferSource[] = []
    const computations: HdStComputationComputeQueuePairVector = []

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
      if (!HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, primvar.name)) {
        continue
      }

      const value = this.getPrimvar(sceneDelegate, primvar.name)
      if (!HdStIsPrimvarValidForDrawItem(drawItem, primvar.name as TfToken, value)) {
        continue
      }

      const source = new HdVtBufferSource(primvar.name, value)
      sources.push(source)

      if (primvar.name === HdTokens.displayOpacity) {
        this._displayOpacityFromPrimvars = true
      }
    }

    const bar = drawItem.getVertexPrimvarRange()

    if (HdStCanSkipBARAllocationOrUpdate(
      sources, computations, bar, dirtyBits.value)) {
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
    HdBufferSpec.getBufferSpecs(reserveOnlySources, bufferSpecs)
    HdStGetBufferSpecsFromCompuations(computations, bufferSpecs)

    let usageHint: number =
      HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex
    if (computations.length !== 0) {
      usageHint |= HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage
    }
    const range =
      resourceRegistry.updateNonUniformBufferArrayRange(
        HdTokens.primvar, bar, bufferSpecs, removedSpecs, usageHint)

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
    for (const compSrc of separateComputationSources) {
      resourceRegistry.addSource(compSrc)
    }
  }

  /** points.cpp:359-388 */
  protected _updateMaterialTagsForAllReprs(
    sceneDelegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined,
  ): void {
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `(${this.getId()}) - Updating material tags for draw items of all reprs.\n`)

    // All reprs in _reprs point to same repr for now.
    if (this._reprs.length !== 0) {
      const reprToken = this._reprs[0]![0]
      const descs = HdStPoints._getReprDesc(reprToken)
      let drawItemIndex = 0
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        if (descs[descIdx]!.geomStyle === HdPointsGeomStyle.HdPointsGeomStyleInvalid) {
          continue
        }
        const drawItem = this._smoothHullRepr!.getDrawItem(drawItemIndex++) as HdStDrawItem
        HdStSetMaterialTag(sceneDelegate, renderParam, drawItem,
          this.getMaterialId(),
          this._displayOpacityFromPrimvars || this._displayOpacityFromInstancer,
          this._displayInOverlay,
          /*occludedSelectionShowsThrough = */false)
      }
    }
  }

  /** points.cpp:390-411 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    const mask = HdChangeTracker.Clean
      | HdChangeTracker.InitRepr
      | HdChangeTracker.DirtyExtent
      | HdChangeTracker.DirtyPoints
      | HdChangeTracker.DirtyPrimID
      | HdChangeTracker.DirtyPrimvar
      | HdChangeTracker.DirtyDisplayStyle
      | HdChangeTracker.DirtyRepr
      | HdChangeTracker.DirtyMaterialId
      | HdChangeTracker.DirtyTransform
      | HdChangeTracker.DirtyVisibility
      | HdChangeTracker.DirtyWidths
      | HdChangeTracker.DirtyInstancer

    return mask
  }

  /** points.cpp:413-417 */
  protected override _propagateDirtyBits(bits: HdDirtyBits): HdDirtyBits {
    return bits
  }

  /** points.cpp:419-454 */
  protected override _initRepr(reprToken: string, dirtyBits: HdDirtyBitsRef): void {
    // We only support smoothHull for now, everything else points to it.
    // TODO: Handle other styles
    if (!this._smoothHullRepr) {
      this._smoothHullRepr = new HdRepr()
      dirtyBits.value |= HdChangeTracker.NewRepr

      const descs = HdStPoints._getReprDesc(reprToken)
      // allocate all draw items
      for (let descIdx = 0; descIdx < descs.length; ++descIdx) {
        const desc = descs[descIdx]!

        if (desc.geomStyle !== HdPointsGeomStyle.HdPointsGeomStyleInvalid) {
          const drawItem = new HdStDrawItem(this._rprimSharedData)
          const drawingCoord = drawItem.getDrawingCoord()
          this._smoothHullRepr.addDrawItem(drawItem)

          // Set up drawing coord instance primvars.
          drawingCoord.setInstancePrimvarBaseIndex(
            HdStPoints.InstancePrimvar)
        }
      }
    }

    const it = this._reprs.find((r) => r[0] === reprToken)
    const isNew = it === undefined
    if (isNew) {
      // add new repr
      this._reprs.push([reprToken, this._smoothHullRepr])
    }
  }
}
