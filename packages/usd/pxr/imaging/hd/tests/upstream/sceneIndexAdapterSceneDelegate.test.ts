// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/sceneIndexAdapterSceneDelegate.cpp,
//  pxr/imaging/hd/sceneIndexAdapterSceneDelegate.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Tests for the port of pxr/imaging/hd/sceneIndexAdapterSceneDelegate.{h,cpp}
// (OpenUSD 26.11.1). Upstream has no dedicated testenv for this class; these
// are controller tests with a MOCK render index (no renderer, no browser):
// an HdRetainedSceneIndex holds upstream-schema data sources built with the
// schemas' BuildRetained, and every expectation is the value put in, carried
// through the upstream semantics of the cited adapter code (or the upstream
// default the cited code returns). End-to-end checks through a real
// HdRenderIndex are not part of this file.

import { describe, expect, it } from 'vitest'
import { Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Matrix4d as GfMatrix4d, Range1f as GfRange1f, Vec2f as GfVec2f,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3i as GfVec3i, Vec4d as GfVec4d,
} from 'typescript-usd/gf'
import {
  HdContainerDataSource, HdMatrix4dDataSource, HdRetainedContainerDataSource,
  HdRetainedSmallVectorDataSource, HdRetainedTypedSampledDataSource,
  HdVec3fArrayDataSource, type HdDataSourceBase,
} from '../../src/dataSource.ts'
import { HdRetainedSampledDataSource } from '../../src/retainedDataSource.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from '../../src/dataSourceLocator.ts'
import { HdRetainedSceneIndex } from '../../src/retainedSceneIndex.ts'
import { HdSceneIndexAdapterSceneDelegate } from '../../src/sceneIndexAdapterSceneDelegate.ts'
import type { HdRenderIndex } from '../../src/renderIndex.ts'
import { HdChangeTracker } from '../../src/changeTracker.ts'
import { HdDirtyBitsTranslator } from '../../src/dirtyBitsTranslator.ts'
import { HdInterpolation } from '../../src/enums.ts'
import { HdCullStyle } from '../../src/displayStyle.ts'
import { HdCamera, HdCameraTokens } from '../../src/camera.ts'
import { HdFormat } from '../../src/types.ts'
import type { HdMaterialNetworkMap } from '../../src/material.ts'
import { HdXformSchema } from '../../src/xformSchema.ts'
import { HdExtentSchema } from '../../src/extentSchema.ts'
import { HdVisibilitySchema } from '../../src/visibilitySchema.ts'
import { HdPurposeSchema } from '../../src/purposeSchema.ts'
import { HdMeshSchema } from '../../src/meshSchema.ts'
import { HdMeshTopologySchema } from '../../src/meshTopologySchema.ts'
import { HdSubdivisionTagsSchema } from '../../src/subdivisionTagsSchema.ts'
import { HdBasisCurvesSchema } from '../../src/basisCurvesSchema.ts'
import { HdBasisCurvesTopologySchema } from '../../src/basisCurvesTopologySchema.ts'
import { HdPrimvarsSchema } from '../../src/primvarsSchema.ts'
import { HdPrimvarSchema } from '../../src/primvarSchema.ts'
import { HdGeomSubsetSchema, HdGeomSubsetSchemaTokens } from '../../src/geomSubsetSchema.ts'
import { HdMaterialBindingsSchema } from '../../src/materialBindingsSchema.ts'
import { HdMaterialBindingSchema } from '../../src/materialBindingSchema.ts'
import { HdMaterialSchema } from '../../src/materialSchema.ts'
import { HdMaterialNetworkSchema } from '../../src/materialNetworkSchema.ts'
import { HdMaterialNodeSchema } from '../../src/materialNodeSchema.ts'
import { HdMaterialNodeParameterSchema } from '../../src/materialNodeParameterSchema.ts'
import { HdMaterialConnectionSchema } from '../../src/materialConnectionSchema.ts'
import { HdCameraSchema } from '../../src/cameraSchema.ts'
import { HdLightSchemaTokens } from '../../src/lightSchema.ts'
import { HdRenderBufferSchema } from '../../src/renderBufferSchema.ts'
import { HdInstancerTopologySchema } from '../../src/instancerTopologySchema.ts'
import { HdInstancedBySchema } from '../../src/instancedBySchema.ts'
import { HdLegacyDisplayStyleSchema } from '../../src/legacyDisplayStyleSchema.ts'
import { HdCategoriesSchema } from '../../src/categoriesSchema.ts'
import { HdCoordSysBindingSchema } from '../../src/coordSysBindingSchema.ts'
import { HdVolumeFieldBindingSchema } from '../../src/volumeFieldBindingSchema.ts'
import { HdExtComputationSchema } from '../../src/extComputationSchema.ts'
import { HdExtComputationInputComputationSchema } from '../../src/extComputationInputComputationSchema.ts'
import { HdExtComputationOutputSchema } from '../../src/extComputationOutputSchema.ts'
import { HdExtComputationPrimvarsSchema } from '../../src/extComputationPrimvarsSchema.ts'
import { HdExtComputationPrimvarSchema } from '../../src/extComputationPrimvarSchema.ts'
import { HdPrimIdSchema } from '../../src/primIdSchema.ts'

