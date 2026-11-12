// Ported from OpenUSD 26.11.1: pxr/usd/usd/clipSet.cpp, pxr/usd/usd/clipSet.h,
//  pxr/usd/usd/clip.cpp, pxr/usd/usd/clipSetDefinition.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Value clips — the Usd_ClipSet / Usd_Clip subset backing clip-based value
// resolution (upstream pxr/usd/usd/clip.cpp, clipSet.cpp, clipSetDefinition.cpp).
//
// Clip-set definitions are read from the composed `clips` metadata dict and
// their clip/manifest layers are acquired during asynchronous Stage.open.
// Prepared clip sets are retained by Stage per source prim index; the Usd
// resolver selects a clip and evaluates its property synchronously at query
// time.

import {
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  LayerStack as PcpLayerStack,
  Node as PcpNode,
  PrimIndex as PcpPrimIndex,
  pcpLayerPathKey,
} from 'typescript-usd/pcp'
import { usdInterpolateSamples, usdSplineResultOfValueType, usdTransformSpline } from './interpolators.ts'
import { UsdTimeCode } from './timeCode.ts'
import { _usdInterpolationIsHeld, type UsdInterpolation } from './interpolation.ts'
import {
  sdfLayerOffsetApply, sdfLayerOffsetCompose, sdfLayerOffsetInverse, type SdfLayerOffset,
} from 'typescript-usd/sdf/layerOffset'
import { sdfApplyListOpToVector, sdfNormalizeListOp } from 'typescript-usd/sdf'
import { ValueBlock as SdfValueBlock } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  applyOffsetToClipTimes, computeClipSetDefinitionsForPrimAndAncestors,
} from './clipSetDefinition.ts'
import { Array as VtArray, ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import { Duration as GfDuration, TimeCode as GfTimeCode } from 'typescript-usd/gf'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import {
  Extrapolation as TsExtrapolation, ExtrapMode as TsExtrapMode, InterpMode as TsInterpMode,
  Knot as TsKnot, Spline as TsSpline,
} from 'typescript-usd/ts'
import { Interval as GfInterval } from 'typescript-usd/gf'

// A (stageTime, value) knot pair as authored in `active`/`times`.
type Knots = readonly (readonly [number, number])[]

// Minimal layer surface the synchronous clip query needs (keeps prim.ts free
// of any typescript-usd/pcp dependency).
export interface ClipLayerLike {
  hasSpec(specPath: string): boolean
  getSpecPaths(): string[]
  getField(specPath: string, fieldName: string): unknown
}

// One clip set resolved for a prim: parsed definition + opened layers, plus
// where it was introduced (for the direct-samples-vs-clips strength check).
export interface ResolvedClipSet {
  name: string
  // Clip prim path the host prim's opinions map to inside the clip layers.
  primPath: string
  // stageTime → clip index knots (jump discontinuities at repeated times).
  active: Knots
  // stageTime → clipTime retiming knots; empty = identity mapping.
  times: Knots
  // Opened clip layers, aligned with the authored assetPaths order.
  layers: readonly (PcpLayer | null)[]
  // Opened manifest layer; null = no manifestAssetPath authored, so the
  // manifest is "generated": an attribute is declared iff some clip layer
  // authors time samples for it (Usd_GenerateClipManifest).
  manifest: PcpLayer | null
  // Namespace tail from the prim the clips dict is authored on down to the
  // composed prim ('' when they are the same prim) — clips authored on an
  // ancestor apply to its whole subtree.
  tail: string
  // (nodeIndex, layerIndex) of the introducing layer in the prim-index walk.
  position: readonly [number, number]
  // Usd_ClipSet::sourceLayerStack / sourcePrimPath (clipSet.h:160-166): the
  // site the clips were authored at. The clip set applies at every node of
  // the walk in this layer stack at or under this path (_ClipsApplyToNode,
  // stage.cpp:7183-7190), at layer position[1] (sourceLayer).
  sourceLayerStack: PcpLayerStack
  sourcePrimPath: SdfPath
  interpolateMissingClipValues: boolean
  // Usd_ClipSet::toStageOffset (clipSet.h:169): active and times are in
  // the clip set's layer time; this maps them to stage time.
  toStageOffset: SdfLayerOffset
}

// Prepared per-attribute clip source retained by Stage. The
// resolver inserts it at its exact node/layer introduction site.
export interface StageAttrClipSet {
  // Exact resolver site where this clip set is introduced. Clips are queried
  // only after the ordinary value opinion in this node/layer.
  position: readonly [number, number]
  attrPath: string
  active: Knots
  times: Knots
  layers: readonly (ClipLayerLike | null)[]
  // The authored manifest layer; null when the manifest is generated.
  manifest: ClipLayerLike | null
  interpolateMissingClipValues: boolean
  manifestDefault: unknown
  manifestBlockedTimes: ReadonlySet<number>
  // The manifest's timeSamples field is authored (even empty) and its
  // spline field, if any; together they decide whether the clips provide
  // time samples or a spline (_TimeSamplesWins / _SplineWins,
  // clipSet.cpp:33-50).
  manifestHasTimeSamples: boolean
  manifestSpline: TsSpline | undefined
  valueIsTimeCode: boolean
  valueIsDuration: boolean
  toStageOffset: SdfLayerOffset
}

// ---- Sample shapes (same normalization as pcp's valueResolution) ------------

function normalizeTimeSamples(raw: unknown): [number, unknown][] {
  if (Array.isArray(raw)) return raw as [number, unknown][]
  if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw as Record<string, unknown>)
      .map(([t, v]) => [Number(t), v] as [number, unknown])
      .sort(([a], [b]) => a - b)
  }
  return []
}

function unwrapValue(v: unknown): unknown {
  return typeof v === 'object' && v !== null && 'value' in (v as object)
    ? (v as { value: unknown }).value
    : v
}

// ---- Usd_Clip / Usd_ClipSet time-sample core ---------------------------------
//
// A faithful port of the per-clip time handling of upstream clip.cpp and
// clipSet.cpp: every clip owns an active range [startTime, endTime) and
// shares the set's time mappings (with jump discontinuities and sentinels);
// bracketing samples, listed samples and queries go through the clip that
// is active at each time, so interpolation between a clip's last sample and
// the next clip's start crosses clips exactly as upstream does
// (clipSet.cpp:691-776, stage.cpp:7447-7509, interpolators.cpp:146-196).

// Usd_ClipTimesEarliest / Usd_ClipTimesLatest (clip.h:41-42).
const CLIP_TIMES_EARLIEST = -Infinity
const CLIP_TIMES_LATEST = Infinity

// Usd_Clip::TimeMapping (clip.h).
interface TimeMapping {
  externalTime: number
  internalTime: number
  isJumpDiscontinuity: boolean
}

interface ValueClip {
  layer: ClipLayerLike | null
  authoredStartTime: number
  startTime: number
  endTime: number
}

interface BuiltClipSet {
  clips: ValueClip[]
  // Shared by every clip (empty when no `times` are authored).
  times: TimeMapping[]
}

const builtClipSets = new WeakMap<StageAttrClipSet, BuiltClipSet>()

