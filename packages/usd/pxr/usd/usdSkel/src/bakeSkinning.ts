// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/bakeSkinning.cpp,
//  pxr/usd/usdSkel/bakeSkinning.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/bakeSkinning.{h,cpp}
// (Copyright 2016 Pixar, TOST 1.0, https://openusd.org/license).
//
// UsdSkelBakeSkinning: bake the effect of skinning prims directly into
// points, normals and transforms, so that the skinned result can be consumed
// without UsdSkel. Structure follows bakeSkinning.cpp: a _Task state machine
// per computation, _SkelAdapter / _SkinningAdapter objects that read inputs
// and hold outputs, Sdf-level writers, and the time sampling / extent /
// extentsHint post-passes.
//
// typescript-usd divergences (each also noted at its site):
// - Work is serial: WorkParallelForN / WorkParallelForEach loops run in order.
// - Times are `number | undefined`, undefined being UsdTimeCode::Default().
// - SdfLayer::Save is asynchronous here, so the UsdSkelBakeSkinningParms
//   overload returns a Promise and saves once at the end; memoryLimit flushes
//   during baking are not performed.
// - TF_DEBUG(USDSKEL_BAKESKINNING) messages are not emitted.

import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  type Matrix4, IDENTITY_MATRIX, mul4, invertMatrix4,
  Matrix4d as GfMatrix4d, Matrix3d as GfMatrix3d, Interval as GfInterval,
} from 'typescript-usd/gf'
import { RaiseWarning as TfWarn, TfDiagnosticMgr, Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import {
  type Layer, type PrimSpec as SdfPrimSpec, AttributeSpec as SdfAttributeSpec, sdfCreatePrimInLayer,
  sdfChangeBlock,
} from 'typescript-usd/sdf'
import {
  type Prim, type Stage, type Attribute, AttributeQuery as UsdAttributeQuery, PrimDefaultPredicate,
} from 'typescript-usd/usd'
import { XformCache, XformQuery, Boundable, PointBased, BBoxCache, Imageable } from 'typescript-usd/usdGeom'
import { UsdSkelCache, type UsdSkelSkeletonQuery, type UsdSkelSkinningQuery } from './queries.ts'
import type { Binding } from './binding.ts'
import { Root as SkelRoot } from './root.ts'
import { UsdSkelBlendShapeQuery } from './blendShapeQuery.ts'
import {
  skinPointsWithMethod, skinNormalsWithMethod, skinFaceVaryingNormalsWithMethod,
  skinTransformWithMethod,
} from './utils.ts'

type TimeCode = number | undefined

// A flat row-major GfMatrix3d.
type Matrix3 = number[]

const _IDENTITY3: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

// bakeSkinning.cpp:52-56 (_tokens).
const _tokens = {
  xformOpTransform: 'xformOp:transform',
  Xform: 'Xform',
} as const

// ------------------------------------------------------------
// UsdSkelBakeSkinningParms (bakeSkinning.h:40-123)
// ------------------------------------------------------------

/** Parameters for {@link bakeSkinning} (UsdSkelBakeSkinningParms). */
export class BakeSkinningParms {
  // Flags for identifying different deformation paths.
  static readonly DeformPointsWithSkinning = 1 << 0
  static readonly DeformNormalsWithSkinning = 1 << 1
  static readonly DeformXformWithSkinning = 1 << 2
  static readonly DeformPointsWithBlendShapes = 1 << 3
  static readonly DeformNormalsWithBlendShapes = 1 << 4
  static readonly DeformWithSkinning = (1 << 0) | (1 << 1) | (1 << 2)
  static readonly DeformWithBlendShapes = (1 << 3) | (1 << 4)
  static readonly DeformAll = BakeSkinningParms.DeformWithSkinning |
    BakeSkinningParms.DeformWithBlendShapes
  // Flags indicating which components of skinned prims may be modified,
  // based on the active deformations.
  static readonly ModifiesPoints = (1 << 0) | (1 << 3)
  static readonly ModifiesNormals = (1 << 1) | (1 << 4)
  static readonly ModifiesXform = 1 << 2

  /** Flags determining which deformation paths are enabled. */
  deformationFlags: number = BakeSkinningParms.DeformAll
  /** Determines whether or not layers are saved during skinning. */
  saveLayers = true
  /**
   * Memory limit for pending stage writes, given in bytes. Flushing pending
   * writes requires a synchronous SdfLayer::Save, which this port does not
   * have; the limit is accepted but no intermediate flush happens.
   */
  memoryLimit = 0
  /** If true, extents of UsdGeomPointBased-derived prims are updated. */
  updateExtents = true
  /** If true, extents hints of models that already stored one are updated. */
  updateExtentHints = true
  /** The set of bindings to bake. */
  bindings: Binding[] = []
  /** Data layers being written to. */
  layers: Layer[] = []
  /** One index into `layers` per binding. */
  layerIndices: number[] = []
}

const Parms = BakeSkinningParms

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------

// The parent of a prim (UsdPrim::GetParent); undefined above the root.
function _getParent(prim: Prim): Prim | undefined {
  if (prim.path === '/') return undefined
  const slash = prim.path.lastIndexOf('/')
  return prim.getStage().getPrim(slash <= 0 ? '/' : prim.path.slice(0, slash))
}

function _isPseudoRoot(prim: Prim): boolean { return prim.path === '/' }

// UsdAttributeQuery::Get as a GfVec3f array (flat xyz float32), copied so it
// can be deformed in place.
function _getVec3fArray(query: UsdAttributeQuery, time: TimeCode): Float32Array | undefined {
  const value = query.get(time === undefined ? 'default' : time)
  if (value instanceof VtArray) {
    const data = value.cdata()
    if (data instanceof Float32Array) return data.slice(0, value.size * 3)
    return Float32Array.from((value.toArray() as unknown[]).flatMap(_vecComponents))
  }
  if (Array.isArray(value)) return Float32Array.from(value.flatMap(_vecComponents))
  return undefined
}

function _vecComponents(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number)
  const data = (v as { data?: ArrayLike<number> } | null)?.data
  return data ? Array.from(data, Number) : []
}

function _getNumberArray(query: UsdAttributeQuery, time: TimeCode): number[] | undefined {
  const value = query.get(time === undefined ? 'default' : time)
  if (value instanceof VtArray) return (value.toArray() as unknown[]).map(Number)
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return Array.from(value as ArrayLike<number>, Number)
  }
  return undefined
}

function _vec3fArray(values: Float32Array): VtArray<unknown> {
  return VtArray.fromBuffer(VtValueTypes.GfVec3f, values.slice())
}

// GfMatrix4d::ExtractRotationMatrix().GetInverse().GetTranspose().
function _invTransposeRotation(xform: Matrix4): Matrix3 {
  const rotation = new GfMatrix4d(...xform).extractRotationMatrix() as GfMatrix3d
  return [...rotation.getInverse().getTranspose().GetArray()]
}

function _query(attr: Attribute | undefined): UsdAttributeQuery {
  return attr ? new UsdAttributeQuery(attr) : new UsdAttributeQuery()
}

// ------------------------------------------------------------
// _Task (bakeSkinning.cpp:133-239)
// ------------------------------------------------------------

/// Helper for managing exec of a task over time.
/// This class only manages the state of the computation; The actual
/// computation and its results are maintained externally from this class.
class _Task {
  private _active = false
  private _required = false
  private _mightBeTimeVarying = false
  private _isFirstSample = true
  private _hasSampleAtCurrentTime = false

  clear(): void {
    this._active = false
    this._required = false
    this._mightBeTimeVarying = false
    this._isFirstSample = true
    this._hasSampleAtCurrentTime = false
  }

  // explicit operator bool
  get enabled(): boolean { return this._active && this._required }

  /// Returns true if a computation is active.
  isActive(): boolean { return this._active }

  /// Run \p fn at \p time, if necessary.
  run(time: TimeCode, fn: (time: TimeCode) => boolean): boolean {
    if (!this.enabled) return false
    // Always compute for defaults.
    // For numeric times, if the task might be time varying, the task
    // is always computed. Otherwise, it is only computed the
    // first time through.
    if (this._mightBeTimeVarying || this._isFirstSample || time === undefined) {
      this._hasSampleAtCurrentTime = fn(time)
      if (time !== undefined) this._isFirstSample = false
    }
    return this._hasSampleAtCurrentTime
  }

  hasSampleAtCurrentTime(): boolean { return this._hasSampleAtCurrentTime }
  setRequired(required: boolean): void { this._required = required }
  setActive(active: boolean, required = true): void {
    this._active = active
    this._required = required
  }
  mightBeTimeVarying(): boolean { return this._mightBeTimeVarying }
  setMightBeTimeVarying(tf: boolean): void { this._mightBeTimeVarying = tf }
}

// ------------------------------------------------------------
// _OutputHolder (bakeSkinning.cpp:248-257)
// ------------------------------------------------------------

/// Helper for holding a pending output value.
class _OutputHolder<T> {
  hasSampleAtCurrentTime = false
  constructor(public value: T) {}
  beginUpdate(): void { this.hasSampleAtCurrentTime = false }
}

// ------------------------------------------------------------
// _AttrWriter (bakeSkinning.cpp:266-366)
// ------------------------------------------------------------

