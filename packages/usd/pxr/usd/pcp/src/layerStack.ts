// Ported from OpenUSD 26.11.1: pxr/usd/pcp/layerStack.cpp,
//  pxr/usd/pcp/layerStack.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpLayerStack — the strength-ordered composition of a root layer (and an
// optional session layer) with their sublayers, plus the layer stack's
// relocates tables and composed expression variables. Port of OpenUSD v26.08
// pxr/usd/pcp/layerStack.{h,cpp}.
//
// Layer stacks are computed synchronously from a PcpLayerSource. When a layer
// has not been loaded yet the source throws PcpNeedsLayer; the computation is
// abandoned and retried by the async caller once the layer is available.

import { SdfLayerTree } from 'typescript-usd/sdf/layerTree'
import { Schema as SdfSchema } from 'typescript-usd/sdf'
import {
  type PcpError,
  PcpErrorType,
  PcpRelocateConflictReason,
  pcpErrorInvalidAuthoredRelocation,
  pcpErrorInvalidConflictingRelocation,
  pcpErrorInvalidSameTargetRelocations,
  pcpErrorInvalidSublayerAndOffsetCount,
  pcpErrorInvalidSublayerOffset,
  pcpErrorInvalidSublayerOwnership,
  pcpErrorInvalidSublayerPath,
  pcpErrorSublayerCycle,
} from './errors.ts'
import {
  type SdfLayerOffset, SDF_LAYER_OFFSET_IDENTITY, sdfLayerOffsetCompose,
  sdfLayerOffsetInverse, sdfLayerOffsetIsIdentity,
} from 'typescript-usd/sdf/layerOffset'
import {
  PcpExpressionVariables, type PcpExpressionVariablesDictionary,
  dictionariesEqual as expressionDictionariesEqual,
} from './expressionVariables.ts'
import type { PcpExpressionVariablesSource } from './expressionVariablesSource.ts'
import { TF_WARN, TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import type { PcpLayerStackChanges, PcpLifeboat } from './changes.ts'
import { PcpMapExpression, type PcpMapExpressionVariable } from './mapExpression.ts'
import { PcpMapFunction } from './mapFunction.ts'
import {
  type PcpLayer,
  type PcpLayerOpener,
  type PcpLayerSchema,
  type PcpLayerStackIdentifier,
  pcpLayerStackIdentifierEquals,
  pcpReadField,
} from './layerStackIdentifier.ts'
import { type PcpSite, pcpSite } from './site.ts'
import type { PcpLayerStackRegistry } from './layerStackRegistry.ts'
import {
  pcpEvaluateVariableExpression, pcpGetArgumentsForFileFormatTarget, pcpIsVariableExpression,
} from './utils.ts'
import { SdfPath } from 'typescript-usd/sdf/path'
import { _withPcpTraceScopeSync } from './traceScope.ts'
import { _sdfSplitLayerIdentifier, _sdfCreateLayerIdentifier } from 'typescript-usd/sdf/_internal'

// PCP_ENABLE_SESSION_OWNER_SUBLAYER_REORDERING (layerStack.cpp:55-58).
const PCP_ENABLE_SESSION_OWNER_SUBLAYER_REORDERING = new TfEnvSetting(
  'PCP_ENABLE_SESSION_OWNER_SUBLAYER_REORDERING', true,
  'When enabled, sublayer reordering is based on the session owner. ' +
  'When disabled, sublayer order always follows declaration order; session owner ' +
  'metadata is ignored.')

// PcpIsSessionOwnerSublayerReorderingEnabled (layerStack.h:384-386,
// layerStack.cpp:1076-1079).
export function pcpIsSessionOwnerSublayerReorderingEnabled(): boolean {
  return TfGetEnvSetting(PCP_ENABLE_SESSION_OWNER_SUBLAYER_REORDERING)
}

export interface PcpLayerStackLayer {
  readonly layer: PcpLayer
  // The layer's time offset relative to the layer stack root.
  readonly offset: SdfLayerOffset
}

/** Thrown by a PcpLayerSource when a layer must be loaded asynchronously. */
export class PcpNeedsLayer {
  constructor(readonly identifier: string) {}
}

/** Synchronous layer acquisition used by layer stack and prim indexing. */
export interface PcpLayerSource {
  // The layer for an anchored identifier, null when it cannot be opened.
  // Throws PcpNeedsLayer when the layer has not been loaded yet.
  findOrOpen(identifier: string): PcpLayer | null
  // SdfLayer::Find: an already-loaded layer, never loading.
  find?(identifier: string): PcpLayer | null
  // Load a layer findOrOpen reported missing.
  load?(identifier: string): Promise<void>
  // Retry layers that previously failed to load.
  forgetFailures?(): void
  // The commentary of the errors posted when identifier failed to open.
  failureMessages?(identifier: string): string
}

interface SublayerSourceInfo {
  readonly layer: PcpLayer
  readonly authoredSublayerPath: string
  readonly computedSublayerPath: string
}

// SdfLayer::GetTimeCodesPerSecond: authored timeCodesPerSecond, else
// framesPerSecond, else the schema fallback 24.
export function pcpLayerTimeCodesPerSecond(layer: PcpLayer): number {
  const tcps = layer.getField('/', 'timeCodesPerSecond')
  if (typeof tcps === 'number') return tcps
  const fps = layer.getField('/', 'framesPerSecond')
  return typeof fps === 'number' ? fps : 24
}

const hasTimeCodesPerSecond = (layer: PcpLayer): boolean =>
  typeof layer.getField('/', 'timeCodesPerSecond') === 'number'
const hasFramesPerSecond = (layer: PcpLayer): boolean =>
  typeof layer.getField('/', 'framesPerSecond') === 'number'

// _ShouldUseSessionTcps (layerStack.cpp:1036-1045).
function shouldUseSessionTcps(session: PcpLayer | undefined, root: PcpLayer): boolean {
  return session !== undefined && (hasTimeCodesPerSecond(session) ||
    (!hasTimeCodesPerSecond(root) && hasFramesPerSecond(session)))
}

function isValidOffset(offset: SdfLayerOffset): boolean {
  return Number.isFinite(offset.offset) && Number.isFinite(offset.scale)
}

export class PcpLayerStack {
  layers: PcpLayerStackLayer[] = []
  private _layerTree: SdfLayerTree<PcpLayer> | null = null
  private _sessionLayerTree: SdfLayerTree<PcpLayer> | null = null
  timeCodesPerSecond = 24
  expressionVariables: PcpExpressionVariables
  relocatesSourceToTarget = new Map<string, string>()
  relocatesTargetToSource = new Map<string, string>()
  incrementalRelocatesSourceToTarget = new Map<string, string>()
  incrementalRelocatesTargetToSource = new Map<string, string>()
  pathsToPrimsWithRelocates: string[] = []
  localErrors: PcpError[] = []
  mutedLayers = new Set<string>()
  expressionVariableDependencies = new Set<string>()
  /** @internal */ _sublayerSourceInfo: SublayerSourceInfo[] = []
  /** @internal */ _registry: PcpLayerStackRegistry | null = null
  private readonly _relocatesVariables = new Map<string, PcpMapExpressionVariable>()
  private readonly _isUsd: boolean

  // PcpLayerStack::PcpLayerStack (layerStack.cpp:1084-1148).
  constructor(readonly identifier: PcpLayerStackIdentifier, registry: PcpLayerStackRegistry) {
    this._isUsd = registry._isUsd()
    const rootLayerStackId = registry._getRootLayerStackIdentifier()
    const overrideId = (identifier.expressionVariablesOverrideSource
      ?.resolveLayerStackIdentifier(rootLayerStackId)) ?? rootLayerStackId
    const overrideLayerStack = !pcpLayerStackIdentifierEquals(overrideId, identifier)
      ? registry.find(overrideId) : undefined
    if (overrideLayerStack) {
      const composed = PcpExpressionVariables.compute(
        identifier, rootLayerStackId, overrideLayerStack.expressionVariables)
      this.expressionVariables = composed.equals(overrideLayerStack.expressionVariables)
        ? overrideLayerStack.expressionVariables : composed
    } else {
      this.expressionVariables = PcpExpressionVariables.compute(identifier, rootLayerStackId)
    }
    this._compute(registry)
  }

  isUsd(): boolean { return this._isUsd }

  get hasRelocates(): boolean { return this.incrementalRelocatesSourceToTarget.size > 0 }

  // OpenUSD v26.11.1 layerStack.cpp:1368-1378. Root and session trees
  // are separate; getLayers() includes both in strength order.
  getLayerTree(): SdfLayerTree<PcpLayer> | null { return this._layerTree }
  getSessionLayerTree(): SdfLayerTree<PcpLayer> | null { return this._sessionLayerTree }

  getLayers(): PcpLayer[] { return this.layers.map(entry => entry.layer) }

  // GetSessionLayers (layerStack.cpp:1333-1350).
  getSessionLayers(): PcpLayer[] {
    if (!this.identifier.sessionLayer) return []
    const rootIndex = this.layers.findIndex(entry => entry.layer === this.identifier.rootLayer)
    return rootIndex < 0 ? [] : this.layers.slice(0, rootIndex).map(entry => entry.layer)
  }

  // HasLayer (layerStack.cpp:1415-1432).
  hasLayer(layer: PcpLayer): boolean {
    return this.layers.some(entry => entry.layer === layer)
  }

  // GetLayerOffsetForLayer (layerStack.cpp:1364-1407): null for identity.
  getLayerOffsetForLayer(layerOrIndex: PcpLayer | number): SdfLayerOffset | null {
    const entry = typeof layerOrIndex === 'number'
      ? this.layers[layerOrIndex]
      : this.layers.find(e => e.layer === layerOrIndex)
    if (!entry || sdfLayerOffsetIsIdentity(entry.offset)) return null
    return entry.offset
  }

  // GetExpressionForRelocatesAtPath (layerStack.cpp:1464-1498).
  getExpressionForRelocatesAtPath(path: SdfPath | string): PcpMapExpression {
    if (this._isUsd && !this.hasRelocates) return PcpMapExpression.null()
    const key = typeof path === 'string' ? path : path.pathString
    let variable = this._relocatesVariables.get(key)
    if (!variable) {
      variable = PcpMapExpression.newVariable(filterRelocationsForPath(this, key))
      this._relocatesVariables.set(key, variable)
    }
    return variable.getExpression()
  }

  /** @internal Re-derive relocation variables after a relocates change. */
  _updateRelocatesVariables(): void {
    for (const [path, variable] of this._relocatesVariables) {
      variable.setValue(filterRelocationsForPath(this, path))
    }
  }

  // _BlowLayers (layerStack.cpp:1507-1520).
  /** @internal */
  _blowLayers(): void {
    this.layers = []
    this._layerTree = null
    this._sessionLayerTree = null
    this._sublayerSourceInfo = []
    this.mutedLayers = new Set()
    this.expressionVariableDependencies = new Set()
  }

  // _BlowRelocations (layerStack.cpp:1522-1530).
  /** @internal */
  _blowRelocations(): void {
    this.relocatesSourceToTarget = new Map()
    this.relocatesTargetToSource = new Map()
    this.incrementalRelocatesSourceToTarget = new Map()
    this.incrementalRelocatesTargetToSource = new Map()
    this.pathsToPrimsWithRelocates = []
  }

  /** @internal Recompute relocations from the current layers. */
  _computeRelocations(errors: PcpError[]): void {
    const rootSite = pcpSite(this.identifier, '/')
    const r = computeRelocations(this.layers, rootSite, errors)
    this.relocatesSourceToTarget = r.combinedS2T
    this.relocatesTargetToSource = r.combinedT2S
    this.incrementalRelocatesSourceToTarget = r.incrementalS2T
    this.incrementalRelocatesTargetToSource = r.incrementalT2S
    this.pathsToPrimsWithRelocates = r.primPaths
  }

  // Apply (layerStack.cpp:1159-1319): invalidate and immediately recompute
  // as the changes require. Recomputation reads the registry's layer source
  // and may throw PcpNeedsLayer before modifying this layer stack.
  apply(changes: PcpLayerStackChanges, lifeboat: PcpLifeboat): void {
    const registry = this._registry
    if (!registry) return
    const rootLayerStackId = registry._getRootLayerStackIdentifier()
    if (changes.didChangeSignificantly || changes.didChangeExpressionVariables ||
        changes._didChangeExpressionVariablesSource) {
      const updateExpressionVariables = (
        newExprVars: PcpExpressionVariablesDictionary,
        newSource: PcpExpressionVariablesSource,
      ): void => {
        const newSourceId = newSource.resolveLayerStackIdentifier(rootLayerStackId)
        if (pcpLayerStackIdentifierEquals(newSourceId, this.identifier)) {
          if (this.expressionVariables.getSource().equals(newSource)) {
            this.expressionVariables.setVariables(newExprVars)
          } else {
            this.expressionVariables = new PcpExpressionVariables(newSource, newExprVars)
          }
        } else {
          const overrideLayerStack = registry.find(newSourceId)
          if (overrideLayerStack) {
            this.expressionVariables = overrideLayerStack.expressionVariables
            if (!expressionDictionariesEqual(newExprVars, this.expressionVariables.getVariables())) {
              this.expressionVariables.setVariables(newExprVars)
            }
          } else {
            this.expressionVariables = new PcpExpressionVariables(newSource, newExprVars)
          }
        }
      }
      if (changes.didChangeSignificantly) {
        const newExprVars = PcpExpressionVariables.compute(this.identifier, rootLayerStackId)
        updateExpressionVariables(newExprVars.getVariables(), newExprVars.getSource())
      } else {
        updateExpressionVariables(
          changes.didChangeExpressionVariables
            ? changes.newExpressionVariables : this.expressionVariables.getVariables(),
          changes._didChangeExpressionVariablesSource
            ? changes._newExpressionVariablesSource! : this.expressionVariables.getSource())
      }
    }

    if (changes.didChangeLayers || changes.didChangeLayerOffsets) {
      for (const { layer } of this.layers) lifeboat.retain(layer)
      // _BlowLayers/_BlowRelocations then _Compute: _compute builds the new
      // layers before replacing any state, so a layer load retry is safe.
      this._compute(registry)
      this._updateRelocatesVariables()
    } else if (changes.didChangeSignificantly || changes.didChangeRelocates) {
      // Keep existing errors that are not relocation errors.
      const errors = this.localErrors.filter(err => !isRelocationError(err))
      if (changes.didChangeSignificantly) {
        this._blowRelocations()
        this._computeRelocations(errors)
      } else {
        this.relocatesSourceToTarget = new Map(changes.newRelocatesSourceToTarget)
        this.relocatesTargetToSource = new Map(changes.newRelocatesTargetToSource)
        this.incrementalRelocatesSourceToTarget = new Map(changes.newIncrementalRelocatesSourceToTarget)
        this.incrementalRelocatesTargetToSource = new Map(changes.newIncrementalRelocatesTargetToSource)
        this.pathsToPrimsWithRelocates = [...changes.newRelocatesPrimPaths]
        errors.push(...changes.newRelocatesErrors)
      }
      this._updateRelocatesVariables()
      this.localErrors = errors
    }
  }

  // _Compute (layerStack.cpp:1532-1674).
  /** @internal */
  _compute(registry: PcpLayerStackRegistry): void {
    const errors: PcpError[] = []
    const seenLayers = new Set<PcpLayer>()
    const root = this.identifier.rootLayer as PcpLayer
    const session = this.identifier.sessionLayer as PcpLayer | undefined
    const rootTcps = pcpLayerTimeCodesPerSecond(root)
    let rootLayerOffset: SdfLayerOffset = SDF_LAYER_OFFSET_IDENTITY
    this.timeCodesPerSecond = rootTcps
    let sessionOwner = ''
    const layers: PcpLayerStackLayer[] = []
    const sublayerSourceInfo: SublayerSourceInfo[] = []
    const muted = new Set<string>()
    const exprDeps = new Set<string>()
    let sessionLayerTree: SdfLayerTree<PcpLayer> | null = null
    const build = (layer: PcpLayer, offset: SdfLayerOffset, tcps: number, owner: string): SdfLayerTree<PcpLayer> =>
      this._buildLayerStack(layer, offset, tcps, owner, registry, seenLayers,
        layers, sublayerSourceInfo, muted, exprDeps, errors)

    if (session) {
      const canonical = registry.isLayerMuted(session, session.filePath)
      if (canonical !== undefined) {
        muted.add(canonical)
      } else {
        const sessionTcps = pcpLayerTimeCodesPerSecond(session)
        let sessionLayerOffset: SdfLayerOffset = SDF_LAYER_OFFSET_IDENTITY
        if (shouldUseSessionTcps(session, root)) {
          this.timeCodesPerSecond = sessionTcps
          rootLayerOffset = { offset: 0, scale: this.timeCodesPerSecond / rootTcps }
        } else {
          sessionLayerOffset = { offset: 0, scale: this.timeCodesPerSecond / sessionTcps }
        }
        const sessionStart = layers.length
        sessionLayerTree = build(session, sessionLayerOffset, sessionTcps, '')
        // FindSessionOwner over the session layer tree: the first layer, in
        // tree pre-order, that authors sessionOwner (layerStack.cpp:1620-1642).
        for (let i = sessionStart;
          pcpIsSessionOwnerSublayerReorderingEnabled() && i < layers.length; i++) {
          const value = layers[i]!.layer.getField('/', 'sessionOwner')
          if (typeof value === 'string') {
            sessionOwner = value
            break
          }
        }
      }
    }
    const layerTree = build(root, rootLayerOffset, rootTcps, sessionOwner)

    this.layers = layers
    this._layerTree = layerTree
    this._sessionLayerTree = sessionLayerTree
    this._sublayerSourceInfo = sublayerSourceInfo
    this.mutedLayers = muted
    this.expressionVariableDependencies = exprDeps
    this._registry?._setLayers(this)
    const holder = registry._traceHolder
    if (holder) {
      _withPcpTraceScopeSync(holder, 'typescript-usd:computeRelocations', () => this._computeRelocations(errors))
    } else {
      this._computeRelocations(errors)
    }
    this.localErrors = errors
  }

  // _BuildLayerStack (layerStack.cpp:1676-1888).
  private _buildLayerStack(
    layer: PcpLayer, offset: SdfLayerOffset, layerTcps: number, sessionOwner: string,
    registry: PcpLayerStackRegistry, seenLayers: Set<PcpLayer>,
    out: PcpLayerStackLayer[], sourceInfo: SublayerSourceInfo[],
    muted: Set<string>, exprDeps: Set<string>, errors: PcpError[],
  ): SdfLayerTree<PcpLayer> {
    seenLayers.add(layer)
    out.push({ layer, offset })

    const authored = layer.getField('/', 'subLayers')
    const sublayers: string[] = Array.isArray(authored) ? [...(authored as string[])] : []
    let sublayerOffsets = (layer.getField('/', 'subLayerOffsets') as SdfLayerOffset[] | undefined) ?? []
    const rootSite = pcpSite(this.identifier, '/')
    // OpenUSD v26.11.1 layerStack.cpp:1730-1748: mismatched sublayer and offset counts are an
    // error; every sublayer then uses an identity offset.
    if (sublayers.length !== sublayerOffsets.length) {
      errors.push(pcpErrorInvalidSublayerAndOffsetCount({
        rootSite, layer, sublayerCount: sublayers.length, offsetCount: sublayerOffsets.length,
      }))
      sublayerOffsets = sublayers.map(() => SDF_LAYER_OFFSET_IDENTITY)
    }

    for (let i = 0; i < sublayers.length; i++) {
      if (pcpIsVariableExpression(sublayers[i]!)) {
        sublayers[i] = pcpEvaluateVariableExpression(
          sublayers[i]!, this.expressionVariables, 'sublayer', layer,
          SdfPath.absoluteRootPath, exprDeps, errors)
        if (sublayers[i] === '') continue
      }
      const canonical = registry.isLayerMuted(layer, sublayers[i]!)
      if (canonical !== undefined) {
        muted.add(canonical)
        sublayers[i] = ''
      }
    }

    interface Info { layer: PcpLayer; offset: SdfLayerOffset; tcps: number }
    const sublayerInfo: Info[] = []
    for (let i = 0; i < sublayers.length; i++) {
      const authoredPath = sublayers[i]!
      if (authoredPath === '') continue
      const { assetPath, args } = _sdfSplitLayerIdentifier(authoredPath)
      const anchored = layer.resolveAsset(assetPath)
      const sublayerPath = anchored ? _sdfCreateLayerIdentifier(anchored, args) : ''
      sourceInfo.push({ layer, authoredSublayerPath: authoredPath, computedSublayerPath: sublayerPath })
      // Sublayers open with the registry's file format target unless the
      // authored path specifies one (layerStack.cpp:1553-1555, 1731-1741).
      const openArgs = new Map(args)
      pcpGetArgumentsForFileFormatTarget(args, registry._getFileFormatTarget(), openArgs)
      const sublayer = sublayerPath
        ? registry._layerSource.findOrOpen(_sdfCreateLayerIdentifier(anchored, openArgs))
        : null
      if (!sublayer) {
        errors.push(pcpErrorInvalidSublayerPath({
          rootSite, layer, sublayerPath,
          messages: sublayerPath
            ? registry._layerSource.failureMessages?.(_sdfCreateLayerIdentifier(anchored, openArgs)) ?? ''
            : '',
        }))
        continue
      }
      if (seenLayers.has(sublayer)) {
        errors.push(pcpErrorSublayerCycle({ rootSite, layer, sublayer }))
        continue
      }
      let sublayerOffset = sublayerOffsets[i] ?? SDF_LAYER_OFFSET_IDENTITY
      const inverse = sdfLayerOffsetInverse(sublayerOffset)
      if (sublayerOffset.scale < 0 || !isValidOffset(sublayerOffset) ||
          !inverse || !isValidOffset(inverse)) {
        errors.push(pcpErrorInvalidSublayerOffset({
          rootSite, layer, sublayer, offset: sublayerOffset,
        }))
        sublayerOffset = SDF_LAYER_OFFSET_IDENTITY
      }
      const sublayerTcps = pcpLayerTimeCodesPerSecond(sublayer)
      if (layerTcps !== sublayerTcps) {
        sublayerOffset = {
          offset: sublayerOffset.offset,
          scale: sublayerOffset.scale * layerTcps / sublayerTcps,
        }
      }
      sublayerInfo.push({
        layer: sublayer, offset: sdfLayerOffsetCompose(offset, sublayerOffset), tcps: sublayerTcps,
      })
    }

    // _ApplyOwnedSublayerOrder (layerStack.cpp:101-162), applied only when
    // reordering is enabled (layerStack.cpp:1859-1863).
    if (pcpIsSessionOwnerSublayerReorderingEnabled() &&
        sessionOwner && layer.getField('/', 'hasOwnedSubLayers') === true) {
      const isOwned = (info: Info): boolean => info.layer.getField('/', 'owner') === sessionOwner
      const owned = sublayerInfo.filter(isOwned)
      const reordered = [...owned, ...sublayerInfo.filter(info => !isOwned(info))]
      sublayerInfo.splice(0, sublayerInfo.length, ...reordered)
      if (owned.length > 1) {
        errors.push(pcpErrorInvalidSublayerOwnership({
          rootSite, owner: sessionOwner, layer, sublayers: owned.map(info => info.layer),
        }))
      }
    }

    // OpenUSD v26.11.1 layerStack.cpp:1913-1935 builds children only after
    // owned-sublayer reordering and preserves repeated noncyclic occurrences.
    const children = sublayerInfo.map(info =>
      this._buildLayerStack(info.layer, info.offset, info.tcps, sessionOwner, registry,
        seenLayers, out, sourceInfo, muted, exprDeps, errors))
    seenLayers.delete(layer)
    return SdfLayerTree.new(layer, children, offset)
  }
}

// The PcpErrorRelocationBase subclasses (errors.h).
function isRelocationError(err: PcpError): boolean {
  return err.errorType === PcpErrorType.InvalidAuthoredRelocation ||
    err.errorType === PcpErrorType.InvalidConflictingRelocation ||
    err.errorType === PcpErrorType.InvalidSameTargetRelocations
}

// Pcp_ComputeRelocationsForLayerStack (layerStack.cpp:497-560).
export function pcpComputeRelocationsForLayerStack(layerStack: PcpLayerStack): {
  relocatesSourceToTarget: Map<string, string>
  relocatesTargetToSource: Map<string, string>
  incrementalRelocatesSourceToTarget: Map<string, string>
  incrementalRelocatesTargetToSource: Map<string, string>
  relocatesPrimPaths: string[]
  errors: PcpError[]
} {
  const errors: PcpError[] = []
  const r = computeRelocations(layerStack.layers, pcpSite(layerStack.identifier, '/'), errors)
  return {
    relocatesSourceToTarget: r.combinedS2T,
    relocatesTargetToSource: r.combinedT2S,
    incrementalRelocatesSourceToTarget: r.incrementalS2T,
    incrementalRelocatesTargetToSource: r.incrementalT2S,
    relocatesPrimPaths: r.primPaths,
    errors,
  }
}

// Pcp_NeedToRecomputeDueToAssetPathChange(layerStack) (layerStack.cpp:1008-1026).
export function pcpLayerStackNeedsRecomputeDueToAssetPathChange(layerStack: PcpLayerStack): boolean {
  for (const info of layerStack._sublayerSourceInfo) {
    const { assetPath, args } = _sdfSplitLayerIdentifier(info.authoredSublayerPath)
    const anchored = info.layer.resolveAsset(assetPath)
    const computed = anchored ? _sdfCreateLayerIdentifier(anchored, args) : ''
    if (computed !== info.computedSublayerPath) return true
  }
  return false
}

// Pcp_NeedToRecomputeLayerStackTimeCodesPerSecond (layerStack.cpp:1047-1074).
export function pcpNeedToRecomputeLayerStackTimeCodesPerSecond(
  layerStack: PcpLayerStack, changedLayer: PcpLayer,
): boolean {
  const session = layerStack.identifier.sessionLayer as PcpLayer | undefined
  const root = layerStack.identifier.rootLayer as PcpLayer
  if (changedLayer !== session && changedLayer !== root) return false
  const newTcps = shouldUseSessionTcps(session, root)
    ? pcpLayerTimeCodesPerSecond(session!) : pcpLayerTimeCodesPerSecond(root)
  return newTcps !== layerStack.timeCodesPerSecond
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

// True if `a` is `b` or an ancestor of `b` (a prefix at a path boundary).
function isAncestorOrSelf(a: string, b: string): boolean {
  return a === b || b.startsWith(a + '/')
}

function replacePrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix
  if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length)
  return path
}

