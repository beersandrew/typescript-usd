// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorDataTyped.cpp,
//  pxr/exec/vdf/vectorDataTyped.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorDataTyped.h and
// vectorDataTyped.cpp.
//
// Vdf_VectorDataTyped<TYPE> implements the Vdf_VectorData methods that are
// the same for all impls of one element type (vectorDataTyped.h:24-69). TYPE
// is the TfType constructor argument (openexec-x1.md 4.1). The explicit
// template instantiations for VDF_FOR_EACH_COMMON_TYPE
// (vectorDataTyped.h:71-76, vectorDataTyped.cpp) are a build-time device.
//
// Upstream's header forward-declares the Empty, Single and Contiguous impls,
// which derive from this class. ES modules cannot import a subclass before
// its base is defined, so those impl modules register their constructors
// here when they load (vectorImpl_Empty.ts, vectorImpl_Single.ts,
// vectorImpl_Contiguous.ts; vector.ts loads all of them).

import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'
import { Vdf_GetSizeof } from './estimateSize.ts'
import { Vdf_VectorData, type Vdf_VectorDataDataHolder } from './vectorData.ts'

interface _ImplConstructors {
  Empty?: (type: TfType, size: number) => Vdf_VectorData
  Single?: (type: TfType) => Vdf_VectorData
  Sparse?: (type: TfType, size: number, first: number, last: number) => Vdf_VectorData
  Dense?: (type: TfType, size: number) => Vdf_VectorData
}

const _impls: _ImplConstructors = {}

/** Registers a typed impl constructor; called by the impl modules at load. */
export function Vdf_VectorDataTyped_RegisterImpl<K extends keyof _ImplConstructors>(
  kind: K, ctor: NonNullable<_ImplConstructors[K]>): void {
  _impls[kind] = ctor
}

function _Impl<K extends keyof _ImplConstructors>(kind: K): NonNullable<_ImplConstructors[K]> {
  const ctor = _impls[kind]
  if (!ctor) {
    TF_CODING_ERROR(`Vdf_VectorDataTyped: the ${kind} vector impl module is not loaded`)
    throw new Error(`Vdf_VectorDataTyped: the ${kind} vector impl module is not loaded`)
  }
  return ctor as NonNullable<_ImplConstructors[K]>
}

/** Vdf_VectorDataTyped (vectorDataTyped.h:24-69). */
export abstract class Vdf_VectorDataTyped<T> extends Vdf_VectorData {
  readonly _type: TfType

  constructor(type: TfType) {
    super()
    this._type = type
  }

  /** The element type (vectorDataTyped.h:28-31). */
  override getTypeInfo(): TfType {
    return this._type
  }

  // vectorDataTyped.h:33-37
  override newEmpty(size: number, destData: Vdf_VectorDataDataHolder): void {
    destData.new(_Impl('Empty')(this._type, size))
  }

  // vectorDataTyped.h:39-42
  override newSingle(destData: Vdf_VectorDataDataHolder): void {
    destData.new(_Impl('Single')(this._type))
  }

  // vectorDataTyped.h:44-50
  override newSparse(
    size: number, first: number, last: number, destData: Vdf_VectorDataDataHolder): void {
    destData.new(_Impl('Sparse')(this._type, size, first, last))
  }

  // vectorDataTyped.h:52-56
  override newDense(size: number, destData: Vdf_VectorDataDataHolder): void {
    destData.new(_Impl('Dense')(this._type, size))
  }

  /**
   * We estimate the size of the element based on the type only
   * (vectorDataTyped.h:58-64): sizeof(TYPE).
   */
  override estimateElementMemory(): number {
    return Vdf_GetSizeof(this._type)
  }

  /** Phantom use of T so that subclasses keep their element type. */
  declare readonly _elementType?: T
}
