// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdObjectsChangedNotices.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/usd/testenv/testUsdObjectsChangedNotices.py
// (registered as testUsdObjectsChangedNotices).

import { beforeEach, describe, expect, it } from 'vitest'
import { Layer, sdfChangeBlock } from 'typescript-usd/sdf'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Knot as TsKnot, Spline as TsSpline } from 'typescript-usd/ts'
import {
  NamespaceEditor as UsdNamespaceEditor, Notice as UsdNotice, Stage, StagePopulationMask,
  type Attribute, type Prim, type Rel,
} from 'typescript-usd/usd'

const LAYER_CONTENTS = `#usda 1.0
def Sphere "Ref1" (
    prepend apiSchemas = ["CollectionAPI:Ref1Collection"]
){
    def Scope "Ref1Child" {
    }
}

def Scope "Ref2" {
}

def Scope "Parent1" {

    int attr1 = 1
    int attr2 = 2
    int attr2.connect = </Parent1.attr3>
    int attr3 = 3
    double attr4

    rel rel1 = </Parent1/Child1>

    def Sphere "Child1" {
    }

    def Sphere "Child2" {
    }
}
def "Parent2" (
    references = </Ref2>
){
}
`

type NoticeDict = Partial<Record<
  'Resynced' | 'ChangedInfoOnly' | 'ResolvedAssetPathsResynced', Record<string, string[]>>>

