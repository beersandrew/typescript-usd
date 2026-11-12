// The hdsi scene indices appended by Storm's scene index plugins
// (OpenUSD 26.11.1 pxr/imaging/hdSt/*SceneIndexPlugin.cpp), configured as
// those plugins configure them, over the retained scenes that
// the fixtures/stormSceneIndices capture builds. OpenUSD has no testenv test
// for these scene indices; expected values are captured from the
// OpenUSD 26.11.1 build (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MaterialBindingSchema as HdMaterialBindingSchema,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  MaterialBindingsSchemaTokens as HdMaterialBindingsSchemaTokens,
  MaterialConnectionSchema as HdMaterialConnectionSchema,
  MaterialNetworkSchema as HdMaterialNetworkSchema,
  MaterialNodeSchema as HdMaterialNodeSchema,
  MaterialSchema as HdMaterialSchema,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  SceneIndexPluginRegistry as HdSceneIndexPluginRegistry,
  Tokens as HdTokens,
  VectorDataSource as HdVectorDataSource,
} from 'typescript-usd/hd'
import type {
  AddedPrimEntry,
  DataSourceBase as HdDataSourceBase,
  DirtiedPrimEntry,
  RemovedPrimEntry,
  SceneIndexBase as HdSceneIndexBase,
  SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import { Value as VtValue, ValueTypes as VtValueTypes, Dictionary as VtDictionary } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
// The sdrGlslfx parser plugin SdrRegistry finds through Plug.
import 'typescript-usd/sdrGlslfx'
import {
  MaterialBindingResolvingSceneIndex as HdsiMaterialBindingResolvingSceneIndex,
  MaterialPrimvarTransferSceneIndex as HdsiMaterialPrimvarTransferSceneIndex,
  NodeIdentifierResolvingSceneIndex as HdSiNodeIdentifierResolvingSceneIndex,
  UnboundMaterialPruningSceneIndex as HdsiUnboundMaterialPruningSceneIndex,
  UnboundMaterialPruningSceneIndexTokens as HdsiUnboundMaterialPruningSceneIndexTokens,
} from 'typescript-usd/hdsi'
import 'typescript-usd/hdSt'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expected = readOracleFixture(new URL('./fixtures/stormSceneIndices/expected.json', import.meta.url)) as any

const V = <T>(value: T) => HdRetainedTypedSampledDataSource.new(value)
const C = (entries: Record<string, HdDataSourceBase>) =>
  HdRetainedContainerDataSource.new(Object.keys(entries), Object.values(entries))

// The capture's _Value
function _Value(value: unknown): unknown {
  let v = value
  if (v instanceof VtValue) v = v.IsEmpty() ? undefined : v.Get<unknown>()
  if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') return v
  if (v instanceof HdDataSourceLocator) return v.GetString()
  if (Array.isArray(v)) return v.map(_Value)
  if (v instanceof SdfAssetPath) return v.getAssetPath()
  if (v instanceof VtDictionary) return '<VtDictionary>'
  return '<unknown>'
}

// The capture's _Dump
function _Dump(ds: HdDataSourceBase | undefined): unknown {
  if (ds instanceof HdContainerDataSource) {
    const o: Record<string, unknown> = {}
    for (const name of ds.getNames()) {
      const child = ds.Get(name)
      if (child) o[name] = _Dump(child)
    }
    return o
  }
  if (ds instanceof HdVectorDataSource) {
    const a: unknown[] = []
    for (let i = 0; i < ds.getNumElements(); ++i) a.push(_Dump(ds.getElement(i)))
    return a
  }
  if (ds instanceof HdSampledDataSource) return _Value(ds.GetValue(0))
  return null
}

// The capture's _Prim
function _Prim(si: HdSceneIndexBase, path: string): unknown {
  const prim = si.getPrim(path)
  return {
    primType: prim.primType,
    hasDataSource: prim.dataSource !== undefined,
    names: [...(prim.dataSource?.getNames() ?? [])].sort(),
    dataSource: _Dump(prim.dataSource),
  }
}

const _Binding = (p: string) => new HdMaterialBindingSchema.Builder().setPath(V(p)).build()

const _Primvar = (value: string) => new HdPrimvarSchema.Builder()
  .setPrimvarValue(V(value))
  .setInterpolation(HdPrimvarSchema.buildInterpolationDataSource(HdPrimvarSchemaTokens.constant))
  .build()

describe('HdsiMaterialBindingResolvingSceneIndex (HdSt_MaterialBindingResolvingSceneIndexPlugin)', () => {
  const input = HdRetainedSceneIndex.new()
  input.addPrims([
    { primPath: '/PreviewAndAll', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({
        [HdTokens.preview]: _Binding('/Mats/Preview'),
        [HdMaterialBindingsSchemaTokens.allPurpose]: _Binding('/Mats/All') }) }) },
    { primPath: '/AllOnly', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({
        [HdMaterialBindingsSchemaTokens.allPurpose]: _Binding('/Mats/All') }) }) },
    { primPath: '/FullOnly', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({ full: _Binding('/Mats/Full') }) }) },
    { primPath: '/NoBindings', primType: HdPrimTypeTokens.mesh, dataSource: C({ other: V('value') }) },
  ])
  const si = HdsiMaterialBindingResolvingSceneIndex.new(
    input, [HdTokens.preview, HdMaterialBindingsSchemaTokens.allPurpose],
    HdMaterialBindingsSchemaTokens.allPurpose)
  const e = expected.materialBindingResolving

  for (const path of ['/PreviewAndAll', '/AllOnly', '/FullOnly', '/NoBindings', '/Missing']) {
    it(`resolves ${path}`, () => {
      expect(_Prim(si, path)).toEqual(e[path])
    })
  }
  it('passes the topology through', () => {
    expect([...si.getChildPrimPaths('/')].sort()).toEqual([...e.children].sort())
  })
})

