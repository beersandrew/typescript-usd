// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSemantics/testenv/testUsdSemanticsLabelsQuery.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSemantics/testenv/testUsdSemanticsLabelsQuery.py
// (registered as testUsdSemanticsQuery). Python assertCountEqual compares
// sorted copies; Tf.ErrorException is a thrown Error; subTest loops are
// assertion messages.
import { describe, expect, it } from 'vitest'
import { Stage, TimeCode, type Prim } from 'typescript-usd/usd'
import { Interval } from 'typescript-usd/gf'
import { LabelsAPI, LabelsQuery } from 'typescript-usd/usdSemantics'

const countEqual = (actual: Iterable<string>, expected: string[], msg?: string) =>
  expect([...actual].sort(), msg).toEqual([...expected].sort())

describe('TestInvalid', () => {
  it('testEmptyInterval', () => {
    expect(() => new LabelsQuery('instance_name', new Interval())).toThrow()
  })
  it('testEmptyTaxonomyInterval', () => {
    expect(() => new LabelsQuery('', Interval.getFullInterval())).toThrow()
  })
  it('testEmptyTaxonomyTimeCode', () => {
    expect(() => new LabelsQuery('', TimeCode.Default())).toThrow()
  })
})

const queryTimes = () => [TimeCode.Default(), new TimeCode(1.0), new Interval(-10.0, 10.0)]
const familyStage = () => {
  const stage = Stage.createNew()
  const grandparent = stage.definePrim('/Grandparent')
  const parent = stage.definePrim('/Grandparent/Parent')
  const child = stage.definePrim('/Grandparent/Parent/Child')
  return { stage, grandparent, parent, child, pseudoRoot: stage.getPrim('/')! }
}
const sub = (o: Record<string, unknown>) =>
  JSON.stringify(o, (_k, v) => (v && typeof v === 'object' && 'path' in v ? (v as Prim).path : v instanceof Interval ? String(v) : v))

describe('TestStageWithoutLabels', () => {
  const setUp = () => {
    const f = familyStage()
    return [f.grandparent, f.parent, f.child, f.pseudoRoot]
  }
  it('testComputeDirectLabels', () => {
    const queryPrims = setUp()
    for (const taxonomy of ['category', 'style'])
      for (const time of queryTimes())
        for (const prim of queryPrims) {
          const query = new LabelsQuery(taxonomy, time)
          expect(query.computeUniqueDirectLabels(prim).length, sub({ taxonomy, time, prim })).toBe(0)
        }
  })
  it('testComputeInheritedLabels', () => {
    const queryPrims = setUp()
    for (const taxonomy of ['category', 'style'])
      for (const time of queryTimes())
        for (const prim of queryPrims) {
          const query = new LabelsQuery(taxonomy, time)
          expect(query.computeUniqueInheritedLabels(prim).length, sub({ taxonomy, time, prim })).toBe(0)
        }
  })
  it('testHasDirectLabeled', () => {
    const queryPrims = setUp()
    for (const [taxonomy, label] of [['category', 'object'], ['style', 'chic']] as const)
      for (const time of queryTimes())
        for (const prim of queryPrims) {
          const query = new LabelsQuery(taxonomy, time)
          expect(query.hasDirectLabel(prim, label), sub({ taxonomy, label, time, prim })).toBe(false)
        }
  })
  it('testHasInheritedLabeled', () => {
    const queryPrims = setUp()
    for (const [taxonomy, label] of [['category', 'object'], ['style', 'chic']] as const)
      for (const time of queryTimes())
        for (const prim of queryPrims) {
          const query = new LabelsQuery(taxonomy, time)
          expect(query.hasInheritedLabel(prim, label), sub({ taxonomy, label, time, prim })).toBe(false)
        }
  })
})

