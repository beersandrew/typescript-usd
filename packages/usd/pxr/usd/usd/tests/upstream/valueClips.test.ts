// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdValueClips.py, pxr/usd/usd/clipSet.cpp,
//  pxr/usd/sdf/fileIO_Common.h
// Copyright 2016, 2017, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from the ClipsAPI authoring and manifest sections of OpenUSD
// OpenUSD v26.08 pxr/usd/usd/testenv/testUsdValueClips.py.
// Self-authored USDA uses native 26.11.1 statement/newline grammar:
// sdf/textFileFormatParser.h:258-286,1558-1604.

import { beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  AttributeQuery as UsdAttributeQuery, ClipsAPI, InterpolationTypeHeld, Stage, TimeCode as UsdTimeCode,
} from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { Interval as GfInterval } from 'typescript-usd/gf'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const encoder = new TextEncoder()
let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const source = files[name]; return source === undefined ? undefined : new ArInMemoryAsset(encoder.encode(source)) }
}

beforeEach(() => {
  files = {}
  _setResolverForTest(new FixtureResolver())
})

async function openClips(options: {
  active?: [number, number][]
  times?: [number, number][]
  clip0?: string
  clip1?: string
  interpolate?: boolean
  manifest?: string
} = {}): Promise<Stage> {
  const active = options.active ?? [[0, 0], [10, 1]]
  const times = options.times ?? [[0, 0], [10, 10]]
  const pairs = (values: [number, number][]) => values.map(v => `(${v[0]}, ${v[1]})`).join(', ')
  files['root.usda'] = `#usda 1.0
def "Model" (
  clips = {
    dictionary default = {
      double2[] active = [${pairs(active)}]
      asset[] assetPaths = [@./clip0.usda@, @./clip1.usda@]
      ${options.manifest ? 'asset manifestAssetPath = @./manifest.usda@' : ''}
      string primPath = "/Clip"
      double2[] times = [${pairs(times)}]
      bool interpolateMissingClipValues = ${options.interpolate ? 'true' : 'false'}
    }
  }
) {
  double value
}
`
  files['clip0.usda'] = options.clip0 ?? `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 0, 10: 10
  }
}
`
  files['clip1.usda'] = options.clip1 ?? `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 100, 10: 110
  }
}
`
  if (options.manifest) files['manifest.usda'] = options.manifest
  return (await Stage.open('root.usda'))!
}

async function openFixture(root: string, assets: Record<string, string>): Promise<Stage> {
  files = { 'root.usda': root, ...assets }
  return (await Stage.open('root.usda'))!
}

