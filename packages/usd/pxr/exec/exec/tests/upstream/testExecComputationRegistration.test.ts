// Ported from OpenUSD 26.11.1:
//  pxr/exec/exec/testenv/testExecComputationRegistration.cpp,
//  pxr/exec/exec/testenv/TestExecConflictingPluginRegistration1.cpp,
//  pxr/exec/exec/testenv/TestExecPluginComputation.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/testenv/testExecComputationRegistration.cpp
//
// Adaptations:
// - The codeless test schemas are registered from the upstream testenv
//   resources (fixtures/testExecComputationRegistration/resources), as main()
//   does with PlugRegistry::RegisterPlugins.
// - The three test plugin libraries (TestExecPluginComputation.cpp,
//   TestExecConflictingPluginRegistration1.cpp and 2.cpp) are ES modules
//   under fixtures/, registered from their upstream plugInfo.json files with
//   LibraryPath naming the module. Upstream registers them with one
//   wildcard RegisterPlugins call, whose plugin order "can vary"; here they
//   are registered one at a time, in that order.
// - Upstream loads a plugin lazily, synchronously, when the definition
//   registry first looks up computations for one of its schemas
//   (Exec_PluginData::LoadPluginComputationsForSchema). PlugPlugin.Load() in
//   TS is synchronous only for loaded plugins (decision D4,
//   docs/openexec-x1.md), so the test awaits the plugin's LoadAsync() at the
//   point where upstream's lookup loads it: the plugin's
//   EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA blocks then run at that point, as
//   upstream's do.
// - Template value types are TfType arguments; std::string is
//   VtValueTypes.string, and CustomType is a JS class registered under its
//   C++ name.
// - EXPECTED_ERRORS is a TfErrorMark checked at the end of the block
//   (ExpectedErrors' destructor).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { TF_AXIOM, TfErrorMark, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { EfTime, EfTimeType } from 'typescript-usd/ef'
import type { EsfJournal } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import { EsfUsdSceneAdapter } from 'typescript-usd/esfUsd'
import type { VdfContext } from 'typescript-usd/vdf'
import { ExecBuiltinComputations } from '../../src/builtinComputations.ts'
import {
  Attribute, AttributeValue, Computation, Connections, Constant, IncomingConnections,
  Metadata, NamespaceAncestor, Prim, Relationship, Stage,
} from '../../src/computationBuilders.ts'
import { Exec_DefinitionRegistry } from '../../src/definitionRegistry.ts'
import type { Exec_InputKey } from '../../src/inputKey.ts'
import { Exec_PrivateBuiltinComputations } from '../../src/privateBuiltinComputations.ts'
import { ExecProviderResolution } from '../../src/providerResolution.ts'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from '../../src/registerSchema.ts'
import { ExecTypeRegistry } from '../../src/typeRegistry.ts'

// SdfFieldKeys->Documentation (sdf/schema.h SDF_FIELD_KEYS)
const SdfFieldKeys = { Documentation: 'documentation' } as const

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  appliedSchemaComputation: 'appliedSchemaComputation',
  attr: 'attr',
  attributeComputation: 'attributeComputation',
  attributeComputedValueComputation: 'attributeComputedValueComputation',
  attributeName: 'attributeName',
  baseAndDerivedSchemaComputation: 'baseAndDerivedSchemaComputation',
  constantValue: 'constantValue',
  convertibleReturnTypeComputation: 'convertibleReturnTypeComputation',
  computeConstants: 'computeConstants',
  computeExpressionConsumer: 'computeExpressionConsumer',
  derivedSchemaComputation: 'derivedSchemaComputation',
  dispatchedAttributeComputation: 'dispatchedAttributeComputation',
  dispatchedPrimComputation: 'dispatchedPrimComputation',
  dispatchedPrimComputationOnCustomSchema: 'dispatchedPrimComputationOnCustomSchema',
  emptyComputation: 'emptyComputation',
  functionPointerComputation: 'functionPointerComputation',
  lambdaWithCaptureComputation: 'lambdaWithCaptureComputation',
  missingComputation: 'missingComputation',
  multiApplySchemaComputation: 'multiApplySchemaComputation',
  namespaceAncestorInput: 'namespaceAncestorInput',
  noInputsComputation: 'noInputsComputation',
  nonComputationalSchemaComputation: 'nonComputationalSchemaComputation',
  otherAttr: 'otherAttr',
  otherComputation: 'otherComputation',
  primComputation: 'primComputation',
  relationshipName: 'relationshipName',
  relationshipTargetsInput: 'relationshipTargetsInput',
  returnTypeLambdaComputation: 'returnTypeLambdaComputation',
  stageAccessComputation: 'stageAccessComputation',
  unknownSchemaTypeComputation: 'unknownSchemaTypeComputation',
  voidFunctionPointerComputation: 'voidFunctionPointerComputation',
  voidLambdaComputation: 'voidLambdaComputation',
} as const

const T = VtValueTypes

// Attempt to register a computation for a schema type that is not registered
// with TfType.
//
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestUnknownSchemaType', (self) => {
  self.primComputation(_tokens.unknownSchemaTypeComputation)
    .Callback(T.double, () => 1.0)
})

// Attempt to register a computation for a schema type that is tagged in
// plugInfo as not allowing plugin computations.
//
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecNonComputationalSchema', (self) => {
  self.primComputation(_tokens.nonComputationalSchemaComputation)
    .Callback(T.double, () => 1.0)
})

