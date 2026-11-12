// Ported from OpenUSD 26.11.1: pxr/usd/pcp/wrapTestChangeProcessor.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Pcp._TestChangeProcessor. Port of OpenUSD v26.08
// pxr/usd/pcp/wrapTestChangeProcessor.cpp: records the changes a PcpCache
// computes for Sdf layer edits and applies them, for change processing tests.
//
// Upstream receives one SdfNotice::LayersDidChange per change block. typescript-usd
// layers report mutation records synchronously, so the records of each
// synchronous edit are gathered until process() is awaited.

import { sdfChangeListFromLayerChanges, type SdfLayerChangeListVec } from 'typescript-usd/sdf/changeList'
import type { PcpCache } from './cache.ts'
import { PcpChanges } from './changes.ts'
import type { PcpLayer } from './layerStackIdentifier.ts'

interface ChangeRecordLayer extends PcpLayer {
  _registerDidChangeListener?(listener: (change: never) => void): () => void
}

export class PcpTestChangeProcessor {
  private _changes = new PcpChanges()
  private readonly _subscriptions = new Map<PcpLayer, () => void>()
  private _pending = new Map<PcpLayer, unknown[]>()

  constructor(private readonly _cache: PcpCache) {}

  enter(): this {
    this._subscribe()
    return this
  }

  async exit(): Promise<void> {
    await this.process()
    for (const unsubscribe of this._subscriptions.values()) unsubscribe()
    this._subscriptions.clear()
    this._changes = new PcpChanges()
  }

  // Watch every layer the cache has opened, as the upstream processor
  // receives notices for all layers.
  private _subscribe(): void {
    const layers = new Set<PcpLayer>(this._cache._layerSource._loadedLayers())
    for (const layer of this._cache.getUsedLayers()) layers.add(layer)
    for (const layer of layers) {
      if (this._subscriptions.has(layer)) continue
      const register = (layer as ChangeRecordLayer)._registerDidChangeListener
      if (!register) continue
      this._subscriptions.set(layer, register.call(layer, (change: never) => {
        let records = this._pending.get(layer)
        if (!records) this._pending.set(layer, records = [])
        records.push(change)
      }))
    }
  }

  /** Deliver the pending edits as one LayersDidChange notice. */
  async process(): Promise<void> {
    if (this._pending.size === 0) return
    const changes: SdfLayerChangeListVec<PcpLayer> = []
    for (const [layer, records] of this._pending) {
      changes.push([layer, sdfChangeListFromLayerChanges(layer, records as never)])
    }
    this._pending = new Map()
    await this._changes.didChange(this._cache, changes)
    await this._changes.apply()
    this._subscribe()
  }

  getSignificantChanges(): string[] {
    return this._paths('didChangeSignificantly')
  }

  getSpecChanges(): string[] {
    return this._paths('didChangeSpecs')
  }

  getPrimChanges(): string[] {
    return this._paths('didChangePrims')
  }

  private _paths(field: 'didChangeSignificantly' | 'didChangeSpecs' | 'didChangePrims'): string[] {
    const changes = this._changes.getCacheChanges().get(this._cache)
    return changes ? [...changes[field]].map(path => path.pathString) : []
  }
}
