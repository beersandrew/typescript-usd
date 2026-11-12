// Ported from OpenUSD 26.11.1: pxr/exec/vdf/weightedIterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/weightedIterator.h.
//
// `VdfWeightedIterator<IteratorType>(context, weightNames, args...)`
// constructs the underlying IteratorType from (context, args...). Here the
// caller constructs the underlying iterator and passes it last:
// `new VdfWeightedIterator(context, weightNames, iterator)`. The weight names
// are one token, or an array of tokens (the initializer_list and vector
// overloads). The underlying iterator is constructed before the weight slots
// are initialized, as upstream.

import { TF_CODING_ERROR, TF_DEV_AXIOM, TF_VERIFY } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import { VdfIndexedWeightsType, type VdfIndexedWeights } from './indexedWeights.ts'
import type { VdfInput } from './input.ts'
import {
  Vdf_DerefAssignUnderlying, Vdf_GetIteratorIndex, VdfIterator, type Vdf_IndexedIterator,
} from './iterator.ts'

// std::numeric_limits<int>::max()
const _INT_MAX = 2147483647

/** The information held per weight slot in a weighted iterator (weightedIterator.h:28-35). */
export interface Vdf_WeightSlot {
  /** The vector of weights we are iterating over. */
  weights: VdfIndexedWeights | null

  /** The current iterator index into the VdfIndexedWeights above. */
  currentIndex: number
}

/**
 * Array of weight slots for weighted iterators (weightedIterator.h:46-137).
 * The local storage for one slot is an allocator optimization and is dropped.
 */
export class Vdf_WeightSlotArray implements Iterable<Vdf_WeightSlot> {
  private _slots: Vdf_WeightSlot[] | null = null

  /**
   * Allocate storage for `numInputs` elements. This function may only be
   * called once during the lifetime of the array (weightedIterator.h:76-85).
   * Upstream leaves the elements uninitialized; here they start without
   * weights.
   */
  allocate(numInputs: number): void {
    if (!TF_VERIFY(this._slots === null, '!_begin && !_end')) {
      return
    }
    this._slots = Array.from({ length: numInputs }, () => ({ weights: null, currentIndex: 0 }))
  }

  /** Return the number of slots in the array (weightedIterator.h:89-91). */
  size(): number {
    return this._slots ? this._slots.length : 0
  }

  /** Access the slot at index `slot` (weightedIterator.h:119-127). */
  Get(slot: number): Vdf_WeightSlot {
    return this._slots![slot]!
  }

  [Symbol.iterator](): Iterator<Vdf_WeightSlot> {
    return (this._slots ?? [])[Symbol.iterator]()
  }

  /**
   * Returns the next index that has a weight at or after `index`. Updates the
   * currentIndex (weightedIterator.h:470-501).
   */
  advanceToNextExplicitIndex(index: number): number {
    let nextExplicitIndex = _INT_MAX

    // Iterate over all the weight slots.
    for (const p of this) {
      const w = p.weights

      // If we're done with that slot, don't bother trying to find one.
      if (!w || p.currentIndex >= w.getSize()) {
        continue
      }

      TF_DEV_AXIOM(w, 'w')

      // We'll try to do a quick local search from our last known position,
      // for speed.
      p.currentIndex = w.getFirstDataIndex(index, p.currentIndex)
      if (p.currentIndex < w.getSize()) {
        // We already found the next index that we care about, we won't do
        // any more work than is necessary.
        const wIndexVal = w.getIndex(p.currentIndex)
        if (wIndexVal < nextExplicitIndex) {
          nextExplicitIndex = wIndexVal
        }
      }
    }

    return nextExplicitIndex
  }
}

/**
 * This iterator can be used to iterate through an input that is weighted by
 * one or more weight vectors (weightedIterator.h:145).
 */
