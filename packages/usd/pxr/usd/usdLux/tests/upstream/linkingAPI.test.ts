// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/testenv/testUsdLuxLinkingAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLux/testenv/testUsdLuxLinkingAPI.py
// Fixtures in linkingAPI/ are copied verbatim from
// pxr/usd/usdLux/testenv/testUsdLuxLinkingAPI/ (the test's TESTENV).
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Scope, Sphere } from 'typescript-usd/usdGeom'
import { LightAPI, LightFilter, SphereLight } from '../../src/index.ts'

const testFile = path.join(import.meta.dirname, 'linkingAPI', 'linking_example.usda')
let stage: Stage

beforeAll(async () => {
  stage = (await Stage.open(testFile))!
})

describe('TestUsdLuxLinkingAPI', () => {
  it('test_LinkageQueries', () => {
    const test_cases: Array<[string, string, boolean]> = [
      ['/Lights/DefaultLinkage/include_all', '/Geom', true],
      ['/Lights/DefaultLinkage/include_all', '/Geom/a', true],
      ['/Lights/DefaultLinkage/include_all', '/Geom/a/sub_scope', true],

      ['/Lights/SimpleInclude/include_a', '/Geom', false],
      ['/Lights/SimpleInclude/include_a', '/Geom/a', true],
      ['/Lights/SimpleInclude/include_a', '/Geom/a/sub_scope', true],
      ['/Lights/SimpleInclude/include_a', '/Geom/b', false],

      ['/Lights/SimpleExclude/exclude_a', '/Geom', true],
      ['/Lights/SimpleExclude/exclude_a', '/Geom/a', false],
      ['/Lights/SimpleExclude/exclude_a', '/Geom/a/sub_scope', false],
      ['/Lights/SimpleExclude/exclude_a', '/Geom/b', true],

      ['/Lights/FaceSetLinking/include_faceSet_example', '/', false],
      ['/Lights/FaceSetLinking/include_faceSet_example', '/Geom', false],
      ['/Lights/FaceSetLinking/include_faceSet_example', '/Geom/meshWithFaceSet', false],
      ['/Lights/FaceSetLinking/include_faceSet_example', '/Geom/meshWithFaceSet/faceSet', true],
    ]
    for (const [light_path, test_path, expected_result] of test_cases) {
      const light = new LightAPI(stage.getPrim(light_path))
      const links = light.getLightLinkCollectionAPI()
      const query = links.computeMembershipQuery()
      const actual_result = query.isPathIncluded(test_path)
      expect(actual_result, `${light_path} ${test_path}`).toBe(expected_result)
    }
  })

  it('test_LinkageAuthoring', () => {
    const stage = Stage.createNew()
    const geom_scope = Scope.define(stage, '/Geom')
    const sphere = Sphere.define(stage, '/Geom/Sphere')
    Scope.define(stage, '/Lights')
    const light_1 = SphereLight.define(stage, '/Lights/light_1')
    const light_1_links = new LightAPI(light_1.prim).getLightLinkCollectionAPI()

    // Schema default: link everything
    let query = light_1_links.computeMembershipQuery()
    expect(query.isPathIncluded(geom_scope.path)).toBe(true)
    expect(query.isPathIncluded(sphere.path)).toBe(true)
    expect(query.isPathIncluded('/RandomOtherPath')).toBe(true)

    // Exclude /Geom.
    light_1_links.excludePath('/Geom')
    query = light_1_links.computeMembershipQuery()
    expect(query.isPathIncluded(geom_scope.path)).toBe(false)
    expect(query.isPathIncluded(sphere.path)).toBe(false)
    expect(query.isPathIncluded('/RandomOtherPath')).toBe(true)

    // Include /Geom/Sphere
    light_1_links.includePath('/Geom/Sphere')
    query = light_1_links.computeMembershipQuery()
    expect(query.isPathIncluded(geom_scope.path)).toBe(false)
    expect(query.isPathIncluded(sphere.path)).toBe(true)
    expect(query.isPathIncluded('/Geom/Sphere/Child')).toBe(true)
    expect(query.isPathIncluded('/RandomOtherPath')).toBe(true)
  })

  it('test_FilterLinking', () => {
    const light_path = '/Lights/FilterLinking/filter_exclude_a'
    const light = new LightAPI(stage.getPrim(light_path))
    const filter_paths = light.getFiltersRel().getForwardedTargets()
    expect(filter_paths.length).toBe(1)
    const light_filter = new LightFilter(stage.getPrim(filter_paths[0]!))
    expect(light_filter.path).toBe('/Lights/FilterLinking/filter')
    const links = light_filter.getFilterLinkCollectionAPI()
    const query = links.computeMembershipQuery()
    expect(query.isPathIncluded('/Geom/a')).toBe(false)
    expect(query.isPathIncluded('/Geom/b')).toBe(true)
  })
})
