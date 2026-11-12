// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdFallbackPrimTypes.py, pxr/base/plug/info.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdFallbackPrimTypes.py (v26.05)
//
// The fallbackPrimTypes mechanism: a root-layer metadata dict mapping
// unrecognized concrete prim type names to an ordered list of fallback type
// names. A prim whose authored type is unregistered composes as the first
// registered fallback (UsdPrimTypeInfo.getTypeName() stays authored,
// getSchemaTypeName() reports the mapped type); the schema registry harvests
// schema-defined fallbacks from each plugin's generatedSchema.usda
// (UsdSchemaRegistry::GetFallbackPrimTypes) and
// UsdStage::WriteFallbackPrimTypes persists them into the stage metadata.
//
// Scoreboard. FLIPPED at the F1 registry
// core: the REGISTRY-ONLY case ('the schema registry exposes the
// schema-defined fallbacks dict') self-promoted and is a plain it() now.
// FLIPPED at F1-C (prim/value-resolution wiring): the remaining 12 cases
// (test_OpenLayerWithFallbackTypes x9, test_Sublayer, test_FallbackAuthoring,
// test_WritingSchemaFallbacks) self-promoted once prim.getPrimTypeInfo, the
// stage-level fallback type mapping, and writeFallbackPrimTypes landed — the
// whole suite is plain it() now.
//
// Fixtures: testenv/testUsdFallbackPrimTypes/* vendored VERBATIM into
// ./fixtures/fallbackPrimTypes/ (WithFallback.usda + the test schema plugin's
// resources/{plugInfo.json,generatedSchema.usda,schema.usda}).
//
// Ported adaptations / exclusions (enumerated):
//  1. Plug.Registry().RegisterPlugins(abspath("resources")) — the web port has
//     no directory scan: PlugRegistry.GetInstance().RegisterPlugins(parsed
//     plugInfo.json, { name: { resources } }). Same plugin, same metadata, handoff differs by design.
//  2. stage.Get/SetMetadataByDictKey("fallbackPrimTypes", key) — typescript-usd Stage
//     has no *ByDictKey variants; ported over getMetadata/setMetadata on the
//     whole dict (same composed root-layer field, same observable result).
//  3. Usd.CollectionAPI.Apply(prim, "foo") — no typed CollectionAPI class;
//     ported as prim.applyAPI('CollectionAPI:foo'), the composed
//     applied-schema name upstream's registry builds (schemaBase.test.ts
//     precedent, verified against the Pixar usd-2605 build).
//  4. ChangeNoticeVerifier (Tf.Notice.RegisterGlobally) — ported over
//     stage.onObjectsChanged + await stage.flushChanges(): async-coalesced
//     composition is the intended web-USD model, flushChanges is the await
//     seam.
//  5. test_Sublayer's Sdf.Layer.CreateAnonymous() + subLayerPaths.append —
//     ported as an in-memory root layer text with
//     subLayers = [@WithFallback.usda@] (Stage.open composes identically; the
//     behavior under test is that sublayer '/' metadata does NOT compose into
//     stage metadata).
//  6. test_WritingSchemaFallbacks' Sdf.Layer.CreateNew("tempNew.usda") +
//     layer.Save() — Stage.createNew() (in-memory root layer; no filesystem
//     save). The observable assertion is preserved: authoring a prim spec via
//     the layer/stage APIs does NOT author fallbackPrimTypes metadata — only
//     writeFallbackPrimTypes() does.
//  7. Usd.Typed — ported as TfType.FindByName('UsdTyped') (TS has no
//     Usd.Typed class object; the TfType is what IsA consumes upstream too).
//  8. _VerifyPrimDefsSame's primDef.GetPropertyDefinition(p).GetMetadata/
//     ListMetadataFields — typescript-usd folds property definitions into the
//     prim-definition surface: getMetadataField(field, propName) /
//     listMetadataFields(propName).
//  9. Upstream re-fetches nothing after SetMetadataByDictKey (Prim handles
//     stay live through resyncs); typescript-usd Prim read-handles bind the composed
//     node map at fetch time, so test_FallbackAuthoring re-fetches the prim
//     after the flush. Same observable assertions.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage, SchemaRegistry as UsdSchemaRegistry, PrimDefinition as UsdPrimDefinition } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { Registry as PlugRegistry, Info as PlugInfo } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

