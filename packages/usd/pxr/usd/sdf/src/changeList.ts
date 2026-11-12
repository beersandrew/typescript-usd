// Ported from OpenUSD 26.11.1: pxr/usd/sdf/changeList.cpp,
//  pxr/usd/sdf/changeList.h, pxr/usd/sdf/changeManager.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfChangeList — a list of scene description modifications to one layer,
// organized by namespace path. Port of OpenUSD v26.08
// pxr/usd/sdf/changeList.{h,cpp}, plus the Sdf_ChangeManager adapters that
// translate field and spec mutations into change list entries
// (pxr/usd/sdf/changeManager.cpp:222-620).
//
// typescript-usd layers report each concrete mutation as an SdfLayerChange record
// (layer.ts); sdfChangeListFromLayerChanges applies the change manager's rules
// to a batch of those records, as upstream does inside one SdfChangeBlock.

import { SdfPath } from './path.ts'

export enum SdfSubLayerChangeType {
  SubLayerAdded,
  SubLayerRemoved,
  SubLayerOffset,
}

// SdfChangeList::Entry::_Flags (changeList.h).
export class SdfChangeListEntryFlags {
  didChangeIdentifier = false
  didChangeResolvedPath = false
  didReplaceContent = false
  didReloadContent = false
  didReorderChildren = false
  didReorderProperties = false
  didRename = false
  didChangePrimVariantSets = false
  didChangePrimInheritPaths = false
  didChangePrimSpecializes = false
  didChangePrimReferences = false
  didChangeAttributeTimeSamples = false
  didChangeAttributeConnection = false
  didChangeRelationshipTargets = false
  didAddTarget = false
  didRemoveTarget = false
  didAddInertPrim = false
  didAddNonInertPrim = false
  didRemoveInertPrim = false
  didRemoveNonInertPrim = false
  didAddPropertyWithOnlyRequiredFields = false
  didAddProperty = false
  didRemovePropertyWithOnlyRequiredFields = false
  didRemoveProperty = false
}

export type SdfChangeListInfoChange = [oldValue: unknown, newValue: unknown]

// SdfChangeList::Entry (changeList.h).
export class SdfChangeListEntry {
  infoChanged: Array<[key: string, change: SdfChangeListInfoChange]> = []
  subLayerChanges: Array<[subLayerPath: string, type: SdfSubLayerChangeType]> = []
  oldPath: SdfPath = SdfPath.emptyPath
  oldIdentifier = ''
  flags = new SdfChangeListEntryFlags()

  findInfoChange(key: string): SdfChangeListInfoChange | undefined {
    for (const [k, change] of this.infoChanged) if (k === key) return change
    return undefined
  }

  hasInfoChange(key: string): boolean {
    return this.findInfoChange(key) !== undefined
  }
}

const ACCEL_THRESHOLD = 64

export class SdfChangeList {
  private _entries: Array<[SdfPath, SdfChangeListEntry]> = []
  // Index of the LAST entry for each path, once the list is large.
  private _accel: Map<string, number> | null = null

  getEntryList(): ReadonlyArray<readonly [SdfPath, SdfChangeListEntry]> { return this._entries }

  [Symbol.iterator](): IterableIterator<[SdfPath, SdfChangeListEntry]> {
    return this._entries[Symbol.iterator]()
  }

  isEmpty(): boolean { return this._entries.length === 0 }

  // GetEntry: the entry for path, or an empty default entry.
  getEntry(path: SdfPath): SdfChangeListEntry {
    const i = this._findIndex(path)
    return i >= 0 ? this._entries[i]![1] : new SdfChangeListEntry()
  }

  // FindEntry: the last entry for path.
  findEntry(path: SdfPath): SdfChangeListEntry | undefined {
    const i = this._findIndex(path)
    return i >= 0 ? this._entries[i]![1] : undefined
  }

