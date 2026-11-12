// Ported from OpenUSD 26.11.1: pxr/exec/exec/definitionRegistry.cpp,
//  pxr/exec/exec/definitionRegistry.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/definitionRegistry.h and
// definitionRegistry.cpp.
//
// The tbb concurrent maps become Maps (port convention 7). Maps keyed by an
// EsfSchemaConfigKey bucket the keys by EsfSchemaConfigKey.GetHash() and
// compare them with Equals (_SchemaConfigKeyMap). Maps keyed by VtValue
// bucket by VtValue.GetHash() and compare with VtValue.equals.

import {
  TF_CODING_ERROR, TF_VERIFY, TfRegistryManager, TfSingleton, type Type as TfType,
} from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { EsfAttributeInterface } from 'typescript-usd/esf'
import { EsfEditReason } from 'typescript-usd/esf'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObjectInterface } from 'typescript-usd/esf'
import { EsfPrimInterface } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import {
  _ExecSdfValueTypeNameGetTfType,
  Exec_ComputeConnectedValueComputationDefinition,
  Exec_ComputeResolvedValueComputationDefinition,
} from './builtinAttributeComputations.ts'
import { Exec_BuiltinComputationRegistry } from './builtinComputationRegistry.ts'
import { ExecBuiltinComputations } from './builtinComputations.ts'
import {
  Exec_ComputeMetadataComputationDefinition,
  Exec_ComputePathComputationDefinition,
} from './builtinObjectComputations.ts'
import {
  Exec_ComputeConstantComputationDefinition,
  Exec_TimeComputationDefinition,
} from './builtinStageComputations.ts'
import type { Exec_ComputationDefinition } from './computationDefinition.ts'
import type { Exec_InputKeyVectorRefPtr } from './inputKey.ts'
import { Exec_PluginComputationDefinition } from './pluginComputationDefinition.ts'
import { Exec_PluginData } from './pluginData.ts'
import { Exec_PrivateBuiltinComputations } from './privateBuiltinComputations.ts'
import { ExecTypeRegistry } from './typeRegistry.ts'
import {
  type ExecCallbackFn, type ExecDispatchesOntoSchemas, ExecDefinitionRegistryTagKey,
} from './types.ts'

/** A Map keyed by EsfSchemaConfigKey value. */
class _SchemaConfigKeyMap<V> {
  readonly #buckets = new Map<number, Array<[EsfSchemaConfigKey, V]>>()

  get(key: EsfSchemaConfigKey): V | undefined {
    for (const [k, v] of this.#buckets.get(key.getHash()) ?? []) {
      if (k.Equals(key)) return v
    }
    return undefined
  }

  /** emplace: inserts unless the key is present; returns the mapped value. */
  emplace(key: EsfSchemaConfigKey, value: V): V {
    const hash = key.getHash()
    let bucket = this.#buckets.get(hash)
    if (!bucket) this.#buckets.set(hash, bucket = [])
    for (const [k, v] of bucket) {
      if (k.Equals(key)) return v
    }
    bucket.push([key, value])
    return value
  }
}

/** A Map keyed by VtValue value (pxr_tsl::robin_map<VtValue, ..., TfHash>). */
class _VtValueMap<V> {
  readonly #buckets = new Map<bigint, Array<[VtValue, V]>>()

  /** try_emplace: [mapped value, inserted]. */
  tryEmplace(key: VtValue, make: () => V): [V, boolean] {
    const hash = key.getHash()
    let bucket = this.#buckets.get(hash)
    if (!bucket) this.#buckets.set(hash, bucket = [])
    for (const [k, v] of bucket) {
      if (k.equals(key)) return [v, false]
    }
    const value = make()
    bucket.push([key, value])
    return [value, true]
  }
}

// Map from computation name to plugin computation definition
// (definitionRegistry.h:270-276).
type _ComputationDefinitionMap = Map<string, Exec_PluginComputationDefinition>

/**
 * A structure that contains the definitions for all computations that can
 * be found on a prim of a given type (definitionRegistry.h:266-289).
 */
interface _ComposedPrimDefinition {
  primComputationDefinitions: _ComputationDefinitionMap
  dispatchedPrimComputationDefinitions: _ComputationDefinitionMap
  // Map from (attribute name, computation name) to plugin attribute
  // computation definition; the key is attributeName + '\0' +
  // computationName.
  attributeComputationDefinitions: Map<string, Exec_PluginComputationDefinition>
  dispatchedAttributeComputationDefinitions: _ComputationDefinitionMap
}

/** The canonical key of the (attribute name, computation name) pair. */
function _AttributeComputationKey(attributeName: string, computationName: string): string {
  return `${attributeName}\u0000${computationName}`
}

// std::map::emplace: inserts unless present.
function _Emplace<K, V>(map: Map<K, V>, key: K, value: V): boolean {
  if (map.has(key)) return false
  map.set(key, value)
  return true
}

