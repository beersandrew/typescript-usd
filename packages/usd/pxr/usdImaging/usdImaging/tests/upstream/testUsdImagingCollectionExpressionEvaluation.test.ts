// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingCollectionExpressionEvaluation.cpp,
//  pxr/usd/usd/collectionMembershipQuery.cpp
// Copyright 2019, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingCollectionExpressionEvaluation.cpp
// (OpenUSD 26.11.1) and its two registrations
// (pxr/usdImaging/usdImaging/CMakeLists.txt:456-473, DIFF_COMPARE of
// <prefix>_collectionExpressionEvaluation.txt, with
// USD_ASSIGN_PROTOTYPES_DETERMINISTICALLY=1):
// testUsdImagingCollectionExpressionEvaluation_1 (1_simple.usda) and
// testUsdImagingCollectionExpressionEvaluation_2 (2_ni-2-levels.usda).
// Inputs and expected text: fixtures/collectionExpressionEvaluation/, copied
// from testenv/testUsdImagingCollectionExpressionEvaluation and its baseline/.
//
// The output file is built as a string and compared with the baseline.
// The USD matches use UsdComputeIncludedPathsFromCollectionExpression, the
// expression branch of UsdComputeIncludedPathsFromCollection
// (collectionMembershipQuery.cpp:187-262) the test reaches through a query
// holding the expression evaluator.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CollectionExpressionEvaluator as HdCollectionExpressionEvaluator,
  InstanceProxyViewSceneIndex as HdInstanceProxyViewSceneIndex,
  InstancingAwareCollectionExpressionEvaluator as HdInstancingAwareCollectionExpressionEvaluator,
  type InstancingAwareMatchResult,
} from 'typescript-usd/hd'
import { PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  ComputeIncludedPathsFromCollectionExpression as UsdComputeIncludedPathsFromCollectionExpression,
  ObjectCollectionExpressionEvaluator as UsdObjectCollectionExpressionEvaluator,
  Stage as UsdStage,
  TraverseInstanceProxies as UsdTraverseInstanceProxies,
} from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices, UsdImagingGetCollectionPredicateLibrary } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/collectionExpressionEvaluation/', import.meta.url)

/** testUsdImagingCollectionExpressionEvaluation.cpp:33-48 */
function _PrintPaths(label: string, paths: Iterable<SdfPath>, printCount = false): string {
  const list = [...paths]
  let output = label + (printCount ? ` (count = ${list.length})` : '') + ':\n'
  for (const primPath of list) {
    output += '\t' + primPath.pathString + '\n'
  }
  return output + '\n'
}

/** SdfPathSet of `paths` (SdfPath order, unique). */
function _PathSet(paths: Iterable<SdfPath>): SdfPath[] {
  const byText = new Map<string, SdfPath>()
  for (const p of paths) byText.set(p.pathString, p)
  return [...byText.values()].sort(SdfPath.compare)
}

/** testUsdImagingCollectionExpressionEvaluation.cpp:50-76 */
function _ComputeAllHydraMatches(result: InstancingAwareMatchResult): SdfPath[] {
  // Remove any internal paths (e.g. /UsdNiPropagatedPrototypes) from
  // the non-instance matches so we can compare results from Hydra evaluation
  // with USD.
  const prefix = SdfPath.fromString('/UsdNiPropagatedPrototypes')
  const allMatches = [...result.nonInstanceMatches].filter(path => !path.hasPrefix(prefix))

  // Add fully matched instance prim paths and instance proxy matches.
  // (Skip partially matched instance prim paths since they don't
  // fully match; they're in service of de-instancing.)
  allMatches.push(...result.fullyMatchedInstances)
  allMatches.push(...result.matchedInstanceProxyPaths)
  return _PathSet(allMatches)
}

/** testUsdImagingCollectionExpressionEvaluation.cpp:78-112. `stderr`
 *  collects what upstream writes to std::cerr. */
