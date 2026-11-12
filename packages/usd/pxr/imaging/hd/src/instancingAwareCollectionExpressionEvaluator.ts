// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/instancingAwareCollectionExpressionEvaluator.cpp,
//  pxr/imaging/hd/instancingAwareCollectionExpressionEvaluator.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/instancingAwareCollectionExpressionEvaluator.{h,cpp}
// (OpenUSD 26.11.1).
//
// SdfPathSet results are arrays of SdfPath kept unique and sorted by
// SdfPath::operator< (SdfPath.compare).

import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { SdfPathExpression, SdfPredicateFunctionResult } from 'typescript-usd/sdf/pathExpression'
import type { PredicateLibrary as SdfPredicateLibrary } from 'typescript-usd/sdf'
import { HdCollectionExpressionEvaluator, type HdCollectionMatchKind } from './collectionExpressionEvaluator.ts'
import type { HdInstanceProxyViewSceneIndex } from './instanceProxyViewSceneIndex.ts'
import { type HdSceneIndexPrim, HdSceneIndexPrimView } from './sceneIndex.ts'

/** An SdfPathSet: unique paths in SdfPath order. */
export class HdSdfPathSet implements Iterable<SdfPath> {
  private _paths: SdfPath[] = []
  private _keys = new Set<string>()

  insert(path: SdfPath): void {
    const key = path.pathString
    if (this._keys.has(key)) return
    this._keys.add(key)
    let lo = 0
    let hi = this._paths.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (SdfPath.compare(this._paths[mid]!, path) < 0) lo = mid + 1
      else hi = mid
    }
    this._paths.splice(lo, 0, path)
  }

  has(path: SdfPath): boolean { return this._keys.has(path.pathString) }
  get size(): number { return this._paths.length }
  [Symbol.iterator](): Iterator<SdfPath> { return this._paths[Symbol.iterator]() }
}

/** instancingAwareCollectionExpressionEvaluator.h MatchResult */
export interface HdInstancingAwareMatchResult {
  nonInstanceMatches: HdSdfPathSet
  fullyMatchedInstances: HdSdfPathSet
  partiallyMatchedInstances: HdSdfPathSet
  matchedInstanceProxyPaths: HdSdfPathSet
}

/** instancingAwareCollectionExpressionEvaluator.h: evaluates a path
 *  expression on the input scene of an HdInstanceProxyViewSceneIndex for
 *  non-instance prims, and on the proxy view for (the instance proxies of)
 *  outermost instances. */
export class HdInstancingAwareCollectionExpressionEvaluator {
  // Evaluator backed by the proxy view's input scene.
  private readonly _inputEval: HdCollectionExpressionEvaluator
  // Evaluator backed by the proxy view scene.
  private readonly _proxyViewEval: HdCollectionExpressionEvaluator
  private readonly _proxyViewSi: HdInstanceProxyViewSceneIndex | undefined

  /** instancingAwareCollectionExpressionEvaluator.cpp:19-38 */
  constructor(
    proxyViewSceneIndex: HdInstanceProxyViewSceneIndex | undefined,
    expr: SdfPathExpression,
    predicateLib: SdfPredicateLibrary<HdSceneIndexPrim>,
  ) {
    this._inputEval = new HdCollectionExpressionEvaluator(
      proxyViewSceneIndex ? proxyViewSceneIndex.getInputScenes()[0] : undefined,
      expr, predicateLib)
    this._proxyViewEval = new HdCollectionExpressionEvaluator(proxyViewSceneIndex, expr, predicateLib)
    this._proxyViewSi = proxyViewSceneIndex
    if (!proxyViewSceneIndex) {
      TfDiagnosticMgr.GetInstance().postWarning(
        'HdInstancingAwareCollectionExpressionEvaluator constructed ' +
        'with null HdInstanceProxyViewSceneIndex for expression ' +
        `'${expr.getText()}'. Evaluation will not be instancing-aware.`)
    }
  }

  IsEmpty(): boolean { return this._inputEval.IsEmpty() }

  /** instancingAwareCollectionExpressionEvaluator.cpp:40-44 */
  match(path: SdfPath): SdfPredicateFunctionResult {
    return this._inputEval.match(path)
  }

