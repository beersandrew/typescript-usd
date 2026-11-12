// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdThreadedAuthoring.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdThreadedAuthoring.cpp
// (registered as testUsdThreadedAuthoring). Upstream runs 24 CreateStage jobs
// on a WorkDispatcher, each authoring an independent in-memory stage, then
// checks every stage's structure. Stage authoring here is synchronous on one
// thread, so the jobs run one after another; what remains meaningful is that
// many independently authored stages keep their own prims and values. The
// Py_IsInitialized() axiom has no counterpart.
//
// Divergence: 2 jobs instead of upstream's 24. Each job authors 1,364 prims
// with two attributes each (about 6,800 authoring calls); at this library's
// authoring cost (1-3 s per stage under vitest) 24 sequential jobs would
// take most of a minute with no extra coverage, since the jobs no longer run
// concurrently.

import { describe, expect, it } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'

const numSiblings = 4
const depth = 4
const numAttrs = 2

const childPath = (parent: string, name: string) =>
  parent === '/' ? `/${name}` : `${parent}/${name}`

// Check (testUsdThreadedAuthoring.cpp:30-50).
function check(parent: Prim, prefix: string, depth: number): void {
  const stage = parent.getStage()
  for (let i = 0; i !== numSiblings; ++i) {
    const p = stage.getPrim(childPath(parent.path, `${prefix}_${i}`))
    expect(p).toBeTruthy()
    for (let j = 0; j !== numAttrs; ++j) {
      const a = p!.getAttr(`${prefix}_${j}`)
      expect(a?.isValid()).toBe(true)
      expect(a!.getValue()).toBe(j)
    }
    if (depth) check(p!, prefix, depth - 1)
  }
}

// Author (testUsdThreadedAuthoring.cpp:52-69).
function author(parent: Prim, prefix: string, depth: number): void {
  const stage = parent.getStage()
  for (let i = 0; i !== numSiblings; ++i) {
    const p = stage.definePrim(childPath(parent.path, `${prefix}_${i}`))
    for (let j = 0; j !== numAttrs; ++j) {
      const a = p.createAttribute(`${prefix}_${j}`, 'int')
      a.set(j)
    }
    if (depth) author(p, prefix, depth - 1)
  }
}

describe('testUsdThreadedAuthoring', () => {
  it('TestParallelAuthoring', () => {
    const allStages: Stage[] = []
    // CreateStage (testUsdThreadedAuthoring.cpp:85-96).
    const createStage = () => {
      const stage = Stage.createNew()
      author(stage.getPrim('/')!, 'prim', depth)
      allStages.push(stage)
    }
    const numJobs = 2
    for (let i = 0; i !== numJobs; ++i) createStage()

    // CheckAllStages (testUsdThreadedAuthoring.cpp:98-106).
    expect(allStages.length).toBe(numJobs)
    for (const stage of allStages) check(stage.getPrim('/')!, 'prim', depth)
  }, 30_000)
})
