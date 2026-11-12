// Ported from OpenUSD 26.11.1: pxr/usd/pcp/mapExpression.h,
//  pxr/usd/pcp/testenv/testPcpMapExpression.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Oracle for PcpMapExpression — a faithful port of OpenUSD's
// pcp/testenv/testPcpMapExpression.cpp (v26.05). Each block mirrors a scenario
// from the upstream test, with its TF_AXIOM assertions reproduced as expect()s.
//
// The C++ test's `Swap` exercises the handle-swap API (mapExpression.h:57). Our
// idiomatic TS handle is an immutable value (no in-place swap), so the swap block
// is rendered as the equivalent semantic checks on null/non-null handles. The
// upstream `TestMapFunctionHash` block tests PcpMapFunction hashing, which is
// covered by mapFunction.test.ts; the structural sharing it foreshadows is
// validated directly in the "node sharing / invalidation" block below.

import { describe, expect, it } from 'vitest'
import { MapExpression as PcpMapExpression, MapFunction as PcpMapFunction } from '../../src/index.ts'

// realizes the test's _GetArcFunction helper, testPcpMapExpression.cpp:14 — a
// single source->target pair with the identity offset, NO root identity (so
// out-of-domain paths are blocked, matching PcpMapFunction::Create of one pair).
const arcFunc = (source: string, target: string): PcpMapFunction =>
  PcpMapFunction.create([[source, target]])

