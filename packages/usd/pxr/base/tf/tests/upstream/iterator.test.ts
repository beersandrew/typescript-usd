// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/iterator.cpp,
//  pxr/base/tf/iterator.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/testenv/iterator.cpp, registration
// TfIterator (Test_TfIterator, iterator.cpp:175-180), run by testTf.
//
// Adaptation (src/iterator.ts): TfIterator is a cursor over a snapshot of a
// JavaScript iterable; `bool(it)` is IsValid(), `*it` is GetValue(), `++it`
// is it = it.GetNext(). TF_FOR_ALL / TF_REVERSE_FOR_ALL are iteration over
// TfMakeIterator / TfMakeReverseIterator. JavaScript has no operator==, so the
// iterator-equality axioms (mapIterCopy == mapIter, mapIter == mapEnd,
// mapIter != mapIterCopy) and the conversion back to an STL iterator are not
// ported; const and non-const instantiations of TESTBODY are the same here.
import { describe, expect, it } from 'vitest'
import { TfArraySize, TfIterator, TfMakeIterator, TfMakeReverseIterator } from '../../src/index.ts'

describe('TfIterator (testenv/iterator.cpp)', () => {
  it('TESTBODY: iterates a vector and a map (iterator.cpp:17-58)', () => {
    const origVec = [0, -5, 5]
    const copyVec: number[] = []
    let vecIter = new TfIterator(origVec)
    for (; vecIter.isValid(); vecIter = vecIter.getNext()) copyVec.push(vecIter.GetValue()!)
    expect(vecIter.isValid()).toBe(false)
    expect(copyVec).toEqual(origVec)

    const origMap = new Map([['a', 'a'], ['b', 'b'], ['c', 'c']])
    let copyMap = new Map<string, string>()
    let mapIter = new TfIterator(origMap)
    let mapIterCopy = mapIter
    for (; mapIter.isValid(); mapIter = mapIter.getNext()) {
      const [first, second] = mapIter.GetValue()!
      copyMap.set(first, second)
    }
    expect(mapIter.isValid()).toBe(false)
    expect(copyMap).toEqual(origMap)

    copyMap = new Map()
    for (; mapIterCopy.isValid(); mapIterCopy = mapIterCopy.getNext()) {
      const [first, second] = mapIterCopy.GetValue()!
      copyMap.set(first, second)
    }
    expect(mapIter.isValid()).toBe(false)
    expect(copyMap).toEqual(origMap)
  })

  it('TF_FOR_ALL / TF_REVERSE_FOR_ALL over references (iterator.cpp:112-144)', () => {
    const data = [3, 2, 1]
    let count = 3
    for (const i of TfMakeIterator(data)) expect(i).toBe(count--)
    count = 1
    for (const i of TfMakeReverseIterator(data)) expect(i).toBe(count++)
  })

  it('TF_FOR_ALL over pointer-iterator spans (iterator.cpp:146-173)', () => {
    const data = [3, 2, 1]
    const span = data.slice(0, TfArraySize(data))
    let sum = 0
    let count = 0
    for (const it of TfMakeIterator(span)) { sum += it; ++count }
    expect(sum).toBe(6)
    expect(count).toBe(3)

    const empty: string[] = []
    sum = 0
    count = 0
    for (const it of TfMakeIterator(empty)) { sum += it.length; ++count }
    expect(sum).toBe(0)
    expect(count).toBe(0)
  })
})
