// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stb/stb_image_resize2.h,
//  pxr/imaging/hio/stbImage.cpp
// stb: Copyright (c) 2017 Sean Barrett. MIT License.
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the parts of OpenUSD 26.11.1 pxr/imaging/hio/stb/stb_image_resize2.h
// reached by the three "easy API" calls Hio_StbImage makes
// (pxr/imaging/hio/stbImage.cpp:227-254 and :501-530): stbir_resize_uint8_srgb,
// stbir_resize_uint8_linear and stbir_resize_float_linear, each with the
// default filters (STBIR_FILTER_MITCHELL downsampling, STBIR_FILTER_CATMULLROM
// upsampling, point sampling at 1:1; stb_image_resize2.h:872-878,6343-6352),
// STBIR_EDGE_CLAMP (:7460-7461), a full-image region and one split.
//
// This follows the scalar (non-SIMD) code paths. stb_image_resize2.h keeps its
// SIMD paths bit-identical to them (:1319, :1721) and disables FP contraction
// (:849-861); Math.fround reproduces every float32 operation. Unreachable from
// the easy API (and not ported): input/output callbacks, subrects, WRAP/ZERO
// edge specifics in the decode loop (:4456-4481), premultiplied and swizzled
// layouts, the fast-alpha path, 16-bit and half-float types.
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

const f = Math.fround

// stb_image_resize2.h:463-490. Hio casts its channel count (1-4) to this enum
// (stbImage.cpp:233,241,249): 1 and 2 are plain channels, 3 is RGB and 4 is
// RGBA with non-premultiplied alpha, which stbir alpha-weights internally.
export type stbir_pixel_layout = number
export const STBIR_1CHANNEL = 1
export const STBIR_2CHANNEL = 2
export const STBIR_RGB = 3
export const STBIR_BGR = 0
export const STBIR_4CHANNEL = 5
export const STBIR_RGBA = 4
export const STBIR_BGRA = 6
export const STBIR_ARGB = 7
export const STBIR_ABGR = 8
export const STBIR_RA = 9
export const STBIR_AR = 10
export const STBIR_RGBA_PM = 11
export const STBIR_BGRA_PM = 12
export const STBIR_ARGB_PM = 13
export const STBIR_ABGR_PM = 14
export const STBIR_RA_PM = 15
export const STBIR_AR_PM = 16

// stb_image_resize2.h:515-520,536-544
const STBIR_EDGE_CLAMP = 0
const STBIR_EDGE_REFLECT = 1
const STBIR_EDGE_WRAP = 2
const STBIR_EDGE_ZERO = 3
const STBIR_FILTER_DEFAULT = 0
const STBIR_FILTER_CATMULLROM = 4
const STBIR_FILTER_MITCHELL = 5
const STBIR_FILTER_POINT_SAMPLE = 6
const STBIR_TYPE_UINT8 = 0
const STBIR_TYPE_UINT8_SRGB = 1
const STBIR_TYPE_UINT8_SRGB_ALPHA = 2
const STBIR_TYPE_FLOAT = 4

// stb_image_resize2.h:886-904 (internal layouts, in range-comparable order)
const STBIRI_1CHANNEL = 0
const STBIRI_2CHANNEL = 1
const STBIRI_RGB = 2
const STBIRI_BGR = 3
const STBIRI_4CHANNEL = 4
const STBIRI_RGBA = 5
const STBIRI_AR = 10
const STBIRI_RGBA_PM = 11
const STBIRI_AR_PM = 16

// stb_image_resize2.h:930-932
const stbir__type_size = [1, 1, 1, 2, 4, 2]

// stb_image_resize2.h:1091-1095
const stbir__max_uint8_as_float = 255
const stbir__max_uint8_as_float_inverted = f(1 / 255)
const stbir__small_float = f(1 / 2 ** 120)
const ONE_MINUS_SMALL = f(1 - stbir__small_float)
const ONE_PLUS_SMALL = f(1 + stbir__small_float)

// stb_image_resize2.h:1112-1138
const stbir__srgb_uchar_to_linear_float = new Float32Array([
  0.000000, 0.000304, 0.000607, 0.000911, 0.001214, 0.001518, 0.001821, 0.002125, 0.002428, 0.002732, 0.003035,
  0.003347, 0.003677, 0.004025, 0.004391, 0.004777, 0.005182, 0.005605, 0.006049, 0.006512, 0.006995, 0.007499,
  0.008023, 0.008568, 0.009134, 0.009721, 0.010330, 0.010960, 0.011612, 0.012286, 0.012983, 0.013702, 0.014444,
  0.015209, 0.015996, 0.016807, 0.017642, 0.018500, 0.019382, 0.020289, 0.021219, 0.022174, 0.023153, 0.024158,
  0.025187, 0.026241, 0.027321, 0.028426, 0.029557, 0.030713, 0.031896, 0.033105, 0.034340, 0.035601, 0.036889,
  0.038204, 0.039546, 0.040915, 0.042311, 0.043735, 0.045186, 0.046665, 0.048172, 0.049707, 0.051269, 0.052861,
  0.054480, 0.056128, 0.057805, 0.059511, 0.061246, 0.063010, 0.064803, 0.066626, 0.068478, 0.070360, 0.072272,
  0.074214, 0.076185, 0.078187, 0.080220, 0.082283, 0.084376, 0.086500, 0.088656, 0.090842, 0.093059, 0.095307,
  0.097587, 0.099899, 0.102242, 0.104616, 0.107023, 0.109462, 0.111932, 0.114435, 0.116971, 0.119538, 0.122139,
  0.124772, 0.127438, 0.130136, 0.132868, 0.135633, 0.138432, 0.141263, 0.144128, 0.147027, 0.149960, 0.152926,
  0.155926, 0.158961, 0.162029, 0.165132, 0.168269, 0.171441, 0.174647, 0.177888, 0.181164, 0.184475, 0.187821,
  0.191202, 0.194618, 0.198069, 0.201556, 0.205079, 0.208637, 0.212231, 0.215861, 0.219526, 0.223228, 0.226966,
  0.230740, 0.234551, 0.238398, 0.242281, 0.246201, 0.250158, 0.254152, 0.258183, 0.262251, 0.266356, 0.270498,
  0.274677, 0.278894, 0.283149, 0.287441, 0.291771, 0.296138, 0.300544, 0.304987, 0.309469, 0.313989, 0.318547,
  0.323143, 0.327778, 0.332452, 0.337164, 0.341914, 0.346704, 0.351533, 0.356400, 0.361307, 0.366253, 0.371238,
  0.376262, 0.381326, 0.386430, 0.391573, 0.396755, 0.401978, 0.407240, 0.412543, 0.417885, 0.423268, 0.428691,
  0.434154, 0.439657, 0.445201, 0.450786, 0.456411, 0.462077, 0.467784, 0.473532, 0.479320, 0.485150, 0.491021,
  0.496933, 0.502887, 0.508881, 0.514918, 0.520996, 0.527115, 0.533276, 0.539480, 0.545725, 0.552011, 0.558340,
  0.564712, 0.571125, 0.577581, 0.584078, 0.590619, 0.597202, 0.603827, 0.610496, 0.617207, 0.623960, 0.630757,
  0.637597, 0.644480, 0.651406, 0.658375, 0.665387, 0.672443, 0.679543, 0.686685, 0.693872, 0.701102, 0.708376,
  0.715694, 0.723055, 0.730461, 0.737911, 0.745404, 0.752942, 0.760525, 0.768151, 0.775822, 0.783538, 0.791298,
  0.799103, 0.806952, 0.814847, 0.822786, 0.830770, 0.838799, 0.846873, 0.854993, 0.863157, 0.871367, 0.879622,
  0.887923, 0.896269, 0.904661, 0.913099, 0.921582, 0.930111, 0.938686, 0.947307, 0.955974, 0.964686, 0.973445,
  0.982251, 0.991102, 1.0,
])

// stb_image_resize2.h:1147-1161
const fp32_to_srgb8_tab4 = new Uint32Array([
  0x0073000d, 0x007a000d, 0x0080000d, 0x0087000d, 0x008d000d, 0x0094000d, 0x009a000d, 0x00a1000d,
  0x00a7001a, 0x00b4001a, 0x00c1001a, 0x00ce001a, 0x00da001a, 0x00e7001a, 0x00f4001a, 0x0101001a,
  0x010e0033, 0x01280033, 0x01410033, 0x015b0033, 0x01750033, 0x018f0033, 0x01a80033, 0x01c20033,
  0x01dc0067, 0x020f0067, 0x02430067, 0x02760067, 0x02aa0067, 0x02dd0067, 0x03110067, 0x03440067,
  0x037800ce, 0x03df00ce, 0x044600ce, 0x04ad00ce, 0x051400ce, 0x057b00c5, 0x05dd00bc, 0x063b00b5,
  0x06970158, 0x07420142, 0x07e30130, 0x087b0120, 0x090b0112, 0x09940106, 0x0a1700fc, 0x0a9500f2,
  0x0b0f01cb, 0x0bf401ae, 0x0ccb0195, 0x0d950180, 0x0e56016e, 0x0f0d015e, 0x0fbc0150, 0x10630143,
  0x11070264, 0x1238023e, 0x1357021d, 0x14660201, 0x156601e9, 0x165a01d3, 0x174401c0, 0x182401af,
  0x18fe0331, 0x1a9602fe, 0x1c1502d2, 0x1d7e02ad, 0x1ed4028d, 0x201a0270, 0x21520256, 0x227d0240,
  0x239f0443, 0x25c003fe, 0x27bf03c4, 0x29a10392, 0x2b6a0367, 0x2d1d0341, 0x2ebe031f, 0x304d0300,
  0x31d105b0, 0x34a80555, 0x37520507, 0x39d504c5, 0x3c37048b, 0x3e7c0458, 0x40a8042a, 0x42bd0401,
  0x44c20798, 0x488e071e, 0x4c1c06b6, 0x4f76065d, 0x52a50610, 0x55ac05cc, 0x5892058f, 0x5b590559,
  0x5e0c0a23, 0x631c0980, 0x67db08f6, 0x6c55087f, 0x70940818, 0x74a007bd, 0x787d076c, 0x7c330723,
])

const fp32 = new Float32Array(1)
const fp32Bits = new Uint32Array(fp32.buffer)
const STBIR_MINVAL_BITS = (127 - 13) << 23
fp32Bits[0] = STBIR_MINVAL_BITS
const STBIR_MINVAL = fp32[0]!
fp32Bits[0] = 0x3f7fffff
const STBIR_ALMOSTONE = fp32[0]!

// stb_image_resize2.h:1163-1187
function stbir__linear_to_srgb_uchar(input: number): number {
  // The tests are written so that NaNs map to 0 (:1172-1174).
  if (!(input > STBIR_MINVAL)) return 0
  if (input > STBIR_ALMOSTONE) return 255
  fp32[0] = input
  const u = fp32Bits[0]!
  const tab = fp32_to_srgb8_tab4[(u - STBIR_MINVAL_BITS) >>> 20]!
  const bias = (tab >>> 16) << 9
  const scale = tab & 0xffff
  const t = (u >>> 12) & 0xff
  return ((bias + scale * t) >>> 16) & 0xff
}

// ---------------------------------------------------------------------------
// Filters (stb_image_resize2.h:2793-2914)

