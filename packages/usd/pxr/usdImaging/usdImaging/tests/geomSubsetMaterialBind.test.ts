// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderDelegate.cpp,
//  pxr/imaging/hd/sceneIndexAdapterSceneDelegate.cpp,
//  pxr/imaging/hdSt/mesh.cpp, pxr/imaging/hdSt/renderDelegate.cpp,
//  pxr/usd/usdGeom/subset.cpp, pxr/usd/usdShade/materialBindingAPI.cpp,
//  and 3 more cited below
// Copyright 2016, 2017, 2021, 2023 Pixar. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GeomSubset material binding, from UsdShade to Storm's draw items, for
// fixtures/geomSubsetMaterialBind/subsets.usda: a mesh of three faces in one
// materialBind partition, one face subset per face, each bound to its own
// material; /Root is invisible at the default time and visible from time 1.
// Expected values are the reference build's (fixtures/geomSubsetMaterialBind,
// FIXTURES.md):
//
// - binding.json: UsdShadeMaterialBindingAPI::ComputeBoundMaterial
//   (materialBindingAPI.cpp) on the mesh and its subsets, the materialBind
//   family (GetMaterialBindSubsets, GetMaterialBindSubsetsFamilyType) and
//   UsdGeomSubset's attributes and GetFamilyType (subset.cpp).
// - hydra.txt: UsdImagingCreateSceneIndices (sceneIndices.cpp) inserted into
//   an HdRenderIndex, at the default time, then after SetTime(1) and
//   SetTime(2): what HdSceneIndexAdapterSceneDelegate hands the mesh rprim
//   (sceneIndexAdapterSceneDelegate.cpp:602-675 _GatherGeomSubsets: the geom
//   subsets with their bound material ids, the faces of invisible subsets as
//   invisible faces) and the geomSubset prims' data sources
//   (geomSubsetAdapter.cpp, materialBindingsResolvingSceneIndex.cpp).
//
// The native capture runs the render index over Hd_UnitTestNullRenderDelegate;
// here it is HdStRenderDelegate (Storm's material binding purpose is the same,
// preview: hdSt/renderDelegate.cpp, hd/renderDelegate.cpp), so the same sync
// also builds HdStMesh's draw items: one per geom subset after the main one,
// each with the material network shader of its subset's material
// (hdSt/mesh.cpp:390-475 _UpdateDrawItemsForGeomSubsets), the main one
// drawing the faces outside the subsets (mesh.cpp:953-960, none here: the
// family is a partition). Time 1 is the case seen in a larger scene: the
// subsets appear on a mesh that was first synced with all faces invisible.
//
// Controller test (Node): no GPU. Resources are committed on the recording
// test Hgi (hdSt/tests/pipelineDrawBatchTestHgi.ts) so the subset draw
// items' topology ranges can be read back.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  GeomSubsetSchema as HdGeomSubsetSchema,
  MaterialBindingSchema as HdMaterialBindingSchema,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  RenderIndex as HdRenderIndex,
  ReprTokens as HdReprTokens,
  SceneIndexPrimView as HdSceneIndexPrimView,
  VisibilitySchema as HdVisibilitySchema,
  type ContainerDataSource as HdContainerDataSource,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { HgiTokens } from 'typescript-usd/hgi'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { Subset as UsdGeomSubset } from 'typescript-usd/usdGeom'
import { MaterialBindingAPI as UsdShadeMaterialBindingAPI } from 'typescript-usd/usdShade'
import { UsdImagingCreateSceneIndices } from '../src/sceneIndices.ts'
import type { HdStDrawItem } from '../../../imaging/hdSt/src/drawItem.ts'
import { HdStMesh } from '../../../imaging/hdSt/src/mesh.ts'
import { HdStRenderDelegate } from '../../../imaging/hdSt/src/renderDelegate.ts'
import { HdSt_RegisterShaderResources } from '../../../imaging/hdSt/src/shaderResources.ts'
import { PipelineDrawBatchTestHgi } from '../../../imaging/hdSt/tests/pipelineDrawBatchTestHgi.ts'

