// Ported from OpenUSD 26.11.1: pxr/base/arch/hash.cpp, pxr/base/arch/hash.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ArchHash / ArchHash64, ported from OpenUSD v26.11.1 pxr/base/arch/hash.h:19-38
// and hash.cpp:12-660: Bob Jenkins' public-domain SpookyHash V2, as embedded
// upstream (little-endian, unaligned reads allowed, hash.cpp:307).
//
// JavaScript has no native 64-bit integer arithmetic outside BigInt, so every
// uint64 SpookyHash variable is held as two uint32 halves in a scratch
// Uint32Array (index 2k = low word, 2k+1 = high word). Stores into the
// Uint32Array wrap modulo 2^32, which gives the C++ unsigned overflow
// semantics. Only SpookyHash::Hash128 and the Short/Mix/End helpers it calls
// are ported; Init/Update/Final are ARCH_UNUSED_FUNCTION upstream
// (hash.cpp:93-118) and no ArchHash entry point reaches them.
//
// No FAITHFULNESS-DEBT: results are bit-identical to the native build (see
// tests/upstream/fixtures/hash).

// Register file: h0..h11 at [0, 24); ShortMix/ShortEnd use h0..h3 as a, b, c, d.
const R = new Uint32Array(24)
// The zero-padded final block (hash.cpp:465-469).
const BLOCK = new Uint8Array(96)

// hash.cpp:283-299
const SC_NUM_VARS = 12
const SC_BLOCK_SIZE = SC_NUM_VARS * 8
const SC_BUF_SIZE = 2 * SC_BLOCK_SIZE
const SC_CONST_HI = 0xdeadbeef
const SC_CONST_LO = 0xdeadbeef

/** Hash128's out-params, as [hash1Lo, hash1Hi, hash2Lo, hash2Hi]. */
export const Arch_spookyOut = new Uint32Array(4)

function u32(m: Uint8Array, p: number): number {
  return (m[p]! | (m[p + 1]! << 8) | (m[p + 2]! << 16) | (m[p + 3]! << 24)) >>> 0
}

// x += (hi:lo)
function add(x: number, hi: number, lo: number): void {
  const s = R[x]! + lo
  R[x] = s
  R[x + 1] = R[x + 1]! + hi + (s > 0xffffffff ? 1 : 0)
}

// x += y
function addR(x: number, y: number): void {
  add(x, R[y + 1]!, R[y]!)
}

// x += *(uint64 *)(m + p)
function addM(x: number, m: Uint8Array, p: number): void {
  add(x, u32(m, p + 4), u32(m, p))
}

// x ^= y
function xorR(x: number, y: number): void {
  R[x] = R[x]! ^ R[y]!
  R[x + 1] = R[x + 1]! ^ R[y + 1]!
}

// x = Rot64(x, k), hash.cpp:123-126 (0 < k < 64)
function rot(x: number, k: number): void {
  const lo = R[x]!
  const hi = R[x + 1]!
  if (k < 32) {
    R[x + 1] = (hi << k) | (lo >>> (32 - k))
    R[x] = (lo << k) | (hi >>> (32 - k))
  } else if (k === 32) {
    R[x + 1] = lo
    R[x] = hi
  } else {
    const j = k - 32
    R[x + 1] = (lo << j) | (hi >>> (32 - j))
    R[x] = (hi << j) | (lo >>> (32 - j))
  }
}

// Register indices.
const H0 = 0, H1 = 2, H2 = 4, H3 = 6, H4 = 8, H5 = 10
const H6 = 12, H7 = 14, H8 = 16, H9 = 18, H10 = 20, H11 = 22

// hash.cpp:141-159. Arguments of each step: s_i += data[i]; s_{i+2} ^= s_{i+10};
// s_{i+11} ^= s_i; s_i = Rot64(s_i, r); s_{i+11} += s_{i+1} (indices mod 12).
const MIX_ROT = [11, 32, 43, 31, 17, 28, 39, 57, 55, 54, 22, 46] as const
// Register index of h_{(i + k) mod 12}, for i in [0, 12) and k in [0, 12).
const REG = new Uint8Array(SC_NUM_VARS * SC_NUM_VARS)
for (let i = 0; i < SC_NUM_VARS; ++i) {
  for (let k = 0; k < SC_NUM_VARS; ++k) REG[i * SC_NUM_VARS + k] = 2 * ((i + k) % SC_NUM_VARS)
}
function mix(m: Uint8Array, p: number): void {
  for (let i = 0; i < SC_NUM_VARS; ++i) {
    const r = i * SC_NUM_VARS
    const si = 2 * i
    const s11 = REG[r + 11]!
    addM(si, m, p + 8 * i)
    xorR(REG[r + 2]!, REG[r + 10]!)
    xorR(s11, si)
    rot(si, MIX_ROT[i]!)
    addR(s11, REG[r + 1]!)
  }
}

