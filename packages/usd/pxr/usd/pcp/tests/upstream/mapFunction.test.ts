// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/pcp/testenv/testPcpMapFunction.py, pxr/usd/pcp/mapFunction.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { MapFunction as PcpMapFunction } from '../../src/index.ts'
import { SdfPath } from 'typescript-usd/sdf/path'

// PcpMapFunction operates on SdfPath; these string adapters keep the upstream-
// ported assertions (whose expected VALUES are unchanged) readable. '' is the
// empty/blocked path.
const ms = (f: PcpMapFunction, p: string): string =>
  f.mapSourceToTarget(SdfPath.fromString(p)).pathString
const mt = (f: PcpMapFunction, p: string): string =>
  f.mapTargetToSource(SdfPath.fromString(p)).pathString

// A reference-style map: the referenced prim subtree maps to the referencing
// site, with a root identity so unrelated paths pass through.
const refMap = (src: string, tgt: string) =>
  PcpMapFunction.create([['/', '/'], [src, tgt]])

describe('PcpMapFunction — basic mapping', () => {
  it('maps a subtree prefix and passes unrelated paths through (root identity)', () => {
    const f = refMap('/Model', '/Char')
    expect(ms(f, '/Model')).toBe('/Char')
    expect(ms(f, '/Model/Geom/Cube')).toBe('/Char/Geom/Cube')
    expect(ms(f, '/Unrelated')).toBe('/Unrelated') // root identity
  })

  it('inverts: target subtree back to source', () => {
    const f = refMap('/Model', '/Char')
    expect(mt(f, '/Char/Geom')).toBe('/Model/Geom')
  })

  it('null function maps nothing; identity maps everything to itself', () => {
    expect(ms(PcpMapFunction.null(), '/A')).toBe('')
    expect(PcpMapFunction.null().isNull()).toBe(true)
    const id = PcpMapFunction.identity()
    expect(id.isIdentity()).toBe(true)
    expect(ms(id, '/A/B')).toBe('/A/B')
  })
})

describe('PcpMapFunction — bijection / invertibility (mapFunction.cpp:_Map)', () => {
  it('{ / -> /, /_class_Model -> /Model } blocks mapping /Model (bug74847)', () => {
    // /Model would map to itself via root identity, but inverts to
    // /_class_Model — non-invertible, so it is blocked.
    const f = PcpMapFunction.create([['/', '/'], ['/_class_Model', '/Model']])
    expect(ms(f, '/_class_Model')).toBe('/Model')
    expect(ms(f, '/Model')).toBe('') // blocked
  })

  it('{ /A -> /A/B } allows mapping /A/B to /A/B/B (invertible)', () => {
    const f = PcpMapFunction.create([['/A', '/A/B']])
    expect(ms(f, '/A')).toBe('/A/B')
    expect(ms(f, '/A/B')).toBe('/A/B/B')
    expect(mt(f, '/A/B/B')).toBe('/A/B')
  })

  it('{ /A -> /B, /C -> /B/C } blocks mapping /A/C (non-invertible)', () => {
    const f = PcpMapFunction.create([['/A', '/B'], ['/C', '/B/C']])
    expect(ms(f, '/A')).toBe('/B')
    expect(ms(f, '/A/C')).toBe('') // /B/C would invert to /C
  })
})

describe('PcpMapFunction — compose', () => {
  it('(outer ∘ inner) applies inner then outer', () => {
    const inner = refMap('/Model', '/Char/Rig')   // /Model -> /Char/Rig
    const outer = refMap('/Char', '/World/Char')   // /Char  -> /World/Char
    const composed = outer.compose(inner)
    // /Model -> /Char/Rig -> /World/Char/Rig
    expect(ms(composed, '/Model/Hand')).toBe('/World/Char/Rig/Hand')
    // equals applying inner then outer directly
    expect(ms(composed, '/Model/Hand'))
      .toBe(ms(outer, ms(inner, '/Model/Hand')))
  })

  it('identity composes as a no-op on both sides', () => {
    const f = refMap('/Model', '/Char')
    expect(f.compose(PcpMapFunction.identity()).equals(f)).toBe(true)
    expect(PcpMapFunction.identity().compose(f).equals(f)).toBe(true)
  })
})

