// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdCreateProperties.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdCreateProperties.py
// (registered as testUsdCreateProperties).
//
// Mapping:
//  - Upstream's _CreateLayer is Sdf.Layer.CreateAnonymous; Usd.Stage.CreateNew
//    (test_Namespaces' file-backed run) is likewise an anonymous layer of the
//    same format.
//  - Usd.Property / Usd.Attribute / Usd.Relationship are all the Attribute
//    property handle; UsdRel is the relationship authoring handle.
//  - Get() returning None is an undefined result.
//
// Not ported:
//  - test_GetSetNumpy: numpy array conversion of the Python bindings.
//  - test_Downcast: Python wrapping returning the most derived property
//    class; properties here are one handle type distinguished by
//    isRelationship.
//  - test_HasValue's last step deletes the edit target's sublayer and relies
//    on reference counting expiring it before Clear(); layer lifetime here
//    follows garbage collection.
//  - test_ImplicitSpecCreation's relative-path AddTarget at
//    ListPositionBackOfAppendList: UsdRel.addTarget takes no list position
//    in this library yet. strongLayer._WriteDataFile is a debugging aid.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, Layer, ValueRoleNames as SdfValueRoleNames } from 'typescript-usd/sdf'
import { Vec3f } from 'typescript-usd/gf'
import {
  ClipsAPI, Stage, AttributeQuery as UsdAttributeQuery,
  ResolveInfoSource as UsdResolveInfoSource,
} from 'typescript-usd/usd'

const allFormats = ['usda', 'usdc']
const createLayer = (fileName: string) => Layer.createAnonymous(fileName)

