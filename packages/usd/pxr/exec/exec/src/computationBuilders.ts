// Ported from OpenUSD 26.11.1: pxr/exec/exec/computationBuilders.cpp,
//  pxr/exec/exec/computationBuilders.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/computationBuilders.h and
// computationBuilders.cpp: the Computation Definition Language.
//
// Plugin computations are defined using the domain-specific Computation
// Definition Language (computationBuilders.h:45-114). Each plugin
// computation is registered for a particular schema, either typed or applied,
// inside EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA (registerSchema.ts):
//
//     EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('MySchemaType', (self) => {
//       self.PrimComputation(_tokens.computeMyAttributeValue)
//         .Callback(VtValueTypes.double, (ctx) =>
//           ctx.GetInputValue<number>(VtValueTypes.double, _tokens.myAttribute))
//         .Inputs(
//           AttributeValue(VtValueTypes.double, _tokens.myAttribute).Required())
//     })
//
// Mapping choices:
// - Template value types (`Computation<double>(name)`, `.Callback<T>(fn)`)
//   are a leading TfType argument (port convention 4.1).
// - Upstream's compile-time checks (static_assert in _ValidateInputs,
//   computationBuilders.h:1890-1922, and in Callback/Computation/Metadata)
//   are TS type constraints where TS can express them (the allowed provider
//   types are a type parameter), and are coding errors at run time.
// - Upstream registers a computation in the destructor of its builder, at
//   the end of the full-expression that creates it, and completes a schema's
//   registration in the destructor of `self`, at the end of the registration
//   function (computationBuilders.cpp:346-476). JS has no destructors: a
//   builder created by `self` is finalized when `self` creates the next
//   builder or when the registration function returns, and then `self` is
//   finalized. For the one-statement-per-computation form the language is
//   written in, this is upstream's order; a builder kept in a variable and
//   modified after the next builder is created is finalized early.

