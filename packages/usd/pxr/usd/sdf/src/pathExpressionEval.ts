// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pathExpressionEval.cpp,
//  pxr/usd/sdf/pathExpressionEval.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of SdfPathExpressionEval<DomainType> and SdfMakePathExpressionEval of
// pxr/usd/sdf/pathExpressionEval.{h,cpp} (OpenUSD 26.11.1).
//
// Pattern matching itself is SdfPathExpression.Match (pathExpression.ts, the
// observable results of _PatternImplBase::_Match); this module links each of
// the expression's predicate programs against a predicate library with
// SdfLinkPredicateExpression, as _PatternImpl's ctor does
// (pathExpressionEval.h:209-218), and runs them on the domain objects
// `pathToObj` gives.

import { TfErrorMark, Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfPath } from './path.ts'
import { type SdfPathExpression, type SdfPathExprFnArg, SdfPredicateFunctionResult } from './pathExpression.ts'
import { SdfLinkPredicateExpression, type SdfPredicateLibrary, type SdfPredicateProgram } from './predicateLibrary.ts'

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** pathExpressionEval.h:198-359 */
export class SdfPathExpressionEval<D> {
  /** @internal */ _expr: SdfPathExpression | undefined
  /** @internal */ _predicates: SdfPredicateProgram<D>[] = []

  /** pathExpressionEval.h:232-234: true if this is the empty evaluator,
   *  which always returns false from Match. */
  IsEmpty(): boolean {
    return this._expr === undefined
  }

  /** pathExpressionEval.h:236-249: test `objPath` for a match with this
   *  expression. `pathToObj` maps a path to the domain object predicates
   *  are evaluated against. */
  match(objPath: SdfPath, pathToObj: (path: SdfPath) => D): SdfPredicateFunctionResult {
    if (this._expr === undefined) {
      return SdfPredicateFunctionResult.makeConstant(false)
    }
    // pathExpressionEval.h:225-229 runNthPredicate.
    return this._expr.match(objPath,
      (i, path) => this._predicates[i]!.call(pathToObj(path)))
  }
}

/** SdfPredicateExpression::Walk of the `index`-th predicate program of
 *  `expr`. */
function _PredicateWalkable(expr: SdfPathExpression, index: number) {
  return {
    walk: (logic: (op: 'not' | 'and' | 'or', argIndex: number) => void,
      call: (call: { funcName: string, args: readonly SdfPathExprFnArg[] }) => void) =>
      expr._walkPredicate(index, logic, call),
  }
}

/** pathExpressionEval.h:363-390 SdfMakePathExpressionEval and
 *  pathExpressionEval.cpp:850-948 Sdf_MakePathExpressionEvalImpl: create an
 *  evaluator for `expr` with predicates linked against `lib`. On error
 *  (incomplete expression or a predicate call that can't be bound) the
 *  errors are issued and the empty evaluator is returned. */
export function SdfMakePathExpressionEval<D>(
  expr: SdfPathExpression,
  lib: SdfPredicateLibrary<D>,
): SdfPathExpressionEval<D> {
  const eval_ = new SdfPathExpressionEval<D>()

  if (!expr.isComplete()) {
    TF_CODING_ERROR('Cannot build evaluator for incomplete ' +
      'SdfPathExpression; must contain only absolute ' +
      `paths and no expression references: <${expr.getText()}>`)
    return eval_
  }

  const m = new TfErrorMark()
  const predicates: SdfPredicateProgram<D>[] = []
  for (let i = 0, n = expr._getNumPredicates(); i < n; ++i) {
    predicates.push(SdfLinkPredicateExpression(_PredicateWalkable(expr, i), lib))
  }
  if (!m.isClean()) {
    return eval_
  }
  // An empty expression has no ops (pathExpressionEval.h:41-43).
  if (expr.isEmpty()) {
    return eval_
  }
  eval_._expr = expr
  eval_._predicates = predicates
  return eval_
}
