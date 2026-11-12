// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/drawModeSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/drawModeStandin.cpp,
//  pxr/usdImaging/usdImaging/unloadedDrawModeSceneIndex.cpp
// Copyright 2022, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdImagingDrawModeSceneIndex, UsdImaging_DrawModeStandin and
// UsdImagingUnloadedDrawModeSceneIndex
// (pxr/usdImaging/usdImaging/drawModeSceneIndex.cpp, drawModeStandin.cpp,
// unloadedDrawModeSceneIndex.cpp) checked against captures from the OpenUSD
// 26.11.1 reference build (fixtures/drawModeSceneIndex, FIXTURES.md):
//
// - retained.json: an HdRetainedSceneIndex with the prims of the capture's
//   _BuildScene (rebuilt identically by _BuildScene below) filtered by the
//   unloaded draw mode and draw mode scene indices: every resulting prim
//   (type, children, data source), then the notices of the scenarios of
//   the capture's _RunNotices (rebuilt by _RunNotices below) and the final
//   scene.
// - stage.json: drawModes.usda through UsdImagingStageSceneIndex and the
//   draw mode scene index; only the stand-in prims are compared (the rest is
//   stage scene index content owned by other files).
//
// Data sources are walked into the capture's JSON shape (containers as
// objects, vectors as arrays, sampled data sources as {type, value}); values
// are compared numerically with a float tolerance. Where a TypeScript value
// does not carry its C++ type (a plain number or number[]), the compatible
// C++ types are accepted. Notices are compared per scenario step as
// multisets: the order of cards materials follows an std::unordered_map
// upstream.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ExtentSchema as HdExtentSchema,
  PurposeSchema as HdPurposeSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  VectorDataSource as HdVectorDataSource,
  VisibilitySchema as HdVisibilitySchema,
  XformSchema as HdXformSchema,
  type DataSourceBase as HdDataSourceBase,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import { Matrix4d as GfMatrix4d, Vec3d as GfVec3d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingAdapterRegistry } from '../src/adapterRegistry.ts'
import { UsdImagingDrawModeSceneIndex } from '../src/drawModeSceneIndex.ts'
import { UsdImagingGeomModelAPIAdapter } from '../src/geomModelAPIAdapter.ts'
import { UsdImagingGeomModelSchema, UsdImagingGeomModelSchemaTokens } from '../src/geomModelSchema.ts'
import { UsdImagingMeshAdapter } from '../src/meshAdapter.ts'
import { UsdImagingStageSceneIndex } from '../src/stageSceneIndex.ts'
import { UsdImagingUnloadedDrawModeSceneIndex } from '../src/unloadedDrawModeSceneIndex.ts'
import { UsdImagingUsdPrimInfoSchema } from '../src/usdPrimInfoSchema.ts'
import { UsdImagingUsdUpAxisSchema } from '../src/usdUpAxisSchema.ts'

UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingMeshAdapter', isInternal: true, primTypeName: 'Mesh', primAdapterFactory: () => new UsdImagingMeshAdapter() },
  { typeName: 'UsdImagingGeomModelAPIAdapter', isInternal: true, apiSchemaName: 'GeomModelAPI', apiSchemaAdapterFactory: () => new UsdImagingGeomModelAPIAdapter() },
])

const fixtures = new URL('./fixtures/drawModeSceneIndex/', import.meta.url)

function _Load(name: string): any {
  return JSON.parse(readFileSync(new URL(name, fixtures), 'utf8')).payload
}

// ---------------------------------------------------------------------------
// Data source -> capture JSON shape.

interface _Sampled { types: string[] | undefined; value: unknown }

const _anyNumber = ['int', 'float', 'double']
const _anyNumberArray = ['VtArray<int>', 'VtArray<float>', 'VtArray<double>']
const _anyString = ['TfToken', 'std::string', 'SdfPath']

function _CxxTypeName(tfTypeName: string): string {
  if (tfTypeName.endsWith('[]')) return `VtArray<${_CxxTypeName(tfTypeName.slice(0, -2))}>`
  switch (tfTypeName) {
    case 'token': return 'TfToken'
    case 'string': return 'std::string'
    default: return tfTypeName
  }
}

