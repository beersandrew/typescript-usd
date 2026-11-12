// Ported from OpenUSD 26.11.1: pxr/usd/pcp/errors.cpp, pxr/usd/pcp/errors.h,
//  pxr/usd/pcp/wrapErrors.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpError — typed composition errors. Faithful port of OpenUSD pcp/errors.h:
// the PcpErrorType enum (errors.h:28) and the error payloads for the types the
// engine currently detects. Errors are ADDITIVE diagnostics: recording one
// never changes the composed graph (the arc/entry is skipped exactly as
// before). Detection sites live in cache.ts (prim-index build) and
// layerStack.ts (layer-stack build); results surface as
// PcpPrimIndex.localErrors (upstream PcpPrimIndexOutputs.allErrors →
// PcpPrimIndex::GetLocalErrors) and PcpLayerStack.localErrors
// (PcpLayerStack::GetLocalErrors).
//
// Upstream errors are shared_ptr'd classes with a virtual ToString(). The
// TypeScript classes below preserve that Python-visible runtime hierarchy;
// engine-only factories populate their readonly payload and precompute the
// ToString() text into `message`. Factory bodies mirror errors.cpp line for
// line. Provenance: OpenUSD v26.08 pcp/errors.h and pcp/wrapErrors.cpp; the
// PcpErrorType enum and PcpErrorInvalidSublayerAndOffsetCount follow v26.11.1.

import { PcpArcType } from './arc.ts'
import type {
  PcpLayerHandle, PcpLayerStackIdentifier,
} from './layerStackIdentifier.ts'
import type { PcpSite } from './site.ts'

// The full upstream enum, in upstream order (OpenUSD v26.11.1 errors.h:28-61). Types beyond the
// ones detected below exist so consumers can switch exhaustively as coverage
// grows.
export enum PcpErrorType {
  ArcCycle,
  ArcPermissionDenied,
  ArcToProhibitedChild,
  IndexCapacityExceeded,
  ArcCapacityExceeded,
  ArcNamespaceDepthCapacityExceeded,
  InconsistentPropertyType,
  InconsistentAttributeType,
  InconsistentAttributeVariability,
  InternalAssetPath,
  InvalidPrimPath,
  InvalidAssetPath,
  InvalidInstanceTargetPath,
  InvalidExternalTargetPath,
  InvalidTargetPath,
  InvalidReferenceOffset,
  InvalidSublayerOffset,
  InvalidSublayerOwnership,
  InvalidSublayerPath,
  InvalidVariantSelection,
  MutedAssetPath,
  InvalidAuthoredRelocation,
  InvalidConflictingRelocation,
  InvalidSameTargetRelocations,
  OpinionAtRelocationSource,
  PrimPermissionDenied,
  PropertyPermissionDenied,
  SublayerCycle,
  TargetPermissionDenied,
  UnresolvedPrimPath,
  VariableExpressionError,
  InvalidSublayerAndOffsetCount,
}

// OpenUSD v26.11.1 errors.h:28-61 declares these enumerators in the Pcp
// namespace. Keep the TypeScript enum for ergonomic switching and expose the
// namespace-level spellings as the public C++ surface does.
export const PcpErrorType_ArcCycle = PcpErrorType.ArcCycle
export const PcpErrorType_ArcPermissionDenied = PcpErrorType.ArcPermissionDenied
export const PcpErrorType_ArcToProhibitedChild = PcpErrorType.ArcToProhibitedChild
export const PcpErrorType_IndexCapacityExceeded = PcpErrorType.IndexCapacityExceeded
export const PcpErrorType_ArcCapacityExceeded = PcpErrorType.ArcCapacityExceeded
export const PcpErrorType_ArcNamespaceDepthCapacityExceeded =
  PcpErrorType.ArcNamespaceDepthCapacityExceeded
export const PcpErrorType_InconsistentPropertyType = PcpErrorType.InconsistentPropertyType
export const PcpErrorType_InconsistentAttributeType = PcpErrorType.InconsistentAttributeType
export const PcpErrorType_InconsistentAttributeVariability =
  PcpErrorType.InconsistentAttributeVariability
export const PcpErrorType_InternalAssetPath = PcpErrorType.InternalAssetPath
export const PcpErrorType_InvalidPrimPath = PcpErrorType.InvalidPrimPath
export const PcpErrorType_InvalidAssetPath = PcpErrorType.InvalidAssetPath
export const PcpErrorType_InvalidInstanceTargetPath = PcpErrorType.InvalidInstanceTargetPath
export const PcpErrorType_InvalidExternalTargetPath = PcpErrorType.InvalidExternalTargetPath
export const PcpErrorType_InvalidTargetPath = PcpErrorType.InvalidTargetPath
export const PcpErrorType_InvalidReferenceOffset = PcpErrorType.InvalidReferenceOffset
export const PcpErrorType_InvalidSublayerOffset = PcpErrorType.InvalidSublayerOffset
export const PcpErrorType_InvalidSublayerOwnership = PcpErrorType.InvalidSublayerOwnership
export const PcpErrorType_InvalidSublayerPath = PcpErrorType.InvalidSublayerPath
export const PcpErrorType_InvalidVariantSelection = PcpErrorType.InvalidVariantSelection
export const PcpErrorType_MutedAssetPath = PcpErrorType.MutedAssetPath
export const PcpErrorType_InvalidAuthoredRelocation = PcpErrorType.InvalidAuthoredRelocation
export const PcpErrorType_InvalidConflictingRelocation =
  PcpErrorType.InvalidConflictingRelocation
export const PcpErrorType_InvalidSameTargetRelocations =
  PcpErrorType.InvalidSameTargetRelocations
