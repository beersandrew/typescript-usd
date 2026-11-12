// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native Hio_StbImage colour-space decisions from 26.11.1
// (fixtures/colorSpace; stbImage.cpp:303-331), read through the
// faithful HioImage path: Auto, explicit SRGB and explicit Raw, plus the
// source channel count that drives the Auto rule.
import {fileURLToPath} from 'node:url'
import {expect,it} from 'vitest'
import {HioImage,HioImageSourceColorSpace} from '../src/hioImage.ts'
import {HioGetComponentCount} from '../src/types.ts'
import {readOracleFixture} from '../../../testing/oracleFixture.ts'
const fixture=new URL('./fixtures/colorSpace/',import.meta.url)
const native=readOracleFixture(new URL('expected.json',fixture))
const open=async(file:string,space:HioImageSourceColorSpace)=>{
 const image=await HioImage.openForReadingAsync(fileURLToPath(new URL(file,fixture)),0,0,space)
 expect(image).not.toBeNull()
 return image!
}
for(const row of native.cases)it(`matches Hio auto/explicit color spaces for ${row.file}`,async()=>{
 const auto=await open(row.file,HioImageSourceColorSpace.Auto)
 expect(auto.isColorSpaceSRGB()).toBe(row.auto)
 expect(HioGetComponentCount(auto.GetFormat())).toBe(row.channels)
 expect((await open(row.file,HioImageSourceColorSpace.SRGB)).isColorSpaceSRGB()).toBe(row.sRGB)
 expect((await open(row.file,HioImageSourceColorSpace.Raw)).isColorSpaceSRGB()).toBe(row.raw)
})
