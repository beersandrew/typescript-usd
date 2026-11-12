// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPath2.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfPath2.py.
//
// Python-only checks (repr round-trips) have no counterpart here. Python's
// str-to-Sdf.Path argument conversion is spelled out with SdfPath.fromString.

import { describe, expect, it } from 'vitest'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import { SdfPath } from '../../src/path.ts'

const P = (s: string): SdfPath => SdfPath.fromString(s)
const empty = SdfPath.emptyPath

// Runs `fn` with diagnostics trapped (the expected warnings of the error
// cases below).
function quiet<T>(fn: () => T): T {
  const trap = new TfDiagnosticTrap()
  try {
    return fn()
  } finally {
    trap.clear()
    trap.dismiss()
  }
}

const EmptyType = 1
const RootType = 2
const PrimType = 4
const PropertyType = 8
const PrimPropertyType = 16
const RelationalAttributeType = 32
const TargetType = 64
const MapperType = 128
const MapperArgType = 256
const ExpressionType = 512
const NamespacedPropertyType = 1024

// Sdf._PathElemsToPrefixes (pxr/usd/sdf/__init__.py:30-74), for the element
// lists used here (no '..' elements).
function pathElemsToPrefixes(absolute: boolean, elements: readonly string[]): string[] {
  const prefixes: string[] = []
  let string = absolute ? '/' : ''
  let didFirst = false
  for (const elem of elements) {
    if (elem[0] === '.' || elem[0] === '[') {
      string += elem
    } else {
      if (didFirst) string += '/'
      else didFirst = true
      string += elem
    }
    prefixes.push(P(string).pathString)
  }
  return string ? prefixes : []
}

function checkPath(
  path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[],
  pathFlags: number, name: string, targetPath: SdfPath,
): void {
  // Check absolute root.
  expect(path.isAbsoluteRootPath()).toBe(pathStr === '/')
  // Check equality with another one constructed the same way
  expect(path.equals(path2)).toBe(true)
  // Check properties
  expect(path.pathString).toBe(pathStr)
  expect(path.name).toBe(name)
  expect(path.pathElementCount).toBe(pathElems.length)
  expect(path.getTargetPath().pathString).toBe(targetPath.pathString)
  // Check queries
  expect(path.isAbsolutePath()).toBe(pathStr.startsWith('/'))
  expect(path.isPrimPath()).toBe((pathFlags & PrimType) !== 0 || path.equals(SdfPath.reflexiveRelativePath))
  if (path.isPrimPath()) expect(path.containsPropertyElements()).toBe(false)
  expect(path.isRootPrimPath()).toBe((pathFlags & PrimType) !== 0 && pathElems.length === 1)
  expect(path.isPropertyPath()).toBe((pathFlags & PropertyType) !== 0)
  if (pathFlags & NamespacedPropertyType) {
    expect(path.isNamespacedPropertyPath()).toBe(true)
    expect(path.containsPropertyElements()).toBe(true)
  }
  if (pathFlags & PrimPropertyType) {
    expect(path.isPrimPropertyPath()).toBe(true)
    expect(path.containsPropertyElements()).toBe(true)
  }
  if (pathFlags & RelationalAttributeType) {
    expect(path.isRelationalAttributePath()).toBe(true)
    expect(path.isTargetPath()).toBe((pathFlags & TargetType) !== 0)
    expect(path.isMapperPath()).toBe((pathFlags & MapperType) !== 0)
    expect(path.isMapperArgPath()).toBe((pathFlags & MapperArgType) !== 0)
    expect(path.isExpressionPath()).toBe((pathFlags & ExpressionType) !== 0)
    expect(path.containsPropertyElements()).toBe(true)
  }
  if (pathFlags & (TargetType | MapperType | MapperArgType)) {
    expect(path.containsTargetPath()).toBe(true)
    expect(path.containsPropertyElements()).toBe(true)
  }
  // Check path elements
  expect(path.getPrefixes().map(p => p.pathString)).toEqual(pathElemsToPrefixes(path.isAbsolutePath(), pathElems))
  // Check parent
  expect(path.getParentPath().pathString).toBe(parentPath.pathString)
  // Make sure all parent prefixes are recognized as prefixes, and that each
  // prefix (including terminal) is reconstructible from its string element
  // representation
  let currPath = path
  while (!parentPath.isEmpty() && parentPath.name !== '..') {
    const reconPath = parentPath.appendElementString(currPath.elementString)
    expect(path.hasPrefix(parentPath)).toBe(true)
    expect(reconPath.pathString).toBe(currPath.pathString)
    currPath = parentPath
    parentPath = parentPath.getParentPath()
  }
}

