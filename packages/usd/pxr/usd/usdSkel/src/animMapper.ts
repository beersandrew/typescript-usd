// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/animMapper.cpp,
//  pxr/usd/usdSkel/animMapper.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdSkel/animMapper.{h,cpp} — UsdSkelAnimMapper
//
// Remaps runs of values from a source joint order to a target joint order.
// Three internal shapes, matching upstream:
//  - null map: no source elements map to the target
//  - ordered map: the source is a contiguous run inside the target at
//    `offset` (identity when offset = 0 and sizes match)
//  - indexed map: per-source-element target indices (-1 = unmapped)

import { Array as VtArray, Zero as VtZero } from 'typescript-usd/vt'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'

// animMapper.cpp:22-36
const enum MapFlags {
  NullMap = 0,
  SomeSourceValuesMapToTarget = 0x1,
  AllSourceValuesMapToTarget = 0x2,
  SourceOverridesAllTargetValues = 0x4,
  OrderedMap = 0x8,
  IdentityMap = AllSourceValuesMapToTarget | SourceOverridesAllTargetValues | OrderedMap,
  NonNullMap = SomeSourceValuesMapToTarget | AllSourceValuesMapToTarget,
}

// Element types whose values are JS scalars (the remaining Sdf array value
// types hold Gf objects); used to type-check `defaultValue` as
// _UntypedRemap does with VtValue::IsHolding<T> (animMapper.cpp:173-183).
const _SCALAR_TYPE_NAMES = new Set([
  'bool', 'uchar', 'short', 'ushort', 'int', 'uint', 'int64', 'uint64',
  'half', 'float', 'double', 'string', 'token',
])

function _codingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

// The value-initialized element (`_ValueType()`, animMapper.h:206) of an
// array's element type: zeros for numeric and Gf storage.
function _valueInitialized<T>(array: VtArray<T>): T {
  const elementType = array.getElementType()
  if (_SCALAR_TYPE_NAMES.has(elementType.getTypeName())) return VtZero(elementType) as T
  const zero = new VtArray<T>([], elementType)
  zero.resize(1)
  return zero.get(0)
}

export class UsdSkelAnimMapper {
  private _targetSize: number
  private _offset = 0
  private _flags: number = MapFlags.NullMap
  private _indexMap: Int32Array = new Int32Array(0)

  // new UsdSkelAnimMapper()                          → null map (animMapper.cpp:39-41)
  // new UsdSkelAnimMapper(size)                      → identity over `size` (animMapper.cpp:44-46)
  // new UsdSkelAnimMapper(sourceOrder, targetOrder)  → remapping (animMapper.cpp:49-121)
  constructor(sizeOrSourceOrder?: number | readonly string[], targetOrder?: readonly string[]) {
    if (sizeOrSourceOrder === undefined) {
      this._targetSize = 0
      return
    }
    if (typeof sizeOrSourceOrder === 'number') {
      this._targetSize = sizeOrSourceOrder
      this._flags = MapFlags.IdentityMap
      return
    }

    const sourceOrder = sizeOrSourceOrder
    const target = targetOrder ?? []
    this._targetSize = target.length
    if (sourceOrder.length === 0 || target.length === 0) {
      this._flags = MapFlags.NullMap
      return
    }

    // Determine if this an ordered mapping of the source onto the target,
    // with a simple offset. This includes identity maps.
    const found = target.indexOf(sourceOrder[0]!)
    const pos = found < 0 ? target.length : found
    if (pos + sourceOrder.length <= target.length) {
      let equal = true
      for (let i = 0; i < sourceOrder.length; i++) {
        if (sourceOrder[i] !== target[pos + i]) { equal = false; break }
      }
      if (equal) {
        this._offset = pos
        this._flags = MapFlags.OrderedMap | MapFlags.AllSourceValuesMapToTarget
        if (pos === 0 && sourceOrder.length === target.length) {
          this._flags |= MapFlags.SourceOverridesAllTargetValues
        }
        return
      }
    }

    // No ordered mapping can be produced.
    // Settle for an unordered, indexed mapping.
    const targetMap = new Map<string, number>()
    for (let i = 0; i < target.length; i++) targetMap.set(target[i]!, i)

    this._indexMap = new Int32Array(sourceOrder.length)
    let mappedCount = 0
    const targetMapped = new Array<boolean>(target.length).fill(false)
    for (let i = 0; i < sourceOrder.length; i++) {
      const idx = targetMap.get(sourceOrder[i]!)
      if (idx !== undefined) {
        this._indexMap[i] = idx
        targetMapped[idx] = true
        ++mappedCount
      } else {
        this._indexMap[i] = -1
      }
    }
    // animMapper.cpp:114-120: a map in which no source value maps to the
    // target is still flagged _SomeSourceValuesMapToTarget (not null).
    this._flags = mappedCount === sourceOrder.length
      ? MapFlags.AllSourceValuesMapToTarget : MapFlags.SomeSourceValuesMapToTarget
    if (targetMapped.every(v => v)) {
      this._flags |= MapFlags.SourceOverridesAllTargetValues
    }
  }

