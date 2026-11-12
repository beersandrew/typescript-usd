// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/primUtils.cpp,
//  pxr/imaging/hdSt/primUtils.h, pxr/imaging/hf/diagnostic.h
// Copyright 2018, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/primUtils.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences (each also noted at its site):
// - Out-parameters are `{ value }` boxes (bool*) or caller-provided arrays
//   (HdBufferSpecVector*); a null box is the upstream nullptr.
// - The overloads of HdStCanSkipBARAllocationOrUpdate,
//   HdStGetRemovedPrimvarBufferSpecs,
//   HdStGetRemovedOrReplacedPrimvarBufferSpecs, HdStSetMaterialTag,
//   HdStGetMaterialNetworkShader and HdStPopulateConstantPrimvars dispatch
//   on their arguments, as JS has no overloads.
// - SdfPath ids are path strings (hd's convention); the empty path is ''.
// - ArchHash64 seeds take the 64-bit ids as bigints; uint64/size_t values
//   hashed by address and size upstream are hashed as their little-endian
//   bytes. HdStComputeSharedPrimvarId is a cache key only.
// - HF_VALIDATION_WARN (hf/diagnostic.h:23-26) is spelled locally, hf is
//   not a library of this repository.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Token as TfToken, Type as TfType, Debug as TfDebug, HashCombine as TfHashCombine,
  TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import { ArchHash64 } from 'typescript-usd/arch'
import { Vec4f as GfVec4f, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes, Array as VtArray } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  BufferSpecEquals as HdBufferSpecEquals,
  ChangeTracker as HdChangeTracker,
  DebugCodes as HdDebugCodes,
  Instancer as HdInstancer,
  InstancerTokens as HdInstancerTokens,
  Interpolation as HdInterpolation,
  MaterialTagTokens as HdMaterialTagTokens,
  MeshGeomStyle as HdMeshGeomStyle,
  PrimTypeTokens as HdPrimTypeTokens,
  Tokens as HdTokens,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferArrayUsageHint as HdBufferArrayUsageHint,
  type BufferSource as HdBufferSource,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type DrawItem as HdDrawItem,
  type ExtComputationPrimvarDescriptor as HdExtComputationPrimvarDescriptor,
  type PrimvarDescriptor as HdPrimvarDescriptor,
  type RenderIndex as HdRenderIndex,
  type RenderParam as HdRenderParam,
  type Repr as HdRepr,
  type Rprim as HdRprim,
  type RprimChangeTracker as HdRprimChangeTracker,
  type RprimSharedData as HdRprimSharedData,
  type SceneDelegate as HdSceneDelegate,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdStDebugCodes } from './debugCodes.ts'
