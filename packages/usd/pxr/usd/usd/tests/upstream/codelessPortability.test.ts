// Ported from OpenUSD 26.11.1: pxr/usd/usd/generatedSchema.usda,
//  pxr/usd/usd/plugInfo.json, pxr/usd/usd/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Codeless-portability acceptance test — a CROSS-RUNTIME INVARIANT: the
// SAME schema artifacts a C++ OpenUSD build consumes (plugInfo.json + generatedSchema.usda) must
// work in TS UNCHANGED. Only the handoff differs by design (explicit
// RegisterPlugins vs PXR_PLUGINPATH_NAME directory scan); the artifacts
// must not.
//
// Fixtures are BYTE-VERBATIM upstream files (pinned v26.05), vendored with
// no edits whatsoever into fixtures/codelessPortability/:
//   codeless/plugInfo.json
//     ← OpenUSD/pxr/usd/usd/testenv/testUsdGenSchema/baseline/codeless/plugInfo.json
//       (the "usdContrived" plugin, Type: "resource" — a pure codeless
//       plugin; upstream checks in no generatedSchema.usda for it, so its
//       assertions here are the ones plugInfo alone answers: TfType graph,
//       aliases, kinds, IsResource)
//   usdSchemaExamples/{plugInfo.json, generatedSchema.usda, schema.usda}
//     ← OpenUSD/extras/usd/examples/usdSchemaExamples/ (the
//       "usdSchemaExamples" plugin, Type: "library"; schema.usda is vendored
//       for reference only — the registry never reads it)
//
// Every expected value below is DERIVED BY READING those fixture artifacts
// and quoted as a literal (fixture-derived), never invented.
//
// SCOREBOARD STATE: the plug-only cases flipped green at F0; the registry
// kind/prim-definition cases flipped green at the F1 registry core (they ran
// as self-promoting it.fails until UsdSchemaRegistry landed, then vitest
// forced the promotion). FLIPPED at F1-C (prim/value-resolution wiring): the
// stage-prim isA case self-promoted once Prim.isA landed — the whole suite
// is plain it() now.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import type { Info as PlugInfo } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { Stage, SchemaRegistry as UsdSchemaRegistry } from 'typescript-usd/usd'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = path.join(__dirname, 'fixtures', 'codelessPortability')

function readFixture(...rel: string[]): string {
  return readFileSync(path.join(FIXTURES, ...rel), 'utf8')
}

// Upstream plugInfo.json files open with '#' comment lines; plug/info.cpp
// strips comment-only lines before JSON parsing ("The Js library doesn't
// allow comments, but we'd like to allow them", info.cpp:153). Same
// treatment here — the FILE stays verbatim; stripping is the consumer's job
// in both runtimes.
function parsePlugInfoText(text: string): PlugInfo {
  const stripped = text
    .split('\n')
    .map((line) => (line.includes('#') && line.search(/\S/) === line.indexOf('#') ? '' : line))
    .join('\n')
  return JSON.parse(stripped) as PlugInfo
}

function registerUsdSchemaExamples() {
  return PlugRegistry.GetInstance().RegisterPlugins(
    parsePlugInfoText(readFixture('usdSchemaExamples', 'plugInfo.json')),
    { usdSchemaExamples: { 'generatedSchema.usda': readFixture('usdSchemaExamples', 'generatedSchema.usda') } },
  )
}

function registerUsdContrived() {
  // Pure-codeless plugin: no generatedSchema.usda is checked in upstream for
  // baseline/codeless, so it registers from plugInfo.json alone.
  return PlugRegistry.GetInstance().RegisterPlugins(
    parsePlugInfoText(readFixture('codeless', 'plugInfo.json')),
  )
}

