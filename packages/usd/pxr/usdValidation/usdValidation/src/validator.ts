// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/validator.cpp,
//  pxr/usdValidation/usdValidation/validator.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/validator.{h,cpp}.
import { Layer } from 'typescript-usd/sdf'
import { Prim, Stage } from 'typescript-usd/usd'
import type { Plugin as PlugPlugin } from 'typescript-usd/plug'
import { TF_CODING_ERROR } from 'typescript-usd/tf'
import type { UsdValidationError } from './error.ts'
import type { UsdValidationFixer } from './fixer.ts'
import { UsdValidationTimeRange } from './timeRange.ts'

/** The fields of UsdValidationValidatorMetadata, for construction. */
export interface UsdValidationValidatorMetadataInit {
  name?: string
  pluginPtr?: PlugPlugin | null
  keywords?: readonly string[]
  doc?: string
  schemaTypes?: readonly string[]
  isTimeDependent?: boolean
  isSuite?: boolean
}

/**
 * A validator's metadata (validator.h:33-81). Plugin validators are named
 * "pluginName:validatorName"; name and doc are mandatory.
 */
export class UsdValidationValidatorMetadata {
  name: string
  /** The plugin a plugin validator belongs to, else null. */
  pluginPtr: PlugPlugin | null
  keywords: string[]
  doc: string
  schemaTypes: string[]
  isTimeDependent: boolean
  isSuite: boolean

  /** The Python ValidatorMetadata constructor's fields and defaults
   *  (wrapValidator.cpp:101-112). */
  constructor(init: UsdValidationValidatorMetadataInit = {}) {
    this.name = init.name ?? ''
    this.pluginPtr = init.pluginPtr ?? null
    this.keywords = [...init.keywords ?? []]
    this.doc = init.doc ?? ''
    this.schemaTypes = [...init.schemaTypes ?? []]
    this.isTimeDependent = init.isTimeDependent ?? false
    this.isSuite = init.isSuite ?? false
  }

  /** The Python `plugin` property (wrapValidator.cpp:113-115). */
  get plugin(): PlugPlugin | null { return this.pluginPtr }

  /** The Python GetKeywords (wrapValidator.cpp:120-123). */
  getKeywords(): string[] { return [...this.keywords] }

  /** The Python GetSchemaTypes (wrapValidator.cpp:124-127). */
  getSchemaTypes(): string[] { return [...this.schemaTypes] }

  /** A copy, as upstream metadata is held and returned by value. */
  clone(): UsdValidationValidatorMetadata {
    return new UsdValidationValidatorMetadata(this)
  }
}

/**
 * A task's errors, or a promise of them (validator.h:86-93 return a
 * UsdValidationErrorVector).
 *
 * PLATFORM-DIVERGENCE(usdValidation-async-validate): upstream validator
 * tasks may do synchronous I/O, e.g. usdUtilsValidators' tasks open every
 * layer and resolve every asset a stage depends on
 * (usdUtilsValidators/validators.cpp:44-45,189-190) and read usdz archives
 * (validators.cpp:116,215-216). Layer opening, asset resolution and asset
 * reads are asynchronous here (sdf/src/layer.ts, ar/src/resolver.ts), so a
 * task may return a promise, and UsdValidationValidator.Validate and
 * UsdValidationContext.Validate resolve to the errors rather than returning
 * them.
 */
export type UsdValidationTaskResult = UsdValidationError[] | Promise<UsdValidationError[]>
/** validator.h:86-87. */
export type UsdValidateLayerTaskFn = (layer: Layer) => UsdValidationTaskResult
/** validator.h:88-90. */
export type UsdValidateStageTaskFn = (
  stage: Stage, timeRange: UsdValidationTimeRange) => UsdValidationTaskResult
/** validator.h:91-93. */
export type UsdValidatePrimTaskFn = (
  prim: Prim, timeRange: UsdValidationTimeRange) => UsdValidationTaskResult

/**
 * A validator's task: the std::variant validator.h:302-304 holds.
 *
 * PLATFORM-DIVERGENCE(usdValidation-task-kind): upstream overloads the
 * validator constructors and RegisterValidator / RegisterPluginValidator on
 * the std::function type of the task (validator.h:133-153, registry.h:180-
 * 350). A JavaScript function carries no parameter types, so the kind of task
 * is named: here by the key of this object, and in UsdValidationRegistry by
 * the Python binding's spellings (RegisterLayerValidator,
 * RegisterPluginPrimValidator, ...; wrapRegistry.cpp:366-396).
 */
export type UsdValidationValidatorTask =
  | { readonly layer: UsdValidateLayerTaskFn }
  | { readonly stage: UsdValidateStageTaskFn }
  | { readonly prim: UsdValidatePrimTaskFn }

/**
 * A validator: metadata plus a layer, stage or prim task and its fixers
 * (validator.h:117-319).
 */
