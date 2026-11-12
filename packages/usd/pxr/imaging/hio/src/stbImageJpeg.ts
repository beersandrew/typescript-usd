// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the JPEG decoder of OpenUSD 26.11.1 pxr/imaging/hio/stb/stb_image.h
// (stb_image.h:1932-4060, "STBI_NO_JPEG" section) as Hio_StbImage::ReadCropped
// uses it: stbi_load_from_memory(buffer, size, &w, &h, &n, 0)
// (pxr/imaging/hio/stbImage.cpp:454-456), i.e. stbi__jpeg_load with
// req_comp 0: baseline and progressive Huffman JPEGs of 1, 3 or 4 components,
// upsampled and colour converted by stb's own fixed-point kernels.
//
// The kernels are stb's scalar ones (stbi__idct_block, stbi__YCbCr_to_RGB_row,
// stbi__resample_row_hv_2), which stbi__setup_jpeg (:3818-3839) installs
// unless STBI_SSE2 or STBI_NEON is defined. Hio defines neither
// (stbImage.cpp:27-41) and stb enables SSE2 only on x86 (:690-725), so the
// reference build on arm64 runs these; stb documents its SIMD kernels as
// producing the same results (:3655-3656).
//
// C integer semantics are kept: products go through Math.imul, sums are
// truncated to 32 bits where C's int arithmetic wraps, and coefficient
// blocks are Int16Array (C's short).
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

const INT_MAX = 0x7fffffff
const INT_MIN = -0x80000000
const SHRT_MAX = 32767
const SHRT_MIN = -32768

// stb_image.h:1069-1083
function stbi__addints_valid(a: number, b: number): boolean {
  if ((a >= 0) !== (b >= 0)) return true
  if (a < 0 && b < 0) return a >= INT_MIN - b
  return a <= INT_MAX - b
}
/** C's int division of SHRT_MIN/SHRT_MAX by b (truncation toward zero). */
const idiv = (a: number, b: number): number => Math.trunc(a / b)
function stbi__mul2shorts_valid(a: number, b: number): boolean {
  if (b === 0 || b === -1) return true
  if ((a >= 0) === (b >= 0)) return a <= idiv(SHRT_MAX, b)
  if (b < 0) return a <= idiv(SHRT_MIN, b)
  return a >= idiv(SHRT_MIN, b)
}

// huffman decoding acceleration (stb_image.h:1934-1946)
const FAST_BITS = 9

class StbiHuffman {
  fast = new Uint8Array(1 << FAST_BITS)
  code = new Uint16Array(256)
  values = new Uint8Array(256)
  size = new Uint8Array(257)
  maxcode = new Uint32Array(18)
  delta = new Int32Array(17)
}

/** One component of img_comp (stb_image.h:1961-1974). */
class StbiJpegComponent {
  id = 0
  h = 0
  v = 0
  tq = 0
  hd = 0
  ha = 0
  dc_pred = 0
  x = 0
  y = 0
  w2 = 0
  h2 = 0
  data: Uint8Array | null = null
  linebuf: Uint8Array | null = null
  coeff: Int16Array | null = null // progressive only
  coeff_w = 0
  coeff_h = 0
}

// stbi__jpeg (stb_image.h:1948-2000), without the kernel pointers (see the
// header for the kernels).
class StbiJpeg {
  huff_dc = [new StbiHuffman(), new StbiHuffman(), new StbiHuffman(), new StbiHuffman()]
  huff_ac = [new StbiHuffman(), new StbiHuffman(), new StbiHuffman(), new StbiHuffman()]
  dequant = [new Uint16Array(64), new Uint16Array(64), new Uint16Array(64), new Uint16Array(64)]
  fast_ac = [new Int16Array(1 << FAST_BITS), new Int16Array(1 << FAST_BITS),
    new Int16Array(1 << FAST_BITS), new Int16Array(1 << FAST_BITS)]

  // sizes for components, interleaved MCUs
  img_h_max = 0
  img_v_max = 0
  img_mcu_x = 0
  img_mcu_y = 0
  img_mcu_w = 0
  img_mcu_h = 0

  img_comp = [new StbiJpegComponent(), new StbiJpegComponent(), new StbiJpegComponent(), new StbiJpegComponent()]

  code_buffer = 0 // jpeg entropy-coded buffer (uint32)
  code_bits = 0 // number of valid bits
  marker = 0 // marker seen while filling entropy buffer
  nomore = 0 // flag if we saw a marker so must stop

  progressive = false
  spec_start = 0
  spec_end = 0
  succ_high = 0
  succ_low = 0
  eob_run = 0
  jfif = 0
  app14_color_transform = 0 // Adobe APP14 tag
  rgb = 0

  scan_n = 0
  order = [0, 0, 0, 0]
  restart_interval = 0
  todo = 0

  constructor(readonly s: StbiContext) {}
}

// stb_image.h:2002-2044
function stbi__build_huffman(h: StbiHuffman, count: number[]): void {
  let k = 0
  // build size list for each symbol (from JPEG spec)
  for (let i = 0; i < 16; ++i) {
    for (let j = 0; j < count[i]!; ++j) {
      h.size[k++] = i + 1
      if (k >= 257) stbi__err('bad size list')
    }
  }
  h.size[k] = 0

  // compute actual symbols (from jpeg spec)
  let code = 0
  k = 0
  let j: number
  for (j = 1; j <= 16; ++j) {
    // compute delta to add to code to compute symbol id
    h.delta[j] = k - code
    if (h.size[k] === j) {
      while (h.size[k] === j) h.code[k++] = code++
      if (code - 1 >= 2 ** j) stbi__err('bad code lengths')
    }
    // compute largest code + 1 for this size, preshifted as needed later
    h.maxcode[j] = code * 2 ** (16 - j)
    code *= 2
  }
  h.maxcode[j] = 0xffffffff

  // build non-spec acceleration table; 255 is flag for not-accelerated
  h.fast.fill(255)
  for (let i = 0; i < k; ++i) {
    const s = h.size[i]!
    if (s <= FAST_BITS) {
      const c = h.code[i]! << (FAST_BITS - s)
      const m = 1 << (FAST_BITS - s)
      for (let jj = 0; jj < m; ++jj) h.fast[c + jj] = i
    }
  }
}

// build a table that decodes both magnitude and value of small ACs in
// one go. (stb_image.h:2046-2072)
function stbi__build_fast_ac(fast_ac: Int16Array, h: StbiHuffman): void {
  for (let i = 0; i < 1 << FAST_BITS; ++i) {
    const fast = h.fast[i]!
    fast_ac[i] = 0
    if (fast < 255) {
      const rs = h.values[fast]!
      const run = (rs >> 4) & 15
      const magbits = rs & 15
      const len = h.size[fast]!

      if (magbits && len + magbits <= FAST_BITS) {
        // magnitude code followed by receive_extend code
        let k = ((i << len) & ((1 << FAST_BITS) - 1)) >> (FAST_BITS - magbits)
        const m = 1 << (magbits - 1)
        if (k < m) k += -(1 << magbits) + 1 // (~0U << magbits) + 1
        // if the result is small enough, we can fit it in fast_ac table
        if (k >= -128 && k <= 127) fast_ac[i] = k * 256 + run * 16 + (len + magbits)
      }
    }
  }
}

// stb_image.h:2074-2090
function stbi__grow_buffer_unsafe(j: StbiJpeg): void {
  do {
    const b = j.nomore ? 0 : j.s.get8()
    if (b === 0xff) {
      let c = j.s.get8()
      while (c === 0xff) c = j.s.get8() // consume fill bytes
      if (c !== 0) {
        j.marker = c
        j.nomore = 1
        return
      }
    }
    j.code_buffer = (j.code_buffer | (b << (24 - j.code_bits))) >>> 0
    j.code_bits += 8
  } while (j.code_bits <= 24)
}

