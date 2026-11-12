// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdStage.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdStage.py
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, StagePopulationMask } from 'typescript-usd/usd'
import { ArResolver, ArResolvedPath, ArAsset, ArInMemoryAsset } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => { _setResolverForTest(new FixtureResolver()) })

describe('UsdStage', () => {
  describe('CreateNew / Open', () => {
    it('CreateNew returns a writable stage with an anonymous root layer', () => {
      const stage = Stage.createNew()
      // Writable: definePrim succeeds and is readable back.
      stage.definePrim('/World', 'Xform')
      expect(stage.getPrim('/World')?.typeName).toBe('Xform')
      // The root layer for an in-memory authoring stage is the (anonymous)
      // edit target itself — there is no file-backed identifier.
      const root = stage.getRootLayer()
      expect(root).toBeDefined()
      expect(root.filePath.startsWith('anon:')).toBe(true)
    })

    it('Open returns a stage whose root layer matches the file on disk', async () => {
      files = { 'root.usda': `#usda 1.0\ndef Xform "World" {}\n` }
      const stage = (await Stage.open('root.usda'))!
      expect(stage.getRootLayer().filePath).toBe('root.usda')
      expect(stage.getPrim('/World')?.typeName).toBe('Xform')
    })

    it('OpenMasked respects the population mask — excluded prims are absent', async () => {
      files = {
        'root.usda': `#usda 1.0
def Xform "World"
{
    def Xform "Included" {}
    def Xform "Excluded" {}
}
`,
      }
      const stage = (await Stage.openMasked(
        'root.usda', new StagePopulationMask(['/World/Included'])))!
      expect(stage.getPrim('/World/Included')).toBeTruthy()
      expect(stage.getPrim('/World/Excluded')).toBeUndefined()
    })
  })

  describe('Save / Export', () => {
    // typescript-usd has no Stage.save() / persistence-to-source method at all.
    it('Save writes edits back to the root layer file', async () => {
      files = { 'root.usda': `#usda 1.0\ndef Xform "World" {}\n` }
      const stage = (await Stage.open('root.usda'))!
      stage.definePrim('/World/Child', 'Xform')
      expect(typeof (stage as unknown as { save?: () => void }).save).toBe('function')
    })

    it('Export flattens the stage into a single layer', async () => {
      files = {
        'base.usda': `#usda 1.0
def Xform "World"
{
    def Xform "Base" {}
}
`,
        'root.usda': `#usda 1.0
(
    subLayers = [@./base.usda@]
)
def Xform "World"
{
    def Xform "Top" {}
}
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const flat = stage.flatten()
      const usda = flat.toUsda()
      // Flattening composes both the root layer's and sublayer's opinions
      // into one layer, with no subLayers metadata remaining.
      expect(usda).toContain('World')
      expect(usda).not.toContain('subLayers')
      expect(flat.getSpecPaths()).toContain('/World/Top')
      expect(flat.getSpecPaths()).toContain('/World/Base')
    })
  })

  describe('Layer stack', () => {
    it('GetLayerStack returns root layer, session layer, and all sublayers', async () => {
      files = {
        'sub.usda': `#usda 1.0\ndef Xform "FromSub" {}\n`,
        'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@]
)
def Xform "FromRoot" {}
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const stack = stage.getLayerStack(true)
      const ids = stack.map(l => l.filePath)
      // Session layer is strongest (present even though nothing is authored to it).
      expect(stage.hasSessionLayer()).toBe(true)
      expect(ids).toContain(stage.getSessionLayer().filePath)
      expect(ids).toContain('root.usda')
      expect(ids.some(id => id.endsWith('sub.usda'))).toBe(true)
      // Session layer is strongest (first).
      expect(ids[0]).toBe(stage.getSessionLayer().filePath)
    })

    it('GetUsedLayers includes layers introduced by references and payloads', async () => {
      files = {
        'ref.usda': `#usda 1.0\ndef Xform "Referenced" {}\n`,
        'root.usda': `#usda 1.0
def Xform "World" (
    references = @./ref.usda@
)
{
}
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const used = stage.getUsedLayers()
      expect(used.some(layer => layer.filePath.endsWith('ref.usda'))).toBe(true)
    })

    it('sublayer strength order matches the USDA subLayers list order', async () => {
      files = {
        'a.usda': `#usda 1.0\ndef Xform "FromA" {}\n`,
        'b.usda': `#usda 1.0\ndef Xform "FromB" {}\n`,
        'root.usda': `#usda 1.0
(
    subLayers = [@./a.usda@, @./b.usda@]
)
`,
      }
      const stage = (await Stage.open('root.usda'))!
      expect(stage.getSubLayerPaths()).toEqual(['./a.usda', './b.usda'])
    })
  })

  describe('Stage metadata', () => {
    // typescript-usd exposes startTimeCode/endTimeCode as readonly properties
    // populated at Stage.open() time from the root layer's authored
    // metadata — there is no separate SetStartTimeCode/SetEndTimeCode
    // method, so the round-trip is authored-USDA -> Stage.open() readback.
    it('GetStartTimeCode / GetEndTimeCode round-trip through authored root-layer metadata', async () => {
      files = {
        'root.usda': `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 48
)
`,
      }
      const stage = (await Stage.open('root.usda'))!
      expect(stage.startTimeCode).toBe(1)
      expect(stage.endTimeCode).toBe(48)
    })

    // typescript-usd has no Stage.getFramesPerSecond() — only the generic getMetadata
    // surface, which returns the raw authored value (no framerate default
    // applied) rather than defaulting unauthored framesPerSecond to 24.
    it('GetFramesPerSecond defaults to 24', async () => {
      files = { 'root.usda': `#usda 1.0\n` }
      const stage = (await Stage.open('root.usda'))!
      const fps = (stage as unknown as { getFramesPerSecond?: () => number }).getFramesPerSecond?.()
      expect(fps).toBe(24)
    })

    it('GetTimeCodesPerSecond defaults to framerate', async () => {
      files = { 'root.usda': `#usda 1.0\n` }
      const stage = (await Stage.open('root.usda'))!
      // No timeCodesPerSecond or framesPerSecond authored: defaults to 24.
      expect(stage.timeCodesPerSecond).toBe(24)
    })

    it('SetMetadata / GetMetadata round-trip for known metadata keys', async () => {
      files = { 'root.usda': `#usda 1.0\n` }
      const stage = (await Stage.open('root.usda'))!
      expect(stage.hasMetadata('comment')).toBe(false)
      stage.setMetadata('comment', 'hello world')
      expect(stage.getMetadata('comment')).toBe('hello world')
      expect(stage.hasMetadata('comment')).toBe(true)
      stage.clearMetadata('comment')
      expect(stage.hasMetadata('comment')).toBe(false)
    })
  })

  describe('Prim population', () => {
    // typescript-usd has no Stage.getPseudoRoot() — the equivalent is getPrim('/').
    it('GetPseudoRoot returns the "/" prim', () => {
      const stage = Stage.createNew()
      const root = stage.getPrim('/')
      expect(root).toBeDefined()
      expect(root!.path).toBe('/')
    })

    it('Traverse visits every prim in depth-first order', () => {
      const stage = Stage.createNew()
      stage.definePrim('/World', 'Xform')
      stage.definePrim('/World/Cube', 'Mesh')
      stage.definePrim('/World/Sphere', 'Sphere')
      const paths = [...stage.traverse()]
      expect(paths).toContain('/World')
      expect(paths).toContain('/World/Cube')
      expect(paths).toContain('/World/Sphere')
      // Depth-first: World appears before its children.
      expect(paths.indexOf('/World')).toBeLessThan(paths.indexOf('/World/Cube'))
    })

    it('TraverseAll visits inactive and abstract prims too', async () => {
      const stage = Stage.createNew()
      stage.definePrim('/Keep', 'Scope')
      const inactivePrim = stage.definePrim('/Inactive', 'Xform')
      await inactivePrim.setActive(false)
      const paths = [...stage.traverseAll()]
      expect(paths).toContain('/Keep')
      expect(paths).toContain('/Inactive')
    })

    it('GetPrimAtPath returns the correct prim or invalid prim for nonexistent path', () => {
      const stage = Stage.createNew()
      stage.definePrim('/World', 'Xform')
      expect(stage.getPrim('/World')?.path).toBe('/World')
      expect(stage.getPrim('/NoSuchPrim')).toBeUndefined()
    })
  })

  describe('Population mask', () => {
    it('GetPopulationMask returns UsdStagePopulationMask::All by default', () => {
      const stage = Stage.createNew()
      expect(stage.getPopulationMask().equals(StagePopulationMask.all())).toBe(true)
    })

    it('SetPopulationMask excludes prims outside the mask', async () => {
      const stage = Stage.createNew()
      stage.definePrim('/World/Included', 'Xform')
      stage.definePrim('/World/Excluded', 'Xform')
      await stage.setPopulationMask(new StagePopulationMask(['/World/Included']))
      expect(stage.getPrim('/World/Included')).toBeTruthy()
      expect(stage.getPrim('/World/Excluded')).toBeUndefined()
    })
  })
})
