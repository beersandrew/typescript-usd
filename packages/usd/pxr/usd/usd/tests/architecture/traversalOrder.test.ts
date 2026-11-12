// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/prim.h,
//  pxr/usd/usd/testenv/testUsdPrimRange.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Live OpenUSD v26.05 oracle capture:
//   initial:    Traverse/TraverseAll [/A, /B]
//   add /A/X:   Traverse/TraverseAll [/A, /A/X, /B]
//   edit value: Traverse/TraverseAll [/A, /A/X, /B]
// UsdPrimRange walks ordered namespace children; retained storage mutation
// order cannot affect the range (prim.h:2509-2543, testUsdPrimRange.py:270).

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage } from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

async function makeStage(): Promise<Stage> {
  return (await Stage.open('scene.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'scene.usda': enc(`#usda 1.0
def Scope "A" {
    double value = 1
}
def Scope "B" {}
`),
    })),
  }))!
}

function expectNamespaceOrder(stage: Stage): void {
  expect([...stage.traverse()]).toEqual(['/A', '/A/X', '/B'])
  expect([...stage.traverseAll()]).toEqual(['/A', '/A/X', '/B'])
  expect(stage.getAllChildPrimPaths('/')).toEqual(['/A', '/B'])
  expect(stage.getAllChildPrimPaths('/A')).toEqual(['/A/X'])
}

describe('UsdPrimRange namespace order after incremental population', () => {
  it('keeps preorder after targeted subtree replacement', async () => {
    const stage = await makeStage()
    stage.definePrim('/A/X', 'Scope')
    await stage.flushChanges()

    expectNamespaceOrder(stage)
  })

  it('keeps preorder after targeted prim rematerialization', async () => {
    const stage = await makeStage()
    stage.definePrim('/A/X', 'Scope')
    await stage.flushChanges()
    stage.getRootLayer().setField('/A.value', 'default', 7)
    await stage.flushChanges()

    expect(stage.get('/A.value')?.getValue()).toBe(7)
    expectNamespaceOrder(stage)
  })
})
