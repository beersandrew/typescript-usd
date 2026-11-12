// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/pickTask.cpp,
//  pxr/imaging/hdx/pickTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/pickTask.{h,cpp} (OpenUSD 26.11.1):
// HdxPickTask, HdxPickTaskParams, HdxPickTaskContextParams, HdxPickHit,
// HdxPickResult, HdxPrimOriginInfo / HdxInstancerContext and the pick
// tokens.
//
// Divergences:
// - Readback is asynchronous. Upstream Execute reads the ID and depth AOVs
//   back with HdStTextureUtils::HgiTextureReadback, which waits for the GPU
//   (textureUtils.cpp:571-617), and resolves the hits into
//   contextParams.outHits before returning. WebGPU readback completes
//   later, so Execute records the render passes and starts the readback;
//   the hits are resolved into outHits when it completes. Callers await
//   GetPendingResolve() (on the task) before reading outHits.
// - The pick buffer is bound for resolveDeep only (see Prepare,
//   PLATFORM-DIVERGENCE(webkit-wgsl-atomic-compare-exchange)).
// - resolveDeep reads the pick buffer with HdBufferArrayRange::ReadData,
//   whose GPU copy is not awaited on an asynchronous backend
//   (PLATFORM-DIVERGENCE(hdst-readbuffer-sync), hdSt/src/bufferUtils.ts).
// - depthMaskCallback is an immediate-mode OpenGL callback run through
//   HgiGLGraphicsCmds::InsertFunctionOp (pickTask.cpp:422-494); there is no
//   GL here, so a set callback is a coding error and stencil conditioning
//   is skipped.
// - outHits is a JS array (HdxPickHitVector*); it is appended to.
// - HdxPickResult::ResolveUnique keys its map by the pixel's ids rather
//   than by TfHash::Combine of them (no hash collisions) and resolves in
//   first-seen order rather than unordered_map order; the set of hits is
//   the same.
// - Task context data may be given as the object or as a VtValue holding
//   it (HdEngine::SetTaskContextData stores what it is given).
// - The dynamic_casts to HdStRenderPassState / HdSt_RenderPass /
//   HdStResourceRegistry / HdStRenderDelegate are instanceof checks;
//   std::unique_ptr<HdStRenderBuffer> members are finalized in Destroy().
// - HD_TRACE / TRACE_FUNCTION are not ported; operator<< is GetString().

