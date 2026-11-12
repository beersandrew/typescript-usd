// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/fileIO_Common.cpp, pxr/usd/sdf/usdaFileFormat.cpp,
//  pxr/usd/sdf/testenv/testSdfParsing.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/ar/_internal'
// W1b: USDA writer serializes composition metadata — references, payloads,
// inherits, variantSets (with full variant bodies), sublayers (+offsets),
// active/kind/apiSchemas — so layered projects round-trip through text.
// Oracle: parse → serialize → re-parse must produce identical composition.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { serializeUsda } from 'typescript-usd/sdf'
import { parseUsda } from '../src/textFileFormatParser.ts'
import { Layer } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// Round-trips text through parse → serialize → parse.
function reserialize(text: string): { out: string; scene: ReturnType<typeof parseUsda> } {
  const layer = Layer.createInMemory('roundtrip.usda', text)
  const out = serializeUsda(layer)
  return { out, scene: parseUsda(out) }
}

describe('USDA writer — composition metadata round-trip', () => {
  it('references with prim path and layer offset', () => {
    const { out, scene } = reserialize(`#usda 1.0
def "Model" (
    references = @./asset.usda@</Asset> (offset = 10; scale = 2)
)
{
}
`)
    expect(out).toContain('references = @./asset.usda@</Asset> (offset = 10; scale = 2)')
    const lop = (scene['/Model']!['references'] as { value: { explicitItems: unknown[] } }).value
    expect(lop.explicitItems).toEqual([
      { assetPath: './asset.usda', primPath: '/Asset', layerOffset: { offset: 10, scale: 2 } },
    ])
  })

  it('prepend references qualifier survives', () => {
    const { out } = reserialize(`#usda 1.0
def "Model" (
    prepend references = @./a.usda@
)
{
}
`)
    expect(out).toContain('prepend references = @./a.usda@')
  })

  it('internal reference (bare prim path)', () => {
    const { out } = reserialize(`#usda 1.0
def Xform "Source"
{
}
def "Alias" (
    references = </Source>
)
{
}
`)
    expect(out).toContain('references = </Source>')
  })

  it('payload and inherits', () => {
    const { out } = reserialize(`#usda 1.0
class "_cls"
{
}
def "M" (
    payload = @./p.usda@</P>
    inherits = </_cls>
)
{
}
`)
    expect(out).toContain('payload = @./p.usda@</P>')
    // Native fileIO_Common.cpp:289-302 leaves singleton path lists unbracketed.
    expect(out).toContain('inherits = </_cls>')
  })

  it('variantSets round-trip with full variant bodies', async () => {
    const SRC = `#usda 1.0
def Xform "Rig" (
    variants = {
        string look = "red"
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
        }
    }
}
`
    const { out } = reserialize(SRC)
    // The re-serialized text must COMPOSE identically
    files = { 'root.usda': out }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Rig')?.getAttr('tint')?.getValue()).toBe(1)
    expect(stage.getPrim('/Rig/RedGeo')?.getAttr('radius')?.getValue()).toBe(10)
    expect(stage.has('/Rig/BlueGeo')).toBe(false)
  })

  it('sublayers with offsets round-trip and compose', async () => {
    const SRC = `#usda 1.0
(
    subLayers = [@./sub.usda@ (offset = 10), @./plain.usda@]
)
`
    const { out } = reserialize(SRC)
    // Upstream writes sublayers one per line (usdaFileFormat.cpp _WriteLayer).
    expect(out).toContain(
      'subLayers = [\n        @./sub.usda@ (offset = 10),\n        @./plain.usda@\n    ]')

    files = {
      'root.usda': out,
      'sub.usda': `#usda 1.0
def Xform "A"
{
    double v = 0
    double v.timeSamples = { 0: 0, 5: 5 }
}
`,
      'plain.usda': `#usda 1.0
def Xform "B"
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/A')?.getAttr('v')?.getTimeSampleKeys()).toEqual([10, 15])
    expect(stage.has('/B')).toBe(true)
  })

  it('active/kind/apiSchemas', () => {
    const { out } = reserialize(`#usda 1.0
def Mesh "M" (
    active = false
    kind = "component"
    prepend apiSchemas = ["MaterialBindingAPI"]
)
{
}
`)
    expect(out).toContain('active = false')
    expect(out).toContain('kind = "component"')
    expect(out).toContain('prepend apiSchemas = ["MaterialBindingAPI"]')
  })

  it('permission metadata uses the registered enum spelling', () => {
    // OpenUSD v26.08 pxr/usd/sdf/fileIO_Common.cpp:1152-1162 emits
    // SdfPermission values as bare public/private identifiers.
    const { out } = reserialize(`#usda 1.0
def Scope "Private" (
    permission = private
)
{
    int value (
        permission = public
    )
}
`)
    expect(out).toContain('permission = private')
    expect(out).toContain('permission = public')
    expect(out).not.toMatch(/permission = ["'](?:private|public)["']/)
  })

  it('reorder nameChildren + reorder properties round-trip (PrimOrder/PropertyOrder)', () => {
    // Sdf_WritePrimNamespaceReorders: reorder properties / nameChildren are the
    // deprecated PropertyOrder / PrimOrder fields, emitted with a size() > 1
    // guard. Baseline: testSdfParsing 81_namespace_reorder.usda.
    const { out, scene } = reserialize(`#usda 1.0
def Scope "foo"
{
    reorder properties = ["destructive", "brilliant", "orally_fixated"]
    reorder nameChildren = ["bart", "lisa", "maggie"]
    custom rel rel1 = </Blah>

    def Scope "lisa"
    {
    }
    def Scope "bart"
    {
    }
    def Scope "maggie"
    {
    }
}
`)
    expect(out).toContain('reorder properties = ["destructive", "brilliant", "orally_fixated"]')
    expect(out).toContain('reorder nameChildren = ["bart", "lisa", "maggie"]')
    expect((scene['/foo']!['propertyOrder'] as { value: string[] }).value)
      .toEqual(['destructive', 'brilliant', 'orally_fixated'])
    expect((scene['/foo']!['primOrder'] as { value: string[] }).value)
      .toEqual(['bart', 'lisa', 'maggie'])
  })

  it('reorder rootPrims round-trip (layer-level PrimOrder)', () => {
    // usdaFileFormat.cpp: "reorder rootPrims = " — a top-level statement after
    // the layer metadata block, stored as primOrder on the root spec.
    const { out, scene } = reserialize(`#usda 1.0
def "flanders"
{
}
def "wiggum"
{
}
def "skinner"
{
}
reorder rootPrims = ["flanders", "wiggum", "skinner"]
`)
    expect(out).toContain('reorder rootPrims = ["flanders", "wiggum", "skinner"]')
    expect((scene['/']!['primOrder'] as { value: string[] }).value)
      .toEqual(['flanders', 'wiggum', 'skinner'])
  })

  it('reorder composition list-op (ordered bucket) round-trips', () => {
    // The deprecated reorder qualifier on a composition list-op fills the
    // listOp ordered bucket (_orderedItems / GetOrderedItems), emitted by
    // _WriteListOp as `reorder <field> = [...]`.
    const { out, scene } = reserialize(`#usda 1.0
def "M" (
    reorder references = [@./a.usda@, @./b.usda@]
)
{
}
`)
    // Native testSdfParsing.testenv/baseline/132_references.usda:79-82.
    expect(out).toContain('reorder references = [\n        @./a.usda@,\n        @./b.usda@\n    ]')
    const lop = (scene['/M']!['references'] as { value: { orderedItems: unknown[] } }).value
    expect(lop.orderedItems).toEqual([
      { assetPath: './a.usda', primPath: '', layerOffset: { offset: 0, scale: 1 } },
      { assetPath: './b.usda', primPath: '', layerOffset: { offset: 0, scale: 1 } },
    ])
  })

  it('a stage with live-authored sublayers serializes them', async () => {
    files = {
      'root.usda': `#usda 1.0
def "X" {
}
`,
      'extra.usda': `#usda 1.0
def "Y" {
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    await stage.setSubLayerPaths(['./extra.usda'], [{ offset: 5, scale: 1 }])

    // Export the root layer: the authored sublayers must serialize
    const layer = Layer.createInMemory('check.usda', files['root.usda']!)
    layer.setField('/', 'subLayers', stage.getSubLayerPaths())
    layer.setField('/', 'subLayerOffsets', stage.getSubLayerOffsets())
    const out = serializeUsda(layer)
    // One sublayer per line, the upstream _WriteLayer shape.
    expect(out).toContain('subLayers = [\n        @./extra.usda@ (offset = 5)\n    ]')
  })
})
