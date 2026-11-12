// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the PNG path of OpenUSD 26.11.1 pxr/imaging/hio/stb/stb_image.h as
// Hio_StbImage::ReadCropped uses it for 8-bit images:
// stbi_load_from_memory(buffer, size, &w, &h, &n, 0) (pxr/imaging/hio/stbImage.cpp:454-456),
// i.e. stbi__load_and_postprocess_8bit (stb_image.h:1259-1283) over
// stbi__png_load (:5301-5307). Hio's copy is patched to parse gAMA
// (stb_image.patch; stb_image.h:5172-5177).
//
// zlib inflation uses the platform DecompressionStream, so decoding is async.
// The zlib header is checked as stbi__parse_zlib_header (:4437-4448) does, but
// unlike stb's inflater (:4480-4507) the platform also verifies the Adler-32
// trailer and rejects bytes after the zlib stream; such PNGs fail here.
// stbi_load_from_memory below dispatches on the content as stbi__load_main
// (:1136-1187) does, to this PNG decoder and the JPEG, BMP and TGA ports
// (stbImageJpeg.ts, stbImageBmp.ts, stbImageTga.ts).
// Not ported: the GIF, PSD, PIC, PNM and 8-bit Radiance decoders (data stb
// would decode with them is reported, not decoded), req_comp conversion (Hio
// passes 0), stbi__de_iphone (only enabled on ARCH_OS_IPHONE,
// stbImage.cpp:429-431) and the vertical flip (Hio flips with
// stbi__vertical_flip; see below).
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

import { stbi__bmp_load, stbi__bmp_test } from './stbImageBmp.ts'
import { STBI_MAX_DIMENSIONS, StbiContext, type StbiImage } from './stbImageContext.ts'
import { stbi__jpeg_load, stbi__jpeg_test } from './stbImageJpeg.ts'
import { stbi__tga_load, stbi__tga_test } from './stbImageTga.ts'

export type { StbiImage } from './stbImageContext.ts'

// stb_image.h:4605-4627
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
function stbi__check_png_header(s: StbiContext): boolean {
  for (const byte of PNG_SIGNATURE) if (s.get8() !== byte) return false
  return true
}

// stb_image.h:4637-4655
const STBI__F_none = 0, STBI__F_sub = 1, STBI__F_up = 2, STBI__F_avg = 3, STBI__F_paeth = 4,
  STBI__F_avg_first = 5
const first_row_filter = [STBI__F_none, STBI__F_sub, STBI__F_none, STBI__F_avg_first, STBI__F_sub]

// stb_image.h:4657-4669
function stbi__paeth(a: number, b: number, c: number): number {
  const thresh = c * 3 - (a + b)
  const lo = a < b ? a : b
  const hi = a < b ? b : a
  const t0 = hi <= thresh ? lo : c
  return thresh <= lo ? hi : t0
}

// stb_image.h:4671
const stbi__depth_scale_table = [0, 0xff, 0x55, 0, 0x11, 0, 0, 0, 0x01]

// stb_image.h:4675-4694 (dest may alias src, so it runs backwards)
function stbi__create_png_alpha_expand8(dest: Uint8Array, d: number, src: Uint8Array, s: number, x: number,
  img_n: number): void {
  if (img_n === 1) {
    for (let i = x - 1; i >= 0; --i) {
      dest[d + i * 2 + 1] = 255
      dest[d + i * 2] = src[s + i]!
    }
  } else {
    for (let i = x - 1; i >= 0; --i) {
      dest[d + i * 4 + 3] = 255
      dest[d + i * 4 + 2] = src[s + i * 3 + 2]!
      dest[d + i * 4 + 1] = src[s + i * 3 + 1]!
      dest[d + i * 4] = src[s + i * 3]!
    }
  }
}

type PngOut = Uint8Array | Uint16Array

