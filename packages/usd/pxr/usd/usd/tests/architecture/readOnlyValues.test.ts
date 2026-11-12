// Ported from OpenUSD 26.11.1: pxr/usd/sdf/data.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Values handed out by reads are read-only and shared, as upstream's are
// `const` copies of the layer's VtValues (SdfData::Get, sdf/data.cpp:204-210;
// UsdAttribute::Get, usd/stage.cpp _GetValueImpl): an edit in place throws a
// TypeError, and a caller copies a value to change it, then writes it back
// through a set.
import { describe, expect, it } from 'vitest'
import { Matrix4d, Quatf, Vec2f, Vec3f } from 'typescript-usd/gf'
import { Layer } from 'typescript-usd/sdf'
import { Stage, AttributeQuery } from 'typescript-usd/usd'
import { Array as VtArray } from 'typescript-usd/vt'
import 'typescript-usd/usdGeom'
import { serializeUsdc } from '../../../sdf/src/crateFile.ts'

const TEXT = `#usda 1.0
(
    customLayerData = { string note = "n" }
)
def Xform "P" (
    customData = { dictionary nested = { int a = 1 } string[] list = ["x"] }
    prepend apiSchemas = ["CollectionAPI:c"]
)
{
    point3f[] points = [(0, 1, 2), (3, 4, 5)]
    point3f[] points.timeSamples = { 1: [(1, 1, 1)], 2: [(2, 2, 2)] }
    float3 v = (1, 2, 3)
    float3 v.timeSamples = { 1: (1, 1, 1), 2: (3, 3, 3) }
    quatf q = (1, 0, 0, 0)
    matrix4d m = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (3, 4, 5, 1))
    string[] names = ["a", "b"]
    double3 xformOp:translate = (1, 2, 3)
    uniform token[] xformOpOrder = ["xformOp:translate"]
    rel r = </P>
}

def Camera "C"
{
}
`

// Writes `value` in place the way a caller might; returns whether it threw a
// TypeError (any other outcome fails the test).
function editInPlace(value: unknown): void {
  if (value instanceof VtArray) {
    const storage = value.cdata()
    if (!ArrayBuffer.isView(storage)) (storage as unknown[])[0] = 'edited'
    value.set(0, value.get(0))
  } else if (value instanceof Vec3f || value instanceof Vec2f) {
    (value.data as number[])[0] = 99
  } else if (value instanceof Quatf) {
    value.setReal(5)
  } else if (value instanceof Matrix4d) {
    value.setIdentity()
  } else if (Array.isArray(value)) {
    value.push('edited')
  } else if (value !== null && typeof value === 'object') {
    (value as Record<string, unknown>)['edited'] = true
  } else {
    throw new Error(`not an editable value: ${String(value)}`)
  }
}

async function stages(): Promise<Array<[string, Stage]>> {
  const text = Layer.createInMemory('a.usda', TEXT)
  const crate = Layer.fromBytes(serializeUsdc(text), 'a.usdc')
  return [['usda', await Stage.open(text)], ['usdc', await Stage.open(crate)]]
}

