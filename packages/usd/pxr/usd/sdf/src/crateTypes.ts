// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateDataTypes.h,
//  pxr/usd/sdf/crateFile.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Crate (.usdc) value type ids, value-rep flag bits and section constants
// shared by the reader (crateFile.ts) and writer (crateWriter.ts). Mirrors
// pxr/usd/sdf/crateDataTypes.h and crateFile.h.

import { ArrayEdit as VtArrayEdit, type ArrayEditOp as VtArrayEditOp } from 'typescript-usd/vt'

// ---- Value type IDs (spec 16.3.10.1) ----
export const VT = {
  Bool: 1, UChar: 2, Int: 3, UInt: 4, Int64: 5, UInt64: 6,
  Half: 7, Float: 8, Double: 9, String: 10, Token: 11, AssetPath: 12,
  Matrix2d: 13, Matrix3d: 14, Matrix4d: 15,
  Quatd: 16, Quatf: 17, Quath: 18,
  Vec2d: 19, Vec2f: 20, Vec2h: 21, Vec2i: 22,
  Vec3d: 23, Vec3f: 24, Vec3h: 25, Vec3i: 26,
  Vec4d: 27, Vec4f: 28, Vec4h: 29, Vec4i: 30,
  Dictionary: 31,
  TokenListOp: 32, StringListOp: 33, PathListOp: 34, ReferenceListOp: 35,
  IntListOp: 36, Int64ListOp: 37, UIntListOp: 38, UInt64ListOp: 39,
  PathVector: 40, TokenVector: 41,
  Specifier: 42, Permission: 43, Variability: 44,
  VariantSelectionMap: 45, TimeSamples: 46, Payload: 47,
  DoubleVector: 48, LayerOffsetVector: 49, StringVector: 50,
  ValueBlock: 51, Value: 52, UnregisteredValue: 53, UnregisteredValueListOp: 54,
  PayloadListOp: 55, TimeCode: 56, PathExpression: 57, Relocates: 58, Spline: 59,
  AnimationBlock: 60, Duration: 61,
} as const

// OpenUSD v26.08 pxr/usd/sdf/crateFile.cpp:1277-1290 recursively unpacks each
// dictionary's VtValue, retaining its concrete runtime type alongside the value.
export const VALUE_TYPE_NAMES: Readonly<Record<number, string>> = {
  [VT.Duration]: 'duration',
  [VT.Bool]: 'bool', [VT.UChar]: 'uchar', [VT.Int]: 'int', [VT.UInt]: 'uint',
  [VT.Int64]: 'int64', [VT.UInt64]: 'uint64', [VT.Half]: 'half',
  [VT.Float]: 'float', [VT.Double]: 'double', [VT.String]: 'string',
  [VT.Token]: 'token', [VT.AssetPath]: 'asset', [VT.Matrix2d]: 'matrix2d',
  [VT.Matrix3d]: 'matrix3d', [VT.Matrix4d]: 'matrix4d', [VT.Quatd]: 'quatd',
  [VT.Quatf]: 'quatf', [VT.Quath]: 'quath', [VT.Vec2d]: 'double2',
  [VT.Vec2f]: 'float2', [VT.Vec2h]: 'half2', [VT.Vec2i]: 'int2',
  [VT.Vec3d]: 'double3', [VT.Vec3f]: 'float3', [VT.Vec3h]: 'half3',
  [VT.Vec3i]: 'int3', [VT.Vec4d]: 'double4', [VT.Vec4f]: 'float4',
  [VT.Vec4h]: 'half4', [VT.Vec4i]: 'int4', [VT.Dictionary]: 'dictionary',
  [VT.TimeCode]: 'timecode', [VT.PathExpression]: 'pathExpression',
}

// Flag bits in value rep's last byte
export const FLAG_ARRAY = 0x80
export const FLAG_INLINE = 0x40
export const FLAG_COMPRESSED = 0x20
// Crate 0.14: VtArrayEdit values (ValueRep::_IsArrayEditBit, crateFile.h:87);
// the ARRAY flag is not set (crateFile.cpp ValueRepForArrayEdit).
export const FLAG_ARRAY_EDIT = 0x10


// SdfSpecType values as stored in the SPECS section.
export const CRATE_SPEC_FORMS = {
  attribute: 1, connection: 2, expression: 3, mapper: 4, mapperArg: 5,
  prim: 6, pseudoRoot: 7, relationship: 8, relationshipTarget: 9,
  variant: 10, variantSet: 11,
} as const

// ---- VtArrayEdit serialization data ----
//
// VtArrayEditBuilder::GetSerializationData / CreateFromSerializationData
// (arrayEditBuilder.h:208-235): the edit's literals, and its instruction
// stream (Vt_ArrayEditOps::_ins). Each run of one op is an OpAndCount word
// (arrayEditOps.h:64-68: count in the low 56 bits, op in the high 8) followed
// by each instruction's arguments (Vt_ArrayEditOpsBuilder::_AddOp,
// arrayEditBuilder.cpp). Literals are deduplicated in order of first use
// (VtArrayEditBuilder::_FindOrAddLiteral).

// Vt_ArrayEditOps::Op (arrayEditOps.h:35-46).
const ArrayEditOpCode = {
  WriteLiteral: 0, WriteRef: 1, InsertLiteral: 2, InsertRef: 3, EraseRef: 4,
  MinSize: 5, MinSizeFill: 6, SetSize: 7, SetSizeFill: 8, MaxSize: 9,
} as const
type ArrayEditOpCode = typeof ArrayEditOpCode[keyof typeof ArrayEditOpCode]