// Plugin computation definitions for one schema, ordered by computation name
// (std::set with _PluginComputationDefinitionComparator,
// definitionRegistry.h:331-338); only the uniqueness of names is observable.
type _PluginComputationSet = Map<string, Exec_PluginComputationDefinition>

const _singleton = new TfSingleton<Exec_DefinitionRegistry>(
  () => new Exec_DefinitionRegistry(_constructionToken))
const _constructionToken = Symbol('Exec_DefinitionRegistry')

/**
 * Singleton that stores computation definitions registered for schemas that
 * define computations (definitionRegistry.h:48-404).
 */
export class Exec_DefinitionRegistry {
  // Map from schemaType to plugin prim computation definitions.
  readonly #pluginPrimComputationDefinitions = new Map<TfType, _PluginComputationSet>()
  readonly #pluginDispatchedPrimComputationDefinitions = new Map<TfType, _PluginComputationSet>()

  // Map from schemaType to map from attribute name to plugin attribute
  // computation definitions (std::map ordered by (TfType, TfToken)).
  readonly #pluginAttributeComputationDefinitions =
    new Map<TfType, Map<string, _PluginComputationSet>>()
  readonly #pluginDispatchedAttributeComputationDefinitions =
    new Map<TfType, _PluginComputationSet>()

  // Map from an opaque key to composed prim exec definition.
  readonly #composedPrimDefinitions = new _SchemaConfigKeyMap<_ComposedPrimDefinition>()

  // Map from schema type to a bool that indicates whether or not any plugin
  // computations are registered for the schema.
  readonly #computationsRegisteredForSchema = new Map<TfType, boolean>()

  // Maps from computationName to builtin stage, prim and attribute
  // computation definitions.
  readonly #builtinStageComputationDefinitions = new Map<string, Exec_ComputationDefinition>()
  readonly #builtinPrimComputationDefinitions = new Map<string, Exec_ComputationDefinition>()
  readonly #builtinAttributeComputationDefinitions = new Map<string, Exec_ComputationDefinition>()

  // Map from constant value to the unique key used to identify it.
  readonly #constantValueToToken = new _VtValueMap<string>()

  // Map from constant value unique key to the constant value it identifies.
  readonly #tokenToConstantValue = new Map<string, VtValue>()

  // An index that is used to generate unique keys for registered constant
  // input values.
  #constantValueIndex = 0

  /** definitionRegistry.cpp:51-81. Only TfSingleton can create instances. */
  constructor(token: symbol) {
    if (token !== _constructionToken) {
      throw new TypeError('Exec_DefinitionRegistry is a singleton; use GetInstance()')
    }

    // Ensure the type registry is initialized before the definition registry
    // so that computation registrations will be able to look up value types.
    ExecTypeRegistry.GetInstance()

    // Populate the registry with builtin computation definitions.
    this._registerBuiltinComputations()

    // TfNotice::Register(..., &Exec_DefinitionRegistry::_DidRegisterPlugins)
    PlugRegistry.GetInstance().addDidRegisterPluginsListener(
      (newPlugins) => this._didRegisterPlugins(newPlugins))

    // Calling SetInstanceConstructed() makes it possible to call
    // TfSingleton<>::GetInstance() before this constructor has finished.
    //
    // This is neccessary because the following call to SubscribeTo() will
    // _immediately_ invoke all registry functions which will, in turn, most
    // likely call TfSingleton<>::GetInstance().
    _singleton.setInstanceConstructed(this)

    // Now initialize the registry.
    //
    // We use ExecDefinitionRegistryTag to identify registry functions, rather
    // than the definition registry type, so Exec_DefinitionRegistry can remain
    // private.
    TfRegistryManager.GetInstance().subscribeTo(ExecDefinitionRegistryTagKey)
  }

  /**
   * Provides access to the singleton instance, first ensuring it is
   * constructed, and ensuring that all currently-loaded plugins have
   * registered their computations (definitionRegistry.cpp:83-90).
   */
  static GetInstance(): Exec_DefinitionRegistry {
    return _singleton.GetInstance()
  }

  /**
   * Returns a reference to the singleton that is suitable for registering
   * new computations (definitionRegistry.cpp:92-96).
   *
   * Upstream this is private, reached by the builders through
   * RegistrationAccess.
   */
  static _getInstanceForRegistration(): Exec_DefinitionRegistry {
    return _singleton.GetInstance()
  }

  /**
   * Selectively allow non-const access to the definition registry for
   * performing registration (definitionRegistry.h:113-127).
   */
  static readonly RegistrationAccess = {
    _getInstanceForRegistration(): Exec_DefinitionRegistry {
      return Exec_DefinitionRegistry._getInstanceForRegistration()
    },
  }