function _GfJson(v: unknown): unknown {
  if (v instanceof GfMatrix4d) return [...v.GetArray()]
  const gf = v as { dimension?: number; get?: (i: number) => number }
  if (typeof gf.get === 'function' && typeof gf.dimension === 'number') {
    return Array.from({ length: gf.dimension }, (_, i) => gf.get!(i))
  }
  return undefined
}

function _ValueJson(v: unknown): unknown {
  if (v instanceof SdfAssetPath) return v.getAssetPath()
  const gf = _GfJson(v)
  if (gf !== undefined) return gf
  if (v instanceof VtArray) {
    const a = v as VtArray<unknown>
    return Array.from({ length: a.size }, (_, i) => _ValueJson(a.get(i)))
  }
  if (Array.isArray(v)) return v.map(_ValueJson)
  return v
}

function _SampledJson(ds: HdSampledDataSource): _Sampled {
  let v = ds.GetValue(0)
  let types: string[] | undefined
  if (v instanceof VtValue) {
    types = [_CxxTypeName(v.getTypeName())]
    v = v.UncheckedGet<unknown>()
  } else if (v instanceof VtArray) {
    types = [`VtArray<${_CxxTypeName((v as VtArray<unknown>).getElementType().getTypeName())}>`]
  } else if (ds instanceof HdRetainedTypedSampledDataSource &&
      (ds.valueType as { getTypeName?: () => string } | undefined)?.getTypeName) {
    types = [_CxxTypeName((ds.valueType as { getTypeName: () => string }).getTypeName())]
  } else if (v instanceof SdfAssetPath) {
    types = ['SdfAssetPath']
  } else if (_GfJson(v) !== undefined) {
    types = [(v as object).constructor.name]
  } else if (typeof v === 'boolean') {
    types = ['bool']
  } else if (typeof v === 'number') {
    types = _anyNumber
  } else if (typeof v === 'string') {
    types = _anyString
  } else if (Array.isArray(v) && (v.length === 0 || typeof v[0] === 'number')) {
    types = _anyNumberArray
  }
  return { types, value: _ValueJson(v) }
}

/** A captured sampled data source: {type, value}. */
function _IsSampledJson(e: any): boolean {
  return typeof e === 'object' && e !== null && !Array.isArray(e) &&
    Object.keys(e).length === 2 && 'type' in e && 'value' in e &&
    typeof e.type === 'string'
}

function _Close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

function _ValuesEqual(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') return _Close(expected, actual)
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length &&
      expected.every((e, i) => _ValuesEqual(e, actual[i]))
  }
  return expected === actual
}

/** Compares the captured JSON of a data source with `ds`; appends
 *  differences to `errors`. `skip` names entries not compared. */
function _Compare(
  expected: any, ds: HdDataSourceBase | undefined, where: string,
  errors: string[], skip: ReadonlySet<string> = new Set(),
): void {
  if (expected === null) {
    if (ds !== undefined) errors.push(`${where}: expected null`)
    return
  }
  if (ds === undefined) {
    errors.push(`${where}: missing`)
    return
  }
  if (ds instanceof HdSampledDataSource) {
    if (!_IsSampledJson(expected)) {
      errors.push(`${where}: expected a container or vector, got a sampled data source`)
      return
    }
    const actual = _SampledJson(ds)
    if (expected.value && typeof expected.value === 'object' && 'unhandled' in expected.value) return
    if (actual.types && !actual.types.includes(expected.type)) {
      errors.push(`${where}: type ${actual.types.join('|')} != ${expected.type}`)
    }
    if (!_ValuesEqual(expected.value, actual.value)) {
      errors.push(`${where}: value ${JSON.stringify(actual.value)} != ${JSON.stringify(expected.value)}`)
    }
    return
  }
  if (ds instanceof HdVectorDataSource) {
    if (!Array.isArray(expected)) {
      errors.push(`${where}: unexpected vector`)
      return
    }
    if (ds.getNumElements() !== expected.length) {
      errors.push(`${where}: ${ds.getNumElements()} elements != ${expected.length}`)
      return
    }
    expected.forEach((e, i) => _Compare(e, ds.getElement(i), `${where}[${i}]`, errors))
    return
  }
  if (ds instanceof HdContainerDataSource) {
    if (typeof expected !== 'object' || Array.isArray(expected) || _IsSampledJson(expected)) {
      errors.push(`${where}: unexpected container`)
      return
    }
    const names = ds.getNames()
    const expectedNames = Object.keys(expected)
    if (JSON.stringify([...names].sort()) !== JSON.stringify([...expectedNames].sort())) {
      errors.push(`${where}: names ${JSON.stringify(names)} != ${JSON.stringify(expectedNames)}`)
    }
    for (const name of expectedNames) {
      if (skip.has(name)) continue
      _Compare(expected[name], ds.Get(name), `${where}/${name}`, errors)
    }
    return
  }
  errors.push(`${where}: unknown data source`)
}

