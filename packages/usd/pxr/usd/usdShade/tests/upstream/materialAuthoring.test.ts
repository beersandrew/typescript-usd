// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeMaterialAuthoring.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeMaterialAuthoring.py
// (OpenUSD 26.11.1). Line numbers below cite that file. The registration
// (pxr/usd/usdShade/CMakeLists.txt:102-108) also DIFF_COMPAREs the saved
// char_shading.usda and char_shading_compact.usda against the baselines in
// testenv/testUsdShadeMaterialAuthoring/baseline, copied verbatim to
// fixtures/testUsdShadeMaterialAuthoring/baseline (Pixar, TOST 1.0
// license); here the root layers' exported text is compared with
// them instead of saving files. Variant and reference authoring is
// asynchronous in TypeScript; Python's `with` edit contexts are
// EditContext objects that are closed explicitly.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'
import { Scope, setStageMetersPerUnit, setStageUpAxis } from 'typescript-usd/usdGeom'
import { Material, Shader, getConnectedSourcePath } from '../../src/index.ts'

const baseline = (name: string) => readFileSync(
  new URL(`./fixtures/testUsdShadeMaterialAuthoring/baseline/${name}`, import.meta.url), 'utf8')

describe('TestUsdShadeMaterialAuthoring', () => {
  // testUsdShadeMaterialAuthoring.py:12-231 (test_Basic).
  it('test_Basic', async () => {
    const shadingDefs = '/ShadingDefs'

    // :17-20 completely swap out the surface shader between wet and dry.
    const shadeVariations = ['Wet', 'Dry']

    // :22-25 for each "base" a Material, and a single Shader as the surface.
    const materialBases = ['Hair', 'Skin', 'Nails']

    // :27-33 all Shaders live in a common, external prim referenced into
    // each Material.
    const shadersPath = `${shadingDefs}/Shaders`
    const materialsPath = `${shadingDefs}/Materials`

    // :35-46
    const makeShadingPath = (base: string, variant: string, category: string, referencedPropName?: string) =>
      referencedPropName
        ? `${materialsPath}/${base}Material/${base}${variant}${category}.${referencedPropName}`
        : `${shadersPath}/${base}${variant}${category}`
    // :48-53
    const makeSurfacePath = (base: string, variant: string, referencedPropName?: string) =>
      makeShadingPath(base, variant, 'Surface', referencedPropName)
    const makeDisplacementPath = (base: string, variant: string, referencedPropName?: string) =>
      makeShadingPath(base, variant, 'Displacement', referencedPropName)
    // :55-59
    const makeMaterialPath = (base: string, prop?: string) =>
      `${materialsPath}/${base}Material${prop ? `.${prop}` : ''}`

    // :61-105 (SetupShading).
    const setupShading = async (stage: Stage): Promise<Prim[]> => {
      // First create the shading prims.
      Scope.define(stage, shadersPath)
      Scope.define(stage, materialsPath)

      const allMaterials: Prim[] = []
      for (const material of materialBases) {
        // Create and remember each Material, and reference in the complete
        // set of shaders onto each Material prim.
        const materialPrim = Material.define(stage, makeMaterialPath(material))
        await materialPrim.prim.getReferences().addReference('', shadersPath)
        allMaterials.push(materialPrim.prim)

        for (const variant of shadeVariations) {
          // .. and as we create each surface, bind the associated material's
          // variant to it.
          const surface = Shader.define(stage, makeSurfacePath(material, variant))
          const surfaceOut = surface.createOutput('surface', 'token')

          const disp = Shader.define(stage, makeDisplacementPath(material, variant))
          const dispOut = disp.createOutput('displacement', 'token')

          const ctx = await materialPrim.getEditContextForVariant(variant)
          try {
            const surfaceOutput = materialPrim.createSurfaceOutput()
            surfaceOutput.connectToSource(
              makeSurfacePath(material, variant, surfaceOut.getFullName()))

            const displacementOutput = materialPrim.createDisplacementOutput()
            displacementOutput.connectToSource(
              makeDisplacementPath(material, variant, dispOut.getFullName()))
          } finally {
            ctx.close()
          }
        }
      }

      // Change root prim to an over so it is not traversed by the stage.
      stage.getPrim(shadingDefs)!.setSpecifier('over')

      return allMaterials
    }

    // :107-163 (ValidateMaterial).
    const validateMaterial = async (stage: Stage, rootPrim: Prim) => {
      const hairPath = '/ModelShading/Materials/HairMaterial'
      const hairPrim = stage.getPrim(hairPath)!
      const hairMaterial = new Material(hairPrim)
      expect(hairMaterial.isValid()).toBe(true)

      // Validate wet surface terminal connection.
      const wetHairSurfPath = `${hairPath}/HairWetSurface.outputs:surface`
      let surfaceTerminal = hairMaterial.getSurfaceOutput()
      expect(surfaceTerminal.hasConnectedSource()).toBe(true)
      let connectedSurfaceInfo = surfaceTerminal.getConnectedSources()[0][0]!
      expect(getConnectedSourcePath(connectedSurfaceInfo)).toBe(wetHairSurfPath)

      // Validate wet displacement terminal connection.
      const wetHairDispPath = `${hairPath}/HairWetDisplacement.outputs:displacement`
      let dispTerminal = hairMaterial.getDisplacementOutput()
      expect(dispTerminal.hasConnectedSource()).toBe(true)
      let connectedDispInfo = dispTerminal.getConnectedSources()[0][0]!
      expect(getConnectedSourcePath(connectedDispInfo)).toBe(wetHairDispPath)

      // Change the root-level variantSet, which should in turn change the
      // Material's. (Python's SetSelection returns true.)
      await rootPrim.getVariantSets().getVariantSet('materialVariant').setVariantSelection('Dry')
      expect(rootPrim.getVariantSets().getVariantSelection('materialVariant')).toBe('Dry')
      expect(hairMaterial.isValid()).toBe(true)

      // Validate dry surface terminal connection.
      const dryHairSurfPath = `${hairPath}/HairDrySurface.outputs:surface`
      surfaceTerminal = hairMaterial.getSurfaceOutput()
      expect(surfaceTerminal.hasConnectedSource()).toBe(true)
      connectedSurfaceInfo = surfaceTerminal.getConnectedSources()[0][0]!
      expect(getConnectedSourcePath(connectedSurfaceInfo)).toBe(dryHairSurfPath)

      // Validate dry displacement terminal connection.
      const dryHairDispPath = `${hairPath}/HairDryDisplacement.outputs:displacement`
      dispTerminal = hairMaterial.getDisplacementOutput()
      expect(dispTerminal.hasConnectedSource()).toBe(true)
      connectedDispInfo = dispTerminal.getConnectedSources()[0][0]!
      expect(getConnectedSourcePath(connectedDispInfo)).toBe(dryHairDispPath)
    }

    // :165-175 (SetupStage).
    const setupStage = (stage: Stage): Prim => {
      setStageUpAxis(stage, 'Y')
      setStageMetersPerUnit(stage, 0.01) // UsdGeom.LinearUnits.centimeters
      // Create this prim first, since it's the "entrypoint" to the layer,
      // and we want it to appear at the top.
      const rootPrim = stage.definePrim('/ModelShading')
      stage.setDefaultPrim(rootPrim)
      return rootPrim
    }

    // :177-194 char_shading.usda
    let stage = Stage.createNew()
    let rootPrim = setupStage(stage)

    // Next, create a tree that will "sit on top of ShadingDefs" to switch
    // the materials in concert.
    let allMaterials = await setupShading(stage)
    const bindingVariantRoot = stage.overridePrim('/MaterialBindingVariants')
    expect(await Material.createMasterMaterialVariant(bindingVariantRoot, allMaterials)).toBe(true)

    // Finally, this is how we stitch them together into an interface.
    let refs = rootPrim.getReferences()
    await refs.addReference('', '/MaterialBindingVariants')
    await refs.addReference('', shadingDefs)

    // stage.Save() and the DIFF_COMPARE of char_shading.usda.
    expect(stage.getRootLayer().exportToString()).toBe(baseline('char_shading.usda'))

    // Now let's do some validation that it performs as expected.
    await validateMaterial(stage, rootPrim)

    // :197-219 char_shading_compact.usda: the master variant on a composed
    // stage in which rootPrim already references the ShadingDefs.
    stage = Stage.createNew()
    rootPrim = setupStage(stage)

    await setupShading(stage)
    // Reference the shading directly.
    refs = rootPrim.getReferences()
    await refs.addReference('', shadingDefs)

    // Now pick up the newly composed material prims.
    allMaterials = [
      stage.getPrim('/ModelShading/Materials/HairMaterial')!,
      stage.getPrim('/ModelShading/Materials/SkinMaterial')!,
      stage.getPrim('/ModelShading/Materials/NailsMaterial')!,
    ]

    expect(await Material.createMasterMaterialVariant(rootPrim, allMaterials)).toBe(true)

    expect(stage.getRootLayer().exportToString()).toBe(baseline('char_shading_compact.usda'))

    await validateMaterial(stage, rootPrim)

    // :221-231
    const hairPrim = stage.getPrim('/ModelShading/Materials/HairMaterial')!
    const hairMaterial = new Material(hairPrim)
    const interfaceInput = hairMaterial.createInput('myParam', 'float')
    interfaceInput.setDocumentation('this is my float')
    interfaceInput.setDisplayGroup('numbers')

    const byName = hairMaterial.getInput('myParam')
    expect(byName.getAttr().isValid()).toBe(true)
    expect(byName.getDocumentation()).toBe('this is my float')
    expect(byName.getDisplayGroup()).toBe('numbers')

    const plain = hairPrim.getAttr(byName.getFullName())!
    expect(plain.isValid()).toBe(true)
    expect(plain.typeName).toBe('float')
  })
})