const checkEmptyPath = (path: SdfPath): void => {
  checkPath(path, empty, empty, '', [], EmptyType, '', empty)
  expect(path.isEmpty()).toBe(true)
}
const checkRootPath = (path: SdfPath, path2: SdfPath, pathStr: string): void => {
  const parent = pathStr === '/' ? empty : path.appendChild('..')
  checkPath(path, path2, parent, pathStr, [], RootType, pathStr, empty)
}
const checkPrimPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], name: string): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, PrimType, name, empty)
const checkPrimPropertyPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], name: string): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, PropertyType | PrimPropertyType, name, empty)
const checkPrimNamespacedPropertyPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], name: string): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, PropertyType | PrimPropertyType | NamespacedPropertyType, name, empty)
const checkTargetPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], targetPath: SdfPath): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, TargetType, '', targetPath)
const checkRelationalAttributePath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], name: string): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, PropertyType | RelationalAttributeType, name, parentPath.getTargetPath())
const checkMapperPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], targetPath: SdfPath): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, MapperType, '', targetPath)
const checkMapperArgPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[], name: string): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, MapperArgType, name, parentPath.getTargetPath())
const checkExpressionPath = (path: SdfPath, path2: SdfPath, parentPath: SdfPath, pathStr: string, pathElems: string[]): void =>
  checkPath(path, path2, parentPath, pathStr, pathElems, ExpressionType, 'expression', parentPath.getTargetPath())

const checkOrdering = (...args: SdfPath[]): void => {
  for (let i = 0; i < args.length - 1; i++) {
    expect(SdfPath.compare(args[i]!, args[i + 1]!),
      `Expected <${args[i]!.pathString}> to compare less-than <${args[i + 1]!.pathString}>`).toBeLessThan(0)
  }
}

const eq = (actual: SdfPath, expected: string | SdfPath): void => {
  expect(actual.pathString).toBe(typeof expected === 'string' ? P(expected).pathString : expected.pathString)
}