interface _CapturedPrim { path: string; type: string; children: string[]; dataSource: any }

function _ComparePrims(
  expected: _CapturedPrim[], si: HdSceneIndexBase, errors: string[],
  filter: (path: string) => boolean = () => true,
): void {
  const actualPaths = new Set<string>()
  for (const path of new HdSceneIndexPrimView(si)) actualPaths.add(path)
  const expectedPaths = new Set(expected.map(p => p.path))
  for (const path of expectedPaths) {
    if (filter(path) && !actualPaths.has(path)) errors.push(`${path}: missing prim`)
  }
  for (const path of actualPaths) {
    if (filter(path) && !expectedPaths.has(path)) errors.push(`${path}: unexpected prim`)
  }
  for (const p of expected) {
    if (!filter(p.path) || !actualPaths.has(p.path)) continue
    const prim = si.getPrim(p.path)
    if (prim.primType !== p.type) errors.push(`${p.path}: type '${prim.primType}' != '${p.type}'`)
    const children = [...si.getChildPrimPaths(p.path)].sort()
    if (JSON.stringify(children) !== JSON.stringify([...p.children].sort())) {
      errors.push(`${p.path}: children ${JSON.stringify(children)} != ${JSON.stringify(p.children)}`)
    }
    _Compare(p.dataSource, prim.dataSource, p.path, errors)
  }
}

// ---------------------------------------------------------------------------
// The scenes of the native capture.

/** The native capture's _MutableContainer */
class _MutableContainer extends HdContainerDataSource {
  constructor(public inner: HdContainerDataSource) { super() }
  getNames(): string[] { return this.inner.getNames() }
  Get(name: string): HdDataSourceBase | undefined { return this.inner.Get(name) }
}

function _Tok(t: string): HdRetainedTypedSampledDataSource<string> {
  return new HdRetainedTypedSampledDataSource(t, VtValueTypes.token)
}
function _Bool(b: boolean): HdRetainedTypedSampledDataSource<boolean> {
  return new HdRetainedTypedSampledDataSource(b, VtValueTypes.bool)
}

interface _GeomModel {
  apply?: boolean
  drawMode?: string
  color?: GfVec3f
  cardGeometry?: string
  cardVisibility?: string
  textures?: Record<string, string>
}

/** The native capture's _GeomModelDs */
function _GeomModelDs(m: _GeomModel): HdContainerDataSource {
  const names: string[] = []
  const values: HdDataSourceBase[] = []
  names.push(UsdImagingGeomModelSchemaTokens.applyDrawMode)
  values.push(_Bool(m.apply ?? true))
  names.push(UsdImagingGeomModelSchemaTokens.drawMode)
  values.push(_Tok(m.drawMode ?? ''))
  if (m.color) {
    names.push(UsdImagingGeomModelSchemaTokens.drawModeColor)
    values.push(new HdRetainedTypedSampledDataSource(m.color, VtValueTypes.GfVec3f))
  }
  if (m.cardGeometry) {
    names.push(UsdImagingGeomModelSchemaTokens.cardGeometry)
    values.push(_Tok(m.cardGeometry))
  }
  if (m.cardVisibility) {
    names.push(UsdImagingGeomModelSchemaTokens.cardVisibility)
    values.push(_Tok(m.cardVisibility))
  }
  // std::map<TfToken, std::string> iterates in key order.
  for (const key of Object.keys(m.textures ?? {}).sort()) {
    names.push(key)
    values.push(HdRetainedTypedSampledDataSource.new(new SdfAssetPath(m.textures![key]!)))
  }
  return HdRetainedContainerDataSource.new(names, values)
}

