// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/copyComputation.cpp,
//  pxr/imaging/hdSt/copyComputation.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/copyComputation.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - GetBufferSpecs returns the specs instead of filling an out vector.
// - The source range is a counted holder (FAITHFULNESS-DEBT(
//   hd-bar-shared-ptr), hd/src/bufferArrayRange.ts) when its other holders
//   are counted: a migrated range whose prim already dropped it stays in its
//   buffer array until the copy ran, as upstream's _src shared_ptr keeps it.
//   A range no counted holder retains never expires, so it is not retained.

import { HgiBufferGpuToGpuOp } from 'typescript-usd/hgi'
import {
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  PerfLog as HdPerfLog,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSpec as HdBufferSpec,
  type ResourceRegistry as HdResourceRegistry,
} from 'typescript-usd/hd'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdSt_CopyHandle } from './bufferUtils.ts'
import { HdStComputation } from './computation.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStPerfTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** copyComputation.h:24-44. A GPU computation which transfers a vbo range
 *  specified by src and name to the given range. */
export class HdStCopyComputationGPU extends HdStComputation {
  private readonly _src: HdBufferArrayRange
  private readonly _name: string

  /** copyComputation.cpp:24-28 */
  constructor(src: HdBufferArrayRange, name: string) {
    super()
    this._src = src
    this._name = name
    this._holdsSrc = src._useCount() > 0
    if (this._holdsSrc) src._retain()
  }

  private readonly _holdsSrc: boolean
  private _released = false

  /** The destructor: drops _src (see the header). */
  override _destroy(): void {
    if (this._holdsSrc && !this._released) {
      this._released = true
      this._src.release()
    }
  }

  /** copyComputation.cpp:30-102 */
  Execute(range_: HdBufferArrayRange | null, resourceRegistry: HdResourceRegistry): void {
    const srcRange = this._src as HdStBufferArrayRange
    const dstRange = range_ as HdStBufferArrayRange

    const srcRes = srcRange.getResource(this._name)
    const dstRes = dstRange.getResource(this._name)

    if (!TF_VERIFY(srcRes)) {
      return
    }
    if (!TF_VERIFY(dstRes)) {
      return
    }

    const srcResSize = HdDataSizeOfTupleType(srcRes!.getTupleType()) *
                       srcRange.getNumElements()
    const dstResSize = HdDataSizeOfTupleType(dstRes!.getTupleType()) *
                       dstRange.getNumElements()

    if (!TF_VERIFY(srcResSize <= dstResSize)) {
      // The number of elements in the BAR *can* differ during migration.
      // One example is during mesh refinement when migration is necessary,
      // and we copy only the unrefined data over.
      TF_CODING_ERROR(`Migration error for ${this._name}: Source resource (${srcResSize}) size is ` +
        `larger than destination resource size (${dstResSize})\n`)
      return
    }

    const readOffset = srcRange.getByteOffset(this._name) + srcRes!.getOffset()
    const writeOffset = dstRange.getByteOffset(this._name) + dstRes!.getOffset()
    const copySize = srcResSize

    // Unfortunately at the time the copy computation is added, we don't
    // know if the source buffer has 0 length.  So we can get here with
    // a zero sized copy.
    if (srcResSize > 0) {
      // If the buffer's have 0 size, resources for them would not have
      // be allocated, so the check for resource allocation has been moved
      // until after the copy size check.

      if (!TF_VERIFY(srcRes!.getHandle().isSet())) {
        return
      }
      if (!TF_VERIFY(dstRes!.getHandle().isSet())) {
        return
      }

      HdPerfLog.GetInstance().incrementCounter(HdStPerfTokens.copyBufferGpuToGpu)

      const hdStResourceRegistry = resourceRegistry as HdStResourceRegistry

      const blitOp = new HgiBufferGpuToGpuOp()
      blitOp.gpuSourceBuffer = HdSt_CopyHandle(srcRes!.getHandle())
      blitOp.gpuDestinationBuffer = HdSt_CopyHandle(dstRes!.getHandle())
      blitOp.sourceByteOffset = readOffset
      blitOp.byteSize = copySize
      blitOp.destinationByteOffset = writeOffset

      const blitCmds = hdStResourceRegistry.getGlobalBlitCmds()
      blitCmds.copyBufferGpuToGpu(blitOp)
    }
  }

  /** copyComputation.cpp:104-108 */
  getNumOutputElements(): number {
    return this._src.getNumElements()
  }

  /** copyComputation.cpp:110-117 */
  getBufferSpecs(): HdBufferSpec[] {
    const srcRange = this._src as HdStBufferArrayRange
    return [{ name: this._name, tupleType: srcRange.getResource(this._name)!.getTupleType() }]
  }
}