export const PcpErrorType_OpinionAtRelocationSource = PcpErrorType.OpinionAtRelocationSource
export const PcpErrorType_PrimPermissionDenied = PcpErrorType.PrimPermissionDenied
export const PcpErrorType_PropertyPermissionDenied = PcpErrorType.PropertyPermissionDenied
export const PcpErrorType_SublayerCycle = PcpErrorType.SublayerCycle
export const PcpErrorType_TargetPermissionDenied = PcpErrorType.TargetPermissionDenied
export const PcpErrorType_UnresolvedPrimPath = PcpErrorType.UnresolvedPrimPath
export const PcpErrorType_VariableExpressionError = PcpErrorType.VariableExpressionError
export const PcpErrorType_InvalidSublayerAndOffsetCount =
  PcpErrorType.InvalidSublayerAndOffsetCount

// PcpErrorBase (errors.h:70): every error carries the site of the composed
// prim being computed when it was encountered, plus the ToString() text.
export interface PcpErrorBase {
  readonly errorType: PcpErrorType
  readonly rootSite: PcpSite
  readonly message: string
}

export abstract class PcpErrorBase {
  protected constructor() {}
  toString(): string { return this.message }
}

// One step of the arc chain that closed a cycle. Upstream PcpErrorArcCycle
// carries a PcpSiteTracker (site.h) — a vector of (site, arcType) segments.
export interface PcpSiteTrackerSegment {
  readonly site: PcpSite
  readonly arcType: PcpArcType
}

// Arcs between PcpNodes that form a cycle (errors.h:102). Segments are
// ordered root → leaf, with the arc target that would have closed the cycle
// LAST ("There is no node for the last site in the chain, so report it
// directly", _CheckForCycle, primIndex.cpp:1678).
export interface PcpErrorArcCycle extends PcpErrorBase {
  readonly errorType: PcpErrorType.ArcCycle
  readonly cycle: readonly PcpSiteTrackerSegment[]
}

export interface PcpErrorArcPermissionDenied extends PcpErrorBase {
  readonly errorType: PcpErrorType.ArcPermissionDenied
  readonly site: PcpSite
  readonly privateSite: PcpSite
  readonly arcType: PcpArcType
}

export interface PcpErrorArcToProhibitedChild extends PcpErrorBase {
  readonly errorType: PcpErrorType.ArcToProhibitedChild
  readonly site: PcpSite
  readonly targetSite: PcpSite
  readonly relocationSourceSite: PcpSite
  readonly arcType: PcpArcType
}

export interface PcpErrorInvalidAssetPath extends PcpErrorInvalidAssetPathBase {
  readonly errorType: PcpErrorType.InvalidAssetPath
  readonly site: PcpSite
  readonly targetPath: string
  readonly assetPath: string
  readonly resolvedAssetPath: string
  readonly sourceLayer: PcpLayerHandle | undefined
  readonly arcType: PcpArcType
  readonly messages: string
}

export interface PcpErrorMutedAssetPath extends PcpErrorInvalidAssetPathBase {
  readonly errorType: PcpErrorType.MutedAssetPath
}

export interface PcpErrorVariableExpressionError extends PcpErrorBase {
  readonly errorType: PcpErrorType.VariableExpressionError
  readonly expression: string
  readonly expressionError: string
  readonly context: string
  readonly sourceLayer: PcpLayerHandle
  readonly sourcePath: string
}

/** @deprecated Use PcpErrorVariableExpressionError. */
export type PcpErrorVariableExpression = PcpErrorVariableExpressionError

export interface PcpErrorInconsistentPropertyBase extends PcpErrorBase {
  readonly definingLayerIdentifier: string
  readonly definingSpecPath: string
  readonly conflictingLayerIdentifier: string
  readonly conflictingSpecPath: string
}

export interface PcpErrorInconsistentPropertyType extends PcpErrorInconsistentPropertyBase {
  readonly errorType: PcpErrorType.InconsistentPropertyType
  readonly definingSpecType: string
  readonly conflictingSpecType: string
}

export interface PcpErrorInconsistentAttributeType extends PcpErrorInconsistentPropertyBase {
  readonly errorType: PcpErrorType.InconsistentAttributeType
  readonly definingValueType: string
  readonly conflictingValueType: string
}

export interface PcpErrorInconsistentAttributeVariability extends PcpErrorInconsistentPropertyBase {
  readonly errorType: PcpErrorType.InconsistentAttributeVariability
  readonly definingVariability: string
  readonly conflictingVariability: string
}

export interface PcpErrorCapacityExceeded extends PcpErrorBase {
  readonly errorType:
    | PcpErrorType.IndexCapacityExceeded
    | PcpErrorType.ArcCapacityExceeded
    | PcpErrorType.ArcNamespaceDepthCapacityExceeded
}

export interface PcpErrorInvalidAssetPathBase extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidAssetPath | PcpErrorType.MutedAssetPath
  readonly site: PcpSite
  readonly targetPath: string
  readonly assetPath: string
  readonly resolvedAssetPath: string
  readonly sourceLayer: PcpLayerHandle | undefined
  readonly arcType: PcpArcType
  readonly messages: string
}

export interface PcpErrorTargetPathBase extends PcpErrorBase {
  readonly errorType:
    | PcpErrorType.InvalidInstanceTargetPath
    | PcpErrorType.InvalidExternalTargetPath
    | PcpErrorType.InvalidTargetPath
    | PcpErrorType.TargetPermissionDenied
  readonly targetPath: string
  readonly owningPath: string
  readonly ownerSpecType: string
  readonly layer: PcpLayerHandle
  readonly composedTargetPath: string
}

export interface PcpErrorInvalidInstanceTargetPath extends PcpErrorTargetPathBase {
  readonly errorType: PcpErrorType.InvalidInstanceTargetPath
}

export interface PcpErrorInvalidExternalTargetPath extends PcpErrorTargetPathBase {
  readonly errorType: PcpErrorType.InvalidExternalTargetPath
  readonly ownerArcType: PcpArcType
  readonly ownerIntroPath: string
}

export interface PcpErrorInvalidTargetPath extends PcpErrorTargetPathBase {
  readonly errorType: PcpErrorType.InvalidTargetPath
}