const T = <V>(v: V) => HdRetainedTypedSampledDataSource.new(v)
const C = (fields: Record<string, HdDataSourceBase>): HdContainerDataSource =>
  HdRetainedContainerDataSource.new(Object.keys(fields), Object.values(fields))

// ---- Mock render index (records the private API calls the adapter makes) --

interface _Call { op: string, args: unknown[] }

const _rprimTypes = new Set(['mesh', 'basisCurves', 'points'])
const _sprimTypes = new Set(['camera', 'material', 'simpleLight', 'extComputation', 'coordSys'])
const _bprimTypes = new Set(['renderBuffer'])

function _MakeMockRenderIndex(): { index: HdRenderIndex, calls: _Call[] } {
  const calls: _Call[] = []
  const rec = (op: string) => (...args: unknown[]): void => { calls.push({ op, args }) }
  const tracker = {
    _MarkRprimDirty: rec('_MarkRprimDirty'),
    _MarkSprimDirty: rec('_MarkSprimDirty'),
    _MarkBprimDirty: rec('_MarkBprimDirty'),
    _MarkInstancerDirty: rec('_MarkInstancerDirty'),
    _MarkTaskDirty: rec('_MarkTaskDirty'),
  }
  const renderDelegate = {
    getMaterialRenderContexts: () => [''],
    getMaterialBindingPurpose: () => 'preview',
  }
  const index = {
    isRprimTypeSupported: (t: string) => _rprimTypes.has(t),
    isSprimTypeSupported: (t: string) => _sprimTypes.has(t),
    isBprimTypeSupported: (t: string) => _bprimTypes.has(t),
    _InsertRprim: (t: string, _sd: unknown, id: string) => calls.push({ op: '_InsertRprim', args: [t, id] }),
    _InsertSprim: (t: string, _sd: unknown, id: string) => calls.push({ op: '_InsertSprim', args: [t, id] }),
    _InsertBprim: (t: string, _sd: unknown, id: string) => calls.push({ op: '_InsertBprim', args: [t, id] }),
    _InsertInstancer: (_sd: unknown, id: string) => calls.push({ op: '_InsertInstancer', args: [id] }),
    _InsertTask: (_sd: unknown, id: string) => calls.push({ op: '_InsertTask', args: [id] }),
    _RemoveRprim: rec('_RemoveRprim'),
    _RemoveSprim: rec('_RemoveSprim'),
    _RemoveBprim: rec('_RemoveBprim'),
    _RemoveInstancer: rec('_RemoveInstancer'),
    _RemoveTask: rec('_RemoveTask'),
    _RemoveSubtree: (root: string) => calls.push({ op: '_RemoveSubtree', args: [root] }),
    _Clear: rec('_Clear'),
    isSyncAllInProgress: () => false,
    getInstanceName: () => 'mock',
    getRenderDelegate: () => renderDelegate,
    getChangeTracker: () => tracker,
  }
  return { index: index as unknown as HdRenderIndex, calls }
}

function _Setup(prims: Array<[string, string, HdContainerDataSource | undefined]> = []) {
  const si = HdRetainedSceneIndex.new()
  si.addPrims(prims.map(([primPath, primType, dataSource]) => ({ primPath, primType, dataSource })))
  const { index, calls } = _MakeMockRenderIndex()
  const sd = new HdSceneIndexAdapterSceneDelegate(si, index, '/')
  return { si, sd, calls }
}

const _ops = (calls: _Call[]) => calls.map(c => [c.op, ...c.args])

// ---- Observer: insertion, resync, removal (cpp:232-551) --------------------

