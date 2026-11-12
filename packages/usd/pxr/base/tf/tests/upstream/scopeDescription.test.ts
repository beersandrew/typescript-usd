// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/scopeDescription.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/base/tf/testenv/scopeDescription.cpp. Each
// TF_DESCRIBE_SCOPE is a TfScopeDescription disposed at scope end; the
// std::thread cases run on logical lanes (logicalLane.ts). TestOverhead only
// prints a timing and is not ported.
import { describe, expect, it } from 'vitest'
import {
  TfGetCurrentScopeDescriptionStack, TfGetThisThreadScopeDescriptionStack, TfScopeDescription,
} from '../../src/index.ts'
import { Tf_RunInNewLane } from '../../src/logicalLane.ts'

// scopeDescription.cpp:24-44, with an await inside each scope so that lanes
// interleave the way threads do.
async function pushPopStackDescriptions(i: number, observed: string[][]): Promise<void> {
  const labels = [`Description ${i} 1`, `Description ${i} 3`, '=== Intermission ===',
    `Description ${i} 5`, `Description ${i} 6`, `Description ${i} 7`, `Description ${i} 8`,
    '!!! Finale !!!', `Description ${i} 10`]
  const scopes: TfScopeDescription[] = []
  for (const label of labels) {
    scopes.push(new TfScopeDescription(label))
    await Promise.resolve()
  }
  observed.push(TfGetThisThreadScopeDescriptionStack())
  while (scopes.length) {
    scopes.pop()!.dispose()
    await Promise.resolve()
  }
  observed.push(TfGetThisThreadScopeDescriptionStack())
}

describe('TfScopeDescription (testenv/scopeDescription.cpp)', () => {
  // scopeDescription.cpp:87-124
  it('TestBasics', () => {
    expect(TfGetCurrentScopeDescriptionStack()).toEqual([])
    const one = new TfScopeDescription('one')
    let stack = TfGetCurrentScopeDescriptionStack()
    expect(stack.length === 1 && stack.at(-1) === 'one').toBe(true)
    const two = new TfScopeDescription('two')
    stack = TfGetCurrentScopeDescriptionStack()
    expect(stack.length === 2 && stack.at(-1) === 'two').toBe(true)
    two.dispose()
    stack = TfGetCurrentScopeDescriptionStack()
    expect(stack.length === 1 && stack.at(-1) === 'one').toBe(true)
    const three = new TfScopeDescription('three')
    stack = TfGetCurrentScopeDescriptionStack()
    expect(stack.length === 2 && stack.at(-1) === 'three').toBe(true)
    three.dispose()
    stack = TfGetCurrentScopeDescriptionStack()
    expect(stack.length === 1 && stack.at(-1) === 'one').toBe(true)
    one.dispose()
    expect(TfGetCurrentScopeDescriptionStack()).toEqual([])
  })

  // scopeDescription.cpp:46-74: concurrent lanes keep separate stacks while
  // the main stack shows only the main lane's descriptions.
  it('TestThreads', async () => {
    const main = new TfScopeDescription('Test TfScopeDescription: TestThreads')
    const observed = Array.from({ length: 16 }, () => [] as string[][])
    await Promise.all(observed.map((o, i) => Tf_RunInNewLane(async () => {
      expect(TfGetThisThreadScopeDescriptionStack()).toEqual([])
      await pushPopStackDescriptions(i, o)
      expect(TfGetCurrentScopeDescriptionStack()).toEqual(['Test TfScopeDescription: TestThreads'])
    })))
    observed.forEach((o, i) => {
      expect(o[0]).toEqual([`Description ${i} 1`, `Description ${i} 3`, '=== Intermission ===',
        `Description ${i} 5`, `Description ${i} 6`, `Description ${i} 7`, `Description ${i} 8`,
        '!!! Finale !!!', `Description ${i} 10`])
      expect(o[1]).toEqual([])
    })
    expect(TfGetThisThreadScopeDescriptionStack()).toEqual(['Test TfScopeDescription: TestThreads'])
    main.dispose()
    expect(TfGetCurrentScopeDescriptionStack()).toEqual([])
  })
})

describe('TfScopeDescription behavior from scopeDescription.cpp', () => {
  // scopeDescription.cpp:367-396: SetDescription changes this description,
  // wherever it sits in the stack.
  it('SetDescription replaces its own entry', () => {
    const one = new TfScopeDescription('one')
    const two = new TfScopeDescription('two')
    one.setDescription('uno')
    expect(TfGetCurrentScopeDescriptionStack()).toEqual(['uno', 'two'])
    two.setDescription('dos')
    expect(TfGetCurrentScopeDescriptionStack()).toEqual(['uno', 'dos'])
    two.dispose()
    one.dispose()
  })

  // scopeDescription.cpp:326-334: TF_AXIOM(stack.head == this).
  it('fails the axiom when popped out of order', () => {
    const one = new TfScopeDescription('one')
    const two = new TfScopeDescription('two')
    expect(() => one.dispose()).toThrow(/Failed axiom/)
    two.dispose()
    one.dispose()
    expect(TfGetCurrentScopeDescriptionStack()).toEqual([])
  })
})