// Usd_ClipSet::Usd_ClipSet (clipSet.cpp:396-529): the time mappings and the
// clips ordered by start time.
function builtClipSet(cs: StageAttrClipSet): BuiltClipSet {
  let built = builtClipSets.get(cs)
  if (built) return built
  const times: TimeMapping[] = cs.times.map(([externalTime, internalTime]) =>
    ({ externalTime, internalTime, isJumpDiscontinuity: false }))
  if (times.length > 0) {
    // clipSet.cpp:440-442: stable sort by external time (Array sort is stable).
    times.sort((a, b) => a.externalTime - b.externalTime)
    // clipSet.cpp:444-456: (t, a), (t, b) is held as (t - SafeStep(), a), (t, b).
    for (let i = 0; i < times.length - 1; i++) {
      if (times[i]!.externalTime === times[i + 1]!.externalTime) {
        times[i]!.externalTime -= UsdTimeCode.safeStep()
        times[i]!.isJumpDiscontinuity = true
      }
    }
    // clipSet.cpp:458-488: drop a leading jump entry and the middle entries
    // of consecutive jumps at one time.
    let prevJump = true
    for (let i = 0; i < times.length;) {
      if (prevJump && times[i]!.isJumpDiscontinuity) times.splice(i, 1)
      else { prevJump = times[i]!.isJumpDiscontinuity; i++ }
    }
    // clipSet.cpp:490-492: sentinels at both ends.
    if (times.length > 0) {
      times.unshift({ ...times[0]! })
      times.push({ ...times[times.length - 1]! })
    }
  }
  // clipSet.cpp:416-433: std::map<startTime, clip> (the last activation at a
  // start time is rejected by validation upstream; keep the first).
  const starts = new Map<number, number>()
  const active = cs.active.length > 0 ? cs.active : [[0, 0] as const]
  for (const [start, index] of active) if (!starts.has(start)) starts.set(start, index)
  const ordered = [...starts].sort(([a], [b]) => a - b)
  const clips = ordered.map(([start, index], i): ValueClip => ({
    layer: cs.layers[index] ?? null,
    authoredStartTime: start,
    startTime: i === 0 ? CLIP_TIMES_EARLIEST : start,
    endTime: i + 1 < ordered.length ? ordered[i + 1]![0] : CLIP_TIMES_LATEST,
  }))
  built = { clips, times }
  builtClipSets.set(cs, built)
  return built
}

// The clip layer's sorted (time, value) samples for the attribute.
function layerSamples(layer: ClipLayerLike | null, attrPath: string): [number, unknown][] {
  if (!layer) return []
  return normalizeTimeSamples(layer.getField(attrPath, 'timeSamples'))
    .map(([t, v]) => [t, unwrapValue(v)] as [number, unknown])
    .sort(([a], [b]) => a - b)
}

// _GetBracketingTimeSamples (clip.cpp:244-276) over sorted times.
function bracketingTimes(sorted: readonly number[], time: number): [number, number] | undefined {
  if (sorted.length === 0) return undefined
  if (time <= sorted[0]!) return [sorted[0]!, sorted[0]!]
  const last = sorted[sorted.length - 1]!
  if (time >= last) return [last, last]
  let i = sorted.findIndex(t => t >= time)
  if (sorted[i] === time) return [time, time]
  return [sorted[i - 1]!, sorted[i]!]
}

// _GetBracketingTimeSegment (clip.cpp:125-160).
function bracketingTimeSegment(times: readonly TimeMapping[], time: number): [number, number] | undefined {
  if (times.length === 0) return undefined
  if (time <= times[0]!.externalTime) return [0, 1]
  if (time >= times[times.length - 1]!.externalTime) return [times.length - 2, times.length - 1]
  const m2 = times.findIndex(m => !(m.externalTime < time))
  return [m2 - 1, m2]
}

// _TranslateTimeToInternalHelper (clip.cpp:611-633).
function toInternalHelper(ext: number, m1: TimeMapping, m2: TimeMapping): number {
  if (m1.externalTime === m2.externalTime) return m1.internalTime
  if (ext === m1.externalTime) return m1.internalTime
  if (ext === m2.externalTime) return m2.internalTime
  return (m2.internalTime - m1.internalTime) / (m2.externalTime - m1.externalTime) *
    (ext - m1.externalTime) + m1.internalTime
}

// _TranslateTimeToExternalHelper (clip.cpp:739-764).
function toExternalHelper(int: number, m1: TimeMapping, m2: TimeMapping): number {
  if (m1.internalTime === m2.internalTime) return m1.externalTime
  if (int === m1.internalTime) return m1.externalTime
  if (int === m2.internalTime) return m2.externalTime
  return (m2.externalTime - m1.externalTime) / (m2.internalTime - m1.internalTime) *
    (int - m1.internalTime) + m1.externalTime
}

const mapping = (externalTime: number, internalTime: number): TimeMapping =>
  ({ externalTime, internalTime, isJumpDiscontinuity: false })

// Usd_Clip::_TranslateTimeToInternal (clip.cpp:635-737). Also reports the
// segment whose linear map converts time-valued clip values.
function translateTimeToInternal(
  times: readonly TimeMapping[], ext: number, isPreTime: boolean,
): { internal: number, m1: TimeMapping, m2: TimeMapping } {
  const segment = bracketingTimeSegment(times, ext)
  if (!segment) return { internal: ext, m1: mapping(0, 0), m2: mapping(1, 1) }
  const [i1, i2] = segment
  const m1 = times[i1]!, m2 = times[i2]!
  if (isPreTime && m1.isJumpDiscontinuity) {
    return {
      internal: m1.internalTime,
      ...(i1 > 0
        ? { m1: times[i1 - 1]!, m2: mapping(m2.externalTime, m1.internalTime) }
        : { m1, m2 }),
    }
  }
  if (m2.isJumpDiscontinuity) {
    const m2Sub = mapping(times[i2 + 1]!.externalTime, m2.internalTime)
    return { internal: toInternalHelper(ext, m1, m2Sub), m1, m2: m2Sub }
  }
  const n = times.length
  let r1 = i1, r2 = i2
  if (m1.isJumpDiscontinuity && i2 + 1 < n) { r1 = i2; r2 = i2 + 1 }
  else if (i1 === 0 && n >= 3) { r1 = 1; r2 = 2 }
  else if (i2 === n - 1 && n >= 3) { r1 = n - 3; r2 = n - 2 }
  let rm2 = times[r2]!
  if (rm2.isJumpDiscontinuity && r2 + 1 < n) rm2 = mapping(times[r2 + 1]!.externalTime, rm2.internalTime)
  return { internal: toInternalHelper(ext, m1, m2), m1: times[r1]!, m2: rm2 }
}

// Usd_Clip::_TranslateTimeToExternal (clip.cpp:779-819).
function translateTimeToExternal(times: readonly TimeMapping[], int: number, i1: number, i2: number): number {
  const m1 = times[i1]!, m2 = times[i2]!
  if (m2.isJumpDiscontinuity) {
    return toExternalHelper(int, m1, mapping(times[i2 + 1]!.externalTime, m2.internalTime))
  }
  return toExternalHelper(int, m1, m2)
}

