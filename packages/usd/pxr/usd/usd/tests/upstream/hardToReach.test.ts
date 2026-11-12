// Ported from OpenUSD 26.11.1: pxr/usd/usd/relationship.cpp,
//  pxr/usd/usd/testenv/testUsdHardToReach.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdHardToReach.cpp
// (registered as testUsdHardToReach).
//
// Mapping:
//  - UsdStage::CreateInMemory(tag) is Stage.open on an anonymous layer with
//    that tag; UsdStage::CreateNew(file) is a stage on a new file in a
//    temporary directory.
//  - UsdRelationship / UsdAttribute GetTargets / GetConnections /
//    GetForwardedTargets return the path list. Their bool results (an
//    authored opinion was found and target composition reported no errors,
//    relationship.cpp:201-285) are not exposed by these handles, so those
//    assertions are not ported; the path lists are.
//  - TestOutParamterIgnoredForComposingValues: the C++ out-parameter has no
//    counterpart; what remains is that an unauthored Get() yields no value
//    and an authored one yields the authored expression.
//
// Not ported: TestStageCacheUniqueReference checks UsdStageRefPtr reference
// counts (IsUnique, weak pointer expiry) across a UsdStageCacheContext;
// stage lifetime here follows garbage collection.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Mark as TfErrorMark } from 'typescript-usd/tf'
import { Layer, OpaqueValue as SdfOpaqueValue, PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'

const createInMemory = (tag: string) => Stage.open(Layer.createAnonymous(tag))

describe('testUsdHardToReach', () => {
  it('TestTargetSpecs: connection spec', async () => {
    for (const fmt of ['usda', 'usdc']) {
      const stage = await createInMemory('TestTargetSpecs.' + fmt)
      const prim = stage.definePrim('/Test')
      const attr = prim.createAttribute('attr', 'int')
      expect(attr.addConnection('/Test.dummy')).toBe(true)
      expect(stage.getRootLayer().getSpecType('/Test.attr[/Test.dummy]')).toBe('connection')
    }
  })

  // UsdRelationship::AddTarget edits the relationship spec's target path
  // list editor (relationship.cpp:85-111), which creates the relationship
  // target child spec (connectionListEditor.cpp:30-110).
  it('TestTargetSpecs: relationship target spec', async () => {
    for (const fmt of ['usda', 'usdc']) {
      const stage = await createInMemory('TestTargetSpecs.' + fmt)
      const prim = stage.definePrim('/Test')
      const rel = prim.createRelationship('rel')
      rel.addTarget('/Test.dummy')
      expect(stage.getRootLayer().getSpecType('/Test.rel[/Test.dummy]')).toBe('relationshipTarget')
    }
  })

  it('TestGetTargetsAndConnections: target and connection paths', async () => {
    for (const fmt of ['usda', 'usdc']) {
      const stage = await createInMemory('TestGetTargets.' + fmt)

      // Add an attribute to test connections first.
      const attrPrim = stage.definePrim('/TestAttr')
      const attr = attrPrim.createAttribute('attr', 'int')
      expect(attr.getConnections()).toEqual([])
      expect(attr.addConnection('/TestAttr.dummy')).toBe(true)
      expect(attr.getConnections()).toEqual(['/TestAttr.dummy'])

      // Add a relationship on a new prim to test targets.
      const relPrim = stage.definePrim('/TestRel')
      const rel = relPrim.createRelationship('rel')
      expect(rel.getTargets()).toEqual([])
      expect(rel.getForwardedTargets()).toEqual([])

      // Add another relationship to test relationship forwarding
      const forwardingRel = relPrim.createRelationship('forwardingRel')
      forwardingRel.addTarget('/TestRel.rel')
      expect(forwardingRel.getTargets()).toEqual(['/TestRel.rel'])
      expect(forwardingRel.getForwardedTargets()).toEqual([])

      rel.addTarget('/TestAttr.dummy')
      expect(rel.getTargets()).toEqual(['/TestAttr.dummy'])
      expect(rel.getForwardedTargets()).toEqual(['/TestAttr.dummy'])
      expect(forwardingRel.getForwardedTargets()).toEqual(['/TestAttr.dummy'])

      // A reference to the prim with the relationships: "/TestAttr.dummy"
      // can't be mapped across the reference from "/TestRef" to "/TestRel".
      const refPrim = stage.definePrim('/TestRef')
      await refPrim.getReferences().addReference(stage.getRootLayer().identifier, relPrim.path)
      const refRelProp = () => stage.getPrim('/TestRef')!.getProperty('rel')
      const refRel = stage.getPrim('/TestRef')!.rel('rel')
      expect(refRelProp().hasAuthoredMetadata('targetPaths')).toBe(true)
      expect(refRel.getTargets()).toEqual([])
      // Add another valid target.
      refRel.addTarget('/TestAttr.dummy')
      expect(refRelProp().hasAuthoredMetadata('targetPaths')).toBe(true)
      expect(refRel.getTargets()).toEqual(['/TestAttr.dummy'])

      // "forwardingRel" on the referencing prim maps its target across the
      // reference.
      const refForwardingRel = stage.getPrim('/TestRef')!.rel('forwardingRel')
      expect(stage.getPrim('/TestRef')!.getProperty('forwardingRel')
        .hasAuthoredMetadata('targetPaths')).toBe(true)
      expect(refForwardingRel.getTargets()).toEqual(['/TestRef.rel'])
      expect(refForwardingRel.getForwardedTargets()).toEqual(['/TestAttr.dummy'])

      // Valid forwarded targets found along the way are still returned.
      refForwardingRel.addTarget('/TestAttr.attr')
      expect(refForwardingRel.getForwardedTargets()).toEqual(['/TestAttr.attr', '/TestAttr.dummy'])

      // Clear the targets on the original relationship.
      expect(rel.clearTargets(false)).toBe(true)
      expect(rel.getTargets()).toEqual([])
      expect(forwardingRel.getForwardedTargets()).toEqual([])

      // Now explicitly set empty targets for the original relationship.
      rel.setTargets([])
      expect(rel.getTargets()).toEqual([])
      expect(forwardingRel.getForwardedTargets()).toEqual([])

      // Clear targets on the first rel again and add a non-relationship
      // target to forwardingRel.
      expect(rel.clearTargets(false)).toBe(true)
      forwardingRel.addTarget('/TestAttr.dummy')
      expect(rel.getTargets()).toEqual([])
      expect(forwardingRel.getTargets()).toEqual(['/TestRel.rel', '/TestAttr.dummy'])
      expect(forwardingRel.getForwardedTargets()).toEqual(['/TestAttr.dummy'])
    }
  })

  it('TestOpaqueValueFileIO', async () => {
    for (const formatExtension of ['usda', 'usdc']) {
      const dir = mkdtempSync(path.join(tmpdir(), 'testUsdHardToReach-'))
      try {
        const file = path.join(dir, 'test_opaque_values.' + formatExtension)
        const empty = Layer.createAnonymous('empty.' + formatExtension)
        writeFileSync(file, formatExtension === 'usdc' ? empty.toUsdc() : empty.exportToString())
        const stage = (await Stage.open(file))!
        const layer = stage.getRootLayer()

        const prim = stage.definePrim('/Prim')
        const attr = prim.createAttribute('attr', 'opaque')
        expect(attr.hasAuthoredValue()).toBe(false)

        layer.setField('/Prim.attr', 'default', new SdfOpaqueValue())
        // We've set a default value, so this should return true.
        expect(attr.hasAuthoredValue()).toBe(true)

        {
          const mark = new TfErrorMark()
          mark.setMark()
          try { await layer.save() } catch { /* an error is what is expected */ }
          // Should have emitted an error about trying to author an opaque
          // value.
          expect(mark.isClean()).toBe(false)
          mark.clear()
        }

        // Once we reload the layer from disk, that authored opinion should be
        // gone.
        await layer.reload(true)
        await stage.flushChanges()
        expect(stage.getPrim('/Prim')!.getAttr('attr')!.hasAuthoredValue()).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('TestOutParamterIgnoredForComposingValues', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Prim')
    const pathExprAttr = prim.createAttribute('pathExpr', 'pathExpression')
    // Get() with no authored value yields no value.
    expect(pathExprAttr.getValue()).toBeUndefined()
    // Get() yields the authored value.
    pathExprAttr.set(new SdfPathExpression('/authored'))
    expect(pathExprAttr.getValue()).toEqual(new SdfPathExpression('/authored'))
  })
})
