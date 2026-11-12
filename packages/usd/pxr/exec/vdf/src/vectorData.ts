// Ported from OpenUSD 26.11.1: pxr/exec/vdf/vectorData.cpp,
//  pxr/exec/vdf/vectorData.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/vectorData.h and vectorData.cpp.
//
// Vdf_VectorData is the abstract base class for storing data in a VdfVector.
// Mapping choices (openexec-x1.md 4.1):
// - GetTypeInfo() returns the held TfType (C++ returns std::type_info).
// - Info.data, upstream a `void *`, is the element storage: for unboxed
//   layouts a JS array whose index 0 holds logical element `first` (for a
//   compressed layout, the packed storage); for the boxed layout the
//   Vdf_BoxedContainer; null when nothing is stored.
// - DebugPrint returns the text it would stream to `o`.
// - The small buffer sizes (vectorData.h:30-40) size the C++
//   Vdf_FixedSizePolymorphicHolder and have no TS counterpart.

import { TF_VERIFY, type Type as TfType, type TfCompressedBits } from 'typescript-usd/tf'
import type { _ArrayForeignDataSource as Vt_ArrayForeignDataSource } from 'typescript-usd/vt'
import type { Vdf_BoxedContainer } from './boxedContainer.ts'
import type { Vdf_CompressedIndexMapping } from './compressedIndexMapping.ts'
import { Vdf_FixedSizePolymorphicHolder } from './fixedSizePolymorphicHolder.ts'
import type { VdfMask } from './mask.ts'
import { Vdf_VectorAccessor } from './vectorAccessor.ts'

/** The data layout, boxed vs unboxed (vectorData.h:170-173). */
export enum Vdf_VectorDataInfoLayout {
  Unboxed,
  Boxed,
}

/** If the vector implementation is shared (vectorData.h:175-178). */
export enum Vdf_VectorDataInfoOwnership {
  Exclusive,
  Shared,
}

/** The element storage an Info names; see the file header. */
export type Vdf_VectorDataStorage = unknown[] | Vdf_BoxedContainer<unknown> | null

/**
 * The vector implementation details returned by GetInfo() as a named
 * parameter object (vectorData.h:166-217).
 */
export class Vdf_VectorDataInfo {
  static readonly Layout = Vdf_VectorDataInfoLayout
  static readonly Ownership = Vdf_VectorDataInfoOwnership

  // Backing storage.
  data: Vdf_VectorDataStorage
  // Size of the vector implementation.
  size: number
  // First element stored.
  first: number
  // Last element stored.
  last: number
  // The compressed index mapping.
  compressedIndexMapping: Vdf_CompressedIndexMapping | null
  // The data layout (boxed vs unboxed)
  layout: Vdf_VectorDataInfoLayout
  // If the vector implementation is shared.
  ownership: Vdf_VectorDataInfoOwnership

  // vectorData.h:181-197
  constructor(
    data: Vdf_VectorDataStorage,
    size: number,
    first = 0,
    last = 0,
    compressedIndexMapping: Vdf_CompressedIndexMapping | null = null,
    layout = Vdf_VectorDataInfoLayout.Unboxed,
    ownership = Vdf_VectorDataInfoOwnership.Exclusive) {
    this.data = data
    this.size = size
    this.first = first
    this.last = last
    this.compressedIndexMapping = compressedIndexMapping
    this.layout = layout
    this.ownership = ownership
  }
}

/** Abstract base class for storing data in a VdfVector (vectorData.h:25-246). */
export abstract class Vdf_VectorData {
  /** The size a vector needs to be to enable sharing (vectorData.h:42-43). */
  static readonly _VectorSharingSize = 5000

  static readonly Info = Vdf_VectorDataInfo

  /** Called when the holder destroys this data (the C++ destructor). */
  _destruct(): void {}

  /** Returns the type for this data (vectorData.h:61-63). */
  abstract getTypeInfo(): TfType

  /** Sets `destData` to an empty data with this data's type (vectorData.h:65-70). */
  abstract newEmpty(size: number, destData: Vdf_VectorDataDataHolder): void

  /** Sets `destData` to a single element vector of this data's type (vectorData.h:72-77). */
  abstract newSingle(destData: Vdf_VectorDataDataHolder): void

  /** Sets `destData` to a sparse vector of this data's type (vectorData.h:79-85). */
  abstract newSparse(size: number, first: number, last: number, destData: Vdf_VectorDataDataHolder): void

  /** Sets `destData` to a dense vector of this data's type (vectorData.h:87-92). */
  abstract newDense(size: number, destData: Vdf_VectorDataDataHolder): void

  /** Moves this vector into `destData` (vectorData.h:94-100). */
  abstract moveInto(destData: Vdf_VectorDataDataHolder): void

  /** Clones this data object into `destData` (vectorData.h:102-106). */
  abstract Clone(destData: Vdf_VectorDataDataHolder): void

  /** Clones the subset of this vector in `mask` into `destData` (vectorData.h:108-114). */
  abstract cloneSubset(mask: VdfMask, destData: Vdf_VectorDataDataHolder): void

