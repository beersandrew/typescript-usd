// Ported from OpenUSD 26.11.1: pxr/usd/usd/resolver.cpp,
//  pxr/usd/usd/resolver.h, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/resolver.{h,cpp} — Usd_Resolver in miniature: resolve
// a composed value by visiting a prim index's nodes strong→weak and, within
// each node, its layer stack's layers strong→weak, reading Sdf at the node's
// path (+ the strongest-opinion loops of stage.cpp). Pcp never fetches
// values; this usd-side consumer does, over typescript-usd/pcp's prim-index nodes.

import {
  sdfComposeListOpsStrongToWeak, sdfNormalizeListOp,
  AnimationBlock as SdfAnimationBlock, ValueBlock as SdfValueBlock,
  LayerOffset as SdfLayerOffset, ListOpValue as SdfListOpValue,
  sdfLayerOffsetApply, sdfLayerOffsetCompose,
} from 'typescript-usd/sdf'
import {
  _pcpReadField as readField, pcpIsInheritArc, pcpLayerPathKey,
  Node as PcpNode, PrimIndex as PcpPrimIndex,
} from 'typescript-usd/pcp'
import { SdfPath } from 'typescript-usd/sdf/path'
import { dictionaryStrcmp } from 'typescript-usd/tf'
import { PathExpression as SdfPathExpression, PathPattern as SdfPathPattern, type Layer } from 'typescript-usd/sdf'
import type { Spline as TsSpline } from 'typescript-usd/ts'
import { Array as VtArray, ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import {
  _sdfCoerceValueToType, _sdfGetDictionaryValueTypes, _SdfPathExpressionValue,
  _sdfRecordDictionaryValueTypes, _sdfGetMetadataFieldType, _sdfRegisterPluginFields,
} from 'typescript-usd/sdf/_internal'
import { usdInterpolateSampleAccess, usdInterpolateSamples, type UsdSampleAccess } from './interpolators.ts'
import type { UsdInterpolation } from './interpolation.ts'
import { _usdResolveTargetIncludes, type UsdResolveTarget } from './resolveTarget.ts'

// FAITHFULNESS-DEBT(sdf-path-interning): upstream interns SdfPath nodes
// (sdf/pathNode.cpp, SdfPath::AppendProperty path.cpp:941-983), so the
// property path a resolution builds is the same node every time and each
// SdfData lookup by it hashes a pointer (sdf/data.h, TfHashMap<SdfPath>).
// Here layers are keyed by path string; the spec path string of a prim path
// and property name is kept instead, so every resolution of the property
// looks layers up with one flat string whose hash is already computed rather
// than building and hashing a new one. Retired by interned path nodes with
// node-keyed SdfData (docs/performance-p1.md section 5, step 11).
const _PROP_SPEC_PATHS_LIMIT = 1 << 16
let _propSpecPaths = new Map<string, Map<string, string>>()

function propSpecPath(primPath: string, propName: string): string {
  let byName = _propSpecPaths.get(primPath)
  if (byName === undefined) {
    if (_propSpecPaths.size >= _PROP_SPEC_PATHS_LIMIT) _propSpecPaths = new Map()
    byName = new Map()
    _propSpecPaths.set(primPath, byName)
  }
  let specPath = byName.get(propName)
  if (specPath === undefined) {
    specPath = primPath === '/' ? `.${propName}` : `${primPath}.${propName}`
    byName.set(propName, specPath)
  }
  return specPath
}

// Internal counterpart of UsdResolveInfoSource.  This stays out of the package
// barrel until the complete public UsdResolveInfo API is ported.
export type UsdResolveSource =
  | 'none' | 'fallback' | 'default' | 'timeSamples' | 'valueClips' | 'spline'

export interface UsdAttributeResolveResult {
  source: UsdResolveSource
  value?: unknown
  timeSamples?: [number, unknown][]
  // For samples authored on a layer: the live source behind `timeSamples`,
  // so reads bracket by binary search instead of copying every sample.
  samples?: UsdLayerTimeSamples
  spline?: TsSpline
  valueIsBlocked: boolean
  layer?: Layer
  specPath?: string
  layerToStageOffset?: SdfLayerOffset
  node?: PcpNode
  // Value sources such as clips whose evaluation depends on query-time state
  // retain that evaluator with the canonical source-selection facts.
  valueEvaluator?: (time: number, isPreTime: boolean) => unknown
  // Composable values retain the weaker source chain used to produce `value`.
  nextWeaker?: UsdAttributeResolveResult
  // For a clip source: the layer its value at a time comes from, which
  // anchors that value's asset paths (stage.cpp _GetClipLayer).
  layerAtTime?: (time: number, isPreTime: boolean) => Layer | undefined
  // For a clip source in spline format: the clips' spline
  // (Usd_ClipSet::BuildSpline), built on request.
  clipSpline?: () => TsSpline | undefined
  // For a clip source: whether its value might vary over time
  // (_ValueFromClipsMightBeTimeVarying).
  clipValueMightBeTimeVarying?: boolean
  // For a clip source: whether its values may compose over weaker opinions
  // (the clip layers author array edits for the attribute).
  clipValuesMayCompose?: boolean
  // The stage's interpolation policy and the composed Sdf value type travel
  // with the winning resolver facts so every query consumer dispatches alike.
  interpolation?: UsdInterpolation
  typeName?: string
  // For a final (non-composing) default source: the layer's stored default
  // the value was made from (stored values are immutable and replaced on
  // edit), so a resolve info's holder can tell whether the layer still holds
  // it (_GetValueFromResolveInfoImpl reads the default from the resolve
  // info's layer on every Get, stage.cpp:8014-8030).
  layerDefault?: unknown
}

// Stage.open may acquire clip assets asynchronously, but the prepared clip
// source remains a participant in the synchronous Usd resolver walk. This
// private adapter keeps resolver.ts independent of clip acquisition/storage.
export interface UsdAttributeClipSource {
  position: readonly [number, number]
  resolve(time: number | undefined): UsdAttributeResolveResult | undefined
}

type RawSamples = ReadonlyArray<readonly [number, unknown]>

// One attribute spec's time samples, read live from its layer and mapped to
// stage time on demand. This is UsdResolveInfo's role upstream (the source
// layer, spec path and layer offset; values are read from Sdf when queried,
// stage.cpp _GetValueFromResolveInfoImpl), so edits to the layer are visible
// and no read copies the whole sample map.
export class UsdLayerTimeSamples {
  readonly #layer: Layer
  readonly #specPath: string
  readonly #offset: SdfLayerOffset
  readonly #toStageValue: (value: unknown) => unknown

  constructor(
    layer: Layer, specPath: string, offset: SdfLayerOffset,
    toStageValue: (value: unknown) => unknown,
  ) {
    this.#layer = layer
    this.#specPath = specPath
    this.#offset = offset
    this.#toStageValue = toStageValue
  }

  #raw(): RawSamples { return layerTimeSamples(this.#layer, this.#specPath) }
  #toStage(sample: readonly [number, unknown]): [number, unknown] {
    return [sdfLayerOffsetApply(this.#offset, sample[0]), this.#toStageValue(sample[1])]
  }

  get count(): number {
    return this.#offset.scale > 0 ? this.#raw().length : this.times().length
  }

  // The same source with a further stage-side value transform.
  mapValues(transform: (value: unknown) => unknown): UsdLayerTimeSamples {
    const toStageValue = this.#toStageValue
    return new UsdLayerTimeSamples(
      this.#layer, this.#specPath, this.#offset, value => transform(toStageValue(value)))
  }

  // Every sample in stage time, increasing. Mapped into an SdfTimeSampleMap
  // (_TransformSampleMap, stage.cpp:636-664), samples that a zero scale maps
  // to one stage time collapse to the last of them.
  all(): [number, unknown][] {
    const samples = this.#raw().map(sample => this.#toStage(sample))
    if (this.#offset.scale > 0) return samples
    return [...new Map(samples)].sort(([a], [b]) => a - b)
  }

  // The bracketing sample times around a stage time (usdBracketTimes over
  // times()), found by binary search over the live samples in stage time, as
  // upstream brackets the layer's sample map (SdfData::
  // GetBracketingTimeSamplesForPath, sdf/data.cpp:403-414).
  bracket(stageTime: number): [number, number] | [] {
    if (!(this.#offset.scale > 0)) return usdBracketTimes(this.times(), stageTime)
    const raw = this.#raw()
    return bracketTimes(raw.length, i => sdfLayerOffsetApply(this.#offset, raw[i]![0]), stageTime)
  }

  // Sample times in stage time, increasing and distinct.
  times(): number[] {
    const times = this.#raw().map(([time]) => sdfLayerOffsetApply(this.#offset, time))
    return this.#offset.scale > 0 ? times : [...new Set(times)].sort((a, b) => a - b)
  }

  // The samples around a stage time, enough for usdInterpolateSamples to give
  // the same answer as it would over all samples: the two bracketing samples
  // plus one more on each side, which also absorbs rounding in the inverse
  // offset mapping.
  around(stageTime: number): [number, unknown][] {
    const { offset, scale } = this.#offset
    const raw = this.#raw()
    if (!(scale > 0) || !Number.isFinite(stageTime)) return this.all()
    const layerTime = (stageTime - offset) / scale
    let lo = 0, hi = raw.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (raw[mid]![0] < layerTime) lo = mid + 1
      else hi = mid
    }
    const window: [number, unknown][] = []
    for (let i = Math.max(0, lo - 2); i <= Math.min(raw.length - 1, lo + 1); i++) {
      window.push(this.#toStage(raw[i]!))
    }
    return window
  }

  // The same samples as around(), read in place from the layer's storage:
  // times are mapped to stage time on access and values converted only when
  // the interpolation reads them. Undefined where around() lists every sample.
  aroundAccess(stageTime: number): UsdSampleAccess | undefined {
    const { offset, scale } = this.#offset
    if (!(scale > 0) || !Number.isFinite(stageTime)) return undefined
    const raw = this.#raw()
    const layerTime = (stageTime - offset) / scale
    let lo = 0, hi = raw.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (raw[mid]![0] < layerTime) lo = mid + 1
      else hi = mid
    }
    const first = Math.max(0, lo - 2)
    const length = Math.max(0, Math.min(raw.length - 1, lo + 1) - first + 1)
    const layerOffset = this.#offset, toStageValue = this.#toStageValue
    return {
      length,
      timeAt: i => sdfLayerOffsetApply(layerOffset, raw[first + i]![0]),
      valueAt: i => toStageValue(raw[first + i]![1]),
    }
  }
}

// Whether any sample composes over weaker opinions (an array edit, or a path
// expression). Numbers and arrays never do, so they are skipped without
// the full stage-value conversion; strings compose only for pathExpression.
// The layer's summary of its sample value kinds, kept until the samples are
// edited, settles the common case without a pass; otherwise this is one pass
// over the samples per resolve, where upstream decides per evaluated value
// instead (stage.cpp _GetValueImpl composes an array edit it reads).
function samplesMayCompose(
  layer: Layer, specPath: string,
  samples: RawSamples, isPathExpressionType: () => boolean,
  composes: (value: unknown) => boolean,
): boolean {
  if (typeof layer._getTimeSampleValueKinds === 'function') {
    const kinds = layer._getTimeSampleValueKinds(specPath)
    if (!kinds.others) return kinds.strings && isPathExpressionType()
  }
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i]![1]
    if (typeof value === 'number' || Array.isArray(value) || value instanceof VtArray) continue
    if (typeof value === 'string') {
      if (isPathExpressionType()) return true
      continue
    }
    if (composes(value)) return true
  }
  return false
}

function layerTimeSamples(layer: Layer, specPath: string): RawSamples {
  if (typeof layer._getTimeSamplesView === 'function') return layer._getTimeSamplesView(specPath)
  return normalizeTimeSamples(layer.getField(specPath, 'timeSamples'))
}

// Attaches a live sample source to a resolve result. `timeSamples` becomes a
// non-enumerable getter so copying the result with a spread does not copy
// every sample.
export function usdWithLiveSamples(
  result: UsdAttributeResolveResult, samples: UsdLayerTimeSamples,
): UsdAttributeResolveResult {
  result.samples = samples
  Object.defineProperty(result, 'timeSamples', {
    get: () => samples.all(), enumerable: false, configurable: true,
  })
  return result
}

// The samples to interpolate at a stage time: a window from the live layer
// source when there is one, otherwise the resolved sample list.
export function usdResolvedSamplesAround(
  result: UsdAttributeResolveResult, time: number,
): [number, unknown][] {
  return result.samples ? result.samples.around(time) : result.timeSamples ?? []
}

// usdInterpolateSamples over usdResolvedSamplesAround(result, time), without
// building the window when the samples are read live from their layer.
export function usdInterpolateResolvedSamples(
  result: UsdAttributeResolveResult, time: number,
  interpolation: UsdInterpolation | undefined, isPreTime: boolean, typeName: string | undefined,
): unknown {
  const access = result.samples?.aroundAccess(time)
  return access
    ? usdInterpolateSampleAccess(access, time, interpolation, isPreTime, typeName)
    : usdInterpolateSamples(usdResolvedSamplesAround(result, time), time, interpolation, isPreTime, typeName)
}

// Bracketing sample times for increasing `times` (UsdAttribute::
// GetBracketingTimeSamples): the nearest sample at or below and at or above,
// clamped to the ends. Binary search, as Usd_TimeSamples brackets upstream.
export function usdBracketTimes(times: readonly number[], time: number): [number, number] | [] {
  return bracketTimes(times.length, i => times[i]!, time)
}

function bracketTimes(
  length: number, timeAt: (i: number) => number, time: number,
): [number, number] | [] {
  if (length === 0) return []
  let lo = 0, hi = length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (timeAt(mid) < time) lo = mid + 1
    else hi = mid
  }
  const upper = timeAt(Math.min(lo, length - 1))
  const lower = lo < length && timeAt(lo) === time ? upper : timeAt(Math.max(0, lo - 1))
  return [lower, upper]
}

// Bracketing sample times of a resolved result in stage time
// (UsdAttribute::GetBracketingTimeSamples), without listing every sample
// time when the samples are read live from their layer.
export function usdResolvedBracketingTimes(
  result: UsdAttributeResolveResult, time: number,
): [number, number] | [] {
  return result.samples ? result.samples.bracket(time) : usdBracketTimes(usdResolvedSampleTimes(result), time)
}

// The number of resolved sample times (UsdAttribute::GetNumTimeSamples).
export function usdResolvedSampleCount(result: UsdAttributeResolveResult): number {
  return result.samples ? result.samples.count : usdResolvedSampleTimes(result).length
}

// Resolved sample times in stage time, increasing.
export function usdResolvedSampleTimes(result: UsdAttributeResolveResult): number[] {
  return result.samples
    ? result.samples.times()
    : (result.timeSamples ?? []).map(([time]) => time).sort((a, b) => a - b)
}

const noResolvedValue = (): UsdAttributeResolveResult => ({
  source: 'none', valueIsBlocked: false,
})

export interface UsdPropertySite {
  readonly nodeIndex: number
  readonly layerIndex: number
  readonly node: PcpNode
  readonly layer: Layer
  readonly specPath: string
  readonly layerToStageOffset: SdfLayerOffset
}

// The shared Usd_Resolver site walk: nodes and layers strongest-to-weakest,
// retaining the exact position where clip sources participate. As
// Usd_Resolver::_SkipEmptyNodes (resolver.cpp:113-123) does by default
// (resolver.h:45), nodes with no specs are skipped: no property spec can
// exist there. Clips can contribute at such nodes, so a walk that inserts
// clips visits them (stage.cpp:9482-9497).
export function* usdPropertySites(
  index: PcpPrimIndex, propName: string, resolveTarget?: UsdResolveTarget,
  skipEmptyNodes = true,
): IterableIterator<UsdPropertySite> {
  const nodes = index._getNodeRefs()
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex]!
    if ((skipEmptyNodes && !node.hasSpecs) || !node.canContributeSpecs()) continue
    const specPath = pcpLayerPathKey(node.path.appendProperty(propName))
    const layers = node.layerStack.layers
    let nodeOffset: SdfLayerOffset | undefined
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      if (!_usdResolveTargetIncludes(resolveTarget, nodeIndex, layerIndex)) continue
      const { layer, offset } = layers[layerIndex]!
      nodeOffset ??= node.mapToRoot.evaluate().getTimeOffset()
      yield {
        nodeIndex, layerIndex, node, layer: layer as Layer, specPath,
        layerToStageOffset: sdfLayerOffsetCompose(nodeOffset, offset),
      }
    }
  }
}

// _MapPathExpressionToPrim (stage.cpp:268-368): map each path in the
// expression through mapFn and then from prototype to instance namespace.
// Patterns with a leading stretch ('//') are kept as "search everything";
// a reference or pattern prefix outside the map's domain becomes Nothing.
export function usdMapPathExpressionToPrim(
  pathExpr: SdfPathExpression,
  mapSourceToTarget: (path: SdfPath) => SdfPath,
  protoToInstance?: (protoPath: SdfPath) => SdfPath,
): SdfPathExpression {
  const stack: SdfPathExpression[] = []
  const map = (path: SdfPath): SdfPath => {
    const mapped = mapSourceToTarget(path)
    return !mapped.isEmpty() && protoToInstance ? protoToInstance(mapped) : mapped
  }
  pathExpr.walk(
    (op, argIndex) => {
      if (op === 'complement') {
        if (argIndex === 1) stack.push(SdfPathExpression.makeComplement(stack.pop()!))
      } else if (argIndex === 2) {
        const arg2 = stack.pop()!
        stack.push(SdfPathExpression.makeOp(op, stack.pop()!, arg2))
      }
    },
    ref => {
      // A named reference without a path (%:name) is retained unchanged.
      if (ref.path.isEmpty()) {
        stack.push(SdfPathExpression.makeAtom(ref))
        return
      }
      const mapped = map(ref.path)
      stack.push(mapped.isEmpty() ? SdfPathExpression.Nothing()
        : SdfPathExpression.makeAtom({ path: mapped, name: ref.name }))
    },
    pattern => {
      if (pattern.hasLeadingStretch()) {
        stack.push(SdfPathExpression.makeAtom(pattern))
        return
      }
      const mapped = map(pattern.getPrefix())
      stack.push(mapped.isEmpty() ? SdfPathExpression.Nothing()
        : SdfPathExpression.makeAtom(new SdfPathPattern(pattern.getText()).setPrefix(mapped)))
    },
  )
  return stack.at(-1) ?? new SdfPathExpression()
}

// The typeName opinions of an attribute's property specs, read in one
// Usd_Resolver walk (nodes without specs skipped, resolver.cpp:113-123): the
// strongest (UsdAttribute::GetTypeName's composed typeName, as
// usdResolveAttributeField(index, propName, 'typeName') gives it) and whether
// every site that authors one agrees with it, so the value walk's per-site
// type questions (is any site a pathExpression?) are answered without
// walking the sites again.
export interface UsdAttributeTypeNames {
  readonly composed: unknown
  readonly uniform: boolean
  // The sites the walk found, in walk order (node index * 2^16 + layer
  // index): the layers that hold a spec for the property. The value walk
  // reads its fields (timeSamples, spline, default) only at these layers;
  // a layer without the spec holds none of them (SdfAbstractData::Has is
  // false without a spec), so the other layers of a deep layer stack cost
  // one spec lookup here instead of one per field there.
  readonly specSites: readonly number[]
}

export function usdResolveAttributeTypeNames(
  index: PcpPrimIndex, propName: string,
): UsdAttributeTypeNames {
  let composed: unknown
  let uniform = true
  const specSites: number[] = []
  const nodes = index._getNodeRefs()
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = nodes[nodeIndex]!
    if (!node.hasSpecs || !node.canContributeSpecs()) continue
    const specPath = propSpecPath(pcpLayerPathKey(node.path), propName)
    const layers = node.layerStack.layers
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const layer = layers[layerIndex]!.layer
      if (!layer.hasSpec(specPath)) continue
      specSites.push(nodeIndex * 65536 + layerIndex)
      const value = readField(layer, specPath, 'typeName')
      if (value === undefined || value === null) continue
      if (composed === undefined) composed = value
      else if (value !== composed) uniform = false
    }
  }
  return { composed, uniform, specSites }
}