export class VdfWeightedIterator<V, I extends Vdf_IndexedIterator<V> = Vdf_IndexedIterator<V>>
  extends VdfIterator implements Vdf_IndexedIterator<V> {
  // The underlying iterator.
  private readonly _iterator: I

  private readonly _slots = new Vdf_WeightSlotArray()

  /**
   * Constructs a weighted iterator using a single weight name, or a list of
   * weight names (weightedIterator.h:160-195).
   */
  constructor(context: VdfContext, weightNames: string | readonly string[], iterator: I) {
    super()
    this._iterator = iterator
    this._init(context, typeof weightNames === 'string' ? [weightNames] : weightNames)
  }

  /** Increment operator to point to the next element (weightedIterator.h:395-413). */
  increment(): this {
    // We need to differentiate between two cases here:
    //
    // a) There can be holes in the mask _iterator works on, we want to skip
    //    those fast.
    // b) There can be holes in the explicit weights, which we also want to
    //    skip fast.

    // Advance iterator to the next element as indicated by mask, this may or
    // may not skip holes in the mask.
    this._iterator.increment()
    this._advanceIterator()
    return this
  }

  /** Returns the current element (weightedIterator.h:207-209). */
  deref(): V {
    return this._iterator.deref()
  }

  /**
   * Assigns `value` to the current element (`*it = value` through the
   * reference operator* returns, weightedIterator.h:207-209).
   */
  derefAssign(value: V): void {
    Vdf_DerefAssignUnderlying(this._iterator, value,
      'VdfWeightedIterator::operator* (weightedIterator.h:207)')
  }

  /** Returns true if the iterator is done iterating (weightedIterator.h:213-215). */
  isAtEnd(): boolean {
    return this._iterator.isAtEnd()
  }

  /**
   * Returns the current index for the current connection. This method should
   * not generally be used (weightedIterator.h:221-223).
   */
  getCurrentIndex(): number {
    return Vdf_GetIteratorIndex(this._iterator)
  }

  /** Advance the iterator to the end (weightedIterator.h:227-229). */
  advanceToEnd(): void {
    this._iterator.advanceToEnd()
  }

  /**
   * Returns the weight at the current element. If no weight is explicitly
   * present at the given `slot`, `defWeight` is returned
   * (weightedIterator.h:235-238).
   */
  getWeight(slot = 0, defWeight = 0.0): number {
    return this._getExplicitWeight(slot)[1] ?? defWeight
  }

  /**
   * Returns true if the weight at the current element is explicitly set at
   * `slot` (weightedIterator.h:243-246).
   */
  hasExplicitWeight(slot: number): boolean {
    return this._getExplicitWeight(slot)[0]
  }

  /**
   * Returns a pair (bool, double) indicating whether there is a weight
   * explicitly present at the given `slot` and giving the weight or the given
   * default weight as fallback (weightedIterator.h:503-510).
   */
  getExplicitWeight(slot = 0, defWeight = 0.0): [boolean, number] {
    const [hasExplicitWeight, weight] = this._getExplicitWeight(slot)
    return [hasExplicitWeight, hasExplicitWeight ? weight! : defWeight]
  }

  /** Get the number of weight slots used (weightedIterator.h:258-260). */
  getNumSlots(): number {
    return this._slots.size()
  }

  /** Returns the # of explicit weights for `slot` (weightedIterator.h:264-267). */
  getNumExplicitWeights(slot = 0): number {
    return (slot < this._slots.size())
      ? this._slots.Get(slot).weights!.getSize() : 0
  }

  /** Vdf_GetIteratorIndex (weightedIterator.h:303-305). @internal */
  _getIteratorIndex(): number {
    return Vdf_GetIteratorIndex(this._iterator)
  }

  // The constructors call this shared code upon construction
  // (weightedIterator.h:338-382).
  private _init(context: VdfContext, weightNames: readonly string[]): void {
    // If there's nothing set in the mask, there's no need to go on.
    if (this._iterator.isAtEnd()) {
      return
    }

    // Get the number of slots.
    const numInputs = weightNames.length

    // Reserve storage for the slots, if required.
    if (numInputs > 0) {
      this._slots.allocate(numInputs)
    }

    // Add all the weights inputs.
    const node = this._getNode(context)
    for (let i = 0; i < numInputs; ++i) {
      const name = weightNames[i]!
      const input = node.getInput(name)
      if (!input) {
        TF_CODING_ERROR(`Can't find input '${name}' on node ${node.getDebugName()}`)
      }

      this._addWeightsInput(this._slots.Get(i), input, context)
    }

    // No inputs.
    if (numInputs === 0) {
      TF_CODING_ERROR('Weighted Iterator instantiated with no weights.')
      return
    }

    // By here, *_iterator has been initialized with the first set mask. What
    // we'd like to do is advance it to the next index such that we have both
    // an explicit weight and a set element in the mask.
    this._advanceIterator()
  }

  // Extracts weighted data from weightInput and adds it to our vector of
  // weight vectors (weightedIterator.h:384-393 and 415-447).
  private _addWeightsInput(
    slot: Vdf_WeightSlot,
    weightInput: VdfInput | null,
    context: VdfContext,
  ): void {
    // We always expect exactly one input connection.
    if (weightInput && weightInput.getNumConnections() === 1) {
      const connection = weightInput.getConnections()[0]!
      const out = this._getRequiredInputValue(context, connection, connection.GetMask())

      // We always expect exactly one element.
      if (out.getSize() === 1) {
        // Note that here we hold on to the executor's value because we don't
        // want to copy the vector of weights. It is okay to hold on to it only
        // because the lifetime of this iterator is limited.
        slot.weights = out.getReadAccessor<VdfIndexedWeights>(VdfIndexedWeightsType).Get(0)
        slot.currentIndex = 0
        return
      }

      TF_CODING_ERROR(
        `Weight input must have exactly one element (got ${out.getSize()})`)
    } else if (weightInput && weightInput.getNumConnections() > 1) {
      // This is an error, all weight connectors must have exactly one input.
      TF_CODING_ERROR(
        `Weight connector must have at most one input (got ${weightInput.getNumConnections()})`)
    }

    // Not exactly one input connection and data element.
    slot.weights = null
    slot.currentIndex = 0
  }

  // Returns [true, weight] if the weight is explicitly set for this slot,
  // otherwise [false, undefined] (weightedIterator.h:512-531). The double out
  // parameter becomes the second tuple element.
  private _getExplicitWeight(slot: number): [boolean, number | undefined] {
    if (slot < this._slots.size()) {
      const p = this._slots.Get(slot)
      if (p.weights &&
        p.currentIndex < p.weights.getSize() &&
        p.weights.getIndex(p.currentIndex) === Vdf_GetIteratorIndex(this._iterator)) {
        return [true, p.weights.getData(p.currentIndex)]
      }
    }
    return [false, undefined]
  }

  // Advances the current _iterator to the first index where we have both a
  // weight explicitly set and an element set in the mask
  // (weightedIterator.h:415-468).
  private _advanceIterator(): void {
    while (!this._iterator.isAtEnd()) {
      // Find the next index that has an explicit weight after currentIndex.
      const currentIndex = Vdf_GetIteratorIndex(this._iterator)
      const nextExplicitIndex = this._slots.advanceToNextExplicitIndex(currentIndex)

      // If there are no more explicit weights, we're done.
      if (nextExplicitIndex === _INT_MAX) {
        // We're done iterating, set _iterator to end().
        this._iterator.advanceToEnd()
        break
      } else if (nextExplicitIndex !== currentIndex) {
        // In this case the next explicit weight was further along than our
        // iterator. So let's try to advance the iterator.
        while (!this._iterator.isAtEnd() &&
          Vdf_GetIteratorIndex(this._iterator) < nextExplicitIndex) {
          this._iterator.increment()
        }

        if (this._iterator.isAtEnd() ||
          Vdf_GetIteratorIndex(this._iterator) === nextExplicitIndex) {
          // Great! Both the iterator and the next explicit weights have a
          // value, or we have reached the end of iterator. We're done.
          break
        }

        // If we get here, the iterator did not visit an element at the
        // explicit index, and we have now advanced it beyond the explicit
        // index. Let's retry at the current index.
      } else {
        // There is a next explicit weight at our current iterator index.
        // We're done.
        break
      }
    }
  }
}
