// Ported from OpenUSD 26.11.1: pxr/exec/exec/builtinAttributeComputations.cpp,
//  pxr/exec/exec/builtinAttributeComputations.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/builtinAttributeComputations.h and
// builtinAttributeComputations.cpp.
//
// This file defines builtin computations that are provided by attributes.
//
// An SdfValueTypeName's GetScalarType().GetType() and GetType() are
// _ExecSdfValueTypeNameGetScalarTfType / _ExecSdfValueTypeNameGetTfType, since
// the TS SdfValueTypeName (pxr/usd/sdf/src/valueTypeName.ts) carries no TfType.

import { TF_VERIFY, Type as TfType } from 'typescript-usd/tf'
import type { ValueTypeName as SdfValueTypeName } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { EfTimeType } from 'typescript-usd/ef'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfTokens } from 'typescript-usd/vdf'
import { Exec_AttributeInputNode, Exec_AttributeInputNodeTokens } from './attributeInputNode.ts'
import { ExecBuiltinComputations } from './builtinComputations.ts'
import { Exec_CallbackNode } from './callbackNode.ts'
import { Exec_ComputationDefinition } from './computationDefinition.ts'
import { Exec_InputKeyVector, type Exec_InputKeyVectorConstRefPtr } from './inputKey.ts'
import { Exec_PrivateBuiltinComputations } from './privateBuiltinComputations.ts'
import type { Exec_Program } from './program.ts'
import { ExecProviderResolution } from './providerResolution.ts'

// The TfType of each Sdf value type name's scalar type, as Sdf names them
// (SDF_TF_TYPES, pxr/usd/sdf/src/parserHelpers.ts); the remaining scalar
// types are named by VtValueTypes (base/vt/src/types.ts).
const _sdfScalarTypeNames: Record<string, string> = {
  timecode: 'SdfTimeCode',
  asset: 'SdfAssetPath',
  pathExpression: 'SdfPathExpression',
  opaque: 'SdfOpaqueValue',
}

/**
 * @internal SdfValueTypeName::GetScalarType().GetType(): the TfType of the scalar
 * type of `valueTypeName`.
 */
export function _ExecSdfValueTypeNameGetScalarTfType(
  valueTypeName: SdfValueTypeName | undefined,
): TfType {
  // An invalid SdfValueTypeName has the unknown type.
  if (valueTypeName === undefined) return TfType.getUnknownType()
  const scalar = valueTypeName.scalarType ?? valueTypeName
  return TfType.findByName(_sdfScalarTypeNames[scalar.type] ?? scalar.type)
}

/**
 * @internal SdfValueTypeName::GetType(): the TfType of `valueTypeName`, the `<T>[]`
 * type (VtValue.CreateArray, base/vt/src/value.ts) for an array type name.
 */
export function _ExecSdfValueTypeNameGetTfType(
  valueTypeName: SdfValueTypeName | undefined,
): TfType {
  const scalarType = _ExecSdfValueTypeNameGetScalarTfType(valueTypeName)
  return valueTypeName?.isArray
    ? TfType.declare(`${scalarType.getTypeName()}[]`)
    : scalarType
}

//
// computeResolvedValue
//

/**
 * A computation that yields the resolved value of an attribute
 * (builtinAttributeComputations.h:19-51).
 */
export class Exec_ComputeResolvedValueComputationDefinition extends Exec_ComputationDefinition {
  readonly #inputKeys: Exec_InputKeyVectorConstRefPtr

  /** builtinAttributeComputations.cpp:29-36 */
  constructor() {
    super(
      TfType.getUnknownType(),
      ExecBuiltinComputations.computeResolvedValue)
    this.#inputKeys = Exec_ComputeResolvedValueComputationDefinition._makeInputKeys()
  }

  /** builtinAttributeComputations.cpp:42-54 */
  override getResultType(
    providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    journal: EsfJournal | null,
  ): TfType {
    if (!TF_VERIFY(providerObject.isAttribute(), 'providerObject.IsAttribute()')) {
      return TfType.getUnknownType()
    }

    const providerAttribute = providerObject.asAttribute()
    const valueTypeName = providerAttribute.Get().GetValueTypeName(journal)
    return _ExecSdfValueTypeNameGetScalarTfType(valueTypeName)
  }

  /** builtinAttributeComputations.cpp:56-67 */
  override getExtractionType(providerObject: EsfObjectInterface): TfType {
    if (!TF_VERIFY(providerObject.isAttribute(), 'providerObject.IsAttribute()')) {
      return TfType.getUnknownType()
    }

    const providerAttribute = providerObject.asAttribute()
    const valueTypeName = providerAttribute.Get().GetValueTypeName(/* journal */ null)
    return _ExecSdfValueTypeNameGetTfType(valueTypeName)
  }

  /** builtinAttributeComputations.cpp:69-75 */
  override getInputKeys(
    _providerObject: EsfObjectInterface,
    _journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    return this.#inputKeys
  }

  /** builtinAttributeComputations.cpp:77-102 */
  override compileNode(
    providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    nodeJournal: EsfJournal | null,
    program: Exec_Program | null,
  ): VdfNode | null {
    if (!TF_VERIFY(nodeJournal, 'nodeJournal', 'Null nodeJournal') || !nodeJournal) {
      return null
    }
    if (!TF_VERIFY(program, 'program', 'Null program') || !program) {
      return null
    }
    if (!TF_VERIFY(providerObject.isAttribute(), 'providerObject.IsAttribute()',
      'Non-attribute provider')) {
      return null
    }

    const providerAttribute = providerObject.asAttribute()
    const valueTypeName = providerAttribute.Get().GetValueTypeName(nodeJournal)

    return program.createNode(
      nodeJournal,
      Exec_AttributeInputNode,
      providerAttribute.Get().getQuery(),
      _ExecSdfValueTypeNameGetScalarTfType(valueTypeName))
  }

