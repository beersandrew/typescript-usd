// Ported from OpenUSD 26.11.1: pxr/usd/usdRi/typeUtils.cpp,
//  pxr/usd/usdRi/typeUtils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/usd/usdRi/typeUtils.{h,cpp}: private type helpers used
// by UsdRiStatementsAPI::CreateRiAttribute. Not exported from the package
// barrel (typeUtils is a PRIVATE_CLASS in usdRi/CMakeLists.txt:21-22).
import { ValueTypeNames, findValueTypeName } from 'typescript-usd/sdf'

// typeUtils.cpp:17-22.
export function UsdRi_GetRiType(_usdType: string): string {
  // TODO
  return ''
}

// typeUtils.cpp:24-43. Returns the scene-description type name.
export function UsdRi_GetUsdType(riType: string): string {
  const map: readonly (readonly [string, string])[] = [
    ['color', ValueTypeNames.Color3f.name],
    ['vector', ValueTypeNames.Vector3d.name],
    ['normal', ValueTypeNames.Normal3d.name],
    ['point', ValueTypeNames.Point3d.name],
    ['matrix', ValueTypeNames.Matrix4d.name],
  ]
  for (const [riName, usdType] of map) {
    if (riType.includes(riName)) return usdType
  }
  // XXX -- Really?
  // SdfSchema::FindOrCreateType: a registered type by name, else a new type
  // name token carrying riType itself.
  return findValueTypeName(riType)?.name ?? riType
}
