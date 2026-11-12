// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vector.cpp, pxr/exec/vdf/vector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vector.h and vector.cpp.
//
// VdfVector abstracts away knowledge of the cache data used for each node
// (vector.h:41-694). Mapping choices (openexec-x1.md 4.1):
// - Element-type template parameters written explicitly by callers are a
//   leading TfType: Resize<T>(type, size), GetReadAccessor<T>(type),
//   GetReadWriteAccessor<T>(type), GetSubrangeAccessor<T>(type),
//   GetIterator<T>(type), Holds(type), ExtractAsVtArray<T>(type, size, offset).
// - Set(data) deduces T from its argument in C++; TS takes `Set(type, data)`,
//   or `Set(data)` with the element type a Vdf_BoxedContainer carries or the
//   vector's held type. Set copies a boxed container; `Set(box.MoveOut())`
//   is the TS form of `Set(std::move(box))`.
// - Copy constructors are `new VdfVector(rhs[, mask[, ConstructBoxedCopy]])`
//   and `new VdfVector(rhs, size)`; the move constructor is
//   VdfVector.Move(rhs); operator= is Assign, operator=(&&) is MoveAssign.
// - ReadAccessor / ReadWriteAccessor `operator[]` is Get(i) / Set(i, v).
// - DebugPrintable's ostream operator is toString().
// - Elements are copied as their C++ copy constructors copy them (see
//   vectorImpl_Dispatch.ts). Elements are values: mutate them only through
//   a ReadWriteAccessor's Set, never in place.

import { TF_CODING_ERROR, TF_VERIFY, TfCompressedBits, type Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray } from 'typescript-usd/vt'
import { Vdf_BoxedContainer } from './boxedContainer.ts'
import type { Vdf_CompressedIndexMapping } from './compressedIndexMapping.ts'
import type { VdfMask } from './mask.ts'
import { Vdf_VectorAccessor } from './vectorAccessor.ts'
import {
  Vdf_NewDataHolder, Vdf_VectorDataInfoLayout, Vdf_VectorDataInfoOwnership,
  type Vdf_VectorData, type Vdf_VectorDataDataHolder, type Vdf_VectorDataInfo,
} from './vectorData.ts'
import { Vdf_VectorImplBoxed } from './vectorImpl_Boxed.ts'
import './vectorImpl_Compressed.ts'
import { Vdf_VectorImplContiguous } from './vectorImpl_Contiguous.ts'
import { Vdf_VectorImplEmpty } from './vectorImpl_Empty.ts'
import { Vdf_VectorImplShared } from './vectorImpl_Shared.ts'
import { Vdf_VectorImplSingle } from './vectorImpl_Single.ts'
import { VdfVectorIterator } from './vectorIterator.ts'
import { Vdf_VectorSubrangeAccessor } from './vectorSubrangeAccessor.ts'

/** VdfVector::ConstructBoxedCopyTag (vector.h:99-101). */
export enum VdfVectorConstructBoxedCopyTag {
  ConstructBoxedCopy,
}

/**
 * A read/write accessor for low-level access to the contents of the
 * VdfVector (vector.h:400-441).
 */
export class VdfVectorReadWriteAccessor<T> {
  // The underlying accessor type.
  readonly _accessor: Vdf_VectorAccessor<T>

  /** Default constructor; only VdfVector passes an accessor (vector.h:405-406, 430-435). */
  constructor(accessor?: Vdf_VectorAccessor<T>) {
    this._accessor = accessor ?? new Vdf_VectorAccessor<T>()
  }

  /** Returns true of the vector is empty (vector.h:408-410). */
  IsEmpty(): boolean { return this._accessor.IsEmpty() }

  /** Returns the number of values the vector holds (vector.h:412-414). */
  getNumValues(): number { return this._accessor.getNumValues() }

  /** Returns true if this accessor accesses a boxed container (vector.h:416-419). */
  isBoxed(): boolean { return this._accessor.isBoxed() }

  /** operator[] read (vector.h:421-423). */
  Get(i: number): T { return this._accessor.Get(i) }

