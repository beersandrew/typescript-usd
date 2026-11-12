// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAppliedAPISchemas.py, pxr/usd/usd/prim.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdAppliedAPISchemas.py (v26.05)
//
// Scoreboard for the schema-registry work. FLIPPED at the F1 registry core: the four REGISTRY-ONLY cases
// (test_SimpleAbstractSchemaPrimDefinition, test_SimpleAbstractSchema-
// PrimDefinitionWithAutoApplySchema, test_SimpleTypedSchemaPrimDefinition,
// test_TypedSchemaWithBuiltinAPISchemas) self-promoted and are plain it()
// now. FLIPPED at F1-C (prim/value-resolution wiring): the remaining 14
// cases (test_UntypedPrimOnStage … test_PropertyOversInAPISchemas)
// self-promoted once prim.getPrimTypeInfo/getPrimDefinition, composed
// getAppliedSchemas/hasAPI, ApplyAPI/RemoveAPI/CanApplyAPI validation, and
// prim metadata fallbacks landed — the whole suite is plain it() now.
// The "already green" block gained registerTestSchemas(): ApplyAPI now
// validates against the registry (prim.cpp:912-921, unknown schema = coding
// error), so its string names must be registered like upstream's.
//
// Fixtures: upstream testenv/testUsdAppliedAPISchemas/resources/* vendored
// VERBATIM in fixtures/appliedAPISchemas/ (plugInfo.json + generatedSchema.usda
// define the Test* schemas; schema.usda is the source they were generated
// from). Core usd's own plugInfo.json + generatedSchema.usda vendored in
// fixtures/vendored/usd/ (declares UsdSchemaBase/UsdAPISchemaBase bases and
// the core API schemas, e.g. ModelAPI for the no-apply error case).
//
// Porting conventions (upstream → typescript-usd):
//  - Tf.Type-based ApplyAPI/RemoveAPI/HasAPI/CanApplyAPI(type[, instance]) →
//    the composed applied-schema NAME string ('TestSingleApplyAPI',
//    'TestMultiApplyAPI:garply'); HasAPI(type) with no instance on a
//    multi-apply schema is the FAMILY query (matches any instance).
//  - attr.Get()/GetFallbackValue()/GetResolveInfo() on unauthored built-ins →
//    the composed prim definition's attribute accessor
//    (prim.getPrimDefinition().getAttributeDefinition(n).getFallbackValue()):
//    nothing is authored in these cases, so upstream's resolved value IS the
//    definition fallback (Usd_GetFallbackValue, ResolveInfoSourceFallback).
//  - prim.SetMetadata('apiSchemas', listOp) → Layer.setField on the target
//    layer + await stage.flushChanges() (async-coalesced recompose model).
//  - Usd.EditContext(stage, sessionLayer) → setEditTarget(sessionLayer) /
//    restore.
//
// Exclusions (enumerated):
//  1. test_TypedPrimsOnStageWithAutoAppliedAPIs_AutoApplyDisabled and
//     test_APISchemasAutoAppliedToAPISchemas_AutoApplyDisabled — the
//     USD_DISABLE_AUTO_APPLY_API_SCHEMAS variants run as a SEPARATE process
//     invocation upstream (env setting read once at registry build); a
//     single-process vitest run cannot rebuild the singleton with the env
//     flipped. The auto-apply-ENABLED twins are ported.
//  2. CanApplyAPI whyNot annotation strings — typescript-usd canApplyAPI returns a
//     plain boolean (no annotated-bool surface); the allow/deny matrix itself
//     IS ported, including the error conditions.
//  3. Usd.AttributeQuery fallback duplicates and GetResolveInfo().GetSource()
//     assertions — no UsdAttributeQuery/UsdResolveInfo surface; the fallback
//     VALUES are asserted via the prim definition (source is fallback by
//     construction: nothing is authored).
//  4. Stage-attribute metadata reads in the property-composition helpers
//     (attr.GetDocumentation() == '' on prim instances, custom=False,
//     GetAllMetadata exact-dict equality) — typescript-usd has no UsdAttribute
//     metadata surface; the load-bearing composed FIELDS (typeName,
//     variability, default, hidden, allowedTokens, displayGroup, displayName)
//     are asserted on the composed prim definition with upstream's exact
//     expected values.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage, SchemaRegistry as UsdSchemaRegistry, type Prim } from 'typescript-usd/usd'
import { ArInMemoryResolver, type Layer } from 'typescript-usd/usd/_internal'
import type { PrimDefinition as UsdPrimDefinition } from 'typescript-usd/usd'
import { Registry as PlugRegistry, Info as PlugInfo } from 'typescript-usd/plug'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = path.join(__dirname, 'fixtures')

function readFixture(rel: string): string {
  return readFileSync(path.join(FIXTURES, rel), 'utf8')
}

// pxr's plugInfo.json dialect allows '#' comment lines (upstream's JS parser
// strips them); strip before JSON.parse.
function parsePlugInfo(text: string): PlugInfo {
  const stripped = text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  return JSON.parse(stripped) as PlugInfo
}

// Upstream setUpClass: Plug.Registry().RegisterPlugins(resources). Called
// INSIDE each case (a throwing registration must not poison the whole file
// via beforeAll). Re-registration is a no-op upstream (first wins), so every
// case may call this.
function registerTestSchemas(): void {
  const reg = PlugRegistry.GetInstance()
  reg.RegisterPlugins(parsePlugInfo(readFixture('vendored/usd/plugInfo.json')), {
    usd: { 'generatedSchema.usda': readFixture('vendored/usd/generatedSchema.usda') },
  })
  reg.RegisterPlugins(parsePlugInfo(readFixture('appliedAPISchemas/plugInfo.json')), {
    testUsdAppliedAPISchemas: {
      'generatedSchema.usda': readFixture('appliedAPISchemas/generatedSchema.usda'),
    },
  })
  expect(reg.GetPluginWithName('testUsdAppliedAPISchemas')).not.toBeNull()
}