// _CreateAttribute (bakeSkinning.cpp:289-316).
function _createAttribute(
  owner: SdfPrimSpec, name: string, typeName: string, variability: 'varying' | 'uniform',
): SdfAttributeSpec | undefined {
  const spec = owner.getAttributes().get(name)
  if (spec === undefined) {
    return SdfAttributeSpec.new(owner, name, typeName, variability, /*custom*/ false)
  }
  // Make sure the type matches...
  if (spec.getTypeName()?.name === typeName) return spec
  TfDiagnosticMgr.GetInstance().postError(new TfError(
    `Spec type mismatch. Failed to create attribute for <${owner.getPath().pathString}.${name}> ` +
    `in @${owner.getLayer().identifier}@. Spec with type ${spec.getTypeName()?.name} already ` +
    `at that location.`, TfDiagnosticType.RuntimeError))
  return undefined
}

/// Helper for efficiently writing attribute values through Sdf.
class _AttrWriter {
  private _spec: SdfAttributeSpec | undefined
  private _primPath = ''
  private _name = ''

  get enabled(): boolean { return this._spec !== undefined }

  // _AttrWriter::Define (bakeSkinning.cpp:319-334).
  define(prim: SdfPrimSpec, name: string, typeName: string, variability: 'varying' | 'uniform'): boolean {
    this._spec = _createAttribute(prim, name, typeName, variability)
    if (this._spec) {
      // Clear any prior animation.
      this._spec.clearInfo('timeSamples')
      this._primPath = prim.getPath().pathString
      this._name = name
      return true
    }
    return false
  }

  // _AttrWriter::Set (bakeSkinning.cpp:352-366). Returns an estimate of the
  // number of bytes written (_GetSizeEstimate, bakeSkinning.cpp:337-350).
  set(value: unknown, time: TimeCode, sizeEstimate: number): number {
    if (time !== undefined) {
      this._spec!.getLayer().setAttrTimeSample(this._primPath, this._name, time, value)
    } else {
      this._spec!.setDefaultValue(value)
    }
    return sizeEstimate
  }
}

// ------------------------------------------------------------
// World transform helpers (bakeSkinning.cpp:527-564)
// ------------------------------------------------------------

function _worldTransformMightBeTimeVarying(prim: Prim | undefined, xformCache: XformCache): boolean {
  for (let p = prim; p && !_isPseudoRoot(p); p = _getParent(p)) {
    if (xformCache.transformMightBeTimeVarying(p)) return true
    if (xformCache.getResetXformStack(p)) break
  }
  return false
}

function _extendWorldTransformTimeSamples(
  prim: Prim | undefined, interval: GfInterval, times: number[],
): void {
  for (let p = prim; p && !_isPseudoRoot(p); p = _getParent(p)) {
    if (p.isA('Xformable')) {
      // bakeSkinning.cpp:552 constructs the xformable from `prim`, not `p`;
      // kept as upstream does.
      const query = new XformQuery(prim)
      times.push(...query.getTimeSamplesInInterval(interval))
      if (query.getResetXformStack()) break
    }
  }
}

// ------------------------------------------------------------
// _SkelAdapter (bakeSkinning.cpp:395-763)
// ------------------------------------------------------------

/// Object which interfaces with USD to pull on skel animation data,
/// and cache data where appropriate.
class _SkelAdapter {
  /// Skinning transforms. Used for LBS/DQS xform and point skinning.
  private readonly _skinningXformsTask = new _Task()
  private _skinningXforms: Matrix4[] = []

  /// Inverse tranpose of skinning transforms,
  /// Used for LBS/DQS normal skinning.
  private readonly _skinningInvTransposeXformsTask = new _Task()
  private _skinningInvTransposeXforms: Matrix3[] = []

  /// Blend shape weight animation.
  private readonly _blendShapeWeightsTask = new _Task()
  private _blendShapeWeights: number[] = []

  /// Skel local to world xform. Used for LBS/DQS xform and point skinning.
  private readonly _skelLocalToWorldXformTask = new _Task()
  private _skelLocalToWorldXform: Matrix4 = [...IDENTITY_MATRIX] as Matrix4

  /// Mask indicating which indexed times this skel should be processed at.
  private _timeSampleMask: boolean[] = []

  // _SkelAdapter::_SkelAdapter (bakeSkinning.cpp:570-650).
  constructor(parms: BakeSkinningParms, private readonly _skelQuery: UsdSkelSkeletonQuery,
    xformCache: XformCache) {
    // Activate skinning transform computations if we have a mappable anim,
    // or if restTransforms are authored as a fallback.
    if (parms.deformationFlags & Parms.DeformWithSkinning) {
      const skel = _skelQuery.getPrim()
      const animQuery = _skelQuery.getAnimQuery()
      const mapper = _skelQuery.getMapper()
      if ((animQuery && mapper && !mapper.isNull()) ||
          (skel.getAttr('restTransforms')?.hasAuthoredValue() ?? false)) {
        // XXX: Activate computations, but tag them as not required;
        // skinning adapters will tag them as required if needed.
        this._skinningXformsTask.setActive(true, /*required*/ false)
        this._skinningInvTransposeXformsTask.setActive(true, /*required*/ false)

        // The animQuery object may not be valid if the skeleton has a
        // rest transform attribute.
        const varying = animQuery !== undefined && _jointTransformsMightBeTimeVarying(animQuery.getPrim())
        this._skinningXformsTask.setMightBeTimeVarying(varying)
        this._skinningInvTransposeXformsTask.setMightBeTimeVarying(varying)

        // Also active computation for skel's local to world transform.
        this._skelLocalToWorldXformTask.setActive(true, /*required*/ false)
        this._skelLocalToWorldXformTask.setMightBeTimeVarying(
          _worldTransformMightBeTimeVarying(skel, xformCache))
      }
    }

    // Activate blend shape weight computations if we have authored
    // blend shape anim.
    if (parms.deformationFlags & Parms.DeformWithBlendShapes) {
      const animQuery = _skelQuery.getAnimQuery()
      if (animQuery) {
        // Determine if blend shapes are authored at all
        // (UsdSkelAnimQuery::GetBlendShapeWeightAttributes).
        const weightAttrs = [animQuery.getPrim().getAttr('blendShapeWeights')]
        this._blendShapeWeightsTask.setActive(
          weightAttrs.some(attr => attr?.hasAuthoredValue() ?? false), /*required*/ false)
        this._blendShapeWeightsTask.setMightBeTimeVarying(
          _query(animQuery.getPrim().getAttr('blendShapeWeights')).valueMightBeTimeVarying())
      }
    }
  }

  getPrim(): Prim { return this._skelQuery.getPrim() }

  shouldProcessAtTime(timeIndex: number): boolean {
    return this._timeSampleMask[timeIndex] ?? false
  }

  // _SkelAdapter::ExtendTimeSamples (bakeSkinning.cpp:653-677).
  extendTimeSamples(interval: GfInterval, times: number[]): void {
    const animQuery = this._skelQuery.getAnimQuery()
    if (this._skinningXformsTask.enabled && animQuery) {
      // UsdSkelAnimQuery::GetJointTransformTimeSamplesInInterval
      // (animQueryImpl.cpp:173-185).
      times.push(...UsdAttributeQuery.getUnionedTimeSamplesInInterval(
        ['translations', 'rotations', 'scales'].map(name =>
          _query(animQuery.getPrim().getAttr(name))), interval))
    }
    if (this._blendShapeWeightsTask.enabled && animQuery) {
      // UsdSkelAnimQuery::GetBlendShapeWeightTimeSamplesInInterval
      // (animQueryImpl.cpp:228-236).
      times.push(...UsdAttributeQuery.getUnionedTimeSamplesInInterval(
        [_query(animQuery.getPrim().getAttr('blendShapeWeights'))], interval))
    }
    if (this._skelLocalToWorldXformTask.enabled) {
      _extendWorldTransformTimeSamples(this.getPrim(), interval, times)
    }
  }

  // _SkelAdapter::UpdateTransform (bakeSkinning.cpp:680-701).
  updateTransform(timeIndex: number, xfCache: XformCache): void {
    if (this.shouldProcessAtTime(timeIndex)) {
      this._skelLocalToWorldXformTask.run(xfCache.getTime(), () => {
        this._skelLocalToWorldXform = xfCache.getLocalToWorldTransform(this.getPrim())
        return true
      })
    }
  }

  // _SkelAdapter::_ComputeSkinningXforms (bakeSkinning.cpp:704-712).
  private _computeSkinningXforms(time: TimeCode): void {
    this._skinningXformsTask.run(time, time => {
      // UsdSkelSkeletonQuery::ComputeSkinningTransforms
      // (skeletonQuery.cpp:337-370) fails with a warning when the bind
      // transforms do not match the joints.
      if (!this._skelQuery.hasBindPose()) {
        TfWarn(`${this.getPrim().path} -- Failed fetching bind transforms. The ` +
          `'bindTransforms' attribute may be unauthored, or may not match the number of joints.`)
        return false
      }
      this._skinningXforms = this._skelQuery.computeSkinningTransforms(time)
      return true
    })
  }

  // _SkelAdapter::_ComputeSkinningInvTransposeXforms
  // (bakeSkinning.cpp:715-732).
  private _computeSkinningInvTransposeXforms(time: TimeCode): void {
    if (this._skinningXformsTask.hasSampleAtCurrentTime()) {
      this._skinningInvTransposeXformsTask.run(time, () => {
        this._skinningInvTransposeXforms = this._skinningXforms.map(_invTransposeRotation)
        return true
      })
    }
  }

  // _SkelAdapter::_ComputeBlendShapeWeights (bakeSkinning.cpp:735-744).
  private _computeBlendShapeWeights(time: TimeCode): void {
    this._blendShapeWeightsTask.run(time, time => {
      // UsdSkelAnimQuery::ComputeBlendShapeWeights (animQueryImpl.cpp:215-225).
      const animPrim = this._skelQuery.getAnimQuery()!.getPrim()
      const weights = _getNumberArray(_query(animPrim.getAttr('blendShapeWeights')), time)
      if (weights === undefined) return false
      this._blendShapeWeights = weights
      return true
    })
  }