  /** operator[] write (vector.h:421-423). */
  Set(i: number, value: T): void { this._accessor.Set(i, value) }
}

/**
 * A read-only accessor for low-level access to the contents of the
 * VdfVector (vector.h:465-505).
 */
export class VdfVectorReadAccessor<T> {
  // The underlying accessor type.
  readonly _accessor: Vdf_VectorAccessor<T>

  /** Default constructor; only VdfVector passes an accessor (vector.h:470-471, 494-499). */
  constructor(accessor?: Vdf_VectorAccessor<T>) {
    this._accessor = accessor ?? new Vdf_VectorAccessor<T>()
  }

  /** Returns true if the vector is empty (vector.h:473-475). */
  IsEmpty(): boolean { return this._accessor.IsEmpty() }

  /** Returns the number of values the vector holds (vector.h:477-479). */
  getNumValues(): number { return this._accessor.getNumValues() }

  /** Returns true if this accessor accesses a boxed container (vector.h:481-484). */
  isBoxed(): boolean { return this._accessor.isBoxed() }

  /** operator[] (vector.h:486-488). */
  Get(i: number): T { return this._accessor.Get(i) }
}

/**
 * An ostream-able object wrapping a VdfVector's data and a mask of the
 * elements to stream out (vector.h:609-637). Streams with toString().
 */
export class VdfVectorDebugPrintable {
  // The vector to be printed.
  readonly _data: Vdf_VectorData
  // The mask denoting which elements in the vector should be printed.
  readonly _mask: VdfMask

  constructor(data: Vdf_VectorData, mask: VdfMask) {
    this._data = data
    this._mask = mask
  }

  /** operator<< (vector.cpp:24-29). */
  toString(): string {
    return this._data.debugPrint(this._mask)
  }
}

/** VdfVector (vector.h:41-694). */
export class VdfVector {
  static readonly ConstructBoxedCopy = VdfVectorConstructBoxedCopyTag.ConstructBoxedCopy
  static readonly ReadAccessor = VdfVectorReadAccessor
  static readonly ReadWriteAccessor = VdfVectorReadWriteAccessor
  static readonly DebugPrintable = VdfVectorDebugPrintable

  // Holder of the actual implementation of Vdf_VectorData that holds this
  // vector's data (vector.h:688-693).
  _data: Vdf_VectorDataDataHolder = Vdf_NewDataHolder()

  /**
   * Constructs an empty VdfVector; the data is made by VdfTypedVector
   * (vector.h:641-651).
   */
  constructor()
  /** Copy constructor (vector.h:51-58). */
  constructor(rhs: VdfVector)
  /** Copy constructor with subset copying (vector.h:60-78). */
  constructor(rhs: VdfVector, mask: VdfMask)
  /** Copy constructor with boxing (vector.h:80-120). */
  constructor(rhs: VdfVector, mask: VdfMask, tag: VdfVectorConstructBoxedCopyTag)
  /**
   * Construct a vector with the element type of `rhs` and of size `size`,
   * all elements default constructed (vector.h:122-138).
   */
  constructor(rhs: VdfVector, size: number)
  constructor(rhs?: VdfVector, arg?: VdfMask | number, tag?: VdfVectorConstructBoxedCopyTag) {
    if (!rhs) {
      return
    }
    const rhsData = rhs._data.Get()
    if (arg === undefined) {
      // We need to new an empty impl because Clone() always expects a valid
      // _data to clone into.
      rhsData.newEmpty(0, this._data)
      rhsData.Clone(this._data)
    } else if (typeof arg === 'number') {
      const size = arg
      if (size === 0) {
        rhsData.newEmpty(0, this._data)
      } else if (size === 1) {
        rhsData.newSingle(this._data)
      } else {
        rhsData.newDense(size, this._data)
      }
    } else if (tag === VdfVectorConstructBoxedCopyTag.ConstructBoxedCopy) {
      const mask = arg
      if (rhs.getSize() !== mask.getSize()) {
        TF_CODING_ERROR(
          `size mismatch: rhs.GetSize() (${rhs.getSize()}) != mask.GetSize() (${mask.getSize()})`)
      }
      // Box expects valid _data to copy into, so first create an empty vector.
      rhsData.newEmpty(0, this._data)
      if (mask.isAnySet()) {
        rhsData.box(mask.getBits(), this._data)
      }
    } else {
      const mask = arg
      // CloneSubset expects valid _data to copy into, so first create an
      // empty vector.
      rhsData.newEmpty(0, this._data)
      // If the mask is all ones, take advantage of the faster Clone().
      if (mask.isAllOnes()) {
        rhsData.Clone(this._data)
      } else if (mask.isAnySet()) {
        rhsData.cloneSubset(mask, this._data)
      }
    }
  }

