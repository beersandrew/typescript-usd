// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/buffer.cpp,
//  pxr/imaging/hgi/buffer.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/buffer.{h,cpp} (OpenUSD 26.11.1).

import { HgiBufferUsageBits, type HgiBufferUsage } from './enums.ts'
import { HgiHandle } from './handle.ts'

/** CPU memory an Hgi descriptor or copy op points at (`void const*` /
 *  `void*` upstream). */
export type HgiCpuData = ArrayBufferView | ArrayBuffer

/** buffer.h:45-60 */
export class HgiBufferDesc {
  debugName = ''
  usage: HgiBufferUsage = HgiBufferUsageBits.HgiBufferUsageUniform
  byteSize = 0
  vertexStride = 0
  initialData: HgiCpuData | null = null

  /** operator== (buffer.cpp:24-34); initialData is omitted upstream. */
  equals(rhs: HgiBufferDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.usage === rhs.usage &&
      this.byteSize === rhs.byteSize
      // Omitted. Only used tmp during creation of buffer.
      // lhs.initialData == rhs.initialData &&
  }
}

/** buffer.h:81-132 */
export abstract class HgiBuffer {
  protected _descriptor: HgiBufferDesc

  /** buffer.h:123-124 (buffer.cpp:11-14) */
  protected constructor(desc: HgiBufferDesc) {
    this._descriptor = Object.assign(new HgiBufferDesc(), desc)
  }

  /** buffer.cpp:18-22 */
  getDescriptor(): HgiBufferDesc {
    return this._descriptor
  }

  /** buffer.h:93-94 */
  abstract getByteSizeOfResource(): number

  /** buffer.h:107-108. Upstream returns the backend handle as uint64_t; the
   *  backend object itself is returned here. */
  abstract getRawResource(): unknown

  /** buffer.h:119-120. Returns the CPU staging memory of the buffer. */
  abstract getCPUStagingAddress(): Uint8Array | null
}

/** buffer.h:134-135 */
export type HgiBufferHandle = HgiHandle<HgiBuffer>
export type HgiBufferHandleVector = HgiBufferHandle[]
