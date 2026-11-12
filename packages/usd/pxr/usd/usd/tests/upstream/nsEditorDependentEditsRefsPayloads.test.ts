// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsBasicReferencesAndPayloads.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsBasicReferencesAndPayloads.py

import { describe, expect, it } from 'vitest'
import { Layer, Payload, Reference } from 'typescript-usd/sdf'
import { NamespaceEditor, Stage, StagePopulationMask } from 'typescript-usd/usd'
import { NsEditorDependentEditsBase, PrimResyncType, type ExpectedContents } from '../support/nsEditorDependentEditsBase.ts'

describe('TestUsdNamespaceEditorDependentEditsBasicReferencesAndPayloads', () => {
  const base = new NsEditorDependentEditsBase()

  // SdfLayer::GetDefaultPrim / HasDefaultPrim (layer.cpp): the layer's
  // defaultPrim field, with its empty-token fallback.
  const getDefaultPrim = (layer: Layer): string => layer.getDefaultPrim()
  const hasDefaultPrim = (layer: Layer): boolean => layer.hasDefaultPrim()

  it('test_BasicDependentReferences', async () => {
    // Test downstream dependency namespace edits across basic single
    // references, both internal and in separate layers

    // Setup:
    // Layer 1 has simple hierarchy of /Ref, Child, and GrandChild that is
    // referenced and will be namespace edited. It also has three prims
    // that internally reference /Ref, /Ref/Child, and /Ref/Child/GrandChild
    // respectively. These internally referencing prims will be affected by
    // downstream dependency edits.
    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
            def "Ref" {
                int refAttr

                def "Child" {
                    int childAttr

                    def "GrandChild" {
                        int grandChildAttr
                    }
                }
            }

            def "InternalRef1" (
                references = </Ref>
            ) {
                over "Child" {
                    int overChildAttr
                    over "GrandChild" {
                        int overGrandChildAttr
                    }
                }
                def "LocalChild" {}
                int localAttr
            }

            def "InternalRef2" (
                references = </Ref/Child>
            ) {
                over "GrandChild" {
                    int overGrandChildAttr
                }
                def "LocalChild" {}
                int localAttr
            }

            def "InternalRef3" (
                references = </Ref/Child/GrandChild>
            ) {
                def "LocalChild" {}
                int localAttr
            }
        `
    layer1.importFromString(layer1ImportString)

    // Layer 2 has three prims that reference /Ref, /Ref/Child, and
    // /Ref/Child/GrandChild from layer 1 respectively. These prims will be
    // affected by downstream dependency edits.
    const layer2 = Layer.createAnonymous("layer2.usda")
    const layer2ImportString = `#usda 1.0
            def "Prim1" (
                references = @${layer1.identifier}@</Ref>
            ) {
                over "Child" {
                    int overChildAttr
                    over "GrandChild" {
                        int overGrandChildAttr
                    }
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim2" (
                references = @${layer1.identifier}@</Ref/Child>
            ) {
                over "GrandChild" {
                    int overGrandChildAttr
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim3" (
                references = @${layer1.identifier}@</Ref/Child/GrandChild>
            ) {
                def "LocalChild" {}
                int localAttr
            }
        `
    layer2.importFromString(layer2ImportString)

    // Open both layers as stages.
    const stage1 = await Stage.openMasked(layer1, StagePopulationMask.all())
    const stage2 = await Stage.openMasked(layer2, StagePopulationMask.all())

    // Create an editor for stage 1 with stage 2 as an additional dependent
    // stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial composition fields for both layers.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/InternalRef1' : {
            'references' : [new Reference('', '/Ref')]
        },
        '/InternalRef2' : {
            'references' : [new Reference('', '/Ref/Child')]
        },
        '/InternalRef3' : {
            'references' : [new Reference('', '/Ref/Child/GrandChild')]
        },
    })

    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier, '/Ref/Child')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/Child/GrandChild')]
        },
    })

    // Both the internal reference prims in stage 1 and the "regular"
    // reference prims in stage 2 will have same contents since they
    // reference the same prims and define identical local specs. So,
    // we create expected contents dictionaries that we can share for
    // verification.
    let refToRefContents: ExpectedContents = {
        '.' : ['refAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr', 'overChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'overGrandChildAttr'],
            },
        },
        'LocalChild' : {}
    }

    let refToChildContents: ExpectedContents = {
        '.' : ['childAttr', 'localAttr'],
        'GrandChild' : {
            '.' : ['grandChildAttr', 'overGrandChildAttr'],
        },
        'LocalChild' : {},
    }

    let refToGrandChildContents: ExpectedContents = {
        '.' : ['grandChildAttr', 'localAttr'],
        'LocalChild' : {},
    }

    // Verify the expected contents of stage 1
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr'],
                }
            }
        },
        'InternalRef1' : refToRefContents,
        'InternalRef2' : refToChildContents,
        'InternalRef3' : refToGrandChildContents
    })

    // Verify the expected contents of stage 2.
    base.verifyStageContents(stage2, {
        'Prim1' : refToRefContents,
        'Prim2' : refToChildContents,
        'Prim3' : refToGrandChildContents
    })

    // Edit: Rename /Ref/Child to /Ref/RenamedChild
    base.applyEdits(editor, "Move /Ref/Child -> /Ref/RenamedChild", () => {
        expect(editor.movePrimAtPath('/Ref/Child', '/Ref/RenamedChild')).toBe(true)
    })

    // Verify the updated composition fields in layer1. The internal
    // reference fields to /Ref/Child and its descendant
    // /Ref/Child/GrandChild have been updated to use the renamed paths.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/InternalRef1' : {
            'references' : [new Reference('', '/Ref')]
        },
        '/InternalRef2' : {
            'references' : [new Reference('', '/Ref/RenamedChild')]
        },
        '/InternalRef3' : {
            'references' : [new Reference('', '/Ref/RenamedChild/GrandChild')]
        },
    })

    // Verify the udpated composition fields in layer2. The reference fields
    // to /Ref/Child and its descendant /Ref/Child/GrandChild have been
    // similarly updated to use the renamed paths.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/RenamedChild')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/RenamedChild/GrandChild')]
        },
    })

    // Verify the updated stage contents for both stages.
    //
    // For the both prims that directly reference /Ref, the child prim is
    // renamed to RenamedChild. Note that this means the local override specs
    // for the referencing prims have been renamed to RenamedChild too which
    // is why the composed RenamedChild prim still has both childAttr and
    // overChildAttr and the composed GrandChild remains unchanged
    //
    // The contents of the other two prims in each stage remain unchanged
    // as the update to the reference fields allow those prims to remain the
    // same.
    refToRefContents = {
        '.' : ['refAttr', 'localAttr'],
        'RenamedChild' : {
            '.' : ['childAttr', 'overChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'overGrandChildAttr'],
            },
        },
        'LocalChild' : {},
    }

    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'RenamedChild' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr'],
                }
            }
        },
        'InternalRef1' : refToRefContents,
        'InternalRef2' : refToChildContents,
        'InternalRef3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/Child" : PrimResyncType.RenameSource,
        "/Ref/RenamedChild" : PrimResyncType.RenameDestination,
        "/InternalRef1/Child" : PrimResyncType.RenameSource,
        "/InternalRef1/RenamedChild" : PrimResyncType.RenameDestination,
        "/InternalRef2": PrimResyncType.UnchangedPrimStack,
        "/InternalRef3": PrimResyncType.UnchangedPrimStack
    })

    base.verifyStageContents(stage2, {
        'Prim1' : refToRefContents,
        'Prim2' : refToChildContents,
        'Prim3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.RenameSource,
        "/Prim1/RenamedChild" : PrimResyncType.RenameDestination,
        "/Prim2": PrimResyncType.UnchangedPrimStack,
        "/Prim3": PrimResyncType.UnchangedPrimStack
    })

    // Edit: Reparent and rename /Ref/RenamedChild to /MovedChild
    base.applyEdits(editor, "Move /Ref/RenamedChild -> /MovedChild", () => {
        expect(editor.movePrimAtPath('/Ref/RenamedChild', '/MovedChild')).toBe(true)
    })

    // Verify the udpated composition fields in layer1. The internal
    // reference fields to /Ref/RenamedChild and its descendant
    // /Ref/RenamedChild/GrandChild have been updated to use the moved paths.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/InternalRef1' : {
            'references' : [new Reference('', '/Ref')]
        },
        '/InternalRef2' : {
            'references' : [new Reference('', '/MovedChild')]
        },
        '/InternalRef3' : {
            'references' : [new Reference('', '/MovedChild/GrandChild')]
        },
    })

    // Verify the udpated composition fields in layer2. The reference fields
    // to /Ref/RenamedChild and its descendant /Ref/RenamedChild/GrandChild
    // have been similarly updated to use the moved paths.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier, '/MovedChild')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/MovedChild/GrandChild')]
        },
    })

    // Verify the updated stage contents for both stages.
    //
    // For both prims that directly reference /Ref, since RenamedChild has
    // been moved out of /Ref, it is no longer a composed child of the
    // referencing prims. Note that the over to RenamedChild (which brought
    // in the attributes overChildAttr and GrandChild.overChildAttr) has been
    // deleted to prevent the reintroduction of a partially specced
    // RenamedChild.
    //
    // The contents of the other two prims in each stage remain unchanged
    // as the update to the reference fields allow those prims to remain the
    // same.
    refToRefContents = {
        '.' : ['refAttr', 'localAttr'],
        'LocalChild' : {},
    }

    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
        },
        'MovedChild' : {
            '.' : ['childAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr'],
            }
        },
        'InternalRef1' : refToRefContents,
        'InternalRef2' : refToChildContents,
        'InternalRef3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/RenamedChild" : PrimResyncType.RenameAndReparentSource,
        "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
        "/InternalRef1/RenamedChild" : PrimResyncType.Delete,
        "/InternalRef2": PrimResyncType.UnchangedPrimStack,
        "/InternalRef3": PrimResyncType.UnchangedPrimStack
    })

    base.verifyStageContents(stage2, {
        'Prim1' : refToRefContents,
        'Prim2' : refToChildContents,
        'Prim3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/RenamedChild" : PrimResyncType.Delete,
        "/Prim2": PrimResyncType.UnchangedPrimStack,
        "/Prim3": PrimResyncType.UnchangedPrimStack
    })

    // Edit: Reparent and rename /MovedChild back to its original path
    // /Ref/Child
    base.applyEdits(editor, "Move /MovedChild -> /Ref/Child", () => {
        expect(editor.movePrimAtPath('/MovedChild', '/Ref/Child')).toBe(true)
    })

    // Verify the udpated composition fields in layer1 and layer2. All the
    // reference fields have been updated to their original paths.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/InternalRef1' : {
            'references' : [new Reference('', '/Ref')]
        },
        '/InternalRef2' : {
            'references' : [new Reference('', '/Ref/Child')]
        },
        '/InternalRef3' : {
            'references' : [new Reference('', '/Ref/Child/GrandChild')]
        },
    })

    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier, '/Ref/Child')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/Child/GrandChild')]
        },
    })

    // Verify the updated stage contents for both stages.
    //
    // For both prims that directly reference /Ref, they are returned to
    // their original contents with one notable exception: the overs on
    // Child that introduced overChildAttr and GrandChild.overGrandChildAttr
    // are NOT restored from being deleted so these attributes are not
    // present like they were in the initial state of the stages.
    //
    // The contents of the other two prims in each stage remain unchanged
    // (which matches their initial state) as the update to the reference
    // fields allow those prims to remain the same.
    refToRefContents = {
        '.' : ['refAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr']
            }
        },
        'LocalChild' : {},
    }

    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr'],
                }
            }
        },
        'InternalRef1' : refToRefContents,
        'InternalRef2' : refToChildContents,
        'InternalRef3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage1, {
        "/MovedChild" : PrimResyncType.RenameAndReparentSource,
        "/Ref/Child" : PrimResyncType.RenameAndReparentDestination,
        "/InternalRef1/Child" : PrimResyncType.Other,
        "/InternalRef2": PrimResyncType.UnchangedPrimStack,
        "/InternalRef3": PrimResyncType.UnchangedPrimStack
    })

    base.verifyStageContents(stage2, {
        'Prim1' : refToRefContents,
        'Prim2' : refToChildContents,
        'Prim3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.Other,
        "/Prim2": PrimResyncType.UnchangedPrimStack,
        "/Prim3": PrimResyncType.UnchangedPrimStack
    })

    // Reset both layers before the next operation to return the overs on the
    // prims that reference /Ref
    layer1.importFromString(layer1ImportString)
    layer2.importFromString(layer2ImportString)

    // Verify the stage contents which again have the initial overs.
    refToRefContents = {
        '.' : ['refAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr', 'overChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'overGrandChildAttr']
            }
        },
        'LocalChild' : {},
    }

    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr'],
                }
            }
        },
        'InternalRef1' : refToRefContents,
        'InternalRef2' : refToChildContents,
        'InternalRef3' : refToGrandChildContents
    })

    base.verifyStageContents(stage2, {
        'Prim1' : refToRefContents,
        'Prim2' : refToChildContents,
        'Prim3' : refToGrandChildContents
    })

    // Edit: Delete the prim at /Ref/Child
    base.applyEdits(editor, "Delete /Ref/Child", () => {
        expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)
    })

    // Verify the udpated composition fields in layer1 and layer2. All the
    // reference fields that reference /Ref/Child or its descendants have
    // had those references removed. Note the reference fields remain but the
    // values are empty.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/InternalRef1' : {
            'references' : [new Reference('', '/Ref')]
        },
        '/InternalRef2' : {
            'references' : []
        },
        '/InternalRef3' : {
            'references' : []
        },
    })

    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : []
        },
        '/Prim3' : {
            'references' : []
        },
    })

    // Verify the updated stage contents for both stages.
    //
    // For both prims that directly reference /Ref, since Child has been
    // deleted as a child of from /Ref, it is no longer a composed child of
    // these referencing prims. Note that the overs to Child (which brought
    // in the attributes overChildAttr and GrandChild.overChildAttr) have
    // been deleted to prevent the reintroduction of a partially specced
    // Child.
    //
    // Unlike all the prior edits in this test case, the contents of the
    // other two prims in each stage DO change because the references have
    // been deleted and can no longer compose contents from across them.
    // Addtionally any child specs in the referencing prims that would've
    // comosed over the now deleted referenced prim's children are also
    // deleted to "truly delete" all composed prims from the deleted
    // reference.
    //
    // XXX: There is an open question as to whether this is the correct
    // behavior or if we should go a step further and delete the specs that
    // introduced the now deleted reference prims (instead of just removing
    // the reference but not the referencing prim itself like we do now).
    // This expanded approach would result in the InternalRef2, InternalRef3,
    // Prim2, and Prim3 prims being completely deleted from their stages.
    refToRefContents = {
        '.' : ['refAttr', 'localAttr'],
        'LocalChild' : {},
    }

    refToChildContents = {
        '.' : ['localAttr'],
        'LocalChild' : {},
    }

    refToGrandChildContents = {
        '.' : ['localAttr'],
        'LocalChild' : {},
    }

    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
        },
        'InternalRef1' : refToRefContents,
        'InternalRef2' : refToChildContents,
        'InternalRef3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/Child" : PrimResyncType.Delete,
        "/InternalRef1/Child" : PrimResyncType.Delete,
        "/InternalRef2": PrimResyncType.Other,
        "/InternalRef3": PrimResyncType.Other
    })

    base.verifyStageContents(stage2, {
        'Prim1' : refToRefContents,
        'Prim2' : refToChildContents,
        'Prim3' : refToGrandChildContents
    })
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.Delete,
        "/Prim2": PrimResyncType.Other,
        "/Prim3": PrimResyncType.Other
    })

  })

  it('test_BasicDependentPayloads', async () => {
    // Test downstream dependency namespace edits across basic single
    // payloads.

    // Setup:
    // Layer 1 has simple hierarchy of /Ref, Child, GrandChild that is
    // referenced and will be namespace edited.
    const layer1 = Layer.createAnonymous("layer1.usda")
    layer1.importFromString(`#usda 1.0
            def "Ref" {
                int refAttr

                def "Child" {
                    int childAttr

                    def "GrandChild" {
                        int grandChildAttr
                    }
                }
            }
        `)

    // Layer 2 has three prims that payload /Ref, /Ref/Child, and
    // /Ref/Child/GrandChild from layer 1 respectively. These will be
    // affected by downstream dependency edits.
    const layer2 = Layer.createAnonymous("layer2.usda")
    layer2.importFromString(`#usda 1.0
            def "Prim1" (
                payload = @${layer1.identifier}@</Ref>
            ) {
                over "Child" {
                    int overChildAttr
                    over "GrandChild" {
                        int overGrandChildAttr
                    }
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim2" (
                payload = @${layer1.identifier}@</Ref/Child>
            ) {
                int overChildAttr
                over "GrandChild" {
                    int overGrandChildAttr
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim3" (
                payload = @${layer1.identifier}@</Ref/Child/GrandChild>
            ) {
                def "LocalChild" {}
                int localAttr
            }
        `)

    // Open both layers as stages.
    const stage1 = await Stage.openMasked(layer1, StagePopulationMask.all())
    const stage2 = await Stage.openMasked(layer2, StagePopulationMask.all())

    // Create an editor for stage 1 with stage 2 as an addtional dependent
    // stage.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage2)

    // Verify the initial composition fields for both layer 2 (layer 1 has
    // no composition fields).
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({})
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'payload' : [new Payload(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'payload' : [new Payload(layer1.identifier, '/Ref/Child')]
        },
        '/Prim3' : {
            'payload' : [new Payload(layer1.identifier,
                                     '/Ref/Child/GrandChild')]
        },
    })

    // Verify the initial simple hierarchy in stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }
            }
        }
    })

    // Verify the initial composed prim contents for each prim in stage 2.
    // Note that all prims are loaded at the start so all payload contents
    // are composed with local prim specs.
    let prim1Contents: ExpectedContents = {
        '.' : ['refAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr', 'overChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'overGrandChildAttr']
            },
        },
        'LocalChild' : {},
    }

    const prim2Contents: ExpectedContents = {
        '.' : ['childAttr', 'overChildAttr', 'localAttr'],
        'GrandChild' : {
            '.' : ['grandChildAttr', 'overGrandChildAttr']
        },
        'LocalChild' : {},
    }

    let prim3Contents: ExpectedContents = {
        '.' : ['grandChildAttr', 'localAttr'],
        'LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })

    // Edit: Rename /Ref/Child to /Ref/RenamedChild
    base.applyEdits(editor, "Move /Ref/Child -> /Ref/RenamedChild", () => {
        expect(editor.movePrimAtPath('/Ref/Child', '/Ref/RenamedChild')).toBe(true)
    })

    // Verify the udpated composition fields in layer2. The payload fields to
    // /Ref/Child and its descendant /Ref/Child/GrandChild have been updated
    // to use the renamed paths because all prims are currently loaded.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'payload' : [new Payload(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'payload' : [new Payload(layer1.identifier, '/Ref/RenamedChild')]
        },
        '/Prim3' : {
            'payload' : [new Payload(layer1.identifier,
                                     '/Ref/RenamedChild/GrandChild')]
        },
    })

    // Verify the expected simple rename in stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'RenamedChild' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }
            }
        },
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/Child" : PrimResyncType.RenameSource,
        "/Ref/RenamedChild" : PrimResyncType.RenameDestination
    })

    // Verify the updated contents for stage 2.
    //
    // For /Prim1 which directly references /Ref, the child prim is renamed
    // to RenamedChild. And just like with references, this means the local
    // override specs for the prims introducing the payloads have been
    // renamed to RenamedChild.
    //
    // The contents of the other two prims in each stage remain unchanged
    // as the update to the payload fields allow those prims to remain the
    // same.
    prim1Contents = {
        '.' : ['refAttr', 'localAttr'],
        'RenamedChild' : {
            '.' : ['childAttr', 'overChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'overGrandChildAttr']
            },
        },
        'LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.RenameSource,
        "/Prim1/RenamedChild" : PrimResyncType.RenameDestination,
        "/Prim2" : PrimResyncType.UnchangedPrimStack,
        "/Prim3" : PrimResyncType.UnchangedPrimStack,
    })

    // Now unload /Prim1 and /Prim3 so that we can demonstrate the one way
    // that payload dependencies deviate from references.
    await stage2.unload('/Prim1')
    await stage2.unload('/Prim3')

    // Verify the contents of stage 2 with the prims unloaded.
    //
    // /Prim1 and /Prim3 are only composed from the their local opinions
    // without the opinions from their payloads in layer 1
    prim1Contents = {
        '.' : ['localAttr'],
        'RenamedChild' : {
            '.' : ['overChildAttr'],
            'GrandChild' : {
                '.' : ['overGrandChildAttr'],
            },
        },
        'LocalChild' : {},
    }

    prim3Contents = {
        '.' : ['localAttr'],
        'LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })

    // Edit: Rename /Ref/RenamedChild back to /Ref/Child
    base.applyEdits(editor, "Move /Ref/RenamedChild -> /Ref/Child", () => {
        expect(editor.movePrimAtPath('/Ref/RenamedChild', '/Ref/Child')).toBe(true)
    })

    // Verify the expected simple rename back in stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }
            }
        },
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/RenamedChild" : PrimResyncType.RenameSource,
        "/Ref/Child" : PrimResyncType.RenameDestination
    })

    // Verify the udpated composition fields in layer2. ONLY the payload for
    // the still loaded /Prim2 is updated. The payload for /Prim1 would've
    // been unaffected regardless of the load state, but /Prim3's payload
    // can't be updated solely because it is unloaded.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'payload' : [new Payload(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'payload' : [new Payload(layer1.identifier, '/Ref/Child')]
        },
        '/Prim3' : {
            'payload' : [new Payload(layer1.identifier,
                                     '/Ref/RenamedChild/GrandChild')]
        },
    })

    // Verify the contents for stage 2
    //
    // NONE of the prim contents have changed but for a different reasons.
    // /Prim1 and /Prim3 have not changed because the payloads are unloaded
    // and there is no dependency on the payload path for which to propagate
    // dependent edits.
    // /Prim2 is unchanged because the loaded payload's path has been updated
    // to the new path.
    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })
    base.verifyStageResyncNotices(stage2, {
        "/Prim2" : PrimResyncType.UnchangedPrimStack
    })

    // Now load /Prim1 and /Prim3 again.
    await stage2.load('/Prim1')
    // XXX: Verify that loading /Prim3 will emit warnings
    // because of the payload points to path that no longer exists in layer1.
    await stage2.load('/Prim3')

    // Verify the post-edit contents for stage 2 now with all prims loaded.
    //
    // The contents of /Prim1 and /Prim3 with payloads loaded show how we
    // couldn't correctly update the dependent paths for the unloaded
    // payloads when doing the prior rename back.
    //
    // The now loaded /Prim1 is in a partially edited state as we weren't
    // able to move the the local RenamedChild specs back to Child while the
    // prim was unloaded.
    //
    // The now loaded /Prim3 is unchanged from its unloaded state as the
    // payload path still points to /Ref/RenamedChild/GrandChild which no
    // longer exists at that path (and we have an unresolved payload
    // composition error on this prim now).
    prim1Contents = {
        '.' : ['refAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr']
            },
        },
        'RenamedChild' : {
            '.' : ['overChildAttr'],
            'GrandChild' : {
                '.' : ['overGrandChildAttr'],
            },
        },
        'LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })

  })

  it('test_BasicNestedReferences', async () => {
    // Test downstream dependency name space edits across chains of
    // references.

    // Setup:
    // Layer 1 has simple hierarchy of /Ref, Child, GrandChild that is
    // referenced and will be namespace edited.
    const layer1 = Layer.createAnonymous("layer1.usda")
    layer1.importFromString(`#usda 1.0
            def "Ref" {
                int refAttr

                def "Child" {
                    int childAttr

                    def "GrandChild" {
                        int grandChildAttr
                    }
                }
            }
        `)

    // Layer 2 has three prims that reference /Ref, /Ref/Child, and
    // /Ref/Child/GrandChild from layer 1 respectively. These will be
    // affected by downstream dependency edits.
    const layer2 = Layer.createAnonymous("layer2.usda")
    layer2.importFromString(`#usda 1.0
            def "Prim1" (
                references = @${layer1.identifier}@</Ref>
            ) {
                over "Child" {
                    int over1ChildAttr
                    over "GrandChild" {
                        int over1GrandChildAttr
                    }
                }
                def "Prim1_LocalChild" {}
                int prim1_localAttr
            }

            def "Prim2" (
                references = @${layer1.identifier}@</Ref/Child>
            ) {
                over "GrandChild" {
                    int over2GrandChildAttr
                }
                def "Prim2_LocalChild" {}
                int prim2_localAttr
            }

            def "Prim3" (
                references = @${layer1.identifier}@</Ref/Child/GrandChild>
            ) {
                def "Prim3_LocalChild" {}
                int prim3_LocalAttr
            }
        `)

    // Layer3 has multiple prims that each reference the possible
    // prims in layer2 in order to test the various permutations of direct
    // and ancestral reference chains.
    // /Prim4 : References /Prim1 which directly references /Ref
    // /Prim4_A : References /Prim1/Child which ancestrally references
    //            /Ref/Child
    // /Prim4_B : References /Prim1/Child/GrandChild which ancestrally
    //            references /Ref/Child/GrandChild
    // /Prim5 : References /Prim2 which directly references /Ref/Child
    // /Prim5_A : References /Prim2/GrandChild which ancestrally references
    //            /Ref/Child/GrandChild
    // /Prim6 : References /Prim3 which directly references
    //          /Ref/Child/GrandChild
    const layer3 = Layer.createAnonymous("layer3.usda")
    layer3.importFromString(`#usda 1.0
            def "Prim4" (
                references = @${layer2.identifier}@</Prim1>
            ) {
                over "Child" {
                    int over4ChildAttr
                    over "GrandChild" {
                        int over4GrandChildAttr
                    }
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim4_A" (
                references = @${layer2.identifier}@</Prim1/Child>
            ) {
                over "GrandChild" {
                    int over4_AGrandChildAttr
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim4_B" (
                references = @${layer2.identifier}@</Prim1/Child/GrandChild>
            ) {
                def "LocalChild" {}
                int localAttr
            }

            def "Prim5" (
                references = @${layer2.identifier}@</Prim2>
            ) {
                over "GrandChild" {
                    int over5GrandChildAttr
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim5_A" (
                references = @${layer2.identifier}@</Prim2/GrandChild>
            ) {
                def "LocalChild" {}
                int localAttr
            }

            def "Prim6" (
                references = @${layer2.identifier}@</Prim3>
            ) {
                def "LocalChild" {}
                int localAttr
            }
        `)

    // Open all three layers as stages.
    const stage1 = await Stage.openMasked(layer1, StagePopulationMask.all())
    const stage2 = await Stage.openMasked(layer2, StagePopulationMask.all())
    const stage3 = await Stage.openMasked(layer3, StagePopulationMask.all())

    // Create an editor for stage1 with ONLY stage 3 as a dependent stage
    // (i.e. excluding stage 2). This will still cause edits to layer2 when
    // layer1 is edited as stage3 has dependencies on layer 2 and thus, these
    // changes will be reflected in stage 2.
    const editor = new NamespaceEditor(stage1)
    editor.addDependentStage(stage3)

    // Verify the initial composition fields for each layer.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({})

    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier, '/Ref/Child')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/Child/GrandChild')]
        },
    })

    expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
        '/Prim4' : {
            'references' : [new Reference(layer2.identifier, '/Prim1')]
        },
        '/Prim4_A' : {
            'references' : [new Reference(layer2.identifier, '/Prim1/Child')]
        },
        '/Prim4_B' : {
            'references' : [new Reference(layer2.identifier,
                                          '/Prim1/Child/GrandChild')]
        },
        '/Prim5' : {
            'references' : [new Reference(layer2.identifier, '/Prim2')]
        },
        '/Prim5_A' : {
            'references' : [new Reference(layer2.identifier,
                                          '/Prim2/GrandChild')]
        },
        '/Prim6' : {
            'references' : [new Reference(layer2.identifier, '/Prim3')]
        },
    })

    // Verify the initial contents of stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }
            }
        },
    })

    // Verify the initial contents of stage 2 with its three single
    // reference composed prims
    let prim1Contents: ExpectedContents = {
        '.' : ['refAttr', 'prim1_localAttr'],
        'Child' : {
            '.' : ['childAttr', 'over1ChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'over1GrandChildAttr']
            },
        },
        'Prim1_LocalChild' : {},
    }

    let prim2Contents: ExpectedContents = {
        '.' : ['childAttr', 'prim2_localAttr'],
        'GrandChild' : {
            '.' : ['grandChildAttr', 'over2GrandChildAttr']
        },
        'Prim2_LocalChild' : {},
    }

    let prim3Contents: ExpectedContents = {
        '.' : ['grandChildAttr', 'prim3_LocalAttr'],
        'Prim3_LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })

    // Verify the initial contents of stage 3 with its all its prims composed
    // from 2-chain references
    let prim4Contents: ExpectedContents = {
        '.' : ['refAttr', 'prim1_localAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr', 'over1ChildAttr', 'over4ChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'over1GrandChildAttr',
                       'over4GrandChildAttr']
            },
        },
        'Prim1_LocalChild' : {},
        'LocalChild' : {},
    }

    let prim4_AContents: ExpectedContents = {
        '.' : ['childAttr', 'over1ChildAttr', 'localAttr'],
        'GrandChild' : {
            '.' : ['grandChildAttr', 'over1GrandChildAttr',
                   'over4_AGrandChildAttr']
        },
        'LocalChild' : {},
    }

    let prim4_BContents: ExpectedContents = {
        '.' : ['grandChildAttr', 'over1GrandChildAttr', 'localAttr'],
        'LocalChild' : {},
    }

    let prim5Contents: ExpectedContents = {
        '.' : ['childAttr', 'prim2_localAttr', 'localAttr'],
        'GrandChild' : {
            '.' : ['grandChildAttr', 'over2GrandChildAttr',
                   'over5GrandChildAttr']
        },
        'Prim2_LocalChild' : {},
        'LocalChild' : {},
    }

    let prim5_AContents: ExpectedContents = {
        '.' : ['grandChildAttr', 'over2GrandChildAttr', 'localAttr'],
        'LocalChild' : {},
    }

    let prim6Contents: ExpectedContents = {
        '.' : ['grandChildAttr', 'prim3_LocalAttr', 'localAttr'],
        'Prim3_LocalChild' : {},
        'LocalChild' : {},
    }

    base.verifyStageContents(stage3, {
        'Prim4' : prim4Contents,
        'Prim4_A' : prim4_AContents,
        'Prim4_B' : prim4_BContents,
        'Prim5' : prim5Contents,
        'Prim5_A' : prim5_AContents,
        'Prim6' : prim6Contents
    })

    // Edit: Rename /Ref/Child to /Ref/RenamedChild on stage 1.
    base.applyEdits(editor, "Move /Ref/Child -> /Ref/RenamedChild", () => {
        expect(editor.movePrimAtPath('/Ref/Child', '/Ref/RenamedChild')).toBe(true)
    })

    // Verify the udpated composition fields in layer2. The reference fields
    // to /Ref/Child and its descendant /Ref/Child/GrandChild have been
    // updated to use the renamed paths.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/RenamedChild')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/RenamedChild/GrandChild')]
        },
    })

    // Verify the udpated composition fields in layer3. The reference
    // fields to /Prim1/Child and its descendant /Prim1/Child/GrandChild have
    // to be updated as all the specs composing /Prim1/Child are renamed to
    // RenamedChild by the dependent edits.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
        '/Prim4' : {
            'references' : [new Reference(layer2.identifier, '/Prim1')]
        },
        '/Prim4_A' : {
            'references' : [new Reference(layer2.identifier,
                                          '/Prim1/RenamedChild')]
        },
        '/Prim4_B' : {
            'references' : [new Reference(layer2.identifier,
                                          '/Prim1/RenamedChild/GrandChild')]
        },
        '/Prim5' : {
            'references' : [new Reference(layer2.identifier, '/Prim2')]
        },
        '/Prim5_A' : {
            'references' : [new Reference(layer2.identifier,
                                          '/Prim2/GrandChild')]
        },
        '/Prim6' : {
            'references' : [new Reference(layer2.identifier, '/Prim3')]
        },
    })

    // Verify the simple prim rename is reflected in contents of stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'RenamedChild' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }
            }
        },
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/Child" : PrimResyncType.RenameSource,
        "/Ref/RenamedChild" : PrimResyncType.RenameDestination
    })

    // Verify the updated contents of stage 2.
    //
    // There are prims in stage 3 that reference /Prim1/Child on layer2 so
    // which ancestrally references /Ref/Child. So the specs for /Prim1/Child
    // on layer 2 are renamed to RenamedChild for this dependency. This
    // change is reflected in the contents of stage 2.
    //
    // Stage 3 also has prims with dependencies on /Prim2 and /Prim3, but
    // the contents of those two prims remain the same as the reference paths
    // are just updated to /Ref/RenamedChild and /Ref/RenamedChild/GrandChild.
    prim1Contents = {
        '.' : ['refAttr', 'prim1_localAttr'],
        'RenamedChild' : {
            '.' : ['childAttr', 'over1ChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'over1GrandChildAttr']
            },
        },
        'Prim1_LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })
    // Note that since stage2 isn't a dependent stage of the namespace editor
    // we don't do any analysis of the edits that cause resyncs on prims on
    // the stage.
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.Delete,
        "/Prim1/RenamedChild" : PrimResyncType.Other,
        "/Prim2" : PrimResyncType.Other,
        "/Prim3" : PrimResyncType.Other,
    })

    // Verify the updated contents of stage 3.
    //
    // /Prim4 references /Prim1 which references /Ref so /Prim4/Child is also
    // renamed to /Prim4/RenamedChild.
    // No other prims' contents change as they each had one of their nested
    // references arcs updated to the new path.
    prim4Contents = {
        '.' : ['refAttr', 'prim1_localAttr', 'localAttr'],
        'RenamedChild' : {
            '.' : ['childAttr', 'over1ChildAttr', 'over4ChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'over1GrandChildAttr',
                       'over4GrandChildAttr']
            },
        },
        'Prim1_LocalChild' : {},
        'LocalChild' : {},
    }

    base.verifyStageContents(stage3, {
        'Prim4' : prim4Contents,
        'Prim4_A' : prim4_AContents,
        'Prim4_B' : prim4_BContents,
        'Prim5' : prim5Contents,
        'Prim5_A' : prim5_AContents,
        'Prim6' : prim6Contents
    })
    base.verifyStageResyncNotices(stage3, {
        "/Prim4/Child" : PrimResyncType.RenameSource,
        "/Prim4/RenamedChild" : PrimResyncType.RenameDestination,
        "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        "/Prim4_B" : PrimResyncType.UnchangedPrimStack,
        "/Prim5" : PrimResyncType.UnchangedPrimStack,
        "/Prim5_A" : PrimResyncType.UnchangedPrimStack,
        "/Prim6" : PrimResyncType.UnchangedPrimStack,
    })

    // Edit: Reparent and rename /Ref/RenamedChild to /MovedChild
    base.applyEdits(editor, "Move /Ref/RenamedChild -> /MovedChild", () => {
        expect(editor.movePrimAtPath('/Ref/RenamedChild', '/MovedChild')).toBe(true)
    })

    // Verify the udpated composition fields in layer2. The reference fields
    // to /Ref/RenamedChild and its descendant /Ref/RenamedChild/GrandChild
    // have been updated to use the moved paths.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier, '/MovedChild')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/MovedChild/GrandChild')]
        },
    })

    // Verify the udpated composition fields in layer3. Like with the
    // previous edit, the reference fields to /Prim1/RenamedChild and
    // its descendant /Prim1/RenamedChild/GrandChild have to be updated as
    // all the specs composing /Prim1/RenameChild have been moved by the
    // dependent edits. However, since RenamedChild was moved out /Ref, it no
    // longer maps across the reference to /Prim1 which results in the
    // deletion of the composed /Prim1/RenamedChild. So the reference fields
    // for /Prim4_A and /Prim4_B are updated to delete these references to
    // prims that no longer exist in layer2.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
        '/Prim4' : {
            'references' : [new Reference(layer2.identifier, '/Prim1')]
        },
        '/Prim4_A' : {
            'references' : []
        },
        '/Prim4_B' : {
            'references' : []
        },
        '/Prim5' : {
            'references' : [new Reference(layer2.identifier, '/Prim2')]
        },
        '/Prim5_A' : {
            'references' : [new Reference(layer2.identifier,
                                          '/Prim2/GrandChild')]
        },
        '/Prim6' : {
            'references' : [new Reference(layer2.identifier, '/Prim3')]
        },
    })

    // Verify the simple reparent and rename is reflected in contents of
    // stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
        },
        'MovedChild' : {
            '.' : ['childAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr']
            }
        }
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/RenamedChild" : PrimResyncType.RenameAndReparentSource,
        "/MovedChild" : PrimResyncType.RenameAndReparentDestination
    })

    // Verify the udpated contents of stage 2.
    //
    // There are prims in stage 3 that reference /Prim1/RenamedChild on
    // layer2 which ancestrally references /Ref/RenamedChild. So the specs
    // for /Prim1/RenamedChild on layer 2 are deleted for this dependency
    // (since the RenamedChild was moved out of the reference). This change
    // is reflected in the contents of stage 2.
    //
    // Stage 3 also has prims with dependencies on /Prim2 and /Prim3, but
    // these contents remain the same as the reference paths are
    // just updated to /MovedChild and /MovedChild/GrandChild.
    prim1Contents = {
        '.' : ['refAttr', 'prim1_localAttr'],
        'Prim1_LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })
    // Note that since stage2 isn't a dependent stage of the namespace editor
    // we don't do any analysis of the edits that cause resyncs on prims on
    // the stage.
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/RenamedChild" : PrimResyncType.Delete,
        "/Prim2" : PrimResyncType.Other,
        "/Prim3" : PrimResyncType.Other,
    })

    // Verify the updated contents of stage 3.
    //
    // /Prim4 references /Prim1 which references /Ref so /Prim4/RenamedChild
    // is also deleted. /Prim4_A and /Prim4_B have lost their references so
    // these also only have the contents of their local specs.
    //
    // The rest of the prims have no contents change as they each had one of
    // their nested references arcs updated to the new path.
    prim4Contents = {
        '.' : ['refAttr', 'prim1_localAttr', 'localAttr'],
        'Prim1_LocalChild' : {},
        'LocalChild' : {},
    }

    prim4_AContents = {
        '.' : ['localAttr'],
        'LocalChild' : {},
    }

    prim4_BContents = {
        '.' : ['localAttr'],
        'LocalChild' : {},
    }

    base.verifyStageContents(stage3, {
        'Prim4' : prim4Contents,
        'Prim4_A' : prim4_AContents,
        'Prim4_B' : prim4_BContents,
        'Prim5' : prim5Contents,
        'Prim5_A' : prim5_AContents,
        'Prim6' : prim6Contents
    })
    base.verifyStageResyncNotices(stage3, {
        "/Prim4/RenamedChild" : PrimResyncType.Delete,
        "/Prim4_A" : PrimResyncType.Other,
        "/Prim4_B" : PrimResyncType.Other,
        "/Prim5" : PrimResyncType.UnchangedPrimStack,
        "/Prim5_A" : PrimResyncType.UnchangedPrimStack,
        "/Prim6" : PrimResyncType.UnchangedPrimStack,
    })

    // Edit: Reparent and rename /MovedChild back to its original path
    // /Ref/Child
    base.applyEdits(editor, "Move /MovedChild -> /Ref/Child", () => {
        expect(editor.movePrimAtPath('/MovedChild', '/Ref/Child')).toBe(true)
    })

    // Verify the udpated composition fields in layer2. The reference fields
    // have all been updated to their original paths.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : [new Reference(layer1.identifier, '/Ref/Child')]
        },
        '/Prim3' : {
            'references' : [new Reference(layer1.identifier,
                                          '/Ref/Child/GrandChild')]
        },
    })

    // Verify the udpated composition fields in layer3 which have NOT changed
    // because the prior edit deleted both references that initially
    // referred to /Prim1/Child.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
        '/Prim4' : {
            'references' : [new Reference(layer2.identifier, '/Prim1')]
        },
        '/Prim4_A' : {
            'references' : []
        },
        '/Prim4_B' : {
            'references' : []
        },
        '/Prim5' : {
            'references' : [new Reference(layer2.identifier, '/Prim2')]
        },
        '/Prim5_A' : {
            'references' : [new Reference(layer2.identifier, '/Prim2/GrandChild')]
        },
        '/Prim6' : {
            'references' : [new Reference(layer2.identifier, '/Prim3')]
        },
    })

    // Verify the return to the the original contents in stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }
            }
        },
    })
    base.verifyStageResyncNotices(stage1, {
        "/MovedChild" : PrimResyncType.RenameAndReparentSource,
        "/Ref/Child" : PrimResyncType.RenameAndReparentDestination
    })

    // Verify the udpated contents of stage 2.
    //
    // The contents of /Prim1 have returned to the original contents with
    // the exception that the local opinions for Child and GrandChild in
    // layer2 were deleted in the prior edit and cannot be restored.
    //
    // /Prim2 and /Prim3 remain unchanged.
    prim1Contents = {
        '.' : ['refAttr', 'prim1_localAttr'],
        'Child' : {
            '.' : ['childAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr']
            },
        },
        'Prim1_LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })
    // Note that since stage2 isn't a dependent stage of the namespace editor
    // we don't do any analysis of the edits that cause resyncs on prims on
    // the stage.
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.Other,
        "/Prim2" : PrimResyncType.Other,
        "/Prim3" : PrimResyncType.Other,
    })

    // Verify the updated contents of stage 3.
    //
    // /Prim4 returns to its original contents with the exception that
    // deleted local opinions on layer3 for Child and the deleted opinions
    // from /Prim1/Child on layer2 cannot be restored.
    //
    // /Prim4_A and /Prim4_B remain unchanged (and therefore unrestored)
    // because their references were deleted by the previous edit.
    //
    // The rest of the prims continue to have no contents change as they each
    // had one of their nested references arcs updated to the original path.
    prim4Contents = {
        '.' : ['refAttr', 'prim1_localAttr', 'localAttr'],
        'Child' : {
            '.' : ['childAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr']
            },
        },
        'Prim1_LocalChild' : {},
        'LocalChild' : {},
    }

    base.verifyStageContents(stage3, {
        'Prim4' : prim4Contents,
        'Prim4_A' : prim4_AContents,
        'Prim4_B' : prim4_BContents,
        'Prim5' : prim5Contents,
        'Prim5_A' : prim5_AContents,
        'Prim6' : prim6Contents
    })
    base.verifyStageResyncNotices(stage3, {
        "/Prim4/Child" : PrimResyncType.Other,
        "/Prim5" : PrimResyncType.UnchangedPrimStack,
        "/Prim5_A" : PrimResyncType.UnchangedPrimStack,
        "/Prim6" : PrimResyncType.UnchangedPrimStack,
    })

    // Edit: Delete /Ref/Child
    base.applyEdits(editor, "Delete /Ref/Child", () => {
        expect(editor.deletePrimAtPath('/Ref/Child')).toBe(true)
    })

    // Verify the udpated composition fields in layer2. The reference fields
    // to /Ref/Child and its descendant /Ref/Child/GrandChild have been
    // set to empty now that those prims don't exist on layer1
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/Prim1' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/Prim2' : {
            'references' : []
        },
        '/Prim3' : {
            'references' : []
        },
    })

    // Verify the udpated composition fields in layer3. The only change now
    // is that /Prim5_A's reference to /Prim2/GrandChild has been deleted as
    // /Prim2/GrandChild is no a valid composed prim of layer2.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
        '/Prim4' : {
            'references' : [new Reference(layer2.identifier, '/Prim1')]
        },
        '/Prim4_A' : {
            'references' : []
        },
        '/Prim4_B' : {
            'references' : []
        },
        '/Prim5' : {
            'references' : [new Reference(layer2.identifier, '/Prim2')]
        },
        '/Prim5_A' : {
            'references' : []
        },
        '/Prim6' : {
            'references' : [new Reference(layer2.identifier, '/Prim3')]
        },
    })

    // Verify the deletion of Child on stage 1.
    base.verifyStageContents(stage1, {
        'Ref': {
            '.' : ['refAttr'],
        },
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref/Child" : PrimResyncType.Delete,
    })

    // Verify the udpated contents of stage 2.
    //
    // The contents of /Prim1 no longer have the child Child.
    //
    // /Prim2 and /Prim3 have lost their references so only have local
    // opinions from layer2.
    prim1Contents = {
        '.' : ['refAttr', 'prim1_localAttr'],
        'Prim1_LocalChild' : {},
    }

    prim2Contents = {
        '.' : ['prim2_localAttr'],
        'Prim2_LocalChild' : {},
    }

    prim3Contents = {
        '.' : ['prim3_LocalAttr'],
        'Prim3_LocalChild' : {},
    }

    base.verifyStageContents(stage2, {
        'Prim1' : prim1Contents,
        'Prim2' : prim2Contents,
        'Prim3' : prim3Contents
    })
    // Note that since stage2 isn't a dependent stage of the namespace editor
    // we don't do any analysis of the edits that cause resyncs on prims on
    // the stage.
    base.verifyStageResyncNotices(stage2, {
        "/Prim1/Child" : PrimResyncType.Delete,
        "/Prim2" : PrimResyncType.Other,
        "/Prim3" : PrimResyncType.Other,
    })

    // Verify the updated contents of stage 3.
    //
    // /Prim4 loses all opinions about Child.
    //
    // /Prim4_A and /Prim4_B remain unchanged still because of the prior
    // deleted references.
    //
    // /Prim5 and /Prim6 are affected by the deletion of the references on
    // /Prim2 and /Prim3 respectively, but they still composed the layer2
    // local opinions from /Prim2 and /Prim3
    //
    // /Prim5_A only has its own local opinions because its own reference
    // has also been deleted.
    prim4Contents = {
        '.' : ['refAttr', 'prim1_localAttr', 'localAttr'],
        'Prim1_LocalChild' : {},
        'LocalChild' : {},
    }

    prim5Contents = {
        '.' : ['prim2_localAttr', 'localAttr'],
        'Prim2_LocalChild' : {},
        'LocalChild' : {},
    }

    prim5_AContents = {
        '.' : ['localAttr'],
        'LocalChild' : {},
    }

    prim6Contents = {
        '.' : ['prim3_LocalAttr', 'localAttr'],
        'Prim3_LocalChild' : {},
        'LocalChild' : {},
    }

    base.verifyStageContents(stage3, {
        'Prim4' : prim4Contents,
        'Prim4_A' : prim4_AContents,
        'Prim4_B' : prim4_BContents,
        'Prim5' : prim5Contents,
        'Prim5_A' : prim5_AContents,
        'Prim6' : prim6Contents
    })
    base.verifyStageResyncNotices(stage3, {
        "/Prim4/Child" : PrimResyncType.Delete,
        "/Prim5" : PrimResyncType.Other,
        "/Prim5_A" : PrimResyncType.Other,
        "/Prim6" : PrimResyncType.Other
    })

  })

  it('test_SiblingReferences', async () => {
    // Test that a prim that references a sibling has its reference path
    // correctly updated when the parent path is changed.

    const layer1 = Layer.createAnonymous("layer1.usda")
    const layer1ImportString = `#usda 1.0
            def "Model"
            {
                def "Ref"
                {
                    int modelRefAttr
                }

                def "SiblingRef" (
                    references = </Model/Ref>
                ) {
                    int siblingRefAttr
                }
            }

        `
    layer1.importFromString(layer1ImportString)

    const stage1 = await Stage.openMasked(layer1, StagePopulationMask.all())
    const editor = new NamespaceEditor(stage1)

    // Verify the initial composition fields.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/Model/SiblingRef' : {
            'references' : [new Reference('', '/Model/Ref')]
        },
    })

    const modelContents: ExpectedContents = {
        'Ref': {
            '.' : ['modelRefAttr']
        },
        'SiblingRef': {
            '.': ['siblingRefAttr', 'modelRefAttr']
        }
    }

    // Verify the expected contents of stage 1
    base.verifyStageContents(stage1, {
        'Model': modelContents,
    })

    // Edit: Rename /Model to /RenamedModel
    // This is to check that references targeting sibling prims have their
    // paths correctly updated when a parent is renamed.
    base.applyEdits(editor, "Move /Model-> /RenamedModel", () => {
        expect(editor.movePrimAtPath('/Model', '/RenamedModel')).toBe(true)
    })

    // Verify the updated composition fields in layer1.
    expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
        '/RenamedModel/SiblingRef' : {
            'references' : [new Reference('', '/RenamedModel/Ref')]
        },
    })

    base.verifyStageContents(stage1, {
        'RenamedModel' : modelContents
    })
    base.verifyStageResyncNotices(stage1, {
        "/Model" : PrimResyncType.RenameSource,
        "/RenamedModel" : PrimResyncType.RenameDestination,
    })

  })

  it('test_LayerDefaultPrim', async () => {
    // Test edits in layers with a default prim and dependent references
    // and payloads that do not specify a prim path.

    // Setup: Layer1 has a prim /Ref which and Ref is the default prim of
    // the layer.
    const layer1 = Layer.createAnonymous("layer1.usda")
    layer1.importFromString(`#usda 1.0
        (
            defaultPrim = "Ref"
        )

        def "Ref" {
            int refAttr
            def "Child" {
                int childAttr
            }
        }

        def "World" {
        }

        `)

    // Open just layer1 as a stage and create an editor for it. There are no
    // dependent stages besides the stage itself.
    const stage1 = await Stage.openMasked(layer1, StagePopulationMask.all())
    const editor = new NamespaceEditor(stage1)

    // Verify "Ref" is the default prim of layer1.
    expect(getDefaultPrim(layer1)).toBe("Ref")

    // Verify initial contents of stage1.
    const refContents: ExpectedContents = {
        '.' : ['refAttr'],
        'Child' : {
            '.' : ['childAttr'],
        }
    }

    base.verifyStageContents(stage1, {
        'Ref' : refContents,
        'World' : {}
    })

    // Edit: Rename /Ref to /RenamedRef
    base.applyEdits(editor, "Rename /Ref -> /RenamedRef", () => {
        expect(editor.movePrimAtPath("/Ref", "/RenamedRef")).toBe(true)
    })

    // Verify the default prim has been updated to "RenamedRef" because of
    // rename. The default prim is updated regardless of whether there is
    // a dependent stage that requires it.
    expect(getDefaultPrim(layer1)).toBe("RenamedRef")

    // Verify that /Ref was renamed in stage1.
    base.verifyStageContents(stage1, {
        'RenamedRef' : refContents,
        'World' : {}
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref" : PrimResyncType.RenameSource,
        "/RenamedRef" : PrimResyncType.RenameDestination,
    })

    // Edit: Reparent /RenamedRef to /World/RenamedRef.
    base.applyEdits(editor, "Reparent /RenamedRef -> /World/RenamedRef", () => {
        expect(editor.movePrimAtPath("/RenamedRef", "/World/RenamedRef")).toBe(true)
    })

    // Verify the default prim has been updated to "/World/RenamedRef"
    // because of the reparent. Note that the default prim is an absolute
    // path since it is not a root prim path. A root relative path (i.e.
    // without the initial '/') would be valid but for clarity an absolute
    // path is authored.
    expect(getDefaultPrim(layer1)).toBe("/World/RenamedRef")

    // Verify that RenamedRef was reparented in stage1.
    base.verifyStageContents(stage1, {
        'World' : {
            'RenamedRef' : refContents,
        }
    })
    base.verifyStageResyncNotices(stage1, {
        "/RenamedRef" : PrimResyncType.ReparentSource,
        "/World/RenamedRef" : PrimResyncType.ReparentDestination,
    })

    // Edit: Rename /World to /NewWorld.
    base.applyEdits(editor, "Reparent /World -> /NewWorld", () => {
        expect(editor.movePrimAtPath("/World", "/NewWorld")).toBe(true)
    })

    // Verify the default prim has been updated to "/NewWorld/RenamedRef"
    // because of the rename of its parent.
    expect(getDefaultPrim(layer1)).toBe("/NewWorld/RenamedRef")

    // Verify that /World was renamed in stage1.
    base.verifyStageContents(stage1, {
        'NewWorld' : {
            'RenamedRef' : refContents,
        }
    })
    base.verifyStageResyncNotices(stage1, {
        "/World" : PrimResyncType.RenameSource,
        "/NewWorld" : PrimResyncType.RenameDestination,
    })

    // Edit: Reparent and rename /NewWorld/RenamedRef back to /Ref
    base.applyEdits(editor, "Reparent /NewWorld/RenamedRef -> /Ref", () => {
        expect(editor.movePrimAtPath("/NewWorld/RenamedRef", "/Ref")).toBe(true)
    })

    // Verify the default prim has been returned to "Ref" again. Note that
    // the default prim is a relative path (just the prim name) since it IS a
    // root prim path. An absolute path would be valid but for consistency
    // with most existing assets we just use the prim name for root prims
    // that are the default prim.
    expect(getDefaultPrim(layer1)).toBe("Ref")

    // Verify that /NewWorld/RenamedRef has returned to /Ref on stage1.
    base.verifyStageContents(stage1, {
        'Ref' : refContents,
        'NewWorld' : {}
    })
    base.verifyStageResyncNotices(stage1, {
        "/NewWorld/RenamedRef" : PrimResyncType.RenameAndReparentSource,
        "/Ref" : PrimResyncType.RenameAndReparentDestination,
    })

    // XXX: Probably a case to rename Child to just prove that it doesn't
    // affect defaultPrim

    // For the next part we create two new layers (2 and 3) that have the
    // exact same contents. We have two prims that reference and payload
    // layer1 with no prim path (uses the defaultPrim) and two prims that
    // reference layer1's default prim explicit via a path to /Ref. We create
    // a stage for each of these two layers.
    const layerString = `#usda 1.0

        def "RefToDefault" (
            references = @${layer1.identifier}@
        ) {
        }

        def "PayloadToDefault" (
            payload =  @${layer1.identifier}@
        ) {
        }

        def "RefToExplicit" (
            references = @${layer1.identifier}@</Ref>
        ) {
        }

        def "PayloadToExplicit" (
            payload =  @${layer1.identifier}@</Ref>
        ) {
        }
        `

    const layer2 = Layer.createAnonymous("layer2.usda")
    layer2.importFromString(layerString)
    const stage2 = await Stage.openMasked(layer2, StagePopulationMask.all())

    const layer3 = Layer.createAnonymous("layer3.usda")
    layer3.importFromString(layerString)
    const stage3 = await Stage.openMasked(layer3, StagePopulationMask.all())

    // Add ONLY stage2 as a dependent stage of the namespace edit. Stage3
    // will not be a dependent stage but the use of default prim references
    // and payloads allow some its prims to automatically remain updated
    // with stage1 namespace edits.
    editor.addDependentStage(stage2)

    // Verify the initial composition fields in layer2 (which will be
    // updated after namespace edits.)
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/RefToDefault' : {
            'references' : [new Reference(layer1.identifier)]
        },
        '/PayloadToDefault' : {
            'payload' : [new Payload(layer1.identifier)]
        },
        '/RefToExplicit' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/PayloadToExplicit' : {
            'payload' : [new Payload(layer1.identifier, '/Ref')]
        },
    })

    // Verify the initial composition fields in layer3 which will NOT change
    // after any of our edits since stage3 was not added as a dependent stage
    // of the editor.
    const layer3CompositionFields = {
        '/RefToDefault' : {
            'references' : [new Reference(layer1.identifier)]
        },
        '/PayloadToDefault' : {
            'payload' : [new Payload(layer1.identifier)]
        },
        '/RefToExplicit' : {
            'references' : [new Reference(layer1.identifier, '/Ref')]
        },
        '/PayloadToExplicit' : {
            'payload' : [new Payload(layer1.identifier, '/Ref')]
        }
    }
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual(
                     layer3CompositionFields)

    // Verify the initial contents of stage2 and stage3 (which start off the
    // same). Each prim has the same contents since they each just reference/
    // payload the same prim in layer1.
    base.verifyStageContents(stage2, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : refContents,
        'RefToExplicit' : refContents,
        'PayloadToExplicit' : refContents,
    })

    base.verifyStageContents(stage3, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : refContents,
        'RefToExplicit' : refContents,
        'PayloadToExplicit' : refContents,
    })

    // Edit: Rename /Ref to /RenamedRef.
    // This will cause stage 3 to produce warnings.
    base.applyEdits(editor, "Rename /Ref -> /RenamedRef", () => {
        expect(editor.movePrimAtPath("/Ref", "/RenamedRef")).toBe(true)
    })

    // Like before, the default prim is updated in layer1 and the rename
    // is present in stage1.
    expect(getDefaultPrim(layer1)).toBe("RenamedRef")
    base.verifyStageContents(stage1, {
        'RenamedRef' : refContents,
        'NewWorld' : {}
    })
    base.verifyStageResyncNotices(stage1, {
        "/Ref" : PrimResyncType.RenameSource,
        "/RenamedRef" : PrimResyncType.RenameDestination,
    })

    // Verify in layer2 that the explicit reference and payload to /Ref
    // has been updated with the new path. The default using reference and
    // payload are unchanged.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/RefToDefault' : {
            'references' : [new Reference(layer1.identifier)]
        },
        '/PayloadToDefault' : {
            'payload' : [new Payload(layer1.identifier)]
        },
        '/RefToExplicit' : {
            'references' : [new Reference(layer1.identifier, '/RenamedRef')]
        },
        '/PayloadToExplicit' : {
            'payload' : [new Payload(layer1.identifier, '/RenamedRef')]
        },
    })
    // Verify layer3's composition fields are unchanged.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual(
                     layer3CompositionFields)

    // Verify stage2's contents are all unchanged. The default reference and
    // payloads still refer to the same prim since the default prim was
    // updated. The explicit path reference and payload were updated to use
    // the new path.
    base.verifyStageContents(stage2, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : refContents,
        'RefToExplicit' : refContents,
        'PayloadToExplicit' : refContents,
    })
    base.verifyStageResyncNotices(stage2, {
        "/RefToDefault" : PrimResyncType.UnchangedPrimStack,
        "/PayloadToDefault" : PrimResyncType.UnchangedPrimStack,
        "/RefToExplicit" : PrimResyncType.UnchangedPrimStack,
        "/PayloadToExplicit" : PrimResyncType.UnchangedPrimStack,
    })

    // Verify stage3's contents. The default reference and payload prims have
    // their contents unchanged since the default prim is updated in layer1
    // The explicit path prims however lose their contents since we couldn't
    // update the paths when not added as a dependent stage.
    // XXX: Verify that the stage issues a warning indicating that the
    // explicit paths to /Ref could not be resolved.
    base.verifyStageContents(stage3, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : refContents,
        'RefToExplicit' : {},
        'PayloadToExplicit' : {},
    })
    // Note that even though the default prim allow /RefToDefault and
    // /PayloadToDefault to remain unchanged, we don't track the namespace
    // edit effects for stage3 since it wasn't added as a dependent stage
    // and therefore we can't determine that their resyncs are no-ops in the
    // ObjectsChanged notification.
    base.verifyStageResyncNotices(stage3, {
        "/RefToDefault" : PrimResyncType.Other,
        "/PayloadToDefault" : PrimResyncType.Other,
        "/RefToExplicit" : PrimResyncType.Other,
        "/PayloadToExplicit" : PrimResyncType.Other,
    })

    // Unload both payloads on both stages 2 and 3.
    await stage2.unload('/PayloadToDefault')
    await stage2.unload('/PayloadToExplicit')
    await stage3.unload('/PayloadToDefault')
    await stage3.unload('/PayloadToExplicit')

    // Verify on both stages that the payload prims have no contents anymore
    // (stage3's PayloadToExplicit already had no contents due to the prior
    // edit).
    base.verifyStageContents(stage2, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : {},
        'RefToExplicit' : refContents,
        'PayloadToExplicit' : {},
    })

    base.verifyStageContents(stage3, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : {},
        'RefToExplicit' : {},
        'PayloadToExplicit' : {},
    })

    // Edit: Reparent /RenamedRef to /NewWorld/RenamedRef with the payloads
    // unloaded.
    base.applyEdits(editor, "Reparent /RenamedRef -> /NewWorld/RenamedRef", () => {
        expect(editor.movePrimAtPath("/RenamedRef", "/NewWorld/RenamedRef")).toBe(true)
    })

    // Like before, the default prim is updated in layer1 and the reparent
    // is present in stage1.
    expect(getDefaultPrim(layer1)).toBe("/NewWorld/RenamedRef")
    base.verifyStageContents(stage1, {
        'NewWorld' : {
            'RenamedRef' : refContents,
        }
    })
    base.verifyStageResyncNotices(stage1, {
        "/RenamedRef" : PrimResyncType.ReparentSource,
        "/NewWorld/RenamedRef" : PrimResyncType.ReparentDestination,
    })

    // Verify in layer2 that ONLY the explicit reference /RenamedRef
    // has been updated with the new path. Paths to unloaded payloads are not
    // updated and the default using reference and payload are unchanged.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/RefToDefault' : {
            'references' : [new Reference(layer1.identifier)]
        },
        '/PayloadToDefault' : {
            'payload' : [new Payload(layer1.identifier)]
        },
        '/RefToExplicit' : {
            'references' : [new Reference(layer1.identifier,
                                          '/NewWorld/RenamedRef')]
        },
        '/PayloadToExplicit' : {
            'payload' : [new Payload(layer1.identifier, '/RenamedRef')]
        },
    })

    // Verify layer3's composition fields are unchanged.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual(
                     layer3CompositionFields)

    // Verify stage2's reference contents are all unchanged. The payload
    // load contents are still empty because the payloads are still unloaded.
    base.verifyStageContents(stage2, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : {},
        'RefToExplicit' : refContents,
        'PayloadToExplicit' : {},
    })
    base.verifyStageResyncNotices(stage2, {
        "/RefToDefault" : PrimResyncType.UnchangedPrimStack,
        "/RefToExplicit" : PrimResyncType.UnchangedPrimStack,
    })

    // Verify stage3's contents. The default reference has its contents
    // unchanged since all the default prim is updated in layer1. The default
    // payload is empty because it is still unloaded.
    base.verifyStageContents(stage3, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : {},
        'RefToExplicit' : {},
        'PayloadToExplicit' : {},
    })
    base.verifyStageResyncNotices(stage3, {
        "/RefToDefault" : PrimResyncType.Other,
    })

    // Load all payloads on both stages.
    await stage2.load('/PayloadToDefault')
    await stage3.load('/PayloadToDefault')
    // XXX: Verify that unresolved prim path warnings are issued for the
    // payload paths to /RenamedRef.
    await stage2.load('/PayloadToExplicit')
    await stage3.load('/PayloadToExplicit')

    // On stage2 the default prim payload has its contents again as we didn't
    // need to update an payload paths while the payload was unloaded. The
    // explicit path payload prim's contents are not restored since we didn't
    // update its path while unloaded.
    base.verifyStageContents(stage2, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : refContents,
        'RefToExplicit' : refContents,
        'PayloadToExplicit' : {},
    })

    // On stage3 the default prim payload's contents are also restored for
    // for the same reason as we don't need to updated the payload path
    // itself to maintain the dependency.
    base.verifyStageContents(stage3, {
        'RefToDefault' : refContents,
        'PayloadToDefault' : refContents,
        'RefToExplicit' : {},
        'PayloadToExplicit' : {},
    })

    // Edit: Delete /NewWorld/RenamedRef
    // XXX: Verify that the stage issues unresolved prim path warnings for
    // the ref and payloads to default in both stage2 and stage3.
    base.applyEdits(editor, "Delete /NewWorld/RenamedRef", () => {
        expect(editor.deletePrimAtPath("/NewWorld/RenamedRef")).toBe(true)
    })

    // This time the defaultPrim field is completely removed in layer1 as
    // all specs for /NewWorld/RenamedRef are deleted.
    expect(getDefaultPrim(layer1)).toBe('')
    expect(hasDefaultPrim(layer1)).toBe(false)
    base.verifyStageContents(stage1, {
        'NewWorld' : {}
    })
    base.verifyStageResyncNotices(stage1, {
        "/NewWorld/RenamedRef" : PrimResyncType.Delete,
    })

    // Verify in layer2 that ONLY the explicit reference to
    // /NewWorld/RenamedRef in /RefToExplicit has been deleted. The
    // reference and payload to layer1's default prim are unchanged even
    // though there is no longer a default prim. /PayloadToExplicit is
    // unchanged since it hadn't been updated to use /NewWorld/RenamedRef
    // and doesn't have that dependency.
    expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
        '/RefToDefault' : {
            'references' : [new Reference(layer1.identifier)]
        },
        '/PayloadToDefault' : {
            'payload' : [new Payload(layer1.identifier)]
        },
        '/RefToExplicit' : {
            'references' : []
        },
        '/PayloadToExplicit' : {
            'payload' : [new Payload(layer1.identifier, '/RenamedRef')]
        },
    })

    // Verify layer3's composition fields are still unchanged being it was
    // not added as a dependent stage.
    expect(base.getCompositionFieldsInLayer(layer3)).toEqual(
                     layer3CompositionFields)

    // On both stages 2 and 3, none of the prims have any contents as the
    // reference/payload content has been deleted. Note that with the
    // exception of stage2's /RefToExplicit, all these prims have composition
    // errors to nonexistent reference/payload targets.
    base.verifyStageContents(stage2, {
        'RefToDefault' : {},
        'PayloadToDefault' : {},
        'RefToExplicit' : {},
        'PayloadToExplicit' : {},
    })
    base.verifyStageResyncNotices(stage2, {
        "/RefToDefault" : PrimResyncType.Other,
        "/PayloadToDefault" : PrimResyncType.Other,
        "/RefToExplicit" : PrimResyncType.Other,
    })
    base.verifyStageContents(stage3, {
        'RefToDefault' : {},
        'PayloadToDefault' : {},
        'RefToExplicit' : {},
        'PayloadToExplicit' : {},
    })
    base.verifyStageResyncNotices(stage3, {
        "/RefToDefault" : PrimResyncType.Other,
        "/PayloadToDefault" : PrimResyncType.Other,
    })

  })
})
