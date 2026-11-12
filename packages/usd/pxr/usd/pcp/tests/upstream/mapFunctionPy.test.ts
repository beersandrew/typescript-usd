// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpMapFunction.py,
//  pxr/usd/pcp/wrapMapFunction.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/pcp/testenv/testPcpMapFunction.py
// (registration testPcpMapFunction). Pcp.MapFunction(dict[, offset]) is
// PcpMapFunction.create, '' / Sdf.Path() is the empty (block) path, and
// operator== is equals().
//
// Out of scope: test_Basics' `eval(repr(m)) == m` round-trip
// (wrapMapFunction.cpp's Python repr); the equality/identity/null laws of
// test_Basics are ported.
import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import type { SdfLayerOffset } from 'typescript-usd/sdf/layerOffset'
import { MapFunction as PcpMapFunction } from '../../src/index.ts'

const IDENTITY_OFFSET: SdfLayerOffset = { offset: 0, scale: 1 }
const MF = (map: Record<string, string> = {}, offset: SdfLayerOffset = IDENTITY_OFFSET) =>
  PcpMapFunction.create(
    Object.entries(map).map(([k, v]) => [k, v === '' ? SdfPath.emptyPath : v] as const), offset)
const P = (s: string) => SdfPath.fromString(s)
const DeferredComposition = (m: PcpMapFunction) => PcpMapFunction.deferredComposition(m)
const s2t = (m: PcpMapFunction, p: string) => m.mapSourceToTarget(P(p)).pathString
const t2s = (m: PcpMapFunction, p: string) => m.mapTargetToSource(P(p)).pathString
const stmap = (m: PcpMapFunction) => Object.fromEntries(m.getSourceToTargetMap())
const offsetEq = (a: SdfLayerOffset, b: SdfLayerOffset) =>
  a.offset === b.offset && a.scale === b.scale
const mul = (a: SdfLayerOffset, b: SdfLayerOffset): SdfLayerOffset =>
  ({ offset: a.offset + a.scale * b.offset, scale: a.scale * b.scale })
// itertools.product over [f, DeferredComposition(f)] per argument.
function product<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap(a => list.map(x => [...a, x])), [[]])
}
const both = (f: PcpMapFunction) => [f, DeferredComposition(f)]

// testPcpMapFunction.py:14-19.
const testPaths = [SdfPath.emptyPath, P('/'), P('/foo'), P('/a/b/c')]