  /** Boxes the elements in `bits` into a container in `destData` (vectorData.h:116-126). */
  abstract box(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void

  /** Merges this data into `destData` (vectorData.h:128-133). */
  abstract merge(bits: TfCompressedBits, destData: Vdf_VectorDataDataHolder): void

  /**
   * Expand the storage capabilities of the underlying vector implementation,
   * if necessary. By default, expansion is not supported (vectorData.cpp:113-120).
   */
  Expand(_first: number, _last: number): void {
    TF_VERIFY(false, 'false',
      `Unsupported attempt to expand storage of ${this.constructor.name}. ` +
      'Promotion to dense or sparse vector required.')
  }

  /** Returns the size of the vector (vectorData.h:141-145). */
  abstract getSize(): number

  /** Returns the number of elements stored in the vector implementation (vectorData.h:147-149). */
  abstract getNumStoredElements(): number

  /**
   * Returns the shared source for copyless value extraction. Disabled for
   * all implementations but Vdf_VectorImplShared (vectorData.cpp:122-130).
   */
  getSharedSource(): Vt_ArrayForeignDataSource | null {
    TF_VERIFY(false, 'false',
      'Unsupported attempt to get a shared source from ' +
      `non-shared vector ${this.constructor.name}. Must call Share() first.`)
    return null
  }

  /** Returns true if the vector's data is sharable. Defaults to false (vectorData.cpp:132-136). */
  isSharable(): boolean {
    return false
  }

  /** Returns the vector implementation details (vectorData.h:219-221). */
  abstract getInfo(): Vdf_VectorDataInfo

  /** Returns the estimated memory of a single element (vectorData.h:223-226). */
  abstract estimateElementMemory(): number

  /**
   * Returns whether a vector characterized by `bits` and an element size in
   * bytes should be stored compressed (vectorData.cpp:24-43).
   */
  static shouldStoreCompressed(bits: TfCompressedBits, _elementSize: number): boolean {
    // Never compress any vector that has less than bigVectorSize elements or
    // is contiguously set (of the form 0*1+0*).
    const bigVectorSize = 1000
    if (bits.getSize() < bigVectorSize || bits.areContiguouslySet()) {
      return false
    }
    // Don't bother compressing anything with small data sections.
    const sectionSize = bits.getLastSet() - bits.getFirstSet() + 1
    if (sectionSize < Math.floor(bigVectorSize / 2)) {
      return false
    }
    // If less than 12.5% of the data holding section is occupied, we consider
    // this vector to have low occupation.
    return bits.getNumSet() < Math.floor(sectionSize / 8)
  }

  /**
   * Returns the text DebugPrint streams for the elements in `mask`. Only a
   * select list of types can be printed (vectorData.cpp:138-160).
   */
  debugPrint(mask: VdfMask): string {
    // Bail out immediately if there is no data to print.
    if (!this.getInfo().data) {
      return ''
    }
    const type = this.getTypeInfo()
    const streamOut = _debugPrintDispatchTable.get(type.getTypeName())
    if (streamOut) {
      return _DebugStreamOut(type, this, mask, streamOut)
    }
    return `(${type.getTypeName()})\n`
  }
}

/** Vdf_VectorData::DataHolder (vectorData.h:46-47). */
export type Vdf_VectorDataDataHolder = Vdf_FixedSizePolymorphicHolder<Vdf_VectorData>

/** Constructs an empty Vdf_VectorData::DataHolder. */
export function Vdf_NewDataHolder(): Vdf_VectorDataDataHolder {
  return new Vdf_FixedSizePolymorphicHolder<Vdf_VectorData>()
}

// `os << double` with the default stream precision of 6 significant digits
// (%g formatting). Exported for the other `os << double` sites in vdf
// (dotGrapher.ts).
export function Vdf_StreamDouble(value: number): string {
  if (Number.isNaN(value)) {
    return 'nan'
  }
  if (!Number.isFinite(value)) {
    return value < 0 ? '-inf' : 'inf'
  }
  if (value === 0) {
    return Object.is(value, -0) ? '-0' : '0'
  }
  const exponent = Math.floor(Math.log10(Math.abs(Number(value.toPrecision(6)))))
  if (exponent < -4 || exponent >= 6) {
    const [mantissa, exp] = value.toExponential(5).split('e') as [string, string]
    const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa
    const expNum = Number(exp)
    const expAbs = String(Math.abs(expNum)).padStart(2, '0')
    return `${trimmed}e${expNum < 0 ? '-' : '+'}${expAbs}`
  }
  const fixed = value.toFixed(Math.max(0, 5 - exponent))
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

// The types that can be debug printed (vectorData.cpp:91-103), by TfType name.
const _debugPrintDispatchTable = new Map<string, (value: unknown) => string>([
  ['int', (v) => String(v)],
  ['double', (v) => Vdf_StreamDouble(v as number)],
  ['GfVec3d', (v) => String(v)],
  ['GfMatrix4d', (v) => String(v)],
  ['string', (v) => v as string],
])

// Vdf_VectorData_DebugStreamOut (vectorData.cpp:62-78).
function _DebugStreamOut(
  type: TfType,
  vector: Vdf_VectorData,
  mask: VdfMask,
  streamOut: (value: unknown) => string): string {
  const a = new Vdf_VectorAccessor<unknown>(type, vector, vector.getInfo())
  let o = ''
  for (const it = mask.begin(); !it.isAtEnd(); it.increment()) {
    const idx = it.deref()
    o += `${idx}: ${streamOut(a.Get(idx))}\n`
  }
  return o
}

// Type-level names nested in Vdf_VectorData (vectorData.h:46-47, 166).
export declare namespace Vdf_VectorData {
  type DataHolder = Vdf_VectorDataDataHolder
  type Info = Vdf_VectorDataInfo
}