const _min = new GfVec3d(-1, -2, -3)
const _max = new GfVec3d(4, 5, 6)

/** The native capture's _ModelPrimDs */
function _ModelPrimDs(m: _GeomModel, upAxis = '', unloaded = false): HdContainerDataSource {
  const names: string[] = []
  const values: HdDataSourceBase[] = []
  names.push(HdXformSchema.getSchemaToken())
  values.push(new HdXformSchema.Builder()
    .setMatrix(new HdRetainedTypedSampledDataSource(
      new GfMatrix4d(1.0).setTranslate(new GfVec3d(1, 2, 3)), VtValueTypes.GfMatrix4d) as never)
    .build())
  names.push(HdPurposeSchema.getSchemaToken())
  values.push(new HdPurposeSchema.Builder().setPurpose(_Tok('geometry')).build())
  names.push(HdVisibilitySchema.getSchemaToken())
  values.push(new HdVisibilitySchema.Builder().setVisibility(_Bool(true)).build())
  names.push(HdExtentSchema.getSchemaToken())
  values.push(new HdExtentSchema.Builder()
    .setMin(new HdRetainedTypedSampledDataSource(_min, VtValueTypes.GfVec3d) as never)
    .setMax(new HdRetainedTypedSampledDataSource(_max, VtValueTypes.GfVec3d) as never)
    .build())
  if ((m.drawMode ?? '') !== '' || m.apply === false) {
    names.push(UsdImagingGeomModelSchema.getSchemaToken())
    values.push(_GeomModelDs(m))
  }
  if (upAxis !== '') {
    names.push(UsdImagingUsdUpAxisSchema.getSchemaToken())
    values.push(HdRetainedContainerDataSource.new(['upAxis'], [_Tok(upAxis)]))
  }
  if (unloaded) {
    names.push(UsdImagingUsdPrimInfoSchema.getSchemaToken())
    values.push(HdRetainedContainerDataSource.new(['isLoaded'], [_Bool(false)]))
  }
  return HdRetainedContainerDataSource.new(names, values)
}

/** The native capture's _ChildDs */
function _ChildDs(): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdVisibilitySchema.getSchemaToken()],
    [new HdVisibilitySchema.Builder().setVisibility(_Bool(true)).build()])
}

class _Scene {
  readonly retained = HdRetainedSceneIndex.new()
  readonly mutables = new Map<string, _MutableContainer>()
  add(path: string, type: string, ds: HdContainerDataSource): void {
    const m = new _MutableContainer(ds)
    this.mutables.set(path, m)
    this.retained.addPrims([{ primPath: path, primType: type, dataSource: m }])
  }
}

const T = UsdImagingGeomModelSchemaTokens