  // _SkelAdapter::UpdateAnimation (bakeSkinning.cpp:747-763).
  updateAnimation(time: TimeCode, timeIndex: number): void {
    if (this.shouldProcessAtTime(timeIndex)) {
      this._computeSkinningXforms(time)
      this._computeSkinningInvTransposeXforms(time)
      this._computeBlendShapeWeights(time)
    }
  }

  getSkinningTransforms(): Matrix4[] | undefined {
    return this._skinningXformsTask.hasSampleAtCurrentTime() ? this._skinningXforms : undefined
  }
  getSkinningInvTransposeTransforms(): Matrix3[] | undefined {
    return this._skinningInvTransposeXformsTask.hasSampleAtCurrentTime()
      ? this._skinningInvTransposeXforms : undefined
  }
  getBlendShapeWeights(): number[] | undefined {
    return this._blendShapeWeightsTask.hasSampleAtCurrentTime() ? this._blendShapeWeights : undefined
  }
  getLocalToWorldTransform(): Matrix4 | undefined {
    return this._skelLocalToWorldXformTask.hasSampleAtCurrentTime()
      ? this._skelLocalToWorldXform : undefined
  }

  setTimeSampleMask(mask: boolean[]): void { this._timeSampleMask = mask }

  canComputeSkinningXforms(): boolean { return this._skinningXformsTask.isActive() }
  setSkinningXformsRequired(required: boolean): void { this._skinningXformsTask.setRequired(required) }
  canComputeSkinningInvTransposeXforms(): boolean {
    return this._skinningInvTransposeXformsTask.isActive()
  }
  setSkinningInvTransposeXformsRequired(required: boolean): void {
    this._skinningInvTransposeXformsTask.setRequired(required)
  }
  canComputeBlendShapeWeights(): boolean { return this._blendShapeWeightsTask.isActive() }
  setBlendShapeWeightsRequired(required: boolean): void {
    this._blendShapeWeightsTask.setRequired(required)
  }
  setLocalToWorldXformRequired(required: boolean): void {
    this._skelLocalToWorldXformTask.setRequired(required)
  }

  hasTasksToRun(): boolean {
    return this._skinningXformsTask.enabled ||
      this._skinningInvTransposeXformsTask.enabled ||
      this._blendShapeWeightsTask.enabled ||
      this._skelLocalToWorldXformTask.enabled
  }
}

// UsdSkelAnimQuery::JointTransformsMightBeTimeVarying
// (animQueryImpl.cpp:202-212).
function _jointTransformsMightBeTimeVarying(animPrim: Prim): boolean {
  return ['translations', 'rotations', 'scales'].some(name =>
    _query(animPrim.getAttr(name)).valueMightBeTimeVarying())
}

// ------------------------------------------------------------
// _SkinningAdapter (bakeSkinning.cpp:786-1790)
// ------------------------------------------------------------

/// Flags indicating which deformation paths are active
/// (_SkinningAdapter::ComputationFlags, bakeSkinning.cpp:789-811).
const RequiresSkinningXforms = Parms.DeformWithSkinning
const RequiresSkinningInvTransposeXforms = Parms.DeformNormalsWithSkinning
const RequiresBlendShapeWeights = Parms.DeformWithBlendShapes
const RequiresSkinningMethod = Parms.DeformWithSkinning
const RequiresGeomBindXform = Parms.DeformWithSkinning
const RequiresGeomBindInvTransposeXform = Parms.DeformNormalsWithSkinning
const RequiresJointInfluences = Parms.DeformWithSkinning
const RequiresSkelLocalToWorldXform = Parms.DeformWithSkinning
const RequiresPrimLocalToWorldXform = Parms.DeformPointsWithSkinning | Parms.DeformNormalsWithSkinning
const RequiresPrimParentToWorldXform = Parms.DeformXformWithSkinning

/// Object used to store the output of skinning.
/// This object is bound to a single skinnable primitive, and manages
/// both intermediate computations, as well as authoring of final values.
class _SkinningAdapter {
  private _flags = 0

  // Blend shape bindings.
  private _blendShapeQuery: UsdSkelBlendShapeQuery | undefined
  private _blendShapePointIndices: number[][] = []
  private _subShapePointOffsets: number[][][] = []
  private _subShapeNormalOffsets: number[][][] = []

  // Rest points.
  private readonly _restPointsTask = new _Task()
  private _restPoints: Float32Array = new Float32Array(0)
  private _restPointsQuery = new UsdAttributeQuery()

  // Rest normals.
  private readonly _restNormalsTask = new _Task()
  private _restNormals: Float32Array = new Float32Array(0)
  private _restNormalsQuery = new UsdAttributeQuery()

  // Topology for face-varying normals.
  private readonly _faceVertexIndicesTask = new _Task()
  private _faceVertexIndices: number[] = []
  private _faceVertexIndicesQuery = new UsdAttributeQuery()

  // Skinning method.
  private readonly _skinningMethodTask = new _Task()
  private _skinningMethod = 'classicLinear'
  private _skinningMethodQuery = new UsdAttributeQuery()

  // Geom bind transform.
  private readonly _geomBindXformTask = new _Task()
  private _geomBindXform: Matrix4 = [...IDENTITY_MATRIX] as Matrix4
  private _geomBindXformQuery = new UsdAttributeQuery()

  // Inverse transpose of the geom bind xform.
  private readonly _geomBindInvTransposeXformTask = new _Task()
  private _geomBindInvTransposeXform: Matrix3 = [..._IDENTITY3]

  // Joint influences.
  private readonly _jointInfluencesTask = new _Task()
  private _jointIndices: number[] = []
  private _jointWeights: number[] = []

  // Local to world gprim xform.
  // Used for LBS/DQS point/normal skinning only.
  private readonly _localToWorldXformTask = new _Task()
  private _localToWorldXform: Matrix4 = [...IDENTITY_MATRIX] as Matrix4

  // Parent to world gprim xform.
  // Used for LBS/DQS xform skinning.
  private readonly _parentToWorldXformTask = new _Task()
  private _parentToWorldXform: Matrix4 = [...IDENTITY_MATRIX] as Matrix4

  // Computed outputs and associated writers.
  private readonly _points = new _OutputHolder<Float32Array>(new Float32Array(0))
  private readonly _pointsWriter = new _AttrWriter()
  private readonly _normals = new _OutputHolder<Float32Array>(new Float32Array(0))
  private readonly _normalsWriter = new _AttrWriter()
  private readonly _extent = new _OutputHolder<Float32Array>(new Float32Array(0))
  private readonly _extentWriter = new _AttrWriter()
  private readonly _xform = new _OutputHolder<Matrix4>([...IDENTITY_MATRIX] as Matrix4)
  private readonly _xformWriter = new _AttrWriter()

