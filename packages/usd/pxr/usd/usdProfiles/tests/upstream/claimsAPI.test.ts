// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdProfiles/testenv/testUsdProfilesClaimsAPI.cpp,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesClaimsAPIPy.py,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesSchemaImplication.cpp,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesSchemaImplicationPy.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdProfiles/testenv/
// testUsdProfilesClaimsAPIPy.py and testUsdProfilesSchemaImplicationPy.py
// (with testUsdProfilesClaimsAPI.cpp and testUsdProfilesSchemaImplication.cpp).
// The registry here is the production one, seeded by the usd and usdMtlx
// plugInfo.json files; the "native" blocks compare it, and ClaimsAPI's
// stored layout, with the pinned build (fixtures/profiles, FIXTURES.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Stage, SchemaRegistry, ColorSpaceAPI, ColorSpaceDefinitionAPI } from 'typescript-usd/usd'
import { Type as TfType } from 'typescript-usd/tf'
import 'typescript-usd/usdMtlx'
import {
  ClaimsAPI as CA, ProfileRegistry as PR, ProfilesDot, ProfilesMarkdown, ProfilesMermaid, QueryStatus as QS,
  Tokens, type CapabilityResult,
} from 'typescript-usd/usdProfiles'

const native = JSON.parse(readFileSync(new URL('../fixtures/profiles/expected.json', import.meta.url), 'utf8')).payload

function makeApi(): [Stage, CA] {
  const stage = Stage.createNew()
  return [stage, CA.Apply(stage.definePrim('/TestPrim'))]
}

describe('testUsdProfilesClaimsAPIPy: TestSchemaApply', () => {
  it('CanApplyAndApply', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P')
    expect(CA.canApply(prim)).toBe(true)
    expect(CA.Apply(prim).isValid()).toBe(true)
  })
  it('Get', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P')
    CA.Apply(prim)
    const got = CA.Get(stage, '/P')
    expect(got.isValid()).toBe(true)
    expect(got.getPrim().path).toBe(prim.path)
  })
  it('registers ClaimsAPI as the pinned build does', () => {
    expect(SchemaRegistry.getSchemaKind('ClaimsAPI')).toBe('singleApplyAPI')
    expect(native.claims.schemaKind).toBe('SingleApplyAPI')
    expect(CA.GetSchemaAttributeNames()).toEqual(native.claims.attributeNames)
    const { hard, soft, enhancement } = Tokens
    expect({ hard, soft, enhancement }).toEqual(native.tokens)
  })
})

describe('testUsdProfilesClaimsAPIPy: TestCapabilityUsages', () => {
  it('InitiallyEmpty', () => {
    const [, api] = makeApi()
    expect(api.getCapabilityUsages()).toEqual({})
    expect(api.getCapabilityUsage('usd.geom.mesh')).toBe('')
  })
  it('SetAndGetSingle', () => {
    const [, api] = makeApi()
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    expect(api.getCapabilityUsage('usd.geom.mesh')).toBe('hard')
  })
  it('SetMultiple', () => {
    const [, api] = makeApi()
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    api.setCapabilityUsage('usd.shading', 'soft')
    expect(api.getCapabilityUsages()).toEqual({ 'usd.geom.mesh': 'hard', 'usd.shading': 'soft' })
  })
  it('Overwrite', () => {
    const [, api] = makeApi()
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    api.setCapabilityUsage('usd.geom.mesh', 'enhancement')
    expect(api.getCapabilityUsage('usd.geom.mesh')).toBe('enhancement')
  })
  it('BulkReplace', () => {
    const [, api] = makeApi()
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    api.setCapabilityUsages({ 'usd.physics': 'hard' })
    const usages = api.getCapabilityUsages()
    expect(Object.keys(usages)).toEqual(['usd.physics'])
  })
  it('UnknownCapabilityEmpty', () => {
    const [, api] = makeApi()
    expect(api.getCapabilityUsage('no.such.cap')).toBe('')
  })
})

