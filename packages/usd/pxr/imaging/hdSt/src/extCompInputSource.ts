// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompInputSource.cpp,
//  pxr/imaging/hdSt/extCompInputSource.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompInputSource.{h,cpp} (OpenUSD 26.11.1).

import { NullBufferSource as HdNullBufferSource } from 'typescript-usd/hd'
import type { Value as VtValue } from 'typescript-usd/vt'

/** extCompInputSource.h:28-57. Abstract base class for a Buffer Source that
 *  represents a binding to an input to an ExtComputation. */
export abstract class HdSt_ExtCompInputSource extends HdNullBufferSource {
  /** extCompInputSource.cpp:13-18. Constructs the input binding with the
   *  name inputName. */
  constructor(private readonly _inputName: string) {
    super()
  }

  /** extCompInputSource.cpp:22-26. Returns the name of the input. */
  override getName(): string {
    return this._inputName
  }

  /** extCompInputSource.h:45-47. Returns the value associated with the
   *  input. */
  abstract GetValue(): VtValue
}

/** extCompInputSource.h:23-26 */
export type HdSt_ExtCompInputSourceSharedPtr = HdSt_ExtCompInputSource
export type HdSt_ExtCompInputSourceSharedPtrVector = HdSt_ExtCompInputSource[]