  /** builtinAttributeComputations.cpp:104-118 */
  static _makeInputKeys(): Exec_InputKeyVectorConstRefPtr {
    // Upstream's aggregate initializer lists six members, so the trailing
    // `/* optional */ false` initializes fallsBackToDispatched, and optional
    // is value-initialized to false.
    return Exec_InputKeyVector.makeConstShared([{
      inputName: Exec_AttributeInputNodeTokens.time,
      computationName: ExecBuiltinComputations.computeTime,
      disambiguatingId: '',
      resultType: EfTimeType,
      providerResolution: {
        localTraversal: SdfPath.absoluteRootPath,
        dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local,
      },
      fallsBackToDispatched: false,
      optional: false,
    }])
  }
}

//
// computeConnectedValue
//

/**
 * A computation that yields the value received across a single connection
 * that is owned by the provider attribute and targets another attribute of
 * the same type that is valid (builtinAttributeComputations.h:53-87).
 *
 * This computation does not currently support providers that own multiple
 * connections or a single connection that targets any object other than a
 * valid attribute.
 */
export class Exec_ComputeConnectedValueComputationDefinition extends Exec_ComputationDefinition {
  /** builtinAttributeComputations.cpp:124-130 */
  constructor() {
    super(
      TfType.getUnknownType(),
      Exec_PrivateBuiltinComputations.computeConnectedValue)
  }

  /** builtinAttributeComputations.cpp:136-148 */
  override getResultType(
    providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    journal: EsfJournal | null,
  ): TfType {
    if (!TF_VERIFY(providerObject.isAttribute(), 'providerObject.IsAttribute()')) {
      return TfType.getUnknownType()
    }

    const providerAttribute = providerObject.asAttribute()
    const valueTypeName = providerAttribute.Get().GetValueTypeName(journal)
    return _ExecSdfValueTypeNameGetScalarTfType(valueTypeName)
  }

  /** builtinAttributeComputations.cpp:150-161 */
  override getExtractionType(providerObject: EsfObjectInterface): TfType {
    if (!TF_VERIFY(providerObject.isAttribute(), 'providerObject.IsAttribute()')) {
      return TfType.getUnknownType()
    }

    const providerAttribute = providerObject.asAttribute()
    const valueTypeName = providerAttribute.Get().GetValueTypeName(/* journal */ null)
    return _ExecSdfValueTypeNameGetTfType(valueTypeName)
  }

  /** builtinAttributeComputations.cpp:163-190 */
  override getInputKeys(
    providerObject: EsfObjectInterface,
    journal: EsfJournal | null,
  ): Exec_InputKeyVectorConstRefPtr {
    const providerAttribute = providerObject.asAttribute()

    // Built-in attribute data flow is currently only supported for attribute
    // providers that own a single connection.
    if (!TF_VERIFY(
      providerObject.isAttribute()
      && providerAttribute.Get().getConnections(journal).length === 1,
      'providerObject.IsAttribute() && providerAttribute->GetConnections(journal).size() == 1')) {
      return Exec_InputKeyVector.getEmptyVector()
    }

    // As in computeResolvedValue's keys, the trailing `/* optional */ false`
    // initializes fallsBackToDispatched; optional is value-initialized.
    return Exec_InputKeyVector.makeConstShared([{
      inputName: VdfTokens.in,
      computationName: ExecBuiltinComputations.computeValue,
      disambiguatingId: '',
      resultType: _ExecSdfValueTypeNameGetScalarTfType(
        providerAttribute.Get().GetValueTypeName(journal)),
      providerResolution: {
        localTraversal: SdfPath.reflexiveRelativePath,
        dynamicTraversal:
          ExecProviderResolution.DynamicTraversal.ConnectionTargetedObjects,
      },
      fallsBackToDispatched: false,
      optional: false,
    }])
  }

  /** builtinAttributeComputations.cpp:192-237 */
  override compileNode(
    providerObject: EsfObjectInterface,
    _disambiguatingId: string,
    journal: EsfJournal | null,
    program: Exec_Program | null,
  ): VdfNode | null {
    if (!TF_VERIFY(journal, 'journal', 'Null journal') || !journal) {
      return null
    }
    if (!TF_VERIFY(program, 'program', 'Null program') || !program) {
      return null
    }
    if (!TF_VERIFY(providerObject.isAttribute(), 'providerObject.IsAttribute()',
      'Non-attribute provider')) {
      return null
    }

    const providerAttribute = providerObject.asAttribute()
    const attrType = _ExecSdfValueTypeNameGetScalarTfType(
      providerAttribute.Get().GetValueTypeName(journal))

    // Default attribute data flow is currently only supported for providers
    // that own a single valid connection, which allows the callback to
    // directly set the output to reference the single input. Note that this
    // will throw a coding error if a single input cannot be resolved and needs
    // to be revised when multiple connections are supported.
    return program.createNode(
      journal,
      Exec_CallbackNode,
      new VdfInputSpecs().readConnector(attrType, VdfTokens.in),
      new VdfOutputSpecs().connector(attrType, VdfTokens.out),
      (ctx: VdfContext) => {
        if (!ctx.hasInputValue(VdfTokens.in)) {
          ctx.setEmptyOutput()
          return
        }
        ctx.setOutputToReferenceInput(VdfTokens.in)
      })
  }
}