  /** Move constructor (vector.h:140-146). */
  static move(rhs: VdfVector): VdfVector {
    const v = new VdfVector()
    rhs._data.Get().newEmpty(0, v._data)
    rhs._data.Get().moveInto(v._data)
    return v
  }

  /** Returns the number of elements held in this vector (vector.h:155-157). */
  getSize(): number {
    return this._data.Get().getSize()
  }

  /** Returns whether or not this vector is empty (vector.h:159-161). */
  IsEmpty(): boolean {
    return this.getSize() === 0
  }

  /** Returns the number of elements for which this vector has storage (vector.h:163-168). */
  getNumStoredElements(): number {
    return this._data.Get().getNumStoredElements()
  }

  /**
   * Set (vector.h:170-226): a value becomes a single-element vector; a
   * Vdf_BoxedContainer is copied into a boxed vector.
   *
   * C++ deduces TYPE from the argument. `Set(type, data)` names it; with
   * `Set(data)` it is the element type a Vdf_BoxedContainer carries, or else
   * the vector's held type. As upstream, a TYPE other than the held type
   * posts a coding error and then replaces the data with data of TYPE.
   */
  Set<T>(data: T | Vdf_BoxedContainer<T>): void
  Set<T>(type: TfType, data: T | Vdf_BoxedContainer<T>): void
  Set<T>(...args: [T | Vdf_BoxedContainer<T>] | [TfType, T | Vdf_BoxedContainer<T>]): void {
    const data = args.length === 2 ? args[1] : args[0]
    if (data instanceof Vdf_BoxedContainer) {
      const box = data as Vdf_BoxedContainer<T>
      const type = args.length === 2 ? args[0] : box.getType()
      if (box.getType() !== type) {
        VdfVector._postTypeError(box.getType(), type)
      }
      this._checkType(type)
      this._data.destroy()
      this._data.new(new Vdf_VectorImplBoxed<T>(type, box.Clone()))
      return
    }
    const type = args.length === 2 ? args[0] : this._GetTypeInfo()
    this._checkType(type)
    this._data.destroy()
    this._data.new(new Vdf_VectorImplSingle<T>(type, data))
  }

  /**
   * Allocates space for `size` elements, or for the elements denoted by
   * `bits`; elements are default initialized (vector.h:228-280).
   */
  resize<T>(type: TfType, sizeOrBits: number | TfCompressedBits): void {
    this._checkType(type)
    this._data.destroy()

    // Note that we never construct a compressed vector impl here: merging
    // data into a compressed vector without first uncompressing is not
    // supported.
    if (typeof sizeOrBits === 'number') {
      const size = sizeOrBits
      if (size === 0) {
        this._data.new(new Vdf_VectorImplEmpty<T>(type, 0))
      } else if (size === 1) {
        this._data.new(new Vdf_VectorImplSingle<T>(type))
      } else {
        this._data.new(new Vdf_VectorImplContiguous<T>(type, size))
      }
      return
    }
    const bits = sizeOrBits
    const size = bits.getSize()
    if (size === 0) {
      this._data.new(new Vdf_VectorImplEmpty<T>(type, 0))
    } else if (size === 1) {
      this._data.new(new Vdf_VectorImplSingle<T>(type))
    } else if (bits.areAllUnset()) {
      this._data.new(new Vdf_VectorImplEmpty<T>(type, size))
    } else {
      this._data.new(new Vdf_VectorImplContiguous<T>(type, bits))
    }
  }

