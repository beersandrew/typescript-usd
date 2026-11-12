// Ported from OpenUSD 26.11.1: pxr/usd/usd/instanceKey.cpp,
//  pxr/usd/usd/instanceKey.h, pxr/usd/usd/clipSetDefinition.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Usd_InstanceKey (pxr/usd/usd/instanceKey.h:32-61, instanceKey.cpp:84-110):
// instancing identity combines the Pcp instance key with the Usd-level state
// a shared prototype's composition depends on — the composed clip-set
// definitions affecting the prim index
// (Usd_ComputeClipSetDefinitionsForPrimIndex, clipSetDefinition.cpp:480),
// the stage load rules made relative to the prim (_MakeLoadRulesRelativeTo,
// instanceKey.cpp:42-82), and the population mask made relative to the prim
// (_MakeMaskRelativeTo, instanceKey.cpp:22-40). Instances that differ in
// clips, payload load state, or masking must not share a prototype.

import { pcpInstanceKey, PrimIndex as PcpPrimIndex } from 'typescript-usd/pcp'
import {
  computeClipSetDefinitionsForPrimIndex,
} from './clipSetDefinition.ts'
import { StageLoadRules, type StageLoadRuleEntry } from './stageLoadRules.ts'
import { StagePopulationMask } from './stagePopulationMask.ts'

export function usdInstanceKey(
  index: PcpPrimIndex,
  loadRules?: StageLoadRules,
  mask?: StagePopulationMask,
): string | null {
  const pcpKey = pcpInstanceKey(index)
  if (pcpKey === null) return null
  const clips = clipDefinitionsIdentity(index)
  const rules = loadRules
    ? relativeLoadRulesIdentity(index.path, loadRules)
    : ''
  // No mask means the whole stage populates — All() relative to any prim is
  // still All() (instanceKey.cpp:97-103).
  const relativeMask = mask
    ? JSON.stringify(maskRelativeTo(index.path, mask).getPaths())
    : 'all'
  return `${pcpKey}\u0000clips=${clips}\u0000load=${rules}\u0000mask=${relativeMask}`
}

// Stable per-object identity for layer stacks: a clip-set definition's
// source is its layer STACK, not a file path — distinct stacks that happen
// to share a layer identifier must not conflate (Usd_ClipSetDefinition
// equality compares sourceLayerStack identity, clipSetDefinition.h:49).
let nextObjectId = 0
const objectIds = new WeakMap<object, number>()
function identityOf(value: object): number {
  let id = objectIds.get(value)
  if (id === undefined) { id = ++nextObjectId; objectIds.set(value, id) }
  return id
}

// The composed clip-set definitions this index resolves clips through —
// key-wise strongest-wins dictionaries with template fields expanded, so
// weaker authored data with no composed effect does not split prototypes.
// Identity per definition: set name, source layer stack (object identity),
// source prim path, the composed definition value, and the node's
// cumulative time offset.
function clipDefinitionsIdentity(index: PcpPrimIndex): string {
  const definitions = computeClipSetDefinitionsForPrimIndex(index)
  if (!definitions) return ''
  return definitions.map(definition =>
    `${definition.name}|ls${identityOf(definition.sourceLayerStack)}`
    + `|${definition.sourcePrimPath}`
    + `|li${definition.indexOfLayerWhereAssetPathsFound}`
    + `|${JSON.stringify(definition.def)}`
    + `|${definition.timeOffset.offset}:${definition.timeOffset.scale}`,
  ).join(';')
}

// _MakeLoadRulesRelativeTo (instanceKey.cpp:42-82): the effective rule AT
// the prim becomes the root rule, rules beneath the prim are re-anchored to
// the absolute root, everything else drops, and the result is minimized —
// so instances whose subtrees carry equivalent load state key identically
// regardless of where they sit in namespace.
function relativeLoadRulesIdentity(path: string, rules: StageLoadRules): string {
  const rootRule = rules.getEffectiveRuleForPath(path)
  const prefix = `${path}/`
  const relativeEntries: StageLoadRuleEntry[] = [['/', rootRule]]
  for (const [rulePath, rule] of rules.getRules()) {
    if (rulePath !== path && rulePath.startsWith(prefix)) {
      relativeEntries.push([`/${rulePath.slice(prefix.length)}`, rule])
    }
  }
  const relative = new StageLoadRules()
  relative.setRules(relativeEntries)
  relative.minimize()
  return JSON.stringify(relative.getRules())
}

// _MakeMaskRelativeTo (instanceKey.cpp:22-40): mask paths at or beneath the
// prim re-anchor to the absolute root; every other path drops — including
// mask paths ABOVE the prim (instances under a fully-included subtree all
// reduce to the same empty relative mask, composing identical unmasked
// prototype content).
function maskRelativeTo(path: string, mask: StagePopulationMask): StagePopulationMask {
  const prefix = `${path}/`
  const relative: string[] = []
  for (const maskPath of mask.getPaths()) {
    if (maskPath === path) relative.push('/')
    else if (maskPath.startsWith(prefix)) relative.push(`/${maskPath.slice(prefix.length)}`)
  }
  return new StagePopulationMask(relative)
}
