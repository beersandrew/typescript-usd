// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdGeomValidators/testenv/testUsdGeomValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdGeomValidators/testenv/testUsdGeomValidators.cpp.
//
// Each TF_AXIOM is an expect() here, in upstream order.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { setStageMetersPerUnit, setStageUpAxis } from 'typescript-usd/usdGeom'
import { ValidationErrorType, ValidationRegistry } from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdGeomValidatorNameTokens } from '../../src/index.ts'

// testUsdGeomValidators.cpp:19-21.
const _tokens = { usdGeomValidatorsPlugin: 'usdGeomValidators' }

// testUsdGeomValidators.cpp:54-174.
const subsetsLayerContents = `#usda 1.0
(
    defaultPrim = "SubsetsTest"
    metersPerUnit = 0.01
    upAxis = "Z"
)
def Xform "SubsetsTest" (
    kind = "component"
)
{
    def Xform "Geom"
    {
        def Mesh "Cube"
        {
            float3[] extent = [(-0.5, -0.5, -0.5), (0.5, 0.5, 0.5)]
            int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
            int[] faceVertexIndices = [0, 1, 3, 2, 2, 3, 5, 4, 4, 5, 7, 6, 6, 7, 1, 0, 1, 7, 5, 3, 6, 0, 2, 4]
            point3f[] points = [(-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5)]
            uniform token subsetFamily:incompletePartition:familyType = "partition"
            uniform token subsetFamily:nonOverlappingWithDuplicates:familyType = "nonOverlapping"
            def GeomSubset "emptyIndicesAtAllTimes"
            {
                uniform token elementType = "face"
                uniform token familyName = "emptyIndicesAtAllTimes"
            }
            def GeomSubset "incompletePartition_1"
            {
                uniform token elementType = "face"
                uniform token familyName = "incompletePartition"
                int[] indices = [0, 1]
            }
            def GeomSubset "incompletePartition_2"
            {
                uniform token elementType = "face"
                uniform token familyName = "incompletePartition"
                int[] indices = [4, 5]
            }
            def GeomSubset "mixedElementTypes_1"
            {
                uniform token elementType = "face"
                uniform token familyName = "mixedElementTypes"
                int[] indices = [0, 1, 2]
            }
            def GeomSubset "mixedElementTypes_2"
            {
                uniform token elementType = "point"
                uniform token familyName = "mixedElementTypes"
                int[] indices = [0, 1, 2]
            }
            def GeomSubset "nonOverlappingWithDuplicates_1"
            {
                uniform token elementType = "face"
                uniform token familyName = "nonOverlappingWithDuplicates"
                int[] indices = [0, 3]
            }
            def GeomSubset "nonOverlappingWithDuplicates_2"
            {
                uniform token elementType = "face"
                uniform token familyName = "nonOverlappingWithDuplicates"
                int[] indices = [3, 5]
            }
            def GeomSubset "onlyNegativeIndices"
            {
                uniform token elementType = "face"
                uniform token familyName = "onlyNegativeIndices"
                int[] indices = [-1, -2, -3, -4, -5]
            }
            def GeomSubset "outOfRangeIndices"
            {
                uniform token elementType = "face"
                uniform token familyName = "outOfRangeIndices"
                int[] indices = [3, 4, 5, 6, 7]
            }
            def GeomSubset "invalidElementType"
            {
                uniform token elementType = "segment"
                uniform token familyName = "invalidElementType"
                int[] indices = [0]
            }
        }
        def Mesh "NullMesh"
        {
            def GeomSubset "noElementsInGeometry"
            {
                uniform token elementType = "face"
                uniform token familyName = "noElementsInGeometry"
                int[] indices = [0, 1, 2, 3]
            }
        }
        def Mesh "VaryingMesh"
        {
            int[] faceVertexCounts.timeSamples = {
                1: [4],
                2: [4, 4],
                3: [4, 4, 4]
            }
            def GeomSubset "noDefaultTimeElementsInGeometry"
            {
                uniform token elementType = "face"
                uniform token familyName = "noDefaultTimeElementsInGeometry"
                int[] indices = [0]
                int[] indices.timeSamples = {
                    1: [0],
                    2: [1],
                    3: [2]
                }
            }
        }
        def Material "NonImageable"
        {
            def GeomSubset "parentIsNotImageable"
            {
                uniform token elementType = "face"
                uniform token familyName = "parentIsNotImageable"
                int[] indices = [0]
            }
        }
    }
}
`

// testUsdGeomValidators.cpp:176-189.
const nestedLayerContents = `#usda 1.0
(
    defaultPrim = "NestedGprimTest"
    upAxis = "Z"
)
def Mesh "NestedGprimTest"
{
    def Sphere "NestedPrim"
    {
    
    }
}
`

async function _openStage(contents: string): Promise<Stage> {
  const layer = Layer.createAnonymous('.usda')
  layer.importFromString(contents)
  return Stage.open(layer)
}