function _ComputeAllUsdMatches(stage: UsdStage, expr: SdfPathExpression, stderr: string[]): SdfPath[] {
  // Since the expressions aren't authored using UsdCollectionAPI, use the
  // lower-level API to do so.
  const mark = new TfErrorMark()
  const exprEval = new UsdObjectCollectionExpressionEvaluator(stage, expr)
  const hasUnsupportedPredicates = exprEval.IsEmpty()
  mark.clear()

  if (hasUnsupportedPredicates) {
    stderr.push(`Expression "${expr.getText()}" has unsupported predicates for USD evaluation.\n`)
    return []
  }

  // UsdCollectionMembershipQuery(PathExpansionRuleMap{}, SdfPathSet{},
  // UsdTokens->expandPrims) with the expression evaluator set.
  // Note: The traversal predicate dictates what is actually matched...
  return UsdComputeIncludedPathsFromCollectionExpression(
    exprEval, stage, UsdTraverseInstanceProxies(), 'expandPrims')
}

/** testUsdImagingCollectionExpressionEvaluation.cpp:116-202 main(), returning
 *  the written <prefix>_collectionExpressionEvaluation.txt. */
async function main(usdFile: string, exprArgs: string[]): Promise<string> {
  const stage = (await UsdStage.open(usdFile))!
  expect(stage, `Failed to open stage at path <${usdFile}>.`).toBeTruthy()

  const sceneIndices = UsdImagingCreateSceneIndices({ stage })

  const proxyViewSi = HdInstanceProxyViewSceneIndex.new(sceneIndices.finalSceneIndex)

  // Collection expression evaluation w/ instance proxy view.
  let output = ''
  const stderr: string[] = []
  const exprs = exprArgs.map(a => new SdfPathExpression(a))

  let idx = 1
  for (const expr of exprs) {
    const eval_ = new HdInstancingAwareCollectionExpressionEvaluator(
      proxyViewSi, expr, UsdImagingGetCollectionPredicateLibrary())

    output += `${idx++}. Evaluating expression "${expr.getText()}"\n\n`

    const result = eval_.getAllMatches(
      SdfPath.absoluteRootPath,
      HdCollectionExpressionEvaluator.MatchAll,
      /*includeInstanceProxyMatches=*/true)

    output += _PrintPaths('(Hydra) Matched non-instance prim paths', result.nonInstanceMatches)
    output += _PrintPaths('(Hydra) Fully matched instance prim paths', result.fullyMatchedInstances)
    output += _PrintPaths('(Hydra) Partially matched instance prim paths', result.partiallyMatchedInstances)
    output += _PrintPaths('(Hydra) Matched instance proxy prim paths', result.matchedInstanceProxyPaths)

    output += _PrintPaths('All (non-internal) matched prim paths w/ Hydra',
      _ComputeAllHydraMatches(result), /*printCount=*/true)

    output += _PrintPaths('All matched prim paths w/ USD',
      _ComputeAllUsdMatches(stage, expr, stderr), /*printCount=*/true)

    output += '-----------------------------------------------------\n'
  }
  return output
}

describe('testUsdImagingCollectionExpressionEvaluation', () => {
  // pxr/usdImaging/usdImaging/CMakeLists.txt:456-473
  for (const [registration, file, exprs] of [
    ['testUsdImagingCollectionExpressionEvaluation_1', '1_simple.usda',
      ['//', '//Trunk', '/World/InstanceA', '/World/InstanceB//', '//{isa:Sphere}']],
    ['testUsdImagingCollectionExpressionEvaluation_2', '2_ni-2-levels.usda',
      ['//', '/World/Chars/Group_1/Humanoids', '/World/Chars/Group_2/Humanoids//',
        '/World/Chars/Group_2/Humanoids/I1', '/World/Chars//Cylinder*', '//Group_1//{isa:Cone}']],
  ] as const) {
    it(registration, async () => {
      const output = await main(new URL(file, fixtures).pathname, [...exprs])
      const prefix = file.replace('.usda', '')
      expect(output).toBe(readFileSync(new URL(`${prefix}_collectionExpressionEvaluation.txt`, fixtures), 'utf8'))
    })
  }
})
