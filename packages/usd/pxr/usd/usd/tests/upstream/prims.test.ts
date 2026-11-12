// Ported from OpenUSD 26.11.1: pxr/usd/usd/object.h, pxr/usd/usd/prim.cpp,
//  pxr/usd/usd/prim.h, pxr/usd/usd/testenv/testUsdPrims.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdPrims.py (registered as
// testUsdPrims). The testenv directory testUsdPrims.testenv (test.usda,
// payload.usda, MilkCartonA.usda) is copied unmodified into
// fixtures/testUsdPrims (Copyright 2017 Pixar, TOST 1.0,
// https://openusd.org/license). Upstream runs with that directory as the
// working directory, so relative identifiers name the fixtures.
//
// Each upstream test method is one it() (test methods that loop over
// allFormats use it.each). Python-only checks (object identity, hash(),
// unicode-string conversion and printed GetDescription output) have no TS
// counterpart and are omitted; they are noted where they occur.
//
// API mapping (thin forwards in prim.h / object.h spelled through the TS
// surface):
//   - Usd.Stage.CreateInMemory(tag) is Stage.open(Layer.createAnonymous(tag)).
//   - UsdPrim::GetChild(name) is GetStage()->GetPrimAtPath(AppendChild)
//     (prim.cpp:72-76); GetChildrenNames / GetAllChildrenNames /
//     GetFilteredChildrenNames are the names of the matching child range
//     (prim.cpp:236-268).
//   - UsdPrim::GetParent (prim.h:1352) is the prim at the parent path.
//   - UsdPrim::IsActive/IsLoaded/IsDefined/IsAbstract are getters.
//   - UsdPrim::HasAuthoredTypeName / HasAuthoredActive /
//     ClearActive / ClearChildrenReorder / GetChildrenReorder /
//     ClearPropertyOrder / HasAuthoredReferences are the metadata reads and
//     clears prim.h defines them as (prim.h:173-178, 220-224, 306-322,
//     1525-1545, 466-470, 1828-1830).
//   - UsdPrim::SetActive is the async setActive.
//   - UsdPrim::GetAttributes / GetRelationships are the property names of
//     each kind, in GetPropertyNames order (prim.cpp:1415-1436, 1546-1556).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  Attribute, ClipsAPI, CollectionAPI, EditContext, ModelAPI, PrimAllPrimsPredicate,
  PrimDefaultPredicate, PrimIsAbstract, PrimIsActive, PrimIsDefined, PrimIsLoaded,
  PrimIsModel, Rel, SchemaRegistry, Stage, Typed, APISchemaBase,
  type Prim, type PrimPredicate,
} from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdPrims')
const fixture = (name: string): string => path.join(TESTENV, name)

const allFormats = ['usda', 'usdc']

const createInMemory = (tag: string): Promise<Stage> => Stage.open(Layer.createAnonymous(tag))

const childPath = (parent: string, name: string): string =>
  parent === '/' ? `/${name}` : `${parent}/${name}`
const parentPath = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
const nameOf = (prim: Prim): string => prim.path === '/' ? '' : prim.path.slice(prim.path.lastIndexOf('/') + 1)

// UsdPrim::GetChild (prim.cpp:72-76).
const getChild = (prim: Prim, name: string): Prim | undefined =>
  prim.getStage().getPrim(childPath(prim.path, name))
// UsdPrim::GetParent (prim.h:1352): the prim at the parent path; the
// pseudo-root's parent is invalid.
const getParent = (prim: Prim): Prim | undefined =>
  prim.path === '/' ? undefined : prim.getStage().getPrim(parentPath(prim.path))
const paths = (prims: readonly (Prim | undefined)[]): (string | undefined)[] => prims.map(p => p?.path)
const names = (prims: readonly Prim[]): string[] => prims.map(nameOf)

const getSpecifier = (prim: Prim): string => prim.getSpecifier()
// UsdPrim::HasAuthoredActive (prim.h:306-310).
const hasAuthoredActive = (prim: Prim): boolean => prim.hasAuthoredMetadata('active')
// UsdPrim::HasAuthoredTypeName (prim.h:220-224).
const hasAuthoredTypeName = (prim: Prim): boolean => prim.hasAuthoredMetadata('typeName')
// UsdPrim::HasAuthoredReferences (prim.cpp:1855-1859).
const hasAuthoredReferences = (prim: Prim): boolean => prim.hasAuthoredMetadata('references')
// UsdPrim::GetChildrenReorder (prim.h:1525-1530).
const getChildrenReorder = (prim: Prim): string[] => {
  const order = prim.getMetadata('primOrder')
  return Array.isArray(order) ? [...order as string[]] : []
}

// Flag checks the upstream test repeats for every prim.
interface Bits {
  active: boolean; loaded: boolean; model: boolean; group: boolean
  abstract: boolean; defined: boolean
}
const bits = (prim: Prim): Bits => ({
  active: prim.isActive, loaded: prim.isLoaded, model: prim.isModel(),
  group: prim.isGroup(), abstract: prim.isAbstract, defined: prim.isDefined,
})
const B = (active: boolean, loaded: boolean, model: boolean, group: boolean,
  abstract: boolean, defined: boolean): Bits => ({ active, loaded, model, group, abstract, defined })