describe('testUsdGeomValidators', () => {
  // testUsdGeomValidators.cpp:23-50.
  it('TestUsdGeomValidators', () => {
    // This should be updated with every new validator added with the
    // UsdGeomValidators keyword.
    const expectedUsdGeomValidatorNames = new Set([
      UsdGeomValidatorNameTokens.subsetFamilies,
      UsdGeomValidatorNameTokens.subsetParentIsImageable,
      UsdGeomValidatorNameTokens.stageMetadataChecker,
      UsdGeomValidatorNameTokens.encapsulationChecker,
    ])

    const registry = ValidationRegistry.getInstance()

    // Since other validators can be registered with the same keywords,
    // our validators registered in usdGeom are/may be a subset of the
    // entire set.
    const metadata = registry.getValidatorMetadataForPlugin(_tokens.usdGeomValidatorsPlugin)
    expect(metadata.length).toBe(4)
    const validatorMetadataNameSet = new Set(metadata.map(m => m.name))

    expect(validatorMetadataNameSet).toEqual(expectedUsdGeomValidatorNames)
  })

  // testUsdGeomValidators.cpp:394-433.
  it('TestUsdGeomEncapsulationChecker', async () => {
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdGeomValidatorNameTokens.encapsulationChecker)
    expect(validator).toBeDefined()

    const usdStage = await _openStage(nestedLayerContents)
    expect(usdStage).toBeDefined()

    const expectedErrorIdentifier = 'usdGeomValidators:EncapsulationChecker.InvalidNestedGprims'

    {
      const usdPrim = usdStage.getPrim('/NestedGprimTest/NestedPrim')!

      const errors = await validator!.validate(usdPrim)

      expect(errors.length).toBe(1)
      const error = errors[0]!
      expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(error.getType()).toBe(ValidationErrorType.Error)
      expect(error.getSites().length).toBe(1)
      const errorSite = error.getSites()[0]!
      expect(errorSite.isValid()).toBe(true)
      expect(errorSite.isPrim()).toBe(true)
      expect(errorSite.getPrim()!.path).toBe(usdPrim.path)
      const expectedErrorMsg = 'Gprim </NestedGprimTest/NestedPrim> has an ancestor prim that is also '
        + 'a Gprim, which is not allowed.'
      expect(error.getMessage()).toBe(expectedErrorMsg)
    }
  })

  // testUsdGeomValidators.cpp:191-303.
  it('TestUsdGeomSubsetFamilies', async () => {
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdGeomValidatorNameTokens.subsetFamilies)
    expect(validator).toBeDefined()

    const usdStage = await _openStage(subsetsLayerContents)
    expect(usdStage).toBeDefined()

    const expectedErrorIdentifier = 'usdGeomValidators:SubsetFamilies.InvalidSubsetFamily'
    {
      const usdPrim = usdStage.getPrim('/SubsetsTest/Geom/Cube')!

      const expectedErrorMsgs = [
        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'emptyIndicesAtAllTimes': No indices in family at any time.",

        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'incompletePartition': Number of unique indices at time DEFAULT "
        + 'does not match the element count 6.',

        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'invalidElementType': Invalid geom type Mesh for elementType segment.",

        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'mixedElementTypes': GeomSubset at path "
        + '</SubsetsTest/Geom/Cube/mixedElementTypes_2> has elementType '
        + "'point', which does not match 'face'.",

        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'nonOverlappingWithDuplicates': Found duplicate index 3 in "
        + 'GeomSubset at path '
        + '</SubsetsTest/Geom/Cube/nonOverlappingWithDuplicates_2> at time '
        + 'DEFAULT.',

        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'onlyNegativeIndices': Found one or more indices that are less "
        + 'than 0 at time DEFAULT.',

        'Imageable prim </SubsetsTest/Geom/Cube> has invalid subset family '
        + "'outOfRangeIndices': Found one or more indices that are greater "
        + 'than the element count 6 at time DEFAULT.',
      ]

      const errors = await validator!.validate(usdPrim)
      expect(errors.map(error => error.getMessage())).toEqual(expectedErrorMsgs)

      errors.forEach((error, errorIndex) => {
        expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
        expect(error.getType()).toBe(ValidationErrorType.Error)
        expect(error.getSites().length).toBe(1)
        const errorSite = error.getSites()[0]!
        expect(errorSite.isValid()).toBe(true)
        expect(errorSite.isPrim()).toBe(true)
        expect(errorSite.getPrim()!.path).toBe(usdPrim.path)
        expect(error.getMessage()).toBe(expectedErrorMsgs[errorIndex])
      })
    }

    {
      const usdPrim = usdStage.getPrim('/SubsetsTest/Geom/NullMesh')!

      const errors = await validator!.validate(usdPrim)
      expect(errors.length).toBe(1)
      const error = errors[0]!
      expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(error.getType()).toBe(ValidationErrorType.Error)
      expect(error.getSites().length).toBe(1)
      const errorSite = error.getSites()[0]!
      expect(errorSite.isValid()).toBe(true)
      expect(errorSite.isPrim()).toBe(true)
      expect(errorSite.getPrim()!.path).toBe(usdPrim.path)
      const expectedErrorMsg = 'Imageable prim </SubsetsTest/Geom/NullMesh> has invalid subset '
        + "family 'noElementsInGeometry': Unable to determine element "
        + 'count at earliest time for geom </SubsetsTest/Geom/NullMesh>.'
      expect(error.getMessage()).toBe(expectedErrorMsg)
    }

    {
      const usdPrim = usdStage.getPrim('/SubsetsTest/Geom/VaryingMesh')!

      const errors = await validator!.validate(usdPrim)
      expect(errors.length).toBe(1)
      const error = errors[0]!
      expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(error.getType()).toBe(ValidationErrorType.Error)
      expect(error.getSites().length).toBe(1)
      const errorSite = error.getSites()[0]!
      expect(errorSite.isValid()).toBe(true)
      expect(errorSite.isPrim()).toBe(true)
      expect(errorSite.getPrim()!.path).toBe(usdPrim.path)
      const expectedErrorMsg = 'Imageable prim </SubsetsTest/Geom/VaryingMesh> has invalid '
        + "subset family 'noDefaultTimeElementsInGeometry': Geometry "
        + '</SubsetsTest/Geom/VaryingMesh> has no elements at time '
        + 'DEFAULT, but the "noDefaultTimeElementsInGeometry" '
        + 'GeomSubset family contains indices.'
      expect(error.getMessage()).toBe(expectedErrorMsg)
    }
  })

  // testUsdGeomValidators.cpp:305-342.
  it('TestUsdGeomSubsetParentIsImageable', async () => {
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdGeomValidatorNameTokens.subsetParentIsImageable)
    expect(validator).toBeDefined()

    const usdStage = await _openStage(subsetsLayerContents)
    expect(usdStage).toBeDefined()

    const expectedErrorIdentifier = 'usdGeomValidators:SubsetParentIsImageable.NotImageableSubsetParent'

    {
      const usdPrim = usdStage.getPrim('/SubsetsTest/Geom/NonImageable/parentIsNotImageable')!

      const errors = await validator!.validate(usdPrim)
      expect(errors.length).toBe(1)
      const error = errors[0]!
      expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
      expect(error.getType()).toBe(ValidationErrorType.Error)
      expect(error.getSites().length).toBe(1)
      const errorSite = error.getSites()[0]!
      expect(errorSite.isValid()).toBe(true)
      expect(errorSite.isPrim()).toBe(true)
      expect(errorSite.getPrim()!.path).toBe(usdPrim.path)
      const expectedErrorMsg = 'GeomSubset '
        + '</SubsetsTest/Geom/NonImageable/parentIsNotImageable> has '
        + 'direct parent prim </SubsetsTest/Geom/NonImageable> that is '
        + 'not Imageable.'
      expect(error.getMessage()).toBe(expectedErrorMsg)
    }
  })

  // testUsdGeomValidators.cpp:344-392.
  it('TestUsdStageMetadata', async () => {
    // Get stageMetadataChecker
    const registry = ValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdGeomValidatorNameTokens.stageMetadataChecker)
    expect(validator).toBeDefined()

    // Create an empty stage
    const rootLayer = Layer.createAnonymous()
    const usdStage = await Stage.open(rootLayer)

    let errors = await validator!.validate(usdStage)

    // Verify both metersPerUnit and upAxis errors are present
    expect(errors.length).toBe(2)
    const rootLayerIdentifier = rootLayer.identifier
    const expectedErrorMessages = [
      `Stage with root layer <${rootLayerIdentifier}> does not specify its linear `
      + 'scale in metersPerUnit.',
      `Stage with root layer <${rootLayerIdentifier}> does not specify an upAxis.`,
    ]

    const expectedErrorIdentifiers = [
      'usdGeomValidators:StageMetadataChecker.MissingMetersPerUnitMetadata',
      'usdGeomValidators:StageMetadataChecker.MissingUpAxisMetadata',
    ]

    errors.forEach((error, i) => {
      expect(error.getType()).toBe(ValidationErrorType.Error)
      expect(error.getIdentifier()).toBe(expectedErrorIdentifiers[i])
      expect(error.getSites().length).toBe(1)
      expect(error.getSites()[0]!.isValid()).toBe(true)
      expect(error.getMessage()).toBe(expectedErrorMessages[i])
    })

    // Fix the errors
    setStageMetersPerUnit(usdStage, 0.01)
    setStageUpAxis(usdStage, 'Y')

    errors = await validator!.validate(usdStage)

    // Verify the errors are fixed
    expect(errors).toEqual([])
  })
})
