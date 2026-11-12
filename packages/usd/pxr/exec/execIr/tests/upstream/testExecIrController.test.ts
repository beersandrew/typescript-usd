// Ported from OpenUSD 26.11.1:
//  pxr/exec/execIr/testenv/testExecIrController.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/testenv/testExecIrController.cpp
//
// Adaptations:
// - Importing typescript-usd/execIr registers the execIr schemas and
//   computations, as linking execIr does; typescript-usd/execGeom registers
//   the execGeom plugin. Library plugins load asynchronously on the web, so
//   each test awaits _interim_ExecLoadPluginsAsync() before compiling
//   (docs/openexec-x1.md decision D4).
// - The codeless test schemas are registered from the upstream testenv
//   resources (fixtures/testExecIrController/resources, copied verbatim), as
//   main() (lines 816-830) does with PlugRegistry::RegisterPlugins; the
//   plugInfo.json "#" comment lines are stripped before JSON.parse, as
//   PlugRegistry's reader does.
// - The test's EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA blocks stay in this file,
//   as upstream. ExecIrControllerBuilder's template value types are TfType
//   arguments, and ~ExecIrControllerBuilder at the end of each block is
//   builder.Destroy().
// - UsdStage::Open of a layer is the asynchronous Stage.open; the stage and
//   layer API is typescript-usd's camelCase API.
// - ASSERT_EQ (lines 40-51) is _ASSERT_EQ with strict equality, raising
//   TF_FATAL_ERROR (which throws).
// - _EnsureNoErrors (lines 53-59) is a TfErrorMark checked with TF_VERIFY at
//   the end of its scope.
// - std::distance(mark.begin(), mark.end()) is mark.GetErrors().length.

import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import {
  TF_AXIOM, TF_FATAL_ERROR, TF_VERIFY, TfErrorMark,
} from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { ExecBuiltinComputations, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from 'typescript-usd/exec'
import { _interim_ExecLoadPluginsAsync } from 'typescript-usd/exec/_internal'
import {
  ExecUsdSystem, ExecUsdValueKey, type ExecUsdValueOverrideVector,
} from 'typescript-usd/execUsd'
import type { VdfContext } from 'typescript-usd/vdf'
import 'typescript-usd/execGeom'
import {
  ExecIrComputations, ExecIrControllerBuilder, type ExecIrResult,
} from 'typescript-usd/execIr'

const T = VtValueTypes

// ASSERT_EQ (testExecIrController.cpp:40-51)
function _ASSERT_EQ(expr: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    TF_FATAL_ERROR(`Expected ${expr} == '${String(expected)}'; got '${String(actual)}'`)
  }
}

// struct _EnsureNoErrors (testExecIrController.cpp:53-59)
async function _WithEnsureNoErrors(body: () => Promise<void>): Promise<void> {
  const mark = new TfErrorMark()
  try {
    await body()
  } finally {
    TF_VERIFY(mark.isClean(), 'mark.IsClean()')
    if (!mark.isClean()) {
      throw new Error('_EnsureNoErrors: errors were posted: ' +
        mark.getErrors().map(e => e.getCommentary()).join('; '))
    }
    mark.dispose()
  }
}

// TF_DEFINE_PRIVATE_TOKENS(_tokens, ...) (testExecIrController.cpp:61-68)
const _tokens = {
  input: 'input',
  invertibleInput: 'invertibleInput',
  nonInvertibleInput: 'nonInvertibleInput',
  output: 'output',
} as const

async function _OpenStage(contents: string): Promise<UsdStage> {
  TF_AXIOM(await _interim_ExecLoadPluginsAsync())
  const layer = SdfLayer.createAnonymous('.usda')
  layer.importFromString(contents)
  return UsdStage.open(layer)
}

function _D(v: number): VtValue {
  return VtValue.create(v, T.double)
}

