// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/type.cpp,
//  pxr/base/tf/testenv/testTfType.py,
//  pxr/base/tf/testenv/typeMultipleInheritance.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/base/tf/testenv/type.cpp (TfType),
// typeMultipleInheritance.cpp (TfType_MultipleInheritance), and the
// non-Python-runtime observables of testTfType.py (testTfType).
//
// Adaptation: upstream registers C++ classes via TfType::Define<T, Bases<...>>()
// and looks them up with typeid (Find<T>()). TS has no RTTI, so types are
// defined and found BY NAME. The graph/IsA/ancestor/derived assertions port
// verbatim. The C++-only pieces (pointer casting, the TfTypeWasDeclaredNotice)
// are private/runtime adaptations documented in type.ts.
import { describe, it, expect } from 'vitest'
import { Type as TfType, TypeInfoMap as TfTypeInfoMap, TfErrorMark } from '../../src/index.ts'

// Mirror the testenv class hierarchy:
//   ConcreteClass, IAbstractClass   (root-based)
//   ChildClass : ConcreteClass, IAbstractClass   (multiple inheritance)
//   GrandchildClass : ChildClass
//   OtherGrandchildClass : ChildClass
//   CountedClass, SingleClass       (root-based, standalone)
const tConcrete = TfType.define('ConcreteClass')
const tAbstract = TfType.define('IAbstractClass')
const tChild = TfType.define('ChildClass', [tConcrete, tAbstract])
const tGrandchild = TfType.define('GrandchildClass', [tChild])
const tOtherGrandchild = TfType.define('OtherGrandchildClass', [tChild])
const tCounted = TfType.define('CountedClass')
const tSingle = TfType.define('SingleClass')

const tRoot = TfType.getRoot()
const tUnknown = TfType.getUnknownType()

describe('TfType', () => {
  it('interns by name (=== is type identity)', () => {
    expect(TfType.findByName('ChildClass')).toBe(tChild)
    expect(TfType.findByName('ConcreteClass')).toBe(tConcrete)
    expect(TfType.findByName('NoSuchType')).toBe(tUnknown)
  })

  it('IsUnknown', () => {
    expect(tUnknown.isUnknown()).toBe(true)
    expect(tRoot.isUnknown()).toBe(false)
    for (const t of [tConcrete, tAbstract, tChild, tGrandchild, tCounted, tSingle]) {
      expect(t.isUnknown()).toBe(false)
    }
  })

  it('IsA: self, root, and the unknown rules', () => {
    // unknown IsA nothing; nothing IsA unknown
    expect(tUnknown.isA(tUnknown)).toBe(false)
    for (const t of [tRoot, tConcrete, tChild, tGrandchild]) {
      expect(t.isA(tRoot)).toBe(true) // everything IsA root
      expect(t.isA(t)).toBe(true) // and IsA itself
      expect(t.isA(tUnknown)).toBe(false)
    }
  })

  it('IsA: single + multiple inheritance', () => {
    expect(tChild.isA(tConcrete)).toBe(true)
    expect(tChild.isA(tAbstract)).toBe(true)
    expect(tConcrete.isA(tConcrete)).toBe(true)
    expect(tConcrete.isA(tChild)).toBe(false) // base is NOT a derived
    expect(tGrandchild.isA(tChild)).toBe(true)
    expect(tGrandchild.isA(tConcrete)).toBe(true) // transitive
    expect(tGrandchild.isA(tAbstract)).toBe(true)
    expect(tGrandchild.isA(tOtherGrandchild)).toBe(false) // siblings
  })

  it('GetBaseTypes', () => {
    expect(tChild.getBaseTypes()).toEqual([tConcrete, tAbstract])
    // a baseless declared type reports the root as its base
    expect(tConcrete.getBaseTypes()).toEqual([tRoot])
    expect(tRoot.getBaseTypes()).toEqual([])
  })

  it('GetAllAncestorTypes: self first, then ancestors in C3 (MRO) order', () => {
    // C++ contract (type.h): "The starting type is itself included, as the
    // first element," and the rest follow in C3 linearization order.
    //   Grandchild -> Child -> [Concrete, Abstract] -> Root
    expect(tGrandchild.getAllAncestorTypes())
      .toEqual([tGrandchild, tChild, tConcrete, tAbstract, tRoot])
    // single inheritance is a straight chain
    expect(tConcrete.getAllAncestorTypes()).toEqual([tConcrete, tRoot])
    // the root linearizes to just itself
    expect(tRoot.getAllAncestorTypes()).toEqual([tRoot])
    // the unknown type has no ancestors
    expect(tUnknown.getAllAncestorTypes()).toEqual([])
  })

  it('GetAllAncestorTypes: C3 keeps a diamond monotonic (DFS would not)', () => {
    //        DiaA
    //       /    \
    //    DiaB    DiaC
    //       \    /
    //        DiaD
    // C3 must place BOTH intermediates (DiaB, DiaC) before the shared
    // ancestor DiaA. A depth-first walk would surface DiaA right after DiaB,
    // ahead of DiaC — the exact non-monotonicity C3 exists to prevent.
    const A = TfType.define('DiaA')
    const B = TfType.define('DiaB', [A])
    const C = TfType.define('DiaC', [A])
    const D = TfType.define('DiaD', [B, C])
    expect(D.getAllAncestorTypes()).toEqual([D, B, C, A, tRoot])
  })

  it('GetDirectlyDerivedTypes / GetAllDerivedTypes', () => {
    expect(new Set(tChild.getDirectlyDerivedTypes()))
      .toEqual(new Set([tGrandchild, tOtherGrandchild]))
    const allDerived = new Set(tConcrete.getAllDerivedTypes())
    expect(allDerived.has(tChild)).toBe(true)
    expect(allDerived.has(tGrandchild)).toBe(true) // transitive
    expect(allDerived.has(tOtherGrandchild)).toBe(true)
  })

  it('aliases: AddAlias / GetAliases / FindDerivedByName', () => {
    tChild.addAlias(tConcrete, 'KidAlias')
    expect(tConcrete.getAliases(tChild)).toEqual(['KidAlias'])
    expect(tConcrete.findDerivedByName('KidAlias')).toBe(tChild)
    // by real name, must actually derive from the base
    expect(tConcrete.findDerivedByName('GrandchildClass')).toBe(tGrandchild)
    expect(tConcrete.findDerivedByName('SingleClass')).toBe(tUnknown)
  })

  it('root aliases participate in FindByName and collisions are rejected', () => {
    const agent = TfType.define('SecretAgent')
    const bond = TfType.define('JamesBond', [agent])
    bond.addAlias(tRoot, '007')
    expect(TfType.findByName('007')).toBe(bond)
    expect(tRoot.getAliases(bond)).toContain('007')
    expect(agent.findDerivedByName('007')).toBe(tUnknown)
    expect(() => bond.addAlias(tRoot, 'ConcreteClass')).toThrow()
  })

  it('inconsistent multiple inheritance reports the failed C3 linearization', () => {
    const A = TfType.define('ConflictA')
    const B = TfType.define('ConflictB')
    const X = TfType.define('ConflictX', [A, B])
    const Y = TfType.define('ConflictY', [B, A])
    const Z = TfType.define('ConflictZ', [X, Y])
    expect(() => Z.getAllAncestorTypes()).toThrow(/inconsistent inheritance/)
  })

  it('Declare is get-or-create; Define marks defined', () => {
    const a = TfType.declare('LazyType')
    const b = TfType.declare('LazyType')
    expect(a).toBe(b)
    expect(a.isDefined()).toBe(false)
    expect(TfType.define('LazyType').isDefined()).toBe(true)
    expect(a.isDefined()).toBe(true) // same interned instance
  })
})

