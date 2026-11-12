// Ported from OpenUSD 26.11.1: pxr/exec/esf/editReason.cpp,
//  pxr/exec/esf/editReason.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/editReason.h and editReason.cpp.
//
// Set of scene changes that should trigger edits to the exec network
// (editReason.h:20-30). The set is stored as a uint32 bitmask; each bit
// represents a different type of scene change.
//
// Value semantics (openexec-x1.md 4.1): EsfEditReason is a C++ value type.
// The predefined reasons (None, ResyncedObject, ...) are frozen, so the
// mutating operators (AndAssign, OrAssign) can only be applied to a copy
// (Clone()); the non-mutating operators (And, Or) return new values.

import { TF_VERIFY } from 'typescript-usd/tf'

// editReason.h:132-142: one enum value per bit position.
enum _BitIndex {
  ResyncedObject,
  ChangedPropertyList,
  ChangedConnectionPaths,
  ChangedIncomingConnections,
  ChangedTargetPaths,
  Max,
}

export class EsfEditReason {
  // editReason.h:159: the raw bitmask (uint32_t).
  private _bits = 0

  /** Equivalent to EsfEditReason::None (editReason.h:113-114). */
  constructor() {}

  // editReason.h:126-127: private construction from a raw bitmask.
  private static _fromBits(bits: number): EsfEditReason {
    const result = new EsfEditReason()
    result._bits = bits >>> 0
    return result
  }

  // editReason.h:145-147: predefined edit reasons use this constructor.
  private static _fromBitIndex(bit: _BitIndex): EsfEditReason {
    return Object.freeze(EsfEditReason._fromBits(1 << bit)) as EsfEditReason
  }

  /// \name Supported edit reasons (editReason.h:34-63, 162-180)
  static readonly None: EsfEditReason =
    Object.freeze(EsfEditReason._fromBits(0)) as EsfEditReason

  /** Something about an object has changed, including recursive resyncs on
   *  namespace ancestors. */
  static readonly ResyncedObject: EsfEditReason =
    EsfEditReason._fromBitIndex(_BitIndex.ResyncedObject)

  /** The list of properties on a prim has changed, including renames to the
   *  prim's properties. */
  static readonly ChangedPropertyList: EsfEditReason =
    EsfEditReason._fromBitIndex(_BitIndex.ChangedPropertyList)

  /** The list of connection paths on an attribute has changed. */
  static readonly ChangedConnectionPaths: EsfEditReason =
    EsfEditReason._fromBitIndex(_BitIndex.ChangedConnectionPaths)

  /** The set of connections that target an object has changed. */
  static readonly ChangedIncomingConnections: EsfEditReason =
    EsfEditReason._fromBitIndex(_BitIndex.ChangedIncomingConnections)

  /** The list of target paths on a relationship has changed. */
  static readonly ChangedTargetPaths: EsfEditReason =
    EsfEditReason._fromBitIndex(_BitIndex.ChangedTargetPaths)

  /** Copy constructor (a mutable copy of a possibly frozen value). */
  Clone(): EsfEditReason {
    return EsfEditReason._fromBits(this._bits)
  }

  /// \name Bitwise operations (editReason.h:67-110)

  /** explicit operator bool: true if this object contains any edit reasons. */
  asBool(): boolean {
    return this._bits !== 0
  }

  Equals(other: EsfEditReason): boolean {
    return this._bits === other._bits
  }

  notEquals(other: EsfEditReason): boolean {
    return this._bits !== other._bits
  }

  /** operator&= (mutating). */
  andAssign(other: EsfEditReason): this {
    this._bits = (this._bits & other._bits) >>> 0
    return this
  }

  /** operator|= (mutating). */
  orAssign(other: EsfEditReason): this {
    this._bits = (this._bits | other._bits) >>> 0
    return this
  }

  /** operator&. */
  and(other: EsfEditReason): EsfEditReason {
    return EsfEditReason._fromBits(this._bits & other._bits)
  }

  /** operator|. */
  or(other: EsfEditReason): EsfEditReason {
    return EsfEditReason._fromBits(this._bits | other._bits)
  }

  /** Return true if \p other's reasons are entirely contained by this set of
   *  reasons (editReason.h:101-103). */
  contains(other: EsfEditReason): boolean {
    return ((this._bits & other._bits) >>> 0) === other._bits
  }

  /** operator<: enables consistent sorting of EsfEditReasons
   *  (editReason.h:108-110). */
  lessThan(other: EsfEditReason): boolean {
    return this._bits < other._bits
  }

  /** Hash of the bitmask (the value a TfHash of _bits combines). */
  getHash(): number {
    return this._bits
  }

  // editReason.cpp:15-34
  private static _getBitDescription(bitIndex: _BitIndex): string {
    switch (bitIndex) {
      case _BitIndex.ResyncedObject:
        return 'ResyncedObject'
      case _BitIndex.ChangedPropertyList:
        return 'ChangedPropertyList'
      case _BitIndex.ChangedConnectionPaths:
        return 'ChangedConnectionPaths'
      case _BitIndex.ChangedIncomingConnections:
        return 'ChangedIncomingConnections'
      case _BitIndex.ChangedTargetPaths:
        return 'ChangedTargetPaths'
      case _BitIndex.Max:
        break // fallthrough.
    }

    TF_VERIFY(false, 'false', 'Invalid EsfEditReason value')
    return 'InvalidBit'
  }

  /**
   * Get a string describing the contents of this edit reason: a
   * comma-separated list of the pre-defined edit reasons that make up this
   * value (editReason.cpp:36-57).
   */
  getDescription(): string {
    let result = ''

    if (this._bits === 0) {
      result = 'None'
      return result
    }

    let useSeparator = false
    const MAX_BITS = _BitIndex.Max
    for (let bitIndex = 0; bitIndex < MAX_BITS; bitIndex++) {
      if (this._bits & (1 << bitIndex)) {
        if (useSeparator) {
          result += ', '
        }
        result += EsfEditReason._getBitDescription(bitIndex)
        useSeparator = true
      }
    }
    return result
  }
}
