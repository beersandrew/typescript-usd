// Ported from OpenUSD 26.11.1: pxr/exec/vdf/iterators.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/iterators.h.
//
// The template aliases become classes whose constructors take the template
// arguments first (the value TfType, then the mask mode), followed by
// upstream's constructor arguments. The mask mode's template default
// (VisitSet) cannot be expressed before the following arguments, so it is
// passed explicitly.

import type { Type as TfType } from 'typescript-usd/tf'

import type { VdfContext } from './context.ts'
import type { VdfMask } from './mask.ts'
import { VdfMaskedIterator, type VdfMaskedIteratorMode } from './maskedIterator.ts'
import { VdfReadIterator } from './readIterator.ts'
import { VdfReadWriteIterator } from './readWriteIterator.ts'
import { VdfWeightedIterator } from './weightedIterator.ts'

/**
 * `VdfMaskedReadIterator<T, maskMode> =
 * VdfMaskedIterator<VdfReadIterator<T>, maskMode>` (iterators.h:28-32).
 */
export class VdfMaskedReadIterator<T> extends VdfMaskedIterator<T, VdfReadIterator<T>> {
  constructor(
    type: TfType,
    maskMode: VdfMaskedIteratorMode,
    context: VdfContext,
    visitMask: VdfMask,
    inputName: string,
  ) {
    super(maskMode, context, visitMask, new VdfReadIterator<T>(type, context, inputName))
  }
}

/**
 * `VdfMaskedReadWriteIterator<T, maskMode> =
 * VdfMaskedIterator<VdfReadWriteIterator<T>, maskMode>` (iterators.h:34-38).
 */
export class VdfMaskedReadWriteIterator<T> extends VdfMaskedIterator<T, VdfReadWriteIterator<T>> {
  constructor(
    type: TfType,
    maskMode: VdfMaskedIteratorMode,
    context: VdfContext,
    visitMask: VdfMask,
    name?: string,
  ) {
    super(maskMode, context, visitMask, new VdfReadWriteIterator<T>(type, context, name))
  }
}

/**
 * `VdfWeightedReadIterator<T> = VdfWeightedIterator<VdfReadIterator<T>>`
 * (iterators.h:44-46).
 */
export class VdfWeightedReadIterator<T> extends VdfWeightedIterator<T, VdfReadIterator<T>> {
  constructor(
    type: TfType,
    context: VdfContext,
    weightNames: string | readonly string[],
    inputName: string,
  ) {
    super(context, weightNames, new VdfReadIterator<T>(type, context, inputName))
  }
}

/**
 * `VdfWeightedReadWriteIterator<T> =
 * VdfWeightedIterator<VdfReadWriteIterator<T>>` (iterators.h:48-50).
 */
export class VdfWeightedReadWriteIterator<T> extends VdfWeightedIterator<T, VdfReadWriteIterator<T>> {
  constructor(
    type: TfType,
    context: VdfContext,
    weightNames: string | readonly string[],
    name?: string,
  ) {
    super(context, weightNames, new VdfReadWriteIterator<T>(type, context, name))
  }
}

/**
 * `VdfWeightedMaskedReadIterator<T, maskMode> =
 * VdfWeightedIterator<VdfMaskedReadIterator<T, maskMode>>`
 * (iterators.h:52-56).
 */
export class VdfWeightedMaskedReadIterator<T>
  extends VdfWeightedIterator<T, VdfMaskedReadIterator<T>> {
  constructor(
    type: TfType,
    maskMode: VdfMaskedIteratorMode,
    context: VdfContext,
    weightNames: string | readonly string[],
    visitMask: VdfMask,
    inputName: string,
  ) {
    super(context, weightNames,
      new VdfMaskedReadIterator<T>(type, maskMode, context, visitMask, inputName))
  }
}

/**
 * `VdfWeightedMaskedReadWriteIterator<T, maskMode> =
 * VdfWeightedIterator<VdfMaskedReadWriteIterator<T, maskMode>>`
 * (iterators.h:58-62).
 */
export class VdfWeightedMaskedReadWriteIterator<T>
  extends VdfWeightedIterator<T, VdfMaskedReadWriteIterator<T>> {
  constructor(
    type: TfType,
    maskMode: VdfMaskedIteratorMode,
    context: VdfContext,
    weightNames: string | readonly string[],
    visitMask: VdfMask,
    name?: string,
  ) {
    super(context, weightNames,
      new VdfMaskedReadWriteIterator<T>(type, maskMode, context, visitMask, name))
  }
}
