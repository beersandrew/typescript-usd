// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.cpp, pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdRelationships.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdRelationships.py
// (registered as testUsdRelationships; no testenv directory). Upstream runs
// every method for both the usda and usdc formats; here each method is a
// describe.each over the same list. (relationships.test.ts holds older
// typescript-usd authoring checks; this file is the upstream port.)
//
// API mapping:
//   - Usd.Stage.CreateInMemory(tag) is Stage.open(Layer.createAnonymous(tag))
//     (stage.cpp:1189-1219).
//   - UsdPrim::GetRelationship(name) is prim.rel(name); UsdPrim::GetChild is
//     stage.getPrim(child path) (prim.cpp:72-76).
//   - FindAllRelationshipTargetPaths(traversal, predicate, recurseOnTargets)
//     takes an options object; Usd.PrimAllPrimsPredicate is
//     traversalPredicate: 'allPrims'.
//   - A Tf.ErrorException from a TF_CODING_ERROR is a thrown Error.
//   - relSpec.GetInfo('targetPaths') is compared through ListOp.fromValue.
import { describe, expect, it } from 'vitest'
import { Layer, ListOp } from 'typescript-usd/sdf'
import {
  ListPositionBackOfAppendList, ListPositionBackOfPrependList, ListPositionFrontOfAppendList,
  ListPositionFrontOfPrependList, Stage,
} from 'typescript-usd/usd'

const allFormats = ['usda', 'usdc']

const createInMemory = (tag: string): Promise<Stage> => Stage.open(Layer.createAnonymous(tag))
const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentName = (path: string) => name(path.slice(0, path.lastIndexOf('/')))
const sorted = (paths: string[]) => [...new Set(paths)].sort()

// testUsdRelationships.py:13-86
async function createStage(fmt: string): Promise<Stage> {
  const s = await createInMemory(`_CreateStage.${fmt}`)
  s.getRootLayer().importFromString(`#usda 1.0
        def Scope "Foo"
        {
            custom int someAttr
            add rel testRel = [
                </Qux>,
                </Bar>,
                </Baz>,
                </Foo.someAttr>,
            ]
            add rel testRelBug138452 = </Bug138452>
        }

        def Scope "Bar"
        {
            add rel cycle = </Bar.fwd>
            add rel fwd = [
                </Baz>,
                </Foo.testRel>,
                </Qux>,
                </Bar.cycle>,
            ]
            add rel fwd2 = [
                </Bar.fwd2a>,
                </Bar.fwd2b>,
                </Bar.fwd2c>,
            ]
            add rel fwd2a = </Qux>
            add rel fwd2b = </Baz>
            add rel fwd2c = </Bar>
        }

        def Scope "Baz"
        {
            add rel bogus = </MissingTargetPath>
        }

        def Scope "Qux"
        {
        }

        def Scope "Bug138452"
        {
            custom rel Bug138452
            add rel Bug138452 = </Qux>
        }

        def "Recursive" {
            def "A" { custom rel AtoB = <../B>
            }
            def "B" { custom rel BtoC = <../C>
            }
            def "C" { custom rel CtoD = <../D>
            }
            def "D" { custom rel DtoA = <../A>
                def "A" { custom rel AtoB = <../B>
                }
                def "B" { custom rel BtoC = <../C>
                }
                def "C" { custom rel CtoD = <../D>
                }
                def "D" { custom rel DtoA = <../A>
                }
            }
            over "E" { custom rel EtoF = <../F>
            }
            over "F" { custom rel FtoE = <../E>
            }
        }
        `)
  await s.flushChanges()
  return s
}