describe('testUsdValueClips — ClipsAPI authoring', () => {
  it('round-trips clipSets as list-op metadata', () => {
    // OpenUSD v26.08 pxr/usd/sdf/fileIO_Common.h:465-482 writes declared
    // SdfStringListOp metadata with list-op syntax rather than a dictionary.
    const layer = Layer.createInMemory('clips.usda', `#usda 1.0
def Cube "Model" (
  clipSets = ["animation"]
)
{
}
`)
    expect(layer.toUsda()).toContain('clipSets = ["animation"]')
    expect(() => Layer.createInMemory('roundtrip.usda', layer.toUsda())).not.toThrow()
  })
  it('test_ClipAuthoring', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)

    api.setClipAssetPaths(['clip1.usda', 'clip2.usda'])
    api.setClipPrimPath('/Clip/Model')
    api.setClipActive([[0, 0], [10, 1]])
    api.setClipTimes([[0, 0], [10, 20]])
    api.setClipManifestAssetPath('manifest.usda')
    api.setInterpolateMissingClipValues(true)

    expect(api.getClipAssetPaths()).toEqual(['clip1.usda', 'clip2.usda'])
    expect(api.getClipPrimPath()).toBe('/Clip/Model')
    expect(api.getClipActive()).toEqual([[0, 0], [10, 1]])
    expect(api.getClipTimes()).toEqual([[0, 0], [10, 20]])
    expect(api.getClipManifestAssetPath()).toBe('manifest.usda')
    expect(api.getInterpolateMissingClipValues()).toBe(true)
  })

  it('test_ClipSetAuthoring', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipAssetPaths(['default.usda'])
    api.setClipAssetPaths(['walk.usda'], 'walk')
    api.setClipPrimPath('/Walk', 'walk')

    expect(api.getClipAssetPaths()).toEqual(['default.usda'])
    expect(api.getClipAssetPaths('walk')).toEqual(['walk.usda'])
    expect(api.getClipPrimPath('walk')).toBe('/Walk')
  })

  it('test_ComputeClipAssetPaths', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipTemplateAssetPath('clip.###.usda')
    api.setClipTemplateStartTime(1)
    api.setClipTemplateEndTime(5)
    api.setClipTemplateStride(2)
    api.setClipTemplateActiveOffset(-1)

    expect(api.computeClipAssetPaths()).toEqual(['clip.001.usda', 'clip.003.usda', 'clip.005.usda'])
    expect(api.getClipTemplateActiveOffset()).toBe(-1)
    expect(() => api.setClipTemplateStride(0)).toThrow()
    expect(() => api.setClipTemplateStride(-1)).toThrow()
  })

  it('test_ClipManifestGeneration', () => {
    const clip1 = Layer.createInMemory('clip1.usda', `#usda 1.0
def "Clip" {
  def "A" {
    double a.timeSamples = {
      0: 1
    }
    double d = 2
  }
}
`)
    const clip2 = Layer.createInMemory('clip2.usda', `#usda 1.0
def "Clip" {
  def "A" {
    double b.timeSamples = {
      0: 2
    }
  }
}
`)
    const manifest = ClipsAPI.generateClipManifestFromLayers([clip1, clip2], '/Clip/A')

    expect(manifest.getField('/Clip/A.a', 'typeName')).toBe('double')
    expect(manifest.getField('/Clip/A.b', 'typeName')).toBe('double')
    expect(manifest.getField('/Clip/A.d', 'typeName')).toBeUndefined()
    expect(() => ClipsAPI.generateClipManifestFromLayers([clip1], '/')).toThrow()
  })

  it('test_ClipValidation', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    expect(() => api.setClipTemplateStride(0)).toThrow()
    expect(() => ClipsAPI.generateClipManifestFromLayers([], 'relative')).toThrow()
    expect(() => ClipsAPI.generateClipManifestFromLayers([], '/Model.attr')).toThrow()
  })

  it('test_ClipManifest', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipManifestAssetPath('manifest.usda')
    expect(api.getClipManifestAssetPath()).toBe('manifest.usda')
  })

  it('test_ClipManifestGenerationWithMissingValues', () => {
    const populated = Layer.createInMemory('populated.usda', `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 1
  }
}
`)
    const missing = Layer.createInMemory('missing.usda', `#usda 1.0
def "Clip" {
}
`)
    const manifest = ClipsAPI.generateClipManifestFromLayers([missing, populated], '/Clip')
    expect(manifest.getField('/Clip.value', 'typeName')).toBe('double')
  })

  it('test_ClipTemplateManifestGeneration', () => {
    const clip = Layer.createInMemory('clip.001.usda', `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    1: 1
  }
}
`)
    const manifest = ClipsAPI.generateClipManifestFromLayers([clip], '/Clip')
    expect(manifest.getField('/Clip.value', 'typeName')).toBe('double')
  })

  it('test_ClipTemplateManifestGenerationWithMissingValues', () => {
    const a = Layer.createInMemory('clip.001.usda', `#usda 1.0
def "Clip" {
  double a.timeSamples = {
    1: 1
  }
}
`)
    const b = Layer.createInMemory('clip.002.usda', `#usda 1.0
def "Clip" {
  double b.timeSamples = {
    2: 2
  }
}
`)
    const manifest = ClipsAPI.generateClipManifestFromLayers([a, b], '/Clip')
    expect(manifest.getField('/Clip.a', 'typeName')).toBe('double')
    expect(manifest.getField('/Clip.b', 'typeName')).toBe('double')
  })

  it('test_ClipTemplateBehavior', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipTemplateAssetPath('clip.####.usda')
    api.setClipTemplateStartTime(8)
    api.setClipTemplateEndTime(12)
    api.setClipTemplateStride(2)
    expect(api.computeClipAssetPaths()).toEqual(['clip.0008.usda', 'clip.0010.usda', 'clip.0012.usda'])
  })

  it('test_MultipleClipSets', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipAssetPaths(['a.usda'], 'a')
    api.setClipAssetPaths(['b.usda'], 'b')
    expect(api.getClips()).toEqual({ a: { assetPaths: ['a.usda'] }, b: { assetPaths: ['b.usda'] } })
  })

  it('test_ListEditClipSets', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipSets({ explicitItems: ['walk', 'run'] })
    expect(api.getClipSets()).toEqual({ explicitItems: ['walk', 'run'] })
  })
})