/** The native capture's _BuildScene */
function _BuildScene(): _Scene {
  const s = new _Scene()
  const mesh = 'mesh'
  s.add('/Bounds', '', _ModelPrimDs({ drawMode: 'bounds', color: new GfVec3f(1, 0, 0) }))
  s.add('/Bounds/Child', mesh, _ChildDs())
  s.add('/Origin', '', _ModelPrimDs({ drawMode: 'origin' }))
  s.add('/CardsBox', '', _ModelPrimDs({ drawMode: 'cards', cardGeometry: 'box' }))
  s.add('/CardsBox/Child', mesh, _ChildDs())
  s.add('/CardsTex', '', _ModelPrimDs({
    drawMode: 'cards', cardGeometry: 'box', color: new GfVec3f(0.25, 0.5, 0.75),
    textures: { [T.cardTextureXPos]: 'xpos.png', [T.cardTextureZNeg]: 'zneg.png' } }))
  s.add('/CardsCross', '', _ModelPrimDs({
    drawMode: 'cards', cardGeometry: 'cross',
    textures: { [T.cardTextureXPos]: 'xpos.png', [T.cardTextureYPos]: 'ypos.png', [T.cardTextureYNeg]: 'yneg.png' } }))
  s.add('/CardsSimpleY', '', _ModelPrimDs({
    drawMode: 'cards', cardGeometry: 'box', cardVisibility: 'simple',
    textures: { [T.cardTextureXPos]: 'xpos.png', [T.cardTextureYPos]: 'ypos.png' } }, 'Y'))
  s.add('/CardsFromTexture', '', _ModelPrimDs({
    drawMode: 'cards', cardGeometry: 'fromTexture',
    textures: { [T.cardTextureXPos]: 'missing.png' } }))
  s.add('/NoApply', '', _ModelPrimDs({ drawMode: 'bounds', apply: false }))
  s.add('/NoApply/Child', mesh, _ChildDs())
  s.add('/Parent', '', _ModelPrimDs({}))
  s.add('/Parent/Inner', '', _ModelPrimDs({ drawMode: 'bounds' }))
  s.add('/Parent/Inner/Leaf', mesh, _ChildDs())
  s.add('/Parent/Sibling', mesh, _ChildDs())
  s.add('/Agg', '', _ModelPrimDs({}))
  s.add('/Agg/UsdNiPropagatedPrototypes', '', _ModelPrimDs({}))
  s.add('/Agg/UsdNiPropagatedPrototypes/Binding', '', _ModelPrimDs({ drawMode: 'cards' }))
  s.add('/Unloaded', '', _ModelPrimDs({}, '', true))
  s.add('/Unloaded/Child', mesh, _ChildDs())
  return s
}

function _Chain(s: _Scene): UsdImagingDrawModeSceneIndex {
  const unloaded = UsdImagingUnloadedDrawModeSceneIndex.new(s.retained)
  return UsdImagingDrawModeSceneIndex.new(unloaded, undefined)
}

/** The native capture's _Recorder */
class _Recorder implements HdSceneIndexObserver {
  notices: string[] = []
  primsAdded(_s: HdSceneIndexBase, entries: { primPath: string; primType: string }[]): void {
    for (const e of entries) this.notices.push(JSON.stringify({ kind: 'added', path: e.primPath, type: e.primType }))
  }
  primsRemoved(_s: HdSceneIndexBase, entries: { primPath: string }[]): void {
    for (const e of entries) this.notices.push(JSON.stringify({ kind: 'removed', path: e.primPath }))
  }
  primsDirtied(_s: HdSceneIndexBase, entries: { primPath: string; dirtyLocators: HdDataSourceLocatorSet }[]): void {
    for (const e of entries) {
      this.notices.push(JSON.stringify({
        kind: 'dirtied', path: e.primPath,
        locators: [...e.dirtyLocators].map(l => l.GetString()).sort() }))
    }
  }
  primsRenamed(): void {}
  take(): string[] {
    const r = this.notices
    this.notices = []
    return r
  }
}

function _GeomModelLocator(name: string): HdDataSourceLocator {
  return UsdImagingGeomModelSchema.getDefaultLocator().append(name)
}

function _Dirty(s: _Scene, path: string, ds: HdContainerDataSource | undefined,
  locators: HdDataSourceLocator[]): void {
  if (ds) s.mutables.get(path)!.inner = ds
  s.retained.dirtyPrims([{ primPath: path, dirtyLocators: new HdDataSourceLocatorSet(locators) }])
}

