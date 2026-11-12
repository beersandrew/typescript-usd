// Ported from OpenUSD 26.11.1: pxr/usd/pcp/iterator.cpp,
//  pxr/usd/pcp/iterator.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Node, prim and property iterators and ranges. Port of OpenUSD v26.08
// pxr/usd/pcp/iterator.{h,cpp}.
//
// The C++ operators map to methods: operator* is deref(), operator[] is at(),
// ++/-- are increment()/decrement(), += is advance(), + and -(n) are plus()
// and minus(), iterator - iterator is subtract(), == is equals() and the
// relational operators are lessThan() and friends. A range is the
// std::pair<Iterator, Iterator> of PCP_DEFINE_RANGE (iterator.h:530-576):
// `first` and `second`, `reversed()` for TF_REVERSE_FOR_ALL, and the values
// in [first, second) as array elements so it iterates like the range-for.

import type { Spec as SdfSpec } from 'typescript-usd/sdf'
import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import type { PcpNodeRef } from './node.ts'
import type { PcpPrimIndex } from './primIndex.ts'
import type { Pcp_CompressedSdSite, PcpPrimIndex_Graph, PcpSdSite } from './primIndex_Graph.ts'
import type { PcpPropertyIndex } from './propertyIndex.ts'

// PCP_INVALID_INDEX (types.h): the position of a default-constructed
// iterator.
const PCP_INVALID_INDEX = Number.MAX_SAFE_INTEGER

// TF_CODING_ERROR.
function codingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** The random-access iterator interface the Pcp iterators share. */
interface PcpRandomAccessIterator<Self, Value> {
  clone(): Self
  deref(): Value
  increment(): Self
  decrement(): Self
  advance(n: number): Self
  equals(other: Self): boolean
  subtract(other: Self): number
}

// ---- PcpNodeIterator (iterator.h:26-174) -----------------------------------

/**
 * Object used to iterate over nodes in the prim index graph in strong-to-weak
 * order.
 */
export class PcpNodeIterator implements PcpRandomAccessIterator<PcpNodeIterator, PcpNodeRef> {
  /** Constructs an invalid iterator when called with no arguments. */
  constructor(
    private readonly _graph: PcpPrimIndex_Graph | null = null,
    private _nodeIdx: number = PCP_INVALID_INDEX,
  ) {}

  clone(): PcpNodeIterator { return new PcpNodeIterator(this._graph, this._nodeIdx) }

  // GetCompressedSdSite (iterator.h:47-51). For internal use only.
  /** @internal */
  _getCompressedSdSite(layerIndex: number): Pcp_CompressedSdSite {
    return { nodeIndex: this._nodeIdx, layerIndex }
  }

  // MoveToNextSubtree (iterator.cpp:20-27): move to the node after the
  // current node's subtree.
  moveToNextSubtree(): PcpNodeIterator {
    const subtreeRange = this._graph!.getNodeIndexesForSubtreeRange(this.deref())
    this._nodeIdx = subtreeRange[1]
    return this
  }

  deref(): PcpNodeRef { return this._graph!._ref(this._nodeIdx) }
  at(index: number): PcpNodeRef { return this.plus(index).deref() }

  increment(): PcpNodeIterator { ++this._nodeIdx; return this }
  decrement(): PcpNodeIterator { --this._nodeIdx; return this }
  advance(n: number): PcpNodeIterator { this._nodeIdx += n; return this }
  plus(n: number): PcpNodeIterator { return this.clone().advance(n) }
  minus(n: number): PcpNodeIterator { return this.clone().advance(-n) }
  // operator-(const PcpNodeIterator&) (iterator.h:69-71).
  subtract(other: PcpNodeIterator): number { return this._nodeIdx - other._nodeIdx }

  equals(other: PcpNodeIterator): boolean {
    return this._graph === other._graph && this._nodeIdx === other._nodeIdx
  }
  lessThan(other: PcpNodeIterator): boolean { return this._nodeIdx < other._nodeIdx }
  lessThanOrEqual(other: PcpNodeIterator): boolean { return this._nodeIdx <= other._nodeIdx }
  greaterThan(other: PcpNodeIterator): boolean { return this._nodeIdx > other._nodeIdx }
  greaterThanOrEqual(other: PcpNodeIterator): boolean { return this._nodeIdx >= other._nodeIdx }
}