type Kernel = (x: number, scale: number) => number
type Support = (scale: number) => number

function stbir__filter_trapezoid(x: number, scale: number): number {
  const halfscale = f(scale / 2)
  const t = f(0.5 + halfscale)
  if (x < 0) x = -x
  if (x >= t) return 0
  const r = f(0.5 - halfscale)
  if (x <= r) return 1
  return f(f(t - x) / scale)
}
const stbir__support_trapezoid: Support = (scale) => f(0.5 + f(scale / 2))

function stbir__filter_triangle(x: number): number {
  if (x < 0) x = -x
  return x <= 1 ? f(1 - x) : 0
}

const stbir__filter_point: Kernel = () => 1

function stbir__filter_cubic(x: number): number {
  if (x < 0) x = -x
  if (x < 1) return f(f(4 + f(f(x * x) * f(f(3 * x) - 6))) / 6)
  if (x < 2) return f(f(8 + f(x * f(-12 + f(x * f(6 - x))))) / 6)
  return 0
}

function stbir__filter_catmullrom(x: number): number {
  if (x < 0) x = -x
  if (x < 1) return f(1 - f(f(x * x) * f(2.5 - f(1.5 * x))))
  if (x < 2) return f(2 - f(x * f(4 + f(x * f(f(0.5 * x) - 2.5)))))
  return 0
}

function stbir__filter_mitchell(x: number): number {
  if (x < 0) x = -x
  if (x < 1) return f(f(16 + f(f(x * x) * f(f(21 * x) - 36))) / 18)
  if (x < 2) return f(f(32 + f(x * f(-60 + f(x * f(36 - f(7 * x)))))) / 18)
  return 0
}

const stbir__support_zeropoint5: Support = () => 0.5
const stbir__support_one: Support = () => 1
const stbir__support_two: Support = () => 2

// stb_image_resize2.h:6337-6338
const stbir__builtin_kernels: Array<Kernel | null> = [null, stbir__filter_trapezoid, stbir__filter_triangle,
  stbir__filter_cubic, stbir__filter_catmullrom, stbir__filter_mitchell, stbir__filter_point]
const stbir__builtin_supports: Array<Support | null> = [null, stbir__support_trapezoid, stbir__support_one,
  stbir__support_two, stbir__support_two, stbir__support_two, stbir__support_zeropoint5]

// stb_image_resize2.h:2917-2925
function stbir__get_filter_pixel_width(support: Support, scale: number): number {
  if (scale >= ONE_MINUS_SMALL) return Math.ceil(f(support(f(1 / scale)) * 2))
  return Math.ceil(f(f(support(scale) * 2) / scale))
}

// stb_image_resize2.h:2929-2946
function stbir__get_coefficient_width(samp: Sampler, is_gather: number): number {
  const scale = samp.scale_info.scale
  const support = samp.filter_support
  switch (is_gather) {
    case 1: return Math.ceil(f(support(f(1 / scale)) * 2))
    case 2: return Math.ceil(f(f(support(scale) * 2) / scale))
    case 0: return Math.ceil(f(support(scale) * 2))
    default: return 0
  }
}

// stb_image_resize2.h:2948-2954
function stbir__get_contributors(samp: Sampler, is_gather: number): number {
  if (is_gather) return samp.scale_info.output_sub_size
  return samp.scale_info.input_full_size + samp.filter_pixel_margin * 2
}

// stb_image_resize2.h:2956-3026
function stbir__edge_wrap_slow(edge: number, n: number, max: number): number {
  switch (edge) {
    case STBIR_EDGE_CLAMP:
      if (n < 0) return 0
      if (n >= max) return max - 1
      return n
    case STBIR_EDGE_REFLECT:
      if (n < 0) return n > -max ? -n : max - 1
      if (n >= max) {
        const max2 = max * 2
        return n >= max2 ? 0 : max2 - n - 1
      }
      return n
    case STBIR_EDGE_WRAP:
      if (n >= 0) return n % max
      {
        let m = (-n) % max
        if (m !== 0) m = max - m
        return m
      }
    default:
      return 0
  }
}

function stbir__edge_wrap(edge: number, n: number, max: number): number {
  if (n >= 0 && n < max) return n
  return stbir__edge_wrap_slow(edge, n, max)
}

// ---------------------------------------------------------------------------
// Samplers (stb_image_resize2.h:955-998)

interface ScaleInfo {
  input_full_size: number
  output_sub_size: number
  scale: number
  inv_scale: number
  pixel_shift: number
  scale_is_rational: number
  scale_numerator: number
  scale_denominator: number
}

interface FilterExtentInfo { lowest: number, highest: number, widest: number }

interface Sampler {
  // Contributor i is (n0, n1) at [2i, 2i+1].
  contributors: Int32Array
  coefficients: Float32Array
  gather_prescatter_contributors: Int32Array | null
  gather_prescatter_coefficients: Float32Array | null
  scale_info: ScaleInfo
  filter_enum: number
  filter_kernel: Kernel
  filter_support: Support
  edge: number
  coefficient_width: number
  filter_pixel_width: number
  filter_pixel_margin: number
  num_contributors: number
  extent_info: FilterExtentInfo
  is_gather: number
  gather_prescatter_num_contributors: number
  gather_prescatter_coefficient_width: number
}

interface Span { n0: number, n1: number, pixel_offset_for_input: number }
interface Extents {
  conservative: { n0: number, n1: number }
  edge_sizes: [number, number]
  spans: [Span, Span]
}

// stb_image_resize2.h:3031-3195
function stbir__get_extents(samp: Sampler, scanline_extents: Extents): void {
  let min_n = 0x7fffffff, max_n = -0x7fffffff
  let min_left = 0x7fffffff, max_left = -0x7fffffff
  let min_right = 0x7fffffff, max_right = -0x7fffffff
  const edge = samp.edge
  const contributors = samp.contributors
  const output_sub_size = samp.scale_info.output_sub_size
  const input_full_size = samp.scale_info.input_full_size
  const filter_pixel_margin = samp.filter_pixel_margin

  let stop = output_sub_size
  for (let j = 0; j < stop; j++) {
    if (contributors[2 * j]! < min_n) {
      min_n = contributors[2 * j]!
      stop = j + filter_pixel_margin
      if (stop > output_sub_size) stop = output_sub_size
    }
  }
  stop = 0
  for (let j = output_sub_size - 1; j >= stop; j--) {
    if (contributors[2 * j + 1]! > max_n) {
      max_n = contributors[2 * j + 1]!
      stop = j - filter_pixel_margin
      if (stop < 0) stop = 0
    }
  }

  let left_margin = 0
  if (min_n < 0) {
    left_margin = -min_n
    min_n = 0
  }
  let right_margin = 0
  if (max_n >= input_full_size) {
    right_margin = max_n - input_full_size + 1
    max_n = input_full_size - 1
  }

  const spans = scanline_extents.spans
  scanline_extents.edge_sizes[0] = left_margin
  scanline_extents.edge_sizes[1] = right_margin
  spans[0].n0 = min_n
  spans[0].n1 = max_n
  spans[0].pixel_offset_for_input = min_n
  spans[1].n0 = 0
  spans[1].n1 = -1
  spans[1].pixel_offset_for_input = 0

  if (edge === STBIR_EDGE_ZERO) return

  for (let j = -left_margin; j < 0; j++) {
    const p = stbir__edge_wrap(edge, j, input_full_size)
    if (p < min_left) min_left = p
    if (p > max_left) max_left = p
  }
  for (let j = input_full_size; j < input_full_size + right_margin; j++) {
    const p = stbir__edge_wrap(edge, j, input_full_size)
    if (p < min_right) min_right = p
    if (p > max_right) max_right = p
  }

  const THRESHOLD = 16 // STBIR__MERGE_RUNS_PIXEL_THRESHOLD, :3028
  if (min_left !== 0x7fffffff) {
    if ((min_left <= min_n && max_left + THRESHOLD >= min_n) ||
        (min_n <= min_left && max_n + THRESHOLD >= max_left)) {
      spans[0].n0 = min_n = Math.min(min_n, min_left)
      spans[0].n1 = max_n = Math.max(max_n, max_left)
      spans[0].pixel_offset_for_input = min_n
      left_margin = 0
    }
  }
  if (min_right !== 0x7fffffff) {
    if ((min_right <= min_n && max_right + THRESHOLD >= min_n) ||
        (min_n <= min_right && max_n + THRESHOLD >= max_right)) {
      spans[0].n0 = min_n = Math.min(min_n, min_right)
      spans[0].n1 = max_n = Math.max(max_n, max_right)
      spans[0].pixel_offset_for_input = min_n
      right_margin = 0
    }
  }

  if (left_margin && min_left !== 0x7fffffff) {
    let newspan = spans[1]
    if (min_left < spans[0].n0) {
      spans[1].pixel_offset_for_input = spans[0].n0
      spans[1].n0 = spans[0].n0
      spans[1].n1 = spans[0].n1
      newspan = spans[0]
    }
    newspan.pixel_offset_for_input = min_left
    newspan.n0 = -left_margin
    newspan.n1 = (max_left - min_left) - left_margin
    scanline_extents.edge_sizes[0] = 0
    return
  }
  if (right_margin && min_right !== 0x7fffffff) {
    let newspan = spans[1]
    if (min_right < spans[0].n0) {
      spans[1].pixel_offset_for_input = spans[0].n0
      spans[1].n0 = spans[0].n0
      spans[1].n1 = spans[0].n1
      newspan = spans[0]
    }
    newspan.pixel_offset_for_input = min_right
    newspan.n0 = spans[1].n1 + 1
    newspan.n1 = spans[1].n1 + 1 + (max_right - min_right)
    scanline_extents.edge_sizes[1] = 0
  }
}

// stb_image_resize2.h:3197-3219
function stbir__calculate_in_pixel_range(out_pixel_center: number, out_filter_radius: number, inv_scale: number,
  out_shift: number, input_size: number, edge: number): [number, number] {
  const out_lower = f(out_pixel_center - out_filter_radius)
  const out_upper = f(out_pixel_center + out_filter_radius)
  const in_lower = f(f(out_lower + out_shift) * inv_scale)
  const in_upper = f(f(out_upper + out_shift) * inv_scale)
  let first = Math.floor(f(in_lower + 0.5))
  let last = Math.floor(f(in_upper - 0.5))
  if (edge === STBIR_EDGE_WRAP) {
    if (first < -input_size) first = -input_size
    if (last >= input_size * 2) last = input_size * 2 - 1
  }
  return [first, last]
}