// AddOneController
//
// A controller with one double-valued input and one double-valued output, where
// output = input + 1
//
// testExecIrController.cpp:70-85
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecIrControllerAddOneController', (self) => {
  const builder = new ExecIrControllerBuilder(
    self, _AddOne_ForwardCompute, _AddOne_InverseCompute)

  builder.invertibleInputAttribute(T.double, _tokens.input)
  builder.invertibleOutputAttribute(T.double, _tokens.output)

  // ~ExecIrControllerBuilder at the end of the block.
  builder.destroy()
})

// The forward compute function.
//
// The context provides input attribute values. The function is responsible for
// computing output values, returning the values in a map from invertible input
// name to VtValue.
//
// testExecIrController.cpp:87-105
function _AddOne_ForwardCompute(ctx: VdfContext): ExecIrResult {
  const input = ctx.getInputValue<number>(T.double, _tokens.input)

  // Create a map to store the results.
  const result: ExecIrResult = new Map()

  // Compute and store the output value.
  result.set(_tokens.output, _D(input + 1.0))

  return result
}

// The inverse compute function.
//
// The context provides desired values for all invertible outputs. The
// function is responsible for computing the invertible input values that
// satisfy the desired output values, returning the values in a map from
// invertible input name to VtValue.
//
// testExecIrController.cpp:107-126
function _AddOne_InverseCompute(ctx: VdfContext): ExecIrResult {
  // Create a map to store the results
  const result: ExecIrResult = new Map()

  const output = ctx.getInputValue<number>(T.double, _tokens.output)

  // Compute and store the input value
  result.set(_tokens.input, _D(output - 1.0))

  return result
}

// testExecIrController.cpp:128-175
async function Test_BasicForwardCompute(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`
        #usda 1.0

        def AddOneController "PlusOne" {
            double input = 10.0
        }
        `)
    TF_AXIOM(usdStage)

    const prim = usdStage.getPrim('/PlusOne')!
    TF_AXIOM(prim)
    const output = prim.getAttr(_tokens.output)!
    TF_AXIOM(output.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(output, ExecBuiltinComputations.computeValue),
    ])
    TF_AXIOM(request.isValid())

    {
      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(!value.IsEmpty())

      _ASSERT_EQ('value.Get<double>()', value.Get<number>(), 11.0)
    }

    // Now set the input and compute again.
    {
      const input = prim.getAttr(_tokens.input)!
      TF_AXIOM(input.isValid())
      input.set(2.0)

      const cache = execSystem.compute(request)
      const value = cache.Get(0)
      TF_AXIOM(!value.IsEmpty())
      _ASSERT_EQ('value.Get<double>()', value.Get<number>(), 3.0)
    }
  })
}

// testExecIrController.cpp:177-228
async function Test_BasicInverseCompute(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    const usdStage = await _OpenStage(`
        #usda 1.0

        def AddOneController "PlusOne" {
        }
        `)
    TF_AXIOM(usdStage)

    const prim = usdStage.getPrim('/PlusOne')!
    TF_AXIOM(prim)
    const output = prim.getAttr(_tokens.output)!
    const input = prim.getAttr(_tokens.input)!
    TF_AXIOM(output.isValid() && input.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(input, ExecIrComputations.computeDesiredValue),
    ])
    TF_AXIOM(request.isValid())

    // Compute the input value that produces a given desired output value.
    {
      const overrides: ExecUsdValueOverrideVector = [
        {
          valueKey: new ExecUsdValueKey(output, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(10.0),
        },
      ]
      const cache = execSystem.computeWithOverrides(request, overrides)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 9.0)
    }

    // Compute again with a different desired output value.
    {
      const overrides: ExecUsdValueOverrideVector = [
        {
          valueKey: new ExecUsdValueKey(output, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(3.0),
        },
      ]
      const cache = execSystem.computeWithOverrides(request, overrides)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 2.0)
    }
  })
}

