// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/bufferUtils.cpp,
//  pxr/imaging/hdSt/bufferUtils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/bufferUtils.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - PLATFORM-DIVERGENCE(hdst-readbuffer-sync): HdStReadBuffer submits the blit
//   work with HgiSubmitWaitTypeWaitUntilCompleted and reads the CPU copy
//   right away, as upstream does. Hgi.SubmitCmds returns a promise in this
//   port; the bytes are present when the function returns only for a backend
//   that completes GPU-to-CPU copies during submission (the recording test
//   Hgi). An asynchronous backend (HgiWebGPU) fills them later.
// - Recorded copy ops hold copies of the buffer handles (HgiHandle objects
//   are shared references here and DestroyBuffer resets them in place).

import {
  HgiBufferGpuToCpuOp,
  HgiBufferGpuToGpuOp,
  HgiHandle,
  HgiMemoryBarrierBits,
  HgiSubmitWaitType,
  type HgiBlitCmds,
  type HgiBufferHandle,
} from 'typescript-usd/hgi'
import {
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  PerfLog as HdPerfLog,
  Type as HdType,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import {
  Value as VtValue,
  ValueTypes as VtValueTypes,
  Array as VtArray,
  type _TypedBuffer as Vt_TypedBuffer,
} from 'typescript-usd/vt'
import { Matrix4f as GfMatrix4f } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { HdStPerfTokens } from './tokens.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** A copy of a handle (handles are values upstream). */
export function HdSt_CopyHandle<T>(handle: HgiHandle<T>): HgiHandle<T> {
  return new HgiHandle<T>(handle.Get(), handle.getId())
}

/** The bytes of a CPU source buffer (HgiCpuData) from `offset`. */
export function HdSt_CpuBytes(
  data: ArrayBufferView | ArrayBuffer, offset: number, size: number,
): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data, offset, size)
  return new Uint8Array(data.buffer, data.byteOffset + offset, size)
}

type _ElementInfo = {
  typeName: string
  componentSize: number
  numComponents: number
  alloc: (n: number) => Vt_TypedBuffer | Int8Array | Int16Array
}

/** bufferUtils.cpp:62-125: the VtArray element type of each HdType. */
function _ElementInfoOf(type: HdType): _ElementInfo | null {
  const I8 = (n: number) => new Int8Array(n)
  const I16 = (n: number) => new Int16Array(n)
  const U16 = (n: number) => new Uint16Array(n)
  const U32 = (n: number) => new Uint32Array(n)
  const I32 = (n: number) => new Int32Array(n)
  const F32 = (n: number) => new Float32Array(n)
  const F64 = (n: number) => new Float64Array(n)
  switch (type) {
    case HdType.HdTypeInt8: return { typeName: 'char', componentSize: 1, numComponents: 1, alloc: I8 }
    case HdType.HdTypeInt16: return { typeName: 'short', componentSize: 2, numComponents: 1, alloc: I16 }
    case HdType.HdTypeUInt16: return { typeName: 'ushort', componentSize: 2, numComponents: 1, alloc: U16 }
    case HdType.HdTypeUInt32: return { typeName: 'uint', componentSize: 4, numComponents: 1, alloc: U32 }
    case HdType.HdTypeInt32: return { typeName: 'int', componentSize: 4, numComponents: 1, alloc: I32 }
    case HdType.HdTypeInt32Vec2: return { typeName: 'GfVec2i', componentSize: 4, numComponents: 2, alloc: I32 }
    case HdType.HdTypeInt32Vec3: return { typeName: 'GfVec3i', componentSize: 4, numComponents: 3, alloc: I32 }
    case HdType.HdTypeInt32Vec4: return { typeName: 'GfVec4i', componentSize: 4, numComponents: 4, alloc: I32 }
    case HdType.HdTypeFloat: return { typeName: 'float', componentSize: 4, numComponents: 1, alloc: F32 }
    case HdType.HdTypeFloatVec2: return { typeName: 'GfVec2f', componentSize: 4, numComponents: 2, alloc: F32 }
    case HdType.HdTypeFloatVec3: return { typeName: 'GfVec3f', componentSize: 4, numComponents: 3, alloc: F32 }
    case HdType.HdTypeFloatVec4: return { typeName: 'GfVec4f', componentSize: 4, numComponents: 4, alloc: F32 }
    case HdType.HdTypeFloatMat4: return { typeName: 'GfMatrix4f', componentSize: 4, numComponents: 16, alloc: F32 }
    case HdType.HdTypeDouble: return { typeName: 'double', componentSize: 8, numComponents: 1, alloc: F64 }
    case HdType.HdTypeDoubleVec2: return { typeName: 'GfVec2d', componentSize: 8, numComponents: 2, alloc: F64 }
    case HdType.HdTypeDoubleVec3: return { typeName: 'GfVec3d', componentSize: 8, numComponents: 3, alloc: F64 }
    case HdType.HdTypeDoubleVec4: return { typeName: 'GfVec4d', componentSize: 8, numComponents: 4, alloc: F64 }
    case HdType.HdTypeDoubleMat4: return { typeName: 'GfMatrix4d', componentSize: 8, numComponents: 16, alloc: F64 }
    default: return null
  }
}

