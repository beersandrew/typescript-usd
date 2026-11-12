// Ported from OpenUSD 26.11.1: pxr/usd/usd/schemaRegistry.cpp,
//  pxr/usd/usd/testenv/testUsdAppliedAPISchemas.py
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the testUsdAppliedAPISchemas_AutoApplyDisabled registration
// (OpenUSD 26.11.1 pxr/usd/usd/CMakeLists.txt): the
// testUsdAppliedAPISchemas.py script run with
// USD_DISABLE_AUTO_APPLY_API_SCHEMAS=1. The env setting is read while the
// schema registry is built (schemaRegistry.cpp:841-844, 2088-2092), so this
// file stubs it before anything touches the registry; vitest gives every test
// file its own module graph, so the registry singleton here is built with
// auto apply disabled.
//
// Ported here: the two cases that only run under the env setting,
// test_TypedPrimsOnStageWithAutoAppliedAPIs_AutoApplyDisabled
// (testUsdAppliedAPISchemas.py:801-850) and
// test_APISchemasAutoAppliedToAPISchemas_AutoApplyDisabled
// (testUsdAppliedAPISchemas.py:2585-2678). The script's other cases are
// ported, with auto apply enabled, in appliedAPISchemas.test.ts; their
// expectations do not depend on auto apply except where upstream skips them
// under this setting.
//
// Fixtures: the same vendored resources as appliedAPISchemas.test.ts
// (fixtures/appliedAPISchemas, copied from
// testenv/testUsdAppliedAPISchemas/resources; fixtures/vendored/usd).
// Tf.Type-based HasAPI(type[, instance]) maps to the applied-schema name
// string, as in appliedAPISchemas.test.ts.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.stubEnv('USD_DISABLE_AUTO_APPLY_API_SCHEMAS', '1')

const { Stage, SchemaRegistry: UsdSchemaRegistry } = await import('typescript-usd/usd')
const { Registry: PlugRegistry } = await import('typescript-usd/plug')
type PlugInfo = import('typescript-usd/plug').Info

afterAll(() => { vi.unstubAllEnvs() })

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')
const readFixture = (rel: string) => readFileSync(path.join(FIXTURES, rel), 'utf8')

// pxr's plugInfo.json dialect allows '#' comment lines.
function parsePlugInfo(text: string): PlugInfo {
  return JSON.parse(text.split('\n')
    .filter((line) => !line.trimStart().startsWith('#')).join('\n')) as PlugInfo
}

// setUpClass (testUsdAppliedAPISchemas.py:13-19).
function registerTestSchemas(): void {
  const reg = PlugRegistry.GetInstance()
  reg.RegisterPlugins(parsePlugInfo(readFixture('vendored/usd/plugInfo.json')), {
    usd: { 'generatedSchema.usda': readFixture('vendored/usd/generatedSchema.usda') },
  })
  reg.RegisterPlugins(parsePlugInfo(readFixture('appliedAPISchemas/plugInfo.json')), {
    testUsdAppliedAPISchemas: {
      'generatedSchema.usda': readFixture('appliedAPISchemas/generatedSchema.usda'),
    },
  })
  expect(reg.GetPluginWithName('testUsdAppliedAPISchemas')).not.toBeNull()
}

