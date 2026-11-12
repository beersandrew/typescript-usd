// Portions ported from OpenUSD 26.11.1, including: pxr/exec/esfUsd/object.cpp,
//  pxr/exec/esfUsd/attributeQuery.cpp, pxr/exec/esfUsd/stageData.cpp
// Copyright 2025, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd checks: the typed typescript-usd/usd and typescript-usd/sdf
// APIs that esfUsd's port calls where upstream esfUsd calls OpenUSD 26.11.1
// Usd and Sdf (formerly the FAITHFULNESS-DEBT ids openexec-usd-typed-metadata,
// openexec-usd-vtvalue-get and openexec-usd-connections-bool). Each it() names
// the TS API and its upstream counterpart. The expected results are the
// native build's on the same stage
// (pxr/usd/sdf/tests/fixtures/schemaFieldTypes/expected.json, usdApiGaps).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import { Layer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { AttributeQuery as UsdAttributeQuery, Stage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Value as VtValue } from 'typescript-usd/vt'
import { EsfUsdSceneAdapter } from '../src/sceneAdapter.ts'
import { EsfUsdStageData } from '../src/stageData.ts'

const native = (JSON.parse(readFileSync(new URL(
  '../../../usd/sdf/tests/fixtures/schemaFieldTypes/expected.json', import.meta.url), 'utf8')) as {
  payload: { usdApiGaps: {
    primDocumentation: { result: boolean, type: string, value: string }
    attributeQueryGet: { result: boolean, type: string, value: number }
    emptiedConnections: { removeConnection: boolean, result: boolean, sources: number }
  } }
}).payload.usdApiGaps

async function openStage(): Promise<Stage> {
  const layer = Layer.createAnonymous('.usda')
  expect(layer.importFromString(`#usda 1.0
def Scope "Prim" (
    doc = "prim doc"
) {
    int attr = 1
    int emptied.connect = [</Prim.attr>]
}
`)).toBe(true)
  const stage = await Stage.open(layer)
  EsfUsdStageData.registerStage(stage, null)
  return stage
}

describe('typescript-usd API gaps esfUsd depends on', () => {
  // esfUsd/object.ts _GetMetadataValueType (pxr/exec/esfUsd/object.cpp:152-172).
  it('SdfSchema field definitions give typed fallbacks ' +
    '(SdfSchemaBase::FieldDefinition::GetFallbackValue returns a VtValue)', async () => {
    const stage = await openStage()
    const prim = EsfUsdSceneAdapter.adaptPrim(stage.getPrim('/Prim'))
    expect(prim.Get().getMetadataValueType('documentation'))
      .toBe(TfType.findByName(native.primDocumentation.type))
  })

  // esfUsd/object.ts _GetMetadata (pxr/exec/esfUsd/object.cpp:100-110).
  it('Prim.getMetadata reads a typed value ' +
    '(UsdObject::GetMetadata(const TfToken&, VtValue*))', async () => {
    const stage = await openStage()
    const value = VtValue.getEmpty()
    expect(stage.getPrim('/Prim')!.getMetadata('documentation', value))
      .toBe(native.primDocumentation.result)
    expect(value.IsHolding(TfType.findByName(native.primDocumentation.type))).toBe(true)
    expect(value.Get<string>()).toBe(native.primDocumentation.value)
    const prim = EsfUsdSceneAdapter.adaptPrim(stage.getPrim('/Prim'))
    expect(prim.Get().getMetadata('documentation').Get<string>())
      .toBe(native.primDocumentation.value)
  })

  // esfUsd/attributeQuery.ts _Get (pxr/exec/esfUsd/attributeQuery.cpp:33-37).
  it('UsdAttributeQuery.get resolves a VtValue ' +
    '(UsdAttributeQuery::Get(VtValue*, UsdTimeCode))', async () => {
    const stage = await openStage()
    const query = new UsdAttributeQuery(stage.getAttributeAtPath('/Prim.attr'))
    const value = VtValue.getEmpty()
    expect(query.get(value, UsdTimeCode.Default())).toBe(native.attributeQueryGet.result)
    expect(value.IsHolding(TfType.findByName(native.attributeQueryGet.type))).toBe(true)
    expect(value.Get<number>()).toBe(native.attributeQueryGet.value)
  })

  // esfUsd/stageData.ts (pxr/exec/esfUsd/stageData.cpp:176, 469).
  it('Attribute.getConnections reports connection opinions ' +
    '(UsdAttribute::GetConnections(SdfPathVector*) returns isClean && hasTargetOpinions)',
  async () => {
    const stage = await openStage()
    const attr = stage.getAttributeAtPath('/Prim.emptied')!
    expect(attr.removeConnection('/Prim.attr')).toBe(native.emptiedConnections.removeConnection)
    // The authored list op composes to no paths, and GetConnections is
    // still true.
    const sources: SdfPath[] = [SdfPath.fromString('/Stale')]
    expect(attr.getConnections(sources)).toBe(native.emptiedConnections.result)
    expect(sources.length).toBe(native.emptiedConnections.sources)
  })
})
