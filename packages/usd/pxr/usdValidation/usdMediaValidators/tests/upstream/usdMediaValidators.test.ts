// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdMediaValidators/testenv/testUsdMediaValidators.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdMediaValidators/testenv/testUsdMediaValidators.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order. Layer and reference
// edits are followed by `await stage.flushChanges()` (change processing is
// asynchronous here), and an SdfTokenListOp info value is authored in its
// value form, SdfListOp.toValue().
import { describe, expect, it } from 'vitest'
import { Layer, ListOp } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { AuthorshipAPI as UsdMediaAuthorshipAPI } from 'typescript-usd/usdMedia'
import { ValidationErrorType, ValidationRegistry, type Validator } from 'typescript-usd/usdValidation'
import {
  ValidationErrorNameTokens as UsdMediaValidationErrorNameTokens,
  ValidatorNameTokens as UsdMediaValidatorNameTokens,
} from '../../src/index.ts'

// testUsdMediaValidators.cpp:31-33.
const _tokens = { usdMediaValidatorsPlugin: 'usdMediaValidators' }

// testUsdMediaValidators.cpp:35-42.
function _getValidator(name: string): Validator {
  const validator = ValidationRegistry.getInstance().getOrLoadValidatorByName(name)
  expect(validator).toBeDefined()
  return validator!
}

// testUsdMediaValidators.cpp:44-48.
function _errorId(validatorName: string, errorName: string): string {
  return `${validatorName}.${errorName}`
}

describe('testUsdMediaValidators', () => {
  // testUsdMediaValidators.cpp:50-63.
  it('TestUsdMediaValidatorsRegistered', () => {
    const metadata = ValidationRegistry.getInstance().getValidatorMetadataForPlugin(
      _tokens.usdMediaValidatorsPlugin)
    expect(new Set(metadata.map(m => m.name))).toEqual(new Set([
      UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship,
      UsdMediaValidatorNameTokens.authorshipInputsPaired]))
  })

  // testUsdMediaValidators.cpp:65-76.
  it('TestShadowedOrDuplicateCleanPrim', async () => {
    const validator = _getValidator(UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship)
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Bunny')
    UsdMediaAuthorshipAPI.apply(prim, 'mymodel')
    expect(await validator.validate(prim)).toEqual([])
  })

  // testUsdMediaValidators.cpp:78-108: An explicit apiSchemas list on a
  // referencing prim can shadow an application coming from the reference
  // target.
  it('TestShadowedApplicationIsFlagged', async () => {
    const validator = _getValidator(UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship)

    const asset = Layer.createAnonymous('asset.usda')
    const assetStage = await Stage.open(asset)
    const rock = assetStage.definePrim('/RockLarge')
    UsdMediaAuthorshipAPI.apply(rock, 'rockmaker')
    assetStage.setDefaultPrim(rock)

    const root = Layer.createAnonymous('scene.usda')
    const stage = await Stage.open(root)
    const referencing = stage.definePrim('/World/Rock_1')
    await referencing.getReferences().addReference(asset.identifier)

    root.getPrimAtPath('/World/Rock_1')!.setInfo(
      'apiSchemas', ListOp.createExplicit(['AuthorshipAPI:layout']).toValue())
    await stage.flushChanges()

    const errors = await validator.validate(referencing)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getIdentifier()).toBe(_errorId(
      UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship,
      UsdMediaValidationErrorNameTokens.shadowedAuthorshipApplication))
    expect(errors[0]!.getType()).toBe(ValidationErrorType.Warn)
  })

  // testUsdMediaValidators.cpp:110-134: The same instance applied in two
  // contributing layers is one composed record, but two contributing specs.
  it('TestDuplicateApplicationIsFlagged', async () => {
    const validator = _getValidator(UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship)

    const weak = Layer.createAnonymous('weak.usda')
    const weakStage = await Stage.open(weak)
    UsdMediaAuthorshipAPI.apply(weakStage.definePrim('/Bunny'), 'blender')

    const strong = Layer.createAnonymous('strong.usda')
    strong.insertSubLayerPath(weak.identifier)
    const stage = await Stage.open(strong)
    const prim = stage.getPrim('/Bunny')!
    UsdMediaAuthorshipAPI.apply(prim, 'blender')

    const errors = await validator.validate(prim)
    expect(errors.length).toBe(1)
    expect(errors[0]!.getIdentifier()).toBe(_errorId(
      UsdMediaValidatorNameTokens.shadowedOrDuplicateAuthorship,
      UsdMediaValidationErrorNameTokens.duplicateAuthorshipApplication))
  })

  // testUsdMediaValidators.cpp:136-170.
  it('TestInputsPaired', async () => {
    const validator = _getValidator(UsdMediaValidatorNameTokens.authorshipInputsPaired)

    const stage = Stage.createNew()
    const prim = stage.definePrim('/Bunny')
    const record = UsdMediaAuthorshipAPI.apply(prim, 'gen')

    // The schema declares (name, value) pairs.
    expect(record.getInputsAttr().getArraySizeConstraint()).toBe(-2)

    // Unauthored.
    expect(await validator.validate(prim)).toEqual([])

    // Odd length.
    record.createInputsAttr(['prompt', 'A fluffy bunny', 'seed'])
    {
      const errors = await validator.validate(prim)
      expect(errors.length).toBe(1)
      expect(errors[0]!.getIdentifier()).toBe(_errorId(
        UsdMediaValidatorNameTokens.authorshipInputsPaired,
        UsdMediaValidationErrorNameTokens.unpairedAuthorshipInputs))
      expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
    }

    // Complete pairs.
    record.getInputsAttr().set(['prompt', 'A fluffy bunny', 'seed', '1234'])
    expect(await validator.validate(prim)).toEqual([])
  })
})