describe('testUsdProfilesClaimsAPIPy: TestProfileCompatibilityDeclarations', () => {
  it('InitiallyEmpty', () => {
    const [, api] = makeApi()
    expect(api.getCompatibleProfiles()).toEqual([])
    expect(api.getProfileExceptions('profile.a')).toEqual([])
  })
  it('SetCompatible', () => {
    const [, api] = makeApi()
    api.setProfileCompatible('profile.a')
    expect(api.getCompatibleProfiles()).toContain('profile.a')
    expect(api.getProfileExceptions('profile.a')).toEqual([])
  })
  it('SetCompatibleWithExceptions', () => {
    const [, api] = makeApi()
    api.setProfileCompatibleWithExceptions('profile.b', ['usd.geom.mesh', 'usd.shading'])
    expect(api.getCompatibleProfiles()).toContain('profile.b')
    const ex = api.getProfileExceptions('profile.b')
    expect(ex).toHaveLength(2)
    expect(ex).toContain('usd.geom.mesh')
    expect(ex).toContain('usd.shading')
  })
  it('OverwriteEntry', () => {
    const [, api] = makeApi()
    api.setProfileCompatible('profile.a')
    api.setProfileCompatibleWithExceptions('profile.a', ['usd.geom.hair'])
    expect(api.getProfileExceptions('profile.a')).toEqual(['usd.geom.hair'])
  })
  it('Clear', () => {
    const [, api] = makeApi()
    api.setProfileCompatible('profile.a')
    api.setProfileCompatibleWithExceptions('profile.b', ['usd.geom.mesh'])
    api.clearProfileCompatibility('profile.a')
    expect(api.getCompatibleProfiles()).toEqual(['profile.b'])
    expect(api.getProfileExceptions('profile.a')).toEqual([])
  })
  it('ExceptionsUnknownProfile', () => {
    const [, api] = makeApi()
    expect(api.getProfileExceptions('never.declared')).toEqual([])
  })
})

describe('testUsdProfilesClaimsAPIPy: TestProfilesInfoRoundTrip', () => {
  it('InitiallyEmpty', () => expect(makeApi()[1].getProfilesInfo()).toEqual({}))
  it('RoundTrip', () => {
    const [, api] = makeApi()
    api.setProfilesInfo({ capabilityUsages: { 'usd.geom.mesh': 'hard' } })
    expect(api.getProfilesInfo()).toHaveProperty('capabilityUsages')
  })
  it('SharedStorage', () => {
    const [, api] = makeApi()
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    const got = api.getProfilesInfo()
    expect(Object.keys(got['capabilityUsages'] as object)).toContain('usd.geom.mesh')
  })
})

describe('native ClaimsAPI storage', () => {
  it('authors tokens and token arrays under customData:profilesInfo, and clears emptied dictionaries', () => {
    const stage = Stage.createNew()
    const api = CA.Apply(stage.definePrim('/Root'))
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    api.setCapabilityUsage('usd.core.colorspace', 'soft')
    api.setProfileCompatible('profile.a')
    api.setProfileCompatibleWithExceptions('profile.b', ['usd.geom.mesh', 'usd.shading'])
    expect(stage.getRootLayer().exportToString()).toBe(native.claims.authored)
    api.clearProfileCompatibility('profile.a')
    api.clearProfileCompatibility('profile.b')
    expect(stage.getRootLayer().exportToString()).toBe(native.claims.cleared)
  })
  it('reads only token-held usages and token[] exceptions', async () => {
    const stage = Stage.createNew()
    expect(stage.getRootLayer().importFromString(`#usda 1.0
def "Doc" (
    prepend apiSchemas = ["ClaimsAPI"]
    customData = {
        dictionary profilesInfo = {
            dictionary capabilityUsages = {
                string "usd.core" = "hard"
                token "usd.core.colorspace" = "soft"
            }
            dictionary profileCompatibility = {
                string[] "profile.s" = ["usd.core"]
                token[] "profile.t" = ["usd.core"]
            }
        }
    }
)
{
}
`)).toBe(true)
    await stage.flushChanges()
    const doc = CA.Get(stage, '/Doc')
    expect({
      usages: doc.getCapabilityUsages(),
      usageString: doc.getCapabilityUsage('usd.core'),
      usageToken: doc.getCapabilityUsage('usd.core.colorspace'),
      profiles: doc.getCompatibleProfiles().sort(),
      exceptionsString: doc.getProfileExceptions('profile.s'),
      exceptionsToken: doc.getProfileExceptions('profile.t'),
    }).toEqual(native.claims.typed)
  })
})

