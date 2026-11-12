// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/velocityMotionResolvingSceneIndex.cpp,
//  pxr/imaging/hdsi/velocityMotionResolvingSceneIndex.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/velocityMotionResolvingSceneIndex.{h,cpp}.
//
// Divergences:
// - HdSampledDataSource::GetValue returns the source's value as is in this
//   port (hd/dataSource.ts): attribute data sources return a VtValue, typed
//   data sources may return their typed value. _AsVtValue views a sampled
//   value as the VtValue upstream's GetValue returns (a VtArray becomes an
//   array-valued VtValue); a value of another kind is treated as an empty
//   VtValue, so the wrong-type checks defer to the source as upstream does
//   for a value that is not a VtVec3fArray / VtQuat{h,f}Array.
// - _TypedValueDataSource<T> and _UntypedValueDataSource
//   (velocityMotionResolvingSceneIndex.cpp:525-607) chosen by
//   HdCopySampledDataSourceType are two classes here as well; the typed one
//   is chosen when the source is an HdTypedSampledDataSource (data source
//   classes are not encoded per C++ value type in this port).
// - std::call_once lazy loads are plain "loaded" flags (one thread).
// - Float arithmetic: HdSampledDataSource::Time, timeCodesPerSecond (after
//   the float conversion at :235), GfVec3f and GfVec3f::GetLength are float
//   upstream; the arithmetic rounds through Math.fround at each float
//   operation.

