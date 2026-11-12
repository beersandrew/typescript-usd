// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdMedia/testenv/testUsdMediaAuthorshipAPI.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdMedia/testenv/testUsdMediaAuthorshipAPI.py
//
// Python's Tf.ErrorException for a TF_CODING_ERROR is a thrown TfError here;
// Python's None / Usd.Prim() arguments are `undefined`. Layer.subLayerPaths
// .append is insertSubLayerPath, and change-processing waits use
// `await stage.flushChanges()`. An Sdf.TokenListOp info value is authored in
// its value form, SdfListOp.toValue().
import { describe, expect, it } from 'vitest'
import { Layer, ListOp, AttributeSpec, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Error as TfError } from 'typescript-usd/tf'
import { Stage, type Prim } from 'typescript-usd/usd'
import { Mesh } from 'typescript-usd/usdGeom'
import { AuthorshipAPI } from 'typescript-usd/usdMedia'

// Reduces records to (primPath, instanceName) pairs for comparison.
function _RecordIds(records: AuthorshipAPI[]): Array<[string, string]> {
  return records.map((r) => [r.prim.path, r.getName()])
}

function names(records: AuthorshipAPI[]): string[] {
  return records.map((r) => r.getName())
}

describe('TestUsdMediaAuthorshipAPI', () => {
  it('test_ApplyAndName', () => {
    const stage = Stage.createNew()
    const prim = Mesh.define(stage, '/World/Bunny').prim

    // Not applied yet.
    expect(new AuthorshipAPI(prim, undefined, 'mymodel').isValid()).toBe(false)
    expect(prim.hasAPI(AuthorshipAPI.typeName, 'mymodel')).toBe(false)

    const api = AuthorshipAPI.apply(prim, 'mymodel')
    expect(api.isValid()).toBe(true)
    expect(api.getName()).toBe('mymodel')
    expect(prim.hasAPI(AuthorshipAPI.typeName, 'mymodel')).toBe(true)
    expect(prim.getAppliedSchemas()).toEqual(['AuthorshipAPI:mymodel'])
  })

  it('test_PropertyNamespacing', () => {
    // Property names are the interop contract.
    const stage = Stage.createNew()
    const prim = Mesh.define(stage, '/World/Bunny').prim
    const api = AuthorshipAPI.apply(prim, 'mymodel')

    api.createSoftwarePackageAttr('com.example.mymodel')
    expect(api.getSoftwarePackageAttr().name).toBe('authorship:mymodel:softwarePackage')

    const expected = new Set([
      'authorship:mymodel:softwarePackage',
      'authorship:mymodel:softwareVersion',
      'authorship:mymodel:digitalSourceType',
      'authorship:mymodel:creator',
      'authorship:mymodel:description',
      'authorship:mymodel:inputs',
      'authorship:mymodel:created',
      'authorship:mymodel:instanceID',
      'authorship:mymodel:usageTerms',
      'authorship:mymodel:copyrightOwner',
      'authorship:mymodel:contact',
    ])
    expect(new Set(AuthorshipAPI.getSchemaAttributeNames(false, 'mymodel'))).toEqual(expected)
  })

  it('test_RoundTripAllFields', () => {
    const stage = Stage.createNew()
    const prim = Mesh.define(stage, '/World/Bunny').prim
    const api = AuthorshipAPI.apply(prim, 'mymodel')

    api.createSoftwarePackageAttr('com.example.mymodel')
    api.createSoftwareVersionAttr('2.1')
    api.createDigitalSourceTypeAttr(
      'http://cv.iptc.org/newscodes/digitalsourcetype/' +
      'trainedAlgorithmicMedia')
    api.createCreatorAttr(['My Model', 'John Doe'])
    api.createDescriptionAttr('Generated, then decimated.')
    api.createInputsAttr(['prompt', 'A fluffy bunny',
      'image', './refs/bunny_front.png',
      'seed', '1234567'])
    api.createCreatedAttr('2025-02-16T12:03:17+01:00')
    api.createInstanceIDAttr('6530a534-ca8f-487c-8968-0fecd8e717a6')
    api.createUsageTermsAttr('CC-BY-SA-4.0')
    api.createCopyrightOwnerAttr(['Acme Studios LLC'])
    api.createContactAttr(['johndoe@sample.com'])

    const list = (v: unknown): unknown[] => Array.from(v as Iterable<unknown>)

    expect(api.getSoftwarePackageAttr().getValue()).toBe('com.example.mymodel')
    expect(api.getSoftwareVersionAttr().getValue()).toBe('2.1')
    expect(api.getDigitalSourceTypeAttr().getValue()).toBe(
      'http://cv.iptc.org/newscodes/digitalsourcetype/' +
      'trainedAlgorithmicMedia')
    expect(list(api.getCreatorAttr().getValue())).toEqual(['My Model', 'John Doe'])
    expect(api.getDescriptionAttr().getValue()).toBe('Generated, then decimated.')
    expect(list(api.getInputsAttr().getValue())).toEqual(['prompt', 'A fluffy bunny',
      'image', './refs/bunny_front.png',
      'seed', '1234567'])
    // Flattened (name, value) pairs.
    expect(api.getInputsAttr().getArraySizeConstraint()).toBe(-2)
    expect(api.getCreatedAttr().getValue()).toBe('2025-02-16T12:03:17+01:00')
    expect(api.getInstanceIDAttr().getValue()).toBe('6530a534-ca8f-487c-8968-0fecd8e717a6')
    expect(api.getUsageTermsAttr().getValue()).toBe('CC-BY-SA-4.0')
    expect(list(api.getCopyrightOwnerAttr().getValue())).toEqual(['Acme Studios LLC'])
    expect(list(api.getContactAttr().getValue())).toEqual(['johndoe@sample.com'])

    // No fallbacks, so an unauthored field is distinguishable from an
    // authored empty value.
    const other = AuthorshipAPI.apply(prim, 'blender')
    expect(other.getSoftwarePackageAttr().hasAuthoredValue()).toBe(false)
    expect(other.getSoftwarePackageAttr().getValue()).toBeUndefined()
    expect(other.getUsageTermsAttr().hasAuthoredValue()).toBe(false)
    expect(other.getCopyrightOwnerAttr().getValue()).toBeUndefined()
  })

  it('test_MultipleRecordsDoNotCollide', () => {
    const stage = Stage.createNew()
    const prim = Mesh.define(stage, '/World/Bunny').prim

    const ai = AuthorshipAPI.apply(prim, 'mymodel')
    ai.createSoftwarePackageAttr('com.example.mymodel')
    const human = AuthorshipAPI.apply(prim, 'blender')
    human.createSoftwarePackageAttr('org.blender')

    expect(ai.getSoftwarePackageAttr().getValue()).toBe('com.example.mymodel')
    expect(human.getSoftwarePackageAttr().getValue()).toBe('org.blender')
    expect(names(AuthorshipAPI.getAll(prim)).sort()).toEqual(['blender', 'mymodel'])
  })

  it('test_RecordsComposeFromSeparateLayers', async () => {
    const strong = Layer.createAnonymous('strong.usda')
    const weak = Layer.createAnonymous('weak.usda')

    const weakStage = await Stage.open(weak)
    const weakPrim = weakStage.definePrim('/Bunny', 'Mesh')
    AuthorshipAPI.apply(weakPrim, 'mymodel')
      .createSoftwarePackageAttr('com.example.mymodel')

    strong.insertSubLayerPath(weak.identifier)
    const stage = await Stage.open(strong)
    const prim = stage.getPrim('/Bunny')!
    AuthorshipAPI.apply(prim, 'blender')
      .createSoftwarePackageAttr('org.blender')

    expect(names(AuthorshipAPI.getAll(prim)).sort()).toEqual(['blender', 'mymodel'])
    expect(new AuthorshipAPI(prim, undefined, 'mymodel').getSoftwarePackageAttr().getValue())
      .toBe('com.example.mymodel')
  })

  it('test_GetAllOnStageSorted', () => {
    const stage = Stage.createNew()
    for (const [path, ns] of [['/B', ['zebra', 'apple']], ['/A', ['mid']]] as const) {
      const prim = stage.definePrim(path, 'Xform')
      for (const name of ns) {
        AuthorshipAPI.apply(prim, name)
      }
    }

    expect(_RecordIds(AuthorshipAPI.getAllOnStage(stage)))
      .toEqual([['/A', 'mid'], ['/B', 'apple'], ['/B', 'zebra']])
  })

  it('test_GetAllOnStageEmpty', () => {
    const stage = Stage.createNew()
    stage.definePrim('/NoRecords', 'Xform')
    expect(AuthorshipAPI.getAllOnStage(stage)).toEqual([])
    expect(AuthorshipAPI.getAllShadowed(stage)).toEqual([])
    expect(AuthorshipAPI.getAllDuplicates(stage)).toEqual([])
  })

  it('test_GetAllOnStageIncludesInactivePrims', async () => {
    // A record is worth reporting whether or not its prim is currently
    // composed into the scene.
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Hidden', 'Xform')
    AuthorshipAPI.apply(prim, 'worldgen')
    await prim.setActive(false)

    expect(_RecordIds(AuthorshipAPI.getAllOnStage(stage))).toEqual([['/Hidden', 'worldgen']])
  })

  it('test_DiagnosticsIgnoreNeverAppliedProperties', async () => {
    // A property authored without the schema ever having been applied
    // anywhere is not reported.
    const layer = Layer.createAnonymous('.usda')
    const spec = sdfCreatePrimInLayer(layer, '/Orphan')!
    spec.setSpecifier('def')
    const attr = AttributeSpec.new(spec, 'authorship:ghost:softwarePackage', 'string', 'uniform')!
    attr.setDefaultValue('com.example.ghost')

    const stage = await Stage.open(layer)
    const prim = stage.getPrim('/Orphan')!
    expect(prim.hasAPI(AuthorshipAPI.typeName, 'ghost')).toBe(false)
    expect(AuthorshipAPI.getAllOnStage(stage)).toEqual([])
    expect(AuthorshipAPI.getAllShadowed(stage)).toEqual([])
    expect(AuthorshipAPI.getAllDuplicates(stage)).toEqual([])
  })

  it('test_NamespacedInstanceName', () => {
    // Instance names may themselves be namespaced.
    const stage = Stage.createNew()
    const prim = Mesh.define(stage, '/World/Bunny').prim
    const api = AuthorshipAPI.apply(prim, 'studio:tool')
    api.createSoftwarePackageAttr('com.example.tool')

    expect(api.getName()).toBe('studio:tool')
    expect(prim.hasAPI(AuthorshipAPI.typeName, 'studio:tool')).toBe(true)
    expect(api.getSoftwarePackageAttr().name).toBe('authorship:studio:tool:softwarePackage')
    expect(names(AuthorshipAPI.getAllOnStage(stage))).toEqual(['studio:tool'])
  })

  it('test_GetShadowed', async () => {
    // An explicit apiSchemas list in a stronger layer can shadow an
    // application coming from a reference.
    const asset = Layer.createAnonymous('asset.usda')
    const assetStage = await Stage.open(asset)
    const rock = assetStage.definePrim('/RockLarge', 'Xform')
    AuthorshipAPI.apply(rock, 'rockmaker')
      .createSoftwarePackageAttr('com.example.rocktool')
    assetStage.setDefaultPrim(rock)

    const root = Layer.createAnonymous('scene.usda')
    const stage = await Stage.open(root)
    const referencing = stage.definePrim('/World/Rock_1', 'Xform')
    await referencing.getReferences().addReference(asset.identifier)
    expect(AuthorshipAPI.getShadowed(referencing)).toEqual([])

    root.getPrimAtPath('/World/Rock_1')!.setInfo(
      'apiSchemas', ListOp.createExplicit(['AuthorshipAPI:layout']).toValue())
    await stage.flushChanges()

    expect(referencing.getAppliedSchemas()).toEqual(['AuthorshipAPI:layout'])
    const shadowed = AuthorshipAPI.getShadowed(referencing)
    expect(_RecordIds(shadowed)).toEqual([['/World/Rock_1', 'rockmaker']])
    // The shadowed record's value is still readable.
    expect(shadowed[0]!.getSoftwarePackageAttr().getValue()).toBe('com.example.rocktool')

    expect(_RecordIds(AuthorshipAPI.getAllShadowed(stage))).toEqual([['/World/Rock_1', 'rockmaker']])
    expect(AuthorshipAPI.getAllDuplicates(stage)).toEqual([])
  })

  it('test_SingleApplicationIsNotDuplicate', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World/Bunny', 'Mesh')
    AuthorshipAPI.apply(prim, 'mymodel')
      .createSoftwarePackageAttr('com.example.mymodel')

    expect(AuthorshipAPI.getDuplicates(prim)).toEqual([])
    expect(AuthorshipAPI.getShadowed(prim)).toEqual([])
  })

  it('test_GetDuplicates', async () => {
    // The same instance applied in two layers is one composed record. It is
    // reported once.
    const weak = Layer.createAnonymous('weak.usda')
    const weakStage = await Stage.open(weak)
    const weakApi = AuthorshipAPI.apply(weakStage.definePrim('/Bunny', 'Mesh'), 'blender')
    weakApi.createSoftwarePackageAttr('org.blender')

    const strong = Layer.createAnonymous('strong.usda')
    strong.insertSubLayerPath(weak.identifier)
    const stage = await Stage.open(strong)
    const prim = stage.getPrim('/Bunny')!
    AuthorshipAPI.apply(prim, 'blender')
      .createSoftwarePackageAttr('com.example.other')

    expect(prim.getAppliedSchemas()).toEqual(['AuthorshipAPI:blender'])
    expect(prim.getAttr('authorship:blender:softwarePackage')!.getValue()).toBe('com.example.other')

    expect(_RecordIds(AuthorshipAPI.getDuplicates(prim))).toEqual([['/Bunny', 'blender']])
    expect(_RecordIds(AuthorshipAPI.getAllDuplicates(stage))).toEqual([['/Bunny', 'blender']])
    expect(AuthorshipAPI.getAllShadowed(stage)).toEqual([])
  })

  it('test_DiagnosticsScanListOpsThatAddItems', async () => {
    // An application counts however it was list-edited, except for ordered
    // items, which only reorder and don't indicate presence.
    function MakeListOp(field: string): ListOp<string> {
      const listOp = new ListOp<string>()
      const items = ['AuthorshipAPI:gen']
      if (field === 'explicitItems') listOp.setExplicitItems(items)
      else if (field === 'prependedItems') listOp.setPrependedItems(items)
      else if (field === 'appendedItems') listOp.setAppendedItems(items)
      else if (field === 'addedItems') listOp.setAddedItems(items)
      else if (field === 'orderedItems') listOp.setOrderedItems(items)
      return listOp
    }

    for (const [field, counted] of [['explicitItems', true],
      ['prependedItems', true],
      ['appendedItems', true],
      ['addedItems', true],
      ['orderedItems', false]] as const) {
      const weak = Layer.createAnonymous('weak.usda')
      const spec = sdfCreatePrimInLayer(weak, '/Prim')!
      spec.setSpecifier('def')
      spec.setInfo('apiSchemas', MakeListOp(field).toValue())

      const strong = Layer.createAnonymous('strong.usda')
      strong.insertSubLayerPath(weak.identifier)
      const stage = await Stage.open(strong)
      const prim = stage.getPrim('/Prim')!
      AuthorshipAPI.apply(prim, 'gen')

      const expected = counted ? [['/Prim', 'gen']] : []
      expect(_RecordIds(AuthorshipAPI.getDuplicates(prim)), `failed for ${field}`).toEqual(expected)
    }
  })

  it('test_RecordsInsidePrototypes', async () => {
    // Authorship inside a native instance is reported once against the
    // prototype rather than once per instance.
    const asset = Layer.createAnonymous('proto.usda')
    const assetStage = await Stage.open(asset)
    const group = assetStage.definePrim('/Group', 'Xform')
    const inner = assetStage.definePrim('/Group/Inner', 'Mesh')
    AuthorshipAPI.apply(inner, 'worldgen')
      .createSoftwarePackageAttr('com.example.worldgen')
    assetStage.setDefaultPrim(group)

    const root = Layer.createAnonymous('scene.usda')
    const stage = await Stage.open(root)
    for (const path of ['/World/A', '/World/B']) {
      const prim = stage.definePrim(path, 'Xform')
      await prim.getReferences().addReference(asset.identifier)
      prim.setInstanceable(true)
    }
    await stage.flushChanges()

    expect(stage.getPrototypes().length).toBe(1)

    const records = AuthorshipAPI.getAllOnStage(stage)
    // Reported once, against the prototype's child rather than either
    // instance.
    expect(names(records)).toEqual(['worldgen'])
    expect(records[0]!.prim.isInPrototype()).toBe(true)
    expect(records[0]!.getSoftwarePackageAttr().getValue()).toBe('com.example.worldgen')
  })

  it('test_ComputeAccumulatedRecords', () => {
    const stage = Stage.createNew()
    const group = stage.definePrim('/Set', 'Xform')
    AuthorshipAPI.apply(group, 'worldgen')
      .createSoftwarePackageAttr('com.example.worldgen')
    const hero = stage.definePrim('/Set/HeroProp', 'Mesh')
    AuthorshipAPI.apply(hero, 'jane')
      .createSoftwarePackageAttr('org.blender')
    const detail = stage.definePrim('/Set/HeroProp/Detail', 'Mesh')
    AuthorshipAPI.apply(detail, 'detail')

    // Ancestors first, so the list reads as how this prim came to be.
    expect(_RecordIds(AuthorshipAPI.computeAccumulatedRecords(hero)))
      .toEqual([['/Set', 'worldgen'], ['/Set/HeroProp', 'jane']])
    expect(_RecordIds(AuthorshipAPI.computeAccumulatedRecords(detail)))
      .toEqual([['/Set', 'worldgen'], ['/Set/HeroProp', 'jane'],
        ['/Set/HeroProp/Detail', 'detail']])
    // A record does not propagate upward.
    expect(_RecordIds(AuthorshipAPI.computeAccumulatedRecords(group)))
      .toEqual([['/Set', 'worldgen']])

    // A prim's own record is distinguishable from an inherited one.
    const records = AuthorshipAPI.computeAccumulatedRecords(hero)
    expect(records.map((r) => r.prim.path === hero.path)).toEqual([false, true])
  })

  it('test_ComputeAccumulatedRecordsNoRecords', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/A/B/C', 'Xform')
    expect(AuthorshipAPI.computeAccumulatedRecords(prim)).toEqual([])

    expect(() => AuthorshipAPI.computeAccumulatedRecords(undefined)).toThrow(TfError)
  })

  it('test_ComputeAccumulatedRecordsDoesNotFindShadowedAncestors', async () => {
    // ComputeAccumulatedRecords() only sees the composed view; GetShadowed()
    // finds the shadowed record instead.
    const asset = Layer.createAnonymous('asset.usda')
    const assetStage = await Stage.open(asset)
    const group = assetStage.definePrim('/Group', 'Xform')
    AuthorshipAPI.apply(group, 'hidden')
      .createSoftwarePackageAttr('com.example.hidden')
    assetStage.setDefaultPrim(group)

    const root = Layer.createAnonymous('scene.usda')
    const stage = await Stage.open(root)
    const referencing = stage.definePrim('/World', 'Xform')
    await referencing.getReferences().addReference(asset.identifier)
    const child = stage.definePrim('/World/Child', 'Mesh')
    AuthorshipAPI.apply(child, 'own')

    // Shadow the referenced application on the ancestor.
    root.getPrimAtPath('/World')!.setInfo('apiSchemas', ListOp.createExplicit<string>([]).toValue())
    await stage.flushChanges()

    expect(_RecordIds(AuthorshipAPI.computeAccumulatedRecords(stage.getPrim('/World/Child'))))
      .toEqual([['/World/Child', 'own']])
    expect(_RecordIds(AuthorshipAPI.getShadowed(stage.getPrim('/World'))))
      .toEqual([['/World', 'hidden']])
  })

  it('test_GetAllUnder', () => {
    const stage = Stage.createNew()
    const group = stage.definePrim('/Set', 'Xform')
    AuthorshipAPI.apply(group, 'worldgen')
    const hero = stage.definePrim('/Set/HeroProp', 'Mesh')
    AuthorshipAPI.apply(hero, 'jane')
    stage.definePrim('/Set/HeroProp/Detail', 'Mesh')
    AuthorshipAPI.apply(stage.getPrim('/Set/HeroProp/Detail')!, 'detail')
    const elsewhere = stage.definePrim('/Elsewhere', 'Xform')
    AuthorshipAPI.apply(elsewhere, 'other')

    // Includes the prim itself, and stops at the subtree.
    expect(_RecordIds(AuthorshipAPI.getAllUnder(group)))
      .toEqual([['/Set', 'worldgen'], ['/Set/HeroProp', 'jane'],
        ['/Set/HeroProp/Detail', 'detail']])
    expect(_RecordIds(AuthorshipAPI.getAllUnder(hero)))
      .toEqual([['/Set/HeroProp', 'jane'], ['/Set/HeroProp/Detail', 'detail']])
    expect(_RecordIds(AuthorshipAPI.getAllUnder(elsewhere)))
      .toEqual([['/Elsewhere', 'other']])

    expect(() => AuthorshipAPI.getAllUnder(undefined)).toThrow(TfError)
  })

  it('test_GetAllUnderDoesNotFindShadowedRecords', async () => {
    // GetAllUnder() only sees the composed view; GetAllShadowed() finds the
    // shadowed record instead.
    const asset = Layer.createAnonymous('asset.usda')
    const assetStage = await Stage.open(asset)
    const ghost = assetStage.definePrim('/Ghost', 'Xform')
    AuthorshipAPI.apply(ghost, 'ghost')
      .createSoftwarePackageAttr('com.example.ghost')
    assetStage.setDefaultPrim(ghost)

    const root = Layer.createAnonymous('scene.usda')
    const stage = await Stage.open(root)
    const child = stage.definePrim('/Root/Child', 'Xform')
    await child.getReferences().addReference(asset.identifier)
    root.getPrimAtPath('/Root/Child')!.setInfo('apiSchemas', ListOp.createExplicit<string>([]).toValue())
    await stage.flushChanges()

    const rootPrim = stage.getPrim('/Root')
    expect(AuthorshipAPI.getAllUnder(rootPrim)).toEqual([])
    expect(_RecordIds(AuthorshipAPI.getAllShadowed(stage))).toEqual([['/Root/Child', 'ghost']])
  })

  it('test_GetAllInLayerScopedToThatLayer', async () => {
    // A layer query reports what that layer authors, composing nothing.
    const weak = Layer.createAnonymous('weak.usda')
    const weakStage = await Stage.open(weak)
    AuthorshipAPI.apply(weakStage.definePrim('/A', 'Xform'), 'inweak')

    const root = Layer.createAnonymous('root.usda')
    root.insertSubLayerPath(weak.identifier)
    const stage = await Stage.open(root)
    AuthorshipAPI.apply(stage.definePrim('/B', 'Xform'), 'inroot')

    expect(AuthorshipAPI.getAllInLayer(root)).toEqual(['/B.authorship:inroot'])
    expect(AuthorshipAPI.getAllInLayer(weak)).toEqual(['/A.authorship:inweak'])

    // The composed stage sees both, which is the distinction being drawn.
    expect(names(AuthorshipAPI.getAllOnStage(stage)).sort()).toEqual(['inroot', 'inweak'])
  })

  it('test_GetAllInLayerFindsUnselectedVariants', async () => {
    // Specs inside an unselected variant are not part of any prim's prim
    // stack, so no stage can report them. A layer query can.
    const layer = Layer.createAnonymous('variants.usda')
    const stage = await Stage.open(layer)
    let prim: Prim = stage.definePrim('/Prim', 'Xform')
    const variantSet = await stage.getVariantSets('/Prim').addVariantSet('v')
    await variantSet.addVariant('on')
    await variantSet.addVariant('off')
    await variantSet.setVariantSelection('on')
    const ctx = variantSet.getVariantEditContext()
    prim = stage.getPrim('/Prim')!
    AuthorshipAPI.apply(prim, 'invariant')
      .createSoftwarePackageAttr('com.example.variant')
    ctx.close()
    await variantSet.setVariantSelection('off')

    expect(AuthorshipAPI.getAllOnStage(stage)).toEqual([])
    expect(AuthorshipAPI.getAllShadowed(stage)).toEqual([])
    expect(AuthorshipAPI.getAllInLayer(layer)).toEqual(['/Prim{v=on}.authorship:invariant'])
  })

  it('test_GetAllInLayerFindsNestedVariants', () => {
    // Records authored directly on a variant spec nested inside another
    // variant are found too.
    const layer = Layer.createAnonymous('nested.usda')
    const spec = sdfCreatePrimInLayer(layer, '/Prim{a=x}{b=y}')!
    const listOp = new ListOp<string>()
    listOp.setPrependedItems(['AuthorshipAPI:nested'])
    spec.setInfo('apiSchemas', listOp.toValue())

    expect(AuthorshipAPI.getAllInLayer(layer)).toEqual(['/Prim{a=x}{b=y}.authorship:nested'])
  })

  it('test_GetAllInLayerPathsRoundTrip', async () => {
    // Returned paths are in the form Get() and IsAuthorshipAPIPath() accept.
    const layer = Layer.createAnonymous('round.usda')
    const stage = await Stage.open(layer)
    AuthorshipAPI.apply(stage.definePrim('/Prim', 'Xform'), 'gen')
      .createSoftwarePackageAttr('com.example.gen')

    const paths = AuthorshipAPI.getAllInLayer(layer)
    expect(paths.length).toBe(1)
    expect(AuthorshipAPI.get(stage, paths[0]!).getSoftwarePackageAttr().getValue())
      .toBe('com.example.gen')
  })

  it('test_GetAllInLayerEmptyAndInvalid', async () => {
    const layer = Layer.createAnonymous('bare.usda')
    ;(await Stage.open(layer)).definePrim('/NoRecords', 'Xform')
    expect(AuthorshipAPI.getAllInLayer(layer)).toEqual([])

    expect(() => AuthorshipAPI.getAllInLayer(undefined)).toThrow(TfError)
  })

  it('test_InvalidInputs', () => {
    for (const method of [AuthorshipAPI.getAllOnStage,
      AuthorshipAPI.getAllShadowed,
      AuthorshipAPI.getAllDuplicates]) {
      expect(() => method(undefined)).toThrow(TfError)
    }
    for (const method of [AuthorshipAPI.getShadowed,
      AuthorshipAPI.getDuplicates]) {
      expect(() => method(undefined)).toThrow(TfError)
    }
  })
})
