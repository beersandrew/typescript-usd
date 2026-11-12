// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/testenv/testUsdSkelCache.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelCache.py
// (registered as testUsdSkelCache). The testenv input
// testUsdSkelCache/populate.usda is copied unmodified into
// fixtures/testUsdSkelCache (Copyright 2017 Pixar, TOST 1.0,
// https://openusd.org/license).
//
// API mapping: a falsy query/schema is undefined or isValid() false;
// GetJointIndicesPrimvar().GetAttr().GetPath().GetPrimPath() is the
// primvar's primPath; ComputeSkelBinding(s) return the UsdSkelBinding(s).
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PrimDefaultPredicate, Stage, TraverseInstanceProxies } from 'typescript-usd/usd'
import { Animation, BindingAPI, Cache, Root, Skeleton } from '../../src/index.ts'

const testFile = fileURLToPath(new URL('./fixtures/testUsdSkelCache/populate.usda', import.meta.url))

const primPaths = (queries: { getPrim(): { path: string } }[]) => queries.map(q => q.getPrim().path)

describe('TestUsdSkelCache', () => {
  // Tests anim query retrieval.
  it('test_AnimQuery', () => {
    const cache = new Cache()

    const stage = Stage.createNew()

    const anim = Animation.define(stage, '/Anim')

    expect(cache.getAnimQuery(anim)).toBeTruthy()
    // Backwards-compatibility.
    expect(cache.getAnimQuery(anim.prim)).toBeTruthy()

    expect(cache.getAnimQuery(new Animation(undefined))).toBeFalsy()

    // TODO: Test query of anim behind instancing
  })

  // Tests for correctness in the interpretation of the inherited
  // skel:animationSource binding.
  it('test_InheritedAnimBinding', async () => {
    const stage = (await Stage.open(testFile))!

    const cache = new Cache()
    const root = new Root(stage.getPrim('/AnimBinding'))
    expect(cache.populate(root, PrimDefaultPredicate)).toBe(true)

    let query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/Scope/Inherit'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()!.getPrim().path).toBe('/Anim1')

    query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/Scope/Override'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()!.getPrim().path).toBe('/Anim2')

    query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/Scope/Block'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()).toBeFalsy()

    query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/Unbound'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()).toBeFalsy()

    query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/BoundToInactiveAnim'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()).toBeFalsy()

    // Ensure that the animationSource binding crosses instancing arcs.

    query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/Instance/Inherit'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()!.getPrim().path).toBe('/Anim1')

    query = cache.getSkelQuery(Skeleton.get(stage, '/AnimBinding/Instance/Override'))!
    expect(query).toBeTruthy()
    expect(query.getAnimQuery()!.getPrim().isInPrototype()).toBe(true)
  })

  // Tests for correctness in the interpretation of the inherited
  // skel:skeleton binding.
  it('test_InheritedSkeletonBinding', async () => {
    const stage = (await Stage.open(testFile))!

    const cache = new Cache()
    const root = new Root(stage.getPrim('/SkelBinding'))
    expect(cache.populate(root, PrimDefaultPredicate)).toBe(true)

    const skel1 = Skeleton.get(stage, '/Skel1')
    const skel2 = Skeleton.get(stage, '/Skel2')

    const binding1 = cache.computeSkelBinding(root, skel1, PrimDefaultPredicate)!
    expect(binding1.getSkeleton()!.path).toBe(skel1.path)
    expect(binding1.getSkinningTargets().length).toBe(1)
    const skinningQuery1 = binding1.getSkinningTargets()[0]!
    expect(skinningQuery1.getPrim().path).toBe('/SkelBinding/Scope/Inherit')
    // Inherited skinning properties.
    expect(skinningQuery1.getJointIndicesPrimvar()!.primPath).toBe('/SkelBinding/Scope')
    expect(skinningQuery1.getJointWeightsPrimvar()!.primPath).toBe('/SkelBinding/Scope')
    expect(skinningQuery1.getJointOrder()).toEqual(['scope'])
    // Non-inherited skinning properties.
    expect(skinningQuery1.getBlendShapesAttr()).toBeFalsy()
    expect(skinningQuery1.getBlendShapeTargetsRel()).toBeFalsy()

    const binding2 = cache.computeSkelBinding(root, skel2, PrimDefaultPredicate)!
    expect(binding2.getSkeleton()!.path).toBe(skel2.path)
    expect(binding2.getSkinningTargets().length).toBe(1)
    const skinningQuery2 = binding2.getSkinningTargets()[0]!
    expect(skinningQuery2.getPrim().path).toBe('/SkelBinding/Scope/Override')
    // Inherited skinning properties.
    expect(skinningQuery2.getPrim().path).toBe('/SkelBinding/Scope/Override')
    expect(skinningQuery2.getJointIndicesPrimvar()!.primPath).toBe('/SkelBinding/Scope/Override')
    expect(skinningQuery2.getJointWeightsPrimvar()!.primPath).toBe('/SkelBinding/Scope/Override')
    expect(skinningQuery2.getJointOrder()).toEqual(['override'])
    expect(skinningQuery2.getBlendShapeOrder()).toEqual(['shape'])
    // Non-inherited skinning properties.
    expect(skinningQuery2.getBlendShapesAttr()!.primPath).toBe('/SkelBinding/Scope/Override')
    expect(skinningQuery2.getBlendShapeTargetsRel()!.getPath().split('.')[0])
      .toBe('/SkelBinding/Scope/Override')

    const allBindings = cache.computeSkelBindings(root, PrimDefaultPredicate)
    // Expecting two resolved bindings. This should *not* include bindings
    // for any inactive skels or instances
    expect(allBindings.length).toBe(2)

    expect(binding1.getSkeleton()!.path).toBe(allBindings[0]!.getSkeleton()!.path)
    expect(primPaths(binding1.getSkinningTargets()))
      .toEqual(primPaths(allBindings[0]!.getSkinningTargets()))

    expect(binding2.getSkeleton()!.path).toBe(allBindings[1]!.getSkeleton()!.path)
    expect(primPaths(binding2.getSkinningTargets()))
      .toEqual(primPaths(allBindings[1]!.getSkinningTargets()))
  })

  // Tests for correctness in the interpretation of the inherited
  // skel:skeleton binding with instancing.
  it('test_InstancedSkeletonBinding', async () => {
    const stage = (await Stage.open(testFile))!

    let cache = new Cache()

    const root = new Root(stage.getPrim('/SkelBinding'))
    expect(cache.populate(root, TraverseInstanceProxies())).toBe(true)

    const skel1 = Skeleton.get(stage, '/Skel1')
    const binding1 = cache.computeSkelBinding(root, skel1, TraverseInstanceProxies())!
    expect(binding1.getSkeleton()!.path).toBe(skel1.path)
    expect(binding1.getSkinningTargets().length).toBe(2)
    const skinningQuery1 = binding1.getSkinningTargets()[1]!
    expect(skinningQuery1.getPrim().path).toBe('/SkelBinding/Instance/Inherit')
    // Inherited skinning properties.
    expect(skinningQuery1.getJointIndicesPrimvar()!.primPath).toBe('/SkelBinding/Instance')
    expect(skinningQuery1.getJointWeightsPrimvar()!.primPath).toBe('/SkelBinding/Instance')
    expect(skinningQuery1.getJointOrder()).toEqual(['instance'])
    // Non-inherited skinning properties.
    expect(skinningQuery1.getBlendShapesAttr()).toBeFalsy()
    expect(skinningQuery1.getBlendShapeTargetsRel()).toBeFalsy()

    const allBindings = cache.computeSkelBindings(root, TraverseInstanceProxies())
    // Expecting three resolved bindings. This should *not* include bindings
    // for any inactive skels, but does include instances
    expect(allBindings.length).toBe(3)

    const skel2 = Skeleton.get(stage, '/SkelBinding/Instance/Skel')
    const binding2 = cache.computeSkelBinding(root, skel2, TraverseInstanceProxies())!

    expect(binding2.getSkeleton()!.path).toBe(allBindings[2]!.getSkeleton()!.path)
    expect(primPaths(binding2.getSkinningTargets()))
      .toEqual(primPaths(allBindings[2]!.getSkinningTargets()))

    const inheritBindingMesh = stage.getPrim('/SkelBinding/Instance/Inherit')!

    const overrideBindingMesh = stage.getPrim('/SkelBinding/Instance/Override')!

    // Instances should not be discoverable with a default predicate.
    cache = new Cache()
    cache.populate(root, PrimDefaultPredicate)

    expect(cache.getSkinningQuery(inheritBindingMesh)).toBeFalsy()
    expect(cache.getSkinningQuery(overrideBindingMesh)).toBeFalsy()

    // Need to explicitly traverse instance prototypes to see these bindings.
    cache.populate(root, TraverseInstanceProxies())

    let query = cache.getSkinningQuery(inheritBindingMesh)!
    expect(query).toBeTruthy()
    expect(query.getJointOrder()).toEqual(['instance'])

    query = cache.getSkinningQuery(overrideBindingMesh)!
    expect(query).toBeTruthy()
    expect(query.getJointOrder()).toEqual(['override'])
    expect(query.getBlendShapeOrder()).toEqual(['override'])
  })

  // Tests for correctness in the interpretation of instanced blend shapes.
  it('test_InstancedBlendShape', async () => {
    const stage = (await Stage.open(testFile))!
    const cache = new Cache()
    const skelRoot = new Root(stage.getPrim('/SkelBinding'))
    expect(cache.populate(skelRoot, TraverseInstanceProxies())).toBe(true)

    // instance proxy mesh
    const mesh = stage.getPrim('/SkelBinding/Instance/Override')!
    const skelBinding = new BindingAPI(mesh)
    expect([...(skelBinding.getBlendShapesAttr().get() as Iterable<string>)]).toEqual(['override'])

    const skel = skelBinding.getSkeleton()
    const skelq = cache.getSkelQuery(skel)!
    const animq = skelq.getAnimQuery()!
    expect(animq.getBlendShapeOrder()).toEqual(['override', 'shape'])

    const skinq = cache.getSkinningQuery(mesh)!
    expect(skinq.hasBlendShapes()).toBe(true)
    expect(skelBinding.getInheritedAnimationSource()?.path).toBe('/Anim1')

    // bug PRES-77530
    // because skelBinding.GetBlendShapesAttr().Get() and
    // animq.GetBlendShapeOrder() have different order,
    // the mapper should not be null.
    const mapper = skinq.getBlendShapeMapper()!
    expect(mapper.isNull()).toBe(false)
  })
})