const fixtures = new URL('./fixtures/geomSubsetMaterialBind/', import.meta.url)
const fixture = new URL('subsets.usda', fixtures).pathname
const MESH = '/Root/Tiles'

interface _Bound { material: string | null, bindingRel: string | null }
interface _Entry {
  allPurpose: _Bound
  preview: _Bound
  materialBindSubsets?: string[]
  materialBindSubsetsFamilyType?: string
  familyType?: string
  familyName?: string
  elementType?: string
  indices?: number[]
}
const binding = (JSON.parse(readFileSync(new URL('binding.json', fixtures), 'utf8')) as
  { payload: { prims: Record<string, _Entry> } }).payload.prims

/** hydra.txt, split into its blocks ("== <label>" to the next). */
function _NativeBlocks(): Map<string, string[]> {
  const blocks = new Map<string, string[]>()
  let current: string[] | null = null
  for (const line of readFileSync(new URL('hydra.txt', fixtures), 'utf8').split('\n')) {
    if (line.startsWith('== ')) {
      current = []
      blocks.set(line.slice(3), current)
    } else if (current && line !== '' && line !== 'OK') {
      current.push(line)
    }
  }
  return blocks
}

/** The native capture's _Ints */
const _Ints = (a: ArrayLike<number>) => `[${Array.from(a).join(', ')}]`

/** The native capture's _PrintBlock, without the "== label" line. */
function _Block(index: HdRenderIndex, si: HdSceneIndexBase): string[] {
  const lines: string[] = []
  for (const id of index.getRprimIds().sort()) {
    if (si.getPrim(id).primType !== 'mesh') continue
    const delegate = index.getSceneDelegateForRprim(id)!
    const topology = delegate.getMeshTopology(id)
    lines.push(`rprim ${id} materialId=${delegate.getMaterialId(id)}` +
      ` visible=${delegate.getVisible(id) ? 1 : 0}` +
      ` invisibleFaces=${_Ints(topology.getInvisibleFaces())}`)
    for (const subset of topology.getGeomSubsets()) {
      lines.push(`  subset ${subset.id} type=${subset.type}` +
        ` materialId=${subset.materialId} indices=${_Ints(subset.indices)}`)
    }
  }
  for (const path of new HdSceneIndexPrimView(si)) {
    const prim = si.getPrim(path)
    if (prim.primType !== 'geomSubset') continue
    let line = `geomSubset ${path}`
    const subset = HdGeomSubsetSchema.getFromParent(prim.dataSource)
    const type = subset.getType()
    if (type) line += ` type=${type.getTypedValue(0.0)}`
    const indices = subset.getIndices()
    if (indices) line += ` indices=${_Ints(indices.getTypedValue(0.0) as ArrayLike<number>)}`
    const vis = HdVisibilitySchema.getFromParent(prim.dataSource).getVisibility()
    if (vis) line += ` visibility=${vis.getTypedValue(0.0) ? 1 : 0}`
    const container = HdMaterialBindingsSchema.getFromParent(prim.dataSource).getContainer()
    if (container) {
      for (const purpose of [...container.getNames()].sort()) {
        line += ` materialBindings[${purpose}]=`
        const b = new HdMaterialBindingSchema(container.Get(purpose) as HdContainerDataSource | undefined)
        const p = b.isDefined() ? b.getPath() : undefined
        line += !b.isDefined() ? 'null' : p ? String(p.getTypedValue(0.0)) : 'nopath'
      }
    }
    lines.push(line)
  }
  return lines
}