  /**
   * Destroys contents of this vector. Resets the vector to have zero size
   * but maintains the held type (vector.cpp:31-38).
   */
  clear(): void {
    const tmp = Vdf_NewDataHolder()
    this._data.Get().newEmpty(0, tmp)
    tmp.Get().moveInto(this._data)
    tmp.destroy()
  }

  /**
   * Copies the elements of `rhs` set in `mask` into this vector
   * (vector.h:290-326).
   */
  copy(rhs: VdfVector, mask: VdfMask): void {
    this._checkType(rhs._GetTypeInfo())

    // Need to detach local data before copying into it if we are shared.
    if (this._data.Get().getInfo().ownership === Vdf_VectorDataInfoOwnership.Shared) {
      Vdf_VectorImplShared.detach(this._data)
    }

    // If the mask is all ones, take advantage of the faster Clone().
    if (mask.isAllOnes()) {
      rhs._data.Get().Clone(this._data)
    } else if (mask.isAnySet()) {
      rhs._data.Get().cloneSubset(mask, this._data)
    } else {
      // If the mask is all zeros, create an empty vector instead of
      // duplicating the rhs vector's implementation with an empty data
      // section.
      const rhsData = rhs._data.Get()
      this._data.destroy()
      rhsData.newEmpty(mask.getSize(), this._data)
    }
  }

  /**
   * Merges the elements of `rhs` denoted by `bits` (or a mask) into this
   * vector, which must not be compressed (vector.h:328-341, vector.cpp:40-104).
   */
  merge(rhs: VdfVector, bitsOrMask: TfCompressedBits | VdfMask): void {
    const bits: TfCompressedBits =
      bitsOrMask instanceof TfCompressedBits ? bitsOrMask : bitsOrMask.getBits()

    this._checkType(rhs._GetTypeInfo())

    // Can't do a self-merge
    if (rhs === this) {
      TF_CODING_ERROR('cannot self-Merge() (this == &rhs)')
      return
    }

    const size = this.getSize()

    // Bail out if there is nothing to merge from rhs
    if (rhs.IsEmpty() || bits.areAllUnset()) {
      return
    }

    // Vector sizes must be equal to the bits size
    if (size !== rhs.getSize()) {
      TF_CODING_ERROR(
        `size mismatch: this->GetSize() (${size}) != rhs.GetSize() (${rhs.getSize()})`)
      return
    }
    if (size !== bits.getSize()) {
      TF_CODING_ERROR(
        `size mismatch: this->GetSize() (${size}) != bits.GetSize() (${bits.getSize()})`)
      return
    }

    // Collect the destination vector info
    let info = this._data.Get().getInfo()

    // Need to detach before mutating the data if shared.
    if (info.ownership === Vdf_VectorDataInfoOwnership.Shared) {
      Vdf_VectorImplShared.detach(this._data)
      // Update the info after detaching.
      info = this._data.Get().getInfo()
    }

    // Deal with sparse and compressed vectors
    if (this.getNumStoredElements() < size) {
      const newFirst = Math.min(bits.getFirstSet(), info.first)
      const newLast = Math.max(bits.getLastSet(), info.last)

      // Uncompress, if necessary, once: all subsequent Merge operations will
      // target a now sparse vector.
      if (info.compressedIndexMapping) {
        const storedBits = new TfCompressedBits()
        info.compressedIndexMapping.computeStoredBits(storedBits, info.size)
        const tmp = Vdf_NewDataHolder()
        this._data.Get().newSparse(info.size, newFirst, newLast, tmp)
        this._data.Get().merge(storedBits, tmp)
        tmp.Get().moveInto(this._data)
        tmp.destroy()
      } else if (newFirst < info.first || newLast > info.last) {
        // Make sure the storage space in the destination vector is
        // sufficiently large.
        this._data.Get().Expand(newFirst, newLast)
      }
    }

    // Merge from the rhs implementation to _data
    rhs._data.Get().merge(bits, this._data)
  }

