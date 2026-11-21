// Upstream OpenUSD Python tests, unchanged, against typescript-usd through
// the pxr forwarding layer (python/pxr) under Pyodide: `pnpm test:python`.
//
// Each file runs once under unittest; every upstream test method is one it()
// here, so a method the forwarding layer or the core cannot yet support is a
// plain failing test (packages/usd/AGENTS.md, "Tests").
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadPxrPython, OPENUSD_SRC, type PxrPython, type UpstreamTestResult } from './runUpstream.ts'

const FILES = [
  'pxr/base/gf/testenv/testGfDuration.py',
  'pxr/base/gf/testenv/testGfTimeCode.py',
  'pxr/usd/sdf/testenv/testSdfLayerOffset.py',
  'pxr/usd/sdf/testenv/testSdfPath.py',
  'pxr/usd/sdf/testenv/testSdfAssetPath.py',
  'pxr/usd/usdGeom/testenv/testUsdGeomImageable.py',
  'pxr/usd/usdGeom/testenv/testUsdGeomPoints.py',
  'pxr/usd/usdGeom/testenv/testUsdGeomMotionAPI.py',
  'pxr/usd/usdGeom/testenv/testUsdGeomXformCommonAPI.py',
  'pxr/usd/usdGeom/testenv/testUsdGeomXformable.py',
  'pxr/usd/usd/testenv/testUsdStage.py',
  'pxr/usd/usd/testenv/testUsdTimeCodeRepr.py',
]

// The unittest ids (<module>.<TestCase>.<test_method>) a file defines.
function testIds(file: string): string[] {
  const module = path.basename(file, '.py')
  const ids: string[] = []
  let cls: string | undefined
  for (const line of fs.readFileSync(path.join(OPENUSD_SRC, file), 'utf8').split('\n')) {
    const c = /^class (\w+)\(/.exec(line)
    if (c) cls = c[1]
    const m = /^ {4}def (test\w*)\(/.exec(line)
    if (m && cls) ids.push(`${module}.${cls}.${m[1]}`)
  }
  return ids
}

let pxr: PxrPython
beforeAll(async () => { pxr = await loadPxrPython() })
afterAll(() => { console.log(`Pyodide load: ${pxr.loadMs.toFixed(0)} ms`) })

const results = new Map<string, Promise<UpstreamTestResult>>()
function resultOf(file: string): Promise<UpstreamTestResult> {
  let r = results.get(file)
  if (!r) {
    const t0 = performance.now()
    r = pxr.run(file).then(res => {
      console.log(`${file}: ${res.passed.length}/${res.testsRun} passed in ${(performance.now() - t0).toFixed(0)} ms`)
      return res
    })
    results.set(file, r)
  }
  return r
}

for (const file of FILES) {
  describe(file, () => {
    for (const id of testIds(file)) {
      it(id.split('.').slice(1).join('.'), async () => {
        const r = await resultOf(file)
        const bad = [...r.failures, ...r.errors].find(f => f.test === id)
        expect(bad?.traceback ?? '', r.output).toBe('')
        expect(r.passed, r.output).toContain(id)
      })
    }
  })
}
