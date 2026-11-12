// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndex.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndex.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:420-424
// with TESTENV testenv/testUsdImagingStageSceneIndex. Each of main()'s tests
// (testUsdImagingStageSceneIndex.cpp:827-862) is an it(); TF_VERIFY
// assertions are expect() assertions and the TfErrorMark of main() is
// checked per test.
// Scenes: fixtures/stageSceneIndex/{traversal,varying,nodegraph,
// materialInterfaceInput}.usda, copied unchanged from
// testenv/testUsdImagingStageSceneIndex/.
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  MaterialSchema as HdMaterialSchema,
  MeshTopologySchema as HdMeshTopologySchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSourceT,
  type DataSourceBase as HdDataSourceBase,
  type SampledDataSource as HdSampledDataSource,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import { Vec3f as GfVec3f, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { Layer as SdfLayer, sdfCreatePrimInLayer as SdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Cube as UsdGeomCube, Points as UsdGeomPoints } from 'typescript-usd/usdGeom'
import { Material as UsdShadeMaterial } from 'typescript-usd/usdShade'
import { UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/stageSceneIndex/', import.meta.url)

interface DirtiedPrimEntry { primPath: string, dirtyLocators: HdDataSourceLocatorSet }
interface AddedPrimEntry { primPath: string, primType: string }

/** testUsdImagingStageSceneIndex.cpp:66-122 */
class PrimListener implements HdSceneIndexObserver {
  private readonly _prims = new Set<string>()
  private _added: AddedPrimEntry[] = []
  private _dirtied: DirtiedPrimEntry[] = []

  primsAdded(_sender: unknown, entries: AddedPrimEntry[]): void {
    for (const entry of entries) {
      this._prims.add(entry.primPath)
    }
    this._added.push(...entries)
  }

  primsRemoved(_sender: unknown, entries: { primPath: string }[]): void {
    for (const entry of entries) {
      const prefix = SdfPath.fromString(entry.primPath)
      for (const p of [...this._prims]) {
        if (SdfPath.fromString(p).hasPrefix(prefix)) {
          this._prims.delete(p)
        }
      }
    }
  }

  primsDirtied(_sender: unknown, entries: DirtiedPrimEntry[]): void {
    this._dirtied.push(...entries)
  }

  // Upstream forwards renames as removed + added entries
  // (ConvertPrimsRenamedToRemovedAndAdded); UsdImagingStageSceneIndex sends
  // no PrimsRenamed notices, so none reach this listener.
  primsRenamed(): void {}

  getPrimPaths(): Set<string> { return this._prims }
  getAdded(): AddedPrimEntry[] { return this._added }
  getDirtied(): DirtiedPrimEntry[] { return this._dirtied }

  resetEntries(): void {
    this._added = []
    this._dirtied = []
  }
}

/** testUsdImagingStageSceneIndex.cpp:173-193: the entries as a map, so
 *  equality doesn't depend on prim order, with redundant locators
 *  collapsed. */
function _DirtyMap(entries: readonly DirtiedPrimEntry[]): Map<string, string[]> {
  const map = new Map<string, HdDataSourceLocatorSet>()
  for (const e of entries) {
    let set = map.get(e.primPath)
    if (!set) map.set(e.primPath, set = new HdDataSourceLocatorSet())
    set.insert(e.dirtyLocators)
  }
  return new Map([...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([p, s]) => [p, [...s].map(l => l.GetString())]))
}

/** testUsdImagingStageSceneIndex.cpp:195-207 */
function _ParseLoc(inputStr: string): HdDataSourceLocator {
  return new HdDataSourceLocator(...inputStr.split('/').filter(s => s !== ''))
}

function _Translation(sceneIndex: HdSceneIndexBase, primPath: string): number[] | undefined {
  const xform = HdContainerDataSource.Get(
    sceneIndex.getPrim(primPath).dataSource, _ParseLoc('xform/matrix'))
  if (!(xform instanceof HdTypedSampledDataSource)) return undefined
  const t = (xform.getTypedValue(0) as GfMatrix4d).extractTranslation()
  return [t.get(0), t.get(1), t.get(2)]
}

describe('testUsdImagingStageSceneIndex', () => {
  /** testUsdImagingStageSceneIndex.cpp:123-171 */
  it('TraversalTest', async () => {
    const mark = new TfErrorMark()
    const stage = await UsdStage.open(new URL('traversal.usda', fixtures).pathname)
    expect(stage).toBeTruthy()

    const inputSceneIndex = UsdImagingStageSceneIndex.new()

    // The order below is important.  We need to add the observer before setting
    // the stage, otherwise we won't get the initial PrimsAdded notices from
    // population.
    const primListener = new PrimListener()
    inputSceneIndex.addObserver(primListener)
    inputSceneIndex.SetStage(stage)

    const fromGetChild = new Set<string>()
    const roots = ['/']
    while (roots.length > 0) {
      const root = roots.shift()!
      const children = inputSceneIndex.getChildPrimPaths(root)
      for (const c of children) fromGetChild.add(c)
      roots.push(...children)
    }

    const fromPrimsAdded = new Set(primListener.getPrimPaths())

    // Verify that "/" was added, and we remove it for the compare test below
    // this one.
    expect(fromPrimsAdded.delete('/')).toBe(true)

    // We expect traversal by GetChildPrimPaths to return the same topology
    // as the add notices.
    expect([...fromPrimsAdded].sort()).toEqual([...fromGetChild].sort())

    inputSceneIndex.SetStage(undefined)

    // After we reset the stage, we expect a PrimsRemoved{"/"}.
    expect(primListener.getPrimPaths().size).toBe(0)
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })

  /** testUsdImagingStageSceneIndex.cpp:210-304 */
  it('SetTimeTest', async () => {
    const mark = new TfErrorMark()
    const stage = (await UsdStage.open(new URL('varying.usda', fixtures).pathname))!
    expect(stage).toBeTruthy()

    const inputSceneIndex = UsdImagingStageSceneIndex.new()

    const primListener = new PrimListener()
    inputSceneIndex.addObserver(primListener)

    // SetStage should only send a PrimsRemoved and PrimsAdded.
    inputSceneIndex.SetStage(stage)
    expect(primListener.getDirtied().length).toBe(0)

    // If we haven't pulled on any data yet, nothing should be variable.
    inputSceneIndex.SetTime(new UsdTimeCode(1))
    expect(primListener.getDirtied().length).toBe(0)

    // Pull all of the data (HdDebugPrintDataSource visits every data
    // source and reads each sampled value at shutter offset 0).
    const pull = (ds: HdDataSourceBase | undefined): void => {
      if (ds instanceof HdContainerDataSource) {
        for (const name of ds.getNames()) pull(ds.Get(name))
      } else if (ds) {
        (ds as HdSampledDataSource).GetValue?.(0)
      }
    }
    for (const primPath of primListener.getPrimPaths()) {
      pull(inputSceneIndex.getPrim(primPath).dataSource)
    }

    // Grab the translate at T == 1 and check it's the right value.
    expect(_Translation(inputSceneIndex, '/pCube1'))
      .toEqual([0.83975313416116, -0.580522750321479, 7.63364433995336])

    inputSceneIndex.SetTime(new UsdTimeCode(2))
    // testUsdImagingStageSceneIndex.cpp:257-280
    const expectedDirtied: [string, string[]][] = [
      ['/pCube1', ['extent', 'primvars/points/primvarValue', 'visibility', 'xform']],
      ['/testMaterial', [
        new HdDataSourceLocator('material', '', 'nodes', 'Surface', 'parameters', 'emitColor')
          .append('value').GetString(),
        new HdDataSourceLocator('material', '__all', 'nodes', 'Surface', 'parameters', 'emitColor')
          .append('value').GetString(),
      ]],
    ]
    expect([..._DirtyMap(primListener.getDirtied())]).toEqual(expectedDirtied)

    // Grab the translate at T == 2 and check it's the right value.
    expect(_Translation(inputSceneIndex, '/pCube1'))
      .toEqual([0.83975313416116, -0.580522750321479, 2.76924600182721])
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })

  /** testUsdImagingStageSceneIndex.cpp:306-390 */
  it('PropertyChangeTest', async () => {
    const mark = new TfErrorMark()
    const stage = (await UsdStage.open(new URL('varying.usda', fixtures).pathname))!
    expect(stage).toBeTruthy()

    const inputSceneIndex = UsdImagingStageSceneIndex.new()
    inputSceneIndex.SetStage(stage)

    const primListener = new PrimListener()
    inputSceneIndex.addObserver(primListener)

    const meshPath = '/pCube1'
    const materialPath = '/testMaterial'

    const surfacePrim = stage.getPrim(`${materialPath}/Surface`)
    expect(surfacePrim).toBeTruthy()

    const roughnessAttr = surfacePrim!.getAttr('inputs:roughness')!
    expect(roughnessAttr.isValid()).toBe(true)

    roughnessAttr.set(0.25)

    stage.getPrim(meshPath)!.attr('faceVertexCounts').set([])

    stage.getPrim(meshPath)!.attr('points').set([])

    inputSceneIndex.ApplyPendingUpdates()

    let materialDirtied = false
    let meshTopologyDirtied = false
    let meshPointsDirtied = false

    for (const entry of primListener.getDirtied()) {
      if (entry.primPath === materialPath) {
        if (entry.dirtyLocators.intersects(new HdDataSourceLocator('material'))) {
          materialDirtied = true
        }
      } else if (entry.primPath === meshPath) {
        if (entry.dirtyLocators.intersects(HdMeshTopologySchema.getDefaultLocator())) {
          meshTopologyDirtied = true
        }
        if (entry.dirtyLocators.intersects(HdPrimvarsSchema.getPointsLocator())) {
          meshPointsDirtied = true
        }
      }
    }

    expect(materialDirtied).toBe(true)
    expect(meshTopologyDirtied).toBe(true)
    expect(meshPointsDirtied).toBe(true)
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })

  /** testUsdImagingStageSceneIndex.cpp:392-486 */
  it('NodeGraphInputChangeTest', async () => {
    const mark = new TfErrorMark()
    const stage = (await UsdStage.open(new URL('nodegraph.usda', fixtures).pathname))!
    expect(stage).toBeTruthy()

    const inputSceneIndex = UsdImagingStageSceneIndex.new()
    inputSceneIndex.SetStage(stage)

    const primListener = new PrimListener()
    inputSceneIndex.addObserver(primListener)

    const materialPath = '/World/Material'
    const matPrim = stage.getPrim(materialPath)
    expect(matPrim).toBeTruthy()
    const material = new UsdShadeMaterial(matPrim!)
    const ngPrim = stage.getPrim('/World/Material/NodeGraph')
    expect(ngPrim).toBeTruthy()

    const diffuseColorAttr = ngPrim!.getAttr('inputs:diffuseColor')!
    expect(diffuseColorAttr.isValid()).toBe(true)

    // Change the NodeGraph's diffuseColor
    diffuseColorAttr.set(new GfVec3f(0.0, 1.0, 0.0))

    inputSceneIndex.ApplyPendingUpdates()

    const materialDirtiedIn = (entries: readonly DirtiedPrimEntry[]) => entries.some(entry =>
      entry.primPath === materialPath
      && entry.dirtyLocators.intersects(HdMaterialSchema.getDefaultLocator()))

    expect(materialDirtiedIn(primListener.getDirtied())).toBe(true)

    // Change the terminal connection to a new shader node, that
    // was not previously part of the material network.
    // (UsdShadeMaterial::GetSurfaceAttr is the outputs:surface attribute.)
    material.prim.attr('outputs:surface').setConnections(
      ['/World/Material/AlternatePreviewSurface.outputs:surface'])

    primListener.resetEntries()
    inputSceneIndex.ApplyPendingUpdates()

    // We expect the material to be dirtied.
    expect(materialDirtiedIn(primListener.getDirtied())).toBe(true)

    // We expect the new shader node to exist in the material.
    {
      const prim = inputSceneIndex.getPrim(materialPath)
      const diffuseValueDs = HdContainerDataSource.Get(
        prim.dataSource,
        new HdDataSourceLocator(
          'material',
          '', // universal
          'nodes',
          'AlternatePreviewSurface',
          'parameters',
          'diffuseColor')
          .append('value'))
      expect(diffuseValueDs).toBeInstanceOf(HdTypedSampledDataSource)
      const v = (diffuseValueDs as HdTypedSampledDataSource<GfVec3f>).getTypedValue(0.0)
      expect([v.get(0), v.get(1), v.get(2)]).toEqual([1, 2, 3])
    }
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })

  /** testUsdImagingStageSceneIndex.cpp:488-544. Regression test for
   *  FLOW-7634: changing an inputs:* attribute directly on the material prim
   *  (a material interface input) must dirty the full material network, not
   *  just the terminal locator. */
  it('MaterialInterfaceInputChangeTest', async () => {
    const mark = new TfErrorMark()
    const stage = (await UsdStage.open(new URL('materialInterfaceInput.usda', fixtures).pathname))!
    expect(stage).toBeTruthy()

    const inputSceneIndex = UsdImagingStageSceneIndex.new()
    inputSceneIndex.SetStage(stage)

    const primListener = new PrimListener()
    inputSceneIndex.addObserver(primListener)

    const materialPath = '/World/Material'
    const matPrim = stage.getPrim(materialPath)
    expect(matPrim).toBeTruthy()

    const baseColorAttr = matPrim!.getAttr('inputs:baseColor')!
    expect(baseColorAttr.isValid()).toBe(true)

    // Change the material interface input directly on the material prim.
    baseColorAttr.set(new GfVec3f(0.0, 1.0, 0.0))

    inputSceneIndex.ApplyPendingUpdates()

    // The full material network must be dirtied, not just the terminal.
    const nodesLocator = new HdDataSourceLocator(
      HdMaterialSchema.getSchemaToken(),
      '', // universal render context
      'nodes')
    const materialNodesDirtied = primListener.getDirtied().some(entry =>
      entry.primPath === materialPath && entry.dirtyLocators.intersects(nodesLocator))
    expect(materialNodesDirtied).toBe(true)
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })

  /** testUsdImagingStageSceneIndex.cpp:546-589 */
  it('AddNonEmptyLayerTest', async () => {
    const mark = new TfErrorMark()
    // Create a new stage with a cube at "/cube"
    const rootLayer = SdfLayer.createAnonymous('.usda')
    const stage = await UsdStage.open(rootLayer)
    expect(stage).toBeTruthy()

    UsdGeomCube.define(stage, '/cube')

    // Populate the stage scene index
    const inputSceneIndex = UsdImagingStageSceneIndex.new()
    inputSceneIndex.SetStage(stage)

    const primListener = new PrimListener()
    inputSceneIndex.addObserver(primListener)

    // Create a layer with a single prim on "/cube".
    const layer = SdfLayer.createAnonymous('.usda')
    const prim = SdfCreatePrimInLayer(layer, '/cube')!
    prim.setField('specifier', 'def')
    stage.getRootLayer().insertSubLayerPath(layer.identifier)

    inputSceneIndex.ApplyPendingUpdates()

    // We expect for "/cube" to be resynced.
    const cubeResynced = primListener.getAdded().some(entry => entry.primPath === '/cube')
    expect(cubeResynced).toBe(true)
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })

  /** testUsdImagingStageSceneIndex.cpp:591-713 _PrimvarDataSourcesCache */
  class _PrimvarDataSourcesCache {
    primSource: HdContainerDataSourceT | undefined
    primvarsSchema = new HdPrimvarsSchema(undefined)
    primvarSchema: ReturnType<HdPrimvarsSchema['getPrimvar']> | undefined
    primvarValueSource: HdSampledDataSource | undefined
    primvarValue: number[] = []
    // Did the primvar name appear in the result of
    // HdContainerDataSource::GetNames() for the primvars?
    hasPrimvarName = false
    private readonly _primListener = new PrimListener()

    constructor(
      private readonly _sceneIndex: HdSceneIndexBase,
      private readonly _primPath: string,
      private readonly _primvarName: string,
    ) {
      // Initialize data sources if scene index was already populated.
      this._processEntry(this._primPath, HdDataSourceLocatorSet.UniversalSet)
      this._sceneIndex.addObserver(this._primListener)
    }

    // Pull data in response to invalidation notices.
    pull(): void {
      for (const entry of this._primListener.getAdded()) {
        this._processEntry(entry.primPath, HdDataSourceLocatorSet.UniversalSet)
      }
      for (const entry of this._primListener.getDirtied()) {
        this._processEntry(entry.primPath, entry.dirtyLocators)
      }
      this._primListener.resetEntries()
    }

    private _processEntry(primPath: string, dirtyLocators: HdDataSourceLocatorSet): void {
      if (primPath !== this._primPath) {
        return
      }
      if (dirtyLocators.contains(HdDataSourceLocator.EmptyLocator)) {
        this.primSource = this._sceneIndex.getPrim(this._primPath).dataSource
      }
      if (dirtyLocators.contains(HdPrimvarsSchema.getDefaultLocator())) {
        // Note that Contains is true if dirtyLocators contains
        // a prefix. So if we refresh the primSource above, we
        // would automatically refresh primvarsSchema as well.
        this.primvarsSchema = HdPrimvarsSchema.getFromParent(this.primSource)
      }
      if (dirtyLocators.contains(
        HdPrimvarsSchema.getDefaultLocator().append(this._primvarName))) {
        this.primvarSchema = this.primvarsSchema.getPrimvar(this._primvarName)
        this.hasPrimvarName = (this.primvarsSchema.getPrimvarNames() as readonly string[]).includes(this._primvarName)
      }
      if (dirtyLocators.contains(
        HdPrimvarsSchema.getDefaultLocator()
          .append(this._primvarName)
          .append(HdPrimvarSchemaTokens.primvarValue))) {
        this.primvarValueSource = this.primvarSchema?.getPrimvarValue()
        // HdFloatArrayDataSource::Cast
        const value = this.primvarValueSource instanceof HdTypedSampledDataSource
          ? this.primvarValueSource.getTypedValue(0) : undefined
        this.primvarValue = value && typeof (value as { size?: unknown }).size === 'number'
          ? Array.from({ length: (value as { size: number }).size },
            (_, i) => (value as { get(i: number): number }).get(i))
          : []
      }
    }
  }

  /** testUsdImagingStageSceneIndex.cpp:716-825 */
  it('CustomPrimvarChangeTest', async () => {
    const mark = new TfErrorMark()
    const rootLayer = SdfLayer.createAnonymous('.usda')
    const stage = await UsdStage.open(rootLayer)
    expect(stage).toBeTruthy()

    const inputSceneIndex = UsdImagingStageSceneIndex.new()
    inputSceneIndex.SetStage(stage)

    const primPath = '/points'
    const dataSourcesCache = new _PrimvarDataSourcesCache(inputSceneIndex, primPath, 'widths')

    inputSceneIndex.ApplyPendingUpdates()
    dataSourcesCache.pull()

    // Expect no prim since prim has not yet been created.
    expect(dataSourcesCache.primSource).toBeFalsy()

    const points = UsdGeomPoints.define(stage, '/points')
    expect(points).toBeTruthy()

    inputSceneIndex.ApplyPendingUpdates()
    dataSourcesCache.pull()

    // Prim has been created.
    expect(dataSourcesCache.primSource).toBeTruthy()

    // Note that we do not check dataSourcesCache.hasPrimvarName
    // or dataSourcesCache.primvarSchema.
    // As long as the primvar value data source is null, the implementation
    // is correct - whether the primvars container data source lists the
    // primvar (and whether on top, gives a data source for the primvar
    // schema).

    // Nothing authored, so we do not expect a data source for the value.
    expect(dataSourcesCache.primvarValueSource).toBeFalsy()

    // UsdGeomPoints::CreateWidthsAttr (points.cpp): float[] widths, not custom.
    const widthsAttr = stage.getPrim(primPath)!.createAttribute('widths', 'float[]', false, 'varying')
    expect(widthsAttr).toBeTruthy()

    inputSceneIndex.ApplyPendingUpdates()
    dataSourcesCache.pull()

    // Attribute has been created in authoring layer but has no opinion,
    // so we still do not expect a data source for the value.
    expect(dataSourcesCache.primvarValueSource).toBeFalsy()

    for (let i = 0; i < 2; ++i) {
      const widths = [1.0 + 3.0 * i, 2.0 + 3.0 * i, 3.0 + 3.0 * i]

      // Author opinion.
      widthsAttr.set(widths)

      inputSceneIndex.ApplyPendingUpdates()
      dataSourcesCache.pull()

      // We expect that the primvar is listed by the
      // primvars container data source, now that we
      // have an authored value.
      expect(dataSourcesCache.hasPrimvarName).toBe(true)

      // Same for data source for primvar value.
      expect(dataSourcesCache.primvarValueSource).toBeTruthy()

      // And the data source better provided the authored
      // value.
      expect(dataSourcesCache.primvarValue).toEqual(widths)
    }

    // Clear attribute.
    widthsAttr.clear()

    inputSceneIndex.ApplyPendingUpdates()
    dataSourcesCache.pull()

    // Authored opinion is cleared, so we should not a
    // data source for the prim var value.
    expect(dataSourcesCache.primvarValueSource).toBeFalsy()
    expect(mark.getErrors().map(e => e.getCommentary())).toEqual([])
  })
})
