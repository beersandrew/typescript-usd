// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The USDC writer packs every field by its value type, as OpenUSD's crate
// writer does (crateFile.cpp _PackValue). These cases were once refused by a
// guard because the writer would have dropped or retyped them; each must now
// come back from a write/read round trip unchanged.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Matrix3d, Quath } from 'typescript-usd/gf'
import { Layer, ValueBlock as SdfValueBlock } from 'typescript-usd/sdf'
import { Knot as TsKnot, Spline as TsSpline } from 'typescript-usd/ts'
import { ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import { serializeUsdc } from '../../src/crateFile.ts'

const dir = mkdtempSync(path.join(tmpdir(), 'usdc-coverage-'))
let count = 0

async function roundTrip(layer: Layer): Promise<Layer> {
  const file = path.join(dir, `layer${count++}.usdc`)
  writeFileSync(file, serializeUsdc(layer))
  return (await Layer.open(file))!
}

function layerWithAttr(typeName: string, value: unknown) {
  const layer = Layer.createAnonymous()
  layer.definePrimSpec('/Prim', 'Xform')
  layer.setField('/Prim.attr', 'typeName', typeName)
  layer.setAttrDefault('/Prim', 'attr', value)
  return layer
}

describe('USDC writer coverage', () => {
  it('writes every attribute value type', async () => {
    for (const [typeName, value] of [
      ['float2[]', [[1, 2], [3, 4]]],
      ['color4f', [1, 0.5, 0.25, 1]],
      ['int64[]', [1n, 2n, 5000000000n]],
      ['uint', 7],
      ['texCoord2f', [0.5, 0.25]],
      ['quath', new Quath(1, 0, 0, 0)],
      ['half2', [3.140625, -2]],
      ['int3', [1, 2, 300]],
      ['matrix3d', new Matrix3d(1, 0, 0, 0, 2, 0, 0, 0.5, 1)],
      ['string[]', ['a', 'b']],
      ['asset[]', ['./a.usda', './b.usda']],
      ['double[]', Array.from({ length: 40 }, (_, i) => i / 3)],
    ] as const) {
      const back = await roundTrip(layerWithAttr(typeName, value))
      expect(back.getField('/Prim.attr', 'typeName'), typeName).toBe(typeName)
      expect(back.getField('/Prim.attr', 'default'), typeName).toEqual(value)
    }
  })

  it('writes metadata, dictionaries and list ops', async () => {
    const layer = layerWithAttr('float', 1)
    layer.setField('/Prim', 'customData', { note: 'kept', nested: { count: 2 } })
    layer.setField('/Prim', 'kind', 'component')
    layer.setField('/Prim', 'apiSchemas', {
      isExplicit: false, explicitItems: [], prependedItems: ['MaterialBindingAPI'],
      appendedItems: [], deletedItems: [],
    })
    layer.setField('/Prim.attr', 'documentation', 'a float')
    const back = await roundTrip(layer)
    expect(back.getField('/Prim', 'customData')).toEqual({ note: 'kept', nested: { count: 2 } })
    expect(back.getField('/Prim', 'kind')).toBe('component')
    expect(back.getField('/Prim', 'apiSchemas')).toMatchObject({ prependedItems: ['MaterialBindingAPI'] })
    expect(back.getField('/Prim.attr', 'documentation')).toBe('a float')
  })

  it('writes variant specs', async () => {
    const layer = Layer.createAnonymous()
    layer.definePrimSpec('/Prim', 'Xform')
    layer.setField('/Prim{shape=box}', 'specifier', 'over')
    const back = await roundTrip(layer)
    expect(back.getSpecType('/Prim{shape=box}')).toBe('variant')
  })

  it('writes custom properties as custom', async () => {
    const layer = layerWithAttr('float', 1)
    layer.setField('/Prim.attr', 'custom', true)
    expect((await roundTrip(layer)).getField('/Prim.attr', 'custom')).toBe(true)
  })

  it('writes references with custom data, reorders and relocates to nothing', async () => {
    const layer = Layer.createAnonymous()
    layer.definePrimSpec('/Prim', 'Xform')
    layer.setField('/Prim', 'references', {
      isExplicit: false, explicitItems: [], appendedItems: [], deletedItems: [],
      prependedItems: [{ assetPath: './a.usda', primPath: '/A', layerOffset: { offset: 2, scale: 1 }, customData: { tag: 'x' } }],
    })
    layer.setField('/Prim', 'inheritPaths', {
      isExplicit: false, explicitItems: [], prependedItems: [], appendedItems: [], deletedItems: [],
      orderedItems: ['/B', '/A'],
    })
    layer.setField('/', 'layerRelocates', [['/Prim/Gone', '']])
    const back = await roundTrip(layer)
    expect(back.getField('/Prim', 'references')).toMatchObject({
      prependedItems: [{ assetPath: './a.usda', primPath: '/A', layerOffset: { offset: 2, scale: 1 }, customData: { tag: 'x' } }],
    })
    expect(back.getField('/Prim', 'inheritPaths')).toMatchObject({ orderedItems: ['/B', '/A'] })
    expect(back.getField('/', 'layerRelocates')).toEqual([['/Prim/Gone', '']])
  })

  it('writes empty arrays, time samples with blocks, and splines', async () => {
    const layer = layerWithAttr('float[]', [])
    layer.setField('/Prim.anim', 'typeName', 'double')
    layer.setAttrTimeSample('/Prim', 'anim', 0, 1)
    layer.setAttrTimeSample('/Prim', 'anim', 5, new SdfValueBlock())
    layer.setAttrTimeSample('/Prim', 'anim', 10, 1.5e-7)
    const spline = new TsSpline()
    for (const [time, value] of [[0, 1], [10, 4]] as const) {
      const knot = new TsKnot()
      knot.SetTime(time)
      knot.setValue(value)
      spline.setKnot(knot)
    }
    layer.setField('/Prim.curve', 'typeName', 'double')
    layer.setField('/Prim.curve', 'spline', spline)
    const back = await roundTrip(layer)
    expect(back.getField('/Prim.attr', 'default')).toEqual([])
    const samples = back.getField('/Prim.anim', 'timeSamples') as Array<[number, unknown]>
    expect(samples.map(([t]) => t)).toEqual([0, 5, 10])
    expect(samples[1]![1]).toBeInstanceOf(SdfValueBlock)
    expect(samples[2]![1]).toBe(1.5e-7)
    const curve = back.getField('/Prim.curve', 'spline') as TsSpline
    expect(curve.getKnots().map(k => [k.getTime(), k.GetValue()])).toEqual([[0, 1], [10, 4]])
  })

  it('writes array edits (crate 0.14)', () => {
    const layer = layerWithAttr('int[]', new VtArrayEdit())
    const bytes = serializeUsdc(layer)
    const reread = Layer.createInMemory('arrayEdit.usdc', bytes)
    expect(reread.getField('/Prim.attr', 'default')).toBeInstanceOf(VtArrayEdit)
  })
})