// hash.cpp:177-194. Step i: h_{i+11} += h_{i+1}; h_{i+2} ^= h_{i+11};
// h_{i+1} = Rot64(h_{i+1}, r) (indices mod 12).
const END_ROT = [44, 15, 34, 21, 38, 33, 10, 13, 38, 53, 42, 54] as const
function endPartial(): void {
  for (let i = 0; i < SC_NUM_VARS; ++i) {
    const r = i * SC_NUM_VARS
    const a = REG[r + 11]!
    const b = REG[r + 1]!
    const c = REG[r + 2]!
    addR(a, b)
    xorR(c, a)
    rot(b, END_ROT[i]!)
  }
}

// hash.cpp:196-208
function end(m: Uint8Array, p: number): void {
  for (let i = 0; i < SC_NUM_VARS; ++i) addM(2 * i, m, p + 8 * i)
  endPartial()
  endPartial()
  endPartial()
}

// hash.cpp:225-239, on a = H0, b = H1, c = H2, d = H3. Step: x = Rot64(x, r);
// x += y; z ^= x, cycling (x, y, z) through (h2,h3,h0) (h3,h0,h1) (h0,h1,h2)
// (h1,h2,h3).
const SHORT_MIX_ROT = [50, 52, 30, 41, 54, 48, 38, 37, 62, 34, 5, 36] as const
function shortMix(): void {
  for (let i = 0; i < 12; ++i) {
    const x = 2 * ((i + 2) & 3)
    const y = 2 * ((i + 3) & 3)
    const z = 2 * (i & 3)
    rot(x, SHORT_MIX_ROT[i]!)
    addR(x, y)
    xorR(z, x)
  }
}

// hash.cpp:253-266. Step: y ^= x; x = Rot64(x, r); y += x, cycling (x, y)
// through (h2,h3) (h3,h0) (h0,h1) (h1,h2).
const SHORT_END_ROT = [15, 52, 26, 51, 28, 9, 47, 54, 32, 25, 63] as const
function shortEnd(): void {
  for (let i = 0; i < 11; ++i) {
    const x = 2 * ((i + 2) & 3)
    const y = 2 * ((i + 3) & 3)
    xorR(y, x)
    rot(x, SHORT_END_ROT[i]!)
    addR(y, x)
  }
}

// hash.cpp:313-413
function short(m: Uint8Array, start: number, length: number): void {
  const A = H0, B = H1, C = H2, D = H3
  let p = start
  let remainder = length % 32
  // a, b already hold the seeds.
  R[C] = SC_CONST_LO; R[C + 1] = SC_CONST_HI
  R[D] = SC_CONST_LO; R[D + 1] = SC_CONST_HI

  if (length > 15) {
    const endP = start + Math.floor(length / 32) * 32
    // handle all complete sets of 32 bytes
    for (; p < endP; p += 32) {
      addM(C, m, p)
      addM(D, m, p + 8)
      shortMix()
      addM(A, m, p + 16)
      addM(B, m, p + 24)
    }
    // Handle the case of 16+ remaining bytes.
    if (remainder >= 16) {
      addM(C, m, p)
      addM(D, m, p + 8)
      shortMix()
      p += 16
      remainder -= 16
    }
  }

  // Handle the last 0..15 bytes, and its length. ((uint64)length) << 56
  // keeps only the low byte of length.
  add(D, ((length & 0xff) << 24) >>> 0, 0)
  /* eslint-disable no-fallthrough */
  switch (remainder) {
    case 15: add(D, m[p + 14]! << 16, 0)
    case 14: add(D, m[p + 13]! << 8, 0)
    case 13: add(D, m[p + 12]!, 0)
    case 12:
      add(D, 0, u32(m, p + 8))
      addM(C, m, p)
      break
    case 11: add(D, 0, m[p + 10]! << 16)
    case 10: add(D, 0, m[p + 9]! << 8)
    case 9: add(D, 0, m[p + 8]!)
    case 8:
      addM(C, m, p)
      break
    case 7: add(C, m[p + 6]! << 16, 0)
    case 6: add(C, m[p + 5]! << 8, 0)
    case 5: add(C, m[p + 4]!, 0)
    case 4:
      add(C, 0, u32(m, p))
      break
    case 3: add(C, 0, m[p + 2]! << 16)
    case 2: add(C, 0, m[p + 1]! << 8)
    case 1:
      add(C, 0, m[p]!)
      break
    case 0:
      add(C, SC_CONST_HI, SC_CONST_LO)
      add(D, SC_CONST_HI, SC_CONST_LO)
  }
  /* eslint-enable no-fallthrough */
  shortEnd()
}