import { Debug as TfDebug, Token as TfToken, Type as TfType, HashCombine as TfHashCombine } from 'typescript-usd/tf'
import {
  Matrix4d as GfMatrix4d,
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
  Vec4i as GfVec4i,
  type Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
  AovTokens as HdAovTokens,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  ChangeTracker as HdChangeTracker,
  CompareFunction as HdCompareFunction,
  ContainerDataSource as HdContainerDataSource,
  CullStyle as HdCullStyle,
  InstancedBySchema as HdInstancedBySchema,
  InstancerTopologySchema as HdInstancerTopologySchema,
  PrimOriginSchema as HdPrimOriginSchema,
  PrimOriginSchemaTokens as HdPrimOriginSchemaTokens,
  RenderPassAovBinding as HdRenderPassAovBinding,
  RenderPassState as HdRenderPassState,
  ReprSelector as HdReprSelector,
  ReprTokens as HdReprTokens,
  RprimCollection as HdRprimCollection,
  StencilOp as HdStencilOp,
  Task as HdTask,
  Tokens as HdTokens,
  Type as HdType,
  Vec4f_2_10_10_10_REV as HdVec4f_2_10_10_10_REV,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type DirtyBits as HdDirtyBits,
  type InstancerContext as HdInstancerContext,
  type RenderIndex as HdRenderIndex,
  type RenderPass as HdRenderPass,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexBase as HdSceneIndexBase,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  HgiDeviceCapabilitiesBits,
  HgiTokens,
  type Hgi,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import {
  BindingRequest as HdStBindingRequest,
  BindingType as HdStBindingType,
  MaterialTagTokens as HdStMaterialTagTokens,
  RenderBuffer as HdStRenderBuffer,
  RenderDelegate as HdStRenderDelegate,
  RenderPassShader as HdStRenderPassShader,
  RenderPassState as HdStRenderPassState,
  RenderSettingsTokens as HdStRenderSettingsTokens,
  ResourceRegistry as HdStResourceRegistry,
  _RenderPass as HdSt_RenderPass,
} from 'typescript-usd/hdSt'
import { TextureUtils as HdStTextureUtils } from 'typescript-usd/hdSt'
import { HdxDebugCodes } from './debugCodes.ts'
import { HdxPackageRenderPassPickingShader } from './package.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** pickTask.h:41-48 (HDX_PICK_RESOLVE_MODE_TOKENS) */
export const HdxPickResolveModeTokens = Object.freeze({
  resolveNearestToCamera: TfToken('resolveNearestToCamera'),
  resolveNearestToCenter: TfToken('resolveNearestToCenter'),
  resolveUnique: TfToken('resolveUnique'),
  resolveAll: TfToken('resolveAll'),
  resolveDeep: TfToken('resolveDeep'),
})

/** pickTask.h:50-64 (HDX_PICK_TOKENS) */
export const HdxPickTokens = Object.freeze({
  /* Task context */
  pickParams: TfToken('pickParams'),

  /* Pick target */
  pickPrimsAndInstances: TfToken('pickPrimsAndInstances'),
  pickFaces: TfToken('pickFaces'),
  pickEdges: TfToken('pickEdges'),
  pickPoints: TfToken('pickPoints'),
  pickPointsAndInstances: TfToken('pickPointsAndInstances'),

  ...HdxPickResolveModeTokens,
})

/** pickTask.cpp:50-58 */
const _tokens = {
  PickBuffer: TfToken('PickBuffer'),
  PickBufferBinding: TfToken('PickBufferBinding'),
  Picking: TfToken('Picking'),
  overlayDepthStencil: TfToken('overlayDepthStencil'),
}

/** pickTask.cpp:71-73 */
const PICK_BUFFER_HEADER_SIZE = 8
const PICK_BUFFER_SUBBUFFER_CAPACITY = 32
const PICK_BUFFER_ENTRY_SIZE = 3

/** hdSt/volume.cpp:42-43 (HdStVolume::defaultStepSize, defaultStepSizeLighting) */
const HdStVolume_defaultStepSize = 1.0
const HdStVolume_defaultStepSizeLighting = 10.0

/** pickTask.h:76-84. Pick task params. This is augmented by the
 *  HdxPickTaskContextParams, which is passed in on the task context. */
export class HdxPickTaskParams {
  cullStyle: HdCullStyle = HdCullStyle.HdCullStyleNothing

  /** The struct's copy. */
  Clone(): HdxPickTaskParams {
    return Object.assign(new HdxPickTaskParams(), this)
  }

  /** pickTask.cpp:1780-1784 (operator==) */
  Equals(rhs: HdxPickTaskParams): boolean {
    return this.cullStyle === rhs.cullStyle
  }

  /** pickTask.cpp:1792-1797 (operator<<) */
  GetString(): string {
    return `PickTask Params: (...) ${this.cullStyle}`
  }
}
export const HdxPickTaskParamsType = TfType.declare('HdxPickTaskParams')

/** pickTask.h:86-147. Picking hit structure. This is output by the pick task
 *  as a record of what objects the picking query found. */
export class HdxPickHit {
  /** delegateID of HdSceneDelegate that provided the picked prim.
   *  Irrelevant for scene indices. */
  delegateId = ''
  /** Path computed from scenePath's in primOrigin data source of picked
   *  prim and instancers if provided by scene index. Otherwise, path in
   *  render index. */
  objectId = ''
  /** Only supported for scene delegates, see HdxPrimOriginInfo for scene
   *  indices. */
  instancerId = ''
  /** Index of the picked instance. */
  instanceIndex = 0
  elementIndex = 0
  edgeIndex = 0
  pointIndex = 0
  worldSpaceHitPoint = new GfVec3d(0, 0, 0)
  worldSpaceHitNormal = new GfVec3f(0, 0, 0)
  /** normalizedDepth is in the range [0,1]. Nb: The pick depth buffer
   *  won't contain items drawn with renderTag "displayInOverlay"; but such
   *  items can still be picked. */
  normalizedDepth = 0

  /** pickTask.h:132-134 */
  isValid(): boolean {
    return this.objectId !== ''
  }

  /** pickTask.cpp:1710-1735 */
  getHash(): bigint {
    return TfHashCombine(0n,
      this.delegateId,
      this.objectId,
      this.instancerId,
      this.instanceIndex,
      this.elementIndex,
      this.edgeIndex,
      this.pointIndex,
      this.worldSpaceHitPoint.get(0),
      this.worldSpaceHitPoint.get(1),
      this.worldSpaceHitPoint.get(2),
      this.worldSpaceHitNormal.get(0),
      this.worldSpaceHitNormal.get(1),
      this.worldSpaceHitNormal.get(2),
      this.normalizedDepth)
  }

  /** The struct's copy. */
  Clone(): HdxPickHit {
    const h = Object.assign(new HdxPickHit(), this)
    h.worldSpaceHitPoint = new GfVec3d(this.worldSpaceHitPoint.get(0),
      this.worldSpaceHitPoint.get(1), this.worldSpaceHitPoint.get(2))
    h.worldSpaceHitNormal = new GfVec3f(this.worldSpaceHitNormal.get(0),
      this.worldSpaceHitNormal.get(1), this.worldSpaceHitNormal.get(2))
    return h
  }

  /** pickTask.cpp:1747-1760 (operator==) */
  Equals(rhs: HdxPickHit): boolean {
    return this.objectId === rhs.objectId &&
      this.delegateId === rhs.delegateId &&
      this.instancerId === rhs.instancerId &&
      this.instanceIndex === rhs.instanceIndex &&
      this.elementIndex === rhs.elementIndex &&
      this.edgeIndex === rhs.edgeIndex &&
      this.pointIndex === rhs.pointIndex &&
      this.worldSpaceHitPoint.equals(rhs.worldSpaceHitPoint) &&
      this.worldSpaceHitNormal.equals(rhs.worldSpaceHitNormal) &&
      this.normalizedDepth === rhs.normalizedDepth
  }

  /** pickTask.cpp:1768-1782 (operator<<) */
  GetString(): string {
    const v = (x: GfVec3d | GfVec3f) => `(${x.get(0)}, ${x.get(1)}, ${x.get(2)})`
    return `Delegate: <${this.delegateId}> ` +
      `Object: <${this.objectId}> ` +
      `LegacyInstancer: <${this.instancerId}> ` +
      `LegacyInstanceId: [${this.instanceIndex}] ` +
      `Element: [${this.elementIndex}] ` +
      `Edge: [${this.edgeIndex}] ` +
      `Point: [${this.pointIndex}] ` +
      `HitPoint: ${v(this.worldSpaceHitPoint)} ` +
      `HitNormal: ${v(this.worldSpaceHitNormal)} ` +
      `Depth: ${this.normalizedDepth}`
  }
}
export const HdxPickHitType = TfType.declare('HdxPickHit')
export type HdxPickHitVector = HdxPickHit[]

/** pickTask.cpp:1741-1745. For sorting, order hits by ndc depth. */
export function HdxPickHitLess(lhs: HdxPickHit, rhs: HdxPickHit): boolean {
  return lhs.normalizedDepth < rhs.normalizedDepth
}

/** pickTask.h:150-172. Information about an instancer instancing a picked
 *  object (or an instancer instancing such an instancer and so on). */
export interface HdxInstancerContext {
  /** The path of the instancer in the scene index. */
  instancerSceneIndexPath: string
  /** The prim origin data source of the instancer. */
  instancerPrimOrigin: HdContainerDataSource | undefined
  /** The path of the picked instance in the scene index (implicit
   *  instancing). */
  instanceSceneIndexPath: string
  /** The prim origin data source of the instance (implicit instancing). */
  instancePrimOrigin: HdContainerDataSource | undefined
  /** Index of the picked instance. */
  instanceId: number
}

/** pickTask.cpp:62-68 */
interface _InstanceInfo {
  path: string
  primSource: HdContainerDataSource | undefined
  instanceIndices: number[]
  instanceLocations: string[]
}

/** pickTask.cpp:1165-1181. Extracts (first) instanced by path from
 *  primSource. */
function _ComputeInstancedByPath(primSource: HdContainerDataSource | undefined): string {
  const schema = HdInstancedBySchema.getFromParent(primSource)
  const ds = schema.getPaths()
  if (!ds) {
    return ''
  }
  const paths = _PathArray(ds.getTypedValue(0.0))
  if (paths.length === 0) {
    return ''
  }
  return paths[0]!
}

/** VtArray<SdfPath> / string[] to path strings. */
function _PathArray(value: unknown): string[] {
  const arr = value instanceof VtArray ? value.toArray() : Array.isArray(value) ? value : []
  return arr.map(p => typeof p === 'string' ? p : String((p as { pathString?: string })?.pathString ?? p))
}

/** pickTask.cpp:1183-1225 */
function _ComputeInstancerAndInstanceIndicesAndLocations(
  sceneIndex: HdSceneIndexBase,
  primPath: string,
  primSource: HdContainerDataSource | undefined,
): _InstanceInfo {
  const result: _InstanceInfo = { path: '', primSource: undefined, instanceIndices: [], instanceLocations: [] }
  const instancerPath = _ComputeInstancedByPath(primSource)

  if (instancerPath !== '') {
    const instancerSource = sceneIndex.getPrim(instancerPath).dataSource

    const schema = HdInstancerTopologySchema.getFromParent(instancerSource)
    if (schema.isDefined()) {
      const instanceLocationsDs = schema.getInstanceLocations()

      result.path = instancerPath
      result.primSource = instancerSource
      result.instanceIndices = schema.computeInstanceIndicesForProto(primPath)
      if (instanceLocationsDs) {
        result.instanceLocations = _PathArray(instanceLocationsDs.getTypedValue(0.0))
      }
    }
  }

  return result
}

/** pickTask.cpp:1227-1340. Implements the bulk of the FromPickHit[s] logic.
 *  The infoCache parameter can be set to null if no caching is desired. */
function _FromPickHitWithCache(sceneIndex: HdSceneIndexBase, hit: HdxPickHit,
  infoCache: Map<string, _InstanceInfo> | null): HdxPrimOriginInfo {
  const result = new HdxPrimOriginInfo()
  let path = hit.objectId
  let primSource = sceneIndex.getPrim(path).dataSource

  // First, ask the prim itself for the prim origin data source.
  // This will only be valid when scene indices are enabled.
  result.primOrigin = HdPrimOriginSchema.getFromParent(primSource).getContainer()

  // instanceIndex encodes the index of the instance at each level of
  // instancing.
  //
  // Example: we picked instance 6 of 10 in the outer most instancer
  //                    instance 3 of 12 in the next instancer
  //                    instance 7 of 15 in the inner most instancer,
  // instanceIndex = 6 * 12 * 15 + 3 * 15 + 7.
  let instanceIndex = hit.instanceIndex

  // Starting with the prim itself, ask for the instancer instancing
  // it and the instancer instancing that instancer and so on.
  while (true) {
    let instanceInfo: _InstanceInfo

    if (infoCache) {
      const it = infoCache.get(path)
      if (it === undefined) {
        // Get data from the instancer.
        instanceInfo = _ComputeInstancerAndInstanceIndicesAndLocations(
          sceneIndex, path, primSource)
        infoCache.set(path, instanceInfo)
      } else {
        instanceInfo = it
      }
    } else {
      // Get data from the instancer.
      instanceInfo = _ComputeInstancerAndInstanceIndicesAndLocations(
        sceneIndex, path, primSource)
    }
    path = instanceInfo.path
    primSource = instanceInfo.primSource

    if (!primSource) {
      break
    }

    // How often does the current instancer instantiate the
    // prototype containing the given prim (or inner instancer).
    const n = instanceInfo.instanceIndices.length
    if (n === 0) {
      break
    }

    const ctx: HdxInstancerContext = {
      instancerSceneIndexPath: path,
      instancerPrimOrigin: HdPrimOriginSchema.getFromParent(primSource).getContainer(),
      instanceSceneIndexPath: '',
      instancePrimOrigin: undefined,
      instanceId: 0,
    }

    const i = instanceIndex % n
    instanceIndex = Math.trunc(instanceIndex / n)

    ctx.instanceId = instanceInfo.instanceIndices[i]!

    if (ctx.instanceId >= 0 &&
      ctx.instanceId < instanceInfo.instanceLocations.length) {
      ctx.instanceSceneIndexPath = instanceInfo.instanceLocations[ctx.instanceId]!

      const schema = HdPrimOriginSchema.getFromParent(
        sceneIndex.getPrim(ctx.instanceSceneIndexPath).dataSource)
      ctx.instancePrimOrigin = schema.getContainer()
    }

    result.instancerContexts.push(ctx)
  }

  // Bring it into the form so that outer most instancer is first.
  result.instancerContexts.reverse()

  return result
}

/** pickTask.cpp:1410-1432. Consults given prim source for origin path to
 *  either replace the given path (if origin path is absolute) or append to
 *  given path (if origin path is relative). If no prim origin data source,
 *  leave path unchanged. Return whether the path was appended-to. */
function _AppendPrimOriginToPath(primOriginDs: HdContainerDataSource | undefined,
  nameInPrimOrigin: string, path: { value: string }): boolean {
  const schema = new HdPrimOriginSchema(primOriginDs)
  if (!schema.isDefined()) {
    return false
  }
  const scenePath = schema.getOriginPath(nameInPrimOrigin)
  if (scenePath === '') {
    return false
  }
  if (scenePath.startsWith('/')) {
    path.value = scenePath
  } else {
    // SdfPath::AppendPath on an empty path yields the empty path.
    path.value = path.value === '' ? '' :
      (path.value === '/' ? '/' : path.value + '/') + scenePath
  }
  return true
}

/** pickTask.h:174-264. A helper to extract information about the picked
 *  prim that allows modern applications to identify a prim and,
 *  e.g., obtain the scene path such as the path of the corresponding
 *  UsdPrim. */
export class HdxPrimOriginInfo {
  /** Information about the instancers instancing the picked object. The
   *  outer most instancer will be first. */
  instancerContexts: HdxInstancerContext[] = []
  /** Prim origin data source for picked prim if provided by the scene
   *  index. */
  primOrigin: HdContainerDataSource | undefined = undefined

  /** pickTask.cpp:1342-1360. Query terminal scene index of render index for
   *  information about picked prim. */
  static fromPickHit(sceneIndexOrRenderIndex: HdSceneIndexBase | HdRenderIndex | undefined,
    hit: HdxPickHit): HdxPrimOriginInfo {
    const terminalSceneIndex = _TerminalSceneIndex(sceneIndexOrRenderIndex)
    // Fallback value.
    if (!terminalSceneIndex) {
      return new HdxPrimOriginInfo()
    }

    return _FromPickHitWithCache(terminalSceneIndex, hit, null)
  }

  /** pickTask.cpp:1362-1391. Query terminal scene index of render index for
   *  information about picked prims. */
  static fromPickHits(sceneIndexOrRenderIndex: HdSceneIndexBase | HdRenderIndex | undefined,
    hits: readonly HdxPickHit[]): HdxPrimOriginInfo[] {
    const terminalSceneIndex = _TerminalSceneIndex(sceneIndexOrRenderIndex)
    const infoCache = new Map<string, _InstanceInfo>()

    // Fallback value.
    if (!terminalSceneIndex) {
      return hits.map(() => new HdxPrimOriginInfo())
    }

    return hits.map(hit => _FromPickHitWithCache(terminalSceneIndex, hit, infoCache))
  }

  /** pickTask.cpp:1434-1454. Combines instance scene paths and prim scene
   *  path to obtain the full scene path. */
  getFullPath(nameInPrimOrigin: string = HdPrimOriginSchemaTokens.scenePath): string {
    const path = { value: '' }

    // Combine implicit instance paths.
    //
    // In case of USD, only native instancing (not point instancing)
    // contributes instancers giving implicit instance paths.
    // The first instancer coming from native instancing is outside
    // any USD prototype and would give an absolute implicit instance path.
    // The next (inner) instancer would be inside a USD prototype and
    // gives an implicit instance path relative to the prototype root.
    for (const ctx of this.instancerContexts) {
      _AppendPrimOriginToPath(ctx.instancePrimOrigin, nameInPrimOrigin, path)
    }
    _AppendPrimOriginToPath(this.primOrigin, nameInPrimOrigin, path)
    return path.value
  }

  /** pickTask.cpp:1456-1485. Computes an HdInstancerContext object (from
   *  the instancerContexts). */
  computeInstancerContext(nameInPrimOrigin: string = HdPrimOriginSchemaTokens.scenePath): HdInstancerContext {
    const outCtx: HdInstancerContext = []

    // Loop through the instancer contexts from outermost to innermost,
    // building up a path.
    const prefix = { value: '' }
    for (const ctx of this.instancerContexts) {
      // First, check if instancerPrimOrigin has anything (via _Append
      // return value); if so, this instancer is in the scene and needs to
      // be added to outCtx. We prepend the current prefix, since if the
      // prefix is non-empty it indicates this instancer participated in
      // instance aggregation.
      const instancer = { value: prefix.value }
      if (_AppendPrimOriginToPath(ctx.instancerPrimOrigin, nameInPrimOrigin, instancer)) {
        outCtx.push([instancer.value, ctx.instanceId])
      }

      // If instancePrimOrigin has anything in it, that indicates this
      // instancer participated in instance aggregation, and its
      // contribution to the path of any later instancers needs to be added
      // to the prefix.
      _AppendPrimOriginToPath(ctx.instancePrimOrigin, nameInPrimOrigin, prefix)
    }

    return outCtx
  }
}

/** HdRenderIndex::GetTerminalSceneIndex for the render index overloads. */
function _TerminalSceneIndex(x: HdSceneIndexBase | HdRenderIndex | undefined): HdSceneIndexBase | undefined {
  if (!x) return undefined
  const ri = x as { getTerminalSceneIndex?: () => HdSceneIndexBase | undefined }
  return typeof ri.getTerminalSceneIndex === 'function' ? ri.getTerminalSceneIndex() : x as HdSceneIndexBase
}

/** pickTask.h:266-345. Pick task context params. This contains
 *  task params that can't come from the scene delegate (like resolution).
 *  Additionally, they are changed by the application more frequently. */
export class HdxPickTaskContextParams {
  resolution = new GfVec2i(128, 128)
  maxNumDeepEntries = 32000
  pickTarget: TfToken = HdxPickTokens.pickPrimsAndInstances
  resolveMode: TfToken = HdxPickTokens.resolveNearestToCamera
  doUnpickablesOcclude = false
  viewMatrix = new GfMatrix4d(1)
  projectionMatrix = new GfMatrix4d(1)
  clipPlanes: GfVec4d[] = []
  depthMaskCallback: (() => void) | null = null
  collection = new HdRprimCollection()
  alphaThreshold = Math.fround(0.0001)
  pointSize = 3.0
  pointSelectedSize = 5.0
  depthBiasEnable = false
  depthBiasConstantFactor = 0.0
  depthBiasSlopeFactor = 0.0
  outHits: HdxPickHitVector | null = null

  /** The struct's copy (outHits stays the same vector, a pointer
   *  upstream). */
  Clone(): HdxPickTaskContextParams {
    const p = Object.assign(new HdxPickTaskContextParams(), this)
    p.clipPlanes = [...this.clipPlanes]
    return p
  }

  /** pickTask.cpp:1799-1823 (operator==) */
  Equals(rhs: HdxPickTaskContextParams): boolean {
    return this.resolution.equals(rhs.resolution) &&
      this.pickTarget === rhs.pickTarget &&
      this.resolveMode === rhs.resolveMode &&
      this.doUnpickablesOcclude === rhs.doUnpickablesOcclude &&
      this.viewMatrix.equals(rhs.viewMatrix) &&
      this.projectionMatrix.equals(rhs.projectionMatrix) &&
      this.clipPlanes.length === rhs.clipPlanes.length &&
      this.clipPlanes.every((p, i) => p.equals(rhs.clipPlanes[i]!)) &&
      this.depthMaskCallback === rhs.depthMaskCallback &&
      this.collection.Equals(rhs.collection) &&
      this.outHits === rhs.outHits
  }
}
export const HdxPickTaskContextParamsType = TfType.declare('HdxPickTaskContextParams')

/** pickTask.cpp:75-91 */
function _InitIdRenderPassState(index: HdRenderIndex): HdRenderPassState {
  const rps = (index.getRenderDelegate() as unknown as {
    createRenderPassState(): HdRenderPassState
  }).createRenderPassState()

  if (rps instanceof HdStRenderPassState) {
    rps.setRenderPassShader(
      new HdStRenderPassShader(HdxPackageRenderPassPickingShader()))
  }

  return rps
}

/** pickTask.cpp:93-101 */
function _IsStormRenderer(renderDelegate: unknown): boolean {
  if (!(renderDelegate instanceof HdStRenderDelegate)) {
    return false
  }

  return true
}

/** TfMakeValidIdentifier (tf/stringUtils.cpp) for the AOV names used here. */
function _MakeValidIdentifier(s: string): string {
  let out = s.replace(/[^A-Za-z0-9_]/g, '_')
  if (out.length === 0 || /[0-9]/.test(out[0]!)) out = '_' + out.slice(1)
  return out
}

/** pickTask.cpp:118-124 */
function _GetAovPath(aovName: string): string {
  return 'aov_pickTask_' + _MakeValidIdentifier(aovName)
}

/** pickTask.cpp:126-132 */
function _GetOverlayAovPath(aovName: string): string {
  return 'aov_pickTask_overlay_' + _MakeValidIdentifier(aovName)
}

/** VtValue held objects or the objects themselves (see the header). */
function _Held<T>(value: unknown): T | undefined {
  if (value instanceof VtValue) {
    return value.IsEmpty() ? undefined : value.UncheckedGet<T>()
  }
  return value as T | undefined
}

type _IntBuffer = Int32Array | null
type _FloatBuffer = Float32Array | null

/** pickTask.cpp:1555-1607. Inspect the id buffers to determine if the pixel
 *  index is a valid hit by accounting for the pick target when picking
 *  points and edges. This allows the hit(s) returned to be relevant.
 *
 *  Shared between HdxPickResult's own resolve methods and HdxPickTask::
 *  Execute's overlay-into-pickable merge, so that both agree on what counts
 *  as a hit for a given pickTarget. */
function _IsValidPickHit(
  primIds: _IntBuffer,
  instanceIds: _IntBuffer,
  _elementIds: _IntBuffer,
  edgeIds: _IntBuffer,
  pointIds: _IntBuffer,
  index: number,
  pickTarget: string,
  renderIndex: HdRenderIndex,
): boolean {
  const primId = primIds ? primIds[index]! : -1
  if (primId === -1) {
    return false
  }
  if (pickTarget === HdxPickTokens.pickEdges) {
    return (edgeIds ? edgeIds[index]! : -1) !== -1
  } else if (pickTarget === HdxPickTokens.pickPoints) {
    return (pointIds ? pointIds[index]! : -1) !== -1
  } else if (pickTarget === HdxPickTokens.pickPointsAndInstances) {
    if ((pointIds ? pointIds[index]! : -1) !== -1) {
      return true
    }
    const instanceId = instanceIds ? instanceIds[index]! : -1
    if (instanceId !== -1) {
      const primPath = renderIndex.getRprimPathFromPrimId(primId)
      if (primPath !== '') {
        const ids = renderIndex.getSceneDelegateAndInstancerIds(primPath)
        if (ids && ids.instancerId !== '') {
          return true
        }
      }
    }
    return false
  }

  return true
}

/** pickTask.h:348-366. A task for running picking queries against the
 *  current scene. */
export class HdxPickTask extends HdTask {
  private _params = new HdxPickTaskParams()
  private _contextParams = new HdxPickTaskContextParams()
  private _renderTags: string[] = []
  private _useOverlayPass = false

  // We need to cache a pointer to the render index so Execute() can
  // map prim ID to paths.
  private _index: HdRenderIndex | null = null

  // Create a shared render pass each for pickables, unpickables, and
  // items in overlay (which may draw on top even when occluded).
  private _pickableRenderPass: HdRenderPass | null = null
  private _occluderRenderPass: HdRenderPass | null = null
  private _overlayRenderPass: HdRenderPass | null = null

  // Having separate render pass states allows us to use different
  // shader mixins if we choose to (we don't currently).
  private _pickableRenderPassState: HdRenderPassState | null = null
  private _occluderRenderPassState: HdRenderPassState | null = null
  private _overlayRenderPassState: HdRenderPassState | null = null

  private _hgi: Hgi | null = null

  private _pickableAovBuffers: HdStRenderBuffer[] = []
  private _pickableAovBindings: HdRenderPassAovBinding[] = []
  private _occluderAovBinding = new HdRenderPassAovBinding()
  private _pickableDepthIndex = 0
  private _depthToken: string = HdAovTokens.depthStencil

  private _overlayDepthStencilBuffer: HdStRenderBuffer | null = null
  private _overlayAovBuffers: HdStRenderBuffer[] = []
  private _overlayAovBindings: HdRenderPassAovBinding[] = []

  // pick buffer used for deep selection
  private _pickBuffer: HdBufferArrayRange | null = null

  // The readback and resolve started by the last Execute (see the header).
  private _pendingResolve: Promise<void> = Promise.resolve()

  /** pickTask.cpp:137-146 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** pickTask.cpp:148-151 (the destructor). */
  destroy(): void {
    this._cleanupAovBindings()
  }

  /** The readback and resolve of the last Execute; outHits holds the hits
   *  once it resolves (see the header). */
  getPendingResolve(): Promise<void> {
    return this._pendingResolve
  }

  /** pickTask.h:404-410 */
  static decodeIDRenderColor(idColor: ArrayLike<number>, offset = 0): number {
    return ((idColor[offset]! & 0xff) << 0) |
      ((idColor[offset + 1]! & 0xff) << 8) |
      ((idColor[offset + 2]! & 0xff) << 16) |
      ((idColor[offset + 3]! & 0xff) << 24)
  }

  private _resourceRegistry(): HdStResourceRegistry | null {
    const registry = this._index?.getResourceRegistry()
    return registry instanceof HdStResourceRegistry ? registry : null
  }

  /** pickTask.cpp:153-206 */
  private _initIfNeeded(): void {
    const index = this._index!
    // Init pick buffer
    if (!this._pickBuffer) {
      const hdStResourceRegistry = this._resourceRegistry()

      if (hdStResourceRegistry) {
        const bufferSpecs = [
          { name: _tokens.PickBuffer, tupleType: { type: HdType.HdTypeInt32, count: 1 } },
        ]

        this._pickBuffer = hdStResourceRegistry.allocateSingleBufferArrayRange(
          _tokens.Picking,
          bufferSpecs, HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
      }
    }

    if (this._pickableAovBuffers.length === 0) {
      this._createAovBindings()
    }

    for (const aovBinding of this._pickableAovBindings) {
      this._resizeOrCreateBufferForAOV(aovBinding)
    }
    for (const aovBinding of this._overlayAovBindings) {
      this._resizeOrCreateBufferForAOV(aovBinding)
    }

    if (this._pickableRenderPass === null || this._occluderRenderPass === null ||
      this._overlayRenderPass === null) {
      // The collection created below is just for satisfying the HdRenderPass
      // constructor. The collections for the render passes are set in Query.
      const col = new HdRprimCollection(HdTokens.geometry,
        new HdReprSelector(HdReprTokens.hull))
      const renderDelegate = index.getRenderDelegate()
      this._pickableRenderPass = renderDelegate.createRenderPass(index, col) ?? null
      this._occluderRenderPass = renderDelegate.createRenderPass(index, col) ?? null
      this._overlayRenderPass = renderDelegate.createRenderPass(index, col) ?? null

      // initialize renderPassStates with ID render shader
      this._pickableRenderPassState = _InitIdRenderPassState(index)
      this._occluderRenderPassState = _InitIdRenderPassState(index)
      this._overlayRenderPassState = _InitIdRenderPassState(index)
      // Turn off color writes for the occluders, wherein we want to only
      // condition the depth buffer and not write out any IDs.
      // XXX: This is a hacky alternative to using a different shader mixin
      // to accomplish the same thing.
      this._occluderRenderPassState.setColorMaskUseDefault(false)
      this._occluderRenderPassState.setColorMasks([HdRenderPassState.ColorMaskNone])
    }
  }

  /** pickTask.cpp:208-308 */
  private _createAovBindings(): void {
    const hdStResourceRegistry = this._resourceRegistry()!
    const renderDelegate = this._index!.getRenderDelegate()

    const stencilReadback = this._hgi!.getCapabilities()!.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsStencilReadback)

    this._depthToken = stencilReadback ? HdAovTokens.depthStencil : HdAovTokens.depth

    // Generated renderbuffers
    const _aovOutputs = [
      HdAovTokens.primId,
      HdAovTokens.instanceId,
      HdAovTokens.elementId,
      HdAovTokens.edgeId,
      HdAovTokens.pointId,
      HdAovTokens.Neye,
      this._depthToken,
    ]

    // Add the new renderbuffers.
    for (let i = 0; i < _aovOutputs.length; ++i) {
      const aovOutput = _aovOutputs[i]!
      const aovId = _GetAovPath(aovOutput)

      const buffer = new HdStRenderBuffer(hdStResourceRegistry, aovId)
      this._pickableAovBuffers.push(buffer)

      const aovDesc = renderDelegate.getDefaultAovDescriptor(aovOutput)

      // Convert to a binding.
      const binding = new HdRenderPassAovBinding()
      binding.aovName = aovOutput
      binding.renderBufferId = aovId
      binding.aovSettings = aovDesc.aovSettings
      binding.renderBuffer = buffer
      binding.clearValue = aovDesc.clearValue

      this._pickableAovBindings.push(binding)

      if (HdAovHasDepthSemantic(aovOutput) ||
        HdAovHasDepthStencilSemantic(aovOutput)) {
        this._pickableDepthIndex = i
        this._occluderAovBinding = binding
      }
    }

    // Set up the overlay render pass's own ID AOVs, distinct from the
    // pickable pass's, so that a fragment written by an overlay prim can be
    // compared against what the pickable pass wrote at that pixel instead of
    // overwriting it outright.  These clear to the AOVs' normal (unset)
    // values, which is what makes "did the overlay pass write this pixel?"
    // answerable in Execute().
    for (const aovOutput of _aovOutputs) {
      if (HdAovHasDepthSemantic(aovOutput) ||
        HdAovHasDepthStencilSemantic(aovOutput)) {
        continue
      }

      const aovId = _GetOverlayAovPath(aovOutput)

      const buffer = new HdStRenderBuffer(hdStResourceRegistry, aovId)
      this._overlayAovBuffers.push(buffer)

      const aovDesc = renderDelegate.getDefaultAovDescriptor(aovOutput)

      const binding = new HdRenderPassAovBinding()
      binding.aovName = aovOutput
      binding.renderBufferId = aovId
      binding.aovSettings = aovDesc.aovSettings
      binding.renderBuffer = buffer
      binding.clearValue = aovDesc.clearValue

      this._overlayAovBindings.push(binding)
    }

    // Set up overlay render pass depth binding, a fresh empty depthStencil
    // buffer, so that inter-item overlay occlusion is correct while overlay
    // items all draw in front of any previously-drawn items.  This depth
    // buffer is deliberately never merged into the pickable pass's, so the
    // pick depth buffer continues to exclude overlay items (see
    // HdxPickHit::normalizedDepth).
    {
      this._overlayDepthStencilBuffer = new HdStRenderBuffer(
        hdStResourceRegistry,
        _GetAovPath(_tokens.overlayDepthStencil))

      const depthDesc = renderDelegate.getDefaultAovDescriptor(this._depthToken)

      const overlayDepthBinding = new HdRenderPassAovBinding()
      overlayDepthBinding.aovName = _tokens.overlayDepthStencil
      overlayDepthBinding.renderBufferId = _GetAovPath(_tokens.overlayDepthStencil)
      overlayDepthBinding.aovSettings = depthDesc.aovSettings
      overlayDepthBinding.renderBuffer = this._overlayDepthStencilBuffer
      overlayDepthBinding.clearValue = VtValue.create(new GfVec4f(1, 1, 1, 1), VtValueTypes.GfVec4f)
      this._overlayAovBindings.push(overlayDepthBinding)
    }
  }

  /** pickTask.cpp:310-330 */
  private _cleanupAovBindings(): void {
    if (this._index) {
      const renderParam = this._index.getRenderDelegate().getRenderParam() ?? null
      for (const aovBuffer of this._pickableAovBuffers) {
        aovBuffer.finalize(renderParam)
      }
      for (const aovBuffer of this._overlayAovBuffers) {
        aovBuffer.finalize(renderParam)
      }
      this._overlayDepthStencilBuffer?.finalize(renderParam)
    }
    this._pickableAovBuffers = []
    this._pickableAovBindings = []
    this._overlayAovBuffers = []
    this._overlayAovBindings = []
  }

  /** pickTask.cpp:332-367 */
  private _resizeOrCreateBufferForAOV(aovBinding: HdRenderPassAovBinding): void {
    const renderDelegate = this._index!.getRenderDelegate()
    const renderBuffer = aovBinding.renderBuffer as HdStRenderBuffer

    const dimensions: [number, number, number] = [
      this._contextParams.resolution.get(0),
      this._contextParams.resolution.get(1), 1]

    const existingResource = renderBuffer.getResource(false)

    if (existingResource && existingResource.isSet()) {
      const width = renderBuffer.getWidth()
      const height = renderBuffer.getHeight()
      if (width === dimensions[0] && height === dimensions[1]) {
        return
      }
    }

    // If the resolution has changed then reallocate the
    // renderBuffer and  texture.
    const aovDesc = renderDelegate.getDefaultAovDescriptor(aovBinding.aovName)

    renderBuffer.allocate(dimensions, aovDesc.format, false)

    const newResource = renderBuffer.getResource(false)

    if (!newResource || !newResource.isSet()) {
      TF_CODING_ERROR(`No texture on render buffer for AOV ${aovBinding.aovName}`)
    }
  }

  /** pickTask.cpp:422-494 (see the header: no GL here). */
  private _conditionStencilWithGLCallback(): void {
    TF_CODING_ERROR('HdxPickTask: depthMaskCallback runs immediate-mode OpenGL ' +
      '(HgiGLGraphicsCmds::InsertFunctionOp), which this Hgi backend does not have')
  }

  /** pickTask.cpp:496-501 */
  private _useOcclusionPass(): boolean {
    return this._contextParams.doUnpickablesOcclude &&
      this._contextParams.collection.getExcludePaths().length > 0
  }

  /** pickTask.cpp:503-507 */
  private _UseOverlayPass(): boolean {
    return this._useOverlayPass
  }

  /** pickTask.cpp:509-520 */
  private _updateUseOverlayPass(): void {
    // Check if the overlay pass is actually needed using HasDrawItems().
    // This assumes the function only be called during Prepare or Execute.
    if (this._useOverlayPass) {
      if (this._overlayRenderPass instanceof HdSt_RenderPass) {
        this._useOverlayPass = this._overlayRenderPass.hasDrawItems(this.getRenderTags())
      }
    }
  }

  /** pickTask.cpp:523-554 (_ReadAovBuffer<T>; see the header). */
  private async _readAovBuffer(aovName: string,
    bindings: readonly HdRenderPassAovBinding[] = this._pickableAovBindings): Promise<Uint8Array | null> {
    const renderBuffer = this._findAovBuffer(aovName, bindings)
    if (!renderBuffer) {
      return null
    }

    const texture = renderBuffer.getResource(false) as HgiTextureHandle | undefined
    if (texture && texture.isSet()) {
      return await HdStTextureUtils.hgiTextureReadback(this._hgi!, texture)
    }

    return null
  }

  /** pickTask.cpp:556-572 */
  private _findAovBuffer(aovName: string,
    bindings: readonly HdRenderPassAovBinding[]): HdStRenderBuffer | null {
    const binding = bindings.find(b => b.aovName === aovName)

    if (!TF_VERIFY(binding !== undefined)) {
      return null
    }

    return binding!.renderBuffer as HdStRenderBuffer
  }

  /** pickTask.cpp:574-700 */
  sync(delegateArg: unknown, ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    const delegate = delegateArg as HdSceneDelegate
    if (!_IsStormRenderer(delegate.getRenderIndex().getRenderDelegate())) {
      return
    }

    if (!this._hgi) {
      this._hgi = HdTask._getDriver<Hgi>(ctx, HgiTokens.renderDriver)
    }

    // Gather params from the scene and the task context.
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxPickTaskParams)
      if (params) this._params = params.Clone()
    }

    if (dirtyBits & HdChangeTracker.DirtyRenderTags) {
      this._renderTags = this._getTaskRenderTags(delegate)
    }

    // At this point in the process, we have to assume the overlay pass is
    // used.
    this._useOverlayPass = true

    const contextParams = _Held<HdxPickTaskContextParams>(ctx.get(HdxPickTokens.pickParams))
    if (contextParams instanceof HdxPickTaskContextParams) {
      this._contextParams = contextParams
    }

    // Store the render index so we can map ids to paths in Execute()...
    this._index = delegate.getRenderIndex()

    this._initIfNeeded()

    if (!TF_VERIFY(this._pickableRenderPass) ||
      !TF_VERIFY(this._occluderRenderPass)) {
      return
    }

    const states = [this._pickableRenderPassState!,
      this._occluderRenderPassState!,
      this._overlayRenderPassState!]

    // Are we using stencil conditioning?
    const needStencilConditioning = this._contextParams.depthMaskCallback !== null

    // Calculate the viewport
    const viewport = new GfVec4i(0, 0,
      this._contextParams.resolution.get(0),
      this._contextParams.resolution.get(1))

    const renderDelegate = delegate.getRenderIndex().getRenderDelegate()
    const stepSize = renderDelegate.getRenderSetting(
      HdStRenderSettingsTokens.volumeRaymarchingStepSize,
      HdStVolume_defaultStepSize) as number
    const stepSizeLighting = renderDelegate.getRenderSetting(
      HdStRenderSettingsTokens.volumeRaymarchingStepSizeLighting,
      HdStVolume_defaultStepSizeLighting) as number

    // Update the renderpass states.
    for (const state of states) {
      if (needStencilConditioning) {
        state.setStencilEnabled(true)
        state.setStencil(HdCompareFunction.HdCmpFuncLess,
          /*ref=*/0,
          /*mask=*/1,
          /*sFail*/HdStencilOp.HdStencilOpKeep,
          /*sPassZFail*/HdStencilOp.HdStencilOpKeep,
          /*sPassZPass*/HdStencilOp.HdStencilOpKeep)
      } else {
        state.setStencilEnabled(false)
      }

      // disable depth write for the main pass when resolving 'deep'
      const enableDepthWrite =
        (state === this._occluderRenderPassState) ||
        (this._contextParams.resolveMode !== HdxPickTokens.resolveDeep)

      state.setEnableDepthTest(true)
      state.setEnableDepthMask(enableDepthWrite)
      state.setDepthFunc(HdCompareFunction.HdCmpFuncLEqual)

      // Set alpha threshold, to potentially discard translucent pixels.
      // The default value of 0.0001 allow semi-transparent pixels to be
      // picked, but discards fully transparent ones.
      state.setAlphaThreshold(this._contextParams.alphaThreshold)
      state.setAlphaToCoverageEnabled(false)
      state.setBlendEnabled(false)
      state.setCullStyle(this._params.cullStyle)
      state.setLightingEnabled(false)

      state.setPointSize(this._contextParams.pointSize)
      state.setPointSelectedSize(this._contextParams.pointSelectedSize)

      // Match depth bias from visual pass so surface depth is consistent.
      state.setDepthBiasUseDefault(false)
      state.setDepthBiasEnabled(this._contextParams.depthBiasEnable)
      state.setDepthBias(this._contextParams.depthBiasConstantFactor,
        this._contextParams.depthBiasSlopeFactor)

      state.setVolumeRenderingConstants(stepSize, stepSizeLighting)

      // Enable conservative rasterization, if available.
      state.setConservativeRasterizationEnabled(true)

      // If scene materials are disabled in this environment then
      // let's setup the override shader
      if (state instanceof HdStRenderPassState) {
        state.setCameraFramingState(
          this._contextParams.viewMatrix,
          this._contextParams.projectionMatrix,
          viewport,
          this._contextParams.clipPlanes)
      }
    }

    this._pickableRenderPassState!.setAovBindings(this._pickableAovBindings)
    if (this._useOcclusionPass()) {
      this._occluderRenderPassState!.setAovBindings([this._occluderAovBinding])
    }
    if (this._UseOverlayPass()) {
      this._overlayRenderPassState!.setAovBindings(this._overlayAovBindings)
    }

    // Update the collections
    //
    // The picking operation is composed of one or more conceptual passes:
    // (i) [optional] depth-only pass for "unpickable" prims, so their
    // occlusion is honored during picking.
    //
    // (ii) [mandatory] id render for "pickable" prims: writes out the ids
    // for prims that pass the depth test.
    //
    // (iii) [optional] id render for "overlay" prims, into their own set of
    // ID AOVs. Overlay materials can then draw always-on-top, blend through
    // occluders, or be occluded normally. Execute() composites an overlay
    // hit into the pickable pass's ID buffers per pixel, letting a valid
    // overlay hit win over a pickable hit regardless of depth, while an
    // invalid overlay fragment (e.g. under a point/edge target) does not
    // clobber a valid pickable hit. The depth AOV is never merged, so pick
    // depth stays exclusive to non-overlay items (see
    // HdxPickHit::normalizedDepth). Overlay prims are also drawn in the
    // other passes and so get drawn twice, since we can only cull by
    // renderTag, not materialTag.
    if (this._useOcclusionPass()) {
      // Pass (i) from above
      const occluderCol = this._contextParams.collection.createInverseCollection()
      this._occluderRenderPass!.setRprimCollection(occluderCol)
    }

    // Pass (ii) from above
    this._pickableRenderPass!.setRprimCollection(this._contextParams.collection)

    // Pass (iii) from above
    if (this._UseOverlayPass()) {
      const overlayCol = this._contextParams.collection.Clone()
      overlayCol.setMaterialTag(HdStMaterialTagTokens.displayInOverlay)
      this._overlayRenderPass!.setRprimCollection(overlayCol)
    }

    if (this._useOcclusionPass()) {
      this._occluderRenderPass!.sync()
    }
    this._pickableRenderPass!.sync()
    if (this._UseOverlayPass()) {
      this._overlayRenderPass!.sync()
    }
  }

  /** pickTask.cpp:702-748 */
  Prepare(_ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    const hdStResourceRegistry = this._resourceRegistry()

    if (!hdStResourceRegistry) {
      return
    }

    // Check if the overlay pass is actually needed, which should only be
    // called during Prepare or Execute.
    this._updateUseOverlayPass()

    if (this._useOcclusionPass()) {
      this._occluderRenderPassState!.Prepare(renderIndex.getResourceRegistry())
    }
    this._pickableRenderPassState!.Prepare(renderIndex.getResourceRegistry())
    if (this._UseOverlayPass()) {
      this._overlayRenderPassState!.Prepare(renderIndex.getResourceRegistry())
    }

    this._clearPickBuffer()

    // Prepare pick buffer binding
    const extendedState = this._pickableRenderPassState instanceof HdStRenderPassState
      ? this._pickableRenderPassState : null

    const renderPassShader = extendedState ? extendedState.getRenderPassShader() : null

    if (renderPassShader) {
      // PLATFORM-DIVERGENCE(webkit-wgsl-atomic-compare-exchange): upstream
      // binds the pick buffer for every resolve mode (pickTask.cpp:735-747);
      // RenderDeepPicks (hdx/shaders/renderPass.glslfx:303) returns at once
      // unless the buffer was initialized for resolveDeep. Its
      // ATOMIC_COMP_SWAP translates to WGSL atomicCompareExchangeWeak, which
      // Safari's WebGPU fails to compile to Metal in any stage ("field may
      // not be qualified with an address space"), so binding it would fail
      // every pick program. The buffer is bound only for resolveDeep, which
      // stays unavailable in Safari until that is fixed.
      if (this._pickBuffer &&
        this._contextParams.resolveMode === HdxPickTokens.resolveDeep) {
        renderPassShader.addBufferBinding(
          new HdStBindingRequest(
            HdStBindingType.SSBO,
            _tokens.PickBufferBinding,
            this._pickBuffer,
            /*interleaved*/ false,
            /*writable*/ true))
      } else {
        renderPassShader.removeBufferBinding(_tokens.PickBufferBinding)
      }
    }
  }

  /** pickTask.cpp:750-813 */
  private _clearPickBuffer(): void {
    if (!this._pickBuffer) {
      return
    }

    const hdStResourceRegistry = this._resourceRegistry()

    if (!hdStResourceRegistry) {
      return
    }

    // populate pick buffer source array
    const pickBufferInit: number[] = []
    if (this._contextParams.resolveMode === HdxPickTokens.resolveDeep) {
      const numSubBuffers =
        Math.trunc(this._contextParams.maxNumDeepEntries / PICK_BUFFER_SUBBUFFER_CAPACITY)
      const entryStorageOffset = PICK_BUFFER_HEADER_SIZE + numSubBuffers
      const entryStorageSize =
        numSubBuffers * PICK_BUFFER_SUBBUFFER_CAPACITY * PICK_BUFFER_ENTRY_SIZE

      // populate pick buffer header
      pickBufferInit.push(numSubBuffers)
      pickBufferInit.push(PICK_BUFFER_SUBBUFFER_CAPACITY)
      pickBufferInit.push(PICK_BUFFER_HEADER_SIZE)
      pickBufferInit.push(entryStorageOffset)

      pickBufferInit.push(
        this._contextParams.pickTarget === HdxPickTokens.pickFaces ? 1 : 0)
      pickBufferInit.push(
        this._contextParams.pickTarget === HdxPickTokens.pickEdges ? 1 : 0)
      pickBufferInit.push(
        this._contextParams.pickTarget === HdxPickTokens.pickPoints ? 1 : 0)
      pickBufferInit.push(0)

      // populate pick buffer's sub-buffer size table with zeros
      for (let i = 0; i < numSubBuffers; i++) pickBufferInit.push(0)

      // populate pick buffer's entry storage with -9s, meaning uninitialized
      for (let i = 0; i < entryStorageSize; i++) pickBufferInit.push(-9)
    } else {
      // set pick buffer to invalid state
      pickBufferInit.push(0)
    }

    // set the source to the pick buffer
    const bufferSource = new HdVtBufferSource(
      _tokens.PickBuffer,
      VtValue.createArray(new VtArray<number>(pickBufferInit, VtValueTypes.int)))

    hdStResourceRegistry.addSource(this._pickBuffer, bufferSource)
  }

  /** pickTask.cpp:815-977 (see the header: the readback and resolve
   *  complete asynchronously). */
  Execute(_ctx: HdTaskContext): void {
    // Check if the overlay pass is actually needed, which should only be
    // called during Prepare or Execute.
    this._updateUseOverlayPass()

    const hgi = this._hgi!
    // This is important for Hgi garbage collection to run.
    hgi.startFrame()

    const dimensions = this._contextParams.resolution
    const viewport = new GfVec4i(0, 0, dimensions.get(0), dimensions.get(1))

    // Are we using stencil conditioning?
    const needStencilConditioning = this._contextParams.depthMaskCallback !== null

    if (needStencilConditioning) {
      this._conditionStencilWithGLCallback()
    }

    const depthBinding = this._pickableAovBindings[this._pickableDepthIndex]!
    if (this._useOcclusionPass()) {
      this._occluderRenderPass!.Execute(this._occluderRenderPassState!, this.getRenderTags())
      // Prevent the depth from being cleared so that occluders are retained.
      depthBinding.clearValue = VtValue.getEmpty()
    } else if (needStencilConditioning) {
      // Prevent depthStencil from being cleared so that stencil is retained.
      depthBinding.clearValue = VtValue.getEmpty()
    } else {
      // If there was no occlusion pass and we didn't condition the
      // depthStencil buffer then clear the depth.
      depthBinding.clearValue = VtValue.create(new GfVec4f(1, 1, 1, 1), VtValueTypes.GfVec4f)
    }

    // Push the changes to the clearValue into the renderPassState.
    this._pickableRenderPassState!.setAovBindings(this._pickableAovBindings)
    this._pickableRenderPass!.Execute(this._pickableRenderPassState!, this.getRenderTags())

    if (this._UseOverlayPass()) {
      const last = this._overlayAovBindings[this._overlayAovBindings.length - 1]!
      if (needStencilConditioning) {
        // Prevent overlay depthStencil from being cleared so that the
        // stencil is retained.
        last.clearValue = VtValue.getEmpty()
      } else {
        last.clearValue = VtValue.create(new GfVec4f(1, 1, 1, 1), VtValueTypes.GfVec4f)
      }
      this._overlayRenderPassState!.setAovBindings(this._overlayAovBindings)
      this._overlayRenderPass!.Execute(this._overlayRenderPassState!, this.getRenderTags())
    }

    // For 'resolveDeep' mode, read hits from the pick buffer.
    if (this._contextParams.resolveMode === HdxPickTokens.resolveDeep) {
      this._resolveDeep()
      hgi.endFrame()
      this._pendingResolve = Promise.resolve()
      return
    }

    const contextParams = this._contextParams
    const useOverlayPass = this._UseOverlayPass()
    const depthRangeState = this._pickableRenderPassState!
    this._pendingResolve = this._readBackAndResolve(contextParams, useOverlayPass,
      dimensions, viewport, depthRangeState).finally(() => {
      // This is important for Hgi garbage collection to run.
      hgi.endFrame()
    })
  }

  /** pickTask.cpp:877-977: the readback, overlay merge and resolve of
   *  Execute, run when the readback completes (see the header). */
  private async _readBackAndResolve(
    contextParams: HdxPickTaskContextParams,
    useOverlayPass: boolean,
    dimensions: GfVec2i,
    viewport: GfVec4i,
    renderPassState: HdRenderPassState,
  ): Promise<void> {
    const ints = (b: Uint8Array | null): _IntBuffer =>
      b && b.byteLength > 0 ? new Int32Array(b.buffer, b.byteOffset, b.byteLength >> 2) : null
    const floats = (b: Uint8Array | null): _FloatBuffer =>
      b && b.byteLength > 0 ? new Float32Array(b.buffer, b.byteOffset, b.byteLength >> 2) : null

    // Capture the result buffers and cast to the appropriate types.
    const [primIds, instanceIds, elementIds, edgeIds, pointIds, neyes, depths] = await Promise.all([
      this._readAovBuffer(HdAovTokens.primId).then(ints),
      this._readAovBuffer(HdAovTokens.instanceId).then(ints),
      this._readAovBuffer(HdAovTokens.elementId).then(ints),
      this._readAovBuffer(HdAovTokens.edgeId).then(ints),
      this._readAovBuffer(HdAovTokens.pointId).then(ints),
      this._readAovBuffer(HdAovTokens.Neye).then(ints),
      this._readAovBuffer(this._depthToken).then(floats),
    ])

    // Merge the overlay pass's ID buffers into the pickable pass's, per
    // pixel, wherever the overlay fragment is itself a valid hit for the
    // active pickTarget. This lets an overlay prim (e.g. a joint guide)
    // win over a pickable prim when the overlay fragment is a valid hit,
    // without letting an overlay fragment that is not a valid hit under
    // the pick target (e.g. a surface fragment under a point/edge target)
    // destroy a valid pickable hit (e.g. a mesh point). Depth is never
    // merged, so the pick depth buffer continues to exclude overlay
    // items.
    if (useOverlayPass) {
      const b = this._overlayAovBindings
      const [overlayPrimIds, overlayInstanceIds, overlayElementIds, overlayEdgeIds,
        overlayPointIds, overlayNeyes] = await Promise.all([
        this._readAovBuffer(HdAovTokens.primId, b).then(ints),
        this._readAovBuffer(HdAovTokens.instanceId, b).then(ints),
        this._readAovBuffer(HdAovTokens.elementId, b).then(ints),
        this._readAovBuffer(HdAovTokens.edgeId, b).then(ints),
        this._readAovBuffer(HdAovTokens.pointId, b).then(ints),
        this._readAovBuffer(HdAovTokens.Neye, b).then(ints),
      ])

      // HdxPickResult is constructed below with subRect == the full
      // [0, 0, dimensions] viewport (see the 'viewport' passed to it
      // further down), so the merge loop covers the same region as the
      // resolve without needing a separate clamp.
      const numPixels = dimensions.get(0) * dimensions.get(1)
      for (let i = 0; i < numPixels; ++i) {
        if (_IsValidPickHit(
          overlayPrimIds, overlayInstanceIds,
          overlayElementIds, overlayEdgeIds,
          overlayPointIds, i, contextParams.pickTarget,
          this._index!)) {
          primIds![i] = overlayPrimIds![i]!
          if (instanceIds && overlayInstanceIds) instanceIds[i] = overlayInstanceIds[i]!
          if (elementIds && overlayElementIds) elementIds[i] = overlayElementIds[i]!
          if (edgeIds && overlayEdgeIds) edgeIds[i] = overlayEdgeIds[i]!
          if (pointIds && overlayPointIds) pointIds[i] = overlayPointIds[i]!
          if (neyes && overlayNeyes) {
            neyes[i] = overlayNeyes[i]!
          }
        }
      }
    }

    // For un-projection, get the depth range at time of drawing.
    let depthRange = new GfVec2f(0, 1)
    if (this._hgi!.getCapabilities()!.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsCustomDepthRange)) {
      // Assume each of the render passes used the same depth range.
      depthRange = renderPassState.getDepthRange()
    }

    const result = new HdxPickResult(
      primIds, instanceIds, elementIds,
      edgeIds, pointIds, neyes, depths,
      this._index!, contextParams.pickTarget, contextParams.viewMatrix,
      contextParams.projectionMatrix, depthRange, dimensions, viewport)

    // Resolve!
    const outHits = contextParams.outHits
    if (contextParams.resolveMode === HdxPickTokens.resolveNearestToCenter) {
      result.resolveNearestToCenter(outHits)
    } else if (contextParams.resolveMode === HdxPickTokens.resolveNearestToCamera) {
      result.resolveNearestToCamera(outHits)
    } else if (contextParams.resolveMode === HdxPickTokens.resolveUnique) {
      result.resolveUnique(outHits)
    } else if (contextParams.resolveMode === HdxPickTokens.resolveAll) {
      result.resolveAll(outHits)
    } else {
      TF_CODING_ERROR(`Unrecognized interesection mode '${contextParams.resolveMode}'`)
    }
  }

  /** pickTask.cpp:979-1042 (see the header). */
  private _resolveDeep(): void {
    if (!this._pickBuffer) {
      return
    }

    const pickData = this._pickBuffer.ReadData(_tokens.PickBuffer)
    const held = _Held<VtArray<number>>(pickData)
    if (!held) {
      return
    }

    const data = held instanceof VtArray ? held.toArray() as number[] : held as unknown as number[]

    const numSubBuffers =
      Math.trunc(this._contextParams.maxNumDeepEntries / PICK_BUFFER_SUBBUFFER_CAPACITY)
    const entryStorageOffset = PICK_BUFFER_HEADER_SIZE + numSubBuffers

    // loop through all the sub-buffers, populating outHits
    for (let subBuffer = 0; subBuffer < numSubBuffers; ++subBuffer) {
      const sizeOffset = PICK_BUFFER_HEADER_SIZE + subBuffer
      const numEntries = data[sizeOffset] ?? 0
      const subBufferOffset =
        entryStorageOffset +
        subBuffer * PICK_BUFFER_SUBBUFFER_CAPACITY * PICK_BUFFER_ENTRY_SIZE

      // loop through sub-buffer entries
      for (let j = 0; j < numEntries; ++j) {
        const entryOffset = subBufferOffset + (j * PICK_BUFFER_ENTRY_SIZE)

        const hit = new HdxPickHit()

        const primId = data[entryOffset]!
        hit.objectId = this._index!.getRprimPathFromPrimId(primId)
        if (hit.objectId === '') {
          continue
        }

        const ids = this._index!.getSceneDelegateAndInstancerIds(hit.objectId)
        hit.delegateId = ids?.delegateId ?? ''
        hit.instancerId = ids?.instancerId ?? ''

        const partIndex = data[entryOffset + 2]!
        hit.instanceIndex = data[entryOffset + 1]!
        hit.elementIndex =
          this._contextParams.pickTarget === HdxPickTokens.pickFaces ? partIndex : -1
        hit.edgeIndex =
          this._contextParams.pickTarget === HdxPickTokens.pickEdges ? partIndex : -1
        hit.pointIndex =
          (this._contextParams.pickTarget === HdxPickTokens.pickPoints ||
            this._contextParams.pickTarget === HdxPickTokens.pickPointsAndInstances)
            ? partIndex : -1

        // the following data is skipped in deep selection
        hit.worldSpaceHitPoint = new GfVec3d(0, 0, 0)
        hit.worldSpaceHitNormal = new GfVec3f(0, 0, 0)
        hit.normalizedDepth = 0

        if (TfDebug.isEnabled(HdxDebugCodes.HDX_INTERSECT)) {
          console.log(hit.GetString())
        }

        this._contextParams.outHits?.push(hit)
      }
    }
  }

  /** pickTask.cpp:1044-1048 */
  override getRenderTags(): readonly string[] {
    return this._renderTags
  }
}

