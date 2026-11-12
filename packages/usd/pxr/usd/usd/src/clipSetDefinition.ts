// Ported from OpenUSD 26.11.1: pxr/usd/usd/clipSetDefinition.cpp,
//  pxr/usd/usd/clipSetDefinition.h, pxr/usd/usd/clip.cpp,
//  pxr/usd/usd/clipSet.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Value clips — the Usd_ClipSet / Usd_Clip subset backing clip-based value
// resolution (upstream pxr/usd/usd/clip.cpp, clipSet.cpp, clipSetDefinition.cpp).
//
// Clip-set definitions are read from the composed `clips` metadata dict and
// their clip/manifest layers are acquired during asynchronous Stage.open.
// Prepared clip sets are retained by Stage per source prim index; the Usd
// resolver selects a clip and evaluates its property synchronously at query
// time.

import type { SdfPath } from 'typescript-usd/sdf/path'
import {
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  LayerStack as PcpLayerStack,
  Node as PcpNode,
  PrimIndex as PcpPrimIndex,
  pcpLayerPathKey,
  pcpNodeGetNonVariantPathElementCount,
  _pcpReadField,
} from 'typescript-usd/pcp'
import { usdInterpolateSamples } from './interpolators.ts'
import type { UsdInterpolation } from './interpolation.ts'
import {
  sdfLayerOffsetApply, sdfLayerOffsetCompose, sdfLayerOffsetInverse, type SdfLayerOffset,
} from 'typescript-usd/sdf/layerOffset'

const IDENTITY_OFFSET: SdfLayerOffset = { offset: 0, scale: 1 }
import { sdfApplyListOpToVector, sdfNormalizeListOp } from 'typescript-usd/sdf'
import { ValueBlock as SdfValueBlock } from 'typescript-usd/sdf'
import {
  _sdfCreateLayerIdentifier, _sdfIsDictionary, _sdfSplitLayerIdentifier,
} from 'typescript-usd/sdf/_internal'
import { RaiseWarning as TfRaiseWarning } from 'typescript-usd/tf'
import { Vec2d as GfVec2d } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'

// A (stageTime, value) knot pair as authored in `active`/`times`.
interface ClipDefDict {
  assetPaths?: string[]
  primPath?: string
  manifestAssetPath?: string
  active?: [number, number][]
  times?: [number, number][]
  interpolateMissingClipValues?: boolean
  templateAssetPath?: string
  templateStartTime?: number
  templateEndTime?: number
  templateStride?: number
  templateActiveOffset?: number
  // The template's derived clips, before the asset-existence check.
  templateClips?: UsdTemplateClipDerivation
}

// _DefaultClipOffsetValue (clipSetDefinition.cpp:25-27): templateActiveOffset
// was not authored.
const DEFAULT_CLIP_OFFSET = Number.MAX_VALUE

/**
 * One clip a template may name: the asset path derived for a template time,
 * with the clip time and activation time it gets if the asset exists.
 */
export interface UsdTemplateClipCandidate {
  assetPath: string
  clipTime: number
  activeTime: number
}

/**
 * _DeriveClipInfo's result before the asset-existence check: the candidate
 * clips in template-time order and, with templateActiveOffset, the extra
 * times knots it adds before the first and after the last template time.
 */
export interface UsdTemplateClipDerivation {
  candidates: UsdTemplateClipCandidate[]
  leadingTime?: number
  trailingTime?: number
}

// printf("%0Nd", int(t)) and the digits after '.' of printf("%.0Mf", t)
// (_DeriveClipTimeString, clipSetDefinition.cpp:110-139).
function deriveClipTimeString(
  clipTime: number, numIntegerHashes: number, numDecimalHashes: number,
): { integerPortion: string; decimalPortion: string } {
  const integer = Math.trunc(clipTime)
  const digits = String(Math.abs(integer)).padStart(
    Math.max(0, numIntegerHashes - (integer < 0 ? 1 : 0)), '0')
  const integerPortion = (integer < 0 ? '-' : '') + digits
  let decimalPortion = ''
  if (numDecimalHashes !== 0) {
    const stringRep = clipTime.toFixed(numDecimalHashes)
    decimalPortion = stringRep.slice(stringRep.indexOf('.') + 1)
  }
  return { integerPortion, decimalPortion }
}