/**
 * SpookyHash::Hash128 (hash.cpp:416-475) over `length` bytes of `message`
 * starting at `start`, with seeds hash1 = (seed1Hi:seed1Lo) and
 * hash2 = (seed2Hi:seed2Lo). Writes the results to Arch_spookyOut.
 */
export function Arch_SpookyHash128(
  message: Uint8Array, start: number, length: number,
  seed1Hi: number, seed1Lo: number, seed2Hi: number, seed2Lo: number,
): void {
  if (length < SC_BUF_SIZE) {
    R[H0] = seed1Lo; R[H0 + 1] = seed1Hi
    R[H1] = seed2Lo; R[H1 + 1] = seed2Hi
    short(message, start, length)
  } else {
    // h0=h3=h6=h9 = *hash1; h1=h4=h7=h10 = *hash2; h2=h5=h8=h11 = sc_const
    for (const h of [H0, H3, H6, H9]) { R[h] = seed1Lo; R[h + 1] = seed1Hi }
    for (const h of [H1, H4, H7, H10]) { R[h] = seed2Lo; R[h + 1] = seed2Hi }
    for (const h of [H2, H5, H8, H11]) { R[h] = SC_CONST_LO; R[h + 1] = SC_CONST_HI }

    // handle all whole sc_blockSize blocks of bytes
    const endP = start + Math.floor(length / SC_BLOCK_SIZE) * SC_BLOCK_SIZE
    let p = start
    for (; p < endP; p += SC_BLOCK_SIZE) mix(message, p)

    // handle the last partial block of sc_blockSize bytes
    const remainder = length - (endP - start)
    BLOCK.fill(0)
    BLOCK.set(message.subarray(endP, endP + remainder))
    BLOCK[SC_BLOCK_SIZE - 1] = remainder

    // do some final mixing
    end(BLOCK, 0)
  }
  Arch_spookyOut[0] = R[H0]!
  Arch_spookyOut[1] = R[H0 + 1]!
  Arch_spookyOut[2] = R[H1]!
  Arch_spookyOut[3] = R[H1 + 1]!
}

const BIG_VIEW = new DataView(new ArrayBuffer(8))

function checkLength(data: Uint8Array, len: number): void {
  if (!Number.isInteger(len) || len < 0 || len > data.length) {
    throw new RangeError(`ArchHash: length ${len} is outside [0, ${data.length}]`)
  }
}

/**
 * ArchHash (hash.h:19-28, hash.cpp:640-648): SpookyHash::Hash32, hashing
 * `len` bytes of `data` with a uint32 seed. Returns an unsigned 32-bit number.
 */
export function ArchHash(data: Uint8Array, len: number = data.length, seed = 0): number {
  checkLength(data, len)
  // hash.cpp:80-88: hash1 = hash2 = seed, widened to uint64.
  const s = seed >>> 0
  Arch_SpookyHash128(data, 0, len, 0, s, 0, s)
  return Arch_spookyOut[0]!
}

/**
 * ArchHash64 (hash.h:30-38, hash.cpp:650-658): SpookyHash::Hash64, hashing
 * `len` bytes of `data` with a uint64 seed. Returns an unsigned 64-bit bigint.
 */
export function ArchHash64(
  data: Uint8Array, len: number = data.length, seed: bigint = 0n,
): bigint {
  checkLength(data, len)
  // hash.cpp:67-75: hash1 = seed; Hash128(..., &hash1, &seed).
  BIG_VIEW.setBigUint64(0, BigInt.asUintN(64, seed), true)
  const lo = BIG_VIEW.getUint32(0, true)
  const hi = BIG_VIEW.getUint32(4, true)
  Arch_SpookyHash128(data, 0, len, hi, lo, hi, lo)
  BIG_VIEW.setUint32(0, Arch_spookyOut[0]!, true)
  BIG_VIEW.setUint32(4, Arch_spookyOut[1]!, true)
  return BIG_VIEW.getBigUint64(0, true)
}