import { TF_CODING_ERROR, TF_VERIFY, Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { VdfContext } from 'typescript-usd/vdf'
import { Exec_BuiltinComputationRegistry } from './builtinComputationRegistry.ts'
import { ExecBuiltinComputations } from './builtinComputations.ts'
import { Exec_DefinitionRegistry } from './definitionRegistry.ts'
import {
  type Exec_InputKey, Exec_InputKeyCopy, Exec_InputKeyVector, type Exec_InputKeyVectorRefPtr,
} from './inputKey.ts'
import { Exec_PrivateBuiltinComputations } from './privateBuiltinComputations.ts'
import { ExecProviderResolution } from './providerResolution.ts'
import { ExecTypeRegistry } from './typeRegistry.ts'
import type { ExecCallbackFn, ExecDispatchesOntoSchemas } from './types.ts'

/**
 * An enum that is used as a template parameter to specify which kinds of
 * providers a given input registration is allowed to be used on
 * (computationBuilders.h:196-211).
 */
export enum Exec_ComputationBuilderProviderTypes {
  Prim = 1 << 0,
  Attribute = 1 << 1,
  Any = 0xff,
}

/** operator& (computationBuilders.h:205-211). */
function _ProviderTypesAnd(
  a: Exec_ComputationBuilderProviderTypes,
  b: Exec_ComputationBuilderProviderTypes,
): boolean {
  return (a & b) !== 0
}

// The `!VtIsArray<ResultType>::value` static_asserts: an array value type is
// the `<T>[]` TfType (base/vt/src/value.ts VtValue.CreateArray).
function _CheckNotArray(type: TfType, message: string): void {
  if (type.getTypeName().endsWith('[]')) {
    TF_CODING_ERROR(message)
  }
}

// ExecTypeRegistry::GetInstance().CheckForRegistration<ResultType>()
function _CheckForRegistration(type: TfType): TfType {
  return ExecTypeRegistry.GetInstance().checkForRegistration(type)
}

//
// Exec_ComputationBuilderCommonBase
//

/**
 * Common base for value specifiers and accessors
 * (computationBuilders.h:215-231).
 */
export class Exec_ComputationBuilderCommonBase {
  /** computationBuilders.cpp:22-35 */
  protected static _getMetadataValueSpecifier<A extends Exec_ComputationBuilderProviderTypes>(
    allowed: A,
    resultType: TfType,
    localTraversal: SdfPath,
    metadataKey: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<A> {
    return new Exec_ComputationBuilderComputationValueSpecifier(
      allowed,
      Exec_PrivateBuiltinComputations.computeMetadata,
      resultType,
      { localTraversal, dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local },
      metadataKey)
      .inputName(metadataKey)
  }
}

//
// Exec_ComputationBuilderValueSpecifierBase
//

/**
 * Base class of value specifiers (computationBuilders.h:233-279,
 * computationBuilders.cpp:62-155).
 */
export class Exec_ComputationBuilderValueSpecifierBase extends Exec_ComputationBuilderCommonBase {
  // This struct exists just to keep Exec_InputKey private
  // (computationBuilders.cpp:66-84).
  readonly #data: { inputKey: Exec_InputKey }

  /** computationBuilders.cpp:86-102 */
  constructor(
    computationName: string,
    resultType: TfType,
    providerResolution: ExecProviderResolution,
    inputName: string,
    disambiguatingId: string,
  ) {
    super()
    this.#data = {
      inputKey: {
        inputName,
        computationName,
        disambiguatingId,
        resultType,
        providerResolution,
        fallsBackToDispatched: false,
        optional: true,
      },
    }
  }

  /** computationBuilders.cpp:112-117 */
  protected _setInputName(inputName: string): void {
    this.#data.inputKey.inputName = inputName
  }

  /** computationBuilders.cpp:119-124 */
  protected _setOptional(optional: boolean): void {
    this.#data.inputKey.optional = optional
  }

  /** computationBuilders.cpp:126-131 */
  protected _setFallsBackToDispatched(_fallsBackToDispatched: boolean): void {
    // As upstream, this always sets the flag to true.
    this.#data.inputKey.fallsBackToDispatched = true
  }

  /**
   * Returns the input key (computationBuilders.cpp:133-155); upstream's
   * `Exec_InputKey *inputKey` out-parameter is the return value.
   */
  _getInputKey(): Exec_InputKey {
    // Some built-in computations are not allowed to be consumed by user-
    // defined computations.
    if (Exec_BuiltinComputationRegistry.isReservedName(
      this.#data.inputKey.computationName)) {
      const traits = Exec_BuiltinComputationRegistry.GetInstance()
        .getTraits(this.#data.inputKey.computationName)
      if (!traits || !traits.isInputConsumable) {
        TF_CODING_ERROR(
          `The builtin computation '${this.#data.inputKey.computationName}' ` +
          'cannot be consumed by inputs to user-defined computations.')

        this.#data.inputKey.computationName = ''
      }
    }

    return Exec_InputKeyCopy(this.#data.inputKey)
  }
}

/**
 * The value specifier of a constant input (computationBuilders.h:281-298,
 * computationBuilders.cpp:161-178).
 */
export class Exec_ComputationBuilderConstantValueSpecifier
  extends Exec_ComputationBuilderValueSpecifierBase {
  static readonly allowedProviders = Exec_ComputationBuilderProviderTypes.Any
  readonly allowedProviders = Exec_ComputationBuilderProviderTypes.Any

  constructor(
    resultType: TfType,
    localTraversal: SdfPath,
    inputName: string,
    constantValue: VtValue,
  ) {
    super(
      Exec_PrivateBuiltinComputations.computeConstant,
      resultType,
      { localTraversal, dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local },
      inputName,
      Exec_DefinitionRegistry.RegistrationAccess
        ._getInstanceForRegistration().registerConstantValue(
          constantValue))
  }
}

/**
 * The value specifier of a computation input; `allowed` says which providers
 * the input registration can be used on (computationBuilders.h:300-424).
 */
export class Exec_ComputationBuilderComputationValueSpecifier<
  A extends Exec_ComputationBuilderProviderTypes = Exec_ComputationBuilderProviderTypes,
> extends Exec_ComputationBuilderValueSpecifierBase {
  readonly allowedProviders: A

  constructor(
    allowed: A,
    computationName: string,
    resultType: TfType,
    providerResolution: ExecProviderResolution,
    disambiguatingId = '',
  ) {
    super(
      computationName, resultType,
      providerResolution,
      computationName /* inputName */,
      disambiguatingId)
    this.allowedProviders = allowed
  }

  /**
   * Overrides the default input name, setting it to `inputName`
   * (computationBuilders.h:322-352). Every computation input must have a
   * unique input name.
   */
  inputName(inputName: string): this {
    this._setInputName(inputName)
    return this
  }

  /**
   * Declares the input is required (computationBuilders.h:354-380): the
   * computation will not be evaluated if the input cannot be resolved.
   */
  required(): this {
    this._setOptional(false)
    return this
  }

  /**
   * Declares the input can find dispatched computations
   * (computationBuilders.h:382-419).
   */
  fallsBackToDispatched(): this {
    this._setFallsBackToDispatched(true)
    return this
  }
}

//
// Accessors
//

/** computationBuilders.h:426-446 */
export class Exec_ComputationBuilderAccessorBase extends Exec_ComputationBuilderCommonBase {
  readonly #localTraversal: SdfPath

  constructor(localTraversal: SdfPath) {
    super()
    this.#localTraversal = localTraversal
  }

  protected _getLocalTraversal(): SdfPath {
    return this.#localTraversal
  }
}

/** computationBuilders.h:448-480, computationBuilders.cpp:184-197 */
export class Exec_ComputationBuilderConstantAccessorBase extends Exec_ComputationBuilderAccessorBase {
  readonly #constantValue: VtValue
  readonly #valueType: TfType

  constructor(constantValue: VtValue, valueType: TfType) {
    super(SdfPath.absoluteRootPath)
    this.#constantValue = constantValue
    this.#valueType = valueType
  }

  /**
   * Sets the input name for a constant input; every Constant() must be
   * followed by InputName (computationBuilders.h:452-463).
   */
  inputName(inputName: string): Exec_ComputationBuilderConstantValueSpecifier {
    return new Exec_ComputationBuilderConstantValueSpecifier(
      this.#valueType,
      this._getLocalTraversal(),
      inputName,
      this.#constantValue)
  }
}

/** computationBuilders.h:482-541 */
export class Exec_ComputationBuilderAccessor<
  A extends Exec_ComputationBuilderProviderTypes,
> extends Exec_ComputationBuilderAccessorBase {
  protected readonly _allowed: A

  constructor(allowed: A, localTraversal: SdfPath) {
    super(localTraversal)
    this._allowed = allowed
  }

  /**
   * Requests an input value from the computation `computationName` of type
   * `resultType` (computationBuilders.h:492-511).
   */
  Computation(
    resultType: TfType,
    computationName: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<A> {
    _CheckNotArray(resultType, 'VtArray is not a supported result type.')

    return new Exec_ComputationBuilderComputationValueSpecifier(
      this._allowed,
      computationName,
      _CheckForRegistration(resultType),
      {
        localTraversal: this._getLocalTraversal(),
        dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local,
      })
  }

  /**
   * Requests input values from the computation `computationName` of type
   * `resultType` on the attributes that own connections targeting the
   * provider (computationBuilders.h:513-524).
   */
  IncomingConnections(
    resultType: TfType,
    computationName: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<A> {
    return new Exec_ComputationBuilderComputationValueSpecifier(
      this._allowed,
      computationName,
      _CheckForRegistration(resultType),
      {
        localTraversal: this._getLocalTraversal(),
        dynamicTraversal:
          ExecProviderResolution.DynamicTraversal.IncomingConnectionOwningAttributes,
      })
  }

  /**
   * Requests a metadata value from the provider
   * (computationBuilders.h:526-538).
   */
  Metadata(
    resultType: TfType,
    metadataKey: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<A> {
    _CheckNotArray(resultType, 'VtArray is not a supported result type.')

    return Exec_ComputationBuilderCommonBase._getMetadataValueSpecifier(
      this._allowed,
      _CheckForRegistration(resultType),
      this._getLocalTraversal(),
      metadataKey)
  }
}

/** computationBuilders.h:543-552 */
export class Exec_ComputationBuilderPropertyAccessor<
  A extends Exec_ComputationBuilderProviderTypes,
> extends Exec_ComputationBuilderAccessor<A> {}

/** computationBuilders.h:554-587 */
export class Exec_ComputationBuilderAttributeAccessor<
  A extends Exec_ComputationBuilderProviderTypes,
> extends Exec_ComputationBuilderPropertyAccessor<A> {
  /**
   * Requests input values from the computation `computationName` of type
   * `resultType` on the objects targeted by the attribute's connections
   * (computationBuilders.h:564-584).
   */
  Connections(
    resultType: TfType,
    computationName: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<A> {
    return new Exec_ComputationBuilderComputationValueSpecifier(
      this._allowed,
      computationName,
      _CheckForRegistration(resultType),
      {
        localTraversal: this._getLocalTraversal(),
        dynamicTraversal:
          ExecProviderResolution.DynamicTraversal.ConnectionTargetedObjects,
      })
  }
}

/** computationBuilders.h:589-648 */
export class Exec_ComputationBuilderRelationshipAccessor<
  A extends Exec_ComputationBuilderProviderTypes,
> extends Exec_ComputationBuilderPropertyAccessor<A> {
  /**
   * Requests input values from the computation `computationName` of type
   * `resultType` on the objects targeted by the relationship, applying
   * relationship forwarding (computationBuilders.h:599-645).
   */
  targetedObjects(
    resultType: TfType,
    computationName: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<A> {
    return new Exec_ComputationBuilderComputationValueSpecifier(
      this._allowed,
      computationName,
      _CheckForRegistration(resultType),
      {
        localTraversal: this._getLocalTraversal(),
        dynamicTraversal:
          ExecProviderResolution.DynamicTraversal.RelationshipTargetedObjects,
      })
  }
}

//
// namespace exec_registration (computationBuilders.h:653-1299)
//

type _PrimProvider = Exec_ComputationBuilderProviderTypes.Prim
type _AttributeProvider = Exec_ComputationBuilderProviderTypes.Attribute
type _AnyProvider = Exec_ComputationBuilderProviderTypes.Any

/**
 * Object accessor that accesses the owning prim of the provider attribute
 * (computationBuilders.h:724-797, `struct Prim`).
 */
export class Exec_ComputationBuilderPrimAccessor
  extends Exec_ComputationBuilderAccessor<_AttributeProvider> {
  constructor() {
    super(Exec_ComputationBuilderProviderTypes.Attribute, SdfPath.fromString('..'))
  }

  /** Accesses a sibling attribute (computationBuilders.h:756-767). */
  Attribute(attributeName: string): Exec_ComputationBuilderAttributeAccessor<_AttributeProvider> {
    return new Exec_ComputationBuilderAttributeAccessor(
      Exec_ComputationBuilderProviderTypes.Attribute,
      SdfPath.fromString('..').appendProperty(attributeName))
  }

  /** Accesses a sibling relationship (computationBuilders.h:769-778). */
  Relationship(
    relationshipName: string,
  ): Exec_ComputationBuilderRelationshipAccessor<_AttributeProvider> {
    return new Exec_ComputationBuilderRelationshipAccessor(
      Exec_ComputationBuilderProviderTypes.Attribute,
      SdfPath.fromString('..').appendProperty(relationshipName))
  }

  /**
   * Requests the computed value of a sibling attribute
   * (computationBuilders.h:780-794).
   */
  AttributeValue(
    valueType: TfType,
    attributeName: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<_AttributeProvider> {
    return this.Attribute(attributeName)
      .Computation(valueType, ExecBuiltinComputations.computeValue)
      .inputName(attributeName)
  }
}

/**
 * Object accessor that accesses an attribute on the provider prim
 * (computationBuilders.h:655-694, `struct Attribute`).
 */
export function Attribute(
  attributeName: string,
): Exec_ComputationBuilderAttributeAccessor<_PrimProvider> {
  return new Exec_ComputationBuilderAttributeAccessor(
    Exec_ComputationBuilderProviderTypes.Prim,
    SdfPath.reflexiveRelativePath.appendProperty(attributeName))
}

/**
 * Object accessor that accesses a relationship on the provider prim
 * (computationBuilders.h:696-720, `struct Relationship`).
 */
export function Relationship(
  relationshipName: string,
): Exec_ComputationBuilderRelationshipAccessor<_PrimProvider> {
  return new Exec_ComputationBuilderRelationshipAccessor(
    Exec_ComputationBuilderProviderTypes.Prim,
    SdfPath.reflexiveRelativePath.appendProperty(relationshipName))
}

/**
 * Object accessor that accesses the owning prim of the provider attribute
 * (computationBuilders.h:722-797, `struct Prim`).
 */
export function Prim(): Exec_ComputationBuilderPrimAccessor {
  return new Exec_ComputationBuilderPrimAccessor()
}

/**
 * Object accessor that accesses the stage, i.e. the pseudo-root prim
 * (computationBuilders.h:799-839, `struct Stage`).
 */
export function Stage(): Exec_ComputationBuilderAccessor<_AnyProvider> {
  return new Exec_ComputationBuilderAccessor(
    Exec_ComputationBuilderProviderTypes.Any,
    SdfPath.absoluteRootPath)
}

/**
 * Requests an input value from the computation `computationName` of type
 * `resultType` on the provider (computationBuilders.h:841-886,
 * `struct Computation<ResultType>`).
 */
export function Computation(
  resultType: TfType,
  computationName: string,
): Exec_ComputationBuilderComputationValueSpecifier<_AnyProvider> {
  return new Exec_ComputationBuilderComputationValueSpecifier(
    Exec_ComputationBuilderProviderTypes.Any,
    computationName,
    _CheckForRegistration(resultType),
    {
      localTraversal: SdfPath.reflexiveRelativePath,
      dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local,
    })
}

/**
 * Requests the value of the metadata field `metadataKey`, of type
 * `valueType`, on the provider (computationBuilders.h:888-936,
 * `struct Metadata<ValueType>`).
 */
export function Metadata(
  valueType: TfType,
  metadataKey: string,
): Exec_ComputationBuilderComputationValueSpecifier<_AnyProvider> {
  _CheckNotArray(valueType, 'VtArray is not a supported result type.')
  return _MetadataAccess.Make(valueType, metadataKey).inputName(metadataKey)
}

// Gives Metadata() access to the protected _GetMetadataValueSpecifier, as
// struct Metadata's base class does.
class _MetadataAccess extends Exec_ComputationBuilderCommonBase {
  static Make(
    valueType: TfType,
    metadataKey: string,
  ): Exec_ComputationBuilderComputationValueSpecifier<_AnyProvider> {
    return Exec_ComputationBuilderCommonBase._getMetadataValueSpecifier(
      Exec_ComputationBuilderProviderTypes.Any,
      _CheckForRegistration(valueType),
      SdfPath.reflexiveRelativePath,
      metadataKey)
  }
}

/**
 * Requests a constant input value, of type `valueType`; must be followed by
 * InputName (computationBuilders.h:938-1081, `struct Constant<ValueType>`).
 *
 * Upstream deduces ValueType from the argument (a string literal is a
 * std::string); here the type is the leading argument. A VtValue argument
 * supplies both.
 */
export function Constant(
  valueTypeOrValue: TfType | VtValue,
  constantValue?: unknown,
): Exec_ComputationBuilderConstantAccessorBase {
  const value = valueTypeOrValue instanceof VtValue
    ? valueTypeOrValue
    : VtValue.create(constantValue, valueTypeOrValue)
  return new Exec_ComputationBuilderConstantAccessorBase(
    value,
    _CheckForRegistration(value.getType()))
}

/**
 * Requests an input value from the nearest namespace ancestor prim that
 * provides the computation `computationName` of type `resultType`
 * (computationBuilders.h:1083-1133, `struct NamespaceAncestor<ResultType>`).
 */
export function NamespaceAncestor(
  resultType: TfType,
  computationName: string,
): Exec_ComputationBuilderComputationValueSpecifier<_PrimProvider> {
  return new Exec_ComputationBuilderComputationValueSpecifier(
    Exec_ComputationBuilderProviderTypes.Prim,
    computationName,
    _CheckForRegistration(resultType),
    {
      localTraversal: SdfPath.reflexiveRelativePath,
      dynamicTraversal: ExecProviderResolution.DynamicTraversal.NamespaceAncestor,
    })
}

/**
 * Requests the computed value of the attribute `attributeName`, of type
 * `valueType`, on the provider prim (computationBuilders.h:1138-1193).
 */
export function AttributeValue(
  valueType: TfType,
  attributeName: string,
): Exec_ComputationBuilderComputationValueSpecifier<_PrimProvider> {
  return Attribute(attributeName)
    .Computation(valueType, ExecBuiltinComputations.computeValue)
    .inputName(attributeName)
}

/**
 * Requests input values from the computation `computationName` on the
 * objects targeted by the provider attribute's connections
 * (computationBuilders.h:1195-1244).
 */
export function Connections(
  resultType: TfType,
  computationName: string,
): Exec_ComputationBuilderComputationValueSpecifier<_AttributeProvider> {
  return new Exec_ComputationBuilderComputationValueSpecifier(
    Exec_ComputationBuilderProviderTypes.Attribute,
    computationName,
    _CheckForRegistration(resultType),
    {
      localTraversal: SdfPath.reflexiveRelativePath,
      dynamicTraversal: ExecProviderResolution.DynamicTraversal.ConnectionTargetedObjects,
    })
}

/**
 * Requests input values from the computation `computationName` on the
 * attributes that own connections targeting the provider
 * (computationBuilders.h:1246-1297).
 */
export function IncomingConnections(
  resultType: TfType,
  computationName: string,
): Exec_ComputationBuilderComputationValueSpecifier<_AnyProvider> {
  return new Exec_ComputationBuilderComputationValueSpecifier(
    Exec_ComputationBuilderProviderTypes.Any,
    computationName,
    _CheckForRegistration(resultType),
    {
      localTraversal: SdfPath.reflexiveRelativePath,
      dynamicTraversal:
        ExecProviderResolution.DynamicTraversal.IncomingConnectionOwningAttributes,
    })
}

/**
 * The input registrations of namespace exec_registration
 * (computationBuilders.h:653-1299).
 */
export const exec_registration = {
  Attribute,
  Relationship,
  Prim,
  Stage,
  Computation,
  Metadata,
  Constant,
  NamespaceAncestor,
  AttributeValue,
  Connections,
  IncomingConnections,
} as const

//
// Computation builders
//

/** A value specifier usable on providers of kind `A` (_ValidateInputs). */
type _InputFor<A extends Exec_ComputationBuilderProviderTypes> =
  | Exec_ComputationBuilderConstantValueSpecifier
  | Exec_ComputationBuilderComputationValueSpecifier<A | _AnyProvider>

/** Callback function accepted by Callback (computationBuilders.h:1600-1733). */
export type ExecComputationCallback<R> = (context: VdfContext) => R

// Data held by computation builders (computationBuilders.cpp:203-230).
interface _BuilderData {
  readonly attributeName: string
  readonly schemaType: TfType
  readonly computationName: string
  readonly dispatched: boolean
  dispatchesOntoSchemas: ExecDispatchesOntoSchemas
  resultType: TfType
  callback: ExecCallbackFn
  inputKeys: Exec_InputKeyVectorRefPtr
}

/**
 * The base class of computation builders (computationBuilders.h:1533-1581,
 * computationBuilders.cpp:199-284).
 */
export abstract class Exec_ComputationBuilderBase {
  readonly #data: _BuilderData
  #destroyed = false

  protected constructor(
    attributeName: string,
    schemaType: TfType,
    computationName: string,
    dispatched: boolean,
    dispatchesOntoSchemas: ExecDispatchesOntoSchemas,
  ) {
    this.#data = {
      attributeName,
      schemaType,
      computationName,
      dispatched,
      dispatchesOntoSchemas,
      resultType: TfType.getUnknownType(),
      // A default-constructed std::function: compiling a computation without
      // a callback throws std::bad_function_call when the node runs, which
      // Exec_CallbackNode reports as a coding error.
      callback: () => {
        throw new Error('std::bad_function_call')
      },
      inputKeys: Exec_InputKeyVector.makeShared(),
    }
  }

  /** computationBuilders.cpp:232-241 */
  protected _getData(): _BuilderData {
    TF_VERIFY(this.#data, '_data')
    return this.#data
  }

  /** computationBuilders.cpp:255-261 */
  protected _addCallback(callback: ExecCallbackFn, resultType: TfType): void {
    this.#data.callback = callback
    this.#data.resultType = resultType
  }

  /**
   * The static_asserts of _ValidateInputs (computationBuilders.h:1888-1922),
   * checked at run time. Returns false, after a coding error, for an
   * argument that cannot be an input registration here.
   */
  protected static _validateInputs(
    allowed: Exec_ComputationBuilderProviderTypes,
    arg: unknown,
  ): boolean {
    if (arg instanceof Exec_ComputationBuilderConstantAccessorBase) {
      TF_CODING_ERROR('Constant(value) must be followed by .InputName(inputNameToken)')
      return false
    }
    if (arg instanceof Exec_ComputationBuilderAccessorBase) {
      TF_CODING_ERROR("Accessor can't provide an input value.")
      return false
    }
    if (!(arg instanceof Exec_ComputationBuilderConstantValueSpecifier) &&
      !(arg instanceof Exec_ComputationBuilderComputationValueSpecifier)) {
      TF_CODING_ERROR('Invalid type used as an input registration.')
      return false
    }
    const regAllowed = (arg as { allowedProviders: Exec_ComputationBuilderProviderTypes })
      .allowedProviders
    if (!_ProviderTypesAnd(regAllowed, allowed)) {
      TF_CODING_ERROR('This input registration is not allowed on a provider of this type.')
      if (allowed === Exec_ComputationBuilderProviderTypes.Prim) {
        TF_CODING_ERROR(
          'This input registration is only allowed on a provider attribute; ' +
          'there may be a missing Attribute(attributeName) registration.')
      }
      if (allowed === Exec_ComputationBuilderProviderTypes.Attribute) {
        TF_CODING_ERROR(
          'This input registration is only allowed on a provider prim; ' +
          'there may be a missing Prim() registration.')
      }
      return false
    }
    return true
  }

  /** computationBuilders.cpp:263-269 */
  protected _addInputKey(valueSpecifier: Exec_ComputationBuilderValueSpecifierBase): void {
    this.#data.inputKeys.Get().push(valueSpecifier._getInputKey())
  }

  /** computationBuilders.cpp:271-284 */
  protected _getDispatchesOntoSchemas(): ExecDispatchesOntoSchemas | null {
    // A null pointer indicates the computation is not dispatched; otherwise,
    // the pointed-to vector contains the list of the schemas onto which the
    // dispatched computation dispatches, which can be empty, to indicate that
    // the computation dispatches onto all prims, regardless of schemas.
    return this.#data.dispatched
      ? [...this.#data.dispatchesOntoSchemas]
      : null
  }

  /** The registration done by the builder's destructor. */
  protected abstract _register(): void

  /**
   * @internal Runs the builder's destructor body once: registers the
   * computation (see the file header for when this happens).
   */
  _destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this._register()
  }
}

/**
 * The base class of computation builders that provides Callback
 * (computationBuilders.h:1583-1736, Exec_ComputationBuilderCRTPBase).
 */
export abstract class Exec_ComputationBuilderCRTPBase extends Exec_ComputationBuilderBase {
  /**
   * Registers the callback that implements the computation, which produces
   * values of type `resultType` (computationBuilders.h:1600-1733).
   *
   * Upstream distinguishes, by its signature, a callback that returns the
   * result value (`T (*)(const VdfContext &)`, whose value the builder sets
   * with SetOutput, computationBuilders.h:1924-1970) from one that returns
   * void and sets the output itself with VdfContext::SetOutput
   * (computationBuilders.h:1972-2011). JS functions do not declare their
   * return type, so a callback that returns `undefined` is the void kind and
   * any other returned value is set as the output.
   */
  Callback<R>(resultType: TfType, callback: ExecComputationCallback<R | void>): this {
    _CheckNotArray(resultType, 'VtArray is not a supported result type.')

    const registeredType = _CheckForRegistration(resultType)

    this._addCallback(
      (ctx: VdfContext) => {
        const result = callback(ctx)
        if (result !== undefined) {
          ctx.setOutput(result)
        }
      },
      registeredType)

    return this
  }
}

/**
 * The builder for a prim computation (computationBuilders.h:1738-1784,
 * computationBuilders.cpp:315-343).
 */
export class ExecPrimComputationBuilder extends Exec_ComputationBuilderCRTPBase {
  /** @internal Constructed by ExecComputationBuilder only. */
  constructor(
    schemaType: TfType,
    computationName: string,
    dispatched = false,
    dispatchesOntoSchemas: ExecDispatchesOntoSchemas = [],
  ) {
    super(
      /* attributeName */ '',
      schemaType,
      computationName,
      dispatched,
      dispatchesOntoSchemas)
  }

  /**
   * Takes one or more input registrations that specify how to source input
   * values for a prim computation (computationBuilders.h:1764-1781,
   * 2015-2032).
   */
  inputs(...args: Array<_InputFor<_PrimProvider>>): this {
    const valid = args.map(arg => Exec_ComputationBuilderBase._validateInputs(
      Exec_ComputationBuilderProviderTypes.Prim, arg))

    args.forEach((arg, i) => {
      if (valid[i]) this._addInputKey(arg)
    })

    return this
  }

  /** ~ExecPrimComputationBuilder (computationBuilders.cpp:331-343). */
  protected _register(): void {
    const data = this._getData()

    Exec_DefinitionRegistry.RegistrationAccess
      ._getInstanceForRegistration().registerPrimComputation(
        data.schemaType,
        data.computationName,
        data.resultType,
        data.callback,
        data.inputKeys,
        this._getDispatchesOntoSchemas())
  }
}

/**
 * The builder for an attribute computation (computationBuilders.h:1786-1836,
 * computationBuilders.cpp:349-382).
 */
export class ExecAttributeComputationBuilder extends Exec_ComputationBuilderCRTPBase {
  /** @internal Constructed by ExecComputationBuilder only. */
  constructor(
    attributeName: string,
    schemaType: TfType,
    computationName: string,
    dispatched = false,
    dispatchesOntoSchemas: ExecDispatchesOntoSchemas = [],
  ) {
    super(
      attributeName,
      schemaType,
      computationName,
      dispatched,
      dispatchesOntoSchemas)
  }

  /**
   * Takes one or more input registrations that specify how to source input
   * values for an attribute computation (computationBuilders.h:1816-1834,
   * 2034-2051).
   */
  inputs(...args: Array<_InputFor<_AttributeProvider>>): this {
    const valid = args.map(arg => Exec_ComputationBuilderBase._validateInputs(
      Exec_ComputationBuilderProviderTypes.Attribute, arg))

    args.forEach((arg, i) => {
      if (valid[i]) this._addInputKey(arg)
    })

    return this
  }

  /** ~ExecAttributeComputationBuilder (computationBuilders.cpp:366-382). */
  protected _register(): void {
    const data = this._getData()

    // TODO: If the expression has a registered inverse, we can use this
    // function to validate that the expression only uses inputs "approved" for
    // invertible expressions.

    Exec_DefinitionRegistry.RegistrationAccess
      ._getInstanceForRegistration().registerAttributeComputation(
        data.attributeName,
        data.schemaType,
        data.computationName,
        data.resultType,
        data.callback,
        data.inputKeys,
        this._getDispatchesOntoSchemas())
  }
}

/**
 * The builder for an attribute expression (computationBuilders.h:1838-1886,
 * computationBuilders.cpp:388-415).
 */
export class ExecAttributeExpressionBuilder extends Exec_ComputationBuilderCRTPBase {
  /** @internal Constructed by ExecComputationBuilder only. */
  constructor(attributeName: string, schemaType: TfType) {
    super(
      attributeName,
      schemaType,
      Exec_PrivateBuiltinComputations.computeExpression,
      /* dispatched */ false,
      /* dispatchesOntoSchemas */ [])
  }

  /**
   * Takes one or more input registrations that specify how to source input
   * values for an attribute expression (computationBuilders.h:1866-1882,
   * 2053-2070).
   */
  inputs(...args: Array<_InputFor<_AttributeProvider>>): this {
    const valid = args.map(arg => Exec_ComputationBuilderBase._validateInputs(
      Exec_ComputationBuilderProviderTypes.Attribute, arg))

    args.forEach((arg, i) => {
      if (valid[i]) this._addInputKey(arg)
    })

    return this
  }

  /** ~ExecAttributeExpressionBuilder (computationBuilders.cpp:401-415). */
  protected _register(): void {
    const data = this._getData()

    Exec_DefinitionRegistry.RegistrationAccess
      ._getInstanceForRegistration().registerAttributeComputation(
        data.attributeName,
        data.schemaType,
        data.computationName,
        data.resultType,
        data.callback,
        data.inputKeys,
        this._getDispatchesOntoSchemas())
  }
}

const _builderConstructionToken = Symbol('ExecComputationBuilder')

/**
 * The top-level builder object, `self` in an
 * EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA block
 * (computationBuilders.h:1310-1531, computationBuilders.cpp:421-482).
 */
export class ExecComputationBuilder {
  readonly #schemaType: TfType
  #pending: Exec_ComputationBuilderBase | null = null
  #destroyed = false

  /** computationBuilders.cpp:421-425 */
  constructor(token: symbol, schemaType: TfType) {
    if (token !== _builderConstructionToken) {
      throw new TypeError('ExecComputationBuilder is constructed by ConstructionAccess.Construct')
    }
    this.#schemaType = schemaType
  }

  /** computationBuilders.h:1321-1329 */
  static readonly ConstructionAccess = {
    /** computationBuilders.cpp:434-445 */
    construct(schemaTypeName: string): ExecComputationBuilder {
      const schemaType = TfType.findByName(schemaTypeName)
      if (schemaType.isUnknown()) {
        TF_CODING_ERROR(
          `Attempt to build computations for unknown schema type name '${schemaTypeName}'.`)
      }
      return new ExecComputationBuilder(_builderConstructionToken, schemaType)
    },
  }

  /**
   * Registers a prim computation named `computationName`
   * (computationBuilders.h:1333-1351, computationBuilders.cpp:447-452).
   */
  primComputation(computationName: string): ExecPrimComputationBuilder {
    return this.#track(new ExecPrimComputationBuilder(this.#schemaType, computationName))
  }

  /**
   * Registers an attribute computation named `computationName` on attributes
   * named `attributeName` (computationBuilders.h:1353-1373,
   * computationBuilders.cpp:454-461).
   */
  attributeComputation(
    attributeName: string,
    computationName: string,
  ): ExecAttributeComputationBuilder {
    return this.#track(new ExecAttributeComputationBuilder(
      attributeName, this.#schemaType, computationName))
  }

  /**
   * Registers an attribute expression for attributes named `attributeName`
   * (computationBuilders.h:1375-1418, computationBuilders.cpp:463-467).
   */
  attributeExpression(attributeName: string): ExecAttributeExpressionBuilder {
    return this.#track(new ExecAttributeExpressionBuilder(attributeName, this.#schemaType))
  }

  /**
   * Registers a dispatched prim computation named `computationName`, which
   * dispatches onto prims with the given schemas, or onto all prims if none
   * are given (computationBuilders.h:1420-1478, 2072-2087;
   * computationBuilders.cpp:469-479). The schemas are TfType arguments, or
   * one ExecDispatchesOntoSchemas vector.
   */
  dispatchedPrimComputation(
    computationName: string,
    ...schemaTypes: TfType[] | [ExecDispatchesOntoSchemas]
  ): ExecPrimComputationBuilder {
    return this.#track(new ExecPrimComputationBuilder(
      this.#schemaType,
      computationName,
      /* dispatched */ true,
      _OntoSchemas(schemaTypes)))
  }

  /**
   * Registers a dispatched attribute computation named `computationName`,
   * which dispatches onto attributes owned by prims with the given schemas,
   * or onto all attributes if none are given (computationBuilders.h:1480-1529,
   * 2089-2102; computationBuilders.cpp:481-490).
   */
  dispatchedAttributeComputation(
    computationName: string,
    ...schemaTypes: TfType[] | [ExecDispatchesOntoSchemas]
  ): ExecAttributeComputationBuilder {
    return this.#track(new ExecAttributeComputationBuilder(
      /* attributeName */ '',
      this.#schemaType,
      computationName,
      /* dispatched */ true,
      _OntoSchemas(schemaTypes)))
  }

  // The builder made by the previous call reaches the end of its
  // full-expression when the next one is made.
  #track<B extends Exec_ComputationBuilderBase>(builder: B): B {
    this.#pending?._destroy()
    this.#pending = builder
    return builder
  }

  /**
   * @internal Releases `builder`, made by the latest call, from the
   * full-expression tracking above: a builder that initializes a named
   * object lives as long as that object, which destroys it (`_Destroy()`)
   * when it goes out of scope. Upstream's builders are movable values, so a
   * builder can be held this way, e.g. the members `_forwardComputeReg` and
   * `_inverseComputeReg` that ExecIrControllerBuilder initializes from
   * `self.PrimComputation(...)` (execIr/controllerBuilder.h:280-281,
   * controllerBuilder.cpp:30-33) and destroys after its destructor body.
   */
  _release<B extends Exec_ComputationBuilderBase>(builder: B): B {
    if (this.#pending === builder) {
      this.#pending = null
    }
    return builder
  }

  /**
   * @internal ~ExecComputationBuilder (computationBuilders.cpp:427-432),
   * after the destructor of the last builder made from it.
   */
  _destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#pending?._destroy()
    this.#pending = null

    Exec_DefinitionRegistry.RegistrationAccess
      ._getInstanceForRegistration().setComputationRegistrationComplete(
        this.#schemaType)
  }
}

function _OntoSchemas(schemaTypes: TfType[] | [ExecDispatchesOntoSchemas]): ExecDispatchesOntoSchemas {
  const first = schemaTypes[0]
  return Array.isArray(first) ? [...first] : [...(schemaTypes as TfType[])]
}
