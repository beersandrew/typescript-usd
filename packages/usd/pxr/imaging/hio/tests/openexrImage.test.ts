// Native OpenEXR RgbaInputFile readbacks; no decoder-generated golden values.
// The files are read with nanoexr_read_exr (openexrNanoexr.ts) for four
// channels, which fills an absent alpha with 1 as RgbaInputFile does.
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {nanoexr_read_exr} from '../src/openexrNanoexr.ts'
import {ExrError} from '../src/openexrCoreCoding.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'
const root=new URL('./fixtures/openexr/',import.meta.url)
const oracle=readOracleFixture(new URL('expected.json',root))
for(const row of oracle.cases)it(`decodes native ZIP HALF ${row.name} exactly`,async()=>{
 const image=(await nanoexr_read_exr(readFileSync(new URL(row.name+'.exr',root)),null,4,0,0))!
 expect(image.width).toBe(row.width);expect(image.height).toBe(row.height);expect(image.channelCount).toBe(4)
 expect(Array.from(new Uint16Array(image.data.buffer))).toEqual(row.halfBits)
})
it('rejects truncated headers, tables and compressed chunks',async()=>{
 const bytes=readFileSync(new URL('rgb.exr',root))
 for(const n of [0,4,8,16,bytes.length-1])await expect(nanoexr_read_exr(bytes.subarray(0,n),null,4,0,0)).rejects.toBeInstanceOf(ExrError)
})
