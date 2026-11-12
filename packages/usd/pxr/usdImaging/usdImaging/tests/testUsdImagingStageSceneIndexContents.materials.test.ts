// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceAttributeColorSpace.h,
//  pxr/usdImaging/usdImaging/dataSourceAttributeTypeName.h,
//  pxr/usdImaging/usdImaging/dataSourceMaterial.cpp,
//  pxr/usdImaging/usdImaging/materialAdapter.h,
//  pxr/usdImaging/usdImaging/materialBindingAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2016, 2022, 2023, 2024 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The material path of the stage scene index: UsdImagingMaterialAdapter
// (dataSourceMaterial.cpp, dataSourceAttributeColorSpace.h,
// dataSourceAttributeTypeName.h), UsdImagingShaderAdapter and
// UsdImagingNodeGraphAdapter (materialAdapter.h),
// UsdImagingMaterialBindingAPIAdapter (materialBindingAPIAdapter.cpp),
// UsdImagingFlattenedMaterialBindingsDataSourceProvider and
// UsdImagingMaterialBindingsResolvingSceneIndex, checked against captures of
// the OpenUSD 26.11.1 reference build for fixtures/materials/*.usda
// (FIXTURES.md):
//
// - <scene>.typed.txt (the native capture): the material and usdMaterialBindings
//   data sources of UsdImagingStageSceneIndex with the VtValue type of every
//   value and the resolved path of asset values; usdMaterialBindings after an
//   HdFlatteningSceneIndex with the material bindings provider; the hd
//   materialBindings of UsdImagingMaterialBindingsResolvingSceneIndex.
// - <scene>.contents.txt: testUsdImagingStageSceneIndexContents (every prim
//   printed with HdDebugPrintDataSource); the material and
//   usdMaterialBindings subtrees are compared as parsed trees.
//
// Numbers are compared with a float tolerance (C++ prints float and double
// with 6 or more significant digits). The Sdr identifier of the
// sourceAsset shader node hashes the asset's resolved path (registry.cpp:
// 149-164 _GetIdentifierForAsset), which differs between the capture
// directory and this checkout; the capture records it as <assetHash>, and
// only its form is compared.
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  DebugPrintDataSource as HdDebugPrintDataSource,
  FlatteningSceneIndex as HdFlatteningSceneIndex,
  MakeDataSourceContainingFlattenedDataSourceProvider as HdMakeDataSourceContainingFlattenedDataSourceProvider,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  MaterialSchema as HdMaterialSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  SampledDataSource as HdSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  VectorDataSource as HdVectorDataSource,
  type DataSourceBase as HdDataSourceBase,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import 'typescript-usd/sdrGlslfx'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Array as VtArray, Dictionary as VtDictionary, Value as VtValue } from 'typescript-usd/vt'
import {
  UsdImagingAdapterRegistry,
  UsdImagingCollectionAPIAdapter,
  UsdImagingFlattenedMaterialBindingsDataSourceProvider,
  UsdImagingMaterialAdapter,
  UsdImagingMaterialBindingAPIAdapter,
  UsdImagingMaterialBindingsResolvingSceneIndex,
  UsdImagingMaterialBindingsSchema,
  UsdImagingMeshAdapter,
  UsdImagingNodeGraphAdapter,
  UsdImagingShaderAdapter,
  UsdImagingStageSceneIndex,
} from 'typescript-usd/usdImaging'

// The plugInfo.json entries (pxr/usdImaging/usdImaging/plugInfo.json) of the
// adapters these scenes use.
UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingMaterialAdapter', isInternal: true, primTypeName: 'Material',
    primAdapterFactory: () => new UsdImagingMaterialAdapter() },
  { typeName: 'UsdImagingShaderAdapter', isInternal: true, primTypeName: 'Shader',
    primAdapterFactory: () => new UsdImagingShaderAdapter() },
  { typeName: 'UsdImagingNodeGraphAdapter', isInternal: true, primTypeName: 'NodeGraph',
    primAdapterFactory: () => new UsdImagingNodeGraphAdapter() },
  { typeName: 'UsdImagingMaterialBindingAPIAdapter', isInternal: true, apiSchemaName: 'MaterialBindingAPI',
    apiSchemaAdapterFactory: () => new UsdImagingMaterialBindingAPIAdapter() },
  { typeName: 'UsdImagingCollectionAPIAdapter', isInternal: true, apiSchemaName: 'CollectionAPI',
    apiSchemaAdapterFactory: () => new UsdImagingCollectionAPIAdapter() },
  { typeName: 'UsdImagingMeshAdapter', isInternal: true, primTypeName: 'Mesh',
    primAdapterFactory: () => new UsdImagingMeshAdapter() },
])

// SdrRegistry finds the sdrGlslfx parser plugin through PlugRegistry
// (pxr/usdImaging/plugin/sdrGlslfx/plugInfo.json), as the reference build
// does; the import above registers it.