describe('GeomSubset material binding: UsdShade (reference build values)', async () => {
  const stage = (await UsdStage.open(fixture))!

  for (const [path, entry] of Object.entries(binding)) {
    it(`${path}: ComputeBoundMaterial for allPurpose and preview`, () => {
      for (const purpose of ['allPurpose', 'preview'] as const) {
        const r = UsdShadeMaterialBindingAPI.computeBoundMaterial(stage, path,
          purpose === 'allPurpose' ? '' : purpose)
        expect({ material: r?.materialPath ?? null, bindingRel: r?.bindingRelPath ?? null }, purpose)
          .toEqual(entry[purpose])
      }
    })
    if (entry.materialBindSubsets) {
      it(`${path}: the materialBind family`, () => {
        const api = new UsdShadeMaterialBindingAPI(stage.getPrim(path)!, stage)
        expect(api.getMaterialBindSubsets().map(p => p.path.toString())).toEqual(entry.materialBindSubsets)
        expect(api.getMaterialBindSubsetsFamilyType()).toBe(entry.materialBindSubsetsFamilyType)
        expect(UsdGeomSubset.getFamilyType(stage, path, 'materialBind')).toBe(entry.familyType)
      })
    } else {
      it(`${path}: familyName, elementType and indices`, () => {
        const prim = stage.getPrim(path)!
        expect(UsdGeomSubset.getFamilyName(prim)).toBe(entry.familyName)
        expect(UsdGeomSubset.getElementType(prim)).toBe(entry.elementType)
        expect(Array.from(UsdGeomSubset.getIndices(prim))).toEqual(entry.indices)
      })
    }
  }
})

describe('GeomSubset material binding: scene index, render index and HdStMesh draw items', async () => {
  HdSt_RegisterShaderResources()
  const native = _NativeBlocks()
  const stage = (await UsdStage.open(fixture))!
  const renderDelegate = new HdStRenderDelegate()
  renderDelegate.setDrivers([{ name: HgiTokens.renderDriver, driver: new PipelineDrawBatchTestHgi() }])
  const index = HdRenderIndex.new(renderDelegate)!
  const sceneIndices = UsdImagingCreateSceneIndices({ stage })
  index.insertSceneIndex(sceneIndices.finalSceneIndex, '/')

  const repr = HdReprTokens.refined
  const sync = () => {
    index.SyncAll(repr, /*commitResources=*/false)
    renderDelegate.CommitResources()
  }
  const drawItems = () =>
    (index.getRprim(MESH) as HdStMesh).getDrawItems(repr) as readonly HdStDrawItem[]
  const materialShader = (materialId: string) =>
    (index.getSprim('material', materialId) as unknown as { getMaterialNetworkShader(): unknown })
      .getMaterialNetworkShader()

  const states: { label: string, lines: string[], items: readonly HdStDrawItem[] }[] = []
  sync()
  states.push({ label: 'default', lines: _Block(index, sceneIndices.finalSceneIndex), items: [...drawItems()] })
  for (const time of [1, 2]) {
    sceneIndices.stageSceneIndex.SetTime(time)
    sync()
    states.push({ label: `time ${time}`, lines: _Block(index, sceneIndices.finalSceneIndex), items: [...drawItems()] })
  }

  for (const { label, lines } of states) {
    it(`${label}: the render index's mesh topology and the geomSubset prims match the reference build`, () => {
      expect(lines).toEqual(native.get(label))
    })
  }

  it('default: the invisible subsets make no draw items (mesh.cpp:390-475)', () => {
    expect(states[0]!.items.length).toBe(1)
  })

  for (const state of states.slice(1)) {
    it(`${state.label}: one draw item per subset, each with its subset's material (mesh.cpp:390-475, 953-975)`, () => {
      const subsets = state.lines.filter(l => l.startsWith('  subset '))
        .map(l => /materialId=(\S+) indices=\[([^\]]*)\]/.exec(l)!)
      expect(state.items.length).toBe(1 + subsets.length)
      // The partition leaves no face to the main draw item.
      expect(state.items[0]!.getTopologyRange()!.getNumElements()).toBe(0)
      state.items.slice(1).forEach((item, i) => {
        expect(item.getMaterialNetworkShader()).toBe(materialShader(subsets[i]![1]!))
        // The subset's faces' triangles, by their base face
        // (meshTopology.cpp:755-791 HdSt_GeomSubsetFaceIndexBuilderComputation).
        const coarse = item.getTopologyRange()!.ReadData('coarseFaceIndex') as { Get(): ArrayLike<number> }
        expect(Array.from(coarse.Get()).length).toBeGreaterThan(0)
      })
    })
  }
})