describe('HdSceneIndexAdapterSceneDelegate observer', () => {
  it('inserts the prims present at construction by type (cpp:174-176, 270-288)', () => {
    const { calls } = _Setup([
      ['/Mesh', 'mesh', undefined],
      ['/Cam', 'camera', undefined],
      ['/Rb', 'renderBuffer', undefined],
      ['/Inst', 'instancer', undefined],
    ])
    const ops = _ops(calls)
    expect(ops).toContainEqual(['_InsertRprim', 'mesh', '/Mesh'])
    expect(ops).toContainEqual(['_InsertSprim', 'camera', '/Cam'])
    expect(ops).toContainEqual(['_InsertBprim', 'renderBuffer', '/Rb'])
    expect(ops).toContainEqual(['_InsertInstancer', '/Inst'])
  })

  it('a geomSubset dirties its parent topology (cpp:279-281)', () => {
    const { si, calls } = _Setup([['/Mesh', 'mesh', undefined]])
    calls.length = 0
    si.addPrims([{ primPath: '/Mesh/Sub', primType: 'geomSubset', dataSource: undefined }])
    expect(_ops(calls)).toEqual([['_MarkRprimDirty', '/Mesh', HdChangeTracker.DirtyTopology]])
  })

  it('re-adding with the same type resyncs with all-dirty bits (cpp:303-313)', () => {
    const { si, calls } = _Setup([['/Mesh', 'mesh', undefined]])
    calls.length = 0
    si.addPrims([{ primPath: '/Mesh', primType: 'mesh', dataSource: undefined }])
    const expectedBits = HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(
      'mesh', new HdDataSourceLocatorSet([HdDataSourceLocator.EmptyLocator]))
    expect(_ops(calls)).toEqual([['_MarkRprimDirty', '/Mesh', expectedBits]])
  })

  it('re-adding with a different type removes and re-inserts (cpp:252-276)', () => {
    const { si, calls } = _Setup([['/P', 'mesh', undefined]])
    calls.length = 0
    si.addPrims([{ primPath: '/P', primType: 'camera', dataSource: undefined }])
    expect(_ops(calls)).toEqual([['_RemoveRprim', '/P'], ['_InsertSprim', 'camera', '/P']])
  })

  it('removes a leaf prim singly, a prim with children by subtree, "/" by _Clear (cpp:385-432)', () => {
    const { si, calls } = _Setup([
      ['/A', 'mesh', undefined],
      ['/B/C', 'mesh', undefined],
    ])
    calls.length = 0
    si.removePrims([{ primPath: '/A' }])
    // /B was implicitly added to the path table as /B/C's ancestor.
    si.removePrims([{ primPath: '/B' }])
    si.removePrims([{ primPath: '/' }])
    expect(_ops(calls)).toEqual([['_RemoveRprim', '/A'], ['_RemoveSubtree', '/B'], ['_Clear']])
  })

  it('forwards translated rprim dirty bits (cpp:468-483)', () => {
    const { si, calls } = _Setup([['/Mesh', 'mesh', C({})]])
    calls.length = 0
    const locators = new HdDataSourceLocatorSet([HdXformSchema.getDefaultLocator()])
    si.dirtyPrims([{ primPath: '/Mesh', dirtyLocators: locators }])
    expect(_ops(calls)).toEqual([['_MarkRprimDirty', '/Mesh',
      HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits('mesh', locators)]])
  })

  it('PrimsRenamed is PrimsRemoved then PrimsAdded (cpp:545-551)', () => {
    const { sd, si, calls } = _Setup([['/A', 'mesh', undefined]])
    si.addPrims([{ primPath: '/B', primType: 'mesh', dataSource: undefined }])
    calls.length = 0
    sd.primsRenamed(si, [{ oldPrimPath: '/A', newPrimPath: '/B' }])
    expect(_ops(calls).map(o => o[0])).toEqual(['_RemoveRprim', '_MarkRprimDirty'])
  })
})

// ---- Rprim queries -----------------------------------------------------------