  // _SkinningAdapter::_SkinningAdapter (bakeSkinning.cpp:963-1280).
  constructor(
    parms: BakeSkinningParms,
    private readonly _skinningQuery: UsdSkelSkinningQuery,
    private readonly _skelAdapter: _SkelAdapter,
    layer: Layer,
    private readonly _layerIndex: number,
    xformCache: XformCache,
  ) {
    const prim = _skinningQuery.getPrim()
    const isPointBased = prim.isA('PointBased')
    const isXformable = isPointBased || prim.isA('Xformable')

    // Get normal/point queries, but only if authored.
    if (isPointBased) {
      if (parms.deformationFlags & Parms.ModifiesPoints) {
        this._restPointsQuery = _query(prim.getAttr('points'))
        if (!this._restPointsQuery.hasAuthoredValue()) {
          this._restPointsQuery = new UsdAttributeQuery()
        }
      }
      if (parms.deformationFlags & Parms.ModifiesNormals) {
        this._restNormalsQuery = _query(prim.getAttr('normals'))
        const normalsInterp = PointBased.getNormalsInterpolation(prim)

        // Face-varying normals are supported for mesh prims and require
        // the faceVertexIndices attribute.
        // Otherwise, can only process vertex/varying normals.
        if (normalsInterp === 'faceVarying' && prim.isA('Mesh')) {
          this._faceVertexIndicesQuery = _query(prim.getAttr('faceVertexIndices'))
          if (!this._restNormalsQuery.hasAuthoredValue() ||
              !this._faceVertexIndicesQuery.hasAuthoredValue()) {
            this._faceVertexIndicesQuery = new UsdAttributeQuery()
            this._restNormalsQuery = new UsdAttributeQuery()
          }
        } else if (!this._restNormalsQuery.hasAuthoredValue() ||
                   (normalsInterp !== 'vertex' && normalsInterp !== 'varying')) {
          this._restNormalsQuery = new UsdAttributeQuery()
        }
      }
    }

    // LBS/DQS Skinning.
    if ((parms.deformationFlags & Parms.DeformWithSkinning) && _skinningQuery.hasJointInfluences()) {
      if (_skinningQuery.isRigidlyDeformed() && isXformable) {
        if ((parms.deformationFlags & Parms.DeformXformWithSkinning) &&
            _skelAdapter.canComputeSkinningXforms()) {
          this._flags |= Parms.DeformXformWithSkinning
        }
      } else if (isPointBased) {
        if ((parms.deformationFlags & Parms.DeformPointsWithSkinning) &&
            this._restPointsQuery.isValid() && _skelAdapter.canComputeSkinningXforms()) {
          this._flags |= Parms.DeformPointsWithSkinning
        }
        if ((parms.deformationFlags & Parms.DeformNormalsWithSkinning) &&
            this._restNormalsQuery.isValid() && _skelAdapter.canComputeSkinningInvTransposeXforms()) {
          this._flags |= Parms.DeformNormalsWithSkinning
        }
      }
    }

    // Blend shapes.
    if ((parms.deformationFlags & Parms.DeformWithBlendShapes) &&
        _skelAdapter.canComputeBlendShapeWeights() &&
        isPointBased && _skinningQuery.hasBlendShapes() &&
        (this._restPointsQuery.isValid() || this._restNormalsQuery.isValid())) {
      // Create a blend shape query to help process blend shapes.
      this._blendShapeQuery = new UsdSkelBlendShapeQuery({ prim, stage: prim.getStage() })
      if (this._blendShapeQuery.isValid()) {
        if ((parms.deformationFlags & Parms.DeformPointsWithBlendShapes) &&
            this._restPointsQuery.isValid()) {
          this._subShapePointOffsets = this._blendShapeQuery.computeSubShapePointOffsets()
          const hasPointOffsets = this._subShapePointOffsets.some(points => points.length > 0)
          if (hasPointOffsets) this._flags |= Parms.DeformPointsWithBlendShapes
        }
        // Only vertex/varying normals are supported for blendshapes.
        // Supporting faceVarying normals would require extending the
        // schema.
        if ((parms.deformationFlags & Parms.DeformNormalsWithBlendShapes) &&
            this._restNormalsQuery.isValid() && !this._faceVertexIndicesQuery.isValid()) {
          this._subShapeNormalOffsets = this._blendShapeQuery.computeSubShapeNormalOffsets()
          const hasNormalOffsets = this._subShapeNormalOffsets.some(normals => normals.length > 0)
          if (hasNormalOffsets) this._flags |= Parms.DeformNormalsWithBlendShapes
        }
        if (this._flags & Parms.DeformWithBlendShapes) {
          this._blendShapePointIndices = this._blendShapeQuery.computeBlendShapePointIndices()
        }
      }
      if (!(this._flags & Parms.DeformWithBlendShapes)) this._blendShapeQuery = undefined
    }

    if (!this._flags) return

    // Create output specs. Disable any procedures that can't run
    // if spec creation fails.
    const primSpec = sdfCreatePrimInLayer(layer, prim.path)
    if (!primSpec) {
      this._flags = 0
      return
    }
    if (this._flags & Parms.ModifiesPoints) {
      if (this._pointsWriter.define(primSpec, 'points', 'point3f[]', 'varying')) {
        if (parms.updateExtents && prim.isA('Mesh')) {
          // As an optimization, we directly modify extent
          // of UsdGeomMesh prims. All other skinned prims
          // are updated at the end of skinning, using
          // extents plugings.
          this._extentWriter.define(primSpec, 'extent', 'float3[]', 'varying')
        }
      } else {
        this._flags &= ~Parms.ModifiesPoints
      }
    }
    if (this._flags & Parms.ModifiesNormals) {
      if (!this._normalsWriter.define(primSpec, 'normals', 'normal3f[]', 'varying')) {
        this._flags &= ~Parms.ModifiesNormals
      }
    }
    if (this._flags & Parms.ModifiesXform) {
      const xformOpOrderWriter = new _AttrWriter()
      if (this._xformWriter.define(primSpec, _tokens.xformOpTransform, 'matrix4d', 'varying') &&
          xformOpOrderWriter.define(primSpec, 'xformOpOrder', 'token[]', 'uniform')) {
        xformOpOrderWriter.set(
          new VtArray([_tokens.xformOpTransform], VtValueTypes.token), undefined, 0)
      } else {
        this._flags &= ~Parms.ModifiesXform
      }
    }

    // Activate computations.

    if (this._flags & Parms.ModifiesPoints) {
      // Will need rest points.
      this._restPointsTask.setActive(true)
      this._restPointsTask.setMightBeTimeVarying(this._restPointsQuery.valueMightBeTimeVarying())
    }

    if (this._flags & Parms.ModifiesNormals) {
      // Will need rest normals.
      this._restNormalsTask.setActive(true)
      this._restNormalsTask.setMightBeTimeVarying(this._restNormalsQuery.valueMightBeTimeVarying())

      if (this._faceVertexIndicesQuery.isValid()) {
        this._faceVertexIndicesTask.setActive(true)
        this._faceVertexIndicesTask.setMightBeTimeVarying(
          this._faceVertexIndicesQuery.valueMightBeTimeVarying())
      }
    }

    if (this._flags & RequiresSkinningMethod) {
      this._skinningMethodTask.setActive(true)
      this._skinningMethodQuery = _query(_skinningQuery.getSkinningMethodAttr())
      if (this._skinningMethodQuery.isValid()) {
        this._skinningMethodTask.setMightBeTimeVarying(
          this._skinningMethodQuery.valueMightBeTimeVarying())
      }
    }

    if (this._flags & RequiresGeomBindXform) {
      this._geomBindXformTask.setActive(true)
      this._geomBindXformQuery = _query(_skinningQuery.getGeomBindTransformAttr())
      if (this._geomBindXformQuery.isValid()) {
        this._geomBindXformTask.setMightBeTimeVarying(
          this._geomBindXformQuery.valueMightBeTimeVarying())
      }

      if (this._flags & RequiresGeomBindInvTransposeXform) {
        this._geomBindInvTransposeXformTask.setActive(true)
        this._geomBindInvTransposeXformTask.setMightBeTimeVarying(
          this._geomBindXformTask.mightBeTimeVarying())
      }
    }

    if (this._flags & RequiresJointInfluences) {
      this._jointInfluencesTask.setActive(true)
      this._jointInfluencesTask.setMightBeTimeVarying(
        _query(_primvarAttr(_skinningQuery, 'indices')).valueMightBeTimeVarying() ||
        _query(_primvarAttr(_skinningQuery, 'weights')).valueMightBeTimeVarying())
    }

    if (this._flags & RequiresPrimLocalToWorldXform) {
      this._localToWorldXformTask.setActive(true)
      this._localToWorldXformTask.setMightBeTimeVarying(
        _worldTransformMightBeTimeVarying(prim, xformCache))
    }

    if (this._flags & RequiresPrimParentToWorldXform) {
      if (!xformCache.getResetXformStack(prim)) {
        this._parentToWorldXformTask.setActive(true)
        this._parentToWorldXformTask.setMightBeTimeVarying(
          _worldTransformMightBeTimeVarying(_getParent(prim), xformCache))
      } else {
        // Parent xform will always be identity.
        // Initialize the parent xform, but keep the computation inactive.
        this._parentToWorldXform = [...IDENTITY_MATRIX] as Matrix4
      }
    }

    // Mark dependent computations on the skel as required where needed.
    if (this._flags & RequiresBlendShapeWeights) _skelAdapter.setBlendShapeWeightsRequired(true)
    if (this._flags & RequiresSkinningXforms) _skelAdapter.setSkinningXformsRequired(true)
    if (this._flags & RequiresSkinningInvTransposeXforms) {
      _skelAdapter.setSkinningInvTransposeXformsRequired(true)
    }
    if (this._flags & RequiresSkelLocalToWorldXform) _skelAdapter.setLocalToWorldXformRequired(true)
  }

  /// Returns the skel adapter that manages skel animation associated with
  /// this adapter.
  getSkelAdapter(): _SkelAdapter { return this._skelAdapter }
  getPrim(): Prim { return this._skinningQuery.getPrim() }
  getLayerIndex(): number { return this._layerIndex }

  shouldProcessAtTime(timeIndex: number): boolean {
    return this._flags !== 0 && this._skelAdapter.shouldProcessAtTime(timeIndex)
  }

  hasTasksToRun(): boolean { return this._flags !== 0 }

  /// Returns true if the extent of the skinned prim must be updated
  /// separately, after skinning is completed.
  requiresPostExtentUpdate(): boolean {
    return (this._flags & Parms.ModifiesPoints) !== 0 && !this._extentWriter.enabled
  }

  // _SkinningAdapter::ExtendTimeSamples (bakeSkinning.cpp:1283-1329).
  extendTimeSamples(interval: GfInterval, times: number[]): void {
    if (this._restPointsTask.enabled) {
      times.push(...this._restPointsQuery.getTimeSamplesInInterval(interval))
    }
    if (this._restNormalsTask.enabled) {
      times.push(...this._restNormalsQuery.getTimeSamplesInInterval(interval))
    }
    if (this._faceVertexIndicesTask.enabled) {
      times.push(...this._faceVertexIndicesQuery.getTimeSamplesInInterval(interval))
    }
    if (this._geomBindXformTask.enabled && this._geomBindXformQuery.isValid()) {
      times.push(...this._geomBindXformQuery.getTimeSamplesInInterval(interval))
    }
    if (this._jointInfluencesTask.enabled) {
      for (const which of ['indices', 'weights'] as const) {
        times.push(...UsdAttributeQuery.getUnionedTimeSamplesInInterval(
          [_query(_primvarAttr(this._skinningQuery, which))], interval))
      }
    }
    if (this._localToWorldXformTask.enabled) {
      _extendWorldTransformTimeSamples(this.getPrim(), interval, times)
    }
    if (this._parentToWorldXformTask.enabled) {
      _extendWorldTransformTimeSamples(_getParent(this.getPrim()), interval, times)
    }
  }

