// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdProfiles/testenv/testUsdProfilesProfiles.cpp,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesProfilesPy.py,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesRegistry.cpp,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesRegistryPy.py
// Copyright 2025, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdProfiles/testenv/
// testUsdProfilesRegistryPy.py and testUsdProfilesProfilesPy.py (with their
// C++ twins testUsdProfilesRegistry.cpp and testUsdProfilesProfiles.cpp),
// over the testenv's own inputs vendored verbatim into
// fixtures/testenv/testUsdProfilesRegistry/. The "native" blocks compare every
// registry query and doc-utils rendering with the pinned build
// (fixtures/profiles, FIXTURES.md).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  ClaimsAPI, ProfileRegistry as PR, ProfilesDot, ProfilesMarkdown, ProfilesMermaid,
  QueryStatus as QS, type CapabilityResult,
} from 'typescript-usd/usdProfiles'
import { Usd_ProfilesRegistryTestClear, Usd_ProfilesRegistryTestLoadFromFile } from 'typescript-usd/usdProfiles/_internal'

const testenv = fileURLToPath(new URL('../fixtures/testenv/testUsdProfilesRegistry/', import.meta.url))
const native = JSON.parse(readFileSync(new URL('../fixtures/profiles/expected.json', import.meta.url), 'utf8')).payload

function load(name: string): [boolean, string[]] {
  const path = testenv + name
  const errors: string[] = []
  const ok = Usd_ProfilesRegistryTestLoadFromFile(path, existsSync(path) ? readFileSync(path, 'utf8') : undefined, errors)
  return [ok, errors]
}
function loadOk(name: string): void {
  Usd_ProfilesRegistryTestClear()
  const [ok, errors] = load(name)
  expect(ok).toBe(true)
  expect(errors).toEqual([])
}
const contains = (results: CapabilityResult[], cap: string) => results.some(r => r.capability === cap)
const statusOf = (results: CapabilityResult[], cap: string) => {
  const r = results.find(r => r.capability === cap)
  if (!r) throw new Error(`Token '${cap}' not found in results`)
  return r.status
}
const withStatus = (results: CapabilityResult[], status: string) =>
  results.filter(r => r.status === status).map(r => r.capability)
const covers = (perspective: string, required: string[], excepted: string[] = []): [string, CapabilityResult[]] => {
  const results: CapabilityResult[] = []
  return [PR.coversCapabilities(perspective, required, excepted, results), results]
}

describe('testUsdProfilesRegistryPy: TestBasicDAG', () => {
  beforeEach(() => loadOk('testBasicDAG.json'))
  it('HasCapability', () => {
    expect(PR.hasCapability('usd')).toBe(true)
    expect(PR.hasCapability('chain.a')).toBe(true)
    expect(PR.hasCapability('merge.point')).toBe(true)
    expect(PR.hasCapability('nonexistent')).toBe(false)
  })
  it('GetAllCapabilities', () => {
    const all = PR.getAllCapabilities()
    expect(all).toHaveLength(6)
    expect(all).toContain('usd')
    expect(all).toContain('merge.point')
  })
  it('GetPredecessors', () => {
    expect(PR.getPredecessors('usd')).toEqual([])
    const chainA = PR.getPredecessors('chain.a')
    expect(chainA).toHaveLength(1)
    expect(chainA[0]).toEqual({ capability: 'usd', status: QS.ValidPath })
    const merge = PR.getPredecessors('merge.point')
    expect(merge).toHaveLength(3)
    for (const cap of ['chain.b', 'branch.left', 'branch.right']) expect(contains(merge, cap)).toBe(true)
    expect(withStatus(merge, QS.Deprecated)).toEqual([])
  })
  it('Metadata', () => {
    expect(PR.getDocString('usd')).toBe('Root capability')
    expect(PR.getDocString('merge.point')).toBe('Merges chain and both branches')
    expect(PR.getDisplayName('chain.a')).toBe('Chain A')
    expect(PR.getDisplayName('merge.point')).toBe('Merge Point')
    expect(PR.getStyleForCapability('usd')).toBe('core')
    expect(PR.getStyleForCapability('branch.left')).toBe('extra')
    expect(PR.getSubgraphForCapability('usd')).toBe('Foundation')
    expect(PR.getSubgraphForCapability('merge.point')).toBe('Extensions')
    expect(PR.isProfile('usd')).toBe(false)
  })
  it('GetCapabilityMetadata', () => {
    const md = PR.getCapabilityMetadata('chain.b')
    expect(md['docstring']).toBe('Second link in chain')
    expect(md['style']).toBe('core')
  })
  it('GetCapabilityStyles', () => {
    const styles = PR.getCapabilityStyles()
    expect(styles.size).toBe(2)
    expect(styles.has('core')).toBe(true)
    expect(styles.has('extra')).toBe(true)
  })
})