// stb_image.h:4696-4859. Returns the unfiltered image (Uint16Array samples
// for 16-bit), or null for stb's error returns.
function stbi__create_png_image_raw(img_n: number, raw: Uint8Array, r: number, raw_len: number, out_n: number,
  x: number, y: number, depth: number, color: number): PngOut | null {
  const out: PngOut = depth === 16 ? new Uint16Array(x * y * out_n) : new Uint8Array(x * y * out_n)
  const stride = x * out_n
  const img_width_bytes = Math.floor((img_n * x * depth + 7) / 8)
  const img_len = (img_width_bytes + 1) * y
  // stb accepts trailing data after the rows, only too little is an error
  if (raw_len < img_len) return null

  const filter_buf = new Uint8Array(img_width_bytes * 2)
  let filter_bytes = img_n * (depth === 16 ? 2 : 1)
  let width = x
  if (depth < 8) {
    filter_bytes = 1
    width = img_width_bytes
  }

  for (let j = 0; j < y; ++j) {
    const cur = (j & 1) * img_width_bytes
    const prior = (~j & 1) * img_width_bytes
    const dest = stride * j
    const nk = width * filter_bytes
    let filter = raw[r++]!
    if (filter > 4) return null // invalid filter
    if (j === 0) filter = first_row_filter[filter]!
    const fb = filter_buf
    switch (filter) {
      case STBI__F_none:
        fb.set(raw.subarray(r, r + nk), cur)
        break
      case STBI__F_sub:
        fb.set(raw.subarray(r, r + filter_bytes), cur)
        for (let k = filter_bytes; k < nk; ++k) fb[cur + k] = (raw[r + k]! + fb[cur + k - filter_bytes]!) & 255
        break
      case STBI__F_up:
        for (let k = 0; k < nk; ++k) fb[cur + k] = (raw[r + k]! + fb[prior + k]!) & 255
        break
      case STBI__F_avg:
        for (let k = 0; k < filter_bytes; ++k) fb[cur + k] = (raw[r + k]! + (fb[prior + k]! >> 1)) & 255
        for (let k = filter_bytes; k < nk; ++k) {
          fb[cur + k] = (raw[r + k]! + ((fb[prior + k]! + fb[cur + k - filter_bytes]!) >> 1)) & 255
        }
        break
      case STBI__F_paeth:
        for (let k = 0; k < filter_bytes; ++k) fb[cur + k] = (raw[r + k]! + fb[prior + k]!) & 255
        for (let k = filter_bytes; k < nk; ++k) {
          fb[cur + k] = (raw[r + k]! + stbi__paeth(fb[cur + k - filter_bytes]!, fb[prior + k]!,
            fb[prior + k - filter_bytes]!)) & 255
        }
        break
      case STBI__F_avg_first:
        fb.set(raw.subarray(r, r + filter_bytes), cur)
        for (let k = filter_bytes; k < nk; ++k) fb[cur + k] = (raw[r + k]! + (fb[cur + k - filter_bytes]! >> 1)) & 255
        break
    }
    r += nk

    if (depth < 8) {
      // expand bits to bytes, scaling grayscale values to 0..255
      const scale = color === 0 ? stbi__depth_scale_table[depth]! : 1
      const o = out as Uint8Array
      let input = cur
      let output = dest
      let inb = 0
      const nsmp = x * img_n
      if (depth === 4) {
        for (let i = 0; i < nsmp; ++i) {
          if ((i & 1) === 0) inb = fb[input++]!
          o[output++] = scale * (inb >> 4)
          inb = (inb << 4) & 255
        }
      } else if (depth === 2) {
        for (let i = 0; i < nsmp; ++i) {
          if ((i & 3) === 0) inb = fb[input++]!
          o[output++] = scale * (inb >> 6)
          inb = (inb << 2) & 255
        }
      } else {
        for (let i = 0; i < nsmp; ++i) {
          if ((i & 7) === 0) inb = fb[input++]!
          o[output++] = scale * (inb >> 7)
          inb = (inb << 1) & 255
        }
      }
      if (img_n !== out_n) stbi__create_png_alpha_expand8(o, dest, o, dest, x, img_n)
    } else if (depth === 8) {
      const o = out as Uint8Array
      if (img_n === out_n) o.set(fb.subarray(cur, cur + x * img_n), dest)
      else stbi__create_png_alpha_expand8(o, dest, fb, cur, x, img_n)
    } else {
      // big-endian to native 16-bit samples
      const o = out as Uint16Array
      let c = cur
      let d16 = dest
      if (img_n === out_n) {
        for (let i = 0; i < x * img_n; ++i, ++d16, c += 2) o[d16] = (fb[c]! << 8) | fb[c + 1]!
      } else if (img_n === 1) {
        for (let i = 0; i < x; ++i, d16 += 2, c += 2) {
          o[d16] = (fb[c]! << 8) | fb[c + 1]!
          o[d16 + 1] = 0xffff
        }
      } else {
        for (let i = 0; i < x; ++i, d16 += 4, c += 6) {
          o[d16] = (fb[c]! << 8) | fb[c + 1]!
          o[d16 + 1] = (fb[c + 2]! << 8) | fb[c + 3]!
          o[d16 + 2] = (fb[c + 4]! << 8) | fb[c + 5]!
          o[d16 + 3] = 0xffff
        }
      }
    }
  }
  return out
}