  // UsdSkelAnimMapper::size() (animMapper.h:101)
  get size(): number { return this._targetSize }
  get length(): number { return this._targetSize }

  isIdentity(): boolean { return (this._flags & MapFlags.IdentityMap) === MapFlags.IdentityMap }

  isSparse(): boolean { return !(this._flags & MapFlags.SourceOverridesAllTargetValues) }

  isNull(): boolean { return !(this._flags & MapFlags.NonNullMap) }

  private _isOrdered(): boolean { return (this._flags & MapFlags.OrderedMap) !== 0 }

  // Remaps `source` (a run of `elementSize` values per source-order entry)
  // into a target-shaped array.
  //
  // With VtArray arguments this is the VtValue overload
  // (UsdSkelAnimMapper::Remap(const VtValue&, VtValue*, ...),
  // animMapper.cpp:152-215): a target or default value whose type does not
  // match the source's element type is a coding error, reported by returning
  // undefined. The default value defaults to the element type's
  // value-initialized value.
  //
  // With plain arrays this is the templated Remap (animMapper.h:178-238):
  // unmapped target elements keep their value from `target` (when provided,
  // e.g. rest transforms) or take `defaultValue`.
  remap<T>(source: VtArray<T>, target?: VtArray<T> | null, elementSize?: number,
    defaultValue?: T): VtArray<T> | undefined
  remap<T>(source: readonly T[], target?: readonly T[] | null, elementSize?: number,
    defaultValue?: T): T[]
  remap<T>(
    source: readonly T[] | VtArray<T>,
    target?: readonly T[] | VtArray<T> | null,
    elementSize = 1,
    defaultValue?: T,
  ): T[] | VtArray<T> | undefined {
    if (source instanceof VtArray) {
      return this._untypedRemap(source, target as VtArray<T> | null | undefined,
        elementSize, defaultValue)
    }
    const out = target ? [...(target as readonly T[])] : []
    if (!this._remap(source as readonly T[], out, elementSize, defaultValue)) {
      throw new Error(`Invalid elementSize [${elementSize}]: size must be greater than zero.`)
    }
    return out
  }

  // UsdSkelAnimMapper::_UntypedRemap (animMapper.cpp:152-195)
  private _untypedRemap<T>(source: VtArray<T>, target: VtArray<T> | null | undefined,
    elementSize: number, defaultValue: T | undefined): VtArray<T> | undefined {
    const elementType = source.getElementType()
    if (target && target.getElementType() !== elementType) {
      _codingError(`Type of 'target' [VtArray<${target.getElementType().getTypeName()}>] ` +
        `did not match the type of 'source' [VtArray<${elementType.getTypeName()}>].`)
      return undefined
    }
    if (defaultValue !== undefined) {
      const scalar = _SCALAR_TYPE_NAMES.has(elementType.getTypeName())
      const isScalarValue = typeof defaultValue !== 'object'
      if (scalar !== isScalarValue) {
        _codingError(`Unexpected type [${typeof defaultValue}] for defaultValue: ` +
          `expecting '${elementType.getTypeName()}'.`)
        return undefined
      }
    }
    const values = target ? target.toArray() : []
    const fill = defaultValue ?? _valueInitialized<T>(source)
    if (!this._remap(source.toArray(), values, elementSize, fill)) return undefined
    return new VtArray<T>(values, elementType)
  }

  // UsdSkelAnimMapper::Remap (animMapper.h:178-238), on a mutable target.
  private _remap<T>(source: readonly T[], target: T[], elementSize: number,
    defaultValue: T | undefined): boolean {
    if (elementSize <= 0) {
      TfDiagnosticMgr.GetInstance().postWarning(
        `Invalid elementSize [${elementSize}]: size must be greater than zero.`)
      return false
    }

    const targetArraySize = this._targetSize * elementSize

    if (this.isIdentity() && source.length === targetArraySize) {
      // Can make copy of the array.
      target.length = 0
      target.push(...source)
      return true
    }

    // Resize the target array to the expected size.
    const prevSize = target.length
    target.length = targetArraySize
    for (let i = prevSize; i < targetArraySize; ++i) target[i] = defaultValue as T

    if (this.isNull()) {
      return true
    } else if (this._isOrdered()) {
      const copyCount = Math.min(source.length, targetArraySize - this._offset * elementSize)
      for (let i = 0; i < copyCount; ++i) {
        target[this._offset * elementSize + i] = source[i]!
      }
    } else {
      const copyCount = Math.min(Math.floor(source.length / elementSize), this._indexMap.length)
      for (let i = 0; i < copyCount; ++i) {
        const targetIdx = this._indexMap[i]!
        if (targetIdx >= 0 && targetIdx < target.length) {
          for (let c = 0; c < elementSize; ++c) {
            target[targetIdx * elementSize + c] = source[i * elementSize + c]!
          }
        }
      }
    }
    return true
  }
}