  /**
   * Embeds this vector's implementation into a reference counted
   * implementation so that the data can be shared without copying. Returns
   * true if the sharing was successful (vector.h:343-366).
   */
  share(): boolean {
    // Bail out if not sharable
    if (!this._data.Get().isSharable()) {
      return false
    }
    // Create the new shared impl in a temp DataHolder; _data is moved into
    // and held by a SharedSource.
    const tmp = Vdf_NewDataHolder()
    tmp.new(new Vdf_VectorImplShared(this._data))
    // Move the new shared data into this vector's DataHolder.
    tmp.Get().moveInto(this._data)
    tmp.destroy()
    return true
  }

  /** Returns true if the vector has been shared (vector.h:368-375). */
  isShared(): boolean {
    return this._data.Get().getInfo().ownership === Vdf_VectorDataInfoOwnership.Shared
  }

  /** Returns true if the vector can be shared (vector.h:377-381). */
  isSharable(): boolean {
    return this._data.Get().isSharable()
  }

  /**
   * Extracts `size` of this vector's values from `offset` into a
   * VtArray<T> (vector.h:383-416).
   */
  extractAsVtArray<T>(type: TfType, size: number, offset: number): VtArray<T> {
    const data = this._data.Get()
    const info = data.getInfo()

    if (info.compressedIndexMapping) {
      return VdfVector._decompressAsVtArray<T>(
        type, (info.data ?? []) as T[], info.compressedIndexMapping, size, offset)
    }

    // A typed pointer to the first element; the layout depends on whether
    // the vector is boxed.
    let access: readonly T[]
    let accessOffset: number
    if (info.layout === Vdf_VectorDataInfoLayout.Boxed) {
      access = (info.data as Vdf_BoxedContainer<T>).data()
      accessOffset = 0
    } else {
      access = (info.data ?? []) as T[]
      accessOffset = -info.first
    }
    accessOffset += offset

    // Upstream returns a VtArray over the shared source without copying
    // when the vector is shared (vector.h:410-412). The TS VtArray owns its
    // storage, so the values are copied in both cases.
    return new VtArray<T>(access.slice(accessOffset, accessOffset + size), type)
  }

  /**
   * GetReadWriteAccessor() allows low level access to the content of the
   * VdfVector, detaching it first if it is shared (vector.h:443-462).
   */
  getReadWriteAccessor<T>(type: TfType): VdfVectorReadWriteAccessor<T> {
    let info = this._data.Get().getInfo()
    if (info.ownership === Vdf_VectorDataInfoOwnership.Shared) {
      Vdf_VectorImplShared.detach(this._data)
      // Update the info after detaching.
      info = this._data.Get().getInfo()
    }
    return new VdfVectorReadWriteAccessor<T>(
      new Vdf_VectorAccessor<T>(type, this._data.Get(), info))
  }

  /** GetReadAccessor() allows low level read-only access (vector.h:507-516). */
  getReadAccessor<T>(type: TfType): VdfVectorReadAccessor<T> {
    return new VdfVectorReadAccessor<T>(
      new Vdf_VectorAccessor<T>(type, this._data.Get(), this._data.Get().getInfo()))
  }

  /** Read-only access to the boxed subranges held by this vector (vector.h:518-527). */
  getSubrangeAccessor<T>(type: TfType): Vdf_VectorSubrangeAccessor<T> {
    return new Vdf_VectorSubrangeAccessor<T>(
      type, this._data.Get(), this._data.Get().getInfo())
  }

  /** Returns a read-only iterator over values held by this vector (vector.h:696-710). */
  getIterator<T>(type: TfType): VdfVectorIterator<T> {
    const haveType = this._GetTypeInfo()
    if (!TF_VERIFY(haveType === type, 'TfSafeTypeCompare(haveType, typeid(TYPE))',
      `Invalid type.  Vector is holding ${haveType.getTypeName()}, ` +
      `tried to use as ${type.getTypeName()}`)) {
      return new VdfVectorIterator<T>()
    }
    return new VdfVectorIterator<T>(this._data.Get().getInfo())
  }