describe('testUsdProfilesRegistryPy: TestDeprecation', () => {
  beforeEach(() => loadOk('testDeprecation.json'))
  it('HydraV2', () => {
    const preds = PR.getPredecessors('hydra.v2')
    expect(preds).toHaveLength(2)
    expect(statusOf(preds, 'hydra.base')).toBe(QS.ValidPath)
    expect(statusOf(preds, 'hydra.v1')).toBe(QS.Deprecated)
  })
  it('ShadeMaterial', () => {
    const preds = PR.getPredecessors('shade.material')
    expect(statusOf(preds, 'shade.look')).toBe(QS.Deprecated)
    expect(statusOf(preds, 'shade.base')).toBe(QS.ValidPath)
  })
  it('PipelineMultiDeprecated', () => {
    const preds = PR.getPredecessors('pipeline.v3')
    expect(preds).toHaveLength(3)
    expect(statusOf(preds, 'hydra.base')).toBe(QS.ValidPath)
    expect(statusOf(preds, 'pipeline.v1')).toBe(QS.Deprecated)
    expect(statusOf(preds, 'pipeline.v2')).toBe(QS.Deprecated)
    expect(withStatus(preds, QS.Deprecated)).toHaveLength(2)
  })
  it('CleanLeaf', () => {
    expect(withStatus(PR.getPredecessors('clean.leaf'), QS.Deprecated)).toEqual([])
  })
})

describe('testUsdProfilesRegistryPy: TestValidation', () => {
  beforeEach(() => Usd_ProfilesRegistryTestClear())
  it('CycleDetection', () => {
    const [ok, errors] = load('testCycleDetection.json')
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('cycle'))).toBe(true)
  })
  it('MissingPredecessor', () => {
    const [ok, errors] = load('testMissingPredecessor.json')
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('nonexistent.capability'))).toBe(true)
  })
  it('NoUsdRoot', () => {
    const [ok, errors] = load('testNoUsdRoot.json')
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('usd'))).toBe(true)
  })
  it('FileNotFound', () => {
    const [ok, errors] = load('this_file_does_not_exist.json')
    expect(ok).toBe(false)
    expect(errors.some(e => e.includes('Failed to open'))).toBe(true)
    expect([ok, errors.map(e => e.replace(testenv.replace(/\/$/, ''), '<testenv>'))]).toEqual(native.missingFile)
  })
})

describe('testUsdProfilesRegistryPy: TestEmptyGraph and TestClear', () => {
  it('Empty', () => {
    loadOk('testEmpty.json')
    expect(PR.getAllCapabilities()).toEqual([])
    expect(PR.hasCapability('anything')).toBe(false)
    expect(PR.getCapabilityStyles().size).toBe(0)
  })
  it('Clear', () => {
    Usd_ProfilesRegistryTestClear()
    expect(load('testBasicDAG.json')[0]).toBe(true)
    expect(PR.getAllCapabilities()).not.toEqual([])
    Usd_ProfilesRegistryTestClear()
    expect(PR.getAllCapabilities()).toEqual([])
    expect(PR.hasCapability('usd')).toBe(false)
    expect(PR.getCapabilityStyles().size).toBe(0)
  })
})

