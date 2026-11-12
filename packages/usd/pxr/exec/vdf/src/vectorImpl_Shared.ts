// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorImpl_Shared.cpp,
//  pxr/exec/vdf/vectorImpl_Shared.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorImpl_Shared.h and
// vectorImpl_Shared.cpp.
//
// Implements a Vdf_VectorData storage that supports reference counted
// sharing of other vector implementations (vectorImpl_Shared.h:20-202).
//
// Reference counting (openexec-x1.md section 4, convention 8): the
// _SharedSource count is incremented by each Vdf_VectorImplShared that holds
// it and decremented when the holder destroys that impl (Destroy() on the
// DataHolder runs _Destruct). A VdfVector that is garbage collected without
// replacing its data never releases its reference, so Detach may copy where
// upstream would take ownership of the last reference (vectorImpl_Shared.cpp:
// 163-175). Both paths leave the detached vector holding the same values,
// unshared. Memory release on the count reaching zero is GC.

import { type Type as TfType, type TfCompressedBits, TF_CODING_ERROR, TF_DEV_AXIOM } from 'typescript-usd/tf'
import { _ArrayForeignDataSource as Vt_ArrayForeignDataSource } from 'typescript-usd/vt'
import type { VdfMask } from './mask.ts'
import {
  Vdf_NewDataHolder, Vdf_VectorData, Vdf_VectorDataInfo, Vdf_VectorDataInfoOwnership,
  type Vdf_VectorDataDataHolder,
} from './vectorData.ts'

/**
 * Vdf_VectorImplShared::_SharedSource: a foreign data source for VtArray that shares in the lifetime of the held
 * DataHolder (vectorImpl_Shared.h:165-199, vectorImpl_Shared.cpp:15-38).
 */
export class Vdf_VectorImplShared_SharedSource extends Vt_ArrayForeignDataSource {
  readonly _data: Vdf_VectorDataDataHolder = Vdf_NewDataHolder()
  _refCount = 0

  // vectorImpl_Shared.cpp:15-23: move the data into the local DataHolder.
  // MoveInto expects a valid destination, so an empty impl is created first.
  constructor(srcData: Vdf_VectorDataDataHolder) {
    super((selfBase) => Vdf_VectorImplShared_SharedSource._detached(selfBase))
    srcData.Get().newEmpty(0, this._data)
    srcData.Get().moveInto(this._data)
  }

  /** Return the held DataHolder for use in detachment (vectorImpl_Shared.h:171-174). */
  getHolder(): Vdf_VectorDataDataHolder {
    return this._data
  }

  /** True if there is only one outstanding reference (vectorImpl_Shared.h:176-180). */
  isUnique(): boolean {
    return this._refCount === 1
  }

  // vectorImpl_Shared.cpp:30-36
  static _detached(selfBase: Vt_ArrayForeignDataSource): void {
    const self = selfBase as Vdf_VectorImplShared_SharedSource
    TF_DEV_AXIOM(self._refCount === 0, '_refCount.load() == 0')
  }
}

/** Vdf_VectorImplShared (vectorImpl_Shared.h:20-202). */
export class Vdf_VectorImplShared extends Vdf_VectorData {
  _source: Vdf_VectorImplShared_SharedSource | null

  /**
   * Shares the data held by `srcData`, which is moved into a new shared
   * source (vectorImpl_Shared.cpp:38-43). The copy constructor (:45-49) is
   * _Copy.
   */
  constructor(srcData: Vdf_VectorDataDataHolder)
  constructor(source: Vdf_VectorImplShared_SharedSource)
  constructor(arg: Vdf_VectorDataDataHolder | Vdf_VectorImplShared_SharedSource) {
    super()
    // _SharedSource is constructed with ref-count 0, so increment to 1.
    this._source = arg instanceof Vdf_VectorImplShared_SharedSource ? arg : new Vdf_VectorImplShared_SharedSource(arg)
    this._source._refCount++
  }

  /** The copy constructor (vectorImpl_Shared.cpp:45-49): shares the source. */
  static _copy(o: Vdf_VectorImplShared): Vdf_VectorImplShared {
    return new Vdf_VectorImplShared(o._source!)
  }

  /** The move constructor (vectorImpl_Shared.cpp:51-55). */
  static _move(o: Vdf_VectorImplShared): Vdf_VectorImplShared {
    const moved = new Vdf_VectorImplShared(o._source!)
    // The moved reference is transferred, not added.
    o._source!._refCount--
    o._source = null
    return moved
  }

