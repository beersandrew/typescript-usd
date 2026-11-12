// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/registry.cpp,
//  pxr/usdValidation/usdValidation/registry.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/registry.{h,cpp}.
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { TF_CODING_ERROR, TF_RUNTIME_ERROR, TF_VERIFY, TfRegistryManager } from 'typescript-usd/tf'
import type { UsdValidationFixer } from './fixer.ts'
import { UsdValidationNotice } from './notice.ts'
import {
  UsdValidationValidator, UsdValidationValidatorMetadata, UsdValidationValidatorSuite,
  type UsdValidateLayerTaskFn, type UsdValidatePrimTaskFn, type UsdValidateStageTaskFn,
  type UsdValidationValidatorTask,
} from './validator.ts'

// registry.cpp:26-33.
const _tokens = Object.freeze({
  PluginValidatorsKey: 'Validators',
  Keywords: 'keywords',
  Doc: 'doc',
  SchemaTypes: 'schemaTypes',
  IsTimeDependent: 'isTimeDependent',
  IsSuite: 'isSuite',
  PluginValidatorNameDelimiter: ':',
})

type _TokenToValidatorNamesMap = Map<string, string[]>

// The Python registration shims' PyCallable_Check (wrapRegistry.cpp:194-196,
// 208-210, 222-224, 261-263, 275-277, 289-291): a JavaScript caller can pass
// a non-function too.
function _requireCallable(fn: unknown, what: string): void {
  if (typeof fn !== 'function') throw new TypeError(`${what} must be callable`)
}

function _isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// registry.cpp:56-74 (_ParseStringArrayValue).
function _parseStringArrayValue(object: Record<string, unknown>, token: string,
  validatorName = ''): string[] {
  const errorStrTemplate = `Expected array of strings for ${token} metadata`
  const errorStr = validatorName === ''
    ? errorStrTemplate : `${errorStrTemplate} for validator ${validatorName}`
  if (!(token in object)) return []
  const value = object[token]
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    TF_RUNTIME_ERROR(errorStr)
    return []
  }
  return [...value as string[]]
}

/**
 * The singleton registry of validators and validator suites: their metadata
 * from plugInfo "Validators" entries, and the validators registered for them
 * (registry.h:40-700).
 *
 * PLATFORM-DIVERGENCE(usdValidation-plugin-late-registration): upstream
 * registers every plugin before the registry is constructed and reads every
 * plugin's metadata once, in the constructor (registry.cpp:35-41, 76-190). On
 * the web a plugin registers when its module is imported, at any time, so the
 * registry also reads the "Validators" metadata of plugins registered after
 * it was constructed (a PlugRegistry DidRegisterPlugins listener), and the
 * plugin-name lookup GetValidatorMetadataForPlugins includes them.
 */
export class UsdValidationRegistry {
  static #instance: UsdValidationRegistry | undefined

  readonly #validators = new Map<string, UsdValidationValidator>()
  readonly #validatorSuites = new Map<string, UsdValidationValidatorSuite>()
  readonly #validatorNameToMetadata = new Map<string, UsdValidationValidatorMetadata>()
  readonly #keywordToValidatorNames: _TokenToValidatorNamesMap = new Map()
  readonly #schemaTypeToValidatorNames: _TokenToValidatorNamesMap = new Map()
  readonly #pluginNameToValidatorNames: _TokenToValidatorNamesMap = new Map()