// (1 << n) - 1 (stb_image.h:2093)
const stbi__bmask = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535]

// decode a jpeg huffman value from the bitstream (stb_image.h:2095-2148)
function stbi__jpeg_huff_decode(j: StbiJpeg, h: StbiHuffman): number {
  if (j.code_bits < 16) stbi__grow_buffer_unsafe(j)

  // look at the top FAST_BITS and determine what symbol ID it is,
  // if the code is <= FAST_BITS
  let c = (j.code_buffer >>> (32 - FAST_BITS)) & ((1 << FAST_BITS) - 1)
  let k = h.fast[c]!
  if (k < 255) {
    const s = h.size[k]!
    if (s > j.code_bits) return -1
    j.code_buffer = (j.code_buffer << s) >>> 0
    j.code_bits -= s
    return h.values[k]!
  }

  // naive test is to shift the code_buffer down so k bits are
  // valid, then test against maxcode. (maxcode is preshifted to 16 bits.)
  const temp = j.code_buffer >>> 16
  for (k = FAST_BITS + 1; ; ++k) if (temp < h.maxcode[k]!) break
  if (k === 17) {
    // error! code not found
    j.code_bits -= 16
    return -1
  }

  if (k > j.code_bits) return -1

  // convert the huffman code to the symbol id
  c = ((j.code_buffer >>> (32 - k)) & stbi__bmask[k]!) + h.delta[k]!
  if (c < 0 || c >= 256) return -1 // symbol id out of bounds!

  // convert the id to a symbol
  j.code_bits -= k
  j.code_buffer = (j.code_buffer << k) >>> 0
  return h.values[c]!
}

// bias[n] = (-1<<n) + 1 (stb_image.h:2150-2151)
const stbi__jbias = [0, -1, -3, -7, -15, -31, -63, -127, -255, -511, -1023, -2047, -4095, -8191, -16383, -32767]

/** stbi_lrot (stb_image.h:669) on a uint32, 0 < n < 32. */
const stbi_lrot = (x: number, n: number): number => ((x << n) | (x >>> (32 - n))) >>> 0

// combined JPEG 'receive' and JPEG 'extend', since baseline
// always extends everything it receives. (stb_image.h:2153-2169)
function stbi__extend_receive(j: StbiJpeg, n: number): number {
  if (j.code_bits < n) stbi__grow_buffer_unsafe(j)
  if (j.code_bits < n) return 0 // ran out of bits from stream, return 0s intead of continuing

  const sgn = j.code_buffer >>> 31 // sign bit always in MSB; 0 if MSB clear (positive), 1 if MSB set (negative)
  let k = stbi_lrot(j.code_buffer, n)
  j.code_buffer = (k & ~stbi__bmask[n]!) >>> 0
  k &= stbi__bmask[n]!
  j.code_bits -= n
  return k + (stbi__jbias[n]! & (sgn - 1))
}

// get some unsigned bits (stb_image.h:2171-2182)
function stbi__jpeg_get_bits(j: StbiJpeg, n: number): number {
  if (j.code_bits < n) stbi__grow_buffer_unsafe(j)
  if (j.code_bits < n) return 0 // ran out of bits from stream, return 0s intead of continuing
  let k = stbi_lrot(j.code_buffer, n)
  j.code_buffer = (k & ~stbi__bmask[n]!) >>> 0
  k &= stbi__bmask[n]!
  j.code_bits -= n
  return k
}

// stb_image.h:2184-2193
function stbi__jpeg_get_bit(j: StbiJpeg): boolean {
  if (j.code_bits < 1) stbi__grow_buffer_unsafe(j)
  if (j.code_bits < 1) return false // ran out of bits from stream, return 0s intead of continuing
  const k = j.code_buffer
  j.code_buffer = (j.code_buffer << 1) >>> 0
  --j.code_bits
  return (k & 0x80000000) !== 0
}

// given a value that's at position X in the zigzag stream,
// where does it appear in the 8x8 matrix coded as row-major?
// (stb_image.h:2195-2207)
const stbi__jpeg_dezigzag = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
  // let corrupt input sample past end
  63, 63, 63, 63, 63, 63, 63, 63,
  63, 63, 63, 63, 63, 63, 63,
])

// decode one 64-entry block-- (stb_image.h:2209-2262)
function stbi__jpeg_decode_block(j: StbiJpeg, data: Int16Array, hdc: StbiHuffman, hac: StbiHuffman,
  fac: Int16Array, b: number, dequant: Uint16Array): void {
  if (j.code_bits < 16) stbi__grow_buffer_unsafe(j)
  const t = stbi__jpeg_huff_decode(j, hdc)
  if (t < 0 || t > 15) stbi__err('bad huffman code')

  // 0 all the ac values now so we can do it 32-bits at a time
  data.fill(0)

  const diff = t ? stbi__extend_receive(j, t) : 0
  if (!stbi__addints_valid(j.img_comp[b]!.dc_pred, diff)) stbi__err('bad delta')
  const dc = j.img_comp[b]!.dc_pred + diff
  j.img_comp[b]!.dc_pred = dc
  if (!stbi__mul2shorts_valid(dc, dequant[0]!)) stbi__err("can't merge dc and ac")
  data[0] = Math.imul(dc, dequant[0]!)

  // decode AC components, see JPEG spec
  let k = 1
  do {
    if (j.code_bits < 16) stbi__grow_buffer_unsafe(j)
    const c = (j.code_buffer >>> (32 - FAST_BITS)) & ((1 << FAST_BITS) - 1)
    let r = fac[c]!
    if (r) { // fast-AC path
      k += (r >> 4) & 15 // run
      const s = r & 15 // combined length
      if (s > j.code_bits) stbi__err('bad huffman code')
      j.code_buffer = (j.code_buffer << s) >>> 0
      j.code_bits -= s
      // decode into unzigzag'd location
      const zig = stbi__jpeg_dezigzag[k++]!
      data[zig] = Math.imul(r >> 8, dequant[zig]!)
    } else {
      const rs = stbi__jpeg_huff_decode(j, hac)
      if (rs < 0) stbi__err('bad huffman code')
      const s = rs & 15
      r = rs >> 4
      if (s === 0) {
        if (rs !== 0xf0) break // end block
        k += 16
      } else {
        k += r
        // decode into unzigzag'd location
        const zig = stbi__jpeg_dezigzag[k++]!
        data[zig] = Math.imul(stbi__extend_receive(j, s), dequant[zig]!)
      }
    }
  } while (k < 64)
}

// stb_image.h:2264-2292
function stbi__jpeg_decode_block_prog_dc(j: StbiJpeg, data: Int16Array, hdc: StbiHuffman, b: number): void {
  if (j.spec_end !== 0) stbi__err("can't merge dc and ac")

  if (j.code_bits < 16) stbi__grow_buffer_unsafe(j)

  if (j.succ_high === 0) {
    // first scan for DC coefficient, must be first
    data.fill(0) // 0 all the ac values now
    const t = stbi__jpeg_huff_decode(j, hdc)
    if (t < 0 || t > 15) stbi__err("can't merge dc and ac")
    const diff = t ? stbi__extend_receive(j, t) : 0

    if (!stbi__addints_valid(j.img_comp[b]!.dc_pred, diff)) stbi__err('bad delta')
    const dc = j.img_comp[b]!.dc_pred + diff
    j.img_comp[b]!.dc_pred = dc
    if (!stbi__mul2shorts_valid(dc, 1 << j.succ_low)) stbi__err("can't merge dc and ac")
    data[0] = Math.imul(dc, 1 << j.succ_low)
  } else {
    // refinement scan for DC coefficient
    if (stbi__jpeg_get_bit(j)) data[0] = data[0]! + (1 << j.succ_low)
  }
}