const fixtures = new URL('./fixtures/materials/', import.meta.url)
const fixtureDir = fileURLToPath(fixtures).replace(/\/$/, '')

/** The C++ name VtValue::GetTypeName reports for a value type. */
function cppTypeName(name: string): string {
  if (name.endsWith('[]')) return `VtArray<${cppTypeName(name.slice(0, -2))}>`
  switch (name) {
    case 'token': return 'TfToken'
    case 'std::string': return 'string'
    case 'dictionary': return 'VtDictionary'
  }
  return name
}

/** TfStringify of a held value: GfVec as "(x, y)", VtArray as "[a, b]",
 *  SdfAssetPath as "@path@", VtDictionary as "{'k': v}". */
function formatValue(value: unknown): string {
  if (value instanceof VtValue) return value.IsEmpty() ? '' : formatValue(value.UncheckedGet())
  if (value instanceof VtArray) return `[${value.toArray().map(formatValue).join(', ')}]`
  if (value instanceof VtDictionary) {
    return `{${[...value].map(([k, v]) => `'${k}': ${formatValue(v)}`).join(', ')}}`
  }
  if (value instanceof SdfAssetPath) return `@${value.getAssetPath()}@`
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value && typeof value === 'object' && 'data' in value && 'dimension' in value) {
    return `(${(value as { data: readonly number[] }).data.map(formatValue).join(', ')})`
  }
  return String(value)
}

/** The native capture's _Print */
function print(ds: HdDataSourceBase | undefined, level: number): string {
  const indent = '\t'.repeat(level)
  let s = ''
  if (ds instanceof HdContainerDataSource) {
    const names = [...ds.getNames()].sort()
    for (const name of names) {
      const child = ds.Get(name)
      if (child) {
        s += `${indent}[${name}]\n`
        s += print(child, level + 1)
      }
    }
  } else if (ds instanceof HdVectorDataSource) {
    for (let i = 0; i < ds.getNumElements(); ++i) {
      s += `${indent}[${i}]\n`
      s += print(ds.getElement(i), level + 1)
    }
  } else if (ds instanceof HdSampledDataSource) {
    let value = ds.GetValue(0)
    let typeName: string
    if (value instanceof VtValue) {
      typeName = value.IsEmpty() ? 'void' : cppTypeName(value.getType().getTypeName())
    } else {
      // A typed retained data source keeps its Vt type.
      const valueType = (ds as { valueType?: { getTypeName(): string } }).valueType
      typeName = valueType ? cppTypeName(valueType.getTypeName())
        : value instanceof VtArray ? `VtArray<${cppTypeName(value.getElementType().getTypeName())}>`
          : `<untyped ${typeof value}>`
    }
    s += `${indent}${typeName} ${formatValue(value)}`
    if (value instanceof VtValue && !value.IsEmpty()) value = value.UncheckedGet()
    if (value instanceof SdfAssetPath) {
      s += ` resolved=${value.getResolvedPath().replace(fixtureDir, '<fixture>')}`
    }
    s += '\n'
  } else {
    s += `${indent}NULL\n`
  }
  return s
}

/** The native capture's _PrintScene */
function printScene(si: HdSceneIndexBase, names: string[]): string {
  let s = ''
  for (const path of new HdSceneIndexPrimView(si)) {
    const prim = si.getPrim(path)
    let header = false
    for (const name of names) {
      const ds = prim.dataSource?.Get(name)
      if (!ds) continue
      if (!header) {
        s += `${path} type=${prim.primType}\n`
        header = true
      }
      s += `\t[${name}]\n`
      s += print(ds, 2)
    }
  }
  return s
}

