import { describe, expect, it } from 'vitest'
import {
  RetainedSceneIndex as HdRetainedSceneIndex,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  InsertionOrder,
} from 'typescript-usd/hd'

describe('HdSceneIndexPluginRegistry chain ownership', () => {
  it('appends callbacks in resolved order and retains insertion metadata', () => {
    HdSceneIndexPluginRegistry._resetInstance()
    const registry = HdSceneIndexPluginRegistry.GetInstance()
    const input = HdRetainedSceneIndex.new()
    const calls: string[] = []

    registry.registerSceneIndexForRenderer('Storm', (instanceId, scene, args) => {
      const renderer = args?.Get('__rendererDisplayName') as
        { GetValue(shutterOffset: number): unknown } | undefined
      calls.push(`early:${instanceId}:${String(renderer?.GetValue(0))}`)
      const result = HdRetainedSceneIndex.new()
      result.setDisplayName(`early after ${scene.getDisplayName()}`)
      return result
    }, null, 0, InsertionOrder.InsertionOrderAtStart)
    registry.registerSceneIndexForRenderer('Storm', (instanceId) => {
      calls.push(`late:${instanceId}`)
      return HdRetainedSceneIndex.new()
    }, null, 2, InsertionOrder.InsertionOrderAtEnd)

    const result = registry.appendSceneIndicesForRenderer('Storm', input, 'render-7')
    expect(calls).toEqual(['early:render-7:Storm', 'late:render-7'])
    expect(registry.getPluginInsertionMetadataForSceneIndex(result)).toEqual({
      rendererDisplayName: 'Storm',
      sceneIndexPluginId: '',
      insertionPhase: 2,
    })
  })
})
