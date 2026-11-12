// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdCycleDetection.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdCycleDetection.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdCycleDetection/resources), as
// ConfigureTestPlugin does with PlugRegistry::RegisterPlugins. Each upstream
// test function makes its own Fixture; opening a stage is asynchronous here,
// so NewSystemFromLayer is awaited. EXPECT_VALIDATION_ERRORS makes an
// ExpectedValidationErrors whose destructor, at the end of the enclosing
// scope, is End(); TF_CALL_CONTEXT is the test function's name; a failed
// check is a thrown TF_FATAL_ERROR as upstream's. `|=` on EfTimeInterval is
// OrAssign. Scope-end destructors are Destroy().

import { describe, it } from 'vitest'
import {
  Enum as TfEnum, TF_AXIOM, TF_FATAL_ERROR, TfErrorMark, type Error as TfError,
} from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { Stage as UsdStage } from 'typescript-usd/usd'
import { EfTimeInterval } from 'typescript-usd/ef'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator, VdfReadIteratorRange } from 'typescript-usd/vdf'
import {
  Computation, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations,
  ExecValidationErrorType, IncomingConnections, NamespaceAncestor, Relationship,
  type ExecRequestIndexSet,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import type { ExecUsdRequest } from '../../src/request.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  cyclicComputation: 'cyclicComputation',
  cyclicAttr: 'cyclicAttr',
  cyclicComputationPairA: 'cyclicComputationPairA',
  cyclicComputationPairB: 'cyclicComputationPairB',
  customRel: 'customRel',
  cyclicRelComputation: 'cyclicRelComputation',
  cyclicAncestorComputation: 'cyclicAncestorComputation',
  ancestor: 'ancestor',
} as const

function ConfigureTestPlugin(): void {
  const testPlugins = _RegisterTestResources('testExecUsdCycleDetection')

  TF_AXIOM(testPlugins.length === 1)
  TF_AXIOM(testPlugins[0]!.getName() === 'testExecUsdCycleDetection')
}

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecUsdCycleDetectionCustomSchema', (self) => {
  // This computation consumes itself as input.
  self.primComputation(_tokens.cyclicComputation)
    .Callback(T.int, (ctx: VdfContext) => {
      return ctx.getInputValue<number>(T.int, _tokens.cyclicComputation)
    })
    .inputs(Computation(T.int, _tokens.cyclicComputation))

  // This attribute introduces a cycle when it is targeted by a connection
  // that is owned by a valid attribute that consumes 'computeValue' across
  // the connection.
  self.attributeExpression(_tokens.cyclicAttr)
    .Callback(T.string, (ctx: VdfContext): string => {
      let result = ''
      for (const it = new VdfReadIterator<string>(
        T.string, ctx, ExecBuiltinComputations.computeValue);
        !it.isAtEnd(); it.increment()) {
        if (result.length !== 0) {
          result += ' '
        }
        result += "'" + it.deref() + "'"
      }
      return result.length === 0 ? '(no value)' : result
    })
    .inputs(
      IncomingConnections(
        T.string, ExecBuiltinComputations.computeValue),
    )

  // The following 2 computations consume each other as input.
  self.primComputation(_tokens.cyclicComputationPairA)
    .Callback(T.int, (ctx: VdfContext) => {
      return ctx.getInputValue<number>(T.int, _tokens.cyclicComputationPairB)
    })
    .inputs(Computation(T.int, _tokens.cyclicComputationPairB))

  self.primComputation(_tokens.cyclicComputationPairB)
    .Callback(T.int, (ctx: VdfContext) => {
      return ctx.getInputValue<number>(T.int, _tokens.cyclicComputationPairA)
    })
    .inputs(Computation(T.int, _tokens.cyclicComputationPairA))

  // This computation sources its input by invoking the same computation on
  // the relationship targeted objects. If there is a cycle of relationship
  // targets, then compiling this computation will result in a cycle.
  self.primComputation(_tokens.cyclicRelComputation)
    .Callback(T.int, (ctx: VdfContext) => {
      const range = new VdfReadIteratorRange<number>(
        T.int, ctx, _tokens.cyclicRelComputation)
      let sum = 1
      for (const value of range) {
        sum += value
      }
      return sum
    })
    .inputs(
      Relationship(_tokens.customRel)
        .targetedObjects(T.int, _tokens.cyclicRelComputation))

  // This computation sources inputs by invoking the same computation on its
  // namespace ancestor, and the target of a relationship. If that
  // relationship targets a descendant object, there will be a cycle.
  self.primComputation(_tokens.cyclicAncestorComputation)
    .Callback(T.int, (ctx: VdfContext) => {
      const fallback = 0
      const sum =
        ctx.getInputValuePtr<number>(T.int, _tokens.ancestor, fallback)! +
        ctx.getInputValuePtr<number>(T.int, _tokens.customRel, fallback)!
      return sum
    })
    .inputs(
      NamespaceAncestor(T.int, _tokens.cyclicAncestorComputation)
        .inputName(_tokens.ancestor),
      Relationship(_tokens.customRel)
        .targetedObjects(T.int, _tokens.cyclicAncestorComputation)
        .inputName(_tokens.customRel))
})