type RelocatesLayerStack = Pick<
  PcpLayerStack, 'relocatesSourceToTarget' | 'incrementalRelocatesSourceToTarget'>

// Pcp_IsValidRelocatesEntry (layerStack.cpp:164-233): validation of a single
// relocate, used both when composing and when editing relocates. Returns the
// error message, or null when the entry is valid.
export function pcpIsValidRelocatesEntry(source: string, target: string): string | null {
  const invalidPathMessage = (p: string): string | null => {
    const path = SdfPath.fromString(p)
    if (!path.isAbsolutePath()) return 'Relocates must use absolute paths.'
    if (!path.isPrimPath()) {
      // A variant selection is the more important problem to report.
      return path.isPrimVariantSelectionPath() ? 'Relocates cannot have any variant selections.'
        : 'Only prims can be relocated.'
    }
    if (path.containsPrimVariantSelection()) return 'Relocates cannot have any variant selections.'
    return null
  }
  if (!source) return 'Relocates source paths cannot be empty.'
  const sourceMsg = invalidPathMessage(source)
  if (sourceMsg !== null) return sourceMsg
  // Empty target (relocate-to-none / delete) is valid.
  if (!target) return null
  const targetMsg = invalidPathMessage(target)
  if (targetMsg !== null) return targetMsg
  if (source === target) return 'The target of a relocate cannot be the same as its source.'
  if (isAncestorOrSelf(source, target)) return 'The target of a relocate cannot be a descendant of its source.'
  if (isAncestorOrSelf(target, source)) return 'The target of a relocate cannot be an ancestor of its source.'
  return null
}

