// Ported from OpenUSD 26.11.1: pxr/exec/exec/inputResolver.cpp,
//  pxr/exec/exec/inputResolver.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/inputResolver.h and inputResolver.cpp.

import { TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { EsfAttribute, EsfAttributeInterface } from 'typescript-usd/esf'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObject, EsfObjectInterface } from 'typescript-usd/esf'
import type { EsfPrim, EsfPrimInterface } from 'typescript-usd/esf'
import type { EsfRelationship, EsfRelationshipInterface } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage, EsfStageInterface } from 'typescript-usd/esf'
import type { Exec_ComputationDefinition } from './computationDefinition.ts'
import { Exec_DefinitionRegistry } from './definitionRegistry.ts'
import type { Exec_InputKey } from './inputKey.ts'
import { Exec_OutputKey, type Exec_OutputKeyVector } from './outputKey.ts'
import { ExecProviderResolution } from './providerResolution.ts'

// SdfPath does not define a constant for this (inputResolver.cpp:226-227).
let _parentRelativePath: SdfPath | undefined

/**
 * Helper class that performs input resolution (inputResolver.cpp:31-645).
 *
 * Input resolution is implemented as a state machine. The "state" is
 * represented by an EsfObject, which begins at the resolution origin. Each
 * state transition is implemented by a private _TraverseToXxx method, which
 * updates the current object by traversing to a related scene object.
 *
 * A single _InputResolver cannot be used to resolve multiple input keys. Each
 * must work with their own _InputResolver instance. To prevent misuse, this
 * class exposes a single static method that performs the entire resolution
 * process for a single input key.
 *
 */
class _InputResolver {
  // The state of the resolution process is represented by the current scene
  // object, held by its EsfPrim, EsfAttribute or EsfRelationship holder;
  // null is std::monostate (inputResolver.cpp:629-640).
  #currentObjectVariant: EsfPrim | EsfAttribute | EsfRelationship | null = null
  #currentObject: EsfObjectInterface | null
  #currentPrim: EsfPrimInterface | null
  #currentAttribute: EsfAttributeInterface | null
  #currentRelationship: EsfRelationshipInterface | null = null

  // Scene traversals log entries to this journal.
  readonly #journal: EsfJournal | null
  readonly #dispatchingSchemaKey: EsfSchemaConfigKey
  readonly #stage: EsfStageInterface
  readonly #definitionRegistry: Exec_DefinitionRegistry

  /** Implements the global Exec_ResolveInput function (inputResolver.cpp:49-60). */
  static resolveInput(
    stage: EsfStage,
    origin: EsfObject,
    dispatchingSchemaKey: EsfSchemaConfigKey,
    inputKey: Exec_InputKey,
    journal: EsfJournal | null,
  ): Exec_OutputKeyVector {
    const resolver = new _InputResolver(stage, origin, journal, dispatchingSchemaKey)

    return resolver._resolveInput(inputKey)
  }

  // Construct a new _InputResolver that begins at `origin` and logs
  // traversals to `journal` (inputResolver.cpp:63-92).
  private constructor(
    stage: EsfStage,
    origin: EsfObject,
    journal: EsfJournal | null,
    dispatchingSchemaKey: EsfSchemaConfigKey,
  ) {
    this.#currentObject = null
    this.#currentPrim = null
    this.#currentAttribute = null
    this.#journal = journal
    this.#dispatchingSchemaKey = dispatchingSchemaKey
    this.#stage = stage.Get()
    this.#definitionRegistry = Exec_DefinitionRegistry.GetInstance()

    // Initialize the current object by casting the origin to the most
    // appropriate derived type.
    if (origin.Get().isPrim()) {
      this._setPrim(origin.Get().asPrim())
      return
    }

    if (origin.Get().isAttribute()) {
      this._setAttribute(origin.Get().asAttribute())
      return
    }

    TF_VERIFY(false, 'false',
      'Cannot resolve inputs from non-prim, non-attribute origin ' +
      `<${origin.Get().getPath(null).pathString}>.`)
  }

  // Updates the current object to the specified `prim` (inputResolver.cpp:94-102).
  _setPrim(prim: EsfPrim): void {
    this.#currentObjectVariant = prim
    this.#currentPrim = prim.Get()
    this.#currentObject = this.#currentPrim
    this.#currentAttribute = null
    this.#currentRelationship = null
  }

  // Updates the current object to the specified `attribute`
  // (inputResolver.cpp:104-112).
  _setAttribute(attribute: EsfAttribute): void {
    this.#currentObjectVariant = attribute
    this.#currentAttribute = attribute.Get()
    this.#currentObject = this.#currentAttribute
    this.#currentPrim = null
    this.#currentRelationship = null
  }

