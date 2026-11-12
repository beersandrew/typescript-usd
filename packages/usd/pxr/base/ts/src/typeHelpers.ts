// Ported from OpenUSD 26.11.1: pxr/base/ts/typeHelpers.cpp,
//  pxr/base/ts/typeHelpers.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Type as TfType } from 'typescript-usd/tf'

// OpenUSD v26.08 pxr/base/ts/typeHelpers.h runtime type-name mapping.
export function Ts_GetType(typeName = 'double'): TfType { return TfType.declare(typeName) }
export function Ts_GetTypeFromTypeName(typeName: string): TfType { return TfType.declare(typeName) }
export function Ts_GetTypeNameFromType(type: TfType): string { return type.getTypeName() }
export function Ts_IsSupportedValueType(type: TfType): boolean {
  return ['double', 'float', 'GfHalf', 'GfTimeCode'].includes(type.getTypeName())
}
export type Ts_StorageType = number