// _IsValidRelocatesEntryForComposing (layerStack.cpp:390-410): root prims
// are never the source of a relocate when composing, as their parent is the
// pseudo-root, which can never have composition arcs. The target can be a
// root prim. An entry that fails is ignored, and recorded as
// PcpErrorInvalidAuthoredRelocation with this message.
function invalidRelocatesEntryMessage(source: string, target: string): string | null {
  const message = pcpIsValidRelocatesEntry(source, target)
  if (message !== null) return message
  if (parentPath(source) === '/') return 'Root prims cannot be the source of a relocate.'
  return null
}

// PCP_ENABLE_LEGACY_RELOCATES_BEHAVIOR (layerStack.cpp:47-53). Applies only
// to a layer stack whose layers support prim relocates; USD layers never do.
const PCP_ENABLE_LEGACY_RELOCATES_BEHAVIOR = new TfEnvSetting(
  'PCP_ENABLE_LEGACY_RELOCATES_BEHAVIOR', true,
  'Enables the legacy behavior of ignoring composition errors that would ' +
  'cause us to reject conflicting relocates that are invalid within the ' +
  'context of all other relocates on the layer stack. This only applies to ' +
  'non-USD caches/layer stacks; the legacy behavior cannot be enabled in USD ' +
  'mode')