  private _findIndex(path: SdfPath): number {
    const n = this._entries.length
    if (n === 0) return -1
    const key = path.pathString
    if (this._entries[n - 1]![0].pathString === key) return n - 1
    if (this._accel) return this._accel.get(key) ?? -1
    for (let i = n - 1; i >= 0; i--) {
      if (this._entries[i]![0].pathString === key) return i
    }
    return -1
  }

  private _getEntry(path: SdfPath): SdfChangeListEntry {
    const i = this._findIndex(path)
    return i >= 0 ? this._entries[i]![1] : this._addNewEntry(path)
  }

  private _addNewEntry(path: SdfPath): SdfChangeListEntry {
    const entry = new SdfChangeListEntry()
    this._entries.push([path, entry])
    if (this._accel) this._accel.set(path.pathString, this._entries.length - 1)
    else if (this._entries.length >= ACCEL_THRESHOLD) this._rebuildAccel()
    return entry
  }

  private _rebuildAccel(): void {
    if (this._entries.length >= ACCEL_THRESHOLD) {
      this._accel = new Map()
      this._entries.forEach(([path], i) => this._accel!.set(path.pathString, i))
    } else {
      this._accel = null
    }
  }

  // _MoveEntry (changeList.cpp): transfer oldPath's accumulated changes to
  // newPath, marking it renamed.
  private _moveEntry(oldPath: SdfPath, newPath: SdfPath): SdfChangeListEntry {
    if (oldPath.pathString === newPath.pathString) return this._getEntry(newPath)
    let tmp = new SdfChangeListEntry()
    const i = this._findIndex(oldPath)
    if (i >= 0) {
      tmp = this._entries[i]![1]
      this._entries[i]![1] = new SdfChangeListEntry()
      const flags = tmp.flags
      // Retain an add entry at the old path so its creation stays recorded,
      // unless the entry already came from a move.
      if (!(flags.didAddInertPrim || flags.didAddNonInertPrim ||
            flags.didAddProperty || flags.didAddPropertyWithOnlyRequiredFields) ||
          !tmp.oldPath.isEmpty()) {
        this._entries.splice(i, 1)
        this._rebuildAccel()
      }
    }
    const newEntry = this._getEntry(newPath)
    Object.assign(newEntry, tmp)
    newEntry.flags.didRename = true
    if (newEntry.oldPath.isEmpty()) newEntry.oldPath = oldPath
    return newEntry
  }

  didReplaceLayerContent(): void {
    this._getEntry(SdfPath.absoluteRootPath).flags.didReplaceContent = true
  }

  didReloadLayerContent(): void {
    this._getEntry(SdfPath.absoluteRootPath).flags.didReloadContent = true
  }

  didChangeLayerIdentifier(oldIdentifier: string): void {
    const entry = this._getEntry(SdfPath.absoluteRootPath)
    if (!entry.flags.didChangeIdentifier) {
      entry.flags.didChangeIdentifier = true
      entry.oldIdentifier = oldIdentifier
    }
  }

  didChangeLayerResolvedPath(): void {
    this._getEntry(SdfPath.absoluteRootPath).flags.didChangeResolvedPath = true
  }

  didChangeSublayerPaths(subLayerPath: string, changeType: SdfSubLayerChangeType): void {
    this._getEntry(SdfPath.absoluteRootPath).subLayerChanges.push([subLayerPath, changeType])
  }

  didChangeInfo(path: SdfPath, key: string, oldValue: unknown, newValue: unknown): void {
    const entry = this._getEntry(path)
    const existing = entry.findInfoChange(key)
    if (existing) existing[1] = newValue
    else entry.infoChanged.push([key, [oldValue, newValue]])
  }

  didChangePrimName(oldPath: SdfPath, newPath: SdfPath): void {
    const newEntry = this._getEntry(newPath)
    if (newEntry.flags.didRemoveInertPrim || newEntry.flags.didRemoveNonInertPrim) {
      this._addNewEntry(newPath)
    }
    this._moveEntry(oldPath, newPath)
  }

