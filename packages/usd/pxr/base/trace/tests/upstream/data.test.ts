// Ported from OpenUSD 26.11.1: pxr/base/trace/testenv/testTraceData.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceData.cpp.
// TRACE_FUNCTION_ARGS / TRACE_SCOPE_ARGS (testTraceData.cpp:18-103) open a
// TraceScopeAuto and store each key/value pair as scope data; here the
// scope's StoreData calls do the same. JavaScript numbers carry no
// short/float distinction, so a value's TraceEventData type follows the
// value: the float 9.0 is stored as the number 9 (see the second case).

import { beforeEach, describe, expect, it } from 'vitest'
import {
  Collector, Reporter, TraceEventData, TraceScopeAuto, TraceStaticKeyData,
  type TraceEventNode,
} from '../../src/index.ts'

// testTraceData.cpp:105-116
function TestFunc(a: number, b: number, c: boolean): void {
  const funcScope = new TraceScopeAuto(new TraceStaticKeyData('TestFunc', 'void TestFunc(short, float, bool)'))
  funcScope.storeData('a', a)
  funcScope.storeData('b', b)
  funcScope.storeData('c', c)

  const str = `Test String ${a}`
  const cstr = str
  const innerScope = new TraceScopeAuto('Inner Scope')
  innerScope.storeData('str', str)
  innerScope.storeData('cstr', cstr)
  innerScope.storeData('str literal', 'A String Literal')
  innerScope.storeData('sign string', a > 0 ? 'Positive' : 'Not Positive')
  innerScope.close()
  funcScope.close()
}

// testTraceData.cpp:118-131
function FindNode(root: TraceEventNode, name: string): TraceEventNode | undefined {
  if (root.getKey() === name) return root
  for (const child of root.getChildren()) {
    const result = FindNode(child, name)
    if (result) return result
  }
  return undefined
}

// TraceEventNode::AttributeMap lookup: the single value stored for `key`.
function attr(node: TraceEventNode, key: string): TraceEventData {
  const values = node.attributes.get(key)
  expect(values, key).toHaveLength(1)
  return new TraceEventData(values![0])
}

describe('testTraceData', () => {
  const collector = Collector.GetInstance()
  const reporter = Reporter.getGlobalReporter()

  beforeEach(() => {
    collector.setEnabled(false)
    collector.clear()
    reporter.clearTree()
  })

  it('stores function and scope arguments as event node attributes', () => {
    // testTraceData.cpp:136-177
    collector.setEnabled(true)
    TestFunc(1, 2.5, true)
    collector.setEnabled(false)
    expect(() => JSON.parse(reporter.reportChromeTracing())).not.toThrow()

    const funcNode = FindNode(reporter.getEventRoot(), 'TestFunc')!
    expect(funcNode).toBeDefined()
    expect(funcNode.attributes.size).toBe(3)
    expect(attr(funcNode, 'a').getInt()).toBe(1)
    expect(attr(funcNode, 'b').getFloat()).toBe(2.5)
    expect(attr(funcNode, 'c').getBool()).toBe(true)

    const innerNode = FindNode(reporter.getEventRoot(), 'Inner Scope')!
    expect(innerNode).toBeDefined()
    expect(innerNode.attributes.size).toBe(4)
    expect(attr(innerNode, 'str').GetString()).toBe('Test String 1')
    expect(attr(innerNode, 'cstr').GetString()).toBe('Test String 1')
    expect(attr(innerNode, 'str literal').GetString()).toBe('A String Literal')
    expect(attr(innerNode, 'sign string').GetString()).toBe('Positive')
  })

  it('stores the attributes of a second trace after ClearTree', () => {
    // testTraceData.cpp:179-219
    collector.setEnabled(true)
    TestFunc(-8, 9.0, false)
    collector.setEnabled(false)
    expect(() => JSON.parse(reporter.reportChromeTracing())).not.toThrow()

    const funcNode = FindNode(reporter.getEventRoot(), 'TestFunc')!
    expect(funcNode).toBeDefined()
    expect(funcNode.attributes.size).toBe(3)
    expect(attr(funcNode, 'a').getInt()).toBe(-8)
    // Upstream: GetFloat() == 9.0 for the float argument; the JavaScript
    // number 9 is stored as an integer value.
    expect(attr(funcNode, 'b').value).toBe(9.0)
    expect(attr(funcNode, 'c').getBool()).toBe(false)

    const innerNode = FindNode(reporter.getEventRoot(), 'Inner Scope')!
    expect(innerNode).toBeDefined()
    expect(innerNode.attributes.size).toBe(4)
    expect(attr(innerNode, 'str').GetString()).toBe('Test String -8')
    expect(attr(innerNode, 'cstr').GetString()).toBe('Test String -8')
    expect(attr(innerNode, 'str literal').GetString()).toBe('A String Literal')
    expect(attr(innerNode, 'sign string').GetString()).toBe('Not Positive')
  })
})
