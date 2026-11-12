// Ported from OpenUSD 26.11.1: pxr/usd/ar/assetInfo.cpp,
//  pxr/usd/ar/assetInfo.h, pxr/usd/ar/testenv/testArAssetInfo.py
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/ar/testenv/testArAssetInfo.py
// (registration testArAssetInfo). Python set membership is expressed through
// ArAssetInfo's operator== and TfHash (assetInfo.h:45-74, assetInfo.cpp).
import { describe, expect, it } from 'vitest'
import { AssetInfo as ArAssetInfo } from '../../src/index.ts'

describe('testArAssetInfo', () => {
  // testArAssetInfo.py:13-30.
  it('test_Basic', () => {
    const assetInfo = new ArAssetInfo()
    expect(assetInfo.version).toBe('')
    expect(assetInfo.assetName).toBe('')
    expect(assetInfo.resolverInfo).toBeUndefined()

    assetInfo.version = '1'
    expect(assetInfo.version).toBe('1')
    assetInfo.assetName = 'Buzz'
    expect(assetInfo.assetName).toBe('Buzz')
    assetInfo.resolverInfo = 1
    expect(assetInfo.resolverInfo).toBe(1)
    assetInfo.resolverInfo = 'Buzz'
    expect(assetInfo.resolverInfo).toBe('Buzz')
  })

  // testArAssetInfo.py:32-40.
  it('test_Equality', () => {
    const assetInfo1 = new ArAssetInfo()
    const assetInfo2 = new ArAssetInfo()
    expect(assetInfo1.equals(assetInfo2)).toBe(true)
    expect(assetInfo1.notEquals(assetInfo2)).toBe(false)
    assetInfo2.version = '1'
    expect(assetInfo1.equals(assetInfo2)).toBe(false)
    expect(assetInfo1.notEquals(assetInfo2)).toBe(true)
  })

  // testArAssetInfo.py:42-53: {1, 2, 3, 4} == {1, 3} as a hashed set.
  it('test_Hash', () => {
    const assetInfo1 = new ArAssetInfo()
    const assetInfo2 = new ArAssetInfo()
    const assetInfo3 = new ArAssetInfo()
    assetInfo3.assetName = 'Buzz'
    const assetInfo4 = new ArAssetInfo()
    assetInfo4.assetName = 'Buzz'
    const unique = (infos: ArAssetInfo[]) => {
      const out: ArAssetInfo[] = []
      for (const info of infos) {
        if (!out.some(o => o.hash() === info.hash() && o.equals(info))) out.push(info)
      }
      return out
    }
    const lhs = unique([assetInfo1, assetInfo2, assetInfo3, assetInfo4])
    const rhs = unique([assetInfo1, assetInfo3])
    expect(lhs.length).toBe(rhs.length)
    expect(lhs.every(a => rhs.some(b => a.hash() === b.hash() && a.equals(b)))).toBe(true)
    expect(assetInfo1.hash()).toBe(assetInfo2.hash())
    expect(assetInfo3.hash()).toBe(assetInfo4.hash())
  })
})