// AddController
//
// This controller has one invertible input attribute, one non-invertible input
// attribute, and one invertible output attribute, all with value type
// double. The forward computation produces an output value that is the sum of
// the two input values.
//
// Note that this is a "spanning" controller, a controller with a forward
// compute function that can produce every value in the domain of its invertible
// output attributes. I.e., every inversion operation through a spanning
// controller produces invertible input values that satisfy the desired output
// values.
//
// testExecIrController.cpp:230-254
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecIrControllerAddController', (self) => {
  const builder = new ExecIrControllerBuilder(
    self, _Add_ForwardCompute, _Add_InverseCompute)

  builder.invertibleInputAttribute(T.double, _tokens.invertibleInput)
  builder.nonInvertibleInputAttribute(T.double, _tokens.nonInvertibleInput)
  builder.invertibleOutputAttribute(T.double, _tokens.output)

  // ~ExecIrControllerBuilder at the end of the block.
  builder.destroy()
})

// testExecIrController.cpp:256-270
function _Add_ForwardCompute(ctx: VdfContext): ExecIrResult {
  const invertibleInput =
    ctx.getInputValue<number>(T.double, _tokens.invertibleInput)
  const nonInvertibleInput =
    ctx.getInputValue<number>(T.double, _tokens.nonInvertibleInput)

  const result: ExecIrResult = new Map()

  // The output value is the sum of the input values.
  result.set(_tokens.output, _D(invertibleInput + nonInvertibleInput))

  return result
}

// testExecIrController.cpp:272-287
function _Add_InverseCompute(ctx: VdfContext): ExecIrResult {
  // Create a map to store the results
  const result: ExecIrResult = new Map()

  const output =
    ctx.getInputValue<number>(T.double, _tokens.output)
  const nonInvertibleInput =
    ctx.getInputValue<number>(T.double, _tokens.nonInvertibleInput)

  // The inverse is the output value minus the non-invertible input value.
  result.set(_tokens.invertibleInput, _D(output - nonInvertibleInput))

  return result
}

// Test inversion operations through multiple controllers, where an invertible
// output is connected to an invertible input.
//
// In this case, we specify a single desired output value and compute a single
// desired input value, and we invoke the inverses of two controllers to do so.
//
// testExecIrController.cpp:289-376
async function Test_InvertThroughMultiple(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    // Create a scene with two spanning controllers, one of which has an
    // invertible input that is connected to the output of the other.
    const usdStage = await _OpenStage(`
        #usda 1.0

        def AddController "C1" {
            double invertibleInput = 1
            double nonInvertibleInput = 2
        }

        def AddController "C2" {
            double invertibleInput.connect = </C1.output>
            double nonInvertibleInput = 3
        }
        `)
    TF_AXIOM(usdStage)

    const C1 = usdStage.getPrim('/C1')!
    const C2 = usdStage.getPrim('/C2')!
    TF_AXIOM(C1 && C2)

    const input = C1.getAttr(_tokens.invertibleInput)!
    const output = C2.getAttr(_tokens.output)!
    TF_AXIOM(input.isValid() && output.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const outputRequest = execSystem.buildRequest([
      new ExecUsdValueKey(output),
    ])
    TF_AXIOM(outputRequest.isValid())

    // Compute the forward values for both outputs produced by the authored
    // scene.
    {
      const cache = execSystem.compute(outputRequest)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 6.0)
    }

    // To test if controller inversion works correctly, it's important to choose
    // a desired output value that doesn't match those currently produced by the
    // authored scene.
    const desiredOutputValue = 20.0

    const expectedInvertedInputValue = 15.0

    // Compute the inverse value for the input that satisfies the given desired
    // output value.
    {
      const desiredValueRequest = execSystem.buildRequest([
        new ExecUsdValueKey(
          input, ExecIrComputations.computeDesiredValue),
      ])
      TF_AXIOM(desiredValueRequest.isValid())

      const overrides: ExecUsdValueOverrideVector = [
        {
          valueKey: new ExecUsdValueKey(output, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(desiredOutputValue),
        },
      ]
      const cache = execSystem.computeWithOverrides(
        desiredValueRequest, overrides)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(),
        expectedInvertedInputValue)
      desiredValueRequest.destroy()
    }

    // Author the inverted value computed above and verify that it satisfies
    // the goal.
    {
      input.set(expectedInvertedInputValue)

      const cache = execSystem.compute(outputRequest)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(),
        desiredOutputValue)
    }
  })
}