describe('testUsdValueClips — value resolution', () => {
  it('test_BasicClipBehavior', async () => {
    const attr = (await openClips()).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBe(0)
    expect(attr.getValueAtTime(10)).toBe(110)
  })

  it('test_ClipTiming', async () => {
    const attr = (await openClips({ times: [[0, 5], [10, 10]] })).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBe(5)
    // OpenUSD 26.11.1 returns 57.5 for this scene: clip 0's last sample in
    // its active range is at 0, so t=5 interpolates toward clip 1's start
    // (clipSet.cpp:706-724).
    expect(attr.getValueAtTime(5)).toBe(57.5)
  })

  it('test_ClipTimeSamples', async () => {
    const attr = (await openClips()).get('/Model.value')!
    expect(attr.getTimeSampleKeys()).toEqual([0, 10])
    // OpenUSD 26.11.1: 55 (interpolates toward clip 1, clipSet.cpp:706-724).
    expect(attr.getValueAtTime(5)).toBe(55)
  })

  it('test_ClipTimingOutsideRange', async () => {
    const attr = (await openClips({ active: [[5, 0]], times: [[5, 0], [15, 10]] })).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBe(0)
    expect(attr.getValueAtTime(20)).toBe(10)
  })

  it('test_ClipTimingDiscontinuities', async () => {
    const attr = (await openClips({ active: [[0, 0]], times: [[0, 0], [5, 10], [5, 0], [10, 10]] })).get('/Model.value')!
    expect(attr.getValueAtTime(4)).toBe(8)
    expect(attr.getValueAtTime(6)).toBe(2)
  })

  it('test_ClipReverseTiming', async () => {
    const attr = (await openClips({ active: [[0, 0]], times: [[0, 10], [10, 0]] })).get('/Model.value')!
    expect(attr.getValueAtTime(2)).toBe(8)
    expect(attr.getValueAtTime(8)).toBe(2)
  })

  it('test_SingleClip', async () => {
    const attr = (await openClips({ active: [[0, 0]] })).get('/Model.value')!
    expect(attr.getValueAtTime(5)).toBe(5)
  })

  it('test_MultipleClips', async () => {
    const attr = (await openClips()).get('/Model.value')!
    // OpenUSD 26.11.1: 99 (interpolates toward clip 1, clipSet.cpp:706-724).
    expect(attr.getValueAtTime(9)).toBe(99)
    expect(attr.getValueAtTime(10)).toBe(110)
  })

  it('test_MultipleClipsWithNoTimeSamples', async () => {
    const attr = (await openClips({ clip1: `#usda 1.0
def "Clip" {
  double value = 200
}
` })).get('/Model.value')!
    expect(attr.getValueAtTime(10)).toBeUndefined()
  })

  it('test_MultipleClipsWithSomeTimeSamples', async () => {
    const attr = (await openClips({ clip1: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    5: 105
  }
}
` })).get('/Model.value')!
    expect(attr.getValueAtTime(15)).toBe(105)
  })

  it('test_GetTimeSamplesInIntervalWithoutInterpolation', async () => {
    const attr = (await openClips()).get('/Model.value')!
    expect(attr.getTimeSampleKeys()).toEqual([0, 10])
  })

  it('test_InterpolateSamplesInClip', async () => {
    const attr = (await openClips({ active: [[0, 0]] })).get('/Model.value')!
    expect(attr.getValueAtTime(2.5)).toBe(2.5)
  })

  it('test_InterpolateSamplesToNextClip', async () => {
    const attr = (await openClips({ interpolate: true })).get('/Model.value')!
    expect(attr.getValueAtTime(9.5)).toBe(104.5)
  })

  it('test_InterpolateMissingClipValues', async () => {
    const attr = (await openClips({
      interpolate: true,
      clip0: `#usda 1.0
def "Clip" {
}
`,
    })).get('/Model.value')!
    expect(attr.getTimeSampleKeys()).toEqual([10])
    expect([0, 5, 10, 15].map(t => attr.getValueAtTime(t))).toEqual([110, 110, 110, 110])
  })

  it('test_MultipleClipsWithNoTimes', async () => {
    const attr = (await openClips({
      active: [[0, 0], [7, 1]],
      times: [],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 0, 5: 5
  }
}
`,
      clip1: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    7: 107, 10: 110
  }
}
`,
    })).get('/Model.value')!
    expect(attr.getTimeSampleKeys()).toEqual([0, 5, 7, 10])
    expect([0, 5, 6, 7, 9, 10].map(t => attr.getValueAtTime(t))).toEqual([0, 5, 56, 107, 109, 110])
  })

  it('test_MultipleClipsWithTimesSpanningClips', async () => {
    const attr = (await openClips({
      active: [[1, 0], [3, 1]],
      times: [[1, 100], [4, 400]],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    100: 100, 200: 200
  }
}
`,
      clip1: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    300: 300, 400: 400
  }
}
`,
    })).get('/Model.value')!
    expect(attr.getTimeSampleKeys()).toEqual([1, 2, 3, 4])
    expect([1, 1.5, 2, 2.5, 3, 3.5, 4].map(t => attr.getValueAtTime(t)))
      .toEqual([100, 150, 200, 250, 300, 350, 400])
  })

  it('test_InterpolateMissingClipValuesWithFallbacksInManifest', async () => {
    const attr = (await openClips({
      interpolate: true,
      clip0: `#usda 1.0
def "Clip" {
}
`,
      manifest: `#usda 1.0
def "Clip" {
  double value = 42
}
`,
    })).get('/Model.value')!
    expect(attr.getTimeSampleKeys()).toEqual([0, 10])
    expect([0, 2.5, 5, 7.5, 10, 15].map(t => attr.getValueAtTime(t)))
      .toEqual([42, 59, 76, 93, 110, 110])
  })

  it('test_InterpolateMissingClipValuesWithBlocksInManifest', async () => {
    const opened: string[] = []
    const encoder = new TextEncoder()
    files = {
      'root.usda': `#usda 1.0
def "Model" (clips = {
  dictionary default = {
    double2[] active = [(0, 0), (10, 1)]
    asset[] assetPaths = [@./clip0.usda@, @./clip1.usda@]
    asset manifestAssetPath = @./manifest.usda@
    string primPath = "/Clip"
    bool interpolateMissingClipValues = true
  }
}
) {
  double value
}
`,
      'clip0.usda': `#usda 1.0
def "Clip" {
}
`,
      'clip1.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    10: 110
  }
}
`,
      'manifest.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: None
  }
}
`,
    }
    class TrackingResolver extends FixtureResolver {
      override async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
        opened.push(path.toString().split('/').pop()!)
        return super.openAsset(path)
      }
    }
    _setResolverForTest(new TrackingResolver())
    const stage = (await Stage.open('root.usda'))!
    expect(stage.get('/Model.value')!.getValueAtTime(5)).toBe(110)
    expect(opened).not.toContain('clip0.usda')
  })

  it('test_ClipsOnNonModel', async () => {
    const stage = await openClips({ active: [[0, 0]], clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    1: -100
  }
}
` })
    expect(stage.getPrim('/Model')!.typeName).toBe('')
    expect(stage.get('/Model.value')!.getValueAtTime(1)).toBe(-100)
  })

  it('test_ClipsCannotIntroduceNewTopology', async () => {
    const stage = await openClips({
      active: [[0, 0]],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 1
  }
  double clipOnly.timeSamples = {
    0: 2
  }
  def "ChildOnlyInClip" {
  }
}
`,
    })
    expect(stage.getPrim('/Model')!.attrNames).not.toContain('clipOnly')
    expect(stage.getPrim('/Model/ChildOnlyInClip')).toBeUndefined()
  })

  it('test_ClipStrengthOrdering', async () => {
    const stage = await openFixture(`#usda 1.0
def "Model" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./clip.usda@]
    string primPath = "/Clip"
  }
}
) {
  double value.timeSamples = {
    0: 500, 10: 510
  }
}
`, {
      'clip.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 1, 10: 11
  }
}
`,
    })
    expect(stage.get('/Model.value')!.getValueAtTime(5)).toBe(505)
  })

  // v26.08 live-oracle extensions of test_ClipStrengthOrdering. The clip is
  // introduced in the middle sublayer, between the stronger and weaker
  // ordinary opinion sites.
  const openClipBetweenOpinionSites = async (strongBody: string) => openFixture(
    `#usda 1.0
(subLayers = [@strong.usda@, @clipIntro.usda@, @weak.usda@])
`, {
      'strong.usda': `#usda 1.0
over "Model" {
  ${strongBody}
}
`,
      'clipIntro.usda': `#usda 1.0
over "Model" (clips = {
  dictionary default = {
    asset[] assetPaths = [@clip.usda@]
    string primPath = "/Model"
    double2[] active = [(0, 0)]
  }
}
) {
}
`,
      'weak.usda': `#usda 1.0
def "Model" {
  double strongDefault = 1
  double strongSpline = 2
  double valueBlock = 3
  double animationBlock = 4
  double between = 5
}
`,
      'clip.usda': `#usda 1.0
def "Model" {
  double strongDefault.timeSamples = {
    0: 100, 10: 110
  }
  double strongSpline.timeSamples = {
    0: 200, 10: 210
  }
  double valueBlock.timeSamples = {
    0: 300, 10: 310
  }
  double animationBlock.timeSamples = {
    0: 400, 10: 410
  }
  double between.timeSamples = {
    0: 500, 10: 510
  }
}
`,
    })

  it('test_ClipStrengthOrdering_StrongerDefault', async () => {
    const stage = await openClipBetweenOpinionSites('double strongDefault = 7')
    expect(stage.get('/Model.strongDefault')!.getValueAtTime(5)).toBe(7)
  })

  it('test_ClipStrengthOrdering_StrongerSpline', async () => {
    const stage = await openClipBetweenOpinionSites(
      'double strongSpline.spline = { 0: 20; post held, 10: 30; post held, }')
    expect(stage.get('/Model.strongSpline')!.getValueAtTime(5)).toBe(20)
  })

  it('test_ClipStrengthOrdering_StrongerBlocks', async () => {
    const stage = await openClipBetweenOpinionSites(
      'double valueBlock = None\n double animationBlock = AnimationBlock')
    expect(stage.get('/Model.valueBlock')!.getValueAtTime(5)).toBeUndefined()
    expect(stage.get('/Model.animationBlock')!.getValueAtTime(5)).toBe(4)
  })

  it('test_ClipStrengthOrdering_ClipBetweenOrdinarySites', async () => {
    const stage = await openClipBetweenOpinionSites('')
    expect(stage.get('/Model.between')!.getValueAtTime(5)).toBe(505)
  })

  it('test_AncestralClips', async () => {
    const stage = await openFixture(`#usda 1.0
def Xform "ModelGroup" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./ancestor.usda@]
    double2[] active = [(0, 0)]
    string primPath = "/Clip"
  }
}
) {
  double attr
  def Xform "Subgroup" {
    double attr
  }
}
`, {
      'ancestor.usda': `#usda 1.0
def Xform "Clip" {
  double attr.timeSamples = {
    0: 0, 5: -5, 10: -10, 15: -15
  }
  def Xform "Subgroup" {
    double attr.timeSamples = {
      0: 0, 5: -5, 10: -10, 15: -15
    }
  }
}
`,
    })
    expect(stage.get('/ModelGroup.attr')!.getTimeSampleKeys()).toEqual([0, 5, 10, 15])
    expect(stage.get('/ModelGroup/Subgroup.attr')!.getValueAtTime(10)).toBe(-10)
  })

  it('test_ArrayEdits', async () => {
    const stage = await openClips({
      active: [[0, 0]],
      clip0: `#usda 1.0
def "Clip" {
  int[] value.timeSamples = {
    1: [8, -1, -1, 555, -999]
  }
}
`,
    })
    expect(stage.get('/Model.value')!.getValueAtTime(1)).toEqual([8, -1, -1, 555, -999])
  })

  it('test_ClipStrengthOrderingInherits', async () => {
    const stage = await openFixture(`#usda 1.0
class "HasClips" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./clip.usda@]
    double2[] active = [(0, 0)]
    string primPath = "/Clip"
  }
}
) {
  double attr
}
def "InheritedClips" (inherits = </HasClips>) {
}
`, { 'clip.usda': `#usda 1.0
def "Clip" {
  double attr.timeSamples = {
    0: 10, 1: 20, 2: 30
  }
}
` })
    expect(stage.get('/InheritedClips.attr')!.getValueAtTime(1)).toBe(20)
  })

  it('test_MultipleClipsWithSomeTimeSamples2', async () => {
    const attr = (await openClips({
      active: [[0, 0], [4, 1]], times: [],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: -23, 3: -26
  }
}
`,
      clip1: `#usda 1.0
def "Clip" {
}
`,
    })).get('/Model.value')!
    expect(attr.getValueAtTime(3)).toBe(-26)
    expect(attr.getValueAtTime(5)).toBeUndefined()
  })

  it('test_MultipleClipsWithSomeTimeSamples3', async () => {
    const attr = (await openClips({
      active: [[0, 0], [2, 1]], times: [],
      clip0: `#usda 1.0
def "Clip" {
}
`,
      clip1: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    2: -23, 6: -26, 9: -29
  }
}
`,
    })).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBeUndefined()
    expect(attr.getValueAtTime(2)).toBe(-23)
    expect(attr.getTimeSampleKeys()).toEqual([0, 2, 6, 9])
  })

  it('test_MultipleClipsWithTimesSpanningClips2', async () => {
    const attr = (await openClips({
      active: [[100.5, 0], [101.25, 1]], times: [[100.5, 100.5], [102, 102]],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    100.5: 100.5, 101: 101
  }
}
`,
      clip1: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    101.25: 151.25, 101.5: 201.5, 102: 202
  }
}
`,
    })).get('/Model.value')!
    expect([100.5, 100.75, 101, 101.25, 101.5, 101.75, 102].map(t => attr.getValueAtTime(t)))
      .toEqual([100.5, 100.75, 101, 151.25, 201.5, 201.75, 202])
  })

  it('test_GetTimeSamplesInIntervalWithInterpolation', async () => {
    const attr = (await openClips()).get('/Model.value')!
    expect(typeof attr.getTimeSamplesInInterval).toBe('function')
    expect(attr.getTimeSamplesInInterval(new GfInterval(0, 10))).toEqual([0, 10])
  })

  it('test_ClipTimesBracketingTimeSamplePrecision', async () => {
    const attr = (await openClips({ active: [[101, 0]], times: [], clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    101: 1, 101.99: 2, 102: 3, 103: 4
  }
}
` })).get('/Model.value')!
    expect(typeof attr.getBracketingTimeSamples).toBe('function')
    expect(attr.getBracketingTimeSamples(101.9)).toEqual([101, 101.99])
  })

  it('test_ClipFlatten', async () => {
    const stage = await openClips({ active: [[0, 0]] })
    const flat = stage.flatten()
    expect(flat.getField('/Model.value', 'timeSamples')).toEqual([[0, 0], [10, 10]])
    expect(flat.getField('/Model', 'clips')).toBeUndefined()
  })

  it('test_ClipManifestFallback', async () => {
    const attr = (await openClips({
      active: [[0, 0]], clip0: `#usda 1.0
def "Clip" {
}
`,
      manifest: `#usda 1.0
def "Clip" {
  double value = 42
}
`,
    })).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBe(42)
  })

  it('test_ClipManifestFallback2', async () => {
    const attr = (await openClips({
      interpolate: true, clip0: `#usda 1.0
def "Clip" {
}
`,
      manifest: `#usda 1.0
def "Clip" {
  double value = 42
}
`,
    })).get('/Model.value')!
    expect(attr.getValueAtTime(5)).toBe(76)
  })

  it('test_ClipManifestAutoGeneration', async () => {
    const attr = (await openClips({ active: [[0, 0]], clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 7
  }
}
` })).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBe(7)
  })

  it('test_ClipTemplateManifestAutoGeneration', async () => {
    const stage = await openFixture(`#usda 1.0
def "Model" (clips = {
  dictionary default = {
    string templateAssetPath = "clip.###.usda"
    double templateStartTime = 1
    double templateEndTime = 2
    double templateStride = 1
    string primPath = "/Clip"
  }
}
) {
  double value
}
`, {
      'clip.001.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    1: 1
  }
}
`,
      'clip.002.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    2: 2
  }
}
`,
    })
    expect(stage.get('/Model.value')!.getValueAtTime(2)).toBe(2)
  })

  it('test_ClipTemplateWithOffsets', async () => {
    const stage = await openFixture(`#usda 1.0
def Xform "Model" (references = @./template.usda@ (offset = 2)) {
}
`, {
      'template.usda': `#usda 1.0
(defaultPrim = "Template")
def "Template" (clips = {
  dictionary default = {
    string templateAssetPath = "clip.###.usda"
    double templateStartTime = 1
    double templateEndTime = 3
    double templateStride = 1
    string primPath = "/Clip"
  }
}
) {
  double value
}
`,
      'clip.001.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    1: 1
  }
}
`,
      'clip.002.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    2: 2
  }
}
`,
      'clip.003.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    3: 3
  }
}
`,
    })
    expect([3, 4, 5, 6].map(t => stage.get('/Model.value')!.getValueAtTime(t))).toEqual([1, 2, 3, 3])
  })

  it('test_ClipsWithSparseOverrides', async () => {
    const stage = await openFixture(`#usda 1.0
