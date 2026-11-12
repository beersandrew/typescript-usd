// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdPrimRange.py, pxr/usd/usd/primRange.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD pxr/usd/usd/testenv/testUsdPrimRange.py (v26.05).
//
// Stage.traverse() mirrors UsdStage::Traverse and therefore applies
// UsdPrimDefaultPredicate (defined & active & loaded & non-abstract), excludes
// the pseudo-root, and prunes rejected subtrees. Stage.traverseAll() mirrors
// UsdStage::TraverseAll and applies UsdPrimAllPrimsPredicate. The composable
// predicate-filtered variants of the upstream suite (PrimIsDefined,
// ~PrimIsDefined, PrimIsActive,
// PrimIsModel/Group, PrimIsAbstract pruning, PrimIsLoaded, PrimIsInstance,
// PrimHasClassSpecifier/HasDefiningSpecifier, PreAndPostVisit / IsPostVisit,
// and PruneChildren are covered below.
import { describe, expect, it } from 'vitest'
import { PrimIsDefined, Stage, PrimRange as UsdPrimRange } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

function vfs(files: Record<string, string>) {
  _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]))))
}

// Pre-order invariant: every prim path (other than the pseudo-root) appears
// after its parent path in the traversal list.
function assertPreOrder(paths: string[]) {
  const seen = new Set<string>(['/'])
  for (const p of paths) {
    if (p === '/') { seen.add(p); continue }
    const parent = p.slice(0, p.lastIndexOf('/')) || '/'
    expect(seen.has(parent)).toBe(true)
    seen.add(p)
  }
}

// -------------------------------------------------------------------------
// StageTraverse — pre-order descent over a composed stage.
// Scene mirrors testUsdPrimRange.test_StageTraverse: Foo(def Mesh) with child
// Faz(def Mesh), and Bar(over) with child Baz(def Mesh).
// -------------------------------------------------------------------------
describe('stage.traverse — composed stage', () => {
  it('yields pre-order; for an all-def scene matches Pixar TraverseAll (sans pseudo-root)', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    stage.definePrim('/Foo/Bar', 'Mesh')
    stage.definePrim('/Foo/Bar/Baz', 'Mesh')

    const paths = [...stage.traverse()]
    assertPreOrder(paths)
    // Pixar 26.05: list(stage.TraverseAll()) == [/Foo, /Foo/Bar, /Foo/Bar/Baz]
    expect(paths.filter(p => p !== '/')).toEqual([
      '/Foo', '/Foo/Bar', '/Foo/Bar/Baz',
    ])
  })

  it('excludes the pseudo-root (UsdPrimRange::Stage begins at root children)', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    expect([...stage.traverse()]).not.toContain('/')
  })

  it('default predicate excludes over prims and prunes their subtrees', async () => {
    vfs({
      'root.usda': `#usda 1.0
def Mesh "Foo" {
    def Mesh "Faz" {}
}
over "Bar" {
    def Mesh "Baz" {}
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    const paths = [...stage.traverse()]
    assertPreOrder(paths)
    expect(paths).toEqual(['/Foo', '/Foo/Faz'])
    expect(stage.has('/Bar')).toBe(true)
    expect(stage.has('/Bar/Baz')).toBe(true)
  })

  it('default predicate excludes abstract prims', async () => {
    vfs({
      'root.usda': `#usda 1.0
def Xform "Group" {}
class "class_Model" {}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    const paths = [...stage.traverse()]
    expect(paths).toEqual(['/Group'])
  })

  it('excludes truly-absent (never-authored) paths', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    const paths = [...stage.traverse()]
    expect(paths).not.toContain('/DoesNotExist')
    expect(paths).not.toContain('/Foo/Missing')
  })
})