import type { HdStDrawItem } from './drawItem.ts'
import { HdStGLSLFXShader } from './glslfxShader.ts'
import type { HdStInstancer } from './instancer.ts'
import type { HdStMaterial } from './material.ts'
import type { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import { HdStPackageOverlayShader } from './package.ts'
import type { HdStRenderParam } from './renderParam.ts'
import { HdSt_OsdRefineComputationGPU } from './subdivision.ts'
import type {
  HdStComputationComputeQueuePairVector,
  HdStResourceRegistry,
} from './resourceRegistry.ts'
import {
  HdStDefaultTransparencyModeTokens,
  HdStMaterialTagTokens,
  HdStRenderSettingsTokens,
} from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** HF_VALIDATION_WARN (hf/diagnostic.h:23-26). */
function HF_VALIDATION_WARN(id: string, message: string): void {
  TF_WARN(`Invalid Hydra prim '${id}': ${message}`)
}

/** HdStRenderParam's renderParam argument, as upstream static_casts it. */
function _St(renderParam: HdRenderParam | null | undefined): HdStRenderParam {
  return renderParam as unknown as HdStRenderParam
}

/** renderIndex.GetResourceRegistry() as the HdStResourceRegistry it is. */
function _GetResourceRegistry(renderIndex: HdRenderIndex): HdStResourceRegistry {
  return renderIndex.getResourceRegistry() as HdStResourceRegistry
}

/** primUtils.cpp:48-49 */
const HDST_ENABLE_SHARED_VERTEX_PRIMVAR = new TfEnvSetting<boolean>(
  'HDST_ENABLE_SHARED_VERTEX_PRIMVAR', true,
  'Enable sharing of vertex primvar')

/** primUtils.cpp:51-57 (TF_MAKE_STATIC_DATA _fallbackOverlayShader). */
let _fallbackOverlayShader: HdSt_MaterialNetworkShader | null = null
function _GetFallbackOverlayShader(): HdSt_MaterialNetworkShader {
  if (!_fallbackOverlayShader) {
    _fallbackOverlayShader = new HdStGLSLFXShader(
      new HioGlslfx(HdStPackageOverlayShader()))
  }
  return _fallbackOverlayShader
}

// -----------------------------------------------------------------------------
// Draw invalidation utilities
// -----------------------------------------------------------------------------

/** primUtils.cpp:62-70 */
export function HdStMarkDrawBatchesDirty(renderParam: HdRenderParam | null | undefined): void {
  if (TF_VERIFY(renderParam)) {
    _St(renderParam).markDrawBatchesDirty()
  }
}

/** primUtils.cpp:72-80 */
export function HdStMarkMaterialTagsDirty(renderParam: HdRenderParam | null | undefined): void {
  if (TF_VERIFY(renderParam)) {
    _St(renderParam).markMaterialTagsDirty()
  }
}

/** primUtils.cpp:82-90 */
export function HdStMarkGeomSubsetDrawItemsDirty(
  renderParam: HdRenderParam | null | undefined): void {
  if (TF_VERIFY(renderParam)) {
    _St(renderParam).markGeomSubsetDrawItemsDirty()
  }
}

/** primUtils.cpp:92-100 */
export function HdStMarkGarbageCollectionNeeded(
  renderParam: HdRenderParam | null | undefined): void {
  if (TF_VERIFY(renderParam)) {
    _St(renderParam).setGarbageCollectionNeeded()
  }
}

// -----------------------------------------------------------------------------
// Primvar descriptor filtering utilities
// -----------------------------------------------------------------------------

/** primUtils.cpp:105-112 */
function _IsEnabledPrimvarFiltering(drawItem: HdStDrawItem): boolean {
  const materialNetworkShader = drawItem.getMaterialNetworkShader()
  return !!materialNetworkShader &&
    materialNetworkShader.isEnabledPrimvarFiltering()
}

/** primUtils.cpp:114-125 */
function _GetFilterNamesForMaterial(drawItem: HdStDrawItem): readonly TfToken[] {
  const materialNetworkShader = drawItem.getMaterialNetworkShader()
  if (materialNetworkShader) {
    return materialNetworkShader.getPrimvarNames()
  }
  return []
}

/** primUtils.cpp:127-143 */
function _GetFilterNames(
  prim: HdRprim,
  drawItem: HdStDrawItem,
  instancer: HdStInstancer | null = null,
): TfToken[] {
  const filterNames: TfToken[] = [...prim.getBuiltinPrimvarNames()]

  const matPvNames = _GetFilterNamesForMaterial(drawItem)
  filterNames.push(...matPvNames)

  if (instancer) {
    const names = HdInstancer.getBuiltinPrimvarNames()
    filterNames.push(...names)
  }
  return filterNames
}

/** primUtils.cpp:145-158 */
function _FilterPrimvarDescriptors(
  primvars: HdPrimvarDescriptor[],
  filterNames: readonly TfToken[],
): HdPrimvarDescriptor[] {
  return primvars.filter((desc) => filterNames.includes(desc.name))
}

/** primUtils.cpp:160-208 */
export function HdStGetPrimvarDescriptors(
  prim: HdRprim,
  drawItem: HdStDrawItem,
  delegate: HdSceneDelegate,
  interpolation: HdInterpolation,
  repr: HdRepr | null = null,
  descGeomStyle: HdMeshGeomStyle = HdMeshGeomStyle.HdMeshGeomStyleInvalid,
  geomSubsetDescIndex = 0,
  numGeomSubsets = 0,
): HdPrimvarDescriptor[] {
  const primvars = [...prim.getPrimvarDescriptors(delegate, interpolation)]

  let filterNames: TfToken[] = []
  if (_IsEnabledPrimvarFiltering(drawItem)) {
    filterNames = _GetFilterNames(prim, drawItem)
  }

  if (numGeomSubsets !== 0 &&
    repr &&
    descGeomStyle !== HdMeshGeomStyle.HdMeshGeomStyleInvalid &&
    descGeomStyle !== HdMeshGeomStyle.HdMeshGeomStylePoints) {
    for (let i = 0; i < numGeomSubsets; ++i) {
      const subsetDrawItem = repr.getDrawItemForGeomSubset(
        geomSubsetDescIndex, numGeomSubsets, i) as HdStDrawItem | null
      if (!TF_VERIFY(subsetDrawItem)) {
        continue
      }
      if (_IsEnabledPrimvarFiltering(subsetDrawItem!)) {
        const matPvNames = _GetFilterNamesForMaterial(subsetDrawItem!)
        filterNames.push(...matPvNames)
      }
    }
    // std::sort + std::unique on TfTokens.
    filterNames = [...new Set(filterNames)].sort()
  }

  if (filterNames.length === 0) {
    return primvars
  }
  return _FilterPrimvarDescriptors(primvars, filterNames)
}

/** primUtils.cpp:210-221 */
export function HdStGetInstancerPrimvarDescriptors(
  instancer: HdStInstancer,
  delegate: HdSceneDelegate,
): HdPrimvarDescriptor[] {
  const primvars = delegate.getPrimvarDescriptors(instancer.getId(),
    HdInterpolation.HdInterpolationInstance)

  // XXX: Can we do filtering?
  return primvars
}

// -----------------------------------------------------------------------------
// Tracking render tag changes
// -----------------------------------------------------------------------------

/** primUtils.cpp:227-243 */
export function HdStUpdateRenderTag(
  delegate: HdSceneDelegate,
  renderParam: HdRenderParam | null | undefined,
  rprim: HdRprim,
  // The base-class HdRprim::UpdateRenderTag (rprim->HdRprim::UpdateRenderTag
  // upstream); a subclass that overrides UpdateRenderTag passes its super
  // method here.
  baseUpdateRenderTag: (delegate: HdSceneDelegate,
    renderParam: HdRenderParam | null | undefined) => void,
): void {
  const stRenderParam = _St(renderParam)

  const prevRenderTag = rprim.getRenderTag()
  baseUpdateRenderTag(delegate, renderParam)
  const renderTag = rprim.getRenderTag()
  if (renderTag === prevRenderTag) {
    return
  }
  stRenderParam.decreaseRenderTagCount(prevRenderTag)
  stRenderParam.increaseRenderTagCount(renderTag)
}

// -----------------------------------------------------------------------------
// Material processing utilities
// -----------------------------------------------------------------------------

/** primUtils.cpp:249-262 */
export function HdStSetMaterialId(
  delegate: HdSceneDelegate,
  renderParam: HdRenderParam | null | undefined,
  rprim: HdRprim,
): void {
  const newMaterialId = delegate.getMaterialId(rprim.getId())
  if (rprim.getMaterialId() !== newMaterialId) {
    rprim.setMaterialId(newMaterialId)

    // The batches need to be validated and rebuilt since a changed shader
    // may change aggregation.
    HdStMarkDrawBatchesDirty(renderParam)
  }
}

/** primUtils.cpp:264-290 HdStSetMaterialTag(renderParam, drawItem,
 *  materialTag). */
function _SetMaterialTag(
  renderParam: HdRenderParam | null | undefined,
  drawItem: HdDrawItem,
  materialTag: TfToken,
): void {
  const stRenderParam = _St(renderParam)

  {
    // prevMaterialTag scoped to express that it is a reference
    // to a field modified by SetMaterialTag later.
    const prevMaterialTag = drawItem.getMaterialTag() as TfToken

    if (materialTag === prevMaterialTag) {
      return
    }

    stRenderParam.decreaseMaterialTagCount(prevMaterialTag)
  }
  {
    stRenderParam.increaseMaterialTagCount(materialTag)
    drawItem.setMaterialTag(materialTag)
  }

  // Trigger invalidation of the draw items cache of the render pass(es).
  HdStMarkMaterialTagsDirty(renderParam)
}

/** primUtils.cpp:292-309 */
function _GetDisplayOpacityMaterialTag(delegate: HdSceneDelegate): TfToken {
  const mode = delegate.getRenderIndex().getRenderDelegate()
    .getRenderSetting(
      HdStRenderSettingsTokens.defaultTransparencyMode,
      HdStDefaultTransparencyModeTokens.screenDoor) as TfToken

  if (mode === HdStDefaultTransparencyModeTokens.oit) {
    return HdStMaterialTagTokens.translucent
  }
  if (mode === HdStDefaultTransparencyModeTokens.additive) {
    return HdStMaterialTagTokens.additive
  }
  return HdStMaterialTagTokens.masked
}

/** primUtils.cpp:311-346. Opinion precedence:
 *    Display In Overlay >
 *      Show occluded selection >
 *        Material opinion >
 *          displayOpacity primvar */
function _ComputeMaterialTag(
  delegate: HdSceneDelegate,
  _drawItem: HdDrawItem,
  materialId: string,
  hasDisplayOpacityPrimvar: boolean,
  displayInOverlay: boolean,
  occludedSelectionShowsThrough: boolean,
): TfToken {
  if (displayInOverlay) {
    return HdStMaterialTagTokens.displayInOverlay
  }

  if (occludedSelectionShowsThrough) {
    return HdStMaterialTagTokens.translucentToSelection
  }

  const material = delegate.getRenderIndex().getSprim(
    HdPrimTypeTokens.material, materialId) as unknown as HdStMaterial | undefined
  if (material && !material.isUsingFallbackShader()) {
    return material.getMaterialTag()
  }

  if (hasDisplayOpacityPrimvar) {
    return _GetDisplayOpacityMaterialTag(delegate)
  }

  return HdMaterialTagTokens.defaultMaterialTag as TfToken
}

/**
 * primUtils.cpp:264-290 HdStSetMaterialTag(renderParam, drawItem,
 * materialTag), or primUtils.cpp:348-362 HdStSetMaterialTag(delegate,
 * renderParam, drawItem, materialId, hasDisplayOpacityPrimvar,
 * displayInOverlay, occludedSelectionShowsThrough).
 */
export function HdStSetMaterialTag(
  renderParam: HdRenderParam | null | undefined,
  drawItem: HdDrawItem,
  materialTag: TfToken,
): void
export function HdStSetMaterialTag(
  delegate: HdSceneDelegate,
  renderParam: HdRenderParam | null | undefined,
  drawItem: HdDrawItem,
  materialId: string,
  hasDisplayOpacityPrimvar: boolean,
  displayInOverlay: boolean,
  occludedSelectionShowsThrough: boolean,
): void
export function HdStSetMaterialTag(...args: unknown[]): void {
  if (args.length === 3) {
    _SetMaterialTag(args[0] as HdRenderParam | null, args[1] as HdDrawItem,
      args[2] as TfToken)
    return
  }
  const [delegate, renderParam, drawItem, materialId, hasDisplayOpacityPrimvar,
    displayInOverlay, occludedSelectionShowsThrough] = args as [
    HdSceneDelegate, HdRenderParam | null, HdDrawItem, string, boolean, boolean, boolean]
  _SetMaterialTag(
    renderParam, drawItem,
    _ComputeMaterialTag(
      delegate, drawItem, materialId, hasDisplayOpacityPrimvar,
      displayInOverlay, occludedSelectionShowsThrough))
}

/** primUtils.cpp:364-370 (prim's material id), primUtils.cpp:372-401
 *  (explicit material id). */
export function HdStGetMaterialNetworkShader(
  prim: HdRprim,
  delegate: HdSceneDelegate,
  materialId: string = prim.getMaterialId(),
): HdSt_MaterialNetworkShader | null {
  // Resolve the prim's material or use the fallback material.
  const renderIndex = delegate.getRenderIndex()
  let material = renderIndex.getSprim(HdPrimTypeTokens.material, materialId) as
    unknown as HdStMaterial | undefined | null
  if (!material) {
    const displayInOverlay =
      delegate.getDisplayStyle(prim.getId()).displayInOverlay

    if (displayInOverlay) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, `Using built-in overlay material for` +
        ` ${prim.getId()}\n`)

      return _GetFallbackOverlayShader()
    } else {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, `Using fallback material for ${prim.getId()}\n`)

      material = renderIndex.getFallbackSprim(HdPrimTypeTokens.material) as
        unknown as HdStMaterial | undefined | null
    }
  }

  return material!.getMaterialNetworkShader()
}