describe('testPcpMapFunction', () => {
  it('test_Null', () => {
    const nul = PcpMapFunction.null()
    expect(nul.isNull()).toBe(true)
    expect(nul.isIdentity()).toBe(false)
    expect(nul.isIdentityPathMapping()).toBe(false)
    expect(offsetEq(nul.getTimeOffset(), IDENTITY_OFFSET)).toBe(true)
    for (const path of testPaths) expect(nul.mapSourceToTarget(path).isEmpty()).toBe(true)
  })

  it('test_DeferredComposition', () => {
    const m = MF({ '/Model': '/Model_1' })
    expect(m.isDeferredComposition()).toBe(false)
    const s = PcpMapFunction.deferredComposition(m)
    expect(s.isDeferredComposition()).toBe(true)
    expect(DeferredComposition(PcpMapFunction.identity()).isDeferredComposition()).toBe(false)
    expect(stmap(s)).toEqual(stmap(m))
    expect(offsetEq(s.getTimeOffset(), m.getTimeOffset())).toBe(true)
  })

  it('test_Identity', () => {
    const identity = PcpMapFunction.identity()
    expect(identity.isNull()).toBe(false)
    expect(identity.isIdentity()).toBe(true)
    expect(identity.isIdentityPathMapping()).toBe(true)
    expect(offsetEq(identity.getTimeOffset(), IDENTITY_OFFSET)).toBe(true)
    for (const path of testPaths) expect(identity.mapSourceToTarget(path).pathString).toBe(path.pathString)

    const identityPathMapping = MF({ '/': '/' }, { offset: 0, scale: 10 })
    expect(identityPathMapping.isNull()).toBe(false)
    expect(identityPathMapping.isIdentity()).toBe(false)
    expect(identityPathMapping.isIdentityPathMapping()).toBe(true)
    expect(offsetEq(identityPathMapping.getTimeOffset(), { offset: 0, scale: 10 })).toBe(true)
    for (const path of testPaths) {
      expect(identityPathMapping.mapSourceToTarget(path).pathString).toBe(path.pathString)
    }
  })

  it('test_Simple', () => {
    const validate = (m: PcpMapFunction) => {
      expect(m.isNull()).toBe(false)
      expect(m.isIdentity()).toBe(false)
      expect(m.isIdentityPathMapping()).toBe(false)
      expect(s2t(m, '/')).toBe('')
      expect(s2t(m, '/Model')).toBe('/Model_1')
      expect(s2t(m, '/Model/anim')).toBe('/Model_1/anim')
      expect(s2t(m, '/Model_1')).toBe('')
      expect(s2t(m, '/Model_1/anim')).toBe('')
      expect(t2s(m, '/')).toBe('')
      expect(t2s(m, '/Model')).toBe('')
      expect(t2s(m, '/Model/anim')).toBe('')
      expect(t2s(m, '/Model_1')).toBe('/Model')
      expect(t2s(m, '/Model_1/anim')).toBe('/Model/anim')
      expect(t2s(m, '/Model_1.x[/Model_1.y]')).toBe('/Model.x[/Model_1.y]')
      expect(s2t(m, '/Model.x[/Model.y]')).toBe('/Model_1.x[/Model.y]')
    }
    const m = MF({ '/Model': '/Model_1' })
    validate(m)
    validate(DeferredComposition(m))
  })

  it('test_NestedRef', () => {
    const validate = (m2: PcpMapFunction) => {
      expect(m2.isNull()).toBe(false)
      expect(m2.isIdentity()).toBe(false)
      expect(m2.isIdentityPathMapping()).toBe(false)
      expect(s2t(m2, '/')).toBe('')
      expect(s2t(m2, '/CharRig')).toBe('/Model/Rig')
      expect(s2t(m2, '/CharRig/rig')).toBe('/Model/Rig/rig')
      expect(s2t(m2, '/Model')).toBe('')
      expect(s2t(m2, '/Model/Rig')).toBe('')
      expect(s2t(m2, '/Model/Rig/rig')).toBe('')
      expect(t2s(m2, '/')).toBe('')
      expect(t2s(m2, '/CharRig')).toBe('')
      expect(t2s(m2, '/CharRig/rig')).toBe('')
      expect(t2s(m2, '/Model')).toBe('')
      expect(t2s(m2, '/Model/Rig')).toBe('/CharRig')
      expect(t2s(m2, '/Model/Rig/rig')).toBe('/CharRig/rig')
    }
    const m2 = MF({ '/CharRig': '/Model/Rig' })
    validate(m2)
    validate(DeferredComposition(m2))
  })

  it('test_Composition', () => {
    const validate = (m: PcpMapFunction, m2: PcpMapFunction) => {
      const m3 = m.compose(m2)
      expect(m3.isNull()).toBe(false)
      expect(m3.isIdentity()).toBe(false)
      expect(m3.isIdentityPathMapping()).toBe(false)
      expect(s2t(m3, '/')).toBe('')
      expect(s2t(m3, '/CharRig')).toBe('/Model_1/Rig')
      expect(s2t(m3, '/CharRig/rig')).toBe('/Model_1/Rig/rig')
      for (const p of ['/Model', '/Model/Rig', '/Model/Rig/rig', '/Model_1', '/Model_1/Rig', '/Model_1/Rig/rig']) {
        expect(s2t(m3, p)).toBe('')
      }
      for (const p of ['/', '/CharRig', '/CharRig/rig', '/Model', '/Model/Rig', '/Model/Rig/rig', '/Model_1']) {
        expect(t2s(m3, p)).toBe('')
      }
      expect(t2s(m3, '/Model_1/Rig')).toBe('/CharRig')
      expect(t2s(m3, '/Model_1/Rig/rig')).toBe('/CharRig/rig')
    }
    const m = MF({ '/Model': '/Model_1' })
    const m2 = MF({ '/CharRig': '/Model/Rig' })
    for (const [a, b] of product([both(m), both(m2)])) validate(a!, b!)

    const m1 = MF({ '/': '/', '/a': '/b' })
    const m2b = MF({ '/': '/', '/b': '/a' })
    for (const [a, b] of product([both(m1), both(m2b)])) {
      expect(a!.compose(b!).equals(PcpMapFunction.identity())).toBe(true)
      expect(b!.compose(a!).equals(PcpMapFunction.identity())).toBe(true)
    }
  })

  it('test_InheritRelocateChain', () => {
    const transfer = MF({ '/M': '/M_1' })
    const relocation = MF({ '/M/Rig/Inst/Scope': '/M/Anim/Scope' })
    const classArc = MF({ '/M/Rig/Class': '/M/Rig/Inst' })
    const refArc = MF({ '/M_1': '/M' })
    for (const [t, r, c, ref] of product([both(transfer), both(relocation), both(classArc), both(refArc)])) {
      const m4 = t!.compose(r!.compose(c!).compose(ref!))
      expect(m4.equals(MF({ '/M_1/Rig/Class/Scope': '/M_1/Anim/Scope' }))).toBe(true)
      expect(s2t(m4, '/M_1/Rig/Class/Scope/x')).toBe('/M_1/Anim/Scope/x')
      expect(t2s(m4, '/M_1/Anim/Scope/x')).toBe('/M_1/Rig/Class/Scope/x')
    }
  })

  it('test_ImpliedClass', () => {
    const transfer = MF({ '/': '/', '/M': '/M_1' })
    const relocation = MF({ '/': '/', '/M/Rig/Inst/Scope': '/M/Anim/Scope' })
    const classArc = MF({ '/': '/', '/M/Rig/Class': '/M/Rig/Inst' })
    for (const [t, r, c] of product([both(transfer), both(relocation), both(classArc)])) {
      expect(stmap(PcpMapFunction.impliedClass(t!, r!.compose(c!)))).toEqual(stmap(MF({
        '/': '/', '/M_1/Rig/Class': '/M_1/Rig/Inst', '/M_1/Rig/Class/Scope': '/M_1/Anim/Scope',
      })))
      expect(PcpMapFunction.impliedClass(t!, r!.compose(c!)).equals(MF({
        '/': '/', '/M_1/Rig/Class': '/M_1/Rig/Inst', '/M_1/Rig/Class/Scope': '/M_1/Anim/Scope',
      }))).toBe(true)
    }
  })

  it('test_ImpliedClassEdgeCaseLocalAndGlobalClassCombination', () => {
    const transfer = MF({ '/': '/', '/GlobalParent': '/OtherModel' })
    const classArc = MF({ '/': '/', '/GlobalParent': '/Model' })
    for (const [t, c] of product([both(transfer), both(classArc)])) {
      expect(stmap(PcpMapFunction.impliedClass(t!, c!)))
        .toEqual(stmap(MF({ '/': '/', '/OtherModel': '/Model' })))
      expect(PcpMapFunction.impliedClass(t!, c!).equals(MF({ '/': '/', '/OtherModel': '/Model' }))).toBe(true)
    }
  })

  it('test_LayerOffsets', () => {
    const offset1 = { offset: 0.0, scale: 2.0 }
    const offset2 = { offset: 10.0, scale: 1.0 }
    const m5 = MF({ '/': '/' }, offset1)
    const m6 = MF({ '/': '/' }, offset2)
    for (const [a, b] of product([both(m5), both(m6)])) {
      expect(offsetEq(a!.getTimeOffset(), offset1)).toBe(true)
      expect(offsetEq(b!.getTimeOffset(), offset2)).toBe(true)
      expect(offsetEq(a!.compose(b!).getTimeOffset(), mul(offset1, offset2))).toBe(true)
      expect(offsetEq(a!.composeOffset(b!.getTimeOffset()).getTimeOffset(), mul(offset1, offset2))).toBe(true)
    }
  })

  it('test_Basics', () => {
    let testMapFuncs = [
      PcpMapFunction.null(),
      PcpMapFunction.identity(),
      MF({ '/': '/' }, { offset: 0, scale: 10.0 }),
      MF({ '/Model': '/Model_1' }),
      MF({ '/CharRig': '/Model/Rig' }),
      MF({ '/Model': '/Model_1' }).compose(MF({ '/CharRig': '/Model/Rig' })),
      MF({ '/M': '/M_1' }).compose(
        MF({ '/M/Rig/Inst/Scope': '/M/Anim/Scope' }).compose(
          MF({ '/M/Rig/Class': '/M/Rig/Inst' }).compose(MF({ '/M_1': '/M' })))),
      MF({ '/': '/' }, { offset: 0.0, scale: 2.0 }),
      MF({ '/': '/' }, { offset: 10.0, scale: 1.0 }),
    ]
    testMapFuncs = [...testMapFuncs, ...testMapFuncs.map(DeferredComposition)]
    const n = testMapFuncs.length
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const same = i === j || i === j + n / 2 || j === i + n / 2
        expect(testMapFuncs[i]!.equals(testMapFuncs[j]!), `${i} ${j}`).toBe(same)
      }
    }

    const identity = PcpMapFunction.identity()
    for (const mapFunc of testMapFuncs) {
      expect(mapFunc.compose(identity).equals(mapFunc)).toBe(true)
      expect(identity.compose(mapFunc).equals(mapFunc)).toBe(true)
    }

    for (const mapFunc of testMapFuncs) {
      const nul = PcpMapFunction.null()
      const off = mapFunc.getTimeOffset()
      if (offsetEq(off, IDENTITY_OFFSET)) {
        expect(mapFunc.compose(nul).equals(nul)).toBe(true)
        expect(nul.compose(mapFunc).equals(nul)).toBe(true)
      } else {
        expect(mapFunc.compose(nul).equals(MF({}, off))).toBe(true)
        expect(nul.compose(mapFunc).equals(MF({}, off))).toBe(true)
      }
    }
  })

  it('test_MapFunctionsWithBlocks', () => {
    let f = MF({ '/': '/', '/Model': '' })
    expect(s2t(f, '/foo')).toBe('/foo')
    expect(t2s(f, '/foo')).toBe('/foo')
    expect(s2t(f, '/foo/bar')).toBe('/foo/bar')
    expect(t2s(f, '/foo/bar')).toBe('/foo/bar')
    expect(s2t(f, '/Model')).toBe('')
    expect(t2s(f, '/Model')).toBe('')
    expect(s2t(f, '/Model/Bar')).toBe('')
    expect(t2s(f, '/Model/Bar')).toBe('')

    f = MF({ '/CharRig': '/Char', '/CharRig/Rig': '', '/CharRig/Rig/Anim': '/Char/Anim' })
    expect(s2t(f, '/CharRig')).toBe('/Char')
    expect(s2t(f, '/CharRig/Foo')).toBe('/Char/Foo')
    expect(s2t(f, '/CharRig/Rig')).toBe('')
    expect(s2t(f, '/CharRig/Rig/Foo')).toBe('')
    expect(s2t(f, '/CharRig/Rig/Anim')).toBe('/Char/Anim')
    expect(s2t(f, '/CharRig/Rig/Anim/Foo')).toBe('/Char/Anim/Foo')
    expect(t2s(f, '/Char')).toBe('/CharRig')
    expect(t2s(f, '/Char/Foo')).toBe('/CharRig/Foo')
    expect(t2s(f, '/Char/Rig')).toBe('')
    expect(t2s(f, '/Char/Rig/Foo')).toBe('')
    expect(t2s(f, '/Char/Rig/Anim')).toBe('')
    expect(t2s(f, '/Char/Anim')).toBe('/CharRig/Rig/Anim')
    expect(t2s(f, '/Char/Anim/Foo')).toBe('/CharRig/Rig/Anim/Foo')
  })

  it('test_Canonicalization', () => {
    expect(stmap(MF({}))).toEqual({})
    expect(stmap(MF({ '/A': '/A' }))).toEqual({ '/A': '/A' })
    expect(stmap(MF({ '/': '/', '/A': '/A' }))).toEqual({ '/': '/' })
    expect(stmap(MF({ '/': '/', '/A': '/B' }))).toEqual({ '/': '/', '/A': '/B' })
    expect(stmap(MF({ '/A': '/B', '/A/X': '/B/X', '/A/X/Y1': '/B/X/Y2' })))
      .toEqual({ '/A': '/B', '/A/X/Y1': '/B/X/Y2' })
    expect(stmap(MF({ '/A': '/B', '/A/X1/C': '/B/X1/C' }))).toEqual({ '/A': '/B' })
    expect(stmap(MF({ '/A': '/B', '/A/X1': '/B/X2', '/A/X1/C': '/B/X1/C' })))
      .toEqual({ '/A': '/B', '/A/X1': '/B/X2', '/A/X1/C': '/B/X1/C' })
    expect(stmap(MF({ '/A': '' }))).toEqual({})
    expect(stmap(MF({ '/': '/', '/A': '' }))).toEqual({ '/': '/', '/A': '' })
    expect(stmap(MF({ '/': '/', '/A': '', '/A/B': '/A/B' })))
      .toEqual({ '/': '/', '/A': '', '/A/B': '/A/B' })
    expect(stmap(MF({ '/': '/', '/A': '', '/A/B/C': '', '/A/D': '' })))
      .toEqual({ '/': '/', '/A': '' })
    expect(stmap(MF({ '/': '/', '/A': '', '/A/B': '/A/B', '/A/B/C': '', '/A/D': '' })))
      .toEqual({ '/': '/', '/A': '', '/A/B': '/A/B', '/A/B/C': '' })
    expect(stmap(MF({ '/B': '/A', '/B/C/E': '/A/C/E' }))).toEqual({ '/B': '/A' })
    expect(stmap(MF({ '/B': '/A', '/B/C': '/C', '/B/C/E': '/A/C/E' })))
      .toEqual({ '/B': '/A', '/B/C': '/C', '/B/C/E': '/A/C/E' })
    expect(stmap(MF({ '/A': '/B', '/A/C/E': '/B/C/E' }))).toEqual({ '/A': '/B' })
    expect(stmap(MF({ '/A': '/B', '/C': '/B/C', '/A/C/E': '/B/C/E' })))
      .toEqual({ '/A': '/B', '/A/C/E': '/B/C/E', '/C': '/B/C' })
    expect(stmap(MF({ '/': '/', '/Foo': '/Bar', '/Bar': '' })))
      .toEqual({ '/': '/', '/Foo': '/Bar' })
  })

  it('test_Bug74847', () => {
    const m = MF({ '/A': '/A/B' })
    expect(s2t(m, '/A/B')).toBe('/A/B/B')
    expect(t2s(m, '/A/B/B')).toBe('/A/B')
  })

  it('test_Bug112645', () => {
    const f1 = MF({
      '/GuitarRig': '/GuitarRigX',
      '/GuitarRig/Rig/StringsRig/_Class_StringRig/String': '/GuitarRigX/Anim/Strings/String1',
    })
    const f2 = MF({
      '/StringsRig/String1Rig/String': '/GuitarRig/Anim/Strings/String1',
      '/StringsRig': '/GuitarRig/Rig/StringsRig',
    })
    expect(f1.compose(f2).equals(MF({
      '/StringsRig': '/GuitarRigX/Rig/StringsRig',
      '/StringsRig/String1Rig/String': '',
      '/StringsRig/_Class_StringRig/String': '/GuitarRigX/Anim/Strings/String1',
    }))).toBe(true)
  })

  it('test_BugComposedMapFunction', () => {
    const f1 = MF({ '/PathRig': '/CharRig/Rig/PathRig', '/PathRig/Path': '/Path' })
    const f2 = MF({ '/CharRig': '/Model' })
    const fComposed = f2.compose(f1)
    expect(fComposed.equals(MF({ '/PathRig': '/Model/Rig/PathRig', '/PathRig/Path': '' }))).toBe(true)

    const sameS2T = (sourcePath: string, targetPath: string) => {
      expect(s2t(fComposed, sourcePath)).toBe(targetPath)
      expect(f2.mapSourceToTarget(f1.mapSourceToTarget(P(sourcePath))).pathString).toBe(targetPath)
    }
    const sameT2S = (targetPath: string, sourcePath: string) => {
      expect(t2s(fComposed, targetPath)).toBe(sourcePath)
      expect(f1.mapTargetToSource(f2.mapTargetToSource(P(targetPath))).pathString).toBe(sourcePath)
    }
    sameS2T('/Bogus', '')
    sameT2S('/Bogus', '')
    sameS2T('/PathRig', '/Model/Rig/PathRig')
    sameT2S('/Model/Rig/PathRig', '/PathRig')
    sameS2T('/PathRig/Rig', '/Model/Rig/PathRig/Rig')
    sameT2S('/Model/Rig/PathRig/Rig', '/PathRig/Rig')
    sameS2T('/PathRig/Path', '')
    sameT2S('/Model/Rig/PathRig/Path', '')
  })

  it('test_PathExpression', () => {
    const m = MF({ '/Model': '/Model_1' })
    const pe = new SdfPathExpression('//{shiny} /Model/Tee /Outside/the/model')
    const mappedPe = m.mapSourceToTarget(pe)
    expect(mappedPe.getText()).toBe(new SdfPathExpression('//{shiny} /Model_1/Tee').getText())
  })
})