// stb_image.h:2294-2414
function stbi__jpeg_decode_block_prog_ac(j: StbiJpeg, data: Int16Array, hac: StbiHuffman, fac: Int16Array): void {
  if (j.spec_start === 0) stbi__err("can't merge dc and ac")

  if (j.succ_high === 0) {
    const shift = j.succ_low

    if (j.eob_run) {
      --j.eob_run
      return
    }

    let k = j.spec_start
    do {
      if (j.code_bits < 16) stbi__grow_buffer_unsafe(j)
      const c = (j.code_buffer >>> (32 - FAST_BITS)) & ((1 << FAST_BITS) - 1)
      let r = fac[c]!
      if (r) { // fast-AC path
        k += (r >> 4) & 15 // run
        const s = r & 15 // combined length
        if (s > j.code_bits) stbi__err('bad huffman code')
        j.code_buffer = (j.code_buffer << s) >>> 0
        j.code_bits -= s
        const zig = stbi__jpeg_dezigzag[k++]!
        data[zig] = Math.imul(r >> 8, 1 << shift)
      } else {
        const rs = stbi__jpeg_huff_decode(j, hac)
        if (rs < 0) stbi__err('bad huffman code')
        const s = rs & 15
        r = rs >> 4
        if (s === 0) {
          if (r < 15) {
            j.eob_run = 1 << r
            if (r) j.eob_run += stbi__jpeg_get_bits(j, r)
            --j.eob_run
            break
          }
          k += 16
        } else {
          k += r
          const zig = stbi__jpeg_dezigzag[k++]!
          data[zig] = Math.imul(stbi__extend_receive(j, s), 1 << shift)
        }
      }
    } while (k <= j.spec_end)
  } else {
    // refinement scan for these AC coefficients

    const bit = (1 << j.succ_low) << 16 >> 16 // (short)

    if (j.eob_run) {
      --j.eob_run
      for (let k = j.spec_start; k <= j.spec_end; ++k) {
        const p = stbi__jpeg_dezigzag[k]!
        if (data[p] !== 0) {
          if (stbi__jpeg_get_bit(j)) {
            if ((data[p]! & bit) === 0) {
              if (data[p]! > 0) data[p] = data[p]! + bit
              else data[p] = data[p]! - bit
            }
          }
        }
      }
    } else {
      let k = j.spec_start
      do {
        let s: number
        const rs = stbi__jpeg_huff_decode(j, hac)
        if (rs < 0) stbi__err('bad huffman code')
        s = rs & 15
        let r = rs >> 4
        if (s === 0) {
          if (r < 15) {
            j.eob_run = (1 << r) - 1
            if (r) j.eob_run += stbi__jpeg_get_bits(j, r)
            r = 64 // force end of block
          } else {
            // r=15 s=0 should write 16 0s, so we just do
            // a run of 15 0s and then write s (which is 0),
            // so we don't have to do anything special here
          }
        } else {
          if (s !== 1) stbi__err('bad huffman code')
          // sign bit
          if (stbi__jpeg_get_bit(j)) s = bit
          else s = -bit
        }

        // advance by r
        while (k <= j.spec_end) {
          const p = stbi__jpeg_dezigzag[k++]!
          if (data[p] !== 0) {
            if (stbi__jpeg_get_bit(j)) {
              if ((data[p]! & bit) === 0) {
                if (data[p]! > 0) data[p] = data[p]! + bit
                else data[p] = data[p]! - bit
              }
            }
          } else {
            if (r === 0) {
              data[p] = s
              break
            }
            --r
          }
        }
      } while (k <= j.spec_end)
    }
  }
}

// take a -128..127 value and stbi__clamp it and convert to 0..255
// (stb_image.h:2416-2425)
function stbi__clamp(x: number): number {
  return x < 0 ? 0 : x > 255 ? 255 : x
}

// stbi__f2f (stb_image.h:2427): ((int) (((x) * 4096 + 0.5))) of a float literal
const f2f = (x: number): number => Math.trunc(Math.fround(x) * 4096 + 0.5)
const F_0_5411961 = f2f(0.5411961), F_N1_847759065 = f2f(-1.847759065), F_0_765366865 = f2f(0.765366865),
  F_1_175875602 = f2f(1.175875602), F_0_298631336 = f2f(0.298631336), F_2_053119869 = f2f(2.053119869),
  F_3_072711026 = f2f(3.072711026), F_1_501321110 = f2f(1.501321110), F_N0_899976223 = f2f(-0.899976223),
  F_N2_562915447 = f2f(-2.562915447), F_N1_961570560 = f2f(-1.961570560), F_N0_390180644 = f2f(-0.390180644)