describe('PcpMapFunction — ImpliedClass (spooky inherits)', () => {
  it('re-expresses a class arc in the parent namespace through the transfer fn', () => {
    // A class /_class_Model is inherited by /Model (classArc maps class->instance).
    const classArc = PcpMapFunction.create([['/', '/'], ['/_class_Model', '/Model']])
    // /Model arrives at the parent /Char via a reference (transfer fn).
    const transfer = PcpMapFunction.create([['/', '/'], ['/Model', '/Char']])

    const implied = PcpMapFunction.impliedClass(transfer, classArc)
    // The implied class at /Char inherits the same root-level /_class_Model:
    expect(ms(implied, '/_class_Model')).toBe('/Char')
    expect(ms(implied, '/_class_Model/Arm')).toBe('/Char/Arm')
    // unrelated paths still pass (root identity is forced on)
    expect(ms(implied, '/Other')).toBe('/Other')
  })

  it('with an identity transfer, returns the class arc unchanged', () => {
    const classArc = PcpMapFunction.create([['/', '/'], ['/_class_X', '/X']])
    const implied = PcpMapFunction.impliedClass(PcpMapFunction.identity(), classArc)
    expect(implied.equals(classArc)).toBe(true)
  })
})

// --- Gate: reproduce the inline engine's ad-hoc helpers ---

describe('PcpMapFunction — reproduces inline helpers', () => {
  // The inline remapStagePath(path, {src, tgt}) used by the engine being replaced.
  const remapStagePath = (path: string, src: string, tgt: string): string => {
    if (path === src || path.startsWith(src + '/') || path.startsWith(src + '.')) {
      return tgt + path.slice(src.length)
    }
    return path
  }

  it('a reference map reproduces remapStagePath for in-subtree and unrelated paths', () => {
    const src = '/Model'
    const tgt = '/ModelRefWithChildren'
    const f = refMap(src, tgt)
    for (const p of ['/Model', '/Model/_prototype', '/Model/A/B', '/Unrelated', '/M']) {
      expect(ms(f, p)).toBe(remapStagePath(p, src, tgt))
    }
  })

  it('a variant arc carries an identity map (the selection lives on the variant axis)', () => {
    // A variant selection rides SdfPath's native variant axis (structured form
    // /Model{vset=with_children}_prototype); the arc's namespace map is identity.
    // Confirm identity passes the selection-bearing path through unchanged.
    const variantMap = PcpMapFunction.identity()
    expect(ms(variantMap, '/Model{vset=with_children}_prototype'))
      .toBe('/Model{vset=with_children}_prototype')
  })

  it('a relocate as a map function chains like composeRelocates (combined origin)', () => {
    // Phase 1 combined relocates for {/A->/B, /B/C->/D} key on the origin: /A/C->/D.
    // As a map function the relocate moves the source subtree to the target.
    const reloc = PcpMapFunction.create([['/A/C', '/D']])
    expect(ms(reloc, '/A/C')).toBe('/D')
    expect(ms(reloc, '/A/C/Leaf')).toBe('/D/Leaf')
    expect(mt(reloc, '/D/Leaf')).toBe('/A/C/Leaf')
  })
})

// ===========================================================================
// Ported from OpenUSD pcp/testenv/testPcpMapFunction.py (v26.05). The upstream
// unit test is the first oracle for this primitive. Every expected value here
// is the upstream assertion or, for the cross-check tables, the live Pixar
// build's output (PYTHONPATH=the v26.05 reference build python3, from pxr import Pcp).
// ===========================================================================

// Build from a dict, mirroring Python `Pcp.MapFunction({...})`. '' target = block.
const dictFn = (d: Record<string, string>, offset?: Parameters<typeof PcpMapFunction.create>[1]) =>
  PcpMapFunction.create(Object.entries(d), offset)
// Canonical source->target map as a plain object for deep-equality assertions.
const smap = (f: PcpMapFunction): Record<string, string> =>
  Object.fromEntries(f.getSourceToTargetMap())

// testPaths analog (the empty path '' is represented by the empty string).
const testPaths = ['', '/', '/foo', '/a/b/c']