// The capture's _glslfxSource
const _glslfxSource = [
  '-- glslfx version 0.1',
  '',
  '-- configuration',
  '{',
  '    "parameters": {',
  '        "roughness": {',
  '            "default": 0.5',
  '        }',
  '    },',
  '    "techniques": {',
  '        "default": {',
  '            "surfaceShader": {',
  '                "source": [ "Test.Surface" ]',
  '            }',
  '        }',
  '    }',
  '}',
  '',
  '-- glsl Test.Surface',
  '',
  'vec4 surfaceShader(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord)',
  '{',
  '    return color;',
  '}',
  '',
].join('\n')

const _Node = (
  nodeIdentifier: HdDataSourceBase | undefined,
  nodeTypeInfo: HdContainerDataSource | undefined,
) => new HdMaterialNodeSchema.Builder()
  .setNodeIdentifier(nodeIdentifier as never)
  .setNodeTypeInfo(nodeTypeInfo)
  .build()

describe('HdSiNodeIdentifierResolvingSceneIndex (HdSt_NodeIdentifierResolvingSceneIndexPlugin)', () => {
  // VtValue(std::string("surface")), as the capture builds it.
  const sdrMetadata = new VtDictionary([['role', VtValue.create('surface', VtValueTypes.string)]])
  const nodes = C({
    FromSourceCode: _Node(undefined, C({
      implementationSource: V('sourceCode'),
      'glslfx:sourceCode': V(_glslfxSource),
      sdrMetadata: V(sdrMetadata) })),
    AlreadyIdentified: _Node(V('UsdPreviewSurface'), C({
      implementationSource: V('sourceCode'),
      'glslfx:sourceCode': V(_glslfxSource) })),
    EmptySourceCode: _Node(undefined, C({
      implementationSource: V('sourceCode') })),
    OtherSourceType: _Node(undefined, C({
      implementationSource: V('sourceCode'),
      'osl:sourceCode': V(_glslfxSource) })),
    NoTypeInfo: _Node(undefined, undefined),
  })
  const network = new HdMaterialNetworkSchema.Builder()
    .setNodes(nodes)
    .setTerminals(C({
      [HdMaterialTerminalTokens.surface]: new HdMaterialConnectionSchema.Builder()
        .setUpstreamNodePath(V('FromSourceCode'))
        .setUpstreamNodeOutputName(V('surface'))
        .build() }))
    .build()
  const input = HdRetainedSceneIndex.new()
  input.addPrims([
    { primPath: '/Mat', primType: HdPrimTypeTokens.material, dataSource: C({
      [HdMaterialSchema.getSchemaToken()]: C({ '': network }) }) },
    { primPath: '/NotAMaterial', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialSchema.getSchemaToken()]: C({ '': network }) }) },
  ])
  const si = HdSiNodeIdentifierResolvingSceneIndex.new(input, 'glslfx')
  const e = expected.nodeIdentifierResolving

  it('sets the display name', () => {
    expect(si.getDisplayName()).toBe(e.displayName)
  })
  it('leaves non-material prims alone', () => {
    expect(_Prim(si, '/NotAMaterial')).toEqual(e['/NotAMaterial'])
  })
  it('resolves the nodeIdentifier of a glslfx sourceCode node and leaves the other nodes', () => {
    expect(_Prim(si, '/Mat')).toEqual(e['/Mat'])
  })
})