// Test an inversion operation when conflicting goals are specified.
//
// This happens when we specify desired values for more than one invertible
// output that affect the inverted value for a requested invertible input. This
// is an error condition. (Note that we emit an error in this situation,
// regardless of whether the values of the conflicting goals might be consistent
// with a computed inverted value.)
//
// testExecIrController.cpp:378-541
async function Test_ConflictingGoals(): Promise<void> {
  // Create a scene with three controllers, two (C2 and C3) with invertible
  // inputs that have connections to the output of C1
  const usdStage = await _OpenStage(`
        #usda 1.0

        def AddController "C1" {
            double invertibleInput = 1
            double nonInvertibleInput = 2
        }

        def AddController "C2" {
            double invertibleInput.connect = </C1.output>
            double nonInvertibleInput = 1
        }

        def AddController "C3" {
            double invertibleInput.connect = </C1.output>
            double nonInvertibleInput = 2
        }
        `)
  TF_AXIOM(usdStage)

  const input = usdStage.getAttributeAtPath('/C1.invertibleInput')!
  const output1 = usdStage.getAttributeAtPath('/C2.output')!
  const output2 = usdStage.getAttributeAtPath('/C3.output')!
  TF_AXIOM(input?.isValid() && output1?.isValid() && output2?.isValid())

  const execSystem = new ExecUsdSystem(usdStage)

  // Compute the forward values for both outputs produced by the authored
  // scene.
  await _WithEnsureNoErrors(async () => {
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(output1),
      new ExecUsdValueKey(output2),
    ])
    TF_AXIOM(request.isValid())

    const cache = execSystem.compute(request)

    _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 4.0)
    _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(), 5.0)
    request.destroy()
  })

  // Compute the inverse with a goal specified for one of the invertible
  // outputs.
  await _WithEnsureNoErrors(async () => {
    const request = execSystem.buildRequest([
      new ExecUsdValueKey(
        input, ExecIrComputations.computeDesiredValue),
    ])
    TF_AXIOM(request.isValid())

    const desiredOutputValue = 10.0

    const overrides: ExecUsdValueOverrideVector = [
      {
        valueKey: new ExecUsdValueKey(output1, ExecIrComputations.explicitDesiredValue),
        overrideValue: _D(desiredOutputValue),
      },
    ]

    const cache = execSystem.computeWithOverrides(
      request, overrides)

    _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 7.0)
    request.destroy()
  })

  // Attempt to compute the inverse values with goals specified for both
  // invertible outputs. These goals are conflicting because they both
  // influence the result for the requested invertible input.
  {
    const mark = new TfErrorMark()

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(
        input, ExecIrComputations.computeDesiredValue),
    ])
    TF_AXIOM(request.isValid())

    const desiredOutputValue1 = 10.0
    const desiredOutputValue2 = 20.0

    const overrides: ExecUsdValueOverrideVector = [
      {
        valueKey: new ExecUsdValueKey(output1, ExecIrComputations.explicitDesiredValue),
        overrideValue: _D(desiredOutputValue1),
      },
      {
        valueKey: new ExecUsdValueKey(output2, ExecIrComputations.explicitDesiredValue),
        overrideValue: _D(desiredOutputValue2),
      },
    ]

    // We expect no errors up to this point.
    TF_AXIOM(mark.isClean())

    const cache = execSystem.computeWithOverrides(
      request, overrides)

    // We expect exactly one error, due to the presence of conflicting
    // inversion goals.
    _ASSERT_EQ('std::distance(mark.begin(), mark.end())',
      mark.getErrors().length, 1)

    // The computed result is an empty value.
    TF_AXIOM(cache.Get(0).IsEmpty())
    request.destroy()
    mark.dispose()
  }

  // Attempt to invert again, this time specifying desired values for C1's
  // output and C2's output. This is slightly different from the case above
  // because before, the conflicting desired values both flow over incoming
  // connections, but the confict is between an explicitly specified desired
  // value and one computed desired value via an incoming connection.
  {
    const mark = new TfErrorMark()

    const outputC1 = usdStage.getAttributeAtPath('/C1.output')!
    TF_AXIOM(outputC1?.isValid())

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(
        input, ExecIrComputations.computeDesiredValue),
    ])
    TF_AXIOM(request.isValid())

    const desiredOutputValue1 = 10.0
    const desiredOutputValue2 = 20.0

    const overrides: ExecUsdValueOverrideVector = [
      {
        valueKey: new ExecUsdValueKey(output1, ExecIrComputations.explicitDesiredValue),
        overrideValue: _D(desiredOutputValue1),
      },
      {
        valueKey: new ExecUsdValueKey(outputC1, ExecIrComputations.explicitDesiredValue),
        overrideValue: _D(desiredOutputValue2),
      },
    ]

    // We expect no errors up to this point.
    TF_AXIOM(mark.isClean())

    const cache = execSystem.computeWithOverrides(
      request, overrides)

    // We expect exactly one error, due to the presence of conflicting
    // inversion goals.
    _ASSERT_EQ('std::distance(mark.begin(), mark.end())',
      mark.getErrors().length, 1)

    // The computed result is an empty value.
    TF_AXIOM(cache.Get(0).IsEmpty())
    request.destroy()
    mark.dispose()
  }
}