  // _SkinningAdapter::Write (bakeSkinning.cpp:1332-1359).
  write(time: TimeCode, timeIndex: number): number {
    if (!this.shouldProcessAtTime(timeIndex)) return 0

    let bytesStored = 0
    if (this._points.hasSampleAtCurrentTime) {
      bytesStored += this._pointsWriter.set(
        _vec3fArray(this._points.value), time, this._points.value.byteLength)
    }
    if (this._normals.hasSampleAtCurrentTime) {
      bytesStored += this._normalsWriter.set(
        _vec3fArray(this._normals.value), time, this._normals.value.byteLength)
    }
    if (this._extent.hasSampleAtCurrentTime) {
      bytesStored += this._extentWriter.set(
        _vec3fArray(this._extent.value), time, this._extent.value.byteLength)
    }
    if (this._xform.hasSampleAtCurrentTime) {
      bytesStored += this._xformWriter.set(new GfMatrix4d(...this._xform.value), time, 128)
    }
    return bytesStored
  }

  // _SkinningAdapter::UpdateTransform (bakeSkinning.cpp:1362-1394).
  updateTransform(timeIndex: number, xfCache: XformCache): void {
    if (this.shouldProcessAtTime(timeIndex)) {
      this._localToWorldXformTask.run(xfCache.getTime(), () => {
        this._localToWorldXform = xfCache.getLocalToWorldTransform(this.getPrim())
        return true
      })
      this._parentToWorldXformTask.run(xfCache.getTime(), () => {
        this._parentToWorldXform = xfCache.getParentToWorldTransform(this.getPrim())
        return true
      })
    }
  }

  // _SkinningAdapter::_ComputeRestPoints (bakeSkinning.cpp:1397-1405).
  private _computeRestPoints(time: TimeCode): boolean {
    return this._restPointsTask.run(time, time => {
      const points = _getVec3fArray(this._restPointsQuery, time)
      if (points === undefined) return false
      this._restPoints = points
      return true
    })
  }

  // _SkinningAdapter::_ComputeRestNormals (bakeSkinning.cpp:1408-1416).
  private _computeRestNormals(time: TimeCode): boolean {
    return this._restNormalsTask.run(time, time => {
      const normals = _getVec3fArray(this._restNormalsQuery, time)
      if (normals === undefined) return false
      this._restNormals = normals
      return true
    })
  }

  // _SkinningAdapter::_ComputeFaceVertexIndices (bakeSkinning.cpp:1419-1427).
  private _computeFaceVertexIndices(time: TimeCode): boolean {
    return this._faceVertexIndicesTask.run(time, time => {
      const indices = _getNumberArray(this._faceVertexIndicesQuery, time)
      if (indices === undefined) return false
      this._faceVertexIndices = indices
      return true
    })
  }

  // _SkinningAdapter::_ComputeSkinningMethod (bakeSkinning.cpp:1429-1439).
  private _computeSkinningMethod(time: TimeCode): boolean {
    this._skinningMethodTask.run(time, () => {
      this._skinningMethod = this._skinningQuery.getSkinningMethod()
      return true
    })
    return true
  }

  // _SkinningAdapter::_ComputeGeomBindXform (bakeSkinning.cpp:1442-1463).
  private _computeGeomBindXform(time: TimeCode): boolean {
    this._geomBindXformTask.run(time, time => {
      this._geomBindXform = this._skinningQuery.getGeomBindTransform(time)
      return true
    })
    if (this._geomBindXformTask.hasSampleAtCurrentTime()) {
      this._geomBindInvTransposeXformTask.run(time, () => {
        this._geomBindInvTransposeXform = _invTransposeRotation(this._geomBindXform)
        return true
      })
    }
    return true
  }

  // _SkinningAdapter::_ComputeJointInfluences (bakeSkinning.cpp:1466-1475).
  private _computeJointInfluences(time: TimeCode): boolean {
    return this._jointInfluencesTask.run(time, time => {
      const influences = this._skinningQuery.computeJointInfluences(time)
      if (!influences) return false
      ;[this._jointIndices, this._jointWeights] = influences
      return true
    })
  }

  // _SkinningAdapter::_DeformWithBlendShapes (bakeSkinning.cpp:1478-1525).
  private _deformWithBlendShapes(): void {
    const weights = this._skelAdapter.getBlendShapeWeights()
    if (this._blendShapeQuery && weights !== undefined) {
      // Remap the wegiht anim into the order for this prim.
      const mapper = this._skinningQuery.getBlendShapeMapper()
      if (!mapper) return
      const weightsForPrim = mapper.remap<number>(weights, null, 1, 0)

      // Resolve sub shapes (I.e., in-betweens)
      const subShapes = this._blendShapeQuery.computeSubShapeWeights(weightsForPrim)
      if (subShapes) {
        const { subShapeWeights, blendShapeIndices, subShapeIndices } = subShapes
        if (this._flags & Parms.DeformPointsWithBlendShapes) {
          // Initialize points to rest if not yet initialized.
          if (!this._points.hasSampleAtCurrentTime) this._points.value = this._restPoints.slice()
          this._points.hasSampleAtCurrentTime = this._blendShapeQuery.computeDeformedPoints(
            subShapeWeights, blendShapeIndices, subShapeIndices,
            this._blendShapePointIndices, this._subShapePointOffsets, this._points.value)
        }
        if (this._flags & Parms.DeformNormalsWithBlendShapes) {
          // Initialize normals to rest if not yet initialized.
          if (!this._normals.hasSampleAtCurrentTime) this._normals.value = this._restNormals.slice()
          this._normals.hasSampleAtCurrentTime = this._blendShapeQuery.computeDeformedNormals(
            subShapeWeights, blendShapeIndices, subShapeIndices,
            this._blendShapePointIndices, this._subShapeNormalOffsets, this._normals.value)
        }
      }
    }
  }

  // _SkinningAdapter::_DeformWithSkinning (bakeSkinning.cpp:1528-1572).
  private _deformWithSkinning(time: TimeCode): void {
    if (!this._computeSkinningMethod(time) || !this._computeGeomBindXform(time) ||
        !this._computeJointInfluences(time)) {
      return
    }

    const skelLocalToWorldXform = this._skelAdapter.getLocalToWorldTransform()
    if (skelLocalToWorldXform === undefined) return

    if (this._flags & (Parms.DeformPointsWithSkinning | Parms.DeformNormalsWithSkinning)) {
      // Skinning deforms points/normals in *skel* space.
      // A world-space point is then computed as:
      //
      //    worldSkinnedPoint = skelSkinnedPoint * skelLocalToWorld
      //
      // Since we're baking points/noramls into a gprim, we must
      // transform these from skel space into gprim space, such that:
      //
      //    localSkinnedPoint * gprimLocalToWorld = worldSkinnedPoint
      //
      // So the points/normals we store must be transformed as:
      //
      //    localSkinnedPoint = skelSkinnedPoint *
      //       skelLocalToWorld * inv(gprimLocalToWorld)
      const skelToGprimXform = mul4(skelLocalToWorldXform, invertMatrix4(this._localToWorldXform))

      if (this._flags & Parms.DeformPointsWithSkinning) {
        this._deformPointsWithSkinning(skelToGprimXform)
      }
      if (this._flags & Parms.DeformNormalsWithSkinning) {
        this._deformNormalsWithSkinning(skelToGprimXform)
      }
    } else if (this._flags & Parms.DeformXformWithSkinning) {
      this._deformXformWithSkinning(skelLocalToWorldXform)
    }
  }

  // Handle local skel:joints ordering (bakeSkinning.cpp:1590-1600).
  private _remapTransforms(xforms: Matrix4[]): Matrix4[] {
    const mapper = this._skinningQuery.getJointMapper()
    // No mapper; use the same joint order as given on the skel.
    if (!mapper) return xforms
    return mapper.remap<Matrix4>(xforms, null, 1, [...IDENTITY_MATRIX] as Matrix4)
  }

