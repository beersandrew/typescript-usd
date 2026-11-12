// Ported from OpenUSD 26.11.1: pxr/usd/sdf/valueTypeName.cpp,
//  pxr/usd/sdf/valueTypeName.h, pxr/usd/sdf/schema.cpp, pxr/usd/sdf/types.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfValueTypeName / Sdf.ValueTypeNames — the normative registry of every
// foundational scene-description value type name, its underlying shape, and
// its semantic-alias roles (point3f/color3f/etc. are DISTINCT named types
// that share an underlying GfVecN shape and carry a role token).
//
// Faithful port of pxr/usd/sdf/valueTypeName.{h,cpp} (the SdfValueTypeName
// shape) + the `_AddStandardTypesToRegistry` table in schema.cpp (the actual
// name/type/role/dimensions registrations) + the SDF_VALUE_ROLE_NAME_TOKENS
// role vocabulary in types.h. Upstream's `_AddLegacyTypesToRegistry` (Vec2i,
// Point, Frame, Transform, PointIndex, ... — backward-compat aliases for old
// text/binary files, not members of `Sdf_ValueTypeNamesType`) is
// intentionally NOT ported here: `dir(Sdf.ValueTypeNames)` in Python does not
// see them either, so they are out of scope for the foundational-type
// registry (they're a separate schema-lookup concern).
//
// `type` is the underlying-shape identity key two value type names share iff
// they're the same GfType (e.g. "float3" and "point3f"/"vector3f"/
// "normal3f"/"color3f"/"texCoord3f" all key on "GfVec3f") — the TS stand-in
// for upstream's TfType identity, since there is no TfType here.

/** SDF_VALUE_ROLE_NAME_TOKENS (types.h) — the role vocabulary. '' means no role. */
export const SdfValueRoleNames = {
  Point: 'Point',
  Normal: 'Normal',
  Vector: 'Vector',
  Color: 'Color',
  Frame: 'Frame',
  Transform: 'Transform',
  PointIndex: 'PointIndex',
  EdgeIndex: 'EdgeIndex',
  FaceIndex: 'FaceIndex',
  Group: 'Group',
  TextureCoordinate: 'TextureCoordinate',
} as const

export interface SdfValueTypeName {
  /** The type name as it appears in scene description, e.g. "point3f". */
  readonly name: string
  /** Underlying-shape identity key shared by all aliases of the same GfType. */
  readonly type: string
  /** The C++ type name upstream reports (GetCPPTypeName), for documentation. */
  readonly cppTypeName: string
  /** '' if the type has no semantic role, else one of SdfValueRoleNames. */
  readonly role: string
  /** [] for scalars, [N] for vecN, [N, N] for matrixNxN. */
  readonly dimensions: readonly number[]
  readonly isArray: boolean
  readonly isScalar: boolean
  /** The array type name for this scalar type, if one is registered. */
  readonly arrayType?: SdfValueTypeName
  /** The scalar type name for this array type, if this is an array type. */
  readonly scalarType?: SdfValueTypeName
}

interface TypeSpec {
  name: string
  type: string
  cppTypeName?: string
  role?: string
  dimensions?: readonly number[]
  /** Matches upstream's `.NoArrays()` — no `<name>[]` is registered. */
  noArrays?: boolean
}

function makeScalar(spec: TypeSpec): SdfValueTypeName {
  return {
    name: spec.name,
    type: spec.type,
    cppTypeName: spec.cppTypeName ?? spec.type,
    role: spec.role ?? '',
    dimensions: spec.dimensions ?? [],
    isArray: false,
    isScalar: true,
  }
}

function withArray(scalar: SdfValueTypeName): { scalar: SdfValueTypeName; array: SdfValueTypeName } {
  const array: SdfValueTypeName = {
    name: `${scalar.name}[]`,
    type: `${scalar.type}[]`,
    cppTypeName: `VtArray<${scalar.cppTypeName}>`,
    role: scalar.role,
    dimensions: scalar.dimensions,
    isArray: true,
    isScalar: false,
    scalarType: scalar,
  }
  return { scalar: { ...scalar, arrayType: array }, array }
}

