// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Attribute values are Gf values and VtArrays, as OpenUSD's are: the text
// parser, the crate reader and authoring all produce them, and a crate array
// read is a view of the file's bytes until it is written (Sdf_CrateData's
// memory-mapped arrays; pxr/base/vt/array.h foreign data source).
import { describe, expect, it } from 'vitest'
import { Matrix4d, Quatf, Vec3f } from 'typescript-usd/gf'
import { Layer } from 'typescript-usd/sdf'
import { Array as VtArray } from 'typescript-usd/vt'
import { serializeUsdc } from '../../src/crateFile.ts'

const TEXT = `#usda 1.0
def "P"
{
    point3f[] points = [(0, 1, 2), (3, 4, 5)]
    float3 v = (1, 2, 3)
    quatf q = (1, 0, 0, 0)
    matrix4d m = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (3, 4, 5, 1))
    token[] names = ["a", "b"]
}
`

function expectTyped(layer: Layer): void {
  const points = layer.getField('/P.points', 'default') as VtArray<Vec3f>
  expect(points).toBeInstanceOf(VtArray)
  expect(points.getElementType().getTypeName()).toBe('GfVec3f')
  expect(points.cdata()).toEqual(new Float32Array([0, 1, 2, 3, 4, 5]))
  expect(layer.getField('/P.v', 'default')).toEqual(new Vec3f(1, 2, 3))
  expect(layer.getField('/P.q', 'default')).toEqual(new Quatf(1, 0, 0, 0))
  expect(layer.getField('/P.m', 'default'))
    .toEqual(new Matrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1))
  const names = layer.getField('/P.names', 'default') as VtArray<string>
  expect(names.getElementType().getTypeName()).toBe('token')
  expect(names.toArray()).toEqual(['a', 'b'])
}

describe('the value model', () => {
  it('parses text into Gf values and VtArrays', () => {
    expectTyped(Layer.createInMemory('a.usda', TEXT))
  })

  it('reads crate into the same values', () => {
    expectTyped(Layer.fromBytes(serializeUsdc(Layer.createInMemory('a.usda', TEXT)), 'a.usdc'))
  })

  it('converts plain authored values to the attribute type', () => {
    const layer = Layer.createAnonymous()
    layer.definePrimSpec('/P', 'Mesh')
    layer.setField('/P.points', 'typeName', 'point3f[]')
    layer.setAttrDefault('/P', 'points', [[0, 1, 2], [3, 4, 5]])
    layer.setField('/P.v', 'typeName', 'float3')
    layer.setAttrDefault('/P', 'v', [1, 2, 3])
    expect((layer.getField('/P.points', 'default') as VtArray<Vec3f>).cdata())
      .toEqual(new Float32Array([0, 1, 2, 3, 4, 5]))
    expect(layer.getField('/P.v', 'default')).toEqual(new Vec3f(1, 2, 3))
  })

  it('views crate array data without copying until it is written', () => {
    const layer = Layer.createAnonymous()
    layer.definePrimSpec('/P', 'Mesh')
    layer.setField('/P.points', 'typeName', 'point3f[]')
    layer.setAttrDefault('/P', 'points', Array.from({ length: 1000 }, (_, i) => [i, i, i]))
    const read = Layer.fromBytes(serializeUsdc(layer), 'a.usdc')
    const a = read.getField('/P.points', 'default') as VtArray<Vec3f>
    const b = read.getField('/P.points', 'default') as VtArray<Vec3f>
    const viewA = a.cdata() as Float32Array, viewB = b.cdata() as Float32Array
    expect(viewA.buffer).toBe(viewB.buffer)
    // A read hands out a read-only array; its copy shares the storage until
    // the copy is written.
    expect(() => a.set(0, new Vec3f(9, 9, 9))).toThrow(TypeError)
    const c = a.Clone()
    expect((c.cdata() as unknown as Float32Array).buffer).toBe(viewA.buffer)
    c.set(0, new Vec3f(9, 9, 9))
    expect((c.cdata() as unknown as Float32Array).buffer).not.toBe(viewA.buffer)
    expect(b.get(0)).toEqual(new Vec3f(0, 0, 0))
    expect(c.get(0)).toEqual(new Vec3f(9, 9, 9))
  })
})
