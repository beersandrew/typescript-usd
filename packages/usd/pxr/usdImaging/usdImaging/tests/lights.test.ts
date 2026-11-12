// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Light, light filter, volume and camera back plate adapters (lightAdapter,
// the per-light adapters, lightAPIAdapter, lightFilterAdapter,
// pluginLightFilterAdapter, volumeAdapter + dataSourceVolume,
// backPlateAPIAdapter) checked against the OpenUSD 26.11.1 reference build
// for the scenes in fixtures/lights (FIXTURES.md):
//
// - <scene>.contents.txt (testUsdImagingStageSceneIndexContents,
//   pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp):
//   the prims and prim types of UsdImagingStageSceneIndex, and the
//   data source names under [light];
// - <scene>.typed.txt (the native capture): the light, material,
//   volumeFieldBinding and camera backPlate data sources with the VtValue
//   type of every value, plus every light parameter value
//   HdSceneIndexAdapterSceneDelegate::GetLightParamValue may ask for.
//
// This file prints the same typed format from this repository's
// UsdImagingStageSceneIndex (the native capture ported to TypeScript) and compares
// the parsed trees. Values are compared as printed strings; type names are
// compared where the data source returns a VtValue (a plain typed value has
// no Vt type in this port).
//
// The adapters are registered here with their plugInfo.json entries
// (pxr/usdImaging/usdImaging/plugInfo.json), before the registry is first
// used, together with the mesh, sphere and camera adapters the scenes need.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CameraSchema as HdCameraSchema,
  CameraSchemaTokens as HdCameraSchemaTokens,
  ContainerDataSource as HdContainerDataSource,
  LightSchema as HdLightSchema,
  LightTokens as HdLightTokens,
  MaterialSchema as HdMaterialSchema,
  SampledDataSource as HdSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  Tokens as HdTokens,
  VectorDataSource as HdVectorDataSource,
  VolumeFieldBindingSchema as HdVolumeFieldBindingSchema,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { TfStringify } from 'typescript-usd/tf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Value as VtValue } from 'typescript-usd/vt'
import { UsdImagingAdapterRegistry } from '../src/adapterRegistry.ts'
import { UsdImagingBackPlateAPIAdapter } from '../src/backPlateAPIAdapter.ts'
import { UsdImagingCameraAdapter } from '../src/cameraAdapter.ts'
import { UsdImagingCylinderLightAdapter } from '../src/cylinderLightAdapter.ts'
import { UsdImagingDiskLightAdapter } from '../src/diskLightAdapter.ts'
import { UsdImagingDistantLightAdapter } from '../src/distantLightAdapter.ts'
import { UsdImagingDomeLight_1Adapter } from '../src/domeLight_1Adapter.ts'
import { UsdImagingDomeLightAdapter } from '../src/domeLightAdapter.ts'
import { UsdImagingGeometryLightAdapter } from '../src/geometryLightAdapter.ts'
import { UsdImagingLightAdapter } from '../src/lightAdapter.ts'
import { UsdImagingLightAPIAdapter } from '../src/lightAPIAdapter.ts'
import { UsdImagingLightFilterAdapter } from '../src/lightFilterAdapter.ts'
import { UsdImagingMeshAdapter } from '../src/meshAdapter.ts'
import { UsdImagingPluginLightAdapter } from '../src/pluginLightAdapter.ts'
import { UsdImagingPluginLightFilterAdapter } from '../src/pluginLightFilterAdapter.ts'
import { UsdImagingPortalLightAdapter } from '../src/portalLightAdapter.ts'
import { UsdImagingRectLightAdapter } from '../src/rectLightAdapter.ts'
import { UsdImagingSphereAdapter } from '../src/sphereAdapter.ts'
import { UsdImagingSphereLightAdapter } from '../src/sphereLightAdapter.ts'
import { UsdImagingStageSceneIndex } from '../src/stageSceneIndex.ts'
import { UsdImagingVolumeAdapter } from '../src/volumeAdapter.ts'
// usdVolImaging's field adapters (usdVolImaging/plugInfo.json), loaded as
// the plugin is natively.
import 'typescript-usd/usdVolImaging'

UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingLightAdapter', isInternal: true, primTypeName: 'LightAPI', includeDerivedPrimTypes: true, primAdapterFactory: () => new UsdImagingLightAdapter() },
  { typeName: 'UsdImagingLightAPIAdapter', isInternal: true, apiSchemaName: 'LightAPI', apiSchemaAdapterFactory: () => new UsdImagingLightAPIAdapter() },
  { typeName: 'UsdImagingLightFilterAdapter', isInternal: true, primTypeName: 'LightFilter', includeDerivedPrimTypes: true, primAdapterFactory: () => new UsdImagingLightFilterAdapter() },
  { typeName: 'UsdImagingDomeLightAdapter', isInternal: true, primTypeName: 'DomeLight', primAdapterFactory: () => new UsdImagingDomeLightAdapter() },
  { typeName: 'UsdImagingDomeLight_1Adapter', isInternal: true, primTypeName: 'DomeLight_1', primAdapterFactory: () => new UsdImagingDomeLight_1Adapter() },
  { typeName: 'UsdImagingRectLightAdapter', isInternal: true, primTypeName: 'RectLight', primAdapterFactory: () => new UsdImagingRectLightAdapter() },
  { typeName: 'UsdImagingSphereLightAdapter', isInternal: true, primTypeName: 'SphereLight', primAdapterFactory: () => new UsdImagingSphereLightAdapter() },
  { typeName: 'UsdImagingCylinderLightAdapter', isInternal: true, primTypeName: 'CylinderLight', primAdapterFactory: () => new UsdImagingCylinderLightAdapter() },
  { typeName: 'UsdImagingDiskLightAdapter', isInternal: true, primTypeName: 'DiskLight', primAdapterFactory: () => new UsdImagingDiskLightAdapter() },
  { typeName: 'UsdImagingDistantLightAdapter', isInternal: true, primTypeName: 'DistantLight', primAdapterFactory: () => new UsdImagingDistantLightAdapter() },
  { typeName: 'UsdImagingPluginLightAdapter', isInternal: true, primTypeName: 'PluginLight', primAdapterFactory: () => new UsdImagingPluginLightAdapter() },
  { typeName: 'UsdImagingGeometryLightAdapter', isInternal: true, primTypeName: 'GeometryLight', primAdapterFactory: () => new UsdImagingGeometryLightAdapter() },
  { typeName: 'UsdImagingPortalLightAdapter', isInternal: true, primTypeName: 'PortalLight', primAdapterFactory: () => new UsdImagingPortalLightAdapter() },
  { typeName: 'UsdImagingPluginLightFilterAdapter', isInternal: true, primTypeName: 'PluginLightFilter', primAdapterFactory: () => new UsdImagingPluginLightFilterAdapter() },
  { typeName: 'UsdImagingVolumeAdapter', isInternal: true, primTypeName: 'Volume', primAdapterFactory: () => new UsdImagingVolumeAdapter() },
  { typeName: 'UsdImagingBackPlateAPIAdapter', isInternal: true, apiSchemaName: 'BackPlateAPI', apiSchemaAdapterFactory: () => new UsdImagingBackPlateAPIAdapter() },
  { typeName: 'UsdImagingMeshAdapter', isInternal: true, primTypeName: 'Mesh', primAdapterFactory: () => new UsdImagingMeshAdapter() },
  { typeName: 'UsdImagingSphereAdapter', isInternal: true, primTypeName: 'Sphere', primAdapterFactory: () => new UsdImagingSphereAdapter() },
  { typeName: 'UsdImagingCameraAdapter', isInternal: true, primTypeName: 'Camera', primAdapterFactory: () => new UsdImagingCameraAdapter() },
])

const fixtures = new URL('./fixtures/lights/', import.meta.url)