describe('values handed out by reads are read-only', () => {
  it('throws on an edit in place of a layer field, metadata or attribute value', async () => {
    for (const [format, stage] of await stages()) {
      const layer = stage.getRootLayer()
      const prim = stage.getPrim('/P')!
      const reads: Array<[string, () => unknown]> = [
        ['Layer.getField dictionary', () => layer.getField('/P', 'customData')],
        ['Layer.getField nested dictionary', () =>
          (layer.getField('/P', 'customData') as Record<string, unknown>)['nested']],
        ['Layer.getField list op', () => layer.getField('/P', 'apiSchemas')],
        ['Layer.getField list op items', () =>
          (layer.getField('/P', 'apiSchemas') as { prependedItems: string[] }).prependedItems],
        ['Layer.getField children', () => layer.getField('/P', 'properties')],
        ['Layer.getField points', () => layer.getField('/P.points', 'default')],
        ['Layer.queryTimeSample', () => layer.queryTimeSample('/P.points', 1)],
        ['Layer.getField layer metadata', () => layer.getField('/', 'customLayerData')],
        ['Prim.getMetadata', () => prim.getMetadata('customData')],
        ['Stage.getMetadata', () => stage.getMetadata('customLayerData')],
        ['Attribute.getValue VtArray<GfVec3f>', () => prim.getAttr('points')!.getValue()],
        ['Attribute.getValue VtArray<string>', () => prim.getAttr('names')!.getValue()],
        ['Attribute.getValue GfVec3f', () => prim.getAttr('v')!.getValue()],
        ['Attribute.getValue GfQuatf', () => prim.getAttr('q')!.getValue()],
        ['Attribute.getValue GfMatrix4d', () => prim.getAttr('m')!.getValue()],
        ['Attribute.getValueAtTime held', () => prim.getAttr('points')!.getValueAtTime(1)],
        ['Attribute.getValueAtTime interpolated', () => prim.getAttr('v')!.getValueAtTime(1.5)],
        ['AttributeQuery.get', () => new AttributeQuery(prim.getAttr('points')!).get(2)],
        ['Attribute.getMetadata', () => prim.getAttr('xformOpOrder')!.getMetadata('default')],
        ['Attribute.getFallbackValue', () =>
          stage.getPrim('/C')!.getAttr('clippingRange')!.getFallbackValue()],
        ['Attribute.getValue fallback', () => stage.getPrim('/C')!.getAttr('clippingRange')!.getValue()],
        ['Relationship target metadata', () => prim.getRelationshipAtPath('/P.r')!.getMetadata('targetPaths')],
      ]
      for (const [what, read] of reads) {
        const value = read()
        expect(value, `${format}: ${what}`).toBeDefined()
        expect(() => editInPlace(value), `${format}: ${what}`).toThrow(TypeError)
      }
      // Nothing changed: every read equals the same read of a fresh stage.
      const fresh = await Stage.open(format === 'usda'
        ? Layer.createInMemory('b.usda', TEXT)
        : Layer.fromBytes(serializeUsdc(Layer.createInMemory('b.usda', TEXT)), 'b.usdc'))
      const freshPrim = fresh.getPrim('/P')!
      expect(prim.getMetadata('customData')).toEqual(freshPrim.getMetadata('customData'))
      expect(layer.getField('/P', 'apiSchemas')).toEqual(fresh.getRootLayer().getField('/P', 'apiSchemas'))
      for (const name of ['points', 'names', 'v', 'q', 'm']) {
        expect(prim.getAttr(name)!.getValue()).toEqual(freshPrim.getAttr(name)!.getValue())
      }
    }
  })

  it('edits a copy and writes it back', async () => {
    const stage = await Stage.open(Layer.createInMemory('a.usda', TEXT))
    const prim = stage.getPrim('/P')!
    const attr = prim.getAttr('points')!
    const read = attr.getValue() as VtArray<Vec3f>
    const copy = read.Clone()
    copy.set(0, new Vec3f(9, 9, 9))
    expect(read.get(0)).toEqual(new Vec3f(0, 1, 2))
    attr.set(copy)
    expect((attr.getValue() as VtArray<Vec3f>).get(0)).toEqual(new Vec3f(9, 9, 9))
    // The stored value is the layer's: editing the array given to set()
    // afterwards does not reach it.
    copy.set(0, new Vec3f(7, 7, 7))
    expect((attr.getValue() as VtArray<Vec3f>).get(0)).toEqual(new Vec3f(9, 9, 9))

    const customData = prim.getMetadata('customData') as Record<string, unknown>
    prim.setMetadata('customData', { ...customData, extra: 1 })
    const before = { ...customData }
    expect(prim.getMetadata('customData')).toEqual({ ...before, extra: 1 })
    expect(customData).toEqual(before)
  })
})
