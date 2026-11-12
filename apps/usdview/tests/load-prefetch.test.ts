// Reading ahead the next carriers' layers (src/load-prefetch.ts,
// docs/viewer-contracts.md "Load schedule"). Controller tests, no browser.
import { describe, expect, it, vi } from 'vitest'
import { ResolverContextBinder } from 'typescript-usd/ar'
import { AssetPath, Layer } from 'typescript-usd/sdf'
import { readLoadSchedule } from '../src/load-schedule'
import { HioImage } from 'typescript-usd/hio'
import { _HioImagesReadAhead, _HioReleaseImageAhead } from 'typescript-usd/hio/_internal'
import { imageHoldFrames, LoadPrefetcher, openCarrierLayers, readCarrierImages } from '../src/load-prefetch'
import { A, B, C, fetched, open } from './load-schedule-scene'

const names = (layers: Layer[]) => layers.map(layer => layer.identifier.slice(layer.identifier.lastIndexOf('/') + 1)).sort()

describe('load prefetch', () => {
  it('opens the layers a carrier will load without loading it', async () => {
    const stage = await open()
    try {
      const layers = await openCarrierLayers(stage, B)
      expect(names(layers)).toEqual(['labels.usda', 'unit.usda'])
      expect(stage.getLoadSet()).toEqual([])
      expect(stage.getPrim(`${B}/Unit/M`)).toBeUndefined()
      // The load finds them open: no asset is fetched again.
      const before = fetched.length
      await stage.loadAndUnload([B], [])
      expect(fetched.slice(before).filter(path => path.endsWith('unit.usda') || path.endsWith('labels.usda'))).toEqual([])
      expect(stage.getPrim(`${B}/Unit/M`)?.typeName).toBe('Mesh')
      expect(layers.every(layer => Layer.find(layer.identifier) === layer)).toBe(true)
    } finally { stage.dispose() }
  })

  it('holds the carriers whose window opens within the span, through their first frame', async () => {
    const stage = await open()
    try {
      const prefetcher = new LoadPrefetcher(stage, readLoadSchedule(stage).schedule!, 48)
      // A opens at -47, B at 133, C at 313.
      expect(prefetcher.update(-100)).toHaveLength(0)
      expect(prefetcher.update(-90)).toHaveLength(1)
      expect(prefetcher.held).toEqual([A])
      expect(prefetcher.update(-47)).toHaveLength(0)
      expect(prefetcher.held).toEqual([A])
      prefetcher.update(1)
      expect(prefetcher.held).toEqual([])
      const reads = prefetcher.update(100)
      expect(prefetcher.held).toEqual([B])
      expect((await Promise.all(reads)).map(names)).toEqual([['labels.usda', 'unit.usda']])
      prefetcher.update(133)
      expect(prefetcher.held).toEqual([B])
      prefetcher.update(300)
      expect(prefetcher.held).toEqual([C])
      // Reading ahead loads nothing.
      expect(stage.getLoadSet()).toEqual([])
      prefetcher.dispose()
      expect(prefetcher.held).toEqual([])
    } finally { stage.dispose() }
  })

  it('reads ahead the images a carrier\'s layers name, and its load opens them without a fetch', async () => {
    const stage = await open()
    try {
      const layers = await openCarrierLayers(stage, B)
      const [read] = await readCarrierImages(stage, layers)
      expect(read).toMatch(/tex\.png$/)
      expect(_HioImagesReadAhead()).toContain(read)
      // The path the stage resolves the texture's asset value to, which
      // Storm opens.
      await stage.loadAndUnload([B], [])
      const value = stage.getAttributeAtPath(`${B}/Labels/Tex.inputs:file`)!.get() as AssetPath
      expect(value.getResolvedPath()).toBe(read)
      const before = fetched.length
      const image = await HioImage.openForReadingAsync(read!)
      expect(image?.getWidth()).toBeGreaterThan(0)
      expect(fetched.slice(before)).toEqual([])
    } finally { stage.dispose() }
  })

  it('holds a carrier\'s images until imageHoldFrames after its window opens', async () => {
    const stage = await open()
    const tex = (await readCarrierImages(stage, await openCarrierLayers(stage, B)))[0]!
    _HioReleaseImageAhead(tex)
    const settle = async (prefetcher: LoadPrefetcher) => { for (const c of prefetcher.imagesHeld) await prefetcher.images(c); await new Promise(r => setTimeout(r, 0)) }
    try {
      const prefetcher = new LoadPrefetcher(stage, readLoadSchedule(stage).schedule!, 48)
      // B opens at 133 and C at 313; both name the same image.
      prefetcher.update(100)
      await settle(prefetcher)
      expect(prefetcher.imagesHeld).toEqual([B])
      expect(_HioImagesReadAhead()).toContain(tex)
      // Past the window's first frame the layers are let go, the images not yet.
      prefetcher.update(133 + 1)
      expect(prefetcher.held).toEqual([])
      expect(prefetcher.imagesHeld).toEqual([B])
      prefetcher.update(133 + imageHoldFrames)
      expect(prefetcher.imagesHeld).toEqual([B])
      prefetcher.update(133 + imageHoldFrames + 1)
      await settle(prefetcher)
      expect(prefetcher.imagesHeld).toEqual([])
      expect(_HioImagesReadAhead()).not.toContain(tex)
      // C holds it again; a carrier still holding it keeps it when another lets go.
      prefetcher.update(300)
      await settle(prefetcher)
      expect(prefetcher.imagesHeld).toEqual([C])
      expect(_HioImagesReadAhead()).toContain(tex)
      prefetcher.dispose()
      await settle(prefetcher)
      expect(_HioImagesReadAhead()).not.toContain(tex)
      expect(stage.getLoadSet()).toEqual([])
    } finally { stage.dispose() }
  })

  it('reads ahead where Ar scopes cannot span awaits (Safari has no AsyncContext)', async () => {
    // packages/usd/pxr/usd/ar/src/asyncState.ts: without the host's
    // AsyncContext, a binder scope around an asynchronous function throws.
    const run = ResolverContextBinder.prototype.run
    const spy = vi.spyOn(ResolverContextBinder.prototype, 'run').mockImplementation(function (this: ResolverContextBinder, fn: () => unknown) {
      return run.call(this, () => {
        const result = fn()
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(result).catch(() => undefined)
          throw new Error('Asynchronous Ar scopes require host AsyncContext support')
        }
        return result
      })
    } as typeof run)
    const stage = await open()
    try {
      const layers = await openCarrierLayers(stage, C)
      expect(names(layers)).toEqual(['labels.usda', 'unit.usda'])
      const [read] = await readCarrierImages(stage, layers)
      expect(read).toMatch(/tex\.png$/)
      expect(_HioImagesReadAhead()).toContain(read)
      _HioReleaseImageAhead(read!)
    } finally { spy.mockRestore(); stage.dispose() }
  })
})
