// Ported from OpenUSD 26.11.1: pxr/usd/sdf/abstractData.cpp,
//  pxr/usd/sdf/abstractData.h, pxr/usd/sdf/data.cpp, pxr/usd/sdf/data.h,
//  pxr/usd/sdf/testenv/testSdfAbstractData.cpp,
//  pxr/usd/sdf/testenv/testSdfLayer.py
// Copyright 2016, 2017, 2025 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/{abstractData,data}.{h,cpp},
// pxr/usd/sdf/testenv/testSdfAbstractData.cpp, and the data-facing portions
// of testSdfLayer.py at OpenUSD v26.05.

import { describe, expect, it } from 'vitest'
import { Layer, AbstractData as SdfAbstractData, Data as SdfData } from 'typescript-usd/sdf'
import { _sdfCreateLayerWithData } from 'typescript-usd/sdf/_internal'

function makeData(): SdfData { return new SdfData() }

describe('SdfData map-backed storage', () => {
  it('creates, retypes, moves, and erases specs without moving children', () => {
    const data = makeData()
    expect(data.isEmpty()).toBe(true)
    expect(data.getSpecType('/World')).toBe('unknown')

    data.createSpec('/', 'pseudoRoot')
    data.createSpec('/World', 'prim')
    data.createSpec('/World.size', 'attribute')
    expect(data.isEmpty()).toBe(false)
    expect(data.hasSpec('/World')).toBe(true)
    expect(data.getSpecType('/World.size')).toBe('attribute')

    data.createSpec('/World.size', 'relationship')
    expect(data.getSpecType('/World.size')).toBe('relationship')

    data.moveSpec('/World', '/Moved')
    expect(data.hasSpec('/World')).toBe(false)
    expect(data.hasSpec('/Moved')).toBe(true)
    expect(data.hasSpec('/World.size')).toBe(true)

    data.eraseSpec('/Moved')
    expect(data.hasSpec('/Moved')).toBe(false)
    expect(data.hasSpec('/World.size')).toBe(true)
  })

  it('stores sparse fields only on existing specs', () => {
    const data = makeData()
    data.createSpec('/World', 'prim')
    data.set('/World', 'specifier', 'def')
    data.set('/World', 'typeName', 'Xform')

    expect(data.has('/World', 'specifier')).toBe(true)
    expect(data.has('/World', 'kind')).toBe(false)
    expect(data.get('/World', 'typeName')).toBe('Xform')
    expect(data.get('/World', 'kind')).toBeUndefined()
    expect(new Set(data.list('/World'))).toEqual(new Set(['specifier', 'typeName']))

    data.erase('/World', 'typeName')
    expect(data.has('/World', 'typeName')).toBe(false)
    expect(data.list('/World')).toEqual(['specifier'])
  })

  it('visits specs, supports early termination, and always calls done', () => {
    const data = makeData()
    data.createSpec('/', 'pseudoRoot')
    data.createSpec('/A', 'prim')
    data.createSpec('/B', 'prim')
    const visited: string[] = []
    let done = false

    data.visitSpecs({
      visitSpec: (_source, path) => {
        visited.push(path)
        return false
      },
      done: source => { done = source === data },
    })

    expect(visited).toHaveLength(1)
    expect(done).toBe(true)
  })

  it('copies and compares specs, types, fields, and values', () => {
    const source = makeData()
    source.createSpec('/', 'pseudoRoot')
    source.createSpec('/World', 'prim')
    source.set('/World', 'specifier', 'def')
    source.set('/World', 'customData', { source: true })

    const copy = makeData()
    copy.copyFrom(source)
    expect(copy.equals(source)).toBe(true)
    expect(source.equals(copy)).toBe(true)

    copy.set('/World', 'specifier', 'over')
    expect(copy.equals(source)).toBe(false)
    copy.set('/World', 'specifier', 'def')
    copy.createSpec('/World.attr', 'attribute')
    expect(copy.equals(source)).toBe(false)
  })

  it('is detached by default exactly when it does not stream', () => {
    const data = makeData()
    expect(data.streamsData()).toBe(false)
    expect(data.isDetached()).toBe(true)
  })

  it('implements nested dictionary key-path reads and writes', () => {
    const data = makeData()
    data.createSpec('/World', 'prim')
    data.set('/World', 'customData', { nested: { weak: 1 }, keep: true })

    expect(data.hasDictKey('/World', 'customData', 'nested:weak')).toBe(true)
    expect(data.getDictValueByKey('/World', 'customData', 'nested:weak')).toBe(1)
    expect(data.listDictKeys('/World', 'customData', '')).toEqual(['nested', 'keep'])

    data.setDictValueByKey('/World', 'customData', 'nested:strong', 2)
    expect(data.get('/World', 'customData')).toEqual({
      nested: { weak: 1, strong: 2 },
      keep: true,
    })
    data.eraseDictValueByKey('/World', 'customData', 'nested:weak')
    expect(data.get('/World', 'customData')).toEqual({ nested: { strong: 2 }, keep: true })
  })

  it('forbids mutation while VisitSpecs is active', () => {
    const data = makeData()
    data.createSpec('/', 'pseudoRoot')
    expect(() => data.visitSpecs({
      visitSpec: () => { data.createSpec('/Illegal', 'prim'); return true },
      done: () => {},
    })).toThrow(/may not be modified/)
    expect(data.hasSpec('/Illegal')).toBe(false)
  })

  // SdfData::Set stores a copy of the value (data.cpp:212-237) and Get hands
  // out a VtValue that shares it (data.cpp:204-210); a shared value is
  // read-only here, so a caller copies it to edit it.
  it('copies field values when stored and hands them out read-only', () => {
    const data = makeData()
    data.createSpec('/World', 'prim')
    const authored = { nested: { value: 1 }, items: ['a'] }
    data.set('/World', 'customData', authored)
    authored.nested.value = 2
    authored.items.push('b')
    expect(data.get('/World', 'customData')).toEqual({
      nested: { value: 1 }, items: ['a'],
    })

    const read = data.get('/World', 'customData') as typeof authored
    expect(data.get('/World', 'customData')).toBe(read)
    expect(() => { read.nested.value = 3 }).toThrow(TypeError)
    expect(() => { read.items.push('c') }).toThrow(TypeError)
    expect(data.get('/World', 'customData')).toEqual({
      nested: { value: 1 }, items: ['a'],
    })

    const edited = { ...read, nested: { ...read.nested, value: 3 } }
    data.set('/World', 'customData', edited)
    expect(data.get('/World', 'customData')).toEqual({
      nested: { value: 3 }, items: ['a'],
    })
    expect(read).toEqual({ nested: { value: 1 }, items: ['a'] })
  })
})

