// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSourceLegacyPrim.cpp,
//  pxr/imaging/hd/dataSourceLegacyTaskPrim.cpp,
//  pxr/imaging/hd/legacyPrimSceneIndex.cpp
// Copyright 2021, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdLegacyPrimSceneIndex / HdDataSourceLegacyPrim / HdDataSourceLegacyTaskPrim
// (pxr/imaging/hd/legacyPrimSceneIndex.cpp, dataSourceLegacyPrim.cpp,
// dataSourceLegacyTaskPrim.cpp). Mock/controller test (Node only).
//
// Upstream has no testenv for these files. The data sources wrap
// HdSceneDelegate queries, so every expectation here is the wrapped scene
// delegate's own answer for the same query (round-trip identity), read from
// HdUnitTestDelegate (or, for the queries it does not answer, a scene
// delegate whose answers the test supplies); nothing is hand-derived.

import { describe, expect, it } from 'vitest'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import {
  Value as VtValue, Array as VtArray, ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import {
  Matrix4f as GfMatrix4f, Range1f as GfRange1f, Vec2f as GfVec2f, Vec3f as GfVec3f,
  Vec4f as GfVec4f, Vec2i as GfVec2i, Range2f as GfRange2f, Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath,
} from 'typescript-usd/gf'
import { PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import { HdUnitTestDelegate } from '../../src/unitTestDelegate.ts'
import type { HdRenderIndex } from '../../src/renderIndex.ts'
import { HdSceneDelegate } from '../../src/sceneDelegate.ts'
import {
  HdContainerDataSource, HdSampledDataSource, HdVectorDataSource, type HdDataSourceBase,
} from '../../src/dataSource.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from '../../src/dataSourceLocator.ts'
import { HdCullStyle, HdReprSelector } from '../../src/displayStyle.ts'
import { HdInterpolation } from '../../src/enums.ts'
import { HdRenderBufferDescriptor } from '../../src/aov.ts'
import { HdFormat } from '../../src/types.ts'
import { HdMaterialNetwork, HdMaterialNetworkMap, HdMaterialNode, HdMaterialNode2, HdMaterialNode2Type } from '../../src/material.ts'
import { HdUtils } from '../../src/utils.ts'
import { HdRprimCollection } from '../../src/rprimCollection.ts'
import { HdTask, type HdTaskContext } from '../../src/task.ts'
import { HdCamera } from '../../src/camera.ts'
import { HdTimeSampleArray } from '../../src/timeSampleArray.ts'
import { HdTokens, HdInstancerTokens, HdPrimTypeTokens } from '../../src/tokens.ts'
import {
  HdDataSourceLegacyPrim, HdSceneIndexEmulationTokens, HdLegacyFlagTokens,
  HdLegacyPrimTypeIsVolumeField, Hd_DataSourceLegacyPrimvarValue,
} from '../../src/dataSourceLegacyPrim.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import {
  HdRenderSettings, HdRenderSettingsDirtyBits, HdRenderSettingsRenderProduct,
  HdRenderSettingsRenderProductsType, HdRenderSettingsRenderVar,
} from '../../src/renderSettings.ts'
import { HdLegacyPrimSceneIndex } from '../../src/legacyPrimSceneIndex.ts'
import { HdMakeLegacyTaskFactory } from '../../src/legacyTaskFactory.ts'
import type {
  AddedPrimEntry, DirtiedPrimEntry, HdSceneIndexBase, HdSceneIndexObserver,
  RemovedPrimEntry, RenamedPrimEntry,
} from '../../src/sceneIndex.ts'

// The HdUnitTestDelegate keeps its scene in its own tables; these tests read
// it through HdDataSourceLegacyPrim directly, so its render index is a stub
// that accepts (and ignores) the insertions and dirty marks the delegate
// makes (Insert*, GetChangeTracker().Mark*Dirty, MarkTaskDirty).
function stubRenderIndex(): HdRenderIndex {
  const stub: object = new Proxy({}, { get: () => () => stub })
  return stub as HdRenderIndex
}

function newDelegate(): HdUnitTestDelegate {
  return new HdUnitTestDelegate(stubRenderIndex(), '/')
}

function container(ds: HdDataSourceBase | undefined): HdContainerDataSource {
  expect(ds).toBeInstanceOf(HdContainerDataSource)
  return ds as HdContainerDataSource
}

function at(ds: HdDataSourceBase | undefined, ...names: string[]): HdDataSourceBase | undefined {
  let cur = ds
  for (const n of names) cur = container(cur).Get(n)
  return cur
}

function value(ds: HdDataSourceBase | undefined, shutter = 0): unknown {
  expect(ds).toBeInstanceOf(HdSampledDataSource)
  return (ds as HdSampledDataSource).GetValue(shutter)
}

function expectSameVtValue(actual: unknown, expected: VtValue): void {
  expect(actual).toBeInstanceOf(VtValue)
  expect((actual as VtValue).equals(expected)).toBe(true)
}

const interpTokens = ['constant', 'uniform', 'varying', 'vertex', 'faceVarying', 'instance']

function cubeScene(): HdUnitTestDelegate {
  const d = newDelegate()
  d.addInstancer('/instancer')
  d.addCube('/cube', new GfMatrix4f(2), false, '/instancer')
  d.addPrimvar('/cube', 'indexedColor',
    VtValue.createArray(new VtArray<GfVec3f>(
      [new GfVec3f(1, 0, 0), new GfVec3f(0, 1, 0)], VtValueTypes.GfVec3f)),
    HdInterpolation.HdInterpolationUniform, 'color', [0, 1, 1, 0, 0, 1])
  d.setInstancerProperties('/instancer', [0, 0],
    [new GfVec3f(1), new GfVec3f(2)],
    [new GfVec4f(0, 0, 0, 1), new GfVec4f(0, 0, 0, 1)],
    [new GfVec3f(0), new GfVec3f(3, 0, 0)])
  d.setRefineLevel('/cube', 2)
  d.setReprSelector('/cube', new HdReprSelector('refinedWire'))
  d.setMeshCullStyle('/cube', HdCullStyle.HdCullStyleBack)
  d.bindMaterial('/cube', '/material')
  return d
}

describe('HdDataSourceLegacyPrim (mesh) wraps the HdUnitTestDelegate answers', () => {
  const d = cubeScene()
  const prim = HdDataSourceLegacyPrim.new('/cube', HdPrimTypeTokens.mesh, d)

  it('GetNames lists the gprim members (dataSourceLegacyPrim.cpp:2486-2595)', () => {
    const names = prim.getNames()
    for (const n of ['mesh', 'primvars', 'extComputationPrimvars', 'materialBindings',
      'displayStyle', 'coordSysBinding', 'purpose', 'visibility', 'categories', 'xform',
      'extent', 'instancedBy', 'sceneDelegate']) {
      expect(names).toContain(n)
    }
    expect(names).not.toContain('instancerTopology')
  })

  it('sceneDelegate holds the wrapped delegate', () => {
    expect(value(prim.Get(HdSceneIndexEmulationTokens.sceneDelegate))).toBe(d)
  })

  it('mesh topology, subdivisionScheme, subdivisionTags and doubleSided', () => {
    const t = d.getMeshTopology('/cube')
    const mesh = prim.Get('mesh')
    expect(value(at(mesh, 'topology', 'faceVertexCounts'))).toEqual(t.getFaceVertexCounts())
    expect(value(at(mesh, 'topology', 'faceVertexIndices'))).toEqual(t.getFaceVertexIndices())
    expect(value(at(mesh, 'topology', 'holeIndices'))).toEqual(t.getHoleIndices())
    expect(value(at(mesh, 'topology', 'orientation'))).toBe(t.getOrientation())
    expect(value(at(mesh, 'subdivisionScheme'))).toBe(t.getScheme())
    expect(value(at(mesh, 'doubleSided'))).toBe(d.getDoubleSided('/cube'))
    const tags = d.getSubdivTags('/cube')
    const st = at(mesh, 'subdivisionTags')
    expect(value(at(st, 'faceVaryingLinearInterpolation'))).toBe(tags.getFaceVaryingInterpolationRule())
    expect(value(at(st, 'interpolateBoundary'))).toBe(tags.getVertexInterpolationRule())
    expect(value(at(st, 'triangleSubdivisionRule'))).toBe(tags.getTriangleSubdivision())
    expect(value(at(st, 'cornerIndices'))).toEqual(tags.getCornerIndices())
    expect(value(at(st, 'cornerSharpnesses'))).toEqual(tags.getCornerWeights())
    expect(value(at(st, 'creaseIndices'))).toEqual(tags.getCreaseIndices())
    expect(value(at(st, 'creaseLengths'))).toEqual(tags.getCreaseLengths())
    expect(value(at(st, 'creaseSharpnesses'))).toEqual(tags.getCreaseWeights())
  })

  it('primvars: one entry per primvar descriptor, with its interpolation, role and value', () => {
    const primvars = container(prim.Get('primvars'))
    const expectedNames: string[] = []
    for (let i = 0; i < HdInterpolation.HdInterpolationCount; ++i) {
      for (const desc of d.getPrimvarDescriptors('/cube', i)) {
        expectedNames.push(desc.name)
        const pv = container(primvars.Get(desc.name))
        expect(value(pv.Get('interpolation'))).toBe(interpTokens[i])
        expect(value(pv.Get('role'))).toBe(desc.role)
        expect(value(pv.Get('elementSize'))).toBe(desc.elementSize)
        if (desc.indexed) {
          const indices = { value: [] as number[] }
          const v = d.getIndexedPrimvar('/cube', desc.name, indices)
          expectSameVtValue(value(pv.Get('indexedPrimvarValue')), v)
          expect(value(pv.Get('indices'))).toEqual(indices.value)
          expect(pv.Get('primvarValue')).toBeUndefined()
        } else {
          expectSameVtValue(value(pv.Get('primvarValue')), d.Get('/cube', desc.name))
          expect(pv.Get('indexedPrimvarValue')).toBeUndefined()
        }
      }
    }
    expect([...primvars.getNames()].sort()).toEqual([...expectedNames].sort())
    expect(expectedNames).toContain('indexedColor')
    expect(expectedNames).toContain(HdTokens.points)
  })

  it('primvar values at a nonzero shutter offset resample the SamplePrimvar samples', () => {
    const pv = container(at(prim.Get('primvars'), HdTokens.points))
    const sa = new HdTimeSampleArray<VtValue>()
    d.samplePrimvar('/cube', HdTokens.points, sa, 1)
    expect(sa.count).toBe(1)
    expectSameVtValue(value(pv.Get('primvarValue'), 0.25), sa.values[0]!)
    const times: number[] = []
    expect((pv.Get('primvarValue') as HdSampledDataSource)
      .GetContributingSampleTimesForInterval(-1, 1, times)).toBe(false)
    expect(times).toEqual(sa.times.slice(0, sa.count))
  })

  it('indexed primvar values at a nonzero shutter offset resample SampleIndexedPrimvar', () => {
    const pv = container(at(prim.Get('primvars'), 'indexedColor'))
    const times: number[] = []
    const values: VtValue[] = []
    const indices: number[][] = []
    const n = d.sampleIndexedPrimvar('/cube', 'indexedColor', 1, times, values, indices)
    expect(n).toBe(1)
    expectSameVtValue(value(pv.Get('indexedPrimvarValue'), 0.5), values[0]!)
    expect(value(pv.Get('indices'), 0.5)).toEqual(indices[0])
  })

  it('xform matrix is GetTransform, fully composed (resetXformStack)', () => {
    const xform = prim.Get('xform')
    expect((value(at(xform, 'matrix')) as { equals(o: unknown): boolean })
      .equals(d.getTransform('/cube'))).toBe(true)
    expect(value(at(xform, 'resetXformStack'))).toBe(true)
    const sampled: unknown[] = []
    const times: number[] = []
    d.sampleTransform('/cube', 1, times, sampled as never[])
    expect((value(at(xform, 'matrix'), 0.5) as { equals(o: unknown): boolean })
      .equals(sampled[0])).toBe(true)
  })

  it('visibility, purpose (render tag) and extent', () => {
    expect(value(at(prim.Get('visibility'), 'visibility'))).toBe(d.getVisible('/cube'))
    expect(value(at(prim.Get('purpose'), 'purpose'))).toBe(d.getRenderTag('/cube'))
    const extent = d.getExtent('/cube')
    expect((value(at(prim.Get('extent'), 'min')) as { equals(o: unknown): boolean })
      .equals(extent.getMin())).toBe(true)
    expect((value(at(prim.Get('extent'), 'max')) as { equals(o: unknown): boolean })
      .equals(extent.getMax())).toBe(true)
  })

  it('displayStyle: refineLevel, reprSelector, cullStyle and the display style flags', () => {
    const ds = prim.Get('displayStyle')
    const style = d.getDisplayStyle('/cube')
    expect(value(at(ds, 'refineLevel'))).toBe(style.refineLevel)
    expect(value(at(ds, 'flatShadingEnabled'))).toBe(style.flatShadingEnabled)
    expect(value(at(ds, 'displacementEnabled'))).toBe(style.displacementEnabled)
    expect(value(at(ds, 'displayInOverlay'))).toBe(style.displayInOverlay)
    expect(value(at(ds, 'occludedSelectionShowsThrough'))).toBe(style.occludedSelectionShowsThrough)
    expect(value(at(ds, 'pointsShadingEnabled'))).toBe(style.pointsShadingEnabled)
    expect(value(at(ds, 'materialIsFinal'))).toBe(style.materialIsFinal)
    const repr = d.getReprSelector('/cube')
    expect(value(at(ds, 'reprSelector'))).toEqual([repr.at(0), repr.at(1), repr.at(2)])
    expect(d.getCullStyle('/cube')).toBe(HdCullStyle.HdCullStyleBack)
    expect(value(at(ds, 'cullStyle'))).toBe('back')
    // GetShadingStyle answers an empty value: no shadingStyle data source.
    expect(d.getShadingStyle('/cube').IsEmpty()).toBe(true)
    expect(at(ds, 'shadingStyle')).toBeUndefined()
  })

  it('materialBindings (allPurpose) is GetMaterialId; instancedBy is GetInstancerId', () => {
    expect(value(at(prim.Get('materialBindings'), '', 'path'))).toBe(d.getMaterialId('/cube'))
    expect(value(at(prim.Get('instancedBy'), 'paths'))).toEqual([d.getInstancerId('/cube')])
  })

  it('categories / coordSysBinding / extComputationPrimvars are absent when the delegate has none', () => {
    expect(d.getCategories('/cube')).toEqual([])
    expect(prim.Get('categories')).toBeUndefined()
    expect(d.getCoordSysBindings('/cube')).toBeNull()
    expect(prim.Get('coordSysBinding')).toBeUndefined()
    expect(prim.Get('extComputationPrimvars')).toBeUndefined()
  })

  it('an unbound, uninstanced mesh has no materialBindings / instancedBy', () => {
    const d2 = newDelegate()
    d2.addCube('/plain', new GfMatrix4f(1))
    const p2 = HdDataSourceLegacyPrim.new('/plain', HdPrimTypeTokens.mesh, d2)
    expect(d2.getMaterialId('/plain')).toBe('')
    expect(p2.Get('materialBindings')).toBeUndefined()
    expect(d2.getInstancerId('/plain')).toBe('')
    expect(p2.Get('instancedBy')).toBeUndefined()
    // refineLevel 0 and an empty repr selector / dontCare cull style: no data
    // sources (dataSourceLegacyPrim.cpp:1600-1704).
    expect(at(p2.Get('displayStyle'), 'refineLevel')).toBeUndefined()
    expect(at(p2.Get('displayStyle'), 'reprSelector')).toBeUndefined()
    expect(at(p2.Get('displayStyle'), 'cullStyle')).toBeUndefined()
  })
})

describe('HdDataSourceLegacyPrim (basisCurves, points)', () => {
  const d = newDelegate()
  const color = VtValue.createArray(new VtArray<GfVec3f>([new GfVec3f(1, 0, 0)], VtValueTypes.GfVec3f))
  const opacity = VtValue.createArray(new VtArray<number>([1], VtValueTypes.float))
  const width = VtValue.createArray(new VtArray<number>([0.1], VtValueTypes.float))
  d.addBasisCurves('/curves', [new GfVec3f(0), new GfVec3f(1), new GfVec3f(2), new GfVec3f(3)],
    [4], [0, 1, 2, 3], [], 'cubic', 'bezier',
    color, HdInterpolation.HdInterpolationConstant,
    opacity, HdInterpolation.HdInterpolationConstant,
    width, HdInterpolation.HdInterpolationConstant)
  d.addPoints('/points', [new GfVec3f(0), new GfVec3f(1)], color,
    HdInterpolation.HdInterpolationConstant, opacity, HdInterpolation.HdInterpolationConstant,
    width, HdInterpolation.HdInterpolationConstant)

  it('basisCurves topology is GetBasisCurvesTopology', () => {
    const prim = HdDataSourceLegacyPrim.new('/curves', HdPrimTypeTokens.basisCurves, d)
    expect(prim.getNames()).toContain('basisCurves')
    const t = d.getBasisCurvesTopology('/curves')
    const topo = at(prim.Get('basisCurves'), 'topology')
    expect(value(at(topo, 'curveVertexCounts'))).toEqual(t.getCurveVertexCounts())
    expect(value(at(topo, 'curveIndices'))).toEqual(t.getCurveIndices())
    expect(value(at(topo, 'basis'))).toBe(t.getCurveBasis())
    expect(value(at(topo, 'type'))).toBe(t.getCurveType())
    expect(value(at(topo, 'wrap'))).toBe(t.getCurveWrap())
    expect(prim.Get('mesh')).toBeUndefined()
  })

  it('points primvars are Get(id, name)', () => {
    const prim = HdDataSourceLegacyPrim.new('/points', HdPrimTypeTokens.points, d)
    for (const name of [HdTokens.points, HdTokens.displayColor, HdTokens.widths]) {
      expectSameVtValue(value(at(prim.Get('primvars'), name, 'primvarValue')), d.Get('/points', name))
    }
    expect(value(at(prim.Get('extent'), 'min'))).toBeDefined()
  })
})

describe('HdDataSourceLegacyPrim (instancer)', () => {
  const d = cubeScene()
  const prim = HdDataSourceLegacyPrim.new('/instancer', HdPrimTypeTokens.instancer, d)

  it('GetNames lists xform, instancerTopology, instanceCategories, categories', () => {
    const names = prim.getNames()
    for (const n of ['xform', 'instancerTopology', 'instanceCategories', 'categories',
      'instancedBy', 'primvars']) {
      expect(names).toContain(n)
    }
  })

  it('instancerTopology prototypes / instanceIndices / isLegacyInstancer', () => {
    const topo = prim.Get('instancerTopology')
    const protos = d.getInstancerPrototypes('/instancer')
    expect(value(at(topo, 'prototypes'))).toEqual(protos)
    const indices = at(topo, 'instanceIndices') as HdVectorDataSource
    expect(indices.getNumElements()).toBe(protos.length)
    protos.forEach((proto, i) => {
      expect(value(indices.getElement(i))).toEqual(d.getInstanceIndices('/instancer', proto))
    })
    expect(value(at(topo, HdLegacyFlagTokens.isLegacyInstancer))).toBe(true)
    // cached (dataSourceLegacyPrim.cpp:2820-2839)
    expect(prim.Get('instancerTopology')).toBe(topo)
  })

  it('xform matrix is GetInstancerTransform; instance primvars are Get', () => {
    expect((value(at(prim.Get('xform'), 'matrix')) as { equals(o: unknown): boolean })
      .equals(d.getInstancerTransform('/instancer'))).toBe(true)
    for (const name of [HdInstancerTokens.instanceScales, HdInstancerTokens.instanceRotations,
      HdInstancerTokens.instanceTranslations]) {
      const pv = at(prim.Get('primvars'), name)
      expect(value(at(pv, 'interpolation'))).toBe('instance')
      expectSameVtValue(value(at(pv, 'primvarValue')), d.Get('/instancer', name))
    }
  })

  it('instanceCategories is one categories container per GetInstanceCategories entry', () => {
    const v = at(prim.Get('instanceCategories'), 'categoriesValues') as HdVectorDataSource
    expect(v.getNumElements()).toBe(d.getInstanceCategories('/instancer').length)
  })
})

describe('HdDataSourceLegacyPrim (material, camera, renderBuffer)', () => {
  it('material is HdUtils.ConvertHdMaterialNetworkToHdMaterialSchema(GetMaterialResource)', () => {
    const d = newDelegate()
    const node = new HdMaterialNode()
    node.path = '/material/surface'
    node.identifier = 'UsdPreviewSurface'
    node.parameters.set('roughness', 0.25)
    const network = new HdMaterialNetwork()
    network.nodes.push(node)
    const map = new HdMaterialNetworkMap()
    map.map.set('surface', network)
    d.addMaterialResource('/material', VtValue.create(map, TfType.declare('HdMaterialNetworkMap')))

    const prim = HdDataSourceLegacyPrim.new('/material', HdPrimTypeTokens.material, d)
    expect(prim.getNames()).toContain('material')
    const held = d.getMaterialResource('/material').Get<HdMaterialNetworkMap>()
    const expectedDs = HdUtils.convertHdMaterialNetworkToHdMaterialSchema(held)
    expect(flatten(prim.Get('material'))).toEqual(flatten(expectedDs))

    d.addMaterialResource('/empty', VtValue.getEmpty())
    expect(HdDataSourceLegacyPrim.new('/empty', HdPrimTypeTokens.material, d)
      .Get('material')).toBeUndefined()
  })

  it('camera params are GetCameraParamValue, smoothed into schema types', () => {
    const d = newDelegate()
    d.addCamera('/camera')
    d.updateCamera('/camera', 'focalLength', VtValue.create(35, VtValueTypes.float))
    d.updateCamera('/camera', 'projection',
      VtValue.create(HdCamera.Orthographic, TfType.declare('HdCameraProjection')))
    d.updateCamera('/camera', 'clippingRange',
      VtValue.create(new GfRange1f(0.5, 500), TfType.declare('GfRange1f')))
    d.updateCamera('/camera', 'focusOn', VtValue.create(true, VtValueTypes.bool))

    const prim = HdDataSourceLegacyPrim.new('/camera', HdPrimTypeTokens.camera, d)
    expect(prim.getNames()).toContain('camera')
    const cam = prim.Get('camera')
    const fl = at(cam, 'focalLength') as HdSampledDataSource & { getTypedValue(t: number): unknown }
    expect(fl.getTypedValue(0)).toBe(d.getCameraParamValue('/camera', 'focalLength').Get())
    expectSameVtValue(fl.GetValue(0), d.getCameraParamValue('/camera', 'focalLength'))
    expect(value(at(cam, 'projection'))).toBe('orthographic')
    const range = d.getCameraParamValue('/camera', 'clippingRange').Get<GfRange1f>()
    expect((value(at(cam, 'clippingRange')) as GfVec2f)
      .equals(new GfVec2f(range.getMin(), range.getMax()))).toBe(true)
    expect((at(cam, 'focusOn') as unknown as { getTypedValue(t: number): unknown })
      .getTypedValue(0)).toBe(true)
    // A float member the delegate does not answer is T() (dataSourceLegacyPrim.cpp:962-966).
    expect((at(cam, 'fStop') as unknown as { getTypedValue(t: number): unknown })
      .getTypedValue(0)).toBe(0)
    expect((value(at(prim.Get('xform'), 'matrix')) as { equals(o: unknown): boolean })
      .equals(d.getTransform('/camera'))).toBe(true)
  })

  it('renderBuffer is GetRenderBufferDescriptor', () => {
    const d = newDelegate()
    d.addRenderBuffer('/rb', new HdRenderBufferDescriptor([64, 32, 1], HdFormat.HdFormatFloat32Vec4, true))
    const prim = HdDataSourceLegacyPrim.new('/rb', HdPrimTypeTokens.renderBuffer, d)
    expect(prim.getNames()).toContain('renderBuffer')
    const desc = d.getRenderBufferDescriptor('/rb')
    const rb = prim.Get('renderBuffer')
    const dims = value(at(rb, 'dimensions')) as { get(i: number): number }
    expect([dims.get(0), dims.get(1), dims.get(2)]).toEqual(desc.dimensions)
    expect(value(at(rb, 'format'))).toBe(desc.format)
    expect(value(at(rb, 'multiSampled'))).toBe(desc.multiSampled)
  })
})

// Flatten a data source tree to plain values for comparison.
function flatten(ds: HdDataSourceBase | undefined): unknown {
  if (ds instanceof HdContainerDataSource) {
    return Object.fromEntries([...ds.getNames()].sort().map(n => [n, flatten(ds.Get(n))]))
  }
  if (ds instanceof HdVectorDataSource) {
    return Array.from({ length: ds.getNumElements() }, (_, i) => flatten(ds.getElement(i)))
  }
  if (ds instanceof HdSampledDataSource) return ds.GetValue(0)
  return ds
}

// A scene delegate whose light / coordSys / volume / extComputation answers
// the tests supply (HdUnitTestDelegate does not answer these queries).
class AnswerDelegate extends HdSceneDelegate {
  lightParams = new Map<string, VtValue>()
  gets = new Map<string, VtValue>()
  coordSysBindings: string[] | null = null
  categories: string[] = []
  volumeFields: Array<{ fieldName: string, fieldPrimType: string, fieldId: string }> = []
  extInputs = new Map<string, VtValue>()
  override getLightParamValue(_id: string, name: string): VtValue {
    return this.lightParams.get(name) ?? VtValue.getEmpty()
  }
  override Get(_id: string, key: string): VtValue { return this.gets.get(key) ?? VtValue.getEmpty() }
  override getCoordSysBindings(): string[] | null { return this.coordSysBindings }
  override getCategories(): TfToken[] { return this.categories.map(c => TfToken(c)) }
  override getVolumeFieldDescriptors() {
    return this.volumeFields.map(f => ({ fieldName: TfToken(f.fieldName),
      fieldPrimType: TfToken(f.fieldPrimType), fieldId: f.fieldId }))
  }
  override getExtComputationSceneInputNames(): TfToken[] { return [...this.extInputs.keys()].map(k => TfToken(k)) }
  override getExtComputationInput(_id: string, input: string): VtValue {
    return this.extInputs.get(input) ?? VtValue.getEmpty()
  }
  override getExtComputationKernel(_id: string): string { return 'kernel source' }
  override getExtComputationInputDescriptors() {
    return [{ name: 'src', sourceComputationId: '/comp0', sourceComputationOutputName: 'out' }]
  }
  override getExtComputationOutputDescriptors() { return [{ name: 'points', valueType: 'vec3f' }] }
}

function newAnswerDelegate(): AnswerDelegate {
  return new AnswerDelegate(stubRenderIndex(), '/')
}

describe('HdDataSourceLegacyPrim (light, coordSys, categories, volume, extComputation)', () => {
  it('light params are GetLightParamValue; params/shadowParams/shadowCollection are Get', () => {
    const d = newAnswerDelegate()
    d.lightParams.set('intensity', VtValue.create(5, VtValueTypes.float))
    d.gets.set('params', VtValue.create({ simple: true }, TfType.declare('GlfSimpleLight')))
    const expr = new SdfPathExpression('/a')
    d.lightParams.set('lightLinkCollectionMembershipExpression',
      VtValue.create(expr, TfType.declare('SdfPathExpression')))
    const prim = HdDataSourceLegacyPrim.new('/light', HdPrimTypeTokens.sphereLight, d)
    for (const n of ['material', 'xform', 'light', 'collections', '__dependencies', 'instancedBy']) {
      expect(prim.getNames()).toContain(n)
    }
    expect(value(at(prim.Get('light'), 'intensity'))).toBe(d.getLightParamValue('/light', 'intensity').Get())
    expectSameVtValue(value(at(prim.Get('light'), 'params')), d.Get('/light', 'params'))
    expect(at(prim.Get('light'), 'shadowParams')).toBeInstanceOf(HdSampledDataSource)
    expect(at(prim.Get('light'), 'exposure')).toBeUndefined()
    expect(value(at(prim.Get('collections'), 'lightLink', 'membershipExpression'))).toBe(
      d.getLightParamValue('/light', 'lightLinkCollectionMembershipExpression').Get())
    expect(at(prim.Get('collections'), 'shadowLink')).toBeUndefined()
  })

  it('a mesh whose isLight param is true is also a light', () => {
    const d = newAnswerDelegate()
    d.lightParams.set('isLight', VtValue.create(true, VtValueTypes.bool))
    const prim = HdDataSourceLegacyPrim.new('/meshLight', HdPrimTypeTokens.mesh, d)
    expect(prim.getNames()).toContain('light')
    expect(prim.Get('collections')).toBeInstanceOf(HdContainerDataSource)
  })

  it('coordSysBinding names are the coordSys:<name>:binding names of GetCoordSysBindings', () => {
    const d = newAnswerDelegate()
    d.coordSysBindings = ['/obj.coordSys:foo:binding', '/obj.coordSys:bar']
    const prim = HdDataSourceLegacyPrim.new('/obj', HdPrimTypeTokens.mesh, d)
    const csb = container(prim.Get('coordSysBinding'))
    expect(csb.getNames()).toEqual(['foo', 'bar'])
    expect(value(csb.Get('foo'))).toBe(d.coordSysBindings[0])
    expect(value(csb.Get('bar'))).toBe(d.coordSysBindings[1])
  })

  it('categories include GetCategories', () => {
    const d = newAnswerDelegate()
    d.categories = ['lightA', 'lightB']
    const prim = HdDataSourceLegacyPrim.new('/obj', HdPrimTypeTokens.mesh, d)
    expect([...container(prim.Get('categories')).getNames()].sort()).toEqual(['lightA', 'lightB'])
  })

  it('volumeFieldBinding is GetVolumeFieldDescriptors; volumeField members are Get', () => {
    const d = newAnswerDelegate()
    d.volumeFields = [{ fieldName: 'density', fieldPrimType: 'openvdbAsset', fieldId: '/vol/density' }]
    const vol = HdDataSourceLegacyPrim.new('/vol', HdPrimTypeTokens.volume, d)
    expect(value(at(vol.Get('volumeFieldBinding'), 'density'))).toBe('/vol/density')
    expect(HdLegacyPrimTypeIsVolumeField('openvdbAsset')).toBe(true)
    d.gets.set('filePath', VtValue.create('a.vdb', VtValueTypes.string))
    const field = HdDataSourceLegacyPrim.new('/vol/density', 'openvdbAsset', d)
    expect(field.getNames()).toContain('volumeField')
    expect(value(at(field.Get('volumeField'), 'filePath'))).toBe(d.Get('/vol/density', 'filePath').Get())
  })

  it('extComputation members are the GetExtComputation* answers', () => {
    const d = newAnswerDelegate()
    d.extInputs.set('scale', VtValue.create(2, VtValueTypes.float))
    const prim = HdDataSourceLegacyPrim.new('/comp', HdPrimTypeTokens.extComputation, d)
    const comp = prim.Get('extComputation')
    expect(container(at(comp, 'inputValues')).getNames()).toEqual(['scale'])
    expectSameVtValue(value(at(comp, 'inputValues', 'scale')), d.getExtComputationInput('/comp', 'scale'))
    expect(value(at(comp, 'inputComputations', 'src', 'sourceComputation'))).toBe('/comp0')
    expect(value(at(comp, 'inputComputations', 'src', 'sourceComputationOutputName'))).toBe('out')
    expect(value(at(comp, 'outputs', 'points', 'valueType'))).toBe('vec3f')
    expect(value(at(comp, 'glslKernel'))).toBe(d.getExtComputationKernel('/comp'))
    expect(value(at(comp, 'dispatchCount'))).toBe(0)
  })
})

class RecordingTask extends HdTask {
  constructor(readonly delegate: HdSceneDelegate, id: string) { super(id) }
  sync(): void {}
  Prepare(): void {}
  Execute(_ctx: HdTaskContext): void {}
}

describe('HdDataSourceLegacyTaskPrim', () => {
  it('task parameters / collection / renderTags / factory', () => {
    const d = newDelegate()
    const task = new RecordingTask(d, '/task')
    d.addTask('/task', task)
    d.updateTask('/task', HdTokens.params, VtValue.create(1.5, VtValueTypes.double))
    const collection = new HdRprimCollection('geometry', new HdReprSelector('hull'))
    d.updateTask('/task', HdTokens.collection,
      VtValue.create(collection, TfType.declare('HdRprimCollection')))
    d.updateTask('/task', HdTokens.renderTags,
      VtValue.create([TfToken('geometry')], TfType.declare('TfTokenVector')))

    const si = HdLegacyPrimSceneIndex.new()
    const factory = HdMakeLegacyTaskFactory(RecordingTask)
    si.addLegacyTask('/task', d, factory)
    const prim = si.getPrim('/task')
    expect(prim.primType).toBe('task')
    const t = at(prim.dataSource, 'task')
    expectSameVtValue(value(at(t, 'parameters')), d.Get('/task', HdTokens.params))
    expect(value(at(t, 'collection'))).toBe(d.Get('/task', HdTokens.collection).Get())
    expect(value(at(t, 'renderTags'))).toEqual(d.Get('/task', HdTokens.renderTags).Get())
    expect(value(at(t, 'factory'))).toBe(factory)
    const created = factory.create(d, '/task') as RecordingTask
    expect(created).toBeInstanceOf(RecordingTask)
    expect(created.getId()).toBe('/task')
    expect(created.delegate).toBe(d)
  })
})

class RecordingObserver implements HdSceneIndexObserver {
  added: AddedPrimEntry[] = []
  removed: RemovedPrimEntry[] = []
  dirtied: DirtiedPrimEntry[] = []
  primsAdded(_s: HdSceneIndexBase, e: AddedPrimEntry[]): void { this.added.push(...e) }
  primsRemoved(_s: HdSceneIndexBase, e: RemovedPrimEntry[]): void { this.removed.push(...e) }
  primsDirtied(_s: HdSceneIndexBase, e: DirtiedPrimEntry[]): void { this.dirtied.push(...e) }
  primsRenamed(_s: HdSceneIndexBase, _e: RenamedPrimEntry[]): void {}
}

describe('HdLegacyPrimSceneIndex (legacyPrimSceneIndex.cpp)', () => {
  it('AddLegacyPrim adds an HdDataSourceLegacyPrim of the given type', () => {
    const d = cubeScene()
    const si = HdLegacyPrimSceneIndex.new()
    const obs = new RecordingObserver()
    si.addObserver(obs)
    si.addLegacyPrim('/cube', HdPrimTypeTokens.mesh, d)
    expect(obs.added).toEqual([{ primPath: '/cube', primType: 'mesh' }])
    const prim = si.getPrim('/cube')
    expect(prim.primType).toBe('mesh')
    expect(prim.dataSource).toBeInstanceOf(HdDataSourceLegacyPrim)
    expect(value(at(prim.dataSource, 'sceneDelegate'))).toBe(d)
  })

  it('RemovePrim keeps a prim with children as a typeless empty prim', () => {
    const d = cubeScene()
    const si = HdLegacyPrimSceneIndex.new()
    si.addLegacyPrim('/instancer', HdPrimTypeTokens.instancer, d)
    si.addLegacyPrim('/instancer/cube', HdPrimTypeTokens.mesh, d)
    const obs = new RecordingObserver()
    si.addObserver(obs)
    si.removePrim('/instancer')
    expect(obs.added).toEqual([{ primPath: '/instancer', primType: '' }])
    expect(obs.removed).toEqual([])
    expect(si.getPrim('/instancer').primType).toBe('')
    expect(si.getPrim('/instancer/cube').primType).toBe('mesh')
    si.removePrim('/instancer/cube')
    expect(obs.removed).toEqual([{ primPath: '/instancer/cube' }])
  })

  it('DirtyPrims on primvars rebuilds the cached primvars from GetPrimvarDescriptors', () => {
    const d = cubeScene()
    const si = HdLegacyPrimSceneIndex.new()
    si.addLegacyPrim('/cube', HdPrimTypeTokens.mesh, d)
    const ds = si.getPrim('/cube').dataSource!
    const before = container(ds.Get('primvars')).getNames()
    expect(before).not.toContain('extra')
    d.addPrimvar('/cube', 'extra', VtValue.create(1, VtValueTypes.float),
      HdInterpolation.HdInterpolationConstant, '')
    // Cached until dirtied.
    expect(container(ds.Get('primvars')).getNames()).not.toContain('extra')
    // A locator the cache does not hold leaves the cache.
    si.dirtyPrims([{ primPath: '/cube',
      dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('xform')]) }])
    expect(container(ds.Get('primvars')).getNames()).not.toContain('extra')
    const obs = new RecordingObserver()
    si.addObserver(obs)
    si.dirtyPrims([{ primPath: '/cube',
      dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('primvars', 'extra')]) }])
    expect(obs.dirtied.map(e => e.primPath)).toEqual(['/cube'])
    expect(container(ds.Get('primvars')).getNames()).toContain('extra')
  })

  it('DirtyPrims on instancerTopology drops the cached instancer topology', () => {
    const d = cubeScene()
    const si = HdLegacyPrimSceneIndex.new()
    si.addLegacyPrim('/instancer', HdPrimTypeTokens.instancer, d)
    const ds = si.getPrim('/instancer').dataSource!
    const topo = ds.Get('instancerTopology')
    si.dirtyPrims([{ primPath: '/instancer',
      dirtyLocators: new HdDataSourceLocatorSet([new HdDataSourceLocator('instancerTopology')]) }])
    expect(ds.Get('instancerTopology')).not.toBe(topo)
  })
})

