// Ported from OpenUSD 26.11.1: pxr/exec/exec/uncompilationRuleSet.cpp,
//  pxr/exec/exec/uncompilationRuleSet.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/uncompilationRuleSet.h and
// uncompilationRuleSet.cpp.
//
// The tbb::concurrent_vector of rules is an array. The set keeps upstream's
// std-style method names (emplace_back, size, begin, end, erase,
// shrink_to_fit); its iterator follows docs/openexec-x1.md section 4.1
// (IsAtEnd, Increment, Deref, Equals) and the set is also a JS iterable.

import type { EsfEditReason } from 'typescript-usd/esf'

import type { Exec_UncompilationTarget } from './uncompilationTarget.ts'

/**
 * A rule for uncompiling an object in the VdfNetwork
 * (uncompilationRuleSet.h:26-52).
 *
 * The rule is applicable to scene changes whose reasons intersect the
 * `reasons` field. These reasons implicitly correspond to an SdfPath
 * maintained by the Exec_UncompilationTable. If the reasons match, then
 * `target` should be uncompiled.
 */
export class Exec_UncompilationRule {
  target: Exec_UncompilationTarget
  reasons: EsfEditReason

  constructor(target: Exec_UncompilationTarget, reasons: EsfEditReason) {
    this.target = target
    this.reasons = reasons
  }

  /**
   * Returns a string describing the rule's target and reasons
   * (uncompilationRuleSet.cpp:21-31).
   */
  getDescription(): string {
    return `${this.target.getDescription()}: [${this.reasons.getDescription()}]`
  }
}

/**
 * Contains a set of rules for uncompiling objects in the VdfNetwork
 * (uncompilationRuleSet.h:54-164).
 *
 * The rules are stored in arbitrary order, and may contain duplicates. To
 * locate a particular rule in the set, clients need to scan all contained
 * rules.
 */
export class Exec_UncompilationRuleSet implements Iterable<Exec_UncompilationRule> {
  /** @internal */
  readonly _rules: Exec_UncompilationRule[]

  /** Constructs a set, optionally pre-filled with the given `rules`. */
  constructor(rules?: Iterable<Exec_UncompilationRule>) {
    this._rules = rules ? [...rules] : []
  }

  /**
   * Inserts a rule into the set (uncompilationRuleSet.h:74-86). The arguments
   * are forwarded to the Exec_UncompilationRule constructor.
   */
  emplace_back(target: Exec_UncompilationTarget, reasons: EsfEditReason): void {
    this._rules.push(new Exec_UncompilationRule(target, reasons))
  }

  /** Returns the number of items in the set, including any duplicates. */
  size(): number {
    return this._rules.length
  }

  /** Returns an iterator to the beginning of the rule set. */
  begin(): Exec_UncompilationRuleSet.iterator {
    return new Exec_UncompilationRuleSet.iterator(this, 0)
  }

  /**
   * Returns an iterator to the end of the rule set. It becomes invalid if a
   * client erases an element.
   */
  end(): Exec_UncompilationRuleSet.iterator {
    return new Exec_UncompilationRuleSet.iterator(this, this._rules.length)
  }

  /**
   * Removes the item referred to by `it` from the set, and returns an
   * iterator to the next item for iteration (uncompilationRuleSet.cpp:33-51).
   * `it` must be a non-end iterator to this set.
   */
  erase(it: Exec_UncompilationRuleSet.iterator): Exec_UncompilationRuleSet.iterator {
    const last = this._rules.length - 1
    if (it._index !== last) {
      this._rules[it._index] = this._rules[last]!
    }
    this._rules.length = last
    return new Exec_UncompilationRuleSet.iterator(this, it._index)
  }

  /** Reduces the capacity to match the size of the set (no-op with JS arrays). */
  shrink_to_fit(): void {}

  /**
   * Returns a string describing all rules in the set
   * (uncompilationRuleSet.cpp:53-68).
   */
  getDescription(): string {
    if (this._rules.length === 0) {
      return '{}'
    }

    let str = '{\n'
    for (const rule of this._rules) {
      str += rule.getDescription() + '\n'
    }
    str += '}'
    return str
  }

  [Symbol.iterator](): Iterator<Exec_UncompilationRule> {
    return this._rules[Symbol.iterator]()
  }
}

export namespace Exec_UncompilationRuleSet {
  /** _ConcurrentVector::iterator (uncompilationRuleSet.h:100). */
  export class iterator {
    /** @internal */
    readonly _set: Exec_UncompilationRuleSet
    /** @internal */
    _index: number

    constructor(set: Exec_UncompilationRuleSet, index: number) {
      this._set = set
      this._index = index
    }

    isAtEnd(): boolean {
      return this._index >= this._set._rules.length
    }

    /** operator++ */
    increment(): this {
      ++this._index
      return this
    }

    /** operator* */
    deref(): Exec_UncompilationRule {
      return this._set._rules[this._index]!
    }

    /** operator== */
    Equals(rhs: iterator): boolean {
      return this._set === rhs._set && this._index === rhs._index
    }

    /** operator!= */
    notEquals(rhs: iterator): boolean {
      return !this.Equals(rhs)
    }
  }
}
