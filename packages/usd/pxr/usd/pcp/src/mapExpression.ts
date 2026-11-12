// Ported from OpenUSD 26.11.1: pxr/usd/pcp/mapExpression.cpp,
//  pxr/usd/pcp/mapExpression.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpMapExpression — a LAZY expression tree over PcpMapFunctions, with cached
// Evaluate() and mutable Variable leaves whose mutation invalidates dependents.
//
// Faithful realization of OpenUSD pcp/mapExpression.{h,cpp} (v26.05). This is NOT
// the eager wrapper that previously lived here: the whole point of the type is
// incremental relocates handling. An expression is a tree of namespace-mapping
// OPERATIONS (Constant, Variable, Inverse, Compose, AddRootIdentity,
// ImpliedClass); Evaluate() walks it to a PcpMapFunction and CACHES the result on
// each node; when a Variable's value changes, the cached values of every
// expression that (transitively) depends on it are invalidated, so the next
// Evaluate() narrowly recomputes only the affected subtree. Relocates feed in as
// Variables on a layer stack; this caching/invalidation is how a relocate edit
// propagates efficiently into the arc maps that compose it.
//
// Idiomatic TS choices (behavior-equivalent to the C++ for all inputs):
//   * The expression handle is the class PcpMapExpression; it wraps a _Node | null
//     (null === the C++ null TfDelegatedCountPtr<_Node>).
//   * Node dedup (C++ uses a tbb::concurrent_hash_map flyweight registry) is a JS
//     Map keyed by a structural string. Sharing is observable: composing the same
//     sub-expression twice yields one node, so a Variable change invalidates it
//     once and all dependents see it. Variables are deliberately NOT deduped (each
//     NewVariable is a distinct mutable cell), matching the C++.
//   * Refcount-driven node teardown / registry eviction (TfDelegatedCount) is a
//     C++ memory-management concern with no observable semantics here; JS GC plays
//     that role. We keep the dependent-set wiring (that IS observable, via
//     invalidation) but skip refcounts. The upstream test's "variable lifetime"
//     case (drop the Variable handle, derived exprs still evaluate the last value)
//     holds for free because the node graph stays reachable from the expressions.
//   * The C++ atomics + spin_mutex guard concurrent Evaluate/SetValue; this port
//     is single-threaded, so a plain cached field + boolean flag say the same thing.

import { PcpMapFunction } from './mapFunction.ts'
import { SdfPath } from 'typescript-usd/sdf/path'

type Value = PcpMapFunction

// realizes the _Op enum, mapExpression.h:187. Each node is exactly one operation.
const enum Op {
  Constant,
  Variable,
  Inverse,
  Compose,
  AddRootIdentity,
  ImpliedClass,
}

// Add a mapping from </> to </> if the function does not already have one.
// realizes the file-static _AddRootIdentity, mapExpression.cpp:22.
function addRootIdentity(value: Value): Value {
  return value.addRootIdentity()
}

// Whether the expression tree up to and including a node will ALWAYS include a
// root-identity mapping, derivable from the op + children without evaluating.
// realizes _Node::_ExpressionTreeAlwaysHasIdentity, mapExpression.cpp:195. Used by
// AddRootIdentity() to skip wrapping a tree that already guarantees the identity.
function treeAlwaysHasIdentity(op: Op, arg1: _Node | null, arg2: _Node | null, constant: Value): boolean {
  switch (op) {
    case Op.AddRootIdentity:
      return true
    case Op.Variable:
      // A variable's value can change to anything, so we cannot promise identity.
      return false
    case Op.Constant:
      return constant.hasRootIdentity()
    case Op.Compose:
      // Composing can REMOVE the identity (e.g. {/:/, /A:/B} ∘ {/B:/C} = {/A:/C}),
      // so the result has identity only if BOTH subtrees do. mapExpression.cpp:212.
      return !!(arg1 && arg1.alwaysHasIdentity && arg2 && arg2.alwaysHasIdentity)
    case Op.ImpliedClass:
      // ImpliedClass always adds the root identity. mapExpression.cpp:223.
      return true
    default:
      // Inverse: if a subtree has identity, so does this. mapExpression.cpp:230.
      return !!(arg1 && arg1.alwaysHasIdentity) || !!(arg2 && arg2.alwaysHasIdentity)
  }
}