  /**
   * Returns the definition for the computation named `computationName`
   * registered for `providerObject`, or null.
   *
   * Upstream has three overloads, chosen by the static type of the provider:
   * EsfPrimInterface (definitionRegistry.cpp:98-150), EsfAttributeInterface
   * (definitionRegistry.cpp:261-299) and EsfObjectInterface
   * (definitionRegistry.cpp:394-427). Here the provider's class selects the
   * same overload.
   *
   * If dispatched computations are requested, `dispatchingConfigKey` is
   * used for dispatched computation lookup. Any scene access needed to
   * determine the input keys is recorded in `journal`.
   */
  getComputationDefinition(
    providerObject: EsfObjectInterface,
    computationName: string,
    dispatchingConfigKey: EsfSchemaConfigKey,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    if (providerObject instanceof EsfPrimInterface) {
      return this._getPrimComputationDefinition(
        providerObject, computationName, dispatchingConfigKey, journal)
    }
    if (providerObject instanceof EsfAttributeInterface) {
      return this._getAttributeComputationDefinition(
        providerObject, computationName, dispatchingConfigKey, journal)
    }
    return this._getObjectComputationDefinition(
      providerObject, computationName, dispatchingConfigKey, journal)
  }

  /** The EsfPrimInterface overload (definitionRegistry.cpp:98-150). */
  _getPrimComputationDefinition(
    providerPrim: EsfPrimInterface,
    computationName: string,
    dispatchingConfigKey: EsfSchemaConfigKey,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    const isBuiltinReservedName =
      Exec_BuiltinComputationRegistry.isReservedName(computationName)

    // If the provider is the stage, we only support builtin computations.
    if (providerPrim.isPseudoRoot()) {
      if (!isBuiltinReservedName) {
        return null
      }

      return this.#builtinStageComputationDefinitions.get(computationName) ?? null
    }

    if (isBuiltinReservedName) {
      // Look for a builtin computation.
      return this.#builtinPrimComputationDefinitions.get(computationName) ?? null
    }

    // Otherwise, look for a local plugin computation.
    const compDef =
      this._lookUpLocalPrimComputation(providerPrim, computationName, journal)
    if (compDef) {
      return compDef
    }

    // If we didn't find a computation on the provider prim, look for a
    // matching dispatched computation, if dispatched computations are
    // requested.
    if (dispatchingConfigKey.notEquals(new EsfSchemaConfigKey())) {
      return this._lookUpDispatchedComputation(
        providerPrim, computationName,
        /* isPrimComputation */ true,
        dispatchingConfigKey, journal)
    }

    return null
  }

  /**
   * Returns the composed prim definition for `providerPrim`, composing it
   * if necessary (definitionRegistry.cpp:152-187).
   */
  _getOrCreateComposedPrimDefinition(
    providerPrim: EsfPrimInterface,
    journal: EsfJournal | null,
  ): _ComposedPrimDefinition {
    const providerSchemaConfigKey =
      providerPrim.getSchemaConfigKey(journal)

    // Get the composed prim definition, creating it if necessary.
    let composedDef = this.#composedPrimDefinitions.get(providerSchemaConfigKey)
    if (composedDef === undefined) {
      // We don't journal the calls below to GetType and GetAppliedSchemas
      // because the journaling already done by the call to
      // GetPrimSchemaConfigKey is sufficient, since the above call
      // combines the same information accessed by the calls below. If we
      // did rely on journaling these calls, we would have to move them
      // out of the check for the cache hit.
      const nullJournal: EsfJournal | null = null

      const primDef =
        this._composePrimDefinition(
          providerPrim.getStage(),
          providerPrim.getType(nullJournal),
          providerPrim.getAppliedSchemas(nullJournal))

      composedDef = this.#composedPrimDefinitions.emplace(
        providerSchemaConfigKey, primDef)
    }