describe('testUsdProfilesSchemaImplicationPy: TestSeededCapabilityGraph', () => {
  it('RootCapabilityPresent', () => expect(PR.hasCapability('usd')).toBe(true))
  it('UsdLibraryCapabilityPresent', () => expect(PR.hasCapability('usd.core')).toBe(true))
  it('ColorspaceCapabilityPresent', () => expect(PR.hasCapability('usd.core.colorspace')).toBe(true))
  it('ColorspaceTransitivelyReachesUsd', () => {
    expect(PR.hasPredecessor('usd.core.colorspace', 'usd')).toBe(QS.ValidPath)
  })
})

describe('testUsdProfilesSchemaImplicationPy: TestDirectRegistryQuery', () => {
  it('ColorSpaceAPIImpliesColorspace', () => {
    const t = SchemaRegistry.getTypeFromName('ColorSpaceAPI')
    expect(t.isUnknown()).toBe(false)
    expect(PR.getSchemaImpliedCapabilities(t)).toContain('usd.core.colorspace')
  })
  it('ColorSpaceDefinitionAPIImpliesColorspace', () => {
    const t = SchemaRegistry.getTypeFromName('ColorSpaceDefinitionAPI')
    expect(t.isUnknown()).toBe(false)
    expect(PR.getSchemaImpliedCapabilities(t)).toContain('usd.core.colorspace')
  })
  it('UnknownTypeReturnsEmpty', () => {
    expect(PR.getSchemaImpliedCapabilities(TfType.getUnknownType())).toEqual([])
  })
  it('UnannotatedSchemaReturnsEmpty', () => {
    const t = SchemaRegistry.getTypeFromName('ClipsAPI')
    expect(t.isUnknown()).toBe(false)
    expect(PR.getSchemaImpliedCapabilities(t)).not.toContain('usd.core.colorspace')
  })
  it('ResultIsCached', () => {
    const t = SchemaRegistry.getTypeFromName('ColorSpaceAPI')
    expect(PR.getSchemaImpliedCapabilities(t)).toEqual(PR.getSchemaImpliedCapabilities(t))
  })
})

function rootAndLeaf(leafPath = '/Root/Leaf'): [Stage, ReturnType<Stage['definePrim']>, ReturnType<Stage['definePrim']>] {
  const stage = Stage.createNew()
  return [stage, stage.definePrim('/Root'), stage.definePrim(leafPath)]
}

describe('testUsdProfilesSchemaImplicationPy: aggregation', () => {
  it('TestMultiApplyDedupe: TwoInstancesProduceSingleEntry', () => {
    const [, root, leaf] = rootAndLeaf()
    ColorSpaceDefinitionAPI.apply(leaf, 'foo')
    ColorSpaceDefinitionAPI.apply(leaf, 'bar')
    const merged = CA.Apply(root).populateCapabilityUsages()
    expect(merged['usd.core.colorspace']).toBe('hard')
    expect(Object.keys(merged).filter(k => k.includes('colorspace'))).toHaveLength(1)
  })
  it('TestDefaultStrengthIsHard: ImpliedCapabilityDefaultsToHard', () => {
    const [, root, leaf] = rootAndLeaf()
    ColorSpaceAPI.apply(leaf)
    expect(CA.Apply(root).populateCapabilityUsages()['usd.core.colorspace']).toBe('hard')
  })
  for (const strength of ['enhancement', 'soft', 'hard']) {
    it(`TestAuthoredStrengthsAreRespected: user declares ${strength}`, () => {
      const [, root, leaf] = rootAndLeaf()
      ColorSpaceAPI.apply(leaf)
      const claims = CA.Apply(root)
      claims.setCapabilityUsage('usd.core.colorspace', strength)
      expect(claims.populateCapabilityUsages()['usd.core.colorspace']).toBe(strength)
    })
  }
  it('TestEndToEndAggregator: BasicAggregation', () => {
    const [, root, leaf] = rootAndLeaf('/Root/A/B')
    ColorSpaceAPI.apply(leaf)
    const claims = CA.Apply(root)
    const merged = claims.populateCapabilityUsages()
    expect(merged).toEqual({ 'usd.core.colorspace': 'hard' })
    expect(claims.getCapabilityUsages()).toEqual(merged)
  })
  it('TestEndToEndAggregator: EmptyNamespaceProducesEmptyDict', () => {
    const stage = Stage.createNew()
    expect(CA.Apply(stage.definePrim('/Root')).populateCapabilityUsages()).toEqual({})
  })
  it('TestEndToEndAggregator: SchemaOnRootPrimItself', () => {
    const stage = Stage.createNew()
    const root = stage.definePrim('/Root')
    ColorSpaceAPI.apply(root)
    expect(CA.Apply(root).populateCapabilityUsages()).toHaveProperty(['usd.core.colorspace'])
  })
  it('TestEndToEndAggregator: AggregationAcrossMultipleDescendants', () => {
    const stage = Stage.createNew()
    const root = stage.definePrim('/Root')
    ColorSpaceAPI.apply(stage.definePrim('/Root/A'))
    ColorSpaceDefinitionAPI.apply(stage.definePrim('/Root/B'), 'myCs')
    expect(CA.Apply(root).populateCapabilityUsages()['usd.core.colorspace']).toBe('hard')
  })
  it('TestEndToEndAggregator: AuthoredEntryForImpliedCapabilitySurvives', () => {
    const stage = Stage.createNew()
    const root = stage.definePrim('/Root')
    ColorSpaceAPI.apply(root)
    const claims = CA.Apply(root)
    claims.setCapabilityUsage('usd.core.colorspace', 'soft')
    const merged = claims.populateCapabilityUsages()
    expect(merged['usd.core.colorspace']).toBe('soft')
    expect(claims.getCapabilityUsages()).toEqual(merged)
  })
})

