// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdClasses.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD pxr/usd/usd/testenv/testUsdClasses.py (test_Basic).
//
// Upstream authors a class prim with stage.CreateClassPrim("/foo"), sets
// attributes on it, then makes "/fooDerived" an instance via
// fd.GetInherits().AddInherit("/foo") and checks that class opinions compose
// through, overridden by local opinions.
//
// AUTHORING-API GAP: typescript-usd Prim is thin — there is no CreateClassPrim(),
// GetInherits()/AddInherit(), or GetSpecifier(). We therefore author the
// identical scene in USDA text (`class "foo" {...}` + `inherits = </foo>`),
// open the stage, and assert the COMPOSED result, which exercises the same
// observable capability (class declaration + inherits composition). The
// subroot-class-prim creation sub-checks (CreateClassPrim at "/foo/child" and
// under a not-yet-existing parent, asserting GetSpecifier()==SpecifierClass)
// have no observable analog without those authoring/introspection APIs, so we
// instead author a nested class in text and assert its composed opinions.
//
// Expected values captured from the Pixar usd-2605 (v26.05) python build.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

function loadStage(text: string) {
  return Stage.open('classes.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'classes.usda': new TextEncoder().encode(text) })) }).then(value => value!)
}

const SCENE = `#usda 1.0
class "foo"
{
    int bar = 42
    int baz = 24
}
def Scope "fooDerived" (
    inherits = </foo>
)
{
    int baz = 42
}
`

describe('classes (inherits composition)', () => {
  it('class prim carries its own opinions', async () => {
    const stage = await loadStage(SCENE)
    const foo = stage.getPrim('/foo')!
    expect(foo).toBeTruthy()
    // Pixar usd-2605: /foo.bar == 42, /foo.baz == 24
    expect(foo.getAttr('bar')?.getValue()).toBe(42)
    expect(foo.getAttr('baz')?.getValue()).toBe(24)
  })

  it('inherited opinion composes through to the instance', async () => {
    const stage = await loadStage(SCENE)
    const fd = stage.getPrim('/fooDerived')!
    // Pixar usd-2605: /fooDerived.bar IsDefined() and == 42 (from class /foo)
    expect(fd.getAttr('bar')?.getValue()).toBe(42)
  })

  it('local opinion overrides the inherited class opinion', async () => {
    const stage = await loadStage(SCENE)
    const fd = stage.getPrim('/fooDerived')!
    // Pixar usd-2605: /fooDerived.baz == 42 (local override beats class's 24)
    expect(fd.getAttr('baz')?.getValue()).toBe(42)
  })

  it('the derived prim is a defined Scope', async () => {
    const stage = await loadStage(SCENE)
    const fd = stage.getPrim('/fooDerived')!
    expect(fd.typeName).toBe('Scope')
  })

  // Upstream additionally checks that CreateClassPrim works at a subroot path
  // (e.g. "/foo/child"). With no CreateClassPrim API we instead author a class
  // containing a nested child def and confirm the child structure + opinions
  // compose onto the inheriting instance.
  it('a nested child under a class composes onto the instance', async () => {
    const NESTED = `#usda 1.0
class "foo"
{
    int bar = 42
    def Scope "child"
    {
        int q = 7
    }
}
def Scope "fooDerived" (
    inherits = </foo>
)
{
}
`
    const stage = await loadStage(NESTED)
    // Pixar usd-2605: /fooDerived has child "child" with q == 7.
    const kids = stage.getChildPrimPaths('/fooDerived').map(p => p.split('/').pop()!)
    expect(kids).toContain('child')
    const child = stage.getPrim('/fooDerived/child')!
    expect(child).toBeTruthy()
    expect(child.getAttr('q')?.getValue()).toBe(7)
  })
})
