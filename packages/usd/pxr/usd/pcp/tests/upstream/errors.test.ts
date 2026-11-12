// Ported from OpenUSD 26.11.1: pxr/usd/pcp/errors.h,
//  pxr/usd/pcp/layerStack.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpError surface — the typed composition errors of pcp/errors.h, recorded
// where upstream records them and surfaced as PcpPrimIndex.localErrors
// (PcpPrimIndexOutputs.allErrors → GetLocalErrors) and
// PcpLayerStack.localErrors (PcpLayerStack::GetLocalErrors). Cases mirror the
// upstream testenv compositions that exercise each error type (ErrorArcCycle,
// testPcpMuseum_ErrorOpinionAtRelocationSource, the
// _ValidateAndRemoveConflictingRelocates cases of layerStack.cpp:593).
// Errors are ADDITIVE: every case also asserts composition still degrades
// gracefully exactly as before the surface existed.
//
// The exact `message` strings asserted below were captured live from the
// reference build (Pcp.Cache.ComputePrimIndex / ComputeLayerStack error
// str()s on equivalent .usda fixtures), not hand-derived — the only delta is
// the layer identifier text, which here is the fake layers' filePath.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as Pcp from '../../src/index.ts'
import {
  Cache as PcpCache,
  ErrorType as PcpErrorType,
  RelocateConflictReason as PcpRelocateConflictReason,
  Error as PcpError,
  ErrorArcCycle as PcpErrorArcCycle,
  ErrorInvalidConflictingRelocation as PcpErrorInvalidConflictingRelocation,
  ErrorInvalidSameTargetRelocations as PcpErrorInvalidSameTargetRelocations,
  ErrorOpinionAtRelocationSource as PcpErrorOpinionAtRelocationSource,
  ErrorSublayerCycle as PcpErrorSublayerCycle,
  ErrorInvalidSublayerAndOffsetCount as PcpErrorInvalidSublayerAndOffsetCount,
  ErrorUnresolvedPrimPath as PcpErrorUnresolvedPrimPath,
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  computePcpLayerStack,
} from '../../src/index.ts'

// A fake layer over an explicit scene (specPath -> fields). resolveAsset is
// identity (test asset paths are the layer file paths).
type Scene = Record<string, Record<string, unknown>>
function fakeLayer(filePath: string, scene: Scene): PcpLayer {
  return {
    filePath,
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: path => path === '/' || scene[path] !== undefined,
    getSpecType: path => path === '/' ? 'pseudoRoot' : path.includes('.') ? 'attribute' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: path => Object.keys(scene[path] ?? {}),
    getField: (specPath, fieldName) => scene[specPath]?.[fieldName],
    resolveAsset: (assetPath) => assetPath,
  }
}
function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map((l) => [l.filePath, l]))
  return async (filePath) => byPath.get(filePath) ?? null
}
const ref = (assetPath: string, primPath: string) =>
  [{ assetPath, primPath, layerOffset: { offset: 0, scale: 1 } }]

const ofType = <T extends PcpError>(errors: readonly PcpError[], t: PcpErrorType): T[] =>
  errors.filter((e) => e.errorType === t) as T[]

