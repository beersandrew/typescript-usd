// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourcePrim.cpp,
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2020, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Contents of the prims of a bare UsdImagingStageSceneIndex for scenes that
// exercise UsdImagingDataSourcePrim (dataSourcePrim.cpp), its primvars,
// usdPrimInfo, model, extentsHint and geomXformVectors data sources, and the
// GeomModelAPI, CoordSysAPI and CollectionAPI adapters. The scenes use only
// typeless, Xform and Scope prims, which have no prim adapter.
//
// Expected text: fixtures/primDataSources/*.txt, captured from the OpenUSD
// 26.11.1 reference build with
// pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// (FIXTURES.md).
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DebugPrintDataSource as HdDebugPrintDataSource, type SceneIndexObserver as HdSceneIndexObserver } from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import {
  UsdImagingAdapterRegistry,
  UsdImagingCollectionAPIAdapter,
  UsdImagingCoordSysAPIAdapter,
  UsdImagingGeomModelAPIAdapter,
  UsdImagingStageSceneIndex,
} from 'typescript-usd/usdImaging'

// The plugInfo.json entries of the adapters these scenes need
// (pxr/usdImaging/usdImaging/plugInfo.json).
UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingCollectionAPIAdapter', isInternal: true, apiSchemaName: 'CollectionAPI',
    apiSchemaAdapterFactory: () => new UsdImagingCollectionAPIAdapter() },
  { typeName: 'UsdImagingCoordSysAPIAdapter', isInternal: true, apiSchemaName: 'CoordSysAPI',
    apiSchemaAdapterFactory: () => new UsdImagingCoordSysAPIAdapter() },
  { typeName: 'UsdImagingGeomModelAPIAdapter', isInternal: true, apiSchemaName: 'GeomModelAPI',
    apiSchemaAdapterFactory: () => new UsdImagingGeomModelAPIAdapter() },
])

const fixtures = new URL('./fixtures/primDataSources/', import.meta.url)

/** testUsdImagingStageSceneIndexContents.cpp:16-49 */
class PrimListener implements HdSceneIndexObserver {
  private readonly _prims = new Set<string>()
  primsAdded(_sender: unknown, entries: { primPath: string }[]): void {
    for (const entry of entries) this._prims.add(entry.primPath)
  }
  primsRemoved(_sender: unknown, entries: { primPath: string }[]): void {
    for (const entry of entries) this._prims.delete(entry.primPath)
  }
  primsDirtied(): void {}
  primsRenamed(): void {}
  /** SdfPathSet order (SdfPath operator<). */
  getPrimPaths(): string[] {
    return [...this._prims].sort((a, b) => SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b)))
  }
}

/** testUsdImagingStageSceneIndexContents.cpp:51-118 _CleanOutputForDiff. */
function _CleanOutputForDiff(input: string): string {
  const isAddressChar = (ch: string) => /[0-9a-fA-Fx]/.test(ch)
  let out = ''
  let numPtrDigits = 0
  let mode: 'DEFAULT' | 'FOUND_0' | 'FOUND_AT' | 'PTR' = 'DEFAULT'
  for (const ch of input) {
    switch (mode) {
      case 'DEFAULT':
        if (ch === '0') mode = 'FOUND_0'
        else if (ch === '@') mode = 'FOUND_AT'
        out += ch
        break
      case 'FOUND_0':
        mode = ch === 'x' ? 'PTR' : 'DEFAULT'
        out += ch
        break
      case 'FOUND_AT':
        mode = ch === ' ' ? 'PTR' : 'DEFAULT'
        out += ch
        break
      case 'PTR':
        if (isAddressChar(ch)) {
          out += 'X'
          numPtrDigits++
        } else {
          out += 'X'.repeat(Math.max(0, 16 - numPtrDigits)) + ch
          numPtrDigits = 0
          mode = 'DEFAULT'
        }
        break
    }
  }
  return out
}

/** testUsdImagingStageSceneIndexContents.cpp:120-160 */
async function run(usdaPath: string): Promise<string> {
  const stage = await UsdStage.open(usdaPath)
  if (!stage) throw new Error(`cannot open ${usdaPath}`)
  const inputSceneIndex = UsdImagingStageSceneIndex.new()
  const primListener = new PrimListener()
  inputSceneIndex.addObserver(primListener)
  inputSceneIndex.SetStage(stage)
  inputSceneIndex.SetTime(UsdTimeCode.EarliestTime())
  let ss = ''
  for (const primPath of primListener.getPrimPaths()) {
    const prim = inputSceneIndex.getPrim(primPath)
    ss += `<${primPath}> type = ${prim.primType}\n`
    ss += HdDebugPrintDataSource(prim.dataSource, 1)
  }
  return _CleanOutputForDiff(ss)
}

/** One prim of the printed contents: its header line and its data source
 *  tree, as '/'-joined locators mapped to the printed leaf value. */
interface PrintedPrim { header: string, leaves: Map<string, string> }

/** Parses the HdDebugPrintDataSource text (one tab per level, container
 *  names in brackets, leaf values unbracketed). */