describe('HdsiMaterialPrimvarTransferSceneIndex (HdSt_MaterialPrimvarTransferSceneIndexPlugin)', () => {
  const input = HdRetainedSceneIndex.new()
  input.addPrims([
    { primPath: '/Geo', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({
        [HdMaterialBindingsSchemaTokens.allPurpose]: _Binding('/Mat') }),
      [HdPrimvarsSchema.getSchemaToken()]: C({
        displayColor: _Primvar('geoColor'),
        geoOnly: _Primvar('geoOnlyValue') }) }) },
    { primPath: '/GeoNoPrimvars', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({
        [HdMaterialBindingsSchemaTokens.allPurpose]: _Binding('/Mat') }) }) },
    { primPath: '/GeoEmptyBinding', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({ full: _Binding('/Mat') }) }) },
    { primPath: '/GeoUnbound', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdPrimvarsSchema.getSchemaToken()]: C({ displayColor: _Primvar('geoColor') }) }) },
    { primPath: '/Mat', primType: HdPrimTypeTokens.material, dataSource: C({
      [HdPrimvarsSchema.getSchemaToken()]: C({
        displayColor: _Primvar('matColor'),
        matOnly: _Primvar('matOnlyValue') }) }) },
  ])
  const si = HdsiMaterialPrimvarTransferSceneIndex.new(input)
  const e = expected.materialPrimvarTransfer

  for (const path of ['/Geo', '/GeoNoPrimvars', '/GeoEmptyBinding', '/GeoUnbound', '/Mat']) {
    it(`transfers material primvars to ${path}`, () => {
      expect(_Prim(si, path)).toEqual(e[path])
    })
  }
})

class _Recorder implements HdSceneIndexObserver {
  notices: unknown[] = []
  primsAdded(_s: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this.notices.push({ added: entries.map((e) => [e.primPath, e.primType]) })
  }
  primsRemoved(_s: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    this.notices.push({ removed: entries.map((e) => e.primPath) })
  }
  primsDirtied(_s: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this.notices.push({ dirtied: entries.map((e) =>
      [e.primPath, [...e.dirtyLocators].map((l) => l.GetString())]) })
  }
  primsRenamed(): void {}
}

function _Types(si: HdSceneIndexBase, paths: string[]): Record<string, [string, boolean]> {
  const o: Record<string, [string, boolean]> = {}
  for (const p of paths) {
    const prim = si.getPrim(p)
    o[p] = [prim.primType, prim.dataSource !== undefined]
  }
  return o
}

function _Bindings(allPurpose: string | undefined, preview: string | undefined): HdContainerDataSource {
  const entries: Record<string, HdDataSourceBase> = {}
  if (allPurpose) entries[HdMaterialBindingsSchemaTokens.allPurpose] = _Binding(allPurpose)
  if (preview) entries[HdTokens.preview] = _Binding(preview)
  return C({ [HdMaterialBindingsSchema.getSchemaToken()]: C(entries) })
}