export interface PcpErrorTargetPermissionDenied extends PcpErrorTargetPathBase {
  readonly errorType: PcpErrorType.TargetPermissionDenied
}

export interface PcpErrorInvalidSublayerOffset extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidSublayerOffset
  readonly layer: PcpLayerHandle
  readonly sublayer: PcpLayerHandle
  readonly offset: { readonly offset: number; readonly scale: number }
}

// PcpErrorInvalidSublayerAndOffsetCount (OpenUSD v26.11.1 errors.h:599-622).
export interface PcpErrorInvalidSublayerAndOffsetCount extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidSublayerAndOffsetCount
  readonly layer: PcpLayerHandle
  readonly sublayerCount: number
  readonly offsetCount: number
}

export interface PcpErrorInvalidReferenceOffset extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidReferenceOffset
  readonly sourceLayer: PcpLayerHandle
  readonly sourcePath: string
  readonly assetPath: string
  readonly targetPath: string
  readonly offset: { readonly offset: number; readonly scale: number }
  readonly arcType: PcpArcType
}

export interface PcpErrorInvalidSublayerOwnership extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidSublayerOwnership
  readonly owner: string
  readonly layer: PcpLayerHandle
  readonly sublayers: readonly PcpLayerHandle[]
}

export interface PcpErrorInvalidSublayerPath extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidSublayerPath
  readonly layer: PcpLayerHandle | undefined
  readonly sublayerPath: string
  readonly messages: string
}

export interface PcpErrorPrimPermissionDenied extends PcpErrorBase {
  readonly errorType: PcpErrorType.PrimPermissionDenied
  readonly site: PcpSite
  readonly privateSite: PcpSite
}

export interface PcpErrorPropertyPermissionDenied extends PcpErrorBase {
  readonly errorType: PcpErrorType.PropertyPermissionDenied
  readonly propPath: string
  readonly propType: string
  readonly layerPath: string
}

// An invalid prim path authored by a reference, payload, inherit, or
// specializes arc (errors.h:333).
export interface PcpErrorInvalidPrimPath extends PcpErrorBase {
  readonly errorType: PcpErrorType.InvalidPrimPath
  readonly site: PcpSite
  readonly primPath: string
  readonly sourceLayer: PcpLayerHandle | undefined
  readonly arcType: PcpArcType
}

// A reference/payload whose target prim path has no spec in the target layer
// stack (errors.h:995).
export interface PcpErrorUnresolvedPrimPath extends PcpErrorBase {
  readonly errorType: PcpErrorType.UnresolvedPrimPath
  /// The site where the invalid arc was expressed.
  readonly site: PcpSite
  /// The source layer of the spec that caused this arc to be introduced.
  /// This may be a sublayer of the site. Undefined only for a node cloned
  /// out of a recursive sub-build graft, where the introduction record is
  /// not carried across the clone (upstream re-derives it from
  /// PcpComposeSiteReferences arc info + GetSiblingNumAtOrigin).
  readonly sourceLayer: PcpLayerHandle | undefined
  /// The target layer of the arc (the target layer stack's root layer).
  readonly targetLayer: PcpLayerHandle
  /// The prim path that cannot be resolved on the target layer stack.
  readonly unresolvedPath: string
  readonly arcType: PcpArcType
}

// A layer that recursively sublayers itself (errors.h:942). `layer` is the
// layer whose subLayers list closed the cycle; `sublayer` is the
// already-loaded layer it re-included (layerStack.cpp:1779).
export interface PcpErrorSublayerCycle extends PcpErrorBase {
  readonly errorType: PcpErrorType.SublayerCycle
  readonly layer: PcpLayerHandle
  readonly sublayer: PcpLayerHandle
}

// An individually invalid authored relocates entry (errors.h:726).
export interface PcpErrorInvalidAuthoredRelocation extends PcpErrorRelocationBase {
  readonly errorType: PcpErrorType.InvalidAuthoredRelocation
  readonly sourcePath: string
  readonly targetPath: string
  /// The layer containing the authored relocates.
  readonly layer: PcpLayerHandle
  /// The path to the prim where the relocates is authored ('/' for
  /// layer-level relocates metadata).
  readonly owningPath: string
  /// Additional messages about the error (Pcp_IsValidRelocatesEntry's
  /// errorMessage out-param).
  readonly messages: string
}

// Reasons a relocate conflicts with another relocate. Upstream nests this
// enum inside PcpErrorInvalidConflictingRelocation (errors.h:791); TS has no
// class-scoped enums.
export enum PcpRelocateConflictReason {
  TargetIsConflictSource,
  SourceIsConflictTarget,
  TargetIsConflictSourceDescendant,
  SourceIsConflictSourceDescendant,
}

// A relocate that conflicts with another relocate in the same layer stack
// (errors.h:762). Layer/owning-path provenance is carried for both sides.
export interface PcpErrorInvalidConflictingRelocation extends PcpErrorRelocationBase {
  readonly errorType: PcpErrorType.InvalidConflictingRelocation
  readonly sourcePath: string
  readonly targetPath: string
  readonly layer: PcpLayerHandle
  readonly owningPath: string
  readonly conflictSourcePath: string
  readonly conflictTargetPath: string
  readonly conflictLayer: PcpLayerHandle
  readonly conflictOwningPath: string
  readonly conflictReason: PcpRelocateConflictReason
}

// Multiple relocates in the layer stack naming the same target (errors.h:816).
// One error per target, listing every source that claimed it.
export interface PcpRelocationSource {
  readonly sourcePath: string
  readonly layer: PcpLayerHandle
  readonly owningPath: string
}
export interface PcpErrorInvalidSameTargetRelocations extends PcpErrorRelocationBase {
  readonly errorType: PcpErrorType.InvalidSameTargetRelocations
  readonly targetPath: string
  readonly sources: readonly PcpRelocationSource[]
}

