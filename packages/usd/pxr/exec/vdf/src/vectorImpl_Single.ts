// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Single.cpp,
//  pxr/exec/vdf/vectorImpl_Single.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Single.h and
// vectorImpl_Single.cpp.
//
// Implements a Vdf_VectorData storage that holds a single element
// (vectorImpl_Single.h:24-131). The explicit instantiations in
// vectorImpl_Single.cpp are a build-time device.

import { TF_VERIFY, type Type as TfType, type TfCompressedBits } from 'typescript-usd/tf'
import { Vdf_DefaultInitAllocator } from './defaultInitAllocator.ts'
import { VdfEstimateSize } from './estimateSize.ts'
import { Vdf_FixedSizeHolder } from './fixedSizeHolder.ts'
import type { VdfMask } from './mask.ts'
import { Vdf_VectorDataInfo, type Vdf_VectorDataDataHolder } from './vectorData.ts'
import { Vdf_VectorDataTyped, Vdf_VectorDataTyped_RegisterImpl } from './vectorDataTyped.ts'
import { Vdf_VectorImplEmpty } from './vectorImpl_Empty.ts'

/** Vdf_VectorImplSingle (vectorImpl_Single.h:24-131). */
export class Vdf_VectorImplSingle<T> extends Vdf_VectorDataTyped<T> {
  _data: Vdf_FixedSizeHolder<T>

  /**
   * vectorImpl_Single.h:33-41: default constructs the element, or holds
   * `value` (the copy and move constructors from a value; callers pass the
   * value they own).
   */
  constructor(type: TfType, ...value: [] | [T]) {
    super(type)
    this._data = new Vdf_FixedSizeHolder<T>(
      value.length === 0 ? new Vdf_DefaultInitAllocator<T>(type).construct() : value[0])
  }

  /** The copy constructor (vectorImpl_Single.h:43-45). */
  static _copy<T>(rhs: Vdf_VectorImplSingle<T>): Vdf_VectorImplSingle<T> {
    const copy = new Vdf_VectorImplSingle<T>(rhs._type, rhs._data.Get())
    copy._data = rhs._data.Clone()
    return copy
  }

  // vectorImpl_Single.h:53-57: the move constructor takes the held value.
  override moveInto(destData: Vdf_VectorDataDataHolder): void {
    const moved = new Vdf_VectorImplSingle<T>(this._type, this._data.Get())
    destData.destroy()
    destData.new(moved)
  }

  // vectorImpl_Single.h:59-69
  override Clone(destData: Vdf_VectorDataDataHolder): void {
    const copy = Vdf_VectorImplSingle._copy(this)
    destData.destroy()
    destData.new(copy)
  }

  // vectorImpl_Single.h:71-76: we only have one element, not much point in
  // looking at the mask.
  override cloneSubset(_mask: VdfMask, destData: Vdf_VectorDataDataHolder): void {
    this.Clone(destData)
  }

  // vectorImpl_Single.h:78-93
  override box(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    // We should never box single values.
    TF_VERIFY(false, 'false', 'Attempted to box single-element vector')
    if (bits.getSize() === 1 && bits.areAllSet()) {
      const copy = Vdf_VectorImplSingle._copy(this)
      destData.destroy()
      destData.new(copy)
    } else {
      destData.destroy()
      destData.new(new Vdf_VectorImplEmpty<T>(this._type, 1))
    }
  }

  // vectorImpl_Single.h:95-101
  override merge(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    if (bits.areAllSet()) {
      this.Clone(destData)
    }
  }

  // vectorImpl_Single.h:103-106
  override getSize(): number {
    return 1
  }

  // vectorImpl_Single.h:108-111
  override getNumStoredElements(): number {
    return 1
  }

  // vectorImpl_Single.h:113-118: clients may overload VdfEstimateSize to
  // provide a more accurate estimate based on the held value.
  override estimateElementMemory(): number {
    return VdfEstimateSize(this._type, this._data.Get())
  }

  // vectorImpl_Single.h:120-125
  override getInfo(): Vdf_VectorDataInfo {
    return new Vdf_VectorDataInfo(
      /* data = */ this._data.getMutable(),
      /* size = */ 1)
  }
}

Vdf_VectorDataTyped_RegisterImpl('Single', (type) => new Vdf_VectorImplSingle(type))