/** The native capture's _RunNotices */
function _RunNotices(): { steps: { step: string; notices: string[] }[]; dm: UsdImagingDrawModeSceneIndex } {
  const s = _BuildScene()
  const dm = _Chain(s)
  const rec = new _Recorder()
  dm.addObserver(rec)
  const steps: { step: string; notices: string[] }[] = []
  const step = (name: string): void => { steps.push({ step: name, notices: rec.take() }) }

  _Dirty(s, '/Bounds', _ModelPrimDs({ drawMode: 'origin', color: new GfVec3f(1, 0, 0) }),
    [_GeomModelLocator(T.drawMode)])
  step('boundsToOrigin')
  _Dirty(s, '/Bounds', _ModelPrimDs({ drawMode: 'origin', apply: false }),
    [_GeomModelLocator(T.applyDrawMode)])
  step('applyOff')
  _Dirty(s, '/Bounds', _ModelPrimDs({ drawMode: 'bounds' }),
    [_GeomModelLocator(T.applyDrawMode)])
  step('applyOn')
  _Dirty(s, '/CardsTex', undefined, [_GeomModelLocator(T.drawModeColor)])
  step('cardsColor')
  _Dirty(s, '/CardsTex', _ModelPrimDs({
    drawMode: 'cards', cardGeometry: 'box', textures: { [T.cardTextureZNeg]: 'zneg.png' } }),
  [_GeomModelLocator(T.cardTextureXPos)])
  step('cardsTexture')
  _Dirty(s, '/Origin', undefined, [HdExtentSchema.getDefaultLocator()])
  _Dirty(s, '/Bounds', undefined, [HdExtentSchema.getDefaultLocator()])
  step('extent')
  _Dirty(s, '/Bounds', undefined, [_GeomModelLocator(T.drawModeColor)])
  _Dirty(s, '/CardsBox', undefined, [HdXformSchema.getDefaultLocator()])
  _Dirty(s, '/CardsBox/Child', undefined, [HdVisibilitySchema.getDefaultLocator()])
  _Dirty(s, '/NoApply/Child', undefined, [HdVisibilitySchema.getDefaultLocator()])
  step('misc')
  s.retained.addPrims([
    { primPath: '/New/Child', primType: 'mesh', dataSource: _ChildDs() },
    { primPath: '/New', primType: '', dataSource: _ModelPrimDs({ drawMode: 'bounds' }) }])
  step('addedOutOfOrder')
  s.retained.addPrims([
    { primPath: '/CardsBox', primType: '', dataSource: _ModelPrimDs({}) },
    { primPath: '/CardsBox/Child', primType: 'mesh', dataSource: _ChildDs() }])
  step('resyncToDefault')
  s.retained.removePrims([{ primPath: '/CardsTex' }])
  step('removed')
  return { steps, dm }
}

function _NormalizeNotice(n: any): string {
  if (n.locators) n = { ...n, locators: [...n.locators].sort() }
  return JSON.stringify(n)
}

// ---------------------------------------------------------------------------

describe('UsdImagingDrawModeSceneIndex (retained.json)', () => {
  const captured = _Load('retained.json')

  it('produces the prims of the reference build', () => {
    const errors: string[] = []
    _ComparePrims(captured.prims, _Chain(_BuildScene()), errors)
    expect(errors).toEqual([])
  })

  it('sends the notices of the reference build', () => {
    const { steps } = _RunNotices()
    const expected = captured.notices.steps as { step: string; notices: any[] }[]
    expect(steps.map(s => s.step)).toEqual(expected.map(s => s.step))
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!.notices.map(_NormalizeNotice).sort()
      const got = steps[i]!.notices.map(n => _NormalizeNotice(JSON.parse(n))).sort()
      expect({ step: expected[i]!.step, notices: got }).toEqual({ step: expected[i]!.step, notices: want })
    }
  })

  it('ends the notice scenarios with the prims of the reference build', () => {
    const { dm } = _RunNotices()
    const errors: string[] = []
    _ComparePrims(captured.notices.final, dm, errors)
    expect(errors).toEqual([])
  })
})

describe('UsdImagingDrawModeSceneIndex over UsdImagingStageSceneIndex (stage.json)', () => {
  it('produces the stand-in prims of the reference build for drawModes.usda', async () => {
    const captured = _Load('stage.json')
    const stage = await UsdStage.open(new URL('drawModes.usda', fixtures).pathname)
    const stageSi = UsdImagingStageSceneIndex.new()
    const dm = UsdImagingDrawModeSceneIndex.new(stageSi, undefined)
    stageSi.SetStage(stage!)
    stageSi.SetTime(UsdTimeCode.Default())
    // Stand-in prims and the prims they replace; the remaining prims are the
    // stage scene index's own content.
    const standin = /^\/(Bounds|Origin|Cards)(\/|$)/
    const errors: string[] = []
    _ComparePrims(captured.prims, dm, errors, p => standin.test(p))
    expect(errors).toEqual([])
  })
})
