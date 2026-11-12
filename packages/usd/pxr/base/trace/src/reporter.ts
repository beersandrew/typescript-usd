// Ported from OpenUSD 26.11.1: pxr/base/trace/reporter.cpp,
//  pxr/base/trace/reporter.h, pxr/base/trace/wrapReporter.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TraceReporter ports OpenUSD v26.08 pxr/base/trace/reporter.cpp:381 and the binding surface
// at pxr/base/trace/wrapReporter.cpp:92. String returns replace ostream/file
// overloads on the web.

import { Collector } from './collector.ts'
import { EventNode, EventTree } from './eventTree.ts'
import { AggregateNode } from './aggregateNode.ts'
import { AggregateTree } from './aggregateTree.ts'

// reporter.cpp:58-69: '|' every 4 columns, lined up with the outer scope.
function _IndentString(indent: number): string {
  const s = new Array<string>(Math.max(indent, 0)).fill(' ')
  for (let i = 2; i < indent; i += 4) s[i] = '|'
  return s.join('')
}

// TfStringPrintf("%W.Pf", value)
function _Fixed(value: number, width: number, precision: number): string {
  return value.toFixed(precision).padStart(width)
}

// reporter.cpp:77-118
function _PrintLineTimes(
  lines: string[], inclusive: number, exclusive: number, count: number, label: string,
  indent: number, recursiveNode: boolean, iterationCount: number,
): void {
  let inclusiveStr = `${_Fixed(inclusive / iterationCount, 9, 3)} ms `
  if (inclusive <= 0) inclusiveStr = ' '.repeat(inclusiveStr.length)
  let exclusiveStr = `${_Fixed(exclusive / iterationCount, 9, 3)} ms `
  if (exclusive <= 0) exclusiveStr = ' '.repeat(exclusiveStr.length)
  let countStr = iterationCount === 1
    ? `${_Fixed(count, 7, 0)} samples `
    : `${_Fixed(count / iterationCount, 10, 3)} samples `
  if (count <= 0) countStr = ' '.repeat(countStr.length)
  lines.push(`${inclusiveStr}${exclusiveStr}${countStr} ${_IndentString(indent)}${recursiveNode ? '*' : ''}${label}\n`)
}

// reporter.cpp:120-136
function _PrintRecursionMarker(lines: string[], label: string, indent: number): void {
  lines.push(`${' '.repeat(13)}${' '.repeat(13)}${' '.repeat(16)} ${_IndentString(indent - 1)} [${label}]\n`)
}

// reporter.cpp:138-166
function _PrintNodeTimes(
  lines: string[], node: AggregateNode, indent: number, iterationCount: number, isRoot = true,
): void {
  if (!isRoot) {
    if (node.isRecursionMarker()) {
      _PrintRecursionMarker(lines, node.getKey(), indent)
      return
    }
    const r = node.isRecursionHead()
    _PrintLineTimes(lines, node.getInclusiveTime(), node.getExclusiveTime(r), node.getCount(r),
      node.getKey(), indent, r, iterationCount)
  }
  for (const child of [...node.getChildrenRef()]) {
    _PrintNodeTimes(lines, child, indent + 2, iterationCount, false)
  }
}

export class Reporter {
  static #globalReporter: Reporter | undefined

  readonly #label: string
  #eventTree = EventTree.new()
  readonly #aggregateTree = new AggregateTree()
  // reporter.cpp:41-51
  groupByFunction = true
  foldRecursiveCalls = false
  shouldAdjustForOverheadAndNoise = true