// _DeriveClipInfo (clipSetDefinition.cpp:141-306): the clip asset paths,
// times and activations a template names. Upstream keeps a template time
// only if its asset resolves (:272-287); resolving is asynchronous here, so
// this lists every candidate and resolveClipSetsForPrimIndex (clipSet.ts)
// keeps those that open, numbering the activations as upstream does.
export function deriveTemplateClips(
  templateAssetPath: string, stride: number, activeOffset: number,
  startTimeCode: number, endTimeCode: number, usdPrimPath: string,
): UsdTemplateClipDerivation | undefined {
  if (stride <= 0) {
    TfRaiseWarning(`Invalid templateStride ${stride} for prim <${usdPrimPath}>. ` +
      'templateStride must be greater than 0.')
    return undefined
  }
  const activeOffsetProvided = activeOffset !== DEFAULT_CLIP_OFFSET
  if (activeOffsetProvided && Math.abs(activeOffset) > stride) {
    TfRaiseWarning(`Invalid templateActiveOffset ${activeOffset} for prim <${usdPrimPath}>. ` +
      `Absolute value of templateActiveOffset must not exceed templateStride ${stride}.`)
    return undefined
  }
  const { assetPath: templateLayerPath, args } = _sdfSplitLayerIdentifier(templateAssetPath)
  const slash = templateLayerPath.lastIndexOf('/')
  const dir = slash < 0 ? '' : templateLayerPath.slice(0, slash + 1)
  const basename = templateLayerPath.slice(slash + 1)
  // TfStringTokenize drops empty tokens.
  const tokenizedBasename = basename.split('.').filter(token => token !== '')
  let integerHashSectionIndex = -1, decimalHashSectionIndex = -1
  let numIntegerHashes = 0, numDecimalHashes = 0, matchingGroups = 0
  tokenizedBasename.forEach((token, tokenIndex) => {
    if (![...token].every(c => c === '#')) return
    if (integerHashSectionIndex === -1) {
      numIntegerHashes = token.length
      integerHashSectionIndex = tokenIndex
    } else {
      numDecimalHashes = token.length
      decimalHashSectionIndex = tokenIndex
    }
    matchingGroups++
  })
  if ((matchingGroups !== 1 && matchingGroups !== 2) ||
      (matchingGroups === 2 && integerHashSectionIndex !== decimalHashSectionIndex - 1)) {
    TfRaiseWarning(`Invalid templateAssetPath '${templateAssetPath}' for prim <${usdPrimPath}>. ` +
      'It must be of the form path/basename.###.usd or path/basename.###.###.usd. ' +
      'Note that the number of hash marks is variable in each group.')
    return undefined
  }
  if (startTimeCode > endTimeCode) {
    TfRaiseWarning(`Invalid time range specified for prim <${usdPrimPath}>. ` +
      `templateEndTime (${endTimeCode}) cannot be greater than templateStartTime (${startTimeCode}).`)
    return undefined
  }

  // Template times are stepped in the integer range so that fractional
  // strides accumulate as upstream's do (:236-241).
  const promotion = 10000
  const derivation: UsdTemplateClipDerivation = { candidates: [] }
  if (activeOffsetProvided) {
    derivation.leadingTime =
      (startTimeCode * promotion - Math.abs(activeOffset) * promotion) / promotion
  }
  for (let t = startTimeCode * promotion; t <= endTimeCode * promotion; t += stride * promotion) {
    const clipTime = t / promotion
    const { integerPortion, decimalPortion } =
      deriveClipTimeString(clipTime, numIntegerHashes, numDecimalHashes)
    tokenizedBasename[integerHashSectionIndex] = integerPortion
    if (decimalPortion !== '') tokenizedBasename[decimalHashSectionIndex] = decimalPortion
    derivation.candidates.push({
      assetPath: _sdfCreateLayerIdentifier(dir + tokenizedBasename.join('.'), args),
      clipTime,
      activeTime: activeOffsetProvided ? (t + activeOffset * promotion) / promotion : clipTime,
    })
  }
  if (activeOffsetProvided) {
    derivation.trailingTime =
      (endTimeCode * promotion + Math.abs(activeOffset) * promotion) / promotion
  }
  return derivation
}