// Builds a scalar type name and (unless noArrays) its array counterpart,
// registering both under the caller-supplied member names.
function type(spec: TypeSpec): { scalar: SdfValueTypeName; array?: SdfValueTypeName } {
  const scalar = makeScalar(spec)
  if (spec.noArrays) return { scalar }
  return withArray(scalar)
}

// --- _AddStandardTypesToRegistry (schema.cpp) ---

const bool_ = type({ name: 'bool', type: 'bool' })
const uchar = type({ name: 'uchar', type: 'uchar', cppTypeName: 'unsigned char' })
const int_ = type({ name: 'int', type: 'int' })
const uint = type({ name: 'uint', type: 'uint', cppTypeName: 'unsigned int' })
const int64 = type({ name: 'int64', type: 'int64', cppTypeName: 'int64_t' })
const uint64 = type({ name: 'uint64', type: 'uint64', cppTypeName: 'uint64_t' })
const half = type({ name: 'half', type: 'half', cppTypeName: 'GfHalf' })
const float_ = type({ name: 'float', type: 'float' })
const double_ = type({ name: 'double', type: 'double' })
const duration = type({ name: 'duration', type: 'GfDuration', cppTypeName: 'GfDuration' })
const timeCode = type({ name: 'timecode', type: 'timecode', cppTypeName: 'SdfTimeCode' })
const string_ = type({ name: 'string', type: 'string', cppTypeName: 'std::string' })
const token = type({ name: 'token', type: 'token', cppTypeName: 'TfToken' })
const asset = type({ name: 'asset', type: 'asset', cppTypeName: 'SdfAssetPath' })
const opaque = type({ name: 'opaque', type: 'opaque', cppTypeName: 'SdfOpaqueValue', noArrays: true })
const group = type({
  name: 'group', type: 'opaque', cppTypeName: 'SdfOpaqueValue', role: SdfValueRoleNames.Group, noArrays: true,
})
const pathExpression = type({ name: 'pathExpression', type: 'pathExpression', cppTypeName: 'SdfPathExpression' })

const double2 = type({ name: 'double2', type: 'GfVec2d', dimensions: [2] })
const double3 = type({ name: 'double3', type: 'GfVec3d', dimensions: [3] })
const double4 = type({ name: 'double4', type: 'GfVec4d', dimensions: [4] })
const float2 = type({ name: 'float2', type: 'GfVec2f', dimensions: [2] })
const float3 = type({ name: 'float3', type: 'GfVec3f', dimensions: [3] })
const float4 = type({ name: 'float4', type: 'GfVec4f', dimensions: [4] })
const half2 = type({ name: 'half2', type: 'GfVec2h', dimensions: [2] })
const half3 = type({ name: 'half3', type: 'GfVec3h', dimensions: [3] })
const half4 = type({ name: 'half4', type: 'GfVec4h', dimensions: [4] })
const int2 = type({ name: 'int2', type: 'GfVec2i', dimensions: [2] })
const int3 = type({ name: 'int3', type: 'GfVec3i', dimensions: [3] })
const int4 = type({ name: 'int4', type: 'GfVec4i', dimensions: [4] })

const point3h = type({ name: 'point3h', type: 'GfVec3h', role: SdfValueRoleNames.Point, dimensions: [3] })
const point3f = type({ name: 'point3f', type: 'GfVec3f', role: SdfValueRoleNames.Point, dimensions: [3] })
const point3d = type({ name: 'point3d', type: 'GfVec3d', role: SdfValueRoleNames.Point, dimensions: [3] })
const vector3h = type({ name: 'vector3h', type: 'GfVec3h', role: SdfValueRoleNames.Vector, dimensions: [3] })
const vector3f = type({ name: 'vector3f', type: 'GfVec3f', role: SdfValueRoleNames.Vector, dimensions: [3] })
const vector3d = type({ name: 'vector3d', type: 'GfVec3d', role: SdfValueRoleNames.Vector, dimensions: [3] })
const normal3h = type({ name: 'normal3h', type: 'GfVec3h', role: SdfValueRoleNames.Normal, dimensions: [3] })
const normal3f = type({ name: 'normal3f', type: 'GfVec3f', role: SdfValueRoleNames.Normal, dimensions: [3] })
const normal3d = type({ name: 'normal3d', type: 'GfVec3d', role: SdfValueRoleNames.Normal, dimensions: [3] })
const color3h = type({ name: 'color3h', type: 'GfVec3h', role: SdfValueRoleNames.Color, dimensions: [3] })
const color3f = type({ name: 'color3f', type: 'GfVec3f', role: SdfValueRoleNames.Color, dimensions: [3] })
const color3d = type({ name: 'color3d', type: 'GfVec3d', role: SdfValueRoleNames.Color, dimensions: [3] })
const color4h = type({ name: 'color4h', type: 'GfVec4h', role: SdfValueRoleNames.Color, dimensions: [4] })
const color4f = type({ name: 'color4f', type: 'GfVec4f', role: SdfValueRoleNames.Color, dimensions: [4] })
const color4d = type({ name: 'color4d', type: 'GfVec4d', role: SdfValueRoleNames.Color, dimensions: [4] })

