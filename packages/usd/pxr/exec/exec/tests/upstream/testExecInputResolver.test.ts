// Ported from OpenUSD 26.11.1: pxr/exec/exec/testenv/testExecInputResolver.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/testenv/testExecInputResolver.cpp
//
// The codeless test schema is registered from the upstream testenv resources
// (fixtures/testExecInputResolver/resources), as main() registers them with
// PlugRegistry::RegisterPlugins. Each upstream test function runs with a new
// Fixture, as main() does; opening a stage is asynchronous here, so the
// Fixture is created by Fixture.Create() and NewStageFromLayer is awaited.
// ASSERT_EQ on journals and output key identities compares with Equals.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { TF_AXIOM, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { EfTimeType } from 'typescript-usd/ef'
import { EsfEditReason } from 'typescript-usd/esf'
import { EsfJournal } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import { EsfUsdSceneAdapter } from 'typescript-usd/esfUsd'
import { EsfUsdStageData } from 'typescript-usd/esfUsd'
import { ExecBuiltinComputations } from '../../src/builtinComputations.ts'
import type { Exec_ComputationDefinition } from '../../src/computationDefinition.ts'
import { Exec_DefinitionRegistry } from '../../src/definitionRegistry.ts'
import type { Exec_InputKey } from '../../src/inputKey.ts'
import { Exec_ResolveInput } from '../../src/inputResolver.ts'
import { Exec_OutputKey, type Exec_OutputKeyVector } from '../../src/outputKey.ts'
import { ExecProviderResolution } from '../../src/providerResolution.ts'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA } from '../../src/registerSchema.ts'

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  attributeComputation: 'attributeComputation',
  inputName: 'inputName',
  dispatchedAttributeComputation: 'dispatchedAttributeComputation',
  dispatchedPrimComputation: 'dispatchedPrimComputation',
  nonExistentComputation: 'nonExistentComputation',
  primComputation: 'primComputation',
} as const

// operator<<(std::ostream &, const EsfJournal &)
function _JournalToString(journal: EsfJournal): string {
  const entries = [...journal]
  if (entries.length === 0) {
    return '{}'
  }
  let out = '{'
  for (const [path, reason] of entries) {
    out += `\n    <${path.pathString}> (${reason.getDescription()})`
  }
  return out + '\n}'
}

function ASSERT_JOURNAL_EQ(journal: EsfJournal, expected: EsfJournal): void {
  expect(journal.Equals(expected),
    `Expected fixture.journal == '${_JournalToString(expected)}'; ` +
    `got '${_JournalToString(journal)}'`).toBe(true)
}

function ASSERT_OUTPUT_KEY(
  actual: Exec_OutputKey | undefined,
  expectedProvider: EsfObject,
  expectedSchemaKey: EsfSchemaConfigKey,
  expectedDefinition: Exec_ComputationDefinition,
): void {
  expect(actual).toBeDefined()
  const expectedKey = new Exec_OutputKey(
    expectedProvider, expectedSchemaKey, expectedDefinition)
  const actualOutputKeyIdentity = actual!.makeIdentity()
  const expectedOutputKeyIdentity = expectedKey.makeIdentity()
  expect(actualOutputKeyIdentity.Equals(expectedOutputKeyIdentity),
    `Expected '${expectedOutputKeyIdentity.getDebugName()}'; ` +
    `got '${actualOutputKeyIdentity.getDebugName()}'`).toBe(true)
}

// TestExecInputResolverCustomSchema is a codeless schema that's loaded for
// this test only. The schema is loaded from
// testenv/testExecInputResolver/resources.
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecInputResolverCustomSchema', (self) => {
  self.primComputation(_tokens.primComputation)
    .Callback(VtValueTypes.int, () => 0)

  self.dispatchedPrimComputation(_tokens.dispatchedPrimComputation)
    .Callback(VtValueTypes.int, () => 0)

  self.attributeComputation(
    _tokens.attr,
    _tokens.attributeComputation)
    .Callback(VtValueTypes.int, () => 0)

  self.dispatchedAttributeComputation(
    _tokens.dispatchedAttributeComputation)
    .Callback(VtValueTypes.int, () => 0)
})