// Attempt to register a computation for a schema type that has conflicting
// plugInfo declarations with respect to whether or not it allows plugin
// computations.
//
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecConflictingComputationalSchema', (self) => {
  self.primComputation(_tokens.nonComputationalSchemaComputation)
    .Callback(T.double, () => 1.0)
})

function _CallbackFunction(_ctx: VdfContext): number {
  return 1.0
}

function _CallbackFunctionVoidReturn(ctx: VdfContext): void {
  ctx.setOutput(1.0)
}

class CustomType {
  constructor(readonly i: number, readonly s: string) {}

  equals(other: unknown): boolean {
    return other instanceof CustomType && other.i === this.i && other.s === this.s
  }
}
const CustomTypeType = TfType.define('CustomType')

// TF_REGISTRY_FUNCTION(ExecTypeRegistry)
TfRegistryManager.add('ExecTypeRegistry', () => {
  ExecTypeRegistry.registerType(CustomTypeType, new CustomType(0, ''))
})

// Register computations for a typed schema.
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecComputationRegistrationCustomSchema', (self) => {
    //
    // Test different kinds of callback functions.
    //
    // Here, we just verify that these compile.
    //

    /// Callback: a lambda that returns the deduced result type
    self.primComputation(_tokens.returnTypeLambdaComputation)
      .Callback(T.double, () => {
        return 1.0
      })

    // Callback: a lambda that returns void
    self.primComputation(
      _tokens.voidLambdaComputation)
      .Callback(T.double, (ctx: VdfContext) => {
        ctx.setOutput(1.0)
      })

    // Callback: a pointer to a function where the return type is the deduced
    // computation result type
    self.primComputation(
      _tokens.functionPointerComputation)
      .Callback(T.double, _CallbackFunction)

    // Callback: a pointer to a function that returns void
    self.primComputation(
      _tokens.voidFunctionPointerComputation)
      .Callback(T.double, _CallbackFunctionVoidReturn)

    // Callback: a lambda that returns a type that is convertible to the
    // computation result type
    self.primComputation(
      _tokens.convertibleReturnTypeComputation)
      .Callback(T.string, () => {
        return 'string result value'
      })

    const inputName = 'anInputName'

    // Callback: a lambda with capture
    self.primComputation(
      _tokens.lambdaWithCaptureComputation)
      .Callback(T.string, (ctx: VdfContext) => {
        ctx.setOutput(ctx.getInputValue<string>(T.string, inputName))
      })

    //
    // Error cases
    //

    // A computation registration that has no callback.
    self.primComputation(_tokens.emptyComputation)

    // Attempt to register a prim computation that uses a builtin computation
    // name.
    self.primComputation(ExecBuiltinComputations.computeTime)

    // Attempt to register a prim computation that explicitly consumes
    // computeExpression as an input, which is not allowed. This is a private
    // computation name, but a nefarious user could try to reproduce the token.
    const computeExpression = '__computeExpression'
    self.primComputation(_tokens.computeExpressionConsumer)
      .Callback(T.double, () => 0.0)
      .inputs(
        Attribute(_tokens.attr)
          .Computation(T.double, computeExpression))

    //
    // Test different kinds of computation inputs.
    //

    self.primComputation(_tokens.noInputsComputation)
      .Callback(T.double, () => 1.0)

    // A prim computation that exercises various kinds of inputs.
    self.primComputation(_tokens.primComputation)
      .Callback(T.double, (ctx: VdfContext) => { ctx.setOutput(11.0) })
      .inputs(
        // Take a constant value as input.
        Constant(T.double, 42.0).inputName(_tokens.constantValue),

        // Take input from another computation provided by the prim.
        Computation(T.double, _tokens.otherComputation),

        // Take input from a computation provided by an attribute on the
        // prim.
        Attribute(_tokens.attributeName)
          .Computation(T.int, _tokens.attributeComputation),

        // Take input from a computation provided by any objects targeted
        // by attribute connections on an attribute on the prim.
        Attribute(_tokens.attributeName)
          .Connections(T.int, _tokens.attributeComputation),

        // Take input from a computation provided by any attributes with
        // connections that target an attribute on the prim.
        Attribute(_tokens.attributeName)
          .IncomingConnections(T.int, _tokens.otherComputation),

        // Take input from a computation provided by any attributes with
        // connections that target the prim.
        IncomingConnections(T.int, _tokens.otherComputation),

        // Take input from the value of an attribute, marking it as a
        // required input.
        AttributeValue(T.int, _tokens.attributeName)
          .required(),

        // Take input from the objects targeted by a relationship on the
        // prim.
        Relationship(_tokens.relationshipName)
          .targetedObjects(T.int, _tokens.primComputation),

        // Take input from the nearest namespace ancestor of the prim that
        // defines the same computation, assigning the input a unique
        // name.
        NamespaceAncestor(T.bool, _tokens.primComputation)
          .inputName(_tokens.namespaceAncestorInput),

        // Take input from prim metadata.
        Metadata(T.string, SdfFieldKeys.Documentation),

        // Take input from attribute metadata.
        Attribute(_tokens.attributeName)
          .Metadata(T.string, SdfFieldKeys.Documentation),

        // Take input from relationship metadata.
        Relationship(_tokens.relationshipName)
          .Metadata(T.string, SdfFieldKeys.Documentation),
      )

    // An attribute computation.
    self.attributeComputation(
      _tokens.attr,
      _tokens.attributeComputation)
      .Callback(T.double, (ctx: VdfContext) => { ctx.setOutput(11.0) })
      .inputs(
        // Take a constant value as input.
        Constant(T.double, 42.0).inputName(_tokens.constantValue),

        // Take input from another computation provided by the attribute.
        Computation(T.double, ExecBuiltinComputations.computeValue),

        // Take input from the objects targeted by this attribute's
        // connections.
        Connections(T.double, _tokens.otherComputation),

        // Take input from attributes that have connections that target this
        // attribute.
        IncomingConnections(T.double, _tokens.otherComputation),

        // Take input from a computation on the attribute's owning prim.
        Prim().Computation(T.double, _tokens.primComputation),

        // Take input from the value of a sibling attribute.
        Prim().AttributeValue(T.double, _tokens.otherAttr),

        // Take input from a computation on a sibling attribute.
        Prim()
          .Attribute(_tokens.otherAttr)
          .Computation(T.double, _tokens.attributeComputation),

        // Take input via relationship targets on a sibling relationship.
        Prim()
          .Relationship(_tokens.relationshipName)
          .targetedObjects(T.int, _tokens.primComputation)
          .inputName(_tokens.relationshipTargetsInput),

        // Take input from attribute metadata.
        Metadata(T.string, SdfFieldKeys.Documentation),

        // Take input from metadata on the owninbg prim.
        Prim()
          .Metadata(T.string, SdfFieldKeys.Documentation),

        // Take input from metadata on a sibling attribute.
        Prim()
          .Attribute(_tokens.otherAttr)
          .Metadata(T.string, SdfFieldKeys.Documentation),
      )

    const constStringLiteral = 'a string'

    const nonConstStringLiteral = constStringLiteral.slice()

    const constString = 'a string'

    // A prim computation that exercises constant inputs.
    self.primComputation(_tokens.computeConstants)
      .Callback(T.double, (ctx: VdfContext) => { ctx.setOutput(11.0) })
      .inputs(
        // Note that if we were compiling this compuation, it wouldn't make
        // sense (or be valid) to have multiple inputs with the same name
        // but different result types. But since this is just a test of
        // registrations, it's fine in this context.

        // Take a constant value as input.
        Constant(T.float, 42.0).inputName(_tokens.constantValue),

        // Take a constant string as an input, passing a char array.
        Constant(T.string, 'a string').inputName(_tokens.constantValue),

        // Take a constant string as an input, passing const char *.
        Constant(T.string, constStringLiteral).inputName(_tokens.constantValue),

        // Take a constant string as an input, passing char *.
        Constant(T.string, nonConstStringLiteral).inputName(_tokens.constantValue),

        // Take a constant value as input, passing a string.
        Constant(T.string, constString).inputName(_tokens.constantValue),

        // Take a constant value as input, passing an r-value reference to
        // a string.
        Constant(T.string, String('a string')).inputName(_tokens.constantValue),

        // Take a constant value as input, using a plugin-defined type.
        Constant(CustomTypeType, new CustomType(-1, 'a string'))
          .inputName(_tokens.constantValue),
      )

    // A prim computation that returns the current time.
    self.primComputation(_tokens.stageAccessComputation)
      .Callback(EfTimeType, (ctx: VdfContext) => {
        ctx.setOutput(new EfTime())
      })
      .inputs(
        // Get the time input by computing the builtin 'computeTime'
        // computation, provided by the stage.
        Stage()
          .Computation(EfTimeType, ExecBuiltinComputations.computeTime)
          .required(),
      )

    // A prim computation that returns the value of the attribute 'attr' (of
    // type double), or 0.0, if there is no attribute of that name on the
    // owning prim.
    self.primComputation(_tokens.attributeComputedValueComputation)
      .Callback(T.double, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<number>(
            T.double, ExecBuiltinComputations.computeValue)
        ctx.setOutput(valuePtr !== null ? valuePtr : 0.0)
      })
      .inputs(
        Attribute(_tokens.attr)
          .Computation(T.double, ExecBuiltinComputations.computeValue),
      )

    // A computation that is registered on both the base and derived schemas.
    self.primComputation(_tokens.baseAndDerivedSchemaComputation)
      .Callback(T.double, () => 1.0)

    //
    // Test dispatched computations
    //

    // A dispatched prim computation.
    self.dispatchedPrimComputation(_tokens.dispatchedPrimComputation)
      .Callback(T.double, () => 1.0)

    // A dispatched prim computation that only applies to CustomSchema.
    self.dispatchedPrimComputation(
      _tokens.dispatchedPrimComputationOnCustomSchema,
      TfType.findByName('TestExecComputationRegistrationCustomSchema'))
      .Callback(T.double, () => 1.0)

    // A dispatched attribute computation.
    self.dispatchedAttributeComputation(
      _tokens.dispatchedAttributeComputation)
      .Callback(T.double, () => 1.0)
  })

