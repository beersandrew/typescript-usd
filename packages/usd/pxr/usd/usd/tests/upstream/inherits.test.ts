// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.cpp,
//  pxr/usd/usd/references.cpp, pxr/usd/usd/stage.cpp, pxr/usd/usd/stage.h,
//  pxr/usd/usd/testenv/testUsdInherits.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdInherits.py (registered
// as testUsdInherits; no testenv directory). Upstream runs every method for
// both the usda and usdc formats; here each method is a describe.each over
// the same list.
//
// API mapping:
//   - Usd.Stage.CreateInMemory(tag[, sessionLayer=None]) is UsdStage::Open on
//     a new anonymous layer (stage.cpp:1189-1219); spelled
//     Stage.open(Layer.createAnonymous(tag)); sessionLayer=None is
//     { sessionLayer: null } (stage.h:285-305).
//   - Usd.Stage.Open(rootLayer, sessionLayer=None) is
//     Stage.open(rootLayer, { sessionLayer: null }).
//   - Sdf.PathListOp values are compared through ListOp.fromValue(...)
//     .toValue() against ListOp.create/createExplicit(...).toValue().
//   - UsdReferences::AddInternalReference(path) is addReference('', path)
//     (references.cpp: an internal reference has an empty asset path).
//   - UsdPrim::GetVariantSet(name) is stage.getVariantSets(path)
//     .getVariantSet(name) (prim.cpp: GetVariantSets().GetVariantSet).
//   - `with vset.GetVariantEditContext():` is getVariantEditContext() ...
//     close().
import { describe, expect, it } from 'vitest'
import { Layer, ListOp } from 'typescript-usd/sdf'
import { ArcType } from 'typescript-usd/pcp'
import {
  EditTarget, ListPositionBackOfAppendList, ListPositionFrontOfAppendList,
  ListPositionFrontOfPrependList, Stage, type Prim,
} from 'typescript-usd/usd'

const allFormats = ['usda', 'usdc']

const createInMemory = (tag: string, sessionLayer?: null): Promise<Stage> =>
  Stage.open(Layer.createAnonymous(tag), sessionLayer === null ? { sessionLayer } : {})

const listOp = (value: unknown) => ListOp.fromValue<string>(value, item => String(item))
const inheritPaths = (prim: Prim) => listOp(prim.getMetadata('inheritPaths'))
const expected = (fields: { prepended?: string[]; deleted?: string[]; explicit?: string[] }) =>
  fields.explicit !== undefined
    ? ListOp.createExplicit<string>(fields.explicit).toValue()
    : ListOp.create<string>(fields.prepended ?? [], [], fields.deleted ?? []).toValue()