const quath = type({ name: 'quath', type: 'GfQuath', dimensions: [4] })
const quatf = type({ name: 'quatf', type: 'GfQuatf', dimensions: [4] })
const quatd = type({ name: 'quatd', type: 'GfQuatd', dimensions: [4] })

const matrix2d = type({ name: 'matrix2d', type: 'GfMatrix2d', dimensions: [2, 2] })
const matrix3d = type({ name: 'matrix3d', type: 'GfMatrix3d', dimensions: [3, 3] })
const matrix4d = type({ name: 'matrix4d', type: 'GfMatrix4d', dimensions: [4, 4] })
const frame4d = type({
  name: 'frame4d', type: 'GfMatrix4d', role: SdfValueRoleNames.Frame, dimensions: [4, 4],
})

const texCoord2f = type({ name: 'texCoord2f', type: 'GfVec2f', role: SdfValueRoleNames.TextureCoordinate, dimensions: [2] })
const texCoord2d = type({ name: 'texCoord2d', type: 'GfVec2d', role: SdfValueRoleNames.TextureCoordinate, dimensions: [2] })
const texCoord2h = type({ name: 'texCoord2h', type: 'GfVec2h', role: SdfValueRoleNames.TextureCoordinate, dimensions: [2] })
const texCoord3f = type({ name: 'texCoord3f', type: 'GfVec3f', role: SdfValueRoleNames.TextureCoordinate, dimensions: [3] })
const texCoord3d = type({ name: 'texCoord3d', type: 'GfVec3d', role: SdfValueRoleNames.TextureCoordinate, dimensions: [3] })
const texCoord3h = type({ name: 'texCoord3h', type: 'GfVec3h', role: SdfValueRoleNames.TextureCoordinate, dimensions: [3] })

// --- Sdf_ValueTypeNamesType (types.h) — the public singleton ---