describe('HdSceneIndexAdapterSceneDelegate rprim queries', () => {
  it('GetTransform returns the xform matrix, identity without one (cpp:2497-2517)', () => {
    const m = new GfMatrix4d(1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 4, 5, 6, 1)
    const { sd } = _Setup([
      ['/X', 'mesh', C({ xform: HdXformSchema.buildRetained(T(m)) })],
      ['/Y', 'mesh', C({})],
    ])
    expect(sd.getTransform('/X').equals(m)).toBe(true)
    expect(sd.getTransform('/Y').equals(new GfMatrix4d(1))).toBe(true)
    expect(sd.getInstancerTransform('/X').equals(m)).toBe(true)
  })

  it('SampleTransform yields one sample at time 0 for an unvarying matrix (cpp:2535-2586)', () => {
    const m = new GfMatrix4d(2)
    const { sd } = _Setup([['/X', 'mesh', C({ xform: HdXformSchema.buildRetained(T(m)) })]])
    const times: number[] = []
    const values: GfMatrix4d[] = []
    expect(sd.sampleTransform('/X', 4, times, values)).toBe(1)
    expect(times).toEqual([0])
    expect(values[0]!.equals(m)).toBe(true)
  })

  it('GetExtent returns min/max (cpp:720-742)', () => {
    const { sd } = _Setup([['/X', 'mesh', C({
      extent: HdExtentSchema.buildRetained(T(new GfVec3d(-1, -2, -3)), T(new GfVec3d(1, 2, 3))),
    })]])
    const r = sd.getExtent('/X')
    expect(r.getMin().equals(new GfVec3d(-1, -2, -3))).toBe(true)
    expect(r.getMax().equals(new GfVec3d(1, 2, 3))).toBe(true)
  })

  it('GetVisible reads visibility, default true (cpp:766-793)', () => {
    const { sd } = _Setup([
      ['/Hidden', 'mesh', C({ visibility: HdVisibilitySchema.buildRetained(T(false)) })],
      ['/Default', 'mesh', C({})],
    ])
    expect(sd.getVisible('/Hidden')).toBe(false)
    expect(sd.getVisible('/Default')).toBe(true)
  })

  it('GetRenderTag reads purpose, default geometry (cpp:795-813)', () => {
    const { sd } = _Setup([
      ['/Guide', 'mesh', C({ purpose: HdPurposeSchema.buildRetained(T('guide')) })],
      ['/Default', 'mesh', C({})],
    ])
    expect(sd.getRenderTag('/Guide')).toBe('guide')
    expect(sd.getRenderTag('/Default')).toBe('geometry')
  })

  it('GetDoubleSided reads mesh doubleSided; basis curves are double-sided (cpp:696-718)', () => {
    const { sd } = _Setup([
      ['/M', 'mesh', C({ mesh: HdMeshSchema.buildRetained(undefined, undefined, undefined, T(true)) })],
      ['/Curves', 'basisCurves', C({})],
      ['/Plain', 'mesh', C({})],
    ])
    expect(sd.getDoubleSided('/M')).toBe(true)
    expect(sd.getDoubleSided('/Curves')).toBe(true)
    expect(sd.getDoubleSided('/Plain')).toBe(false)
  })

  const _meshDs = () => C({
    mesh: HdMeshSchema.buildRetained(
      HdMeshTopologySchema.buildRetained(T([4, 3]), T([0, 1, 2, 3, 0, 2, 4]), T([1]), T('leftHanded')),
      T('catmullClark'),
      HdSubdivisionTagsSchema.buildRetained(T('all'), T('edgeOnly'), T('smooth'),
        T([1]), T([2.5]), T([0, 1]), T([2]), T([3.5]))),
  })

  it('GetMeshTopology builds the topology from the mesh schema (cpp:677-694)', () => {
    const { sd } = _Setup([['/M', 'mesh', _meshDs()]])
    const topo = sd.getMeshTopology('/M')
    expect(topo.getScheme()).toBe('catmullClark')
    expect(topo.getOrientation()).toBe('leftHanded')
    expect([...topo.getFaceVertexCounts()]).toEqual([4, 3])
    expect([...topo.getFaceVertexIndices()]).toEqual([0, 1, 2, 3, 0, 2, 4])
    expect([...topo.getHoleIndices()]).toEqual([1])
  })

  it('GetMeshTopology gathers bound and invisible geom subsets (cpp:602-675)', () => {
    const binding = HdMaterialBindingsSchema.buildRetained(
      [''], [HdMaterialBindingSchema.buildRetained(T('/Mat'))])
    const { sd } = _Setup([
      ['/M', 'mesh', _meshDs()],
      ['/M/Bound', 'geomSubset', C({
        geomSubset: HdGeomSubsetSchema.buildRetained(T(HdGeomSubsetSchemaTokens.typeFaceSet), T([0])),
        materialBindings: binding,
      })],
      ['/M/Hidden', 'geomSubset', C({
        geomSubset: HdGeomSubsetSchema.buildRetained(T(HdGeomSubsetSchemaTokens.typeFaceSet), T([1])),
        visibility: HdVisibilitySchema.buildRetained(T(false)),
      })],
    ])
    const topo = sd.getMeshTopology('/M')
    expect(topo.getGeomSubsets()).toEqual([
      { type: 0, id: '/M/Bound', materialId: '/Mat', indices: [0] }])
    expect([...topo.getInvisibleFaces()]).toEqual([1])
  })

  it('GetSubdivTags reads mesh subdivisionTags (cpp:815-875)', () => {
    const { sd } = _Setup([['/M', 'mesh', _meshDs()]])
    const tags = sd.getSubdivTags('/M')
    expect(tags.getFaceVaryingInterpolationRule()).toBe('all')
    expect(tags.getVertexInterpolationRule()).toBe('edgeOnly')
    expect(tags.getTriangleSubdivision()).toBe('smooth')
    expect([...tags.getCornerIndices()]).toEqual([1])
    expect([...tags.getCornerWeights()]).toEqual([2.5])
    expect([...tags.getCreaseIndices()]).toEqual([0, 1])
    expect([...tags.getCreaseLengths()]).toEqual([2])
    expect([...tags.getCreaseWeights()]).toEqual([3.5])
  })

  it('GetBasisCurvesTopology reads the topology; default without counts (cpp:877-938)', () => {
    const { sd } = _Setup([
      ['/C', 'basisCurves', C({ basisCurves: HdBasisCurvesSchema.buildRetained(
        HdBasisCurvesTopologySchema.buildRetained(T([4]), T([0, 1, 2, 3]), T('bspline'),
          T('cubic'), T('periodic'))) })],
      ['/D', 'basisCurves', C({})],
    ])
    const topo = sd.getBasisCurvesTopology('/C')
    expect(topo.getCurveType()).toBe('cubic')
    expect(topo.getCurveBasis()).toBe('bspline')
    expect(topo.getCurveWrap()).toBe('periodic')
    expect(topo.getCurveVertexCounts()).toEqual([4])
    expect(topo.getCurveIndices()).toEqual([0, 1, 2, 3])
    const def = sd.getBasisCurvesTopology('/D')
    expect([def.getCurveType(), def.getCurveBasis(), def.getCurveWrap()])
      .toEqual(['linear', '', 'nonperiodic'])
  })

  it('display style queries read the legacy display style (cpp:3055-3179)', () => {
    const { sd } = _Setup([['/M', 'mesh', C({ displayStyle: HdLegacyDisplayStyleSchema.buildRetained(
      T(2), T(true), T(false), T(true), T(true), T(true), T(true), T('wire'),
      T(['refined', 'hull']), T('back')) })]])
    const ds = sd.getDisplayStyle('/M')
    expect([ds.refineLevel, ds.flatShadingEnabled, ds.displacementEnabled, ds.displayInOverlay,
      ds.occludedSelectionShowsThrough, ds.pointsShadingEnabled, ds.materialIsFinal])
      .toEqual([2, true, false, true, true, true, true])
    expect(sd.getShadingStyle('/M').UncheckedGet()).toBe('wire')
    const repr = sd.getReprSelector('/M')
    expect([repr.at(0), repr.at(1), repr.at(2)]).toEqual(['refined', 'hull', ''])
    expect(sd.getCullStyle('/M')).toBe(HdCullStyle.HdCullStyleBack)
  })

  it('GetCategories / GetCoordSysBindings / GetPrimId (cpp:940-958, 1045-1071, 3181-3198)', () => {
    const { sd } = _Setup([['/M', 'mesh', C({
      categories: HdCategoriesSchema.buildRetained(['a', 'b'], []),
      coordSysBinding: HdCoordSysBindingSchema.buildRetained(['uv'], [T('/CS')]),
      primId: HdPrimIdSchema.buildRetained(T(7)),
    })]])
    expect(sd.getCategories('/M')).toEqual(['a', 'b'])
    expect(sd.getCoordSysBindings('/M')).toEqual(['/CS'])
    expect(sd.getPrimId('/M')).toBe(7)
  })

  it('GetVolumeFieldDescriptors resolves the field prim type (cpp:960-998)', () => {
    const { sd } = _Setup([
      ['/V', 'volume', C({ volumeFieldBinding: HdVolumeFieldBindingSchema.buildRetained(
        ['density'], [T('/V/F')]) })],
      ['/V/F', 'openvdbAsset', C({})],
    ])
    const descs = sd.getVolumeFieldDescriptors('/V')
    expect(descs.map(d => [d.fieldName, d.fieldPrimType, d.fieldId]))
      .toEqual([['density', 'openvdbAsset', '/V/F']])
  })
})