describe.each(allFormats)('testUsdInherits (%s)', fmt => {
  // testUsdInherits.py:14-68
  it('test_BasicApi', async () => {
    const stage = await createInMemory(`x.${fmt}`)
    const classA = stage.createClassPrim('/ClassA')
    const concrete = stage.overridePrim('/Concrete')

    expect(concrete.hasAuthoredInherits()).toBe(false)
    expect(concrete.getInherits().addInherit(classA.path)).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(true)
    expect(inheritPaths(concrete).getPrependedItems()).toEqual([classA.path])
    expect(inheritPaths(concrete).getExplicitItems()).toHaveLength(0)
    // This will be used later in the test.
    const items = inheritPaths(concrete).getPrependedItems()

    expect(concrete.getInherits().removeInherit(classA.path)).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(true)
    expect(inheritPaths(concrete).getPrependedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getDeletedItems()).toHaveLength(1)
    expect(inheritPaths(concrete).getExplicitItems()).toHaveLength(0)

    expect(concrete.getInherits().clearInherits()).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(false)
    expect(concrete.getMetadata('inheritPaths')).toBeUndefined()

    // Set the list of added items explicitly.
    expect(concrete.getInherits().setInherits(items)).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(true)
    expect(inheritPaths(concrete).getPrependedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getDeletedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getExplicitItems()).toHaveLength(1)

    // Set the list of added items to explicitly empty. The metadata will
    // still exist as an explicitly empty list op.
    expect(concrete.getInherits().setInherits([])).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(true)
    expect(inheritPaths(concrete).getPrependedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getDeletedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getExplicitItems()).toHaveLength(0)

    // Clear the inherits. Still empty but no longer explicit.
    expect(concrete.getInherits().clearInherits()).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(false)
    expect(concrete.getMetadata('inheritPaths')).toBeUndefined()

    // Set the list of added items to explicitly empty again from cleared
    // verifying that it is indeed set to explicit.
    expect(concrete.getInherits().setInherits([])).toBe(true)
    expect(concrete.hasAuthoredInherits()).toBe(true)
    expect(inheritPaths(concrete).getPrependedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getDeletedItems()).toHaveLength(0)
    expect(inheritPaths(concrete).getExplicitItems()).toHaveLength(0)
  })

  // testUsdInherits.py:70-88
  it('test_InheritedPrim', async () => {
    const stage = await createInMemory(`x.${fmt}`)
    const classA = stage.createClassPrim('/ClassA')
    stage.definePrim('/ClassA/Child')

    const concrete = stage.definePrim('/Concrete')

    expect(concrete.getChildren()).toHaveLength(0)
    expect(concrete.getInherits().addInherit(classA.path)).toBe(true)
    await stage.flushChanges()

    expect(concrete.getChildren()[0]!.path).toBe(`${concrete.path}/Child`)

    expect(concrete.getInherits().getAllDirectInherits()).toEqual(['/ClassA'])

    expect(concrete.getInherits().removeInherit(classA.path)).toBe(true)
    await stage.flushChanges()
    expect(concrete.getChildren()).toHaveLength(0)
  })

  // testUsdInherits.py:90-191
  it('test_InheritPathMapping', async () => {
    const stage = await createInMemory(`x.${fmt}`, null)

    // Create test scenegraph
    stage.definePrim('/Ref')
    stage.definePrim('/Ref/Class')
    stage.definePrim('/Ref/Instance')

    stage.definePrim('/Ref2')
    stage.definePrim('/Ref2/Class')

    stage.definePrim('/Class')

    const prim = stage.definePrim('/Model')
    await prim.getReferences().addReference('', '/Ref')
    await stage.flushChanges()

    const classPrim = stage.getPrim('/Model/Class')!
    const instancePrim = stage.getPrim('/Model/Instance')!
    expect(prim.getChildren().map(child => child.path)).toEqual([classPrim.path, instancePrim.path])

    // Set the edit target to point to the referenced prim.
    const refNode = prim.getPrimIndex().getRootNode().getChildren()[0]!
    expect(refNode.getArcType()).toBe(ArcType.Reference)

    stage.setEditTarget(
      new EditTarget(refNode.getLayerStack().getLayers()[0] as Layer, refNode))

    // Add an inherit path to the instance prim pointing to the class prim.
    instancePrim.getInherits().addInherit('/Model/Class', ListPositionFrontOfPrependList)

    const instancePrimSpec = stage.getRootLayer().getPrimAtPath('/Ref/Instance')!
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ prepended: ['/Ref/Class'] }))

    // Remove the inherit path.
    instancePrim.getInherits().removeInherit(classPrim.path)
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ deleted: ['/Ref/Class'] }))

    // Add a global inherit path.
    instancePrim.getInherits().addInherit('/Class', ListPositionFrontOfPrependList)
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ prepended: ['/Class'], deleted: ['/Ref/Class'] }))

    // Remove the global inherit path.
    instancePrim.getInherits().removeInherit('/Class')
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ deleted: ['/Ref/Class', '/Class'] }))

    // Add a local inherit path pointing to a prim outside the scope of
    // reference. This is allowed, because unlike external references,
    // internal references do not encapsulate namespace.
    instancePrim.getInherits().addInherit('/Ref2/Class', ListPositionFrontOfPrependList)
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ prepended: ['/Ref2/Class'], deleted: ['/Ref/Class', '/Class'] }))

    // Remove the local inherit path.
    instancePrim.getInherits().removeInherit('/Ref2/Class')
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ deleted: ['/Ref/Class', '/Class', '/Ref2/Class'] }))

    // Set inherit paths using the SetInherits API
    instancePrim.getInherits().setInherits(['/Model/Class', '/Class'])
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ explicit: ['/Ref/Class', '/Class'] }))

    // Try to set inherit paths using the SetInherits API.
    instancePrim.getInherits().setInherits(['/Ref2/Class'])
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ explicit: ['/Ref2/Class'] }))
  })

  // testUsdInherits.py:193-220
  it('test_InheritPathMappingVariants', async () => {
    const stage = await createInMemory(`x.${fmt}`, null)

    // Create test scenegraph with variant
    const refPrim = stage.definePrim('/Root')
    const vset = stage.getVariantSets(refPrim.path).getVariantSet('v')
    await vset.addVariant('x')
    await vset.setVariantSelection('x')
    let ctx = vset.getVariantEditContext()
    stage.definePrim('/Root/Class')
    stage.definePrim('/Root/Instance')
    ctx.close()
    await stage.flushChanges()

    // Set edit target inside the variant and add an inherit to another prim
    // in the same variant.
    ctx = vset.getVariantEditContext()
    const instancePrim = stage.getPrim('/Root/Instance')!
    instancePrim.getInherits().addInherit('/Root/Class', ListPositionFrontOfPrependList)
    ctx.close()

    // Check that authored inherit path does *not* include variant selection.
    const instancePrimSpec = stage.getRootLayer().getPrimAtPath('/Root{v=x}Instance')!
    expect(listOp(instancePrimSpec.getInfo('inheritPaths')).toValue())
      .toEqual(expected({ prepended: ['/Root/Class'] }))
  })

  // testUsdInherits.py:222-327
  it('test_GetAllDirectInherits', async () => {
    // Layer to hold specs for arcs that will be introduced via reference.
    const refLayer = Layer.createAnonymous(`r.${fmt}`)
    refLayer.importFromString(`#usda 1.0
                # Target of a reference arc in the root's /Parent
                over "PR" (
                    prepend specializes = </PRS>
                ) {
                    over "Child" (
                        prepend inherits = [
                            </PRCI>,
                            </PRCI_NOSPEC>,
                            </PR/Sibling>
                        ]
                    ) {}
    
                    over "Sibling" {}
                }
    
                # Target of the specializes arc in PR
                over "PRS" (
                    prepend inherits = [
                        </PRSI>,
                        </PRSI_NOSPEC>
                    ]
                ) {}
    
                # Target of a reference arc in an inherited class of root's 
                # /Parent    
                over "PIR" (
                    prepend inherits = [</PIRI>, </PIRI_NOSPEC>]
                ) {}
            
                # Target of a reference arc of root's /Parent/Child
                over "CR" (
                    prepend inherits = [</CRI>, </CRI_NOSPEC>]
                ) {}
                `)

    // Create a simple prim hierarchy, /Parent/Child, then add some arcs.
    const rootLayer = Layer.createAnonymous(`r.${fmt}`)
    rootLayer.importFromString(`#usda 1.0
                def "Parent" (
                    inherits = </PI>
                    references = @__REF_LAYER__@</PR>
                    specializes = </PS>
                ) {
                    def "Child" (
                        inherits = </CI>
                        references = @__REF_LAYER__@</CR>
                    ) {}
                }

                # Inherited by /Parent
                over "PI" (
                    prepend references = @__REF_LAYER__@</PIR>
                    prepend specializes = </PIS>
                ) {}

                # Target of specializes in PI which is inherited by /Parent
                over "PIS" (
                    prepend inherits = </PISI>
                ) {}

                # Target of inherits in PIS 
                over "PISI" {}

                # Target of specializes in /Parent
                over "PS" (
                    prepend inherits = </PSI>
                ) {}

                # Target of inherits in PS which is specialized by /Parent
                over "PSI" {}

                # Inherited by /Parent/Child
                over "CI" {}

                # Specs for implied inherit targets introduced in by references
                # to the refLayer.
                over "PRCI" {}
                over "PRSI" {}
                over "CRI" {}
                over "PIRI" {
                    over "Child" {}
                }
                `.replaceAll('__REF_LAYER__', refLayer.identifier))

    const stage = await Stage.open(rootLayer, { sessionLayer: null })

    const parent = stage.getPrim('/Parent')!
    const child = stage.getPrim('/Parent/Child')!

    // Now check that the direct inherits are what we expect.
    expect(parent.getInherits().getAllDirectInherits()).toEqual([
      '/PI', '/PIRI', '/PIRI_NOSPEC', '/PISI', '/PRSI', '/PRSI_NOSPEC', '/PSI'])

    expect(child.getInherits().getAllDirectInherits()).toEqual([
      '/CI', '/CRI', '/CRI_NOSPEC', '/PRCI', '/PRCI_NOSPEC', '/Parent/Sibling'])
  })

  // testUsdInherits.py:329-364
  it('test_ListPosition', async () => {
    const stage = await createInMemory(`x.${fmt}`, null)

    const prim = stage.definePrim('/prim')
    for (const c of 'abcde') stage.definePrim(`/${c}`)

    const inh = prim.getInherits()
    const direct = async () => { await stage.flushChanges(); return inh.getAllDirectInherits() }

    // Default behavior: ListPositionBackOfPrependList
    expect(await direct()).toEqual([])
    inh.addInherit('/a')
    expect(await direct()).toEqual(['/a'])
    inh.addInherit('/b')
    expect(await direct()).toEqual(['/a', '/b'])

    // ListPositionFrontOfPrependList
    inh.addInherit('/c', ListPositionFrontOfPrependList)
    expect(await direct()).toEqual(['/c', '/a', '/b'])

    // Adding a redundant entry moves it to the requested position
    inh.addInherit('/a', ListPositionFrontOfPrependList)
    expect(await direct()).toEqual(['/a', '/c', '/b'])

    // ListPositionBackOfAppendList
    inh.addInherit('/d', ListPositionBackOfAppendList)
    expect(await direct()).toEqual(['/a', '/c', '/b', '/d'])

    // ListPositionFrontOfAppendList
    inh.addInherit('/e', ListPositionFrontOfAppendList)
    expect(await direct()).toEqual(['/a', '/c', '/b', '/e', '/d'])
  })
})
