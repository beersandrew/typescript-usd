// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdConstantInput.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdConstantInput.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdConstantInput/resources), as main() does
// with PlugRegistry::RegisterPlugins. The registered test
// (pxr/exec/execUsd/CMakeLists.txt:215-236) runs the program, normalizes
// testConstantInput.dot with normalizeDotFiles.py and DIFF_COMPAREs
// testConstantInput.out with the baseline; here the program runs in a fresh
// temporary directory and the comparison follows it in the same it()
// (testHelpers.ts _DiffCompare). Opening a stage is asynchronous here.
// Constant(value) names the value's type (Constant(type, value));
// CustomType is a JS class registered under its C++ name. ASSERT_EQ is
// expect; scope-end destructors are Destroy().

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfRegistryManager, TfStringify, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { Vdf_SetSizeof } from 'typescript-usd/vdf'
import {
  Constant, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecSystem, ExecTypeRegistry,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import {
  _DiffCompare, _MakeTestDirectory, _NormalizeConstantInputDotFile, _OpenStage, _RegisterTestResources,
} from '../testHelpers.ts'

const T = VtValueTypes

class CustomType {
  constructor(readonly i: number, readonly s: string) {}

  // The implicit copy constructor (the VtValue/VdfVector copy of a held
  // value, docs/openexec-x1.md 4.1 "Copy constructor").
  Clone(): CustomType {
    return new CustomType(this.i, this.s)
  }

  // operator==
  equals(other: unknown): boolean {
    return other instanceof CustomType && other.i === this.i && other.s === this.s
  }
}
const CustomTypeType = TfType.define('CustomType')
// sizeof(CustomType) in the native build (macOS arm64, libc++),
// the TS stand-in for sizeof (pxr/exec/vdf/src/estimateSize.ts).
Vdf_SetSizeof(CustomTypeType, 32)

// TF_REGISTRY_FUNCTION(ExecTypeRegistry)
TfRegistryManager.add('ExecTypeRegistry', () => {
  ExecTypeRegistry.registerType(CustomTypeType, new CustomType(0, ''))
})

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  computeConstantCustomType: 'computeConstantCustomType',
  computeConstantDouble: 'computeConstantDouble',
  computeConstantString: 'computeConstantString',
  computeMultipleConstants: 'computeMultipleConstants',
  constantCustomType: 'constantCustomType',
  constantDouble: 'constantDouble',
  constantString: 'constantString',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdConstantInputCustomSchema', (self) => {
    self.primComputation(_tokens.computeConstantDouble)
      .Callback(T.double, (ctx: VdfContext) => {
        return ctx.getInputValue<number>(T.double, _tokens.constantDouble)
      })
      .inputs(
        Constant(T.double, 1.0).inputName(_tokens.constantDouble),
      )

    self.primComputation(_tokens.computeConstantString)
      .Callback(T.string, (ctx: VdfContext) => {
        return ctx.getInputValue<string>(T.string, _tokens.constantString)
      })
      .inputs(
        Constant(T.string, 'a string').inputName(_tokens.constantString),
      )

    self.primComputation(_tokens.computeConstantCustomType)
      .Callback(CustomTypeType, (ctx: VdfContext) => {
        return ctx.getInputValue<CustomType>(CustomTypeType, _tokens.constantCustomType)
      })
      .inputs(
        Constant(CustomTypeType, new CustomType(-1, 'a string'))
          .inputName(_tokens.constantCustomType),
      )

    self.primComputation(_tokens.computeMultipleConstants)
      .Callback(T.string, (ctx: VdfContext) => {
        let result = ''

        result +=
          TfStringify(ctx.getInputValue<number>(T.double, _tokens.constantDouble))
        result += '\n'

        result += ctx.getInputValue<string>(T.string, _tokens.constantString)
        result += '\n'

        const value =
          ctx.getInputValue<CustomType>(CustomTypeType, _tokens.constantCustomType)
        result += `${value.i} ${value.s}`

        return result
      })
      .inputs(
        Constant(T.double, 1.0).inputName(_tokens.constantDouble),
        Constant(T.string, 'a string').inputName(_tokens.constantString),
        Constant(CustomTypeType, new CustomType(-1, 'a string'))
          .inputName(_tokens.constantCustomType),
      )
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdConstantInput')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdConstantInput')
}

describe('testExecUsdConstantInput', () => {
  // Test the metadata computation input yield the expected values.
  it('TestConstantInput', async () => {
    const testDirectory = _MakeTestDirectory('testExecUsdConstantInput')

    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(prim, _tokens.computeConstantDouble),
      new ExecUsdValueKey(prim, _tokens.computeConstantString),
      new ExecUsdValueKey(prim, _tokens.computeConstantCustomType),
      new ExecUsdValueKey(prim, _tokens.computeMultipleConstants),
    ])

    TF_AXIOM(request.isValid())

    const view = execSystem.compute(request)
    let index = 0

    new ExecSystem.Diagnostics(execSystem).graphNetwork(
      join(testDirectory, 'testConstantInput.dot'))

    let v = view.Get(index++)
    TF_AXIOM(v.IsHolding(T.double))
    expect(v.Get<number>()).toBe(1.0)

    v = view.Get(index++)
    TF_AXIOM(v.IsHolding(T.string))
    expect(v.Get<string>()).toBe('a string')

    v = view.Get(index++)
    TF_AXIOM(v.IsHolding(CustomTypeType))
    expect(v.Get<CustomType>().i).toBe(-1)
    expect(v.Get<CustomType>().s).toBe('a string')

    v = view.Get(index++)
    TF_AXIOM(v.IsHolding(T.string))
    expect(v.Get<string>()).toBe(
      '1\n' +
      'a string\n' +
      '-1 a string')

    request.destroy()
    execSystem.destroy()

    // POST_COMMAND normalizeDotFiles.py testConstantInput.dot;
    // DIFF_COMPARE testConstantInput.out
    _DiffCompare('testExecUsdConstantInput', testDirectory, 'testConstantInput',
      _NormalizeConstantInputDotFile)
  })
})
