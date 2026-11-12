// Ported from OpenUSD 26.11.1: pxr/usd/usd/primRange.cpp,
//  pxr/usd/usd/wrapPrimRange.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native capture: OpenUSD 26.11.1 usd/primRange.cpp:18-89,
// wrapPrimRange.cpp:132-160; fixtures/primRangeIteration (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PrimRange, Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver, _setResolverForTest } from 'typescript-usd/usd/_internal'
import expected from './fixtures/primRangeIteration/expected.json' with { type: 'json' }

async function openStage() {
  const bytes = readFileSync(new URL('./fixtures/primRangeIteration/scene.usda', import.meta.url))
  _setResolverForTest(new ArInMemoryResolver({ 'scene.usda': bytes }))
  return (await Stage.open('scene.usda'))!
}

describe('PrimRange native iteration', () => {
  it('rejects pruning on a post-visit without changing traversal', async () => {
    const stage = await openStage()
    const iterator = PrimRange.preAndPostVisit(stage.getPrim('/Target')!)[Symbol.iterator]()
    iterator.next()
    iterator.next()
    let rejected = false
    try { iterator.pruneChildren() } catch { rejected = true }
    expect(rejected).toBe(expected.pruneOnPostVisit.rejected)
    expect([...iterator].map(prim => prim.path)).toEqual(expected.pruneOnPostVisit.remainingPaths)
  })
  for (const mode of ['stage', 'root', 'all'] as const) {
    for (const protocol of ['for-of', 'spread', 'next'] as const) {
      it(`${mode} visits native paths with ${protocol}`, async () => {
        const stage = await openStage()
        const range = mode === 'stage' ? PrimRange.stage(stage)
          : mode === 'all' ? PrimRange.allPrims(stage.getPrim('/')!)
          : PrimRange.fromPrim(stage.getPrim('/')!)
        const iterator = range[Symbol.iterator]()
        const paths: string[] = []
        if (protocol === 'spread') paths.push(...[...iterator].map(prim => prim.path))
        else if (protocol === 'for-of') {
          for (const prim of iterator) paths.push(prim.path)
        } else {
          for (let next = iterator.next(); !next.done; next = iterator.next()) paths.push(next.value.path)
        }
        expect(paths).toEqual(expected[mode].map(visit => visit[0]))
        expect(iterator.next().done).toBe(true)
        expect(iterator.next().done).toBe(true)
      })
    }
  }

  for (const mode of ['prePost', 'prune', 'prePostPrune', 'prePostLeaf'] as const) {
    it(`${mode} matches native visits and pruning`, async () => {
      const stage = await openStage()
      const root = mode === 'prePostLeaf' ? stage.getPrim('/Target')! : stage.getPrim('/')!
      const range = mode === 'prune' ? PrimRange.fromPrim(root) : PrimRange.preAndPostVisit(root)
      const iterator = range[Symbol.iterator]()
      const visits: Array<[string, boolean]> = []
      for (const prim of iterator) {
        visits.push([prim.path, iterator.isPostVisit()])
        if ((mode === 'prune' || mode === 'prePostPrune') && prim.path === '/Model' && !iterator.isPostVisit()) {
          iterator.pruneChildren()
        }
      }
      expect(visits).toEqual(expected[mode])
    })
  }
})
