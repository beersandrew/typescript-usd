// Ported from OpenUSD 26.11.1: pxr/exec/ef/inputValueBlock.cpp,
//  pxr/exec/ef/inputValueBlock.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/inputValueBlock.h and
// pxr/exec/ef/inputValueBlock.cpp.

import { TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'

import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfMaskedOutputVector } from 'typescript-usd/vdf'
import { VdfTypedVector } from 'typescript-usd/vdf'
import { VdfVector } from 'typescript-usd/vdf'

/**
 * EfInputValueBlock (inputValueBlock.h:35-158): a vector of (output, value)
 * pairs, each of which initializes a network before execution.
 */
export class EfInputValueBlock implements Iterable<readonly [VdfMaskedOutput, VdfVector]> {
  // The value pairs that make up this block (inputValueBlock.h:41, 156).
  private _values: Array<readonly [VdfMaskedOutput, VdfVector]> = []

  /**
   * Constructs an empty input value block (inputValueBlock.h:47), or copies
   * `rhs` (inputValueBlock.cpp:16-19).
   */
  constructor(rhs?: EfInputValueBlock) {
    if (rhs) {
      this._append(rhs)
    }
  }

  /** Copy assignment operator (inputValueBlock.cpp:26-36). */
  assign(rhs: EfInputValueBlock): this {
    if (this === rhs) {
      return this
    }

    this._Clear()
    this._append(rhs)
    return this
  }

  /**
   * Adds an (output, value) pair to this block (inputValueBlock.h:77-82).
   * Only single valued outputs are supported. `type` is the template
   * argument T, which C++ deduces from `value`.
   */
  addOutputValuePair<T>(type: TfType, output: VdfMaskedOutput, value: T): void {
    const vector = new VdfTypedVector<T>(type)
    this._values.push([output, vector])
    vector.Set(value)
  }

  /** Adds an (output, VdfVector) pair to this block (inputValueBlock.h:86-90). */
  addOutputVectorPair(output: VdfMaskedOutput, value: VdfVector): void {
    this._values.push([output, new VdfVector(value)])
  }

  /**
   * Applies the block to an executor, setting the output values and pushing
   * through invalidation for each of them (inputValueBlock.cpp:38-61).
   *
   * `invalidationRequest` is an output parameter receiving the request used
   * for invalidation; it is filled when given.
   */
  Apply(
    executor: VdfExecutorInterface | null,
    invalidationRequest: VdfMaskedOutputVector | null = null,
  ): void {
    if (!TF_VERIFY(executor, 'executor') || this._values.length === 0) {
      return
    }

    // First, build the invalidation request. If an invalidationRequest
    // output parameter is set, use it to build the request.
    const theRequest: VdfMaskedOutputVector = invalidationRequest ?? []
    TF_VERIFY(theRequest.length === 0, 'theRequest->empty()')
    for (const [output] of this._values) {
      theRequest.push(output)
    }

    this._invalidate(executor!, theRequest)
    this._setValues(executor!)
  }

  /**
   * Pushes invalidation into the executor using the supplied request, then
   * sets the values (inputValueBlock.cpp:63-76).
   */
  invalidateAndApply(
    executor: VdfExecutorInterface | null,
    invalidationRequest: VdfMaskedOutputVector,
  ): void {
    if (!TF_VERIFY(executor, 'executor') || this._values.length === 0) {
      return
    }

    this._invalidate(executor!, invalidationRequest)
    this._setValues(executor!)
  }

  /** begin()/end() (inputValueBlock.h:114-126). */
  [Symbol.iterator](): Iterator<readonly [VdfMaskedOutput, VdfVector]> {
    return this._values[Symbol.iterator]()
  }

  /** Returns the number of outputs in this block (inputValueBlock.h:130-132). */
  getSize(): number {
    return this._values.length
  }

  // inputValueBlock.cpp:78-89.
  private _invalidate(
    executor: VdfExecutorInterface,
    invalidationRequest: VdfMaskedOutputVector,
  ): void {
    // If the data manager is empty, don't make an expensive call to
    // invalidate values; the first compute sets up the masks anyway.
    if (invalidationRequest.length !== 0 && !executor.IsEmpty()) {
      executor.invalidateValues(invalidationRequest)
    }
  }

  // inputValueBlock.cpp:91-106. The executors never compute the outputs in
  // the block: their output caches are populated here, and the computed
  // output mask set.
  private _setValues(executor: VdfExecutorInterface): void {
    for (const [maskedOutput, value] of this._values) {
      executor.setOutputValue(
        maskedOutput.GetOutput()!, value, maskedOutput.GetMask())
    }
  }

  // inputValueBlock.cpp:108-115.
  private _Clear(): void {
    this._values = []
  }

  // inputValueBlock.cpp:117-124.
  private _append(rhs: EfInputValueBlock): void {
    for (const [output, value] of rhs._values) {
      this._values.push([output, new VdfVector(value)])
    }
  }
}

/** A vector of EfInputValueBlocks (inputValueBlock.h:162). */
export type EfInputValueBlockVector = EfInputValueBlock[]
