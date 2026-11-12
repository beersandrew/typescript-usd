// Ported from OpenUSD 26.11.1: pxr/exec/vdf/outputSpec.cpp,
//  pxr/exec/vdf/outputSpec.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/outputSpec.h and outputSpec.cpp.
//
// A VdfOutputSpec describes an output connector: its value type and name.
// Upstream keeps a per-type static block of function pointers
// (Vdf_OutputSpecTypeInfo, outputSpec.h:24-32) for allocating and resizing
// caches. With the template argument mapped to a runtime TfType
// (docs/openexec-x1.md 4.1), that block is a small object built per TfType.
//
// Mapping choice: VdfOutputSpec::New<T>(name) (outputSpec.h:44-47) and the
// runtime VdfOutputSpec::New(TfType, name) (outputSpec.cpp:26-45) both become
// New(type, name). Template callers never needed registration upstream, and
// every TS caller passes the type at run time, so New(type, name) follows the
// template path and generates the type info for any type. The registered
// table (_RegisterType, outputSpec.cpp:76-85) is kept for
// VdfExecutionTypeRegistry and is consulted first.

import {
  HashCombine as TfHashCombine,
  TF_VERIFY,
  type Type as TfType,
} from 'typescript-usd/tf'

import type { TfCompressedBits } from 'typescript-usd/tf'

import { VdfTypedVector } from './typedVector.ts'
import type { VdfVector } from './vector.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

/** Vdf_OutputSpecTypeInfo (outputSpec.h:24-32). */
export interface Vdf_OutputSpecTypeInfo {
  readonly type: TfType
  readonly allocateCache: () => VdfVector
  readonly resizeCache: (vector: VdfVector, bits: TfCompressedBits) => void
}

// _outputSpecTypeInfoTable (outputSpec.cpp:20-23), keyed by TfType identity.
const _outputSpecTypeInfoTable = new Map<TfType, Vdf_OutputSpecTypeInfo>()

// Per-type static blocks of _GenerateTypeInfo<T> (outputSpec.h:106-112).
const _generatedTypeInfo = new Map<TfType, Vdf_OutputSpecTypeInfo>()

export class VdfOutputSpec {
  private readonly _typeinfo: Vdf_OutputSpecTypeInfo
  private readonly _name: TfToken

  private constructor(typeinfo: Vdf_OutputSpecTypeInfo, name: TfToken) {
    this._typeinfo = typeinfo
    this._name = name
  }

  /** New<T>(name) / New(TfType, name) (outputSpec.h:44-50); see file header. */
  static new(type: TfType, name: TfToken): VdfOutputSpec {
    const typeinfo = _outputSpecTypeInfoTable.get(type) ??
      VdfOutputSpec._generateTypeInfo(type)
    return new VdfOutputSpec(typeinfo, name)
  }

  /** Copy construction, as VdfConnectorSpecs::Append does (connectorSpecs.h:94). */
  Clone(): VdfOutputSpec {
    return new VdfOutputSpec(this._typeinfo, this._name)
  }

  /** GetTypeName (outputSpec.cpp:51). */
  getTypeName(): string {
    return this.getType().getTypeName()
  }

  /** GetType (outputSpec.h:60). */
  getType(): TfType {
    return this._typeinfo.type
  }

  /** GetName (outputSpec.h:63). */
  getName(): TfToken {
    return this._name
  }

  /** AllocateCache (outputSpec.cpp:63): a new VdfTypedVector of this type. */
  allocateCache(): VdfVector {
    return this._typeinfo.allocateCache()
  }

  /** ResizeCache (outputSpec.cpp:70). */
  resizeCache(vector: VdfVector, bits: TfCompressedBits): void {
    this._typeinfo.resizeCache(vector, bits)
  }

  /** operator== (outputSpec.h:75). */
  Equals(rhs: VdfOutputSpec): boolean {
    return this.getType() === rhs.getType() && this._name === rhs._name
  }

  /** operator!= (outputSpec.h:78). */
  notEquals(rhs: VdfOutputSpec): boolean {
    return !this.Equals(rhs)
  }

  /**
   * GetHash (outputSpec.cpp:57): TfHash::Combine(_name, GetType()). The type
   * contributes its name (TfType hashes by identity upstream).
   */
  getHash(): number {
    return Number(BigInt.asUintN(53, TfHashCombine(this._name, this.getType().getTypeName())))
  }

  // _GenerateTypeInfo<T> (outputSpec.h:95-112): _AllocateCache<T> is
  // new VdfTypedVector<T>() and _ResizeCache<T> is cache->Resize<T>(bits).
  private static _generateTypeInfo(type: TfType): Vdf_OutputSpecTypeInfo {
    let ti = _generatedTypeInfo.get(type)
    if (!ti) {
      ti = {
        type,
        allocateCache: () => new VdfTypedVector(type),
        resizeCache: (cache: VdfVector, bits: TfCompressedBits) => {
          cache.resize(type, bits)
        },
      }
      _generatedTypeInfo.set(type, ti)
    }
    return ti
  }

  /**
   * _RegisterType (outputSpec.cpp:76-85, outputSpec.h:118-123). Only
   * VdfExecutionTypeRegistry registers types.
   */
  static _registerType(typeOrInfo: TfType | Vdf_OutputSpecTypeInfo): void {
    const typeinfo = 'allocateCache' in typeOrInfo
      ? typeOrInfo
      : VdfOutputSpec._generateTypeInfo(typeOrInfo)
    if (!TF_VERIFY(typeinfo && !typeinfo.type.isUnknown(), 'typeinfo && typeinfo->type')) {
      return
    }
    // tbb insert does not overwrite an existing entry.
    if (!_outputSpecTypeInfoTable.has(typeinfo.type)) {
      _outputSpecTypeInfoTable.set(typeinfo.type, typeinfo)
    }
  }
}
