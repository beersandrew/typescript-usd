// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/error.cpp,
//  pxr/usdValidation/usdValidation/error.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/error.{h,cpp}.
import { Layer, type PrimSpec as SdfPrimSpec, type PropertySpec as SdfPropertySpec } from 'typescript-usd/sdf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { Stage, type Attribute, type Prim, type Rel as UsdRel } from 'typescript-usd/usd'
import { TF_CODING_ERROR } from 'typescript-usd/tf'
import type { UsdValidationFixer } from './fixer.ts'
import type { UsdValidationValidator } from './validator.ts'

/** error.h:28-52. */
export enum UsdValidationErrorType {
  None = 0,
  Error,
  Warn,
  Info,
}

// error.cpp:18-24 (TF_ADD_ENUM_NAME): the display names GetErrorAsString uses.
const _errorTypeDisplayNames: Record<UsdValidationErrorType, string> = {
  [UsdValidationErrorType.None]: 'None',
  [UsdValidationErrorType.Error]: 'Error',
  [UsdValidationErrorType.Warn]: 'Warn',
  [UsdValidationErrorType.Info]: 'Info',
}

// error.cpp:16 (_tokens->ValidationErrorNameDelimiter).
const _validationErrorNameDelimiter = '.'

function _pathString(path: string | SdfPath | undefined): string {
  return path === undefined ? '' : typeof path === 'string' ? path : path.pathString
}

/**
 * Where a validation error is: a path in a layer, or on a stage, with an
 * optional layer (error.h:54-224).
 */
export class UsdValidationErrorSite {
  readonly #stage: Stage | undefined
  readonly #layer: Layer | undefined
  readonly #objectPath: string

  /** error.h:66 (default), error.cpp:26-31 (layer) and 33-40 (stage). */
  constructor()
  constructor(layer: Layer, objectPath: string | SdfPath)
  constructor(stage: Stage, objectPath: string | SdfPath, layer?: Layer)
  constructor(stageOrLayer?: Stage | Layer, objectPath?: string | SdfPath, layer?: Layer) {
    if (stageOrLayer instanceof Stage) {
      this.#stage = stageOrLayer
      this.#layer = layer
    } else {
      this.#stage = undefined
      this.#layer = stageOrLayer
    }
    this.#objectPath = _pathString(objectPath)
  }

  /** error.h:96-99. */
  isValid(): boolean {
    return this.isValidSpecInLayer() || this.isPrim() || this.isProperty()
  }