describe('testUsdPrims', () => {
  it.each(allFormats)('test_Basic (%s)', async (fmt) => {
    const s = await createInMemory('Basics.' + fmt)
    const p = s.getPrim('/')!
    const q = s.getPrim('/')!
    // Python identity and hash() checks have no TS counterpart.
    expect(p.path).toBe(q.path)

    const foo = s.overridePrim('/foo')
    foo.createAttribute('attr', 'string')
    const a = s.getPrim('/foo')!.getAttr('attr')!
    const b = s.getPrim('/foo')!.getAttr('attr')!
    expect(a.isValid() && b.isValid()).toBe(true)
    expect(a.getPath()).toBe(b.getPath())
    expect(a.hasFallbackValue()).toBe(false)
    expect(b.hasFallbackValue()).toBe(false)

    foo.createRelationship('relationship')
    expect(s.getPrim('/foo')!.getPropertyNames()).toContain('relationship')

    // check for prims/props that exist
    expect(s.getPrim('/foo')).toBeDefined()
    expect(s.getObjectAtPath('/foo')).toBeInstanceOf(Object)
    expect(s.getObjectAtPath('/foo.attr')).toBeInstanceOf(Attribute)
    expect(s.getObjectAtPath('/foo.relationship')).toBeInstanceOf(Rel)

    // check for prims/props that dont exist
    expect(s.getObjectAtPath('/nonexistent')).toBeUndefined()
    expect(s.getObjectAtPath('/foo.nonexistentattr')).toBeUndefined()
    expect(s.getObjectAtPath('/foo.nonexistentrelationship')).toBeUndefined()
  })

  it.each(allFormats)('test_OverrideMetadata (%s)', async (fmt) => {
    const weak = Layer.createAnonymous('OverrideMetadataTest.' + fmt)
    const strong = Layer.createAnonymous('OverrideMetadataTest.' + fmt)
    let stage = await Stage.open(weak)
    expect(stage.definePrim('/Mesh/Child', 'Mesh')).toBeTruthy()

    stage = await Stage.open(strong)

    const p0 = stage.overridePrim('/Mesh')
    await p0.getReferences().addReference(weak.identifier, '/Mesh')
    const p = stage.getPrim('/Mesh/Child')!
    expect(p).toBeDefined()
    expect(p.setMetadata('hidden', false)).toBe(true)
    expect(nameOf(p)).toBe('Child')
  })

  it('test_GetPrimStack', async () => {
    const layers = [Layer.createAnonymous('base.usda'),
      Layer.createAnonymous('sublayer.usda'),
      Layer.createAnonymous('payload.usda'),
      Layer.createAnonymous('basic_over.usda')]
    const [base, sublayer, payload, basicOver] = layers as [Layer, Layer, Layer, Layer]
    const primPath = '/root'

    let stage = await Stage.open(sublayer)
    stage.overridePrim(primPath)

    stage = await Stage.open(basicOver)
    stage.overridePrim(primPath)

    stage = await Stage.open(payload)
    const over = stage.overridePrim(primPath)
    await over.getReferences().setReferences([
      { assetPath: basicOver.identifier, primPath, layerOffset: { offset: 0, scale: 2 } }])

    stage = await Stage.open(base)
    const prim = stage.definePrim(primPath)
    await prim.getPayloads().setReferences([
      { assetPath: payload.identifier, primPath, layerOffset: { offset: 10, scale: 1 } }])
    await stage.setSubLayerPaths([sublayer.identifier], [{ offset: 20, scale: 1 }])

    stage = await Stage.open(base)
    const stack = stage.getPrimStack(primPath)

    expect(stack.map(e => [e.layerIdentifier, e.specPath])).toEqual(
      layers.map(layer => [layer.identifier, primPath]))
    expect(stack.map(e => e.offset)).toEqual([
      { offset: 0, scale: 1 },
      { offset: 20, scale: 1 },
      { offset: 10, scale: 1 },
      { offset: 10, scale: 2 },
    ])
  })

  it('test_GetCachedPrimBits', async () => {
    const stage = (await Stage.open(fixture('test.usda'), { loadPayloads: false }))!

    // Check various bits.
    const at = (p: string): Prim => stage.getPrim(p)!
    const root = at('/')
    const globalClass = at('/GlobalClass')
    const abstractSubscope = at('/GlobalClass/AbstractSubscope')
    const abstractOver = at('/GlobalClass/AbstractOver')
    const pureOver = at('/PureOver')
    const undefSubscope = at('/PureOver/UndefinedSubscope')
    const group = at('/Group')
    const modelChild = at('/Group/ModelChild')
    const localChild = at('/Group/LocalChild')
    const undefModelChild = at('/Group/UndefinedModelChild')
    const deactivatedScope = at('/Group/DeactivatedScope')
    const deactivatedModel = at('/Group/DeactivatedModel')
    const deactivatedOver = at('/Group/DeactivatedOver')
    const propertyOrder = at('/PropertyOrder')

    // Named child access API
    expect(getChild(group, 'ModelChild')?.path).toBe(modelChild.path)
    expect(getChild(group, 'LocalChild')?.path).toBe(localChild.path)
    expect(getChild(group, '__NoSuchChild__')).toBeUndefined()

    // Check filtered children access.
    expect(paths(root.getAllChildren())).toEqual(paths([
      globalClass, pureOver, group, propertyOrder]))
    expect(paths(root.getChildren())).toEqual(paths([propertyOrder]))

    const testFilteredChildren = (predicate: PrimPredicate, expected: Prim[]): void => {
      expect(paths(root.getFilteredChildren(predicate))).toEqual(paths(expected))
      expect(names(root.getFilteredChildren(predicate))).toEqual(names(expected))
    }

    // Manually construct the "normal" view using the default predicate.
    testFilteredChildren(PrimDefaultPredicate, [propertyOrder])

    // Manually construct the "normal" view using the individual terms
    // from the default predicate.
    testFilteredChildren(
      PrimIsActive.and(PrimIsLoaded).and(PrimIsDefined).and(PrimIsAbstract.not()),
      [propertyOrder])

    // Only abstract prims.
    testFilteredChildren(PrimIsAbstract, [globalClass])

    // Abstract & defined prims -- still just the class.
    testFilteredChildren(PrimIsAbstract.and(PrimIsDefined), [globalClass])

    // Abstract | unloaded prims -- the class and the group.
    testFilteredChildren(PrimIsAbstract.or(PrimIsLoaded.not()), [globalClass, group])

    // Models only.
    testFilteredChildren(PrimIsModel, [group])

    // Non-models only.
    testFilteredChildren(PrimIsModel.not(), [globalClass, pureOver, propertyOrder])

    // Models or undefined.
    testFilteredChildren(PrimIsModel.or(PrimIsDefined.not()), [pureOver, group])

    // Check individual flags.
    //                        active loaded model  group  abstr  defined
    expect(bits(root)).toEqual(B(true, true, true, true, false, true))
    expect(root.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(root)).toBe('def')

    expect(bits(globalClass)).toEqual(B(true, true, false, false, true, true))
    expect(globalClass.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(globalClass)).toBe('class')

    expect(bits(abstractSubscope)).toEqual(B(true, true, false, false, true, true))
    expect(abstractSubscope.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(abstractSubscope)).toBe('def')

    expect(bits(abstractOver)).toEqual(B(true, true, false, false, true, false))
    expect(abstractOver.hasDefiningSpecifier()).toBe(false)
    expect(getSpecifier(abstractOver)).toBe('over')

    expect(bits(pureOver)).toEqual(B(true, true, false, false, false, false))
    expect(pureOver.hasDefiningSpecifier()).toBe(false)
    expect(getSpecifier(pureOver)).toBe('over')

    expect(bits(undefSubscope)).toEqual(B(true, true, false, false, false, false))
    expect(undefSubscope.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(undefSubscope)).toBe('def')

    expect(bits(group)).toEqual(B(true, false, true, true, false, true))
    expect(group.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(group)).toBe('def')

    expect(bits(modelChild)).toEqual(B(true, false, true, false, false, true))
    expect(modelChild.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(modelChild)).toBe('def')

    expect(bits(localChild)).toEqual(B(true, false, false, false, false, true))
    expect(localChild.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(localChild)).toBe('def')

    expect(bits(undefModelChild)).toEqual(B(true, false, false, false, false, false))
    expect(undefModelChild.hasDefiningSpecifier()).toBe(false)
    expect(getSpecifier(undefModelChild)).toBe('over')

    const deactivatedChild = (prim: Prim) => stage.getPrim(childPath(prim.path, 'child'))
    const scopeInactive = B(false, false, false, false, false, true)
    expect(bits(deactivatedScope)).toEqual(scopeInactive)
    expect(deactivatedScope.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(deactivatedScope)).toBe('def')
    expect(deactivatedChild(deactivatedScope)).toBeUndefined()

    // activate it.
    await deactivatedScope.setActive(true)
    expect(bits(deactivatedScope)).toEqual(B(true, false, false, false, false, true))
    expect(hasAuthoredActive(deactivatedScope)).toBe(true)
    expect(deactivatedScope.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(deactivatedScope)).toBe('def')
    expect(deactivatedChild(deactivatedScope)).toBeDefined()

    // clear active.
    deactivatedScope.clearMetadata('active')
    expect(bits(deactivatedScope)).toEqual(B(true, false, false, false, false, true))
    expect(hasAuthoredActive(deactivatedScope)).toBe(false)
    expect(deactivatedScope.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(deactivatedScope)).toBe('def')
    expect(deactivatedChild(deactivatedScope)).toBeDefined()

    // deactivate it again.
    await deactivatedScope.setActive(false)
    expect(bits(deactivatedScope)).toEqual(scopeInactive)
    expect(hasAuthoredActive(deactivatedScope)).toBe(true)
    expect(deactivatedChild(deactivatedScope)).toBeUndefined()

    expect(bits(deactivatedModel)).toEqual(B(false, false, true, false, false, true))
    expect(deactivatedChild(deactivatedModel)).toBeUndefined()

    expect(bits(deactivatedOver)).toEqual(B(false, false, false, false, false, false))
    expect(deactivatedChild(deactivatedOver)).toBeUndefined()

    // Load the model and recheck.
    await stage.load('/Group')

    expect(bits(group)).toEqual(B(true, true, true, true, false, true))
    expect(group.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(group)).toBe('def')

    // child should be loaded now.
    expect(bits(localChild)).toEqual(B(true, true, false, false, false, true))
    expect(localChild.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(localChild)).toBe('def')

    // undef child should be loaded and defined, due to payload inclusion.
    expect(bits(undefModelChild)).toEqual(B(true, true, false, false, false, true))

    // check prim defined entirely inside payload.
    const payloadChild = stage.getPrim('/Group/PayloadChild')!
    expect(payloadChild).toBeDefined()
    expect(bits(payloadChild)).toEqual(B(true, true, false, false, false, true))
    expect(undefModelChild.hasDefiningSpecifier()).toBe(true)
    expect(getSpecifier(undefModelChild)).toBe('def')

    // check deactivated scope again.
    expect(bits(deactivatedScope)).toEqual(scopeInactive)
    expect(deactivatedChild(deactivatedScope)).toBeUndefined()

    // activate it.
    await deactivatedScope.setActive(true)
    expect(bits(deactivatedScope)).toEqual(B(true, true, false, false, false, true))
    expect(deactivatedChild(deactivatedScope)).toBeDefined()

    // deactivate it again.
    await deactivatedScope.setActive(false)
    expect(bits(deactivatedScope)).toEqual(scopeInactive)
    expect(deactivatedChild(deactivatedScope)).toBeUndefined()
  })

  it.each(allFormats)('test_ChangeTypeName (%s)', async (fmt) => {
    const s = await createInMemory('ChangeTypeName.' + fmt)
    const foo = s.overridePrim('/Foo')

    // Initialize
    expect(foo.typeName).toBe('')
    expect(foo.getMetadata('typeName')).toBeUndefined()
    expect(hasAuthoredTypeName(foo)).toBe(false)

    // Set via public API
    foo.setTypeName('Mesh')
    expect(hasAuthoredTypeName(foo)).toBe(true)
    expect(foo.typeName).toBe('Mesh')
    expect(foo.getMetadata('typeName')).toBe('Mesh')

    foo.clearTypeName()
    expect(foo.typeName).toBe('')
    expect(foo.getMetadata('typeName')).toBeUndefined()
    expect(hasAuthoredTypeName(foo)).toBe(false)

    // Set via metadata
    expect(foo.setMetadata('typeName', 'Scope')).toBe(true)
    expect(hasAuthoredTypeName(foo)).toBe(true)
    expect(foo.typeName).toBe('Scope')
    expect(foo.getMetadata('typeName')).toBe('Scope')
  })

  it.each(allFormats)('test_HasAuthoredReferences (%s)', async (fmt) => {
    const s1 = await createInMemory('HasAuthoredReferences.' + fmt)
    s1.definePrim('/Foo', 'Mesh')
    s1.definePrim('/Bar', 'Mesh')
    const baz1 = s1.definePrim('/Foo/Baz', 'Mesh')
    await baz1.getReferences().addReference(s1.getRootLayer().identifier, '/Bar')

    const s2 = await createInMemory('HasAuthoredReferences.' + fmt)
    const foo = s2.overridePrim('/Foo')
    let baz = s2.getPrim('/Foo/Baz')

    expect(baz).toBeUndefined()
    expect(hasAuthoredReferences(foo)).toBe(false)
    await foo.getReferences().addReference(s1.getRootLayer().identifier, '/Foo')
    const items = [{ assetPath: s1.getRootLayer().identifier, primPath: '/Foo' }]
    expect(hasAuthoredReferences(foo)).toBe(true)

    // Make sure references are detected across composition arcs.
    baz = s2.overridePrim('/Foo/Baz')
    expect(hasAuthoredReferences(baz)).toBe(true)

    // Clear references out.
    await foo.getReferences().clear()
    expect(hasAuthoredReferences(foo)).toBe(false)
    // Child should be gone.
    expect(s2.getPrim('/Foo/Baz')).toBeUndefined()

    // Set the references explicitly.
    await foo.getReferences().setReferences(items)
    expect(hasAuthoredReferences(foo)).toBe(true)
    // Child is back.
    expect(hasAuthoredReferences(s2.getPrim('/Foo/Baz')!)).toBe(true)

    // Explicitly set references to the empty list. The metadata will
    // still exist as an explicitly empty list op.
    await foo.getReferences().setReferences([])
    expect(hasAuthoredReferences(foo)).toBe(true)
    // Child should be gone.
    expect(s2.getPrim('/Foo/Baz')).toBeUndefined()

    // Clear references out. Still empty but no longer explicit.
    await foo.getReferences().clear()
    expect(hasAuthoredReferences(foo)).toBe(false)
    // Child still gone.
    expect(s2.getPrim('/Foo/Baz')).toBeUndefined()

    // Explicitly set references to the empty again from cleared
    // verifying that it is indeed set to explicit.
    await foo.getReferences().setReferences([])
    expect(hasAuthoredReferences(foo)).toBe(true)
    // Child is not back.
    expect(s2.getPrim('/Foo/Baz')).toBeUndefined()
  })

  // UsdStage::CreateNew writes refTest*.usd* into the working directory;
  // here the layers are exported into a temporary directory that is also
  // the working directory for the duration of the test, so the "./" paths
  // anchored to the in-memory layer resolve against it as upstream does
  // under the default resolver. ResolveIdentifierToEditTarget is async here
  // because Ar resolution is.
  it.each(allFormats)('test_GoodAndBadReferences (%s)', async (fmt) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'testUsdPrims-'))
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      // Sub-root references are allowed
      const s1 = await createInMemory('References.' + fmt)
      s1.definePrim('/Foo', 'Mesh')
      s1.definePrim('/Bar/Bazzle', 'Mesh')
      const baz = s1.definePrim('/Foo/Baz', 'Mesh')
      const bazRefs = baz.getReferences()
      await bazRefs.addReference(s1.getRootLayer().identifier, '/Bar/Bazzle')

      // Test that both in-memory identifiers, relative paths, and absolute
      // paths all resolve properly
      const createNew = async (name: string, primPath: string, typeName: string): Promise<Stage> => {
        const filePath = path.join(dir, name)
        const scratch = await createInMemory(name)
        scratch.definePrim(primPath, typeName)
        expect(await scratch.getRootLayer().export(filePath)).toBe(true)
        return (await Stage.open(filePath))!
      }
      const s2 = await createNew('refTest1.' + fmt, '/Sphere', 'Sphere')
      const sphere = s2.getPrim('/Sphere')!
      const sphereRefs = sphere.getReferences()
      await createNew('refTest2.' + fmt, '/Box', 'Cube')
      expect(await s2.resolveIdentifierToEditTarget(
        s1.getRootLayer().identifier)).toBe(s1.getRootLayer().identifier)
      expect(await s2.resolveIdentifierToEditTarget('./refTest2.' + fmt)).not.toBe('')
      expect(await s2.resolveIdentifierToEditTarget(s2.getRootLayer().realPath)).not.toBe('')
      // but paths to non-existent files fail
      expect(await s2.resolveIdentifierToEditTarget('./noFile.' + fmt)).toBe('')
      // paths relative to in-memory layers resolve relative to the cwd
      // (under the default resolver)
      expect(await s1.resolveIdentifierToEditTarget('./refTest2.' + fmt)).not.toBe('')

      // A good reference generates no errors or exceptions (UsdReferences
      // reports failure by throwing here rather than returning false).
      await bazRefs.addReference(s2.getRootLayer().identifier, '/Sphere')

      // A bad reference succeeds, but generates warnings from compose errors.
      expect(hasAuthoredReferences(sphere)).toBe(false)
      await sphereRefs.addReference('./refTest2.' + fmt, '/noSuchPrim')
      expect(hasAuthoredReferences(sphere)).toBe(true)
    } finally {
      process.chdir(cwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('test_PropertyOrder', async () => {
    const stage = (await Stage.open(fixture('test.usda'), { loadPayloads: false }))!
    const po = stage.getPrim('/PropertyOrder')!
    expect(po).toBeDefined()
    const props = po.getPropertyNames()
    const isRel = (name: string) => stage.getObjectAtPath(`${po.path}.${name}`) instanceof Rel
    // expected order:
    expect(props.filter(n => !isRel(n))).toEqual(['A0', 'a1', 'a2', 'A3', 'a4', 'a5', 'a10', 'A20'])
    expect(props.filter(isRel)).toEqual(['R0', 'r1', 'r2', 'R3', 'r4', 'r5', 'r10', 'R20'])
  })

  it.each(allFormats)('test_PropertyReorder (%s)', async (fmt) => {
    const l = (chars: string): string[] => [...chars]
    const s = await createInMemory('PropertyReorder.' + fmt)
    const f = s.overridePrim('/foo')

    s.setEditTarget(s.getRootLayer())
    for (const name of l('abcd').reverse()) f.createAttribute(name, 'int')

    s.setEditTarget(s.getSessionLayer())
    for (const name of l('defg').reverse()) f.createAttribute(name, 'int')

    const prim = () => s.getPrim('/foo')!
    expect(prim().getPropertyNames()).toEqual(l('abcdefg'))

    const pred = (tok: string) => ['a', 'd', 'f'].includes(tok)
    expect(prim().getPropertyNames(pred)).toEqual(l('adf'))

    prim().setPropertyOrder(l('edc'))
    expect(prim().getPropertyNames()).toEqual(l('edcabfg'))

    prim().setPropertyOrder(l('a'))
    expect(prim().getPropertyNames()).toEqual(l('abcdefg'))

    prim().setPropertyOrder([])
    expect(prim().getPropertyNames()).toEqual(l('abcdefg'))

    prim().setPropertyOrder(l('g'))
    expect(prim().getPropertyNames()).toEqual(l('gabcdef'))

    prim().setPropertyOrder(l('d'))
    expect(prim().getPropertyNames()).toEqual(l('dabcefg'))

    expect(prim().getPropertyNames(pred)).toEqual(l('daf'))

    prim().setPropertyOrder(l('xyz'))
    expect(prim().getPropertyNames()).toEqual(l('abcdefg'))

    prim().setPropertyOrder(l('xcydze'))
    expect(prim().getPropertyNames()).toEqual(l('cdeabfg'))

    prim().setPropertyOrder(l('gfedcba'))
    expect(prim().getPropertyNames()).toEqual(l('gfedcba'))

    // UsdPrim::ClearPropertyOrder (prim.h:466-470).
    prim().clearMetadata('propertyOrder')
    expect(prim().getPropertyNames()).toEqual(l('abcdefg'))
  })

  it.each(allFormats)('test_ChildrenReorder (%s)', async (fmt) => {
    const l = (chars: string): string[] => [...chars]

    const testAllChildren = (p: Prim, expectedNames: string[]): void => {
      expect(names(p.getAllChildren())).toEqual(expectedNames)
      expect(paths(p.getAllChildren())).toEqual(paths(expectedNames.map(n => getChild(p, n))))
    }
    const testChildren = (p: Prim, expectedNames: string[]): void => {
      expect(names(p.getChildren())).toEqual(expectedNames)
      expect(paths(p.getChildren())).toEqual(paths(expectedNames.map(n => getChild(p, n))))
    }

    const testOrder = (s: Stage, parentPathStr: string): void => {
      const fPath = parentPathStr || '/'
      if (parentPathStr) s.definePrim(parentPathStr)
      const f = () => s.getPrim(fPath)!

      s.setEditTarget(s.getRootLayer())
      for (const name of l('abcd')) s.definePrim(parentPathStr + '/' + name)

      s.setEditTarget(s.getSessionLayer())
      for (const name of l('defg')) s.overridePrim(parentPathStr + '/' + name)

      // Start with no primOrder set. Default order.
      expect(f().getMetadata('primOrder')).toBeUndefined()
      expect(getChildrenReorder(f())).toEqual([])
      testAllChildren(f(), l('abcdefg'))
      testChildren(f(), l('abcd'))

      // Set partial ordering.
      f().setChildrenReorder(l('edc'))
      expect(f().getMetadata('primOrder')).toEqual(l('edc'))
      expect(getChildrenReorder(f())).toEqual(l('edc'))
      testAllChildren(f(), l('abefgdc'))
      testChildren(f(), l('abdc'))

      // Empty ordering. Back to default order.
      f().setChildrenReorder([])
      expect(f().getMetadata('primOrder')).toEqual([])
      expect(getChildrenReorder(f())).toEqual([])
      testAllChildren(f(), l('abcdefg'))
      testChildren(f(), l('abcd'))

      // Single entry in order. Still maintains default ordering.
      f().setChildrenReorder(l('d'))
      expect(f().getMetadata('primOrder')).toEqual(l('d'))
      expect(getChildrenReorder(f())).toEqual(l('d'))
      testAllChildren(f(), l('abcdefg'))
      testChildren(f(), l('abcd'))

      // Set ordering with no valid names. Default ordering.
      f().setChildrenReorder(l('xyz'))
      expect(f().getMetadata('primOrder')).toEqual(l('xyz'))
      expect(getChildrenReorder(f())).toEqual(l('xyz'))
      testAllChildren(f(), l('abcdefg'))
      testChildren(f(), l('abcd'))

      // Set reorder with interspersed invalid names. Reorders with just
      // the valid names.
      f().setChildrenReorder(l('xeydzc'))
      expect(f().getMetadata('primOrder')).toEqual(l('xeydzc'))
      expect(getChildrenReorder(f())).toEqual(l('xeydzc'))
      testAllChildren(f(), l('abefgdc'))
      testChildren(f(), l('abdc'))

      // Full reorder containing all the child prims.
      f().setChildrenReorder(l('gfedcba'))
      expect(f().getMetadata('primOrder')).toEqual(l('gfedcba'))
      expect(getChildrenReorder(f())).toEqual(l('gfedcba'))
      testAllChildren(f(), l('gfedcba'))
      testChildren(f(), l('dcba'))

      // Clear the reorder on the session layer. Return to original order.
      // UsdPrim::ClearChildrenReorder (prim.h:1541-1545).
      f().clearMetadata('primOrder')
      expect(f().getMetadata('primOrder')).toBeUndefined()
      expect(getChildrenReorder(f())).toEqual([])
      testAllChildren(f(), l('abcdefg'))
      testChildren(f(), l('abcd'))

      // Do a full reorder on the root layer.
      const ctx = new EditContext(s, s.getRootLayer())
      f().setChildrenReorder(l('gfedcba'))
      ctx.close()
      expect(f().getMetadata('primOrder')).toEqual(l('gfedcba'))
      expect(getChildrenReorder(f())).toEqual(l('gfedcba'))
      // Because the reorder is authored on the root layer, it only
      // reorders the prims that are defined on the root layer because
      // prim order is processed during composition. The prims defined on
      // the session layer are not reordered.
      testAllChildren(f(), l('dcbaefg'))
      testChildren(f(), l('dcba'))

      // Set an empty ordering on session layer. The strongest resolved
      // metadata is now empty, but the reordering from the root layer
      // metadata still takes place.
      f().setChildrenReorder([])
      expect(f().getMetadata('primOrder')).toEqual([])
      expect(getChildrenReorder(f())).toEqual([])
      testAllChildren(f(), l('dcbaefg'))
      testChildren(f(), l('dcba'))
    }

    const s = await createInMemory('PrimReorder.' + fmt)
    // Test the pseudoroot first before testing on a "real" prim parent
    // which gets added as a pseudoroot child.
    testOrder(s, '')
    testOrder(s, '/foo')
  })

  it.each(allFormats)('test_DefaultPrim (%s)', async (fmt) => {
    // No default prim to start.
    const s = await createInMemory('DefaultPrim.' + fmt)
    expect(s.getDefaultPrim()).toBeUndefined()

    // Set defaultPrim metadata on root layer, but no prim in scene
    // description.
    s.getRootLayer().setDefaultPrim('foo')
    expect(s.getDefaultPrim()).toBeUndefined()

    // Create the prim, should pick it up.
    const fooPrim = s.overridePrim('/foo')
    expect(s.getDefaultPrim()?.path).toBe(fooPrim.path)

    // Change defaultPrim, ensure it picks up again.
    s.getRootLayer().setDefaultPrim('bar')
    expect(s.getDefaultPrim()).toBeUndefined()
    const barPrim = s.overridePrim('/bar')
    expect(s.getDefaultPrim()?.path).toBe(barPrim.path)

    // Set sub-root prims as default, should pick it up
    s.getRootLayer().setDefaultPrim('foo/bar')
    expect(s.getDefaultPrim()).toBeUndefined()
    const fooBarPrim = s.overridePrim('/foo/bar')
    expect(s.getDefaultPrim()?.path).toBe(fooBarPrim.path)

    // Try error cases
    s.getRootLayer().setDefaultPrim('')
    expect(s.getDefaultPrim()).toBeUndefined()

    // Try stage-level authoring API.
    s.setDefaultPrim(fooPrim)
    expect(s.getDefaultPrim()?.path).toBe(fooPrim.path)
    expect(s.hasDefaultPrim()).toBe(true)
    s.clearDefaultPrim()
    expect(s.getDefaultPrim()).toBeUndefined()
    expect(s.hasDefaultPrim()).toBe(false)
  })

  it.each(allFormats)('test_GetNextSibling (%s)', async (fmt) => {
    // Upstream seeds Python's random with the time; a fixed-seed LCG gives
    // the same coverage (25% defined, otherwise over) reproducibly.
    let seed = 12345
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const s = await createInMemory('GetNextSibling.' + fmt)

    // Create a stage with some prims, some defined, others not, at random.
    const nameList = l4()
    function l4(): string[] { return [...'abcd'] }
    const make = (depth: number, prefix = ''): void => {
      for (const name of nameList) {
        if (depth) make(depth - 1, `${prefix}/${name}`)
        else if (random() <= 0.25) s.definePrim(prefix)
        else s.overridePrim(prefix)
      }
    }

    // Now walk every prim on the stage, and ensure that obtaining children
    // by GetChildren() and walking siblings via GetNextSibling() returns the
    // same results.
    const test = (root: Prim): void => {
      const direct = root.getChildren()
      const bySib: Prim[] = []
      if (direct.length) {
        bySib.push(direct[0]!)
        for (let next = bySib.at(-1)!.getNextSibling(); next; next = bySib.at(-1)!.getNextSibling()) {
          bySib.push(next)
        }
      }
      expect(paths(bySib)).toEqual(paths(direct))
      for (const child of direct) test(child)
    }

    make(4)
    test(s.getPrim('/')!)
  })

  it.each(allFormats)('test_Instanceable (%s)', async (fmt) => {
    const s = await createInMemory('Instanceable.' + fmt)
    const p = () => s.getPrim('/Instanceable')!
    s.definePrim('/Instanceable', 'Mesh')
    expect(p().isInstanceable()).toBe(false)
    expect(p().getMetadata('instanceable')).toBeUndefined()
    expect(p().hasAuthoredInstanceable()).toBe(false)

    p().setInstanceable(true)
    expect(p().isInstanceable()).toBe(true)
    expect(p().getMetadata('instanceable')).toBe(true)
    expect(p().hasAuthoredInstanceable()).toBe(true)

    p().setInstanceable(false)
    expect(p().isInstanceable()).toBe(false)
    expect(p().getMetadata('instanceable')).toBe(false)
    expect(p().hasAuthoredInstanceable()).toBe(true)

    p().clearInstanceable()
    expect(p().isInstanceable()).toBe(false)
    expect(p().getMetadata('instanceable')).toBeUndefined()
    expect(p().hasAuthoredInstanceable()).toBe(false)
  })

  it('test_GetComposedPrimChildrenAsMetadataTest', async () => {
    const stage = (await Stage.open(fixture('MilkCartonA.usda')))!
    const prim = stage.getPrim('/MilkCartonA')!
    expect(prim).toBeDefined()
    expect(prim.getAllMetadata()['typeName']).toBe('Xform')
  })

  it.each(allFormats)('test_GetPrimIndex (%s)', async (fmt) => {
    const s = await createInMemory('GetPrimIndex.' + fmt)
    s.definePrim('/Class')
    s.definePrim('/Ref')
    s.definePrim('/Ref/Child')
    const p = s.definePrim('/Instance')
    await p.getInherits().addInherit('/Class')
    await p.getReferences().addReference('', '/Ref')
    s.getPrim('/Instance')!.setInstanceable(true)
    await s.flushChanges()

    const validatePrimIndexes = (prim: Prim): void => {
      // Assert that the prim indexes for the prim at this path
      // are valid. Also dump them to a string just to force
      // all nodes in the prim index to be touched.
      expect(prim.getPrimIndex().isValid()).toBe(true)
      expect(prim.getPrimIndex().isUsd()).toBe(true)
      expect(prim.getPrimIndex().dumpToString()).toBeTruthy()
      expect(prim.computeExpandedPrimIndex().isValid()).toBe(true)
      expect(prim.computeExpandedPrimIndex().isUsd()).toBe(true)
      expect(prim.computeExpandedPrimIndex().dumpToString()).toBeTruthy()
    }

    validatePrimIndexes(s.getPrim('/')!)
    validatePrimIndexes(s.getPrim('/Ref')!)
    validatePrimIndexes(s.getPrim('/Ref/Child')!)

    // Prototype prims do not expose a valid prim index, but can still
    // be used to compute an expanded prim index which is necessary for
    // composition queries.
    const prototype = s.getPrototypes()[0]!
    expect(prototype.getPrimIndex().isValid()).toBe(false)
    expect(prototype.getPrimIndex().isUsd()).toBe(false)
    expect(prototype.getPrimIndex().dumpToString()).toBeFalsy()
    expect(prototype.computeExpandedPrimIndex().isValid()).toBe(true)
    expect(prototype.computeExpandedPrimIndex().isUsd()).toBe(true)
    expect(prototype.computeExpandedPrimIndex().dumpToString()).toBeTruthy()

    // However, prims beneath prototypes do expose a valid prim index.
    validatePrimIndexes(getChild(prototype, 'Child')!)
  })

  it.each(allFormats)('test_PseudoRoot (%s)', async (fmt) => {
    const s = await createInMemory(`PseudoRoot.${fmt}`)
    const w = s.definePrim('/World')
    const p = s.getPrim('/')!
    expect(p._prim.isPseudoRoot()).toBe(true)
    expect(p.isValid()).toBe(true)
    expect(s.getPrim('/World')!._prim.isPseudoRoot()).toBe(false)
    expect(getParent(w)!._prim.isPseudoRoot()).toBe(true)
    expect(getParent(w)!.isValid()).toBe(true)
    expect(getParent(p)).toBeUndefined()
  })

  it.each(allFormats)('test_Deactivation (%s)', async (fmt) => {
    const s = await createInMemory(`Deactivation.${fmt}`)
    s.definePrim('/Root/Group/Child')

    const group = s.getPrim('/Root/Group')!
    expect(paths(group.getAllChildren())).toEqual(['/Root/Group/Child'])
    expect(s._getPcpCache()!.findPrimIndex('/Root/Group/Child')).toBeTruthy()

    await group.setActive(false)

    // Deactivating a prim removes all of its children from the stage.
    // Note that the deactivated prim itself still exists on the stage;
    // this allows users to reactivate it.
    expect(s.getPrim('/Root/Group')!.getAllChildren()).toEqual([])

    // Deactivating a prim should also cause the underlying prim
    // indexes for its children to be removed.
    expect(s._getPcpCache()!.findPrimIndex('/Root/Group/Child')).toBeFalsy()
  })

  it('test_AppliedSchemas', async () => {
    // UsdSchemaBase::IsAPISchema / IsAppliedAPISchema /
    // IsMultipleApplyAPISchema / GetSchemaKind read the class's schema kind.
    expect(SchemaRegistry.getSchemaKind('ModelAPI')).toBe('nonAppliedAPI')
    expect(SchemaRegistry.getSchemaKind('ClipsAPI')).toBe('nonAppliedAPI')
    expect(SchemaRegistry.getSchemaKind('CollectionAPI')).toBe('multipleApplyAPI')
    expect(SchemaRegistry.isMultipleApplyAPISchema('CollectionAPI')).toBe(true)
    expect(ModelAPI).toBeDefined()
    expect(ClipsAPI).toBeDefined()

    for (const fmt of allFormats) {
      const s = await createInMemory(`AppliedSchemas.${fmt}`)
      s.setEditTarget(s.getRootLayer())

      let world = s.overridePrim('/world')
      expect(world.getAppliedSchemas()).toEqual([])

      const rootCollAPI = CollectionAPI.apply(world, 'root')
      expect(rootCollAPI).toBeTruthy()

      world = s.getPrim('/world')!
      expect(world.hasAPI('CollectionAPI')).toBe(true)

      // HasAPI always returns false (but doesn't error) for types that
      // aren't applied API schema types.
      expect(world.hasAPI(SchemaRegistry.getTypeFromName('Typed'))).toBe(false)
      expect(world.hasAPI(SchemaRegistry.getTypeFromName('APISchemaBase'))).toBe(false)
      expect(world.hasAPI('ModelAPI')).toBe(false)
      void Typed; void APISchemaBase

      expect(world.getAppliedSchemas()).toEqual(['CollectionAPI:root'])

      // Switch the edit target to the session layer and test bug 156929
      s.setEditTarget(s.getSessionLayer())
      const sessionCollAPI = CollectionAPI.apply(s.getPrim('/world')!, 'session')
      expect(sessionCollAPI).toBeTruthy()
      expect(s.getPrim('/world')!.getAppliedSchemas()).toEqual(
        ['CollectionAPI:session', 'CollectionAPI:root'])
      expect(s.getPrim('/world')!.hasAPI('CollectionAPI')).toBe(true)

      // Ensure duplicates aren't picked up
      CollectionAPI.apply(s.getPrim('/world')!, 'session')
      expect(s.getPrim('/world')!.getAppliedSchemas()).toEqual(
        ['CollectionAPI:session', 'CollectionAPI:root'])

      // Add a duplicate in the root layer and ensure that there are no
      // duplicates in the composed result.
      s.setEditTarget(s.getRootLayer())
      CollectionAPI.apply(s.getPrim('/world')!, 'session')
      expect(s.getPrim('/world')!.getAppliedSchemas()).toEqual(
        ['CollectionAPI:session', 'CollectionAPI:root'])
    }
  })

  it.each(allFormats)('test_Bug160615 (%s)', async (fmt) => {
    const s = await createInMemory(`Bug160615.${fmt}`)
    let p = s.overridePrim('/Foo/Bar')
    expect(p.isValid()).toBe(true)

    expect(s.removePrim(p.path)).toBe(true)
    expect(p.isValid()).toBe(false)

    p = s.overridePrim('/Foo/Bar')
    expect(p.isValid()).toBe(true)
  })

  it.each(allFormats)('test_GetAtPath (%s)', async (fmt) => {
    const stage = await createInMemory(`GetAtPath.${fmt}`)
    stage.definePrim('/Parent/Child')
    stage.definePrim('/Parent/Child/Grandchild')
    const sibling = stage.definePrim('/Parent/Sibling')
    sibling.createAttribute('x', 'int')
    stage.getPrim('/Parent/Child/Grandchild')!.createRelationship('y')
    const child = stage.getPrim('/Parent/Child')!
    const grandchild = stage.getPrim('/Parent/Child/Grandchild')!
    const x = '/Parent/Sibling.x'
    const y = '/Parent/Child/Grandchild.y'

    // Double check axioms about prim validity
    expect(child.isValid() && grandchild.isValid()).toBe(true)
    expect(stage.getPrim('')).toBeUndefined()

    // Test relative prim paths
    expect(child.getPrimAtPath('../Sibling')?.path).toBe('/Parent/Sibling')
    expect(child.getPrimAtPath('Grandchild')?.path).toBe(grandchild.path)
    expect(child.getPrimAtPath('..')?.path).toBe(getParent(child)!.path)

    // Test absolute prim paths
    expect(child.getPrimAtPath('/Parent/Sibling')?.path).toBe('/Parent/Sibling')
    expect((child.getObjectAtPath('../Sibling') as Prim).path).toBe('/Parent/Sibling')

    // Test invalid paths
    expect(child.getPrimAtPath('../InvalidPath')).toBeUndefined()

    // Test relative propeties
    expect(child.getRelationshipAtPath('Grandchild.y')?.getPath()).toBe(y)
    expect(child.getAttributeAtPath('../Sibling.x')?.getPath()).toBe(x)
    expect(child.getPropertyAtPath('Grandchild.y')?.getPath()).toBe(y)
    expect(child.getPropertyAtPath('../Sibling.x')?.getPath()).toBe(x)

    // Test Absolute propeties
    expect(child.getRelationshipAtPath('/Parent/Child/Grandchild.y')?.getPath()).toBe(y)
    expect(child.getAttributeAtPath('/Parent/Sibling.x')?.getPath()).toBe(x)
    expect(child.getPropertyAtPath('/Parent/Child/Grandchild.y')?.getPath()).toBe(y)
    expect(child.getPropertyAtPath('/Parent/Sibling.x')?.getPath()).toBe(x)

    // Test invalid paths
    expect(child.getPropertyAtPath('.z')).toBeUndefined()
    expect(child.getRelationshipAtPath('.z')).toBeUndefined()
    expect(child.getAttributeAtPath('.z')).toBeUndefined()

    // Test valid paths but invalid types
    expect(child.getPrimAtPath('/Parent/Child/Grandchild.y')).toBeUndefined()
    expect(child.getPrimAtPath('/Parent/Sibling.x')).toBeUndefined()
    expect(child.getAttributeAtPath('/Parent/Child/Grandchild.y')).toBeUndefined()
    expect(child.getRelationshipAtPath('/Parent/Sibling.x')).toBeUndefined()
    expect(child.getAttributeAtPath('/Parent/Child/Grandchild')).toBeUndefined()
    expect(child.getRelationshipAtPath('/Parent/Sibling')).toBeUndefined()

    // Test that empty paths don't raise exceptions
    expect(child.getPrimAtPath('')).toBeUndefined()
    expect(child.getObjectAtPath('')).toBeUndefined()
    expect(child.getPropertyAtPath('')).toBeUndefined()
    expect(child.getAttributeAtPath('')).toBeUndefined()
    expect(child.getRelationshipAtPath('')).toBeUndefined()

    // Verify type deduction
    expect(child.getObjectAtPath('../Sibling')).not.toBeInstanceOf(Attribute)
    expect(child.getObjectAtPath('../Sibling.x')).toBeInstanceOf(Attribute)
    expect(child.getObjectAtPath('Grandchild.y')).toBeInstanceOf(Rel)
    expect(child.getPropertyAtPath('../Sibling.x')).toBeInstanceOf(Attribute)
    expect(child.getPropertyAtPath('Grandchild.y')).toBeInstanceOf(Rel)
  })

  // Upstream prints the descriptions; expected strings are the 26.11.1
  // build's (fixtures/primDescription), with anonymous layer identifiers
  // numbered in order of first appearance. The "del s" step (descriptions
  // of expired prims) has no counterpart: the stage is garbage collected.
  it('test_GetDescription', async () => {
    const rootLayer = Layer.createAnonymous('.usda')
    rootLayer.importFromString(`#usda 1.0

def Scope "Ref"
{
    def Scope "Child"
    {
    }
}

def Scope "Instance" (
    instanceable = True
    references = </Ref>
)
{
}`)
    const s = await Stage.open(rootLayer)
    const basic = s.getPrim('/Ref')!
    const basicChild = getChild(basic, 'Child')!
    const instance = s.getPrim('/Instance')!
    const instanceProxyChild = getChild(instance, 'Child')!
    const prototype = instance.getPrototype()!
    const prototypeChild = getChild(prototype, 'Child')!
    const prims: Record<string, Prim> = {
      basic, basicChild, instance, instanceProxyChild, prototype, prototypeChild,
    }
    const anon = new Map<string, number>()
    const normalize = (text: string): string => text.replace(/anon:[^:@]+:([^@]*)/g, (m, tag: string) => {
      if (!anon.has(m)) anon.set(m, anon.size)
      return `anon:${anon.get(m)}:${tag}`
    })
    const expected = JSON.parse(readFileSync(
      path.join(TESTENV, '../primDescription/expected.json'), 'utf8')).payload
    expect(prototype.path).toBe(expected.prototypePath)
    const actual = Object.fromEntries(Object.entries(prims).map(([k, p]) => [k, normalize(p.getDescription())]))
    expect(actual).toEqual(expected.descriptions)
  })
})

void PrimAllPrimsPredicate