// Usd_Clip::_GetBracketingTimeSamplesForPathFromClipLayer (clip.cpp:277-425).
function clipLayerBracketing(
  times: readonly TimeMapping[], samples: readonly [number, unknown][], time: number,
): [number, number] | undefined {
  const timeInClip = translateTimeToInternal(times, time, false).internal
  const inClip = bracketingTimes(samples.map(([t]) => t), timeInClip)
  if (!inClip) return undefined
  const [lowerInClip, upperInClip] = inClip
  const segment = bracketingTimeSegment(times, time)
  if (!segment) return inClip
  const [m1, m2] = segment
  let translatedLower: number | undefined, translatedUpper: number | undefined
  const canTranslate = (i1: number, i2: number, translatingLower: boolean): boolean => {
    const map1 = times[i1]!, map2 = times[i2]!
    if (map1.isJumpDiscontinuity) return false
    const timeInClip = translatingLower ? lowerInClip : upperInClip
    const lower = Math.min(map1.internalTime, map2.internalTime)
    const upper = Math.max(map1.internalTime, map2.internalTime)
    let translated: number | undefined
    if (lower <= timeInClip && timeInClip <= upper) {
      if (map1.internalTime !== map2.internalTime) {
        translated = translateTimeToExternal(times, timeInClip, i1, i2)
      } else {
        const lowerUpperMatch = lowerInClip === upperInClip
        if (lowerUpperMatch && time === map1.externalTime) translated = map1.externalTime
        else if (lowerUpperMatch && time === map2.externalTime) translated = map2.externalTime
        else translated = translatingLower ? map1.externalTime : map2.externalTime
      }
    }
    if (translatingLower) translatedLower = translated
    else translatedUpper = translated
    return translated !== undefined
  }
  for (let i1 = m1, i2 = m2; i1 >= 0 && i2 >= 0; --i1, --i2) {
    if (canTranslate(i1, i2, true)) break
  }
  for (let i1 = m1, i2 = m2; i1 < times.length && i2 < times.length; ++i1, ++i2) {
    if (canTranslate(i1, i2, false)) break
  }
  if (translatedLower !== undefined && translatedUpper === undefined) translatedUpper = translatedLower
  else if (translatedLower === undefined && translatedUpper !== undefined) translatedLower = translatedUpper
  else if (translatedLower === undefined && translatedUpper === undefined) {
    const front = times[0]!, back = times[times.length - 1]!
    if (lowerInClip < front.internalTime) translatedLower = front.externalTime
    else if (lowerInClip > back.internalTime) translatedLower = back.externalTime
    if (upperInClip < front.internalTime) translatedUpper = front.externalTime
    else if (upperInClip > back.internalTime) translatedUpper = back.externalTime
  }
  // Deliberate divergence: when neither internal time maps through any
  // non-jump segment and both lie inside the mappings' internal range (a clip
  // whose samples fall only under jump segments), upstream dereferences empty
  // optionals (clip.cpp:422-423); here the clip layer contributes no
  // bracketing times, leaving the time mappings and start time to bracket.
  if (translatedLower === undefined || translatedUpper === undefined) return undefined
  return [translatedLower, translatedUpper]
}

// Usd_Clip::GetBracketingTimeSamplesForPath (clip.cpp:427-480).
function clipBracketing(
  clip: ValueClip, times: readonly TimeMapping[], attrPath: string, time: number,
): [number, number] | undefined {
  const candidates: number[] = []
  const fromLayer = clipLayerBracketing(times, layerSamples(clip.layer, attrPath), time)
  if (fromLayer) candidates.push(...fromLayer)
  const fromTimes = bracketingTimes(times.map(m => m.externalTime), time)
  if (fromTimes) candidates.push(...fromTimes)
  candidates.push(clip.authoredStartTime)
  const inRange = candidates.filter(t => !(t < clip.startTime || t >= clip.endTime))
  if (inRange.length === 0) return undefined
  if (inRange.length === 1) return [inRange[0]!, inRange[0]!]
  return bracketingTimes([...new Set(inRange)].sort((a, b) => a - b), time)
}

// Usd_Clip::ListTimeSamplesForPath (clip.cpp:492-583).
function clipListTimeSamples(
  clip: ValueClip, times: readonly TimeMapping[], attrPath: string,
): Set<number> {
  const result = new Set<number>()
  const inClipRange = (t: number) => clip.startTime <= t && t < clip.endTime
  const internal = layerSamples(clip.layer, attrPath).map(([t]) => t)
  if (times.length === 0) {
    for (const t of internal) if (inClipRange(t)) result.add(t)
  } else {
    for (const t of internal) {
      for (let i = 0; i < times.length - 1; i++) {
        const m1 = times[i]!, m2 = times[i + 1]!
        // GfInterval(m1.ext, m2.ext) (closed) intersects [startTime, endTime).
        if (!(m1.externalTime < clip.endTime && m2.externalTime >= clip.startTime)) continue
        if (m1.isJumpDiscontinuity) continue
        if (Math.min(m1.internalTime, m2.internalTime) <= t &&
            t <= Math.max(m1.internalTime, m2.internalTime)) {
          if (m1.internalTime === m2.internalTime) {
            if (inClipRange(m1.externalTime)) result.add(m1.externalTime)
            if (inClipRange(m2.externalTime)) result.add(m2.externalTime)
          } else {
            const ext = translateTimeToExternal(times, t, i, i + 1)
            if (inClipRange(ext)) result.add(ext)
          }
        }
      }
    }
  }
  for (const m of times) if (inClipRange(m.externalTime)) result.add(m.externalTime)
  result.add(clip.authoredStartTime)
  return result
}

// Usd_ClipSet::_ClipContributesTimeSamples (clipSet.cpp:664-688).
function clipContributesTimeSamples(cs: StageAttrClipSet, clip: ValueClip): boolean {
  if (!cs.interpolateMissingClipValues) return true
  // _ClipContainsAuthoredValueForAttribute (clipSet.cpp:622-662).
  if (!cs.manifestBlockedTimes.has(clip.authoredStartTime) &&
      layerSamples(clip.layer, cs.attrPath).length > 0) return true
  return cs.manifestDefault !== undefined
}

// Usd_ClipSet::_FindClipIndexForTime (clipSet.cpp:1152-1190).
function findClipIndexForTime(clips: readonly ValueClip[], time: number): number {
  let index = 0
  for (let i = 1; i < clips.length; i++) {
    if (time < clips[i]!.startTime) break
    index = i
  }
  return index
}

// Usd_ClipSet::GetActiveClip (clipSet.h:68-77).
function activeClip(clips: readonly ValueClip[], time: number, isPreTime: boolean): ValueClip {
  const index = findClipIndexForTime(clips, time)
  if (index > 0 && isPreTime && clips[index]!.startTime === time) return clips[index - 1]!
  return clips[index]!
}

// Usd_ClipSet::GetBracketingTimeSamplesForPath (clipSet.cpp:690-776).
function clipSetBracketing(cs: StageAttrClipSet, time: number): [number, number] {
  const { clips, times } = builtClipSet(cs)
  let foundLower = false, foundUpper = false
  let lower = 0, upper = 0
  const clipIndex = findClipIndexForTime(clips, time)
  const active = clips[clipIndex]!
  if (clipContributesTimeSamples(cs, active)) {
    const bracket = clipBracketing(active, times, cs.attrPath, time)
    if (bracket) {
      [lower, upper] = bracket
      foundLower = true
      // clipSet.cpp:706-724: past the last sample in the active clip's range,
      // the upper sample is the next contributing clip's start time.
      foundUpper = !(lower === upper && time > upper)
    }
  }
  for (let i = clipIndex; !foundLower && i-- !== 0;) {
    const clip = clips[i]!
    if (!clipContributesTimeSamples(cs, clip)) continue
    const bracket = clipBracketing(clip, times, cs.attrPath, time)
    if (!bracket) return [clips[0]!.authoredStartTime, clips[0]!.authoredStartTime]
    foundLower = true
    lower = bracket[1]
  }
  for (let i = clipIndex + 1; !foundUpper && i < clips.length; i++) {
    const clip = clips[i]!
    if (!clipContributesTimeSamples(cs, clip)) continue
    upper = clip.startTime
    foundUpper = true
  }
  if (foundLower && !foundUpper) upper = lower
  else if (!foundLower && foundUpper) lower = upper
  else if (!foundLower && !foundUpper) lower = upper = clips[0]!.authoredStartTime
  return [lower, upper]
}

// Usd_ClipSet::_HasJumpDiscontinuityAtTime (clipSet.cpp:813-832).
function clipSetHasJumpDiscontinuityAtTime(cs: StageAttrClipSet, time: number): boolean {
  const { times } = builtClipSet(cs)
  const i = times.findIndex(m => !(m.externalTime < time))
  return i > 0 && times[i]!.externalTime === time && times[i - 1]!.isJumpDiscontinuity
}

