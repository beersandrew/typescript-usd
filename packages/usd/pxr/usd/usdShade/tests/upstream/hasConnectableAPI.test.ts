// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeHasConnectableAPI.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeHasConnectableAPI.cpp
// (OpenUSD 26.11.1). The C++ test checks both the templated
// HasConnectableAPI<T>() and the TfType overload; TypeScript has no template
// form, so both reduce to ConnectableAPI.hasConnectableAPI(TfType), with the
// TfType found by its registered C++ type name (TfType::Find<T>()).
import { expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import 'typescript-usd/usdGeom'
import { ConnectableAPI } from '../../src/index.ts'

// testUsdShadeHasConnectableAPI.cpp:17-34 (TestHasConnectableAPI).
it('TestHasConnectableAPI', () => {
  // :20-28 schema types which have a connectableAPI behavior.
  for (const name of ['UsdShadeShader', 'UsdShadeMaterial', 'UsdShadeNodeGraph']) {
    const type = TfType.findByName(name)
    expect(type.isUnknown()).toBe(false)
    expect(ConnectableAPI.hasConnectableAPI(type)).toBe(true)
  }
  // :30-33 schema type examples which should NOT have a connectableAPI behavior.
  const usdGeomSphereType = TfType.findByName('UsdGeomSphere')
  expect(usdGeomSphereType.isUnknown()).toBe(false)
  expect(ConnectableAPI.hasConnectableAPI(usdGeomSphereType)).toBe(false)
})