// Canonical authored-value/source selection.  This is the TypeScript
// counterpart of stage.cpp _GetResolvedValueAtDefaultImpl /
// _GetResolvedValueAtTimeNoClipsImpl: one strong-to-weak resolver walk owns
// default, sample, spline and block precedence.  Value clips are inserted at
// their introducing layer by the caller while their async acquisition remains
// a Stage.open adaptation.
export function usdResolveAttributeValue(
  index: PcpPrimIndex,
  propName: string,
  time: 'default' | number | undefined,
  clipSources: readonly UsdAttributeClipSource[] = [],
  resolveTarget?: UsdResolveTarget,
  // The attribute prim's UsdPrim::_ProtoToInstancePathMap, for a prim in a
  // prototype (stage.cpp:404-406, 618-621).
  protoToInstance?: (protoPath: SdfPath) => SdfPath,
  // The sites' typeName opinions on `index`, when the caller has them.
  typeNames?: UsdAttributeTypeNames,
): UsdAttributeResolveResult {
  // Whether any site's typeName is one of `names`: from the caller's scan
  // when every site agrees, else by walking the sites.
  const anySiteTypeName = (names: readonly string[]): boolean => typeNames?.uniform
    ? typeof typeNames.composed === 'string' && names.includes(typeNames.composed)
    : [...usdPropertySites(index, propName)].some(
      site => names.includes(site.layer.getField(site.specPath, 'typeName') as string))
  let processingAnimationBlock = false
  const composableSources: UsdAttributeResolveResult[] = []
  // Whether any site declares the pathExpression type. Only string values can
  // be path expressions, so it is computed on the first string value rather
  // than by reading typeName from every site on every resolve.
  let pathExpressionType: boolean | undefined
  const isPathExpressionType = (): boolean => pathExpressionType ??= anySiteTypeName(['pathExpression'])
  // An array edit over no weaker value edits an empty array of the
  // attribute's value type.
  const emptyArray = (): unknown => {
    for (const site of usdPropertySites(index, propName)) {
      const typeName = site.layer.getField(site.specPath, 'typeName')
      if (typeof typeName === 'string') return _sdfCoerceValueToType([], typeName)
    }
    return []
  }
  let pathExpressionArrayType: boolean | undefined
  const isPathExpressionArrayType = (): boolean =>
    pathExpressionArrayType ??= anySiteTypeName(['pathExpression[]'])
  const toStageValue = (value: unknown, node: PcpNode, specPath: string): unknown => {
    // The SdfPathExpression transform also maps each element of an array
    // (stage.cpp:609-617, Vt_RegisterTransformImpl).
    if ((Array.isArray(value) || value instanceof VtArray) && isPathExpressionArrayType()) {
      const items = value instanceof VtArray ? value.toArray() : value
      const mapped = items.map(item => typeof item === 'string'
        ? (mapPathExpressionToStage(item, node, specPath) as _SdfPathExpressionValue).text : item)
      return value instanceof VtArray ? new VtArray(mapped, value.getElementType()) : mapped
    }
    if (typeof value !== 'string' || !isPathExpressionType()) return value
    return mapPathExpressionToStage(value, node, specPath)
  }
  const mapPathExpressionToStage = (value: string, node: PcpNode, specPath: string): unknown => {
    const dot = specPath.lastIndexOf('.')
    const sourcePrimPath = SdfPath.fromString(dot < 0 ? specPath : specPath.slice(0, dot))
    const expression = new _SdfPathExpressionValue(value).makeAbsolute(sourcePrimPath)
    const mapFn = node.mapToRoot.evaluate()
    const mappedPrimPath = mapFn.mapSourceToTarget(node.path)
    // _PathExprToStage (stage.cpp:613-621).
    return mappedPrimPath.isEmpty()
      ? new _SdfPathExpressionValue('')
      : expression.map(pathExpr => usdMapPathExpressionToPrim(
        pathExpr, path => mapFn.mapSourceToTarget(path), protoToInstance))
  }
  // VtArrayEdit<T> composes over arrays and the background only for the
  // element types of VT_SCALAR_VALUE_TYPES (base/vt/arrayEdit.cpp:91-109,
  // base/vt/types.h:155-156); Sdf registers no compose-over for
  // VtArrayEdit<SdfAssetPath> or VtArrayEdit<SdfPathExpression>
  // (sdf/assetPath.cpp:33, sdf/pathExpression.cpp:40-58), so an edit of
  // asset[] or pathExpression[] is a final value, kept as authored.
  let arrayEditsCompose: boolean | undefined
  const editsCompose = (): boolean =>
    arrayEditsCompose ??= !anySiteTypeName(['asset[]', 'pathExpression[]'])
  const isComposable = (value: unknown): boolean =>
    (value instanceof VtArrayEdit && editsCompose()) || value instanceof _SdfPathExpressionValue
  const finishComposableSources = (): UsdAttributeResolveResult => {
    for (let i = 0; i + 1 < composableSources.length; i++) {
      composableSources[i]!.nextWeaker = composableSources[i + 1]!
    }
    const composeOverEmpty = (edit: VtArrayEdit<unknown>): unknown => {
      const empty = emptyArray()
      return empty instanceof VtArray ? edit.composeOver(empty) : edit.composeOver([])
    }
    const composeValues = (values: readonly unknown[]): unknown => {
      let partial: unknown
      for (const value of values) {
        if (partial instanceof VtArrayEdit) {
          if (value instanceof VtArrayEdit) partial = partial.composeOver(value)
          else if (value instanceof VtArray) return partial.composeOver(value)
          else if (Array.isArray(value)) return partial.composeOver(value)
          else return composeOverEmpty(partial)
        } else if (partial instanceof _SdfPathExpressionValue) {
          if (value instanceof _SdfPathExpressionValue) partial = partial.composeOver(value)
          else return partial.composeOver(new _SdfPathExpressionValue('')).text
        } else if (value instanceof VtArrayEdit) {
          partial = value
        } else if (value instanceof _SdfPathExpressionValue) {
          partial = value
        } else {
          return value
        }
      }
      if (partial instanceof VtArrayEdit) return composeOverEmpty(partial)
      if (partial instanceof _SdfPathExpressionValue) {
        return partial.composeOver(new _SdfPathExpressionValue('')).text
      }
      return partial
    }
    const isSampled = (source: UsdAttributeResolveResult): boolean =>
      source.source === 'timeSamples' || source.source === 'valueClips'
    const sampleTimes = [...new Set(composableSources.flatMap(source =>
      isSampled(source)
        ? (source.timeSamples ?? []).map(([sampleTime]) => sampleTime)
        : []))].sort((a, b) => a - b)
    const heldSample = (
      samples: readonly [number, unknown][], sampleTime: number,
    ): unknown => {
      let value = samples[0]?.[1]
      for (const [authoredTime, authoredValue] of samples) {
        if (authoredTime > sampleTime) break
        value = authoredValue
      }
      return value
    }
    const composedSamples: [number, unknown][] = sampleTimes.map(sampleTime => [
      sampleTime,
      composeValues(composableSources.map(source => isSampled(source)
        ? heldSample(source.timeSamples ?? [], sampleTime)
        : source.value)),
    ])
    // Each source's own samples, kept apart from the composed series the
    // strongest source reports below.
    const authoredSamples = composableSources.map(source =>
      isSampled(source) ? source.timeSamples ?? [] : undefined)
    const intervalIsHeld = (lowerTime: number, upperTime: number): boolean => {
      for (const samples of authoredSamples) {
        if (!samples) continue
        const lower = heldSample(samples, lowerTime)
        const upper = heldSample(samples, upperTime)
        if (lower === upper) continue
        return isComposable(lower) && isComposable(upper)
      }
      return false
    }
    const evaluate = (valueTime: number, isPreTime: boolean): unknown => {
      if (composedSamples.length === 0) {
        return composeValues(composableSources.map(source => source.value))
      }
      if (valueTime <= composedSamples[0]![0]) return composedSamples[0]![1]
      if (valueTime > composedSamples[composedSamples.length - 1]![0]) {
        return composedSamples[composedSamples.length - 1]![1]
      }
      const exactIndex = composedSamples.findIndex(([sampleTime]) => sampleTime === valueTime)
      if (exactIndex >= 0 && !isPreTime) return composedSamples[exactIndex]![1]
      let upperIndex = exactIndex >= 0 ? exactIndex : 1
      if (exactIndex < 0) {
        while (composedSamples[upperIndex]![0] < valueTime) upperIndex++
      }
      const lower = composedSamples[upperIndex - 1]!
      const upper = composedSamples[upperIndex]!
      if (intervalIsHeld(lower[0], upper[0])) return lower[1]
      return usdInterpolateSamples([lower, upper], valueTime, undefined, isPreTime)
    }
    const strongest = composableSources[0]!
    strongest.valueEvaluator = evaluate
    // The composed series is the attribute's time samples: a composing
    // default or sample stronger than weaker samples yields samples at the
    // weaker sample times (stage.cpp _SamplesInIntervalResolver and
    // _BracketingSamplesResolver keep walking past composing opinions,
    // :8290-8560; _TimeSampleMapResolver composes the maps, :8682-8885).
    if (composedSamples.length > 0) strongest.timeSamples = composedSamples
    if (typeof time === 'number') strongest.value = evaluate(time, false)
    else if (time === 'default' || composedSamples.length === 0) {
      strongest.value = evaluate(0, false)
    }
    return strongest
  }
  // The Usd_Resolver site walk of usdPropertySites, inlined: a site's
  // layer-to-stage offset is composed only for the site a result comes from.
  const skipEmptyNodes = clipSources.length === 0
  const nodes = index._getNodeRefs()
  const specSites = typeNames?.specSites
  let siteCursor = 0
  let walkNode!: PcpNode, layerOffset!: SdfLayerOffset
  let nodeOffset: SdfLayerOffset | undefined
  const siteOffset = (): SdfLayerOffset => sdfLayerOffsetCompose(
    nodeOffset ??= walkNode.mapToRoot.evaluate().getTimeOffset(), layerOffset)
  // Without clips only the sites can give a value, so the walk visits the
  // type-name walk's sites alone when it has them.
  const sitesOnly = specSites !== undefined && clipSources.length === 0
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
    const node = walkNode = nodes[nodeIndex]!
    if ((skipEmptyNodes && !node.hasSpecs) || !node.canContributeSpecs()) continue
    if (sitesOnly) {
      while (siteCursor < specSites.length && specSites[siteCursor]! < nodeIndex * 65536) siteCursor++
      if (siteCursor === specSites.length) break
      if (Math.floor(specSites[siteCursor]! / 65536) !== nodeIndex) continue
    }
    nodeOffset = undefined
    const specPath = propSpecPath(pcpLayerPathKey(node.path), propName)
    const layers = node.layerStack.layers
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      // Whether the layer holds the property's spec (the type-name walk's
      // sites when given): without it the layer has no samples, spline or
      // default, and only a clip introduced here can apply.
      let specHere: boolean
      if (specSites) {
        const key = nodeIndex * 65536 + layerIndex
        while (siteCursor < specSites.length && specSites[siteCursor]! < key) siteCursor++
        const site = specSites[siteCursor]
        specHere = site === key
        if (!specHere && sitesOnly) {
          // On to this node's next site, if it has one.
          if (site === undefined || Math.floor(site / 65536) !== nodeIndex) break
          layerIndex = site % 65536
          specHere = true
        }
      } else {
        specHere = layers[layerIndex]!.layer.hasSpec(specPath)
      }
      if (!_usdResolveTargetIncludes(resolveTarget, nodeIndex, layerIndex)) continue
      const layer = layers[layerIndex]!.layer as Layer
      layerOffset = layers[layerIndex]!.offset
      if (specHere && time !== 'default' && !processingAnimationBlock) {
        const rawSamples = layerTimeSamples(layer, specPath)
        if (rawSamples.length > 0) {
          const toStage = (value: unknown): unknown => toStageValue(unwrapValue(value), node, specPath)
          const samples = new UsdLayerTimeSamples(layer, specPath, siteOffset(), toStage)
          const anyComposable = samplesMayCompose(layer, specPath, rawSamples, isPathExpressionType, value => isComposable(toStage(value)))
          if (composableSources.length > 0 || anyComposable) {
            // Composition needs every sample; hold them as a plain list.
            composableSources.push({
              source: 'timeSamples', valueIsBlocked: false,
              timeSamples: samples.all(),
              layer, specPath, layerToStageOffset: siteOffset(),
              node,
            })
            if (!anyComposable) return finishComposableSources()
            continue
          }
          return usdWithLiveSamples({
            source: 'timeSamples', valueIsBlocked: false,
            layer, specPath, layerToStageOffset: siteOffset(),
            node,
          }, samples)
        }
        const spline = layer.getField(specPath, 'spline') as TsSpline | undefined
        if (spline !== undefined && spline !== null) {
          return {
            source: 'spline', spline, valueIsBlocked: false,
            layer, specPath, layerToStageOffset: siteOffset(),
            node,
          }
        }
      }

      // HasField, not truthiness: an authored SdfValueBlock must stop the walk
      // instead of exposing a weaker value. Null remains accepted for legacy
      // in-memory/crate scenes created before the first-class block type.
      const layerDefault = specHere ? layer.getField(specPath, 'default') : undefined
      const authoredDefault = specHere ? toStageValue(layerDefault, node, specPath) : undefined
      if (authoredDefault !== undefined) {
        // stage.cpp _ResolveInfoResolver keeps walking for a non-animation
        // default while suppressing weaker samples, splines and clips.
        if (authoredDefault instanceof SdfAnimationBlock) {
          processingAnimationBlock = true
          continue
        }
        if (authoredDefault instanceof SdfValueBlock || authoredDefault === null) {
          if (composableSources.length > 0) return finishComposableSources()
          return {
            source: 'none', valueIsBlocked: true,
            layer, specPath, layerToStageOffset: siteOffset(),
            node,
          }
        }
        if (isComposable(authoredDefault)) {
          const source: UsdAttributeResolveResult = {
            source: 'default', value: authoredDefault, valueIsBlocked: false,
            layer, specPath, layerToStageOffset: siteOffset(), node,
          }
          composableSources.push(source)
          continue
        }
        if (composableSources.length > 0 &&
            (Array.isArray(authoredDefault) || authoredDefault instanceof VtArray ||
             authoredDefault instanceof _SdfPathExpressionValue)) {
          composableSources.push({
            source: 'default', value: authoredDefault, valueIsBlocked: false,
            layer, specPath, layerToStageOffset: siteOffset(), node,
          })
          return finishComposableSources()
        }
        return {
          source: 'default', value: authoredDefault, layerDefault, valueIsBlocked: false,
          layer, specPath, layerToStageOffset: siteOffset(),
          node,
        }
      }

      // OpenUSD stage.cpp _GetResolvedValueAtTimeWithClipsImpl: a clip is
      // considered only at its exact introduction site, after direct samples,
      // spline and default at that site have had the opportunity to stop the
      // walk. Clips do not participate at default time.
      if (time !== 'default' && !processingAnimationBlock) {
        for (const clipSource of clipSources) {
          if (clipSource.position[0] !== nodeIndex ||
              clipSource.position[1] !== layerIndex) continue
          const resolved = clipSource.resolve(time)
          if (!resolved) continue
          // Clip values compose like samples: a stronger composing opinion
          // composes over them, and composing clip values (array edits)
          // compose over weaker opinions (stage.cpp _GetValueFromResolveInfoImpl
          // composes clip samples with the rest of the chain, :7900-8080;
          // _TimeSampleMapResolver::ProcessClips, :8786-8840).
          const mayCompose = resolved.clipValuesMayCompose === true && editsCompose()
          if (composableSources.length === 0 && !mayCompose) return resolved
          const evaluateClip = resolved.valueEvaluator
          composableSources.push({
            ...resolved,
            timeSamples: (resolved.timeSamples ?? []).map(([sampleTime]) =>
              [sampleTime, evaluateClip ? evaluateClip(sampleTime, false) : undefined]),
          })
          if (!mayCompose) return finishComposableSources()
          break
        }
      }

    }
  }
  if (composableSources.length > 0) return finishComposableSources()
  return noResolvedValue()
}