export const ValueTypeNames = {
  Bool: bool_.scalar,
  UChar: uchar.scalar, Int: int_.scalar, UInt: uint.scalar, Int64: int64.scalar, UInt64: uint64.scalar,
  Half: half.scalar, Float: float_.scalar, Double: double_.scalar, Duration: duration.scalar, TimeCode: timeCode.scalar,
  String: string_.scalar, Token: token.scalar, Asset: asset.scalar,
  Int2: int2.scalar, Int3: int3.scalar, Int4: int4.scalar,
  Half2: half2.scalar, Half3: half3.scalar, Half4: half4.scalar,
  Float2: float2.scalar, Float3: float3.scalar, Float4: float4.scalar,
  Double2: double2.scalar, Double3: double3.scalar, Double4: double4.scalar,
  Point3h: point3h.scalar, Point3f: point3f.scalar, Point3d: point3d.scalar,
  Vector3h: vector3h.scalar, Vector3f: vector3f.scalar, Vector3d: vector3d.scalar,
  Normal3h: normal3h.scalar, Normal3f: normal3f.scalar, Normal3d: normal3d.scalar,
  Color3h: color3h.scalar, Color3f: color3f.scalar, Color3d: color3d.scalar,
  Color4h: color4h.scalar, Color4f: color4f.scalar, Color4d: color4d.scalar,
  Quath: quath.scalar, Quatf: quatf.scalar, Quatd: quatd.scalar,
  Matrix2d: matrix2d.scalar, Matrix3d: matrix3d.scalar, Matrix4d: matrix4d.scalar,
  Frame4d: frame4d.scalar,
  TexCoord2h: texCoord2h.scalar, TexCoord2f: texCoord2f.scalar, TexCoord2d: texCoord2d.scalar,
  TexCoord3h: texCoord3h.scalar, TexCoord3f: texCoord3f.scalar, TexCoord3d: texCoord3d.scalar,
  Opaque: opaque.scalar,
  Group: group.scalar,
  PathExpression: pathExpression.scalar,

  BoolArray: bool_.array!,
  UCharArray: uchar.array!, IntArray: int_.array!, UIntArray: uint.array!,
  Int64Array: int64.array!, UInt64Array: uint64.array!,
  HalfArray: half.array!, FloatArray: float_.array!, DoubleArray: double_.array!, DurationArray: duration.array!, TimeCodeArray: timeCode.array!,
  StringArray: string_.array!, TokenArray: token.array!, AssetArray: asset.array!,
  Int2Array: int2.array!, Int3Array: int3.array!, Int4Array: int4.array!,
  Half2Array: half2.array!, Half3Array: half3.array!, Half4Array: half4.array!,
  Float2Array: float2.array!, Float3Array: float3.array!, Float4Array: float4.array!,
  Double2Array: double2.array!, Double3Array: double3.array!, Double4Array: double4.array!,
  Point3hArray: point3h.array!, Point3fArray: point3f.array!, Point3dArray: point3d.array!,
  Vector3hArray: vector3h.array!, Vector3fArray: vector3f.array!, Vector3dArray: vector3d.array!,
  Normal3hArray: normal3h.array!, Normal3fArray: normal3f.array!, Normal3dArray: normal3d.array!,
  Color3hArray: color3h.array!, Color3fArray: color3f.array!, Color3dArray: color3d.array!,
  Color4hArray: color4h.array!, Color4fArray: color4f.array!, Color4dArray: color4d.array!,
  QuathArray: quath.array!, QuatfArray: quatf.array!, QuatdArray: quatd.array!,
  Matrix2dArray: matrix2d.array!, Matrix3dArray: matrix3d.array!, Matrix4dArray: matrix4d.array!,
  Frame4dArray: frame4d.array!,
  TexCoord2hArray: texCoord2h.array!, TexCoord2fArray: texCoord2f.array!, TexCoord2dArray: texCoord2d.array!,
  TexCoord3hArray: texCoord3h.array!, TexCoord3fArray: texCoord3f.array!, TexCoord3dArray: texCoord3d.array!,
  PathExpressionArray: pathExpression.array!,
} as const satisfies Record<string, SdfValueTypeName>

const byName = new Map<string, SdfValueTypeName>(Object.values(ValueTypeNames).map((v) => [v.name, v]))

// _AddLegacyTypesToRegistry (schema.cpp:543-599): legacy spellings register
// as aliases of the types with the same value type and role, so they find
// the same SdfValueTypeName (scalar and array).
for (const [legacy, type] of [
  ['Vec2i', int2], ['Vec2h', half2], ['Vec2f', float2], ['Vec2d', double2],
  ['Vec3i', int3], ['Vec3h', half3], ['Vec3f', float3], ['Vec3d', double3],
  ['Vec4i', int4], ['Vec4h', half4], ['Vec4f', float4], ['Vec4d', double4],
  ['Point', point3d], ['PointFloat', point3f], ['Normal', normal3d], ['NormalFloat', normal3f],
  ['Vector', vector3d], ['VectorFloat', vector3f], ['Color', color3d], ['ColorFloat', color3f],
  ['Quath', quath], ['Quatf', quatf], ['Quatd', quatd],
  ['Matrix2d', matrix2d], ['Matrix3d', matrix3d], ['Matrix4d', matrix4d], ['Frame', frame4d],
] as const) {
  byName.set(legacy, type.scalar)
  if (type.array) byName.set(`${legacy}[]`, type.array)
}

/** SdfSchemaBase::FindType — look up a value type name by its scene-description string. */
export function findValueTypeName(name: string): SdfValueTypeName | undefined {
  return byName.get(name)
}
