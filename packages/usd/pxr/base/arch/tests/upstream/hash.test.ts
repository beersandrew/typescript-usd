// OpenUSD v26.11.1 has no ArchHash testenv; this replays
// fixtures/hash/expected.json, captured by linking the
// real 26.11.1 libusd_arch (see fixtures/hash/README.md).
import { describe, expect, it } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import { ArchHash, ArchHash64 } from 'typescript-usd/arch'

interface Case { len: number; h32: number; h32s: number; h64: string; h64s: string }
interface Fixture {
  seed32: number
  seed64: string
  buffer: string
  offsets: { offset: number; cases: Case[] }[]
  strings: (Omit<Case, 'len'> & { utf8: string })[]
}

const fixture = readOracleFixture(
  new URL('./fixtures/hash/expected.json', import.meta.url)) as Fixture
const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16))
const seed64 = BigInt(`0x${fixture.seed64}`)
const hex64 = (v: bigint) => v.toString(16).padStart(16, '0')

describe('ArchHash / ArchHash64 (native 26.11.1 capture)', () => {
  const buffer = hex(fixture.buffer)
  for (const { offset, cases } of fixture.offsets) {
    it(`hashes lengths 0..300 at byte offset ${offset}`, () => {
      for (const c of cases) {
        const data = buffer.subarray(offset, offset + c.len)
        expect([
          ArchHash(data), ArchHash(data, data.length, fixture.seed32),
          hex64(ArchHash64(data)), hex64(ArchHash64(data, data.length, seed64)),
        ], `len ${c.len}`).toEqual([c.h32, c.h32s, c.h64, c.h64s])
      }
    })
  }

  it('hashes UTF-8 strings', () => {
    for (const c of fixture.strings) {
      const data = hex(c.utf8)
      expect([
        ArchHash(data), ArchHash(data, data.length, fixture.seed32),
        hex64(ArchHash64(data)), hex64(ArchHash64(data, data.length, seed64)),
      ], c.utf8).toEqual([c.h32, c.h32s, c.h64, c.h64s])
    }
  })

  it('hashes a prefix when given a length', () => {
    const data = buffer.subarray(0, 200)
    const c = fixture.offsets[0]!.cases[17]!
    expect(ArchHash(data, 17)).toBe(c.h32)
    expect(hex64(ArchHash64(data, 17))).toBe(c.h64)
    expect(() => ArchHash(data, 201)).toThrow(RangeError)
  })
})
