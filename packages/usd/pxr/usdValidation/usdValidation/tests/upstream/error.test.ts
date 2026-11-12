// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidationError.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationError.py.
//
// Spec, prim and property handles are compared by what they refer to (the
// Python == on handles); an absent spec is undefined (Python None) and an
// invalid UsdPrim/UsdProperty is undefined. Left out:
// test_CreateErrorSiteWithInvalidArgs and
// test_CreateValidationErrorWithInvalidArgs (wrong argument types, which the
// TypeScript types reject).
import { describe, expect, it } from 'vitest'
import type { Layer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import { Stage } from 'typescript-usd/usd'
import { ValidationError, ValidationErrorSite, ValidationErrorType } from '../../src/index.ts'

const isPropertyPath = (path: string): boolean => path.includes('.')
const isPrimPath = (path: string): boolean => !isPropertyPath(path)

type Spec = { getPath(): { pathString: string }, getLayer(): unknown } | undefined
function expectSameSpec(actual: Spec, expected: Spec): void {
  if (expected === undefined) {
    expect(actual).toBeUndefined()
    return
  }
  expect(actual?.getPath().pathString).toBe(expected.getPath().pathString)
  expect(actual?.getLayer()).toBe(expected.getLayer())
}

type UsdObj = { isValid(): boolean, getStage(): unknown }
const objPath = (o: UsdObj): string => {
  const fields = o as { path?: string, primPath?: string, name?: string }
  return fields.path ?? `${fields.primPath}.${fields.name}`
}
function expectSameObject(actual: UsdObj | undefined, expected: UsdObj | undefined): void {
  if (expected === undefined || !expected.isValid()) {
    expect(actual?.isValid() ?? false).toBe(false)
    return
  }
  expect(actual).toBeDefined()
  expect(objPath(actual!)).toBe(objPath(expected))
  expect(actual!.getStage()).toBe(expected.getStage())
}

// testUsdValidationError.py:32-49.
function _verifyErrorSiteWithLayer(errorSite: ValidationErrorSite, layer: Layer, objectPath: string): void {
  expect(errorSite.isValid()).toBe(true)
  expect(errorSite.isValidSpecInLayer()).toBe(true)
  expect(errorSite.isPrim()).toBe(false)
  expect(errorSite.isProperty()).toBe(false)
  const expectedPropertySpec = isPropertyPath(objectPath) ? layer.getPropertyAtPath(objectPath) : undefined
  expectSameSpec(errorSite.getPropertySpec(), expectedPropertySpec)
  const expectedPrimSpec = isPrimPath(objectPath) ? layer.getPrimAtPath(objectPath) : undefined
  expectSameSpec(errorSite.getPrimSpec(), expectedPrimSpec)
  expect(errorSite.getProperty()).toBeFalsy()
  expect(errorSite.getPrim()).toBeFalsy()
  expect(errorSite.getLayer()).toBe(layer)
  expect(errorSite.getStage()).toBeFalsy()
}

// testUsdValidationError.py:70-90.
function _verifyErrorSiteWithStage(errorSite: ValidationErrorSite, stage: Stage, objectPath: string): void {
  expect(errorSite.isValid()).toBe(true)
  expect(errorSite.isValidSpecInLayer()).toBe(false)
  expect(errorSite.isPrim()).toBe(isPrimPath(objectPath))
  expect(errorSite.isProperty()).toBe(isPropertyPath(objectPath))
  expect(errorSite.getPropertySpec()).toBeFalsy()
  expect(errorSite.getPrimSpec()).toBeFalsy()
  const expectedProperty = isPropertyPath(objectPath) ? stage.getPropertyAtPath(objectPath) : undefined
  expectSameObject(errorSite.getProperty(), expectedProperty)
  const expectedPrim = isPrimPath(objectPath) ? stage.getPrim(objectPath) : undefined
  expectSameObject(errorSite.getPrim(), expectedPrim)
  expect(errorSite.getLayer()).toBeFalsy()
  expect(errorSite.getStage()).toBe(stage)
}

// testUsdValidationError.py:92-115.
function _verifyErrorSiteWithStageAndLayer(errorSite: ValidationErrorSite, stage: Stage, layer: Layer,
  objectPath: string): void {
  expect(errorSite.isValid()).toBe(true)
  expect(errorSite.isValidSpecInLayer()).toBe(true)
  expect(errorSite.isPrim()).toBe(isPrimPath(objectPath))
  expect(errorSite.isProperty()).toBe(isPropertyPath(objectPath))
  const expectedPropertySpec = isPropertyPath(objectPath) ? layer.getPropertyAtPath(objectPath) : undefined
  expectSameSpec(errorSite.getPropertySpec(), expectedPropertySpec)
  const expectedPrimSpec = isPrimPath(objectPath) ? layer.getPrimAtPath(objectPath) : undefined
  expectSameSpec(errorSite.getPrimSpec(), expectedPrimSpec)
  const expectedProperty = isPropertyPath(objectPath) ? stage.getPropertyAtPath(objectPath) : undefined
  expectSameObject(errorSite.getProperty(), expectedProperty)
  const expectedPrim = isPrimPath(objectPath) ? stage.getPrim(objectPath) : undefined
  expectSameObject(errorSite.getPrim(), expectedPrim)
  expect(errorSite.getLayer()).toBe(layer)
  expect(errorSite.getStage()).toBe(stage)
}

interface ErrorArgs {
  name?: string
  errorType?: ValidationErrorType
  errorSites?: ValidationErrorSite[]
  errorMessage?: string
}

// testUsdValidationError.py:166-191.
function _verifyValidationError(error: ValidationError, {
  name = '', errorType = ValidationErrorType.None, errorSites = [], errorMessage = '',
}: ErrorArgs = {}): void {
  expect(error.getName()).toBe(name)
  expect(error.getType()).toBe(errorType)
  const sites = error.getSites()
  expect(sites.length).toBe(errorSites.length)
  sites.forEach((site, i) => expect(site.equals(errorSites[i]!)).toBe(true))
  expect(error.getMessage()).toBe(errorMessage)
  if (errorType !== ValidationErrorType.None) {
    expect(error.getErrorAsString()).toBeTruthy()
    expect(error.hasNoError()).toBe(false)
  } else {
    expect(error.getErrorAsString()).toBeFalsy()
    expect(error.hasNoError()).toBe(true)
  }
  // check if coding error is raised for these errors when trying to get
  // its identifier
  const m = new TfErrorMark()
  error.getIdentifier()
  const expectedErrorStr = 'Validator not set on ValidationError. Possibly this validation '
    + 'error was not created via a call to '
    + 'UsdValidationValidator::Validate(), which is responsible to set '
    + 'the validator on the error.'
  const errors = m.getErrors()
  expect(errors.length).toBe(1)
  expect(errors[0]!.getCommentary()).toContain(expectedErrorStr)
  m.clear()
}

describe('TestUsdValidationError', () => {
  it('test_CreateDefaultErrorSite', () => {
    const errorSite = new ValidationErrorSite()
    expect(errorSite.isValid()).toBe(false)
    expect(errorSite.isValidSpecInLayer()).toBe(false)
    expect(errorSite.isPrim()).toBe(false)
    expect(errorSite.isProperty()).toBe(false)
    expect(errorSite.getPropertySpec()).toBeFalsy()
    expect(errorSite.getPrimSpec()).toBeFalsy()
    expect(errorSite.getProperty()).toBeFalsy()
    expect(errorSite.getPrim()).toBeFalsy()
    expect(errorSite.getLayer()).toBeFalsy()
    expect(errorSite.getStage()).toBeFalsy()
  })

  it('test_CreateErrorSiteWithLayerAndPrimSpec', () => {
    const stage = Stage.createNew()
    const testPrimPath = '/test'
    stage.definePrim(testPrimPath, 'Xform')
    const errorSite = new ValidationErrorSite(stage.getRootLayer(), testPrimPath)
    _verifyErrorSiteWithLayer(errorSite, stage.getRootLayer(), testPrimPath)
  })

  it('test_CreateErrorSiteWithLayerAndPropertySpec', () => {
    const stage = Stage.createNew()
    const testPrimPath = '/test'
    const testPrim = stage.definePrim(testPrimPath, 'Xform')
    testPrim.createAttribute('attr', 'int')
    const testAttrPath = '/test.attr'
    const errorSite = new ValidationErrorSite(stage.getRootLayer(), testAttrPath)
    _verifyErrorSiteWithLayer(errorSite, stage.getRootLayer(), testAttrPath)
  })

  it('test_CreateErrorSiteWithStageAndPrim', () => {
    const stage = Stage.createNew()
    const testPrimPath = '/test'
    stage.definePrim(testPrimPath, 'Xform')
    let errorSite = new ValidationErrorSite(stage, testPrimPath)
    _verifyErrorSiteWithStage(errorSite, stage, testPrimPath)
    // With layer also
    errorSite = new ValidationErrorSite(stage, testPrimPath, stage.getRootLayer())
    _verifyErrorSiteWithStageAndLayer(errorSite, stage, stage.getRootLayer(), testPrimPath)
  })

  it('test_CreateErrorSiteWithStageAndProperty', () => {
    const stage = Stage.createNew()
    const testPrimPath = '/test'
    const testPrim = stage.definePrim(testPrimPath, 'Xform')
    testPrim.createAttribute('attr', 'int')
    const testAttrPath = '/test.attr'
    let errorSite = new ValidationErrorSite(stage, testAttrPath)
    _verifyErrorSiteWithStage(errorSite, stage, testAttrPath)
    // With layer also
    errorSite = new ValidationErrorSite(stage, testAttrPath, stage.getRootLayer())
    _verifyErrorSiteWithStageAndLayer(errorSite, stage, stage.getRootLayer(), testAttrPath)
  })

  it('test_CreateDefaultValidationError', () => {
    const validationError = new ValidationError()
    _verifyValidationError(validationError)
  })

  it('test_CreateValidationErrorWithKeywordArgs', () => {
    const errors: Required<ErrorArgs>[] = [
      { name: 'error1', errorType: ValidationErrorType.None, errorSites: [], errorMessage: '' },
      {
        name: 'error2', errorType: ValidationErrorType.Error,
        errorSites: [new ValidationErrorSite()], errorMessage: 'This is an error.',
      },
      {
        name: 'error3', errorType: ValidationErrorType.Warn,
        errorSites: [new ValidationErrorSite()], errorMessage: 'This is a warning.',
      },
      {
        name: 'error4', errorType: ValidationErrorType.Info,
        errorSites: [new ValidationErrorSite(), new ValidationErrorSite()], errorMessage: 'This is an info.',
      },
    ]
    for (const error of errors) {
      const validationError = new ValidationError(error.name, error.errorType, error.errorSites,
        error.errorMessage)
      _verifyValidationError(validationError, error)
    }
  })
})