// -----------------------------------------------------------------------------
// Primvar processing and BAR allocation utilities
// -----------------------------------------------------------------------------

/** primUtils.cpp:406-410 */
export function HdStIsValidBAR(range: HdBufferArrayRange | null | undefined): boolean {
  return !!range && range.isValid()
}

/** primUtils.cpp:412-432 (with computations), primUtils.cpp:434-442
 *  (without). */
export function HdStCanSkipBARAllocationOrUpdate(
  sources: readonly HdBufferSource[],
  computations: HdStComputationComputeQueuePairVector,
  curRange: HdBufferArrayRange | null | undefined,
  dirtyBits: HdDirtyBits,
): boolean
export function HdStCanSkipBARAllocationOrUpdate(
  sources: readonly HdBufferSource[],
  curRange: HdBufferArrayRange | null | undefined,
  dirtyBits: HdDirtyBits,
): boolean
export function HdStCanSkipBARAllocationOrUpdate(
  sources: readonly HdBufferSource[],
  a: HdStComputationComputeQueuePairVector | HdBufferArrayRange | null | undefined,
  b: HdBufferArrayRange | null | undefined | HdDirtyBits,
  c?: HdDirtyBits,
): boolean {
  let computations: HdStComputationComputeQueuePairVector
  let curRange: HdBufferArrayRange | null | undefined
  let dirtyBits: HdDirtyBits
  if (c === undefined) {
    computations = []
    curRange = a as HdBufferArrayRange | null | undefined
    dirtyBits = b as HdDirtyBits
  } else {
    computations = a as HdStComputationComputeQueuePairVector
    curRange = b as HdBufferArrayRange | null | undefined
    dirtyBits = c
  }

  // XXX: DirtyPrimvar is serving a double role of indicating primvar value
  // dirtyness as well as descriptor dirtyness.
  // We should move to a separate dirty bit for the latter.
  const mayHaveDirtyPrimvarDesc = (dirtyBits & HdChangeTracker.DirtyPrimvar) !== 0

  // If we have no buffer/computation sources, we can skip processing in the
  // following cases:
  // - we haven't allocated a BAR previously
  // - we have an existing BAR and its primvar descriptors haven't changed
  const noDataSourcesToUpdate = sources.length === 0 && computations.length === 0
  return noDataSourcesToUpdate &&
    (!HdStIsValidBAR(curRange) || !mayHaveDirtyPrimvarDesc)
}

/** primUtils.cpp:444-493 */
function _GetRemovedPrimvarBufferSpecs(
  curBarSpecs: readonly HdBufferSpec[],
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  newCompPrimvarDescs: readonly HdExtComputationPrimvarDescriptor[],
  internallyGeneratedPrimvarNames: readonly TfToken[],
  rprimId: string,
): HdBufferSpec[] {
  const removedPrimvarSpecs: HdBufferSpec[] = []
  // Get the new list of primvar sources for the BAR. We need to use both
  // the primvar descriptor list (that we get via the scene delegate), as
  // well as any internally generated primvars that are always added (such as
  // primId). This may contain primvars that fail validation, but we're only
  // interested in finding out existing primvars that aren't in the list.
  const newPrimvarNames: string[] = []
  for (const desc of newPrimvarDescs) {
    newPrimvarNames.push(desc.name)
  }
  for (const desc of newCompPrimvarDescs) {
    newPrimvarNames.push(desc.name)
  }

  // Check if the existing BAR has buffers that are neither in the new source
  // list nor are internally generated.
  for (const spec of curBarSpecs) {
    const isInNewList = newPrimvarNames.includes(spec.name)

    if (isInNewList) {
      continue // avoid the search below
    }

    const isInGeneratedList =
      (internallyGeneratedPrimvarNames as readonly string[]).includes(spec.name)

    if (!isInGeneratedList) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `${rprimId}: Found primvar ${spec.name} that has been removed\n`)
      removedPrimvarSpecs.push(spec)
    }
  }

  return removedPrimvarSpecs
}

/** primUtils.cpp:495-512 (with computed primvar descriptors),
 *  primUtils.cpp:514-524 (without). */
export function HdStGetRemovedPrimvarBufferSpecs(
  curRange: HdBufferArrayRange | null | undefined,
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  newCompPrimvarDescs: readonly HdExtComputationPrimvarDescriptor[],
  internallyGeneratedPrimvarNames: readonly TfToken[],
  rprimId: string,
): HdBufferSpec[]
export function HdStGetRemovedPrimvarBufferSpecs(
  curRange: HdBufferArrayRange | null | undefined,
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  internallyGeneratedPrimvarNames: readonly TfToken[],
  rprimId: string,
): HdBufferSpec[]
export function HdStGetRemovedPrimvarBufferSpecs(
  curRange: HdBufferArrayRange | null | undefined,
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  a: readonly HdExtComputationPrimvarDescriptor[] | readonly TfToken[],
  b: readonly TfToken[] | string,
  c?: string,
): HdBufferSpec[] {
  let newCompPrimvarDescs: readonly HdExtComputationPrimvarDescriptor[] = []
  let internallyGeneratedPrimvarNames: readonly TfToken[]
  let rprimId: string
  if (c === undefined) {
    internallyGeneratedPrimvarNames = a as readonly TfToken[]
    rprimId = b as string
  } else {
    newCompPrimvarDescs = a as readonly HdExtComputationPrimvarDescriptor[]
    internallyGeneratedPrimvarNames = b as readonly TfToken[]
    rprimId = c
  }

  if (!HdStIsValidBAR(curRange)) {
    return []
  }

  const curBarSpecs = curRange!.getBufferSpecs()

  return _GetRemovedPrimvarBufferSpecs(curBarSpecs, newPrimvarDescs,
    newCompPrimvarDescs, internallyGeneratedPrimvarNames, rprimId)
}