    return composedDef
  }

  /**
   * Looks for a local (non-dispatched) plugin prim computation on the given
   * `providerPrim` (definitionRegistry.cpp:189-205).
   */
  _lookUpLocalPrimComputation(
    providerPrim: EsfPrimInterface,
    computationName: string,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    const composedPrimDef =
      this._getOrCreateComposedPrimDefinition(providerPrim, journal)

    return composedPrimDef.primComputationDefinitions.get(computationName) ?? null
  }

  /**
   * Looks for a dispatched prim or attribute computation using the given
   * `dispatchingConfigKey` (definitionRegistry.cpp:207-259).
   */
  _lookUpDispatchedComputation(
    providerPrim: EsfPrimInterface,
    computationName: string,
    isPrimComputation: boolean,
    dispatchingConfigKey: EsfSchemaConfigKey,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    if (dispatchingConfigKey.Equals(new EsfSchemaConfigKey())) {
      return null
    }

    // The only way we can end up here is if a non-dispatched computation was
    // found on the dispatching prim (that's the computation that had the input
    // that requests dispatched computations that got us here), which means that
    // we will always find a composed prim definition here.
    const composedDef =
      this.#composedPrimDefinitions.get(dispatchingConfigKey)
    if (!TF_VERIFY(composedDef !== undefined,
      'composedDefIt != _composedPrimDefinitions.end()') || composedDef === undefined) {
      return null
    }

    const compDefs =
      isPrimComputation
        ? composedDef.dispatchedPrimComputationDefinitions
        : composedDef.dispatchedAttributeComputationDefinitions
    const it = compDefs.get(computationName)
    if (it === undefined) {
      return null
    }
    const compDef = it
    if (!TF_VERIFY(compDef, 'compDef')) {
      return null
    }

    // If the computation has no schema restrictions, then we have a match.
    const dispatchesOntoSchemas = compDef.getDispatchesOntoSchemas()
    if (dispatchesOntoSchemas.length === 0) {
      return compDef
    }

    // Otherwise, we iterate over the schema types for the prim (strongest
    // to weakest) and see if any of them match the schema restrictions for
    // the dispatched computation.
    const primSchemaTypes =
      _GetFullyExpandedSchemaTypeVector(
        providerPrim.getStage(),
        providerPrim.getType(journal),
        providerPrim.getAppliedSchemas(journal))
    for (const type of primSchemaTypes) {
      if (dispatchesOntoSchemas.includes(type)) {
        return compDef
      }
    }

    return null
  }

  /** The EsfAttributeInterface overload (definitionRegistry.cpp:261-299). */
  _getAttributeComputationDefinition(
    providerAttribute: EsfAttributeInterface,
    computationName: string,
    dispatchingConfigKey: EsfSchemaConfigKey,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    const isBuiltinReservedName =
      Exec_BuiltinComputationRegistry.isReservedName(computationName)

    if (isBuiltinReservedName) {
      // computeValue is a special case.
      if (computationName === ExecBuiltinComputations.computeValue) {
        return this._getComputeValueDefinition(providerAttribute, journal)
      }

      // Look for a builtin computation.
      return this.#builtinAttributeComputationDefinitions.get(computationName) ?? null
    }

    // Otherwise, look for a local plugin computation.
    const compDef =
      this._lookUpLocalAttributeComputation(
        providerAttribute, computationName, journal)
    if (compDef) {
      return compDef
    }

    // If we didn't find a computation on the provider attribute, look for a
    // matching dispatched computation, if dispatched computations are
    // requested.
    if (dispatchingConfigKey.notEquals(new EsfSchemaConfigKey())) {
      const providerPrim = providerAttribute.getPrim(journal)
      return this._lookUpDispatchedComputation(
        providerPrim.Get(), computationName,
        /* isPrimComputation */ false,
        dispatchingConfigKey, journal)
    }

    return null
  }

  /**
   * Looks for a local (non-dispatched) plugin attribute computation on the
   * given `providerAttribute` (definitionRegistry.cpp:301-320).
   */
  _lookUpLocalAttributeComputation(
    providerAttribute: EsfAttributeInterface,
    computationName: string,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    const providerPrim = providerAttribute.getPrim(journal)

    const composedPrimDef =
      this._getOrCreateComposedPrimDefinition(providerPrim.Get(), journal)

    const attributeName = providerAttribute.getName(journal)
    const compDefs = composedPrimDef.attributeComputationDefinitions
    return compDefs.get(_AttributeComputationKey(attributeName, computationName)) ?? null
  }

  /**
   * Selects a computation definition for computeValue on the provider
   * attribute (definitionRegistry.cpp:322-392).
   */
  _getComputeValueDefinition(
    providerAttribute: EsfAttributeInterface,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    // If the computation has an attribute computation named for the builtin
    // computeExpression, then this is used as the definition of computeValue.
    const expressionDefinition =
      this._lookUpLocalAttributeComputation(
        providerAttribute,
        Exec_PrivateBuiltinComputations.computeExpression,
        journal)
    if (expressionDefinition) {
      return expressionDefinition
    }

    // If the provider attribute owns exactly one connection that targets a
    // valid attribute, then the definition of 'computeValue' is a built-in
    // computation that returns the computed value of the targeted attribute.
    //
    // If the attribute targeted by the connection is not valid, or if the
    // targeted attribute's type does not match the provider's type, then the
    // computed value is the resolved value of the provider.
    //
    // TODO: Multiple connections and non-attribute targets are not currently
    // supported.
    const connectionPaths =
      providerAttribute.getConnections(journal)

    if (connectionPaths.length === 1) {
      const connectedAttr =
        providerAttribute.getStage().Get().getAttributeAtPath(
          connectionPaths[0]!, journal)

      if (connectedAttr.Get().isValid(journal)) {
        const providerType = _ExecSdfValueTypeNameGetTfType(
          providerAttribute.GetValueTypeName(journal))

        const connectedType = _ExecSdfValueTypeNameGetTfType(
          connectedAttr.Get().GetValueTypeName(journal))

        if (providerType === connectedType) {
          const connectionDef =
            this.#builtinAttributeComputationDefinitions.get(
              Exec_PrivateBuiltinComputations.computeConnectedValue)

          if (TF_VERIFY(connectionDef !== undefined,
            'connectionDefIt != _builtinAttributeComputationDefinitions.end()')) {
            return connectionDef ?? null
          }
          return null
        }
      }
    }

    // Otherwise, computeResolvedValue is used as the definition of
    // computeValue.
    const builtin =
      this.#builtinAttributeComputationDefinitions.get(
        ExecBuiltinComputations.computeResolvedValue)
    if (TF_VERIFY(builtin !== undefined,
      'builtinIt != _builtinAttributeComputationDefinitions.end()')) {
      return builtin ?? null
    }

    return null
  }

  /** The EsfObjectInterface overload (definitionRegistry.cpp:394-427). */
  _getObjectComputationDefinition(
    providerObject: EsfObjectInterface,
    computationName: string,
    dispatchingConfigKey: EsfSchemaConfigKey,
    journal: EsfJournal | null,
  ): Exec_ComputationDefinition | null {
    if (providerObject.isPrim()) {
      return this._getPrimComputationDefinition(
        providerObject.asPrim().Get(),
        computationName,
        dispatchingConfigKey,
        journal)
    } else if (providerObject.isAttribute()) {
      return this._getAttributeComputationDefinition(
        providerObject.asAttribute().Get(),
        computationName,
        dispatchingConfigKey,
        journal)
    } else {
      const providerPath =
        providerObject.getPath(/* journal */ null)
      TF_CODING_ERROR(
        `Provider '${providerPath.pathString}' is not a prim or attribute`)
      // Add a resync dependency on the provider.  If the object at this
      // path is removed and replaced with an object of a supported type, a
      // computation definition could be found for the new provider.
      if (journal) {
        journal.add(providerPath, EsfEditReason.ResyncedObject)
      }
      return null
    }
  }

  /**
   * Creates and returns the composed prim definition for a prim on `stage`
   * with typed schema `typedSchema` and API schemas `appliedSchemas`
   * (definitionRegistry.cpp:429-537).
   */
  _composePrimDefinition(
    stage: EsfStage,
    typedSchema: TfType,
    appliedSchemas: readonly string[],
  ): _ComposedPrimDefinition {
    // Iterate over all ancestor types of the provider's schema type, from
    // derived to base, starting with the schema type itself, followed by the
    // fully expanded list of applied API schemas. Ensure that plugin
    // computations have been loaded for each schema type for which they are
    // registered. Add all plugin computations registered for each type to the
    // composed prim definition.

    // Build up the composed prim definition.
    const primDef: _ComposedPrimDefinition = {
      primComputationDefinitions: new Map(),
      dispatchedPrimComputationDefinitions: new Map(),
      attributeComputationDefinitions: new Map(),
      dispatchedAttributeComputationDefinitions: new Map(),
    }

    // Here, we are iterating from the strongest schema to the weakest, so the
    // first one to emplace a given computation wins.
    for (const type of _GetFullyExpandedSchemaTypeVector(
      stage, typedSchema, appliedSchemas)) {
      if (!this._ensurePluginComputationsLoaded(type)) {
        continue
      }

      // TODO: For all but the first type, it makes sense to look in
      // _composedPrimDefinitions to see if we have already composed the base
      // type, and then to merge, rather than keep searching up the type
      // hierarchy.

      // Compose prim computation definitions.
      for (const computationDef of
        this.#pluginPrimComputationDefinitions.get(type)?.values() ?? []) {
        _Emplace(primDef.primComputationDefinitions,
          computationDef.getComputationName(), computationDef)
      }

      // Compose dispatched prim computation definitions.
      for (const computationDef of
        this.#pluginDispatchedPrimComputationDefinitions.get(type)?.values() ?? []) {
        _Emplace(primDef.dispatchedPrimComputationDefinitions,
          computationDef.getComputationName(), computationDef)
      }

      // Compose attribute computation definitions.
      for (const [attributeName, computationDefs] of
        this.#pluginAttributeComputationDefinitions.get(type) ?? []) {
        for (const computationDef of computationDefs.values()) {
          _Emplace(primDef.attributeComputationDefinitions,
            _AttributeComputationKey(attributeName, computationDef.getComputationName()),
            computationDef)
        }
      }

      // Compose dispatched attribute computation definitions.
      for (const computationDef of
        this.#pluginDispatchedAttributeComputationDefinitions.get(type)?.values() ?? []) {
        _Emplace(primDef.dispatchedAttributeComputationDefinitions,
          computationDef.getComputationName(), computationDef)
      }
    }

    return primDef
  }

  /**
   * Returns true if it's valid to register a computation named
   * `computationName` for `schemaType` (definitionRegistry.cpp:539-587).
   */
  _validateComputationRegistration(
    schemaType: TfType,
    computationName: string,
  ): boolean {
    if (schemaType.isUnknown()) {
      TF_CODING_ERROR(
        `Attempt to register computation '${computationName}' using an unknown schema type.`)
      return false
    }

    if (this._isComputationRegistrationComplete(schemaType)) {
      TF_CODING_ERROR(
        `Attempt to register computation '${computationName}' for schema ` +
        `${schemaType.getTypeName()}, for which ` +
        'computation registration has already been completed.')
      return false
    }

    const [allows, pluginName] =
      Exec_PluginData.schemaAllowsPluginComputations(schemaType)
    if (!allows) {
      TF_CODING_ERROR(
        `Attempt to register computation '${computationName}' for schema ` +
        `${schemaType.getTypeName()}, which was ` +
        'declared as not allowing plugin computations by plugin ' +
        `'${pluginName}'.`)
      return false
    }

    if (Exec_BuiltinComputationRegistry.isReservedName(computationName)) {
      const traits = Exec_BuiltinComputationRegistry.GetInstance()
        .getTraits(computationName)
      if (!traits || !traits.isUserDefinable) {
        TF_CODING_ERROR(
          `Attempt to register computation '${computationName}' with a name that uses ` +
          `the prefix '${Exec_BuiltinComputationRegistry.getReservedNamePrefix()}', ` +
          'which is reserved for builtin computations.')
        return false
      }
    }

    return true
  }

  /**
   * Registers a prim computation on `schemaType`
   * (definitionRegistry.cpp:589-630).
   *
   * If `dispatchesOntoSchemas` is null, the computation is local
   * (non-dispatched). Otherwise, it is a dispatched computation that
   * dispatches onto prims with the given list of schemas, or onto all prims,
   * if the list is empty.
   */
  registerPrimComputation(
    schemaType: TfType,
    computationName: string,
    resultType: TfType,
    callback: ExecCallbackFn,
    inputKeys: Exec_InputKeyVectorRefPtr,
    dispatchesOntoSchemas: ExecDispatchesOntoSchemas | null,
  ): void {
    if (!this._validateComputationRegistration(schemaType, computationName)) {
      return
    }

    // If dispatchesOntoSchemas is non-null, the computation being registered
    // is a dispatched computation.
    const dispatched = dispatchesOntoSchemas !== null

    const map = dispatched
      ? this.#pluginDispatchedPrimComputationDefinitions
      : this.#pluginPrimComputationDefinitions
    let definitions = map.get(schemaType)
    if (!definitions) map.set(schemaType, definitions = new Map())
    const emplaced = !definitions.has(computationName)
    if (emplaced) {
      definitions.set(computationName, new Exec_PluginComputationDefinition(
        resultType,
        computationName,
        callback,
        inputKeys,
        dispatchesOntoSchemas))
    }

    // TODO: We need to allow more than one dispatched computation with a given
    // name to be registered. E.g., it makes sense to dispatch one computation
    // for schema A and a different computation for schema B. First, we'll have
    // to figure out the policies that determine how we handle multiple
    // definitions with overlapping sets of schemas to which they apply, such as
    // how to resolve strength order and when to emit errors.
    if (!emplaced) {
      TF_CODING_ERROR(
        `Duplicate ${dispatched ? 'dispatched ' : ' '}prim computation registration ` +
        `for computation named '${computationName}' on schema ${schemaType.getTypeName()}`)
    }
  }

  /**
   * Registers an attribute computation on `schemaType` for attributes named
   * `attributeName` (definitionRegistry.cpp:632-685).
   *
   * If `dispatchesOntoSchemas` is null, the computation is local
   * (non-dispatched). Otherwise, it is a dispatched computation that
   * dispatches onto attributes owned by prims with the given list of
   * schemas, or onto all attributes, if the list is empty.
   */
  registerAttributeComputation(
    attributeName: string,
    schemaType: TfType,
    computationName: string,
    resultType: TfType,
    callback: ExecCallbackFn,
    inputKeys: Exec_InputKeyVectorRefPtr,
    dispatchesOntoSchemas: ExecDispatchesOntoSchemas | null,
  ): void {
    if (!this._validateComputationRegistration(schemaType, computationName)) {
      return
    }

    // If dispatchesOntoSchemas is non-null, the computation being registered
    // is a dispatched computation.
    const dispatched = dispatchesOntoSchemas !== null

    const definitions = ((): _PluginComputationSet => {
      if (dispatched) {
        let set = this.#pluginDispatchedAttributeComputationDefinitions.get(schemaType)
        if (!set) {
          this.#pluginDispatchedAttributeComputationDefinitions.set(schemaType, set = new Map())
        }
        return set
      }
      let byAttribute = this.#pluginAttributeComputationDefinitions.get(schemaType)
      if (!byAttribute) {
        this.#pluginAttributeComputationDefinitions.set(schemaType, byAttribute = new Map())
      }
      let set = byAttribute.get(attributeName)
      if (!set) byAttribute.set(attributeName, set = new Map())
      return set
    })()
    const emplaced = !definitions.has(computationName)
    if (emplaced) {
      definitions.set(computationName, new Exec_PluginComputationDefinition(
        resultType,
        computationName,
        callback,
        inputKeys,
        dispatchesOntoSchemas))
    }

    // TODO: We need to allow more than one dispatched computation with a given
    // name to be registered (see RegisterPrimComputation).
    if (!emplaced) {
      TF_CODING_ERROR(
        `Duplicate ${dispatched ? 'dispatched ' : ' '}attribute computation registration ` +
        `for computation named '${computationName}' on attribute '${attributeName}' ` +
        `for schema ${schemaType.getTypeName()}`)
    }
  }

  /**
   * Registers `value` as a value that can be used for constant value inputs
   * (definitionRegistry.cpp:687-699).
   *
   * Returns a token to be used to identify the constant value and be used as
   * a disambiguating ID in input and output keys.
   */
  registerConstantValue(value: VtValue): string {
    const [uniqueToken, inserted] = this.#constantValueToToken.tryEmplace(value, () =>
      'constant_' + value.getType().getTypeName() + '_' +
      String(this.#constantValueIndex++))
    if (inserted) {
      this.#tokenToConstantValue.set(uniqueToken, value)
    }
    return uniqueToken
  }

  /**
   * Given the `uniqueKey` that identifies a constant value (returned by
   * RegisterConstantValue), returns the corresponding constant value
   * (definitionRegistry.cpp:701-710).
   */
  getConstantValue(uniqueKey: string): VtValue {
    const it = this.#tokenToConstantValue.get(uniqueKey)
    if (!TF_VERIFY(it !== undefined, 'it != _tokenToConstantValue.end()') || it === undefined) {
      return VtValue.getEmpty()
    }

    return it
  }

  /** definitionRegistry.cpp:712-731 */
  _registerBuiltinStageComputation(
    computationName: string,
    definition: Exec_ComputationDefinition,
  ): void {
    if (!TF_VERIFY(
      Exec_BuiltinComputationRegistry.isReservedName(computationName),
      'Exec_BuiltinComputationRegistry::IsReservedName(computationName)')) {
      return
    }

    const emplaced =
      _Emplace(this.#builtinStageComputationDefinitions, computationName, definition)

    if (!emplaced) {
      TF_CODING_ERROR(
        'Duplicate builtin computation registration for stage computation ' +
        `named '${computationName}'`)
    }
  }

  /** definitionRegistry.cpp:733-752 */
  _registerBuiltinPrimComputation(
    computationName: string,
    definition: Exec_ComputationDefinition,
  ): void {
    if (!TF_VERIFY(
      Exec_BuiltinComputationRegistry.isReservedName(computationName),
      'Exec_BuiltinComputationRegistry::IsReservedName(computationName)')) {
      return
    }

    const emplaced =
      _Emplace(this.#builtinPrimComputationDefinitions, computationName, definition)

    if (!emplaced) {
      TF_CODING_ERROR(
        'Duplicate builtin computation registration for prim computation ' +
        `named '${computationName}'`)
    }
  }

  /** definitionRegistry.cpp:754-773 */
  _registerBuiltinAttributeComputation(
    computationName: string,
    definition: Exec_ComputationDefinition,
  ): void {
    if (!TF_VERIFY(
      Exec_BuiltinComputationRegistry.isReservedName(computationName),
      'Exec_BuiltinComputationRegistry::IsReservedName(computationName)')) {
      return
    }

    const emplaced =
      _Emplace(this.#builtinAttributeComputationDefinitions, computationName, definition)

    if (!emplaced) {
      TF_CODING_ERROR(
        'Duplicate builtin attribute computation registration for ' +
        `computation named '${computationName}'`)
    }
  }

  /** definitionRegistry.cpp:775-832 */
  _registerBuiltinComputations(): void {
    // Stage computations

    this._registerBuiltinStageComputation(
      Exec_PrivateBuiltinComputations.computeConstant,
      new Exec_ComputeConstantComputationDefinition())

    this._registerBuiltinStageComputation(
      ExecBuiltinComputations.computeTime,
      new Exec_TimeComputationDefinition())

    // Attribute computations

    this._registerBuiltinAttributeComputation(
      ExecBuiltinComputations.computeResolvedValue,
      new Exec_ComputeResolvedValueComputationDefinition())

    this._registerBuiltinAttributeComputation(
      Exec_PrivateBuiltinComputations.computeConnectedValue,
      new Exec_ComputeConnectedValueComputationDefinition())

    // Object computations
    //
    // We register each computation twice, but count it once for the purposes
    // of validating that the expected number of builtin computations is
    // registered.
    let numObjectComputations = 0

    this._registerBuiltinPrimComputation(
      Exec_PrivateBuiltinComputations.computeMetadata,
      new Exec_ComputeMetadataComputationDefinition())
    this._registerBuiltinAttributeComputation(
      Exec_PrivateBuiltinComputations.computeMetadata,
      new Exec_ComputeMetadataComputationDefinition())
    ++numObjectComputations

    this._registerBuiltinPrimComputation(
      ExecBuiltinComputations.computePath,
      new Exec_ComputePathComputationDefinition())
    this._registerBuiltinAttributeComputation(
      ExecBuiltinComputations.computePath,
      new Exec_ComputePathComputationDefinition())
    ++numObjectComputations

    // Make sure we registered all builtins.
    TF_VERIFY(this.#builtinStageComputationDefinitions.size +
      this.#builtinPrimComputationDefinitions.size +
      this.#builtinAttributeComputationDefinitions.size -
      numObjectComputations ===
      Exec_BuiltinComputationRegistry.GetInstance()
        .getNumComputationsWithDefinitions(),
    '_builtinStageComputationDefinitions.size() + ' +
    '_builtinPrimComputationDefinitions.size() + ' +
    '_builtinAttributeComputationDefinitions.size() - ' +
    'numObjectComputations == ' +
    'Exec_BuiltinComputationRegistry::GetInstance()' +
    '.GetNumComputationsWithDefinitions()')
  }

  /**
   * Notifies if there is an attempt to register plugin computations after
   * the registry is already initialized, which is not suported
   * (definitionRegistry.cpp:834-858).
   */
  _didRegisterPlugins(newPlugins: readonly PlugPlugin[]): void {
    const foundExecRegistration = newPlugins.some(
      plugin => Exec_PluginData.hasExecMetadata(plugin))

    if (foundExecRegistration) {
      TF_CODING_ERROR(
        'Illegal attempt to register plugins that contain exec ' +
        'registrations after the exec definition registry has been ' +
        'initialized.')
    }
  }

  /**
   * Load plugin computations for the given schemaType, if we haven't loaded
   * them yet (definitionRegistry.cpp:860-883).
   *
   * Returns false if no plugin computations are registered for the given
   * schemaType.
   */
  _ensurePluginComputationsLoaded(schemaType: TfType): boolean {
    // If plugin computations were already registered for this schema type or
    // we already determined that no computations are registered for this
    // schema, we can return early.
    const it = this.#computationsRegisteredForSchema.get(schemaType)
    if (it !== undefined) {
      return it
    }

    // If a plugin defines computations for this schema, load it.
    if (Exec_PluginData.loadPluginComputationsForSchema(schemaType)) {
      return true
    }

    // Record the fact that no plugin compuations are registered for this
    // schema type.
    _Emplace(this.#computationsRegisteredForSchema, schemaType, false)

    return false
  }

  /**
   * Returns true if plugin computation registration for `schemaType` is
   * complete (definitionRegistry.cpp:885-891).
   */
  _isComputationRegistrationComplete(schemaType: TfType): boolean {
    return this.#computationsRegisteredForSchema.has(schemaType)
  }

  /**
   * Should be called when plugin computation registration for `schemaType`
   * is complete (definitionRegistry.cpp:893-898).
   */
  setComputationRegistrationComplete(schemaType: TfType): void {
    _Emplace(this.#computationsRegisteredForSchema, schemaType, true)
  }
}

/**
 * Returns all ancestor types of the provider's schema type, from derived to
 * base, starting with the schema type itself, followed by the fully expanded
 * list of applied API schemas (definitionRegistry.cpp:900-939).
 *
 * The returned list of schemas is ordered from strongest to weakest.
 */
function _GetFullyExpandedSchemaTypeVector(
  stage: EsfStage,
  typedSchema: TfType,
  appliedSchemas: readonly string[],
): TfType[] {
  const schemaTypes: TfType[] = []

  // The typed schema may be unknown if the prim was declared without a type.
  if (!typedSchema.isUnknown()) {
    schemaTypes.push(...typedSchema.getAllAncestorTypes())
  }

  for (const schema of appliedSchemas) {
    const [schemaTypeName, appliedInstance] =
      stage.Get().getTypeNameAndInstance(schema)

    // TODO: Add support for computations on multi-apply schemas; for now,
    // we silently skip them.
    if (appliedInstance !== '') {
      continue
    }

    const schemaType =
      stage.Get().getAPITypeFromSchemaTypeName(schemaTypeName)
    if (!schemaType.isUnknown()) {
      schemaTypes.push(schemaType)
    }
  }

  return schemaTypes
}