describe('testUsdProfilesRegistryPy: TestMultiPluginMerge', () => {
  beforeEach(() => loadOk('testMultiPluginMerged.json'))
  it('CrossPluginEdges', () => {
    const geom = PR.getPredecessors('vendor.geom')
    expect(geom).toEqual([{ capability: 'core.module', status: QS.ValidPath }])
    const render = PR.getPredecessors('vendor.render')
    expect(render).toHaveLength(2)
    expect(contains(render, 'core.module')).toBe(true)
    expect(contains(render, 'vendor.geom')).toBe(true)
  })
  it('StylesMerged', () => {
    const styles = PR.getCapabilityStyles()
    expect(styles.has('plugA')).toBe(true)
    expect(styles.has('plugB')).toBe(true)
    expect(PR.getStyleForCapability('core.module')).toBe('plugA')
    expect(PR.getStyleForCapability('vendor.geom')).toBe('plugB')
  })
})

describe('testUsdProfilesRegistryPy: TestTransitivePredecessors', () => {
  beforeEach(() => loadOk('testBasicDAG.json'))
  it('Root', () => expect(PR.getTransitivePredecessors('usd')).toEqual([]))
  it('ChainA', () => {
    const trans = PR.getTransitivePredecessors('chain.a')
    expect(trans).toHaveLength(1)
    expect(statusOf(trans, 'usd')).toBe(QS.ValidPath)
  })
  it('ChainB', () => {
    const trans = PR.getTransitivePredecessors('chain.b')
    expect(trans).toHaveLength(2)
    expect(statusOf(trans, 'chain.a')).toBe(QS.ValidPath)
    expect(statusOf(trans, 'usd')).toBe(QS.ValidPath)
  })
  it('MergePoint', () => {
    const trans = PR.getTransitivePredecessors('merge.point')
    expect(trans).toHaveLength(5)
    for (const cap of ['chain.b', 'chain.a', 'usd', 'branch.left', 'branch.right']) expect(contains(trans, cap)).toBe(true)
    expect(withStatus(trans, QS.Deprecated)).toEqual([])
  })
  it('Unknown', () => expect(PR.getTransitivePredecessors('nonexistent')).toEqual([]))
})

describe('testUsdProfilesRegistryPy: TestHasPredecessor', () => {
  beforeEach(() => Usd_ProfilesRegistryTestClear())
  it('BasicDAG', () => {
    expect(load('testBasicDAG.json')[0]).toBe(true)
    expect(PR.hasPredecessor('chain.a', 'usd')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('chain.b', 'usd')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('merge.point', 'usd')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('usd', 'chain.a')).toBe(QS.NoPath)
    expect(PR.hasPredecessor('usd', 'usd')).toBe(QS.NoPath)
    expect(PR.hasPredecessor('nonexistent', 'usd')).toBe(QS.NoPath)
  })
  it('Deprecation', () => {
    expect(load('testDeprecation.json')[0]).toBe(true)
    expect(PR.hasPredecessor('hydra.v1', 'hydra.base')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('hydra.v2', 'hydra.v1')).toBe(QS.Deprecated)
    expect(PR.hasPredecessor('hydra.v2', 'hydra.base')).toBe(QS.DeprecationConflict)
    expect(PR.hasPredecessor('clean.leaf', 'hydra.v1')).toBe(QS.Deprecated)
    expect(PR.hasPredecessor('clean.leaf', 'hydra.base')).toBe(QS.DeprecationConflict)
  })
})