/** pickTask.h:426-552. A utility class for resolving ID buffers into hits. */
export class HdxPickResult {
  private _ndcToWorld: GfMatrix4d
  private _eyeToWorld: GfMatrix4d
  private _subRect: [number, number, number, number]

  /** pickTask.cpp:1053-1092. Pick result takes a tuple of ID buffers:
   *  (primId, instanceId, elementId, edgeId, pointId) along with some
   *  geometric buffers (depth, Neye) and resolves them into a series of
   *  hits. All buffers need to be the same size, if passed in. It's legal
   *  for only the depth and primId buffers to be provided. */
  constructor(
    private readonly _primIds: _IntBuffer,
    private readonly _instanceIds: _IntBuffer,
    private readonly _elementIds: _IntBuffer,
    private readonly _edgeIds: _IntBuffer,
    private readonly _pointIds: _IntBuffer,
    private readonly _neyes: _IntBuffer,
    private readonly _depths: _FloatBuffer,
    private readonly _index: HdRenderIndex,
    private readonly _pickTarget: string,
    viewMatrix: GfMatrix4d,
    projectionMatrix: GfMatrix4d,
    private readonly _depthRange: GfVec2f,
    private readonly _bufferSize: GfVec2i,
    subRect: GfVec4i,
  ) {
    const bs = [_bufferSize.get(0), _bufferSize.get(1)]
    const s: [number, number, number, number] = [subRect.get(0), subRect.get(1), subRect.get(2), subRect.get(3)]
    // Clamp _subRect [x,y,w,h] to render buffer [0,0,w,h]
    s[0] = Math.max(0, s[0])
    s[1] = Math.max(0, s[1])
    s[2] = Math.min(bs[0]! - s[0], s[2])
    s[3] = Math.min(bs[1]! - s[1], s[3])
    this._subRect = s

    this._eyeToWorld = viewMatrix.getInverse()
    this._ndcToWorld = viewMatrix.getMultiply(projectionMatrix).getInverse()
  }