  // Updates the current object to the specified `relationship`
  // (inputResolver.cpp:114-122).
  _setRelationship(relationship: EsfRelationship): void {
    this.#currentObjectVariant = relationship
    this.#currentRelationship = relationship.Get()
    this.#currentObject = this.#currentRelationship
    this.#currentAttribute = null
    this.#currentPrim = null
  }

  // Clears the current object because the traversal has terminated
  // (`_currentObjectVariant = std::monostate{}`).
  #clearCurrentObject(): void {
    this.#currentObjectVariant = null
    this.#currentObject = null
  }

  // Updates the current object to its parent object
  // (inputResolver.cpp:124-145).
  //
  // This does *not* check if the current object, or its parent is a valid
  // scene object. Such checks are left up to the caller. This only returns
  // false if the current object type is not supported.
  _traverseToParent(): boolean {
    if (this.#currentPrim) {
      this._setPrim(this.#currentPrim.getParent(this.#journal))
      return true
    } else if (this.#currentAttribute) {
      this._setPrim(this.#currentAttribute.getPrim(this.#journal))
      return true
    }

    TF_VERIFY(false, 'false',
      'Cannot traverse to parent from unsupported scene object ' +
      `<${(this.#currentObject as EsfObjectInterface).getPath(null).pathString}>.`)
    return false
  }

  // Updates the current object to an attribute on the current object
  // (inputResolver.cpp:147-164).
  //
  // This does *not* check if the current object or the resulting attribute
  // are valid scene objects. The current object must be a prim, or else a
  // TF_VERIFY is raised, and this returns false.
  _traverseToAttribute(attributeName: string): boolean {
    if (!TF_VERIFY(this.#currentPrim, '_currentPrim') || !this.#currentPrim) {
      return false
    }

    this._setAttribute(this.#currentPrim.getAttribute(attributeName, this.#journal))

    return true
  }

  // Updates the current object to a relationship on the current object
  // (inputResolver.cpp:166-184).
  _traverseToRelationship(relationshipName: string): boolean {
    if (!TF_VERIFY(this.#currentPrim, '_currentPrim') || !this.#currentPrim) {
      return false
    }

    this._setRelationship(
      this.#currentPrim.getRelationship(relationshipName, this.#journal))

    return true
  }

  // Updates the current object by traversing along each component of the
  // relative path that is the `localTraversal` in `providerResolution`
  // (inputResolver.cpp:186-262).
  //
  // The 'dynamicTraversal` in `providerResolution` is used to guide the
  // traversal, in some cases, as to what kind of provider we expect to find
  // at the relative path.
  //
  // The current object must be valid prior to calling this method.
  //
  // If this method returns true, then the current object is valid and is set
  // to the object indicated by the relative path.
  //
  // If this method returns false, then the current object is set to the first
  // invalid object encountered while performing the traversal - which may be
  // the final object, or some intermediate object.
  _traverseToRelativePath(providerResolution: ExecProviderResolution): boolean {
    const relativePath = providerResolution.localTraversal
    if (!TF_VERIFY(!relativePath.isAbsolutePath(), '!relativePath.IsAbsolutePath()')) {
      return false
    }

    const parentRelativePath = _parentRelativePath ??= SdfPath.fromString('..')

    for (const prefix of relativePath.getPrefixes()) {
      if (prefix.equals(SdfPath.reflexiveRelativePath)) {
        continue
      }

      if (prefix.equals(parentRelativePath)) {
        if (!this._traverseToParent()) {
          return false
        }
      } else if (prefix.isPropertyPath()) {
        const propertyName = prefix.name

        // The dynamic traversal tells us whether we expect the property
        // path takes us to a relationship or an attribute.
        if (providerResolution.dynamicTraversal ===
          ExecProviderResolution.DynamicTraversal.RelationshipTargetedObjects) {
          if (!this._traverseToRelationship(propertyName)) {
            return false
          }
        } else if (!this._traverseToAttribute(propertyName)) {
          return false
        }
      } else {
        TF_VERIFY(false, 'false',
          `Unable to traverse along relative path <${relativePath.pathString}>. Unhandled ` +
          `prefix <${prefix.pathString}>.`)
        return false
      }

      // After each hop, stop if we encountered an invalid object.
      if (!(this.#currentObject as EsfObjectInterface).isValid(this.#journal)) {
        return false
      }
    }

    return true
  }

  // Updates the current object by traversing to the object at the given
  // absolute path (inputResolver.cpp:264-301).
  //
  // If this method returns true, then the current object is valid and is set
  // to the object indicated by the absolute path.
  _traverseToAbsolutePath(path: SdfPath): boolean {
    if (!TF_VERIFY(path.isAbsolutePath(), 'path.IsAbsolutePath()') ||
      !TF_VERIFY(!path.isEmpty(), '!path.IsEmpty()')) {
      return false
    }

    const targetObject = this.#stage.getObjectAtPath(path, this.#journal)
    if (!targetObject.Get().isValid(this.#journal)) {
      return false
    }

    if (targetObject.Get().isPrim()) {
      this._setPrim(targetObject.Get().asPrim())
    } else if (targetObject.Get().isAttribute()) {
      this._setAttribute(targetObject.Get().asAttribute())
    } else if (targetObject.Get().isRelationship()) {
      this._setRelationship(targetObject.Get().asRelationship())
    } else {
      TF_VERIFY(
        false, 'false',
        `Unable to traverse to path <${path.pathString}>. Unhandled object type.`)
      return false
    }

    return true
  }

  // Returns the schema config key to use in an output key for the given
  // computation definition; i.e., this config key will be used for
  // computation lookup for any inputs that request dispatched computations
  // (inputResolver.cpp:303-319).
  _getDispatchingConfigKeyForOutputKey(
    computationDefinition: Exec_ComputationDefinition,
  ): EsfSchemaConfigKey {
    // If we found a dispatched computation, then we pass along the
    // dispatching schema config key, to support recursive dispatching.
    if (computationDefinition.isDispatched()) {
      TF_VERIFY(this.#dispatchingSchemaKey.notEquals(new EsfSchemaConfigKey()),
        '_dispatchingSchemaKey != EsfSchemaConfigKey()')
      return this.#dispatchingSchemaKey
    }

    // Otherwise, return the current provider's schema config key.
    return (this.#currentObject as EsfObjectInterface).getSchemaConfigKey(this.#journal)
  }

  // Appends the output key for the current object if it provides the
  // requested computation; the loop bodies of the three targeted-object
  // traversals below (inputResolver.cpp:340-352, 375-387, 414-426).
  #appendOutputKeyForCurrentObject(
    outputKeys: Exec_OutputKeyVector,
    computationName: string,
    resultType: TfType,
    disambiguatingId: string,
  ): void {
    const computationDefinition =
      this._findComputationDefinition(
        computationName,
        resultType,
        disambiguatingId)
    if (computationDefinition) {
      const currentObject = this.#currentObject as EsfObjectInterface
      outputKeys.push(new Exec_OutputKey(
        currentObject.asObject(),
        this._getDispatchingConfigKeyForOutputKey(computationDefinition),
        computationDefinition))
    }
  }

  // Returns the ouput keys for the objects targeted by the forwarded targets
  // of the currrent relationship, for the computation of the given name and
  // result type (inputResolver.cpp:321-361).
  //
  // The current object must be a valid relationship prior to calling this
  // method.
  _traverseToRelationshipTargetedObjects(
    computationName: string,
    resultType: TfType,
    disambiguatingId: string,
  ): Exec_OutputKeyVector {
    const relationship = this.#currentRelationship as EsfRelationshipInterface
    if (!TF_VERIFY(relationship.isValid(this.#journal),
      '_currentRelationship->IsValid(_journal)')) {
      return []
    }

    const outputKeys: Exec_OutputKeyVector = []

    for (const path of relationship.getForwardedTargets(this.#journal)) {
      if (!this._traverseToAbsolutePath(path)) {
        continue
      }

      this.#appendOutputKeyForCurrentObject(
        outputKeys, computationName, resultType, disambiguatingId)
    }

    // Clear the current object, because the traversal has terminated.
    this.#clearCurrentObject()
    this.#currentRelationship = null

    return outputKeys
  }

  // Returns the ouput keys for the objects targeted by the connections of the
  // currrent attribute, for the computation of the given name and result
  // type (inputResolver.cpp:363-396).
  //
  // The current object must be a valid attribute prior to calling this
  // method.
  _traverseToConnectionTargetedObjects(
    computationName: string,
    resultType: TfType,
    disambiguatingId: string,
  ): Exec_OutputKeyVector {
    const attribute = this.#currentAttribute as EsfAttributeInterface
    if (!TF_VERIFY(attribute.isValid(this.#journal), '_currentAttribute->IsValid(_journal)')) {
      return []
    }

    const outputKeys: Exec_OutputKeyVector = []

    for (const path of attribute.getConnections(this.#journal)) {
      if (!this._traverseToAbsolutePath(path)) {
        continue
      }

      this.#appendOutputKeyForCurrentObject(
        outputKeys, computationName, resultType, disambiguatingId)
    }

    // Clear the current object since the traversal has terminated.
    this.#clearCurrentObject()
    this.#currentAttribute = null

    return outputKeys
  }

  // Returns the ouput keys for the attributes that own connections that
  // target the currrent object, for the computation of the given name and
  // result type (inputResolver.cpp:398-436).
  //
  // The current object must be valid prior to calling this method.
  _traverseToIncomingConnectionOwningAttributes(
    computationName: string,
    resultType: TfType,
    disambiguatingId: string,
  ): Exec_OutputKeyVector {
    const currentObject = this.#currentObject as EsfObjectInterface
    if (!TF_VERIFY(currentObject.isValid(this.#journal), '_currentObject->IsValid(_journal)')) {
      return []
    }

    const outputKeys: Exec_OutputKeyVector = []

    for (const path of currentObject.getIncomingConnections(this.#journal)) {
      if (!this._traverseToAbsolutePath(path)) {
        continue
      }

      this.#appendOutputKeyForCurrentObject(
        outputKeys, computationName, resultType, disambiguatingId)
    }

    // Clear the current object since the traversal has terminated.
    this.#clearCurrentObject()
    this.#currentAttribute = null

    return outputKeys
  }

  // Updates the current object to the nearest namespace ancestor that
  // a computation named `computationName` with the given `resultType`
  // (inputResolver.cpp:438-490).
  //
  // The current object must already refer to a valid prim, or else this
  // returns false and the current object is not modified.
  //
  // If this returns a definition, then the current object is set to the
  // ancestor that defines the desired computation; upstream's
  // `foundComputationDefinition` out-parameter is the returned definition,
  // and null is upstream's `false`.
  //
  // If no such ancestor can provide the requested computation, then the
  // current object is set to the pseudo-root prim, and this returns null.
  _traverseToNamespaceAncestor(
    computationName: string,
    resultType: TfType,
    disambiguatingId: string,
  ): Exec_ComputationDefinition | null {
    if (!TF_VERIFY(this.#currentPrim && !this.#currentPrim.isPseudoRoot(),
      '_currentPrim && !_currentPrim->IsPseudoRoot()') || !this.#currentPrim) {
      return null
    }

    if (!this.#currentPrim.isValid(this.#journal)) {
      return null
    }

    this._setPrim(this.#currentPrim.getParent(this.#journal))
    let currentPrim = this.#currentPrim as EsfPrimInterface
    while (!currentPrim.isPseudoRoot()) {
      const computationDefinition =
        this.#definitionRegistry._getPrimComputationDefinition(
          currentPrim,
          computationName,
          this.#dispatchingSchemaKey,
          this.#journal)

      if (computationDefinition &&
        computationDefinition.getResultType(
          currentPrim,
          disambiguatingId,
          this.#journal) ===
        resultType) {
        return computationDefinition
      }

      this._setPrim(currentPrim.getParent(this.#journal))
      currentPrim = this.#currentPrim as EsfPrimInterface
    }

    return null
  }

  // Checks the Exec_DefinitionRegistry for a computation registered for the
  // current object (inputResolver.cpp:492-540).
  //
  // This finds a computation named `computationName` whose result type is
  // `resultType`, but if `resultType` unknown, then the found computaiton
  // may have any result type. (Note that leaf node compilation will request
  // computations of unknown result types).
  //
  // If found, the returned definition may refer to a prim computation or an
  // attribute computation. If not found, this returns null.
  _findComputationDefinition(
    computationName: string,
    resultType: TfType,
    disambiguatingId: string,
  ): Exec_ComputationDefinition | null {
    let computationDefinition: Exec_ComputationDefinition | null = null

    if (this.#currentPrim) {
      computationDefinition =
        this.#definitionRegistry._getPrimComputationDefinition(
          this.#currentPrim,
          computationName,
          this.#dispatchingSchemaKey,
          this.#journal)
    } else if (this.#currentAttribute) {
      computationDefinition =
        this.#definitionRegistry._getAttributeComputationDefinition(
          this.#currentAttribute,
          computationName,
          this.#dispatchingSchemaKey,
          this.#journal)
    }

    if (!computationDefinition) {
      return null
    }

    // If the input key result type is unknown, allow computations of any
    // result type. Otherwise, the expected result type must match the type
    // of the found definition.
    if (resultType.isUnknown() ||
      resultType ===
      computationDefinition.getResultType(
        this.#currentObject as EsfObjectInterface, disambiguatingId, this.#journal)) {
      return computationDefinition
    }

    return null
  }

  // Updates the current object by a traversal described by `inputKey`
  // (inputResolver.cpp:542-627).
  //
  // Returns a vector of output keys, where each key's provider is a valid
  // object resulting from the traversal, and each key's computation is for
  // the requested computation in `inputKey`.
  //
  // If after traversal, the current object is valid, but does not define
  // the computation specified by `inputKey`, then the result does not
  // contain an output key for that object.
  _resolveInput(inputKey: Exec_InputKey): Exec_OutputKeyVector {
    if (!TF_VERIFY(this.#currentObject, '_currentObject') || !this.#currentObject) {
      return []
    }

    const localTraversal =
      inputKey.providerResolution.localTraversal

    // If the local traversal is the absolute root path, the stage
    // pseudo-root is the provider.
    if (localTraversal.isAbsoluteRootPath()) {
      this._setPrim(this.#stage.getPrimAtPath(localTraversal, this.#journal))
    } else {
      // Otherwise, verify we have a valid current object (and thereby journal
      // a dependency on it) and then perform the local traversal.
      if (!TF_VERIFY(this.#currentObject.isValid(this.#journal),
        '_currentObject->IsValid(_journal)')) {
        return []
      }

      if (!this._traverseToRelativePath(inputKey.providerResolution)) {
        return []
      }
    }

    let computationDefinition: Exec_ComputationDefinition | null = null

    // Perform the dynamic traversal.
    switch (inputKey.providerResolution.dynamicTraversal) {
      case ExecProviderResolution.DynamicTraversal.Local:
        computationDefinition = this._findComputationDefinition(
          inputKey.computationName,
          inputKey.resultType,
          inputKey.disambiguatingId)
        break

      case ExecProviderResolution.DynamicTraversal.RelationshipTargetedObjects:
        return this._traverseToRelationshipTargetedObjects(
          inputKey.computationName,
          inputKey.resultType,
          inputKey.disambiguatingId)

      case ExecProviderResolution.DynamicTraversal.ConnectionTargetedObjects:
        return this._traverseToConnectionTargetedObjects(
          inputKey.computationName,
          inputKey.resultType,
          inputKey.disambiguatingId)

      case ExecProviderResolution.DynamicTraversal.IncomingConnectionOwningAttributes:
        return this._traverseToIncomingConnectionOwningAttributes(
          inputKey.computationName,
          inputKey.resultType,
          inputKey.disambiguatingId)

      case ExecProviderResolution.DynamicTraversal.NamespaceAncestor:
        computationDefinition = this._traverseToNamespaceAncestor(
          inputKey.computationName,
          inputKey.resultType,
          inputKey.disambiguatingId)
        if (!computationDefinition) {
          return []
        }
        break
    }

    if (!computationDefinition) {
      return []
    }

    return [
      new Exec_OutputKey(
        (this.#currentObject as EsfObjectInterface).asObject(),
        this._getDispatchingConfigKeyForOutputKey(computationDefinition),
        computationDefinition,
        inputKey.disambiguatingId),
    ]
  }
}

/**
 * Returns output keys whose outputs connect to the input for `inputKey` on a
 * computation provided by `origin` on `stage` (inputResolver.h:23-46,
 * inputResolver.cpp:649-660).
 *
 * `dispatchingSchemaKey` is used to find the requested computation on the
 * resolved provider. If `dispatchingSchemaKey` is empty, this will never
 * resolve to a dispatched computation. If `inputKey` requests dispatched
 * comptuations, `dispatchingSchemaKey` will be used in the output keys, if
 * the input resolves to a dispatched function, to support recursively
 * dispatched functions.
 *
 * Determines the resulting output keys by traversing the scene graph,
 * starting from `origin`, recording each step of the traversal into the
 * `journal`. This `journal` must be provided while making connections to the
 * corresponding input. By doing this, the input will be uncompiled on scene
 * changes that invalidate the results of this traversal.
 */
export function Exec_ResolveInput(
  stage: EsfStage,
  origin: EsfObject,
  dispatchingSchemaKey: EsfSchemaConfigKey,
  inputKey: Exec_InputKey,
  journal: EsfJournal | null,
): Exec_OutputKeyVector {
  return _InputResolver.resolveInput(
    stage, origin, dispatchingSchemaKey, inputKey, journal)
}
