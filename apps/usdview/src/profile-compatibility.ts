// Ported from OpenUSD 26.11.1: pxr/usd/usdProfiles/claimsAPI.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Checks a stage's UsdProfilesClaimsAPI claims (OpenUSD 26.11.1
// usdProfiles/claimsAPI.h) against this viewer's capability profile, which
// public/plugins/typescript-usd-web-profile/plugInfo.json registers. A scene
// that records no claims gets no diagnostics: an absent claim says nothing
// about what a scene needs.
import type { Stage } from 'typescript-usd/usd'
import { ClaimsAPI, ProfileRegistry, QueryStatus, Tokens, type CapabilityResult } from 'typescript-usd/usdProfiles'

/** The profile node this viewer's plugin declares. */
export const webProfile = 'typescript-usd.web'
/** Where the viewer serves that plugin, relative to the viewer's root
 *  (app-root.ts). */
export const webProfilePlugInfo = './plugins/typescript-usd-web-profile/plugInfo.json'

// usdProfiles/userDoc/overview.md: "When different claim strengths are made
// on the same capability ... the strongest claim applies."
const strength = (degradationClass: string): number =>
  ([Tokens.enhancement, Tokens.soft, Tokens.hard] as readonly string[]).indexOf(degradationClass)

const consequence: Record<string, string> = {
  [Tokens.hard]: 'the scene may display incorrectly',
  [Tokens.soft]: 'the scene may display in a degraded form',
  [Tokens.enhancement]: 'the scene may display without that enhancement',
}

const listPaths = (paths: readonly string[]): string => {
  const shown = paths.slice(0, 3).map(path => `<${path}>`).join(', ')
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown
}

interface Claim { degradationClass: string, paths: string[] }

/**
 * One warning per claimed capability the profile does not cover, and per
 * claimed profile whose requirements it does not cover. Empty when the stage
 * has no ClaimsAPI prims or every claim is covered.
 */
export function profileCompatibilityWarnings(stage: Stage, profile = webProfile): string[] {
  const usages = new Map<string, Claim>()
  const profiles = new Map<string, { exceptions: Set<string>, paths: string[] }>()
  let claimants = 0
  for (const path of stage.traverse()) {
    const prim = stage.getPrim(path)
    if (!prim?.hasAPI(Tokens.ClaimsAPI)) continue
    claimants++
    const api = new ClaimsAPI(prim)
    for (const [capability, value] of Object.entries(api.getCapabilityUsages())) {
      const degradationClass = typeof value === 'string' ? value : ''
      const claim = usages.get(capability) ?? { degradationClass, paths: [] }
      if (strength(degradationClass) > strength(claim.degradationClass)) claim.degradationClass = degradationClass
      claim.paths.push(path)
      usages.set(capability, claim)
    }
    for (const claimed of api.getCompatibleProfiles()) {
      const entry = profiles.get(claimed) ?? { exceptions: new Set(api.getProfileExceptions(claimed)), paths: [] }
      entry.paths.push(path)
      profiles.set(claimed, entry)
    }
  }
  if (claimants === 0) return []
  if (!ProfileRegistry.hasCapability(profile)) {
    return [`Profile ${profile} is not registered, so the capability claims of ${claimants} prim(s) were not checked.`]
  }

  const warnings: string[] = []
  for (const [capability, claim] of usages) {
    const status = ProfileRegistry.coversCapabilities(profile, [capability])
    if (status === QueryStatus.ValidPath || status === QueryStatus.DeprecationConflict) continue
    const known = ProfileRegistry.resolveCapability(capability) !== ''
    const cls = claim.degradationClass || '(no class)'
    const effect = consequence[claim.degradationClass] ?? 'the scene may display incorrectly'
    warnings.push(status === QueryStatus.Deprecated
      ? `Capability '${capability}' (${cls}), claimed by ${listPaths(claim.paths)}, is covered by profile ${profile} only through a deprecated path.`
      : `Capability '${capability}' (${cls}), claimed by ${listPaths(claim.paths)}, is not covered by profile ${profile}` +
        `${known ? '' : ' (the capability is not registered)'}: ${effect}.`)
  }
  for (const [claimed, entry] of profiles) {
    if (claimed === profile) continue
    if (!ProfileRegistry.hasCapability(ProfileRegistry.resolveCapability(claimed))) {
      warnings.push(`Profile '${claimed}', claimed by ${listPaths(entry.paths)}, is not registered; its requirements were not checked.`)
      continue
    }
    // The claimed profile's requirements are its transitive predecessors,
    // less the exceptions the claim lists.
    const required = ProfileRegistry.getTransitivePredecessors(ProfileRegistry.resolveCapability(claimed))
      .map(result => result.capability)
      .filter(capability => !entry.exceptions.has(capability))
    if (required.length === 0) continue
    const results: CapabilityResult[] = []
    ProfileRegistry.coversCapabilities(profile, required, [], results)
    const missing = results.filter(result => result.status === QueryStatus.NoPath || result.status === QueryStatus.CycleFound)
      .map(result => result.capability)
    if (missing.length > 0) {
      warnings.push(`Profile '${claimed}', claimed by ${listPaths(entry.paths)}, requires capabilities profile ${profile} does not cover: ${missing.join(', ')}.`)
    }
  }
  return warnings
}
