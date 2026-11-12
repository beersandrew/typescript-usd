// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdMetadata.cpp,
//  pxr/usd/usd/testenv/testUsdMetadata.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdMetadata.{py,cpp} at v26.05.
// Registered programs: testUsdMetadata and testUsdMetadataCpp.

import { describe, expect, it } from 'vitest'
import nativeMetadataFixture from './metadataInspection/expected.json' with { type: 'json' }
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver, _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
const nativeMetadata = oraclePayload(nativeMetadataFixture)

describe('testUsdMetadata / object metadata matrix', () => {
  it('authors, queries and clears stage, prim and attribute metadata', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P', 'Scope')
    const attr = prim.createAttr('a', 1)

    expect(stage.hasMetadata('comment')).toBe(false)
    stage.setMetadata('comment', 'stage')
    prim.setMetadata('comment', 'prim')
    attr.setMetadata('comment', 'attribute')

    expect(stage.getMetadata('comment')).toBe('stage')
    expect(prim.getMetadata('comment')).toBe('prim')
    expect(attr.getMetadata('comment')).toBe('attribute')
    expect(attr.hasMetadata('comment')).toBe(true)
    expect(attr.hasAuthoredMetadata('comment')).toBe(true)

    stage.clearMetadata('comment')
    prim.clearMetadata('comment')
    attr.clearMetadata('comment')
    expect(stage.hasMetadata('comment')).toBe(false)
    expect(prim.getMetadata('comment')).toBeUndefined()
    expect(attr.hasMetadata('comment')).toBe(false)
  })

  it('composes nested dictionaries recursively', async () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P', 'Scope')
    prim.setMetadata('customData', { nested: { strong: 1 }, atStrong: true })
    expect(prim.getMetadata('customData')).toEqual({
      nested: { strong: 1 },
      atStrong: true,
    })
  })
})

describe('testUsdMetadataCpp / edit-target matrix', () => {
  it('attribute authoredness composes across edit targets', async () => {
    const path = 'metadata-targets.usda'
    const stage = (await Stage.open(path, {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        [path]: new TextEncoder().encode("#usda 1.0\ndef Scope \"P\" { int a = 1 ; }\n"),
      })),
    }))!
    const attr = stage.definePrim('/P').attr('a')
    const root = stage.getRootLayer()
    const session = stage.getSessionLayer()

    stage.setEditTarget(root)
    attr.setMetadata('displayGroup', 'root')
    expect(attr.hasAuthoredMetadata('displayGroup')).toBe(nativeMetadata.editTargetAuthoredness[0])

    stage.setEditTarget(session)
    expect(attr.getMetadata('displayGroup')).toBe('root')
    expect(attr.hasAuthoredMetadata('displayGroup')).toBe(nativeMetadata.editTargetAuthoredness[1])
    attr.setMetadata('displayGroup', 'session')
    expect(attr.getMetadata('displayGroup')).toBe('session')
    expect(attr.hasAuthoredMetadata('displayGroup')).toBe(nativeMetadata.editTargetAuthoredness[2])

    attr.clearMetadata('displayGroup')
    expect(attr.getMetadata('displayGroup')).toBe('root')
    expect(attr.hasAuthoredMetadata('displayGroup')).toBe(nativeMetadata.editTargetAuthoredness[3])
  })

  it('typed and dictionary values retain JavaScript value identity', () => {
    const stage = Stage.createNew()
    const attr = stage.definePrim('/P', 'Scope').createAttr('a', 1)
    for (const value of [
      true, 42, 2.5, 'token', [1, 2, 3], { nested: { value: 7 } },
    ]) {
      attr.setMetadata('customData', value)
      expect(attr.getMetadata('customData')).toEqual(value)
    }
  })
})