// Register computations for a derived typed schema.
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecComputationRegistrationDerivedCustomSchema', (self) => {
    self.primComputation(_tokens.derivedSchemaComputation)
      .Callback(T.double, () => 1.0)

    // This overrides the computation of the same name on the base schema.
    // (We add an input here so we can verify this definition is stronger.)
    self.primComputation(_tokens.baseAndDerivedSchemaComputation)
      .Callback(T.double, () => 1.0)
      .inputs(
        AttributeValue(T.int, _tokens.attributeName),
      )
  })

// Register computations for an applied schema.
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecComputationRegistrationCustomAppliedSchema', (self) => {
    // A computation that is registered only for the applied schema.
    self.primComputation(_tokens.appliedSchemaComputation)
      .Callback(T.int, () => 42)

    // A computation that is registered for the applied schema and also for a
    // typed schema.
    self.primComputation(_tokens.primComputation)
      .Callback(T.double, (ctx: VdfContext) => { ctx.setOutput(42.0) })
  })

// Register computations for a multi-apply schema.
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecComputationRegistrationCustomMultiApplySchema', (self) => {
    self.primComputation(_tokens.multiApplySchemaComputation)
      .Callback(T.int, () => 42)
  })

// ExpectedErrors: verifies the expected errors are emitted during the
// lifetime of the object and that the commentary matches the expected error
// strings. `End()` is the destructor.
class ExpectedErrors {
  readonly #expectedErrors: Set<string>
  readonly #numErrors: number
  readonly #mark = new TfErrorMark()