// Usd_ClipSet::GetPreviousTimeSampleForPath (clipSet.cpp:779-811).
function clipSetPreviousTimeSample(cs: StageAttrClipSet, time: number): number | undefined {
  const all = _clipTimeSamples(cs)
  if (all.length === 0 || time <= all[0]!) return undefined
  if (time > all[all.length - 1]!) return all[all.length - 1]!
  return all[all.findIndex(t => !(t < time)) - 1]
}

// Usd_Clip::QueryTimeSample (clip.cpp:1176-1206) through
// Usd_ClipSet::QueryTimeSample (clipSet.h:204-220): the active clip's value
// at the translated time (interpolated inside the clip when the clip has no
// sample there), else the manifest's non-blocked default.
function clipSetQueryTimeSample(
  cs: StageAttrClipSet, time: number, isPreTime: boolean,
  interpolation: UsdInterpolation | undefined, typeName: string | undefined,
): unknown {
  const { clips, times } = builtClipSet(cs)
  const clip = activeClip(clips, time, isPreTime)
  const samples = layerSamples(clip.layer, cs.attrPath)
  if (samples.length > 0) {
    const { internal, m1, m2 } = translateTimeToInternal(times, time, isPreTime)
    const exact = samples.find(([t]) => t === internal)
    const value = exact ? exact[1] : usdInterpolateSamples(samples, internal, interpolation, false, typeName)
    return convertClipValue(cs, value, m1, m2)
  }
  const fallback = cs.manifestDefault
  return fallback instanceof SdfValueBlock ? undefined : unwrapValue(fallback)
}

// stage.cpp:7447-7509 (_GetInterpolatingClipSamples) and
// interpolators.cpp:146-196 (_GetInterpolatingSamplesImpl), then
// Usd_Interpolate between the clip set's bracketing samples.
function _clipValueAtTime(
  cs: StageAttrClipSet, time: number, interpolation?: UsdInterpolation,
  isPreTime = false, typeName?: string,
): unknown {
  let [lower, upper] = clipSetBracketing(cs, time)
  if (isPreTime && lower === upper) {
    if (clipSetHasJumpDiscontinuityAtTime(cs, lower)) {
      return clipSetQueryTimeSample(cs, lower, true, interpolation, typeName)
    }
    lower = clipSetPreviousTimeSample(cs, time) ?? upper
  }
  const query = (t: number) => clipSetQueryTimeSample(cs, t, false, interpolation, typeName)
  if (_usdInterpolationIsHeld(interpolation) || Math.abs(lower - upper) < 1e-6) {
    return query(lower)
  }
  const lowerValue = query(lower)
  if (lowerValue === undefined || lowerValue instanceof SdfValueBlock) return undefined
  const upperValue = query(upper)
  if (upperValue === undefined) return lowerValue
  // Usd_Interpolate over the two samples (interpolators.cpp:110-143): at a
  // pre-time query on the upper sample (alpha 1) a type that does not
  // interpolate keeps the lower sample.
  return usdInterpolateSamples([[lower, lowerValue], [upper, upperValue]], time,
    interpolation, isPreTime, typeName)
}

// _ConvertValueForTime (clip.cpp:930-1097): time codes take the segment's
// full linear map, durations its scale.
function convertClipValue(cs: StageAttrClipSet, value: unknown, m1: TimeMapping, m2: TimeMapping): unknown {
  let convert: ((item: unknown) => unknown) | undefined
  if (cs.valueIsTimeCode) {
    convert = item => item instanceof GfTimeCode
      ? new GfTimeCode(toExternalHelper(item.GetValue(), m1, m2))
      : typeof item === 'number' ? toExternalHelper(item, m1, m2) : item
  } else if (cs.valueIsDuration) {
    const scale = m1.internalTime === m2.internalTime ? 1
      : (m2.externalTime - m1.externalTime) / (m2.internalTime - m1.internalTime)
    convert = item => item instanceof GfDuration || typeof item === 'number'
      ? new GfDuration(Number(item) * scale) : item
  }
  if (!convert) return value
  if (value instanceof VtArray) return new VtArray(value.toArray().map(convert), value.getElementType())
  if (Array.isArray(value)) return value.map(convert)
  return convert(value)
}

// Whether any clip layer authors an array edit sample for the attribute:
// such clip values compose over weaker opinions (VtValue::CanComposeOver,
// used per sample by stage.cpp's resolvers). A layer's summary of its sample
// value kinds settles the common case (only numbers, strings and arrays)
// without reading the samples.
export function clipSetValuesMayCompose(cs: StageAttrClipSet): boolean {
  return cs.layers.some(layer => {
    if (!layer) return false
    const kinds = (layer as { _getTimeSampleValueKinds?: (path: string) => { others: boolean } })
      ._getTimeSampleValueKinds?.(cs.attrPath)
    if (kinds && !kinds.others) return false
    return layerSamples(layer, cs.attrPath).some(([, value]) => value instanceof VtArrayEdit)
  })
}

// Usd_ClipSet::ListTimeSamplesForPath (clipSet.cpp:834-856).
function _clipTimeSamples(cs: StageAttrClipSet): number[] {
  const { clips, times } = builtClipSet(cs)
  const result = new Set<number>()
  for (const clip of clips) {
    if (!clipContributesTimeSamples(cs, clip)) continue
    for (const t of clipListTimeSamples(clip, times, cs.attrPath)) result.add(t)
  }
  if (result.size === 0) result.add(clips[0]!.authoredStartTime)
  return [...result].sort((a, b) => a - b)
}

// _GetClipLayer (stage.cpp:7716-7732): the layer a clip value at `time`
// comes from, which anchors its asset paths: the active clip's layer when it
// authors samples or a spline for the attribute, else the manifest's (null
// for a generated manifest, whose layer is anonymous).
function _clipLayerForValueAt(
  cs: StageAttrClipSet, time: number, isPreTime: boolean,
): ClipLayerLike | null {
  const { clips } = builtClipSet(cs)
  const layer = activeClip(clips, time, isPreTime).layer
  const spline = layer?.getField(cs.attrPath, 'spline')
  const hasAuthoredValues = layerSamples(layer, cs.attrPath).length > 0 ||
    (spline !== undefined && spline !== null)
  return hasAuthoredValues ? layer : cs.manifest
}

// _ValueFromClipsMightBeTimeVarying (stage.cpp:9698-9724): with one clip
// active over all time, the value varies only if that clip lists more than
// one time sample for the attribute (Usd_Clip::GetNumTimeSamplesForPath,
// clip.cpp:483-490); with several clips it might vary.
export function clipSetValueMightBeTimeVarying(cs: StageAttrClipSet): boolean {
  const { clips, times } = builtClipSet(cs)
  if (clips.length === 1) {
    // All splines might be time varying.
    if (clipSetContainsSpline(cs)) return true
    return clipListTimeSamples(clips[0]!, times, cs.attrPath).size > 1
  }
  return true
}

// The clip active at a stage time.
function activeClipAtTime(cs: StageAttrClipSet, time: number): ValueClip {
  const { clips } = builtClipSet(cs)
  return clips[findClipIndexForTime(clips, time)]!
}

// ---- Splines in clips ------------------------------------------------------

function layerSpline(layer: ClipLayerLike | null, attrPath: string): TsSpline | undefined {
  const value = layer?.getField(attrPath, 'spline')
  return value instanceof TsSpline ? value : undefined
}