  /** Checks if a vector holds a specific type (vector.h:533-543). */
  holds(type: TfType): boolean {
    return this._GetTypeInfo() === type
  }

  /**
   * Copies the content of `rhs` into this vector, with runtime type
   * checking (vector.h:545-560).
   */
  assign(rhs: VdfVector): this {
    if (rhs === this) {
      return this
    }
    this._checkType(rhs._GetTypeInfo())
    rhs._data.Get().Clone(this._data)
    return this
  }

  /** Moves the content of `rhs` into this vector (vector.h:562-575). */
  moveAssign(rhs: VdfVector): this {
    if (rhs === this) {
      return this
    }
    this._checkType(rhs._GetTypeInfo())
    rhs._data.Get().moveInto(this._data)
    return this
  }

  /** Returns the number of bytes necessary to store a single element (vector.h:577-588). */
  estimateElementMemory(): number {
    return this._data.Get().estimateElementMemory()
  }

  /** Returns a printable of the elements in `mask` (vector.h:639-645). */
  getDebugPrintable(mask: VdfMask): VdfVectorDebugPrintable {
    return new VdfVectorDebugPrintable(this._data.Get(), mask)
  }

  // vector.h:655-672
  static _decompressAsVtArray<T>(
    type: TfType,
    access: readonly T[],
    indexMapping: Vdf_CompressedIndexMapping,
    size: number,
    offset: number): VtArray<T> {
    // This is not a general purpose compressed vector copy. VtArray
    // extraction requests a contiguous range of logical indices and we
    // assume that this cannot span multiple blocks of data.
    const dataIdx = VdfVector._computeCompressedExtractionIndex(indexMapping, size, offset)
    if (dataIdx !== null) {
      return new VtArray<T>(access.slice(dataIdx, dataIdx + size), type)
    }
    return new VtArray<T>([], type)
  }

  /**
   * Computes the data index into a compressed vector impl for the logical
   * offset, or null if (offset, size) is not contained in a single block
   * (vector.cpp:106-128).
   */
  static _computeCompressedExtractionIndex(
    indexMapping: Vdf_CompressedIndexMapping,
    size: number,
    offset: number): number | null {
    const block = { value: 0 }
    const dataIdx = indexMapping.findDataIndex(offset, block)
    const blockStart = indexMapping.getBlockFirstIndex(block.value)
    const blockLen = indexMapping.getBlockLength(block.value)
    return TF_VERIFY((offset + size) <= (blockStart + blockLen),
      '(offset + size) <= (blockStart + blockLen)',
      `Extraction range (idx=${offset}, len=${size}) outside ` +
      `block ${block.value} range (idx=${blockStart}, len=${blockLen})`)
      ? dataIdx : null
  }

  /** Delivers an error message when type checking fails (vector.cpp:130-143). */
  static _postTypeError(typeInfo: TfType, otherTypeInfo: TfType): void {
    TF_CODING_ERROR(
      `Invalid type.  Vector is holding ${typeInfo.getTypeName()}, ` +
      `tried to use as ${otherTypeInfo.getTypeName()}`)
  }

  // vector.h:681-697
  _checkType(otherTypeInfo: TfType): void {
    const thisTypeInfo = this._GetTypeInfo()
    if (thisTypeInfo !== otherTypeInfo) {
      VdfVector._postTypeError(thisTypeInfo, otherTypeInfo)
    }
  }

  // vector.h:699-702
  _GetTypeInfo(): TfType {
    return this._data.Get().getTypeInfo()
  }

  /** The vector implementation details (for tests and iterators). */
  _getInfo(): Vdf_VectorDataInfo {
    return this._data.Get().getInfo()
  }
}

// Type-level names nested in VdfVector (vector.h:400, 465, 609).
export declare namespace VdfVector {
  type ReadAccessor<T> = VdfVectorReadAccessor<T>
  type ReadWriteAccessor<T> = VdfVectorReadWriteAccessor<T>
  type DebugPrintable = VdfVectorDebugPrintable
}