describe('Pcp error class surface', () => {
  it('exports the individually inventoried OpenUSD v26.11.1 PcpErrorType enumerators', () => {
    const names = [
      'ArcCycle', 'ArcPermissionDenied', 'ArcToProhibitedChild',
      'IndexCapacityExceeded', 'ArcCapacityExceeded',
      'ArcNamespaceDepthCapacityExceeded', 'InconsistentPropertyType',
      'InconsistentAttributeType', 'InconsistentAttributeVariability',
      'InternalAssetPath', 'InvalidPrimPath', 'InvalidAssetPath',
      'InvalidInstanceTargetPath', 'InvalidExternalTargetPath',
      'InvalidTargetPath', 'InvalidReferenceOffset', 'InvalidSublayerOffset',
      'InvalidSublayerOwnership', 'InvalidSublayerPath',
      'InvalidVariantSelection', 'MutedAssetPath', 'InvalidAuthoredRelocation',
      'InvalidConflictingRelocation', 'InvalidSameTargetRelocations',
      'OpinionAtRelocationSource', 'PrimPermissionDenied',
      'PropertyPermissionDenied', 'SublayerCycle', 'TargetPermissionDenied',
      'UnresolvedPrimPath', 'VariableExpressionError',
      'InvalidSublayerAndOffsetCount',
    ] as const
    // errors.h:28-61: 32 enumerators, in this order.
    names.forEach((name, index) => {
      expect(Pcp[`PcpErrorType_${name}`]).toBe(PcpErrorType[name])
      expect(PcpErrorType[name], name).toBe(index)
    })
    expect(Object.values(PcpErrorType).filter(v => typeof v === 'number')).toHaveLength(32)
  })

  it('exports the OpenUSD v26.08 wrapErrors bare-name runtime hierarchy', () => {
    const names = [
      'ErrorBase', 'ErrorTargetPathBase', 'ErrorRelocationBase',
      'ErrorArcCycle', 'ErrorArcPermissionDenied', 'ErrorArcToProhibitedChild',
      'ErrorCapacityExceeded', 'ErrorInconsistentPropertyType',
      'ErrorInconsistentAttributeType', 'ErrorInconsistentAttributeVariability',
      'ErrorInvalidPrimPath', 'ErrorInvalidAssetPathBase',
      'ErrorInvalidAssetPath', 'ErrorMutedAssetPath',
      'ErrorInvalidInstanceTargetPath', 'ErrorInvalidExternalTargetPath',
      'ErrorInvalidTargetPath', 'ErrorInvalidSublayerOffset',
      'ErrorInvalidReferenceOffset', 'ErrorInvalidSublayerOwnership',
      'ErrorInvalidSublayerPath', 'ErrorInvalidAuthoredRelocation',
      'ErrorInvalidConflictingRelocation', 'ErrorInvalidSameTargetRelocations',
      'ErrorOpinionAtRelocationSource', 'ErrorPrimPermissionDenied',
      'ErrorPropertyPermissionDenied', 'ErrorSublayerCycle',
      'ErrorTargetPermissionDenied', 'ErrorUnresolvedPrimPath',
      'ErrorVariableExpressionError', 'ErrorInvalidSublayerAndOffsetCount',
    ] as const
    for (const name of names) expect(typeof Pcp[name], name).toBe('function')
    expect('ErrorInvalidTargetPathPtr' in Pcp).toBe(false)
    expect(Object.getPrototypeOf(Pcp.ErrorInvalidTargetPath.prototype))
      .toBe(Pcp.ErrorTargetPathBase.prototype)
    expect(Object.getPrototypeOf(Pcp.ErrorInvalidAuthoredRelocation.prototype))
      .toBe(Pcp.ErrorRelocationBase.prototype)
    expect(Object.getPrototypeOf(Pcp.ErrorInvalidAssetPath.prototype))
      .toBe(Pcp.ErrorInvalidAssetPathBase.prototype)
    expect(Object.getPrototypeOf(Pcp.ErrorInconsistentPropertyType.prototype))
      .toBe(Pcp.ErrorBase.prototype)
  })
})