/**
 * Usd_ClipSet::ContainsSplineForAttribute (clipSet.cpp:605-620): the clips
 * provide a spline rather than time samples when the manifest authors a
 * spline and no timeSamples field (_SplineWins, clipSet.cpp:43-50).
 */
export function clipSetContainsSpline(cs: StageAttrClipSet): boolean {
  return cs.manifestSpline !== undefined && !cs.manifestHasTimeSamples
}

// Usd_ClipSet::_ClipContainsAuthoredValueForAttribute, spline branch
// (clipSet.cpp:645-660): a manifest knot that blocks at the clip's start
// time hides the clip's spline.
function clipContainsAuthoredSpline(cs: StageAttrClipSet, clip: ValueClip): boolean {
  const knot = cs.manifestSpline?.getKnot(clip.authoredStartTime)
  if (knot && knot.getNextInterpolation() === TsInterpMode.ValueBlock) return false
  return layerSpline(clip.layer, cs.attrPath) !== undefined
}

// Usd_QuerySpline (valueUtils.cpp:20-96): Eval, or EvalPreValue at a
// pre-time; undefined is a value block.
function querySpline(spline: TsSpline, time: number, isPreTime: boolean): number | undefined {
  return usdSplineResultOfValueType(
    spline, isPreTime ? spline.evalPreValue(time) : spline.eval(time))
}

// The manifest default as Usd_HasDefault finds it (undefined unless a
// non-blocked default is authored).
function manifestDefaultValue(cs: StageAttrClipSet): unknown {
  const value = unwrapValue(cs.manifestDefault)
  return value instanceof SdfValueBlock || value === null ? undefined : value
}

// The UsdTimeCode overload of _GetBracketingTimeSegment (clip.cpp:166-197):
// at a mapping's own external time, a pre-time query takes the segment
// before a jump discontinuity and a regular query the segment after.
function bracketingTimeSegmentAtTimeCode(
  times: readonly TimeMapping[], time: number, isPreTime: boolean,
): [number, number] | undefined {
  const segment = bracketingTimeSegment(times, time)
  if (!segment) return undefined
  let [m1, m2] = segment
  if (times[m2]!.externalTime === time) {
    if (isPreTime && m1 > 0 && times[m1]!.isJumpDiscontinuity) {
      m1--
      m2--
    } else if (m2 < times.length - 1) {
      m1++
      m2++
    }
  }
  return [m1, m2]
}

// Usd_Clip::_TranslateTimeToInternalDualValued (clip.cpp:821-857).
function translateTimeToInternalDualValued(
  times: readonly TimeMapping[], ext: number, isPreTime: boolean,
): { internal: number, isPreTime: boolean, m1: TimeMapping, m2: TimeMapping } {
  let localPreTime = isPreTime
  // The external time stays a pre-time unless it is clamped to the times.
  let extIsPreTime = isPreTime
  const segment = bracketingTimeSegmentAtTimeCode(times, ext, isPreTime)
  if (segment && times[segment[0]]!.internalTime > times[segment[1]]!.internalTime) {
    localPreTime = !localPreTime
  }
  if (times.length > 0) {
    if (times[0]!.externalTime > ext) {
      ext = times[0]!.externalTime
      localPreTime = extIsPreTime = false
    } else if (times[times.length - 1]!.externalTime < ext) {
      ext = times[times.length - 1]!.externalTime
      localPreTime = extIsPreTime = false
    }
  }
  const { internal, m1, m2 } = translateTimeToInternal(times, ext, extIsPreTime)
  return { internal, isPreTime: localPreTime, m1, m2 }
}

// Usd_Clip::QuerySpline (clip.cpp:1229-1258).
function clipQuerySpline(
  cs: StageAttrClipSet, clip: ValueClip, times: readonly TimeMapping[],
  time: number, isPreTime: boolean,
): number | undefined {
  const spline = layerSpline(clip.layer, cs.attrPath)
  if (!spline) return undefined
  const { internal, isPreTime: localPreTime, m1, m2 } =
    translateTimeToInternalDualValued(times, time, isPreTime)
  const value = querySpline(spline, internal, localPreTime)
  return value === undefined ? undefined : convertClipValue(cs, value, m1, m2) as number
}

/**
 * Usd_ClipSet::QuerySpline (clipSet.cpp:929-1024): the active clip's spline
 * value, else the manifest default, else (with interpolateMissingClipValues)
 * the neighbouring clips' values held or interpolated. Undefined is a block.
 */
function _clipSetQuerySpline(
  cs: StageAttrClipSet, time: number, isPreTime: boolean,
): unknown {
  const { clips, times } = builtClipSet(cs)
  const active = activeClip(clips, time, isPreTime)
  if (clipContainsAuthoredSpline(cs, active)) {
    return clipQuerySpline(cs, active, times, time, isPreTime)
  }
  const fallback = manifestDefaultValue(cs)
  if (fallback !== undefined) return fallback
  if (!cs.interpolateMissingClipValues) return undefined
  const activeIdx = clips.indexOf(active)
  let next: [number, number | undefined] | undefined
  for (let i = activeIdx + 1; i < clips.length; ++i) {
    const clip = clips[i]!
    if (clipContainsAuthoredSpline(cs, clip)) {
      next = [clip.startTime, clipQuerySpline(cs, clip, times, clip.startTime, false)]
      break
    }
  }
  let prev: [number, number | undefined] | undefined
  for (let i = activeIdx; i !== 0;) {
    const clip = clips[--i]!
    if (clipContainsAuthoredSpline(cs, clip)) {
      // A clip's last contributed value is at the pre-time of its end.
      prev = [clip.endTime, clipQuerySpline(cs, clip, times, clip.endTime, true)]
      break
    }
  }
  const nextBlock = next !== undefined && next[1] === undefined
  const prevBlock = prev !== undefined && prev[1] === undefined
  if ((!next && !prev) || prevBlock || (!prev && nextBlock)) return undefined
  if (prev && (!next || nextBlock)) return prev[1]
  if (next && !prev) return next[1]
  return usdInterpolateSamples([[prev![0], prev![1]], [next![0], next![1]]], time, 'linear')
}

// _MakeHeldSpline (clip.cpp:1123-1160).
function makeHeldSpline(
  clipSpline: TsSpline, sectionStart: number, sectionEnd: number, clipQueryTime: number,
): TsSpline {
  const valueType = clipSpline.GetValueType()
  const spline = new TsSpline(valueType)
  const knot = new TsKnot(valueType)
  const knotValue = querySpline(clipSpline, clipQueryTime, false)
  const hasValue = knotValue !== undefined
  if (sectionStart === CLIP_TIMES_EARLIEST) {
    spline.setPreExtrapolation(new TsExtrapolation(hasValue ? TsExtrapMode.Held : TsExtrapMode.ValueBlock))
  } else {
    knot.SetTime(sectionStart)
    if (hasValue) knot.setValue(knotValue)
    else knot.setNextInterpolation(TsInterpMode.ValueBlock)
    spline.setKnot(knot)
  }
  if (sectionEnd === CLIP_TIMES_LATEST) {
    spline.setPostExtrapolation(new TsExtrapolation(hasValue ? TsExtrapMode.Held : TsExtrapMode.ValueBlock))
  } else {
    knot.SetTime(sectionEnd)
    if (hasValue) knot.setValue(knotValue)
    spline.setKnot(knot)
  }
  return spline
}

