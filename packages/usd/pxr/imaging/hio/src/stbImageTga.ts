// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the TGA decoder of OpenUSD 26.11.1 pxr/imaging/hio/stb/stb_image.h
// (stb_image.h:5745-6085) as Hio_StbImage::ReadCropped uses it:
// stbi_load_from_memory(buffer, size, &w, &h, &n, 0)
// (pxr/imaging/hio/stbImage.cpp:454-456), i.e. stbi__tga_load with req_comp 0
// (no stbi__convert_format): grey, RGB(A) and colour-mapped Targa images,
// uncompressed or RLE, 15/16-bit pixels expanded to 24-bit RGB.
//
// Where stb leaves memory it allocated unwritten (rows of a truncated
// uncompressed image), the bytes here are zero.
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

// STBI_grey .. STBI_rgb (stb_image.h:375-384)
const STBI_grey = 1, STBI_grey_alpha = 2, STBI_rgb = 3

// returns STBI_rgb or whatever, 0 on error (stb_image.h:5749-5764). The
// second result is is_rgb16.
function stbi__tga_get_comp(bits_per_pixel: number, is_grey: boolean): [number, boolean] {
  // only RGB or RGBA (incl. 16bit) or grey allowed
  switch (bits_per_pixel) {
    case 8: return [STBI_grey, false]
    case 16: if (is_grey) return [STBI_grey_alpha, false]
      // fallthrough
    case 15: return [STBI_rgb, true]
    case 24: // fallthrough
    case 32: return [bits_per_pixel / 8, false]
    default: return [0, false]
  }
}

/** stbi__tga_test (stb_image.h:5826-5854) */
export function stbi__tga_test(s: StbiContext): boolean {
  let res = false
  test: {
    s.get8() //   discard Offset
    const tga_color_type = s.get8() //   color type
    if (tga_color_type > 1) break test //   only RGB or indexed allowed
    let sz = s.get8() //   image type
    if (tga_color_type === 1) { // colormapped (paletted) image
      if (sz !== 1 && sz !== 9) break test // colortype 1 demands image type 1 or 9
      s.skip(4) // skip index of first colormap entry and number of entries
      sz = s.get8() //   check bits per palette color entry
      if (sz !== 8 && sz !== 15 && sz !== 16 && sz !== 24 && sz !== 32) break test
      s.skip(4) // skip image x and y origin
    } else { // "normal" image w/o colormap
      if (sz !== 2 && sz !== 3 && sz !== 10 && sz !== 11) break test // only RGB or grey allowed, +/- RLE
      s.skip(9) // skip colormap specification and image x/y origin
    }
    if (s.get16le() < 1) break test //   test width
    if (s.get16le() < 1) break test //   test height
    sz = s.get8() //   bits per pixel
    if (tga_color_type === 1 && sz !== 8 && sz !== 16) break test // for colormapped images, bpp is size of an index
    if (sz !== 8 && sz !== 15 && sz !== 16 && sz !== 24 && sz !== 32) break test

    res = true // if we got this far, everything's good and we can return 1 instead of 0
  }
  s.rewind()
  return res
}

// read 16bit value and convert to 24bit RGB (stb_image.h:5857-5875)
function stbi__tga_read_rgb16(s: StbiContext, out: Uint8Array, o: number): void {
  const px = s.get16le()
  const fiveBitMask = 31
  // we have 3 channels with 5bits each
  const r = (px >> 10) & fiveBitMask
  const g = (px >> 5) & fiveBitMask
  const b = px & fiveBitMask
  // Note that this saves the data in RGB(A) order, so it doesn't need to be swapped later
  out[o] = Math.trunc((r * 255) / 31)
  out[o + 1] = Math.trunc((g * 255) / 31)
  out[o + 2] = Math.trunc((b * 255) / 31)

  // some people claim that the most significant bit might be used for alpha
  // (possibly if an alpha-bit is set in the "image descriptor byte")
  // but that only made 16bit test images completely translucent..
  // so let's treat all 15 and 16bit TGAs as RGB with no alpha.
}

