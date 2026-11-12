// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsAuthoring.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsAuthoring.py
// (registered as testUsdUtilsAuthoring). The testenv directory
// testenv/testUsdUtilsAuthoring (collections.usda, dirtyLayer1-3.usda,
// Lamp.usda, layerWithMetadata.usda) is copied unmodified into
// fixtures/testUsdUtilsAuthoring (Copyright Pixar, TOST 1.0
// license, https://openusd.org/license). Upstream runs in a copy of
// that directory and writes new layers beside the inputs, so each test
// copies the fixtures into a temporary directory first.
//
// API mapping: Sdf.Layer.FindOrOpen / CreateNew and Usd.Stage.Open are
// asynchronous (Layer.findOrOpen, Layer.createNew, Stage.open);
// Usd.Stage.CreateInMemory is Stage.createNew(). layer.pseudoRoot is
// getPseudoRoot(); layer.subLayerOffsets is getSubLayerOffsets();
// subLayerPaths.append is insertSubLayerPath; subLayerOffsets[0] = x is
// setSubLayerOffset(x, 0); layer.defaultPrim = x is setDefaultPrim(x).
// Sdf.Layer.ColorConfigurationKey / ColorManagementSystemKey are the field
// names 'colorConfiguration' / 'colorManagementSystem'.
// UsdUtils.ComputeCollectionIncludesAndExcludes returns (includes,
// excludes) in Python; the C++ function fills two out arrays, so
// `inEx` below calls it and returns the pair as path strings.
// Tf.Notice.RegisterGlobally(Sdf.Notice.LayersDidChange, fn) is
// TfNotice.registerGlobally; `del key` is key.revoke().
// Usd.EditTarget(layer) is new EditTarget(layer); prim.GetAttribute is getAttr. Relationship targets and
// collection results are path strings.

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Layer, Notice as SdfNotice } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { CollectionAPI, EditTarget, Stage, TraverseInstanceProxies } from 'typescript-usd/usd'
import {
  UsdUtilsComputeCollectionIncludesAndExcludes, UsdUtilsCopyLayerMetadata,
  UsdUtilsCreateCollections, UsdUtilsGetDirtyLayers,
} from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsAuthoring')

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsAuthoring'))
  cpSync(TESTENV, dir, { recursive: true })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
const file = (name: string): string => path.join(dir, name)

const P = (s: string): SdfPath => SdfPath.fromString(s)

function inEx(
  includedRootPaths: SdfPath[], stage: Stage,
  opts: { minInclusionRatio?: number, minIncludeExcludeCollectionSize?: number, pathsToIgnore?: SdfPath[] } = {},
): [string[], string[]] {
  const includes: SdfPath[] = []
  const excludes: SdfPath[] = []
  UsdUtilsComputeCollectionIncludesAndExcludes(includedRootPaths, stage, includes, excludes,
    opts.minInclusionRatio ?? 0.75, 5, opts.minIncludeExcludeCollectionSize ?? 3,
    new Set((opts.pathsToIgnore ?? []).map(p => p.pathString)))
  return [includes.map(p => p.pathString), excludes.map(p => p.pathString)]
}