// Usd_Clip::BuildSpline (clip.cpp:1275-1430): the clip's spline over its
// active range, retimed section by section through the time mappings.
function clipBuildSpline(
  cs: StageAttrClipSet, clip: ValueClip, times: readonly TimeMapping[],
): TsSpline | undefined {
  const clipSpline = layerSpline(clip.layer, cs.attrPath)
  if (!clipSpline) return undefined
  const { startTime, endTime } = clip
  if (clipSpline.IsEmpty()) return makeHeldSpline(clipSpline, startTime, endTime, 0)
  if (times.length === 0) {
    return clipSpline.getTruncated(
      new GfInterval(startTime, endTime, startTime !== CLIP_TIMES_EARLIEST, false))
  }
  const toInternal = (ext: number, isPreTime = false): number =>
    translateTimeToInternal(times, ext, isPreTime).internal
  const splines: TsSpline[] = []
  // std::upper_bound by external time.
  let it = times.findIndex(m => m.externalTime > startTime)
  if (it < 0) it = times.length
  let extSectionStart = startTime
  let clipSectionStart = toInternal(extSectionStart)
  if (it === 0) {
    // A section before the times: held. The first mapping is repeated.
    ++it
    const extSectionEnd = Math.min(times[it]!.externalTime, endTime)
    const queryTime = times[it]!.internalTime
    splines.push(makeHeldSpline(clipSpline, extSectionStart, extSectionEnd, queryTime))
    extSectionStart = extSectionEnd
    clipSectionStart = queryTime
    it++
  } else if (it !== times.length) {
    it--
    extSectionStart = Math.max(times[it]!.externalTime, startTime)
    clipSectionStart = toInternal(extSectionStart)
    it++
  }
  // Each pass builds [extSectionStart, extSectionEnd); the last mapping is a
  // sentinel.
  while (times.length - it > 1 && endTime > extSectionStart) {
    const mapping = times[it]!
    const extTime = mapping.isJumpDiscontinuity ? times[it + 1]!.externalTime : mapping.externalTime
    const extSectionEnd = Math.min(extTime, endTime)
    const clipSectionEnd = toInternal(extSectionEnd, mapping.isJumpDiscontinuity)
    let spline: TsSpline
    if (clipSectionEnd === clipSectionStart) {
      spline = makeHeldSpline(clipSpline, extSectionStart, extSectionEnd, clipSectionStart)
    } else {
      const clipTimeStart = Math.min(clipSectionStart, clipSectionEnd)
      const clipTimeEnd = Math.max(clipSectionStart, clipSectionEnd)
      spline = clipSpline.getTruncated(
        new GfInterval(clipTimeStart, clipTimeEnd, clipTimeStart !== CLIP_TIMES_EARLIEST, false),
        new TsExtrapolation(TsExtrapMode.Held), new TsExtrapolation(TsExtrapMode.Held))
      const timeScale = (extSectionEnd - extSectionStart) / (clipSectionEnd - clipSectionStart)
      const timeOffset = extSectionStart - timeScale * clipSectionStart
      spline = spline.getTimeScaled(timeScale, timeOffset)
      // Concatenate needs boundary knots at exactly the section times.
      const knots = spline.getKnots()
      const startKnot = knots[0]!.clone()
      if (startKnot.getTime() !== extSectionStart) {
        spline.removeKnot(startKnot.getTime())
        startKnot.SetTime(extSectionStart)
        spline.setKnot(startKnot)
      }
      const endKnot = knots[knots.length - 1]!.clone()
      if (endKnot.getTime() !== extSectionEnd) {
        spline.removeKnot(endKnot.getTime())
        endKnot.SetTime(extSectionEnd)
        spline.setKnot(endKnot)
      }
    }
    splines.push(spline)
    if (mapping.isJumpDiscontinuity) {
      it++
      extSectionStart = times[it]!.externalTime
      clipSectionStart = times[it]!.internalTime
    } else {
      extSectionStart = extSectionEnd
      clipSectionStart = clipSectionEnd
    }
    it++
  }
  if (it + 1 >= times.length && endTime > extSectionStart) {
    // A section after the times: held.
    splines.push(makeHeldSpline(clipSpline, extSectionStart, endTime, clipSectionStart))
  }
  if (splines.length === 0) return undefined
  return splines.length === 1 ? splines[0] : TsSpline.concatenate(splines)
}

/**
 * Usd_ClipSet::BuildSpline (clipSet.cpp:1033-1150): the clips' splines
 * concatenated, with held, blocked or interpolating spans for clips that
 * author none.
 */
function _clipSetBuildSpline(cs: StageAttrClipSet): TsSpline | undefined {
  if (!cs.manifestSpline) return undefined
  const valueType = cs.manifestSpline.GetValueType()
  const { clips, times } = builtClipSet(cs)
  const splines: TsSpline[] = []
  let startKnot = new TsKnot(valueType)
  let hasPendingKnot = false
  let holdPreExtrap = false
  for (const clip of clips) {
    const spline = clipContainsAuthoredSpline(cs, clip) ? clipBuildSpline(cs, clip, times) : undefined
    if (spline) {
      if (hasPendingKnot) {
        const pendingSpline = new TsSpline(valueType)
        const endKnot = new TsKnot(valueType)
        endKnot.SetTime(clip.startTime)
        if (startKnot.getNextInterpolation() === TsInterpMode.Linear) {
          const value = spline.eval(clip.startTime)
          if (value !== undefined) endKnot.setPreValue(value)
          else startKnot.setNextInterpolation(TsInterpMode.Held)
        } else if (startKnot.getNextInterpolation() === TsInterpMode.ValueBlock &&
                   splines.length === 0) {
          pendingSpline.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.ValueBlock))
        }
        pendingSpline.setKnots([startKnot, endKnot])
        splines.push(pendingSpline)
        hasPendingKnot = false
      }
      splines.push(spline)
      continue
    }
    if (hasPendingKnot) continue
    startKnot = new TsKnot(valueType)
    startKnot.SetTime(clip.authoredStartTime)
    const defaultValue = manifestDefaultValue(cs)
    if (defaultValue !== undefined) {
      startKnot.setValue(Number(defaultValue))
      hasPendingKnot = true
    } else if (!cs.interpolateMissingClipValues) {
      startKnot.setNextInterpolation(TsInterpMode.ValueBlock)
      hasPendingKnot = true
    } else if (splines.length === 0) {
      holdPreExtrap = true
    } else {
      const value = splines[splines.length - 1]!.evalPreValue(clip.startTime)
      if (value !== undefined) {
        startKnot.setValue(value)
        startKnot.setNextInterpolation(TsInterpMode.Linear)
      } else {
        startKnot.setNextInterpolation(TsInterpMode.ValueBlock)
      }
      hasPendingKnot = true
    }
  }
  if (hasPendingKnot) {
    const spline = new TsSpline(valueType)
    spline.setKnot(startKnot)
    if (startKnot.getNextInterpolation() === TsInterpMode.ValueBlock) {
      spline.setPostExtrapolation(new TsExtrapolation(TsExtrapMode.ValueBlock))
      if (splines.length === 0) spline.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.ValueBlock))
    }
    splines.push(spline)
  }
  if (splines.length > 0 && holdPreExtrap) {
    splines[0]!.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.Held))
  }
  return TsSpline.concatenate(splines)
}

// ---- Resolving the clip sets that affect a prim (async: opens layers) -------

function manifestBlocksWholeClip(
  manifest: PcpLayer | null, primPath: string, tail: string,
  starts: readonly number[],
): boolean {
  if (!manifest || starts.length === 0) return false
  const prefix = `${primPath}${tail}.`
  const properties = manifest.getSpecPaths().filter(path => path.startsWith(prefix))
  if (properties.length === 0) return false
  return properties.every(path => {
    const blocked = new Set(normalizeTimeSamples(manifest.getField(path, 'timeSamples'))
      .filter(([, value]) => value instanceof SdfValueBlock ||
        value === null || value === undefined)
      .map(([time]) => time))
    return starts.every(start => blocked.has(start))
  })
}