/** The prim types of UsdImagingFieldAdapter subclasses' prims. */
const _fieldPrimTypes = ['openvdbAsset', 'field3dAsset']

/** The native capture's _LightParams */
const _lightParams = [
  HdLightTokens.angle, HdLightTokens.color,
  HdLightTokens.colorTemperature, HdLightTokens.diffuse,
  HdLightTokens.domeOffset, HdLightTokens.enableColorTemperature,
  HdLightTokens.exposure, HdLightTokens.height,
  HdLightTokens.intensity, HdLightTokens.length,
  HdLightTokens.normalize, HdLightTokens.radius,
  HdLightTokens.specular, HdLightTokens.textureFile,
  HdLightTokens.textureFormat, HdLightTokens.width,
  HdLightTokens.shapingFocus, HdLightTokens.shapingFocusTint,
  HdLightTokens.shapingConeAngle, HdLightTokens.shapingConeSoftness,
  HdLightTokens.shapingIesFile, HdLightTokens.shapingIesAngleScale,
  HdLightTokens.shapingIesNormalize, HdLightTokens.shadowEnable,
  HdLightTokens.shadowColor, HdLightTokens.shadowDistance,
  HdLightTokens.shadowFalloff, HdLightTokens.shadowFalloffGamma,
  HdTokens.filters, HdTokens.isLight, HdTokens.materialSyncMode,
  HdTokens.portals,
  'treatAsPoint', 'inputs:density', 'noSuchParam',
]

/** A printed value: the VtValue type name (when known) and the value text. */
interface Leaf { type?: string | undefined, value: string }

/** The shortest decimal that reads back as the same float32 (how
 *  TfStringify prints a float). */
function _FloatStr(value: number): string {
  for (let p = 1; p <= 9; ++p) {
    const s = Number(value.toPrecision(p))
    if (Math.fround(s) === Math.fround(value)) return String(s)
  }
  return String(value)
}

function _Str(value: unknown, type?: string): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number' && type === 'float') return _FloatStr(value)
  if (value instanceof SdfAssetPath) return `@${value.getAssetPath()}@`
  return TfStringify(value)
}

/** VtValue::GetTypeName spellings of this port's Vt type names that differ
 *  from the C++ type names (ArchGetDemangled). */
const _cxxTypeName: Record<string, string> = { token: 'TfToken', asset: 'SdfAssetPath', path: 'SdfPath' }

/** The native capture's _PrintValue */
function _PrintValue(value: unknown): Leaf {
  if (value instanceof VtValue) {
    const held = value.IsEmpty() ? undefined : value.UncheckedGet<unknown>()
    return { type: _cxxTypeName[value.getTypeName()] ?? value.getTypeName(), value: _Str(held, value.getTypeName()) }
  }
  // A plain typed value (no Vt type): an SdfPathVector, a token array, a
  // float, ... (string arrays print as the native capture prints SdfPathVector).
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
    return { value: `[${value.join(', ')}]` }
  }
  return { value: _Str(value) }
}

type Tree = { [name: string]: Tree | Leaf | 'NULL' }

/** The native capture's _Print */
function _Print(ds: HdDataSourceBase | undefined): Tree | Leaf | 'NULL' {
  if (ds instanceof HdContainerDataSource) {
    const tree: Tree = {}
    for (const name of [...ds.getNames()].sort()) {
      const child = ds.Get(name)
      if (child) tree[name] = _Print(child)
    }
    return tree
  } else if (ds instanceof HdVectorDataSource) {
    const tree: Tree = {}
    for (let i = 0; i < ds.getNumElements(); ++i) tree[String(i)] = _Print(ds.getElement(i))
    return tree
  } else if (ds instanceof HdSampledDataSource) {
    return _PrintValue(ds.GetValue(0))
  }
  return 'NULL'
}

interface PrimBlock { type: string, sections: Tree }

