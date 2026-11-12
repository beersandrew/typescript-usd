// Ported from OpenUSD 26.11.1: pxr/usd/sdf/assetPath.h,
//  pxr/usd/sdf/testenv/testSdfAssetPath.py
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfAssetPath.py
// (registered as testSdfAssetPath).
//
// API mapping: Python's AssetPath(authoredPath=, evaluatedPath=,
// resolvedPath=) keywords are the SdfAssetPathParams object; .path is
// getAssetPath(). The comparison operators are operator< and the operators
// assetPath.h:126-151 derives from it. test_Repr (eval(repr(p))) and
// test_PositionalArgs (Python TypeError for >2 positional arguments) check
// the Python wrapper only and have no TS counterpart.
import { describe, expect, it } from 'vitest'
import { AssetPath } from 'typescript-usd/sdf'

const lt = (a: AssetPath, b: AssetPath): boolean => a.lessThan(b)
const le = (a: AssetPath, b: AssetPath): boolean => !b.lessThan(a)
const gt = (a: AssetPath, b: AssetPath): boolean => b.lessThan(a)
const ge = (a: AssetPath, b: AssetPath): boolean => !a.lessThan(b)

describe('TestSdfAssetPathEmpty', () => {
  // Test paths whose path and resolvedPath properties are empty
  const emptyPath = new AssetPath()
  const nonEmptyPath = new AssetPath('/a')

  it('setUp', () => {
    expect(emptyPath.getAssetPath()).toBe('')
    expect(emptyPath.getAuthoredPath()).toBe('')
    expect(emptyPath.getEvaluatedPath()).toBe('')
    expect(emptyPath.getResolvedPath()).toBe('')
    expect(nonEmptyPath.getAssetPath()).toBeTruthy()
    expect(nonEmptyPath.getAuthoredPath()).toBeTruthy()
  })

  it('test_EqualityOperators', () => {
    expect(emptyPath.equals(emptyPath)).toBe(true)
    expect(emptyPath.equals(nonEmptyPath)).toBe(false)
  })

  it('test_ComparisonOperators', () => {
    // The empty path should always be less than a non-empty path
    expect(lt(emptyPath, nonEmptyPath)).toBe(true)
    expect(le(emptyPath, nonEmptyPath)).toBe(true)
    expect(le(emptyPath, emptyPath)).toBe(true)
    expect(gt(nonEmptyPath, emptyPath)).toBe(true)
    expect(ge(nonEmptyPath, emptyPath)).toBe(true)
    expect(ge(emptyPath, emptyPath)).toBe(true)
  })
})

describe('TestSdfAssetPathUnresolved', () => {
  // Test paths whose resolvedPath property is empty
  const unresolved = new AssetPath('/unresolved/path')
  const unresolvedChild = new AssetPath('/unresolved/path/child')
  const unresolvedParent = new AssetPath('/unresolved')

  it('setUp', () => {
    expect(unresolved.getAuthoredPath()).toBe(unresolved.getAssetPath())
    expect(unresolved.getResolvedPath()).toBe('')
    expect(unresolved.getEvaluatedPath()).toBe('')
  })

  it('test_EqualityOperators', () => {
    expect(unresolved.equals(unresolved)).toBe(true)
    expect(unresolved.equals(new AssetPath(unresolved))).toBe(true)
    expect(unresolved.equals(new AssetPath(unresolved.getAssetPath()))).toBe(true)
    expect(unresolved.equals(new AssetPath({ authoredPath: unresolved.getAssetPath() }))).toBe(true)
    expect(unresolved.equals(unresolvedChild)).toBe(false)
    expect(unresolved.equals(unresolvedParent)).toBe(false)
  })

  it('test_ComparisonOperators', () => {
    // Asset paths should be ordered such that they are less than their
    // descendants and greater than their ancestors
    expect(lt(unresolved, unresolvedChild)).toBe(true)
    expect(le(unresolved, unresolved)).toBe(true)
    expect(le(unresolved, unresolvedChild)).toBe(true)
    expect(gt(unresolved, unresolvedParent)).toBe(true)
    expect(ge(unresolved, unresolved)).toBe(true)
    expect(ge(unresolved, unresolvedParent)).toBe(true)
  })
})

describe('TestSdfAssetPathResolved', () => {
  // Test paths with valued path and resolvedPaths
  const resolved = new AssetPath('/unresolved/path', '/resolved/path')
  // `resolvedAlt` shares the unresolved path with `resolved` but has a
  // different resolved result
  const resolvedAlt = new AssetPath(resolved.getAssetPath(), `${resolved.getResolvedPath()}/alt`)
  const unresolved = new AssetPath(resolved.getAssetPath())

  it('setUp', () => {
    expect(unresolved.getResolvedPath()).toBe('')
    expect(resolved.getAssetPath()).toBe(resolvedAlt.getAssetPath())
    expect(resolved.getAuthoredPath()).toBe(unresolved.getAuthoredPath())
    expect(unresolved.getEvaluatedPath()).toBe('')
    expect(resolved.getResolvedPath()).not.toBe(resolvedAlt.getResolvedPath())
  })

  it('test_EqualityOperators', () => {
    expect(resolved.equals(resolved)).toBe(true)
    expect(resolved.equals(new AssetPath(resolved))).toBe(true)
    expect(resolved.equals(new AssetPath(resolved.getAssetPath(), resolved.getResolvedPath()))).toBe(true)
    expect(resolved.equals(new AssetPath({
      authoredPath: resolved.getAssetPath(), resolvedPath: resolved.getResolvedPath(),
    }))).toBe(true)

    expect(resolved.equals(unresolved)).toBe(false)
    expect(resolved.equals(resolvedAlt)).toBe(false)
  })

  it('test_ComparisonOperators', () => {
    // A resolved path should always be greater than its unresolved
    // equivalent
    expect(gt(resolved, unresolved)).toBe(true)
    expect(ge(resolved, resolved)).toBe(true)
    expect(ge(resolved, unresolved)).toBe(true)
  })
})

describe('TestSdfAssetPathEvaluated', () => {
  // Tests paths with evaluated paths
  const pathOnly = new AssetPath('`"/${VAR}/path"`')
  const expression = new AssetPath({
    authoredPath: '`"/${VAR}/path"`', evaluatedPath: '/evaluated/path',
  })
  const expressionAlt = new AssetPath({
    authoredPath: '`"/${VAR}/pathAlt"`', evaluatedPath: '/evaluated/pathAlt',
  })
  const resolved = new AssetPath({
    authoredPath: '`"/${VAR}/path"`', evaluatedPath: '/evaluated/path',
    resolvedPath: '/resolved/path',
  })
  const resolvedAlt = new AssetPath({
    authoredPath: '`"/${VAR}/pathAlt"`', evaluatedPath: '/evaluated/pathAlt',
    resolvedPath: '/resolved/pathAlt',
  })

  it('setUp', () => {
    expect(expression.getResolvedPath()).toBe('')
    expect(expression.getEvaluatedPath()).toBe('/evaluated/path')
    expect(expression.getAssetPath()).toBe(expression.getEvaluatedPath())
    expect(resolved.getResolvedPath()).toBe('/resolved/path')
  })

  it('test_EqualityOperators', () => {
    expect(expression.equals(expression)).toBe(true)
    expect(expression.equals(resolved)).toBe(false)
  })

  it('test_ComparisonOperatios', () => {
    expect(lt(expression, resolved)).toBe(true)
    expect(lt(expression, expressionAlt)).toBe(true)
    expect(lt(resolved, resolvedAlt)).toBe(true)
    expect(gt(expression, pathOnly)).toBe(true)
  })
})