describe('PcpPrimIndex.localErrors', () => {
  it('a clean composition reports no errors', async () => {
    const model = fakeLayer('/model', { '/Model': { doc: 'm' } })
    const root = fakeLayer('/root', { '/Char': { references: ref('/model', '/Model') } })
    const cache = await PcpCache.create(root, openerOver([root, model]))
    const idx = await cache.computePrimIndex('/Char')
    expect(idx.localErrors).toEqual([])
  })

  it('a reference cycle records PcpErrorArcCycle and composes finitely (ErrorArcCycle)', async () => {
    // /Top -> a</A> -> b</B> -> a</A>: the third arc closes the cycle.
    const a = fakeLayer('/a', { '/A': { references: ref('/b', '/B'), doc: 'a' } })
    const b = fakeLayer('/b', { '/B': { references: ref('/a', '/A'), doc: 'b' } })
    const root = fakeLayer('/root', { '/Top': { references: ref('/a', '/A') } })
    const cache = await PcpCache.create(root, openerOver([root, a, b]))
    const idx = await cache.computePrimIndex('/Top')

    const cycles = ofType<PcpErrorArcCycle>(idx.localErrors, PcpErrorType.ArcCycle)
    expect(cycles.length).toBe(1)
    expect(cycles[0]).toBeInstanceOf(Pcp.ErrorArcCycle)
    expect(cycles[0]).toBeInstanceOf(Pcp.ErrorBase)
    // Segments run root → leaf, the rejected target LAST (_CheckForCycle,
    // primIndex.cpp:1678: reversed parent chain + "there is no node for the
    // last site in the chain"); rootSite is the front of the chain.
    const cycle = cycles[0]!.cycle
    expect(cycle.map((s) => s.site.path)).toEqual(['/Top', '/A', '/B', '/A'])
    expect(cycles[0]!.rootSite.path).toBe('/Top')
    // The ToString rendering (errors.cpp:82).
    expect(cycles[0]!.message).toBe(
      'Cycle detected:\n' +
      '@/root@</Top>\n' +
      'references:\n' +
      '@/a@</A>\n' +
      'which references:\n' +
      '@/b@</B>\n' +
      'which CANNOT reference:\n' +
      '@/a@</A>\n')
    // One traversal of the cycle still contributes: /Top, /A, /B each once.
    expect(idx.composePrimStack().map((e) => e.layer.filePath)).toEqual(['/root', '/a', '/b'])
  })

  it('a reference to a nonexistent prim records PcpErrorUnresolvedPrimPath', async () => {
    const asset = fakeLayer('/asset', { '/M': { doc: 'm' } })
    const root = fakeLayer('/root', {
      '/Char': { references: ref('/asset', '/DoesNotExist'), doc: 'local' },
    })
    const cache = await PcpCache.create(root, openerOver([root, asset]))
    const idx = await cache.computePrimIndex('/Char')

    const errs = ofType<PcpErrorUnresolvedPrimPath>(idx.localErrors, PcpErrorType.UnresolvedPrimPath)
    expect(errs.length).toBe(1)
    expect(errs[0]!.unresolvedPath).toBe('/DoesNotExist')
    expect(errs[0]!.targetLayer.filePath).toBe('/asset')
    expect(errs[0]!.site.path).toBe('/Char')
    // The layer that authored the reference (PcpArcInfo.sourceLayer).
    expect(errs[0]!.sourceLayer?.filePath).toBe('/root')
    // The ToString rendering (errors.cpp:1053).
    expect(errs[0]!.message).toBe(
      'Unresolved reference prim path @/asset@</DoesNotExist> introduced by @/root@</Char>')
    // Composition degrades gracefully: the local opinion still composes.
    expect(idx.composePrimStack().map((e) => e.layer.filePath)).toEqual(['/root'])
  })

  it('a payload to a nonexistent prim records the same error with the payload arc', async () => {
    const asset = fakeLayer('/asset', { '/M': { doc: 'm' } })
    const root = fakeLayer('/root', { '/Char': { payload: ref('/asset', '/Nope') } })
    const cache = await PcpCache.create(root, openerOver([root, asset]))
    // Payloads compose only when requested (PcpCache::RequestPayloads) —
    // an unrequested payload arc is never traversed, so no error either.
    cache.requestPayloads(['/Char'], [])
    const idx = await cache.computePrimIndex('/Char')
    const errs = ofType<PcpErrorUnresolvedPrimPath>(idx.localErrors, PcpErrorType.UnresolvedPrimPath)
    expect(errs.length).toBe(1)
    expect(errs[0]!.unresolvedPath).toBe('/Nope')
  })

  it('a resolvable reference target reports nothing even via sublayers', async () => {
    // The target prim's spec lives in a SUBLAYER of the referenced layer — the
    // has-specs scan must consult the whole target layer stack.
    const sub = fakeLayer('/sub', { '/M': { doc: 'in sublayer' } })
    const asset = fakeLayer('/asset', { '/': { subLayers: ['/sub'] } })
    const root = fakeLayer('/root', { '/Char': { references: ref('/asset', '/M') } })
    const cache = await PcpCache.create(root, openerOver([root, asset, sub]))
    const idx = await cache.computePrimIndex('/Char')
    expect(idx.localErrors).toEqual([])
  })

  it('opinions at a relocation source record PcpErrorOpinionAtRelocationSource', async () => {
    // testPcpMuseum_ErrorOpinionAtRelocationSource in miniature: the root
    // layer stack relocates Rig/Tail to Anim/Tail AND authors an (illegal)
    // opinion at the old source path.
    const root = fakeLayer('/root', {
      '/': { layerRelocates: { '/CharRig/Rig/Tail': '/CharRig/Anim/Tail' } },
      '/CharRig': { doc: 'rig' },
      '/CharRig/Rig': { doc: 'rig scope' },
      '/CharRig/Rig/Tail': { doc: 'ILLEGAL opinion at relocation source' },
    })
    const cache = await PcpCache.create(root, openerOver([root]))
    const idx = await cache.computePrimIndex('/CharRig/Anim/Tail')
    const errs = ofType<PcpErrorOpinionAtRelocationSource>(
      idx.localErrors, PcpErrorType.OpinionAtRelocationSource)
    expect(errs.length).toBe(1)
    expect(errs[0]!.path).toBe('/CharRig/Rig/Tail')
    expect(errs[0]!.layer.filePath).toBe('/root')
    // The ToString rendering (errors.cpp:900).
    expect(errs[0]!.message).toBe(
      'The layer @/root@ has an invalid opinion at the relocation source ' +
      'path </CharRig/Rig/Tail>, which will be ignored.')
  })

  it('errors from the namespace ancestor stay on the ancestor index', async () => {
    // /Char/Deep is seeded from the cached /Char index, so /Char's broken
    // reference is a local error of /Char only (verified against OpenUSD
    // v26.08: Deep.localErrors is empty).
    const asset = fakeLayer('/asset', { '/M': { doc: 'm' } })
    const root = fakeLayer('/root', {
      '/Char': { references: ref('/asset', '/DoesNotExist') },
      '/Char/Deep': { doc: 'child' },
    })
    const cache = await PcpCache.create(root, openerOver([root, asset]))
    const idx = await cache.computePrimIndex('/Char/Deep')
    expect(ofType<PcpErrorUnresolvedPrimPath>(
      idx.localErrors, PcpErrorType.UnresolvedPrimPath).length).toBe(0)
    const errs = ofType<PcpErrorUnresolvedPrimPath>(
      cache.findPrimIndex('/Char')!.localErrors, PcpErrorType.UnresolvedPrimPath)
    expect(errs.length).toBe(1)
    expect(errs[0]!.unresolvedPath).toBe('/DoesNotExist')
  })

  it('overlapping computations retain errors in their requesting outputs', async () => {
    // PcpPrimIndexOutputs is per PcpCache::ComputePrimIndex invocation
    // (primIndex.h:305-333). Force two different builds to suspend inside
    // layer opening, then complete them in the opposite nesting order. A
    // mutable indexer-wide sink cross-attributes the first diagnostic and
    // drops the second under this schedule.
    const assetA = fakeLayer('/assetA', { '/Existing': { doc: 'a' } })
    const assetB = fakeLayer('/assetB', { '/Existing': { doc: 'b' } })
    const root = fakeLayer('/root', {
      '/A': { references: ref('/assetA', '/MissingA') },
      '/B': { references: ref('/assetB', '/MissingB') },
    })

    let enterA!: () => void
    let enterB!: () => void
    let releaseA!: () => void
    let releaseB!: () => void
    const enteredA = new Promise<void>(resolve => { enterA = resolve })
    const enteredB = new Promise<void>(resolve => { enterB = resolve })
    const gateA = new Promise<void>(resolve => { releaseA = resolve })
    const gateB = new Promise<void>(resolve => { releaseB = resolve })
    const opener: PcpLayerOpener = async filePath => {
      if (filePath === '/assetA') { enterA(); await gateA; return assetA }
      if (filePath === '/assetB') { enterB(); await gateB; return assetB }
      return filePath === '/root' ? root : null
    }
    const cache = await PcpCache.create(root, opener)

    const pendingA = cache.computePrimIndex('/A')
    await enteredA
    const pendingB = cache.computePrimIndex('/B')
    await enteredB
    releaseA()
    const indexA = await pendingA
    releaseB()
    const indexB = await pendingB

    expect(ofType<PcpErrorUnresolvedPrimPath>(
      indexA.localErrors, PcpErrorType.UnresolvedPrimPath,
    ).map(error => error.unresolvedPath)).toEqual(['/MissingA'])
    expect(ofType<PcpErrorUnresolvedPrimPath>(
      indexB.localErrors, PcpErrorType.UnresolvedPrimPath,
    ).map(error => error.unresolvedPath)).toEqual(['/MissingB'])
  })
})