function _ElementType(typeName: string): TfType {
  return (VtValueTypes as Record<string, TfType>)[typeName] ?? TfType.declare(typeName)
}

/** bufferUtils.cpp:35-60 _CreateVtArray */
function _CreateVtArray(info: _ElementInfo, numElements: number, arraySize: number,
  stride: number, elementStride: number, data: Uint8Array): VtValue {
  const elementSize = info.componentSize * info.numComponents
  const packed = new Uint8Array(numElements * arraySize * elementSize)
  if (numElements > 0) {
    TF_VERIFY(data.byteLength === stride * (numElements - 1) + arraySize * elementSize)
    if (stride === arraySize * elementSize) {
      packed.set(data.subarray(0, numElements * arraySize * elementSize))
    } else {
      // deinterleaving
      let src = 0
      let dst = 0
      for (let i = 0; i < numElements; ++i) {
        packed.set(data.subarray(src, src + arraySize * elementSize), dst)
        dst += arraySize * elementSize
        src += elementStride !== 0 ? elementStride : stride
      }
    }
  }
  const count = numElements * arraySize
  const components = info.alloc(count * info.numComponents)
  new Uint8Array(components.buffer).set(packed)
  const elementType = _ElementType(info.typeName)
  try {
    return VtValue.createArray(VtArray.fromBuffer(elementType, components as Vt_TypedBuffer, count))
  } catch {
    // Element types without numeric VtArray storage.
    const values: unknown[] = []
    for (let i = 0; i < count; ++i) {
      const c = Array.from(components.subarray(i * info.numComponents, (i + 1) * info.numComponents) as ArrayLike<number>)
      values.push(info.typeName === 'GfMatrix4f' ? new GfMatrix4f(...c) : c[0])
    }
    return VtValue.createArray(new VtArray<unknown>(values, elementType))
  }
}

/** bufferUtils.cpp:62-125 _CreateVtValue */
function _CreateVtValue(type: HdType, numElements: number, arraySize: number,
  stride: number, elementStride: number, data: Uint8Array): VtValue {
  const info = _ElementInfoOf(type)
  if (!info) {
    TF_CODING_ERROR(`Unhandled data type ${type}`)
    return VtValue.getEmpty()
  }
  return _CreateVtArray(info, numElements, arraySize, stride, elementStride, data)
}

/** bufferUtils.h:24-30, bufferUtils.cpp:127-187. Reads the content of the
 *  buffer back to a VtValue (a VtArray of the tuple's element type). */