// stb_image.h:4861-4904 (Adam7 passes are decoded and scattered into place)
function stbi__create_png_image(s: StbiContext, image_data: Uint8Array, image_data_len: number, out_n: number,
  depth: number, color: number, interlaced: number): PngOut | null {
  if (!interlaced) {
    return stbi__create_png_image_raw(s.img_n, image_data, 0, image_data_len, out_n, s.img_x, s.img_y, depth, color)
  }
  const final: PngOut = depth === 16 ? new Uint16Array(s.img_x * s.img_y * out_n) :
    new Uint8Array(s.img_x * s.img_y * out_n)
  const xorig = [0, 4, 0, 2, 0, 1, 0]
  const yorig = [0, 0, 4, 0, 2, 0, 1]
  const xspc = [8, 8, 4, 4, 2, 2, 1]
  const yspc = [8, 8, 8, 4, 4, 2, 2]
  let offset = 0
  for (let p = 0; p < 7; ++p) {
    const x = Math.floor((s.img_x - xorig[p]! + xspc[p]! - 1) / xspc[p]!)
    const y = Math.floor((s.img_y - yorig[p]! + yspc[p]! - 1) / yspc[p]!)
    if (x && y) {
      const img_len = (Math.floor((s.img_n * x * depth + 7) / 8) + 1) * y
      const pass = stbi__create_png_image_raw(s.img_n, image_data, offset, image_data_len, out_n, x, y, depth, color)
      if (!pass) return null
      for (let j = 0; j < y; ++j) {
        for (let i = 0; i < x; ++i) {
          const out_y = j * yspc[p]! + yorig[p]!
          const out_x = i * xspc[p]! + xorig[p]!
          const src = (j * x + i) * out_n
          final.set(pass.subarray(src, src + out_n), (out_y * s.img_x + out_x) * out_n)
        }
      }
      offset += img_len
      image_data_len -= img_len
    }
  }
  return final
}

// stb_image.h:4906-4954
function stbi__compute_transparency(s: StbiContext, out: PngOut, tc: number[], out_n: number, max: number): void {
  const pixel_count = s.img_x * s.img_y
  if (out_n === 2) {
    for (let i = 0, p = 0; i < pixel_count; ++i, p += 2) out[p + 1] = out[p] === tc[0] ? 0 : max
  } else {
    for (let i = 0, p = 0; i < pixel_count; ++i, p += 4) {
      if (out[p] === tc[0] && out[p + 1] === tc[1] && out[p + 2] === tc[2]) out[p + 3] = 0
    }
  }
}

// stb_image.h:4956-4993. stb reads its uninitialized 1024-byte palette for
// indices past PLTE; here those entries are zero.
function stbi__expand_png_palette(s: StbiContext, out: Uint8Array, palette: Uint8Array, pal_img_n: number):
  Uint8Array {
  const pixel_count = s.img_x * s.img_y
  const p = new Uint8Array(pixel_count * pal_img_n)
  for (let i = 0, o = 0; i < pixel_count; ++i, o += pal_img_n) {
    const n = out[i]! * 4
    p[o] = palette[n]!
    p[o + 1] = palette[n + 1]!
    p[o + 2] = palette[n + 2]!
    if (pal_img_n === 4) p[o + 3] = palette[n + 3]!
  }
  return p
}

const PNG_TYPE = (t: string): number =>
  ((t.charCodeAt(0) << 24) >>> 0) + (t.charCodeAt(1) << 16) + (t.charCodeAt(2) << 8) + t.charCodeAt(3)
const CgBI = PNG_TYPE('CgBI'), IHDR = PNG_TYPE('IHDR'), PLTE = PNG_TYPE('PLTE'), tRNS = PNG_TYPE('tRNS'),
  gAMA = PNG_TYPE('gAMA'), IDAT = PNG_TYPE('IDAT'), IEND = PNG_TYPE('IEND')

interface ParsedPng {
  depth: number
  color: number
  interlace: number
  pal_img_n: number
  palette: Uint8Array
  has_trans: boolean
  tc: number[]
  tc16: number[]
  idata: Uint8Array
  is_iphone: boolean
}

