// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArAdvancedAPI.py,
//  pxr/usd/ar/testenv/testArAssetInfo.py,
//  pxr/usd/ar/testenv/testArDefaultResolver.cpp,
//  pxr/usd/ar/testenv/testArDefaultResolver.py,
//  pxr/usd/ar/testenv/testArOpenAsset.py,
//  pxr/usd/ar/testenv/testArPackageResolver.py, and 5 more cited below
// Copyright 2016, 2018, 2020, 2021, 2022, 2024, 2025 Pixar. Tomorrow Open
//  Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public placement gate derived from pxr/usd/ar/CMakeLists.txt PUBLIC_CLASSES
// and public headers at OpenUSD v26.08. Registered testenv coverage governing
// this tranche: testArAdvancedAPI, testArAssetInfo, testArDefaultResolver,
// testArNotice_CPP, testArOpenAsset, testArPackageResolver,
// testArResolverContext(_CPP), testArTimestamp, and testArURIResolver(_CPP).

import { describe, expect, it } from 'vitest'
import * as Ar from '../../src/index.ts'

describe('Ar v26.08 public surface', () => {
  it.each([
    'Asset',
    'AssetInfo',
    'DefaultResolver',
    'DefaultResolverContext',
    'CreateResolver',
    'DefinePackageResolver',
    'DefineResolver',
    'GetAvailableResolvers',
    'GetRegisteredURISchemes',
    'GetResolver',
    'GetUnderlyingResolver',
    'Notice',
    'Resolver',
    'ResolverContext',
    'ResolverContextBinder',
    'ResolverScopedCache',
    'ResolvedPath',
    'SetPreferredResolver',
    'Timestamp',
    'WritableAsset',
  ])('exports upstream public class/function %s', (name) => {
    expect(Ar).toHaveProperty(name)
  })

  it.each([
    'ArInMemoryResolver',
    'ArSetResolver',
    'dirname',
    'isAbsolute',
    'joinPackagePath',
    'normalizePath',
    'normalizeRelative',
    'openAssetBytes',
    'resolveAssetPath',
    'resolvePath',
    'splitPackagePath',
  ])('does not export non-upstream public helper %s', (name) => {
    expect(Ar).not.toHaveProperty(name)
  })
})
