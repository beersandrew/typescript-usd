// Ported from OpenUSD 26.11.1: pxr/base/ts/TsTest_Baseliner.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import type { TsSpline } from './spline.ts'
import { TsTest_Comparator } from './TsTest_Comparator.ts'
import { TsTest_Grapher } from './TsTest_Grapher.ts'
import { TsTest_Sample, type TsTest_SampleVec } from './tsTest_Types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/TsTest_Baseliner.py.
//
// TsTest_Baseliner.py reads "baseline/<name>_TsTestBaseline.txt" relative to
// the working directory and writes candidate files beside it. typescript-usd library
// code does no file IO, so the caller supplies those operations through
// TsTest_BaselinerIO; lines the Python prints are collected in `messages`.

export interface TsTest_BaselinerIO {
  /** Contents of a file such as "baseline/X_TsTestBaseline.txt", or undefined. */
  readFile(path: string): string | undefined
  /** Write a candidate file; omit to skip writing candidates. */
  writeFile?(path: string, contents: string): void
  /** Whether a file exists (used for the optional baseline graph). */
  exists?(path: string): boolean
}

const noIO: TsTest_BaselinerIO = { readFile: () => undefined }

// TsTest_Baseliner.py:97-104.
class _Spline {
  constructor(
    public spline: TsSpline | undefined = undefined,
    public samples: TsTest_SampleVec = [],
    public name = '',
    public debugDesc = '',
  ) {}
}

/** Python's str.isdecimal() for the ASCII atoms produced by _DiffString. */
const isDecimal = (s: string): boolean => /^[0-9]+$/.test(s)

/** Python Gf.IsClose: |a - b| < epsilon. */
const isClose = (a: number, b: number, epsilon: number): boolean => Math.abs(a - b) < epsilon

