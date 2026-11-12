// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp, pxr/usd/usd/stage.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Duration as GfDuration, Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath } from 'typescript-usd/gf'
import {
  _sdfSplitLayerIdentifier, _sdfCreateLayerIdentifier, _sdfCloneValue, _sdfFindOrOpenLayer, _sdfGetDictionaryValueTypes, _sdfIsDictionary,
  _sdfRecordDictionaryValueTypes, _sdfValuesEqual, _sdfValueTypeNameOfValue,
  _sdfTransformMetadataValue,
} from 'typescript-usd/sdf/_internal'
import { Array as VtArray, ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import { GetResolver as ArGetResolver, ResolverContext as ArResolverContext, Resolver as ArResolver } from 'typescript-usd/ar'
import { _ArHasAssetPropertyPrefetcher, _ArPrefetchAsset, _ArPrefetchAssetForProperty, _ArPrefetchAssetPath, _resolvedPathForAssetValue, _onResolverChanged, _withArTraceContext, type _ArAssetReader } from 'typescript-usd/ar/_internal'
import type { Notice as ArNotice } from 'typescript-usd/ar'
import {
  Layer, sdfComposeListOpsStrongToWeak, sdfNormalizeListOp, sdfApplyListOpToVector,
  VariableExpression as SdfVariableExpression, sdfIsVariableExpression,
  sdfLayerOffsetApply, sdfLayerOffsetCompose, sdfLayerOffsetInverse,
  AnimationBlock as SdfAnimationBlock, AssetPath as SdfAssetPath, ValueBlock as SdfValueBlock,
  ListOpValue as SdfListOpValue, ChangeBlock as SdfChangeBlock, ChangeListEntry as SdfChangeListEntry,
  Notice as SdfNotice, Schema as SdfSchema, sdfChangeBlock, sdfCreatePrimInLayer,
  PrimSpec as SdfPrimSpec, FileFormat as SdfFileFormat, findValueTypeName as sdfFindValueTypeName,
  type ListEditorProxy as SdfListEditorProxy,
} from 'typescript-usd/sdf'
import { Attribute, Prim } from './prim.ts'
import { UsdRel } from './relationship.ts'
import { UsdPrimData, UsdPrimFlag } from './primData.ts'
import { UsdResolveInfoSource } from './resolveInfo.ts'
import type { UsdResolveTarget } from './resolveTarget.ts'
import { UsdEditTarget } from './editTarget.ts'
import { UsdVariantSets } from './variantSets.ts'
import { UsdNotice, type UsdPathsToChangesMap } from './notice.ts'
import {
  ARC_NAMES, normalizeTimeSamples,
  type PrimStackEntry, type PropertyStackEntry, type PropertyStackWithLayerOffsetEntry,
} from './primCompositionQuery.ts'
import {
  UsdInstanceCache,
  _withUsdInstanceCacheTraceContext,
  isPathInPrototype, isPrototypePath, type UsdInstanceChanges,
} from './instanceCache.ts'
import {
  clipSetBuildSpline, clipSetContainsSpline, clipSetQuerySpline,
  clipSetValueMightBeTimeVarying, clipSetValuesMayCompose, resolveClipSetsForPrimIndex,
} from './clipSet.ts'
import { computeClipSetDefinitionsForPrimAndAncestors } from './clipSetDefinition.ts'
import { Registry as KindRegistry } from 'typescript-usd/kind'
import {
  pcpLayerPathKey, pcpIsSpecializeArc, pcpComposeSitePayloads,
  _pcpReadField, type LayerOpener as PcpLayerOpener,
  ArcType as PcpArcType, Changes as PcpChanges,
  Cache as PcpCache, PrimIndex as PcpPrimIndex, Node as PcpNode, type Layer as PcpLayer,
  PcpNeedsLayer, pcpRescanForSpecs, pcpBuildPrimPropertyIndex, pcpBuildTargetIndex,
  pcpSite, type Error as PcpError, DependencyType as PcpDependencyType,
} from 'typescript-usd/pcp'
import type { SdfLayerChangeListVec } from 'typescript-usd/sdf/changeList'
import {
  _withPcpTraceContext, _createPcpCacheWithTraceContext, _setPcpTraceContext, _getPcpTraceContext,
  pcpRunMaybeAsync, type PcpMaybeAsync,
} from 'typescript-usd/pcp/_internal'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  dictionaryLessThan, Error as TfError, Notice as TfNotice, type NoticeKey, Type as TfType,
  RaiseWarning as TfRaiseWarning, TfDiagnosticMgr, TfDiagnosticType, TF_CODING_ERROR,
} from 'typescript-usd/tf'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { usdTransformSpline } from './interpolators.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import {
  UsdSchemaRegistry,
  type UsdSchemaInfo,
  type UsdSchemaVersion,
  type UsdSchemaVersionPolicy,
} from './schemaRegistry.ts'
import { UsdPrimTypeInfo } from './primTypeInfo.ts'
import { _isDictValue, _dictOverRecursive, type UsdPrimDefinition } from './primDefinition.ts'
import {
  attrClipSetsFor, clipLayerForValueAt, clipPropertySourcesAtTime,
  clipTimeSamples, clipValueAtTime,
  type ResolvedClipSet,
} from './clipSet.ts'
import { _invalidateLayerAuthorsClips } from './clipSetDefinition.ts'
import {
  usdResolveAttributeField, usdResolveAttributeFieldWithSource, usdResolveAttributeTypeNames,
  usdResolvePropertyCustom, usdResolveWeakestAttributeField,
  usdPropertySites, usdResolveAttributeValue, usdResolvePrimFieldWithSource,
  usdComposePrimListOpField, usdResolveDefiningSpecifier, usdWithLiveSamples,
  usdResolvePrimField, usdPrimSpecSites, usdComposeFieldOpinions,
  type UsdAttributeResolveResult,
} from './resolver.ts'
import { usdAssetPathsToStage, usdGetMetadataFieldType, usdTransformMetadataValue } from './schemaRegistry.ts'
import { UsdStageCacheContext, type UsdStageCache } from './stageCache.ts'
import { StageLoadRules, type LoadPolicy } from './stageLoadRules.ts'
import { usdInstanceKey } from './instanceKey.ts'
import { StagePopulationMask } from './stagePopulationMask.ts'
import { _traceScopeData } from 'typescript-usd/trace/_internal'
import {
  _withOptionalTraceScope,
  _withStageOpenTrace,
  _withStageTrace,
  _withStageTraceSync,
  type UsdTraceContext,
} from './traceContext.ts'
import { _hasUsdQueryObserver, _recordUsdQueryEvent } from './internal.ts'
import type { UsdListPosition } from './common.ts'
import {
  usdInsertListItem, usdListOpForEditing, usdListOpHasKeys, usdRemoveListItem,
  type UsdEditedListOp,
} from './listEditImpl.ts'
import {
  UsdInterpolationType, UsdInterpolationTypeLinear,
} from './interpolation.ts'
import {
  asPrimPredicate, PrimAllPrimsPredicate, PrimDefaultPredicate, TraverseInstanceProxies,
  type UsdPrimPredicate,
} from './primFlags.ts'
import { UsdPrimRange } from './primRange.ts'

// OpenUSD usd/stage.cpp:874–880 _CreateAnonymousSessionLayer; tf/stringUtils.cpp:287–294
// strips the final suffix, including the empty prefix of a leading-dot name.
function _createAnonymousSessionLayer(rootLayer: Layer, traceContext?: UsdTraceContext): Layer {
  const name = rootLayer.getDisplayName()
  const suffix = name.lastIndexOf('.')
  const tag = `${suffix < 0 ? name : name.slice(0, suffix)}-session.usda`
  // Sdf layer.cpp:392–425 selects the tag's format before creating the layer.
  // Keep that synchronous lookup on the opening Stage's logical trace lane.
  const format = SdfFileFormat.findByExtension(tag, traceContext) ?? SdfFileFormat.findById('usda')
  return Layer.createAnonymous(tag, format)
}

// Each element of an array value mapped through `fn`, as an array of the same
// kind (a VtArray keeps its element type), or undefined for a non-array.
function mapArrayValue(value: unknown, fn: (item: unknown) => unknown): unknown {
  if (value instanceof VtArray) return new VtArray(value.toArray().map(fn), value.getElementType())
  return Array.isArray(value) ? value.map(fn) : undefined
}

// stage.cpp:691-708 and sdf/layerOffset.cpp:71-76: relative durations scale
// without translating, while preserving scalar/array value types.
// _CopyMetadata (stage.cpp:5658-5675) authors through SdfSpec::SetInfo,
// which refuses a field with no schema definition (spec.cpp:202-206):
// unregistered metadata is warned about and not copied by Flatten.
function flattenCanCopyField(field: string): boolean {
  if (SdfSchema.getInstance().getFieldDefinition(field)) return true
  TfRaiseWarning(`Failed copying metadata: Cannot set value for unknown field '${field}'`)
  return false
}

function scaleDurationValue(value: unknown, scale: number): unknown {
  const transform = (item: unknown): unknown => item instanceof GfDuration || typeof item === 'number'
    ? new GfDuration(Number(item) * scale) : item
  return mapArrayValue(value, transform) ?? transform(value)
}

function remapFlattenedPropertyPath(
  path: string, sourcePrimPath: string, destinationPrimPath: string,
): string {
  if (path === sourcePrimPath) return destinationPrimPath
  if (path.startsWith(`${sourcePrimPath}/`) || path.startsWith(`${sourcePrimPath}.`)) {
    return destinationPrimPath + path.slice(sourcePrimPath.length)
  }
  return path
}

// _IsPrivateFieldKey (OpenUSD v26.08 pxr/usd/usd/stage.cpp:2209-2252):
// composition keys, clip keys (UsdGetClipRelatedFields, clip.cpp:50-57) and
// value keys, plus read-only and children-holding fields.
const PRIVATE_FIELD_KEYS: ReadonlySet<string> = new Set([
  'inheritPaths', 'layerRelocates', 'payload', 'references', 'specializes',
  'subLayers', 'subLayerOffsets', 'variantSelection', 'variantSetNames',
  'clips', 'clipSets',
  'default', 'timeSamples', 'spline',
])

function usdIsPrivateFieldKey(fieldKey: string): boolean {
  // typescript-usd keeps internal bookkeeping fields under a '__' prefix.
  if (fieldKey.startsWith('__')) return true
  if (PRIVATE_FIELD_KEYS.has(fieldKey)) return true
  const field = SdfSchema.getInstance().getFieldDefinition(fieldKey)
  return field !== undefined && (field.isReadOnly() || field.holdsChildren())
}

// _AnchorOrResolveAssetPaths with setResolvedPath = false, i.e.
// SdfAnchorAssetPaths (OpenUSD v26.08 pxr/usd/sdf/assetPath.cpp:173-237).
// typescript-usd holds an unevaluated asset value as its authored string, so items
// are strings or SdfAssetPaths and keep their kind unless re-anchored.
function sdfAnchorAssetPaths(
  anchor: Layer, exprVars: Record<string, unknown>, assetPaths: readonly unknown[],
): unknown[] {
  const result = [...assetPaths]
  for (let i = 0; i !== result.length; ++i) {
    const item = result[i]
    if (typeof item !== 'string' && !(item instanceof SdfAssetPath)) continue
    let assetPath = item instanceof SdfAssetPath ? item : new SdfAssetPath(item)

    if (sdfIsVariableExpression(assetPath.getAuthoredPath())) {
      const r = new SdfVariableExpression(assetPath.getAuthoredPath()).evaluateTyped(exprVars, 'string')
      if (r.errors.length > 0) continue
      if (typeof r.value === 'string') {
        assetPath = new SdfAssetPath({
          authoredPath: assetPath.getAuthoredPath(),
          evaluatedPath: r.value,
          resolvedPath: assetPath.getResolvedPath(),
        })
        result[i] = assetPath
      }
    }

    // If the resolver can't handle this path (e.g., it's a URI and no
    // associated URI resolver is registered), the result of anchoring may be
    // non-sensical. We try to detect this by comparing the anchored result to
    // the unanchored identifier. If they're the same, then we assume the path
    // is absolute since the anchor had no effect, and we can just leave the
    // path as-is.
    if (assetPath.getAssetPath() === '' || assetPath.getAssetPath().startsWith('anon:')) {
      return result
    }
    const anchoredPath = anchor.resolveAsset(assetPath.getAssetPath())
    const unanchoredPath = ArGetResolver().createIdentifier(assetPath.getAssetPath())
    if (anchoredPath !== unanchoredPath) {
      result[i] = typeof item === 'string' ? anchoredPath : new SdfAssetPath(anchoredPath)
    }
  }
  return result
}

// The forFlattening branch of _AssetPathToStage and the VtValue transforms
// registered for asset-path arrays and dictionaries (OpenUSD v26.08
// pxr/usd/usd/stage.cpp:578-605, 697, 790-815). `typeName` is the value's
// declared Sdf type where typescript-usd stores asset values as plain strings.
function usdAnchorAssetPathsForFlatten(
  value: unknown, typeName: string | undefined,
  anchor: Layer, exprVars: Record<string, unknown>,
): unknown {
  if (value instanceof SdfAssetPath || (typeName === 'asset' && typeof value === 'string')) {
    return sdfAnchorAssetPaths(anchor, exprVars, [value])[0]
  }
  if (value instanceof VtArray) {
    if (typeName !== 'asset[]' && _sdfValueTypeNameOfValue(value) !== 'asset[]' &&
        !value.toArray().some(item => item instanceof SdfAssetPath)) return value
    return new VtArray(
      sdfAnchorAssetPaths(anchor, exprVars, value.toArray()), value.getElementType())
  }
  if (Array.isArray(value)) {
    if (typeName !== 'asset[]' && !value.some(item => item instanceof SdfAssetPath)) return value
    return sdfAnchorAssetPaths(anchor, exprVars, value)
  }
  if (_sdfIsDictionary(value)) {
    const valueTypes = _sdfGetDictionaryValueTypes(value)
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = usdAnchorAssetPathsForFlatten(item, valueTypes?.get(key), anchor, exprVars)
    }
    if (valueTypes) _sdfRecordDictionaryValueTypes(result, valueTypes)
    return result
  }
  return value
}

// _ListMetadataFields' sort & unique (stage.cpp:7123-7125).
function sortedUniqueFields(fields: readonly string[]): string[] {
  return [...new Set(fields)].sort(
    (a, b) => (dictionaryLessThan(a, b) ? -1 : dictionaryLessThan(b, a) ? 1 : 0))
}

// Arc strength ordering (lower = stronger)
export const ARC = { Local: 0, Inherit: 1, Variant: 2, Relocate: 3, Reference: 4, Payload: 5, Specialize: 6 } as const

type ArcVal = (typeof ARC)[keyof typeof ARC]

// pcp's PcpArcType → the inline engine's ARC value (Root is the local opinion).
const PCP_TO_ARC: Record<number, ArcVal> = {
  [PcpArcType.Root]: ARC.Local,
  [PcpArcType.Inherit]: ARC.Inherit,
  [PcpArcType.Variant]: ARC.Variant,
  [PcpArcType.Relocate]: ARC.Relocate,
  [PcpArcType.Reference]: ARC.Reference,
  [PcpArcType.Payload]: ARC.Payload,
  [PcpArcType.Specialize]: ARC.Specialize,
}

export interface Retiming { offset: number; scale: number }
export interface Reference { assetPath: string; primPath: string; layerOffset: Retiming }
export interface ListOp<T> {
  isExplicit: boolean
  explicitItems: T[]
  prependedItems: T[]
  appendedItems: T[]
  deletedItems: T[]
}

const ZERO_OFFSET: Retiming = { offset: 0, scale: 1 }

// One opinion from one layer at a given arc depth
interface SpecRef {
  layer: Layer
  sourcePath: string
  arc: ArcVal[]
  offset: Retiming
  // Provenance: the spec this one was derived from — the parent prim's spec
  // (populateChildren) or the same prim's spec that authored the arc
  // (references/payloads/inherits/variants). Undefined for local layer-stack
  // specs. Native instancing classifies direct vs ancestral arcs with this.
  from?: SpecRef | undefined
}

function getF(spec: SpecRef, field: string): unknown {
  return spec.layer.getField(spec.sourcePath, field)
}

// --- Layer cache and loading ---

// Every layer load during composition flows through openLayer, so the muted
// set applies uniformly to sublayers, references, and payloads — a muted
// layer behaves as if it did not exist (UsdStage::MuteLayer semantics).
const NO_MUTED: ReadonlySet<string> = new Set()

// --- Main composition ---

export interface StageOpenOptions {
  loadPayloads?: boolean
  // TypeScript encoding of the UsdStage::Open(filePath,
  // pathResolverContext, load) overload (OpenUSD stage.h:253-268). When
  // omitted, the root opens without a bound context and the stage derives its
  // continuing context with CreateDefaultContextForAsset, as upstream does.
  resolverContext?: ArResolverContext
  // An on-disk session layer to open and compose STRONGER than the root layer
  // stack, mirroring UsdStage::Open(rootLayer, sessionLayer)'s two-layer
  // overload. Default (omitted): Stage.open creates its own fresh anonymous
  // session layer for in-memory authoring, as usual. When given, the opened
  // layer's OWN content participates in composition (e.g. expression-variable
  // overrides, or prims only visible through the session) instead of a blank
  // layer — for fixtures whose golden output was captured with an explicit
  // session layer loaded (testPcpCompositionResults.py's `Loading session
  // @...@` / --session flag).
  sessionLayerPath?: string
  // UsdStage::Open(rootLayer, sessionLayer[, pathResolverContext]) (OpenUSD
  // stage.h:285-305): an opened session layer handle, or null for the
  // overloads given an explicitly null session layer, which open the stage
  // with no session layer at all (stage.cpp:1335-1343; Python's
  // sessionLayer=None). Omitted, the stage creates its own anonymous
  // session layer (UsdStage::Open(rootLayer), stage.cpp:1277-1283).
  sessionLayer?: Layer | null
}

// The layer opener for Pcp (sublayers, references, payloads) and clips: Sdf
// owns identity and PcpCache owns muting.
function _makePcpLayerOpener(
  dependencies: Set<Layer> | undefined,
  resolver: ArResolver, context: ArResolverContext,
): PcpLayerOpener {
  return async (filePath: string, errors?: string[]): Promise<PcpLayer | null> => {
    if (!filePath) return null
    // With `errors`, Pcp takes the failed open's errors for its PcpError
    // (layerStack.cpp:1777-1802, primIndex.cpp:2300-2325); otherwise they
    // stay posted.
    const posted: TfError[] | undefined = errors ? [] : undefined
    const layer = await _sdfFindOrOpenLayer(filePath, resolver, context, posted)
    if (posted) errors!.push(...posted.map(error => error.getCommentary()))
    if (!layer) return null
    dependencies?.add(layer)
    return layer
  }
}

const childPath = (parent: string, name: string): string =>
  parent === '/' ? `/${name}` : `${parent}/${name}`

// _ProtoToInstancePathMap::MapProtoToInstance (prim.cpp:53-70).
function mapProtoToInstance(pathMap: ReadonlyArray<[SdfPath, SdfPath]>, protoPath: SdfPath): SdfPath {
  let best: [SdfPath, SdfPath] | undefined
  for (const entry of pathMap) {
    if (protoPath.hasPrefix(entry[0]) &&
        (!best || entry[0].pathElementCount > best[0].pathElementCount)) best = entry
  }
  return best ? protoPath.replacePrefix(best[0], best[1]) : protoPath
}

const parentOf = (path: string): string =>
  path === '/' ? '' : (path.slice(0, path.lastIndexOf('/')) || '/')

// SdfPath ordering for prim paths: a parent precedes its descendants, and
// siblings are consecutive.
const comparePrimPaths = (a: string, b: string): number => {
  const as = a.split('/'), bs = b.split('/')
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] !== bs[i]) return as[i]! < bs[i]! ? -1 : 1
  }
  return as.length - bs.length
}

const isPathAtOrBelowPrim = (path: string, root: string): boolean =>
  path === root || root === '/' || path.startsWith(`${root}/`) ||
  path.startsWith(`${root}.`) || path.startsWith(`${root}{`)

// _RemoveDescendentEntries (stage.cpp:4365-4382).
function removeDescendentPaths(paths: Set<string>): void {
  for (const path of [...paths]) {
    for (const other of paths) {
      if (other !== path && isPathAtOrBelowPrim(path, other)) {
        paths.delete(path)
        break
      }
    }
  }
}

const emptyInstanceChanges = (): UsdInstanceChanges => ({
  newPrototypePrims: [], newPrototypePrimIndexes: [],
  changedPrototypePrims: [], changedPrototypePrimIndexes: [],
  deadPrototypePrims: [],
})

// SdfReference / SdfPayload equality: asset path, prim path, layer offset.
function referencesEqual(a: Reference, b: Reference): boolean {
  return a.assetPath === b.assetPath && a.primPath === b.primPath &&
    a.layerOffset.offset === b.layerOffset.offset && a.layerOffset.scale === b.layerOffset.scale
}

// ---- Change processing helpers (stage.cpp:4220-4428) ----

// UsdStage::_NamespaceEditsChangeBlock::ExpectedNamespaceEditChange
// (stage.h:2206-2210). The prim stack is recorded as (layer, spec path)
// pairs.
interface ExpectedNamespaceEditChange {
  oldPath: string
  newPath: string | undefined
  oldPrimStack: ReadonlyArray<SdfPrimSpec | undefined>
}

// UsdStage::_PendingChanges (stage.cpp:710-722).
class UsdPendingChanges {
  readonly pcpChanges = new PcpChanges()
  readonly recomposeChanges: UsdPathsToChangesMap = new Map()
  readonly otherResyncChanges: UsdPathsToChangesMap = new Map()
  readonly otherInfoChanges: UsdPathsToChangesMap = new Map()
  readonly primTypeInfoChanges: UsdPathsToChangesMap = new Map()
  readonly assetPathResyncChanges: UsdPathsToChangesMap = new Map()
  // The edits a UsdNamespaceEditor expects to be processed as namespace
  // edits for notice handling.
  readonly expectedNamespaceEditChanges: ExpectedNamespaceEditChange[] = []
}

// UsdIsClipRelatedField (clipsAPI / clipSetDefinition).
function isClipRelatedField(fieldName: string): boolean {
  return fieldName === 'clips' || fieldName === 'clipSets'
}

// _AddToChangedPaths (stage.cpp:4222-4245): a map entry records the change
// list entries that affected the path; a set records only the path.
function addToChangedPaths(
  changedPaths: UsdPathsToChangesMap | Set<string>, path: string, entry?: SdfChangeListEntry,
): void {
  if (changedPaths instanceof Set) {
    changedPaths.add(path)
    return
  }
  let entries = changedPaths.get(path)
  if (!entries) changedPaths.set(path, entries = [])
  if (entry) entries.push(entry)
}

// The spoofed entry indicating that a prim's composed variants may have
// changed (stage.cpp:4669-4680).
let spoofedVariantEntry: SdfChangeListEntry | undefined
function variantEntry(): SdfChangeListEntry {
  if (!spoofedVariantEntry) {
    spoofedVariantEntry = new SdfChangeListEntry()
    spoofedVariantEntry.infoChanged.push(['variantChildren', [undefined, undefined]])
  }
  return spoofedVariantEntry
}

// _AddAffectedStagePaths(pcpChanges, layer, path, cache, ...)
// (stage.cpp:4273-4329).
function addAffectedStagePaths(
  pcpChanges: PcpChanges, layer: PcpLayer, path: SdfPath, cache: PcpCache,
  changedPaths: UsdPathsToChangesMap | Set<string>, entry?: SdfChangeListEntry,
): void {
  // We include virtual dependencies so that we can process changes like
  // adding missing defaultPrim metadata.
  const depTypes = PcpDependencyType.Direct | PcpDependencyType.Ancestral |
    PcpDependencyType.NonVirtual | PcpDependencyType.Virtual
  // Do not filter dependencies against the indexes cached in PcpCache,
  // because Usd does not cache PcpPropertyIndex entries.
  const filterForExistingCachesOnly = false

  // If this site is in the cache's layerStack, we always add it here, unless
  // the path contains a variant selection. Layer stacks the layer will be
  // added to (sublayer insertion or unmuting) count too.
  if (!path.containsPrimVariantSelection()) {
    const rootLayerStack = cache.getLayerStack()
    if (rootLayerStack.hasLayer(layer) ||
        pcpChanges.findAllLayerStacksUsingLayer(cache, layer).includes(rootLayerStack)) {
      addToChangedPaths(changedPaths, path.pathString, entry)
    }
  }

  for (const dep of pcpChanges.findSiteDependencies(cache, layer, path, depTypes,
    /* recurseOnSite */ true, /* recurseOnIndex */ false, filterForExistingCachesOnly)) {
    addToChangedPaths(changedPaths, dep.indexPath.pathString, entry)
  }
}

// _AddAffectedStagePaths(layerStack, cache, ...) (stage.cpp:4331-4357).
function addAffectedStagePathsForLayerStack(
  layerStack: Parameters<PcpCache['findSiteDependencies']>[0], cache: PcpCache,
  changedPaths: UsdPathsToChangesMap,
): void {
  for (const dep of cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
    PcpDependencyType.AnyNonVirtual, /* recurseOnSite */ true, /* recurseOnIndex */ false,
    /* filterForExistingCachesOnly */ false)) {
    addToChangedPaths(changedPaths, dep.indexPath.pathString)
  }
}

// The map's paths in SdfPath order (std::map<SdfPath, ...> iteration).
function sortedChangedPaths(changedPaths: UsdPathsToChangesMap): SdfPath[] {
  if (changedPaths.size < 2) return [...changedPaths.keys()].map(path => SdfPath.fromString(path))
  return [...changedPaths.keys()].map(path => SdfPath.fromString(path)).sort(SdfPath.compare)
}

// _RemoveDescendentEntries (stage.cpp:4359-4378): removes all elements
// whose paths are prefixed by other elements.
function removeDescendentEntries(changedPaths: UsdPathsToChangesMap): void {
  if (changedPaths.size < 2) return
  let root: SdfPath | undefined
  for (const path of sortedChangedPaths(changedPaths)) {
    if (root && path.hasPrefix(root)) changedPaths.delete(path.pathString)
    else root = path
  }
}

// _MergeAndRemoveDescendentEntries (stage.cpp:4380-4428): removes all
// elements from weaker whose paths are prefixed by elements in stronger;
// elements with the same path in both merge into stronger.
function mergeAndRemoveDescendentEntries(
  stronger: UsdPathsToChangesMap, weaker: UsdPathsToChangesMap,
): void {
  if (stronger.size === 0) return
  for (const [path, entries] of [...weaker]) {
    const strongEntries = stronger.get(path)
    if (strongEntries) {
      strongEntries.push(...entries)
      weaker.delete(path)
      continue
    }
    for (let ancestor = SdfPath.fromString(path).getParentPath(); !ancestor.isEmpty();
      ancestor = ancestor.getParentPath()) {
      if (stronger.has(ancestor.pathString)) {
        weaker.delete(path)
        break
      }
      if (ancestor.isAbsoluteRootPath()) break
    }
  }
}

// SdfPrimSpecHandleVector equality: handles follow their specs through
// namespace moves.
function primStacksMatch(
  stack: ReadonlyArray<SdfPrimSpec | undefined>, expected: ReadonlyArray<SdfPrimSpec | undefined>,
): boolean {
  return stack.length === expected.length && stack.every((spec, i) => spec === expected[i])
}


// KindRegistry::IsA.
const kindIsA = (kind: string, baseKind: string): boolean => KindRegistry.isA(kind, baseKind)

// ---- Global variant fallbacks (UsdStage::{Get,Set}GlobalVariantFallbacks) ----
//
// Usd lets you configure the fallback variants to use in plugInfo.json: a
// plugin's "UsdVariantFallbacks" metadata dict maps variant-set name → the
// preference-ordered selections to try when no selection is authored. The map
// is discovered lazily on FIRST ACCESS (upstream's TF_MAKE_STATIC_DATA
// _usdGlobalVariantFallbackMap, stage.cpp): plugins registered after the
// first Get/Set do not reseed it. SetGlobalVariantFallbacks replaces the map
// for stages created afterward; existing stages are unaffected (each stage
// captures the map at construction, as UsdStage's ctor does via
// _cache->SetVariantFallbacks(GetGlobalVariantFallbacks())).
type VariantFallbackMap = Record<string, string[]>

let _globalVariantFallbacks: VariantFallbackMap | null = null

function _seedGlobalVariantFallbacksFromPlugins(): VariantFallbackMap {
  const fallbacks: VariantFallbackMap = {}
  for (const plug of PlugRegistry.GetInstance().getAllPlugins()) {
    const dictVal = plug.getMetadata()['UsdVariantFallbacks']
    if (dictVal === undefined) continue
    if (typeof dictVal !== 'object' || dictVal === null || Array.isArray(dictVal)) {
      // Upstream TF_CODING_ERROR("[UsdVariantFallbacks] was not a dictionary")
      continue
    }
    for (const [vset, vsels] of Object.entries(dictVal as Record<string, unknown>)) {
      // Upstream TF_CODING_ERROR("value for %s must be an array") + skip.
      if (!Array.isArray(vsels)) continue
      const sels = vsels.filter((s): s is string => typeof s === 'string')
      if (sels.length > 0) fallbacks[vset] = sels
    }
  }
  return fallbacks
}

const _copyVariantFallbacks = (m: Record<string, readonly string[]>): VariantFallbackMap =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]))