// stbi__parse_png_file (stb_image.h:5078-5267) with scan == STBI__SCAN_load,
// up to the IEND chunk, where stb inflates.
function stbi__parse_png_file(s: StbiContext): ParsedPng | null {
  const palette = new Uint8Array(1024)
  let pal_img_n = 0
  let has_trans = false
  const tc = [0, 0, 0]
  const tc16 = [0, 0, 0]
  let ioff = 0, idata_limit = 0, pal_len = 0
  let idata: Uint8Array | null = null
  let first = true, interlace = 0, color = 0, depth = 0, is_iphone = false

  if (!stbi__check_png_header(s)) return null
  for (;;) {
    const length = s.get32be()
    const type = s.get32be()
    switch (type) {
      case CgBI:
        is_iphone = true
        s.skip(length)
        break
      case IHDR: {
        if (!first) return null // multiple IHDR
        first = false
        if (length !== 13) return null
        s.img_x = s.get32be()
        s.img_y = s.get32be()
        if (s.img_y > STBI_MAX_DIMENSIONS || s.img_x > STBI_MAX_DIMENSIONS) return null
        depth = s.get8()
        if (depth !== 1 && depth !== 2 && depth !== 4 && depth !== 8 && depth !== 16) return null
        color = s.get8()
        if (color > 6) return null
        if (color === 3 && depth === 16) return null
        if (color === 3) pal_img_n = 3
        else if (color & 1) return null
        if (s.get8()) return null // compression method
        if (s.get8()) return null // filter method
        interlace = s.get8()
        if (interlace > 1) return null
        if (!s.img_x || !s.img_y) return null
        if (!pal_img_n) {
          s.img_n = (color & 2 ? 3 : 1) + (color & 4 ? 1 : 0)
          if (Math.floor(Math.floor((1 << 30) / s.img_x) / s.img_n) < s.img_y) return null
        } else {
          // paletted: img_n is the number of components to decompress
          s.img_n = 1
          if (Math.floor(Math.floor((1 << 30) / s.img_x) / 4) < s.img_y) return null
        }
        break
      }
      case PLTE: {
        if (first) return null
        if (length > 256 * 3) return null
        pal_len = Math.floor(length / 3)
        if (pal_len * 3 !== length) return null
        for (let i = 0; i < pal_len; ++i) {
          palette[i * 4] = s.get8()
          palette[i * 4 + 1] = s.get8()
          palette[i * 4 + 2] = s.get8()
          palette[i * 4 + 3] = 255
        }
        break
      }
      case tRNS: {
        if (first) return null
        if (idata) return null // tRNS after IDAT
        if (pal_img_n) {
          if (pal_len === 0) return null // tRNS before PLTE
          if (length > pal_len) return null
          pal_img_n = 4
          for (let i = 0; i < length; ++i) palette[i * 4 + 3] = s.get8()
        } else {
          if (!(s.img_n & 1)) return null // tRNS with alpha
          if (length !== s.img_n * 2) return null
          has_trans = true
          if (depth === 16) {
            for (let k = 0; k < s.img_n; ++k) tc16[k] = s.get16be()
          } else {
            for (let k = 0; k < s.img_n; ++k) tc[k] = ((s.get16be() & 255) * stbi__depth_scale_table[depth]!) & 255
          }
        }
        break
      }
      case gAMA: {
        // Hio's patch (stb_image.patch): only the length is validated on load
        if (first) return null
        if (length !== 4) return null
        s.get32be()
        break
      }
      case IDAT: {
        if (first) return null
        if (pal_img_n && !pal_len) return null // no PLTE
        if (length > 1 << 30) return null
        if (((ioff + length) | 0) < (ioff | 0)) return null
        if (ioff + length > idata_limit) {
          if (idata_limit === 0) idata_limit = length > 4096 ? length : 4096
          while (ioff + length > idata_limit) idata_limit *= 2
          const grown = new Uint8Array(idata_limit)
          if (idata) grown.set(idata.subarray(0, ioff))
          idata = grown
        }
        const data = s.getn(length)
        if (!data) return null // outofdata
        idata!.set(data, ioff)
        ioff += length
        break
      }
      case IEND: {
        if (first) return null
        if (!idata) return null // no IDAT
        return { depth, color, interlace, pal_img_n, palette, has_trans, tc, tc16,
          idata: idata.subarray(0, ioff), is_iphone }
      }
      default:
        if (first) return null
        if ((type & (1 << 29)) === 0) return null // unknown critical chunk
        s.skip(length)
        break
    }
    s.get32be() // CRC, not checked
  }
}

