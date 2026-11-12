// Ported from OpenUSD 26.11.1: pxr/usd/pcp/mapFunction.cpp,
//  pxr/usd/pcp/mapFunction.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpMapFunction — the namespace + time mapping carried along a composition
// arc. Faithful port of OpenUSD pcp/mapFunction.cpp (USD-mode subset).
//
// A map function is a set of (source -> target) prefix pairs plus a separate
// `hasRootIdentity` flag and an SdfLayerOffset. Mapping a path finds the
// longest source prefix with a pair and replaces it; if no pair matches, the
// root identity (when present) maps the path to itself. The mapping is a
// bijection — a result that would not invert back to the input is BLOCKED
// (returns the empty path), which is how e.g. { / -> /, /_class_Model -> /Model }
// refuses to map /Model (mapFunction.cpp:_Map, the invertibility check).
//
// Paths are the structured SdfPath value type (sdf/path.ts): the variant axis is
// native — SdfPath::ReplacePrefix carries a variant selection wherever its
// decorated namespace prefix survives, so there is no strip/reapply here. The
// block target is the EMPTY path (SdfPath::IsEmpty); a result that maps to empty
// is unmapped/blocked.

import {
  type SdfLayerOffset,
  SDF_LAYER_OFFSET_IDENTITY,
  sdfLayerOffsetCompose,
  sdfLayerOffsetInverse,
  sdfLayerOffsetIsIdentity,
  sdfLayerOffsetEquals,
} from 'typescript-usd/sdf/layerOffset'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathExpression, SdfPathPattern } from 'typescript-usd/sdf/pathExpression'

export type PcpPathPair = readonly [source: SdfPath, target: SdfPath]

const ABS_ROOT = SdfPath.absoluteRootPath
const EMPTY_PATH = SdfPath.emptyPath

function pathElementCount(path: SdfPath): number {
  return path.pathElementCount
}

function pathHasPrefix(path: SdfPath, prefix: SdfPath): boolean {
  // The empty path is no prefix of anything (a block target never matches).
  if (prefix.isEmpty() || path.isEmpty()) return false
  if (prefix.isAbsoluteRootPath()) return path.isAbsolutePath()
  return path.hasPrefix(prefix)
}

// SdfPath::GetParentPath for the prim paths used here: '/A/B' -> '/A',
// '/A' -> '/', and '/' -> emptyPath (matches Sdf: AbsoluteRootPath().
// GetParentPath() is empty, which is what stops _IsRedundant from treating the
// root identity as redundant against itself).
function parentPath(path: SdfPath): SdfPath {
  return path.getParentPath()
}

// The final element ("name token") of a path: '/A/B' -> 'B', '/A' -> 'A'.
function nameToken(path: SdfPath): string {
  return path.name
}

function isAbsoluteRoot(path: SdfPath): boolean {
  return path.isAbsoluteRootPath()
}

function pathEquals(a: SdfPath, b: SdfPath): boolean {
  return a.pathString === b.pathString
}