// Structural key for the dedup registry. realizes _Node::Key (op + arg1 + arg2 +
// valueForConstant) and its hash/equality, mapExpression.cpp:380. Two nodes are
// the SAME (sub-)expression iff they have the same op, the same child NODES (by
// identity — captured here as their unique ids), and the same constant value.
// Variables are excluded from the registry, so they never produce a key.
function nodeKey(op: Op, arg1: _Node | null, arg2: _Node | null, constant: Value): string {
  const a1 = arg1 ? arg1.id : '-'
  const a2 = arg2 ? arg2.id : '-'
  // Constant value only participates for Constant nodes (it is Value() elsewhere).
  const c = op === Op.Constant ? constant.toString() : ''
  return `${op}|${a1}|${a2}|${c}`
}

let _nextNodeId = 0

// realizes PcpMapExpression::_Node, mapExpression.h:196 — one operation node in
// the expression tree, carrying its (memoized) value and its dependents.
class _Node {
  readonly id: number
  readonly op: Op
  readonly arg1: _Node | null
  readonly arg2: _Node | null
  readonly constant: Value
  readonly alwaysHasIdentity: boolean

  // Memoized Evaluate() result. realizes _cachedValue + _hasCachedValue,
  // mapExpression.h:266/270.
  private _cachedValue: Value | null = null

  // Variable storage. realizes _valueForVariable, mapExpression.h:268. Only
  // meaningful for Op.Variable nodes.
  private _valueForVariable: Value = PcpMapFunction.null()

  // Expressions that consume this node as a child, so invalidation can walk UP the
  // tree. realizes _dependentExpressions, mapExpression.h:267. A Set because a
  // node may be referenced by many parents.
  readonly dependents = new Set<_Node>()

  // The dedup registry: structural key -> live node. realizes the static
  // _nodeRegistry, mapExpression.h:263. Common sub-expressions are shared so that a
  // Variable change invalidates them exactly once and all consumers observe it.
  // (Variable nodes are intentionally not registered.)
  private static readonly _registry = new Map<string, _Node>()

  private constructor(op: Op, arg1: _Node | null, arg2: _Node | null, constant: Value) {
    this.id = _nextNodeId++
    this.op = op
    this.arg1 = arg1
    this.arg2 = arg2
    this.constant = constant
    this.alwaysHasIdentity = treeAlwaysHasIdentity(op, arg1, arg2, constant)
    // Wire ourselves into each child's dependent set so SetValue can reach us.
    // realizes the _Node ctor's _dependentExpressions.insert, mapExpression.cpp:264.
    if (arg1) arg1.dependents.add(this)
    if (arg2) arg2.dependents.add(this)
  }

  // Factory with flyweighting. realizes _Node::New, mapExpression.cpp:235: reuse an
  // existing node for non-variable ops; always make a fresh node for variables.
  static create(
    op: Op,
    arg1: _Node | null = null,
    arg2: _Node | null = null,
    constant: Value = PcpMapFunction.null(),
  ): _Node {
    if (op !== Op.Variable) {
      const key = nodeKey(op, arg1, arg2, constant)
      const existing = _Node._registry.get(key)
      if (existing) return existing
      const node = new _Node(op, arg1, arg2, constant)
      _Node._registry.set(key, node)
      return node
    }
    return new _Node(op, arg1, arg2, constant)
  }

  // Lazy memoized evaluation. realizes _Node::EvaluateAndCache, mapExpression.cpp:301
  // — return the cache if present, else compute, store, and return it.
  evaluate(): Value {
    if (this._cachedValue !== null) return this._cachedValue
    const val = this._evaluateUncached()
    this._cachedValue = val
    return val
  }

  // realizes _Node::_EvaluateUncached, mapExpression.cpp:318 — one case per op,
  // recursing through the (also-cached) children.
  private _evaluateUncached(): Value {
    switch (this.op) {
      case Op.Constant:
        return this.constant
      case Op.Variable:
        return this._valueForVariable
      case Op.Inverse:
        return this.arg1!.evaluate().getInverse()
      case Op.Compose:
        // this = Compose(arg1, arg2) evaluates to arg1 ∘ arg2 (apply arg2, then
        // arg1). mapExpression.cpp:330.
        return this.arg1!.evaluate().compose(this.arg2!.evaluate())
      case Op.AddRootIdentity:
        return addRootIdentity(this.arg1!.evaluate())
      case Op.ImpliedClass:
        // transferFunc, classArc. The root identity is added by impliedClass.
        // mapExpression.cpp:335.
        return PcpMapFunction.impliedClass(this.arg1!.evaluate(), this.arg2!.evaluate())
      default:
        throw new Error('PcpMapExpression: unhandled op')
    }
  }