class Fixture {
  invalidRequestIndices: ExecRequestIndexSet = new Set()
  invalidTimeInterval = new EfTimeInterval()

  private _stage!: UsdStage
  private _system: ExecUsdSystem | undefined

  async newSystemFromLayer(layerContents: string): Promise<ExecUsdSystem> {
    TF_AXIOM(!this._system)

    this._stage = await _OpenStage(layerContents)
    TF_AXIOM(this._stage)
    this._system = new ExecUsdSystem(this._stage)

    return this._system
  }

  buildRequest(valueKeys: ExecUsdValueKey[]): ExecUsdRequest {
    return this._system!.buildRequest(
      valueKeys,
      (invalidIndices: ReadonlySet<number>, invalidInterval: EfTimeInterval) => {
        for (const i of invalidIndices) {
          this.invalidRequestIndices.add(i)
        }
        this.invalidTimeInterval.orAssign(invalidInterval)
      })
  }

  getRelationshipAtPath(pathStr: string) {
    return this._stage.getRelationshipAtPath(pathStr)
  }

  getPrimAtPath(pathStr: string) {
    return this._stage.getPrim(pathStr)!
  }

  getAttributeAtPath(pathStr: string) {
    return this._stage.getAttributeAtPath(pathStr)!
  }

  addRelationshipTarget(
    relPathStr: string,
    targetPathStr: string,
  ): void {
    const rel =
      this._stage.getRelationshipAtPath(relPathStr)
    TF_AXIOM(rel)
    rel!.addTarget(targetPathStr)
  }

  // ~Fixture
  destroy(): void {
    this._system?.destroy()
  }
}

// An RAII helper that checks for expected validation errors. End() is the
// destructor.
class ExpectedValidationErrors {
  private readonly _errorMark = new TfErrorMark()
  private readonly _callContext: string
  private readonly _expectedErrorTypes: ExecValidationErrorType[]

  constructor(
    callContext: string,
    expectedErrorTypes: ExecValidationErrorType[],
  ) {
    this._callContext = callContext
    this._expectedErrorTypes = [...expectedErrorTypes]
  }

  End(): void {
    let foundExpectedErrors = ''
    let missingExpectedErrors = ''
    let unexpectedErrors = ''

    for (const error of this._errorMark.getErrors()) {
      const it = this._expectedErrorTypes.indexOf(
        error.getErrorCode() as ExecValidationErrorType)
      if (it !== -1) {
        // This error was expected. Strike it from the list of expected
        // errors.
        this._expectedErrorTypes.splice(it, 1)
        foundExpectedErrors += '- ' + ExpectedValidationErrors._getErrorString(error) + '\n'
        continue
      }

      // The error is not expected.
      unexpectedErrors += '- ' + ExpectedValidationErrors._getErrorString(error) + '\n'
    }

    // These expected errors were never found.
    for (const expectedErrorType of this._expectedErrorTypes) {
      missingExpectedErrors +=
        '- ' + new TfEnum(expectedErrorType).getDisplayName() + '\n'
    }
    this._errorMark.clear()
    this._errorMark.dispose()

    // Build a final error message.
    let message = `In ${this._callContext}:\n`
    if (foundExpectedErrors.length !== 0) {
      message += 'The following expected errors were found:\n'
      message += foundExpectedErrors
    }
    if (missingExpectedErrors.length !== 0) {
      message += 'The following expected errors were not found:\n'
      message += missingExpectedErrors
    }
    if (unexpectedErrors.length !== 0) {
      message += 'The following errors were unexpected:\n'
      message += unexpectedErrors
    }

    // We require that all expected errors were found, and that there were
    // no unexpected errors.
    if (missingExpectedErrors.length !== 0 || unexpectedErrors.length !== 0) {
      TF_FATAL_ERROR(message)
    }
  }

