// Ported from OpenUSD 26.11.1: pxr/usd/usd/attribute.h, pxr/usd/usd/object.h,
//  pxr/usd/usd/prim.cpp, pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdVariantEditing.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdVariantEditing.py
// (registered as testUsdVariantEditing). The testenv input
// testUsdVariantEditing.testenv/testAPI_var.usda is copied unmodified into
// fixtures/testUsdVariantEditing (Copyright 2017 Pixar, TOST 1.0,
// https://openusd.org/license); upstream runs with that directory as the
// working directory.
//
// Upstream is a script; its top-level section is the first it() and each
// Test* function is its own it().
//
// API mapping:
//   - `with vset.GetVariantEditContext():` is getVariantEditContext() ...
//     close().
//   - UsdPrim::GetVariantSet(name) is stage.getVariantSets(path)
//     .getVariantSet(name) (prim.cpp:1103-1107).
//   - UsdAttribute::IsDefined is Attribute.isValid (object.h:127-137;
//     attribute.h IsDefined is IsValid for attributes).
//   - UsdStage::HasLocalLayer is membership in getLayerStack(true)
//     (stage.cpp HasLocalLayer).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer, VariantSpec, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Vec3d } from 'typescript-usd/gf'
import { Stage } from 'typescript-usd/usd'
import { onObjectsChanged } from '../support/objectsChanged.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdVariantEditing')