/** primUtils.cpp:526-574 (with computed primvar descriptors),
 *  primUtils.cpp:576-588 (without). */
export function HdStGetRemovedOrReplacedPrimvarBufferSpecs(
  curRange: HdBufferArrayRange | null | undefined,
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  newCompPrimvarDescs: readonly HdExtComputationPrimvarDescriptor[],
  internallyGeneratedPrimvarNames: readonly TfToken[],
  updatedSpecs: readonly HdBufferSpec[],
  rprimId: string,
): HdBufferSpec[]
export function HdStGetRemovedOrReplacedPrimvarBufferSpecs(
  curRange: HdBufferArrayRange | null | undefined,
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  internallyGeneratedPrimvarNames: readonly TfToken[],
  updatedSpecs: readonly HdBufferSpec[],
  rprimId: string,
): HdBufferSpec[]
export function HdStGetRemovedOrReplacedPrimvarBufferSpecs(
  curRange: HdBufferArrayRange | null | undefined,
  newPrimvarDescs: readonly HdPrimvarDescriptor[],
  a: readonly HdExtComputationPrimvarDescriptor[] | readonly TfToken[],
  b: readonly TfToken[] | readonly HdBufferSpec[],
  c: readonly HdBufferSpec[] | string,
  d?: string,
): HdBufferSpec[] {
  let newCompPrimvarDescs: readonly HdExtComputationPrimvarDescriptor[] = []
  let internallyGeneratedPrimvarNames: readonly TfToken[]
  let updatedSpecs: readonly HdBufferSpec[]
  let rprimId: string
  if (d === undefined) {
    internallyGeneratedPrimvarNames = a as readonly TfToken[]
    updatedSpecs = b as readonly HdBufferSpec[]
    rprimId = c as string
  } else {
    newCompPrimvarDescs = a as readonly HdExtComputationPrimvarDescriptor[]
    internallyGeneratedPrimvarNames = b as readonly TfToken[]
    updatedSpecs = c as readonly HdBufferSpec[]
    rprimId = d
  }

  if (!HdStIsValidBAR(curRange)) {
    return []
  }

  const curBarSpecs = curRange!.getBufferSpecs()

  const removedOrReplacedSpecs = _GetRemovedPrimvarBufferSpecs(
    curBarSpecs, newPrimvarDescs, newCompPrimvarDescs,
    internallyGeneratedPrimvarNames, rprimId)

  // Sometimes the buffer spec for a given named primvar has changed, e.g.,
  // when an array-valued primvar has changed size. Such specs are not
  // in removedSpecs at this point, so we need to add them to ensure that
  // the old spec gets removed. Otherwise we will get shader compilation
  // errors after the new spec has been added because the primvar variable
  // will be defined twice.

  for (const curSpec of curBarSpecs) {
    const newSpec = updatedSpecs.find((spec) => spec.name === curSpec.name)
    // If we find a new spec that matches by name, we check if it is
    // different from the old spec. If it is, it needs to be removed.
    // The call to UpdateShaderStorageBufferArrayRange below will add
    // the new spec regardless, but will only remove the old one if it
    // is in removedSpecs. This fixes the case where resized array-valued
    // constant primvars were being declared multiple times causing
    // shader compilation failures.
    if (newSpec !== undefined && !HdBufferSpecEquals(curSpec, newSpec)) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `${rprimId}: Found primvar ${curSpec.name} that has been replaced\n`)
      removedOrReplacedSpecs.push(curSpec)
    }
  }
  return removedOrReplacedSpecs
}

/** primUtils.cpp:590-699 */
export function HdStUpdateDrawItemBAR(
  newRange: HdBufferArrayRange | null | undefined,
  drawCoordIndex: number,
  sharedData: HdRprimSharedData | null,
  renderParam: HdRenderParam | null | undefined,
  _changeTracker: HdRprimChangeTracker | null,
): void {
  if (!sharedData) {
    TF_CODING_ERROR('Null shared data ptr received\n')
    return
  }

  const curRange = sharedData.barContainer.Get(drawCoordIndex)
  const id = sharedData.rprimID
  const newRangeOrNull = newRange ?? null

  if (curRange === newRangeOrNull) {
    // Nothing to do. The draw item's BAR hasn't been changed.
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `${id}: BAR at draw coord ${drawCoordIndex} is still (${_Ptr(curRange)})\n`)

    return
  }

  const curRangeValid = HdStIsValidBAR(curRange)
  const newRangeValid = HdStIsValidBAR(newRangeOrNull)

  if (curRangeValid) {
    HdStMarkGarbageCollectionNeeded(renderParam)

    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `${id}: Marking garbage collection needed to possibly reclaim BAR ` +
      `${_Ptr(curRange)} at draw coord index ${drawCoordIndex}\n`)
  }

  // Flag deep batch invalidation for the following scenarios:
  // 1. Invalid <-> Valid transitions.
  // 2. When the new range is associated with a buffer array that
  // fails the aggregation test (used during batching).
  // 3. When the dispatch buffer needs to be updated for MDI batches.
  //    Note: This is needed only for indirect draw batches to update the
  //    dispatch buffer, but we prefer to not hardcode a check for
  //    the same.
  const rebuildDispatchBuffer = curRangeValid && newRangeValid &&
    curRange!.getElementOffset() !== newRangeOrNull!.getElementOffset()

  if (curRangeValid !== newRangeValid ||
    !newRangeOrNull!.isAggregatedWith(curRange) ||
    rebuildDispatchBuffer) {
    HdStMarkDrawBatchesDirty(renderParam)

    if (TfDebug.isEnabled(HdDebugCodes.HD_RPRIM_UPDATED)) {
      if (curRangeValid !== newRangeValid) {
        TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
          `${id}: Marking all batches dirty due to an invalid <-> valid` +
          ` transition (new BAR ${_Ptr(newRangeOrNull)}, existing BAR ${_Ptr(curRange)})\n`)
      } else if (!newRangeOrNull!.isAggregatedWith(curRange)) {
        TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
          `${id}: Marking all batches dirty since the new BAR (${_Ptr(newRangeOrNull)}) ` +
          `doesn't aggregate with the existing BAR (${_Ptr(curRange)})\n`)
      } else if (rebuildDispatchBuffer) {
        TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
          `${id}: Marking all batches dirty since the new BAR (${_Ptr(newRangeOrNull)}) ` +
          `has different layout than the existing BAR (${_Ptr(curRange)})\n`)
      }
    }
  }

  if (TfDebug.isEnabled(HdDebugCodes.HD_RPRIM_UPDATED)) {
    TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
      `${id}: Updating BAR at draw coord index ${drawCoordIndex} from ` +
      `${_Ptr(curRange)} to ${_Ptr(newRangeOrNull)}\n`)

    if (newRangeValid) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED,
        `Buffer array version for the new range is ${newRangeOrNull!.getVersion()}\n`)
    }

    const oldSpecs = curRangeValid ? curRange!.getBufferSpecs() : []
    const newSpecs = newRangeValid ? newRangeOrNull!.getBufferSpecs() : []
    if (!_SpecVectorsEqual(oldSpecs, newSpecs)) {
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, 'Old buffer specs:\n')
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, HdBufferSpec.dump(oldSpecs))

      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, 'New buffer specs:\n')
      TfDebug.msg(HdDebugCodes.HD_RPRIM_UPDATED, HdBufferSpec.dump(newSpecs))
    }
  }

  // Note: This should happen at the end since curRange is a reference to
  // the BAR at the drawCoordIndex.
  sharedData.barContainer.Set(drawCoordIndex, newRangeOrNull)
}

