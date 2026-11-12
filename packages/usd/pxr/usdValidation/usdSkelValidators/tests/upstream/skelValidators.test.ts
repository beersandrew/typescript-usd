// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdSkelValidators/testenv/testUsdSkelValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdSkelValidators/testenv/testUsdSkelValidators.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Mesh, PrimvarsAPI } from 'typescript-usd/usdGeom'
import { BindingAPI as UsdSkelBindingAPI, Root as UsdSkelRoot } from 'typescript-usd/usdSkel'
import { ValidationErrorType, ValidationRegistry } from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdSkelValidatorNameTokens } from '../../src/index.ts'

// testUsdSkelValidators.cpp:19-21.
const _tokens = { usdSkelValidatorsPlugin: 'usdSkelValidators' }

describe('testUsdSkelValidators', () => {
  // testUsdSkelValidators.cpp:23-46.
  it('TestUsdSkelValidators', () => {
    // This should be updated with every new validator added with
    // UsdSkelValidators keyword.
    const registry = ValidationRegistry.getInstance()
    const metadata = registry.getValidatorMetadataForPlugin(_tokens.usdSkelValidatorsPlugin)
    expect(metadata.length).toBe(2)
    // Since other validators can be registered with a UsdSkelValidators
    // keyword, our validators registered in usdSkelValidators are a subset of
    // the entire set.
    const validatorMetadataNameSet = new Set(metadata.map(m => m.name))

    const expectedValidatorNames = new Set([
      UsdSkelValidatorNameTokens.skelBindingApiAppliedValidator,
      UsdSkelValidatorNameTokens.skelBindingApiValidator])

    expect(validatorMetadataNameSet).toEqual(expectedValidatorNames)
  })

  // testUsdSkelValidators.cpp:48-124.
  it('TestUsdSkelBindingApiAppliedValidator', async () => {
    // Verify that the validator exists.
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(
      UsdSkelValidatorNameTokens.skelBindingApiAppliedValidator)
    expect(validator).toBeDefined()

    // Create Stage and mesh with a skel binding property
    const usdStage = Stage.createNew()
    const mesh = Mesh.define(usdStage, '/SkelRoot/Mesh')
    const primvarsApi = new PrimvarsAPI(mesh.prim, usdStage)
    const jointIndicesPrimvar = primvarsApi.createPrimvar('skel:jointIndices', 'int[]', 'vertex')
    jointIndicesPrimvar.set([0, 1, 2])

    let errors = await validator!.validate(mesh.prim)

    let expectedErrorIdentifier = 'usdSkelValidators:SkelBindingApiAppliedValidator.MissingSkelBindingAPI'
    // Verify the error for not having the SkelBindingAPI schema applied is
    // present.
    expect(errors.length).toBe(1)
    expect(errors[0]!.getIdentifier()).toBe(expectedErrorIdentifier)
    expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
    expect(errors[0]!.getSites().length).toBe(1)
    expect(errors[0]!.getSites()[0]!.isValid()).toBe(true)
    expect(errors[0]!.getSites()[0]!.isPrim()).toBe(true)
    expect(errors[0]!.getSites()[0]!.getPrim()!.path).toBe('/SkelRoot/Mesh')
    let expectedErrorMsg = 'Found a UsdSkelBinding property '
      + '(primvars:skel:jointIndices), but no '
      + 'SkelBindingAPI applied on the prim '
      + '</SkelRoot/Mesh>.'
    expect(errors[0]!.getMessage()).toBe(expectedErrorMsg)

    // Apply the SkelBindingAPI.
    UsdSkelBindingAPI.apply(mesh.prim)
    errors = await validator!.validate(mesh.prim)
    // Verify all errors are gone
    expect(errors).toEqual([])

    const skelBindingApiValidator = registry.getOrLoadValidatorByName(
      UsdSkelValidatorNameTokens.skelBindingApiValidator)
    errors = await skelBindingApiValidator!.validate(mesh.prim)

    expectedErrorIdentifier = 'usdSkelValidators:SkelBindingApiValidator.InvalidSkelBindingAPIApply'
    // Verify the error for not having a SkelRoot parenting a prim with the
    // SkelBindingAPI applied.
    expect(errors.length).toBe(1)
    expect(errors[0]!.getIdentifier()).toBe(expectedErrorIdentifier)
    expect(errors[0]!.getType()).toBe(ValidationErrorType.Error)
    expect(errors[0]!.getSites().length).toBe(1)
    expect(errors[0]!.getSites()[0]!.isValid()).toBe(true)
    expect(errors[0]!.getSites()[0]!.isPrim()).toBe(true)
    expect(errors[0]!.getSites()[0]!.getPrim()!.path).toBe('/SkelRoot/Mesh')
    expectedErrorMsg = 'UsdSkelBindingAPI applied on prim: </SkelRoot/Mesh>, '
      + 'which is not of type SkelRoot or is not rooted at a prim '
      + 'of type SkelRoot, as required by the UsdSkel schema.'
    expect(errors[0]!.getMessage()).toBe(expectedErrorMsg)

    // Add SkelRoot as a parent to the mesh.
    UsdSkelRoot.define(usdStage, '/SkelRoot')
    errors = await skelBindingApiValidator!.validate(mesh.prim)

    // Verify all errors are gone
    expect(errors).toEqual([])
  })
})
