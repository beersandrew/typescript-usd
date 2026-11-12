// Ported from OpenUSD 26.11.1: pxr/exec/exec/cacheView.cpp,
//  pxr/exec/exec/cacheView.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/cacheView.h and cacheView.cpp.
//
// Exec_CacheView is move-only upstream; the TS move constructor is
// Exec_CacheView.Move(other), which invalidates `other`. TfSpans are readonly
// arrays that alias the request's arrays, as the spans do upstream.

import { TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'

import { VdfDataManagerFacade } from 'typescript-usd/vdf'
import type { VdfExecutorInterface } from 'typescript-usd/vdf'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'

import type { Exec_ValueExtractor } from './valueExtractor.ts'

/**
 * A view into values cached by ExecSystem (cacheView.h:27-82).
 *
 * Cache views must not outlive the ExecSystem or request from which they were
 * built.
 */
export class Exec_CacheView {
  private _dataManager: VdfDataManagerFacade | null = null
  private _outputs: readonly VdfMaskedOutput[]
  private _extractors: readonly Exec_ValueExtractor[]
  private _executor: VdfExecutorInterface | null = null

  /** Constructs an invalid cache view (cacheView.h:36-37). */
  constructor()
  /**
   * @internal Constructs a cache view that extracts computed values from
   * `dataManager` (cacheView.cpp:29-42). Only Exec_RequestImpl constructs
   * these.
   */
  constructor(
    dataManager: VdfDataManagerFacade,
    outputs: readonly VdfMaskedOutput[],
    extractors: readonly Exec_ValueExtractor[])
  /**
   * @internal Constructs a cache view that assumes ownership of an
   * `executor`, so that it remains valid while computed values are extracted
   * from it (cacheView.cpp:44-51).
   */
  constructor(
    executor: VdfExecutorInterface,
    outputs: readonly VdfMaskedOutput[],
    extractors: readonly Exec_ValueExtractor[])
  constructor(
    source?: VdfDataManagerFacade | VdfExecutorInterface,
    outputs: readonly VdfMaskedOutput[] = [],
    extractors: readonly Exec_ValueExtractor[] = [],
  ) {
    this._outputs = outputs
    this._extractors = extractors
    if (source === undefined) {
      return
    }

    if (source instanceof VdfDataManagerFacade) {
      // Set the view to an invalid state if the outputs and extractors don't
      // line up.
      this._dataManager = TF_VERIFY(outputs.length === extractors.length,
        'outputs.size() == extractors.size()')
        ? source
        : null
      return
    }

    const executor = source
    this._dataManager = TF_VERIFY(outputs.length === extractors.length,
      'outputs.size() == extractors.size()')
      ? new VdfDataManagerFacade(executor)
      : null
    this._executor = executor
  }

  /**
   * Constructs a cache view from another (cacheView.cpp:20-27). The other
   * cache view becomes invalid.
   */
  static move(other: Exec_CacheView): Exec_CacheView {
    const view = new Exec_CacheView()
    view._dataManager = other._dataManager
    view._outputs = other._outputs
    view._extractors = other._extractors
    view._executor = other._executor
    other._executor = null
    other._dataManager = null
    return view
  }

  /**
   * Returns the computed value for the provided extraction `index`
   * (cacheView.cpp:55-86). Emits an error and returns an empty value if the
   * `index` is not evaluated.
   */
  Get(index: number): VtValue {
    if (!this._dataManager) {
      TF_CODING_ERROR('Cannot extract from invalid view')
      return VtValue.getEmpty()
    }

    if (!(0 <= index && index < this._outputs.length)) {
      TF_CODING_ERROR(`Index '${index}' out of range`)
      return VtValue.getEmpty()
    }

    const mo = this._outputs[index]!

    // It is allowed for computed values to be empty. This can happen if a leaf
    // node could not be created, because it depends on a cycle.
    if (!mo.asBool()) {
      return VtValue.getEmpty()
    }

    const v = this._dataManager.getOutputValue(mo.GetOutput()!, mo.GetMask())
    if (!v) {
      TF_CODING_ERROR(
        `No value cached for output '${mo.getDebugName()}' (index=${index})`)
      return VtValue.getEmpty()
    }

    const extractor = this._extractors[index]!
    return extractor.call(v, mo.GetMask())
  }
}