// ---- Primvars -----------------------------------------------------------------

describe('HdSceneIndexAdapterSceneDelegate primvars', () => {
  const points = VtValue.createArray(new VtArray<GfVec3f>(
    [new GfVec3f(0, 0, 0), new GfVec3f(1, 0, 0)], VtValueTypes.GfVec3f))
  const uvs = VtValue.createArray(new VtArray<GfVec2f>(
    [new GfVec2f(0, 0), new GfVec2f(1, 1)], VtValueTypes.GfVec2f))
  const ds = () => C({ primvars: HdPrimvarsSchema.buildRetained(['points', 'st'], [
    HdPrimvarSchema.buildRetained(HdRetainedSampledDataSource.new(points), undefined, undefined,
      T('vertex'), T('point')),
    HdPrimvarSchema.buildRetained(undefined, HdRetainedSampledDataSource.new(uvs), T([0, 1, 1]),
      T('faceVarying'), T('textureCoordinate'), undefined, T(2)),
  ]) })

  it('GetPrimvarDescriptors groups by interpolation (cpp:1797-1905)', () => {
    const { sd } = _Setup([['/M', 'mesh', ds()]])
    const vtx = sd.getPrimvarDescriptors('/M', HdInterpolation.HdInterpolationVertex)
    expect(vtx.map(d => [d.name, d.role, d.indexed, d.elementSize]))
      .toEqual([['points', 'point', false, 1]])
    const fv = sd.getPrimvarDescriptors('/M', HdInterpolation.HdInterpolationFaceVarying)
    expect(fv.map(d => [d.name, d.role, d.indexed, d.elementSize]))
      .toEqual([['st', 'textureCoordinate', true, 2]])
    expect(sd.getPrimvarDescriptors('/M', HdInterpolation.HdInterpolationConstant)).toEqual([])
  })

  it('Get returns primvarValue; GetIndexedPrimvar returns indexedPrimvarValue and indices (cpp:2210-2336)', () => {
    const { sd } = _Setup([['/M', 'mesh', ds()]])
    expect(sd.Get('/M', 'points')).toBe(points)
    const indices = { value: [] as number[] }
    expect(sd.getIndexedPrimvar('/M', 'st', indices)).toBe(uvs)
    expect(indices.value).toEqual([0, 1, 1])
    expect(sd.Get('/M', 'missing').IsEmpty()).toBe(true)
  })

  it('SamplePrimvar yields one sample at time 0 for an unvarying value (cpp:2388-2495)', () => {
    const { sd } = _Setup([['/M', 'mesh', ds()]])
    const times: number[] = []
    const values: VtValue[] = []
    expect(sd.samplePrimvar('/M', 'points', 3, times, values)).toBe(1)
    expect(times).toEqual([0])
    expect(values[0]).toBe(points)
    const idx: number[][] = []
    expect(sd.sampleIndexedPrimvar('/M', 'st', 3, times, values, idx)).toBe(1)
    expect(values[0]).toBe(uvs)
    expect(idx[0]).toEqual([0, 1, 1])
  })

  it('descriptor cache drops on a primvar (not value) dirty (cpp:523-535)', () => {
    const { si, sd } = _Setup([['/M', 'mesh', ds()]])
    expect(sd.getPrimvarDescriptors('/M', HdInterpolation.HdInterpolationVertex)).toHaveLength(1)
    // Replace the data source without notifying, then dirty only the value:
    // the cached descriptors stay.
    ;(si as unknown as { _insert(p: string): { dataSource: unknown } })._insert('/M').dataSource = C({})
    si.dirtyPrims([{ primPath: '/M', dirtyLocators: new HdDataSourceLocatorSet([
      new HdDataSourceLocator('primvars', 'points', 'primvarValue')]) }])
    expect(sd.getPrimvarDescriptors('/M', HdInterpolation.HdInterpolationVertex)).toHaveLength(1)
    si.dirtyPrims([{ primPath: '/M', dirtyLocators: new HdDataSourceLocatorSet([
      new HdDataSourceLocator('primvars', 'points', 'interpolation')]) }])
    expect(sd.getPrimvarDescriptors('/M', HdInterpolation.HdInterpolationVertex)).toHaveLength(0)
  })

  it('converts plain-JS usdImaging typed data sources to VtValue / Gf (divergence helper)', () => {
    class Points extends HdVec3fArrayDataSource {
      getTypedValue(): number[] { return [0, 1, 2, 3, 4, 5] }
      GetContributingSampleTimesForInterval(): boolean { return false }
    }
    class Matrix extends HdMatrix4dDataSource {
      getTypedValue(): number[] { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1] }
      GetContributingSampleTimesForInterval(): boolean { return false }
    }
    const { sd } = _Setup([['/M', 'mesh', C({
      xform: HdXformSchema.buildRetained(new Matrix() as never),
      primvars: HdPrimvarsSchema.buildRetained(['points'], [
        HdPrimvarSchema.buildRetained(new Points(), undefined, undefined, T('vertex'))]),
    })]])
    const v = sd.Get('/M', 'points')
    expect(v.isArrayValued()).toBe(true)
    expect(v.getElementType()).toBe(VtValueTypes.GfVec3f)
    const arr = v.UncheckedGet<VtArray<GfVec3f>>().toArray()
    expect(arr.map(p => [...p.data])).toEqual([[0, 1, 2], [3, 4, 5]])
    expect(sd.getTransform('/M').equals(
      new GfMatrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1))).toBe(true)
  })
})