// Tf_ProxyReferenceReverseIterator (tf/iterator.h): dereferences the element
// before base(), and moves base() the opposite way.
abstract class PcpReverseIterator<Base extends PcpRandomAccessIterator<Base, Value>, Value, Self> {
  protected _base: Base

  constructor(base: Base) { this._base = base.clone() }

  protected abstract _make(base: Base): Self

  base(): Base { return this._base.clone() }
  clone(): Self { return this._make(this._base) }

  deref(): Value { return this._base.clone().decrement().deref() }
  at(index: number): Value { return this._base.clone().advance(-index - 1).deref() }

  increment(): Self { this._base.decrement(); return this as unknown as Self }
  decrement(): Self { this._base.increment(); return this as unknown as Self }
  advance(n: number): Self { this._base.advance(-n); return this as unknown as Self }
  plus(n: number): Self { return this._make(this._base.clone().advance(-n)) }
  minus(n: number): Self { return this._make(this._base.clone().advance(n)) }
  subtract(other: PcpReverseIterator<Base, Value, Self>): number {
    return other._base.subtract(this._base)
  }

  equals(other: PcpReverseIterator<Base, Value, Self>): boolean {
    return this._base.equals(other._base)
  }
}

/**
 * Object used to iterate over nodes in the prim index graph in weak-to-strong
 * order (iterator.h:176-187).
 */
export class PcpNodeReverseIterator
  extends PcpReverseIterator<PcpNodeIterator, PcpNodeRef, PcpNodeReverseIterator>
  implements PcpRandomAccessIterator<PcpNodeReverseIterator, PcpNodeRef> {
  constructor(iter: PcpNodeIterator = new PcpNodeIterator()) { super(iter) }
  protected _make(base: PcpNodeIterator): PcpNodeReverseIterator {
    return new PcpNodeReverseIterator(base)
  }
}

// ---- PcpPrimIterator (iterator.h:189-344, iterator.cpp:29-114) --------------

/**
 * Object used to iterate over prim specs in the prim index graph in
 * strong-to-weak order.
 */
export class PcpPrimIterator implements PcpRandomAccessIterator<PcpPrimIterator, PcpSdSite> {
  /**
   * Constructs a prim iterator beginning at position `pos` in the prim stack
   * of prim index `primIndex`, or an invalid iterator with no arguments.
   */
  constructor(
    private readonly _primIndex: PcpPrimIndex | null = null,
    private _pos: number = PCP_INVALID_INDEX,
  ) {}

  clone(): PcpPrimIterator { return new PcpPrimIterator(this._primIndex, this._pos) }

  /** Returns the PcpNode from which the current prim originated. */
  getNode(): PcpNodeRef {
    const primIndex = this._primIndex!
    return primIndex.getGraph()!.getNodeForSite(primIndex._primStack[this._pos]!)
  }

  deref(): PcpSdSite {
    const primIndex = this._primIndex!
    return primIndex.getGraph()!.getSdSite(primIndex._primStack[this._pos]!)
  }
  at(index: number): PcpSdSite { return this.plus(index).deref() }

  increment(): PcpPrimIterator {
    if (!this._primIndex) {
      codingError('Cannot increment invalid iterator')
      return this
    }
    ++this._pos
    return this
  }

  decrement(): PcpPrimIterator {
    if (!this._primIndex) {
      codingError('Cannot decrement invalid iterator')
      return this
    }
    --this._pos
    return this
  }

  advance(n: number): PcpPrimIterator {
    if (!this._primIndex) {
      codingError('Cannot advance invalid iterator')
      return this
    }
    this._pos += n
    return this
  }

  plus(n: number): PcpPrimIterator { return this.clone().advance(n) }
  minus(n: number): PcpPrimIterator { return this.clone().advance(-n) }
  // operator- is -distance_to (iterator.h:224-226); 0 - keeps a zero
  // difference +0.
  subtract(other: PcpPrimIterator): number { return 0 - this._distanceTo(other) }

  // distance_to (iterator.cpp:73-88).
  private _distanceTo(other: PcpPrimIterator): number {
    if (!this._primIndex || !other._primIndex) {
      codingError('Invalid iterator')
      return 0
    }
    if (this._primIndex !== other._primIndex) {
      codingError('Cannot compute distance for iterators ' +
        'from different prim indexes.')
      return 0
    }
    return other._pos - this._pos
  }

