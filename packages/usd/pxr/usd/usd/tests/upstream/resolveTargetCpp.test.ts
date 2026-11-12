// Ported from OpenUSD 26.11.1: pxr/usd/pcp/layerStackIdentifier.h,
//  pxr/usd/usd/testenv/testUsdResolveTarget.cpp
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdResolveTarget.cpp
// (registered as testUsdResolveTarget with testenv
// testUsdResolveTarget.testenv). The testenv layers are
// fixtures/resolveTarget/{root,sub1,sub2,ref,ref_sub1,ref_sub2}.usda, copied
// byte-for-byte from pxr/usd/usd/testenv/testUsdResolveTarget.testenv/
// resolveTarget/ (Pixar, OpenUSD license). resolveTarget.test.ts holds the
// separate native-capture checks over the same layers.
//
// API mapping:
//   - TF_VERIFY / TF_AXIOM failures are expect() failures.
//   - PcpSite(layerStackId, path) equality is checked as the node's site
//     path plus its layer stack identifier's root and session layers
//     (PcpLayerStackIdentifier, layerStackIdentifier.h); the path resolver
//     context is the stage's in both upstream identifiers.
//   - _ExpectedAttrGetValues<T> {timeSamples, VtValue default} is
//     [timeSamples, default], an empty VtValue being undefined.
//   - UsdAttributeQuery::Get(&value) returning false is get() === undefined.
import { describe, expect, it } from 'vitest'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Layer } from 'typescript-usd/sdf'
import type { PcpNodeRef } from 'typescript-usd/pcp'
import {
  AttributeQuery, EditContext, EditTarget, PrimCompositionQuery, Stage,
  type Attribute, type Prim, type ResolveTarget,
} from 'typescript-usd/usd'

const fixture = new URL('./fixtures/resolveTarget/', import.meta.url)
const fixturePath = (name: string) => fileURLToPath(new URL(name, fixture))

// PcpSite(PcpLayerStackIdentifier(root, session), path).
interface Site { rootLayer: Layer; sessionLayer: Layer | undefined; path: string }
type Expected = [Site, string]

// testUsdResolveTarget.cpp:44-54 _VerifyResolveTargetSite
function verifyResolveTargetSite(node: PcpNodeRef | null, expectedSite: Site): void {
  expect(node).toBeTruthy()
  const site = node!.getSite()
  expect(site.path.pathString).toBe(expectedSite.path)
  expect(site.layerStack.identifier.rootLayer).toBe(expectedSite.rootLayer)
  expect(site.layerStack.identifier.sessionLayer).toBe(expectedSite.sessionLayer)
}

// testUsdResolveTarget.cpp:56-80 _VerifyResolveTargetLayer: the session layer
// is anonymous and its identifier ends in "root-session.usda".
function verifyResolveTargetLayer(layer: Layer | null | undefined, expectedLayerName: string): void {
  expect(layer).toBeTruthy()
  if (expectedLayerName === 'session') {
    expect(layer!.isAnonymous()).toBe(true)
    expect(layer!.identifier.endsWith('root-session.usda')).toBe(true)
  } else {
    expect(basename(layer!.identifier)).toBe(expectedLayerName)
  }
}

// testUsdResolveTarget.cpp:82-103 _VerifyResolveTarget
function verifyResolveTarget(
  resolveTarget: ResolveTarget, expectedStart: Expected, expectedStop?: Expected,
): void {
  verifyResolveTargetSite(resolveTarget.getStartNode(), expectedStart[0])
  verifyResolveTargetLayer(resolveTarget.getStartLayer() as Layer, expectedStart[1])
  if (expectedStop) {
    verifyResolveTargetSite(resolveTarget.getStopNode(), expectedStop[0])
    verifyResolveTargetLayer(resolveTarget.getStopLayer() as Layer, expectedStop[1])
  } else {
    expect(resolveTarget.getStopNode()).toBeFalsy()
    expect(resolveTarget.getStopLayer()).toBeFalsy()
  }
}

type ExpectedAttrGetValues = [Array<[number, unknown]>, unknown]

// testUsdResolveTarget.cpp:105-138 _GetAndVerifyAttributeValue
function getAndVerifyAttributeValue(attrQuery: AttributeQuery, time: 'default' | number, expected: unknown): void {
  if (expected !== undefined) expect(attrQuery.get(time)).toEqual(expected)
  else expect(attrQuery.get(time)).toBeUndefined()
}

