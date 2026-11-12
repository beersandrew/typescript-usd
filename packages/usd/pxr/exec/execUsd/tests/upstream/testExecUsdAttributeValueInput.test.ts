// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdAttributeValueInput.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdAttributeValueInput.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdAttributeValueInput/resources), as main()
// does with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous
// here (testHelpers.ts _OpenStage). Template value types are TfType
// arguments; std::vector<GfVec3f> is a JS array registered under its C++
// name. ASSERT_EQ is expect (GfVec3f compares with equals); scope-end
// destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator, Vdf_SetSizeof } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecTypeRegistry,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

const StdVectorGfVec3fType = TfType.define('std::vector<GfVec3f>')
// sizeof(std::vector<GfVec3f>) in the native build (macOS arm64, libc++),
// the TS stand-in for sizeof (pxr/exec/vdf/src/estimateSize.ts).
Vdf_SetSizeof(StdVectorGfVec3fType, 24)

// TF_REGISTRY_FUNCTION(ExecTypeRegistry)
TfRegistryManager.add('ExecTypeRegistry', () => {
  ExecTypeRegistry.registerType(StdVectorGfVec3fType, [] as GfVec3f[])
})

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  computeDoubleAttr: 'computeDoubleAttr',
  computeStringAttr: 'computeStringAttr',
  computeArrayAttr: 'computeArrayAttr',
  doubleAttr: 'doubleAttr',
  stringAttr: 'stringAttr',
  arrayAttr: 'arrayAttr',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdAttributeValueInputCustomSchema', (self) => {
    self.primComputation(_tokens.computeDoubleAttr)
      .Callback(T.double, (ctx: VdfContext) => {
        return ctx.getInputValue<number>(T.double, _tokens.doubleAttr)
      })
      .inputs(
        AttributeValue(T.double, _tokens.doubleAttr),
      )

    self.primComputation(_tokens.computeStringAttr)
      .Callback(T.string, (ctx: VdfContext) => {
        return ctx.getInputValue<string>(T.string, _tokens.stringAttr)
      })
      .inputs(
        AttributeValue(T.string, _tokens.stringAttr),
      )

    self.primComputation(_tokens.computeArrayAttr)
      .Callback(StdVectorGfVec3fType, (ctx: VdfContext) => {
        const rIt = new VdfReadIterator<GfVec3f>(T.GfVec3f, ctx, _tokens.arrayAttr)

        const result: GfVec3f[] = []
        // result.reserve(rIt.ComputeSize())
        rIt.computeSize()
        for (let i = 0; !rIt.isAtEnd(); rIt.increment(), ++i) {
          result.push(rIt.deref())
        }

        return result
      })
      .inputs(
        AttributeValue(T.GfVec3f, _tokens.arrayAttr),
      )
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdAttributeValueInput')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdAttributeValueInput')
}

describe('testExecUsdAttributeValueInput', () => {
  // Test the attribute inputs yield the expected values.
  it('TestAttributeValueInput', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
            double doubleAttr = 1.0
            string stringAttr = "a string"
            Vec3f[] arrayAttr = [(0, 0, 0), (0, 1, 0), (1, 1, 1)]
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(prim, _tokens.computeDoubleAttr),
      new ExecUsdValueKey(prim, _tokens.computeStringAttr),
      new ExecUsdValueKey(prim, _tokens.computeArrayAttr),
    ])

    TF_AXIOM(request.isValid())

    const view = execSystem.compute(request)

    let v = view.Get(0)
    TF_AXIOM(v.IsHolding(T.double))
    expect(v.Get<number>()).toBe(1.0)

    v = view.Get(1)
    TF_AXIOM(v.IsHolding(T.string))
    expect(v.Get<string>()).toBe('a string')

    v = view.Get(2)
    TF_AXIOM(v.IsHolding(StdVectorGfVec3fType))
    const expected = [
      new GfVec3f(0, 0, 0),
      new GfVec3f(0, 1, 0),
      new GfVec3f(1, 1, 1)]
    const computed = v.Get<GfVec3f[]>()
    expect(computed.length).toBe(expected.length)
    for (let i = 0; i < computed.length; ++i) {
      expect(computed[i]!.equals(expected[i]!),
        `Expected computed[i] == '${expected[i]}'; got '${computed[i]}'`).toBe(true)
    }

    request.destroy()
    execSystem.destroy()
  })
})
