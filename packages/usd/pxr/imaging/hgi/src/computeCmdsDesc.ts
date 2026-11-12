// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/computeCmdsDesc.cpp,
//  pxr/imaging/hgi/computeCmdsDesc.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/computeCmdsDesc.{h,cpp} (OpenUSD 26.11.1).

import { HgiComputeDispatch } from './enums.ts'

/** computeCmdsDesc.h:26-32 (constructor: computeCmdsDesc.cpp:10-13) */
export class HgiComputeCmdsDesc {
  dispatchMethod: HgiComputeDispatch = HgiComputeDispatch.HgiComputeDispatchSerial

  /** operator== (computeCmdsDesc.cpp:16-21) */
  equals(rhs: HgiComputeCmdsDesc): boolean {
    return this.dispatchMethod === rhs.dispatchMethod
  }
}