// Usd_Clip::_GetLayerForClip (clip.cpp:873-905): a clip layer that cannot be
// opened is reported with a warning and stands in as an empty layer (null
// here). Upstream opens the layer at first use; clip layers open here when
// the clip set is resolved.
async function openClipLayer(
  opener: PcpLayerOpener, resolved: string, assetPath: string,
): Promise<PcpLayer | null> {
  const layer = resolved ? await opener(resolved) : null
  if (layer) return layer
  TfDiagnosticMgr.GetInstance().postWarning(`Unable to open clip layer @${assetPath}@`)
  return null
}

// Prim-path ancestor chain of `path` (a layer-scene prim key), nearest first,
// including `path` itself, up to and including the root prim.
export async function resolveClipSetsForPrimIndex(
  index: PcpPrimIndex, opener: PcpLayerOpener, maxLevel = Infinity,
): Promise<ResolvedClipSet[] | undefined> {
  const definitions = computeClipSetDefinitionsForPrimAndAncestors(index, maxLevel)
  if (!definitions) return undefined

  const out: ResolvedClipSet[] = []
  for (const {
    name, def: composedDef, anchorLayer, tail, position, timeOffset, timesOffset,
    sourceLayerStack, sourcePrimPath,
  } of definitions) {
    let def = composedDef
    const openedTemplateClips = new Map<string, PcpLayer>()
    if (def.templateClips) {
      // _DeriveClipInfo (clipSetDefinition.cpp:244-298) keeps the template
      // times whose asset resolves, numbering activations in that order;
      // the leading and trailing activeOffset knots join the times. Here an
      // asset that opens counts as resolved. The anchor's layer offset then
      // applies to the derived active and times, as to authored ones.
      const { candidates, leadingTime, trailingTime } = def.templateClips
      const assetPaths: string[] = []
      const active: [number, number][] = []
      const times: [number, number][] = []
      if (leadingTime !== undefined) times.push([leadingTime, leadingTime])
      for (const candidate of candidates) {
        const resolved = anchorLayer.resolveAsset(candidate.assetPath)
        const layer = resolved ? await opener(resolved) : null
        if (!layer) continue
        openedTemplateClips.set(candidate.assetPath, layer)
        times.push([candidate.clipTime, candidate.clipTime])
        active.push([candidate.activeTime, assetPaths.length])
        assetPaths.push(candidate.assetPath)
      }
      if (trailingTime !== undefined) times.push([trailingTime, trailingTime])
      // Derived active and times stay in layer time (toStageOffset maps
      // them); times authored under another layer offset are transformed
      // (clipSetDefinition.cpp:663-669).
      def = { ...def, assetPaths, active, times: applyOffsetToClipTimes(timeOffset, timesOffset, times) }
    }
    // Usd_ClipSet::New (clipSet.cpp:356-363): assetPaths, primPath and
    // active are required.
    if (!def.primPath || !def.assetPaths || def.assetPaths.length === 0 || !def.active) continue
    let manifest: PcpLayer | null = null
    if (def.manifestAssetPath) {
      const resolved = anchorLayer.resolveAsset(def.manifestAssetPath)
      manifest = await openClipLayer(opener, resolved, def.manifestAssetPath)
    }
    const active: [number, number][] = def.active
    // Usd_ClipSet stable-sorts the authored times by stage time, keeping the
    // relative order of knots at one stage time (a jump discontinuity), before
    // jump detection (clipSet.cpp:440-445). Array.prototype.sort is stable.
    const times = def.times?.length ? [...def.times].sort((a, b) => a[0] - b[0]) : []
    const layers: (PcpLayer | null)[] = []
    for (let index = 0; index < def.assetPaths.length; index++) {
      const starts = active.filter(([, clipIndex]) => clipIndex === index).map(([start]) => start)
      if (def.interpolateMissingClipValues === true &&
          manifestBlocksWholeClip(manifest, def.primPath, tail, starts)) {
        layers.push(null)
        continue
      }
      const opened = openedTemplateClips.get(def.assetPaths[index]!)
      if (opened) {
        layers.push(opened)
        continue
      }
      const resolved = anchorLayer.resolveAsset(def.assetPaths[index]!)
      layers.push(await openClipLayer(opener, resolved, def.assetPaths[index]!))
    }
    out.push({
      name,
      primPath: def.primPath,
      active,
      times,
      layers,
      manifest,
      tail,
      position,
      sourceLayerStack,
      sourcePrimPath: SdfPath.fromString(sourcePrimPath),
      interpolateMissingClipValues: def.interpolateMissingClipValues === true,
      toStageOffset: timeOffset,
    })
  }
  return out.length > 0 ? out : undefined
}

// ---- Preparing clips for query-time resolution ------------------------------

// Usd_ClipSet::ContainsValueForAttribute (clipSet.cpp:560-585): clips are
// consulted only for attributes the manifest declares varying. An authored
// manifest declares the attribute with its spec's variability; a generated
// manifest (Usd_GenerateClipManifest, clipSet.cpp:115-160) declares it with
// the variability of the first clip layer that authors time samples or a
// spline for it.
function clipSetDeclares(cs: ResolvedClipSet, attrPath: string): boolean {
  if (cs.manifest) {
    return cs.manifest.hasSpec(attrPath) &&
      cs.manifest.getField(attrPath, 'variability') !== 'uniform'
  }
  // Usd_GenerateClipManifest declares an attribute from a clip with time
  // samples (GetNumTimeSamplesForPath != 0) or a spline field.
  for (const layer of cs.layers) {
    if (layerSamples(layer, attrPath).length === 0 && !layerSpline(layer, attrPath)) continue
    return layer!.getField(attrPath, 'variability') !== 'uniform'
  }
  return false
}

function hasTypeName(cs: ResolvedClipSet, attrPath: string, names: readonly string[]): boolean {
  return names.includes(String(cs.manifest?.getField(attrPath, 'typeName'))) ||
    cs.layers.some(layer => names.includes(String(layer?.getField(attrPath, 'typeName'))))
}

// Build the clip sources that may resolve this attribute. Strength selection
// deliberately does not happen here: stage.cpp
// _GetResolvedValueAtTimeWithClipsImpl visits each clip only at its introducing
// node/layer, after that site's ordinary opinion, and resolver.ts owns the same
// walk.
// _ClipsApplyToNode (stage.cpp:7183-7190): the nodes of the prim index walk
// a clip set applies at — every node in the clip set's source layer stack at
// or under its source prim path, not only the node that introduced it — and
// the clip-side path each such node's spec path translates to
// (Usd_Clip::TranslatePathToClip, clip.cpp:606-609). Inert nodes are never
// visited (Usd_Resolver::_SkipEmptyNodes, resolver.cpp:113-123).
export function clipSetSitesInIndex(
  cs: ResolvedClipSet, nodes: readonly PcpNode[],
): { position: readonly [number, number]; clipPrimPath: string }[] {
  const sites: { position: readonly [number, number]; clipPrimPath: string }[] = []
  const clipPrimPath = SdfPath.fromString(cs.primPath)
  nodes.forEach((node, nodeIndex) => {
    if (!node.canContributeSpecs() || node.layerStack !== cs.sourceLayerStack ||
        !node.path.hasPrefix(cs.sourcePrimPath)) return
    sites.push({
      position: [nodeIndex, cs.position[1]],
      clipPrimPath: node.path.replacePrefix(cs.sourcePrimPath, clipPrimPath).pathString,
    })
  })
  return sites
}