describe('TestUnlabeledIntermediateDefaultsOnly', () => {
  const style = 'style'
  const category = 'category'
  const grandparentStyleLabels = ['big', 'large']
  const grandparentCategoryLabels = ['object']
  const childStyleLabels = ['red']

  // Create a stage with a grandparent and child with style labels no labels
  // on the parent prim, and category labels on the grandparent prim.
  const setUp = () => {
    const f = familyStage()
    LabelsAPI.apply(f.grandparent, style).getLabelsAttr()!.set(grandparentStyleLabels)
    LabelsAPI.apply(f.grandparent, category).getLabelsAttr()!.set(grandparentCategoryLabels)
    LabelsAPI.apply(f.child, style).getLabelsAttr()!.set(childStyleLabels)
    return f
  }

  it('testComputeDirectLabels', () => {
    const { pseudoRoot, child, parent, grandparent } = setUp()
    const expected: Record<string, [Prim, string[]][]> = {
      [style]: [[pseudoRoot, []], [child, childStyleLabels], [parent, []], [grandparent, grandparentStyleLabels]],
      [category]: [[pseudoRoot, []], [child, []], [parent, []], [grandparent, grandparentCategoryLabels]],
    }
    for (const time of queryTimes())
      for (const taxonomy in expected)
        for (const [prim, labels] of expected[taxonomy]!) {
          const query = new LabelsQuery(taxonomy, time)
          countEqual(query.computeUniqueDirectLabels(prim), labels, sub({ taxonomy, time, prim, labels }))
        }
  })

  it('testComputeInheritedLabels', () => {
    const { pseudoRoot, child, parent, grandparent } = setUp()
    const expected: Record<string, [Prim, string[]][]> = {
      [style]: [[pseudoRoot, []], [child, [...grandparentStyleLabels, ...childStyleLabels]],
        [parent, grandparentStyleLabels], [grandparent, grandparentStyleLabels]],
      [category]: [[pseudoRoot, []], [child, grandparentCategoryLabels],
        [parent, grandparentCategoryLabels], [grandparent, grandparentCategoryLabels]],
    }
    for (const time of queryTimes())
      for (const taxonomy in expected)
        for (const [prim, labels] of expected[taxonomy]!) {
          const query = new LabelsQuery(taxonomy, time)
          countEqual(query.computeUniqueInheritedLabels(prim), labels, sub({ taxonomy, time, prim, labels }))
        }
  })

  it('testHasDirectLabel', () => {
    const { pseudoRoot, child, parent, grandparent } = setUp()
    const expected: Record<string, [Prim, string[], string[]][]> = {
      [style]: [
        [pseudoRoot, [], ['big', 'red', 'large']],
        [child, ['red'], ['big', 'large']],
        [parent, [], ['big', 'large']],
        [grandparent, ['big', 'large'], ['red']],
      ],
      [category]: [
        [pseudoRoot, [], ['object']],
        [child, [], ['object']],
        [parent, [], ['object']],
        [grandparent, ['object'], []],
      ],
    }
    for (const time of queryTimes())
      for (const taxonomy in expected)
        for (const [prim, appliedLabels, unappliedLabels] of expected[taxonomy]!) {
          for (const label of appliedLabels)
            expect(new LabelsQuery(taxonomy, time).hasDirectLabel(prim, label), sub({ taxonomy, time, prim, label })).toBe(true)
          for (const label of unappliedLabels)
            expect(new LabelsQuery(taxonomy, time).hasDirectLabel(prim, label), sub({ taxonomy, time, prim, label })).toBe(false)
        }
  })

  it('testHasAncestorLabel', () => {
    const { pseudoRoot, child, parent, grandparent } = setUp()
    const expected: Record<string, [Prim, string[], string[]][]> = {
      [style]: [
        [pseudoRoot, [], ['big', 'red', 'large']],
        [child, ['big', 'large', 'red'], []],
        [parent, ['big', 'large'], ['red']],
        [grandparent, ['big', 'large'], ['red']],
      ],
      [category]: [
        [pseudoRoot, [], ['object']],
        [child, ['object'], []],
        [parent, ['object'], []],
        [grandparent, ['object'], []],
      ],
    }
    for (const time of queryTimes())
      for (const taxonomy in expected)
        for (const [prim, appliedLabels, unappliedLabels] of expected[taxonomy]!) {
          for (const label of appliedLabels)
            expect(new LabelsQuery(taxonomy, time).hasInheritedLabel(prim, label), sub({ taxonomy, time, prim, label })).toBe(true)
          for (const label of unappliedLabels)
            expect(new LabelsQuery(taxonomy, time).hasInheritedLabel(prim, label), sub({ taxonomy, time, prim, label })).toBe(false)
        }
  })
})