describe('PcpMapFunction — testPcpMapFunction.test_Null', () => {
  it('null function maps nothing and is neither identity nor identity-path-mapping', () => {
    const nul = PcpMapFunction.null()
    expect(nul.isNull()).toBe(true)
    expect(nul.isIdentity()).toBe(false)
    expect(nul.isIdentityPathMapping()).toBe(false)
    for (const p of testPaths) expect(ms(nul, p)).toBe('')
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Identity', () => {
  it('identity maps every path to itself and is identity / identity-path-mapping', () => {
    const id = PcpMapFunction.identity()
    expect(id.isNull()).toBe(false)
    expect(id.isIdentity()).toBe(true)
    expect(id.isIdentityPathMapping()).toBe(true)
    for (const p of testPaths) expect(ms(id, p)).toBe(p)
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Simple', () => {
  // m = { /Model -> /Model_1 } (no root identity)
  const m = dictFn({ '/Model': '/Model_1' })
  it('forward maps the subtree and blocks already-target paths', () => {
    expect(m.isNull()).toBe(false)
    expect(m.isIdentity()).toBe(false)
    expect(ms(m, '/')).toBe('') // no root identity
    expect(ms(m, '/Model')).toBe('/Model_1')
    expect(ms(m, '/Model/anim')).toBe('/Model_1/anim')
    expect(ms(m, '/Model_1')).toBe('')
    expect(ms(m, '/Model_1/anim')).toBe('')
  })
  it('inverse maps the target subtree back', () => {
    expect(mt(m, '/')).toBe('')
    expect(mt(m, '/Model')).toBe('')
    expect(mt(m, '/Model_1')).toBe('/Model')
    expect(mt(m, '/Model_1/anim')).toBe('/Model/anim')
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_NestedRef', () => {
  const m2 = dictFn({ '/CharRig': '/Model/Rig' })
  it('maps /CharRig -> /Model/Rig and inverts /Model/Rig -> /CharRig', () => {
    expect(ms(m2, '/')).toBe('')
    expect(ms(m2, '/CharRig')).toBe('/Model/Rig')
    expect(ms(m2, '/CharRig/rig')).toBe('/Model/Rig/rig')
    expect(ms(m2, '/Model')).toBe('')
    expect(ms(m2, '/Model/Rig')).toBe('')
    expect(mt(m2, '/Model/Rig')).toBe('/CharRig')
    expect(mt(m2, '/Model/Rig/rig')).toBe('/CharRig/rig')
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Composition', () => {
  it('composes /Model->/Model_1 over /CharRig->/Model/Rig', () => {
    const m = dictFn({ '/Model': '/Model_1' })
    const m2 = dictFn({ '/CharRig': '/Model/Rig' })
    const m3 = m.compose(m2)
    expect(ms(m3, '/CharRig')).toBe('/Model_1/Rig')
    expect(ms(m3, '/CharRig/rig')).toBe('/Model_1/Rig/rig')
    expect(ms(m3, '/Model')).toBe('')
    expect(ms(m3, '/Model_1/Rig')).toBe('')
    expect(mt(m3, '/Model_1/Rig')).toBe('/CharRig')
    expect(mt(m3, '/Model_1/Rig/rig')).toBe('/CharRig/rig')
  })
  it('composing inverse pairs collapses to the identity', () => {
    // { /->/, /a->/b } ∘ { /->/, /b->/a } == Identity (canonicalization drops
    // the now-redundant /b->/b self-pair that the root identity implies).
    const m1 = dictFn({ '/': '/', '/a': '/b' })
    const m2 = dictFn({ '/': '/', '/b': '/a' })
    expect(m1.compose(m2).isIdentity()).toBe(true)
    expect(m1.compose(m2).equals(PcpMapFunction.identity())).toBe(true)
    expect(m2.compose(m1).equals(PcpMapFunction.identity())).toBe(true)
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_InheritRelocateChain', () => {
  it('a 4-deep inherit+relocate compose chain reduces to one pair', () => {
    const m4 = dictFn({ '/M': '/M_1' }).compose(
      dictFn({ '/M/Rig/Inst/Scope': '/M/Anim/Scope' }).compose(
        dictFn({ '/M/Rig/Class': '/M/Rig/Inst' }).compose(
          dictFn({ '/M_1': '/M' }))))
    const expected = dictFn({ '/M_1/Rig/Class/Scope': '/M_1/Anim/Scope' })
    expect(m4.equals(expected)).toBe(true)
    expect(ms(m4, '/M_1/Rig/Class/Scope/x')).toBe('/M_1/Anim/Scope/x')
    expect(mt(m4, '/M_1/Anim/Scope/x')).toBe('/M_1/Rig/Class/Scope/x')
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_ImpliedClass', () => {
  it('ImpliedClass conjugates the class arc by the transfer fn', () => {
    const implied = PcpMapFunction.impliedClass(
      dictFn({ '/M': '/M_1' }),
      dictFn({ '/M/Rig/Inst/Scope': '/M/Anim/Scope' }).compose(
        dictFn({ '/M/Rig/Class': '/M/Rig/Inst' })))
    expect(implied.equals(dictFn({ '/': '/', '/M_1/Rig/Class/Scope': '/M_1/Anim/Scope' }))).toBe(true)
  })

  it('the conjugation drops the spurious self-pair (Pixar-adjudicated regression)', () => {
    // Reproduces the divergence that primitive #2 surfaced: impliedClass once
    // emitted a redundant { /Model_1 -> /Model_1 } pair that the live Pixar
    // build's _Canonicalize drops (implied by the forced root identity).
    const cls = dictFn({ '/': '/', '/_class_M/x': '/_class_M/y' })
    const t1 = dictFn({ '/': '/', '/_class_M': '/Model_1' })
    const implied = PcpMapFunction.impliedClass(t1, cls)
    expect(smap(implied)).toEqual({ '/': '/', '/Model_1/x': '/Model_1/y' })
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_LayerOffsets', () => {
  it('compose multiplies layer offsets', () => {
    const o1 = { offset: 0.0, scale: 2.0 }
    const o2 = { offset: 10.0, scale: 1.0 }
    const m5 = dictFn({ '/': '/' }, o1)
    const m6 = dictFn({ '/': '/' }, o2)
    // o1 * o2 = offset 0 + 2*10 = 20, scale 2*1 = 2 (SdfLayerOffset compose).
    const composed = m5.compose(m6).getTimeOffset()
    expect(composed.offset).toBe(20.0)
    expect(composed.scale).toBe(2.0)
    const viaComposeOffset = m5.composeOffset(o2).getTimeOffset()
    expect(viaComposeOffset.offset).toBe(20.0)
    expect(viaComposeOffset.scale).toBe(2.0)
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Basics (equality + identity laws)', () => {
  const funcs = [
    PcpMapFunction.null(),
    PcpMapFunction.identity(),
    dictFn({ '/': '/' }, { offset: 0, scale: 10.0 }),
    dictFn({ '/Model': '/Model_1' }),
    dictFn({ '/CharRig': '/Model/Rig' }),
    dictFn({ '/Model': '/Model_1' }).compose(dictFn({ '/CharRig': '/Model/Rig' })),
    dictFn({ '/M': '/M_1' }).compose(
      dictFn({ '/M/Rig/Inst/Scope': '/M/Anim/Scope' }).compose(
        dictFn({ '/M/Rig/Class': '/M/Rig/Inst' }).compose(
          dictFn({ '/M_1': '/M' })))),
    dictFn({ '/': '/' }, { offset: 0.0, scale: 2.0 }),
    dictFn({ '/': '/' }, { offset: 10.0, scale: 1.0 }),
  ]
  it('all distinct functions compare unequal; each equals itself', () => {
    for (let i = 0; i < funcs.length; i++) {
      for (let j = 0; j < funcs.length; j++) {
        expect(funcs[i]!.equals(funcs[j]!)).toBe(i === j)
      }
    }
  })
  it('composing with identity on either side returns the function', () => {
    const id = PcpMapFunction.identity()
    for (const f of funcs) {
      expect(f.compose(id).equals(f)).toBe(true)
      expect(id.compose(f).equals(f)).toBe(true)
    }
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_MapFunctionsWithBlocks', () => {
  it('identity with an explicit /Model block lets others pass, kills /Model', () => {
    const f = dictFn({ '/': '/', '/Model': '' })
    expect(ms(f, '/foo')).toBe('/foo')
    expect(mt(f, '/foo')).toBe('/foo')
    expect(ms(f, '/foo/bar')).toBe('/foo/bar')
    expect(ms(f, '/Model')).toBe('')
    expect(mt(f, '/Model')).toBe('')
    expect(ms(f, '/Model/Bar')).toBe('')
    expect(mt(f, '/Model/Bar')).toBe('')
  })

  it('rename + block-a-child + move-a-grandchild', () => {
    const f = dictFn({
      '/CharRig': '/Char',
      '/CharRig/Rig': '',
      '/CharRig/Rig/Anim': '/Char/Anim',
    })
    expect(ms(f, '/CharRig')).toBe('/Char')
    expect(ms(f, '/CharRig/Foo')).toBe('/Char/Foo')
    expect(ms(f, '/CharRig/Rig')).toBe('')
    expect(ms(f, '/CharRig/Rig/Foo')).toBe('')
    expect(ms(f, '/CharRig/Rig/Anim')).toBe('/Char/Anim')
    expect(ms(f, '/CharRig/Rig/Anim/Foo')).toBe('/Char/Anim/Foo')
    expect(mt(f, '/Char')).toBe('/CharRig')
    expect(mt(f, '/Char/Foo')).toBe('/CharRig/Foo')
    expect(mt(f, '/Char/Rig')).toBe('')
    expect(mt(f, '/Char/Rig/Foo')).toBe('')
    expect(mt(f, '/Char/Rig/Anim')).toBe('')
    expect(mt(f, '/Char/Anim')).toBe('/CharRig/Rig/Anim')
    expect(mt(f, '/Char/Anim/Foo')).toBe('/CharRig/Rig/Anim/Foo')
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Canonicalization', () => {
  // Each expected map is the upstream assertion (verified against the live Pixar
  // build). These exercise _Canonicalize / _IsRedundant directly — the heart of
  // the fix. '' denotes a block (empty target).
  it('empty map and a non-identity self-pair', () => {
    expect(smap(dictFn({}))).toEqual({})
    expect(smap(dictFn({ '/A': '/A' }))).toEqual({ '/A': '/A' })
  })
  it('/ -> / makes /A -> /A redundant but keeps /A -> /B', () => {
    expect(smap(dictFn({ '/': '/', '/A': '/A' }))).toEqual({ '/': '/' })
    expect(smap(dictFn({ '/': '/', '/A': '/B' }))).toEqual({ '/': '/', '/A': '/B' })
  })
  it('ancestor mapping drops same-shape descendant but keeps renamed ones', () => {
    expect(smap(dictFn({ '/A': '/B', '/A/X': '/B/X', '/A/X/Y1': '/B/X/Y2' })))
      .toEqual({ '/A': '/B', '/A/X/Y1': '/B/X/Y2' })
    expect(smap(dictFn({ '/A': '/B', '/A/X1/C': '/B/X1/C' }))).toEqual({ '/A': '/B' })
    expect(smap(dictFn({ '/A': '/B', '/A/X1': '/B/X2', '/A/X1/C': '/B/X1/C' })))
      .toEqual({ '/A': '/B', '/A/X1': '/B/X2', '/A/X1/C': '/B/X1/C' })
  })
  it('lone block is redundant; with an identity it unmaps a subtree', () => {
    expect(smap(dictFn({ '/A': '' }))).toEqual({})
    expect(smap(dictFn({ '/': '/', '/A': '' }))).toEqual({ '/': '/', '/A': '' })
    expect(smap(dictFn({ '/': '/', '/A': '', '/A/B': '/A/B' })))
      .toEqual({ '/': '/', '/A': '', '/A/B': '/A/B' })
  })
  it('descendant blocks under an already-unmapped ancestor are redundant', () => {
    expect(smap(dictFn({ '/': '/', '/A': '', '/A/B/C': '', '/A/D': '' })))
      .toEqual({ '/': '/', '/A': '' })
    expect(smap(dictFn({ '/': '/', '/A': '', '/A/B': '/A/B', '/A/B/C': '', '/A/D': '' })))
      .toEqual({ '/': '/', '/A': '', '/A/B': '/A/B', '/A/B/C': '' })
  })
  it('renaming-ancestor redundancy and the intermediary that defeats it', () => {
    expect(smap(dictFn({ '/B': '/A', '/B/C/E': '/A/C/E' }))).toEqual({ '/B': '/A' })
    expect(smap(dictFn({ '/B': '/A', '/B/C': '/C', '/B/C/E': '/A/C/E' })))
      .toEqual({ '/B': '/A', '/B/C': '/C', '/B/C/E': '/A/C/E' })
  })
  it('inverse-affecting redundancy (the /C -> /B/C case)', () => {
    expect(smap(dictFn({ '/A': '/B', '/A/C/E': '/B/C/E' }))).toEqual({ '/A': '/B' })
    expect(smap(dictFn({ '/A': '/B', '/C': '/B/C', '/A/C/E': '/B/C/E' })))
      .toEqual({ '/A': '/B', '/C': '/B/C', '/A/C/E': '/B/C/E' })
  })
  it('a block on a path already non-mappable by bijection is redundant', () => {
    expect(smap(dictFn({ '/': '/', '/Foo': '/Bar', '/Bar': '' })))
      .toEqual({ '/': '/', '/Foo': '/Bar' })
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Bug74847', () => {
  it('{ /A -> /A/B } maps /A/B to /A/B/B and inverts', () => {
    const m = dictFn({ '/A': '/A/B' })
    expect(ms(m, '/A/B')).toBe('/A/B/B')
    expect(mt(m, '/A/B/B')).toBe('/A/B')
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_Bug112645', () => {
  it('composing the guitar-rig functions yields the expected block-bearing map', () => {
    const f1 = dictFn({
      '/GuitarRig': '/GuitarRigX',
      '/GuitarRig/Rig/StringsRig/_Class_StringRig/String': '/GuitarRigX/Anim/Strings/String1',
    })
    const f2 = dictFn({
      '/StringsRig/String1Rig/String': '/GuitarRig/Anim/Strings/String1',
      '/StringsRig': '/GuitarRig/Rig/StringsRig',
    })
    expect(smap(f1.compose(f2))).toEqual({
      '/StringsRig': '/GuitarRigX/Rig/StringsRig',
      '/StringsRig/String1Rig/String': '',
      '/StringsRig/_Class_StringRig/String': '/GuitarRigX/Anim/Strings/String1',
    })
  })
})

describe('PcpMapFunction — testPcpMapFunction.test_BugComposedMapFunction', () => {
  const f1 = dictFn({ '/PathRig': '/CharRig/Rig/PathRig', '/PathRig/Path': '/Path' })
  const f2 = dictFn({ '/CharRig': '/Model' })
  const fComposed = f2.compose(f1)
  it('the composed function carries the expected block', () => {
    expect(smap(fComposed)).toEqual({
      '/PathRig': '/Model/Rig/PathRig',
      '/PathRig/Path': '',
    })
  })
  it('composed MapSourceToTarget equals sequential application', () => {
    const cases: Array<[string, string]> = [
      ['/Bogus', ''],
      ['/PathRig', '/Model/Rig/PathRig'],
      ['/PathRig/Rig', '/Model/Rig/PathRig/Rig'],
      ['/PathRig/Path', ''],
    ]
    for (const [src, tgt] of cases) {
      expect(ms(fComposed, src)).toBe(tgt)
      expect(ms(f2, ms(f1, src) || '')).toBe(tgt)
    }
  })
  it('composed MapTargetToSource equals sequential inverse application', () => {
    const cases: Array<[string, string]> = [
      ['/Bogus', ''],
      ['/Model/Rig/PathRig', '/PathRig'],
      ['/Model/Rig/PathRig/Rig', '/PathRig/Rig'],
      ['/Model/Rig/PathRig/Path', ''],
    ]
    for (const [tgt, src] of cases) {
      expect(mt(fComposed, tgt)).toBe(src)
      expect(mt(f1, mt(f2, tgt) || '')).toBe(src)
    }
  })
})