(subLayers = [@./base.usda@])
over "main" (clips = {
  dictionary default = {
    double2[] active = [(100, 1), (102, 0)]
  }
}
) {
}
`, {
      'base.usda': `#usda 1.0
def "main" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./a.usda@, @./b.usda@]
    string primPath = "/Clip"
    double2[] active = [(100, 0), (102, 1)]
  }
}
) {
  double foo
}
`,
      'a.usda': `#usda 1.0
def "Clip" {
  double foo.timeSamples = {
    101: 1
  }
}
`,
      'b.usda': `#usda 1.0
def "Clip" {
  double foo.timeSamples = {
    103: 3
  }
}
`,
    })
    // OpenUSD 26.11.1: 2 — the stronger active [(100, 1), (102, 0)] makes
    // b.usda (sample 103: 3) active from 100 and a.usda (101: 1) from 102;
    // t=101 interpolates b's held 3 toward a's 1 (clipSet.cpp:706-724).
    expect(stage.get('/main.foo')!.getValueAtTime(101)).toBe(2)
  })

  it('test_InterpolateSamplesToNextClip2', async () => {
    const attr = (await openClips({
      active: [[0, 0], [1, 1]], times: [[0, 0], [1, 1], [1, 0], [3, 2]],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 10, 1: 100
  }
}
`,
      clip1: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 20, 2: 40
  }
}
`,
    })).get('/Model.value')!
    expect(attr.getValueAtTime(0.5)).toBe(55)
    expect(attr.getValueAtTime(1)).toBe(20)
  })

  it('test_ClipPreTimeAtJumpDiscontinuity', async () => {
    // Live v26.08: the first mapping at the repeated external time supplies
    // PreTime(2), while the second mapping supplies the ordinary query.
    const attr = (await openClips({
      active: [[0, 0]], times: [[0, 0], [2, 2], [2, 0], [4, 2]],
      clip0: `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 0, 2: 2
  }
}
`,
    })).get('/Model.value')!
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(2))).toBe(2)
    expect(attr.getValueAtTime(2)).toBe(0)
  })

  it('test_AssetPathValuesInClips', async () => {
    const attr = (await openClips({ active: [[0, 0]], clip0: `#usda 1.0
