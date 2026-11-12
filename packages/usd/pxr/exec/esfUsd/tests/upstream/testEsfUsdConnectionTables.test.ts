// Ported from OpenUSD 26.11.1:
//  pxr/exec/esfUsd/testenv/testEsfUsdConnectionTables.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/testenv/testEsfUsdConnectionTables.cpp
//
// main() (testEsfUsdConnectionTables.cpp:717-730) runs each test with a
// fresh default Fixture; each it() builds one. Mapping: `obj->Method(...)` is
// `obj.Get().Method(...)`, TF_AXIOM and ASSERT_EQ are expect, SdfPathVector
// results compare as path-string arrays and std::set<SdfPath> as sorted
// path-string arrays. UsdStage/UsdAttribute/SdfLayer calls are their
// typescript-usd counterparts (paths are strings there); stage edits that
// return promises (SetActive, Load, Unload) are awaited. std::mt19937 and
// std::bernoulli_distribution are reproduced exactly (../stdRandom.ts).
import { describe, expect, it } from 'vitest'
import { AttributeSpec as SdfAttributeSpec, Layer } from 'typescript-usd/sdf'
import { SdfPath, type SdfPathSet } from 'typescript-usd/sdf/path'
import { Stage, type Notice as UsdNotice } from 'typescript-usd/usd'
import type { EsfJournal } from 'typescript-usd/esf'
import { EsfUsdSceneAdapter } from '../../src/sceneAdapter.ts'
import { EsfUsdStageData } from '../../src/stageData.ts'
import { StdBernoulliDistribution, StdMt19937 } from '../stdRandom.ts'

const P = (path: string): SdfPath => SdfPath.fromString(path)

// SdfPathVector as path strings, in order.
const vec = (paths: readonly SdfPath[]): string[] => paths.map(path => path.pathString)

// _MakePathSet (testEsfUsdConnectionTables.cpp:44-47): std::set<SdfPath>,
// as path strings in SdfPath order.
function _MakePathSet(paths: Iterable<SdfPath>): string[] {
  const unique = new Map<string, SdfPath>()
  for (const path of paths) {
    unique.set(path.pathString, path)
  }
  return [...unique.values()].sort(SdfPath.compare).map(path => path.pathString)
}

const set = (paths: readonly string[]): string[] => _MakePathSet(paths.map(P))

// Fixture::_NoticeListener (testEsfUsdConnectionTables.cpp:119-152).
class _NoticeListener extends EsfUsdStageData.ListenerBase {
  private _changedTargetPaths: SdfPathSet | null = null
  readonly _stageData: EsfUsdStageData

  constructor(stage: Stage) {
    super()
    this._stageData = EsfUsdStageData.registerStage(stage, this)
  }

  assertChangedTargets(expected: readonly string[]): void {
    const actual = _MakePathSet(this._changedTargetPaths ?? [])
    expect(actual).toEqual(set(expected))

    this._changedTargetPaths?.clear()
  }

  // Update the stage data in response to scene changes.
  _didObjectsChanged(
    _objectsChanged: UsdNotice.ObjectsChanged,
    newChangedTargetPaths: EsfUsdStageData.ChangedPathSet,
  ): void {
    this._changedTargetPaths = newChangedTargetPaths.clone()
  }
}

// Fixture (testEsfUsdConnectionTables.cpp:51-117).
class Fixture {
  stage!: Stage
  readonly journal: EsfJournal | null = null

  // Hold onto the payload layer when it is unloaded.
  private _payloadLayer!: Layer

  // We create multiple listeners (and stage datas) in order to verify that
  // they all are notified about connection target changes.
  private readonly _listeners: _NoticeListener[] = []

  static async create(layerIn?: Layer): Promise<Fixture> {
    const fixture = new Fixture()
    fixture._payloadLayer = Layer.createAnonymous('.usda')
    {
      const importedLayer = fixture._payloadLayer.importFromString(`
            #usda 1.0
            def Scope "Prim" (
            ) {
                int attr1.connect = [</Prim.attr2>]
                int attr2
                int attr3
            }
            `)
      expect(importedLayer).toBe(true)
    }

    // If a layer was passed in, use that as the root layer. Otherwise, use
    // a default layer that payloads in _payloadLayer.
    const rootLayer = ((): Layer => {
      if (layerIn) {
        return layerIn
      }

      const layer = Layer.createAnonymous('.usda')
      const importedLayer = layer.importFromString(`
            #usda 1.0
            over "Prim" (
                payload = @${fixture._payloadLayer.identifier}@</Prim>
            ) {
            }
            `)
      expect(importedLayer).toBe(true)

      return layer
    })()

    fixture.stage = await Stage.open(rootLayer)
    expect(fixture.stage).toBeTruthy()

    for (let i = 0; i < 1; ++i) {
      fixture._listeners.push(new _NoticeListener(fixture.stage))
    }

    const prim = fixture.stage.getPrim('/Prim')
    expect(prim && prim.isLoaded).toBe(true)
    return fixture
  }

