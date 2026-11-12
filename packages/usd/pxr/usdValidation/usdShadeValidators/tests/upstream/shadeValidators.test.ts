// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdShadeValidators/testenv/testUsdShadeValidators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdShadeValidators/testenv/testUsdShadeValidators.cpp.
//
// Fixtures: fixtures/testUsdShadeValidators is a verbatim copy of the
// upstream testenv directory, the test's working directory (its TESTENV,
// usdShadeValidators/CMakeLists.txt:39-43); relative paths in the test are
// read from it. Upstream's main() runs the tests in one process in the order
// below; each TF_AXIOM is an expect() here, in upstream order.
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Vec3f, Vec4f } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath, Layer } from 'typescript-usd/sdf'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import { Stage } from 'typescript-usd/usd'
import { Scope as UsdGeomScope, Xform as UsdGeomXform } from 'typescript-usd/usdGeom'
import {
  ConnectableAPI as UsdShadeConnectableAPI, Material as UsdShadeMaterial,
  MaterialBindingAPI as UsdShadeMaterialBindingAPI, NodeGraph as UsdShadeNodeGraph, Shader as UsdShadeShader,
  ShaderDefParserPlugin, ShaderDefUtils,
} from 'typescript-usd/usdShade'
import {
  ValidationErrorType as UsdValidationErrorType, ValidationRegistry as UsdValidationRegistry,
  type ValidationError as UsdValidationError,
} from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdShadeValidatorNameTokens } from '../../src/index.ts'

const testenv = path.join(import.meta.dirname, 'fixtures/testUsdShadeValidators')
let cwd = ''
beforeAll(() => {
  cwd = process.cwd()
  process.chdir(testenv)
})
afterAll(() => process.chdir(cwd))

// testUsdShadeValidators.cpp:34-36.
const _tokens = { usdShadeValidatorsPlugin: 'usdShadeValidators' }