async function inflate(data: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array | null> {
  const stream = new DecompressionStream(format)
  const writer = stream.writable.getWriter()
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {})
  writer.close().catch(() => {})
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } catch {
    return null
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

// stbi_zlib_decode_malloc_guesssize_headerflag (stb_image.h:4540-4553). The
// header is validated as stbi__parse_zlib_header does (:4437-4448), which does
// not limit the window size, then normalized for the platform inflater.
async function stbi__zlib_decode(idata: Uint8Array, parse_header: boolean): Promise<Uint8Array | null> {
  if (!parse_header) return inflate(idata, 'deflate-raw')
  if (idata.length <= 2) return null
  const cmf = idata[0]!, flg = idata[1]!
  if ((cmf * 256 + flg) % 31 !== 0) return null
  if (flg & 32) return null // no preset dict
  if ((cmf & 15) !== 8) return null // DEFLATE required
  const normalized = idata.slice()
  normalized[0] = 0x78
  normalized[1] = 0x9c
  return inflate(normalized, 'deflate')
}

/**
 * stbi_load_from_memory(bytes, len, &x, &y, &comp, 0) for PNG data
 * (stb_image.h:1428-1433), including the 16-to-8-bit reduction of
 * stbi__load_and_postprocess_8bit (:1259-1283). Rows are top first; Hio applies
 * stbi__vertical_flip itself when its storage is flipped. Resolves to null
 * wherever stb returns NULL (and for non-PNG data, which stbi_load_from_memory
 * hands to the other decoders).
 */
export async function stbi_load_png_from_memory(bytes: Uint8Array): Promise<StbiImage | null> {
  const s = new StbiContext(bytes)
  const png = stbi__parse_png_file(s)
  if (!png) return null
  const expanded = await stbi__zlib_decode(png.idata, !png.is_iphone)
  if (!expanded) return null

  // IEND processing (stb_image.h:5205-5243) with req_comp == 0
  s.img_out_n = png.has_trans ? s.img_n + 1 : s.img_n
  let out = stbi__create_png_image(s, expanded, expanded.length, s.img_out_n, png.depth, png.color, png.interlace)
  if (!out) return null
  if (png.has_trans) {
    if (png.depth === 16) stbi__compute_transparency(s, out, png.tc16, s.img_out_n, 65535)
    else stbi__compute_transparency(s, out, png.tc, s.img_out_n, 255)
  }
  if (png.pal_img_n) {
    s.img_n = png.pal_img_n
    s.img_out_n = png.pal_img_n
    out = stbi__expand_png_palette(s, out as Uint8Array, png.palette, png.pal_img_n)
  } else if (png.has_trans) {
    ++s.img_n
  }

  let data: Uint8Array
  if (png.depth === 16) {
    // stbi__convert_16_to_8 (stb_image.h:1189-1203)
    data = new Uint8Array(out.length)
    for (let i = 0; i < out.length; ++i) data[i] = (out[i]! >> 8) & 0xff
  } else {
    data = out as Uint8Array
  }
  return { width: s.img_x, height: s.img_y, channels: s.img_n, data }
}

/** stbi__png_test (stb_image.h:5309-5315) */
function stbi__png_test(s: StbiContext): boolean {
  const r = stbi__check_png_header(s)
  s.rewind()
  return r
}

/** stbi__gif_test (stb_image.h:6590-6605) */
function stbi__gif_test(s: StbiContext): boolean {
  let r = true
  if (s.get8() !== 0x47 || s.get8() !== 0x49 || s.get8() !== 0x46 || s.get8() !== 0x38) r = false // 'GIF8'
  if (r) {
    const sz = s.get8()
    if (sz !== 0x39 && sz !== 0x37) r = false // '9', '7'
    else if (s.get8() !== 0x61) r = false // 'a'
  }
  s.rewind()
  return r
}

/** stbi__psd_test (stb_image.h:6091-6096) */
function stbi__psd_test(s: StbiContext): boolean {
  const r = s.get32be() === 0x38425053
  s.rewind()
  return r
}

/** stbi__pic_test (stb_image.h:6346-6370, 6551-6556) */
function stbi__pic_test(s: StbiContext): boolean {
  const is4 = (str: number[]): boolean => {
    for (let i = 0; i < 4; ++i) if (s.get8() !== str[i]) return false
    return true
  }
  let r = is4([0x53, 0x80, 0xf6, 0x34])
  if (r) {
    for (let i = 0; i < 84; ++i) s.get8()
    r = is4([0x50, 0x49, 0x43, 0x54]) // 'PICT'
  }
  s.rewind()
  return r
}

/** stbi__pnm_test (stb_image.h:7504-7514) */
function stbi__pnm_test(s: StbiContext): boolean {
  const p = s.get8(), t = s.get8()
  s.rewind()
  return p === 0x50 && (t === 0x35 || t === 0x36) // 'P', '5' or '6'
}

/** stbi__hdr_test (stb_image.h:7097-7116) */
function stbi__hdr_test(s: StbiContext): boolean {
  const test = (signature: string): boolean => {
    let r = true
    for (let i = 0; i < signature.length; ++i) {
      if (s.get8() !== signature.charCodeAt(i)) { r = false; break }
    }
    s.rewind()
    return r
  }
  return test('#?RADIANCE\n') || test('#?RGBE\n')
}

/**
 * Whether stbi_info_from_memory (stb_image.h:7642-7682, stbi__info_main) can
 * recognize `bytes` as one of stb's formats: each format's test, in
 * stbi__info_main's order. Divergence: stbi__info_main's per-format info
 * functions also parse the header for the dimensions and component count;
 * this reads only the signatures (Hio_StbImage's synchronous open, which
 * needs no dimensions, stbImage.ts).
 */
export function stbi__info_test_from_memory(bytes: Uint8Array): boolean {
  const s = new StbiContext(bytes)
  return stbi__jpeg_test(s) || stbi__png_test(s) || stbi__gif_test(s) ||
    stbi__bmp_test(s) || stbi__psd_test(s) || stbi__pic_test(s) ||
    stbi__pnm_test(s) || stbi__hdr_test(s) || stbi__tga_test(s)
}

/**
 * stbi_load_from_memory(bytes, len, &x, &y, &comp, 0) (stb_image.h:1428-1433)
 * as Hio_StbImage::ReadCropped calls it for 8-bit images
 * (pxr/imaging/hio/stbImage.cpp:454-456): the decoder is chosen from the
 * content, in stbi__load_main's order (:1136-1187), whatever the file's
 * extension. Resolves to null wherever stb returns NULL, and for data stb
 * would decode with a decoder not ported here; `onError` receives stb's
 * failure reason or names the unported decoder.
 */
export async function stbi_load_from_memory(bytes: Uint8Array, onError?: (reason: string) => void):
  Promise<StbiImage | null> {
  const s = new StbiContext(bytes)
  // test the formats with a very explicit header first (at least a FOURCC
  // or distinctive magic number first)
  if (stbi__png_test(s)) {
    const png = await stbi_load_png_from_memory(bytes)
    if (!png) onError?.('Corrupt PNG')
    return png
  }
  if (stbi__bmp_test(s)) return stbi__bmp_load(s, onError)
  const unported = (format: string): null => {
    onError?.(`stb_image's ${format} decoder is not ported`)
    return null
  }
  if (stbi__gif_test(s)) return unported('GIF')
  if (stbi__psd_test(s)) return unported('PSD')
  if (stbi__pic_test(s)) return unported('PIC')

  // then the formats that can end up attempting to load with just 1 or 2
  // bytes matching expectations; these are prone to false positives, so
  // try them later
  if (stbi__jpeg_test(s)) return stbi__jpeg_load(s, onError)
  if (stbi__pnm_test(s)) return unported('PNM')

  // stbi__hdr_load followed by stbi__hdr_to_ldr
  if (stbi__hdr_test(s)) return unported('8-bit Radiance HDR')

  // test tga last because it's a crappy test!
  if (stbi__tga_test(s)) return stbi__tga_load(s, onError)

  onError?.('unknown image type')
  return null
}

/**
 * stbi__vertical_flip (stb_image.h:1221-1243), which Hio_StbImage::ReadCropped
 * calls on stb's pixels when its storage is flipped (stbImage.cpp:449-451,457-460).
 */
export function stbi__vertical_flip(image: Uint8Array, w: number, h: number, bytes_per_pixel: number): void {
  const bytes_per_row = w * bytes_per_pixel
  const temp = new Uint8Array(bytes_per_row)
  for (let row = 0; row < h >> 1; row++) {
    const row0 = row * bytes_per_row
    const row1 = (h - row - 1) * bytes_per_row
    temp.set(image.subarray(row0, row0 + bytes_per_row))
    image.copyWithin(row0, row1, row1 + bytes_per_row)
    image.set(temp, row1)
  }
}