  /** pickTask.cpp:1100-1109 */
  isValid(): boolean {
    // Make sure we have at least a primId buffer and a depth buffer.
    if (!this._depths || !this._primIds) {
      return false
    }

    return true
  }

  // pickTask.h:511-526. Since all but _primIds are optional, if the buffer
  // doesn't exist just return -1 (== no hit).
  private _getPrimId(index: number): number { return this._primIds ? this._primIds[index]! : -1 }
  private _getInstanceId(index: number): number { return this._instanceIds ? this._instanceIds[index]! : -1 }
  private _getElementId(index: number): number { return this._elementIds ? this._elementIds[index]! : -1 }
  private _getEdgeId(index: number): number { return this._edgeIds ? this._edgeIds[index]! : -1 }
  private _getPointId(index: number): number { return this._pointIds ? this._pointIds[index]! : -1 }

  /** pickTask.cpp:1111-1121 */
  private _getNormal(index: number): GfVec3f {
    let normal = new GfVec3f(0, 0, 0)
    if (this._neyes !== null) {
      const neye = HdVec4f_2_10_10_10_REV.fromInt(this._neyes[index]!).getAsVec()
      const n = this._eyeToWorld.transformDir(new GfVec3d(neye[0], neye[1], neye[2]))
      normal = new GfVec3f(n.get(0), n.get(1), n.get(2))
    }
    return normal
  }

