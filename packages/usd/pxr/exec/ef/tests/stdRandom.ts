// The <random> facilities the ef upstream tests use, as the C++ standard
// library of the pinned native build (macOS, libc++) implements them, so that
// the ported tests make the same random choices as the native tests:
// std::mt19937, std::uniform_int_distribution<size_t>,
// std::bernoulli_distribution and std::shuffle.

/** std::mt19937: the 32-bit Mersenne Twister with the standard parameters. */
export class Std_mt19937 {
  private readonly _mt = new Uint32Array(624)
  private _index = 624

  static readonly min = 0
  static readonly max = 0xffffffff

  constructor(seed = 5489) {
    this._mt[0] = seed >>> 0
    for (let i = 1; i < 624; ++i) {
      const prev = this._mt[i - 1]!
      this._mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0
    }
  }

  /** operator(): the next 32-bit value. */
  Next(): number {
    if (this._index >= 624) {
      this._twist()
    }
    let y = this._mt[this._index++]!
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** discard(n): advances the engine by n values. */
  discard(n: number): void {
    for (let i = 0; i < n; ++i) {
      this.Next()
    }
  }

  private _twist(): void {
    const mt = this._mt
    for (let i = 0; i < 624; ++i) {
      const y = (mt[i]! & 0x80000000) | (mt[(i + 1) % 624]! & 0x7fffffff)
      mt[i] = (mt[(i + 397) % 624]! ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0
    }
    this._index = 0
  }
}

/**
 * std::uniform_int_distribution<size_t>(a, b)(g) for ranges of at most 2**32
 * values: libc++ draws ceil(log2(b - a + 1)) low bits of one engine value per
 * try and rejects values outside the range.
 */
export function Std_UniformInt(g: Std_mt19937, a: number, b: number): number {
  const range = b - a + 1
  if (range === 1) {
    return a
  }
  if (range > 2 ** 32) {
    throw new Error('Std_UniformInt: ranges above 2**32 values are not implemented')
  }
  let w = 0
  while (2 ** w < range) {
    ++w
  }
  const mask = w === 32 ? 0xffffffff : (2 ** w) - 1
  let u: number
  do {
    u = w === 32 ? g.Next() : (g.Next() & mask) >>> 0
  } while (u >= range)
  return a + u
}

/**
 * std::bernoulli_distribution(p)(g): libc++ compares
 * std::generate_canonical<double, 53>(g), built from two engine values,
 * with p.
 */
export function Std_Bernoulli(g: Std_mt19937, p = 0.5): boolean {
  const r = 2 ** 32
  let sp = g.Next()
  sp += g.Next() * r
  return sp / (r * r) < p
}

/** std::shuffle(first, last, g) as libc++ implements it. */
export function Std_Shuffle<T>(values: T[], g: Std_mt19937): void {
  let d = values.length
  if (d > 1) {
    let first = 0
    let last = values.length - 1
    for (--d; first < last; ++first, --d) {
      const i = Std_UniformInt(g, 0, d)
      if (i !== 0) {
        const tmp = values[first]!
        values[first] = values[first + i]!
        values[first + i] = tmp
      }
    }
  }
}
