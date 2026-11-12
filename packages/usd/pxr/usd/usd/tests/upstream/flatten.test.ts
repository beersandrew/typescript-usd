// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdFlatten.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// W3: Stage.flatten() — the UsdStage::Flatten analog. A flattened layer
// holds every composed prim/property with resolved values and stage-time
// samples; composition metadata is gone except native instancing, which is
// preserved in upstream Flatten's exact shape: prototypes as root-level
// `over "Flattened_Prototype_N"`, instances instanceable with an internal
// reference.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> { const name = assetPath.split('/').pop() ?? assetPath; return new ArResolvedPath(files[name] === undefined ? '' : assetPath) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const PROP = `#usda 1.0
(
    defaultPrim = "Prop"
)
def Xform "Prop"
{
    def Mesh "geom" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        float3[] extent = [(0, 0, 0), (1, 1, 0)]
        token subdivisionScheme = "none"
        rel material:binding = </Looks/Red>
    }
}
`

const ANIM = `#usda 1.0
def Xform "Spinner"
{
    double spin = 0
    double spin.timeSamples = { 0: 0.0, 10: 90.0 }
}
`

const ROOT = `#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Y"
    metersPerUnit = 1
    subLayers = [@./anim.usda@ (offset = 5)]
)
def Xform "World" (
    kind = "group"
)
{
    def "A" (
        instanceable = true
        prepend references = @./prop.usda@
    )
    {
        double3 xformOp:translate = (5, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
    def "B" (
        instanceable = true
        prepend references = @./prop.usda@
    )
    {
        double3 xformOp:translate = (-5, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
    def Xform "Picker" (
        variantSets = "size"
        variants = { string size = "big" }
    )
    {
        variantSet "size" = {
            "big" {
                double chosen = 2
            }
            "small" {
                double chosen = 1
            }
        }
    }
}
def Scope "Looks"
{
    def Material "Red"
    {
        token outputs:surface.connect = </Looks/Red/PS.outputs:surface>
        def Shader "PS"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (1, 0, 0)
            token outputs:surface
        }
    }
}
`

const FIXTURE = { 'root.usda': ROOT, 'prop.usda': PROP, 'anim.usda': ANIM }

describe('testUsdFlatten — Stage.flatten()', () => {
  it('preserves composed child order in the flattened layer', async () => {
    // OpenUSD v26.08 pxr/usd/usd/stage.cpp:5953-5958 walks
    // UsdPrimRange::AllPrims instead of sorting namespace paths.
    files = {
      'ordered.usda': `#usda 1.0
def Scope "Gallery"
{
    def Cube "Cube" {}
    def Sphere "Sphere" {}
    def BasisCurves "BasisCurves" {}
    def Capsule "Capsule" {}
}
`,
    }
    const stage = (await Stage.open('ordered.usda'))!
    expect(stage.flatten().getField('/Gallery', 'primChildren')).toEqual([
      'Cube', 'Sphere', 'BasisCurves', 'Capsule',
    ])
  })

  it('reopening the flattened layer composes the same values (round-trip)', async () => {
    files = { ...FIXTURE }
    const original = (await Stage.open('root.usda'))!
    const flatText = original.flatten().toUsda()

    files = { ...FIXTURE, 'flat.usda': flatText }
    const reopened = (await Stage.open('flat.usda'))!

    // variants resolved away — the selected opinion is baked
    expect(reopened.getPrim('/World/Picker')?.getAttr('chosen')?.getValue()).toBe(2)
    // sublayer offset baked into stage-time samples
    const spin = reopened.getPrim('/Spinner')!.getAttr('spin')!
    expect(spin.getTimeSampleKeys()).toEqual([5, 15])
    expect(spin.getValueAtTime(15)).toBe(90)
    // kind + root metadata survive
    expect(reopened.getPrim('/World')?.typeName).toBe('Xform')
    // material network: connection paths intact
    expect(reopened.getPrim('/Looks/Red')!.getAttr('outputs:surface')!.getConnections())
      .toEqual(['/Looks/Red/PS.outputs:surface'])
    expect(reopened.getPrim('/Looks/Red/PS')!.getAttr('inputs:diffuseColor')!.getValue())
      .toEqual([1, 0, 0])

    // instancing re-established from the Flattened_Prototype shape
    const a = reopened.getPrim('/World/A')!
    expect(a.isInstance()).toBe(true)
    expect(reopened.getPrim('/World/B')!.getPrototype()?.path).toBe(a.getPrototype()?.path)
    const proxy = reopened.getPrim('/World/A/geom')!
    expect(proxy.isInstanceProxy()).toBe(true)
    expect(proxy.typeName).toBe('Mesh')
    expect(proxy.getAttr('points')?.getValue()).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]])
    // The source relationship target is outside the reference's namespace
    // scope. OpenUSD v26.08 reports and ignores it while composing the
    // prototype, so flattening preserves the empty composed target list.
    expect(proxy.getAttr('material:binding')?.getTargets()).toEqual([])
  })

  it('emits upstream Flatten\'s instancing shape', async () => {
    files = { ...FIXTURE }
    const stage = (await Stage.open('root.usda'))!
    const text = stage.flatten().toUsda()
    expect(text).toContain('over "Flattened_Prototype_1"')
    expect(text).not.toMatch(/over "Flattened_Prototype_\d+" \(\n\s+instanceable/)
    expect(text).toContain('instanceable = true')
    expect(text).toContain('append references = </Flattened_Prototype_1>')
    expect(text).toContain('apiSchemas = ["MaterialBindingAPI"]')
    expect(text).not.toContain('prepend apiSchemas')
    expect(text).not.toContain('__Prototype_')
    // variant metadata fully resolved away
    expect(text).not.toContain('variantSet')
  })
})