def "Clip" {
  asset value.timeSamples = {
    0: @./texture.png@
  }
}
` })).get('/Model.value')!
    expect(attr.getValueAtTime(0)).toBe('./texture.png')
  })

  it('test_ClipTimeCodeTiming', async () => {
    const attr = (await openClips({ active: [[0, 0]], times: [[0, 10], [10, 20]], clip0: `#usda 1.0
def "Clip" {
  timecode value.timeSamples = {
    10: 10, 20: 20
  }
}
` })).get('/Model.value')!
    expect(attr.getValueAtTime(5)).toBe(5)
  })

  it('test_ClipsWithLayerOffsets', async () => {
    const stage = await openFixture(`#usda 1.0
def Xform "Host" (references = @./model.usda@ (offset = 2)) {
}
`, {
      'model.usda': `#usda 1.0
(defaultPrim = "Model")
def Xform "Model" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./clip.usda@]
    double2[] active = [(0, 0)]
    string primPath = "/Clip"
  }
}
) {
  double value
}
`,
      'clip.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    1: 1, 2: 2, 3: 3
  }
}
`,
    })
    expect(stage.get('/Host.value')!.getValueAtTime(3)).toBe(1)
  })

  it('test_TimeCodeClipsWithLayerOffsets', async () => {
    const stage = await openFixture(`#usda 1.0
def Xform "Host" (references = @./model.usda@ (offset = 2)) {
}
`, {
      'model.usda': `#usda 1.0
(defaultPrim = "Model")
def Xform "Model" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./clip.usda@]
    double2[] active = [(0, 0)]
    string primPath = "/Clip"
  }
}
) {
  timecode value
}
`,
      'clip.usda': `#usda 1.0
def "Clip" {
  timecode value.timeSamples = {
    1: 1
  }
}
`,
    })
    expect(stage.get('/Host.value')!.getValueAtTime(3)).toBe(3)
  })

  it('test_TemplateFileFormatArguments', () => {
    const stage = Stage.createNew()
    const api = new ClipsAPI(stage.definePrim('/Model'), stage)
    api.setClipTemplateAssetPath('clip.###.usd:SDF_FORMAT_ARGS:a=1&b=str')
    api.setClipTemplateStartTime(2)
    api.setClipTemplateEndTime(2)
    expect(api.computeClipAssetPaths()).toEqual(['clip.002.usd:SDF_FORMAT_ARGS:a=1&b=str'])
  })

  it('test_SublayerChanges', async () => {
    const stage = await openFixture(`#usda 1.0
(subLayers = [@./sub.usda@])
`, {
      'sub.usda': `#usda 1.0
def "Model" (clips = {
  dictionary default = {
    asset[] assetPaths = [@./clip.usda@]
    double2[] active = [(0, 0)]
    string primPath = "/Clip"
  }
}
) {
  double value
}
`,
      'clip.usda': `#usda 1.0
def "Clip" {
  double value.timeSamples = {
    0: 9
  }
}
`,
    })
    expect(stage.get('/Model.value')!.getValueAtTime(0)).toBe(9)
    await stage.muteLayer('sub.usda')
    expect(stage.getPrim('/Model')).toBeUndefined()
  })
})