  didChangePrimVariantSets(primPath: SdfPath): void {
    this._getEntry(primPath).flags.didChangePrimVariantSets = true
  }

  didChangePrimInheritPaths(primPath: SdfPath): void {
    this._getEntry(primPath).flags.didChangePrimInheritPaths = true
  }

  didChangePrimSpecializes(primPath: SdfPath): void {
    this._getEntry(primPath).flags.didChangePrimSpecializes = true
  }

  didChangePrimReferences(primPath: SdfPath): void {
    this._getEntry(primPath).flags.didChangePrimReferences = true
  }

  didReorderPrims(parentPath: SdfPath): void {
    this._getEntry(parentPath).flags.didReorderChildren = true
  }

  didAddPrim(path: SdfPath, inert: boolean): void {
    let entry = this._getEntry(path)
    // Keep a separate record of an earlier removal.
    if (entry.flags.didRemoveInertPrim || entry.flags.didRemoveNonInertPrim) {
      entry = this._addNewEntry(path)
    }
    if (inert) entry.flags.didAddInertPrim = true
    else entry.flags.didAddNonInertPrim = true
  }

  didRemovePrim(path: SdfPath, inert: boolean): void {
    let entry = this._getEntry(path)
    // Keep a separate record of an earlier addition.
    if (entry.flags.didAddInertPrim || entry.flags.didAddNonInertPrim) {
      entry = this._addNewEntry(path)
    }
    if (inert) entry.flags.didRemoveInertPrim = true
    else entry.flags.didRemoveNonInertPrim = true
  }

  didMovePrim(oldPath: SdfPath, newPath: SdfPath): void {
    this.didRemovePrim(oldPath, false)
    this.didAddPrim(newPath, false)
    this._getEntry(newPath).oldPath = oldPath
  }

  didChangePropertyName(oldPath: SdfPath, newPath: SdfPath): void {
    const newEntry = this._getEntry(newPath)
    if (newEntry.flags.didRemovePropertyWithOnlyRequiredFields ||
        newEntry.flags.didRemoveProperty) {
      this._addNewEntry(newPath)
    }
    this._moveEntry(oldPath, newPath)
  }

  didReorderProperties(parentPath: SdfPath): void {
    this._getEntry(parentPath).flags.didReorderProperties = true
  }

  didAddProperty(path: SdfPath, hasOnlyRequiredFields: boolean): void {
    let entry = this._getEntry(path)
    if (entry.flags.didRemovePropertyWithOnlyRequiredFields || entry.flags.didRemoveProperty) {
      entry = this._addNewEntry(path)
    }
    if (hasOnlyRequiredFields) entry.flags.didAddPropertyWithOnlyRequiredFields = true
    else entry.flags.didAddProperty = true
  }

  didRemoveProperty(path: SdfPath, hasOnlyRequiredFields: boolean): void {
    let entry = this._getEntry(path)
    if (entry.flags.didAddPropertyWithOnlyRequiredFields || entry.flags.didAddProperty) {
      entry = this._addNewEntry(path)
    }
    if (hasOnlyRequiredFields) entry.flags.didRemovePropertyWithOnlyRequiredFields = true
    else entry.flags.didRemoveProperty = true
  }

  didChangeAttributeTimeSamples(attrPath: SdfPath): void {
    this._getEntry(attrPath).flags.didChangeAttributeTimeSamples = true
  }

  didChangeAttributeConnection(attrPath: SdfPath): void {
    this._getEntry(attrPath).flags.didChangeAttributeConnection = true
  }

  didChangeRelationshipTargets(relPath: SdfPath): void {
    this._getEntry(relPath).flags.didChangeRelationshipTargets = true
  }

  didAddTarget(targetPath: SdfPath): void {
    this._getEntry(targetPath).flags.didAddTarget = true
  }

