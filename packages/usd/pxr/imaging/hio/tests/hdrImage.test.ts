// Expected pixels captured from OpenUSD 26.11.1's HioStb decoder; see fixtures.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { _decodeRadianceHdr } from '../src/hdrImage.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'
const root = new URL('./fixtures/hdr/', import.meta.url)
const fixture = readOracleFixture(new URL('expected.json', root)) as {cases: Array<{file:string,width:number,height:number,pixels:number[]}>}
describe('Hio native HDR float decoding', () => {
  for (const row of fixture.cases) it(`matches native pixels for ${row.file}`, () => {
    const image = _decodeRadianceHdr(readFileSync(new URL(row.file, root)))
    expect(image.width).toBe(row.width); expect(image.height).toBe(row.height)
    expect(image.format).toBe('float32vec4'); expect(image.isColorSpaceSRGB).toBe(false)
    expect(Array.from(image.data)).toEqual(Array.from(new Float32Array(row.pixels)))
  })
  it('rejects unsupported RGBE orientation and truncated data explicitly', () => {
    const bytes=readFileSync(new URL('flat.hdr',root))
    const flipped=new Uint8Array(Buffer.from(bytes.toString('latin1').replace('-Y 2','+Y 2'),'latin1'))
    expect(()=>_decodeRadianceHdr(flipped)).toThrow('unsupported data layout')
    expect(()=>_decodeRadianceHdr(bytes.subarray(0,bytes.length-1))).toThrow('truncated pixel data')
  })
})