describe.each(allFormats)('testUsdRelationships (%s)', fmt => {
  // testUsdRelationships.py:89-191
  it('test_Targets', async () => {
    const stage = await createStage(fmt)

    // Simple target list with correct order
    let r = stage.getPrim('/Foo')!.rel('testRel')
    expect(r.getTargets()).toEqual(['/Qux', '/Bar', '/Baz', '/Foo.someAttr'])

    // Forwarded targets
    r = stage.getPrim('/Bar')!.rel('fwd')
    expect(r.getForwardedTargets()).toEqual(['/Baz', '/Qux', '/Bar', '/Foo.someAttr'])

    // Forwarded targets
    r = stage.getPrim('/Bar')!.rel('fwd2')
    expect(r.getForwardedTargets()).toEqual(['/Qux', '/Baz', '/Bar'])

    // Forwarded targets, bug 138452. With that bug, the forwarded targets
    // would be ['/Qux']
    r = stage.getPrim('/Foo')!.rel('testRelBug138452')
    expect(r.getForwardedTargets()).toEqual(['/Bug138452'])

    // Cycle detection
    r = stage.getPrim('/Bar')!.rel('cycle')
    expect(r.getForwardedTargets()).toEqual(['/Baz', '/Qux', '/Bar', '/Foo.someAttr'])

    // Bogus target path
    r = stage.getPrim('/Baz')!.rel('bogus')
    expect(r.getForwardedTargets()).toEqual(['/MissingTargetPath'])

    // Recursive finding
    let recursive = stage.getPrim('/Recursive')!
    expect(sorted(recursive.findAllRelationshipTargetPaths())).toEqual(sorted([
      '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
      '/Recursive/D/A', '/Recursive/D/B', '/Recursive/D/C', '/Recursive/D/D']))

    expect(sorted(recursive.findAllRelationshipTargetPaths({
      predicate: rel => ['B', 'D'].includes(name(rel.getPrim()!.path)),
    }))).toEqual(sorted([
      '/Recursive/A', '/Recursive/C', '/Recursive/D/A', '/Recursive/D/C']))

    expect(sorted(recursive.findAllRelationshipTargetPaths({
      predicate: rel => ['A', 'C'].includes(name(rel.getPrim()!.path)),
    }))).toEqual(sorted([
      '/Recursive/B', '/Recursive/D', '/Recursive/D/B', '/Recursive/D/D']))

    const recursiveA = stage.getPrim('/Recursive/A')!
    expect(sorted(recursiveA.findAllRelationshipTargetPaths())).toEqual(['/Recursive/B'])

    expect(sorted(recursiveA.findAllRelationshipTargetPaths({ recurseOnTargets: true })))
      .toEqual(sorted([
        '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
        '/Recursive/D/A', '/Recursive/D/B', '/Recursive/D/C', '/Recursive/D/D']))

    expect(sorted(recursiveA.findAllRelationshipTargetPaths({
      recurseOnTargets: true,
      predicate: rel => parentName(rel.getPrim()!.path) === 'Recursive' ||
        ['A', 'C'].includes(name(rel.getPrim()!.path)),
    }))).toEqual(sorted([
      '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
      '/Recursive/D/B', '/Recursive/D/D']))

    // Recursive finding with traversal predicate.
    recursive = stage.getPrim('/Recursive')!
    expect(sorted(recursive.findAllRelationshipTargetPaths({ traversalPredicate: 'allPrims' })))
      .toEqual(sorted([
        '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
        '/Recursive/E', '/Recursive/F',
        '/Recursive/D/A', '/Recursive/D/B', '/Recursive/D/C', '/Recursive/D/D']))

    expect(sorted(recursive.findAllRelationshipTargetPaths({
      traversalPredicate: 'allPrims',
      predicate: rel => ['B', 'D', 'E'].includes(name(rel.getPrim()!.path)),
    }))).toEqual(sorted([
      '/Recursive/A', '/Recursive/C', '/Recursive/F', '/Recursive/D/A', '/Recursive/D/C']))

    expect(sorted(recursive.findAllRelationshipTargetPaths({
      traversalPredicate: 'allPrims',
      predicate: rel => ['A', 'C', 'F'].includes(name(rel.getPrim()!.path)),
    }))).toEqual(sorted([
      '/Recursive/B', '/Recursive/D', '/Recursive/E', '/Recursive/D/B', '/Recursive/D/D']))
  })

  // testUsdRelationships.py:193-292
  it('test_TargetsInInstances', async () => {
    const s = await createInMemory(`TestTargetsInInstances.${fmt}`)
    s.getRootLayer().importFromString(`#usda 1.0
            def Scope "Ref"
            {
                def Scope "Foo"
                {
                    custom int someAttr
                    add rel testRel = [
                        </Ref/Qux>,
                        </Ref/Bar>,
                        </Ref/Baz>,
                        </Ref/Foo.someAttr>,
                    ]
                }

                def Scope "Bar"
                {
                    add rel cycle = </Ref/Bar.fwd>
                    add rel fwd = [
                        </Ref/Baz>,
                        </Ref/Foo.testRel>,
                        </Ref/Qux>,
                        </Ref/Bar.cycle>,
                    ]
                    add rel fwd2 = [
                        </Ref/Bar.fwd2a>,
                        </Ref/Bar.fwd2b>,
                        </Ref/Bar.fwd2c>,
                    ]
                    add rel fwd2a = </Ref/Qux>
                    add rel fwd2b = </Ref/Baz>
                    add rel fwd2c = </Ref/Bar>
                }

                def Scope "Baz"
                {
                    add rel bogus = </Ref/MissingTargetPath>
                    add rel root = </Ref>
                }

                def Scope "Qux"
                {
                }
            }

            def Scope "Root" (
                instanceable = true
                references = </Ref>
            )
            {
            }
            `)
    await s.flushChanges()

    const prototype = s.getPrim('/Root')!.getPrototype()!
    expect(prototype).toBeDefined()
    const P = prototype.path
    const child = (n: string) => s.getPrim(`${P}/${n}`)!

    // Simple target list with correct order
    let r = child('Foo').rel('testRel')
    expect(r.getTargets()).toEqual([`${P}/Qux`, `${P}/Bar`, `${P}/Baz`, `${P}/Foo.someAttr`])

    // Forwarded targets
    r = child('Bar').rel('fwd')
    expect(r.getForwardedTargets()).toEqual([`${P}/Baz`, `${P}/Qux`, `${P}/Bar`, `${P}/Foo.someAttr`])

    // Forwarded targets
    r = child('Bar').rel('fwd2')
    expect(r.getForwardedTargets()).toEqual([`${P}/Qux`, `${P}/Baz`, `${P}/Bar`])

    // Cycle detection
    r = child('Bar').rel('cycle')
    expect(r.getForwardedTargets()).toEqual([`${P}/Baz`, `${P}/Qux`, `${P}/Bar`, `${P}/Foo.someAttr`])

    // Bogus target path
    r = child('Baz').rel('bogus')
    expect(r.getTargets()).toEqual([`${P}/MissingTargetPath`])
    expect(r.getForwardedTargets()).toEqual([`${P}/MissingTargetPath`])

    // Path inside an instance that points to the instance root
    r = child('Baz').rel('root')
    expect(r.getTargets()).toEqual([P])
    expect(r.getForwardedTargets()).toEqual([P])
  })

  // testUsdRelationships.py:294-542
  it('test_TargetsToObjectsInInstances', async () => {
    const stage = await createInMemory(`TestTargetsToObjectsInInstances.${fmt}`)
    const relTargets = (root: string) => [
      root, `${root}.attr`, `${root}/A`, `${root}/A.attr`,
      `${root}/NestedInstance_1`, `${root}/NestedInstance_1.attr`,
      `${root}/NestedInstance_1/B`, `${root}/NestedInstance_1/B.attr`,
      `${root}/NestedInstance_2`, `${root}/NestedInstance_2.attr`,
      `${root}/NestedInstance_2/B`, `${root}/NestedInstance_2/B.attr`,
    ]
    const usdaList = (paths: string[]) => paths.map(p => `<${p}>`).join(',\n                    ')
    const rootTargets = [...relTargets('/Root/Instance_1'), ...relTargets('/Root/Instance_2')]
    stage.getRootLayer().importFromString(`#usda 1.0
            def "Instance"
            {
                double attr = 1.0

                def "A"
                {
                    double attr = 1.0
                    rel rel = [ 
                    ${usdaList(relTargets('/Instance'))}
                    ]
                }

                def "NestedInstance_1" (
                    instanceable = true
                    references = </NestedInstance>
                )
                {
                }

                def "NestedInstance_2" (
                    instanceable = true
                    references = </NestedInstance>
                )
                {
                }
            }

            def "NestedInstance"
            {
                double attr = 1.0
                def "B"
                {
                    double attr = 1.0
                }
            }

            def "Root"
            {
                rel fwdRel = [
                    </Root/Instance_1/A.rel>,
                    </Root/Instance_2/A.rel>
                ]

                rel rel = [ 
                    ${usdaList(rootTargets)}
                ]

                def "Instance_1" (
                    instanceable = true
                    references = </Instance>
                )
                {
                    rel fwdRel = [
                        </Root/Instance_1/A.rel>,
                        </Root/Instance_2/A.rel>
                    ]

                    rel rel = [ 
                    ${usdaList(rootTargets)}
                    ]
                }

                def "Instance_2" (
                    instanceable = true
                    references = </Instance>
                )
                {
                }
            }
            `)
    await stage.flushChanges()

    const prototype = stage.getPrim('/Root/Instance_1')!.getPrototype()!
    expect(stage.getPrim(`${prototype.path}/NestedInstance_1`)!.getPrototype()).toBeDefined()

    // Test retrieving relationship targets that point to instances and
    // prims within instances.
    const testRelationship = (primPath: string, relName: string) => {
      const rel = stage.getPrim(primPath)!.rel(relName)
      expect(stage.getRelationshipAtPath(rel.getPath())).toBeDefined()

      // Targets to objects in prototypes cannot be authored.
      const primInPrototypePath = `${prototype.path}/A`
      expect(() => rel.addTarget(primInPrototypePath)).toThrow()
      expect(() => rel.removeTarget(primInPrototypePath)).toThrow()
      expect(() => rel.setTargets(['/Root/Instance_1', primInPrototypePath])).toThrow()

      expect(rel.getTargets()).toEqual(rootTargets)
    }

    testRelationship('/Root', 'rel')
    testRelationship('/Root/Instance_1', 'rel')

    const testRelationshipInPrototype = (primPath: string, relName: string) => {
      const prim = stage.getPrim(primPath)!
      expect(stage.getRelationshipAtPath(`${primPath}.${relName}`)).toBeDefined()
      expect(prim.isInPrototype()).toBe(true)
      expect(prim.rel(relName).getTargets()).toEqual(relTargets(prototype.path))
    }

    testRelationshipInPrototype(`${prototype.path}/A`, 'rel')

    const testRelationshipForwarding = (primPath: string, relName: string) => {
      const rel = stage.getPrim(primPath)!.rel(relName)
      expect(stage.getRelationshipAtPath(rel.getPath())).toBeDefined()

      // Expect warning here due to targets authored inside an instance that
      // point to the instance root.
      expect(rel.getForwardedTargets()).toEqual(rootTargets)
    }

    testRelationshipForwarding('/Root', 'fwdRel')
    testRelationshipForwarding('/Root/Instance_1', 'fwdRel')
  })

  // testUsdRelationships.py:544-604
  it('test_AuthoringTargets', async () => {
    const stage = await createInMemory(`testAuthoringTargets.${fmt}`)

    const prim = stage.definePrim('/Test')
    const rel = prim.createRelationship('rel')
    const relSpec = () => stage.getRootLayer().getObjectAtPath(rel.getPath()) as
      { getInfo(key: string): unknown }
    const targetPaths = () => ListOp.fromValue<string>(relSpec().getInfo('targetPaths'), String).toValue()
    const targets = async () => { await stage.flushChanges(); return rel.getTargets() }

    rel.setTargets(['/Test/A', '/Test/B'])
    expect(await targets()).toEqual(['/Test/A', '/Test/B'])
    expect(targetPaths()).toEqual(ListOp.createExplicit(['/Test/A', '/Test/B']).toValue())

    rel.addTarget('/Test/C')
    expect(await targets()).toEqual(['/Test/A', '/Test/B', '/Test/C'])
    expect(targetPaths()).toEqual(ListOp.createExplicit(['/Test/A', '/Test/B', '/Test/C']).toValue())

    rel.clearTargets(false)
    expect(await targets()).toEqual([])
    expect(targetPaths()).toEqual(new ListOp<string>().toValue())

    rel.addTarget('/Test/A', ListPositionFrontOfPrependList)
    expect(await targets()).toEqual(['/Test/A'])
    expect(targetPaths()).toEqual(ListOp.create(['/Test/A']).toValue())

    rel.addTarget('/Test/B', ListPositionBackOfPrependList)
    expect(await targets()).toEqual(['/Test/A', '/Test/B'])
    expect(targetPaths()).toEqual(ListOp.create(['/Test/A', '/Test/B']).toValue())

    rel.addTarget('/Test/C', ListPositionFrontOfAppendList)
    expect(await targets()).toEqual(['/Test/A', '/Test/B', '/Test/C'])
    expect(targetPaths()).toEqual(ListOp.create(['/Test/A', '/Test/B'], ['/Test/C']).toValue())

    rel.addTarget('/Test/D', ListPositionBackOfAppendList)
    expect(await targets()).toEqual(['/Test/A', '/Test/B', '/Test/C', '/Test/D'])
    expect(targetPaths()).toEqual(ListOp.create(['/Test/A', '/Test/B'], ['/Test/C', '/Test/D']).toValue())
  })
})