// stb_image.h:5877-6085 with req_comp 0
function tga_load(s: StbiContext): StbiImage {
  //   read in the TGA header stuff
  const tga_offset = s.get8()
  const tga_indexed = s.get8()
  let tga_image_type = s.get8()
  let tga_is_RLE = false
  const tga_palette_start = s.get16le()
  const tga_palette_len = s.get16le()
  const tga_palette_bits = s.get8()
  s.get16le() // tga_x_origin, unused
  s.get16le() // tga_y_origin, unused
  const tga_width = s.get16le()
  const tga_height = s.get16le()
  const tga_bits_per_pixel = s.get8()
  let tga_inverted = s.get8()
  //   image data
  let tga_palette: Uint8Array | null = null
  const raw_data = new Uint8Array(4)
  let RLE_count = 0
  let RLE_repeating = 0
  let read_next_pixel = true

  if (tga_height > STBI_MAX_DIMENSIONS) stbi__err('too large')
  if (tga_width > STBI_MAX_DIMENSIONS) stbi__err('too large')

  //   do a tiny bit of precessing
  if (tga_image_type >= 8) {
    tga_image_type -= 8
    tga_is_RLE = true
  }
  tga_inverted = 1 - ((tga_inverted >> 5) & 1)

  //   If I'm paletted, then I'll use the number of bits from the palette
  const [tga_comp, tga_rgb16] = tga_indexed ?
    stbi__tga_get_comp(tga_palette_bits, false) :
    stbi__tga_get_comp(tga_bits_per_pixel, tga_image_type === 3)

  if (!tga_comp) stbi__err('bad format') // shouldn't really happen, stbi__tga_test() should have ensured basic consistency

  if (!stbi__mad3sizes_valid(tga_width, tga_height, tga_comp, 0)) stbi__err('too large')

  const tga_data = new Uint8Array(tga_width * tga_height * tga_comp)

  // skip to the data's starting position (offset usually = 0)
  s.skip(tga_offset)

  if (!tga_indexed && !tga_is_RLE && !tga_rgb16) {
    for (let i = 0; i < tga_height; ++i) {
      const row = tga_inverted ? tga_height - i - 1 : i
      const bytes = s.getn(tga_width * tga_comp)
      if (bytes) tga_data.set(bytes, row * tga_width * tga_comp)
    }
  } else {
    //   do I need to load a palette?
    if (tga_indexed) {
      if (tga_palette_len === 0) stbi__err('bad palette') /* you have to have at least one entry! */

      //   any data to skip? (offset usually = 0)
      s.skip(tga_palette_start)
      //   load the palette
      tga_palette = new Uint8Array(tga_palette_len * tga_comp)
      if (tga_rgb16) {
        for (let i = 0; i < tga_palette_len; ++i) stbi__tga_read_rgb16(s, tga_palette, i * tga_comp)
      } else {
        const bytes = s.getn(tga_palette_len * tga_comp)
        if (!bytes) stbi__err('bad palette')
        tga_palette.set(bytes)
      }
    }
    //   load the data
    for (let i = 0; i < tga_width * tga_height; ++i) {
      //   if I'm in RLE mode, do I need to get a RLE stbi__pngchunk?
      if (tga_is_RLE) {
        if (RLE_count === 0) {
          //   yep, get the next byte as a RLE command
          const RLE_cmd = s.get8()
          RLE_count = 1 + (RLE_cmd & 127)
          RLE_repeating = RLE_cmd >> 7
          read_next_pixel = true
        } else if (!RLE_repeating) {
          read_next_pixel = true
        }
      } else {
        read_next_pixel = true
      }
      //   OK, if I need to read a pixel, do it now
      if (read_next_pixel) {
        //   load however much data we did have
        if (tga_indexed) {
          // read in index, then perform the lookup
          let pal_idx = tga_bits_per_pixel === 8 ? s.get8() : s.get16le()
          if (pal_idx >= tga_palette_len) {
            // invalid index
            pal_idx = 0
          }
          pal_idx *= tga_comp
          for (let j = 0; j < tga_comp; ++j) raw_data[j] = tga_palette![pal_idx + j]!
        } else if (tga_rgb16) {
          stbi__tga_read_rgb16(s, raw_data, 0)
        } else {
          //   read in the data raw
          for (let j = 0; j < tga_comp; ++j) raw_data[j] = s.get8()
        }
        //   clear the reading flag for the next pixel
        read_next_pixel = false
      } // end of reading a pixel

      // copy data
      for (let j = 0; j < tga_comp; ++j) tga_data[i * tga_comp + j] = raw_data[j]!

      //   in case we're in RLE mode, keep counting down
      --RLE_count
    }
    //   do I need to invert the image?
    if (tga_inverted) {
      for (let j = 0; j * 2 < tga_height; ++j) {
        let index1 = j * tga_width * tga_comp
        let index2 = (tga_height - 1 - j) * tga_width * tga_comp
        for (let i = tga_width * tga_comp; i > 0; --i) {
          const temp = tga_data[index1]!
          tga_data[index1] = tga_data[index2]!
          tga_data[index2] = temp
          ++index1
          ++index2
        }
      }
    }
  }

  // swap RGB - if the source data was RGB16, it already is in the right order
  if (tga_comp >= 3 && !tga_rgb16) {
    for (let i = 0, p = 0; i < tga_width * tga_height; ++i, p += tga_comp) {
      const temp = tga_data[p]!
      tga_data[p] = tga_data[p + 2]!
      tga_data[p + 2] = temp
    }
  }

  return { width: tga_width, height: tga_height, channels: tga_comp, data: tga_data }
}

/**
 * stbi__tga_load (stb_image.h:5877-6085) with req_comp 0: the pixels as
 * stbi_load_from_memory returns them for a TGA, top row first; null where
 * stb returns NULL. `onError` receives stb's failure reason.
 */
export function stbi__tga_load(s: StbiContext, onError?: (reason: string) => void): StbiImage | null {
  try {
    return tga_load(s)
  } catch (e) {
    if (!(e instanceof StbiError)) throw e
    onError?.(e.message)
    return null
  }
}