// The primitive Usd_Resolver walk: nodes strong→weak, then layers
// strong→weak, returning the first authored value.
export function usdResolveStrongest(
  index: PcpPrimIndex,
  specPathOf: (node: PcpNode) => string,
  fieldName: string,
): unknown {
  for (const node of index.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    const specPath = specPathOf(node)
    for (const { layer } of node.layerStack.layers) {
      const value = layer.getField(specPath, fieldName)
      if (value !== undefined && value !== null) return value
    }
  }
  return undefined
}

// The strongest authored opinion for a prim metadata field (typeName, kind,
// active, …), or undefined.
export function usdResolvePrimField(index: PcpPrimIndex, fieldName: string): unknown {
  return usdResolvePrimFieldWithSource(index, fieldName)?.value
}

export interface UsdPrimFieldResolveResult {
  value: unknown
  layer: Layer
  specPath: string
  layerToStageOffset: SdfLayerOffset
  node: PcpNode
}

// The VtDictionary-valued fields of the Sdf schema (schema.cpp); relocates
// and variantSelection hold SdfRelocatesMap / SdfVariantSelectionMap values,
// which do not compose over weaker values.
const DICTIONARY_FIELDS = new Set([
  'assetInfo', 'clips', 'customData', 'customLayerData', 'expressionVariables', 'limits',
  'prefixSubstitutions', 'suffixSubstitutions', 'symmetryArgs', 'symmetryArguments',
])