  /** instancingAwareCollectionExpressionEvaluator.cpp:46-55 */
  getAllMatches(
    rootPath: SdfPath,
    matchKind: HdCollectionMatchKind,
    includeInstanceProxyMatches = false,
  ): HdInstancingAwareMatchResult {
    const result: HdInstancingAwareMatchResult = {
      nonInstanceMatches: new HdSdfPathSet(),
      fullyMatchedInstances: new HdSdfPathSet(),
      partiallyMatchedInstances: new HdSdfPathSet(),
      matchedInstanceProxyPaths: new HdSdfPathSet(),
    }
    this.appendAllMatches(rootPath, matchKind, includeInstanceProxyMatches, result)
    return result
  }

  /** instancingAwareCollectionExpressionEvaluator.cpp:57-132 */
  appendAllMatches(
    rootPath: SdfPath,
    matchKind: HdCollectionMatchKind,
    includeInstanceProxyMatches: boolean,
    result: HdInstancingAwareMatchResult | undefined,
  ): void {
    if (!result) {
      return
    }

    // Pass 1: standard traversal on the input scene (no proxy-view overhead).
    // XXX Should we skip /UsdNiPropagatedPrototypes altogether here?
    const primMatches: SdfPath[] = []
    this._inputEval.populateMatches(rootPath, matchKind, primMatches)
    for (const p of primMatches) result.nonInstanceMatches.insert(p)

    if (!this._proxyViewSi) {
      // No proxy view — cannot remove outermost instance paths.
      // Warning already issued in constructor.
      return
    }

    // Filter out outermost instance paths — they are classified in pass 2.
    const outermostInstances = this._proxyViewSi.getAllOutermostInstancePrimPaths()
      .map(p => SdfPath.fromString(p))
    {
      const outer = new Set(outermostInstances.map(p => p.pathString))
      const filtered = new HdSdfPathSet()
      for (const p of result.nonInstanceMatches) {
        if (!outer.has(p.pathString)) filtered.insert(p)
      }
      result.nonInstanceMatches = filtered
    }

    // Pass 2: classify each outermost instance prim.
    for (const outerInst of outermostInstances) {
      const r = this._proxyViewEval.match(outerInst)
      const matches = r.GetValue()
      const constantOverDescendants = r.isConstant()
      if (constantOverDescendants) {
        if (matches) {
          result.fullyMatchedInstances.insert(outerInst)

          if (includeInstanceProxyMatches) {
            // All proxy descendants match — traverse and add them.
            this._traverseProxyDescendants(outerInst, result.matchedInstanceProxyPaths)
          }
        }
        // else: instance doesn't match, nor does any of its descendants.
        continue
      }

      // Result varies over descendants.
      const state = { allMatch: true, anyMatch: false }
      this._collectProxyMatches(outerInst, includeInstanceProxyMatches,
        state, result.matchedInstanceProxyPaths)

      if (state.allMatch) {
        result.fullyMatchedInstances.insert(outerInst)
      } else if (state.anyMatch) {
        result.partiallyMatchedInstances.insert(outerInst)
      }
    }
  }

  /** instancingAwareCollectionExpressionEvaluator.cpp:134-172 */
  private _collectProxyMatches(
    path: SdfPath,
    includeProxyPaths: boolean,
    state: { allMatch: boolean, anyMatch: boolean },
    matchedProxyPaths: HdSdfPathSet | undefined,
  ): void {
    for (const childStr of this._proxyViewSi!.getChildPrimPaths(path.pathString)) {
      const child = SdfPath.fromString(childStr)
      const r = this._proxyViewEval.match(child)
      if (r.GetValue()) {
        state.anyMatch = true
        if (includeProxyPaths && matchedProxyPaths) {
          matchedProxyPaths.insert(child)
        }
        if (r.isConstant()) {
          if (includeProxyPaths && matchedProxyPaths) {
            this._traverseProxyDescendants(child, matchedProxyPaths)
          }
          continue
        }
      } else {
        state.allMatch = false
        if (r.isConstant()) {
          continue
        }
      }

      this._collectProxyMatches(child, includeProxyPaths, state, matchedProxyPaths)
    }
  }

  /** instancingAwareCollectionExpressionEvaluator.cpp:174-192 */
  private _traverseProxyDescendants(path: SdfPath, proxyPaths: HdSdfPathSet | undefined): void {
    if (!proxyPaths) {
      return
    }
    // Note the skip of the root path (it can be either an instance or
    // instance proxy; if the latter, we'd have added it in
    // _CollectProxyMatches() already).
    const it = new HdSceneIndexPrimView(this._proxyViewSi!, path.pathString)[Symbol.iterator]()
    it.next()
    for (let e = it.next(); !e.done; e = it.next()) {
      proxyPaths.insert(SdfPath.fromString(e.value))
    }
  }
}