// ---- Material ---------------------------------------------------------------------

describe('HdSceneIndexAdapterSceneDelegate material', () => {
  it('GetMaterialId reads the binding for the render delegate purpose (cpp:1025-1043)', () => {
    const { sd } = _Setup([['/M', 'mesh', C({ materialBindings: HdMaterialBindingsSchema.buildRetained(
      [''], [HdMaterialBindingSchema.buildRetained(T('/Mat'))]) })]])
    expect(sd.getMaterialId('/M')).toBe('/Mat')
  })

  it('GetMaterialResource converts the network to an HdMaterialNetworkMap (cpp:1105-1353)', () => {
    const red = VtValue.create(new GfVec3f(1, 0, 0), VtValueTypes.GfVec3f)
    const network = HdMaterialNetworkSchema.buildRetained(
      C({
        Surf: HdMaterialNodeSchema.buildRetained(
          C({ diffuseColor: HdMaterialNodeParameterSchema.buildRetained(
            HdRetainedSampledDataSource.new(red), T('srgb')) }),
          C({ roughness: HdRetainedSmallVectorDataSource.new([
            HdMaterialConnectionSchema.buildRetained(T('Tex'), T('r'))]) }),
          T('UsdPreviewSurface')),
        Tex: HdMaterialNodeSchema.buildRetained(C({}), undefined, T('UsdUVTexture')),
      }),
      C({ surface: HdMaterialConnectionSchema.buildRetained(T('Surf'), T('surface')) }))
    const { sd } = _Setup([['/Mat', 'material', C({
      material: HdMaterialSchema.buildRetained([''], [network]) })]])
    const value = sd.getMaterialResource('/Mat')
    const map = value.UncheckedGet<HdMaterialNetworkMap & { terminals: string[] }>()
    expect(map.terminals).toEqual(['Surf'])
    const net = map.map.get('surface')!
    expect(net.nodes.map(n => [n.path, n.identifier])).toEqual(
      [['Tex', 'UsdUVTexture'], ['Surf', 'UsdPreviewSurface']])
    expect(net.relationships).toEqual([
      { inputId: 'Tex', inputName: 'r', outputId: 'Surf', outputName: 'roughness' }])
    const params = net.nodes[1]!.parameters
    expect(params.get('diffuseColor')).toBe(red)
    expect((params.get('colorSpace:diffuseColor') as VtValue).UncheckedGet()).toBe('srgb')
  })
})