function isDictionaryValue(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// VtDictionaryOverRecursive on stored dictionary values.
function dictionaryOverRecursive(
  strong: Record<string, unknown>, weak: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...weak }
  // Each entry keeps its held value type (VtValue) through the merge.
  const strongTypes = _sdfGetDictionaryValueTypes(strong)
  const weakTypes = _sdfGetDictionaryValueTypes(weak)
  const types = new Map<string, string>(weakTypes ?? [])
  for (const [key, strongValue] of Object.entries(strong)) {
    const weakValue = result[key]
    result[key] = isDictionaryValue(strongValue) && isDictionaryValue(weakValue)
      ? dictionaryOverRecursive(strongValue, weakValue) : strongValue
    const strongType = strongTypes?.get(key)
    if (strongType !== undefined) types.set(key, strongType)
    else types.delete(key)
  }
  if (types.size > 0) _sdfRecordDictionaryValueTypes(result, types)
  return result
}

// Plugin-registered SdfMetadata fields of type "dictionary" (for example
// usdShade's sdrMetadata) hold VtDictionary values as well, and
// UntypedValueComposer composes any held VtDictionary (stage.cpp:6150-6208).
function composesOverWeaker(fieldName: string): boolean {
  if (DICTIONARY_FIELDS.has(fieldName)) return true
  _sdfRegisterPluginFields()
  return (['prim', 'attribute', 'relationship', 'layer'] as const)
    .some(specType => _sdfGetMetadataFieldType(fieldName, specType) === 'dictionary')
}

