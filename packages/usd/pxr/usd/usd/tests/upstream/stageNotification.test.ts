// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdStageNotification.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/usd/testenv/testUsdStageNotification.cpp
// (registered as testUsdStageNotification).

import { describe, expect, it } from 'vitest'
import { Layer, sdfChangeBlock, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Notice as TfNotice } from 'typescript-usd/tf'
import {
  EditContext as UsdEditContext, Notice as UsdNotice, Stage, StageLoadRules, StagePopulationMask,
} from 'typescript-usd/usd'
import { UsdInterpolationTypeHeld, UsdInterpolationTypeLinear } from '../../src/interpolation.ts'

type TestFn = (n: UsdNotice.ObjectsChanged) => void

// _NoticeTester: registers for the stage's ObjectsChanged notices, runs the
// test functions on each, and requires that they ran at least once.
function noticeTester(stage: Stage, fn: () => void, ...testFns: TestFn[]): void {
  let invokedTestFunctions = false
  const key = TfNotice.Register(UsdNotice.ObjectsChanged, (n, sender) => {
    expect(sender).toBe(stage)
    for (const testFn of testFns) testFn(n)
    invokedTestFunctions = true
  }, stage)
  try {
    fn()
  } finally {
    key.revoke()
  }
  expect(testFns.length === 0 || invokedTestFunctions).toBe(true)
}