// stb_image.h:2475-2523, with the STBI__IDCT_1D macro (:2430-2473, derived
// from jidctint -- DCT_ISLOW) expanded in place as the C preprocessor does.
const idctVal = new Int32Array(64)
function stbi__idct_block(out: Uint8Array, outOffset: number, out_stride: number, data: Int16Array): void {
  const val = idctVal
  // columns
  for (let i = 0; i < 8; ++i) {
    const d = i
    // if all zeroes, shortcut -- this avoids dequantizing 0s and IDCTing
    if (data[d + 8] === 0 && data[d + 16] === 0 && data[d + 24] === 0 && data[d + 32] === 0 &&
      data[d + 40] === 0 && data[d + 48] === 0 && data[d + 56] === 0) {
      const dcterm = data[d]! * 4
      val[i] = val[i + 8] = val[i + 16] = val[i + 24] = val[i + 32] = val[i + 40] = val[i + 48] =
        val[i + 56] = dcterm
    } else {
      // STBI__IDCT_1D(data[d]!..data[d + 56]!) (stb_image.h:2430-2473)
      let p2 = data[d + 16]!
      let p3 = data[d + 48]!
      let p1 = Math.imul(p2 + p3, F_0_5411961)
      let t2 = (p1 + Math.imul(p3, F_N1_847759065)) | 0
      let t3 = (p1 + Math.imul(p2, F_0_765366865)) | 0
      p2 = data[d]!
      p3 = data[d + 32]!
      let t0 = (p2 + p3) << 12 // stbi__fsh
      let t1 = (p2 - p3) << 12
      let x0 = (t0 + t3) | 0
      let x3 = (t0 - t3) | 0
      let x1 = (t1 + t2) | 0
      let x2 = (t1 - t2) | 0
      t0 = data[d + 56]!
      t1 = data[d + 40]!
      t2 = data[d + 24]!
      t3 = data[d + 8]!
      p3 = (t0 + t2) | 0
      let p4 = (t1 + t3) | 0
      p1 = (t0 + t3) | 0
      p2 = (t1 + t2) | 0
      const p5 = Math.imul(p3 + p4, F_1_175875602)
      t0 = Math.imul(t0, F_0_298631336)
      t1 = Math.imul(t1, F_2_053119869)
      t2 = Math.imul(t2, F_3_072711026)
      t3 = Math.imul(t3, F_1_501321110)
      p1 = (p5 + Math.imul(p1, F_N0_899976223)) | 0
      p2 = (p5 + Math.imul(p2, F_N2_562915447)) | 0
      p3 = Math.imul(p3, F_N1_961570560)
      p4 = Math.imul(p4, F_N0_390180644)
      t3 = (t3 + p1 + p4) | 0
      t2 = (t2 + p2 + p3) | 0
      t1 = (t1 + p2 + p4) | 0
      t0 = (t0 + p1 + p3) | 0
      // constants scaled things up by 1<<12; let's bring them back
      // down, but keep 2 extra bits of precision
      x0 = (x0 + 512) | 0; x1 = (x1 + 512) | 0; x2 = (x2 + 512) | 0; x3 = (x3 + 512) | 0
      val[i] = ((x0 + t3) | 0) >> 10
      val[i + 56] = ((x0 - t3) | 0) >> 10
      val[i + 8] = ((x1 + t2) | 0) >> 10
      val[i + 48] = ((x1 - t2) | 0) >> 10
      val[i + 16] = ((x2 + t1) | 0) >> 10
      val[i + 40] = ((x2 - t1) | 0) >> 10
      val[i + 24] = ((x3 + t0) | 0) >> 10
      val[i + 32] = ((x3 - t0) | 0) >> 10
    }
  }

  for (let i = 0, v = 0, o = outOffset; i < 8; ++i, v += 8, o += out_stride) {
    // no fast case since the first 1D IDCT spread components out
    // STBI__IDCT_1D(val[v]!..val[v + 7]!) (stb_image.h:2430-2473)
    let p2 = val[v + 2]!
    let p3 = val[v + 6]!
    let p1 = Math.imul(p2 + p3, F_0_5411961)
    let t2 = (p1 + Math.imul(p3, F_N1_847759065)) | 0
    let t3 = (p1 + Math.imul(p2, F_0_765366865)) | 0
    p2 = val[v]!
    p3 = val[v + 4]!
    let t0 = (p2 + p3) << 12 // stbi__fsh
    let t1 = (p2 - p3) << 12
    let x0 = (t0 + t3) | 0
    let x3 = (t0 - t3) | 0
    let x1 = (t1 + t2) | 0
    let x2 = (t1 - t2) | 0
    t0 = val[v + 7]!
    t1 = val[v + 5]!
    t2 = val[v + 3]!
    t3 = val[v + 1]!
    p3 = (t0 + t2) | 0
    let p4 = (t1 + t3) | 0
    p1 = (t0 + t3) | 0
    p2 = (t1 + t2) | 0
    const p5 = Math.imul(p3 + p4, F_1_175875602)
    t0 = Math.imul(t0, F_0_298631336)
    t1 = Math.imul(t1, F_2_053119869)
    t2 = Math.imul(t2, F_3_072711026)
    t3 = Math.imul(t3, F_1_501321110)
    p1 = (p5 + Math.imul(p1, F_N0_899976223)) | 0
    p2 = (p5 + Math.imul(p2, F_N2_562915447)) | 0
    p3 = Math.imul(p3, F_N1_961570560)
    p4 = Math.imul(p4, F_N0_390180644)
    t3 = (t3 + p1 + p4) | 0
    t2 = (t2 + p2 + p3) | 0
    t1 = (t1 + p2 + p4) | 0
    t0 = (t0 + p1 + p3) | 0
    // constants scaled things up by 1<<12, plus we had 1<<2 from first
    // loop, plus horizontal and vertical each scale by sqrt(8) so together
    // we've got an extra 1<<3, so 1<<17 total we need to remove.
    // so we want to round that, which means adding 0.5 * 1<<17,
    // aka 65536. Also, we'll end up with -128 to 127 that we want
    // to encode as 0..255 by adding 128, so we'll add that before the shift
    x0 = (x0 + 65536 + (128 << 17)) | 0
    x1 = (x1 + 65536 + (128 << 17)) | 0
    x2 = (x2 + 65536 + (128 << 17)) | 0
    x3 = (x3 + 65536 + (128 << 17)) | 0
    // tried computing the shifts into temps, or'ing the temps to see
    // if any were out of range, but that was slower
    out[o] = stbi__clamp(((x0 + t3) | 0) >> 17)
    out[o + 7] = stbi__clamp(((x0 - t3) | 0) >> 17)
    out[o + 1] = stbi__clamp(((x1 + t2) | 0) >> 17)
    out[o + 6] = stbi__clamp(((x1 - t2) | 0) >> 17)
    out[o + 2] = stbi__clamp(((x2 + t1) | 0) >> 17)
    out[o + 5] = stbi__clamp(((x2 - t1) | 0) >> 17)
    out[o + 3] = stbi__clamp(((x3 + t0) | 0) >> 17)
    out[o + 4] = stbi__clamp(((x3 - t0) | 0) >> 17)
  }
}

// stb_image.h:2914
const STBI__MARKER_none = 0xff

// if there's a pending marker from the entropy stream, return that
// otherwise, fetch from the stream and get a marker. if there's no
// marker, return 0xff, which is never a valid marker value
// (stb_image.h:2915-2929)
function stbi__get_marker(j: StbiJpeg): number {
  let x: number
  if (j.marker !== STBI__MARKER_none) {
    x = j.marker
    j.marker = STBI__MARKER_none
    return x
  }
  x = j.s.get8()
  if (x !== 0xff) return STBI__MARKER_none
  while (x === 0xff) x = j.s.get8() // consume repeated 0xff fill bytes
  return x
}

// stb_image.h:2933
const STBI__RESTART = (x: number): boolean => x >= 0xd0 && x <= 0xd7

// after a restart interval, stbi__jpeg_reset the entropy decoder and
// the dc prediction (stb_image.h:2935-2946)
function stbi__jpeg_reset(j: StbiJpeg): void {
  j.code_bits = 0
  j.code_buffer = 0
  j.nomore = 0
  j.img_comp[0]!.dc_pred = j.img_comp[1]!.dc_pred = j.img_comp[2]!.dc_pred = j.img_comp[3]!.dc_pred = 0
  j.marker = STBI__MARKER_none
  j.todo = j.restart_interval ? j.restart_interval : 0x7fffffff
  j.eob_run = 0
}

/** The restart countdown after each MCU (stb_image.h:2971-2978 and its
 *  copies): false when the scan ends here. */
function stbi__restart_countdown(z: StbiJpeg): boolean {
  if (--z.todo <= 0) {
    if (z.code_bits < 24) stbi__grow_buffer_unsafe(z)
    // if it's NOT a restart, then just bail, so we get corrupt data
    // rather than no data
    if (!STBI__RESTART(z.marker)) return false
    stbi__jpeg_reset(z)
  }
  return true
}

