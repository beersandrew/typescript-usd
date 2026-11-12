// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfConnectorMap.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfConnectorMap.cpp
//
// main() is one it(); each upstream error count increment is an expect().
// VdfConnectorMap<TestConnector> is `new VdfConnectorMap(TestConnector)`
// (connectorMap.ts header); try_emplace(k).first->second is
// try_emplace(k)[0][1].

import { describe, expect, it } from 'vitest'

import { VdfConnectorMap } from '../../src/connectorMap.ts'

class TestConnector {}

type MapType = VdfConnectorMap<TestConnector, []>
type ResultType = Array<[string, TestConnector]>

// _TestFind (testVdfConnectorMap.cpp:28-44).
function _TestFind(map: MapType, key: string, expected: TestConnector): boolean {
  const result = map.find(key)![1]
  return result === expected
}

// _TestMapContents (testVdfConnectorMap.cpp:48-85).
function _TestMapContents(map: MapType, expected: ResultType): boolean {
  if (map.size() !== expected.length) return false
  let index = 0
  for (const [resultKey, result] of map) {
    if (resultKey !== expected[index]![0]) return false
    if (result !== expected[index]![1]) return false
    ++index
  }
  return true
}

describe('testVdfConnectorMap', () => {
  it('main', () => {
    const map: MapType = new VdfConnectorMap(TestConnector)
    const emptyMap: MapType = new VdfConnectorMap(TestConnector)

    // Maps should have been equal.
    expect(map.notEquals(emptyMap)).toBe(false)

    const a = 'a'
    const b = 'b'

    // VdfConnectorMap owns the TestConnector objects.
    const aptr = map.try_emplace(a)[0][1]
    const bptr = map.try_emplace(b)[0][1]

    // Maps should have been unequal.
    expect(map.Equals(emptyMap)).toBe(false)

    // Test the contents of the map.
    {
      const result: ResultType = [[a, aptr], [b, bptr]]
      expect(_TestMapContents(map, result)).toBe(true)
    }

    // Find individual entries in the map.
    expect(_TestFind(map, a, aptr)).toBe(true)
    expect(_TestFind(map, b, bptr)).toBe(true)

    // Swap maps.
    map.swap(emptyMap)
    expect(map.size()).toBe(0)

    // Swap back.
    map.swap(emptyMap)
    expect(map.size()).toBe(2)
    expect(emptyMap.empty()).toBe(true)

    // Clear the map.
    map.clear()
    expect(map.size()).toBe(0)
  })
})