/** The native capture's main */
async function capture(scene: string): Promise<string> {
  const stage = await UsdStage.open(fileURLToPath(new URL(`${scene}.usda`, fixtures)))
  if (!stage) throw new Error(`cannot open ${scene}.usda`)
  const stageSi = UsdImagingStageSceneIndex.new()
  stageSi.SetStage(stage)
  stageSi.SetTime(new UsdTimeCode(0))

  let s = '# UsdImagingStageSceneIndex\n'
  s += printScene(stageSi, [
    HdMaterialSchema.getSchemaToken(),
    UsdImagingMaterialBindingsSchema.getSchemaToken()])

  const flattening = HdFlatteningSceneIndex.new(
    stageSi,
    HdRetainedContainerDataSource.new(
      [UsdImagingMaterialBindingsSchema.getSchemaToken()],
      [HdMakeDataSourceContainingFlattenedDataSourceProvider.Make(
        UsdImagingFlattenedMaterialBindingsDataSourceProvider)]))

  s += '# HdFlatteningSceneIndex\n'
  s += printScene(flattening, [UsdImagingMaterialBindingsSchema.getSchemaToken()])

  const resolving = UsdImagingMaterialBindingsResolvingSceneIndex.new(flattening, undefined)

  s += '# UsdImagingMaterialBindingsResolvingSceneIndex\n'
  s += printScene(resolving, [HdMaterialBindingsSchema.getSchemaToken()])
  s += 'OK\n'
  return s
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/** Compares two printed lines: the text with numbers replaced must match,
 *  and the numbers must agree to a float tolerance. */
function sameLine(actual: string, expected: string): boolean {
  if (actual.replace(NUMBER, '#') !== expected.replace(NUMBER, '#')) return false
  const a = actual.match(NUMBER) ?? []
  const e = expected.match(NUMBER) ?? []
  return a.every((x, i) => {
    const y = Number(e[i])
    const v = Number(x)
    if (Math.abs(y) > 1e15) return x === e[i]
    return Math.abs(v - y) <= 1e-6 * Math.max(1, Math.abs(y))
  })
}

/** The sourceAsset shader's Sdr identifier: <hash><subIdentifier><system>. */
const ASSET_IDENTIFIER = /^(\t+(?:TfToken )?)(?:\d+|<assetHash>)<><glslfx>$/

function compare(actual: string, expected: string): string[] {
  const a = actual.split('\n')
  const e = expected.split('\n')
  const diffs: string[] = []
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    const al = a[i] ?? '<missing>'
    const el = e[i] ?? '<missing>'
    if (ASSET_IDENTIFIER.test(el) && ASSET_IDENTIFIER.test(al)) continue
    if (!sameLine(al, el)) {
      diffs.push(`line ${i + 1}: expected ${JSON.stringify(el)} got ${JSON.stringify(al)}`)
      if (diffs.length > 20) break
    }
  }
  return diffs
}

function section(text: string, title: string): string {
  const start = text.indexOf(`# ${title}\n`)
  const end = text.indexOf('\n#', start + 1)
  return text.slice(start, end < 0 ? undefined : end + 1)
}

describe('testUsdImagingStageSceneIndexContents (materials)', () => {
  for (const scene of ['materialNetwork', 'materialBindings']) {
    const expected = readFileSync(new URL(`${scene}.typed.txt`, fixtures), 'utf8')

    it(`${scene}: material and usdMaterialBindings data sources match the reference build`, async () => {
      const actual = await capture(scene)
      expect(compare(section(actual, 'UsdImagingStageSceneIndex'),
        section(expected, 'UsdImagingStageSceneIndex'))).toEqual([])
    })

    it(`${scene}: flattened usdMaterialBindings match the reference build`, async () => {
      const actual = await capture(scene)
      expect(compare(section(actual, 'HdFlatteningSceneIndex'),
        section(expected, 'HdFlatteningSceneIndex'))).toEqual([])
    })

    // The materialBindings scene's collection bindings resolve through the
    // collections membershipExpression of UsdImagingCollectionAPIAdapter;
    // see the test name for the current gap.
    it(`${scene}: resolved hd materialBindings match the reference build${scene === 'materialBindings'
      ? ' (GAP: CollectionAPI membershipExpression differs from the reference, e.g. "(+ /World/B// - //*.*) + /World/C// - ..." for "(/World/B// - //*.*) + (/World/C// - //*.*) - /World/C/Leaf//", so /World/B is not matched)'
      : ''}`, async () => {
      const actual = await capture(scene)
      expect(compare(section(actual, 'UsdImagingMaterialBindingsResolvingSceneIndex'),
        section(expected, 'UsdImagingMaterialBindingsResolvingSceneIndex'))).toEqual([])
    })
  }

  it('materialNetwork: HdDebugPrintDataSource of the material prim matches testUsdImagingStageSceneIndexContents', async () => {
    const contents = readFileSync(new URL('materialNetwork.contents.txt', fixtures), 'utf8')
    const start = contents.indexOf('</Looks/Mat> type = material\n')
    const end = (i: number) => (i < 0 ? undefined : i + 1)
    const block = contents.slice(start, end(contents.indexOf('\n<', start + 1)))
    const materialStart = block.indexOf('\t[material]\n')
    const expectedMaterial = block.slice(materialStart, end(block.indexOf('\n\t[', materialStart + 1)))

    const stage = (await UsdStage.open(fileURLToPath(new URL('materialNetwork.usda', fixtures))))!
    const stageSi = UsdImagingStageSceneIndex.new()
    stageSi.SetStage(stage)
    stageSi.SetTime(UsdTimeCode.EarliestTime())
    const prim = stageSi.getPrim('/Looks/Mat')
    expect(prim.primType).toBe('material')
    const actual = '\t[material]\n' + HdDebugPrintDataSource(prim.dataSource?.Get('material'), 2)
    expect(compare(actual, expectedMaterial)).toEqual([])
  })
})
