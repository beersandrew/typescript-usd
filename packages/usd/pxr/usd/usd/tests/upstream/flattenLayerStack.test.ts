// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdFlattenLayerStack.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdFlattenLayerStack.py
// (registered as testUsdFlattenLayerStack with testenv
// testUsdFlattenLayerStack). The testenv files are
// fixtures/testUsdFlattenLayerStack/, copied byte-for-byte from
// pxr/usd/usd/testenv/testUsdFlattenLayerStack/ (Pixar, OpenUSD license);
// the test runs with that directory as its working directory, as upstream.
//
// API mapping: stage._GetPcpCache().layerStack is
// stage._getPcpCache()!.getLayerStack(); Usd.FlattenLayerStack(ls,
// resolveAssetPathFn=, tag=) is FlattenLayerStack(ls, { resolveAssetPathFn,
// tag }); Usd.FlattenLayerStackAdvanced(ls, fn, tag=) is
// FlattenLayerStackAdvanced(ls, fn, { tag }); Sdf.ComputeAssetPathRelativeToLayer(
// layer, p) is layer.resolveAsset(p); stage.GetPseudoRoot() is
// stage.getPrim('/'). Asset values are the authored strings typescript-usd
// stores; list ops are compared via ListOp.fromValue.
//
// All tests of testUsdFlattenLayerStack.py are ported.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, Layer, ListOp } from 'typescript-usd/sdf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import {
  FlattenLayerStack, FlattenLayerStackAdvanced, FlattenLayerStackResolveAssetPathAdvanced, ResolveInfoSource, Stage,
} from 'typescript-usd/usd'

const dir = fileURLToPath(new URL('./fixtures/testUsdFlattenLayerStack/', import.meta.url))
const cwd = process.cwd()
beforeAll(() => {
  process.chdir(dir)
  // testUsdFlattenLayerStack.py:870-872
  expect(PlugRegistry.GetInstance().RegisterPlugins(
    JSON.parse(readFileSync(path.join(dir, 'plugInfo.json'), 'utf8')))).toHaveLength(1)
})
afterAll(() => { process.chdir(cwd) })

const open = async (file: string) => (await Stage.open(file))!
const layerStackOf = (stage: Stage) => stage._getPcpCache()!.getLayerStack()
const values = (v: unknown): unknown[] => v && typeof v === 'object' && 'get' in v && 'dimension' in v
  ? Array.from({ length: (v as { dimension: number }).dimension }, (_, i) => (v as { get(i: number): number }).get(i))
  : [...(v as Iterable<unknown>)]
// An SdfAssetPath (or array of them) as comparable fields: SdfAssetPath keeps
// its paths in private fields, which toEqual does not see.
const apFields = (v: unknown): unknown => v instanceof SdfAssetPath
  ? [v.getAuthoredPath(), v.getEvaluatedPath(), v.getResolvedPath()]
  : v && typeof v === 'object' && Symbol.iterator in v ? [...(v as Iterable<unknown>)].map(apFields) : v
// An SdfAssetPath value's asset path (Python AssetPath.path).
const assetPath = (v: unknown): string =>
  v && typeof v === 'object' && 'getAssetPath' in v ? (v as { getAssetPath(): string }).getAssetPath() : String(v ?? '')