// Opinions found at a relocation source path (errors.h:856): authoring at the
// moved-away source is illegal; the opinions are ignored.
export interface PcpErrorOpinionAtRelocationSource extends PcpErrorBase {
  readonly errorType: PcpErrorType.OpinionAtRelocationSource
  readonly layer: PcpLayerHandle
  readonly path: string
}

export interface PcpErrorRelocationBase extends PcpErrorBase {
  readonly errorType:
    | PcpErrorType.InvalidAuthoredRelocation
    | PcpErrorType.InvalidConflictingRelocation
    | PcpErrorType.InvalidSameTargetRelocations
}

// Runtime hierarchy exposed by OpenUSD v26.08 pcp/wrapErrors.cpp:45-198.
// Constructors stay protected through ErrorBase, matching Boost.Python's
// no_init surface; composition code creates populated instances via factories.
export class PcpErrorArcCycle extends PcpErrorBase {}
export class PcpErrorArcPermissionDenied extends PcpErrorBase {}
export class PcpErrorArcToProhibitedChild extends PcpErrorBase {}
export class PcpErrorCapacityExceeded extends PcpErrorBase {}
export class PcpErrorInconsistentPropertyType extends PcpErrorBase {}
export class PcpErrorInconsistentAttributeType extends PcpErrorBase {}
export class PcpErrorInconsistentAttributeVariability extends PcpErrorBase {}
export class PcpErrorInvalidPrimPath extends PcpErrorBase {}
export abstract class PcpErrorInvalidAssetPathBase extends PcpErrorBase {}
export class PcpErrorInvalidAssetPath extends PcpErrorInvalidAssetPathBase {}
export class PcpErrorMutedAssetPath extends PcpErrorInvalidAssetPathBase {}
export abstract class PcpErrorTargetPathBase extends PcpErrorBase {}
export class PcpErrorInvalidInstanceTargetPath extends PcpErrorTargetPathBase {}
export class PcpErrorInvalidExternalTargetPath extends PcpErrorTargetPathBase {}
export class PcpErrorInvalidTargetPath extends PcpErrorTargetPathBase {}
export class PcpErrorInvalidSublayerOffset extends PcpErrorBase {}
export class PcpErrorInvalidReferenceOffset extends PcpErrorBase {}
export class PcpErrorInvalidSublayerOwnership extends PcpErrorBase {}
export class PcpErrorInvalidSublayerPath extends PcpErrorBase {}
export abstract class PcpErrorRelocationBase extends PcpErrorBase {}
export class PcpErrorInvalidAuthoredRelocation extends PcpErrorRelocationBase {}
export class PcpErrorInvalidConflictingRelocation extends PcpErrorRelocationBase {}
export class PcpErrorInvalidSameTargetRelocations extends PcpErrorRelocationBase {}
export class PcpErrorOpinionAtRelocationSource extends PcpErrorBase {}
export class PcpErrorPrimPermissionDenied extends PcpErrorBase {}
export class PcpErrorPropertyPermissionDenied extends PcpErrorBase {}
export class PcpErrorSublayerCycle extends PcpErrorBase {}
export class PcpErrorTargetPermissionDenied extends PcpErrorTargetPathBase {}
export class PcpErrorUnresolvedPrimPath extends PcpErrorBase {}
export class PcpErrorVariableExpressionError extends PcpErrorBase {}
export class PcpErrorInvalidSublayerAndOffsetCount extends PcpErrorBase {}

export type PcpError =
  | PcpErrorArcCycle
  | PcpErrorArcPermissionDenied
  | PcpErrorArcToProhibitedChild
  | PcpErrorCapacityExceeded
  | PcpErrorInconsistentPropertyType
  | PcpErrorInconsistentAttributeType
  | PcpErrorInconsistentAttributeVariability
  | PcpErrorInvalidAssetPath
  | PcpErrorMutedAssetPath
  | PcpErrorInvalidPrimPath
  | PcpErrorInvalidInstanceTargetPath
  | PcpErrorInvalidExternalTargetPath
  | PcpErrorInvalidTargetPath
  | PcpErrorInvalidSublayerOffset
  | PcpErrorInvalidReferenceOffset
  | PcpErrorInvalidSublayerOwnership
  | PcpErrorInvalidSublayerPath
  | PcpErrorPrimPermissionDenied
  | PcpErrorPropertyPermissionDenied
  | PcpErrorTargetPermissionDenied
  | PcpErrorVariableExpressionError
  | PcpErrorUnresolvedPrimPath
  | PcpErrorSublayerCycle
  | PcpErrorInvalidAuthoredRelocation
  | PcpErrorInvalidConflictingRelocation
  | PcpErrorInvalidSameTargetRelocations
  | PcpErrorOpinionAtRelocationSource
  | PcpErrorInvalidSublayerAndOffsetCount

function makePcpError<T extends PcpErrorBase>(
  prototype: object, value: Omit<T, 'toString'>,
): T {
  return Object.assign(Object.create(prototype) as T, value)
}

// ---------------------------------------------------------------------------
// ToString rendering — mirrors errors.cpp and the Pcp stream operators.

// PcpLayerStackIdentifier printing (layerStackIdentifier.cpp:143): "@root@",
// with ",@session@" when a session layer is present. (The expression-variable
// override source suffix is not modeled here.)
function formatIdentifier(id: PcpLayerStackIdentifier): string {
  return `@${id.rootLayer.filePath}@` +
    (id.sessionLayer ? `,@${id.sessionLayer.filePath}@` : '')
}

// TfStringify(PcpSite) (site.cpp:121): "<identifier><path>".
function formatSite(site: PcpSite): string {
  return `${formatIdentifier(site.layerStack)}<${site.path}>`
}

// TfStringify of the single-layer PcpSite overload PcpSite(layer, path).
function formatLayerSite(layer: PcpLayerHandle | undefined, path: string): string {
  return `@${layer?.filePath ?? '<expired>'}@<${path}>`
}