// Pcp_Fields->primRelocates (pxr/usd/pcp/utils.h:32): the legacy prim-level
// relocates field. SdfSchema does not register it (only layerRelocates,
// schema.cpp:814), so .usda and .usdc layers cannot carry prim relocates.
const PRIM_RELOCATES = 'relocates'

// SdfLayer::GetSchema (layer.cpp:996).
// FAITHFULNESS-DEBT(sdf-file-format-schemas): upstream each SdfFileFormat
// owns an SdfSchemaBase (SdfFileFormat::GetSchema, pxr/usd/sdf/fileFormat.h)
// that SdfLayer::GetSchema returns; this port has the single SdfSchema
// (SdfSpec.getSchema, sdf/src/spec.ts) and SdfLayer has no getSchema, so
// every Sdf layer answers with SdfSchema here. Replace by porting per-format
// schemas (SdfFileFormat::GetSchema, SdfLayer::GetSchema).
function pcpLayerSchema(layer: PcpLayer): PcpLayerSchema {
  return layer.getSchema?.() ?? SdfSchema.getInstance()
}

// The `_supportsPrimRelocates` lambda of
// Pcp_ComputeRelocationsForLayerStackWorkspace::Compute (layerStack.cpp:298-311),
// with PcpLayerStack::GetSchemaForAllLayers (layerStack.cpp:1595-1596,
// 1718-1719): the schema when every layer shares one, else null.
function layerStackSupportsPrimRelocates(layers: readonly PcpLayerStackLayer[]): boolean {
  const first = layers[0]
  const schema = first ? pcpLayerSchema(first.layer) : SdfSchema.getInstance()
  const sharedSchema = layers.every(({ layer }) => pcpLayerSchema(layer) === schema)
  return sharedSchema ? schema.isRegistered(PRIM_RELOCATES) : true
}

