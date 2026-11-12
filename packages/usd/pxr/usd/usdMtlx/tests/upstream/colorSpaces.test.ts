// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/reader.cpp
// Copyright 2018-2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native metadata: OpenUSD 26.11.1 usdMtlx/reader.cpp:455-497,557-559.
import {expect,it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {Stage} from 'typescript-usd/usd'
import '../../src/index.ts'
import {readOracleFixture} from '../../../../testing/oracleFixture.ts'
const fixture=new URL('../fixtures/colorSpaces/',import.meta.url)
const native=readOracleFixture(new URL('expected.json',fixture))
it('preserves native effective colorspace metadata without promoting data textures or document defaults',async()=>{
 const stage=(await Stage.open(fileURLToPath(new URL('material.mtlx',fixture))))!
 try{
  const actual:Record<string,string>={}
  for(const path of stage.traverse())for(const name of stage.getPrim(path)!.getPropertyNames()){
   const space=stage.getPrim(path)!.getAttr(name)?.getMetadata('colorSpace')
   if(space)actual[`${path}.${name}`]=String(space)
  }
  expect(actual).toEqual(native.colorSpaces)
 }finally{stage.dispose()}
})