// Per-layer memo: does this layer author clip metadata anywhere? Keeps the
// per-prim node×layer×ancestor scan below from touching layers that can never
// contribute (the common case — clip-less scenes pay one spec sweep per
// layer). A layer authoring ONLY a clipSets list-op still participates: a
// stronger layer can delete or reorder clip sets introduced by weaker ones
// (clipSetDefinition.cpp:481-484 applies the op with no clips dict present).
const layerAuthorsClips = new WeakMap<object, boolean>()

/** @internal Change-processing hook; kept out of the package barrel. */
export function _invalidateLayerAuthorsClips(layer: PcpLayer): void {
  // UsdStage invalidates its clip cache for every recomposed prim
  // (stage.cpp:5089-5095; clipCache.cpp:349-389). This memo is a narrower
  // layer-scan accelerator, so dropping the changed layer's entry at the Sdf
  // mutation boundary gives it the same lifetime without discarding the
  // unchanged common-case cache.
  layerAuthorsClips.delete(layer)
}

function authorsClips(layer: PcpLayer): boolean {
  let v = layerAuthorsClips.get(layer)
  if (v === undefined) {
    v = layer.getSpecPaths().some((p) =>
      _pcpReadField(layer, p, 'clips') !== undefined
      || _pcpReadField(layer, p, 'clipSets') !== undefined)
    layerAuthorsClips.set(layer, v)
  }
  return v
}

// The site of a node's namespace ancestor `level` prims up, with the prim
// names below it: for node path /A{v=x}B and level 1, /A{v=x} and "/B". A
// variant selection path stands for its prim (PcpPrimIndex of /A holds the
// variant node at /A{v=x}), so only prim names count as levels.
function nodeSiteAtLevel(path: SdfPath, level: number): { path: SdfPath; tail: string } | undefined {
  let p = path
  let tail = ''
  for (let i = 0; i < level; i++) {
    while (p.isPrimVariantSelectionPath()) p = p.getParentPath()
    const parent = p.getParentPath()
    if (parent.isAbsoluteRootPath()) return undefined
    tail = '/' + p.name + tail
    p = parent
  }
  return { path: p, tail }
}

// The composed clip-set DEFINITIONS for a prim index — the synchronous half
// of clip resolution and the exact facts Usd_InstanceKey hashes
// (Usd_ComputeClipSetDefinitionsForPrimIndex, clipSetDefinition.cpp:537-676,
// _ResolveClipSetsInNode :406-533). Per node, layers compose WEAK to STRONG:
// dictionaries overlay recursively stronger-over-weaker, authored set names
// auto-add (sorted) and the layer's clipSets list-op filters/orders the
// added names. The anchor — source layer stack, prim path, and the index of
// the layer providing asset paths — is the STRONGEST site with assetPaths
// or templateAssetPath opinions (_RecordAnchorInfo :364-404); anchor-less
// sets drop. Active and times stay in layer time: the clip set's offset to
// the stage is the offset of the layer with the strongest active (or the
// template asset path), and the stage applies it at query time. Template
// fields expand from the fully composed dictionary, and definitions order
// by (source site, clipSets order) — never authored-text order.
//
// A prim's own clip sets are composed from its own sites only; clip sets
// authored on namespace ancestors follow, weaker, nearest ancestor first, each
// composed and ordered at the ancestor (Usd_ClipCache::PopulateClipsForPrim,
// clipCache.cpp:191-240, appends the nearest ancestor's clips after the
// prim's). A clip set of an ancestor applies to descendant attributes under
// its source prim path (_ClipsApplyToNode, stage.cpp:7183-7190); `tail` is
// the descendant's path below that source prim.
export interface UsdClipSetDefinition {
  name: string
  def: ClipDefDict
  anchorLayer: PcpLayer
  sourceLayerStack: PcpLayerStack
  sourcePrimPath: string
  indexOfLayerWhereAssetPathsFound: number
  tail: string
  position: [number, number]
  layerStackOrder: number
  // Usd_ClipSetDefinition::toStageOffset (clipSetDefinition.cpp:613): maps
  // the clip set's active and times (layer time) to stage time.
  timeOffset: SdfLayerOffset
  // The offset of the layer with the strongest times; differs from
  // timeOffset only when times were authored under another layer offset.
  timesOffset: SdfLayerOffset
}

