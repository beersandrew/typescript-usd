// Ported from OpenUSD 26.11.1: pxr/usd/pcp/layerStackRegistry.cpp,
//  pxr/usd/pcp/layerStackRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Pcp_LayerStackRegistry and Pcp_MutedLayers. Port of OpenUSD v26.08
// pxr/usd/pcp/layerStackRegistry.{h,cpp}.
//
// The registry owns the layer stacks of one PcpCache, keyed by identifier,
// and indexes them by the layers (and muted layer identifiers) they use.

import type { PcpError } from './errors.ts'
import {
  type PcpLayer, type PcpLayerHandle, type PcpLayerStackIdentifier,
  pcpLayerStackIdentifierKey,
} from './layerStackIdentifier.ts'
import { PcpLayerStack, type PcpLayerSource } from './layerStack.ts'
import { _sdfCreateLayerIdentifier, _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'
import type { PcpTraceContextHolder } from './traceTypes.ts'
import { pcpStripFileFormatTarget } from './utils.ts'

const isAnonymousIdentifier = (id: string): boolean => id.startsWith('anon:')

// Pcp_MutedLayers (layerStackRegistry.cpp:354-464).
export class PcpMutedLayers {
  private _layers: string[] = []

  constructor(private readonly _fileFormatTarget = '') {}

  // _GetCanonicalLayerId: anchor the layer path to the anchor layer, keeping
  // any file format arguments.
  private _getCanonicalLayerId(anchorLayer: PcpLayerHandle, layerId: string): string {
    const { assetPath, args } = _sdfSplitLayerIdentifier(layerId)
    if (!assetPath) return ''
    const anchored = isAnonymousIdentifier(assetPath)
      ? assetPath
      : (anchorLayer as Partial<PcpLayer>).resolveAsset?.(assetPath) || assetPath
    if (!anchored) return ''
    // A file format target matching the cache's own is stripped, so muting
    // matches identifiers without a target (layerStackRegistry.cpp:380-386).
    const canonicalArgs = new Map(args)
    pcpStripFileFormatTarget(this._fileFormatTarget, canonicalArgs)
    return _sdfCreateLayerIdentifier(anchored, canonicalArgs)
  }

  getMutedLayers(): readonly string[] { return this._layers }

  muteAndUnmuteLayers(
    anchorLayer: PcpLayerHandle, layersToMute: string[], layersToUnmute: string[],
  ): void {
    const muted: string[] = []
    const unmuted: string[] = []
    for (const layer of layersToMute) {
      const id = this._getCanonicalLayerId(anchorLayer, layer)
      if (!id || this._layers.includes(id)) continue
      this._layers.push(id)
      muted.push(id)
    }
    for (const layer of layersToUnmute) {
      const id = this._getCanonicalLayerId(anchorLayer, layer)
      const index = id ? this._layers.indexOf(id) : -1
      if (index < 0) continue
      this._layers.splice(index, 1)
      unmuted.push(id)
    }
    this._layers.sort()
    layersToMute.splice(0, layersToMute.length, ...muted)
    layersToUnmute.splice(0, layersToUnmute.length, ...unmuted)
  }

  // Returns the canonical identifier when muted, else undefined.
  isLayerMuted(anchorLayer: PcpLayerHandle, layerId: string): string | undefined {
    if (this._layers.length === 0) return undefined
    const id = this._getCanonicalLayerId(anchorLayer, layerId)
    return id && this._layers.includes(id) ? id : undefined
  }
}

// FAITHFULNESS-DEBT(pcp-layer-stack-lifetime): upstream's registry holds
// layer stacks weakly; they expire the moment no prim index node, dependency,
// change lifeboat or caller references them (layerStackRegistry.cpp:200-258).
// Here unreferenced stacks are expired only when a cache applies changes
// (PcpCache._expireUnusedLayerStacks), and a stack only a caller holds is
// expired then too; the faithful replacement is reference-tracked expiry.
export class PcpLayerStackRegistry {
  private readonly _identifierToLayerStack = new Map<string, PcpLayerStack>()
  private readonly _layerToLayerStacks = new Map<PcpLayer, PcpLayerStack[]>()
  private readonly _layerStackToLayers = new Map<PcpLayerStack, PcpLayer[]>()
  private readonly _mutedLayerIdToLayerStacks = new Map<string, PcpLayerStack[]>()
  private readonly _layerStackToMutedLayerIds = new Map<PcpLayerStack, Set<string>>()
  private readonly _mutedLayers: PcpMutedLayers
  /** @internal Trace context for layer stack computation. */
  _traceHolder: PcpTraceContextHolder | undefined

  constructor(
    private readonly _rootLayerStackId: PcpLayerStackIdentifier,
    private readonly _usd: boolean,
    /** @internal */ readonly _layerSource: PcpLayerSource,
    private readonly _fileFormatTarget = '',
  ) {
    this._mutedLayers = new PcpMutedLayers(_fileFormatTarget)
  }

  // _GetFileFormatTarget (layerStackRegistry.cpp:334-338).
  /** @internal */
  _getFileFormatTarget(): string { return this._fileFormatTarget }

  muteAndUnmuteLayers(
    anchorLayer: PcpLayerHandle, layersToMute: string[], layersToUnmute: string[],
  ): void {
    this._mutedLayers.muteAndUnmuteLayers(anchorLayer, layersToMute, layersToUnmute)
  }

  getMutedLayers(): readonly string[] { return this._mutedLayers.getMutedLayers() }

  isLayerMuted(anchorLayer: PcpLayerHandle, layerId: string): string | undefined {
    return this._mutedLayers.isLayerMuted(anchorLayer, layerId)
  }

  findAllUsingMutedLayer(layerId: string): readonly PcpLayerStack[] {
    return this._mutedLayerIdToLayerStacks.get(layerId) ?? []
  }

  // FindOrCreate (layerStackRegistry.cpp:128-175).
  findOrCreate(identifier: PcpLayerStackIdentifier, allErrors: PcpError[]): PcpLayerStack {
    const existing = this.find(identifier)
    if (existing) return existing
    const created = new PcpLayerStack(identifier, this)
    this._identifierToLayerStack.set(pcpLayerStackIdentifierKey(identifier), created)
    created._registry = this
    this._setLayers(created)
    allErrors.push(...created.localErrors)
    return created
  }

  find(identifier: PcpLayerStackIdentifier): PcpLayerStack | undefined {
    const found = this._identifierToLayerStack.get(pcpLayerStackIdentifierKey(identifier))
    // Identifiers compare layer handles: a re-resolved layer with the same
    // identifier string is a different layer.
    if (found && (found.identifier.rootLayer !== identifier.rootLayer ||
        found.identifier.sessionLayer !== identifier.sessionLayer)) return undefined
    return found
  }

  contains(layerStack: PcpLayerStack): boolean {
    return layerStack._registry === this
  }

  findAllUsingLayer(layer: PcpLayer): readonly PcpLayerStack[] {
    return this._layerToLayerStacks.get(layer) ?? []
  }

  getAllLayerStacks(): PcpLayerStack[] {
    return [...this._identifierToLayerStack.values()]
  }

  forEachLayerStack(fn: (layerStack: PcpLayerStack) => void): void {
    for (const layerStack of this.getAllLayerStacks()) fn(layerStack)
  }

  /** @internal Drop a layer stack no longer used by the cache. */
  _remove(layerStack: PcpLayerStack): void {
    const key = pcpLayerStackIdentifierKey(layerStack.identifier)
    if (this._identifierToLayerStack.get(key) === layerStack) {
      this._identifierToLayerStack.delete(key)
    }
    const savedLayers = layerStack.layers
    const savedMuted = layerStack.mutedLayers
    layerStack.layers = []
    layerStack.mutedLayers = new Set()
    this._setLayers(layerStack)
    layerStack.layers = savedLayers
    layerStack.mutedLayers = savedMuted
    layerStack._registry = null
  }

  // _SetLayers (layerStackRegistry.cpp:260-326).
  /** @internal */
  _setLayers(layerStack: PcpLayerStack): void {
    for (const layer of this._layerStackToLayers.get(layerStack) ?? []) {
      const stacks = this._layerToLayerStacks.get(layer)
      if (!stacks) continue
      const index = stacks.indexOf(layerStack)
      if (index >= 0) stacks.splice(index, 1)
      if (stacks.length === 0) this._layerToLayerStacks.delete(layer)
    }
    const newLayers = layerStack.layers.map(entry => entry.layer)
    if (newLayers.length === 0) this._layerStackToLayers.delete(layerStack)
    else this._layerStackToLayers.set(layerStack, newLayers)
    for (const layer of newLayers) {
      let stacks = this._layerToLayerStacks.get(layer)
      if (!stacks) this._layerToLayerStacks.set(layer, stacks = [])
      if (!stacks.includes(layerStack)) stacks.push(layerStack)
    }

    for (const id of this._layerStackToMutedLayerIds.get(layerStack) ?? []) {
      const stacks = this._mutedLayerIdToLayerStacks.get(id)
      if (!stacks) continue
      const index = stacks.indexOf(layerStack)
      if (index >= 0) stacks.splice(index, 1)
      if (stacks.length === 0) this._mutedLayerIdToLayerStacks.delete(id)
    }
    if (layerStack.mutedLayers.size === 0) {
      this._layerStackToMutedLayerIds.delete(layerStack)
    } else {
      this._layerStackToMutedLayerIds.set(layerStack, new Set(layerStack.mutedLayers))
    }
    for (const id of layerStack.mutedLayers) {
      let stacks = this._mutedLayerIdToLayerStacks.get(id)
      if (!stacks) this._mutedLayerIdToLayerStacks.set(id, stacks = [])
      stacks.push(layerStack)
    }
  }

  /** @internal */ _getRootLayerStackIdentifier(): PcpLayerStackIdentifier {
    return this._rootLayerStackId
  }
  /** @internal */ _isUsd(): boolean { return this._usd }
}