  equals(other: PcpPrimIterator): boolean {
    return this._primIndex === other._primIndex && this._pos === other._pos
  }
  lessThan(other: PcpPrimIterator): boolean { return this._pos < other._pos }
  lessThanOrEqual(other: PcpPrimIterator): boolean { return this._pos <= other._pos }
  greaterThan(other: PcpPrimIterator): boolean { return this._pos > other._pos }
  greaterThanOrEqual(other: PcpPrimIterator): boolean { return this._pos >= other._pos }
}

/**
 * Object used to iterate over prim specs in the prim index graph in
 * weak-to-strong order (iterator.h:346-370).
 */
export class PcpPrimReverseIterator
  extends PcpReverseIterator<PcpPrimIterator, PcpSdSite, PcpPrimReverseIterator>
  implements PcpRandomAccessIterator<PcpPrimReverseIterator, PcpSdSite> {
  constructor(iter: PcpPrimIterator = new PcpPrimIterator()) { super(iter) }
  protected _make(base: PcpPrimIterator): PcpPrimReverseIterator {
    return new PcpPrimReverseIterator(base)
  }

  getNode(): PcpNodeRef { return this._base.clone().decrement().getNode() }
}

// ---- PcpPropertyIterator (iterator.h:372-498, iterator.cpp:116-199) --------

/**
 * Object used to iterate over property specs in a property index in
 * strong-to-weak order.
 */
export class PcpPropertyIterator implements PcpRandomAccessIterator<PcpPropertyIterator, SdfSpec> {
  /**
   * Constructs a property iterator for `index` beginning at position `pos`
   * in the property stack, or an invalid iterator with no arguments.
   */
  constructor(
    private readonly _propertyIndex: PcpPropertyIndex | null = null,
    private _pos = 0,
  ) {}

  clone(): PcpPropertyIterator { return new PcpPropertyIterator(this._propertyIndex, this._pos) }

  /** Returns the PcpNode from which the current property originated. */
  getNode(): PcpNodeRef {
    return this._propertyIndex!._propertyStack[this._pos]!.originatingNode
  }

  /**
   * Returns true if the current property is local to the owning property
   * index's layer stack, false otherwise (iterator.cpp:193-197).
   */
  isLocal(): boolean {
    return this._pos < this._propertyIndex!.getNumLocalSpecs()
  }

  deref(): SdfSpec { return this._propertyIndex!._propertyStack[this._pos]!.propertySpec }
  at(index: number): SdfSpec { return this.plus(index).deref() }

  increment(): PcpPropertyIterator {
    if (!this._propertyIndex) {
      codingError('Cannot increment invalid iterator')
      return this
    }
    ++this._pos
    return this
  }

  decrement(): PcpPropertyIterator {
    if (!this._propertyIndex) {
      codingError('Cannot decrement invalid iterator')
      return this
    }
    --this._pos
    return this
  }

  advance(n: number): PcpPropertyIterator {
    if (!this._propertyIndex) {
      codingError('Cannot advance invalid iterator')
      return this
    }
    this._pos += n
    return this
  }

  plus(n: number): PcpPropertyIterator { return this.clone().advance(n) }
  minus(n: number): PcpPropertyIterator { return this.clone().advance(-n) }
  // operator- is -distance_to (iterator.h:409-411); 0 - keeps a zero
  // difference +0.
  subtract(other: PcpPropertyIterator): number { return 0 - this._distanceTo(other) }

  // distance_to (iterator.cpp:160-175).
  private _distanceTo(other: PcpPropertyIterator): number {
    if (!this._propertyIndex || !other._propertyIndex) {
      codingError('Invalid iterator')
      return 0
    }
    if (this._propertyIndex !== other._propertyIndex) {
      codingError('Cannot compute distance for iterators ' +
        'from different property indexes')
      return 0
    }
    return other._pos - this._pos
  }

