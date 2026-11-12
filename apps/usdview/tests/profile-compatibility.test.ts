// Profile compatibility diagnostics (Node controller test, not a browser
// test). The viewer's profile plugin is registered from its served plugInfo
// URL as main.ts registers it. Which claims are and are not covered comes
// from the pinned OpenUSD 26.11.1 registry with the same plugins loaded
// (fixtures/webProfile, captured per FIXTURES.md); the wording is the viewer's own.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdMtlx'
import { ClaimsAPI, ProfileRegistry, QueryStatus } from 'typescript-usd/usdProfiles'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { profileCompatibilityWarnings, webProfile, webProfilePlugInfo } from '../src/profile-compatibility'

const site = 'https://viewer.example/'
const publicDir = new URL('../public/', import.meta.url)
const fixtures = new URL('./fixtures/webProfile/', import.meta.url)
const serve = (async (input: string | URL | Request) => {
  const url = new URL(String(input instanceof Request ? input.url : input))
  const file = url.pathname.startsWith('/fixtures/') ? new URL(url.pathname.slice('/fixtures/'.length), fixtures)
    : new URL(url.pathname.slice(1), publicDir)
  try { return new Response(await readFile(file)) } catch { return new Response(null, { status: 404 }) }
}) as typeof fetch
const native = JSON.parse(await readFile(new URL('expected.json', fixtures), 'utf8'))
const warningsPosted: string[] = []

beforeAll(async () => {
  TfDiagnosticMgr.GetInstance().addDelegate({
    issueError: () => {}, issueStatus: () => {}, issueFatalError: () => {},
    issueWarning: (warning: { getCommentary(): string }) => { warningsPosted.push(warning.getCommentary()) },
  } as never)
  const registry = PlugRegistry.GetInstance()
  const plugins = [
    ...await registry.registerPluginsAsync(new URL(webProfilePlugInfo, site).href, { fetch: serve }),
    ...await registry.registerPluginsAsync(site + 'fixtures/exampleProfile/plugInfo.json', { fetch: serve }),
  ]
  expect(plugins.map(plugin => plugin.getName())).toEqual(native.registered)
})

const openClaims = async () => Stage.open(Layer.createInMemory('claims.usda',
  await readFile(new URL('claims.usda', fixtures), 'utf8')))

describe('the typescript-usd.web profile plugin', () => {
  it('registers the graph the pinned build registers, without validation warnings', () => {
    expect(ProfileRegistry.getAllCapabilities()).toEqual(native.capabilities)
    expect(ProfileRegistry.getAllProfiles()).toEqual(native.profiles)
    expect(ProfileRegistry.getTransitivePredecessors(webProfile).map(r => [r.capability, r.status])).toEqual(native.webRequires)
    expect(warningsPosted).toEqual([])
  })
  it('covers the capabilities the pinned build says it covers', () => {
    expect(Object.fromEntries(Object.keys(native.webCovers).map(cap =>
      [cap, ProfileRegistry.coversCapabilities(webProfile, [cap])]))).toEqual(native.webCovers)
  })
  it('reads the scene claims as the pinned ClaimsAPI does', async () => {
    const stage = await openClaims()
    try {
      for (const [path, expected] of Object.entries<any>(native.claims)) {
        const api = new ClaimsAPI(stage.getPrim(path)!)
        const results: { capability: string, status: string }[] = []
        expect({
          usages: api.getCapabilityUsages(),
          profiles: api.getCompatibleProfiles().sort(),
          isCompatibleWithWeb: [api.isCompatibleWith(webProfile, results as never), results.map(r => [r.capability, r.status])],
        }, path).toEqual(expected)
      }
    } finally { stage.dispose() }
  })
})

describe('profile compatibility diagnostics on stage open', () => {
  it('warns once per uncovered claimed capability, with the strongest claim, and per uncovered claimed profile', async () => {
    const stage = await openClaims()
    try {
      const warnings = profileCompatibilityWarnings(stage)
      // The capabilities warned about are exactly the claimed ones the
      // pinned registry reports NoPath for.
      const claimed = new Set(Object.values<any>(native.claims).flatMap(claim => Object.keys(claim.usages)))
      const uncovered = [...claimed].filter(cap => native.webCovers[cap] === QueryStatus.NoPath).sort()
      expect(uncovered).toEqual(['usd.core.colorspace', 'vnd.example.hair'])
      expect(warnings).toEqual([
        `Capability 'usd.core.colorspace' (hard), claimed by </Asset>, </Asset/Child>, is not covered by profile typescript-usd.web: the scene may display incorrectly.`,
        `Capability 'vnd.example.hair' (enhancement), claimed by </Asset>, is not covered by profile typescript-usd.web (the capability is not registered): the scene may display without that enhancement.`,
        `Profile 'vnd.example.mobile_v1', claimed by </Asset>, is not registered; its requirements were not checked.`,
        `Profile 'vnd.example.review', claimed by </Asset>, requires capabilities profile typescript-usd.web does not cover: usd.core.colorspace.`,
      ])
      expect(native.reviewRequires.filter(([cap]: string[]) => native.webCovers[cap!] === QueryStatus.NoPath).map(([cap]: string[]) => cap))
        .toEqual(['usd.core.colorspace'])
    } finally { stage.dispose() }
  })

  it('is silent for a scene whose claims are covered, or that makes none', async () => {
    expect(native.claims['/Covered'].isCompatibleWithWeb[0]).toBe(QueryStatus.ValidPath)
    const covered = Stage.createNew()
    const api = ClaimsAPI.Apply(covered.definePrim('/Covered'))
    for (const [capability, degradationClass] of Object.entries<string>(native.claims['/Covered'].usages)) {
      api.setCapabilityUsage(capability, degradationClass)
    }
    for (const profile of native.claims['/Covered'].profiles) api.setProfileCompatible(profile)
    try {
      expect(api.isCompatibleWith(webProfile)).toBe(QueryStatus.ValidPath)
      expect(profileCompatibilityWarnings(covered)).toEqual([])
    } finally { covered.dispose() }
    const plain = await Stage.open(Layer.createInMemory('plain.usda', '#usda 1.0\ndef Xform "World" {}\n'))
    try { expect(profileCompatibilityWarnings(plain)).toEqual([]) } finally { plain.dispose() }
  })

  it('says the claims were not checked when the profile is not registered', async () => {
    const stage = await openClaims()
    try {
      expect(profileCompatibilityWarnings(stage, 'vnd.example.unregistered')).toEqual([
        'Profile vnd.example.unregistered is not registered, so the capability claims of 3 prim(s) were not checked.',
      ])
    } finally { stage.dispose() }
  })
})