describe('testUsdProfilesRegistryPy: TestUnknownCapabilityQueries', () => {
  const assertAllEmpty = () => {
    for (const tok of ['no.such.capability', '']) {
      expect(PR.hasCapability(tok)).toBe(false)
      expect(PR.getPredecessors(tok)).toEqual([])
      expect(PR.getTransitivePredecessors(tok)).toEqual([])
      expect(PR.hasPredecessor(tok, 'usd')).toBe(QS.NoPath)
      expect(PR.hasPredecessor('chain.b', tok)).toBe(QS.NoPath)
      expect(PR.getDocString(tok)).toBe('')
      expect(PR.getDisplayName(tok)).toBe('')
      expect(PR.getStyleForCapability(tok)).toBe('')
      expect(PR.getSubgraphForCapability(tok)).toBe('')
      expect(Object.keys(PR.getCapabilityMetadata(tok))).toHaveLength(0)
    }
  }
  beforeEach(() => loadOk('testBasicDAG.json'))
  it('WithLoadedGraph', assertAllEmpty)
  it('AfterClear', () => { Usd_ProfilesRegistryTestClear(); assertAllEmpty() })
})

describe('testUsdProfilesRegistryPy: TestParseCapabilityVersion', () => {
  it.each([
    ['usd.physics', 'usd.physics', 0],
    ['usd.physics_v2', 'usd.physics', 2],
    ['yoyo.tool_v10', 'yoyo.tool', 10],
    ['usd._v2.geom', 'usd._v2.geom', 0],
    ['usd.foo_v', 'usd.foo_v', 0],
    ['', '', 0],
    ['usd.foo_v2x', 'usd.foo_v2x', 0],
  ])('%s', (input, base, version) => {
    expect(PR.parseCapabilityVersion(input)).toEqual([base, version])
  })
})

describe('testUsdProfilesRegistryPy: TestResolveCapability and TestVersioningQueries', () => {
  beforeEach(() => loadOk('testVersioning.json'))
  it('Resolve', () => {
    expect(PR.resolveCapability('usd.physics')).toBe('usd.physics_v2')
    expect(PR.resolveCapability('usd.physics_v2')).toBe('usd.physics_v2')
    expect(PR.resolveCapability('yoyo.tool_v2')).toBe('yoyo.tool_v5')
    expect(PR.resolveCapability('yoyo.tool_v5')).toBe('yoyo.tool_v5')
    expect(PR.resolveCapability('usd.geom')).toBe('usd.geom')
    expect(PR.resolveCapability('usd')).toBe('usd')
    expect(PR.resolveCapability('no.such.cap')).toBe('')
    expect(PR.resolveCapability('')).toBe('')
  })
  it('HasPredecessorVersioned', () => {
    expect(PR.hasPredecessor('profile.sim', 'usd.physics')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('profile.sim', 'yoyo.tool_v2')).toBe(QS.NoPath)
    expect(PR.hasPredecessor('usd.physics', 'usd.geom')).toBe(QS.DeprecationConflict)
    expect(PR.hasPredecessor('usd.physics', 'usd')).toBe(QS.DeprecationConflict)
  })
  it('CoversCapabilitiesVersioned', () => {
    const [status, results] = covers('profile.sim', ['usd.geom', 'usd.physics'])
    expect(status).toBe(QS.DeprecationConflict)
    expect(results).toEqual([
      { capability: 'usd.geom', status: QS.DeprecationConflict },
      { capability: 'usd.physics_v2', status: QS.ValidPath },
    ])
  })
  it('UnversionedPerspective', () => {
    expect(covers('usd.physics', ['usd.geom'])[0]).toBe(QS.DeprecationConflict)
  })
})