describe('testUsdStageNotification', () => {
  it('TestObjectsChanged', () => {
    // Test that:
    // - Simple resyncs.
    // - Ancestral resyncs subsume descendant ones.
    // - Info changes.
    // - Resyncs subsume info changes.

    const stage = Stage.createNew()
    const rootLayer = stage.getRootLayer()

    const subLayer = Layer.createAnonymous('.usda')
    rootLayer.insertSubLayerPath(subLayer.identifier)

    // Add a new override prim, assert that it's considered a resync.
    noticeTester(stage, () => {
      const context = new UsdEditContext(stage, stage.getEditTargetForLocalLayer(subLayer))
      stage.overridePrim('/over')
      context.close()
    }, (n) => {
      const newPrim = stage.getPrim('/over')!
      expect(n.resyncedObject(newPrim)).toBe(true)
    }, (n) => {
      expect(n.getChangedFields('/over')).toEqual([])
      expect(n.hasChangedFields('/over')).toBe(false)
    })

    // Add an inert spec for /over, assert that it's *not* considered a resync.
    const over = stage.getPrim('/over')!
    noticeTester(stage, () => {
      sdfCreatePrimInLayer(rootLayer, '/over')
    }, (n) => {
      expect(n.resyncedObject(over)).toBe(false)
      expect(n.changedInfoOnly(over)).toBe(true)
    }, (n) => {
      expect(n.getChangedFields('/over')).toEqual([])
      expect(n.hasChangedFields('/over')).toBe(false)
    })

    // Change foo's typename, assert that it gets resynced.
    const foo = stage.overridePrim('/foo')
    noticeTester(stage, () => {
      rootLayer.setField('/foo', 'typeName', 'Scope')
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['typeName'])
    })

    // Add a child prim, assert that both are considered resynced when
    // changing the parent.
    const bar = stage.overridePrim('/foo/bar')
    noticeTester(stage, () => {
      rootLayer.setField('/foo', 'typeName', '')
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(true)
      expect(n.resyncedObject(bar)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['typeName'])
      expect(n.hasChangedFields(bar)).toBe(false)
      expect(n.getChangedFields(bar)).toEqual([])
    })

    // Assert that changing foo's typeName and other metadata together
    // causes a resync with both changed fields reported.
    noticeTester(stage, () => {
      sdfChangeBlock(() => {
        rootLayer.setField('/foo', 'typeName', 'Sphere')
        rootLayer.setField('/foo', 'documentation', 'Test docs')
      })
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['documentation', 'typeName'])
    })

    // Assert that changing bar doesn't resync foo.
    noticeTester(stage, () => {
      rootLayer.setField('/foo/bar', 'typeName', 'Scope')
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(false)
      expect(n.resyncedObject(bar)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(false)
      expect(n.getChangedFields(foo)).toEqual([])
      expect(n.hasChangedFields(bar)).toBe(true)
      expect(n.getChangedFields(bar)).toEqual(['typeName'])
    })

    // Assert that changing both foo and bar works as expected.
    noticeTester(stage, () => {
      sdfChangeBlock(() => {
        rootLayer.setField('/foo', 'typeName', 'Scope')
        rootLayer.setField('/foo/bar', 'typeName', '')
      })
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(true)
      expect(n.resyncedObject(bar)).toBe(true)
      expect(n.getResyncedPaths().size).toBe(1)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['typeName'])
      expect(n.hasChangedFields(bar)).toBe(false)
      expect(n.getChangedFields(bar)).toEqual([])
    })

    // Assert that adding a reference resyncs the prims in a reference chain.
    const target1 = stage.overridePrim('/target1')
    const target2 = stage.overridePrim('/target2')
    void foo.getReferences().addReference(rootLayer.identifier, target1.path)
    noticeTester(stage, () => {
      // Now add the reference.
      void target1.getReferences().addReference(rootLayer.identifier, target2.path)
    }, (n) => {
      expect(n.resyncedObject(target2)).toBe(false)
      expect(n.resyncedObject(target1)).toBe(true)
      expect(n.resyncedObject(foo)).toBe(true)
      expect(n.resyncedObject(bar)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(target1)).toBe(true)
      expect(n.getChangedFields(target1)).toEqual(['references'])
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['references'])
      expect(n.hasChangedFields(bar)).toBe(false)
      expect(n.getChangedFields(bar)).toEqual([])
    })

    // Assert that changing an inherited value causes changes to instances.
    const cls = stage.createClassPrim('/cls')
    foo.getInherits().addInherit(cls.path)
    bar.getInherits().addInherit(cls.path)
    noticeTester(stage, () => {
      cls.setMetadata('documentation', 'cls doc')
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(false)
      expect(n.resyncedObject(bar)).toBe(false)
      expect(n.resyncedObject(cls)).toBe(false)
      expect(n.affectedObject(foo)).toBe(true)
      expect(n.affectedObject(bar)).toBe(true)
      expect(n.affectedObject(cls)).toBe(true)
      expect(n.changedInfoOnly(foo)).toBe(true)
      expect(n.changedInfoOnly(bar)).toBe(true)
      expect(n.changedInfoOnly(cls)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['documentation'])
      expect(n.hasChangedFields(bar)).toBe(true)
      expect(n.getChangedFields(bar)).toEqual(['documentation'])
      expect(n.hasChangedFields(cls)).toBe(true)
      expect(n.getChangedFields(cls)).toEqual(['documentation'])
    })

    // Assert that changing specializes causes changes to instances.
    const specialize = stage.definePrim('/spec')
    foo.getSpecializes().addSpecialize(specialize.path)
    bar.getSpecializes().addSpecialize(specialize.path)
    noticeTester(stage, () => {
      specialize.setMetadata('documentation', 'spec doc')
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(false)
      expect(n.resyncedObject(bar)).toBe(false)
      expect(n.resyncedObject(specialize)).toBe(false)
      expect(n.affectedObject(foo)).toBe(true)
      expect(n.affectedObject(bar)).toBe(true)
      expect(n.affectedObject(specialize)).toBe(true)
      expect(n.changedInfoOnly(foo)).toBe(true)
      expect(n.changedInfoOnly(bar)).toBe(true)
      expect(n.changedInfoOnly(specialize)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['documentation'])
      expect(n.hasChangedFields(bar)).toBe(true)
      expect(n.getChangedFields(bar)).toEqual(['documentation'])
      expect(n.hasChangedFields(specialize)).toBe(true)
      expect(n.getChangedFields(specialize)).toEqual(['documentation'])
    })

    // Assert that changes to non-composition related metadata fields come
    // through as info changes rather than resyncs.
    noticeTester(stage, () => {
      foo.setMetadata('documentation', 'hello doc')
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(false)
      expect(n.changedInfoOnly(foo)).toBe(true)
      expect(n.affectedObject(foo)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['documentation'])
    })

    // Assert that resyncs subsume info changes.
    noticeTester(stage, () => {
      sdfChangeBlock(() => {
        rootLayer.setField('/foo', 'typeName', 'Cube')
        rootLayer.setField('/foo', 'documentation', 'Cubicle')
      })
    }, (n) => {
      expect(n.resyncedObject(foo)).toBe(true)
      expect(n.changedInfoOnly(foo)).toBe(false)
      expect(n.affectedObject(foo)).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields(foo)).toBe(true)
      expect(n.getChangedFields(foo)).toEqual(['documentation', 'typeName'])
    })

    // Assert that creating an attribute causes resyncs
    let attr!: ReturnType<typeof foo.createAttribute>
    noticeTester(stage, () => {
      attr = foo.createAttribute('attr', 'int')
    }, (n) => {
      expect([...n.getResyncedPaths()]).toEqual(['/foo.attr'])
      expect(n.getChangedInfoOnlyPaths().empty()).toBe(true)
    }, (n) => {
      const changedFields = n.getChangedFields('/foo.attr')
      expect(n.hasChangedFields('/foo.attr')).toBe(true)
      expect(new Set(changedFields)).toEqual(new Set(['custom', 'typeName']))
    })

    // Assert that changing an attribute value causes info changes.
    noticeTester(stage, () => {
      attr.set(42)
    }, (n) => {
      expect(n.resyncedObject(attr)).toBe(false)
      expect(n.changedInfoOnly(attr)).toBe(true)
      expect(n.affectedObject(attr)).toBe(true)
      expect(n.getResyncedPaths().empty()).toBe(true)
      expect([...n.getChangedInfoOnlyPaths()]).toEqual(['/foo.attr'])
    }, (n) => {
      expect(n.hasChangedFields(attr)).toBe(true)
      expect(n.getChangedFields(attr)).toEqual(['default'])
    })

    // Assert that changing two attribute values causes info changes for both.
    const attr2 = foo.createAttribute('attr2', 'int')
    noticeTester(stage, () => {
      sdfChangeBlock(() => {
        rootLayer.setField('/foo.attr', 'default', 13)
        rootLayer.setField('/foo.attr2', 'default', 42)
      })
    }, (n) => {
      expect(n.resyncedObject(attr)).toBe(false)
      expect(n.resyncedObject(attr2)).toBe(false)
      expect(n.changedInfoOnly(attr)).toBe(true)
      expect(n.changedInfoOnly(attr2)).toBe(true)
      expect(n.affectedObject(attr)).toBe(true)
      expect(n.affectedObject(attr2)).toBe(true)
      expect(n.getResyncedPaths().empty()).toBe(true)
      expect([...n.getChangedInfoOnlyPaths()]).toEqual(['/foo.attr', '/foo.attr2'])
    }, (n) => {
      expect(n.hasChangedFields(attr)).toBe(true)
      expect(n.hasChangedFields(attr2)).toBe(true)
      expect(n.getChangedFields(attr)).toEqual(['default'])
      expect(n.getChangedFields(attr2)).toEqual(['default'])
    })

    // Assert that creating a relationship causes resyncs
    let rel!: ReturnType<typeof foo.createRelationship>
    noticeTester(stage, () => {
      rel = foo.createRelationship('rel')
    }, (n) => {
      expect([...n.getResyncedPaths()]).toEqual(['/foo.rel'])
      expect(n.getChangedInfoOnlyPaths().empty()).toBe(true)
    }, (n) => {
      expect(n.hasChangedFields('/foo.rel')).toBe(true)
      expect(n.getChangedFields('/foo.rel')).toEqual(['custom', 'variability'])
    })

    // Assert that setting a relationship target causes info changes.
    noticeTester(stage, () => {
      rel.addTarget('/bar')
    }, (n) => {
      expect(n.resyncedObject(rel)).toBe(false)
      expect(n.changedInfoOnly(rel)).toBe(true)
      expect(n.affectedObject(rel)).toBe(true)
      expect(n.getResyncedPaths().empty()).toBe(true)
      expect([...n.getChangedInfoOnlyPaths()]).toEqual(['/foo.rel'])
    }, (n) => {
      expect(n.hasChangedFields(rel)).toBe(true)
      expect(n.getChangedFields(rel)).toEqual(['targetPaths'])
    })
  })

  it('TestObjectsChanged: runtime state changes notify', async () => {
    // Assert that modifying runtime state (i.e. not scene description) on
    // UsdStage that affects the set of objects on the stage or computed
    // values sends notification.
    const stage = Stage.createNew()
    stage.definePrim('/foo')

    const resynced: TestFn = n => expect(n.getResyncedPaths().empty()).toBe(false)
    const notices: UsdNotice.ObjectsChanged[] = []
    const key = TfNotice.Register(UsdNotice.ObjectsChanged, n => notices.push(n), stage)

    await stage.setLoadRules(StageLoadRules.loadNone())
    await stage.setLoadRules(StageLoadRules.loadAll())
    expect(notices.length).toBe(2)
    notices.forEach(resynced)

    notices.length = 0
    const nothingMask = new StagePopulationMask(['/no/such/prim'])
    await stage.setPopulationMask(nothingMask)
    await stage.setPopulationMask(StagePopulationMask.all())
    expect(notices.length).toBe(2)
    notices.forEach(resynced)

    notices.length = 0
    stage.setInterpolationType(UsdInterpolationTypeHeld)
    stage.setInterpolationType(UsdInterpolationTypeLinear)
    expect(notices.length).toBe(2)
    notices.forEach(resynced)
    key.revoke()
  })
})