describe('testUsdFlattenLayerStack', () => {
  // testUsdFlattenLayerStack.py:15-198
  it('test_Basic', async () => {
    const srcStage = await open('root.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'test.usda' })
    const resultStage = await Stage.open(layer)
    expect(layer.getDisplayName()).toContain('test.usda')

    for (const stage of [srcStage, resultStage]) {
      let p = stage.getPrim('/Sphere')!
      expect(p.hasAuthoredReferences()).toBe(true)
      expect(p.hasAuthoredInherits()).toBe(true)
      expect(p.hasAuthoredPayloads()).toBe(true)
      expect(p.hasVariantSets()).toBe(true)
      expect(stage.getPrim('/_class_Sphere')).toBeTruthy()

      let a = p.getAttr('defaultOverTimeSamples')!
      expect(a.getResolveInfo().getSource()).toBe(ResolveInfoSource.Default)
      a = p.getAttr('timeSamplesOverDefault')!
      expect(a.getResolveInfo().getSource()).toBe(ResolveInfoSource.TimeSamples)
      expect(a.getValue()).toBe(123)
      expect(a.getValueAtTime(1)).toBe(1)

      a = p.getAttr('timeSamplesAcrossLayerOffset')!
      expect(a.getTimeSampleKeys()).toEqual([-9.0, 0.0])

      p = stage.getPrim('/Sphere/RootReloChildFromReference')!
      expect(p.getAttr('timeSamplesAcrossRef')!.getTimeSampleKeys()).toEqual([-9.0, 0.0])

      p = stage.getPrim('/ListOpTest')!
      expect(p.rel('foo').getTargets()).toEqual(['/Pre_root', '/Pre_sub', '/App_sub', '/App_root'])

      for (const childPath of ['/Sphere/SubReloChildFromPayload', '/Sphere/RootReloChildFromReference',
        '/Sphere/RootReloChildFromNestedVariant']) {
        expect(stage.getPrim(childPath)).toBeTruthy()
      }

      p = stage.getPrim('/SphereUsingClip')!
      expect(p.getAttr('xformOp:translate')!.getResolveInfo(5).getSource()).toBe(ResolveInfoSource.ValueClips)

      p = stage.getPrim('/TimeTest')!
      expect(p.getMetadata('timeCodeTest')).toBe(0.0)
      expect(values(p.getMetadata('timeCodeArrayTest'))).toEqual([0.0, 10.0])
      expect(p.getMetadata('doubleTest')).toBe(10.0)
      expect(p.getMetadataByDictKey('customData', 'timeCode')).toBe(0.0)
      expect(values(p.getMetadataByDictKey('customData', 'timeCodeArray'))).toEqual([0.0, 10.0])
      expect(p.getMetadataByDictKey('customData', 'doubleVal')).toBe(10.0)
      expect(p.getMetadataByDictKey('customData', 'subDict:timeCode')).toBe(0.0)
      expect(values(p.getMetadataByDictKey('customData', 'subDict:timeCodeArray'))).toEqual([0.0, 10.0])
      expect(p.getMetadataByDictKey('customData', 'subDict:doubleVal')).toBe(10.0)

      a = p.getAttr('TimeCode')!
      expect(a.getValue()).toBe(0.0)
      expect(a.getTimeSampleKeys()).toEqual([-10.0, -9.0])
      expect(a.getValueAtTime(-10.0)).toBe(0.0)
      expect(a.getValueAtTime(-9)).toBe(10.0)

      a = p.getAttr('TimeCodeArray')!
      expect(values(a.getValue())).toEqual([0.0, 10.0])
      expect(a.getTimeSampleKeys()).toEqual([-10.0, -9.0])
      expect(values(a.getValueAtTime(-10.0))).toEqual([0.0, 20.0])
      expect(values(a.getValueAtTime(-9))).toEqual([10.0, 30.0])

      a = p.getAttr('Double')!
      expect(a.getValue()).toBe(10.0)
      expect(a.getTimeSampleKeys()).toEqual([-10.0, -9.0])
      expect(a.getValueAtTime(-10.0)).toBe(10.0)
      expect(a.getValueAtTime(-9)).toBe(20.0)

      // Durations are only scaled, not offset (scale 1.0 here); sample keys
      // still receive the full offset.
      expect(Number(p.getMetadata('durationTest'))).toBe(10.0)
      expect(values(p.getMetadata('durationArrayTest')).map(Number)).toEqual([10.0, 20.0])
      expect(Number(p.getMetadataByDictKey('customData', 'durationVal'))).toBe(10.0)
      expect(values(p.getMetadataByDictKey('customData', 'durationArray')).map(Number)).toEqual([10.0, 20.0])
      expect(Number(p.getMetadataByDictKey('customData', 'subDict:durationVal'))).toBe(10.0)
      expect(values(p.getMetadataByDictKey('customData', 'subDict:durationArray')).map(Number))
        .toEqual([10.0, 20.0])

      a = p.getAttr('Duration')!
      expect(Number(a.getValue())).toBe(10.0)
      expect(a.getTimeSampleKeys()).toEqual([-10.0, -9.0])
      expect(Number(a.getValueAtTime(-10.0))).toBe(10.0)
      expect(Number(a.getValueAtTime(-9))).toBe(20.0)

      a = p.getAttr('DurationArray')!
      expect(values(a.getValue()).map(Number)).toEqual([10.0, 20.0])
      expect(a.getTimeSampleKeys()).toEqual([-10.0, -9.0])
      expect(values(a.getValueAtTime(-10.0)).map(Number)).toEqual([10.0, 30.0])
      expect(values(a.getValueAtTime(-9)).map(Number)).toEqual([20.0, 40.0])

      p = stage.getPrim('/assetWithVariant')!
      expect(p.getVariantSets().getNames()).toEqual(['variantSet1', 'variantSet2'])
      expect(stage.getPrim('/assetWithVariant/a')).toBeFalsy()
      expect(stage.getPrim('/assetWithVariant/b')).toBeTruthy()
      expect(stage.getPrim('/assetWithVariant/c')).toBeFalsy()
      expect(stage.getPrim('/assetWithVariant/d')).toBeTruthy()
    }

    // Relative asset paths become absolute in the output.
    const p = resultStage.getPrim('/Sphere')!
    expect(path.isAbsolute(assetPath(p.getAttr('relativePath')!.getValue()))).toBe(true)
    for (const item of values(p.getAttr('relativePathVec')!.getValue())) {
      expect(path.isAbsolute(assetPath(item))).toBe(true)
    }

    // Sdf-level list-editing result.
    const targets = ListOp.fromValue<string>(layer.getField('/ListOpTest.foo', 'targetPaths'), String)
    expect(targets.getPrependedItems()).toEqual(['/Pre_root', '/Pre_sub'])
    expect(targets.getAppendedItems()).toEqual(['/App_sub', '/App_root'])
    expect(targets.getDeletedItems()).toEqual(['/Del_sub', '/Del_root'])

    // Offsets folded into value clips.
    const clips = layer.getPrimAtPath('/SphereUsingClip')!.getInfo('clips') as
      Record<string, Record<string, unknown>>
    expect(values(clips.default!.active).map(values)).toEqual([[-9.0, 0]])
    expect(values(clips.default!.times).map(values)).toEqual([[-9.0, 1], [0.0, 10]])

    expect(layer.getObjectAtPath('/Sphere{vset_1=default}{vset_2=default}ChildFromNestedVariant')).toBeTruthy()
  })

  // testUsdFlattenLayerStack.py:200-222
  it('test_EmptyAssetPaths', async () => {
    const srcStage = await open('emptyAssetPaths.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'emptyAssetPaths' })
    const resultStage = await Stage.open(layer)
    const prim = resultStage.getPrim('/Test')!
    expect(prim.hasAuthoredReferences()).toBe(true)
    const refs = ListOp.fromValue(layer.getPrimAtPath('/Test')!.getInfo('references'))
    expect(refs.isExplicit()).toBe(true)
    expect(refs.getExplicitItems()).toEqual([{ assetPath: '', primPath: '/Ref', layerOffset: { offset: 0, scale: 1 } }])
    expect(assetPath(prim.getAttr('a')!.getValue())).toBe('')
    expect(values(prim.getAttr('b')!.getValue()).map(assetPath)).toEqual(['', ''])
  })

  // testUsdFlattenLayerStack.py:224-243
  it('test_ResolveAssetPathFn', async () => {
    const srcStage = await open('emptyAssetPaths.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), {
      resolveAssetPathFn: () => 'foo', tag: 'resolveAssetPathFn',
    })
    const prim = (await Stage.open(layer)).getPrim('/Test')!
    expect(assetPath(prim.getAttr('a')!.getValue())).toBe('foo')
    expect(values(prim.getAttr('b')!.getValue()).map(assetPath)).toEqual(['foo', 'foo'])
  })

  // testUsdFlattenLayerStack.py:245-268
  it('test_ResolveAssetPathAdvancedFn', async () => {
    const srcStage = await open('emptyAssetPaths.usda')
    const layer = FlattenLayerStackAdvanced(layerStackOf(srcStage), context => {
      expect(context.sourceLayer).toBe(srcStage.getRootLayer())
      expect(context.assetPath).toBe('')
      expect(context.expressionVariables).toEqual({})
      return 'foo'
    }, { tag: 'resolveAssetPathFn' })
    const prim = (await Stage.open(layer)).getPrim('/Test')!
    expect(assetPath(prim.getAttr('a')!.getValue())).toBe('foo')
    expect(values(prim.getAttr('b')!.getValue()).map(assetPath)).toEqual(['foo', 'foo'])
  })

  // testUsdFlattenLayerStack.py:270-311
  it('test_ResolveAssetPathWithExpressions', async () => {
    const srcStage = await open('assetPathsAndExpressions.usda')
    const srcLayerStack = srcStage.getPrim('/')!.getPrimIndex().rootNode.getLayerStack()

    // FlattenLayerStack evaluates asset path expressions and anchors the
    // result to the layer where the opinion was authored.
    let layer = FlattenLayerStack(srcLayerStack)
    expect(assetPath(layer.getAttributeAtPath('/Test.a')!.getDefaultValue()))
      .toBe(srcStage.getRootLayer().resolveAsset('./assetPathsTest.usda'))

    // A resolveAssetPathFn sees the evaluated expression.
    layer = FlattenLayerStack(srcLayerStack, {
      resolveAssetPathFn: (sourceLayer, path) => {
        expect(sourceLayer).toBe(srcStage.getRootLayer())
        expect(path).toBe('./assetPathsTest.usda')
        return 'foo'
      },
    })
    expect(assetPath(layer.getAttributeAtPath('/Test.a')!.getDefaultValue())).toBe('foo')

    // FlattenLayerStackAdvanced passes the unevaluated expression and the
    // applicable expression variables.
    layer = FlattenLayerStackAdvanced(srcLayerStack, context => {
      expect(context.sourceLayer).toBe(srcStage.getRootLayer())
      expect(context.assetPath).toBe('`"./${NAME}.usda"`')
      expect(context.expressionVariables).toEqual({ NAME: 'assetPathsTest' })
      return 'foo'
    })
    expect(assetPath(layer.getAttributeAtPath('/Test.a')!.getDefaultValue())).toBe('foo')
  })

  // testUsdFlattenLayerStack.py:313-391
  it('test_ResolveAssetPathWithExpressionsAcrossReference', async () => {
    const rootLayer = Layer.createAnonymous('.usda')
    rootLayer.importFromString(`
        #usda 1.0
        (
            expressionVariables = {
                string NAME = "test_from_ref"
            }
        )

        def "TestRef" (
            references = @./assetPathsAndExpressions.usda@</Test>
        )
        {
        }
        `.trim())
    const srcStage = await Stage.open(rootLayer)

    // The referencing layer stack's NAME evaluates the referenced expression.
    const v = srcStage.getAttributeAtPath('/TestRef.a')!.getValue()
    expect(v).toBeInstanceOf(SdfAssetPath)
    expect((v as SdfAssetPath).getAuthoredPath()).toBe('`"./${NAME}.usda"`')
    expect((v as SdfAssetPath).getEvaluatedPath()).toBe('./test_from_ref.usda')
    expect((v as SdfAssetPath).getResolvedPath()).toBe('')

    // Flattening the referenced layer stack uses its own variables.
    const primIndex = srcStage.getPrim('/TestRef')!.getPrimIndex()
    const refLayerStack = primIndex.rootNode.children[0]!.getLayerStack()
    const refRootLayer = refLayerStack.layers[0]!.layer as Layer

    let layer = FlattenLayerStack(refLayerStack)
    expect(assetPath(layer.getAttributeAtPath('/Test.a')!.getDefaultValue()))
      .toBe(refRootLayer.resolveAsset('./assetPathsTest.usda'))

    layer = FlattenLayerStackAdvanced(refLayerStack, context => {
      expect(context.sourceLayer).toBe(refRootLayer)
      expect(context.assetPath).toBe('`"./${NAME}.usda"`')
      expect(context.expressionVariables).toEqual({ NAME: 'assetPathsTest' })
      return FlattenLayerStackResolveAssetPathAdvanced(context)
    })
    expect(assetPath(layer.getAttributeAtPath('/Test.a')!.getDefaultValue()))
      .toBe(refRootLayer.resolveAsset('./assetPathsTest.usda'))

    // The resolved path matches loading the layer stack's root layer.
    const stageFromFlattened = await Stage.open(layer)
    const stageFromLayerStack = await Stage.open(refLayerStack.identifier.rootLayer as Layer)
    expect((stageFromFlattened.getAttributeAtPath('/Test.a')!.getValue() as SdfAssetPath).getResolvedPath())
      .toBe((stageFromLayerStack.getAttributeAtPath('/Test.a')!.getValue() as SdfAssetPath).getResolvedPath())
  })

  // testUsdFlattenLayerStack.py:393-413
  it('test_TimeSamplesAndSplineWithStrongDefaults', async () => {
    const srcStage = await open('timeSamplesSplinesWithStrongDefault_strong.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'timeSamples' })
    const prim = (await Stage.open(layer)).getPrim('/Prim')!
    const a = prim.getAttr('a')!
    expect(a.getResolveInfo().getSource()).toBe(ResolveInfoSource.Default)
    expect(a.getValue()).toBe(5)
    expect(a.getValueAtTime(1)).toBe(5)
    const b = prim.getAttr('b')!
    expect(b.getResolveInfo().getSource()).toBe(ResolveInfoSource.Default)
    expect(b.getValue()).toBe(5.0)
    expect(b.getValueAtTime(1)).toBe(5.0)
  })

  // testUsdFlattenLayerStack.py:415-452
  it('test_TimeCodeDurationScaling', async () => {
    const srcStage = await open('scaledOffset_root.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'scaledOffset' })
    const resultStage = await Stage.open(layer)
    for (const stage of [srcStage, resultStage]) {
      const p = stage.getPrim('/ScaledTimeTest')!
      let a = p.getAttr('Double')!
      expect(a.getValue()).toBe(10.0)
      expect(a.getTimeSampleKeys()).toEqual([10.0, 12.0])
      expect(a.getValueAtTime(12)).toBe(20.0)
      a = p.getAttr('TimeCode')!
      expect(a.getValue()).toBe(30.0)
      expect(a.getTimeSampleKeys()).toEqual([10.0, 12.0])
      expect(a.getValueAtTime(10)).toBe(30.0)
      expect(a.getValueAtTime(12)).toBe(50.0)
      a = p.getAttr('Duration')!
      expect(Number(a.getValue())).toBe(20.0)
      expect(a.getTimeSampleKeys()).toEqual([10.0, 12.0])
      expect(Number(a.getValueAtTime(10))).toBe(20.0)
      expect(Number(a.getValueAtTime(12))).toBe(40.0)
    }
  })

  // testUsdFlattenLayerStack.py:454-476
  it('test_ValueBlocks', async () => {
    const srcStage = await open('valueBlocks_root.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'valueBlocks' })
    const prim = (await Stage.open(layer)).getPrim('/Human')!
    expect(values(prim.getAttr('a')!.getValue())).toEqual([1])
    expect(prim.getAttr('b')!.getValue()).toBeUndefined()
    expect(prim.getAttr('c')!.getValue()).toBeUndefined()
    expect(prim.getAttr('c')!.getValueAtTime(1)).toBeUndefined()
    expect(prim.getAttr('d')!.getValueAtTime(1)).toBe(789)
  })

  // testUsdFlattenLayerStack.py:479-524
  it('test_AnimationBlocks', async () => {
    const srcStage = await open('animationBlocks_root.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'animationBlocks' })
    const resultStage = await Stage.open(layer)
    for (const stage of [srcStage, resultStage]) {
      const prim = stage.getPrim('/Human')!
      const a = prim.getAttr('a')!
      expect(a.getResolveInfo().getSource()).toBe(ResolveInfoSource.TimeSamples)
      expect(a.getValue()).toBeUndefined()
      expect(a.getValueAtTime(1)).toBe(5.0)

      const b = prim.getAttr('b')!
      expect(b.getResolveInfo().getSource()).toBe(ResolveInfoSource.Spline)
      expect(b.getValue()).toBeUndefined()
      expect(b.getValueAtTime(1)).toBe(10.0)

      const c = prim.getAttr('c')!
      expect(c.getResolveInfo().getSource()).toBe(ResolveInfoSource.Default)
      expect(c.getValue()).toBe(1)
      expect(c.getValueAtTime(1)).toBe(1)

      const d = prim.getAttr('d')!
      expect(d.getResolveInfo().getSource()).toBe(ResolveInfoSource.Default)
      expect(d.getValue()).toBe(2.0)
      expect(d.getValueAtTime(1)).toBe(2.0)
    }
  })

  // testUsdFlattenLayerStack.py:526-536
  it('test_ValueTypeMismatch', async () => {
    const srcStage = await open('valueTypeMismatch_root.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage), { tag: 'valueBlocks' })
    const prim = (await Stage.open(layer)).getPrim('/p')!
    expect(values(prim.getAttr('x')!.getValue())).toEqual([0])
  })

  // testUsdFlattenLayerStack.py:538-549
  it('test_Tags', async () => {
    const srcStage = await open('root.usda')
    for (const [tag, extension] of [['', '.usda'], ['test.usda', '.usda'], ['test.usdc', '.usdc']] as const) {
      const layer = FlattenLayerStack(layerStackOf(srcStage), { tag })
      expect(layer.identifier.endsWith(extension)).toBe(true)
    }
  })

  // testUsdFlattenLayerStack.py:551-614
  it('test_FlattenLayerStackPathsWithMissungUriResolvers', async () => {
    const rootLayer = Layer.createAnonymous('.usda')
    rootLayer.importFromString(`
        #usda 1.0

        def "TestPrim"(
            assetInfo = {
                asset identifier = @test123://1.2.3.4/file3.txt@
                asset[] assetRefArr = [@test123://1.2.3.4/file6.txt@]
            }
        )
        {
            asset uriAssetRef = @test123://1.2.3.4/file1.txt@
            asset[] uriAssetRefArray = [@test123://1.2.3.4/file2.txt@]

            asset uriAssetRef.timeSamples = {
                0: @test123://1.2.3.4/file4.txt@,
                1: @test123://1.2.3.4/file5.txt@,
            }
                                   
            asset[] uriAssetRefArray.timeSamples = {
                0: [@test123://1.2.3.4/file6.txt@],
                1: [@test123://1.2.3.4/file7.txt@],               
            }
        }
        `.trim())
    const stage = await Stage.open(rootLayer)
    const flatStage = await Stage.open(stage.flatten())

    for (const propPath of ['/TestPrim.uriAssetRef', '/TestPrim.uriAssetRefArray']) {
      const stageProp = stage.getAttributeAtPath(propPath)!
      const flatStageProp = flatStage.getAttributeAtPath(propPath)!
      expect(stageProp.getValue()).toBeTruthy()
      expect(apFields(flatStageProp.getValue())).toEqual(apFields(stageProp.getValue()))
      expect(flatStageProp.getTimeSampleKeys()).toEqual(stageProp.getTimeSampleKeys())
      for (const time of stageProp.getTimeSampleKeys()) {
        expect(apFields(flatStageProp.getValueAtTime(time))).toEqual(apFields(stageProp.getValueAtTime(time)))
      }
    }

    const assetInfo = (s: Stage) => s.getPrim('/TestPrim')!.getMetadata('assetInfo') as Record<string, unknown>
    expect(apFields(assetInfo(flatStage).identifier)).toEqual(apFields(assetInfo(stage).identifier))
    expect(apFields(assetInfo(flatStage).assetRefArr)).toEqual(apFields(assetInfo(stage).assetRefArr))
  })

  // testUsdFlattenLayerStack.py:616-631
  it('test_ListOpAdd', async () => {
    const srcStage = await open('listOp_add.usda')
    const layer = FlattenLayerStack(layerStackOf(srcStage))
    expect(ListOp.fromValue(layer.getField('/B.test', 'targetPaths'), String).toValue())
      .toEqual(ListOp.create([], ['/A']).toValue())
    expect(ListOp.fromValue(layer.getField('/C.test', 'targetPaths'), String).toValue())
      .toEqual(ListOp.createExplicit(['/A']).toValue())
  })

  // testUsdFlattenLayerStack.py:633-679
  it('test_LayerOffsetsForReferencesAndPayloads', async () => {
    const stage = await open('mixedTimeCodesPerSecondListOps/base_prepend.usda')
    const layer = FlattenLayerStack(layerStackOf(stage))
    const resultStage = await Stage.open(layer)
    const asset = path.resolve('mixedTimeCodesPerSecondListOps/asset.usda')
    for (const [primPath, field] of [['/World/PayloadIn24', 'payload'], ['/World/ReferenceIn24', 'references']] as const) {
      const op = ListOp.fromValue<{ assetPath: string, layerOffset: unknown }>(layer.getPrimAtPath(primPath)!.getInfo(field))
      expect(op.getPrependedItems().map(item => [item.assetPath, item.layerOffset]))
        .toEqual([[asset, { offset: 0.0, scale: 2.5 }]])
      expect(resultStage.getPrim(`${primPath}/asset_child`)).toBeTruthy()
    }
  })
  // The (assetPath, layerOffset) pairs of a flattened reference or payload
  // list op's item list (Python's os.path.normcase pass is the identity on
  // the paths compared here).
  const refItems = (layer: Layer, primPath: string, field: 'payload' | 'references',
    list: 'prepended' | 'deleted') => {
    const op = ListOp.fromValue<{ assetPath: string, layerOffset?: unknown }>(layer.getPrimAtPath(primPath)!.getInfo(field))
    const items = list === 'prepended' ? op.getPrependedItems() : op.getDeletedItems()
    return { op, items: items.map(item => [item.assetPath, item.layerOffset ?? { offset: 0, scale: 1 }]) }
  }
  const expectOnly = <T,>(op: ListOp<T>, list: 'prepended' | 'deleted') => {
    expect(op.isExplicit()).toBe(false)
    if (list !== 'prepended') expect(op.getPrependedItems()).toEqual([])
    if (list !== 'deleted') expect(op.getDeletedItems()).toEqual([])
    expect(op.getAppendedItems()).toEqual([])
    expect(op.getExplicitItems()).toEqual([])
  }
  const checkListOps = async (file: string, cases: Array<{
    primPath: string, field: 'payload' | 'references', list: 'prepended' | 'deleted',
    offset: { offset: number, scale: number }, childExists?: boolean,
  }>) => {
    const stage = await open(file)
    const layer = FlattenLayerStack(layerStackOf(stage))
    expect(layer).toBeTruthy()
    const resultStage = await Stage.open(layer)
    const asset = path.resolve('mixedTimeCodesPerSecondListOps/asset.usda')
    for (const { primPath, field, list, offset, childExists } of cases) {
      expect(layer.getPrimAtPath(primPath)).toBeTruthy()
      const { op, items } = refItems(layer, primPath, field, list)
      expectOnly(op, list)
      expect(items).toEqual([[asset, offset]])
      if (childExists !== undefined) {
        expect(!!resultStage.getPrim(`${primPath}/asset_child`)).toBe(childExists)
      }
    }
  }
  const NO_OFFSET = { offset: 0, scale: 1 }

  // testUsdFlattenLayerStack.py:681-724
  it('test_DeleteListOpsWithVaryingTimecodesPerSecond', async () => {
    await checkListOps('mixedTimeCodesPerSecondListOps/base_delete.usda', [
      { primPath: '/World/PayloadIn24', field: 'payload', list: 'deleted', offset: NO_OFFSET, childExists: false },
      { primPath: '/World/ReferenceIn24', field: 'references', list: 'deleted', offset: NO_OFFSET, childExists: false },
    ])
  })

  // testUsdFlattenLayerStack.py:726-768
  it('test_DeleteListOpsWithMatchingTimecodesPerSecond', async () => {
    await checkListOps('mixedTimeCodesPerSecondListOps/base_delete_24.usda', [
      { primPath: '/World/PayloadIn24', field: 'payload', list: 'deleted', offset: NO_OFFSET, childExists: false },
      { primPath: '/World/ReferenceIn24', field: 'references', list: 'deleted', offset: NO_OFFSET, childExists: false },
    ])
  })

  // testUsdFlattenLayerStack.py:770-813
  it('test_ListOpsWithMultipliedScale', async () => {
    await checkListOps('mixedTimeCodesPerSecondListOps/base_x2.usda', [
      { primPath: '/World/PayloadIn24', field: 'payload', list: 'prepended',
        offset: { offset: 0.0, scale: 5.0 }, childExists: true },
      { primPath: '/World/ReferenceIn24', field: 'references', list: 'deleted',
        offset: { offset: 0.0, scale: 2.0 }, childExists: false },
    ])
  })

  // testUsdFlattenLayerStack.py:815-839
  it('test_ListOpsInSublayersWithScale', async () => {
    await checkListOps('mixedTimeCodesPerSecondListOps/base_sub_scaled.usda', [
      { primPath: '/World/PayloadIn24', field: 'payload', list: 'deleted', offset: { offset: 0.0, scale: 2.0 } },
    ])
  })

  // testUsdFlattenLayerStack.py:841-867
  it('test_ListOpsInSublayersWithOffsets', async () => {
    await checkListOps('mixedTimeCodesPerSecondListOps/base_multi_offset_sublayer.usda', [
      { primPath: '/World/PayloadIn24', field: 'payload', list: 'prepended', offset: { offset: 0.0, scale: 2.0 } },
    ])
  })
})
