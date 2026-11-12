// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/cache.cpp,
//  pxr/usd/usdSkel/skeletonQuery.cpp, pxr/usd/usdSkel/skinningQuery.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.08 reference capture for the arm asset registered by
// pxr/usdImaging/usdImagingGL/CMakeLists.txt:3625-3634. The query behavior
// follows pxr/usd/usdSkel/{cache,skeletonQuery,skinningQuery}.cpp.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { _sdfPlainValue } from 'typescript-usd/sdf/_internal'
import { Stage } from 'typescript-usd/usd'
import { Boundable, PointBased } from 'typescript-usd/usdGeom'
import {
  Cache, type SkeletonQuery, type SkinningQuery,
} from '../../src/index.ts'

interface Reference {
  provenance: { openUsdVersion: string; asset: string; assetSha256: string }
  tolerances: {
    matrixAbsolute: number
    pointAbsolute: number
    normalAbsolute: number
    boundAbsolute: number
  }
  times: number[]
  authoredNormals: number[][]
  topology: { joints: string[]; parentIndices: number[] }
  bindings: {
    skeletonPath: string
    animationPath: string
    skinnedPrimPaths: string[]
    animationJoints: string[]
    animationTimeSamples: number[]
    jointIndices: number[]
    jointWeights: number[]
    numInfluencesPerComponent: number
    interpolation: string
    skinningMethod: string
  }
  samples: Record<string, {
    jointLocalTransforms: number[][]
    jointSkelTransforms: number[][]
    skinningTransforms: number[][]
    skinnedPoints: number[][]
    skinnedNormals: number[][]
    pointBounds: number[][]
    rootExtent: number[][]
    skeletonExtent: number[][]
  }>
}

const asset = fileURLToPath(new URL('fixtures/arm.usda', import.meta.url))
const reference = JSON.parse(readFileSync(
  fileURLToPath(new URL('fixtures/arm-v2608.json', import.meta.url)), 'utf8')) as Reference

function flatten(value: unknown): number[] {
  value = _sdfPlainValue(value)
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>)
  return Array.isArray(value) ? value.flatMap(flatten) : [Number(value)]
}

function numericDiff(
  field: string, actualValue: unknown, expectedValue: unknown, tolerance: number,
): { field: string; index: number; actual: number; expected: number; delta: number }[] {
  const actual = flatten(actualValue)
  const expected = flatten(expectedValue)
  const length = Math.max(actual.length, expected.length)
  const differences = []
  for (let index = 0; index < length; index++) {
    const delta = Math.abs((actual[index] ?? Number.NaN) - (expected[index] ?? Number.NaN))
    if (!Number.isFinite(delta) || delta > tolerance) {
      differences.push({
        field, index, actual: actual[index] ?? Number.NaN,
        expected: expected[index] ?? Number.NaN, delta,
      })
    }
  }
  return differences
}