// _PathPairOrder (mapFunction.cpp:_PathPairOrder): order pairs by SOURCE path
// element count ascending, then by the source path's FastLessThan. The
// length-first ordering is REQUIRED — _GetBestSourceMatch and _Canonicalize both
// rely on sources appearing in non-decreasing depth.
function pathPairOrder(a: PcpPathPair, b: PcpPathPair): number {
  const ca = pathElementCount(a[0])
  const cb = pathElementCount(b[0])
  if (ca !== cb) return ca - cb
  const sa = a[0].pathString
  const sb = b[0].pathString
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function replacePrefix(
  path: SdfPath, oldPrefix: SdfPath, newPrefix: SdfPath, fixTargetPaths = true,
): SdfPath {
  // SdfPath::ReplacePrefix with an empty (block) new prefix yields the empty
  // path: replacing a prefix with "nothing" unmaps the path entirely.
  if (newPrefix.isEmpty()) return EMPTY_PATH
  return path.replacePrefix(oldPrefix, newPrefix, fixTargetPaths)
}

// Index of the pair whose SOURCE is the longest prefix of `path`, or -1.
function bestSourceMatch(path: SdfPath, pairs: readonly PcpPathPair[]): number {
  let best = -1
  let bestCount = -1
  for (let i = 0; i < pairs.length; i++) {
    if (pathHasPrefix(path, pairs[i]![0])) {
      const c = pathElementCount(pairs[i]![0])
      if (c > bestCount) { bestCount = c; best = i }
    }
  }
  return best
}

// Index of the pair whose TARGET is the longest prefix of `path` with at least
// `minCount` elements, or -1. Ties resolve to the later index (matching the
// `count >= bestElementCount` update in mapFunction.cpp:_GetBestTargetMatch).
function bestTargetMatch(path: SdfPath, pairs: readonly PcpPathPair[], minCount = 0): number {
  let best = -1
  let bestCount = minCount
  for (let i = 0; i < pairs.length; i++) {
    const c = pathElementCount(pairs[i]![1])
    if (c >= bestCount && pathHasPrefix(path, pairs[i]![1])) { bestCount = c; best = i }
  }
  return best
}

// True if `targetPath` has a closer inverse match than `bestIdx` — i.e. the
// forward mapping would not invert back, so it must be blocked (the bijection
// guarantee). mapFunction.cpp:_HasBetterTargetMatch.
function hasBetterTargetMatch(
  targetPath: SdfPath, pairs: readonly PcpPathPair[], bestIdx: number, invert: boolean,
): boolean {
  const minCount = bestIdx < 0 ? 0
    : pathElementCount(invert ? pairs[bestIdx]![0] : pairs[bestIdx]![1])
  const other = invert
    ? bestSourceMatchMin(targetPath, pairs, minCount)
    : bestTargetMatch(targetPath, pairs, minCount)
  return other !== -1 && other !== bestIdx
}

// bestSourceMatch variant honoring a minimum source element count (for the
// inverse direction's invertibility check). mapFunction.cpp:_GetBestSourceMatch
// with minElementCount.
function bestSourceMatchMin(path: SdfPath, pairs: readonly PcpPathPair[], minCount: number): number {
  let best = -1
  let bestCount = minCount - 1
  for (let i = 0; i < pairs.length; i++) {
    const c = pathElementCount(pairs[i]![0])
    if (c >= minCount && c > bestCount && pathHasPrefix(path, pairs[i]![0])) {
      bestCount = c; best = i
    }
  }
  return best
}

// _IsRedundant (mapFunction.cpp:_IsRedundant). An entry is redundant when it can
// be removed without changing the correspondence's semantics — i.e. the best
// ANCESTOR mapping (the best source match for the entry source's PARENT, which
// excludes the entry itself) already maps the entry's source to the entry's
// target. Operates on a pairs array already sorted in _PathPairOrder. `idx` is
// the index of the entry under test.
function isRedundant(pairs: readonly PcpPathPair[], idx: number): boolean {
  const entrySource = pairs[idx]![0]
  const entryTarget = pairs[idx]![1]
  const isBlock = entryTarget.isEmpty()

  if (isBlock) {
    // A block is redundant if the source path already wouldn't map without it.
    // Find the best mapping for the source's PARENT (the ancestor mapping this
    // block is blocking).
    const bestIdx = bestSourceMatch(parentPath(entrySource), pairs)
    // No ancestor mapping, or the ancestor is itself a block → redundant.
    if (bestIdx === -1 || pairs[bestIdx]![1].isEmpty()) return true
    // Otherwise the path may still fail to map without the block if the
    // bijection (one-to-one) requirement isn't met (see _Map). Map the block's
    // source as if unblocked, then check for a better inverse match.
    const targetPath = replacePrefix(entrySource, pairs[bestIdx]![0], pairs[bestIdx]![1])
    return hasBetterTargetMatch(targetPath, pairs, bestIdx, /* invert */ false)
  }

  // Normal entry. Redundant only if the best ancestor mapping maps the source
  // to exactly the entry's target. Early out: an entry that RENAMES its source
  // (different name token) can't be redundant.
  if (nameToken(entrySource) !== nameToken(entryTarget)) return false

  const bestIdx = bestSourceMatch(parentPath(entrySource), pairs)
  // No ancestor mapping (or it's a block) → not redundant.
  if (bestIdx === -1 || pairs[bestIdx]![1].isEmpty()) return false

  const bestSrc = pairs[bestIdx]![0]
  const bestTgt = pairs[bestIdx]![1]

  // Early out: if the best match is the root identity, the entry is redundant
  // iff it maps the source to the same path (the / -> / identity already covers
  // any same-path entry like /Model_1 -> /Model_1).
  if (isAbsoluteRoot(bestSrc) && isAbsoluteRoot(bestTgt) && pathEquals(entrySource, entryTarget)) {
    return true
  }

  // Early out: if the ancestor mapping would change namespace depth by a
  // different amount than this entry does, the entry can't be redundant.
  if ((pathElementCount(entryTarget) - pathElementCount(bestTgt)) !==
      (pathElementCount(entrySource) - pathElementCount(bestSrc))) {
    return false
  }

  // Walk source/target ancestors up to the matched source; each name token must
  // agree, i.e. entrySource.ReplacePrefix(bestSrc, bestTgt) == entryTarget.
  let sourceAncestor = parentPath(entrySource)
  let targetAncestor = parentPath(entryTarget)
  while (!pathEquals(sourceAncestor, bestSrc)) {
    if (nameToken(sourceAncestor) !== nameToken(targetAncestor)) return false
    sourceAncestor = parentPath(sourceAncestor)
    targetAncestor = parentPath(targetAncestor)
  }
  if (!pathEquals(bestTgt, targetAncestor)) return false

  // The matched ancestor entry might still not map this path if there's a better
  // inverse for the target (see _Map); then this entry is NOT redundant. Use the
  // target's parent to exclude this entry itself.
  return !hasBetterTargetMatch(parentPath(entryTarget), pairs, bestIdx, /* invert */ false)
}

// _Canonicalize (mapFunction.cpp:_Canonicalize). Given pairs sorted in
// _PathPairOrder, remove every redundant entry and extract the leading root
// identity (/ -> /) into the returned flag (it does not remain in `pairs`).
// Returns the canonical pairs plus hasRootIdentity.
function canonicalize(sorted: PcpPathPair[]): { pairs: PcpPathPair[]; hasRootIdentity: boolean } {
  const pairs = sorted.slice()
  // Drop redundant entries. _IsRedundant inspects the live array (sans this
  // entry, via the parent-path lookups), so removing in place as we go matches
  // C++'s std::move-down erase.
  for (let i = 0; i < pairs.length; /* advance below */) {
    if (isRedundant(pairs, i)) pairs.splice(i, 1)
    else i++
  }
  let hasRootIdentity = false
  if (pairs.length > 0 && pairs[0]![0].isAbsoluteRootPath() && pairs[0]![1].isAbsoluteRootPath()) {
    pairs.shift()
    hasRootIdentity = true
  }
  return { pairs, hasRootIdentity }
}

// Coerce a pair source/target that may have arrived as a string (test/boundary
// callers spell paths as strings) into SdfPath. '' is the empty/block path.
function toPath(p: SdfPath | string): SdfPath {
  return typeof p === 'string' ? SdfPath.fromString(p) : p
}

// _SourceAndTargetPathPairs: a flat, canonical pair set. Pairs never include
// the root identity (/ -> /); that is the flag.
interface PathPairs {
  readonly pairs: readonly PcpPathPair[]
  readonly hasRootIdentity: boolean
}

// PcpMapFunction::_Mappings: a flat pair set, or a deferred composition of
// mappings in order from outermost to innermost function.
type Mappings =
  | { readonly kind: 'pairs'; readonly data: PathPairs }
  | { readonly kind: 'deferred'; readonly sets: readonly Mappings[] }

const pairsMappings = (data: PathPairs): Mappings => ({ kind: 'pairs', data })

// _Mappings::AllOf.
function allOf(mappings: Mappings, f: (pathPairs: PathPairs) => boolean): boolean {
  if (mappings.kind === 'pairs') return f(mappings.data)
  return mappings.sets.every(m => allOf(m, f))
}

function buildPairs(rawPairs: PcpPathPair[]): PathPairs {
  return canonicalize(rawPairs.slice().sort(pathPairOrder))
}

// _Map over one pair set.
function mapPairs(path: SdfPath, pp: PathPairs, invert: boolean): SdfPath {
  const pairs = pp.pairs
  const bestIdx = invert ? bestTargetMatch(path, pairs) : bestSourceMatch(path, pairs)
  let result: SdfPath
  if (bestIdx === -1) {
    result = pp.hasRootIdentity ? path : EMPTY_PATH
  } else if (invert) {
    result = replacePrefix(path, pairs[bestIdx]![1], pairs[bestIdx]![0], false)
  } else {
    result = replacePrefix(path, pairs[bestIdx]![0], pairs[bestIdx]![1], false)
  }
  if (result.isEmpty()) return result
  // Bijection: block a mapping that would not invert back to `path`.
  if (hasBetterTargetMatch(result, pairs, bestIdx, invert)) return EMPTY_PATH
  return result
}

// _ComposePathPairs: (outer ∘ inner) first applies `inner`, then `outer`.
// Build all resulting (source, target) pairs, then _PathPairOrder-sort and
// _Canonicalize.
function composePairs(outer: PathPairs, inner: PathPairs): PathPairs {
  // Targets that map to the empty path are BLOCK entries and are KEPT —
  // _Canonicalize decides whether a block is redundant.
  const rawPairs: PcpPathPair[] = []
  const seenSources = new Set<string>()
  // Root identity survives iff BOTH have it. Added first to match C++ order.
  if (outer.hasRootIdentity && inner.hasRootIdentity) {
    rawPairs.push([ABS_ROOT, ABS_ROOT])
    seenSources.add(ABS_ROOT.pathString)
  }
  // Apply the outer function to the output range of inner.
  for (const [s, t] of inner.pairs) {
    rawPairs.push([s, mapPairs(t, outer, false)])
    seenSources.add(s.pathString)
  }
  // Apply the inverse of inner to the domain of outer; skip a source already
  // produced above.
  for (const [s, t] of outer.pairs) {
    const source = mapPairs(s, inner, true)
    if (source.isEmpty() || seenSources.has(source.pathString)) continue
    seenSources.add(source.pathString)
    rawPairs.push([source, t])
  }
  return buildPairs(rawPairs)
}

// _ComposeImpliedClassPathPairs (mapFunction.cpp:1156-1239).
function composeImpliedClassPairs(transferPairs: PathPairs, classArcPairs: PathPairs): PathPairs {
  // The composed function always has the root identity, first in sort order.
  const out: PcpPathPair[] = [[ABS_ROOT, ABS_ROOT]]
  // Pass 1: map classArc pairs through transferFunc.
  for (const [source, target] of classArcPairs.pairs) {
    const mappedSource = mapPairs(source, transferPairs, false)
    if (mappedSource.isEmpty()) continue
    out.push([mappedSource, mapPairs(target, transferPairs, false)])
  }
  // Pass 2: for each transferFunc pair whose source is a strict descendant
  // of a classArc target, generate an additional entry.
  for (const [tfSource, tfTarget] of transferPairs.pairs) {
    for (const [classSource, classTarget] of classArcPairs.pairs) {
      if (pathEquals(tfSource, classTarget) || !pathHasPrefix(tfSource, classTarget)) continue
      const newSource = replacePrefix(tfSource, classTarget, classSource)
      // classArc must actually map newSource to tfSource (bijection).
      if (!pathEquals(mapPairs(newSource, classArcPairs, false), tfSource)) continue
      const resultSource = mapPairs(newSource, transferPairs, false)
      if (resultSource.isEmpty()) continue
      out.push([resultSource, tfTarget])
    }
  }
  const { pairs } = canonicalize(out.sort(pathPairOrder))
  return { pairs, hasRootIdentity: true }
}

// _InvertPathPairs: swap and sort; GetInverse does NOT canonicalize — an
// already-canonical map inverts to an already-canonical map.
function invertPairs(pp: PathPairs): PathPairs {
  const inv: PcpPathPair[] = pp.pairs.map(([s, t]) => [t, s] as PcpPathPair)
  inv.sort(pathPairOrder)
  return { pairs: inv, hasRootIdentity: pp.hasRootIdentity }
}

function invertMappings(mappings: Mappings): Mappings {
  if (mappings.kind === 'pairs') return pairsMappings(invertPairs(mappings.data))
  // The inverse of outer ∘ inner is inner⁻¹ ∘ outer⁻¹.
  return { kind: 'deferred', sets: [...mappings.sets].reverse().map(invertMappings) }
}

// _GetNormalized: compose every deferred set into one pair set.
function normalizeMappings(mappings: Mappings): PathPairs {
  if (mappings.kind === 'pairs') return mappings.data
  let normalized: PathPairs | undefined
  for (let i = mappings.sets.length - 1; i >= 0; i--) {
    const pp = normalizeMappings(mappings.sets[i]!)
    normalized = normalized ? composePairs(pp, normalized) : pp
  }
  return normalized!
}

// _MapPathImpl: source -> target applies innermost to outermost; target ->
// source applies outermost to innermost.
function mapMappings(path: SdfPath, mappings: Mappings, invert: boolean): SdfPath {
  if (mappings.kind === 'pairs') return mapPairs(path, mappings.data, invert)
  let result = path
  const sets = mappings.sets
  for (let k = 0; k < sets.length && !result.isEmpty(); k++) {
    result = mapMappings(result, sets[invert ? k : sets.length - 1 - k]!, invert)
  }
  return result
}

export class PcpMapFunction {
  private readonly _mappings: Mappings
  private readonly _offset: SdfLayerOffset

  private constructor(mappings: Mappings, offset: SdfLayerOffset) {
    this._mappings = mappings
    this._offset = offset
  }

  // Build from a source->target map. Canonicalizes (drops redundant pairs and
  // extracts the root identity into the flag), matching PcpMapFunction::Create.
  // An empty map with identity offset yields the null function. Accepts SdfPath
  // pairs or (boundary/test convenience) string pairs / a string->string Map.
  static create(
    sourceToTarget:
      | Iterable<readonly [SdfPath | string, SdfPath | string]>
      | ReadonlyMap<SdfPath | string, SdfPath | string>,
    offset: SdfLayerOffset = SDF_LAYER_OFFSET_IDENTITY,
  ): PcpMapFunction {
    const raw: Iterable<readonly [SdfPath | string, SdfPath | string]> =
      sourceToTarget instanceof Map
        ? [...sourceToTarget.entries()]
        : (sourceToTarget as Iterable<readonly [SdfPath | string, SdfPath | string]>)
    const entries: PcpPathPair[] = [...raw].map(([s, t]) => [toPath(s), toPath(t)] as PcpPathPair)
    return new PcpMapFunction(pairsMappings(buildPairs(entries)), offset)
  }

  // DeferredComposition (mapFunction.cpp:596-608): the same mappings, kept
  // apart from functions they are later composed with.
  static deferredComposition(mapFn: PcpMapFunction): PcpMapFunction {
    // Composing with an identity is trivial, so it never defers.
    if (mapFn.isIdentity()) return mapFn
    return new PcpMapFunction({ kind: 'deferred', sets: [mapFn._mappings] }, mapFn._offset)
  }

  static identity(): PcpMapFunction {
    return new PcpMapFunction(
      pairsMappings({ pairs: [], hasRootIdentity: true }), SDF_LAYER_OFFSET_IDENTITY)
  }

  // The null (uninitialized) map function — maps nothing.
  static null(): PcpMapFunction {
    return new PcpMapFunction(
      pairsMappings({ pairs: [], hasRootIdentity: false }), SDF_LAYER_OFFSET_IDENTITY)
  }

  isNull(): boolean {
    return allOf(this._mappings, pp => pp.pairs.length === 0 && !pp.hasRootIdentity)
  }

  isDeferredComposition(): boolean {
    return this._mappings.kind === 'deferred'
  }

  isIdentity(): boolean {
    return this.isIdentityPathMapping() && sdfLayerOffsetIsIdentity(this._offset)
  }

  // Path mapping is identity when the only thing present is the root identity.
  isIdentityPathMapping(): boolean {
    return allOf(this._mappings, pp => pp.hasRootIdentity && pp.pairs.length === 0)
  }

  hasRootIdentity(): boolean {
    return allOf(this._mappings, pp => pp.hasRootIdentity)
  }

  getTimeOffset(): SdfLayerOffset {
    return this._offset
  }

  // The fully composed source->target pairs, root identity re-included if
  // present.
  getSourceToTargetMap(): Map<string, string> {
    const pp = normalizeMappings(this._mappings)
    const m = new Map<string, string>()
    if (pp.hasRootIdentity) m.set(ABS_ROOT.pathString, ABS_ROOT.pathString)
    for (const [s, t] of pp.pairs) m.set(s.pathString, t.pathString)
    return m
  }

  private _map(path: SdfPath, invert: boolean): SdfPath {
    // The arc map's pairs are NAMESPACE paths (_CreateMapExpressionForArc strips
    // variant selections). A path carrying a selection won't prefix-match a stripped
    // pair, so strip it for the lookup and re-apply the selections onto the result
    // where their owning prim survived the mapping (a class inherited from inside a
    // variant maps to the class's variant content, not the bare class —
    // BasicVariantWithReference). This is SdfPath's variant axis, restored.
    if (path.containsPrimVariantSelection()) {
      const mapped = mapMappings(path.stripAllVariantSelections(), this._mappings, invert)
      return mapped.isEmpty() ? mapped : path.reapplyVariantSelectionsOnto(mapped)
    }
    return mapMappings(path, this._mappings, invert)
  }

  // Map a path in the source namespace to the target namespace (empty if
  // blocked), or a path expression (mapFunction.cpp:885-894).
  mapSourceToTarget(path: SdfPath): SdfPath
  mapSourceToTarget(
    pathExpr: SdfPathExpression, unmappedPatterns?: SdfPathPattern[],
    unmappedRefs?: { path: SdfPath; name: string }[]): SdfPathExpression
  mapSourceToTarget(
    path: SdfPath | SdfPathExpression, unmappedPatterns?: SdfPathPattern[],
    unmappedRefs?: { path: SdfPath; name: string }[],
  ): SdfPath | SdfPathExpression {
    if (path instanceof SdfPathExpression) {
      return this._mapPathExpressionImpl(false, path, unmappedPatterns, unmappedRefs)
    }
    return this._map(path, false)
  }

  // Map a path in the target namespace back to the source namespace, or a
  // path expression (mapFunction.cpp:896-905).
  mapTargetToSource(path: SdfPath): SdfPath
  mapTargetToSource(
    pathExpr: SdfPathExpression, unmappedPatterns?: SdfPathPattern[],
    unmappedRefs?: { path: SdfPath; name: string }[]): SdfPathExpression
  mapTargetToSource(
    path: SdfPath | SdfPathExpression, unmappedPatterns?: SdfPathPattern[],
    unmappedRefs?: { path: SdfPath; name: string }[],
  ): SdfPath | SdfPathExpression {
    if (path instanceof SdfPathExpression) {
      return this._mapPathExpressionImpl(true, path, unmappedPatterns, unmappedRefs)
    }
    return this._map(path, true)
  }

  // _MapPathExpressionImpl (mapFunction.cpp:907-998): map each reference
  // path and pattern prefix; a leading-stretch ('//') pattern is kept
  // unchanged, and a path outside the domain becomes Nothing().
  private _mapPathExpressionImpl(
    invert: boolean, pathExpr: SdfPathExpression,
    unmappedPatterns?: SdfPathPattern[], unmappedRefs?: { path: SdfPath; name: string }[],
  ): SdfPathExpression {
    const stack: SdfPathExpression[] = []
    const map = (path: SdfPath) => this._map(path, invert)
    pathExpr.walk(
      (op, argIndex) => {
        if (op === 'complement') {
          if (argIndex === 1) stack.push(SdfPathExpression.makeComplement(stack.pop()!))
        } else if (argIndex === 2) {
          const arg2 = stack.pop()!
          stack.push(SdfPathExpression.makeOp(op, stack.pop()!, arg2))
        }
      },
      ref => {
        if (ref.path.isEmpty()) {
          stack.push(SdfPathExpression.makeAtom(ref))
          return
        }
        const mapped = map(ref.path)
        if (mapped.isEmpty()) {
          unmappedRefs?.push(ref)
          stack.push(SdfPathExpression.Nothing())
        } else {
          stack.push(SdfPathExpression.makeAtom({ path: mapped, name: ref.name }))
        }
      },
      pattern => {
        if (pattern.hasLeadingStretch()) {
          stack.push(SdfPathExpression.makeAtom(pattern))
          return
        }
        const mapped = map(pattern.getPrefix())
        if (mapped.isEmpty()) {
          unmappedPatterns?.push(pattern)
          stack.push(SdfPathExpression.Nothing())
        } else {
          stack.push(SdfPathExpression.makeAtom(new SdfPathPattern(pattern.getText()).setPrefix(mapped)))
        }
      },
    )
    return stack.at(-1) ?? new SdfPathExpression()
  }

  // Compose (mapFunction.cpp:1241-1271): (this ∘ inner) first applies
  // `inner`, then `this`. Two flat functions combine into one pair set; a
  // deferred-composition function keeps both functions' mappings apart.
  compose(inner: PcpMapFunction): PcpMapFunction {
    if (this.isIdentity()) return inner
    if (inner.isIdentity()) return this
    const offset = sdfLayerOffsetCompose(this._offset, inner._offset)
    if (this._mappings.kind === 'pairs' && inner._mappings.kind === 'pairs') {
      return new PcpMapFunction(
        pairsMappings(composePairs(this._mappings.data, inner._mappings.data)), offset)
    }
    return new PcpMapFunction(
      { kind: 'deferred', sets: [this._mappings, inner._mappings] }, offset)
  }

  composeOffset(offset: SdfLayerOffset): PcpMapFunction {
    return new PcpMapFunction(this._mappings, sdfLayerOffsetCompose(this._offset, offset))
  }

  // GetInverse (mapFunction.cpp:1298-1365).
  getInverse(): PcpMapFunction {
    const offInv = sdfLayerOffsetInverse(this._offset) ?? SDF_LAYER_OFFSET_IDENTITY
    return new PcpMapFunction(invertMappings(this._mappings), offInv)
  }

  // ImpliedClass (mapFunction.cpp:616-636): the class arc re-expressed in
  // the namespace the transfer function maps to, with the root identity
  // forced (_ComposeImpliedClassPathPairs).
  static impliedClass(transferFunc: PcpMapFunction, classArc: PcpMapFunction): PcpMapFunction {
    if (transferFunc.isIdentity() || classArc.isIdentity()) return classArc
    const normalizedClassArc = normalizeMappings(classArc._mappings)
    const normalizedTransferFunc = normalizeMappings(transferFunc._mappings)
    return new PcpMapFunction(
      pairsMappings(composeImpliedClassPairs(normalizedTransferFunc, normalizedClassArc)),
      classArc._offset)
  }

  // Re-create with an added root identity (mapExpression.cpp:_AddRootIdentity).
  addRootIdentity(): PcpMapFunction {
    if (this.hasRootIdentity()) return this
    const pp = normalizeMappings(this._mappings)
    return new PcpMapFunction(
      pairsMappings(buildPairs([[ABS_ROOT, ABS_ROOT], ...pp.pairs])), this._offset)
  }

  // operator==: compares the fully composed mappings.
  equals(other: PcpMapFunction): boolean {
    if (!sdfLayerOffsetEquals(this._offset, other._offset)) return false
    const a = normalizeMappings(this._mappings)
    const b = normalizeMappings(other._mappings)
    if (a.hasRootIdentity !== b.hasRootIdentity) return false
    if (a.pairs.length !== b.pairs.length) return false
    for (let i = 0; i < a.pairs.length; i++) {
      if (!pathEquals(a.pairs[i]![0], b.pairs[i]![0]) ||
          !pathEquals(a.pairs[i]![1], b.pairs[i]![1])) {
        return false
      }
    }
    return true
  }

  /** @internal _GetNumMappingSets. */
  _getNumMappingSets(): number {
    let result = 0
    allOf(this._mappings, () => { result++; return true })
    return result
  }

  toString(): string {
    const parts = [...this.getSourceToTargetMap()].map(([s, t]) => `${s} -> ${t || '(block)'}`)
    if (!sdfLayerOffsetIsIdentity(this._offset)) {
      parts.push(`offset=${this._offset.offset} scale=${this._offset.scale}`)
    }
    return `{ ${parts.join(', ')} }`
  }
}