// testUsdShadeValidators.cpp:73-90.
function validatePrimError(error: UsdValidationError, expectedErrorIdentifier: string,
  expectedPrimPaths: string[], expectedErrorMsg: string,
  expectedErrorType: UsdValidationErrorType = UsdValidationErrorType.Error): void {
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

// testUsdShadeValidators.cpp:92-108.
function validatePropertyError(error: UsdValidationError, expectedErrorIdentifier: string,
  expectedPropertyPath: string, expectedErrorMsg: string,
  expectedErrorType: UsdValidationErrorType = UsdValidationErrorType.Error): void {
  expect(error.getIdentifier()).toBe(expectedErrorIdentifier)
  expect(error.getType()).toBe(expectedErrorType)
  expect(error.getSites().length).toBe(1)
  const errorSite = error.getSites()[0]!
  expect(errorSite.isValid()).toBe(true)
  expect(errorSite.isProperty()).toBe(true)
  expect(errorSite.getProperty()!.getPath()).toBe(expectedPropertyPath)
  expect(error.getMessage()).toBe(expectedErrorMsg)
}

function importLayer(contents: string): Layer {
  const layer = Layer.createAnonymous('.usda')
  layer.importFromString(contents)
  return layer
}

describe('testUsdShadeValidators', () => {
  // testUsdShadeValidators.cpp:38-71.
  it('TestUsdShadeValidators', () => {
    // This should be updated with every new validator added with the
    // UsdShadeValidators keyword.
    const expectedUsdShadeValidatorNames = new Set([
      UsdShadeValidatorNameTokens.encapsulationValidator,
      UsdShadeValidatorNameTokens.encapsulationMaterialValidator,
      UsdShadeValidatorNameTokens.materialBindingApiAppliedValidator,
      UsdShadeValidatorNameTokens.materialBindingRelationships,
      UsdShadeValidatorNameTokens.materialBindingCollectionValidator,
      UsdShadeValidatorNameTokens.normalMapTextureValidator,
      UsdShadeValidatorNameTokens.shaderSdrCompliance,
      UsdShadeValidatorNameTokens.subsetMaterialBindFamilyName,
      UsdShadeValidatorNameTokens.subsetsMaterialBindFamily])

    const registry = UsdValidationRegistry.getInstance()

    // Since other validators can be registered with the same keywords, our
    // validators registered in usdShade are/may be a subset of the entire
    // set.
    const metadata = registry.getValidatorMetadataForPlugin(_tokens.usdShadeValidatorsPlugin)
    expect(metadata.length).toBe(9)
    expect(new Set(metadata.map(m => m.name))).toEqual(expectedUsdShadeValidatorNames)
  })

  // testUsdShadeValidators.cpp:424-467.
  it('TestUsdShadeMaterialBindingAPIAppliedValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(
      UsdShadeValidatorNameTokens.materialBindingApiAppliedValidator)
    expect(validator).toBeDefined()

    const usdStage = Stage.createNew()
    const usdPrim = usdStage.definePrim('/Test')
    const material = UsdShadeMaterial.define(usdStage, '/Test/Material')

    // Create the material binding relationship manually
    const materialBinding = usdPrim.createRelationship('material:binding')
    materialBinding.addTarget(material.prim.path)

    {
      const errors = await validator!.validate(usdPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:MaterialBindingApiAppliedValidator.MissingMaterialBindingAPI',
        [usdPrim.path],
        'Found material bindings but no MaterialBindingAPI applied on the prim </Test>.')
    }

    // Apply the material binding API to the prim and bind the material
    const bindingAPI = UsdShadeMaterialBindingAPI.apply(usdPrim)
    bindingAPI.bind(material)

    // Verify the errors are fixed
    expect(await validator!.validate(usdPrim)).toEqual([])
  })

  // testUsdShadeValidators.cpp:163-215.
  it('TestUsdShadeMaterialBindingRelationships', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdShadeValidatorNameTokens.materialBindingRelationships)
    expect(validator).toBeDefined()

    const layer = importLayer(`#usda 1.0
               def Xform "MatBindAttributes"
               {
                   int material:binding = 42
                   token material:binding:someAttribute = "bogus"
               }`)
    const usdStage = await Stage.open(layer)
    expect(usdStage).toBeDefined()

    const primPath = '/MatBindAttributes'
    const usdPrim = usdStage.getPrim(primPath)!
    const errors = await validator!.validate(usdPrim)
    expect(errors.length).toBe(2)

    const expectedErrorIdentifier = 'usdShadeValidators:MaterialBindingRelationships.MaterialBindingPropNotARel'
    validatePropertyError(errors[0]!, expectedErrorIdentifier, `${primPath}.material:binding`,
      'Prim </MatBindAttributes> has material binding property '
      + '\'material:binding\' that is not a relationship.')
    validatePropertyError(errors[1]!, expectedErrorIdentifier, `${primPath}.material:binding:someAttribute`,
      'Prim </MatBindAttributes> has material binding property '
      + '\'material:binding:someAttribute\' that is not a relationship.')
  })

  // testUsdShadeValidators.cpp:110-161.
  it('TestUsdShadeMaterialBindingCollections', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(
      UsdShadeValidatorNameTokens.materialBindingCollectionValidator)
    expect(validator).toBeDefined()

    const usdStage = (await Stage.open('./badMaterialCollections.usda'))!

    // Test prim with relationship to material binding collection to a single
    // target fails validation.
    {
      const primPath = '/SingleTargetMaterialCollection'
      const errors = await validator!.validate(usdStage.getPrim(primPath)!)
      expect(errors.length).toBe(1)
      validatePropertyError(errors[0]!,
        'usdShadeValidators:MaterialBindingCollectionValidator.InvalidMaterialCollection',
        `${primPath}.material:binding:collection`,
        'Collection-based material binding on '
        + '</SingleTargetMaterialCollection> has 1 target </Material>, '
        + 'needs 2: a collection path and a UsdShadeMaterial path.')
    }

    // Test prim with relationship to a material binding collection
    // referencing nonexistent resources fails validation.
    {
      const primPath = '/IncompleteMaterialCollection/Bind1'
      const errors = await validator!.validate(usdStage.getPrim(primPath)!)
      expect(errors.length).toBe(1)
      validatePropertyError(errors[0]!,
        'usdShadeValidators:MaterialBindingCollectionValidator.InvalidResourcePath',
        `${primPath}.material:binding:collection`,
        'Collection-based material binding </IncompleteMaterialCollection/'
        + 'Bind1.material:binding:collection> targets an invalid collection'
        + ' </IncompleteMaterialCollection.collection:col1>.')
    }
  })

  // testUsdShadeValidators.cpp:679-927.
  it('TestUsdShadeNormalMapTextureValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdShadeValidatorNameTokens.normalMapTextureValidator)
    expect(validator).toBeDefined()

    // Create a Stage, Material, and Two Shaders (UsdPreviewSurface,
    // UsdUVTexture).
    const usdStage = Stage.createNew()
    UsdShadeMaterial.define(usdStage, '/RootMaterial')

    const usdPreviewSurfaceShaderPath = '/RootMaterial/UsdPreviewSurface'
    const usdPreviewSurfaceShader = UsdShadeShader.define(usdStage, usdPreviewSurfaceShaderPath)
    usdPreviewSurfaceShader.createIdAttr('UsdPreviewSurface')
    const usdPreviewSurfaceShaderPrim = usdPreviewSurfaceShader.prim

    const usdUvTextureShader = UsdShadeShader.define(usdStage, '/RootMaterial/NormalTexture')
    usdUvTextureShader.createIdAttr('UsdUVTexture')
    const uvTexturePath = usdUvTextureShader.prim.path

    // Add initial valid file and sourceColorSpace input values.
    const textureAssetPath = './normalMap.jpg'
    const fileInput = usdUvTextureShader.createInput('file', 'asset')
    fileInput.set(new SdfAssetPath(textureAssetPath))
    const sourceColorSpaceInput = usdUvTextureShader.createInput('sourceColorSpace', 'token')
    sourceColorSpaceInput.set('raw')

    // Connect the output of the UsdUVTexture Shader to the normal of the
    // UsdPreviewSurface Shader.
    usdUvTextureShader.createOutput('ColorOut', 'float3')
    const normalInput = usdPreviewSurfaceShader.createInput('normal', 'normal3f')
    normalInput.connectToSource('/RootMaterial/NormalTexture.outputs:ColorOut')
    // Asset values resolve asynchronously here: an authored asset path is
    // resolved once changes are flushed (stage.ts _resolvedAttributeAsset,
    // UsdStage::_MakeResolvedAssetPaths stage.cpp:804-847 resolves on Get).
    await usdStage.flushChanges()

    const bothPaths = [usdPreviewSurfaceShaderPrim.path, uvTexturePath]
    const prefix = `UsdUVTexture prim <${uvTexturePath}> (connected through `
      + `validating prim <${usdPreviewSurfaceShaderPrim.path}>) `

    // Verify invalid bias & scale error, they are expected to exist but do
    // not.
    {
      const errors = await validator!.validate(usdPreviewSurfaceShaderPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:NormalMapTextureValidator.NonCompliantBiasAndScale', bothPaths,
        prefix + 'reads 8 bit Normal Map @./normalMap.jpg@, which requires that '
        + 'inputs:scale be set to (2, 2, 2, 1) and inputs:bias be set to (-1, -1, -1, 0) for proper '
        + 'interpretation as per the UsdPreviewSurface and UsdUVTexture docs.')
    }

    // Add bias and scale, but add a non-compliant bias value.
    const biasInput = usdUvTextureShader.createInput('bias', 'float4')
    const compliantBias = new Vec4f(-1, -1, -1, 0)
    const nonCompliantVector = new Vec4f(-9, -9, -9, -9)
    biasInput.set(nonCompliantVector)
    const scaleInput = usdUvTextureShader.createInput('scale', 'float4')
    const compliantScale = new Vec4f(2, 2, 2, 1)
    scaleInput.set(compliantScale)

    // Verify the non-compliant bias value error occurs.
    {
      const errors = await validator!.validate(usdPreviewSurfaceShaderPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:NormalMapTextureValidator.NonCompliantBiasValues', bothPaths,
        prefix + 'reads an 8 bit Normal Map, but has non-standard inputs:bias value of '
        + '(-9, -9, -9, -9). inputs:bias must be set to [-1,-1,-1,0] so as to fulfill the '
        + 'requirements of the normals to be in tangent space of [(-1,-1,-1), (1,1,1)] as documented in '
        + 'the UsdPreviewSurface and UsdUVTexture docs.',
        UsdValidationErrorType.Warn)
    }

    // Update to a compliant bias and a non-compliant scale value.
    biasInput.set(compliantBias)
    scaleInput.set(nonCompliantVector)

    // Verify the non-compliant scale value error occurs.
    {
      const errors = await validator!.validate(usdPreviewSurfaceShaderPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:NormalMapTextureValidator.NonCompliantScaleValues', bothPaths,
        prefix + 'reads an 8 bit Normal Map, but has non-standard inputs:scale value '
        + 'of (-9, -9, -9, -9). inputs:scale must be set to (2, 2, 2, 1) so as fulfill the '
        + 'requirements of the normals to be in tangent space of [(-1,-1,-1), (1,1,1)] as documented in '
        + 'the UsdPreviewSurface and UsdUVTexture docs.',
        UsdValidationErrorType.Warn)
    }

    // Set a compliant scale value, and an invalid sourceColorSpace.
    scaleInput.set(compliantScale)
    sourceColorSpaceInput.set('error')

    // Verify the invalid sourceColorSpace error occurs.
    {
      const errors = await validator!.validate(usdPreviewSurfaceShaderPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:NormalMapTextureValidator.InvalidSourceColorSpace', bothPaths,
        prefix + `that reads Normal Map @${textureAssetPath}@ should set `
        + 'inputs:sourceColorSpace to \'raw\'.')
    }

    // Correct the sourceColorSpace, hook up the normal input of
    // UsdPreviewSurface to a non-shader output.
    sourceColorSpaceInput.set('raw')
    const nonShaderPrim = UsdGeomXform.define(usdStage, '/RootMaterial/Xform')
    const connectableNonShaderAPI = new UsdShadeConnectableAPI(nonShaderPrim.prim)
    const nonShaderOutput = connectableNonShaderAPI.createOutput('myOutput', 'float3')
    nonShaderOutput.getAttr().set(new Vec3f(1.0, 2.0, 3.0))
    normalInput.connectToSource(nonShaderOutput)

    // Verify a non-shader connection error occurs.
    {
      const errors = await validator!.validate(usdPreviewSurfaceShaderPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:NormalMapTextureValidator.NonShaderConnection',
        [usdPreviewSurfaceShaderPrim.path],
        `UsdPreviewSurface.normal on prim <${usdPreviewSurfaceShaderPath}> is connected `
        + 'to a non-Shader prim.')
    }

    // Set the normal input back to a valid shader and update the file input
    // to an invalid file path.
    normalInput.connectToSource('/RootMaterial/NormalTexture.outputs:ColorOut')
    fileInput.set(new SdfAssetPath('./doesNotExist.jpg'))
    await usdStage.flushChanges()

    // Verify the invalid input file error occurs.
    {
      const errors = await validator!.validate(usdPreviewSurfaceShaderPrim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:NormalMapTextureValidator.InvalidFile', bothPaths,
        prefix + 'has invalid or unresolvable inputs:file of @./doesNotExist.jpg@')
    }

    // Reset the file to a valid path.
    fileInput.set(new SdfAssetPath('./normalMap.jpg'))
    await usdStage.flushChanges()

    // Verify no errors exist.
    expect(await validator!.validate(usdPreviewSurfaceShaderPrim)).toEqual([])
  })

  // testUsdShadeValidators.cpp:217-286.
  it('TestUsdShadeShaderPropertyCompliance', async () => {
    // Need to setup our test shader in sdrRegistry first
    // Opened by its absolute path in the working directory: the registry's
    // UsdShadeShaderDefParserPlugin parses against the stage a parser was
    // constructed with, found by the stage's root layer path, which must be
    // the discovery result's resolved URI (sdr-shaderdefs-stage-open).
    const shaderDefStage = (await Stage.open(path.join(process.cwd(), 'shaderDefs.usda')))!
    new ShaderDefParserPlugin(shaderDefStage)
    const shaderDef = UsdShadeShader.get(shaderDefStage, '/TestShaderNode')
    SdrRegistry.getInstance().addDiscoveryResult(
      ShaderDefUtils.getDiscoveryResults(shaderDef, shaderDefStage.getRootLayer().realPath)[0]!)

    // Now lets test our ShaderProperty validator
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdShadeValidatorNameTokens.shaderSdrCompliance)
    expect(validator).toBeDefined()

    const layer = importLayer(`#usda 1.0
               def Shader "Test"
               {
                    uniform token info:id = "TestShaderNode"
                    int inputs:inputInt = 2
                    float inputs:inputFloat = 2.0
                    float3 inputs:inputColor = (2.0, 3.0, 4.0)
                    token outputs:surface
               }
               def Shader "Bogus"
               {
                    uniform token info:id = "Bogus"
               }`)
    const usdStage = await Stage.open(layer)
    expect(usdStage).toBeDefined()

    {
      const errors = await validator!.validate(usdStage.getPrim('/Test')!)
      expect(errors.length).toBe(1)
      validatePropertyError(errors[0]!,
        'usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType', '/Test.inputs:inputColor',
        'Incorrect type for /Test.inputs:inputColor. Expected \'color3f\'; got \'float3\'.')
    }
    {
      const errors = await validator!.validate(usdStage.getPrim('/Bogus')!)
      expect(errors.length).toBe(1)
      validatePropertyError(errors[0]!,
        'usdShadeValidators:ShaderSdrCompliance.MissingShaderIdInRegistry', '/Bogus.info:id',
        'shaderId \'Bogus\' specified on shader prim </Bogus> not found in sdrRegistry.')
    }
  })

  // testUsdShadeValidators.cpp:288-356.
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

            uniform token subsetFamily:materialBind:familyType = "unrestricted"

            def GeomSubset "materialBindShouldNotBeUnrestricted" (
                prepend apiSchemas = ["MaterialBindingAPI"]
            )
            {
                uniform token elementType = "face"
                uniform token familyName = "materialBind"
                int[] indices = [0, 2, 4]
                rel material:binding = </SubsetsTest/Materials/TestMaterial>
            }

            def GeomSubset "materialBindMissingElementType" (
                prepend apiSchemas = ["MaterialBindingAPI"]
            )
            {
                uniform token familyName = "materialBind"
                int[] indices = [1, 3, 5]
                rel material:binding = </SubsetsTest/Materials/TestMaterial>
            }

            def GeomSubset "materialBindMissingFamilyName" (
                prepend apiSchemas = ["MaterialBindingAPI"]
            )
            {
                uniform token elementType = "face"
                int[] indices = [1, 3, 5]
                rel material:binding = </SubsetsTest/Materials/TestMaterial>
            }
        }
    }

    def Scope "Materials"
    {
        def Material "TestMaterial"
        {
            token outputs:surface.connect = </SubsetsTest/Materials/TestMaterial/PreviewSurface.outputs:surface>

            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (1.0, 0.0, 0.0)
                token outputs:surface
            }
        }
    }
}
`

  // testUsdShadeValidators.cpp:358-389.
  it('TestUsdShadeSubsetMaterialBindFamilyName', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdShadeValidatorNameTokens.subsetMaterialBindFamilyName)
    expect(validator).toBeDefined()

    const usdStage = await Stage.open(importLayer(subsetsLayerContents))
    expect(usdStage).toBeDefined()

    const usdPrim = usdStage.getPrim('/SubsetsTest/Geom/Cube/materialBindMissingFamilyName')!
    const errors = await validator!.validate(usdPrim)
    expect(errors.length).toBe(1)
    validatePrimError(errors[0]!,
      'usdShadeValidators:SubsetMaterialBindFamilyName.MissingFamilyNameOnGeomSubset', [usdPrim.path],
      'GeomSubset prim </SubsetsTest/Geom/Cube/materialBindMissingFamilyName> '
      + 'with material bindings applied but no authored family name '
      + 'should set familyName to \'materialBind\'.')
  })

  // testUsdShadeValidators.cpp:391-422.
  it('TestUsdShadeSubsetsMaterialBindFamily', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdShadeValidatorNameTokens.subsetsMaterialBindFamily)
    expect(validator).toBeDefined()

    const usdStage = await Stage.open(importLayer(subsetsLayerContents))
    expect(usdStage).toBeDefined()

    const usdPrim = usdStage.getPrim('/SubsetsTest/Geom/Cube')!
    const errors = await validator!.validate(usdPrim)
    expect(errors.length).toBe(1)
    validatePrimError(errors[0]!,
      'usdShadeValidators:SubsetsMaterialBindFamily.InvalidFamilyType', [usdPrim.path],
      'Imageable prim </SubsetsTest/Geom/Cube> has \'materialBind\' '
      + 'subset family with invalid family type \'unrestricted\'. Family '
      + 'type should be \'nonOverlapping\' or \'partition\' instead.')
  })

  // testUsdShadeValidators.cpp:469-608.
  it('TestUsdShadeEncapsulationMaterialValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(
      UsdShadeValidatorNameTokens.encapsulationMaterialValidator)
    expect(validator).toBeDefined()

    const usdStage = Stage.createNew()
    const id = 'usdShadeValidators:EncapsulationMaterialValidator.'

    // Create a Material > Scope hierarchy
    UsdShadeMaterial.define(usdStage, '/RootMaterial')
    // Its legal to have a non-connectable descendant which is not a Shader or
    // a NodeGraph. But try a Material or a Light / LightFilter and thats not
    // allowed.
    UsdGeomScope.define(usdStage, '/RootMaterial/Scope')
    {
      const errors = await validator!.validate(usdStage.getPrim('/RootMaterial')!)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, id + 'InvalidImageableInMaterial',
        ['/RootMaterial', '/RootMaterial/Scope'],
        'Imageable </RootMaterial/Scope> of type Scope is not a valid '
        + 'descendant of Material </RootMaterial>.')
    }

    // Create a Material > Material hierarchy, which is also not allowed.
    UsdShadeMaterial.define(usdStage, '/NestedMaterialRoot')
    UsdShadeMaterial.define(usdStage, '/NestedMaterialRoot/NestedMaterial')
    {
      const errors = await validator!.validate(usdStage.getPrim('/NestedMaterialRoot')!)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, id + 'InvalidConnectableInMaterial',
        ['/NestedMaterialRoot', '/NestedMaterialRoot/NestedMaterial'],
        'Connectable </NestedMaterialRoot/NestedMaterial> of type '
        + 'Material is not a valid connectable descendant of Material '
        + '</NestedMaterialRoot>.')
    }

    // Create a Material -> NodeGraph -> Material hierarchy, which is also
    // not allowed.
    UsdShadeMaterial.define(usdStage, '/NodeGraphMaterialRoot')
    UsdShadeNodeGraph.define(usdStage, '/NodeGraphMaterialRoot/NodeGraph')
    UsdShadeMaterial.define(usdStage, '/NodeGraphMaterialRoot/NodeGraph/Material')
    {
      const errors = await validator!.validate(usdStage.getPrim('/NodeGraphMaterialRoot')!)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, id + 'InvalidConnectableInMaterial',
        ['/NodeGraphMaterialRoot', '/NodeGraphMaterialRoot/NodeGraph/Material'],
        'Connectable </NodeGraphMaterialRoot/NodeGraph/Material> of type '
        + 'Material is not a valid connectable descendant of Material '
        + '</NodeGraphMaterialRoot>.')
    }

    // Create an nested imageable under Material, which is also not allowed.
    UsdShadeMaterial.define(usdStage, '/ImageableMaterialRoot')
    UsdShadeNodeGraph.define(usdStage, '/ImageableMaterialRoot/NodeGraph')
    UsdGeomXform.define(usdStage, '/ImageableMaterialRoot/NodeGraph/Xform')
    {
      const errors = await validator!.validate(usdStage.getPrim('/ImageableMaterialRoot')!)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!, id + 'InvalidImageableInMaterial',
        ['/ImageableMaterialRoot', '/ImageableMaterialRoot/NodeGraph/Xform'],
        'Imageable </ImageableMaterialRoot/NodeGraph/Xform> of type '
        + 'Xform is not a valid descendant of Material '
        + '</ImageableMaterialRoot>.')
    }

    // GoodMaterials -- just shader and nodegraph
    UsdShadeMaterial.define(usdStage, '/GoodMaterial')
    UsdShadeShader.define(usdStage, '/GoodMaterial/Shader')
    expect(await validator!.validate(usdStage.getPrim('/GoodMaterial')!)).toEqual([])
    UsdShadeNodeGraph.define(usdStage, '/GoodMaterial/NodeGraph')
    expect(await validator!.validate(usdStage.getPrim('/GoodMaterial')!)).toEqual([])
  })

  // testUsdShadeValidators.cpp:610-677.
  it('TestUsdShadeEncapsulationRulesValidator', async () => {
    const registry = UsdValidationRegistry.getInstance()
    const validator = registry.getOrLoadValidatorByName(UsdShadeValidatorNameTokens.encapsulationValidator)
    expect(validator).toBeDefined()

    const usdStage = Stage.createNew()

    // Create a Material > Shader > Shader hierarchy
    UsdShadeMaterial.define(usdStage, '/RootMaterial')
    const topShader = UsdShadeShader.define(usdStage, '/RootMaterial/Shader')
    const insideShader = UsdShadeShader.define(usdStage, '/RootMaterial/Shader/InsideShader')

    {
      // Verify error that does not allow a connectable to be parented by
      // non-container connectable
      const errors = await validator!.validate(insideShader.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:EncapsulationRulesValidator.ConnectableInNonContainer',
        ['/RootMaterial/Shader/InsideShader'],
        'Connectable Shader </RootMaterial/Shader/InsideShader> cannot '
        + 'reside under a non-Container Connectable Shader')
    }

    // Verify the first Shader is valid
    expect(await validator!.validate(topShader.prim)).toEqual([])

    {
      // Create a Material > Scope > Shader hierarchy
      usdStage.removePrim('/RootMaterial/Shader/InsideShader')
      usdStage.removePrim('/RootMaterial/Shader')
      UsdGeomScope.define(usdStage, '/RootMaterial/Scope')
      const insideScopeShader = UsdShadeShader.define(usdStage, '/RootMaterial/Scope/InsideShader')
      // Verify error that does not allow a connectable to have any
      // non-connectable container ancestors
      const errors = await validator!.validate(insideScopeShader.prim)
      expect(errors.length).toBe(1)
      validatePrimError(errors[0]!,
        'usdShadeValidators:EncapsulationRulesValidator.InvalidConnectableHierarchy',
        ['/RootMaterial/Scope/InsideShader'],
        'Connectable Shader </RootMaterial/Scope/InsideShader> can only '
        + 'have Connectable Container ancestors up to Material ancestor '
        + '</RootMaterial>, but its parent Scope is a Scope.')
    }
  })
})