type RelocatesEntries = Record<string, string> | readonly (readonly [string, string])[]
const relocatesEntries = (value: RelocatesEntries): (readonly [string, string])[] =>
  Array.isArray(value) ? [...value] : Object.entries(value)

// Pcp_ComputeRelocationsForLayerStackWorkspace::Compute(layerStack)
// (layerStack.cpp:290-331): _CollectRelocatesForLayer per layer (strong to
// weak; a stronger layer's relocate for the same source wins), then
// _ValidateAndRemoveConflictingRelocates, _ComputeSourceOriginForTargetIfNeeded
// per surviving relocate, and _ConformLegacyRelocates.
function computeRelocations(
  layers: readonly PcpLayerStackLayer[], rootSite: PcpSite, errors: PcpError[],
): ReturnType<typeof computeRelocationsFrom> {
  const supportsPrimRelocates = layerStackSupportsPrimRelocates(layers)
  return computeRelocationsFrom((addRelocate, addPrimWithRelocates) => {
    for (const { layer } of layers) {
      // _CollectRelocatesForLayer (layerStack.cpp:347-389).
      // FAITHFULNESS-DEBT(sdf-layer-hints-relocates): upstream returns here
      // when !layer->GetHints().mightHaveRelocates (layerStack.cpp:352-354),
      // an optimization only; this port reads the fields of every layer.

      // _CollectLayerRelocates (layerStack.cpp:469-481): layer metadata
      // relocates usurp any prim relocates authored on the layer.
      const layerRel = pcpReadField(layer, '/', 'layerRelocates') as RelocatesEntries | undefined
      if (layerRel) {
        for (const [s, t] of relocatesEntries(layerRel)) addRelocate(s, t, layer, '/')
        continue
      }
      if (!supportsPrimRelocates) continue

      // Depth-first over namespace, as upstream's path stack (children pushed
      // in order, popped from the back).
      const pathStack: string[] = []
      const addChildrenToPathStack = (primPath: string): void => {
        const children = pcpReadField(layer, primPath, 'primChildren') as readonly string[] | undefined
        for (const name of children ?? []) pathStack.push(primPath === '/' ? `/${name}` : `${primPath}/${name}`)
      }
      addChildrenToPathStack('/')
      while (pathStack.length) {
        const primPath = pathStack.pop()!
        // _CollectPrimRelocates (layerStack.cpp:483-497): paths are made
        // absolute against the owning prim (_CollectRelocates,
        // layerStack.cpp:426-430).
        const primRel = pcpReadField(layer, primPath, PRIM_RELOCATES) as RelocatesEntries | undefined
        if (primRel) {
          const anchor = SdfPath.fromString(primPath)
          const absolute = (p: string): string =>
            p ? SdfPath.fromString(p).makeAbsolutePath(anchor).pathString : p
          for (const [s, t] of relocatesEntries(primRel)) addRelocate(absolute(s), absolute(t), layer, primPath)
          addPrimWithRelocates(primPath)
        }
        addChildrenToPathStack(primPath)
      }
    }
  }, rootSite, errors, supportsPrimRelocates)
}

