// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the BMP decoder of OpenUSD 26.11.1 pxr/imaging/hio/stb/stb_image.h
// (stb_image.h:5353-5743) as Hio_StbImage::ReadCropped uses it:
// stbi_load_from_memory(buffer, size, &w, &h, &n, 0)
// (pxr/imaging/hio/stbImage.cpp:454-456), i.e. stbi__bmp_load with req_comp 0
// (no stbi__convert_format). Uncompressed and BI_BITFIELDS BMPs of 1, 4, 8,
// 16, 24 and 32 bits per pixel; RLE and embedded JPEG/PNG are rejected as stb
// rejects them.
//
// Where stb reads memory it never wrote (palette entries past the file's
// palette, which live in an uninitialized stack array), the entries here are
// zero.
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

import {
  STBI_MAX_DIMENSIONS,
  StbiError,
  stbi__err,
  stbi__mad3sizes_valid,
  type StbiContext,
  type StbiImage,
} from './stbImageContext.ts'

// stb_image.h:5356-5369
function stbi__bmp_test_raw(s: StbiContext): boolean {
  if (s.get8() !== 0x42) return false // 'B'
  if (s.get8() !== 0x4d) return false // 'M'
  s.get32le() // discard filesize
  s.get16le() // discard reserved
  s.get16le() // discard reserved
  s.get32le() // discard data offset
  const sz = s.get32le()
  return sz === 12 || sz === 40 || sz === 56 || sz === 108 || sz === 124
}

/** stbi__bmp_test (stb_image.h:5371-5376) */
export function stbi__bmp_test(s: StbiContext): boolean {
  const r = stbi__bmp_test_raw(s)
  s.rewind()
  return r
}

// returns 0..31 for the highest set bit (stb_image.h:5379-5390)
function stbi__high_bit(z: number): number {
  let n = 0
  if (z === 0) return -1
  if (z >= 0x10000) { n += 16; z >>>= 16 }
  if (z >= 0x00100) { n += 8; z >>>= 8 }
  if (z >= 0x00010) { n += 4; z >>>= 4 }
  if (z >= 0x00004) { n += 2; z >>>= 2 }
  if (z >= 0x00002) { n += 1 }
  return n
}

// stb_image.h:5392-5400
function stbi__bitcount(a: number): number {
  a = ((a & 0x55555555) + ((a >>> 1) & 0x55555555)) >>> 0 // max 2
  a = ((a & 0x33333333) + ((a >>> 2) & 0x33333333)) >>> 0 // max 4
  a = (a + (a >>> 4)) & 0x0f0f0f0f // max 8 per 4, now 8 bits
  a = (a + (a >>> 8)) >>> 0 // max 16 per 8 bits
  a = (a + (a >>> 16)) >>> 0 // max 32 per 8 bits
  return a & 0xff
}

// extract an arbitrarily-aligned N-bit value (N=bits)
// from v, and then make it 8-bits long and fractionally
// extend it to full full range. (stb_image.h:5402-5424)
const mul_table = [0, 0xff, 0x55, 0x49, 0x11, 0x21, 0x41, 0x81, 0x01]
const shift_table = [0, 0, 0, 1, 0, 2, 4, 6, 0]
function stbi__shiftsigned(v: number, shift: number, bits: number): number {
  if (shift < 0) v = (v << -shift) >>> 0
  else v >>>= shift
  v >>>= 8 - bits
  return (Math.imul(v, mul_table[bits]!) | 0) >> shift_table[bits]!
}

// stbi__bmp_data (stb_image.h:5426-5431)
interface StbiBmpData {
  bpp: number
  offset: number
  hsz: number
  mr: number
  mg: number
  mb: number
  ma: number
  all_a: number
  extra_read: number
}

