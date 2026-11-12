// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSemantics/testenv/testUsdSemanticsLabelsAPI.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSemantics/testenv/testUsdSemanticsLabelsAPI.py
// (registered as testUsdSemanticsLabelsAPI). Python assertCountEqual compares
// sorted copies; Python bool(schema) is isValid().
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { LabelsAPI } from 'typescript-usd/usdSemantics'

const countEqual = (actual: Iterable<string>, expected: string[]) =>
  expect([...actual].sort()).toEqual([...expected].sort())

describe('TestPseudoRoot', () => {
  const setUp = () => Stage.createNew()
  it('testGetAppliedTaxonomies', () => {
    const stage = setUp()
    countEqual(LabelsAPI.getDirectTaxonomies(stage.getPrim('/')!), [])
  })
  it('testComputeInheritedTaxonomies', () => {
    const stage = setUp()
    countEqual(LabelsAPI.computeInheritedTaxonomies(stage.getPrim('/')!), [])
  })
})

describe('TestUnapplied', () => {
  const setUp = () => {
    const stage = Stage.createNew()
    const rootPrim = stage.definePrim('/Bookcase')
    const unappliedSchema = LabelsAPI.get(rootPrim, 'style')
    expect(unappliedSchema.isValid()).toBe(false)
    return { stage, rootPrim }
  }
  it('testGetAppliedTaxonomies', () => {
    const { rootPrim } = setUp()
    countEqual(LabelsAPI.getDirectTaxonomies(rootPrim), [])
  })
  it('testComputeInheritedTaxonomies', () => {
    const { rootPrim } = setUp()
    countEqual(LabelsAPI.computeInheritedTaxonomies(rootPrim), [])
  })
})

describe('TestDirectlyApplied', () => {
  const setUp = () => {
    const stage = Stage.createNew()
    const rootPrim = stage.definePrim('/Bookcase')
    LabelsAPI.apply(rootPrim, 'style')
    return { stage, rootPrim }
  }
  it('testGetAppliedTaxonomies', () => {
    const { rootPrim } = setUp()
    countEqual(LabelsAPI.getDirectTaxonomies(rootPrim), ['style'])
  })
  it('testComputeInheritedTaxonomies', () => {
    const { rootPrim } = setUp()
    countEqual(LabelsAPI.computeInheritedTaxonomies(rootPrim), ['style'])
  })
})

describe('TestHierachy', () => {
  // The grandparent has two applications of the schema, the child has one,
  // and the parent has zero.
  const setUp = () => {
    const stage = Stage.createNew()
    const grandparent = stage.definePrim('/Grandparent')
    const parent = stage.definePrim('/Grandparent/Parent')
    const child = stage.definePrim('/Grandparent/Parent/Child')
    LabelsAPI.apply(grandparent, 'style')
    LabelsAPI.apply(parent, 'category')
    LabelsAPI.apply(child, 'style')
    return { grandparent, parent, child }
  }
  it('testGetAppliedTaxonomies', () => {
    const { grandparent, parent, child } = setUp()
    countEqual(LabelsAPI.getDirectTaxonomies(grandparent), ['style'])
    countEqual(LabelsAPI.getDirectTaxonomies(parent), ['category'])
    countEqual(LabelsAPI.getDirectTaxonomies(child), ['style'])
  })
  it('testComputeInheritedTaxonomies', () => {
    const { grandparent, parent, child } = setUp()
    countEqual(LabelsAPI.computeInheritedTaxonomies(grandparent), ['style'])
    countEqual(LabelsAPI.computeInheritedTaxonomies(parent), ['style', 'category'])
    countEqual(LabelsAPI.computeInheritedTaxonomies(child), ['style', 'category'])
  })
})