  /** registry.cpp:35-41. */
  private constructor() {
    // Do any plugin processing before subscription starts.
    const plugRegistry = PlugRegistry.GetInstance()
    this.#populateMetadataFromPlugInfo(plugRegistry.getAllPlugins())
    plugRegistry.addDidRegisterPluginsListener(plugins => this.#populateMetadataFromPlugInfo(plugins))
  }

  /** TfSingleton<UsdValidationRegistry>::GetInstance: constructing the
   *  registry runs the TF_REGISTRY_FUNCTION(UsdValidationRegistry) functions
   *  of the loaded libraries (registry.cpp:38-40). */
  static getInstance(): UsdValidationRegistry {
    if (!UsdValidationRegistry.#instance) {
      const registry = new UsdValidationRegistry()
      UsdValidationRegistry.#instance = registry
      TfRegistryManager.GetInstance().subscribeTo(UsdValidationRegistry)
    }
    return UsdValidationRegistry.#instance
  }

  /** registry.cpp:76-190 (_PopulateMetadataFromPlugInfo). */
  #populateMetadataFromPlugInfo(plugins: readonly PlugPlugin[]): void {
    for (const plugin of plugins) {
      const validators = plugin.getMetadata()[_tokens.PluginValidatorsKey]
      // No Validators in plugInfo, continue
      if (!_isObject(validators)) continue

      const keywords = _parseStringArrayValue(validators, _tokens.Keywords)
      const pluginName = plugin.getName()
      const validatorNames: string[] = []
      // Parse all validator names and respective plugMetadata, in the
      // JsObject's (std::map's) key order.
      for (const validatorName of Object.keys(validators).sort()) {
        // Skip keywords, move to validator entries
        if (validatorName === _tokens.Keywords) continue
        const validatorDict = validators[validatorName]
        if (!_isObject(validatorDict)) {
          TF_RUNTIME_ERROR(`Expected dict for validator '${validatorName}'`)
          continue
        }

        const doc = validatorDict[_tokens.Doc]
        if (typeof doc !== 'string' || doc === '') {
          TF_RUNTIME_ERROR('Missing or invalid or empty doc string '
            + `metadata for '${validatorName}' validator`)
          continue
        }

        const metadata = new UsdValidationValidatorMetadata({ pluginPtr: plugin })
        // prefix pluginName to validatorName to make these plugin
        // validator's metadata.name unique
        metadata.name = pluginName + _tokens.PluginValidatorNameDelimiter + validatorName
        validatorNames.push(metadata.name)
        metadata.doc = doc
        metadata.schemaTypes = _parseStringArrayValue(
          validatorDict, _tokens.SchemaTypes, metadata.name)
        metadata.keywords = [...keywords,
          ..._parseStringArrayValue(validatorDict, _tokens.Keywords, metadata.name)]

        if (_tokens.IsTimeDependent in validatorDict) {
          const isTimeDependent = validatorDict[_tokens.IsTimeDependent]
          if (typeof isTimeDependent !== 'boolean') {
            TF_RUNTIME_ERROR('Expected bool for isTimeDependent for '
              + `validator '${metadata.name}'`)
          } else {
            metadata.isTimeDependent = isTimeDependent
          }
        }

        if (_tokens.IsSuite in validatorDict) {
          const isSuite = validatorDict[_tokens.IsSuite]
          if (typeof isSuite !== 'boolean') {
            TF_RUNTIME_ERROR(`Expected bool for isSuite for validator '${metadata.name}'`)
          } else {
            metadata.isSuite = isSuite
          }
        }

        this.#addValidatorMetadata(metadata)
      }
      if (validatorNames.length > 0 && !this.#pluginNameToValidatorNames.has(pluginName)) {
        this.#pluginNameToValidatorNames.set(pluginName, validatorNames)
      }
    }
  }

  /**
   * Registers the task for a validator a plugin's plugInfo declares; its
   * metadata comes from the plugInfo (registry.cpp:192-247). Each kind of
   * task has its own spelling, as in the Python binding
   * (wrapRegistry.cpp:381-392; see usdValidation-task-kind).
   */
  registerPluginLayerValidator(validatorName: string, layerTaskFn: UsdValidateLayerTaskFn,
    fixers: readonly UsdValidationFixer[] = []): void {
    _requireCallable(layerTaskFn, 'layerTaskFn')
    this.#registerPluginValidator(validatorName, { layer: layerTaskFn }, fixers)
  }