/** The native capture's main, on this repository's UsdImagingStageSceneIndex. */
async function capture(usdaPath: string): Promise<Map<string, PrimBlock>> {
  const stage = await UsdStage.open(usdaPath)
  if (!stage) throw new Error(`cannot open ${usdaPath}`)
  const si = UsdImagingStageSceneIndex.new()
  si.SetStage(stage)
  si.SetTime(new UsdTimeCode(0))
  const names = [HdLightSchema.getSchemaToken(), HdMaterialSchema.getSchemaToken(),
    HdVolumeFieldBindingSchema.getSchemaToken(), HdCameraSchema.getSchemaToken()]
  const result = new Map<string, PrimBlock>()
  for (const path of new HdSceneIndexPrimView(si)) {
    const prim = si.getPrim(path)
    if (!prim.dataSource) continue
    const sections: Tree = {}
    for (const name of names) {
      const ds = prim.dataSource.Get(name)
      if (!ds) continue
      if (name === HdCameraSchema.getSchemaToken()) {
        const plates = ds instanceof HdContainerDataSource ? ds.Get(HdCameraSchemaTokens.backPlate) : undefined
        sections[name] = plates ? { backPlate: _Print(plates) } : {}
        continue
      }
      sections[name] = _Print(ds)
      if (name === HdLightSchema.getSchemaToken()) {
        const params: Tree = {}
        for (const param of _lightParams) {
          const valueDs = ds instanceof HdContainerDataSource ? ds.Get(param) : undefined
          params[param] = valueDs instanceof HdSampledDataSource ? _PrintValue(valueDs.GetValue(0)) : 'NULL'
        }
        sections['light params'] = params
      }
    }
    if (Object.keys(sections).length) result.set(path, { type: prim.primType, sections })
  }
  return result
}

/** Parses the native capture's output. */
function parseTyped(text: string): Map<string, PrimBlock> {
  const lines = text.split('\n')
  const result = new Map<string, PrimBlock>()
  const i = { n: 0 }
  const leaf = (body: string): Leaf | 'NULL' => {
    if (body === 'NULL') return 'NULL'
    const sp = body.indexOf(' ')
    return sp < 0 ? { type: body, value: '' } : { type: body.slice(0, sp), value: body.slice(sp + 1) }
  }
  const parse = (level: number): Tree | Leaf | 'NULL' => {
    const tree: Tree = {}
    const indent = '\t'.repeat(level)
    while (i.n < lines.length) {
      const line = lines[i.n]!
      if (!line.startsWith(indent) || line.slice(level).startsWith('\t')) break
      const body = line.slice(level)
      const m = /^\[(.*)\]$/.exec(body)
      if (!m) { i.n++; return leaf(body) }
      i.n++
      tree[m[1]!] = parse(level + 1)
    }
    return tree
  }
  while (i.n < lines.length) {
    const m = /^(\/\S*) type=(.*)$/.exec(lines[i.n]!)
    i.n++
    if (!m) continue
    const sections: Tree = {}
    while (i.n < lines.length && lines[i.n]!.startsWith('\t[')) {
      const header = lines[i.n]!.slice(1)
      i.n++
      if (header === '[light] params') {
        const params: Tree = {}
        while (i.n < lines.length && lines[i.n]!.startsWith('\t\t')) {
          const pm = /^\t\t(\S+) = (.*)$/.exec(lines[i.n]!)!
          params[pm[1]!] = leaf(pm[2]!.startsWith('SdfPathVector') ? pm[2]!.replace(/^SdfPathVector /, 'SdfPathVector ') : pm[2]!)
          i.n++
        }
        sections['light params'] = params
      } else {
        sections[header.slice(1, -1)] = parse(2)
      }
    }
    result.set(m[1]!, { type: m[2]!, sections })
  }
  return result
}

/** Leaves where an unauthored asset-valued attribute whose schema fallback
 *  is @@ reads back as '' instead of SdfAssetPath @@; collected by align()
 *  and checked to be none. */
const assetFallbackGaps: string[] = []

/** Drops type names where `actual` has none (plain typed values) and
 *  resolved asset paths (the asset resolver is not part of this check). */