// HdResampleNeighbors over quaternion primvar samples (timeSampleArray.h:22-50,
// timeSampleArray.cpp:83-110), reached through the legacy primvar value's
// resampling at a shutter offset between two samples at times 0 and 1, so
// the offset is the blend alpha. Expected values: the capture in
// fixtures/resampleNeighbors calls the native HdResampleNeighbors.
class QuatSampleDelegate extends HdSceneDelegate {
  samples: [VtValue, VtValue] = [VtValue.getEmpty(), VtValue.getEmpty()]
  override samplePrimvar(_id: string, _key: TfToken | string, ...args: unknown[]): any {
    const sa = args.find(a => a instanceof HdTimeSampleArray) as HdTimeSampleArray<VtValue>
    sa.resize(2)
    sa.times[0] = 0
    sa.times[1] = 1
    sa.values[0] = this.samples[0]
    sa.values[1] = this.samples[1]
  }
}

describe('HdResampleNeighbors over quaternion primvar samples', () => {
  const fixture = readOracleFixture(new URL('./fixtures/resampleNeighbors/expected.json', import.meta.url))
  type Comps = [number, number, number, number]
  const ctors: Record<string, new (r: number, i: number, j: number, k: number) => unknown> = {
    GfQuatf: GfQuatf, GfQuatd: GfQuatd, GfQuath: GfQuath,
  }
  const make = (type: string, c: Comps) => new ctors[type]!(c[0], c[1], c[2], c[3])
  const comps = (q: unknown): Comps => {
    const quat = q as { GetReal(): number, GetImaginary(): { get(i: number): number } }
    const im = quat.GetImaginary()
    return [quat.GetReal(), im.get(0), im.get(1), im.get(2)]
  }
  const resample = (v0: VtValue, v1: VtValue, alpha: number): VtValue => {
    const d = new QuatSampleDelegate(stubRenderIndex(), '/')
    d.samples = [v0, v1]
    return Hd_DataSourceLegacyPrimvarValue.new(TfToken('orient'), '/prim', d).GetValue(alpha)
  }

  for (const c of fixture.scalar as Array<{ type: string, alpha: number, q0: Comps, q1: Comps, result: Comps }>) {
    it(`${c.type} at alpha ${c.alpha}`, () => {
      const type = VtValueTypes[c.type as 'GfQuatf']
      const r = resample(VtValue.create(make(c.type, c.q0), type), VtValue.create(make(c.type, c.q1), type), c.alpha)
      expect(r.getType()).toBe(type)
      expect(comps(r.Get())).toEqual(c.result)
    })
  }

  it('VtArray<GfQuatf> resamples per element', () => {
    const a = fixture.array as { alpha: number, a0: Comps[], a1: Comps[], result: Comps[] }
    const arr = (cs: Comps[]) => VtValue.createArray(new VtArray(cs.map(q => make('GfQuatf', q)), VtValueTypes.GfQuatf))
    const r = resample(arr(a.a0), arr(a.a1), a.alpha)
    expect([...(r.Get() as Iterable<unknown>)].map(comps)).toEqual(a.result)
  })
})