// UntypedValueComposer::ConsumeAuthored (stage.cpp:6150-6208): a value that
// can compose over weaker values (a VtDictionary) is composed over each
// weaker opinion; composing stops at a value that cannot compose over.
export function usdComposeFieldOpinions(
  fieldName: string, strongest: unknown, weaker: Iterable<unknown>,
): unknown {
  if (!composesOverWeaker(fieldName) || !isDictionaryValue(strongest)) return strongest
  let partial: unknown = strongest
  for (const value of weaker) {
    const composed = isDictionaryValue(value) ? dictionaryOverRecursive(partial as Record<string, unknown>, value) : value
    if (!isDictionaryValue(composed)) return composed
    partial = composed
  }
  return partial
}

// The opinions for a field weaker than the one at (node, layer), in the
// Usd_Resolver node-then-layer order.
function* weakerFieldOpinions(
  index: PcpPrimIndex, fromNode: PcpNode, fromLayer: unknown,
  specPathFor: (node: PcpNode) => string, fieldName: string,
  xf?: UsdFieldOpinionTransform,
): Generator<unknown> {
  let started = false
  for (const node of index.getNodeRange()) {
    if (!started && node !== fromNode) continue
    if (!node.canContributeSpecs()) continue
    const specPath = specPathFor(node)
    for (const { layer } of node.layerStack.layers) {
      if (!started) {
        if (layer === fromLayer) started = true
        continue
      }
      const value = readField(layer, specPath, fieldName)
      if (value !== undefined && value !== null) {
        yield xf ? xf(value, layer as Layer, node, specPath) : value
      }
    }
  }
}

