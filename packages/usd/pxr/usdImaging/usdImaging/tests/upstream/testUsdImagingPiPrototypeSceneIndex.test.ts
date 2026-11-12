// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingPiPrototypeSceneIndex.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingPiPrototypeSceneIndex.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:416-419
// (no baseline; the checks are those of the upstream test source).
//
// The prim adapters the scene needs are registered here because the adapter
// registration of plugInfo.ts is done separately.
import { describe, expect, it } from 'vitest'
import type { AddedPrimEntry, DirtiedPrimEntry, RemovedPrimEntry, SceneIndexObserver as HdSceneIndexObserver } from 'typescript-usd/hd'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingAdapterRegistry } from '../../src/adapterRegistry.ts'
import { UsdImagingCubeAdapter } from '../../src/cubeAdapter.ts'
import { UsdImagingPiPrototypePropagatingSceneIndex } from '../../src/piPrototypePropagatingSceneIndex.ts'
import { UsdImagingPointInstancerAdapter } from '../../src/pointInstancerAdapter.ts'
import { UsdImagingStageSceneIndex } from '../../src/stageSceneIndex.ts'

UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingCubeAdapter', isInternal: true, primTypeName: 'Cube', primAdapterFactory: () => new UsdImagingCubeAdapter() },
  { typeName: 'UsdImagingPointInstancerAdapter', isInternal: true, primTypeName: 'PointInstancer', primAdapterFactory: () => new UsdImagingPointInstancerAdapter() },
])

const _HasPrefix = (path: string, prefix: string) =>
  prefix === '/' ? true : path === prefix || path.startsWith(prefix + '/')

/** testUsdImagingPiPrototypeSceneIndex.cpp:15-82 PrimListener */
class PrimListener implements HdSceneIndexObserver {
  private readonly _prims = new Set<string>()
  private _added: AddedPrimEntry[] = []
  private _dirtied: DirtiedPrimEntry[] = []
  primsAdded(_sender: unknown, entries: AddedPrimEntry[]): void {
    for (const entry of entries) this._prims.add(entry.primPath)
    this._added.push(...entries)
  }
  primsRemoved(_sender: unknown, entries: RemovedPrimEntry[]): void {
    for (const entry of entries) {
      for (const p of [...this._prims]) if (_HasPrefix(p, entry.primPath)) this._prims.delete(p)
    }
  }
  primsDirtied(_sender: unknown, entries: DirtiedPrimEntry[]): void {
    this._dirtied.push(...entries)
  }
  primsRenamed(): void {}
  getAdded(): AddedPrimEntry[] { return this._added }
  resetEntries(): void {
    this._added = []
    this._dirtied = []
  }
}

/** testUsdImagingPiPrototypeSceneIndex.cpp:84-90 */
async function _StageFromUsda(usda: string): Promise<UsdStage> {
  const rootLayer = SdfLayer.createAnonymous('.usda')
  expect(rootLayer.importFromString(usda)).toBe(true)
  return UsdStage.open(rootLayer)
}

describe('testUsdImagingPiPrototypeSceneIndex', () => {
  /** testUsdImagingPiPrototypeSceneIndex.cpp:92-193 */
  it('ChangeSpecifierTest', async () => {
    // This is a test that asserts some assumptions that the
    // UsdImaging_PiPrototypeSceneIndex is making.
    //
    // Specifically, after a prim is no longer a prototype (i.e. if an "over"
    // becomes a "def" or a prim changes type from PointInstancer to Scope),
    // the UsdImaging_PiPrototypeSceneIndex is assuming the upstream scene
    // index will send added entries for the children.
    const stage = await _StageFromUsda(`#usda 1.0
over "Over"
{
    def Cube "Prototype0"
    {
    }
}

def PointInstancer "PointInstancer"
{
    def Cube "Prototype1"
    {
    }
}

`)
    const inputSi = UsdImagingStageSceneIndex.new()
    const si = UsdImagingPiPrototypePropagatingSceneIndex.new(inputSi)
    const primListener = new PrimListener()
    si.addObserver(primListener)

    primListener.resetEntries()
    inputSi.SetStage(stage)

    const _GetPrimTypeForAddedEntry = (entries: AddedPrimEntry[], primPath: string): string | undefined => {
      for (const entry of entries) {
        if (entry.primPath === primPath) {
          return entry.primType
        }
      }
      return undefined
    }

    const proto0 = '/Over/Prototype0'

    // since `/Over` is an over, if we encounter `Prototype0`, it should *not*
    // have primType==mesh.  For now, we assert that it is empty (or not added
    // at all).
    expect(_GetPrimTypeForAddedEntry(primListener.getAdded(), proto0) ?? '').toBe('')
    primListener.resetEntries()

    const overPrim = stage.getPrim('/Over')!
    expect(overPrim).toBeTruthy()
    overPrim.setSpecifier('def')
    inputSi.ApplyPendingUpdates()

    {
      const maybeProto0Type = _GetPrimTypeForAddedEntry(primListener.getAdded(), proto0)
      // Make sure we got an added entry for our prototype
      expect(maybeProto0Type).toBeDefined()
      // Make sure it was some non-empty type
      expect(maybeProto0Type).not.toBe('')
      expect(si.getPrim(proto0).primType).not.toBe('')
    }
    primListener.resetEntries()

    // Same test as above, but here, we're changing the PointInstancer to being
    // just a normal Scope
    const proto1 = '/PointInstancer/Prototype1'

    const piPrim = stage.getPrim('/PointInstancer')!
    expect(piPrim).toBeTruthy()
    piPrim.setTypeName('Scope')
    inputSi.ApplyPendingUpdates()

    {
      const maybeProto1Type = _GetPrimTypeForAddedEntry(primListener.getAdded(), proto1)
      // Make sure we got an added entry for our prototype
      expect(maybeProto1Type).toBeDefined()
      // Make sure it was some non-empty type
      expect(maybeProto1Type).not.toBe('')
      expect(si.getPrim(proto1).primType).not.toBe('')
    }
  })
})