// testUsdResolveTarget.cpp:150-225 _VerifyQuery
function verifyQuery(attrQuery: AttributeQuery, expectedValues: ExpectedAttrGetValues): void {
  const [expectedTimeSampleValues, expectedAuthoredDefaultValue] = expectedValues
  const expectedHasAuthoredValue =
    expectedTimeSampleValues.length > 0 || expectedAuthoredDefaultValue !== undefined
  expect(attrQuery.hasAuthoredValue()).toBe(expectedHasAuthoredValue)
  const expectedHasValue = expectedHasAuthoredValue
  expect(attrQuery.hasValue()).toBe(expectedHasValue)
  expect(attrQuery.getTimeSamples()).toEqual(expectedTimeSampleValues.map(([time]) => time))
  expect(attrQuery.valueMightBeTimeVarying()).toBe(expectedTimeSampleValues.length > 1)
  getAndVerifyAttributeValue(attrQuery, 'default', expectedAuthoredDefaultValue)
  for (const [time, value] of expectedTimeSampleValues) {
    getAndVerifyAttributeValue(attrQuery, time, value)
  }
  if (expectedTimeSampleValues.length === 0) {
    getAndVerifyAttributeValue(attrQuery, 1.0, expectedAuthoredDefaultValue)
  }
}

// testUsdResolveTarget.cpp:227-252 _MakeAndVerifyQueries
function makeAndVerifyQueries(
  attr: Attribute, resolveTargets: ResolveTarget[], expectedValues: ExpectedAttrGetValues[],
): void {
  expect(expectedValues.length).toBe(resolveTargets.length)
  for (let i = 0; i < resolveTargets.length; ++i) {
    verifyQuery(new AttributeQuery(attr, resolveTargets[i]), expectedValues[i]!)
  }
}

// testUsdResolveTarget.cpp:254-286 _GetAllResolveTargetsForPrim
function getAllResolveTargetsForPrim(prim: Prim) {
  const upToResolveTargets: ResolveTarget[] = []
  const strongThanResolveTargets: ResolveTarget[] = []
  const query = new PrimCompositionQuery(prim)
  for (const arc of query.getCompositionArcs()) {
    for (const layer of arc.getTargetNode().getLayerStack().getLayers()) {
      upToResolveTargets.push(arc.makeResolveTargetUpTo(layer as Layer))
      strongThanResolveTargets.push(arc.makeResolveTargetStrongerThan(layer as Layer))
    }
  }
  return { upToResolveTargets, strongThanResolveTargets }
}

const none = undefined
const s = (samples: Array<[number, unknown]>, def?: unknown): ExpectedAttrGetValues => [samples, def]

