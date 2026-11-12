// Ported from OpenUSD 26.11.1:
//  pxr/base/trace/testenv/testTraceReporterLoadTrace.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11 pxr/base/trace/testenv/testTraceReporterLoadTrace.py.
// Report text replaces the temporary report files: Reporter.LoadReport
// parses a string and Reporter.Report returns one.

import { describe, expect, it } from 'vitest'
import { Reporter, type TraceAggregateNode, type TraceAggregateTree } from '../../src/index.ts'

// textwrap.dedent
function dedent(text: string): string {
  const lines = text.split('\n')
  const indents = lines.filter(l => l.trim() !== '').map(l => /^ */.exec(l)![0].length)
  const margin = Math.min(...indents)
  return lines.map(l => l.trim() === '' ? '' : l.slice(margin)).join('\n')
}

// testTraceReporterLoadTrace.py:38-47
interface NodeData {
  key: string
  inclusive: number
  exclusive: number
  samples: number
  children: NodeData[]
}

// testTraceReporterLoadTrace.py:49-59
function GetNodeDataTree(tree: TraceAggregateTree): NodeData {
  const convert = (node: TraceAggregateNode): NodeData => ({
    key: node.key, inclusive: node.inclusiveTime, exclusive: node.exclusiveTime,
    samples: node.count, children: node.children.map(convert),
  })
  return convert(tree.root)
}

// testTraceReporterLoadTrace.py:61-99
function BuildNodeDataTree(data: Array<[number, number, number, string]>): NodeData {
  const root: NodeData = { key: 'root', inclusive: 0, exclusive: 0, samples: 0, children: [] }
  const stack = [root]
  for (const [incl, excl, samples, depthAndKey] of data) {
    const key = depthAndKey.trimStart()
    const depth = (depthAndKey.length - key.length) / 2
    while (stack.length > depth + 1) stack.pop()
    const nodeData: NodeData = { key, inclusive: incl, exclusive: excl, samples, children: [] }
    stack.at(-1)!.children.push(nodeData)
    stack.push(nodeData)
  }
  return root
}