  didRemoveTarget(targetPath: SdfPath): void {
    this._getEntry(targetPath).flags.didRemoveTarget = true
  }

  toString(): string {
    let s = ''
    for (const [path, entry] of this._entries) {
      s += `  <${path.pathString}>\n`
      for (const [key, [oldValue, newValue]] of entry.infoChanged) {
        s += `   infoKey: ${key}\n     oldValue: ${String(oldValue)}\n` +
          `     newValue: ${String(newValue)}\n`
      }
      for (const [subLayer, type] of entry.subLayerChanges) {
        s += `    sublayer ${subLayer} ${SdfSubLayerChangeType[type]}\n`
      }
      if (!entry.oldPath.isEmpty()) s += `   oldPath: <${entry.oldPath.pathString}>\n`
      for (const [flag, set] of Object.entries(entry.flags)) if (set) s += `   ${flag}\n`
    }
    return s
  }
}

export type SdfLayerChangeListVec<L = unknown> = Array<[layer: L, changeList: SdfChangeList]>

// ---- Sdf_ChangeManager adapters ---------------------------------------------

// The layer surface the change manager reads while classifying a field change.
export interface SdfChangeListLayer {
  getField(path: string, fieldName: string): unknown
  hasField?(path: string, fieldName: string): boolean
}

// The record shape layers report (layer.ts SdfLayerChange).
export interface SdfChangeRecord {
  readonly kind:
    | 'field' | 'timeSample' | 'specAdded' | 'specRemoved' | 'specMoved' | 'reloadContent'
    | 'replaceContent' | 'resolvedPathChange'
  readonly path: string
  readonly fieldName?: string | undefined
  readonly oldValue?: unknown
  readonly newValue?: unknown
  readonly inert?: boolean | undefined
  // A moved spec's old path, and for a moved target spec, the spec type of
  // its owning property.
  readonly oldPath?: string | undefined
  readonly ownerSpecType?: string | undefined
}