// ---- fixtures -------------------------------------------------------------

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/fallbackPrimTypes/${name}`, import.meta.url)), 'utf8')

// Serve fixture files to Stage.open by bare filename (virtual fs).
function serve(files: Record<string, string>) {
  _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
    Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]),
  )))
}

async function openWithFallback(): Promise<Stage> {
  serve({ 'WithFallback.usda': fixture('WithFallback.usda') })
  return (await Stage.open('WithFallback.usda'))!
}

// ---- setUpClass equivalent (called from within each registry case) --------

let pluginRegistered = false

// Registers the vendored test schema plugin (once) and resolves the two valid
// concrete schema TfTypes, exactly as upstream's setUpClass.
function setupClass(): { validType1: TfType; validType2: TfType } {
  if (!pluginRegistered) {
    // plugInfo.json opens with '#' comment lines; upstream plug/info.cpp
    // strips comment-only lines before JSON parsing, so the loader does too.
    const plugInfoText = fixture('resources/plugInfo.json')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n')
    const plugInfo = JSON.parse(plugInfoText) as PlugInfo
    const testPlugins = PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
      testUsdFallbackPrimTypes: {
        'generatedSchema.usda': fixture('resources/generatedSchema.usda'),
        'schema.usda': fixture('resources/schema.usda'),
      },
    })
    expect(testPlugins.length).toBe(1)
    expect(testPlugins[0]!.getName()).toBe('testUsdFallbackPrimTypes')
    pluginRegistered = true
  }
  const validType1 = UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('ValidType_1')
  expect(validType1.isUnknown()).toBe(false)
  const validType2 = UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('ValidType_2')
  expect(validType2.isUnknown()).toBe(false)
  return { validType1, validType2 }
}

// ---- upstream helpers ------------------------------------------------------

// _VerifyFallbacksInStageMetdata [sic]: the stage's composed fallbackPrimTypes
// dict entry for typeName (adaptation 2: whole-dict getMetadata).
function verifyFallbacksInStageMetadata(
  stage: Stage,
  typeName: string,
  expectedFallbacksList: string[] | null,
) {
  const dict = stage.getMetadata('fallbackPrimTypes') as
    | Record<string, string[]>
    | undefined
  const fallbacks = dict?.[typeName]
  if (expectedFallbacksList === null) {
    expect(fallbacks).toBeUndefined()
  } else {
    expect(fallbacks).toEqual(expectedFallbacksList)
  }
}

// _VerifyPrimDefsSame (adaptation 8: property metadata via the propName-
// parameterized prim-definition surface).
function verifyPrimDefsSame(primDef1: UsdPrimDefinition, primDef2: UsdPrimDefinition) {
  expect(primDef1.getAppliedAPISchemas()).toEqual(primDef2.getAppliedAPISchemas())
  expect(primDef1.getPropertyNames()).toEqual(primDef2.getPropertyNames())
  for (const propName of primDef1.getPropertyNames()) {
    expect(primDef1.listMetadataFields(propName)).toEqual(primDef2.listMetadataFields(propName))
    for (const fieldName of primDef1.listMetadataFields(propName)) {
      expect(primDef1.getMetadataField(fieldName, propName)).toEqual(
        primDef2.getMetadataField(fieldName, propName))
    }
  }
  expect(primDef1.listMetadataFields()).toEqual(primDef2.listMetadataFields())
  for (const fieldName of primDef1.listMetadataFields()) {
    expect(primDef1.getMetadataField(fieldName)).toEqual(primDef2.getMetadataField(fieldName))
  }
}

// ChangeNoticeVerifier (adaptation 4): runs fn, flushes the coalesced
// recompose, and asserts an ObjectsChanged notice arrived with upstream's
// exact shape — resync-all is [</>] resynced + [] changedInfoOnly; a
// metadata-only change is [] resynced + [</>] changedInfoOnly.
async function expectChangeNotice(
  stage: Stage,
  expectedResyncAll: boolean,
  fn: () => void | Promise<void>,
): Promise<void> {
  let received: ObjectsChangedSummary | undefined
  const unsubscribe = onObjectsChanged(stage, (notice) => { received = notice })
  try {
    await fn()
    await stage.flushChanges()
  } finally {
    unsubscribe()
  }
  // False-positive guard, as upstream: a notice must actually have been sent.
  expect(received).toBeDefined()
  if (expectedResyncAll) {
    expect(received!.resyncedPaths).toEqual(['/'])
    expect(received!.changedInfoOnlyPaths).toEqual([])
  } else {
    expect(received!.resyncedPaths).toEqual([])
    expect(received!.changedInfoOnlyPaths).toEqual(['/'])
  }
}

// The fallbackPrimTypes dict authored in WithFallback.usda's root layer.
const AUTHORED_FALLBACKS: Record<string, string[]> = {
  ValidType_2: ['ValidType_1'],
  InvalidType_2: ['ValidType_2'],
  InvalidType_3: ['ValidType_1', 'ValidType_2'],
  InvalidType_4: ['InvalidType_3', 'ValidType_2'],
  InvalidType_5: ['InvalidType_3', 'InvalidType_2'],
}

// ---- registry-independent slices (pass today; plain it) --------------------

describe('fallbackPrimTypes: registry-independent slices (pre-F1, green today)', () => {
  it('WithFallback.usda composes authored type names and the fallbackPrimTypes stage metadata dict', async () => {
    const stage = await openWithFallback()
    expect(stage).toBeDefined()

    expect(stage.getMetadata('fallbackPrimTypes')).toEqual(AUTHORED_FALLBACKS)
    verifyFallbacksInStageMetadata(stage, 'ValidType_1', null)
    verifyFallbacksInStageMetadata(stage, 'InvalidType_1', null)
    verifyFallbacksInStageMetadata(stage, 'ValidType_2', ['ValidType_1'])

    for (const [primPath, typeName] of [
      ['/ValidPrim_1', 'ValidType_1'],
      ['/ValidPrim_2', 'ValidType_2'],
      ['/InvalidPrim_1', 'InvalidType_1'],
      ['/InvalidPrim_2', 'InvalidType_2'],
      ['/InvalidPrim_3', 'InvalidType_3'],
      ['/InvalidPrim_4', 'InvalidType_4'],
      ['/InvalidPrim_5', 'InvalidType_5'],
      ['/InvalidPrim_WithAPISchemas_1', 'InvalidType_1'],
      ['/InvalidPrim_WithAPISchemas_2', 'InvalidType_2'],
    ] as const) {
      const prim = stage.getPrim(primPath)
      expect(prim).toBeDefined()
      expect(prim!.typeName).toBe(typeName)
    }
  })

  it('authored apiSchemas compose on prims with unregistered types', async () => {
    const stage = await openWithFallback()
    expect(stage.getAppliedSchemas('/InvalidPrim_WithAPISchemas_1')).toEqual(['CollectionAPI:foo'])
    expect(stage.getAppliedSchemas('/InvalidPrim_WithAPISchemas_2')).toEqual(['CollectionAPI:foo'])

    // A prim defined with an empty typename plus the same applied schema
    // reports the same applied-schema list.
    const otherPrim = stage.definePrim('/EmptyWithCollection', '')
    otherPrim.applyAPI('CollectionAPI:foo')
    expect(otherPrim.typeName).not.toBe(stage.getPrim('/InvalidPrim_WithAPISchemas_1')!.typeName)
    expect(otherPrim.getAppliedSchemas()).toEqual(
      stage.getAppliedSchemas('/InvalidPrim_WithAPISchemas_1'))
  })

  it('sublayer: fallbackPrimTypes metadata does NOT compose from sublayers; prim type names do', async () => {
    serve({
      'WithFallback.usda': fixture('WithFallback.usda'),
      'root.usda': '#usda 1.0\n(\n    subLayers = [@WithFallback.usda@]\n)\n',
    })
    const stage = (await Stage.open('root.usda'))!

    // Stage-level metadata comes only from the root layer (and session layer),
    // never sublayers — so no fallbacks compose here.
    expect(stage.getMetadata('fallbackPrimTypes')).toBeUndefined()

    for (const [primPath, typeName] of [
      ['/ValidPrim_1', 'ValidType_1'],
      ['/ValidPrim_2', 'ValidType_2'],
      ['/InvalidPrim_1', 'InvalidType_1'],
      ['/InvalidPrim_2', 'InvalidType_2'],
      ['/InvalidPrim_3', 'InvalidType_3'],
      ['/InvalidPrim_4', 'InvalidType_4'],
      ['/InvalidPrim_5', 'InvalidType_5'],
    ] as const) {
      const prim = stage.getPrim(primPath)
      expect(prim).toBeDefined()
      expect(prim!.typeName).toBe(typeName)
    }
  })
})

// ---- test_OpenLayerWithFallbackTypes ---------------------------------------

describe('test_OpenLayerWithFallbackTypes', () => {
  it('ValidPrim_1: valid schema type name, no fallbacks defined — the typical case', async () => {
    const { validType1 } = setupClass()
    const stage = await openWithFallback()
    const validType1PrimDef =
      UsdSchemaRegistry.getInstance().findConcretePrimDefinition('ValidType_1')!

    const prim = stage.getPrim('/ValidPrim_1')!
    verifyFallbacksInStageMetadata(stage, 'ValidType_1', null)
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('ValidType_1')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('ValidType_1')
    expect(primTypeInfo.getSchemaType()).toBe(validType1)
    expect(primTypeInfo.getSchemaTypeName()).toBe('ValidType_1')
    expect(prim.isA(validType1)).toBe(true)
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(true)
    verifyPrimDefsSame(prim.getPrimDefinition(), validType1PrimDef)
  })

  it('ValidPrim_2: valid schema type name ignores its fallbacks entry', async () => {
    const { validType2 } = setupClass()
    const stage = await openWithFallback()
    const validType2PrimDef =
      UsdSchemaRegistry.getInstance().findConcretePrimDefinition('ValidType_2')!

    const prim = stage.getPrim('/ValidPrim_2')!
    verifyFallbacksInStageMetadata(stage, 'ValidType_2', ['ValidType_1'])
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('ValidType_2')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('ValidType_2')
    expect(primTypeInfo.getSchemaType()).toBe(validType2)
    expect(primTypeInfo.getSchemaTypeName()).toBe('ValidType_2')
    expect(prim.isA(validType2)).toBe(true)
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(true)
    verifyPrimDefsSame(prim.getPrimDefinition(), validType2PrimDef)
  })

  it('InvalidPrim_1: invalid type, no fallbacks — invalid schema type, empty prim definition', async () => {
    setupClass()
    const stage = await openWithFallback()
    const emptyPrimDef = UsdSchemaRegistry.getInstance().getEmptyPrimDefinition()

    const prim = stage.getPrim('/InvalidPrim_1')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_1', null)
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_1')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_1')
    expect(primTypeInfo.getSchemaType()).toBe(TfType.getUnknownType())
    expect(primTypeInfo.getSchemaTypeName()).toBe('')
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(false)
    verifyPrimDefsSame(prim.getPrimDefinition(), emptyPrimDef)
  })

  it('InvalidPrim_2: single valid fallback — schema type becomes ValidType_2', async () => {
    const { validType2 } = setupClass()
    const stage = await openWithFallback()
    const validType2PrimDef =
      UsdSchemaRegistry.getInstance().findConcretePrimDefinition('ValidType_2')!

    const prim = stage.getPrim('/InvalidPrim_2')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_2', ['ValidType_2'])
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_2')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_2')
    expect(primTypeInfo.getSchemaType()).toBe(validType2)
    expect(primTypeInfo.getSchemaTypeName()).toBe('ValidType_2')
    expect(prim.isA(validType2)).toBe(true)
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(true)
    verifyPrimDefsSame(prim.getPrimDefinition(), validType2PrimDef)
  })

  it('InvalidPrim_3: two valid fallbacks — the FIRST (ValidType_1) wins', async () => {
    const { validType1 } = setupClass()
    const stage = await openWithFallback()
    const validType1PrimDef =
      UsdSchemaRegistry.getInstance().findConcretePrimDefinition('ValidType_1')!

    const prim = stage.getPrim('/InvalidPrim_3')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_3', ['ValidType_1', 'ValidType_2'])
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_3')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_3')
    expect(primTypeInfo.getSchemaType()).toBe(validType1)
    expect(primTypeInfo.getSchemaTypeName()).toBe('ValidType_1')
    expect(prim.isA(validType1)).toBe(true)
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(true)
    verifyPrimDefsSame(prim.getPrimDefinition(), validType1PrimDef)
  })

  it('InvalidPrim_4: first fallback itself invalid — the SECOND (ValidType_2) is used', async () => {
    const { validType2 } = setupClass()
    const stage = await openWithFallback()
    const validType2PrimDef =
      UsdSchemaRegistry.getInstance().findConcretePrimDefinition('ValidType_2')!

    const prim = stage.getPrim('/InvalidPrim_4')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_4', ['InvalidType_3', 'ValidType_2'])
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_4')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_4')
    expect(primTypeInfo.getSchemaType()).toBe(validType2)
    expect(primTypeInfo.getSchemaTypeName()).toBe('ValidType_2')
    expect(prim.isA(validType2)).toBe(true)
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(true)
    verifyPrimDefsSame(prim.getPrimDefinition(), validType2PrimDef)
  })

  it('InvalidPrim_5: all fallbacks invalid — invalid schema type, empty prim definition', async () => {
    setupClass()
    const stage = await openWithFallback()
    const emptyPrimDef = UsdSchemaRegistry.getInstance().getEmptyPrimDefinition()

    const prim = stage.getPrim('/InvalidPrim_5')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_5', ['InvalidType_3', 'InvalidType_2'])
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_5')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_5')
    expect(primTypeInfo.getSchemaType()).toBe(TfType.getUnknownType())
    expect(primTypeInfo.getSchemaTypeName()).toBe('')
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(false)
    verifyPrimDefsSame(prim.getPrimDefinition(), emptyPrimDef)
  })

  it('InvalidPrim_WithAPISchemas_1: invalid type still applies API schemas; shares its prim def with an empty-typed prim + same APIs', async () => {
    setupClass()
    const stage = await openWithFallback()

    const prim = stage.getPrim('/InvalidPrim_WithAPISchemas_1')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_1', null)
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_1')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_1')
    expect(primTypeInfo.getSchemaType()).toBe(TfType.getUnknownType())
    expect(primTypeInfo.getSchemaTypeName()).toBe('')
    expect(primTypeInfo.getAppliedAPISchemas()).toEqual(['CollectionAPI:foo'])
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(false)
    expect(stage.getAppliedSchemas(prim.path)).toEqual(['CollectionAPI:foo'])

    // A prim with an EMPTY typename and the same applied API schemas has the
    // same effective schema type — and therefore the same prim definition —
    // even though the two type names differ.
    const otherPrim = stage.definePrim('/EmptyWithCollection', '')
    otherPrim.applyAPI('CollectionAPI:foo')
    const otherPrimTypeInfo = otherPrim.getPrimTypeInfo()
    expect(otherPrim.typeName).not.toBe(prim.typeName)
    expect(otherPrimTypeInfo).not.toBe(primTypeInfo)
    expect(otherPrimTypeInfo.getSchemaTypeName()).toBe(primTypeInfo.getSchemaTypeName())
    expect(otherPrimTypeInfo.getSchemaType()).toBe(primTypeInfo.getSchemaType())
    expect(otherPrim.getAppliedSchemas()).toEqual(stage.getAppliedSchemas(prim.path))
    verifyPrimDefsSame(otherPrim.getPrimDefinition(), prim.getPrimDefinition())
  })

  it('InvalidPrim_WithAPISchemas_2: fallback type with API schemas applied over it; shares its prim def with a ValidType_2 prim + same APIs', async () => {
    const { validType2 } = setupClass()
    const stage = await openWithFallback()

    const prim = stage.getPrim('/InvalidPrim_WithAPISchemas_2')!
    verifyFallbacksInStageMetadata(stage, 'InvalidType_2', ['ValidType_2'])
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_2')
    const primTypeInfo = prim.getPrimTypeInfo()
    expect(primTypeInfo.getTypeName()).toBe('InvalidType_2')
    expect(primTypeInfo.getSchemaType()).toBe(validType2)
    expect(primTypeInfo.getSchemaTypeName()).toBe('ValidType_2')
    expect(primTypeInfo.getAppliedAPISchemas()).toEqual(['CollectionAPI:foo'])
    expect(prim.isA(validType2)).toBe(true)
    expect(prim.isA(TfType.findByName('UsdTyped'))).toBe(true)
    expect(stage.getAppliedSchemas(prim.path)).toEqual(['CollectionAPI:foo'])

    // A prim authored directly as the FALLBACK typename with the same applied
    // API schemas has the same effective schema type and prim definition.
    const otherPrim = stage.definePrim('/Valid2WithCollection', 'ValidType_2')
    otherPrim.applyAPI('CollectionAPI:foo')
    const otherPrimTypeInfo = otherPrim.getPrimTypeInfo()
    expect(otherPrim.typeName).not.toBe(prim.typeName)
    expect(otherPrimTypeInfo).not.toBe(primTypeInfo)
    expect(otherPrimTypeInfo.getSchemaTypeName()).toBe(primTypeInfo.getSchemaTypeName())
    expect(otherPrimTypeInfo.getSchemaType()).toBe(primTypeInfo.getSchemaType())
    expect(otherPrim.getAppliedSchemas()).toEqual(stage.getAppliedSchemas(prim.path))
    verifyPrimDefsSame(otherPrim.getPrimDefinition(), prim.getPrimDefinition())
  })
})

// ---- test_Sublayer -----------------------------------------------------------

describe('test_Sublayer', () => {
  it('fallbacks do not compose from a sublayer: valid types resolve, invalid types get NO schema type', async () => {
    const { validType1, validType2 } = setupClass()
    serve({
      'WithFallback.usda': fixture('WithFallback.usda'),
      'root.usda': '#usda 1.0\n(\n    subLayers = [@WithFallback.usda@]\n)\n',
    })
    const stage = (await Stage.open('root.usda'))!

    // The two prims with valid schema type names still resolve.
    let prim = stage.getPrim('/ValidPrim_1')!
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('ValidType_1')
    expect(prim.getPrimTypeInfo().getSchemaType()).toBe(validType1)
    expect(prim.getPrimTypeInfo().getSchemaTypeName()).toBe('ValidType_1')

    prim = stage.getPrim('/ValidPrim_2')!
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('ValidType_2')
    expect(prim.getPrimTypeInfo().getSchemaType()).toBe(validType2)
    expect(prim.getPrimTypeInfo().getSchemaTypeName()).toBe('ValidType_2')

    // All prims with invalid types have no schema type: the fallback dict
    // lives on the SUBLAYER's pseudo-root and stage metadata never composes
    // from sublayers.
    for (const [primPath, typeName] of [
      ['/InvalidPrim_1', 'InvalidType_1'],
      ['/InvalidPrim_2', 'InvalidType_2'],
      ['/InvalidPrim_3', 'InvalidType_3'],
      ['/InvalidPrim_4', 'InvalidType_4'],
      ['/InvalidPrim_5', 'InvalidType_5'],
    ] as const) {
      const p = stage.getPrim(primPath)!
      expect(p).toBeDefined()
      expect(p.typeName).toBe(typeName)
      expect(p.getPrimTypeInfo().getSchemaType()).toBe(TfType.getUnknownType())
      expect(p.getPrimTypeInfo().getSchemaTypeName()).toBe('')
    }
  })
})

// ---- test_FallbackAuthoring ----------------------------------------------------

describe('test_FallbackAuthoring', () => {
  it('authoring a fallbackPrimTypes entry resyncs ALL prims and remaps InvalidPrim_1 to ValidType_2', async () => {
    const { validType2 } = setupClass()
    const stage = await openWithFallback()
    expect(stage).toBeDefined()

    // Before: InvalidPrim_1 has no fallbacks and an invalid schema type.
    let prim = stage.getPrim('/InvalidPrim_1')!
    expect(prim).toBeDefined()
    expect(prim.typeName).toBe('InvalidType_1')
    expect(prim.getPrimTypeInfo().getSchemaType()).toBe(TfType.getUnknownType())
    expect(prim.getPrimTypeInfo().getSchemaTypeName()).toBe('')

    // Author a fallback for InvalidType_1 in the stage's fallbackPrimTypes
    // metadata dict (adaptation 2: whole-dict setMetadata standing in for
    // SetMetadataByDictKey). This resyncs all prims on the stage.
    await expectChangeNotice(stage, /* expectedResyncAll */ true, () => {
      const dict = (stage.getMetadata('fallbackPrimTypes') ?? {}) as Record<string, string[]>
      stage.setMetadata('fallbackPrimTypes', { ...dict, InvalidType_1: ['ValidType_2'] })
    })

    // InvalidPrim_1 now has a schema type from the fallback type
    // (adaptation 9: re-fetch the read handle after the flush).
    prim = stage.getPrim('/InvalidPrim_1')!
    expect(prim.typeName).toBe('InvalidType_1')
    expect(prim.getPrimTypeInfo().getSchemaType()).toBe(validType2)
    expect(prim.getPrimTypeInfo().getSchemaTypeName()).toBe('ValidType_2')
  })
})

// ---- test_WritingSchemaFallbacks -------------------------------------------------

// The schema-defined fallbacks in the test plugin's generatedSchema.usda.
const SCHEMA_FALLBACKS: Record<string, string[]> = {
  ValidType_1: ['FallbackType_1'],
  ValidType_2: ['FallbackType_2', 'FallbackType_1'],
}

describe('test_WritingSchemaFallbacks', () => {
  // Flipped green at the schema-registry F1 registry core (getFallbackPrimTypes
  // harvested from the generatedSchema.usda root metadata).
  it('the schema registry exposes the schema-defined fallbacks dict', () => {
    setupClass()
    expect(UsdSchemaRegistry.getInstance().getFallbackPrimTypes()).toEqual(SCHEMA_FALLBACKS)
  })

  it('writeFallbackPrimTypes authors schema fallbacks to the root layer without a full resync, and merges with (never clobbers) authored entries', async () => {
    setupClass()

    // A new empty stage has no fallbackPrimTypes metadata (adaptation 6:
    // Stage.createNew stands in for Sdf.Layer.CreateNew + Usd.Stage.Open).
    const stage = Stage.createNew()
    const layer = stage.getRootLayer()
    expect(stage).toBeDefined()
    expect(stage.getMetadata('fallbackPrimTypes')).toBeFalsy()
    expect(layer.getField('/', 'fallbackPrimTypes')).toBeFalsy()

    // Authoring a prim spec through the stage/layer APIs does not author any
    // fallback metadata.
    stage.definePrim('/ValidPrim', 'ValidType_2')
    // Changes are processed by the coalesced flush (await stage.flushChanges).
    await stage.flushChanges()
    expect(stage.getPrim('/ValidPrim')).toBeDefined()
    expect(stage.getMetadata('fallbackPrimTypes')).toBeFalsy()
    expect(layer.getField('/', 'fallbackPrimTypes')).toBeFalsy()

    // Writing the schema fallbacks through the stage API authors the registry
    // dict onto the root layer WITHOUT a full-stage resync.
    await expectChangeNotice(stage, /* expectedResyncAll */ false, () => {
      stage.writeFallbackPrimTypes()
    })
    expect(stage.getMetadata('fallbackPrimTypes')).toEqual(SCHEMA_FALLBACKS)
    expect(layer.getField('/', 'fallbackPrimTypes')).toEqual(SCHEMA_FALLBACKS)

    // Manually authoring a DIFFERENT dict on the root layer triggers a full
    // resync and replaces the stage's fallback types. (Upstream's
    // 'ValidType_2, FallbackType_2' single-token value is deliberate — kept
    // exact.)
    const newFallbacks: Record<string, string[]> = {
      ValidType_1: ['ValidType_2, FallbackType_2'],
      InValidType_1: ['ValidType_1'],
    }
    await expectChangeNotice(stage, /* expectedResyncAll */ true, () => {
      layer.setField('/', 'fallbackPrimTypes', newFallbacks)
    })
    expect(stage.getMetadata('fallbackPrimTypes')).toEqual(newFallbacks)
    expect(layer.getField('/', 'fallbackPrimTypes')).toEqual(newFallbacks)

    // Writing the schema fallbacks again only ADDS registry entries for types
    // not already present — existing entries are preserved.
    await expectChangeNotice(stage, /* expectedResyncAll */ false, () => {
      stage.writeFallbackPrimTypes()
    })
    const postSaveFallbacks: Record<string, string[]> = {
      ValidType_1: ['ValidType_2, FallbackType_2'],
      ValidType_2: ['FallbackType_2', 'FallbackType_1'],
      InValidType_1: ['ValidType_1'],
    }
    expect(stage.getMetadata('fallbackPrimTypes')).toEqual(postSaveFallbacks)
    expect(layer.getField('/', 'fallbackPrimTypes')).toEqual(postSaveFallbacks)
  })
})