// TfEnum::GetDisplayName(PcpArcType) (types.cpp:18).
const ARC_DISPLAY_NAMES: Record<PcpArcType, string> = {
  [PcpArcType.Root]: 'root',
  [PcpArcType.Inherit]: 'inherit',
  [PcpArcType.Relocate]: 'relocate',
  [PcpArcType.Variant]: 'variant',
  [PcpArcType.Reference]: 'reference',
  [PcpArcType.Payload]: 'payload',
  [PcpArcType.Specialize]: 'specialize',
}

// PcpErrorArcCycle::ToString (errors.cpp:82).
export function pcpErrorArcCycle(
  cycle: readonly PcpSiteTrackerSegment[],
): PcpErrorArcCycle {
  let msg = 'Cycle detected:\n'
  for (let i = 0; i < cycle.length; i++) {
    const segment = cycle[i]!
    if (i > 0) {
      if (i + 1 < cycle.length) {
        switch (segment.arcType) {
          case PcpArcType.Inherit: msg += 'inherits from:\n'; break
          case PcpArcType.Relocate: msg += 'is relocated from:\n'; break
          case PcpArcType.Variant: msg += 'uses variant:\n'; break
          case PcpArcType.Reference: msg += 'references:\n'; break
          case PcpArcType.Payload: msg += 'gets payload from:\n'; break
          default: msg += 'refers to:\n'; break
        }
      } else {
        msg += 'CANNOT '
        switch (segment.arcType) {
          case PcpArcType.Inherit: msg += 'inherit from:\n'; break
          case PcpArcType.Relocate: msg += 'be relocated from:\n'; break
          case PcpArcType.Variant: msg += 'use variant:\n'; break
          case PcpArcType.Reference: msg += 'reference:\n'; break
          case PcpArcType.Payload: msg += 'get payload from:\n'; break
          default: msg += 'refer to:\n'; break
        }
      }
    }
    msg += `${formatSite(segment.site)}\n`
    if (i > 0 && i + 1 < cycle.length) msg += 'which '
  }
  return makePcpError<PcpErrorArcCycle>(PcpErrorArcCycle.prototype, {
    errorType: PcpErrorType.ArcCycle,
    // "Retain the root site" — the front of the root→leaf chain
    // (_CheckForCycle, primIndex.cpp:1690).
    rootSite: cycle[0]!.site,
    cycle,
    message: msg,
  })
}

// PcpErrorUnresolvedPrimPath::ToString (errors.cpp:1053).
export function pcpErrorUnresolvedPrimPath(
  args: Omit<PcpErrorUnresolvedPrimPath, 'errorType' | 'message'>,
): PcpErrorUnresolvedPrimPath {
  return makePcpError<PcpErrorUnresolvedPrimPath>(PcpErrorUnresolvedPrimPath.prototype, {
    errorType: PcpErrorType.UnresolvedPrimPath,
    ...args,
    message: `Unresolved ${ARC_DISPLAY_NAMES[args.arcType]} prim path ` +
      `${formatLayerSite(args.targetLayer, args.unresolvedPath)} introduced by ` +
      `${formatLayerSite(args.sourceLayer, args.site.path)}`,
  })
}

// PcpErrorArcToProhibitedChild::ToString (errors.cpp:212).
export function pcpErrorArcToProhibitedChild(
  args: Omit<PcpErrorArcToProhibitedChild, 'errorType' | 'message'>,
): PcpErrorArcToProhibitedChild {
  const action: Record<PcpArcType, string> = {
    [PcpArcType.Root]: 'refer to',
    [PcpArcType.Inherit]: 'inherit from',
    [PcpArcType.Relocate]: 'be relocated from',
    [PcpArcType.Variant]: 'use variant',
    [PcpArcType.Reference]: 'reference',
    [PcpArcType.Payload]: 'get payload from',
    [PcpArcType.Specialize]: 'refer to',
  }
  return makePcpError<PcpErrorArcToProhibitedChild>(PcpErrorArcToProhibitedChild.prototype, {
    errorType: PcpErrorType.ArcToProhibitedChild,
    ...args,
    message: `${formatSite(args.site)}\nCANNOT ${action[args.arcType]}:\n` +
      `${formatSite(args.targetSite)}\nwhich is a prohibited child of its parent ` +
      'because it would require allowing opinions from the source of a ' +
      `relocation at ${formatSite(args.relocationSourceSite)}.`,
  })
}

// PcpErrorInvalidAssetPath::ToString (errors.cpp:456).
export function pcpErrorInvalidAssetPath(
  args: Omit<PcpErrorInvalidAssetPath, 'errorType' | 'message'>,
): PcpErrorInvalidAssetPath {
  return makePcpError<PcpErrorInvalidAssetPath>(PcpErrorInvalidAssetPath.prototype, {
    errorType: PcpErrorType.InvalidAssetPath,
    ...args,
    message: `Could not open asset @${args.resolvedAssetPath}@ for ` +
      `${ARC_DISPLAY_NAMES[args.arcType]} introduced by ` +
      `${formatLayerSite(args.sourceLayer, args.site.path)}` +
      (args.messages ? ` -- ${args.messages}` : '') + '.',
  })
}

// PcpErrorInvalidExternalTargetPath::ToString (OpenUSD v26.08
// pxr/usd/pcp/errors.cpp:559-575).
export function pcpErrorInvalidExternalTargetPath(
  args: Omit<PcpErrorInvalidExternalTargetPath, 'errorType' | 'message'>,
): PcpErrorInvalidExternalTargetPath {
  const kind = args.ownerSpecType === 'attribute'
    ? 'attribute connection' : 'relationship target'
  return makePcpError<PcpErrorInvalidExternalTargetPath>(
    PcpErrorInvalidExternalTargetPath.prototype, {
      errorType: PcpErrorType.InvalidExternalTargetPath,
      ...args,
      message: `The ${kind} <${args.targetPath}> from <${args.owningPath}> in layer ` +
        `@${args.layer.filePath}@ refers to a path outside the scope of the ` +
        `${ARC_DISPLAY_NAMES[args.ownerArcType]} from <${args.ownerIntroPath}>.  Ignoring.`,
    })
}