/**
 * Pcp_BuildRelocateMap (layerStack.cpp:881-898): the validated relocates
 * (authored source to target) of the given layer relocates, as a layer stack
 * in USD mode would compose them.
 */
export function pcpBuildRelocateMap(
  layerRelocates: ReadonlyArray<readonly [PcpLayer, ReadonlyArray<readonly [string, string]>]>,
  errors: PcpError[] = [],
): Map<string, string> {
  const { incrementalS2T } = computeRelocationsFrom(addRelocate => {
    for (const [layer, relocates] of layerRelocates) {
      for (const [s, t] of relocates) addRelocate(s, t, layer, '/')
    }
  }, EMPTY_SITE, errors, false)
  return incrementalS2T
}

// PcpSite(): relocate map errors computed without a layer stack have no root
// site (_GetErrorRootSite, layerStack.cpp).
const EMPTY_SITE: PcpSite = { layerStack: { rootLayer: null as unknown as PcpLayer }, path: '' }

type AddRelocate = (source: string, target: string | undefined, layer: PcpLayer, owningPath: string) => void

// Pcp_ComputeRelocationsForLayerStackWorkspace::Compute (layerStack.cpp:290-348)
// over the relocates the collector adds. The collector reports each prim
// with authored prim relocates (allPrimPathsWithAuthoredRelocates,
// layerStack.cpp:494); layer relocates add none.
function computeRelocationsFrom(
  collect: (addRelocate: AddRelocate, addPrimWithRelocates: (primPath: string) => void) => void,
  rootSite: PcpSite, errors: PcpError[], supportsPrimRelocates: boolean,
): {
  combinedS2T: Map<string, string>
  combinedT2S: Map<string, string>
  incrementalS2T: Map<string, string>
  incrementalT2S: Map<string, string>
  primPaths: string[]
} {
  const processed = new Map<string, string>()   // authored source → target
  // Authoring provenance per surviving relocate (the layer + prim that
  // authored it), carried into the conflict errors below.
  const relocateInfo = new Map<string, { layer: PcpLayer; owningPath: string }>()
  const primPaths = new Set<string>()
  const addRelocate = (
    source: string, target: string | undefined, layer: PcpLayer, owningPath: string,
  ): void => {
    // A `<>`/None target parses as undefined — normalize to '' (relocate-to-
    // none = delete the source) so downstream path ops never see undefined.
    const t = target ?? ''
    // Invalid entries are dropped (with composition continuing through the
    // original paths) and recorded as PcpErrorInvalidAuthoredRelocation
    // (errors.h:726); see invalidRelocatesEntryMessage.
    const invalidMsg = invalidRelocatesEntryMessage(source, t)
    if (invalidMsg !== null) {
      errors.push(pcpErrorInvalidAuthoredRelocation({
        rootSite, sourcePath: source, targetPath: t, layer, owningPath, messages: invalidMsg,
      }))
      return
    }
    if (processed.has(source)) return            // stronger layer already won
    processed.set(source, t)
    relocateInfo.set(source, { layer, owningPath })
  }
  collect(addRelocate, primPath => { primPaths.add(primPath) })
  // Legacy (non-USD) relocates skip the conflict validation
  // (layerStack.cpp:643-649) and are conformed to "most relocated" sources
  // (_ConformLegacyRelocates, layerStack.cpp:520-523).
  const legacyRelocates = supportsPrimRelocates && TfGetEnvSetting(PCP_ENABLE_LEGACY_RELOCATES_BEHAVIOR)

  // _ValidateAndRemoveConflictingRelocates (layerStack.cpp:593): validate each
  // relocate against ALL the others, then remove every invalid one. Removal
  // happens after the full scan so each relocate is judged against the complete
  // authored set, and an invalid/conflicting relocate is IGNORED — ancestral
  // opinions stay visible through the original, un-relocated paths — while
  // recording PcpErrorInvalidSameTargetRelocations /
  // PcpErrorInvalidConflictingRelocation for each conflict found.
  {
    const targetToSource = new Map<string, string>()  // first source claiming each target
    const invalid = new Set<string>()                 // source paths to remove
    // Every source claiming a duplicated target, grouped so each target yields
    // ONE PcpErrorInvalidSameTargetRelocations listing all its sources.
    const dupSources = new Map<string, Set<string>>()
    const conflictErrors: ReturnType<typeof pcpErrorInvalidConflictingRelocation>[] = []
    const infoOf = (s: string) => relocateInfo.get(s)!
    // The relocate keyed by `source` conflicts with the one keyed by
    // `conflictSource` (errors.h:762).
    const conflictError = (
      source: string, conflictSource: string, conflictReason: PcpRelocateConflictReason,
    ): void => {
      const info = infoOf(source)
      const conflictInfo = infoOf(conflictSource)
      conflictErrors.push(pcpErrorInvalidConflictingRelocation({
        rootSite,
        sourcePath: source, targetPath: processed.get(source)!,
        layer: info.layer, owningPath: info.owningPath,
        conflictSourcePath: conflictSource, conflictTargetPath: processed.get(conflictSource)!,
        conflictLayer: conflictInfo.layer, conflictOwningPath: conflictInfo.owningPath,
        conflictReason,
      }))
    }
    for (const [source, target] of [...processed].sort(([a], [b]) => a.localeCompare(b))) {
      if (target) {
        // Duplicate target: EVERY relocate naming this target is invalid.
        const existing = targetToSource.get(target)
        if (existing !== undefined) {
          invalid.add(existing); invalid.add(source)
          let set = dupSources.get(target)
          if (!set) dupSources.set(target, set = new Set([existing]))
          set.add(source)
        }
        else targetToSource.set(target, source)
      }
      if (legacyRelocates) continue
      if (target) {
        // The target of a relocate cannot be the source of another relocate in
        // the same layer stack (no A→B, B→C chains): both are invalid.
        if (processed.has(target)) {
          invalid.add(source); invalid.add(target)
          conflictError(source, target, PcpRelocateConflictReason.TargetIsConflictSource)
          conflictError(target, source, PcpRelocateConflictReason.SourceIsConflictTarget)
        }
        // The target must be a fully relocated path: no ancestor of it may be
        // the source of another relocate.
        for (let p = parentPath(target); p !== '/'; p = parentPath(p)) {
          if (processed.has(p)) {
            invalid.add(source)
            conflictError(source, p, PcpRelocateConflictReason.TargetIsConflictSourceDescendant)
          }
        }
      }
      // The source must be fully relocated with respect to all other
      // relocates: no ancestor of it may be the source of another relocate.
      // The walk stops before root-prim paths (a root prim cannot be a
      // relocate source anyway — upstream's !pathToCheck.IsRootPrimPath()).
      for (let p = parentPath(source); p !== '/' && parentPath(p) !== '/'; p = parentPath(p)) {
        if (processed.has(p)) {
          invalid.add(source)
          conflictError(source, p, PcpRelocateConflictReason.SourceIsConflictSourceDescendant)
        }
      }
    }
    for (const [target, sources] of [...dupSources].sort(([a], [b]) => a.localeCompare(b))) {
      errors.push(pcpErrorInvalidSameTargetRelocations({
        // OpenUSD v26.05 errors.cpp:851 receives this aggregate layer-stack
        // error without a prim path, unlike the per-relocate conflict errors.
        rootSite: { ...rootSite, path: '' },
        targetPath: target,
        sources: [...sources].sort().map((s) => ({ sourcePath: s, ...infoOf(s) })),
      }))
    }
    // OpenUSD v26.08 layerStack.cpp:684-733 emits same-target aggregates
    // first, then conflict errors sorted by (source, reason, conflict source).
    conflictErrors.sort((a, b) =>
      a.sourcePath.localeCompare(b.sourcePath) ||
      a.conflictReason - b.conflictReason ||
      a.conflictSourcePath.localeCompare(b.conflictSourcePath))
    errors.push(...conflictErrors)
    for (const source of invalid) processed.delete(source)
  }

  // Every processed relocate populates the bi-directional maps, including
  // relocates to an empty target (layerStack.cpp:934-944); emplace keeps
  // the first entry for a repeated key.
  const emplace = (map: Map<string, string>, key: string, value: string): void => {
    if (!map.has(key)) map.set(key, value)
  }

  // _ComputeSourceOriginForTargetIfNeeded (layerStack.cpp:756-815): walk
  // ancestors of the source for one that is itself a relocate target; if
  // found, un-relocate the source prefix through that ancestor's origin
  // (recursive). Resolves nested relocates. The target map is
  // targetPathToProcessedRelocateMap: the valid relocates by target.
  const targetToSource = new Map<string, string>()
  for (const [s, t] of processed) if (t) emplace(targetToSource, t, s)
  const origins = new Map<string, string>()   // computedSourceOrigin by source
  const computeOrigin = (source: string): string => {
    const cached = origins.get(source)
    if (cached !== undefined) return cached
    origins.set(source, source)   // default + recursion guard
    for (let a: string = source; a !== '/'; a = parentPath(a)) {
      const ancSource = targetToSource.get(a)
      if (ancSource !== undefined) {
        origins.set(source, replacePrefix(source, a, computeOrigin(ancSource)))
        break
      }
    }
    return origins.get(source)!
  }
  for (const source of processed.keys()) computeOrigin(source)

  if (legacyRelocates) conformLegacyRelocates(processed, origins)

  const incrementalS2T = new Map<string, string>()
  const incrementalT2S = new Map<string, string>()
  const combinedS2T = new Map<string, string>()
  const combinedT2S = new Map<string, string>()
  for (const [source, target] of processed) {
    emplace(incrementalS2T, source, target)
    emplace(incrementalT2S, target, source)
    const origin = origins.get(source)!
    emplace(combinedT2S, target, origin)
    emplace(combinedS2T, origin, target)
  }

  // SdfPathSet order (layerStack.cpp:963-965).
  const sortedPrimPaths = [...primPaths]
    .sort((a, b) => SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b)))
  return { combinedS2T, combinedT2S, incrementalS2T, incrementalT2S, primPaths: sortedPrimPaths }
}

