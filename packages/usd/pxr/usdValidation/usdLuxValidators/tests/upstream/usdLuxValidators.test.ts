// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLuxValidators/testenv/testUsdLuxValidators.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdLuxValidators/testenv/testUsdLuxValidators.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order. The test links usdGeom
// for UsdGeomScope; here its module registers it.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Scope as UsdGeomScope } from 'typescript-usd/usdGeom'
import {
  DistantLight as UsdLuxDistantLight, DomeLight as UsdLuxDomeLight, LightFilter as UsdLuxLightFilter,
  PortalLight as UsdLuxPortalLight, SphereLight as UsdLuxSphereLight,
} from 'typescript-usd/usdLux'
import {
  Material as UsdShadeMaterial, NodeGraph as UsdShadeNodeGraph, Shader as UsdShadeShader,
} from 'typescript-usd/usdShade'
import {
  ValidationErrorType, ValidationRegistry, type ValidationError,
} from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdLuxValidatorNameTokens } from '../../src/index.ts'

// testUsdLuxValidators.cpp:31-33.
const _tokens = { usdLuxValidatorsPlugin: 'usdLuxValidators' }

// testUsdLuxValidators.cpp:62-79.
function validatePrimError(error: ValidationError, expectedErrorIdentifier: string,
  expectedPrimPaths: string[], expectedErrorMsg: string,
  expectedErrorType: ValidationErrorType = ValidationErrorType.Error): void {
  expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
  expect(error.getType()).toBe(expectedErrorType)
  expect(error.getSites().length).toBe(expectedPrimPaths.length)
  error.getSites().forEach((errorSite, index) => {
    expect(errorSite.isValid()).toBe(true)
    expect(errorSite.isPrim()).toBe(true)
    expect(errorSite.getPrim()!.path).toBe(expectedPrimPaths[index])
  })
  expect(error.getMessage()).toBe(expectedErrorMsg)
}

describe('testUsdLuxValidators', () => {
  // testUsdLuxValidators.cpp:35-60.
  it('TestUsdLuxValidators', () => {
    // This should be updated with every new validator added with the
    // UsdLuxValidators keyword.
    const expectedUsdLuxValidatorNames = new Set([UsdLuxValidatorNameTokens.encapsulationValidator])
    const registry = ValidationRegistry.getInstance()
    const metadata = registry.getValidatorMetadataForPlugin(_tokens.usdLuxValidatorsPlugin)
    expect(metadata.length).toBe(1)
    expect(new Set(metadata.map(m => m.name))).toEqual(expectedUsdLuxValidatorNames)
  })

  // testUsdLuxValidators.cpp:81-243.
  it('TestUsdLuxEncapsulationRulesValidator', async () => {
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdLuxValidatorNameTokens.encapsulationValidator)
    expect(validator).toBeDefined()

    const usdStage = Stage.createNew()

    // Test a LightFilter under a connectable but non-container parent, which
    // should fail validation
    UsdShadeShader.define(usdStage, '/Shader')
    const lightFilter = UsdLuxLightFilter.define(usdStage, '/Shader/LightFilter')
    {
      const errors = await validator!.validate(lightFilter.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLuxValidators:EncapsulationRulesValidator.ConnectableInNonContainer',
        ['/Shader/LightFilter'],
        'Connectable LightFilter </Shader/LightFilter> cannot reside '
        + 'under a non-Container Connectable Shader')
    }

    // Test a LightFilter under a non-connectable parent, which is under a
    // connectable and container light.
    UsdLuxSphereLight.define(usdStage, '/SphereLight')
    UsdGeomScope.define(usdStage, '/SphereLight/Scope')
    const lightFilter2 = UsdLuxLightFilter.define(usdStage, '/SphereLight/Scope/LightFilter')
    {
      const errors = await validator!.validate(lightFilter2.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLuxValidators:EncapsulationRulesValidator.InvalidConnectableHierarchy',
        ['/SphereLight/Scope/LightFilter'],
        'Connectable LightFilter </SphereLight/Scope/LightFilter> can '
        + 'only have Connectable Container ancestors up to SphereLight '
        + 'ancestor </SphereLight>, but its parent Scope is a Scope.')
    }

    // But a LightFilter under a non-connectable parent, should be just fine.
    UsdGeomScope.define(usdStage, '/Scope')
    const lightFilter4 = UsdLuxLightFilter.define(usdStage, '/Scope/LightFilter')
    {
      expect(await validator!.validate(lightFilter4.prim)).toEqual([])
    }

    // Test a Light under another Light -- this is allowed as in the case of
    // DomeLight and PortalLight for example
    const domeLight = UsdLuxDomeLight.define(usdStage, '/DomeLight')
    const portalLight = UsdLuxPortalLight.define(usdStage, '/DomeLight/PortalLight')
    {
      expect(await validator!.validate(domeLight.prim)).toEqual([])
    }
    {
      expect(await validator!.validate(portalLight.prim)).toEqual([])
    }

    // Test a LightFilter under a connectable and container light parent, which
    // should pass validation
    UsdLuxDistantLight.define(usdStage, '/DistantLight')
    const lightFilter3 = UsdLuxLightFilter.define(usdStage, '/DistantLight/LightFilter')
    {
      expect(await validator!.validate(lightFilter3.prim)).toEqual([])
    }

    // Test a Light under LightFilter
    const distantLight3 = UsdLuxDistantLight.define(usdStage, '/DistantLight/LightFilter/DistantLight')
    {
      const errors = await validator!.validate(distantLight3.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLuxValidators:EncapsulationRulesValidator.LightUnderConnectable',
        ['/DistantLight/LightFilter/DistantLight'],
        'Light DistantLight </DistantLight/LightFilter/DistantLight> '
        + 'cannot have a connectable parent LightFilter '
        + '</DistantLight/LightFilter>.')
    }

    // Test a LightFilter under another LightFilter
    const lightFilter5 = UsdLuxLightFilter.define(usdStage, '/DistantLight/LightFilter/LightFilter')
    {
      expect(await validator!.validate(lightFilter5.prim)).toEqual([])
    }

    // Test a LightFilter under a UsdShadeNodeGraph, which is a connectable and
    // container parent, should be fine
    UsdShadeNodeGraph.define(usdStage, '/NodeGraph')
    const lightFilter7 = UsdLuxLightFilter.define(usdStage, '/NodeGraph/LightFilter')
    {
      expect(await validator!.validate(lightFilter7.prim)).toEqual([])
    }

    // Test a LightFilter under a Material, which is a connectable and container
    UsdShadeMaterial.define(usdStage, '/Material')
    const lightFilter6 = UsdLuxLightFilter.define(usdStage, '/Material/LightFilter')
    {
      const errors = await validator!.validate(lightFilter6.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLuxValidators:EncapsulationRulesValidator.LightFilterUnderLightFilter',
        ['/Material/LightFilter'],
        'LightFilter </Material/LightFilter> cannot have a parent '
        + '</Material> that is a UsdShadeMaterial.')
    }
  })
})