describe('SdfLayer substitutable data ownership', () => {
  class AlternateData extends SdfData {
    override streamsData(): boolean { return false }
  }

  function makeLayer(DataType: new () => SdfAbstractData): Layer {
    const data = new DataType()
    data.createSpec('/', 'pseudoRoot')
    data.set('/', 'specifier', 'def')
    return _sdfCreateLayerWithData(`anon:test:${DataType.name}`, data)
  }

  it.each([SdfData, AlternateData])(
    'mediates the same observable operations through %p',
    (DataType) => {
      const layer = makeLayer(DataType)
      const changes: unknown[] = []
      const unsubscribe = layer._registerDidChangeListener(change => changes.push(change))
      layer.definePrimSpec('/World', 'Xform')
      layer.setAttrDefault('/World', 'size', 2)
      layer.setAttrTimeSample('/World', 'size', 1, 10)
      unsubscribe()

      expect(layer.getSpecType('/World')).toBe('prim')
      expect(layer.getSpecType('/World.size')).toBe('attribute')
      expect(layer.getField('/World.size', 'default')).toBe(2)
      expect(layer.queryTimeSample('/World.size', 1)).toBe(10)
      expect(changes).not.toHaveLength(0)
      expect('scene' in layer).toBe(false)
    },
  )

  it('transfers independent content without replacing Layer or spec identity', () => {
    const source = Layer.createAnonymous('source')
    const destination = Layer.createAnonymous('destination')
    source.definePrimSpec('/World', 'Xform')
    source.setAttrDefault('/World', 'size', 2)
    destination.definePrimSpec('/Old', 'Scope')
    const rootSpec = destination.getObjectAtPath('/')!
    const identifier = destination.filePath

    destination.transferContent(source)

    expect(destination.filePath).toBe(identifier)
    expect(destination.getObjectAtPath('/')).toBe(rootSpec)
    expect(destination.hasSpec('/Old')).toBe(false)
    expect(destination.getField('/World.size', 'default')).toBe(2)
    expect(destination.toUsda()).toBe(source.toUsda())
    source.setAttrDefault('/World', 'size', 3)
    expect(destination.getField('/World.size', 'default')).toBe(2)
  })

  it('creates the owning variant spec when authoring its first property', () => {
    const layer = Layer.createAnonymous('variant-property')
    layer.definePrimSpec('/Model', 'Scope')
    layer.setAttrDefault('/Model{look=red}', 'roughness', 0.6)

    expect(layer.getSpecType('/Model{look=red}')).toBe('variant')
    expect(layer.getField('/Model{look=red}', 'properties')).toEqual(['roughness'])
    expect(layer.getSpecType('/Model{look=red}.roughness')).toBe('attribute')
  })
})