  /** pickTask.cpp:1123-1163 */
  private _resolveHit(index: number, x: number, y: number, z: number, hit: HdxPickHit): boolean {
    const primId = this._getPrimId(index)
    hit.objectId = this._index.getRprimPathFromPrimId(primId)
    if (hit.objectId === '') {
      return false
    }

    const ids = this._index.getSceneDelegateAndInstancerIds(hit.objectId)
    hit.delegateId = ids?.delegateId ?? ''
    hit.instancerId = ids?.instancerId ?? ''

    hit.instanceIndex = this._getInstanceId(index)
    hit.elementIndex = this._getElementId(index)
    hit.edgeIndex = this._getEdgeId(index)
    hit.pointIndex = this._getPointId(index)

    const d0 = this._depthRange.get(0), d1 = this._depthRange.get(1)
    // Calculate the hit location in NDC, then transform to worldspace.
    const ndcHit = new GfVec3d(
      (x / this._bufferSize.get(0)) * 2.0 - 1.0,
      (y / this._bufferSize.get(1)) * 2.0 - 1.0,
      Math.fround((z - d0) / (d1 - d0)) * 2.0 - 1.0)
    hit.worldSpaceHitPoint = this._ndcToWorld.Transform(ndcHit) as GfVec3d
    hit.worldSpaceHitNormal = this._getNormal(index)
    hit.normalizedDepth = Math.fround((z - d0) / (d1 - d0))

    if (TfDebug.isEnabled(HdxDebugCodes.HDX_INTERSECT)) {
      console.log(hit.GetString())
    }

    return true
  }