// Fixtures: testenv/testUsdValueClips/{timingDiscontinuity,multiclip} vendored
// verbatim from OpenUSD v26.11.1 into ./fixtures/testUsdValueClips/.
function upstreamFixture(dir: string): Record<string, string> {
  const root = fileURLToPath(new URL(`./fixtures/testUsdValueClips/${dir}/`, import.meta.url))
  const out: Record<string, string> = {}
  for (const name of readdirSync(root)) out[name] = readFileSync(root + name, 'utf8')
  return out
}

async function openUpstreamFixture(dir: string): Promise<Stage> {
  files = upstreamFixture(dir)
  return (await Stage.open('root.usda'))!
}

type ClipAttr = NonNullable<ReturnType<Stage['get']>>

// testUsdValueClips.py:180-188 (CheckValue): Attribute.Get and
// UsdAttributeQuery.Get agree.
function checkValue(attr: ClipAttr, time: number | UsdTimeCode, expected: unknown): void {
  expect(attr.getValueAtTime(time)).toBe(expected)
  expect(new UsdAttributeQuery(attr).get(time)).toBe(expected)
}

// testUsdValueClips.py:39-120 (CheckTimeSamples).
async function checkTimeSamples(stage: Stage, attr: ClipAttr): Promise<void> {
  const all = attr.getTimeSampleKeys()
  expect(new UsdAttributeQuery(attr).getNumTimeSamples()).toBe(all.length)
  for (let i = 0; i < all.length - 1; i++) {
    const lower = all[i]!
    const upper = all[i + 1]!
    expect(attr.getBracketingTimeSamples(lower)).toEqual([lower, lower])
    expect(attr.getBracketingTimeSamples(upper)).toEqual([upper, upper])
    for (let t = Math.trunc(lower) + 1; t < Math.trunc(upper); t++) {
      expect(attr.getBracketingTimeSamples(t)).toEqual([lower, upper])
    }
    if (lower !== upper) {
      expect(attr.getBracketingTimeSamples(lower + (upper - lower) / 2)).toEqual([lower, upper])
    }
  }
  const previous = stage.getInterpolationType()
  stage.setInterpolationType(InterpolationTypeHeld)
  await stage.flushChanges()
  for (let i = 0; i < all.length - 1; i++) {
    const lower = all[i]!
    for (let t = Math.trunc(lower) + 1; t < Math.trunc(all[i + 1]!); t++) {
      expect(attr.getValueAtTime(t)).toBe(attr.getValueAtTime(lower))
    }
  }
  stage.setInterpolationType(previous)
  await stage.flushChanges()
  if (all.length > 0) {
    const first = all[0]!
    const last = all[all.length - 1]!
    expect(attr.getBracketingTimeSamples(first - 1)).toEqual([first, first])
    expect(attr.getValueAtTime(first - 1)).toBe(attr.getValueAtTime(first))
    expect(attr.getBracketingTimeSamples(last + 1)).toEqual([last, last])
    expect(attr.getValueAtTime(last + 1)).toBe(attr.getValueAtTime(last))
  }
  if (all.length > 2) {
    const start = all[0]!
    let end = start
    expect(attr.getTimeSamplesInInterval(new GfInterval(start - 1, end, true, false))).toEqual([])
    while (end < all[all.length - 1]!) {
      expect(attr.getTimeSamplesInInterval(new GfInterval(start, end)))
        .toEqual(all.filter(t => t <= end))
      end += 1
    }
  }
}

