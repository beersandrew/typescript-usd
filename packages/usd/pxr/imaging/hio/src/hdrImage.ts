// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/imaging/hio/stb/stb_image.h:7141-7298,
// used by hio/stbImage.cpp:367-368,445-447 for linear float HDR storage.
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
import type { HioTypedImage } from './typedImage.ts'

export function _decodeRadianceHdr(bytes: Uint8Array): HioTypedImage {
  let offset = 0
  const fail = (reason: string): never => { throw new Error(`Invalid Radiance HDR: ${reason}`) }
  const byte = (): number => offset < bytes.length ? bytes[offset++]! : fail('truncated pixel data')
  const line = (): string => {
    const start = offset
    while (offset < bytes.length && bytes[offset] !== 10) offset++
    if (offset === bytes.length) return fail('truncated header')
    const result = new TextDecoder().decode(bytes.subarray(start, offset++))
    return result.endsWith('\r') ? result.slice(0, -1) : result
  }
  const signature = line()
  if (signature !== '#?RADIANCE' && signature !== '#?RGBE') fail('unsupported signature')
  let format = false
  for (let token = line(); token !== ''; token = line()) {
    if (token === 'FORMAT=32-bit_rle_rgbe') format = true
  }
  if (!format) fail('unsupported format')
  // The native stb backend supports this orientation only; no inferred flips.
  const dimensions = /^-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/.exec(line())
  if (!dimensions) fail('unsupported data layout')
  const height = Number(dimensions![1]), width = Number(dimensions![2])
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width > 1 << 24 || height > 1 << 24 || width * height * 16 > 0x7fffffff) fail('invalid dimensions')
  const data = new Float32Array(width * height * 4)
  const store = (pixel: number, r: number, g: number, b: number, e: number): void => {
    const scale = e ? 2 ** (e - 136) : 0
    data[pixel * 4] = r * scale
    data[pixel * 4 + 1] = g * scale
    data[pixel * 4 + 2] = b * scale
    data[pixel * 4 + 3] = 1
  }
  const flat = (start: number): void => {
    for (let pixel = start; pixel < width * height; pixel++) store(pixel, byte(), byte(), byte(), byte())
  }
  if (width < 8 || width >= 32768) flat(0)
  else {
    const scanline = new Uint8Array(width * 4)
    for (let y = 0; y < height; y++) {
      const a = byte(), b = byte(), hi = byte(), lo = byte()
      if (a !== 2 || b !== 2 || hi & 128) {
        // Native's old/flat fallback restarts from the first decoded pixel.
        // It is meaningful only before any RLE scanlines have been consumed.
        if (y !== 0) fail('mixed flat and RLE scanlines')
        store(0, a, b, hi, lo); flat(1); break
      }
      if ((hi << 8 | lo) !== width) fail('invalid scanline length')
      for (let channel = 0; channel < 4; channel++) {
        let x = 0
        while (x < width) {
          const code = byte(), count = code > 128 ? code - 128 : code
          if (count === 0 || count > width - x) fail('bad RLE run')
          if (code > 128) {
            const value = byte()
            for (let n = 0; n < count; n++) scanline[(x++) * 4 + channel] = value
          } else {
            for (let n = 0; n < count; n++) scanline[(x++) * 4 + channel] = byte()
          }
        }
      }
      for (let x = 0; x < width; x++) store(y * width + x, scanline[x * 4]!, scanline[x * 4 + 1]!, scanline[x * 4 + 2]!, scanline[x * 4 + 3]!)
    }
  }
  return { storage: 'typed', data, width, height, format: 'float32vec4', bytesPerRow: width * 16, isColorSpaceSRGB: false }
}