  // _SkinningAdapter::_DeformPointsWithSkinning (bakeSkinning.cpp:1575-1626).
  private _deformPointsWithSkinning(skelToGprimXf: Matrix4): void {
    if (!this._restPointsTask.hasSampleAtCurrentTime() ||
        !this._jointInfluencesTask.hasSampleAtCurrentTime()) {
      return
    }
    const xforms = this._skelAdapter.getSkinningTransforms()
    if (xforms === undefined) return

    // Handle local skel:joints ordering.
    const xformsForPrim = this._remapTransforms(xforms)

    // Initialize points from rest points.
    // Keep the current points if already initialized
    // (eg., by blendshape application)
    if (!this._points.hasSampleAtCurrentTime) this._points.value = this._restPoints.slice()

    this._points.hasSampleAtCurrentTime = skinPointsWithMethod(
      this._skinningMethod, this._geomBindXform, xformsForPrim,
      this._jointIndices, this._jointWeights,
      this._skinningQuery.getNumInfluencesPerComponent(), this._points.value)
    if (!this._points.hasSampleAtCurrentTime) return

    // Output of skinning is in *skel* space.
    // Transform the result into gprim space (GfMatrix4d::Transform of each
    // GfVec3f, rounded back to GfVec3f).
    const pts = this._points.value
    const m = skelToGprimXf
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i]!, y = pts[i + 1]!, z = pts[i + 2]!
      const w = x * m[3] + y * m[7] + z * m[11] + m[15]
      const inv = w !== 0 ? 1 / w : 1
      pts[i] = (x * m[0] + y * m[4] + z * m[8] + m[12]) * inv
      pts[i + 1] = (x * m[1] + y * m[5] + z * m[9] + m[13]) * inv
      pts[i + 2] = (x * m[2] + y * m[6] + z * m[10] + m[14]) * inv
    }
  }

  // _SkinningAdapter::_DeformNormalsWithSkinning (bakeSkinning.cpp:1629-1693).
  private _deformNormalsWithSkinning(skelToGprimXf: Matrix4): void {
    if (!this._restNormalsTask.hasSampleAtCurrentTime() ||
        !this._jointInfluencesTask.hasSampleAtCurrentTime()) {
      return
    }
    const xforms = this._skelAdapter.getSkinningInvTransposeTransforms()
    if (xforms === undefined) return

    // Handle local skel:joints ordering.
    const mapper = this._skinningQuery.getJointMapper()
    const xformsForPrim = mapper ? mapper.remap<Matrix3>(xforms, null, 1, [..._IDENTITY3]) : xforms

    // Initialize normals from rest normals.
    // Keep the current normals if already initialized
    // (eg., by blendshape application)
    if (!this._normals.hasSampleAtCurrentTime) this._normals.value = this._restNormals.slice()

    if (this._faceVertexIndicesTask.enabled) {
      this._normals.hasSampleAtCurrentTime = skinFaceVaryingNormalsWithMethod(
        this._skinningMethod, this._geomBindInvTransposeXform, xformsForPrim,
        this._jointIndices, this._jointWeights,
        this._skinningQuery.getNumInfluencesPerComponent(),
        this._faceVertexIndices, this._normals.value)
    } else {
      this._normals.hasSampleAtCurrentTime = skinNormalsWithMethod(
        this._skinningMethod, this._geomBindInvTransposeXform, xformsForPrim,
        this._jointIndices, this._jointWeights,
        this._skinningQuery.getNumInfluencesPerComponent(), this._normals.value)
    }
    if (!this._normals.hasSampleAtCurrentTime) return

    // Output of skinning is in *skel* space.
    // Transform the result into gprim space.
    const m = _invTransposeRotation(skelToGprimXf)
    const n = this._normals.value
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i]!, y = n[i + 1]!, z = n[i + 2]!
      n[i] = x * m[0]! + y * m[3]! + z * m[6]!
      n[i + 1] = x * m[1]! + y * m[4]! + z * m[7]!
      n[i + 2] = x * m[2]! + y * m[5]! + z * m[8]!
    }
  }

  // _SkinningAdapter::_DeformXformWithSkinning (bakeSkinning.cpp:1696-1748).
  private _deformXformWithSkinning(skelLocalToWorldXform: Matrix4): void {
    if (!this._jointInfluencesTask.hasSampleAtCurrentTime() ||
        !this._geomBindXformTask.hasSampleAtCurrentTime()) {
      return
    }
    const xforms = this._skelAdapter.getSkinningTransforms()
    if (xforms === undefined) return

    // Handle local skel:joints ordering.
    const xformsForPrim = this._remapTransforms(xforms)

    const xform = skinTransformWithMethod(this._skinningMethod, this._geomBindXform, xformsForPrim,
      this._jointIndices, this._jointWeights)
    this._xform.hasSampleAtCurrentTime = xform !== undefined
    if (xform === undefined) return

    // Skinning a transform produces a new transform in *skel* space.
    // A world-space transform is then computed as:
    //
    //    worldSkinnedXform = skelSkinnedXform * skelLocalToWorld
    //
    // Since we're baking transforms into a prim, we must transform
    // from skel space into the space of that prim's parent, such that:
    //
    //    newLocalXform * parentToWorld = worldSkinnedXform
    //
    // So the skinned, local transform becomes:
    //
    //    newLocalXform = skelSkinnedXform *
    //        skelLocalToWorld * inv(parentToWorld)
    this._xform.value = mul4(mul4(xform, skelLocalToWorldXform), invertMatrix4(this._parentToWorldXform))
  }

  // _SkinningAdapter::Update (bakeSkinning.cpp:1751-1790).
  update(time: TimeCode, timeIndex: number): void {
    if (!this.shouldProcessAtTime(timeIndex)) return

    this._points.beginUpdate()
    this._normals.beginUpdate()
    this._extent.beginUpdate()
    this._xform.beginUpdate()

    // Compute inputs.
    this._computeRestPoints(time)
    this._computeRestNormals(time)
    this._computeFaceVertexIndices(time)

    // Blend shapes precede LBS/DQS skinning.
    if (this._flags & Parms.DeformWithBlendShapes) this._deformWithBlendShapes()

    if (this._flags & Parms.DeformWithSkinning) this._deformWithSkinning(time)

    // If a valid points sample was computed, also compute a new extent
    // (UsdGeomPointBased::ComputeExtent).
    if (this._points.hasSampleAtCurrentTime && this._extentWriter.enabled) {
      const extent = this._points.value.length > 0 ? PointBased.computeExtent(this._points.value) : null
      this._extent.hasSampleAtCurrentTime = extent !== null
      if (extent) this._extent.value = Float32Array.from([...extent[0], ...extent[1]])
    }
  }
}

// The attribute of UsdSkelSkinningQuery::GetJointIndicesPrimvar /
// GetJointWeightsPrimvar (skinningQuery.h:96-104), through which upstream's
// UsdGeomPrimvar queries forward.
function _primvarAttr(query: UsdSkelSkinningQuery, which: 'indices' | 'weights'): Attribute | undefined {
  const primvar = which === 'indices' ? query.getJointIndicesPrimvar() : query.getJointWeightsPrimvar()
  if (!primvar) return undefined
  return query.getPrim().getStage().getPrim(primvar.primPath)?.getAttr(primvar.attrName)
}

// ------------------------------------------------------------
// Time sampling (bakeSkinning.cpp:1793-2069)
// ------------------------------------------------------------

// _UnionTimes (bakeSkinning.cpp:1793-1805): std::set_union of two sorted
// arrays.
function _unionTimes(additionalTimes: readonly number[], times: number[]): number[] {
  const out: number[] = []
  let i = 0, j = 0
  while (i < times.length || j < additionalTimes.length) {
    if (j >= additionalTimes.length || (i < times.length && times[i]! < additionalTimes[j]!)) {
      out.push(times[i++]!)
    } else if (i >= times.length || additionalTimes[j]! < times[i]!) {
      out.push(additionalTimes[j++]!)
    } else {
      out.push(times[i++]!)
      j++
    }
  }
  return out
}

/// Create skel and skinning adapters from UsdSkelBinding objects to help
/// wrangle I/O (_CreateAdapters, bakeSkinning.cpp:1810-1874).
function _createAdapters(
  parms: BakeSkinningParms, skelCache: UsdSkelCache,
  skelAdapters: _SkelAdapter[], skinningAdapters: _SkinningAdapter[], xfCache: XformCache,
): boolean {
  if (parms.bindings.length !== parms.layerIndices.length) {
    TfDiagnosticMgr.GetInstance().postError(new TfError(
      `size of parms.bindings [${parms.bindings.length}] != size of parms.bindingLayerIndices ` +
      `[${parms.layerIndices.length}]`, TfDiagnosticType.CodingError))
    return false
  }

  for (let i = 0; i < parms.bindings.length; ++i) {
    const layerIndex = parms.layerIndices[i]!
    if (layerIndex >= parms.layers.length) {
      TfWarn(`Layer index ${layerIndex} for the ${i}'th binding >= number of layers ` +
        `[${parms.layers.length}]`)
      continue
    }
    const layer = parms.layers[layerIndex]
    if (!layer) continue

    const binding = parms.bindings[i]!
    const skinningTargets = binding.getSkinningTargets()
    if (skinningTargets.length > 0) {
      const skelQuery = skelCache.getSkelQuery(binding.getSkeleton())
      if (skelQuery) {
        const skelAdapter = new _SkelAdapter(parms, skelQuery, xfCache)
        for (const skinningQuery of skinningTargets) {
          const skinningAdapter = new _SkinningAdapter(
            parms, skinningQuery, skelAdapter, layer, layerIndex, xfCache)
          // Only add this adapter if it will be used.
          if (skinningAdapter.hasTasksToRun()) skinningAdapters.push(skinningAdapter)
        }
        if (skelAdapter.hasTasksToRun()) skelAdapters.push(skelAdapter)
      }
    }
  }
  return true
}

/// Compute an array of time samples over \p interval.
/// The samples are added based on the expected sampling rate for playback
/// (_GetStagePlaybackTimeCodesInRange, bakeSkinning.cpp:1882-1919).
function _getStagePlaybackTimeCodesInRange(stage: Stage, interval: GfInterval): number[] {
  const times: number[] = []
  if (!stage.hasAuthoredTimeRange()) return times

  const timeCodesPerSecond = stage.timeCodesPerSecond
  const framesPerSecond = stage.getFramesPerSecond()
  if (Math.abs(timeCodesPerSecond) <= 1e-6 || Math.abs(framesPerSecond) <= 1e-6) return times
  // Compute the expected per-frame time step for playback.
  const timeStep = Math.abs(timeCodesPerSecond / framesPerSecond)

  const stageStart = stage.startTimeCode ?? 0
  const stageEnd = stage.endTimeCode ?? 0
  if (stageEnd < stageStart) {
    // Malfored time code range.
    return times
  }
  // Add 1 to the sample count for an inclusive range.
  const numTimeSamples = Math.trunc((stageEnd - stageStart) / timeStep + 1)
  for (let i = 0; i <= numTimeSamples; ++i) {
    // Add samples based on integer multiples of the time step
    // to reduce error.
    const t = stageStart + timeStep * i
    if (interval.contains(t)) times.push(t)
  }
  return times
}

// std::lower_bound over a sorted array.
function _lowerBound(values: readonly number[], t: number): number {
  let lo = 0, hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid]! < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

// std::upper_bound over a sorted array.
function _upperBound(values: readonly number[], t: number): number {
  let lo = 0, hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid]! <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/// Compute the full set of time samples at which data must be sampled.
