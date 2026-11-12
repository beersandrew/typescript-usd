// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Empty.cpp,
//  pxr/exec/vdf/vectorImpl_Empty.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Empty.h and
// vectorImpl_Empty.cpp.
//
// Implements a Vdf_VectorData storage that is always empty
// (vectorImpl_Empty.h:19-91). It is typed because VdfVector always needs to
// know the type, which it gets from its Vdf_VectorData. The explicit
// instantiations in vectorImpl_Empty.cpp are a build-time device.

import type { Type as TfType, TfCompressedBits } from 'typescript-usd/tf'
import type { VdfMask } from './mask.ts'
import { Vdf_VectorDataInfo, type Vdf_VectorDataDataHolder } from './vectorData.ts'
import { Vdf_VectorDataTyped, Vdf_VectorDataTyped_RegisterImpl } from './vectorDataTyped.ts'

/** Vdf_VectorImplEmpty (vectorImpl_Empty.h:19-91). */
export class Vdf_VectorImplEmpty<T> extends Vdf_VectorDataTyped<T> {
  _size: number

  /** vectorImpl_Empty.h:29-31; the copy constructor (:33-36) is Clone. */
  constructor(type: TfType, size: number) {
    super(type)
    this._size = size
  }

  // vectorImpl_Empty.h:38-42
  override moveInto(destData: Vdf_VectorDataDataHolder): void {
    destData.destroy()
    destData.new(new Vdf_VectorImplEmpty<T>(this._type, this._size))
  }

  // vectorImpl_Empty.h:44-48
  override Clone(destData: Vdf_VectorDataDataHolder): void {
    destData.destroy()
    destData.new(new Vdf_VectorImplEmpty<T>(this._type, this._size))
  }

  // vectorImpl_Empty.h:50-54
  override cloneSubset(_mask: VdfMask, destData: Vdf_VectorDataDataHolder): void {
    this.Clone(destData)
  }

  // vectorImpl_Empty.h:56-61
  override box(_bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    destData.destroy()
    destData.new(new Vdf_VectorImplEmpty<T>(this._type, this._size))
  }

  // vectorImpl_Empty.h:63-67: nothing to do here.
  override merge(_bits: TfCompressedBits, _destData: Vdf_VectorDataDataHolder): void {}

  // vectorImpl_Empty.h:69-72
  override getSize(): number {
    return this._size
  }

  // vectorImpl_Empty.h:74-77
  override getNumStoredElements(): number {
    return 0
  }

  // vectorImpl_Empty.h:79-84
  override getInfo(): Vdf_VectorDataInfo {
    return new Vdf_VectorDataInfo(/* data = */ null, /* size = */ this._size)
  }
}

Vdf_VectorDataTyped_RegisterImpl('Empty', (type, size) => new Vdf_VectorImplEmpty(type, size))
