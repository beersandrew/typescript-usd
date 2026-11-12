// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdInstancingCpp.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdInstancingCpp.cpp
// (registered as testUsdInstancingCpp with
// USD_ASSIGN_PROTOTYPES_DETERMINISTICALLY=1). The testenv
// testUsdInstancingCpp.testenv is copied unmodified into
// fixtures/testUsdInstancingCpp (Copyright Pixar, TOST 1.0,
// https://openusd.org/license). Each case picks the instance to change from
// the prototype's current source prim index, so the cases do not depend on
// the deterministic prototype assignment the env setting requests.
//
// Mapping: SdfChangeBlock is sdfChangeBlock; the stage processes the layer
// changes when they are flushed (await stage.flushChanges()).
// Usd_PrimGetSourcePrimIndex is Prim._getSourcePrimIndex.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer, Reference as SdfReference, sdfChangeBlock, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdInstancingCpp')

describe('testUsdInstancingCpp', () => {
  // Verify that an instancing prototype is not replaced with a new prototype
  // when one of its non-source instances is deinstanced at the same time that
  // entire stage is recomposed.
  it('TestInstancing_1', async () => {
    const stage = (await Stage.open(path.join(TESTENV, 'rootLayer.usda')))!

    const prototypePrim = stage.getPrim('/instancer1/Instance0')!.getPrototype()!
    const sourcePrimIndexPath =
      prototypePrim._getSourcePrimIndex().getRootNode().getPath().pathString

    const instancePathToUnset = sourcePrimIndexPath.split('/').pop() === 'Instance0'
      ? '/instancer1/Instance1' : '/instancer1/Instance0'

    const rootLayerPtr = stage.getRootLayer()
    const subLayerPtr = (await Layer.findOrOpen(
      path.join(TESTENV, rootLayerPtr.getSubLayerPaths()[0]!)))!

    const instancePrimToUnset = subLayerPtr.getPrimAtPath(instancePathToUnset)!

    const anonymousLayer = Layer.createAnonymous('.usda')
    sdfCreatePrimInLayer(anonymousLayer, '/dummy')
    sdfChangeBlock(() => {
      // unset instance
      instancePrimToUnset.setInstanceable(false)
      // make a dummy change to sublayers - to trigger a significant change of
      // "/" - makes sure prototype are rebuild.
      rootLayerPtr.setSubLayerPaths([subLayerPtr.identifier, anonymousLayer.identifier])
    })
    await stage.flushChanges()

    const newPrototypePrim = stage.getPrim(sourcePrimIndexPath)!.getPrototype()!
    const newSourcePrimIndexPath =
      newPrototypePrim._getSourcePrimIndex().getRootNode().getPath().pathString

    // The prototype's path and the path of its source prim index have not
    // changed.
    expect(newPrototypePrim.path).toBe(prototypePrim.path)
    expect(newSourcePrimIndexPath).toBe(sourcePrimIndexPath)
  })

  // Verify that an instancing prototype is not replaced with a new prototype
  // when one of its non-source instances is deinstanced at the same time that
  // a parent prim of all of the instances is recomposed.
  it('TestInstancing_2', async () => {
    const stage = (await Stage.open(path.join(TESTENV, 'secondRoot.usda')))!

    const prototypePrim = stage.getPrim('/Ref1/instance1')!.getPrototype()!
    const sourcePrimIndexPath =
      prototypePrim._getSourcePrimIndex().getRootNode().getPath().pathString

    const instancePathToUnset = sourcePrimIndexPath.split('/').pop() === 'instance1'
      ? '/Ref1/instance2' : '/Ref1/instance1'

    const ref1PrimSpec = stage.getRootLayer().getPrimAtPath('/Ref1')!
    const instancePrimToUnset = stage.getRootLayer().getPrimAtPath(instancePathToUnset)!

    const dummyPrim = sdfCreatePrimInLayer(stage.getRootLayer(), '/dummy')!
    const dummyReference = new SdfReference('', dummyPrim.getPath())

    sdfChangeBlock(() => {
      // unset instance
      instancePrimToUnset.setInstanceable(false)
      // Add a reference to /ref1 to trigger a /ref1 change at pcp level
      ref1PrimSpec.getReferenceList().add(dummyReference)
    })
    await stage.flushChanges()

    const newPrototypePrim = stage.getPrim(sourcePrimIndexPath)!.getPrototype()!
    const newSourcePrimIndexPath =
      newPrototypePrim._getSourcePrimIndex().getRootNode().getPath().pathString

    expect(newPrototypePrim.path).toBe(prototypePrim.path)
    expect(newSourcePrimIndexPath).toBe(sourcePrimIndexPath)
  })

  // Verify that an instancing prototype is not replaced with a new prototype
  // when one of its non-source instances is deinstanced at the same time that
  // a parent prim of other instances is recomposed.
  it('TestInstancing_3', async () => {
    const stage = (await Stage.open(path.join(TESTENV, 'thirdRoot.usda')))!

    const prototypePrim = stage.getPrim('/Ref1/instance1')!.getPrototype()!
    const sourcePrimIndexPath =
      prototypePrim._getSourcePrimIndex().getRootNode().getPath().pathString

    let parentPathToRecompose = '/Ref2'
    if (sourcePrimIndexPath === parentPathToRecompose ||
        sourcePrimIndexPath.startsWith(parentPathToRecompose + '/')) {
      parentPathToRecompose = '/Ref1'
    }

    const refPrimSpec = stage.getRootLayer().getPrimAtPath(parentPathToRecompose)!
    const dummyPrim = sdfCreatePrimInLayer(stage.getRootLayer(), '/dummy')!
    const dummyReference = new SdfReference('', dummyPrim.getPath())

    sdfChangeBlock(() => {
      // Add a reference to the parentPathToRecompose prim so as to trigger a
      // change in that prim, which does not hold sourceIndex for our prototype
      refPrimSpec.getReferenceList().add(dummyReference)
    })
    await stage.flushChanges()

    const newPrototypePrim = stage.getPrim(sourcePrimIndexPath)!.getPrototype()!
    const newSourcePrimIndexPath =
      newPrototypePrim._getSourcePrimIndex().getRootNode().getPath().pathString

    expect(newPrototypePrim.path).toBe(prototypePrim.path)
    expect(newSourcePrimIndexPath).toBe(sourcePrimIndexPath)
  })
})