// Python's round(): half to even.
function pyRound(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

// The reporter only reports up to 3 decimal places.
const THRESHOLD = 0.001

// testTraceReporterLoadTrace.py:105-122
function AssertNodeTreesEqual(rootA: NodeData, rootB: NodeData, delta = THRESHOLD): void {
  expect(rootA.key, 'keys are different').toBe(rootB.key)
  expect(Math.abs(rootA.inclusive - rootB.inclusive), `${rootA.key}: inclusive times are different`)
    .toBeLessThanOrEqual(delta + 1e-12)
  expect(Math.abs(rootA.exclusive - rootB.exclusive), `${rootA.key}: exclusive times are different`)
    .toBeLessThanOrEqual(delta + 1e-12)
  expect(rootA.samples, `${rootA.key}: sample counts are different`).toBe(rootB.samples)
  expect(rootA.children.length, `${rootA.key}: child counts are different`).toBe(rootB.children.length)
  rootA.children.forEach((childA, i) => AssertNodeTreesEqual(childA, rootB.children[i]!, delta))
}

// testTraceReporterLoadTrace.py:124-155
function AssertRoundTripValid(
  testId: string, parsed: ReturnType<typeof Reporter.loadReport>, delta = THRESHOLD,
): void {
  let file = ''
  parsed.forEach(({ tree, iterationCount }, index) => {
    const reporter = new Reporter(`${testId}_${index}`)
    const root = reporter.aggregateTreeRoot
    for (const child of tree.root.children) root.append(child)
    file += reporter.report(iterationCount)
  })
  const newParsed = Reporter.loadReport(file)
  expect(newParsed.length, 'Number of trees saved != number of trees loaded').toBe(parsed.length)
  parsed.forEach((old, i) => {
    const neu = newParsed[i]!
    expect(old.iterationCount, 'iterationCount saved != iterationCount loaded').toBe(neu.iterationCount)
    AssertNodeTreesEqual(GetNodeDataTree(old.tree), GetNodeDataTree(neu.tree), delta)
  })
}

describe('testTraceReporterLoadTrace', () => {
  it('test_Basic', () => {
    // testTraceReporterLoadTrace.py:157-194
    const parsed = Reporter.loadReport(dedent(`
            Tree view  ==============
                inclusive    exclusive        
               484.707 ms    31.384 ms       2 samples    Main Thread
                 0.001 ms     0.001 ms       1 samples    | CmdRegistry::_HandleNotice
                 0.064 ms     0.058 ms       3 samples    | AppIterationFinished
                 0.006 ms     0.006 ms       3 samples    |   AppIterationFinished: Send AppNotice::IterationFinished
                                             1 samples    |   | DidManager::FlushPendingInteractions
               453.258 ms     0.044 ms      24 samples    | UiqApplication::Exec (Event loop)
               453.214 ms   440.033 ms      24 samples    |   UiqApplication::Exec (Process Qt events)
                13.181 ms    13.181 ms      30 samples    |   | UiqApplication::_notify
                                             1 samples    |   |   AppExecuteQueuedLaterFunctions
            `))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.iterationCount).toBe(1)

    const expected = BuildNodeDataTree([
      [484.707, 31.384, 2, 'Main Thread'],
      [0.001, 0.001, 1, '  CmdRegistry::_HandleNotice'],
      [0.064, 0.058, 3, '  AppIterationFinished'],
      [0.006, 0.006, 3, '    AppIterationFinished: Send AppNotice::IterationFinished'],
      [0.000, 0.000, 1, '      DidManager::FlushPendingInteractions'],
      [453.258, 0.044, 24, '  UiqApplication::Exec (Event loop)'],
      [453.214, 440.033, 24, '    UiqApplication::Exec (Process Qt events)'],
      [13.181, 13.181, 30, '      UiqApplication::_notify'],
      [0.000, 0.000, 1, '        AppExecuteQueuedLaterFunctions'],
    ])
    AssertNodeTreesEqual(expected, GetNodeDataTree(parsed[0]!.tree))
    AssertRoundTripValid('test_Basic', parsed)
  })

  it('test_BlankEntryOnMainThreadExclusiveTime', () => {
    // testTraceReporterLoadTrace.py:196-224
    const parsed = Reporter.loadReport(dedent(`
            Tree view  ==============
               inclusive    exclusive        
                9.064 ms                    1 samples    Main Thread
                9.064 ms     0.072 ms       1 samples    | Tormentor::menva_read_time
                8.992 ms     5.792 ms       1 samples    |   SdfLayer::FindOrOpen
                3.200 ms     3.200 ms       1 samples    |   | SdfLayer::_ComputeInfoToFindOrOpenLayer
            `))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.iterationCount).toBe(1)

    const expected = BuildNodeDataTree([
      [9.064, 0.000, 1, 'Main Thread'],
      [9.064, 0.072, 1, '  Tormentor::menva_read_time'],
      [8.992, 5.792, 1, '    SdfLayer::FindOrOpen'],
      [3.200, 3.200, 1, '      SdfLayer::_ComputeInfoToFindOrOpenLayer'],
    ])
    AssertNodeTreesEqual(expected, GetNodeDataTree(parsed[0]!.tree))
    AssertRoundTripValid('test_BlankEntryOnMainThreadExclusiveTime', parsed)
  })

  it('test_Iters', () => {
    // testTraceReporterLoadTrace.py:226-274
    const parsed = Reporter.loadReport(dedent(`
            Number of iterations: 36
        
            Tree view  ==============
            inclusive    exclusive        
                0.040 ms                    0.028 samples    Main Thread
                0.040 ms     0.004 ms       0.028 samples    | AppIterationFinished
                0.036 ms                    0.028 samples    |   AppExecuteQueuedLaterFunctions
                0.036 ms     0.012 ms       0.028 samples    |   | UpPlayer::_SendPendingPlayModeNotification
                0.024 ms     0.002 ms       0.028 samples    |   |   UpPlayer::_SendPendingPlayModeNotification (_PlaybackDidStop)
                0.022 ms     0.006 ms       0.028 samples    |   |   | uncached_frame_change
                                            0.111 samples    |   |   |   UpPlayer::IsTimeMunging
                0.001 ms     0.001 ms       0.083 samples    |   |   |   CmdRegistry::_HandleNotice
                0.015 ms     0.015 ms       0.028 samples    |   |   |   UpPlayer::SetPaused
            `))
    expect(parsed).toHaveLength(1)
    const iters = 36
    expect(parsed[0]!.iterationCount).toBe(iters)

    const expected = BuildNodeDataTree([
      [iters * 0.040, iters * 0.000, pyRound(iters * 0.028), 'Main Thread'],
      [iters * 0.040, iters * 0.004, pyRound(iters * 0.028), '  AppIterationFinished'],
      [iters * 0.036, iters * 0.000, pyRound(iters * 0.028), '    AppExecuteQueuedLaterFunctions'],
      [iters * 0.036, iters * 0.012, pyRound(iters * 0.028), '      UpPlayer::_SendPendingPlayModeNotification'],
      [iters * 0.024, iters * 0.002, pyRound(iters * 0.028), '        UpPlayer::_SendPendingPlayModeNotification (_PlaybackDidStop)'],
      [iters * 0.022, iters * 0.006, pyRound(iters * 0.028), '          uncached_frame_change'],
      [iters * 0.000, iters * 0.000, pyRound(iters * 0.111), '            UpPlayer::IsTimeMunging'],
      [iters * 0.001, iters * 0.001, pyRound(iters * 0.083), '            CmdRegistry::_HandleNotice'],
      [iters * 0.015, iters * 0.015, pyRound(iters * 0.028), '            UpPlayer::SetPaused'],
    ])
    AssertNodeTreesEqual(expected, GetNodeDataTree(parsed[0]!.tree))
    // testTraceReporterLoadTrace.py:267-274: a weaker threshold.
    AssertRoundTripValid('test_Iters', parsed, THRESHOLD * iters)
  })

  it('test_MultipleTrees', () => {
    // testTraceReporterLoadTrace.py:276-321
    const parsed = Reporter.loadReport(dedent(`
            Tree view  ==============
            inclusive    exclusive        
            123.442 ms                    1 samples    Main Thread
            123.442 ms     0.120 ms       1 samples    | Kitchen_set_flattened.usd
            123.322 ms   123.320 ms       1 samples    |   SdfLayer::_WriteToFile
              0.002 ms     0.002 ms       1 samples    |   | Sdf_FileFormatRegistry::FindByExtension


            Tree view  ==============
            inclusive    exclusive        
              2.226 ms                    1 samples    Main Thread
              2.226 ms     0.035 ms       1 samples    | s035_1c_fx_confetti_162.usd
              2.191 ms     2.185 ms       1 samples    |   SdfLayer::_WriteToFile
              0.006 ms     0.006 ms       1 samples    |   | Sdf_FileFormatRegistry::FindByExtension
        `))
    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.iterationCount).toBe(1)
    expect(parsed[1]!.iterationCount).toBe(1)

    const expected1 = BuildNodeDataTree([
      [123.442, 0.000, 1, 'Main Thread'],
      [123.442, 0.120, 1, '  Kitchen_set_flattened.usd'],
      [123.322, 123.320, 1, '    SdfLayer::_WriteToFile'],
      [0.002, 0.002, 1, '      Sdf_FileFormatRegistry::FindByExtension'],
    ])
    const expected2 = BuildNodeDataTree([
      [2.226, 0.000, 1, 'Main Thread'],
      [2.226, 0.035, 1, '  s035_1c_fx_confetti_162.usd'],
      [2.191, 2.185, 1, '    SdfLayer::_WriteToFile'],
      [0.006, 0.006, 1, '      Sdf_FileFormatRegistry::FindByExtension'],
    ])
    AssertNodeTreesEqual(expected1, GetNodeDataTree(parsed[0]!.tree))
    AssertNodeTreesEqual(expected2, GetNodeDataTree(parsed[1]!.tree))
    AssertRoundTripValid('test_MultipleTrees', parsed)
  })
})