import {
  composeRotations as GfComposeRotations,
  makeRotation as GfMakeRotation,
  Quatf as GfQuatf,
  Quath as GfQuath,
  quatToRotation as GfQuatToRotation,
  rotationToQuat as GfRotationToQuat,
  type Quat as GfQuatTuple,
  type Vec3f as GfVec3f,
} from 'typescript-usd/gf'
import {
  CachingSampledDataSource as HdCachingSampledDataSource,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  InstancerTokens as HdInstancerTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  SampledDataSource as HdSampledDataSource,
  SceneGlobalsSchema as HdSceneGlobalsSchema,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  Tokens as HdTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { Debug as TfDebug, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

// velocityMotionResolvingSceneIndex.h:27-28 TF_DEBUG_CODES
export const HDSI_VELOCITY_MOTION = 'HDSI_VELOCITY_MOTION'

// velocityMotionResolvingSceneIndex.cpp:50-53
TfDebug.registerDebugSymbol(HDSI_VELOCITY_MOTION, 'Velocity-based motion')

/** TF_DEBUG(HDSI_VELOCITY_MOTION).Msg(...) */
function _Debug(message: () => string): void {
  if (TfDebug.isEnabled(HDSI_VELOCITY_MOTION)) {
    TfDebug.msg(HDSI_VELOCITY_MOTION, message())
  }
}

/** velocityMotionResolvingSceneIndex.h:30-39 */
export const HdsiVelocityMotionResolvingSceneIndexTokens = TfMakeTokens({
  disable: 'disable',
  enable: 'enable',
  ignore: 'ignore',
  noAcceleration: 'noAcceleration',
  timeCodesPerSecond: 'timeCodesPerSecond',
  velocityMotionMode: '__velocityMotionMode',
})

const _tokens = HdsiVelocityMotionResolvingSceneIndexTokens

type Time = number

const f32 = Math.fround

// velocityMotionResolvingSceneIndex.cpp:60
const _fallbackTimeCodesPerSecond = f32(24.0)

let _affectedPrimvars: Set<string> | undefined

/** velocityMotionResolvingSceneIndex.cpp:62-71 */
function _PrimvarAffectedByVelocity(primvar: string): boolean {
  const primvars = _affectedPrimvars ??= new Set([
    HdPrimvarsSchemaTokens.points,
    HdInstancerTokens.instanceTranslations,
    HdInstancerTokens.instanceRotations,
    HdInstancerTokens.instanceScales])
  return primvars.has(primvar)
}

/** The VtValue upstream's HdSampledDataSource::GetValue returns for `value`
 *  (see the header). */
function _AsVtValue(value: unknown): VtValue {
  if (value instanceof VtValue) return value
  if (value instanceof VtArray) return VtValue.createArray(value as VtArray<unknown>)
  return VtValue.getEmpty()
}

function _IsHoldingArrayOf(value: VtValue, elementType: unknown): boolean {
  return value.isArrayValued() && value.getElementType() === elementType
}

/** VtValue::GetWithDefault<T>: the held value when it is of T's kind, else
 *  `defaultValue`. */
function _GetWithDefault<T extends number | string>(value: unknown, defaultValue: T): T {
  const held = value instanceof VtValue
    ? (value.IsEmpty() || value.isArrayValued() ? undefined : value.UncheckedGet<unknown>())
    : value
  const unboxed = held instanceof String ? String(held) : held
  return typeof unboxed === typeof defaultValue ? unboxed as T : defaultValue
}

/** printf("%f") */
function _F(t: number): string {
  return t.toFixed(6)
}

// -----------------------------------------------------------------------------

// Since we can have rotations as VtQuathArray or VtQuatfArray, these helpers
// make applying angular velocities to them less ugly.

/** velocityMotionResolvingSceneIndex.cpp:78-93 */
function _ApplyAngularVelocitiesT<T extends GfQuath | GfQuatf>(
  rotations: VtArray<T>,
  velocities: VtArray<GfVec3f>,
  scaledTime: Time,
  make: (q: GfQuatTuple) => T,
): VtValue {
  const result: T[] = new Array<T>(rotations.size)
  for (let i = 0; i < rotations.size; ++i) {
    const q = rotations.get(i)
    const imaginary = q.GetImaginary().data
    // GfRotation(GfQuatd(rotations[i]))
    let rotation = GfQuatToRotation(
      [q.GetReal(), imaginary[0]!, imaginary[1]!, imaginary[2]!])
    const v = velocities.get(i).data
    const x = v[0]!, y = v[1]!, z = v[2]!
    // GfVec3f::GetLength (float)
    const length = f32(Math.sqrt(f32(f32(f32(x * x) + f32(y * y)) + f32(z * z))))
    rotation = GfComposeRotations(rotation,
      GfMakeRotation([x, y, z], f32(scaledTime * length)))
    result[i] = make(GfRotationToQuat(rotation))
  }
  return VtValue.createArray(new VtArray<T>(result, rotations.getElementType()))
}

/** velocityMotionResolvingSceneIndex.cpp:95-111 */
function _ApplyAngularVelocities(
  rotations: VtValue,
  velocities: VtArray<GfVec3f>,
  scaledTime: Time,
): VtValue {
  if (_IsHoldingArrayOf(rotations, VtValueTypes.GfQuath)) {
    return _ApplyAngularVelocitiesT(
      rotations.UncheckedGet<VtArray<GfQuath>>(), velocities, scaledTime,
      (q) => new GfQuath(q[0], q[1], q[2], q[3]))
  }
  if (_IsHoldingArrayOf(rotations, VtValueTypes.GfQuatf)) {
    return _ApplyAngularVelocitiesT(
      rotations.UncheckedGet<VtArray<GfQuatf>>(), velocities, scaledTime,
      (q) => new GfQuatf(q[0], q[1], q[2], q[3]))
  }
  TF_CODING_ERROR('Unexpected rotations type')
  return VtValue.getEmpty()
}

/** The xyz components of a VtVec3fArray, flat. */
function _Vec3fComponents(array: VtArray<GfVec3f>): ArrayLike<number> {
  const storage = array.cdata()
  if (storage instanceof Float32Array) return storage
  const out = new Float32Array(array.size * 3)
  for (let i = 0; i < array.size; ++i) {
    const v = array.get(i).data
    out[3 * i] = v[0]!
    out[3 * i + 1] = v[1]!
    out[3 * i + 2] = v[2]!
  }
  return out
}

const _emptyVec3fArray = (): VtArray<GfVec3f> =>
  new VtArray<GfVec3f>([], VtValueTypes.GfVec3f)

// -----------------------------------------------------------------------------

/** velocityMotionResolvingSceneIndex.cpp:115-521 */
class _VelocityHelper {
  private readonly _source: HdCachingSampledDataSource
  private _velocitiesDs: HdSampledDataSource | undefined
  private _accelerationsDs: HdSampledDataSource | undefined
  private _loadedVelocities = false
  private _loadedAccelerations = false

  /** velocityMotionResolvingSceneIndex.cpp:120-131 */
  constructor(
    // name of the 0-order parameter this data source wraps
    // (positions, points, or orientations)
    private readonly _name: string,
    // the incoming data source for the 0-order parameter to be wrapped
    source: HdSampledDataSource,
    private readonly _primPath: string,
    private readonly _primSource: HdContainerDataSource | undefined,
    private readonly _inputSceneIndex: HdSceneIndexBase,
  ) {
    this._source = HdCachingSampledDataSource.new(source)
  }

  /** velocityMotionResolvingSceneIndex.cpp:134-206 */
  GetContributingSampleTimesForInterval(
    startTime: Time,
    endTime: Time,
    outSampleTimes: Time[],
  ): boolean {
    const mode = this._getMode()
    if (mode === _tokens.ignore) {
      // velocity-based motion is ignored; defer to source
      _Debug(() => `<${this._primPath}.${this._name}>: Ignoring velocity-based motion (mode)\n`)
      return this._source.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }

    const valid = this._velocityMotionValidForCurrentFrame()
    if (!valid) {
      // velocity-based motion is invalid; defer to source
      return this._source.GetContributingSampleTimesForInterval(
        startTime, endTime, outSampleTimes)
    }
    const { srcValue: sourceValue, sampleTime } = valid

    // velocity-based motion is valid

    // XXX: These next two are handled separately to make nice debug
    if (mode === _tokens.disable) {
      // velocity-based motion is disabled
      _Debug(() => `<${this._primPath}.${this._name}>: Velocity-based motion disabled (mode)\n`)
      outSampleTimes.length = 0
      return false
    }

    // Instance scales are always frozen when doing velocity motion.
    if (this._name === HdInstancerTokens.instanceScales) {
      _Debug(() => `<${this._primPath}.${this._name}>: Frozen\n`)
      outSampleTimes.length = 0
      return false
    }

    outSampleTimes.length = 0
    outSampleTimes.push(startTime, endTime)

    // Check for non-linear motion and insert any additional required sample
    // times according to nonlinearSampleCount.
    if (this._name === HdInstancerTokens.instanceRotations ||
        (mode === _tokens.enable &&
          this._getAccelerations(sampleTime).size >=
            sourceValue.getArraySize())) {
      const n = Math.max(3, this._getNonlinearSampleCount()) - 1
      for (let k = 1; k < n; ++k) {
        outSampleTimes.splice(outSampleTimes.length - 1, 0,
          f32(startTime + f32(f32(f32(k) / f32(n)) * f32(endTime - startTime))))
      }
    }
    _Debug(() => `<${this._primPath}.${this._name}>: Sample times: [${outSampleTimes.map(_F).join(', ')}]\n`)
    return true
  }

  /** velocityMotionResolvingSceneIndex.cpp:208-272 */
  GetValue(shutterOffset: Time): unknown {
    const mode = this._getMode()
    if (mode === _tokens.ignore) {
      // velocity-based motion is ignored; defer to source
      return this._source.GetValue(shutterOffset)
    }
    const valid = this._velocityMotionValidForCurrentFrame()
    if (!valid) {
      // velocity-based motion is invalid; defer to source
      return this._source.GetValue(shutterOffset)
    }
    const { srcValue: sourceVal, velocities, sampleTime } = valid

    // velocity-based motion is valid

    // when velocity motion is disabled, or when handling instancer
    // scales, freeze to left-bracketing time sample
    if (mode === _tokens.disable ||
        this._name === HdInstancerTokens.instanceScales) {
      return this._source.GetValue(sampleTime)
    }

    // USD defines timeCodesPerSecond as double; convert to float.
    const timeCodesPerSecond = f32(this._getTimeCodesPerSecond())
    const scaledTime =
      f32(f32(shutterOffset - sampleTime) / timeCodesPerSecond)

    // rotations
    if (this._name === HdInstancerTokens.instanceRotations) {
      return _ApplyAngularVelocities(sourceVal, velocities, scaledTime)
    }

    // positions
    const positionsArray = sourceVal.UncheckedGet<VtArray<GfVec3f>>()
    const positions = _Vec3fComponents(positionsArray)
    const count = positionsArray.size
    const v = _Vec3fComponents(velocities)

    // check for accelerations
    let accelerations = _emptyVec3fArray()
    let useAccelerations = mode !== _tokens.noAcceleration
    if (useAccelerations) {
      accelerations = this._getAccelerations(sampleTime)
      useAccelerations = accelerations.size >= count
    }

    // perform velocity motion on positions
    const result = new Float32Array(count * 3)
    if (useAccelerations) {
      const a = _Vec3fComponents(accelerations)
      const timeSqrHalf = f32(f32(0.5 * scaledTime) * scaledTime)
      for (let i = 0; i < count * 3; ++i) {
        result[i] = f32(f32(positions[i]! + f32(scaledTime * v[i]!)) +
          f32(timeSqrHalf * a[i]!))
      }
    } else {
      for (let i = 0; i < count * 3; ++i) {
        result[i] = f32(positions[i]! + f32(scaledTime * v[i]!))
      }
    }
    return VtValue.createArray(
      VtArray.fromBuffer(VtValueTypes.GfVec3f, result, count))
  }

  /** velocityMotionResolvingSceneIndex.cpp:275-289
   *
   * Gets timeCodesPerSecond with the following priority (first found wins):
   *  - From HdSceneGlobalsSchema
   *  - From the static fallback defined in this file */
  private _getTimeCodesPerSecond(): number {
    const sg = HdSceneGlobalsSchema.getFromSceneIndex(this._inputSceneIndex)
    if (sg.isDefined()) {
      const ds = sg.getTimeCodesPerSecond()
      if (ds) {
        return ds.getTypedValue(0.0)
      }
    }

    return _fallbackTimeCodesPerSecond
  }

  /** velocityMotionResolvingSceneIndex.cpp:291-333
   *
   * Retrieves the value of the accelerations primvar for the current frame,
   * if present. If not present, or incorrect type, or the contributing
   * sample time doesn't match the given one, returns an empty VtVec3fArray.
   * Caller still needs to check that there are enough accelerations values
   * to cover all the positions needing transformation. */
  private _getAccelerations(sampleTime: Time): VtArray<GfVec3f> {
    if (!this._loadedAccelerations) {
      this._loadedAccelerations = true
      const ds = HdContainerDataSource.Get(this._primSource, _accelerationsLocator())
      this._accelerationsDs = ds instanceof HdSampledDataSource
        ? HdCachingSampledDataSource.new(ds) : undefined
    }
    if (!this._accelerationsDs) {
      // accelerations not present
      return _emptyVec3fArray()
    }
    const times: Time[] = []
    if (!this._accelerationsDs.GetContributingSampleTimesForInterval(
      0.0, 0.0, times)) {
      // accelerations has constant value across all time; sample timing
      // does not matter
      times.length = 1
      times[0] = sampleTime
    }
    if (times[0] !== sampleTime) {
      // accelerations not authored at same starting time as source
      return _emptyVec3fArray()
    }
    const accelerationsVal = _AsVtValue(this._accelerationsDs.GetValue(times[0]!))
    if (!_IsHoldingArrayOf(accelerationsVal, VtValueTypes.GfVec3f)) {
      // accelerations are wrong type
      return _emptyVec3fArray()
    }
    return accelerationsVal.UncheckedGet<VtArray<GfVec3f>>()
  }

  /** velocityMotionResolvingSceneIndex.cpp:335-465
   *
   * Determines whether the conditions are met for performing velocity-based
   * motion on the underlying source primvar at the current frame. Returns,
   * when they are, the sampled value of the underlying source for the
   * current frame (0-order points, positions, or orientations at the first
   * authored sample time at or before shutterOffset 0), the sampled
   * velocities (1-order velocities or angular velocities at that time), and
   * the shutterOffset at which they were sampled (the offset to the
   * left-bracketing, most recent authored, time sample; always <= 0);
   * undefined otherwise. */
  private _velocityMotionValidForCurrentFrame(): {
    srcValue: VtValue
    velocities: VtArray<GfVec3f>
    sampleTime: Time
  } | undefined {
    if (!this._loadedVelocities) {
      this._loadedVelocities = true
      const velocitiesLocator = new HdDataSourceLocator(
        HdPrimvarsSchema.getSchemaToken(),
        this._name === HdInstancerTokens.instanceRotations
          ? HdTokens.angularVelocities
          : HdTokens.velocities,
        HdPrimvarSchemaTokens.primvarValue)
      const ds = HdContainerDataSource.Get(this._primSource, velocitiesLocator)
      this._velocitiesDs = ds instanceof HdSampledDataSource
        ? HdCachingSampledDataSource.new(ds) : undefined
    }
    if (!this._velocitiesDs) {
      // velocities not present
      _Debug(() => `<${this._primPath}.${this._name}>: No velocities\n`)
      return undefined
    }

    // Source and velocities must both be authored at the same frame to be
    // valid. For example, when positions are authored at [1, 2, 3] but
    // velocities are only authored at [1, 3], there is no velocity-based
    // motion at frame [2]. But when positions and velocities are both
    // authored at [1, 3], there is valid velocity-based motion at frame [2],
    // propagated from the authored values at [1]. We check here that the
    // left-bracketing sample time for the current frame is the same for
    // both source and velocities. The catch is that one or both might be
    // constant, which we treat as equivalent to there being time samples
    // at every point in time. GetContributingSampleTimesForInterval()
    // is supposed to return false in this situation, and is not required
    // to put anything into outSampleTimes, so if we get a false we have to
    // assume the left-bracketing time sample is exactly at the current
    // frame.
    const times: [Time[], Time[]] = [[], []]
    if (!this._source.GetContributingSampleTimesForInterval(
      0.0, 0.0, times[0])) {
      // Source has no time samples, so has the same value at every time.
      // The frame-relative left-bracketing sample time is 0.
      times[0].length = 1
      times[0][0] = 0.0
    }
    if (!this._velocitiesDs.GetContributingSampleTimesForInterval(
      0.0, 0.0, times[1])) {
      // Velocities has no time samples, so has the same value at every
      // time. The frame-relative left-bracketing sample time is 0.
      times[1].length = 1
      times[1][0] = 0.0
    }
    // Time is float upstream.
    const sourceFront = f32(times[0][0]!)
    const velocitiesFront = f32(times[1][0]!)
    if (velocitiesFront !== sourceFront) {
      // Source and velocities do not share a common frame-relative
      // left-bracketing sample time
      _Debug(() => `<${this._primPath}.${this._name}>: Time sample ordinality mismatch (src: ${_F(sourceFront)} != vel: ${_F(velocitiesFront)})\n`)
      return undefined
    }
    const sampleTime = sourceFront
    const velocitiesVal = _AsVtValue(this._velocitiesDs.GetValue(sampleTime))
    if (!_IsHoldingArrayOf(velocitiesVal, VtValueTypes.GfVec3f)) {
      _Debug(() => `<${this._primPath}.${this._name}>: Velocities wrong type\n`)
      return undefined
    }
    const sourceVal = _AsVtValue(this._source.GetValue(sampleTime))
    if (sourceVal.getArraySize() > velocitiesVal.getArraySize()) {
      // not enough velocities
      _Debug(() => `<${this._primPath}.${this._name}>: Fewer velocities than source\n`)
      return undefined
    }
    if (this._name === HdInstancerTokens.instanceRotations) {
      if (!(_IsHoldingArrayOf(sourceVal, VtValueTypes.GfQuath) ||
          _IsHoldingArrayOf(sourceVal, VtValueTypes.GfQuatf))) {
        // source rotations are wrong type
        _Debug(() => `<${this._primPath}.${this._name}>: Source rotations wrong type\n`)
        return undefined
      }
    } else if (!_IsHoldingArrayOf(sourceVal, VtValueTypes.GfVec3f)) {
      // source points/positions or scales are wrong type
      _Debug(() => `<${this._primPath}.${this._name}>: Source positions/scales wrong type\n`)
      return undefined
    }
    _Debug(() => `<${this._primPath}.${this._name}>: Valid velocity-based motion\n`)
    return {
      srcValue: sourceVal,
      velocities: velocitiesVal.UncheckedGet<VtArray<GfVec3f>>(),
      sampleTime,
    }
  }

  /** velocityMotionResolvingSceneIndex.cpp:467-481 */
  private _getNonlinearSampleCount(): number {
    const defaultValue = 3 // From UsdGeomMotionAPI
    const ds = HdContainerDataSource.Get(this._primSource, _nonlinearSampleCountLocator())
    if (!(ds instanceof HdSampledDataSource)) {
      return defaultValue
    }
    return _GetWithDefault(ds.GetValue(0.0), defaultValue)
  }

  /** velocityMotionResolvingSceneIndex.cpp:483-509 */
  private _getMode(): string {
    const defaultMode = _tokens.enable
    const ds = HdContainerDataSource.Get(this._primSource, _modeLocator())
    if (!(ds instanceof HdSampledDataSource)) {
      return defaultMode
    }
    const value = _GetWithDefault<string>(ds.GetValue(0.0), defaultMode)
    if (!_validModes().has(value)) {
      _Debug(() => `<${this._primPath}.${this._name}>: Unrecognized velocity motion mode token '${value}'; assuming 'enable'\n`)
      return defaultMode
    }
    return value
  }
}

let _accelerationsLocatorValue: HdDataSourceLocator | undefined
/** velocityMotionResolvingSceneIndex.cpp:300-303 */
function _accelerationsLocator(): HdDataSourceLocator {
  return _accelerationsLocatorValue ??= new HdDataSourceLocator(
    HdPrimvarsSchema.getSchemaToken(),
    HdTokens.accelerations,
    HdPrimvarSchemaTokens.primvarValue)
}

let _nonlinearSampleCountLocatorValue: HdDataSourceLocator | undefined
/** velocityMotionResolvingSceneIndex.cpp:471-474 */
function _nonlinearSampleCountLocator(): HdDataSourceLocator {
  return _nonlinearSampleCountLocatorValue ??= new HdDataSourceLocator(
    HdPrimvarsSchema.getSchemaToken(),
    HdTokens.nonlinearSampleCount,
    HdPrimvarSchemaTokens.primvarValue)
}

let _modeLocatorValue: HdDataSourceLocator | undefined
/** velocityMotionResolvingSceneIndex.cpp:486-487 */
function _modeLocator(): HdDataSourceLocator {
  return _modeLocatorValue ??= new HdDataSourceLocator(_tokens.velocityMotionMode)
}

let _validModesValue: Set<string> | undefined
/** velocityMotionResolvingSceneIndex.cpp:488-492 */
function _validModes(): Set<string> {
  return _validModesValue ??= new Set([
    _tokens.enable,
    _tokens.disable,
    _tokens.noAcceleration,
    _tokens.ignore])
}

// -----------------------------------------------------------------------------

/** velocityMotionResolvingSceneIndex.cpp:525-557 */
class _UntypedValueDataSource extends HdSampledDataSource {
  private readonly _helper: _VelocityHelper

  static new(
    name: string,
    source: HdSampledDataSource,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ): _UntypedValueDataSource {
    return new _UntypedValueDataSource(
      name, source, primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:534-542 */
  private constructor(
    name: string,
    source: HdSampledDataSource,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ) {
    super()
    this._helper = new _VelocityHelper(
      name, source, primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:544-548 */
  GetValue(shutterOffset: Time): unknown {
    return this._helper.GetValue(shutterOffset)
  }

  /** velocityMotionResolvingSceneIndex.cpp:550-556 */
  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time,
    outSampleTimes: Time[],
  ): boolean {
    return this._helper.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

// -----------------------------------------------------------------------------

/** velocityMotionResolvingSceneIndex.cpp:563-607 */
class _TypedValueDataSource<T> extends HdTypedSampledDataSource<T> {
  private readonly _helper: _VelocityHelper

  static new<T>(
    name: string,
    source: HdSampledDataSource,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ): _TypedValueDataSource<T> {
    return new _TypedValueDataSource<T>(
      name, source, primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:599-606 */
  private constructor(
    name: string,
    source: HdSampledDataSource,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ) {
    super()
    this._helper = new _VelocityHelper(
      name, source, primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:573-577 */
  override GetValue(shutterOffset: Time): unknown {
    return this._helper.GetValue(shutterOffset)
  }

  /** velocityMotionResolvingSceneIndex.cpp:579-586 */
  GetContributingSampleTimesForInterval(
    startTime: Time, endTime: Time,
    outSampleTimes: Time[],
  ): boolean {
    return this._helper.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }

  /** velocityMotionResolvingSceneIndex.cpp:588-596. The typed value of a
   *  VtValue is the value it holds (the typed value an attribute data source
   *  returns). */
  getTypedValue(shutterOffset: Time): T {
    const v = this.GetValue(shutterOffset)
    if (v instanceof VtValue) {
      return (v.IsEmpty() ? undefined : v.UncheckedGet<T>()) as T
    }
    return v as T
  }
}

// -----------------------------------------------------------------------------

/** velocityMotionResolvingSceneIndex.cpp:611-664 */
class _PrimvarDataSource extends HdContainerDataSource {
  static new(
    name: string,
    source: HdContainerDataSource | undefined,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ): _PrimvarDataSource {
    return new _PrimvarDataSource(name, source, primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:617-628 */
  private constructor(
    private readonly _name: string,
    private readonly _source: HdContainerDataSource | undefined,
    private readonly _primPath: string,
    private readonly _primSource: HdContainerDataSource | undefined,
    private readonly _inputSceneIndex: HdSceneIndexBase,
  ) {
    super()
  }

  /** velocityMotionResolvingSceneIndex.cpp:630-638 */
  getNames(): string[] {
    if (!this._source) {
      return []
    }

    return this._source.getNames()
  }

  /** velocityMotionResolvingSceneIndex.cpp:640-656 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._source) {
      return undefined
    }
    const ds = this._source.Get(name)
    if (ds && name === HdPrimvarSchemaTokens.primvarValue) {
      if (ds instanceof HdSampledDataSource) {
        // HdCopySampledDataSourceType<_TypedValueDataSource,
        // _UntypedValueDataSource>
        return ds instanceof HdTypedSampledDataSource
          ? _TypedValueDataSource.new(
            this._name, ds, this._primPath, this._primSource,
            this._inputSceneIndex)
          : _UntypedValueDataSource.new(
            this._name, ds, this._primPath, this._primSource,
            this._inputSceneIndex)
      }
    }
    return ds
  }
}

// -----------------------------------------------------------------------------

/** velocityMotionResolvingSceneIndex.cpp:670-715 */
class _PrimvarsDataSource extends HdContainerDataSource {
  static new(
    source: HdContainerDataSource | undefined,
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ): _PrimvarsDataSource {
    return new _PrimvarsDataSource(source, primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:676-685 */
  private constructor(
    private readonly _source: HdContainerDataSource | undefined,
    private readonly _primPath: string,
    private readonly _primSource: HdContainerDataSource | undefined,
    private readonly _inputSceneIndex: HdSceneIndexBase,
  ) {
    super()
  }

  /** velocityMotionResolvingSceneIndex.cpp:687-694 */
  getNames(): string[] {
    if (!this._source) {
      return []
    }
    return this._source.getNames()
  }

  /** velocityMotionResolvingSceneIndex.cpp:696-709 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._source) {
      return undefined
    }
    const ds = this._source.Get(name)
    if (ds && _PrimvarAffectedByVelocity(name)) {
      return _PrimvarDataSource.new(
        name, ds instanceof HdContainerDataSource ? ds : undefined,
        this._primPath, this._primSource, this._inputSceneIndex)
    }
    return ds
  }
}

// -----------------------------------------------------------------------------

/** velocityMotionResolvingSceneIndex.cpp:721-766 */
class _PrimDataSource extends HdContainerDataSource {
  static new(
    primPath: string,
    primSource: HdContainerDataSource | undefined,
    inputSceneIndex: HdSceneIndexBase,
  ): _PrimDataSource {
    return new _PrimDataSource(primPath, primSource, inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:727-734 */
  private constructor(
    private readonly _primPath: string,
    private readonly _primSource: HdContainerDataSource | undefined,
    private readonly _inputSceneIndex: HdSceneIndexBase,
  ) {
    super()
  }

  /** velocityMotionResolvingSceneIndex.cpp:736-743 */
  getNames(): string[] {
    if (!this._primSource) {
      return []
    }
    return this._primSource.getNames()
  }

  /** velocityMotionResolvingSceneIndex.cpp:745-761 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._primSource) {
      return undefined
    }
    const ds = this._primSource.Get(name)
    if (!ds) {
      return undefined
    }
    if (name === HdPrimvarsSchema.getSchemaToken()) {
      return _PrimvarsDataSource.new(
        ds instanceof HdContainerDataSource ? ds : undefined,
        this._primPath, this._primSource, this._inputSceneIndex)
    }
    return ds
  }
}

// -----------------------------------------------------------------------------

let _supportedPrimTypes: Set<string> | undefined

let _positionsLocators: HdDataSourceLocatorSet | undefined
let _rotationsLocators: HdDataSourceLocatorSet | undefined
let _positionsAffectingLocators: HdDataSourceLocatorSet | undefined
let _rotationsAffectingLocators: HdDataSourceLocatorSet | undefined

/** velocityMotionResolvingSceneIndex.h:43-136
 *
 * Scene index that resolves velocity-based motion for all prims that support
 * it. For a complete discussion of how velocity-based motion works, when it
 * is valid, and how it is resolved, see the UsdGeom documentation here:
 * https://openusd.org/dev/api/usd_geom_page_front.html#UsdGeom_VelocityInterpolation
 *
 * This scene index performs all the necessary calculations so that
 * downstream consumers do not need to worry about velocity-based motion.
 * Downstream consumers need only make the usual call to
 * GetContributingSampleTimesForInterval() for an affected primvar, then
 * sample the primvar's value at the given times.
 *
 * Affected primvars are:
 *   For points-based geometry:
 *     - points
 *   For point instancers:
 *     - instancePositions
 *     - instanceRotations
 *     - instanceScales
 *
 * There is no need for downstream consumers to query velocities,
 * accelerations, or angularVelocities; their effects have already been
 * applied to the sampled values when appropriate. Downstream consumers will
 * only see motion (or none), again, as appropriate for the sampled primvar.
 * Any distinction between motion due to velocities and motion due to USD
 * value interpolation is intentionally lost.
 *
 * Note that, where non-linear motion has been applied (i.e., points or
 * instancePositions with accelerations, or instance rotations with
 * angularVelocities), GetContributingSampleTimesForInterval() will provide
 * the correct number of sample times for non-linear motion, taking
 * UsdGeomMotionAPI's nonlinearSampleCount into consideration. (Downstream
 * consumers should still check nonlinearSampleCount in the case of
 * instanceRotations.)
 *
 * Additionally, to support certain established workflows, the behavior of
 * the scene index may be controlled by the prim-level Hydra parameter
 * "__velocityMotionMode". This is never read from usd and must instead be
 * authored in a preceding filtering scene index. It is a token with one of
 * the following recognized values:
 *
 * - enable: velocity-based motion is resolved according to the normal rules.
 * - disable: velocity-based motion is frozen to the most recent authored
 *            positions/rotations for the current frame.
 * - ignore: velocity-based motion is ignored as if velocities are not
 *           present.
 * - noAcceleration: the effect of authored accelerations is ignored.
 *
 * In all cases (except 'ignore'), __velocityMotionMode has no effect unless
 * the authored velocity data is valid (see link above for what counts as
 * valid). (In the case of 'ignore', validity is not evaluated.) Where the
 * velocity data is not valid, the scene index makes no changes to the
 * incoming scene data, which may indicate motion due to USD value
 * interpolation where appropriate. */
export class HdsiVelocityMotionResolvingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** velocityMotionResolvingSceneIndex.cpp:772-779 */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    _inputArgs?: HdContainerDataSource,
  ): HdsiVelocityMotionResolvingSceneIndex {
    return new HdsiVelocityMotionResolvingSceneIndex(inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:781-785 */
  protected constructor(
    inputSceneIndex: HdSceneIndexBase,
    _inputArgs?: HdContainerDataSource,
  ) {
    super(inputSceneIndex)
  }

  /** velocityMotionResolvingSceneIndex.cpp:787-800 */
  static primTypeSupportsVelocityMotion(primType: string): boolean {
    const types = _supportedPrimTypes ??= new Set([
      HdPrimTypeTokens.points,
      HdPrimTypeTokens.basisCurves,
      HdPrimTypeTokens.nurbsCurves,
      HdPrimTypeTokens.nurbsPatch,
      HdPrimTypeTokens.tetMesh,
      HdPrimTypeTokens.mesh,
      HdPrimTypeTokens.instancer])
    return types.has(primType)
  }

  /** velocityMotionResolvingSceneIndex.cpp:802-812 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)
    if (HdsiVelocityMotionResolvingSceneIndex.primTypeSupportsVelocityMotion(prim.primType)) {
      return {
        primType: prim.primType,
        dataSource: _PrimDataSource.new(
          primPath, prim.dataSource, this._getInputSceneIndex()),
      }
    }
    return prim
  }

  /** velocityMotionResolvingSceneIndex.cpp:814-819 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** velocityMotionResolvingSceneIndex.cpp:821-827 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** velocityMotionResolvingSceneIndex.cpp:829-835 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this._sendPrimsRemoved(entries)
  }

  /** velocityMotionResolvingSceneIndex.cpp:837-934 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // Scales-freezing depends on whether velocity-based motion is valid, so
    // if either positions or rotations is dirty, we will dirty scales as
    // well.
    const primvarsLocator = HdPrimvarsSchema.getDefaultLocator()
    const positionsLocators = _positionsLocators ??= new HdDataSourceLocatorSet([
      HdPrimvarsSchema.getPointsLocator(),
      primvarsLocator.append(HdInstancerTokens.instanceTranslations),
      primvarsLocator.append(HdInstancerTokens.instanceScales)])
    const rotationsLocators = _rotationsLocators ??= new HdDataSourceLocatorSet([
      primvarsLocator.append(HdInstancerTokens.instanceRotations),
      primvarsLocator.append(HdInstancerTokens.instanceScales)])
    const positionsAffectingLocators = _positionsAffectingLocators ??= new HdDataSourceLocatorSet([
      primvarsLocator.append(HdTokens.velocities),
      primvarsLocator.append(HdTokens.accelerations),
      primvarsLocator.append(HdTokens.nonlinearSampleCount),
      new HdDataSourceLocator(_tokens.velocityMotionMode)])
    const rotationsAffectingLocators = _rotationsAffectingLocators ??= new HdDataSourceLocatorSet([
      primvarsLocator.append(HdTokens.angularVelocities),
      primvarsLocator.append(HdTokens.nonlinearSampleCount),
      new HdDataSourceLocator(_tokens.velocityMotionMode)])

    const sceneGlobalsPrimPath = HdSceneGlobalsSchema.getDefaultPrimPath()
    const timeCodesPerSecondLocator = HdSceneGlobalsSchema.getTimeCodesPerSecondLocator()

    let timeCodesPerSecondDirtied = false

    let i = 0
    for (; i < entries.length; ++i) {
      const entry = entries[i]!
      if (entry.primPath === sceneGlobalsPrimPath) {
        if (entry.dirtyLocators.contains(timeCodesPerSecondLocator)) {
          timeCodesPerSecondDirtied = true
          break
        }
      }

      if (entry.dirtyLocators.intersects(positionsAffectingLocators)) {
        break
      }
      if (entry.dirtyLocators.intersects(rotationsAffectingLocators)) {
        break
      }
    }

    if (i === entries.length) {
      this._sendPrimsDirtied(entries)
      return
    }

    const newEntries: DirtiedPrimEntry[] = entries.map((e) => ({
      primPath: e.primPath,
      dirtyLocators: new HdDataSourceLocatorSet(e.dirtyLocators),
    }))

    if (!timeCodesPerSecondDirtied) {
      for (; i < newEntries.length; ++i) {
        const entry = newEntries[i]!
        if (entry.primPath === sceneGlobalsPrimPath) {
          if (entry.dirtyLocators.contains(timeCodesPerSecondLocator)) {
            timeCodesPerSecondDirtied = true
            // Stop.
            // We will blast all prims affected by velocity motion below.
            break
          }
        }
        if (entry.dirtyLocators.intersects(positionsAffectingLocators)) {
          entry.dirtyLocators.insert(positionsLocators)
        }
        if (entry.dirtyLocators.intersects(rotationsAffectingLocators)) {
          entry.dirtyLocators.insert(rotationsLocators)
        }
      }
    }

    if (timeCodesPerSecondDirtied) {
      for (const primPath of new HdSceneIndexPrimView(this._getInputSceneIndex())) {
        if (HdsiVelocityMotionResolvingSceneIndex.primTypeSupportsVelocityMotion(
          this._getInputSceneIndex().getPrim(primPath).primType)) {
          newEntries.push({
            primPath, dirtyLocators: HdDataSourceLocatorSet.UniversalSet })
        }
      }
    }

    this._sendPrimsDirtied(newEntries)
  }
}
