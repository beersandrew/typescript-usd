// Ported from OpenUSD 26.11.1:
//  pxr/exec/esfUsd/testenv/testEsfUsdConnectionTables.cpp,
//  pxr/exec/esfUsd/testenv/testEsfUsdConnectionTablesStochastic.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The C++ standard library random number facilities that
// testEsfUsdConnectionTables.cpp and testEsfUsdConnectionTablesStochastic.cpp
// use, reproduced exactly so that the ported tests make the same random
// decisions as the native tests built against libc++ (Apple clang, the
// OpenUSD 26.11.1 reference build):
//  * std::mt19937 ([rand.eng.mers], [rand.predef]: the 32-bit Mersenne
//    Twister with the standard parameters and seeding);
//  * std::bernoulli_distribution(0.5), which libc++ evaluates as
//    `uniform_real_distribution<double>()(g) < p`, through
//    generate_canonical<double, 53> (two 32-bit draws, low word first);
//  * std::uniform_int_distribution<size_t>, which libc++ evaluates with
//    __independent_bits_engine<mt19937, uint64_t> and rejection sampling.

/** std::mt19937 */
export class StdMt19937 {
  private readonly _mt = new Uint32Array(624)
  private _index = 624

  static readonly min = 0
  static readonly max = 0xFFFFFFFF

  /** explicit mersenne_twister_engine(result_type value = 5489u). */
  constructor(seed = 5489) {
    this._mt[0] = seed >>> 0
    for (let i = 1; i < 624; i++) {
      const prev = this._mt[i - 1]! ^ (this._mt[i - 1]! >>> 30)
      // 1812433253 * prev + i, modulo 2^32.
      this._mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
    this._index = 624
  }

  private _twist(): void {
    const mt = this._mt
    for (let i = 0; i < 624; i++) {
      const y = (mt[i]! & 0x80000000) | (mt[(i + 1) % 624]! & 0x7FFFFFFF)
      let next = mt[(i + 397) % 624]! ^ (y >>> 1)
      if (y & 1) {
        next ^= 0x9908B0DF
      }
      mt[i] = next >>> 0
    }
    this._index = 0
  }

  /** operator(): the next 32-bit output. */
  Next(): number {
    if (this._index >= 624) {
      this._twist()
    }
    let y = this._mt[this._index++]!
    y ^= y >>> 11
    y ^= (y << 7) & 0x9D2C5680
    y ^= (y << 15) & 0xEFC60000
    y ^= y >>> 18
    return y >>> 0
  }
}

/** libc++ generate_canonical<double, 53>(g) for std::mt19937. */
function _GenerateCanonical(g: StdMt19937): number {
  // __k = 53 / 32 + (53 % 32 != 0) = 2 draws; __rp = 2^32.
  const rp = 4294967296
  let base = rp
  let s = g.Next() - StdMt19937.min
  s += (g.Next() - StdMt19937.min) * base
  base *= rp
  return s / base
}

/** std::bernoulli_distribution (libc++). */
export class StdBernoulliDistribution {
  constructor(private readonly _p = 0.5) {}

  Sample(g: StdMt19937): boolean {
    // uniform_real_distribution<double>(0, 1)(g) = (1 - 0) * canonical + 0.
    return _GenerateCanonical(g) < this._p
  }
}

const _U64 = (1n << 64n) - 1n

/** libc++ __independent_bits_engine<mt19937, uint64_t>. */
class _IndependentBitsEngine {
  // _Rp = mt19937::max() - min() + 1 = 2^32 as the 64-bit working type;
  // __m = log2(_Rp) = 32; _WDt = 64; _EDt = 32.
  private static readonly _Rp = 1n << 32n
  private static readonly _m = 32
  private static readonly _WDt = 64
  private static readonly _EDt = 32

  private readonly _n: number
  private readonly _w0: number
  private readonly _n0: number
  private readonly _y0: bigint
  private readonly _y1: bigint
  private readonly _mask0: bigint
  private readonly _mask1: bigint

