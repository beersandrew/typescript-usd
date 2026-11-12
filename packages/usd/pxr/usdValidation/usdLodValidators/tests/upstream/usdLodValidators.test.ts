// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLodValidators/testenv/testUsdLodValidators.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdLodValidators/testenv/testUsdLodValidators.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order. VtArray and token
// values are set as plain JS values; the attribute's type converts them.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  DistanceHeuristic as UsdLodDistanceHeuristic, OverrideAPI as UsdLodOverrideAPI,
  RootAPI as UsdLodRootAPI, ScreenSizeHeuristic as UsdLodScreenSizeHeuristic, Tokens as UsdLodTokens,
} from 'typescript-usd/usdLod'
import {
  ValidationErrorType, ValidationRegistry, type ValidationError, type Validator,
} from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdLodValidatorNameTokens } from '../../src/index.ts'

// testUsdLodValidators.cpp:29-31.
const _tokens = { usdLodValidatorsPlugin: 'usdLodValidators' }

// testUsdLodValidators.cpp:33-50: Helper used by all per-prim error
// assertions.
function validatePrimError(error: ValidationError, expectedErrorIdentifier: string,
  expectedPrimPaths: string[], expectedErrorMsg: string,
  expectedErrorType: ValidationErrorType = ValidationErrorType.Error): void {
  expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
  expect(error.getType()).toBe(expectedErrorType)
  expect(error.getSites().length).toBe(expectedPrimPaths.length)
  error.getSites().forEach((site, i) => {
    expect(site.isValid()).toBe(true)
    expect(site.isPrim()).toBe(true)
    expect(site.getPrim()!.path).toBe(expectedPrimPaths[i])
  })
  expect(error.getMessage()).toBe(expectedErrorMsg)
}

function getValidator(name: string): Validator {
  const validator = ValidationRegistry.getInstance().getOrLoadValidatorByName(name)
  expect(validator).toBeDefined()
  return validator!
}

