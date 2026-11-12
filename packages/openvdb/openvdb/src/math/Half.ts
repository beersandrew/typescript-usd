// Ported from OpenVDB 13.0.1: openvdb/openvdb/math/Half.h
// OpenEXR (Imath half): Copyright Contributors to the OpenEXR Project. BSD
//  3-Clause License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// IEEE 754 binary16 -> binary32 promotion (upstream math/Half.h, vendored
// Imath half). Grids saved with the "save float as half" flag store leaf
// buffers as half; reading promotes them to float exactly as C++ does.

const buf = new Float32Array(1)
const bufU32 = new Uint32Array(buf.buffer)

export function halfToFloat(h: number): number {
  const sign = (h & 0x8000) << 16
  const exp = (h >> 10) & 0x1f
  const mant = h & 0x3ff
  let bits: number
  if (exp === 0) {
    if (mant === 0) {
      bits = sign // +-0
    } else {
      // subnormal half -> normalized float
      let e = -1
      let m = mant
      do {
        ++e
        m <<= 1
      } while ((m & 0x400) === 0)
      bits = sign | ((127 - 15 - e) << 23) | ((m & 0x3ff) << 13)
    }
  } else if (exp === 31) {
    bits = sign | 0x7f800000 | (mant << 13) // inf / NaN
  } else {
    bits = sign | ((exp - 15 + 127) << 23) | (mant << 13)
  }
  bufU32[0] = bits
  return buf[0]!
}