describe('testUsdProfilesProfilesPy: TestGetAllProfiles and TestIsProfile', () => {
  beforeEach(() => loadOk('testIsProfile.json'))
  it('ReturnsOnlyProfileNodes', () => {
    expect(PR.getAllProfiles()).toEqual(['usd.core.26.03', 'usd.core.26.11'])
  })
  it('NonProfilesExcluded', () => {
    for (const cap of ['usd', 'usd.geom', 'usd.geom.mesh']) expect(PR.getAllProfiles()).not.toContain(cap)
  })
  it('EmptyRegistry', () => {
    Usd_ProfilesRegistryTestClear()
    expect(load('testEmpty.json')[0]).toBe(true)
    expect(PR.getAllProfiles()).toEqual([])
  })
  it('SubsetOfAllCapabilities', () => {
    const profiles = PR.getAllProfiles(), all = PR.getAllCapabilities()
    expect(profiles.every(p => all.includes(p))).toBe(true)
    expect(profiles.length).toBeLessThan(all.length)
  })
  it('ProfileNodes', () => {
    expect(PR.isProfile('usd.core.26.03')).toBe(true)
    expect(PR.isProfile('usd.core.26.11')).toBe(true)
  })
  it('NonProfileNodes', () => {
    for (const cap of ['usd', 'usd.geom', 'usd.geom.mesh', 'no.such.capability', '']) expect(PR.isProfile(cap)).toBe(false)
  })
  it('NormalQueriesUnaffected', () => {
    expect(PR.hasCapability('usd.core.26.03')).toBe(true)
    expect(PR.hasCapability('usd.core.26.11')).toBe(true)
    expect(PR.hasPredecessor('usd.core.26.03', 'usd')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('usd.core.26.11', 'usd.core.26.03')).toBe(QS.Deprecated)
  })
})

describe('testUsdProfilesProfilesPy: TestCoversCapabilities and TestDeprecationPerspective', () => {
  beforeEach(() => loadOk('testProfileVersions.json'))
  it('AllValid', () => {
    const [status, results] = covers('profile.25.11', ['usd.geom.mesh', 'usd'])
    expect(status).toBe(QS.ValidPath)
    expect(results).toHaveLength(2)
    expect(statusOf(results, 'usd.geom.mesh')).toBe(QS.ValidPath)
    expect(statusOf(results, 'usd')).toBe(QS.ValidPath)
  })
  it('MixedDeprecation', () => {
    const [status, results] = covers('profile.26.08', ['usd.geom.nurbs', 'usd.geom.mesh'])
    expect(status).toBe(QS.DeprecationConflict)
    expect(statusOf(results, 'usd.geom.nurbs')).toBe(QS.ValidPath)
    expect(statusOf(results, 'usd.geom.mesh')).toBe(QS.DeprecationConflict)
  })
  it('Unreachable', () => {
    const [status, results] = covers('profile.25.11', ['usd.geom.mesh', 'no.such.cap'])
    expect(status).toBe(QS.NoPath)
    expect(results).toHaveLength(2)
    expect(statusOf(results, 'usd.geom.mesh')).toBe(QS.ValidPath)
    expect(statusOf(results, 'no.such.cap')).toBe(QS.NoPath)
  })
  it('EmptyRequired', () => expect(covers('profile.25.11', [])[0]).toBe(QS.NoPath))
  it('UnknownPerspective', () => expect(covers('no.such.profile', ['usd.geom.mesh'])[0]).toBe(QS.NoPath))
  it('DeprecatedOnly', () => {
    const [status, results] = covers('profile.26.08', ['profile.25.11'])
    expect(status).toBe(QS.Deprecated)
    expect(results[0]!.status).toBe(QS.Deprecated)
  })
  it('Excepted', () => {
    const [status, results] = covers('profile.25.11', ['usd.geom.mesh', 'usd'], ['usd.geom.mesh'])
    expect(status).toBe(QS.NoPath)
    expect(statusOf(results, 'usd.geom.mesh')).toBe(QS.Excepted)
    expect(statusOf(results, 'usd')).toBe(QS.ValidPath)
  })
  it('ExceptedNotInRequired', () => {
    expect(covers('profile.25.11', ['usd.geom.mesh'], ['usd.geom.nurbs'])[0]).toBe(QS.ValidPath)
  })
  it('Perspective', () => {
    expect(PR.hasPredecessor('profile.25.11', 'usd.geom.mesh')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('profile.26.08', 'profile.25.11')).toBe(QS.Deprecated)
    expect(PR.hasPredecessor('profile.26.08', 'usd.geom.nurbs')).toBe(QS.ValidPath)
    expect(PR.hasPredecessor('profile.26.08', 'usd.geom.mesh')).toBe(QS.DeprecationConflict)
  })
})