// _ConvertRenderTerminalResourceToHdDataSource (dataSourceLegacyPrim.cpp:
// 2597-2640): a resource VtValue holding an HdMaterialNode2 becomes the
// schema's resource node; any other value gives no data source.
describe('integrator / sampleFilter / displayFilter resources (HdMaterialNode2)', () => {
  for (const primType of [HdPrimTypeTokens.integrator, HdPrimTypeTokens.sampleFilter,
    HdPrimTypeTokens.displayFilter]) {
    it(`${primType} resource`, () => {
      const d = newAnswerDelegate()
      const node = new HdMaterialNode2()
      node.nodeTypeId = 'PxrPathTracer'
      node.parameters.set('maxPathLength', VtValue.create(10, VtValueTypes.int))
      d.gets.set('resource', VtValue.create(node, HdMaterialNode2Type))
      const prim = HdDataSourceLegacyPrim.new('/terminal', primType, d)
      const resource = at(prim.Get(primType), 'resource')
      expect(value(at(resource, 'nodeIdentifier'))).toBe(node.nodeTypeId)
      expectSameVtValue(value(at(resource, 'parameters', 'maxPathLength', 'value')),
        node.parameters.get('maxPathLength') as VtValue)
      expect(container(at(resource, 'inputConnections')).getNames()).toEqual([])

      // IsHolding<HdMaterialNode2>: another held value gives no data source.
      d.gets.set('resource', VtValue.create({ nodeTypeId: 'x', parameters: new Map() }, HdMaterialNode2Type))
      expect(HdDataSourceLegacyPrim.new('/terminal', primType, d).Get(primType)).toBeUndefined()
    })
  }
})