describe('native production registry', () => {
  const expected = native.production
  it('capabilities, profiles and styles', () => {
    expect(PR.getAllCapabilities()).toEqual(expected.capabilities)
    expect(PR.getAllProfiles()).toEqual(expected.profiles)
    expect([...PR.getCapabilityStyles().keys()]).toEqual(expected.styles)
  })
  it('per-capability queries', () => {
    for (const [cap, node] of Object.entries<any>(expected.nodes)) {
      expect({
        has: PR.hasCapability(cap), isProfile: PR.isProfile(cap), metadata: PR.getCapabilityMetadata(cap),
        docString: PR.getDocString(cap), displayName: PR.getDisplayName(cap),
        style: PR.getStyleForCapability(cap), subgraph: PR.getSubgraphForCapability(cap),
        predecessors: PR.getPredecessors(cap).map(r => [r.capability, r.status]),
        transitive: PR.getTransitivePredecessors(cap).map(r => [r.capability, r.status]),
      }, cap).toEqual(node)
    }
  })
  it('HasPredecessor and CoversCapabilities', () => {
    expect(expected.hasPredecessor.map(([a, b]: string[]) => [a, b, PR.hasPredecessor(a!, b!)])).toEqual(expected.hasPredecessor)
    for (const row of expected.covers) {
      const results: CapabilityResult[] = []
      const status = PR.coversCapabilities(row.perspective, row.required, row.excepted, results)
      expect({ status, results: results.map(r => [r.capability, r.status]) }).toEqual({ status: row.status, results: row.results })
    }
  })
  it('schema and file format implications', () => {
    const implied: Record<string, string[]> = {}
    for (const name of ['ColorSpaceAPI', 'ColorSpaceDefinitionAPI', 'ClipsAPI', 'ClaimsAPI']) {
      implied[name] = PR.getSchemaImpliedCapabilities(SchemaRegistry.getTypeFromName(name))
    }
    for (const name of ['UsdMtlxFileFormat', 'SdfUsdaFileFormat', 'SdfFileFormat']) {
      implied[name] = PR.getFileFormatImpliedCapabilities(TfType.findByName(name))
    }
    expect(implied).toEqual(expected.implied)
  })
  it('doc utils', () => {
    expect(ProfilesMarkdown()).toBe(expected.markdown)
    expect(ProfilesMarkdown({ core: 'fill:#cce5ff,stroke:#004085', 'x y': 'fill: #fff ' })).toBe(expected.markdownWithStyles)
    expect(ProfilesMermaid({})).toBe(expected.mermaid)
    expect(ProfilesDot()).toBe(expected.dot)
  })
})
