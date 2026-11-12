// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfFileFormat.py,
//  pxr/usd/sdf/testenv/testSdfFileFormatCapabilities.py,
//  pxr/usd/sdf/testenv/testSdfLayer.py,
//  pxr/usd/sdf/testenv/testSdfLayerMuting.py,
//  pxr/usd/sdf/testenv/testSdfTargetFileFormat.py,
//  pxr/usd/sdf/testenv/testSdfUsdcInvalidPrimChildren.cpp,
//  and 1 more cited below
// Copyright 2017, 2018, 2023, 2025, 2026 Pixar. Tomorrow Open Source
//  Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public placement gate derived from pxr/usd/sdf/CMakeLists.txt PUBLIC_CLASSES
// and PRIVATE_CLASSES at OpenUSD v26.08. Registered testenv coverage governing
// this tranche: testSdfFileFormat, testSdfFileFormatCapabilities, testSdfLayer,
// testSdfLayerMuting, testSdfTargetFileFormat, testSdfUsdcInvalidPrimChildren,
// testSdfUsdcVersioning, and testSdfZipFile.

import { describe, expect, it } from 'vitest'
import * as Sdf from '../src/index.ts'

describe('Sdf v26.08 public placement', () => {
  it.each([
    'Layer',
    'FileFormat',
    'UsdaFileFormat',
    'UsdcFileFormat',
    'UsdFileFormat',
    'UsdzFileFormat',
  ])('exports upstream public Sdf class %s', (name) => {
    expect(Sdf).toHaveProperty(name)
  })

  it.each([
    'ArGetResolver',
    'ArSetResolver',
    'ArResolver',
    'ArResolverContext',
    'readAsset',
    'registerCrateFormat',
    'registerFileFormat',
    'resolveAssetPath',
  ])('does not cross-export or expose private mechanism %s', (name) => {
    expect(Sdf).not.toHaveProperty(name)
  })
})
