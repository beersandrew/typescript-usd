// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit): the packed buffers of
// draws with vertex pulling whose pipeline takes the packed variant
// (HgiWebGPUGraphicsPipeline, HGIWEBGPU_FORCE_PACKED_ATTRIBUTES). Metal pulls
// a post-tessellation vertex function's attributes through its vertex
// buffer table (hgiMetal/graphicsPipeline.mm:54-157), 31 entries per stage;
// HgiWebGPU's emulation reads each one from a storage buffer binding, and
// WebGPU devices may have as few as 8 storage buffers per stage (Chrome on
// macOS: 10). The packed variant reads the control point indices and every
// attribute from one buffer: the bound index and vertex buffers copied
// whole, one after the other, with copyBufferToBuffer on the cmds'
// pre-pass encoder (submitted before its render pass, after every earlier
// submission, so the copy sees the buffers as the draw would). A packed
// buffer is kept per list of source buffers (rebuilt only when a source's
// identity or size changes) and records, per source range, the source's
// write version it holds (HgiWebGPUBuffer._noteWrite); a cmds copies again
// only the ranges whose source was written since. Costs extra GPU memory
// the size of its sources, and a GPU copy of a source each time it changes.

import type { HgiWebGPUBuffer } from './buffer.ts'
import { GPUBufferUsageFlags } from './conversions.ts'
import { TF_CODING_ERROR } from './diagnostic.ts'

/** One source buffer's range of a packed buffer. */
interface _Range {
  source: HgiWebGPUBuffer
  gpuBuffer: GPUBuffer
  /** Byte offset in the packed buffer, and the bytes copied. */
  base: number
  bytes: number
  /** The source's write version the range holds; -1 before its first copy. */
  version: number
  /** The cmds that copied it last. */
  copiedBy: number
}

interface _Packed {
  buffer: GPUBuffer
  /** Byte offset of each source in the packed buffer. */
  bases: Map<GPUBuffer, number>
  ranges: _Range[]
  /** The cmds that used it last. */
  lastUse: number
}

/** A packed buffer and where each source's copy starts. */
export interface HgiWebGPUPackedAttributes {
  readonly buffer: GPUBuffer
  readonly bases: ReadonlyMap<GPUBuffer, number>
}

/** Unused packed buffers are destroyed after this many cmds. */
const _evictAfter = 240

export class HgiWebGPUPulledAttributePacker {
  private readonly _ids = new WeakMap<GPUBuffer, number>()
  private _nextId = 1
  private readonly _packed = new Map<string, _Packed>()
  private _serial = 0
  private _bytes = 0
  private _copiedBytes = 0

  constructor(private readonly _device: GPUDevice) {}

  /** A serial for a new cmds. Evicts the packed buffers no recent cmds
   *  used. */
  beginCmds(): number {
    const serial = ++this._serial
    for (const [key, p] of this._packed) {
      if (serial - p.lastUse > _evictAfter) {
        p.buffer.destroy()
        this._bytes -= p.buffer.size
        this._packed.delete(key)
      }
    }
    return serial
  }

  /** The bytes the packed buffers hold, for diagnostics. */
  getByteSize(): number {
    return this._bytes
  }

  /** The bytes copied into packed buffers so far, for diagnostics. */
  getCopiedBytes(): number {
    return this._copiedBytes
  }

  /** The packed buffer of `sources` (distinct, in order) for the cmds
   *  `serial`. The ranges whose source's write version changed since they
   *  were copied, and those of sources `writtenInCmds` (written by work this
   *  cmds encoded before the draw, whose version it bumps when submitted),
   *  are copied on the encoder `encoder()` gives, once per cmds. Null, with
   *  a coding error, when the sources do not fit a storage buffer binding. */
  pack(serial: number, sources: readonly HgiWebGPUBuffer[],
    writtenInCmds: (source: HgiWebGPUBuffer) => boolean,
    encoder: () => GPUCommandEncoder): HgiWebGPUPackedAttributes | null {
    let key = ''
    for (const s of sources) {
      const b = s.getBufferId()
      if (!b) return null
      let id = this._ids.get(b)
      if (id === undefined) this._ids.set(b, id = this._nextId++)
      key += `${id}:${b.size},`
    }
    let p = this._packed.get(key)
    if (!p) {
      const bases = new Map<GPUBuffer, number>()
      const ranges: _Range[] = []
      let size = 0
      for (const s of sources) {
        const b = s.getBufferId()!
        bases.set(b, size)
        ranges.push({ source: s, gpuBuffer: b, base: size, bytes: Math.floor(b.size / 4) * 4,
          version: -1, copiedBy: 0 })
        size += Math.ceil(b.size / 4) * 4
      }
      const limit = Math.min(this._device.limits.maxStorageBufferBindingSize, this._device.limits.maxBufferSize)
      if (size > limit) {
        TF_CODING_ERROR(`HgiWebGPU: the ${size} bytes of a draw's index and vertex buffers do not fit ` +
          `one storage buffer binding (${limit}); the draw is skipped`)
        return null
      }
      const buffer = this._device.createBuffer({
        label: 'HgiWebGPU packed pulled attributes',
        size: Math.max(size, 4),
        usage: GPUBufferUsageFlags.STORAGE | GPUBufferUsageFlags.COPY_DST,
      })
      this._bytes += buffer.size
      p = { buffer, bases, ranges, lastUse: serial }
      this._packed.set(key, p)
    }
    p.lastUse = serial
    let e: GPUCommandEncoder | null = null
    for (const r of p.ranges) {
      const version = r.source._getWriteVersion()
      if (r.version === version && !(r.copiedBy !== serial && writtenInCmds(r.source))) continue
      r.version = version
      r.copiedBy = serial
      if (r.bytes === 0) continue
      e ??= encoder()
      e.copyBufferToBuffer(r.gpuBuffer, 0, p.buffer, r.base, r.bytes)
      this._copiedBytes += r.bytes
    }
    return p
  }

  /** At the submission of the cmds that packed `packed`: copies again, on
   *  the encoder `encoder()` gives (submitted before the cmds' passes), the
   *  ranges whose source was written by work submitted after they were
   *  copied. */
  refresh(packed: Iterable<HgiWebGPUPackedAttributes>, encoder: () => GPUCommandEncoder): void {
    let e: GPUCommandEncoder | null = null
    for (const q of packed) {
      for (const r of (q as _Packed).ranges) {
        const version = r.source._getWriteVersion()
        if (r.version === version) continue
        r.version = version
        if (r.bytes === 0) continue
        e ??= encoder()
        e.copyBufferToBuffer(r.gpuBuffer, 0, (q as _Packed).buffer, r.base, r.bytes)
        this._copiedBytes += r.bytes
      }
    }
  }

  destroy(): void {
    for (const p of this._packed.values()) p.buffer.destroy()
    this._packed.clear()
    this._bytes = 0
  }
}