describe('testUsdLodValidators', () => {
  // testUsdLodValidators.cpp:52-77: Verify the expected set of validators is
  // registered for this plugin.
  it('TestUsdLodValidators', () => {
    const expectedNames = new Set([
      UsdLodValidatorNameTokens.heuristicLodDomain,
      UsdLodValidatorNameTokens.distanceHeuristicThresholds,
      UsdLodValidatorNameTokens.screenSizeHeuristicThresholds,
      UsdLodValidatorNameTokens.lodOverrideApiMode,
      UsdLodValidatorNameTokens.lodRootApiHeuristics,
    ])
    const metadata = ValidationRegistry.getInstance().getValidatorMetadataForPlugin(
      _tokens.usdLodValidatorsPlugin)
    expect(metadata.length).toBe(5)
    expect(new Set(metadata.map(m => m.name))).toEqual(expectedNames)
  })

  // testUsdLodValidators.cpp:79-111.
  it('TestHeuristicLodDomainValidator', async () => {
    const validator = getValidator(UsdLodValidatorNameTokens.heuristicLodDomain)
    const stage = Stage.createNew()

    // Valid: lod:domain is set.
    const distHeuristic = UsdLodDistanceHeuristic.define(stage, '/DistHeuristic')
    distHeuristic.getLodDomainAttr().set(UsdLodTokens.imaging)
    {
      expect(await validator.validate(distHeuristic.prim)).toEqual([])
    }

    // Invalid: lod:domain is empty (default for a new prim).
    const ssHeuristic = UsdLodScreenSizeHeuristic.define(stage, '/SsHeuristic')
    {
      const errors = await validator.validate(ssHeuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, 'usdLodValidators:HeuristicLodDomain.LodDomainEmpty',
        ['/SsHeuristic'], 'LODHeuristic </SsHeuristic> has an empty lod:domain.')
    }
  })

  // testUsdLodValidators.cpp:113-196.
  it('TestDistanceHeuristicThresholdsValidator', async () => {
    const validator = getValidator(UsdLodValidatorNameTokens.distanceHeuristicThresholds)
    const stage = Stage.createNew()
    const heuristic = UsdLodDistanceHeuristic.define(stage, '/Dist')
    heuristic.getLodDomainAttr().set(UsdLodTokens.imaging)

    // Valid: strictly increasing thresholds, valid blendThresholds.
    heuristic.getThresholdsAttr().set([10.0, 50.0, 100.0])
    heuristic.getBlendThresholdsAttr().set([15.0, 60.0, 110.0])
    {
      expect(await validator.validate(heuristic.prim)).toEqual([])
    }

    // Invalid: thresholds not strictly increasing.
    heuristic.getThresholdsAttr().set([10.0, 10.0, 100.0])
    heuristic.getBlendThresholdsAttr().set([])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:DistanceHeuristicThresholds.ThresholdsNotStrictlyIncreasing',
        ['/Dist'], 'LODDistanceHeuristic </Dist>: thresholds[1] is not strictly increasing.')
    }

    // Invalid: blendThreshold below corresponding threshold.
    heuristic.getThresholdsAttr().set([10.0, 50.0, 100.0])
    heuristic.getBlendThresholdsAttr().set([5.0, 60.0, 110.0])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:DistanceHeuristicThresholds.BlendThresholdBelowThreshold',
        ['/Dist'], 'LODDistanceHeuristic </Dist>: blendThresholds[0] (5) < thresholds[0] (10).')
    }

    // Invalid: blendThreshold above next threshold.
    heuristic.getThresholdsAttr().set([10.0, 50.0, 100.0])
    heuristic.getBlendThresholdsAttr().set([15.0, 60.0, 110.0])
    // Make thresholds[1] < blendThresholds[0]
    heuristic.getThresholdsAttr().set([10.0, 12.0, 100.0])
    heuristic.getBlendThresholdsAttr().set([15.0, 20.0, 110.0])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:DistanceHeuristicThresholds.BlendThresholdAboveNextThreshold',
        ['/Dist'], 'LODDistanceHeuristic </Dist>: blendThresholds[0] (15) > thresholds[1] (12).')
    }
  })

  // testUsdLodValidators.cpp:198-322.
  it('TestScreenSizeHeuristicThresholdsValidator', async () => {
    const validator = getValidator(UsdLodValidatorNameTokens.screenSizeHeuristicThresholds)
    const stage = Stage.createNew()
    const heuristic = UsdLodScreenSizeHeuristic.define(stage, '/SS')
    heuristic.getLodDomainAttr().set(UsdLodTokens.imaging)

    // Valid: strictly decreasing thresholds, valid blendThresholds,
    // valid projectionMethod, valid extent.
    heuristic.getThresholdsAttr().set([0.25, 0.10, 0.025])
    heuristic.getBlendThresholdsAttr().set([0.20, 0.08, 0.020])
    heuristic.getProjectionMethodAttr().set(UsdLodTokens.projectedSphere)
    heuristic.getExtentAttr().set([[-1, -1, -1], [1, 1, 1]])
    {
      expect(await validator.validate(heuristic.prim)).toEqual([])
    }

    // Invalid: thresholds not strictly decreasing.
    heuristic.getThresholdsAttr().set([0.25, 0.25, 0.025])
    heuristic.getBlendThresholdsAttr().set([])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:ScreenSizeHeuristicThresholds.ThresholdsNotStrictlyDecreasing',
        ['/SS'], 'LODScreenSizeHeuristic </SS>: thresholds[1] is not strictly decreasing.')
    }

    // Invalid: blendThreshold above corresponding threshold.
    heuristic.getThresholdsAttr().set([0.25, 0.10, 0.025])
    heuristic.getBlendThresholdsAttr().set([0.30, 0.08, 0.020])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:ScreenSizeHeuristicThresholds.BlendThresholdAboveThreshold',
        ['/SS'], 'LODScreenSizeHeuristic </SS>: blendThresholds[0] (0.3) > thresholds[0] (0.25).')
    }

    // Invalid: blendThreshold below next threshold.
    // blendThresholds[1]=0.021 < thresholds[2]=0.025 violates the rule
    // that blendThresholds[i] >= thresholds[i+1].
    heuristic.getThresholdsAttr().set([0.25, 0.10, 0.025])
    heuristic.getBlendThresholdsAttr().set([0.20, 0.021, 0.020])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:ScreenSizeHeuristicThresholds.BlendThresholdBelowNextThreshold',
        ['/SS'], 'LODScreenSizeHeuristic </SS>: blendThresholds[1] (0.021) < thresholds[2] (0.025).')
    }

    // Restore valid thresholds before testing other attributes.
    heuristic.getThresholdsAttr().set([0.25, 0.10, 0.025])
    heuristic.getBlendThresholdsAttr().set([])

    // Invalid: unrecognized projectionMethod.
    heuristic.getProjectionMethodAttr().set('badMethod')
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:ScreenSizeHeuristicThresholds.InvalidProjectionMethod',
        ['/SS'], 'LODScreenSizeHeuristic </SS>: projectionMethod \'badMethod\' '
        + 'is not a recognized value (expected \'projectedSphere\' or \'projectedExtent\').')
    }
    heuristic.getProjectionMethodAttr().set(UsdLodTokens.projectedSphere)

    // Invalid: extent with 1 element.
    heuristic.getExtentAttr().set([[-1, -1, -1]])
    {
      const errors = await validator.validate(heuristic.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdLodValidators:ScreenSizeHeuristicThresholds.InvalidExtentSize',
        ['/SS'], 'LODScreenSizeHeuristic </SS>: extent has 1 element(s) '
        + 'but must be empty or have exactly 2 elements.')
    }
  })

  // testUsdLodValidators.cpp:324-366.
  it('TestLodOverrideApiModeValidator', async () => {
    const validator = getValidator(UsdLodValidatorNameTokens.lodOverrideApiMode)
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Override')
    UsdLodOverrideAPI.apply(prim)
    const overrideAPI = new UsdLodOverrideAPI(prim)

    // Valid: mode is "inherited" (default).
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.inherited)
    {
      expect(await validator.validate(prim)).toEqual([])
    }

    // Valid: mode is "indexedLOD" and index is readable.
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.indexedLOD)
    overrideAPI.getLodOverrideIndexAttr().set(1.0)
    {
      expect(await validator.validate(prim)).toEqual([])
    }

    // Invalid: unrecognized mode token.
    overrideAPI.getLodOverrideModeAttr().set('badMode')
    {
      const errors = await validator.validate(prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, 'usdLodValidators:LodOverrideApiMode.InvalidOverrideMode',
        ['/Override'], 'LODOverrideAPI prim </Override>: lod:override:mode \'badMode\' '
        + 'is not a recognized value.')
    }
  })

  // testUsdLodValidators.cpp:368-436.
  it('TestLodRootApiHeuristicsValidator', async () => {
    const validator = getValidator(UsdLodValidatorNameTokens.lodRootApiHeuristics)
    const stage = Stage.createNew()
    const root = stage.definePrim('/Root')
    UsdLodRootAPI.apply(root)
    const rootAPI = new UsdLodRootAPI(root)

    // Define a valid heuristic prim.
    UsdLodDistanceHeuristic.define(stage, '/Heuristic')

    // Valid: target is a UsdLodHeuristic prim.
    rootAPI.getLodHeuristicsRel().setTargets(['/Heuristic'])
    {
      expect(await validator.validate(root)).toEqual([])
    }

    // Invalid: target path does not exist.
    rootAPI.getLodHeuristicsRel().setTargets(['/Missing'])
    {
      const errors = await validator.validate(root)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, 'usdLodValidators:LodRootApiHeuristics.InvalidHeuristicTarget',
        ['/Root'], 'LODRootAPI prim </Root>: lod:heuristics target </Missing> '
        + 'does not resolve to a UsdLodHeuristic prim.')
    }

    // Invalid: target exists but is not a UsdLodHeuristic.
    stage.definePrim('/NotAHeuristic')
    rootAPI.getLodHeuristicsRel().setTargets(['/NotAHeuristic'])
    {
      const errors = await validator.validate(root)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, 'usdLodValidators:LodRootApiHeuristics.InvalidHeuristicTarget',
        ['/Root'], 'LODRootAPI prim </Root>: lod:heuristics target </NotAHeuristic> '
        + 'does not resolve to a UsdLodHeuristic prim.')
    }
  })
})