// stb_image.h:2948-3070
function stbi__parse_entropy_coded_data(z: StbiJpeg): void {
  stbi__jpeg_reset(z)
  if (!z.progressive) {
    const data = new Int16Array(64)
    if (z.scan_n === 1) {
      const n = z.order[0]!
      const comp = z.img_comp[n]!
      // non-interleaved data, we just need to process one block at a time,
      // in trivial scanline order
      // number of blocks to do just depends on how many actual "pixels" this
      // component has, independent of interleaved MCU blocking and such
      const w = (comp.x + 7) >> 3
      const h = (comp.y + 7) >> 3
      for (let j = 0; j < h; ++j) {
        for (let i = 0; i < w; ++i) {
          const ha = comp.ha
          stbi__jpeg_decode_block(z, data, z.huff_dc[comp.hd]!, z.huff_ac[ha]!, z.fast_ac[ha]!, n,
            z.dequant[comp.tq]!)
          stbi__idct_block(comp.data!, comp.w2 * j * 8 + i * 8, comp.w2, data)
          // every data block is an MCU, so countdown the restart interval
          if (!stbi__restart_countdown(z)) return
        }
      }
    } else { // interleaved
      for (let j = 0; j < z.img_mcu_y; ++j) {
        for (let i = 0; i < z.img_mcu_x; ++i) {
          // scan an interleaved mcu... process scan_n components in order
          for (let k = 0; k < z.scan_n; ++k) {
            const n = z.order[k]!
            const comp = z.img_comp[n]!
            // scan out an mcu's worth of this component; that's just determined
            // by the basic H and V specified for the component
            for (let y = 0; y < comp.v; ++y) {
              for (let x = 0; x < comp.h; ++x) {
                const x2 = (i * comp.h + x) * 8
                const y2 = (j * comp.v + y) * 8
                const ha = comp.ha
                stbi__jpeg_decode_block(z, data, z.huff_dc[comp.hd]!, z.huff_ac[ha]!, z.fast_ac[ha]!, n,
                  z.dequant[comp.tq]!)
                stbi__idct_block(comp.data!, comp.w2 * y2 + x2, comp.w2, data)
              }
            }
          }
          // after all interleaved components, that's an interleaved MCU,
          // so now count down the restart interval
          if (!stbi__restart_countdown(z)) return
        }
      }
    }
  } else {
    if (z.scan_n === 1) {
      const n = z.order[0]!
      const comp = z.img_comp[n]!
      // non-interleaved data, we just need to process one block at a time,
      // in trivial scanline order
      const w = (comp.x + 7) >> 3
      const h = (comp.y + 7) >> 3
      for (let j = 0; j < h; ++j) {
        for (let i = 0; i < w; ++i) {
          const off = 64 * (i + j * comp.coeff_w)
          const data = comp.coeff!.subarray(off, off + 64)
          if (z.spec_start === 0) {
            stbi__jpeg_decode_block_prog_dc(z, data, z.huff_dc[comp.hd]!, n)
          } else {
            const ha = comp.ha
            stbi__jpeg_decode_block_prog_ac(z, data, z.huff_ac[ha]!, z.fast_ac[ha]!)
          }
          // every data block is an MCU, so countdown the restart interval
          if (!stbi__restart_countdown(z)) return
        }
      }
    } else { // interleaved
      for (let j = 0; j < z.img_mcu_y; ++j) {
        for (let i = 0; i < z.img_mcu_x; ++i) {
          // scan an interleaved mcu... process scan_n components in order
          for (let k = 0; k < z.scan_n; ++k) {
            const n = z.order[k]!
            const comp = z.img_comp[n]!
            // scan out an mcu's worth of this component; that's just determined
            // by the basic H and V specified for the component
            for (let y = 0; y < comp.v; ++y) {
              for (let x = 0; x < comp.h; ++x) {
                const x2 = i * comp.h + x
                const y2 = j * comp.v + y
                const off = 64 * (x2 + y2 * comp.coeff_w)
                stbi__jpeg_decode_block_prog_dc(z, comp.coeff!.subarray(off, off + 64), z.huff_dc[comp.hd]!, n)
              }
            }
          }
          // after all interleaved components, that's an interleaved MCU,
          // so now count down the restart interval
          if (!stbi__restart_countdown(z)) return
        }
      }
    }
  }
}

// stb_image.h:3072-3077
function stbi__jpeg_dequantize(data: Int16Array, dequant: Uint16Array): void {
  for (let i = 0; i < 64; ++i) data[i] = Math.imul(data[i]!, dequant[i]!)
}

// stb_image.h:3079-3096
function stbi__jpeg_finish(z: StbiJpeg): void {
  if (z.progressive) {
    // dequantize and idct the data
    for (let n = 0; n < z.s.img_n; ++n) {
      const comp = z.img_comp[n]!
      const w = (comp.x + 7) >> 3
      const h = (comp.y + 7) >> 3
      for (let j = 0; j < h; ++j) {
        for (let i = 0; i < w; ++i) {
          const off = 64 * (i + j * comp.coeff_w)
          const data = comp.coeff!.subarray(off, off + 64)
          stbi__jpeg_dequantize(data, z.dequant[comp.tq]!)
          stbi__idct_block(comp.data!, comp.w2 * j * 8 + i * 8, comp.w2, data)
        }
      }
    }
  }
}

// stb_image.h:3098-3199. Returns stb's int result (0 or 1).
function stbi__process_marker(z: StbiJpeg, m: number): boolean {
  let L: number
  switch (m) {
    case STBI__MARKER_none: // no marker found
      stbi__err('expected marker')

    case 0xDD: // DRI - specify restart interval
      if (z.s.get16be() !== 4) stbi__err('bad DRI len')
      z.restart_interval = z.s.get16be()
      return true

    case 0xDB: // DQT - define quantization table
      L = z.s.get16be() - 2
      while (L > 0) {
        const q = z.s.get8()
        const p = q >> 4, sixteen = p !== 0
        const t = q & 15
        if (p !== 0 && p !== 1) stbi__err('bad DQT type')
        if (t > 3) stbi__err('bad DQT table')

        for (let i = 0; i < 64; ++i) {
          z.dequant[t]![stbi__jpeg_dezigzag[i]!] = sixteen ? z.s.get16be() : z.s.get8()
        }
        L -= sixteen ? 129 : 65
      }
      return L === 0

    case 0xC4: // DHT - define huffman table
      L = z.s.get16be() - 2
      while (L > 0) {
        const sizes: number[] = []
        let n = 0
        const q = z.s.get8()
        const tc = q >> 4
        const th = q & 15
        if (tc > 1 || th > 3) stbi__err('bad DHT header')
        for (let i = 0; i < 16; ++i) {
          sizes[i] = z.s.get8()
          n += sizes[i]!
        }
        if (n > 256) stbi__err('bad DHT header') // Loop over i < n would write past end of values!
        L -= 17
        let v: Uint8Array
        if (tc === 0) {
          stbi__build_huffman(z.huff_dc[th]!, sizes)
          v = z.huff_dc[th]!.values
        } else {
          stbi__build_huffman(z.huff_ac[th]!, sizes)
          v = z.huff_ac[th]!.values
        }
        for (let i = 0; i < n; ++i) v[i] = z.s.get8()
        if (tc !== 0) stbi__build_fast_ac(z.fast_ac[th]!, z.huff_ac[th]!)
        L -= n
      }
      return L === 0
  }

  // check for comment block or APP blocks
  if ((m >= 0xE0 && m <= 0xEF) || m === 0xFE) {
    L = z.s.get16be()
    if (L < 2) {
      if (m === 0xFE) stbi__err('bad COM len')
      else stbi__err('bad APP len')
    }
    L -= 2

    if (m === 0xE0 && L >= 5) { // JFIF APP0 segment
      const tag = [0x4a, 0x46, 0x49, 0x46, 0] // 'J','F','I','F','\0'
      let ok = true
      for (let i = 0; i < 5; ++i) if (z.s.get8() !== tag[i]) ok = false
      L -= 5
      if (ok) z.jfif = 1
    } else if (m === 0xEE && L >= 12) { // Adobe APP14 segment
      const tag = [0x41, 0x64, 0x6f, 0x62, 0x65, 0] // 'A','d','o','b','e','\0'
      let ok = true
      for (let i = 0; i < 6; ++i) if (z.s.get8() !== tag[i]) ok = false
      L -= 6
      if (ok) {
        z.s.get8() // version
        z.s.get16be() // flags0
        z.s.get16be() // flags1
        z.app14_color_transform = z.s.get8() // color transform
        L -= 6
      }
    }

    z.s.skip(L)
    return true
  }

  stbi__err('unknown marker')
}

