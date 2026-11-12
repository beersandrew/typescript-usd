// Package-placement gate derived from the public headers registered by
// pxr/usd/{ar,sdf,pcp,usd,usdUtils}/CMakeLists.txt at OpenUSD v26.05.

import { describe, expect, it } from 'vitest'
import * as Usd from '../../src/index.ts'

describe('Usd v26.05 package placement', () => {
  it.each([
    'ArAsset',
    'ArDefaultResolver',
    'ArGetResolver',
    'ArInMemoryAsset',
    'ArInMemoryResolver',
    'ArResolvedPath',
    'ArSetResolver',
    'ArResolver',
    'ArResolverContext',
    'Layer',
    'SdfAnimationBlock',
    'SdfAssetPath',
    'SdfLayerStateDelegateBase',
    'SdfSimpleLayerStateDelegate',
    'SdfValueBlock',
    'readAsset',
    'registerFileFormat',
    'resolveAssetPath',
  ])('does not cross-export %s', (name) => {
    expect(Usd).not.toHaveProperty(name)
  })
})
