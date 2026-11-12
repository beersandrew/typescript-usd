// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdVariants.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdVariants.py (registered
// as testUsdVariants). The testenv input testUsdVariants/MilkCartonA.usda is
// copied unmodified into fixtures/testUsdVariants (Copyright Pixar, Modified
// Apache 2.0, https://openusd.org/license).
//
// Mapping:
//  - Usd.Stage.CreateInMemory(tag) is Stage.open on an anonymous layer with
//    that tag.
//  - `with Usd.EditContext(...)` / `with vs.GetVariantEditContext()` are
//    UsdEditContext objects closed at the end of the block.
//  - Variant authoring that recomposes (AddVariant, AddVariantSet,
//    SetVariantSelection, ...) is awaited.
//  - Tf.Notice.RegisterGlobally(Usd.Notice.ObjectsChanged, ...) is a listener
//    registered for the stage under test, the only stage in the case.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer, VariantSpec as SdfVariantSpec } from 'typescript-usd/sdf'
import { EditContext as UsdEditContext, Stage } from 'typescript-usd/usd'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdVariants')
const allFormats = ['usda', 'usdc']

describe('testUsdVariants', () => {
  it('test_VariantSetAPI', async () => {
    const f = path.join(TESTENV, 'MilkCartonA.usda')
    const layer = await Layer.findOrOpen(f)
    expect(layer).toBeTruthy()

    const stage = (await Stage.open(f))!
    expect(stage).toBeTruthy()

    const prim = stage.getPrim('/MilkCartonA')!
    expect(prim).toBeTruthy()

    expect(prim.hasVariantSets()).toBe(true)
    expect(prim.getVariantSets().getNames()).toContain('modelingVariant')
    expect(prim.getVariantSet('modelingVariant').getVariantSelection()).toBe('Carton_Opened')
    expect(prim.getVariantSets().getVariantSelection('modelingVariant')).toBe('Carton_Opened')
    expect(prim.getVariantSet('modelingVariant').getVariantNames())
      .toEqual(['ALL_VARIANTS', 'Carton_Opened', 'Carton_Sealed'])
    expect(prim.getVariantSet('modelingVariant').getName()).toBe('modelingVariant')
    // GetAllVariantSelections returns the union of all strongest variant
    // selection opinions, even if the variant set doesn't exist.
    expect(prim.getVariantSets().getAllVariantSelections()).toEqual({
      modelingVariant: 'Carton_Opened',
      shadingComplexity: 'full',
      localDanglingVariant: 'local',
      referencedDanglingVariant: 'ref',
    })
    expect(prim.getVariantSets().hasVariantSet('shadingComplexity')).toBe(true)
    expect(prim.getVariantSets().hasVariantSet('localDanglingVariant')).toBe(false)
    expect(prim.getVariantSets().hasVariantSet('referencedDanglingVariant')).toBe(false)
    // ClearVariantSelection clears the variant set selection from the edit
    // target, permitting any weaker layer selection to take effect
    stage.setEditTarget(stage.getSessionLayer())
    await prim.getVariantSet('modelingVariant').setVariantSelection('Carton_Sealed')
    expect(prim.getVariantSet('modelingVariant').getVariantSelection()).toBe('Carton_Sealed')
    await prim.getVariantSet('modelingVariant').clearVariantSelection()
    expect(prim.getVariantSet('modelingVariant').getVariantSelection()).toBe('Carton_Opened')
    // BlockVariantSelection sets the selection to empty, which blocks weaker
    // variant selection opinions
    await prim.getVariantSet('modelingVariant').blockVariantSelection()
    expect(prim.getVariantSet('modelingVariant').getVariantSelection()).toBe('')
  })

  it('test_VariantSelectionPathAbstraction', async () => {
    for (const fmt of allFormats) {
      const s = await Stage.open(Layer.createAnonymous('TestVariantSelectionPathAbstraction.' + fmt))
      const p = s.overridePrim('/Foo')
      const vss = p.getVariantSets()
      expect(p.hasVariantSets()).toBe(false)
      const vs = await vss.addVariantSet('LOD')
      expect(s.getPrim('/Foo')!.hasVariantSets()).toBe(true)
      expect(vs).toBeTruthy()
      expect(await vs.addVariant('High')).toBe(true)
      expect(s.getPrim('/Foo')!.hasVariantSets()).toBe(true)

      // This call used to trigger the bug: computing a prim index for the
      // variant prim caused the prim with a variant selection to be
      // included in the stage's scene graph by the next change processing.
      expect(s.getPrim('/Foo')!.getAttr('bar')!.isValid()).toBe(false)

      // This triggers change processing which will include the prim with the
      // variant selection and put it on the stage.
      await vs.setVariantSelection('High')
      const editTarget = vs.getVariantEditTarget()
      expect(editTarget.isValid()).toBe(true)
      const ctx = new UsdEditContext(s, editTarget)
      s.definePrim('/Foo/Foobar', 'Scope')
      ctx.close()

      expect(s.getPrim('/Foo/Foobar')).toBeTruthy()

      // Paths containing variant selections can never identify objects on a
      // stage: the stage has no prim for </Foo{LOD=High}Foobar>.
      expect(s.getPrim('/Foo{LOD=High}Foobar')).toBeUndefined()
    }
  })

  it('test_NestedVariantSets', async () => {
    for (const fmt of allFormats) {
      const s = await Stage.open(Layer.createAnonymous('TestNestedVariantSets.' + fmt))
      const p = s.definePrim('/Foo', 'Scope')
      const vss = p.getVariantSets()
      const vsLod = await vss.addVariantSet('LOD')
      await vsLod.addVariant('High')
      await vsLod.setVariantSelection('High')
      const lodCtx = vsLod.getVariantEditContext()
      // Create a directly nested variant set.
      const vsCostume = await vss.addVariantSet('Costume')
      await vsCostume.addVariant('Spooky')
      await vsCostume.setVariantSelection('Spooky')
      const costumeCtx = vsCostume.getVariantEditContext()
      s.definePrim('/Foo/SpookyHat', 'Cone')
      costumeCtx.close()

      // Create a child prim with its own variant set.
      const p2 = s.definePrim('/Foo/DetailedStuff', 'Scope')
      const vssP2 = p2.getVariantSets()
      const vsP2 = await vssP2.addVariantSet('StuffVariant')
      await vsP2.addVariant('A')
      await vsP2.setVariantSelection('A')
      const p2Ctx = vsP2.getVariantEditContext()
      s.definePrim('/Foo/DetailedStuff/StuffA', 'Sphere')
      p2Ctx.close()
      lodCtx.close()

      expect(vss.getNames()).toEqual(['LOD', 'Costume'])
      expect(s.getPrim('/Foo/SpookyHat')).toBeTruthy()
      expect(s.getRootLayer().getPrimAtPath('/Foo{LOD=High}{Costume=Spooky}SpookyHat')).toBeTruthy()
    }
  })

  it('test_USD_5189', async () => {
    for (const fmt of allFormats) {
      const l = Layer.createAnonymous('.' + fmt)
      l.importFromString(`#usda 1.0
(
   defaultPrim = "prim"
)

def "prim" (
    inherits = </class>
    prepend variantSets = "myVariantSet"
    variants = {
        string myVariantSet = "light"
    }
)
{
    variantSet "myVariantSet" = {
        "full"
        {
            string bar = "full"
        }
        
        "light"
        {
            string bar = "light"
        }
    }
}

over "refprim" (
    references = </prim>
    delete variantSets = "myVariantSet"
    prepend variantSets = "myRefVariantSet"
)
{
    variantSet "myRefVariantSet" = {
        "open"
        {
        }
    }
}

over "refrefprim" (
    references = </refprim>
    delete variantSets = "myRefVariantSet"
    variants = {
        string myVariantSet = "full"
    }
    prepend variantSets = "myRefRefVariantSet"
)
{
    variantSet "myRefRefVariantSet" = {
        "closed"
        {
        }
    }
}
`)

      const s = await Stage.open(l)
      const p = s.getPrim('/prim')!
      const rp = s.getPrim('/refprim')!
      const rrp = s.getPrim('/refrefprim')!

      // With bug USD-5189, only the first would return 'myVariantSet', the
      // others would be empty.
      expect(p.getVariantSets().getNames()).toEqual(['myVariantSet'])
      expect(rp.getVariantSets().getNames()).toEqual(['myRefVariantSet', 'myVariantSet'])
      expect(rrp.getVariantSets().getNames())
        .toEqual(['myRefRefVariantSet', 'myRefVariantSet', 'myVariantSet'])
    }
  })

  it('test_UnselectedVariantEditsNotification', async () => {
    // Setup: payload layer has a single root prim with a variant set "standin"
    // that has three variants, "a", "b", and "c". The root layer has a single
    // prim with a payload to the payload layer and the same variant set
    // "standin" with only two variants "a" and "b". The root prim sets the
    // variant selection to "a".
    const payloadLayer = Layer.createAnonymous('payload.usda')
    payloadLayer.importFromString(`#usda 1.0
            def "Payload" (
                append variantSets = ["standin"]
            )
            {
                variantSet "standin" = {
                    "a" {
                        int a_attr
                    }
                    "b" {
                        int b_attr
                    }
                    "c" {
                        int c_attr
                    }
                }
            }
        `)

    const rootLayer = Layer.createAnonymous('root.usda')
    rootLayer.importFromString(`#usda 1.0
            def "Root" (
                payload = @` + payloadLayer.identifier + `@</Payload>
                append variantSets = "standin"
                variants = {
                    string standin = "a"
                }
            )
            {
                variantSet "standin" = {
                    "a" {

                    }
                    "b" {

                    }
                }
            }
        `)

    const stage = await Stage.open(rootLayer)
    const prim = stage.getPrim('/Root')!
    expect(prim).toBeTruthy()
    const composedVarSet = prim.getVariantSet('standin')
    expect(composedVarSet.getVariantNames()).toEqual(['a', 'b', 'c'])

    // For the following edits, the notice reports no resynced prim paths
    // but an info change on /Root for 'variantChildren'.
    let numNoticesReceived = 0
    const errors: unknown[] = []
    let check = (notice: ObjectsChangedSummary) => {
      expect(notice.notice.getStage()).toBe(stage)
      expect(notice.resyncedPaths).toEqual([])
      expect(notice.changedInfoOnlyPaths).toEqual(['/Root'])
      expect(notice.getChangedFields('/Root')).toEqual(['variantChildren'])
    }
    let revoke = onObjectsChanged(stage, notice => {
      numNoticesReceived++
      try { check(notice) } catch (e) { errors.push(e) }
    })

    const payloadVarSet = () => payloadLayer.getPrimAtPath('/Payload')!.getVariantSets().get('standin')!
    const rootVarSet = () => rootLayer.getPrimAtPath('/Root')!.getVariantSets().get('standin')!

    // Remove variant 'c' in the payload layer.
    payloadVarSet().removeVariant(payloadVarSet().getVariants().get('c')!)
    await stage.flushChanges()
    expect(errors).toEqual([])
    expect(numNoticesReceived).toBe(1)
    expect(composedVarSet.getVariantNames()).toEqual(['a', 'b'])

    // Remove variant 'b' in the root layer.
    rootVarSet().removeVariant(rootVarSet().getVariants().get('b')!)
    await stage.flushChanges()
    expect(errors).toEqual([])
    expect(numNoticesReceived).toBe(2)
    // The payload still has "b".
    expect(composedVarSet.getVariantNames()).toEqual(['a', 'b'])

    // Add a new variant spec 'root' to "standin" in the root layer.
    SdfVariantSpec.new(rootVarSet(), 'root')
    await stage.flushChanges()
    expect(errors).toEqual([])
    expect(numNoticesReceived).toBe(3)
    expect(composedVarSet.getVariantNames()).toEqual(['a', 'b', 'root'])

    // Add a new variant spec 'payload' to "standin" in the payload layer.
    SdfVariantSpec.new(payloadVarSet(), 'payload')
    await stage.flushChanges()
    expect(errors).toEqual([])
    expect(numNoticesReceived).toBe(4)
    expect(composedVarSet.getVariantNames()).toEqual(['a', 'b', 'payload', 'root'])

    // Replace the listener with one that verifies a resync of /Root and no
    // info changes.
    revoke()
    check = (notice: ObjectsChangedSummary) => {
      expect(notice.notice.getStage()).toBe(stage)
      expect(notice.resyncedPaths).toEqual(['/Root'])
      expect(notice.changedInfoOnlyPaths).toEqual([])
    }
    revoke = onObjectsChanged(stage, notice => {
      numNoticesReceived++
      try { check(notice) } catch (e) { errors.push(e) }
    })

    // Removing variant "a" from the payload layer resyncs /Root, whose prim
    // index depends on the {standin=a} selection.
    payloadVarSet().removeVariant(payloadVarSet().getVariants().get('a')!)
    await stage.flushChanges()
    expect(errors).toEqual([])
    expect(numNoticesReceived).toBe(5)
    revoke()
  })
})
