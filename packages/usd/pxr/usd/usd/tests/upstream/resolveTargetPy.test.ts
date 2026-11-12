// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdResolveTargetPy.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdResolveTargetPy.py
// (registered as testUsdResolveTargetPy with testenv
// testUsdResolveTarget.testenv). The testenv layers are
// fixtures/resolveTarget/*.usda, copied byte-for-byte from
// pxr/usd/usd/testenv/testUsdResolveTarget.testenv/resolveTarget/ (Pixar,
// OpenUSD license). unittest runs methods in name order, so
// test_ResolveTargetFromCompositionQuery runs first here as well.
//
// API mapping: Python's None from AttributeQuery.Get is undefined;
// `with Usd.EditContext(...)` is new EditContext(...) ... close().
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Layer } from 'typescript-usd/sdf'
import {
  AttributeQuery, EditContext, EditTarget, PrimCompositionQuery, Stage, type ResolveTarget,
} from 'typescript-usd/usd'

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/resolveTarget/${name}`, import.meta.url))

// testUsdResolveTargetPy.py:19-63 _VerifyAttrQuery
function verifyAttrQuery(
  attrQuery: AttributeQuery,
  expectedTimeSamples: Array<[number, unknown]> | null = null,
  expectedDefaultValue: unknown = null,
): void {
  const expectedHasAuthoredValue = Boolean(
    (expectedTimeSamples && expectedTimeSamples.length) || expectedDefaultValue)
  expect(attrQuery.hasAuthoredValue()).toBe(expectedHasAuthoredValue)
  const expectedHasValue = expectedHasAuthoredValue
  expect(attrQuery.hasValue()).toBe(expectedHasValue)
  const expectedTimeSampleTimes = expectedTimeSamples === null ? [] : expectedTimeSamples.map(([time]) => time)
  expect(attrQuery.getTimeSamples()).toEqual(expectedTimeSampleTimes)
  expect(attrQuery.valueMightBeTimeVarying()).toBe(expectedTimeSampleTimes.length > 1)
  if (expectedDefaultValue === null) expect(attrQuery.get('default')).toBeUndefined()
  else expect(attrQuery.get('default')).toEqual(expectedDefaultValue)
  if (expectedTimeSamples === null) {
    if (expectedDefaultValue === null) expect(attrQuery.get(1.0)).toBeUndefined()
    else expect(attrQuery.get(1.0)).toEqual(expectedDefaultValue)
  } else {
    for (const [time, val] of expectedTimeSamples) expect(attrQuery.get(time)).toEqual(val)
  }
}

describe('testUsdResolveTargetPy', () => {
  // testUsdResolveTargetPy.py:148-277
  it('test_ResolveTargetFromCompositionQuery', async () => {
    const stage = (await Stage.open(fixturePath('root.usda')))!
    const parentPrim = stage.getPrim('/Parent')
    expect(parentPrim).toBeTruthy()
    const childPrim = stage.getPrim('/Parent/RefChild')!
    expect(childPrim).toBeTruthy()

    const query = new PrimCompositionQuery(childPrim)
    const arcs = query.getCompositionArcs()

    const upToResolveTargets: ResolveTarget[] = []
    const strongerThanResolveTargets: ResolveTarget[] = []
    for (const arc of arcs) {
      for (const layer of arc.getTargetNode().getLayerStack().getLayers()) {
        upToResolveTargets.push(arc.makeResolveTargetUpTo(layer as Layer))
        strongerThanResolveTargets.push(arc.makeResolveTargetStrongerThan(layer as Layer))
      }
    }

    expect(upToResolveTargets).toHaveLength(11)
    expect(strongerThanResolveTargets).toHaveLength(11)

    const attr = stage.getAttributeAtPath('/Parent/RefChild.bar')!
    expect(attr).toBeTruthy()
    const q = (target: ResolveTarget) => new AttributeQuery(attr, target)

    // Node: /Parent/RefChild
    verifyAttrQuery(q(upToResolveTargets[0]!), [[1.0, 6], [6.0, 1]], 5)
    verifyAttrQuery(q(strongerThanResolveTargets[0]!), null, null)

    verifyAttrQuery(q(upToResolveTargets[1]!), [[1.0, 6], [6.0, 1]], 5)
    verifyAttrQuery(q(strongerThanResolveTargets[1]!), null, null)

    verifyAttrQuery(q(upToResolveTargets[2]!), null, 5)
    verifyAttrQuery(q(strongerThanResolveTargets[2]!), [[1.0, 6], [6.0, 1]], null)

    verifyAttrQuery(q(upToResolveTargets[3]!), [[1.0, 4], [4.0, 1]], 3)
    verifyAttrQuery(q(strongerThanResolveTargets[3]!), [[1.0, 6], [6.0, 1]], 5)

    // Node: /Internal/RefChild
    for (let i = 4; i < 8; ++i) {
      verifyAttrQuery(q(upToResolveTargets[i]!), null, 3)
      verifyAttrQuery(q(strongerThanResolveTargets[i]!), [[1.0, 6], [6.0, 1]], 5)
    }

    // Node: /RefParent/RefChild
    verifyAttrQuery(q(upToResolveTargets[8]!), null, 3)
    verifyAttrQuery(q(strongerThanResolveTargets[8]!), [[1.0, 6], [6.0, 1]], 5)

    verifyAttrQuery(q(upToResolveTargets[9]!), [[1.0, 2], [2.0, 1]], 1)
    verifyAttrQuery(q(strongerThanResolveTargets[9]!), [[1.0, 6], [6.0, 1]], 5)

    verifyAttrQuery(q(upToResolveTargets[10]!), null, 1)
    verifyAttrQuery(q(strongerThanResolveTargets[10]!), [[1.0, 6], [6.0, 1]], 5)
  })

  // testUsdResolveTargetPy.py:67-146
  it('test_ResolveTargetFromEditTarget', async () => {
    const stage = (await Stage.open(fixturePath('root.usda')))!
    expect(stage.getPrim('/Parent')).toBeTruthy()
    const childPrim = stage.getPrim('/Parent/RefChild')!
    expect(childPrim).toBeTruthy()

    // An edit target that targets the sub2 layer with no PcpMapping
    const editTarget = new EditTarget(Layer.find(fixturePath('sub2.usda'))!)
    expect(editTarget.isValid()).toBe(true)
    expect(editTarget.isNull()).toBe(false)

    let resolveUpToEditTarget = childPrim.makeResolveTargetUpToEditTarget(editTarget)
    let resolveStrongerThanEditTarget = childPrim.makeResolveTargetStrongerThanEditTarget(editTarget)
    expect(resolveUpToEditTarget.isNull()).toBe(false)
    expect(resolveStrongerThanEditTarget.isNull()).toBe(false)

    const attr = stage.getAttributeAtPath('/Parent/RefChild.foo')!
    expect(attr).toBeTruthy()
    verifyAttrQuery(new AttributeQuery(attr, resolveUpToEditTarget), null, 4.0)
    verifyAttrQuery(new AttributeQuery(attr, resolveStrongerThanEditTarget), null, 6.0)

    // Now set /Parent/RefChild.foo to 10.0 with the edit target.
    const context = new EditContext(stage, editTarget)
    attr.set(10.0)
    context.close()
    await stage.flushChanges()

    resolveUpToEditTarget = childPrim.makeResolveTargetUpToEditTarget(editTarget)
    resolveStrongerThanEditTarget = childPrim.makeResolveTargetStrongerThanEditTarget(editTarget)
    expect(resolveUpToEditTarget.isNull()).toBe(false)
    expect(resolveStrongerThanEditTarget.isNull()).toBe(false)

    verifyAttrQuery(new AttributeQuery(attr, resolveUpToEditTarget), null, 10.0)
    verifyAttrQuery(new AttributeQuery(attr, resolveStrongerThanEditTarget), null, 6.0)
  })
})