// stb_image_resize2.h:3221-3276
function stbir__calculate_coefficients_for_gather_upsample(out_filter_radius: number, kernel: Kernel,
  scale_info: ScaleInfo, num_contributors: number, contributors: Int32Array, coefficient_group: Float32Array,
  coefficient_width: number, edge: number): void {
  const inv_scale = scale_info.inv_scale
  const out_shift = scale_info.pixel_shift
  const input_size = scale_info.input_full_size
  const numerator = scale_info.scale_numerator
  const polyphase = scale_info.scale_is_rational && numerator < num_contributors
  const end = polyphase ? numerator : num_contributors
  let coeffs = 0
  for (let n = 0; n < end; n++) {
    const out_pixel_center = f(n + 0.5)
    const in_center_of_out = f(f(out_pixel_center + out_shift) * inv_scale)
    let [in_first_pixel, in_last_pixel] = stbir__calculate_in_pixel_range(out_pixel_center, out_filter_radius,
      inv_scale, out_shift, input_size, edge)
    let last_non_zero = -1
    for (let i = 0; i <= in_last_pixel - in_first_pixel; i++) {
      const in_pixel_center = f(i + in_first_pixel + 0.5)
      let coeff = kernel(f(in_center_of_out - in_pixel_center), inv_scale)
      // kill denormals
      if (coeff < stbir__small_float && coeff > -stbir__small_float) {
        if (i === 0) { // if we're at the front, just eat zero contributors
          ++in_first_pixel
          i--
          continue
        }
        coeff = 0
      } else {
        last_non_zero = i
      }
      coefficient_group[coeffs + i] = coeff
    }
    in_last_pixel = last_non_zero + in_first_pixel // kills trailing zeros
    contributors[2 * n] = in_first_pixel
    contributors[2 * n + 1] = in_last_pixel
    coeffs += coefficient_width
  }
}

// stb_image_resize2.h:3278-3306 (ported as written; the before-the-front
// branch is unreachable with CLAMP edges, whose reinserted pixels are >= n0).
function stbir__insert_coeff(contribs: Int32Array, c: number, coeffs: Float32Array, cb: number,
  new_pixel: number, new_coeff: number): void {
  const n0 = contribs[2 * c]!, n1 = contribs[2 * c + 1]!
  if (new_pixel <= n1) {
    if (new_pixel < n0) {
      const o = n0 - new_pixel
      for (let j = n1 - n0; j <= 0; j--) coeffs[cb + j + o] = coeffs[cb + j]!
      for (let j = 1; j < o; j--) coeffs[cb + j] = coeffs[cb]!
      coeffs[cb] = new_coeff
      contribs[2 * c] = new_pixel
    } else {
      coeffs[cb + new_pixel - n0] = f(coeffs[cb + new_pixel - n0]! + new_coeff)
    }
  } else {
    const e = new_pixel - n0
    for (let j = n1 - n0 + 1; j < e; j++) coeffs[cb + j] = 0
    coeffs[cb + e] = new_coeff
    contribs[2 * c + 1] = new_pixel
  }
}

// stb_image_resize2.h:3308-3323
function stbir__calculate_out_pixel_range(in_pixel_center: number, in_pixels_radius: number, scale: number,
  out_shift: number, out_size: number): [number, number] {
  const in_lower = f(in_pixel_center - in_pixels_radius)
  const in_upper = f(in_pixel_center + in_pixels_radius)
  const out_lower = f(f(in_lower * scale) - out_shift)
  const out_upper = f(f(in_upper * scale) - out_shift)
  let first = Math.floor(f(out_lower + 0.5))
  let last = Math.floor(f(out_upper - 0.5))
  if (first < 0) first = 0
  if (last >= out_size) last = out_size - 1
  return [first, last]
}

// stb_image_resize2.h:3325-3401
function stbir__calculate_coefficients_for_gather_downsample(start: number, end: number, in_pixels_radius: number,
  kernel: Kernel, scale_info: ScaleInfo, coefficient_width: number, contributors: Int32Array,
  coefficient_group: Float32Array): void {
  let first_out_inited = -1
  const scale = scale_info.scale
  const out_shift = scale_info.pixel_shift
  const out_size = scale_info.output_sub_size
  const numerator = scale_info.scale_numerator
  const polyphase = scale_info.scale_is_rational && numerator < out_size

  for (let in_pixel = start; in_pixel < end; in_pixel++) {
    const in_pixel_center = f(in_pixel + 0.5)
    const out_center_of_in = f(f(in_pixel_center * scale) - out_shift)
    let [out_first_pixel, out_last_pixel] = stbir__calculate_out_pixel_range(in_pixel_center, in_pixels_radius,
      scale, out_shift, out_size)
    if (out_first_pixel > out_last_pixel) continue
    if (polyphase) {
      if (out_first_pixel === numerator) break
      if (out_last_pixel >= numerator) out_last_pixel = numerator - 1
    }
    for (let i = 0; i <= out_last_pixel - out_first_pixel; i++) {
      const out_pixel_center = f(i + out_first_pixel + 0.5)
      const x = f(out_pixel_center - out_center_of_in)
      let coeff = f(kernel(x, scale) * scale)
      if (coeff < stbir__small_float && coeff > -stbir__small_float) coeff = 0
      const out = i + out_first_pixel
      const cb = out * coefficient_width
      if (out > first_out_inited) {
        first_out_inited = out
        contributors[2 * out] = in_pixel
        contributors[2 * out + 1] = in_pixel
        coefficient_group[cb] = coeff
      } else {
        if (coefficient_group[cb] === 0) contributors[2 * out] = in_pixel
        contributors[2 * out + 1] = in_pixel
        coefficient_group[cb + in_pixel - contributors[2 * out]!] = coeff
      }
    }
  }
}

// stb_image_resize2.h:3403-3578 (STBIR_RENORM_TYPE is double)
function stbir__cleanup_gathered_coefficients(edge: number, filter_info: FilterExtentInfo, scale_info: ScaleInfo,
  num_contributors: number, contributors: Int32Array, coefficient_group: Float32Array,
  coefficient_width: number): void {
  const input_size = scale_info.input_full_size
  const input_last_n1 = input_size - 1
  let lowest = 0x7fffffff
  let highest = -0x7fffffff
  let widest = -1
  const numerator = scale_info.scale_numerator
  const denominator = scale_info.scale_denominator
  const polyphase = scale_info.scale_is_rational && numerator < num_contributors

  const end = polyphase ? numerator : num_contributors
  for (let n = 0, cb = 0; n < end; n++, cb += coefficient_width) {
    let total_filter = 0
    const e = contributors[2 * n + 1]! - contributors[2 * n]!
    for (let i = 0; i <= e; i++) total_filter += coefficient_group[cb + i]!
    if (total_filter < stbir__small_float && total_filter > -stbir__small_float) {
      contributors[2 * n + 1] = contributors[2 * n]!
      coefficient_group[cb] = 0
    } else if (total_filter < ONE_MINUS_SMALL || total_filter > ONE_PLUS_SMALL) {
      const filter_scale = 1.0 / total_filter
      for (let i = 0; i <= e; i++) coefficient_group[cb + i] = coefficient_group[cb + i]! * filter_scale
    }
  }

  if (polyphase) {
    for (let n = numerator; n < num_contributors; n++) {
      contributors[2 * n] = contributors[2 * (n - numerator)]! + denominator
      contributors[2 * n + 1] = contributors[2 * (n - numerator) + 1]! + denominator
    }
    // stbir_overlapping_memcpy (:2763-2788): an intentionally overlapping
    // forward copy that repeats the first numerator rows.
    const ofs = numerator * coefficient_width
    const count = (num_contributors - numerator) * coefficient_width
    for (let i = 0; i < count; i++) coefficient_group[ofs + i] = coefficient_group[i]!
  }

  for (let n = 0, cb = 0; n < num_contributors; n++, cb += coefficient_width) {
    if (edge === STBIR_EDGE_ZERO) {
      if (contributors[2 * n + 1]! > input_last_n1) contributors[2 * n + 1] = input_last_n1
      if (contributors[2 * n]! < 0) {
        const skips = -contributors[2 * n]!
        contributors[2 * n] = 0
        const left = contributors[2 * n + 1]! - contributors[2 * n]! + 1
        if (left > 0) for (let j = 0; j < left; j++) coefficient_group[cb + j] = coefficient_group[cb + j + skips]!
      }
    } else if (edge === STBIR_EDGE_CLAMP || edge === STBIR_EDGE_REFLECT) {
      // right hand side first
      if (contributors[2 * n + 1]! > input_last_n1) {
        const start = contributors[2 * n]!
        const endi = contributors[2 * n + 1]!
        contributors[2 * n + 1] = input_last_n1
        for (let i = input_size; i <= endi; i++) {
          stbir__insert_coeff(contributors, n, coefficient_group, cb, stbir__edge_wrap_slow(edge, i, input_size),
            coefficient_group[cb + i - start]!)
        }
      }
      // now check left hand edge
      if (contributors[2 * n]! < 0) {
        let c = cb - (contributors[2 * n]! + 1)
        for (let i = -1; i > contributors[2 * n]!; i--) {
          stbir__insert_coeff(contributors, n, coefficient_group, cb, stbir__edge_wrap_slow(edge, i, input_size),
            coefficient_group[c--]!)
        }
        const save_n0 = contributors[2 * n]!
        const save_n0_coeff = coefficient_group[c]!
        contributors[2 * n] = 0
        for (let i = 0; i <= contributors[2 * n + 1]!; i++) {
          coefficient_group[cb + i] = coefficient_group[cb + i - save_n0]!
        }
        stbir__insert_coeff(contributors, n, coefficient_group, cb, stbir__edge_wrap_slow(edge, save_n0, input_size),
          save_n0_coeff)
      }
    }

    const n0 = contributors[2 * n]!
    if (n0 <= contributors[2 * n + 1]!) {
      let diff = contributors[2 * n + 1]! - n0 + 1
      while (diff && coefficient_group[cb + diff - 1] === 0) --diff
      contributors[2 * n + 1] = n0 + diff - 1
      if (n0 <= contributors[2 * n + 1]!) {
        if (n0 < lowest) lowest = n0
        if (contributors[2 * n + 1]! > highest) highest = contributors[2 * n + 1]!
        if (diff > widest) widest = diff
      }
      for (let i = diff; i < coefficient_width; i++) coefficient_group[cb + i] = 0
    }
  }
  filter_info.lowest = lowest
  filter_info.highest = highest
  filter_info.widest = widest
}

// stb_image_resize2.h:3580-3799
function stbir__pack_coefficients(num_contributors: number, contributors: Int32Array, coefficents: Float32Array,
  coefficient_width: number, widest: number, row0: number, row1: number): number {
  const row_end = row1 + 1
  void row0
  if (coefficient_width !== widest) {
    // STBIR_MOVE_* copy each row's first `widest` coefficients forward.
    for (let n = 0; n < num_contributors; n++) {
      for (let i = 0; i < widest; i++) coefficents[n * widest + i] = coefficents[n * coefficient_width + i]!
    }
  }
  // sentinel read (and masked off) by some SIMD horizontal routines
  coefficents[widest * num_contributors] = 8888

  const stop_range_for = (c: number): number => {
    const mod = widest & 3
    let stop_range = (((contributors[2 * c + 1]! - contributors[2 * c]! + 1) - mod + 3) & ~3) + mod
    if (stop_range < 8 + mod) stop_range = 8 + mod
    return stop_range
  }
  let c = num_contributors - 1
  let coeffs = widest * (num_contributors - 1)
  while (c >= 0 && contributors[2 * c]! + widest * 2 >= row_end) {
    if (contributors[2 * c]! + widest > row_end) {
      let stop_range = widest
      if (widest > 12) stop_range = stop_range_for(c)
      if (contributors[2 * c]! + stop_range > row_end) {
        const new_n0 = row_end - stop_range
        let num = contributors[2 * c + 1]! - contributors[2 * c]! + 1
        const backup = contributors[2 * c]! - new_n0
        let from_co = coeffs + num - 1
        let to_co = from_co + backup
        while (num) {
          coefficents[to_co--] = coefficents[from_co--]!
          --num
        }
        while (to_co >= coeffs) coefficents[to_co--] = 0
        contributors[2 * c] = new_n0
      }
    }
    --c
    coeffs -= widest
  }
  return widest
}