const targetKind = (ownerSpecType: string): string =>
  ownerSpecType === 'attribute' ? 'attribute connection' : 'relationship target'

// PcpErrorInvalidInstanceTargetPath::ToString (errors.cpp:525-538).
export function pcpErrorInvalidInstanceTargetPath(
  args: Omit<PcpErrorInvalidInstanceTargetPath, 'errorType' | 'message'>,
): PcpErrorInvalidInstanceTargetPath {
  return makePcpError<PcpErrorInvalidInstanceTargetPath>(
    PcpErrorInvalidInstanceTargetPath.prototype, {
      errorType: PcpErrorType.InvalidInstanceTargetPath,
      ...args,
      message: `The ${targetKind(args.ownerSpecType)} <${args.targetPath}> from ` +
        `<${args.owningPath}> in layer @${args.layer.filePath}@ is authored in a class ` +
        'but refers to an instance of that class.  Ignoring.',
    })
}

// PcpErrorInvalidTargetPath::ToString (errors.cpp:597-611).
export function pcpErrorInvalidTargetPath(
  args: Omit<PcpErrorInvalidTargetPath, 'errorType' | 'message'>,
): PcpErrorInvalidTargetPath {
  return makePcpError<PcpErrorInvalidTargetPath>(PcpErrorInvalidTargetPath.prototype, {
    errorType: PcpErrorType.InvalidTargetPath,
    ...args,
    message: `The ${targetKind(args.ownerSpecType)} <${args.targetPath}> from ` +
      `<${args.owningPath}> in layer @${args.layer.filePath}@ is invalid.  This may be ` +
      'because the path is the pre-relocated source path of a relocated prim.  Ignoring.',
  })
}

// PcpErrorTargetPermissionDenied::ToString (errors.cpp:1017-1032).
export function pcpErrorTargetPermissionDenied(
  args: Omit<PcpErrorTargetPermissionDenied, 'errorType' | 'message'>,
): PcpErrorTargetPermissionDenied {
  return makePcpError<PcpErrorTargetPermissionDenied>(
    PcpErrorTargetPermissionDenied.prototype, {
      errorType: PcpErrorType.TargetPermissionDenied,
      ...args,
      message: `The ${targetKind(args.ownerSpecType)} <${args.targetPath}> from ` +
        `<${args.owningPath}> in layer @${args.layer.filePath}@ targets an object that is ` +
        'private on the far side of a reference or inherit.  This ' +
        `${args.ownerSpecType === 'attribute' ? 'connection' : 'target'} will be ignored.`,
    })
}

// PcpErrorInvalidPrimPath::ToString (OpenUSD v26.08 errors.cpp:414-422).
export function pcpErrorInvalidPrimPath(
  args: Omit<PcpErrorInvalidPrimPath, 'errorType' | 'message'>,
): PcpErrorInvalidPrimPath {
  return makePcpError<PcpErrorInvalidPrimPath>(PcpErrorInvalidPrimPath.prototype, {
    errorType: PcpErrorType.InvalidPrimPath,
    ...args,
    message: `Invalid ${ARC_DISPLAY_NAMES[args.arcType]} path <${args.primPath}> ` +
      `introduced by ${formatLayerSite(args.sourceLayer, args.site.path)}` +
      '-- must be an absolute prim path with no variant selections.',
  })
}

// PcpErrorInconsistentPropertyType::ToString (OpenUSD v26.08
// errors.cpp:301-318).
export function pcpErrorInconsistentPropertyType(
  args: Omit<PcpErrorInconsistentPropertyType, 'errorType' | 'message'>,
): PcpErrorInconsistentPropertyType {
  const kind = (specType: string): string =>
    specType === 'attribute' ? 'an attribute' : 'a relationship'
  return makePcpError<PcpErrorInconsistentPropertyType>(
    PcpErrorInconsistentPropertyType.prototype, {
      errorType: PcpErrorType.InconsistentPropertyType,
      ...args,
      message: `The property <${args.rootSite.path}> has inconsistent spec types.  ` +
        `The defining spec is @${args.definingLayerIdentifier}@` +
        `<${args.definingSpecPath}> and is ${kind(args.definingSpecType)} spec.  ` +
        `The conflicting spec is @${args.conflictingLayerIdentifier}@` +
        `<${args.conflictingSpecPath}> and is ${kind(args.conflictingSpecType)} spec.  ` +
        'The conflicting spec will be ignored.',
    })
}

// PcpErrorVariableExpressionError::ToString (errors.cpp:1081).
export function pcpErrorVariableExpression(
  args: Omit<PcpErrorVariableExpressionError, 'errorType' | 'message' | 'toString'>,
): PcpErrorVariableExpressionError {
  const location = args.sourcePath === '/'
    ? `in @${args.sourceLayer.filePath}@`
    : `at ${args.sourcePath} in @${args.sourceLayer.filePath}@`
  return makePcpError<PcpErrorVariableExpressionError>(PcpErrorVariableExpressionError.prototype, {
    errorType: PcpErrorType.VariableExpressionError,
    ...args,
    message: `Error evaluating expression ${args.expression.slice(0, 32)} for ` +
      `${args.context} ${location}: ${args.expressionError}`,
  })
}

// PcpErrorSublayerCycle::ToString (errors.cpp:988).
export function pcpErrorSublayerCycle(
  args: Omit<PcpErrorSublayerCycle, 'errorType' | 'message'>,
): PcpErrorSublayerCycle {
  return makePcpError<PcpErrorSublayerCycle>(PcpErrorSublayerCycle.prototype, {
    errorType: PcpErrorType.SublayerCycle,
    ...args,
    message: `Sublayer hierarchy with root layer @${args.layer.filePath}@ has cycles. ` +
      `Detected when layer @${args.sublayer.filePath}@ was seen in the layer stack ` +
      `for the second time.`,
  })
}

