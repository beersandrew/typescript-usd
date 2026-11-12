// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Boxed.cpp,
//  pxr/exec/vdf/vectorImpl_Boxed.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Boxed.h and
// vectorImpl_Boxed.cpp.
//
// Implements a Vdf_VectorData storage that holds a boxed element
// (vectorImpl_Boxed.h:22-134). The explicit instantiations in
// vectorImpl_Boxed.cpp are a build-time device.

import type { Type as TfType, TfCompressedBits } from 'typescript-usd/tf'
import type { Vdf_BoxedContainer } from './boxedContainer.ts'
import { VdfEstimateSize } from './estimateSize.ts'
import type { VdfMask } from './mask.ts'
import {
  Vdf_VectorData, Vdf_VectorDataInfo, Vdf_VectorDataInfoLayout, type Vdf_VectorDataDataHolder,
} from './vectorData.ts'
import { Vdf_VectorDataTyped } from './vectorDataTyped.ts'
import { Vdf_VectorImplEmpty } from './vectorImpl_Empty.ts'

// sizeof(Vdf_BoxedContainer<T>) and sizeof(Vdf_BoxedRanges::Range) in the
// native build (macOS arm64). The container is a TfSmallVector<T, N> whose
// local capacity N is chosen not to grow it (boxedContainer.h:94-104), plus
// Vdf_BoxedRanges (a TfSmallVector<Range, 1>): 32 bytes for every T. A Range
// is two unsigned ints.
const _SIZEOF_BOXED_CONTAINER = 32
const _SIZEOF_BOXED_RANGES_RANGE = 8

/** Vdf_VectorImplBoxed (vectorImpl_Boxed.h:22-134). */
export class Vdf_VectorImplBoxed<T> extends Vdf_VectorDataTyped<T> {
  _box: Vdf_BoxedContainer<T>

  /**
   * vectorImpl_Boxed.h:27-33: holds `box`. The caller passes a box it owns:
   * a copy (`box.Clone()`) where upstream copies, or a moved-out box
   * (`box.MoveOut()`) where upstream moves.
   */
  constructor(type: TfType, box: Vdf_BoxedContainer<T>) {
    super(type)
    this._box = box
  }

  // vectorImpl_Boxed.h:43-47 (the move constructor, :39-41)
  override moveInto(destData: Vdf_VectorDataDataHolder): void {
    const moved = new Vdf_VectorImplBoxed<T>(this._type, this._box.moveOut())
    destData.destroy()
    destData.new(moved)
  }

  // vectorImpl_Boxed.h:49-53 (the copy constructor, :35-37)
  override Clone(destData: Vdf_VectorDataDataHolder): void {
    const copy = new Vdf_VectorImplBoxed<T>(this._type, this._box.Clone())
    destData.destroy()
    destData.new(copy)
  }

  // vectorImpl_Boxed.h:55-60: we only have one element, not much point in
  // looking at the mask.
  override cloneSubset(_mask: VdfMask, destData: Vdf_VectorDataDataHolder): void {
    this.Clone(destData)
  }

  // vectorImpl_Boxed.h:62-73
  override box(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    if (bits.getSize() === 1 && bits.areAllSet()) {
      const copy = new Vdf_VectorImplBoxed<T>(this._type, this._box.Clone())
      destData.destroy()
      destData.new(copy)
    } else {
      destData.destroy()
      destData.new(new Vdf_VectorImplEmpty<T>(this._type, 1))
    }
  }

  // vectorImpl_Boxed.h:75-81
  override merge(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    if (bits.areAllSet()) {
      this.Clone(destData)
    }
  }

  /**
   * The size of a boxed vector is always 1, the size of the mask used to
   * represent data held in a boxed vector (vectorImpl_Boxed.h:83-87).
   */
  override getSize(): number {
    return 1
  }

  /** 0 if the box is empty, else 1 (vectorImpl_Boxed.h:89-96). */
  override getNumStoredElements(): number {
    return this._box.empty() ? 0 : 1
  }

  // vectorImpl_Boxed.h:98-101
  override isSharable(): boolean {
    return this._box.size() >= Vdf_VectorData._VectorSharingSize
  }

  /**
   * For boxed impls, the "element" is a Vdf_BoxedContainer<T> that may hold
   * many Ts (vectorImpl_Boxed.h:103-120).
   */
  override estimateElementMemory(): number {
    // VdfEstimateSize(_box) is sizeof(Vdf_BoxedContainer<T>).
    let elementSize = _SIZEOF_BOXED_CONTAINER
    if (!this._box.empty()) {
      elementSize +=
        VdfEstimateSize(this._type, this._box.Get(0)) * this._box.size() +
        _SIZEOF_BOXED_RANGES_RANGE * this._box.getRanges().getNumRanges()
    }
    return elementSize
  }

  // vectorImpl_Boxed.h:122-131
  override getInfo(): Vdf_VectorDataInfo {
    return new Vdf_VectorDataInfo(
      /* data = */ this._box as Vdf_BoxedContainer<unknown>,
      /* size = */ 1,
      /* first = */ 0,
      /* last = */ 0,
      /* compressedIndexMapping = */ null,
      /* layout = */ Vdf_VectorDataInfoLayout.Boxed)
  }
}
