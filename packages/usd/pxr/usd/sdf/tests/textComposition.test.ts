import { _setResolverForTest } from 'typescript-usd/ar/_internal'
import { _resolverContextForResolver } from 'typescript-usd/ar/_internal'
// W1a: USDA text parser prim metadata — references, payloads, inherits,
// variantSets, variantSelection, active, apiSchemas now parse into the same
// field shapes the USDC parser produces, so text-authored composition arcs
// compose identically to binary. (Previously the parser skipped metadata
// parens entirely — text arcs silently did not compose.)

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArInMemoryResolver, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { Layer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { parseUsda } from '../src/textFileFormatParser.ts'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> {
    const name = path.split('/').pop() ?? path
    return new ArResolvedPath(files[name] === undefined ? '' : path)
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const name = path.toString().split('/').pop() ?? path.toString()
    const text = files[name]
    return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ASSET = `#usda 1.0
(
    defaultPrim = "Asset"
)
def Xform "Asset"
{
    def Sphere "Geo"
    {
        double radius = 3
    }
}
def Xform "Other"
{
    double marker = 7
}
`

describe('USDA references', () => {
  it('a file reference composes the referenced subtree', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    references = @./asset.usda@</Asset>
)
{
}
`,
      'asset.usda': ASSET,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model')?.typeName).toBe('Xform')   // from the referenced prim
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
  })

  it('prepend references qualifier composes too', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    prepend references = @./asset.usda@</Asset>
)
{
}
`,
      'asset.usda': ASSET,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
  })

  it('a reference without a prim path targets defaultPrim', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    references = @./asset.usda@
)
{
}
`,
      'asset.usda': ASSET,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
  })

  it('local opinions are stronger than referenced opinions', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    references = @./asset.usda@</Asset>
)
{
    over "Geo"
    {
        double radius = 99
    }
}
`,
      'asset.usda': ASSET,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(99)
  })

  it('internal references (bare prim path) compose from the same layer', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "Source"
{
    double tag = 42
}
def "Alias" (
    references = </Source>
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Alias')?.getAttr('tag')?.getValue()).toBe(42)
  })

  it('a reference list composes every entry (strength in list order)', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    references = [@./asset.usda@</Asset>, @./asset.usda@</Other>]
)
{
}
`,
      'asset.usda': ASSET,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
    expect(stage.getPrim('/Model')?.getAttr('marker')?.getValue()).toBe(7)
  })

  it('a reference layer offset retimes the referenced time samples', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    references = @./anim.usda@</A> (offset = 10)
)
{
}
`,
      'anim.usda': `#usda 1.0
def Xform "A"
{
    double height = 0
    double height.timeSamples = { 0: 0, 5: 5 }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.getPrim('/Model')?.getAttr('height')
    expect(attr?.getTimeSampleKeys()).toEqual([10, 15])
    expect(attr?.getValueAtTime(15)).toBe(5)
  })

  it('payload composes like a reference', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    payload = @./asset.usda@</Asset>
)
{
}
`,
      'asset.usda': ASSET,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
  })
})

describe('USDA inherits', () => {
  it('inherits composes class opinions', async () => {
    files = {
      'root.usda': `#usda 1.0
class "_proto"
{
    double shared = 5
}
def Xform "Inst" (
    inherits = </_proto>
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Inst')?.getAttr('shared')?.getValue()).toBe(5)
  })
})

describe('USDA variant sets', () => {
  const VARIANT_ROOT = (selection: string) => `#usda 1.0
def Xform "Rig" (
    variants = {
        string look = "${selection}"
    }
    prepend variantSets = "look"
)
{
    variantSet "look" = {
        "red" {
            double tint = 1

            def Sphere "RedGeo"
            {
                double radius = 10
            }
        }
        "blue" {
            double tint = 2

            def Cube "BlueGeo"
            {
                double size = 20
            }
        }
    }
}
`

  it('the selected variant composes its properties and children', async () => {
    files = { 'root.usda': VARIANT_ROOT('red') }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Rig')?.getAttr('tint')?.getValue()).toBe(1)
    expect(stage.getPrim('/Rig/RedGeo')?.getAttr('radius')?.getValue()).toBe(10)
    expect(stage.has('/Rig/BlueGeo')).toBe(false)
  })

  it('a different selection picks the other variant', async () => {
    files = { 'root.usda': VARIANT_ROOT('blue') }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Rig')?.getAttr('tint')?.getValue()).toBe(2)
    expect(stage.getPrim('/Rig/BlueGeo')?.getAttr('size')?.getValue()).toBe(20)
    expect(stage.has('/Rig/RedGeo')).toBe(false)
  })

  it('parser emits canonical SdfPath variant specs', () => {
    const scene = parseUsda(VARIANT_ROOT('red'))
    expect((scene['/Rig']!['variantSetChildren'] as { value: unknown }).value).toEqual(['look'])
    expect((scene['/Rig']!['variantSelection'] as { value: unknown }).value).toEqual({ look: 'red' })
    expect((scene['/Rig{look=}']!['variantChildren'] as { value: unknown }).value).toEqual(['red', 'blue'])
    expect(scene['/Rig{look=red}.tint']).toBeDefined()
    expect(scene['/Rig{look=red}RedGeo']).toBeDefined()
  })

  it('addresses a variant-scoped opinion through a constructed SdfPath', async () => {
    const text = VARIANT_ROOT('red')
    const layer = Layer.createInMemory('variant-key.usda', text)
    const propertyPath = SdfPath.absoluteRootPath
      .appendChild('Rig')
      .appendVariantSelection('look', 'red')
      .appendProperty('tint')
    expect(layer.getField(propertyPath.pathString, 'default')).toBe(1)
    files = { 'root.usda': text }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Rig')?.getAttr('tint')?.getPropertyStack()[0]?.value).toBe(1)
  })
})

describe('USDA scalar prim metadata', () => {
  it('active = false prunes the subtree', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "On"
{
    double a = 1
}
def Xform "Off" (
    active = false
)
{
    def Sphere "Hidden"
    {
    }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.has('/On')).toBe(true)
    expect(stage.has('/Off/Hidden')).toBe(false)
  })

  it('kind and apiSchemas parse into fields', () => {
    const scene = parseUsda(`#usda 1.0
def Mesh "M" (
    kind = "component"
    prepend apiSchemas = ["MaterialBindingAPI"]
)
{
}
`)
    expect((scene['/M']!['kind'] as { value: unknown }).value).toBe('component')
    const api = (scene['/M']!['apiSchemas'] as { value: { prependedItems: string[] } }).value
    expect(api.prependedItems).toEqual(['MaterialBindingAPI'])
  })
})

// The resolver-scoped form works identically (no global reader involved)
describe('text composition through a scoped resolver', () => {
  it('references resolve through the stage resolver', async () => {
    const local: Record<string, string> = {
      'root.usda': `#usda 1.0
def "Model" (
    references = @./asset.usda@</Asset>
)
{
}
`,
      'asset.usda': ASSET,
    }
    const resolver = new ArInMemoryResolver(Object.fromEntries(
      Object.entries(local).map(([name, text]) => [name, new TextEncoder().encode(text)])))
    files = {}   // global fs is empty — everything must go through the resolver
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
  })
})