// stb_image.h:5433-5457
function stbi__bmp_set_mask_defaults(info: StbiBmpData, compress: number): boolean {
  // BI_BITFIELDS specifies masks explicitly, don't override
  if (compress === 3) return true

  if (compress === 0) {
    if (info.bpp === 16) {
      info.mr = 31 << 10
      info.mg = 31 << 5
      info.mb = 31 << 0
    } else if (info.bpp === 32) {
      info.mr = 0xff << 16
      info.mg = 0xff << 8
      info.mb = 0xff << 0
      info.ma = 0xff000000
      info.all_a = 0 // if all_a is 0 at end, then we loaded alpha channel but it was all 0
    } else {
      // otherwise, use defaults, which is all-0
      info.mr = info.mg = info.mb = info.ma = 0
    }
    return true
  }
  return false // error
}

// stb_image.h:5459-5538
function stbi__bmp_parse_header(s: StbiContext, info: StbiBmpData): void {
  if (s.get8() !== 0x42 || s.get8() !== 0x4d) stbi__err('not BMP')
  s.get32le() // discard filesize
  s.get16le() // discard reserved
  s.get16le() // discard reserved
  info.offset = s.get32le() | 0
  const hsz = info.hsz = s.get32le() | 0
  info.mr = info.mg = info.mb = info.ma = 0
  info.extra_read = 14

  if (info.offset < 0) stbi__err('bad BMP')

  if (hsz !== 12 && hsz !== 40 && hsz !== 56 && hsz !== 108 && hsz !== 124) stbi__err('unknown BMP')
  if (hsz === 12) {
    s.img_x = s.get16le()
    s.img_y = s.get16le()
  } else {
    s.img_x = s.get32le()
    s.img_y = s.get32le()
  }
  if (s.get16le() !== 1) stbi__err('bad BMP')
  info.bpp = s.get16le()
  if (hsz !== 12) {
    const compress = s.get32le() | 0
    if (compress === 1 || compress === 2) stbi__err('BMP RLE')
    if (compress >= 4) stbi__err('BMP JPEG/PNG') // this includes PNG/JPEG modes
    if (compress === 3 && info.bpp !== 16 && info.bpp !== 32) stbi__err('bad BMP') // bitfields requires 16 or 32 bits/pixel
    s.get32le() // discard sizeof
    s.get32le() // discard hres
    s.get32le() // discard vres
    s.get32le() // discard colorsused
    s.get32le() // discard max important
    if (hsz === 40 || hsz === 56) {
      if (hsz === 56) {
        s.get32le()
        s.get32le()
        s.get32le()
        s.get32le()
      }
      if (info.bpp === 16 || info.bpp === 32) {
        if (compress === 0) {
          stbi__bmp_set_mask_defaults(info, compress)
        } else if (compress === 3) {
          info.mr = s.get32le()
          info.mg = s.get32le()
          info.mb = s.get32le()
          info.extra_read += 12
          // not documented, but generated by photoshop and handled by mspaint
          if (info.mr === info.mg && info.mg === info.mb) {
            // ?!?!?
            stbi__err('bad BMP')
          }
        } else {
          stbi__err('bad BMP')
        }
      }
    } else {
      // V4/V5 header
      if (hsz !== 108 && hsz !== 124) stbi__err('bad BMP')
      info.mr = s.get32le()
      info.mg = s.get32le()
      info.mb = s.get32le()
      info.ma = s.get32le()
      if (compress !== 3) { // override mr/mg/mb unless in BI_BITFIELDS mode, as per docs
        stbi__bmp_set_mask_defaults(info, compress)
      }
      s.get32le() // discard color space
      for (let i = 0; i < 12; ++i) s.get32le() // discard color space parameters
      if (hsz === 124) {
        s.get32le() // discard rendering intent
        s.get32le() // discard offset of profile data
        s.get32le() // discard size of profile data
        s.get32le() // discard reserved
      }
    }
  }
}