// Hd_DataSourceRenderSettings renderProducts (dataSourceLegacyPrim.cpp:
// 2103-2184, 2186-2291): a value holding HdRenderSettings::RenderProducts
// becomes the vector of render product schemas; any other value gives none.
// HdRenderSettings::Sync (renderSettings.cpp:195-288) reads the same answers.
describe('render settings (HdRenderSettings::RenderProducts)', () => {
  function product(): HdRenderSettingsRenderProduct {
    const p = new HdRenderSettingsRenderProduct()
    p.productPath = '/Render/Product'
    p.type = TfToken('raster')
    p.name = TfToken('beauty.exr')
    p.resolution = new GfVec2i(640, 480)
    p.cameraPath = '/Camera'
    p.pixelAspectRatio = 2
    p.aspectRatioConformPolicy = TfToken('adjustApertureWidth')
    p.apertureSize = new GfVec2f(36, 24)
    p.dataWindowNDC = new GfRange2f(new GfVec2f(0, 0), new GfVec2f(1, 1))
    p.disableMotionBlur = true
    const rv = new HdRenderSettingsRenderVar()
    rv.varPath = '/Render/Vars/color'
    rv.dataType = TfToken('color3f')
    rv.sourceName = 'Ci'
    rv.sourceType = TfToken('lpe')
    p.renderVars = [rv]
    return p
  }

  it('renderProducts holds the delegate answer', () => {
    const d = newAnswerDelegate()
    const products = [product()]
    d.gets.set('renderProducts', VtValue.create(products, HdRenderSettingsRenderProductsType))
    const prim = HdDataSourceLegacyPrim.new('/Render/Settings', HdPrimTypeTokens.renderSettings, d)
    const vec = at(prim.Get('renderSettings'), 'renderProducts') as HdVectorDataSource
    expect(vec.getNumElements()).toBe(1)
    const p = products[0]!
    const ds = vec.getElement(0)
    expect(value(at(ds, 'path'))).toBe(p.productPath)
    expect(value(at(ds, 'type'))).toBe(p.type)
    expect(value(at(ds, 'name'))).toBe(p.name)
    expect((value(at(ds, 'resolution')) as GfVec2i).equals(p.resolution)).toBe(true)
    expect(value(at(ds, 'cameraPrim'))).toBe(p.cameraPath)
    expect(value(at(ds, 'pixelAspectRatio'))).toBe(p.pixelAspectRatio)
    expect(value(at(ds, 'aspectRatioConformPolicy'))).toBe(p.aspectRatioConformPolicy)
    expect(value(at(ds, 'disableMotionBlur'))).toBe(p.disableMotionBlur)
    const vars = at(ds, 'renderVars') as HdVectorDataSource
    expect(vars.getNumElements()).toBe(1)
    expect(value(at(vars.getElement(0), 'path'))).toBe(p.renderVars[0]!.varPath)
    expect(value(at(vars.getElement(0), 'sourceType'))).toBe(p.renderVars[0]!.sourceType)

    // IsHolding<RenderProducts>: other held values give no data source.
    d.gets.set('renderProducts', VtValue.create([{ productPath: '/x', renderVars: [] }],
      HdRenderSettingsRenderProductsType))
    expect(at(HdDataSourceLegacyPrim.new('/Render/Settings', HdPrimTypeTokens.renderSettings, d)
      .Get('renderSettings'), 'renderProducts')).toBeUndefined()
  })

  it('HdRenderSettings::Sync reads the delegate answers', () => {
    const d = newAnswerDelegate()
    const products = [product()]
    d.gets.set('renderProducts', VtValue.create(products, HdRenderSettingsRenderProductsType))
    d.gets.set('active', VtValue.create(true, VtValueTypes.bool))
    d.gets.set('disableDepthOfField', VtValue.create(true, VtValueTypes.bool))
    const rs = new HdRenderSettings('/Render/Settings')
    const bits = { value: rs.getInitialDirtyBitsMask() }
    expect(bits.value).toBe(HdRenderSettingsDirtyBits.AllDirty)
    rs.sync(d, null, bits)
    expect(bits.value).toBe(0)
    expect(rs.isActive()).toBe(true)
    expect(rs.getDisableDepthOfField()).toBe(true)
    expect(rs.getDisableMotionBlur()).toBe(false)
    expect(rs.getRenderProducts().length).toBe(1)
    expect(rs.getRenderProducts()[0]!.equals(products[0]!)).toBe(true)
    expect(rs.isValid()).toBe(true)
    expect(rs.getAndResetHasDirtyProducts()).toBe(true)
    expect(rs.getAndResetHasDirtyProducts()).toBe(false)
  })
})