export function HdStReadBuffer(
  buffer: HgiBufferHandle,
  tupleType: HdTupleType,
  offset: number,
  stride: number,
  numElements: number,
  elementStride: number,
  resourceRegistry: HdStResourceRegistry,
): VtValue {
  const bytesPerElement = HdDataSizeOfTupleType(tupleType)
  const arraySize = tupleType.count

  // Stride is the byte distance between subsequent elements.
  // If stride was not provided (aka 0), we assume elements are
  // tightly packed and have no interleaved data.
  if (stride === 0) {
    stride = bytesPerElement
  }
  TF_VERIFY(stride >= bytesPerElement)

  // Total VBO size is the byte distance from the beginning of the first
  // element to the end of the last element (bufferUtils.cpp:146-158).
  const dataSize = numElements > 0 ? stride * (numElements - 1) + bytesPerElement : 0
  const tmp = new Uint8Array(dataSize)

  if (!buffer.isSet()) {
    TF_WARN('Cannot read from invalid buffer handle')
    return _CreateVtValue(tupleType.type, numElements, arraySize, stride, elementStride, tmp)
  }

  // Submit and wait for all the work recorded up to this point.
  // The GPU work must complete before we can read-back the GPU buffer.
  resourceRegistry.submitBlitWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
  resourceRegistry.submitComputeWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

  // Read from the buffer using a blit op.
  const copyOp = new HgiBufferGpuToCpuOp()
  copyOp.byteSize = dataSize
  copyOp.cpuDestinationBuffer = tmp
  copyOp.destinationByteOffset = 0
  copyOp.gpuSourceBuffer = HdSt_CopyHandle(buffer)
  copyOp.sourceByteOffset = offset

  const blitCmds = resourceRegistry.getGlobalBlitCmds()
  blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
  blitCmds.copyBufferGpuToCpu(copyOp)
  // PLATFORM-DIVERGENCE(hdst-readbuffer-sync)
  resourceRegistry.submitBlitWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

  return _CreateVtValue(tupleType.type, numElements, arraySize, stride, elementStride, tmp)
}

/** bufferUtils.h:54-70 _CopyUnit */
class _CopyUnit {
  constructor(public readOffset: number, public writeOffset: number,
    public copySize: number) {}

  concat(next: _CopyUnit): boolean {
    if (this.readOffset + this.copySize === next.readOffset &&
        this.writeOffset + this.copySize === next.writeOffset) {
      this.copySize += next.copySize
      return true
    }
    return false
  }
}

/** bufferUtils.h:36-75. A utility class to perform batched buffer copy. */
export class HdStBufferRelocator {
  private _queue: _CopyUnit[] = []
  private readonly _srcBuffer: HgiBufferHandle
  private readonly _dstBuffer: HgiBufferHandle

  /** bufferUtils.h:38-40 */
  constructor(srcBuffer: HgiBufferHandle, dstBuffer: HgiBufferHandle) {
    this._srcBuffer = HdSt_CopyHandle(srcBuffer)
    this._dstBuffer = HdSt_CopyHandle(dstBuffer)
  }

  /** bufferUtils.cpp:191-200. Schedule the range to be copied. The
   *  consecutive ranges could be aggregated into a single copy where
   *  possible. */
  addRange(readOffset: number, writeOffset: number, copySize: number): void {
    const unit = new _CopyUnit(readOffset, writeOffset, copySize)
    if (this._queue.length === 0 || !this._queue[this._queue.length - 1]!.concat(unit)) {
      this._queue.push(unit)
    }
  }

  /** bufferUtils.cpp:202-222. Execute Hgi buffer copy command to flush all
   *  scheduled range copies. */
  commit(blitCmds: HgiBlitCmds): void {
    blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
    for (const it of this._queue) {
      const blitOp = new HgiBufferGpuToGpuOp()
      blitOp.gpuSourceBuffer = this._srcBuffer
      blitOp.gpuDestinationBuffer = this._dstBuffer
      blitOp.sourceByteOffset = it.readOffset
      blitOp.byteSize = it.copySize
      blitOp.destinationByteOffset = it.writeOffset
      blitCmds.copyBufferGpuToGpu(blitOp)
    }

    HdPerfLog.GetInstance().addCounter(HdStPerfTokens.copyBufferGpuToGpu, this._queue.length)

    this._queue = []
  }
}