  assertChangedTargets(expected: readonly string[]): void {
    for (const listener of this._listeners) {
      listener.assertChangedTargets(expected)
    }
  }
}

describe('testEsfUsdConnectionTables', () => {
  // Tests connection table updates in resonse to attribute connection edits.
  it('TestConnectionEdits', async () => {
    const fixture = await Fixture.create()
    const stage = EsfUsdSceneAdapter.adaptStage(fixture.stage)

    const prim = stage.Get().getPrimAtPath(P('/Prim'), fixture.journal)
    expect(prim.Get().isValid(fixture.journal)).toBe(true)

    const attr1 = stage.Get().getAttributeAtPath(P('/Prim.attr1'), fixture.journal)
    expect(attr1.Get().isValid(fixture.journal)).toBe(true)

    const attr2 = stage.Get().getAttributeAtPath(P('/Prim.attr2'), fixture.journal)
    expect(attr2.Get().isValid(fixture.journal)).toBe(true)

    const attr3 = stage.Get().getAttributeAtPath(P('/Prim.attr3'), fixture.journal)
    expect(attr3.Get().isValid(fixture.journal)).toBe(true)

    // Initially, there is a single authored connection.
    expect(vec(attr1.Get().getConnections(fixture.journal))).toEqual(['/Prim.attr2'])

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr1'])

    // Author another connection.
    fixture.stage.getAttributeAtPath('/Prim.attr3')!.addConnection('/Prim.attr2')

    fixture.assertChangedTargets(['/Prim.attr2'])

    expect(vec(attr3.Get().getConnections(fixture.journal))).toEqual(['/Prim.attr2'])

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(['/Prim.attr1', '/Prim.attr3'])

    // Remove the first connection.
    fixture.stage.getAttributeAtPath('/Prim.attr1')!.removeConnection('/Prim.attr2')

    fixture.assertChangedTargets(['/Prim.attr2'])

    expect(attr1.Get().getConnections(fixture.journal).length).toBe(0)

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr3'])

    // Author another connection on attr3.
    fixture.stage.getAttributeAtPath('/Prim.attr3')!.addConnection('/Prim.attr1')

    fixture.assertChangedTargets(['/Prim.attr1'])

    expect(vec(attr3.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim.attr2', '/Prim.attr1'])

    expect(vec(attr1.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr3'])

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr3'])

    // Change the order of the connections on attr3.
    fixture.stage.getAttributeAtPath('/Prim.attr3')!
      .setConnections(['/Prim.attr1', '/Prim.attr2'])

    fixture.assertChangedTargets([])

    expect(vec(attr3.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim.attr1', '/Prim.attr2'])

    expect(vec(attr1.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr3'])

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr3'])

    // Author a connection to a prim.
    fixture.stage.getAttributeAtPath('/Prim.attr1')!.addConnection('/Prim')

    fixture.assertChangedTargets(['/Prim'])

    expect(vec(attr1.Get().getConnections(fixture.journal))).toEqual(['/Prim'])

    expect(vec(prim.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr1'])
  })

  // Stocastically test changes to multiple connections targeting a single
  // attribute in response to activation changes on the owning prims.
  it('TestConnectionEditsStochastic', async () => {
    await Fixture.create()

    const rootLayer = Layer.createAnonymous('.usda')
    const importedLayer = rootLayer.importFromString(`
    #usda 1.0
    def Scope "Prim" {
    }
    `)
    expect(importedLayer).toBe(true)

    const fixture = await Fixture.create(rootLayer)

    const layerContents = `
    #usda 1.0
    def Scope "Prim" {
        int attr

        def Scope "Child1" {
        }

        def Scope "Child2" {
        }
    }
    `

    const stage = EsfUsdSceneAdapter.adaptStage(fixture.stage)

    // Compute the actual incoming connections on /Prim.attr for validation
    // below, by traversing all active, loaded, defined, non-abstract prims,
    // gathering their attributes, and building up the set of attributes
    // whose connections target it.
    const computeActualIncoming = (): string[] => {
      const actualIncoming: SdfPath[] = []

      for (const prim of fixture.stage.getPrim('/')!.getDescendants()) {
        for (const attr of prim.getAttributes()) {
          const targetPaths = attr.getConnections()
          if (targetPaths.length !== 0) {
            expect(targetPaths.length === 1 && targetPaths[0] === '/Prim.attr').toBe(true)
            actualIncoming.push(P(attr.getPath()))
          }
        }
      }

      return _MakePathSet(actualIncoming)
    }

    const numAttributes = 10
    const numIterations = 100

    for (let i = 0; i < numIterations; ++i) {
      // Re-initialize the root layer and create child attributes.
      fixture.stage.getRootLayer().importFromString(layerContents)
      {
        const child1 = fixture.stage.getRootLayer().getPrimAtPath(P('/Prim/Child1'))
        expect(child1).toBeTruthy()
        const child2 = fixture.stage.getRootLayer().getPrimAtPath(P('/Prim/Child2'))
        expect(child2).toBeTruthy()

        for (let attrI = 0; attrI < numAttributes; ++attrI) {
          let attrSpec = SdfAttributeSpec.new(child1, `attr${attrI}`, 'int')
          expect(attrSpec).toBeTruthy()
          attrSpec = SdfAttributeSpec.new(child2, `attr${attrI}`, 'int')
          expect(attrSpec).toBeTruthy()
        }
      }

      const attr = stage.Get().getAttributeAtPath(P('/Prim.attr'), fixture.journal)
      expect(attr.Get().isValid(fixture.journal)).toBe(true)

      // For each child attribute, we make a random decision whether or not
      // to make a connection so that we get a different set of incoming
      // connections on each iteration.
      const rng = new StdMt19937(i)
      const makeConnection = new StdBernoulliDistribution()

      for (let attrI = 0; attrI < numAttributes; ++attrI) {
        if (makeConnection.Sample(rng)) {
          fixture.stage.getAttributeAtPath(`/Prim/Child1.attr${attrI}`)!
            .addConnection('/Prim.attr')
        }
        if (makeConnection.Sample(rng)) {
          fixture.stage.getAttributeAtPath(`/Prim/Child2.attr${attrI}`)!
            .addConnection('/Prim.attr')
        }
      }

      // Validate that we compute the correct set of incoming connections for
      // /Prim.attr, then modify activation state for the child prims,
      // re-validating at each step.
      expect(_MakePathSet(attr.Get().getIncomingConnections(fixture.journal)))
        .toEqual(computeActualIncoming())

      await fixture.stage.getPrim('/Prim/Child1')!.setActive(false)
      expect(_MakePathSet(attr.Get().getIncomingConnections(fixture.journal)))
        .toEqual(computeActualIncoming())

      await fixture.stage.getPrim('/Prim/Child1')!.setActive(true)
      await fixture.stage.getPrim('/Prim/Child2')!.setActive(false)
      expect(_MakePathSet(attr.Get().getIncomingConnections(fixture.journal)))
        .toEqual(computeActualIncoming())

      await fixture.stage.getPrim('/Prim/Child1')!.setActive(true)
      await fixture.stage.getPrim('/Prim/Child2')!.setActive(true)
      expect(_MakePathSet(attr.Get().getIncomingConnections(fixture.journal)))
        .toEqual(computeActualIncoming())

      await fixture.stage.getPrim('/Prim/Child1')!.setActive(false)
      await fixture.stage.getPrim('/Prim/Child2')!.setActive(false)
      expect(_MakePathSet([])).toEqual(computeActualIncoming())
    }
  })

  // Tests connection table updates in response to prim resyncs.
  it('TestPrimResync', async () => {
    const fixture = await Fixture.create()
    const stage = EsfUsdSceneAdapter.adaptStage(fixture.stage)

    const attr1 = stage.Get().getAttributeAtPath(P('/Prim.attr1'), fixture.journal)
    expect(attr1.Get().isValid(fixture.journal)).toBe(true)

    const attr2 = stage.Get().getAttributeAtPath(P('/Prim.attr2'), fixture.journal)
    expect(attr2.Get().isValid(fixture.journal)).toBe(true)

    const attr3 = stage.Get().getAttributeAtPath(P('/Prim.attr3'), fixture.journal)
    expect(attr3.Get().isValid(fixture.journal)).toBe(true)

    // Initially, there is a single authored connection.
    expect(vec(attr1.Get().getConnections(fixture.journal))).toEqual(['/Prim.attr2'])

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal))).toEqual(['/Prim.attr1'])

    // Author another connection.
    fixture.stage.getAttributeAtPath('/Prim.attr3')!.addConnection('/Prim.attr2')

    fixture.assertChangedTargets(['/Prim.attr2'])

    expect(vec(attr3.Get().getConnections(fixture.journal))).toEqual(['/Prim.attr2'])

    expect(_MakePathSet(attr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set(['/Prim.attr1', '/Prim.attr3']))

    // Unload the root prim
    await fixture.stage.unload('/Prim')

    fixture.assertChangedTargets(['/Prim.attr2'])

    expect(!attr1.Get().isValid(fixture.journal)).toBe(true)
    expect(!attr2.Get().isValid(fixture.journal)).toBe(true)
    expect(!attr3.Get().isValid(fixture.journal)).toBe(true)

    // Load the root prim again
    await fixture.stage.load('/Prim')
    expect(attr1.Get().isValid(fixture.journal)).toBe(true)
    expect(attr2.Get().isValid(fixture.journal)).toBe(true)
    expect(attr3.Get().isValid(fixture.journal)).toBe(true)

    expect(fixture.stage.getPrim('/Prim')!.isLoaded).toBe(true)
    expect(fixture.stage.getPrim('/Prim')!.isActive).toBe(true)
    expect(fixture.stage.getPrim('/Prim')!.isDefined).toBe(true)
    expect(!fixture.stage.getPrim('/Prim')!.isAbstract).toBe(true)

    expect(vec(attr1.Get().getConnections(fixture.journal))).toEqual(['/Prim.attr2'])

    expect(vec(attr3.Get().getConnections(fixture.journal))).toEqual(['/Prim.attr2'])

    expect(_MakePathSet(attr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set(['/Prim.attr1', '/Prim.attr3']))

    // Import an empty root layer so that we get a resync for a prim that no
    // longer exists in the scene.
    const importedLayer = fixture.stage.getRootLayer().importFromString(`
            #usda 1.0
        `)
    expect(importedLayer).toBe(true)

    fixture.assertChangedTargets(['/Prim.attr2'])
    expect(!attr1.Get().isValid(fixture.journal)).toBe(true)
    expect(!attr2.Get().isValid(fixture.journal)).toBe(true)
    expect(!attr3.Get().isValid(fixture.journal)).toBe(true)
  })

  // Tests connection updates in response to resyncs on prims that have
  // descendant prims.
  it('TestMultiPrimResync', async () => {
    await Fixture.create()

    const rootLayer = Layer.createAnonymous('.usda')
    const importedLayer = rootLayer.importFromString(`
    #usda 1.0
    def Scope "Prim" {
        def Scope "Parent1" {
            int attr1.connect = [<.attr2>, </Prim/Parent2.attr2>]
            int attr2
            def Scope "Child" {
                int attr1.connect = [<.attr2>, </Prim/Parent2/Child.attr2>]
                int attr2
            }
        }
        def Scope "Parent2" {
            int attr1.connect = [<.attr2>, </Prim/Parent1.attr2>]
            int attr2
            def Scope "Child" {
                int attr1.connect = [<.attr2>, </Prim/Parent1/Child.attr2>]
                int attr2
            }
        }
    }
    `)
    expect(importedLayer).toBe(true)

    const fixture = await Fixture.create(rootLayer)

    const stage = EsfUsdSceneAdapter.adaptStage(fixture.stage)

    const attr1 = stage.Get().getAttributeAtPath(P('/Prim/Parent1.attr1'), fixture.journal)
    expect(attr1.Get().isValid(fixture.journal)).toBe(true)

    const attr2 = stage.Get().getAttributeAtPath(P('/Prim/Parent1.attr2'), fixture.journal)
    expect(attr2.Get().isValid(fixture.journal)).toBe(true)

    const childAttr1 = stage.Get().getAttributeAtPath(
      P('/Prim/Parent1/Child.attr1'), fixture.journal)
    expect(childAttr1.Get().isValid(fixture.journal)).toBe(true)

    const childAttr2 = stage.Get().getAttributeAtPath(
      P('/Prim/Parent1/Child.attr2'), fixture.journal)
    expect(childAttr2.Get().isValid(fixture.journal)).toBe(true)

    expect(vec(attr1.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1.attr2', '/Prim/Parent2.attr2'])

    expect(_MakePathSet(attr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set(['/Prim/Parent1.attr1', '/Prim/Parent2.attr1']))

    expect(vec(childAttr1.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1/Child.attr2', '/Prim/Parent2/Child.attr2'])

    expect(_MakePathSet(childAttr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set(['/Prim/Parent1/Child.attr1', '/Prim/Parent2/Child.attr1']))

    // Deactivate one branch.
    await fixture.stage.getPrim('/Prim/Parent2')!.setActive(false)

    fixture.assertChangedTargets([
      '/Prim/Parent1.attr2',
      '/Prim/Parent1/Child.attr2',
      '/Prim/Parent2.attr2',
      '/Prim/Parent2/Child.attr2'])

    expect(vec(attr1.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1.attr2', '/Prim/Parent2.attr2'])

    expect(vec(attr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1.attr1'])
    expect(vec(childAttr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1/Child.attr1'])

    // Add a connection to an inactive attribute.
    fixture.stage.getAttributeAtPath('/Prim/Parent2.attr1')!
      .addConnection('/Prim/Parent1/Child.attr2')

    fixture.assertChangedTargets([])

    expect(_MakePathSet(childAttr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set(['/Prim/Parent1/Child.attr1']))

    // Re-activate the branch.
    await fixture.stage.getPrim('/Prim/Parent2')!.setActive(true)

    fixture.assertChangedTargets([
      '/Prim/Parent1.attr2',
      '/Prim/Parent1/Child.attr2',
      '/Prim/Parent2.attr2',
      '/Prim/Parent2/Child.attr2'])

    expect(vec(attr1.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1.attr2', '/Prim/Parent2.attr2'])

    expect(_MakePathSet(attr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set(['/Prim/Parent1.attr1', '/Prim/Parent2.attr1']))

    expect(vec(childAttr1.Get().getConnections(fixture.journal)))
      .toEqual(['/Prim/Parent1/Child.attr2', '/Prim/Parent2/Child.attr2'])

    expect(_MakePathSet(childAttr2.Get().getIncomingConnections(fixture.journal)))
      .toEqual(set([
        '/Prim/Parent1/Child.attr1',
        '/Prim/Parent2/Child.attr1',
        '/Prim/Parent2.attr1']))

    // De-activate the other branch
    await fixture.stage.getPrim('/Prim/Parent1')!.setActive(false)

    fixture.assertChangedTargets([
      '/Prim/Parent1.attr2',
      '/Prim/Parent1/Child.attr2',
      '/Prim/Parent2.attr2',
      '/Prim/Parent2/Child.attr2'])

    expect(!attr1.Get().isValid(fixture.journal)).toBe(true)
    expect(!childAttr1.Get().isValid(fixture.journal)).toBe(true)

    {
      const attr1 = stage.Get().getAttributeAtPath(P('/Prim/Parent2.attr1'), fixture.journal)
      expect(attr1.Get().isValid(fixture.journal)).toBe(true)

      const attr2 = stage.Get().getAttributeAtPath(P('/Prim/Parent2.attr2'), fixture.journal)
      expect(attr2.Get().isValid(fixture.journal)).toBe(true)

      const childAttr1 = stage.Get().getAttributeAtPath(
        P('/Prim/Parent2/Child.attr1'), fixture.journal)
      expect(childAttr1.Get().isValid(fixture.journal)).toBe(true)

      const childAttr2 = stage.Get().getAttributeAtPath(
        P('/Prim/Parent2/Child.attr2'), fixture.journal)
      expect(childAttr2.Get().isValid(fixture.journal)).toBe(true)

      expect(vec(attr1.Get().getConnections(fixture.journal))).toEqual([
        '/Prim/Parent2.attr2',
        '/Prim/Parent1.attr2',
        '/Prim/Parent1/Child.attr2'])

      expect(vec(attr2.Get().getIncomingConnections(fixture.journal)))
        .toEqual(['/Prim/Parent2.attr1'])

      expect(vec(childAttr1.Get().getConnections(fixture.journal)))
        .toEqual(['/Prim/Parent2/Child.attr2', '/Prim/Parent1/Child.attr2'])

      expect(vec(childAttr2.Get().getIncomingConnections(fixture.journal)))
        .toEqual(['/Prim/Parent2/Child.attr1'])

      // Remove the spec for an attribute that owns connections.
      const layer = fixture.stage.getRootLayer()
      const prim = layer.getPrimAtPath(P('/Prim/Parent2/Child'))
      expect(prim).toBeTruthy()
      const attr = layer.getAttributeAtPath(P('/Prim/Parent2/Child.attr1'))
      expect(attr).toBeTruthy()
      prim!.removeProperty(attr!)

      fixture.assertChangedTargets([
        '/Prim/Parent1/Child.attr2',
        '/Prim/Parent2/Child.attr2'])

      expect(!childAttr1.Get().isValid(fixture.journal)).toBe(true)

      expect(vec(childAttr2.Get().getIncomingConnections(fixture.journal))).toEqual([])
    }
  })
})