// The color configuration fallbacks from the plugins (stage.cpp:117-171,
// TF_MAKE_STATIC_DATA: computed on first use). JsObject is a std::map, so
// the dictionary's keys are visited in order.
let _colorConfigurationFallbacks: [SdfAssetPath, string] | undefined
function _getColorConfigurationFallbacks(): [SdfAssetPath, string] {
  if (_colorConfigurationFallbacks) return _colorConfigurationFallbacks
  const fallbacks: [SdfAssetPath, string] = [new SdfAssetPath(), '']
  _colorConfigurationFallbacks = fallbacks
  for (const plug of PlugRegistry.GetInstance().getAllPlugins()) {
    const metadata = plug.getMetadata()
    if (!('UsdColorConfigFallbacks' in metadata)) continue
    const dictVal = metadata['UsdColorConfigFallbacks']
    if (typeof dictVal !== 'object' || dictVal === null || Array.isArray(dictVal)) {
      TF_CODING_ERROR(`${plug.getName()}[UsdColorConfigFallbacks] was not a dictionary.`)
      continue
    }
    const dict = Object.entries(dictVal as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    for (const [key, value] of dict) {
      if (key === 'colorConfiguration') {
        if (typeof value !== 'string') {
          TF_CODING_ERROR(`'colorConfiguration' value in ${plug.getName()}[UsdColorConfigFallbacks] must be a string.`)
          continue
        }
        if (value !== '') fallbacks[0] = new SdfAssetPath(value)
      } else if (key === 'colorManagementSystem') {
        if (typeof value !== 'string') {
          TF_CODING_ERROR(`'colorManagementSystem' value in ${plug.getName()}[UsdColorConfigFallbacks] must be a string.`)
          continue
        }
        if (value !== '') fallbacks[1] = value
      } else {
        TF_CODING_ERROR(`Unknown key '${key}' found in ${plug.getName()}[UsdColorConfigFallbacks].`)
      }
    }
  }
  return fallbacks
}


// Walks a node and its origin chain; true if any is a specialize arc — the
// node "represents a live base material". Mirrors
// usdShade/connectableAPI.cpp _NodeRepresentsLiveBaseMaterial (the
// reference-crossing flip-back is disabled upstream, so any specialize wins).
function nodeRepresentsLiveBaseMaterial(node: PcpNode): boolean {
  const seen = new Set<PcpNode>()
  let n: PcpNode | null = node
  while (n && !seen.has(n)) {
    seen.add(n)
    if (pcpIsSpecializeArc(n.arcType)) return true
    n = n.origin === n ? null : n.origin
  }
  return false
}

// Usd_ClipCache::PopulateClipsForPrim (clipCache.cpp:191-240) finds
// ancestral clips by the prim's STAGE path. Inside a prototype the walk ends
// below the prototype root, whose prim index is empty and holds no clips
// (stage.cpp:3487-3494, Usd_PrimData::GetPrimIndex), so clips authored on or
// above the instance prim never reach prototype descendants.
function clipAncestorLevels(prim: UsdPrimData): number {
  if (!prim.isInPrototype()) return Infinity
  return prim.path.split('/').length - 3
}

export class Stage {
  private readonly _instanceCache: UsdInstanceCache
  private readonly _loadRules: StageLoadRules
  private _editTarget: Layer | null
  private _editTargetContext: UsdEditTarget | null
  // Path of the root layer — anchor for resolving relative asset paths
  // (textures etc.) authored in the scene.
  readonly rootLayerPath: string
  // Time metadata from the root layer (undefined when unauthored)
  private readonly _initialStartTimeCode: number | undefined
  private readonly _initialEndTimeCode: number | undefined
  private readonly _initialTimeCodesPerSecond: number | undefined
  private readonly _initialFramesPerSecond: number | undefined
  private _interpolationType: UsdInterpolationType = UsdInterpolationTypeLinear

  private constructor(
    editTarget: Layer | null = null,
    rootLayerPath = '',
    timeMeta?: {
      start?: number | undefined
      end?: number | undefined
      tps?: number | undefined
      fps?: number | undefined
    },
    instanceCache = new UsdInstanceCache(),
    loadRules = new StageLoadRules(true),
  ) {
    this._instanceCache = instanceCache
    this._loadRules = loadRules
    this._editTarget = editTarget
    this._editTargetContext = editTarget ? new UsdEditTarget(editTarget) : null
    this.rootLayerPath = rootLayerPath
    this._initialStartTimeCode = timeMeta?.start
    this._initialEndTimeCode = timeMeta?.end
    this._initialTimeCodesPerSecond = timeMeta?.tps
    this._initialFramesPerSecond = timeMeta?.fps
  }

  // ---- Prim data tree (UsdStage population, stage.cpp:2351-3600) ----

  private readonly _primMap = new Map<string, UsdPrimData>()
  private _pseudoRoot: UsdPrimData | null = null
  // _invalidPrimTypeToFallbackMap: types without a valid schema mapped to the
  // first valid fallback named by the stage's fallbackPrimTypes metadata.
  private _invalidPrimTypeToFallbackMap = new Map<string, string>()

  /** @internal */
  _getPrimDataAtPath(path: string): UsdPrimData | undefined {
    return this._primMap.get(path)
  }

  // _GetPrimDataAtPathOrInPrototype (stage.cpp:2371-2389).
  /** @internal */
  _getPrimDataAtPathOrInPrototype(path: string): UsdPrimData | undefined {
    const primData = this._primMap.get(path)
    if (primData) return primData
    const primInPrototypePath = this._instanceCache.getPathInPrototypeForInstancePath(path)
    return primInPrototypePath !== undefined ? this._primMap.get(primInPrototypePath) : undefined
  }

  // _GetPrototypeForInstance (stage.cpp:2859-2870).
  /** @internal */
  _getPrototypeForInstance(prim: UsdPrimData): UsdPrimData | undefined {
    if (!prim.isInstance()) return undefined
    const index = prim.getPrimIndex()
    if (!index) return undefined
    const protoPath = this._instanceCache.getPrototypeForInstanceablePrimIndexPath(
      index.getRootNode().path.pathString)
    return protoPath === undefined ? undefined : this._primMap.get(protoPath)
  }

  // _InstantiatePrim (stage.cpp:2925-2939).
  private _instantiatePrim(primPath: string): UsdPrimData {
    const p = new UsdPrimData(this, primPath)
    this._primMap.set(primPath, p)
    return p
  }

  // _InstantiatePrototypePrim (stage.cpp:2941-2953): parented beneath the
  // pseudo-root, but not one of its children.
  private _instantiatePrototypePrim(primPath: string): UsdPrimData {
    const prototypePrim = this._instantiatePrim(primPath)
    prototypePrim._setParentLink(this._pseudoRoot!)
    return prototypePrim
  }

  // _ComposeChildren (stage.cpp:2981-3241), preserving existing child prims
  // and recomposing the subtrees of all children when `recurse`.
  private _composeChildren(
    prim: UsdPrimData, mask: StagePopulationMask | undefined, recurse: boolean,
  ): void {
    // A deactivated prim or an instance exposes no children.
    if (!prim.isActive() || prim.isInstance()) {
      this._destroyDescendents(prim)
      return
    }
    let nameOrder = prim.getSourcePrimIndex().computePrimChildNames()
    if (mask) {
      // Masks apply to the source prim index path ("uninstanced" namespace).
      const sourceIndexPath = prim.getSourcePrimIndex().getRootNode().path.pathString
      if (mask.includesSubtree(sourceIndexPath)) {
        mask = undefined
      } else {
        nameOrder = nameOrder.filter(name => mask!.includes(childPath(sourceIndexPath, name)))
      }
    }
    if (nameOrder.length === 0) {
      this._destroyDescendents(prim)
      return
    }

    // The first mismatch between the current children and nameOrder.
    const current = [...prim._children()]
    let i = 0
    for (; i < current.length && i < nameOrder.length; i++) {
      if (current[i]!.name !== nameOrder[i]) break
    }
    if (recurse) {
      for (let j = 0; j < i; j++) this._composeChildSubtree(current[j]!, prim, mask)
    }
    // Children unchanged.
    if (i === current.length && i === nameOrder.length) return

    // Children appended at the end.
    if (i === current.length) {
      const added: UsdPrimData[] = []
      for (let j = i; j < nameOrder.length; j++) {
        const tail = this._instantiatePrim(childPath(prim.path, nameOrder[j]!))
        if (recurse) this._composeChildSubtree(tail, prim, mask)
        added.push(tail)
      }
      this._linkChildren(prim, current.slice(0, i), added)
      return
    }

    // Children removed from the end.
    if (i === nameOrder.length) {
      for (let j = i; j < current.length; j++) this._destroyPrim(current[j]!)
      this._linkChildren(prim, current.slice(0, i), [])
      return
    }

    // General recomposition: keep existing children whose names remain and
    // order everything by nameOrder.
    const trailingOld = new Map(current.slice(i).map(child => [child.name, child]))
    const ordered: UsdPrimData[] = []
    for (let j = i; j < nameOrder.length; j++) {
      const name = nameOrder[j]!
      let child = trailingOld.get(name)
      if (child) trailingOld.delete(name)
      else child = this._instantiatePrim(childPath(prim.path, name))
      if (recurse) this._composeChildSubtree(child, prim, mask)
      ordered.push(child)
    }
    for (const dead of trailingOld.values()) this._destroyPrim(dead)
    this._linkChildren(prim, current.slice(0, i), ordered)
  }

  // Set the sibling and parent links for `prefix` followed by `rest`.
  private _linkChildren(
    prim: UsdPrimData, prefix: readonly UsdPrimData[], rest: readonly UsdPrimData[],
  ): void {
    const all = [...prefix, ...rest]
    if (all.length === 0) {
      prim._firstChild = null
      return
    }
    prim._firstChild = all[0]!
    for (let j = 0; j < all.length - 1; j++) all[j]!._setSiblingLink(all[j + 1]!)
    all[all.length - 1]!._setParentLink(prim)
  }

  // _ComposeChildSubtree (stage.cpp:3243-3258).
  private _composeChildSubtree(
    prim: UsdPrimData, parent: UsdPrimData, mask: StagePopulationMask | undefined,
  ): void {
    if (parent.isInPrototype()) {
      // A prototype child's source index is beneath the parent's source.
      const sourcePrimIndexPath = childPath(
        parent.getSourcePrimIndex().getRootNode().path.pathString, prim.name)
      this._composeSubtree(prim, parent, mask, sourcePrimIndexPath)
    } else {
      this._composeSubtree(prim, parent, mask)
    }
  }

  // _ComposeSubtreeImpl (stage.cpp:3441-3526).
  private _composeSubtree(
    prim: UsdPrimData, parent: UsdPrimData | undefined, mask: StagePopulationMask | undefined,
    primIndexPath = prim.path,
  ): void {
    const cache = this._pcpCache!
    cache.recordComputationEvent('materialization', prim.path)
    prim._primIndex = cache.findPrimIndex(primIndexPath) ?? null
    if (!prim._primIndex) {
      throw new Error(`Prim index at <${primIndexPath}> not found in PcpCache`)
    }
    parent = parent ?? prim.getParent()
    // A child of the pseudo-root whose index is elsewhere is a prototype.
    const isPrototypePrim = parent === this._pseudoRoot &&
      prim._primIndex.getRootNode().path.pathString !== prim.path
    this._composeAndCacheFlags(prim, parent, isPrototypePrim)
    this._composePrimTypeInfo(prim)
    if (prim.path !== '/') {
      const hasClips = this._clipSetsByPrim.has(primIndexPath) ||
        computeClipSetDefinitionsForPrimAndAncestors(prim._primIndex, clipAncestorLevels(prim)) !== undefined
      prim._setFlag(UsdPrimFlag.Clips, hasClips || (parent?.mayHaveOpinionsInClips() ?? false))
    } else {
      // Composing the pseudo-root computes the stage's fallback type map,
      // needed for every other prim's type info.
      this._computeInvalidPrimTypeToFallbackMap()
    }
    this._composeChildren(prim, mask, true)
  }

  // Usd_PrimData::_ComposeAndCacheFlags (primData.cpp:111-187).
  private _composeAndCacheFlags(
    prim: UsdPrimData, parent: UsdPrimData | undefined, isPrototypePrim: boolean,
  ): void {
    const set = (flag: UsdPrimFlag, value: boolean): void => prim._setFlag(flag, value)
    if (!parent || isPrototypePrim) {
      set(UsdPrimFlag.Active, true)
      set(UsdPrimFlag.Loaded, true)
      set(UsdPrimFlag.Model, true)
      set(UsdPrimFlag.Group, true)
      set(UsdPrimFlag.Component, false)
      set(UsdPrimFlag.Defined, true)
      set(UsdPrimFlag.HasDefiningSpecifier, true)
      set(UsdPrimFlag.HasClassSpecifier, false)
      set(UsdPrimFlag.Prototype, isPrototypePrim)
      set(UsdPrimFlag.PseudoRoot, !parent)
      return
    }
    const index = prim._primIndex!
    const active = Stage._isActive(index)
    set(UsdPrimFlag.Active, active)
    const hasPayload = index.hasAnyPayloads()
    set(UsdPrimFlag.HasPayload, hasPayload)
    set(UsdPrimFlag.Loaded, active && (hasPayload
      ? this._pcpCache!.isPayloadIncluded(index.getRootNode().path)
      : parent.isLoaded()))
    let isGroup = false, isModel = false, isComponent = false
    if (parent.isGroup()) {
      const kind = Stage._getKind(index)
      if (kind) {
        isGroup = kindIsA(kind, 'group')
        isComponent = kindIsA(kind, 'component')
        isModel = isGroup || isComponent || kindIsA(kind, 'model')
      }
    }
    set(UsdPrimFlag.Group, isGroup)
    set(UsdPrimFlag.Model, isModel)
    set(UsdPrimFlag.Component, isComponent)
    const specifier = usdResolveDefiningSpecifier(index)
    const hasClassSpecifier = specifier === 'class'
    set(UsdPrimFlag.HasClassSpecifier, hasClassSpecifier)
    set(UsdPrimFlag.Abstract, hasClassSpecifier || parent.isAbstract())
    const isDefiningSpec = specifier === 'def' || specifier === 'class'
    set(UsdPrimFlag.HasDefiningSpecifier, isDefiningSpec)
    set(UsdPrimFlag.Defined, isDefiningSpec && parent.isDefined())
    set(UsdPrimFlag.Clips, false)
    set(UsdPrimFlag.Instance, active && index.isInstanceable())
    set(UsdPrimFlag.Prototype, parent.isInPrototype())
  }

  // UsdStage::_IsActive (stage.cpp:6501-6516): the strongest 'active' opinion.
  private static _isActive(index: PcpPrimIndex): boolean {
    const active = usdResolvePrimField(index, 'active')
    return active === undefined ? true : Boolean(active)
  }

  // UsdStage::_GetKind (stage.cpp:6479-6499).
  private static _getKind(index: PcpPrimIndex): string {
    const kind = usdResolvePrimField(index, 'kind')
    return typeof kind === 'string' ? kind : ''
  }

  // _ComposePrimTypeInfoImpl (stage.cpp:3528-3552) with _ComposeTypeName and
  // _ComposeAuthoredAppliedSchemas.
  private _composePrimTypeInfo(prim: UsdPrimData): void {
    if (prim.isPseudoRoot() || prim.isPrototype()) {
      prim._primTypeInfo = UsdPrimTypeInfo.getEmptyPrimType()
      return
    }
    const index = prim._primIndex!
    let typeName = ''
    for (const site of usdPrimSpecSites(index)) {
      const value = site.layer.getField(site.specPath, 'typeName')
      if (typeof value === 'string' && value !== '' && value !== '__AnyType__') {
        typeName = value
        break
      }
    }
    const appliedAPISchemas = usdComposePrimListOpField(index, 'apiSchemas')
    const mappedTypeName = this._invalidPrimTypeToFallbackMap.get(typeName) ?? ''
    prim._primTypeInfo = UsdPrimTypeInfo._findOrCreatePrimTypeInfo(
      typeName, mappedTypeName, appliedAPISchemas)
  }

  // Usd_PrimTypeInfoCache::ComputeInvalidPrimTypeToFallbackMap
  // (primTypeInfoCache.cpp:13-48) over the stage's fallbackPrimTypes.
  private _computeInvalidPrimTypeToFallbackMap(): void {
    const map = new Map<string, string>()
    const raw = this.getMetadata('fallbackPrimTypes')
    if (_sdfIsDictionary(raw)) {
      for (const [typeName, fallbacks] of Object.entries(raw as Record<string, unknown>)) {
        if (!UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName(typeName).isUnknown()) continue
        if (!Array.isArray(fallbacks) && !(fallbacks instanceof VtArray)) continue
        for (const fallbackName of fallbacks as Iterable<unknown>) {
          if (typeof fallbackName === 'string' &&
              !UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName(fallbackName).isUnknown()) {
            map.set(typeName, fallbackName)
            break
          }
        }
      }
    }
    this._invalidPrimTypeToFallbackMap = map
  }

  // Explicit-lifetime adaptation of UsdStage::~UsdStage (stage.cpp:909-916):
  // JavaScript has no deterministic destructor, so the owner ends the stage's
  // lifetime here. Prim handles, ranges and traversals then observe dead prim
  // data as upstream's handles do once the stage is destroyed
  // (primDataHandle.h:69-86). The stage must not be used afterwards.
  dispose(): void {
    this._close()
  }

  // UsdStage::_Close (stage.cpp:919-970): stop listening for notices and
  // destroy the prim structure, including prototype subtrees, which are not
  // children of the pseudo-root.
  private _close(): void {
    for (const key of this._layersAndNoticeKeys.values()) key.revoke()
    this._layersAndNoticeKeys.clear()
    this._resolverChangeKey?.()
    this._resolverChangeKey = undefined
    if (this._pseudoRoot) {
      for (const prototypePath of this._instanceCache.getAllPrototypes()) {
        const prototype = this._primMap.get(prototypePath)
        if (prototype) this._destroyPrim(prototype)
      }
      this._destroyPrim(this._pseudoRoot)
      this._pseudoRoot = null
    }
  }

  // _DestroyDescendents (stage.cpp:3528-3545).
  private _destroyDescendents(prim: UsdPrimData): void {
    const children = [...prim._children()]
    prim._firstChild = null
    for (const child of children) this._destroyPrim(child)
  }

  // _DestroyPrim (stage.cpp:3575-3600).
  private _destroyPrim(prim: UsdPrimData): void {
    this._destroyDescendents(prim)
    this._primMap.delete(prim.path)
    this._clipSetsByPrim.delete(prim.path)
    if (this._usdDependenciesByPrim.delete(prim.path)) this._usdDependenciesRevision++
    prim._markDead()
  }

  // _NameChildrenPred (stage.cpp:978-1024).
  private _nameChildrenPred(index: PcpPrimIndex, childNamesToCompose: string[]): boolean {
    this._pcpCache!.recordComputationEvent('namespaceDiscovery', index.getRootNode().path.pathString)
    if (!Stage._isActive(index)) return false
    // Children of instances are composed only for a prototype's source.
    if (index.isInstanceable()) {
      const key = usdInstanceKey(index, this._loadRules, this._populationMask)
      if (key !== null) {
        return this._instanceCache.registerInstancePrimIndex(
          index.getRootNode().path.pathString, key)
      }
    }
    const mask = this._populationMask
    if (!mask) return true
    const included = mask.getIncludedChildNames(index.getRootNode().path.pathString)
    if (included.all) return true
    const kept = childNamesToCompose.filter(name => included.names.includes(name))
    childNamesToCompose.splice(0, childNamesToCompose.length, ...kept)
    return kept.length > 0
  }

  // _ComposePrimIndexesInParallel (stage.cpp:5330-5392).
  private *_composePrimIndexesInParallel(
    primIndexPaths: readonly string[], instanceChanges: UsdInstanceChanges,
  ): PcpMaybeAsync<void> {
    const cache = this._pcpCache!
    yield* cache._computePrimIndexesInParallel(primIndexPaths,
      (index, childNames) => this._nameChildrenPred(index, childNames),
      path => this._loadRules.isIncluded(path))
    const changes = this._instanceCache.processChanges()
    instanceChanges.newPrototypePrims.push(...changes.newPrototypePrims)
    instanceChanges.newPrototypePrimIndexes.push(...changes.newPrototypePrimIndexes)
    instanceChanges.changedPrototypePrims.push(...changes.changedPrototypePrims)
    instanceChanges.changedPrototypePrimIndexes.push(...changes.changedPrototypePrimIndexes)
    instanceChanges.deadPrototypePrims.push(...changes.deadPrototypePrims)
    // Prototypes whose source index changed compose their new sources.
    if (changes.changedPrototypePrims.length > 0) {
      yield* this._composePrimIndexesInParallel(changes.changedPrototypePrimIndexes, instanceChanges)
    }
  }

  // Population on open (UsdStage::_InstantiateStage, stage.cpp:1060-1090).
  private async _populate(): Promise<void> {
    const result = pcpRunMaybeAsync(this._populateMaybeAsync())
    if (result instanceof Promise) await result
    await this._prepareAssetPaths()
  }

  private *_populateMaybeAsync(): PcpMaybeAsync<void> {
    const instanceChanges = emptyInstanceChanges()
    yield* this._composePrimIndexesInParallel(['/'], instanceChanges)
    this._pseudoRoot = this._instantiatePrim('/')
    const subtrees: Array<[UsdPrimData, string]> = [[this._pseudoRoot, '/']]
    for (let i = 0; i < instanceChanges.newPrototypePrims.length; i++) {
      subtrees.push([
        this._instantiatePrototypePrim(instanceChanges.newPrototypePrims[i]!),
        instanceChanges.newPrototypePrimIndexes[i]!,
      ])
    }
    for (const [prim, primIndexPath] of subtrees) {
      this._composeSubtree(prim, prim.getParent(), this._populationMask, primIndexPath)
    }
    yield* this._populateClips(subtrees.map(([prim]) => prim))
  }

  // Usd_ClipCache::PopulateClipsForPrim for the prims in these subtrees.
  // Clip layers open asynchronously here, where upstream opens them during
  // value resolution; prims without clips need nothing opened.
  private *_populateClips(roots: readonly UsdPrimData[]): PcpMaybeAsync<void> {
    const opener = _makePcpLayerOpener(undefined, this._resolver, this._resolverContext)
    const stack = [...roots].reverse()
    while (stack.length > 0) {
      const prim = stack.pop()!
      if (!prim._isDead() && prim._primIndex && prim.path !== '/' && !prim.isPrototype()) {
        const sourcePath = prim._primIndex.getRootNode().path.pathString
        this._pcpCache!.recordComputationEvent('usdDependencyResolution', sourcePath)
        const maxLevel = clipAncestorLevels(prim)
        if (!computeClipSetDefinitionsForPrimAndAncestors(prim._primIndex, maxLevel)) {
          this._clipSetsByPrim.delete(sourcePath)
          if (this._usdDependenciesByPrim.delete(sourcePath)) this._usdDependenciesRevision++
        } else {
          const dependencies = new Set<Layer>()
          const trackingOpener: PcpLayerOpener = async path => {
            const layer = await opener(path)
            if (layer) dependencies.add(layer as Layer)
            return layer
          }
          const clipSets = (yield resolveClipSetsForPrimIndex(prim._primIndex, trackingOpener, maxLevel)) as
            ResolvedClipSet[] | undefined
          if (clipSets) this._clipSetsByPrim.set(sourcePath, clipSets)
          else this._clipSetsByPrim.delete(sourcePath)
          if (dependencies.size > 0) this._usdDependenciesByPrim.set(sourcePath, dependencies)
          else this._usdDependenciesByPrim.delete(sourcePath)
          this._usdDependenciesRevision++
        }
      }
      const children = [...prim._children()]
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
    }
  }

  // _RecomposePrims (stage.cpp:5078-5226) for the given recompose paths,
  // which gain the prototype paths recomposed or destroyed for notification.
  private *_recomposePrims(pathsToRecompose: UsdPathsToChangesMap): PcpMaybeAsync<void> {
    if (pathsToRecompose.size === 0) return

    // Prune descendant paths.
    removeDescendentEntries(pathsToRecompose)

    // Ask Pcp to compute all the prim indexes, stopping at stuff that's not
    // active.
    const primPathsToRecompose: string[] = []
    for (const sdfPath of sortedChangedPaths(pathsToRecompose)) {
      if (!sdfPath.isAbsoluteRootOrPrimPath() || sdfPath.containsPrimVariantSelection()) continue
      const path = sdfPath.pathString
      // Instance prims don't expose any name children, so prim indexes
      // beneath instances recompose only as the source index of a prototype.
      if (this._instanceCache.isPathDescendantToAnInstance(path) &&
          !this._instanceCache.prototypeUsesPrimIndexPath(path)) continue
      // Unregister all instances beneath the given path, to determine which
      // instance prim indexes are no longer present.
      this._instanceCache.unregisterInstancePrimIndexesUnder(path)
      primPathsToRecompose.push(path)
    }

    const instanceChanges = emptyInstanceChanges()
    yield* this._composePrimIndexesInParallel(primPathsToRecompose, instanceChanges)

    // Determine what instance prototype prims on this stage need to be
    // recomposed due to instance prim index changes.
    const prototypeToPrimIndex = new Map<string, string>()
    const pathsContainsAbsRoot = pathsToRecompose.has('/')
    const origNumPathsToRecompose = pathsToRecompose.size
    for (const path of [...pathsToRecompose.keys()]) {
      // Add corresponding inPrototypePaths for any instance or proxy paths.
      for (const inPrototypePath of this._instanceCache.getPrimsInPrototypesUsingPrimIndexPath(path)) {
        prototypeToPrimIndex.set(inPrototypePath, path)
        addToChangedPaths(pathsToRecompose, inPrototypePath)
      }
      // Add any unchanged prototypes whose instances are descendents of paths
      // in pathsToRecompose.
      for (const [prototypePath, sourceIndexPath] of
        this._instanceCache.getPrototypesUsingPrimIndexPathOrDescendents(path)) {
        prototypeToPrimIndex.set(prototypePath, sourceIndexPath)
        addToChangedPaths(pathsToRecompose, prototypePath)
      }
    }
    // Add new and changed prototype paths.
    for (let i = 0; i < instanceChanges.newPrototypePrims.length; i++) {
      prototypeToPrimIndex.set(
        instanceChanges.newPrototypePrims[i]!, instanceChanges.newPrototypePrimIndexes[i]!)
      addToChangedPaths(pathsToRecompose, instanceChanges.newPrototypePrims[i]!)
    }
    for (let i = 0; i < instanceChanges.changedPrototypePrims.length; i++) {
      prototypeToPrimIndex.set(
        instanceChanges.changedPrototypePrims[i]!, instanceChanges.changedPrototypePrimIndexes[i]!)
      addToChangedPaths(pathsToRecompose, instanceChanges.changedPrototypePrims[i]!)
    }
    // If the pseudo-root is present, the only other paths are prototypes,
    // which must not be removed.
    if (!pathsContainsAbsRoot && pathsToRecompose.size !== origNumPathsToRecompose) {
      removeDescendentEntries(pathsToRecompose)
    }

    const subtreesToRecompose = this._computeSubtreesToRecompose(
      sortedChangedPaths(pathsToRecompose).map(path => path.pathString))
    for (const prim of subtreesToRecompose) {
      this._composeSubtree(prim, prim.getParent(), this._populationMask,
        prototypeToPrimIndex.get(prim.path) ?? prim.path)
    }

    // Destroy dead prototype subtrees, making sure to record them in paths
    // to recompose for notifications.
    for (const path of instanceChanges.deadPrototypePrims) {
      addToChangedPaths(pathsToRecompose, path)
      const prim = this._primMap.get(path)
      if (prim) this._destroyPrim(prim)
    }
    yield* this._populateClips(subtreesToRecompose)
  }

  // _ComputeSubtreesToRecompose (stage.cpp:5228-5310): recompose each
  // parent's list of children once, then the affected subtrees.
  private _computeSubtreesToRecompose(paths: readonly string[]): UsdPrimData[] {
    const subtrees: UsdPrimData[] = []
    let i = 0
    while (i < paths.length) {
      const path = paths[i]!
      const sdfPath = SdfPath.fromString(path)
      if (!sdfPath.isAbsoluteRootOrPrimPath() || sdfPath.containsPrimVariantSelection()) {
        i++
        continue
      }
      if (isPrototypePath(path)) {
        subtrees.push(this._primMap.get(path) ?? this._instantiatePrototypePrim(path))
        i++
        continue
      }
      const parentPath = path === '/' ? '' : (path.slice(0, path.lastIndexOf('/')) || '/')
      const parent = parentPath === '' ? undefined : this._primMap.get(parentPath)
      if (parent) {
        this._composeChildren(parent,
          parent.isInPrototype() ? undefined : this._populationMask, false)
        // Siblings sharing this parent are consecutive.
        do {
          const p = paths[i]!
          const prim = this._primMap.get(p)
          if (prim) subtrees.push(prim)
          else if (isPrototypePath(p)) subtrees.push(this._instantiatePrototypePrim(p))
          i++
        } while (i < paths.length && parentOf(paths[i]!) === parentPath)
      } else if (parentPath === '') {
        subtrees.push(this._pseudoRoot!)
        i++
      } else {
        i++
      }
    }
    return subtrees
  }

  // UsdStage::GetPopulationMask: the all-inclusive mask unless the stage was
  // opened via openMasked (stage.cpp Open == OpenMasked(All)).
  private _populationMask?: StagePopulationMask

  getPopulationMask(): StagePopulationMask {
    return this._populationMask ?? StagePopulationMask.all()
  }

  // UsdStage::SetPopulationMask (stage.cpp:2743-2759): set the mask and
  // recompose everything — instancing keys re-evaluate with the new relative
  // masks, splitting or merging prototypes accordingly.
  async setPopulationMask(mask: StagePopulationMask): Promise<void> {
    // For now just set the mask and recompose everything.
    this._populationMask = mask
    const result = this._runCompositionPass(this._recomposeAndNotifyAbsoluteRoot(true))
    if (result instanceof Promise) await result
    await this._prepareAssetPaths()
  }

  private _numericLayerMetadata(layer: Layer | null, field: string): number | undefined {
    const value = layer?.getField('/', field)
    return typeof value === 'number' ? value : undefined
  }

  private _numericRootMetadata(field: string): number | undefined {
    return this._numericLayerMetadata(this._rootLayer ?? this._editTarget, field)
  }

  // UsdStage stage metadata is composed over the session and root layers,
  // not the general prim-index layer stack (stage.cpp:10028-10113).
  private _numericSessionMetadata(field: string): number | undefined {
    return this._numericLayerMetadata(this._sessionLayer, field)
  }

  get startTimeCode(): number | undefined {
    return (this._rootLayer ?? this._editTarget)
      ? this._numericSessionMetadata('startTimeCode')
        ?? this._numericRootMetadata('startTimeCode')
      : this._initialStartTimeCode
  }

  get endTimeCode(): number | undefined {
    return (this._rootLayer ?? this._editTarget)
      ? this._numericSessionMetadata('endTimeCode')
        ?? this._numericRootMetadata('endTimeCode')
      : this._initialEndTimeCode
  }

  get timeCodesPerSecond(): number {
    if (this._rootLayer ?? this._editTarget) {
      return this._numericSessionMetadata('timeCodesPerSecond')
        ?? this._numericRootMetadata('timeCodesPerSecond')
        ?? this._numericSessionMetadata('framesPerSecond')
        ?? this._numericRootMetadata('framesPerSecond')
        ?? 24
    }
    return this._initialTimeCodesPerSecond ?? this._initialFramesPerSecond ?? 24
  }

  getFramesPerSecond(): number {
    if (this._rootLayer ?? this._editTarget) {
      return this._numericSessionMetadata('framesPerSecond')
        ?? this._numericRootMetadata('framesPerSecond')
        ?? 24
    }
    return this._initialFramesPerSecond ?? 24
  }

  // UsdStage::SetInterpolationType/GetInterpolationType
  // (pxr/usd/usd/stage.cpp:10214-10231). Changing the policy can alter every
  // interpolated value, so OpenUSD resyncs the absolute root.
  setInterpolationType(interpolationType: UsdInterpolationType): void {
    if (this._interpolationType === interpolationType) return
    this._interpolationType = interpolationType
    // Notify, as interpolated attributes values have likely changed.
    this._runCompositionPassFromNotice(this._recomposeAndNotifyAbsoluteRoot(false))
  }

  getInterpolationType(): UsdInterpolationType { return this._interpolationType }

  // HasAuthoredTimeCodeRange requires a complete authored pair on either the
  // session or root layer; it does not synthesize a pair across layers and
  // does not impose an ordering constraint (stage.cpp:10069-10084).
  hasAuthoredTimeRange(): boolean {
    const hasPair = (layer: Layer | null): boolean =>
      this._numericLayerMetadata(layer, 'startTimeCode') !== undefined &&
      this._numericLayerMetadata(layer, 'endTimeCode') !== undefined
    return hasPair(this._sessionLayer) || hasPair(this._rootLayer ?? this._editTarget)
  }

  // UsdStage::IsSupportedFile (stage.cpp:3673-3689): whether a file format
  // is registered for the file's extension. An empty path is a coding error.
  static isSupportedFile(filePath: string): boolean {
    if (filePath === '') {
      TfDiagnosticMgr.GetInstance().postError(new TfError('Empty file path given', TfDiagnosticType.CodingError))
      return false
    }
    // grab the file's extension, and assert it to be valid; if the extension
    // is valid we'll get a non null FileFormatPtr
    return SdfFileFormat.findByExtension(filePath) !== undefined
  }

  // Get the global variant fallback preferences used in new stages
  // (UsdStage::GetGlobalVariantFallbacks). Lazily seeded from plugin
  // metadata ("UsdVariantFallbacks") on first access; returns a copy.
  static getGlobalVariantFallbacks(): Record<string, string[]> {
    return _copyVariantFallbacks(
      _globalVariantFallbacks ??= _seedGlobalVariantFallbacksFromPlugins())
  }

  // Set the global variant fallback preferences used in new stages
  // (UsdStage::SetGlobalVariantFallbacks). Overrides any fallbacks
  // configured in plugin metadata, and only affects stages created after
  // this call — existing stages are unaffected.
  static setGlobalVariantFallbacks(fallbacks: Record<string, readonly string[]>): void {
    _globalVariantFallbacks = _copyVariantFallbacks(fallbacks)
  }

  /**
   * The process-wide fallback color configuration and color management
   * system, from plugInfo "UsdColorConfigFallbacks" or
   * setColorConfigFallbacks (UsdStage::GetColorConfigFallbacks,
   * stage.cpp:10236-10248). Upstream fills two out parameters; this returns
   * them as the Python binding does, as (colorConfiguration,
   * colorManagementSystem).
   */
  static getColorConfigFallbacks(): [SdfAssetPath, string] {
    const [colorConfiguration, colorManagementSystem] = _getColorConfigurationFallbacks()
    return [colorConfiguration, colorManagementSystem]
  }

  /**
   * Sets the fallback color configuration and color management system;
   * an empty value leaves its fallback unchanged
   * (UsdStage::SetColorConfigFallbacks, stage.cpp:10250-10259).
   */
  static setColorConfigFallbacks(colorConfiguration: SdfAssetPath, colorManagementSystem: string): void {
    const fallbacks = _getColorConfigurationFallbacks()
    if (colorConfiguration.getAssetPath() !== '') fallbacks[0] = colorConfiguration
    if (colorManagementSystem !== '') fallbacks[1] = colorManagementSystem
  }

  // This stage's variant fallbacks, captured from the process-global map at
  // stage creation (UsdStage ctor: _cache->SetVariantFallbacks(
  // GetGlobalVariantFallbacks())) and reapplied on every recompose.
  private _variantFallbacks: Record<string, readonly string[]> = Stage.getGlobalVariantFallbacks()

  // Opens an existing USD file and composes the stage from it. A Layer
  // argument is UsdStage::Open(const SdfLayerHandle& rootLayer,
  // InitialLoadSet load) (stage.h:330-333).
  // A file path that cannot be opened yields undefined, as UsdStage::Open
  // returns null (stage.cpp:1285-1289).
  static open(rootLayer: Layer, options?: StageOpenOptions): Promise<Stage>
  static open(filePath: string, options?: StageOpenOptions): Promise<Stage | undefined>
  static async open(rootLayer: string | Layer, options?: StageOpenOptions): Promise<Stage | undefined> {
    const label = typeof rootLayer === 'string' ? rootLayer : rootLayer.filePath
    // UsdStage::_OpenImpl (stage.cpp:1414-1446) consults the bound
    // UsdStageCacheContexts; they are read now, before anything is awaited.
    const caches = {
      readable: UsdStageCacheContext._getReadableCaches(),
      writable: UsdStageCacheContext._getWritableCaches(),
    }
    return _withStageOpenTrace(label, traceContext =>
      Stage._open(rootLayer, options, traceContext, undefined, caches))
  }

  // UsdStage::OpenMasked (stage.cpp:2765+): compose only the subtrees the
  // population mask includes. Open() is OpenMasked with the all-inclusive
  // mask.
  static openMasked(
    layer: Layer,
    mask: StagePopulationMask,
    options?: StageOpenOptions,
  ): Promise<Stage>
  static async openMasked(
    filePath: string,
    mask: StagePopulationMask,
    options?: StageOpenOptions,
  ): Promise<Stage | undefined>
  static async openMasked(
    rootLayer: string | Layer,
    mask: StagePopulationMask,
    options?: StageOpenOptions,
  ): Promise<Stage | undefined> {
    const label = typeof rootLayer === 'string' ? rootLayer : rootLayer.filePath
    return _withStageOpenTrace(label, traceContext =>
      Stage._open(rootLayer, options, traceContext, mask))
  }

  private static async _open(
    rootLayer: string | Layer,
    options: StageOpenOptions | undefined,
    traceContext: UsdTraceContext,
    mask?: StagePopulationMask,
    caches?: { readable: UsdStageCache[], writable: UsdStageCache[] },
  ): Promise<Stage | undefined> {
    const resolver = ArGetResolver()
    const suppliedResolverContext = options?.resolverContext
    const rootOpenContext = suppliedResolverContext ?? new ArResolverContext()
    // UsdStage::Open / OpenMasked (stage.cpp:1285-1289, 1319-1322): a root
    // layer that fails to open posts a runtime error after SdfLayer::
    // FindOrOpen's own, and there is no stage.
    const failedToOpen = (filePath: string): undefined => {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Failed to open layer @${filePath}@`, TfDiagnosticType.RuntimeError,
        mask ? { file: 'pxr/usd/usd/stage.cpp', function: 'UsdStage::OpenMasked', line: 1321 }
          : { file: 'pxr/usd/usd/stage.cpp', function: 'UsdStage::Open', line: 1287 }))
      return undefined
    }
    const layer = typeof rootLayer === 'string'
      ? await _withArTraceContext(rootOpenContext, traceContext, () =>
        _sdfFindOrOpenLayer(rootLayer, resolver, rootOpenContext))
      : rootLayer
    if (!layer) return failedToOpen(rootLayer as string)
    const rootResolvedPath = suppliedResolverContext || typeof rootLayer !== 'string'
      ? undefined
      : await resolver.resolve(rootLayer, rootOpenContext)
    // _CreatePathResolverContext (stage.cpp:783-798): an anonymous root
    // layer gets the resolver's default context.
    const resolverContext = suppliedResolverContext ?? (layer.isAnonymous()
      ? resolver.createDefaultContext()
      : resolver.createDefaultContextForAsset(
        rootResolvedPath?.toString() || layer.filePath,
      ))
    // Opened stages get an anonymous session layer (strongest in the local stack,
    // never saved with the asset). pcp builds its layer stack AT compose time, so
    // the session must exist before composeScene — otherwise it's absent from every
    // prim index (getLayerStack, session-edit composition).
    // A session layer path that fails to open fails the open as the root
    // layer does; upstream takes the session layer as an opened handle
    // (stage.h:285-289).
    const sessionSpecified = options?.sessionLayer !== undefined || !!options?.sessionLayerPath
    const specifiedSession = options?.sessionLayer !== undefined
      ? options.sessionLayer
      : options?.sessionLayerPath
        ? await _withArTraceContext(resolverContext, traceContext, () =>
          _sdfFindOrOpenLayer(options.sessionLayerPath!, resolver, resolverContext))
        : undefined
    if (sessionSpecified && specifiedSession === undefined) return failedToOpen(options!.sessionLayerPath!)
    // A readable cache's stage that satisfies the request (stage.cpp:1419-
    // 1424; the FindOneMatching overload is chosen by the arguments given).
    for (const cache of caches?.readable ?? []) {
      const found = sessionSpecified
        ? suppliedResolverContext
          ? cache.findOneMatching(layer, specifiedSession!, suppliedResolverContext)
          : cache.findOneMatching(layer, specifiedSession!)
        : suppliedResolverContext
          ? cache.findOneMatching(layer, suppliedResolverContext)
          : cache.findOneMatching(layer)
      if (found) return found
    }
    const sessionLayer = sessionSpecified
      ? specifiedSession!
      : _createAnonymousSessionLayer(layer, traceContext)
    // Captured ONCE here — a SetGlobalVariantFallbacks during the awaits
    // below must not give this stage a different map than it composed with.
    const variantFallbacks = Stage.getGlobalVariantFallbacks()
    const muted = new Set<string>()
    const instanceCache = new UsdInstanceCache()
    const loadRules = new StageLoadRules(options?.loadPayloads !== false)
    const opener = _makePcpLayerOpener(undefined, resolver, resolverContext)
    const num = (f: string) => {
      const v = layer.getField('/', f)
      return typeof v === 'number' ? v : undefined
    }
    // Opened stages get an anonymous session layer (strongest in the local
    // stack, never saved with the asset) and author to the ROOT layer by
    // default — both per UsdStage semantics.
    const stage = new Stage(layer, layer.filePath, {
      start: num('startTimeCode'),
      end: num('endTimeCode'),
      tps: num('timeCodesPerSecond'),
      fps: num('framesPerSecond'),
    }, instanceCache, loadRules)
    if (mask) stage._populationMask = mask
    stage._rootLayer = layer
    stage._sessionLayer = sessionLayer
    stage._variantFallbacks = variantFallbacks
    stage._resolver = resolver
    stage._resolverContext = resolverContext
    stage._muted = muted
    await _withOptionalTraceScope(traceContext, 'typescript-usd:composeScene', scope =>
      _withArTraceContext(resolverContext, scope, async () => {
        const cache = await _createPcpCacheWithTraceContext(
          layer, opener, sessionLayer ?? undefined, path => loadRules.isIncluded(path), scope, muted)
        _setPcpTraceContext(cache, undefined)
        cache.setVariantFallbacks(variantFallbacks)
        stage._pcpCache = cache
        await _withPcpTraceContext(cache, scope, () => stage._populate())
      }))
    stage._registerPerLayerNotices()
    stage._subscribeResolverChanges()
    // Publish this stage into all current writable caches (stage.cpp:1113-
    // 1116).
    for (const cache of caches?.writable ?? []) cache.insert(stage)
    return stage
  }

  // UsdStage::GetPathResolverContext (stage.h).
  getPathResolverContext(): ArResolverContext { return this._resolverContext }

  // ---- Layer muting (mirrors UsdStage::MuteLayer) ----
  //
  // Muting is per-stage SESSION state — it is never authored into any layer.
  // Muted layers are ignored by composition entirely (sublayers, references,
  // payloads); identifiers are canonicalized against the stage's root layer,
  // and muting a layer the stage has not used is not an error (it takes
  // effect if that layer is encountered later).

  private _rootLayer: Layer | null = null
  private _muted = new Set<string>()
  private _resolver!: ArResolver
  private _resolverContext!: ArResolverContext
  /** @internal Resolver state used by UsdUtils operations on this stage. */
  get _arResolver(): ArResolver { return this._resolver }
  /** @internal Context captured when this stage was opened. */
  get _arResolverContext(): ArResolverContext { return this._resolverContext }
  private _usedLayers = new Set<Layer>()
  // Retain the affected-path facts mapped through the pre-mute dependencies;
  // unmuting can then plan notices without opening or querying property values.
  // Usd-owned async dependencies (currently clip and manifest layers), keyed
  // by the source prim index whose clips opened them.
  private _usdDependenciesByPrim = new Map<string, Set<Layer>>()
  // Clip assets are prefetched at stage-open because Attribute queries are sync;
  // source selection remains per-property and query-time.
  private _clipSetsByPrim = new Map<string, ResolvedClipSet[]>()
  private _pcpCache: PcpCache | null = null

  // Canonical identifier: resolve against the root layer (the ArResolver
  // CreateIdentifier analog); unresolvable identifiers are kept as given.
  private _canonicalLayerId(layerIdentifier: string): string {
    return this._rootLayer?.resolveAsset(layerIdentifier) || layerIdentifier
  }

  getMutedLayers(): string[] { return [...this._muted] }

  isLayerMuted(layerIdentifier: string): boolean {
    return this._muted.has(this._canonicalLayerId(layerIdentifier))
  }

  async muteLayer(layerIdentifier: string): Promise<void> {
    await this.muteAndUnmuteLayers([layerIdentifier], [])
  }

  async unmuteLayer(layerIdentifier: string): Promise<void> {
    await this.muteAndUnmuteLayers([], [layerIdentifier])
  }

  async load(path = '/', policy: LoadPolicy = 'withDescendants'): Promise<void> {
    if (!this._isValidLoadPath(path)) throw new Error(`Cannot load unknown prim <${path}>`)
    await this.loadAndUnload([path], [], policy)
  }

  async unload(path = '/'): Promise<void> {
    await this.loadAndUnload([], [path])
  }

  async loadAndUnload(
    loadSet: Iterable<string>,
    unloadSet: Iterable<string>,
    policy: LoadPolicy = 'withDescendants',
  ): Promise<void> {
    const loads = [...new Set(loadSet)]
    const unloads = [...new Set(unloadSet)]
    // UsdStage::_IsValidForUnload (stage.cpp:2401-2415) rejects prototype
    // paths for both loading and unloading; upstream posts a coding error
    // and skips the path, the Python binding raises it. This rejects.
    for (const path of [...loads, ...unloads]) {
      if (isPathInPrototype(path)) {
        throw new TfError(`Attempted to load/unload a prototype path <${path}>`, TfDiagnosticType.CodingError)
      }
    }
    for (const path of loads) {
      if (!this._isValidLoadPath(path)) throw new Error(`Cannot load unknown prim <${path}>`)
    }

    if (unloads.length === 0 && loads.every(path =>
      policy === 'withDescendants'
        ? this._loadRules.isLoadedWithAllDescendants(path)
        : this._loadRules.isLoadedWithNoDescendants(path))) return
    if (loads.length === 0 && unloads.every(path =>
      this._loadRules.getEffectiveRuleForPath(path) === StageLoadRules.NoneRule)) return

    const finalLoads = new Set(loads)
    const finalUnloads = new Set(unloads)
    const before = this._loadRules.clone()
    this._loadRules.loadAndUnload(finalLoads, finalUnloads, policy)
    if (this._loadRules.equals(before)) return

    // Once the rules are established, find the most-ancestral currently
    // unloaded prim that each load implicitly brings in. This is the
    // ancestor walk in UsdStage::LoadAndUnload (stage.cpp:2586-2612).
    for (const path of [...finalLoads]) {
      let current = path
      while (true) {
        const slash = current.lastIndexOf('/')
        if (slash < 0) break
        const parent = slash === 0 ? '/' : current.slice(0, slash)
        const prim = this.getPrim(parent)
        if (prim?.isLoaded) {
          if (path !== current) finalLoads.add(current)
          break
        }
        if (parent === '/') break
        current = parent
      }
    }

    // Instance paths are the significant-change roots, then descendant paths
    // are removed exactly as SdfPath::RemoveDescendentPaths does
    // (stage.cpp:2614-2628).
    const roots: string[] = []
    const mapped = [...finalLoads, ...finalUnloads].map(path =>
      this._instanceCache.getMostAncestralInstancePath(path) ?? path)
    for (const path of mapped.sort(
      (a, b) => a.length - b.length || a.localeCompare(b))) {
      if (!roots.some(root => path === root || root === '/'
          || path.startsWith(`${root}/`))) roots.push(path)
    }
    await this._applyPayloadLoadRules(roots)
  }

  getLoadSet(): string[] {
    // UsdStage::GetLoadSet (stage.cpp:2685-2712) maps each included payload
    // path to a stage prim and drops the ones that no longer correspond to
    // populated prims (e.g. beneath a subtree that composed away without
    // re-evaluating its descendants' payloads).
    return [...(this._pcpCache?.getIncludedPayloads() ?? [])]
      .filter(path => this._primMap.has(path))
  }

  // UsdStage::FindLoadable (stage.cpp:2725-2733) through _DiscoverPayloads
  // (stage.cpp:2463-2497): every active, non-prototype prim at or below
  // rootPath, instance proxies included, whose source prim index has
  // payloads, by its stage path.
  findLoadable(rootPath = '/'): string[] {
    const root = this.getPrim(rootPath)
    if (!this._pcpCache || !root) return []
    const paths: string[] = []
    for (const prim of UsdPrimRange.fromPrim(root, TraverseInstanceProxies(PrimAllPrimsPredicate))) {
      if (!prim.isActive || prim.isPrototype()) continue
      if (prim._getSourcePrimIndex().hasAnyPayloads()) paths.push(prim.path)
    }
    return paths.sort()
  }

  getLoadRules(): StageLoadRules { return this._loadRules.clone() }

  async setLoadRules(rules: StageLoadRules): Promise<void> {
    if (this._loadRules.equals(rules)) return
    this._loadRules.setRules(rules.getRules())
    const cache = this._pcpCache
    if (!cache) return
    // UsdStage::SetLoadRules (stage.cpp:2725-2741) issues no payload
    // requests: the whole stage resyncs and the load-rules predicate
    // decides every payload during recomposition, synchronizing the
    // cache's included set as a side effect.
    const result = this._runCompositionPass(this._recomposeAndNotifyAbsoluteRoot(true))
    if (result instanceof Promise) await result
    await this._prepareAssetPaths()
  }

  private async _applyPayloadLoadRules(paths: readonly string[]): Promise<void> {
    const result = this._runCompositionPass(this._applyPayloadLoadRulesPass(paths))
    if (result instanceof Promise) await result
    // A load changes only the prims under these roots and adds layers without
    // editing the others, so only new layers and these subtrees are prepared.
    await this._prepareAssetPaths(paths)
  }

  private *_applyPayloadLoadRulesPass(paths: readonly string[]): PcpMaybeAsync<void> {
    const cache = this._pcpCache
    if (!cache || paths.length === 0) return
    // Load/unload resyncs the affected subtrees; the load-rules predicate
    // decides payload inclusion during recomposition and synchronizes the
    // cache's included set (primIndex.cpp:2645-2661, cache.cpp:1777-1782).
    // Entries beneath a subtree that composes away are pruned here — those
    // prims are never re-evaluated, and upstream's GetLoadSet equivalently
    // filters them against the populated stage (stage.cpp:2685-2712).
    const pcpChanges = new PcpChanges()
    const orphanedInclusions = cache.getIncludedPayloads().filter(payloadPath =>
      paths.some(root => payloadPath === root || root === '/'
        || payloadPath.startsWith(`${root}/`)))
    cache.requestPayloads([], orphanedInclusions, pcpChanges)
    for (const path of paths) pcpChanges.didChangeSignificantly(cache, SdfPath.fromString(path))
    // Recompose, given the resulting changes from Pcp (stage.cpp:2664-2682).
    const resyncChanges: UsdPathsToChangesMap = new Map()
    yield* this._recompose(pcpChanges, resyncChanges)
    for (const path of paths) addToChangedPaths(resyncChanges, path)
    new UsdNotice.ObjectsChanged(this, resyncChanges).send(this)
    new UsdNotice.StageContentsChanged(this).send(this)
  }

  private _isValidLoadPath(path: string): boolean {
    if (path === '/' || this.getPrim(path)) return true
    let ancestor = path
    while (ancestor.includes('/')) {
      ancestor = ancestor.slice(0, ancestor.lastIndexOf('/')) || '/'
      if (ancestor === '/') return false
      if (this.getPrim(ancestor)) return true
    }
    return false
  }

  // UsdStage::MuteAndUnmuteLayers (stage.cpp:4111-4162).
  async muteAndUnmuteLayers(muteLayers: string[], unmuteLayers: string[]): Promise<void> {
    const result = this._runCompositionPass(this._muteAndUnmuteLayers(muteLayers, unmuteLayers))
    if (result instanceof Promise) await result
    await this._prepareAssetPaths()
  }

  private *_muteAndUnmuteLayers(
    muteLayers: readonly string[], unmuteLayers: readonly string[],
  ): PcpMaybeAsync<void> {
    const canonicalMutes = muteLayers.map(id => this._canonicalLayerId(id))
    const canonicalUnmutes = unmuteLayers.map(id => this._canonicalLayerId(id))
    if (canonicalMutes.includes(this.rootLayerPath)) {
      throw new Error(`Cannot mute the stage's root layer: ${this.rootLayerPath}`)
    }
    const cache = this._pcpCache!
    const localPendingChanges = new UsdPendingChanges()
    const pending = this._pendingChanges ??= localPendingChanges

    const { newLayersMuted, newLayersUnmuted } = yield* cache._requestLayerMuting(
      canonicalMutes, canonicalUnmutes, pending.pcpChanges)
    for (const canonical of canonicalUnmutes) this._muted.delete(canonical)
    for (const canonical of canonicalMutes) this._muted.add(canonical)

    // Notify for layer muting/unmuting
    if (newLayersMuted.length > 0 || newLayersUnmuted.length > 0) {
      new UsdNotice.LayerMutingChanged(this, newLayersMuted, newLayersUnmuted).send(this)
    }

    if (pending.pcpChanges.isEmpty()) {
      this._pendingChanges = null
      return
    }

    // Muting may produce change lists for affected sublayers; compute and
    // process them all.
    const cacheChanges = pending.pcpChanges.getCacheChanges().get(cache)
    if (cacheChanges) {
      this._computePendingChanges(pending, cacheChanges.layerChangeListVec)
      const noticesDispatched = yield* this._processPendingChanges(pending)
      // If all layers that were muted and unmuted were empty, we still
      // send Objects/StageContents changed notifications.
      if (!noticesDispatched) {
        new UsdNotice.ObjectsChanged(this, new Map()).send(this)
        new UsdNotice.StageContentsChanged(this).send(this)
      }
    } else if (this._pendingChanges === pending) {
      this._pendingChanges = null
    }
  }

  // ---- Composition passes ----
  //
  // PLATFORM-DIVERGENCE(usd-async-layer-open-composition): upstream processes
  // layer changes synchronously inside the edit (UsdStage::_HandleLayersDidChange
  // -> PcpChanges::DidChange, stage.cpp, pcp/changes.cpp:732-1393), opening
  // any sublayer, reference or payload layer it needs with the synchronous
  // SdfLayer::FindOrOpen. Opening a layer here goes through an asynchronous
  // ArResolver (fetch in the browser), so a pass that needs an unopened layer
  // throws PcpNeedsLayer, waits for the load (pcp/src/maybeAsync.ts) and
  // finishes after the edit returns; callers read the recomposed stage after
  // `await stage.flushChanges()`. An edit whose layers are already open
  // recomposes synchronously, as upstream.
  //
  // typescript-usd adaptation: upstream recomposes synchronously, opening layers on
  // demand. Here a pass that needs no layer loaded also runs synchronously,
  // so its notices are sent before the call that triggered it returns. A
  // pass that must wait for a layer holds the stage's composition lock
  // until it completes; changes arriving meanwhile are processed after it,
  // in order. Changes made by the pass itself (or by notice listeners it
  // calls) are processed immediately, as upstream does.

  private _compositionTail: Promise<void> | null = null
  private _executingCompositionPass = false
  private _compositionErrors: unknown[] = []

  private _runCompositionPass<T>(pass: PcpMaybeAsync<T>): T | Promise<T> {
    if (this._compositionTail && !this._executingCompositionPass) {
      const queued = this._compositionTail.then(() => this._drivePass(pass))
      this._holdCompositionLock(queued)
      return queued
    }
    return this._drivePass(pass)
  }

  private _drivePass<T>(pass: PcpMaybeAsync<T>): T | Promise<T> {
    const step = this._stepPass(() => pass.next())
    if (step.done) return step.value
    const continued = this._continuePass(pass, step.value)
    this._holdCompositionLock(continued)
    return continued
  }

  private _stepPass<T>(
    fn: () => IteratorResult<Promise<unknown>, T>,
  ): IteratorResult<Promise<unknown>, T> {
    const wasExecuting = this._executingCompositionPass
    this._executingCompositionPass = true
    try {
      return fn()
    } finally {
      this._executingCompositionPass = wasExecuting
    }
  }

  private async _continuePass<T>(pass: PcpMaybeAsync<T>, wait: Promise<unknown>): Promise<T> {
    for (;;) {
      let value: unknown
      let failure: { error: unknown } | undefined
      try {
        value = await wait
      } catch (error) {
        failure = { error }
      }
      const step = this._stepPass(() => failure ? pass.throw(failure.error) : pass.next(value))
      if (step.done) return step.value
      wait = step.value
    }
  }

  private _holdCompositionLock(pass: Promise<unknown>): void {
    const previous = this._compositionTail
    const tail = (previous ? Promise.all([previous, pass]) : pass).then(
      () => undefined,
      (error: unknown) => { this._compositionErrors.push(error) })
    this._compositionTail = tail
    void tail.then(() => {
      if (this._compositionTail === tail) this._compositionTail = null
    })
  }

  // Runs a pass from a notice handler, where no caller can await it.
  private _runCompositionPassFromNotice(pass: PcpMaybeAsync<unknown>): void {
    const result = _withStageTraceSync('typescript-usd:Stage.processChanges', traceContext =>
      this._withTraceContexts(traceContext, () => this._runCompositionPass(pass)))
    if (result instanceof Promise) void result.catch(() => {})
  }

  // Installs a trace context on the stage's Pcp and instance caches while fn
  // runs synchronously.
  private _withTraceContexts<T>(traceContext: UsdTraceContext, fn: () => T): T {
    const cache = this._pcpCache
    if (!traceContext || !cache) return fn()
    const previous = _getPcpTraceContext(cache)
    _setPcpTraceContext(cache, traceContext)
    try {
      return _withUsdInstanceCacheTraceContext(this._instanceCache, traceContext, fn)
    } finally {
      _setPcpTraceContext(cache, previous)
    }
  }

  // UsdStage::_Recompose (stage.cpp:5019-5076).
  private *_recompose(
    changes: PcpChanges, pathsToRecompose: UsdPathsToChangesMap,
  ): PcpMaybeAsync<void> {
    yield* changes._applyMaybeAsync()
    // Process composed prim changes.
    const ourChanges = changes.getCacheChanges().get(this._pcpCache!)
    if (ourChanges) {
      for (const path of ourChanges.didChangeSignificantly) {
        addToChangedPaths(pathsToRecompose, path.pathString)
      }
      for (const path of ourChanges.didChangePrims) {
        addToChangedPaths(pathsToRecompose, path.pathString)
      }
    }
    yield* this._recomposePrims(pathsToRecompose)
    // Update layer change notice listeners if changes may affect the set of
    // used layers.
    this._registerPerLayerNotices()
  }

  // Recomposes the whole stage and notifies a resync of the absolute root,
  // as SetLoadRules, SetPopulationMask and SetInterpolationType do.
  private *_recomposeAndNotifyAbsoluteRoot(recompose: boolean): PcpMaybeAsync<void> {
    if (recompose) {
      const changes = new PcpChanges()
      changes.didChangeSignificantly(this._pcpCache!, SdfPath.absoluteRootPath)
      yield* this._recompose(changes, new Map())
    }
    const resyncChanges: UsdPathsToChangesMap = new Map([['/', []]])
    new UsdNotice.ObjectsChanged(this, resyncChanges).send(this)
    new UsdNotice.StageContentsChanged(this).send(this)
  }

  // _IsObjectDescendantOfInstance (stage.cpp:2346-2352).
  private _isObjectDescendantOfInstance(path: string): boolean {
    // The answer is false for every path while no prim index is an instance;
    // the path is not parsed then.
    if (!this._instanceCache.hasInstancePrimIndexes()) return false
    return this._instanceCache.isPathDescendantToAnInstance(
      SdfPath.fromString(path).getAbsoluteRootOrPrimPath().pathString)
  }

  // UsdStage::_ProcessPendingChanges (stage.cpp:4729-4955). Returns whether
  // notices were sent.
  private *_processPendingChanges(pending: UsdPendingChanges): PcpMaybeAsync<boolean> {
    const changes = pending.pcpChanges
    let recomposeChanges = pending.recomposeChanges
    let otherResyncChanges = pending.otherResyncChanges
    const otherInfoChanges = pending.otherInfoChanges
    let primTypeInfoChanges = pending.primTypeInfoChanges
    const assetPathResyncChanges = pending.assetPathResyncChanges
    const namespaceEditsInfo: UsdNotice.NamespaceEditsInfo = {
      primResyncsInfo: new Map(), renamedProperties: [],
    }

    yield* this._recompose(changes, recomposeChanges)

    // Filter out all changes to objects beneath instances and remap them to
    // the corresponding object in the instance's prototype. Do this after
    // _Recompose so that the instancing cache is up-to-date.
    const remapChangesToPrototypes = (pathChanges: UsdPathsToChangesMap): void => {
      if (pathChanges.size === 0) return
      const prototypeChanges: Array<[string, SdfChangeListEntry[]]> = []
      for (const [path, entries] of [...pathChanges]) {
        if (!this._isObjectDescendantOfInstance(path)) continue
        const sdfPath = SdfPath.fromString(path)
        const primIndexPath = sdfPath.getAbsoluteRootOrPrimPath()
        for (const pathInPrototype of
          this._instanceCache.getPrimsInPrototypesUsingPrimIndexPath(primIndexPath.pathString)) {
          prototypeChanges.push([
            sdfPath.replacePrefix(primIndexPath, SdfPath.fromString(pathInPrototype)).pathString,
            entries,
          ])
        }
        pathChanges.delete(path)
      }
      for (const [path, entries] of prototypeChanges) {
        const value = pathChanges.get(path)
        if (value) value.push(...entries)
        else pathChanges.set(path, [...entries])
      }
    }
    remapChangesToPrototypes(recomposeChanges)
    remapChangesToPrototypes(primTypeInfoChanges)
    remapChangesToPrototypes(assetPathResyncChanges)
    remapChangesToPrototypes(otherResyncChanges)
    remapChangesToPrototypes(otherInfoChanges)

    // Before processing any prim type info changes, remove any that would
    // already have been covered by the recomposed prims.
    mergeAndRemoveDescendentEntries(recomposeChanges, primTypeInfoChanges)

    // Recompose the prim type info for the prims that need it.
    for (const path of primTypeInfoChanges.keys()) {
      const prim = this._primMap.get(path)
      if (prim && !prim._isDead()) this._composePrimTypeInfo(prim)
    }

    // Even though we don't actually recompose prims that only have a type
    // info change, we still treat them as recomposed as far as notification
    // is concerned.
    if (recomposeChanges.size === 0) {
      [recomposeChanges, primTypeInfoChanges] = [primTypeInfoChanges, recomposeChanges]
    } else {
      for (const [path, entries] of primTypeInfoChanges) recomposeChanges.set(path, entries)
    }

    // Add in all other paths that are marked as resynced.
    if (recomposeChanges.size === 0) {
      [recomposeChanges, otherResyncChanges] = [otherResyncChanges, recomposeChanges]
    } else {
      removeDescendentEntries(recomposeChanges)
      mergeAndRemoveDescendentEntries(recomposeChanges, otherResyncChanges)
      for (const [path, entries] of otherResyncChanges) recomposeChanges.set(path, entries)
    }

    // If the pseudo-root had been recomposed, everything was recomposed.
    if (recomposeChanges.has('/')) otherInfoChanges.clear()

    // Remove all elements of otherInfoChanges that are prefixed by elements
    // in recomposeChanges.
    mergeAndRemoveDescendentEntries(recomposeChanges, otherInfoChanges)

    // Entries in assetPathResyncChanges imply subtree invalidation.
    if (assetPathResyncChanges.size > 0) {
      removeDescendentEntries(assetPathResyncChanges)
      mergeAndRemoveDescendentEntries(recomposeChanges, assetPathResyncChanges)
    }

    // If the UsdNamespaceEditor triggered the changes, classify the resyncs
    // of the expected namespace edits.
    for (const namespaceChange of pending.expectedNamespaceEditChanges) {
      const { oldPath, newPath } = namespaceChange
      // Skip deletes.
      if (!newPath) continue
      const oldSdfPath = SdfPath.fromString(oldPath)
      const newSdfPath = SdfPath.fromString(newPath)
      // We only add property renames to the ObjectsChanged notice.
      if (oldSdfPath.isPrimPropertyPath()) {
        if (newPath !== oldPath &&
            newSdfPath.getPrimPath().pathString === oldSdfPath.getPrimPath().pathString) {
          namespaceEditsInfo.renamedProperties.push([oldPath, newSdfPath.name])
        }
        continue
      }
      // A missing prim or a differing prim stack means the namespace edit
      // could not be performed completely as desired.
      if (!this.getPrim(newPath) ||
          !primStacksMatch(this._primSpecStack(newPath), namespaceChange.oldPrimStack)) continue
      if (oldPath === newPath) {
        namespaceEditsInfo.primResyncsInfo.set(oldPath,
          { resyncType: UsdNotice.PrimResyncType.UnchangedPrimStack, associatePath: '' })
        continue
      }
      let sourceType: UsdNotice.PrimResyncType
      let destType: UsdNotice.PrimResyncType
      if (oldSdfPath.name === newSdfPath.name) {
        sourceType = UsdNotice.PrimResyncType.ReparentSource
        destType = UsdNotice.PrimResyncType.ReparentDestination
      } else if (oldSdfPath.getParentPath().pathString === newSdfPath.getParentPath().pathString) {
        sourceType = UsdNotice.PrimResyncType.RenameSource
        destType = UsdNotice.PrimResyncType.RenameDestination
      } else {
        sourceType = UsdNotice.PrimResyncType.RenameAndReparentSource
        destType = UsdNotice.PrimResyncType.RenameAndReparentDestination
      }
      namespaceEditsInfo.primResyncsInfo.set(oldPath, { resyncType: sourceType, associatePath: newPath })
      namespaceEditsInfo.primResyncsInfo.set(newPath, { resyncType: destType, associatePath: oldPath })
    }

    // Reset _pendingChanges before sending notices so that any changes to
    // this stage that happen in response to the notices are handled.
    if (this._pendingChanges === pending) this._pendingChanges = null

    if (recomposeChanges.size > 0 || otherInfoChanges.size > 0 ||
        assetPathResyncChanges.size > 0) {
      // Notify about changed objects.
      new UsdNotice.ObjectsChanged(
        this, recomposeChanges, otherInfoChanges, assetPathResyncChanges, namespaceEditsInfo,
      ).send(this)
      // Receivers can now refresh their caches... or just dirty them
      new UsdNotice.StageContentsChanged(this).send(this)
      return true
    }
    return false
  }

  // ---- Change notification (UsdNotice) ----

  // Data for pending change processing (UsdStage::_pendingChanges).
  private _pendingChanges: UsdPendingChanges | null = null
  private _lastChangeSerialNumber = 0
  private _layersAndNoticeKeys = new Map<Layer, NoticeKey>()
  private _usedLayersRevision: number | undefined
  // typescript-usd: clip layers are registered too (usd-clip-layer-changes), so
  // changes to the Usd-owned dependencies also count as a new revision.
  private _usdDependenciesRevision = 0
  private _registeredUsdDependenciesRevision = -1

  /**
   * @internal UsdStage::_NamespaceEditsChangeBlock (stage.cpp:723-757):
   * pre-populates the stage's pending changes with the namespace edits the
   * UsdNamespaceEditor expects, which classify the resyncs it causes.
   */
  _openNamespaceEditsChangeBlock(
    expectedChanges: ReadonlyArray<{ oldPath: string; newPath?: string | undefined }>,
  ): { close(): void } {
    if (this._pendingChanges) {
      throw new Error('Cannot open a namespace editing change block while ' +
        'a stage still has pending changes to process.')
    }
    const localPendingChanges = new UsdPendingChanges()
    for (const { oldPath, newPath } of expectedChanges) {
      const oldSdfPath = SdfPath.fromString(oldPath)
      // The pre-edit prim stack, with the specs moved by the edit at their
      // new paths, as prim spec handles follow their specs.
      // The pre-edit prim stack as spec handles (stage.cpp:726-757).
      const oldPrimStack = oldSdfPath.isPrimPath() ? this._primSpecStack(oldPath) : []
      localPendingChanges.expectedNamespaceEditChanges.push({ oldPath, newPath, oldPrimStack })
    }
    this._pendingChanges = localPendingChanges
    return {
      close: () => {
        // The stage may not have received any change notifications.
        if (this._pendingChanges === localPendingChanges) this._pendingChanges = null
      },
    }
  }
  // ---- Variant set queries (over the retained composed prims) ----

  getVariantSets(primPath: string): UsdVariantSets {
    return new UsdVariantSets(this, primPath)
  }

  /** @internal */
  _sortedSpecsFor(primPath: string): SpecRef[] {
    // The legacy SpecRef provenance cache is not populated for Pcp-backed
    // stages, so derive the strong→weak list from the retained PcpPrimIndex
    // (composePrimStack is already in strength order). sourcePath is the layer-
    // scene key (segment form) so getF and the variant queries read correctly.
    if (this._pcpCache) {
      const index = this._pcpCache.findPrimIndex(primPath)
      if (index) {
        return index.composePrimStack().map((e) => ({
          layer: e.layer as unknown as Layer,
          sourcePath: pcpLayerPathKey(e.path),
          arc: [PCP_TO_ARC[e.arcType] ?? ARC.Local],
          offset: { offset: e.offset.offset, scale: e.offset.scale },
        }))
      }
      // No index yet — a freshly authored prim before the deferred recompose.
      // Any local-stack layer with a spec here is a LOCAL opinion (a brand-new
      // prim has no composition arcs); backs _validateEditable for namespace edits.
      const out: SpecRef[] = []
      for (const l of this.getLayerStack(true)) {
        if (l.getFieldNames(primPath).length > 0) {
          out.push({ layer: l, sourcePath: primPath, arc: [ARC.Local], offset: { offset: 0, scale: 1 } })
        }
      }
      return out
    }
    return []
  }

  /** @internal — scan the composed prim index for variant arcs for this set
   * and return the first selection found, so the result reflects whatever
   * composition process selected the variant, such as fallbacks
   * (UsdVariantSet::GetVariantSelection, variantSets.cpp). */
  _variantSelection(primPath: string, vsName: string): string {
    const index = this._pcpCache?.findPrimIndex(primPath)
    if (index) {
      for (const node of index.getNodeRange()) {
        if (node.arcType === PcpArcType.Variant) {
          const [set, sel] = node.path.getVariantSelection()
          if (set === vsName) return sel
        }
      }
      return ''
    }
    // In-memory stages before their first recompose retain no prim indexes;
    // fall back to scanning authored opinions strong→weak.
    for (const spec of this._sortedSpecsFor(primPath)) {
      const sel = getF(spec, 'variantSelection') as Record<string, string[] | string> | undefined
      const v = sel?.[vsName]
      if (v !== undefined) return Array.isArray(v) ? (v[0] ?? '') : v
    }
    return ''
  }

  // ---- Batched edits ----

  /**
   * Runs fn inside an SdfChangeBlock, so the edits it makes are processed
   * as one round of change processing with one ObjectsChanged notice, then
   * waits for that processing. An async fn keeps the block open until it
   * settles, batching any other edits made meanwhile too.
   */
  async changeBlock<T>(fn: () => T | Promise<T>): Promise<T> {
    const block = new SdfChangeBlock()
    try {
      return await fn()
    } finally {
      block.close()
      await this.flushChanges()
    }
  }

  /** @internal Waits for the change processing of an edit. */
  async _recomposeForEdit(_resyncPath?: string): Promise<void> {
    await this.flushChanges()
  }

  // ---- Change processing (the LayersDidChange model) ----

  private _resolverChangeKey: (() => void) | undefined

  private _subscribeResolverChanges(): void {
    const stage = new WeakRef(this)
    this._resolverChangeKey =
      _onResolverChanged(notice => stage.deref()?._handleResolverDidChange(notice))
  }

  // UsdStage::_RegisterPerLayerNotices (stage.cpp:5392-5463): listen for
  // LayersDidChange from exactly the layers this stage uses.
  private _registerPerLayerNotices(): void {
    // Avoid the work when the cache's used layers have not changed.
    const currentUsedLayersRevision = this._pcpCache?.getUsedLayersRevision()
    const usdDependenciesRevision = this._usdDependenciesRevision
    if (this._usedLayersRevision !== undefined &&
        this._usedLayersRevision === currentUsedLayersRevision &&
        this._registeredUsdDependenciesRevision === usdDependenciesRevision) return
    this._usedLayersRevision = currentUsedLayersRevision
    this._registeredUsdDependenciesRevision = usdDependenciesRevision
    const layers = new Set<Layer>()
    if (this._rootLayer) layers.add(this._rootLayer)
    if (this._sessionLayer) layers.add(this._sessionLayer)
    for (const layer of this._pcpCache?.getUsedLayers() ?? []) layers.add(layer as Layer)
    // FAITHFULNESS-DEBT(usd-clip-layer-changes): value clip layers are
    // listened to as well; upstream does not process their changes.
    for (const dependencies of this._usdDependenciesByPrim.values()) {
      for (const layer of dependencies) layers.add(layer)
    }
    this._usedLayers = layers
    for (const [layer, key] of this._layersAndNoticeKeys) {
      if (layers.has(layer)) continue
      key.revoke()
      this._layersAndNoticeKeys.delete(layer)
    }
    const stage = new WeakRef(this)
    for (const layer of layers) {
      if (this._layersAndNoticeKeys.has(layer)) continue
      const key: NoticeKey = TfNotice.Register(SdfNotice.LayersDidChangeSentPerLayer, notice => {
        const current = stage.deref()
        if (current) current._handleLayersDidChange(notice)
        else key.revoke()
      }, layer)
      this._layersAndNoticeKeys.set(layer, key)
    }
  }

  // UsdStage::_HandleLayersDidChange (stage.cpp:4430-4493).
  private _handleLayersDidChange(n: SdfNotice.LayersDidChangeSentPerLayer): void {
    // Ignore if this is not the round of changes we're looking for.
    const serial = n.getSerialNumber()
    if (serial === this._lastChangeSerialNumber) return
    this._lastChangeSerialNumber = serial
    const changeListVec = n.getChangeListVec() as SdfLayerChangeListVec<PcpLayer>
    // typescript-usd: clip set definitions are cached per authoring layer.
    for (const [layer, changeList] of changeListVec) {
      for (const [, entry] of changeList.getEntryList()) {
        if (entry.infoChanged.some(([field]) => isClipRelatedField(field))) {
          _invalidateLayerAuthorsClips(layer as Layer)
          break
        }
      }
    }
    this._runCompositionPassFromNotice(this._processLayersDidChange(changeListVec))
  }

  private *_processLayersDidChange(
    changeListVec: SdfLayerChangeListVec<PcpLayer>,
  ): PcpMaybeAsync<void> {
    const cache = this._pcpCache!
    // FAITHFULNESS-DEBT(usd-clip-layer-changes): changes to Usd-owned
    // dependencies that no Pcp layer stack uses (value clip layers)
    // recompose the stage; upstream does not process them.
    const usesPcpLayer = changeListVec.some(([layer]) =>
      cache.findAllLayerStacksUsingLayer(layer).length > 0)
    if (!usesPcpLayer) {
      const usdOwned = changeListVec.some(([layer]) =>
        [...this._usdDependenciesByPrim.values()].some(layers => layers.has(layer as Layer)))
      if (usdOwned) yield* this._recomposeAndNotifyAbsoluteRoot(true)
      return
    }

    const localPendingChanges = new UsdPendingChanges()
    const pending = this._pendingChanges ??= localPendingChanges

    // Push changes through Pcp to determine further invalidation based on
    // composition metadata (reference, inherits, variant selections, etc).
    yield* pending.pcpChanges._didChangeMaybeAsync(cache, changeListVec)

    this._computePendingChanges(pending, changeListVec)

    // Sublayer operations produce additional changelists for affected
    // sublayers; compute pending changes for these as well.
    const cacheChanges = pending.pcpChanges.getCacheChanges().get(cache)
    if (cacheChanges) this._computePendingChanges(pending, cacheChanges.layerChangeListVec)

    yield* this._processPendingChanges(pending)
  }

  // UsdStage::_HandleResolverDidChange (stage.cpp:4957-5010).
  private _handleResolverDidChange(n: ArNotice.ResolverChanged): void {
    if (!n.affectsContext(this._resolverContext)) return
    this._resolvedAttributeAssets.clear()
    this._runCompositionPassFromNotice(this._processResolverDidChange())
  }

  private *_processResolverDidChange(): PcpMaybeAsync<void> {
    const cache = this._pcpCache!
    const localPendingChanges = new UsdPendingChanges()
    const pending = this._pendingChanges ??= localPendingChanges
    // Inform Pcp of the change to the resolver to determine prims that may
    // need to be resynced. The cache's opened layers are re-resolved first,
    // as upstream's synchronous SdfLayer::FindOrOpen would re-resolve them.
    yield cache._layerSource.refresh()
    pending.pcpChanges.didChangeAssetResolverSync(cache)
    // Asset-path valued attributes on this stage may be invalidated.
    addToChangedPaths(pending.assetPathResyncChanges, '/')
    // Process pending changes if we are the originators of the batch.
    if (pending === localPendingChanges) yield* this._processPendingChanges(pending)
  }

  // UsdStage::_ComputePendingChanges (stage.cpp:4495-4727).
  private _computePendingChanges(
    pending: UsdPendingChanges, changeListVec: SdfLayerChangeListVec<PcpLayer>,
  ): void {
    const cache = this._pcpCache!
    const pcpChanges = pending.pcpChanges
    const changedActivePaths = new Set<string>()
    const rootLayer = this._rootLayer as PcpLayer | null
    const sessionLayer = this._sessionLayer as PcpLayer | null

    // A fallback prim types change occurs when the fallbackPrimTypes metadata
    // changes on the root or session layer, except while writing the schema
    // fallbacks (WriteFallbackPrimTypes), which changes no composed prims.
    const isFallbackPrimTypesChange = (layer: PcpLayer, sdfPath: SdfPath, infoKey: string): boolean =>
      infoKey === 'fallbackPrimTypes' && !this._isWritingFallbackPrimTypes &&
      sdfPath.isAbsoluteRootPath() && (layer === rootLayer || layer === sessionLayer)

    for (const [layer, changeList] of changeListVec) {
      // If this layer does not pertain to us, skip.
      if (pcpChanges.findAllLayerStacksUsingLayer(cache, layer).length === 0) continue

      for (const [sdfPath, entry] of changeList.getEntryList()) {
        // Skip target paths entirely -- we do not create target objects in USD.
        if (sdfPath.isTargetPath()) continue

        let willRecompose = false
        if (sdfPath.isAbsoluteRootPath() || sdfPath.isPrimOrPrimVariantSelectionPath()) {
          const didChangeActive = entry.infoChanged.some(([key]) => key === 'active')
          let willChangePrimTypeInfo = false
          if (didChangeActive || entry.flags.didReorderChildren) {
            willRecompose = true
          } else {
            for (const [infoKey] of entry.infoChanged) {
              if (infoKey === 'typeName' || infoKey === 'apiSchemas') {
                willChangePrimTypeInfo = true
              } else if (infoKey === 'kind' || infoKey === 'specifier' ||
                  isClipRelatedField(infoKey) ||
                  isFallbackPrimTypesChange(layer, sdfPath, infoKey)) {
                willRecompose = true
                break
              }
            }
          }
          if (willRecompose) {
            addAffectedStagePaths(pcpChanges, layer, sdfPath, cache,
              pending.recomposeChanges, entry)
          } else if (willChangePrimTypeInfo) {
            addAffectedStagePaths(pcpChanges, layer, sdfPath, cache,
              pending.primTypeInfoChanges, entry)
          }
          if (didChangeActive) {
            addAffectedStagePaths(pcpChanges, layer, sdfPath, cache, changedActivePaths)
          }
        } else {
          const f = entry.flags
          willRecompose = sdfPath.isPropertyPath() &&
            (f.didAddPropertyWithOnlyRequiredFields || f.didAddProperty ||
             f.didRemovePropertyWithOnlyRequiredFields || f.didRemoveProperty)
          if (willRecompose) {
            addAffectedStagePaths(pcpChanges, layer, sdfPath, cache,
              pending.otherResyncChanges, entry)
          }
        }

        // If we're not going to recompose this path, record the dependent
        // scene paths separately so we can notify clients about the changes.
        if (!willRecompose) {
          addAffectedStagePaths(pcpChanges, layer, sdfPath, cache, pending.otherInfoChanges, entry)

          // A variant spec added or removed that no prim index depends on
          // may still change the parent prim's composed variant options;
          // a spoofed variantChildren entry notifies that.
          const f = entry.flags
          if (sdfPath.isPrimVariantSelectionPath() &&
              (f.didAddInertPrim || f.didAddNonInertPrim ||
               f.didRemoveInertPrim || f.didRemoveNonInertPrim)) {
            if (cache.getLayerStack().hasLayer(layer)) {
              addToChangedPaths(pending.otherInfoChanges,
                sdfPath.getPrimPath().stripAllVariantSelections().pathString, variantEntry())
            }
            addAffectedStagePaths(pcpChanges, layer, sdfPath.getPrimPath(), cache,
              pending.otherInfoChanges, variantEntry())
          }
        }
      }
    }

    // Pcp does not consider activation changes to be significant, but
    // UsdStage elides children of deactivated prims, so their prim indexes
    // must be ejected from the PcpCache.
    for (const path of changedActivePaths) {
      pcpChanges.didChangeSignificantly(cache, SdfPath.fromString(path))
    }

    // Asset-valued attributes and metadata in layer stacks with changed
    // expression variables may resolve differently.
    for (const [layerStack, layerStackChanges] of pcpChanges.getLayerStackChanges()) {
      if (layerStackChanges.didChangeExpressionVariables) {
        addAffectedStagePathsForLayerStack(layerStack, cache, pending.assetPathResyncChanges)
      }
    }
  }

  // Awaits any pending change processing. Change processing runs
  // synchronously unless a layer must be loaded first (see "Composition
  // passes"), so this resolves immediately after edits that need no layer
  // loaded; callers that need the recomposed stage after edits that may
  // load layers (sublayers, references, payloads) await this.
  async flushChanges(): Promise<void> {
    while (this._compositionTail) await this._compositionTail
    await this._prepareAssetPaths()
    if (this._compositionErrors.length > 0) {
      const [error] = this._compositionErrors
      this._compositionErrors = []
      throw error
    }
  }

  /** @deprecated renamed to flushChanges(); kept for consumers mid-migration. */
  async _interim_flushChanges(): Promise<void> { await this.flushChanges() }

  /** @internal */
  _ownAuthoring<T>(fn: () => T): T {
    return fn()
  }

  /** @internal */
  async _ownAuthoringAsync<T>(fn: () => Promise<T>): Promise<T> {
    return await fn()
  }

  // ---- Sublayer authoring (live recomposition) ----
  //
  // Authors the ROOT layer's subLayers list on an open stage and recomposes
  // in place. The Stage object survives; listeners get a diffed
  // ObjectsChanged notice so imaging can invalidate incrementally.

  getSubLayerPaths(): string[] {
    const v = this._rootLayer?.getField('/', 'subLayers')
    return Array.isArray(v) ? [...(v as string[])] : []
  }

  getSubLayerOffsets(): { offset: number; scale: number }[] {
    const v = this._rootLayer?.getField('/', 'subLayerOffsets')
    return Array.isArray(v) ? [...(v as { offset: number; scale: number }[])] : []
  }

  // ---- Opinion provenance ----

  // Returns every authored opinion contributing to the property, strongest
  // first — entry [0] is the winner. Mirrors UsdProperty::GetPropertyStack
  // (what usdview's composition tab shows). Returns [] for stages without
  // file-backed composition (in-memory authoring stages) or unknown paths.
  // Mirrors UsdPrim::GetPrimStackWithLayerOffsets: the prim's contributing
  // specs, strongest first, each with its layer, spec path, outermost arc,
  // and cumulative layer offset relative to the stage root.
  getPrimStack(primPath: string): PrimStackEntry[] {
    const SKIP = new Set(['specifier', 'primChildren', 'properties', 'form', 'fields'])
    const metaOf = (layer: Layer, specPath: string): Record<string, unknown> =>
      Object.fromEntries(
        layer.getFieldNames(specPath).filter(f => !SKIP.has(f))
          .map(f => [f, layer.getField(specPath, f)]))
    // pcp path: provenance from the retained PcpPrimIndex (composePrimStack).
    if (this._pcpCache) {
      // Instance proxies hold the prototype/source prim index, including the
      // nested-instance rebasing performed by instanceCache.cpp:679-785.
      // UsdStage::_GetPrimStack reads that retained index (stage.cpp:8258-8294).
      const index = this._getPrimQuerySource(primPath)?.index
      if (!index) return []
      return index.composePrimStack().map(e => ({
        layerIdentifier: e.layer.filePath,
        specPath: e.path.pathString,
        arc: ARC_NAMES[e.arcType] ?? 'local',
        offset: { offset: e.offset.offset, scale: e.offset.scale },
        metadata: metaOf(e.layer as Layer, e.path.pathString),
      }))
    }
    return this._sortedSpecsFor(primPath).map(spec => ({
      layerIdentifier: spec.layer.filePath,
      specPath: spec.sourcePath,
      arc: ARC_NAMES[spec.arc[0] ?? 0] ?? 'local',
      offset: { offset: spec.offset.offset, scale: spec.offset.scale },
      metadata: metaOf(spec.layer, spec.sourcePath),
    }))
  }

  getPropertyStack(
    propPath: string, time: 'default' | number = 'default',
  ): PropertyStackEntry[] {
    return this.getPropertyStackWithLayerOffsets(propPath, time).map(({ offset: _, ...entry }) => entry)
  }

  getPropertyStackWithLayerOffsets(
    propPath: string, time: 'default' | number = 'default',
  ): PropertyStackWithLayerOffsetEntry[] {
    return _withStageTraceSync('typescript-usd:Stage.getPropertyStack', scopeContext => {
      if (scopeContext) {
        _traceScopeData(scopeContext, 'propertyPath', propPath)
        _traceScopeData(scopeContext, 'time', time)
      }
      const stack = this._getPropertyStackWithLayerOffsets(propPath, time)
      if (scopeContext) _traceScopeData(scopeContext, 'specCount', stack.length)
      return stack
    })
  }

  private _getPropertyStackWithLayerOffsets(
    propPath: string, time: 'default' | number,
  ): PropertyStackWithLayerOffsetEntry[] {
    const dot = propPath.indexOf('.')
    if (dot <= 0) return []
    const primPath = propPath.slice(0, dot)
    const propName = propPath.slice(dot + 1)

    // pcp path: provenance from the retained PcpPrimIndex (composePropertyStack).
    if (this._pcpCache) {
      const querySource = this._getPrimQuerySource(primPath)
      if (!querySource) return []
      const { index, sourcePrimPath } = querySource
      const direct = index.composePropertyStack(propName)
      const directByPosition = new Map<string, typeof direct[number]>()
      for (const entry of direct) {
        directByPosition.set(`${entry.nodeIndex}:${entry.layerIndex}`, entry)
      }
      const clipsByPosition = new Map<string, ReturnType<typeof clipPropertySourcesAtTime>>()
      if (typeof time === 'number') {
        const nodes = [...index.getNodeRange()]
        for (const clipSet of this._clipSetsByPrim.get(sourcePrimPath) ?? []) {
          for (const source of clipPropertySourcesAtTime(propName, clipSet, time, nodes)) {
            const key = `${source.position[0]}:${source.position[1]}`
            clipsByPosition.set(key, [...(clipsByPosition.get(key) ?? []), source])
          }
        }
      }
      const stack: PropertyStackWithLayerOffsetEntry[] = []
      for (const {
        nodeIndex, layerIndex, node, layerToStageOffset,
      } of usdPropertySites(index, propName, undefined, clipsByPosition.size === 0)) {
        const entry = directByPosition.get(`${nodeIndex}:${layerIndex}`)
        if (entry) {
          stack.push({
            layerIdentifier: entry.layer.filePath,
            specPath: entry.path.pathString,
            arc: ARC_NAMES[entry.arcType] ?? 'local',
            offset: { offset: entry.offset.offset, scale: entry.offset.scale },
            value: (entry.layer as Layer).getField(entry.path.pathString, 'default'),
            timeSamples: normalizeTimeSamples(
              (entry.layer as Layer).getField(entry.path.pathString, 'timeSamples')),
          })
        }
        for (const clip of clipsByPosition.get(`${nodeIndex}:${layerIndex}`) ?? []) {
          const sourceLayer = clip.layer as Layer
          stack.push({
            layerIdentifier: clip.layer.filePath,
            specPath: clip.specPath,
            arc: ARC_NAMES[node.arcType] ?? 'local',
            offset: {
              offset: layerToStageOffset.offset, scale: layerToStageOffset.scale,
            },
            value: sourceLayer.getField(clip.specPath, 'default'),
            timeSamples: normalizeTimeSamples(
              sourceLayer.getField(clip.specPath, 'timeSamples')),
          })
        }
      }
      return stack
    }

    return []
  }

  // The retained PcpPrimIndex for a prim from the last composition pass, or
  // undefined (UsdPrim::GetPrimIndex). The provenance source for composition
  // queries that walk the node graph directly.
  /** @internal UsdPrim::GetPrimStack as prim spec handles. */
  _primSpecStack(primPath: string): Array<SdfPrimSpec | undefined> {
    const index = this._getPrimQuerySource(primPath)?.index
    if (!index) return []
    return index.composePrimStack().map(e => (e.layer as Layer).getPrimAtPath(e.path))
  }

  /** @internal UsdStage::_GetPcpCache. */
  _getPcpCache(): PcpCache | null { return this._pcpCache }

  getPrimIndex(primPath: string): PcpPrimIndex | undefined {
    return this._pcpCache?.findPrimIndex(primPath)
  }

  private _getPrimQuerySource(dataPrimPath: string):
    {
      index: PcpPrimIndex
      sourcePrimPath: string
      sourceRootPath: string
      dataRootPath: string
      inPrototype: boolean
    } | undefined {
    // A prototype prim has an empty prim index (Usd_PrimData::GetPrimIndex),
    // so it resolves no metadata or properties.
    const prim = this._getPrimDataAtPathOrInPrototype(dataPrimPath)
    const index = prim?.getPrimIndex()
    if (!prim || !index) return undefined
    const sourcePrimPath = index.getRootNode().path.pathString
    if (prim.isInPrototype()) {
      const slash = prim.path.indexOf('/', 1)
      const prototypePath = slash < 0 ? prim.path : prim.path.slice(0, slash)
      const sourceRootPath =
        this._instanceCache.getSourcePrimIndexPathForPrototype(prototypePath) ?? sourcePrimPath
      return { index, sourcePrimPath, sourceRootPath, dataRootPath: prototypePath, inPrototype: true }
    }
    return {
      index, sourcePrimPath, sourceRootPath: sourcePrimPath, dataRootPath: prim.path, inPrototype: false,
    }
  }

  /** @internal Canonical Usd value-query boundary used by Attribute handles. */
  _resolveAttribute(
    dataPrimPath: string, propertyName: string, time: 'default' | number | undefined,
    fallback: () => unknown, resolveTarget?: UsdResolveTarget,
    resultPrimPath = dataPrimPath,
  ): UsdAttributeResolveResult {
    return _withStageTraceSync('typescript-usd:Stage.resolveAttributeValue', scopeContext => {
      const propertyPath = `${dataPrimPath === '/' ? '' : dataPrimPath}.${propertyName}`
      if (scopeContext) {
        _traceScopeData(scopeContext, 'propertyPath', propertyPath)
        _traceScopeData(scopeContext, 'time', time ?? 'resolveInfo')
      }
      const result = this._resolveAttributeImpl(
        dataPrimPath, propertyName, time, fallback, resolveTarget, resultPrimPath)
      if (scopeContext) {
        _traceScopeData(scopeContext, 'source', result.source)
        _traceScopeData(scopeContext, 'valueIsBlocked', result.valueIsBlocked)
      }
      return result
    })
  }

  private _resolveAttributeImpl(
    dataPrimPath: string, propertyName: string, time: 'default' | number | undefined,
    fallback: () => unknown, resolveTarget: UsdResolveTarget | undefined, resultPrimPath: string,
  ): UsdAttributeResolveResult {
    if (_hasUsdQueryObserver(this)) {
      _recordUsdQueryEvent(this, {
        kind: 'valueResolution', path: `${dataPrimPath === '/' ? '' : dataPrimPath}.${propertyName}`,
      })
    }
    const withQueryContext = (
      result: UsdAttributeResolveResult, typeName?: string,
    ): UsdAttributeResolveResult => ({
      ...result, ...(typeName !== undefined ? { typeName } : {}),
      interpolation: this._interpolationType,
    })
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (!querySource) {
      const value = fallback()
      return withQueryContext(value === undefined
        ? { source: 'none', valueIsBlocked: false }
        : { source: 'fallback', value, valueIsBlocked: false })
    }
    // Async/browser adaptation: clip assets are acquired during Stage.open,
    // but source selection and value lookup remain synchronous and query-time.
    const { sourcePrimPath } = querySource
    const index = resolveTarget?.getPrimIndex() ?? querySource.index
    // Clips were prepared against the cached index. Expanded resolve targets
    // include culled nodes, so map the introducing node by its composition
    // ancestry rather than reusing a cached node ordinal.
    const nodeKey = (node: PcpNode): string => {
      const ancestry: unknown[] = []
      for (let current: PcpNode | null = node; current; current = current.getParentNode()) {
        ancestry.push([current.getPath().pathString, current.layerStack.identifier.rootLayer.filePath,
          current.getArcType(), current.getSiblingNumAtOrigin()])
      }
      return JSON.stringify(ancestry)
    }
    let cachedNodeList: PcpNode[] | undefined, targetNodeList: PcpNode[] | undefined
    const cachedNodes = (): PcpNode[] => cachedNodeList ??= [...querySource.index.getNodeRange()]
    const targetNodes = (): PcpNode[] => targetNodeList ??= index === querySource.index
      ? cachedNodes() : [...index.getNodeRange()]
    const clipPosition = (position: readonly [number, number]): readonly [number, number] => {
      if (index === querySource.index) return position
      const original = cachedNodes()[position[0]]
      return [original ? targetNodes().findIndex(node => nodeKey(node) === nodeKey(original)) : -1, position[1]]
    }
    const primClipSets = this._clipSetsByPrim.get(sourcePrimPath)
    // Each clip set applies at every node of the cached walk it covers
    // (_GetClipsThatApplyToNode, stage.cpp:7192-7209).
    const propertyClipSets = primClipSets
      ? attrClipSetsFor(propertyName, primClipSets, cachedNodes())
      : undefined
    // One walk over the sites' typeName opinions gives the composed typeName
    // and answers the value walk's per-site type questions.
    const typeNames = usdResolveAttributeTypeNames(index, propertyName)
    const composedTypeName = typeNames.composed as string | undefined
    const resolved = usdResolveAttributeValue(
      index, propertyName, time,
      propertyClipSets?.map(clipSet => ({
        position: clipPosition(clipSet.position),
        resolve: (queryTime: number | undefined): UsdAttributeResolveResult | undefined => {
          // Clips that provide a spline (Usd_ClipSet::ContainsSplineForAttribute)
          // resolve as a value-clips source in spline format: no time
          // samples, values from QuerySpline and the spline from BuildSpline
          // (stage.cpp:9204-9232, 9666-9690).
          if (clipSetContainsSpline(clipSet)) {
            return {
              source: 'valueClips', valueIsBlocked: false,
              value: queryTime === undefined ? undefined : clipSetQuerySpline(clipSet, queryTime, false),
              clipValueMightBeTimeVarying: true,
              clipSpline: () => clipSetBuildSpline(clipSet),
              valueEvaluator: (valueTime, isPreTime) => clipSetQuerySpline(clipSet, valueTime, isPreTime),
              node: targetNodes()[clipPosition(clipSet.position)[0]]!,
              timeSamples: [],
            }
          }
          // The clip set's time samples (Usd_ClipSet::ListTimeSamplesForPath)
          // are listed only when read: upstream's resolution asks the clip
          // set only whether it holds a value (ContainsValueForAttribute,
          // _GetClipsThatApplyToNode, stage.cpp:7192-7210) and lists samples
          // for the time-sample queries (e.g. _TimeSampleMapResolver::
          // ProcessClips, stage.cpp:8820-8834), so a value read does not walk
          // every clip's samples.
          let keys: number[] | undefined
          const clipKeys = (): number[] => keys ??= clipTimeSamples(clipSet)
          const value = queryTime === undefined ? undefined : clipValueAtTime(
            clipSet, queryTime, this._interpolationType, false, composedTypeName)
          // (The listing is never empty: with no contributing clip it holds
          // the first clip's start time, clipSet.cpp:848-853, so a clip set
          // that declares the attribute always gives a value source.)
          // Asset-path values anchor to the clip layer they come from at
          // each time (_GetClipLayer, stage.cpp:7716-7732).
          const layerAtTime = composedTypeName === 'asset' || composedTypeName === 'asset[]'
            ? (layerTime: number, isPreTime: boolean): Layer | undefined =>
              (clipLayerForValueAt(clipSet, layerTime, isPreTime) as Layer | null) ?? undefined
            : undefined
          const assetLayer = queryTime === undefined ? undefined : layerAtTime?.(queryTime, false)
          const result: UsdAttributeResolveResult = {
            source: 'valueClips', value, valueIsBlocked: false,
            clipValuesMayCompose: clipSetValuesMayCompose(clipSet),
            clipValueMightBeTimeVarying: clipSetValueMightBeTimeVarying(clipSet),
            ...(assetLayer ? { layer: assetLayer } : {}),
            ...(layerAtTime ? { layerAtTime } : {}),
            valueEvaluator: (valueTime, isPreTime) =>
              clipValueAtTime(
                clipSet, valueTime, this._interpolationType, isPreTime, composedTypeName),
            node: targetNodes()[clipPosition(clipSet.position)[0]]!,
          }
          // Enumerable, so a spread of the result copies the samples as
          // before; assignable, as composition replaces them.
          let timeSamples: [number, unknown][] | undefined
          Object.defineProperty(result, 'timeSamples', {
            get: () => timeSamples ??= clipKeys().map(sampleTime =>
              [sampleTime, undefined] as [number, unknown]),
            set: (samples: [number, unknown][]) => { timeSamples = samples },
            enumerable: true, configurable: true,
          })
          return result
        },
      })) ?? [], resolveTarget,
      // GetPrimProtoToInstancePathMap (stage.cpp:404-406) for the
      // attribute's (proxy) prim, computed only when a path expression
      // value is mapped.
      querySource.inPrototype ? (() => {
        let pathMap: Array<[SdfPath, SdfPath]> | undefined
        return (protoPath: SdfPath) =>
          mapProtoToInstance(pathMap ??= this._getProtoToInstancePathMap(resultPrimPath), protoPath)
      })() : undefined,
      typeNames,
    )
    if (resolved.source !== 'none') {
      return this._transformAttributeValue(index, propertyName, resolved, composedTypeName)
    }
    const value = fallback()
    // An attribute with no spec takes its value type from the prim
    // definition (_GetAttributeValueTypeName, stage.cpp:6699-6713), so an
    // asset-valued fallback is handed out as an SdfAssetPath.
    return value === undefined ? withQueryContext(resolved,composedTypeName)
      : this._transformAttributeValue(index,propertyName,{source:'fallback',value,valueIsBlocked:resolved.valueIsBlocked},
        composedTypeName ?? this._declaredAttrType(resultPrimPath, propertyName))
  }

  // UsdStage::_MakeResolvedAssetPaths (stage.cpp:804-847) resolves assets
  // using the winning layer and the stage resolver context. Browser resolvers
  // are asynchronous: Open, flushChanges and every awaited recomposition
  // (loadAndUnload, setLoadRules, setPopulationMask, muteAndUnmuteLayers,
  // reload) prepare the authored defaults/samples of the layers they bring in
  // before synchronous Get reads the retained resolver result.
  private _resolvedAttributeAssets = new Map<string, {value:string,pending:Promise<void>,resolvedPath?:ReturnType<typeof _resolvedPathForAssetValue>,properties?:Set<string>}>()
  private _resolvedAttributeAsset(layer:Layer|undefined,path:string,propertyName?:string):string {
    if(!path)return ''
    if(path.startsWith('anon:'))return path
    const identifier=layer?.resolveAsset(path)??this._resolver.createIdentifier(path)
    let entry=this._resolvedAttributeAssets.get(identifier)
    if(!entry){
      entry={value:'',pending:Promise.resolve()}
      const retained=entry
      const {assetPath,args}=_sdfSplitLayerIdentifier(identifier)
      const resolving=this._resolver.resolve(assetPath,this._resolverContext).then(resolved=>{
        const value=_resolvedPathForAssetValue(resolved,this._resolverContext)
        retained.value=_sdfCreateLayerIdentifier(value.toString(),args)
        retained.resolvedPath=value
        // Assets that imaging reads synchronously (e.g. glslfx files) are read
        // ahead with this stage's resolver (ar/src/prefetchedAssets.ts).
        return _ArPrefetchAsset(value,this._assetReader)
      })
      // So are the resolutions imaging derives from the authored path itself
      // (UDIM tiles, usdShade/src/udimUtils.ts).
      retained.pending=Promise.all([resolving,_ArPrefetchAssetPath(
        path,layer?(p:string)=>layer.resolveAsset(p):undefined,this._assetReader)]).then(()=>{})
      this._resolvedAttributeAssets.set(identifier,entry)
    }
    // And the assets that imaging reads synchronously because of the
    // attribute holding them (e.g. the cards draw mode's textures), once per
    // asset and attribute name.
    if(propertyName&&_ArHasAssetPropertyPrefetcher(propertyName)&&!entry.properties?.has(propertyName)){
      (entry.properties??=new Set()).add(propertyName)
      const retained=entry
      retained.pending=retained.pending.then(()=>retained.resolvedPath&&
        _ArPrefetchAssetForProperty(propertyName,retained.resolvedPath,this._assetReader))
    }
    return entry.value
  }
  private readonly _assetReader:_ArAssetReader={
    resolve:assetPath=>this._resolver.resolve(assetPath,this._resolverContext).then(resolved=>_resolvedPathForAssetValue(resolved,this._resolverContext)),
    openAsset:resolvedPath=>this._resolver.openAsset(resolvedPath,this._resolverContext),
  }
  // Layers whose asset values have been prepared, and the property names that
  // hold expression-valued assets in any of them. With `roots`, only layers not
  // yet prepared are scanned and expressions are evaluated under those roots.
  private _assetPreparedLayers = new WeakSet<Layer>()
  private _assetExpressionNames = new Set<string>()
  private async _prepareAssetPaths(roots?:readonly string[]):Promise<void>{
    const expressionNames=this._assetExpressionNames
    const layers=new Set(this.getUsedLayers())
    for(const sets of this._clipSetsByPrim.values())for(const set of sets){
      for(const layer of set.layers)if(layer)layers.add(layer as Layer)
    }
    for(const layer of layers){
      if(roots&&this._assetPreparedLayers.has(layer))continue
      this._assetPreparedLayers.add(layer)
      for(const path of layer.getSpecPaths()){
      const type=layer.getField(path,'typeName')
      if(type!=='asset'&&type!=='asset[]')continue
      const prepare=(value:unknown):void=>{
        if(value instanceof SdfAssetPath)value=value.getAuthoredPath()
        if(typeof value==='string'){
          if(sdfIsVariableExpression(value))expressionNames.add(path.slice(path.lastIndexOf('.')+1))
          else this._resolvedAttributeAsset(layer,value,path.slice(path.lastIndexOf('.')+1))
        }else if(value instanceof VtArray)for(const item of value.toArray())prepare(item)
        else if(Array.isArray(value))for(const item of value)prepare(item)
      }
      prepare(layer.getField(path,'default'))
      const samples=layer.getField(path,'timeSamples')
      if(Array.isArray(samples))for(const sample of samples)if(Array.isArray(sample))prepare(sample[1])
      }
    }
    // Expressions depend on the composed node's expression variables, so only
    // expression-bearing property names require the retained prim-index query.
    const under=(path:string)=>!roots||roots.some(root=>root==='/'||path===root||path.startsWith(`${root}/`))
    if(expressionNames.size)for(const path of this._primMap.keys()){
      if(!under(path))continue
      const prim=this.getPrim(path)
      if(!prim)continue
      for(const name of prim.attrNames){
        if(!expressionNames.has(name))continue
        const attr=prim.getAttr(name)
        if(attr?.typeName!=='asset'&&attr?.typeName!=='asset[]')continue
        attr.getValue()
        for(const time of attr.getTimeSampleKeys())attr.getValueAtTime(time)
      }
    }
    await Promise.all([...this._resolvedAttributeAssets.values()].map(entry=>entry.pending))
  }

  private _transformAttributeValue(
    index: PcpPrimIndex, propertyName: string, resolved: UsdAttributeResolveResult,
    composedTypeName: string | undefined,
  ): UsdAttributeResolveResult {
    const typeName = composedTypeName
    // Only asset values, and durations and time codes under a layer offset,
    // change on their way to the stage (UsdStage's value transforms,
    // stage.cpp:613-717, 804-847). Other values are the resolver's, so the fresh
    // result is annotated in place rather than copied with every value and
    // sample source wrapped in an identity transform.
    if (typeName !== 'asset' && typeName !== 'asset[]' && !(resolved.layerToStageOffset && (
      typeName === 'duration' || typeName === 'duration[]' ||
      typeName === 'timecode' || typeName === 'timecode[]'))) {
      if (typeof typeName === 'string') resolved.typeName = typeName
      resolved.interpolation = this._interpolationType
      return resolved
    }
    const transform = (value: unknown, layer = resolved.layer): unknown => {
      if ((typeName === 'asset' || typeName === 'asset[]')) {
        const transformAsset = (authoredPath: unknown): unknown => {
          if(authoredPath instanceof SdfAssetPath)authoredPath=authoredPath.getAuthoredPath()
          // A schema fallback (a prim definition's default field) may hold
          // its asset path as a boxed String; it is an SdfAssetPath as an
          // authored value is (primDefinition.h:473-479).
          if (authoredPath instanceof String) authoredPath = String(authoredPath)
          if (typeof authoredPath !== 'string') return authoredPath
          let evaluatedPath = ''
          if(sdfIsVariableExpression(authoredPath)&&resolved.node){
            const evaluated=new SdfVariableExpression(authoredPath).evaluateTyped(resolved.node.getLayerStack().expressionVariables.getVariables(),'string')
            if(typeof evaluated.value==='string')evaluatedPath=evaluated.value
          }
          const assetPath=sdfIsVariableExpression(authoredPath)?evaluatedPath:authoredPath
          return new SdfAssetPath({authoredPath,evaluatedPath,resolvedPath:this._resolvedAttributeAsset(layer,assetPath,propertyName)})
        }
        // VtArrayEdit<SdfAssetPath> transforms its literals
        // (VtValueTypeCanTransform, base/vt/arrayEdit.h:406-408).
        if (value instanceof VtArrayEdit) return value._transformLiterals(transformAsset)
        return mapArrayValue(value, transformAsset) ?? transformAsset(value)
      }
      if ((typeName === 'duration' || typeName === 'duration[]') && resolved.layerToStageOffset) return scaleDurationValue(value, resolved.layerToStageOffset.scale)
      if ((typeName === 'timecode' || typeName === 'timecode[]') &&
          resolved.layerToStageOffset) {
        if (typeof value === 'number') {
          return sdfLayerOffsetApply(resolved.layerToStageOffset, value)
        }
        const mapped = mapArrayValue(value, v => typeof v === 'number'
          ? sdfLayerOffsetApply(resolved.layerToStageOffset!, v) : v)
        if (mapped !== undefined) return mapped
      }
      return value
    }
    const result: UsdAttributeResolveResult = {
      ...resolved,
      ...(typeof typeName === 'string' ? { typeName } : {}),
      interpolation: this._interpolationType,
    }
    if (resolved.value !== undefined) result.value = transform(resolved.value)
    if (resolved.valueEvaluator) {
      result.valueEvaluator = (time, isPreTime) =>
        transform(resolved.valueEvaluator!(time, isPreTime),
          resolved.layerAtTime?.(time, isPreTime) ?? resolved.layer)
    }
    if (resolved.samples) {
      usdWithLiveSamples(result, resolved.samples.mapValues(transform))
    } else if (resolved.timeSamples) {
      result.timeSamples = resolved.timeSamples.map(
        ([time, value]) => [time, transform(value)] as [number, unknown])
    }
    return result
  }

  /** @internal UsdStage::_GetDefiningSpecType (stage.cpp:5489-5523): the
   * prim definition's spec type for a builtin property, else the strongest
   * authored property spec's type; '' when there is none. */
  _getDefiningSpecType(dataPrimPath: string, propertyName: string): 'attribute' | 'relationship' | '' {
    const prim = this.getPrim(dataPrimPath)
    if (!prim || !propertyName) return ''
    const builtin = prim.getPrimDefinition().getSpecType(propertyName)
    if (builtin) return builtin
    // The strongest authored property spec: the Usd_Resolver walk (empty
    // and inert nodes skipped) stops at the first layer whose spec type is
    // known (stage.cpp:5502-5519).
    const index = this._getPrimQuerySource(dataPrimPath)?.index
    if (!index) return ''
    for (const node of index._getNodeRefs()) {
      if (!node.hasSpecs || !node.canContributeSpecs()) continue
      const propPath = pcpLayerPathKey(node.path.appendProperty(propertyName))
      for (const { layer } of node.layerStack.layers) {
        const specType = layer.getSpecType(propPath)
        if (specType === 'attribute' || specType === 'relationship') return specType
        if (specType !== 'unknown') return ''
      }
    }
    return ''
  }

  /** @internal Property metadata shares the retained prim-index walk. */
  _resolvePropertyField(dataPrimPath: string, propertyName: string, fieldName: string): unknown {
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (querySource) {
      if (fieldName === 'custom') {
        // A property supplied by the prim definition is never custom, even if
        // scene description carries a conflicting opinion (OpenUSD v26.08
        // pxr/usd/usd/stage.cpp:6735-6763).
        const definition = this.getPrim(dataPrimPath)?.getPrimDefinition()
          .getPropertyDefinition(propertyName)
        if (definition?.isValid()) return false
        return usdResolveWeakestAttributeField(
          querySource.index, propertyName, fieldName)
      }
      if (fieldName === 'variability') {
        return usdResolveWeakestAttributeField(
          querySource.index, propertyName, fieldName)
      }
      if (fieldName === 'typeName') {
        // UsdStage::_GetAttrTypeImpl (stage.cpp:6698-6714): an attribute the
        // prim definition provides takes its type from the definition
        // (ConsumeUsdFallback), before any authored opinion.
        const attributeDefinition = this.getPrim(dataPrimPath)?.getPrimDefinition()
          .getAttributeDefinition(propertyName)
        if (attributeDefinition?.isValid()) {
          const definitionTypeName = attributeDefinition.getTypeNameToken()
          if (definitionTypeName !== '') return definitionTypeName
        }
        // UsdStage::_GetDefiningSpecType selects the strongest property spec
        // kind independently of authored fields (OpenUSD v26.05
        // pxr/usd/usd/stage.cpp:5483-5515).  In particular, a relationship
        // read from crate has no authored typeName marker.
        // The strongest property spec: composePropertyStack's first entry,
        // found without listing the rest of the stack.
        const defining = strongestPropertySpec(querySource.index, propertyName)
        if (defining && (defining.layer.getSpecType(defining.specPath) === 'relationship' ||
          defining.layer.getField(defining.specPath, 'targetPaths') !== undefined)) {
          return 'rel'
        }
      }
      const resolved = usdResolveAttributeFieldWithSource(
        querySource.index, propertyName, fieldName)
      if (!resolved) return undefined
      // The composed typeName; for a typeName query that is the value just
      // resolved.
      const typeName = fieldName === 'typeName'
        ? resolved.value : usdResolveAttributeField(querySource.index, propertyName, 'typeName')
      if (fieldName !== 'default' && fieldName !== 'timeSamples') {
        const specType = typeName === 'rel' ? 'relationship' : 'attribute'
        return usdAssetPathsToStage(usdTransformMetadataValue(
          resolved.value, fieldName, specType,
          time => sdfLayerOffsetApply(resolved.layerToStageOffset, time), resolved.layerToStageOffset.scale),
        usdGetMetadataFieldType(fieldName, specType))
      }
      const transformValue = (value: unknown): unknown => {
        if ((typeName === 'duration' || typeName === 'duration[]') && resolved.layerToStageOffset) return scaleDurationValue(value, resolved.layerToStageOffset.scale)
        if ((typeName === 'timecode' || typeName === 'timecode[]') &&
            resolved.layerToStageOffset) {
          if (typeof value === 'number') {
            return sdfLayerOffsetApply(resolved.layerToStageOffset, value)
          }
          const mapped = mapArrayValue(value, item => typeof item === 'number'
            ? sdfLayerOffsetApply(resolved.layerToStageOffset, item) : item)
          if (mapped !== undefined) return mapped
        }
        return value
      }
      if (fieldName === 'default') return transformValue(resolved.value)
      return Object.fromEntries((normalizeTimeSamples(resolved.value) ?? []).map(([time, value]) => [
        sdfLayerOffsetApply(resolved.layerToStageOffset, time), transformValue(value),
      ]))
    }
    return undefined
  }

  /** @internal Backs UsdProperty::IsCustom. */
  _isPropertyCustom(dataPrimPath: string, propertyName: string): boolean {
    const definition = this.getPrim(dataPrimPath)?.getPrimDefinition()
      .getPropertyDefinition(propertyName)
    if (definition?.isValid()) return false
    const querySource = this._getPrimQuerySource(dataPrimPath)
    return querySource ? usdResolvePropertyCustom(querySource.index, propertyName) : false
  }

  /** @internal Mirrors the type identity consumed by v26.08 stage.cpp:7142-7156. */
  _resolvePropertyFieldTypeName(
    dataPrimPath: string, propertyName: string, fieldName: string,
  ): string | undefined {
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (!querySource) return undefined
    const resolved = usdResolveAttributeFieldWithSource(
      querySource.index, propertyName, fieldName)
    return resolved?.layer._getFieldValueTypeName(resolved.specPath, fieldName)
  }

  /** @internal Prim metadata shares the retained prim-index walk. */
  _resolvePrimMetadata(dataPrimPath: string, fieldName: string): unknown {
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (!querySource) return undefined
    // OpenUSD v26.08 composes specifier specially: a defining opinion beats
    // stronger overs (pxr/usd/usd/stage.cpp:6810-6880).
    if (fieldName === 'specifier') return usdResolveDefiningSpecifier(querySource.index)
    // _GetPrimTypeNameImpl (stage.cpp:6765-6790) consumes the strongest
    // typeName that is neither empty nor the any-type token.
    if (fieldName === 'typeName') {
      for (const site of usdPrimSpecSites(querySource.index)) {
        const value = site.layer.getField(site.specPath, 'typeName')
        if (typeof value === 'string' && value !== '' && value !== '__AnyType__') return value
      }
      return undefined
    }
    // MetadataValueComposer::ConsumeAuthored (stage.cpp:6159-6182) maps each
    // opinion to stage space with its own node and layer offset before
    // composing it, so a dictionary merged from several layers keeps each
    // layer's time mapping.
    const resolved = usdResolvePrimFieldWithSource(querySource.index, fieldName,
      (opinion, layer, node) => {
        const layerOffset = node.layerStack.layers.find(entry => entry.layer === layer)?.offset ??
          { offset: 0, scale: 1 }
        const layerToStage = sdfLayerOffsetCompose(node.mapToRoot.evaluate().getTimeOffset(), layerOffset)
        return usdTransformMetadataValue(
          opinion, fieldName, 'prim', time => sdfLayerOffsetApply(layerToStage, time), layerToStage.scale)
      })
    if (!resolved) return undefined
    // Opinions are already mapped to stage time per layer above; asset-path
    // values are then converted for the stage.
    const value = usdAssetPathsToStage(resolved.value, usdGetMetadataFieldType(fieldName, 'prim'))
    // MetadataValueComposer::Finalize (stage.cpp:6129-6148) applies list edits
    // over an empty background; composition arcs retain strongest-op semantics
    // (_GetMetadata, stage.cpp:6624-6639).
    const operation = value && typeof value === 'object' && 'isExplicit' in value ? sdfNormalizeListOp(value) : null
    if (operation && !['references', 'inheritPaths', 'specializes', 'payload'].includes(fieldName)) {
      return { isExplicit: true, explicitItems: sdfApplyListOpToVector([], operation),
        prependedItems: [], appendedItems: [], deletedItems: [], orderedItems: [] }
    }
    return value
  }

  /** @internal Mirrors the type identity consumed by v26.08 stage.cpp:7142-7156. */
  _resolvePrimFieldTypeName(dataPrimPath: string, fieldName: string): string | undefined {
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (!querySource) return undefined
    const resolved = usdResolvePrimFieldWithSource(querySource.index, fieldName)
    return resolved?.layer._getFieldValueTypeName(resolved.specPath, fieldName)
  }

  /**
   * @internal UsdProperty::_GetTargets (property.cpp:170-232): build the
   * property index from the owning prim's index and its target index, then
   * map prototype paths to this (proxy) prim's instance namespace.
   */
  _resolvePropertyPaths(
    dataPrimPath: string, propertyName: string,
    fieldName: 'connectionPaths' | 'targetPaths',
    resultPrimPath = dataPrimPath,
    pcpErrors: PcpError[] = [],
  ): string[] | undefined {
    const primData = this._getPrimDataAtPathOrInPrototype(dataPrimPath)
    const cache = this._pcpCache
    if (!primData || !cache) return undefined
    // A prototype prim has an empty prim index (Usd_PrimData::GetPrimIndex).
    const primIndex = primData.getPrimIndex()
    if (!primIndex) return undefined
    const propPath = `${resultPrimPath === '/' ? '' : resultPrimPath}.${propertyName}`
    const propSite = pcpSite(cache.getLayerStackIdentifier(), propPath)
    const [propIndex] = pcpBuildPrimPropertyIndex(propPath, cache, primIndex, pcpErrors)
    const [targetIndex] = pcpBuildTargetIndex(
      propSite, propIndex, fieldName === 'targetPaths' ? 'relationship' : 'attribute', pcpErrors)
    let paths = targetIndex.paths
    if (paths.length > 0 && primData.isInPrototype()) {
      const pathMap = this._getProtoToInstancePathMap(resultPrimPath)
      paths = paths.map(target => mapProtoToInstance(pathMap, target))
        .filter(path => !path.isEmpty())
    }
    return targetIndex.hasTargetOpinions || paths.length > 0
      ? paths.map(path => path.pathString) : undefined
  }

  // UsdPrim::_GetProtoToInstancePathMap (prim.cpp:2088-2122): walking up
  // while in (nested) instance-land, map each prototype's source prim index
  // path to the instance (proxy) path.
  private _getProtoToInstancePathMap(primPath: string): Array<[SdfPath, SdfPath]> {
    const pathMap: Array<[SdfPath, SdfPath]> = []
    let prim = this.getPrim(primPath)
    if (!prim) return pathMap
    // Target paths on an instance are in the space of its next ancestral
    // prototype.
    if (prim.isInstance()) prim = this.getPrim(parentOf(prim.path))
    for (; prim; prim = prim.path === '/' ? undefined : this.getPrim(parentOf(prim.path))) {
      const prototype = prim.isInstance() ? prim.getPrototype()
        : prim.isPrototype() ? prim : undefined
      if (!prototype) continue
      const sourcePath = this._instanceCache.getSourcePrimIndexPathForPrototype(prototype.path)
      if (sourcePath) pathMap.push([SdfPath.fromString(sourcePath), SdfPath.fromString(prim.path)])
    }
    pathMap.sort(([a], [b]) => comparePrimPaths(a.pathString, b.pathString))
    return pathMap
  }

  /** @internal UsdStage::_FlattenProperty (stage.cpp:5986-6080). */
  _flattenProperty(source: Attribute, destination: unknown, requestedName?: string): Attribute {
    const sourcePrimPath = source._getPrimPath()
    const sourceName = source._getName()
    if (!sourceName) throw new Error('Cannot flatten invalid property')

    let destinationStage: Stage | undefined
    let destinationPrimPath: string | undefined
    let destinationName = sourceName
    if (destination instanceof Prim) {
      destinationStage = destination.getStage()
      destinationPrimPath = destination.path
      if (requestedName !== undefined) destinationName = requestedName
    } else if (destination instanceof Attribute) {
      destinationStage = destination.getStage()
      destinationPrimPath = destination.primPath
      destinationName = destination.name
    }
    if (!destinationStage || !destinationPrimPath ||
        !destinationStage.getPrim(destinationPrimPath)) {
      throw new Error(`Cannot flatten property <${sourcePrimPath}.${sourceName}> to invalid destination`)
    }

    const sourceIsRelationship = source.isRelationship
    const destinationPath = `${destinationPrimPath}.${destinationName}`
    const existingDestination = destinationStage.get(destinationPath)
    if (existingDestination && existingDestination.typeName &&
        existingDestination.isRelationship !== sourceIsRelationship) {
      throw new Error(
        `Cannot flatten <${sourcePrimPath}.${sourceName}> to <${destinationPath}>: ` +
        'properties have different types')
    }

    // Capture every composed query result before changing the destination;
    // this is required when flattening a property over itself.
    const typeName = source.typeName
    if (!sourceIsRelationship && !typeName) {
      throw new Error(`Cannot flatten attribute <${sourcePrimPath}.${sourceName}> with unknown type`)
    }
    const metadata = this._getFlattenPropertyMetadata(sourcePrimPath, sourceName, source)
    const targets = sourceIsRelationship ? source.getTargets() : []
    const connections = sourceIsRelationship ? [] : source.getConnections()
    const defaultInfo = sourceIsRelationship ? undefined : source.getResolveInfo('default')
    const defaultValue = sourceIsRelationship ? undefined : source.getValue()
    const resolveInfo = sourceIsRelationship ? undefined : source.getResolveInfo()
    const spline = resolveInfo?.getSource() === UsdResolveInfoSource.Spline
      ? source.getSpline() : undefined
    const samples = resolveInfo?.valueSourceMightBeTimeVarying() && !spline
      ? source.getTimeSampleKeys().map(time => {
          const info = source.getResolveInfo(time)
          return [time, info.valueIsBlocked()
            ? new SdfValueBlock() : source.getValueAtTime(time)] as [number, unknown]
        })
      : []

    const remap = (path: string): string =>
      remapFlattenedPropertyPath(path, sourcePrimPath, destinationPrimPath!)

    // _CopyProperty authors through the destination stage's edit target.
    // High-level authoring methods keep retained Pcp indexes live while the
    // destination namespace is updated and the coalesced change is scheduled.
    const flatteningToSelf = destinationStage === this &&
      sourcePrimPath === destinationPrimPath && sourceName === destinationName
    if (!flatteningToSelf) {
      destinationStage._clearPropertySpecForFlatten(destinationPrimPath, destinationName)
    }
    destinationStage.declareProperty(
      destinationPrimPath, destinationName, sourceIsRelationship ? 'rel' : typeName)
    if (sourceIsRelationship) {
      destinationStage._setRelTargets(destinationPrimPath, destinationName, targets.map(remap))
    } else {
      const writable = destinationStage._primHandle(destinationPrimPath).attr(destinationName)
      writable.clear()
      if (defaultInfo?.valueIsBlocked()) {
        destinationStage._setAttrDefault(
          destinationPrimPath, destinationName, new SdfValueBlock())
      } else if (defaultInfo?.getSource() === UsdResolveInfoSource.Default ||
                 defaultInfo?.getSource() === UsdResolveInfoSource.Fallback) {
        destinationStage._setAttrDefault(destinationPrimPath, destinationName, defaultValue)
      }
      if (spline) writable.setSpline(spline)
      for (const [time, value] of samples) writable.setTimeSample(time, value)
      writable.setConnections(connections.map(remap))
    }
    for (const [field, value] of Object.entries(metadata)) {
      destinationStage._setPropertyMetadata(destinationPrimPath, destinationName, field, value)
    }
    return destinationStage.get(destinationPath)!
  }

  private _clearPropertySpecForFlatten(primPath: string, propertyName: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const propertyPath = `${primPath}.${propertyName}`
    const specPath = this._mapEditSpecPath(propertyPath)
    // primSpec->RemoveProperty(dstPropSpec) (stage.cpp:6035-6050).
    this._ownAuthoring(() => {
      const propSpec = this._editTarget!.getPropertyAtPath(specPath)
      const owner = propSpec?.getOwner()
      if (propSpec && owner instanceof SdfPrimSpec) owner.removeProperty(propSpec)
    })
  }

  private _getFlattenPropertyMetadata(
    dataPrimPath: string, propertyName: string, source: Attribute,
  ): Record<string, unknown> {
    const fields = new Set<string>()
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (querySource) {
      for (const node of querySource.index.getNodeRange()) {
        if (!node.canContributeSpecs()) continue
        const primSpecPath = pcpLayerPathKey(node.path)
        const specPath = `${primSpecPath === '/' ? '' : primSpecPath}.${propertyName}`
        for (const { layer } of node.layerStack.layers) {
          for (const field of (layer as Layer).getFieldNames(specPath)) fields.add(field)
        }
      }
    }
    const valueFields = new Set([
      'default', 'timeSamples', 'spline', 'typeName', 'connectionPaths', 'targetPaths',
    ])
    const metadata: Record<string, unknown> = {}
    for (const field of fields) {
      if (valueFields.has(field) || field.startsWith('__')) continue
      if (SdfSchema.getInstance().holdsChildren(field)) continue
      const value = source.getField(field)
      if (value !== undefined) metadata[field] = value
    }
    return metadata
  }

  /** @internal Backs UsdObject::GetAllAuthoredMetadata on property handles. */
  _getAllAuthoredPropertyMetadata(
    dataPrimPath: string, propertyName: string, source: Attribute,
  ): Record<string, unknown> {
    const result = this._getFlattenPropertyMetadata(dataPrimPath, propertyName, source)
    for (const field of Object.keys(result)) {
      // GetAllAuthoredMetadata excludes schema dictionary fallbacks.
      const authored = this._resolvePropertyField(dataPrimPath, propertyName, field)
      if (authored === undefined) delete result[field]
      else result[field] = authored
    }
    return result
  }

  /** UsdStage::_FlattenPrim metadata enumeration over the retained index. */
  private _getFlattenPrimMetadata(dataPrimPath: string): Record<string, unknown> {
    const fields = new Set<string>()
    let specType: ReturnType<Layer['getSpecType']> = 'unknown'
    // A generated prototype root is a bare container (no prim index), so it
    // carries no metadata (stage.cpp:5822-5835).
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (querySource) {
      for (const node of querySource.index.getNodeRange()) {
        if (!node.canContributeSpecs()) continue
        const specPath = pcpLayerPathKey(node.path)
        for (const { layer } of node.layerStack.layers) {
          if (specType === 'unknown') specType = (layer as Layer).getSpecType(specPath)
          for (const field of (layer as Layer).getFieldNames(specPath)) fields.add(field)
        }
      }
    }
    // OpenUSD v26.08 stage.cpp:7031-7100 adds required fields only after the
    // resolver discovers a concrete Sdf spec type. A fieldless relocation
    // shell has no prim spec at its composed site, so it must not acquire the
    // prim specifier fallback in GetAllAuthoredMetadata.
    if (specType === 'prim') fields.add('specifier')
    const metadata: Record<string, unknown> = {}
    for (const field of fields) {
      if (field.startsWith('__')) continue
      const value = this._resolvePrimMetadata(dataPrimPath, field)
      if (value !== undefined) metadata[field] = value
    }
    return metadata
  }

  // The per-opinion _FieldValueToStageXf for flattening: asset paths are
  // anchored to the layer that authored them (OpenUSD v26.08
  // pxr/usd/usd/stage.cpp:578-605).
  // A field registered with an SdfAssetPath fallback holds an asset value,
  // which typescript-usd stores as its authored string.
  private static _flattenOpinionXf(fieldName: string) {
    const typeName = SdfSchema.getInstance().getFallback(fieldName) instanceof SdfAssetPath
      ? 'asset' : undefined
    return (value: unknown, layer: Layer, node: PcpNode): unknown =>
      usdAnchorAssetPathsForFlatten(value, typeName, layer,
        node.layerStack.expressionVariables.getVariables() as Record<string, unknown>)
  }

  /**
   * Usd_FlattenAccess::GetAllMetadataForFlatten for a prim: UsdStage::
   * _GetAllMetadata(useFallbacks = false, forFlattening = true) (OpenUSD
   * v26.08 pxr/usd/usd/stage.cpp:5523-5530, 7022-7166).
   */
  private _getAllPrimMetadataForFlatten(dataPrimPath: string): Map<string, unknown> {
    const result = new Map<string, unknown>()
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (!querySource) return result
    const index = querySource.index
    // _ListMetadataFieldsImpl: authored non-private fields, discovering the
    // spec type along the way, then the spec type's required fields.
    const fields: string[] = []
    let specType: ReturnType<Layer['getSpecType']> = 'unknown'
    for (const node of index.getNodeRange()) {
      if (!node.canContributeSpecs()) continue
      const specPath = pcpLayerPathKey(node.path)
      for (const { layer } of node.layerStack.layers) {
        if (specType === 'unknown') specType = (layer as Layer).getSpecType(specPath)
        for (const field of (layer as Layer).getFieldNames(specPath)) {
          if (!usdIsPrivateFieldKey(field)) fields.push(field)
        }
      }
    }
    if (specType !== 'unknown') {
      for (const field of SdfSchema.getInstance().getSpecDefinition(specType)
        ?.getRequiredFields() ?? []) {
        if (!usdIsPrivateFieldKey(field)) fields.push(field)
      }
    }
    for (const field of sortedUniqueFields(fields)) {
      let value: unknown
      if (field === 'specifier' || field === 'typeName') {
        // _GetSpecialPrimMetadataImpl (stage.cpp:6914-6945).
        value = this._resolvePrimMetadata(dataPrimPath, field)
      } else if (field === 'apiSchemas') {
        // Composed list ops resolve to their explicit result.
        value = {
          isExplicit: true, explicitItems: usdComposePrimListOpField(index, field),
          addedItems: [], prependedItems: [], appendedItems: [], deletedItems: [],
          orderedItems: [],
        }
      } else {
        const resolved = usdResolvePrimFieldWithSource(index, field, Stage._flattenOpinionXf(field))
        value = resolved && usdTransformMetadataValue(
          resolved.value, field, 'prim',
          time => sdfLayerOffsetApply(resolved.layerToStageOffset, time), resolved.layerToStageOffset.scale)
      }
      if (value !== undefined) result.set(field, value)
    }
    return result
  }

  /**
   * Usd_FlattenAccess::GetAllMetadataForFlatten for a property (OpenUSD
   * v26.08 pxr/usd/usd/stage.cpp:5523-5530, 6688-6763, 7022-7166).
   */
  private _getAllPropertyMetadataForFlatten(
    dataPrimPath: string, propertyName: string,
  ): Map<string, unknown> {
    const result = new Map<string, unknown>()
    const querySource = this._getPrimQuerySource(dataPrimPath)
    if (!querySource) return result
    const index = querySource.index
    const definition = this.getPrim(dataPrimPath)?.getPrimDefinition()
      .getPropertyDefinition(propertyName)
    const builtin = definition?.isValid() ? definition : undefined
    // If this is a builtin property, determine specType from the definition.
    let specType: ReturnType<Layer['getSpecType']> = builtin
      ? (builtin.isRelationship() ? 'relationship' : 'attribute') : 'unknown'
    const fields: string[] = []
    for (const node of index.getNodeRange()) {
      if (!node.canContributeSpecs()) continue
      const primSpecPath = pcpLayerPathKey(node.path)
      const specPath = `${primSpecPath === '/' ? '' : primSpecPath}.${propertyName}`
      for (const { layer } of node.layerStack.layers) {
        if (specType === 'unknown') specType = (layer as Layer).getSpecType(specPath)
        for (const field of (layer as Layer).getFieldNames(specPath)) {
          if (!usdIsPrivateFieldKey(field)) fields.push(field)
        }
      }
    }
    if (specType !== 'unknown') {
      for (const field of SdfSchema.getInstance().getSpecDefinition(specType)
        ?.getRequiredFields() ?? []) {
        if (!usdIsPrivateFieldKey(field)) fields.push(field)
      }
    }
    const metadataSpecType = specType === 'relationship' ? 'relationship' : 'attribute'
    for (const field of sortedUniqueFields(fields)) {
      let value: unknown
      if (field === 'custom') {
        // _GetPropCustomImpl (stage.cpp:6736-6763).
        value = this._resolvePropertyField(dataPrimPath, propertyName, field)
      } else if ((field === 'typeName' || field === 'variability') &&
                 specType === 'attribute') {
        // _GetAttrTypeImpl / _GetAttrVariabilityImpl consume the prim
        // definition's fallback first (stage.cpp:6688-6734).
        value = builtin?.getMetadata(field)
        if (value === undefined || value === '') {
          value = field === 'variability'
            ? usdResolveWeakestAttributeField(index, propertyName, field)
            : usdResolveAttributeField(index, propertyName, field)
        }
      } else {
        const resolved = usdResolveAttributeFieldWithSource(
          index, propertyName, field, Stage._flattenOpinionXf(field))
        value = resolved && usdTransformMetadataValue(
          resolved.value, field, metadataSpecType,
          time => sdfLayerOffsetApply(resolved.layerToStageOffset, time), resolved.layerToStageOffset.scale)
      }
      if (value !== undefined) result.set(field, value)
    }
    return result
  }

  /**
   * GetAllMetadataForFlatten on the pseudo-root: _ListPseudoRootMetadata
   * FieldsImpl and _ComposePseudoRootMetadataImpl compose only the session
   * layer (when not muted) and root layer opinions (OpenUSD v26.08
   * pxr/usd/usd/stage.cpp:6412-6447, 7062-7096).
   */
  private _getAllPseudoRootMetadataForFlatten(): Map<string, unknown> {
    const result = new Map<string, unknown>()
    const rootLayer = this._rootLayer ?? this._editTarget
    if (!rootLayer) return result
    const layerStack = this._pcpCache?.getLayerStack()
    const sessionLayer = this._sessionLayer &&
      (!layerStack || layerStack.layers[0]?.layer === this._sessionLayer)
      ? this._sessionLayer : undefined
    const exprVars = (layerStack?.expressionVariables.getVariables() ?? {}) as
      Record<string, unknown>
    const layers = sessionLayer ? [sessionLayer, rootLayer] : [rootLayer]
    const fields: string[] = []
    for (const layer of layers) {
      for (const field of layer.getFieldNames('/')) {
        if (!usdIsPrivateFieldKey(field)) fields.push(field)
      }
    }
    for (const field of sortedUniqueFields(fields)) {
      const opinions: unknown[] = []
      for (const layer of layers) {
        const value = layer.getField('/', field)
        if (value !== undefined && value !== null) {
          opinions.push(usdAnchorAssetPathsForFlatten(value,
            SdfSchema.getInstance().getFallback(field) instanceof SdfAssetPath
              ? 'asset' : undefined,
            layer, exprVars))
        }
      }
      if (opinions.length === 0) continue
      result.set(field, usdComposeFieldOpinions(field, opinions[0], opinions.slice(1)))
    }
    return result
  }

  /** @internal Backs UsdObject::GetAllAuthoredMetadata on Prim handles. */
  _getAllAuthoredPrimMetadata(dataPrimPath: string): Record<string, unknown> {
    const result = this._getFlattenPrimMetadata(dataPrimPath)
    // UsdStage::_IsPrivateFieldKey (stage.cpp:2222-2264). Public metadata
    // enumeration excludes composition/value keys and structural/read-only fields.
    const privateFields = new Set(['inheritPaths', 'layerRelocates', 'payload', 'references',
      'specializes', 'subLayers', 'subLayerOffsets', 'variantSelection', 'variantSetNames',
      'clips', 'clipSets', 'default', 'timeSamples', 'spline'])
    const schema = SdfSchema.getInstance()
    for (const field of Object.keys(result)) {
      const definition = schema.getFieldDefinition(field)
      if (privateFields.has(field) || definition?.holdsChildren() || definition?.isReadOnly()) delete result[field]
    }
    return result
  }

  /** @internal Authored API schemas compose from the retained prim index. */
  _getAuthoredAppliedSchemas(dataPrimPath: string): string[] | undefined {
    const querySource = this._getPrimQuerySource(dataPrimPath)
    return querySource ? usdComposePrimListOpField(querySource.index, 'apiSchemas') : undefined
  }

  // The specialize-arc target paths contributing to this prim, in node order —
  // the specialize arcs that are direct children of the prim index's root node
  // and whose mapping to the root namespace is non-empty (i.e. they do not
  // cross a reference; a reference mapping never maps the absolute root </>).
  // Backs UsdShadeMaterial::GetBaseMaterialPath
  // (UsdShadeMaterial::FindBaseMaterialPathInPrimIndex), minus the
  // is-a-material predicate the caller applies. Empty without retained indexes.
  getSpecializeArcTargets(primPath: string): string[] {
    const index = this._pcpCache?.findPrimIndex(primPath)
    if (!index) return []
    const out: string[] = []
    for (const node of index.getNodeRange()) {
      if (!pcpIsSpecializeArc(node.arcType)) continue
      if (node.parent !== index.rootNode) continue
      if (node.mapToParent.evaluate().mapSourceToTarget(SdfPath.absoluteRootPath).isEmpty()) continue
      // The specialize target in the ROOT namespace. node.path is the base
      // material's path in the namespace where the specialize was authored
      // (the referenced-asset namespace when the arc was implied up across a
      // reference). To re-home it without folding in the specialize's own
      // base→deriving remap, map it through the reference arc in the node's
      // origin chain (whose mapToRoot composes the reference remaps to root);
      // with no such reference the path is already root-relative.
      let refNode: PcpNode | null = null
      const seen = new Set<PcpNode>()
      for (let o: PcpNode | null = node.origin; o && !seen.has(o); o = o.origin === o ? null : o.origin) {
        seen.add(o)
        if (o.arcType === PcpArcType.Reference) { refNode = o; break }
      }
      const rootPath = (refNode ?? index.rootNode).mapToRoot.evaluate().mapSourceToTarget(node.path)
      out.push(rootPath.isEmpty() ? node.path.pathString : rootPath.pathString)
    }
    return out
  }

  // True when the strongest opinion authoring connection paths for this
  // property was introduced through a specialize arc — i.e. the connection
  // comes from a live base material. Backs
  // UsdShadeConnectableAPI::IsSourceConnectionFromBaseMaterial: find the
  // strongest property spec with connections, then ask whether the node that
  // introduced it represents a live base material.
  isStrongestConnectionFromSpecializes(propPath: string): boolean {
    const dot = propPath.indexOf('.')
    if (dot <= 0) return false
    const primPath = propPath.slice(0, dot)
    const propName = propPath.slice(dot + 1)
    const index = this._pcpCache?.findPrimIndex(primPath)
    if (!index) return false
    for (const node of index.getNodeRange()) {
      if (!node.canContributeSpecs()) continue
      const propKey = pcpLayerPathKey(node.path.appendProperty(propName))
      for (const { layer } of node.layerStack.layers) {
        const conns = (layer as unknown as Layer).getField(propKey, 'connectionPaths')
        if (Array.isArray(conns) && conns.length > 0) {
          return nodeRepresentsLiveBaseMaterial(node)
        }
      }
    }
    return false
  }

  async setSubLayerPaths(
    paths: string[],
    offsets?: { offset: number; scale: number }[],
  ): Promise<void> {
    if (!this._rootLayer) throw new Error('Stage has no root layer (in-memory authoring stage)')
    const rootLayer = this._rootLayer
    sdfChangeBlock(() => {
      rootLayer.setSubLayerPaths(paths)
      if (offsets) rootLayer.setField('/', 'subLayerOffsets', [...offsets])
    })
    await this.flushChanges()
  }

  // Inserts a sublayer at index (default: strongest position, index 0).
  async insertSubLayer(path: string, index = 0): Promise<void> {
    const paths = this.getSubLayerPaths()
    const i = Math.max(0, Math.min(index, paths.length))
    paths.splice(i, 0, path)
    await this.setSubLayerPaths(paths)
  }

  async removeSubLayer(index: number): Promise<void> {
    const paths = this.getSubLayerPaths()
    if (index < 0 || index >= paths.length) return
    paths.splice(index, 1)
    await this.setSubLayerPaths(paths)
  }

  // Creates a new empty in-memory stage ready for authoring.
  // UsdStage::CreateInMemory (stage.cpp:1189-1219): Open on a new anonymous
  // root layer. Nothing needs loading, so the stage is built synchronously.
  static createNew(): Stage {
    const layer = Layer.createAnonymous('tmp.usda')
    const sessionLayer = _createAnonymousSessionLayer(layer)
    const resolver = ArGetResolver()
    // _CreatePathResolverContext for an anonymous layer (stage.cpp:783-798).
    const resolverContext = resolver.createDefaultContext()
    const loadRules = new StageLoadRules(true)
    const opener = _makePcpLayerOpener(undefined, resolver, resolverContext)
    const cache = PcpCache._createSync(layer, opener, sessionLayer,
      path => loadRules.isIncluded(path))
    const stage = new Stage(layer, layer.filePath, undefined, new UsdInstanceCache(), loadRules)
    stage._rootLayer = layer
    stage._sessionLayer = sessionLayer
    stage._variantFallbacks = Stage.getGlobalVariantFallbacks()
    stage._resolver = resolver
    stage._resolverContext = resolverContext
    stage._usedLayers = new Set([layer, sessionLayer])
    stage._pcpCache = cache
    cache.setVariantFallbacks(stage._variantFallbacks)
    // The new root layer is empty: only the pseudo-root populates.
    cache.computePrimIndexSync('/')
    stage._pseudoRoot = stage._instantiatePrim('/')
    stage._composeSubtree(stage._pseudoRoot, undefined, undefined)
    stage._registerPerLayerNotices()
    stage._subscribeResolverChanges()
    // CreateInMemory goes through _OpenImpl, which publishes the new stage
    // into all current writable caches (stage.cpp:1113-1116).
    for (const cache of UsdStageCacheContext._getWritableCaches()) cache.insert(stage)
    return stage
  }


  // UsdStage::GetEditTarget (stage.h:1041-1047) returns the complete edit
  // target, including its scene-to-spec path map and layer offset.
  getEditTarget(): UsdEditTarget {
    return this._editTargetContext ?? new UsdEditTarget()
  }

  // UsdStage::ResolveIdentifierToEditTarget (stage.cpp:10261-10294).
  // Ar resolution is asynchronous here, so this returns a promise.
  async resolveIdentifierToEditTarget(identifier: string): Promise<string> {
    // Anonymous layers always resolve if open (stage.cpp:10267-10282).
    if (identifier.startsWith('anon:')) {
      return Layer.find(identifier) ? identifier : ''
    }
    const anchor = this._editTargetContext?.getLayer() ?? this._editTarget ?? this._rootLayer
    if (!anchor) return ''
    // SdfResolveAssetPathRelativeToLayer (layerUtils.cpp:196-217) under the
    // stage's resolver context (stage.cpp:10284-10287).
    if (!identifier) return identifier
    const computed = anchor.resolveAsset(identifier)
    if (!computed) return computed
    const { assetPath, args } = _sdfSplitLayerIdentifier(computed)
    const resolved = await this._resolver.resolve(assetPath, this._resolverContext)
    return _sdfCreateLayerIdentifier(
      _resolvedPathForAssetValue(resolved, this._resolverContext).toString(), args)
  }

  // UsdStage::GetEditTargetForLocalLayer: include the local layer-stack time
  // offset so authoring maps stage time back into the selected layer.
  getEditTargetForLocalLayer(layerOrIndex: Layer | number): UsdEditTarget {
    const layers = this._pcpCache?.getLayerStack().layers
    if (typeof layerOrIndex === 'number') {
      const entry = layers?.[layerOrIndex]
      if (!entry) throw new Error(`Local layer index ${layerOrIndex} is out of range`)
      return new UsdEditTarget(entry.layer as Layer, entry.offset)
    }
    const entry = layers?.find(candidate => candidate.layer === layerOrIndex)
    if (entry) return new UsdEditTarget(layerOrIndex, entry.offset)
    if (this.getLayerStack(true).includes(layerOrIndex)) return new UsdEditTarget(layerOrIndex)
    throw new Error('Layer is not in the stage local layer stack')
  }

  // The stage's anonymous session layer: the strongest layer in the local
  // stack, never serialized with the asset. Edits authored here are
  // retractable without touching the opened file (UsdStage::GetSessionLayer).
  // The layer the stage was opened from (UsdStage::GetRootLayer).
  getRootLayer(): Layer {
    if (!this._rootLayer && this._editTarget) return this._editTarget   // in-memory authoring stage
    if (!this._rootLayer) throw new Error('Stage has no root layer')
    return this._rootLayer
  }

  private _sessionLayer: Layer | null = null
  getSessionLayer(): Layer {
    if (!this._sessionLayer) throw new Error('Stage has no session layer (in-memory authoring stage)')
    return this._sessionLayer
  }
  hasSessionLayer(): boolean { return this._sessionLayer !== null }

  // The local layer stack, strongest first: session layer (optional), root
  // layer, then sublayers in depth-first authored order — mirrors
  // UsdStage::GetLayerStack. Layer objects are stable across recomposition
  // (per-stage registry), so handles from here stay valid for editing.
  // UsdStage::GetUsedLayers (stage.cpp:4084-4100): the layers PcpCache
  // uses, plus the clip layers unless includeClipLayers is false.
  getUsedLayers(includeClipLayers = true): Layer[] {
    const layers = new Set<Layer>()
    for (const layer of this._pcpCache?.getUsedLayers() ?? []) layers.add(layer as Layer)
    if (!includeClipLayers) return [...layers]
    for (const dependencies of this._usdDependenciesByPrim.values()) {
      for (const layer of dependencies) layers.add(layer)
    }
    return [...layers]
  }

  // UsdStage::GetCompositionErrors (OpenUSD v26.08 stage.cpp:4025-4044).
  // Errors remain additive: unresolved arcs do not make Stage.open fail.
  getCompositionErrors(): PcpError[] {
    const errors: PcpError[] = []
    this._pcpCache?.forEachPrimIndex(index => errors.push(...index.getLocalErrors()))
    this._pcpCache?.forEachLayerStack(stack => errors.push(...stack.localErrors))
    return errors
  }

  getLayerStack(includeSessionLayers = true): Layer[] {
    const out: Layer[] = []
    const push = (l: Layer | null | undefined) => {
      if (l && !out.includes(l)) out.push(l)
    }
    if (!this._rootLayer) {
      // In-memory authoring stage: the anonymous root is the whole stack.
      push(this._editTarget)
      return out
    }
    // PcpCache owns the retained root layer stack independently of which prim
    // indexes have happened to be computed.
    if (this._pcpCache) {
      for (const { layer } of this._pcpCache.getLayerStack().layers) {
        const l = layer as unknown as Layer
        if (!includeSessionLayers && l === this._sessionLayer) continue
        push(l)
      }
      return out
    }
    // Fallback for an empty stage (no prim indexes to read the stack from).
    if (includeSessionLayers) push(this._sessionLayer)
    push(this._rootLayer)
    return out
  }

  // Sets the authoring target. Must be a layer in the stage's local layer
  // stack (session, root, or any sublayer), per UsdStage::SetEditTarget.
  setEditTarget(editTarget: Layer | UsdEditTarget): void {
    const target = editTarget instanceof UsdEditTarget
      ? editTarget : new UsdEditTarget(editTarget)
    const layer = target.getLayer()
    if (!layer) throw new Error('setEditTarget: invalid edit target')
    if (target.getMapFunction().isIdentity() &&
        layer !== this._editTarget && !this.getLayerStack(true).includes(layer)) {
      throw new Error('setEditTarget: layer is not in the stage\'s local layer stack')
    }
    // If different from current, set EditTarget and notify.
    if (this._editTargetContext && this._editTargetContext.equals(target)) return
    this._editTarget = layer
    this._editTargetContext = target
    new UsdNotice.StageEditTargetChanged(this).send(this)
  }

  private _mapEditSpecPath(scenePath: string): string {
    const specPath = this._editTargetContext?.mapToSpecPath(scenePath) ?? scenePath
    if (!specPath) throw new Error(`Cannot map <${scenePath}> to the current edit target`)
    return specPath
  }

  private _mapEditTime(stageTime: number): number {
    const offset = this._editTargetContext?.getMapFunction().getTimeOffset()
    if (!offset) return stageTime
    const inverse = sdfLayerOffsetInverse(offset)
    if (!inverse) throw new Error('Current edit target has a non-invertible time offset')
    return sdfLayerOffsetApply(inverse, stageTime)
  }

  private _mapEditDurationScale(): number {
    const offset = this._editTargetContext?.getMapFunction().getTimeOffset()
    const inverse = offset && sdfLayerOffsetInverse(offset)
    if (offset && !inverse) throw new Error('Current edit target has a non-invertible time offset')
    return inverse?.scale ?? 1
  }

  // _TransformSampleMap with _StageValueToFieldXf (stage.cpp:633-664): each
  // sample time and each time-valued sample value is mapped through the
  // edit target. The map is given as [time, value] pairs, a Map, or an
  // object keyed by time (the composed GetMetadata shape), and is authored as
  // the layer's sorted pairs.
  private _mapEditTimeSampleMap(value: unknown, typeName: string | undefined): unknown {
    const pairs: Array<[number, unknown]> = value instanceof Map
      ? [...value].map(([time, sample]) => [Number(time), sample])
      : Array.isArray(value) ? (value as Array<[number, unknown]>).map(([time, sample]) => [Number(time), sample])
      : value && typeof value === 'object'
        ? Object.entries(value).map(([time, sample]) => [Number(time), sample])
        : []
    if (pairs.length === 0 && !(value && typeof value === 'object')) return value
    return pairs
      .map(([time, sample]): [number, unknown] => [this._mapEditTime(time), this._mapEditValue(sample, typeName)])
      .sort((a, b) => a[0] - b[0])
  }

  private _mapEditValue(value: unknown, typeName: string | undefined): unknown {
    if (typeName === 'duration' || typeName === 'duration[]') return scaleDurationValue(value, this._mapEditDurationScale())
    if (typeName === 'timecode' && typeof value === 'number') return this._mapEditTime(value)
    if (typeName === 'timecode[]') {
      const mapped = mapArrayValue(value, item => typeof item === 'number' ? this._mapEditTime(item) : item)
      if (mapped !== undefined) return mapped
    }
    return value
  }

  private _mapEditProperty(scenePrimPath: string, propertyName: string):
    { primPath: string; propertyName: string; propertyPath: string } {
    const propertyPath = this._mapEditSpecPath(`${scenePrimPath}.${propertyName}`)
    const dot = propertyPath.lastIndexOf('.')
    if (dot < 0) throw new Error(`Edit target did not map a property path for <${scenePrimPath}.${propertyName}>`)
    return {
      primPath: propertyPath.slice(0, dot), propertyName: propertyPath.slice(dot + 1), propertyPath,
    }
  }

  // UsdStage::_CreatePrimSpecForEditing (stage.cpp:1722-1742).
  /** @internal Also UsdVariantSet::_CreatePrimSpecForEditing. */
  _createPrimSpecForEditing(primPath: string): string {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const specPath = this._mapEditSpecPath(primPath)
    sdfCreatePrimInLayer(this._editTarget, specPath)
    return specPath
  }

  // UsdStage::_CreatePropertySpecForEditing (stage.cpp:1847-1934): the
  // property spec at the edit target, creating it from the property's
  // schema definition or by copying the strongest existing spec's required
  // fields. typescript-usd: with neither, a spec is stamped with the given fallback
  // (UsdAttribute::_CreateSpec's defaults) or as an untyped attribute.
  private _createPropertySpecForEditing(
    primPath: string, propertyName: string,
    fallback?: { specType: 'attribute' | 'relationship'; typeName?: string; custom?: boolean;
      variability?: string },
  ): { primPath: string; propertyName: string; propertyPath: string } {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const layer = this._editTarget
    const mapped = this._mapEditProperty(primPath, propertyName)
    if (layer.hasSpec(mapped.propertyPath)) return mapped

    let spec: { specType: 'attribute' | 'relationship'; typeName?: string; custom: boolean;
      variability: string } | undefined
    // First, see if we can create a new spec from the property's schema
    // definition.
    const prim = this._getPrimDataAtPathOrInPrototype(primPath)
    const primDefinition = prim?.getPrimTypeInfo().getPrimDefinition()
    const definition = primDefinition?.getPropertyDefinition(propertyName)
    if (definition?.isValid()) {
      spec = definition.isAttribute()
        ? {
            specType: 'attribute', custom: false, variability: definition.getVariability(),
            typeName: primDefinition!.getAttributeDefinition(propertyName).getTypeNameToken(),
          }
        : { specType: 'relationship', custom: false, variability: definition.getVariability() }
    } else {
      // Otherwise copy the required metadata of the strongest property spec.
      const index = prim?._primIndex
      for (const node of index?.getNodeRange() ?? []) {
        if (spec || !node.canContributeSpecs()) continue
        const specPath = `${pcpLayerPathKey(node.path)}.${propertyName}`
        for (const { layer: nodeLayer } of node.getLayerStack().layers) {
          if (!nodeLayer.hasSpec(specPath)) continue
          const specType = nodeLayer.getSpecType(specPath) === 'relationship' ? 'relationship' : 'attribute'
          const typeName = nodeLayer.getField(specPath, 'typeName')
          spec = {
            specType,
            custom: nodeLayer.getField(specPath, 'custom') === true,
            variability: nodeLayer.getField(specPath, 'variability') === 'uniform' ? 'uniform' : 'varying',
            ...(specType === 'attribute' && typeof typeName === 'string' ? { typeName } : {}),
          }
          break
        }
      }
    }
    const fields = spec ?? (fallback && {
      specType: fallback.specType, custom: fallback.custom ?? true,
      variability: fallback.variability ?? (fallback.specType === 'relationship' ? 'uniform' : 'varying'),
      ...(fallback.typeName === undefined ? {} : { typeName: fallback.typeName }),
    })
    sdfChangeBlock(() => {
      this._createPrimSpecForEditing(primPath)
      if (fields) {
        layer._createPropertySpec(mapped.primPath, mapped.propertyName, fields.specType, fields)
      }
    })
    return mapped
  }

  // Editing restrictions (UsdStage::_ValidateEditPrim): opinions cannot be
  // authored at paths inside prototypes or beneath instances (instance
  // proxies) — upstream raises a coding error for both.
  private _validateAuthoringTarget(path: string): void {
    const primPath = path.split('.')[0]!
    if (isPathInPrototype(primPath)) {
      throw new Error(`Cannot author to <${path}>: prototype prims are read-only`)
    }
    if (this._instanceCache.isPathDescendantToAnInstance(primPath)) {
      const anc = this._instanceCache.getMostAncestralInstancePath(primPath)
      throw new Error(
        `Cannot author to <${path}>: descendants of instance <${anc}> are instance proxies and read-only`)
    }
  }

  // Defines a prim at path, creating ancestor prims as needed. Returns a handle for authoring.
  // UsdStage::DefinePrim / _DefinePrim (stage.cpp:3841-3895).
  definePrim(path: string, typeName?: string): Prim {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(path)
    this._definePrim(path, typeName)
    return this._primHandle(path)
  }

  private _definePrim(path: string, typeName?: string): void {
    // Special-case requests for the root.  It always succeeds and never does
    // authoring since the root cannot have PrimSpecs.
    if (path === '/') return
    // Define all ancestors.
    this._definePrim(parentOf(path))
    // Now author scene description for this prim, when it is missing, not
    // defined, or typed differently.
    const prim = this._primMap.get(path)
    if (prim?.isDefined() && (!typeName || prim.getTypeName() === typeName)) return
    sdfChangeBlock(() => {
      const specPath = this._createPrimSpecForEditing(path)
      // Set specifier and typeName, if not empty.
      this._editTarget!.setField(specPath, 'specifier', 'def')
      if (typeName) this._editTarget!.setField(specPath, 'typeName', typeName)
    })
  }

  // UsdStage::OverridePrim (stage.cpp:3803): an over at the edit
  // target, if the prim does not exist.
  overridePrim(path: string): Prim {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(path)
    if (path !== '/' && !this._primMap.has(path)) {
      sdfChangeBlock(() => { this._createPrimSpecForEditing(path) })
    }
    return this._primHandle(path)
  }

  // UsdStage::CreateClassPrim (stage.cpp:3899).
  createClassPrim(path: string): Prim {
    // Classes must be created in local layers.
    if (this._editTargetContext?.getMapFunction().isIdentity() &&
        this._editTarget && !this.getLayerStack(true).includes(this._editTarget)) {
      throw new Error('Must create classes in local LayerStack')
    }
    this._validateAuthoringTarget(path)
    const prim = this._primMap.get(path)
    if (prim?.isDefined() && this._resolvePrimMetadata(path, 'specifier') !== 'class') {
      throw new Error(`Non-class prim already exists at <${path}>`)
    }
    if (!prim?.isAbstract()) {
      this._definePrim(path)
      this._setPrimMetadata(path, 'specifier', 'class')
    }
    return this._primHandle(path)
  }

  has(path: string): boolean {
    return this._primMap.has(path)
  }

  // UsdStage::GetPrimAtPath (stage.cpp:2287-2310), including instance proxies.
  getPrim(path: string): Prim | undefined {
    const primData = this._primMap.get(path)
    if (primData) return new Prim(this, primData)
    const primInPrototypePath = this._instanceCache.getPathInPrototypeForInstancePath(path)
    if (primInPrototypePath !== undefined) {
      const protoData = this._primMap.get(primInPrototypePath)
      if (protoData) return new Prim(this, protoData, path)
    }
    return undefined
  }

  // UsdStage::GetObjectAtPath (stage.cpp:2322-2341): a prim for an absolute
  // root or prim path, the property UsdPrim::GetProperty finds for a prim
  // property path, else the invalid object. A property is typed by its
  // defining spec (UsdObject::IsValid, object.h:127-137; the Python wrapper
  // returns the most-derived type), so a property with no attribute or
  // relationship spec or definition is invalid.
  getObjectAtPath(path: string): Prim | Attribute | UsdRel | undefined {
    let sdfPath: SdfPath
    try { sdfPath = SdfPath.fromString(path) } catch { return undefined }
    // Maintain consistent behavior with GetPrimAtPath
    if (!sdfPath.isAbsolutePath()) return undefined
    if (sdfPath.isAbsoluteRootOrPrimPath()) return this.getPrim(sdfPath.pathString)
    if (sdfPath.isPrimPropertyPath()) {
      const prim = this.getPrim(sdfPath.getPrimPath().pathString)
      if (!prim) return undefined
      const name = sdfPath.name
      const dataPrimPath = prim._prim.path
      const specType = this._getDefiningSpecType(dataPrimPath, name)
      if (specType === 'attribute') return prim.getAttr(name)
      if (specType === 'relationship') return prim.rel(name)
    }
    return undefined
  }

  // UsdStage::GetPropertyAtPath / GetAttributeAtPath / GetRelationshipAtPath
  // (stage.cpp:2343-2359): GetObjectAtPath(path).As<...>().
  getPropertyAtPath(path: string): Attribute | UsdRel | undefined {
    const object = this.getObjectAtPath(path)
    return object instanceof Prim ? undefined : object
  }

  getAttributeAtPath(path: string): Attribute | undefined {
    const object = this.getObjectAtPath(path)
    return object instanceof Attribute ? object : undefined
  }

  getRelationshipAtPath(path: string): UsdRel | undefined {
    const object = this.getObjectAtPath(path)
    return object instanceof UsdRel ? object : undefined
  }

  // UsdStage::RemovePrim / _RemovePrim (stage.cpp:3944-3947, 4202-4215):
  // remove the prim spec at the edit target from its real name parent.
  removePrim(path: string): boolean {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const spec = this._editTarget.getPrimAtPath(this._mapEditSpecPath(path))
    if (!spec) return false
    const parent = spec.getRealNameParent()
    if (!parent) return false
    return parent.removeNameChild(spec)
  }

  /** @internal A prim handle at `path` for the stage's authoring API. A path
   * that is not populated (beneath an inactive ancestor, outside the mask)
   * gets a handle on detached prim data. */
  _primHandle(path: string): Prim {
    return this.getPrim(path) ?? new Prim(this, new UsdPrimData(this, path))
  }

  // ---- Native instancing queries (UsdStage::GetPrototypes & co.) ----

  // All prototype root prims generated by the last composition pass.
  getPrototypes(): Prim[] {
    return this._instanceCache.getAllPrototypes().sort()
      .map(path => this._primMap.get(path))
      .filter((primData): primData is UsdPrimData => primData !== undefined)
      .map(primData => new Prim(this, primData))
  }

  // Paths of the instance prims sharing the given prototype
  // (UsdPrim::GetInstances). Nested instances report in-prototype paths
  // (e.g. /__Prototype_2/A), exactly as upstream does.
  getInstances(prototypePath: string): string[] {
    const out: string[] = []
    for (const primIndexPath of this._instanceCache.getInstancePrimIndexesForPrototype(prototypePath)) {
      const primData = this._getPrimDataAtPathOrInPrototype(primIndexPath)
      if (primData) out.push(primData.path)
    }
    return out.sort()
  }

  // UsdStage::GetPropertyAtPath: a property authored on, or defined by the
  // schema of, a populated prim.
  get(path: string): Attribute | undefined {
    const dotIdx = path.indexOf('.')
    if (dotIdx <= 0) return undefined
    const prim = this.getPrim(path.slice(0, dotIdx))
    if (!prim) return undefined
    const propertyName = path.slice(dotIdx + 1)
    if (!prim.attrNames.includes(propertyName) &&
        !prim.getPrimDefinition().hasProperty(propertyName)) return undefined
    return prim.getAttr(propertyName)
  }

  // UsdStage::Traverse: pre-order over root children with
  // UsdPrimDefaultPredicate (active, defined, loaded, non-abstract).
  traverse(predicate: UsdPrimPredicate = PrimDefaultPredicate): Iterable<string> {
    const stage = this
    const pred = asPrimPredicate(predicate)
    const start = this._traversalStart()
    return (function* () {
      const stack = [...stage.getAllChildPrimPaths('/')].reverse()
      while (stack.length > 0 || stage._raiseIfExpiredTraversal(start)) {
        const path = stack.pop()!
        const prim = stage.getPrim(path)
        if (!prim || !pred.evaluate(prim)) continue
        yield path
        const children = stage.getAllChildPrimPaths(
          path, { instanceProxies: pred.includeInstanceProxies })
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
      }
    })()
  }

  // UsdPrimRange::Stage begins at the pseudo-root's first child
  // (primRange.cpp:19-33); the traversal remembers it with the pseudo-root
  // that owns it.
  private _traversalStart(): { pseudoRoot: UsdPrimData, firstChild: string } | undefined {
    const firstChild = this._pseudoRoot?._firstChild
    return this._pseudoRoot && firstChild
      ? { pseudoRoot: this._pseudoRoot, firstChild: firstChild.path }
      : undefined
  }

  // A non-empty stage range whose prim data was destroyed with its stage
  // raises, as Usd_PyPrimRange does (wrapPrimRange.cpp:144-184).
  private _raiseIfExpiredTraversal(
    start: { pseudoRoot: UsdPrimData, firstChild: string } | undefined,
  ): false {
    if (start && start.pseudoRoot._isDead()) {
      throw new TfError(`Invalid range starting with expired prim <${start.firstChild}>`)
    }
    return false
  }

  // UsdStage::TraverseAll: the same stage-root range with
  // UsdPrimAllPrimsPredicate (stage.cpp:4187-4191).
  traverseAll(): Iterable<string> {
    const stage = this
    const start = this._traversalStart()
    return (function* () {
      const stack = [...stage.getAllChildPrimPaths('/')].reverse()
      while (stack.length > 0 || stage._raiseIfExpiredTraversal(start)) {
        const path = stack.pop()!
        yield path
        const children = stage.getAllChildPrimPaths(path)
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]!)
      }
    })()
  }

  // Child prim paths. Prototype roots are not children of the pseudo-root
  // (UsdStage::GetPseudoRoot().GetChildren() excludes prototypes), and
  // instances report no children unless instanceProxies is set — then the
  // prototype's children appear rebased to instance-side proxy paths
  // (Usd.TraverseInstanceProxies semantics).
  getChildPrimPaths(path: string, opts?: { instanceProxies?: boolean }): string[] {
    return this._getChildPrimPaths(path, opts, false)
  }

  // UsdPrim::GetAllChildren: the unfiltered sibling range, including abstract
  // class prims (prim.h:1431-1437).
  getAllChildPrimPaths(path: string, opts?: { instanceProxies?: boolean }): string[] {
    return this._getChildPrimPaths(path, opts, true)
  }

  private _getChildPrimPaths(
    path: string, opts: { instanceProxies?: boolean } | undefined, allPrims: boolean,
  ): string[] {
    const prim = this.getPrim(path)
    if (!prim) return []
    let source: UsdPrimData | undefined = prim._prim
    if (source.isInstance() || prim.isInstanceProxy()) {
      // Usd_CreatePredicateForTraversal (primData.h:483-496): traversal
      // beneath instances is allowed when requested or when the starting
      // point is already an instance proxy.
      if (!opts?.instanceProxies && !prim.isInstanceProxy()) return []
      if (source.isInstance()) source = source.getPrototype()
      if (!source) return []
    }
    // UsdPrim::GetChildren uses UsdPrimDefaultPredicate, which excludes
    // abstract (`class`) prims (primFlags.h:495-508; prim.h:2520-2522).
    // Prototypes are not children of the pseudo-root.
    const out: string[] = []
    for (const child of source._children()) {
      if (!allPrims && !(child.isActive() && child.isDefined() && child.isLoaded() &&
          !child.isAbstract())) continue
      out.push(childPath(path, child.name))
    }
    return out
  }

  // Flattens the composed stage into a single in-memory layer
  // (UsdStage::Flatten): every composed prim and property with resolved
  // values and stage-time samples. Native instancing is preserved in
  // upstream Flatten's exact shape — each prototype becomes a root-level
  // `over "Flattened_Prototype_N"` and instances stay instanceable with an
  // internal reference to it, so reopening the layer re-instances.
  flatten(addSourceFileComment = true): Layer {
    return _withStageTraceSync(
      'typescript-usd:Stage.flatten',
      (scopeContext) => {
        if (scopeContext) _traceScopeData(scopeContext, 'stageNodeCount', this._primMap.size)
        return this._flatten(addSourceFileComment)
      },
    )
  }

  // UsdStage::Flatten (OpenUSD v26.08 pxr/usd/usd/stage.cpp:5930-5976).
  private _flatten(addSourceFileComment: boolean): Layer {
    const rootLayer = this.getRootLayer()
    const flatLayer = Layer.createAnonymous('anon:flattened')

    // Preemptively populate our mapping. This allows us to populate nested
    // instances in the destination layer much more simply
    // (_GenerateFlattenedPrototypePath, stage.cpp:5610-5650).
    const prototypes = this.getPrototypes()
    const prototypeToFlattened = new Map<string, string>()
    let primPrototypeId = 1
    for (const prototype of prototypes) {
      if (prototypeToFlattened.has(prototype.path)) continue
      // We want to ensure that we don't clash with user prims in the
      // unlikely even they named it Flatten_xxx.
      let flattenedPrototypePath = `/Flattened_Prototype_${primPrototypeId++}`
      while (this.getPrim(flattenedPrototypePath)) {
        flattenedPrototypePath = `/Flattened_Prototype_${primPrototypeId++}`
      }
      prototypeToFlattened.set(prototype.path, flattenedPrototypePath)
    }

    // We author the prototype overs first to produce simpler assets which
    // have them grouped at the top of the file (stage.cpp:5947-5958).
    for (const prototype of prototypes) {
      const flattenedPrototypePath = prototypeToFlattened.get(prototype.path)!
      this._forAllPrimsForFlatten(prototype._prim, primData => {
        // We need to update the child path to use the Flatten name.
        const flattenedChildPath = flattenedPrototypePath +
          primData.path.slice(prototype.path.length)
        return this._copyPrimForFlatten(
          primData, flatLayer, flattenedChildPath, prototypeToFlattened)
      })
    }
    if (this._pseudoRoot) {
      this._forAllPrimsForFlatten(this._pseudoRoot, primData =>
        this._copyPrimForFlatten(primData, flatLayer, primData.path, prototypeToFlattened))
    }

    if (addSourceFileComment) {
      const authoredDoc = flatLayer.getField('/', 'documentation')
      let doc = typeof authoredDoc === 'string' ? authoredDoc : ''

      if (doc !== '') {
        doc += '\n\n'
      }

      doc += `Generated from Composed Stage of root layer ${rootLayer.realPath}\n`

      flatLayer.setField('/', 'documentation', doc)
    }

    return flatLayer
  }

  // UsdPrimRange::AllPrims in composed sibling order. An inactive prim has no
  // composed children, so returning false prunes nothing upstream would visit.
  private _forAllPrimsForFlatten(
    root: UsdPrimData, visit: (primData: UsdPrimData) => boolean,
  ): void {
    if (!visit(root)) return
    for (const child of root._children()) this._forAllPrimsForFlatten(child, visit)
  }

  // _CopyPrim (OpenUSD v26.08 pxr/usd/usd/stage.cpp:5772-5822).
  private _copyPrimForFlatten(
    primData: UsdPrimData, layer: Layer, path: string,
    prototypeToFlattened: ReadonlyMap<string, string>,
  ): boolean {
    if (!primData.isActive()) return false

    const isPseudoRoot = primData.path === '/'
    if (!isPseudoRoot) {
      // Note that the true value for spec will be populated in _CopyMetadata.
      layer.definePrimSpec(path, primData.getTypeName() || undefined, 'over')
    }

    const prototype = primData.getPrototype()
    if (prototype) {
      const flattenedPrototypePath = prototypeToFlattened.get(prototype.path)!
      // Author an internal reference to our flattened prototype prim
      // (GetReferenceList().Append, stage.cpp:5807-5808).
      layer.setField(path, 'references', {
        isExplicit: false, explicitItems: [], prependedItems: [], addedItems: [],
        deletedItems: [], orderedItems: [],
        appendedItems: [{
          assetPath: '', primPath: flattenedPrototypePath,
          layerOffset: { offset: 0, scale: 1 },
        }],
      })
    }

    // _CopyAuthoredMetadata (stage.cpp:5669-5678).
    const metadata = isPseudoRoot
      ? this._getAllPseudoRootMetadataForFlatten()
      : this._getAllPrimMetadataForFlatten(primData.path)
    // _CopyMetadata (stage.cpp:5658-5675) authors through SdfSpec::SetInfo,
    // which refuses a field with no schema definition (spec.cpp:202-206):
    // unregistered metadata is warned about and not copied.
    for (const [field, value] of metadata) {
      if (flattenCanCopyField(field)) layer.setField(path, field, value)
    }

    // In the case of flattening clips, we may have builtin attributes which
    // aren't declared in the static scene topology, but may have a value in
    // some clips that we want to relay into the flattened result.
    // XXX: This should be removed if we fix GetProperties()
    // and GetAuthoredProperties to consider clips.
    // typescript-usd: only clips can give an unauthored property a value, so the
    // value query is skipped for prims without clip sets.
    const prim = new Prim(this, primData)
    const authored = new Set(prim.attrNames)
    const querySource = isPseudoRoot ? undefined : this._getPrimQuerySource(primData.path)
    const mayHaveClipValues = querySource !== undefined &&
      this._clipSetsByPrim.has(querySource.sourcePrimPath)
    for (const name of isPseudoRoot ? [] : prim.getPropertyNames()) {
      const prop = prim.getAttr(name)
      if (!prop) continue
      if (authored.has(name) ||
          (mayHaveClipValues && !prop.isRelationship && prop.hasAuthoredValue())) {
        this._copyPropertyForFlatten(prim, prop, layer, path, name, prototypeToFlattened)
      }
    }
    return true
  }

  // _CopyProperty with an identity time offset (OpenUSD v26.08
  // pxr/usd/usd/stage.cpp:5680-5770).
  private _copyPropertyForFlatten(
    prim: Prim, prop: Attribute, layer: Layer, destPrimPath: string, destName: string,
    pathRemapping: ReadonlyMap<string, string>,
  ): void {
    const dataPrimPath = prop._getPrimPath()
    const name = prop._getName()
    const destPath = `${destPrimPath === '/' ? '' : destPrimPath}.${destName}`
    const remapAndRemovePrototypePaths = (paths: string[]): string[] => {
      // _RemapTargetPaths (stage.cpp:5564-5581).
      const remapped = paths.map(p => {
        let best: [string, string] | undefined
        for (const entry of pathRemapping) {
          const [from] = entry
          if ((p === from || p.startsWith(`${from}/`) || p.startsWith(`${from}.`)) &&
              (!best || from.length > best[0].length)) best = entry
        }
        return best ? best[1] + p.slice(best[0].length) : p
      })
      // _RemovePrototypeTargetPaths (stage.cpp:5587-5608).
      return remapped.filter(p => !isPathInPrototype(p))
    }

    if (!prop.isRelationship) {
      const typeName = prop.typeName
      if (!typeName) {
        TfRaiseWarning(`Attribute <${prim.path}.${name}> has unknown value type. ` +
          'It will be omitted from the flattened result.')
        return
      }
      if (!layer.hasSpec(destPath)) {
        layer._createPropertySpec(destPrimPath, destName, 'attribute',
          { typeName, custom: false, variability: 'varying' })
      }

      for (const [field, value] of this._getAllPropertyMetadataForFlatten(dataPrimPath, name)) {
        if (!flattenCanCopyField(field)) continue
        layer.setField(destPath, field, value)
      }

      // Following composition strength order, if the resolve info value
      // source is samples or clips, we write out samples. Otherwise if the
      // source is a spline, we write out the spline. We always write out the
      // default if one is authored, to handle calls to Get() with the default
      // time.
      const fallback = (): unknown => prop.getFallbackValue()
      const resolveInfo = prop.getResolveInfo()
      const anchorValue = (value: unknown, resolved: UsdAttributeResolveResult): unknown =>
        resolved.layer && resolved.node
          ? usdAnchorAssetPathsForFlatten(value, typeName, resolved.layer,
            resolved.node.getLayerStack().expressionVariables.getVariables() as
              Record<string, unknown>)
          : value
      const spline = prop.getSpline()
      if (spline) {
        layer.setField(destPath, 'spline', spline)
      } else if (resolveInfo.valueSourceMightBeTimeVarying()) {
        // Usd_FlattenAccess::MakeTimeSampleMapForFlatten (stage.cpp:5547-5562)
        // keeps SdfValueBlock samples.
        const resolved = this._resolveAttribute(dataPrimPath, name, undefined, fallback)
        // Asset paths anchor to the layer each sample comes from, which for
        // clips is the clip (or manifest) layer at that time
        // (_TimeSampleMapResolver::ProcessClips, stage.cpp:8807-8826).
        const isAsset = typeName === 'asset' || typeName === 'asset[]'
        const samples: [number, unknown][] = []
        for (const time of prop.getTimeSampleKeys()) {
          // A blocked sample resolves to no value.
          const value = prop.getValueAtTime(time) ?? new SdfValueBlock()
          if (value instanceof SdfValueBlock) {
            samples.push([time, value])
            continue
          }
          const source = isAsset && resolved.source === 'valueClips'
            ? this._resolveAttribute(dataPrimPath, name, time, fallback) : resolved
          samples.push([time, anchorValue(value, source)])
        }
        // SetInfo stores the values as composed, whatever the spec's type
        // name (Layer._setValueFieldAsGiven).
        if (samples.length > 0) layer._setValueFieldAsGiven(destPath, 'timeSamples', samples)
      }

      // Always write default if we have one.
      if (this._hasAuthoredPropertyFieldInStack(dataPrimPath, name, 'default')) {
        const resolved = this._resolveAttribute(dataPrimPath, name, 'default', fallback)
        const defaultValue = prop.getValue()
        layer._setValueFieldAsGiven(destPath, 'default', defaultValue === undefined
          ? new SdfValueBlock()
          // Usd_FlattenAccess::ResolveValueForFlatten (stage.cpp:5532-5545).
          : anchorValue(defaultValue, resolved))
      }
      const sources = prop.getConnections()
      if (sources.length > 0) {
        layer.setAttrConnections(destPrimPath, destName, remapAndRemovePrototypePaths(sources))
      }
    } else {
      // NOTE: custom = true by default for relationship, but the SdfSchema
      // fallback is false, so we must set it explicitly here. The situation
      // is similar for variability.
      if (!layer.hasSpec(destPath)) {
        layer._createPropertySpec(destPrimPath, destName, 'relationship',
          { custom: false, variability: 'varying' })
      }

      for (const [field, value] of this._getAllPropertyMetadataForFlatten(dataPrimPath, name)) {
        if (!flattenCanCopyField(field)) continue
        layer.setField(destPath, field, value)
      }

      const targets = prop.getTargets()
      if (targets.length > 0) {
        layer.setRelTargets(destPrimPath, destName, remapAndRemovePrototypePaths(targets))
      }
    }
  }

  // UsdObject::HasAuthoredMetadata over the composed property stack.
  private _hasAuthoredPropertyFieldInStack(
    dataPrimPath: string, propertyName: string, fieldName: string,
  ): boolean {
    const querySource = this._getPrimQuerySource(dataPrimPath)
    return querySource !== undefined && usdResolveAttributeFieldWithSource(
      querySource.index, propertyName, fieldName) !== undefined
  }

  // Serializes the edit target layer to USDA text. Only valid on stages created with createNew().
  exportToUsda(): string {
    if (!this._editTarget) throw new Error('Stage has no edit target')
    return this._editTarget.toUsda()
  }

  // Serializes the edit target layer to USDC binary. Only valid on stages created with createNew().
  exportToUsdc(): Uint8Array {
    if (!this._editTarget) throw new Error('Stage has no edit target')
    return this._editTarget.toUsdc()
  }

  // UsdStage::Save persists the root layer through SdfLayer's Ar-backed write
  // path. Like other web-USD composition work, host I/O is asynchronous.
  async save(): Promise<boolean> {
    return this.getRootLayer().save()
  }

  // UsdStage::Reload (stage.cpp:3615-3660): the layer change notices from
  // reloading and the changes PcpCache::Reload records are processed as one
  // round of change processing.
  async reload(): Promise<void> {
    const result = this._runCompositionPass(this._reload())
    if (result instanceof Promise) await result
    await this._prepareAssetPaths()
  }

  private *_reload(): PcpMaybeAsync<void> {
    const cache = this._pcpCache!
    // Combine the stage changes from processing the layer changes with the
    // stage changes indicated by PcpCache::Reload, so this stage goes
    // through one round of change processing and notification.
    const localPendingChanges = new UsdPendingChanges()
    this._pendingChanges = localPendingChanges

    // Reload layers in a change block to batch together change notices.
    // typescript-usd: layers reload asynchronously, so the block stays open while
    // they load.
    const block = new SdfChangeBlock()
    try {
      // Reload layers that are reached via composition.
      yield cache.reload(localPendingChanges.pcpChanges)
      // Reload all clip layers that are opened (Usd_ClipCache::Reload).
      const pcpLayers = cache.getUsedLayers()
      for (const layers of this._usdDependenciesByPrim.values()) {
        for (const layer of layers) {
          if (!pcpLayers.has(layer as PcpLayer) && !layer.filePath.startsWith('anon:')) {
            yield layer.reload()
          }
        }
      }
    } finally {
      block.close()
    }

    // Process changes if they haven't already been processed in response
    // to layer change notices above.
    if (this._pendingChanges === localPendingChanges) {
      yield* this._processPendingChanges(localPendingChanges)
    }
  }

  // UsdStage::Export writes the fully composed stage as one layer
  // (OpenUSD v26.08 pxr/usd/usd/stage.cpp:5922-5928).
  async export(filePath: string, addSourceFileComment = true): Promise<boolean> {
    return this.flatten(addSourceFileComment).export(filePath)
  }

  // ---- Stage metadata (mirrors UsdStage::{Set,Get,Has,Clear}Metadata and
  //      UsdStage::{Set,Get}DefaultPrim) ----
  //
  // Stage metadata is authored on the root layer's pseudo-root ('/'). For
  // in-memory authoring stages (createNew) the edit target IS the root layer,
  // so getRootLayer() resolves to it. The value is written straight through to
  // the layer, so it survives flatten() and export.

  // Authors a root-layer metadata field, e.g. setMetadata('upAxis', 'Y').
  // (UsdStage::SetMetadata — root-layer metadata always targets the root.)
  setMetadata(field: string, value: unknown): boolean {
    this.getRootLayer().setField('/', field, value)
    return true
  }

  // Reads a composed root-layer metadata field (UsdStage::GetMetadata).
  getMetadata(field: string): unknown {
    return this.getRootLayer().getField('/', field)
  }

  // True when the field is authored on the root layer (UsdStage::HasMetadata).
  hasMetadata(field: string): boolean {
    return this.getRootLayer().getField('/', field) !== undefined
  }

  // Clears a root-layer metadata field (UsdStage::ClearMetadata).
  clearMetadata(field: string): boolean {
    this.getRootLayer().eraseField('/', field)
    return true
  }

  // Writes the schema registry's fallbackPrimTypes (UsdSchemaRegistry::
  // GetFallbackPrimTypes) into the root layer's 'fallbackPrimTypes' metadata
  // dict, adding entries only for types not already present — existing
  // authored entries always win (UsdStage::WriteFallbackPrimTypes,
  // stage.cpp:3738-3767: VtDictionaryOver(existing, schemaFallbacks)).
  writeFallbackPrimTypes(): void {
    const schemaFallbacks = UsdSchemaRegistry.getInstance().getFallbackPrimTypes()
    if (Object.keys(schemaFallbacks).length === 0) return
    const existing = this.getMetadata('fallbackPrimTypes')
    const merged: Record<string, unknown> = _isDictValue(existing)
      ? { ...schemaFallbacks, ...existing }
      : { ...schemaFallbacks }
    // We don't want to process the change to the fallbackPrimTypes as a
    // recompose: it can only add fallbacks for types that already have valid
    // schemas, so no composed prim changes.
    this._isWritingFallbackPrimTypes = true
    try {
      this.setMetadata('fallbackPrimTypes', merged)
    } finally {
      this._isWritingFallbackPrimTypes = false
    }
  }

  private _isWritingFallbackPrimTypes = false

  // Authors the stage's defaultPrim — the prim a reference/payload to this
  // layer targets when no prim path is given (UsdStage::SetDefaultPrim). Takes
  // a prim handle; only the name (a root-level prim) is recorded, per USD.
  setDefaultPrim(prim: Prim): void {
    const name = prim.path.split('/').filter(Boolean)[0]
    if (!name || prim.path !== `/${name}`) {
      throw new Error(`setDefaultPrim: defaultPrim must be a root-level prim, got <${prim.path}>`)
    }
    this.getRootLayer().setField('/', 'defaultPrim', name)
  }

  // Returns the stage's defaultPrim handle, or undefined when unauthored or
  // the named prim does not exist (UsdStage::GetDefaultPrim).
  getDefaultPrim(): Prim | undefined {
    const name = this.getRootLayer().getField('/', 'defaultPrim')
    if (typeof name !== 'string' || name.length === 0) return undefined
    return this.getPrim(`/${name}`)
  }

  // True when defaultPrim is authored (UsdStage::HasDefaultPrim).
  hasDefaultPrim(): boolean {
    const name = this.getRootLayer().getField('/', 'defaultPrim')
    return typeof name === 'string' && name.length > 0
  }

  // Clears the authored defaultPrim (UsdStage::ClearDefaultPrim).
  clearDefaultPrim(): void {
    this.getRootLayer().eraseField('/', 'defaultPrim')
  }

  /** @internal UsdAttribute::_CreateSpec(typeName, custom, variability). */
  _createAttributeSpec(
    primPath: string, name: string, typeName: string, custom: boolean, variability: string,
  ): void {
    this._createPropertySpecForEditing(primPath, name,
      { specType: 'attribute', typeName, custom, variability })
  }

  /** @internal UsdRelationship::_CreateSpec(custom). */
  _createRelationshipSpec(primPath: string, name: string, custom: boolean): void {
    this._createPropertySpecForEditing(primPath, name,
      { specType: 'relationship', custom, variability: 'uniform' })
  }

  // UsdStage::_SetMetadata (stage.cpp:1954-2015) for properties.
  /** @internal */
  _setPropertyMetadata(primPath: string, propertyName: string, field: string, value: unknown): void {
    const propertyPath = `${primPath}.${propertyName}`
    const propertyType = this.get(propertyPath)?.typeName
    const specType = propertyType === 'rel' ? 'relationship' : 'attribute'
    // UsdStage::_SetMetadata applies the edit target's inverse layer offset
    // to TsSpline values too (stage.cpp:667-680; attribute.cpp:308-313).
    const splineOffset = field === 'spline' && value instanceof TsSpline
      ? { offset: this._mapEditTime(0), scale: this._mapEditDurationScale() } : undefined
    const authoredValue = field === 'spline' && value instanceof TsSpline
      ? usdTransformSpline(value, splineOffset)
      : field === 'timeSamples' && specType === 'attribute'
      ? this._mapEditTimeSampleMap(value, propertyType)
      : field === 'default'
      ? this._mapEditValue(value, propertyType)
      : usdGetMetadataFieldType(field, specType) === undefined ? value
        : usdTransformMetadataValue(value, field, specType, time => this._mapEditTime(time), this._mapEditDurationScale())
    const spec = this._createPropertySpecForEditing(primPath, propertyName,
      { specType, ...(propertyType && propertyType !== 'rel' ? { typeName: propertyType } : {}) })
    this._editTarget!.setField(spec.propertyPath, field, authoredValue)
  }

  /** @internal — authored-field query on the current edit target. */
  _hasAuthoredPropertyMetadata(
    primPath: string, propertyName: string, field: string,
  ): boolean {
    // HasAuthoredMetadata queries composed opinions, not the current edit target.
    // UsdStage::_HasMetadata with useFallbacks=false (v26.11.1 stage.cpp:7022-7029).
    return this._resolvePropertyField(primPath, propertyName, field) !== undefined
  }

  // UsdStage::_ClearMetadata (stage.cpp:2159-2210) for properties.
  /** @internal — clears one authored property field. */
  _clearPropertyField(primPath: string, propertyName: string, field: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const specPath = this._mapEditSpecPath(`${primPath}.${propertyName}`)
    if (!this._editTarget.hasSpec(specPath)) return
    this._editTarget.eraseField(specPath, field)
  }

  // UsdStage::_ClearValue (stage.cpp:2122-2167) at a numeric time: erase
  // the time sample at the edit target's layer time, if the edit target has
  // a spec for the attribute. The default time clears the default field
  // (_ClearMetadata).
  /** @internal — UsdAttribute::ClearAtTime. */
  _clearAttrValueAtTime(primPath: string, attrName: string, time: 'default' | number): boolean {
    if (time === 'default') {
      this._clearPropertyField(primPath, attrName, 'default')
      return true
    }
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    if (!this._editTarget.hasSpec(this._mapEditSpecPath(`${primPath}.${attrName}`))) return true
    const declaredType = this._declaredAttrType(primPath, attrName)
    const spec = this._createPropertySpecForEditing(primPath, attrName,
      { specType: 'attribute', ...(declaredType ? { typeName: declaredType } : {}) })
    this._editTarget.eraseTimeSample(spec.propertyPath, this._mapEditTime(time))
    return true
  }

  /** @internal — UsdAttribute::Clear, Block and BlockAnimation value fields. */
  _replaceAttrValueOpinions(
    primPath: string, attrName: string, defaultValue?: unknown,
  ): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const attrPath = `${primPath}.${attrName}`
    const declaredType = this.get(attrPath)?.typeName
    if (defaultValue === undefined) {
      // UsdStage::_ClearValue (stage.cpp:2112-2157).
      const specPath = this._mapEditSpecPath(attrPath)
      if (!this._editTarget.hasSpec(specPath)) return
      sdfChangeBlock(() => {
        this._editTarget!.eraseField(specPath, 'default')
        this._editTarget!.eraseField(specPath, 'timeSamples')
        this._editTarget!.eraseField(specPath, 'spline')
      })
      return
    }
    const spec = this._createPropertySpecForEditing(primPath, attrName,
      { specType: 'attribute', ...(declaredType ? { typeName: declaredType } : {}) })
    sdfChangeBlock(() => {
      this._editTarget!.eraseField(spec.propertyPath, 'timeSamples')
      this._editTarget!.eraseField(spec.propertyPath, 'spline')
      this._editTarget!.setField(
        spec.propertyPath, 'default', this._mapEditValue(defaultValue, declaredType))
    })
  }

  // UsdStage::_GetAttributeValueTypeName (stage.cpp:6324-6345) for the
  // attribute an authoring call names: its composed typeName (the prim
  // definition's, else the strongest authored), undefined when there is none.
  // The attribute is read through its prim rather than Stage.get, which would
  // also list every property name of the prim to check that it exists; a
  // property that does not exist has no typeName either.
  private _declaredAttrType(primPath: string, attrName: string): string | undefined {
    return this.getPrim(primPath)?.getAttr(attrName)?.typeName || undefined
  }

  // UsdStage::_SetValue (stage.cpp:2017-2110) at the default time.
  /** @internal — called by Attribute to write a default value. */
  _setAttrDefault(
    primPath: string, attrName: string, value: unknown, options: UsdAttrAuthoringOptions = {},
  ): void {
    const attrPath = `${primPath}.${attrName}`
    // UsdAttribute::Set semantics: the authored spec carries the attribute's
    // declared type, not one inferred from the value.
    const declaredType = this._declaredAttrType(primPath, attrName)
    if (options.rejectOpaque) rejectOpaqueValue(attrPath, declaredType, value)
    const spec = this._createPropertySpecForEditing(primPath, attrName,
      { specType: 'attribute', ...(declaredType && declaredType !== 'rel' ? { typeName: declaredType } : {}) })
    this._editTarget!.setField(spec.propertyPath, 'default', this._mapEditValue(value, declaredType))
  }

  // UsdStage::_SetValue (stage.cpp:2017-2110) at a time.
  /** @internal — called by Attribute to write a time sample. */
  _setAttrTimeSample(
    primPath: string, attrName: string, time: number, value: unknown,
    options: UsdAttrAuthoringOptions = {},
  ): void {
    const attrPath = `${primPath}.${attrName}`
    const declaredType = this._declaredAttrType(primPath, attrName)
    if (options.rejectOpaque) rejectOpaqueValue(attrPath, declaredType, value)
    const spec = this._createPropertySpecForEditing(primPath, attrName,
      { specType: 'attribute', ...(declaredType && declaredType !== 'rel' ? { typeName: declaredType } : {}) })
    this._editTarget!.setAttrTimeSample(spec.primPath, spec.propertyName,
      this._mapEditTime(time), this._mapEditValue(value, declaredType))
  }

  // Internal — called by Attribute to write connection source paths.
  // UsdAttribute::_GetPathForAuthoring / UsdRelationship::
  // _GetTargetForAuthoring: a relative path is anchored at the owning prim.
  // The edit target maps it, and the Sdf target list stores it absolute
  // (relationshipSpec.cpp:92, proxyPolicies.cpp:41).
  private _absolutePathForAuthoring(primPath: string, path: string): string {
    if (path === '' || path.startsWith('/')) return path
    const absPath = SdfPath.fromString(path).makeAbsolutePath(SdfPath.fromString(primPath))
    return absPath.isEmpty() ? path : absPath.pathString
  }

  private _mapPathForAuthoring(absPath: string): string {
    if (!absPath.startsWith('/')) return absPath
    return SdfPath.fromString(this._mapEditSpecPath(absPath))
      .stripAllVariantSelections().pathString
  }

  // UsdAttribute::SetConnections (attribute.cpp:670-695).
  /** @internal */
  _setAttrConnections(primPath: string, attrName: string, paths: string[]): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const absPaths = paths.map(path => this._absolutePathForAuthoring(primPath, path))
    for (const path of absPaths) this._validateConnectionTarget(path)
    const mappedPaths = absPaths.map(path => this._mapPathForAuthoring(path))
    const declaredType = this.get(`${primPath}.${attrName}`)?.typeName
    sdfChangeBlock(() => {
      const spec = this._createPropertySpecForEditing(primPath, attrName,
        { specType: 'attribute', ...(declaredType && declaredType !== 'rel' ? { typeName: declaredType } : {}) })
      this._editTarget!.setAttrConnections(spec.primPath, spec.propertyName, mappedPaths)
    })
  }

  private _editAttrConnectionList(
    primPath: string, attrName: string,
    edit: (operation: Required<SdfListOpValue<string>>) =>
      Required<SdfListOpValue<string>> | undefined,
  ): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const declaredType = this.get(`${primPath}.${attrName}`)?.typeName
    sdfChangeBlock(() => {
      const spec = this._createPropertySpecForEditing(primPath, attrName,
        { specType: 'attribute', ...(declaredType && declaredType !== 'rel' ? { typeName: declaredType } : {}) })
      const existing = sdfNormalizeListOp<string>(
        this._editTarget!.getField(spec.propertyPath, 'connectionPaths')) ?? {
        isExplicit: false, explicitItems: [], addedItems: [], deletedItems: [], prependedItems: [],
        appendedItems: [], orderedItems: [],
      }
      const authored = edit(existing)
      // The connection list is edited through the attribute spec's
      // connection path list editor, as Usd_InsertListItem / Usd_RemoveListItem
      // / SetConnections do (attribute.cpp:575-700), so Sdf_ConnectionListEditor
      // creates and removes the connection child specs
      // (connectionListEditor.cpp:30-110).
      const proxy = this._editTarget!.getAttributeAtPath(spec.propertyPath)?.getConnectionPathList()
      if (!proxy) {
        if (authored === undefined) this._editTarget!.eraseField(spec.propertyPath, 'connectionPaths')
        else this._editTarget!.setField(spec.propertyPath, 'connectionPaths', authored)
        return
      }
      assignPathListEdits(proxy, authored)
    })
  }

  _addAttrConnection(
    primPath: string, attrName: string, path: string, position: UsdListPosition,
  ): void {
    this._validateConnectionTarget(path)
    const mappedPath = this._mapEditSpecPath(path)
    this._editAttrConnectionList(primPath, attrName, operation => {
      const explicit = [...operation.explicitItems]
      const prepended = [...operation.prependedItems]
      const appended = [...operation.appendedItems]
      const deleted = operation.deletedItems.filter(item => item !== mappedPath)
      const remove = (items: string[]): void => {
        const index = items.indexOf(mappedPath)
        if (index >= 0) items.splice(index, 1)
      }
      remove(explicit)
      remove(prepended)
      remove(appended)
      const atFront = position === 'frontOfPrependList' || position === 'frontOfAppendList'
      const destination = operation.isExplicit ? explicit
        : position === 'frontOfPrependList' || position === 'backOfPrependList'
          ? prepended : appended
      if (atFront) destination.unshift(mappedPath)
      else destination.push(mappedPath)
      return {
        isExplicit: operation.isExplicit,
        explicitItems: explicit, addedItems: [...operation.addedItems], deletedItems: deleted,
        prependedItems: prepended, appendedItems: appended,
        orderedItems: [...operation.orderedItems],
      }
    })
  }

  _removeAttrConnection(primPath: string, attrName: string, path: string): void {
    this._validateConnectionTarget(path)
    const mappedPath = this._mapEditSpecPath(path)
    this._editAttrConnectionList(primPath, attrName, operation => {
      if (operation.isExplicit) {
        return { ...operation, explicitItems: operation.explicitItems.filter(item => item !== mappedPath) }
      }
      return {
        ...operation,
        prependedItems: operation.prependedItems.filter(item => item !== mappedPath),
        appendedItems: operation.appendedItems.filter(item => item !== mappedPath),
        deletedItems: [...operation.deletedItems.filter(item => item !== mappedPath), mappedPath],
      }
    })
  }

  _clearAttrConnections(primPath: string, attrName: string): void {
    this._editAttrConnectionList(primPath, attrName, () => undefined)
  }

  private _validateConnectionTarget(path: string): void {
    if (isPathInPrototype(path)) {
      throw new Error(`Cannot author connection to prototype object <${path}>`)
    }
  }

  // Declares a property (typeName only) on the edit target — needed for
  // value-less attrs like shader outputs.
  declareProperty(primPath: string, propName: string, typeName: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    sdfChangeBlock(() => {
      this._createPrimSpecForEditing(primPath)
      // A relationship is a spec type, not a type name: created as
      // _CopyProperty creates it (stage.cpp:5752-5760).
      if (typeName === 'rel') {
        this._createPropertySpecForEditing(primPath, propName,
          { specType: 'relationship', custom: false, variability: 'varying' })
        return
      }
      const mapped = this._mapEditProperty(primPath, propName)
      this._editTarget!.declareProperty(mapped.primPath, mapped.propertyName, typeName)
    })
  }

  // Generic property-field write, for spec fields that aren't the default
  // value, e.g. 'bindMaterialAs'.
  setPropertyField(propPath: string, fieldName: string, value: unknown): void {
    const dot = propPath.lastIndexOf('.')
    this._setPropertyMetadata(propPath.slice(0, dot), propPath.slice(dot + 1), fieldName, value)
  }

  // ---- Applied API schemas (mirrors UsdPrim::AddAppliedSchema / RemoveAppliedSchema) ----
  //
  // Adds an applied API schema name to the prim's 'apiSchemas' listOp on the
  // edit target with NO validity checks (UsdPrim::AddAppliedSchema,
  // prim.cpp:1074-1131): appended to the END of the explicit list when the
  // list op is explicit, else to the END of the prepends. Idempotent.
  applyAPI(primPath: string, schemaName: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const specPath = this._createPrimSpecForEditing(primPath)
    this._ownAuthoring(() => {
      const existing = this._editTarget!.getField(specPath, 'apiSchemas') as
        ListOp<string> | undefined
      if (existing?.isExplicit) {
        // Explicit list op: append to the end of the explicit items
        // (prim.cpp:1098-1110).
        if (existing.explicitItems.includes(schemaName)) return
        this._editTarget!.setField(specPath, 'apiSchemas',
          { ...existing, explicitItems: [...existing.explicitItems, schemaName] })
        return
      }
      // Otherwise append to the end of the PREPENDS (prim.cpp:1111-1126) —
      // composed order is apply order, not newest-first.
      const prepended = existing ? [...existing.prependedItems] : []
      const appended = existing ? [...existing.appendedItems] : []
      if (prepended.includes(schemaName) || appended.includes(schemaName)) return
      const lop: ListOp<string> = existing
        ? { ...existing, prependedItems: [...prepended, schemaName] }
        : {
            isExplicit: false, explicitItems: [],
            prependedItems: [schemaName], appendedItems: [], deletedItems: [],
          }
      this._editTarget!.setField(specPath, 'apiSchemas', lop)
    })
  }

  // The prim's composed applied-schema names, strongest first — the composed
  // prim DEFINITION's list: built-ins + auto-applied + authored
  // (UsdPrim::GetAppliedSchemas, prim.cpp:1362-1366).
  getAppliedSchemas(primPath: string): string[] {
    return this.getPrim(primPath)?.getAppliedSchemas() ?? []
  }

  // Removes an applied API schema name from the prim's 'apiSchemas' listOp on
  // the edit target with no validity checks (UsdPrim::RemoveAppliedSchema,
  // prim.cpp:1133-1169: a {deleted:[name]} edit op applied over the authored
  // op — explicit lists just drop the item; non-explicit lists drop it from
  // prepends/appends AND record it in the deletes).
  removeAppliedSchema(primPath: string, schemaName: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const specPath = this._createPrimSpecForEditing(primPath)
    this._ownAuthoring(() => {
      const existing = (this._editTarget!.getField(specPath, 'apiSchemas') as
        ListOp<string> | undefined) ?? {
          isExplicit: false, explicitItems: [],
          prependedItems: [], appendedItems: [], deletedItems: [],
        }
      const lop: ListOp<string> = existing.isExplicit
        ? { ...existing, explicitItems: existing.explicitItems.filter((s) => s !== schemaName) }
        : {
            ...existing,
            prependedItems: existing.prependedItems.filter((s) => s !== schemaName),
            appendedItems: existing.appendedItems.filter((s) => s !== schemaName),
            deletedItems: existing.deletedItems.includes(schemaName)
              ? [...existing.deletedItems]
              : [...existing.deletedItems, schemaName],
          }
      this._editTarget!.setField(specPath, 'apiSchemas', lop)
    })
  }

  /** @internal — called by Prim.setTypeName (UsdPrim::SetTypeName sets the
   * typeName metadata). */
  _setPrimTypeName(primPath: string, typeName: string): void {
    this._setPrimMetadata(primPath, 'typeName', typeName)
  }

  // UsdStage::_SetMetadata (stage.cpp:1954-2015) for prims.
  /** @internal — UsdObject::SetMetadata authoring for prims. */
  _setPrimMetadata(primPath: string, field: string, value: unknown): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const mappedValue = usdTransformMetadataValue(
      value, field, 'prim', time => this._mapEditTime(time), this._mapEditDurationScale())
    const specPath = this._createPrimSpecForEditing(primPath)
    this._editTarget.setField(specPath, field, mappedValue)
  }

  // UsdStage::_ClearMetadata (stage.cpp:2159-2210) for prims.
  /** @internal — UsdObject::ClearMetadata authoring for prims. */
  _clearPrimMetadata(primPath: string, field: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const specPath = this._mapEditSpecPath(primPath)
    if (!this._editTarget.hasSpec(specPath)) return
    this._editTarget.eraseField(specPath, field)
  }

  // ---- Path list edits (Usd_ListEditImpl, listEditImpl.h) ----

  // Usd_ListEditImplBase::_TranslatePath: root prim paths are used as-is;
  // other paths map to the edit target, without variant selections.
  private _translateListEditPath(path: string): string {
    const sdfPath = SdfPath.fromString(path)
    if (sdfPath.isEmpty()) throw new Error('Invalid empty path')
    if (sdfPath.isRootPrimPath()) return path
    const mapped = SdfPath.fromString(this._mapEditSpecPath(path))
    if (mapped.isEmpty()) throw new Error(`Cannot map <${path}> to current edit target.`)
    return mapped.stripAllVariantSelections().pathString
  }

  // Edits the list op in a field of the prim's spec at the edit target, in
  // one change block (Usd_ListEditImpl::_GetListEditor).
  private _editPrimListOp<T>(
    primPath: string, field: string, edit: (op: UsdEditedListOp<T>) => void,
  ): boolean {
    if (!this._editTarget) throw new Error('Stage is read-only')
    sdfChangeBlock(() => {
      const specPath = this._createPrimSpecForEditing(primPath)
      const op = usdListOpForEditing<T>(this._editTarget!.getField(specPath, field))
      edit(op)
      // An empty, non-explicit list op clears the field (Sdf_ListOpListEditor).
      if (usdListOpHasKeys(op)) this._editTarget!.setField(specPath, field, op)
      else this._editTarget!.eraseField(specPath, field)
    })
    return true
  }

  /** @internal Usd_ListEditImpl::Add for path list ops. */
  _addPathListItem(primPath: string, field: string, path: string, position: UsdListPosition): boolean {
    const item = this._translateListEditPath(path)
    return this._editPrimListOp<string>(primPath, field, op => usdInsertListItem(op, item, position))
  }

  /** @internal Usd_InsertListItem on a name (token/string) list op, e.g.
   * the variantSetNames edit of UsdVariantSet::_AddVariantSet. */
  _addNameListItem(primPath: string, field: string, name: string, position: UsdListPosition): boolean {
    return this._editPrimListOp<string>(primPath, field, op => usdInsertListItem(op, name, position))
  }

  /** @internal Usd_ListEditImpl::Remove for path list ops. */
  _removePathListItem(primPath: string, field: string, path: string): boolean {
    const item = this._translateListEditPath(path)
    return this._editPrimListOp<string>(primPath, field, op => usdRemoveListItem(op, item))
  }

  // Usd_ListEditImplBase::_TranslatePath for references and payloads:
  // only internal references map their prim path to the edit target.
  private _translateReferenceForEditing(item: Reference): Reference {
    if (item.assetPath !== '' || item.primPath === '') return item
    return { ...item, primPath: this._translateListEditPath(item.primPath) }
  }

  /** @internal Usd_ListEditImpl::Add for reference and payload list ops. */
  _addReferenceListItem(
    primPath: string, field: string, item: Reference, position: UsdListPosition,
  ): boolean {
    const translated = this._translateReferenceForEditing(item)
    return this._editPrimListOp<Reference>(primPath, field, op =>
      usdInsertListItem(op, translated, position, referencesEqual))
  }

  /** @internal Usd_ListEditImpl::Remove for reference and payload list ops. */
  _removeReferenceListItem(primPath: string, field: string, item: Reference): boolean {
    const translated = this._translateReferenceForEditing(item)
    return this._editPrimListOp<Reference>(primPath, field, op =>
      usdRemoveListItem(op, translated, referencesEqual))
  }

  /** @internal Usd_ListEditImpl::Set for reference and payload list ops. */
  _setReferenceListItems(primPath: string, field: string, items: readonly Reference[]): boolean {
    const translated = items.map(item => this._translateReferenceForEditing(item))
    return this._editPrimListOp<Reference>(primPath, field, op => {
      Object.assign(op, usdListOpForEditing<Reference>(undefined),
        { isExplicit: true, explicitItems: translated })
    })
  }

  /** @internal Usd_ListEditImpl::Clear. */
  _clearListEdits(primPath: string, field: string): boolean {
    return this._editPrimListOp<unknown>(primPath, field, op => {
      Object.assign(op, usdListOpForEditing<unknown>(undefined))
    })
  }

  /** @internal Usd_ListEditImpl::Set for path list ops. */
  _setPathListItems(primPath: string, field: string, paths: readonly string[]): boolean {
    const items = paths.map(path => this._translateListEditPath(path))
    return this._editPrimListOp<string>(primPath, field, op => {
      // An empty list makes the list explicitly empty.
      Object.assign(op, usdListOpForEditing<string>(undefined),
        { isExplicit: true, explicitItems: items })
    })
  }

  // UsdRelationship::RemoveTarget (relationship.cpp:115-137): removes the
  // target from the edit target's target list edits.
  /** @internal */
  _removeRelTarget(primPath: string, relName: string, target: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const targetToAuthor = this._relTargetForAuthoring(primPath, relName, target)
    sdfChangeBlock(() => {
      const spec = this._createPropertySpecForEditing(primPath, relName, { specType: 'relationship' })
      const existing = sdfNormalizeListOp<string>(
        this._editTarget!.getField(spec.propertyPath, 'targetPaths'))
      // SdfListEditorProxy::Remove: an explicit list drops the item; list
      // edits delete it.
      const edited = !existing || !existing.isExplicit
        ? {
            isExplicit: false, explicitItems: [], orderedItems: existing?.orderedItems ?? [],
            // SdfListEditorProxy::Remove (listEditorProxy.h:352-354) removes the
            // item from the added, prepended and appended lists.
            addedItems: (existing?.addedItems ?? []).filter(item => item !== targetToAuthor),
            prependedItems: (existing?.prependedItems ?? []).filter(item => item !== targetToAuthor),
            appendedItems: (existing?.appendedItems ?? []).filter(item => item !== targetToAuthor),
            deletedItems: (existing?.deletedItems ?? []).includes(targetToAuthor)
              ? existing!.deletedItems : [...(existing?.deletedItems ?? []), targetToAuthor],
          }
        : { ...existing, explicitItems: existing.explicitItems.filter(item => item !== targetToAuthor) }
      // Through the target path list editor, as AddTarget.
      const proxy = this._editTarget!.getRelationshipAtPath(spec.propertyPath)?.getTargetPathList()
      if (proxy) assignPathListEdits(proxy, edited)
      else this._editTarget!.setField(spec.propertyPath, 'targetPaths', edited)
    })
  }

  // UsdRelationship::_GetTargetForAuthoring (relationship.cpp:55-82): a
  // target in a prototype cannot be authored (the TF_CODING_ERROR of
  // AddTarget/RemoveTarget/SetTargets, raised here); others are anchored and
  // mapped through the edit target.
  private _relTargetForAuthoring(primPath: string, relName: string, target: string): string {
    const absTarget = this._absolutePathForAuthoring(primPath, target)
    if (absTarget !== '' && isPathInPrototype(absTarget)) {
      throw new Error(`Cannot author target <${target}> on relationship <${primPath}.${relName}>: ` +
        'Cannot target a prototype or an object within a prototype.')
    }
    return this._mapPathForAuthoring(absTarget)
  }

  // UsdRelationship::AddTarget (relationship.cpp:85-111).
  /** @internal */
  _addRelTarget(primPath: string, relName: string, target: string, position: UsdListPosition): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const targetToAuthor = this._relTargetForAuthoring(primPath, relName, target)
    sdfChangeBlock(() => {
      const spec = this._createPropertySpecForEditing(primPath, relName, { specType: 'relationship' })
      const op = usdListOpForEditing<string>(this._editTarget!.getField(spec.propertyPath, 'targetPaths'))
      usdInsertListItem(op, targetToAuthor, position)
      // relationship.cpp:103-108 inserts through the relationship spec's
      // target path list editor, whose Sdf_RelationshipTargetListEditor
      // creates the target child spec (connectionListEditor.cpp:30-110).
      const proxy = this._editTarget!.getRelationshipAtPath(spec.propertyPath)?.getTargetPathList()
      if (proxy) assignPathListEdits(proxy, op)
      else this._editTarget!.setField(spec.propertyPath, 'targetPaths', op)
    })
  }

  // UsdRelationship::ClearTargets (relationship.cpp:176-196).
  /** @internal */
  _clearRelTargets(primPath: string, relName: string, removeSpec: boolean): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    sdfChangeBlock(() => {
      const spec = this._createPropertySpecForEditing(primPath, relName, { specType: 'relationship' })
      if (removeSpec) {
        const relSpec = this._editTarget!.getRelationshipAtPath(spec.propertyPath)!
        ;(relSpec.getOwner() as SdfPrimSpec).removeProperty(relSpec)
      } else {
        this._editTarget!.eraseField(spec.propertyPath, 'targetPaths')
      }
    })
  }

  // UsdStage::_RemoveProperty (stage.cpp:4208-4228): removes the property
  // spec at the edit target.
  /** @internal */
  _removeProperty(propertyPath: string): boolean {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const dot = propertyPath.lastIndexOf('.')
    this._validateAuthoringTarget(propertyPath.slice(0, dot))
    const propHandle = this._editTarget.getPropertyAtPath(this._mapEditSpecPath(propertyPath))
    if (!propHandle) return false
    const parent = propHandle.getOwner()
    if (!(parent instanceof SdfPrimSpec)) return false
    parent.removeProperty(propHandle)
    return true
  }

  // UsdStage::_SetMetadata with a key path (stage.cpp:2007-2011):
  // SdfLayer::SetFieldDictValueByKey.
  // `valueType` names the held type of a value JavaScript cannot tell apart
  // (a 'token' string, as VtValue(TfToken) holds); the entry otherwise
  // carries the type of its JavaScript value.
  /** @internal */
  _setPrimMetadataByDictKey(primPath: string, field: string, keyPath: string, value: unknown, valueType?: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    const specPath = this._createPrimSpecForEditing(primPath)
    const existing = this._editTarget.getField(specPath, field)
    const dict: Record<string, unknown> = _isDictValue(existing) ? _sdfCloneValue(existing) as Record<string, unknown> : {}
    const keys = keyPath.split(':')
    let target = dict
    for (const key of keys.slice(0, -1)) {
      const next = target[key]
      if (!_isDictValue(next)) {
        // SetFieldDictValueByKey creates the intermediate VtDictionary
        // (vt/dictionary.cpp SetValueAtPath); record its held type.
        const parentTypes = new Map(_sdfGetDictionaryValueTypes(target))
        parentTypes.set(key, 'dictionary')
        _sdfRecordDictionaryValueTypes(target, parentTypes)
      }
      target = target[key] = _isDictValue(next) ? next as Record<string, unknown> : {}
    }
    const leaf = keys.at(-1)!
    // UsdStage::_SetMetadata (stage.cpp:2025-2038) applies
    // _StageValueToFieldXf to the value before SetFieldDictValueByKey, so a
    // GfTimeCode or GfDuration (array) value is mapped through the edit
    // target's layer offset here as for a whole field. valueType names the
    // value's type where the JS value alone does not (timecode numbers).
    target[leaf] = _sdfTransformMetadataValue(
      value, valueType, time => this._mapEditTime(time), this._mapEditDurationScale())
    const types = _sdfGetDictionaryValueTypes(target)
    if (types?.has(leaf) || valueType !== undefined) {
      const updated = new Map(types)
      if (valueType === undefined) updated.delete(leaf)
      else updated.set(leaf, valueType)
      _sdfRecordDictionaryValueTypes(target, updated)
    }
    this._editTarget.setField(specPath, field, dict)
  }

  // UsdStage::_ClearMetadata with a key path (stage.cpp:2159-2210):
  // SdfLayer::EraseFieldDictValueByKey, which erases the field once its
  // dictionary is empty (sdf/abstractData.cpp:390-412) and prunes emptied
  // sub-dictionaries (vt/dictionary.cpp:305-331).
  /** @internal */
  _clearPrimMetadataByDictKey(primPath: string, field: string, keyPath: string): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const specPath = this._mapEditSpecPath(primPath)
    if (!this._editTarget.hasSpec(specPath)) return
    const existing = this._editTarget.getField(specPath, field)
    if (!_isDictValue(existing)) return
    const dict = _sdfCloneValue(existing) as Record<string, unknown>
    const erase = (target: Record<string, unknown>, keys: readonly string[]): void => {
      if (keys.length === 1) { delete target[keys[0]!]; return }
      const next = target[keys[0]!]
      if (!_isDictValue(next)) return
      erase(next as Record<string, unknown>, keys.slice(1))
      if (Object.keys(next as Record<string, unknown>).length === 0) delete target[keys[0]!]
    }
    const keys = keyPath.split(':').filter(Boolean)
    if (keys.length === 0) return
    erase(dict, keys)
    if (Object.keys(dict).length === 0) this._editTarget.eraseField(specPath, field)
    else this._editTarget.setField(specPath, field, dict)
  }

  // UsdRelationship::SetTargets (relationship.cpp:142-171).
  /** @internal — called by UsdRel to write relationship targets. */
  _setRelTargets(primPath: string, relName: string, targets: string[]): void {
    if (!this._editTarget) throw new Error('Stage is read-only')
    this._validateAuthoringTarget(primPath)
    const mappedTargets = targets.map(target =>
      this._relTargetForAuthoring(primPath, relName, target))
    sdfChangeBlock(() => {
      const spec = this._createPropertySpecForEditing(primPath, relName, { specType: 'relationship' })
      this._editTarget!.setRelTargets(spec.primPath, spec.propertyName, mappedTargets)
    })
  }
}