/** The %p of a BAR in the debug messages: whether it is set. */
function _Ptr(range: HdBufferArrayRange | null | undefined): string {
  return range ? 'BAR' : '0x0'
}

/** HdBufferSpecVector operator== */
function _SpecVectorsEqual(a: readonly HdBufferSpec[], b: readonly HdBufferSpec[]): boolean {
  return a.length === b.length && a.every((s, i) => HdBufferSpecEquals(s, b[i]!))
}

/** VtValue::IsHolding<std::string> / <VtStringArray> / <TfToken> /
 *  <VtTokenArray>, by the held type's name. */
function _IsHoldingTypeName(value: VtValue, typeName: string): boolean {
  return value.getTypeName() === typeName
}

/** primUtils.cpp:701-730 */
export function HdStIsPrimvarExistentAndValid(
  prim: HdRprim,
  delegate: HdSceneDelegate,
  primvars: readonly HdPrimvarDescriptor[],
  primvarName: TfToken,
): boolean {
  const id = prim.getId()

  for (const pv of primvars) {
    // Note: the value check here should match
    // HdStIsInstancePrimvarExistentAndValid.
    if (pv.name === primvarName) {
      const value = delegate.Get(id, pv.name)

      if (_IsHoldingTypeName(value, 'string') ||
        _IsHoldingTypeName(value, 'string[]')) {
        return false
      }

      if (value.isArrayValued() && value.getArraySize() === 0) {
        // Catch empty arrays
        return false
      }

      return !value.IsEmpty()
    }
  }

  return false
}

/** primUtils.cpp:732-791 */
export function HdStIsPrimvarValidForDrawItem(
  drawItem: HdStDrawItem,
  primvarName: TfToken,
  primvarValue: VtValue,
): boolean {
  if (primvarValue.IsEmpty()) {
    TfDebug.msg(HdStDebugCodes.HDST_LOG_SKIPPED_PRIMVAR,
      `Prim: ${drawItem.getRprimID()} Primvar: ${primvarName} is empty! Skipping...\n`)
    return false
  }

  // XXX Storm doesn't support string or token primvars yet
  if (_IsHoldingTypeName(primvarValue, 'string') ||
    _IsHoldingTypeName(primvarValue, 'string[]') ||
    _IsHoldingTypeName(primvarValue, 'token') ||
    _IsHoldingTypeName(primvarValue, 'token[]')) {
    TfDebug.msg(HdStDebugCodes.HDST_LOG_SKIPPED_PRIMVAR,
      `Prim: ${drawItem.getRprimID()} Primvar: ${primvarName} holds an incompatible type!` +
      `Type: ${primvarValue.getTypeName()} Skipping...\n`)
    return false
  }

  if (!drawItem.getMaterialNetworkShader()) {
    return true
  }

  const fallback = drawItem.getMaterialNetworkShader()!
    .getFallbackValueForParam(primvarName)
  if (!fallback) {
    return true
  }

  if (primvarName === HdTokens.displayColor &&
    (primvarValue.canCastToTypeid(VtValueTypes.GfVec4f) ||
      primvarValue.canCastToTypeid(TfType.declare('GfVec4f[]')))) {
    // Allowing 'displayColor' to be a vec4 or vec3 to support
    // clients expecting this behavior
    return true
  }

  if (primvarValue.canCastToTypeOf(fallback) ||
    primvarValue.getElementTypeid() === fallback.getTypeid()) {
    return true
  } else {
    TF_WARN(
      `Value input not compatible with default! Prim: ${drawItem.getRprimID()} ` +
      `Primvar: ${primvarName}\n` +
      `Default: Type - ${fallback.getTypeName()}\n` +
      `Input: Type - ${primvarValue.getTypeName()}`)
    return false
  }
}

// -----------------------------------------------------------------------------
// Constant primvar processing utilities
// -----------------------------------------------------------------------------

/** primUtils.cpp:796-807 */
export function HdStShouldPopulateConstantPrimvars(
  dirtyBits: HdDirtyBitsRef,
  id: string,
): boolean {
  return ((dirtyBits.value & HdChangeTracker.DirtyNormals) !== 0 ||
    (dirtyBits.value & HdChangeTracker.DirtyWidths) !== 0 ||
    (dirtyBits.value & HdChangeTracker.DirtyPrimvar) !== 0 ||
    HdChangeTracker.isTransformDirty(dirtyBits.value, id) ||
    HdChangeTracker.isExtentDirty(dirtyBits.value, id) ||
    HdChangeTracker.isPrimIdDirty(dirtyBits.value, id))
}

/** primUtils.cpp:1057-1067 */
const _internallyGeneratedConstantPrimvars: readonly TfToken[] = [
  HdTokens.transform as TfToken,
  HdTokens.transformInverse as TfToken,
  HdInstancerTokens.instancerTransform as TfToken,
  HdInstancerTokens.instancerTransformInverse as TfToken,
  HdTokens.isFlipped as TfToken,
  HdTokens.bboxLocalMin as TfToken,
  HdTokens.bboxLocalMax as TfToken,
  HdTokens.primID as TfToken,
]

/** bool* out-parameter. */
export type HdStBoolOut = { value: boolean } | null

/**
 * primUtils.cpp:809-1090 (with customSpecs) and primUtils.cpp:1092-1126
 * (without): the second form passes an empty customSpecs.
 */
