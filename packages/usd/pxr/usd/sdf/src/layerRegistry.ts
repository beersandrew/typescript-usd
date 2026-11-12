// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layerRegistry.cpp,
//  pxr/usd/sdf/layerRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors the private Sdf_LayerRegistry machinery. This module deliberately
// is not exported from typescript-usd/sdf: callers enter through Layer.findOrOpen().

import type { Layer } from './layer.ts'
import { _withSdfTrace, _withSdfTraceSync, type SdfTraceContext } from './traceContext.ts'
import { _onResolverReplaced } from 'typescript-usd/ar/_internal'

export const SDF_FORMAT_ARGS_MARKER = ':SDF_FORMAT_ARGS:'

export interface LayerIdentifier {
  assetPath: string
  args: ReadonlyMap<string, string>
}

export function splitLayerIdentifier(identifier: string): LayerIdentifier {
  const marker = identifier.indexOf(SDF_FORMAT_ARGS_MARKER)
  if (marker < 0) return { assetPath: identifier, args: new Map() }
  const args = new Map<string, string>()
  for (const pair of identifier.slice(marker + SDF_FORMAT_ARGS_MARKER.length).split('&')) {
    if (!pair) continue
    const equals = pair.indexOf('=')
    const key = decodeURIComponent(equals < 0 ? pair : pair.slice(0, equals))
    const value = decodeURIComponent(equals < 0 ? '' : pair.slice(equals + 1))
    args.set(key, value)
  }
  return { assetPath: identifier.slice(0, marker), args }
}

export function createLayerIdentifier(assetPath: string, args: ReadonlyMap<string, string>): string {
  if (args.size === 0) return assetPath
  const encoded = [...args].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  return `${assetPath}${SDF_FORMAT_ARGS_MARKER}${encoded}`
}

interface Entry {
  readonly layer: WeakRef<Layer>
  readonly identifier: string
  readonly resolvedIdentifier: string
}

class LayerRegistry {
  private readonly byIdentifier = new Map<string, Set<Entry>>()
  private readonly byResolvedPath = new Map<string, Set<Entry>>()
  private readonly inFlight = new Map<string, Promise<Layer | undefined>>()
  private readonly finalizer = new FinalizationRegistry<Entry>((entry) => this.erase(entry))
  clear(): void {
    this.byIdentifier.clear()
    this.byResolvedPath.clear()
    this.inFlight.clear()
  }

  private findIn(
    map: Map<string, Set<Entry>>,
    key: string,
    traceContext: SdfTraceContext,
    traceName: string,
  ): Layer | undefined {
    return _withSdfTraceSync(traceContext, traceName, () => {
      const entries = map.get(key)
      if (!entries) return undefined
      for (const entry of entries) {
        const layer = entry.layer.deref()
        if (layer) return layer
        this.erase(entry)
      }
      return undefined
    })
  }

  find(
    identifier: string,
    resolvedIdentifier: string,
    trustIdentifier: boolean,
    traceContext?: SdfTraceContext,
  ): Layer | undefined {
    return _withSdfTraceSync(traceContext, 'typescript-usd:LayerRegistry.find', context =>
      (trustIdentifier
        ? this.findIn(
          this.byIdentifier, identifier, context, 'typescript-usd:LayerRegistry.findByIdentifier')
        : undefined)
      ?? this.findIn(
        this.byResolvedPath, resolvedIdentifier, context,
        'typescript-usd:LayerRegistry.findByResolvedPath'))
  }

  async findOrOpen(
    identifier: string,
    resolvedIdentifier: string,
    trustIdentifier: boolean,
    open: (traceContext: SdfTraceContext) => Promise<Layer | undefined>,
    traceContext?: SdfTraceContext,
  ): Promise<Layer | undefined> {
    return _withSdfTrace(traceContext, 'typescript-usd:LayerRegistry.findOrOpen', async context => {
      const existing = this.find(identifier, resolvedIdentifier, trustIdentifier, context)
      if (existing) return existing

      // The resolved identifier contains canonical file-format arguments, so
      // aliases to one asset converge while distinct format views do not.
      const key = resolvedIdentifier || identifier
      const pending = this.inFlight.get(key)
      if (pending) return pending

      // A failed open is not registered; a caller waiting on it gets no
      // layer, as _WaitForInitializationAndCheckIfSuccessful gives null
      // (layer.cpp:878-883).
      const opening = open(context).then((layer) => {
        if (!layer) return undefined
        const raced = this.find(identifier, resolvedIdentifier, trustIdentifier, context)
        if (raced) return raced
        this.insert(layer, identifier, resolvedIdentifier, context)
        return layer
      }).finally(() => {
        if (this.inFlight.get(key) === opening) this.inFlight.delete(key)
      })
      this.inFlight.set(key, opening)
      return opening
    })
  }

  /** Registers a layer created rather than opened (an anonymous layer). */
  register(layer: Layer, identifier: string): void {
    const entry: Entry = { layer: new WeakRef(layer), identifier, resolvedIdentifier: identifier }
    this.add(this.byIdentifier, identifier, entry)
    this.add(this.byResolvedPath, identifier, entry)
    this.finalizer.register(layer, entry, entry)
  }

  // Sdf_LayerRegistry::GetLayers: every live registered layer.
  layers(): Layer[] {
    const layers = new Set<Layer>()
    for (const entries of [...this.byIdentifier.values()]) {
      for (const entry of [...entries]) {
        const layer = entry.layer.deref()
        if (layer) layers.add(layer)
        else this.erase(entry)
      }
    }
    return [...layers]
  }

  // Sdf_LayerRegistry::InsertOrUpdate (layerRegistry.cpp): re-key a layer
  // whose resolved path changed (SdfLayer::_InitializeFromIdentifier).
  // Only a registered layer is re-keyed.
  update(layer: Layer, identifier: string, resolvedIdentifier: string): void {
    let registered = false
    for (const entries of [...this.byIdentifier.values()]) {
      for (const entry of [...entries]) {
        if (entry.layer.deref() !== layer) continue
        this.erase(entry)
        registered = true
      }
    }
    if (registered) this.insert(layer, identifier, resolvedIdentifier, undefined)
  }

  private insert(
    layer: Layer,
    identifier: string,
    resolvedIdentifier: string,
    traceContext: SdfTraceContext,
  ): void {
    _withSdfTraceSync(traceContext, 'typescript-usd:LayerRegistry.insert', () => {
      const entry: Entry = { layer: new WeakRef(layer), identifier, resolvedIdentifier }
      this.add(this.byIdentifier, identifier, entry)
      this.add(this.byResolvedPath, resolvedIdentifier, entry)
      this.finalizer.register(layer, entry, entry)
    })
  }

  private add(map: Map<string, Set<Entry>>, key: string, entry: Entry): void {
    let entries = map.get(key)
    if (!entries) map.set(key, entries = new Set())
    entries.add(entry)
  }

  private erase(entry: Entry): void {
    this.remove(this.byIdentifier, entry.identifier, entry)
    this.remove(this.byResolvedPath, entry.resolvedIdentifier, entry)
    this.finalizer.unregister(entry)
  }

  private remove(map: Map<string, Set<Entry>>, key: string, entry: Entry): void {
    const entries = map.get(key)
    if (!entries) return
    entries.delete(entry)
    if (entries.size === 0) map.delete(key)
  }
}

export const _layerRegistry = new LayerRegistry()
_onResolverReplaced(() => _layerRegistry.clear())