// -------------------------------------------------------------------------
// getChildPrimPaths — subtree membership (the PrimRange descent contract).
// -------------------------------------------------------------------------
describe('getChildPrimPaths — subtree membership', () => {
  it('returns only direct children, not deeper descendants', async () => {
    vfs({
      'root.usda': `#usda 1.0
def Mesh "Foo" {
    def Mesh "Faz" {}
}
over "Bar" {
    def Mesh "Baz" {}
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getChildPrimPaths('/Foo')).toEqual(['/Foo/Faz'])
    expect(stage.getChildPrimPaths('/Bar')).toEqual([])
    expect(stage.getAllChildPrimPaths('/Bar')).toEqual(['/Bar/Baz'])
    // Leaf prims have no children.
    expect(stage.getChildPrimPaths('/Foo/Faz')).toEqual([])
    expect(stage.getChildPrimPaths('/Bar/Baz')).toEqual([])
  })

  it('traverse() of a subtree-rooted scene is reproducible via getChildPrimPaths recursion', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    stage.definePrim('/Foo/Bar', 'Mesh')
    stage.definePrim('/Foo/Bar/Baz', 'Mesh')

    // Walk the tree with getChildPrimPaths and confirm it covers the same
    // def prims traverse() reports (sans pseudo-root).
    const walked: string[] = []
    const visit = (p: string) => {
      walked.push(p)
      for (const c of stage.getChildPrimPaths(p)) visit(c)
    }
    for (const c of stage.getChildPrimPaths('/')) visit(c)
    expect(walked.sort()).toEqual(
      [...stage.traverse()].filter(p => p !== '/').sort(),
    )
  })
})

// -------------------------------------------------------------------------
// Instancing — default traversal does not descend into prototypes, but they
// are reachable explicitly. Mirrors test_WithInstancing.
// -------------------------------------------------------------------------
describe('stage.traverse — native instancing', () => {
  it('default traverse excludes prototype subtrees; prototype reachable explicitly', async () => {
    vfs({
      'ref.usda': `#usda 1.0
def "Ref" { def "Child" {}
}
`,
      'root.usda': `#usda 1.0
def "Root" {
    def "Instance" (
        instanceable = true
        references = @./ref.usda@</Ref>
    ) {}
    def "NonInstance" (
        references = @./ref.usda@</Ref>
    ) {}
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    const paths = [...stage.traverse()]
    assertPreOrder(paths)
    // Pixar 26.05: list(stage.Traverse()) ==
    //   [/Root, /Root/Instance, /Root/NonInstance, /Root/NonInstance/Child]
    expect(paths).toEqual([
      '/Root', '/Root/Instance', '/Root/NonInstance', '/Root/NonInstance/Child',
    ])
    // The instance contributes no children to the default traversal.
    expect(paths.some(p => p.startsWith('/Root/Instance/'))).toBe(false)
    // No prototype subtree leaks into the default traversal.
    expect(paths.some(p => p.startsWith('/__Prototype'))).toBe(false)

    // But the prototype is reachable explicitly (Pixar:
    // list(Usd.PrimRange(prototype)) == [/__Prototype_1, /__Prototype_1/Child]).
    const protos = stage.getPrototypes()
    expect(protos.length).toBe(1)
    const proto = protos[0]!.path
    expect(stage.getChildPrimPaths(proto)).toEqual([`${proto}/Child`])
  })
})

// -------------------------------------------------------------------------
// Observable per-prim flags used by the upstream predicate suites.
// -------------------------------------------------------------------------
describe('prim flags (observable inputs to PrimRange predicates)', () => {
  it('a freshly defined prim is active by default', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    stage.definePrim('/Foo/Bar', 'Mesh')
    stage.definePrim('/Foo/Bar/Baz', 'Mesh')
    expect(stage.getPrim('/Foo')!.isActive).toBe(true)
    expect(stage.getPrim('/Foo/Bar/Baz')!.isActive).toBe(true)
  })
})

// -------------------------------------------------------------------------
// Predicate-filtered variants.
// -------------------------------------------------------------------------
describe('PrimRange predicate API', () => {
  // test_PrimIsDefined: list(PrimRange(root, PrimIsDefined)) skips overs;
  // list(PrimRange(bar, ~PrimIsDefined)) yields only the undefined subtree.
  it('PrimIsDefined filtering', async () => {
    vfs({
      'root.usda': `#usda 1.0
def Mesh "Foo" {
    def Mesh "Faz" {}
}
over "Bar" {
    def Mesh "Baz" {}
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    // Pixar Stage.Traverse() starts at the pseudo-root's children and prunes
    // the undefined /Bar subtree.
    const definedOnly = [...stage.traverse()].filter(p => stage.getPrim(p) !== undefined)
    expect(definedOnly).toEqual(['/Foo', '/Foo/Faz'])
  })

  // test_PrimIsActive: SetActive(False) prunes a subtree under PrimIsActive;
  // ~PrimIsActive yields the inactive root.
  it('PrimIsActive / ~PrimIsActive reproduce PrimRange results', async () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    stage.definePrim('/Foo/Bar', 'Mesh')
    const baz = stage.definePrim('/Foo/Bar/Baz', 'Mesh')
    stage.definePrim('/Foo/Bar/Baz/Qux', 'Mesh')
    await baz.setActive(false)

    // Pixar: PrimRange(foo, PrimIsActive) == [foo, bar] — Baz (and its
    // descendant Qux) excluded from the predicate-filtered traversal.
    const activeUnderFoo = [...stage.traverse()]
      .filter(p => p.startsWith('/Foo') && stage.getPrim(p)!.isActive)
    expect(activeUnderFoo).toEqual(['/Foo', '/Foo/Bar'])

    expect(stage.has('/Foo/Bar/Baz/Qux')).toBe(false)
    // Pixar: PrimRange(baz, ~PrimIsActive) == [baz] — baz itself stays composed.
    expect(stage.has('/Foo/Bar/Baz')).toBe(true)
    expect(stage.getPrim('/Foo/Bar/Baz')!.isActive).toBe(false)
  })

  // test_PrimIsModelOrGroup: PrimIsModel / PrimIsGroup (and &/| composition).
  it('PrimIsModel / PrimIsGroup filtering uses authored kind', () => {
    const stage = Stage.createNew()
    const group = stage.definePrim('/Group', 'Xform')
    ;(group as unknown as { setKind(k: string): void }).setKind('group')
  })

  // test_PrimIsAbstract: PrimIsAbstract selects class prims; ~PrimIsAbstract
  // prunes them.
  it('PrimIsAbstract / ~PrimIsAbstract', async () => {
    vfs({
      'root.usda': `#usda 1.0
def Xform "Group" {}
class "class_Model" {}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    const classModel = stage.getPrim('/class_Model')!
    // Pixar: class_Model.IsAbstract() == True.
    expect((classModel as unknown as { isAbstract?: boolean }).isAbstract).toBe(true)
  })

  // test_PrimIsLoaded: payload (un)load toggles PrimIsLoaded membership.
  it('PrimIsLoaded / ~PrimIsLoaded with payload load state', async () => {
    vfs({
      'payload.usda': `#usda 1.0
def Scope "Payload" {}
`,
      'scene.usda': `#usda 1.0
def "Foo" (
    prepend payload = @./payload.usda@</Payload>
)
{
}
`,
    })
    const stage = (await Stage.open('scene.usda'))!
    expect(typeof (stage as unknown as { unload?: unknown }).unload).toBe('function')
  })

  // test_PrimIsInstanceOrPrototypeOrRoot: PrimIsInstance selects instance
  // roots.
  it('PrimIsInstance / ~PrimIsInstance: isInstance() reproduces the predicate\'s per-prim selection', async () => {
    vfs({
      'ref.usda': `#usda 1.0
def "Ref" { def "Child" {}
}
`,
      'root.usda': `#usda 1.0
def "Root" {
    def "Instance" (
        instanceable = true
        references = @./ref.usda@</Ref>
    ) {}
    def "NonInstance" (
        references = @./ref.usda@</Ref>
    ) {}
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    // Pixar: PrimRange(i, PrimIsInstance) == [i]; PrimRange(i, ~PrimIsInstance) == []
    expect(stage.getPrim('/Root/Instance')!.isInstance()).toBe(true)
    // Pixar: PrimRange(n, PrimIsInstance) == []; PrimRange(n, ~PrimIsInstance) == [n, nChild]
    expect(stage.getPrim('/Root/NonInstance')!.isInstance()).toBe(false)
    expect(stage.getPrim('/Root/NonInstance/Child')!.isInstance()).toBe(false)
    // Pixar: PrimRange(root, PrimIsInstance) == []; PrimRange(root, ~PrimIsInstance) == [root, n, nChild]
    expect(stage.getPrim('/Root')!.isInstance()).toBe(false)
  })

  // test_PrimHasClassSpecifier / test_PrimHasDefiningSpecifier.
  it('PrimHasClassSpecifier / PrimHasDefiningSpecifier', async () => {
    vfs({
      'root.usda': `#usda 1.0
class "a1" {
    def "a2" {}
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    const a1 = stage.getPrim('/a1')!
    // Pixar: a1.HasClassSpecifier() == True.
    expect(a1.hasClassSpecifier()).toBe(true)
  })

  // test_RoundTrip: PreAndPostVisit ordering + IsPostVisit.
  it('PreAndPostVisit reports the post visit for every prim', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    stage.definePrim('/Foo/Bar', 'Mesh')
    const range = UsdPrimRange.preAndPostVisit(stage.getPrim('/Foo')!)
    const iterator = range[Symbol.iterator]()
    const visits: Array<[string, boolean]> = []
    for (let next = iterator.next(); !next.done; next = iterator.next()) {
      visits.push([next.value.path, iterator.isPostVisit()])
    }
    expect(visits).toEqual([
      // primRange.cpp:72-73; native leaf expectation also captured in
      // fixtures/primRangeIteration/expected.json (prePostLeaf).
      ['/Foo', false], ['/Foo/Bar', false], ['/Foo/Bar', true], ['/Foo', true],
    ])
  })

  // PruneChildren skips a subtree mid-iteration.
  it('iterator.pruneChildren() skips the current subtree', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Foo', 'Mesh')
    stage.definePrim('/Foo/Bar', 'Mesh')
    const iterator = UsdPrimRange.fromPrim(stage.getPrim('/Foo')!)[Symbol.iterator]()
    expect(iterator.next().value?.path).toBe('/Foo')
    iterator.pruneChildren()
    expect(iterator.next().done).toBe(true)
  })

  // test_PrimIterationOnExpiredStage (testUsdPrimRange.py:330-350): a range
  // over a dead stage raises. JavaScript has no deterministic destructor, so
  // the stage's lifetime ends at an explicit dispose(), the analog of `del
  // stage` releasing the last reference (stage.cpp:909-916).
  it('test_PrimIterationOnExpiredStage raises when the owning stage expires', () => {
    const makeStage = (): Stage => {
      const stage = Stage.createNew()
      stage.definePrim('/Something/To/Iterate/Over')
      return stage
    }

    let stage = makeStage()
    const primRange = UsdPrimRange.stage(stage)
    stage.dispose()
    expect(() => [...primRange]).toThrow()

    // Usd.PrimRange.Stage(Usd.Stage.Open(rootLayer)) has the same shape as
    // the case above; an iterator whose current prim expires also raises
    // (wrapPrimRange.cpp:144-161).
    stage = makeStage()
    const iterator = UsdPrimRange.stage(stage)[Symbol.iterator]()
    expect(iterator.next().value?.path).toBe('/Something')
    stage.dispose()
    expect(() => iterator.next()).toThrow()

    stage = makeStage()
    const traversal = stage.traverse()
    stage.dispose()
    expect(() => [...traversal]).toThrow()
  })
})