export function HdStPopulateConstantPrimvars(
  prim: HdRprim,
  sharedData: HdRprimSharedData,
  delegate: HdSceneDelegate,
  renderParam: HdRenderParam | null | undefined,
  drawItem: HdStDrawItem,
  dirtyBits: HdDirtyBitsRef,
  repr: HdRepr | null,
  descGeomStyle: HdMeshGeomStyle,
  geomSubsetDescIndex: number,
  numGeomSubsets: number,
  customSpecs: readonly HdBufferSpec[],
  hasMirroredTransform: HdStBoolOut,
  hasDisplayOpacity: HdStBoolOut,
  hasNormals: HdStBoolOut,
): void
export function HdStPopulateConstantPrimvars(
  prim: HdRprim,
  sharedData: HdRprimSharedData,
  delegate: HdSceneDelegate,
  renderParam: HdRenderParam | null | undefined,
  drawItem: HdStDrawItem,
  dirtyBits: HdDirtyBitsRef,
  repr: HdRepr | null,
  descGeomStyle: HdMeshGeomStyle,
  geomSubsetDescIndex: number,
  numGeomSubsets: number,
  hasMirroredTransform: HdStBoolOut,
  hasDisplayOpacity: HdStBoolOut,
  hasNormals: HdStBoolOut,
): void
export function HdStPopulateConstantPrimvars(
  prim: HdRprim,
  sharedData: HdRprimSharedData,
  delegate: HdSceneDelegate,
  renderParam: HdRenderParam | null | undefined,
  drawItem: HdStDrawItem,
  dirtyBits: HdDirtyBitsRef,
  repr: HdRepr | null,
  descGeomStyle: HdMeshGeomStyle,
  geomSubsetDescIndex: number,
  numGeomSubsets: number,
  ...rest: unknown[]
): void {
  let customSpecs: readonly HdBufferSpec[] = []
  if (Array.isArray(rest[0])) {
    customSpecs = rest.shift() as readonly HdBufferSpec[]
  }
  const [hasMirroredTransform, hasDisplayOpacity, hasNormals] =
    rest as [HdStBoolOut, HdStBoolOut, HdStBoolOut]

  const id = prim.getId()
  const instancerId = prim.getInstancerId()

  const renderIndex = delegate.getRenderIndex()
  const hdStResourceRegistry = _GetResourceRegistry(renderIndex)

  // Update uniforms
  const sources: HdBufferSource[] = []
  if (HdChangeTracker.isTransformDirty(dirtyBits.value, id)) {
    const transform = delegate.getTransform(id)
    sharedData.bounds.setMatrix(transform) // for CPU frustum culling

    const capabilities = hdStResourceRegistry.getHgi().getCapabilities()!
    const doublesSupported = capabilities.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

    sources.push(
      new HdVtBufferSource(
        HdTokens.transform, transform, doublesSupported))

    sources.push(
      new HdVtBufferSource(
        HdTokens.transformInverse, transform.getInverse(),
        doublesSupported))

    let leftHanded = transform.isLeftHanded()

    // If this is a prototype (has instancer),
    // also push the instancer transform separately.
    if (instancerId !== '') {
      // Gather all instancer transforms in the instancing hierarchy
      const rootTransforms: GfMatrix4d[] = []
      const rootInverseTransforms: GfMatrix4d[] = []
      let nextInstancerId = instancerId

      while (nextInstancerId !== '') {
        const instancer = renderIndex.getInstancer(nextInstancerId) as
          unknown as HdStInstancer | null
        if (!instancer) {
          break
        }
        rootTransforms.push(instancer.getTransform())
        rootInverseTransforms.push(
          instancer.getTransformInverse())
        // Flip the handedness if necessary
        leftHanded = leftHanded !== rootTransforms[rootTransforms.length - 1]!.isLeftHanded()
        nextInstancerId = instancer.getParentId()
      }

      sources.push(
        new HdVtBufferSource(
          HdInstancerTokens.instancerTransform,
          new VtArray<GfMatrix4d>(rootTransforms, VtValueTypes.GfMatrix4d),
          rootTransforms.length,
          doublesSupported))
      sources.push(
        new HdVtBufferSource(
          HdInstancerTokens.instancerTransformInverse,
          new VtArray<GfMatrix4d>(rootInverseTransforms, VtValueTypes.GfMatrix4d),
          rootInverseTransforms.length,
          doublesSupported))

      // Set as int (GLSL needs 32-bit align for bool)
      sources.push(
        new HdVtBufferSource(
          HdTokens.isFlipped,
          VtValue.create(leftHanded ? 1 : 0, VtValueTypes.int)))
    }

    if (hasMirroredTransform) {
      hasMirroredTransform.value = leftHanded
    }
  }
  if (HdChangeTracker.isExtentDirty(dirtyBits.value, id)) {
    // Note: If the scene description doesn't provide the extents, we use
    // the default constructed GfRange3d which is [FLT_MAX, -FLT_MAX],
    // which disables frustum culling for the prim.
    sharedData.bounds.setRange(prim.getExtent(delegate))

    const localMin = drawItem.getBounds().getBox().getMin()
    const sourceMin = new HdVtBufferSource(
      HdTokens.bboxLocalMin,
      VtValue.create(new GfVec4f(
        localMin.get(0),
        localMin.get(1),
        localMin.get(2),
        1.0), VtValueTypes.GfVec4f))
    sources.push(sourceMin)

    const localMax = drawItem.getBounds().getBox().getMax()
    const sourceMax = new HdVtBufferSource(
      HdTokens.bboxLocalMax,
      VtValue.create(new GfVec4f(
        localMax.get(0),
        localMax.get(1),
        localMax.get(2),
        1.0), VtValueTypes.GfVec4f))
    sources.push(sourceMax)
  }

  if (HdChangeTracker.isPrimIdDirty(dirtyBits.value, id)) {
    const primId = prim.getPrimId()
    const source = new HdVtBufferSource(
      HdTokens.primID,
      VtValue.create(primId, VtValueTypes.int))
    sources.push(source)
  }

  let constantPrimvars: HdPrimvarDescriptor[] = []
  if ((dirtyBits.value & HdChangeTracker.DirtyNormals) ||
    (dirtyBits.value & HdChangeTracker.DirtyWidths) ||
    (dirtyBits.value & HdChangeTracker.DirtyPrimvar)) {
    // Note: avoid pulling the primvar list until we know we need it...
    constantPrimvars = HdStGetPrimvarDescriptors(
      prim, drawItem, delegate, HdInterpolation.HdInterpolationConstant,
      repr, descGeomStyle, geomSubsetDescIndex, numGeomSubsets)

    for (const pv of constantPrimvars) {
      if (pv.name === HdTokens.points) {
        HF_VALIDATION_WARN(id, 'constant-interpolation points!')
        continue
      }

      if (HdChangeTracker.isPrimvarDirty(dirtyBits.value, id, pv.name)) {
        const value = delegate.Get(id, pv.name)
        if (!HdStIsPrimvarValidForDrawItem(drawItem, pv.name, value)) {
          continue
        }

        if (value.isArrayValued() && value.getArraySize() === 0) {
          // A value holding an empty array does not count as an
          // empty value. Catch that case here.
          TfDebug.msg(HdStDebugCodes.HDST_LOG_SKIPPED_PRIMVAR,
            `Prim: ${drawItem.getRprimID()} Primvar: ${pv.name} is an empty array! Skipping...\n`)
          continue
        }

        const material = drawItem.getMaterialNetworkShader()
        const fallback = material ? material.getFallbackValueForParam(pv.name) : null
        if (fallback) {
          const valSize = value.isArrayValued() ? value.getArraySize() : 1
          const fallbackSize = fallback.isArrayValued() ? fallback.getArraySize() : 1
          // Don't perform size validation on constant array primvars
          const bothArrays = value.isArrayValued() && fallback.isArrayValued()
          if (!bothArrays && valSize !== fallbackSize) {
            TF_WARN('Value input not compatible with default! ' +
              `Prim: ${sharedData.rprimID} Primvar: ${pv.name}\n` +
              `Default: Type - ${fallback.getTypeName()}, IsArray - ` +
              `${fallback.isArrayValued() ? 1 : 0}, ` +
              `ArraySize - ${fallback.getArraySize()}\n` +
              `Input: Type - ${value.getTypeName()}, IsArray - ` +
              `${value.isArrayValued() ? 1 : 0}, ` +
              `ArraySize - ${value.getArraySize()}\n`)
            continue
          }
        }

        // Given that this is a constant primvar, if it is
        // holding VtArray then use that as a single array
        // value rather than as one value per element.
        const source = new HdVtBufferSource(pv.name, value,
          value.isArrayValued() ? value.getArraySize() : 1)

        // Skip buffer source if tuple type is invalid.
        if (!TF_VERIFY(
          source.getTupleType().type !== HdType.HdTypeInvalid)) {
          continue
        }
        if (!TF_VERIFY(source.getTupleType().count > 0)) {
          continue
        }

        sources.push(source)

        if (hasDisplayOpacity && pv.name === HdTokens.displayOpacity) {
          hasDisplayOpacity.value = true
        }
        if (hasNormals && pv.name === HdTokens.normals) {
          hasNormals.value = true
        }
      }
    }
  }

  const bar = drawItem.getConstantPrimvarRange()

  if (HdStCanSkipBARAllocationOrUpdate(sources, bar, dirtyBits.value)) {
    return
  }

  const bufferSpecs: HdBufferSpec[] = []
  HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

  if (customSpecs.length !== 0) {
    bufferSpecs.push(...customSpecs)
  }

  // XXX: This should be based off the DirtyPrimvarDesc bit.
  const hasDirtyPrimvarDesc =
    (dirtyBits.value & HdChangeTracker.DirtyPrimvar) !== 0 ||
    (dirtyBits.value & HdChangeTracker.DirtyNormals) !== 0 ||
    (dirtyBits.value & HdChangeTracker.DirtyWidths) !== 0

  let removedSpecs: HdBufferSpec[] = []
  if (hasDirtyPrimvarDesc) {
    removedSpecs = HdStGetRemovedOrReplacedPrimvarBufferSpecs(bar,
      constantPrimvars, _internallyGeneratedConstantPrimvars, bufferSpecs, id)
  }

  const range =
    hdStResourceRegistry.updateShaderStorageBufferArrayRange(
      HdTokens.primvar, bar, bufferSpecs, removedSpecs,
      HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

  HdStUpdateDrawItemBAR(
    range,
    drawItem.getDrawingCoord().getConstantPrimvarIndex(),
    sharedData,
    renderParam,
    renderIndex.getChangeTracker())

  TF_VERIFY(drawItem.getConstantPrimvarRange()!.isValid())

  if (sources.length !== 0) {
    hdStResourceRegistry.addSources(
      drawItem.getConstantPrimvarRange(), sources)
  }
}

// -----------------------------------------------------------------------------
// Instancer processing utilities
// -----------------------------------------------------------------------------

/** primUtils.cpp:1132-1312 */
export function HdStUpdateInstancerData(
  renderIndex: HdRenderIndex,
  renderParam: HdRenderParam | null | undefined,
  prim: HdRprim,
  drawItem: HdStDrawItem,
  sharedData: HdRprimSharedData,
  rprimDirtyBits: HdDirtyBits,
  hasDisplayOpacity: HdStBoolOut,
  hasNormals: HdStBoolOut,
): void {
  // If there's nothing to do, bail.
  if (!(rprimDirtyBits & HdChangeTracker.DirtyInstancer)) {
    return
  }

  if (hasDisplayOpacity) {
    hasDisplayOpacity.value = false
  }
  if (hasNormals) {
    hasNormals.value = false
  }

  // XXX: This belongs in HdRenderIndex!!!
  HdInstancer._syncInstancerAndParents(renderIndex, prim.getInstancerId())

  const drawingCoord = drawItem.getDrawingCoord()
  const changeTracker = renderIndex.getChangeTracker()

  // If the instance topology changes, we want to force an instance index
  // rebuild even if the index dirty bit isn't set...
  let forceIndexRebuild = false

  // If the instancer topology has changed, we might need to change
  // how many levels we allocate in the drawing coord.
  const instancerLevels = HdInstancer.getInstancerNumLevels(
    renderIndex, prim)

  if (instancerLevels !== sharedData.instancerLevels) {
    sharedData.barContainer.resize(
      drawingCoord.getInstancePrimvarIndex(0) + instancerLevels)
    sharedData.instancerLevels = instancerLevels

    HdStMarkGarbageCollectionNeeded(renderParam)
    HdStMarkDrawBatchesDirty(renderParam)
    forceIndexRebuild = true
  }

  /* INSTANCE PRIMVARS */
  // Populate all instance primvars by backtracing hierarachy.
  let level = 0
  let parentId = prim.getInstancerId()
  while (parentId !== '') {
    const instancer = renderIndex.getInstancer(parentId) as
      unknown as HdStInstancer | null
    if (!TF_VERIFY(instancer)) {
      return
    }
    const drawCoordIndex = drawingCoord.getInstancePrimvarIndex(level)
    const instancerRange = instancer!.getInstancePrimvarRange()

    // If we need to update the BAR, that indicates an instancing topology
    // change and we want to force an index rebuild.
    if (instancerRange !== sharedData.barContainer.Get(drawCoordIndex)) {
      forceIndexRebuild = true
    }

    // update instance primvar slot in the drawing coordinate.
    HdStUpdateDrawItemBAR(
      instancer!.getInstancePrimvarRange(),
      drawCoordIndex,
      sharedData,
      renderParam,
      changeTracker)

    if (hasDisplayOpacity) {
      hasDisplayOpacity.value = hasDisplayOpacity.value ||
        instancer!.hasDisplayOpacity()
    }
    if (hasNormals) {
      hasNormals.value = hasNormals.value ||
        instancer!.hasNormals()
    }

    parentId = instancer!.getParentId()
    ++level
  }

  /* INSTANCE INDICES */
  // Note, GetInstanceIndices will check index sizes against primvar sizes.
  // The instance indices are a cartesian product of each level, so they need
  // to be recomputed per-rprim.
  if (HdChangeTracker.isInstanceIndexDirty(rprimDirtyBits, prim.getId()) ||
    forceIndexRebuild) {
    parentId = prim.getInstancerId()
    if (parentId !== '') {
      const instancer = renderIndex.getInstancer(parentId) as
        unknown as HdStInstancer | null
      if (!TF_VERIFY(instancer)) {
        return
      }

      // update instance indices
      //
      // We add a zero as the first value in instanceIndices. This is
      // added as a way of avoiding correctness issues in the instance
      // frustum cull vertex shader. This issue happens when an instanced
      // prim has geom subsets resulting in multiple draw items. See
      // ViewFrustumCull.VertexInstancing in frustumCull.glslfx for
      // details.
      const originalInstanceIndices = instancer!.getInstanceIndices(prim.getId())
      let instanceIndices: number[] = [0, ...originalInstanceIndices]

      const resourceRegistry = _GetResourceRegistry(renderIndex)

      // Create the bar if needed.
      if (!drawItem.getInstanceIndexRange()) {
        // Note: we add the instance indices twice, so that frustum
        // culling can compute culledInstanceIndices as instanceIndices
        // masked by visibility.
        const bufferSpecs: HdBufferSpec[] = [
          { name: HdInstancerTokens.instanceIndices,
            tupleType: { type: HdType.HdTypeInt32, count: 1 } },
          { name: HdInstancerTokens.culledInstanceIndices,
            tupleType: { type: HdType.HdTypeInt32, count: 1 } },
        ]

        const usageHint: HdBufferArrayUsageHint =
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex |
          HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage

        const range =
          resourceRegistry.allocateNonUniformBufferArrayRange(
            HdTokens.topology,
            bufferSpecs,
            usageHint)

        HdStUpdateDrawItemBAR(
          range,
          drawingCoord.getInstanceIndexIndex(),
          sharedData,
          renderParam,
          changeTracker)

        TF_VERIFY(drawItem.getInstanceIndexRange()!.isValid())
      }

      // If the instance index range is too big to upload, it's very
      // dangerous since the shader could index into bad memory. If we're
      // not failing on asserts, we need to zero out the index array so no
      // instances draw.
      if (!TF_VERIFY(instanceIndices.length <=
        drawItem.getInstanceIndexRange()!.getMaxNumElements())) {
        instanceIndices = []
      }

      const indicesValue = () => VtValue.createArray(
        new VtArray<number>(instanceIndices, VtValueTypes.int))
      const sources: HdBufferSource[] = [
        new HdVtBufferSource(
          HdInstancerTokens.instanceIndices,
          indicesValue()),
        new HdVtBufferSource(
          HdInstancerTokens.culledInstanceIndices,
          indicesValue()),
      ]

      resourceRegistry.addSources(
        drawItem.getInstanceIndexRange(), sources)
    }
  }
}

/** primUtils.cpp:1314-1352 */
export function HdStIsInstancePrimvarExistentAndValid(
  renderIndex: HdRenderIndex,
  rprim: HdRprim,
  primvarName: TfToken,
): boolean {
  let parentId = rprim.getInstancerId()
  while (parentId !== '') {
    const instancer = renderIndex.getInstancer(parentId) as
      unknown as HdStInstancer | null
    if (!TF_VERIFY(instancer)) {
      return false
    }

    const primvars =
      instancer!.getDelegate().getPrimvarDescriptors(instancer!.getId(),
        HdInterpolation.HdInterpolationInstance)

    for (const pv of primvars) {
      // We're looking for a primvar with the given name at any level
      // (since instance primvars aggregate).  Note: the value check here
      // must match HdStIsPrimvarExistentAndValid.
      if (pv.name === primvarName) {
        const value =
          instancer!.getDelegate().Get(instancer!.getId(), pv.name)
        if (_IsHoldingTypeName(value, 'string') ||
          _IsHoldingTypeName(value, 'string[]')) {
          return false
        }
        if (value.isArrayValued() && value.getArraySize() === 0) {
          return false
        }
        return !value.IsEmpty()
      }
    }

    parentId = instancer!.getParentId()
  }

  return false
}

// -----------------------------------------------------------------------------
// Topological invisibility utility
// -----------------------------------------------------------------------------

/** primUtils.cpp:1358-1386. Construct and return a buffer source
 *  representing visibility of the topological entity (e.g., face, curve,
 *  point) using one bit for the visibility of each indexed entity. */
function _GetBitmaskEncodedVisibilityBuffer(
  invisibleIndices: readonly number[],
  numTotalIndices: number,
  bufferName: TfToken,
  _rprimId: string,
): HdBufferSource {
  const numBitsPerUInt = 32 // std::numeric_limits<uint32_t>::digits
  const numUIntsNeeded = Math.ceil(numTotalIndices / numBitsPerUInt)
  // Initialize all bits to 1 (visible)
  const visibility = new Array<number>(numUIntsNeeded).fill(0xffffffff)

  for (const i of invisibleIndices) {
    if (i >= numTotalIndices || i < 0) {
      // This invisible index is out of range.  Ignore it silently.
      continue
    }
    const arrayIndex = Math.floor(i / numBitsPerUInt)
    const bitIndex = i % numBitsPerUInt
    visibility[arrayIndex] = (visibility[arrayIndex]! & ~(1 << bitIndex)) >>> 0 // set bit to 0
  }

  return new HdVtBufferSource(
    bufferName,
    VtValue.createArray(new VtArray<number>(visibility, VtValueTypes.uint)),
    numUIntsNeeded)
}

/** primUtils.cpp:1388-1459 */
export function HdStProcessTopologyVisibility(
  invisibleElements: readonly number[],
  numTotalElements: number,
  invisiblePoints: readonly number[],
  numTotalPoints: number,
  sharedData: HdRprimSharedData,
  drawItem: HdStDrawItem,
  renderParam: HdRenderParam | null | undefined,
  _changeTracker: HdRprimChangeTracker | null,
  resourceRegistry: HdStResourceRegistry,
  rprimId: string,
): void {
  const tvBAR = drawItem.getTopologyVisibilityRange()
  const sources: HdBufferSource[] = []

  // For the general case wherein there is no topological invisibility, we
  // don't create a BAR.
  // If any topological invisibility is authored (points/elements), create the
  // BAR with both sources. Once the BAR is created, we don't attempt to
  // delete it when there's no topological invisibility authored; we simply
  // reset the bits to make all elements/points visible.
  if (tvBAR || (invisibleElements.length !== 0 || invisiblePoints.length !== 0)) {
    sources.push(_GetBitmaskEncodedVisibilityBuffer(
      invisibleElements,
      numTotalElements,
      HdTokens.elementsVisibility as TfToken,
      rprimId))
    sources.push(_GetBitmaskEncodedVisibilityBuffer(
      invisiblePoints,
      numTotalPoints,
      HdTokens.pointsVisibility as TfToken,
      rprimId))
  }

  // Exit early if the BAR doesn't need to be allocated.
  if (!tvBAR && sources.length === 0) return

  const bufferSpecs: HdBufferSpec[] = []
  HdBufferSpec.getBufferSpecs(sources, bufferSpecs)
  let barNeedsReallocation = false
  if (tvBAR) {
    const oldBufferSpecs = tvBAR.getBufferSpecs()
    if (!_SpecVectorsEqual(oldBufferSpecs, bufferSpecs)) {
      barNeedsReallocation = true
    }
  }

  // XXX: Transition this code to use the Update* method instead.
  if (!tvBAR || barNeedsReallocation) {
    const range =
      resourceRegistry.allocateShaderStorageBufferArrayRange(
        HdTokens.topologyVisibility,
        bufferSpecs,
        HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
    sharedData.barContainer.Set(
      drawItem.getDrawingCoord().getTopologyVisibilityIndex(), range)

    HdStMarkDrawBatchesDirty(renderParam)

    if (barNeedsReallocation) {
      HdStMarkGarbageCollectionNeeded(renderParam)
    }
  }

  TF_VERIFY(drawItem.getTopologyVisibilityRange()!.isValid())

  resourceRegistry.addSources(
    drawItem.getTopologyVisibilityRange(), sources)
}

/** primUtils.cpp:1461-1467 */
export function HdStIsEnabledSharedVertexPrimvar(): boolean {
  return TfGetEnvSetting(HDST_ENABLE_SHARED_VERTEX_PRIMVAR)
}

/** size_t / uint64_t as the 8 little-endian bytes ArchHash64 reads from its
 *  address upstream. */
function _Uint64Bytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt.asUintN(64, value), true)
  return bytes
}