// Ported from pxr/base/tf/testenv/typeInfoMap.cpp (TfTypeInfoMap). The map's
// private key normalization substitutes TfType/name for std::type_info.
describe('TfTypeInfoMap', () => {
  it('sets, aliases, finds, and invalidates aliases on removal', () => {
    const type = TfType.define('TypeInfoMapDouble')
    const map = new TfTypeInfoMap<number>()
    expect(map.exists(type)).toBe(false)
    expect(map.find(type)).toBeUndefined()
    map.Set(type, 13)
    expect(map.find(type)).toBe(13)
    expect(map.createAlias('doubleAlias', type)).toBe(true)
    expect(map.exists('doubleAlias')).toBe(true)
    map.Set('doubleAlias', 15)
    expect(map.find(type)).toBe(15)
    expect(map.createAlias(type.getTypeName(), type)).toBe(true)
    map.remove(type)
    expect(map.exists(type)).toBe(false)
    expect(map.exists('doubleAlias')).toBe(false)
    map.Set(type.getTypeName(), 14)
    expect(map.exists(type)).toBe(true)
  })

  it('returns false and leaves the map unchanged for an unknown alias target', () => {
    const map = new TfTypeInfoMap<number>()
    expect(map.createAlias('unknownAlias', 'unknownTarget')).toBe(false)
    expect(map.exists('unknownAlias')).toBe(false)
    expect(map.find('unknownAlias')).toBeUndefined()
  })
})

// type.cpp:500-549 (Test manufacture), with factories as plain objects.
describe('TfType manufacture', () => {
  class CountedClass { constructor(readonly number = 0) {} }
  const tCounted = TfType.define('TfTypeTest_CountedClass')
  tCounted.setFactory({ new: (number = 0) => new CountedClass(number) })
  let single: { number: number } | undefined
  const tSingle = TfType.define('TfTypeTest_SingleClass')
  tSingle.setFactory({ new: () => single ??= { number: 0 } })

  it('manufactures with the type\'s factory', () => {
    const factory = tCounted.getFactory<{ 'new'(number?: number): CountedClass }>()!
    expect(factory.new().number).toBe(0)
    expect(factory.new(123).number).toBe(123)
    const singleton = tSingle.getFactory<{ 'new'(): { number: number } }>()!
    const s1 = singleton.new()
    const s2 = singleton.new()
    expect(s1).toBe(s2)
    s1.number = 123
    expect(s2.number).toBe(123)
  })

  it('does not manufacture the unknown or root types', () => {
    const mark = new TfErrorMark()
    expect(TfType.getUnknownType().getFactory()).toBeUndefined()
    expect(TfType.getRoot().getFactory()).toBeUndefined()
    expect(mark.getNumErrors()).toBe(2)
    mark.clear()
    mark.dispose()
  })

  it('keeps the first factory', () => {
    const first = { new: () => 1 }
    const tFixed = TfType.define('TfTypeTest_FixedFactory')
    tFixed.setFactory(first)
    const mark = new TfErrorMark()
    tFixed.setFactory({ new: () => 2 })
    expect(mark.getErrors().map(error => error.getCommentary())).toEqual(['Cannot change the factory of TfTypeTest_FixedFactory\n'])
    mark.clear()
    mark.dispose()
    expect(tFixed.getFactory()).toBe(first)
  })
})