function isOrderChangeOnly(oldVal: unknown, newVal: unknown): boolean {
  if (!Array.isArray(oldVal) || !Array.isArray(newVal)) return false
  if (oldVal.length !== newVal.length) return false
  const oldSet = new Set(oldVal)
  return newVal.every(name => oldSet.has(name)) && oldSet.size === new Set(newVal).size
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function layerOffsetsEqual(a: unknown, b: unknown): boolean {
  const ao = a as { offset?: number; scale?: number } | undefined
  const bo = b as { offset?: number; scale?: number } | undefined
  return (ao?.offset ?? 0) === (bo?.offset ?? 0) && (ao?.scale ?? 1) === (bo?.scale ?? 1)
}

// Sdf_ChangeManager::DidChangeField (changeManager.cpp:278-493).
export function sdfChangeListDidChangeField(
  list: SdfChangeList, layer: SdfChangeListLayer,
  path: SdfPath, field: string, oldVal: unknown, newVal: unknown,
): void {
  let sendInfoChange = false
  switch (field) {
    case 'default':
      sendInfoChange = true
      break
    case 'primOrder':
      list.didReorderPrims(path)
      sendInfoChange = true
      break
    case 'primChildren':
      // Only a pure reorder is reported; added and removed children report
      // their own spec additions and removals.
      if (isOrderChangeOnly(oldVal, newVal)) list.didReorderPrims(path)
      break
    case 'propertyOrder':
      list.didReorderProperties(path)
      break
    case 'properties':
      if (isOrderChangeOnly(oldVal, newVal)) list.didReorderProperties(path)
      break
    case 'variantSetNames':
    case 'variantSetChildren':
      list.didChangePrimVariantSets(path)
      sendInfoChange = true
      break
    case 'inheritPaths':
      list.didChangePrimInheritPaths(path)
      sendInfoChange = true
      break
    case 'specializes':
      list.didChangePrimSpecializes(path)
      sendInfoChange = true
      break
    case 'references':
      list.didChangePrimReferences(path)
      sendInfoChange = true
      break
    case 'timeSamples':
      list.didChangeAttributeTimeSamples(path)
      sendInfoChange = true
      break
    case 'connectionPaths':
      list.didChangeAttributeConnection(path)
      sendInfoChange = true
      break
    case 'targetPaths':
      list.didChangeRelationshipTargets(path)
      sendInfoChange = true
      break
    case 'subLayers': {
      const oldSet = new Set(stringArray(oldVal))
      const newSet = new Set(stringArray(newVal))
      const sorted = (set: Set<string>): string[] => [...set].sort()
      let removed = sorted(oldSet).filter(p => !newSet.has(p))
      let added = sorted(newSet).filter(p => !oldSet.has(p))
      // A pure reorder is described as removing and re-adding every layer.
      if (added.length === 0 && removed.length === 0) {
        removed = sorted(oldSet)
        added = sorted(newSet)
      }
      for (const p of added) list.didChangeSublayerPaths(p, SdfSubLayerChangeType.SubLayerAdded)
      for (const p of removed) list.didChangeSublayerPaths(p, SdfSubLayerChangeType.SubLayerRemoved)
      sendInfoChange = true
      break
    }
    case 'subLayerOffsets': {
      // SdfLayer keeps an offset per sublayer, identity unless authored.
      const subLayerCount = stringArray(layer.getField('/', 'subLayers')).length
      const identities = (): unknown[] => Array.from({ length: subLayerCount }, () => undefined)
      const oldOffsets = Array.isArray(oldVal) ? oldVal : identities()
      const newOffsets = Array.isArray(newVal) ? newVal : identities()
      // A count change means sublayers were added or removed, which the
      // subLayers change already reported.
      if (oldOffsets.length === newOffsets.length) {
        const subLayers = stringArray(layer.getField('/', 'subLayers'))
        if (newOffsets.length === subLayers.length) {
          for (let i = 0; i < newOffsets.length; i++) {
            if (!layerOffsetsEqual(oldOffsets[i], newOffsets[i])) {
              list.didChangeSublayerPaths(subLayers[i]!, SdfSubLayerChangeType.SubLayerOffset)
            }
          }
        }
      }
      sendInfoChange = true
      break
    }
    case 'typeName':
      if (path.pathString.endsWith('.expression') || path.pathString.includes('.mapper[')) {
        list.didChangeAttributeConnection(path.getParentPath())
      } else {
        sendInfoChange = true
      }
      break
    case 'timeCodesPerSecond': {
      // An unauthored TCPS falls back to FPS (SdfLayer::GetTimeCodesPerSecond).
      const fps = layer.getField('/', 'framesPerSecond')
      list.didChangeInfo(path, 'timeCodesPerSecond',
        oldVal !== undefined ? oldVal : fps, newVal !== undefined ? newVal : fps)
      break
    }
    case 'framesPerSecond': {
      list.didChangeInfo(path, 'framesPerSecond', oldVal, newVal)
      const hasTcps = layer.hasField
        ? layer.hasField('/', 'timeCodesPerSecond')
        : layer.getField('/', 'timeCodesPerSecond') !== undefined
      if (!hasTcps) list.didChangeInfo(path, 'timeCodesPerSecond', oldVal, newVal)
      break
    }
    case 'connectionChildren':
    case 'expressionChildren':
    case 'targetChildren':
    case 'variantChildren':
      // Internal children fields: the child spec creation/deletion is
      // reported instead.
      break
    default:
      sendInfoChange = true
      break
  }
  if (sendInfoChange) list.didChangeInfo(path, field, oldVal, newVal)
}

// Sdf_ChangeManager::DidAddSpec / DidRemoveSpec (changeManager.cpp:559-620).
export function sdfChangeListDidAddOrRemoveSpec(
  list: SdfChangeList, path: SdfPath, inert: boolean, added: boolean,
): void {
  if (path.isPrimPath() || path.isPrimVariantSelectionPath()) {
    if (added) list.didAddPrim(path, inert)
    else list.didRemovePrim(path, inert)
  } else if (path.isPropertyPath()) {
    if (added) list.didAddProperty(path, inert)
    else list.didRemoveProperty(path, inert)
  } else if (path.isTargetPath()) {
    if (added) list.didAddTarget(path)
    else list.didRemoveTarget(path)
  } else if (path.pathString.endsWith('.expression')) {
    list.didChangeAttributeConnection(path.getParentPath())
  }
}

// Sdf_ChangeManager::DidMoveSpec (changeManager.cpp:502-560).
export function sdfChangeListDidMoveSpec(
  list: SdfChangeList, oldPath: SdfPath, newPath: SdfPath, ownerSpecType?: string,
): void {
  if (oldPath.getParentPath().equals(newPath.getParentPath())) {
    // Rename.
    if (oldPath.isPrimPath()) list.didChangePrimName(oldPath, newPath)
    else if (oldPath.isPropertyPath()) list.didChangePropertyName(oldPath, newPath)
    else if (oldPath.isTargetPath()) {
      const parentPropPath = oldPath.getParentPath()
      if (ownerSpecType === 'attribute') list.didChangeAttributeConnection(parentPropPath)
      else if (ownerSpecType === 'relationship') list.didChangeRelationshipTargets(parentPropPath)
    }
  } else {
    // Reparent.
    if (oldPath.isPrimPath()) list.didMovePrim(oldPath, newPath)
    else if (oldPath.isPropertyPath()) {
      list.didRemoveProperty(oldPath, false)
      list.didAddProperty(newPath, false)
    } else if (oldPath.isTargetPath()) {
      if (ownerSpecType === 'attribute') {
        list.didChangeAttributeConnection(oldPath.getParentPath())
        list.didChangeAttributeConnection(newPath.getParentPath())
      } else if (ownerSpecType === 'relationship') {
        list.didChangeRelationshipTargets(oldPath.getParentPath())
        list.didChangeRelationshipTargets(newPath.getParentPath())
      }
    }
  }
}

/**
 * Build the SdfChangeList for a batch of one layer's mutation records, as
 * Sdf_ChangeManager does for the mutations inside one SdfChangeBlock.
 */
export function sdfChangeListFromLayerChanges(
  layer: SdfChangeListLayer, records: Iterable<SdfChangeRecord>, list = new SdfChangeList(),
): SdfChangeList {
  // Records of one spec repeat its path string (a spec's creation and each of
  // its field writes): parse each string once, so the list's entries for a
  // path share one SdfPath, as upstream's records share an SdfPath handle.
  const paths = new Map<string, SdfPath>()
  let lastPathString: string | undefined
  let path = SdfPath.emptyPath
  for (const record of records) {
    if (record.path !== lastPathString) {
      lastPathString = record.path
      const known = paths.get(record.path)
      if (known !== undefined) path = known
      else paths.set(record.path, path = SdfPath.fromString(record.path))
    }
    if (path.isEmpty()) continue
    switch (record.kind) {
      case 'field':
        sdfChangeListDidChangeField(
          list, layer, path, record.fieldName!, record.oldValue, record.newValue)
        break
      case 'timeSample':
        list.didChangeAttributeTimeSamples(path)
        break
      case 'specAdded':
      case 'specRemoved':
        sdfChangeListDidAddOrRemoveSpec(
          list, path, record.inert ?? false, record.kind === 'specAdded')
        break
      case 'specMoved':
        sdfChangeListDidMoveSpec(list, SdfPath.fromString(record.oldPath!), path, record.ownerSpecType)
        break
      case 'reloadContent':
        list.didReloadLayerContent()
        break
      case 'replaceContent':
        list.didReplaceLayerContent()
        break
      case 'resolvedPathChange':
        list.didChangeLayerResolvedPath()
        break
    }
  }
  return list
}