interface UsdAttrAuthoringOptions {
  /** Reject values for opaque attributes, as UsdAttribute::Set does. */
  rejectOpaque?: boolean
}

// The strongest property spec for `propName` over the prim index: the first
// entry PcpPrimIndex.composePropertyStack would list.
function strongestPropertySpec(
  index: PcpPrimIndex, propName: string,
): { layer: PcpLayer, specPath: string } | undefined {
  for (const node of index._getNodeRefs()) {
    if (!node.canContributeSpecs()) continue
    const propPath = node.getPath().appendProperty(propName)
    const key = propPath.pathString
    for (const { layer } of node.getLayerStack().layers) {
      if (layer.hasSpec(key)) return { layer, specPath: pcpLayerPathKey(propPath) }
    }
  }
  return undefined
}

// Assigns list op edits through a spec's path list editor proxy, so its
// list editor maintains the target / connection child specs.
function assignPathListEdits(
  proxy: SdfListEditorProxy<string>,
  authored: SdfListOpValue<string> | undefined,
): void {
  if (authored === undefined) {
    proxy.clearEdits()
  } else if (authored.isExplicit) {
    if (!proxy.isExplicit()) proxy.clearEditsAndMakeExplicit()
    proxy.getExplicitItems().assign(authored.explicitItems ?? [])
  } else {
    if (proxy.isExplicit()) proxy.clearEdits()
    proxy.getDeletedItems().assign(authored.deletedItems ?? [])
    if (authored.addedItems !== undefined) proxy.getAddedItems().assign(authored.addedItems)
    proxy.getPrependedItems().assign(authored.prependedItems ?? [])
    proxy.getAppendedItems().assign(authored.appendedItems ?? [])
    proxy.getOrderedItems().assign(authored.orderedItems ?? [])
  }
}

