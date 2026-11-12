import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage } from '../../src/stage.ts'
import type { Layer } from 'typescript-usd/sdf'

// UsdStage::_layersAndNoticeKeys: the layers whose LayersDidChange notices
// the stage listens to.
function subscribedLayers(stage: Stage): ReadonlyMap<Layer, unknown> {
  return (stage as unknown as { _layersAndNoticeKeys: Map<Layer, unknown> })
    ._layersAndNoticeKeys
}

describe('UsdStage dependency subscriptions', () => {
  it('unsubscribes a muted layer and restores it when used again', async () => {
    const resolver = new ArInMemoryResolver({
      'root.usda': new TextEncoder().encode(
        '#usda 1.0\n( subLayers = [@weak.usda@] )\n\ndef "Root" {}\n'),
      'weak.usda': new TextEncoder().encode('#usda 1.0\n\ndef "Weak" {}\n'),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const weak = stage.getLayerStack().find(layer => layer.filePath === 'weak.usda')
    expect(weak).toBeDefined()
    expect(subscribedLayers(stage).has(weak!)).toBe(true)
    expect(stage.getUsedLayers()).toContain(weak)
    expect(stage.getPrim('/Weak')).not.toBeNull()

    await stage.muteLayer('weak.usda')
    expect(stage.getPrim('/Weak')).toBeUndefined()
    expect(subscribedLayers(stage).has(weak!)).toBe(false)
    expect(stage.getUsedLayers()).not.toContain(weak)

    await stage.unmuteLayer('weak.usda')
    const reopened = stage.getLayerStack().find(layer => layer.filePath === 'weak.usda')
    expect(reopened).toBe(weak)
    expect(subscribedLayers(stage).has(weak!)).toBe(true)
    expect(stage.getUsedLayers()).toContain(weak)
  })
})
