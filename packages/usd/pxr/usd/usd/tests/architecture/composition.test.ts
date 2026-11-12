// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Local instructive composition evidence. The governing arc semantics are in
// OpenUSD v26.08 pxr/usd/pcp/primIndex.cpp and pxr/usd/usd/stage.cpp.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from '../../src/index.ts'

const fixtures = fileURLToPath(new URL('fixtures/composition/', import.meta.url))
const open = (name: string) => Stage.open(path.join(fixtures, name, 'entry.usda')).then(value => value!)

describe('local composition evidence', () => {
  it('composes prims and properties from multiple sublayers', async () => {
    const stage = await open('sublayers')
    for (const primPath of [
      '/RootBaseClass', '/RootBaseClass/FirstChild', '/RootBaseClass/InheritedChild',
      '/Root/FirstChild', '/Root/FromSecondLayer', '/Root/InheritedChild',
      '/Root/FromReference', '/WithVariants/Short', '/Sleeping', '/FromSecond',
    ]) expect(stage.has(primPath), `missing path: ${primPath}`).toBe(true)
    expect(stage.has('/Sleeping/SleepingChild')).toBe(false)
  })

  it('remaps prim paths via layer relocates', async () => {
    const stage = await open('relocates')
    for (const primPath of ['/Foo', '/Foo/Foo', '/Root', '/Root/ChildB', '/Root/Spam']) {
      expect(stage.has(primPath), `missing path: ${primPath}`).toBe(true)
    }
    expect(stage.has('/Root/Foo')).toBe(false)
    expect(stage.has('/Root/ChildA')).toBe(false)
  })

  it('applies sublayer time offsets to time samples', async () => {
    const stage = await open('layer-offsets')
    expect(stage.get('/Root.root')!.getTimeSampleKeys()).toEqual([-10, 0, 15])
    expect(stage.get('/Root.second')!.getTimeSampleKeys()).toEqual([5, 10, 17.5])
    expect(stage.get('/Root.third')!.getTimeSampleKeys()).toEqual([-5, 5, 20])
  })

  it('resolves inherited values with the correct strength', async () => {
    const stage = await open('inheritance')
    expect(stage.get('/Root.first')!.getDefaultValue()).toBe(99)
    expect(stage.get('/Root.second')!.getDefaultValue()).toBe(24)
  })

  it('resolves specializes as weaker than local opinions', async () => {
    const stage = await open('specializes')
    expect(stage.get('/Root/Container/Base.arc')!.getDefaultValue()).toBe('FromRoot')
    expect(stage.get('/Root/Container/Specialized.arc')!.getDefaultValue()).toBe('FromSpecialized')
    expect(stage.get('/Root/Container/Inherits.arc')!.getDefaultValue()).toBe('FromRoot')
  })

  it('applies list operations in authored order', async () => {
    const stage = await open('listops')
    expect(stage.get('/append.identifier')!.getDefaultValue()).toBe('B_from_Entry')
    expect(stage.get('/explicit_order.identifier')!.getDefaultValue()).toBe('A_from_Entry')
    expect(stage.get('/explicit_remove.identifier')!.getDefaultValue()).toBe('B_from_Entry')
  })
})