describe('testUsdResolveTarget', () => {
  // testUsdResolveTarget.cpp:288-768 _TestGetAttrValueWithResolveTargets
  it('_TestGetAttrValueWithResolveTargets', async () => {
    const stage = (await Stage.open(fixturePath('root.usda')))!
    expect(stage).toBeTruthy()

    const parentPrim = stage.getPrim('/Parent')!
    expect(parentPrim).toBeTruthy()
    const childPrim = stage.getPrim('/Parent/RefChild')!
    expect(childPrim).toBeTruthy()

    const rootLayerStackId = { rootLayer: stage.getRootLayer(), sessionLayer: stage.getSessionLayer() }
    const refLayer = Layer.find(fixturePath('ref.usda'))!
    const refLayerStackId = { rootLayer: refLayer, sessionLayer: undefined }
    const site = (id: typeof rootLayerStackId | typeof refLayerStackId, path: string): Site => ({ ...id, path })

    const { upToResolveTargets, strongThanResolveTargets } = getAllResolveTargetsForPrim(childPrim)

    const expectedTargets: Expected[] = [
      // Node: /Parent/RefChild
      [site(rootLayerStackId, '/Parent/RefChild'), 'session'],
      [site(rootLayerStackId, '/Parent/RefChild'), 'root.usda'],
      [site(rootLayerStackId, '/Parent/RefChild'), 'sub1.usda'],
      [site(rootLayerStackId, '/Parent/RefChild'), 'sub2.usda'],

      // Node: /Internal/RefChild
      [site(rootLayerStackId, '/InternalRef/RefChild'), 'session'],
      [site(rootLayerStackId, '/InternalRef/RefChild'), 'root.usda'],
      [site(rootLayerStackId, '/InternalRef/RefChild'), 'sub1.usda'],
      [site(rootLayerStackId, '/InternalRef/RefChild'), 'sub2.usda'],

      // Node: /RefParent/RefChild
      [site(refLayerStackId, '/RefParent/RefChild'), 'ref.usda'],
      [site(refLayerStackId, '/RefParent/RefChild'), 'ref_sub1.usda'],
      [site(refLayerStackId, '/RefParent/RefChild'), 'ref_sub2.usda'],
    ]

    expect(upToResolveTargets).toHaveLength(11)
    expect(strongThanResolveTargets).toHaveLength(11)
    for (let i = 0; i < expectedTargets.length; ++i) {
      verifyResolveTarget(upToResolveTargets[i]!, expectedTargets[i]!)
      verifyResolveTarget(strongThanResolveTargets[i]!, expectedTargets[0]!, expectedTargets[i]!)
    }

    // /Parent/RefChild.foo
    const fooAttr = childPrim.getAttr('foo')!
    expect(fooAttr.isValid()).toBe(true)
    makeAndVerifyQueries(fooAttr, upToResolveTargets, [
      s([], 6.0), s([], 6.0), s([], 5.0), s([], 4.0),
      s([], 3.0), s([], 3.0), s([], 3.0), s([], 3.0),
      s([], 3.0), s([], 2.0), s([], 1.0),
    ])
    makeAndVerifyQueries(fooAttr, strongThanResolveTargets, [
      s([], none), s([], none), s([], 6.0), s([], 6.0),
      s([], 6.0), s([], 6.0), s([], 6.0), s([], 6.0),
      s([], 6.0), s([], 6.0), s([], 6.0),
    ])

    // /Parent/RefChild.var
    const varAttr = childPrim.getAttr('var')!
    expect(varAttr.isValid()).toBe(true)
    makeAndVerifyQueries(varAttr, upToResolveTargets, [
      s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]), s([[1.0, 5], [5.0, 1]]), s([[1.0, 4], [4.0, 1]]),
      s([[1.0, 3], [3.0, 1]]), s([[1.0, 3], [3.0, 1]]), s([[1.0, 3], [3.0, 1]]), s([[1.0, 3], [3.0, 1]]),
      s([[1.0, 3], [3.0, 1]]), s([[1.0, 2], [2.0, 1]]), s([[1.0, 1]]),
    ])
    makeAndVerifyQueries(varAttr, strongThanResolveTargets, [
      s([]), s([]), s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]),
      s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]),
      s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]]),
    ])

    // /Parent/RefChild.bar
    const barAttr = childPrim.getAttr('bar')!
    expect(barAttr.isValid()).toBe(true)
    makeAndVerifyQueries(barAttr, upToResolveTargets, [
      s([[1.0, 6], [6.0, 1]], 5), s([[1.0, 6], [6.0, 1]], 5), s([], 5), s([[1.0, 4], [4.0, 1]], 3),
      s([], 3), s([], 3), s([], 3), s([], 3),
      s([], 3), s([[1.0, 2], [2.0, 1]], 1), s([], 1),
    ])
    makeAndVerifyQueries(barAttr, strongThanResolveTargets, [
      s([]), s([]), s([[1.0, 6], [6.0, 1]]), s([[1.0, 6], [6.0, 1]], 5),
      s([[1.0, 6], [6.0, 1]], 5), s([[1.0, 6], [6.0, 1]], 5), s([[1.0, 6], [6.0, 1]], 5), s([[1.0, 6], [6.0, 1]], 5),
      s([[1.0, 6], [6.0, 1]], 5), s([[1.0, 6], [6.0, 1]], 5), s([[1.0, 6], [6.0, 1]], 5),
    ])

    // /Parent/RefChild.sub1
    const sub1Attr = childPrim.getAttr('sub1')!
    expect(sub1Attr.isValid()).toBe(true)
    const sub1 = s([[1.0, 'sub1_1'], [5.0, 'sub1_5']], 'sub1_def')
    makeAndVerifyQueries(sub1Attr, upToResolveTargets, [
      sub1, sub1, sub1, s([]),
      s([]), s([]), s([]), s([]),
      s([]), s([]), s([]),
    ])
    makeAndVerifyQueries(sub1Attr, strongThanResolveTargets, [
      s([]), s([]), s([]), sub1,
      sub1, sub1, sub1, sub1,
      sub1, sub1, sub1,
    ])

    // /Parent/RefChild.ref_sub1
    const refSub1Attr = childPrim.getAttr('ref_sub1')!
    expect(refSub1Attr.isValid()).toBe(true)
    const refSub1 = s([[1.0, 'ref_sub1_1'], [2.0, 'ref_sub1_2']], 'ref_sub1_def')
    makeAndVerifyQueries(refSub1Attr, upToResolveTargets, [
      refSub1, refSub1, refSub1, refSub1,
      refSub1, refSub1, refSub1, refSub1,
      refSub1, refSub1, s([]),
    ])
    makeAndVerifyQueries(refSub1Attr, strongThanResolveTargets, [
      s([]), s([]), s([]), s([]),
      s([]), s([]), s([]), s([]),
      s([]), s([]), refSub1,
    ])

    // Test creating resolve targets from edit targets
    {
      // An edit target that targets the sub2 layer with no PcpMapping.
      const editTarget = new EditTarget(Layer.find(fixturePath('sub2.usda'))!)

      let upToEditTarget = childPrim.makeResolveTargetUpToEditTarget(editTarget)
      let strongerThanEditTarget = childPrim.makeResolveTargetStrongerThanEditTarget(editTarget)

      verifyResolveTarget(upToEditTarget, expectedTargets[3]!)
      verifyResolveTarget(strongerThanEditTarget, expectedTargets[0]!, expectedTargets[3]!)

      verifyQuery(new AttributeQuery(fooAttr, upToEditTarget), s([], 4.0))
      verifyQuery(new AttributeQuery(fooAttr, strongerThanEditTarget), s([], 6.0))

      // Now set /Parent/RefChild.foo to 10.0 with the edit target.
      const context = new EditContext(stage, editTarget)
      fooAttr.set(10.0)
      await stage.flushChanges()

      upToEditTarget = childPrim.makeResolveTargetUpToEditTarget(editTarget)
      strongerThanEditTarget = childPrim.makeResolveTargetStrongerThanEditTarget(editTarget)

      verifyResolveTarget(upToEditTarget, expectedTargets[3]!)
      verifyResolveTarget(strongerThanEditTarget, expectedTargets[0]!, expectedTargets[3]!)

      verifyQuery(new AttributeQuery(fooAttr, upToEditTarget), s([], 10.0))
      verifyQuery(new AttributeQuery(fooAttr, strongerThanEditTarget), s([], 6.0))
      context.close()
    }

    {
      // An edit target that targets the sub2 layer but maps across /Parent's
      // internal reference to /InternalRef.
      const internalRefNode = parentPrim.getPrimIndex().getNodeProvidingSpec(
        stage.getRootLayer(), '/InternalRef')!
      const editTarget = new EditTarget(Layer.find(fixturePath('sub2.usda'))!, internalRefNode)

      let upToEditTarget = childPrim.makeResolveTargetUpToEditTarget(editTarget)
      let strongerThanEditTarget = childPrim.makeResolveTargetStrongerThanEditTarget(editTarget)

      verifyResolveTarget(upToEditTarget, expectedTargets[7]!)
      verifyResolveTarget(strongerThanEditTarget, expectedTargets[0]!, expectedTargets[7]!)

      verifyQuery(new AttributeQuery(fooAttr, upToEditTarget), s([], 3.0))
      verifyQuery(new AttributeQuery(fooAttr, strongerThanEditTarget), s([], 6.0))

      // Now set /Parent/RefChild.foo to 20.0 with the edit target.
      const context = new EditContext(stage, editTarget)
      fooAttr.set(20.0)
      await stage.flushChanges()

      upToEditTarget = childPrim.makeResolveTargetUpToEditTarget(editTarget)
      strongerThanEditTarget = childPrim.makeResolveTargetStrongerThanEditTarget(editTarget)

      verifyResolveTarget(upToEditTarget, expectedTargets[7]!)
      verifyResolveTarget(strongerThanEditTarget, expectedTargets[0]!, expectedTargets[7]!)

      verifyQuery(new AttributeQuery(fooAttr, upToEditTarget), s([], 20.0))
      verifyQuery(new AttributeQuery(fooAttr, strongerThanEditTarget), s([], 6.0))
      context.close()
    }
  })
})