  /** error.h:103-109. */
  isValidSpecInLayer(): boolean {
    if (!this.#layer || this.#objectPath === '') return false
    return this.#layer.hasSpec(this.#objectPath)
  }

  /** error.h:113-116. */
  isPrim(): boolean {
    return this.getPrim()?.isValid() ?? false
  }

  /** error.h:120-123. */
  isProperty(): boolean {
    return this.getProperty()?.isValid() ?? false
  }

  /** error.h:128-134. */
  getPropertySpec(): SdfPropertySpec | undefined {
    if (!this.#layer || this.#objectPath === '') return undefined
    return this.#layer.getPropertyAtPath(this.#objectPath)
  }

  /** error.h:139-145. */
  getPrimSpec(): SdfPrimSpec | undefined {
    if (!this.#layer || this.#objectPath === '') return undefined
    return this.#layer.getPrimAtPath(this.#objectPath)
  }

  getLayer(): Layer | undefined { return this.#layer }
  getStage(): Stage | undefined { return this.#stage }

  /** The site's path (error.h:217, _objectPath). */
  getPath(): string { return this.#objectPath }

  /** error.h:163-169. */
  getPrim(): Prim | undefined {
    if (!this.#stage || this.#objectPath === '') return undefined
    return this.#stage.getPrim(this.#objectPath)
  }

  /** error.h:173-179. */
  getProperty(): Attribute | UsdRel | undefined {
    if (!this.#stage || this.#objectPath === '') return undefined
    return this.#stage.getPropertyAtPath(this.#objectPath)
  }

  /** error.h:183-188. */
  equals(other: UsdValidationErrorSite): boolean {
    return this.#layer === other.#layer && this.#stage === other.#stage
      && this.#objectPath === other.#objectPath
  }
}

/**
 * An error a validator's task reports, with the validator that reported it
 * once UsdValidationValidator.validate has set it (error.h:226-410).
 */
export class UsdValidationError {
  // error.cpp:42-60: set by UsdValidationValidator.validate.
  #validator: UsdValidationValidator | undefined = undefined
  readonly #name: string
  readonly #errorType: UsdValidationErrorType
  readonly #errorSites: readonly UsdValidationErrorSite[]
  readonly #errorMsg: string
  readonly #data: unknown

  /** error.cpp:42-46 (default: no error) and 48-60. */
  constructor(name = '', errorType: UsdValidationErrorType = UsdValidationErrorType.None,
    errorSites: readonly UsdValidationErrorSite[] = [], errorMsg = '', data?: unknown) {
    this.#name = name
    this.#errorType = errorType
    this.#errorSites = [...errorSites]
    this.#errorMsg = errorMsg
    this.#data = data
  }

  /** error.h:252-260. */
  equals(other: UsdValidationError): boolean {
    return this.#name === other.#name && this.#errorType === other.#errorType
      && this.#errorSites.length === other.#errorSites.length
      && this.#errorSites.every((site, i) => site.equals(other.#errorSites[i]!))
      && this.#errorMsg === other.#errorMsg && this.#validator === other.#validator
  }

  getName(): string { return this.#name }
  getType(): UsdValidationErrorType { return this.#errorType }
  getSites(): UsdValidationErrorSite[] { return [...this.#errorSites] }
  getValidator(): UsdValidationValidator | undefined { return this.#validator }
  getMessage(): string { return this.#errorMsg }
  getData(): unknown { return this.#data }

  /** error.cpp:62-83: "<validator name>.<error name>", or the validator's
   *  name when the error has none. */
  getIdentifier(): string {
    if (!this.#validator) {
      TF_CODING_ERROR('Validator not set on ValidationError. Possibly this '
        + 'validation error was not created via a call to '
        + 'UsdValidationValidator::Validate(), which is '
        + 'responsible to set the validator on the error.')
      return ''
    }
    if (this.#name === '') return this.#validator.getMetadata().name
    return this.#validator.getMetadata().name + _validationErrorNameDelimiter + this.#name
  }

  /** error.cpp:85-101. */
  getErrorAsString(): string {
    if (this.#errorType === UsdValidationErrorType.None) return this.#errorMsg
    const typeName = _errorTypeDisplayNames[this.#errorType]
    return this.#validator
      ? `${typeName}: (${this.getIdentifier()}) ${this.#errorMsg}`
      : `${typeName}: ${this.#errorMsg}`
  }

  /** error.h:331-335. */
  hasNoError(): boolean {
    return this.#errorType === UsdValidationErrorType.None
  }

  /** error.cpp:103-110. */
  getFixers(): UsdValidationFixer[] {
    return this.#validator?.getFixers() ?? []
  }

  /** error.cpp:112-119. */
  getFixerByName(name: string): UsdValidationFixer | undefined {
    return this.#validator?.getFixerByName(name)
  }

  /** error.cpp:121-128: the fixers for this error's name. */
  getFixersByErrorName(): UsdValidationFixer[] {
    return this.#validator?.getFixersByErrorName(this.#name) ?? []
  }

  /** error.cpp:130-137. */
  getFixerByNameAndErrorName(name: string): UsdValidationFixer | undefined {
    return this.#validator?.getFixerByNameAndErrorName(name, this.#name)
  }

  /** error.cpp:139-146. */
  getFixersByKeywords(keywords: readonly string[]): UsdValidationFixer[] {
    return this.#validator?.getFixersByKeywords(keywords) ?? []
  }

  /** @internal error.cpp:148-152 (_SetValidator, for
   *  UsdValidationValidator.validate). */
  _setValidator(validator: UsdValidationValidator): void {
    this.#validator = validator
  }
}