/// A mask is applied to each SkelAdapter indicating at what times within
/// that full set of time samples the SkelAdapter should be processed
/// (_ComputeTimeSamples, bakeSkinning.cpp:1925-2069).
function _computeTimeSamples(
  stage: Stage, interval: GfInterval,
  skelAdapters: readonly _SkelAdapter[], skinningAdapters: readonly _SkinningAdapter[],
): TimeCode[] {
  // Pre-compute time samples for each skel adapter.
  const skelTimesMap = new Map<_SkelAdapter, number[]>()
  for (const adapter of skelAdapters) skelTimesMap.set(adapter, [])

  for (const adapter of skelAdapters) {
    adapter.extendTimeSamples(interval, skelTimesMap.get(adapter)!)
  }

  // Extend the time samples of each skel adapter with the time samples
  // of each skinning adapter.
  for (const adapter of skinningAdapters) {
    let times = skelTimesMap.get(adapter.getSkelAdapter())
    if (!times) skelTimesMap.set(adapter.getSkelAdapter(), times = [])
    adapter.extendTimeSamples(interval, times)
  }

  // Each times array may now hold duplicate entries.
  // Sort and remove dupes from each array.
  for (const [adapter, times] of skelTimesMap) {
    skelTimesMap.set(adapter, [...new Set(times)].sort((a, b) => a - b))
  }

  // XXX: Skinning meshes are baked at each time sample at which joint
  // transforms or blend shapes are authored. If the joint transforms
  // are authored at sparse time samples, then the deformed meshes will
  // be linearly interpolated on sub-frames. But linearly interpolating
  // deformed meshes is not equivalent to linearly interpolating the
  // the driving animation, particularly when considering joint rotations.
  // It is impossible to get a perfect match at every possible sub-frame,
  // since the resulting stage may be read at arbitrary sub-frames, but
  // we can at least make sure that the samples are correct at the
  // frames on which the stage is expected to be sampled, based on the
  // stage's time-code metadata.
  // In other words, we wish to bake skinning at every time ordinate at
  /// which the output is expected to be sampled.
  const stageTimes = _getStagePlaybackTimeCodesInRange(stage, interval)

  // Compute the total union of all time samples.
  let allTimes = _unionTimes(stageTimes, [])
  for (const times of skelTimesMap.values()) allTimes = _unionTimes(times, allTimes)

  // Actual time samples will be default time + the times above.
  const times: TimeCode[] = [undefined, ...allTimes]

  // For each skinning adapter, store a bit mask identitying which
  // of the above times should be sampled for the adapter.
  for (const adapter of skelAdapters) {
    const timeSampleMask = new Array<boolean>(times.length).fill(false)
    const timesForSkel = skelTimesMap.get(adapter)!
    if (timesForSkel.length === 0) {
      // Skel has no time samples; only need to
      // sample at defaults (index=0).
      timeSampleMask[0] = true
    } else {
      for (const t of timesForSkel) {
        // +1 to account for default time (index=0)
        timeSampleMask[_lowerBound(allTimes, t) + 1] = true
      }
      if (timesForSkel.length > 1) {
        // Mix in any times corresponding to stage playback
        // that lie within the range of the times for this
        // skel.
        const start = _lowerBound(stageTimes, timesForSkel[0]!)
        const end = _upperBound(stageTimes, timesForSkel[timesForSkel.length - 1]!)
        for (let it = start; it < end; ++it) {
          // +1 to account for default time (index=0)
          timeSampleMask[_lowerBound(allTimes, stageTimes[it]!) + 1] = true
        }
      }
    }
    adapter.setTimeSampleMask(timeSampleMask)
  }
  return times
}

/// Convert all SkelRoot prims to Xform prims.
/// This disables the effect of skels, resulting in a normal geometry
/// hierarchy (_ConvertSkelRootsToXforms, bakeSkinning.cpp:2074-2104).
function _convertSkelRootsToXforms(parms: BakeSkinningParms): void {
  // Find the SkelRoot above each binding.
  for (let i = 0; i < parms.bindings.length; ++i) {
    const layerIndex = parms.layerIndices[i]!
    if (layerIndex < parms.layers.length) {
      const layer = parms.layers[layerIndex]!
      const binding = parms.bindings[i]!
      for (const skinningQuery of binding.getSkinningTargets()) {
        const root = _findSkelRoot(skinningQuery.getPrim())
        if (root) {
          const spec = sdfCreatePrimInLayer(layer, root.path)
          if (spec) {
            spec.setTypeName(_tokens.Xform)
            spec.setSpecifier('def')
          }
          break
        }
      }
    }
  }
}

// UsdSkelRoot::Find (root.cpp:128-137).
function _findSkelRoot(prim: Prim): Prim | undefined {
  for (let p: Prim | undefined = prim; p; p = _getParent(p)) {
    if (p.isA('SkelRoot')) return p
  }
  return undefined
}

// Skinning adapters hold the prims they were created for. Type changes made
// by _ConvertSkelRootsToXforms resync the SkelRoot subtree, so the post
// passes look the prims up again by path.
function _currentPrim(adapter: _SkinningAdapter): Prim | undefined {
  const prim = adapter.getPrim()
  return prim.getStage().getPrim(prim.path)
}

/// Update extents of any prims whose points were modified by skinning,
/// but which weren't directly updated by the main skinning loop
/// (_PostUpdateExtents, bakeSkinning.cpp:2109-2171).
function _postUpdateExtents(skinningAdapters: readonly _SkinningAdapter[], times: readonly TimeCode[]): void {
  // Idenfity adapters to update.
  const adaptersToUpdate = skinningAdapters.filter(adapter => adapter.requiresPostExtentUpdate())
  if (adaptersToUpdate.length === 0) return

  // Compute all extents (UsdGeomBoundable::ComputeExtentFromPlugins).
  const extents: (Float32Array | undefined)[] = new Array(times.length * adaptersToUpdate.length)
  for (let i = 0; i < adaptersToUpdate.length; ++i) {
    const adapter = adaptersToUpdate[i]!
    const prim = _currentPrim(adapter)
    if (!prim) continue
    for (let ti = 0; ti < times.length; ++ti) {
      if (adapter.shouldProcessAtTime(ti)) {
        const extent = Boundable.computeExtentFromPlugins(prim, times[ti])
        if (extent) extents[times.length * i + ti] = Float32Array.from([...extent[0], ...extent[1]])
      }
    }
  }

  // Author the results.
  for (let i = 0; i < adaptersToUpdate.length; ++i) {
    const prim = _currentPrim(adaptersToUpdate[i]!)
    if (!prim) continue
    const extentAttr = new Boundable(prim).getExtentAttr()
    extentAttr.clear()
    for (let ti = 0; ti < times.length; ++ti) {
      const extent = extents[times.length * i + ti]
      if (extent && extent.length > 0) {
        const value = _vec3fArray(extent)
        const time = times[ti]
        if (time === undefined) extentAttr.set(value)
        else extentAttr.setTimeSample(time, value)
      }
    }
  }
}

// UsdGeomModelAPI::ComputeExtentsHint (pxr/usd/usdGeom/modelAPI.cpp:373-436).
function _computeExtentsHint(model: Prim, bboxCache: BBoxCache): Float32Array {
  const purposeTokens = Imageable.getOrderedPurposeTokens()

  // If this model is itself a boundable, we call ComputeExtentFromPlugins().
  if (model.isA('Boundable')) {
    const time = bboxCache.getTime()
    const extent = Boundable.computeExtentFromPlugins(model, time.isDefault() ? undefined : time.GetValue())
    if (extent) {
      // Replicate the bounds across all the purposes for now.
      const extents: number[] = []
      for (let i = 0; i < purposeTokens.length; ++i) extents.push(...extent[0], ...extent[1])
      return Float32Array.from(extents)
    }
    // Leave a single empty range (GfRange3f()).
    const FLT_MAX = 3.4028234663852886e38
    return Float32Array.from([FLT_MAX, FLT_MAX, FLT_MAX, -FLT_MAX, -FLT_MAX, -FLT_MAX])
  }

  // This model is not a boundable, so use the bboxCache.
  const extents: number[] = []
  let lastNotEmpty = 0
  for (let i = 0; i < purposeTokens.length; ++i) {
    // Set the gprim purpose that we are interested in computing the bbox
    // for. This doesn't cause the cache to be blown.
    bboxCache.setIncludedPurposes([purposeTokens[i]!])
    const range = bboxCache.computeUntransformedBound(model).computeAlignedBox()
    extents.push(...range.getMin().data, ...range.getMax().data)
    if (!range.IsEmpty()) lastNotEmpty = i
  }
  // Trim any trailing empty boxes, but leave at least one.
  return Float32Array.from(extents.slice(0, 6 * (lastNotEmpty + 1)))
}