describe('testUsdValueClips — upstream fixtures', () => {
  it('test_ClipTimingDiscontinuities (timingDiscontinuity/)', async () => {
    // testUsdValueClips.py:1144-1174
    const stage = await openUpstreamFixture('timingDiscontinuity')
    const attr = stage.get('/World.value')!
    checkValue(attr, 6, 6)
    checkValue(attr, 7, 7)
    checkValue(attr, 8, 8)
    checkValue(attr, 9, 9)
    checkValue(attr, 9.5, 9.5)
    checkValue(attr, 10 - UsdTimeCode.safeStep(), 10 - UsdTimeCode.safeStep())
    checkValue(attr, 10, 0)
    checkValue(attr, 11, 1)
    checkValue(attr, 12, 2)
    checkValue(attr, 13, 3)
    expect(attr.getTimeSampleKeys()).toEqual(
      [-10, 0, 3, 6, 10 - UsdTimeCode.safeStep(), 10,
        13, 16, 20 - UsdTimeCode.safeStep(), 20])
    await checkTimeSamples(stage, attr)
  })

  it('test_MultipleClips (multiclip/)', async () => {
    // testUsdValueClips.py:1392-1436
    const stage = await openUpstreamFixture('multiclip')
    const attr = stage.get('/Model_1.size')!
    expect(new UsdAttributeQuery(attr).valueMightBeTimeVarying()).toBe(true)
    checkValue(attr, 5, -5)
    checkValue(attr, 10, -10)
    checkValue(attr, 15, -15)
    checkValue(attr, 16, -23)
    checkValue(attr, 19, -23)
    checkValue(attr, 22, -26)
    checkValue(attr, 25, -29)
    checkValue(attr, 16, -23)
    expect(attr.getBracketingTimeSamples(16)).toEqual([16, 16])
    expect(attr.getTimeSampleKeys()).toEqual(
      [0.0, 5.0, 10.0, 15.0, 16.0 - UsdTimeCode.safeStep(), 16.0, 19.0,
        22.0, 25.0, 32.0])
    expect(attr.getTimeSamplesInInterval(new GfInterval(0, 30))).toEqual(
      [0.0, 5.0, 10.0, 15.0, 16.0 - UsdTimeCode.safeStep(), 16.0, 19.0,
        22.0, 25.0])
    await checkTimeSamples(stage, attr)
  })

  it('test_MultipleClips (multiclip/): pre-time at the clip boundary', async () => {
    // testUsdValueClips.py:1404-1408: PreTime(16) resolves in clip1.
    const stage = await openUpstreamFixture('multiclip')
    const attr = stage.get('/Model_1.size')!
    checkValue(attr, UsdTimeCode.PreTime(16), -15)
  })
})