describe('testUsdVariantEditing', () => {
  it('top-level variant editing', async () => {
    // Open stage.
    const layer = (await Layer.findOrOpen(path.join(TESTENV, 'testAPI_var.usda')))!
    const stage = (await Stage.open(layer.identifier))!

    // Check GetLayerStack behavior.
    expect(stage.getLayerStack()[0]).toBe(stage.getSessionLayer())

    // Get LayerStack without session layer.
    const rootLayer = stage.getLayerStack(false)[0]
    expect(rootLayer).toBe(stage.getRootLayer())

    // Get Sarah prim.
    const sarah = () => stage.getPrim('/Sarah')!
    expect(sarah()).toBeDefined()

    // Sanity check simple composition.
    expect(sarah().getAttr('color')!.getValue()).toEqual(new Vec3d(1, 0, 0))

    // Verify that the base prim does not have the custom attribute that we
    // will create later in the variant.
    let emptyPrim = stage.overridePrim('/Sarah/EmptyPrim')
    expect(emptyPrim.isValid()).toBe(true)
    expect(emptyPrim.getAttr('newAttr')!.isValid()).toBe(false)

    // Should start out with EditTarget being local & root layer.
    expect(stage.getLayerStack(true).includes(stage.getEditTarget().getLayer()!)).toBe(true)
    expect(stage.getEditTarget().getLayer()).toBe(stage.getRootLayer())

    // Try editing a local variant.
    let displayColor = stage.getVariantSets('/Sarah').getVariantSet('displayColor')
    expect(displayColor.getVariantSelection()).toBe('red')
    const ctx = displayColor.getVariantEditContext()
    sarah().getAttr('color')!.set(new Vec3d(1, 1, 1))
    stage.definePrim('/Sarah/Child', 'Scope')

    // Bug 90706 - verify that within a VariantSet, a new attribute that
    // does not exist on the base prim returns True for IsDefined()
    const over = stage.overridePrim('/Sarah/EmptyPrim')
    expect(over.isValid()).toBe(true)
    over.createAttribute('newAttr', 'int')
    expect(stage.getPrim('/Sarah/EmptyPrim')!.getAttr('newAttr')!.isValid()).toBe(true)
    ctx.close()

    // Test existence of the newly created attribute again, outside of the
    // edit context, while we are still set to the variant selection from
    // which we created the attribute.
    emptyPrim = stage.overridePrim('/Sarah/EmptyPrim')
    expect(emptyPrim.isValid()).toBe(true)
    expect(emptyPrim.getAttr('newAttr')!.isValid()).toBe(true)

    expect(sarah().getAttr('color')!.getValue()).toEqual(new Vec3d(1, 1, 1))
    expect(stage.getPrim('/Sarah/Child')).toBeDefined()

    // Switch to 'green' variant.
    await displayColor.setVariantSelection('green')
    expect(displayColor.getVariantSelection()).toBe('green')

    // Should not be picking up variant opinions authored above.
    expect(sarah().getAttr('color')!.getValue()).toEqual(new Vec3d(0, 1, 0))
    expect(stage.getPrim('/Sarah/Scope')).toBeUndefined()
    emptyPrim = stage.overridePrim('/Sarah/EmptyPrim')
    expect(emptyPrim.isValid()).toBe(true)
    expect(emptyPrim.getAttr('newAttr')!.isValid()).toBe(false)

    await displayColor.clearVariantSelection()
    expect(displayColor.getVariantSelection()).toBe('')

    // Test editing a variant that doesn't yet have opinions.
    const sarahRef = () => stage.getPrim('/Sarah_ref')!
    displayColor = stage.getVariantSets('/Sarah_ref').getVariantSet('displayColor')
    await displayColor.setVariantSelection('red')
    expect(displayColor.getVariantSelection()).toBe('red')
    const refCtx = displayColor.getVariantEditContext()
    sarahRef().getAttr('color')!.set(new Vec3d(2, 2, 2))
    refCtx.close()
    expect(sarahRef().getAttr('color')!.getValue()).toEqual(new Vec3d(2, 2, 2))
  })

  it('TestNewPayloadAutoLoading', async () => {
    // Test that switching a variant that introduces a payload causes the
    // payload to be included if the parent is loaded, and vice versa.
    const rootLayer = Layer.createAnonymous()
    const payloadLayer = Layer.createAnonymous()

    sdfCreatePrimInLayer(rootLayer, '/main')
    sdfCreatePrimInLayer(payloadLayer, '/parent/child')

    let stage = await Stage.open(rootLayer)
    const pvs = await stage.getVariantSets('/main').addVariantSet('payload_vset')

    await pvs.addVariant('with_payload')
    await pvs.addVariant('without_payload')

    await pvs.setVariantSelection('with_payload')
    const ctx = pvs.getVariantEditContext()
    await stage.getPrim('/main')!.getPayloads().addReference(payloadLayer.identifier, '/parent')
    ctx.close()

    await pvs.setVariantSelection('without_payload')

    // Now open the stage load all, we shouldn't have /main/child.
    stage = await Stage.open(rootLayer, { loadPayloads: true })
    expect(stage.getPrim('/main')).toBeDefined()
    expect(stage.getPrim('/main/child')).toBeUndefined()

    // Switching the selection should cause the payload to auto-load.
    await stage.getVariantSets('/main').getVariantSet('payload_vset')
      .setVariantSelection('with_payload')
    let main = stage.getPrim('/main')
    expect(main !== undefined && main.isLoaded).toBe(true)
    expect(stage.getPrim('/main/child')).toBeDefined()

    // Open the stage again, but with load-none.
    stage = await Stage.open(rootLayer, { loadPayloads: false })
    expect(stage.getPrim('/main')).toBeDefined()
    expect(stage.getPrim('/main/child')).toBeUndefined()

    // Switching the selection should NOT cause the payload to auto-load.
    await stage.getVariantSets('/main').getVariantSet('payload_vset')
      .setVariantSelection('with_payload')
    main = stage.getPrim('/main')
    expect(main !== undefined && !main.isLoaded).toBe(true)
    expect(stage.getPrim('/main/child')).toBeUndefined()
  })

  it('TestVariantChangeResyncNotification', async () => {
    // Test that changes to variants only resync prims that actually depend
    // on the variant.
    const layer = Layer.createAnonymous('layer.usda')
    layer.importFromString(`#usda 1.0

        def "PrimVariants" (
            variantSets = ["primVariant"]
        ) {
            variantSet "primVariant" = {
                "one" {
                    def "VariantOneChild" {
                        int variantOneChildAttr
                    }
                }
                "two" {
                    def "VariantTwoChild" {
                        int variantTwoChildAttr
                    }
                }
            }
        }

        def "Prim1" (
            references = </PrimVariants>
            variants = {
                string primVariant = "one"
            }
        ) {
        }

        def "Prim2" (
            references = </PrimVariants>
            variants = {
                string primVariant = "two"
            }
        ) {
        }

    `)

    const stage = await Stage.open(layer)

    // Register ObjectsChanged notice handler that records the resynced paths.
    let resyncedPaths: string[] | null = null
    const revoke = onObjectsChanged(stage, notice => { resyncedPaths = notice.resyncedPaths })

    // Make changes to the variants in /PrimVariants{primVariant=}
    const primVariantsPrim = layer.getPrimAtPath('/PrimVariants')!
    const vSet = primVariantsPrim.getVariantSets().get('primVariant')!

    // Add a new variant "three" that isn't selected by any prims. This
    // should result in no resyncs.
    resyncedPaths = null
    VariantSpec.new(vSet, 'three')
    await stage.flushChanges()
    expect(resyncedPaths).toEqual([])

    // Delete the variant "one" which is selected by /Prim1. /Prim1 only
    // should be resynced.
    resyncedPaths = null
    vSet.removeVariant(vSet.getVariants().get('one')!)
    await stage.flushChanges()
    expect(resyncedPaths).toEqual(['/Prim1'])
    revoke()
  })
})
