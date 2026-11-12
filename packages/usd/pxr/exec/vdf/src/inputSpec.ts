// Ported from OpenUSD 26.11.1: pxr/exec/vdf/inputSpec.cpp,
//  pxr/exec/vdf/inputSpec.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/inputSpec.h and inputSpec.cpp.
//
// A VdfInputSpec describes an input connector: its value type, name, access,
// associated output name, and whether it is a prerequisite.
//
// VdfInputSpec::New<T>(...) and New(TfType, ...) (inputSpec.h:40-59) are both
// New(type, ...) (docs/openexec-x1.md 4.1, template parameters).

import {
  HashCombine as TfHashCombine,
  type Type as TfType,
} from 'typescript-usd/tf'

import type { VdfOutputSpec } from './outputSpec.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

/** VdfInputSpec::Access (inputSpec.h:35-38). */
export enum VdfInputSpecAccess {
  READ = 0x1,
  READWRITE = 0x2,
}

export class VdfInputSpec {
  static readonly READ = VdfInputSpecAccess.READ
  static readonly READWRITE = VdfInputSpecAccess.READWRITE

  private readonly _type: TfType
  private readonly _name: TfToken
  private readonly _associatedOutputName: TfToken
  private readonly _access: VdfInputSpecAccess
  private readonly _prerequisite: boolean

  private constructor(
    type: TfType,
    inName: TfToken,
    outName: TfToken,
    access: VdfInputSpecAccess,
    prerequisite: boolean) {
    this._type = type
    this._name = inName
    this._associatedOutputName = outName
    this._access = access
    this._prerequisite = prerequisite
  }

  /** New<T> / New(TfType, ...) (inputSpec.h:40-59). */
  static new(
    type: TfType,
    inName: TfToken,
    outName: TfToken,
    access: VdfInputSpecAccess,
    prerequisite: boolean): VdfInputSpec {
    return new VdfInputSpec(type, inName, outName, access, prerequisite)
  }

  /** Copy construction, as VdfConnectorSpecs::Append does (connectorSpecs.h:94). */
  Clone(): VdfInputSpec {
    return new VdfInputSpec(
      this._type, this._name, this._associatedOutputName, this._access,
      this._prerequisite)
  }

  /** GetType (inputSpec.h:65). */
  getType(): TfType {
    return this._type
  }

  /** GetName (inputSpec.h:68). */
  getName(): TfToken {
    return this._name
  }

  /** GetTypeName (inputSpec.cpp:20). */
  getTypeName(): string {
    return this._type.getTypeName()
  }

  /** GetAccess (inputSpec.h:75). */
  getAccess(): VdfInputSpecAccess {
    return this._access
  }

  /** TypeMatches (inputSpec.cpp:37). */
  typeMatches(other: VdfOutputSpec): boolean {
    return this.getType() === other.getType()
  }

  /** GetAssociatedOutputName (inputSpec.h:85): the empty token if not set. */
  getAssociatedOutputName(): TfToken {
    return this._associatedOutputName
  }

  /** IsPrerequisite (inputSpec.h:96). */
  isPrerequisite(): boolean {
    return this._prerequisite
  }

  /** GetHash (inputSpec.cpp:26). The type contributes its name. */
  getHash(): number {
    return Number(BigInt.asUintN(53, TfHashCombine(
      this._name,
      this._type.getTypeName(),
      this._associatedOutputName,
      this._access,
      this._prerequisite)))
  }

  /** operator== (inputSpec.h:104). */
  Equals(rhs: VdfInputSpec): boolean {
    return this._type === rhs._type &&
      this._name === rhs._name &&
      this._associatedOutputName === rhs._associatedOutputName &&
      this._access === rhs._access &&
      this._prerequisite === rhs._prerequisite
  }

  /** operator!= (inputSpec.h:111). */
  notEquals(rhs: VdfInputSpec): boolean {
    return !this.Equals(rhs)
  }
}