describe('testUsdProfilesProfilesPy: TestIsCompatibleWith', () => {
  let stage: Stage, api: ClaimsAPI
  beforeEach(() => {
    loadOk('testProfileVersions.json')
    stage = Stage.createNew()
    api = ClaimsAPI.Apply(stage.definePrim('/TestPrim'))
    api.setCapabilityUsage('usd.geom.mesh', 'hard')
    api.setCapabilityUsage('usd', 'hard')
  })
  it('ProfileNotDeclared', () => expect(api.isCompatibleWith('profile.25.11')).toBe(QS.NoPath))
  it('ValidPath', () => {
    api.setProfileCompatible('profile.25.11')
    const results: CapabilityResult[] = []
    expect(api.isCompatibleWith('profile.25.11', results)).toBe(QS.ValidPath)
    expect(results.map(r => r.capability).sort()).toEqual(['usd', 'usd.geom.mesh'])
    expect(results.every(r => r.status === QS.ValidPath)).toBe(true)
  })
  it('WithExceptions', () => {
    api.setProfileCompatibleWithExceptions('profile.26.08', ['usd.geom.mesh'])
    const results: CapabilityResult[] = []
    expect(api.isCompatibleWith('profile.26.08', results)).toBe(QS.NoPath)
    expect(withStatus(results, QS.Excepted)).toContain('usd.geom.mesh')
  })
  it('NoCaps_NoPath', () => {
    const api2 = ClaimsAPI.Apply(stage.definePrim('/NoCaps'))
    api2.setProfileCompatible('profile.25.11')
    expect(api2.isCompatibleWith('profile.25.11')).toBe(QS.NoPath)
  })
})

// Every query over every testenv graph, and its doc-utils renderings, as the
// pinned build answers them.
describe('native registry over the testenv graphs', () => {
  for (const [name, expected] of Object.entries<any>(native.testenv)) {
    describe(name, () => {
      let ok: boolean, errors: string[]
      beforeEach(() => { Usd_ProfilesRegistryTestClear(); [ok, errors] = load(name) })
      it('loads and validates', () => {
        expect(ok).toBe(expected.ok)
        expect(errors).toEqual(expected.errors)
      })
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
          expect(PR.resolveCapability(cap), cap).toBe(expected.resolve[cap])
        }
      })
      it('HasPredecessor over every pair', () => {
        expect(expected.hasPredecessor.map(([a, b]: string[]) => [a, b, PR.hasPredecessor(a!, b!)]))
          .toEqual(expected.hasPredecessor)
      })
      it('CoversCapabilities', () => {
        for (const row of expected.covers) {
          const [status, results] = covers(row.perspective, row.required, row.excepted)
          expect({ status, results: results.map(r => [r.capability, r.status]) }, JSON.stringify(row))
            .toEqual({ status: row.status, results: row.results })
        }
      })
      it('ProfilesMarkdown, ProfilesMermaid and ProfilesDot', () => {
        expect(ProfilesMarkdown()).toBe(expected.markdown)
        expect(ProfilesMarkdown({ core: 'fill:#cce5ff,stroke:#004085', 'x y': 'fill: #fff ' })).toBe(expected.markdownWithStyles)
        expect(ProfilesMermaid({})).toBe(expected.mermaid)
        expect(ProfilesDot()).toBe(expected.dot)
      })
    })
  }
})
