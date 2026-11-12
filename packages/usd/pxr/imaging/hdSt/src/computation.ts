// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/computation.cpp,
//  pxr/imaging/hdSt/computation.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/computation.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.

import type {
  BufferArrayRange as HdBufferArrayRange,
  BufferSpec as HdBufferSpec,
  ResourceRegistry as HdResourceRegistry,
} from 'typescript-usd/hd'

/** computation.h:35-63. An interface class for GPU computation.
 *
 *  GPU computation fills the result into range, which has to be allocated
 *  using buffer specs determined by GetBufferSpecs, and registered as a pair
 *  of computation and range. */
export abstract class HdStComputation {
  /** computation.h:42-44. Execute computation. */
  abstract Execute(range: HdBufferArrayRange | null,
                   resourceRegistry: HdResourceRegistry): void

  /** computation.h:51. Returns the size of its destination buffer (located
   *  by range argument of Execute()). Returning 0 means it doesn't need to
   *  resize. */
  abstract getNumOutputElements(): number

  /** computation.h:56 */
  abstract getBufferSpecs(): HdBufferSpec[]

  /** computation.h:62 */
  isValid(): boolean { return true }

  /** The destructor, run by HdStResourceRegistry when it drops the
   *  computation after Commit (its _pendingComputations hold the shared_ptr
   *  until then). Drops the computation's shared_ptr members. */
  _destroy(): void {}
}

/** computation.h:24-25 */
export type HdStComputationSharedPtr = HdStComputation
export type HdStComputationSharedPtrVector = HdStComputation[]
