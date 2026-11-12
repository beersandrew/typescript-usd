// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usdGeom/testenv/testUsdGeomExtentFromPlugins.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomExtentFromPlugins.py — the
// per-gprim extent computation (UsdGeomBoundable.ComputeExtentFromPlugins) for
// capsule/cone/cube/cylinder/sphere at default and time-sampled values, plus
// the authored-extent-vs-computed distinction (ComputeExtent prefers an
// authored extent; ComputeExtentFromPlugins always recomputes from geometry).
//
// The fixture below is the upstream test.usda verbatim; the expected extents
// are the values asserted by the upstream test (captured from the Pixar build).

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { Boundable, type Extent } from 'typescript-usd/usdGeom'

const FIXTURE = `#usda 1.0
(
    endTimeCode = 5
    framesPerSecond = 24
    metersPerUnit = 1
    startTimeCode = 1
    timeCodesPerSecond = 24
    upAxis = "Y"
)

def Cube "cube"
{
    double size = 4
    double size.timeSamples = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 }
}

def Cone "cone"
{
    token axis = "Z"
    double height = 4
    double height.timeSamples = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 }
    double radius = 2
    double radius.timeSamples = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }
}

def Sphere "sphere"
{
    double radius = 2
    double radius.timeSamples = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }
}

def Cylinder "cylinder"
{
    token axis = "Z"
    double height = 4
    double height.timeSamples = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9 }
    double radius = 2
    double radius.timeSamples = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }
}

def Capsule "capsule"
{
    token axis = "Z"
    double height = 2
    double height.timeSamples = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }
    double radius = 2
    double radius.timeSamples = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }
}

def Sphere "AuthoredExtentSphere"
{
    float3[] extent = [(-10.0, -10.0, -10.0), (10.0, 10.0, 10.0)]
    double radius = 2
}
`

async function openFixture(): Promise<Stage> {
  const resolver = new ArInMemoryResolver({ 'test.usda': new TextEncoder().encode(FIXTURE) })
  return (await Stage.open('test.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
}

function ext(min: [number, number, number], max: [number, number, number]): Extent {
  return [min, max]
}

describe('UsdGeomBoundable.ComputeExtentFromPlugins', () => {
  it('default extents', async () => {
    const stage = await openFixture()
    const expected: Record<string, Extent> = {
      '/capsule': ext([-2, -2, -3], [2, 2, 3]),
      '/cone': ext([-2, -2, -2], [2, 2, 2]),
      '/cube': ext([-2, -2, -2], [2, 2, 2]),
      '/cylinder': ext([-2, -2, -2], [2, 2, 2]),
      '/sphere': ext([-2, -2, -2], [2, 2, 2]),
    }
    for (const [path, e] of Object.entries(expected)) {
      expect(Boundable.computeExtentFromPlugins(stage.getPrim(path)!), path).toEqual(e)
    }
  })

  it('time-sampled extents (t=2)', async () => {
    const stage = await openFixture()
    const expected: Record<string, Extent> = {
      '/capsule': ext([-4, -4, -6], [4, 4, 6]),
      '/cone': ext([-4, -4, -3], [4, 4, 3]),
      '/cube': ext([-3, -3, -3], [3, 3, 3]),
      '/cylinder': ext([-4, -4, -3], [4, 4, 3]),
      '/sphere': ext([-4, -4, -4], [4, 4, 4]),
    }
    for (const [path, e] of Object.entries(expected)) {
      expect(Boundable.computeExtentFromPlugins(stage.getPrim(path)!, 2), path).toEqual(e)
    }
  })

  it('ComputeExtent prefers authored extent; FromPlugins recomputes from geometry', async () => {
    const stage = await openFixture()
    const authored = ext([-10, -10, -10], [10, 10, 10])
    const computed = ext([-2, -2, -2], [2, 2, 2])

    const sphere = stage.getPrim('/AuthoredExtentSphere')!
    expect(Boundable.computeExtent(sphere)).toEqual(authored)
    expect(Boundable.computeExtentFromPlugins(sphere)).toEqual(computed)

    // With no authored extent, ComputeExtent uses the geometric fallback.
    expect(Boundable.computeExtent(stage.getPrim('/sphere')!)).toEqual(computed)
  })
})
