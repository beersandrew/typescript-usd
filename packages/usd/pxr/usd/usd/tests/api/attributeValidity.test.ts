// Ported from OpenUSD 26.11.1: pxr/usd/usd/attributeQuery.h,
//  pxr/usd/usd/object.h, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native expectations: ../fixtures/attributeValidity (FIXTURES.md).
// UsdPrim::GetAttribute returns an object whose IsValid() reports whether
// the defining spec is an attribute (object.h:127-137,
// stage.cpp:5489-5523); an AttributeQuery held across the removal of its
// attribute is invalid and yields no value (attributeQuery.h:112-114).
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Layer } from 'typescript-usd/sdf'
import { AttributeQuery, Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'

const fixture = fileURLToPath(new URL('../fixtures/attributeValidity/', import.meta.url))
const native = JSON.parse(readFileSync(fixture + 'expected.json', 'utf8')).payload as {
  getAttributeIsValid: Record<string, boolean>
  hasAttribute: Record<string, boolean>
  removedTimeSampleQuery: {
    before: { valid: boolean, value5: number }
    after: { valid: boolean, value5: number | null, valueDefault: number | null, timeSamples: number[], attrValid: boolean }
  }
}

it('Prim.getAttr gives an attribute object that is valid only for an attribute', async () => {
  const layer = Layer.createInMemory('attributeValidity.usda', readFileSync(fixture + 'stage.usda', 'utf8'))
  const prim = (await Stage.open(layer)).getPrim('/A')!
  const names = Object.keys(native.getAttributeIsValid)
  expect(Object.fromEntries(names.map(name => [name, prim.getAttr(name)!.isValid()])))
    .toEqual(native.getAttributeIsValid)
  expect(Object.fromEntries(names.map(name => [name, prim.hasAttribute(name)])))
    .toEqual(native.hasAttribute)
})

it('an AttributeQuery held across removeProperty is invalid and yields no value', () => {
  const stage = Stage.createNew()
  const prim = stage.definePrim('/A')
  const attr = prim.createAttribute('x', 'double')
  attr.setTimeSample(0, 1)
  attr.setTimeSample(10, 3)
  const query = new AttributeQuery(attr)
  const { before, after } = native.removedTimeSampleQuery
  expect({ valid: query.isValid(), value5: query.get(5) }).toEqual(before)
  prim.removeProperty('x')
  expect({
    valid: query.isValid(), value5: query.get(5) ?? null, valueDefault: query.get() ?? null,
    timeSamples: query.getTimeSamples(), attrValid: attr.isValid(),
  }).toEqual(after)
})