describe('HdsiUnboundMaterialPruningSceneIndex (HdSt_UnboundMaterialPruningSceneIndexPlugin)', () => {
  const e = expected.unboundMaterialPruning
  const matDs = C({ marker: V('material') })
  const input = HdRetainedSceneIndex.new()
  input.addPrims([
    { primPath: '/World', primType: '', dataSource: _Bindings('/Mats/Xform', undefined) },
    { primPath: '/World/Geo', primType: HdPrimTypeTokens.mesh, dataSource: _Bindings('/Mats/A', '/Mats/B') },
    { primPath: '/World/GeoFull', primType: HdPrimTypeTokens.mesh, dataSource: C({
      [HdMaterialBindingsSchema.getSchemaToken()]: C({ full: _Binding('/Mats/Full') }) }) },
    { primPath: '/Mats/A', primType: HdPrimTypeTokens.material, dataSource: matDs },
    { primPath: '/Mats/B', primType: HdPrimTypeTokens.material, dataSource: matDs },
    { primPath: '/Mats/C', primType: HdPrimTypeTokens.material, dataSource: matDs },
    { primPath: '/Mats/Full', primType: HdPrimTypeTokens.material, dataSource: matDs },
    { primPath: '/Mats/Xform', primType: HdPrimTypeTokens.material, dataSource: matDs },
  ])
  const inputArgs = C({
    [HdsiUnboundMaterialPruningSceneIndexTokens.materialBindingPurposes]:
      V([HdTokens.preview, HdMaterialBindingsSchemaTokens.allPurpose]) })
  const si = HdsiUnboundMaterialPruningSceneIndex.new(input, inputArgs)
  const paths = [
    '/World', '/World/Geo', '/World/GeoFull', '/World/Geo2', '/Mats/A', '/Mats/B', '/Mats/C',
    '/Mats/D', '/Mats/Full', '/Mats/Xform']

  it('prunes unbound materials found when populating', () => {
    expect(_Types(si, paths)).toEqual(e.initial)
  })

  it('tracks bindings through added, dirtied and removed notices', () => {
    const recorder = new _Recorder()
    si.addObserver(recorder)
    input.addPrims([{ primPath: '/World/Geo2', primType: HdPrimTypeTokens.mesh, dataSource: _Bindings('/Mats/C', undefined) }])
    input.addPrims([{ primPath: '/Mats/D', primType: HdPrimTypeTokens.material, dataSource: matDs }])
    input.addPrims([
      { primPath: '/Mats/E', primType: HdPrimTypeTokens.material, dataSource: matDs },
      { primPath: '/World/Geo3', primType: HdPrimTypeTokens.mesh, dataSource: _Bindings(undefined, '/Mats/E') }])
    expect(_Types(si, ['/World/Geo2', '/Mats/C', '/Mats/D', '/Mats/E', '/World/Geo3'])).toEqual(e.afterAdds)
    input.addPrims([{ primPath: '/World/Geo2', primType: HdPrimTypeTokens.mesh, dataSource: _Bindings('/Mats/D', undefined) }])
    input.dirtyPrims([{ primPath: '/World/Geo2',
      dirtyLocators: new HdDataSourceLocatorSet([HdMaterialBindingsSchema.getDefaultLocator()]) }])
    input.dirtyPrims([{ primPath: '/World/Geo',
      dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('primvars')]) }])
    expect(_Types(si, ['/World/Geo2', '/Mats/D'])).toEqual(e.afterDirty)
    input.removePrims([{ primPath: '/Mats/A' }])
    input.addPrims([{ primPath: '/Mats/A', primType: HdPrimTypeTokens.material, dataSource: matDs }])
    expect(_Types(si, ['/Mats/A'])).toEqual(e.afterReAdd)
    expect(recorder.notices).toEqual(e.notices)
    si.removeObserver(recorder)
  })
})

describe('hdSt scene index plugin registration', () => {
  it('registers the ported plugins for "GL" in the order OpenUSD runs them', () => {
    const ported = new Set(HdSceneIndexPluginRegistry.GetInstance()
      .loadAndGetSceneIndexPluginIds('GL', '')
      .filter((id) => id.startsWith('HdSt_')))
    const native = (expected.stormPluginIds as string[]).filter((id) => ported.has(id))
    expect(HdSceneIndexPluginRegistry.GetInstance()
      .loadAndGetSceneIndexPluginIds('GL', '')
      .filter((id) => id.startsWith('HdSt_'))).toEqual(native)
  })
  it('registers every hdSt scene index plugin OpenUSD registers for "GL"', () => {
    expect(HdSceneIndexPluginRegistry.GetInstance()
      .loadAndGetSceneIndexPluginIds('GL', '')
      .filter((id) => id.startsWith('HdSt_'))).toEqual(expected.stormPluginIds)
  })
})