/** Split into lines keeping line endings (str.splitlines(keepends=True)). */
function splitLinesKeepEnds(s: string): string[] {
  return s.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

/** difflib.unified_diff with full context, as TsTest_Baseliner.py:476-492 prints. */
function unifiedDiff(left: string[], right: string[], fromfile: string, tofile: string): string[] {
  const n = left.length, m = right.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = left[i] === right[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const body: string[] = []
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && left[i] === right[j]) { body.push(' ' + left[i]!); i++; j++ }
    else if (j < m && (i === n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) { body.push('+' + right[j]!); j++ }
    else { body.push('-' + left[i]!); i++ }
  }
  if (body.every(l => l.startsWith(' '))) return []
  return [`--- ${fromfile}\n`, `+++ ${tofile}\n`, `@@ -1,${n} +1,${m} @@\n`, ...body]
}

export class TsTest_Baseliner {
  // TsTest_Baseliner.py:77-95.
  static createForParamCompare(
    testName: string, spline: TsSpline, samples: TsTest_SampleVec, precision = 6,
    io: TsTest_BaselinerIO = noIO,
  ): TsTest_Baseliner {
    return new TsTest_Baseliner(testName, spline, samples, precision, false, io)
  }

  static createForEvalCompare(
    testName: string, spline: TsSpline, samples: TsTest_SampleVec, precision = 6,
    io: TsTest_BaselinerIO = noIO,
  ): TsTest_Baseliner {
    return new TsTest_Baseliner(testName, spline, samples, precision, true, io)
  }

  readonly #testName: string
  readonly #fileName: string
  readonly #singleGraphFileName: string
  readonly #diffGraphFileName: string
  readonly #precision: number
  readonly #resultSpline: _Spline
  readonly #epsilon: number
  readonly #compareSamples: boolean
  readonly #io: TsTest_BaselinerIO

  #creationStr = ''
  readonly #referenceSplines: _Spline[] = []

  #baselineCreationStr = ''
  #baselineSpline = new _Spline()
  #baselineSampleLineOffset = 0
  #baselinePrecision = 0

  #newCreationStr: string | undefined
  #newParamStr: string | undefined

  /** Lines TsTest_Baseliner.py would print to stdout. */
  readonly messages: string[] = []

  // TsTest_Baseliner.py:106-136.
  private constructor(
    testName: string, spline: TsSpline, samples: TsTest_SampleVec, precision: number,
    compareSamples: boolean, io: TsTest_BaselinerIO,
  ) {
    this.#testName = testName
    this.#fileName = `${testName}_TsTestBaseline.txt`
    this.#singleGraphFileName = `${testName}_TsTestGraph.png`
    this.#diffGraphFileName = `${testName}_TsTestDiff.png`
    this.#precision = precision
    this.#resultSpline = new _Spline(spline, samples, '', spline.toString())
    this.#epsilon = 10 ** -this.#precision
    this.#compareSamples = compareSamples
    this.#io = io
  }

  // TsTest_Baseliner.py:138-143.
  setCreationString(creationString: string): void {
    this.#creationStr = creationString
  }

  // TsTest_Baseliner.py:145-153.
  addReferenceSpline(name: string, spline: TsSpline, samples: TsTest_SampleVec): void {
    this.#referenceSplines.push(new _Spline(spline, samples, name, spline.toString()))
  }

  // TsTest_Baseliner.py:155-198.
  validate(): boolean {
    const baselinePath = `baseline/${this.#fileName}`
    const contents = this.#io.readFile(baselinePath)
    if (contents === undefined) {
      this.messages.push(`${this.#testName}: no baseline yet`)
      this.#writeCandidates()
      return false
    }

    if (!this.#readBaseline(contents, baselinePath)) {
      this.#writeCandidates()
      return false
    }

    if (this.#creationStr && !this.#validateCreationString()) {
      this.#validateParams()
      this.#writeCandidates()
      return false
    }

    if (!this.#compareSamples) {
      if (this.#validateParams()) {
        this.#writeOptionals()
        return true
      }
      this.#writeCandidates()
      this.#writeDiffGraph()
      return false
    }

    if (!this.#validateInputs()) {
      this.#writeCandidates()
      return false
    }

    if (!this.#validateValues()) {
      this.#writeCandidates()
      this.#writeDiffGraph()
      return false
    }

    this.#writeOptionals()
    return true
  }

  // TsTest_Baseliner.py:200-207.
  #validateCreationString(): boolean {
    this.#newCreationStr = this.#diffString(
      this.#baselineCreationStr, this.#creationStr, 'creation string')
    return !this.#newCreationStr
  }

  // TsTest_Baseliner.py:209-216.
  #validateParams(errorIfDifferent = false): boolean {
    this.#newParamStr = this.#diffString(
      this.#baselineSpline.debugDesc, this.#resultSpline.debugDesc, 'spline', errorIfDifferent)
    return !this.#newParamStr
  }

  // TsTest_Baseliner.py:218-256.
  #validateInputs(): boolean {
    if (!this.#validateParams(true)) {
      return false
    }

    if (this.#precision !== this.#baselinePrecision) {
      this.messages.push(`Error: ${this.#testName}: precision mismatch; ` +
        `baseline ${this.#baselinePrecision}, actual ${this.#precision}`)
      return false
    }

    const count = this.#resultSpline.samples.length
    const baselineCount = this.#baselineSpline.samples.length
    if (count !== baselineCount) {
      this.messages.push(`Error: ${this.#testName}: sample count mismatch; ` +
        `baseline ${baselineCount}, actual ${count}`)
      return false
    }

    for (let i = 0; i < baselineCount; i++) {
      const lineNum = this.#baselineSampleLineOffset + i
      const base = this.#baselineSpline.samples[i]!
      const sample = this.#resultSpline.samples[i]!
      if (!isClose(sample.time, base.time, this.#epsilon)) {
        this.messages.push(`Error: ${this.#testName}: time mismatch on line ${lineNum}; ` +
          `baseline ${base.time}, actual ${sample.time}, diff ${Math.abs(sample.time - base.time)}`)
        return false
      }
    }

    return true
  }

  // TsTest_Baseliner.py:258-275.
  #validateValues(): boolean {
    let mismatch = false
    for (let i = 0; i < this.#baselineSpline.samples.length; i++) {
      const lineNum = this.#baselineSampleLineOffset + i
      const base = this.#baselineSpline.samples[i]!
      const sample = this.#resultSpline.samples[i]!
      if (!isClose(sample.value, base.value, this.#epsilon)) {
        this.messages.push(`${this.#fileName}: value mismatch on line ${lineNum}; ` +
          `baseline ${base.value}, actual ${sample.value}, diff ${Math.abs(sample.value - base.value)}`)
        mismatch = true
      }
    }
    return !mismatch
  }

  // TsTest_Baseliner.py:277-280.
  #writeCandidates(): void {
    this.#writeBaseline()
    this.#writeSingleGraph(true)
  }

  // TsTest_Baseliner.py:282-289.
  #writeOptionals(): void {
    const baselineGraphPath = `baseline/${this.#singleGraphFileName}`
    if (!(this.#io.exists?.(baselineGraphPath) ?? false)) {
      this.#writeSingleGraph(false)
    }
  }

  // TsTest_Baseliner.py:291-312.
  #writeBaseline(): void {
    let out = ''
    const creationStr = this.#newCreationStr || this.#creationStr
    if (creationStr) {
      out += creationStr.trimEnd() + '\n'
    }
    out += '-----\n'
    out += this.#newParamStr || this.#resultSpline.debugDesc
    out += '-----\n'
    for (const s of this.#resultSpline.samples) {
      out += `${s.time.toFixed(this.#precision)} ${s.value.toFixed(this.#precision)}\n`
    }
    if (this.#io.writeFile) {
      this.#io.writeFile(this.#fileName, out)
      this.messages.push(`Wrote baseline candidate ${this.#fileName}`)
    }
  }

  // TsTest_Baseliner.py:314-376.
  #readBaseline(contents: string, path: string): boolean {
    let lineNum = 0
    let section = 1

    for (const line of splitLinesKeepEnds(contents)) {
      lineNum += 1

      if (line.trimEnd() === '-----') {
        section += 1
        if (section === 3) {
          this.#baselineSampleLineOffset = lineNum + 1
        }
        continue
      }

      if (section === 1) {
        this.#baselineCreationStr += line
        continue
      }

      if (section === 2) {
        this.#baselineSpline.debugDesc += line
        continue
      }

      const match = /^(-?\d+\.(\d+)) (-?\d+\.(\d+))\n?$/.exec(line)
      if (!match) {
        this.messages.push(`Error: ${path}: unexpected format on line ${lineNum}`)
        return false
      }
      const [, timeStr, timeFracStr, valStr, valFracStr] = match as unknown as [string, string, string, string, string]

      const timePrecision = timeFracStr.length
      const valPrecision = valFracStr.length
      if (!this.#baselinePrecision) {
        this.#baselinePrecision = valPrecision
      }
      if (valPrecision !== timePrecision || valPrecision !== this.#baselinePrecision) {
        this.messages.push(`Error: ${path}: inconsistent precision`)
        return false
      }

      this.#baselineSpline.samples.push(new TsTest_Sample(Number(timeStr), Number(valStr)))
    }

    if (section !== 3) {
      this.messages.push(`Error: ${path}: found ${section} sections, expected 3`)
      return false
    }

    if (Boolean(this.#baselineCreationStr) !== Boolean(this.#creationStr)) {
      this.messages.push(`Error: ${path}: creation string: baseline ` +
        `${this.#baselineCreationStr ? 'present' : 'absent'}, ` +
        `result ${this.#creationStr ? 'present' : 'absent'}`)
      return false
    }

    return true
  }

  // TsTest_Baseliner.py:378-474.
  #diffString(baseline: string, result: string, fieldName: string, errorIfDifferent = false):
    string | undefined {
    const diffData = (inStr: string): { atoms: string[], skeleton: string } => {
      const atoms = inStr.split(/(-?(?:\d+\.?\d*|\.\d+))/)
      const skeleton = atoms.map(a => /^[-\d.]+$/.test(a) ? 'X' : a).join('')
      return { atoms, skeleton }
    }

    const baselineData = diffData(baseline)
    const resultData = diffData(result)

    if (resultData.skeleton !== baselineData.skeleton) {
      this.#printDiff(`${fieldName} structure mismatch`, baseline, result, true)
      return result
    }

    const mismatchIndices: number[] = []
    for (let i = 0; i < baselineData.atoms.length; i++) {
      if (!isDecimal(baselineData.atoms[i]!)) {
        continue
      }
      if (!isClose(Number(resultData.atoms[i]), Number(baselineData.atoms[i]), this.#epsilon)) {
        mismatchIndices.push(i)
      }
    }

    if (mismatchIndices.length === 0) {
      return undefined
    }

    let rhsStr = ''
    let nextMatch = 0
    for (const index of mismatchIndices) {
      rhsStr += baselineData.atoms.slice(nextMatch, index).join('')
      rhsStr += resultData.atoms[index]!
      nextMatch = index + 1
    }
    rhsStr += baselineData.atoms.slice(nextMatch).join('')

    this.#printDiff(`${fieldName} mismatch`, baseline, rhsStr, errorIfDifferent)
    return rhsStr
  }

  // TsTest_Baseliner.py:476-492.
  #printDiff(desc: string, leftStr: string, rightStr: string, isError: boolean): void {
    this.messages.push(`${isError ? 'Error: ' : ''}${this.#testName}: ${desc}`)
    this.messages.push('')
    this.messages.push(...unifiedDiff(splitLinesKeepEnds(leftStr), splitLinesKeepEnds(rightStr),
      'Baseline', 'Actual').map(l => l.replace(/\n$/, '')))
    this.messages.push('')
  }

  // TsTest_Baseliner.py:494-516.
  #writeSingleGraph(isCandidate: boolean): void {
    if (!TsTest_Grapher.init()) {
      return
    }
    const grapher = new TsTest_Grapher(this.#testName)
    grapher.addSpline('Baseline', this.#resultSpline.spline!, this.#resultSpline.samples)
    this.#referenceSplines.forEach((spline, i) => {
      grapher.addSpline(spline.name, spline.spline!, spline.samples, undefined, i + 2)
    })
    grapher.write(this.#singleGraphFileName)
    this.messages.push(`Wrote ${isCandidate ? 'candidate' : 'baseline'} graph ${this.#singleGraphFileName}`)
  }

  // TsTest_Baseliner.py:518-536.
  #writeDiffGraph(): void {
    if (!TsTest_Grapher.init()) {
      return
    }
    const grapher = this.#compareSamples
      ? new TsTest_Comparator(this.#testName)
      : new TsTest_Grapher(this.#testName)
    grapher.addSpline('Actual', this.#resultSpline.spline!, this.#resultSpline.samples)
    for (const spline of this.#referenceSplines) {
      grapher.addSpline(spline.name, spline.spline!, spline.samples)
    }
    grapher.write(this.#diffGraphFileName)
    this.messages.push(`Wrote diff graph ${this.#diffGraphFileName}`)
  }
}