// `nodes` is the prim index walk the positions refer to; without it each
// clip set is placed only at its introducing node.
export function attrClipSetsFor(
  propName: string, clipSets: readonly ResolvedClipSet[], nodes?: readonly PcpNode[],
): StageAttrClipSet[] | undefined {
  const out: StageAttrClipSet[] = []
  for (const cs of clipSets) {
    const sites = nodes
      ? clipSetSitesInIndex(cs, nodes)
      : [{ position: cs.position, clipPrimPath: `${cs.primPath}${cs.tail}` }]
    for (const site of sites) {
      const prepared = attrClipSetAt(cs, `${site.clipPrimPath}.${propName}`, site.position)
      if (prepared) out.push(prepared)
    }
  }
  return out.length > 0 ? out : undefined
}

function attrClipSetAt(
  cs: ResolvedClipSet, attrPath: string, position: readonly [number, number],
): StageAttrClipSet | undefined {
  {
    if (!clipSetDeclares(cs, attrPath)) return undefined
    const manifestDefault = cs.manifest?.getField(attrPath, 'default')
    const manifestBlockedTimes = new Set(normalizeTimeSamples(
      cs.manifest?.getField(attrPath, 'timeSamples'),
    ).filter(([, value]) => value instanceof SdfValueBlock ||
      value === null || value === undefined).map(([time]) => time))
    let manifestHasTimeSamples = false
    let manifestSpline: TsSpline | undefined
    if (cs.manifest) {
      manifestHasTimeSamples = cs.manifest.getField(attrPath, 'timeSamples') !== undefined
      manifestSpline = layerSpline(cs.manifest, attrPath)
    } else {
      // Usd_GenerateClipManifest (clipSet.cpp:115-160): an attribute gets an
      // (empty) spline only when no clip authors time samples for it and
      // some clip authors a spline.
      const anySamples = cs.layers.some(layer => layerSamples(layer, attrPath).length > 0)
      const authored = cs.layers.map(layer => layerSpline(layer, attrPath)).find(s => s)
      if (!anySamples && authored) manifestSpline = new TsSpline(authored.GetValueType())
    }
    return {
      position,
      attrPath, active: cs.active, times: cs.times, layers: cs.layers,
      manifest: cs.manifest,
      manifestHasTimeSamples, manifestSpline,
      interpolateMissingClipValues: cs.interpolateMissingClipValues,
      manifestDefault,
      manifestBlockedTimes,
      valueIsTimeCode: hasTypeName(cs, attrPath, ['timecode', 'timecode[]']),
      valueIsDuration: hasTypeName(cs, attrPath, ['duration', 'duration[]']),
      toStageOffset: cs.toStageOffset,
    }
  }
}

export interface ClipPropertySource {
  readonly layer: PcpLayer
  readonly specPath: string
  readonly position: readonly [number, number]
}

// Property-stack counterpart of _PropertyStackResolver::ProcessClips
// (stage.cpp:8154-8213): identify the active clip/manifest property specs
// whose samples bracket this stage time. Adjacent clips are both retained
// when interpolation crosses a clip boundary.
export function clipPropertySourcesAtTime(
  propName: string, clipSet: ResolvedClipSet, time: number, nodes?: readonly PcpNode[],
): ClipPropertySource[] {
  const sources: ClipPropertySource[] = []
  for (const prepared of attrClipSetsFor(propName, [clipSet], nodes) ?? []) {
    sources.push(...clipPropertySourcesForPrepared(prepared, clipSet, time))
  }
  return sources
}

function clipPropertySourcesForPrepared(
  prepared: StageAttrClipSet, clipSet: ResolvedClipSet, time: number,
): ClipPropertySource[] {
  const samples = clipTimeSamples(prepared)
  if (samples.length === 0) return []
  const lower = [...samples].reverse().find(sample => sample <= time) ?? samples[0]!
  const upper = samples.find(sample => sample >= time) ?? samples[samples.length - 1]!
  const sources: ClipPropertySource[] = []
  for (const sample of lower === upper ? [lower] : [lower, upper]) {
    const activeLayer = activeClipAtTime(prepared, stageToLayerTime(prepared, sample)).layer as PcpLayer | null
    const hasAuthoredSamples = normalizeTimeSamples(
      activeLayer?.getField(prepared.attrPath, 'timeSamples')).length > 0
    const layer = hasAuthoredSamples ? activeLayer : clipSet.manifest
    if (!layer || !layer.hasSpec(prepared.attrPath) ||
        sources.some(source => source.layer === layer)) continue
    sources.push({ layer, specPath: prepared.attrPath, position: prepared.position })
  }
  return sources
}

// ---- Stage-time queries -----------------------------------------------------
//
// The stage queries a clip set at layer time and maps results back with the
// clip set's toStageOffset (stage.cpp:7416-7440, 8380-8400, 8595-8610,
// 8845-8865, 9190-9232, 9688-9696): times by the offset, time code values as
// layer values are (_FieldValueToStageXf), and the built spline by
// Usd_ApplyLayerOffsetToValue.

const isIdentityOffset = (o: SdfLayerOffset): boolean => o.offset === 0 && o.scale === 1

function stageToLayerTime(cs: StageAttrClipSet, time: number): number {
  if (isIdentityOffset(cs.toStageOffset)) return time
  const inverse = sdfLayerOffsetInverse(cs.toStageOffset)
  return inverse ? sdfLayerOffsetApply(inverse, time) : time
}

function layerToStageValue(cs: StageAttrClipSet, value: unknown): unknown {
  const offset = cs.toStageOffset
  if (isIdentityOffset(offset) || !(cs.valueIsTimeCode || cs.valueIsDuration)) return value
  const convert = (item: unknown): unknown => {
    if (item instanceof GfTimeCode || item instanceof GfDuration) return sdfLayerOffsetApply(offset, item as GfTimeCode)
    if (typeof item === 'number') {
      return cs.valueIsTimeCode ? sdfLayerOffsetApply(offset, item) : item * offset.scale
    }
    return item
  }
  if (value instanceof VtArray) return new VtArray(value.toArray().map(convert), value.getElementType())
  if (Array.isArray(value)) return value.map(convert)
  return convert(value)
}

/** Usd_ClipSet::QuerySpline at a stage time. */
export function clipSetQuerySpline(cs: StageAttrClipSet, time: number, isPreTime: boolean): unknown {
  return _clipSetQuerySpline(cs, stageToLayerTime(cs, time), isPreTime)
}

/** Usd_ClipSet::BuildSpline, offset to stage time. */
export function clipSetBuildSpline(cs: StageAttrClipSet): TsSpline | undefined {
  const spline = _clipSetBuildSpline(cs)
  return spline && !isIdentityOffset(cs.toStageOffset) ? usdTransformSpline(spline, cs.toStageOffset) : spline
}

/** Usd_ClipSet::ListTimeSamplesForPath, in stage time. */
export function clipTimeSamples(cs: StageAttrClipSet): number[] {
  const samples = _clipTimeSamples(cs)
  if (isIdentityOffset(cs.toStageOffset)) return samples
  return samples.map(t => sdfLayerOffsetApply(cs.toStageOffset, t)).sort((a, b) => a - b)
}

/** The clip set's value at a stage time. */
export function clipValueAtTime(
  cs: StageAttrClipSet, time: number, interpolation?: UsdInterpolation,
  isPreTime = false, typeName?: string,
): unknown {
  return layerToStageValue(cs,
    _clipValueAtTime(cs, stageToLayerTime(cs, time), interpolation, isPreTime, typeName))
}

/** _GetClipLayer at a stage time. */
export function clipLayerForValueAt(
  cs: StageAttrClipSet, time: number, isPreTime: boolean,
): ClipLayerLike | null {
  return _clipLayerForValueAt(cs, stageToLayerTime(cs, time), isPreTime)
}
