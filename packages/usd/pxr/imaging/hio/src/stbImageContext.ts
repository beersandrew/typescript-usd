// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The memory-buffer stbi__context of OpenUSD 26.11.1
// pxr/imaging/hio/stb/stb_image.h (the copy Hio_StbImage compiles,
// pxr/imaging/hio/stbImage.cpp:27-41) and the helpers its decoders share:
// stbi__err and the size checks. The decoders are stbImageDecode.ts (PNG and
// stbi__load_main), stbImageJpeg.ts, stbImageBmp.ts and stbImageTga.ts.
/*
MIT License — Copyright (c) 2017 Sean Barrett
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/** Pixels as stbi_load_from_memory(..., 0) returns them, top row first. */
export interface StbiImage {
  width: number
  height: number
  /** stb's channels_in_file: palette -> 3 (4 with tRNS), gray/RGB + tRNS -> +1. */
  channels: number
  /** width * height * channels bytes; 16-bit samples keep their high byte. */
  data: Uint8Array
}

// stb_image.h:795
export const STBI_MAX_DIMENSIONS = 1 << 24

// stbi__context over a memory buffer (stb_image.h:825-835) with stbi__get8,
// stbi__at_eof, stbi__skip, stbi__getn, stbi__get16be, stbi__get32be,
// stbi__get16le and stbi__get32le (:1613-1708): reads past the end return 0.
export class StbiContext {
  pos = 0
  img_x = 0
  img_y = 0
  img_n = 0
  img_out_n = 0
  constructor(readonly buffer: Uint8Array) {}
  get8(): number {
    return this.pos < this.buffer.length ? this.buffer[this.pos++]! : 0
  }
  get16be(): number {
    const z = this.get8()
    return (z << 8) + this.get8()
  }
  get32be(): number {
    const z = this.get16be()
    return ((z << 16) >>> 0) + this.get16be()
  }
  get16le(): number {
    const z = this.get8()
    return z + (this.get8() << 8)
  }
  get32le(): number {
    const z = this.get16le()
    return (z + ((this.get16le() << 16) >>> 0)) >>> 0
  }
  /** stbi__at_eof (stb_image.h:1627-1637) */
  atEof(): boolean {
    return this.pos >= this.buffer.length
  }
  /** stbi__rewind (stb_image.h:885-892) */
  rewind(): void {
    this.pos = 0
  }
  skip(n: number): void {
    this.pos = n < 0 || n > 0x7fffffff ? this.buffer.length : this.pos + n
  }
  getn(n: number): Uint8Array | null {
    if (this.pos + n > this.buffer.length) return null
    const out = this.buffer.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }
}

/** stbi__err (stb_image.h:977-981, with the short reasons of :1093-1094):
 *  thrown, so a failure unwinds to the caller that tests stb's 0 return. */
export class StbiError extends Error {}
export function stbi__err(reason: string): never {
  throw new StbiError(reason)
}

const INT_MAX = 0x7fffffff

// stbi__addsizes_valid (stb_image.h:1000-1010), stbi__mul2sizes_valid
// (:1012-1020) and stbi__mad3sizes_valid (:1029-1034)
export function stbi__mul2sizes_valid(a: number, b: number): boolean {
  if (a < 0 || b < 0) return false
  if (b === 0) return true
  return a <= Math.floor(INT_MAX / b)
}
export function stbi__addsizes_valid(a: number, b: number): boolean {
  if (b < 0) return false
  return a <= INT_MAX - b
}
export function stbi__mad3sizes_valid(a: number, b: number, c: number, add: number): boolean {
  return stbi__mul2sizes_valid(a, b) && stbi__mul2sizes_valid(a * b, c) &&
    stbi__addsizes_valid(a * b * c, add)
}