function rejectOpaqueValue(attrPath: string, declaredType: string | undefined, value: unknown): void {
  if (value instanceof SdfValueBlock || value instanceof SdfAnimationBlock) return
  if (declaredType === 'opaque') throw new Error(`Cannot author opaque-valued attribute <${attrPath}>`)
  checkValueTypeMatches(attrPath, declaredType, value)
}

// The scalar value types whose held C++ type is textual or numeric. The
// numeric and textual JavaScript kinds do not convert into each other.
const TEXTUAL_VALUE_TYPES = new Set(['string', 'token', 'asset'])
const NUMERIC_VALUE_TYPES = new Set([
  'bool', 'uchar', 'int', 'uint', 'int64', 'uint64', 'half', 'float', 'double', 'timecode',
])

// The JavaScript kind of a scalar value against a textual or numeric value
// type; other values (Gf, Vt and Sdf objects) are not judged here.
function scalarKindMismatch(scalarType: string, value: unknown): boolean {
  if (Array.isArray(value)) return TEXTUAL_VALUE_TYPES.has(scalarType) || NUMERIC_VALUE_TYPES.has(scalarType)
  const kind = typeof value
  if (TEXTUAL_VALUE_TYPES.has(scalarType)) return kind === 'number' || kind === 'boolean' || kind === 'bigint'
  if (NUMERIC_VALUE_TYPES.has(scalarType)) return kind === 'string'
  return false
}