// PcpErrorInvalidSublayerOwnership::ToString (OpenUSD v26.08
// errors.cpp:691-703).
export function pcpErrorInvalidSublayerOwnership(
  args: Omit<PcpErrorInvalidSublayerOwnership, 'errorType' | 'message'>,
): PcpErrorInvalidSublayerOwnership {
  return makePcpError<PcpErrorInvalidSublayerOwnership>(
    PcpErrorInvalidSublayerOwnership.prototype, {
      errorType: PcpErrorType.InvalidSublayerOwnership,
      ...args,
      message: `The following sublayers for layer @${args.layer.filePath}@ have ` +
        `the same owner '${args.owner}': ` +
        args.sublayers.map(layer => `@${layer.filePath}@`).join(', '),
    })
}

// PcpErrorInvalidAuthoredRelocation::ToString (errors.cpp:766).
export function pcpErrorInvalidAuthoredRelocation(
  args: Omit<PcpErrorInvalidAuthoredRelocation, 'errorType' | 'message'>,
): PcpErrorInvalidAuthoredRelocation {
  return makePcpError<PcpErrorInvalidAuthoredRelocation>(PcpErrorInvalidAuthoredRelocation.prototype, {
    errorType: PcpErrorType.InvalidAuthoredRelocation,
    ...args,
    message: `Relocation from <${args.sourcePath}> to <${args.targetPath}> authored at ` +
      `@${args.layer.filePath}@<${args.owningPath}> is invalid and will be ignored: ` +
      args.messages,
  })
}

// The conflictReason strings of PcpErrorInvalidConflictingRelocation::ToString
// (errors.cpp:797).
const CONFLICT_REASON_TEXT: Record<PcpRelocateConflictReason, string> = {
  [PcpRelocateConflictReason.TargetIsConflictSource]:
    'The target of a relocate cannot be the source of another relocate in the same layer stack.',
  [PcpRelocateConflictReason.SourceIsConflictTarget]:
    'The source of a relocate cannot be the target of another relocate in the same layer stack.',
  [PcpRelocateConflictReason.TargetIsConflictSourceDescendant]:
    'The target of a relocate cannot be a descendant of the source of another relocate.',
  [PcpRelocateConflictReason.SourceIsConflictSourceDescendant]:
    'The source of a relocate cannot be a descendant of the source of another relocate.',
}

// PcpErrorInvalidConflictingRelocation::ToString (errors.cpp:797).
export function pcpErrorInvalidConflictingRelocation(
  args: Omit<PcpErrorInvalidConflictingRelocation, 'errorType' | 'message'>,
): PcpErrorInvalidConflictingRelocation {
  return makePcpError<PcpErrorInvalidConflictingRelocation>(PcpErrorInvalidConflictingRelocation.prototype, {
    errorType: PcpErrorType.InvalidConflictingRelocation,
    ...args,
    message: `Relocation from <${args.sourcePath}> to <${args.targetPath}> authored at ` +
      `@${args.layer.filePath}@<${args.owningPath}> conflicts with another relocation ` +
      `from <${args.conflictSourcePath}> to <${args.conflictTargetPath}> authored at ` +
      `@${args.conflictLayer.filePath}@<${args.conflictOwningPath}> and will be ignored: ` +
      CONFLICT_REASON_TEXT[args.conflictReason],
  })
}

// PcpErrorInvalidSameTargetRelocations::ToString (errors.cpp:851).
export function pcpErrorInvalidSameTargetRelocations(
  args: Omit<PcpErrorInvalidSameTargetRelocations, 'errorType' | 'message'>,
): PcpErrorInvalidSameTargetRelocations {
  const sourcesString = args.sources
    .map((s) => `relocation from <${s.sourcePath}> authored at @${s.layer.filePath}@<${s.owningPath}>`)
    .join('; ')
  return makePcpError<PcpErrorInvalidSameTargetRelocations>(PcpErrorInvalidSameTargetRelocations.prototype, {
    errorType: PcpErrorType.InvalidSameTargetRelocations,
    ...args,
    message: `The path <${args.targetPath}> is the target of multiple relocations ` +
      `from different sources. The following relocates to this target are invalid ` +
      `and will be ignored: ${sourcesString}.`,
  })
}

// PcpErrorOpinionAtRelocationSource::ToString (errors.cpp:900).
export function pcpErrorOpinionAtRelocationSource(
  args: Omit<PcpErrorOpinionAtRelocationSource, 'errorType' | 'message'>,
): PcpErrorOpinionAtRelocationSource {
  return makePcpError<PcpErrorOpinionAtRelocationSource>(PcpErrorOpinionAtRelocationSource.prototype, {
    errorType: PcpErrorType.OpinionAtRelocationSource,
    ...args,
    message: `The layer @${args.layer.filePath}@ has an invalid opinion at the ` +
      `relocation source path <${args.path}>, which will be ignored.`,
  })
}

// C++ ostream formatting of a double (six significant digits, %g style).
function formatDouble(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'nan' : value > 0 ? 'inf' : '-inf'
  return String(Number(value.toPrecision(6)))
}

// operator<<(SdfLayerOffset) (sdf/layerOffset.cpp:117-123).
function formatLayerOffset(offset: { readonly offset: number; readonly scale: number }): string {
  return `SdfLayerOffset(${formatDouble(offset.offset)}, ${formatDouble(offset.scale)})`
}

const CAPACITY_DISPLAY_NAMES: Record<PcpErrorCapacityExceeded['errorType'], string> = {
  [PcpErrorType.IndexCapacityExceeded]: 'PcpErrorType_IndexCapacityExceeded',
  [PcpErrorType.ArcCapacityExceeded]: 'PcpErrorType_ArcCapacityExceeded',
  [PcpErrorType.ArcNamespaceDepthCapacityExceeded]:
    'PcpErrorType_ArcNamespaceDepthCapacityExceeded',
}