interface ClipSetAnchor {
  layer: PcpLayer
  layerStack: PcpLayerStack
  primPath: string
  layerIdx: number
  nodeIdx: number
  tail: string
  // _AnchorInfo (clipSetDefinition.cpp:308-337): the layer whose offset maps
  // the clip set to the stage (the strongest active for non-template
  // clips, the template asset path's layer otherwise), the layer of the
  // strongest times, and the offsets computed from them.
  offsetLayerIdx: number
  timesOffsetLayerIdx: number
  offset: SdfLayerOffset
  timesOffset: SdfLayerOffset
}

function overlayRecursive(weak: unknown, strong: unknown): unknown {
  if (strong === undefined) return weak
  if (weak === undefined) return strong
  if (_sdfIsDictionary(weak) && _sdfIsDictionary(strong)) {
    const out: Record<string, unknown> = { ...(weak as Record<string, unknown>) }
    for (const [key, value] of Object.entries(strong as Record<string, unknown>)) {
      out[key] = overlayRecursive(out[key], value)
    }
    return out
  }
  return strong
}

// The authored clip fields (VtVec2dArray active/times, VtArray<SdfAssetPath>
// assetPaths, clipSetDefinition.h) as the plain lists this module computes on.
function clipDefFromDict(raw: unknown): ClipDefDict {
  const def = { ...(raw as Record<string, unknown>) }
  for (const key of ['active', 'times'] as const) {
    const value = def[key]
    if (value instanceof VtArray) {
      def[key] = value.toArray().map(pair => {
        const c = pair instanceof GfVec2d ? pair.data : pair as readonly number[]
        return [c[0], c[1]]
      })
    }
  }
  if (def['assetPaths'] instanceof VtArray) def['assetPaths'] = def['assetPaths'].toArray().map(String)
  return def as ClipDefDict
}

// _ApplyOffsetToTimes (clipSetDefinition.cpp:68-94): when the clip times
// were authored under a different layer offset than the clip set's, bake
// `timesOffset * offset.inverse` into their stage times.
export function applyOffsetToClipTimes(
  offset: SdfLayerOffset, timesOffset: SdfLayerOffset, times: [number, number][],
): [number, number][] {
  if (offset.offset === timesOffset.offset && offset.scale === timesOffset.scale) return times
  const inverse = sdfLayerOffsetInverse(offset)
  if (!inverse) return times
  const xf = sdfLayerOffsetCompose(timesOffset, inverse)
  return times.map(([external, internal]) => [sdfLayerOffsetApply(xf, external), internal])
}

// Usd_ComputeClipSetDefinitionsForPrimIndex (clipSetDefinition.cpp:537-676)
// proper: only the clip sets authored at the index's own node sites
// (_ResolveClipSetsInNode reads the clips field at node.GetPath(),
// clipSetDefinition.cpp:406-427). This is what Usd_InstanceKey hashes
// (instanceKey.cpp:89); clips authored on namespace ancestors are not part
// of it.
export function computeClipSetDefinitionsForPrimIndex(
  index: PcpPrimIndex,
): UsdClipSetDefinition[] | undefined {
  const definitions = clipSetDefinitionsAtLevel(index, 0, index.getRootNode().path.pathString)
  return definitions.length > 0 ? definitions : undefined
}

// The clip sets that affect a prim (Usd_ClipCache::PopulateClipsForPrim,
// clipCache.cpp:191-240): its own, then each namespace ancestor's, nearest
// first. Upstream finds ancestral clips by the prim's STAGE path, so a prim
// inside a prototype sees only ancestors below the prototype root (the
// prototype prim itself has an empty prim index and no clips,
// stage.cpp:3487-3494); `maxLevel` bounds the walk for such prims.
export function computeClipSetDefinitionsForPrimAndAncestors(
  index: PcpPrimIndex, maxLevel = Infinity,
): UsdClipSetDefinition[] | undefined {
  const rootPath = index.getRootNode().path
  const definitions: UsdClipSetDefinition[] = []
  // clipCache.cpp:206-229: the prim's own clips, then each ancestor's.
  for (let level = 0; level <= maxLevel; level++) {
    const primSite = nodeSiteAtLevel(rootPath, level)
    if (!primSite) break
    definitions.push(...clipSetDefinitionsAtLevel(index, level, primSite.path.pathString))
  }
  return definitions.length > 0 ? definitions : undefined
}