// MetadataValueComposer's _FieldValueToStageXf (OpenUSD v26.08
// pxr/usd/usd/stage.cpp:486-545, 6150-6208) maps each authored opinion from
// its layer's namespace before composing it over weaker opinions.
export type UsdFieldOpinionTransform =
  (value: unknown, layer: Layer, node: PcpNode, specPath: string) => unknown

export function usdResolvePrimFieldWithSource(
  index: PcpPrimIndex, fieldName: string, xf?: UsdFieldOpinionTransform,
): UsdPrimFieldResolveResult | undefined {
  for (const node of index.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    const specPath = pcpLayerPathKey(node.path)
    for (const { layer, offset } of node.layerStack.layers) {
      const value = readField(layer, specPath, fieldName)
      if (value === undefined || value === null) continue
      return {
        // Stored values are read-only and shared (sdf immutableValue.ts).
        value: usdComposeFieldOpinions(fieldName,
          xf ? xf(value, layer as Layer, node, specPath) : value,
          weakerFieldOpinions(index, node, layer, n => pcpLayerPathKey(n.path), fieldName, xf)),
        layer: layer as Layer,
        specPath,
        layerToStageOffset: sdfLayerOffsetCompose(node.mapToRoot.evaluate().getTimeOffset(), offset),
        node,
      }
    }
  }
  return undefined
}