/// Update extents hints of any ancestor models of skinned prims
/// that already define an extents hint
/// (_UpdateExtentHints, bakeSkinning.cpp:2185-2287).
function _updateExtentHints(skinningAdapters: readonly _SkinningAdapter[], times: readonly TimeCode[]): void {
  // Find the models that have extentsHints that need to be updated.
  const modelToAdaptersMap = new Map<string, { model: Prim, adapters: _SkinningAdapter[] }>()
  for (const adapter of skinningAdapters) {
    for (let p = _currentPrim(adapter); p && !_isPseudoRoot(p); p = _getParent(p)) {
      if (p.isModel()) {
        // UsdGeomModelAPI::GetExtentsHintAttr.
        const attr = p.getAttr('extentsHint')
        if (attr) {
          let entry = modelToAdaptersMap.get(p.path)
          if (!entry) modelToAdaptersMap.set(p.path, entry = { model: p, adapters: [] })
          entry.adapters.push(adapter)
          // Clear any existing time samples, incase they
          // include samples that differ from our sampling times.
          attr.clear()
        }
      }
    }
  }
  if (modelToAdaptersMap.size === 0) return

  // Flatten the map down to vectors, for threading convenience.
  const modelsToUpdate = [...modelToAdaptersMap.values()].map(entry => entry.model)
  const adaptersPerModel = [...modelToAdaptersMap.values()].map(entry => entry.adapters)

  // Compute all extent hints. (One WorkParallelForN chunk.)
  const extents: (Float32Array | undefined)[] = new Array(times.length * skinningAdapters.length)
  if (times.length > 0) {
    const bboxCache = new BBoxCache(times[0], Imageable.getOrderedPurposeTokens(),
      /*useExtentsHint*/ false)
    for (let ti = 0; ti < times.length; ++ti) {
      bboxCache.setTime(times[ti])
      for (let i = 0; i < adaptersPerModel.length; ++i) {
        const shouldProcess = adaptersPerModel[i]!.some(adapter => adapter.shouldProcessAtTime(ti))
        if (shouldProcess) {
          extents[times.length * i + ti] = _computeExtentsHint(modelsToUpdate[i]!, bboxCache)
        }
      }
    }
  }

  // Author the results (UsdGeomModelAPI::SetExtentsHint,
  // modelAPI.cpp:344-365).
  for (let i = 0; i < modelsToUpdate.length; ++i) {
    const model = modelsToUpdate[i]!
    for (let ti = 0; ti < times.length; ++ti) {
      const extent = extents[times.length * i + ti]
      if (extent && extent.length > 0) {
        const attr = model.createAttribute('extentsHint', 'float3[]', /*custom*/ false)
        const time = times[ti]
        if (time === undefined) attr.set(_vec3fArray(extent))
        else attr.setTimeSample(time, _vec3fArray(extent))
      }
    }
  }
}

// _SaveLayers (bakeSkinning.cpp:2290-2308).
async function _saveLayers(parms: BakeSkinningParms): Promise<boolean> {
  let error = false
  for (const layer of parms.layers) {
    if (!(await layer.save())) error = true
  }
  return !error
}

// The body of UsdSkelBakeSkinning(skelCache, parms, interval)
// (bakeSkinning.cpp:2314-2489), up to the final save.
function _bakeSkinning(skelCache: UsdSkelCache, parms: BakeSkinningParms, interval: GfInterval): boolean {
  // Get the stage from the first valid binding.
  let stage: Stage | undefined
  for (const binding of parms.bindings) {
    const skel = binding.getSkeleton()
    if (!stage && skel && skel.path !== '') stage = skel.prim.getStage()
    for (const query of binding.getSkinningTargets()) {
      if (query.getPrim().isInstance() || query.getPrim().isInstanceProxy()) {
        // TODO: support BakeSkinning for instances
        TfWarn(`[UsdSkelBakeSkinning] Cannot bake skinning for instanced SkinningQuery ` +
          `<${query.getPrim().path}>\n`)
        return false
      }
    }
  }
  if (!stage) return false

  const xfCache = new XformCache(stage)

  // Create adapters to wrangle IO on skels and skinnable prims.
  const skelAdapters: _SkelAdapter[] = []
  const skinningAdapters: _SkinningAdapter[] = []
  if (!_createAdapters(parms, skelCache, skelAdapters, skinningAdapters, xfCache)) return false

  // Compute an array of times at which the adapters should be processed.
  // The skel adapters are additionally annotated with a mask indicating
  // whether or not each individual skel needs to be processed at each time.
  const times = _computeTimeSamples(stage, interval, skelAdapters, skinningAdapters)

  // Defer change processing.
  sdfChangeBlock(() => {
    for (let ti = 0; ti < times.length; ++ti) {
      const time = times[ti]

      // Update all required transforms for this time.
      xfCache.setTime(time)
      for (const skelAdapter of skelAdapters) skelAdapter.updateTransform(ti, xfCache)
      for (const skinningAdapter of skinningAdapters) skinningAdapter.updateTransform(ti, xfCache)

      // Update all skel animations for this time.
      for (const skelAdapter of skelAdapters) skelAdapter.updateAnimation(time, ti)

      // Update all skinning adapters for this time.
      for (const skinningAdapter of skinningAdapters) skinningAdapter.update(time, ti)

      // Write the results from each skinning adapter.
      // This must be done in serial for each layer being written.
      for (let i = 0; i < parms.layers.length; ++i) {
        for (const adapter of skinningAdapters) {
          if (adapter.getLayerIndex() === i) adapter.write(time, ti)
        }
      }
      // The memory-limit flush (bakeSkinning.cpp:2452-2467) needs a
      // synchronous SdfLayer::Save; see BakeSkinningParms.memoryLimit.
    }
    _convertSkelRootsToXforms(parms)
  })
  // Expire the change block. Changes will be processed on the stage.

  if (parms.updateExtents) _postUpdateExtents(skinningAdapters, times)
  if (parms.updateExtentHints) _updateExtentHints(skinningAdapters, times)
  return true
}

// ------------------------------------------------------------
// UsdSkelBakeSkinning entry points (bakeSkinning.h:126-148)
// ------------------------------------------------------------

/**
 * UsdSkelBakeSkinning(skelCache, parms, interval): bake the bindings of
 * `parms` into `parms.layers`. Saves the layers when `parms.saveLayers` is
 * set, which is asynchronous in this port.
 */
export function bakeSkinning(skelCache: UsdSkelCache, parms: BakeSkinningParms,
  interval?: GfInterval): Promise<boolean>
/** UsdSkelBakeSkinning(skelRoot, interval): bake the skinning under a SkelRoot. */
export function bakeSkinning(root: SkelRoot, interval?: GfInterval): boolean
/** UsdSkelBakeSkinning(range, interval): bake every SkelRoot in a prim range. */
export function bakeSkinning(range: Iterable<Prim>, interval?: GfInterval): boolean
export function bakeSkinning(
  arg: UsdSkelCache | SkelRoot | Iterable<Prim>,
  parmsOrInterval?: BakeSkinningParms | GfInterval,
  interval?: GfInterval,
): boolean | Promise<boolean> {
  if (arg instanceof UsdSkelCache) {
    const parms = parmsOrInterval as BakeSkinningParms
    const ok = _bakeSkinning(arg, parms, interval ?? GfInterval.getFullInterval())
    return ok && parms.saveLayers ? _saveLayers(parms) : Promise.resolve(ok)
  }
  const fullInterval = (parmsOrInterval as GfInterval | undefined) ?? GfInterval.getFullInterval()
  if (arg instanceof SkelRoot) return _bakeSkinningRoot(arg, fullInterval)
  return _bakeSkinningRange(arg, fullInterval)
}

// UsdSkelBakeSkinning(const UsdPrimRange&, const GfInterval&)
// (bakeSkinning.cpp:2492-2541).
function _bakeSkinningRange(range: Iterable<Prim>, interval: GfInterval): boolean {
  const parms = new BakeSkinningParms()
  // Backwards-compatibility: do not save during skinning.
  parms.saveLayers = false

  const skelCache = new UsdSkelCache()

  // Build up the complete list of bindings to process.
  for (const prim of range) {
    if (prim.isA('SkelRoot')) {
      if (prim.isInstance() || prim.isInstanceProxy()) {
        // TODO: support BakeSkinning for instances
        TfWarn(`[UsdSkelBakeSkinning] Cannot bake skinning for instanced SkelRoot <${prim.path}>\n`)
        return false
      }
      const skelRoot = new SkelRoot(prim)
      skelCache.populate(skelRoot, PrimDefaultPredicate)
      parms.bindings.push(...skelCache.computeSkelBindings(skelRoot, PrimDefaultPredicate))
    }
  }
  if (parms.bindings.length === 0) {
    // Nothing to do.
    return true
  }

  // Follow the first binding to determine the stage
  // (and from there, the current authoring layer)
  const layer = parms.bindings[0]!.getSkeleton()!.prim.getStage().getEditTarget().getLayer()
  if (!layer) return false
  parms.layers = [layer]
  parms.layerIndices = new Array<number>(parms.bindings.length).fill(0)
  return _bakeSkinning(skelCache, parms, interval)
}

// UsdSkelBakeSkinning(const UsdSkelRoot&, const GfInterval&)
// (bakeSkinning.cpp:2544-2578).
function _bakeSkinningRoot(skelRoot: SkelRoot, interval: GfInterval): boolean {
  const prim = skelRoot.prim
  if (prim.isInstance() || prim.isInstanceProxy()) {
    // TODO: support BakeSkinning for instances
    TfWarn(`[UsdSkelBakeSkinning] Cannot bake skinning for instanced SkelRoot <${prim.path}>\n`)
    return false
  }

  const parms = new BakeSkinningParms()
  // Backwards-compatibility: do not save during skinning.
  parms.saveLayers = false

  const skelCache = new UsdSkelCache()
  skelCache.populate(skelRoot, PrimDefaultPredicate)

  parms.bindings = skelCache.computeSkelBindings(skelRoot, PrimDefaultPredicate)
  if (parms.bindings.length === 0) {
    // Nothing to do.
    return true
  }
  const layer = prim.getStage().getEditTarget().getLayer()
  if (!layer) return false
  parms.layers = [layer]
  parms.layerIndices = new Array<number>(parms.bindings.length).fill(0)
  return _bakeSkinning(skelCache, parms, interval)
}
