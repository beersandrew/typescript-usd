// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/testenv/testPcpDynamicFileFormatPlugin.py
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { Layer, AssetPath as SdfAssetPath, FileFormat as SdfFileFormat } from 'typescript-usd/sdf'
import { _sdfRegisterFileFormat } from 'typescript-usd/sdf/_internal'
import { sdfChangeListFromLayerChanges, type SdfChangeRecord } from 'typescript-usd/sdf/changeList'
import {
  Cache as PcpCache, DynamicFileFormatContext as PcpDynamicFileFormatContext,
  Changes as PcpChanges,
  DynamicFileFormatInterface as PcpDynamicFileFormatInterface, Layer as PcpLayer, LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

type TestDynamicFormat = {
  read: NonNullable<SdfFileFormat['read']>
} & PcpDynamicFileFormatInterface
function registerFileFormat(extension: string, implementation: TestDynamicFormat): void {
  class TestFileFormat extends SdfFileFormat {
    readonly formatId = extension
    readonly extensions = [extension]
    read = implementation.read
  }
  const format = Object.assign(new TestFileFormat(), implementation)
  _sdfRegisterFileFormat(format)
}

type Scene = Record<string, Record<string, unknown>>
function fakeLayer(filePath: string, scene: Scene): PcpLayer {
  return {
    filePath,
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: path => path === '/' || scene[path] !== undefined,
    getSpecType: path => path === '/' ? 'pseudoRoot' : path.includes('.') ? 'attribute' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: path => Object.keys(scene[path] ?? {}),
    getField: (path, field) => scene[path]?.[field],
    resolveAsset: path => path,
  }
}

const REGISTERED_PROGRAMS = [
  'testPcpDynamicFileFormatPlugin',
  'testPcpDynamicFileFormatPlugin_AttributeInputs',
] as const

describe(`${REGISTERED_PROGRAMS.join(' / ')} — registered dynamic payload phases`, () => {
  it('composes arguments, reads the parameterized layer, and retains dependencies', async () => {
    const reads: Array<ReadonlyMap<string, string>> = []
    const format: TestDynamicFormat = {
      read: (_bytes, layer, args) => {
        reads.push(new Map(args))
        layer.definePrimSpec('/GeneratedRoot', 'Xform')
        if (Number(args.get('depth') ?? 0) > 0) {
          layer.definePrimSpec('/GeneratedRoot/generated', 'Xform')
        }
      },
      composeFieldsForFileFormatArguments: (
        _assetPath: string, context: PcpDynamicFileFormatContext, args: Map<string, string>,
      ) => {
        const depth = context.composeValue('TestPcp_depth')
        if (depth !== undefined) args.set('depth', String(depth))
        const num = context.composeAttributeDefaultValue('TestPcp_num')
        if (num !== undefined) args.set('num', String(num))
        return { generation: 7 }
      },
      canFieldChangeAffectFileFormatArguments: (field, oldValue, newValue, data) =>
        field === 'TestPcp_depth' && oldValue !== newValue &&
        (data as { generation: number }).generation === 7,
      canAttributeDefaultValueChangeAffectFileFormatArguments: (
        attribute, oldValue, newValue, data,
      ) => attribute === 'TestPcp_num' && oldValue !== newValue &&
        (data as { generation: number }).generation === 7,
    }
    registerFileFormat('testpcpdynamic_ts', format)

    const root = fakeLayer('/root', {
      '/Root': {
        TestPcp_depth: 2,
        payload: {
          assetPath: '/procedural.testpcpdynamic_ts', primPath: '/GeneratedRoot',
          layerOffset: { offset: 0, scale: 1 },
        },
      },
      '/Root.TestPcp_num': { default: 3 },
    })
    const opener: PcpLayerOpener = async identifier =>
      identifier === '/root' ? root : Layer.createInMemory(identifier, new Uint8Array())
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/Root'], [])

    const index = await cache.computePrimIndex('/Root')
    expect(reads).toHaveLength(1)
    expect([...reads[0]!]).toEqual([['depth', '2'], ['num', '3']])
    expect(index.computePrimChildNames()).toEqual(['generated'])
    expect(cache.isPayloadIncluded('/Root')).toBe(true)
    const dependency = cache.getDynamicFileFormatArgumentDependencyData('/Root')
    expect(dependency.isEmpty()).toBe(false)
    expect([...dependency.getRelevantFieldNames()])
      .toEqual(['TestPcp_depth'])
    expect([...dependency.getRelevantAttributeNames()])
      .toEqual(['TestPcp_num'])
    expect(cache.hasAnyDynamicFileFormatArgumentFieldDependencies()).toBe(true)
    expect(cache.hasAnyDynamicFileFormatArgumentAttributeDependencies()).toBe(true)
    expect(cache.isPossibleDynamicFileFormatArgumentField('TestPcp_depth')).toBe(true)
    expect(cache.isPossibleDynamicFileFormatArgumentField('TestPcp_num')).toBe(false)
    expect(cache.isPossibleDynamicFileFormatArgumentAttribute('TestPcp_num')).toBe(true)
    expect(cache.isPossibleDynamicFileFormatArgumentField('documentation')).toBe(false)
    expect(cache.getDynamicFileFormatArgumentDependencyData('/Root').isEmpty()).toBe(false)

    // PcpChanges::DidChange asks the dependency data whether each info or
    // attribute default change can affect the file format arguments
    // (changes.cpp:442-660).
    const significantFor = async (record: SdfChangeRecord): Promise<string[]> => {
      const changes = new PcpChanges()
      await changes.didChange(cache, [[root, sdfChangeListFromLayerChanges(root, [record])]])
      return [...changes.getCacheChanges().get(cache)?.didChangeSignificantly ?? []].map(String)
    }
    expect(await significantFor({
      kind: 'field', path: '/Root', fieldName: 'TestPcp_depth', oldValue: 2, newValue: 4,
    })).toEqual(['/Root'])
    expect(await significantFor({
      kind: 'field', path: '/Root', fieldName: 'documentation', oldValue: 'a', newValue: 'b',
    })).toEqual([])
    expect(await significantFor({
      kind: 'field', path: '/Root.TestPcp_num', fieldName: 'default', oldValue: 3, newValue: 5,
    })).toEqual(['/Root'])

    const changes = new PcpChanges()
    await changes.didChange(cache, [[root, sdfChangeListFromLayerChanges(root, [{
      kind: 'field', path: '/Root', fieldName: 'TestPcp_depth', oldValue: 2, newValue: 4,
    }])]])
    expect([...changes.getCacheChanges().get(cache)!.didChangeSignificantly].map(String))
      .toEqual(['/Root'])
    await changes.apply()
    expect(cache.findPrimIndex('/Root')).toBeUndefined()
    expect(cache.hasAnyDynamicFileFormatArgumentFieldDependencies()).toBe(false)
    expect(cache.hasAnyDynamicFileFormatArgumentAttributeDependencies()).toBe(false)
  })

  it('re-evaluates an ancestral dynamic payload for a namespace child', async () => {
    const composedAt: string[] = []
    const format: TestDynamicFormat = {
      read: (_bytes, layer, args) => {
        layer.definePrimSpec('/GeneratedRoot', 'Xform')
        if (args.get('kind') === 'child') {
          layer.definePrimSpec('/GeneratedRoot/Child', 'Xform')
        }
      },
      composeFieldsForFileFormatArguments: (_assetPath, context, args) => {
        const kind = context.composeValue('TestPcp_kind')
        composedAt.push(String(kind))
        if (kind !== undefined) args.set('kind', String(kind))
        return undefined
      },
    }
    registerFileFormat('testpcpancestral_ts', format)
    const root = fakeLayer('/ancestralRoot', {
      '/Parent': {
        TestPcp_kind: 'child', primChildren: ['Child'],
        payload: {
          assetPath: '/ancestral.testpcpancestral_ts', primPath: '/GeneratedRoot',
          layerOffset: { offset: 0, scale: 1 },
        },
      },
      '/Parent/Child': { typeName: 'Scope' },
    })
    const opener: PcpLayerOpener = async identifier =>
      identifier === '/ancestralRoot' ? root : Layer.createInMemory(identifier, new Uint8Array())
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/Parent'], [])
    const child = await cache.computePrimIndex('/Parent/Child')
    // The payload is composed while building /Parent. /Parent/Child is seeded
    // from the cached /Parent index, whose payload node already carries the
    // arguments; root nodes never evaluate ancestral dynamic payloads
    // (AddTasksForRootNode, primIndex.cpp:1380-1395). The composition may run
    // again when indexing retries after loading the generated layer.
    expect(composedAt.length).toBeGreaterThan(0)
    expect(new Set(composedAt)).toEqual(new Set(['child']))
    expect(child.composePrimStack().some(entry =>
      entry.layer.filePath.includes('kind=child') &&
      entry.path.pathString === '/GeneratedRoot/Child')).toBe(true)
    expect(cache.getDynamicFileFormatArgumentDependencyData('/Parent')
      .getRelevantFieldNames().has('TestPcp_kind')).toBe(true)
    expect(cache.getDynamicFileFormatArgumentDependencyData('/Parent/Child')
      .getRelevantFieldNames().has('TestPcp_kind')).toBe(false)
  })

  it('keeps dynamic dependencies and payload state isolated across overlapping builds', async () => {
    const format: TestDynamicFormat = {
      read: (_bytes, layer) => layer.definePrimSpec('/GeneratedRoot', 'Xform'),
      composeFieldsForFileFormatArguments: (assetPath, context, args) => {
        const field = assetPath.includes('/a.') ? 'argA' : 'argB'
        const value = context.composeValue(field)
        if (value !== undefined) args.set(field, String(value))
        return undefined
      },
    }
    registerFileFormat('testpcpconcurrent_ts', format)
    const payload = (assetPath: string) => ({
      assetPath, primPath: '/GeneratedRoot', layerOffset: { offset: 0, scale: 1 },
    })
    const root = fakeLayer('/concurrentRoot', {
      '/A': { argA: 1, payload: payload('/a.testpcpconcurrent_ts') },
      '/B': { argB: 2, payload: payload('/b.testpcpconcurrent_ts') },
    })
    const opener: PcpLayerOpener = async identifier => {
      await Promise.resolve()
      return identifier === '/concurrentRoot'
        ? root : Layer.createInMemory(identifier, new Uint8Array())
    }
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/A', '/B'], [])
    const [a, b] = await Promise.all([
      cache.computePrimIndex('/A'), cache.computePrimIndex('/B'),
    ])
    const aDependency = cache.getDynamicFileFormatArgumentDependencyData('/A')
    const bDependency = cache.getDynamicFileFormatArgumentDependencyData('/B')
    expect([...aDependency.getRelevantFieldNames()]).toEqual(['argA'])
    expect([...bDependency.getRelevantFieldNames()]).toEqual(['argB'])
    expect(aDependency).not.toBe(bDependency)
    expect(a.path).toBe('/A')
    expect(b.path).toBe('/B')
  })

  it('runs after variants and composes through the selected variant node', async () => {
    const reads: Array<ReadonlyMap<string, string>> = []
    const format: TestDynamicFormat = {
      read: (_bytes, layer, args) => {
        reads.push(new Map(args))
        layer.definePrimSpec('/GeneratedRoot', 'Xform')
      },
      composeFieldsForFileFormatArguments: (_assetPath, context, args) => {
        const shape = context.composeValue('TestPcp_shape')
        if (shape !== undefined) args.set('shape', String(shape))
        return undefined
      },
    }
    registerFileFormat('testpcpvariant_ts', format)
    const root = fakeLayer('/variantRoot', {
      '/Root': {
        variantSetChildren: ['shape'], variantSetNames: ['shape'],
        variantSelection: { shape: ['cone'] },
      },
      '/Root{shape=}': { variantChildren: ['cone'] },
      '/Root{shape=cone}': {
        TestPcp_shape: 'cone',
        payload: {
          assetPath: '/variant.testpcpvariant_ts', primPath: '/GeneratedRoot',
          layerOffset: { offset: 0, scale: 1 },
        },
      },
    })
    const opener: PcpLayerOpener = async identifier => identifier === '/variantRoot'
      ? root : Layer.createInMemory(identifier, new Uint8Array())
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/Root'], [])
    const index = await cache.computePrimIndex('/Root')
    expect(reads.map(args => args.get('shape'))).toEqual(['cone'])
    expect([...index.getNodeRange()].map(node => node.path.pathString)).toContain(
      '/Root{shape=cone}')
  })

  it('lets a weaker dynamic payload compose opinions from a stronger sibling payload', async () => {
    const reads: Array<[string | undefined, string | undefined]> = []
    const format: TestDynamicFormat = {
      read: (_bytes, layer, args) => {
        layer.definePrimSpec('/GeneratedRoot', 'Xform')
        if (args.get('payloadId') === 'strong') {
          layer.setField('/GeneratedRoot', 'TestPcp_siblingValue', 9)
        }
        reads.push([args.get('payloadId'), args.get('siblingValue')])
      },
      composeFieldsForFileFormatArguments: (_assetPath, context, args) => {
        const value = context.composeValue('TestPcp_siblingValue')
        if (value !== undefined) args.set('siblingValue', String(value))
        return undefined
      },
    }
    registerFileFormat('testpcpsibling_ts', format)
    const payload = (id: string) => ({
      assetPath: `/sibling.testpcpsibling_ts:SDF_FORMAT_ARGS:payloadId=${id}`,
      primPath: '/GeneratedRoot', layerOffset: { offset: 0, scale: 1 },
    })
    const root = fakeLayer('/siblingRoot', {
      '/Root': { payload: [payload('strong'), payload('weak')] },
    })
    const opener: PcpLayerOpener = async identifier => identifier === '/siblingRoot'
      ? root : Layer.createInMemory(identifier, new Uint8Array())
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/Root'], [])
    await cache.computePrimIndex('/Root')
    expect(reads).toEqual([['strong', undefined], ['weak', '9']])
  })

  it('composes argument opinions supplied through a specializes arc', async () => {
    const reads: Array<string | undefined> = []
    const format: TestDynamicFormat = {
      read: (_bytes, layer, args) => {
        layer.definePrimSpec('/GeneratedRoot', 'Xform')
        reads.push(args.get('depth'))
      },
      composeFieldsForFileFormatArguments: (_assetPath, context, args) => {
        const depth = context.composeValue('TestPcp_depth')
        if (depth !== undefined) args.set('depth', String(depth))
        return undefined
      },
    }
    registerFileFormat('testpcpspecializes_ts', format)
    const carrier = fakeLayer('/payloadCarrier', {
      '/Carrier': {
        payload: {
          assetPath: '/specializes.testpcpspecializes_ts', primPath: '/GeneratedRoot',
          layerOffset: { offset: 0, scale: 1 },
        },
      },
    })
    const root = fakeLayer('/specializesRoot', {
      '/_Params': { TestPcp_depth: 4 },
      '/Root': {
        specializes: ['/_Params'],
        references: [{
          assetPath: '/payloadCarrier', primPath: '/Carrier',
          layerOffset: { offset: 0, scale: 1 },
        }],
      },
    })
    const opener: PcpLayerOpener = async identifier => {
      if (identifier === '/specializesRoot') return root
      if (identifier === '/payloadCarrier') return carrier
      return Layer.createInMemory(identifier, new Uint8Array())
    }
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/Root'], [])
    await cache.computePrimIndex('/Root')
    expect(reads).toEqual(['4'])
  })

  it('resolves asset-path argument inputs at their contributing layer', async () => {
    const reads: Array<Record<string, string>> = []
    const format: TestDynamicFormat = {
      read: (_bytes, layer, args) => {
        layer.definePrimSpec('/GeneratedRoot', 'Xform')
        reads.push(Object.fromEntries(args))
      },
      composeFieldsForFileFormatArguments: (_assetPath, context, args) => {
        const asset = context.composeValue('TestPcp_assetPath')
        if (asset instanceof SdfAssetPath) {
          args.set('assetPath', asset.getAssetPath())
          args.set('resolvedAssetPath', asset.getResolvedPath())
        }
        const assets = context.composeValue('TestPcp_assetPathArray')
        if (Array.isArray(assets) && assets.every(value => value instanceof SdfAssetPath)) {
          args.set('assetPathArray', assets.map(value => value.getAssetPath()).join(','))
          args.set('resolvedAssetPathArray', assets.map(
            value => value.getResolvedPath()).join(','))
        }
        return undefined
      },
    }
    registerFileFormat('testpcpassetpath_ts', format)
    const base = fakeLayer('/assetDir/ref.usda', {
      '/': { expressionVariables: { NAME: 'localLayer' } },
      '/Root': {
        TestPcp_assetPath: new SdfAssetPath('`"./${NAME}.usda"`'),
        TestPcp_assetPathArray: [
          new SdfAssetPath('./localLayer.usda'), new SdfAssetPath('localLayer.usda'),
        ],
        payload: {
          assetPath: '/asset.testpcpassetpath_ts', primPath: '/GeneratedRoot',
          layerOffset: { offset: 0, scale: 1 },
        },
      },
    })
    const root: PcpLayer = {
      ...base,
      resolveAsset: path => `/assetDir/${path.replace(/^\.\//, '')}`,
    }
    const opener: PcpLayerOpener = async identifier => identifier === '/assetDir/ref.usda'
      ? root : Layer.createInMemory(identifier, new Uint8Array())
    const cache = await PcpCache.create(root, opener)
    cache.requestPayloads(['/Root'], [])
    await cache.computePrimIndex('/Root')
    expect(reads).toEqual([{
      assetPath: './localLayer.usda',
      resolvedAssetPath: '/assetDir/localLayer.usda',
      assetPathArray: './localLayer.usda,localLayer.usda',
      resolvedAssetPathArray: '/assetDir/localLayer.usda,/assetDir/localLayer.usda',
    }])
  })
})