  registerPluginStageValidator(validatorName: string, stageTaskFn: UsdValidateStageTaskFn,
    fixers: readonly UsdValidationFixer[] = []): void {
    _requireCallable(stageTaskFn, 'stageTaskFn')
    this.#registerPluginValidator(validatorName, { stage: stageTaskFn }, fixers)
  }

  registerPluginPrimValidator(validatorName: string, primTaskFn: UsdValidatePrimTaskFn,
    fixers: readonly UsdValidationFixer[] = []): void {
    _requireCallable(primTaskFn, 'primTaskFn')
    this.#registerPluginValidator(validatorName, { prim: primTaskFn }, fixers)
  }

  // registry.cpp:219-247 (_RegisterPluginValidator).
  #registerPluginValidator(validatorName: string, task: UsdValidationValidatorTask,
    fixers: readonly UsdValidationFixer[]): void {
    const metadata = this.getValidatorMetadata(validatorName)
    if (!metadata) {
      TF_CODING_ERROR(`Validator metadata missing for '${validatorName}', validator registered `
        + 'using this API must be defined in the plugInfo.json')
      return
    }
    this.#registerValidator(metadata, task, fixers, /* addMetadata */ false)
  }

  /**
   * Registers a validator from its metadata, outside the plugin system, and
   * sends UsdValidationNotice.DidRegisterValidator (registry.cpp:249-274;
   * the Python spellings, wrapRegistry.cpp:366-374).
   */
  registerLayerValidator(metadata: UsdValidationValidatorMetadata,
    layerTaskFn: UsdValidateLayerTaskFn, fixers: readonly UsdValidationFixer[] = []): void {
    _requireCallable(layerTaskFn, 'layerTaskFn')
    this.#registerValidator(metadata, { layer: layerTaskFn }, fixers)
  }

  registerStageValidator(metadata: UsdValidationValidatorMetadata,
    stageTaskFn: UsdValidateStageTaskFn, fixers: readonly UsdValidationFixer[] = []): void {
    _requireCallable(stageTaskFn, 'stageTaskFn')
    this.#registerValidator(metadata, { stage: stageTaskFn }, fixers)
  }

  registerPrimValidator(metadata: UsdValidationValidatorMetadata,
    primTaskFn: UsdValidatePrimTaskFn, fixers: readonly UsdValidationFixer[] = []): void {
    _requireCallable(primTaskFn, 'primTaskFn')
    this.#registerValidator(metadata, { prim: primTaskFn }, fixers)
  }

  // registry.cpp:276-351 (_RegisterValidator).
  #registerValidator(metadata: UsdValidationValidatorMetadata, task: UsdValidationValidatorTask,
    fixers: readonly UsdValidationFixer[], addMetadata = true): void {
    const isPrimTaskFn = 'prim' in task
    if (!UsdValidationRegistry.#checkMetadata(metadata, isPrimTaskFn)) return

    if (this.#validators.has(metadata.name)) {
      TF_CODING_ERROR(`Validator '${metadata.name}' already registered with the `
        + 'UsdValidationRegistry')
      return
    }

    // Note in case validator metadata needs to be added and there is
    // contention only the first validator's (which is being added)
    // metadata will be added.
    if (addMetadata && !this.#addValidatorMetadata(metadata)) {
      TF_CODING_ERROR('Metadata already added for a UsdValidationValidatorSuite '
        + `with the same name '${metadata.name}'.`)
      return
    }

    const newValidator = new UsdValidationValidator(metadata, task, fixers)
    this.#validators.set(metadata.name, newValidator)

    // Notice only needs to be sent for validators which are registered
    // dynamically, outside the plugin registration process.
    if (addMetadata) new UsdValidationNotice.DidRegisterValidator(newValidator).send()
  }

  /** registry.cpp:353-358. */
  hasValidator(validatorName: string): boolean {
    return this.#validators.has(validatorName)
  }

  /** registry.cpp:360-381: every validator that is not a suite, loading
   *  plugins as needed. */
  getOrLoadAllValidators(): UsdValidationValidator[] {
    const validatorNames = [...this.#validatorNameToMetadata.values()]
      .filter(metadata => !metadata.isSuite).map(metadata => metadata.name)
    return this.getOrLoadValidatorsByName(validatorNames)
  }

  /** registry.cpp:383-420. */
  getOrLoadValidatorByName(validatorName: string): UsdValidationValidator | undefined {
    const validator = this.#validators.get(validatorName)
    if (validator) return validator

    const metadata = this.#validatorNameToMetadata.get(validatorName)
    // No validatorMetadata found corresponding to this validatorName
    if (!metadata) return undefined

    // If metadata was found but validator was not found / loaded, that implies
    // this validator must be plugin provided.
    if (!TF_VERIFY(metadata.pluginPtr, 'metadata.pluginPtr')) return undefined

    // Plugin was loaded, lets look again.
    if (metadata.pluginPtr!.Load()) return this.#validators.get(validatorName)
    return undefined
  }

  /** registry.cpp:422-440. */
  getOrLoadValidatorsByName(validatorNames: readonly string[]): UsdValidationValidator[] {
    const validators: UsdValidationValidator[] = []
    for (const validatorName of validatorNames) {
      // If validator is undefined, the validatorName was not found in the
      // registry or failed to register, in which case appropriate coding
      // error would have been reported.
      const validator = this.getOrLoadValidatorByName(validatorName)
      if (validator) validators.push(validator)
    }
    return validators
  }

  /** registry.cpp:442-462: registers a suite a plugin's plugInfo declares. */
  registerPluginValidatorSuite(suiteName: string,
    containedValidators: readonly (UsdValidationValidator | undefined)[]): void {
    const metadata = this.getValidatorMetadata(suiteName)
    if (!metadata) {
      TF_CODING_ERROR(`Validator Suite metadata missing for '${suiteName}', validator registered `
        + 'using this API must be defined in the plugInfo.json')
      return
    }
    this.#registerValidatorSuite(metadata, containedValidators, /* addMetadata */ false)
  }

  /** registry.cpp:464-470: registers a suite outside the plugin system and
   *  sends UsdValidationNotice.DidRegisterValidatorSuite. */
  registerValidatorSuite(metadata: UsdValidationValidatorMetadata,
    containedValidators: readonly (UsdValidationValidator | undefined)[]): void {
    this.#registerValidatorSuite(metadata, containedValidators)
  }

  // registry.cpp:472-585 (_RegisterValidatorSuite).
  #registerValidatorSuite(metadata: UsdValidationValidatorMetadata,
    containedValidators: readonly (UsdValidationValidator | undefined)[], addMetadata = true): void {
    if (!UsdValidationRegistry.#checkMetadata(metadata, /* checkForPrimTask */ false,
      /* expectSuite */ true)) return

    // Make sure containedValidators are conforming if suite has schemaTypes.
    // That is, validators have PrimTaskFn, otherwise, do not register this
    // validator. And contained validators's schemaType is a subset of Suite's
    // schemaTypes metadata.
    if (metadata.schemaTypes.length > 0) {
      for (const validator of containedValidators) {
        if (!validator) {
          TF_CODING_ERROR(`Validator Suite '${metadata.name}' not registered, one of the contained `
            + 'validator is invalid.')
          return
        }
        if (!validator._getValidatePrimTask()) {
          TF_CODING_ERROR(`ValidatorSuite '${metadata.name}' cannot be registered, as it provides `
            + 'schemaTypes, but at least one of its contained validator '
            + `'${validator.getMetadata().name}' does not provide a UsdValidatePrimTaskFn`)
          return
        }
        for (const schemaType of validator.getMetadata().schemaTypes) {
          if (!metadata.schemaTypes.includes(schemaType)) {
            TF_CODING_ERROR(`schemaType '${schemaType}' provided by a contained validator `
              + `'${validator.getMetadata().name}' is not in schemaTypes for `
              + `'${metadata.name}' validator suite`)
            return
          }
        }
      }
    }

    if (this.#validatorSuites.has(metadata.name)) {
      TF_CODING_ERROR(`ValidatorSuite '${metadata.name}' already registered with the `
        + 'UsdValidationRegistry')
      return
    }

    if (addMetadata && !this.#addValidatorMetadata(metadata)) {
      TF_CODING_ERROR('Metadata already added for a UsdValidationValidator with '
        + `the same name '${metadata.name}'.`)
      return
    }

    // A null contained validator of a suite without schemaTypes is kept out,
    // as nothing can hold it (registry.cpp:557-559 keeps the pointer).
    const newValidatorSuite = new UsdValidationValidatorSuite(metadata,
      containedValidators.filter((validator): validator is UsdValidationValidator => !!validator))
    this.#validatorSuites.set(metadata.name, newValidatorSuite)

    if (addMetadata) new UsdValidationNotice.DidRegisterValidatorSuite(newValidatorSuite).send()
  }

  /** registry.cpp:587-592. */
  hasValidatorSuite(suiteName: string): boolean {
    return this.#validatorSuites.has(suiteName)
  }

  /** registry.cpp:594-624. */
  getOrLoadAllValidatorSuites(): UsdValidationValidatorSuite[] {
    const suiteNames = [...this.#validatorNameToMetadata.values()]
      .filter(metadata => metadata.isSuite).map(metadata => metadata.name)
    return this.getOrLoadValidatorSuitesByName(suiteNames)
  }

  /** registry.cpp:626-664. */
  getOrLoadValidatorSuiteByName(suiteName: string): UsdValidationValidatorSuite | undefined {
    const suite = this.#validatorSuites.get(suiteName)
    if (suite) return suite

    const metadata = this.#validatorNameToMetadata.get(suiteName)
    if (!metadata) return undefined

    // If metadata was found but suite was not found / loaded, that implies
    // this suite must be plugin provided.
    if (!TF_VERIFY(metadata.pluginPtr, 'metadata.pluginPtr')) return undefined

    if (metadata.pluginPtr!.Load()) return this.#validatorSuites.get(suiteName)
    return undefined
  }

  /** registry.cpp:666-684. */
  getOrLoadValidatorSuitesByName(suiteNames: readonly string[]): UsdValidationValidatorSuite[] {
    const suites: UsdValidationValidatorSuite[] = []
    for (const suiteName of suiteNames) {
      const suite = this.getOrLoadValidatorSuiteByName(suiteName)
      if (suite) suites.push(suite)
    }
    return suites
  }

  /** registry.cpp:686-698: a copy of the metadata, or undefined (the Python
   *  binding's None, wrapRegistry.cpp:71-81). */
  getValidatorMetadata(name: string): UsdValidationValidatorMetadata | undefined {
    return this.#validatorNameToMetadata.get(name)?.clone()
  }

  /** registry.cpp:700-710. */
  getAllValidatorMetadata(): UsdValidationValidatorMetadata[] {
    return [...this.#validatorNameToMetadata.values()].map(metadata => metadata.clone())
  }

  /** registry.cpp:712-717. */
  getValidatorMetadataForPlugin(pluginName: string): UsdValidationValidatorMetadata[] {
    return this.getValidatorMetadataForPlugins([pluginName])
  }

  /** registry.cpp:719-724. */
  getValidatorMetadataForKeyword(keyword: string): UsdValidationValidatorMetadata[] {
    return this.getValidatorMetadataForKeywords([keyword])
  }

  /** registry.cpp:726-731. */
  getValidatorMetadataForSchemaType(schemaType: string): UsdValidationValidatorMetadata[] {
    return this.getValidatorMetadataForSchemaTypes([schemaType])
  }

  /** registry.cpp:733-742. */
  getValidatorMetadataForPlugins(pluginNames: readonly string[]): UsdValidationValidatorMetadata[] {
    return this.#getValidatorMetadataForToken(this.#pluginNameToValidatorNames, pluginNames)
  }

  /** registry.cpp:744-750. */
  getValidatorMetadataForKeywords(keywords: readonly string[]): UsdValidationValidatorMetadata[] {
    return this.#getValidatorMetadataForToken(this.#keywordToValidatorNames, keywords)
  }

  /** registry.cpp:752-759. */
  getValidatorMetadataForSchemaTypes(schemaTypes: readonly string[]): UsdValidationValidatorMetadata[] {
    return this.#getValidatorMetadataForToken(this.#schemaTypeToValidatorNames, schemaTypes)
  }

  // registry.cpp:761-784 (_GetValidatorMetadataForToken).
  #getValidatorMetadataForToken(tokenToValidatorNames: _TokenToValidatorNamesMap,
    tokens: readonly string[]): UsdValidationValidatorMetadata[] {
    const result: UsdValidationValidatorMetadata[] = []
    for (const token of tokens) {
      const validatorNames = tokenToValidatorNames.get(token)
      if (!validatorNames) continue
      for (const validatorName of validatorNames) {
        // If we have a validatorName in tokenToValidatorNames, we must have a
        // validatorMetadata for this validatorName, because that's how these
        // are added in _AddValidatorMetadata
        const metadata = this.#validatorNameToMetadata.get(validatorName)
        TF_VERIFY(metadata, 'nameToMetadataItr != _validatorNameToMetadata.end()')
        if (metadata) result.push(metadata.clone())
      }
    }
    return result
  }

  // registry.cpp:786-804 (_AddValidatorMetadata).
  #addValidatorMetadata(metadata: UsdValidationValidatorMetadata): boolean {
    if (this.#validatorNameToMetadata.has(metadata.name)) return false
    this.#validatorNameToMetadata.set(metadata.name, metadata.clone())
    UsdValidationRegistry.#updateValidatorNamesMappings(this.#schemaTypeToValidatorNames,
      metadata.name, metadata.schemaTypes)
    UsdValidationRegistry.#updateValidatorNamesMappings(this.#keywordToValidatorNames,
      metadata.name, metadata.keywords)
    return true
  }

  // registry.cpp:806-847 (_CheckMetadata).
  static #checkMetadata(metadata: UsdValidationValidatorMetadata, checkForPrimTask: boolean,
    expectSuite = false): boolean {
    // return false if we are trying to register a validator which is
    // associated with schemaTypes, and testing task is not
    // UsdValidatePrimTaskFn!
    if (!checkForPrimTask && metadata.schemaTypes.length > 0) {
      TF_CODING_ERROR(`Invalid metadata for ('${metadata.name}') validator. Can not provide `
        + 'schemaTypes metadata when registering a '
        + 'UsdValidateLayerTaskFn or UsdValidateStageTaskFn validator.')
      return false
    }

    // Return false if isSuite metadata is set, but we are dealing with a
    // UsdValidationValidator, similarly returns false if isSuite metadata is
    // not set, but we are dealing with a UsdValidationValidatorSuite.
    if (metadata.isSuite !== expectSuite) {
      TF_CODING_ERROR(`Invalid metadata for '${metadata.name}' validator. Incompatible isSuite `
        + `metadata set. Expected '${Number(expectSuite)}', but '${Number(metadata.isSuite)}' provided.`)
      return false
    }

    // return false if we are trying to register a timeDependent validator
    // which is not a UsdValidatePrimTaskFn!
    if (!checkForPrimTask && metadata.isTimeDependent) {
      TF_CODING_ERROR(`Invalid metadata for ('${metadata.name}') validator. Cannot provide `
        + 'isTimeDependent metadata when registering a '
        + 'UsdValidateLayerTaskFn or UsdValidateStageTaskFn validator.')
      return false
    }

    return true
  }

  // registry.cpp:849-865 (_UpdateValidatorNamesMappings).
  static #updateValidatorNamesMappings(tokenMap: _TokenToValidatorNamesMap, validatorName: string,
    tokens: readonly string[]): void {
    for (const token of tokens) {
      const names = tokenMap.get(token)
      if (names) names.push(validatorName)
      else tokenMap.set(token, [validatorName])
    }
  }
}