// ---- Camera / light / render buffer --------------------------------------------

describe('HdSceneIndexAdapterSceneDelegate sprims and bprims', () => {
  it('GetCameraParamValue smooths projection, clippingRange, clipPlanes (cpp:1383-1479)', () => {
    const planes = VtValue.createArray(new VtArray<GfVec4d>([new GfVec4d(0, 0, 1, 2)],
      VtValueTypes.GfVec4d))
    const cam = HdCameraSchema.buildRetained(T('orthographic'), undefined, undefined,
      undefined, undefined, T(50), T(new GfVec2f(0.1, 100)),
      HdRetainedSampledDataSource.new(planes) as never)
    const { sd } = _Setup([['/Cam', 'camera', C({ camera: cam })]])
    expect(sd.getCameraParamValue('/Cam', 'projection').UncheckedGet()).toBe(HdCamera.Orthographic)
    const range = sd.getCameraParamValue('/Cam', 'clippingRange').UncheckedGet<GfRange1f>()
    expect([range.getMin(), range.getMax()]).toEqual([Math.fround(0.1), 100])
    const clip = sd.getCameraParamValue('/Cam', HdCameraTokens.clipPlanes).UncheckedGet<GfVec4d[]>()
    expect(clip.map(p => [...p.data])).toEqual([[0, 0, 1, 2]])
    expect(sd.getCameraParamValue('/Cam', 'focalLength').UncheckedGet()).toBe(50)
    // camera use of Get() (cpp:2040-2043).
    expect(sd.Get('/Cam', 'focalLength').UncheckedGet()).toBe(50)
  })

  it('GetLightParamValue reads the light container (cpp:1481-1504)', () => {
    const intensity = VtValue.create(3, VtValueTypes.float)
    const { sd } = _Setup([['/L', 'simpleLight', C({
      [HdLightSchemaTokens.light]: C({ intensity: HdRetainedSampledDataSource.new(intensity) }) })]])
    expect(sd.getLightParamValue('/L', 'intensity')).toBe(intensity)
    expect(sd.Get('/L', 'intensity')).toBe(intensity)
  })

  it('GetRenderBufferDescriptor reads the render buffer schema (cpp:1073-1103)', () => {
    const { sd } = _Setup([['/Rb', 'renderBuffer', C({ renderBuffer: HdRenderBufferSchema.buildRetained(
      T(new GfVec3i(64, 32, 1)), T(HdFormat.HdFormatFloat32Vec4), T(true)) })]])
    const desc = sd.getRenderBufferDescriptor('/Rb')
    expect(desc.dimensions).toEqual([64, 32, 1])
    expect(desc.format).toBe(HdFormat.HdFormatFloat32Vec4)
    expect(desc.multiSampled).toBe(true)
  })
})

