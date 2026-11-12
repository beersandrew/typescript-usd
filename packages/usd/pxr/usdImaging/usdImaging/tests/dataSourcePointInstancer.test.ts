// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourcePointInstancer.cpp,
//  pxr/usdImaging/usdImaging/pointInstancerAdapter.cpp,
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2016, 2020, 2024 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdImagingDataSourcePointInstancerPrim / UsdImagingPointInstancerAdapter
// (pxr/usdImaging/usdImaging/dataSourcePointInstancer.cpp,
// pointInstancerAdapter.cpp:49-95, OpenUSD 26.11.1). No upstream test covers
// these scene-index data sources directly; the expected text is the
// reference build's testUsdImagingStageSceneIndexContents output for
// fixtures/pointInstancer/pointInstancer.usda (FIXTURES.md). The test
// compares the [instancerTopology] and [primvars] blocks of each point
// instancer prim (the rest of the prim is UsdImagingDataSourcePrim's).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DataSourceLocator as HdDataSourceLocator,
  DebugPrintDataSource as HdDebugPrintDataSource,
  InstancerTopologySchema as HdInstancerTopologySchema,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { UsdImagingDataSourceStageGlobals, UsdImagingPointInstancerAdapter } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/pointInstancer/', import.meta.url)

class _StageGlobals extends UsdImagingDataSourceStageGlobals {
  readonly timeVarying: string[] = []
  // testUsdImagingStageSceneIndexContents.cpp: SetTime(EarliestTime()).
  getTime(): UsdTimeCode { return UsdTimeCode.EarliestTime() }
  flagAsTimeVarying(hydraPath: string, locator: HdDataSourceLocator): void {
    this.timeVarying.push(`${hydraPath} ${locator.GetString()}`)
  }
  flagAsAssetPathDependent(_usdPath: string): void {}
}

/** The `\t[name]` blocks of `primPath` in the captured contents. */
function _ExpectedBlocks(primPath: string, names: string[]): string {
  const lines = readFileSync(new URL('pointInstancer.txt', fixtures), 'utf8').split('\n')
  const start = lines.indexOf(lines.find(l => l.startsWith(`<${primPath}> type =`))!)
  let out = ''
  let keep = false
  for (let i = start + 1; i < lines.length && !lines[i]!.startsWith('<'); ++i) {
    const line = lines[i]!
    const m = /^\t\[(.*)\]$/.exec(line)
    if (m) keep = names.includes(m[1]!)
    if (keep) out += line + '\n'
  }
  return out
}

async function _PrintBlocks(primPath: string, names: string[]): Promise<string> {
  const stage = (await UsdStage.open(new URL('pointInstancer.usda', fixtures).pathname))!
  const prim = stage.getPrim(primPath)!
  const adapter = new UsdImagingPointInstancerAdapter()
  const ds = adapter.getImagingSubprimData(prim, '', new _StageGlobals())!
  const values: HdDataSourceBase[] = names.map(n => ds.Get(n)!)
  return HdDebugPrintDataSource(HdRetainedContainerDataSource.new(names, values), 1)
}

describe('UsdImagingPointInstancerAdapter', () => {
  it('publishes one instancer subprim', async () => {
    const stage = (await UsdStage.open(new URL('pointInstancer.usda', fixtures).pathname))!
    const prim = stage.getPrim('/World/PI')!
    const adapter = new UsdImagingPointInstancerAdapter()
    expect(adapter.getImagingSubprims(prim)).toEqual([''])
    expect(adapter.getImagingSubprimType(prim, '')).toBe(HdPrimTypeTokens.instancer)
    expect(adapter.getImagingSubprimType(prim, 'x')).toBe('')
  })

  it('invalidates instancerTopology and primvars locators as upstream', () => {
    // dataSourcePointInstancer.cpp:434-485
    const adapter = new UsdImagingPointInstancerAdapter()
    return UsdStage.open(new URL('pointInstancer.usda', fixtures).pathname).then(stage => {
      const prim = stage!.getPrim('/World/PI')!
      const set = adapter.invalidateImagingSubprim(
        prim, '', ['protoIndices', 'invisibleIds', 'orientationsf'], 0)
      expect(set.intersects(HdInstancerTopologySchema.getDefaultLocator().append('instanceIndices'))).toBe(true)
      expect(set.intersects(HdInstancerTopologySchema.getDefaultLocator().append('mask'))).toBe(true)
      expect(set.intersects(HdPrimvarsSchema.getDefaultLocator().append('hydra:instanceRotations'))).toBe(true)
      expect(set.intersects(HdInstancerTopologySchema.getDefaultLocator().append('prototypes'))).toBe(false)
    })
  })

  for (const primPath of ['/World/PI', '/World/PIInactive']) {
    it(`${primPath} instancerTopology prints as the reference build does`, async () => {
      const names = ['instancerTopology']
      expect(await _PrintBlocks(primPath, names)).toBe(_ExpectedBlocks(primPath, names))
    })
    it(`${primPath} primvars print as the reference build does`, async () => {
      const names = ['primvars']
      expect(await _PrintBlocks(primPath, names)).toBe(_ExpectedBlocks(primPath, names))
    })
  }
})