describe('testUsdObjectsChangedNotices', () => {
  let layer: Layer
  let stage: Stage
  let editor: UsdNamespaceEditor
  let parent1: Prim
  let parent2: Prim
  let child1: Prim
  let child2: Prim
  let attr1: Attribute
  let attr2: Attribute
  let attr3: Attribute
  let attr4: Attribute
  let rel1: Rel
  // Each ObjectsChanged notice is converted to a dictionary and appended to
  // notices. The list of notices is reset before each test.
  let notices: NoticeDict[]

  beforeEach(async () => {
    layer = Layer.createAnonymous('layer.usda')
    layer.transferContent(Layer.createInMemory('import.usda', LAYER_CONTENTS))
    stage = await Stage.openMasked(layer, StagePopulationMask.all())
    expect(stage).toBeTruthy()
    editor = new UsdNamespaceEditor(stage)

    parent1 = stage.getPrim('/Parent1')!
    parent2 = stage.getPrim('/Parent2')!
    child1 = stage.getPrim('/Parent1/Child1')!
    child2 = stage.getPrim('/Parent1/Child2')!
    attr1 = parent1.getAttr('attr1')!
    attr2 = parent1.getAttr('attr2')!
    attr3 = parent1.getAttr('attr3')!
    attr4 = parent1.getAttr('attr4')!
    rel1 = parent1.rel('rel1')

    expect(parent1).toBeTruthy()
    expect(parent2).toBeTruthy()
    expect(child1).toBeTruthy()
    expect(child2).toBeTruthy()
    expect(attr1).toBeTruthy()
    expect(attr2).toBeTruthy()
    expect(attr3).toBeTruthy()
    expect(rel1.getTargets()).toEqual(['/Parent1/Child1'])

    notices = []
    TfNotice.Register(UsdNotice.ObjectsChanged, (notice) => {
      const asDict: NoticeDict = {}
      const byPath = (range: Iterable<string>): Record<string, string[]> =>
        Object.fromEntries([...range].map(path => [path, notice.getChangedFields(path)]))
      const resynced = notice.getResyncedPaths()
      const changedInfoOnly = notice.getChangedInfoOnlyPaths()
      const resolvedAssetPathsResynced = notice.getResolvedAssetPathsResyncedPaths()
      if (!resynced.empty()) asDict.Resynced = byPath(resynced)
      if (!changedInfoOnly.empty()) asDict.ChangedInfoOnly = byPath(changedInfoOnly)
      if (!resolvedAssetPathsResynced.empty()) {
        asDict.ResolvedAssetPathsResynced = byPath(resolvedAssetPathsResynced)
      }
      notices.push(asDict)
    }, stage)
  })

  it('test_ObjectSetMetadata', () => {
    parent1.setMetadata('comment', 'test')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1': ['comment'] } })
  })

  it('test_ObjectSetMetadataByDictKey', () => {
    parent1.setMetadataByDictKey('customData', 'a:b', 42)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1': ['customData'] } })
  })

  it('test_StageDefinePrim', () => {
    stage.definePrim('/Parent3', 'Sphere')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent3': ['specifier', 'typeName'] } })
  })

  it('test_PrimSetSpecifier', () => {
    parent1.setSpecifier('class')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['specifier'] } })
  })

  it('test_PrimSetTypeName', () => {
    parent1.setTypeName('Cylinder')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['typeName'] } })
  })

  it('test_PrimClearTypeName', () => {
    parent1.clearTypeName()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['typeName'] } })
  })

  it('test_PrimSetActive', async () => {
    await parent1.setActive(false)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['active'] } })
  })

  it('test_PrimSetPropertyOrder', () => {
    parent1.setPropertyOrder(['attr2', 'attr1', 'attr3'])
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      // XXX:USD-10220: Shouldn't this be ['propertyOrder']?
      ChangedInfoOnly: { '/Parent1': [] },
    })
  })

  it('test_PrimRemoveProperty', () => {
    parent1.removeProperty('attr2')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      // Note: attr2 had connections, but the connectionPaths field is omitted.
      Resynced: { '/Parent1.attr2': [] },
    })
  })

  it('test_PrimSetKind', () => {
    parent1.setKind('model')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['kind'] } })
  })

  it('test_PrimAddAppliedSchema', () => {
    parent1.addAppliedSchema('CollectionAPI:myCollection')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['apiSchemas'] } })
  })

  it('test_PrimSetChildrenReorder', () => {
    parent1.setChildrenReorder(['Child2', 'Child1'])
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['primOrder'] } })
  })

  it('test_PrimChangeReferences', async () => {
    // In this case, the referenced prim has apiSchemas that are added to the
    // referencing prim. Even though the 'apiSchemas' field will change, only
    // the 'references' field is reported to have changed.
    await parent1.getReferences().addReference(layer.identifier, '/Ref1')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['references'] } })
    expect(stage.getPrim('/Parent1/Ref1Child')).toBeTruthy()
    expect(stage.getPrim('/Parent1')!.getPropertyNames())
      .toContain('collection:Ref1Collection:includes')
  })

  it('test_PrimChangeReferencesChangesTypeName', async () => {
    expect(parent2.typeName).toBe('Scope')
    await parent2.getReferences().setReferences([{ assetPath: layer.identifier, primPath: '/Ref1' }])
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent2': ['references'] } })
    expect(stage.getPrim('/Parent2')!.typeName).toBe('Sphere')
  })

  it('test_PropertySetDisplayGroup', () => {
    attr1.setDisplayGroup('test')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['displayGroup'] } })
  })

  it('test_PropertySetNestedDisplayGroups', () => {
    attr1.setNestedDisplayGroups(['test', 'test2'])
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['displayGroup'] } })
  })

  it('test_PropertySetCustom', () => {
    attr1.setCustom(true)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['custom'] } })
  })

  it('test_AttributeSetVariability', () => {
    attr1.setVariability('uniform')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['variability'] } })
  })

  it('test_AttributeSetTypename', () => {
    attr1.setTypeName('double')
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['typeName'] } })
  })

  it('test_AttributeSet', () => {
    attr1.set(42)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['default'] } })
  })

  it('test_AttributeSetTimeSample', () => {
    attr1.setTimeSample(1.0, 42)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['timeSamples'] } })
  })

  it('test_AttributeSetSpline', () => {
    const spline = new TsSpline('double')
    spline.setKnot(new TsKnot({ time: 1, value: 42 }))
    attr4.setSpline(spline)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr4': ['spline'] } })
  })

  it('test_AttributeAddConnection', () => {
    attr1.addConnection(attr2.getPath())
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr1': ['connectionPaths'] } })
  })

  it('test_AttributeClearConnections', () => {
    attr2.clearConnections()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.attr2': ['connectionPaths'] } })
  })

  it('test_RelationshipAddTarget', () => {
    rel1.addTarget(parent2.path)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.rel1': ['targetPaths'] } })
  })

  it('test_RelationshipRemoveTarget', () => {
    rel1.removeTarget(child1.path)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.rel1': ['targetPaths'] } })

    // Removing target that does not exist should not trigger a notice.
    rel1.removeTarget(child1.path)
    expect(notices.length).toBe(1)
  })

  it('test_RelationshipSetTargets', () => {
    rel1.setTargets([child1.path, child2.path])
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.rel1': ['targetPaths'] } })
  })

  it('test_RelationshipClearTargets', () => {
    rel1.clearTargets(false)
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ ChangedInfoOnly: { '/Parent1.rel1': ['targetPaths'] } })

    rel1.clearTargets(true)
    expect(notices.length).toBe(2)
    expect(notices[1]).toEqual({ Resynced: { '/Parent1.rel1': [] } })
  })

  it('test_NamespaceEditorDeletePrimAtPath', async () => {
    editor.deletePrimAtPath('/Parent1')
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': [] } })
  })

  it('test_NamespaceEditorMovePrimAtPath', async () => {
    editor.movePrimAtPath('/Parent2', '/Parent1/Parent3')
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      Resynced: { '/Parent2': [], '/Parent1/Parent3': [] },
    })
  })

  it('test_NamespaceEditorRenamePrim', async () => {
    editor.renamePrim(child1, 'Child3')
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      Resynced: { '/Parent1/Child1': [], '/Parent1/Child3': [] },
      ChangedInfoOnly: { '/Parent1.rel1': ['targetPaths'] },
    })
  })

  it('test_NamespaceEditorReparentPrim', async () => {
    editor.reparentPrim(child1, parent2)
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      Resynced: { '/Parent1/Child1': [], '/Parent2/Child1': [] },
      ChangedInfoOnly: { '/Parent1.rel1': ['targetPaths'] },
    })
  })

  it('test_NamespaceEditorDeleteProperty', async () => {
    editor.deleteProperty(attr3)
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      Resynced: { '/Parent1.attr3': [] },
      ChangedInfoOnly: { '/Parent1.attr2': ['connectionPaths'] },
    })
  })

  it('test_NamespaceEditorMovePropertyAtPath', async () => {
    editor.movePropertyAtPath(attr3.getPath(), '/Parent2.newName')
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      Resynced: { '/Parent1.attr3': [], '/Parent2.newName': [] },
      ChangedInfoOnly: { '/Parent1.attr2': ['connectionPaths'] },
    })
  })

  it('test_NamespaceEditorReparentProperty', async () => {
    editor.reparentProperty(attr3, parent2)
    editor.applyEdits()
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({
      Resynced: { '/Parent1.attr3': [], '/Parent2.attr3': [] },
      ChangedInfoOnly: { '/Parent1.attr2': ['connectionPaths'] },
    })
  })

  it('test_SdfChangeBlockChangeTypeThenDelete', () => {
    sdfChangeBlock(() => {
      layer.setField('/Parent1', 'typeName', 'Cylinder')
      layer.getRootPrims().erase('Parent1')
    })
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['typeName'] } })
    expect(stage.getPrim('/Parent1')).toBeUndefined()
  })

  it('test_SdfChangeBlockAppendAPISchemaThenDelete', () => {
    sdfChangeBlock(() => {
      layer.setField('/Parent1', 'apiSchemas', {
        isExplicit: true, explicitItems: ['CollectionAPI:myCollection'],
        prependedItems: [], appendedItems: [], deletedItems: [],
      })
      layer.getRootPrims().erase('Parent1')
    })
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['apiSchemas'] } })
    expect(stage.getPrim('/Parent1')).toBeUndefined()
  })

  it('test_SdfChangeBlockReorderChildrenThenDelete', () => {
    sdfChangeBlock(() => {
      layer.setField('/Parent1', 'primOrder', ['Child2', 'Child1'])
      layer.getRootPrims().erase('Parent1')
    })
    expect(notices.length).toBe(1)
    expect(notices[0]).toEqual({ Resynced: { '/Parent1': ['primOrder'] } })
    expect(stage.getPrim('/Parent1')).toBeUndefined()
  })
})