describe('OpenUSD v26.08 arm skeletal evaluation', () => {
  it('opens the exact asset and resolves topology, animation, and skinning bindings', async () => {
    const stage = (await Stage.open(asset))!
    const root = stage.getPrim('/Model')!
    const skeleton = stage.getPrim(reference.bindings.skeletonPath)!
    const cache = new Cache()

    expect(cache.populate(root)).toBe(true)
    const bindings = cache.computeSkelBindings(root)
    const skeletonQuery = cache.getSkelQuery(skeleton)!
    const animationQuery = skeletonQuery.getAnimQuery()!
    const mesh = stage.getPrim('/Model/Arm')!
    const skinningQuery = cache.getSkinningQuery(mesh)!

    const actual = {
      openUsdVersion: reference.provenance.openUsdVersion,
      assetSha256: createHash('sha256').update(readFileSync(asset)).digest('hex'),
      authoredNormals: _sdfPlainValue(mesh.getAttr('normals')?.getValue()),
      topology: {
        joints: skeletonQuery.joints,
        parentIndices: [...skeletonQuery.topology.getParentIndices()],
      },
      bindings: {
        // UsdSkelBinding holds the skeleton and its skinning queries; the
        // animation is the skeleton query's.
        skeletonPath: bindings[0]?.getSkeleton()?.path,
        animationPath: bindings[0] &&
          cache.getSkelQuery(bindings[0].getSkeleton()!)?.getAnimQuery()?.getPrim().path,
        skinnedPrimPaths: bindings[0]?.getSkinningTargets().map(query => query.getPrim().path),
        animationJoints: animationQuery.getJointOrder(),
        animationTimeSamples: animationQuery.getJointTransformTimeSamples(),
        jointIndices: [...(skinningQuery.computeJointInfluences()?.[0] ?? [])],
        jointWeights: [...(skinningQuery.computeJointInfluences()?.[1] ?? [])],
        numInfluencesPerComponent: skinningQuery.getNumInfluencesPerComponent(),
        interpolation: String(
          mesh.getAttr('primvars:skel:jointIndices')?.getField('interpolation')),
        skinningMethod: skinningQuery.getSkinningMethod(),
      },
    }
    const expected = {
      openUsdVersion: 'v26.08',
      assetSha256: reference.provenance.assetSha256,
      authoredNormals: reference.authoredNormals,
      topology: reference.topology,
      bindings: reference.bindings,
    }
    expect(actual, JSON.stringify({ actual, expected }, null, 2)).toEqual(expected)
  })

  it.each(reference.times)('matches native transforms, skinning, normals, and bounds at time %s', async time => {
    const stage = (await Stage.open(asset))!
    const root = stage.getPrim('/Model')!
    const skeleton = stage.getPrim('/Model/Skel')!
    const mesh = stage.getPrim('/Model/Arm')!
    const cache = new Cache()
    expect(cache.populate(root)).toBe(true)
    const skeletonQuery = cache.getSkelQuery(skeleton) as SkeletonQuery
    const skinningQuery = cache.getSkinningQuery(mesh) as SkinningQuery
    const expected = reference.samples[String(time)]!

    const jointLocalTransforms = skeletonQuery.computeJointLocalTransforms(time)
    const jointSkelTransforms = skeletonQuery.computeJointSkelTransforms(time)
    const skinningTransforms = skeletonQuery.computeSkinningTransforms(time)
    const sourcePoints = flatten(mesh.getAttr('points')?.getValue())
    const skinnedPoints = skinningQuery.computeSkinnedPoints(skinningTransforms, sourcePoints)
    const sourceNormals = flatten(mesh.getAttr('normals')?.getValue())
    const skinnedNormals = skinningQuery.computeSkinnedNormals(
      skinningTransforms, sourceNormals)
    const pointBounds = PointBased.computeExtent(skinnedPoints)
    const rootExtent = Boundable.computeExtentFromPlugins(root, time)
    const skeletonExtent = Boundable.computeExtentFromPlugins(skeleton, time)

    const actual = {
      jointLocalTransforms, jointSkelTransforms, skinningTransforms,
      skinnedPoints, skinnedNormals, pointBounds, rootExtent, skeletonExtent,
    }
    const differences = [
      ...numericDiff('jointLocalTransforms', jointLocalTransforms,
        expected.jointLocalTransforms, reference.tolerances.matrixAbsolute),
      ...numericDiff('jointSkelTransforms', jointSkelTransforms,
        expected.jointSkelTransforms, reference.tolerances.matrixAbsolute),
      ...numericDiff('skinningTransforms', skinningTransforms,
        expected.skinningTransforms, reference.tolerances.matrixAbsolute),
      ...numericDiff('skinnedPoints', skinnedPoints,
        expected.skinnedPoints, reference.tolerances.pointAbsolute),
      ...numericDiff('skinnedNormals', skinnedNormals,
        expected.skinnedNormals, reference.tolerances.normalAbsolute),
      ...numericDiff('pointBounds', pointBounds,
        expected.pointBounds, reference.tolerances.boundAbsolute),
      ...numericDiff('rootExtent', rootExtent,
        expected.rootExtent, reference.tolerances.boundAbsolute),
      ...numericDiff('skeletonExtent', skeletonExtent,
        expected.skeletonExtent, reference.tolerances.boundAbsolute),
    ]
    expect(differences, JSON.stringify({ time, actual, expected, differences }, null, 2))
      .toEqual([])
  })
})