describe('codeless portability: TfType graph from verbatim upstream plugInfo.json', () => {
  it('declares the usdSchemaExamples types with the plugInfo bases', () => {
    registerUsdSchemaExamples()

    // Fixture-derived (usdSchemaExamples/plugInfo.json Info.Types):
    //   UsdSchemaExamplesSimple  { bases: [UsdTyped] }
    //   UsdSchemaExamplesComplex { bases: [UsdSchemaExamplesSimple] }
    //   UsdSchemaExamplesParamsAPI { bases: [UsdAPISchemaBase] }
    const simple = TfType.findByName('UsdSchemaExamplesSimple')
    const complex = TfType.findByName('UsdSchemaExamplesComplex')
    const paramsAPI = TfType.findByName('UsdSchemaExamplesParamsAPI')
    expect(simple.isUnknown()).toBe(false)
    expect(complex.isUnknown()).toBe(false)
    expect(paramsAPI.isUnknown()).toBe(false)

    expect(complex.getBaseTypes()).toEqual([simple])
    expect(simple.getBaseTypes()).toEqual([TfType.findByName('UsdTyped')])
    expect(paramsAPI.getBaseTypes()).toEqual([TfType.findByName('UsdAPISchemaBase')])

    // TfType-level IsA through the declared chain.
    expect(complex.isA(simple)).toBe(true)
    expect(simple.isA(complex)).toBe(false)
  })

  it('resolves the aliases under UsdSchemaBase', () => {
    registerUsdSchemaExamples()

    // Fixture-derived alias dicts: { UsdSchemaBase: 'ComplexPrim' } etc.
    const schemaBase = TfType.findByName('UsdSchemaBase')
    expect(schemaBase.isUnknown()).toBe(false)
    expect(schemaBase.findDerivedByName('ComplexPrim')).toBe(TfType.findByName('UsdSchemaExamplesComplex'))
    expect(schemaBase.findDerivedByName('SimplePrim')).toBe(TfType.findByName('UsdSchemaExamplesSimple'))
    expect(schemaBase.findDerivedByName('ParamsAPI')).toBe(TfType.findByName('UsdSchemaExamplesParamsAPI'))
  })

  it('declares the codeless usdContrived types identically (bases + aliases from JSON alone)', () => {
    registerUsdContrived()

    // Fixture-derived (codeless/plugInfo.json Info.Types):
    //   UsdContrivedBase    { bases: [UsdTyped], alias: Base }
    //   UsdContrivedDerived { bases: [UsdContrivedBase], alias: Derived }
    const base = TfType.findByName('UsdContrivedBase')
    const derived = TfType.findByName('UsdContrivedDerived')
    expect(base.isUnknown()).toBe(false)
    expect(derived.isUnknown()).toBe(false)
    expect(derived.getBaseTypes()).toEqual([base])
    expect(base.getBaseTypes()).toEqual([TfType.findByName('UsdTyped')])
    expect(derived.isA(base)).toBe(true)

    const schemaBase = TfType.findByName('UsdSchemaBase')
    expect(schemaBase.findDerivedByName('Derived')).toBe(derived)
    expect(schemaBase.findDerivedByName('Base')).toBe(base)
  })
})

describe('codeless portability: schema kinds match the plugInfo schemaKind', () => {
  it('usdSchemaExamples kinds', () => {
    registerUsdSchemaExamples()

    // Fixture-derived schemaKind values (usdSchemaExamples/plugInfo.json):
    expect(UsdSchemaRegistry.getSchemaKind('ComplexPrim')).toBe('concreteTyped')
    expect(UsdSchemaRegistry.getSchemaKind('SimplePrim')).toBe('abstractTyped')
    expect(UsdSchemaRegistry.getSchemaKind('ParamsAPI')).toBe('singleApplyAPI')

    expect(UsdSchemaRegistry.isConcrete('ComplexPrim')).toBe(true)
    expect(UsdSchemaRegistry.isConcrete('SimplePrim')).toBe(false)
    expect(UsdSchemaRegistry.isTyped('SimplePrim')).toBe(true)
    expect(UsdSchemaRegistry.isAppliedAPISchema('ParamsAPI')).toBe(true)
    expect(UsdSchemaRegistry.isMultipleApplyAPISchema('ParamsAPI')).toBe(false)
  })

  it('codeless usdContrived kinds (all six plugInfo schemaKind spellings in play)', () => {
    registerUsdContrived()

    // Fixture-derived schemaKind values (codeless/plugInfo.json):
    expect(UsdSchemaRegistry.getSchemaKind('Base')).toBe('abstractTyped')
    expect(UsdSchemaRegistry.getSchemaKind('Derived')).toBe('concreteTyped')
    expect(UsdSchemaRegistry.getSchemaKind('NonAppliedAPI')).toBe('nonAppliedAPI')
    expect(UsdSchemaRegistry.getSchemaKind('SingleApplyAPI')).toBe('singleApplyAPI')
    expect(UsdSchemaRegistry.getSchemaKind('MultipleApplyAPI')).toBe('multipleApplyAPI')
    // Versioned identifiers keep their own entries:
    expect(UsdSchemaRegistry.getSchemaKind('MultipleApplyAPI_1')).toBe('multipleApplyAPI')
    expect(UsdSchemaRegistry.getSchemaKind('SingleApplyAPI_1')).toBe('singleApplyAPI')
  })
})