describe('TestUnlabeledIntermediateTimeSamplesAndDefaults', () => {
  // Tests a stage with a grandparent and child with default labels only, no
  // labels on the parent prim, and both time sampled and default labels on
  // the grandparent prim.
  const size = 'size'
  const grandparentTimeSampleLabels100 = ['small']
  const grandparentTimeSampleLabels200 = ['tiny']
  const childDefaultLabels = ['teeny']

  const setUp = () => {
    const f = familyStage()
    const grandparentSchema = LabelsAPI.apply(f.grandparent, size)
    grandparentSchema.getLabelsAttr()!.setTimeSample(100, grandparentTimeSampleLabels100)
    grandparentSchema.getLabelsAttr()!.setTimeSample(200, grandparentTimeSampleLabels200)
    LabelsAPI.apply(f.child, size).getLabelsAttr()!.set(childDefaultLabels)
    return f
  }
  const check = (time: TimeCode | Interval, grandparentLabels: string[], shared = false) => {
    const { pseudoRoot, child, parent, grandparent } = setUp()
    const expected: [Prim, string[]][] = [[pseudoRoot, []], [child, ['teeny']], [parent, []], [grandparent, grandparentLabels]]
    const sharedQuery = new LabelsQuery(size, time)
    for (const [prim, labels] of expected) {
      const query = shared ? sharedQuery : new LabelsQuery(size, time)
      countEqual(query.computeUniqueDirectLabels(prim), labels, sub({ prim, labels }))
    }
  }

  it('testComputeDirectLabelsBeforeInterval', () => check(new TimeCode(-100), ['small']))
  it('testComputeDirectLabelsAfterInterval', () => check(new TimeCode(3000), ['tiny'], true))
  it('testComputeDirectLabelsIncludingAll', () => check(new Interval(100, 200), ['tiny', 'small']))
  it('testComputeDirectLabelsFullInterval', () => check(Interval.getFullInterval(), ['tiny', 'small']))
  it('testComputeDirectLabelsSubinterval', () => check(new Interval(150, 175), ['small']))
})

describe('TestAncestorPopulation', () => {
  // Tests a stage where parent and grandparent both have labels. An early
  // version of LabelsQuery would early exit during ancestor population,
  // causing this test case to fail. This exercises different access patterns
  // (top down / bottom up) to make sure the cache gets populated correctly.
  const size = 'size'
  const setUp = () => {
    const f = familyStage()
    LabelsAPI.apply(f.grandparent, size).getLabelsAttr()!.set(['big', 'large'])
    LabelsAPI.apply(f.parent, size).getLabelsAttr()!.set(['small'])
    const expected: [Prim, string[]][] = [
      [f.pseudoRoot, []],
      [f.grandparent, ['big', 'large']],
      [f.parent, ['small', 'big', 'large']],
      [f.child, ['small', 'big', 'large']],
    ]
    return expected
  }

  it('testComputeInheritedLabelsUniqueCache', () => {
    // Ensure that each query gets a unique cache
    for (const [prim, labels] of setUp()) {
      const query = new LabelsQuery(size, TimeCode.Default())
      countEqual(query.computeUniqueInheritedLabels(prim), labels, sub({ prim, labels }))
    }
  })
  it('testComputeInheritedLabelsTopDown', () => {
    // Share the query cache across tests, traversing top down
    const query = new LabelsQuery(size, TimeCode.Default())
    for (const [prim, labels] of setUp())
      countEqual(query.computeUniqueInheritedLabels(prim), labels, sub({ prim, labels }))
  })
  it('testComputeInheritedLabelsBottomUp', () => {
    // Share the query cache across tests, traversing bottom up
    const query = new LabelsQuery(size, TimeCode.Default())
    for (const [prim, labels] of setUp().reverse())
      countEqual(query.computeUniqueInheritedLabels(prim), labels, sub({ prim, labels }))
  })
})