  /** The destructor releases this impl's reference (vectorImpl_Shared.cpp:57). */
  override _destruct(): void {
    if (this._source) {
      this._source._refCount--
      this._source = null
    }
  }

  #Held(): Vdf_VectorData {
    return this._source!.getHolder().Get()
  }

  // vectorImpl_Shared.cpp:59-62
  override getTypeInfo(): TfType {
    return this.#Held().getTypeInfo()
  }

  // vectorImpl_Shared.cpp:64-67
  override newEmpty(size: number, destData: Vdf_VectorDataDataHolder): void {
    this.#Held().newEmpty(size, destData)
  }

  // vectorImpl_Shared.cpp:69-72
  override newSingle(destData: Vdf_VectorDataDataHolder): void {
    this.#Held().newSingle(destData)
  }

  // vectorImpl_Shared.cpp:74-78
  override newSparse(
    size: number, first: number, last: number, destData: Vdf_VectorDataDataHolder): void {
    this.#Held().newSparse(size, first, last, destData)
  }

  // vectorImpl_Shared.cpp:80-83
  override newDense(size: number, destData: Vdf_VectorDataDataHolder): void {
    this.#Held().newDense(size, destData)
  }

  // vectorImpl_Shared.cpp:85-90
  override moveInto(destData: Vdf_VectorDataDataHolder): void {
    const moved = Vdf_VectorImplShared._move(this)
    destData.destroy()
    destData.new(moved)
  }

  // vectorImpl_Shared.cpp:92-97: causes the reference count to increase.
  override Clone(destData: Vdf_VectorDataDataHolder): void {
    const copy = Vdf_VectorImplShared._copy(this)
    destData.destroy()
    destData.new(copy)
  }

  // vectorImpl_Shared.cpp:99-103: does not cause the count to increase.
  override cloneSubset(mask: VdfMask, destData: Vdf_VectorDataDataHolder): void {
    this.#Held().cloneSubset(mask, destData)
  }

  // vectorImpl_Shared.cpp:105-109
  override box(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    this.#Held().box(bits, destData)
  }

  // vectorImpl_Shared.cpp:111-115
  override merge(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void {
    this.#Held().merge(bits, destData)
  }

  // vectorImpl_Shared.cpp:117-120
  override Expand(_first: number, _last: number): void {
    TF_CODING_ERROR('Cannot mutate shared data without detaching.')
  }

  // vectorImpl_Shared.cpp:122-125
  override getSize(): number {
    return this.#Held().getSize()
  }

  // vectorImpl_Shared.cpp:127-130
  override getNumStoredElements(): number {
    return this.#Held().getNumStoredElements()
  }

  // vectorImpl_Shared.cpp:132-135
  override getSharedSource(): Vt_ArrayForeignDataSource | null {
    return this._source
  }

  // vectorImpl_Shared.cpp:137-150
  override getInfo(): Vdf_VectorDataInfo {
    const sourceInfo = this.#Held().getInfo()
    return new Vdf_VectorDataInfo(
      sourceInfo.data,
      sourceInfo.size,
      sourceInfo.first,
      sourceInfo.last,
      sourceInfo.compressedIndexMapping,
      sourceInfo.layout,
      Vdf_VectorDataInfoOwnership.Shared)
  }

  // vectorImpl_Shared.cpp:152-155
  override estimateElementMemory(): number {
    return this.#Held().estimateElementMemory()
  }

  /**
   * Detaches `data` from its shared source data (vectorImpl_Shared.cpp:157-
   * 177). The caller ensures that `data` is holding a Vdf_VectorImplShared.
   */
  static detach(data: Vdf_VectorDataDataHolder): void {
    TF_DEV_AXIOM(
      data.Get().getInfo().ownership === Vdf_VectorDataInfoOwnership.Shared,
      'data && data->Get()->GetInfo().ownership == Vdf_VectorData::Info::Ownership::Shared')

    const impl = data.Get() as Vdf_VectorImplShared

    // `data` holds the source impl and is the destination of the new detached
    // impl. Transfer ownership of the shared source to the stack first.
    const source = impl._source!
    impl._source = null

    if (source.isUnique()) {
      // We are detaching with the last ref count, have data take ownership
      // directly rather than copying.
      source.getHolder().Get().moveInto(data)
    } else {
      source.getHolder().Get().Clone(data)
    }
    // The stack reference is released.
    source._refCount--
  }
}