describe('codeless portability: prim definitions from verbatim generatedSchema.usda', () => {
  it('findConcretePrimDefinition("ComplexPrim") exposes the flattened property set + fallbacks', () => {
    registerUsdSchemaExamples()
    const primDef = UsdSchemaRegistry.getInstance().findConcretePrimDefinition('ComplexPrim')
    expect(primDef).not.toBeNull()

    // Fixture-derived (usdSchemaExamples/generatedSchema.usda, class
    // ComplexPrim "ComplexPrim" — already flattened by upstream usdGenSchema,
    // so the inherited SimplePrim properties appear directly):
    //   string complexString = "somethingComplex"
    //   int intAttr = 0
    //   rel target
    expect([...primDef!.getPropertyNames()].sort()).toEqual(['complexString', 'intAttr', 'target'])
    expect(primDef!.hasProperty('complexString')).toBe(true)
    expect(primDef!.getSpecType('complexString')).toBe('attribute')
    expect(primDef!.getSpecType('intAttr')).toBe('attribute')
    expect(primDef!.getSpecType('target')).toBe('relationship')
    expect(primDef!.getSpecType('notAProperty')).toBe('')

    expect(primDef!.getAttributeFallbackValue('complexString')).toBe('somethingComplex')
    expect(primDef!.getAttributeFallbackValue('intAttr')).toBe(0)
    // target is a relationship — no attribute fallback.
    expect(primDef!.getAttributeFallbackValue('target')).toBeUndefined()
  })

  it('findAppliedAPIPrimDefinition("ParamsAPI") exposes the namespaced attributes', () => {
    registerUsdSchemaExamples()
    const primDef = UsdSchemaRegistry.getInstance().findAppliedAPIPrimDefinition('ParamsAPI')
    expect(primDef).not.toBeNull()

    // Fixture-derived (generatedSchema.usda class "ParamsAPI"):
    //   double params:mass / params:velocity / params:volume — all three
    //   authored WITHOUT a default value, so no fallback exists.
    expect([...primDef!.getPropertyNames()].sort()).toEqual([
      'params:mass',
      'params:velocity',
      'params:volume',
    ])
    expect(primDef!.getSpecType('params:mass')).toBe('attribute')
    expect(primDef!.getAttributeFallbackValue('params:mass')).toBeUndefined()
  })

  it('abstract SimplePrim has no CONCRETE prim definition', () => {
    registerUsdSchemaExamples()
    // Fixture-derived: SimplePrim's schemaKind is abstractTyped — upstream
    // only builds concrete prim definitions for concreteTyped schemas.
    expect(UsdSchemaRegistry.getInstance().findConcretePrimDefinition('SimplePrim')).toBeNull()
  })
})

describe('codeless portability: IsA through the fixture base chain', () => {
  it('a stage prim typed ComplexPrim is-a SimplePrim', () => {
    registerUsdSchemaExamples()

    // Fixture-derived base chain (plugInfo.json):
    // UsdSchemaExamplesComplex → UsdSchemaExamplesSimple → UsdTyped,
    // i.e. ComplexPrim is-a SimplePrim (and is-a itself), and SimplePrim is
    // NOT a ComplexPrim.
    const stage = Stage.createNew()
    const prim = stage.definePrim('/c', 'ComplexPrim')
    expect(prim.typeName).toBe('ComplexPrim')
    expect(prim.isA('ComplexPrim')).toBe(true)
    expect(prim.isA('SimplePrim')).toBe(true)
    expect(prim.isA('ParamsAPI')).toBe(false)
    // TfType overload, same answers.
    expect(prim.isA(TfType.findByName('UsdSchemaExamplesSimple'))).toBe(true)
  })
})

describe('codeless portability: "Type": "resource" plugins register identically to "library"', () => {
  it('IsResource() differs; everything else is the same machinery', () => {
    registerUsdSchemaExamples()
    registerUsdContrived()

    const registry = PlugRegistry.GetInstance()
    // Fixture-derived: usdSchemaExamples is "Type": "library",
    // usdContrived (baseline/codeless) is "Type": "resource".
    const library = registry.GetPluginWithName('usdSchemaExamples')
    const resource = registry.GetPluginWithName('usdContrived')
    expect(library).not.toBeNull()
    expect(resource).not.toBeNull()
    expect(library!.isResource()).toBe(false)
    expect(resource!.isResource()).toBe(true)

    // Identical downstream behavior — types declared, plugin ownership
    // resolvable, per-type metadata served, kinds answered — regardless of
    // Type: there is nothing to dlopen either way in TS, exactly as the
    // schema registry upstream never loads the library.
    for (const [plugin, typeName, kind] of [
      [library!, 'UsdSchemaExamplesComplex', 'concreteTyped'],
      [resource!, 'UsdContrivedDerived', 'concreteTyped'],
    ] as const) {
      const type = TfType.findByName(typeName)
      expect(type.isUnknown()).toBe(false)
      expect(registry.getPluginForType(type)).toBe(plugin)
      expect(plugin.declaresType(type)).toBe(true)
      const metadata = plugin.getMetadataForType(type)
      expect(metadata['schemaKind']).toBe(kind)
      expect(metadata['autoGenerated']).toBe(true)
    }
  })
})