  // realizes _Node::_Invalidate, mapExpression.cpp:350 — clear our cache and
  // recursively invalidate dependents. The early-out when already-invalid is
  // load-bearing: it makes invalidation O(affected subtree) rather than O(tree),
  // and terminates even though the dependent graph is shared (a node reached twice
  // is skipped the second time).
  private _invalidate(): void {
    if (this._cachedValue !== null) {
      this._cachedValue = null
      for (const dep of this.dependents) dep._invalidate()
    }
  }

  // realizes _Node::SetValueForVariable, mapExpression.cpp:366 — only mutate (and
  // only invalidate) when the value actually changes, matching the C++ guard.
  setValueForVariable(value: Value): void {
    if (this.op !== Op.Variable) {
      throw new Error('PcpMapExpression: cannot set value for non-variable')
    }
    if (!this._valueForVariable.equals(value)) {
      this._valueForVariable = value
      // Our own cache mirrors _valueForVariable; invalidate ourselves + dependents.
      this._cachedValue = null
      for (const dep of this.dependents) dep._invalidateExternal()
    }
  }

  // _invalidate is private; expose the recursive walk for the dependent fan-out.
  private _invalidateExternal(): void {
    this._invalidate()
  }

  getValueForVariable(): Value {
    return this._valueForVariable
  }
}

// realizes the PcpMapExpression::Variable interface, mapExpression.h:80 — a handle
// onto a mutable leaf node. Changing its value invalidates dependent expressions;
// GetExpression() lets it be used as a sub-term. As in the C++, the client holds
// the Variable for as long as it wants to keep setting the value; once dropped,
// derived expressions still evaluate (the node stays reachable through them) but
// the value can no longer change. (We model the C++ unique_ptr handle directly;
// there is no destructor side effect that matters.)
export class PcpMapExpressionVariable {
  // Not exported via the package barrel except through NewVariable(); the node is
  // private to the expression machinery.
  /** @internal */
  constructor(private readonly _node: _Node) {}

  getValue(): PcpMapFunction {
    return this._node.getValueForVariable()
  }

  setValue(value: PcpMapFunction): void {
    this._node.setValueForVariable(value)
  }

  // realizes Variable::GetExpression, mapExpression.cpp:152.
  getExpression(): PcpMapExpression {
    return PcpMapExpression._fromNode(this._node)
  }
}

// realizes PcpMapExpression, mapExpression.h:38 — the value-type handle onto a
// node (or null). All combinators apply the same constant-folding fast paths as
// the C++ so a tree of constants collapses to a single Constant node (the lazy
// machinery only persists when a Variable is present somewhere).
export class PcpMapExpression {
  // null node === the C++ null expression. mapExpression.h:62.
  private readonly _node: _Node | null

  private constructor(node: _Node | null) {
    this._node = node
  }

  /** @internal — wrap a node (used by Variable.getExpression). */
  static _fromNode(node: _Node): PcpMapExpression {
    return new PcpMapExpression(node)
  }

  // realizes the default PcpMapExpression() constructor, mapExpression.h:62 — a
  // null expression (no node). Evaluates to the null PcpMapFunction.
  static null(): PcpMapExpression {
    return new PcpMapExpression(null)
  }

  // realizes PcpMapExpression::Evaluate, mapExpression.cpp:38 — null evaluates to
  // the default (null) PcpMapFunction; otherwise delegate to the node's cache.
  evaluate(): PcpMapFunction {
    return this._node ? this._node.evaluate() : PcpMapFunction.null()
  }

  isNull(): boolean {
    return this._node === null
  }

  // realizes PcpMapExpression::Identity, mapExpression.cpp:45 — the (shared)
  // constant identity expression.
  static identity(): PcpMapExpression {
    return PcpMapExpression.constant(PcpMapFunction.identity())
  }

