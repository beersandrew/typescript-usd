// Ported from OpenUSD 26.11.1: pxr/base/tf/noticeRegistry.h,
//  pxr/usd/sdf/layer.cpp, pxr/usd/sdf/layerRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A stage dropped without dispose() must not keep its layers alive.
// Upstream's notice registry keys per-sender listeners by the sender's
// TfWeakBase* (pxr/base/tf/noticeRegistry.h:123-128) and the layer registry
// holds weak handles (pxr/usd/sdf/layerRegistry.h:25-60), so once the last
// SdfLayerRefPtr goes (~UsdStage releases its root layer), ~SdfLayer erases
// the layer from the registry (pxr/usd/sdf/layer.cpp:266-296).
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from '../../src/index.ts'

// Expose the collector for this worker: the flag takes effect for contexts
// created after it is set.
setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc') as () => void

const enc = (text: string) => new TextEncoder().encode(text)

// WeakRef.prototype.deref keeps its target alive until the current job ends
// (ECMA-262 AddToKeptObjects), so collect in a fresh job before each check.
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
async function collect(ref: WeakRef<object>): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    await tick()
    gc()
    await tick()
    if (ref.deref() === undefined) return true
  }
  return false
}

describe('stage lifetime without dispose()', () => {
  it('lets a dropped stage\'s root layer be collected and unregistered', async () => {
    const resolverContext = _resolverContextForResolver(new ArInMemoryResolver({
      'dropped.usda': enc('#usda 1.0\n\ndef Xform "A"\n{\n    double value = 1\n}\n'),
    }))
    let stage = await Stage.open('dropped.usda', { resolverContext })
    const rootLayer = new WeakRef<object>(stage!.getRootLayer())
    const identifier = stage!.getRootLayer().identifier
    expect(stage!.getPrim('/A')).toBeDefined()
    stage = undefined

    expect(await collect(rootLayer)).toBe(true)
    // The registry's FinalizationRegistry callback runs after collection.
    await tick()
    expect(Layer.find(identifier)).toBeUndefined()
  })

  it('does not keep a sender alive through its per-sender listeners', async () => {
    class TestNotice extends TfNotice {}
    let sender: object | undefined = {}
    const ref = new WeakRef(sender)
    let delivered = 0
    const key = TfNotice.Register(TestNotice, () => { delivered++ }, sender)
    new TestNotice().send(sender)
    expect(delivered).toBe(1)
    sender = undefined
    expect(await collect(ref)).toBe(true)
    // Revoking after the sender is gone is harmless, as upstream.
    key.revoke()
    expect(key.isValid()).toBe(false)
  })
})