// _ConformLegacyRelocates (layerStack.cpp:500-591): non-USD assets may name
// a relocate source by its unrelocated path (/Prim/Foo/A when /Prim/Foo ->
// /Prim/Bar is also authored) or by a partly or fully relocated one
// (/Prim/Bar/A). Move each relocate to its "most ancestrally relocated"
// source: its computed source origin under the target of the relocate with
// the longest computed origin that is a proper ancestor of it. `processed`
// maps source to target and `origins` source to computed source origin;
// both are rekeyed in place.
function conformLegacyRelocates(processed: Map<string, string>, origins: Map<string, string>): void {
  const elementCount = (p: string): number => (p === '/' ? 0 : p.split('/').length - 1)
  const moves: [string, string][] = []
  for (const source of processed.keys()) {
    const origin = origins.get(source)!
    // Start with the parent of the origin: the closest relocate moving our
    // origin that is not this relocate itself.
    const originParent = parentPath(origin)
    let best: string | undefined
    let bestCount = 0
    for (const other of processed.keys()) {
      const otherOrigin = origins.get(other)!
      const count = elementCount(otherOrigin)
      if (count > bestCount && isAncestorOrSelf(otherOrigin, originParent)) {
        best = other
        bestCount = count
      }
    }
    if (best === undefined) continue
    const mostRelocatedSource = replacePrefix(origin, origins.get(best)!, processed.get(best)!)
    if (mostRelocatedSource !== source) moves.push([source, mostRelocatedSource])
  }
  for (const [oldSource, newSource] of moves) {
    const oldTarget = processed.get(oldSource)!
    const existingTarget = processed.get(newSource)
    if (existingTarget === undefined) {
      processed.set(newSource, oldTarget)
      origins.set(newSource, origins.get(oldSource)!)
    } else if (existingTarget !== oldTarget) {
      // Different authored sources can name the same "most relocated"
      // source; legacy relocates warn and keep the relocate that claimed it
      // first (layerStack.cpp:569-585).
      TF_WARN(`Couldn't conform relocate from ${oldSource} to ${oldTarget} to use the ` +
        `correct source path ${newSource} because a relocate from ${newSource} to ` +
        `${existingTarget} already exists. This relocate will be ignored.`)
    }
    processed.delete(oldSource)
    origins.delete(oldSource)
  }
}

