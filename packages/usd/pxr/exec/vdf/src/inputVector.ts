// Ported from OpenUSD 26.11.1: pxr/exec/vdf/inputVector.cpp,
//  pxr/exec/vdf/inputVector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/inputVector.h and inputVector.cpp.
//
// Input vectors are root-like nodes without inputs that hold a vector of
// values and output them on their single output "out".
//
// Mapping choices (docs/openexec-x1.md 4.1, template parameters):
// - VdfInputVector<T>(network, n) is `new VdfInputVector<T>(type, network, n)`.
// - The demangled C++ type name used in debug names is
//   "VdfInputVector<" + type.GetTypeName() + ">" (e.g. VdfInputVector<GfVec3d>).
// - Value equality (`*v == val`, inputVector.h:111, 164) uses the value's
//   Equals method when it has one (Gf and Vt values), and === otherwise.

import {
  TF_VERIFY,
  type Type as TfType,
} from 'typescript-usd/tf'

import { VdfInputSpecs, VdfOutputSpecs } from './connectorSpecs.ts'
import type { VdfContext } from './context.ts'
import { VdfExecutionTypeRegistry } from './executionTypeRegistry.ts'
import { VdfMask } from './mask.ts'
import type { VdfNetwork } from './network.ts'
import { VdfNode } from './node.ts'
import { VdfRawValueAccessor } from './rawValueAccessor.ts'
import { VdfTokens } from './tokens.ts'
import { VdfTypedVector } from './typedVector.ts'
import type { VdfVector } from './vector.ts'

// operator== on held values; see file header.
function _ValueEquals(a: unknown, b: unknown): boolean {
  if (a !== null && typeof a === 'object' &&
    typeof (a as { Equals?: unknown }).Equals === 'function') {
    return (a as { Equals(rhs: unknown): boolean }).Equals(b)
  }
  return a === b
}

/** Vdf_InputVectorBase (inputVector.h:29-64). */
export abstract class Vdf_InputVectorBase extends VdfNode {
  // _values (inputVector.h:63).
  protected _values: VdfVector

  /** Vdf_InputVectorBase(network, outputSpecs, values) (inputVector.cpp:15-21). */
  protected constructor(network: VdfNetwork, outputSpecs: VdfOutputSpecs, values: VdfVector) {
    super(network, new VdfInputSpecs(), outputSpecs)
    this._values = values
  }

  /** GetSize (inputVector.h:35). */
  getSize(): number {
    return this._values.getSize()
  }

  /** Compute (inputVector.cpp:25-30): sets the held values on the output. */
  override compute(context: VdfContext): void {
    new VdfRawValueAccessor(context).setOutputVector(
      this.GetOutput()!, VdfMask.allOnes(this._values.getSize()), this._values)
  }

  /**
   * GetMemoryUsage (inputVector.cpp:32-37).
   * PLATFORM-DIVERGENCE(openexec-memory-usage) (node.ts): the values'
   * estimated memory only; the node's own size counts as 0.
   */
  override getMemoryUsage(): number {
    return VdfNode._getMemoryUsage(
      this, this._values.estimateElementMemory() * this._values.getSize())
  }
}

/** VdfInputVector<T> (inputVector.h:66-172). */
export class VdfInputVector<T = unknown> extends Vdf_InputVectorBase {
  private readonly _type: TfType

  /** VdfInputVector(network, n) (inputVector.h:73-80): n elements of type. */
  constructor(type: TfType, network: VdfNetwork, n: number) {
    super(
      network,
      new VdfOutputSpecs().connector(type, VdfTokens.out),
      VdfTypedVector.createWithSize(type, n))
    this._type = type
  }

  /** The demangled C++ type name, "VdfInputVector<T>". */
  override _getDemangledTypeName(): string {
    return `VdfInputVector<${this._type.getTypeName()}>`
  }

  /**
   * SetValue (inputVector.h:84-104).
   * PLATFORM-DIVERGENCE(js-no-copy-move): upstream has a const T& overload
   * that copies the value and a T&& overload that moves it. JavaScript passes
   * objects by reference and has no copy constructors, so there is one
   * overload and it stores the value itself, as the move does.
   */
  setValue(index: number, value: T): void {
    if (!TF_VERIFY(index < this._values.getSize(), 'index < _values.GetSize()')) {
      return
    }
    const a = this._values.getReadWriteAccessor<T>(this._type)
    a.Set(index, value)
  }

  /** IsValueEqual (inputVector.h:108-115). */
  isValueEqual(index: number, val: T): boolean {
    if (index < this._values.getSize()) return _ValueEquals(this.GetValue(index), val)
    return false
  }

  /** GetValue (inputVector.h:120-128): the value at index, or null if out of range. */
  GetValue(index: number): T | null {
    if (index >= this._values.getSize()) return null
    const a = this._values.getReadAccessor<T>(this._type)
    return a.Get(index)
  }

  /** _IsDerivedEqual (inputVector.h:139-146). */
  protected override _isDerivedEqual(rhs: VdfNode): boolean {
    if (rhs instanceof VdfInputVector && rhs._type === this._type) {
      return this._valuesAreEqual(rhs as VdfInputVector<T>)
    }
    return false
  }

  // _ValuesAreEqual (inputVector.h:154-171).
  private _valuesAreEqual(rhs: VdfInputVector<T>): boolean {
    const size = this._values.getSize()
    if (size === rhs._values.getSize()) {
      const a = this._values.getReadAccessor<T>(this._type)
      const b = rhs._values.getReadAccessor<T>(this._type)
      for (let i = 0; i < size; ++i) {
        if (!_ValueEquals(a.Get(i), b.Get(i))) return false
      }
      return true
    }
    return false
  }
}

/** VdfEmptyInputVector (inputVector.h:175-195): an empty, typed input vector. */
export class VdfEmptyInputVector extends Vdf_InputVectorBase {
  /** VdfEmptyInputVector(network, type) (inputVector.cpp:40-49). */
  constructor(network: VdfNetwork, type: TfType) {
    super(
      network,
      new VdfOutputSpecs().connector(type, VdfTokens.out),
      VdfExecutionTypeRegistry.createEmptyVector(type))
  }

  /**
   * _IsDerivedEqual (inputVector.cpp:53-61): VdfNode::IsEqual already compared
   * the specs, so any empty input vector is equal.
   */
  protected override _isDerivedEqual(rhs: VdfNode): boolean {
    return rhs instanceof VdfEmptyInputVector
  }
}