const _stageDatas: EsfUsdStageData[] = []

async function _NewStageFromLayer(layerContents: string): Promise<EsfStage> {
  const layer = SdfLayer.createAnonymous('.usda')
  layer.importFromString(layerContents)
  TF_AXIOM(layer)
  const usdStage = await UsdStage.open(layer)
  TF_AXIOM(usdStage)
  const stageData = EsfUsdStageData.registerStage(usdStage, /* listener */ null)
  TF_AXIOM(stageData)
  _stageDatas.push(stageData)
  return EsfUsdSceneAdapter.adaptStage(usdStage)
}

class Fixture {
  primComputationDefinition!: Exec_ComputationDefinition
  dispatchedPrimComputationDefinition!: Exec_ComputationDefinition
  attributeComputationDefinition!: Exec_ComputationDefinition
  dispatchedAttributeComputationDefinition!: Exec_ComputationDefinition
  timeComputationDefinition!: Exec_ComputationDefinition
  journal = new EsfJournal()
  #stage: EsfStage | undefined

  static async create(): Promise<Fixture> {
    const fixture = new Fixture()
    const nullJournal: EsfJournal | null = null
    const reg = Exec_DefinitionRegistry.GetInstance()

    // Instantiate a stage that we can use to get ahold of the computation
    // definitions that we expect to find in the test cases.

    const stage = await _NewStageFromLayer(`#usda 1.0
            def CustomSchema "Prim" {
                int attr
            }
        `)

    const prim =
      stage.Get().getPrimAtPath(SdfPath.fromString('/Prim'), nullJournal)
    TF_AXIOM(prim.Get().isValid(nullJournal))

    const primComputationDefinition =
      reg.getComputationDefinition(
        prim.Get(), _tokens.primComputation,
        new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(primComputationDefinition)
    fixture.primComputationDefinition = primComputationDefinition

    const dispatchedPrimComputationDefinition =
      reg.getComputationDefinition(
        prim.Get(), _tokens.dispatchedPrimComputation,
        prim.Get().getSchemaConfigKey(nullJournal), nullJournal)
    TF_AXIOM(primComputationDefinition)
    fixture.dispatchedPrimComputationDefinition = dispatchedPrimComputationDefinition!

    const attribute =
      stage.Get().getAttributeAtPath(SdfPath.fromString('/Prim.attr'), nullJournal)
    TF_AXIOM(attribute.Get().isValid(nullJournal))

    const attributeComputationDefinition =
      reg.getComputationDefinition(
        attribute.Get(), _tokens.attributeComputation,
        new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(attributeComputationDefinition)
    fixture.attributeComputationDefinition = attributeComputationDefinition

    const dispatchedAttributeComputationDefinition =
      reg.getComputationDefinition(
        attribute.Get(), _tokens.dispatchedAttributeComputation,
        attribute.Get().getSchemaConfigKey(nullJournal), nullJournal)
    TF_AXIOM(attributeComputationDefinition)
    fixture.dispatchedAttributeComputationDefinition = dispatchedAttributeComputationDefinition!

    const pseudoRoot =
      stage.Get().getPrimAtPath(SdfPath.fromString('/'), nullJournal)
    TF_AXIOM(pseudoRoot.Get().isValid(nullJournal))

    const timeComputationDefinition =
      reg.getComputationDefinition(
        pseudoRoot.Get(), ExecBuiltinComputations.computeTime,
        new EsfSchemaConfigKey(), nullJournal)
    TF_AXIOM(timeComputationDefinition)
    fixture.timeComputationDefinition = timeComputationDefinition

    return fixture
  }

  async newStageFromLayer(layerContents: string): Promise<void> {
    this.#stage = await _NewStageFromLayer(layerContents)
  }

  getObjectAtPath(pathString: string): EsfObject {
    return this.#stage!.Get().getObjectAtPath(SdfPath.fromString(pathString), null)
  }

  resolveInput(
    origin: EsfObject,
    computationName: string,
    resultType: TfType,
    dispatchingSchemaKey: EsfSchemaConfigKey,
    localTraversal: SdfPath,
    dynamicTraversal: ExecProviderResolution.DynamicTraversal,
  ): Exec_OutputKeyVector {
    TF_AXIOM(origin.Get().isValid(null))

    const fallsBackToDispatched =
      dispatchingSchemaKey.notEquals(new EsfSchemaConfigKey())

    const inputKey: Exec_InputKey = {
      inputName: _tokens.inputName,
      computationName,
      disambiguatingId: /* metadataKey */ '',
      resultType,
      providerResolution: {
        localTraversal,
        dynamicTraversal,
      },
      fallsBackToDispatched,
      optional: /* optional */ false,
    }
    return Exec_ResolveInput(
      this.#stage!, origin, dispatchingSchemaKey, inputKey, this.journal)
  }
}

const P = (s: string): SdfPath => SdfPath.fromString(s)
const DT = ExecProviderResolution.DynamicTraversal
const R = EsfEditReason

function _RegisterTestPlugins(): void {
  // Load the custom schema.
  const resources = new URL('../fixtures/testExecInputResolver/resources/', import.meta.url)
  const plugInfoText = readFileSync(new URL('plugInfo.json', resources), 'utf8')
  const plugInfo = JSON.parse(plugInfoText.split('\n')
    .filter(line => !line.trimStart().startsWith('#')).join('\n')) as PlugInfo
  const testPlugins = PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
    testExecInputResolver: {
      'generatedSchema.usda': readFileSync(new URL('generatedSchema.usda', resources), 'utf8'),
    },
  })
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecInputResolver')

  const customSchemaType =
    TfType.findByName('TestExecInputResolverCustomSchema')
  TF_AXIOM(!customSchemaType.isUnknown())
}

_RegisterTestPlugins()

describe('testExecInputResolver', () => {
  // Test that Exec_ResolveInput finds a computation on the origin prim.
  it('TestResolveToComputationPrimOrigin', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.primComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.Local)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Origin'),
      new EsfSchemaConfigKey(),
      fixture.primComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal.add(P('/Origin'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds a computation on the origin attribute.
  it('TestResolveToComputationAttributeOrigin', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            int attr
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Prim.attr'),
      _tokens.attributeComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.Local)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Prim.attr'),
      new EsfSchemaConfigKey(),
      fixture.attributeComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal.add(P('/Prim.attr'), R.ResyncedObject)
    expectedJournal.add(P('/Prim'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput fails to find a computation on the origin
  // object if that object does not define a computation by that name.
  it('TestResolveToComputationOrigin_NoSuchComputation', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.nonExistentComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.Local)

    expect(outputKeys.length).toBe(0)

    const expectedJournal = new EsfJournal()
    expectedJournal.add(P('/Origin'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput fails to find a computation on the origin
  // object if a computation of the requested name was found, but it does not
  // match the requested result type.
  it('TestResolveToComputationOrigin_WrongResultType', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.primComputation,
      VtValueTypes.double,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.Local)

    expect(outputKeys.length).toBe(0)

    const expectedJournal = new EsfJournal()
    expectedJournal.add(P('/Origin'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds a computation on the nearest namespace
  // ancestor that defines the requested computation.
  it('TestResolveToNamespaceAncestor', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Root" {
            def CustomSchema "Ancestor" {
                def Scope "Scope1" {
                    def Scope "Scope2" {
                        def Scope "Origin" {
                        }
                    }
                }
            }
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Root/Ancestor/Scope1/Scope2/Origin'),
      _tokens.primComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.NamespaceAncestor)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Root/Ancestor'),
      new EsfSchemaConfigKey(),
      fixture.primComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Root/Ancestor/Scope1/Scope2/Origin'),
        R.ResyncedObject)
      .add(P('/Root/Ancestor/Scope1/Scope2'),
        R.ResyncedObject)
      .add(P('/Root/Ancestor/Scope1'),
        R.ResyncedObject)
      .add(P('/Root/Ancestor'),
        R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput fails to find a computation on the nearest
  // namespace ancestor if no ancestor defines a computation by that name.
  it('TestResolveToNamespaceAncestor_NoSuchAncestor', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def Scope "Root" {
            def Scope "Parent" {
                def CustomSchema "Origin" {
                }
            }
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Root/Parent/Origin'),
      _tokens.primComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.NamespaceAncestor)

    expect(outputKeys.length).toBe(0)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Root/Parent/Origin'),
        R.ResyncedObject)
      .add(P('/Root/Parent'),
        R.ResyncedObject)
      .add(P('/Root'),
        R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput fails to find a computation on the nearest
  // namespace ancestor if all ancestors define computations of the requested
  // name, but of different result types.
  it('TestResolveToNamespaceAncestor_WrongResultType', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Root" {
            def CustomSchema "Parent" {
                def CustomSchema "Origin" {
                }
            }
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Root/Parent/Origin'),
      _tokens.primComputation,
      VtValueTypes.double,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.NamespaceAncestor)

    expect(outputKeys.length).toBe(0)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Root/Parent/Origin'),
        R.ResyncedObject)
      .add(P('/Root/Parent'),
        R.ResyncedObject)
      .add(P('/Root'),
        R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds a computation on the owning prim when
  // the origin is an attribute, and the local traversal is "..".
  it('TestResolveToOwningPrim', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "OwningPrim" {
            double origin = 1.0
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/OwningPrim.origin'),
      _tokens.primComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('..'),
      DT.Local)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/OwningPrim'),
      new EsfSchemaConfigKey(),
      fixture.primComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/OwningPrim.origin'), R.ResyncedObject)
      .add(P('/OwningPrim'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds computations on the targeted objects
  // when the origin is a prim, the local traversal is the relative path to a
  // relationship and the dynamic traversal is TargetedObjects.
  it('TestResolveToTargetedObjects', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
            add rel myRel = [</Origin/A>, </Origin.forwardingRel>]
            add rel forwardingRel = </Origin/B>
            def CustomSchema "A" {}
            def CustomSchema "B" {}
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.primComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.myRel'),
      DT.RelationshipTargetedObjects)

    expect(outputKeys.length).toBe(2)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Origin/A'),
      new EsfSchemaConfigKey(),
      fixture.primComputationDefinition)
    ASSERT_OUTPUT_KEY(
      outputKeys[1],
      fixture.getObjectAtPath('/Origin/B'),
      new EsfSchemaConfigKey(),
      fixture.primComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Origin'), R.ResyncedObject)
      .add(P('/Origin.myRel'), R.ResyncedObject)
      .add(P('/Origin.myRel'), R.ChangedTargetPaths)
      .add(P('/Origin.forwardingRel'), R.ResyncedObject)
      .add(P('/Origin.forwardingRel'), R.ChangedTargetPaths)
      .add(P('/Origin/A'), R.ResyncedObject)
      .add(P('/Origin/B'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput silently ignores missing targets.
  it('TestResolveToTargetedObjects_MissingTarget', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
            add rel myRel = [</Origin/A>, </Origin/B>]
            def CustomSchema "A" {}
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.primComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.myRel'),
      DT.RelationshipTargetedObjects)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Origin/A'),
      new EsfSchemaConfigKey(),
      fixture.primComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Origin'), R.ResyncedObject)
      .add(P('/Origin.myRel'), R.ResyncedObject)
      .add(P('/Origin.myRel'), R.ChangedTargetPaths)
      .add(P('/Origin/A'), R.ResyncedObject)
      .add(P('/Origin/B'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds computations on the targeted objects
  // when the origin is a prim, the local traversal is the relative path to an
  // attribute and the dynamic traversal is ConnectionTargetedObjects.
  it('TestResolveToConnectionTargetedObjects', async () => {
    // TODO: When we provide a way for prims to register 'computeValue'
    // computations, we can add an attribute connection that targets a prim
    // here.
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
            int myAttr.connect = [</Origin/A.attr>, </Origin/B.attr>]
            def CustomSchema "A" {
                int attr
            }
            def CustomSchema "B" {
                int attr
            }
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.attributeComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.myAttr'),
      DT.ConnectionTargetedObjects)

    expect(outputKeys.length).toBe(2)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Origin/A.attr'),
      new EsfSchemaConfigKey(),
      fixture.attributeComputationDefinition)
    ASSERT_OUTPUT_KEY(
      outputKeys[1],
      fixture.getObjectAtPath('/Origin/B.attr'),
      new EsfSchemaConfigKey(),
      fixture.attributeComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Origin'), R.ResyncedObject)
      .add(P('/Origin.myAttr'), R.ResyncedObject)
      .add(P('/Origin.myAttr'), R.ChangedConnectionPaths)
      .add(P('/Origin/A'), R.ResyncedObject)
      .add(P('/Origin/A.attr'), R.ResyncedObject)
      .add(P('/Origin/B'), R.ResyncedObject)
      .add(P('/Origin/B.attr'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput silently ignores missing connection targets.
  it('TestResolveToConnectionTargetedObjects_MissingConnectionTarget', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
            int myAttr.connect = [</Origin/A.attr>, </Origin/B.attr>]
            def CustomSchema "A" {
                int attr
            }
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.attributeComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.myAttr'),
      DT.ConnectionTargetedObjects)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Origin/A.attr'),
      new EsfSchemaConfigKey(),
      fixture.attributeComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Origin'), R.ResyncedObject)
      .add(P('/Origin.myAttr'), R.ResyncedObject)
      .add(P('/Origin.myAttr'), R.ChangedConnectionPaths)
      .add(P('/Origin/A'), R.ResyncedObject)
      .add(P('/Origin/A.attr'), R.ResyncedObject)
      .add(P('/Origin/B.attr'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds computations on attributes that have
  // connections to a prim and the dynamic traversal is
  // IncomingConnectionOwningAttributes.
  it('TestResolveToIncomingConnectionOwningAttributes', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Origin" {
            def CustomSchema "A" {
                int attr.connect = [</Origin>]
            }
            def CustomSchema "B" {
                int attr.connect = [</Origin>]
            }
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Origin'),
      _tokens.attributeComputation,
      VtValueTypes.int,
      new EsfSchemaConfigKey(),
      P('.'),
      DT.IncomingConnectionOwningAttributes)

    expect(outputKeys.length).toBe(2)

    // The order of the input keys isn't deterministic for incoming
    // connections.
    const swap =
      outputKeys[0]!.getProviderObject().Get().getPath(/* journal */ null).equals(
        P('/Origin/B.attr'))
    ASSERT_OUTPUT_KEY(
      outputKeys[swap ? 1 : 0],
      fixture.getObjectAtPath('/Origin/A.attr'),
      new EsfSchemaConfigKey(),
      fixture.attributeComputationDefinition)
    ASSERT_OUTPUT_KEY(
      outputKeys[swap ? 0 : 1],
      fixture.getObjectAtPath('/Origin/B.attr'),
      new EsfSchemaConfigKey(),
      fixture.attributeComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Origin'), R.ResyncedObject)
      .add(P('/Origin'), R.ChangedIncomingConnections)
      .add(P('/Origin/A'), R.ResyncedObject)
      .add(P('/Origin/A.attr'), R.ResyncedObject)
      .add(P('/Origin/B'), R.ResyncedObject)
      .add(P('/Origin/B.attr'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test that Exec_ResolveInput finds a computation on the stage (i.e., on
  // the pseudoroot prim), and the local traversal is "/".
  it('TestResolveToStage', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def CustomSchema "Root" {
        }
    `)

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Root') /* origin */,
      ExecBuiltinComputations.computeTime,
      EfTimeType,
      new EsfSchemaConfigKey(),
      P('/') /* localTraversal */,
      DT.Local)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/'),
      new EsfSchemaConfigKey(),
      fixture.timeComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Directly test dispatched input resolution here by resolving using the
  // parent prim as the origin, but providing the config key for the child
  // prim's schema, which is the schema that dispatches the computation we
  // request.
  it('TestResolveForDispatchedPrimComputation', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def Scope "Parent" {
            def CustomSchema "Child" {
            }
        }
    `)

    const nullJournal: EsfJournal | null = null

    const parent = fixture.getObjectAtPath('/Parent')
    TF_AXIOM(parent.Get().isValid(nullJournal))
    TF_AXIOM(parent.Get().isPrim())
    const child = fixture.getObjectAtPath('/Parent/Child')
    TF_AXIOM(child.Get().isValid(nullJournal))
    TF_AXIOM(child.Get().isPrim())

    const outputKeys = fixture.resolveInput(
      parent /* origin */,
      _tokens.dispatchedPrimComputation,
      VtValueTypes.int,
      child.Get().getSchemaConfigKey(nullJournal),
      P('.') /* localTraversal */,
      DT.Local)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      parent,
      child.Get().getSchemaConfigKey(nullJournal),
      fixture.dispatchedPrimComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Parent'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Directly test dispatched input resolution here by resolving using an
  // attribute on the parent prim as the origin, but providing the config key
  // for the child prim's schema, which is the schema that dispatches the
  // attribute computation we request.
  it('TestResolveForDispatchedAttributeComputation', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def Scope "Parent" {
            int attr
            def CustomSchema "Child" {
            }
        }
    `)

    const nullJournal: EsfJournal | null = null

    const attr = fixture.getObjectAtPath('/Parent.attr')
    TF_AXIOM(attr.Get().isValid(nullJournal))
    TF_AXIOM(attr.Get().isAttribute())
    const child = fixture.getObjectAtPath('/Parent/Child')
    TF_AXIOM(child.Get().isValid(nullJournal))
    TF_AXIOM(child.Get().isPrim())

    const outputKeys = fixture.resolveInput(
      attr /* origin */,
      _tokens.dispatchedAttributeComputation,
      VtValueTypes.int,
      child.Get().getSchemaConfigKey(nullJournal),
      P('.') /* localTraversal */,
      DT.Local)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      attr,
      child.Get().getSchemaConfigKey(nullJournal),
      fixture.dispatchedAttributeComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Parent.attr'), R.ResyncedObject)
      .add(P('/Parent'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })

  // Test resolving an input from a dispatched computation via relationship
  // targets.
  it('TestResolveForDispatchedComputation_RelTarget', async () => {
    const fixture = await Fixture.create()
    await fixture.newStageFromLayer(`#usda 1.0
        def Scope "Parent" {
            def CustomSchema "Child" {
                add rel myRel = </Parent/A>
            }
            def Scope "A" {}
        }
    `)

    const nullJournal: EsfJournal | null = null

    const parent = fixture.getObjectAtPath('/Parent')
    TF_AXIOM(parent.Get().isValid(nullJournal))
    TF_AXIOM(parent.Get().isPrim())
    const child = fixture.getObjectAtPath('/Parent/Child')
    TF_AXIOM(child.Get().isValid(nullJournal))
    TF_AXIOM(child.Get().isPrim())

    const outputKeys = fixture.resolveInput(
      fixture.getObjectAtPath('/Parent/Child'),
      _tokens.dispatchedPrimComputation,
      VtValueTypes.int,
      child.Get().getSchemaConfigKey(nullJournal),
      P('.myRel'),
      DT.RelationshipTargetedObjects)

    expect(outputKeys.length).toBe(1)
    ASSERT_OUTPUT_KEY(
      outputKeys[0],
      fixture.getObjectAtPath('/Parent/A'),
      child.Get().getSchemaConfigKey(nullJournal),
      fixture.dispatchedPrimComputationDefinition)

    const expectedJournal = new EsfJournal()
    expectedJournal
      .add(P('/Parent/Child'), R.ResyncedObject)
      .add(P('/Parent/Child.myRel'), R.ResyncedObject)
      .add(P('/Parent/Child.myRel'), R.ChangedTargetPaths)
      .add(P('/Parent/A'), R.ResyncedObject)
    ASSERT_JOURNAL_EQ(fixture.journal, expectedJournal)
  })
})