// Usd_ComputeClipSetDefinitionsForPrimIndex (clipSetDefinition.cpp:537-676)
// for the namespace ancestor `level` prims above the index's prim (0: the
// prim itself), read through this index's nodes. A node contributes to an
// ancestor only when the ancestor's prim index has it: the root node, and
// arcs introduced at or above the ancestor (PcpNodeRef::
// GetDepthBelowIntroduction, pcp/node.cpp:324-333).
function clipSetDefinitionsAtLevel(
  index: PcpPrimIndex, level: number, usdPrimPath: string,
): UsdClipSetDefinition[] {
  interface Composed { def: ClipDefDict; anchor?: ClipSetAnchor; layerStackOrder: number }
  const composed = new Map<string, Composed>()

  let nodeIdx = -1
  for (const node of index.getNodeRange() as Iterable<PcpNode>) {
    nodeIdx++
    if (!node.canContributeSpecs()) continue
    if (level > 0 && !node.isRootNode() && node.getDepthBelowIntroduction() < level) continue
    const layers = node.layerStack.layers
    if (!layers.some(entry => authorsClips(entry.layer))) continue
    const site = nodeSiteAtLevel(node.path, level)
    if (!site) continue
    const primPath = pcpLayerPathKey(site.path)
    const tail = site.tail
    const nodeOffset = node.mapToRoot.evaluate().getTimeOffset()

    // _ResolveClipSetsInNode (clipSetDefinition.cpp:406-533).
    const setsInNode = new Map<string, { def: ClipDefDict; anchor?: ClipSetAnchor }>()
    let addedClipSets: string[] = []
    // Layers weak to strong (clipSetDefinition.cpp:423).
    for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx--) {
      const layerEntry = layers[layerIdx]!
      const layer = layerEntry.layer
      if (!authorsClips(layer)) continue
      const dict = layer.getField(primPath, 'clips') as Record<string, ClipDefDict> | undefined
      if (dict) {
        const namesInLayer: string[] = []
        for (const [name, rawDef] of Object.entries(dict)) {
          const contribution = clipDefFromDict(rawDef)
          // _RecordAnchorInfo (clipSetDefinition.cpp:364-404).
          const entry = setsInNode.get(name) ?? { def: {} }
          if (contribution.assetPaths || typeof contribution.templateAssetPath === 'string') {
            entry.anchor = {
              layer, layerStack: node.layerStack, primPath,
              layerIdx, nodeIdx, tail,
              offsetLayerIdx: layerIdx, timesOffsetLayerIdx: layerIdx,
              offset: IDENTITY_OFFSET, timesOffset: IDENTITY_OFFSET,
            }
          }
          if (entry.anchor) {
            if (contribution.active && typeof entry.def.templateAssetPath !== 'string') {
              entry.anchor.offsetLayerIdx = layerIdx
            }
            if (contribution.times) entry.anchor.timesOffsetLayerIdx = layerIdx
          }
          entry.def = overlayRecursive(entry.def, contribution) as ClipDefDict
          setsInNode.set(name, entry)
          namesInLayer.push(name)
        }
        // The sets named in this layer's clips dictionary are added as by a
        // clipSets list-op, sorted (clipSetDefinition.cpp:468-478).
        // SdfListOp::SetAddedItems: a name already added keeps its place.
        addedClipSets = sdfApplyListOpToVector(addedClipSets, {
          addedItems: [...new Set(namesInLayer)].sort(),
        })
      }
      // Then the layer's clipSets list-op (clipSetDefinition.cpp:481-484).
      const clipSetsOp = layer.getField(primPath, 'clipSets')
      if (clipSetsOp !== undefined) {
        const normalized = sdfNormalizeListOp<string>(clipSetsOp)
        if (normalized) addedClipSets = sdfApplyListOpToVector(addedClipSets, normalized)
      }
    }
    // _GetLayerOffsetToRoot (clipSetDefinition.cpp:32-66) for the anchor's
    // offset layer; clip times authored under another layer's offset are
    // transformed (clipSetDefinition.cpp:508-530).
    for (const nodeSet of setsInNode.values()) {
      const anchor = nodeSet.anchor
      if (!anchor) continue
      const layerToRoot = (idx: number) => sdfLayerOffsetCompose(nodeOffset, layers[idx]!.offset)
      anchor.offset = layerToRoot(anchor.offsetLayerIdx)
      anchor.timesOffset = anchor.offset
      if (nodeSet.def.times && anchor.offsetLayerIdx !== anchor.timesOffsetLayerIdx) {
        anchor.timesOffset = layerToRoot(anchor.timesOffsetLayerIdx)
        nodeSet.def = {
          ...nodeSet.def, times: applyOffsetToClipTimes(anchor.offset, anchor.timesOffset, nodeSet.def.times),
        }
      }
    }

    // Filter sets the clipSets list-op removed; record ordering
    // (clipSetDefinition.cpp:487-506).
    for (const [name, nodeSet] of setsInNode) {
      const orderIdx = addedClipSets.indexOf(name)
      if (orderIdx < 0) continue
      let target = composed.get(name)
      if (!target) {
        target = { def: {}, layerStackOrder: orderIdx }
        composed.set(name, target)
      }
      // Nodes iterate strong to weak: the first anchor wins, and stronger
      // composed state overlays this node's (clipSetDefinition.cpp:546-561).
      if (!target.anchor && nodeSet.anchor) {
        target.anchor = nodeSet.anchor
        target.layerStackOrder = orderIdx
      }
      target.def = overlayRecursive(nodeSet.def, target.def) as ClipDefDict
    }
  }

  const definitions: UsdClipSetDefinition[] = []
  for (const [name, entry] of composed) {
    // Anchor-less sets drop (clipSetDefinition.cpp:563-573).
    if (!entry.anchor) continue
    let def = entry.def
    // _ComputeClipSetDefinitionsForPrimIndex (clipSetDefinition.cpp:617-
    // 671): explicit assetPaths win; otherwise a template derives the clips
    // when templateStride, templateStartTime and templateEndTime are all
    // authored. The anchor's layer offset applies to the derived times when
    // the clips are resolved (resolveClipSetsForPrimIndex).
    if (!def.assetPaths && typeof def.templateAssetPath === 'string') {
      const { templateStride, templateStartTime, templateEndTime } = def
      if (typeof templateStride === 'number' && typeof templateStartTime === 'number' &&
          typeof templateEndTime === 'number') {
        const derived = deriveTemplateClips(
          def.templateAssetPath, templateStride,
          typeof def.templateActiveOffset === 'number' ? def.templateActiveOffset : DEFAULT_CLIP_OFFSET,
          templateStartTime, templateEndTime, usdPrimPath)
        // Authored active and times apply only with explicit assetPaths.
        const { active: _active, times: _times, ...templated } = def
        def = templated
        if (derived) def.templateClips = derived
      }
    }
    definitions.push({
      name, def,
      anchorLayer: entry.anchor.layer,
      sourceLayerStack: entry.anchor.layerStack,
      sourcePrimPath: entry.anchor.primPath,
      indexOfLayerWhereAssetPathsFound: entry.anchor.layerIdx,
      tail: entry.anchor.tail,
      position: [entry.anchor.nodeIdx, entry.anchor.layerIdx],
      layerStackOrder: entry.layerStackOrder,
      timeOffset: entry.anchor.offset,
      timesOffset: entry.anchor.timesOffset,
    })
  }
  // (source layer stack, source prim path, clipSets order)
  // (clipSetDefinition.cpp:579-592) — node strength stands in for the
  // pointer comparison on layer stacks, deterministically.
  definitions.sort((a, b) =>
    a.position[0] - b.position[0]
    || a.sourcePrimPath.localeCompare(b.sourcePrimPath)
    || a.layerStackOrder - b.layerStackOrder
    || (a.name < b.name ? -1 : 1))
  return definitions
}

