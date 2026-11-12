// Ported from OpenUSD 26.11.1: pxr/exec/vdf/maskedOutput.cpp,
//  pxr/exec/vdf/maskedOutput.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/maskedOutput.h and maskedOutput.cpp.
//
// A VdfMaskedOutput pairs an output with a mask. It is a value type
// (docs/openexec-x1.md 4, rule 5): SetOutput/SetMask mutate in place, as
// upstream does, and copies are explicit (Clone).
//
// Mapping choices:
// - operator< orders by output pointer first (maskedOutput.h:101-110). JS has
//   no pointer order; outputs are ordered by VdfOutput::GetId(), a stable
//   per-network order (a null output sorts first).
// - Hash (maskedOutput.h:91-99) adds the output pointer to the mask hash;
//   here the output id stands in for the pointer.
// - Maps keyed by VdfMaskedOutput use Vdf_MaskedOutputKey() as the canonical
//   key.

import { VdfMask } from './mask.ts'
import type { VdfOutput } from './output.ts'

// Output order standing in for std::less<const VdfOutput *>.
const _OutputOrder = (output: VdfOutput | null): number =>
  output ? output.getId() : -1

export class VdfMaskedOutput {
  private _output: VdfOutput | null
  private _mask: VdfMask

  /** VdfMaskedOutput() and VdfMaskedOutput(output, mask) (maskedOutput.h:35-42). */
  constructor(output: VdfOutput | null = null, mask: VdfMask = new VdfMask()) {
    this._output = output
    this._mask = mask
  }

  /** Copy. */
  Clone(): VdfMaskedOutput {
    return new VdfMaskedOutput(this._output, this._mask)
  }

  /** operator bool (maskedOutput.h:46). */
  asBool(): boolean {
    return this._output !== null
  }

  /** GetOutput (maskedOutput.h:52). */
  GetOutput(): VdfOutput | null {
    return this._output
  }

  /** SetOutput (maskedOutput.h:58). */
  setOutput(output: VdfOutput | null): void {
    this._output = output
  }

  /** GetMask (maskedOutput.h:64). */
  GetMask(): VdfMask {
    return this._mask
  }

  /** SetMask (maskedOutput.h:70-78). */
  setMask(mask: VdfMask): void {
    this._mask = mask
  }

  /** operator== (maskedOutput.h:82). */
  Equals(rhs: VdfMaskedOutput): boolean {
    return this._output === rhs._output && this._mask.Equals(rhs._mask)
  }

  /** operator!= (maskedOutput.h:87). */
  notEquals(rhs: VdfMaskedOutput): boolean {
    return !this.Equals(rhs)
  }

  /** Hash (maskedOutput.h:91-99); see file header. */
  static Hash(maskedOutput: VdfMaskedOutput): number {
    return (_OutputOrder(maskedOutput.GetOutput()) +
      maskedOutput.GetMask().getHash()) % Number.MAX_SAFE_INTEGER
  }

  /** operator< (maskedOutput.h:101-110); see file header. */
  lessThan(rhs: VdfMaskedOutput): boolean {
    const l = _OutputOrder(this._output)
    const r = _OutputOrder(rhs._output)
    if (l < r) return true
    if (r < l) return false
    return VdfMask.arbitraryLessThan(this._mask, rhs._mask)
  }

  /** operator<= (maskedOutput.h:112). */
  lessThanOrEqual(rhs: VdfMaskedOutput): boolean {
    return !rhs.lessThan(this)
  }

  /** operator> (maskedOutput.h:116). */
  greaterThan(rhs: VdfMaskedOutput): boolean {
    return rhs.lessThan(this)
  }

  /** operator>= (maskedOutput.h:120). */
  greaterThanOrEqual(rhs: VdfMaskedOutput): boolean {
    return !this.lessThan(rhs)
  }

  /** swap (maskedOutput.h:124). */
  swap(rhs: VdfMaskedOutput): void {
    const output = this._output
    const mask = this._mask
    this._output = rhs._output
    this._mask = rhs._mask
    rhs._output = output
    rhs._mask = mask
  }

  /** GetDebugName (maskedOutput.cpp:13-18). */
  getDebugName(): string {
    return (this._output ? this._output.getDebugName() : '(null)') +
      ' ' + this._mask.getRLEString()
  }
}

/**
 * The canonical key of a VdfMaskedOutput for JS Maps and Sets: the output id
 * and the mask's run-length encoding (equal masked outputs have equal keys).
 */
export function Vdf_MaskedOutputKey(maskedOutput: VdfMaskedOutput): string {
  return `${_OutputOrder(maskedOutput.GetOutput())}:` +
    `${maskedOutput.GetMask().getSize()}:${maskedOutput.GetMask().getRLEString()}`
}
