// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/utils.cpp,
//  pxr/imaging/hdsi/utils.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/utils.{h,cpp}: the
// HdsiUtilsCompileCollection overloads (utils.cpp:124-157) and the pruning
// helpers (utils.cpp:90-122, 159-213). The bound-material helpers of
// utils.cpp:215-264 are not ported yet.

import {
  CollectionExpressionEvaluator as HdCollectionExpressionEvaluator,
  GetCollectionPredicateLibrary as HdGetCollectionPredicateLibrary,
} from 'typescript-usd/hd'
import type {
  CollectionsSchema as HdCollectionsSchema,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { SdfPathExpression, SdfPredicateFunctionResult } from 'typescript-usd/sdf/pathExpression'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { PredicateLibrary as SdfPredicateLibrary } from 'typescript-usd/sdf'

/** The expression and evaluator HdsiUtilsCompileCollection writes through
 *  its `expr` and `eval` out parameters (utils.h:24-45). An unset `eval` is
 *  the empty std::optional. */
export interface HdsiUtilsCompiledCollection {
  expr: SdfPathExpression
  eval: HdCollectionExpressionEvaluator | undefined
}

/**
 * utils.cpp:124-157. Evaluates the membership expression of the collection
 * `collectionName` of `collections`; if it is not empty, sets `out.eval` to
 * an evaluator for it over `sceneIndex`, with `predicateLibrary` (default
 * HdGetCollectionPredicateLibrary()).
 */
export function HdsiUtilsCompileCollection(
  collections: HdCollectionsSchema,
  collectionName: string,
  sceneIndex: HdSceneIndexBase,
  out: HdsiUtilsCompiledCollection,
  predicateLibrary: SdfPredicateLibrary<HdSceneIndexPrim> = HdGetCollectionPredicateLibrary(),
): void {
  const collection = collections.getCollection(collectionName)
  if (collection.isDefined()) {
    const pathExprDs = collection.getMembershipExpression()
    if (pathExprDs) {
      out.expr = pathExprDs.getTypedValue(0.0)
      if (!out.expr.isEmpty()) {
        out.eval = new HdCollectionExpressionEvaluator(
          sceneIndex, out.expr, predicateLibrary)
      }
    }
  }
}

/** utils.cpp:90-120: implements the ancestral pruning semantics (an
 *  ancestral match counts). */
function _GetPruneMatchResult(
  primPath: string,
  evaluator: HdCollectionExpressionEvaluator,
): SdfPredicateFunctionResult {
  // For pruning collections, an ancestral match counts.
  const prefixes = SdfPath.fromString(primPath).getPrefixes()
  for (const path of prefixes) {
    const result = evaluator.match(path)

    // Short circuit when possible:
    // 1. Path matches.
    if (result.GetValue()) {
      return result
    }

    // 2. Path doesn't match, nor does any of its descendants.
    //    Note that expressions with predicates currently always return
    //    varying over descendants.
    //    (because e.g. /A being a guide doesn't imply /A/B is a guide)
    if (result.isConstant()) {
      return result
    }
  }

  return SdfPredicateFunctionResult.makeVarying(false)
}

/** utils.cpp:159-169: returns whether the prim at `primPath` is pruned by
 *  the supplied evaluator. */
export function HdsiUtilsIsPruned(
  primPath: string,
  evaluator: HdCollectionExpressionEvaluator,
): boolean {
  if (evaluator.IsEmpty() || primPath === '') {
    return false
  }

  return _GetPruneMatchResult(primPath, evaluator).GetValue()
}

/** utils.cpp:171-213: prunes the given list of children (in place) using the
 *  supplied evaluator. */
export function HdsiUtilsRemovePrunedChildren(
  parentPath: string,
  evaluator: HdCollectionExpressionEvaluator,
  children: string[],
): void {
  if (evaluator.IsEmpty()) {
    return
  }
  if (children.length === 0) {
    return
  }

  const result = _GetPruneMatchResult(parentPath, evaluator)
  if (result.GetValue()) {
    // If the parent is pruned, all its children are also pruned.
    children.length = 0
    return
  }

  // Parent isn't pruned. We have two possibilities:
  // 1. Result is constant over descendants, meaning that none of the children
  //    are pruned.
  // 2. Result varies over descendants. We need to evaluate the expression at
  //    each child.

  // #1.
  if (result.isConstant()) {
    return
  }

  // #2.
  // We only care about the result at the child path and do not need to
  // evaluate its descendants.
  const survivors = children.filter(
    childPath => !evaluator.match(SdfPath.fromString(childPath)).GetValue())
  children.length = 0
  children.push(...survivors)
}
