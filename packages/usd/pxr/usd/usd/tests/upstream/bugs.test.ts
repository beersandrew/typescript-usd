// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdBugs.py,
//  pxr/usd/usd/collectionMembershipQuery.cpp
// Copyright 2017, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Port of pxr/usd/usd/testenv/testUsdBugs.py
//
// A grab-bag of narrow regression tests for specific historical bugs. The
// subtests reproducible through the typescript-usd/usd surface (Stage.open /
// createNew / definePrim / attr / relationships / native instancing) are
// ported green; expectations pinned against Pixar 26.05 python on the
// identical scenes. The second describe holds adapted reproducers of the
// remaining subtests.
import { beforeEach, describe, expect, it } from 'vitest'
import { postedErrors } from '../../../../testing/postedErrors.ts'
import { CollectionAPI, Stage, StagePopulationMask } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArInMemoryResolver, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { AttributeSpec, Layer, PathExpression, Payload, Reference, RelationshipSpec, sdfChangeBlock, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Error as TfError } from 'typescript-usd/tf'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const name = assetPath.split('/').pop() ?? assetPath
    return new ArResolvedPath(files[name] === undefined ? '' : assetPath)
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const name = path.toString().split('/').pop() ?? path.toString()
    const text = files[name]
    return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

describe('testUsdBugs (reproducible subtests)', () => {
  it('test_157758: array attribute Set/Get round-trips through nested sequences', () => {
    // Set float3 array values and read them back unchanged.
    const stage = Stage.createNew()
    const p = stage.definePrim('/testPrim')
    const a = p.attr('points')
    a.set([[1, 2, 3], [2, 3, 4], [3, 4, 5]])
    expect(stage.get('/testPrim.points')?.getValue())
      .toEqual([[1, 2, 3], [2, 3, 4], [3, 4, 5]])
    a.set([[3, 2, 1], [4, 3, 2], [5, 4, 3]])
    expect(stage.get('/testPrim.points')?.getValue())
      .toEqual([[3, 2, 1], [4, 3, 2], [5, 4, 3]])
  })

  it('test_USD_4936: relationships resolve correctly through nested instancing', async () => {
    // Two levels of instancing; a relationship authored inside the innermost
    // referenced prim must resolve to the instance-proxy path, not double up
    // the final component.
    files = {
      'root.usda': `#usda 1.0
def "W"
{
    def "A" (
        instanceable = true
        prepend references = </M>
    )
    {
    }
}

def "M"
{
    def "B" (
        instanceable = true
        prepend references = </M2>
    )
    {
    }
}

def "M2"
{
    rel r = </M2/D>
    def "D"
    {
    }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    // /W/A/B is a nested instance, so its relationship data lives in a
    // prototype; read it through the prim handle (which resolves the proxy).
    const rel = stage.getPrim('/W/A/B')!.getAttr('r')
    expect(rel?.isRelationship).toBe(true)
    // Pixar 26.05: GetTargets() -> [Sdf.Path('/W/A/B/D')]
    // (prior to the fix the target was '/W/A/B/B/D').
    expect(rel?.getTargets()).toEqual(['/W/A/B/D'])
  })

  it('test_USD_5045: querying a path with no prim yields an invalid (absent) prim', () => {
    // github #753: operating on a null/invalid prim must not silently succeed.
    // typescript-usd has no null-Prim constructor; the observable analog is that
    // GetPrimAtPath on an undefined path returns no prim at all.
    const stage = Stage.createNew()
    expect(stage.getPrim('/doesNotExist')).toBeUndefined()
    expect(stage.has('/doesNotExist')).toBe(false)
  })

  it('test_153956', () => {
    // Create a crate-backed .usd file and populate it with an
    // attribute connection. These files do not store specs for
    // targets/connections, so there will be an entry in the
    // connectionChildren list but no corresponding spec.
    const layer = Layer.createAnonymous('.usd')
    let primSpec = sdfCreatePrimInLayer(layer, '/Test')!
    let attrSpec = AttributeSpec.new(primSpec, 'attr', 'float')!

    // -- Adding item to prependedItems list..."
    attrSpec.getConnectionPathList().getPrependedItems().append('/Test.prependedItem')

    // Transfer the contents of the crate-backed .usd file into an
    // memory-backed .usda file. These file *do* store specs for
    // targets/connections.
    const newLayer = Layer.createAnonymous('.usda')
    newLayer.transferContent(layer)

    primSpec = newLayer.getPrimAtPath('/Test')!
    attrSpec = primSpec.getProperties().get('attr') as AttributeSpec

    // Adding an item to the explicitItems list changes to listOp to
    // explicit mode, but does not clear any existing connectionChildren.
    attrSpec.getConnectionPathList().getExplicitItems().append('/Test.explicitItem')

    // Prior to the fix, this caused a failed verify b/c an entry exists in
    // the connectionChildren list for which there is no corresponding spec.
    primSpec.setName('Test2')
  })

  it('test_141718', () => {
    const crateLayer = Layer.createAnonymous('.usdc')
    const prim = sdfCreatePrimInLayer(crateLayer, '/Prim')!
    const rel = RelationshipSpec.new(prim, 'myRel', false)!
    rel.getTargetPathList().getExplicitItems().append('/Prim2')
    const asciiLayer = Layer.createAnonymous('.usda')
    asciiLayer.transferContent(crateLayer)
    const p = asciiLayer.getPrimAtPath('/Prim')!
    p.removeProperty(p.getRelationships().get('myRel')!)
  })

  it('test_USD_11430', () => {
    // We used to potentially access nonexistent prims if callers created
    // collections on one stage and then tried to use them to match objects
    // on other stages.  Now we check this case and raise an error.
    const stage1 = Stage.createNew()
    const scope = stage1.definePrim('/Scope')
    const targetColl = CollectionAPI.apply(scope, 'target')
    targetColl.getMembershipExpressionAttr().set(new PathExpression('//{abstract}'))

    const stage2 = Stage.createNew()
    const classPrim = stage2.definePrim('/Class')
    classPrim.setSpecifier('class')
    stage2.definePrim('/World')
    stage2.definePrim('/World/anim')
    stage2.definePrim('/World/sets')

    const query = targetColl.computeMembershipQuery()
    // Tf.ErrorException in python; TF_CODING_ERROR at
    // collectionMembershipQuery.cpp:197.
    expect(() => CollectionAPI.computeIncludedPaths(query, stage2)).toThrow(TfError)
    expect(() => CollectionAPI.computeIncludedPaths(query, stage2)).toThrow(/^Stage mismatch/)
  })
  it('test_PIPE_6232', async () => {
    // This interaction between nested instancing, load/unload, activation,
    // and inherits triggered a corruption of instancing data structures and
    // ultimately a crash bug in the USD core.
    const lpay = Layer.createAnonymous('.usda')
    lpay.importFromString(`#usda 1.0
def "innerM" (
    instanceable = true
    inherits = </_someClass>
)
{
}
`)
    const l = Layer.createAnonymous('.usda')
    l.importFromString(`#usda 1.0
def "outerM" ( instanceable = true )
{
    def "inner" ( payload = @${lpay.identifier}@</innerM> )
    {
    }
}
def "World"
{
    def "i" ( prepend references = </outerM> )
    {
    }
}
def "OtherWorld"
{
    def "i" ( prepend references = </outerM> )
    {
    }
}`)
    const s = await Stage.open(l, { loadPayloads: false })
    // === Load /World/i and /OtherWorld/i ===
    await s.load('/World/i')
    await s.load('/OtherWorld/i')
    // === Deactivate /World ==='
    await s.getPrim('/World')!.setActive(false)
    // === Create class /_someClass ==='
    s.createClassPrim('/_someClass')
    await s.flushChanges()
    const p = s.getPrim('/OtherWorld/i/inner')!
    expect(p.isInstance()).toBe(true)
    expect(p.getPrototype()).toBeTruthy()
  })
  it('test_155392', async () => {
    // Usd should maintain load state across instancing changes.
    const l1 = Layer.createAnonymous('.usda')
    const l2 = Layer.createAnonymous('.usda')

    sdfCreatePrimInLayer(l2, '/xpay')
    sdfCreatePrimInLayer(l2, '/ypay')

    const p1 = sdfCreatePrimInLayer(l1, '/p1')!
    p1.setSpecifier('def')
    p1.getReferenceList().add(new Reference('', '/x'))

    const p2 = sdfCreatePrimInLayer(l1, '/p2')!
    p2.setSpecifier('def')
    p2.getReferenceList().add(new Reference('', '/x'))

    const x = sdfCreatePrimInLayer(l1, '/x')!
    x.setInstanceable(true)
    x.setSpecifier('def')
    x.getPayloadList().getExplicitItems().append(new Payload(l2.identifier, '/xpay'))

    const y = sdfCreatePrimInLayer(l1, '/x/y')!
    y.setSpecifier('def')
    x.getPayloadList().getExplicitItems().append(new Payload(l2.identifier, '/ypay'))

    const s = await Stage.open(l1, { loadPayloads: true })
    const allLoaded = (stage: Stage, paths: string[]) =>
      paths.every(path => stage.getPrim(path)!.isLoaded)
    const sPaths = ['/p1', '/p1/y', '/p2', '/p2/y']

    expect(allLoaded(s, sPaths)).toBe(true)

    // Now uninstance, and assert that load state is preserved.
    s.getPrim('/p2')!.setInstanceable(false)
    await s.flushChanges()

    expect(allLoaded(s, sPaths)).toBe(true)

    // Reinstance /p2 for next test.
    s.getPrim('/p2')!.setInstanceable(true)
    await s.flushChanges()

    expect(allLoaded(s, sPaths)).toBe(true)

    // Now do the same but nested-instance everything.
    const l3 = Layer.createAnonymous('.usda')
    l3.setComment('l3')

    const outer = sdfCreatePrimInLayer(l3, '/outer')!
    outer.setSpecifier('def')
    outer.setInstanceable(true)

    const outerc = sdfCreatePrimInLayer(l3, '/outer/c')!
    outerc.setSpecifier('def')
    outerc.getReferenceList().add(new Reference(l1.identifier, '/p1'))

    const i1 = sdfCreatePrimInLayer(l3, '/i1')!
    i1.setSpecifier('def')
    i1.getReferenceList().add(new Reference('', '/outer'))

    const i2 = sdfCreatePrimInLayer(l3, '/i2')!
    i2.setSpecifier('def')
    i2.getReferenceList().add(new Reference('', '/outer'))

    const s2 = await Stage.open(l3, { loadPayloads: true })
    const s2Paths = ['/i1', '/i1/c', '/i1/c/y', '/i2', '/i2/c', '/i2/c/y']

    expect(allLoaded(s2, s2Paths)).toBe(true)

    // Uninstance outer.
    s2.getPrim('/i1')!.setInstanceable(false)
    await s2.flushChanges()

    expect(allLoaded(s2, s2Paths)).toBe(true)

    // Uninstance inner.
    s2.getPrim('/i1/c')!.setInstanceable(false)
    await s2.flushChanges()

    expect(allLoaded(s2, s2Paths)).toBe(true)
  })
  it('test_156222', async () => {
    // Test that removing all instances for a prototype prim and adding a new
    // instance with the same instancing key as the prototype causes the new
    // instance to be assigned to the prototype.
    const l = Layer.createAnonymous('.usda')
    sdfCreatePrimInLayer(l, '/Ref')

    // The bug is non-deterministic because of threaded composition,
    // but it's easier to reproduce with more instance prims.
    const numInstancePrims = 50
    const instancePrimPaths = Array.from(
      { length: numInstancePrims }, (_, i) => `/Instance_${i}`)
    for (const path of instancePrimPaths) {
      const instancePrim = sdfCreatePrimInLayer(l, path)!
      instancePrim.setInstanceable(true)
      instancePrim.getReferenceList().add(new Reference('', '/Ref'))
    }

    const nonInstancePrim = sdfCreatePrimInLayer(l, '/NonInstance')!
    nonInstancePrim.getReferenceList().add(new Reference('', '/Ref'))

    const s = await Stage.open(l)
    expect(s.getPrototypes().length).toBe(1)

    // Check that the prototype prim is using one of the instanceable prim
    // index for its source.
    let prototype = s.getPrototypes()[0]!
    const prototypePath = prototype.path
    expect(instancePrimPaths).toContain(
      prototype._getSourcePrimIndex().getRootNode().path.pathString)

    // In a single change block, uninstance all of the instanceable prims,
    // but mark the non-instance prim as instanceable.
    sdfChangeBlock(() => {
      for (const path of instancePrimPaths) {
        l.getPrimAtPath(path)!.setInstanceable(false)
      }
      nonInstancePrim.setInstanceable(true)
    })
    await s.flushChanges()

    // This should not cause a new prototype prim to be generated; instead,
    // the prototype prim should now be using the newly-instanced prim index
    // as its source.
    prototype = s.getPrototypes()[0]!
    expect(prototype.path).toBe(prototypePath)
    expect(prototype._getSourcePrimIndex().getRootNode().path.pathString)
      .toBe(nonInstancePrim.getPath().pathString)
  })
})

describe('testUsdBugs (masking, activation, file and muting subtests)', () => {
  // Usd.Stage.OpenMasked / Usd.StagePopulationMask stress: a mask beneath
  // an instance must not crash, and the mask-included instance populates.
  it('test_160884: OpenMasked with a mask beneath an instance', async () => {
    files = {
      'root.usda': `#usda 1.0
def Sphere "test" {
    def Scope "scope1" {}
}
def Scope "Location" {
    def "asset1" (
        instanceable = true
        references = </test>
    ) {}
}
`,
    }
    const stage = (await Stage.openMasked(
      'root.usda', new StagePopulationMask(['/Location/asset1/scope1'])))!
    expect(stage.getPrim('/Location/asset1')).toBeTruthy()
  })

  // SetActive(True) on a deactivated ancestor auto-includes descendant
  // payloads. typescript-usd has no load/unload distinction at all — every payload
  // always composes — so once the ancestor is reactivated its whole subtree
  // (including previously-invisible payload-arc descendants) reappears. That
  // IS the observable this bug guards, and it's exercisable with real API.
  it('test_USD_4712: activation auto-includes descendant payloads', async () => {
    files = {
      'root.usda': `#usda 1.0
def "shot" {
    def "camera" {
        def "cache" (
            active = false
            payload = @./pay.usda@</cam_extra>
        )
        {
            def "cam" (
                payload = @./pay.usda@</cam>
            )
            {
            }
        }
    }
}
`,
      'pay.usda': `#usda 1.0
def "cam_extra" {
    def "cache_payload" {}
}
def "cam" {
    def "cam_payload" {}
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    // The deactivated prim itself stays (inactive), but its whole subtree —
    // payloads included — is pruned from the stage.
    expect(stage.getPrim('/shot/camera/cache')!.isActive).toBe(false)
    expect(stage.getPrim('/shot/camera/cache/cache_payload')).toBeUndefined()
    expect(stage.getPrim('/shot/camera/cache/cam')).toBeUndefined()

    const cache = stage.definePrim('/shot/camera/cache')
    await cache.setActive(true)
    await stage.flushChanges()

    expect(stage.getPrim('/shot/camera/cache')!.isActive).toBe(true)
    expect(stage.getPrim('/shot/camera/cache/cache_payload')).toBeDefined()
    expect(stage.getPrim('/shot/camera/cache/cam/cam_payload')).toBeDefined()
  })

  // Crate file truncation corruption detection. Build a real crate via
  // exportToUsdc(), truncate it, and feed the truncated bytes back through
  // both the raw parser and Stage.open — mirrors the pattern in
  // usdcBugGHSA02.test.ts for the security-regression suite.
  it('test_USD_5196: truncated .usdc fails to open with an error', async () => {
    const stage = Stage.createNew()
    const p = stage.definePrim('/foo')
    p.attr('attr').set(Array.from({ length: 1024 }, (_, i) => i))
    const bytes = stage.exportToUsdc()
    const truncated = bytes.slice(0, Math.floor(bytes.length / 2))

    expect(() => Layer.fromBytes(truncated, 'corrupt.usdc')).toThrow()

    const resolver = new ArInMemoryResolver({ 'root.usdc': truncated })
    // The open yields no stage and posts errors (Tf.ErrorException natively).
    const { result: opened, errors } = await postedErrors(() => Stage.open('root.usdc', { resolverContext: _resolverContextForResolver(resolver) }))
    expect(opened).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })

  // MuteAndUnmuteLayers across two stages sharing a payload+sublayer graph.
  // muteAndUnmuteLayers + payload/sublayer composition ARE both on the
  // surface; exercise the real regression shape (mute a shared sublayer,
  // observe it drop from both dependent stages, unmute, observe it return).
  it('test_USD_5386: mute/unmute with shared sublayer+payload graphs', async () => {
    files = {
      'c.usda': `#usda 1.0
def Xform "geo" {
    def Sphere "sphere1" {}
}
`,
      'a.usda': `#usda 1.0
(
    subLayers = [@./c.usda@]
)
def Xform "geo" {
    def Cube "cube2" {}
}
`,
      'sceneA.usda': `#usda 1.0
def "geo" (append payload = @./a.usda@</geo>) {}
`,
      'sceneB.usda': `#usda 1.0
def "geo" (append payload = @./a.usda@</geo>) {}
`,
    }
    const stageA = (await Stage.open('sceneA.usda'))!
    const stageB = (await Stage.open('sceneB.usda'))!
    expect(stageA.getPrim('/geo/sphere1')).toBeDefined()
    expect(stageB.getPrim('/geo/sphere1')).toBeDefined()

    await stageA.muteAndUnmuteLayers(['./c.usda'], [])
    await stageB.muteAndUnmuteLayers(['./c.usda'], [])
    expect(stageA.getPrim('/geo/sphere1')).toBeUndefined()
    expect(stageB.getPrim('/geo/sphere1')).toBeUndefined()
    // Both stages keep composing their non-muted content without crashing.
    expect(stageA.getPrim('/geo/cube2')).toBeDefined()
    expect(stageB.getPrim('/geo/cube2')).toBeDefined()

    await stageA.muteAndUnmuteLayers([], ['./c.usda'])
    expect(stageA.getPrim('/geo/sphere1')).toBeDefined()
    // stageB's mute state is independent of stageA's.
    expect(stageB.getPrim('/geo/sphere1')).toBeUndefined()
  })

  // Population masks descendant to instances (non-nested and nested).
  it('test_USD_5709: population masks beneath instances', async () => {
    files = {
      'root.usda': `#usda 1.0
def Sphere "test" {
    def Scope "scope1" {}
    def Scope "scope2" {}
}
def Scope "Model" (
    instanceable = true
    payload = </test>
) {}
def "M1" (append references = </Model>) {}
`,
    }
    const stage = (await Stage.openMasked(
      'root.usda', new StagePopulationMask(['/M1/scope2'])))!
    expect(stage.getPrim('/M1')).toBeTruthy()
  })
})