// A Gf quaternion's C++ type, undefined for any other value.
function quatCppTypeName(value: unknown): string | undefined {
  if (value instanceof GfQuatd) return 'GfQuatd'
  if (value instanceof GfQuatf) return 'GfQuatf'
  if (value instanceof GfQuath) return 'GfQuath'
  return undefined
}

// A Gf quaternion against a quat value type of another precision. Vt
// registers casts between the vector precisions (vt/types.cpp:129-148) but
// none between the quaternion ones, so CanRepresent (valueTypeName.cpp:83-91)
// rejects a GfQuatd for a quatf attribute (testUsdGeomXformable.py:782-784).
function quatPrecisionMismatch(scalarType: string, value: unknown): boolean {
  const got = quatCppTypeName(value)
  return got !== undefined && scalarType.startsWith('GfQuat') && got !== scalarType
}

// UsdStage::_SetValue (stage.cpp:2038-2058): "Check that the passed value is
// the expected type" (SdfValueTypeName::CanRepresent), a coding error that
// authors nothing. JavaScript values carry no C++ type, so a value is
// rejected when its JavaScript kind cannot be the attribute's value type:
// a number for a string, a string for a number, a scalar for an array, or a
// list holding such an element.
function checkValueTypeMatches(attrPath: string, declaredType: string | undefined, value: unknown): void {
  const valTypeName = declaredType ? sdfFindValueTypeName(declaredType) : undefined
  if (!valTypeName) return
  let mismatch: boolean
  if (valTypeName.isArray) {
    const scalarType = valTypeName.scalarType?.type ?? ''
    const kind = typeof value
    mismatch = kind === 'number' || kind === 'string' || kind === 'boolean' || kind === 'bigint' ||
      (Array.isArray(value) && value.some(element => scalarKindMismatch(scalarType, element)))
  } else {
    mismatch = scalarKindMismatch(valTypeName.type, value) || quatPrecisionMismatch(valTypeName.type, value)
  }
  if (mismatch) {
    const quat = quatCppTypeName(value)
    const got = quat ?? (Array.isArray(value) ? 'list' : typeof value)
    throw new TfError(`Type mismatch for <${attrPath}>: expected '${valTypeName.cppTypeName}', got '${got}'`,
      TfDiagnosticType.CodingError)
  }
}

// A copy of sorted `samples` with `value` at `time`, replacing any sample at
// that time; binary search keeps authoring N samples O(N log N) overall.
function insertTimeSample(
  samples: readonly [number, unknown][], time: number, value: unknown,
): [number, unknown][] {
  let lo = 0, hi = samples.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid]![0] < time) lo = mid + 1
    else hi = mid
  }
  const result = samples.slice()
  if (lo < result.length && result[lo]![0] === time) result[lo] = [time, value]
  else result.splice(lo, 0, [time, value])
  return result
}

// The specs introduced by DIRECT composition arcs at this prim — those
// whose provenance points at another spec of the SAME prim (the arc was
// authored/attached here, possibly in a layer reached ancestrally). Local
// layer-stack specs (from === undefined) and ancestral specs (from = a
// parent prim's spec) are excluded. This is the Pcp "instanceable data"
// boundary, verified vs Pixar 26.05 on the BasicInstancing museum case:
// the prototype composes the reference chain + implied inherits, while
// ancestral-arc and local opinions stay per-instance (and per-instance
// only at the instance root — beneath it they are ignored entirely).
