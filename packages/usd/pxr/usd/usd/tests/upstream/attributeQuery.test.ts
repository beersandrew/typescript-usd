// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAttributeQuery.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Port of the complete registered pxr/usd/usd/testenv/testUsdAttributeQuery.py.

import { describe, expect, it } from 'vitest'
import { Stage, type Attribute } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import * as Usd from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

type AttributeQuery = {
  isValid(): boolean
  get(time?: 'default' | number): unknown
  getAttribute(): Attribute | undefined
}

type AttributeQueryConstructor = new (attr: Attribute) => AttributeQuery

async function layerContentTest(layerContent: string, expectedValueAtZero: number) {
  const resolver = new ArInMemoryResolver({
    'root.usda': enc(`#usda 1.0\n(subLayers = [@source.usda@])`),
    'source.usda': enc(layerContent),
    'empty_before.usda': enc('#usda 1.0'),
    'empty_after.usda': enc('#usda 1.0'),
  })
  const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
  const AttributeQueryClass = (Usd as unknown as {
    AttributeQuery: AttributeQueryConstructor
  }).AttributeQuery
  const attr = stage.get('/Prim.attr')!
  const query = new AttributeQueryClass(attr)

  expect(query.isValid()).toBe(true)
  expect(query.get()).toBe(1)
  expect(query.get(0)).toBe(expectedValueAtZero)

  const root = stage.getRootLayer()
  const validateChange = async (subLayers: string[]) => {
    const notices: Array<{ resyncedPaths: string[] }> = []
    const stop = onObjectsChanged(stage, notice => notices.push(notice))
    root.setField('/', 'subLayers', subLayers)
    await stage.flushChanges()
    stop()

    expect(notices.flatMap(notice => notice.resyncedPaths)).toEqual([])
    expect(query.isValid()).toBe(true)
    expect(query.get()).toBe(1)
    expect(query.get(0)).toBe(expectedValueAtZero)
  }

  await validateChange(['empty_before.usda', 'source.usda'])
  await validateChange(['empty_before.usda', 'source.usda', 'empty_after.usda'])
  await validateChange(['source.usda', 'empty_after.usda'])
  await validateChange(['source.usda'])
}

describe('UsdAttributeQuery', () => {
  it('is not invalidated by insignificant layer-stack changes with time samples', async () => {
    await layerContentTest(`#usda 1.0
def "Prim" {
  double attr = 1
  double attr.timeSamples = { 0: 2 }
}`, 2)
  })

  it('is not invalidated by insignificant layer-stack changes with splines', async () => {
    await layerContentTest(`#usda 1.0
def "Prim" {
  double attr = 1
  double attr.spline = {
    loop: (1, 10, 0, 1, 0),
    1: 5; pre (1, 1); post curve (1, 1),
  }
}`, 5)
  })
})