// after we see SOS (stb_image.h:3201-3239). Returns false where stb returns
// 0 without setting a failure reason.
function stbi__process_scan_header(z: StbiJpeg): boolean {
  const Ls = z.s.get16be()
  z.scan_n = z.s.get8()
  if (z.scan_n < 1 || z.scan_n > 4 || z.scan_n > z.s.img_n) stbi__err('bad SOS component count')
  if (Ls !== 6 + 2 * z.scan_n) stbi__err('bad SOS len')
  for (let i = 0; i < z.scan_n; ++i) {
    const id = z.s.get8()
    let which: number
    const q = z.s.get8()
    for (which = 0; which < z.s.img_n; ++which) if (z.img_comp[which]!.id === id) break
    if (which === z.s.img_n) return false // no match
    z.img_comp[which]!.hd = q >> 4; if (z.img_comp[which]!.hd > 3) stbi__err('bad DC huff')
    z.img_comp[which]!.ha = q & 15; if (z.img_comp[which]!.ha > 3) stbi__err('bad AC huff')
    z.order[i] = which
  }

  z.spec_start = z.s.get8()
  z.spec_end = z.s.get8() // should be 63, but might be 0
  const aa = z.s.get8()
  z.succ_high = aa >> 4
  z.succ_low = aa & 15
  if (z.progressive) {
    if (z.spec_start > 63 || z.spec_end > 63 || z.spec_start > z.spec_end || z.succ_high > 13 || z.succ_low > 13) {
      stbi__err('bad SOS')
    }
  } else {
    if (z.spec_start !== 0) stbi__err('bad SOS')
    if (z.succ_high !== 0 || z.succ_low !== 0) stbi__err('bad SOS')
    z.spec_end = 63
  }

  return true
}

// stb_image.h:1590-1594 STBI__SCAN_load / _type / _header
const STBI__SCAN_load = 0, STBI__SCAN_type = 1, STBI__SCAN_header = 2

// stb_image.h:3263-3355
function stbi__process_frame_header(z: StbiJpeg, scan: number): void {
  const s = z.s
  let h_max = 1, v_max = 1
  const Lf = s.get16be(); if (Lf < 11) stbi__err('bad SOF len') // JPEG
  const p = s.get8(); if (p !== 8) stbi__err('only 8-bit') // JPEG baseline
  s.img_y = s.get16be(); if (s.img_y === 0) stbi__err('no header height') // Legal, but we don't handle it--but neither does IJG
  s.img_x = s.get16be(); if (s.img_x === 0) stbi__err('0 width') // JPEG requires
  if (s.img_y > STBI_MAX_DIMENSIONS) stbi__err('too large')
  if (s.img_x > STBI_MAX_DIMENSIONS) stbi__err('too large')
  const c = s.get8()
  if (c !== 3 && c !== 1 && c !== 4) stbi__err('bad component count')
  s.img_n = c
  for (let i = 0; i < c; ++i) {
    z.img_comp[i]!.data = null
    z.img_comp[i]!.linebuf = null
  }

  if (Lf !== 8 + 3 * s.img_n) stbi__err('bad SOF len')

  z.rgb = 0
  for (let i = 0; i < s.img_n; ++i) {
    const rgb = [0x52, 0x47, 0x42] // 'R', 'G', 'B'
    const comp = z.img_comp[i]!
    comp.id = s.get8()
    if (s.img_n === 3 && comp.id === rgb[i]) ++z.rgb
    const q = s.get8()
    comp.h = q >> 4; if (!comp.h || comp.h > 4) stbi__err('bad H')
    comp.v = q & 15; if (!comp.v || comp.v > 4) stbi__err('bad V')
    comp.tq = s.get8(); if (comp.tq > 3) stbi__err('bad TQ')
  }

  if (scan !== STBI__SCAN_load) return

  if (!stbi__mad3sizes_valid(s.img_x, s.img_y, s.img_n, 0)) stbi__err('too large')

  for (let i = 0; i < s.img_n; ++i) {
    if (z.img_comp[i]!.h > h_max) h_max = z.img_comp[i]!.h
    if (z.img_comp[i]!.v > v_max) v_max = z.img_comp[i]!.v
  }

  // check that plane subsampling factors are integer ratios; our resamplers can't deal with fractional ratios
  // and I've never seen a non-corrupted JPEG file actually use them
  for (let i = 0; i < s.img_n; ++i) {
    if (h_max % z.img_comp[i]!.h !== 0) stbi__err('bad H')
    if (v_max % z.img_comp[i]!.v !== 0) stbi__err('bad V')
  }

  // compute interleaved mcu info
  z.img_h_max = h_max
  z.img_v_max = v_max
  z.img_mcu_w = h_max * 8
  z.img_mcu_h = v_max * 8
  // these sizes can't be more than 17 bits
  z.img_mcu_x = Math.floor((s.img_x + z.img_mcu_w - 1) / z.img_mcu_w)
  z.img_mcu_y = Math.floor((s.img_y + z.img_mcu_h - 1) / z.img_mcu_h)

  for (let i = 0; i < s.img_n; ++i) {
    const comp = z.img_comp[i]!
    // number of effective pixels (e.g. for non-interleaved MCU)
    comp.x = Math.floor((s.img_x * comp.h + h_max - 1) / h_max)
    comp.y = Math.floor((s.img_y * comp.v + v_max - 1) / v_max)
    // to simplify generation, we'll allocate enough memory to decode
    // the bogus oversized data from using interleaved MCUs and their
    // big blocks (e.g. a 16x16 iMCU on an image of width 33); we won't
    // discard the extra data until colorspace conversion
    comp.w2 = z.img_mcu_x * comp.h * 8
    comp.h2 = z.img_mcu_y * comp.v * 8
    comp.coeff = null
    comp.linebuf = null
    // stbi__malloc_mad2(w2, h2, 15): the 15 bytes align the blocks for SIMD
    comp.data = new Uint8Array(comp.w2 * comp.h2)
    if (z.progressive) {
      // w2, h2 are multiples of 8 (see above)
      comp.coeff_w = comp.w2 / 8
      comp.coeff_h = comp.h2 / 8
      comp.coeff = new Int16Array(comp.w2 * comp.h2)
    }
  }
}

// use comparisons since in some cases we handle more than one case (e.g. SOF)
// (stb_image.h:3357-3363)
const stbi__DNL = (x: number): boolean => x === 0xdc
const stbi__SOI = (x: number): boolean => x === 0xd8
const stbi__EOI = (x: number): boolean => x === 0xd9
const stbi__SOF = (x: number): boolean => x === 0xc0 || x === 0xc1 || x === 0xc2
const stbi__SOS = (x: number): boolean => x === 0xda
const stbi__SOF_progressive = (x: number): boolean => x === 0xc2

// stb_image.h:3364-3386
function stbi__decode_jpeg_header(z: StbiJpeg, scan: number): void {
  z.jfif = 0
  z.app14_color_transform = -1 // valid values are 0,1,2
  z.marker = STBI__MARKER_none // initialize cached marker to empty
  let m = stbi__get_marker(z)
  if (!stbi__SOI(m)) stbi__err('no SOI')
  if (scan === STBI__SCAN_type) return
  m = stbi__get_marker(z)
  while (!stbi__SOF(m)) {
    if (!stbi__process_marker(z, m)) stbi__err('marker')
    m = stbi__get_marker(z)
    while (m === STBI__MARKER_none) {
      // some files have extra padding after their blocks, so ok, we'll scan
      if (z.s.atEof()) stbi__err('no SOF')
      m = stbi__get_marker(z)
    }
  }
  z.progressive = stbi__SOF_progressive(m)
  stbi__process_frame_header(z, scan)
}