// Test inversion operations involving two controllers, where a non-invertible
// inut is connected to an invertible output.
//
// In this case, we specify a desired output value for each controller and
// compute desired input values for each, and the controller inverses are
// invoked simultanously.
//
// testExecIrController.cpp:543-644
async function Test_DependentControllers(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    // Create a scene with two spanning controllers, one of which has a
    // non-invertible input that is connected to the output of the other.
    const usdStage = await _OpenStage(`
        #usda 1.0

        def AddController "C1" {
            double invertibleInput = 1
            double nonInvertibleInput = 2
        }

        def AddController "C2" {
            double invertibleInput = 3
            double nonInvertibleInput.connect = </C1.output>
        }
        `)
    TF_AXIOM(usdStage)

    const C1 = usdStage.getPrim('/C1')!
    const C2 = usdStage.getPrim('/C2')!
    TF_AXIOM(C1 && C2)

    const input1 = C1.getAttr(_tokens.invertibleInput)!
    const input2 = C2.getAttr(_tokens.invertibleInput)!
    const output1 = C1.getAttr(_tokens.output)!
    const output2 = C2.getAttr(_tokens.output)!
    TF_AXIOM(input1.isValid() && input2.isValid() &&
      output1.isValid() && output2.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const outputRequest = execSystem.buildRequest([
      new ExecUsdValueKey(output1),
      new ExecUsdValueKey(output2),
    ])
    TF_AXIOM(outputRequest.isValid())

    // Compute the forward values for both outputs produced by the authored
    // scene.
    {
      const cache = execSystem.compute(outputRequest)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 3.0)
      _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(), 6.0)
    }

    // To test if controller inversion works correctly, it's important to choose
    // desired output values that don't match those currently produced by the
    // authored scene.
    const desiredOutput1Value = 20.0
    const desiredOutput2Value = 30.0

    const expectedInvertedInput1Value = 18.0
    const expectedInvertedInput2Value = 10.0

    // Compute inverse values for both inputs that satisfy the given desired
    // output values.
    {
      const desiredValueRequest = execSystem.buildRequest([
        new ExecUsdValueKey(
          input1, ExecIrComputations.computeDesiredValue),
        new ExecUsdValueKey(
          input2, ExecIrComputations.computeDesiredValue),
      ])
      TF_AXIOM(desiredValueRequest.isValid())

      const overrides: ExecUsdValueOverrideVector = [
        {
          valueKey: new ExecUsdValueKey(output1, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(desiredOutput1Value),
        },
        {
          valueKey: new ExecUsdValueKey(output2, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(desiredOutput2Value),
        },
      ]
      const cache = execSystem.computeWithOverrides(
        desiredValueRequest, overrides)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(),
        expectedInvertedInput1Value)
      _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(),
        expectedInvertedInput2Value)
      desiredValueRequest.destroy()
    }

    // Author the inverted values computed above and verify that they satisfy
    // the goals.
    {
      input1.set(expectedInvertedInput1Value)
      input2.set(expectedInvertedInput2Value)

      const cache = execSystem.compute(outputRequest)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(),
        desiredOutput1Value)
      _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(),
        desiredOutput2Value)
    }
  })
}