  equals(other: PcpPropertyIterator): boolean {
    return this._propertyIndex === other._propertyIndex && this._pos === other._pos
  }
  lessThan(other: PcpPropertyIterator): boolean { return this._pos < other._pos }
  lessThanOrEqual(other: PcpPropertyIterator): boolean { return this._pos <= other._pos }
  greaterThan(other: PcpPropertyIterator): boolean { return this._pos > other._pos }
  greaterThanOrEqual(other: PcpPropertyIterator): boolean { return this._pos >= other._pos }
}

/**
 * Object used to iterate over property specs in a property index in
 * weak-to-strong order (iterator.h:500-524).
 */
export class PcpPropertyReverseIterator
  extends PcpReverseIterator<PcpPropertyIterator, SdfSpec, PcpPropertyReverseIterator>
  implements PcpRandomAccessIterator<PcpPropertyReverseIterator, SdfSpec> {
  constructor(iter: PcpPropertyIterator = new PcpPropertyIterator()) { super(iter) }
  protected _make(base: PcpPropertyIterator): PcpPropertyReverseIterator {
    return new PcpPropertyReverseIterator(base)
  }

  getNode(): PcpNodeRef { return this._base.clone().decrement().getNode() }
  isLocal(): boolean { return this._base.clone().decrement().isLocal() }
}

// ---- Ranges (PCP_DEFINE_RANGE, iterator.h:530-580) -------------------------

function fill<It extends PcpRandomAccessIterator<It, Value>, Value>(
  out: Value[], first: It, second: It,
): void {
  for (const it = first.clone(); !it.equals(second); it.increment()) out.push(it.deref())
}

// A reverse range: TF_REVERSE_FOR_ALL iterates from ReverseIterator(second)
// to ReverseIterator(first) (iterator.h:556-570).
export interface PcpReverseRange<ReverseIterator> {
  readonly first: ReverseIterator
  readonly second: ReverseIterator
}

/** PcpNodeRange: the nodes in [first, second). */
export class PcpNodeRange extends Array<PcpNodeRef> {
  readonly #first: PcpNodeIterator
  readonly #second: PcpNodeIterator

  constructor(first = new PcpNodeIterator(), second = new PcpNodeIterator()) {
    super()
    this.#first = first.clone()
    this.#second = second.clone()
    fill(this, first, second)
  }

  get first(): PcpNodeIterator { return this.#first.clone() }
  get second(): PcpNodeIterator { return this.#second.clone() }

  reversed(): PcpReverseRange<PcpNodeReverseIterator> {
    return {
      first: new PcpNodeReverseIterator(this.#second),
      second: new PcpNodeReverseIterator(this.#first),
    }
  }
}

/** PcpPrimRange: the prim specs in [first, second). */
export class PcpPrimRange extends Array<PcpSdSite> {
  readonly #first: PcpPrimIterator
  readonly #second: PcpPrimIterator

  constructor(first = new PcpPrimIterator(), second = new PcpPrimIterator()) {
    super()
    this.#first = first.clone()
    this.#second = second.clone()
    fill(this, first, second)
  }

  get first(): PcpPrimIterator { return this.#first.clone() }
  get second(): PcpPrimIterator { return this.#second.clone() }

  reversed(): PcpReverseRange<PcpPrimReverseIterator> {
    return {
      first: new PcpPrimReverseIterator(this.#second),
      second: new PcpPrimReverseIterator(this.#first),
    }
  }
}

/** PcpPropertyRange: the property specs in [first, second). */
export class PcpPropertyRange extends Array<SdfSpec> {
  readonly #first: PcpPropertyIterator
  readonly #second: PcpPropertyIterator

  constructor(first = new PcpPropertyIterator(), second = new PcpPropertyIterator()) {
    super()
    this.#first = first.clone()
    this.#second = second.clone()
    fill(this, first, second)
  }

  get first(): PcpPropertyIterator { return this.#first.clone() }
  get second(): PcpPropertyIterator { return this.#second.clone() }

  reversed(): PcpReverseRange<PcpPropertyReverseIterator> {
    return {
      first: new PcpPropertyReverseIterator(this.#second),
      second: new PcpPropertyReverseIterator(this.#first),
    }
  }
}

// Array methods that build a new array (map, filter, slice, ...) return
// plain arrays rather than ranges.
for (const Range of [PcpNodeRange, PcpPrimRange, PcpPropertyRange]) {
  Object.defineProperty(Range, Symbol.species, { get: () => Array })
}
