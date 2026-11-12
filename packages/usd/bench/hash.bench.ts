// TfHash: the faithful port (Tf_HashState over SpookyHash V2, 32-bit halves)
// against the byte-wise FNV-1a-over-BigInt stand-in it replaced, for short and
// long strings, numbers and arrays. Run with `pnpm bench`.
import { bench, describe } from 'vitest'
import { Hash as TfHash, HashCombine } from 'typescript-usd/tf'

// The replaced stand-in, kept only as the benchmark baseline.
const MASK64 = 0xffff_ffff_ffff_ffffn
const OFFSET64 = 0xcbf2_9ce4_8422_2325n
const PRIME64 = 0x0000_0100_0000_01b3n
const encoder = new TextEncoder()
function fnvBytes(state: bigint, bytes: Uint8Array): bigint {
  let result = state
  for (const byte of bytes) {
    result ^= BigInt(byte)
    result = (result * PRIME64) & MASK64
  }
  return result
}
function fnvValue(state: bigint, value: unknown): bigint {
  if (typeof value === 'string') return fnvBytes(state, encoder.encode(value))
  if (typeof value === 'number') {
    const bytes = new Uint8Array(8)
    new DataView(bytes.buffer).setFloat64(0, value === 0 ? 0 : value, true)
    return fnvBytes(state, bytes)
  }
  if (Array.isArray(value)) {
    let result = state
    for (const item of value) result = fnvValue(result, item)
    return result
  }
  return state
}
const oldTfHash = (value: unknown) => fnvValue(OFFSET64, value)

const shortString = '/World/Geom/Mesh_0001'
const longString = 'primvars:displayColor:'.repeat(50)
const doubles = Array.from({ length: 64 }, (_, i) => i * 0.25)

describe('TfHash short string (21 bytes)', () => {
  bench('old FNV-1a BigInt', () => { oldTfHash(shortString) })
  bench('new SpookyHash', () => { TfHash(shortString) })
})

describe('TfHash long string (1100 bytes)', () => {
  bench('old FNV-1a BigInt', () => { oldTfHash(longString) })
  bench('new SpookyHash', () => { TfHash(longString) })
})

describe('TfHash double', () => {
  bench('old FNV-1a BigInt', () => { oldTfHash(1.5) })
  bench('new SpookyHash', () => { TfHash(1.5) })
})

describe('TfHash::Combine of 64 doubles', () => {
  bench('old FNV-1a BigInt', () => { oldTfHash(doubles) })
  bench('new SpookyHash', () => { HashCombine(...doubles) })
})