export class UsdValidationValidator {
  readonly #metadata: UsdValidationValidatorMetadata
  readonly #task: UsdValidationValidatorTask | undefined
  readonly #fixers: readonly UsdValidationFixer[]

  /** validator.cpp:15-19 (no task, as for a suite) and 21-52. */
  constructor(metadata: UsdValidationValidatorMetadata, task?: UsdValidationValidatorTask,
    fixers: readonly UsdValidationFixer[] = []) {
    this.#metadata = metadata.clone()
    this.#task = task
    this.#fixers = [...fixers]
    if (task) this.#validateFixerNames()
  }

  /** validator.cpp:54-69 (_ValidateFixerNames). */
  #validateFixerNames(): void {
    const fixerNames = new Set<string>()
    for (const fixer of this.#fixers) {
      if (fixerNames.has(fixer.getName())) {
        TF_CODING_ERROR(`Validator '${this.#metadata.name}' has multiple fixers with the `
          + `same name '${fixer.getName()}'. Fixer names must be unique per validator.`)
      } else {
        fixerNames.add(fixer.getName())
      }
    }
  }

  /** validator.h:158-161. */
  getMetadata(): UsdValidationValidatorMetadata {
    return this.#metadata
  }

  /** @internal validator.cpp:71-75 (_GetValidateLayerTask). */
  _getValidateLayerTask(): UsdValidateLayerTaskFn | undefined {
    return this.#task && 'layer' in this.#task ? this.#task.layer : undefined
  }

  /** @internal validator.cpp:77-81 (_GetValidateStageTask). */
  _getValidateStageTask(): UsdValidateStageTaskFn | undefined {
    return this.#task && 'stage' in this.#task ? this.#task.stage : undefined
  }

  /** @internal validator.cpp:83-87 (_GetValidatePrimTask). */
  _getValidatePrimTask(): UsdValidatePrimTaskFn | undefined {
    return this.#task && 'prim' in this.#task ? this.#task.prim : undefined
  }

  /** validator.cpp:89-98. */
  getFixers(): UsdValidationFixer[] {
    return [...this.#fixers]
  }

  /** validator.cpp:100-113. */
  getFixerByName(name: string): UsdValidationFixer | undefined {
    return this.#fixers.find(fixer => fixer.getName() === name)
  }

  /** validator.cpp:115-126. */
  getFixersByErrorName(errorName: string): UsdValidationFixer[] {
    return this.#fixers.filter(fixer => fixer.isAssociatedWithErrorName(errorName))
  }

  /** validator.cpp:128-141. */
  getFixerByNameAndErrorName(fixerName: string, errorName: string): UsdValidationFixer | undefined {
    return this.#fixers.find(fixer =>
      fixer.getName() === fixerName && fixer.isAssociatedWithErrorName(errorName))
  }

  /** validator.cpp:143-158: fixers with any of the keywords, each once. */
  getFixersByKeywords(keywords: readonly string[]): UsdValidationFixer[] {
    return this.#fixers.filter(fixer => keywords.some(keyword => fixer.hasKeyword(keyword)))
  }

  /**
   * validator.cpp:160-208: runs the task for the kind of object given (a
   * layer, a stage or a prim) and sets this validator on the errors it
   * reports. A validator without that kind of task reports no errors.
   * Resolves to the errors (PLATFORM-DIVERGENCE(usdValidation-async-validate)).
   */
  validate(layer: Layer): Promise<UsdValidationError[]>
  validate(stage: Stage, timeRange?: UsdValidationTimeRange): Promise<UsdValidationError[]>
  validate(prim: Prim, timeRange?: UsdValidationTimeRange): Promise<UsdValidationError[]>
  async validate(object: Layer | Stage | Prim,
    timeRange: UsdValidationTimeRange = new UsdValidationTimeRange()): Promise<UsdValidationError[]> {
    let errors: UsdValidationError[] | undefined
    if (object instanceof Layer) {
      errors = await this._getValidateLayerTask()?.(object)
    } else if (object instanceof Stage) {
      errors = await this._getValidateStageTask()?.(object, timeRange)
    } else if (object instanceof Prim) {
      errors = await this._getValidatePrimTask()?.(object, timeRange)
    }
    if (!errors) return []
    for (const error of errors) error._setValidator(this)
    return errors
  }
}

/**
 * A named group of validators, whose lifetime the registry manages
 * (validator.h:321-370).
 */
export class UsdValidationValidatorSuite {
  readonly #metadata: UsdValidationValidatorMetadata
  readonly #containedValidators: readonly UsdValidationValidator[]

  /** validator.cpp:210-216. */
  constructor(metadata: UsdValidationValidatorMetadata,
    validators: readonly UsdValidationValidator[]) {
    this.#metadata = metadata.clone()
    this.#containedValidators = [...validators]
  }

  /** validator.h:343-347. */
  getContainedValidators(): UsdValidationValidator[] {
    return [...this.#containedValidators]
  }

  /** validator.h:359-362. */
  getMetadata(): UsdValidationValidatorMetadata {
    return this.#metadata
  }
}
