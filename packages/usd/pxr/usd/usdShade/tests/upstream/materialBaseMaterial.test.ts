// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeMaterialBaseMaterial.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeMaterialBaseMaterial.py
// Base-material (specializes) inheritance: SetBaseMaterial[Path], GetBaseMaterial,
// HasBaseMaterial, and IsSourceConnectionFromBaseMaterial.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, Shader, isSourceConnectionFromBaseMaterial } from '../../src/index.ts'

describe('UsdShade MaterialBaseMaterial', () => {
  it('resolves inherited shaders, values, and connections through a specialize arc', async () => {
    const stage = Stage.createNew()
    const materialsPath = '/ModelShading/Materials'

    // Parent material with an interface input and two shaders, one of whose
    // inputs is connected to the other's output.
    const parentMaterialPath = `${materialsPath}/ParentMaterial`
    const parentMaterial = Material.define(stage, parentMaterialPath)
    parentMaterial.createInput('floatVal', 'float')

    const parentShader1 = Shader.define(stage, `${parentMaterialPath}/Shader_1`)
    const floatShaderInput = parentShader1.createInput('floatInput', 'float')
    floatShaderInput.set(1.0)

    const parentShader2 = Shader.define(stage, `${parentMaterialPath}/Shader_2`)
    const floatShaderOutput = parentShader2.createOutput('floatOutput', 'float')

    expect(floatShaderInput.connectToSource(floatShaderOutput)).toBe(true)
    expect(floatShaderInput.hasConnectedSource()).toBe(true)
    // The parent's own connection is local, not from a base material.
    expect(isSourceConnectionFromBaseMaterial(stage, floatShaderInput.fullPath)).toBe(false)
    expect(parentMaterial.hasBaseMaterial()).toBe(false)

    // Two child materials: one via SetBaseMaterial, one via SetBaseMaterialPath.
    const child1 = Material.define(stage, `${materialsPath}/ChildMaterial_1`)
    await child1.setBaseMaterial(parentMaterial)

    const child2 = Material.define(stage, `${materialsPath}/ChildMaterial_2`)
    await child2.setBaseMaterialPath(parentMaterialPath)

    await stage.flushChanges()

    for (const child of [child1, child2]) {
      expect(child.hasBaseMaterial()).toBe(true)
      expect(child.getBaseMaterialPath()).toBe(parentMaterialPath)
      expect(child.getBaseMaterial()?.path).toBe(parentMaterialPath)

      // Inheritance is resolved: the child has the parent's Shader_1.
      const childShaderPath = `${child.path}/Shader_1`
      const childShaderPrim = stage.getPrim(childShaderPath)
      expect(childShaderPrim).toBeTruthy()
      expect(Shader.is(childShaderPrim!)).toBe(true)

      // The inherited input value resolves to 1.0.
      const childInputPath = `${childShaderPath}.inputs:floatInput`
      expect(stage.get(childInputPath)?.getValue()).toBe(1.0)

      // The inherited connection is recognized as coming from the base material.
      expect(isSourceConnectionFromBaseMaterial(stage, childInputPath)).toBe(true)
    }
  })
})
