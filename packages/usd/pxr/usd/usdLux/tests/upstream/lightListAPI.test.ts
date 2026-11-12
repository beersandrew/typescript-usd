// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdLux/testenv/testUsdLuxLightListAPI.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLux/testenv/testUsdLuxLightListAPI.py
// Fixtures in lightListAPI/ are copied verbatim from
// pxr/usd/usdLux/testenv/testUsdLuxLightListAPI/ (the test's TESTENV).
//
// The upstream TestCase defines test_ListAPI twice; Python keeps only the
// second definition, so the registered test runs on root_with_instances.usda
// alone. That is the case ported here.
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { LightAPI, LightFilter, LightListAPI } from '../../src/index.ts'

const testenv = path.join(import.meta.dirname, 'lightListAPI')

async function _test(stage: Stage): Promise<void> {
  const listAPI = new LightListAPI(stage.getPrim('/World'))
  const consult = LightListAPI.ComputeModeConsultModelHierarchyCache
  const ignore = LightListAPI.ComputeModeIgnoreCache

  // no cache initially
  expect(listAPI.getLightListRel().getTargets().length).toBe(0)
  // compute w/o cache should find 1 light outside payload
  let computed_list = listAPI.computeLightList(ignore)
  expect(computed_list.size).toBe(1)
  expect(computed_list.has('/World/Lights/Sky_light')).toBe(true)
  // compute w/ cache should find 1 extra light, since 1 light
  // inside a payload has been published to cache
  computed_list = listAPI.computeLightList(consult)
  expect(computed_list.size).toBe(2)
  expect(computed_list.has('/World/Lights/Sky_light')).toBe(true)
  expect(computed_list.has('/World/Geo/torch_2/light')).toBe(true)

  // load payloads to discover the rest of the lights
  await stage.load()
  // if we consult the cache we still won't see lights below model
  // hierarchy
  computed_list = listAPI.computeLightList(consult)
  expect(computed_list.size).toBe(2)
  expect(computed_list.has('/World/Lights/Sky_light')).toBe(true)
  expect(computed_list.has('/World/Geo/torch_2/light')).toBe(true)
  // but if we ignore cache we now see 3 lights
  computed_list = listAPI.computeLightList(ignore)
  expect(computed_list.size).toBe(3)
  expect(computed_list.has('/World/Lights/Sky_light')).toBe(true)
  expect(computed_list.has('/World/Geo/torch_1/light')).toBe(true)
  expect(computed_list.has('/World/Geo/torch_2/light')).toBe(true)

  // store this full list in the light list
  listAPI.storeLightList(computed_list)

  // now using the cache should return everything
  computed_list = listAPI.computeLightList(consult)
  expect(computed_list.size).toBe(3)
  expect(computed_list.has('/World/Lights/Sky_light')).toBe(true)
  expect(computed_list.has('/World/Geo/torch_1/light')).toBe(true)
  expect(computed_list.has('/World/Geo/torch_2/light')).toBe(true)

  // deactivate 1 torch model
  const torch_1 = stage.getPrim('/World/Geo/torch_1')!
  await torch_1.setActive(false)

  // if we ignore the cache(s) we do see only 2 lights
  expect(listAPI.computeLightList(ignore).size).toBe(2)
  // but the cache should continue to report 3 lights
  expect(listAPI.computeLightList(consult).size).toBe(3)
  // invalidating the cache should cause it to report 2 lights
  listAPI.invalidateLightList()
  expect(listAPI.computeLightList(consult).size).toBe(2)

  // add a light filter, and confirm that it gets included as a light
  expect(listAPI.computeLightList(ignore).size).toBe(2)
  LightFilter.define(stage, '/World/Lights/TestFilter')
  expect(listAPI.computeLightList(ignore).size).toBe(3)

  // add an untyped prim and apply a LightAPI. Confirm that it also gets
  // included as a light.
  expect(listAPI.computeLightList(ignore).size).toBe(3)
  const prim = stage.definePrim('/World/Lights/PrimWithLightAPI')
  expect(listAPI.computeLightList(ignore).size).toBe(3)
  LightAPI.apply(prim)
  expect(listAPI.computeLightList(ignore).size).toBe(4)

  // discard changes
  await stage.reload()
}

describe('TestUsdLuxListAPI', () => {
  it('test_ListAPI', async () => {
    await _test((await Stage.open(path.join(testenv, 'root_with_instances.usda'),
      { loadPayloads: false }))!)
  })
})