  private static _getErrorString(error: TfError): string {
    return `[${error.getErrorCodeAsString()}] ${error.getCommentary()} ` +
      `(in function '${error.getSourceFunction()}' at ` +
      `${error.getSourceFileName()}:${error.getSourceLineNumber()})`
  }
}

function EXPECT_VALIDATION_ERRORS(
  callContext: string, ...expectedErrorTypes: ExecValidationErrorType[]
): ExpectedValidationErrors {
  return new ExpectedValidationErrors(callContext, expectedErrorTypes)
}

ConfigureTestPlugin()

const DataDependencyCycle = ExecValidationErrorType.DataDependencyCycle

// ExecRequestIndexSet::size(), read through a call: the callback's inserts
// are invisible to TS's control-flow narrowing.
const _Size = (indices: ExecRequestIndexSet): number => indices.size

describe('testExecUsdCycleDetection', () => {
  it('Test_CycleDetectionRequiresRecompilation', async () => {
    const ctx = 'Test_CycleDetectionRequiresRecompilation'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'), _tokens.cyclicComputation),
    ])

    {
      // Compiling the request should detect a cycle.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      system.prepareRequest(request)
      expectedErrors.End()
    }
    {
      // Even though we just compiled the request, the network requires
      // recompilation since the previous round was interrupted. This should
      // find a cycle again.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      system.prepareRequest(request)
      expectedErrors.End()
    }
    {
      // Computing the request will compile the request again, since the
      // previous round was interrupted due to a cycle.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      const cacheView = system.compute(request)
      TF_AXIOM(cacheView.Get(0).IsEmpty())
      expectedErrors.End()
    }

    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a computation sources itself as an
  // input.
  it('Test_CyclicComputation', async () => {
    const ctx = 'Test_CyclicComputation'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'), _tokens.cyclicComputation),
    ])

    // Compiling the request should detect a cycle.
    const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

    // Should extract an empty value because the leaf node was not compiled.
    const cacheView = system.compute(request)
    TF_AXIOM(cacheView.Get(0).IsEmpty())

    expectedErrors.End()
    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a computation sources itself as an
  // input across an attribute connection via a builtin expression that uses
  // incoming connections.
  it('Test_CyclicIncomingConnection', async () => {
    const ctx = 'Test_CyclicIncomingConnection'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            string cyclicAttr = "cyclic"
            string attr = "attr value"
            string attr.connect = [</Prim.cyclicAttr>]
        }
    `)

    // Test that a cycle is detected when computing 'attr' that owns a
    // connection targeting 'cyclicAttr', which has a builtin expression
    // that introduces a cycle when it has a single valid incoming connection.
    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getAttributeAtPath('/Prim.attr'),
        ExecBuiltinComputations.computeValue),
    ])
    {
      // Compiling the request should detect a cycle.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

      system.prepareRequest(request)
      TF_AXIOM(request.isValid())
      expectedErrors.End()
    }
    {
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      const view = system.compute(request)
      TF_AXIOM(view.Get(0).IsEmpty())
      expectedErrors.End()
    }

    request.destroy()
    fixture.destroy()
  })

  // Test that a cycle is detected when computing 'attr1' or 'attr2', as each
  // owns a connection that targets the other.
  it('Test_CyclicAttributeConnections', async () => {
    const ctx = 'Test_CyclicAttributeConnections'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def "Prim" {
            double attr1 = 1.0
            double attr1.connect = </Prim.attr2>

            double attr2 = 2.0
            double attr2.connect = </Prim.attr1>
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getAttributeAtPath('/Prim.attr1'),
        ExecBuiltinComputations.computeValue),
    ])
    {
      // Compiling the request should detect a cycle.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

      system.prepareRequest(request)
      TF_AXIOM(request.isValid())
      expectedErrors.End()
    }
    {
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      const view = system.compute(request)
      TF_AXIOM(view.Get(0).IsEmpty())
      expectedErrors.End()
    }

    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a pair of computations source eachother
  // as inputs.
  //
  it('Test_CyclicComputationPair', async () => {
    const ctx = 'Test_CyclicComputationPair'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'), _tokens.cyclicComputationPairA),
    ])

    // Compiling the request should detect a cycle.
    const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

    // Should extract an empty value because the leaf node was not compiled.
    const cacheView = system.compute(request)
    TF_AXIOM(cacheView.Get(0).IsEmpty())

    expectedErrors.End()
    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a computation sources its input from a
  // relationship target, which is part of a cycle of relationship targets.
  //
  it('Test_CyclicRelationshipComputation', async () => {
    const ctx = 'Test_CyclicRelationshipComputation'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim1" {
            add rel customRel = [</Prim2>]
        }
        def CustomSchema "Prim2" {
            add rel customRel = [</Prim3>]
        }
        def CustomSchema "Prim3" {
            add rel customRel = [</Prim1>]
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim2'), _tokens.cyclicRelComputation),
    ])

    // Compiling the request should detect a cycle.
    const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

    // Should extract an empty value because the leaf node was not compiled.
    const cacheView = system.compute(request)
    TF_AXIOM(cacheView.Get(0).IsEmpty())

    expectedErrors.End()
    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a computation sources its input from a
  // relationship target, which is part of a cycle of relationship targets.
  // This specifically tests the case when the relationship cycle is large,
  // and also tests the case where multiple leaf tasks depend on the same
  // cycle.
  //
  it('Test_LargeCyclicRelationshipComputation', async () => {
    const ctx = 'Test_LargeCyclicRelationshipComputation'
    const SIZE = 500
    let layer = '#usda 1.0\n'

    // Prim[i].customRel targets Prim[i+1].
    for (let i = 0; i < SIZE; ++i) {
      layer += 'def CustomSchema "Prim' + i + '" {\n' +
        '    add rel customRel = [</Prim' + (i + 1) + '>]\n' +
        '}\n'
    }

    // Prim[SIZE].customRel targets Prim[0].
    layer += 'def CustomSchema "Prim' + SIZE + '" {\n' +
      '    add rel customRel = [</Prim0>]\n' +
      '}\n'

    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(layer)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim0'), _tokens.cyclicRelComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim100'), _tokens.cyclicRelComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim200'), _tokens.cyclicRelComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim300'), _tokens.cyclicRelComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim400'), _tokens.cyclicRelComputation),
    ])

    // Compiling the request should detect a cycle.
    const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

    // Unable to compile the leaf node. Should extract a empty VtValues.
    const cacheView = system.compute(request)
    for (let i = 0; i < 5; ++i) {
      TF_AXIOM(cacheView.Get(i).IsEmpty())
    }

    expectedErrors.End()
    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a computation sources its input from
  // its ancestor, but one of those ancestors sources its input from a
  // descendant.
  //
  it('Test_CyclicAncestorComputation', async () => {
    const ctx = 'Test_CyclicAncestorComputation'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "A" {
            add rel customRel = [</A/B/C>]

            def CustomSchema "B" {

                def CustomSchema "C" {
                }
            }
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/A'), _tokens.cyclicAncestorComputation),
    ])

    // Compiling the request should detect a cycle.
    const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

    // Should extract an empty value because the leaf node was not compiled.
    const cacheView = system.compute(request)
    TF_AXIOM(cacheView.Get(0).IsEmpty())

    expectedErrors.End()
    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a previously cycle-free scene
  // introduces a cycle by authoring a new relationship target.
  //
  it('Test_CyclicRelationshipComputationAfterRecompile', async () => {
    const ctx = 'Test_CyclicRelationshipComputationAfterRecompile'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "A" {
            add rel customRel = [</B>]
        }
        def CustomSchema "B" {
            add rel customRel = [</C>]
        }
        def CustomSchema "C" {
            rel customRel
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/A'), _tokens.cyclicRelComputation),
    ])

    {
      // There are no cycles in the network. This should compile
      // successfully.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx)
      system.prepareRequest(request)
      expectedErrors.End()
    }

    // Compute values. The result is well-defined.
    const cacheView = system.compute(request)
    TF_AXIOM(cacheView.Get(0).IsHolding(T.int))
    TF_AXIOM(cacheView.Get(0).Get<number>() === 3)

    // Make a change such that </C> [cyclicRelComputation] now depends on
    // </A> [cyclicRelComputaiton]. This would introduce a cycle.
    fixture.addRelationshipTarget('/C.customRel', '/A')

    {
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

      // The new VdfConnection from </A> [cyclicRelComputation] to
      // </C> [cyclicRelComputation] will not be created because it
      // introduces a cycle. The network will not be modified, so the
      // computed value should not change.
      const cacheView = system.compute(request)
      TF_AXIOM(cacheView.Get(0).IsHolding(T.int))
      TF_AXIOM(cacheView.Get(0).Get<number>() === 3)
      expectedErrors.End()
    }

    request.destroy()
    fixture.destroy()
  })

  // Test that we detect a cycle when a previously cycle-free scene
  // recompiles two separate inputs that end up depending on each other,
  // creating a "figure 8" cycle.
  //
  it('Test_CyclicRelationshipComputationFigure8', async () => {
    const ctx = 'Test_CyclicRelationshipComputationFigure8'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "A1" {
            add rel customRel = [</A2>]
        }
        def CustomSchema "A2" {
            rel customRel
        }
        def CustomSchema "B1" {
            add rel customRel = [</B2>]
        }
        def CustomSchema "B2" {
            rel customRel
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/A1'), _tokens.cyclicRelComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/B1'), _tokens.cyclicRelComputation),
    ])

    // This should compile the following cycle-free network:
    //
    //      [ A2 cyclicRelComputation ]         [ B2 cyclicRelComputation ]
    //                   V                                  V
    //      [ A1 cyclicRelComputaiton ]         [ B1 cyclicRelComputation ]
    //                   V                                  V
    //             [ Leaf Node ]                      [ Leaf Node ]
    //
    {
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx)
      system.prepareRequest(request)
      expectedErrors.End()
    }

    // The computed values are well-defined.
    const cacheView = system.compute(request)
    TF_AXIOM(cacheView.Get(0).IsHolding(T.int))
    TF_AXIOM(cacheView.Get(1).IsHolding(T.int))
    TF_AXIOM(cacheView.Get(0).Get<number>() === 2)
    TF_AXIOM(cacheView.Get(1).Get<number>() === 2)

    // Make scene changes that would introduce a cycle in a "figure 8"
    // pattern:
    //
    //                   +----------------+  +---------------+
    //                   V                |   |              V
    //      [ A2 cyclicRelComputation ]   |   |  [ B2 cyclicRelComputation ]
    //                   V                |   |              V
    //      [ A1 cyclicRelComputaiton ]   |   |  [ B1 cyclicRelComputation ]
    //                   V         |      |   |     |        V
    //             [ Leaf Node ]   +----- | --+     |  [ Leaf Node ]
    //                                    +---------+
    //
    fixture.addRelationshipTarget('/A2.customRel', '/B1')
    fixture.addRelationshipTarget('/B2.customRel', '/A1')

    {
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)

      // The new connections will not be made because together they would
      // introduce a cycle. As a result, the computed values are the same.
      const cacheView = system.compute(request)
      TF_AXIOM(cacheView.Get(0).IsHolding(T.int))
      TF_AXIOM(cacheView.Get(1).IsHolding(T.int))
      TF_AXIOM(cacheView.Get(0).Get<number>() === 2)
      TF_AXIOM(cacheView.Get(1).Get<number>() === 2)
      expectedErrors.End()
    }

    request.destroy()
    fixture.destroy()
  })

  // Test that we send value key invalidation for indicies that depend on
  // cycles. When compilation is interrupted due to cycle detection, we
  // cannot tell which scene changes would break those cycles. We must
  // conservatively invalidate those value keys on every scene change.
  //
  it('Test_CycleDetectionRequestInvalidation', async () => {
    const ctx = 'Test_CycleDetectionRequestInvalidation'
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "A" {
            add rel customRel = </B>
        }
        def CustomSchema "B" {
            rel customRel
        }
        def "Other" {
            int customAttr = 42
            rel customRel
            def "Target1" {}
            def "Target2" {}
            def "Target3" {}
        }
    `)

    const request = fixture.buildRequest([
      // [Key 0] This value key always depends on a cycle.
      new ExecUsdValueKey(fixture.getPrimAtPath('/A'), _tokens.cyclicComputation),

      // [Key 1] This value key initially does not depend on a cycle. Then,
      // adding a relationship target from /B.customRel -> /A creates a
      // cycle.
      new ExecUsdValueKey(fixture.getPrimAtPath('/A'), _tokens.cyclicRelComputation),

      // [Key 2] The value key will never depend on a cycle.
      new ExecUsdValueKey(fixture.getAttributeAtPath('/Other.customAttr')),
    ])

    {
      // On first compute, we find a cycle due to Key 0. The leaf node for
      // key 0 could not be compiled. Keys 1 and 2 are well-defined.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      const cacheView = system.compute(request)
      TF_AXIOM(cacheView.Get(0).IsEmpty())
      TF_AXIOM(cacheView.Get(1).Get<number>() === 2)
      TF_AXIOM(cacheView.Get(2).Get<number>() === 42)
      expectedErrors.End()
    }

    // Keys that depend on a cycle should be invalidated for all scene
    // changes, because exec cannot know if the network objects that *would
    // have* been compiled actually depend on a given scene change.
    fixture.invalidRequestIndices.clear()
    fixture.addRelationshipTarget('/Other.customRel', '/Other/Target1')
    TF_AXIOM(_Size(fixture.invalidRequestIndices) === 1)
    TF_AXIOM(fixture.invalidRequestIndices.has(0))

    // Once invalidated, the indices are not notified again (until the next
    // call to Compute).
    fixture.invalidRequestIndices.clear()
    fixture.addRelationshipTarget('/Other.customRel', '/Other/Target2')
    TF_AXIOM(_Size(fixture.invalidRequestIndices) === 0)

    // Make another scene change that causes key 1 to depend on a cycle. This
    // should invalidate key 1.
    fixture.invalidRequestIndices.clear()
    fixture.addRelationshipTarget('/B.customRel', '/A')
    TF_AXIOM(_Size(fixture.invalidRequestIndices) === 1)
    TF_AXIOM(fixture.invalidRequestIndices.has(1))

    {
      // Recomputing the request should again find cycles. The leaf node for
      // key 0 still cannot be created.
      const expectedErrors = EXPECT_VALIDATION_ERRORS(ctx, DataDependencyCycle)
      const cacheView = system.compute(request)

      // Key 0 still doesn't have a leaf node. We extract an empty VtValue.
      TF_AXIOM(cacheView.Get(0).IsEmpty())

      // Key 1 did have a leaf node, so we're still able to extract a value,
      // even if it is an incorrect value.
      TF_AXIOM(cacheView.Get(1).Get<number>() === 2)

      // Key 2 still has a well-defined value.
      TF_AXIOM(cacheView.Get(2).Get<number>() === 42)
      expectedErrors.End()
    }

    // Now that keys 0 and 1 both depend on cycles, they should both be
    // invalidated on any scene change.
    fixture.invalidRequestIndices.clear()
    fixture.addRelationshipTarget('/Other.customRel', '/Other/Target3')
    TF_AXIOM(_Size(fixture.invalidRequestIndices) === 2)
    TF_AXIOM(fixture.invalidRequestIndices.has(0))
    TF_AXIOM(fixture.invalidRequestIndices.has(1))

    request.destroy()
    fixture.destroy()
  })
})
