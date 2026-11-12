// Ported from OpenUSD 26.11.1: pxr/usd/usd/notice.cpp, pxr/usd/usd/notice.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdNotice from OpenUSD v26.08 pxr/usd/usd/notice.{h,cpp}: the notices a
// UsdStage sends, as TfNotice subclasses with the stage as sender.

import { Notice as TfNotice } from 'typescript-usd/tf'
import type { ChangeListEntry as SdfChangeListEntry } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Stage } from './stage.ts'

// Anything with a path: UsdObject handles, SdfPaths and path strings.
export type UsdNoticeObject = string | SdfPath | { readonly path: string } | { getPath(): string }

function objectPath(obj: UsdNoticeObject): string {
  if (typeof obj === 'string') return obj
  if (obj instanceof SdfPath) return obj.pathString
  if ('getPath' in obj && typeof obj.getPath === 'function') return obj.getPath()
  return (obj as { readonly path: string }).path
}

/** @internal ObjectsChanged::_PathsToChangesMap: changed path to the change list entries. */
export type UsdPathsToChangesMap = Map<string, SdfChangeListEntry[]>

// SdfPathFindLongestPrefix(map, path) != map.end().
function hasPrefixInMap(changes: UsdPathsToChangesMap, path: string): boolean {
  if (changes.size === 0) return false
  for (let p = SdfPath.fromString(path); !p.isEmpty(); p = p.getParentPath()) {
    if (changes.has(p.pathString)) return true
    if (p.isAbsoluteRootPath()) break
  }
  return false
}

function sortedPaths(changes: UsdPathsToChangesMap): string[] {
  return [...changes.keys()]
    .map(path => SdfPath.fromString(path))
    .sort(SdfPath.compare)
    .map(path => path.pathString)
}

// PathRange::iterator::GetChangedFields.
function changedFields(entries: readonly SdfChangeListEntry[]): string[] {
  const fields: string[] = []
  for (const entry of entries) {
    for (const [field] of entry.infoChanged) fields.push(field)
    // The underlying SdfChangeList sets a bit to indicate time sample
    // changes instead of including the field in its infoChanged list.
    if (entry.flags.didChangeAttributeTimeSamples) fields.push('timeSamples')
  }
  return [...new Set(fields)].sort()
}

function hasChangedFields(entries: readonly SdfChangeListEntry[]): boolean {
  return entries.some(entry =>
    entry.infoChanged.length > 0 || entry.flags.didChangeAttributeTimeSamples)
}

export namespace UsdNotice {
  /** Base class for UsdStage notices. */
  export class StageNotice extends TfNotice {
    constructor(private readonly _stage: Stage) { super() }

    /** Return the stage associated with this notice. */
    getStage(): Stage { return this._stage }
  }

  /** Ultra-conservative notice sent when the given UsdStage's contents have
   * changed in any way. */
  export class StageContentsChanged extends StageNotice {}

  export enum PrimResyncType {
    RenameSource = 'RenameSource',
    RenameDestination = 'RenameDestination',
    ReparentSource = 'ReparentSource',
    ReparentDestination = 'ReparentDestination',
    RenameAndReparentSource = 'RenameAndReparentSource',
    RenameAndReparentDestination = 'RenameAndReparentDestination',
    Delete = 'Delete',
    UnchangedPrimStack = 'UnchangedPrimStack',
    Other = 'Other',
    Invalid = 'Invalid',
  }

  /** @internal ObjectsChanged::_PrimResyncInfo. */
  export interface PrimResyncInfo {
    resyncType: PrimResyncType
    associatePath: string
  }

  /** @internal ObjectsChanged::_NamespaceEditsInfo. */
  export interface NamespaceEditsInfo {
    primResyncsInfo: Map<string, PrimResyncInfo>
    renamedProperties: Array<[path: string, newName: string]>
  }

  const emptyChanges: UsdPathsToChangesMap = new Map()
  const emptyNamespaceEditsInfo: NamespaceEditsInfo = {
    primResyncsInfo: new Map(), renamedProperties: [],
  }

  /** A range of the paths in an ObjectsChanged notice, in path order. */
  export class PathRange implements Iterable<string> {
    private _sorted: string[] | undefined

    /** @internal */
    constructor(private readonly _changes: UsdPathsToChangesMap) {}

    get size(): number { return this._changes.size }
    empty(): boolean { return this._changes.size === 0 }
    has(path: UsdNoticeObject): boolean { return this._changes.has(objectPath(path)) }

    /** The fields that changed at the path in this range. */
    getChangedFields(path: UsdNoticeObject): string[] {
      const entries = this._changes.get(objectPath(path))
      return entries ? changedFields(entries) : []
    }

    hasChangedFields(path: UsdNoticeObject): boolean {
      const entries = this._changes.get(objectPath(path))
      return entries ? hasChangedFields(entries) : false
    }

    toArray(): string[] { return [...(this._sorted ??= sortedPaths(this._changes))] }

    [Symbol.iterator](): Iterator<string> {
      return (this._sorted ??= sortedPaths(this._changes))[Symbol.iterator]()
    }
  }

