// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/collectionExpressionEvaluator.cpp,
//  pxr/imaging/hd/collectionExpressionEvaluator.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/collectionExpressionEvaluator.{h,cpp}.
//
// HdCollectionExpressionEvaluator evaluates an SdfPathExpression against prims
// from an HdSceneIndex, consulting an HdCollectionPredicateLibrary for the
// embedded `{...}` predicates.

import { SdfPath } from 'typescript-usd/sdf/path'
import {
  SdfPathExpression,
  SdfPredicateFunctionResult,
} from 'typescript-usd/sdf/pathExpression'
import {
  MakePathExpressionEval as SdfMakePathExpressionEval,
  type PathExpressionEval as SdfPathExpressionEval,
  type PredicateLibrary as SdfPredicateLibrary,
} from 'typescript-usd/sdf'
import { HdGetCollectionPredicateLibrary } from './collectionPredicateLibrary.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import type { HdSceneIndexBase } from './sceneIndex.ts'
import { HdSceneIndexPrimView } from './sceneIndex.ts'

export enum HdCollectionMatchKind {
  MatchAll,
  ShallowestMatches,
  ShallowestMatchesAndAllDescendants,
}

/** collectionExpressionEvaluator.h:22-110 */
export class HdCollectionExpressionEvaluator {
  private _sceneIndex: HdSceneIndexBase | undefined
  private _eval: SdfPathExpressionEval<HdSceneIndexPrim> | undefined

  // MatchKind enum surfaced on the class (mirrors the upstream nested enum).
  static readonly MatchAll = HdCollectionMatchKind.MatchAll
  static readonly ShallowestMatches = HdCollectionMatchKind.ShallowestMatches
  static readonly ShallowestMatchesAndAllDescendants =
    HdCollectionMatchKind.ShallowestMatchesAndAllDescendants

  /** collectionExpressionEvaluator.cpp:39-54: with no library, the
   *  foundational HdGetCollectionPredicateLibrary(). The default-constructed
   *  evaluator (no arguments) is empty. */
  constructor(
    sceneIndex?: HdSceneIndexBase,
    expr?: SdfPathExpression,
    predicateLib?: SdfPredicateLibrary<HdSceneIndexPrim>,
  ) {
    this._sceneIndex = sceneIndex
    if (expr !== undefined) {
      this._eval = SdfMakePathExpressionEval(expr, predicateLib ?? HdGetCollectionPredicateLibrary())
    }
  }

  /** collectionExpressionEvaluator.h:45-47: true if the evaluator has an
   *  invalid scene index or an empty (or unlinkable) path expression. */
  IsEmpty(): boolean {
    return this._sceneIndex === undefined || this._eval === undefined || this._eval.IsEmpty()
  }

  getSceneIndex(): HdSceneIndexBase | undefined {
    return this._sceneIndex
  }

  /** collectionExpressionEvaluator.cpp:56-85 */
  match(path: SdfPath): SdfPredicateFunctionResult {
    if (this.IsEmpty()) {
      return SdfPredicateFunctionResult.makeConstant(false)
    }
    const sceneIndex = this._sceneIndex!
    return this._eval!.match(path, (p) => sceneIndex.getPrim(p.pathString))
  }

  // Append the paths of all prims in the subtree at `rootPath` (inclusive) that
  // match the expression.
  populateAllMatches(rootPath: SdfPath, result: SdfPath[]): void {
    this.populateMatches(rootPath, HdCollectionMatchKind.MatchAll, result)
  }

  populateMatches(
    rootPath: SdfPath,
    matchKind: HdCollectionMatchKind,
    result: SdfPath[],
  ): void {
    if (this.IsEmpty()) return
    const si = this._sceneIndex!

    const view = new HdSceneIndexPrimView(si, rootPath.pathString)
    const it = view[Symbol.iterator]()
    for (let entry = it.next(); !entry.done; entry = it.next()) {
      const primPathStr = entry.value
      const r = this.match(SdfPath.fromString(primPathStr))

      const matches = r.GetValue()
      const constantOverDescendants = r.isConstant()

      if (matches) {
        result.push(SdfPath.fromString(primPathStr))

        const addDescendantPrims =
          (constantOverDescendants && matchKind === HdCollectionMatchKind.MatchAll) ||
          matchKind === HdCollectionMatchKind.ShallowestMatchesAndAllDescendants

        if (addDescendantPrims) {
          _addAllDescendants(si, primPathStr, result)
        }

        const skipDescendantTraversal =
          addDescendantPrims || matchKind === HdCollectionMatchKind.ShallowestMatches

        if (skipDescendantTraversal) {
          it.skipDescendants()
        }
      } else if (constantOverDescendants) {
        it.skipDescendants()
      }
    }
  }
}

// Traverse the subtree at `rootPath` and append descendant prim paths (skipping
// `rootPath` itself) to `result`.
function _addAllDescendants(
  si: HdSceneIndexBase,
  rootPath: string,
  result: SdfPath[],
): void {
  const it = new HdSceneIndexPrimView(si, rootPath)[Symbol.iterator]()
  it.next() // skip the rootPath entry; we only want descendants.
  for (let entry = it.next(); !entry.done; entry = it.next()) {
    result.push(SdfPath.fromString(entry.value))
  }
}
