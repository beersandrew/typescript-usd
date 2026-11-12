// Ported from OpenUSD 26.11.1: pxr/exec/vdf/connectorSpecs.cpp,
//  pxr/exec/vdf/connectorSpecs.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/connectorSpecs.h and connectorSpecs.cpp.
//
// Containers for input and output connector specs. Typical usage
// (connectorSpecs.h:28-38):
//
//   new VdfInputSpecs()
//     .ReadConnector(GfVec3dType, 'axis')
//     .ReadConnector(VtValueTypes.double, 'length')
//     .ReadWriteConnector(GfVec3dType, 'moves', 'out')
//
// The templated connector methods (ReadConnector<T>, ReadWriteConnector<T>,
// Connector<T>) and their non-templated TfType overloads are the same TS
// methods taking the TfType first (docs/openexec-x1.md 4.1).

import type { Type as TfType } from 'typescript-usd/tf'

import { VdfInputSpec } from './inputSpec.ts'
import { VdfOutputSpec } from './outputSpec.ts'
import { VdfTokens } from './tokens.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

interface _ClonableSpec<T> {
  Clone(): T
}

/**
 * VdfConnectorSpecs<T> (connectorSpecs.h:49-149): the base container. Specs
 * are owned and copied on Append and copy construction, as upstream does.
 */
export abstract class VdfConnectorSpecs<T extends _ClonableSpec<T>> implements Iterable<T> {
  private _specs: T[] = []

  /** Copy constructor (connectorSpecs.h:64): appends copies of rhs. */
  constructor(rhs?: VdfConnectorSpecs<T>) {
    if (rhs) this.append(rhs)
  }

  /** Copy assignment (connectorSpecs.h:75). */
  assign(rhs: VdfConnectorSpecs<T>): this {
    if (rhs === this) return this
    this._clearSpecs()
    this.append(rhs)
    return this
  }

  /** Move assignment (connectorSpecs.h:83). */
  moveAssign(rhs: VdfConnectorSpecs<T>): this {
    if (rhs === this) return this
    this._clearSpecs()
    this._specs = rhs._specs
    rhs._specs = []
    return this
  }

  /** Append (connectorSpecs.h:91): appends copies of every spec in specs. */
  append(specs: VdfConnectorSpecs<T>): void {
    for (const spec of [...specs._specs]) {
      this._specs.push(spec.Clone())
    }
  }

  /** Reserve (connectorSpecs.h:100): capacity hint, no observable effect. */
  reserve(_numSpecs: number): void {}

  /** GetSize (connectorSpecs.h:105). */
  getSize(): number {
    return this._specs.length
  }

  /** begin()/end() (connectorSpecs.h:108-111). */
  [Symbol.iterator](): Iterator<T> {
    return this._specs[Symbol.iterator]()
  }

  /** _ClearSpecs (connectorSpecs.h:125). */
  protected _clearSpecs(): void {
    this._specs = []
  }

  /** _GetConnectorSpec (connectorSpecs.h:134). */
  protected _getConnectorSpec(idx: number): T | null {
    return this._specs[idx] ?? null
  }

  /** _AddConnector (connectorSpecs.h:140). */
  protected _addConnector(cs: T): void {
    this._specs.push(cs)
  }
}

/** VdfInputSpecs (connectorSpecs.h:157-233). */
export class VdfInputSpecs extends VdfConnectorSpecs<VdfInputSpec> {
  /**
   * ReadConnector<T>(inName, outName, prerequisite) (connectorSpecs.h:168) and
   * ReadConnector(type, inName, outName, prerequisite) (connectorSpecs.h:198).
   */
  readConnector(
    type: TfType,
    inName: TfToken,
    outName: TfToken = VdfTokens.empty,
    prerequisite = false): this {
    this._addConnector(VdfInputSpec.new(
      type, inName, outName, VdfInputSpec.READ, prerequisite))
    return this
  }

  /**
   * ReadWriteConnector<T>(inName, outName) (connectorSpecs.h:181) and
   * ReadWriteConnector(type, inName, outName) (connectorSpecs.h:213).
   */
  readWriteConnector(type: TfType, inName: TfToken, outName: TfToken): this {
    this._addConnector(VdfInputSpec.new(
      type, inName, outName, VdfInputSpec.READWRITE, /* prerequisite */ false))
    return this
  }

  /** GetInputSpec (connectorSpecs.h:191). */
  getInputSpec(idx: number): VdfInputSpec | null {
    return this._getConnectorSpec(idx)
  }

  /** operator== (connectorSpecs.cpp:11-28). */
  Equals(rhs: VdfInputSpecs): boolean {
    if (this === rhs) return true
    if (this.getSize() !== rhs.getSize()) return false
    for (let i = 0; i < this.getSize(); i++) {
      if (this.getInputSpec(i)!.notEquals(rhs.getInputSpec(i)!)) return false
    }
    return true
  }

  /** operator!= (connectorSpecs.h:230). */
  notEquals(rhs: VdfInputSpecs): boolean {
    return !this.Equals(rhs)
  }
}

/** VdfOutputSpecs (connectorSpecs.h:241-275). */
export class VdfOutputSpecs extends VdfConnectorSpecs<VdfOutputSpec> {
  /** Connector<T>(name) (connectorSpecs.h:246) and Connector(type, name) (connectorSpecs.h:261). */
  connector(type: TfType, name: TfToken): this {
    this._addConnector(VdfOutputSpec.new(type, name))
    return this
  }

  /** GetOutputSpec (connectorSpecs.h:254). */
  getOutputSpec(idx: number): VdfOutputSpec | null {
    return this._getConnectorSpec(idx)
  }

  /** operator== (connectorSpecs.cpp:30-47). */
  Equals(rhs: VdfOutputSpecs): boolean {
    if (this === rhs) return true
    if (this.getSize() !== rhs.getSize()) return false
    for (let i = 0; i < this.getSize(); i++) {
      if (this.getOutputSpec(i)!.notEquals(rhs.getOutputSpec(i)!)) return false
    }
    return true
  }

  /** operator!= (connectorSpecs.h:272). */
  notEquals(rhs: VdfOutputSpecs): boolean {
    return !this.Equals(rhs)
  }
}