// stb_image.h:5541-5741 with req_comp 0
function bmp_load(s: StbiContext): StbiImage {
  let mr = 0, mg = 0, mb = 0, ma = 0
  const pal = new Uint8Array(256 * 4)
  let psize = 0
  let width: number
  const info: StbiBmpData = { bpp: 0, offset: 0, hsz: 0, mr: 0, mg: 0, mb: 0, ma: 0, all_a: 255, extra_read: 0 }

  stbi__bmp_parse_header(s, info)

  const flip_vertically = (s.img_y | 0) > 0
  s.img_y = Math.abs(s.img_y | 0)

  if (s.img_y > STBI_MAX_DIMENSIONS) stbi__err('too large')
  if (s.img_x > STBI_MAX_DIMENSIONS) stbi__err('too large')

  mr = info.mr
  mg = info.mg
  mb = info.mb
  ma = info.ma
  let all_a = info.all_a

  if (info.hsz === 12) {
    if (info.bpp < 24) psize = Math.trunc((info.offset - info.extra_read - 24) / 3)
  } else {
    if (info.bpp < 16) psize = (info.offset - info.extra_read - info.hsz) >> 2
  }
  if (psize === 0) {
    // accept some number of extra bytes after the header, but if the offset points either to before
    // the header ends or implies a large amount of extra data, reject the file as malformed
    const bytes_read_so_far = s.pos
    const header_limit = 1024 // max we actually read is below 256 bytes currently.
    const extra_data_limit = 256 * 4 // what ordinarily goes here is a palette; 256 entries*4 bytes is its max size.
    if (bytes_read_so_far <= 0 || bytes_read_so_far > header_limit) stbi__err('bad header')
    // we established that bytes_read_so_far is positive and sensible.
    // the first half of this test rejects offsets that are either too small positives, or
    // negative, and guarantees that info.offset >= bytes_read_so_far > 0. this in turn
    // ensures the number computed in the second half of the test can't overflow.
    if (info.offset < bytes_read_so_far || info.offset - bytes_read_so_far > extra_data_limit) {
      stbi__err('bad offset')
    } else {
      s.skip(info.offset - bytes_read_so_far)
    }
  }

  if (info.bpp === 24 && ma === 0xff000000) s.img_n = 3
  else s.img_n = ma ? 4 : 3
  const target = s.img_n // if they want monochrome, we'll post-convert

  // sanity-check size
  if (!stbi__mad3sizes_valid(target, s.img_x, s.img_y, 0)) stbi__err('too large')

  const out = new Uint8Array(target * s.img_x * s.img_y)
  if (info.bpp < 16) {
    let z = 0
    if (psize === 0 || psize > 256) stbi__err('invalid')
    for (let i = 0; i < psize; ++i) {
      pal[i * 4 + 2] = s.get8()
      pal[i * 4 + 1] = s.get8()
      pal[i * 4 + 0] = s.get8()
      if (info.hsz !== 12) s.get8()
      pal[i * 4 + 3] = 255
    }
    s.skip(info.offset - info.extra_read - info.hsz - psize * (info.hsz === 12 ? 3 : 4))
    if (info.bpp === 1) width = (s.img_x + 7) >> 3
    else if (info.bpp === 4) width = (s.img_x + 1) >> 1
    else if (info.bpp === 8) width = s.img_x
    else stbi__err('bad bpp')
    const pad = -width & 3
    if (info.bpp === 1) {
      for (let j = 0; j < s.img_y; ++j) {
        let bit_offset = 7, v = s.get8()
        for (let i = 0; i < s.img_x; ++i) {
          const color = (v >> bit_offset) & 0x1
          out[z++] = pal[color * 4]!
          out[z++] = pal[color * 4 + 1]!
          out[z++] = pal[color * 4 + 2]!
          if (target === 4) out[z++] = 255
          if (i + 1 === s.img_x) break
          if (--bit_offset < 0) {
            bit_offset = 7
            v = s.get8()
          }
        }
        s.skip(pad)
      }
    } else {
      for (let j = 0; j < s.img_y; ++j) {
        for (let i = 0; i < s.img_x; i += 2) {
          let v = s.get8(), v2 = 0
          if (info.bpp === 4) {
            v2 = v & 15
            v >>= 4
          }
          out[z++] = pal[v * 4]!
          out[z++] = pal[v * 4 + 1]!
          out[z++] = pal[v * 4 + 2]!
          if (target === 4) out[z++] = 255
          if (i + 1 === s.img_x) break
          v = info.bpp === 8 ? s.get8() : v2
          out[z++] = pal[v * 4]!
          out[z++] = pal[v * 4 + 1]!
          out[z++] = pal[v * 4 + 2]!
          if (target === 4) out[z++] = 255
        }
        s.skip(pad)
      }
    }
  } else {
    let rshift = 0, gshift = 0, bshift = 0, ashift = 0, rcount = 0, gcount = 0, bcount = 0, acount = 0
    let z = 0
    let easy = 0
    s.skip(info.offset - info.extra_read - info.hsz)
    if (info.bpp === 24) width = 3 * s.img_x
    else if (info.bpp === 16) width = 2 * s.img_x
    else /* bpp = 32 and pad = 0 */ width = 0
    const pad = -width & 3
    if (info.bpp === 24) {
      easy = 1
    } else if (info.bpp === 32) {
      if (mb === 0xff && mg === 0xff00 && mr === 0x00ff0000 && ma === 0xff000000) easy = 2
    }
    if (!easy) {
      if (!mr || !mg || !mb) stbi__err('bad masks')
      // right shift amt to put high bit in position #7
      rshift = stbi__high_bit(mr) - 7; rcount = stbi__bitcount(mr)
      gshift = stbi__high_bit(mg) - 7; gcount = stbi__bitcount(mg)
      bshift = stbi__high_bit(mb) - 7; bcount = stbi__bitcount(mb)
      ashift = stbi__high_bit(ma) - 7; acount = stbi__bitcount(ma)
      if (rcount > 8 || gcount > 8 || bcount > 8 || acount > 8) stbi__err('bad masks')
    }
    for (let j = 0; j < s.img_y; ++j) {
      if (easy) {
        for (let i = 0; i < s.img_x; ++i) {
          out[z + 2] = s.get8()
          out[z + 1] = s.get8()
          out[z + 0] = s.get8()
          z += 3
          const a = easy === 2 ? s.get8() : 255
          all_a |= a
          if (target === 4) out[z++] = a
        }
      } else {
        const bpp = info.bpp
        for (let i = 0; i < s.img_x; ++i) {
          const v = bpp === 16 ? s.get16le() : s.get32le()
          out[z++] = stbi__shiftsigned((v & mr) >>> 0, rshift, rcount) & 255
          out[z++] = stbi__shiftsigned((v & mg) >>> 0, gshift, gcount) & 255
          out[z++] = stbi__shiftsigned((v & mb) >>> 0, bshift, bcount) & 255
          const a = ma ? stbi__shiftsigned((v & ma) >>> 0, ashift, acount) : 255
          all_a = (all_a | a) >>> 0
          if (target === 4) out[z++] = a & 255
        }
      }
      s.skip(pad)
    }
  }

  // if alpha channel is all 0s, replace with all 255s
  if (target === 4 && all_a === 0) {
    for (let i = 4 * s.img_x * s.img_y - 1; i >= 0; i -= 4) out[i] = 255
  }

  if (flip_vertically) {
    const rowBytes = s.img_x * target
    for (let j = 0; j < s.img_y >> 1; ++j) {
      const p1 = j * rowBytes
      const p2 = (s.img_y - 1 - j) * rowBytes
      for (let i = 0; i < rowBytes; ++i) {
        const t = out[p1 + i]!
        out[p1 + i] = out[p2 + i]!
        out[p2 + i] = t
      }
    }
  }

  return { width: s.img_x, height: s.img_y, channels: s.img_n, data: out }
}

/**
 * stbi__bmp_load (stb_image.h:5541-5741) with req_comp 0: the pixels as
 * stbi_load_from_memory returns them for a BMP, top row first; null where
 * stb returns NULL. `onError` receives stb's failure reason.
 */
export function stbi__bmp_load(s: StbiContext, onError?: (reason: string) => void): StbiImage | null {
  try {
    return bmp_load(s)
  } catch (e) {
    if (!(e instanceof StbiError)) throw e
    onError?.(e.message)
    return null
  }
}