// stb_image_resize2.h:3801-3936
function stbir__calculate_filters(samp: Sampler, other_axis_for_pivot: Sampler | null): void {
  const scale = samp.scale_info.scale
  const kernel = samp.filter_kernel
  const support = samp.filter_support
  const inv_scale = samp.scale_info.inv_scale
  const input_full_size = samp.scale_info.input_full_size
  let gather_num_contributors = samp.num_contributors
  let gather_contributors = samp.contributors
  let gather_coeffs = samp.coefficients
  let gather_coefficient_width = samp.coefficient_width

  if (samp.is_gather === 1) {
    const out_pixels_radius = f(support(inv_scale) * scale)
    stbir__calculate_coefficients_for_gather_upsample(out_pixels_radius, kernel, samp.scale_info,
      gather_num_contributors, gather_contributors, gather_coeffs, gather_coefficient_width, samp.edge)
    stbir__cleanup_gathered_coefficients(samp.edge, samp.extent_info, samp.scale_info, gather_num_contributors,
      gather_contributors, gather_coeffs, gather_coefficient_width)
    return
  }

  // case 0: scatter downsample (only vertical); case 2: gather downsample
  const in_pixels_radius = f(support(scale) * inv_scale)
  const filter_pixel_margin = samp.filter_pixel_margin
  const input_end = input_full_size + filter_pixel_margin
  if (!samp.is_gather && other_axis_for_pivot) {
    // same gather downsample as the horizontal: pivot from its coefficients
    gather_contributors = other_axis_for_pivot.contributors
    gather_coeffs = other_axis_for_pivot.coefficients
    gather_coefficient_width = other_axis_for_pivot.coefficient_width
    gather_num_contributors = other_axis_for_pivot.num_contributors
    samp.extent_info.lowest = other_axis_for_pivot.extent_info.lowest
    samp.extent_info.highest = other_axis_for_pivot.extent_info.highest
    samp.extent_info.widest = other_axis_for_pivot.extent_info.widest
  } else {
    if (!samp.is_gather) {
      gather_contributors = samp.gather_prescatter_contributors!
      gather_coeffs = samp.gather_prescatter_coefficients!
      gather_coefficient_width = samp.gather_prescatter_coefficient_width
      gather_num_contributors = samp.gather_prescatter_num_contributors
    }
    stbir__calculate_coefficients_for_gather_downsample(-filter_pixel_margin, input_end, in_pixels_radius, kernel,
      samp.scale_info, gather_coefficient_width, gather_contributors, gather_coeffs)
    stbir__cleanup_gathered_coefficients(samp.edge, samp.extent_info, samp.scale_info, gather_num_contributors,
      gather_contributors, gather_coeffs, gather_coefficient_width)
  }
  if (samp.is_gather) return

  // pivot the gathered coefficients into scatter form (:3866-3931)
  const contributors = samp.contributors
  const scatter_coefficient_width = samp.coefficient_width
  let highest_set = -filter_pixel_margin - 1
  for (let n = 0, gc0 = 0; n < gather_num_contributors; n++, gc0 += gather_coefficient_width) {
    const gn0 = gather_contributors[2 * n]!, gn1 = gather_contributors[2 * n + 1]!
    let scatter = gn0 + filter_pixel_margin
    let g = gc0
    for (let k = gn0; k <= gn1; k++, scatter++) {
      const gc = gather_coeffs[g++]!
      const scatter_coeffs = scatter * scatter_coefficient_width
      // skip zero and denormals
      if (gc >= stbir__small_float || gc <= -stbir__small_float) {
        if (k > highest_set || contributors[2 * scatter]! > contributors[2 * scatter + 1]!) {
          for (let clear = highest_set + filter_pixel_margin + 1; clear < scatter; clear++) {
            contributors[2 * clear] = 0
            contributors[2 * clear + 1] = -1
          }
          contributors[2 * scatter] = n
          contributors[2 * scatter + 1] = n
          samp.coefficients[scatter_coeffs] = gc
          highest_set = k
        } else {
          stbir__insert_coeff(contributors, scatter, samp.coefficients, scatter_coeffs, n, gc)
        }
      }
    }
  }
  for (let clear = highest_set + filter_pixel_margin + 1; clear < samp.num_contributors; clear++) {
    contributors[2 * clear] = 0
    contributors[2 * clear + 1] = -1
  }
}

// ---------------------------------------------------------------------------
// Scanline decoders and encoders (stb_image_resize2.h:8077-9590)

type Pixels = Uint8Array | Float32Array
type Decoder = (decode: Float32Array, d: number, width_times_channels: number, input: Pixels, i: number) => void
type Encoder = (output: Pixels, o: number, width_times_channels: number, encode: Float32Array, e: number) => void

// :8077-8172
const stbir__decode_uint8_linear_scaled: Decoder = (decode, d, n, input, i) => {
  for (let k = 0; k < n; k++) decode[d + k] = f(input[i + k]! * stbir__max_uint8_as_float_inverted)
}
// :8287-8376
const stbir__decode_uint8_linear: Decoder = (decode, d, n, input, i) => {
  for (let k = 0; k < n; k++) decode[d + k] = input[i + k]!
}
// :8474-8511
const stbir__decode_uint8_srgb: Decoder = (decode, d, n, input, i) => {
  for (let k = 0; k < n; k++) decode[d + k] = stbir__srgb_uchar_to_linear_float[input[i + k]!]!
}
// :8660-8674
const stbir__decode_uint8_srgb4_linearalpha: Decoder = (decode, d, n, input, i) => {
  for (let k = 0; k < n; k += 4) {
    decode[d + k] = stbir__srgb_uchar_to_linear_float[input[i + k]!]!
    decode[d + k + 1] = stbir__srgb_uchar_to_linear_float[input[i + k + 1]!]!
    decode[d + k + 2] = stbir__srgb_uchar_to_linear_float[input[i + k + 2]!]!
    decode[d + k + 3] = f(input[i + k + 3]! * stbir__max_uint8_as_float_inverted)
  }
}
// :9364-9460 (not swizzled: a straight copy)
const stbir__decode_float_linear: Decoder = (decode, d, n, input, i) => {
  decode.set(input.subarray(i, i + n), d)
}

function stbir__clamp_to_uint8(v: number): number {
  if (v < 0) v = 0
  if (v > 255) v = 255
  return v
}
// :8174-8285
const stbir__encode_uint8_linear_scaled: Encoder = (output, o, n, encode, e) => {
  for (let k = 0; k < n; k++) {
    output[o + k] = stbir__clamp_to_uint8(f(f(encode[e + k]! * stbir__max_uint8_as_float) + 0.5))
  }
}
// :8378-8472
const stbir__encode_uint8_linear: Encoder = (output, o, n, encode, e) => {
  for (let k = 0; k < n; k++) output[o + k] = stbir__clamp_to_uint8(f(encode[e + k]! + 0.5))
}
// :8576-8656
const stbir__encode_uint8_srgb: Encoder = (output, o, n, encode, e) => {
  for (let k = 0; k < n; k++) output[o + k] = stbir__linear_to_srgb_uchar(encode[e + k]!)
}
// :8676-8737
const stbir__encode_uint8_srgb4_linearalpha: Encoder = (output, o, n, encode, e) => {
  for (let k = 0; k < n; k += 4) {
    output[o + k] = stbir__linear_to_srgb_uchar(encode[e + k]!)
    output[o + k + 1] = stbir__linear_to_srgb_uchar(encode[e + k + 1]!)
    output[o + k + 2] = stbir__linear_to_srgb_uchar(encode[e + k + 2]!)
    output[o + k + 3] = stbir__clamp_to_uint8(f(f(encode[e + k + 3]! * stbir__max_uint8_as_float) + 0.5))
  }
}
// :9462-9468 (no clamps defined: a straight copy)
const stbir__encode_float_linear: Encoder = (output, o, n, encode, e) => {
  output.set(encode.subarray(e, e + n), o)
}

// ---------------------------------------------------------------------------
// Alpha weighting (stb_image_resize2.h:4008-4233). "Fancy" alpha keeps both
// the plain and the premultiplied color: R G B A Rpm Gpm Bpm.

type AlphaFunc = (buffer: Float32Array, b: number, width_times_channels: number) => void

// :4008-4098 (the decoded RGBA is right-aligned in the 7-channel span)
const stbir__fancy_alpha_weight_4ch: AlphaFunc = (buffer, b, width_times_channels) => {
  let out = b
  const end_decode = b + (width_times_channels / 4) * 7
  let decode = end_decode - width_times_channels
  while (decode < end_decode) {
    const r = buffer[decode]!, g = buffer[decode + 1]!, bl = buffer[decode + 2]!, alpha = buffer[decode + 3]!
    buffer[out] = r
    buffer[out + 1] = g
    buffer[out + 2] = bl
    buffer[out + 3] = alpha
    buffer[out + 4] = r * alpha
    buffer[out + 5] = g * alpha
    buffer[out + 6] = bl * alpha
    out += 7
    decode += 4
  }
}

// :4168-4215
const stbir__fancy_alpha_unweight_4ch: AlphaFunc = (buffer, b, width_times_channels) => {
  let encode = b
  let input = b
  const end_output = b + width_times_channels
  do {
    const alpha = buffer[input + 3]!
    if (alpha < stbir__small_float) {
      buffer[encode] = buffer[input]!
      buffer[encode + 1] = buffer[input + 1]!
      buffer[encode + 2] = buffer[input + 2]!
    } else {
      const ialpha = f(1 / alpha)
      buffer[encode] = buffer[input + 4]! * ialpha
      buffer[encode + 1] = buffer[input + 5]! * ialpha
      buffer[encode + 2] = buffer[input + 6]! * ialpha
    }
    buffer[encode + 3] = alpha
    input += 7
    encode += 4
  } while (encode < end_output)
}

// ---------------------------------------------------------------------------
// Horizontal gather (stb_image_resize2.h:4485-5858 scalar macros, expanded by
// the template at :9993-10311). Coefficient k of an output pixel accumulates
// into lane k % 4 (1-3 channels) or k % 2 (4 and 7 channels); the lanes sum as
// (l0+l2)+(l1+l3) or l0+l1. With 1-3 coefficients a single sequential sum is
// used, in the order 0,2,1 for three coefficients on two channels (:4774).