// The sites of a prim index that hold a spec at the node's path, strongest
// first: Usd_Resolver's node-then-layer walk with empty sites skipped. Within
// one population pass the walk is shared by every field read for the prim.
export interface UsdPrimSpecSite {
  readonly node: PcpNode
  readonly layer: Layer
  readonly specPath: string
}

export function usdPrimSpecSites(index: PcpPrimIndex): UsdPrimSpecSite[] {
  const sites: UsdPrimSpecSite[] = []
  for (const node of index.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    const specPath = pcpLayerPathKey(node.path)
    for (const { layer } of node.layerStack.layers) {
      if (layer.hasSpec(specPath)) sites.push({ node, layer: layer as Layer, specPath })
    }
  }
  return sites
}

// The strongest non-null opinion for each named prim field, in one pass over
// the spec sites (usdResolvePrimField per field, without re-walking).
export function usdResolvePrimFieldsFromSites(
  sites: readonly UsdPrimSpecSite[], fieldNames: ReadonlySet<string>,
): Map<string, unknown> {
  const values = new Map<string, unknown>()
  for (const { layer, specPath } of sites) {
    for (const name of layer.getFieldNames(specPath)) {
      if (!fieldNames.has(name) || values.has(name)) continue
      const value = readField(layer, specPath, name)
      if (value !== undefined && value !== null) values.set(name, value)
    }
    if (values.size === fieldNames.size) break
  }
  return values
}

// Authored property names over spec sites; see usdResolvePropertyNames.
export function usdResolvePropertyNamesFromSites(
  sites: readonly UsdPrimSpecSite[], propertyOrder: unknown,
): string[] {
  const seen = new Set<string>()
  for (const { layer, specPath } of sites) {
    const props = readField(layer, specPath, 'properties') as string[] | undefined
    if (props) for (const p of props) seen.add(p)
  }
  return orderPropertyNames([...seen].sort(dictionaryStrcmp), propertyOrder)
}

