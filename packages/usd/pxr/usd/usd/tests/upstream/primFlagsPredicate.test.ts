// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdPrimFlagsPredicate.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD pxr/usd/usd/testenv/testUsdPrimFlagsPredicate.py.
// Predicate terms, algebra, default traversal, and composed flag inputs are
// checked against the v26.05 Python oracle.
import { describe, expect, it } from 'vitest'
import * as UsdModule from 'typescript-usd/usd'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

function loadStage(name: string, text: string) {
  return Stage.open(name, { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ [name]: new TextEncoder().encode(text) })) }).then(value => value!)
}

// The upstream setUp scene: a defined parent with an `over` child.
const PARENT_CHILD = `#usda 1.0
def "Parent"
{
    over "Child"
    {
    }
}
`

// An active=false subtree, plus a sibling that survives composition.
const ACTIVE_SCENE = `#usda 1.0
def Scope "Keep"
{
}
def Xform "Inactive" (
    active = false
)
{
    def Scope "Gone"
    {
    }
}
`

// -------------------------------------------------------------------------
// Invalid / missing prim (upstream testNullPrim)
// -------------------------------------------------------------------------
describe('invalid prim', () => {
  // Upstream: Usd.PrimDefaultPredicate(Usd.Prim()) raises Tf.ErrorException.
  it('getPrim of a missing path returns undefined', async () => {
    const stage = await loadStage('parent.usda', PARENT_CHILD)
    expect(stage.getPrim('/NoSuch')).toBeUndefined()
  })

  it(
    'PrimDefaultPredicate(invalid prim) raises',
    () => {
      expect(() => UsdModule.PrimDefaultPredicate.evaluate(undefined as never)).toThrow()
    },
  )
})

// -------------------------------------------------------------------------
// Defined parent vs. over child (upstream testSimpleParentChild)
// -------------------------------------------------------------------------
describe('defined parent / over child', () => {
  // Pixar usd-2605: the defined parent is a valid prim with typeName ''
  // (DefinePrim with no type), IsActive() == True.
  it('the defined parent is a valid, active prim', async () => {
    const stage = await loadStage('parent.usda', PARENT_CHILD)
    const parent = stage.getPrim('/Parent')
    expect(parent).toBeDefined()
    expect(parent!.typeName).toBe('')
    expect(parent!.isActive).toBe(true)
  })

  it('the over child exists but fails isDefined and default traversal', async () => {
    const stage = await loadStage('parent.usda', PARENT_CHILD)
    const child = stage.getPrim('/Parent/Child')
    expect(child).toBeDefined()
    expect(child!.typeName).toBe('')
    expect(child!.isDefined).toBe(false)
    expect([...stage.traverse()]).not.toContain('/Parent/Child')
  })

  // typescript-usd's Prim has no isDefined flag to reproduce this distinction — both
  // the defined parent and the over child compose identically.
  it(
    'PrimDefaultPredicate(parent)==True, (over child)==False — no isDefined/specifier API',
    async () => {
      const stage = await loadStage('parent.usda', PARENT_CHILD)
      const parent = stage.getPrim('/Parent')!
      const child = stage.getPrim('/Parent/Child')!
      expect((parent as unknown as { isDefined?: boolean }).isDefined).toBe(true)
      expect((child as unknown as { isDefined?: boolean }).isDefined).toBe(false)
    },
  )
})

// -------------------------------------------------------------------------
// PrimIsActive — the one flag with an observable analog
// -------------------------------------------------------------------------
describe('Prim.isActive', () => {
  it('defaults to true when no active opinion is authored', async () => {
    const stage = await loadStage('active.usda', ACTIVE_SCENE)
    // Pixar usd-2605: /Keep.IsActive() == True
    expect(stage.getPrim('/Keep')!.isActive).toBe(true)
  })

  it('is false when active = false is authored', async () => {
    const stage = await loadStage('active.usda', ACTIVE_SCENE)
    // Pixar usd-2605: /Inactive.IsActive() == False (valid prim, IsDefined True)
    expect(stage.getPrim('/Inactive')!.isActive).toBe(false)
  })

  it('the inactive prim itself stays composed on the stage', async () => {
    const stage = await loadStage('active.usda', ACTIVE_SCENE)
    // Pixar usd-2605: GetPrimAtPath('/Inactive') is valid and TraverseAll
    // includes it, while the default traversal does not.
    expect(stage.getPrim('/Inactive')).toBeDefined()
    expect([...stage.traverse()]).not.toContain('/Inactive')
    expect([...stage.traverseAll()]).toContain('/Inactive')
  })

  it('prunes the inactive prim subtree from composition', async () => {
    const stage = await loadStage('active.usda', ACTIVE_SCENE)
    // Pixar usd-2605: GetPrimAtPath('/Inactive/Gone') is invalid;
    // /Inactive.GetChildren() == [].
    expect(stage.getPrim('/Inactive/Gone')).toBeUndefined()
    expect(stage.getChildPrimPaths('/Inactive')).toEqual([])
    expect([...stage.traverse()]).not.toContain('/Inactive/Gone')
  })
})

// -------------------------------------------------------------------------
// typeName presence (the PrimHasDefiningSpecifier / typeName facet)
// -------------------------------------------------------------------------
describe('Prim.typeName presence', () => {
  it('a typed def reports its type, an untyped def reports ""', async () => {
    const stage = await loadStage('active.usda', ACTIVE_SCENE)
    // Pixar usd-2605: /Inactive.GetTypeName() == 'Xform', /Keep == 'Scope'.
    expect(stage.getPrim('/Inactive')!.typeName).toBe('Xform')
    expect(stage.getPrim('/Keep')!.typeName).toBe('Scope')
  })
})

// -------------------------------------------------------------------------
// Predicate algebra
// -------------------------------------------------------------------------
describe('PrimFlags predicate algebra', () => {
  it(
    'predicate algebra composes conjunction, disjunction and negation',
    async () => {
      const stage = await loadStage('active.usda', ACTIVE_SCENE)
      const keep = stage.getPrim('/Keep')!
      const inactive = stage.getPrim('/Inactive')!
      const conjunction = UsdModule.PrimIsActive.and(UsdModule.PrimIsDefined)
        .and(UsdModule.PrimIsAbstract.not())
      expect(conjunction.evaluate(keep)).toBe(true)
      expect(conjunction.evaluate(inactive)).toBe(false)
      expect(UsdModule.PrimIsActive.not().or(UsdModule.PrimIsAbstract)
        .evaluate(inactive)).toBe(true)
    },
  )

  it(
    'PrimIsLoaded / PrimIsModel / PrimIsInstance are predicate terms',
    () => {
      expect(UsdModule.PrimIsLoaded).toBeInstanceOf(UsdModule.PrimFlagsPredicate)
      expect(UsdModule.PrimIsModel).toBeInstanceOf(UsdModule.PrimFlagsPredicate)
      expect(UsdModule.PrimIsInstance).toBeInstanceOf(UsdModule.PrimFlagsPredicate)
    },
  )

  it(
    'default-predicate Traverse excludes inactive + over prims',
    async () => {
      const parentStage = await loadStage('parent.usda', PARENT_CHILD)
      expect([...parentStage.traverse()]).not.toContain('/Parent/Child')

      const activeStage = await loadStage('active.usda', ACTIVE_SCENE)
      expect([...activeStage.traverse()]).not.toContain('/Inactive')
    },
  )
})