  /**
   * Notice sent in response to authored changes that affect UsdObjects.
   * Resynced paths are objects whose composed structure may have changed,
   * along with their descendants; changed-info-only paths had only their
   * metadata or values change; resolved-asset-path resynced paths may have
   * asset-path values that resolve differently.
   */
  export class ObjectsChanged extends StageNotice {
    private readonly _resyncChanges: UsdPathsToChangesMap
    private readonly _infoChanges: UsdPathsToChangesMap
    private readonly _assetPathChanges: UsdPathsToChangesMap
    private readonly _namespaceEditsInfo: NamespaceEditsInfo

    /** @internal Constructed by UsdStage. */
    constructor(
      stage: Stage,
      resyncChanges: UsdPathsToChangesMap,
      infoChanges: UsdPathsToChangesMap = emptyChanges,
      assetPathChanges: UsdPathsToChangesMap = emptyChanges,
      namespaceEditsInfo: NamespaceEditsInfo = emptyNamespaceEditsInfo,
    ) {
      super(stage)
      this._resyncChanges = resyncChanges
      this._infoChanges = infoChanges
      this._assetPathChanges = assetPathChanges
      this._namespaceEditsInfo = namespaceEditsInfo
    }

    /** Return true if obj was possibly affected by the changes. */
    affectedObject(obj: UsdNoticeObject): boolean {
      return this.resyncedObject(obj) || this.resolvedAssetPathsResynced(obj) ||
        this.changedInfoOnly(obj)
    }

    /** Return true if obj was resynced by the changes. */
    resyncedObject(obj: UsdNoticeObject): boolean {
      return hasPrefixInMap(this._resyncChanges, objectPath(obj))
    }

    /** Return true if asset path values in obj were resynced. */
    resolvedAssetPathsResynced(obj: UsdNoticeObject): boolean {
      return hasPrefixInMap(this._assetPathChanges, objectPath(obj))
    }

    /** Return true if obj was changed but not resynced. */
    changedInfoOnly(obj: UsdNoticeObject): boolean {
      return this._infoChanges.has(objectPath(obj))
    }

    getResyncedPaths(): PathRange { return new PathRange(this._resyncChanges) }
    getChangedInfoOnlyPaths(): PathRange { return new PathRange(this._infoChanges) }
    getResolvedAssetPathsResyncedPaths(): PathRange {
      return new PathRange(this._assetPathChanges)
    }

    /**
     * Return the set of changed fields in layers that affected the object at
     * path, from the resynced or changed-info-only paths.
     */
    getChangedFields(obj: UsdNoticeObject): string[] {
      const path = objectPath(obj)
      const entries = this._resyncChanges.get(path) ?? this._infoChanges.get(path)
      return entries ? changedFields(entries) : []
    }

    /** Return true if there are any changed fields that affected the object. */
    hasChangedFields(obj: UsdNoticeObject): boolean {
      const path = objectPath(obj)
      const entries = this._resyncChanges.get(path) ?? this._infoChanges.get(path)
      return entries ? hasChangedFields(entries) : false
    }

    /**
     * Returns the type of resync that occurred for the prim at primPath and
     * the associated source or destination path of a namespace edit.
     */
    getPrimResyncType(primPath: UsdNoticeObject): [PrimResyncType, string] {
      const path = SdfPath.fromString(objectPath(primPath))
      // We only classify prim resync types.
      if (!path.isAbsoluteRootOrPrimPath()) return [PrimResyncType.Invalid, '']
      // If the prim was not resynced at all, return an invalid resync type.
      if (!hasPrefixInMap(this._resyncChanges, path.pathString)) {
        return [PrimResyncType.Invalid, '']
      }
      // The absolute root is always Other since it can't be formally
      // namespace edited.
      if (path.isAbsoluteRootPath()) return [PrimResyncType.Other, '']
      // Successful namespace edits done through the UsdNamespaceEditor will
      // have a resync info.
      const resyncInfo = this._namespaceEditsInfo.primResyncsInfo.get(path.pathString)
      if (resyncInfo) return [resyncInfo.resyncType, resyncInfo.associatePath]
      // Otherwise, it's either a remove or an "Other" resync.
      return this.getStage().getPrim(path.pathString)
        ? [PrimResyncType.Other, '']
        : [PrimResyncType.Delete, '']
    }

    /** The properties renamed by a UsdNamespaceEditor, as (old path, new name). */
    getRenamedProperties(): ReadonlyArray<readonly [string, string]> {
      return this._namespaceEditsInfo.renamedProperties
    }
  }

  /** Notice sent when a stage's EditTarget has changed. */
  export class StageEditTargetChanged extends StageNotice {}

  /** Notice sent after a set of layers have been newly muted or unmuted. */
  export class LayerMutingChanged extends StageNotice {
    constructor(
      stage: Stage,
      private readonly _mutedLayers: readonly string[],
      private readonly _unmutedLayers: readonly string[],
    ) { super(stage) }

    /** The identifiers of the layers that were muted. */
    getMutedLayers(): readonly string[] { return this._mutedLayers }

    /** The identifiers of the layers that were unmuted. */
    getUnmutedLayers(): readonly string[] { return this._unmutedLayers }
  }
}