function parse(text: string): Map<string, PrintedPrim> {
  const prims = new Map<string, PrintedPrim>()
  let current: PrintedPrim | undefined
  const stack: string[] = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    const header = /^<([^>]*)> type = (.*)$/.exec(line)
    if (header) {
      current = { header: line, leaves: new Map() }
      prims.set(header[1]!, current)
      stack.length = 0
      continue
    }
    const depth = /^\t*/.exec(line)![0].length
    const body = line.slice(depth)
    stack.length = depth - 1
    const name = /^\[(.*)\]$/.exec(body)
    if (name) {
      stack.push(name[1]!)
      current!.leaves.set(stack.join('/'), '<container>')
    } else {
      current!.leaves.set(stack.join('/'), body)
    }
  }
  return prims
}

// Prims compared by their own GAP tests below: [fixture, prim path, why].
const _gapPrims: [string, string, string][] = []

// Known reasons the printed text of non-root prims differs.
const _exactTextGaps: Record<string, string> = {
  coordSysCollections: 'SdfPathExpression text of rule-based collections',
}

// Leaves compared by their own GAP tests below.
const _gapLocators = [/^collections\/[^/]*\/membershipExpression$/]

/** Printed leaf values are equal, numbers within 1e-12 (relative, or
 *  absolute near zero); the exact text is compared by the tests below. */
function _SameValue(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false
  if (actual === expected) return true
  const num = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g
  if (actual.replace(num, '#') !== expected.replace(num, '#')) return false
  const a = actual.match(num)!.map(Number), e = expected.match(num)!.map(Number)
  return a.length === e.length && a.every((x, i) =>
    Math.abs(x - e[i]!) <= 1e-12 * Math.max(1, Math.abs(x), Math.abs(e[i]!)))
}

const files = readdirSync(fixtures).filter(f => f.endsWith('.usda')).sort()

describe('UsdImagingDataSourcePrim contents (reference: testUsdImagingStageSceneIndexContents)', () => {
  for (const file of files) {
    const name = file.replace(/\.usda$/, '')
    const expectedText = () => readFileSync(new URL(`${name}.txt`, fixtures), 'utf8')

    it(`${name}: same prims, prim types and data source names as the reference build`, async () => {
      const actual = parse(await run(new URL(file, fixtures).pathname))
      const expected = parse(expectedText())
      expect([...actual.keys()]).toEqual([...expected.keys()])
      for (const [path, prim] of expected) {
        // The absolute root prim is UsdImagingDataSourceStage's.
        if (path === '/') continue
        expect(actual.get(path)?.header, path).toBe(prim.header)
        expect([...actual.get(path)!.leaves.keys()], path).toEqual([...prim.leaves.keys()])
      }
    })

    it(`${name}: same printed values as the reference build`, async () => {
      const actual = parse(await run(new URL(file, fixtures).pathname))
      const expected = parse(expectedText())
      for (const [path, prim] of expected) {
        if (path === '/') continue
        const actualLeaves = actual.get(path)?.leaves ?? new Map<string, string>()
        for (const [locator, value] of prim.leaves) {
          if (_gapLocators.some(re => re.test(locator))) continue
          if (_gapPrims.some(([f, p]) => f === name && p === path)) continue
          expect.soft(_SameValue(actualLeaves.get(locator), value), `${path} ${locator}: ${actualLeaves.get(locator)} vs ${value}`).toBe(true)
        }
      }
    })

    for (const [, path, why] of _gapPrims.filter(([f]) => f === name)) {
      it(`${name}: GAP ${path} values: ${why}`, async () => {
        const actual = parse(await run(new URL(file, fixtures).pathname)).get(path)!.leaves
        for (const [locator, value] of parse(expectedText()).get(path)!.leaves) {
          if (_gapLocators.some(re => re.test(locator))) continue
          expect.soft(_SameValue(actual.get(locator), value), `${locator}: ${actual.get(locator)} vs ${value}`).toBe(true)
        }
      })
    }

    if (readFileSync(new URL(`${name}.txt`, fixtures), 'utf8').includes('[membershipExpression]'))
    it(`${name}: GAP collection membershipExpression text (SdfPathExpression composeOver/MakeOp text)`, async () => {
      const actual = parse(await run(new URL(file, fixtures).pathname))
      for (const [path, prim] of parse(expectedText())) {
        for (const [locator, value] of prim.leaves) {
          if (/^collections\/[^/]*\/membershipExpression$/.test(locator)) {
            expect(actual.get(path)?.leaves.get(locator), `${path} ${locator}`).toBe(value)
          }
        }
      }
    })

    it(`${name}: ${_exactTextGaps[name] ? `GAP (${_exactTextGaps[name]}) ` : ''}prims other than the root print exactly as the reference build`, async () => {
      const strip = (t: string) => t.slice(t.indexOf('\n<', 1) + 1)
      expect(strip(await run(new URL(file, fixtures).pathname))).toBe(strip(expectedText()))
    })

    it(`${name}: ${_exactTextGaps[name] ? `GAP (${_exactTextGaps[name]}) ` : ''}prints exactly as the reference build`, async () => {
      expect(await run(new URL(file, fixtures).pathname)).toBe(expectedText())
    })
  }
})
