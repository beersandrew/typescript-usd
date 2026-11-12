// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdContainerDataSourceUtils.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful TypeScript port of OpenUSD's
// pxr/imaging/hd/testenv/testHdContainerDataSourceUtils.cpp
//
// Exercises HdOverlayContainerDataSource, HdContainerDataSourceEditor and
// HdDebugPrintDataSource. Containers are compared by serializing them via
// HdDebugPrintDataSource and comparing the resulting strings, exactly as the
// C++ test does.

import { describe, it, expect } from 'vitest'
import {
  HdContainerDataSource,
  HdDataSourceBase,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
} from '../../src/dataSource.ts'
import {
  HdDataSourceLocator,
  HdDataSourceLocatorSet,
} from '../../src/dataSourceLocator.ts'
import { HdOverlayContainerDataSource } from '../../src/overlayContainerDataSource.ts'
import { HdContainerDataSourceEditor } from '../../src/containerDataSourceEditor.ts'
import { HdDebugPrintDataSource } from '../../src/dataSource.ts'

// test brevity conveniences (mirrors `#define I(v)` and `L(str)`)
const I = (v: number): HdDataSourceBase =>
  HdRetainedTypedSampledDataSource.new<number>(v)

const C = (
  names: string[],
  values: HdDataSourceBase[],
): HdContainerDataSource => HdRetainedContainerDataSource.new(names, values)

const L = (inputStr: string): HdDataSourceLocator =>
  new HdDataSourceLocator(...inputStr.split('/').filter(s => s.length > 0))

// Mirrors the COMPARECONTAINERS macro: compares debug-printed strings.
const expectContainersEqual = (
  a: HdContainerDataSource | undefined,
  b: HdContainerDataSource | undefined,
): void => {
  expect(HdDebugPrintDataSource(a)).toBe(HdDebugPrintDataSource(b))
}

// ----------------------------------------------------------------------------

describe('TestSimpleOverlay', () => {
  it('resolves each name to the first container that provides it', () => {
    const containers = [
      C(['A', 'F'], [I(1), I(7)]),
      C(['B', 'C'], [I(2), I(3)]),
      C(
        ['D', 'F', 'G'],
        [C(['E'], [I(4)]), I(6), I(8)],
      ),
    ]

    const test = HdOverlayContainerDataSource.new(...containers)

    const baseline = C(
      ['A', 'B', 'C', 'D', 'F', 'G'],
      [I(1), I(2), I(3), C(['E'], [I(4)]), I(7), I(8)],
    )

    expectContainersEqual(test, baseline)
  })
})

// ----------------------------------------------------------------------------

describe('TestContainerEditor', () => {
  it('one level', () => {
    const baseline = C(['A', 'B'], [I(1), I(2)])

    const test = new HdContainerDataSourceEditor()
      .Set(L('A'), I(1))
      .Set(L('B'), I(2))
      .finish()

    expectContainersEqual(test, baseline)
  })

  it('two levels with override', () => {
    const test = new HdContainerDataSourceEditor()
      .Set(L('A'), I(1))
      .Set(L('B'), I(2))
      .Set(L('C/D'), I(3))
      .Set(L('C/E'), I(4))
      .Set(L('B'), I(5))
      .finish()

    const baseline = C(
      ['A', 'B', 'C'],
      [I(1), I(5), C(['D', 'E'], [I(3), I(4)])],
    )

    expectContainersEqual(test, baseline)
  })

  it('set with container and then override', () => {
    const test = new HdContainerDataSourceEditor()
      .Set(L('A'), C(['B'], [I(1)]))
      .Set(L('A/C'), I(2))
      .Set(L('A/D/E'), I(3))
      .finish()

    const baseline = C(
      ['A'],
      [
        C(
          ['B', 'C', 'D'],
          [I(1), I(2), C(['E'], [I(3)])],
        ),
      ],
    )

    expectContainersEqual(test, baseline)
  })

  it('set with container, override deeply + delete', () => {
    const subcontainer = new HdContainerDataSourceEditor()
      .Set(L('B/C/E'), I(2))
      .Set(L('Z/Y'), I(3))
      .finish()

    const test = new HdContainerDataSourceEditor()
      .Set(L('A'), subcontainer)
      .Set(L('A/B/Q'), I(5))
      .Set(L('A/B/C/F'), I(6))
      .Set(L('A/Z/Y'), undefined)
      .finish()

    const baseline = C(
      ['A'],
      [
        C(
          ['B', 'Z'],
          [
            C(
              ['C', 'Q'],
              [C(['E', 'F'], [I(2), I(6)]), I(5)],
            ),
            C([], []),
          ],
        ),
      ],
    )

    expectContainersEqual(test, baseline)
  })

  it('initial container + overrides', () => {
    const initialContainer = new HdContainerDataSourceEditor()
      .Set(L('A/B'), I(1))
      .finish()

    const test = new HdContainerDataSourceEditor(initialContainer)
      .Set(L('A/C'), I(2))
      .Set(L('D'), I(3))
      .finish()

    const baseline = C(
      ['A', 'D'],
      [C(['B', 'C'], [I(1), I(2)]), I(3)],
    )

    expectContainersEqual(test, baseline)
  })

  it('sub-container replacement + masking', () => {
    const initialContainer = new HdContainerDataSourceEditor()
      .Set(L('A'), C(['B', 'C'], [I(1), I(2)]))
      .finish()

    const test = new HdContainerDataSourceEditor(initialContainer)
      .Set(L('A'), C(['D', 'E'], [I(3), I(4)]))
      .finish()

    const baseline = new HdContainerDataSourceEditor()
      .Set(L('A/D'), I(3))
      .Set(L('A/E'), I(4))
      .finish()

    expectContainersEqual(test, baseline)
  })

  it('sub-container overlay', () => {
    const initialContainer = new HdContainerDataSourceEditor()
      .Set(L('A'), C(['B', 'C'], [I(1), I(2)]))
      .finish()

    const subcontainer = new HdContainerDataSourceEditor()
      .Set(L('D'), I(3))
      .finish()

    const test = new HdContainerDataSourceEditor(initialContainer)
      .overlay(L('A'), subcontainer)
      .finish()

    const baseline = new HdContainerDataSourceEditor()
      .Set(L('A/B'), I(1))
      .Set(L('A/C'), I(2))
      .Set(L('A/D'), I(3))
      .finish()

    expectContainersEqual(test, baseline)
  })

  it('computes locators to invalidate', () => {
    const SENTINEL_CONTAINER = '__containerDataSource'

    const overridenLocators = new HdDataSourceLocatorSet([
      L('A/B'),
      L('A/C'),
      L('D/E/F'),
    ])

    const expectedDirtyLocators = new HdDataSourceLocatorSet([
      L('A/B'),
      L('A/C'),
      L('D/E/F'),
      new HdDataSourceLocator(SENTINEL_CONTAINER),
      new HdDataSourceLocator('A', SENTINEL_CONTAINER),
      new HdDataSourceLocator('D', SENTINEL_CONTAINER),
      new HdDataSourceLocator('D', 'E', SENTINEL_CONTAINER),
    ])

    const result =
      HdContainerDataSourceEditor.computeDirtyLocators(overridenLocators)

    // Compare as unordered sets of locator strings.
    const toStringSet = (s: HdDataSourceLocatorSet): string[] =>
      [...new Set([...s].map(l => l.GetString()))].sort()

    expect(toStringSet(result)).toEqual(toStringSet(expectedDirtyLocators))
  })
})