  // realizes PcpMapExpression::Constant, mapExpression.cpp:52.
  static constant(value: PcpMapFunction): PcpMapExpression {
    return new PcpMapExpression(_Node.create(Op.Constant, null, null, value))
  }

  // realizes PcpMapExpression::NewVariable, mapExpression.cpp:159 — a fresh
  // variable node initialized to the given value.
  static newVariable(initialValue: PcpMapFunction): PcpMapExpressionVariable {
    const node = _Node.create(Op.Variable)
    const variable = new PcpMapExpressionVariable(node)
    variable.setValue(initialValue)
    return variable
  }

  // realizes IsConstantIdentity, mapExpression.h:133 — a STRUCTURAL check (the node
  // is a Constant whose value is identity), used by the combinator fast paths. Note
  // it is NOT the same as evaluating to identity (a Variable can evaluate to
  // identity yet is never a constant).
  isConstantIdentity(): boolean {
    return this._node !== null && this._node.op === Op.Constant && this._node.constant.isIdentity()
  }

  // realizes PcpMapExpression::Compose, mapExpression.cpp:79 — this ∘ f (apply f,
  // then this), with identity short-circuits and constant folding.
  compose(f: PcpMapExpression): PcpMapExpression {
    if (this.isConstantIdentity()) return f
    if (f.isConstantIdentity()) return this
    if (this._node!.op === Op.Constant && f._node!.op === Op.Constant) {
      return PcpMapExpression.constant(this.evaluate().compose(f.evaluate()))
    }
    return new PcpMapExpression(_Node.create(Op.Compose, this._node, f._node))
  }

  // realizes PcpMapExpression::Inverse, mapExpression.cpp:96.
  inverse(): PcpMapExpression {
    if (this.isConstantIdentity()) return this
    if (this._node!.op === Op.Constant) {
      return PcpMapExpression.constant(this.evaluate().getInverse())
    }
    return new PcpMapExpression(_Node.create(Op.Inverse, this._node))
  }

  // realizes PcpMapExpression::AddRootIdentity, mapExpression.cpp:110 — with the
  // alwaysHasIdentity short-circuit (a tree that already guarantees identity is
  // returned unchanged rather than wrapped).
  addRootIdentity(): PcpMapExpression {
    if (this.isConstantIdentity()) return this
    if (this._node!.op === Op.Constant) {
      return PcpMapExpression.constant(addRootIdentity(this.evaluate()))
    }
    if (this._node!.alwaysHasIdentity) {
      return new PcpMapExpression(this._node)
    }
    return new PcpMapExpression(_Node.create(Op.AddRootIdentity, this._node))
  }

  // realizes PcpMapExpression::ImpliedClass, mapExpression.cpp:59 — equivalent to
  // transferFunc.Compose(classArc.Compose(transferFunc.Inverse())).AddRootIdentity(),
  // with the same fast paths (identity transfer returns the class arc; two
  // constants fold).
  static impliedClass(transferFunc: PcpMapExpression, classArc: PcpMapExpression): PcpMapExpression {
    if (transferFunc.isConstantIdentity()) return classArc
    if (transferFunc._node!.op === Op.Constant && classArc._node!.op === Op.Constant) {
      return PcpMapExpression.constant(
        PcpMapFunction.impliedClass(transferFunc.evaluate(), classArc.evaluate()),
      )
    }
    return new PcpMapExpression(_Node.create(Op.ImpliedClass, transferFunc._node, classArc._node))
  }

  // realizes IsIdentity convenience forwarder, mapExpression.h:147.
  isIdentity(): boolean {
    return this.evaluate().isIdentity()
  }

  // realizes MapSourceToTarget convenience forwarder, mapExpression.h:153.
  // Takes/returns a string path at this convenience boundary (the underlying
  // PcpMapFunction operates on SdfPath); '' is the empty/blocked path.
  mapSourceToTarget(path: string): string {
    return this.evaluate().mapSourceToTarget(SdfPath.fromString(path)).pathString
  }

  // realizes MapTargetToSource convenience forwarder, mapExpression.h:159.
  mapTargetToSource(path: string): string {
    return this.evaluate().mapTargetToSource(SdfPath.fromString(path)).pathString
  }
}
