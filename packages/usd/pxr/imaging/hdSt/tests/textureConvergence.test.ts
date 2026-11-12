// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderPass.h,
//  pxr/imaging/hdSt/textureObjectRegistry.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller test (no GPU) of the asynchronous texture load divergence and
// what Storm's render passes report for it (hdSt/src/renderPass.ts and
// textureObjectRegistry.ts headers). Upstream Commit() loads every texture
// before it draws (textureObjectRegistry.cpp:224-262) and HdSt_RenderPass
// keeps HdRenderPass::IsConverged, always true (hd/renderPass.h:92); here a
// texture whose load is unfinished is not committed (it stays dirty) and a
// pass is converged once every texture is committed with its data. There is
// no upstream test of this divergence; the texture object is a double whose
// load the test finishes.

import { describe, expect, it } from 'vitest'
import { RprimCollection as HdRprimCollection } from 'typescript-usd/hd'
import { HdSt_TextureObjectRegistry } from '../src/textureObjectRegistry.ts'
import { HdSt_RenderPass } from '../src/renderPass.ts'
import type { HdStResourceRegistry } from '../src/resourceRegistry.ts'
import type { HdStTextureObject } from '../src/textureObject.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => { resolve = yes })
  return { promise, resolve }
}
const tick = async () => { for (let i = 0; i < 4; i++) await Promise.resolve() }

/** A texture object whose _Load the test finishes. */
function texture(load: Promise<void>) {
  const calls: string[] = []
  const object = {
    _dead: false,
    _load: () => { calls.push('load'); return load },
    _commit: () => { calls.push('commit') },
    GetTextureIdentifier: () => ({ getFilePath: () => 'texture.png' }),
  }
  return { object: object as unknown as HdStTextureObject, calls }
}

function setup() {
  const resourceRegistry = { submitBlitWork: () => Promise.resolve() } as unknown as HdStResourceRegistry
  const registry = new HdSt_TextureObjectRegistry(resourceRegistry)
  const stResourceRegistry = { _getTextureHandleRegistry: () => ({ getTextureObjectRegistry: () => registry }) }
  const renderIndex = {
    getRenderDelegate: () => ({ getHgi: () => ({}) }),
    getResourceRegistry: () => stResourceRegistry,
  }
  const pass = new HdSt_RenderPass(renderIndex as never, new HdRprimCollection('geometry', null as never))
  return { registry, pass }
}

describe('Storm texture loads and render pass convergence', () => {
  it('is converged with no textures', () => {
    const { registry, pass } = setup()
    expect(registry.hasUncommittedTextures()).toBe(false)
    expect(pass.isConverged()).toBe(true)
  })

  it('does not commit a texture while it loads and is not converged until a later commit has the data', async () => {
    const { registry, pass } = setup()
    const load = deferred(), t = texture(load.promise)
    registry.markTextureObjectDirty(t.object)
    expect(pass.isConverged()).toBe(false)
    // The commit starts the load, does not commit the texture and leaves it
    // dirty.
    expect([...registry.commit()]).toEqual([])
    expect(t.calls).toEqual(['load'])
    expect(registry.isCommitPending(t.object)).toBe(true)
    expect(registry.hasPendingLoads()).toBe(true)
    expect(pass.isConverged()).toBe(false)
    // Loaded but not yet committed.
    load.resolve(); await tick()
    expect(registry.hasPendingLoads()).toBe(false)
    expect(pass.isConverged()).toBe(false)
    expect([...registry.commit()]).toEqual([t.object])
    expect(t.calls).toEqual(['load', 'commit'])
    expect(registry.isCommitPending(t.object)).toBe(false)
    expect(pass.isConverged()).toBe(true)
    // Nothing left to commit.
    expect([...registry.commit()]).toEqual([])
    expect(pass.isConverged()).toBe(true)
  })

  it('is converged after a load that fails (the texture is committed without data)', async () => {
    const { registry, pass } = setup()
    const failed = Promise.reject(new Error('missing'))
    failed.catch(() => {})
    const t = texture(failed)
    registry.markTextureObjectDirty(t.object)
    registry.commit()
    expect(pass.isConverged()).toBe(false)
    await tick()
    registry.commit()
    expect(pass.isConverged()).toBe(true)
  })
})