// PcpErrorCapacityExceeded::ToString (errors.cpp:262-267).
export function pcpErrorCapacityExceeded(
  errorType: PcpErrorCapacityExceeded['errorType'],
  rootSite: PcpSite = { layerStack: { rootLayer: { filePath: '' } }, path: '' },
): PcpErrorCapacityExceeded {
  return makePcpError<PcpErrorCapacityExceeded>(PcpErrorCapacityExceeded.prototype, {
    errorType, rootSite,
    message: `Composition graph capacity exceeded: ${CAPACITY_DISPLAY_NAMES[errorType]}`,
  })
}

// PcpErrorInvalidSublayerPath::ToString (errors.cpp:723-733).
export function pcpErrorInvalidSublayerPath(
  args: Omit<PcpErrorInvalidSublayerPath, 'errorType' | 'message'>,
): PcpErrorInvalidSublayerPath {
  return makePcpError<PcpErrorInvalidSublayerPath>(PcpErrorInvalidSublayerPath.prototype, {
    errorType: PcpErrorType.InvalidSublayerPath,
    ...args,
    message: `Could not load sublayer @${args.sublayerPath}@ of layer ` +
      `@${args.layer?.filePath ?? '<NULL>'}@${args.messages ? ' -- ' : ''}${args.messages}; skipping.`,
  })
}

// PcpErrorInvalidSublayerOffset::ToString (errors.cpp:631-639).
export function pcpErrorInvalidSublayerOffset(
  args: Omit<PcpErrorInvalidSublayerOffset, 'errorType' | 'message'>,
): PcpErrorInvalidSublayerOffset {
  return makePcpError<PcpErrorInvalidSublayerOffset>(PcpErrorInvalidSublayerOffset.prototype, {
    errorType: PcpErrorType.InvalidSublayerOffset,
    ...args,
    message: `Invalid sublayer offset ${formatLayerOffset(args.offset)} in sublayer ` +
      `@${args.sublayer.filePath}@ of layer @${args.layer.filePath}@. Using no offset instead.`,
  })
}

// PcpErrorInvalidSublayerAndOffsetCount::ToString (OpenUSD v26.11.1
// errors.cpp:662-670).
export function pcpErrorInvalidSublayerAndOffsetCount(
  args: Omit<PcpErrorInvalidSublayerAndOffsetCount, 'errorType' | 'message'>,
): PcpErrorInvalidSublayerAndOffsetCount {
  return makePcpError<PcpErrorInvalidSublayerAndOffsetCount>(
    PcpErrorInvalidSublayerAndOffsetCount.prototype, {
      errorType: PcpErrorType.InvalidSublayerAndOffsetCount,
      ...args,
      message: `Layer @${args.layer.filePath}@ has ${args.sublayerCount} sublayers and ` +
        `${args.offsetCount} offsets, but these counts must be equal. Using an identity ` +
        'offset for all sublayers instead.',
    })
}

// PcpErrorInvalidReferenceOffset::ToString (errors.cpp:659-670).
export function pcpErrorInvalidReferenceOffset(
  args: Omit<PcpErrorInvalidReferenceOffset, 'errorType' | 'message'>,
): PcpErrorInvalidReferenceOffset {
  return makePcpError<PcpErrorInvalidReferenceOffset>(PcpErrorInvalidReferenceOffset.prototype, {
    errorType: PcpErrorType.InvalidReferenceOffset,
    ...args,
    message: `Invalid ${ARC_DISPLAY_NAMES[args.arcType]} offset ${formatLayerOffset(args.offset)} ` +
      `for @${args.assetPath}@<${args.targetPath}> introduced by ` +
      `${formatLayerSite(args.sourceLayer, args.sourcePath)}. Using no offset instead.`,
  })
}

// PcpErrorMutedAssetPath::ToString (errors.cpp:485-492).
export function pcpErrorMutedAssetPath(
  args: Omit<PcpErrorMutedAssetPath, 'errorType' | 'message' | 'messages'>,
): PcpErrorMutedAssetPath {
  return makePcpError<PcpErrorMutedAssetPath>(PcpErrorMutedAssetPath.prototype, {
    errorType: PcpErrorType.MutedAssetPath,
    messages: '',
    ...args,
    message: `Asset @${args.resolvedAssetPath}@ was muted for ` +
      `${ARC_DISPLAY_NAMES[args.arcType]} introduced by ` +
      `${formatLayerSite(args.sourceLayer, args.site.path)}.`,
  })
}

// PcpErrorArcPermissionDenied::ToString (errors.cpp:162-206).
export function pcpErrorArcPermissionDenied(
  args: Omit<PcpErrorArcPermissionDenied, 'errorType' | 'message'>,
): PcpErrorArcPermissionDenied {
  const action: Partial<Record<PcpArcType, string>> = {
    [PcpArcType.Inherit]: 'inherit from:\n',
    [PcpArcType.Relocate]: 'be relocated from:\n',
    [PcpArcType.Variant]: 'use variant:\n',
    [PcpArcType.Reference]: 'reference:\n',
    [PcpArcType.Payload]: 'get payload from:\n',
  }
  return makePcpError<PcpErrorArcPermissionDenied>(PcpErrorArcPermissionDenied.prototype, {
    errorType: PcpErrorType.ArcPermissionDenied,
    ...args,
    message: `${formatSite(args.site)}\nCANNOT ${action[args.arcType] ?? 'refer to:\n'}` +
      `${formatSite(args.privateSite)}\nwhich is private.`,
  })
}

// PcpErrorPrimPermissionDenied::ToString (errors.cpp:927-936).
export function pcpErrorPrimPermissionDenied(
  args: Omit<PcpErrorPrimPermissionDenied, 'errorType' | 'message'>,
): PcpErrorPrimPermissionDenied {
  return makePcpError<PcpErrorPrimPermissionDenied>(PcpErrorPrimPermissionDenied.prototype, {
    errorType: PcpErrorType.PrimPermissionDenied,
    ...args,
    message: `${formatSite(args.site)}\nwill be ignored because:\n` +
      `${formatSite(args.privateSite)}\nis private and overrides its opinions.`,
  })
}
