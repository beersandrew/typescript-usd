// Ported from OpenUSD 26.11.1: pxr/usd/pcp/changes.cpp, pxr/usd/pcp/changes.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpChanges — describes Pcp changes resulting from scene description edits,
// and applies them to PcpCaches and PcpLayerStacks. Port of OpenUSD v26.08
// pxr/usd/pcp/changes.{h,cpp}.
//
// Layer loading: upstream opens sublayers synchronously while classifying
// changes and while recomputing layer stacks. Here a layer that has not been
// loaded yet makes the synchronous step throw PcpNeedsLayer; didChange and
// apply load the layer and retry (didChange restores its prior state first).

import { SdfPath, SdfPathSet } from 'typescript-usd/sdf/path'
import {
  type SdfChangeList, type SdfChangeListEntry, type SdfLayerChangeListVec,
  SdfSubLayerChangeType,
} from 'typescript-usd/sdf/changeList'
import { _sdfCreateLayerIdentifier, _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'
import type { PcpCache } from './cache.ts'
import { pcpRunMaybeAsync, type PcpMaybeAsync } from './maybeAsync.ts'
import { pcpForEachDependentNode } from './cache.ts'
import { pcpComposeSiteHasSpecs } from './composeSite.ts'
import {
  type PcpDependency, PcpDependencyType, type PcpDependencyFlags,
} from './dependency.ts'
import type { PcpError } from './errors.ts'
import { PcpArcType } from './arc.ts'
import {
  PcpExpressionVariables, type PcpExpressionVariablesDictionary,
} from './expressionVariables.ts'
import type { PcpExpressionVariablesSource } from './expressionVariablesSource.ts'
import { pcpChildNodeInstanceableChanged } from './instancing.ts'
import {
  type PcpLayerStack, PcpNeedsLayer, pcpComputeRelocationsForLayerStack,
  pcpLayerStackNeedsRecomputeDueToAssetPathChange,
  pcpNeedToRecomputeLayerStackTimeCodesPerSecond,
} from './layerStack.ts'
import {
  type PcpLayer, pcpLayerIsEmpty, pcpLayerStackIdentifierEquals,
} from './layerStackIdentifier.ts'
import type { PcpNodeRef } from './node.ts'
import type { PcpSite } from './site.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import { pcpNeedToRecomputeDueToAssetPathChange } from './primIndex.ts'
import { pcpEvaluateVariableExpression, pcpIsVariableExpression } from './utils.ts'

// PCP_ENABLE_MINIMAL_CHANGES_FOR_LAYER_OPERATIONS (changes.cpp:27-32).
let minimalChangesForLayerOperations = true
/** @internal TfEnvSetting override for tests. */
export function _setPcpEnableMinimalChangesForLayerOperations(enabled: boolean): void {
  minimalChangesForLayerOperations = enabled
}

const TCPS_FALLBACK = 24

// Pcp_SubsumeDescendants (changes.cpp:34-67).
function subsumeDescendants(pathSet: SdfPathSet): void {
  for (const path of [...pathSet]) {
    for (let p = path.getParentPath(); !p.isEmpty(); p = p.getParentPath()) {
      if (pathSet.has(p)) {
        pathSet.delete(path)
        break
      }
      if (p.isAbsoluteRootPath()) break
    }
  }
}

function subsumeDescendantsOf(pathSet: SdfPathSet, prefix: SdfPath): void {
  for (const path of [...pathSet]) if (path.hasPrefix(prefix)) pathSet.delete(path)
}

// PcpLayerStackChanges (changes.h).
export class PcpLayerStackChanges {
  didChangeLayers = false
  didChangeLayerOffsets = false
  didChangeRelocates = false
  didChangeExpressionVariables = false
  didChangeSignificantly = false
  newRelocatesTargetToSource = new Map<string, string>()
  newRelocatesSourceToTarget = new Map<string, string>()
  newIncrementalRelocatesSourceToTarget = new Map<string, string>()
  newIncrementalRelocatesTargetToSource = new Map<string, string>()
  newRelocatesPrimPaths: string[] = []
  newRelocatesErrors: PcpError[] = []
  pathsAffectedByRelocationChanges = new SdfPathSet()
  newExpressionVariables: PcpExpressionVariablesDictionary = {}
  /** @internal */ _didChangeExpressionVariablesSource = false
  /** @internal */ _newExpressionVariablesSource: PcpExpressionVariablesSource | undefined

  /** @internal */
  _clone(): PcpLayerStackChanges {
    const c = Object.assign(new PcpLayerStackChanges(), this)
    c.newRelocatesTargetToSource = new Map(this.newRelocatesTargetToSource)
    c.newRelocatesSourceToTarget = new Map(this.newRelocatesSourceToTarget)
    c.newIncrementalRelocatesSourceToTarget = new Map(this.newIncrementalRelocatesSourceToTarget)
    c.newIncrementalRelocatesTargetToSource = new Map(this.newIncrementalRelocatesTargetToSource)
    c.newRelocatesPrimPaths = [...this.newRelocatesPrimPaths]
    c.newRelocatesErrors = [...this.newRelocatesErrors]
    c.pathsAffectedByRelocationChanges = this.pathsAffectedByRelocationChanges.clone()
    return c
  }
}

// PcpCacheChanges::TargetType (changes.h).
export enum PcpCacheChangesTargetType {
  TargetTypeConnection = 1 << 0,
  TargetTypeRelationshipTarget = 1 << 1,
}

// PcpCacheChanges (changes.h).
export class PcpCacheChanges {
  didChangeSignificantly = new SdfPathSet()
  didChangeSpecs = new SdfPathSet()
  didChangePrims = new SdfPathSet()
  // Path string -> PcpCacheChangesTargetType bits.
  didChangeTargets = new Map<string, number>()
  didChangePath: Array<[oldPath: SdfPath, newPath: SdfPath]> = []
  didMaybeChangeLayers = false
  layersAffectedByMutingOrRemoval = new Set<PcpLayer>()
  layerChangeListVec: SdfLayerChangeListVec<PcpLayer> = []

  /** @internal */ _processedLayerSublayerPathPairs = new Map<PcpLayer, Set<string>>()
  /** @internal */ _didChangeSpecsInternal = new SdfPathSet()
  /** @internal */ _didChangePrimSpecsAndChildrenInternal = new SdfPathSet()
  /** @internal */ _layerToLayerStackOverrides = new Map<PcpLayer, PcpLayerStack[]>()

  /** @internal */
  _setLayerStacksUsingLayerOverride(layer: PcpLayer, layerStacks: readonly PcpLayerStack[]): void {
    this._layerToLayerStackOverrides.set(layer, [...layerStacks])
  }

  /** @internal */
  _getLayerStacksUsingLayerOverride(layer: PcpLayer): readonly PcpLayerStack[] {
    return this._layerToLayerStackOverrides.get(layer) ?? []
  }

  /** @internal */
  _clone(): PcpCacheChanges {
    const c = new PcpCacheChanges()
    c.didChangeSignificantly = this.didChangeSignificantly.clone()
    c.didChangeSpecs = this.didChangeSpecs.clone()
    c.didChangePrims = this.didChangePrims.clone()
    c.didChangeTargets = new Map(this.didChangeTargets)
    c.didChangePath = [...this.didChangePath]
    c.didMaybeChangeLayers = this.didMaybeChangeLayers
    c.layersAffectedByMutingOrRemoval = new Set(this.layersAffectedByMutingOrRemoval)
    c.layerChangeListVec = [...this.layerChangeListVec]
    c._processedLayerSublayerPathPairs = new Map(
      [...this._processedLayerSublayerPathPairs].map(([k, v]) => [k, new Set(v)]))
    c._didChangeSpecsInternal = this._didChangeSpecsInternal.clone()
    c._didChangePrimSpecsAndChildrenInternal = this._didChangePrimSpecsAndChildrenInternal.clone()
    c._layerToLayerStackOverrides = new Map(this._layerToLayerStackOverrides)
    return c
  }
}

// PcpLifeboat (changes.h): keeps layers and layer stacks alive during change
// processing.
export class PcpLifeboat {
  private _layers = new Set<PcpLayer>()
  private _layerStacks = new Set<PcpLayerStack>()

  retain(item: PcpLayer | PcpLayerStack): void {
    if ('identifier' in item && 'layers' in item) this._layerStacks.add(item as PcpLayerStack)
    else this._layers.add(item as PcpLayer)
  }

  getLayerStacks(): ReadonlySet<PcpLayerStack> { return this._layerStacks }

  swap(other: PcpLifeboat): void {
    const layers = this._layers
    const stacks = this._layerStacks
    this._layers = other._layers
    this._layerStacks = other._layerStacks
    other._layers = layers
    other._layerStacks = stacks
  }

  /** @internal */
  _isEmpty(): boolean { return this._layers.size === 0 && this._layerStacks.size === 0 }

  /** @internal */
  _clone(): PcpLifeboat {
    const c = new PcpLifeboat()
    c._layers = new Set(this._layers)
    c._layerStacks = new Set(this._layerStacks)
    return c
  }
}

export enum PcpChangeSpecsType {
  ChangeSpecsTypeRemoved,
  ChangeSpecsTypeAdded,
}

const enum LayerStackChange {
  None,
  Significant,
  MaybeSignificant,
}

// Pcp_EntryRequiresLayerStackChange (changes.cpp:131-170).
function entryRequiresLayerStackChange(entry: SdfChangeListEntry): LayerStackChange {
  if (entry.flags.didReplaceContent) return LayerStackChange.Significant
  if (entry.flags.didChangeIdentifier) return LayerStackChange.Significant
  for (const [key] of entry.infoChanged) {
    if (key === 'owner' || key === 'sessionOwner' || key === 'hasOwnedSubLayers') {
      return LayerStackChange.Significant
    }
  }
  for (const [, type] of entry.subLayerChanges) {
    if (type === SdfSubLayerChangeType.SubLayerAdded ||
        type === SdfSubLayerChangeType.SubLayerRemoved) {
      return LayerStackChange.MaybeSignificant
    }
  }
  return LayerStackChange.None
}

function sdfValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

// Pcp_EntryRequiresLayerStackOffsetsChange (changes.cpp:172-240).
function entryRequiresLayerStackOffsetsChange(
  entry: SdfChangeListEntry, flags: { rootLayerStacksMayNeedTcpsRecompute: boolean },
): boolean {
  for (const [, type] of entry.subLayerChanges) {
    if (type === SdfSubLayerChangeType.SubLayerOffset) return true
  }
  const change = entry.findInfoChange('timeCodesPerSecond')
  if (change) {
    const [oldComputedTcps, newComputedTcps] = change
    if (sdfValueEqual(oldComputedTcps, newComputedTcps)) {
      flags.rootLayerStacksMayNeedTcpsRecompute = true
      return false
    }
    const matchesFallback = (value: unknown): boolean => value === TCPS_FALLBACK
    if ((oldComputedTcps === undefined && matchesFallback(newComputedTcps)) ||
        (newComputedTcps === undefined && matchesFallback(oldComputedTcps))) {
      return false
    }
    return true
  }
  return false
}

// Pcp_EntryRequiresPrimIndexChange (changes.cpp:242-282).
function entryRequiresPrimIndexChange(entry: SdfChangeListEntry): boolean {
  if (entry.flags.didChangePrimInheritPaths || entry.flags.didChangePrimSpecializes ||
      entry.flags.didChangePrimReferences || entry.flags.didChangePrimVariantSets) {
    return true
  }
  for (const [key, [oldValue, newValue]] of entry.infoChanged) {
    if (key === 'payload' || key === 'permission' || key === 'variantSelection' ||
        key === 'instanceable') {
      return true
    }
    if (key === 'clips') {
      // Pcp cares only about the presence of clips.
      if (oldValue === undefined || newValue === undefined) return true
    }
  }
  return false
}

const SpecsAddInert = 1
const SpecsRemoveInert = 2
const SpecsAddNonInert = 4
const SpecsRemoveNonInert = 8
const SpecsTargets = 16
const SpecsConnections = 32
const SpecsAdd = SpecsAddInert | SpecsAddNonInert
const SpecsInert = SpecsAddInert | SpecsRemoveInert
const SpecsNonInert = SpecsAddNonInert | SpecsRemoveNonInert

// Pcp_EntryRequiresPrimSpecsChange (changes.cpp:310-322).
function entryRequiresPrimSpecsChange(entry: SdfChangeListEntry): number {
  let result = 0
  if (entry.flags.didAddInertPrim) result |= SpecsAddInert
  if (entry.flags.didRemoveInertPrim) result |= SpecsRemoveInert
  if (entry.flags.didAddNonInertPrim) result |= SpecsAddNonInert
  if (entry.flags.didRemoveNonInertPrim) result |= SpecsRemoveNonInert
  return result
}

// Pcp_EntryRequiresPropertySpecsChange (changes.cpp:324-346).
function entryRequiresPropertySpecsChange(entry: SdfChangeListEntry): number {
  let result = 0
  if (entry.flags.didAddPropertyWithOnlyRequiredFields) result |= SpecsAddInert
  if (entry.flags.didRemovePropertyWithOnlyRequiredFields) result |= SpecsRemoveInert
  if (entry.flags.didAddProperty) result |= SpecsAddNonInert
  if (entry.flags.didRemoveProperty) result |= SpecsRemoveNonInert
  if (entry.flags.didChangeRelationshipTargets) result |= SpecsTargets
  if (entry.flags.didChangeAttributeConnection) result |= SpecsConnections
  return result
}

// Pcp_EntryRequiresPropertyIndexChange (changes.cpp:348-357).
function entryRequiresPropertyIndexChange(entry: SdfChangeListEntry): boolean {
  return entry.hasInfoChange('permission')
}

// Pcp_ChangeMayAffectDynamicFileFormatArguments (changes.cpp:363-384).
function changeMayAffectDynamicFileFormatArguments(
  cache: PcpCache, entry: SdfChangeListEntry,
): boolean {
  if (!cache.hasAnyDynamicFileFormatArgumentFieldDependencies()) return false
  return entry.infoChanged.some(([key]) => cache.isPossibleDynamicFileFormatArgumentField(key))
}

// Pcp_LayerMightHaveRelocates (changes.cpp:409-440), USD mode: relocates
// may only be authored in layer metadata.
function layerMightHaveRelocates(layer: PcpLayer | null): boolean {
  if (!layer) return false
  const relocates = layer.getField('/', 'layerRelocates')
  return Array.isArray(relocates) ? relocates.length > 0
    : relocates instanceof Map ? relocates.size > 0
      : relocates !== undefined && relocates !== null && Object.keys(relocates).length > 0
}

function layerIsPackage(layer: PcpLayer): boolean {
  return layer.getFileFormat?.()?.isPackage?.() ?? false
}

// Pcp_DoesInfoChangeAffectFileFormatArguments (changes.cpp:442-482).
function doesInfoChangeAffectFileFormatArguments(
  cache: PcpCache, primIndexPath: SdfPath, changes: SdfChangeListEntry,
): boolean {
  const depData = cache.getDynamicFileFormatArgumentDependencyData(primIndexPath)
  if (depData.isEmpty()) return false
  for (const [key, [oldValue, newValue]] of changes.infoChanged) {
    if (depData.canFieldChangeAffectFileFormatArguments(key, oldValue, newValue)) return true
  }
  return false
}

// AttributeMayAffectFileFormatArgumentsChange (changes.cpp:487-497).
interface AttributeFileFormatArgumentsChange {
  readonly propertyPath: SdfPath
  readonly defaultFieldChange: [unknown, unknown] | null
}

// Pcp_CollectAttributeMayAffectDynamicFileFormatArgumentsChanges
// (changes.cpp:502-612).
function collectAttributeFileFormatArgumentsChanges(
  pcpChanges: PcpChanges, cache: PcpCache, layer: PcpLayer, path: SdfPath,
  entry: SdfChangeListEntry, changes: AttributeFileFormatArgumentsChange[],
): void {
  if (!path.isPrimPropertyPath()) return
  const addChange = (propPath: SdfPath, defaultFieldChange: [unknown, unknown] | null): void => {
    if (pcpChanges.findAllLayerStacksUsingLayer(cache, layer).length > 0) {
      changes.push({ propertyPath: propPath, defaultFieldChange })
    }
  }
  const hasDefault = (p: SdfPath): boolean => layer.getField(p.pathString, 'default') !== undefined
  if (entry.flags.didRename) {
    if (cache.isPossibleDynamicFileFormatArgumentAttribute(path.name) && hasDefault(path)) {
      addChange(path, null)
    }
    if (cache.isPossibleDynamicFileFormatArgumentAttribute(entry.oldPath.name)) {
      addChange(entry.oldPath, null)
    }
    return
  }
  if (!cache.isPossibleDynamicFileFormatArgumentAttribute(path.name)) return
  if (entry.flags.didAddProperty) {
    if (hasDefault(path)) addChange(path, null)
    return
  }
  if (entry.flags.didRemoveProperty) {
    addChange(path, null)
    return
  }
  const change = entry.findInfoChange('default')
  if (change) addChange(path, change)
}

// Pcp_DoesAttributeChangeAffectFileFormatArguments (changes.cpp:614-660).
function doesAttributeChangeAffectFileFormatArguments(
  cache: PcpCache, primIndexPath: SdfPath, change: AttributeFileFormatArgumentsChange,
): boolean {
  const depData = cache.getDynamicFileFormatArgumentDependencyData(primIndexPath)
  if (depData.isEmpty()) return false
  const propName = change.propertyPath.name
  if (!change.defaultFieldChange) return depData.getRelevantAttributeNames().has(propName)
  return depData.canAttributeDefaultValueChangeAffectFileFormatArguments(
    propName, change.defaultFieldChange[0], change.defaultFieldChange[1])
}

// SdfLayer::ConvertDefaultPrimTokenToPath.
function convertDefaultPrimTokenToPath(token: unknown): SdfPath {
  if (typeof token !== 'string' || token === '') return SdfPath.emptyPath
  const path = SdfPath.fromString(token.startsWith('/') ? token : `/${token}`)
  return path.isPrimPath() ? path : SdfPath.emptyPath
}

// _DeterminePathsAffectedByRelocationChanges (changes.cpp:2706-2738).
function determinePathsAffectedByRelocationChanges(
  oldMap: ReadonlyMap<string, string>, newMap: ReadonlyMap<string, string>,
  affectedPaths: SdfPathSet,
): void {
  const add = (p: string): void => { if (p) affectedPaths.add(SdfPath.fromString(p)) }
  for (const [oldSource, oldTarget] of oldMap) {
    const newTarget = newMap.get(oldSource)
    if (newTarget === undefined) {
      add(oldSource)
      add(oldTarget)
    } else if (newTarget !== oldTarget) {
      add(oldTarget)
      add(newTarget)
    }
  }
  for (const [newSource, newTarget] of newMap) {
    if (!oldMap.has(newSource)) {
      add(newSource)
      add(newTarget)
    }
  }
}

// Layer stack change bits (PcpChanges::DidChange).
const LayerStackLayersChange = 1
const LayerStackOffsetsChange = 2
const LayerStackRelocatesChange = 4
const LayerStackSignificantChange = 8
const LayerStackResolvedPathChange = 16
const LayerStackExpressionVarsChange = 32

const PathChangeSimple = 1
const PathChangeTargets = 2
const PathChangeConnections = 4

const enum SublayerChange { Added, Removed }

export class PcpChanges {
  private _layerStackChanges = new Map<PcpLayerStack, PcpLayerStackChanges>()
  private _cacheChanges = new Map<PcpCache, PcpCacheChanges>()
  // Per cache: old path string -> [oldPath, newPath].
  private _renameChanges = new Map<PcpCache, Map<string, [SdfPath, SdfPath]>>()
  private _lifeboat = new PcpLifeboat()

  // ---- Layer loading ---------------------------------------------------------

  // Run a synchronous change-recording step, loading any layer it needs and
  // retrying from the state before the step.
  private async _withLayerRetry(cache: PcpCache, fn: () => void): Promise<void> {
    const result = pcpRunMaybeAsync(this._layerRetry(cache, fn))
    if (result instanceof Promise) await result
  }

  private *_layerRetry(cache: PcpCache, fn: () => void): PcpMaybeAsync<void> {
    cache._layerSource.forgetFailures?.()
    for (;;) {
      const snapshot = this._snapshot()
      try {
        fn()
        return
      } catch (e) {
        if (!(e instanceof PcpNeedsLayer)) throw e
        this._restore(snapshot)
        yield cache._layerSource.load!(e.identifier)
      }
    }
  }

  private _snapshot(): [
    Map<PcpLayerStack, PcpLayerStackChanges>, Map<PcpCache, PcpCacheChanges>,
    Map<PcpCache, Map<string, [SdfPath, SdfPath]>>, PcpLifeboat,
  ] | undefined {
    // Nothing recorded yet (a fresh PcpChanges, as for each layer change
    // notice): the state to restore is the empty one, so nothing is copied.
    if (this._layerStackChanges.size === 0 && this._cacheChanges.size === 0 &&
        this._renameChanges.size === 0 && this._lifeboat._isEmpty()) return undefined
    return [
      new Map([...this._layerStackChanges].map(([k, v]) => [k, v._clone()])),
      new Map([...this._cacheChanges].map(([k, v]) => [k, v._clone()])),
      new Map([...this._renameChanges].map(([k, v]) => [k, new Map(v)])),
      this._lifeboat._clone(),
    ]
  }

  private _restore(snapshot: ReturnType<PcpChanges['_snapshot']>): void {
    [this._layerStackChanges, this._cacheChanges, this._renameChanges, this._lifeboat] =
      snapshot ?? [new Map(), new Map(), new Map(), new PcpLifeboat()]
  }

  // ---- Public API ------------------------------------------------------------

  /**
   * DidChange (changes.cpp:732-1393): record the cache changes required by
   * the given layer change lists. Loads sublayers being added as needed.
   */
  async didChange(cache: PcpCache, changes: SdfLayerChangeListVec<PcpLayer>): Promise<void> {
    await this._withLayerRetry(cache, () => this.didChangeSync(cache, changes))
  }

  /** @internal DidChange, continuing asynchronously only if a layer must load. */
  *_didChangeMaybeAsync(
    cache: PcpCache, changes: SdfLayerChangeListVec<PcpLayer>,
  ): PcpMaybeAsync<void> {
    yield* this._layerRetry(cache, () => this.didChangeSync(cache, changes))
  }

  /** Synchronous DidChange; throws PcpNeedsLayer when a sublayer must load. */
  didChangeSync(cache: PcpCache, changes: SdfLayerChangeListVec<PcpLayer>): void {
    const cacheInUsdMode = cache.isUsd()
    const cacheHasDynamicFileFormatAttributeDependencies =
      cache.hasAnyDynamicFileFormatArgumentAttributeDependencies()
    const layerStackChangesMap = new Map<PcpLayerStack, number>()
    let attributeChanges: AttributeFileFormatArgumentsChange[] = []

    for (const [layer, changeList] of changes) {
      const entries = changeList.getEntryList()

      if (cacheHasDynamicFileFormatAttributeDependencies) {
        attributeChanges = []
        for (const [path, entry] of entries) {
          collectAttributeFileFormatArgumentsChanges(
            this, cache, layer, path, entry, attributeChanges)
        }
      }

      // USD-mode caches only cache prim indexes; skip lists without prim
      // changes unless attributes may affect dynamic file formats.
      if (cacheInUsdMode && attributeChanges.length === 0) {
        if (!entries.some(([path]) => !path.containsPropertyElements())) continue
      }

      const layerStacks = this.findAllLayerStacksUsingLayer(cache, layer)
      if (layerStacks.length === 0) continue

      let layerStackChangeMask = 0
      const tcpsFlags = { rootLayerStacksMayNeedTcpsRecompute: false }
      const pathsWithSignificantChanges = new SdfPathSet()
      const pathsWithSpecChanges = new Map<string, [SdfPath, number]>()
      const pathsWithSpecChangesTypes = new Map<string, [SdfPath, number]>()
      const pathsWithFileFormatArgumentsChanges: SdfPath[] = []
      const oldPaths: SdfPath[] = []
      const newPaths: SdfPath[] = []
      const fallbackToAncestorPaths = new SdfPathSet()
      const orSpecChangeType = (path: SdfPath, bits: number): void => {
        const existing = pathsWithSpecChangesTypes.get(path.pathString)
        if (existing) existing[1] |= bits
        else pathsWithSpecChangesTypes.set(path.pathString, [path, bits])
      }

      for (const [path, entry] of entries) {
        // Paths where a prim or property was added or removed fall back to
        // an ancestor to synthesize dependencies.
        const f = entry.flags
        if (f.didAddInertPrim || f.didRemoveInertPrim || f.didAddNonInertPrim ||
            f.didRemoveNonInertPrim || f.didAddProperty || f.didRemoveProperty ||
            f.didAddPropertyWithOnlyRequiredFields || f.didRemovePropertyWithOnlyRequiredFields) {
          fallbackToAncestorPaths.add(path)
        }

        if (path.isAbsoluteRootPath()) {
          if (entry.flags.didReplaceContent) pathsWithSignificantChanges.add(path)

          // A defaultPrim change resyncs the old default prim path, or the
          // absolute root when there was none.
          const defaultPrimChange = entry.findInfoChange('defaultPrim')
          if (defaultPrimChange) {
            const oldDefaultPrimPath = convertDefaultPrimTokenToPath(defaultPrimChange[0])
            const newDefaultPrimPath = convertDefaultPrimTokenToPath(defaultPrimChange[1])
            if (newDefaultPrimPath.pathString === oldDefaultPrimPath.pathString) continue
            pathsWithSignificantChanges.add(
              oldDefaultPrimPath.isEmpty() ? SdfPath.absoluteRootPath : oldDefaultPrimPath)
          }

          switch (entryRequiresLayerStackChange(entry)) {
            case LayerStackChange.MaybeSignificant:
              layerStackChangeMask |= LayerStackLayersChange
              for (const [sublayerPath, type] of entry.subLayerChanges) {
                if (type !== SdfSubLayerChangeType.SubLayerAdded &&
                    type !== SdfSubLayerChangeType.SubLayerRemoved) continue
                const significant = this._didAddOrRemoveSublayer(
                  cache, layerStacks, layer, sublayerPath,
                  type === SdfSubLayerChangeType.SubLayerAdded
                    ? SublayerChange.Added : SublayerChange.Removed)
                layerStacks.forEach((layerStack, i) => {
                  if (significant[i]) {
                    layerStackChangesMap.set(layerStack,
                      (layerStackChangesMap.get(layerStack) ?? 0) | LayerStackSignificantChange)
                  }
                })
              }
              break
            case LayerStackChange.Significant:
              layerStackChangeMask |= LayerStackLayersChange | LayerStackSignificantChange
              pathsWithSignificantChanges.add(path)
              break
            case LayerStackChange.None:
              if (entryRequiresLayerStackOffsetsChange(entry, tcpsFlags)) {
                layerStackChangeMask |= LayerStackOffsetsChange
                // Offsets are folded into arc map functions: resync every
                // index using the layer.
                pathsWithSignificantChanges.add(path)
              }
              break
          }

          if (entry.flags.didChangeResolvedPath) layerStackChangeMask |= LayerStackResolvedPathChange
          if (entry.hasInfoChange('expressionVariables')) {
            layerStackChangeMask |= LayerStackExpressionVarsChange
          }
          if (entry.hasInfoChange('layerRelocates')) layerStackChangeMask |= LayerStackRelocatesChange
        } else if (path.isPrimOrPrimVariantSelectionPath()) {
          if (entry.flags.didRename) {
            // Renames are treated as resyncs.
            oldPaths.push(entry.oldPath)
            newPaths.push(path)
          }
          const specChanges = entryRequiresPrimSpecsChange(entry)
          if (specChanges) orSpecChangeType(path, specChanges)
          if (entryRequiresPrimIndexChange(entry)) {
            pathsWithSignificantChanges.add(path)
          } else if (changeMayAffectDynamicFileFormatArguments(cache, entry)) {
            pathsWithFileFormatArgumentsChanges.push(path)
          }
          if (entry.hasInfoChange('relocates')) layerStackChangeMask |= LayerStackRelocatesChange
        } else if (!cacheInUsdMode) {
          if (path.isPropertyPath()) {
            if (entry.flags.didRename) {
              oldPaths.push(entry.oldPath)
              newPaths.push(path)
            }
            const specChanges = entryRequiresPropertySpecsChange(entry)
            if (specChanges) orSpecChangeType(path, specChanges)
            if (entryRequiresPropertyIndexChange(entry)) pathsWithSignificantChanges.add(path)
          } else if (path.isTargetPath()) {
            if (entry.flags.didAddTarget) orSpecChangeType(path, SpecsAddInert)
            if (entry.flags.didRemoveTarget) orSpecChangeType(path, SpecsRemoveInert)
          }
        }
      }

      // A TCPS change may affect the computed TCPS of the root layer stack.
      if (tcpsFlags.rootLayerStacksMayNeedTcpsRecompute) {
        const layerStack = cache.getLayerStack()
        if (pcpNeedToRecomputeLayerStackTimeCodesPerSecond(layerStack, layer)) {
          layerStackChangesMap.set(layerStack,
            (layerStackChangesMap.get(layerStack) ?? 0) | LayerStackOffsetsChange)
          this.didChangeSignificantly(cache, SdfPath.absoluteRootPath)
        }
      }

      if (layerStackChangeMask !== 0) {
        for (const layerStack of layerStacks) {
          layerStackChangesMap.set(layerStack,
            (layerStackChangesMap.get(layerStack) ?? 0) | layerStackChangeMask)
        }
      }

      // Spec changes: non-inert additions and removals are significant;
      // inert ones are refined in DidChangeSpecs.
      for (const [path, bits] of pathsWithSpecChangesTypes.values()) {
        const orPathChange = (b: number): void => {
          const existing = pathsWithSpecChanges.get(path.pathString)
          if (existing) existing[1] |= b
          else pathsWithSpecChanges.set(path.pathString, [path, b])
        }
        if (path.isPrimOrPrimVariantSelectionPath()) {
          if (bits & SpecsNonInert) pathsWithSignificantChanges.add(path)
          else if (bits & SpecsInert) orPathChange(PathChangeSimple)
        } else {
          if (bits & SpecsNonInert) pathsWithSignificantChanges.add(path)
          else if (bits & SpecsInert) orPathChange(PathChangeSimple)
          if (bits & SpecsTargets) orPathChange(PathChangeTargets)
          if (bits & SpecsConnections) orPathChange(PathChangeConnections)
        }
      }

      for (const path of pathsWithSignificantChanges) {
        this._didChangeDependents(cache, layer, path, true,
          !fallbackToAncestorPaths.has(path),
          dep => this.didChangeSignificantly(cache, dep.indexPath))
      }

      for (const changedPath of pathsWithFileFormatArgumentsChanges) {
        const entry = changeList.getEntry(changedPath)
        this._didChangeDependents(cache, layer, changedPath, true,
          !fallbackToAncestorPaths.has(changedPath), (dep) => {
            if (doesInfoChangeAffectFileFormatArguments(cache, dep.indexPath, entry)) {
              this.didChangeSignificantly(cache, dep.indexPath)
            }
          })
      }

      for (const change of attributeChanges) {
        const primPath = change.propertyPath.getPrimPath()
        this._didChangeDependents(cache, layer, primPath, true,
          !fallbackToAncestorPaths.has(primPath), (dep) => {
            if (doesAttributeChangeAffectFileFormatArguments(cache, dep.indexPath, change)) {
              this.didChangeSignificantly(cache, dep.indexPath)
            }
          })
      }

      // Relocates can only be authored in layer metadata in USD mode, so the
      // per-prim relocates checks (changes.cpp:1260-1307) never apply.

      for (const [path, pathChanges] of pathsWithSpecChanges.values()) {
        const changesType = pathsWithSpecChangesTypes.get(path.pathString)?.[1] ?? 0
        this._didChangeDependents(cache, layer, path, false, false, (dep) => {
          if (pathChanges & ~(PathChangeTargets | PathChangeConnections)) {
            this.didChangeSpecs(cache, dep.indexPath, layer, dep.sitePath,
              changesType & SpecsAdd
                ? PcpChangeSpecsType.ChangeSpecsTypeAdded
                : PcpChangeSpecsType.ChangeSpecsTypeRemoved)
          }
          if (pathChanges & PathChangeTargets) {
            this.didChangeTargets(cache, dep.indexPath,
              PcpCacheChangesTargetType.TargetTypeRelationshipTarget)
          }
          if (pathChanges & PathChangeConnections) {
            this.didChangeTargets(cache, dep.indexPath,
              PcpCacheChangesTargetType.TargetTypeConnection)
          }
        })
      }

      // Namespace edits: record dependent paths for comparison with edits
      // reported through DidChangePaths.
      if (oldPaths.length > 0) {
        const renameChanges = this._getRenameChanges(cache)
        for (let i = 0; i < oldPaths.length; i++) {
          const oldPath = oldPaths[i]!
          const newPath = newPaths[i]!
          if (!newPath.isEmpty()) {
            for (const dep of cache.findSiteDependencies(layer, newPath,
              PcpDependencyType.AnyNonVirtual, false, false, true)) {
              renameChanges.set(dep.indexPath.pathString, [dep.indexPath, SdfPath.emptyPath])
            }
          }
          for (const dep of cache.findSiteDependencies(layer, oldPath,
            PcpDependencyType.AnyNonVirtual, false, false, true)) {
            const newIndexPath = newPath.isEmpty() ? SdfPath.emptyPath
              : dep.mapFunc.mapSourceToTarget(newPath.stripAllVariantSelections())
            renameChanges.set(dep.indexPath.pathString, [dep.indexPath, newIndexPath])
          }
        }
      }
    }

    // Process layer stack changes.
    for (const [layerStack, mask] of layerStackChangesMap) {
      let layerStackChanges = mask
      if (layerStackChanges & LayerStackResolvedPathChange) {
        const needToRecompute = pcpLayerStackNeedsRecomputeDueToAssetPathChange(layerStack)
        this._didChangeLayerStackResolvedPath(cache, layerStack, needToRecompute)
        if (needToRecompute) {
          layerStackChanges |= LayerStackLayersChange | LayerStackSignificantChange
        }
      }
      if (layerStackChanges & LayerStackRelocatesChange) {
        this._didChangeLayerStackRelocations(cache, layerStack)
      }
      if (layerStackChanges & LayerStackExpressionVarsChange) {
        this._didChangeLayerStackExpressionVariables(cache, layerStack)
      }
      this._didChangeLayerStack(cache, layerStack,
        (layerStackChanges & LayerStackLayersChange) !== 0,
        (layerStackChanges & LayerStackOffsetsChange) !== 0,
        (layerStackChanges & LayerStackSignificantChange) !== 0)
    }
  }

  // Pcp_DidChangeDependents (changes.cpp:662-700).
  private _didChangeDependents(
    cache: PcpCache, layer: PcpLayer, path: SdfPath, processPrimDescendants: boolean,
    onlyExistingDependentPaths: boolean, fn: (dep: PcpDependency) => void,
  ): void {
    const recurseOnSite = processPrimDescendants &&
      (path.isAbsoluteRootPath() || path.isPrimOrPrimVariantSelectionPath())
    const deps = this.findSiteDependencies(cache, layer, path,
      PcpDependencyType.AnyIncludingVirtual, recurseOnSite, false, onlyExistingDependentPaths)
    for (const dep of deps) fn(dep)
  }

  /** DidMuteAndUnmuteLayers (changes.cpp:1395-1410). */
  async didMuteAndUnmuteLayers(
    cache: PcpCache, layersToMute: readonly string[], layersToUnmute: readonly string[],
  ): Promise<void> {
    await this._withLayerRetry(cache, () =>
      this.didMuteAndUnmuteLayersSync(cache, layersToMute, layersToUnmute))
  }

  /** @internal */
  *_didMuteAndUnmuteLayersMaybeAsync(
    cache: PcpCache, layersToMute: readonly string[], layersToUnmute: readonly string[],
  ): PcpMaybeAsync<void> {
    yield* this._layerRetry(cache, () =>
      this.didMuteAndUnmuteLayersSync(cache, layersToMute, layersToUnmute))
  }

  didMuteAndUnmuteLayersSync(
    cache: PcpCache, layersToMute: readonly string[], layersToUnmute: readonly string[],
  ): void {
    for (const layerId of layersToMute) this._didMuteLayer(cache, layerId)
    for (const layerId of layersToUnmute) this._didUnmuteLayer(cache, layerId)
  }

  // _MarkReferencingSitesAsSignificantlyChanged (changes.cpp:1412-1458).
  private _markReferencingSitesAsSignificantlyChanged(
    cache: PcpCache, layerStacks: readonly PcpLayerStack[],
  ): void {
    const cacheChanges = this._getCacheChanges(cache)
    const refOrPayloadChange = (depIndexPath: SdfPath, arcType: PcpArcType): void => {
      if (arcType === PcpArcType.Reference || arcType === PcpArcType.Payload) {
        this.didChangeSignificantly(cache, depIndexPath)
      }
    }
    for (const layerStack of layerStacks) {
      const deps = cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
        PcpDependencyType.AnyIncludingVirtual, true, false, true)
      for (const dep of deps) {
        if (pcpComposeSiteHasSpecs(layerStack, dep.sitePath,
          cacheChanges.layersAffectedByMutingOrRemoval)) continue
        pcpForEachDependentNode(dep.sitePath, layerStack, dep.indexPath, cache,
          (depIndexPath, node) => refOrPayloadChange(depIndexPath, node.getArcType()),
          (depIndexPath, culled) => refOrPayloadChange(depIndexPath, culled.arcType))
      }
    }
  }

  // _ProcessLayerStackAndDependencyChanges (changes.cpp:1460-1490).
  private _processLayerStackAndDependencyChanges(
    cache: PcpCache, layerStacks: readonly PcpLayerStack[],
  ): void {
    for (const layerStack of layerStacks) {
      this._didChangeLayerStack(cache, layerStack, true, false, true)
      const deps = cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
        PcpDependencyType.AnyIncludingVirtual, false, false, true)
      for (const dep of deps) {
        // Prim stacks index into the layer stack and must be updated.
        if (dep.indexPath.isAbsoluteRootOrPrimPath()) {
          this._didChangeSpecStackAndChildrenInternal(cache, dep.indexPath)
        }
      }
    }
  }

  // Minimal change lists for a layer appearing (fromEmpty) or disappearing
  // (toEmpty): SdfLayer::CreateDiff against an empty anonymous layer.
  private static _diffWithEmpty(layer: PcpLayer, toEmpty: boolean): SdfChangeList {
    const empty = layer._createEmptyAnonymous!()
    return toEmpty ? layer.createDiff!(empty, false) : empty.createDiff!(layer, false)
  }

  private static _canUseMinimalChanges(cache: PcpCache, layer: PcpLayer | null): layer is PcpLayer {
    return minimalChangesForLayerOperations && layer !== null && !pcpLayerIsEmpty(layer) &&
      !layerIsPackage(layer) && !layerMightHaveRelocates(layer) && cache.isUsd() &&
      layer.createDiff !== undefined && layer._createEmptyAnonymous !== undefined
  }

  // _DidMuteLayer (changes.cpp:1492-1545).
  private _didMuteLayer(cache: PcpCache, layerId: string): void {
    const mutedLayer = this._loadLayerForChange(cache, layerId, SublayerChange.Removed)
    const layerStacks = mutedLayer ? this.findAllLayerStacksUsingLayer(cache, mutedLayer) : []
    const cacheChanges = this._getCacheChanges(cache)
    if (mutedLayer) {
      this._lifeboat.retain(mutedLayer)
      // Muted layers stay in layer stacks until the changes are applied;
      // clients recomputing state must ignore them.
      cacheChanges.layersAffectedByMutingOrRemoval.add(mutedLayer)
    }
    if (!PcpChanges._canUseMinimalChanges(cache, mutedLayer)) {
      this._didChangeSublayerAndLayerStacks(
        cache, layerStacks, layerId, mutedLayer, SublayerChange.Removed)
    } else {
      const changes: SdfLayerChangeListVec<PcpLayer> =
        [[mutedLayer, PcpChanges._diffWithEmpty(mutedLayer, true)]]
      this.didChangeSync(cache, changes)
      cacheChanges.layerChangeListVec.push(changes[0]!)
      this._processLayerStackAndDependencyChanges(cache, layerStacks)
      this._markReferencingSitesAsSignificantlyChanged(cache, layerStacks)
    }
  }

  // _DidUnmuteLayer (changes.cpp:1547-1595).
  private _didUnmuteLayer(cache: PcpCache, layerId: string): void {
    const unmutedLayer = this._loadLayerForChange(cache, layerId, SublayerChange.Added)
    const layerStacks = cache._findAllLayerStacksUsingMutedLayer(layerId)
    const cacheChanges = this._getCacheChanges(cache)
    if (unmutedLayer) this._lifeboat.retain(unmutedLayer)
    if (!PcpChanges._canUseMinimalChanges(cache, unmutedLayer)) {
      this._didChangeSublayerAndLayerStacks(
        cache, layerStacks, layerId, unmutedLayer, SublayerChange.Added)
    } else {
      cacheChanges._setLayerStacksUsingLayerOverride(unmutedLayer, layerStacks)
      const changes: SdfLayerChangeListVec<PcpLayer> =
        [[unmutedLayer, PcpChanges._diffWithEmpty(unmutedLayer, false)]]
      this.didChangeSync(cache, changes)
      cacheChanges.layerChangeListVec.push(changes[0]!)
      this._processLayerStackAndDependencyChanges(cache, layerStacks)
      this._markReferencingSitesAsSignificantlyChanged(cache, layerStacks)
    }
  }

  /** DidMaybeFixSublayer (changes.cpp:1597-1622). */
  async didMaybeFixSublayer(cache: PcpCache, layer: PcpLayer, sublayerPath: string): Promise<void> {
    await this._withLayerRetry(cache, () => {
      const sublayer = this._loadSublayerForChange(cache, layer, sublayerPath, SublayerChange.Added)
      const layerStacks = this.findAllLayerStacksUsingLayer(cache, layer)
      this._didChangeSublayerAndLayerStacks(
        cache, layerStacks, sublayerPath, sublayer, SublayerChange.Added)
    })
  }

  // _DidChangeSublayerAndLayerStacks (changes.cpp:1624-1648).
  private _didChangeSublayerAndLayerStacks(
    cache: PcpCache, layerStacks: readonly PcpLayerStack[], sublayerPath: string,
    sublayer: PcpLayer | null, sublayerChange: SublayerChange,
  ): void {
    const requiresSignificantChange =
      this._didChangeSublayer(cache, layerStacks, sublayerPath, sublayer, sublayerChange)
    if (sublayer) {
      for (const layerStack of layerStacks) {
        this._didChangeLayerStack(cache, layerStack, true, false, requiresSignificantChange)
      }
    }
  }

  /** DidMaybeFixAsset (changes.cpp:1650-1700). */
  async didMaybeFixAsset(
    cache: PcpCache, site: PcpSite, srcLayer: PcpLayer | undefined, assetPath: string,
  ): Promise<void> {
    await this._withLayerRetry(cache, () =>
      this.didMaybeFixAssetSync(cache, site, srcLayer, assetPath))
  }

  /** @internal */
  *_didMaybeFixAssetMaybeAsync(
    cache: PcpCache, site: PcpSite, srcLayer: PcpLayer | undefined, assetPath: string,
  ): PcpMaybeAsync<void> {
    yield* this._layerRetry(cache, () =>
      this.didMaybeFixAssetSync(cache, site, srcLayer, assetPath))
  }

  didMaybeFixAssetSync(
    cache: PcpCache, site: PcpSite, srcLayer: PcpLayer | undefined, assetPath: string,
  ): void {
    const layerStack = cache.findLayerStack(site.layerStack)
    if (!layerStack || !srcLayer) return
    const layer = this._loadSublayerForChange(cache, srcLayer, assetPath, SublayerChange.Added)
    if (!layer) return
    this._lifeboat.retain(layer)
    const sitePath = SdfPath.fromString(site.path)
    if (layerStack === cache.getLayerStack()) this.didChangeSignificantly(cache, sitePath)
    for (const dep of cache.findSiteDependencies(layerStack, sitePath,
      PcpDependencyType.AnyIncludingVirtual, true, true, true)) {
      this.didChangeSignificantly(cache, dep.indexPath)
    }
  }

  /** DidChangeSignificantly (changes.cpp:1702-1706). */
  didChangeSignificantly(cache: PcpCache, path: SdfPath): void {
    this._getCacheChanges(cache).didChangeSignificantly.add(path)
  }

  /** FindAllLayerStacksUsingLayer (changes.cpp:1720-1742). */
  findAllLayerStacksUsingLayer(cache: PcpCache, layer: PcpLayer): readonly PcpLayerStack[] {
    const changes = this._cacheChanges.get(cache)
    if (changes) {
      const overrideVec = changes._getLayerStacksUsingLayerOverride(layer)
      if (overrideVec.length > 0) return overrideVec
    }
    return cache.findAllLayerStacksUsingLayer(layer)
  }

  /** FindSiteDependencies (changes.cpp:1744-1775). */
  findSiteDependencies(
    cache: PcpCache, siteLayer: PcpLayer, sitePath: SdfPath, depMask: PcpDependencyFlags,
    recurseOnSite: boolean, recurseOnIndex: boolean, filterForExistingCachesOnly: boolean,
  ): PcpDependency[] {
    const result: PcpDependency[] = []
    for (const layerStack of this.findAllLayerStacksUsingLayer(cache, siteLayer)) {
      const deps = cache.findSiteDependencies(layerStack, sitePath, depMask,
        recurseOnSite, recurseOnIndex, filterForExistingCachesOnly)
      const offset = layerStack.getLayerOffsetForLayer(siteLayer)
      for (const dep of deps) {
        if (offset) dep.mapFunc = dep.mapFunc.composeOffset(offset)
        result.push(dep)
      }
    }
    return result
  }

  /** DidChangeSpecs (changes.cpp:1777-1873). */
  didChangeSpecs(
    cache: PcpCache, path: SdfPath, changedLayer: PcpLayer, changedPath: SdfPath,
    changeType: PcpChangeSpecsType,
  ): void {
    if (path.isPrimPath()) {
      const primWasAdded = changeType === PcpChangeSpecsType.ChangeSpecsTypeAdded
      const primIndex = cache.findPrimIndex(path)
      if (primIndex && primIndex.hasSpecs()) {
        // Removing the last spec of the index composes the prim away.
        if (!primWasAdded && noLongerHasAnySpecs(this._getCacheChanges(cache), primIndex)) {
          this.didChangeSignificantly(cache, path)
          return
        }
        const nodeForChangedSpec = ((): PcpNodeRef | null => {
          const nodeProvidingSpec = primIndex.getNodeProvidingSpec(changedLayer, changedPath)
          if (nodeProvidingSpec) return nodeProvidingSpec
          // The node's layer stack may be gaining this layer through an
          // unmute or sublayer insertion.
          const overrides = this._getCacheChanges(cache)._getLayerStacksUsingLayerOverride(
            changedLayer)
          if (overrides.length === 0) return null
          for (const node of primIndex.getNodeRange()) {
            if (!node.canContributeSpecs() ||
                node.getPath().pathString !== changedPath.pathString) continue
            if (overrides.includes(node.getLayerStack())) return node
          }
          return null
        })()
        if (nodeForChangedSpec) {
          // An inert spec appearing or vanishing can change whether this
          // node is instanceable, and so the instancing key.
          if (primIndex.isInstanceable() && pcpChildNodeInstanceableChanged(nodeForChangedSpec)) {
            this.didChangeSignificantly(cache, path)
            return
          }
        } else if (primWasAdded) {
          // The added inert spec may correspond to a culled node; rebuild
          // the index to pick it up.
          this._getCacheChanges(cache).didChangePrims.add(path)
          return
        }
      } else if (primWasAdded) {
        // The first spec for this composed prim.
        this.didChangeSignificantly(cache, path)
        return
      }
    }
    this.didChangeSpecStack(cache, path)
  }

  /** DidChangeSpecStack (changes.cpp:1875-1879). */
  didChangeSpecStack(cache: PcpCache, path: SdfPath): void {
    this._getCacheChanges(cache).didChangeSpecs.add(path)
  }

  /** DidChangeTargets (changes.cpp:1881-1886). */
  didChangeTargets(cache: PcpCache, path: SdfPath, targetType: PcpCacheChangesTargetType): void {
    const targets = this._getCacheChanges(cache).didChangeTargets
    targets.set(path.pathString, (targets.get(path.pathString) ?? 0) | targetType)
  }

  /** DidChangePaths (changes.cpp:1888-1900). */
  didChangePaths(cache: PcpCache, oldPath: SdfPath, newPath: SdfPath): void {
    this._getCacheChanges(cache).didChangePath.push([oldPath, newPath])
  }

  /** DidDestroyCache (changes.cpp:1902-1910). */
  didDestroyCache(cache: PcpCache): void {
    this._cacheChanges.delete(cache)
    this._renameChanges.delete(cache)
  }

  /**
   * DidChangeAssetResolver (changes.cpp:1912-1945). The cache's opened layers
   * are re-resolved first, as upstream's synchronous SdfLayer::FindOrOpen
   * would re-resolve them.
   */
  async didChangeAssetResolver(cache: PcpCache): Promise<void> {
    await cache._layerSource.refresh()
    this.didChangeAssetResolverSync(cache)
  }

  didChangeAssetResolverSync(cache: PcpCache): void {
    cache.forEachLayerStack((layerStack) => {
      const needToRecompute = pcpLayerStackNeedsRecomputeDueToAssetPathChange(layerStack)
      this._didChangeLayerStackResolvedPath(cache, layerStack, needToRecompute)
      if (needToRecompute) this._didChangeLayerStack(cache, layerStack, true, false, true)
    })
  }

  swap(other: PcpChanges): void {
    [this._layerStackChanges, other._layerStackChanges] =
      [other._layerStackChanges, this._layerStackChanges]
    ;[this._cacheChanges, other._cacheChanges] = [other._cacheChanges, this._cacheChanges]
    ;[this._renameChanges, other._renameChanges] = [other._renameChanges, this._renameChanges]
    this._lifeboat.swap(other._lifeboat)
  }

  isEmpty(): boolean {
    return this._layerStackChanges.size === 0 && this._cacheChanges.size === 0 &&
      this._renameChanges.size === 0
  }

  getLayerStackChanges(): ReadonlyMap<PcpLayerStack, PcpLayerStackChanges> {
    return this._layerStackChanges
  }

  getCacheChanges(): ReadonlyMap<PcpCache, PcpCacheChanges> {
    this._optimize()
    return this._cacheChanges
  }

  getLifeboat(): PcpLifeboat { return this._lifeboat }

  /**
   * Apply (changes.cpp:1980-1996): apply layer stack changes, then cache
   * changes. Layer stacks recompute immediately, loading layers as needed.
   */
  async apply(): Promise<void> {
    const result = pcpRunMaybeAsync(this._applyMaybeAsync())
    if (result instanceof Promise) await result
  }

  /** @internal Apply, continuing asynchronously only if a layer must load. */
  *_applyMaybeAsync(): PcpMaybeAsync<void> {
    this._optimize()
    for (const [layerStack, changes] of this._layerStackChanges) {
      const source = layerStack._registry?._layerSource
      source?.forgetFailures?.()
      for (;;) {
        try {
          layerStack.apply(changes, this._lifeboat)
          break
        } catch (e) {
          if (!(e instanceof PcpNeedsLayer) || !source?.load) throw e
          yield source.load(e.identifier)
        }
      }
    }
    for (const [cache, changes] of this._cacheChanges) cache.apply(changes, this._lifeboat)
  }

  // ---- Internals -------------------------------------------------------------

  private _getLayerStackChanges(layerStack: PcpLayerStack): PcpLayerStackChanges {
    let changes = this._layerStackChanges.get(layerStack)
    if (!changes) this._layerStackChanges.set(layerStack, changes = new PcpLayerStackChanges())
    return changes
  }

  private _getCacheChanges(cache: PcpCache): PcpCacheChanges {
    let changes = this._cacheChanges.get(cache)
    if (!changes) this._cacheChanges.set(cache, changes = new PcpCacheChanges())
    return changes
  }

  private _getRenameChanges(cache: PcpCache): Map<string, [SdfPath, SdfPath]> {
    let changes = this._renameChanges.get(cache)
    if (!changes) this._renameChanges.set(cache, changes = new Map())
    return changes
  }

  // _Optimize (changes.cpp:2028-2075). Must run _OptimizePathChanges first.
  private _optimize(): void {
    for (const [cache, pathChanges] of this._renameChanges) {
      this._optimizePathChanges(this._getCacheChanges(cache), pathChanges)
    }
    for (const changes of this._cacheChanges.values()) {
      subsumeDescendants(changes.didChangeSignificantly)
      for (const path of changes.didChangeSignificantly) {
        subsumeDescendantsOf(changes.didChangePrims, path)
        subsumeDescendantsOf(changes.didChangeSpecs, path)
        subsumeDescendantsOf(changes._didChangeSpecsInternal, path)
        subsumeDescendantsOf(changes._didChangePrimSpecsAndChildrenInternal, path)
      }
      for (const path of changes.didChangePrims) {
        changes.didChangeSpecs.delete(path)
        changes._didChangeSpecsInternal.delete(path)
      }
      for (const path of changes.didChangeSpecs) changes._didChangeSpecsInternal.delete(path)
    }
  }

  // _OptimizePathChanges (changes.cpp:2077-2118): Sd renames not reported
  // through DidChangePaths are treated as resyncs.
  private _optimizePathChanges(
    changes: PcpCacheChanges, pathChanges: ReadonlyMap<string, [SdfPath, SdfPath]>,
  ): void {
    const sdOnly = new Map(pathChanges)
    for (const [oldPath, newPath] of changes.didChangePath) {
      const it = sdOnly.get(oldPath.pathString)
      if (it && it[1].pathString === newPath.pathString) sdOnly.delete(oldPath.pathString)
    }
    for (const [oldPath, newPath] of sdOnly.values()) {
      changes.didChangeSignificantly.add(oldPath)
      if (!newPath.isEmpty()) changes.didChangeSignificantly.add(newPath)
    }
  }

  // _LoadSublayerForChange(cache, sublayerPath, ...) (changes.cpp:2120-2141):
  // a layer by identifier (muted layer ids are already anchored).
  private _loadLayerForChange(
    cache: PcpCache, layerId: string, sublayerChange: SublayerChange,
  ): PcpLayer | null {
    const source = cache._layerSource
    return sublayerChange === SublayerChange.Added
      ? source.findOrOpen(layerId) : source.find?.(layerId) ?? null
  }

  // _LoadSublayerForChange(cache, layer, sublayerPath, ...)
  // (changes.cpp:2143-2180).
  private _loadSublayerForChange(
    cache: PcpCache, layer: PcpLayer | null, sublayerPath: string,
    sublayerChange: SublayerChange,
  ): PcpLayer | null {
    if (!layer) return null
    let identifier = sublayerPath
    if (!sublayerPath.startsWith('anon:')) {
      const { assetPath, args } = _sdfSplitLayerIdentifier(sublayerPath)
      const anchored = layer.resolveAsset(assetPath)
      if (!anchored) return null
      identifier = _sdfCreateLayerIdentifier(anchored, args)
    }
    const source = cache._layerSource
    if (sublayerChange === SublayerChange.Added) return source.findOrOpen(identifier)
    return source.find?.(identifier) ?? null
  }

  // _DidAddOrRemoveSublayer (changes.cpp:2182-2346).
  private _didAddOrRemoveSublayer(
    cache: PcpCache, layerStacks: readonly PcpLayerStack[], layer: PcpLayer,
    sublayerPath: string, sublayerChange: SublayerChange,
  ): boolean[] {
    const cacheChanges = this._getCacheChanges(cache)
    // A repeated (layer, sublayer path) pair indicates a cycle.
    let processed = cacheChanges._processedLayerSublayerPathPairs.get(layer)
    if (!processed) cacheChanges._processedLayerSublayerPathPairs.set(layer, processed = new Set())
    if (processed.has(sublayerPath)) return layerStacks.map(() => false)
    processed.add(sublayerPath)

    const processChanges = (
      sublayer: PcpLayer | null, stacks: readonly PcpLayerStack[], change: SublayerChange,
    ): boolean => {
      if (sublayer) {
        this._lifeboat.retain(sublayer)
        if (change === SublayerChange.Removed) {
          cacheChanges.layersAffectedByMutingOrRemoval.add(sublayer)
        }
      }
      if (!PcpChanges._canUseMinimalChanges(cache, sublayer)) {
        return this._didChangeSublayer(cache, stacks, sublayerPath, sublayer, change)
      }
      let changeList: SdfChangeList
      if (change === SublayerChange.Added) {
        cacheChanges._setLayerStacksUsingLayerOverride(sublayer, stacks)
        changeList = PcpChanges._diffWithEmpty(sublayer, false)
      } else {
        changeList = PcpChanges._diffWithEmpty(sublayer, true)
      }
      const changes: SdfLayerChangeListVec<PcpLayer> = [[sublayer, changeList]]
      this._processLayerStackAndDependencyChanges(cache, stacks)
      this.didChangeSync(cache, changes)
      cacheChanges.layerChangeListVec.push(changes[0]!)
      return true
    }

    if (!pcpIsVariableExpression(sublayerPath)) {
      const sublayer = this._loadSublayerForChange(cache, layer, sublayerPath, sublayerChange)
      const significant = processChanges(sublayer, layerStacks, sublayerChange)
      return layerStacks.map(() => significant)
    }

    // A sublayer expression may evaluate differently per layer stack.
    interface Data { sublayer: PcpLayer | null; layerStacks: PcpLayerStack[]; idxs: number[] }
    const sublayerToLayerStack = new Map<string, Data>()
    layerStacks.forEach((layerStack, i) => {
      const expressionVars = sublayerChange === SublayerChange.Added
        ? PcpExpressionVariables.compute(layerStack.identifier, cache.getLayerStackIdentifier())
        : layerStack.expressionVariables
      const evaluatedPath = pcpEvaluateVariableExpression(sublayerPath, expressionVars)
      if (!evaluatedPath) return
      let d = sublayerToLayerStack.get(evaluatedPath)
      if (!d) {
        d = {
          sublayer: this._loadSublayerForChange(cache, layer, evaluatedPath, sublayerChange),
          layerStacks: [], idxs: [],
        }
        sublayerToLayerStack.set(evaluatedPath, d)
      }
      d.layerStacks.push(layerStack)
      d.idxs.push(i)
    })
    const significant = layerStacks.map(() => false)
    for (const d of sublayerToLayerStack.values()) {
      if (processChanges(d.sublayer, d.layerStacks, sublayerChange)) {
        for (const i of d.idxs) significant[i] = true
      }
    }
    return significant
  }

  // _DidChangeSublayer (changes.cpp:2348-2420). Returns whether the change
  // is significant.
  private _didChangeSublayer(
    cache: PcpCache, layerStacks: readonly PcpLayerStack[], _sublayerPath: string,
    sublayer: PcpLayer | null, _sublayerChange: SublayerChange,
  ): boolean {
    const significant = sublayer !== null && !pcpLayerIsEmpty(sublayer)
    // An invalid sublayer, or an insignificant one in a USD cache, has no
    // effect on composed results.
    if (!sublayer || (!significant && cache.isUsd())) return significant
    this._lifeboat.retain(sublayer)
    for (const layerStack of layerStacks) {
      const deps = cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
        PcpDependencyType.AnyIncludingVirtual, true, !significant, true)
      for (const dep of deps) {
        if (!dep.indexPath.isAbsoluteRootOrPrimPath()) continue
        if (significant) this.didChangeSignificantly(cache, dep.indexPath)
        else this._didChangeSpecStackInternal(cache, dep.indexPath)
      }
    }
    return significant
  }

  // _DidChangeLayerStack (changes.cpp:2422-2445).
  private _didChangeLayerStack(
    cache: PcpCache, layerStack: PcpLayerStack, requiresLayerStackChange: boolean,
    requiresLayerStackOffsetsChange: boolean, requiresSignificantChange: boolean,
  ): void {
    const changes = this._getLayerStackChanges(layerStack)
    changes.didChangeLayers ||= requiresLayerStackChange
    changes.didChangeLayerOffsets ||= requiresLayerStackOffsetsChange
    changes.didChangeSignificantly ||= requiresSignificantChange
    // didChangeLayers subsumes didChangeLayerOffsets.
    if (changes.didChangeLayers) changes.didChangeLayerOffsets = false
    if (requiresLayerStackChange || requiresSignificantChange) {
      if (cache.usesLayerStack(layerStack)) this._getCacheChanges(cache).didMaybeChangeLayers = true
    }
  }

  // _DidChangeLayerStackRelocations (changes.cpp:2740-2817).
  private _didChangeLayerStackRelocations(cache: PcpCache, layerStack: PcpLayerStack): void {
    const changes = this._getLayerStackChanges(layerStack)
    if (changes.didChangeRelocates) return
    changes.didChangeRelocates = true
    const r = pcpComputeRelocationsForLayerStack(layerStack)
    changes.newRelocatesSourceToTarget = r.relocatesSourceToTarget
    changes.newRelocatesTargetToSource = r.relocatesTargetToSource
    changes.newIncrementalRelocatesSourceToTarget = r.incrementalRelocatesSourceToTarget
    changes.newIncrementalRelocatesTargetToSource = r.incrementalRelocatesTargetToSource
    changes.newRelocatesPrimPaths = r.relocatesPrimPaths
    changes.newRelocatesErrors = r.errors
    // In USD mode, gaining or losing all relocates affects every path, as
    // map expressions only listen to relocates when any exist.
    const willHaveRelocates = changes.newRelocatesSourceToTarget.size > 0
    if (layerStack.isUsd() && layerStack.hasRelocates !== willHaveRelocates) {
      changes.pathsAffectedByRelocationChanges = new SdfPathSet([SdfPath.absoluteRootPath])
    } else {
      determinePathsAffectedByRelocationChanges(
        layerStack.incrementalRelocatesSourceToTarget,
        changes.newIncrementalRelocatesSourceToTarget,
        changes.pathsAffectedByRelocationChanges)
    }
    const depPathSet = new SdfPathSet()
    for (const path of changes.pathsAffectedByRelocationChanges) {
      for (const dep of cache.findSiteDependencies(layerStack, path,
        PcpDependencyType.AnyIncludingVirtual, true, true, false)) {
        depPathSet.add(dep.indexPath)
      }
    }
    for (const depPath of depPathSet) this.didChangeSignificantly(cache, depPath)
  }

  // _DidChangeLayerStackResolvedPath (changes.cpp:2819-2880).
  private _didChangeLayerStackResolvedPath(
    cache: PcpCache, layerStack: PcpLayerStack, requiresLayerStackChange: boolean,
  ): void {
    let deps: PcpDependency[]
    if (requiresLayerStackChange) {
      deps = cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
        PcpDependencyType.AnyIncludingVirtual, true, false, true)
    } else {
      // Indexes using this layer stack may have asset paths that now
      // resolve differently.
      deps = cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
        PcpDependencyType.AnyIncludingVirtual, true, true, true)
      deps = deps.filter((dep) => {
        if (!dep.indexPath.isPrimPath()) return false
        const primIndex = cache.findPrimIndex(dep.indexPath)
        return primIndex !== undefined && pcpNeedToRecomputeDueToAssetPathChange(primIndex, cache._layerSource)
      })
    }
    for (const dep of deps) this.didChangeSignificantly(cache, dep.indexPath)
  }

  // _DidChangeLayerStackExpressionVariables (changes.cpp:2882-3030).
  private _didChangeLayerStackExpressionVariables(
    cache: PcpCache, layerStackIn: PcpLayerStack,
  ): void {
    const resyncAllPrimsUsingLayerStack = (layerStack: PcpLayerStack): void => {
      for (const dep of cache.findSiteDependencies(layerStack, SdfPath.absoluteRootPath,
        PcpDependencyType.Root | PcpDependencyType.Direct | PcpDependencyType.NonVirtual,
        true, false, true)) {
        this.didChangeSignificantly(cache, dep.indexPath)
      }
    }
    const rootId = cache.getLayerStackIdentifier()
    const layerStacks: PcpLayerStack[] = [layerStackIn]
    for (; layerStacks.length > 0; layerStacks.shift()) {
      const layerStack = layerStacks[0]!
      const oldExprVars = layerStack.expressionVariables
      const newExprVars = PcpExpressionVariables.compute(layerStack.identifier, rootId)
      const expressionVarsChanged =
        !sdfValueEqual(oldExprVars.getVariables(), newExprVars.getVariables())
      const expressionVarSourceChanged = !oldExprVars.getSource().equals(newExprVars.getSource())
      if (!expressionVarsChanged && !expressionVarSourceChanged) continue

      const changes = this._getLayerStackChanges(layerStack)
      if (expressionVarsChanged) {
        changes.didChangeExpressionVariables = true
        changes.newExpressionVariables = newExprVars.getVariables()
      }
      if (expressionVarSourceChanged) {
        changes._didChangeExpressionVariablesSource = true
        changes._newExpressionVariablesSource = newExprVars.getSource()
        // Referenced layer stacks used this source in their identifiers.
        resyncAllPrimsUsingLayerStack(layerStack)
        continue
      }

      const oldVars = oldExprVars.getVariables() as Record<string, unknown>
      const newVars = newExprVars.getVariables() as Record<string, unknown>
      const expressionVarChanged = (usedVar: string): boolean => {
        const hadOld = Object.prototype.hasOwnProperty.call(oldVars, usedVar)
        const hasNew = Object.prototype.hasOwnProperty.call(newVars, usedVar)
        return hadOld !== hasNew || (hadOld && !sdfValueEqual(oldVars[usedVar], newVars[usedVar]))
      }

      // Sublayer asset paths using changed variables require recomputing
      // the layer stack.
      if ([...layerStack.expressionVariableDependencies].some(expressionVarChanged)) {
        this._didChangeLayerStack(cache, layerStack, true, false, true)
        resyncAllPrimsUsingLayerStack(layerStack)
        continue
      }

      for (const primIndexPath of cache.getPrimsUsingExpressionVariablesFromLayerStack(layerStack)) {
        for (const usedExprVar of cache.getExpressionVariablesFromLayerStackUsedByPrim(
          primIndexPath, layerStack)) {
          if (expressionVarChanged(usedExprVar)) {
            this.didChangeSignificantly(cache, primIndexPath)
            break
          }
        }
      }

      // Layer stacks overriding their expression variables with this one's
      // must be checked too.
      cache.forEachLayerStack((x) => {
        if (x === layerStack) return
        const overrideSource = x.identifier.expressionVariablesOverrideSource
        if (overrideSource && pcpLayerStackIdentifierEquals(
          overrideSource.resolveLayerStackIdentifier(rootId), layerStack.identifier)) {
          layerStacks.push(x)
        }
      })
    }
  }

  private _didChangeSpecStackInternal(cache: PcpCache, path: SdfPath): void {
    this._getCacheChanges(cache)._didChangeSpecsInternal.add(path)
  }

  private _didChangeSpecStackAndChildrenInternal(cache: PcpCache, path: SdfPath): void {
    this._getCacheChanges(cache)._didChangePrimSpecsAndChildrenInternal.add(path)
  }
}

// _NoLongerHasAnySpecs (changes.cpp:1708-1718).
function noLongerHasAnySpecs(changes: PcpCacheChanges, primIndex: PcpPrimIndex): boolean {
  for (const node of primIndex.getNodeRange()) {
    if (pcpComposeSiteHasSpecs(node.getLayerStack(), node.getPath(),
      changes.layersAffectedByMutingOrRemoval)) return false
  }
  return true
}
