// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/fileFormat.cpp,
//  pxr/usd/usdMtlx/reader.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Copyright 2018-2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 usdMtlx/fileFormat.cpp:108-125 and reader.cpp.
// Expectations are native OpenUSD layer captures: 26.08 baseline, 26.11
// implicit_unlit. The adjacent capture scripts document regeneration. No native executable is needed to run these tests.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Layer, FileFormat } from 'typescript-usd/sdf'
import '../../src/index.ts'

const fixtures = new URL('./fixtures/', import.meta.url)
const names = readdirSync(fixtures).filter(name => name.endsWith('.mtlx'))
async function compareStages(actual: Stage, expected: Stage): Promise<void> {
  try {
    const paths = [...expected.traverse()].sort()
    expect([...actual.traverse()].sort()).toEqual(paths)
    expect(actual.getCompositionErrors()).toEqual([])
    for (const path of paths) {
      const a = actual.getPrim(path)!, b = expected.getPrim(path)!
      expect(a.typeName, path).toBe(b.typeName)
      expect(a.getPropertyNames().sort(), path).toEqual(b.getPropertyNames().sort())
      for (const name of b.getPropertyNames()) {
        const x = a.getAttr(name)!, y = b.getAttr(name)!
        expect(x.getValue(), `${path}.${name} value`).toEqual(y.getValue())
        expect(x.getConnections(), `${path}.${name} connections`).toEqual(y.getConnections())
        expect(x.getTargets(), `${path}.${name} targets`).toEqual(y.getTargets())
      }
    }
  } finally { actual.dispose(); expected.dispose() }
}

describe('UsdMtlx native layer captures', () => {
  it('registers the upstream mtlx file format when its plugin is imported', () => {
    expect(FileFormat.findByExtension('material.mtlx')?.formatId).toBe('mtlx')
  })
  for (const name of names) {
    it(`composes ${name} with native prims, values and graph connections`, async () => {
      await compareStages(
        (await Stage.open(fileURLToPath(new URL(name, fixtures))))!,
        (await Stage.open(fileURLToPath(new URL(name + '.usda', fixtures))))!)
    })
  }
  for (const name of ['standard_surface_brass_tiled','implicit_unlit']) it(`composes ${name} through an external USD reference`, async () => {
    const target = fileURLToPath(new URL(`${name}.mtlx`, fixtures))
    const scene = (asset: string) => `#usda 1.0\ndef "Reference" (prepend references = @${asset}@</MaterialX>) {}`
    await compareStages(await Stage.open(Layer.createInMemory('actual.usda', scene(target))),
      await Stage.open(Layer.createInMemory('expected.usda', scene(target + '.usda'))))
  })
})