describe('testUsdAppliedAPISchemas (USD_DISABLE_AUTO_APPLY_API_SCHEMAS=1)', () => {
  it('test_TypedPrimsOnStageWithAutoAppliedAPIs_AutoApplyDisabled', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    // TestMultiApplyAPI:builtin comes from the apiSchemas metadata and is not
    // affected by disabling auto apply; TestSingleApplyAPI and
    // TestMultiApplyAPI:autoFoo are not applied.
    const typedPrim = stage.definePrim('/TypedPrim', 'TestTypedSchemaForAutoApply')
    expect(typedPrim.typeName).toBe('TestTypedSchemaForAutoApply')
    expect(typedPrim.getAppliedSchemas()).toEqual(['TestMultiApplyAPI:builtin'])

    expect(typedPrim.hasAPI('TestMultiApplyAPI:builtin')).toBe(true)
    expect(typedPrim.hasAPI('TestMultiApplyAPI:autoFoo')).toBe(false)
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(false)
    expect(typedPrim.getPropertyNames()).toEqual([
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'testAttr',
      'testRel'])

    // A concrete typed prim that would receive an auto applied API schema has
    // no applied API schemas.
    typedPrim.setTypeName('TestTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.typeName).toBe('TestTypedSchemaForAutoApplyConcreteBase')
    expect(typedPrim.getAppliedSchemas()).toEqual([])
    expect(typedPrim.hasAPI('TestSingleApplyAPI')).toBe(false)
    expect(typedPrim.getPropertyNames()).toEqual(['testAttr', 'testRel'])

    // The auto apply API schema dictionary is empty.
    expect(UsdSchemaRegistry.getAutoApplyAPISchemas()).toEqual(new Map())
  })

  it('test_APISchemasAutoAppliedToAPISchemas_AutoApplyDisabled', () => {
    registerTestSchemas()
    const stage = Stage.createNew()

    let prim = stage.definePrim('/Prim')
    prim.applyAPI('TestAutoAppliedToAPI')
    expect(prim.typeName).toBe('')
    expect(prim.getAppliedSchemas()).toEqual([
      // Authored applied API
      'TestAutoAppliedToAPI',
      // Built-in API of 'TestAutoAppliedToAPI'
      'TestMultiApplyAPI:builtin'])
    expect(prim.hasAPI('TestAutoAppliedToAPI')).toBe(true)
    expect(prim.hasAPI('TestMultiApplyAPI:builtin')).toBe(true)
    expect(prim.hasAPI('TestMultiApplyAPI:autoFoo')).toBe(false)
    expect(prim.hasAPI('TestSingleApplyAPI')).toBe(false)

    expect(prim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestAutoAppliedToAPI'])

    expect(prim.getPropertyNames()).toEqual([
      'multi:builtin:bool_attr',
      'multi:builtin:relationship',
      'multi:builtin:token_attr',
      'testAttr',
      'testRel'])

    prim = stage.definePrim('/Prim2')
    prim.applyAPI('TestNestedAutoAppliedToAPI')
    expect(prim.typeName).toBe('')
    expect(prim.getAppliedSchemas()).toEqual([
      // Authored applied API
      'TestNestedAutoAppliedToAPI',
      // Built-in API of 'TestNestedAutoAppliedToAPI'
      'TestMultiApplyAPI:foo'])
    expect(prim.hasAPI('TestNestedAutoAppliedToAPI')).toBe(true)
    expect(prim.hasAPI('TestAutoAppliedToAPI')).toBe(false)
    expect(prim.hasAPI('TestMultiApplyAPI:foo')).toBe(true)
    expect(prim.hasAPI('TestMultiApplyAPI:builtin')).toBe(false)
    expect(prim.hasAPI('TestMultiApplyAPI:autoFoo')).toBe(false)
    expect(prim.hasAPI('TestSingleApplyAPI')).toBe(false)

    expect(prim.getPrimTypeInfo().getTypeName()).toBe('')
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual(['TestNestedAutoAppliedToAPI'])

    expect(prim.getPropertyNames()).toEqual([
      'multi:foo:bool_attr',
      'multi:foo:relationship',
      'multi:foo:token_attr'])

    prim = stage.definePrim('/Prim3', 'TestNestedAutoAppliedToAPIAppliedToPrim')
    expect(prim.typeName).toBe('TestNestedAutoAppliedToAPIAppliedToPrim')
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(prim.getPrimTypeInfo().getTypeName()).toBe('TestNestedAutoAppliedToAPIAppliedToPrim')
    expect(prim.getPrimTypeInfo().getAppliedAPISchemas()).toEqual([])
    expect(prim.getPropertyNames()).toEqual([])
  })
})