describe('TestUsdUtilsAuthoring', () => {
  it('test_CopyLayerMetadata', async () => {
    // Test CopyLayerMetadata()
    const source = await Layer.findOrOpen(file('layerWithMetadata.usda'))
    expect(source).toBeTruthy()

    const keysToCompare = source!.getPseudoRoot().listInfoKeys()
      .filter(x => !['subLayers', 'subLayerOffsets'].includes(x))

    const cpy = await Layer.createNew(file('cpy.usda'))
    expect(cpy).toBeTruthy()
    UsdUtilsCopyLayerMetadata(source, cpy)

    for (const key of ['subLayers', ...keysToCompare]) {
      expect(cpy!.getPseudoRoot().getInfo(key)).toEqual(source!.getPseudoRoot().getInfo(key))
    }
    // bug #127687 - can't use GetInfo() for subLayerOffsets
    expect(cpy!.getSubLayerOffsets()).toEqual(source!.getSubLayerOffsets())

    const cpyNoSublayers = await Layer.createNew(file('cpyNoSublayers.usda'))
    expect(cpyNoSublayers).toBeTruthy()
    UsdUtilsCopyLayerMetadata(source, cpyNoSublayers, true, true)
    expect(cpyNoSublayers!.getPseudoRoot().hasInfo('subLayers')).toBe(false)
    expect(cpyNoSublayers!.getPseudoRoot().hasInfo('subLayerOffsets')).toBe(false)
    for (const key of keysToCompare) {
      expect(cpyNoSublayers!.getPseudoRoot().getInfo(key)).toEqual(source!.getPseudoRoot().getInfo(key))
    }

    // Ensure that the color config fallbacks get stamped out when
    // bakeUnauthoredFallbacks is set to true.
    const colorConfigFallbacks = Stage.getColorConfigFallbacks()
    expect([
      cpyNoSublayers!.getPseudoRoot().getInfo('colorConfiguration'),
      cpyNoSublayers!.getPseudoRoot().getInfo('colorManagementSystem'),
    ]).toEqual(colorConfigFallbacks)
  })

  it('test_CopyLayerMetadataToLiveStage', () => {
    // Copying metadata into the root layer of an open stage must not let
    // the stage observe the subLayers and subLayerOffsets fields out of
    // sync with each other. Those two fields are correlated by index, so
    // UsdUtilsCopyLayerMetadata batches all of its writes into a single
    // change block; otherwise each SetInfo sends its own change
    // notification and the stage recomposes against an inconsistent layer.
    // We check this by looking for number of notices sent during the copy,
    // and by checking that the two correlated fields agree with the source
    // after the copy.

    // A source layer with a sublayer and a non-identity offset, so that
    // both of the correlated fields are copied.
    const sublayer = Layer.createAnonymous('.usda')

    const source = Layer.createAnonymous('.usda')
    source.insertSubLayerPath(sublayer.identifier)
    source.setSubLayerOffset({ offset: 10.0, scale: 2.0 }, 0)
    // Even though no prim is required for this test, adding another layer
    // metadata field in the mix along with subLayers and subLayersOffsets
    source.setDefaultPrim('main')

    // The destination must be the root layer of an open stage, so that
    // something is listening for change notices.
    const stage = Stage.createNew()
    const dest = stage.getRootLayer()

    let numNotices = 0
    const key = TfNotice.registerGlobally(SdfNotice.LayersDidChange, () => { numNotices += 1 })
    try {
      UsdUtilsCopyLayerMetadata(source, dest)
    } finally {
      key.revoke()
    }

    // All of the metadata writes must arrive as a single notice. Without
    // the change block this is one notice per metadata field.
    expect(numNotices).toBe(1)

    // The two correlated fields must agree with the source.
    expect(dest.getSubLayerPaths()).toEqual(source.getSubLayerPaths())
    expect(dest.getSubLayerOffsets()).toEqual(source.getSubLayerOffsets())
  })

  it('test_ComputeCollectionIncludesAndExcludes', async () => {
    const stage = await Stage.open(file('collections.usda'))
    expect(stage).toBeTruthy()

    const allCarPaths = [
      P('/World/City_set/Vehicles_grp/Cars_grp/CarA'),
      P('/World/City_set/Vehicles_grp/Cars_grp/CarB'),
      P('/World/City_set/Vehicles_grp/Cars_grp/CarC'),
      P('/World/City_set/Misc_grp/CarD'),
    ]

    // With default options.
    let expectedAllCarIncludes = [
      '/World/City_set/Vehicles_grp',
      '/World/City_set/Misc_grp/CarD',
    ]
    let expectedAllCarExcludes = [
      '/World/City_set/Vehicles_grp/Bikes_grp',
    ]
    let actualAllCarsInEx = inEx(allCarPaths, stage!)
    expect(actualAllCarsInEx).toEqual([expectedAllCarIncludes, expectedAllCarExcludes])

    // Force includes only with minInclusionRatio.
    expectedAllCarIncludes = [
      '/World/City_set/Vehicles_grp/Cars_grp',
      '/World/City_set/Misc_grp/CarD',
    ]
    expectedAllCarExcludes = []
    actualAllCarsInEx = inEx(allCarPaths, stage!, { minInclusionRatio: 1.0 })
    expect(actualAllCarsInEx).toEqual([expectedAllCarIncludes, expectedAllCarExcludes])

    // Ignored paths. By ignoring most of the Misc_grp (except CarD), we
    // should be able to make the include path the entire City_set, excluding
    // the Bikes_grp since it wasn't ignored.
    expectedAllCarIncludes = [
      '/World/City_set',
    ]
    expectedAllCarExcludes = [
      '/World/City_set/Vehicles_grp/Bikes_grp',
    ]
    let ignoredPaths = [
      P('/World/City_set/Misc_grp'),
      P('/World/City_set/Misc_grp/TruckA'),
      P('/World/City_set/Misc_grp/TruckA/Geom'),
      P('/World/City_set/Misc_grp/BicycleA'),
      P('/World/City_set/Misc_grp/BicycleA/Geom'),
      P('/World/City_set/Misc_grp/BikeE'),
      P('/World/City_set/Misc_grp/BikeE/Geom'),
      P('/World/City_set/Misc_grp/BikeF'),
      P('/World/City_set/Misc_grp/BikeF/Geom'),
    ]
    actualAllCarsInEx = inEx(allCarPaths, stage!, { pathsToIgnore: ignoredPaths })
    expect(actualAllCarsInEx).toEqual([expectedAllCarIncludes, expectedAllCarExcludes])

    // Ignored paths. Similar to the previous case, except also ignore some
    // (but not all) of Bikes_grp. The result shouldn't change, since only
    // some of Bikes_grp's paths are ignored during the algorithm.
    ignoredPaths = [
      P('/World/City_set/Misc_grp'),
      P('/World/City_set/Misc_grp/TruckA'),
      P('/World/City_set/Misc_grp/TruckA/Geom'),
      P('/World/City_set/Misc_grp/BicycleA'),
      P('/World/City_set/Misc_grp/BicycleA/Geom'),
      P('/World/City_set/Misc_grp/BikeE'),
      P('/World/City_set/Misc_grp/BikeE/Geom'),
      P('/World/City_set/Misc_grp/BikeF'),
      P('/World/City_set/Misc_grp/BikeF/Geom'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeA'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeA/Geom'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeB'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeB/Geom'),
    ]
    actualAllCarsInEx = inEx(allCarPaths, stage!, { pathsToIgnore: ignoredPaths })
    expect(actualAllCarsInEx).toEqual([expectedAllCarIncludes, expectedAllCarExcludes])

    // Single path in collection shouldn't cause infinite loop.
    // (Algorithm forced to run instead of early-outing because
    // minIncludeExcludeCollectionSize=1.)
    const singlePath = [
      P('/World/City_set/Vehicles_grp/Cars_grp/CarA'),
    ]
    const actualSingleInEx = inEx(singlePath, stage!, { minIncludeExcludeCollectionSize: 1 })
    expect(actualSingleInEx).toEqual([singlePath.map(p => p.pathString), []])

    // Ancestor paths should just pick the root path, and shouldn't
    // infinite loop either.
    const ancestorPaths = [
      P('/World'),
      P('/World/Room_set'),
      P('/World/Room_set/Table_grp'),
      P('/World/Room_set/Table_grp/Pencils_grp'),
      P('/World/Room_set/Table_grp/Pencils_grp/PencilA'),
      P('/World/Room_set/Table_grp/Pencils_grp/PencilA/Geom'),
    ]
    const expectedAncestorIncludes = ['/World']
    const expectedAncestorExcludes: string[] = []
    const ancestorInEx = inEx(ancestorPaths, stage!)
    expect(ancestorInEx).toEqual([expectedAncestorIncludes, expectedAncestorExcludes])
  })

  it('test_CreateCollections', async () => {
    const carPaths = [P('/World/City_set/Vehicles_grp/Cars_grp/CarA'),
      P('/World/City_set/Vehicles_grp/Cars_grp/CarB'),
      P('/World/City_set/Vehicles_grp/Cars_grp/CarC'),
    ]
    const bikePaths = [P('/World/City_set/Vehicles_grp/Bikes_grp/BikeA'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeB'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeC'),
      P('/World/City_set/Vehicles_grp/Bikes_grp/BikeD'),
    ]
    const otherVehiclePaths = [P('/World/City_set/Misc_grp/TruckA'),
      P('/World/City_set/Misc_grp/BicycleA')]

    const stage = (await Stage.open(file('collections.usda')))!
    expect(stage).toBeTruthy()

    const city_set = stage.getPrim('/World/City_set')!
    expect(city_set).toBeTruthy()

    const vehicles_grp = stage.getPrim('/World/City_set/Vehicles_grp')!
    expect(vehicles_grp).toBeTruthy()

    let assignments: [string, SdfPath[]][] = [['vehicles:cars', carPaths],
      ['vehicles:bikes', bikePaths],
      ['vehicles:other', otherVehiclePaths]]

    const collections = UsdUtilsCreateCollections(assignments, vehicles_grp)

    // Verify that the collections that were created have the appropriate
    // sizes.
    for (const collection of collections) {
      const query = collection.computeMembershipQuery()
      const includedObjects = CollectionAPI.computeIncludedObjects(query, stage)
      const includes = collection.getIncludesRel().getTargets()
      const excludes = collection.getExcludesRel().getTargets()

      if (collection.getName() === 'vehicles:cars') {
        // Ensure that the common ancestor is included.
        expect(includes).toEqual(['/World/City_set/Vehicles_grp/Cars_grp'])
        expect(excludes).toEqual([])
        expect(includedObjects.length).toBe(7)
      } else if (collection.getName() === 'vehicles:bikes') {
        expect(includes).toEqual(['/World/City_set/Vehicles_grp/Bikes_grp'])
        expect(excludes).toEqual([])
        expect(includedObjects.length).toBe(9)
      } else if (collection.getName() === 'vehicles:other') {
        expect(new Set(includes)).toEqual(new Set(otherVehiclePaths.map(p => p.pathString)))
        expect(includedObjects.length).toBe(4)
      }
    }

    carPaths.push(P('/World/City_set/Misc_grp/CarD'))

    bikePaths.push(P('/World/City_set/Misc_grp/BikeE'),
      P('/World/City_set/Misc_grp/BikeF'))

    // Test case with overlapping paths and collections that
    // have excludes.
    const newAssignments: [string, SdfPath[]][] = [['vehicles:cars', carPaths],
      ['vehicles:bikes', bikePaths],
      ['vehicles:carsOrBikes', [...carPaths, ...bikePaths]],
      ['vehicles:others', otherVehiclePaths]]

    const newCollections = UsdUtilsCreateCollections(newAssignments, city_set)

    const vehicleCarsIncludesAndExcludes = inEx(carPaths, stage)
    const vehicleBikesIncludesAndExcludes = inEx(bikePaths, stage)
    const vehicleCarsOrBikesIncludesAndExcludes = inEx([...carPaths, ...bikePaths], stage)
    const vehicleOthersIncludesAndExcludes = inEx(otherVehiclePaths, stage)

    // Verify that the collections that were created have the appropriate
    // sizes.
    for (const collection of newCollections) {
      const query = collection.computeMembershipQuery()
      const includedObjects = CollectionAPI.computeIncludedObjects(query, stage)

      const includes = collection.getIncludesRel().getTargets()
      const excludes = collection.getExcludesRel().getTargets()

      if (collection.getName() === 'vehicles:cars') {
        expect(includes).toEqual(vehicleCarsIncludesAndExcludes[0])
        expect(excludes).toEqual(vehicleCarsIncludesAndExcludes[1])

        expect(includes).toContain('/World/City_set/Vehicles_grp')
        expect(excludes).toContain('/World/City_set/Vehicles_grp/Bikes_grp')
        expect(includedObjects.length).toBe(10)
      } else if (collection.getName() === 'vehicles:bikes') {
        expect(includes).toEqual(vehicleBikesIncludesAndExcludes[0])
        expect(excludes).toEqual(vehicleBikesIncludesAndExcludes[1])

        expect(includes).toContain('/World/City_set/Vehicles_grp')
        expect(includes).not.toContain('/World/City_set/Misc_grp')
        expect(excludes).toContain('/World/City_set/Vehicles_grp/Cars_grp')
        expect(includedObjects.length).toBe(14)
      } else if (collection.getName() === 'vehicles:carsOrBikes') {
        expect(includes).toEqual(vehicleCarsOrBikesIncludesAndExcludes[0])
        expect(excludes).toEqual(vehicleCarsOrBikesIncludesAndExcludes[1])

        expect(includes).toContain('/World/City_set')
        expect(excludes).toContain('/World/City_set/Misc_grp/BicycleA')
        expect(excludes).toContain('/World/City_set/Misc_grp/TruckA')
      } else if (collection.getName() === 'vehicles:other') {
        expect(includes).toEqual(vehicleOthersIncludesAndExcludes[0])
        expect(excludes).toEqual(vehicleOthersIncludesAndExcludes[1])
        expect(includedObjects.length).toBe(4)
      }
    }

    const furniturePaths = [P('/World/Room_set/Table_grp/Table'),
      P('/World/Room_set/Chairs_grp/ChairA'),
      P('/World/Room_set/Chairs_grp/ChairB')]

    const penOrPencilPaths = [P('/World/Room_set/Table_grp/Pencils_grp/PencilA'),
      P('/World/Room_set/Table_grp/Pencils_grp/PencilB'),
      P('/World/Room_set/Table_grp/Pencils_grp/PencilC'),
      P('/World/Room_set/Table_grp/Pens_grp/PenA'),
      P('/World/Room_set/Table_grp/Pens_grp/PenB')]

    assignments = [['furniture', furniturePaths],
      ['pensOrPencils', penOrPencilPaths],
      ['emptyCollection', []]]

    const rootCollections = UsdUtilsCreateCollections(assignments, stage.getPrim('/World')!)

    // 'emptyCollection' is still created but has no includes or excludes.
    expect(rootCollections.length).toBe(3)

    for (const collection of rootCollections) {
      const includes = collection.getIncludesRel().getTargets()
      const excludes = collection.getExcludesRel().getTargets()

      if (collection.getName() === 'pensOrPencils') {
        expect(includes).toContain('/World/Room_set/Table_grp/Pencils_grp')
        expect(includes).toContain('/World/Room_set/Table_grp/Pens_grp')
        expect(excludes).toContain('/World/Room_set/Table_grp/Pencils_grp/EraserA')
      } else if (collection.getName() === 'furniture') {
        expect(includes).toContain('/World/Room_set/Chairs_grp')
        expect(includes).toContain('/World/Room_set/Table_grp/Table')
        expect(excludes.length).toBe(0)
      } else if (collection.getName() === 'emptyCollection') {
        expect(includes.length).toBe(0)
        expect(excludes.length).toBe(0)
      }
    }

    // Test creation of collections with instance paths.
    const lampBasePaths = [P('/World/Room_set/Table_grp/LampA/Geom/Base'),
      P('/World/Room_set/Table_grp/LampB/Geom/Base'),
      P('/World/Room_set/Table_grp/LampC/Geom/Base')]
    const lampShadePaths = [P('/World/Room_set/Table_grp/LampA/Geom/Shade'),
      P('/World/Room_set/Table_grp/LampB/Geom/Shade'),
      P('/World/Room_set/Table_grp/LampC/Geom/Shade')]

    assignments = [['lampBases', lampBasePaths],
      ['lampShades', lampShadePaths]]
    let lampCollections = UsdUtilsCreateCollections(assignments, stage.getPrim('/World/Room_set')!)

    for (const collection of lampCollections) {
      const query = collection.computeMembershipQuery()
      const includedPaths = CollectionAPI.computeIncludedPaths(query, stage, TraverseInstanceProxies())

      if (collection.getName() === 'lampBases') {
        for (const p of lampBasePaths) expect(includedPaths).toContain(p.pathString)
      } else if (collection.getName() === 'lampShades') {
        for (const p of lampShadePaths) expect(includedPaths).toContain(p.pathString)
      }
    }

    const lampAPaths = [P('/World/Room_set/Table_grp/LampA/Geom/Base'),
      P('/World/Room_set/Table_grp/LampA/Geom/Shade')]
    const lampBPaths = [P('/World/Room_set/Table_grp/LampB/Geom/Base'),
      P('/World/Room_set/Table_grp/LampB/Geom/Shade')]
    const lampCPaths = [P('/World/Room_set/Table_grp/LampC/Geom/Base'),
      P('/World/Room_set/Table_grp/LampC/Geom/Shade')]

    assignments = [['lampA', lampAPaths],
      ['lampB', lampBPaths],
      ['lampC', lampCPaths]]
    lampCollections = UsdUtilsCreateCollections(assignments,
      stage.getPrim('/World/Room_set/Table_grp')!, 0.75, 5, 2)

    for (const collection of lampCollections) {
      const query = collection.computeMembershipQuery()
      const includedPaths = CollectionAPI.computeIncludedPaths(query, stage, TraverseInstanceProxies())

      if (collection.getName() === 'lampA') {
        for (const p of lampAPaths) expect(includedPaths).toContain(p.pathString)
      } else if (collection.getName() === 'lampB') {
        for (const p of lampBPaths) expect(includedPaths).toContain(p.pathString)
      } else if (collection.getName() === 'lampC') {
        for (const p of lampCPaths) expect(includedPaths).toContain(p.pathString)
      }
    }
  })

  it('test_GetDirtyLayers', async () => {
    // Validates that we get all modified layers from a UsdStage
    const layer1 = await Layer.findOrOpen(file('dirtyLayer1.usda'))
    const layer2 = await Layer.findOrOpen(file('dirtyLayer2.usda'))
    const layer3 = await Layer.findOrOpen(file('dirtyLayer3.usda'))
    const fakeLayer = await Layer.findOrOpen(file('123fake.usda'))
    expect(layer1).toBeDefined()
    expect(layer2).toBeDefined()
    expect(layer3).toBeDefined()
    expect(fakeLayer).toBeUndefined()

    const stage = await Stage.open(layer1!)
    const sessionLayer = stage.getSessionLayer()
    const prim = stage.getPrim('/Root')!
    const hello = prim.getAttr('hello')!
    let dirtyLayers = UsdUtilsGetDirtyLayers(stage)
    expect(dirtyLayers.length).toBe(0)

    stage.setEditTarget(new EditTarget(layer3!))
    hello.set('edit')
    dirtyLayers = UsdUtilsGetDirtyLayers(stage)
    expect(dirtyLayers.length).toBe(1)
    expect(dirtyLayers).toContain(layer3)

    stage.setEditTarget(new EditTarget(layer1!))
    hello.set('edit')
    dirtyLayers = UsdUtilsGetDirtyLayers(stage)
    expect(dirtyLayers.length).toBe(2)
    expect(dirtyLayers).toContain(layer1)
    expect(dirtyLayers).toContain(layer3)

    stage.setEditTarget(new EditTarget(sessionLayer))
    hello.set('edit')
    dirtyLayers = UsdUtilsGetDirtyLayers(stage)
    expect(dirtyLayers.length).toBe(3)
    expect(dirtyLayers).toContain(layer1)
    expect(dirtyLayers).toContain(layer3)
    expect(dirtyLayers).toContain(sessionLayer)
  })
})