describe('SdfAbstractData time-sample contract', () => {
  function sampledData(): SdfData {
    const data = makeData()
    data.createSpec('/Prim.attr', 'attribute')
    data.setTimeSample('/Prim.attr', 1, 10)
    data.setTimeSample('/Prim.attr', 2, 20)
    data.setTimeSample('/Prim.attr', 3, 30)
    return data
  }

  it('ports testSdfAbstractData.cpp previous-sample axioms exactly', () => {
    const data = sampledData()
    expect(data.getPreviousTimeSampleForPath('/Prim.attr', 0.5)).toBeUndefined()
    expect(data.getPreviousTimeSampleForPath('/Prim.attr', 1)).toBeUndefined()
    expect(data.getPreviousTimeSampleForPath('/Prim.attr', 1.5)).toBe(1)
    expect(data.getPreviousTimeSampleForPath('/Prim.attr', 2)).toBe(1)
    expect(data.getPreviousTimeSampleForPath('/Prim.attr', 10)).toBe(3)
  })

  it('ports the registered test through the abstract base fallback too', () => {
    const data = sampledData()
    const previous = (time: number) =>
      SdfAbstractData.prototype.getPreviousTimeSampleForPath.call(data, '/Prim.attr', time)
    expect(previous(0.5)).toBeUndefined()
    expect(previous(1)).toBeUndefined()
    expect(previous(1.5)).toBe(1)
    expect(previous(2)).toBe(1)
    expect(previous(10)).toBe(3)
  })

  it('lists, queries, overwrites, and erases samples', () => {
    const data = sampledData()
    expect(data.listAllTimeSamples()).toEqual([1, 2, 3])
    expect(data.listTimeSamplesForPath('/Prim.attr')).toEqual([1, 2, 3])
    expect(data.queryTimeSample('/Prim.attr', 2)).toBe(20)
    expect(data.queryTimeSample('/Prim.attr', 2.5)).toBeUndefined()

    data.setTimeSample('/Prim.attr', 2, 200)
    expect(data.queryTimeSample('/Prim.attr', 2)).toBe(200)
    data.eraseTimeSample('/Prim.attr', 2)
    expect(data.listTimeSamplesForPath('/Prim.attr')).toEqual([1, 3])
    data.eraseTimeSample('/Prim.attr', 1)
    data.eraseTimeSample('/Prim.attr', 3)
    expect(data.has('/Prim.attr', 'timeSamples')).toBe(false)
  })

  it('matches the live layer oracle for bracketing at, before, and between samples', () => {
    const data = makeData()
    data.createSpec('/World.size', 'attribute')
    data.setTimeSample('/World.size', 1, 10)
    data.setTimeSample('/World.size', 3, 30)

    // Captured from the v26.05 reference build through
    // SdfLayer::GetBracketingTimeSamplesForPath.
    expect(data.getBracketingTimeSamplesForPath('/World.size', 0)).toEqual([1, 1])
    expect(data.getBracketingTimeSamplesForPath('/World.size', 1)).toEqual([1, 1])
    expect(data.getBracketingTimeSamplesForPath('/World.size', 2)).toEqual([1, 3])
    expect(data.getBracketingTimeSamplesForPath('/World.size', 3)).toEqual([3, 3])
    expect(data.getBracketingTimeSamplesForPath('/World.size', 4)).toEqual([3, 3])
  })
})
