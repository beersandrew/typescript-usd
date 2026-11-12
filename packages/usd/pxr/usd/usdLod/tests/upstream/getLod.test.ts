// Ported from OpenUSD 26.11.1: pxr/usd/usdLod/testenv/testUsdLodGetLod.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLod/testenv/testUsdLodGetLod.cpp
//
// The C++ test is a single RunTest() whose CheckLOD calls each TF_VERIFY one
// expectation; each CheckLOD is an expect() here, in upstream order.
import { describe, expect, it } from 'vitest'
import { Stage, TimeCode as UsdTimeCode, type Prim } from 'typescript-usd/usd'
import { Frustum, Matrix4d, Vec3f } from 'typescript-usd/gf'
import {
  DistanceHeuristic, Heuristic, OverrideAPI, RootAPI, ScreenSizeHeuristic, Tokens as UsdLodTokens,
} from 'typescript-usd/usdLod'

// Magic values for convenient return from GetLODForPrim. These represent an
// error or an override that wants to show no LOD items or all LOD items.
const INVALID_LOD = -999.0
const NO_LOD = -998.0
const ALL_LOD = -997.0

class GetLODTest {
  frustum = new Frustum()
  transform = new Matrix4d(1.0)
  time = UsdTimeCode.Default()

  getLODForPrim(prim: Prim, targetDomain: string): number {
    const rootAPI = new RootAPI(prim)
    if (!rootAPI.isValid()) {
      return INVALID_LOD
    }

    // ComputeLODOverride will walk up the hierarchy to search for an
    // override to inherit.
    const [overrideMode, overrideIndex] = new OverrideAPI(prim).computeLODOverride()

    if (overrideMode !== UsdLodTokens.noOverride) {
      if (overrideMode === UsdLodTokens.indexedLOD) {
        return overrideIndex!
      } else if (overrideMode === UsdLodTokens.noLOD) {
        return NO_LOD
      } else if (overrideMode === UsdLodTokens.allLOD) {
        return ALL_LOD
      } else {
        return INVALID_LOD
      }
    }

    const targetPaths = rootAPI.getLodHeuristicsRel().getForwardedTargets()

    for (const path of targetPaths) {
      const targetPrim = prim.getStage().getPrim(path)
      const heuristic = new Heuristic(targetPrim)
      // UsdSchemaBase::GetLodDomainAttr on a prim without the attribute
      // yields an invalid UsdAttribute whose Get fails.
      const lodDomainAttr = heuristic.getLodDomainAttr() as ReturnType<Heuristic['getLodDomainAttr']> | undefined

      // We're only interested in targetDomain heuristics
      const domain = lodDomainAttr?.getValueAtTime(this.time)
      if (typeof domain !== 'string' || domain !== targetDomain) {
        // Not a targetDomain heuristic
        continue
      }

      // Check for known heuristic types.
      const distHeuristic = new DistanceHeuristic(heuristic.prim)
      const sizeHeuristic = new ScreenSizeHeuristic(heuristic.prim)
      if (distHeuristic.isValid()) {
        return distHeuristic.computeLOD(this.frustum.getPosition(), this.transform, this.time)
      } else if (sizeHeuristic.isValid()) {
        return sizeHeuristic.computeLOD(this.frustum, this.transform, this.time)
      } else {
        // Unknown heuristic type!
        continue
      }
    }

    const index = rootAPI.getLodDefaultIndexAttr().getValueAtTime(this.time)
    if (typeof index === 'number') {
      return Math.fround(index)
    }

    return INVALID_LOD
  }

  // CheckLOD(prim, float expected, msg): `expected` is a float parameter.
  checkLOD(prim: Prim, expected: number, msg: string): void {
    const lodIndex = this.getLODForPrim(prim, UsdLodTokens.imaging)
    expect(lodIndex, `Failed ${msg}`).toBe(Math.fround(expected))
  }
}

