// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingInstanceProxyTraversal.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingInstanceProxyTraversal.cpp
// (OpenUSD 26.11.1) and its two registrations
// (pxr/usdImaging/usdImaging/CMakeLists.txt:434-455, DIFF_COMPARE with
// USD_ASSIGN_PROTOTYPES_DETERMINISTICALLY=1):
// testUsdImagingInstanceProxyTraversal_1 (1_simple.usda) and
// testUsdImagingInstanceProxyTraversal_2 (2_ni-2-levels.usda).
// Inputs and expected text: fixtures/instanceProxyTraversal/ (copied from
// testenv/testUsdImagingInstanceProxyTraversal and its baseline/ directory).
// Each registration's three output files are compared with the baselines.
//
// The prim adapters the scenes need are registered by plugInfo.ts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { InstanceProxyViewSceneIndex as HdInstanceProxyViewSceneIndex, SceneIndexPrimView as HdSceneIndexPrimView } from 'typescript-usd/hd'
import {
  PrimDefaultPredicate as UsdPrimDefaultPredicate, PrimRange as UsdPrimRange, Stage as UsdStage,
  TraverseInstanceProxies as UsdTraverseInstanceProxies,
} from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/instanceProxyTraversal/', import.meta.url)

/** testUsdImagingInstanceProxyTraversal.cpp:22-31 */
function _GetPrimTypeToLog(primType: string): string {
  return primType ? primType : '<empty>'
}

const _Expected = (name: string) => readFileSync(new URL(name, fixtures), 'utf8')

describe('testUsdImagingInstanceProxyTraversal', () => {
  for (const [registration, name] of [
    ['testUsdImagingInstanceProxyTraversal_1', '1_simple'],
    ['testUsdImagingInstanceProxyTraversal_2', '2_ni-2-levels'],
  ] as const) {
    const usda = new URL(`${name}.usda`, fixtures).pathname

    it(registration, async () => {
      const stage = (await UsdStage.open(usda))!

      // testUsdImagingInstanceProxyTraversal.cpp:53-68: USD traversal
      {
        let output = ''
        for (const prim of UsdPrimRange.stage(stage, UsdTraverseInstanceProxies(UsdPrimDefaultPredicate))) {
          output += `${prim.path} type=${_GetPrimTypeToLog(prim.typeName)}` +
            (prim.isInstanceProxy() ? ' (instance proxy)' : '') + '\n'
        }
        expect(output).toBe(_Expected(`${name}_usdTraversal.txt`))
      }

      // testUsdImagingInstanceProxyTraversal.cpp:70-73
      const sceneIndices = UsdImagingCreateSceneIndices({ stage })

      // testUsdImagingInstanceProxyTraversal.cpp:75-91: scene index
      // traversal w/o instance proxy view
      {
        let output = ''
        for (const primPath of new HdSceneIndexPrimView(sceneIndices.finalSceneIndex, '/')) {
          const prim = sceneIndices.finalSceneIndex.getPrim(primPath)
          output += primPath +
            // Needed for Windows only bug where paths above 128 characters
            // get linesplit in fc.exe
            (primPath.length > 100 ? '\n\t' : ' ') +
            'type=' + _GetPrimTypeToLog(prim.primType) + '\n'
        }
        expect(output).toBe(_Expected(`${name}_sceneIndexTraversal.txt`))
      }

      // testUsdImagingInstanceProxyTraversal.cpp:93-94
      const proxyViewSi = HdInstanceProxyViewSceneIndex.new(sceneIndices.finalSceneIndex)

      // testUsdImagingInstanceProxyTraversal.cpp:96-117: scene index
      // traversal of instance proxy view
      {
        let output = ''
        for (const primPath of new HdSceneIndexPrimView(proxyViewSi, '/')) {
          const prim = proxyViewSi.getPrim(primPath)
          output += primPath +
            (primPath.length > 100 ? '\n\t' : ' ') +
            'type=' + _GetPrimTypeToLog(prim.primType) +
            (proxyViewSi.isInstanceProxy(primPath) ? ' (instance proxy)' : '') + '\n'
        }
        expect(output).toBe(_Expected(`${name}_sceneIndexInstanceProxyTraversal.txt`))
      }
    })
  }
})
