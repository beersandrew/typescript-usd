// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsBasicClassArcs.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdNamespaceEditorDependentEditsBasicClassArcs.py.

import { beforeEach, describe, expect, it } from 'vitest'
import { Layer, Reference } from 'typescript-usd/sdf'
import { NamespaceEditor, Stage, StagePopulationMask } from 'typescript-usd/usd'
import { NsEditorDependentEditsBase, PrimResyncType, type ExpectedContents } from '../support/nsEditorDependentEditsBase.ts'

// Usd.Stage.Open(layer, Usd.Stage.LoadAll).
const openLayer = (layer: Layer): Promise<Stage> =>
  Stage.openMasked(layer, StagePopulationMask.all())

describe('TestUsdNamespaceEditorDependentEditsBasicClassArcs', () => {
    // Tests for dependent edits across inherits and specializes.
    let base: NsEditorDependentEditsBase
    beforeEach(() => { base = new NsEditorDependentEditsBase() })

    async function runTestBasicDependentGlobalClassArcs(classArcType: string): Promise<void> {
        // Helper for testing downstream dependency namespace edits across
        // global class arcs and their implied class specs. classArcType can
        // be either 'inherits' or 'specializes'

        // Create the base layer which we will open as a stage and use to make
        // namespace edits to a global class
        //
        // The global class is /Class and has a Child with GrandChild hierarchy.
        // This layer also has three Instance prims that each inherit (or
        // specialize) /Class, /Class/Child, and /Class/Child/GrandChild
        // respectively which will be referenced in other layers to show how we
        // handle namespace edits that affect implied class arcs.
        const layer1 = Layer.createAnonymous("layer1.usda")
        layer1.importFromString(`#usda 1.0
            def "Class" {
                int classAttr
                
                def "Child" {
                    int childAttr

                    def "GrandChild" {
                        int grandChildAttr
                    }
                }    
            }

            def "Instance2" (
                ${classArcType} = </Class>
            ) {
                int instanceLocalAttr
                over "Child" {
                    int instanceLocalChildAttr
                    over "GrandChild" {
                        int instanceLocalGrandChildAttr
                    }
                }
                def "InstanceLocalChild" {}
            }

            def "Instance3" (
                ${classArcType} = </Class/Child>
            ) {
                int instanceLocalChildAttr
                over "GrandChild" {
                    int instanceLocalGrandChildAttr
                }
                def "InstanceLocalChild" {}
            }

            def "Instance4" (
                ${classArcType} = </Class/Child/GrandChild>
            ) {
                int instanceLocalGrandChildAttr
                def "InstanceLocalChild" {}
            }
        `)

        // Layer2 has a prim that references /Instance2 from the first layer
        // which inherits or specializes /Class and propagates the implied
        // class arc to /Class in this layer.
        const layer2 = Layer.createAnonymous("layer2.usda")
        layer2.importFromString(`#usda 1.0
            def "Prim2" (
                references = @${layer1.identifier}@</Instance2>
            ) {
                over "Child" {
                    int overRefChildAttr
                    over "GrandChild" {
                        int overRefGrandChildAttr
                    }
                }
                def "LocalChild" {}
                int localAttr
            }

            over "Class" {
                int impliedClassAttr
                
                over "Child" {
                    int impliedChildAttr

                    over "GrandChild" {
                        int impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer2_A has a prim that references /Prim2 from the layer2
        // which continues to propagate the implied class arc to /Class in this
        // layer.
        const layer2_A = Layer.createAnonymous("layer2_A.usda")
        layer2_A.importFromString(`#usda 1.0
            def "Prim2_A" (
                references = @${layer2.identifier}@</Prim2>
            ) {
            }

            over "Class" {
                int A_impliedClassAttr
                
                over "Child" {
                    int A_impliedChildAttr

                    over "GrandChild" {
                        int A_impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer3 has a prim that references /Instance3 from the first layer
        // which inherits or specializes /Class/Child and propagates the implied
        // class arc to /Class/Child in this layer.
        const layer3 = Layer.createAnonymous("layer3.usda")
        layer3.importFromString(`#usda 1.0
            def "Prim3" (
                references = @${layer1.identifier}@</Instance3>
            ) {
                int overRefChildAttr
                over "GrandChild" {
                    int overRefGrandChildAttr
                }
                def "LocalChild" {}
            }

            over "Class" {
                int impliedClassAttr
                
                over "Child" {
                    int impliedChildAttr

                    over "GrandChild" {
                        int impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer3_A has a prim that references /Prim3 from layer3 which continues
        // to propagate the implied class arc to /Class/Child in this layer.
        const layer3_A = Layer.createAnonymous("layer3_A.usda")
        layer3_A.importFromString(`#usda 1.0
            def "Prim3_A" (
                references = @${layer3.identifier}@</Prim3>
            ) {
            }

            over "Class" {
                int A_impliedClassAttr
                
                over "Child" {
                    int A_impliedChildAttr

                    over "GrandChild" {
                        int A_impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer4 has a prim that references /Instance4 from the first layer
        // which inherits or specializes /Class/Child/GrandChild and propagates
        // the implied class arc to /Class/Child/GrandChild in this layer.
        const layer4 = Layer.createAnonymous("layer4.usda")
        layer4.importFromString(`#usda 1.0
            def "Prim4" (
                references = @${layer1.identifier}@</Instance4>
            ) {
                int overRefGrandChildAttr
                def "LocalChild" {}
            }

            over "Class" {
                int impliedClassAttr
                
                over "Child" {
                    int impliedChildAttr

                    over "GrandChild" {
                        int impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer4_A has a prim that references /Prim4 from layer4 which continues
        // to propagate the implied class arc to /Class/Child/GrandChild in this
        // layer.
        const layer4_A = Layer.createAnonymous("layer4_A.usda")
        layer4_A.importFromString(`#usda 1.0
            def "Prim4_A" (
                references = @${layer4.identifier}@</Prim4>
            ) {
            }

            over "Class" {
                int A_impliedClassAttr
                
                over "Child" {
                    int A_impliedChildAttr

                    over "GrandChild" {
                        int A_impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer5 is has a combination of all three prims from layer2, layer3,
        // and layer4 to show the interaction when three different references
        // are accessing the same implied class structure (i.e. each prim
        // has an implied class arc to /Class, /Class/Child, and
        // /Class/Child/GrandChild respectively so they share implied class
        // specs.)
        const layer5 = Layer.createAnonymous("layer5.usda")
        layer5.importFromString(`#usda 1.0
            def "Prim2" (
                references = @${layer1.identifier}@</Instance2>
            ) {
                over "Child" {
                    int overRefChildAttr
                    over "GrandChild" {
                        int overRefGrandChildAttr
                    }
                }
                def "LocalChild" {}
                int localAttr
            }

            def "Prim3" (
                references = @${layer1.identifier}@</Instance3>
            ) {
                int overRefChildAttr
                over "GrandChild" {
                    int overRefGrandChildAttr
                }
                def "LocalChild" {}
            }

            def "Prim4" (
                references = @${layer1.identifier}@</Instance4>
            ) {
                int overRefGrandChildAttr
                def "LocalChild" {}
            }

            over "Class" {
                int impliedClassAttr
                
                over "Child" {
                    int impliedChildAttr

                    over "GrandChild" {
                        int impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Layer5_A has three prims that each reference the prims from the layer5
        // which continue to propagate the implied class arcs to /Class,
        // /Class/Child, and /Class/Child/GrandChild in this layer.
        const layer5_A = Layer.createAnonymous("layer5_A.usda")
        layer5_A.importFromString(`#usda 1.0
            def "Prim2_A" (
                references = @${layer5.identifier}@</Prim2>
            ) {
            }

            def "Prim3_A" (
                references = @${layer5.identifier}@</Prim3>
            ) {
            }

            def "Prim4_A" (
                references = @${layer5.identifier}@</Prim4>
            ) {
            }


            over "Class" {
                int A_impliedClassAttr
                
                over "Child" {
                    int A_impliedChildAttr

                    over "GrandChild" {
                        int A_impliedGrandChildAttr
                    }
                }    
            }
        `)

        // Create a stage for each of the layers we created.
        const stage1 = await openLayer(layer1)
        const stage2 = await openLayer(layer2)
        const stage2_A = await openLayer(layer2_A)
        const stage3 = await openLayer(layer3)
        const stage3_A = await openLayer(layer3_A)
        const stage4 = await openLayer(layer4)
        const stage4_A = await openLayer(layer4_A)
        const stage5 = await openLayer(layer5)
        const stage5_A = await openLayer(layer5_A)

        // Create an editor for just stage1 so we can edit the base class.
        const editor = new NamespaceEditor(stage1)

        // Add all of the other stages as dependent stages of the editor.
        editor.addDependentStage(stage2)
        editor.addDependentStage(stage2_A)
        editor.addDependentStage(stage3)
        editor.addDependentStage(stage3_A)
        editor.addDependentStage(stage4)
        editor.addDependentStage(stage4_A)
        editor.addDependentStage(stage5)
        editor.addDependentStage(stage5_A)

        // Verify the initial composition fields for layer1 which will change
        // as we perform edits.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Instance2' : {
                [classArcType]: ['/Class']
            },
            '/Instance3' : {
                [classArcType]: ['/Class/Child']
            },
            '/Instance4' : {
                [classArcType]: ['/Class/Child/GrandChild']
            },
        })

        // The rest of the dependent layers will not have any composition field
        // changes for this test, but for sanity's sake, we'll still verify this
        // after every edit via this helper function
        const _VerifyUnchangedLayerCompositionFields = () => {
            expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
                '/Prim2' : {
                    'references' : [new Reference(layer1.identifier, 
                                                  '/Instance2')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer2_A)).toEqual({
                '/Prim2_A' : {
                    'references' : [new Reference(layer2.identifier, '/Prim2')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
                '/Prim3' : {
                    'references' : [new Reference(layer1.identifier, 
                                                  '/Instance3')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer3_A)).toEqual({
                '/Prim3_A' : {
                    'references' : [new Reference(layer3.identifier, '/Prim3')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer4)).toEqual({
                '/Prim4' : {
                    'references' : [new Reference(layer1.identifier, 
                                                  '/Instance4')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer4_A)).toEqual({
                '/Prim4_A' : {
                    'references' : [new Reference(layer4.identifier, '/Prim4')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer5)).toEqual({
                '/Prim2' : {
                    'references' : [new Reference(layer1.identifier, 
                                                  '/Instance2')]
                },
                '/Prim3' : {
                    'references' : [new Reference(layer1.identifier, 
                                                  '/Instance3')]
                },
                '/Prim4' : {
                    'references' : [new Reference(layer1.identifier, 
                                                  '/Instance4')]
                },
            })

            expect(base.getCompositionFieldsInLayer(layer5_A)).toEqual({
                '/Prim2_A' : {
                    'references' : [new Reference(layer5.identifier, 
                                                  '/Prim2')]
                },
                '/Prim3_A' : {
                    'references' : [new Reference(layer5.identifier, 
                                                  '/Prim3')]
                },
                '/Prim4_A' : {
                    'references' : [new Reference(layer5.identifier, 
                                                  '/Prim4')]
                },
            })
        }

        _VerifyUnchangedLayerCompositionFields()

        // Verify the initial contents of stage1, which includes the three
        // composed instance prims and the class spec prims.
        const instanceAttrs = ['classAttr', 'instanceLocalAttr']
        const instanceChildAttrs = ['childAttr', 'instanceLocalChildAttr']
        const instanceGrandChildAttrs = [
            'grandChildAttr', 'instanceLocalGrandChildAttr']
        let instance2Contents: ExpectedContents = {
            '.' : instanceAttrs,
            'Child' : {
                '.' : instanceChildAttrs,
                'GrandChild' : {
                    '.' : instanceGrandChildAttrs
                },
            },
            'InstanceLocalChild' : {},
        }

        let instance3Contents: ExpectedContents = {
            '.' : ['childAttr', 'instanceLocalChildAttr'],
            'GrandChild' : {
                '.' : ['grandChildAttr', 'instanceLocalGrandChildAttr']
            },
            'InstanceLocalChild' : {},
        }

        let instance4Contents: ExpectedContents = {
            '.' : ['grandChildAttr', 'instanceLocalGrandChildAttr'],
            'InstanceLocalChild' : {},
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
                'Child' : {
                    '.' : ['childAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr']
                    }           
                }
            },
            'Instance2' : instance2Contents,
            'Instance3' : instance3Contents,
            'Instance4' : instance4Contents
        })

        // Verify initial contents of stage2 where /Prim2 has the contents of
        // the referenced Instance2 prim composed with local opinions and implied
        // class opinions from layer2.
        const composedRefAttrs = [...instanceAttrs, 'localAttr', 'impliedClassAttr']
        const composedRefChildAttrs = [...instanceChildAttrs, 
            'overRefChildAttr', 'impliedChildAttr']
        const composedRefGrandChildAttrs = [...instanceGrandChildAttrs, 
            'overRefGrandChildAttr', 'impliedGrandChildAttr']
        let prim2Contents: ExpectedContents = {
            '.' : composedRefAttrs,
            'Child' : {
                '.' : composedRefChildAttrs,
                'GrandChild' : {
                    '.' : composedRefGrandChildAttrs,
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2' : prim2Contents,
        })

        // Verify initial contents of stage2_A where /Prim2_A has the contents
        // of the referenced Prim2 prim composed with additional implied class
        // opinions from layer2_A.
        const composed_A_RefAttrs = [...composedRefAttrs, 'A_impliedClassAttr']
        const composed_A_ChildAttrs = [...composedRefChildAttrs, 'A_impliedChildAttr']
        const composed_A_GrandChildAttrs = [...composedRefGrandChildAttrs, 'A_impliedGrandChildAttr']
        let prim2_AContents: ExpectedContents = {
            '.' : composed_A_RefAttrs,
            'Child' : {
                '.' : composed_A_ChildAttrs,
                'GrandChild' : {
                    '.' : composed_A_GrandChildAttrs,
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2_A' : prim2_AContents,
        })

        // Verify initial contents of stage3 where /Prim3 has the contents of
        // the referenced Instance3 prim composed with local opinions and implied
        // class opinions from layer3.
        let prim3Contents: ExpectedContents = {
            '.' : composedRefChildAttrs,
            'GrandChild' : {
                '.' : composedRefGrandChildAttrs,
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage3, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim3' : prim3Contents,
        })

        // Verify initial contents of stage3_A where /Prim3_A has the contents
        // of the referenced Prim3 prim composed with additional implied class
        // opinions from layer3_A.
        let prim3_AContents: ExpectedContents = {
            '.' : composed_A_ChildAttrs,
            'GrandChild' : {
                '.' : composed_A_GrandChildAttrs,
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage3_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim3_A' : prim3_AContents,
        })

        // Verify initial contents of stage4 where /Prim4 has the contents of
        // the referenced Instance4 prim composed with local opinions and implied
        // class opinions from layer4.
        let prim4Contents: ExpectedContents = {
            '.' : composedRefGrandChildAttrs,
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage4, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim4' : prim4Contents,
        })

        // Verify initial contents of stage4_A where /Prim4_A has the contents
        // of the referenced Prim4 prim composed with additional implied class
        // opinions from layer4_A.
        let prim4_AContents: ExpectedContents = {
            '.' : composed_A_GrandChildAttrs,
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage4_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim4_A' : prim4_AContents,
        })

        // Verify initial contents of stage5 where /Prim2, /Prim3, and /Prim4
        // all have the same contents as they do in the individual stage2,
        // stage3, and stage4.
        base.verifyStageContents(stage5, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2' : prim2Contents,
            'Prim3' : prim3Contents,
            'Prim4' : prim4Contents,
        })

        // Verify initial contents of stage5_A where /Prim2_A, /Prim3_A, and
        // /Prim4_A all have the same contents as they do in the individual
        // stage2_A, stage3_A, and stage4_A.
        base.verifyStageContents(stage5_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2_A' : prim2_AContents,
            'Prim3_A' : prim3_AContents,
            'Prim4_A' : prim4_AContents,
        })


        // Edit: Rename /Class/Child to /Class/RenamedChild
        base.applyEdits(editor, "Move /Class/Child -> /Class/RenamedChild", () => {
            expect(editor.movePrimAtPath('/Class/Child', 
                                                '/Class/RenamedChild')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The inherit fields to
        // /Class/Child and its descendant /Class/Child/GrandChild have been
        // updated to use the renamed paths.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Instance2' : {
                [classArcType]: ['/Class']
            },
            '/Instance3' : {
                [classArcType]: ['/Class/RenamedChild']
            },
            '/Instance4' : {
                [classArcType]: ['/Class/RenamedChild/GrandChild']
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1, the class contents are updated with Child renamed to
        // RenamedChild. Only the contents of /Instance2 changed since we renamed
        // a descendant of the inherited prim. The contents of the other
        // instances remain the same as their inherits were just updated to point
        // to the new path.
        instance2Contents = {
            '.' : instanceAttrs,
            'RenamedChild' : {
                '.' : instanceChildAttrs,
                'GrandChild' : {
                    '.' : instanceGrandChildAttrs
                },
            },
            'InstanceLocalChild' : {},
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
                'RenamedChild' : {
                    '.' : ['childAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr']
                    }           
                }
            },
            'Instance2' : instance2Contents,
            'Instance3' : instance3Contents,
            'Instance4' : instance4Contents
        })
        base.verifyStageResyncNotices(stage1, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Instance2/Child" : PrimResyncType.RenameSource,
            "/Instance2/RenamedChild" : PrimResyncType.RenameDestination,
            "/Instance3": PrimResyncType.UnchangedPrimStack,
            "/Instance4": PrimResyncType.UnchangedPrimStack
        })

        // On stage2 the implied class specs on layer2 are also updated with the
        // rename of Child to RenamedChild. This results in Prim2's contents
        // having changed to fully reflect the renaming of Child to RenamedChild
        // that still composes all the same specs (and therefore properties) as
        // before the rename.
        prim2Contents = {
            '.' : composedRefAttrs,
            'RenamedChild' : {
                '.' : composedRefChildAttrs,
                'GrandChild' : {
                    '.' : composedRefGrandChildAttrs,
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2' : prim2Contents,
        })
        base.verifyStageResyncNotices(stage2, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim2/Child" : PrimResyncType.RenameSource,
            "/Prim2/RenamedChild" : PrimResyncType.RenameDestination,
        })

        // On stage2_A the implied class specs on layer2_A are also updated with
        // the rename of Child to RenamedChild. This results in Prim2_A's
        // contents having changed to fully reflect the renaming of Child to
        // RenamedChild for all specs that originally contributed to Child (which
        // includes implied classes from layer2 and layer2_A).
        prim2_AContents = {
            '.' : composed_A_RefAttrs,
            'RenamedChild' : {
                '.' : composed_A_ChildAttrs,
                'GrandChild' : {
                    '.' : composed_A_GrandChildAttrs,
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2_A' : prim2_AContents,
        })
        base.verifyStageResyncNotices(stage2_A, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim2_A/Child" : PrimResyncType.RenameSource,
            "/Prim2_A/RenamedChild" : PrimResyncType.RenameDestination,
        })

        // On stage3 the implied class specs on layer3 are also updated with the
        // rename of Child to RenamedChild. However, Prim3's contents have NOT
        // changed as the inherits (direct and implied) now all refer to
        // /Class/RenamedChild instead of /Class/Child.
        //
        // Similarly on stage3_A, the further implied class specs are updated
        // with the rename, but Prim3_A's contents have not changed for the same
        // reason.
        base.verifyStageContents(stage3, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim3' : prim3Contents,
        })
        base.verifyStageResyncNotices(stage3, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim3" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage3_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim3_A' : prim3_AContents,
        })
        base.verifyStageResyncNotices(stage3_A, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim3_A" : PrimResyncType.UnchangedPrimStack,
        })

        // On stage4, the implied class specs on layer4 are updated so that
        // /Class/Child/GrandChild now resides at /Class/RenamedChild/GrandChild.
        // Yes, this case splits the /Class/Child spec as only GrandChild needs
        // to be moved to RenamedChild/GrandChild; the rest of the contents of
        // /Class/Child are not part of the implied inherit so it doesn't make
        // sense to move them. Prim4's contents have NOT changed as the inherits
        // (direct and implied) now all refer to /Class/RenamedChild/GrandChild.
        //
        // Similarly on stage4_A, the further implied class specs on layer4_A are
        // updated in the same way, but Prim4_A's contents have not changed for
        // the same reason.
        base.verifyStageContents(stage4, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                },
                'RenamedChild' : {
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage4, {
            // We have a source without a target because the target path, 
            // /Class/RenamedChild/GrandChild, is subsumed by the resync required
            // for its parent newly coming into existence.
            "/Class/Child/GrandChild" : PrimResyncType.ReparentSource,
            "/Class/RenamedChild" : PrimResyncType.Other,
            "/Prim4" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage4_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                },
                'RenamedChild' : {
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage4_A, {
            // We have a source without a target because the target path, 
            // /Class/RenamedChild/GrandChild, is subsumed by the resync required
            // for its parent newly coming into existence.
            "/Class/Child/GrandChild" : PrimResyncType.ReparentSource,
            "/Class/RenamedChild" : PrimResyncType.Other,
            "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        })

        // On stage5, the combined stage, the implied class specs on layer5 are
        // updated exactly the same way as they were for stages 2 and 3 as both
        // /Prim2 and /Prim3 required us to move /Class/Child to
        // /Class/RenamedChild. /Prim4 only required /Class/Child/GrandChild to
        // be moved to /Class/RenamedChild/GrandChild so that move was subsumed
        // by the ancestral move of /Class/Child to /Class/RenamedChild and is
        // why the implied class here contrasts with the resulting implied class
        // on stage4.
        //
        // Each prim's contents on stage5 are the same as their equivalent prims
        // on the other "single prim" stages.
        //
        // Similarly on stage5_A, the further implied class specs on layer5_A are
        // updated in the same way, and the prim contents are the same as the
        // "single prim" _A stages.
        base.verifyStageContents(stage5, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2' : prim2Contents,
            'Prim3' : prim3Contents,
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage5, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim2/Child" : PrimResyncType.RenameSource,
            "/Prim2/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim3" : PrimResyncType.UnchangedPrimStack,
            "/Prim4" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage5_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                }    
            },
            'Prim2_A' : prim2_AContents,
            'Prim3_A' : prim3_AContents,
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage5_A, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim2_A/Child" : PrimResyncType.RenameSource,
            "/Prim2_A/RenamedChild" : PrimResyncType.RenameDestination,
            "/Prim3_A" : PrimResyncType.UnchangedPrimStack,
            "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        })

        // Edit: Reparent and rename /Class/RenamedChild to /MovedChild
        base.applyEdits(editor, "Move /Class/RenamedChild -> /MovedChild", () => {
            expect(editor.movePrimAtPath('/Class/RenamedChild', '/MovedChild')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The class arc fields
        // to /Class/RenamedChild and its descendant
        // /Class/RenamedChild/GrandChild have been updated to use the moved
        // paths.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Instance2' : {
                [classArcType]: ['/Class']
            },
            '/Instance3' : {
                [classArcType]: ['/MovedChild']
            },
            '/Instance4' : {
                [classArcType]: ['/MovedChild/GrandChild']
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1 the class contents are updated with /MovedChild being a root
        // prim outside of /Class. Only the contents of /Instance2 changed again
        // since we moved a namespace descendant of the class out of the class.
        // This is effectively a delete of RenamedChild from Instance2 as it no
        // longer ancestrally inherits or specializes it at its new path. The
        // contents of the other instances remain the same as their class arcs
        // were just updated to point to the new path.
        instance2Contents = {
            '.' : instanceAttrs,
            'InstanceLocalChild' : {},
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
            },
            'MovedChild' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }           
            },
            'Instance2' : instance2Contents,
            'Instance3' : instance3Contents,
            'Instance4' : instance4Contents
        })
        base.verifyStageResyncNotices(stage1, {
            "/Class/RenamedChild" : PrimResyncType.RenameAndReparentSource,
            "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
            "/Instance2/RenamedChild" : PrimResyncType.Delete,
            "/Instance3": PrimResyncType.UnchangedPrimStack,
            "/Instance4": PrimResyncType.UnchangedPrimStack
        })

        // On stage2 the implied class is also updated for the move which
        // manifests as a deletion of the specs for /Class/RenamedChild on
        // layer2. The specs are deleted instead of moved to /MovedChild because
        // the class arc to /Class doesn't propagate /MovedChild as an ancestral
        // implied class arc like it did with /Class/RenamedChild. Prim2's
        // contents have changed to reflect the effective deletion of RenamedChild.
        //
        // Similarly on stage2_A, the further implied class specs on layer2_A are
        // updated in the same way (i.e. deleted), and Prim2_A's contents have
        // changed to also reflect the full deletion of RenamedChild.
        prim2Contents = {
            '.' : composedRefAttrs,
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'Prim2' : prim2Contents,
        })
        base.verifyStageResyncNotices(stage2, {
            "/Class/RenamedChild" : PrimResyncType.Delete,
            "/Prim2/RenamedChild" : PrimResyncType.Delete,
        })

        prim2_AContents = {
            '.' : composed_A_RefAttrs,
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'Prim2_A' : prim2_AContents,
        })
        base.verifyStageResyncNotices(stage2_A, {
            "/Class/RenamedChild" : PrimResyncType.Delete,
            "/Prim2_A/RenamedChild" : PrimResyncType.Delete,
        })

        // On stage3 the implied class specs on layer3 are updated with the
        // reparent/rename of /Child/Renamed to /MovedChild. However, Prim3's
        // contents have NOT changed as the class arcs (direct and implied) now
        // all refer to /MovedChild instead of /Class/RenamedChild.
        //
        // Similarly on stage3_A, the further implied class specs are updated
        // with the move, but Prim3_A's contents have not changed for the same
        // reason.
        base.verifyStageContents(stage3, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'MovedChild' : {
                '.' : ['impliedChildAttr'],
                'GrandChild' : {
                    '.' : ['impliedGrandChildAttr']
                }
            },
            'Prim3' : prim3Contents,
        })
        base.verifyStageResyncNotices(stage3, {
            "/Class/RenamedChild" : PrimResyncType.RenameAndReparentSource,
            "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
            "/Prim3" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage3_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'MovedChild' : {
                '.' : ['A_impliedChildAttr'],
                'GrandChild' : {
                    '.' : ['A_impliedGrandChildAttr']
                }
            },
            'Prim3_A' : prim3_AContents,
        })
        base.verifyStageResyncNotices(stage3_A, {
            "/Class/RenamedChild" : PrimResyncType.RenameAndReparentSource,
            "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
            "/Prim3_A" : PrimResyncType.UnchangedPrimStack,
        })

        // On stage4 the implied class specs on layer4 are updated so that
        // /Class/RenamedChild/GrandChild now resides at /MovedChild/GrandChild.
        // In constrast with the prior edit's effect on stage4 the RenamedChild
        // spec does NOT stick around even though only RenamedChild/GrandChild
        // needed to be moved. This is because the remaining RenamedChild
        // would've been just an empty over, and we remove those when specs are
        // moved. The specs for /Class/Child still remain as they did after the
        // previous edit.
        //
        // However, Prim4's contents have NOT changed as the class arcs (direct
        // and implied) now all refer to /MovedChild/GrandChild instead of
        // /Class/RenamedChild/GrandChild.
        //
        // Similarly on stage4_A, the further implied class specs are updated
        // with the move in the same way, but Prim4_A's contents have also not
        // changed for the same reason.
        base.verifyStageContents(stage4, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                },
            },
            'MovedChild' : {
                'GrandChild' : {
                    '.' : ['impliedGrandChildAttr']
                }
            },
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage4, {
            // Note that the real edit is a reparent of 
            // /Class/RenamedChild/GrandChild to /MovedChild/GrandChild, specs
            // are deleted and added for the parent paths /Class/RenamedChild
            // /MovedChild that cause them to be removed and introduced on the
            // stage. These resyncs of the parents subsume the namespace edit
            // notifications.
            "/Class/RenamedChild" : PrimResyncType.Delete,
            "/MovedChild" : PrimResyncType.Other,
            "/Prim4" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage4_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                },
            },
            'MovedChild' : {
                'GrandChild' : {
                    '.' : ['A_impliedGrandChildAttr']
                }
            },
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage4_A, {
            // Note that the real edit is a reparent of 
            // /Class/RenamedChild/GrandChild to /MovedChild/GrandChild, specs
            // are deleted and added for the parent paths /Class/RenamedChild
            // /MovedChild that cause them to be removed and introduced on the
            // stage. These resyncs of the parents subsume the namespace edit
            // notifications.
            "/Class/RenamedChild" : PrimResyncType.Delete,
            "/MovedChild" : PrimResyncType.Other,
            "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        })

        // On stage5, the combined stage, the implied class specs on layer5 are
        // updated exactly the same way as they were on layer3 for stage3 as
        // that encompasses all the edit requirements for all three prims'
        // dependencies:
        // - Prim2 just requires that /Class no longer has RenamedChild as
        //   namespace child.
        // - Prim3 requires that /Class/RenamedChild be moved to /MovedChild
        // - Prim4 just requires /Class/RenamedChild/GrandChild be moved to
        //   /MovedChild/GrandChild
        // Moving /Class/RenamedChild to /MovedChild satisfies all three.
        //
        // Each prim's contents on stage5 are the same as their equivalent prims
        // on the other "single prim" stages.
        //
        // Similarly on stage5_A, the further implied class specs on layer5_A are
        // updated in the same way, and the prim contents are the same as the
        // "single prim" _A stages.
        base.verifyStageContents(stage5, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'MovedChild' : {
                '.' : ['impliedChildAttr'],
                'GrandChild' : {
                    '.' : ['impliedGrandChildAttr']
                }
            },
            'Prim2' : prim2Contents,
            'Prim3' : prim3Contents,
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage5, {
            "/Class/RenamedChild" : PrimResyncType.RenameAndReparentSource,
            "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
            "/Prim2/RenamedChild" : PrimResyncType.Delete,
            "/Prim3" : PrimResyncType.UnchangedPrimStack,
            "/Prim4" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage5_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'MovedChild' : {
                '.' : ['A_impliedChildAttr'],
                'GrandChild' : {
                    '.' : ['A_impliedGrandChildAttr']
                }
            },
            'Prim2_A' : prim2_AContents,
            'Prim3_A' : prim3_AContents,
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage5_A, {
            "/Class/RenamedChild" : PrimResyncType.RenameAndReparentSource,
            "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
            "/Prim2_A/RenamedChild" : PrimResyncType.Delete,
            "/Prim3_A" : PrimResyncType.UnchangedPrimStack,
            "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        })

        // Edit: Reparent and Rename /MovedChild back to its original path
        // /Class/Child
        base.applyEdits(editor, "Move /MovedChild -> /Class/Child", () => {
            expect(editor.movePrimAtPath('/MovedChild', '/Class/Child')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The inherit fields to
        // /MovedChild and its descendant /MovedChild/GrandChild have been
        // updated to use the moved paths which are now the original paths again.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Instance2' : {
                [classArcType]: ['/Class']
            },
            '/Instance3' : {
                [classArcType]: ['/Class/Child']
            },
            '/Instance4' : {
                [classArcType]: ['/Class/Child/GrandChild']
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1 the class itself is returned to its original contents from
        // the direct edit.
        //
        // For Instance2, it is returned to its original
        // contents with the one notable exception: the overs on Child and
        // GrandChild that originally introduced instanceLocalChildAttr and
        // instanceLocalGrandChildAttr are NOT restored from being deleted when
        // RenamedChild was moved out from being a descendant of the inherited
        // class. We never restore deleted specs.
        //
        // The contents of the other instances continue to remain the same as
        // their class arcs have just updated to point to the original path again.
        instance2Contents = {
            '.' : instanceAttrs,
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }           
            },
            'InstanceLocalChild' : {},
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
                'Child' : {
                    '.' : ['childAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr']
                    }           
                },
            },
            'Instance2' : instance2Contents,
            'Instance3' : instance3Contents,
            'Instance4' : instance4Contents
        })
        base.verifyStageResyncNotices(stage1, {
            "/MovedChild" : PrimResyncType.RenameAndReparentSource,
            "/Class/Child" : PrimResyncType.RenameAndReparentDestination,
            "/Instance2/Child" : PrimResyncType.Other,
            "/Instance3": PrimResyncType.UnchangedPrimStack,
            "/Instance4": PrimResyncType.UnchangedPrimStack
        })

        // On stage2 the implied class specs are NOT updated as the deleted specs
        // for RenamedChild on layer2 from the prior move are not restored.
        //
        // Prim2's contents return to the original contents with the notable
        // exceptions that instanceLocalChildAttr, instanceLocalGrandChildAttr,
        // impliedChildAttr, and impliedGrandChildAttr are all missing as the
        // specs that introduced them were all deleted by the prior move and
        // cannot be restored.
        //
        // Similarly on stage2_A, the further implied class specs on layer2_A
        // cannot be restored from deletion, and Prim2_A's contents only been
        // partially restored in the same manner.
        prim2Contents = {
            '.' : composedRefAttrs,
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr'],
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'Prim2' : prim2Contents,
        })
        base.verifyStageResyncNotices(stage2, {
            "/Prim2/Child" : PrimResyncType.Other,
        })

        prim2_AContents = {
            '.' : composed_A_RefAttrs,
            'Child' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr'],
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'Prim2_A' : prim2_AContents,
        })
        base.verifyStageResyncNotices(stage2_A, {
            "/Prim2_A/Child" : PrimResyncType.Other,
        })

        // On stage3 the implied class specs on layer3 are updated with the
        // reparent/rename that returns stage3 to its original contents. Prim3's
        // contents have NOT changed (as has been the case through all prior
        // edits) as the class arcs (direct and implied) now all refer to
        // /Class/Child.
        //
        // Similarly on stage3_A, the further implied class specs are updated
        // with the move, but Prim3_A's contents have not changed for the same
        // reason.
        base.verifyStageContents(stage3, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                },
            },
            'Prim3' : prim3Contents,
        })
        base.verifyStageResyncNotices(stage3, {
            "/MovedChild" : PrimResyncType.RenameAndReparentSource,
            "/Class/Child" : PrimResyncType.RenameAndReparentDestination,
            "/Prim3" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage3_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                },
            },
            'Prim3_A' : prim3_AContents,
        })
        base.verifyStageResyncNotices(stage3_A, {
            "/MovedChild" : PrimResyncType.RenameAndReparentSource,
            "/Class/Child" : PrimResyncType.RenameAndReparentDestination,
            "/Prim3_A" : PrimResyncType.UnchangedPrimStack,
        })

        // On stage4 the implied class specs on layer4 are updated with the
        // reparent/rename that returns stage4 to its original contents. Prim4's
        // contents have NOT changed (as has been the case through all prior
        // edits) as the class arcs (direct and implied) now all refer to
        // /Class/Child/GrandChild.
        //
        // Similarly on stage4_A, the further implied class specs are updated
        // with the move, but Prim4_A's contents have not changed for the same
        // reason.
        base.verifyStageContents(stage4, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                },
            },
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage4, {
            // XXX: Add comment about /MovedChild resync as parent of GrandChild
            // move source
            "/MovedChild" : PrimResyncType.Delete,
            "/Class/Child/GrandChild" : PrimResyncType.ReparentDestination,
            "/Prim4" : PrimResyncType.UnchangedPrimStack,
        })

        base.verifyStageContents(stage4_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                },
            },
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage4_A, {
            // XXX: Add comment same as above
            "/MovedChild" : PrimResyncType.Delete,
            "/Class/Child/GrandChild" : PrimResyncType.ReparentDestination,
            "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        })

        // On stage5, the combined stage, the implied class specs on layer5 are
        // updated exactly the same way as they were on layer3 for stage3 as
        // that encompasses all the edit requirements for all three prims'
        // dependencies and therefore restores stage5 to its original implied
        // class contents.
        //
        // Each prim's contents on stage5 are the same as their equivalent prims
        // on the other "single prim" stages EXCEPT for Prim2 which has had its
        // implied attributes restored because the dependency from Prim3 and
        // Prim4 restore the implied class structure. This is a different
        // behavior than had occurred on Prim2 on stage2 which doesn't have the
        // addtional dependencies from the other two prims to maintain and
        // restore the implied class specs originally contributing to
        // /Prim2/Child and /Prim2/Child/GrandChild. Note, however, that not
        // all specs contributing to /Prim2/Child and /Prim2/Child/GrandChild
        // were restore to the original state from this stage as the local specs
        // for descendants in the both the referenced layer and the referencing
        // layer were deleted by the prior edit and cannot be restored.
        //
        // Similarly on stage5_A, the further implied class specs on layer5_A are
        // updated in the same way, and the prim contents are the same as the
        // "single prim" _A stages with the same called out exception of
        // /Prim2_A.
        prim2Contents = {
            '.' : composedRefAttrs,
            'Child' : {
                '.' : ['childAttr', 'impliedChildAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr', 'impliedGrandChildAttr']
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage5, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }
                },
            },
            'Prim2' : prim2Contents,
            'Prim3' : prim3Contents,
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage5, {
            "/MovedChild" : PrimResyncType.RenameAndReparentSource,
            "/Class/Child" : PrimResyncType.RenameAndReparentDestination,
            "/Prim2/Child" : PrimResyncType.Other,
            "/Prim3" : PrimResyncType.UnchangedPrimStack,
            "/Prim4" : PrimResyncType.UnchangedPrimStack,
        })

        prim2_AContents = {
            '.' : composed_A_RefAttrs,
            'Child' : {
                '.' : ['childAttr', 'impliedChildAttr', 'A_impliedChildAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr', 'impliedGrandChildAttr', 
                           'A_impliedGrandChildAttr']
                },
            },
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage5_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['A_impliedGrandChildAttr']
                    }
                },
            },
            'Prim2_A' : prim2_AContents,
            'Prim3_A' : prim3_AContents,
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage5_A, {
            "/MovedChild" : PrimResyncType.RenameAndReparentSource,
            "/Class/Child" : PrimResyncType.RenameAndReparentDestination,
            "/Prim2_A/Child" : PrimResyncType.Other,
            "/Prim3_A" : PrimResyncType.UnchangedPrimStack,
            "/Prim4_A" : PrimResyncType.UnchangedPrimStack,
        })

        // Edit: Delete /Class/Child
        base.applyEdits(editor, "Delete /Class/Child", () => {
            expect(editor.deletePrimAtPath('/Class/Child')).toBe(true)
        })

        // Verify the updated composition fields in layer1. All the class
        // fields that refer to /Ref/Child or its descendants have had those
        // class arc removed. Note the composition fields remain but the values
        // are empty.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Instance2' : {
                [classArcType]: ['/Class']
            },
            '/Instance3' : {
                [classArcType]: []
            },
            '/Instance4' : {
                [classArcType]: []
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // Verify the updated stage contents for stage1.
        //
        // For Instance2 which directly inherits /Class, since Child has been
        // deleted from /Class, it is no longer a child of the class instancing
        // prim. Note that the overs to Child (which brought in the
        // attributes instanceLocalChildAttr and
        // GrandChild.instanceLocalGrandChildAttr) have been deleted which is why
        // we don't end up with a reintroduction of a partially specced Child.
        //
        // Unlike all the prior edits in this test case, the contents of
        // Instance3 and Instance4 DO change because the class arcs have been
        // deleted and can no longer compose contents from across them.
        // Addtionally any child specs in the instancign prims that would've
        // contributed to the prim stacks of the now deleted referenced prim
        // children are also deleted to "truly delete" all prims from the deleted
        // class arc.
        //
        // XXX: There is an open question as to whether this is the correct
        // behavior or if we should go a step further and delete the specs that
        // introduced the now class prims (instead of just removing the class
        // arcs but not the instancing prim itself like we do now). This expanded
        // approach would result in the Instance3 and Instance4 prims being
        // completely deleted from the stage.
        instance2Contents = {
            '.' : instanceAttrs,
            'InstanceLocalChild' : {},
        }

        instance3Contents =  {
            '.' : ['instanceLocalChildAttr'],
            'InstanceLocalChild' : {},
        }

        instance4Contents = {
            '.' : ['instanceLocalGrandChildAttr'],
            'InstanceLocalChild' : {},
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
            },
            'Instance2' : instance2Contents,
            'Instance3' : instance3Contents,
            'Instance4' : instance4Contents
        })
        base.verifyStageResyncNotices(stage1, {
            "/Class/Child" : PrimResyncType.Delete,
            "/Instance2/Child" : PrimResyncType.Delete,
            "/Instance3": PrimResyncType.Other,
            "/Instance4": PrimResyncType.Other
        })

        // On stage2 Prim2's contents have changed to reflect the deletion of
        // Child, but no changes were needed to be made to the implied class
        // specs on layer2 because /Class/Child already didn't exist on this
        // layer after the prior edits.
        //
        // Similarly on stage2_A, Prim2_A's contents have changed to also reflect
        // the full deletion of Child but no implied class specs existed already
        // due to the same prior edits.
        prim2Contents = {
            '.' : composedRefAttrs,
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'Prim2' : prim2Contents,
        })
        base.verifyStageResyncNotices(stage2, {
            "/Prim2/Child" : PrimResyncType.Delete,
        })

        prim2_AContents = {
            '.' : composed_A_RefAttrs,
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage2_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'Prim2_A' : prim2_AContents,
        })
        base.verifyStageResyncNotices(stage2_A, {
            "/Prim2_A/Child" : PrimResyncType.Delete,
        })

        // On stage3 the implied class is also updated to delete the specs for
        // /Class/Child on layer3. This is not strictly necessary as the deletion
        // caused the Instance4's class arc to /Class/Child to be deleted which
        // automatically severs the implied clas arc for Prim3. But it makes
        // sense to delete the implied class specs as they are intended to be
        // overrides to the direct class specs that have been deleted.
        //
        // Prim3's contents have changed to reflect that there are no composition
        // opinions from class instancing /Class/Child. This includes the
        // deletion of any local opinions for GrandChild that would otherwise
        // have reintroduced GrandChild without its class opinions.
        //
        // Similarly on stage3_A, the further implied class specs on layer3_A are
        // updated in the same way (i.e. deleted), and Prim3_A's contents have
        // changed to also reflect the deletion of its classe opinions.
        prim3Contents = {
            '.' : ['instanceLocalChildAttr', 'overRefChildAttr'],
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage3, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'Prim3' : prim3Contents,
        })
        base.verifyStageResyncNotices(stage3, {
            "/Class/Child" : PrimResyncType.Delete,
            "/Prim3" : PrimResyncType.Other,
        })

        prim3_AContents = {
            '.' : ['instanceLocalChildAttr', 'overRefChildAttr'],
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage3_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'Prim3_A' : prim3_AContents,
        })
        base.verifyStageResyncNotices(stage3_A, {
            "/Class/Child" : PrimResyncType.Delete,
            "/Prim3_A" : PrimResyncType.Other,
        })

        // On stage4 the implied class is also updated to delete the specs for
        // /Class/Child/GrandChild on layer4 but this does NOT delete
        // /Class/Child itself since Prim4's implied class arc is only to
        // /Class/Child/GrandChild. Like with stage3, it is not strictly
        // necessary to delete the specs as the class arc was severed, but we do
        // it for the same reason.
        //
        // Prim4's contents have changed to reflect that there are no composition
        // opinions from a class arc to /Class/Child/GrandChild.
        //
        // Similarly on stage4_A, the further implied class specs on layer4_A are
        // updated in the same way (i.e. deleted), and Prim4_A's contents have
        // changed to also reflect the deletion of its class opinions.
        prim4Contents = {
            '.' : ['instanceLocalGrandChildAttr', 'overRefGrandChildAttr'],
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage4, {
            'Class' : {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                },
            },
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage4, {
            "/Class/Child/GrandChild" : PrimResyncType.Delete,
            "/Prim4" : PrimResyncType.Other,
        })

        prim4_AContents = {
            '.' : ['instanceLocalGrandChildAttr', 'overRefGrandChildAttr'],
            'InstanceLocalChild' : {},
            'LocalChild' : {},
        }

        base.verifyStageContents(stage4_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
                'Child' : {
                    '.' : ['A_impliedChildAttr'],
                },
            },
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage4_A, {
            "/Class/Child/GrandChild" : PrimResyncType.Delete,
            "/Prim4_A" : PrimResyncType.Other,
        })

        // On stage5, the combined stage, the implied class specs on layer5 are
        // updated to delete /Class/Child which is strictly necessary for Prim2
        // and harmless but appropriate for Prim3 and Prim4
        //
        // Each prim's contents on stage5 are the same as their equivalent prims
        // on the other "single prim" stages.
        //
        // Similarly on stage5_A, the further implied class specs on layer5_A are
        // updated in the same way, and the prim contents are the same as the
        // "single prim" _A stages.
        base.verifyStageContents(stage5, {
            'Class' : {
                '.' : ['impliedClassAttr'],
            },
            'Prim2' : prim2Contents,
            'Prim3' : prim3Contents,
            'Prim4' : prim4Contents,
        })
        base.verifyStageResyncNotices(stage5, {
            "/Class/Child" : PrimResyncType.Delete,
            "/Prim2/Child" : PrimResyncType.Delete,
            "/Prim3" : PrimResyncType.Other,
            "/Prim4" : PrimResyncType.Other,
        })

        base.verifyStageContents(stage5_A, {
            'Class' : {
                '.' : ['A_impliedClassAttr'],
            },
            'Prim2_A' : prim2_AContents,
            'Prim3_A' : prim3_AContents,
            'Prim4_A' : prim4_AContents,
        })
        base.verifyStageResyncNotices(stage5_A, {
            "/Class/Child" : PrimResyncType.Delete,
            "/Prim2_A/Child" : PrimResyncType.Delete,
            "/Prim3_A" : PrimResyncType.Other,
            "/Prim4_A" : PrimResyncType.Other,
        })
    }

    it('test_BasicDependentGlobalInherits', async () => {
        // Test downstream dependency namespace edits across global inherits and
        // their implied class specs.
        await runTestBasicDependentGlobalClassArcs("inherits")
    })

    it('test_BasicDependentGlobalSpecializes', async () => {
        // Test downstream dependency namespace edits across global specializes
        // and their implied class specs.
        await runTestBasicDependentGlobalClassArcs("specializes")
    })

    async function runTestBasicDependentLocalClassArcs(classArcType: string): Promise<void> {
        // Helper for testing downstream dependency namespace edits across local
        // classes and their implied class specs.

        // "Local inherits" (or "local specializes" in the case of specializes
        // arcs) refer to the situation where a prim is referenced and the
        // referenced prim, or any of its namespace descendants, has an inherits
        // to a class that is also a namespace child of the referenced prim. This
        // is opposed to "global inherits" where the inherited prim is outside
        // the namespace of the prim being referenced. There are two key
        // differences between global and local inherits:
        //   1. The path of any implied inherit specs are mapped across the
        //      reference for local inherits. For global inherits, the paths of
        //      implied inherits are always identity mapped, i.e. they will used
        //      the same path in the implied layer as they do in the referenced
        //      layer.
        //   2. For local inherits, the inherited class will exist as a composed
        //      prim that is a namespace descendant of the referencing prim
        //      because of normal ancestral references. For global inherits, the
        //      prim at the class path in the referencing layer will NOt be
        //      composed with the class spec in the referenced layer since there
        //      isn't an actual ancestral composition arc that does so at that
        //      path.
        // The effect of the latter on namespace editing is that local inherits
        // mean that the implied class specs have a reference dependency on the
        // origin class whereas for global inherits, the implied class specs have
        // no such dependency and have to be handled explicitly. While this is
        // all an implementation detail, it explains the purpose of this whole
        // test case which is to demonstrate that we correctly handle that local
        // inherits introduce both a reference and an implied inherits dependency
        // for the same downstream layer specs.

        // The base layer for editing.
        // Setup: This is the base layer that will be edited. The root prims
        // /Ref1, /Ref2, and /Ref3 will all be referenced in another layer. Each
        // defines the same "local class" with the hierarchy
        // LocalClass/Child/GrandChild. Then each defines a local instance with
        // the follow local inherits (or specializes):
        //   Ref1/Instance1 inherits /Ref1/LocalClass
        //   Ref2/Instance2 inherits /Ref2/LocalClass/Child
        //   Ref3/Instance3 inherits /Ref3/LocalClass/Child/GrandChild
        //
        const layer1 = Layer.createAnonymous("layer1.usda")
        layer1.importFromString(`#usda 1.0

            def "Ref1" {
                def "LocalClass" {
                    int classAttr
                    
                    def "Child" {
                        int childAttr
                
                        def "GrandChild" {
                            int grandChildAttr
                        }
                    }
                }

                def "Instance1" (
                    ${classArcType} = <../LocalClass>
                ) {
                }
            }

            def "Ref2" {
                def "LocalClass" {
                    int classAttr
                    
                    def "Child" {
                        int childAttr
                
                        def "GrandChild" {
                            int grandChildAttr
                        }
                    }
                }

                def "Instance2" (
                    ${classArcType} = <../LocalClass/Child>
                ) {
                }
            }

            def "Ref3" {
                def "LocalClass" {
                    int classAttr
                    
                    def "Child" {
                        int childAttr
                
                        def "GrandChild" {
                            int grandChildAttr
                        }
                    }
                }

                def "Instance3" (
                    ${classArcType} = <../LocalClass/Child/GrandChild>
                ) {
                }
            }           
        `)

        // Layer2 has a three prims that each reference /Ref1, /Ref2, and /Ref3
        // respectively from layer1. Each prim has overs for the implied local
        // class.
        const layer2 = Layer.createAnonymous("layer2.usda")
        layer2.importFromString(`#usda 1.0
            def "Prim1" (
                references = @${layer1.identifier}@</Ref1>
            ) {
                over "LocalClass" {
                    int impliedClassAttr
                    
                    over "Child" {
                        int impliedChildAttr
                
                        over "GrandChild" {
                            int impliedGrandChildAttr
                        }
                    }    
                }
            }

            def "Prim2" (
                references = @${layer1.identifier}@</Ref2>
            ) {
                over "LocalClass" {
                    int impliedClassAttr
                    
                    over "Child" {
                        int impliedChildAttr
                
                        over "GrandChild" {
                            int impliedGrandChildAttr
                        }
                    }    
                }
            }

            def "Prim3" (
                references = @${layer1.identifier}@</Ref3>
            ) {
                over "LocalClass" {
                    int impliedClassAttr
                    
                    over "Child" {
                        int impliedChildAttr
                
                        over "GrandChild" {
                            int impliedGrandChildAttr
                        }
                    }    
                }
            }
        `)

        // Open stages for both layers.
        const stage1 = await openLayer(layer1)
        const stage2 = await openLayer(layer2)

        // Create an editor for stage1 so we can edit the base local classes.
        const editor = new NamespaceEditor(stage1)

        // Add stage2 as a dependent stage.
        editor.addDependentStage(stage2)

        // Verify the initial composition fields for layer1 which will change
        // as we perform edits.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Ref1/Instance1' : {
                [classArcType]: ['/Ref1/LocalClass']
            },
            '/Ref2/Instance2' : {
                [classArcType]: ['/Ref2/LocalClass/Child']
            },
            '/Ref3/Instance3' : {
                [classArcType]: ['/Ref3/LocalClass/Child/GrandChild']
            },
        })

        // Layer2 will not have any composition field changes for this test, but
        // for sanity's sake, we'll still verify this after every edit.
        const _VerifyUnchangedLayerCompositionFields = () => {
            expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
                '/Prim1' : {
                    'references' : [new Reference(layer1.identifier, '/Ref1')]
                },
                '/Prim2' : {
                    'references' : [new Reference(layer1.identifier, '/Ref2')]
                },
                '/Prim3' : {
                    'references' : [new Reference(layer1.identifier, '/Ref3')]
                },
            })
        }
        _VerifyUnchangedLayerCompositionFields()

        // Verify the initial contents of stage1. Note, the instance contents
        // each match the appropriate class contents as there are no local specs
        // on the instances themselves for this particular test.
        const classGrandChildContents = {
            '.' : ['grandChildAttr'],
        }

        const classChildContents = {
            '.' : ['childAttr'],
            'GrandChild' : classGrandChildContents
        }

        let classContents: ExpectedContents = {
            '.' : ['classAttr'],
            'Child' : classChildContents
        }

        base.verifyStageContents(stage1, {
            'Ref1' : {
                'LocalClass' : classContents,
                'Instance1' : classContents,
            },
            'Ref2' : {
                'LocalClass' : classContents,
                'Instance2' : classChildContents,
            },
            'Ref3' : {
                'LocalClass' : classContents,
                'Instance3' : classGrandChildContents,
            },
        })

        // Verify the initial contents of stage2. Note, the instance contents
        // each match the appropriate composed implied class contents as there
        // are no local specs on the instances themselves for this particular
        // test.
        const composedImpliedClassGrandChildContents = {
            '.' : ['grandChildAttr', 'impliedGrandChildAttr'],
        }

        const composedImpliedClassChildContents = {
            '.' : ['childAttr', 'impliedChildAttr'],
            'GrandChild' : composedImpliedClassGrandChildContents
        }

        let composedImpliedClassContents: ExpectedContents = {
            '.' : ['classAttr', 'impliedClassAttr'],
            'Child' : composedImpliedClassChildContents
        }

        base.verifyStageContents(stage2, {
            'Prim1' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance1' : composedImpliedClassContents,
            },
            'Prim2' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance2' : composedImpliedClassChildContents,
            },
            'Prim3' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance3' : composedImpliedClassGrandChildContents,
            },
        })

        // Edit Rename LocalClass/Child to LocalClass/RenamedChild under all
        // three referenced prims.
        base.applyEdits(editor, "Move /Ref1/LocalClass/Child -> /Ref1/LocalClass/RenamedChild", () => {
            expect(editor.movePrimAtPath(
                '/Ref1/LocalClass/Child', '/Ref1/LocalClass/RenamedChild')).toBe(true)
        })
        base.applyEdits(editor, "Move /Ref2/LocalClass/Child -> /Ref2/LocalClass/RenamedChild", () => {
            expect(editor.movePrimAtPath(
                '/Ref2/LocalClass/Child', '/Ref2/LocalClass/RenamedChild')).toBe(true)
        })
        base.applyEdits(editor, "Move /Ref3/LocalClass/Child -> /Ref3/LocalClass/RenamedChild", () => {
            expect(editor.movePrimAtPath(
                '/Ref3/LocalClass/Child', '/Ref3/LocalClass/RenamedChild')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The class arc fields
        // to /Ref2/LocalClass/Child and /Ref3/LocalClass/Child/GrandChild have
        // been updated to use the renamed paths.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Ref1/Instance1' : {
                [classArcType]: ['/Ref1/LocalClass']
            },
            '/Ref2/Instance2' : {
                [classArcType]: ['/Ref2/LocalClass/RenamedChild']
            },
            '/Ref3/Instance3' : {
                [classArcType]: ['/Ref3/LocalClass/RenamedChild/GrandChild']
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1, the local class contents of each Ref prim are updated with
        // Child renamed to RenamedChild. Only the contents of Instance1 changed
        // since the class contents have changed to reflect the rename. The
        // contents of the other instances remain the same as their inherits were
        // just updated to point to the new paths.
        classContents = {
            '.' : ['classAttr'],
            'RenamedChild' : classChildContents
        }

        base.verifyStageContents(stage1, {
            'Ref1' : {
                'LocalClass' : classContents,
                'Instance1' : classContents,
            },
            'Ref2' : {
                'LocalClass' : classContents,
                'Instance2' : classChildContents,
            },
            'Ref3' : {
                'LocalClass' : classContents,
                'Instance3' : classGrandChildContents,
            },
        })

        // On stage2 the implied local class specs under all three prims in
        // layer2 are also updated with the rename of Child to RenamedChild
        // because of ancestral reference dependency. However, only Prim1's
        // instance's contents have changed reflect the rename of its namespace
        // child.
        composedImpliedClassContents = {
            '.' : ['classAttr', 'impliedClassAttr'],
            'RenamedChild' : composedImpliedClassChildContents
        }

        base.verifyStageContents(stage2, {
            'Prim1' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance1' : composedImpliedClassContents,
            },
            'Prim2' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance2' : composedImpliedClassChildContents,
            },
            'Prim3' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance3' : composedImpliedClassGrandChildContents,
            },
        })

        // Edit: Move LocalClass/RenamedChild to MovedChild under all three
        // referenced prims.
        base.applyEdits(editor, "Move /Ref1/LocalClass/RenamedChild -> /Ref1/MovedChild", () => {
            expect(editor.movePrimAtPath(
                '/Ref1/LocalClass/RenamedChild', '/Ref1/MovedChild')).toBe(true)
        })
        base.applyEdits(editor, "Move /Ref2/LocalClass/RenamedChild -> /Ref2/MovedChild", () => {
            expect(editor.movePrimAtPath(
                '/Ref2/LocalClass/RenamedChild', '/Ref2/MovedChild')).toBe(true)
        })
        base.applyEdits(editor, "Move /Ref3/LocalClass/RenamedChild -> /Ref3/MovedChild", () => {
            expect(editor.movePrimAtPath(
                '/Ref3/LocalClass/RenamedChild', '/Ref3/MovedChild')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The class arc fields
        // to /Ref2/LocalClass/RenamedChild and
        // /Ref3/LocalClass/RenamedChild/GrandChild have been updated to use the
        // new local class paths.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Ref1/Instance1' : {
                [classArcType]: ['/Ref1/LocalClass']
            },
            '/Ref2/Instance2' : {
                [classArcType]: ['/Ref2/MovedChild']
            },
            '/Ref3/Instance3' : {
                [classArcType]: ['/Ref3/MovedChild/GrandChild']
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1, the LocalClass contents of each Ref prim no longer have a
        // RenamedChild prim. Each Ref prim has MovedChild a child prim with the
        // original contents of RenamedChild.
        //
        // Instance1's contents have changed as they match the new class
        // contents without RenamedChild. The contents of the other instances
        // remain the same as their class arcs were just updated to point to the
        // new paths.
        classContents = {
            '.' : ['classAttr'],
        }

        base.verifyStageContents(stage1, {
            'Ref1' : {
                'LocalClass' : classContents,
                'MovedChild' : classChildContents,
                'Instance1' : classContents,
            },
            'Ref2' : {
                'LocalClass' : classContents,
                'MovedChild' : classChildContents,
                'Instance2' : classChildContents,
            },
            'Ref3' : {
                'LocalClass' : classContents,
                'MovedChild' : classChildContents,
                'Instance3' : classGrandChildContents,
            },
        })

        // On stage2 the implied local class specs on all three prims in layer2
        // are also updated with the move of RenamedChild out of the class and
        // into a sibling prim MovedChild because of ancestral reference
        // dependencies.
        //
        // However, only Prim1's instance's contents have changed to match the
        // change to the new class contents without RenamedChild.
        composedImpliedClassContents = {
            '.' : ['classAttr', 'impliedClassAttr'],
        }

        base.verifyStageContents(stage2, {
            'Prim1' : {
                'LocalClass' : composedImpliedClassContents,
                'MovedChild' : composedImpliedClassChildContents,
                'Instance1' : composedImpliedClassContents,
            },
            'Prim2' : {
                'LocalClass' : composedImpliedClassContents,
                'MovedChild' : composedImpliedClassChildContents,
                'Instance2' : composedImpliedClassChildContents,
            },
            'Prim3' : {
                'LocalClass' : composedImpliedClassContents,
                'MovedChild' : composedImpliedClassChildContents,
                'Instance3' : composedImpliedClassGrandChildContents,
            },
        })

        // Edit: Move MovedChild back to LocalClass/Child (the original path)
        // under all three referenced prims.
        base.applyEdits(editor, "Move /Ref1/MovedChild -> /Ref1/LocalClass/Child", () => {
            expect(editor.movePrimAtPath(
                '/Ref1/MovedChild', '/Ref1/LocalClass/Child')).toBe(true)
        })
        base.applyEdits(editor, "Move /Ref2/MovedChild -> /Ref2/LocalClass/Child", () => {
            expect(editor.movePrimAtPath(
                '/Ref2/MovedChild', '/Ref2/LocalClass/Child')).toBe(true)
        })
        base.applyEdits(editor, "Move /Ref3/MovedChild -> /Ref3/LocalClass/Child", () => {
            expect(editor.movePrimAtPath(
                '/Ref3/MovedChild', '/Ref3/LocalClass/Child')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The class arc fields
        // to /Ref2/MovedChild and /Ref3/MovedChild/GrandChild have been updated
        // back to the original paths from the start of this test.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Ref1/Instance1' : {
                [classArcType]: ['/Ref1/LocalClass']
            },
            '/Ref2/Instance2' : {
                [classArcType]: ['/Ref2/LocalClass/Child']
            },
            '/Ref3/Instance3' : {
                [classArcType]: ['/Ref3/LocalClass/Child/GrandChild']
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1, the local class contents of each Ref prim are updated to
        // the have child contents back under the prim Child again like in the
        // original stage.
        //
        // All intance's contents are back to their original contents which is
        // only a change to Instance1 as the other 2 instances haven't changed
        // over any of the prior edits.
        classContents = {
            '.' : ['classAttr'],
            'Child' : classChildContents
        }

        base.verifyStageContents(stage1, {
            'Ref1' : {
                'LocalClass' : classContents,
                'Instance1' : classContents,
            },
            'Ref2' : {
                'LocalClass' : classContents,
                'Instance2' : classChildContents,
            },
            'Ref3' : {
                'LocalClass' : classContents,
                'Instance3' : classGrandChildContents,
            },
        })

        // On stage2 the implied local class specs on all three prims in layer2
        // are also updated to have child contents back under the prim Child
        // again like in the original stage because of ancestral reference
        // dependencies.
        //
        // All instance's contents are back to their original contents which is
        // only a change to Instance1 as the other two instances haven't changed
        // over any of the prior edits either.
        composedImpliedClassContents = {
            '.' : ['classAttr', 'impliedClassAttr'],
            'Child' : composedImpliedClassChildContents
        }

        base.verifyStageContents(stage2, {
            'Prim1' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance1' : composedImpliedClassContents,
            },
            'Prim2' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance2' : composedImpliedClassChildContents,
            },
            'Prim3' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance3' : composedImpliedClassGrandChildContents,
            },
        })

        // Edit: Delete LocalClass/Child under all three referenced prims.
        base.applyEdits(editor, "Delete /Ref1/LocalClass/Child", () => {
            expect(editor.deletePrimAtPath('/Ref1/LocalClass/Child')).toBe(true)
        })
        base.applyEdits(editor, "Delete /Ref2/LocalClass/Child", () => {
            expect(editor.deletePrimAtPath('/Ref2/LocalClass/Child')).toBe(true)
        })
        base.applyEdits(editor, "Delete /Ref3/LocalClass/Child", () => {
            expect(editor.deletePrimAtPath('/Ref3/LocalClass/Child')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The class arc fields
        // to /Ref2/LocalClass/Child and /Ref3/LocalClass/Child/GrandChild have
        // been set to empty.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Ref1/Instance1' : {
                [classArcType]: ['/Ref1/LocalClass']
            },
            '/Ref2/Instance2' : {
                [classArcType]: []
            },
            '/Ref3/Instance3' : {
                [classArcType]: []
            },
        })
        _VerifyUnchangedLayerCompositionFields()

        // On stage1, the local class contents of each Ref prim are updated to
        // have Child completely removed from the LocalClass.
        //
        // Instance1 now also matches the class contents with the Child deleted.
        // This time Instance2 and Instance3 have been updated to have no
        // contents as their class arcs were deleted.
        classContents = {
            '.' : ['classAttr'],
        }

        base.verifyStageContents(stage1, {
            'Ref1' : {
                'LocalClass' : classContents,
                'Instance1' : classContents,
            },
            'Ref2' : {
                'LocalClass' : classContents,
                'Instance2' : {},
            },
            'Ref3' : {
                'LocalClass' : classContents,
                'Instance3' : {},
            },
        })

        // On stage2 the implied local class specs on all three prims in layer2
        // are also updated to have Child completely deleted because of the
        // ancestral reference dependencies.
        //
        // Instance1 now also matches the composed class contents with the Child
        // deleted. But this time, Instance2 and Instance3 have been updated
        // to have no contents all their class arcs (direct and implied) were
        // deleted within the referenced prim.
        composedImpliedClassContents = {
            '.' : ['classAttr', 'impliedClassAttr'],
        }

        base.verifyStageContents(stage2, {
            'Prim1' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance1' : composedImpliedClassContents,
            },
            'Prim2' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance2' : {},
            },
            'Prim3' : {
                'LocalClass' : composedImpliedClassContents,
                'Instance3' : {},
            },
        })
    }

    it('test_BasicDependentLocalInherits', async () => {
        // Test downstream dependency namespace edits across local inherits and
        // their implied class specs.
        await runTestBasicDependentLocalClassArcs("inherits")
    })

    it('test_BasicDependentLocalSpecializes', async () => {
        // Test downstream dependency namespace edits across local specializes
        // and their implied class specs.
        await runTestBasicDependentLocalClassArcs("specializes")
    })

    async function runTestNestedClassClassArcs(classArcType: string): Promise<void> {
        // Helper for testing downstream dependency namespace edits across
        // class arcs and their implied classes when class arcs are nested inside
        // other class arcs.

        // Setup: Layer1 has the following
        // - Base class prim /Class that has a Child and GrandChild hierarchy.
        //   This will be where we perform the explicit namespace edits.
        // - /NestedClass which inherits /Class giving us global class hierarchy
        //   with opinions for Child and GrandChild.
        // - /Model which will be referenced by the second layer and contains:
        //    - LocalClass which inherits /NestedClass giving us a class
        //      hierarchy of one local class and two global classes.
        //    - Instance1 which inherits /Model/LocalClass
        //    - Instance2 which inherits /Model/LocalClass/Child
        //    - Instance3 which inherits /Model/LocalClass/Child/GrandChild
        //
        const layer1 = Layer.createAnonymous("layer1.usda")
        layer1.importFromString(`#usda 1.0
            def "Class" {
                int classAttr
                
                def "Child" {
                    int childAttr

                    def "GrandChild" {
                        int grandChildAttr
                    }
                }    
            }

            def "NestedClass" (
                ${classArcType} = </Class>
            ) {
                int nestedClassAttr
                
                def "Child" {
                    int nestedChildAttr

                    def "GrandChild" {
                        int nestedGrandChildAttr
                    }
                }    
            }

            def "Model" {
                def "LocalClass" (
                    ${classArcType} = </NestedClass>
                ) {
                    int localClassAttr
                    
                    def "Child" {
                        int localChildAttr
                
                        def "GrandChild" {
                            int localGrandChildAttr
                        }
                    }    
                }
                
                def "Instance1" (
                    ${classArcType} = </Model/LocalClass>
                ) {
                }
                
                def "Instance2" (
                    ${classArcType} = </Model/LocalClass/Child>
                ) {
                }
                
                def "Instance3" (
                    ${classArcType} = </Model/LocalClass/Child/GrandChild>
                ) {
                }
            }
        `)

        // Layer2 has a prim /Char that references /Model from layer1 and
        // provides opinions for all three implied inherit classes:
        // /Char/LocalClass (mapped from /Model/LocalClass), /NestedClass, and
        // /Class
        const layer2 = Layer.createAnonymous("layer2.usda")
        layer2.importFromString(`#usda 1.0
            def "Char" (
                references = @${layer1.identifier}@</Model>
            ) {
                over "LocalClass" {
                    int impliedLocalClassAttr
                    
                    over "Child" {
                        int impliedLocalChildAttr
                
                        over "GrandChild" {
                            int impliedLocalGrandChildAttr
                        }
                    }    
                }
            }

            over "Class" {
                int impliedClassAttr
                
                over "Child" {
                    int impliedChildAttr

                    over "GrandChild" {
                        int impliedGrandChildAttr
                    }
                }    
            }

            over "NestedClass" {
                int impliedNestedClassAttr
                
                over "Child" {
                    int impliedNestedChildAttr

                    over "GrandChild" {
                        int impliedNestedGrandChildAttr
                    }
                }    
            }
        `)

        // Open stages for both layers.
        const stage1 = await openLayer(layer1)
        const stage2 = await openLayer(layer2)

        // Create an editor for stage1 so we can edit the base global class.
        const editor = new NamespaceEditor(stage1)

        // Add stage2 as a dependent stage.
        editor.addDependentStage(stage2)

        // Verify the initial composition fields for layer1 which will change
        // as we perform edits.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
                '/NestedClass' : {
                    [classArcType]: ['/Class']
                },
                '/Model/LocalClass' : {
                    [classArcType]: ['/NestedClass']
                },
                '/Model/Instance1' : {
                    [classArcType]: ['/Model/LocalClass']
                },
                '/Model/Instance2' : {
                    [classArcType]: ['/Model/LocalClass/Child']
                },
                '/Model/Instance3' : {
                    [classArcType]: ['/Model/LocalClass/Child/GrandChild']
                },
            })

        // Verify layer2's composition fields which will not change during this
        // test.
        expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
                '/Char' : {
                    'references' : [new Reference(layer1.identifier, '/Model')]
                },
            })

        // Verify the initial contents of stage1 where, in particular, each
        // Instance prim has opinions from each of its three nested classes.
        const composedLocalClassGrandChildContents = {
            '.' : ['grandChildAttr', 'nestedGrandChildAttr', 
                   'localGrandChildAttr'],
        }

        const composedLocalClassChildContents = {
            '.' : ['childAttr', 'nestedChildAttr', 'localChildAttr'],
            'GrandChild' : composedLocalClassGrandChildContents
        }

        let composedLocalClassContents: ExpectedContents = {
            '.' : ['classAttr', 'nestedClassAttr', 'localClassAttr'],
            'Child' : composedLocalClassChildContents
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
                'Child' : {
                    '.' : ['childAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr']
                    }           
                }
            },
            'NestedClass': {
                '.' : ['classAttr', 'nestedClassAttr'],
                'Child' : {
                    '.' : ['childAttr', 'nestedChildAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr', 'nestedGrandChildAttr']
                    }           
                }
            },
            'Model' : {
                'LocalClass' : composedLocalClassContents,
                'Instance1' : composedLocalClassContents,
                'Instance2' : composedLocalClassChildContents,
                'Instance3' : composedLocalClassGrandChildContents
            }
        })

        // Verify the initial contents of stage2 where, in particular, each
        // Instance prim has opionions from the three direct nested classes as
        // well as from each corresponding implied class.
        const composedImpliedLocalClassGrandChildContents = {
            '.' : ['grandChildAttr', 'nestedGrandChildAttr', 
                   'localGrandChildAttr', 'impliedGrandChildAttr', 
                   'impliedNestedGrandChildAttr', 'impliedLocalGrandChildAttr'],
        }

        const composedImpliedLocalClassChildContents = {
            '.' : ['childAttr', 'nestedChildAttr', 'localChildAttr',
                   'impliedChildAttr', 'impliedNestedChildAttr', 
                   'impliedLocalChildAttr'],
            'GrandChild' : composedImpliedLocalClassGrandChildContents
        }

        let composedImpliedLocalClassContents: ExpectedContents = {
            '.' : ['classAttr', 'nestedClassAttr', 'localClassAttr',
                   'impliedClassAttr', 'impliedNestedClassAttr', 
                   'impliedLocalClassAttr'],
            'Child' : composedImpliedLocalClassChildContents
        }

        base.verifyStageContents(stage2, {
            'Class': {
                '.' : ['impliedClassAttr'],
                'Child' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }           
                }
            },
            'NestedClass': {
                '.' : ['impliedNestedClassAttr'],
                'Child' : {
                    '.' : ['impliedNestedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedNestedGrandChildAttr']
                    }           
                }
            },
            'Char' : {
                'LocalClass' : composedImpliedLocalClassContents,
                'Instance1' : composedImpliedLocalClassContents,
                'Instance2' : composedImpliedLocalClassChildContents,
                'Instance3' : composedImpliedLocalClassGrandChildContents
            }
        })

        // Edit: Rename /Class/Child to /Class/RenamedChild
        base.applyEdits(editor, "Move /Class/Child -> /Class/RenamedChild", () => {
            expect(editor.movePrimAtPath(
                '/Class/Child', '/Class/RenamedChild')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The edit is
        // propagated from base class /Class through /NestedClass and
        // /Model/LocalClass leading to Instance2 and Instance3 having their
        // class arcs updated to paths that use RenamedChild.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
                '/NestedClass' : {
                    [classArcType]: ['/Class']
                },
                '/Model/LocalClass' : {
                    [classArcType]: ['/NestedClass']
                },
                '/Model/Instance1' : {
                    [classArcType]: ['/Model/LocalClass']
                },
                '/Model/Instance2' : {
                    [classArcType]: ['/Model/LocalClass/RenamedChild']
                },
                '/Model/Instance3' : {
                    [classArcType]: ['/Model/LocalClass/RenamedChild/GrandChild']
                },
            })

        // On stage1, the propagated edits across class arcs mean that Child is
        // renamed to RenamedChild under /Class, /NestedClass, /Model/LocalClass,
        // and finally /Model/Instance1. The contents of Instance2 and Instance3
        // are unchanged because the class arc paths were updated.
        composedLocalClassContents = {
            '.' : ['classAttr', 'nestedClassAttr', 'localClassAttr'],
            'RenamedChild' : composedLocalClassChildContents
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
                'RenamedChild' : {
                    '.' : ['childAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr']
                    }           
                }
            },
            'NestedClass': {
                '.' : ['classAttr', 'nestedClassAttr'],
                'RenamedChild' : {
                    '.' : ['childAttr', 'nestedChildAttr'],
                    'GrandChild' : {
                        '.' : ['grandChildAttr', 'nestedGrandChildAttr']
                    }           
                }
            },
            'Model' : {
                'LocalClass' : composedLocalClassContents,
                'Instance1' : composedLocalClassContents,
                'Instance2' : composedLocalClassChildContents,
                'Instance3' : composedLocalClassGrandChildContents
            }
        })
        base.verifyStageResyncNotices(stage1, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/NestedClass/Child" : PrimResyncType.RenameSource,
            "/NestedClass/RenamedChild" : PrimResyncType.RenameDestination,
            "/Model/LocalClass/Child" : PrimResyncType.RenameSource,
            "/Model/LocalClass/RenamedChild" : PrimResyncType.RenameDestination,
            "/Model/Instance1/Child" : PrimResyncType.RenameSource,
            "/Model/Instance1/RenamedChild" : PrimResyncType.RenameDestination,
            "/Model/Instance2": PrimResyncType.UnchangedPrimStack,
            "/Model/Instance3": PrimResyncType.UnchangedPrimStack
        })

        // On stage2, the propagated edits across implied inherits mean that
        // Child is renamed to RenamedChild under the implied /Class,
        // /NestedClass and /Char/LocalClass. /Char/Instance1 has Child renamed
        // to Renamed child because the rename has occurred in all its
        // contributing specs. The contents of Instance2 and Instance3 are
        // unchanged because their class arc paths (direct and implied) were
        // updated.
        composedImpliedLocalClassContents = {
            '.' : ['classAttr', 'nestedClassAttr', 'localClassAttr',
                   'impliedClassAttr', 'impliedNestedClassAttr', 
                   'impliedLocalClassAttr'],
            'RenamedChild' : composedImpliedLocalClassChildContents
        }

        base.verifyStageContents(stage2, {
            'Class': {
                '.' : ['impliedClassAttr'],
                'RenamedChild' : {
                    '.' : ['impliedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedGrandChildAttr']
                    }           
                }
            },
            'NestedClass': {
                '.' : ['impliedNestedClassAttr'],
                'RenamedChild' : {
                    '.' : ['impliedNestedChildAttr'],
                    'GrandChild' : {
                        '.' : ['impliedNestedGrandChildAttr']
                    }           
                }
            },
            'Char' : {
                'LocalClass' : composedImpliedLocalClassContents,
                'Instance1' : composedImpliedLocalClassContents,
                'Instance2' : composedImpliedLocalClassChildContents,
                'Instance3' : composedImpliedLocalClassGrandChildContents
            }
        })
        base.verifyStageResyncNotices(stage2, {
            "/Class/Child" : PrimResyncType.RenameSource,
            "/Class/RenamedChild" : PrimResyncType.RenameDestination,
            "/NestedClass/Child" : PrimResyncType.RenameSource,
            "/NestedClass/RenamedChild" : PrimResyncType.RenameDestination,
            "/Char/LocalClass/Child" : PrimResyncType.RenameSource,
            "/Char/LocalClass/RenamedChild" : PrimResyncType.RenameDestination,
            "/Char/Instance1/Child" : PrimResyncType.RenameSource,
            "/Char/Instance1/RenamedChild" : PrimResyncType.RenameDestination,
            "/Char/Instance2": PrimResyncType.UnchangedPrimStack,
            "/Char/Instance3": PrimResyncType.UnchangedPrimStack
        })

        // Edit: Rename and reparent /Class/RenamedChild to /MovedChild
        base.applyEdits(editor, "Move /Class/RenamedChild -> /MovedChild", () => {
            expect(editor.movePrimAtPath(
                '/Class/RenamedChild', '/MovedChild')).toBe(true)
        })

        // Verify the updated composition fields in layer1. The edit is
        // propagated from base class /Class through /NestedClass and
        // /Model/LocalClass leading to Instance2 and Instance3 having their
        // class arcs updated just like the last edit. But because MovedChild is
        // outside the root of the inherit from /NestedClass to /Class, this edit
        // is propagated as a deletion of /NestedClass/RenamedChild which
        // then deletes /Model/LocalClass/RenamedChild. And thus we delete the
        // class arc targets for Instance2 and Instance3.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
                '/NestedClass' : {
                    [classArcType]: ['/Class']
                },
                '/Model/LocalClass' : {
                    [classArcType]: ['/NestedClass']
                },
                '/Model/Instance1' : {
                    [classArcType]: ['/Model/LocalClass']
                },
                '/Model/Instance2' : {
                    [classArcType]: []
                },
                '/Model/Instance3' : {
                    [classArcType]: []
                },
            })

        // On stage1, RenamedChild is moved out of /Class to /MovedChild. So, the
        // propagated edits across class arcs mean that RenamedChild is deleted
        // from /NestedClass, /Model/LocalClass, and finally /Model/Instance1.
        // The contents of Instance2 and Instance3 are now empty because they no
        // longer have a class arc to the deleted descendants of
        // /Model/LocalClass.
        composedLocalClassContents = {
            '.' : ['classAttr', 'nestedClassAttr', 'localClassAttr'],
        }

        base.verifyStageContents(stage1, {
            'Class': {
                '.' : ['classAttr'],
            },
            'MovedChild' : {
                '.' : ['childAttr'],
                'GrandChild' : {
                    '.' : ['grandChildAttr']
                }           
            },
            'NestedClass': {
                '.' : ['classAttr', 'nestedClassAttr'],
            },
            'Model' : {
                'LocalClass' : composedLocalClassContents,
                'Instance1' : composedLocalClassContents,
                'Instance2' : {},
                'Instance3' : {}
            }
        })
        base.verifyStageResyncNotices(stage1, {
            "/Class/RenamedChild" : PrimResyncType.RenameAndReparentSource,
            "/MovedChild" : PrimResyncType.RenameAndReparentDestination,
            "/NestedClass/RenamedChild" : PrimResyncType.Delete,
            "/Model/LocalClass/RenamedChild" : PrimResyncType.Delete,
            "/Model/Instance1/RenamedChild" : PrimResyncType.Delete,
            "/Model/Instance2": PrimResyncType.Other,
            "/Model/Instance3": PrimResyncType.Other
        })

        // On stage2, the propagated edits across implied class arcs mean that
        // RenamedChild is now deleted under the implied /Class, /NestedClass
        // and /Char/LocalClass. /Char/Instance1 has RenamedChild removed
        // because the all of the contributing specs to RenamedChild have been
        // deleted. The contents of Instance2 and Instance3 are now empty because
        // there are no more class arcs (direct nor implied).
        composedImpliedLocalClassContents = {
            '.' : ['classAttr', 'nestedClassAttr', 'localClassAttr',
                   'impliedClassAttr', 'impliedNestedClassAttr', 
                   'impliedLocalClassAttr'],
        }

        base.verifyStageContents(stage2, {
            'Class': {
                '.' : ['impliedClassAttr'],
            },
            'NestedClass': {
                '.' : ['impliedNestedClassAttr'],
            },
            'Char' : {
                'LocalClass': composedImpliedLocalClassContents,
                'Instance1' : composedImpliedLocalClassContents,
                'Instance2' : {},
                'Instance3' : {}
            }
        })
        base.verifyStageResyncNotices(stage2, {
            "/Class/RenamedChild" : PrimResyncType.Delete,
            "/NestedClass/RenamedChild" : PrimResyncType.Delete,
            "/Char/LocalClass/RenamedChild" : PrimResyncType.Delete,
            "/Char/Instance1/RenamedChild" : PrimResyncType.Delete,
            "/Char/Instance2": PrimResyncType.Other,
            "/Char/Instance3": PrimResyncType.Other
        })
    }

    it('test_TestNestedClassInherits', async () => {
        // Test downstream dependency namespace edits across inherits and
        // their implied classes when inherits are nested inside other inherits.

        await runTestNestedClassClassArcs("inherits")
    })

    it('test_TestNestedClassSpecializes', async () => {
        // Test downstream dependency namespace edits across specializes and
        // their implied classes when specializes are nested inside other
        // specializes.

        await runTestNestedClassClassArcs("specializes")
    })

    async function runTestSiblingClassArcs(classArcType: string): Promise<void> {
        const layer1 = Layer.createAnonymous("layer1.usda")
        const layer1ImportString = `#usda 1.0
            def "Model"
            {
                def "Child"
                {
                    int modelChildAttr
                }

                def "SiblingArc" (
                    ${classArcType} = </Model/Child>
                ) {
                    int siblingArcAttr
                }
            }

        `
        layer1.importFromString(layer1ImportString)

        const stage1 = await openLayer(layer1)
        const editor = new NamespaceEditor(stage1)

        // Verify the initial composition fields.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/Model/SiblingArc' : {
                [classArcType]: ['/Model/Child']
            },
        })

        const modelContents = {
            'Child': {
                '.' : ['modelChildAttr']
            },
            'SiblingArc': {
                '.': ['siblingArcAttr', 'modelChildAttr']
            }
        }

        // Verify the expected contents of stage 1
        base.verifyStageContents(stage1, {
            'Model': modelContents, 
        })

        // Edit: Rename /Model to /RenamedModel
        // This is to check that class arcs targeting sibling prims have their
        // paths correctly updated when a parent is renamed.
        base.applyEdits(editor, "Move /Model-> /RenamedModel", () => {
            expect(editor.movePrimAtPath(
                '/Model', '/RenamedModel')).toBe(true)
        })
            
        // Verify the updated composition fields in layer1.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
            '/RenamedModel/SiblingArc' : {
                [classArcType]: ['/RenamedModel/Child']
            },
        })

        base.verifyStageContents(stage1, {
            'RenamedModel' : modelContents
        })
        base.verifyStageResyncNotices(stage1, {
            "/Model" : PrimResyncType.RenameSource,
            "/RenamedModel" : PrimResyncType.RenameDestination,
        })
    }

    it('test_TestSiblingInherits', async () => {
        // Test that a prim that inherits from a sibling has its inherit path
        // correctly updated when the parent path is changed.
        await runTestSiblingClassArcs("inherits")
    })

    it('test_TestSiblingSpecializes', async () => {
        // Test that a prim that specializes from a sibling has its specializes
        // path correctly updated when the parent path is changed.
        await runTestSiblingClassArcs("specializes")
    })

    it('test_TestMixedInheritAndSpecializesClassHierarchies', async () => {
        // Tests downstream dependency namespace edits across a mix of inherits
        // and specializes arcs in a single nested class hierarchy.

        // Layer1 has a nested class hierarchy interleaving inherits and
        // specializes arcs and ending in a reference. I.e. /ClassA inherits
        // /ClassB specializes /ClassC inherits /ClassD references /Ref. They all
        // define a Child and GrandChild hierarchy.
        // Then we have three instance prims that specialize /ClassA,
        // /ClassA/Child, and /ClassA/Child/GrandChild respectively.
        // The direct namespace edits will be performed at the referenced prim
        // /Ref to demonstrate how the edits are propagated through the mixed
        // class arcs.
        const layer1 = Layer.createAnonymous("layer1.usda")
        layer1.importFromString(`#usda 1.0
            def "Instance1" (
                specializes = </ClassA>
            ) {}

            def "Instance2" (
                specializes = </ClassA/Child>
            ) {}

            def "Instance3" (
                specializes = </ClassA/Child/GrandChild>
            ) {}

            class "ClassA" (
                inherits = </ClassB>
            ) {
                int classAAttr
            
                def "Child" {
                    int childAAttr

                    def "GrandChild" {
                        int grandChildAAttr
                    }
                }    
            }

            class "ClassB" (
                specializes = </ClassC>
            ) {
                int classBAttr
            
                def "Child" {
                    int childBAttr

                    def "GrandChild" {
                        int grandChildBAttr
                    }
                }    
            }

            class "ClassC" (
                inherits = </ClassD>
            ) {
                int classCAttr
            
                def "Child" {
                    int childCAttr

                    def "GrandChild" {
                        int grandChildCAttr
                    }
                }    
            }

            class "ClassD" (
                references = </Ref>
            ) {
                int classDAttr
            
                def "Child" {
                    int childDAttr

                    def "GrandChild" {
                        int grandChildDAttr
                    }
                }    
            }

            class "Ref" {
                int refAttr
            
                def "Child" {
                    int childAttr

                    def "GrandChild" {
                        int grandChildAttr
                    }
                }    
            }
        `)

        // Layer2 has three instance prims that directly reference the instance
        // prims from layer1. It also provides implied class opinions for each of
        // the class arcs that will implied from the class arcs across the
        // references.
        const layer2 = Layer.createAnonymous("layer2.usda")
        layer2.importFromString(`#usda 1.0
            def "Instance1" (
                references = @${layer1.identifier}@</Instance1>
            ) {}

            def "Instance2" (
                references = @${layer1.identifier}@</Instance2>
            ) {}

            def "Instance3" (
                references = @${layer1.identifier}@</Instance3>
            ) {}

            over "ClassA" {
                int implied2ClassAAttr
            
                over "Child" {
                    int implied2ChildAAttr

                    over "GrandChild" {
                        int implied2GrandChildAAttr
                    }
                }    
            }

            over "ClassB" {
                int implied2ClassBAttr
            
                over "Child" {
                    int implied2ChildBAttr

                    over "GrandChild" {
                        int implied2GrandChildBAttr
                    }
                }    
            }

            over "ClassC" {
                int implied2ClassCAttr
            
                over "Child" {
                    int implied2ChildCAttr

                    over "GrandChild" {
                        int implied2GrandChildCAttr
                    }
                }    
            }

            over "ClassD" {
                int implied2ClassDAttr
            
                over "Child" {
                    int implied2ChildDAttr

                    over "GrandChild" {
                        int implied2GrandChildDAttr
                    }
                }    
            }
        `)


        // Layer3 is similar to layer2 and has three instance prims that directly
        // reference the instance prims from layer2 (that in turn reference
        // layer1). It also provides implied class opinions for each of the class
        // arcs that will implied from the class arcs across the references.
        const layer3 = Layer.createAnonymous("layer3.usda")
        layer3.importFromString(`#usda 1.0
            def "Instance1" (
                references = @${layer2.identifier}@</Instance1>
            ) {}

            def "Instance2" (
                references = @${layer2.identifier}@</Instance2>
            ) {}

            def "Instance3" (
                references = @${layer2.identifier}@</Instance3>
            ) {}

            over "ClassA" {
                int implied3ClassAAttr
            
                over "Child" {
                    int implied3ChildAAttr

                    over "GrandChild" {
                        int implied3GrandChildAAttr
                    }
                }    
            }

            over "ClassB" {
                int implied3ClassBAttr
            
                over "Child" {
                    int implied3ChildBAttr

                    over "GrandChild" {
                        int implied3GrandChildBAttr
                    }
                }    
            }

            over "ClassC" {
                int implied3ClassCAttr
            
                over "Child" {
                    int implied3ChildCAttr

                    over "GrandChild" {
                        int implied3GrandChildCAttr
                    }
                }    
            }

            over "ClassD" {
                int implied3ClassDAttr
            
                over "Child" {
                    int implied3ChildDAttr

                    over "GrandChild" {
                        int implied3GrandChildDAttr
                    }
                }    
            }
        `)

        // Open stages for each layer.
        const stage1 = await openLayer(layer1)
        const stage2 = await openLayer(layer2)
        const stage3 = await openLayer(layer3)

        // Create an editor for stage1 so we can edit the base class.
        const editor = new NamespaceEditor(stage1)

        // Only stage3 is added as a dependent stage. Stage2 will be affected by
        // changes to layer2 that are caused by dependencies on stage3.
        editor.addDependentStage(stage3)

        // Verify the composition fields in layer one where the class arcs for
        // the class hierarchy are defined in addition to the specializes on the
        // instance prims.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
                '/ClassD' : {
                    'references' : [new Reference('', '/Ref')]
                },
                '/ClassC' : {
                    'inherits' : ['/ClassD']
                },
                '/ClassB' : {
                    'specializes' : ['/ClassC']
                },
                '/ClassA' : {
                    'inherits' : ['/ClassB']
                },
                '/Instance1' : {
                    'specializes' : ['/ClassA']
                },
                '/Instance2' : {
                    'specializes' : ['/ClassA/Child']
                },
                '/Instance3' : {
                    'specializes' : ['/ClassA/Child/GrandChild']
                },
            })

        // Verify the composition fields in layer2 and layer3 where we just have
        // the references to the instance prims. These will not be be changed
        // across the edits we plan to perform in this test.
        const _VerifyUnchangedLayer2And3CompositionFields = () => {
            expect(base.getCompositionFieldsInLayer(layer2)).toEqual({
                    '/Instance1' : {
                        'references' : [
                            new Reference(layer1.identifier, '/Instance1')]
                    },
                    '/Instance2' : {
                        'references' : [
                            new Reference(layer1.identifier, '/Instance2')]
                    },
                    '/Instance3' : {
                        'references' : [
                            new Reference(layer1.identifier, '/Instance3')]
                    },
                })
            expect(base.getCompositionFieldsInLayer(layer3)).toEqual({
                    '/Instance1' : {
                        'references' : [
                            new Reference(layer2.identifier, '/Instance1')]
                    },
                    '/Instance2' : {
                        'references' : [
                            new Reference(layer2.identifier, '/Instance2')]
                    },
                    '/Instance3' : {
                        'references' : [
                            new Reference(layer2.identifier, '/Instance3')]
                    },
                })
        }
        
        _VerifyUnchangedLayer2And3CompositionFields()

        // Verify the initial contents of stage1 which reflects how /ClassA
        // composes in /ClassB which composes in /ClassC which composes in
        // /ClassD which composes in /Ref.
        const refAttrs = ['refAttr']
        const refChildAttrs =  ['childAttr']
        const refGrandChildAttrs = ['grandChildAttr']
        const refChildContents = {
            '.' : refChildAttrs,
            'GrandChild' : {
                '.' : refGrandChildAttrs
            }
        }    

        const classDAttrs = [...refAttrs, 'classDAttr']
        const classDChildAttrs =  [...refChildAttrs, 'childDAttr']
        const classDGrandChildAttrs = [...refGrandChildAttrs, 'grandChildDAttr']
        const classDChildContents = {
            '.' : classDChildAttrs,
            'GrandChild' : {
                '.' : classDGrandChildAttrs
            }
        }    

        const classCAttrs = [...classDAttrs, 'classCAttr']
        const classCChildAttrs =  [...classDChildAttrs, 'childCAttr']
        const classCGrandChildAttrs = [...classDGrandChildAttrs, 'grandChildCAttr']
        const classCChildContents = {
            '.' : classCChildAttrs,
            'GrandChild' : {
                '.' : classCGrandChildAttrs
            }
        }    

        const classBAttrs = [...classCAttrs, 'classBAttr']
        const classBChildAttrs =  [...classCChildAttrs, 'childBAttr']
        const classBGrandChildAttrs = [...classCGrandChildAttrs, 'grandChildBAttr']
        const classBChildContents = {
            '.' : classBChildAttrs,
            'GrandChild' : {
                '.' : classBGrandChildAttrs
            }
        }    

        const classAAttrs = [...classBAttrs, 'classAAttr']
        const classAChildAttrs =  [...classBChildAttrs, 'childAAttr']
        const classAGrandChildAttrs = [...classBGrandChildAttrs, 'grandChildAAttr']
        const classAChildContents = {
            '.' : classAChildAttrs,
            'GrandChild' : {
                '.' : classAGrandChildAttrs
            }
        }    

        base.verifyStageContents(stage1, {
            'Ref' : {
                '.' : refAttrs,
                'Child' : refChildContents
            },
            'ClassD' : {
                '.' : classDAttrs,
                'Child' : classDChildContents
            },
            'ClassC' : {
                '.' : classCAttrs,
                'Child' : classCChildContents
            },
            'ClassB' : {
                '.' : classBAttrs,
                'Child' : classBChildContents
            },
            'ClassA' : {
                '.' : classAAttrs,
                'Child' : classAChildContents
            },
            // /Instance1 composes /ClassA
            'Instance1' : {
                '.' : classAAttrs,
                'Child' : classAChildContents
            },
            // /Instance2 composes /ClassA/Child
            'Instance2' : classAChildContents,
            // /Instance3 composes /ClassA/Child/GrandChild
            'Instance3' : {
                '.' : classAGrandChildAttrs
            },
        })

        // Verify the initial contents of stage2 which reflects how each Instance
        // composes the corresponding instance in layer1 along with the implied
        // class opinions in layer2.
        const stage2RefComposedAttrs = [...classAAttrs, 'implied2ClassDAttr', 'implied2ClassCAttr', 
             'implied2ClassBAttr', 'implied2ClassAAttr']
        const stage2ChildComposedAttrs =  [...classAChildAttrs, 'implied2ChildDAttr', 'implied2ChildCAttr', 
             'implied2ChildBAttr', 'implied2ChildAAttr']
        const stage2GrandChildComposedAttrs = [...classAGrandChildAttrs, 'implied2GrandChildDAttr', 'implied2GrandChildCAttr', 
             'implied2GrandChildBAttr', 'implied2GrandChildAAttr']
        const stage2ChildComposedContents = {
            '.' : stage2ChildComposedAttrs,
            'GrandChild' : {
                '.' : stage2GrandChildComposedAttrs
            }
        }    

        base.verifyStageContents(stage2, {
            'ClassD' : {
                '.' : ['implied2ClassDAttr'],
                'Child' : {
                    '.' : ['implied2ChildDAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildDAttr']
                    }
                }    
            },
            'ClassC' : {
                '.' : ['implied2ClassCAttr'],
                'Child' : {
                    '.' : ['implied2ChildCAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildCAttr']
                    }
                }    
            },
            'ClassB' : {
                '.' : ['implied2ClassBAttr'],
                'Child' : {
                    '.' : ['implied2ChildBAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildBAttr']
                    }
                }    
            },
            'ClassA' : {
                '.' : ['implied2ClassAAttr'],
                'Child' : {
                    '.' : ['implied2ChildAAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildAAttr']
                    }
                }    
            },
            'Instance1' : {
                '.' : stage2RefComposedAttrs, 
                'Child' : stage2ChildComposedContents,
            },
            'Instance2' : stage2ChildComposedContents,
            'Instance3' : {
                '.' : stage2GrandChildComposedAttrs
            },
        })

        // Verify the initial contents of stage3 which reflects how each Instance
        // composes the corresponding instance in layer2 along with the implied
        // class opinions in layer3.
        const stage3RefComposedAttrs = [...stage2RefComposedAttrs, 'implied3ClassDAttr', 'implied3ClassCAttr', 
             'implied3ClassBAttr', 'implied3ClassAAttr']
        const stage3ChildComposedAttrs =  [...stage2ChildComposedAttrs, 'implied3ChildDAttr', 'implied3ChildCAttr', 
             'implied3ChildBAttr', 'implied3ChildAAttr']
        const stage3GrandChildComposedAttrs = [...stage2GrandChildComposedAttrs, 'implied3GrandChildDAttr', 'implied3GrandChildCAttr', 
             'implied3GrandChildBAttr', 'implied3GrandChildAAttr']
        const stage3ChildComposedContents = {
            '.' : stage3ChildComposedAttrs,
            'GrandChild' : {
                '.' : stage3GrandChildComposedAttrs
            }
        }    

        base.verifyStageContents(stage3, {
            'ClassD' : {
                '.' : ['implied3ClassDAttr'],
                'Child' : {
                    '.' : ['implied3ChildDAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildDAttr']
                    }
                }    
            },
            'ClassC' : {
                '.' : ['implied3ClassCAttr'],
                'Child' : {
                    '.' : ['implied3ChildCAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildCAttr']
                    }
                }    
            },
            'ClassB' : {
                '.' : ['implied3ClassBAttr'],
                'Child' : {
                    '.' : ['implied3ChildBAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildBAttr']
                    }
                }    
            },
            'ClassA' : {
                '.' : ['implied3ClassAAttr'],
                'Child' : {
                    '.' : ['implied3ChildAAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildAAttr']
                    }
                }    
            },
            'Instance1' : {
                '.' : stage3RefComposedAttrs,
                'Child' : stage3ChildComposedContents
            },
            'Instance2' : stage3ChildComposedContents,
            'Instance3' : {
                '.' : stage3GrandChildComposedAttrs
            },
        })

        // Edit: Rename /Ref/Child to to RenamedChild on stage1
        base.applyEdits(editor, "Rename /Ref/Child -> /Ref/RenamedChild", () => {
            expect(editor.movePrimAtPath("/Ref/Child", "/Ref/RenamedChild")).toBe(true)
        })

        // Verify the changed composition fields on layer1. Only the specializes
        // in /Instance1 and /Instance2 on layer1 have been updated to reflect
        // that /ClassA/Child has been moved to /ClassA/RenamedChild in response
        // to the dependencies on /Ref/Child across all the class arcs.
        expect(base.getCompositionFieldsInLayer(layer1)).toEqual({
                '/ClassD' : {
                    'references' : [new Reference('', '/Ref')]
                },
                '/ClassC' : {
                    'inherits' : ['/ClassD']
                },
                '/ClassB' : {
                    'specializes' : ['/ClassC']
                },
                '/ClassA' : {
                    'inherits' : ['/ClassB']
                },
                '/Instance1' : {
                    'specializes' : ['/ClassA']
                },
                '/Instance2' : {
                    'specializes' : ['/ClassA/RenamedChild']
                },
                '/Instance3' : {
                    'specializes' : ['/ClassA/RenamedChild/GrandChild']
                },
            })

        // Verify that composition fiels in layer2 and layer3 remain unchanged
        _VerifyUnchangedLayer2And3CompositionFields()

        // Verify the changed contents of stage1 where /Ref/Child is renamed to
        // /Ref/RenamedChild and this is propagated up through each class arc so
        // that ClassD through ClassA and Instance1 have all had their "Child"
        // prims fully renamed to "RenamedChild". The contents of /Instance2 and
        // /Instance3 are completely unchanged as their specializes arcs were
        // updated to refer to the renamed class paths.
        base.verifyStageContents(stage1, {
            'Ref' : {
                '.' : refAttrs,
                'RenamedChild' : refChildContents
            },
            'ClassD' : {
                '.' : classDAttrs,
                'RenamedChild' : classDChildContents
            },
            'ClassC' : {
                '.' : classCAttrs,
                'RenamedChild' : classCChildContents
            },
            'ClassB' : {
                '.' : classBAttrs,
                'RenamedChild' : classBChildContents
            },
            'ClassA' : {
                '.' : classAAttrs,
                'RenamedChild' : classAChildContents
            },
            'Instance1' : {
                '.' : classAAttrs,
                'RenamedChild' : classAChildContents
            },
            'Instance2' : classAChildContents,
            'Instance3' : {
                '.' : classAGrandChildAttrs
            },
        })
        base.verifyStageResyncNotices(stage1, {
            "/Ref/Child" : PrimResyncType.RenameSource,
            "/Ref/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassD/Child" : PrimResyncType.RenameSource,
            "/ClassD/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassC/Child" : PrimResyncType.RenameSource,
            "/ClassC/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassB/Child" : PrimResyncType.RenameSource,
            "/ClassB/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassA/Child" : PrimResyncType.RenameSource,
            "/ClassA/RenamedChild" : PrimResyncType.RenameDestination,
            "/Instance1/Child" : PrimResyncType.RenameSource,
            "/Instance1/RenamedChild" : PrimResyncType.RenameDestination,
            "/Instance2": PrimResyncType.UnchangedPrimStack,
            "/Instance3": PrimResyncType.UnchangedPrimStack
        })

        // Verify the changed contents of stage2 where "Child" is renamed to
        // "RenamedChild" under every implied class spec to match the renames in
        // classes they were implied from. Instance1 has its child prim "Child"
        // fully renamed to "RenamedChild" because of the rename across its
        // reference. The contents of /Instance2 and /Instance3 are completely
        // unchanged as the composed prims they reference were unchanged due the
        // the changes in layer1.
        //
        // Note that the changes reflected in stage2 are only due to the
        // dependencies in stage3 on all the specs in layer2 as stage2 was not
        // added as a dependent stage of the namespace editor. If stage3 didn't
        // have prims that depend on these layer2 specs, the layer2 specs would
        // not have updated to reflect the rename. Also, stage2 can only report
        // "Delete" or "Other" resyncs, since the analysis for finer-grained
        // classifications only occurs on dependent stages.
        base.verifyStageContents(stage2, {
            'ClassD' : {
                '.' : ['implied2ClassDAttr'],
                'RenamedChild' : {
                    '.' : ['implied2ChildDAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildDAttr']
                    }
                }    
            },
            'ClassC' : {
                '.' : ['implied2ClassCAttr'],
                'RenamedChild' : {
                    '.' : ['implied2ChildCAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildCAttr']
                    }
                }    
            },
            'ClassB' : {
                '.' : ['implied2ClassBAttr'],
                'RenamedChild' : {
                    '.' : ['implied2ChildBAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildBAttr']
                    }
                }    
            },
            'ClassA' : {
                '.' : ['implied2ClassAAttr'],
                'RenamedChild' : {
                    '.' : ['implied2ChildAAttr'],
                    'GrandChild' : {
                        '.' : ['implied2GrandChildAAttr']
                    }
                }    
            },
            'Instance1' : {
                '.' : stage2RefComposedAttrs, 
                'RenamedChild' : stage2ChildComposedContents,
            },
            'Instance2' : stage2ChildComposedContents,
            'Instance3' : {
                '.' : stage2GrandChildComposedAttrs
            },
        })
        base.verifyStageResyncNotices(stage2, {
            "/ClassD/Child" : PrimResyncType.Delete,
            "/ClassD/RenamedChild" : PrimResyncType.Other,
            "/ClassC/Child" : PrimResyncType.Delete,
            "/ClassC/RenamedChild" : PrimResyncType.Other,
            "/ClassB/Child" : PrimResyncType.Delete,
            "/ClassB/RenamedChild" : PrimResyncType.Other,
            "/ClassA/Child" : PrimResyncType.Delete,
            "/ClassA/RenamedChild" : PrimResyncType.Other,
            "/Instance1/Child" : PrimResyncType.Delete,
            "/Instance1/RenamedChild" : PrimResyncType.Other,
            "/Instance2": PrimResyncType.Other,
            "/Instance3": PrimResyncType.Other
        })

        // Verify the changed contents of stage3 where "Child" is renamed to
        // "RenamedChild" under every implied class spec to match the renames in
        // classes they were implied from. Instance1 has its child prim "Child"
        // fully renamed to "RenamedChild" because of the rename across its
        // reference. The contents of /Instance2 and /Instance3 are completely
        // unchanged as the composed prims they reference in layer2 were
        // unchanged due the the changes in layer1.
        base.verifyStageContents(stage3, {
            'ClassD' : {
                '.' : ['implied3ClassDAttr'],
                'RenamedChild' : {
                    '.' : ['implied3ChildDAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildDAttr']
                    }
                }    
            },
            'ClassC' : {
                '.' : ['implied3ClassCAttr'],
                'RenamedChild' : {
                    '.' : ['implied3ChildCAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildCAttr']
                    }
                }    
            },
            'ClassB' : {
                '.' : ['implied3ClassBAttr'],
                'RenamedChild' : {
                    '.' : ['implied3ChildBAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildBAttr']
                    }
                }    
            },
            'ClassA' : {
                '.' : ['implied3ClassAAttr'],
                'RenamedChild' : {
                    '.' : ['implied3ChildAAttr'],
                    'GrandChild' : {
                        '.' : ['implied3GrandChildAAttr']
                    }
                }    
            },
            'Instance1' : {
                '.' : stage3RefComposedAttrs,
                'RenamedChild' : stage3ChildComposedContents
            },
            'Instance2' : stage3ChildComposedContents,
            'Instance3' : {
                '.' : stage3GrandChildComposedAttrs
            },
        })
        base.verifyStageResyncNotices(stage3, {
            "/ClassD/Child" : PrimResyncType.RenameSource,
            "/ClassD/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassC/Child" : PrimResyncType.RenameSource,
            "/ClassC/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassB/Child" : PrimResyncType.RenameSource,
            "/ClassB/RenamedChild" : PrimResyncType.RenameDestination,
            "/ClassA/Child" : PrimResyncType.RenameSource,
            "/ClassA/RenamedChild" : PrimResyncType.RenameDestination,
            "/Instance1/Child" : PrimResyncType.RenameSource,
            "/Instance1/RenamedChild" : PrimResyncType.RenameDestination,
            "/Instance2": PrimResyncType.UnchangedPrimStack,
            "/Instance3": PrimResyncType.UnchangedPrimStack
        })
    })
})