describe('testSdfPath2', () => {
  it('test_Basic: construction and ordering', () => {
    // --- Check Empty path
    checkEmptyPath(empty)
    expect(empty.isPrimPropertyPath()).toBe(false)
    expect(empty.isNamespacedPropertyPath()).toBe(false)
    expect(empty.isRelationalAttributePath()).toBe(false)
    expect(SdfPath.compare(empty, empty) < 0).toBe(false)

    const absRoot = SdfPath.absoluteRootPath
    checkRootPath(absRoot, SdfPath.absoluteRootPath, '/')
    checkOrdering(empty, absRoot)

    const relRoot = SdfPath.reflexiveRelativePath
    checkRootPath(relRoot, SdfPath.reflexiveRelativePath, '.')
    checkOrdering(empty, absRoot, relRoot)

    const rootPrim = absRoot.appendChild('Foo')
    checkPrimPath(rootPrim, absRoot.appendChild('Foo'), absRoot, '/Foo', ['Foo'], 'Foo')
    checkOrdering(empty, absRoot, rootPrim, relRoot)

    const rootPrim2 = absRoot.appendChild('Bar')
    checkPrimPath(rootPrim2, absRoot.appendChild('Bar'), absRoot, '/Bar', ['Bar'], 'Bar')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, relRoot)

    const childPrim = rootPrim.appendChild('Bar')
    checkPrimPath(childPrim, rootPrim.appendChild('Bar'), rootPrim, '/Foo/Bar', ['Foo', 'Bar'], 'Bar')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, childPrim, relRoot)

    const childPrim2 = rootPrim.appendChild('Foo')
    checkPrimPath(childPrim2, rootPrim.appendChild('Foo'), rootPrim, '/Foo/Foo', ['Foo', 'Foo'], 'Foo')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, childPrim, childPrim2, relRoot)

    const rootProp = rootPrim.appendProperty('prop1')
    checkPrimPropertyPath(rootProp, rootPrim.appendProperty('prop1'), rootPrim, '/Foo.prop1', ['Foo', '.prop1'], 'prop1')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, childPrim, childPrim2, relRoot)

    const rootProp2 = rootPrim.appendProperty('prop2')
    checkPrimPropertyPath(rootProp2, rootPrim.appendProperty('prop2'), rootPrim, '/Foo.prop2', ['Foo', '.prop2'], 'prop2')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootProp2, childPrim, childPrim2, relRoot)

    const rootProp3 = rootPrim.appendProperty('prop3:bar:baz')
    checkPrimNamespacedPropertyPath(rootProp3, rootPrim.appendProperty('prop3:bar:baz'), rootPrim, '/Foo.prop3:bar:baz', ['Foo', '.prop3:bar:baz'], 'prop3:bar:baz')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootProp3, childPrim, childPrim2, relRoot)

    const childProp = childPrim.appendProperty('foo')
    checkPrimPropertyPath(childProp, childPrim.appendProperty('foo'), childPrim, '/Foo/Bar.foo', ['Foo', 'Bar', '.foo'], 'foo')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, childPrim, childProp, childPrim2, relRoot)

    const childProp2 = childPrim.appendProperty('bar')
    checkPrimPropertyPath(childProp2, childPrim.appendProperty('bar'), childPrim, '/Foo/Bar.bar', ['Foo', 'Bar', '.bar'], 'bar')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, childPrim, childProp2, childProp, childPrim2, relRoot)

    const rootPropTarg = rootProp.appendTarget(P('/Target1'))
    checkTargetPath(rootPropTarg, rootProp.appendTarget(P('/Target1')), rootProp, '/Foo.prop1[/Target1]', ['Foo', '.prop1', '[/Target1]'], P('/Target1'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg, childPrim, childPrim2, relRoot)

    const rootPropTarg2 = rootProp.appendTarget(P('/FooTarget.bar'))
    checkTargetPath(rootPropTarg2, rootProp.appendTarget(P('/FooTarget.bar')), rootProp, '/Foo.prop1[/FooTarget.bar]', ['Foo', '.prop1', '[/FooTarget.bar]'], P('/FooTarget.bar'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropTarg, childPrim, childPrim2, relRoot)

    const rootPropRelAttr = rootPropTarg.appendRelationalAttribute('fooAttr')
    checkRelationalAttributePath(rootPropRelAttr, rootPropTarg.appendRelationalAttribute('fooAttr'), rootPropTarg, '/Foo.prop1[/Target1].fooAttr', ['Foo', '.prop1', '[/Target1]', '.fooAttr'], 'fooAttr')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropTarg, rootPropRelAttr, childPrim, childPrim2, relRoot)

    const rootPropRelAttr2 = rootPropTarg.appendRelationalAttribute('barAttr')
    checkRelationalAttributePath(rootPropRelAttr2, rootPropTarg.appendRelationalAttribute('barAttr'), rootPropTarg, '/Foo.prop1[/Target1].barAttr', ['Foo', '.prop1', '[/Target1]', '.barAttr'], 'barAttr')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, childPrim, childPrim2, relRoot)

    const rootPropRelAttr3 = rootPropTarg2.appendRelationalAttribute('barAttr')
    checkRelationalAttributePath(rootPropRelAttr3, rootPropTarg2.appendRelationalAttribute('barAttr'), rootPropTarg2, '/Foo.prop1[/FooTarget.bar].barAttr', ['Foo', '.prop1', '[/FooTarget.bar]', '.barAttr'], 'barAttr')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, childPrim, childPrim2, relRoot)

    const rootPropRelAttr4 = rootPropTarg2.appendRelationalAttribute('fooAttr')
    checkRelationalAttributePath(rootPropRelAttr4, rootPropTarg2.appendRelationalAttribute('fooAttr'), rootPropTarg2, '/Foo.prop1[/FooTarget.bar].fooAttr', ['Foo', '.prop1', '[/FooTarget.bar]', '.fooAttr'], 'fooAttr')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, childPrim, childPrim2, relRoot)

    const rootPropRelAttr5 = rootPropTarg2.appendRelationalAttribute('fooAttr:bar:baz')
    checkRelationalAttributePath(rootPropRelAttr5, rootPropTarg2.appendRelationalAttribute('fooAttr:bar:baz'), rootPropTarg2, '/Foo.prop1[/FooTarget.bar].fooAttr:bar:baz', ['Foo', '.prop1', '[/FooTarget.bar]', '.fooAttr:bar:baz'], 'fooAttr:bar:baz')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr5, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, childPrim, childPrim2, relRoot)

    const rootPropRelAttrTarget = rootPropRelAttr.appendTarget(P('/ConnTarget1.attr'))
    checkTargetPath(rootPropRelAttrTarget, rootPropRelAttr.appendTarget(P('/ConnTarget1.attr')), rootPropRelAttr, '/Foo.prop1[/Target1].fooAttr[/ConnTarget1.attr]', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '[/ConnTarget1.attr]'], P('/ConnTarget1.attr'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, childPrim, childPrim2, relRoot)

    const rootPropRelAttrTarget2 = rootPropRelAttr.appendTarget(P('/ConnTarget2.attr'))
    checkTargetPath(rootPropRelAttrTarget2, rootPropRelAttr.appendTarget(P('/ConnTarget2.attr')), rootPropRelAttr, '/Foo.prop1[/Target1].fooAttr[/ConnTarget2.attr]', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '[/ConnTarget2.attr]'], P('/ConnTarget2.attr'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, childPrim, childPrim2, relRoot)

    const rootPropMapper1 = rootProp.appendMapper(P('/ConnTarget1.attr'))
    checkMapperPath(rootPropMapper1, rootProp.appendMapper(P('/ConnTarget1.attr')), rootProp, '/Foo.prop1.mapper[/ConnTarget1.attr]', ['Foo', '.prop1', '.mapper[/ConnTarget1.attr]'], P('/ConnTarget1.attr'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropMapper1, childPrim, childPrim2, relRoot)

    const rootPropMapper2 = rootProp.appendMapper(P('/ConnTarget2.attr'))
    checkMapperPath(rootPropMapper2, rootProp.appendMapper(P('/ConnTarget2.attr')), rootProp, '/Foo.prop1.mapper[/ConnTarget2.attr]', ['Foo', '.prop1', '.mapper[/ConnTarget2.attr]'], P('/ConnTarget2.attr'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropMapper1, rootPropMapper2, childPrim, childPrim2, relRoot)

    const rootPropExpression = rootProp.appendExpression()
    checkExpressionPath(rootPropExpression, rootProp.appendExpression(), rootProp, '/Foo.prop1.expression', ['Foo', '.prop1', '.expression'])
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropMapper1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropMapperArg1 = rootPropMapper1.appendMapperArg('fooArg')
    checkMapperArgPath(rootPropMapperArg1, rootPropMapper1.appendMapperArg('fooArg'), rootPropMapper1, '/Foo.prop1.mapper[/ConnTarget1.attr].fooArg', ['Foo', '.prop1', '.mapper[/ConnTarget1.attr]', '.fooArg'], 'fooArg')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropMapper1, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropMapperArg2 = rootPropMapper1.appendMapperArg('barArg')
    checkMapperArgPath(rootPropMapperArg2, rootPropMapper1.appendMapperArg('barArg'), rootPropMapper1, '/Foo.prop1.mapper[/ConnTarget1.attr].barArg', ['Foo', '.prop1', '.mapper[/ConnTarget1.attr]', '.barArg'], 'barArg')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropMapper1, rootPropMapperArg2, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropRelAttrMapper1 = rootPropRelAttr.appendMapper(P('/ConnTarget1.attr'))
    checkMapperPath(rootPropRelAttrMapper1, rootPropRelAttr.appendMapper(P('/ConnTarget1.attr')), rootPropRelAttr, '/Foo.prop1[/Target1].fooAttr.mapper[/ConnTarget1.attr]', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '.mapper[/ConnTarget1.attr]'], P('/ConnTarget1.attr'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropRelAttrMapper1, rootPropMapper1, rootPropMapperArg2, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropRelAttrMapper2 = rootPropRelAttr.appendMapper(P('/ConnTarget2.attr'))
    checkMapperPath(rootPropRelAttrMapper2, rootPropRelAttr.appendMapper(P('/ConnTarget2.attr')), rootPropRelAttr, '/Foo.prop1[/Target1].fooAttr.mapper[/ConnTarget2.attr]', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '.mapper[/ConnTarget2.attr]'], P('/ConnTarget2.attr'))
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropRelAttrMapper1, rootPropRelAttrMapper2, rootPropMapper1, rootPropMapperArg2, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropRelAttrExpression = rootPropRelAttr.appendExpression()
    checkExpressionPath(rootPropRelAttrExpression, rootPropRelAttr.appendExpression(), rootPropRelAttr, '/Foo.prop1[/Target1].fooAttr.expression', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '.expression'])
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropRelAttrMapper1, rootPropRelAttrMapper2, rootPropRelAttrExpression, rootPropMapper1, rootPropMapperArg2, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropRelAttrMapperArg1 = rootPropRelAttrMapper1.appendMapperArg('fooArg')
    checkMapperArgPath(rootPropRelAttrMapperArg1, rootPropRelAttrMapper1.appendMapperArg('fooArg'), rootPropRelAttrMapper1, '/Foo.prop1[/Target1].fooAttr.mapper[/ConnTarget1.attr].fooArg', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '.mapper[/ConnTarget1.attr]', '.fooArg'], 'fooArg')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropRelAttrMapper1, rootPropRelAttrMapperArg1, rootPropRelAttrMapper2, rootPropRelAttrExpression, rootPropMapper1, rootPropMapperArg2, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)

    const rootPropRelAttrMapperArg2 = rootPropRelAttrMapper1.appendMapperArg('barArg')
    checkMapperArgPath(rootPropRelAttrMapperArg2, rootPropRelAttrMapper1.appendMapperArg('barArg'), rootPropRelAttrMapper1, '/Foo.prop1[/Target1].fooAttr.mapper[/ConnTarget1.attr].barArg', ['Foo', '.prop1', '[/Target1]', '.fooAttr', '.mapper[/ConnTarget1.attr]', '.barArg'], 'barArg')
    checkOrdering(empty, absRoot, rootPrim2, rootPrim, rootProp, rootPropTarg2, rootPropRelAttr3, rootPropRelAttr4, rootPropTarg, rootPropRelAttr2, rootPropRelAttr, rootPropRelAttrTarget, rootPropRelAttrTarget2, rootPropRelAttrMapper1, rootPropRelAttrMapperArg2, rootPropRelAttrMapperArg1, rootPropRelAttrMapper2, rootPropRelAttrExpression, rootPropMapper1, rootPropMapperArg2, rootPropMapperArg1, rootPropMapper2, rootPropExpression, childPrim, childPrim2, relRoot)
  })

  it('test_Basic: GetPrimPath, ReplacePrefix, GetCommonPrefix', () => {
    eq(P('foo').getPrimPath(), 'foo')
    eq(P('foo/bar').getPrimPath(), 'foo/bar')
    eq(P('foo.bar').getPrimPath(), 'foo')
    eq(P('foo.bar[foo].bar').getPrimPath(), 'foo')

    const rp = (path: string, oldPrefix: string, newPrefix: string): SdfPath =>
      P(path).replacePrefix(P(oldPrefix), P(newPrefix))
    eq(rp('/a', '/a', '/b'), '/b')
    eq(rp('/a/b', '/a', '/b'), '/b/b')
    eq(rp('a', 'a', 'b'), 'b')
    eq(rp('foo/bar', 'foo', 'bar'), 'bar/bar')
    eq(rp('foo.bar', 'foo', 'bar'), 'bar.bar')
    eq(rp('foo.bar:baz', 'foo', 'bar'), 'bar.bar:baz')
    eq(rp('foo.bar[/foo].attr', 'foo.bar', 'a.b'), 'a.b[/foo].attr')
    eq(rp('/foo.bar[foo.bar].attr', 'foo.bar', 'a.b'), '/foo.bar[a.b].attr')
    eq(rp('/foo.bar[foo.bar].attr:baz', 'foo.bar', 'a.b'), '/foo.bar[a.b].attr:baz')
    eq(rp('/foo.bar[/foo.bar].attr', '/foo.bar', '/a.b'), '/a.b[/a.b].attr')
    eq(rp('/foo.bar[/foo.bar[/foo.bar].attr].attr', '/foo.bar', '/a.b'), '/a.b[/a.b[/a.b].attr].attr')
    eq(rp('/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]', '/foo', '/a/b'), '/a/b.rel[/a/b/prim].relAttr.mapper[/a/b/prim.attr]')
    eq(rp('bar.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]', '/foo', '/a/b'), 'bar.rel[/a/b/prim].relAttr.mapper[/a/b/prim.attr]')
    eq(rp('../bar', '..', 'bar'), 'bar/bar')

    const cp = (a: string, b: string): SdfPath => P(a).getCommonPrefix(P(b))
    eq(cp('/a', '/a'), '/a')
    eq(cp('/a/b', '/a/b'), '/a/b')
    eq(cp('/a.b', '/a.b'), '/a.b')
    eq(cp('/a/b', '/b/a'), '/')
    eq(cp('/a/b/c', '/a/b'), '/a/b')
    eq(cp('/a/b', '/a/b/c'), '/a/b')
    eq(cp('/a/b.c', '/a/b'), '/a/b')
    eq(cp('/a/b', '/a/b.c'), '/a/b')
    eq(cp('/foo.bar[/foo].attr', '/foo.foo[/foo].attr'), '/foo')
    eq(cp('/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]', '/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]'), '/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]')
    eq(cp('/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr].x', '/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr].y'), '/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]')
    eq(cp('/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr1]', '/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr2]'), '/foo.rel[/foo/prim].relAttr')
    eq(cp('/foo.rel[/foo/prim].relAttr.mapper[/foo/prim.attr]', '/foo.rel[/foo/prim2].relAttr.mapper[/foo/prim.attr]'), '/foo.rel')
  })

  it('test_Basic: MakeAbsolutePath, MakeRelativePath, GetPrefixes', () => {
    const abs = (path: SdfPath, anchor: string): SdfPath => path.makeAbsolutePath(P(anchor))
    eq(abs(P('..'), '/foo/bar'), '/foo')
    eq(abs(P('/A/B/C/D.rel[../../E.rel[F.attr].attr].attr'), '/A/B'), '/A/B/C/D.rel[/A/B/E.rel[/A/B/E/F.attr].attr].attr')
    eq(abs(P('C/D.rel[../../E.rel[F.attr].attr].attr'), '/A/B'), '/A/B/C/D.rel[/A/B/E.rel[/A/B/E/F.attr].attr].attr')
    eq(abs(P('../.attr'), '/foo/bar'), '/foo.attr')
    quiet(() => eq(abs(P('../.attr[1 & 2]'), '/foo/bar'), P('/foo.attr[1 & 2]')))
    eq(abs(empty, '/foo/bar'), empty)
    eq(abs(P('.attr.mapper[/connection.target]'), '/foo/bar'), '/foo/bar.attr.mapper[/connection.target]')
    eq(abs(P('.attr.mapper[/connection.target].arg'), '/foo/bar'), '/foo/bar.attr.mapper[/connection.target].arg')
    eq(abs(P('.attr.expression'), '/foo/bar'), '/foo/bar.attr.expression')

    eq(P('/foo/bar').makeRelativePath(P('/foo')), 'bar')
    eq(P('/foo').makeRelativePath(P('/foo')), '.')
    eq(P('/foo').makeRelativePath(P('/foo/bar')), '..')
    eq(empty.makeRelativePath(P('/foo/bar')), empty)

    expect(P('/foo/bar/goo/loo').getPrefixes().map(p => p.pathString))
      .toEqual(['/foo', '/foo/bar', '/foo/bar/goo', '/foo/bar/goo/loo'])
  })

  it('test_Basic: ReplaceTargetPath', () => {
    const rt = (path: string, target: string): SdfPath => quiet(() => P(path).replaceTargetPath(P(target)))
    eq(rt('/prim.rel[foo].attr', 'bar'), '/prim.rel[bar].attr')
    eq(rt('/prim.rel[foo].attr:baz', 'bar'), '/prim.rel[bar].attr:baz')
    quiet(() => eq(rt('/prim.rel[foo].attr[1]', 'bar'), P('/prim.rel[bar].attr[1]')))
    eq(rt('foo', 'bar'), 'foo')
    eq(rt('/prim.attr.mapper[/foo.target]', '/bar.target'), '/prim.attr.mapper[/bar.target]')
    eq(rt('/prim.attr.mapper[/foo.target].arg', '/bar.target'), '/prim.attr.mapper[/bar.target].arg')
    eq(rt('/prim.rel[foo].attr.expression', 'bar'), '/prim.rel[bar].attr.expression')
    eq(rt('/prim.rel[foo].attr.expression', 'bar:baz'), quiet(() => P('/prim.rel[bar:baz].attr.expression')))
    eq(rt('/prim.rel[/prim].relAttr.mapper[/prim.attr]', '/bar.attr'), '/prim.rel[/prim].relAttr.mapper[/bar.attr]')
    eq(rt('/prim.rel[/prim].relAttr.mapper[/prim.attr]', '/bar.attr:baz'), '/prim.rel[/prim].relAttr.mapper[/bar.attr:baz]')
  })

  it('test_Basic: AppendPath', () => {
    const ap = (path: string, suffix: string): SdfPath => quiet(() => P(path).appendPath(P(suffix)))
    eq(ap('/prim', '.'), '/prim')
    eq(ap('/', 'foo/bar.attr'), '/foo/bar.attr')
    eq(ap('/', 'foo/bar.attr:argle:bargle'), '/foo/bar.attr:argle:bargle')
    eq(ap('/foo', 'bar.attr'), '/foo/bar.attr')
    eq(ap('/foo', 'bar.attr:argle:bargle'), '/foo/bar.attr:argle:bargle')
    eq(ap('/foo', 'bar.rel[/target].attr'), '/foo/bar.rel[/target].attr')
    eq(ap('/foo', 'bar.rel[/target].attr:argle:bargle'), '/foo/bar.rel[/target].attr:argle:bargle')
    eq(ap('/foo', 'bar.attr[/target.attr]'), '/foo/bar.attr[/target.attr]')
    eq(ap('/foo', 'bar.attr[/target.attr:argle:bargle]'), '/foo/bar.attr[/target.attr:argle:bargle]')
    eq(ap('/foo', 'bar.attr.mapper[/target].arg'), '/foo/bar.attr.mapper[/target].arg')

    eq(ap('/prim', '/absolute'), empty)
    eq(ap('/prim.attr', 'prim'), empty)
    eq(ap('/', '.prop'), empty)
  })

  it('test_Basic: error cases', () => {
    quiet(() => {
      eq(P('.').getPrimPath(), empty)
      eq(P('.foo').getPrimPath(), empty)
      eq(P('foo.bar').appendChild('a'), empty)
      eq(P('foo.bar').appendProperty('a'), empty)
      eq(P('foo').appendTarget(P('/foo')), empty)
      eq(P('foo').replacePrefix(P('bar'), P('bar')), 'foo')
      eq(P('foo').replacePrefix(empty, P('bar')), empty)
      eq(P('foo').replacePrefix(P('foo'), empty), empty)
      eq(P('foo').getCommonPrefix(empty), empty)
      eq(P('foo').makeAbsolutePath(P('foo')), empty)
      eq(P('foo').makeAbsolutePath(empty), empty)
      eq(P('foo').makeRelativePath(P('foo')), empty)
      eq(P('foo').makeRelativePath(empty), empty)
      eq(P('foo').getTargetPath(), empty)
      eq(P('foo').replaceTargetPath(empty), empty)
      eq(empty.replaceTargetPath(P('foo')), empty)
      eq(P('foo').appendChild('!@#$$>.'), empty)
      eq(P('foo').appendProperty('.'), empty)
      eq(P('foo.prop[foo]').appendRelationalAttribute('.'), empty)
      eq(P('foo').appendMapper(P('/conn.target')), empty)
      eq(P('foo.attr').appendMapper(empty), empty)
      eq(P('foo.attr.mapper[/conn.target]').appendMapperArg('./bad'), empty)
      eq(P('foo').appendMapperArg('arg'), empty)
      eq(P('foo').appendExpression(), empty)

      eq(P('foo.bar').appendTarget(empty), empty)
      eq(empty.makeRelativePath(P('foo')), empty)

      // Retest all of the above Append negatives with the equivalent
      // AppendElementString()
      eq(P('foo.bar').appendElementString('a'), empty)
      eq(P('foo.bar').appendElementString('.a'), empty)
      eq(P('foo').appendElementString('[/foo]'), empty)
      eq(P('foo').appendElementString('!@#$$>.'), empty)
      eq(P('foo').appendElementString('..'), empty)
      eq(P('foo.prop[foo]').appendElementString('[.]'), empty)
      eq(P('foo').appendElementString('.mapper[/conn.target]'), empty)
      eq(P('foo.attr').appendElementString('.mapper[]'), empty)
      eq(P('foo.attr.mapper[/conn.target]').appendElementString('./bad'), empty)
      eq(P('foo.bar').appendElementString('[]'), empty)

      eq(P('/foo').getTargetPath(), empty)
    })
  })

  it('test_Basic: variant selections', () => {
    expect(P('/foo/bar').containsPrimVariantSelection()).toBe(false)
    expect(P('/foo/bar').containsPropertyElements()).toBe(false)
    expect(P('/foo/bar{var=sel}').containsPrimVariantSelection()).toBe(true)
    expect(P('/foo/bar{var=sel}').containsPropertyElements()).toBe(false)
    expect(P('/foo/bar{var=sel}').isPrimVariantSelectionPath()).toBe(true)
    expect(P('/foo{var=sel}bar').containsPrimVariantSelection()).toBe(true)
    expect(P('/foo{var=sel}bar').isPrimVariantSelectionPath()).toBe(false)
    expect(P('/foo{var=sel}bar').getVariantSelection()).toEqual(['', ''])
    expect(P('/foo{var=sel}bar').getParentPath().getVariantSelection()).toEqual(['var', 'sel'])
    expect(P('/foo/bar{var=sel}').getVariantSelection()).toEqual(['var', 'sel'])
    eq(P('/foo/bar').stripAllVariantSelections(), '/foo/bar')
    eq(P('/foo/bar{var=sel}').stripAllVariantSelections(), '/foo/bar')
    eq(P('/foo/bar{var=sel}baz/frob').stripAllVariantSelections(), '/foo/bar/baz/frob')
    eq(P('/foo{bond=connery}bar{captain=picard}baz/frob{doctor=tennent}').stripAllVariantSelections(), '/foo/bar/baz/frob')
    eq(P('/ᄆfoo{刷ꡟ=鞏bar}bar/baz/𓌘ascii𓋏').stripAllVariantSelections(), '/ᄆfoo/bar/baz/𓌘ascii𓋏')
  })

  it('test_Basic: identifier utilities', () => {
    expect(SdfPath.tokenizeIdentifier('')).toEqual([])
    expect(SdfPath.tokenizeIdentifier('foo')).toEqual(['foo'])
    expect(SdfPath.tokenizeIdentifier('foo::baz')).toEqual([])
    expect(SdfPath.tokenizeIdentifier('foo:bar:baz')).toEqual(['foo', 'bar', 'baz'])
    expect(SdfPath.tokenizeIdentifier('ᄆfoo::鞏bar')).toEqual([])
    expect(SdfPath.tokenizeIdentifier('ᄆfoo:鞏bar:ascii𓋏')).toEqual(['ᄆfoo', '鞏bar', 'ascii𓋏'])
    expect(SdfPath.tokenizeIdentifier(':')).toEqual([])
    expect(SdfPath.tokenizeIdentifier(':abcdef')).toEqual([])
    expect(SdfPath.tokenizeIdentifier('0:abc')).toEqual([])

    expect(SdfPath.joinIdentifier([])).toBe('')
    expect(SdfPath.joinIdentifier(['foo'])).toBe('foo')
    expect(SdfPath.joinIdentifier(['foo', 'bar', 'baz'])).toBe('foo:bar:baz')
    expect(SdfPath.joinIdentifier(['foo', '', 'baz'])).toBe('foo:baz')
    expect(SdfPath.joinIdentifier(['foo', 'bar', ''])).toBe('foo:bar')
    expect(SdfPath.joinIdentifier(['', 'bar', 'baz'])).toBe('bar:baz')
    expect(SdfPath.joinIdentifier(['', 'bar', ''])).toBe('bar')

    expect(SdfPath.stripNamespace(SdfPath.joinIdentifier([]))).toBe('')
    expect(SdfPath.stripNamespace(SdfPath.joinIdentifier(['foo']))).toBe('foo')
    expect(SdfPath.stripNamespace(SdfPath.joinIdentifier(['foo', 'bar', 'baz']))).toBe('baz')

    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier([]), '')).toEqual(['', false])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo']), 'foo')).toEqual(['foo', false])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar']), 'foo')).toEqual(['bar', true])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar']), 'foo:')).toEqual(['bar', true])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar']), 'f')).toEqual(['foo:bar', false])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar', 'baz']), 'foo:')).toEqual(['bar:baz', true])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar', 'baz']), 'foo:bar')).toEqual(['baz', true])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar', 'baz']), 'foo:bar:')).toEqual(['baz', true])
    expect(SdfPath.stripPrefixNamespace(SdfPath.joinIdentifier(['foo', 'bar', 'baz']), 'nothere:')).toEqual(['foo:bar:baz', false])

    expect(SdfPath.joinIdentifier('', '')).toBe('')
    expect(SdfPath.joinIdentifier('foo', '')).toBe('foo')
    expect(SdfPath.joinIdentifier('', 'foo')).toBe('foo')
    expect(SdfPath.joinIdentifier('foo', 'bar')).toBe('foo:bar')
    expect(SdfPath.joinIdentifier('foo:bar', 'baz')).toBe('foo:bar:baz')
    expect(SdfPath.joinIdentifier('foo', 'baz:blah')).toBe('foo:baz:blah')
    expect(SdfPath.joinIdentifier('foo:bar', 'baz:blah')).toBe('foo:bar:baz:blah')
  })

  it('test_Basic: nested variant selections', () => {
    const p1 = P('/a')
    const p2 = p1.appendVariantSelection('x', 'a')
    const p3 = p2.appendVariantSelection('y', 'b')
    // It is allowable to make repeated selections for the same variant set.
    const p2x = p2.appendVariantSelection('x', 'a')
    const p3x = p3.appendVariantSelection('x', 'a')
    eq(p2x, '/a{x=a}{x=a}')
    eq(p3x, '/a{x=a}{y=b}{x=a}')
    expect(p1.containsPrimVariantSelection()).toBe(false)
    expect(p2.containsPrimVariantSelection()).toBe(true)
    expect(p3.containsPrimVariantSelection()).toBe(true)
    expect(p2.getVariantSelection()).toEqual(['x', 'a'])
    expect(p3.getVariantSelection()).toEqual(['y', 'b'])
    eq(p1, '/a')
    eq(p2, '/a{x=a}')
    eq(p3, '/a{x=a}{y=b}')
    eq(p2.getParentPath(), p1)
    eq(p3.getParentPath(), p2)
    expect(p3.hasPrefix(p2)).toBe(true)
    expect(p2.hasPrefix(p1)).toBe(true)
    eq(p3.replacePrefix(p2, P('/b')), '/b{y=b}')
  })
})