  constructor(private readonly _e: StdMt19937, private readonly _w: number) {
    const Rp = _IndependentBitsEngine._Rp
    const m = _IndependentBitsEngine._m
    const WDt = _IndependentBitsEngine._WDt
    const EDt = _IndependentBitsEngine._EDt
    let n = Math.floor(_w / m) + (_w % m !== 0 ? 1 : 0)
    let w0 = Math.floor(_w / n)
    let y0 = w0 < WDt ? (Rp >> BigInt(w0)) << BigInt(w0) : 0n
    if (Rp - y0 > y0 / BigInt(n)) {
      ++n
      w0 = Math.floor(_w / n)
      y0 = w0 < WDt ? (Rp >> BigInt(w0)) << BigInt(w0) : 0n
    }
    this._n = n
    this._w0 = w0
    this._y0 = y0
    this._n0 = n - (_w % n)
    this._y1 = w0 < WDt - 1 ? (Rp >> BigInt(w0 + 1)) << BigInt(w0 + 1) : 0n
    const engineOnes = (1n << BigInt(EDt)) - 1n
    this._mask0 = w0 > 0 ? engineOnes >> BigInt(EDt - w0) : 0n
    this._mask1 = w0 < EDt - 1 ? engineOnes >> BigInt(EDt - (w0 + 1)) : engineOnes
  }

  Next(): bigint {
    const WDt = _IndependentBitsEngine._WDt
    let s = 0n
    for (let k = 0; k < this._n0; ++k) {
      let u: bigint
      do {
        u = BigInt(this._e.Next() - StdMt19937.min)
      } while (u >= this._y0)
      s = this._w0 < WDt ? (s << BigInt(this._w0)) & _U64 : 0n
      s = (s + (u & this._mask0)) & _U64
    }
    for (let k = this._n0; k < this._n; ++k) {
      let u: bigint
      do {
        u = BigInt(this._e.Next() - StdMt19937.min)
      } while (u >= this._y1)
      s = this._w0 < WDt - 1 ? (s << BigInt(this._w0 + 1)) & _U64 : 0n
      s = (s + (u & this._mask1)) & _U64
    }
    return s
  }
}

// std::__countl_zero for a 64-bit value.
function _CountlZero64(x: bigint): number {
  let n = 0
  for (let bit = 63; bit >= 0 && ((x >> BigInt(bit)) & 1n) === 0n; --bit) {
    n++
  }
  return n
}

/**
 * std::uniform_int_distribution<size_t>(a, b) (libc++). Bounds are
 * size_t values: `connections.size() - 1` for an empty vector is
 * SIZE_MAX, which callers pass as `-1` (wrapped modulo 2^64).
 */
export class StdUniformIntDistribution {
  private readonly _a: bigint
  private readonly _b: bigint

  constructor(a: number, b: number) {
    this._a = BigInt.asUintN(64, BigInt(a))
    this._b = BigInt.asUintN(64, BigInt(b))
  }

  /** The sample as a size_t (a bigint, since SIZE_MAX-ranged results do
   *  not fit a double). */
  sampleBig(g: StdMt19937): bigint {
    const dt = 64
    const rp = BigInt.asUintN(64, this._b - this._a + 1n)
    if (rp === 1n) {
      return this._a
    }
    if (rp === 0n) {
      return new _IndependentBitsEngine(g, dt).Next()
    }
    let w = dt - _CountlZero64(rp) - 1
    if ((rp & (_U64 >> BigInt(dt - w))) !== 0n) {
      ++w
    }
    const e = new _IndependentBitsEngine(g, w)
    let u: bigint
    do {
      u = e.Next()
    } while (u >= rp)
    return BigInt.asUintN(64, u + this._a)
  }

  /** The sample as a number; the range must fit a double exactly. */
  Sample(g: StdMt19937): number {
    return Number(this.sampleBig(g))
  }
}