/** primUtils.cpp:1469-1506 */
export function HdStComputeSharedPrimvarId(
  baseId: bigint,
  sources: readonly HdBufferSource[],
  computations: HdStComputationComputeQueuePairVector,
): bigint {
  let primvarId = baseId
  for (const bufferSource of sources) {
    const sourceId = bufferSource.computeHash()
    primvarId = ArchHash64(_Uint64Bytes(sourceId), 8, primvarId)

    if (bufferSource.hasPreChainedBuffer()) {
      let src = bufferSource.getPreChainedBuffer()

      while (src) {
        // Upstream hashes bufferSource (not src) here; kept as is.
        const chainedSourceId = bufferSource.computeHash()
        primvarId = ArchHash64(_Uint64Bytes(chainedSourceId), 8, primvarId)

        src = src.getPreChainedBuffer()
      }
    }
  }

  for (const computation of computations) {
    const refinedComputation = computation[0]
    if (refinedComputation instanceof HdSt_OsdRefineComputationGPU) {
      primvarId = TfHashCombine(primvarId,
        refinedComputation.getInterpolation())
    }
  }
  const bufferSpecs: HdBufferSpec[] = []
  HdStGetBufferSpecsFromCompuations(computations, bufferSpecs)

  // TfHash::Combine(primvarId, bufferSpecs): the specs hash as their
  // (name, (type, count)) tuples (hd/bufferSpec.h:107-112).
  return TfHashCombine(primvarId, bufferSpecs.map((s) =>
    [s.name, [BigInt(s.tupleType.type), BigInt(s.tupleType.count)]]))
}

/** primUtils.cpp:1508-1519 */
export function HdStGetBufferSpecsFromCompuations(
  computations: HdStComputationComputeQueuePairVector,
  bufferSpecs: HdBufferSpec[],
): void {
  for (const compQueuePair of computations) {
    const comp = compQueuePair[0]
    if (comp.isValid()) {
      bufferSpecs.push(...comp.getBufferSpecs())
    }
  }
}