// AddWithClampController
//
// This controller has one invertible input attribute, one non-invertible input
// attribute, and one invertible output attribute, all with value type
// double. The forward computation produces an output value that is the sum of
// the two input values, clamped to a value of 10.0.
//
// Note that this is a "non-spanning" controller, a controller with a forward
// compute function that can't produce all values in the domain of its
// invertible outputs. I.e., for such a controller, an inversion computation may
// produce input values that don't actually acheive the desired output values.
//
// testExecIrController.cpp:646-669
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecIrControllerAddWithClampController', (self) => {
  const builder = new ExecIrControllerBuilder(
    self, _AddWithClamp_ForwardCompute, _AddWithClamp_InverseCompute)

  builder.invertibleInputAttribute(T.double, _tokens.invertibleInput)
  builder.nonInvertibleInputAttribute(T.double, _tokens.nonInvertibleInput)
  builder.invertibleOutputAttribute(T.double, _tokens.output)

  // ~ExecIrControllerBuilder at the end of the block.
  builder.destroy()
})

// testExecIrController.cpp:671-686
function _AddWithClamp_ForwardCompute(ctx: VdfContext): ExecIrResult {
  const invertibleInput =
    ctx.getInputValue<number>(T.double, _tokens.invertibleInput)
  const nonInvertibleInput =
    ctx.getInputValue<number>(T.double, _tokens.nonInvertibleInput)

  const result: ExecIrResult = new Map()

  // The output value is the clamped sum of the input values.
  result.set(_tokens.output,
    _D(Math.min(invertibleInput + nonInvertibleInput, 10.0)))

  return result
}

// testExecIrController.cpp:688-706
function _AddWithClamp_InverseCompute(ctx: VdfContext): ExecIrResult {
  // Create a map to store the results
  const result: ExecIrResult = new Map()

  const output =
    ctx.getInputValue<number>(T.double, _tokens.output)
  const nonInvertibleInput =
    ctx.getInputValue<number>(T.double, _tokens.nonInvertibleInput)

  // The inverse is the output value minus the non-invertible input value,
  // which is the best we can do, but can't achieve every goal, since the
  // clamping means this controller doesn't fully span the space of solutions.
  result.set(_tokens.invertibleInput,
    _D(Math.min(output, 10.0) - nonInvertibleInput))

  return result
}