// stb_image.h:3388-3408
function stbi__skip_jpeg_junk_at_end(j: StbiJpeg): number {
  // some JPEGs have junk at end, skip over it but if we find what looks
  // like a valid marker, resume there
  while (!j.s.atEof()) {
    let x = j.s.get8()
    while (x === 0xff) { // might be a marker
      if (j.s.atEof()) return STBI__MARKER_none
      x = j.s.get8()
      if (x !== 0x00 && x !== 0xff) {
        // not a stuffed zero or lead-in to another marker, looks
        // like an actual marker, return it
        return x
      }
      // stuffed zero has x=0 now which ends the loop, meaning we go
      // back to regular scan loop.
      // repeated 0xff keeps trying to read the next byte of the marker.
    }
  }
  return STBI__MARKER_none
}

// decode image to YCbCr format (stb_image.h:3410-3448). Returns false where
// stb returns 0 without a failure reason.
function stbi__decode_jpeg_image(j: StbiJpeg): boolean {
  j.restart_interval = 0
  stbi__decode_jpeg_header(j, STBI__SCAN_load)
  let m = stbi__get_marker(j)
  while (!stbi__EOI(m)) {
    if (stbi__SOS(m)) {
      if (!stbi__process_scan_header(j)) return false
      stbi__parse_entropy_coded_data(j)
      if (j.marker === STBI__MARKER_none) {
        j.marker = stbi__skip_jpeg_junk_at_end(j)
        // if we reach eof without hitting a marker, stbi__get_marker() below will fail and we'll eventually return 0
      }
      m = stbi__get_marker(j)
      if (STBI__RESTART(m)) m = stbi__get_marker(j)
    } else if (stbi__DNL(m)) {
      const Ld = j.s.get16be()
      const NL = j.s.get16be()
      if (Ld !== 4) stbi__err('bad DNL len')
      if (NL !== j.s.img_y) stbi__err('bad DNL height')
      m = stbi__get_marker(j)
    } else {
      // a marker stb cannot process ends the image, successfully
      // (stbi__process_marker's 0, failure reason set or not)
      let processed: boolean
      try {
        processed = stbi__process_marker(j, m)
      } catch (e) {
        if (!(e instanceof StbiError)) throw e
        processed = false
      }
      if (!processed) return true
      m = stbi__get_marker(j)
    }
  }
  if (j.progressive) stbi__jpeg_finish(j)
  return true
}

// static jfif-centered resampling (across block boundaries)
// (stb_image.h:3450-3654). A resampler returns the row it produced: `out`,
// or the input row itself for resample_row_1. Rows are (array, offset).
type ResampleRowFunc = (out: Uint8Array, data: Uint8Array, in_near: number, in_far: number, w: number,
  hs: number) => [Uint8Array, number]

const stbi__div4 = (x: number): number => (x >> 2) & 255

// stb_image.h:3457-3464
const resample_row_1: ResampleRowFunc = (_out, data, in_near) => [data, in_near]

// stb_image.h:3466-3474
const stbi__resample_row_v_2: ResampleRowFunc = (out, data, in_near, in_far, w) => {
  // need to generate two samples vertically for every one in input
  for (let i = 0; i < w; ++i) out[i] = stbi__div4(3 * data[in_near + i]! + data[in_far + i]! + 2)
  return [out, 0]
}

// stb_image.h:3476-3504
const stbi__resample_row_h_2: ResampleRowFunc = (out, data, in_near, _in_far, w) => {
  // need to generate two samples horizontally for every one in input
  const input = (i: number): number => data[in_near + i]!

  if (w === 1) {
    // if only one sample, can't do any interpolation
    out[0] = out[1] = input(0)
    return [out, 0]
  }

  out[0] = input(0)
  out[1] = stbi__div4(input(0) * 3 + input(1) + 2)
  let i: number
  for (i = 1; i < w - 1; ++i) {
    const n = 3 * input(i) + 2
    out[i * 2 + 0] = stbi__div4(n + input(i - 1))
    out[i * 2 + 1] = stbi__div4(n + input(i + 1))
  }
  out[i * 2 + 0] = stbi__div4(input(w - 2) * 3 + input(w - 1) + 2)
  out[i * 2 + 1] = input(w - 1)

  return [out, 0]
}

const stbi__div16 = (x: number): number => (x >> 4) & 255

// stb_image.h:3508-3531
const stbi__resample_row_hv_2: ResampleRowFunc = (out, data, in_near, in_far, w) => {
  // need to generate 2x2 samples for every one in input
  if (w === 1) {
    out[0] = out[1] = stbi__div4(3 * data[in_near]! + data[in_far]! + 2)
    return [out, 0]
  }

  let t1 = 3 * data[in_near]! + data[in_far]!
  out[0] = stbi__div4(t1 + 2)
  for (let i = 1; i < w; ++i) {
    const t0 = t1
    t1 = 3 * data[in_near + i]! + data[in_far + i]!
    out[i * 2 - 1] = stbi__div16(3 * t0 + t1 + 8)
    out[i * 2] = stbi__div16(3 * t1 + t0 + 8)
  }
  out[w * 2 - 1] = stbi__div4(t1 + 2)

  return [out, 0]
}

// stb_image.h:3644-3653
const stbi__resample_row_generic: ResampleRowFunc = (out, data, in_near, _in_far, w, hs) => {
  // resample with nearest-neighbor
  for (let i = 0; i < w; ++i) for (let j = 0; j < hs; ++j) out[i * hs + j] = data[in_near + i]!
  return [out, 0]
}

// this is a reduced-precision calculation of YCbCr-to-RGB introduced
// to make sure the code produces the same results in both SIMD and scalar
// (stb_image.h:3655-3685). stbi__float2fixed: float arithmetic.
const stbi__float2fixed = (x: number): number =>
  Math.trunc(Math.fround(Math.fround(Math.fround(x) * 4096) + 0.5)) << 8
const CR_R = stbi__float2fixed(1.40200), CR_G = -stbi__float2fixed(0.71414),
  CB_G = -stbi__float2fixed(0.34414), CB_B = stbi__float2fixed(1.77200)
function stbi__YCbCr_to_RGB_row(out: Uint8Array, o: number, y: Uint8Array, yo: number, pcb: Uint8Array,
  cbo: number, pcr: Uint8Array, cro: number, count: number, step: number): void {
  for (let i = 0; i < count; ++i) {
    const y_fixed = (y[yo + i]! << 20) + (1 << 19) // rounding
    const cr = pcr[cro + i]! - 128
    const cb = pcb[cbo + i]! - 128
    let r = (y_fixed + Math.imul(cr, CR_R)) | 0
    let g = (y_fixed + Math.imul(cr, CR_G) + (Math.imul(cb, CB_G) & 0xffff0000)) | 0
    let b = (y_fixed + Math.imul(cb, CB_B)) | 0
    r >>= 20
    g >>= 20
    b >>= 20
    if (r >>> 0 > 255) { if (r < 0) r = 0; else r = 255 }
    if (g >>> 0 > 255) { if (g < 0) g = 0; else g = 255 }
    if (b >>> 0 > 255) { if (b < 0) b = 0; else b = 255 }
    out[o] = r
    out[o + 1] = g
    out[o + 2] = b
    out[o + 3] = 255
    o += step
  }
}

// stbi__resample (stb_image.h:3846-3854)
interface StbiResample {
  resample: ResampleRowFunc
  line0: number
  line1: number // offsets into the component's data
  hs: number
  vs: number // expansion factor in each axis
  w_lores: number // horizontal pixels pre-expansion
  ystep: number // how far through vertical expansion we are
  ypos: number // which pre-expansion row we're on
}