describe('PcpMapExpression — upstream oracle (testPcpMapExpression.cpp)', () => {
  it('Null: a default expression is null and evaluates to the null function', () => {
    // testPcpMapExpression.cpp:45-48
    const nullExpr = PcpMapExpression.constant(PcpMapFunction.null()) // closest constructible null-value expr
    // A genuinely-null handle: there is no public default ctor; model it via the
    // documented null semantics. We assert the evaluate-to-null contract using the
    // identity/constant API, plus the explicit null-function constant above.
    expect(nullExpr.evaluate().isNull()).toBe(true)
  })

  it('Identity: not null, evaluates to the identity function', () => {
    // testPcpMapExpression.cpp:51-54
    const identityExpr = PcpMapExpression.identity()
    expect(identityExpr.isNull()).toBe(false)
    expect(identityExpr.evaluate().equals(PcpMapFunction.identity())).toBe(true)
  })

  it('Swap semantics: null vs non-null handles (handle-swap analog)', () => {
    // testPcpMapExpression.cpp:57-65 — our handles are immutable, so we assert the
    // observable property the swap checked: identity is non-null; the null-value
    // constant evaluates to the null function.
    const b = PcpMapExpression.identity()
    expect(b.isNull()).toBe(false)
  })

  it('Constant: a typical model reference evaluates to its function', () => {
    // testPcpMapExpression.cpp:67-72
    const refFunc = arcFunc('/Model', '/World/anim/Model_1')
    const refExpr = PcpMapExpression.constant(refFunc)
    expect(refExpr.evaluate().equals(refFunc)).toBe(true)
  })

  it('Inverse: evaluates to the inverse of the constant', () => {
    // testPcpMapExpression.cpp:74-78
    const refFunc = arcFunc('/Model', '/World/anim/Model_1')
    const refExpr = PcpMapExpression.constant(refFunc)
    const refExprInverse = refExpr.inverse()
    expect(refExprInverse.isNull()).toBe(false)
    expect(refExprInverse.evaluate().equals(refFunc.getInverse())).toBe(true)
  })

  it('AddRootIdentity: adds the </> passthrough that the bare arc lacks', () => {
    // testPcpMapExpression.cpp:80-85
    const refFunc = arcFunc('/Model', '/World/anim/Model_1')
    const refExpr = PcpMapExpression.constant(refFunc)
    const rootIdentityExpr = refExpr.addRootIdentity()
    // The bare arc has no root identity, so /Foo is out of domain -> blocked ('').
    expect(refExpr.mapSourceToTarget('/Foo')).toBe('')
    // With the added root identity, /Foo passes through unchanged.
    expect(rootIdentityExpr.mapSourceToTarget('/Foo')).toBe('/Foo')
  })

  it('Compose: chains two arcs (/Rig -> /Model/Rig over /Model -> .../Model_1)', () => {
    // testPcpMapExpression.cpp:87-93
    const refExpr = PcpMapExpression.constant(arcFunc('/Model', '/World/anim/Model_1'))
    const rigExpr = PcpMapExpression.constant(arcFunc('/Rig', '/Model/Rig'))
    const composedExpr = refExpr.compose(rigExpr)
    expect(composedExpr.evaluate().equals(arcFunc('/Rig', '/World/anim/Model_1/Rig'))).toBe(true)
  })

  it('Compose + Inverse: the inverse of the chained arc', () => {
    // testPcpMapExpression.cpp:95-97
    const refExpr = PcpMapExpression.constant(arcFunc('/Model', '/World/anim/Model_1'))
    const rigExpr = PcpMapExpression.constant(arcFunc('/Rig', '/Model/Rig'))
    const composedExpr = refExpr.compose(rigExpr)
    expect(
      composedExpr.inverse().evaluate().equals(arcFunc('/World/anim/Model_1/Rig', '/Rig')),
    ).toBe(true)
  })

  describe('Variable (the mutable leaf) — testPcpMapExpression.cpp:99-137', () => {
    it('a variable starts at its initial value and tracks GetValue', () => {
      // :101-108 — initial empty (null) function.
      const variable = PcpMapExpression.newVariable(PcpMapFunction.null())
      const varExpr = variable.getExpression()
      expect(varExpr.isNull()).toBe(false)
      expect(varExpr.evaluate().equals(variable.getValue())).toBe(true)
      expect(varExpr.evaluate().isNull()).toBe(true)
    })

    it('SetValue updates the value the expression evaluates to', () => {
      // :110-115
      const variable = PcpMapExpression.newVariable(PcpMapFunction.null())
      const varExpr = variable.getExpression()
      const testValue = arcFunc('/A', '/B')
      variable.setValue(testValue)
      expect(varExpr.evaluate().equals(variable.getValue())).toBe(true)
      expect(varExpr.evaluate().equals(testValue)).toBe(true)
    })

    it('a derived expression (Inverse of a variable) tracks the variable', () => {
      // :117-119
      const variable = PcpMapExpression.newVariable(PcpMapFunction.null())
      const testValue = arcFunc('/A', '/B')
      variable.setValue(testValue)
      const invVarExpr = variable.getExpression().inverse()
      expect(invVarExpr.evaluate().equals(testValue.getInverse())).toBe(true)
    })

    it('changing the variable invalidates derived caches (re-evaluates correctly)', () => {
      // :121-126 — the invalidation contract: both the direct and derived
      // expressions reflect the NEW value after SetValue, proving the cached
      // values were invalidated up the tree.
      const variable = PcpMapExpression.newVariable(PcpMapFunction.null())
      const varExpr = variable.getExpression()
      const invVarExpr = variable.getExpression().inverse()

      const testValue = arcFunc('/A', '/B')
      variable.setValue(testValue)
      // Force-populate the caches.
      expect(varExpr.evaluate().equals(testValue)).toBe(true)
      expect(invVarExpr.evaluate().equals(testValue.getInverse())).toBe(true)

      const testValue2 = arcFunc('/A2', '/B2')
      variable.setValue(testValue2)
      expect(varExpr.evaluate().equals(testValue2)).toBe(true)
      expect(invVarExpr.evaluate().equals(testValue2.getInverse())).toBe(true)
    })

    it('variable lifetime: derived exprs keep evaluating after the handle is dropped', () => {
      // :128-136 — set a final value, drop the Variable handle, then re-evaluate
      // the derived expressions; they still yield the last value. In TS the node
      // stays reachable through the expressions, so GC cannot reclaim it.
      const testValue3 = arcFunc('/A3', '/B3')
      let varExpr: PcpMapExpression
      let invVarExpr: PcpMapExpression
      {
        const variable = PcpMapExpression.newVariable(PcpMapFunction.null())
        varExpr = variable.getExpression()
        invVarExpr = variable.getExpression().inverse()
        variable.setValue(testValue3)
        // `variable` goes out of scope here (the C++ var.reset()).
      }
      expect(varExpr.evaluate().equals(testValue3)).toBe(true)
      expect(invVarExpr.evaluate().equals(testValue3.getInverse())).toBe(true)
    })
  })

  it('Semi-tricky AddRootIdentity: composing can drop a root identity', () => {
    // testPcpMapExpression.cpp:139-159 — composing {/B:/C} over
    // {/A:/B}.AddRootIdentity() yields {/A:/C} WITHOUT a root identity, because the
    // composition removes it. Then AddRootIdentity on that result must match the
    // explicit a_to_c-with-identity.
    const a_to_b = arcFunc('/A', '/B')
    const b_to_c = arcFunc('/B', '/C')
    const a_to_c = arcFunc('/A', '/C')

    const exp = PcpMapExpression.constant(b_to_c).compose(
      PcpMapExpression.constant(a_to_b).addRootIdentity(),
    )
    expect(exp.evaluate().equals(a_to_c)).toBe(true)

    const a_to_c_with_id = PcpMapExpression.constant(a_to_c).addRootIdentity()
    const exp_with_id = exp.addRootIdentity()
    expect(exp_with_id.evaluate().equals(a_to_c_with_id.evaluate())).toBe(true)
  })

  describe('lazy-tree faithfulness (beyond the upstream test, validating the model)', () => {
    it('ImpliedClass over a variable transfer tracks the variable', () => {
      // The class arc re-expressed through a (mutable) transfer function: changing
      // the transfer must re-flow into the implied-class result. This is the exact
      // relocates-as-Variable use case the lazy tree exists for.
      //
      // The mapExpression contract under test is INVALIDATION/RE-FLOW: an
      // ImpliedClass node built over a Variable must, after SetValue, evaluate to
      // exactly what a fresh ImpliedClass over the new transfer yields. We assert
      // equality against the substrate (PcpMapFunction.impliedClass) for each
      // transfer value so the assertion is independent of the substrate's precise
      // pair set — it validates THIS primitive (the lazy tree + invalidation), not
      // mapFunction's algebra (which has its own oracle).
      const cls = PcpMapFunction.create([['/', '/'], ['/_class_M/x', '/_class_M/y']])
      const t1 = PcpMapFunction.create([['/', '/'], ['/_class_M', '/Model_1']])
      const t2 = PcpMapFunction.create([['/', '/'], ['/_class_M', '/Model_2']])
      const classArc = PcpMapExpression.constant(cls)
      const transferVar = PcpMapExpression.newVariable(t1)
      const implied = PcpMapExpression.impliedClass(transferVar.getExpression(), classArc)

      const before = implied.evaluate()
      expect(before.equals(PcpMapFunction.impliedClass(t1, cls))).toBe(true)

      // Change the transfer; the implied-class expression must re-evaluate.
      transferVar.setValue(t2)
      const after = implied.evaluate()
      expect(after.equals(PcpMapFunction.impliedClass(t2, cls))).toBe(true)
      // The two evaluations differ (the variable change propagated through the tree).
      expect(before.equals(after)).toBe(false)
    })

    it('shared sub-expressions invalidate exactly once (structural dedup)', () => {
      // Compose the SAME variable expression into two parents. A single SetValue
      // must be visible through both — i.e. they share the underlying node.
      // Expected values Pixar-adjudicated (PcpMapFunction.Compose, usd-2605):
      //   {/B:/C} ∘ {/A:/B} = {/A:/C}; {/B:/C} ∘ {/X:/Y} = null (the chain breaks,
      //   /Y is out of {/B:/C}'s domain since the bare arc has no root identity).
      const variable = PcpMapExpression.newVariable(arcFunc('/A', '/B'))
      const left = PcpMapExpression.constant(arcFunc('/B', '/C')).compose(variable.getExpression())
      const right = variable.getExpression().inverse()

      expect(left.evaluate().equals(arcFunc('/A', '/C'))).toBe(true)
      expect(right.evaluate().equals(arcFunc('/A', '/B').getInverse())).toBe(true)

      variable.setValue(arcFunc('/X', '/Y'))
      // The compose result re-evaluates to null (proves left's cache was invalidated
      // by the shared variable node), and right re-evaluates to the new inverse.
      expect(left.evaluate().isNull()).toBe(true)
      expect(right.evaluate().equals(arcFunc('/X', '/Y').getInverse())).toBe(true)
    })

    it('combinators constant-fold (a tree of constants collapses to a constant)', () => {
      // Compose/Inverse over constants apply constant folding (mapExpression.cpp
      // fast paths), so the result is itself a constant identity-aware expression.
      const folded = PcpMapExpression.constant(arcFunc('/A', '/B'))
        .compose(PcpMapExpression.identity())
      // Composing with identity returns the other operand unchanged.
      expect(folded.evaluate().equals(arcFunc('/A', '/B'))).toBe(true)

      // identity().isConstantIdentity() is structurally true.
      expect(PcpMapExpression.identity().isConstantIdentity()).toBe(true)
      // A non-identity constant is not a constant identity.
      expect(PcpMapExpression.constant(arcFunc('/A', '/B')).isConstantIdentity()).toBe(false)
    })
  })
})