// Test inversion operations involving two controllers, where a non-invertible
// input is connected to an invertible output--and one of the controllers is
// non-spanning.
//
// This case demonstrates that solves involveing non-spanning controllers work
// correctly, since that requires "inverted forward values," where the inverse
// for the dependent controller sees forward values from the controller it
// depends on, evaluated with the desired output values that are provided as
// overrides for the inverse compute operation.
//
// testExecIrController.cpp:708-814
async function Test_NonSpanningController(): Promise<void> {
  await _WithEnsureNoErrors(async () => {
    // Create a scene with a spanning controller with a non-invertible input
    // that is connected to the output of a non-spanning controller.
    const usdStage = await _OpenStage(`
        #usda 1.0

        def AddWithClampController "C1" {
            double invertibleInput = 1
            double nonInvertibleInput = 2
        }

        def AddController "C2" {
            double invertibleInput = 3
            double nonInvertibleInput.connect = </C1.output>
        }
        `)
    TF_AXIOM(usdStage)

    const C1 = usdStage.getPrim('/C1')!
    const C2 = usdStage.getPrim('/C2')!
    TF_AXIOM(C1 && C2)
    const input1 = C1.getAttr(_tokens.invertibleInput)!
    const input2 = C2.getAttr(_tokens.invertibleInput)!
    TF_AXIOM(input1.isValid() && input2.isValid())
    const output1 = C1.getAttr(_tokens.output)!
    const output2 = C2.getAttr(_tokens.output)!
    TF_AXIOM(output1.isValid() && output2.isValid())

    const execSystem = new ExecUsdSystem(usdStage)
    const outputRequest = execSystem.buildRequest([
      new ExecUsdValueKey(output1),
      new ExecUsdValueKey(output2),
    ])
    TF_AXIOM(outputRequest.isValid())

    // Compute the forward values for both outputs produced by the authored
    // scene.
    {
      const cache = execSystem.compute(outputRequest)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 3.0)
      _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(), 6.0)
    }

    const expectedInvertedInput1Value = 8.0
    const expectedInvertedInput2Value = 20.0

    // Compute inverse values for both inputs that satisfy the given desired
    // output values.
    {
      const desiredValueRequest = execSystem.buildRequest([
        new ExecUsdValueKey(
          input1, ExecIrComputations.computeDesiredValue),
        new ExecUsdValueKey(
          input2, ExecIrComputations.computeDesiredValue),
      ])
      TF_AXIOM(desiredValueRequest.isValid())

      // To test if inversion works correctly in this case, it's important to
      // choose desired output values that can't be satisfied by the
      // non-spanning controller and that don't match those currently produced
      // by the authored scene.
      const overrides: ExecUsdValueOverrideVector = [
        {
          valueKey: new ExecUsdValueKey(output1, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(20.0),
        },
        {
          valueKey: new ExecUsdValueKey(output2, ExecIrComputations.explicitDesiredValue),
          overrideValue: _D(30.0),
        },
      ]
      const cache = execSystem.computeWithOverrides(
        desiredValueRequest, overrides)

      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(),
        expectedInvertedInput1Value)
      _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(),
        expectedInvertedInput2Value)
      desiredValueRequest.destroy()
    }

    // Author the inverted values computed above.
    {
      input1.set(expectedInvertedInput1Value)
      input2.set(expectedInvertedInput2Value)

      const cache = execSystem.compute(outputRequest)

      // As expected, C1 doesn't satisfy the goal given these values, because
      // it is non-spanning; instead we get the maxium value the non-spanning
      // controller will produce. But C2 is able to produce the desired value
      // because 1) it is a spanning controller and 2) its inverse is able to
      // see C1's best-effort solution, via inverted forward values.
      _ASSERT_EQ('cache.Get(0).Get<double>()', cache.Get(0).Get<number>(), 10.0)
      _ASSERT_EQ('cache.Get(1).Get<double>()', cache.Get(1).Get<number>(), 30.0)
    }
  })
}

function _ReadPlugInfo(url: URL): PlugInfo {
  return JSON.parse(readFileSync(url, 'utf8').split('\n')
    .filter(line => !line.trimStart().startsWith('#')).join('\n')) as PlugInfo
}

// main(): load the custom schema (testExecIrController.cpp:816-822).
{
  const resources = new URL('../fixtures/testExecIrController/resources/', import.meta.url)
  const testPlugins = PlugRegistry.GetInstance().RegisterPlugins(
    _ReadPlugInfo(new URL('plugInfo.json', resources)), {
      testExecIrController: {
        'generatedSchema.usda': readFileSync(new URL('generatedSchema.usda', resources), 'utf8'),
      },
    })
  _ASSERT_EQ('testPlugins.size()', testPlugins.length, 1)
  _ASSERT_EQ('testPlugins[0]->GetName()', testPlugins[0]!.getName(), 'testExecIrController')
}

// main() (testExecIrController.cpp:824-829)
describe('testExecIrController', () => {
  it('Test_BasicForwardCompute', Test_BasicForwardCompute)
  it('Test_BasicInverseCompute', Test_BasicInverseCompute)
  it('Test_InvertThroughMultiple', Test_InvertThroughMultiple)
  it('Test_ConflictingGoals', Test_ConflictingGoals)
  it('Test_DependentControllers', Test_DependentControllers)
  it('Test_NonSpanningController', Test_NonSpanningController)
})