describe('testUsdLodGetLod', () => {
  it('RunTest', () => {
    const test = new GetLODTest()

    const stage = Stage.createNew()
    const world = stage.definePrim('/World', 'Scope')
    const rootPrim = stage.definePrim('/World/Root', 'Scope')
    const rootAPI = RootAPI.apply(rootPrim)

    const lodHeuristics = rootAPI.getLodHeuristicsRel()

    // Set a default LOD and verify that it worked.
    rootAPI.getLodDefaultIndexAttr().set(2)
    test.checkLOD(rootPrim, 2.0, 'basic default test')

    // Define a heuristics scope and put something random in it.
    const random = stage.definePrim('/World/Heuristics/random', 'Scope')
    lodHeuristics.addTarget(random.path)

    // Still 2.0?
    test.checkLOD(rootPrim, 2.0, 'junk heuristic test')

    // Add real heuristics but using "audio" domain.
    const dist = DistanceHeuristic.define(stage, '/World/Heuristics/dist')

    dist.getLodDomainAttr().set(UsdLodTokens.audio)
    dist.getCenterAttr().set(new Vec3f(0.0, 0.0, -5.0))
    dist.getThresholdsAttr().set([4.0, 10.0])
    dist.getBlendThresholdsAttr().set([6.0, 12.0])
    lodHeuristics.addTarget(dist.path)

    // Still 2.0?
    test.checkLOD(rootPrim, 2.0, 'audio distance heuristic')

    const size = ScreenSizeHeuristic.define(stage, '/World/Heuristics/size')

    size.getLodDomainAttr().set(UsdLodTokens.audio)
    size.getExtentAttr().set([new Vec3f(0.0, 0.0, -4.0), new Vec3f(2.0, 2.0, -2.0)])
    size.getThresholdsAttr().set([0.99, 0.30, 0.10])
    size.getBlendThresholdsAttr().set([0.75, 0.20])
    size.getProjectionMethodAttr().set(UsdLodTokens.projectedExtent)
    lodHeuristics.addTarget(size.path)

    // Still 2.0?
    test.checkLOD(rootPrim, 2.0, 'audio screen-size heuristic')

    // Swap the screen-size heuristic to the imaging domain
    size.getLodDomainAttr().set(UsdLodTokens.imaging)
    // Now we expect 1.5.
    test.checkLOD(rootPrim, 1.5, 'imaging screen-size heuristic')

    // Switch the frustum to orthographic. The screen size should now be 100%
    test.frustum.setProjectionType(Frustum.Orthographic)
    test.checkLOD(rootPrim, 0.0, 'orthographic frustum')

    // Swap the distance heuristic to imaging as well. Our fake "renderer"
    // prefers the distance heuristic because it is the first targeted
    // imaging heuristic.
    dist.getLodDomainAttr().set(UsdLodTokens.imaging)
    // Now we expect 0.5 as it transitions from 0 to 1.
    test.checkLOD(rootPrim, 0.5, 'imaging distance heuristic')

    // Switch back to perspective so the return value is more verifiable.
    test.frustum.setProjectionType(Frustum.Perspective)

    // Finally verify LODOverrideAPI
    const overrideAPI = OverrideAPI.apply(world)
    overrideAPI.getLodOverrideIndexAttr().set(3.14159)

    // Nothing mode has been authored so nothing should change.
    test.checkLOD(rootPrim, 0.5, 'empty override API')

    // Set the override mode to No LOD
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.noLOD)
    test.checkLOD(rootPrim, NO_LOD, 'override to noLOD')

    // Set the override mode to All LOD
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.allLOD)
    test.checkLOD(rootPrim, ALL_LOD, 'override to allLOD')

    // Set the override mode to Indexed
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.indexedLOD)
    test.checkLOD(rootPrim, 3.14159, 'override to indexed (3.14159)')

    // Set the override mode to inherited which does not override
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.inherited)
    test.checkLOD(rootPrim, 0.5, 'override to inherited')

    // Set it back to pi
    overrideAPI.getLodOverrideModeAttr().set(UsdLodTokens.indexedLOD)
    test.checkLOD(rootPrim, 3.14159, 'override to indexed again (3.14159)')

    // Remove the override
    world.removeAPI(OverrideAPI.typeName)
    test.checkLOD(rootPrim, 0.5, 'after remove override API')
  })
})