  constructor(label: string, private readonly collector = Collector.GetInstance()) { this.#label = label }

  static get globalReporter(): Reporter {
    return (Reporter.#globalReporter ??= new Reporter('Trace global reporter'))
  }

  static getGlobalReporter(): Reporter { return Reporter.globalReporter }

  // reporter.cpp:241-375
  static loadReport(text: string): Array<{ tree: AggregateTree, iterationCount: number }> {
    const itCountRE = /^Number of iterations: (\d+)$/
    const treeHeader = 'Tree view  =============='
    const msEntryPattern = String.raw`(?:(\d+\.\d{3}) ms)`
    const msPattern = String.raw`${msEntryPattern}\s+${msEntryPattern}?\s+`
    const msPatternOptional = String.raw`(?:${msPattern}|(?:)\s+)`
    const samplePattern = String.raw`(\d+|\d+\.\d{3}) samples\s+`
    const traceRowRE = new RegExp(String.raw`^\s*${msPatternOptional}${samplePattern}([ |]+)(.*)$`)

    let reading = false
    let currentIters = 1
    const result: Array<{ tree: AggregateTree, iterationCount: number }> = []
    let stack: AggregateNode[] = []
    for (const line of text.split('\n')) {
      if (!reading) {
        if (line === treeHeader) {
          reading = true
          const currentTree = new AggregateTree()
          stack = [currentTree.getRoot()]
          result.push({ tree: currentTree, iterationCount: currentIters })
          continue
        }
        const match = itCountRE.exec(line)
        if (match) currentIters = Number.parseInt(match[1]!, 10)
        continue
      }
      if (line.trim() === '') {
        reading = false
        stack = []
        currentIters = 1
        continue
      }
      const match = traceRowRE.exec(line)
      if (!match) continue
      const depth = Math.floor(match[4]!.length / 2)
      while (stack.length > depth + 1) stack.pop()
      const parent = stack.at(-1)!
      const samples = Math.round(currentIters * Number(match[3]))
      stack.push(parent.append(match[5]!, currentIters * Number(match[1] ?? 0), samples, samples))
    }
    return result
  }

  getLabel(): string { return this.#label }
  getAggregateTreeRoot(): AggregateNode { return this.#aggregateTree.getRoot() }
  get aggregateTreeRoot(): AggregateNode { return this.#aggregateTree.getRoot() }

  getEventRoot(): EventNode { return this.#eventTree.root }
  getEventTree(): EventTree { return this.#eventTree }
  getCounters(): ReadonlyMap<string, number> { return this.#eventTree.getFinalCounterValues() }

  setGroupByFunction(value: boolean): void { this.groupByFunction = value }
  getGroupByFunction(): boolean { return this.groupByFunction }
  setFoldRecursiveCalls(value: boolean): void { this.foldRecursiveCalls = value }
  getFoldRecursiveCalls(): boolean { return this.foldRecursiveCalls }
  setShouldAdjustForOverheadAndNoise(value: boolean): void { this.shouldAdjustForOverheadAndNoise = value }
  ShouldAdjustForOverheadAndNoise(): boolean { return this.shouldAdjustForOverheadAndNoise }

  // reporter.cpp:412-415 and :497-512
  updateTraceTrees(): void {
    const collection = this.collector.createCollection()
    if (collection.empty) return
    const newGraph = this.#eventTree.add(collection)
    this.#aggregateTree.append(newGraph, collection)
  }

  // reporter.cpp:417-422
  clearTree(): void {
    this.#aggregateTree.clear()
    this.#eventTree = EventTree.new()
  }

  reportChromeTracing(): string {
    this.updateTraceTrees()
    return JSON.stringify(this.#eventTree.writeChromeTraceObject())
  }

  // reporter.cpp:186-226
  report(iterationCount = 1): string {
    if (iterationCount < 1) iterationCount = 1
    this.updateTraceTrees()
    if (this.ShouldAdjustForOverheadAndNoise()) {
      this.#aggregateTree.getRoot().adjustForOverheadAndNoise(
        this.collector.getScopeOverhead(), Collector.getTickQuantum())
    }
    if (this.getFoldRecursiveCalls()) this.#aggregateTree.getRoot().markRecursiveChildren()

    const lines: string[] = []
    if (iterationCount > 1) lines.push(`\nNumber of iterations: ${iterationCount}\n`)
    lines.push('\nTree view  ==============\n')
    if (iterationCount === 1) lines.push('   inclusive    exclusive        \n')
    else lines.push('  incl./iter   excl./iter       samples/iter\n')
    _PrintNodeTimes(lines, this.#aggregateTree.getRoot(), 0, iterationCount)
    lines.push('\n')
    return lines.join('')
  }

  // reporter.cpp:377-385 and :168-184
  reportTimes(): string {
    this.updateTraceTrees()
    const sorted = [...this.#aggregateTree.getEventTimes()]
      .map(([key, time], order) => ({ key, time, order }))
      .sort((a, b) => a.time - b.time || a.order - b.order)
    const lines = ['\nTotal time for each key ==============\n']
    for (const { key, time } of sorted) lines.push(`${_Fixed(time, 9, 3)} ms ${key}\n`)
    lines.push('\n')
    return lines.join('')
  }
}

export { Reporter as TraceReporter }
export { AggregateNode, AggregateNode as TraceAggregateNode } from './aggregateNode.ts'
export const TraceReporterTokens = Object.freeze({
  treeView: 'Tree view',
  inclusive: 'inclusive',
  exclusive: 'exclusive',
  samples: 'samples',
})
