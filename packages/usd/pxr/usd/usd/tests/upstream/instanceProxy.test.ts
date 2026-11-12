// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.h,
//  pxr/usd/usd/testenv/testUsdInstanceProxy.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdInstanceProxy.py
// (registered as testUsdInstanceProxy). The testenv directory
// pxr/usd/usd/testenv/testUsdInstanceProxy (attrs/, nested/,
// nested_payloads/, rels/) is copied unmodified into
// fixtures/testUsdInstanceProxy (Copyright 2017 Pixar, TOST 1.0,
// https://openusd.org/license). The test runs with the testenv as the
// working directory, so relative identifiers name the fixtures.
//
// API mapping: UsdObject::GetParent and UsdPrim::GetChild have no TS
// method; they are Stage.getPrim on the parent / child path, which
// upstream asserts is equal (test_GetParent). Prim equality (UsdPrim ==)
// compares the proxy path and the prim data path (prim.h operator==).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import {
  PrimRange, Stage, TraverseInstanceProxies, type Prim,
} from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdInstanceProxy')

function parentPath(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

function appendPath(base: string, rel: string): string { return `${base}/${rel}` }

// UsdObject::GetParent, as Stage.GetPrimAtPath(parentPath).
function getParent(prim: Prim): Prim | undefined {
  return prim.getStage().getPrim(parentPath(prim.path))
}

// UsdPrim::GetChild(name).
function getChild(prim: Prim, name: string): Prim | undefined {
  return prim.getStage().getPrim(appendPath(prim.path, name))
}

// UsdPrim identity (prim.h operator==): the proxy path and the prim data.
function primKey(prim: Prim | undefined): string | undefined {
  if (prim === undefined) return undefined
  return `${prim.path}|${prim.getPrimInPrototype()?.path ?? prim.path}`
}

function validateInstanceProxy(expectedPath: string, prim: Prim | undefined,
  expectedPathInPrototype = false): void {
  // Verify that the instance proxy has the expected path.
  expect(prim?.path).toBe(expectedPath)

  // Instance proxies should be identified as such.
  expect(prim !== undefined && prim.isValid()).toBe(true)
  expect(prim!.isInstanceProxy()).toBe(true)

  // An instance proxy is not in a prototype unless it came from
  // explicitly traversing within a prototype.
  expect(prim!.isInPrototype()).toBe(expectedPathInPrototype)
}

function throwsError(fn: () => unknown): void {
  expect(fn).toThrow()
}

describe('testUsdInstanceProxy', () => {
  let cwd: string
  beforeAll(() => {
    cwd = process.cwd()
    process.chdir(TESTENV)
  })
  afterAll(() => { process.chdir(cwd) })

  it('test_GetPrimAtPath', async () => {
    const s = (await Stage.open('nested/root.usda'))!

    // Test that getting a prim for a non-nested instance
    // does not return an instance proxy.
    const prim = s.getPrim('/World/sets/Set_1')
    expect(prim).toBeDefined()
    expect(prim!.isInstanceProxy()).toBe(false)
    expect(prim!.isInstance()).toBe(true)

    // Test getting prims at paths beneath instances and
    // nested instances
    for (const p of ['/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_2',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_2/Prop_1',
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_2',
      '/World/sets/Set_2/Prop_2/geom']) {
      validateInstanceProxy(p, s.getPrim(p))
    }

    // Test getting prims at paths beneath instances nested
    // in prototypes.
    const prototype = s.getPrim('/World/sets/Set_1')!.getPrototype()!
    for (const p of [appendPath(prototype.path, 'Prop_1/geom'),
      appendPath(prototype.path, 'Prop_2/geom')]) {
      validateInstanceProxy(p, s.getPrim(p), true)
    }
  })

  it('test_GetParent', async () => {
    const s = (await Stage.open('nested/root.usda'))!

    // Test getting parents of instance proxies
    for (const p of ['/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_2/geom']) {
      let prim = s.getPrim(p)
      validateInstanceProxy(p, prim)

      prim = getParent(prim!)
      let expectedPath = parentPath(p)
      validateInstanceProxy(expectedPath, prim)
      expect(primKey(prim)).toBe(primKey(s.getPrim(expectedPath)))

      prim = getParent(prim!)
      expectedPath = parentPath(expectedPath)
      expect(prim!.path).toBe(expectedPath)
      expect(prim!.isInstanceProxy()).toBe(false)
    }

    // Test getting parents of instance proxies inside prototypes
    const prototype = s.getPrim('/World/sets/Set_1')!.getPrototype()!
    for (let p of [appendPath(prototype.path, 'Prop_1/geom'),
      appendPath(prototype.path, 'Prop_2/geom')]) {
      let prim = s.getPrim(p)
      validateInstanceProxy(p, prim, true)

      prim = getParent(prim!)
      p = parentPath(p)
      expect(prim!.path).toBe(p)
      expect(primKey(prim)).toBe(primKey(s.getPrim(p)))
      expect(prim!.isInstance()).toBe(true)
      expect(prim!.isInstanceProxy()).toBe(false)

      prim = getParent(prim!)
      p = parentPath(p)
      expect(prim!.path).toBe(p)
      expect(primKey(prim)).toBe(primKey(s.getPrim(p)))
      expect(prim!.isPrototype()).toBe(true)
      expect(prim!.isInstanceProxy()).toBe(false)
    }
  })

  it('test_GetChildren', async () => {
    const s = (await Stage.open('nested/root.usda'))!

    const validateChildren = (parent: string, expectedChildrenPaths: string[]): void => {
      const expectedPrims = expectedChildrenPaths.map(p => primKey(s.getPrim(p)))

      const parentPrim = s.getPrim(parent)!

      // Children queries on instance proxies will always return
      // instance proxies.
      const children = parentPrim.isInstanceProxy()
        ? parentPrim.getChildren()
        : parentPrim.getFilteredChildren(TraverseInstanceProxies())
      expect(children.map(primKey)).toEqual(expectedPrims)

      expectedChildrenPaths.forEach((expectedPath, i) =>
        validateInstanceProxy(expectedPath, children[i]))
    }

    validateChildren('/World/sets/Set_1', [
      '/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_2'])
    validateChildren('/World/sets/Set_2', [
      '/World/sets/Set_2/Prop_1',
      '/World/sets/Set_2/Prop_2'])
    validateChildren('/World/sets/Set_1/Prop_1', [
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim'])
    validateChildren('/World/sets/Set_1/Prop_2', [
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_1/Prop_2/anim'])
    validateChildren('/World/sets/Set_2/Prop_1', [
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_1/anim'])
    validateChildren('/World/sets/Set_2/Prop_2', [
      '/World/sets/Set_2/Prop_2/geom',
      '/World/sets/Set_2/Prop_2/anim'])
  })

  it('test_GetPrimInPrototype', async () => {
    const s = (await Stage.open('nested/root.usda'))!

    const setPrototype = s.getPrim('/World/sets/Set_1')!.getPrototype()!
    const propPrototype = getChild(setPrototype, 'Prop_1')!.getPrototype()!

    const inProto = (p: string) => primKey(s.getPrim(p)!.getPrimInPrototype())
    expect(inProto('/World/sets/Set_1/Prop_1')).toBe(primKey(getChild(setPrototype, 'Prop_1')))
    expect(inProto('/World/sets/Set_1/Prop_1/geom')).toBe(primKey(getChild(propPrototype, 'geom')))
    expect(inProto('/World/sets/Set_1/Prop_2')).toBe(primKey(getChild(setPrototype, 'Prop_2')))
    expect(inProto('/World/sets/Set_1/Prop_2/geom')).toBe(primKey(getChild(propPrototype, 'geom')))
    expect(inProto('/World/sets/Set_2/Prop_1')).toBe(primKey(getChild(setPrototype, 'Prop_1')))
    expect(inProto('/World/sets/Set_2/Prop_1/geom')).toBe(primKey(getChild(propPrototype, 'geom')))
    expect(inProto('/World/sets/Set_2/Prop_2')).toBe(primKey(getChild(setPrototype, 'Prop_2')))
    expect(inProto('/World/sets/Set_2/Prop_2/geom')).toBe(primKey(getChild(propPrototype, 'geom')))
  })

  it('test_LoadSet', async () => {
    // Usd.Stage.Open(path, Usd.Stage.LoadNone)
    const s = (await Stage.open('nested_payloads/root.usda', { loadPayloads: false }))!

    const prototype = s.getPrim('/World/sets/Set_1')!.getPrototype()
    expect(prototype).toBeDefined()

    // Note that FindLoadable never returns paths to prims in prototypes.
    expect.soft(s.findLoadable()).toEqual([
      '/World/sets/Set_1/props/Prop_1',
      '/World/sets/Set_1/props/Prop_2',
      '/World/sets/Set_2/props/Prop_1',
      '/World/sets/Set_2/props/Prop_2'])

    expect.soft(s.findLoadable('/World/sets/Set_1/props')).toEqual([
      '/World/sets/Set_1/props/Prop_1',
      '/World/sets/Set_1/props/Prop_2'])

    expect.soft(s.findLoadable('/World/sets/Set_2/props')).toEqual([
      '/World/sets/Set_2/props/Prop_1',
      '/World/sets/Set_2/props/Prop_2'])

    const loaded = () => [
      s.getPrim('/World/sets/Set_1/props/Prop_1')!.isLoaded,
      s.getPrim('/World/sets/Set_1/props/Prop_2')!.isLoaded,
      s.getPrim('/World/sets/Set_2/props/Prop_1')!.isLoaded,
      s.getPrim('/World/sets/Set_2/props/Prop_2')!.isLoaded,
    ]

    // Load and unload models through instance proxies.
    expect.soft(loaded()).toEqual([false, false, false, false])

    // UsdPrim::Load() is UsdStage::Load(prim path).
    await s.load('/World/sets/Set_1/props/Prop_1')
    expect.soft(loaded()).toEqual([true, false, false, false])

    await s.load('/World/sets/Set_2/props/Prop_2')
    expect.soft(loaded()).toEqual([true, false, false, true])

    await s.loadAndUnload([], ['/World/sets/Set_1/props'])
    expect.soft(loaded()).toEqual([false, false, false, true])
  })

  it('test_PrimRange', async () => {
    const s = (await Stage.open('nested/root.usda'))!

    // Test iterating over all prims on the stage
    const expectedPrims = [
      '/World',
      '/World/sets',
      '/World/sets/Set_1',
      '/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim',
      '/World/sets/Set_1/Prop_2',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_1/Prop_2/anim',
      '/World/sets/Set_2',
      '/World/sets/Set_2/Prop_1',
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_1/anim',
      '/World/sets/Set_2/Prop_2',
      '/World/sets/Set_2/Prop_2/geom',
      '/World/sets/Set_2/Prop_2/anim',
    ].map(p => primKey(s.getPrim(p)))

    const gotPrims = [...PrimRange.stage(s, TraverseInstanceProxies())].map(primKey)
    expect(gotPrims).toEqual(expectedPrims)

    // Test getting instance proxy descendants from each instance.
    const validateInstanceDescendants = (parent: string, expectedDescendantPaths: string[]) => {
      const descendants = [...PrimRange.fromPrim(s.getPrim(parent)!, TraverseInstanceProxies())]
      expect(descendants.map(primKey)).toEqual(expectedDescendantPaths.map(p => primKey(s.getPrim(p))))
    }

    validateInstanceDescendants('/World/sets/Set_1', [
      '/World/sets/Set_1',
      '/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim',
      '/World/sets/Set_1/Prop_2',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_1/Prop_2/anim'])
    validateInstanceDescendants('/World/sets/Set_1/Prop_1', [
      '/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim'])
    validateInstanceDescendants('/World/sets/Set_1/Prop_2', [
      '/World/sets/Set_1/Prop_2',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_1/Prop_2/anim'])
    validateInstanceDescendants('/World/sets/Set_2', [
      '/World/sets/Set_2',
      '/World/sets/Set_2/Prop_1',
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_1/anim',
      '/World/sets/Set_2/Prop_2',
      '/World/sets/Set_2/Prop_2/geom',
      '/World/sets/Set_2/Prop_2/anim'])
    validateInstanceDescendants('/World/sets/Set_2/Prop_1', [
      '/World/sets/Set_2/Prop_1',
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_1/anim'])
    validateInstanceDescendants('/World/sets/Set_2/Prop_2', [
      '/World/sets/Set_2/Prop_2',
      '/World/sets/Set_2/Prop_2/geom',
      '/World/sets/Set_2/Prop_2/anim'])

    // Test iterating starting from a prototype prim
    let prototype = s.getPrim('/World/sets/Set_1')!.getPrototype()!
    validateInstanceDescendants(prototype.path, [
      prototype.path,
      appendPath(prototype.path, 'Prop_1'),
      appendPath(prototype.path, 'Prop_1/geom'),
      appendPath(prototype.path, 'Prop_1/anim'),
      appendPath(prototype.path, 'Prop_2'),
      appendPath(prototype.path, 'Prop_2/geom'),
      appendPath(prototype.path, 'Prop_2/anim')])

    prototype = s.getPrim('/World/sets/Set_1/Prop_1')!.getPrototype()!
    validateInstanceDescendants(prototype.path, [
      prototype.path,
      appendPath(prototype.path, 'geom'),
      appendPath(prototype.path, 'anim')])
  })

  it('test_GetAttributeValue', async () => {
    const s = (await Stage.open('nested/root.usda'))!

    const splitProp = (attrPath: string): [string, string] => {
      const dot = attrPath.lastIndexOf('.')
      return [attrPath.slice(0, dot), attrPath.slice(dot + 1)]
    }

    const validateAttributeValue = (attrPath: string, expectedValue: unknown) => {
      const [primPath, name] = splitProp(attrPath)
      const prim = s.getPrim(primPath)
      validateInstanceProxy(primPath, prim)

      const attr = prim!.getAttr(name)
      expect(attr).toBeDefined()
      expect.soft(attr!.getPath()).toBe(attrPath)
      const value = attr!.get()
      if (expectedValue instanceof SdfPathExpression) {
        expect.soft(String(value)).toBe(expectedValue.getText())
      } else {
        expect(value).toBe(expectedValue)
      }
    }

    validateAttributeValue('/World/sets/Set_1/Prop_1/geom.x', 1.0)
    validateAttributeValue('/World/sets/Set_1/Prop_2/geom.x', 1.0)
    validateAttributeValue('/World/sets/Set_2/Prop_1/geom.x', 1.0)
    validateAttributeValue('/World/sets/Set_2/Prop_2/geom.x', 1.0)

    validateAttributeValue('/World/sets/Set_1/Prop_1/geom.pathExpr',
      new SdfPathExpression('//foo /World/sets/Set_1/Prop_1/anim//*bar'))
    validateAttributeValue('/World/sets/Set_1/Prop_2/geom.pathExpr',
      new SdfPathExpression('//foo /World/sets/Set_1/Prop_2/anim//*bar'))
    validateAttributeValue('/World/sets/Set_2/Prop_1/geom.pathExpr',
      new SdfPathExpression('//foo /World/sets/Set_2/Prop_1/anim//*bar'))
    validateAttributeValue('/World/sets/Set_2/Prop_2/geom.pathExpr',
      new SdfPathExpression('//foo /World/sets/Set_2/Prop_2/anim//*bar'))

    // Check that the pathExpr attribute values in prototypes also map.
    const validatePathExprAttrInPrototype = (attrPath: string, expectedPattern: RegExp) => {
      const [primPath, name] = splitProp(attrPath)
      const proxyPrim = s.getPrim(primPath)
      validateInstanceProxy(primPath, proxyPrim)

      const protoPrim = proxyPrim!.getPrimInPrototype()!
      const attr = protoPrim.getAttr(name)
      expect(attr).toBeDefined()
      expect.soft(String(attr!.get())).toMatch(expectedPattern)
    }

    // re.match anchors at the start.
    const pattern = /^\/\/foo \/__Prototype_\d+\/anim\/\/\*bar/
    validatePathExprAttrInPrototype('/World/sets/Set_1/Prop_1/geom.pathExpr', pattern)
    validatePathExprAttrInPrototype('/World/sets/Set_1/Prop_2/geom.pathExpr', pattern)
    validatePathExprAttrInPrototype('/World/sets/Set_2/Prop_1/geom.pathExpr', pattern)
    validatePathExprAttrInPrototype('/World/sets/Set_2/Prop_2/geom.pathExpr', pattern)
  })

  it('test_GetRelationshipTargets', async () => {
    const s = (await Stage.open('rels/root.usda'))!

    const validateRelationshipTargets = (relPath: string, expectedTargets: string[]) => {
      const dot = relPath.lastIndexOf('.')
      const primPath = relPath.slice(0, dot)
      const prim = s.getPrim(primPath)
      validateInstanceProxy(primPath, prim)

      const rel = prim!.rel(relPath.slice(dot + 1))
      expect(rel).toBeDefined()
      expect(rel.getPath()).toBe(relPath)
      expect(rel.getTargets()).toEqual(expectedTargets)
    }

    for (const inst of ['Instance_1', 'Instance_2']) {
      validateRelationshipTargets(`/Root/${inst}/A.rel`, [
        `/Root/${inst}`,
        `/Root/${inst}.attr`,
        `/Root/${inst}/A`,
        `/Root/${inst}/A.attr`,
        `/Root/${inst}/NestedInstance_1`,
        `/Root/${inst}/NestedInstance_1.attr`,
        `/Root/${inst}/NestedInstance_1/B`,
        `/Root/${inst}/NestedInstance_1/B.attr`,
        `/Root/${inst}/NestedInstance_2`,
        `/Root/${inst}/NestedInstance_2.attr`,
        `/Root/${inst}/NestedInstance_2/B`,
        `/Root/${inst}/NestedInstance_2/B.attr`])
    }
    for (const inst of ['Instance_1', 'Instance_2']) {
      for (const nested of ['NestedInstance_1', 'NestedInstance_2']) {
        validateRelationshipTargets(`/Root/${inst}/${nested}/B.rel`, [
          `/Root/${inst}/${nested}/B`,
          `/Root/${inst}/${nested}/B.attr`])
      }
    }
  })

  it('test_GetConnections', async () => {
    const s = (await Stage.open('attrs/root.usda'))!

    const validateConnections = (attrPath: string, expectedSrcs: string[]) => {
      const dot = attrPath.lastIndexOf('.')
      const primPath = attrPath.slice(0, dot)
      const prim = s.getPrim(primPath)
      validateInstanceProxy(primPath, prim)

      const attr = prim!.getAttr(attrPath.slice(dot + 1))
      expect(attr).toBeDefined()
      expect.soft(attr!.getPath()).toBe(attrPath)
      expect(attr!.getConnections()).toEqual(expectedSrcs)
    }

    for (const inst of ['Instance_1', 'Instance_2']) {
      validateConnections(`/Root/${inst}/A.con`, [
        `/Root/${inst}`,
        `/Root/${inst}.attr`,
        `/Root/${inst}/A`,
        `/Root/${inst}/A.attr`,
        `/Root/${inst}/NestedInstance_1`,
        `/Root/${inst}/NestedInstance_1.attr`,
        `/Root/${inst}/NestedInstance_1/B`,
        `/Root/${inst}/NestedInstance_1/B.attr`,
        `/Root/${inst}/NestedInstance_2`,
        `/Root/${inst}/NestedInstance_2.attr`,
        `/Root/${inst}/NestedInstance_2/B`,
        `/Root/${inst}/NestedInstance_2/B.attr`])
    }
    for (const inst of ['Instance_1', 'Instance_2']) {
      for (const nested of ['NestedInstance_1', 'NestedInstance_2']) {
        validateConnections(`/Root/${inst}/${nested}/B.con`, [
          `/Root/${inst}/${nested}/B`,
          `/Root/${inst}/${nested}/B.attr`])
      }
    }
  })

  // test_Editing: Test that edits cannot be made on instance proxies.
  // Verify that edits cannot be made via instance proxies in the local
  // layer stack, since they represent prims beneath instances and those
  // opinions would be ignored.
  it('test_Editing: stage prim authoring', async () => {
    const s = (await Stage.open('nested/root.usda'))!
    const proxy = s.getPrim('/World/sets/Set_1/Prop_1')!
    expect(proxy.isInstanceProxy()).toBe(true)

    throwsError(() => s.definePrim(proxy.path))
    throwsError(() => s.overridePrim(proxy.path))
    throwsError(() => s.createClassPrim(proxy.path))
  })

  it('test_Editing: prim authoring', async () => {
    const s = (await Stage.open('nested/root.usda'))!
    const proxy = s.getPrim('/World/sets/Set_1/Prop_1')!

    // SetDocumentation / ClearDocumentation are the 'documentation' field.
    throwsError(() => proxy.setMetadata('documentation', 'test'))
    throwsError(() => proxy.clearMetadata('documentation'))
    throwsError(() => proxy.createRelationship('testRel'))
    throwsError(() => proxy.createAttribute('testAttr', 'int'))
  })

  it('test_Editing: attribute authoring', async () => {
    const s = (await Stage.open('nested/root.usda'))!
    const proxy = s.getPrim('/World/sets/Set_1/Prop_1')!
    const attrInProxy = getChild(proxy, 'geom')!.getAttr('x')
    expect(attrInProxy).toBeDefined()

    throwsError(() => attrInProxy!.setMetadata('documentation', 'test'))
    throwsError(() => attrInProxy!.clearMetadata('documentation'))
    throwsError(() => attrInProxy!.setTimeSample(1.0, 2.0))
    // Set(2.0, time=Usd.TimeCode.Default())
    throwsError(() => attrInProxy!.set(2.0))
    throwsError(() => attrInProxy!.clear())
    // ClearAtTime(time=1.0): no Attribute.clearAtTime in the TS API.
    throwsError(() => attrInProxy!.setConnections(['/Some/Connection']))
  })

  it('test_Editing: relationship authoring', async () => {
    const s = (await Stage.open('nested/root.usda'))!
    const proxy = s.getPrim('/World/sets/Set_1/Prop_1')!
    const relInProxy = getChild(proxy, 'geom')!.rel('y')
    expect(relInProxy).toBeDefined()

    throwsError(() => relInProxy.setMetadata('documentation', 'test'))
    // ClearDocumentation: UsdRel has no clearMetadata in the TS API.
    throwsError(() => relInProxy.setTargets(['/Some/Target']))
  })
})