  constructor(numErrorsOrExpected: number | string[], expectedErrors?: string[]) {
    if (typeof numErrorsOrExpected === 'number') {
      this.#numErrors = numErrorsOrExpected
      this.#expectedErrors = new Set(expectedErrors ?? [])
      if (expectedErrors) TF_AXIOM(this.#expectedErrors.size < this.#numErrors)
    } else {
      this.#expectedErrors = new Set(numErrorsOrExpected)
      this.#numErrors = this.#expectedErrors.size
    }
  }

  End(): void {
    try {
      const errors = this.#mark.getErrors().map(error => error.getCommentary())

      // If all that is required is an expected number of errors, return if
      // the count matches.
      if (this.#expectedErrors.size === 0 && errors.length === this.#numErrors) {
        return
      }

      expect(errors.length, `Expected numErrors == ${this.#numErrors}; got ` +
        `${errors.length}:\n  ${errors.join('\n  ')}`).toBe(this.#numErrors)

      const errorSet = new Set(errors)
      const missingErrors = [...this.#expectedErrors].filter(e => !errorSet.has(e))
      const unexpectedErrors = [...errorSet].filter(e => !this.#expectedErrors.has(e))

      // If the number of expected errors is greater than the number of
      // expected error messages, then we have a certain number of unexpected
      // errors that we actually expect.
      const numExpectedUnexpectedErrors =
        this.#numErrors > this.#expectedErrors.size
          ? (this.#numErrors - this.#expectedErrors.size) : 0

      expect(missingErrors, 'Missing').toEqual([])
      expect(unexpectedErrors.length, `Unexpected:\n  ${unexpectedErrors.join('\n  ')}`)
        .toBe(numExpectedUnexpectedErrors)

      this.#mark.clear()
    } finally {
      this.#mark.clear()
      this.#mark.dispose()
    }
  }
}

async function _NewStageFromLayer(layerContents: string): Promise<EsfStage> {
  const layer = SdfLayer.createAnonymous('.usda')
  layer.importFromString(layerContents)
  TF_AXIOM(layer)
  const usdStage = await UsdStage.open(layer)
  TF_AXIOM(usdStage)
  return EsfUsdSceneAdapter.adaptStage(usdStage)
}

function _PrintInputKeys(inputKeys: readonly Exec_InputKey[]): void {
  let out = `\nPrinting ${inputKeys.length} input keys:\n`

  for (const key of inputKeys) {
    out += '\nkey:\n'
    out += `  input name: ${key.inputName}\n`
    out += `  computation name: ${key.computationName}\n`
    out += `  result type: ${key.resultType.getTypeName()}\n`
    out += `  local traversal path: ${key.providerResolution.localTraversal.pathString}\n`
    out += `  traversal: ${key.providerResolution.dynamicTraversal}\n`
    out += `  optional: ${key.optional ? 1 : 0}\n`
  }

  console.log(out)
}

const P = (s: string): SdfPath => SdfPath.fromString(s)
const DT = ExecProviderResolution.DynamicTraversal
const nullJournal: EsfJournal | null = null

function _ReadPlugInfo(url: URL): PlugInfo {
  return JSON.parse(readFileSync(url, 'utf8').split('\n')
    .filter(line => !line.trimStart().startsWith('#')).join('\n')) as PlugInfo
}

const _fixtures = new URL('../fixtures/', import.meta.url)

function _SetupTestPlugins(): void {
  const plugins = [
    'TestExecPluginComputation',
    'TestExecConflictingPluginRegistration1',
    'TestExecConflictingPluginRegistration2',
  ].flatMap((name) => {
    const plugInfoUrl = new URL(`${name}/plugInfo.json`, _fixtures)
    return PlugRegistry.GetInstance().RegisterPlugins(
      _ReadPlugInfo(plugInfoUrl), undefined, { plugInfoUrl: plugInfoUrl.href })
  })

  expect(plugins.length).toBe(3)
}

// The lazy load of the plugin Exec_PluginData maps to a schema (see the
// header comment).
async function _LoadPlugin(name: string): Promise<void> {
  const plugin = PlugRegistry.GetInstance().GetPluginWithName(name)
  TF_AXIOM(plugin)
  expect(await plugin.loadAsync()).toBe(true)
}

// main(): load the custom schema.
{
  const resources = new URL('testExecComputationRegistration/resources/', _fixtures)
  const testPlugins = PlugRegistry.GetInstance().RegisterPlugins(
    _ReadPlugInfo(new URL('plugInfo.json', resources)), {
      testExecComputationRegistration: {
        'generatedSchema.usda': readFileSync(new URL('generatedSchema.usda', resources), 'utf8'),
      },
    })
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecComputationRegistration')

  const schemaType =
    TfType.findByName('TestExecComputationRegistrationCustomSchema')
  TF_AXIOM(!schemaType.isUnknown())

  _SetupTestPlugins()
}

describe('testExecComputationRegistration', () => {
  it('TestExecTestPublicClass', () => {
    // ExecTestPublicClass publicClass; (pxr/exec/execTest/publicClass.h)
    // only verifies that unit tests can build against and load the execTest
    // library, which is not ported.
    throw new Error('ExecTestPublicClass: pxr/exec/execTest is not ported')
  })

  // This test case needs to run first in order to encounter the errors we
  // look for here.
  //
  it('TestRegistrationErrors', async () => {
    // The errors that are emitted because of conflicting plugins aren't
    // stable because order can vary, so they are not included among the
    // expected error messages here.
    const expected = new ExpectedErrors(9, [
      'Attempt to build computations for unknown schema type name ' +
      "'TestUnknownSchemaType'.",

      "Attempt to register computation 'unknownSchemaTypeComputation' using " +
      'an unknown schema type.',

      "Attempt to register computation '__computeTime' with a name that uses " +
      "the prefix '__', which is reserved for builtin computations.",

      "The builtin computation '__computeExpression' cannot be consumed by " +
      'inputs to user-defined computations.',

      "Attempt to register computation 'nonComputationalSchemaComputation' " +
      'for schema TestExecNonComputationalSchema, which was declared as ' +
      'not allowing plugin computations by plugin ' +
      "'TestExecPluginComputation'.",

      "Unknown schema type name 'UnknownSchemaType' encountered when reading " +
      'Exec plugInfo.',
    ])

    // The first time we pull on the defintion registry, errors for bad
    // registrations are emitted.
    const reg = Exec_DefinitionRegistry.GetInstance()

    {
      const stage = await _NewStageFromLayer(`#usda 1.0
        def ConflictingPluginRegistrationSchema "Prim"
        {
        }
        `)
      const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
      TF_AXIOM(prim.Get().isValid(nullJournal))

      // Upstream's lookup loads the plugin Exec_PluginData maps to
      // TestExecConflictingPluginRegistrationSchema: the first one
      // registered.
      await _LoadPlugin('TestExecConflictingPluginRegistration1')

      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(),
          'conflictingRegistrationComputation',
          new EsfSchemaConfigKey(),
          nullJournal)
      TF_AXIOM(primCompDef)
    }

    {
      const stage = await _NewStageFromLayer(`#usda 1.0
            def Scope "Prim" (
                apiSchemas = ["NonComputationalSchema"]
            ) {
            }
        `)
      const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
      TF_AXIOM(prim.Get().isValid(nullJournal))

      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(),
          'nonComputationalSchemaComputation',
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    {
      // Make sure we don't find a computation that was registered on a
      // schema with conflicting allowsPluginComputations plugInfo.
      const stage = await _NewStageFromLayer(`#usda 1.0
        def ConflictingComputationalSchema "Prim"
        {
        }
        `)
      const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
      TF_AXIOM(prim.Get().isValid(nullJournal))

      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(),
          'nonComputationalSchemaComputation',
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    expected.End()
  })

  // Test cases where we should fail to find a specified computation.
  //
  it('TestUndefinedComputations', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def ConflictingComputationalSchema "Prim"
        {
            int attr
        }
        `)

    const pseudoroot =
      stage.Get().getPrimAtPath(P('/'), nullJournal)
    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))
    const attr =
      stage.Get().getAttributeAtPath(P('/Prim.attr'), nullJournal)
    TF_AXIOM(attr.Get().isValid(nullJournal))

    let compDef

    compDef = reg.getComputationDefinition(
      pseudoroot.Get(),
      'bogusStageComputation',
      new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!compDef)

    compDef = reg.getComputationDefinition(
      pseudoroot.Get(),
      '__bogusBuiltinStageComputation',
      new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!compDef)

    compDef = reg.getComputationDefinition(
      prim.Get(),
      'bogusPrimComputation',
      new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!compDef)

    compDef = reg.getComputationDefinition(
      prim.Get(),
      '__bogusBuiltinPrimComputation',
      new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!compDef)

    compDef = reg.getComputationDefinition(
      attr.Get(),
      'bogusAttrComputation',
      new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!compDef)

    compDef = reg.getComputationDefinition(
      attr.Get(),
      '__bogusBuiltinAttrComputation',
      new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!compDef)
  })

  // Test that an unknown applied schema is ignored and we still find
  // computations registered for an applied schema.
  //
  it('TestUnknownSchemaType', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def TestUnknownSchemaType "Prim" (
            apiSchemas = ["CustomAppliedSchema"]
        ) {
        }
    `)
    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    {
      // Look up a computation registered for the applied schema type.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.appliedSchemaComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)
    }
  })

  // Test that attempts to look up builtin stage computations on prims (other
  // than the pseudo-root) are rejected.
  //
  it('TestStageBuiltinComputationOnPrim', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def TestUnknownSchemaType "Prim" {
        }
    `)
    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    const primCompDef =
      reg.getComputationDefinition(
        prim.Get(), ExecBuiltinComputations.computeTime,
        new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(!primCompDef)
  })

  it('TestTypedSchemaComputationRegistration', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            int attr
        }
    `)
    const pseudoroot = stage.Get().getPrimAtPath(P('/'), nullJournal)

    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    const attribute =
      stage.Get().getAttributeAtPath(P('/Prim.attr'), nullJournal)
    TF_AXIOM(attribute.Get().isValid(nullJournal))

    {
      // Look up a computation that wasn't registered.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.missingComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    {
      // Look up a computation with no callback or inputs.
      //
      // (Once we support composition of computation definitions, we will
      // want some kind of validation to ensure we end up with a callback.)
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.emptyComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      expect(primCompDef.getInputKeys(prim.Get(), nullJournal).Get().length).toBe(0)
    }

    {
      // Look up a computation with no inputs.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.noInputsComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      expect(primCompDef.getInputKeys(prim.Get(), nullJournal).Get().length).toBe(0)
    }

    {
      // Look up a stage bultin computation.
      const primCompDef =
        reg.getComputationDefinition(
          pseudoroot.Get(), ExecBuiltinComputations.computeTime,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      expect(primCompDef.getInputKeys(prim.Get(), nullJournal).Get().length).toBe(0)
    }

    {
      // Look up a plugin computation on the stage pseudo-root.
      const primCompDef =
        reg.getComputationDefinition(
          pseudoroot.Get(), _tokens.noInputsComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    // ASSERT_EQ on each field of an input key.
    const assertKey = (
      key: Exec_InputKey | undefined,
      inputName: string,
      computationName: string,
      resultType: TfType,
      localTraversal: string,
      dynamicTraversal: ExecProviderResolution.DynamicTraversal,
      optional: boolean,
    ): void => {
      expect(key).toBeDefined()
      expect(key!.inputName).toBe(inputName)
      expect(key!.computationName).toBe(computationName)
      expect(key!.resultType).toBe(resultType)
      expect(key!.providerResolution.localTraversal.pathString)
        .toBe(P(localTraversal).pathString)
      expect(key!.providerResolution.dynamicTraversal).toBe(dynamicTraversal)
      expect(key!.optional).toBe(optional)
    }

    {
      // Look up a computation with multiple inputs.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.primComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      const inputKeys =
        primCompDef.getInputKeys(prim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(12)

      _PrintInputKeys(inputKeys.Get())

      let index = 0
      const keys = inputKeys.Get()
      assertKey(keys[index++], _tokens.constantValue,
        Exec_PrivateBuiltinComputations.computeConstant, T.double, '/', DT.Local, true)
      assertKey(keys[index++], _tokens.otherComputation,
        _tokens.otherComputation, T.double, '.', DT.Local, true)
      assertKey(keys[index++], _tokens.attributeComputation,
        _tokens.attributeComputation, T.int, '.attributeName', DT.Local, true)
      assertKey(keys[index++], _tokens.attributeComputation,
        _tokens.attributeComputation, T.int, '.attributeName',
        DT.ConnectionTargetedObjects, true)
      assertKey(keys[index++], _tokens.otherComputation,
        _tokens.otherComputation, T.int, '.attributeName',
        DT.IncomingConnectionOwningAttributes, true)
      assertKey(keys[index++], _tokens.otherComputation,
        _tokens.otherComputation, T.int, '.',
        DT.IncomingConnectionOwningAttributes, true)
      assertKey(keys[index++], _tokens.attributeName,
        ExecBuiltinComputations.computeValue, T.int, '.attributeName', DT.Local, false)
      assertKey(keys[index++], _tokens.primComputation,
        _tokens.primComputation, T.int, '.relationshipName',
        DT.RelationshipTargetedObjects, true)
      assertKey(keys[index++], _tokens.namespaceAncestorInput,
        _tokens.primComputation, T.bool, '.', DT.NamespaceAncestor, true)
      assertKey(keys[index++], SdfFieldKeys.Documentation,
        Exec_PrivateBuiltinComputations.computeMetadata, T.string, '.', DT.Local, true)
      assertKey(keys[index++], SdfFieldKeys.Documentation,
        Exec_PrivateBuiltinComputations.computeMetadata, T.string, '.attributeName',
        DT.Local, true)
      assertKey(keys[index++], SdfFieldKeys.Documentation,
        Exec_PrivateBuiltinComputations.computeMetadata, T.string, '.relationshipName',
        DT.Local, true)

      expect(inputKeys.Get().length).toBe(index)
    }

    {
      // Look up an attribute computation.
      const attrCompDef =
        reg.getComputationDefinition(
          attribute.Get(), _tokens.attributeComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(attrCompDef)

      const inputKeys =
        attrCompDef.getInputKeys(attribute.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(11)

      _PrintInputKeys(inputKeys.Get())

      let index = 0
      const keys = inputKeys.Get()
      assertKey(keys[index++], _tokens.constantValue,
        Exec_PrivateBuiltinComputations.computeConstant, T.double, '/', DT.Local, true)
      assertKey(keys[index++], ExecBuiltinComputations.computeValue,
        ExecBuiltinComputations.computeValue, T.double, '.', DT.Local, true)
      assertKey(keys[index++], _tokens.otherComputation,
        _tokens.otherComputation, T.double, '.', DT.ConnectionTargetedObjects, true)
      assertKey(keys[index++], _tokens.otherComputation,
        _tokens.otherComputation, T.double, '.',
        DT.IncomingConnectionOwningAttributes, true)
      assertKey(keys[index++], _tokens.primComputation,
        _tokens.primComputation, T.double, '..', DT.Local, true)
      assertKey(keys[index++], _tokens.otherAttr,
        ExecBuiltinComputations.computeValue, T.double, '../.otherAttr', DT.Local, true)
      assertKey(keys[index++], _tokens.attributeComputation,
        _tokens.attributeComputation, T.double, '../.otherAttr', DT.Local, true)
      assertKey(keys[index++], _tokens.relationshipTargetsInput,
        _tokens.primComputation, T.int, '../.relationshipName',
        DT.RelationshipTargetedObjects, true)
      assertKey(keys[index++], SdfFieldKeys.Documentation,
        Exec_PrivateBuiltinComputations.computeMetadata, T.string, '.', DT.Local, true)
      assertKey(keys[index++], SdfFieldKeys.Documentation,
        Exec_PrivateBuiltinComputations.computeMetadata, T.string, '..', DT.Local, true)
      assertKey(keys[index++], SdfFieldKeys.Documentation,
        Exec_PrivateBuiltinComputations.computeMetadata, T.string, '../.otherAttr',
        DT.Local, true)

      expect(inputKeys.Get().length).toBe(index)
    }

    {
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.stageAccessComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      const inputKeys =
        primCompDef.getInputKeys(prim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(1)

      _PrintInputKeys(inputKeys.Get())

      assertKey(inputKeys.Get()[0], ExecBuiltinComputations.computeTime,
        ExecBuiltinComputations.computeTime, EfTimeType, '/', DT.Local, false)
    }

    {
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.attributeComputedValueComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      const inputKeys =
        primCompDef.getInputKeys(prim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(1)

      _PrintInputKeys(inputKeys.Get())

      assertKey(inputKeys.Get()[0], ExecBuiltinComputations.computeValue,
        ExecBuiltinComputations.computeValue, T.double, '.attr', DT.Local, true)
    }
  })

  it('TestDerivedSchemaComputationRegistration', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def DerivedCustomSchema "Prim" {
        }
    `)
    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    {
      // Look up a computation registered for the derived schema type.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.derivedSchemaComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)
    }

    {
      // Look up a computation registered for the base and derived schema
      // types.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.baseAndDerivedSchemaComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      // Make sure we got the definition from the derived schema (i.e., the
      // stronger one).
      const inputKeys =
        primCompDef.getInputKeys(prim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(1)
    }

    {
      // Look up a computation registered for the base schema type.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.noInputsComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)
    }
  })

  it('TestAppliedSchemaComputationRegistration', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()

    {
      const stage = await _NewStageFromLayer(`#usda 1.0
            def Scope "Prim" (apiSchemas = ["CustomAppliedSchema"]) {
            }
        `)
      const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
      TF_AXIOM(prim.Get().isValid(nullJournal))

      {
        // Look up a computation registered for the applied schema type.
        const primCompDef =
          reg.getComputationDefinition(
            prim.Get(), _tokens.appliedSchemaComputation,
            new EsfSchemaConfigKey(), nullJournal)
        TF_AXIOM(primCompDef)
      }

      {
        // Look up another computation, which is registered for the
        // applied schema, with no inputs.
        const primCompDef =
          reg.getComputationDefinition(
            prim.Get(), _tokens.primComputation,
            new EsfSchemaConfigKey(), nullJournal)
        TF_AXIOM(primCompDef)
        const inputKeys =
          primCompDef.getInputKeys(prim.Get(), nullJournal)
        expect(inputKeys.Get().length).toBe(0)
      }
    }

    {
      // Test computation registrations for an API schema that's applied to
      // a prim that also has a typed schema with computation registrations.
      const stage = await _NewStageFromLayer(`#usda 1.0
            def CustomSchema "Prim" (apiSchemas = ["CustomAppliedSchema"]) {
            }
        `)
      const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
      TF_AXIOM(prim.Get().isValid(nullJournal))

      {
        // Look up a computation that is only registered for the applied
        // schema type.
        const primCompDef =
          reg.getComputationDefinition(
            prim.Get(), _tokens.appliedSchemaComputation,
            new EsfSchemaConfigKey(), nullJournal)
        TF_AXIOM(primCompDef)
      }

      {
        // Look up a computation that is also registered for the typed
        // schema and verify that the typed schema wins.
        const primCompDef =
          reg.getComputationDefinition(
            prim.Get(), _tokens.primComputation,
            new EsfSchemaConfigKey(), nullJournal)
        TF_AXIOM(primCompDef)
        const inputKeys =
          primCompDef.getInputKeys(prim.Get(), nullJournal)
        expect(inputKeys.Get().length).toBe(12)
      }
    }

    {
      // Test that, for now, we ignore multi-apply schemas during computation
      // lookup.
      const stage = await _NewStageFromLayer(`#usda 1.0
            def Scope "Prim" (apiSchemas = ["CustomMultiApplySchema:test"]) {
            }
        `)
      const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
      TF_AXIOM(prim.Get().isValid(nullJournal))

      {
        // Look up a computation registered for the applied schema type.
        const primCompDef =
          reg.getComputationDefinition(
            prim.Get(), _tokens.multiApplySchemaComputation,
            new EsfSchemaConfigKey(), nullJournal)
        TF_AXIOM(!primCompDef)
      }
    }
  })

  it('TestPluginSchemaComputationRegistration', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def PluginComputationSchema "Prim"
        {
        }

        def CustomSchema "NonPluginPrim"
        {
        }

        def ExtraPluginComputationSchema "ExtraPrim"
        {
        }
    `)
    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    {
      const expected = new ExpectedErrors([
        "Attempt to register computation 'unregisteredComputation' for " +
        'schema TestExecComputationRegistrationCustomSchema, for which ' +
        'computation registration has already been completed.',
      ])

      // Look up a computation registered in a plugin, causing the plugin to
      // be loaded.
      await _LoadPlugin('TestExecPluginComputation')
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), 'myComputation',
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      const inputKeys =
        primCompDef.getInputKeys(prim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(2)

      {
        // Make sure we *don't* find the computation that the plugin
        // attempted to register on CustomSchema, for which computations
        // were already registered.
        const prim =
          stage.Get().getPrimAtPath(P('/NonPluginPrim'), nullJournal)
        TF_AXIOM(prim.Get().isValid(nullJournal))

        const primDef =
          reg.getComputationDefinition(
            prim.Get(), 'unregisteredComputation',
            new EsfSchemaConfigKey(), nullJournal)
        TF_AXIOM(!primDef)
      }

      expected.End()
    }

    {
      // Look up another computation that was registered by the plugin we
      // just loaded.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), 'anotherComputation',
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(primCompDef)

      const inputKeys =
        primCompDef.getInputKeys(prim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(1)
    }

    {
      // Look up a computation on a prim with a different schema, which is
      // defined in the same plugin that defines computations for
      // PluginComputationSchema.
      const extraPrim =
        stage.Get().getPrimAtPath(P('/ExtraPrim'), nullJournal)
      TF_AXIOM(extraPrim.Get().isValid(nullJournal))

      const extraPrimCompDef =
        reg.getComputationDefinition(
          extraPrim.Get(), 'myComputation',
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(extraPrimCompDef)

      const inputKeys =
        extraPrimCompDef.getInputKeys(extraPrim.Get(), nullJournal)
      expect(inputKeys.Get().length).toBe(0)
    }
  })

  it('TestDispatchedComputations', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            int attr
        }
        def Scope "Scope" {
        }
    `)
    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    const attribute =
      stage.Get().getAttributeAtPath(P('/Prim.attr'), nullJournal)
    TF_AXIOM(attribute.Get().isValid(nullJournal))

    const scope = stage.Get().getPrimAtPath(P('/Scope'), nullJournal)
    TF_AXIOM(scope.Get().isValid(nullJournal))

    {
      // Look up a dispatched prim computation, which is keyed off of the
      // schema config key.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.dispatchedPrimComputation,
          prim.Get().getSchemaConfigKey(nullJournal), nullJournal)
      TF_AXIOM(primCompDef)
    }

    {
      // Attempt to look up a dispatched prim computation that only
      // dispatches onto CustomSchema.
      const primCompDef =
        reg.getComputationDefinition(
          scope.Get(), _tokens.dispatchedPrimComputationOnCustomSchema,
          prim.Get().getSchemaConfigKey(nullJournal), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    {
      // Look up the same dispatched prim computation on a prim with the
      // matching schema.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.dispatchedPrimComputationOnCustomSchema,
          prim.Get().getSchemaConfigKey(nullJournal), nullJournal)
      TF_AXIOM(primCompDef)
    }

    {
      // Attempt to look up a dispatched prim computation with a different
      // schema config key.

      TF_AXIOM(prim.Get().getSchemaConfigKey(nullJournal).notEquals(
        scope.Get().getSchemaConfigKey(nullJournal)))

      const primCompDef =
        reg.getComputationDefinition(
          scope.Get(), _tokens.dispatchedPrimComputation,
          scope.Get().getSchemaConfigKey(nullJournal), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    {
      // Attempt to look up a dispatched prim computation with an empty
      // schema config key.
      const primCompDef =
        reg.getComputationDefinition(
          prim.Get(), _tokens.dispatchedPrimComputation,
          new EsfSchemaConfigKey(), nullJournal)
      TF_AXIOM(!primCompDef)
    }

    {
      // Look up a dispatched attribute computation, which is keyed off of
      // the schema config key.
      const attributeCompDef =
        reg.getComputationDefinition(
          attribute.Get(), _tokens.dispatchedAttributeComputation,
          attribute.Get().getSchemaConfigKey(nullJournal), nullJournal)
      TF_AXIOM(attributeCompDef)
    }
  })

  it('TestConstantInputRegistrations', async () => {
    const reg = Exec_DefinitionRegistry.GetInstance()
    const stage = await _NewStageFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)

    const prim = stage.Get().getPrimAtPath(P('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    const primCompDef =
      reg.getComputationDefinition(
        prim.Get(), _tokens.computeConstants,
        new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(primCompDef)

    const inputKeys =
      primCompDef.getInputKeys(prim.Get(), nullJournal)
    expect(inputKeys.Get().length).toBe(7)

    _PrintInputKeys(inputKeys.Get())

    const expectedTypes = [
      T.float, T.string, T.string, T.string, T.string, T.string, CustomTypeType,
    ]
    let index = 0
    for (const resultType of expectedTypes) {
      const key = inputKeys.Get()[index++]!
      expect(key.inputName).toBe(_tokens.constantValue)
      expect(key.computationName).toBe(
        Exec_PrivateBuiltinComputations.computeConstant)
      expect(key.resultType).toBe(resultType)
      expect(key.providerResolution.localTraversal.pathString).toBe(P('/').pathString)
      expect(key.providerResolution.dynamicTraversal).toBe(DT.Local)
      expect(key.optional).toBe(true)
    }

    expect(inputKeys.Get().length).toBe(index)
  })
})
