// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/utils.cpp,
//  pxr/usd/usdMtlx/utils.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdMtlx/utils.cpp — MaterialX type/value → Sdf mapping.

import type { Input, Output } from '@mtlx/core'
import { TypedValue, VectorBase } from '@mtlx/core'

// UsdMtlxGetUsdType: MaterialX type name → Sdf value type name. Shader
// semantic types (surfaceshader etc.) become token-typed terminal attrs.
const MTLX_TO_SDF: Record<string, string> = {
  boolean: 'bool',
  integer: 'int',
  float: 'float',
  color3: 'color3f',
  color4: 'color4f',
  vector2: 'float2',
  vector3: 'float3',
  vector4: 'float4',
  matrix33: 'matrix3d',
  matrix44: 'matrix4d',
  string: 'string',
  filename: 'asset',
  geomname: 'string',
  surfaceshader: 'token',
  displacementshader: 'token',
  volumeshader: 'token',
  lightshader: 'token',
  material: 'token',
  integerarray: 'int[]',
  floatarray: 'float[]',
  color3array: 'color3f[]',
  color4array: 'color4f[]',
  vector2array: 'float2[]',
  vector3array: 'float3[]',
  vector4array: 'float4[]',
  stringarray: 'string[]',
  geomnamearray: 'string[]',
}

export function usdTypeName(mtlxType: string): string {
  return MTLX_TO_SDF[mtlxType] ?? 'token'
}

// The number of components for fixed-size vector/color/matrix types.
const VECTOR_SIZE: Record<string, number> = {
  color3: 3, color4: 4, vector2: 2, vector3: 3, vector4: 4,
  matrix33: 9, matrix44: 16,
}

// UsdMtlxGetUsdValue: a port element's authored value → the JS value shape
// our layers store (numbers, strings, bools, number[] for vectors/colors).
// Returns undefined when the port has no authored value.
export function usdValue(port: Input | Output): unknown {
  // utils.cpp:98-100: an empty value string is no value.
  if (port.getValueString() === '') return undefined
  const value = port.getValue()
  if (!(value instanceof TypedValue)) return undefined
  const data: unknown = value.getData()
  if (data instanceof VectorBase) {
    const n = VECTOR_SIZE[port.getType()] ?? 0
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(data.getItem(i))
    return out
  }
  // float/integer → number, boolean → boolean, string/filename → string
  return data
}

// Maps a MaterialX shader semantic type to the USD terminal/output name
// (reader.cpp: surfaceshader nodes expose outputs:surface, etc.).
export function shaderContext(mtlxShaderType: string): string | null {
  switch (mtlxShaderType) {
    case 'surfaceshader': return 'surface'
    case 'displacementshader': return 'displacement'
    case 'volumeshader': return 'volume'
    case 'lightshader': return 'light'
    default: return null
  }
}