// True if `source` is `path` or a descendant of `path` (SdfPath::HasPrefix(path)).
// Upstream iterates the sorted relocates subrange [lower_bound(path), …) while
// `i->first.HasPrefix(path)`; on an unsorted JS Map we filter by the same
// prefix predicate, which selects the identical set of pairs.
function hasPrefix(source: string, path: string): boolean {
  return source === path || source.startsWith(path + '/')
}

// Build the PcpMapFunction of relocations that apply at `path`. Realizes the
// file-static _FilterRelocationsForPath (layerStack.cpp:948): gather every
// combined source→target whose SOURCE is at-or-below `path` (skipping
// relocate-to-none / empty targets), then add incremental source→target pairs
// at-or-below `path` whose TARGET hasn't already been contributed by the
// combined map — the seenTargets guard keeps the resulting map invertible when
// relocates are nested in namespace (combined and incremental can share a
// target). Finally add the root identity </> → </> so paths outside the
// relocated subtrees map through unchanged.
function filterRelocationsForPath(stack: RelocatesLayerStack, path: string): PcpMapFunction {
  const siteRelocates = new Map<string, string>()
  const seenTargets = new Set<string>()

  for (const [source, target] of stack.relocatesSourceToTarget) {
    if (!hasPrefix(source, path)) continue
    if (!target) continue // skip relocate-to-none (empty target)
    siteRelocates.set(source, target)
    seenTargets.add(target)
  }

  for (const [source, target] of stack.incrementalRelocatesSourceToTarget) {
    if (!hasPrefix(source, path)) continue
    if (!target) continue
    if (seenTargets.has(target)) continue
    seenTargets.add(target)
    siteRelocates.set(source, target)
  }

  siteRelocates.set('/', '/')
  // There may be an arbitrarily large number of relocates, so upstream uses a
  // deferred-composition map function (layerStack.cpp:995-1003).
  return PcpMapFunction.deferredComposition(PcpMapFunction.create(siteRelocates))
}


// Compute a standalone layer stack (tests and tools). Loads sublayers through
// `opener`, retrying the synchronous computation as layers arrive.
export async function computePcpLayerStack(
  rootLayer: PcpLayer,
  opener: PcpLayerOpener,
  sessionLayer?: PcpLayer,
): Promise<PcpLayerStack> {
  const { PcpLayerStackRegistry } = await import('./layerStackRegistry.ts')
  const loaded = new Map<string, PcpLayer | null>()
  const failures = new Map<string, string>()
  const source: PcpLayerSource = {
    findOrOpen(identifier) {
      if (!loaded.has(identifier)) throw new PcpNeedsLayer(identifier)
      return loaded.get(identifier)!
    },
    failureMessages: identifier => failures.get(identifier) ?? '',
  }
  const identifier: PcpLayerStackIdentifier = sessionLayer
    ? { rootLayer, sessionLayer } : { rootLayer }
  for (;;) {
    try {
      const registry = new PcpLayerStackRegistry(identifier, true, source)
      return registry.findOrCreate(identifier, [])
    } catch (e) {
      if (!(e instanceof PcpNeedsLayer)) throw e
      const errors: string[] = []
      const layer = await opener(e.identifier, errors) ?? null
      loaded.set(e.identifier, layer)
      if (!layer) failures.set(e.identifier, errors.join('; '))
    }
  }
}