// fast 0..255 * 0..255 => 0..255 rounded multiplication (stb_image.h:3856-3861)
function stbi__blinn_8x8(x: number, y: number): number {
  const t = x * y + 128
  return ((t + (t >>> 8)) >>> 8) & 255
}

// stb_image.h:3863-4027 with req_comp 0: n is 3 for 3 and 4 components, 1
// for one, so the n < 3 branches only see one-component images.
function load_jpeg_image(z: StbiJpeg): StbiImage | null {
  z.s.img_n = 0 // make stbi__cleanup_jpeg safe

  // load a jpeg image from whichever source, but leave in YCbCr format
  if (!stbi__decode_jpeg_image(z)) return null

  // determine actual number of components to generate
  const n = z.s.img_n >= 3 ? 3 : 1

  const is_rgb = z.s.img_n === 3 && (z.rgb === 3 || (z.app14_color_transform === 0 && !z.jfif))

  const decode_n = z.s.img_n === 3 && n < 3 && !is_rgb ? 1 : z.s.img_n

  // nothing to do if no components requested; check this now to avoid
  // accessing uninitialized coutput[0] later
  if (decode_n <= 0) return null

  // resample and color-convert
  const coutput: [Uint8Array, number][] = []
  const res_comp: StbiResample[] = []

  for (let k = 0; k < decode_n; ++k) {
    const comp = z.img_comp[k]!
    // allocate line buffer big enough for upsampling off the edges
    // with upsample factor of 4
    comp.linebuf = new Uint8Array(z.s.img_x + 3)

    const hs = z.img_h_max / comp.h
    const vs = z.img_v_max / comp.v
    let resample: ResampleRowFunc
    if (hs === 1 && vs === 1) resample = resample_row_1
    else if (hs === 1 && vs === 2) resample = stbi__resample_row_v_2
    else if (hs === 2 && vs === 1) resample = stbi__resample_row_h_2
    else if (hs === 2 && vs === 2) resample = stbi__resample_row_hv_2
    else resample = stbi__resample_row_generic
    res_comp.push({
      resample, hs, vs,
      ystep: vs >> 1,
      w_lores: Math.floor((z.s.img_x + hs - 1) / hs),
      ypos: 0,
      line0: 0,
      line1: 0,
    })
  }

  // can't error after this so, this is safe. stbi__malloc_mad3(n, x, y, 1):
  // the extra byte takes the out[3] = 255 the n == 3 conversions write
  // after the last pixel.
  const size = n * z.s.img_x * z.s.img_y
  const output = new Uint8Array(size + 1)

  // now go ahead and resample
  for (let j = 0; j < z.s.img_y; ++j) {
    let out = n * z.s.img_x * j
    for (let k = 0; k < decode_n; ++k) {
      const r = res_comp[k]!
      const comp = z.img_comp[k]!
      const y_bot = r.ystep >= (r.vs >> 1)
      coutput[k] = r.resample(comp.linebuf!, comp.data!,
        y_bot ? r.line1 : r.line0,
        y_bot ? r.line0 : r.line1,
        r.w_lores, r.hs)
      if (++r.ystep >= r.vs) {
        r.ystep = 0
        r.line0 = r.line1
        if (++r.ypos < comp.y) r.line1 += comp.w2
      }
    }
    const [y, yo] = coutput[0]!
    if (n >= 3) {
      if (z.s.img_n === 3) {
        const [c1, o1] = coutput[1]!, [c2, o2] = coutput[2]!
        if (is_rgb) {
          for (let i = 0; i < z.s.img_x; ++i) {
            output[out] = y[yo + i]!
            output[out + 1] = c1[o1 + i]!
            output[out + 2] = c2[o2 + i]!
            output[out + 3] = 255
            out += n
          }
        } else {
          stbi__YCbCr_to_RGB_row(output, out, y, yo, c1, o1, c2, o2, z.s.img_x, n)
        }
      } else if (z.s.img_n === 4) {
        const [c1, o1] = coutput[1]!, [c2, o2] = coutput[2]!, [c3, o3] = coutput[3]!
        if (z.app14_color_transform === 0) { // CMYK
          for (let i = 0; i < z.s.img_x; ++i) {
            const m = c3[o3 + i]!
            output[out] = stbi__blinn_8x8(y[yo + i]!, m)
            output[out + 1] = stbi__blinn_8x8(c1[o1 + i]!, m)
            output[out + 2] = stbi__blinn_8x8(c2[o2 + i]!, m)
            output[out + 3] = 255
            out += n
          }
        } else if (z.app14_color_transform === 2) { // YCCK
          stbi__YCbCr_to_RGB_row(output, out, y, yo, c1, o1, c2, o2, z.s.img_x, n)
          for (let i = 0; i < z.s.img_x; ++i) {
            const m = c3[o3 + i]!
            output[out] = stbi__blinn_8x8(255 - output[out]!, m)
            output[out + 1] = stbi__blinn_8x8(255 - output[out + 1]!, m)
            output[out + 2] = stbi__blinn_8x8(255 - output[out + 2]!, m)
            out += n
          }
        } else { // YCbCr + alpha?  Ignore the fourth channel for now
          stbi__YCbCr_to_RGB_row(output, out, y, yo, c1, o1, c2, o2, z.s.img_x, n)
        }
      } else {
        for (let i = 0; i < z.s.img_x; ++i) {
          output[out] = output[out + 1] = output[out + 2] = y[yo + i]!
          output[out + 3] = 255 // not used if n==3
          out += n
        }
      }
    } else {
      // n == 1: one-component images only (see above), so is_rgb is false
      // and stb's compute_y / CMYK / YCCK branches for n < 3 are not
      // reached with req_comp 0.
      for (let i = 0; i < z.s.img_x; ++i) output[out + i] = y[yo + i]!
    }
  }
  // report original components, not output
  return { width: z.s.img_x, height: z.s.img_y, channels: z.s.img_n >= 3 ? 3 : 1,
    data: output.subarray(0, size) }
}

/** stbi__jpeg_test (stb_image.h:4045-4056): a JPEG starts with an SOI marker. */
export function stbi__jpeg_test(s: StbiContext): boolean {
  const j = new StbiJpeg(s)
  let r: boolean
  try {
    stbi__decode_jpeg_header(j, STBI__SCAN_type)
    r = true
  } catch (e) {
    if (!(e instanceof StbiError)) throw e
    r = false
  }
  s.rewind()
  return r
}

/** stbi__jpeg_info (stb_image.h:4058-4083): width, height and the
 *  component count stb reports (3 for 3 and 4 components, else 1). */
export function stbi__jpeg_info(s: StbiContext): { x: number, y: number, comp: number } | null {
  const j = new StbiJpeg(s)
  try {
    stbi__decode_jpeg_header(j, STBI__SCAN_header)
  } catch (e) {
    if (!(e instanceof StbiError)) throw e
    s.rewind()
    return null
  }
  return { x: s.img_x, y: s.img_y, comp: s.img_n >= 3 ? 3 : 1 }
}

/**
 * stbi__jpeg_load (stb_image.h:4031-4043) with req_comp 0: the pixels as
 * stbi_load_from_memory returns them for a JPEG, top row first; null where
 * stb returns NULL. `onError` receives stb's failure reason.
 */
export function stbi__jpeg_load(s: StbiContext, onError?: (reason: string) => void): StbiImage | null {
  const j = new StbiJpeg(s)
  try {
    return load_jpeg_image(j)
  } catch (e) {
    if (!(e instanceof StbiError)) throw e
    onError?.(e.message)
    return null
  }
}