  /** pickTask.cpp:1534-1553 (keyed by ids; see the header). */
  private _getHash(index: number): string {
    let hash = `${this._getPrimId(index)},${this._getInstanceId(index)}`
    if (this._pickTarget === HdxPickTokens.pickFaces) {
      hash += `,f${this._getElementId(index)}`
    }
    if (this._pickTarget === HdxPickTokens.pickEdges) {
      hash += `,e${this._getEdgeId(index)}`
    }
    if (this._pickTarget === HdxPickTokens.pickPoints ||
      this._pickTarget === HdxPickTokens.pickPointsAndInstances) {
      hash += `,p${this._getPointId(index)}`
    }
    return hash
  }

  /** pickTask.cpp:1609-1615 */
  private _isValidHit(index: number): boolean {
    return _IsValidPickHit(
      this._primIds, this._instanceIds, this._elementIds, this._edgeIds, this._pointIds,
      index, this._pickTarget, this._index)
  }

  /** pickTask.cpp:1617-1654 */
  resolveNearestToCamera(allHits: HdxPickHitVector | null): void {
    if (!this.isValid() || !allHits) {
      return
    }

    let xMin = 0
    let yMin = 0
    let zMin = 0
    let zMinIndex = -1

    // Find the smallest value (nearest pixel) in the z buffer that is a
    // valid prim. The last part is important since the depth buffer may be
    // populated with occluders (which aren't picked, and thus won't update
    // any of the ID buffers)
    const [sx, sy, sw, sh] = this._subRect
    for (let y = sy; y < sy + sh; ++y) {
      for (let x = sx; x < sx + sw; ++x) {
        const i = y * this._bufferSize.get(0) + x
        if (this._isValidHit(i) && (zMinIndex === -1 || this._depths![i]! < zMin)) {
          xMin = x
          yMin = y
          zMin = this._depths![i]!
          zMinIndex = i
        }
      }
    }

    if (zMinIndex === -1) {
      // We didn't find any valid hits.
      return
    }

    const hit = new HdxPickHit()
    if (this._resolveHit(zMinIndex, xMin, yMin, zMin, hit)) {
      allHits.push(hit)
    }
  }

