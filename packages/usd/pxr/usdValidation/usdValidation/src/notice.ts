// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/notice.cpp,
//  pxr/usdValidation/usdValidation/notice.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/notice.{h,cpp}.
import { Notice as TfNotice } from 'typescript-usd/tf'
import type { UsdValidationValidator, UsdValidationValidatorSuite } from './validator.ts'

/** Notices UsdValidationRegistry sends (notice.h:20-66). */
export namespace UsdValidationNotice {
  /** Sent when a validator is registered dynamically, outside plugin
   *  registration (notice.h:28-44, registry.cpp:339-350). */
  export class DidRegisterValidator extends TfNotice {
    readonly #registeredValidator: UsdValidationValidator
    constructor(registeredValidator: UsdValidationValidator) {
      super()
      this.#registeredValidator = registeredValidator
    }
    getValidator(): UsdValidationValidator { return this.#registeredValidator }
  }

  /** Sent when a validator suite is registered dynamically (notice.h:48-64,
   *  registry.cpp:572-584). */
  export class DidRegisterValidatorSuite extends TfNotice {
    readonly #registeredSuite: UsdValidationValidatorSuite
    constructor(registeredSuite: UsdValidationValidatorSuite) {
      super()
      this.#registeredSuite = registeredSuite
    }
    getValidatorSuite(): UsdValidationValidatorSuite { return this.#registeredSuite }
  }
}
