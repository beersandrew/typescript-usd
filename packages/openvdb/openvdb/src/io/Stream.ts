// Sequential binary reader over an ArrayBuffer — the TS analog of the
// std::istream the upstream io code reads from. Little-endian throughout
// (VDB files are always written little-endian).

import type { Coord, Vec3 } from '@vdb/nanovdb'

const textDecoder = new TextDecoder()

export class Stream {
  readonly dv: DataView
  readonly bytes: Uint8Array
  pos = 0

  constructor(data: ArrayBuffer | Uint8Array) {
    this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    this.dv = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength)
  }

  eof(): boolean {
    return this.pos >= this.bytes.byteLength
  }

  skip(n: number): void {
    this.pos += n
  }

  seek(pos: number): void {
    this.pos = pos
  }

  uint8(): number {
    return this.dv.getUint8(this.pos++)
  }

  int8(): number {
    return this.dv.getInt8(this.pos++)
  }

  bool(): boolean {
    return this.uint8() !== 0
  }

  uint16(): number {
    const v = this.dv.getUint16(this.pos, true)
    this.pos += 2
    return v
  }

  int32(): number {
    const v = this.dv.getInt32(this.pos, true)
    this.pos += 4
    return v
  }

  uint32(): number {
    const v = this.dv.getUint32(this.pos, true)
    this.pos += 4
    return v
  }

  /** int64 narrowed to a JS number (same DIVERGENCE as @vdb/nanovdb: values < 2^53) */
  int64(): number {
    const v = this.dv.getBigInt64(this.pos, true)
    this.pos += 8
    return Number(v)
  }

  float32(): number {
    const v = this.dv.getFloat32(this.pos, true)
    this.pos += 4
    return v
  }

  float64(): number {
    const v = this.dv.getFloat64(this.pos, true)
    this.pos += 8
    return v
  }

  vec3d(): Vec3 {
    return [this.float64(), this.float64(), this.float64()]
  }

  coord(): Coord {
    return [this.int32(), this.int32(), this.int32()]
  }

  raw(n: number): Uint8Array {
    const out = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }

  /** upstream util readString: uint32 length + raw chars (no terminator) */
  string(): string {
    const n = this.uint32()
    return textDecoder.decode(this.raw(n))
  }
}