describe('testUsdCreateProperties', () => {
  it('test_Basic', async () => {
    const prim = '/Foo'
    const prop = 'Something'
    const value = new Vec3f(1.0, 2.0, 3.0)

    for (const fmt of allFormats) {
      const layer = createLayer('foo.' + fmt)
      const stage = await Stage.open(layer)

      // This ensures incremental recomposition will pickup newly created prims
      expect(stage.getPrim(prim), 'Prim already exists at ' + prim).toBeUndefined()
      stage.overridePrim(prim)
      expect(stage.getPrim(prim), 'Failed to create prim at ' + prim).toBeTruthy()

      const p = stage.getPrim(prim)!
      expect(p.getAttr(prop)!.isValid()).toBe(false)
      p.createAttribute(prop, 'string')
      expect(p.getAttr(prop)!.isValid()).toBe(true)

      // Verify default parameters are set as expected
      expect(p.getAttr(prop)!.isCustom(), 'Expected custom to be True by default').toBe(true)
      expect(p.getAttr(prop)!.typeName).toBe('string')
      expect(p.getAttr(prop)!.primPath).toBe(p.path)
      expect(p.getAttr(prop)!.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.None)

      // Change the attribute from a string to a Point3f
      const attr = p.getAttr(prop)!
      attr.setTypeName('point3f')
      expect(p.getAttr(prop)!.typeName).toBe('point3f')
      expect(p.getAttr(prop)!.getRoleName()).toBe(SdfValueRoleNames.Point)

      // Set & get a value
      attr.set(value)
      expect(attr.getValue()).toEqual(value)
      expect(p.getAttr(prop)!.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Default)

      // Validate Naming API
      expect(attr.name).toBe(attr.getPath().split('.').pop())
    }
  })

  it('test_ImplicitSpecCreation', async () => {
    for (const fmt of allFormats) {
      // Setup layers, stage, prims, attributes and relationships.
      const weakLayer = createLayer('SpecCreationTest_weak.' + fmt)
      const strongLayer = createLayer('SpecCreationTest_strong.' + fmt)

      let stage = await Stage.open(weakLayer)
      const p = stage.overridePrim('/Parent/Nested/Child')
      stage.overridePrim('/Parent/Sibling1')
      stage.overridePrim('/Parent/Sibling2')
      p.createAttribute('attr1', 'string')
      p.createAttribute('attr2', 'string')
      p.createRelationship('rel1')
      p.createRelationship('rel2')

      // Validate Naming API
      const rel = p.createRelationship('rel1')
      const relProp = () => stage.getPrim(p.path)!.getProperty('rel1')
      expect(relProp().hasAuthoredMetadata('targetPaths')).toBe(false)
      expect(relProp().isCustom()).toBe(true)
      expect(rel.name).toBe(rel.getPath().split('.').pop())
      expect(rel.getTargets()).toEqual([])
      rel.addTarget('/Parent')
      expect(relProp().hasAuthoredMetadata('targetPaths')).toBe(true)
      expect(rel.getTargets()).toEqual(['/Parent'])

      relProp().setCustom(false)
      expect(relProp().isCustom()).toBe(false)

      stage = await Stage.open(strongLayer)
      let q = stage.overridePrim('/Parent')
      await q.getReferences().addReference(weakLayer.identifier, '/Parent')
      q = stage.getPrim('/Parent')!

      // make sure our reference worked
      const strongPrim = stage.getPrim('/Parent/Nested/Child')
      expect(strongPrim, 'Expected to find a prim at </Parent/Nested/Child>').toBeTruthy()

      // Now, we should be able to set /Parent/Nested/Child.attr in the weaker
      // layer.
      strongPrim!.getAttr('attr1')!.setTimeSample(1.0, 'anyStringValue')
      expect(strongPrim!.getAttr('attr1')!.getValueAtTime(1.0)).toBe('anyStringValue')
      expect(strongPrim!.getAttr('attr2')!.setMetadata('documentation', 'worked!')).toBe(true)
      strongPrim!.createRelationship('rel1').addTarget('/Foo/Bar')
      expect(strongPrim!.createRelationship('rel2').setMetadata('documentation', 'rel worked!'))
        .toBe(true)

      // Finally, attempt to create a new attribute & relationship on a spec in
      // the weaker layer, which would require a spec/over to be implicitly
      // created.
      let prim = stage.getPrim('/Parent/Sibling1')!
      expect(prim.createAttribute('attr3', 'string').isValid()).toBe(true)
      prim = stage.getPrim('/Parent/Sibling2')!
      prim.createRelationship('rel3')
      expect(stage.getPrim('/Parent/Sibling2')!.hasProperty('rel3')).toBe(true)
      expect(strongLayer.getPropertyAtPath('/Parent/Sibling1.attr3')).toBeTruthy()
      expect(strongLayer.getPropertyAtPath('/Parent/Sibling2.rel3')).toBeTruthy()
    }
  })

  it('test_IsDefined', async () => {
    for (const fmt of allFormats) {
      const weakLayer = createLayer('IsDefined_weak.' + fmt)
      const strongLayer = createLayer('IsDefined_strong.' + fmt)

      let stage = await Stage.open(weakLayer)
      let p = stage.overridePrim('/Parent')

      expect(p.getAttr('attr1')!.isValid()).toBe(false)
      // ensure that clearing a non-existant attribute works
      expect(p.getAttr('attr1')!.clear()).toBe(true)
      p.createAttribute('attr1', 'string')
      expect(p.hasAttribute('attr1')).toBe(true)
      expect(p.getAttr('attr1')!.isValid()).toBe(true)
      expect(p.hasProperty('attr1')).toBe(true)
      expect(p.getProperty('attr1').isValid()).toBe(true)
      expect(p.getProperty('attr1').getPath()).toBe(p.getAttr('attr1')!.getPath())

      stage = await Stage.open(strongLayer)
      p = stage.overridePrim('/Parent')
      await p.getReferences().addReference(weakLayer.identifier, '/Parent')
      p = stage.getPrim('/Parent')!
      expect(p.getAttr('attr1')!.isValid()).toBe(true)
      expect(p.getAttr('attr1')!.isAuthoredAt(weakLayer)).toBe(true)
      expect(p.getAttr('attr1')!.isAuthoredAt(strongLayer)).toBe(false)

      p.getAttr('attr1')!.set('foo')
      expect(p.getAttr('attr1')!.isValid()).toBe(true)
      expect(p.getAttr('attr1')!.isAuthoredAt(weakLayer)).toBe(true)
      expect(p.getAttr('attr1')!.isAuthoredAt(strongLayer)).toBe(true)
    }
  })

  it('test_HasValue', async () => {
    for (const fmt of allFormats) {
      const s = await Stage.open(Layer.createAnonymous('foo.' + fmt))
      const p = s.overridePrim('/SomePrim')
      p.createAttribute('myAttr', 'string')

      const attr = p.getAttr('myAttr')!
      expect(attr.hasValue()).toBe(false)
      expect(attr.hasAuthoredValue()).toBe(false)

      attr.set('val')
      expect(attr.hasValue()).toBe(true)
      expect(attr.hasAuthoredValue()).toBe(true)

      attr.clear()
      expect(attr.hasValue()).toBe(false)
      expect(attr.hasAuthoredValue()).toBe(false)

      attr.setTimeSample(1.0, 'val')
      expect(attr.hasValue()).toBe(true)
      expect(attr.hasAuthoredValue()).toBe(true)

      attr.clearAtTime(1.0)
      expect(attr.hasValue()).toBe(false)
      expect(attr.hasAuthoredValue()).toBe(false)

      attr.setTimeSample(1.0, 'val')
      expect(attr.hasValue()).toBe(true)
      expect(attr.hasAuthoredValue()).toBe(true)

      attr.clear()
      expect(attr.hasValue()).toBe(false)
      expect(attr.hasAuthoredValue()).toBe(false)

      // Clear() through an edit target on a sublayer.
      const sublayer = Layer.createAnonymous()
      s.definePrim('/test')
      s.getRootLayer().insertSubLayerPath(sublayer.identifier)
      await s.flushChanges()
      s.setEditTarget(sublayer)
      expect(s.getPrim('/test')!.getAttr('x')!.clear()).toBe(true)
    }
  })

  it('test_SetArraysWithLists', async () => {
    for (const fmt of allFormats) {
      const s = await Stage.open(Layer.createAnonymous('SetArraysWithListsTest.' + fmt))
      const prim = s.overridePrim('/test')
      const strs = prim.createAttribute('strs', 'string[]')
      const toks = prim.createAttribute('toks', 'token[]')
      const asst = prim.createAttribute('asst', 'asset[]')
      expect(strs.isValid()).toBe(true)
      expect(toks.isValid()).toBe(true)
      expect(asst.isValid()).toBe(true)
      // Set with a list.
      strs.set(Array(3).fill('hello'))
      expect([...(strs.getValue() as Iterable<string>)]).toEqual(['hello', 'hello', 'hello'])
      toks.set(Array(3).fill('bye'))
      expect([...(toks.getValue() as Iterable<string>)]).toEqual(['bye', 'bye', 'bye'])
      asst.set(Array(3).fill(new SdfAssetPath('/path')))
      // Only the authored data is compared, as upstream does.
      expect([...(asst.getValue() as Iterable<SdfAssetPath>)].map(p => p.getAuthoredPath()))
        .toEqual(['/path', '/path', '/path'])
    }
  })

  // Upstream raises for lists of an incompatible element type
  // (UsdStage::_SetValue's SdfValueTypeName::CanRepresent check,
  // stage.cpp:2048-2056).
  it('test_SetArraysWithLists: incompatible types raise', async () => {
    for (const fmt of allFormats) {
      const s = await Stage.open(Layer.createAnonymous('SetArraysWithListsTest.' + fmt))
      const prim = s.overridePrim('/test')
      const strs = prim.createAttribute('strs', 'string[]')
      const toks = prim.createAttribute('toks', 'token[]')
      const asst = prim.createAttribute('asst', 'asset[]')
      expect(() => strs.set(Array(3).fill(1234))).toThrow()
      expect(() => toks.set(Array(3).fill(1234))).toThrow()
      expect(() => asst.set(Array(3).fill(1234))).toThrow()
    }
  })

  // _NamespacesTestRun (testUsdCreateProperties.py:343-407).
  function namespacesTestRun(stage: Stage): void {
    // All of the tested functionality is provided by UsdProperty, so it is
    // sufficient to only test on UsdRelationship
    const rels = [['foo'], ['foo', 'bar'], ['foo', 'bar2', 'swizzle'], ['foo:bar:toffee'],
      ['foo:bar', 'chocolate'], ['foo', 'baz'], ['graphica'], ['ars', 'graphica']]

    const prim = stage.overridePrim('/test')
    for (const rel of rels) {
      prim.createRelationship(rel.join(':'))
      const stringName = 'from:string:' + rel.join(':')
      prim.createRelationship(stringName)
    }

    expect(prim.getProperties().length).toBe(2 * rels.length)
    expect(prim.getPropertiesInNamespace('').length).toBe(2 * rels.length)
    expect(prim.getPropertiesInNamespace([]).length).toBe(2 * rels.length)

    // Not 6, because property 'foo' is NOT in the namespace 'foo'
    expect(prim.getPropertiesInNamespace('foo').length).toBe(5)
    expect(prim.getPropertiesInNamespace('foo:').length).toBe(5)

    // Try passing in a predicate that does the same thing.
    const fooPred = (name: string) => name.startsWith('foo:')
    expect(prim.getProperties(fooPred).length).toBe(5)

    expect(prim.getPropertiesInNamespace(['foo']).length).toBe(5)
    // Make sure prefix match works, i.e. foo:bar2 is not in foo:bar namespace
    expect(prim.getPropertiesInNamespace('foo:bar').length).toBe(2)
    expect(prim.getPropertiesInNamespace(['foo', 'bar']).length).toBe(2)

    const fooBarPred = (name: string) => name.startsWith('foo:bar:')
    expect(prim.getProperties(fooBarPred).length).toBe(2)

    // And try a fail/empty case...
    expect(prim.getPropertiesInNamespace('graphica').length).toBe(0)

    // test that ordering of matches is dictionary, not authored, while also
    // exercising property name API
    const foobars = prim.getPropertiesInNamespace('foo:bar')
    const chocolate = foobars[0]!
    expect(chocolate.getBaseName()).toBe('chocolate')
    expect(chocolate.getNamespace()).toBe('foo:bar')
    expect(chocolate.splitName()).toEqual(['foo', 'bar', 'chocolate'])

    // Per bug/93381, make sure property foo only has basic metadata
    const myFoo = prim.getProperty('foo')
    expect(Object.keys(myFoo.getAllMetadata()).length).toBe(2)

    // and make sure "simple" names behave
    const graphica = prim.getProperty('graphica')
    expect(graphica.getBaseName()).toBe('graphica')
    expect(graphica.getNamespace()).toBe('')
    expect(graphica.splitName()).toEqual(['graphica'])
  }

  it('test_Namespaces', async () => {
    // Testing namespaces in memory...
    for (const fmt of allFormats) namespacesTestRun(await Stage.open(Layer.createAnonymous('tag.' + fmt)))
    // Testing namespaces in a new layer...
    for (const fmt of allFormats) {
      namespacesTestRun(await Stage.open(Layer.createAnonymous('namespaceTest.' + fmt)))
    }
  })

  it('test_ResolvedAssetPaths', async () => {
    // Testing that asset-path-valued attributes give resolved values
    for (const fmt of allFormats) {
      const dir = mkdtempSync(path.join(tmpdir(), 'testUsdCreateProperties-'))
      try {
        const rootName = path.join(dir, `root.${fmt}`)
        const targetName = path.join(dir, `target.${fmt}`)
        const empty = Layer.createAnonymous(`root.${fmt}`)
        writeFileSync(rootName, fmt === 'usdc' ? empty.toUsdc() : empty.exportToString())
        writeFileSync(targetName, '#usda 1.0\n')
        // Usd.Stage.CreateNew(rootFile.name): a stage on a root layer file
        // beside the target, so the relative path anchors to it.
        const s = (await Stage.open(rootName))!
        const foo = s.definePrim('/foo')
        const singleAsset = foo.createAttribute('singleAsset', 'asset')
        const arrayAsset = foo.createAttribute('arrayAsset', 'asset[]')

        let relPath = './' + path.basename(targetName)
        expect(relPath).not.toBe(targetName)

        singleAsset.set(new SdfAssetPath(relPath))
        arrayAsset.set(Array(42).fill(new SdfAssetPath(relPath)))
        // Asset resolution is asynchronous here: newly authored asset paths
        // are resolved when the stage's changes are flushed.
        await s.flushChanges()

        const singleAssetQuery = new UsdAttributeQuery(foo.getAttr('singleAsset')!)
        const arrayAssetQuery = new UsdAttributeQuery(foo.getAttr('arrayAsset')!)

        let singleAssetValue = singleAsset.getValue() as SdfAssetPath
        let arrayAssetValue = [...(arrayAsset.getValue() as Iterable<SdfAssetPath>)]
        const singleAssetQueryValue = singleAssetQuery.get() as SdfAssetPath
        const arrayAssetQueryValue = [...(arrayAssetQuery.get() as Iterable<SdfAssetPath>)]

        expect(singleAssetValue.getAssetPath()).toBe(relPath)
        expect(arrayAssetValue.every(ap => ap.getAssetPath() === relPath)).toBe(true)

        // Ensure that attribute query also resolves paths
        expect(singleAssetValue.getAssetPath()).toBe(singleAssetQueryValue.getAssetPath())
        expect(arrayAssetValue.map(ap => ap.getAssetPath())).toEqual(arrayAssetQueryValue.map(ap => ap.getAssetPath()))

        expect(singleAssetValue.getResolvedPath()).toBe(targetName)
        expect(arrayAssetValue.every(ap => ap.getResolvedPath() === targetName)).toBe(true)
        expect(singleAssetValue.getResolvedPath()).toBe(singleAssetQueryValue.getResolvedPath())
        expect(arrayAssetValue.map(ap => ap.getResolvedPath()))
          .toEqual(arrayAssetQueryValue.map(ap => ap.getResolvedPath()))

        // A file that does not exist does not resolve.
        relPath = './nonexistent_file_for_testUsdCreateProperties.xxx'
        singleAsset.set(new SdfAssetPath(relPath))
        arrayAsset.set(Array(42).fill(new SdfAssetPath(relPath)))
        await s.flushChanges()
        singleAssetValue = singleAsset.getValue() as SdfAssetPath
        arrayAssetValue = [...(arrayAsset.getValue() as Iterable<SdfAssetPath>)]
        expect(singleAssetValue.getAssetPath()).toBe(relPath)
        expect(arrayAssetValue.every(ap => ap.getAssetPath() === relPath)).toBe(true)
        expect(singleAssetValue.getResolvedPath()).toBe('')
        expect(arrayAssetValue.every(ap => ap.getResolvedPath() === '')).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('test_GetPropertyStack', async () => {
    const primPath = '/root'
    const propName = 'test'
    const propPath = `${primPath}.${propName}`

    // Test basic overs
    for (const fmt of allFormats) {
      const layerA = createLayer('layerA.' + fmt)
      const layerB = createLayer('layerB.' + fmt)
      const layerC = createLayer('layerC.' + fmt)

      let stage = await Stage.open(layerA)
      const prim = stage.definePrim(primPath)
      prim.createAttribute(propName, 'string')

      stage = await Stage.open(layerB)
      let over = stage.overridePrim(primPath)
      over.createAttribute(propName, 'string')
      await over.getReferences().setReferences([
        { assetPath: layerA.identifier, primPath, layerOffset: { offset: 10.0, scale: 1.0 } }])

      stage = await Stage.open(layerC)
      over = stage.overridePrim(primPath)
      over.createAttribute(propName, 'string')
      await over.getReferences().setReferences([
        { assetPath: layerB.identifier, primPath, layerOffset: { offset: 0.0, scale: 2.0 } }])
      const attr = stage.getPrim(primPath)!.getAttr(propName)!
      // The expected property specs, as (layer identifier, spec path).
      const expectedPropertyStack = [layerC, layerB, layerA].map(l => {
        expect(l.getPropertyAtPath(propPath)).toBeTruthy()
        return { layerIdentifier: l.identifier, specPath: propPath }
      })
      const expectedOffsets = [{ offset: 0, scale: 1 }, { offset: 0, scale: 2 }, { offset: 20, scale: 2 }]
      const specs = (stack: readonly { layerIdentifier: string, specPath: string }[]) =>
        stack.map(e => ({ layerIdentifier: e.layerIdentifier, specPath: e.specPath }))

      // Fetching property stacks with and without the default time code
      // yields the same result.
      expect(specs(attr.getPropertyStack())).toEqual(expectedPropertyStack)
      expect(specs(attr.getPropertyStackWithLayerOffsets())).toEqual(expectedPropertyStack)
      expect(attr.getPropertyStackWithLayerOffsets().map(e => ({ ...e.offset })))
        .toEqual(expectedOffsets)
      expect(specs(attr.getPropertyStack('default'))).toEqual(expectedPropertyStack)
      // A non-default time code gets the same set since clips are not in
      // play here.
      expect(specs(attr.getPropertyStack(101.0))).toEqual(expectedPropertyStack)
      expect(specs(attr.getPropertyStackWithLayerOffsets(101.0))).toEqual(expectedPropertyStack)
      expect(attr.getPropertyStackWithLayerOffsets(101.0).map(e => ({ ...e.offset })))
        .toEqual(expectedOffsets)
    }
  })

  it('test_GetPropertyStackWithClips', async () => {
    const clipPath = '/root/fx/test'
    const attrName = 'extent'
    const fullPath = clipPath + '.' + attrName

    for (const fmt of allFormats) {
      const clips = ['clipA', 'clipB', 'clipC'].map(n => Layer.createAnonymous(`${n}.${fmt}`))

      let clipTime = 102.0
      for (const c of clips) {
        const stage = await Stage.open(c)
        const prim = stage.definePrim(clipPath)
        const attr = prim.createAttribute('extent', 'double')
        attr.setTimeSample(clipTime, clipTime)
        stage.setMetadata('startTimeCode', clipTime)
        clipTime += 1.0
        stage.setMetadata('endTimeCode', clipTime)
      }

      // Generate our necessary topology layer
      const topologyLayer = Layer.createAnonymous('root.topology.' + fmt)
      let stage = await Stage.open(topologyLayer)
      let prim = stage.definePrim(clipPath)
      prim.createAttribute(attrName, 'double')

      // Generate our necessary clip metadata
      const root = Layer.createAnonymous('root.' + fmt)
      stage = await Stage.open(root)
      prim = stage.definePrim(clipPath)
      const clipPrim = new ClipsAPI(prim, stage)
      clipPrim.setClipAssetPaths(clips.map(c => c.identifier))
      clipPrim.setClipPrimPath(clipPath)
      // Upstream names the manifest by its file name beside root; the
      // anonymous topology layer is named by its identifier.
      clipPrim.setClipManifestAssetPath(topologyLayer.identifier)

      // Add a reference to our topology layer
      await stage.getPrim('/root')!.getReferences().addReference(topologyLayer.identifier, '/root')

      clipTime = 102.0
      let stageTime = 0.0
      for (let i = 0; i < clips.length; i++) {
        const currentClipActive = [...clipPrim.getClipActive()].map(v => [v.get(0), v.get(1)])
        currentClipActive.push([clipTime, stageTime])
        clipPrim.setClipActive(currentClipActive)
        const currentClipTimes = [...clipPrim.getClipTimes()].map(v => [v.get(0), v.get(1)])
        currentClipTimes.push([clipTime, clipTime])
        clipPrim.setClipTimes(currentClipTimes)
        clipTime += 1.0
        stageTime += 1.0
      }

      stage = await Stage.open(root)
      const attr = stage.getPrim(clipPath)!.getAttr(attrName)!

      // In the case of a default time code we don't want any of the value
      // clips to show up in our stack of properties
      const specs = (stack: readonly { layerIdentifier: string, specPath: string }[]) =>
        stack.map(e => ({ layerIdentifier: e.layerIdentifier, specPath: e.specPath }))
      const spec = (l: Layer) => {
        expect(l.getPropertyAtPath(fullPath)).toBeTruthy()
        return { layerIdentifier: l.identifier, specPath: fullPath }
      }
      expect(specs(attr.getPropertyStack('default'))).toEqual([spec(topologyLayer)])

      // ensure that clip 'c' is in the result when the time code being used
      // is exactly on 'c's endpoints
      clipTime = 102
      for (let i = 0; i < clips.length; i++) {
        expect(specs(attr.getPropertyStack(clipTime))).toEqual([spec(clips[i]!), spec(topologyLayer)])
        clipTime += 1
      }
    }
  })
})