describe('PcpLayerStack.localErrors', () => {
  it('a clean layer stack reports no errors', async () => {
    const sub = fakeLayer('/sub', {})
    // SdfLayer authors one offset per sublayer; a missing one is itself an
    // error (testPcpSubLayersAndOffsetsMismatch below).
    const root = fakeLayer('/root', {
      '/': { subLayers: ['/sub'], subLayerOffsets: [{ offset: 0, scale: 1 }] },
    })
    const ls = await computePcpLayerStack(root, openerOver([root, sub]))
    expect(ls.localErrors).toEqual([])
  })

  it('a sublayer cycle records PcpErrorSublayerCycle and terminates', async () => {
    const a = fakeLayer('/a', { '/': { subLayers: ['/root'] } })
    const root = fakeLayer('/root', { '/': { subLayers: ['/a'] } })
    const ls = await computePcpLayerStack(root, openerOver([root, a]))
    const errs = ofType<PcpErrorSublayerCycle>(ls.localErrors, PcpErrorType.SublayerCycle)
    expect(errs.length).toBe(1)
    // `layer` = the layer whose subLayers closed the cycle; `sublayer` = the
    // already-loaded layer it re-included (layerStack.cpp:1779).
    expect(errs[0]!.layer.filePath).toBe('/a')
    expect(errs[0]!.sublayer.filePath).toBe('/root')
    expect(ls.layers.map((l) => l.layer.filePath)).toEqual(['/root', '/a'])
  })

  it('an invalid authored relocate records PcpErrorInvalidAuthoredRelocation', async () => {
    // A root prim can never be a relocate source (its parent is the
    // pseudoroot) — Pcp_IsValidRelocatesEntry / layerStack.cpp:390.
    const root = fakeLayer('/root', { '/': { layerRelocates: { '/Root': '/Other' } } })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const errs = ofType(ls.localErrors, PcpErrorType.InvalidAuthoredRelocation)
    expect(errs.length).toBe(1)
    // The ToString rendering (errors.cpp:766) with Pcp_IsValidRelocatesEntry's
    // message (layerStack.cpp:399).
    expect(errs[0]!.message).toBe(
      'Relocation from </Root> to </Other> authored at @/root@</> is invalid ' +
      'and will be ignored: Root prims cannot be the source of a relocate.')
    expect(ls.hasRelocates).toBe(false)
  })

  it('two relocates to one target record ONE PcpErrorInvalidSameTargetRelocations listing both sources', async () => {
    const root = fakeLayer('/root', {
      '/': { layerRelocates: { '/Root/A': '/Root/T', '/Root/B': '/Root/T' } },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const errs = ofType<PcpErrorInvalidSameTargetRelocations>(
      ls.localErrors, PcpErrorType.InvalidSameTargetRelocations)
    expect(errs.length).toBe(1)
    expect(errs[0]!.rootSite.path).toBe('')
    expect(errs[0]!.targetPath).toBe('/Root/T')
    expect(errs[0]!.sources.map((s) => s.sourcePath).sort()).toEqual(['/Root/A', '/Root/B'])
    expect(ls.hasRelocates).toBe(false)   // both removed, exactly as before
  })

  it('a chained relocate (A→B, B→C) records PcpErrorInvalidConflictingRelocation for both sides', async () => {
    const root = fakeLayer('/root', {
      '/': { layerRelocates: { '/Root/A': '/Root/B', '/Root/B': '/Root/C' } },
    })
    const ls = await computePcpLayerStack(root, openerOver([root]))
    const errs = ofType<PcpErrorInvalidConflictingRelocation>(
      ls.localErrors, PcpErrorType.InvalidConflictingRelocation)
    expect(errs.length).toBe(2)
    const reasons = errs.map((e) => e.conflictReason).sort()
    expect(reasons).toEqual([
      PcpRelocateConflictReason.TargetIsConflictSource,
      PcpRelocateConflictReason.SourceIsConflictTarget,
    ].sort())
    expect(ls.hasRelocates).toBe(false)
  })
})

describe('PcpErrorVariableExpressionError', () => {
  // Pcp_EvaluateVariableExpression evaluates with EvaluateTyped<std::string>
  // (utils.cpp:32-34, variableExpression.h:201-214). Errors captured from
  // OpenUSD v26.08 Pcp.Cache(usd=True).ComputePrimIndex on a root layer with
  // `expressionVariables = { <decl> }` and `references = @`${X}`@</A>`.
  const cases: [string, unknown, string][] = [
    ['int', 1, "Expression evaluated to 'long long' but expected 'string'"],
    ['bool', true, "Expression evaluated to 'bool' but expected 'string'"],
    ['string[]', ['a'], "Expression evaluated to 'VtArray<string>' but expected 'string'"],
    ['int[]', [1], "Expression evaluated to 'VtArray<long long>' but expected 'string'"],
  ]
  for (const [decl, value, expressionError] of cases) {
    it(`a ${decl}-valued reference expression is an error and adds no arc`, async () => {
      const root = fakeLayer('/root', {
        '/': { expressionVariables: { X: value } },
        '/Ref': { references: ref('`${X}`', '/A') },
      })
      const cache = await PcpCache.create(root, openerOver([root]))
      const errs: PcpError[] = []
      const idx = await cache.computePrimIndex('/Ref', errs)
      expect(errs).toHaveLength(1)
      const err = errs[0] as Pcp.ErrorVariableExpressionError
      expect(err).toBeInstanceOf(Pcp.ErrorVariableExpressionError)
      expect(err.errorType).toBe(PcpErrorType.VariableExpressionError)
      expect(err.expression).toBe('`${X}`')
      expect(err.expressionError).toBe(expressionError)
      expect(err.context).toBe('reference')
      expect(err.sourcePath).toBe('/Ref')
      expect(err.message).toBe(
        `Error evaluating expression \`\${X}\` for reference at /Ref in @/root@: ${expressionError}`)
      expect(idx.rootNode.children).toHaveLength(0)
    })
  }
})

// testPcpSubLayersAndOffsetsMismatch.cpp (pcp/CMakeLists.txt:194-202,
// 1511-1514). Expected values: ./fixtures/subLayersAndOffsetsMismatch/,
// captured from the same composition in native C++.
describe('testPcpSubLayersAndOffsetsMismatch', () => {
  const expected = JSON.parse(readFileSync(
    new URL('./fixtures/subLayersAndOffsetsMismatch/expected.json', import.meta.url), 'utf8',
  )).payload as {
    errors: { type: string, errorType: number, message: string, layerIsRoot: boolean,
      sublayerCount: number, offsetCount: number }[]
    layerCount: number
    sublayerOffsetIsIdentity: boolean
  }

  it('TestSubLayersAndOffsetsMismatch', async () => {
    // Sublayers authored without the sublayerOffsets field.
    const sublayer = fakeLayer('/sublayer', {})
    const root = fakeLayer('/root', { '/': { subLayers: ['/sublayer'] } })
    const ls = await computePcpLayerStack(root, openerOver([root, sublayer]))

    expect(ls.localErrors).toHaveLength(expected.errors.length)
    const [want] = expected.errors
    const error = ls.localErrors[0] as PcpErrorInvalidSublayerAndOffsetCount
    expect(error).toBeInstanceOf(PcpErrorInvalidSublayerAndOffsetCount)
    expect(error.errorType).toBe(want!.errorType)
    expect(error.layer === root).toBe(want!.layerIsRoot)
    expect(error.sublayerCount).toBe(want!.sublayerCount)
    expect(error.offsetCount).toBe(want!.offsetCount)
    expect(error.message).toBe(want!.message.replace('{layer}', root.filePath))

    expect(ls.getLayers()).toEqual([root, sublayer].slice(0, expected.layerCount))
    expect(ls.getLayerOffsetForLayer(sublayer) === null).toBe(expected.sublayerOffsetIsIdentity)
  })
})