function align(expected: Tree | Leaf | 'NULL', actual: Tree | Leaf | 'NULL' | undefined): Tree | Leaf | 'NULL' {
  if (expected === 'NULL' || typeof expected !== 'object') return expected
  if ('value' in expected && typeof expected.value === 'string') {
    const e = expected as Leaf
    const a = actual as Leaf | undefined
    const value = e.value.replace(/ resolved=.*$/, '')
    if (e.type === 'SdfAssetPath' && value === '@@' && a && typeof a === 'object' &&
        'value' in a && a.type === 'SdfAssetPath' && a.value === '') {
      assetFallbackGaps.push(value)
      return a as Leaf
    }
    const leaf: Leaf = a && typeof a === 'object' && 'value' in a && a.type === undefined
      ? { value } : { type: e.type, value }
    return leaf
  }
  const out: Tree = {}
  for (const [k, v] of Object.entries(expected)) {
    out[k] = align(v, actual && typeof actual === 'object' && !('value' in actual) ? (actual as Tree)[k] : undefined)
  }
  return out
}

describe('light, volume and back plate adapters (fixtures/lights)', () => {
  for (const scene of ['lights', 'volume', 'backPlate']) {
    describe(`${scene}.usda`, async () => {
      const usda = new URL(`${scene}.usda`, fixtures).pathname
      const actual = await capture(usda)
      const expected = parseTyped(readFileSync(new URL(`${scene}.typed.txt`, fixtures), 'utf8'))

      // The prim types of every stage scene index prim.
      const contents = readFileSync(new URL(`${scene}.contents.txt`, fixtures), 'utf8')
      it('prim types match testUsdImagingStageSceneIndexContents', async () => {
        const stage = await UsdStage.open(usda)
        const si = UsdImagingStageSceneIndex.new()
        si.SetStage(stage!)
        const types: string[] = []
        for (const path of new HdSceneIndexPrimView(si)) {
          if (path !== '/') types.push(`<${path}> type = ${si.getPrim(path).primType}`)
        }
        const expectedTypes = [...contents.matchAll(/^<(.*)> type = (.*)$/gm)]
          .filter(m => m[1] !== '/').map(m => `<${m[1]}> type = ${m[2]}`)
        expect(types.sort()).toEqual(expectedTypes.sort())
      })

      // Volume field prims are imaged by usdVolImaging's
      // UsdImagingOpenVDBAssetAdapter / UsdImagingField3DAssetAdapter.
      const fieldPrims = [...contents.matchAll(/^<(.*)> type = (.*)$/gm)]
        .filter(m => _fieldPrimTypes.includes(m[2]!)).map(m => m[1]!)
      if (fieldPrims.length) {
        it('volume field prims (usdVolImaging field adapters) have their prim types', async () => {
          const stage = await UsdStage.open(usda)
          const si = UsdImagingStageSceneIndex.new()
          si.SetStage(stage!)
          const types = fieldPrims.map(path => `<${path}> type = ${si.getPrim(path).primType}`)
          const expectedTypes = [...contents.matchAll(/^<(.*)> type = (.*)$/gm)]
            .filter(m => _fieldPrimTypes.includes(m[2]!)).map(m => `<${m[1]}> type = ${m[2]}`)
          expect(types).toEqual(expectedTypes)
        })
      }

      for (const [path, block] of expected) {
        for (const section of Object.keys(block.sections)) {
          it(`${path} [${section}]`, () => {
            const a = actual.get(path)
            expect(a?.type).toBe(block.type)
            const e = block.sections[section]!
            const as = a?.sections[section]
            expect(as).toEqual(align(e, as))
          })
        }
      }

      // Runs after the section tests above, which collect the gaps.
      if (scene === 'backPlate') {
        it('unauthored asset-valued schema fallbacks read back as SdfAssetPath @@', () => {
          expect(assetFallbackGaps).toEqual([])
        })
      }
    })
  }
})