// Vt_ArrayEditOps::EndIndex (arrayEditOps.h:31).
const ARRAY_EDIT_END_INDEX = -(2n ** 63n)
const OP_COUNT_MASK = (1n << 56n) - 1n

function literalsEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const equals = (a as { equals?: (other: unknown) => boolean }).equals
  return typeof equals === 'function' && equals.call(a, b)
}

/** @internal */
export function _crateArrayEditSerialization(
  edit: VtArrayEdit<unknown>,
): { literals: unknown[], indexes: bigint[] } {
  const literals: unknown[] = []
  const indexes: bigint[] = []
  let lastOpIdx = 0
  const literal = (value: unknown): bigint => {
    let index = literals.findIndex(existing => literalsEqual(existing, value))
    if (index < 0) { index = literals.length; literals.push(value) }
    return BigInt(index)
  }
  const index = (value: number | 'end'): bigint => value === 'end' ? ARRAY_EDIT_END_INDEX : BigInt(value)
  const addOp = (op: ArrayEditOpCode, ...args: bigint[]): void => {
    const last = indexes[lastOpIdx]
    if (indexes.length === 0 || Number(BigInt.asUintN(64, last!) >> 56n) !== op) {
      lastOpIdx = indexes.length
      indexes.push((BigInt(op) << 56n) | 1n)
    } else {
      indexes[lastOpIdx] = last! + 1n
    }
    indexes.push(...args)
  }
  for (const op of edit._serialization()) {
    switch (op.kind) {
      case 'write': addOp(ArrayEditOpCode.WriteLiteral, literal(op.value), index(op.index)); break
      case 'writeRef': addOp(ArrayEditOpCode.WriteRef, index(op.source), index(op.destination)); break
      case 'insert': addOp(ArrayEditOpCode.InsertLiteral, literal(op.value), index(op.index)); break
      case 'insertRef': addOp(ArrayEditOpCode.InsertRef, index(op.source), index(op.destination)); break
      case 'erase': addOp(ArrayEditOpCode.EraseRef, index(op.index)); break
      case 'minSize':
        if (op.fill === undefined) addOp(ArrayEditOpCode.MinSize, BigInt(op.size))
        else addOp(ArrayEditOpCode.MinSizeFill, BigInt(op.size), literal(op.fill))
        break
      case 'setSize':
        if (op.fill === undefined) addOp(ArrayEditOpCode.SetSize, BigInt(op.size))
        else addOp(ArrayEditOpCode.SetSizeFill, BigInt(op.size), literal(op.fill))
        break
      case 'maxSize': addOp(ArrayEditOpCode.MaxSize, BigInt(op.size)); break
    }
  }
  return { literals, indexes }
}

/** @internal */
export function _crateArrayEditFromSerialization(
  literals: readonly unknown[], indexes: readonly bigint[],
): VtArrayEdit<unknown> {
  const ops: VtArrayEditOp<unknown>[] = []
  const index = (value: bigint): number | 'end' => value === ARRAY_EDIT_END_INDEX ? 'end' : Number(value)
  const ref = (value: bigint): number => Number(value)
  const lit = (value: bigint): unknown => literals[Number(value)]
  for (let i = 0; i < indexes.length;) {
    const word = BigInt.asUintN(64, indexes[i++]!)
    const op = Number(word >> 56n) as ArrayEditOpCode
    let count = Number(word & OP_COUNT_MASK)
    // Vt_ArrayEditOps::GetArity (arrayEditOps.h:53-60).
    const arity = op === ArrayEditOpCode.WriteLiteral || op === ArrayEditOpCode.WriteRef ||
      op === ArrayEditOpCode.InsertLiteral || op === ArrayEditOpCode.InsertRef ||
      op === ArrayEditOpCode.MinSizeFill || op === ArrayEditOpCode.SetSizeFill ? 2 : 1
    for (; count > 0 && i + arity <= indexes.length; --count, i += arity) {
      const a1 = indexes[i]!
      const a2 = arity > 1 ? indexes[i + 1]! : -1n
      switch (op) {
        case ArrayEditOpCode.WriteLiteral: ops.push({ kind: 'write', value: lit(a1), index: ref(a2) }); break
        case ArrayEditOpCode.WriteRef: ops.push({ kind: 'writeRef', source: ref(a1), destination: ref(a2) }); break
        case ArrayEditOpCode.InsertLiteral: ops.push({ kind: 'insert', value: lit(a1), index: index(a2) }); break
        case ArrayEditOpCode.InsertRef:
          ops.push({ kind: 'insertRef', source: ref(a1), destination: index(a2) })
          break
        case ArrayEditOpCode.EraseRef: ops.push({ kind: 'erase', index: ref(a1) }); break
        case ArrayEditOpCode.MinSize: ops.push({ kind: 'minSize', size: Number(a1), fill: undefined }); break
        case ArrayEditOpCode.MinSizeFill: ops.push({ kind: 'minSize', size: Number(a1), fill: lit(a2) }); break
        case ArrayEditOpCode.SetSize: ops.push({ kind: 'setSize', size: Number(a1), fill: undefined }); break
        case ArrayEditOpCode.SetSizeFill: ops.push({ kind: 'setSize', size: Number(a1), fill: lit(a2) }); break
        case ArrayEditOpCode.MaxSize: ops.push({ kind: 'maxSize', size: Number(a1) }); break
        default: throw new Error(`Invalid VtArrayEdit op ${op as number}`)
      }
    }
  }
  return new VtArrayEdit(ops)
}