// Usd.Stage.CreateInMemory() — upstream in-memory stages have a session
// layer. typescript-usd createNew() has none, so session-layer cases open an empty
// virtual-fs layer through the full (pcp) path instead.
async function openSessionStage(): Promise<Stage> {
  const resolver = new ArInMemoryResolver({
    'appliedAPISchemas_inmem.usda': new TextEncoder().encode('#usda 1.0\n'),
  })
  return (await Stage.open('appliedAPISchemas_inmem.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
}

interface TokenListOp {
  isExplicit: boolean
  explicitItems: string[]
  prependedItems: string[]
  appendedItems: string[]
  deletedItems: string[]
}

// _VerifyListOp: the state of the 'apiSchemas' list op on /Prim in a layer.
function expectListOp(
  layer: Layer,
  expected: { explicit?: string[]; prepended?: string[]; appended?: string[]; deleted?: string[] },
  primPath = '/Prim',
): void {
  const lop = layer.getField(primPath, 'apiSchemas') as TokenListOp | undefined
  expect(lop, `apiSchemas listOp on ${primPath}`).toBeDefined()
  expect(lop!.explicitItems).toEqual(expected.explicit ?? [])
  expect(lop!.prependedItems).toEqual(expected.prepended ?? [])
  expect(lop!.appendedItems).toEqual(expected.appended ?? [])
  expect(lop!.deletedItems).toEqual(expected.deleted ?? [])
}

const EMPTY_LIST_OP: TokenListOp = {
  isExplicit: false, explicitItems: [], prependedItems: [], appendedItems: [], deletedItems: [],
}

// _VerifyAttrValues: resolved values of unauthored built-in attributes ==
// the composed prim definition's fallbacks (see header convention).
function expectFallbackValues(prim: Prim, expected: Record<string, unknown>): void {
  const def = prim.getPrimDefinition()
  const actual: Record<string, unknown> = {}
  for (const name of Object.keys(expected)) {
    actual[name] = def.getAttributeDefinition(name).getFallbackValue()
  }
  expect(actual).toEqual(expected)
}

// _VerifySameMetadata: two property definitions carry identical spec fields
// (optionally excluding fields the test composes differently, e.g. uiHints).
function expectSameMetadata(
  defA: UsdPrimDefinition, nameA: string,
  defB: UsdPrimDefinition, nameB: string,
  fieldsToExclude: string[] = [],
): void {
  const a = defA.getPropertyDefinition(nameA)
  const b = defB.getPropertyDefinition(nameB)
  expect([...a.listMetadataFields()].sort()).toEqual([...b.listMetadataFields()].sort())
  for (const field of a.listMetadataFields()) {
    if (!fieldsToExclude.includes(field)) {
      expect(a.getMetadata(field), `field ${field}`).toEqual(b.getMetadata(field))
    }
  }
}

// _VerifyAttribute (test_PropertyComposition / test_PropertyOversInAPISchemas):
// composed property fields on the prim definition. `default`/`hidden`
// undefined = upstream asserts NO opinion for the field.
function verifyAttrDef(
  prim: Prim,
  name: string,
  exp: {
    typeName: string
    default?: unknown
    hidden?: boolean
    uniform?: boolean
    displayGroup?: string | null
    displayName?: string | null
    allowedTokens?: string[] | null
  },
): void {
  const attr = prim.getPrimDefinition().getAttributeDefinition(name)
  expect(attr.isValid(), `attribute ${name}`).toBe(true)
  expect(attr.getTypeNameToken(), `${name} typeName`).toBe(exp.typeName)
  expect(attr.getVariability(), `${name} variability`).toBe(exp.uniform ? 'uniform' : 'varying')
  if (exp.default === undefined) {
    expect(attr.getFallbackValue(), `${name} default`).toBeUndefined()
  } else {
    expect(attr.getFallbackValue(), `${name} default`).toEqual(exp.default)
  }
  if (exp.hidden === undefined) {
    expect(attr.getMetadata('hidden'), `${name} hidden`).toBeUndefined()
  } else {
    expect(attr.getMetadata('hidden'), `${name} hidden`).toBe(exp.hidden)
  }
  for (const [field, value] of Object.entries({
    displayGroup: exp.displayGroup, displayName: exp.displayName, allowedTokens: exp.allowedTokens,
  })) {
    if (value === undefined) continue
    if (value === null) expect(attr.getMetadata(field), `${name} ${field}`).toBeUndefined()
    else expect(attr.getMetadata(field), `${name} ${field}`).toEqual(value)
  }
}

function expectNoProperty(prim: Prim, name: string): void {
  expect(prim.getPrimDefinition().getPropertyDefinition(name).isValid(), `no property ${name}`).toBe(false)
}

// ---------------------------------------------------------------------------
// Already green on today's string-based apiSchemas listOp plumbing (verified
// by running — see header). These are GATED; they are the registry-free slice
// of test_ApplyRemoveAPI (root layer only, string names, no validation).
// ---------------------------------------------------------------------------

describe('testUsdAppliedAPISchemas — already green (authored listOp slice)', () => {
  it('apply authors the prepend list, is idempotent, and remove moves to the delete list', () => {
    // test_ApplyRemoveAPI lines 874-896 (single-apply schema, root layer).
    registerTestSchemas()
    const stage = Stage.createNew()
    const rootLayer = stage.getRootLayer()
    const prim = stage.definePrim('/Prim')
    expect(prim.getAppliedSchemas()).toEqual([])

    prim.applyAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual(['TestSingleApplyAPI'])
    expect(prim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expectListOp(rootLayer, { prepended: ['TestSingleApplyAPI'] })

    // Apply the same API schema again. This will not update the list.
    prim.applyAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual(['TestSingleApplyAPI'])
    expectListOp(rootLayer, { prepended: ['TestSingleApplyAPI'] })

    // Remove: removed from the prepend list, added to the deleted list.
    prim.removeAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI'] })

    // Remove again: no-op.
    prim.removeAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI'] })
  })

  it('removing an unapplied multi-apply instance still adds a delete entry; re-apply prepends without undeleting', () => {
    // test_ApplyRemoveAPI lines 898-913.
    registerTestSchemas()
    const stage = Stage.createNew()
    const rootLayer = stage.getRootLayer()
    const prim = stage.definePrim('/Prim')
    prim.applyAPI('TestSingleApplyAPI')
    prim.removeAPI('TestSingleApplyAPI')
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI'] })

    // Remove a multi-apply instance not currently in the list — its name is
    // still added to the deleted list.
    prim.removeAPI('TestMultiApplyAPI:foo')
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'] })

    // Apply the instance just deleted: added to prepends, NOT removed from
    // deletes; still composes on (deletes process before prepends in the
    // same list op).
    prim.applyAPI('TestMultiApplyAPI:foo')
    expect(prim.getAppliedSchemas()).toEqual(['TestMultiApplyAPI:foo'])
    expectListOp(rootLayer, {
      prepended: ['TestMultiApplyAPI:foo'],
      deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'],
    })
  })
})

// ---------------------------------------------------------------------------
// RED SCOREBOARD — flips green with F0 (typescript-usd/plug) + F1 (registry + wiring).
// ---------------------------------------------------------------------------

describe('testUsdAppliedAPISchemas — scoreboard (red until schema-registry F1)', () => {
  it('test_SimpleAbstractSchemaPrimDefinition', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()

    const primDef = reg.findAbstractPrimDefinition('TestAbstractTypedWithAPIApplied')
    expect(primDef).not.toBeNull()
    expect(primDef!.getLocallyDefinedPropertyNames()).toEqual(['abstractAttr'])
    expect(primDef!.getPropertyNames()).toEqual([
      'single:relationship', 'single:token_attr',
      'single:bool_attr', 'abstractAttr',
      'single:no_fallback'])
    expect(primDef!.getAppliedAPISchemas()).toEqual(['TestSingleApplyAPI'])
    const abstractIntAttr = primDef!.getAttributeDefinition('abstractAttr')
    expect(abstractIntAttr.getTypeNameToken()).toBe('int')
    expect(abstractIntAttr.getFallbackValue()).toBe(1)
  })

  it('test_SimpleAbstractSchemaPrimDefinitionWithAutoApplySchema', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()

    // TestSingleApplyAPI auto-applies to TestTypedSchemaForAutoApplyAbstractBase.
    const primDef = reg.findAbstractPrimDefinition('TestTypedSchemaForAutoApplyAbstractBase')
    expect(primDef).not.toBeNull()
    expect(primDef!.getLocallyDefinedPropertyNames()).toEqual(['testAttr', 'testRel'])
    expect(primDef!.getPropertyNames()).toEqual([
      'single:relationship', 'single:token_attr',
      'single:bool_attr', 'compose:relationship',
      'compose:token_attr', 'compose:bool_attr',
      'single:no_fallback', 'testAttr', 'testRel'])
    expect(primDef!.getAppliedAPISchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestComposeMetadataAPI'])
  })

  it('test_SimpleTypedSchemaPrimDefinition', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()

    const primDef = reg.findConcretePrimDefinition('TestTypedSchema')
    expect(primDef).not.toBeNull()
    expect(primDef!.getPropertyNames()).toEqual(['testRel', 'testAttr'])
    expect(primDef!.getAppliedAPISchemas()).toEqual([])
    expect(primDef!.getDocumentation()).toBe('Testing typed schema.')

    for (const propName of primDef!.getPropertyNames()) {
      expect(primDef!.getPropertyDefinition(propName).isValid()).toBe(true)
    }

    const testAttr = primDef!.getAttributeDefinition('testAttr')
    expect(testAttr.getFallbackValue()).toBe('foo')
    expect(testAttr.getTypeNameToken()).toBe('string')

    expect(primDef!.getRelationshipDefinition('testRel').isValid()).toBe(true)
  })

  it('test_TypedSchemaWithBuiltinAPISchemas', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()

    // The single-apply API schema's own prim definition.
    const singleApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestSingleApplyAPI')
    expect(singleApplyAPIDef).not.toBeNull()
    expect(singleApplyAPIDef!.getAppliedAPISchemas()).toEqual(['TestSingleApplyAPI'])
    expect(singleApplyAPIDef!.getLocallyDefinedPropertyNames()).toEqual([
      'single:relationship', 'single:token_attr', 'single:bool_attr',
      'single:no_fallback'])
    expect(singleApplyAPIDef!.getPropertyNames()).toEqual([
      'single:relationship', 'single:token_attr', 'single:bool_attr',
      'single:no_fallback'])
    expect(singleApplyAPIDef!.getDocumentation()).toBe('Test single apply API schema.')

    // The multi-apply API schema's definition — properties are name TEMPLATES.
    const multiApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestMultiApplyAPI')
    expect(multiApplyAPIDef).not.toBeNull()
    expect(multiApplyAPIDef!.getAppliedAPISchemas()).toEqual(
      ['TestMultiApplyAPI:__INSTANCE_NAME__'])
    expect(multiApplyAPIDef!.getLocallyDefinedPropertyNames()).toEqual([
      'multi:__INSTANCE_NAME__:bool_attr',
      'multi:__INSTANCE_NAME__:relationship',
      'multi:__INSTANCE_NAME__:token_attr'])
    expect(multiApplyAPIDef!.getPropertyNames()).toEqual([
      'multi:__INSTANCE_NAME__:bool_attr',
      'multi:__INSTANCE_NAME__:relationship',
      'multi:__INSTANCE_NAME__:token_attr'])
    expect(multiApplyAPIDef!.getDocumentation()).toBe('Test multi-apply API schema.')

    // Concrete type with built-in API schemas.
    const primDef = reg.findConcretePrimDefinition('TestWithBuiltinAppliedSchema')
    expect(primDef).not.toBeNull()
    expect(primDef!.getAppliedAPISchemas()).toEqual([
      'TestSingleApplyAPI', 'TestMultiApplyAPI:builtin', 'TestComposeMetadataAPI'])

    // Property order respected.
    expect(primDef!.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])
    // Prim def documentation does NOT come from the built-in API schemas.
    expect(primDef!.getDocumentation()).toBe('Test with built-in API schemas.')

    for (const propName of primDef!.getPropertyNames()) {
      expect(primDef!.getPropertyDefinition(propName).isValid()).toBe(true)
    }

    const testAttr = primDef!.getAttributeDefinition('testAttr')
    expect(testAttr.getFallbackValue()).toBe('foo')
    expect(testAttr.getTypeNameToken()).toBe('string')
    expect(primDef!.getRelationshipDefinition('testRel').isValid()).toBe(true)

    // Properties from the single-apply schema match the API schema's own
    // definition — except single:bool_attr, whose 'uiHints' dictionary merges
    // across TestSingleApplyAPI and TestComposeMetadataAPI.
    const singleBoolAttr = primDef!.getAttributeDefinition('single:bool_attr')
    expectSameMetadata(primDef!, 'single:bool_attr',
      singleApplyAPIDef!, 'single:bool_attr', ['uiHints'])
    expect(singleBoolAttr.getFallbackValue()).toBe(true)
    expect(singleBoolAttr.getTypeNameToken()).toBe('bool')
    // Dictionary metadata composes across API schemas.
    expect(singleBoolAttr.getMetadata('uiHints')).toEqual({
      displayGroup: 'single:bool_attr group',
      valueLabels: { TestCompose: true, compose_bool_attr: true, single_bool_attr: false },
    })

    const singleTokenAttr = primDef!.getAttributeDefinition('single:token_attr')
    expectSameMetadata(primDef!, 'single:token_attr', singleApplyAPIDef!, 'single:token_attr')
    expect(singleTokenAttr.getFallbackValue()).toBe('bar')
    expect(singleTokenAttr.getTypeNameToken()).toBe('token')

    expect(primDef!.getRelationshipDefinition('single:relationship').isValid()).toBe(true)
    expectSameMetadata(primDef!, 'single:relationship', singleApplyAPIDef!, 'single:relationship')

    // Multi-apply properties map back to the API schema's TEMPLATED specs.
    const multiTokenAttr = primDef!.getAttributeDefinition('multi:builtin:token_attr')
    expectSameMetadata(primDef!, 'multi:builtin:token_attr',
      multiApplyAPIDef!, 'multi:__INSTANCE_NAME__:token_attr')
    expect(multiTokenAttr.getFallbackValue()).toBe('foo')
    expect(multiTokenAttr.getTypeNameToken()).toBe('token')

    expect(primDef!.getRelationshipDefinition('multi:builtin:relationship').isValid()).toBe(true)
    expectSameMetadata(primDef!, 'multi:builtin:relationship',
      multiApplyAPIDef!, 'multi:__INSTANCE_NAME__:relationship')

    // The concrete type OVERRIDES multi:builtin:bool_attr from its built-in.
    const multiBoolAttr = primDef!.getAttributeDefinition('multi:builtin:bool_attr')
    const apiBoolAttr = multiApplyAPIDef!.getAttributeDefinition('multi:__INSTANCE_NAME__:bool_attr')
    expect(multiBoolAttr.getFallbackValue()).toBe(false)
    expect(apiBoolAttr.getFallbackValue()).toBe(true)
    expect(multiBoolAttr.getTypeNameToken()).toBe('bool')
    expect(apiBoolAttr.getTypeNameToken()).toBe('bool')

    // Dictionary-valued PRIM metadata composes recursively.
    expect(primDef!.listMetadataFields()).toContain('uiHints')
    const uiHints = primDef!.getMetadataField('uiHints') as Record<string, unknown>
    expect(uiHints['displayGroup']).toBe('TestWithBuiltinAppliedSchema group')
    expect(uiHints['customDict']).toEqual({
      TestCompose: 'TestWithBuiltinAppliedSchema',
      TestComposeMetadataAPI: 1,
      TestSingleApplyAPI: 3,
      TestWithBuiltinAppliedSchema: 2,
    })
  })

  it('test_UntypedPrimOnStage', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    const untypedPrim = stage.definePrim('/Untyped')
    expect(untypedPrim.typeName).toBe('')
    expect(untypedPrim.getAppliedSchemas()).toEqual([])
    expect(untypedPrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(untypedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(untypedPrim.getPropertyNames()).toEqual([])

    untypedPrim.applyAPI('TestSingleApplyAPI')
    untypedPrim.applyAPI('TestComposeMetadataAPI')

    // Still untyped, but now has applied schemas (in APPLY order — ApplyAPI
    // adds to the END of the prepend list).
    expect(untypedPrim.typeName).toBe('')
    expect(untypedPrim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestComposeMetadataAPI'])
    expect(untypedPrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(untypedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestComposeMetadataAPI'])
    expect(untypedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(untypedPrim.hasAPI('TestComposeMetadataAPI')).toBe(true)

    // Properties come from the applied schemas, in propertyOrder.
    expect(untypedPrim.getPropertyNames()).toEqual([
      'single:relationship', 'single:token_attr', 'single:bool_attr',
      'compose:relationship', 'compose:token_attr', 'compose:bool_attr',
      'single:no_fallback'])
    expectFallbackValues(untypedPrim, { 'single:token_attr': 'bar' })

    // Applied schemas cannot define fallback metadata values for prims —
    // no 'hidden' fallback here (contrast with the typed cases).
    expect(Object.keys(untypedPrim.getAllMetadata())).not.toContain('hidden')
    expect(untypedPrim.getMetadata('hidden')).toBeUndefined()
    expect(untypedPrim.hasAuthoredMetadata('hidden')).toBe(false)

    // Single-apply API schemas CAN define 'propertyOrder'.
    expect(Object.keys(untypedPrim.getAllMetadata())).toContain('propertyOrder')
    expect(untypedPrim.getMetadata('propertyOrder')).toBeDefined()
    // Defined in the API schema, not authored on the prim.
    expect(untypedPrim.hasAuthoredMetadata('propertyOrder')).toBe(false)

    // Dictionary-valued metadata composes recursively.
    expect(Object.keys(untypedPrim.getAllMetadata())).toContain('uiHints')
    expect(untypedPrim.hasAuthoredMetadata('uiHints')).toBe(false)
    const uiHints = untypedPrim.getMetadata('uiHints') as Record<string, unknown>
    expect(uiHints['displayGroup']).toBe('TestSingleApplyAPI group')
    expect(uiHints['customDict']).toEqual({
      TestCompose: 'TestSingleApplyAPI',
      TestComposeMetadataAPI: 1,
      TestSingleApplyAPI: 3,
    })

    // Untyped prims never get schema documentation.
    expect(untypedPrim.getMetadata('documentation')).toBeUndefined()
  })

  it('test_TypedPrimOnStage', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    const typedPrim = stage.definePrim('/TypedPrim', 'TestTypedSchema')
    expect(typedPrim.typeName).toBe('TestTypedSchema')
    expect(typedPrim.getAppliedSchemas()).toEqual([])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe('TestTypedSchema')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(typedPrim.getPropertyNames()).toEqual(['testRel', 'testAttr'])

    typedPrim.applyAPI('TestSingleApplyAPI')

    // propertyOrder from TestSingleApplyAPI lands in the resolved metadata,
    // but is not authored.
    expect(Object.keys(typedPrim.getAllMetadata())).toContain('propertyOrder')
    expect(typedPrim.getMetadata('propertyOrder')).toBeDefined()
    expect(typedPrim.hasAuthoredMetadata('propertyOrder')).toBe(false)

    typedPrim.applyAPI('TestMultiApplyAPI:garply')
    typedPrim.applyAPI('TestComposeMetadataAPI')

    expect(typedPrim.typeName).toBe('TestTypedSchema')
    expect(typedPrim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestMultiApplyAPI:garply', 'TestComposeMetadataAPI'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe('TestTypedSchema')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestMultiApplyAPI:garply', 'TestComposeMetadataAPI'])

    // HasAPI: exact single-apply name; multi-apply FAMILY match (any instance).
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestMultiApplyAPI')).toBe(true)
    expect(typedPrim.getPropertyNames()).toEqual([
      'testRel',
      'testAttr',
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:garply:bool_attr',
      'multi:garply:relationship',
      'multi:garply:token_attr',
      'single:no_fallback'])

    // Fallbacks: from TestSingleApplyAPI, TestMultiApplyAPI, TestTypedSchema.
    expectFallbackValues(typedPrim, {
      'single:token_attr': 'bar',
      'multi:garply:bool_attr': true,
      'testAttr': 'foo',
    })
    // No fallback at all for this one.
    expect(typedPrim.getPrimDefinition()
      .getAttributeDefinition('single:no_fallback').getFallbackValue()).toBeUndefined()

    // 'hidden' has a schema fallback (true) from TestTypedSchema — resolved
    // but not authored.
    expect(typedPrim.getAllMetadata()['hidden']).toBe(true)
    expect(typedPrim.getMetadata('hidden')).toBe(true)
    expect(typedPrim.hasAuthoredMetadata('hidden')).toBe(false)

    // Schema documentation is not available on prim instances.
    expect(typedPrim.getMetadata('documentation')).toBeUndefined()
  })

  it('test_TypedPrimsOnStageWithBuiltinAPISchemas', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    const typedPrim = stage.definePrim('/TypedPrim', 'TestWithBuiltinAppliedSchema')
    expect(typedPrim.typeName).toBe('TestWithBuiltinAppliedSchema')
    expect(typedPrim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestMultiApplyAPI:builtin', 'TestComposeMetadataAPI'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe('TestWithBuiltinAppliedSchema')
    // Built-ins are NOT part of the type identity.
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])

    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestMultiApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestComposeMetadataAPI')).toBe(true)
    expect(typedPrim.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    typedPrim.applyAPI('TestMultiApplyAPI:garply')

    // Authored API schemas always append AFTER the built-ins.
    expect(typedPrim.typeName).toBe('TestWithBuiltinAppliedSchema')
    expect(typedPrim.getAppliedSchemas()).toEqual([
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:builtin',
      'TestComposeMetadataAPI',
      'TestMultiApplyAPI:garply'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe('TestWithBuiltinAppliedSchema')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestMultiApplyAPI:garply'])

    const verifyExpectedPrimData = (prim: Prim): void => {
      expect(prim.hasAPI('TestSingleApplyAPI')).toBe(true)
      expect(prim.hasAPI('TestMultiApplyAPI')).toBe(true)

      expect(prim.getPropertyNames()).toEqual([
        'single:relationship',
        'single:token_attr',
        'single:bool_attr',
        'compose:relationship',
        'compose:token_attr',
        'compose:bool_attr',
        'multi:builtin:bool_attr',
        'multi:builtin:relationship',
        'multi:builtin:token_attr',
        'multi:garply:bool_attr',
        'multi:garply:relationship',
        'multi:garply:token_attr',
        'single:no_fallback',
        'testAttr',
        'testRel'])

      expectFallbackValues(prim, {
        // From TestSingleApplyAPI.
        'single:token_attr': 'bar',
        // From TestMultiApplyAPI.
        'multi:garply:bool_attr': true,
        // From TestWithBuiltinAppliedSchema — overrides its built-in API.
        'multi:builtin:bool_attr': false,
        // From TestWithBuiltinAppliedSchema.
        'testAttr': 'foo',
      })

      // 'hidden' fallback (false) from TestWithBuiltinAppliedSchema.
      expect(prim.getAllMetadata()['hidden']).toBe(false)
      expect(prim.getMetadata('hidden')).toBe(false)
      expect(prim.hasAuthoredMetadata('hidden')).toBe(false)

      expect(prim.getMetadata('documentation')).toBeUndefined()
    }
    verifyExpectedPrimData(typedPrim)

    // Explicitly re-apply the built-ins: they enter the type identity...
    typedPrim.applyAPI('TestMultiApplyAPI:builtin')
    typedPrim.applyAPI('TestSingleApplyAPI')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestMultiApplyAPI:garply',
      'TestMultiApplyAPI:builtin',
      'TestSingleApplyAPI'])
    // ...but the composed applied-schema list does not change.
    expect(typedPrim.getAppliedSchemas()).toEqual([
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:builtin',
      'TestComposeMetadataAPI',
      'TestMultiApplyAPI:garply'])
    verifyExpectedPrimData(typedPrim)
  })

  it('test_TypedPrimsOnStageWithAutoAppliedAPIs', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    // apiSchemas-metadata built-ins are stronger than auto-applied schemas.
    const typedPrim = stage.definePrim('/TypedPrim', 'TestTypedSchemaForAutoApply')
    expect(typedPrim.typeName).toBe('TestTypedSchemaForAutoApply')
    expect(typedPrim.getAppliedSchemas()).toEqual([
      'TestMultiApplyAPI:builtin',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:autoFoo',
      'TestComposeMetadataAPI'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe('TestTypedSchemaForAutoApply')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])

    expect(typedPrim.hasAPI('TestMultiApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestComposeMetadataAPI')).toBe(true)
    expect(typedPrim.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:autoFoo:bool_attr',
      'multi:autoFoo:relationship',
      'multi:autoFoo:token_attr',
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    // Auto-apply listed directly on a concrete type.
    typedPrim.setTypeName('TestTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.typeName).toBe('TestTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestComposeMetadataAPI'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe(
      'TestTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestComposeMetadataAPI')).toBe(true)
    expect(typedPrim.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    // Auto-apply inherited from a CONCRETE base type.
    typedPrim.setTypeName('TestDerivedTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.typeName).toBe('TestDerivedTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestComposeMetadataAPI'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe(
      'TestDerivedTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestComposeMetadataAPI')).toBe(true)
    expect(typedPrim.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    // Dictionary-valued metadata composes recursively.
    expect(Object.keys(typedPrim.getAllMetadata())).toContain('uiHints')
    expect(typedPrim.hasAuthoredMetadata('uiHints')).toBe(false)
    const uiHints = typedPrim.getMetadata('uiHints') as Record<string, unknown>
    expect(uiHints['displayGroup']).toBe('TestSingleApplyAPI group')
    expect(uiHints['customDict']).toEqual({
      TestCompose: 'TestSingleApplyAPI',
      TestComposeMetadataAPI: 1,
      TestSingleApplyAPI: 3,
    })

    // Auto-apply inherited from an ABSTRACT base type.
    typedPrim.setTypeName('TestDerivedTypedSchemaForAutoApplyAbstractBase')
    expect(typedPrim.typeName).toBe('TestDerivedTypedSchemaForAutoApplyAbstractBase')
    expect(typedPrim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestComposeMetadataAPI'])
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe(
      'TestDerivedTypedSchemaForAutoApplyAbstractBase')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(typedPrim.hasAPI('TestComposeMetadataAPI')).toBe(true)
    expect(typedPrim.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    // The registry exposes the auto-apply mapping (union of the API schema's
    // apiSchemaAutoApplyTo plugin data and the plugin-level
    // AutoApplyAPISchemas dict, in upstream's deterministic order).
    expect(UsdSchemaRegistry.getAutoApplyAPISchemas().get('TestSingleApplyAPI')).toEqual([
      'TestTypedSchemaForAutoApplyConcreteBase',
      'TestTypedSchemaForAutoApplyAbstractBase',
      'TestAutoAppliedToAPI',
      'TestTypedSchemaForAutoApply'])
  })

  it('test_ApplyRemoveAPI (full fidelity: validation, session layer, explicit/appended list ops)', async () => {
    registerTestSchemas()
    const stage = await openSessionStage()
    const rootLayer = stage.getRootLayer()
    const sessionLayer = stage.getSessionLayer()

    const prim = stage.definePrim('/Prim')
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])

    // Apply with the default edit target: adds to the END of the prepend list.
    prim.applyAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual(['TestSingleApplyAPI'])
    expect(prim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expectListOp(rootLayer, { prepended: ['TestSingleApplyAPI'] })

    prim.applyAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual(['TestSingleApplyAPI'])
    expectListOp(rootLayer, { prepended: ['TestSingleApplyAPI'] })

    prim.removeAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI'] })

    prim.removeAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI'] })

    prim.removeAPI('TestMultiApplyAPI:foo')
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, { deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'] })

    prim.applyAPI('TestMultiApplyAPI:foo')
    expect(prim.getAppliedSchemas()).toEqual(['TestMultiApplyAPI:foo'])
    expectListOp(rootLayer, {
      prepended: ['TestMultiApplyAPI:foo'],
      deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'],
    })

    // A second instance is added to the END of the prepends list (upstream
    // ApplyAPI ordering — NOT newest-first).
    prim.applyAPI('TestMultiApplyAPI:bar')
    expect(prim.getAppliedSchemas()).toEqual(
      ['TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'])
    expectListOp(rootLayer, {
      prepended: ['TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'],
      deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'],
    })

    // Remove "bar" on the SESSION layer: deleted there, root unchanged, gone
    // from the composed list.
    stage.setEditTarget(sessionLayer)
    prim.removeAPI('TestMultiApplyAPI:bar')
    stage.setEditTarget(rootLayer)
    expect(prim.getAppliedSchemas()).toEqual(['TestMultiApplyAPI:foo'])
    expectListOp(rootLayer, {
      prepended: ['TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'],
      deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'],
    })
    expectListOp(sessionLayer, { deleted: ['TestMultiApplyAPI:bar'] })

    // Re-apply "bar" on the session layer: prepended there (still deleted
    // there too) — "bar" now composes FIRST (session delete+prepend).
    stage.setEditTarget(sessionLayer)
    prim.applyAPI('TestMultiApplyAPI:bar')
    stage.setEditTarget(rootLayer)
    expect(prim.getAppliedSchemas()).toEqual(
      ['TestMultiApplyAPI:bar', 'TestMultiApplyAPI:foo'])
    expectListOp(rootLayer, {
      prepended: ['TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'],
      deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo'],
    })
    expectListOp(sessionLayer, {
      prepended: ['TestMultiApplyAPI:bar'],
      deleted: ['TestMultiApplyAPI:bar'],
    })

    // Appended (session) + explicit (root) list ops.
    sessionLayer.setField('/Prim', 'apiSchemas',
      { ...EMPTY_LIST_OP, appendedItems: ['TestMultiApplyAPI:bar'] })
    rootLayer.setField('/Prim', 'apiSchemas',
      { ...EMPTY_LIST_OP, isExplicit: true, explicitItems: ['TestMultiApplyAPI:foo'] })
    await stage.flushChanges()
    expect(prim.getAppliedSchemas()).toEqual(
      ['TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'])
    expectListOp(rootLayer, { explicit: ['TestMultiApplyAPI:foo'] })
    expectListOp(sessionLayer, { appended: ['TestMultiApplyAPI:bar'] })

    // Applying a schema already in each list is a no-op even though it's not
    // in the prepends.
    stage.setEditTarget(sessionLayer)
    prim.applyAPI('TestMultiApplyAPI:bar')
    stage.setEditTarget(rootLayer)
    prim.applyAPI('TestMultiApplyAPI:foo')
    expect(prim.getAppliedSchemas()).toEqual(
      ['TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'])
    expectListOp(rootLayer, { explicit: ['TestMultiApplyAPI:foo'] })
    expectListOp(sessionLayer, { appended: ['TestMultiApplyAPI:bar'] })

    // Apply the single-apply schema to both layers: root appends to its
    // EXPLICIT list, session adds to prepends; the stronger session prepend
    // wins the composed ordering (schema listed once).
    stage.setEditTarget(sessionLayer)
    prim.applyAPI('TestSingleApplyAPI')
    stage.setEditTarget(rootLayer)
    prim.applyAPI('TestSingleApplyAPI')
    expect(prim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestMultiApplyAPI:foo', 'TestMultiApplyAPI:bar'])
    expectListOp(rootLayer, { explicit: ['TestMultiApplyAPI:foo', 'TestSingleApplyAPI'] })
    expectListOp(sessionLayer, {
      prepended: ['TestSingleApplyAPI'],
      appended: ['TestMultiApplyAPI:bar'],
    })

    // Remove the starting schemas: root removes from its explicit list;
    // session removes from appends and adds to deletes.
    stage.setEditTarget(sessionLayer)
    prim.removeAPI('TestMultiApplyAPI:bar')
    stage.setEditTarget(rootLayer)
    prim.removeAPI('TestMultiApplyAPI:foo')
    expect(prim.getAppliedSchemas()).toEqual(['TestSingleApplyAPI'])
    expectListOp(rootLayer, { explicit: ['TestSingleApplyAPI'] })
    expectListOp(sessionLayer, {
      prepended: ['TestSingleApplyAPI'],
      deleted: ['TestMultiApplyAPI:bar'],
    })

    // Clear both list ops.
    sessionLayer.setField('/Prim', 'apiSchemas', { ...EMPTY_LIST_OP })
    rootLayer.setField('/Prim', 'apiSchemas', { ...EMPTY_LIST_OP })
    await stage.flushChanges()
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, {})
    expectListOp(sessionLayer, {})

    // Multi-apply without an instance name is a coding error.
    expect(() => prim.applyAPI('TestMultiApplyAPI')).toThrow()
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(() => prim.removeAPI('TestMultiApplyAPI')).toThrow()
    expect(prim.getAppliedSchemas()).toEqual([])

    // Single-apply WITH an instance name is a coding error.
    expect(() => prim.applyAPI('TestSingleApplyAPI:foo')).toThrow()
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(() => prim.removeAPI('TestSingleApplyAPI:foo')).toThrow()
    expect(prim.getAppliedSchemas()).toEqual([])

    // A non-applied API schema (core ModelAPI) is a coding error.
    expect(() => prim.applyAPI('ModelAPI')).toThrow()
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(() => prim.removeAPI('ModelAPI')).toThrow()
    expect(prim.getAppliedSchemas()).toEqual([])

    // AddAppliedSchema adds by name with NO validity checks (still no dupes),
    // but invalid names never appear in the composed GetAppliedSchemas.
    prim.addAppliedSchema('TestSingleApplyAPI')
    prim.addAppliedSchema('TestMultiApplyAPI:bar')
    prim.addAppliedSchema('BogusTypeName')
    prim.addAppliedSchema('TestMultiApplyAPI')
    prim.addAppliedSchema('TestSingleApplyAPI')   // duplicate
    expect(prim.getAppliedSchemas()).toEqual(
      ['TestSingleApplyAPI', 'TestMultiApplyAPI:bar'])
    expectListOp(rootLayer, {
      prepended: ['TestSingleApplyAPI', 'TestMultiApplyAPI:bar',
        'BogusTypeName', 'TestMultiApplyAPI'],
    })

    // RemoveAppliedSchema deletes by name with no validity checks (no dupes).
    stage.removeAppliedSchema('/Prim', 'TestSingleApplyAPI')
    stage.removeAppliedSchema('/Prim', 'TestMultiApplyAPI:bar')
    stage.removeAppliedSchema('/Prim', 'BogusTypeName')
    stage.removeAppliedSchema('/Prim', 'TestMultiApplyAPI')
    stage.removeAppliedSchema('/Prim', 'TestSingleApplyAPI')   // duplicate
    expect(prim.getAppliedSchemas()).toEqual([])
    expectListOp(rootLayer, {
      deleted: ['TestSingleApplyAPI', 'TestMultiApplyAPI:bar',
        'BogusTypeName', 'TestMultiApplyAPI'],
    })
  })

  it('test_CanApplyAPI', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    const prim = stage.definePrim('/Prim')
    const prim2 = stage.definePrim('/Prim2', 'TestTypedSchema')
    const prim3 = stage.definePrim('/Prim3', 'TestTypedSchemaForAutoApply')
    const prim4 = stage.definePrim('/Prim4', 'TestDerivedTypedSchemaForAutoApplyConcreteBase')
    const prim5 = stage.definePrim('/Prim5', 'TestDerivedTypedSchemaForAutoApplyAbstractBase')
    const allPrims = [prim, prim2, prim3, prim4, prim5]

    // Single-apply, no apiSchemaCanOnlyApplyTo: applies to everything.
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestSingleApplyAPI')).toEqual([])
    for (const p of allPrims) expect(p.canApplyAPI('TestSingleApplyAPI')).toBe(true)

    // Multi-apply, no restrictions and no allowedInstanceNames: any instance
    // name works, EXCEPT names matching the schema's own property names.
    for (const inst of ['foo', 'bar', 'baz', 'Bar', 'qux']) {
      expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiApplyAPI', inst)).toEqual([])
      expect(UsdSchemaRegistry.isAllowedAPISchemaInstanceName('TestMultiApplyAPI', inst)).toBe(true)
      for (const p of allPrims) expect(p.canApplyAPI(`TestMultiApplyAPI:${inst}`)).toBe(true)
    }
    for (const inst of ['bool_attr', 'relationship']) {
      expect(UsdSchemaRegistry.isAllowedAPISchemaInstanceName('TestMultiApplyAPI', inst)).toBe(false)
      for (const p of allPrims) expect(p.canApplyAPI(`TestMultiApplyAPI:${inst}`)).toBe(false)
    }

    // Single-apply WITH apiSchemaCanOnlyApplyTo: prim3 is in the list, prim4
    // derives from a listed type.
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestSingleCanApplyAPI')).toEqual(
      ['TestTypedSchemaForAutoApply', 'TestTypedSchemaForAutoApplyConcreteBase'])
    expect(prim.canApplyAPI('TestSingleCanApplyAPI')).toBe(false)
    expect(prim2.canApplyAPI('TestSingleCanApplyAPI')).toBe(false)
    expect(prim3.canApplyAPI('TestSingleCanApplyAPI')).toBe(true)
    expect(prim4.canApplyAPI('TestSingleCanApplyAPI')).toBe(true)
    expect(prim5.canApplyAPI('TestSingleCanApplyAPI')).toBe(false)

    // Multi-apply with apiSchemaAllowedInstanceNames foo/bar/baz: all other
    // instance names are disallowed.
    for (const inst of ['Bar', 'qux']) {
      expect(UsdSchemaRegistry.isAllowedAPISchemaInstanceName('TestMultiCanApplyAPI', inst)).toBe(false)
      for (const p of allPrims) expect(p.canApplyAPI(`TestMultiCanApplyAPI:${inst}`)).toBe(false)
    }

    // Instance "baz": schema-wide apiSchemaCanOnlyApplyTo list applies.
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI', 'baz')).toEqual(
      ['TestTypedSchemaForAutoApply', 'TestTypedSchemaForAutoApplyAbstractBase'])
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI', 'baz')).toEqual(
      UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI'))
    expect(UsdSchemaRegistry.isAllowedAPISchemaInstanceName('TestMultiCanApplyAPI', 'baz')).toBe(true)
    expect(prim.canApplyAPI('TestMultiCanApplyAPI:baz')).toBe(false)
    expect(prim2.canApplyAPI('TestMultiCanApplyAPI:baz')).toBe(false)
    expect(prim3.canApplyAPI('TestMultiCanApplyAPI:baz')).toBe(true)
    expect(prim4.canApplyAPI('TestMultiCanApplyAPI:baz')).toBe(false)
    expect(prim5.canApplyAPI('TestMultiCanApplyAPI:baz')).toBe(true)

    // Instance "foo": per-instance apiSchemaCanOnlyApplyTo list.
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI', 'foo')).toEqual(
      ['TestTypedSchemaForAutoApply', 'TestTypedSchemaForAutoApplyConcreteBase'])
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI', 'foo')).not.toEqual(
      UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI'))
    expect(UsdSchemaRegistry.isAllowedAPISchemaInstanceName('TestMultiCanApplyAPI', 'foo')).toBe(true)
    expect(prim.canApplyAPI('TestMultiCanApplyAPI:foo')).toBe(false)
    expect(prim2.canApplyAPI('TestMultiCanApplyAPI:foo')).toBe(false)
    expect(prim3.canApplyAPI('TestMultiCanApplyAPI:foo')).toBe(true)
    expect(prim4.canApplyAPI('TestMultiCanApplyAPI:foo')).toBe(true)
    expect(prim5.canApplyAPI('TestMultiCanApplyAPI:foo')).toBe(false)

    // Instance "bar": yet another per-instance list; prim4 and prim5 each
    // derive from a different listed type.
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI', 'bar')).toEqual(
      ['TestTypedSchemaForAutoApplyAbstractBase', 'TestTypedSchemaForAutoApplyConcreteBase'])
    expect(UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI', 'bar')).not.toEqual(
      UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames('TestMultiCanApplyAPI'))
    expect(UsdSchemaRegistry.isAllowedAPISchemaInstanceName('TestMultiCanApplyAPI', 'bar')).toBe(true)
    expect(prim.canApplyAPI('TestMultiCanApplyAPI:bar')).toBe(false)
    expect(prim2.canApplyAPI('TestMultiCanApplyAPI:bar')).toBe(false)
    expect(prim3.canApplyAPI('TestMultiCanApplyAPI:bar')).toBe(false)
    expect(prim4.canApplyAPI('TestMultiCanApplyAPI:bar')).toBe(true)
    expect(prim5.canApplyAPI('TestMultiCanApplyAPI:bar')).toBe(true)

    // Error conditions (coding errors upstream).
    // Single-apply schema with an instance name.
    expect(() => prim.canApplyAPI('TestSingleApplyAPI:foo')).toThrow()
    // Multi-apply schema without an instance name.
    expect(() => prim.canApplyAPI('TestMultiApplyAPI')).toThrow()
    // Multi-apply schema with an EMPTY instance name.
    expect(() => prim.canApplyAPI('TestMultiApplyAPI:')).toThrow()

    // whyNot annotations: EXCLUDED (see header) — the results themselves are
    // covered above (prim4 bar=true; prim qux/bar/bool_attr = false).
  })

  it('test_NestedSingleApplyAPISchemas', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()
    const stage = Stage.createNew()

    // Untyped prim + TestNestedInnerSingleApplyAPI.
    const innerSinglePrim = stage.definePrim('/InnerSingle')
    innerSinglePrim.applyAPI('TestNestedInnerSingleApplyAPI')

    expect(innerSinglePrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(innerSinglePrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedInnerSingleApplyAPI'])

    // Composed applied schemas include the built-ins of the applied API.
    let expectedAPISchemas = [
      'TestNestedInnerSingleApplyAPI',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:bar']
    expect(innerSinglePrim.getAppliedSchemas()).toEqual(expectedAPISchemas)
    expect(innerSinglePrim.hasAPI('TestNestedInnerSingleApplyAPI')).toBe(true)
    expect(innerSinglePrim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(innerSinglePrim.hasAPI('TestMultiApplyAPI')).toBe(true)
    expect(innerSinglePrim.hasAPI('TestMultiApplyAPI:bar')).toBe(true)

    let expectedPropNames = [
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'innerSingle:int_attr',
      'innerSingle:relationship',
      'innerSingle:token_attr',
      'multi:bar:bool_attr',
      'multi:bar:relationship',
      'multi:bar:token_attr',
      'single:no_fallback']
    expect(innerSinglePrim.getPropertyNames()).toEqual(expectedPropNames)

    // multi:bar:token_attr is overridden by TestNestedInnerSingleApplyAPI.
    let expectedAttrValues: Record<string, unknown> = {
      'multi:bar:token_attr': 'inner_override',
      'multi:bar:bool_attr': true,
      'innerSingle:token_attr': 'inner',
      'innerSingle:int_attr': 3,
      'single:token_attr': 'bar',
      'single:bool_attr': true,
    }
    expectFallbackValues(innerSinglePrim, expectedAttrValues)

    const innerSingleApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestNestedInnerSingleApplyAPI')
    expect(innerSingleApplyAPIDef).not.toBeNull()
    expect(innerSingleApplyAPIDef!.getAppliedAPISchemas()).toEqual(expectedAPISchemas)
    expect([...innerSingleApplyAPIDef!.getPropertyNames()].sort()).toEqual(
      [...expectedPropNames].sort())
    expect(innerSingleApplyAPIDef!.getDocumentation()).toBe(
      'Test nested single apply API schema: inner schema.')

    // Untyped prim + TestNestedOuterSingleApplyAPI: the nested inner API's
    // own built-ins are pulled in transitively.
    const outerSinglePrim = stage.definePrim('/OuterSingle')
    outerSinglePrim.applyAPI('TestNestedOuterSingleApplyAPI')
    expect(outerSinglePrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(outerSinglePrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedOuterSingleApplyAPI'])

    expect(outerSinglePrim.typeName).toBe('')
    expectedAPISchemas = [
      'TestNestedOuterSingleApplyAPI',
      'TestMultiApplyAPI:foo',
      'TestNestedInnerSingleApplyAPI',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:bar']
    expect(outerSinglePrim.getAppliedSchemas()).toEqual(expectedAPISchemas)

    expectedPropNames = [
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'innerSingle:int_attr',
      'innerSingle:relationship',
      'innerSingle:token_attr',
      'multi:bar:bool_attr',
      'multi:bar:relationship',
      'multi:bar:token_attr',
      'multi:foo:bool_attr',
      'multi:foo:relationship',
      'multi:foo:token_attr',
      'outerSingle:int_attr',
      'outerSingle:relationship',
      'outerSingle:token_attr',
      'single:no_fallback']
    expect(outerSinglePrim.getPropertyNames()).toEqual(expectedPropNames)

    // single:token_attr overridden by TestNestedOuterSingleApplyAPI.
    expectedAttrValues = {
      'innerSingle:token_attr': 'inner',
      'innerSingle:int_attr': 3,
      'multi:bar:token_attr': 'inner_override',
      'multi:bar:bool_attr': true,
      'multi:foo:token_attr': 'foo',
      'multi:foo:bool_attr': true,
      'outerSingle:token_attr': 'outer',
      'outerSingle:int_attr': 4,
      'single:token_attr': 'outer_override',
      'single:bool_attr': true,
    }
    expectFallbackValues(outerSinglePrim, expectedAttrValues)

    const outerSingleApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestNestedOuterSingleApplyAPI')
    expect(outerSingleApplyAPIDef).not.toBeNull()
    expect(outerSingleApplyAPIDef!.getAppliedAPISchemas()).toEqual(expectedAPISchemas)
    expect([...outerSingleApplyAPIDef!.getPropertyNames()].sort()).toEqual(
      [...expectedPropNames].sort())
    expect(outerSingleApplyAPIDef!.getDocumentation()).toBe(
      'Test nested single apply API schema: outer schema.')

    // Applying the inner API explicitly (already included via the outer) —
    // authored list grows, composed list is unchanged (no duplicates).
    outerSinglePrim.applyAPI('TestNestedInnerSingleApplyAPI')
    expect(outerSinglePrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(outerSinglePrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedOuterSingleApplyAPI', 'TestNestedInnerSingleApplyAPI'])
    expect(outerSinglePrim.typeName).toBe('')
    expect(outerSinglePrim.getAppliedSchemas()).toEqual([
      'TestNestedOuterSingleApplyAPI',
      'TestMultiApplyAPI:foo',
      'TestNestedInnerSingleApplyAPI',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:bar'])
    expect(outerSinglePrim.getPropertyNames()).toEqual(expectedPropNames)
    expectFallbackValues(outerSinglePrim, expectedAttrValues)

    // Swap the order (inner before outer): expansion order changes.
    outerSinglePrim.removeAPI('TestNestedOuterSingleApplyAPI')
    outerSinglePrim.applyAPI('TestNestedOuterSingleApplyAPI')
    expect(outerSinglePrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedInnerSingleApplyAPI', 'TestNestedOuterSingleApplyAPI'])
    expect(outerSinglePrim.getAppliedSchemas()).toEqual([
      'TestNestedInnerSingleApplyAPI',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:bar',
      'TestNestedOuterSingleApplyAPI',
      'TestMultiApplyAPI:foo'])
    // Properties unchanged, but single:token_attr now resolves from
    // TestSingleApplyAPI (the outer's override is no longer stronger).
    expect(outerSinglePrim.getPropertyNames()).toEqual(expectedPropNames)
    expectedAttrValues['single:token_attr'] = 'bar'
    expectFallbackValues(outerSinglePrim, expectedAttrValues)
  })

  it('test_NestedMultiApplyAPISchemas', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()
    const stage = Stage.createNew()

    // TestNestedInnerMultiApplyDerivedAPI:foo pulls in the base API with the
    // SAME instance name.
    const innerMultiPrim = stage.definePrim('/InnerMulti')
    innerMultiPrim.applyAPI('TestNestedInnerMultiApplyDerivedAPI:foo')
    expect(innerMultiPrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(innerMultiPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedInnerMultiApplyDerivedAPI:foo'])
    expect(innerMultiPrim.getAppliedSchemas()).toEqual([
      'TestNestedInnerMultiApplyDerivedAPI:foo',
      'TestNestedInnerMultiApplyBaseAPI:foo'])
    expect(innerMultiPrim.hasAPI('TestNestedInnerMultiApplyDerivedAPI')).toBe(true)
    expect(innerMultiPrim.hasAPI('TestNestedInnerMultiApplyBaseAPI')).toBe(true)
    expect(innerMultiPrim.hasAPI('TestNestedInnerMultiApplyDerivedAPI:foo')).toBe(true)
    expect(innerMultiPrim.hasAPI('TestNestedInnerMultiApplyBaseAPI:foo')).toBe(true)

    expect(innerMultiPrim.getPropertyNames()).toEqual([
      'innerMulti:foo:derived:int_attr',
      'innerMulti:foo:int_attr',
      'innerMulti:foo:relationship',
      'innerMulti:foo:token_attr'])

    // token_attr overridden by the derived API.
    expectFallbackValues(innerMultiPrim, {
      'innerMulti:foo:derived:int_attr': 4,
      'innerMulti:foo:int_attr': 3,
      'innerMulti:foo:token_attr': 'inner_derived',
    })

    // Second instance "bar" — same expansion per instance.
    innerMultiPrim.applyAPI('TestNestedInnerMultiApplyDerivedAPI:bar')
    expect(innerMultiPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([
      'TestNestedInnerMultiApplyDerivedAPI:foo',
      'TestNestedInnerMultiApplyDerivedAPI:bar'])
    expect(innerMultiPrim.getAppliedSchemas()).toEqual([
      'TestNestedInnerMultiApplyDerivedAPI:foo',
      'TestNestedInnerMultiApplyBaseAPI:foo',
      'TestNestedInnerMultiApplyDerivedAPI:bar',
      'TestNestedInnerMultiApplyBaseAPI:bar'])
    expect(innerMultiPrim.getPropertyNames()).toEqual([
      'innerMulti:bar:derived:int_attr',
      'innerMulti:bar:int_attr',
      'innerMulti:bar:relationship',
      'innerMulti:bar:token_attr',
      'innerMulti:foo:derived:int_attr',
      'innerMulti:foo:int_attr',
      'innerMulti:foo:relationship',
      'innerMulti:foo:token_attr'])
    expectFallbackValues(innerMultiPrim, {
      'innerMulti:foo:derived:int_attr': 4,
      'innerMulti:foo:int_attr': 3,
      'innerMulti:foo:token_attr': 'inner_derived',
      'innerMulti:bar:derived:int_attr': 4,
      'innerMulti:bar:int_attr': 3,
      'innerMulti:bar:token_attr': 'inner_derived',
    })

    // The API's own prim definition: template names.
    const innerMultiApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestNestedInnerMultiApplyDerivedAPI')
    expect(innerMultiApplyAPIDef).not.toBeNull()
    expect(innerMultiApplyAPIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedInnerMultiApplyDerivedAPI:__INSTANCE_NAME__',
      'TestNestedInnerMultiApplyBaseAPI:__INSTANCE_NAME__'])
    expect([...innerMultiApplyAPIDef!.getPropertyNames()].sort()).toEqual([
      'innerMulti:__INSTANCE_NAME__:derived:int_attr',
      'innerMulti:__INSTANCE_NAME__:int_attr',
      'innerMulti:__INSTANCE_NAME__:relationship',
      'innerMulti:__INSTANCE_NAME__:token_attr'])
    expect(innerMultiApplyAPIDef!.getDocumentation()).toBe(
      'Test nested multi apply API schema: inner schema derived.')

    // TestNestedOuterMultiApplyAPI:foo — encapsulated sub-instances.
    const outerMultiPrim = stage.definePrim('/OuterMulti')
    outerMultiPrim.applyAPI('TestNestedOuterMultiApplyAPI:foo')
    expect(outerMultiPrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(outerMultiPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedOuterMultiApplyAPI:foo'])
    expect(outerMultiPrim.typeName).toBe('')
    expect(outerMultiPrim.getAppliedSchemas()).toEqual([
      'TestNestedOuterMultiApplyAPI:foo',
      'TestNestedInnerMultiApplyDerivedAPI:foo:builtin',
      'TestNestedInnerMultiApplyBaseAPI:foo:builtin',
      'TestNestedInnerMultiApplyDerivedAPI:foo:outerMulti',
      'TestNestedInnerMultiApplyBaseAPI:foo:outerMulti',
      'TestNestedInnerMultiApplyBaseAPI:foo'])

    const outerExpectedPropNames = [
      'outerMulti:foo:int_attr',
      'outerMulti:foo:relationship',
      'outerMulti:foo:token_attr',
      'innerMulti:foo:builtin:derived:int_attr',
      'innerMulti:foo:builtin:int_attr',
      'innerMulti:foo:builtin:relationship',
      'innerMulti:foo:builtin:token_attr',
      'innerMulti:foo:outerMulti:derived:int_attr',
      'innerMulti:foo:outerMulti:int_attr',
      'innerMulti:foo:outerMulti:relationship',
      'innerMulti:foo:outerMulti:token_attr',
      'innerMulti:foo:int_attr',
      'innerMulti:foo:relationship',
      'innerMulti:foo:token_attr',
    ].sort()
    expect(outerMultiPrim.getPropertyNames()).toEqual(outerExpectedPropNames)

    expectFallbackValues(outerMultiPrim, {
      'outerMulti:foo:int_attr': 5,
      'outerMulti:foo:token_attr': 'outer',
      'innerMulti:foo:builtin:derived:int_attr': 4,
      'innerMulti:foo:builtin:token_attr': 'inner_derived',
      'innerMulti:foo:builtin:int_attr': 3,
      'innerMulti:foo:outerMulti:derived:int_attr': 4,
      'innerMulti:foo:outerMulti:token_attr': 'inner_derived',
      'innerMulti:foo:outerMulti:int_attr': 3,
      'innerMulti:foo:int_attr': 3,
      'innerMulti:foo:token_attr': 'inner_base',
    })

    const outerMultiApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestNestedOuterMultiApplyAPI')
    expect(outerMultiApplyAPIDef).not.toBeNull()
    // __INSTANCE_NAME__ always sits directly after the schema name, even for
    // encapsulated sub-instances.
    expect(outerMultiApplyAPIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedOuterMultiApplyAPI:__INSTANCE_NAME__',
      'TestNestedInnerMultiApplyDerivedAPI:__INSTANCE_NAME__:builtin',
      'TestNestedInnerMultiApplyBaseAPI:__INSTANCE_NAME__:builtin',
      'TestNestedInnerMultiApplyDerivedAPI:__INSTANCE_NAME__:outerMulti',
      'TestNestedInnerMultiApplyBaseAPI:__INSTANCE_NAME__:outerMulti',
      'TestNestedInnerMultiApplyBaseAPI:__INSTANCE_NAME__'])
    expect([...outerMultiApplyAPIDef!.getPropertyNames()].sort()).toEqual([
      'outerMulti:__INSTANCE_NAME__:int_attr',
      'outerMulti:__INSTANCE_NAME__:relationship',
      'outerMulti:__INSTANCE_NAME__:token_attr',
      'innerMulti:__INSTANCE_NAME__:builtin:derived:int_attr',
      'innerMulti:__INSTANCE_NAME__:builtin:int_attr',
      'innerMulti:__INSTANCE_NAME__:builtin:relationship',
      'innerMulti:__INSTANCE_NAME__:builtin:token_attr',
      'innerMulti:__INSTANCE_NAME__:outerMulti:derived:int_attr',
      'innerMulti:__INSTANCE_NAME__:outerMulti:int_attr',
      'innerMulti:__INSTANCE_NAME__:outerMulti:relationship',
      'innerMulti:__INSTANCE_NAME__:outerMulti:token_attr',
      'innerMulti:__INSTANCE_NAME__:int_attr',
      'innerMulti:__INSTANCE_NAME__:relationship',
      'innerMulti:__INSTANCE_NAME__:token_attr',
    ].sort())
    expect(outerMultiApplyAPIDef!.getDocumentation()).toBe(
      'Test nested multi apply API schema: outer schema.')

    // Multi-apply instances nested inside a SINGLE apply API.
    const singleApplyPrim = stage.definePrim('/SingleApply')
    singleApplyPrim.applyAPI('TestNestedMultiApplyInSingleApplyAPI')
    expect(singleApplyPrim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(singleApplyPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedMultiApplyInSingleApplyAPI'])
    expect(singleApplyPrim.typeName).toBe('')
    const singleApplyExpectedAPISchemas = [
      'TestNestedMultiApplyInSingleApplyAPI',
      'TestNestedOuterMultiApplyAPI:foo',
      'TestNestedInnerMultiApplyDerivedAPI:foo:builtin',
      'TestNestedInnerMultiApplyBaseAPI:foo:builtin',
      'TestNestedInnerMultiApplyDerivedAPI:foo:outerMulti',
      'TestNestedInnerMultiApplyBaseAPI:foo:outerMulti',
      'TestNestedInnerMultiApplyBaseAPI:foo',
      'TestNestedInnerMultiApplyDerivedAPI:bar',
      'TestNestedInnerMultiApplyBaseAPI:bar']
    expect(singleApplyPrim.getAppliedSchemas()).toEqual(singleApplyExpectedAPISchemas)

    const singleApplyExpectedPropNames = [
      'int_attr',
      'outerMulti:foo:int_attr',
      'outerMulti:foo:relationship',
      'outerMulti:foo:token_attr',
      'innerMulti:foo:builtin:derived:int_attr',
      'innerMulti:foo:builtin:int_attr',
      'innerMulti:foo:builtin:relationship',
      'innerMulti:foo:builtin:token_attr',
      'innerMulti:foo:outerMulti:derived:int_attr',
      'innerMulti:foo:outerMulti:int_attr',
      'innerMulti:foo:outerMulti:relationship',
      'innerMulti:foo:outerMulti:token_attr',
      'innerMulti:foo:int_attr',
      'innerMulti:foo:relationship',
      'innerMulti:foo:token_attr',
      'innerMulti:bar:derived:int_attr',
      'innerMulti:bar:int_attr',
      'innerMulti:bar:relationship',
      'innerMulti:bar:token_attr',
    ].sort()
    expect(singleApplyPrim.getPropertyNames()).toEqual(singleApplyExpectedPropNames)

    expectFallbackValues(singleApplyPrim, {
      'int_attr': 10,
      // Overridden in TestNestedMultiApplyInSingleApplyAPI:
      'innerMulti:foo:builtin:derived:int_attr': 20,
      'innerMulti:bar:int_attr': 30,
      'outerMulti:foo:int_attr': 5,
      'outerMulti:foo:token_attr': 'outer',
      'innerMulti:foo:builtin:token_attr': 'inner_derived',
      'innerMulti:foo:builtin:int_attr': 3,
      'innerMulti:foo:outerMulti:derived:int_attr': 4,
      'innerMulti:foo:outerMulti:token_attr': 'inner_derived',
      'innerMulti:foo:outerMulti:int_attr': 3,
      'innerMulti:foo:int_attr': 3,
      'innerMulti:foo:token_attr': 'inner_base',
      'innerMulti:bar:derived:int_attr': 4,
      'innerMulti:bar:token_attr': 'inner_derived',
    })

    const singleApplyAPIDef = reg.findAppliedAPIPrimDefinition('TestNestedMultiApplyInSingleApplyAPI')
    expect(singleApplyAPIDef).not.toBeNull()
    expect(singleApplyAPIDef!.getAppliedAPISchemas()).toEqual(singleApplyExpectedAPISchemas)
    expect([...singleApplyAPIDef!.getPropertyNames()].sort()).toEqual(singleApplyExpectedPropNames)
    expect(singleApplyAPIDef!.getDocumentation()).toBe(
      'Test single apply API with builtin nested multi apply API schema instances.')
  })

  it('test_NestedCycleAPISchema', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()
    const stage = Stage.createNew()

    const nestedCyclePrim1 = stage.definePrim('/Cycle1')
    const nestedCyclePrim2 = stage.definePrim('/Cycle2')
    const nestedCyclePrim3 = stage.definePrim('/Cycle3')
    nestedCyclePrim1.applyAPI('TestNestedCycle1API')
    nestedCyclePrim2.applyAPI('TestNestedCycle2API')
    nestedCyclePrim3.applyAPI('TestNestedCycle3API')

    expect(nestedCyclePrim1.getPrimTypeInfo().getTypeName()).toBe('')
    expect(nestedCyclePrim1.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestNestedCycle1API'])
    expect(nestedCyclePrim2.getPrimTypeInfo().getTypeName()).toBe('')
    expect(nestedCyclePrim2.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestNestedCycle2API'])
    expect(nestedCyclePrim3.getPrimTypeInfo().getTypeName()).toBe('')
    expect(nestedCyclePrim3.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestNestedCycle3API'])

    // Cycles are broken by never including the same API schema twice —
    // each prim gets all three, rotated by which was authored.
    expect(nestedCyclePrim1.typeName).toBe('')
    expect(nestedCyclePrim1.getAppliedSchemas()).toEqual([
      'TestNestedCycle1API', 'TestNestedCycle2API', 'TestNestedCycle3API'])
    expect(nestedCyclePrim2.typeName).toBe('')
    expect(nestedCyclePrim2.getAppliedSchemas()).toEqual([
      'TestNestedCycle2API', 'TestNestedCycle3API', 'TestNestedCycle1API'])
    expect(nestedCyclePrim3.typeName).toBe('')
    expect(nestedCyclePrim3.getAppliedSchemas()).toEqual([
      'TestNestedCycle3API', 'TestNestedCycle1API', 'TestNestedCycle2API'])

    for (const p of [nestedCyclePrim1, nestedCyclePrim2, nestedCyclePrim3]) {
      expect(p.hasAPI('TestNestedCycle1API')).toBe(true)
      expect(p.hasAPI('TestNestedCycle2API')).toBe(true)
      expect(p.hasAPI('TestNestedCycle3API')).toBe(true)
    }

    const expectedPropNames = [
      'cycle1:token_attr',
      'cycle2:token_attr',
      'cycle3:token_attr',
      'cycle:int_attr']
    expect(nestedCyclePrim1.getPropertyNames()).toEqual(expectedPropNames)
    expect(nestedCyclePrim2.getPropertyNames()).toEqual(expectedPropNames)
    expect(nestedCyclePrim3.getPropertyNames()).toEqual(expectedPropNames)

    // cycle:int_attr is defined in all three with different defaults —
    // the strongest applied API wins.
    expectFallbackValues(nestedCyclePrim1, {
      'cycle1:token_attr': 'cycle1',
      'cycle2:token_attr': 'cycle2',
      'cycle3:token_attr': 'cycle3',
      'cycle:int_attr': 1,
    })
    expectFallbackValues(nestedCyclePrim2, {
      'cycle1:token_attr': 'cycle1',
      'cycle2:token_attr': 'cycle2',
      'cycle3:token_attr': 'cycle3',
      'cycle:int_attr': 2,
    })
    expectFallbackValues(nestedCyclePrim3, {
      'cycle1:token_attr': 'cycle1',
      'cycle2:token_attr': 'cycle2',
      'cycle3:token_attr': 'cycle3',
      'cycle:int_attr': 3,
    })

    const cycle1APIDef = reg.findAppliedAPIPrimDefinition('TestNestedCycle1API')
    expect(cycle1APIDef).not.toBeNull()
    expect(cycle1APIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedCycle1API', 'TestNestedCycle2API', 'TestNestedCycle3API'])
    expect([...cycle1APIDef!.getPropertyNames()].sort()).toEqual(expectedPropNames)
    expect(cycle1APIDef!.getDocumentation()).toBe(
      'Test nested single apply API schema with a cycle #1.')

    const cycle2APIDef = reg.findAppliedAPIPrimDefinition('TestNestedCycle2API')
    expect(cycle2APIDef).not.toBeNull()
    expect(cycle2APIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedCycle2API', 'TestNestedCycle3API', 'TestNestedCycle1API'])
    expect([...cycle2APIDef!.getPropertyNames()].sort()).toEqual(expectedPropNames)
    expect(cycle2APIDef!.getDocumentation()).toBe(
      'Test nested single apply API schema with a cycle #2.')

    const cycle3APIDef = reg.findAppliedAPIPrimDefinition('TestNestedCycle3API')
    expect(cycle3APIDef).not.toBeNull()
    expect(cycle3APIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedCycle3API', 'TestNestedCycle1API', 'TestNestedCycle2API'])
    expect([...cycle3APIDef!.getPropertyNames()].sort()).toEqual(expectedPropNames)
    expect(cycle3APIDef!.getDocumentation()).toBe(
      'Test nested single apply API schema with a cycle #3.')
  })

  it('test_NestedMultiApplyCycleAPISchema', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()
    const stage = Stage.createNew()

    const nestedCyclePrim1 = stage.definePrim('/Cycle1')
    const nestedCyclePrim2 = stage.definePrim('/Cycle2')
    const nestedCyclePrim3 = stage.definePrim('/Cycle3')
    nestedCyclePrim1.applyAPI('TestNestedMultiApplyCycle1API:foo')
    nestedCyclePrim2.applyAPI('TestNestedMultiApplyCycle2API:foo')
    nestedCyclePrim3.applyAPI('TestNestedMultiApplyCycle3API:foo')

    expect(nestedCyclePrim1.getPrimTypeInfo().getTypeName()).toBe('')
    expect(nestedCyclePrim1.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedMultiApplyCycle1API:foo'])
    expect(nestedCyclePrim2.getPrimTypeInfo().getTypeName()).toBe('')
    expect(nestedCyclePrim2.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedMultiApplyCycle2API:foo'])
    expect(nestedCyclePrim3.getPrimTypeInfo().getTypeName()).toBe('')
    expect(nestedCyclePrim3.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(
      ['TestNestedMultiApplyCycle3API:foo'])

    // Sub-instance cycles are broken by refusing a built-in whose schema type
    // matches a direct ancestor in the depth-first expansion.
    expect(nestedCyclePrim1.typeName).toBe('')
    expect(nestedCyclePrim1.getAppliedSchemas()).toEqual([
      'TestNestedMultiApplyCycle1API:foo',
      'TestNestedMultiApplyCycle2API:foo:cycle1',
      'TestNestedMultiApplyCycle3API:foo:cycle1:cycle2',
      'TestNestedMultiApplyCycle3API:foo',
      'TestNestedMultiApplyCycle2API:foo'])
    expect(nestedCyclePrim2.typeName).toBe('')
    expect(nestedCyclePrim2.getAppliedSchemas()).toEqual([
      'TestNestedMultiApplyCycle2API:foo',
      'TestNestedMultiApplyCycle3API:foo:cycle2',
      'TestNestedMultiApplyCycle1API:foo:cycle2:cycle3',
      'TestNestedMultiApplyCycle1API:foo',
      'TestNestedMultiApplyCycle3API:foo'])
    expect(nestedCyclePrim3.typeName).toBe('')
    expect(nestedCyclePrim3.getAppliedSchemas()).toEqual([
      'TestNestedMultiApplyCycle3API:foo',
      'TestNestedMultiApplyCycle1API:foo:cycle3',
      'TestNestedMultiApplyCycle2API:foo:cycle3:cycle1',
      'TestNestedMultiApplyCycle2API:foo',
      'TestNestedMultiApplyCycle1API:foo'])

    expect(nestedCyclePrim1.getPropertyNames()).toEqual([
      'cycle1:foo:token_attr',
      'cycle2:foo:cycle1:token_attr',
      'cycle2:foo:token_attr',
      'cycle3:foo:cycle1:cycle2:token_attr',
      'cycle3:foo:token_attr'])
    expect(nestedCyclePrim2.getPropertyNames()).toEqual([
      'cycle1:foo:cycle2:cycle3:token_attr',
      'cycle1:foo:token_attr',
      'cycle2:foo:token_attr',
      'cycle3:foo:cycle2:token_attr',
      'cycle3:foo:token_attr'])
    expect(nestedCyclePrim3.getPropertyNames()).toEqual([
      'cycle1:foo:cycle3:token_attr',
      'cycle1:foo:token_attr',
      'cycle2:foo:cycle3:cycle1:token_attr',
      'cycle2:foo:token_attr',
      'cycle3:foo:token_attr'])

    const cycle1APIDef = reg.findAppliedAPIPrimDefinition('TestNestedMultiApplyCycle1API')
    expect(cycle1APIDef).not.toBeNull()
    expect(cycle1APIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedMultiApplyCycle1API:__INSTANCE_NAME__',
      'TestNestedMultiApplyCycle2API:__INSTANCE_NAME__:cycle1',
      'TestNestedMultiApplyCycle3API:__INSTANCE_NAME__:cycle1:cycle2',
      'TestNestedMultiApplyCycle3API:__INSTANCE_NAME__',
      'TestNestedMultiApplyCycle2API:__INSTANCE_NAME__'])
    expect([...cycle1APIDef!.getPropertyNames()].sort()).toEqual([
      'cycle1:__INSTANCE_NAME__:token_attr',
      'cycle2:__INSTANCE_NAME__:cycle1:token_attr',
      'cycle2:__INSTANCE_NAME__:token_attr',
      'cycle3:__INSTANCE_NAME__:cycle1:cycle2:token_attr',
      'cycle3:__INSTANCE_NAME__:token_attr'])

    const cycle2APIDef = reg.findAppliedAPIPrimDefinition('TestNestedMultiApplyCycle2API')
    expect(cycle2APIDef).not.toBeNull()
    expect(cycle2APIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedMultiApplyCycle2API:__INSTANCE_NAME__',
      'TestNestedMultiApplyCycle3API:__INSTANCE_NAME__:cycle2',
      'TestNestedMultiApplyCycle1API:__INSTANCE_NAME__:cycle2:cycle3',
      'TestNestedMultiApplyCycle1API:__INSTANCE_NAME__',
      'TestNestedMultiApplyCycle3API:__INSTANCE_NAME__'])
    expect([...cycle2APIDef!.getPropertyNames()].sort()).toEqual([
      'cycle1:__INSTANCE_NAME__:cycle2:cycle3:token_attr',
      'cycle1:__INSTANCE_NAME__:token_attr',
      'cycle2:__INSTANCE_NAME__:token_attr',
      'cycle3:__INSTANCE_NAME__:cycle2:token_attr',
      'cycle3:__INSTANCE_NAME__:token_attr'])

    const cycle3APIDef = reg.findAppliedAPIPrimDefinition('TestNestedMultiApplyCycle3API')
    expect(cycle3APIDef).not.toBeNull()
    expect(cycle3APIDef!.getAppliedAPISchemas()).toEqual([
      'TestNestedMultiApplyCycle3API:__INSTANCE_NAME__',
      'TestNestedMultiApplyCycle1API:__INSTANCE_NAME__:cycle3',
      'TestNestedMultiApplyCycle2API:__INSTANCE_NAME__:cycle3:cycle1',
      'TestNestedMultiApplyCycle2API:__INSTANCE_NAME__',
      'TestNestedMultiApplyCycle1API:__INSTANCE_NAME__'])
    expect([...cycle3APIDef!.getPropertyNames()].sort()).toEqual([
      'cycle1:__INSTANCE_NAME__:cycle3:token_attr',
      'cycle1:__INSTANCE_NAME__:token_attr',
      'cycle2:__INSTANCE_NAME__:cycle3:cycle1:token_attr',
      'cycle2:__INSTANCE_NAME__:token_attr',
      'cycle3:__INSTANCE_NAME__:token_attr'])
  })

  it('test_ConcreteTypeWithBuiltinNestedAPISchemas', () => {
    registerTestSchemas()
    const reg = UsdSchemaRegistry.getInstance()
    const stage = Stage.createNew()

    const typedPrim = stage.definePrim('/TypedPrim', 'TestWithBuiltinNestedAppliedSchema')
    expect(typedPrim.getPrimTypeInfo().getTypeName()).toBe('TestWithBuiltinNestedAppliedSchema')
    expect(typedPrim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])

    const expectedAPISchemas = [
      // Expanded from built-in TestNestedOuterSingleApplyAPI.
      'TestNestedOuterSingleApplyAPI',
      'TestMultiApplyAPI:foo',
      'TestNestedInnerSingleApplyAPI',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:bar',
      // Expanded from built-in TestNestedCycle1API.
      'TestNestedCycle1API',
      'TestNestedCycle2API',
      'TestNestedCycle3API']
    expect(typedPrim.getAppliedSchemas()).toEqual(expectedAPISchemas)

    const expectedPropNames = [
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'cycle1:token_attr',
      'cycle2:token_attr',
      'cycle3:token_attr',
      'cycle:int_attr',
      'innerSingle:int_attr',
      'innerSingle:relationship',
      'innerSingle:token_attr',
      'multi:bar:bool_attr',
      'multi:bar:relationship',
      'multi:bar:token_attr',
      'multi:foo:bool_attr',
      'multi:foo:relationship',
      'multi:foo:token_attr',
      'outerSingle:int_attr',
      'outerSingle:relationship',
      'outerSingle:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel']
    expect(typedPrim.getPropertyNames()).toEqual(expectedPropNames)

    const typedPrimDef = reg.findConcretePrimDefinition('TestWithBuiltinNestedAppliedSchema')
    expect(typedPrimDef).not.toBeNull()
    expect(typedPrimDef!.getAppliedAPISchemas()).toEqual(expectedAPISchemas)
    expect([...typedPrimDef!.getPropertyNames()].sort()).toEqual([...expectedPropNames].sort())
    expect(typedPrimDef!.getDocumentation()).toBe('Test with built-in nested API schemas.')
  })

  it('test_APISchemasAutoAppliedToAPISchemas', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    // TestAutoAppliedToAPI pulls in built-ins AND schemas auto-applied to it.
    const prim = stage.definePrim('/Prim')
    prim.applyAPI('TestAutoAppliedToAPI')
    expect(prim.typeName).toBe('')
    expect(prim.getAppliedSchemas()).toEqual([
      'TestAutoAppliedToAPI',
      'TestMultiApplyAPI:builtin',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:autoFoo',
      'TestComposeMetadataAPI'])
    expect(prim.hasAPI('TestAutoAppliedToAPI')).toBe(true)
    expect(prim.hasAPI('TestMultiApplyAPI:builtin')).toBe(true)
    expect(prim.hasAPI('TestMultiApplyAPI:autoFoo')).toBe(true)
    expect(prim.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(prim.hasAPI('TestComposeMetadataAPI')).toBe(true)

    expect(prim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestAutoAppliedToAPI'])

    expect(prim.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:autoFoo:bool_attr',
      'multi:autoFoo:relationship',
      'multi:autoFoo:token_attr',
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    // TestNestedAutoAppliedToAPI: auto-applied APIs bring their own
    // built-ins and auto-applies transitively.
    const prim2 = stage.definePrim('/Prim2')
    prim2.applyAPI('TestNestedAutoAppliedToAPI')
    expect(prim2.typeName).toBe('')
    expect(prim2.getAppliedSchemas()).toEqual([
      'TestNestedAutoAppliedToAPI',
      'TestMultiApplyAPI:foo',
      'TestAutoAppliedToAPI',
      'TestMultiApplyAPI:builtin',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:autoFoo',
      'TestComposeMetadataAPI'])
    expect(prim2.hasAPI('TestNestedAutoAppliedToAPI')).toBe(true)
    expect(prim2.hasAPI('TestAutoAppliedToAPI')).toBe(true)
    expect(prim2.hasAPI('TestMultiApplyAPI:foo')).toBe(true)
    expect(prim2.hasAPI('TestMultiApplyAPI:builtin')).toBe(true)
    expect(prim2.hasAPI('TestMultiApplyAPI:autoFoo')).toBe(true)
    expect(prim2.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(prim2.hasAPI('TestComposeMetadataAPI')).toBe(true)

    expect(prim2.getPrimTypeInfo().getTypeName()).toBe('')
    expect(prim2.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestNestedAutoAppliedToAPI'])

    expect(prim2.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:autoFoo:bool_attr',
      'multi:autoFoo:relationship',
      'multi:autoFoo:token_attr',
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'multi:foo:bool_attr',
      'multi:foo:relationship',
      'multi:foo:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])

    // TestNestedAutoAppliedToAPI auto-applies to this PRIM TYPE.
    const prim3 = stage.definePrim('/Prim3', 'TestNestedAutoAppliedToAPIAppliedToPrim')
    expect(prim3.typeName).toBe('TestNestedAutoAppliedToAPIAppliedToPrim')
    expect(prim3.getAppliedSchemas()).toEqual([
      'TestNestedAutoAppliedToAPI',
      'TestMultiApplyAPI:foo',
      'TestAutoAppliedToAPI',
      'TestMultiApplyAPI:builtin',
      'TestSingleApplyAPI',
      'TestMultiApplyAPI:autoFoo',
      'TestComposeMetadataAPI'])

    expect(prim3.getPrimTypeInfo().getTypeName()).toBe('TestNestedAutoAppliedToAPIAppliedToPrim')
    expect(prim3.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])

    expect(prim3.hasAPI('TestNestedAutoAppliedToAPI')).toBe(true)
    expect(prim3.hasAPI('TestAutoAppliedToAPI')).toBe(true)
    expect(prim3.hasAPI('TestMultiApplyAPI:foo')).toBe(true)
    expect(prim3.hasAPI('TestMultiApplyAPI:builtin')).toBe(true)
    expect(prim3.hasAPI('TestMultiApplyAPI:autoFoo')).toBe(true)
    expect(prim3.hasAPI('TestSingleApplyAPI')).toBe(true)
    expect(prim3.getPropertyNames()).toEqual([
      'single:relationship',
      'single:token_attr',
      'single:bool_attr',
      'compose:relationship',
      'compose:token_attr',
      'compose:bool_attr',
      'multi:autoFoo:bool_attr',
      'multi:autoFoo:relationship',
      'multi:autoFoo:token_attr',
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'multi:foo:bool_attr',
      'multi:foo:relationship',
      'multi:foo:token_attr',
      'single:no_fallback',
      'testAttr',
      'testRel'])
  })

  it('test_PropertyComposition', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    const oneAPIName = 'TestPropCompOneAPI'
    const twoAPIName = 'TestPropCompTwoAPI'
    const nestedAPIName = 'TestPropCompNestedAPI'
    const compPrimTypeName = 'TestPropCompsPrim'

    // Test 1: untyped prim + OneAPI.
    let prim = stage.definePrim('/UntypedPrim')
    prim.addAppliedSchema(oneAPIName)
    expect(prim.getAppliedSchemas()).toEqual([oneAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', default: 1, hidden: false })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', default: 1.0 })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', hidden: false })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token' })
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'token' })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 1, hidden: true })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', default: [1.0, 1.0, 1.0], hidden: true })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token', default: 'one', hidden: true })
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'float', default: 1.0, hidden: true })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'one', hidden: true })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', hidden: true })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'point3f', default: [1.0, 1.0, 1.0], hidden: false })

    // Only default + hidden compose from weaker property definitions; with
    // OneAPI alone the attr has no other metadata.
    verifyAttrDef(prim, 'otherMetadataAttr', {
      typeName: 'token', displayGroup: null, displayName: null, allowedTokens: null,
    })

    // Test 2: add TwoAPI (order: OneAPI, TwoAPI).
    prim.addAppliedSchema(twoAPIName)
    expect(prim.getAppliedSchemas()).toEqual([oneAPIName, twoAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', default: 1, hidden: false })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', default: [2.0, 2.0, 2.0], hidden: false })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token', default: 'two', hidden: true })
    // typeName conflict (TwoAPI says string): TwoAPI's opinions ignored.
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'token' })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 1, hidden: true })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', default: [1.0, 1.0, 1.0], hidden: true })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token', default: 'one', hidden: true })
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'float', default: 1.0, hidden: true })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'one', hidden: true })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', default: 2, hidden: true })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'point3f', default: [1.0, 1.0, 1.0], hidden: false })

    // ALL metadata except disallowed fields composes from the weaker def.
    verifyAttrDef(prim, 'otherMetadataAttr', {
      typeName: 'token',
      default: 'two',
      hidden: false,
      displayGroup: 'Two Group',
      displayName: 'OtherTwoAttr',
      allowedTokens: ['two', '2'],
    })

    // Test 3: new untyped prim + TwoAPI only.
    prim = stage.definePrim('/UntypedPrim2')
    prim.addAppliedSchema(twoAPIName)
    expect(prim.getAppliedSchemas()).toEqual([twoAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', uniform: true, default: 2, hidden: true })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', uniform: true, default: 2.0, hidden: true })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', uniform: true, default: [2.0, 2.0, 2.0], hidden: true })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token', uniform: true, default: 'two', hidden: true })
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'string', uniform: true, default: 'two', hidden: true })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 2, hidden: false })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 2.0 })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', hidden: false })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token' })
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'double' })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'two', hidden: true })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', default: 2 })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 2.0, hidden: true })
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'color3f', default: [2.0, 2.0, 2.0], hidden: true })

    verifyAttrDef(prim, 'otherMetadataAttr', {
      typeName: 'token',
      default: 'two',
      hidden: false,
      displayGroup: 'Two Group',
      displayName: 'OtherTwoAttr',
      allowedTokens: ['two', '2'],
    })

    // Test 4: add OneAPI (order: TwoAPI, OneAPI — the reverse of test 2).
    prim.addAppliedSchema(oneAPIName)
    expect(prim.getAppliedSchemas()).toEqual([twoAPIName, oneAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', uniform: true, default: 2, hidden: true })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', uniform: true, default: 2.0, hidden: true })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', uniform: true, default: [2.0, 2.0, 2.0], hidden: true })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token', uniform: true, default: 'two', hidden: true })
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'string', uniform: true, default: 'two', hidden: true })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 2, hidden: false })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 2.0, hidden: true })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', default: [1.0, 1.0, 1.0], hidden: false })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token', default: 'one', hidden: true })
    // typeName conflict (OneAPI says float vs double): OneAPI ignored.
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'double' })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'two', hidden: true })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', default: 2, hidden: true })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 2.0, hidden: true })
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'color3f', default: [2.0, 2.0, 2.0], hidden: true })

    verifyAttrDef(prim, 'otherMetadataAttr', {
      typeName: 'token',
      default: 'two',
      hidden: false,
      displayGroup: 'Two Group',
      displayName: 'OtherTwoAttr',
      allowedTokens: ['two', '2'],
    })

    // Test 5: NestedAPI only — OneAPI built-in + TwoAPI auto-applied.
    prim = stage.definePrim('/NestedAPIPrim')
    prim.addAppliedSchema(nestedAPIName)
    expect(prim.getAppliedSchemas()).toEqual([nestedAPIName, oneAPIName, twoAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', default: 1, hidden: false })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', default: [2.0, 2.0, 2.0], hidden: false })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token', default: 'two', hidden: true })
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'token' })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 1, hidden: true })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 1.0, hidden: true })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', default: [1.0, 1.0, 1.0], hidden: true })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token', default: 'one', hidden: true })
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'float', default: 1.0, hidden: true })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'nested', hidden: false })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', default: 2, hidden: true })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 1.0, hidden: false })
    // OneAPI's point3f conflicts with color3f → ignored; TwoAPI composes in.
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'color3f', default: [2.0, 2.0, 2.0], hidden: true })

    // Test 6: typed prim with built-in TwoAPI.
    prim = stage.definePrim('/TypedPrim', compPrimTypeName)
    expect(prim.getAppliedSchemas()).toEqual([twoAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', uniform: true, default: 2, hidden: true })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', uniform: true, default: 2.0, hidden: true })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', uniform: true, default: [2.0, 2.0, 2.0], hidden: true })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token', uniform: true, default: 'two', hidden: true })
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'string', uniform: true, default: 'two', hidden: true })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 2, hidden: false })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 2.0 })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', hidden: false })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token' })
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'double' })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'prim', hidden: false })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', default: 2 })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 2.0, hidden: false })
    // TwoAPI's color3f conflicts with the prim type's point3f → ignored.
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'point3f' })

    // Test 7: author NestedAPI on the typed prim — composed order is
    // TwoAPI (built-in), NestedAPI, OneAPI (TwoAPI not re-applied).
    prim.addAppliedSchema(nestedAPIName)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([nestedAPIName])
    expect(prim.getAppliedSchemas()).toEqual([twoAPIName, nestedAPIName, oneAPIName])

    verifyAttrDef(prim, 'oneAttr1', { typeName: 'int', uniform: true, default: 2, hidden: true })
    verifyAttrDef(prim, 'oneAttr2', { typeName: 'double', uniform: true, default: 2.0, hidden: true })
    verifyAttrDef(prim, 'oneAttr3', { typeName: 'color3f', uniform: true, default: [2.0, 2.0, 2.0], hidden: true })
    verifyAttrDef(prim, 'oneAttr4', { typeName: 'token', uniform: true, default: 'two', hidden: true })
    verifyAttrDef(prim, 'oneAttr5', { typeName: 'string', uniform: true, default: 'two', hidden: true })

    verifyAttrDef(prim, 'twoAttr1', { typeName: 'int', default: 2, hidden: false })
    verifyAttrDef(prim, 'twoAttr2', { typeName: 'double', default: 2.0, hidden: true })
    verifyAttrDef(prim, 'twoAttr3', { typeName: 'color3f', default: [1.0, 1.0, 1.0], hidden: false })
    verifyAttrDef(prim, 'twoAttr4', { typeName: 'token', default: 'one', hidden: true })
    verifyAttrDef(prim, 'twoAttr5', { typeName: 'double' })

    verifyAttrDef(prim, 'nestedAttr1', { typeName: 'string', default: 'prim', hidden: false })
    verifyAttrDef(prim, 'nestedAttr2', { typeName: 'int', default: 2, hidden: true })
    verifyAttrDef(prim, 'nestedAttr3', { typeName: 'double', default: 2.0, hidden: false })
    // NestedAPI's color3f conflicts with point3f → ignored; OneAPI exists
    // only as NestedAPI's built-in so it is not considered on its own.
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'point3f' })

    // Test 8: ALSO author OneAPI. Composed applied schemas unchanged, but
    // OneAPI is now an authored schema and composes on its own — its
    // compatible point3f opinions land on nestedAttr4.
    prim.addAppliedSchema(oneAPIName)
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([nestedAPIName, oneAPIName])
    expect(prim.getAppliedSchemas()).toEqual([twoAPIName, nestedAPIName, oneAPIName])
    verifyAttrDef(prim, 'nestedAttr4', { typeName: 'point3f', default: [1.0, 1.0, 1.0], hidden: false })
  })

  it('test_PropertyOversInAPISchemas', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    // prim_1: the whole PropertyOvers API tree.
    const prim1 = stage.definePrim('/Prim1')
    prim1.applyAPI('TestPropertyOversOneAPI')
    expect(prim1.getAppliedSchemas()).toEqual([
      'TestPropertyOversOneAPI',
      'TestPropertyOversTwoAPI',
      'TestPropertyOversMultiOneAPI:two',
      'TestPropertyOversMultiTwoAPI:two',
      'TestPropertyOversMultiTwoAPI:two:multiOne',
      'TestPropertyOversMultiThreeAPI:two:multiOne',
      'TestPropertyOversThreeAPI',
      'TestPropertyOversFourAPI',
      'TestPropertyOversAutoApplyAPI'])

    // prim_2: the first subtree.
    const prim2 = stage.definePrim('/Prim2')
    prim2.applyAPI('TestPropertyOversTwoAPI')
    expect(prim2.getAppliedSchemas()).toEqual([
      'TestPropertyOversTwoAPI',
      'TestPropertyOversMultiOneAPI:two',
      'TestPropertyOversMultiTwoAPI:two',
      'TestPropertyOversMultiTwoAPI:two:multiOne',
      'TestPropertyOversMultiThreeAPI:two:multiOne'])

    // prim_3: the second subtree.
    const prim3 = stage.definePrim('/Prim3')
    prim3.applyAPI('TestPropertyOversThreeAPI')
    expect(prim3.getAppliedSchemas()).toEqual([
      'TestPropertyOversThreeAPI',
      'TestPropertyOversFourAPI',
      'TestPropertyOversAutoApplyAPI'])

    // prim_4: leaf API.
    const prim4 = stage.definePrim('/Prim4')
    prim4.applyAPI('TestPropertyOversFourAPI')
    expect(prim4.getAppliedSchemas()).toEqual(['TestPropertyOversFourAPI'])

    // prim_m_1 / prim_m_2: multi-apply instances.
    const primM1 = stage.definePrim('/PrimM1')
    primM1.applyAPI('TestPropertyOversMultiOneAPI:two')
    expect(primM1.getAppliedSchemas()).toEqual([
      'TestPropertyOversMultiOneAPI:two',
      'TestPropertyOversMultiTwoAPI:two',
      'TestPropertyOversMultiTwoAPI:two:multiOne',
      'TestPropertyOversMultiThreeAPI:two:multiOne'])

    const primM2 = stage.definePrim('/PrimM2')
    primM2.applyAPI('TestPropertyOversMultiTwoAPI:two')
    expect(primM2.getAppliedSchemas()).toEqual(['TestPropertyOversMultiTwoAPI:two'])

    // Typed prims: base includes TwoAPI; derived inherits base and prepends
    // its own ThreeAPI.
    const primBase = stage.definePrim('/PrimBase', 'TestPropertyOversTypedPrimBase')
    expect(primBase.getAppliedSchemas()).toEqual([
      'TestPropertyOversTwoAPI',
      'TestPropertyOversMultiOneAPI:two',
      'TestPropertyOversMultiTwoAPI:two',
      'TestPropertyOversMultiTwoAPI:two:multiOne',
      'TestPropertyOversMultiThreeAPI:two:multiOne'])

    const primDerived = stage.definePrim('/PrimDerived', 'TestPropertyOversTypedPrimDerived')
    expect(primDerived.getAppliedSchemas()).toEqual([
      'TestPropertyOversThreeAPI',
      'TestPropertyOversFourAPI',
      'TestPropertyOversAutoApplyAPI',
      'TestPropertyOversTwoAPI',
      'TestPropertyOversMultiOneAPI:two',
      'TestPropertyOversMultiTwoAPI:two',
      'TestPropertyOversMultiTwoAPI:two:multiOne',
      'TestPropertyOversMultiThreeAPI:two:multiOne'])

    // Property-name lists prove that no "overrides_nothing" over ever
    // becomes a real property.
    expect(prim1.getPropertyNames()).toEqual([
      'defined_in_auto',
      'defined_in_four_1',
      'defined_in_four_2',
      'defined_in_three',
      'defined_in_two',
      'int_defined_in_two',
      'multi:two:defined_in_m1',
      'multi:two:defined_in_m2',
      'multi:two:multiOne:defined_in_m2',
      'otherMulti:two:multiOne:defined_in_m3',
      'uniform_token_defined_in_four'])
    expect(prim2.getPropertyNames()).toEqual([
      'defined_in_two',
      'int_defined_in_two',
      'multi:two:defined_in_m1',
      'multi:two:defined_in_m2',
      'multi:two:multiOne:defined_in_m2',
      'otherMulti:two:multiOne:defined_in_m3'])
    expect(prim3.getPropertyNames()).toEqual([
      'defined_in_auto',
      'defined_in_four_1',
      'defined_in_four_2',
      'defined_in_three',
      'uniform_token_defined_in_four'])
    expect(prim4.getPropertyNames()).toEqual([
      'defined_in_four_1',
      'defined_in_four_2',
      'uniform_token_defined_in_four'])
    expect(primM1.getPropertyNames()).toEqual([
      'multi:two:defined_in_m1',
      'multi:two:defined_in_m2',
      'multi:two:multiOne:defined_in_m2',
      'otherMulti:two:multiOne:defined_in_m3'])
    expect(primM2.getPropertyNames()).toEqual(['multi:two:defined_in_m2'])
    expect(primBase.getPropertyNames()).toEqual([
      'defined_in_base',
      'defined_in_two',
      'int_defined_in_two',
      'multi:two:defined_in_m1',
      'multi:two:defined_in_m2',
      'multi:two:multiOne:defined_in_m2',
      'otherMulti:two:multiOne:defined_in_m3'])
    expect(primDerived.getPropertyNames()).toEqual([
      'defined_in_auto',
      'defined_in_base',
      'defined_in_four_1',
      'defined_in_four_2',
      'defined_in_three',
      'defined_in_two',
      'int_defined_in_two',
      'multi:two:defined_in_m1',
      'multi:two:defined_in_m2',
      'multi:two:multiOne:defined_in_m2',
      'otherMulti:two:multiOne:defined_in_m3',
      'over_in_base',
      'uniform_token_defined_in_four'])

    // Property: defined_in_two — override composition only flows DOWN the
    // inclusion tree (never across siblings).
    let propName = 'defined_in_two'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['two', '2'], default: '1' })
    verifyAttrDef(prim2, propName, { typeName: 'token', allowedTokens: ['two', '2'], default: 'two' })
    expectNoProperty(prim3, propName)
    expectNoProperty(prim4, propName)
    verifyAttrDef(primBase, propName, { typeName: 'token', allowedTokens: ['two', '2'], default: 'base_over' })
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['two', '2'], default: 'base_over' })

    // Property: defined_in_three.
    propName = 'defined_in_three'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: 'three' })
    expectNoProperty(prim2, propName)
    verifyAttrDef(prim3, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: 'three' })
    expectNoProperty(prim4, propName)
    expectNoProperty(primBase, propName)
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: 'base_over' })

    // Property: defined_in_four_1.
    propName = 'defined_in_four_1'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['four', '4'], default: '1' })
    expectNoProperty(prim2, propName)
    verifyAttrDef(prim3, propName, { typeName: 'token', allowedTokens: ['four', '4'], default: 'four' })
    verifyAttrDef(prim4, propName, { typeName: 'token', allowedTokens: ['four', '4'], default: 'four' })
    expectNoProperty(primBase, propName)
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['four', '4'], default: 'derived_over' })

    // Property: defined_in_four_2.
    propName = 'defined_in_four_2'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: '1' })
    expectNoProperty(prim2, propName)
    verifyAttrDef(prim3, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: '3' })
    verifyAttrDef(prim4, propName, { typeName: 'token', allowedTokens: ['four', '4'], default: 'four' })
    expectNoProperty(primBase, propName)
    verifyAttrDef(primDerived, propName, {
      typeName: 'token', allowedTokens: ['base_over', 'over_base'], default: 'derived_over',
    })

    // Property: multi:two:defined_in_m1.
    propName = 'multi:two:defined_in_m1'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['multi_one', 'm1'], default: '1' })
    verifyAttrDef(prim2, propName, { typeName: 'token', allowedTokens: ['multi_one', 'm1'], default: 'multi_one' })
    verifyAttrDef(primM1, propName, { typeName: 'token', allowedTokens: ['multi_one', 'm1'], default: 'multi_one' })
    expectNoProperty(primM2, propName)
    verifyAttrDef(primBase, propName, { typeName: 'token', allowedTokens: ['multi_one', 'm1'], default: 'multi_one' })
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['multi_one', 'm1'], default: 'derived_over' })

    // Property: multi:two:defined_in_m2.
    propName = 'multi:two:defined_in_m2'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'm1' })
    verifyAttrDef(prim2, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'm1' })
    verifyAttrDef(primM1, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'm1' })
    verifyAttrDef(primM2, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'multi_two' })
    verifyAttrDef(primBase, propName, {
      typeName: 'token', allowedTokens: ['base_over', 'over_base'], default: 'base_over',
    })
    verifyAttrDef(primDerived, propName, {
      typeName: 'token', allowedTokens: ['base_over', 'over_base'], default: 'derived_over',
    })

    // Property: multi:two:multiOne:defined_in_m2.
    propName = 'multi:two:multiOne:defined_in_m2'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'multiOne:m1' })
    verifyAttrDef(prim2, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'multiOne:m1' })
    verifyAttrDef(primM1, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'multiOne:m1' })
    expectNoProperty(primM2, propName)
    verifyAttrDef(primBase, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'multiOne:m1' })
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['multi_two', 'm2'], default: 'multiOne:m1' })

    // Property: otherMulti:two:multiOne:defined_in_m3 — override across
    // DIFFERING property namespace prefixes.
    propName = 'otherMulti:two:multiOne:defined_in_m3'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['multi_three', 'm3'], default: 'm1' })
    verifyAttrDef(prim2, propName, { typeName: 'token', allowedTokens: ['multi_three', 'm3'], default: 'm1' })
    verifyAttrDef(primM1, propName, { typeName: 'token', allowedTokens: ['multi_three', 'm3'], default: 'm1' })
    expectNoProperty(primM2, propName)
    verifyAttrDef(primBase, propName, { typeName: 'token', allowedTokens: ['multi_three', 'm3'], default: 'm1' })
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['multi_three', 'm3'], default: 'm1' })

    // Property: int_defined_in_two — overrides may not change the typeName.
    propName = 'int_defined_in_two'
    verifyAttrDef(prim1, propName, { typeName: 'int', default: 2 })
    verifyAttrDef(prim2, propName, { typeName: 'int', default: 2 })
    verifyAttrDef(primBase, propName, { typeName: 'int', default: 10 })
    // Derived's token-typed override composes over Base's int override FIRST
    // (type inheritance composes before API schema composition), so the
    // mismatched override is dropped entirely.
    verifyAttrDef(primDerived, propName, { typeName: 'int', default: 2 })

    // Property: uniform_token_defined_in_four — variability of overrides is
    // ALWAYS ignored.
    propName = 'uniform_token_defined_in_four'
    verifyAttrDef(prim1, propName, {
      typeName: 'token', uniform: true, allowedTokens: ['uni_three', 'uni_3'], default: 'uni_1',
    })
    expectNoProperty(prim2, propName)
    verifyAttrDef(prim3, propName, {
      typeName: 'token', uniform: true, allowedTokens: ['uni_three', 'uni_3'], default: 'uni_3',
    })
    verifyAttrDef(prim4, propName, {
      typeName: 'token', uniform: true, allowedTokens: ['uni_four', 'uni_4'], default: 'uni_four',
    })
    expectNoProperty(primBase, propName)
    verifyAttrDef(primDerived, propName, {
      typeName: 'token', uniform: true, allowedTokens: ['uni_three', 'uni_3'], default: 'uni_derived',
    })

    // Property: defined_in_auto — overrides apply to auto-applied built-ins
    // exactly like ordinary built-ins.
    propName = 'defined_in_auto'
    verifyAttrDef(prim1, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: '1' })
    expectNoProperty(prim2, propName)
    verifyAttrDef(prim3, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: '3' })
    expectNoProperty(prim4, propName)

    const primAuto = stage.definePrim('/PrimAuto')
    primAuto.applyAPI('TestPropertyOversAutoApplyAPI')
    verifyAttrDef(primAuto, propName, { typeName: 'token', allowedTokens: ['auto'], default: 'auto' })

    expectNoProperty(primBase, propName)
    verifyAttrDef(primDerived, propName, { typeName: 'token', allowedTokens: ['three', '3'], default: '3' })

    // Property: defined_in_base — plain typed-schema inheritance composition.
    propName = 'defined_in_base'
    verifyAttrDef(primBase, propName, {
      typeName: 'token', allowedTokens: ['base_def', 'def_base'], default: 'base_def',
    })
    verifyAttrDef(primDerived, propName, {
      typeName: 'token', allowedTokens: ['base_def', 'def_base'], default: 'derived_over',
    })

    // Property: over_in_base — a derived class turns an API schema override
    // property into a DEFINED property.
    propName = 'over_in_base'
    expectNoProperty(primBase, propName)
    verifyAttrDef(primDerived, propName, {
      typeName: 'token', allowedTokens: ['base_over', 'over_base'], default: 'derived_def',
    })
  })
})