  /** pickTask.cpp:1656-1695 */
  resolveNearestToCenter(allHits: HdxPickHitVector | null): void {
    if (!this.isValid() || !allHits) {
      return
    }

    const width = this._subRect[2]
    const height = this._subRect[3]

    let midH = Math.trunc(height / 2)
    let midW = Math.trunc(width / 2)
    if (height % 2 === 0) {
      midH--
    }
    if (width % 2 === 0) {
      midW--
    }

    // Return the first valid hit that's closest to the center of the draw
    // target by walking from the center outwards.
    for (let w = midW, h = midH; w >= 0 && h >= 0; w--, h--) {
      for (let ww = w; ww < width - w; ww++) {
        for (let hh = h; hh < height - h; hh++) {
          const x = ww + this._subRect[0]
          const y = hh + this._subRect[1]
          const i = y * this._bufferSize.get(0) + x
          if (this._isValidHit(i)) {
            const hit = new HdxPickHit()
            if (this._resolveHit(i, x, y, this._depths![i]!, hit)) {
              allHits.push(hit)
            }
            return
          }
          // Skip pixels we've already visited and jump to the boundary
          if (!(ww === w || ww === width - w - 1) && hh === h) {
            hh = Math.max(hh, height - h - 2)
          }
        }
      }
    }
  }