// ---- Instancing -------------------------------------------------------------------

describe('HdSceneIndexAdapterSceneDelegate instancing', () => {
  it('instancer prototypes, indices and instancedBy (cpp:2642-2715)', () => {
    const { sd } = _Setup([
      ['/I', 'instancer', C({ instancerTopology: HdInstancerTopologySchema.buildRetained(
        T(['/I/A', '/I/B']), HdRetainedSmallVectorDataSource.new([T([0, 2]), T([1])])) })],
      ['/I/A', 'mesh', C({ instancedBy: HdInstancedBySchema.buildRetained(T(['/I'])) })],
    ])
    expect(sd.getInstancerPrototypes('/I')).toEqual(['/I/A', '/I/B'])
    expect(sd.getInstanceIndices('/I', '/I/A')).toEqual([0, 2])
    expect(sd.getInstanceIndices('/I', '/I/B')).toEqual([1])
    expect(sd.getInstancerId('/I/A')).toBe('/I')
    expect(sd.getInstancerId('/I')).toBe('')
  })
})

// ---- ExtComputations --------------------------------------------------------------

describe('HdSceneIndexAdapterSceneDelegate ext computations', () => {
  it('reads computation inputs, outputs, kernel and computation primvars (cpp:1908-2023, 2717-2942)', () => {
    const scale = VtValue.create(2, VtValueTypes.float)
    const tuple = { type: 1, count: 1 }
    const { sd } = _Setup([
      ['/Comp', 'extComputation', C({ extComputation: HdExtComputationSchema.buildRetained(
        C({ scale: HdRetainedSampledDataSource.new(scale) }),
        C({ src: HdExtComputationInputComputationSchema.buildRetained(T('/Other'), T('out')) }),
        C({ result: HdExtComputationOutputSchema.buildRetained(T(tuple) as never) }),
        T('kernel source')) })],
      ['/M', 'mesh', C({ extComputationPrimvars: HdExtComputationPrimvarsSchema.buildRetained(
        ['points'], [HdExtComputationPrimvarSchema.buildRetained(T('vertex'), T('point'),
          T('/Comp'), T('result'), T(tuple) as never)]) })],
    ])
    expect(sd.getExtComputationSceneInputNames('/Comp')).toEqual(['scale'])
    expect(sd.getExtComputationInput('/Comp', 'scale')).toBe(scale)
    expect(sd.getExtComputationInputDescriptors('/Comp')).toEqual([
      { name: 'src', sourceComputationId: '/Other', sourceComputationOutputName: 'out' }])
    expect(sd.getExtComputationOutputDescriptors('/Comp')).toEqual([
      { name: 'result', valueType: tuple }])
    expect(sd.getExtComputationKernel('/Comp')).toBe('kernel source')
    const descs = sd.getExtComputationPrimvarDescriptors('/M', HdInterpolation.HdInterpolationVertex)
    expect(descs.map(d => [d.name, d.role, d.sourceComputationId, d.sourceComputationOutputName]))
      .toEqual([['points', 'point', '/Comp', 'result']])
  })
})