function stbir__horizontal_gather(effective_channels: number, widest: number, output: Float32Array, out: number,
  output_sub_size: number, decode: Float32Array, decode_buffer: number, contributors: Int32Array,
  coefficients: Float32Array, coefficient_width: number): void {
  const ec = effective_channels
  const lanes = ec >= 4 ? 2 : 4
  const mod = widest & 3
  for (let p = 0; p < output_sub_size; p++, out += ec) {
    const n0 = contributors[2 * p]!
    const d = decode_buffer + n0 * ec
    const hc = p * coefficient_width
    let count: number
    if (widest <= 12) {
      count = widest
    } else {
      // stbir__horizontal_gather_*_channels_with_n_coeffs_mod* (:10181-10283):
      // a do-while of 4-coefficient steps after the first four, then the remnant.
      const n = ((contributors[2 * p + 1]! - n0 + 1) - (4 + mod) + 3) >> 2
      count = 4 + 4 * (n > 0 ? n : 1) + mod
    }
    for (let ch = 0; ch < ec; ch++) {
      if (count <= 3) {
        let tot = f(decode[d + ch]! * coefficients[hc]!)
        if (count === 3 && ec === 2) {
          tot = f(tot + f(decode[d + 2 * ec + ch]! * coefficients[hc + 2]!))
          tot = f(tot + f(decode[d + ec + ch]! * coefficients[hc + 1]!))
        } else {
          for (let k = 1; k < count; k++) tot = f(tot + f(decode[d + k * ec + ch]! * coefficients[hc + k]!))
        }
        output[out + ch] = tot
        continue
      }
      let l0 = f(decode[d + ch]! * coefficients[hc]!)
      let l1 = f(decode[d + ec + ch]! * coefficients[hc + 1]!)
      let l2 = 0, l3 = 0
      let k = 2
      if (lanes === 4) {
        l2 = f(decode[d + 2 * ec + ch]! * coefficients[hc + 2]!)
        l3 = f(decode[d + 3 * ec + ch]! * coefficients[hc + 3]!)
        for (k = 4; k < count; k++) {
          const v = f(decode[d + k * ec + ch]! * coefficients[hc + k]!)
          switch (k & 3) {
            case 0: l0 = f(l0 + v); break
            case 1: l1 = f(l1 + v); break
            case 2: l2 = f(l2 + v); break
            default: l3 = f(l3 + v)
          }
        }
        output[out + ch] = f(f(l0 + l2) + f(l1 + l3))
      } else {
        for (; k < count; k++) {
          const v = f(decode[d + k * ec + ch]! * coefficients[hc + k]!)
          if (k & 1) l1 = f(l1 + v)
          else l0 = f(l0 + v)
        }
        output[out + ch] = f(l0 + l1)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Resize state (stb_image_resize2.h:1000-1089)

interface SplitInfo {
  decode_buffer: Float32Array
  ring_buffer_first_scanline: number
  ring_buffer_last_scanline: number
  ring_buffer_begin_index: number
  start_output_y: number
  end_output_y: number
  start_input_y: number
  end_input_y: number
  ring_buffers: Float32Array[]
  vertical_buffer: Float32Array
}

interface Info {
  horizontal: Sampler
  vertical: Sampler
  input_data: Pixels
  output_data: Pixels
  input_stride: number // in elements of input_data
  output_stride: number // in elements of output_data
  ring_buffer_num_entries: number
  scanline_extents: Extents
  split_info: SplitInfo
  decode_pixels: Decoder
  alpha_weight: AlphaFunc | null
  alpha_unweight: AlphaFunc | null
  encode_pixels: Encoder
  input_pixel_layout_internal: number
  output_pixel_layout_internal: number
  vertical_first: boolean
  channels: number
  effective_channels: number
}

// stb_image_resize2.h:4398-4482
function stbir__decode_scanline(info: Info, n: number, output_buffer: Float32Array, out: number): void {
  const channels = info.channels
  const effective_channels = info.effective_channels
  const row = stbir__edge_wrap(info.vertical.edge, n, info.vertical.scale_info.input_full_size)
  const input_plane = row * info.input_stride
  const full_decode_buffer = out - info.scanline_extents.conservative.n0 * effective_channels
  for (const span of info.scanline_extents.spans) {
    if (span.n1 < span.n0) break
    const width = span.n1 + 1 - span.n0
    const decode_buffer = full_decode_buffer + span.n0 * effective_channels
    const end_decode = full_decode_buffer + (span.n1 + 1) * effective_channels
    const width_times_channels = width * channels
    const input = input_plane + span.pixel_offset_for_input * channels
    // decode right-aligned, so channels < effective_channels expands in place
    info.decode_pixels(output_buffer, end_decode - width_times_channels, width_times_channels, info.input_data, input)
    if (info.alpha_weight) info.alpha_weight(output_buffer, decode_buffer, width_times_channels)
  }
}

// stb_image_resize2.h:5960-5992
function stbir__encode_scanline(info: Info, output: number, encode_buffer: Float32Array, e: number): void {
  const width_times_channels = info.horizontal.scale_info.output_sub_size * info.channels
  if (info.alpha_unweight) info.alpha_unweight(encode_buffer, e, width_times_channels)
  info.encode_pixels(info.output_data, output, width_times_channels, encode_buffer, e)
}

// stb_image_resize2.h:5994-6010
function stbir__get_ring_buffer_scanline(info: Info, split: SplitInfo, get_scanline: number): Float32Array {
  const index = (split.ring_buffer_begin_index + (get_scanline - split.ring_buffer_first_scanline)) %
    info.ring_buffer_num_entries
  return split.ring_buffers[index]!
}

// stb_image_resize2.h:6012-6022
function stbir__resample_horizontal_gather(info: Info, output_buffer: Float32Array, input_buffer: Float32Array): void {
  const h = info.horizontal
  const ec = info.effective_channels
  if (h.filter_enum === STBIR_FILTER_POINT_SAMPLE && h.scale_info.scale === 1) {
    output_buffer.set(input_buffer.subarray(0, h.scale_info.output_sub_size * ec))
  } else {
    stbir__horizontal_gather(ec, h.extent_info.widest, output_buffer, 0, h.scale_info.output_sub_size, input_buffer,
      -info.scanline_extents.conservative.n0 * ec, h.contributors, h.coefficients, h.coefficient_width)
  }
}

// stbir__vertical_gather_with_*_coeffs(_cont) (:9840-9981): up to 8 scanlines
// at a time, summed in order; one weight within 1e-6 of 1 is a plain copy.
const ONE_EPSILON_LOW = f(1 - f(0.000001))
const ONE_EPSILON_HIGH = f(1 + f(0.000001))
function stbir__vertical_gather(cont: boolean, output: Float32Array, coeffs: Float32Array, c: number,
  inputs: Float32Array[], width_times_channels: number): void {
  const cnt = inputs.length
  const c0 = coeffs[c]!
  const input0 = inputs[0]!
  if (!cont && cnt === 1 && c0 >= ONE_EPSILON_LOW && c0 <= ONE_EPSILON_HIGH) {
    output.set(input0.subarray(0, width_times_channels))
    return
  }
  for (let e = 0; e < width_times_channels; e++) {
    let o = cont ? f(output[e]! + f(input0[e]! * c0)) : f(input0[e]! * c0)
    for (let i = 1; i < cnt; i++) o = f(o + f(inputs[i]![e]! * coeffs[c + i]!))
    output[e] = o
  }
}

// stb_image_resize2.h:6024-6061
function stbir__resample_vertical_gather(info: Info, split: SplitInfo, n: number, contrib_n0: number,
  contrib_n1: number, coeffs: number): void {
  const encode_buffer = split.vertical_buffer
  const decode_buffer = split.decode_buffer
  const extents = info.scanline_extents.conservative
  const width = info.vertical_first ? extents.n1 - extents.n0 + 1 : info.horizontal.scale_info.output_sub_size
  const width_times_channels = info.effective_channels * width
  let k = 0, total = contrib_n1 - contrib_n0 + 1
  do {
    const cnt = Math.min(total, 8)
    const inputs: Float32Array[] = []
    for (let i = 0; i < cnt; i++) inputs.push(stbir__get_ring_buffer_scanline(info, split, k + i + contrib_n0))
    stbir__vertical_gather(k !== 0, info.vertical_first ? decode_buffer : encode_buffer,
      info.vertical.coefficients, coeffs + k, inputs, width_times_channels)
    k += cnt
    total -= cnt
  } while (total)
  if (info.vertical_first) stbir__resample_horizontal_gather(info, encode_buffer, decode_buffer)
  stbir__encode_scanline(info, n * info.output_stride, encode_buffer, 0)
}

// stb_image_resize2.h:6063-6082
function stbir__decode_and_resample_for_vertical_gather_loop(info: Info, split: SplitInfo, n: number): void {
  stbir__decode_scanline(info, n, split.decode_buffer, 0)
  split.ring_buffer_last_scanline = n
  const ring_buffer = stbir__get_ring_buffer_scanline(info, split, n)
  stbir__resample_horizontal_gather(info, ring_buffer, split.decode_buffer)
}

// stb_image_resize2.h:6084-6143
function stbir__vertical_gather_loop(info: Info, split: SplitInfo): void {
  const vertical = info.vertical
  const contributors = vertical.contributors
  let contributor = split.start_output_y
  let coefficients = split.start_output_y * vertical.coefficient_width
  split.ring_buffer_begin_index = 0
  split.ring_buffer_first_scanline = contributors[2 * contributor]!
  split.ring_buffer_last_scanline = split.ring_buffer_first_scanline - 1 // means "empty"

  for (let y = split.start_output_y; y < split.end_output_y; y++) {
    const in_first_scanline = contributors[2 * contributor]!
    const in_last_scanline = contributors[2 * contributor + 1]!
    while (in_last_scanline > split.ring_buffer_last_scanline) {
      if (split.ring_buffer_last_scanline - split.ring_buffer_first_scanline + 1 === info.ring_buffer_num_entries) {
        split.ring_buffer_first_scanline++
        split.ring_buffer_begin_index++
      }
      if (info.vertical_first) {
        const ring_buffer = stbir__get_ring_buffer_scanline(info, split, ++split.ring_buffer_last_scanline)
        stbir__decode_scanline(info, split.ring_buffer_last_scanline, ring_buffer, 0)
      } else {
        stbir__decode_and_resample_for_vertical_gather_loop(info, split, split.ring_buffer_last_scanline + 1)
      }
    }
    stbir__resample_vertical_gather(info, split, y, in_first_scanline, in_last_scanline, coefficients)
    ++contributor
    coefficients += vertical.coefficient_width
  }
}

// stb_image_resize2.h:6145-6146
const STBIR__FLOAT_EMPTY_MARKER = f(3.0e+38)

// stb_image_resize2.h:6148-6184
function stbir__handle_scanline_for_scatter(info: Info, split: SplitInfo): void {
  const ring_buffer_entry = split.ring_buffers[split.ring_buffer_begin_index]!
  const output = split.ring_buffer_first_scanline * info.output_stride
  if (info.vertical_first) {
    // stbir__horizontal_resample_and_encode_first_scanline_from_scatter
    stbir__resample_horizontal_gather(info, split.vertical_buffer, ring_buffer_entry)
    stbir__encode_scanline(info, output, split.vertical_buffer, 0)
  } else {
    // stbir__encode_first_scanline_from_scatter
    stbir__encode_scanline(info, output, ring_buffer_entry, 0)
  }
  ring_buffer_entry[0] = STBIR__FLOAT_EMPTY_MARKER
  split.ring_buffer_first_scanline++
  if (++split.ring_buffer_begin_index === info.ring_buffer_num_entries) split.ring_buffer_begin_index = 0
}

// stb_image_resize2.h:6186-6216 with stbir__vertical_scatter_with_*_coeffs(_cont)
// (:9660-9838): each output row is set from, or accumulates, input * weight.
function stbir__resample_vertical_scatter(info: Info, split: SplitInfo, n0: number, n1: number, coeffs: number,
  vertical_buffer: Float32Array, width_times_channels: number): void {
  const vc = info.vertical.coefficients
  let k = 0, total = n1 - n0 + 1
  do {
    const outputs: Float32Array[] = []
    let n = Math.min(total, 8)
    for (let i = 0; i < n; i++) {
      outputs.push(stbir__get_ring_buffer_scanline(info, split, k + i + n0))
      if (i && (outputs[i]![0] === STBIR__FLOAT_EMPTY_MARKER) !== (outputs[0]![0] === STBIR__FLOAT_EMPTY_MARKER)) {
        n = i
        break
      }
    }
    const set = outputs[0]![0] === STBIR__FLOAT_EMPTY_MARKER
    for (let i = 0; i < n; i++) {
      const output = outputs[i]!
      const c = vc[coeffs + k + i]!
      if (set) for (let e = 0; e < width_times_channels; e++) output[e] = vertical_buffer[e]! * c
      else for (let e = 0; e < width_times_channels; e++) output[e] = output[e]! + f(vertical_buffer[e]! * c)
    }
    k += n
    total -= n
  } while (total)
}

// stb_image_resize2.h:6218-6335
function stbir__vertical_scatter_loop(info: Info, split: SplitInfo): void {
  const vertical = info.vertical
  const contributors = vertical.contributors
  const start_output_y = split.start_output_y
  const end_output_y = split.end_output_y
  const start_input_y = split.start_input_y
  const end_input_y = split.end_input_y
  let contributor = start_input_y + vertical.filter_pixel_margin
  let coefficients = vertical.coefficient_width * contributor
  const extents = info.scanline_extents.conservative
  const scanline_scatter_buffer = info.vertical_first ? split.decode_buffer : split.vertical_buffer
  const scanline_scatter_length = info.effective_channels * (info.vertical_first
    ? extents.n1 - extents.n0 + 1 : info.horizontal.scale_info.output_sub_size)

  split.ring_buffer_first_scanline = start_output_y
  split.ring_buffer_last_scanline = -1
  split.ring_buffer_begin_index = -1
  for (let y = 0; y < info.ring_buffer_num_entries; y++) split.ring_buffers[y]![0] = STBIR__FLOAT_EMPTY_MARKER

  let on_first_input_y = true
  let last_input_y = start_input_y
  for (let y = start_input_y; y < end_input_y; y++) {
    let out_first_scanline = contributors[2 * contributor]!
    let out_last_scanline = contributors[2 * contributor + 1]!
    if (out_last_scanline >= out_first_scanline &&
        ((out_first_scanline >= start_output_y && out_first_scanline < end_output_y) ||
         (out_last_scanline >= start_output_y && out_last_scanline < end_output_y))) {
      let vc = coefficients
      last_input_y = y
      if (on_first_input_y && y > start_input_y) split.start_input_y = y
      on_first_input_y = false
      if (out_first_scanline < start_output_y) {
        vc += start_output_y - out_first_scanline
        out_first_scanline = start_output_y
      }
      if (out_last_scanline >= end_output_y) out_last_scanline = end_output_y - 1
      if (split.ring_buffer_begin_index < 0) split.ring_buffer_begin_index = out_first_scanline - start_output_y
      stbir__decode_scanline(info, y, split.decode_buffer, 0)
      if (!info.vertical_first) stbir__resample_horizontal_gather(info, split.vertical_buffer, split.decode_buffer)
      if (split.ring_buffer_last_scanline - split.ring_buffer_first_scanline + 1 === info.ring_buffer_num_entries &&
          out_last_scanline > split.ring_buffer_last_scanline) {
        stbir__handle_scanline_for_scatter(info, split)
      }
      stbir__resample_vertical_scatter(info, split, out_first_scanline, out_last_scanline, vc,
        scanline_scatter_buffer, scanline_scatter_length)
      if (out_last_scanline > split.ring_buffer_last_scanline) split.ring_buffer_last_scanline = out_last_scanline
    }
    ++contributor
    coefficients += vertical.coefficient_width
  }
  while (split.ring_buffer_first_scanline < end_output_y) stbir__handle_scanline_for_scatter(info, split)
  ++last_input_y
  if (split.end_input_y > last_input_y) split.end_input_y = last_input_y
}

// ---------------------------------------------------------------------------
// Building the samplers

// stb_image_resize2.h:6340-6420
function stbir__set_sampler(scale_info: ScaleInfo, filter: number, edge: number, always_gather: boolean): Sampler {
  if (filter === STBIR_FILTER_DEFAULT) {
    filter = STBIR_FILTER_MITCHELL
    if (scale_info.scale >= ONE_MINUS_SMALL) {
      if (scale_info.scale <= ONE_PLUS_SMALL && Math.ceil(scale_info.pixel_shift) === scale_info.pixel_shift) {
        filter = STBIR_FILTER_POINT_SAMPLE
      } else {
        filter = STBIR_FILTER_CATMULLROM
      }
    }
  }
  const samp: Sampler = {
    contributors: new Int32Array(0),
    coefficients: new Float32Array(0),
    gather_prescatter_contributors: null,
    gather_prescatter_coefficients: null,
    scale_info,
    filter_enum: filter,
    filter_kernel: stbir__builtin_kernels[filter]!,
    filter_support: stbir__builtin_supports[filter]!,
    edge,
    coefficient_width: 0,
    filter_pixel_width: 0,
    filter_pixel_margin: 0,
    num_contributors: 0,
    extent_info: { lowest: 0, highest: 0, widest: 0 },
    is_gather: 0,
    gather_prescatter_num_contributors: 0,
    gather_prescatter_coefficient_width: 0,
  }
  samp.filter_pixel_width = stbir__get_filter_pixel_width(samp.filter_support, scale_info.scale)
  if (scale_info.scale >= ONE_MINUS_SMALL) samp.is_gather = 1
  else if (always_gather || samp.filter_pixel_width <= 32) samp.is_gather = 2 // :1189-1191
  samp.coefficient_width = stbir__get_coefficient_width(samp, samp.is_gather)
  if (edge === STBIR_EDGE_WRAP && samp.filter_pixel_width > scale_info.input_full_size * 3) {
    samp.filter_pixel_width = scale_info.input_full_size * 3
  }
  samp.filter_pixel_margin = Math.trunc(samp.filter_pixel_width / 2)
  if (edge === STBIR_EDGE_WRAP && samp.filter_pixel_margin > scale_info.input_full_size) {
    samp.filter_pixel_margin = scale_info.input_full_size
  }
  samp.num_contributors = stbir__get_contributors(samp, samp.is_gather)
  if (samp.is_gather === 0) {
    samp.gather_prescatter_coefficient_width = samp.filter_pixel_width
    samp.gather_prescatter_num_contributors = stbir__get_contributors(samp, 2)
  }
  return samp
}

// stb_image_resize2.h:6422-6512
function stbir__get_conservative_extents(samp: Sampler, range: { n0: number, n1: number }): void {
  const scale = samp.scale_info.scale
  const out_shift = samp.scale_info.pixel_shift
  const support = samp.filter_support
  const input_full_size = samp.scale_info.input_full_size
  const edge = samp.edge
  const inv_scale = samp.scale_info.inv_scale

  if (samp.is_gather === 1) {
    const out_filter_radius = f(support(inv_scale) * scale)
    range.n0 = stbir__calculate_in_pixel_range(0.5, out_filter_radius, inv_scale, out_shift, input_full_size, edge)[0]
    range.n1 = stbir__calculate_in_pixel_range(f(samp.scale_info.output_sub_size - 1 + 0.5), out_filter_radius,
      inv_scale, out_shift, input_full_size, edge)[1]
  } else if (samp.is_gather === 2) {
    const in_pixels_radius = f(support(scale) * inv_scale)
    const filter_pixel_margin = samp.filter_pixel_margin
    const output_sub_size = samp.scale_info.output_sub_size
    range.n0 = stbir__calculate_in_pixel_range(0, 0, inv_scale, out_shift, input_full_size, edge)[0]
    range.n1 = stbir__calculate_in_pixel_range(output_sub_size, 0, inv_scale, out_shift, input_full_size, edge)[1]

    let n = range.n0 + 1
    let input_end = -filter_pixel_margin
    while (n >= input_end) {
      const [out_first, out_last] = stbir__calculate_out_pixel_range(f(n + 0.5), in_pixels_radius, scale, out_shift,
        output_sub_size)
      if (out_first > out_last) break
      if (out_first < output_sub_size || out_last >= 0) range.n0 = n
      --n
    }
    n = range.n1 - 1
    input_end = n + 1 + filter_pixel_margin
    while (n <= input_end) {
      const [out_first, out_last] = stbir__calculate_out_pixel_range(f(n + 0.5), in_pixels_radius, scale, out_shift,
        output_sub_size)
      if (out_first > out_last) break
      if (out_first < output_sub_size || out_last >= 0) range.n1 = n
      ++n
    }
  }

  if (samp.edge === STBIR_EDGE_WRAP) {
    if (range.n0 > 0 && range.n1 >= input_full_size) {
      const marg = range.n1 - input_full_size + 1
      if (marg + 16 >= range.n0) range.n0 = 0
    }
    if (range.n0 < 0 && range.n1 < input_full_size - 1) {
      const marg = -range.n0
      if (input_full_size - marg - 16 - 1 <= range.n1) range.n1 = input_full_size - 1
    }
  } else {
    // for non-edge-wrap modes, we never read over the edge, so clamp
    if (range.n0 < 0) range.n0 = 0
    if (range.n1 >= input_full_size) range.n1 = input_full_size - 1
  }
}

// stb_image_resize2.h:6612-6661
const stbir__compute_weights: number[][][] = [
  [[1.00000, 1.00000, 0.31250, 1.00000], [0.56250, 0.59375, 0.00000, 0.96875], [1.00000, 0.06250, 0.00000, 1.00000],
   [0.00000, 0.09375, 1.00000, 1.00000], [1.00000, 1.00000, 1.00000, 1.00000], [0.03125, 0.12500, 1.00000, 1.00000],
   [0.06250, 0.12500, 0.00000, 1.00000], [0.00000, 1.00000, 0.00000, 0.03125]],
  [[0.00000, 0.84375, 0.00000, 0.03125], [0.09375, 0.93750, 0.00000, 0.78125], [0.87500, 0.21875, 0.00000, 0.96875],
   [0.09375, 0.09375, 1.00000, 1.00000], [1.00000, 1.00000, 1.00000, 1.00000], [0.03125, 0.12500, 1.00000, 1.00000],
   [0.06250, 0.12500, 0.00000, 1.00000], [0.00000, 1.00000, 0.00000, 0.53125]],
  [[0.00000, 0.53125, 0.00000, 0.03125], [0.06250, 0.96875, 0.00000, 0.53125], [0.87500, 0.18750, 0.00000, 0.93750],
   [0.00000, 0.09375, 1.00000, 1.00000], [1.00000, 1.00000, 1.00000, 1.00000], [0.03125, 0.12500, 1.00000, 1.00000],
   [0.06250, 0.12500, 0.00000, 1.00000], [0.00000, 1.00000, 0.00000, 0.56250]],
  [[0.00000, 0.50000, 0.00000, 0.71875], [0.06250, 0.84375, 0.00000, 0.87500], [1.00000, 0.50000, 0.50000, 0.96875],
   [1.00000, 0.09375, 0.31250, 0.50000], [1.00000, 1.00000, 1.00000, 1.00000], [1.00000, 0.03125, 0.03125, 0.53125],
   [0.18750, 0.12500, 0.00000, 1.00000], [0.00000, 1.00000, 0.03125, 0.18750]],
  [[0.00000, 0.59375, 0.00000, 0.96875], [0.06250, 0.81250, 0.06250, 0.59375], [0.75000, 0.43750, 0.12500, 0.96875],
   [0.87500, 0.06250, 0.18750, 0.43750], [1.00000, 1.00000, 1.00000, 1.00000], [0.15625, 0.12500, 1.00000, 1.00000],
   [0.06250, 0.12500, 0.00000, 1.00000], [0.00000, 1.00000, 0.03125, 0.34375]],
]

// stb_image_resize2.h:6703-6750. The order changes float rounding, so this
// cost model is reproduced exactly (float products, compared as doubles).
function stbir__should_do_vertical_first(weights_table: number[][], horizontal_filter_pixel_width: number,
  horizontal_scale: number, horizontal_output_size: number, vertical_filter_pixel_width: number,
  vertical_scale: number, vertical_output_size: number, is_gather: number): boolean {
  let v_classification: number
  if (vertical_output_size <= 4 || horizontal_output_size <= 4) {
    v_classification = vertical_output_size < horizontal_output_size ? 6 : 7
  } else if (vertical_scale <= 1) {
    v_classification = is_gather ? 1 : 0
  } else if (vertical_scale <= 2) {
    v_classification = 2
  } else if (vertical_scale <= 3) {
    v_classification = 3
  } else if (vertical_scale <= 4) {
    v_classification = 5
  } else {
    v_classification = 6
  }
  const weights = weights_table[v_classification]!
  const h_cost = f(f(horizontal_filter_pixel_width * weights[0]!) +
    f(f(horizontal_scale * vertical_filter_pixel_width) * weights[1]!))
  const v_cost = f(f(vertical_filter_pixel_width * weights[2]!) +
    f(f(vertical_scale * horizontal_filter_pixel_width) * weights[3]!))
  return v_cost <= h_cost
}

// stb_image_resize2.h:6752-6764
const stbir__pixel_channels = [1, 2, 3, 3, 4, 4, 4, 4, 4, 2, 2, 4, 4, 4, 4, 2, 2]
const stbir__pixel_layout_convert_public_to_internal = [STBIRI_BGR, STBIRI_1CHANNEL, STBIRI_2CHANNEL, STBIRI_RGB,
  STBIRI_RGBA, STBIRI_4CHANNEL, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]

function newSplitInfo(): SplitInfo {
  return {
    decode_buffer: new Float32Array(0), ring_buffer_first_scanline: 0, ring_buffer_last_scanline: 0,
    ring_buffer_begin_index: 0, start_output_y: 0, end_output_y: 0, start_input_y: 0, end_input_y: 0,
    ring_buffers: [], vertical_buffer: new Float32Array(0),
  }
}

// stb_image_resize2.h:6766-7129 (one split, separate buffers)
function stbir__alloc_internal_mem_and_build_samplers(horizontal: Sampler, vertical: Sampler,
  conservative: { n0: number, n1: number }, input_pixel_layout_public: number,
  output_pixel_layout_public: number): Omit<Info, 'input_data' | 'output_data' | 'input_stride' | 'output_stride' |
  'decode_pixels' | 'encode_pixels'> | null {
  const stbir_channel_count_index = [9, 0, 1, 2, 3, 9, 9, 4]
  const input_pixel_layout = stbir__pixel_layout_convert_public_to_internal[input_pixel_layout_public]!
  const output_pixel_layout = stbir__pixel_layout_convert_public_to_internal[output_pixel_layout_public]!
  const channels = stbir__pixel_channels[input_pixel_layout]!
  let effective_channels = channels
  let alpha_weighting_type = 0 // 0=none, 1=simple, 2=fancy

  if (horizontal.filter_enum !== STBIR_FILTER_POINT_SAMPLE || vertical.filter_enum !== STBIR_FILTER_POINT_SAMPLE) {
    const isAlpha = (layout: number) => layout >= STBIRI_RGBA && layout <= STBIRI_AR
    const isPremultiplied = (layout: number) => layout >= STBIRI_RGBA_PM && layout <= STBIRI_AR_PM
    if (isAlpha(input_pixel_layout) && isAlpha(output_pixel_layout)) {
      // fast_alpha is 0 in the easy API (:7486)
      alpha_weighting_type = 2
      effective_channels = [7, 7, 7, 7, 3, 3][input_pixel_layout - STBIRI_RGBA]!
    } else if ((isPremultiplied(input_pixel_layout) && isAlpha(output_pixel_layout)) ||
               (isAlpha(input_pixel_layout) && isPremultiplied(output_pixel_layout))) {
      alpha_weighting_type = input_pixel_layout >= STBIRI_RGBA_PM ? 3 : 1
    }
  }
  if (channels !== stbir__pixel_channels[output_pixel_layout]) return null
  // Ported layouts: plain channels, RGBA and RGBA_PM (the easy API resizes one
  // layout to itself, so the simple alpha types 1 and 3 never arise). The
  // swizzled BGRA/ARGB/ABGR/RA/AR coders are not ported.
  if (alpha_weighting_type === 1 || alpha_weighting_type === 3) return null
  if (input_pixel_layout > STBIRI_RGBA && input_pixel_layout !== STBIRI_RGBA_PM) return null

  const vertical_first = stbir__should_do_vertical_first(
    stbir__compute_weights[stbir_channel_count_index[effective_channels]!]!, horizontal.filter_pixel_width,
    horizontal.scale_info.scale, horizontal.scale_info.output_sub_size, vertical.filter_pixel_width,
    vertical.scale_info.scale, vertical.scale_info.output_sub_size, vertical.is_gather)

  // Sizes in floats; each includes the upstream extra float of padding.
  const decode_buffer_size = (conservative.n1 - conservative.n0 + 1) * effective_channels + 1
  let ring_buffer_length = horizontal.scale_info.output_sub_size * effective_channels + 1
  if (vertical_first) ring_buffer_length = ((decode_buffer_size * 4 + 15) & ~15) / 4
  let alloc_ring_buffer_num_entries = vertical.filter_pixel_width + 1
  const conservative_split_output_size = vertical.scale_info.output_sub_size // stbir__get_max_split, 1 split
  if (!vertical.is_gather && alloc_ring_buffer_num_entries > conservative_split_output_size) {
    alloc_ring_buffer_num_entries = conservative_split_output_size
  }
  const vertical_buffer_size = horizontal.scale_info.output_sub_size * effective_channels + 1

  const split = newSplitInfo()
  split.decode_buffer = new Float32Array(decode_buffer_size)
  for (let j = 0; j < alloc_ring_buffer_num_entries; j++) split.ring_buffers.push(new Float32Array(ring_buffer_length))
  split.vertical_buffer = new Float32Array(vertical_buffer_size)

  if (vertical.is_gather === 0) {
    vertical.gather_prescatter_contributors = new Int32Array(vertical.gather_prescatter_num_contributors * 2)
    vertical.gather_prescatter_coefficients = new Float32Array(
      vertical.gather_prescatter_num_contributors * vertical.gather_prescatter_coefficient_width)
  }
  horizontal.contributors = new Int32Array(horizontal.num_contributors * 2)
  horizontal.coefficients = new Float32Array(horizontal.num_contributors * horizontal.coefficient_width + 1)

  // are the two filters identical?? (happens a lot with mipmap generation)
  let copy_horizontal = false
  let possibly_use_horizontal_for_pivot: Sampler | null = null
  if (horizontal.filter_kernel === vertical.filter_kernel && horizontal.filter_support === vertical.filter_support &&
      horizontal.edge === vertical.edge &&
      horizontal.scale_info.output_sub_size === vertical.scale_info.output_sub_size) {
    let diff_scale = f(horizontal.scale_info.scale - vertical.scale_info.scale)
    let diff_shift = f(horizontal.scale_info.pixel_shift - vertical.scale_info.pixel_shift)
    if (diff_scale < 0) diff_scale = -diff_scale
    if (diff_shift < 0) diff_shift = -diff_shift
    if (diff_scale <= stbir__small_float && diff_shift <= stbir__small_float) {
      if (horizontal.is_gather === vertical.is_gather) copy_horizontal = true
      else possibly_use_horizontal_for_pivot = horizontal
    }
  }
  if (!copy_horizontal) {
    vertical.contributors = new Int32Array(vertical.num_contributors * 2)
    vertical.coefficients = new Float32Array(vertical.num_contributors * vertical.coefficient_width + 1)
  }

  stbir__calculate_filters(horizontal, null)
  const scanline_extents: Extents = {
    conservative: { n0: conservative.n0, n1: conservative.n1 },
    edge_sizes: [0, 0],
    spans: [{ n0: 0, n1: -1, pixel_offset_for_input: 0 }, { n0: 0, n1: -1, pixel_offset_for_input: 0 }],
  }
  stbir__get_extents(horizontal, scanline_extents)
  horizontal.coefficient_width = stbir__pack_coefficients(horizontal.num_contributors, horizontal.contributors,
    horizontal.coefficients, horizontal.coefficient_width, horizontal.extent_info.widest, conservative.n0,
    conservative.n1)

  let infoVertical: Sampler
  if (copy_horizontal) {
    infoVertical = { ...horizontal, extent_info: { ...horizontal.extent_info } }
  } else {
    stbir__calculate_filters(vertical, possibly_use_horizontal_for_pivot)
    infoVertical = vertical
  }

  // stbir__get_split_info (:6514-6533)
  split.start_output_y = 0
  split.end_output_y = infoVertical.scale_info.output_sub_size
  split.start_input_y = -infoVertical.filter_pixel_margin
  split.end_input_y = infoVertical.scale_info.input_full_size + infoVertical.filter_pixel_margin

  let ring_buffer_num_entries = infoVertical.extent_info.widest
  if (!infoVertical.is_gather && ring_buffer_num_entries > conservative_split_output_size) {
    ring_buffer_num_entries = conservative_split_output_size
  }

  // numerically valid values where some routines read one float past the end
  const spans = scanline_extents.spans
  const width = spans[0].n1 > spans[1].n1 ? spans[0].n1 - spans[0].n0 : spans[1].n1 - spans[1].n0
  const ofs = (width + 1 - conservative.n0 + scanline_extents.edge_sizes[1]) * effective_channels
  split.decode_buffer[ofs] = 9999
  if (vertical_first) for (let j = 0; j < ring_buffer_num_entries; j++) split.ring_buffers[j]![ofs] = 9999

  return {
    horizontal,
    vertical: infoVertical,
    ring_buffer_num_entries,
    scanline_extents,
    split_info: split,
    alpha_weight: alpha_weighting_type === 2 ? stbir__fancy_alpha_weight_4ch : null,
    alpha_unweight: alpha_weighting_type === 2 ? stbir__fancy_alpha_unweight_4ch : null,
    input_pixel_layout_internal: input_pixel_layout,
    output_pixel_layout_internal: output_pixel_layout,
    vertical_first,
    channels,
    effective_channels,
  }
}

// stb_image_resize2.h:7322-7397
function stbir__double_to_rational(fv: number, limit: number, limit_denom: boolean):
  { ok: number, numer: number, denom: number } {
  let top = BigInt(Math.trunc(fv * (1 << 25)))
  let bot = 1n << 25n
  let numer_last = 0n, denom_last = 1n, numer_estimate = 1n, denom_estimate = 0n
  const big_limit = BigInt(limit)
  for (;;) {
    if ((limit_denom ? denom_estimate : numer_estimate) >= big_limit) break
    if (denom_estimate) {
      const err = Math.abs(Number(numer_estimate) / Number(denom_estimate) - fv)
      if (err < 1.0 / (1 << 24)) {
        return { ok: 1, numer: Number(BigInt.asUintN(32, numer_estimate)),
          denom: Number(BigInt.asUintN(32, denom_estimate)) }
      }
    }
    if (bot === 0n) break
    const est = top / bot
    let temp = top % bot
    top = bot
    bot = temp
    temp = est * denom_estimate + denom_last
    denom_last = denom_estimate
    denom_estimate = temp
    temp = est * numer_estimate + numer_last
    numer_last = numer_estimate
    numer_estimate = temp
  }
  if (limit_denom) {
    numer_estimate = BigInt(Math.trunc(fv * limit + 0.5))
    denom_estimate = big_limit
  } else {
    numer_estimate = big_limit
    denom_estimate = BigInt(Math.trunc(limit / fv + 0.5))
  }
  const numer = Number(BigInt.asUintN(32, numer_estimate))
  const denom = Number(BigInt.asUintN(32, denom_estimate))
  const err = Math.abs(denom_estimate ? numer / denom - fv : 1.0)
  return { ok: err < 1.0 / (1 << 24) ? 1 : 0, numer, denom }
}

// stb_image_resize2.h:7399-7447, for a full output range (offset 0) and the
// full input range (s0 = 0, s1 = 1), where stbir__clip (:7296-7320) is a no-op.
function stbir__calculate_region_transform(output_full_range: number, input_full_range: number): ScaleInfo | null {
  const input_s0 = 0, input_s1 = 1
  const output_sub_range = output_full_range
  const input_s = input_s1 - input_s0
  if (output_full_range === 0 || input_full_range === 0 || output_sub_range === 0 || input_s <= stbir__small_float) {
    return null
  }
  const output_range = output_full_range
  const input_range = input_full_range
  const output_s = output_sub_range / output_range
  const ratio = output_s / input_s
  const scale = (output_range / input_range) * ratio
  const rational = stbir__double_to_rational(scale, scale <= 1.0 ? output_full_range : input_full_range, scale >= 1.0)
  return {
    input_full_size: input_full_range,
    output_sub_size: output_sub_range,
    scale: f(scale),
    inv_scale: f(1.0 / scale),
    pixel_shift: f(input_s0 * ratio * output_range),
    scale_is_rational: rational.ok,
    scale_numerator: rational.numer,
    scale_denominator: rational.denom,
  }
}

// stbir_resize_init + stbir_resize_extended + stbir__perform_build +
// stbir__update_info_from_resize + stbir__perform_resize
// (stb_image_resize2.h:7131-7145,7147-7294,7471-7488,7627-7699,7731-7770).
function stbir__resize(input: Pixels, input_w: number, input_h: number, input_stride_in_bytes: number,
  output: Pixels, output_w: number, output_h: number, output_stride_in_bytes: number,
  pixel_layout: number, data_type: number): boolean {
  const horizontal_scale = stbir__calculate_region_transform(output_w, input_w)
  if (!horizontal_scale) return false
  const vertical_scale = stbir__calculate_region_transform(output_h, input_h)
  if (!vertical_scale) return false
  if (horizontal_scale.output_sub_size === 0 || vertical_scale.output_sub_size === 0) return false

  const horizontal = stbir__set_sampler(horizontal_scale, STBIR_FILTER_DEFAULT, STBIR_EDGE_CLAMP, true)
  const conservative = { n0: 0, n1: 0 }
  stbir__get_conservative_extents(horizontal, conservative)
  const vertical = stbir__set_sampler(vertical_scale, STBIR_FILTER_DEFAULT, STBIR_EDGE_CLAMP, false)
  const built = stbir__alloc_internal_mem_and_build_samplers(horizontal, vertical, conservative, pixel_layout,
    pixel_layout)
  if (!built) return false

  // stbir__update_info_from_resize (:7147-7294)
  let input_type = data_type
  let output_type = data_type
  if (built.horizontal.filter_enum === STBIR_FILTER_POINT_SAMPLE &&
      built.vertical.filter_enum === STBIR_FILTER_POINT_SAMPLE &&
      (input_type === STBIR_TYPE_UINT8_SRGB || input_type === STBIR_TYPE_UINT8_SRGB_ALPHA) &&
      (output_type === STBIR_TYPE_UINT8_SRGB || output_type === STBIR_TYPE_UINT8_SRGB_ALPHA)) {
    // completely point sampling: sRGB conversion is skipped
    input_type = STBIR_TYPE_UINT8
    output_type = STBIR_TYPE_UINT8
  }
  const type_size = stbir__type_size[data_type]!
  if (input_stride_in_bytes === 0) input_stride_in_bytes = built.channels * input_w * type_size
  if (output_stride_in_bytes === 0) output_stride_in_bytes = built.channels * output_w * type_size
  if (input_stride_in_bytes % type_size || output_stride_in_bytes % type_size) return false
  const has_alpha = built.input_pixel_layout_internal >= STBIRI_RGBA
  let decode_pixels: Decoder
  let encode_pixels: Encoder
  if (input_type === STBIR_TYPE_UINT8) {
    const non_scaled = !built.alpha_weight && !built.alpha_unweight && output_type === STBIR_TYPE_UINT8
    decode_pixels = non_scaled ? stbir__decode_uint8_linear : stbir__decode_uint8_linear_scaled
    encode_pixels = non_scaled ? stbir__encode_uint8_linear : stbir__encode_uint8_linear_scaled
  } else if (input_type === STBIR_TYPE_UINT8_SRGB) {
    decode_pixels = has_alpha ? stbir__decode_uint8_srgb4_linearalpha : stbir__decode_uint8_srgb
    encode_pixels = has_alpha ? stbir__encode_uint8_srgb4_linearalpha : stbir__encode_uint8_srgb
  } else {
    decode_pixels = stbir__decode_float_linear
    encode_pixels = stbir__encode_float_linear
  }

  const info: Info = {
    ...built,
    input_data: input,
    output_data: output,
    input_stride: input_stride_in_bytes / type_size,
    output_stride: output_stride_in_bytes / type_size,
    decode_pixels,
    encode_pixels,
  }
  const lastRow = (input_h - 1) * info.input_stride + input_w * built.channels
  const lastOutRow = (output_h - 1) * info.output_stride + output_w * built.channels
  if (input.length < lastRow || output.length < lastOutRow) return false

  if (info.vertical.is_gather) stbir__vertical_gather_loop(info, info.split_info)
  else stbir__vertical_scatter_loop(info, info.split_info)
  return true
}

// stb_image_resize2.h:7794-7829. A null output is allocated (and then packed,
// whatever stride was given).
function stbir__check_output_stuff<T extends Pixels>(output: T | null, alloc: (n: number) => T, type_size: number,
  output_w: number, output_h: number, output_stride_in_bytes: number, pixel_layout: number):
  { output: T, stride: number } | null {
  const internal = stbir__pixel_layout_convert_public_to_internal[pixel_layout]
  if (internal === undefined) return null
  const pitch = output_w * type_size * stbir__pixel_channels[internal]!
  if (pitch <= 0 || output_h <= 0) return null
  if (output_stride_in_bytes === 0) output_stride_in_bytes = pitch
  if (output_stride_in_bytes < pitch) return null
  const size = output_stride_in_bytes * output_h
  if (output === null) return { output: alloc(size / type_size), stride: pitch }
  return { output, stride: output_stride_in_bytes }
}

function stbir__valid_layout(pixel_layout: number): boolean {
  return Number.isInteger(pixel_layout) && pixel_layout >= 0 && pixel_layout <= STBIR_AR_PM
}

/**
 * stbir_resize_uint8_srgb (stb_image_resize2.h:7857-7882): resizes 8-bit sRGB
 * pixels (alpha, when the layout has one, stays linear). Strides are in bytes;
 * 0 means packed rows. Returns the output (allocated when `output` is null), or
 * null on failure.
 */
export function stbir_resize_uint8_srgb(input: Uint8Array, input_w: number, input_h: number,
  input_stride_in_bytes: number, output: Uint8Array | null, output_w: number, output_h: number,
  output_stride_in_bytes: number, pixel_layout: stbir_pixel_layout): Uint8Array | null {
  if (!stbir__valid_layout(pixel_layout)) return null
  const checked = stbir__check_output_stuff(output, (n) => new Uint8Array(n), 1, output_w, output_h,
    output_stride_in_bytes, pixel_layout)
  if (!checked) return null
  return stbir__resize(input, input_w, input_h, input_stride_in_bytes, checked.output, output_w, output_h,
    checked.stride, pixel_layout, STBIR_TYPE_UINT8_SRGB) ? checked.output : null
}

/**
 * stbir_resize_uint8_linear (stb_image_resize2.h:7831-7855): resizes linear
 * 8-bit pixels. Strides are in bytes; 0 means packed rows.
 */
export function stbir_resize_uint8_linear(input: Uint8Array, input_w: number, input_h: number,
  input_stride_in_bytes: number, output: Uint8Array | null, output_w: number, output_h: number,
  output_stride_in_bytes: number, pixel_layout: stbir_pixel_layout): Uint8Array | null {
  if (!stbir__valid_layout(pixel_layout)) return null
  const checked = stbir__check_output_stuff(output, (n) => new Uint8Array(n), 1, output_w, output_h,
    output_stride_in_bytes, pixel_layout)
  if (!checked) return null
  return stbir__resize(input, input_w, input_h, input_stride_in_bytes, checked.output, output_w, output_h,
    checked.stride, pixel_layout, STBIR_TYPE_UINT8) ? checked.output : null
}

/**
 * stbir_resize_float_linear (stb_image_resize2.h:7884-7908): resizes linear
 * 32-bit float pixels. Strides are in bytes (multiples of 4); 0 means packed.
 */
export function stbir_resize_float_linear(input: Float32Array, input_w: number, input_h: number,
  input_stride_in_bytes: number, output: Float32Array | null, output_w: number, output_h: number,
  output_stride_in_bytes: number, pixel_layout: stbir_pixel_layout): Float32Array | null {
  if (!stbir__valid_layout(pixel_layout)) return null
  const checked = stbir__check_output_stuff(output, (n) => new Float32Array(n), 4, output_w, output_h,
    output_stride_in_bytes, pixel_layout)
  if (!checked) return null
  return stbir__resize(input, input_w, input_h, input_stride_in_bytes, checked.output, output_w, output_h,
    checked.stride, pixel_layout, STBIR_TYPE_FLOAT) ? checked.output : null
}