  /** pickTask.cpp:1697-1718 */
  resolveAll(allHits: HdxPickHitVector | null): void {
    if (!this.isValid() || !allHits) {
      return
    }

    const [sx, sy, sw, sh] = this._subRect
    for (let y = sy; y < sy + sh; ++y) {
      for (let x = sx; x < sx + sw; ++x) {
        const i = y * this._bufferSize.get(0) + x
        if (!this._isValidHit(i)) continue

        const hit = new HdxPickHit()
        if (this._resolveHit(i, x, y, this._depths![i]!, hit)) {
          allHits.push(hit)
        }
      }
    }
  }

  /** pickTask.cpp:1720-1768 */
  resolveUnique(allHits: HdxPickHitVector | null): void {
    if (!this.isValid() || !allHits) {
      return
    }

    const hitIndices = new Map<string, [number, number]>()
    {
      let previousHash = ''
      const [sx, sy, sw, sh] = this._subRect
      for (let y = sy; y < sy + sh; ++y) {
        for (let x = sx; x < sx + sw; ++x) {
          const i = y * this._bufferSize.get(0) + x
          if (!this._isValidHit(i)) continue

          const hash = this._getHash(i)
          // As an optimization, keep track of the previous hash value and
          // reject indices that match it without performing a map lookup.
          // Adjacent indices are likely enough to have the same prim,
          // instance and if relevant, the same subprim ids, that this can
          // be a significant improvement.
          if (hitIndices.size === 0 || hash !== previousHash) {
            if (!hitIndices.has(hash)) hitIndices.set(hash, [x, y])
            previousHash = hash
          }
        }
      }
    }

    for (const [x, y] of hitIndices.values()) {
      const i = y * this._bufferSize.get(0) + x

      const hit = new HdxPickHit()
      if (this._resolveHit(i, x, y, this._depths![i]!, hit)) {
        allHits.push(hit)
      }
    }
  }
}