// The strongest opinion for a property field over spec sites.
export function usdResolvePropertyFieldFromSites(
  sites: readonly UsdPrimSpecSite[], propName: string, fieldName: string,
): unknown {
  for (const { layer, specPath } of sites) {
    const value = readField(layer, propSpecPath(specPath, propName), fieldName)
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function orderPropertyNames(names: string[], authoredOrder: unknown): string[] {
  if (!Array.isArray(authoredOrder) || authoredOrder.length === 0) return names
  const present = new Set(names)
  const requested = (authoredOrder as string[]).filter(
    (name, at) => present.has(name) && authoredOrder.indexOf(name) === at)
  const moved = new Set(requested)
  return [...requested, ...names.filter(name => !moved.has(name))]
}

// Authored property names are dictionary-sorted, then reordered by the
// strongest propertyOrder opinion (UsdPrim::_GetPropertyNames).
export function usdResolvePropertyNames(index: PcpPrimIndex): string[] {
  const seen = new Set<string>()
  // Usd_Resolver skips nodes without specs (resolver.cpp:113-123).
  for (const node of index._getNodeRefs()) {
    if (!node.hasSpecs || !node.canContributeSpecs()) continue
    const specPath = pcpLayerPathKey(node.path)
    for (const { layer } of node.layerStack.layers) {
      const props = readField(layer, specPath, 'properties') as string[] | undefined
      if (!props) continue
      for (const p of props) seen.add(p)
    }
  }
  const names = [...seen].sort(dictionaryStrcmp)
  const authoredOrder = usdResolvePrimField(index, 'propertyOrder') as string[] | undefined
  if (!Array.isArray(authoredOrder) || authoredOrder.length === 0) return names
  const present = new Set(names)
  const requested = authoredOrder.filter(
    (name, at) => present.has(name) && authoredOrder.indexOf(name) === at)
  const moved = new Set(requested)
  return [...requested, ...names.filter(name => !moved.has(name))]
}

// The strongest authored field for a property (default, typeName, …).
export function usdResolveAttributeField(index: PcpPrimIndex, propName: string, fieldName: string): unknown {
  return usdResolveAttributeFieldWithSource(index, propName, fieldName)?.value
}

// Attribute variability and custom metadata are composed from the weak end of
// the property stack, unlike ordinary strongest-wins metadata (OpenUSD v26.08
// usd/stage.cpp:6706-6763).
export function usdResolveWeakestAttributeField(
  index: PcpPrimIndex, propName: string, fieldName: 'custom' | 'variability',
): unknown {
  const nodes = [...index.getNodeRange()]
  for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; --nodeIndex) {
    const node = nodes[nodeIndex]!
    if (!node.canContributeSpecs()) continue
    const specPath = propSpecPath(pcpLayerPathKey(node.path), propName)
    for (let layerIndex = node.layerStack.layers.length - 1; layerIndex >= 0; --layerIndex) {
      const layer = node.layerStack.layers[layerIndex]!.layer
      const value = layer.getField(specPath, fieldName)
      if (value !== undefined && value !== null) return value
      // Sdf property specs carry these required fields even when their text
      // syntax omits the fallback. The TypeScript substrate normalizes those
      // lazily, so materialize the same value while walking the stack.
      if (layer.hasSpec(specPath)) {
        if (fieldName === 'custom') return false
        return layer.getSpecType(specPath) === 'relationship' ? 'uniform' : 'varying'
      }
    }
  }
  return undefined
}

// UsdProperty::IsCustom is distinct from its custom metadata query: an
// unregistered property is custom if any authored property spec says true.
// Missing/false fields never stop the reverse walk (OpenUSD v26.08
// usd/stage.cpp:6439-6450).
export function usdResolvePropertyCustom(
  index: PcpPrimIndex, propName: string,
): boolean {
  const nodes = [...index.getNodeRange()]
  for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; --nodeIndex) {
    const node = nodes[nodeIndex]!
    if (!node.canContributeSpecs()) continue
    const specPath = propSpecPath(pcpLayerPathKey(node.path), propName)
    for (let layerIndex = node.layerStack.layers.length - 1; layerIndex >= 0; --layerIndex) {
      if (node.layerStack.layers[layerIndex]!.layer.getField(specPath, 'custom') === true) {
        return true
      }
    }
  }
  return false
}

export interface UsdPropertyFieldResolveResult {
  value: unknown
  layer: Layer
  specPath: string
  layerToStageOffset: SdfLayerOffset
  node: PcpNode
}

// UsdObject metadata resolution retains the site that supplied the strongest
// field so Sdf's registered layer-offset transforms can run on the value.
export function usdResolveAttributeFieldWithSource(
  index: PcpPrimIndex, propName: string, fieldName: string, xf?: UsdFieldOpinionTransform,
): UsdPropertyFieldResolveResult | undefined {
  // Usd_Resolver skips nodes without specs (resolver.cpp:113-123).
  for (const node of index._getNodeRefs()) {
    if (!node.hasSpecs || !node.canContributeSpecs()) continue
    const specPath = propSpecPath(pcpLayerPathKey(node.path), propName)
    for (const { layer, offset } of node.layerStack.layers) {
      const value = readField(layer, specPath, fieldName)
      if (value === undefined || value === null) continue
      return {
        value: usdComposeFieldOpinions(fieldName,
          xf ? xf(value, layer as Layer, node, specPath) : value,
          weakerFieldOpinions(index, node, layer,
            n => propSpecPath(pcpLayerPathKey(n.path), propName), fieldName, xf)),
        layer: layer as Layer,
        specPath,
        layerToStageOffset: sdfLayerOffsetCompose(node.mapToRoot.evaluate().getTimeOffset(), offset),
        node,
      }
    }
  }
  return undefined
}

// A prim is defined/abstract by its strongest defining specifier; stronger
// overs do not erase a weaker def/class (Usd_ComputePrimFlags).
export function usdResolveDefiningSpecifier(index: PcpPrimIndex): 'def' | 'class' | 'over' {
  let foundClass = false
  for (const node of index.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    const specPath = pcpLayerPathKey(node.path)
    for (const { layer } of node.layerStack.layers) {
      const specifier = readField(layer, specPath, 'specifier')
      if (specifier === 'def' || specifier === 0) return 'def'
      if (specifier === 'class' || specifier === 2) {
        // OpenUSD v26.08 stage.cpp:6830-6879 weakens classness only when the
        // resolver node is beneath a DIRECT (not ancestral) inherit. A class
        // reached through specializes, an ancestral inherit, or another arc is
        // itself the strongest defining specifier.
        let dueToDirectInherit = false
        for (let current: PcpNode | null = node; current !== null; current = current.parent) {
          if (pcpIsInheritArc(current.arcType) && !current.isDueToAncestor()) {
            dueToDirectInherit = true
            break
          }
        }
        if (!dueToDirectInherit) return 'class'
        foundClass = true
      }
    }
  }
  return foundClass ? 'class' : 'over'
}

// Compose a list-op-valued field over the prim index, stopping after the
// strongest explicit operation (UsdStage::_ComposeAuthoredAppliedSchemas).
export function usdComposePrimListOpField(
  index: PcpPrimIndex, fieldName: string,
): string[] {
  const operations: SdfListOpValue<string>[] = []
  outer:
  for (const node of index.getNodeRange()) {
    if (!node.canContributeSpecs()) continue
    const specPath = pcpLayerPathKey(node.path)
    for (const { layer } of node.layerStack.layers) {
      const operation = sdfNormalizeListOp<string>(readField(layer, specPath, fieldName))
      if (operation === null) continue
      operations.push(operation)
      if (operation.isExplicit) break outer
    }
  }
  return sdfComposeListOpsStrongToWeak(operations)
}

export function usdResolveAttributeDefault(index: PcpPrimIndex, propName: string): unknown {
  return usdResolveAttributeField(index, propName, 'default')
}

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
