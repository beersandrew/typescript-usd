// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:425-432
// with DIFF_COMPARE: every prim a UsdImagingStageSceneIndex adds for the stage,
// in SdfPath order, printed with HdDebugPrintDataSource, pointers masked.
// Expected text: fixtures/stageSceneIndexContents/*.txt, captured from the
// reference build (FIXTURES.md).
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DebugPrintDataSource as HdDebugPrintDataSource, type SceneIndexObserver as HdSceneIndexObserver } from 'typescript-usd/hd'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/stageSceneIndexContents/', import.meta.url)

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
    const elements = (p: string) => p === '/' ? [] : p.slice(1).split(/(?=[/.])/)
    return [...this._prims].sort((a, b) => {
      const ea = elements(a), eb = elements(b)
      for (let i = 0; i < Math.min(ea.length, eb.length); i++) {
        if (ea[i] !== eb[i]) return ea[i]! < eb[i]! ? -1 : 1
      }
      return ea.length - eb.length
    })
  }
}

/** testUsdImagingStageSceneIndexContents.cpp:51-118 _CleanOutputForDiff:
 *  masks 0x... and "@ <hex>" pointers to 16 X's. */
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
  // XXX: time from args?
  inputSceneIndex.SetTime(UsdTimeCode.EarliestTime())
  let ss = ''
  for (const primPath of primListener.getPrimPaths()) {
    const prim = inputSceneIndex.getPrim(primPath)
    ss += `<${primPath}> type = ${prim.primType}\n`
    ss += HdDebugPrintDataSource(prim.dataSource, 1)
  }
  return _CleanOutputForDiff(ss)
}

describe('testUsdImagingStageSceneIndexContents', () => {
  for (const file of readdirSync(fixtures).filter(f => f.endsWith('.usda')).sort()) {
    const name = file.replace(/\.usda$/, '')
    it(`${name}.usda prints as the reference build does`, async () => {
      const actual = await run(new URL(file, fixtures).pathname)
      const expected = readFileSync(new URL(`${name}.txt`, fixtures), 'utf8')
      expect(actual).toBe(expected)
    })
  }
})
